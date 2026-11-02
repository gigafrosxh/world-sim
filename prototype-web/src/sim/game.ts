// Kern der Simulation: Spielstand, Zeit, Geld, Firma, Bauen, Aufträge.
// Enthält keinen Darstellungscode und ist mit Vitest testbar.
import { BUILDING_TYPES, MACHINES, buildingType, crewEfficiency, type BuildingType, type Visual } from '../data/buildings';
import { industry, type OrderTemplate } from '../data/industries';
import type { CountryEconomy } from '../data/countries';
import { distanceKm } from './geo';
import { econOf, getLocation, layoutOf, plotById } from './world';
import type { Plot } from './cityGen';
import { hashString, rng } from './rng';

export type Account = 'wallet' | 'company';
export type Category = 'living' | 'construction' | 'wages' | 'purchase' | 'income' | 'casino' | 'loan' | 'transfer' | 'fees' | 'shopping' | 'rent' | 'material' | 'travel' | 'sale';

export interface LedgerEntry { t: number; acct: Account; amount: number; text: string; cat: Category }
export interface Notice { t: number; text: string; kind: 'info' | 'good' | 'bad' }

export interface Ownership {
  owner: Account; // 'wallet' = privat, 'company' = Firma
  mode: 'owned' | 'rented';
  since: number;
  usableAt: number; // Grundbuch / Übergabe
  rent?: number; // Monatsmiete
  building?: string | 'npc'; // fertiges Gebäude (Typ-ID) oder bestehendes Gebäude
  paid: number; // Kaufpreis inkl. Nebenkosten
}

export interface Project {
  id: number;
  plotId: string;
  typeId: string;
  payer: Account;
  crew: number;
  state: 'permit' | 'building' | 'done';
  permitEndsAt: number;
  phase: number;
  phaseWork: number; // erledigte Personenstunden (effektiv) in der aktuellen Phase
  startedAt: number;
  finishedAt?: number;
  spent: number;
  pendingWages: number;
  workedToday: boolean;
}

export interface FoundingStep { id: string; label: string; info: string; fee: number; capital: number; days: number; doneAt?: number; startedAt?: number }

export interface Order { id: number; name: string; hours: number; done: number; material: number; price: number; deadline: number; offeredUntil: number }

export interface Company {
  name: string;
  color: string;
  industryId: string;
  legal: 'sole' | 'ltd';
  steps: FoundingStep[];
  active: boolean;
  employees: number;
  managerNeeded: boolean;
  offers: Order[];
  orders: Order[];
  nextOfferAt: number;
  equityIn: number;
  completedOrders: number;
}

export interface Loan { id: number; holder: Account; principal: number; remaining: number; rate: number; monthly: number; months: number }

export interface GameState {
  version: 1;
  t: number; // Spielzeit, Sekunden seit 1970 (UTC)
  speed: number;
  paused: boolean;
  player: { name: string; a3: string; homeId: string; locId: string; color: string; birthYear: number; travel?: { to: string; arriveAt: number; from: string; departedAt: number }; home: string | null };
  wallet: number;
  companyAcct: number;
  company: Company | null;
  ledger: LedgerEntry[];
  notices: Notice[];
  plots: Record<string, Ownership>;
  projects: Project[];
  loans: Loan[];
  inventory: { name: string; price: number; t: number; owner: Account }[];
  casino: { wagered: number; won: number; blockedUntil: number };
  history: { t: number; wallet: number; company: number; worth: number }[];
  nextId: number;
  dayKey: number;
  monthKey: number;
}

export const SPEEDS = [1, 2, 5, 10, 100, 1000, 10000];
export const DAY = 86400;
const START = Date.UTC(2026, 6, 1, 6, 0, 0) / 1000; // 1. Juli 2026, 08:00 MESZ ≈ 06:00 UTC

// ---------- Hilfen ----------
export const econ = (s: GameState): CountryEconomy => econOf(s.player.a3);
/** Faktor für Material- und Maschinenpreise (EUR-Basis → Landeswährung). */
export const matScale = (e: CountryEconomy) => e.perEur * e.priceLevel;
/** Lohnverhältnis zum österreichischen Niveau (für Arbeitsanteil an Preisen). */
export const wageScale = (e: CountryEconomy) => e.skilledMonthly / 4600;

/** Ortszeit grob über Längengrad (Spiel braucht keine exakten Zeitzonen). */
export function localDate(s: GameState): Date {
  const lon = getLocation(s.player.locId).lon;
  return new Date((s.t + Math.round(lon / 15) * 3600) * 1000);
}
const isWorkTime = (d: Date) => {
  const wd = d.getUTCDay();
  const h = d.getUTCHours() + d.getUTCMinutes() / 60;
  return wd >= 1 && wd <= 5 && h >= 7 && h < 16;
};
const dayKeyOf = (d: Date) => Math.floor(d.getTime() / 86400000);
const monthKeyOf = (d: Date) => d.getUTCFullYear() * 12 + d.getUTCMonth();

