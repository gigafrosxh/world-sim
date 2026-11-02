// Europäisches Roulette (eine Null). Echte Wahrscheinlichkeiten, Hausvorteil 2,7 %.
import { book, fmtPlain, notify, type GameState } from './game';
import { CASINOS } from '../data/places';
import { getLocation } from './world';
import { distanceKm } from './geo';

export const RED = new Set([1, 3, 5, 7, 9, 12, 14, 16, 18, 19, 21, 23, 25, 27, 30, 32, 34, 36]);

export type Bet =
  | { kind: 'number'; n: number }
  | { kind: 'red' | 'black' | 'even' | 'odd' | 'low' | 'high' }
  | { kind: 'dozen'; n: 1 | 2 | 3 };

/** Auszahlung inkl. Einsatz als Vielfaches (0 = verloren). */
export function payoutMultiplier(bet: Bet, result: number): number {
  if (bet.kind === 'number') return bet.n === result ? 36 : 0;
  if (result === 0) return 0;
  switch (bet.kind) {
    case 'red': return RED.has(result) ? 2 : 0;
    case 'black': return !RED.has(result) ? 2 : 0;
    case 'even': return result % 2 === 0 ? 2 : 0;
    case 'odd': return result % 2 === 1 ? 2 : 0;
    case 'low': return result <= 18 ? 2 : 0;
    case 'high': return result >= 19 ? 2 : 0;
    case 'dozen': return Math.ceil(result / 12) === bet.n ? 3 : 0;
  }
}

export function casinoHere(s: GameState): string | null {
  if (s.player.travel) return null;
  const loc = getLocation(s.player.locId);
  const near = CASINOS.map((c) => ({ c, d: distanceKm(c, loc) })).filter((x) => x.d < 25).sort((a, b) => a.d - b.d);
  return near[0]?.c.name ?? null;
}

export function spin(s: GameState, bet: Bet, stake: number, random = Math.random): { result: number; win: number } {
  if (!casinoHere(s)) throw new Error('Hier gibt es kein Casino. Reise in eine Casino-Stadt.');
  if (s.t < s.casino.blockedUntil) throw new Error('Du hast dich selbst gesperrt.');
  if (!(stake > 0) || stake > s.wallet) throw new Error('Einsatz ungültig oder nicht genug Geld im Geldbörserl.');
  const result = Math.floor(random() * 37);
  const win = stake * payoutMultiplier(bet, result);
  book(s, 'wallet', -stake, 'Roulette-Einsatz', 'casino');
  if (win > 0) book(s, 'wallet', win, `Roulette-Gewinn (Zahl ${result})`, 'casino');
  s.casino.wagered += stake;
  s.casino.won += win;
  const lost = s.casino.wagered - s.casino.won;
  if (lost > s.wallet && lost > 1000) notify(s, `Achtung: Du hast im Casino schon ${fmtPlain(s, lost)} verloren. Das Haus gewinnt auf Dauer immer.`, 'bad');
  return { result, win };
}
