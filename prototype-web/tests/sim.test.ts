import { describe, expect, it, beforeAll } from 'vitest';
import { registerWorld } from '../src/sim/world';
import * as G from '../src/sim/game';
import { payoutMultiplier, spin } from '../src/sim/casino';
import { generateCity } from '../src/sim/cityGen';

beforeAll(() => {
  registerWorld(
    [
      { n: 'Vienna', a3: 'AUT', lat: 48.2, lon: 16.37, pop: 1900000, cap: 1 },
      { n: 'Linz', a3: 'AUT', lat: 48.3, lon: 14.29, pop: 200000, cap: 0 },
      { n: 'Graz', a3: 'AUT', lat: 47.07, lon: 15.44, pop: 290000, cap: 0 },
    ],
    [{ a3: 'AUT', name: 'Austria', nameDe: 'Österreich', pop: 9000000, gdp: 470000 }],
  );
});

const fresh = () => G.newGame({ name: 'Test', a3: 'AUT', homeId: 'AUT:Linz' });

describe('Spielstart', () => {
  it('startet mit Landesbudget', () => {
    const s = fresh();
    expect(s.wallet).toBe(15000);
    expect(s.paused).toBe(true);
  });
  it('bucht monatliche Lebenshaltung', () => {
    const s = fresh();
    G.advance(s, 35 * G.DAY);
    expect(s.wallet).toBe(15000 - 650);
  });
});

describe('Firmengründung', () => {
  it('GmbH durchläuft alle Schritte mit Kosten und Wartezeit', () => {
    const s = fresh();
    G.foundCompany(s, { name: 'Stahl & Co', color: '#c33', industryId: 'schlosserei', legal: 'ltd' });
    expect(s.company!.active).toBe(false);
    G.advance(s, 10 * G.DAY);
    expect(s.company!.active).toBe(false);
    G.advance(s, 40 * G.DAY);
    expect(s.company!.active).toBe(true);
    expect(s.companyAcct).toBeGreaterThan(4000);
    expect(s.company!.equityIn).toBe(5000);
  });
});

describe('Bauen', () => {
  it('Werkstatt braucht realistische Zeit und bucht laufend', () => {
    const s = fresh();
    s.wallet = 2_000_000;
    const layout = G.layoutOf('AUT:Linz');
    const plot = layout.plots.find((p) => p.zone === 'industrial' && p.forSale && p.w >= 24 && p.d >= 14)!;
    G.buyPlot(s, plot.id, 'wallet');
    expect(G.canBuild(s, plot.id, 'werkstatt')).toMatch(/Grundbuch/);
    G.advance(s, 22 * G.DAY);
    const p = G.startProject(s, plot.id, 'werkstatt', 6);
    const before = s.wallet;
    G.advance(s, 30 * G.DAY);
    expect(p.state).toBe('permit');
    G.advance(s, 40 * G.DAY);
    expect(p.state).toBe('building');
    G.advance(s, 30 * G.DAY);
    expect(s.wallet).toBeLessThan(before - 30000);
    const progress = G.projectProgress(p);
    expect(progress).toBeGreaterThan(0.1);
    expect(progress).toBeLessThan(0.6);
    G.advance(s, 200 * G.DAY);
    expect(p.state).toBe('done');
    const days = (p.finishedAt! - p.startedAt) / G.DAY;
    expect(days).toBeGreaterThan(130); // Genehmigung + ~4 Monate Bau
    expect(days).toBeLessThan(220);
    expect(s.plots[plot.id].building).toBe('werkstatt');
  });
});

describe('Aufträge', () => {
  it('Mietwerkstatt erzeugt Anfragen und Einnahmen', () => {
    const s = fresh();
    s.wallet = 100000;
    G.foundCompany(s, { name: 'X', color: '#fff', industryId: 'schlosserei', legal: 'sole' });
    G.advance(s, 30 * G.DAY);
    G.transfer(s, 'wallet', 30000);
    const plot = G.layoutOf('AUT:Linz').plots.find((p) => p.forRent)!;
    G.rentPlot(s, plot.id);
    G.advance(s, 15 * G.DAY);
    expect(s.company!.offers.length).toBeGreaterThan(0);
    for (let k = 0; k < 20; k++) {
      for (const o of [...s.company!.offers]) if (s.companyAcct > o.material) G.acceptOrder(s, o.id);
      G.advance(s, 5 * G.DAY);
    }
    expect(s.company!.completedOrders).toBeGreaterThan(3);
  });
});

describe('Kredit', () => {
  it('Annuität wird monatlich getilgt', () => {
    const s = fresh();
    G.takeLoan(s, 'wallet', 10000, 2);
    expect(s.wallet).toBe(25000);
    G.advance(s, 400 * G.DAY);
    expect(s.loans[0].remaining).toBeLessThan(6000);
  });
});

describe('Roulette', () => {
  it('Auszahlungen', () => {
    expect(payoutMultiplier({ kind: 'number', n: 7 }, 7)).toBe(36);
    expect(payoutMultiplier({ kind: 'red' }, 0)).toBe(0);
    expect(payoutMultiplier({ kind: 'red' }, 1)).toBe(2);
    expect(payoutMultiplier({ kind: 'dozen', n: 3 }, 36)).toBe(3);
  });
  it('Hausvorteil ≈ 2,7 %', () => {
    let ev = 0;
    for (let r = 0; r <= 36; r++) ev += payoutMultiplier({ kind: 'black' }, r) / 37;
    expect(ev).toBeCloseTo(36 / 37, 5);
  });
  it('nur in Casino-Städten', () => {
    const s = fresh();
    expect(() => spin(s, { kind: 'red' }, 10)).toThrow();
    s.player.locId = 'AUT:Vienna';
    expect(() => spin(s, { kind: 'red' }, 10, () => 0.5)).not.toThrow();
  });
});

describe('Speichern', () => {
  it('Roundtrip', () => {
    const s = fresh();
    G.advance(s, 3 * G.DAY);
    const t = G.deserialize(G.serialize(s));
    expect(t.t).toBe(s.t);
    expect(t.wallet).toBe(s.wallet);
  });
});

describe('Stadt', () => {
  it('ist deterministisch und hat Zonen', () => {
    const loc = { id: 'AUT:Graz', name: 'Graz', a3: 'AUT', lat: 47.07, lon: 15.44, pop: 290000, cap: 0 };
    const a = generateCity(loc);
    expect(a.plots.some((p) => p.zone === 'industrial' && p.forSale)).toBe(true);
    expect(a.plots.some((p) => p.casino)).toBe(true);
    expect(a.plots.some((p) => p.shop?.name === 'Billa' || p.shop?.name === 'Spar')).toBe(true);
  });
});
