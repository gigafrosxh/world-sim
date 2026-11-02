// Weltkarte im Stil einer Strategiekarte: flächige Länder, kräftige Grenzen,
// echte Autobahnen, Bahnlinien, Häfen und Schifffahrtsrouten (Natural Earth).
import * as THREE from 'three';
import { MapControls } from 'three/examples/jsm/controls/MapControls.js';
import { LineSegments2 } from 'three/examples/jsm/lines/LineSegments2.js';
import { LineSegmentsGeometry } from 'three/examples/jsm/lines/LineSegmentsGeometry.js';
import { LineMaterial } from 'three/examples/jsm/lines/LineMaterial.js';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import type { Location } from '../sim/geo';
import { CASINOS } from '../data/places';
import { SHIPPING_ROUTES } from '../data/shipping';

export interface CountryData { a3: string; n: string; nde: string; c: number; pop: number; gdp: number; lx: number; ly: number; polys: number[][][] }
export interface MapData {
  countries: CountryData[];
  lakes: number[][][];
  highways: number[][];
  railways: number[][];
  ferries: number[][];
  ports: [string, number, number, number][];
}

const MAX_LAT = 84;
export const mercY = (lat: number) => (180 / Math.PI) * Math.log(Math.tan(Math.PI / 4 + (Math.max(-MAX_LAT, Math.min(MAX_LAT, lat)) * Math.PI) / 360));
export const invMercY = (y: number) => (360 / Math.PI) * Math.atan(Math.exp((y * Math.PI) / 180)) - 90;
/** lon/lat → Szenenkoordinaten (x, z). */
export const project = (lon: number, lat: number) => new THREE.Vector3(lon, 0, -mercY(lat));

// Gedämpfte, kräftige Farben im Stil klassischer Strategiekarten
const PALETTE = ['#8f6f4f', '#5f7f4a', '#a0525a', '#4f6f8f', '#9a8a4a', '#6f5a8a', '#4f8a7a', '#a0703a', '#7a7a5a', '#5a6a9a', '#8a4a6a', '#6a8a5a', '#9a6a4a'];

export class WorldMap {
  scene = new THREE.Scene();
  camera: THREE.PerspectiveCamera;
  controls: MapControls;
  private borderMat: LineMaterial;
  private highlightMat: LineMaterial;
  private layers: Record<string, THREE.Object3D> = {};
  private ships: { mesh: THREE.Mesh; path: THREE.Vector3[]; len: number[]; total: number; speed: number; pos: number }[] = [];
  private playerMarker: THREE.Mesh;
  private highlight?: LineSegments2;
  private countryMeshes: THREE.Mesh;
  private faceCountry: number[] = [];
  data: MapData;
  locations: Location[] = [];

  constructor(data: MapData, dom: HTMLElement) {
    this.data = data;
    this.scene.background = new THREE.Color('#2c4a63');
    this.camera = new THREE.PerspectiveCamera(32, 1, 0.05, 2000);
    this.camera.position.set(14, 95, 10);
    this.controls = new MapControls(this.camera, dom);
    this.controls.enableRotate = false;
    this.controls.screenSpacePanning = false;
    this.controls.minDistance = 0.6;
    this.controls.maxDistance = 260;
    this.controls.zoomToCursor = true;
    this.controls.enableDamping = true;
    this.controls.target.set(14, 0, -60);
    this.controls.update();

    this.scene.add(new THREE.AmbientLight(0xffffff, 1.0));
    this.scene.add(this.makeOcean());

    this.borderMat = new LineMaterial({ color: 0x1a1410, linewidth: 1.6, transparent: true, opacity: 0.85, depthTest: false });
    this.highlightMat = new LineMaterial({ color: 0xffe08a, linewidth: 3.2, depthTest: false, transparent: true });
    const { mesh, borders } = this.makeCountries();
    this.countryMeshes = mesh;
    this.scene.add(mesh, borders);
    this.scene.add(this.makeLakes());

    this.layers.highways = this.makeLines(data.highways, 0xe8a23a, 0.004);
    this.layers.railways = this.makeLines(data.railways, 0x2a2a2a, 0.005, true);
    this.layers.ferries = this.makeLines(data.ferries, 0x9fd0ff, 0.003, true);
    this.layers.shipping = this.makeShipping();
    this.layers.ports = this.makePorts();
    this.layers.casinos = this.makeCasinos();
    for (const l of Object.values(this.layers)) this.scene.add(l);

    this.playerMarker = new THREE.Mesh(new THREE.RingGeometry(0.18, 0.28, 32), new THREE.MeshBasicMaterial({ color: 0xffd23f, depthTest: false, transparent: true }));
    this.playerMarker.rotation.x = -Math.PI / 2;
    this.playerMarker.renderOrder = 10;
    this.scene.add(this.playerMarker);
  }

