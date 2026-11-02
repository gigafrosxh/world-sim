// Prozedurale Low-Poly-Modelle. Jedes Modell steht mit der Unterkante auf y = 0
// und ist um den Ursprung zentriert. Einheiten: Meter.
import * as THREE from 'three';
import * as T from './textures';

const mats = new Map<string, THREE.Material>();
export function mat(key: string, make: () => THREE.Material) {
  let m = mats.get(key);
  if (!m) {
    m = make();
    mats.set(key, m);
  }
  return m;
}
export const solid = (color: string | number, opts: THREE.MeshStandardMaterialParameters = {}) =>
  mat(`solid-${color}-${JSON.stringify(opts)}`, () => new THREE.MeshStandardMaterial({ color, roughness: 0.85, ...opts }));

/** Alle Fenster-Materialien, damit sie nachts leuchten können. */
export const nightMaterials = new Set<THREE.MeshStandardMaterial>();

function facadeMat(style: Parameters<typeof T.facade>[0], wall: string) {
  return mat(`fac-${style}-${wall}`, () => {
    const m = new THREE.MeshStandardMaterial({ map: T.facade(style, wall), emissiveMap: T.facade(style, wall, true), emissive: 0xffffff, emissiveIntensity: 0, roughness: style === 'glass' ? 0.3 : 0.85, metalness: style === 'glass' ? 0.3 : 0 });
    nightMaterials.add(m);
    return m;
  });
}

/** Box mit Fassade: UVs so skaliert, dass ein Fenster pro Achse/Geschoß erscheint. Dach separat. */
function facadeBox(w: number, h: number, d: number, style: Parameters<typeof T.facade>[0], wall: string, cell = 3.2, floorH = 3) {
  const g = new THREE.BoxGeometry(w, h, d);
  const uv = g.attributes.uv as THREE.BufferAttribute;
  // Flächen: +x, -x, +y, -y, +z, -z (je 4 Vertices)
  const sizes = [[d, h], [d, h], [0, 0], [0, 0], [w, h], [w, h]];
  for (let f = 0; f < 6; f++) {
    const [fw, fh] = sizes[f];
    for (let v = 0; v < 4; v++) {
      const i = f * 4 + v;
      uv.setXY(i, uv.getX(i) * Math.max(1, Math.round(fw / cell)), uv.getY(i) * Math.max(1, Math.round(fh / floorH)));
    }
  }
  const m = new THREE.Mesh(g, facadeMat(style, wall));
  m.position.y = h / 2;
  return m;
}

export function box(w: number, h: number, d: number, material: THREE.Material, x = 0, y = 0, z = 0) {
  const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), material);
  m.position.set(x, y + h / 2, z);
  return m;
}
function cyl(rt: number, rb: number, h: number, material: THREE.Material, x = 0, y = 0, z = 0, seg = 12) {
  const m = new THREE.Mesh(new THREE.CylinderGeometry(rt, rb, h, seg), material);
  m.position.set(x, y + h / 2, z);
  return m;
}
/** Satteldach als Prisma entlang x. */
function gableRoof(w: number, d: number, rise: number, material: THREE.Material, y: number, overhang = 0.5) {
  const s = new THREE.Shape();
  s.moveTo(-d / 2 - overhang, 0);
  s.lineTo(d / 2 + overhang, 0);
  s.lineTo(0, rise);
  s.closePath();
  const g = new THREE.ExtrudeGeometry(s, { depth: w + overhang * 2, bevelEnabled: false });
  g.translate(0, 0, -(w + overhang * 2) / 2);
  g.rotateY(Math.PI / 2);
  const m = new THREE.Mesh(g, material);
  m.position.y = y;
  return m;
}
function shedRoof(w: number, d: number, teeth: number, rise: number, y: number) {
  const group = new THREE.Group();
  const tw = d / teeth;
  for (let i = 0; i < teeth; i++) {
    const s = new THREE.Shape();
    s.moveTo(0, 0);
    s.lineTo(tw, 0);
    s.lineTo(tw, rise);
    s.closePath();
    const g = new THREE.ExtrudeGeometry(s, { depth: w, bevelEnabled: false });
    g.translate(-d / 2 + i * tw, 0, -w / 2);
    g.rotateY(Math.PI / 2);
    const roof = new THREE.Mesh(g, solid('#8a8f96', { metalness: 0.3 }));
    roof.position.y = y;
    group.add(roof);
    const glass = new THREE.Mesh(new THREE.PlaneGeometry(w, rise), solid('#9fc3e0', { metalness: 0.4, roughness: 0.2, side: THREE.DoubleSide }));
    glass.position.set(0, y + rise / 2, d / 2 - i * tw - tw);
    glass.position.z = -(-d / 2 + (i + 1) * tw);
    group.add(glass);
  }
  return group;
}