export function book(s: GameState, acct: Account, amount: number, text: string, cat: Category) {
  const v = Math.round(amount * 100) / 100;
  if (acct === 'wallet') s.wallet += v;
  else s.companyAcct += v;
  s.ledger.push({ t: s.t, acct, amount: v, text, cat });
  if (s.ledger.length > 600) s.ledger.splice(0, s.ledger.length - 600);
}
export const balance = (s: GameState, a: Account) => (a === 'wallet' ? s.wallet : s.companyAcct);
export function notify(s: GameState, text: string, kind: Notice['kind'] = 'info') {
  s.notices.push({ t: s.t, text, kind });
}
class GameError extends Error {}
const fail = (msg: string): never => {
  throw new GameError(msg);
};
export const isGameError = (e: unknown): e is Error => e instanceof GameError;
function pay(s: GameState, acct: Account, amount: number, text: string, cat: Category) {
  if (amount > 0 && balance(s, acct) < amount)
    fail(`Nicht genug Geld auf ${acct === 'wallet' ? 'deinem Geldbörserl' : 'dem Firmenkonto'}. Benötigt: ${fmtPlain(s, amount)}.`);
  book(s, acct, -amount, text, cat);
}
export function fmtPlain(s: GameState, v: number) {
  const cur = econ(s).currency;
  return new Intl.NumberFormat('de-AT', { style: 'currency', currency: cur, maximumFractionDigits: Math.abs(v) >= 1000 ? 0 : 2 }).format(v);
}

// ---------- Neues Spiel ----------
export function newGame(opts: { name: string; a3: string; homeId: string; color?: string; difficulty?: 'low' | 'normal' | 'rich' }): GameState {
  const e = econOf(opts.a3);
  const mult = opts.difficulty === 'low' ? 0.5 : opts.difficulty === 'rich' ? 10 : 1;
  const s: GameState = {
    version: 1, t: START, speed: 1, paused: true,
    player: { name: opts.name, a3: opts.a3, homeId: opts.homeId, locId: opts.homeId, color: opts.color ?? '#e0b030', birthYear: 2007, home: null },
    wallet: 0, companyAcct: 0, company: null, ledger: [], notices: [], plots: {}, projects: [], loans: [], inventory: [],
    casino: { wagered: 0, won: 0, blockedUntil: 0 }, history: [], nextId: 1, dayKey: 0, monthKey: 0,
  };
  const d = localDate(s);
  s.dayKey = dayKeyOf(d);
  s.monthKey = monthKeyOf(d);
  book(s, 'wallet', Math.round(e.startBudget * mult), 'Startkapital: Ersparnisse & Starthilfe nach dem Schulabschluss', 'transfer');
  notify(s, `Willkommen, ${opts.name}! Du hast die Schule abgeschlossen. Was machst du aus deinem Startkapital?`, 'good');
  return s;
}

// ---------- Firma ----------
export function foundingSteps(e: CountryEconomy, legal: 'sole' | 'ltd', regulated: boolean): FoundingStep[] {
  const steps: FoundingStep[] = [];
  const insurance = Math.round(650 * e.perEur * e.priceLevel);
  if (legal === 'ltd') {
    steps.push({ id: 'notar', label: 'Gesellschaftsvertrag beim Notar', info: 'Gesellschaftsvertrag unterschreiben und beglaubigen lassen.', fee: e.notaryFee, capital: 0, days: 7 });
    steps.push({ id: 'konto', label: 'Firmenkonto eröffnen & Stammkapital einzahlen', info: `Mindestens ${e.minCapitalPaid} ${e.currency} Stammkapital werden vom Geldbörserl auf das Firmenkonto überwiesen.`, fee: 0, capital: e.minCapitalPaid, days: 5 });
    steps.push({ id: 'register', label: `Eintragung ins ${e.registryName}`, info: 'Das Gericht prüft die Unterlagen und trägt die Firma ein.', fee: e.registryFee, capital: 0, days: 14 });
  } else {
    steps.push({ id: 'konto', label: 'Geschäftskonto eröffnen', info: 'Getrenntes Konto für alle Firmenbuchungen.', fee: 0, capital: 0, days: 5 });
  }
  steps.push({ id: 'gewerbe', label: 'Gewerbeanmeldung', info: regulated ? 'Reglementiertes Gewerbe: Befähigungsnachweis nötig. Du stellst eine:n gewerberechtliche:n Geschäftsführer:in in Teilzeit an.' : 'Anmeldung bei der Behörde.', fee: e.tradeFee, capital: 0, days: regulated ? 10 : 3 });
  steps.push({ id: 'versicherung', label: 'Betriebshaftpflicht abschließen', info: 'Jahresprämie für Schäden bei Kunden.', fee: insurance, capital: 0, days: 2 });
  return steps;
}

