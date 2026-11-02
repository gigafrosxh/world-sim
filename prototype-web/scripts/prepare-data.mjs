// Wandelt Natural-Earth-GeoJSON (Public Domain) in kompakte Spieldaten um.
// Rohdaten: https://github.com/nvkelso/natural-earth-vector/tree/master/geojson
// Aufruf: node scripts/prepare-data.mjs <ordner-mit-rohdaten>
import fs from 'node:fs';
import path from 'node:path';

const SRC = process.argv[2] ?? 'raw-data';
const OUT = 'public/data';
const BASE = 'https://raw.githubusercontent.com/nvkelso/natural-earth-vector/master/geojson/';
const FILES = ['ne_50m_admin_0_countries', 'ne_50m_lakes', 'ne_10m_populated_places_simple', 'ne_10m_roads', 'ne_10m_railroads', 'ne_10m_ports'];

async function load(name) {
  const p = path.join(SRC, name + '.geojson');
  if (!fs.existsSync(p)) {
    fs.mkdirSync(SRC, { recursive: true });
    console.log('lade', name);
    const res = await fetch(BASE + name + '.geojson');
    fs.writeFileSync(p, Buffer.from(await res.arrayBuffer()));
  }
  return JSON.parse(fs.readFileSync(p, 'utf8'));
}

const r = (v, q) => Math.round(v / q) * q;

function simplify(pts, tol) {
  if (pts.length <= 2) return pts;
  const keep = new Uint8Array(pts.length);
  keep[0] = keep[pts.length - 1] = 1;
  const stack = [[0, pts.length - 1]];
  while (stack.length) {
    const [a, b] = stack.pop();
    const [ax, ay] = pts[a], [bx, by] = pts[b];
    const dx = bx - ax, dy = by - ay, len = Math.hypot(dx, dy) || 1e-12;
    let max = 0, idx = -1;
    for (let i = a + 1; i < b; i++) {
      const d = Math.abs(dy * pts[i][0] - dx * pts[i][1] + bx * ay - by * ax) / len;
      if (d > max) { max = d; idx = i; }
    }
    if (max > tol && idx > 0) { keep[idx] = 1; stack.push([a, idx], [idx, b]); }
  }
  return pts.filter((_, i) => keep[i]);
}

function simplifyRing(ring, tol) {
  if (ring.length < 8) return ring;
  const mid = Math.floor(ring.length / 2);
  const a = simplify(ring.slice(0, mid + 1), tol);
  const b = simplify(ring.slice(mid), tol);
  return a.concat(b.slice(1));
}

function flat(pts, q) {
  const out = [];
  for (const [x, y] of pts) out.push(+r(x, q).toFixed(3), +r(y, q).toFixed(3));
  return out;
}

function polysOf(geom) {
  if (geom.type === 'Polygon') return [geom.coordinates];
  if (geom.type === 'MultiPolygon') return geom.coordinates;
  return [];
}
function linesOf(geom) {
  if (!geom) return [];
  if (geom.type === 'LineString') return [geom.coordinates];
  if (geom.type === 'MultiLineString') return geom.coordinates;
  return [];
}

function write(name, data) {
  const s = JSON.stringify(data);
  fs.writeFileSync(path.join(OUT, name), s);
  console.log(name, (s.length / 1024).toFixed(0) + ' KB');
}

fs.mkdirSync(OUT, { recursive: true });

// Länder
{
  const g = await load('ne_50m_admin_0_countries');
  const out = [];
  for (const f of g.features) {
    const p = f.properties;
    const polys = [];
    for (const poly of polysOf(f.geometry)) {
      const rings = poly.map((ring) => flat(simplifyRing(ring, 0.03), 0.01)).filter((ring) => ring.length >= 8);
      if (rings.length) polys.push(rings);
    }
    if (p.ADM0_A3 === 'ATA') continue; // Antarktis für Mercator weglassen
    out.push({
      a3: p.ADM0_A3, n: p.NAME, nde: p.NAME_DE || p.NAME, c: p.MAPCOLOR9,
      pop: p.POP_EST, gdp: p.GDP_MD, lx: +(+p.LABEL_X).toFixed(2), ly: +(+p.LABEL_Y).toFixed(2), polys,
    });
  }
  write('countries.json', out);
}
// Seen
{
  const g = await load('ne_50m_lakes');
  const out = [];
  for (const f of g.features) {
    if ((f.properties.scalerank ?? 9) > 4) continue;
    for (const poly of polysOf(f.geometry)) out.push(poly.map((ring) => flat(simplifyRing(ring, 0.03), 0.01)));
  }
  write('lakes.json', out);
}
// Städte
{
  const g = await load('ne_10m_populated_places_simple');
  const out = [];
  for (const f of g.features) {
    const p = f.properties;
    const cap = p.adm0cap === 1 ? 1 : 0;
    if (p.pop_max < (['AUT','CHE','DEU'].includes(p.adm0_a3) ? 40000 : 150000) && !cap) continue;
    out.push({ n: p.name, a3: p.adm0_a3, lat: +p.latitude.toFixed(3), lon: +p.longitude.toFixed(3), pop: p.pop_max, cap });
  }
  out.sort((a, b) => b.pop - a.pop);
  write('cities.json', out);
}
// Autobahnen + Fähren
{
  const g = await load('ne_10m_roads');
  const hw = [], ferry = [];
  for (const f of g.features) {
    const p = f.properties;
    const isHw = p.expressway === 1 || p.type === 'Major Highway' || p.type === 'Beltway';
    const isFerry = p.type?.startsWith('Ferry');
    if (!isHw && !isFerry) continue;
    for (const line of linesOf(f.geometry)) {
      const s = flat(simplify(line, 0.01), 0.005);
      if (s.length >= 4) (isFerry ? ferry : hw).push(s);
    }
  }
  write('highways.json', hw);
  write('ferries.json', ferry);
}
// Eisenbahn
{
  const g = await load('ne_10m_railroads');
  const out = [];
  for (const f of g.features) {
    for (const line of linesOf(f.geometry)) {
      const s = flat(simplify(line, 0.015), 0.005);
      if (s.length >= 4) out.push(s);
    }
  }
  write('railways.json', out);
}
// Häfen
{
  const g = await load('ne_10m_ports');
  const out = g.features.map((f) => [f.properties.name, +f.geometry.coordinates[0].toFixed(3), +f.geometry.coordinates[1].toFixed(3), f.properties.scalerank]);
  write('ports.json', out);
}