const WALLS = ['#efe6d6', '#e8d9c0', '#f3efe6', '#dfe6e8', '#ead2c4', '#e4e0c8'];
const ROOFS = ['#9b3b2f', '#7d3328', '#5a5a60', '#8a4a2a', '#4f5a66'];

export function tree(scale = 1, kind = 0) {
  const g = new THREE.Group();
  g.add(cyl(0.18 * scale, 0.25 * scale, 2.2 * scale, solid('#6b4a2f')));
  if (kind === 0) {
    const c = new THREE.Mesh(new THREE.IcosahedronGeometry(1.7 * scale, 0), solid('#4f7f3a', { flatShading: true }));
    c.position.y = 3.2 * scale;
    g.add(c);
  } else {
    const c = new THREE.Mesh(new THREE.ConeGeometry(1.4 * scale, 4 * scale, 7), solid('#3f6b3a', { flatShading: true }));
    c.position.y = 3.8 * scale;
    g.add(c);
  }
  return g;
}

export function house(w: number, d: number, floors: number, hue: number) {
  const g = new THREE.Group();
  const wall = WALLS[Math.floor(hue * WALLS.length)];
  const roof = ROOFS[Math.floor(hue * 7) % ROOFS.length];
  const h = floors * 2.9;
  g.add(facadeBox(w, h, d, 'house', wall, 3.6, 2.9));
  g.add(gableRoof(w, d, d * 0.4, mat(`roofm-${roof}`, () => new THREE.MeshStandardMaterial({ map: T.roofTiles(roof), roughness: 0.9 })), h));
  g.add(box(0.9, 1.6, 0.9, solid('#7a5040'), w * 0.25, h + d * 0.15, -d * 0.1));
  g.add(box(1.1, 2.1, 0.1, solid('#5a3a28'), 0, 0, d / 2 + 0.02));
  return g;
}

export function tinyHouse(w: number, d: number) {
  const g = new THREE.Group();
  g.add(box(w, 2.8, d, mat('wood', () => new THREE.MeshStandardMaterial({ map: T.corrugated('#a87a4f'), roughness: 0.9 }))));
  const roof = box(w + 0.6, 0.25, d + 0.8, solid('#3d3d42'), 0, 2.8, 0);
  roof.rotation.x = 0.12;
  g.add(roof);
  g.add(box(2.4, 1.4, 0.08, solid('#9fc3e0', { roughness: 0.2 }), w * 0.2, 0.9, d / 2 + 0.02));
  g.add(box(0.9, 2, 0.08, solid('#4a3020'), -w * 0.3, 0, d / 2 + 0.02));
  return g;
}

export function apartment(w: number, d: number, floors: number, hue: number) {
  const g = new THREE.Group();
  const wall = ['#e6dccb', '#d9d2c5', '#e9e1d0', '#cfd7da', '#e6cfc0'][Math.floor(hue * 5)];
  const h = floors * 3;
  g.add(facadeBox(w, h, d, 'apartment', wall, 3.4, 3));
  g.add(box(w + 0.4, 0.4, d + 0.4, solid('#7b7b7b'), 0, h, 0));
  g.add(box(3, 2.5, 3, solid('#9a9a9a'), w * 0.2, h + 0.4, 0));
  for (let f = 1; f < floors; f++) g.add(box(w * 0.7, 0.15, 1.2, solid('#f4f4f4'), 0, f * 3, d / 2 + 0.6));
  return g;
}

