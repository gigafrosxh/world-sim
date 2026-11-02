// Prozedurale Stadt um ein echtes Stadtzentrum. Rein deterministisch (gleiche Stadt → gleiche Stadt).
import { hashString, rng } from './rng';
import { distanceKm, type Location } from './geo';
import { CASINOS, CHAINS, type ShopKind } from '../data/places';
import type { Visual, Zone } from '../data/buildings';
import { economyFor } from '../data/countries';

export interface Plot {
  idx: number;
  id: string;
  zone: Zone | 'park';
  x: number; z: number; // Mittelpunkt in Metern
  w: number; d: number; // Breite (x) und Tiefe (z)
  npc: Visual | null; // bestehendes Gebäude
  floors: number;
  forSale: boolean;
  forRent: boolean;
  shop?: { kind: ShopKind; name: string };
  casino?: string;
  hue: number; // Farbvariante 0..1
  facing: number; // 0..3 → Straßenseite
}

export interface Road { x1: number; z1: number; x2: number; z2: number; w: number; kind: 'street' | 'highway' }

export interface CityLayout {
  id: string;
  n: number;
  half: number; // halbe Kantenlänge der Stadt in m
  plots: Plot[];
  roads: Road[];
  rail: { z: number; x1: number; x2: number };
  highwayZ: number;
  landPrice: Record<Zone, number>; // pro m²
  factor: number;
}

export const BLOCK = 110;
export const STREET = 14;
export const PITCH = BLOCK + STREET;

export function cityPriceFactor(pop: number) {
  return Math.min(2, Math.max(0.5, 0.7 + 0.45 * Math.log10(Math.max(20000, pop) / 100000)));
}

const cache = new Map<string, CityLayout>();