export function foundCompany(s: GameState, opts: { name: string; color: string; industryId: string; legal: 'sole' | 'ltd' }) {
  if (s.company) fail('Du hast bereits eine Firma.');
  const e = econ(s);
  const ind = industry(opts.industryId);
  const regulated = ind.regulated && e.regulatedTrades;
  s.company = {
    name: opts.name.trim() || 'Meine Firma', color: opts.color, industryId: ind.id, legal: opts.legal,
    steps: foundingSteps(e, opts.legal, regulated), active: false, employees: 0, managerNeeded: regulated,
    offers: [], orders: [], nextOfferAt: 0, equityIn: 0, completedOrders: 0,
  };
  startNextStep(s);
}

/** Startet den nächsten Gründungsschritt, wenn genug Geld da ist. Gibt false zurück, wenn blockiert. */
export function startNextStep(s: GameState): boolean {
  const c = s.company;
  if (!c || c.active) return false;
  const step = c.steps.find((st) => !st.doneAt);
  if (!step) return false;
  if (step.startedAt) return true;
  const need = step.fee + step.capital;
  if (s.wallet < need) {
    notify(s, `Gründung pausiert: Für „${step.label}" brauchst du ${fmtPlain(s, need)} im Geldbörserl.`, 'bad');
    return false;
  }
  if (step.fee > 0) book(s, 'wallet', -step.fee, `Gründung: ${step.label}`, 'fees');
  if (step.capital > 0) {
    book(s, 'wallet', -step.capital, 'Stammkapital an Firma', 'transfer');
    book(s, 'company', step.capital, 'Stammkapital vom Gesellschafter', 'transfer');
    c.equityIn += step.capital;
  }
  step.startedAt = s.t;
  return true;
}

export function transfer(s: GameState, from: Account, amount: number) {
  if (!s.company) fail('Du hast noch keine Firma.');
  if (!(amount > 0)) fail('Betrag muss größer als 0 sein.');
  const to: Account = from === 'wallet' ? 'company' : 'wallet';
  if (from === 'wallet') {
    pay(s, 'wallet', amount, 'Einlage in die Firma', 'transfer');
    book(s, to, amount, 'Einlage vom Gesellschafter', 'transfer');
    s.company!.equityIn += amount;
  } else {
    pay(s, 'company', amount, 'Entnahme / Gehalt an Inhaber:in', 'transfer');
    const tax = s.company!.legal === 'ltd' ? 0.275 : 0.25; // vereinfachte Steuer auf Ausschüttung/Entnahme
    book(s, to, amount, 'Entnahme aus der Firma', 'transfer');
    book(s, to, -amount * tax, `Steuer auf Entnahme (${Math.round(tax * 100)} %)`, 'fees');
  }
}

export function setEmployees(s: GameState, n: number) {
  const c = s.company;
  if (!c?.active) fail('Erst muss die Firma gegründet sein.');
  const max = Math.max(0, Math.floor(workshopArea(s) / 25));
  if (n > max) fail(`Zu wenig Platz: In deiner Werkstatt haben maximal ${max} Mitarbeiter:innen Platz (25 m² pro Person).`);
  c!.employees = Math.max(0, Math.floor(n));
}

export function workshopArea(s: GameState): number {
  let area = 0;
  for (const [plotId, o] of Object.entries(s.plots)) {
    if (o.owner !== 'company' || s.t < o.usableAt) continue;
    if (o.mode === 'rented') area = Math.max(area, rentedArea(plotById(plotId).plot));
    else if (o.building && o.building !== 'npc' && buildingType(o.building).workshop) area = Math.max(area, buildingType(o.building).area);
    else if (o.building === 'npc') area = Math.max(area, rentedArea(plotById(plotId).plot));
  }
  return area;
}

// ---------- Grundstücke ----------
/** Mietbare Hallen sind Einheiten in einem Gewerbepark (120–600 m²). */
export const rentedArea = (p: Plot) => (p.forRent ? Math.round((120 + p.hue * 480) / 10) * 10 : Math.round(p.w * p.d * 0.45));

export function npcBuildingValue(s: GameState, p: Plot): number {
  if (!p.npc) return 0;
  const e = econ(s);
  if (p.npc === 'house') return Math.round(buildCost(e, buildingType('efh')) * 0.75);
  return Math.round(rentedArea(p) * 600 * matScale(e));
}

export function plotPrice(s: GameState, plotId: string) {
  const { layout, plot } = plotById(plotId);
  const zone = plot.zone === 'park' ? 'residential' : plot.zone;
  const land = Math.round(plot.w * plot.d * layout.landPrice[zone]);
  const building = npcBuildingValue(s, plot);
  const e = econOf(getLocation(layout.id).a3);
  const fees = Math.round((land + building) * e.purchaseFees);
  return { land, building, fees, total: land + building + fees, area: Math.round(plot.w * plot.d) };
}

export function monthlyRent(s: GameState, plotId: string) {
  const { plot, layout } = plotById(plotId);
  const e = econOf(getLocation(layout.id).a3);
  return Math.round(rentedArea(plot) * e.rentIndustrial * layout.factor);
}