  setLocations(locs: Location[]) {
    this.locations = locs;
    const geo = new THREE.CircleGeometry(1, 12).rotateX(-Math.PI / 2);
    const mat = new THREE.MeshBasicMaterial({ color: 0xffffff, depthTest: false, transparent: true });
    const inst = new THREE.InstancedMesh(geo, mat, locs.length);
    const m = new THREE.Matrix4();
    const col = new THREE.Color();
    locs.forEach((l, i) => {
      const p = project(l.lon, l.lat);
      const r = l.cap ? 0.06 : 0.025 + Math.min(0.05, Math.sqrt(l.pop) / 60000);
      m.compose(new THREE.Vector3(p.x, 0.003, p.z), new THREE.Quaternion(), new THREE.Vector3(r, 1, r));
      inst.setMatrixAt(i, m);
      inst.setColorAt(i, col.set(l.cap ? 0xfff2c0 : 0xf0f0f0));
    });
    inst.renderOrder = 6;
    this.layers.cities = inst;
    this.scene.add(inst);
  }

  private makeOcean() {
    const c = document.createElement('canvas');
    c.width = c.height = 512;
    const g = c.getContext('2d')!;
    const grd = g.createLinearGradient(0, 0, 512, 512);
    grd.addColorStop(0, '#2d4d68');
    grd.addColorStop(1, '#27445d');
    g.fillStyle = grd;
    g.fillRect(0, 0, 512, 512);
    for (let i = 0; i < 6000; i++) {
      g.fillStyle = `rgba(255,255,255,${Math.random() * 0.025})`;
      g.fillRect(Math.random() * 512, Math.random() * 512, 2, 2);
    }
    g.strokeStyle = 'rgba(200,220,255,0.10)';
    g.lineWidth = 2;
    g.strokeRect(0, 0, 512, 512);
    const tex = new THREE.CanvasTexture(c);
    tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
    tex.repeat.set(36, 36);
    tex.colorSpace = THREE.SRGBColorSpace;
    const mesh = new THREE.Mesh(new THREE.PlaneGeometry(720, 720).rotateX(-Math.PI / 2), new THREE.MeshBasicMaterial({ map: tex }));
    mesh.position.y = -0.05;
    return mesh;
  }

  private shapeFrom(rings: number[][]) {
    const toV = (r: number[]) => {
      const pts: THREE.Vector2[] = [];
      for (let i = 0; i < r.length; i += 2) pts.push(new THREE.Vector2(r[i], mercY(r[i + 1])));
      return pts;
    };
    const shape = new THREE.Shape(toV(rings[0]));
    for (const h of rings.slice(1)) shape.holes.push(new THREE.Path(toV(h)));
    return shape;
  }

  private makeCountries() {
    const geos: THREE.BufferGeometry[] = [];
    const seg: number[] = [];
    const color = new THREE.Color();
    this.data.countries.forEach((c, ci) => {
      color.set(PALETTE[(c.c * 3 + c.a3.charCodeAt(0)) % PALETTE.length]);
      for (const poly of c.polys) {
        const g = new THREE.ShapeGeometry(this.shapeFrom(poly)).rotateX(-Math.PI / 2);
        g.deleteAttribute('uv');
        g.deleteAttribute('normal');
        const n = g.attributes.position.count;
        const cols = new Float32Array(n * 3);
        for (let i = 0; i < n; i++) color.toArray(cols, i * 3);
        g.setAttribute('color', new THREE.BufferAttribute(cols, 3));
        const ng = g.index ? g.toNonIndexed() : g;
        for (let f = 0; f < ng.attributes.position.count / 3; f++) this.faceCountry.push(ci);
        geos.push(ng);
        for (const ring of poly)
          for (let i = 0; i + 3 < ring.length; i += 2)
            seg.push(ring[i], 0.004, -mercY(ring[i + 1]), ring[i + 2], 0.004, -mercY(ring[i + 3]));
      }
    });
    const merged = mergeGeometries(geos)!;
    const mesh = new THREE.Mesh(merged, new THREE.MeshBasicMaterial({ vertexColors: true }));
    const lg = new LineSegmentsGeometry().setPositions(seg);
    const borders = new LineSegments2(lg, this.borderMat);
    borders.renderOrder = 3;
    return { mesh, borders };
  }