export function office(w: number, d: number, floors: number) {
  const g = new THREE.Group();
  const h = floors * 3.6;
  g.add(facadeBox(w, h, d, 'office', '#cfd3d6', 4, 3.6));
  g.add(box(w + 0.6, 0.6, d + 0.6, solid('#8b9298'), 0, h, 0));
  g.add(box(w * 0.4, 0.3, 3, solid('#556'), 0, 3.4, d / 2 + 1.5));
  return g;
}

export function tower(w: number, d: number, floors: number) {
  const g = new THREE.Group();
  const h = floors * 3.6;
  g.add(box(w + 2, 6, d + 2, solid('#6d747b'), 0, 0, 0));
  const t = facadeBox(w, h, d, 'glass', '#2d4c6a', 3, 3.6);
  t.position.y += 6;
  g.add(t);
  g.add(box(w * 0.6, 4, d * 0.6, solid('#8d949a', { metalness: 0.4 }), 0, h + 6, 0));
  g.add(cyl(0.2, 0.2, 10, solid('#c0c0c0'), w * 0.2, h + 10, 0, 6));
  return g;
}

function sign(text: string, bg: string, fg: string, w: number, h: number) {
  const m = new THREE.Mesh(new THREE.PlaneGeometry(w, h), mat(`signm-${text}-${bg}`, () => new THREE.MeshStandardMaterial({ map: T.signTexture(text, bg, fg), emissive: 0xffffff, emissiveMap: T.signTexture(text, bg, fg), emissiveIntensity: 0.25 })));
  return m;
}

export function car(color: string) {
  const g = new THREE.Group();
  g.add(box(4.2, 0.8, 1.8, solid(color, { metalness: 0.4, roughness: 0.4 }), 0, 0.3, 0));
  g.add(box(2.2, 0.6, 1.6, solid('#2f3a44', { roughness: 0.2 }), -0.2, 1.1, 0));
  return g;
}
export function truck(color: string) {
  const g = new THREE.Group();
  g.add(box(2.2, 2.6, 2.4, solid(color), 4, 0.4, 0));
  g.add(box(7.5, 3.0, 2.5, solid('#e8e8e8'), -1.2, 0.5, 0));
  g.add(box(10, 0.4, 2.2, solid('#333'), 0.5, 0.3, 0));
  return g;
}

export function shop(w: number, d: number, name: string, kind: string) {
  const g = new THREE.Group();
  const colors: Record<string, [string, string]> = {
    supermarkt: ['#f2c94c', '#b22222'], baumarkt: ['#e67e22', '#ffffff'], elektronik: ['#c0392b', '#ffffff'],
    moebel: ['#2e5aa8', '#f7d917'], auto: ['#333a44', '#ffffff'], stahl: ['#3d5a80', '#ffffff'], bank: ['#1f4e79', '#ffffff'],
  };
  const [bg, fg] = colors[kind] ?? ['#888', '#fff'];
  const bw = Math.min(w - 6, kind === 'baumarkt' || kind === 'moebel' ? w - 6 : 32);
  const bd = Math.min(d - 18, 24);
  const h = kind === 'bank' ? 9 : 6.5;
  const z0 = -d / 2 + bd / 2 + 3;
  g.add(box(bw, h, bd, solid(kind === 'bank' ? '#d9d4c7' : '#e7e3dc'), 0, 0, z0));
  g.add(box(bw, h * 0.55, 0.2, solid('#7fa7c4', { roughness: 0.15, metalness: 0.3 }), 0, 0, z0 + bd / 2 + 0.05));
  g.add(box(bw + 0.4, 1.4, 1.2, solid(bg), 0, h - 0.6, z0 + bd / 2 + 0.4));
  const s = sign(name, bg, fg, Math.min(bw * 0.8, 18), 3.2);
  s.position.set(0, h + 1.8, z0 + bd / 2 + 0.2);
  g.add(s);
  // Parkplatz mit Autos
  const lotD = d - bd - 6;
  if (lotD > 6) {
    const lot = new THREE.Mesh(new THREE.PlaneGeometry(w - 4, lotD).rotateX(-Math.PI / 2), mat('lot', () => new THREE.MeshStandardMaterial({ map: T.asphalt(false), roughness: 1 })));
    lot.position.set(0, 0.03, d / 2 - lotD / 2 - 1);
    g.add(lot);
    const colorsCar = ['#c0392b', '#2c3e50', '#ecf0f1', '#7f8c8d', '#2980b9', '#27ae60'];
    for (let i = 0; i < Math.floor((w - 8) / 5); i++) {
      if ((i * 7 + name.length) % 3 === 0) continue;
      const c = car(colorsCar[(i + name.length) % colorsCar.length]);
      c.rotation.y = Math.PI / 2;
      c.position.set(-w / 2 + 5 + i * 5, 0, d / 2 - lotD / 2 - 1);
      g.add(c);
    }
  }
  return g;
}