export function buyPlot(s: GameState, plotId: string, buyer: Account) {
  const { plot } = plotById(plotId);
  if (s.plots[plotId]) fail('Dieses Grundstück gehört bereits dir.');
  if (!plot.forSale) fail('Dieses Grundstück steht nicht zum Verkauf.');
  if (buyer === 'company' && !s.company?.active) fail('Deine Firma ist noch nicht fertig gegründet.');
  const price = plotPrice(s, plotId);
  pay(s, buyer, price.land + price.building, `Kauf Grundstück ${price.area} m² (${getLocation(plotId.split('#')[0]).name})`, 'purchase');
  book(s, buyer, -price.fees, 'Kaufnebenkosten (Grunderwerbsteuer, Notar, Grundbuch)', 'fees');
  s.plots[plotId] = { owner: buyer, mode: 'owned', since: s.t, usableAt: s.t + 21 * DAY, building: plot.npc ? 'npc' : undefined, paid: price.total };
  notify(s, 'Kaufvertrag unterschrieben. Die Grundbuch-Eintragung dauert etwa 3 Wochen.', 'good');
}

export function rentPlot(s: GameState, plotId: string) {
  const { plot } = plotById(plotId);
  if (!plot.forRent) fail('Diese Halle ist nicht zu vermieten.');
  if (!s.company?.active) fail('Mieten kann nur eine fertig gegründete Firma.');
  if (s.plots[plotId]) fail('Bereits gemietet.');
  const rent = monthlyRent(s, plotId);
  pay(s, 'company', rent * 3, 'Kaution Hallenmiete (3 Monatsmieten)', 'rent');
  s.plots[plotId] = { owner: 'company', mode: 'rented', since: s.t, usableAt: s.t + 7 * DAY, rent, building: 'npc', paid: 0 };
  notify(s, `Mietvertrag unterschrieben. Schlüsselübergabe in 7 Tagen. Miete: ${fmtPlain(s, rent)} pro Monat.`, 'good');
}

export function sellPlot(s: GameState, plotId: string) {
  const o = s.plots[plotId];
  if (!o) fail('Gehört dir nicht.');
  if (s.projects.some((p) => p.plotId === plotId && p.state !== 'done')) fail('Auf dem Grundstück wird noch gebaut.');
  if (o!.mode === 'rented') {
    delete s.plots[plotId];
    book(s, 'company', o!.rent! * 3, 'Kaution zurück (Mietende)', 'rent');
    return;
  }
  const value = assetValue(s, plotId);
  book(s, o!.owner, Math.round(value * 0.96), 'Verkauf Grundstück (abzüglich Makler 4 %)', 'sale');
  delete s.plots[plotId];
  if (s.player.home === plotId) s.player.home = null;
}

export function assetValue(s: GameState, plotId: string): number {
  const o = s.plots[plotId];
  if (!o || o.mode === 'rented') return 0;
  const p = plotPrice(s, plotId);
  let v = p.land;
  if (o.building === 'npc') v += p.building;
  else if (o.building) v += buildCost(econ(s), buildingType(o.building)) * 0.9;
  return Math.round(v);
}

export function moveIn(s: GameState, plotId: string | null) {
  if (plotId) {
    const o = s.plots[plotId];
    const { plot } = plotById(plotId);
    const vis = o?.building === 'npc' ? plot.npc : o?.building ? buildingType(o.building).visual : null;
    if (!o || o.owner !== 'wallet' || s.t < o.usableAt || !(vis === 'house' || vis === 'tinyhouse')) fail('Du kannst nur in ein fertiges eigenes Haus einziehen.');
  }
  s.player.home = plotId;
  notify(s, plotId ? 'Du bist in dein eigenes Haus eingezogen.' : 'Du wohnst wieder bei den Eltern / in der WG.', 'info');
}

// ---------- Bauen ----------
export function buildCost(e: CountryEconomy, b: BuildingType, crew = b.defaultCrew) {
  const material = b.material * matScale(e);
  const labour = b.workHours * e.constructionWageHour;
  const days = b.workHours / (crewEfficiency(crew) * 8);
  const machines = b.phases.reduce((sum, ph) => sum + ph.machines.reduce((m, id) => m + MACHINES[id].rentPerDay, 0) * days * ph.work, 0) * matScale(e);
  return Math.round(material + labour * Math.pow(crew, 0.15) + machines);
}
export const permitFee = (e: CountryEconomy, b: BuildingType) => Math.round(Math.max(250, b.material * 0.006) * matScale(e));
export const permitDays = (e: CountryEconomy, b: BuildingType) => Math.round(b.permitDays * e.permitDaysFactor);

