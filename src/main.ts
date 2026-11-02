import { registerWorld, allLocations } from './sim/world';
import { WorldMap, type MapData } from './render/worldMap';
import { App } from './ui/app';

async function json<T>(name: string): Promise<T> {
  const r = await fetch(`${import.meta.env.BASE_URL}data/${name}.json`);
  if (!r.ok) throw new Error(`Daten fehlen: ${name}`);
  return r.json();
}

async function boot() {
  const [countries, lakes, cities, highways, railways, ferries, ports] = await Promise.all([
    json<MapData['countries']>('countries'), json<MapData['lakes']>('lakes'), json<any[]>('cities'),
    json<MapData['highways']>('highways'), json<MapData['railways']>('railways'), json<MapData['ferries']>('ferries'), json<MapData['ports']>('ports'),
  ]);
  registerWorld(cities, countries.map((c) => ({ a3: c.a3, name: c.n, nameDe: c.nde, pop: c.pop, gdp: c.gdp })));
  const world = new WorldMap({ countries, lakes, highways, railways, ferries, ports }, document.getElementById('view')!);
  world.setLocations(allLocations());
  const app = new App(world);
  (window as any).app = app;
  app.showStart();
}

boot().catch((e) => {
  document.getElementById('loading')!.textContent = 'Fehler beim Laden: ' + (e as Error).message;
  console.error(e);
});
