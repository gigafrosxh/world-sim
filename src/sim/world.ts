// Registry der geladenen Weltdaten (Orte, Länder). Wird beim Start einmal befüllt.
import type { Location } from './geo';
import { distanceKm } from './geo';
import { CASINOS } from '../data/places';
import { CITY_NAMES_DE, economyFor, type CountryEconomy } from '../data/countries';
import { generateCity, type CityLayout, type Plot } from './cityGen';

export interface CountryInfo { a3: string; name: string; nameDe: string; pop: number; gdp: number }

const locations = new Map<string, Location>();
const countries = new Map<string, CountryInfo>();

export function registerWorld(cities: { n: string; a3: string; lat: number; lon: number; pop: number; cap: number }[], countryList: CountryInfo[]) {
  locations.clear();
  countries.clear();
  for (const c of countryList) countries.set(c.a3, c);
  for (const c of cities) {
    const name = CITY_NAMES_DE[c.n] ?? c.n;
    const id = `${c.a3}:${c.n}`;
    if (!locations.has(id)) locations.set(id, { id, name, a3: c.a3, lat: c.lat, lon: c.lon, pop: c.pop, cap: c.cap });
  }
  // Casino-Orte, die nicht als Stadt vorhanden sind, als kleine Orte ergänzen
  for (const cs of CASINOS) {
    const near = [...locations.values()].some((l) => distanceKm(l, cs) < 20);
    if (!near) {
      const id = `${cs.a3}:${cs.town}`;
      locations.set(id, { id, name: cs.town, a3: cs.a3, lat: cs.lat, lon: cs.lon, pop: 40000, cap: 0 });
    }
  }
}

export const allLocations = () => [...locations.values()];
export const getLocation = (id: string) => {
  const l = locations.get(id);
  if (!l) throw new Error('Unbekannter Ort ' + id);
  return l;
};
export const getCountry = (a3: string) => countries.get(a3);
export const countryName = (a3: string) => countries.get(a3)?.nameDe ?? a3;
export function econOf(a3: string): CountryEconomy {
  const c = countries.get(a3);
  return economyFor(a3, c?.gdp, c?.pop);
}
export function layoutOf(locId: string): CityLayout {
  const loc = getLocation(locId);
  const c = countries.get(loc.a3);
  return generateCity(loc, c?.gdp, c?.pop);
}
export function plotById(plotId: string): { layout: CityLayout; plot: Plot } {
  const [locId, idx] = plotId.split('#');
  const layout = layoutOf(locId);
  return { layout, plot: layout.plots[+idx] };
}
export const locIdOfPlot = (plotId: string) => plotId.split('#')[0];