export function canBuild(s: GameState, plotId: string, typeId: string): string | null {
  const o = s.plots[plotId];
  const { plot } = plotById(plotId);
  const b = buildingType(typeId);
  if (!o || o.mode !== 'owned') return 'Das Grundstück gehört dir nicht.';
  if (s.t < o.usableAt) return 'Die Grundbuch-Eintragung ist noch nicht abgeschlossen.';
  if (o.building) return 'Auf dem Grundstück steht bereits ein Gebäude.';
  if (s.projects.some((p) => p.plotId === plotId && p.state !== 'done')) return 'Hier läuft bereits ein Bauprojekt.';
  if (plot.zone !== b.zone) return `Falsche Flächenwidmung: ${b.name} braucht ${b.zone === 'industrial' ? 'Industrie/Gewerbe' : 'Wohnbau'}.`;
  const fits = (b.w <= plot.w - 4 && b.d <= plot.d - 4) || (b.d <= plot.w - 4 && b.w <= plot.d - 4);
  if (!fits) return 'Das Gebäude ist zu groß für dieses Grundstück.';
  if (o.owner === 'company' && !s.company?.active) return 'Die Firma ist noch nicht fertig gegründet.';
  return null;
}

export function startProject(s: GameState, plotId: string, typeId: string, crew: number) {
  const err = canBuild(s, plotId, typeId);
  if (err) fail(err);
  const b = buildingType(typeId);
  const e = econ(s);
  const o = s.plots[plotId];
  crew = Math.max(1, Math.min(b.maxCrew, Math.round(crew)));
  pay(s, o.owner, permitFee(e, b), `Baugenehmigung: ${b.name}`, 'fees');
  const p: Project = { id: s.nextId++, plotId, typeId, payer: o.owner, crew, state: 'permit', permitEndsAt: s.t + permitDays(e, b) * DAY, phase: 0, phaseWork: 0, startedAt: s.t, spent: permitFee(e, b), pendingWages: 0, workedToday: false };
  s.projects.push(p);
  notify(s, `Bauansuchen für ${b.name} eingereicht. Die Behörde braucht etwa ${permitDays(e, b)} Tage.`, 'info');
  return p;
}

export function setCrew(s: GameState, projectId: number, crew: number) {
  const p = s.projects.find((x) => x.id === projectId);
  if (!p) return;
  const b = buildingType(p.typeId);
  p.crew = Math.max(1, Math.min(b.maxCrew, Math.round(crew)));
}

export function cancelProject(s: GameState, projectId: number) {
  const i = s.projects.findIndex((x) => x.id === projectId && x.state !== 'done');
  if (i < 0) return;
  settleProjectDay(s, s.projects[i]);
  s.projects.splice(i, 1);
  notify(s, 'Baustelle eingestellt. Bereits ausgegebenes Geld ist verloren.', 'bad');
}

/** Fortschritt 0..1 des gesamten Projekts. */
export function projectProgress(p: Project): number {
  if (p.state === 'done') return 1;
  if (p.state === 'permit') return 0;
  const b = buildingType(p.typeId);
  let done = 0;
  for (let i = 0; i < p.phase; i++) done += b.phases[i].work;
  done += (p.phaseWork / b.workHours);
  return Math.min(1, done);
}

export function projectEta(s: GameState, p: Project): number {
  const b = buildingType(p.typeId);
  const remainingHours = b.workHours * (1 - projectProgress(p));
  const workDays = remainingHours / (crewEfficiency(p.crew) * 8);
  const calendar = workDays * 7 / 5;
  return (p.state === 'permit' ? p.permitEndsAt : s.t) + calendar * DAY;
}

function chargePhaseMaterial(s: GameState, p: Project) {
  const b = buildingType(p.typeId);
  const ph = b.phases[p.phase];
  const cost = Math.round(b.material * ph.material * matScale(econ(s)));
  if (cost > 0) {
    book(s, p.payer, -cost, `Material ${ph.name}: ${b.name}`, 'material');
    p.spent += cost;
  }
}

function settleProjectDay(s: GameState, p: Project) {
  const b = buildingType(p.typeId);
  if (p.pendingWages > 0) {
    book(s, p.payer, -Math.round(p.pendingWages), `Löhne Baustelle (${p.crew} Arbeiter): ${b.name}`, 'wages');
    p.spent += Math.round(p.pendingWages);
    p.pendingWages = 0;
  }
  if (p.workedToday) {
    const ph = b.phases[Math.min(p.phase, b.phases.length - 1)];
    const rent = Math.round(ph.machines.reduce((m, id) => m + MACHINES[id].rentPerDay, 0) * matScale(econ(s)));
    if (rent > 0) {
      book(s, p.payer, -rent, `Maschinenmiete (${ph.machines.map((m) => MACHINES[m].name).join(', ')})`, 'construction');
      p.spent += rent;
    }
    p.workedToday = false;
  }
}