export function casino(w: number, d: number, name: string) {
  const g = new THREE.Group();
  const bw = w - 8, bd = d - 16;
  g.add(box(bw, 12, bd, solid('#f1e6c8'), 0, 0, -4));
  g.add(box(bw + 1, 1, bd + 1, solid('#c9a227', { metalness: 0.6, roughness: 0.3 }), 0, 12, -4));
  const dome = new THREE.Mesh(new THREE.SphereGeometry(bw * 0.18, 20, 12, 0, Math.PI * 2, 0, Math.PI / 2), solid('#d4af37', { metalness: 0.7, roughness: 0.25 }));
  dome.position.set(0, 13, -4);
  g.add(dome);
  for (let i = -3; i <= 3; i++) g.add(cyl(0.5, 0.5, 9, solid('#fffaf0'), i * (bw / 8), 0, -4 + bd / 2 + 2));
  g.add(box(bw * 0.9, 0.8, 4, solid('#fffaf0'), 0, 9, -4 + bd / 2 + 2));
  const s = sign(name, '#1b0f2e', '#ffd54a', Math.min(bw * 0.8, 26), 3.5);
  s.position.set(0, 10.5, -4 + bd / 2 + 4.2);
  (s.material as THREE.MeshStandardMaterial).emissiveIntensity = 0.9;
  g.add(s);
  const fountain = cyl(3, 3.2, 0.8, solid('#d8d2c4'), 0, 0, d / 2 - 5);
  g.add(fountain);
  g.add(cyl(2.6, 2.6, 0.1, solid('#5fa8d3', { roughness: 0.1 }), 0, 0.75, d / 2 - 5));
  for (const x of [-bw / 2 + 2, bw / 2 - 2]) {
    const palm = tree(1.2, 0);
    palm.position.set(x, 0, d / 2 - 4);
    g.add(palm);
  }
  return g;
}

export function factory(w: number, d: number, color = '#c84b31') {
  const g = new THREE.Group();
  const hw = Math.min(w - 6, Math.max(18, w * 0.75)), hd = Math.min(d - 8, Math.max(14, d * 0.6));
  const h = 8;
  g.add(facadeBox(hw, h, hd, 'industrial', '#b9b4aa', 4, 8));
  g.add(shedRoof(hw, hd, Math.max(2, Math.round(hd / 6)), 3, h));
  // Bürotrakt
  const ow = Math.min(12, hw * 0.4);
  g.add(Object.assign(facadeBox(ow, 7, 6, 'office', '#e3e0d8', 3.5, 3.5), {}));
  g.children[g.children.length - 1].position.set(-hw / 2 + ow / 2, 3.5, hd / 2 + 3);
  // Rolltore
  for (let i = 0; i < Math.max(1, Math.floor(hw / 14)); i++) {
    const door = box(4.5, 5, 0.1, mat('roller', () => new THREE.MeshStandardMaterial({ map: T.rollerDoor() })), hw / 2 - 4 - i * 7, 0, hd / 2 + 0.06);
    g.add(door);
  }
  // Schornstein rot-weiß
  const chimney = new THREE.Group();
  for (let i = 0; i < 6; i++) chimney.add(cyl(0.9 - i * 0.04, 0.95 - i * 0.04, 3, solid(i % 2 ? '#f1f1f1' : color), 0, i * 3, 0, 10));
  chimney.position.set(hw / 2 - 2, 0, -hd / 2 - 2.5);
  g.add(chimney);
  // Silo
  g.add(cyl(1.8, 1.8, 9, solid('#c7ccd1', { metalness: 0.4 }), -hw / 2 + 3, 0, -hd / 2 - 3));
  g.add(new THREE.Mesh(new THREE.ConeGeometry(1.8, 1.2, 12), solid('#c7ccd1', { metalness: 0.4 })).translateX(-hw / 2 + 3).translateY(9.6).translateZ(-hd / 2 - 3));
  return g;
}