  private makeLakes() {
    const geos = this.data.lakes.map((poly) => new THREE.ShapeGeometry(this.shapeFrom(poly)).rotateX(-Math.PI / 2));
    const m = new THREE.Mesh(mergeGeometries(geos)!, new THREE.MeshBasicMaterial({ color: 0x2d4d68 }));
    m.position.y = 0.002;
    return m;
  }

  private makeLines(lines: number[][], color: number, y: number, dashed = false) {
    const pos: number[] = [];
    for (const l of lines) for (let i = 0; i + 3 < l.length; i += 2) pos.push(l[i], y, -mercY(l[i + 1]), l[i + 2], y, -mercY(l[i + 3]));
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    const mat = dashed
      ? new THREE.LineDashedMaterial({ color, dashSize: 0.08, gapSize: 0.05, transparent: true })
      : new THREE.LineBasicMaterial({ color, transparent: true });
    const ls = new THREE.LineSegments(g, mat);
    if (dashed) ls.computeLineDistances();
    ls.renderOrder = 4;
    return ls;
  }

  private makeShipping() {
    const group = new THREE.Group();
    const pos: number[] = [];
    const shipGeo = new THREE.ConeGeometry(0.09, 0.3, 3).rotateX(Math.PI / 2);
    const shipMat = new THREE.MeshBasicMaterial({ color: 0xf2f2e6 });
    for (const route of SHIPPING_ROUTES) {
      const pts = route.map(([lon, lat]) => project(lon, lat).setY(0.006));
      for (let i = 0; i < pts.length - 1; i++) pos.push(...pts[i].toArray(), ...pts[i + 1].toArray());
      const len = [0];
      for (let i = 1; i < pts.length; i++) len.push(len[i - 1] + pts[i].distanceTo(pts[i - 1]));
      for (let k = 0; k < 3; k++) {
        const mesh = new THREE.Mesh(shipGeo, shipMat);
        group.add(mesh);
        this.ships.push({ mesh, path: pts, len, total: len[len.length - 1], speed: 0.4 + Math.random() * 0.2, pos: Math.random() * len[len.length - 1] });
      }
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    const ls = new THREE.LineSegments(g, new THREE.LineDashedMaterial({ color: 0xbfe0ff, dashSize: 0.5, gapSize: 0.35, transparent: true, opacity: 0.55 }));
    ls.computeLineDistances();
    group.add(ls);
    return group;
  }

  private makePorts() {
    const ports = this.data.ports;
    const inst = new THREE.InstancedMesh(new THREE.BoxGeometry(1, 0.01, 1), new THREE.MeshBasicMaterial({ color: 0x3fa7ff }), ports.length);
    const m = new THREE.Matrix4();
    ports.forEach(([, lon, lat, rank], i) => {
      const s = rank <= 4 ? 0.08 : 0.045;
      const p = project(lon, lat);
      m.compose(new THREE.Vector3(p.x, 0.008, p.z), new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), Math.PI / 4), new THREE.Vector3(s, 1, s));
      inst.setMatrixAt(i, m);
    });
    inst.renderOrder = 5;
    return inst;
  }

  private makeCasinos() {
    const inst = new THREE.InstancedMesh(new THREE.OctahedronGeometry(1), new THREE.MeshBasicMaterial({ color: 0xffc83a }), CASINOS.length);
    const m = new THREE.Matrix4();
    CASINOS.forEach((c, i) => {
      const p = project(c.lon, c.lat);
      m.compose(new THREE.Vector3(p.x, 0.05, p.z), new THREE.Quaternion(), new THREE.Vector3(0.05, 0.05, 0.05));
      inst.setMatrixAt(i, m);
    });
    return inst;
  }

  setLayerVisible(name: string, v: boolean) {
    if (this.layers[name]) this.layers[name].userData.userHidden = !v;
  }

  setPlayer(lon: number, lat: number) {
    const p = project(lon, lat);
    this.playerMarker.position.set(p.x, 0.01, p.z);
  }

  highlightCountry(a3: string | null) {
    if (this.highlight) {
      this.scene.remove(this.highlight);
      this.highlight.geometry.dispose();
      this.highlight = undefined;
    }
    const c = this.data.countries.find((x) => x.a3 === a3);
    if (!c) return;
    const seg: number[] = [];
    for (const poly of c.polys)
      for (const ring of poly)
        for (let i = 0; i + 3 < ring.length; i += 2) seg.push(ring[i], 0.006, -mercY(ring[i + 1]), ring[i + 2], 0.006, -mercY(ring[i + 3]));
    this.highlight = new LineSegments2(new LineSegmentsGeometry().setPositions(seg), this.highlightMat);
    this.highlight.renderOrder = 8;
    this.scene.add(this.highlight);
  }

  flyTo(lon: number, lat: number, dist = 12) {
    const p = project(lon, lat);
    const off = this.camera.position.clone().sub(this.controls.target).normalize().multiplyScalar(dist);
    this.controls.target.copy(p);
    this.camera.position.copy(p).add(off);
    this.controls.update();
  }

  /** Bildschirmposition → lon/lat (oder null außerhalb). */
  pick(ndc: THREE.Vector2): { lon: number; lat: number; country: CountryData | null } | null {
    const ray = new THREE.Raycaster();
    ray.setFromCamera(ndc, this.camera);
    const hit = ray.intersectObject(this.countryMeshes)[0];
    const pt = hit?.point ?? ray.ray.intersectPlane(new THREE.Plane(new THREE.Vector3(0, 1, 0), 0), new THREE.Vector3());
    if (!pt) return null;
    const country = hit && hit.faceIndex != null ? this.data.countries[this.faceCountry[hit.faceIndex]] : null;
    return { lon: pt.x, lat: invMercY(-pt.z), country };
  }

  get zoomDistance() {
    return this.camera.position.distanceTo(this.controls.target);
  }

  resize(w: number, h: number) {
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
    this.borderMat.resolution.set(w, h);
    this.highlightMat.resolution.set(w, h);
  }

  update(dtReal: number, gameSpeed: number) {
    this.controls.update();
    const d = this.zoomDistance;
    const near = Math.max(0.02, d * 0.05);
    if (Math.abs(this.camera.near - near) > near * 0.1) {
      this.camera.near = near;
      this.camera.far = d * 20 + 50;
      this.camera.updateProjectionMatrix();
    }
    // Detailebenen je nach Zoom (wie bei Strategiekarten)
    const vis = (name: string, maxDist: number) => {
      const l = this.layers[name];
      if (l) l.visible = !l.userData.userHidden && d < maxDist;
    };
    vis('highways', 45);
    vis('railways', 35);
    vis('ferries', 60);
    vis('ports', 40);
    vis('shipping', 400);
    vis('cities', 90);
    vis('casinos', 60);
    this.borderMat.linewidth = d > 120 ? 1.1 : d > 30 ? 1.6 : 2.4;
    const s = Math.max(0.25, Math.min(6, d / 20));
    this.playerMarker.scale.setScalar(s);
    const cityInst = this.layers.cities as THREE.InstancedMesh | undefined;
    if (cityInst) cityInst.scale.set(1, 1, 1);
    // Schiffe bewegen sich entlang der Routen (Geschwindigkeit angelehnt an Spielzeit, gedeckelt)
    const sp = Math.min(40, 1 + Math.log10(Math.max(1, gameSpeed)) * 8);
    for (const sh of this.ships) {
      sh.pos = (sh.pos + dtReal * sh.speed * sp * 0.2) % sh.total;
      let i = 1;
      while (i < sh.len.length - 1 && sh.len[i] < sh.pos) i++;
      const a = sh.path[i - 1], b = sh.path[i];
      const f = (sh.pos - sh.len[i - 1]) / Math.max(1e-6, sh.len[i] - sh.len[i - 1]);
      sh.mesh.position.lerpVectors(a, b, f);
      sh.mesh.lookAt(b.x, b.y, b.z);
      sh.mesh.scale.setScalar(Math.max(0.4, Math.min(4, d / 25)));
    }
  }
}