// ---------- Aufträge ----------
function makeOffer(s: GameState): Order | null {
  const c = s.company!;
  const area = workshopArea(s);
  const e = econ(s);
  const r = rng(hashString(`${s.t}|${c.completedOrders}`));
  const pool: OrderTemplate[] = industry(c.industryId).orders.filter((o) => o.minArea <= area);
  if (!pool.length) return null;
  const tpl = r.pick(pool);
  const v = r.range(0.85, 1.2);
  const material = Math.round(tpl.material * matScale(e) * v);
  const price = Math.round(((tpl.price - tpl.material) * wageScale(e) * e.perEur ** 0 + tpl.material * matScale(e)) * v);
  const capacity = 1 + c.employees;
  const days = Math.ceil((tpl.hours / (8 * capacity)) * 1.6 * 7 / 5) + 7;
  return { id: s.nextId++, name: tpl.name, hours: tpl.hours, done: 0, material, price, deadline: days, offeredUntil: s.t + 5 * DAY };
}

export function acceptOrder(s: GameState, orderId: number) {
  const c = s.company;
  const i = c?.offers.findIndex((o) => o.id === orderId) ?? -1;
  if (!c || i < 0) return;
  const o = c.offers[i];
  pay(s, 'company', o.material, `Materialeinkauf für Auftrag „${o.name}"`, 'material');
  c.offers.splice(i, 1);
  o.deadline = s.t + o.deadline * DAY;
  c.orders.push(o);
}
export const declineOrder = (s: GameState, orderId: number) => {
  if (s.company) s.company.offers = s.company.offers.filter((o) => o.id !== orderId);
};

// ---------- Kredite ----------
export function loanLimit(s: GameState, holder: Account): number {
  const e = econ(s);
  let property = 0;
  for (const [id, o] of Object.entries(s.plots)) if (o.owner === holder) property += assetValue(s, id);
  const open = s.loans.filter((l) => l.holder === holder).reduce((a, l) => a + l.remaining, 0);
  const base = holder === 'company' ? (s.company?.active ? s.company.equityIn * 4 + e.startBudget * 2 : 0) : e.startBudget * 1.5;
  return Math.max(0, Math.round(base + property * 0.7 - open));
}

export function takeLoan(s: GameState, holder: Account, amount: number, years: number) {
  if (holder === 'company' && !s.company?.active) fail('Firmenkredite gibt es erst nach der Gründung.');
  if (!(amount > 0)) fail('Betrag ungültig.');
  if (amount > loanLimit(s, holder)) fail(`Die Bank gibt dir höchstens ${fmtPlain(s, loanLimit(s, holder))}.`);
  const rate = econ(s).loanRate + (holder === 'wallet' ? 0.02 : 0);
  const n = Math.round(years * 12);
  const i = rate / 12;
  const monthly = Math.round((amount * i) / (1 - Math.pow(1 + i, -n)));
  s.loans.push({ id: s.nextId++, holder, principal: amount, remaining: amount, rate, monthly, months: n });
  book(s, holder, amount, `Kredit ausbezahlt (${(rate * 100).toFixed(1)} % p.a., ${years} Jahre)`, 'loan');
}

export function repayLoan(s: GameState, loanId: number) {
  const l = s.loans.find((x) => x.id === loanId);
  if (!l) return;
  pay(s, l.holder, l.remaining, 'Kredit vorzeitig getilgt', 'loan');
  s.loans = s.loans.filter((x) => x !== l);
}

// ---------- Reisen und Einkaufen ----------
export function travelQuote(s: GameState, toId: string) {
  const from = getLocation(s.player.locId);
  const to = getLocation(toId);
  const km = distanceKm(from, to);
  const e = econ(s);
  const flight = km > 700;
  const costEur = flight ? 90 + km * 0.07 : Math.max(9, km * 0.13);
  const hours = flight ? 3.5 + km / 750 : 0.5 + km / 95;
  return { km: Math.round(km), mode: flight ? 'Flug' : 'Bahn', cost: Math.round(costEur * e.perEur * Math.max(0.5, e.priceLevel)), hours };
}

export function travel(s: GameState, toId: string) {
  if (s.player.travel) fail('Du bist bereits unterwegs.');
  if (toId === s.player.locId) return;
  const q = travelQuote(s, toId);
  pay(s, 'wallet', q.cost, `${q.mode}ticket nach ${getLocation(toId).name}`, 'travel');
  s.player.travel = { to: toId, from: s.player.locId, departedAt: s.t, arriveAt: s.t + q.hours * 3600 };
  notify(s, `Du reist per ${q.mode} nach ${getLocation(toId).name} (ca. ${q.hours.toFixed(1)} h).`, 'info');
}

export function buyItem(s: GameState, name: string, priceEur: number, acct: Account, shopName: string) {
  const e = econ(s);
  const price = Math.round(priceEur * matScale(e));
  if (acct === 'company' && !s.company?.active) fail('Du hast noch keine aktive Firma.');
  pay(s, acct, price, `${name} bei ${shopName}`, 'shopping');
  s.inventory.push({ name, price, t: s.t, owner: acct });
}

// ---------- Vermögen ----------
export function netWorth(s: GameState) {
  let assets = s.wallet + s.companyAcct;
  for (const id of Object.keys(s.plots)) assets += assetValue(s, id);
  for (const p of s.projects) if (p.state !== 'done') assets += p.spent * 0.6;
  const debt = s.loans.reduce((a, l) => a + l.remaining, 0);
  return Math.round(assets - debt);
}