export function warehouse(w: number, d: number) {
  const g = new THREE.Group();
  const hw = Math.min(w - 6, Math.max(20, w * 0.8)), hd = Math.min(d - 10, Math.max(14, d * 0.6));
  const h = 8;
  g.add(box(hw, h, hd, mat('corr-wh', () => new THREE.MeshStandardMaterial({ map: (() => { const t = T.corrugated('#9aa7b0').clone(); t.repeat.set(hw / 4, 1); t.needsUpdate = true; return t; })() }))));
  g.add(box(hw + 0.4, 1.2, hd + 0.4, solid('#6f7a83'), 0, h, 0));
  const n = Math.max(2, Math.floor(hw / 8));
  for (let i = 0; i < n; i++) {
    const x = -hw / 2 + 4 + i * ((hw - 8) / Math.max(1, n - 1));
    g.add(box(3.6, 4, 0.1, mat('roller', () => new THREE.MeshStandardMaterial({ map: T.rollerDoor() })), x, 1.2, hd / 2 + 0.06));
    g.add(box(4, 1.2, 2, solid('#555'), x, 0, hd / 2 + 1));
  }
  const t = truck('#2f6fb3');
  t.rotation.y = Math.PI / 2;
  t.position.set(-hw / 2 + 4, 0, hd / 2 + 7);
  g.add(t);
  return g;
}

export function workshop(w: number, d: number, companyName?: string, color = '#3a6ea5') {
  const g = new THREE.Group();
  const hw = Math.min(w - 4, 20), hd = Math.min(d - 6, 10);
  g.add(facadeBox(hw, 5.5, hd, 'industrial', '#d8d2c6', 4, 5.5));
  g.add(gableRoof(hw, hd, 1.6, solid('#6d7680', { metalness: 0.2 }), 5.5, 0.4));
  g.add(box(5, 4.2, 0.1, mat('roller', () => new THREE.MeshStandardMaterial({ map: T.rollerDoor() })), hw / 2 - 4, 0, hd / 2 + 0.06));
  g.add(box(1, 2.1, 0.1, solid('#334'), -hw / 2 + 3, 0, hd / 2 + 0.06));
  if (companyName) {
    const s = sign(companyName, color, '#ffffff', Math.min(hw * 0.7, 10), 1.6);
    s.position.set(-hw * 0.1, 4.6, hd / 2 + 0.12);
    g.add(s);
  }
  // Stahlprofile im Hof
  for (let i = 0; i < 4; i++) g.add(box(6, 0.25, 0.25, solid('#5d6066', { metalness: 0.6 }), -hw / 2 + 4, 0.2 + i * 0.3, hd / 2 + 3 + (i % 2) * 0.3));
  return g;
}

export function containerWorkshop(color = '#2f6fb3', companyName?: string) {
  const g = new THREE.Group();
  const m = mat(`cont-${color}`, () => new THREE.MeshStandardMaterial({ map: T.corrugated(color), roughness: 0.7 }));
  g.add(box(6.1, 2.6, 2.44, m, 0, 0, -1.3));
  g.add(box(6.1, 2.6, 2.44, m, 0, 0, 1.3));
  g.add(box(2, 2, 0.05, solid('#9fc3e0', { roughness: 0.2 }), 1.2, 0.5, 2.55));
  if (companyName) {
    const s = sign(companyName, '#ffffff', color, 4, 0.8);
    s.position.set(-1.4, 2.0, 2.55);
    g.add(s);
  }
  return g;
}

