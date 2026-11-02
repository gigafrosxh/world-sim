// Trianguliert die Länderflächen (Natural Earth) einmalig und schreibt sie für Unreal nach
// WorldSim/Content/Data/map_mesh.json. Koordinaten: x = Längengrad, y = Mercator-Breite (Grad).
import fs from 'node:fs';
import { ShapeUtils, Vector2 } from 'three';

const src = JSON.parse(fs.readFileSync('public/data/countries.json', 'utf8'));
const merc = (lat) => (180 / Math.PI) * Math.log(Math.tan(Math.PI / 4 + (Math.max(-84, Math.min(84, lat)) * Math.PI) / 360));
const r3 = (v) => Math.round(v * 1000) / 1000;
const out = { countries: [] };
for (const c of src) {
  const verts = [], tris = [], border = [];
  for (const poly of c.polys) {
    const rings = poly.map((ring) => {
      const pts = [];
      for (let i = 0; i < ring.length; i += 2) pts.push(new Vector2(ring[i], merc(ring[i + 1])));
      if (pts.length > 1 && pts[0].equals(pts[pts.length - 1])) pts.pop();
      return pts;
    });
    const [outer, ...holes] = rings;
    if (outer.length < 3) continue;
    const faces = ShapeUtils.triangulateShape(outer, holes);
    const base = verts.length / 2;
    for (const p of [outer, ...holes].flat()) verts.push(r3(p.x), r3(p.y));
    for (const f of faces) tris.push(base + f[0], base + f[1], base + f[2]);
    for (const ring of rings) for (let i = 0; i < ring.length; i++) {
      const a = ring[i], b = ring[(i + 1) % ring.length];
      border.push(r3(a.x), r3(a.y), r3(b.x), r3(b.y));
    }
  }
  out.countries.push({ a3: c.a3, name: c.n, nameDe: c.nde, color: c.c, pop: c.pop, gdp: c.gdp, lx: c.lx, ly: r3(merc(c.ly)), verts, tris, border });
}
fs.writeFileSync('../WorldSim/Content/Data/map_mesh.json', JSON.stringify(out));
console.log('map_mesh.json', (fs.statSync('../WorldSim/Content/Data/map_mesh.json').size / 1e6).toFixed(1), 'MB');