/** Saldo der letzten 30 Tage ohne Umbuchungen, Kredite und Grundstückskäufe. */
export function last30(s: GameState) {
  const since = s.t - 30 * DAY;
  let income = 0, expense = 0;
  for (const l of s.ledger) {
    if (l.t < since || l.cat === 'transfer' || l.cat === 'loan' || l.cat === 'purchase' || l.cat === 'sale') continue;
    if (l.amount > 0) income += l.amount; else expense -= l.amount;
  }
  return { income, expense, net: income - expense };
}

// ---------- Zeit ----------
const STEP = 600; // 10 Minuten Spielzeit pro Simulationsschritt

export function advance(s: GameState, seconds: number) {
  let left = seconds;
  while (left > 0) {
    const dt = Math.min(STEP, left);
    left -= dt;
    step(s, dt);
  }
}

function step(s: GameState, dt: number) {
  s.t += dt;
  const d = localDate(s);
  const work = isWorkTime(d);
  const dk = dayKeyOf(d);
  const mk = monthKeyOf(d);
  const e = econ(s);
  const hours = dt / 3600;

  // Reise
  const tr = s.player.travel;
  if (tr && s.t >= tr.arriveAt) {
    s.player.locId = tr.to;
    s.player.travel = undefined;
    notify(s, `Angekommen in ${getLocation(tr.to).name}.`, 'good');
  }

  // Firmengründung
  const c = s.company;
  if (c && !c.active) {
    const st = c.steps.find((x) => !x.doneAt);
    if (st?.startedAt && s.t >= st.startedAt + st.days * DAY) {
      st.doneAt = s.t;
      notify(s, `Erledigt: ${st.label}`, 'good');
      if (c.steps.every((x) => x.doneAt)) {
        c.active = true;
        c.nextOfferAt = s.t + 2 * DAY;
        notify(s, `${c.name} ist offiziell gegründet! Nächster Schritt: Werkstatt mieten oder Industriegrundstück kaufen.`, 'good');
      } else startNextStep(s);
    }
  }

  // Grundbuch/Übergabe
  for (const [id, o] of Object.entries(s.plots)) {
    if (o.usableAt > s.t - dt && o.usableAt <= s.t) {
      notify(s, o.mode === 'rented' ? 'Schlüsselübergabe: Die gemietete Halle ist bezugsbereit.' : 'Grundbuch-Eintragung abgeschlossen. Du kannst jetzt bauen.', 'good');
      if (o.owner === 'company' && c?.active && !c.nextOfferAt) c.nextOfferAt = s.t + DAY;
      void id;
    }
  }

  // Baustellen
  for (const p of s.projects) {
    if (p.state === 'done') continue;
    const b = buildingType(p.typeId);
    if (p.state === 'permit') {
      if (s.t >= p.permitEndsAt) {
        p.state = 'building';
        p.phase = 0;
        chargePhaseMaterial(s, p);
        notify(s, `Baugenehmigung erteilt: ${b.name}. Die Bagger rollen an!`, 'good');
      }
      continue;
    }
    if (!work) continue;
    p.phaseWork += crewEfficiency(p.crew) * hours;
    p.pendingWages += p.crew * hours * e.constructionWageHour;
    p.workedToday = true;
    while (p.state === 'building' && p.phaseWork >= b.phases[p.phase].work * b.workHours) {
      p.phaseWork -= b.phases[p.phase].work * b.workHours;
      p.phase++;
      if (p.phase >= b.phases.length) {
        p.state = 'done';
        p.finishedAt = s.t;
        settleProjectDay(s, p);
        const o = s.plots[p.plotId];
        if (o) o.building = p.typeId;
        notify(s, `Fertig gebaut: ${b.name}! Gesamtkosten ${fmtPlain(s, p.spent)}.`, 'good');
      } else {
        chargePhaseMaterial(s, p);
        notify(s, `Bauphase „${b.phases[p.phase].name}" beginnt: ${b.name}`, 'info');
      }
    }
  }

  // Aufträge
  if (c?.active) {
    const area = workshopArea(s);
    if (area > 0) {
      if (s.t >= c.nextOfferAt && c.offers.length < 4) {
        const o = makeOffer(s);
        if (o) {
          c.offers.push(o);
          notify(s, `Neue Anfrage: ${o.name} (${fmtPlain(s, o.price)})`, 'info');
        }
        c.nextOfferAt = s.t + (1 + rng(hashString('o' + s.t)).next() * 3) * DAY / Math.max(1, Math.sqrt(1 + c.employees));
      }
      c.offers = c.offers.filter((o) => o.offeredUntil > s.t);
      if (work) {
        let cap = (1 + c.employees) * hours;
        for (const o of c.orders) {
          if (cap <= 0) break;
          const use = Math.min(cap, o.hours - o.done);
          o.done += use;
          cap -= use;
        }
        for (const o of c.orders.filter((x) => x.done >= x.hours - 1e-6)) {
          const late = s.t > o.deadline;
          const amount = late ? Math.round(o.price * 0.9) : o.price;
          book(s, 'company', amount, `Rechnung bezahlt: ${o.name}${late ? ' (10 % Abzug wegen Verspätung)' : ''}`, 'income');
          c.completedOrders++;
          notify(s, `Auftrag erledigt: ${o.name} → +${fmtPlain(s, amount)}`, 'good');
        }
        c.orders = c.orders.filter((x) => x.done < x.hours - 1e-6);
      }
    }
  }

  // Tageswechsel
  if (dk !== s.dayKey) {
    s.dayKey = dk;
    for (const p of s.projects) if (p.state === 'building') settleProjectDay(s, p);
    s.history.push({ t: s.t, wallet: Math.round(s.wallet), company: Math.round(s.companyAcct), worth: netWorth(s) });
    if (s.history.length > 800) s.history.splice(0, s.history.length - 800);
  }

  // Monatswechsel
  if (mk !== s.monthKey) {
    s.monthKey = mk;
    monthly(s);
  }
}