export function park(w: number, d: number, seed: number) {
  const g = new THREE.Group();
  let r = seed;
  const rnd = () => ((r = (r * 9301 + 49297) % 233280) / 233280);
  for (let i = 0; i < 26; i++) {
    const t = tree(0.8 + rnd() * 0.6, rnd() < 0.3 ? 1 : 0);
    t.position.set((rnd() - 0.5) * (w - 8), 0, (rnd() - 0.5) * (d - 8));
    g.add(t);
  }
  const path = new THREE.Mesh(new THREE.PlaneGeometry(3, d).rotateX(-Math.PI / 2), solid('#cdbf9f'));
  path.position.y = 0.04;
  g.add(path);
  const pond = new THREE.Mesh(new THREE.CircleGeometry(9, 20).rotateX(-Math.PI / 2), solid('#5fa8d3', { roughness: 0.1 }));
  pond.position.set(w * 0.2, 0.05, -d * 0.15);
  g.add(pond);
  return g;
}

/** Schild auf einem Pfosten („Zu verkaufen", „Zu vermieten"). */
export function plotSign(text: string, bg: string) {
  const g = new THREE.Group();
  g.add(box(0.15, 2.2, 0.15, solid('#555'), -1.2));
  g.add(box(0.15, 2.2, 0.15, solid('#555'), 1.2));
  const s = sign(text, bg, '#ffffff', 3, 1.1);
  s.position.y = 2.2;
  g.add(s);
  const back = s.clone();
  back.rotation.y = Math.PI;
  g.add(back);
  return g;
}

/** Spielfigur aus Blöcken. */
export function person(shirt: string, helmet = false) {
  const g = new THREE.Group();
  const legL = box(0.22, 0.85, 0.25, solid('#2c3e50'), -0.14, 0, 0);
  const legR = box(0.22, 0.85, 0.25, solid('#2c3e50'), 0.14, 0, 0);
  const body = box(0.6, 0.75, 0.32, solid(shirt), 0, 0.85, 0);
  const head = box(0.36, 0.36, 0.36, solid('#e0b996'), 0, 1.62, 0);
  const armL = box(0.16, 0.7, 0.2, solid(shirt), -0.4, 0.88, 0);
  const armR = box(0.16, 0.7, 0.2, solid(shirt), 0.4, 0.88, 0);
  g.add(legL, legR, body, head, armL, armR);
  if (helmet) g.add(box(0.42, 0.14, 0.42, solid('#f5c518'), 0, 1.98, 0));
  else g.add(box(0.38, 0.1, 0.38, solid('#3b2a1e'), 0, 1.98, 0));
  g.userData.limbs = { legL, legR, armL, armR };
  return g;
}
export function animatePerson(p: THREE.Object3D, t: number, moving: boolean) {
  const l = p.userData.limbs;
  if (!l) return;
  const a = moving ? Math.sin(t * 8) * 0.6 : 0;
  l.legL.rotation.x = a;
  l.legR.rotation.x = -a;
  l.armL.rotation.x = -a;
  l.armR.rotation.x = a;
}