export function generateCity(loc: Location, gdp?: number, cpop?: number): CityLayout {
  const hit = cache.get(loc.id);
  if (hit) return hit;
  const r = rng(hashString(loc.id));
  const n = Math.min(11, Math.max(4, Math.round(4 + Math.log2(Math.max(1, loc.pop / 50000)) * 1.3)));
  const c = (n - 1) / 2;
  const half = (n * PITCH) / 2;
  const econ = economyFor(loc.a3, gdp, cpop);
  const factor = cityPriceFactor(loc.pop);
  const landPrice: Record<Zone, number> = {
    industrial: Math.round(econ.landIndustrial * factor),
    residential: Math.round(econ.landResidential * factor),
    commercial: Math.round(econ.landResidential * factor * 1.6),
  };
  const indCols = Math.max(1, Math.round(n / 4));
  const comR = n >= 7 ? 1 : 0;
  const plots: Plot[] = [];
  const add = (p: Omit<Plot, 'idx' | 'id'>) => {
    const idx = plots.length;
    plots.push({ ...p, idx, id: `${loc.id}#${idx}` });
  };

  for (let i = 0; i < n; i++) {
    for (let j = 0; j < n; j++) {
      const bx = (i - c) * PITCH;
      const bz = (j - c) * PITCH;
      const ring = Math.max(Math.abs(i - c), Math.abs(j - c));
      let zone: Zone | 'park';
      if (ring <= comR + 0.5) zone = 'commercial';
      else if (i >= n - indCols) zone = 'industrial';
      else zone = r.chance(0.07) ? 'park' : 'residential';

      const sub = (cols: number, rows: number, fill: (px: number, pz: number, w: number, d: number, col: number, row: number) => void) => {
        const gap = 4;
        const w = (BLOCK - gap * (cols - 1)) / cols;
        const d = (BLOCK - gap * (rows - 1)) / rows;
        for (let a = 0; a < cols; a++)
          for (let b = 0; b < rows; b++)
            fill(bx - BLOCK / 2 + w / 2 + a * (w + gap), bz - BLOCK / 2 + d / 2 + b * (d + gap), w, d, a, b);
      };
      const facingOf = (col: number, row: number, cols: number, rows: number) =>
        rows > 1 ? (row === 0 ? 0 : 2) : cols > 1 ? (col === 0 ? 3 : 1) : 0;

      if (zone === 'park') {
        add({ zone, x: bx, z: bz, w: BLOCK, d: BLOCK, npc: null, floors: 0, forSale: false, forRent: false, hue: r.next(), facing: 0 });
      } else if (zone === 'commercial') {
        sub(2, 2, (x, z, w, d, a, b) => {
          const tower = ring < 0.6 || r.chance(0.35);
          add({ zone, x, z, w, d, npc: tower ? 'tower' : 'office', floors: tower ? r.int(10, 30) : r.int(4, 8), forSale: false, forRent: false, hue: r.next(), facing: facingOf(a, b, 2, 2) });
        });
      } else if (zone === 'industrial') {
        const variant = r.int(0, 2);
        const [cols, rows] = variant === 0 ? [2, 2] : variant === 1 ? [2, 4] : [1, 2];
        sub(cols, rows, (x, z, w, d, a, b) => {
          const occupied = r.chance(0.6);
          const npc: Visual | null = occupied ? r.pick<Visual>(['factory', 'warehouse', 'workshop', 'warehouse']) : null;
          add({ zone, x, z, w, d, npc, floors: 1, forSale: !occupied, forRent: occupied && r.chance(0.2), hue: r.next(), facing: facingOf(a, b, cols, rows) });
        });
      } else {
        const inner = ring <= n / 3;
        if (inner) {
          sub(2, 2, (x, z, w, d, a, b) =>
            add({ zone, x, z, w, d, npc: 'apartment', floors: r.int(3, 7), forSale: false, forRent: false, hue: r.next(), facing: facingOf(a, b, 2, 2) }));
        } else {
          sub(4, 2, (x, z, w, d, a, b) => {
            const occupied = r.chance(0.8);
            add({ zone, x, z, w, d, npc: occupied ? 'house' : null, floors: r.int(1, 2), forSale: !occupied || r.chance(0.1), forRent: false, hue: r.next(), facing: facingOf(a, b, 4, 2) });
          });
        }
      }
    }
  }

  // Geschäfte echter Ketten
  const chains = CHAINS[loc.a3] ?? CHAINS['*'];
  const kinds: ShopKind[] = ['supermarkt', 'baumarkt', 'elektronik', 'moebel', 'auto', 'stahl', 'bank', 'supermarkt'];
  const shopCandidates = plots.filter((p) => p.zone === 'commercial' && p.npc !== 'tower');
  const resCandidates = plots.filter((p) => p.zone === 'residential' && p.npc === 'apartment');
  const indCandidates = plots.filter((p) => p.zone === 'industrial' && p.npc && !p.forRent);
  kinds.forEach((kind, k) => {
    const names = chains[kind] ?? CHAINS['*'][kind] ?? ['Geschäft'];
    const pool = kind === 'baumarkt' || kind === 'moebel' || kind === 'stahl' ? indCandidates : k % 2 ? shopCandidates : resCandidates;
    const p = pool.find((q) => !q.shop && !q.casino) ?? plots.find((q) => q.npc && !q.shop && !q.casino && q.zone !== 'park' && !q.forSale && !q.forRent);
    if (!p) return;
    p.npc = 'shop';
    p.floors = 1;
    p.shop = { kind, name: names[k % names.length] };
  });

  // Echte Casinos in der Nähe
  const near = CASINOS.filter((cs) => distanceKm(cs, loc) < 25);
  for (const cs of near) {
    const p = plots.find((q) => q.zone === 'commercial' && !q.shop && !q.casino);
    if (!p) break;
    p.npc = 'casino';
    p.floors = 2;
    p.casino = cs.name;
  }

  // Straßen: Raster + Autobahn im Süden + Bahn im Norden
  const roads: Road[] = [];
  for (let k = 0; k <= n; k++) {
    const o = (k - n / 2) * PITCH;
    roads.push({ x1: o, z1: -half, x2: o, z2: half, w: STREET, kind: 'street' });
    roads.push({ x1: -half, z1: o, x2: half, z2: o, w: STREET, kind: 'street' });
  }
  const highwayZ = half + 60;
  roads.push({ x1: -half - 400, z1: highwayZ, x2: half + 400, z2: highwayZ, w: 26, kind: 'highway' });
  roads.push({ x1: half - PITCH * indCols, z1: half, x2: half - PITCH * indCols, z2: highwayZ, w: STREET, kind: 'street' });

  const layout: CityLayout = { id: loc.id, n, half, plots, roads, rail: { z: -half - 40, x1: -half - 400, x2: half + 400 }, highwayZ, landPrice, factor };
  cache.set(loc.id, layout);
  return layout;
}