function monthly(s: GameState) {
  const e = econ(s);
  book(s, 'wallet', -(s.player.home ? e.livingCostOwnHome : e.livingCost), s.player.home ? 'Lebenshaltung (eigenes Haus: Essen, Strom, Betriebskosten, Versicherung)' : 'Lebenshaltung (Kostgeld, Essen, Handy, Versicherung)', 'living');
  const c = s.company;
  if (c?.active) {
    if (c.employees > 0) book(s, 'company', -c.employees * e.skilledMonthly, `Löhne: ${c.employees} × ${industry(c.industryId).worker}`, 'wages');
    if (c.managerNeeded) book(s, 'company', -Math.round(e.skilledMonthly * 0.3), 'Gewerberechtliche:r Geschäftsführer:in (Teilzeit)', 'wages');
    book(s, 'company', -Math.round(45 * e.perEur * e.priceLevel), 'Kontoführung & Buchhaltungssoftware', 'fees');
  }
  for (const [, o] of Object.entries(s.plots)) {
    if (o.mode === 'rented' && o.rent) book(s, o.owner, -o.rent, 'Hallenmiete', 'rent');
    else if (o.mode === 'owned') {
      const tax = Math.round(o.paid * 0.002 / 12 * 10) / 10;
      if (tax > 0) book(s, o.owner, -tax, 'Grundsteuer', 'fees');
    }
  }
  for (const l of s.loans) {
    const interest = l.remaining * l.rate / 12;
    const pay = Math.min(l.monthly, l.remaining + interest);
    l.remaining = Math.max(0, l.remaining + interest - pay);
    book(s, l.holder, -pay, `Kreditrate (davon Zinsen ${fmtPlain(s, interest)})`, 'loan');
  }
  s.loans = s.loans.filter((l) => l.remaining > 0.5);
  // Überziehungszinsen
  for (const acct of ['wallet', 'company'] as Account[]) {
    const bal = balance(s, acct);
    if (bal < 0) {
      book(s, acct, (bal * 0.12) / 12, 'Überziehungszinsen (12 % p.a.)', 'fees');
      notify(s, `${acct === 'wallet' ? 'Dein Geldbörserl' : 'Das Firmenkonto'} ist im Minus! Bring Geld rein, sonst wird es teuer.`, 'bad');
    }
  }
  const age = localDate(s).getUTCFullYear() - s.player.birthYear;
  void age;
}

/** Visuelle Darstellung eines Grundstücks (für den Renderer). */
export function plotVisual(s: GameState, plotId: string, plot: Plot): { visual: Visual | null; project?: Project; mine: Account | null; rented: boolean } {
  const o = s.plots[plotId];
  const project = s.projects.find((p) => p.plotId === plotId && p.state !== 'done');
  if (!o) return { visual: plot.npc, mine: null, rented: false };
  let visual: Visual | null = plot.npc;
  if (o.building && o.building !== 'npc') visual = buildingType(o.building).visual;
  return { visual, project, mine: o.owner, rented: o.mode === 'rented' };
}

export const BUILDABLE = BUILDING_TYPES;

// ---------- Speichern ----------
const SAVE_KEY = 'world-sim-save-v1';
export function serialize(s: GameState) {
  return JSON.stringify({ ...s, notices: [] });
}
export function deserialize(json: string): GameState {
  const s = JSON.parse(json) as GameState;
  if (s.version !== 1) throw new Error('Unbekannte Spielstand-Version');
  s.notices = [];
  return s;
}
export function saveLocal(s: GameState) {
  try {
    localStorage.setItem(SAVE_KEY, serialize(s));
    return true;
  } catch {
    return false;
  }
}
export function loadLocal(): GameState | null {
  try {
    const j = localStorage.getItem(SAVE_KEY);
    return j ? deserialize(j) : null;
  } catch {
    return null;
  }
}
export { layoutOf };