// ---------- Baumaschinen ----------
export function excavator() {
  const g = new THREE.Group();
  g.add(box(3.2, 0.8, 0.7, solid('#333'), 0, 0, -1));
  g.add(box(3.2, 0.8, 0.7, solid('#333'), 0, 0, 1));
  const upper = new THREE.Group();
  upper.position.y = 0.8;
  upper.add(box(3, 1.2, 2.4, solid('#f2b705')));
  upper.add(box(1.2, 1.5, 1.2, solid('#f2b705'), 0.6, 1.2, -0.5));
  upper.add(box(1.0, 1.0, 0.05, solid('#9fc3e0'), 0.6, 1.4, 0.13));
  const boom = new THREE.Group();
  boom.position.set(-1.2, 1.2, 0.4);
  const b1 = box(0.4, 0.4, 3.6, solid('#f2b705'), 0, 0, 1.8);
  boom.add(b1);
  boom.rotation.x = -0.5;
  boom.rotation.y = Math.PI / 2 * 0;
  const arm = new THREE.Group();
  arm.position.set(0, 0.2, 3.6);
  arm.add(box(0.3, 0.3, 2.4, solid('#e0a800'), 0, -0.15, 1.2));
  arm.add(box(0.9, 0.7, 0.6, solid('#555'), 0, -0.5, 2.4));
  boom.add(arm);
  upper.add(boom);
  upper.rotation.y = -Math.PI / 2;
  g.add(upper);
  g.userData.anim = (t: number) => {
    upper.rotation.y = -Math.PI / 2 + Math.sin(t * 0.7) * 0.8;
    boom.rotation.x = -0.4 + Math.sin(t * 1.3) * 0.25;
    arm.rotation.x = 0.6 + Math.sin(t * 1.3 + 1) * 0.4;
  };
  return g;
}

export function towerCrane(height: number, jib: number) {
  const g = new THREE.Group();
  const yellow = solid('#f2b705', { metalness: 0.3 });
  g.add(box(2.2, 1, 2.2, solid('#777'), 0, 0, 0));
  // Gittermast
  const mast = new THREE.Group();
  for (const [x, z] of [[-0.7, -0.7], [0.7, -0.7], [-0.7, 0.7], [0.7, 0.7]]) mast.add(box(0.18, height, 0.18, yellow, x, 1, z));
  for (let y = 2; y < height; y += 2) {
    mast.add(box(1.6, 0.1, 0.1, yellow, 0, y, -0.7));
    mast.add(box(1.6, 0.1, 0.1, yellow, 0, y, 0.7));
    mast.add(box(0.1, 0.1, 1.6, yellow, -0.7, y, 0));
    mast.add(box(0.1, 0.1, 1.6, yellow, 0.7, y, 0));
  }
  g.add(mast);
  const top = new THREE.Group();
  top.position.y = height + 1;
  top.add(box(jib, 0.9, 0.9, yellow, jib / 2 - 3, 0, 0));
  top.add(box(8, 0.7, 0.7, yellow, -6, 0, 0));
  top.add(box(2.4, 1.8, 1.6, solid('#888'), -9, -0.9, 0));
  top.add(box(1.6, 1.6, 1.4, solid('#e9e9e9'), 0, -1.6, 1.1));
  top.add(box(0.3, 4, 0.3, yellow, 0, 0.9, 0));
  const hook = new THREE.Group();
  const cable = box(0.05, height * 0.5, 0.05, solid('#222'), 0, -height * 0.5, 0);
  hook.add(cable);
  hook.add(box(1.4, 0.4, 1.4, solid('#9b6b3a'), 0, -height * 0.5 - 0.4, 0));
  top.add(hook);
  g.add(top);
  g.userData.anim = (t: number) => {
    top.rotation.y = Math.sin(t * 0.15) * 1.6;
    hook.position.x = jib * 0.35 + Math.sin(t * 0.3) * jib * 0.25;
  };
  return g;
}

export function mixerTruck() {
  const g = new THREE.Group();
  g.add(box(7.5, 0.5, 2.3, solid('#333'), 0, 0.5, 0));
  g.add(box(2, 2.4, 2.3, solid('#e74c3c'), 2.8, 0.8, 0));
  const drum = new THREE.Mesh(new THREE.CylinderGeometry(1.0, 1.4, 4.2, 12), solid('#ecf0f1'));
  drum.rotation.z = Math.PI / 2 - 0.25;
  drum.position.set(-0.8, 2.3, 0);
  g.add(drum);
  g.userData.anim = (t: number) => {
    drum.rotation.x = t * 2;
  };
  return g;
}

export function dumpTruck() {
  return truck('#e67e22');
}
