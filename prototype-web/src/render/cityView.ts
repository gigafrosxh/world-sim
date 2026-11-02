// 3D-Stadtansicht (Städtebau-Perspektive): Grundstücke, Straßen, erkennbare Gebäude,
// Baustellen mit Maschinen und Arbeitern, Verkehr, Tag/Nacht und Spielerfigur.
import * as THREE from 'three';
import { MapControls } from 'three/examples/jsm/controls/MapControls.js';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import * as M from './models';
import * as T from './textures';
import { BLOCK, PITCH, type CityLayout, type Plot } from '../sim/cityGen';
import { layoutOf } from '../sim/world';
import { buildingType, type Visual } from '../data/buildings';
import { plotVisual, projectProgress, type GameState, type Project } from '../sim/game';

interface Mover { obj: THREE.Object3D; a: THREE.Vector3; b: THREE.Vector3; t: number; speed: number; dir: number }
interface Worker { obj: THREE.Object3D; base: THREE.Vector3; phase: number; r: number }

export class CityView {
  scene = new THREE.Scene();
  camera = new THREE.PerspectiveCamera(45, 1, 1, 8000);
  controls: MapControls;
  layout!: CityLayout;
  locId = '';
  private sun = new THREE.DirectionalLight(0xffffff, 2.2);
  private hemi = new THREE.HemisphereLight(0xcfe6ff, 0x6a6a5a, 1.1);
  private staticRoot = new THREE.Group();
  private dynamicRoot = new THREE.Group();
  private pickRoot = new THREE.Group();
  private dynSig = new Map<string, string>();
  private dynObjs = new Map<string, THREE.Object3D>();
  private animated: THREE.Object3D[] = [];
  private workers: Worker[] = [];
  private movers: Mover[] = [];
  private selection: THREE.LineSegments;
  private time = 0;
  // Spielerfigur
  avatar: THREE.Group;
  playerMode = false;
  private yaw = 0;
  private keys = new Set<string>();
  onExit?: () => void;

  constructor(dom: HTMLElement) {
    this.controls = new MapControls(this.camera, dom);
    this.controls.maxPolarAngle = 1.32;
    this.controls.minDistance = 12;
    this.controls.maxDistance = 2600;
    this.controls.enableDamping = true;
    this.controls.zoomToCursor = true;
    this.scene.add(this.sun, this.sun.target, this.hemi, this.staticRoot, this.dynamicRoot, this.pickRoot);
    this.sun.castShadow = true;
    this.sun.shadow.mapSize.set(4096, 4096);
    this.sun.shadow.bias = -0.0005;
    this.scene.fog = new THREE.Fog(0xbfd8ea, 1800, 5200);
    this.selection = new THREE.LineSegments(new THREE.BufferGeometry(), new THREE.LineBasicMaterial({ color: 0xffd23f, depthTest: false }));
    this.selection.renderOrder = 20;
    this.scene.add(this.selection);
    this.avatar = M.person('#e0b030');
    this.avatar.visible = false;
    this.scene.add(this.avatar);
    window.addEventListener('keydown', (e) => this.keys.add(e.key.toLowerCase()));
    window.addEventListener('keyup', (e) => this.keys.delete(e.key.toLowerCase()));
    dom.addEventListener('pointermove', (e) => {
      if (this.playerMode && e.buttons) this.yaw -= e.movementX * 0.005;
    });
  }

  load(locId: string, s: GameState) {
    if (this.locId === locId) return;
    this.locId = locId;
    this.layout = layoutOf(locId);
    for (const root of [this.staticRoot, this.dynamicRoot, this.pickRoot]) {
      root.traverse((o) => {
        if (o instanceof THREE.Mesh) o.geometry.dispose();
      });
      root.clear();
    }
    this.dynSig.clear();
    this.dynObjs.clear();
    this.animated = [];
    this.workers = [];
    this.movers = [];
    this.buildStatic(s);
    this.syncDynamic(s);
    const h = this.layout.half;
    this.camera.position.set(h * 0.6, h * 0.9, h * 1.3);
    this.controls.target.set(0, 0, 0);
    this.controls.update();
    this.sun.shadow.camera.left = this.sun.shadow.camera.bottom = -h - 200;
    this.sun.shadow.camera.right = this.sun.shadow.camera.top = h + 200;
    this.sun.shadow.camera.far = 5000;
    this.sun.shadow.camera.updateProjectionMatrix();
    this.selectPlot(null);
  }

  /** Grundstück, das ein Spielerobjekt trägt oder eine Baustelle ist, wird dynamisch gezeichnet. */
  private isDynamic(s: GameState, p: Plot) {
    return !!s.plots[p.id] || s.projects.some((x) => x.plotId === p.id);
  }

  private buildStatic(s: GameState) {
    const L = this.layout;
    const tmp = new THREE.Group();
    // Boden
    const grassMat = M.mat('grass', () => {
      const t = T.grass().clone();
      t.repeat.set(200, 200);
      t.needsUpdate = true;
      return new THREE.MeshStandardMaterial({ map: t, roughness: 1 });
    });
    const ground = new THREE.Mesh(new THREE.PlaneGeometry(9000, 9000).rotateX(-Math.PI / 2), grassMat);
    ground.receiveShadow = true;
    ground.position.y = -0.05;
    this.staticRoot.add(ground);

    // Straßen
    const streetMat = (len: number, lanes: boolean) => {
      const t = T.asphalt(lanes).clone();
      t.repeat.set(len / 16, 1);
      t.needsUpdate = true;
      return new THREE.MeshStandardMaterial({ map: t, roughness: 0.95 });
    };
    for (const r of L.roads) {
      const len = Math.hypot(r.x2 - r.x1, r.z2 - r.z1);
      const m = new THREE.Mesh(new THREE.PlaneGeometry(len, r.w).rotateX(-Math.PI / 2), streetMat(len, r.kind === 'highway'));
      m.rotation.y = -Math.atan2(r.z2 - r.z1, r.x2 - r.x1);
      m.position.set((r.x1 + r.x2) / 2, r.kind === 'highway' ? 0.06 : 0.03, (r.z1 + r.z2) / 2);
      m.receiveShadow = true;
      this.staticRoot.add(m);
      if (r.kind === 'highway') {
        // Leitschienen
        for (const off of [-r.w / 2, 0, r.w / 2]) {
          const g = M.box(len, 0.8, 0.3, M.solid('#b8bcc0', { metalness: 0.5 }), 0, 0, 0);
          g.position.set((r.x1 + r.x2) / 2, 0, (r.z1 + r.z2) / 2 + off);
          this.staticRoot.add(g);
        }
      }
    }
    // Bahn
    const railLen = L.rail.x2 - L.rail.x1;
    const railMat = (() => {
      const t = T.railTex().clone();
      t.repeat.set(railLen / 6, 1);
      t.needsUpdate = true;
      return new THREE.MeshStandardMaterial({ map: t });
    })();
    const rail = new THREE.Mesh(new THREE.PlaneGeometry(railLen, 6).rotateX(-Math.PI / 2), railMat);
    rail.position.set((L.rail.x1 + L.rail.x2) / 2, 0.05, L.rail.z);
    this.staticRoot.add(rail);
    // Bahnhof
    const station = M.box(60, 6, 12, M.solid('#c9b79c'), 0, 0, L.rail.z - 14);
    tmp.add(station);
    tmp.add(M.box(70, 0.8, 6, M.solid('#9a9a9a'), 0, 0, L.rail.z - 5.5));

    // Blöcke: Gehsteig + Bäume entlang der Straßen
    const n = L.n, c = (n - 1) / 2;
    for (let i = 0; i < n; i++)
      for (let j = 0; j < n; j++) {
        const sw = new THREE.Mesh(new THREE.PlaneGeometry(BLOCK + 4, BLOCK + 4).rotateX(-Math.PI / 2), M.mat('paving', () => {
          const t = T.paving().clone();
          t.repeat.set(30, 30);
          t.needsUpdate = true;
          return new THREE.MeshStandardMaterial({ map: t });
        }));
        sw.position.set((i - c) * PITCH, 0.02, (j - c) * PITCH);
        sw.receiveShadow = true;
        this.staticRoot.add(sw);
      }

    for (const p of L.plots) {
      // Grundstücksboden
      const groundMat = p.zone === 'industrial' ? M.mat('conc', () => new THREE.MeshStandardMaterial({ map: T.concrete() })) : p.zone === 'commercial' ? M.mat('paving2', () => new THREE.MeshStandardMaterial({ map: T.paving() })) : grassMat;
      const tile = new THREE.Mesh(new THREE.PlaneGeometry(p.w, p.d).rotateX(-Math.PI / 2), groundMat);
      tile.position.set(p.x, 0.04, p.z);
      tile.receiveShadow = true;
      this.staticRoot.add(tile);
      const pick = new THREE.Mesh(new THREE.BoxGeometry(p.w, 1, p.d), new THREE.MeshBasicMaterial({ visible: false }));
      pick.position.set(p.x, 0.5, p.z);
      pick.userData.plotIdx = p.idx;
      this.pickRoot.add(pick);
      if (this.isDynamic(s, p)) continue;
      const obj = this.plotObject(p, p.npc, s);
      if (obj) tmp.add(obj);
    }
    // Statische Objekte zusammenführen (weniger Draw-Calls)
    this.staticRoot.add(...mergeStatic(tmp));
    this.spawnTraffic();
  }

  /** Erzeugt das Modell für ein Grundstück (ohne Baustelle). */
  private plotObject(p: Plot, visual: Visual | null, s: GameState, owner?: { name?: string; color?: string }) {
    const g = new THREE.Group();
    const rotated = p.facing === 1 || p.facing === 3;
    const w = rotated ? p.d : p.w, d = rotated ? p.w : p.d;
    let model: THREE.Object3D | null = null;
    switch (visual) {
      case 'house': model = M.house(Math.min(12, w - 8), Math.min(10, d - 12), p.floors, p.hue); break;
      case 'tinyhouse': model = M.tinyHouse(9, 4.5); break;
      case 'apartment': model = M.apartment(w - 10, Math.min(18, d - 14), p.floors, p.hue); break;
      case 'office': model = M.office(w - 12, d - 16, p.floors); break;
      case 'tower': model = M.tower(Math.min(28, w - 16), Math.min(28, d - 16), p.floors); break;
      case 'shop': model = M.shop(w, d, p.shop?.name ?? 'Geschäft', p.shop?.kind ?? ''); break;
      case 'casino': model = M.casino(w, d, p.casino ?? 'Casino'); break;
      case 'factory': model = M.factory(w, d, owner?.color); break;
      case 'warehouse': model = M.warehouse(w, d); break;
      case 'workshop': model = M.workshop(w, d, owner?.name, owner?.color); break;
      case 'container': model = M.containerWorkshop(owner?.color, owner?.name); break;
      default: break;
    }
    if (p.zone === 'park') model = M.park(p.w, p.d, p.idx + 1);
    if (model) {
      model.rotation.y = p.zone === 'park' ? 0 : [Math.PI, Math.PI / 2, 0, -Math.PI / 2][p.facing];
      g.add(model);
    }
    if (p.zone === 'residential' && visual === 'house') {
      for (const k of [-1, 1]) {
        const t = M.tree(0.9, (p.idx + k) % 2);
        t.position.set(k * (p.w / 2 - 3), 0, (p.facing === 0 ? 1 : -1) * (p.d / 2 - 4));
        g.add(t);
      }
    }
    const mine = s.plots[p.id];
    if (!mine && (p.forSale || p.forRent)) {
      const sign = M.plotSign(p.forRent ? 'ZU VERMIETEN' : 'ZU VERKAUFEN', p.forRent ? '#2e7d32' : '#c62828');
      const fz = [-1, 0, 1, 0][p.facing], fx = [0, 1, 0, -1][p.facing];
      sign.position.set(fx * (p.w / 2 - 2), 0, fz * (p.d / 2 - 2));
      sign.rotation.y = [Math.PI, Math.PI / 2, 0, -Math.PI / 2][p.facing];
      g.add(sign);
    }
    g.position.set(p.x, 0.05, p.z);
    return g;
  }

  /** Aktualisiert Spielerobjekte und Baustellen, wenn sich etwas geändert hat. */
  syncDynamic(s: GameState) {
    if (!this.layout) return;
    const seen = new Set<string>();
    for (const p of this.layout.plots) {
      if (!this.isDynamic(s, p)) continue;
      seen.add(p.id);
      const vis = plotVisual(s, p.id, p);
      const proj = vis.project;
      const sig = proj ? `${proj.typeId}|${proj.state}|${proj.phase}|${Math.floor(projectProgress(proj) * 40)}|${proj.crew}` : `${vis.visual}|${vis.mine}|${s.company?.name}`;
      if (this.dynSig.get(p.id) === sig) continue;
      this.dynSig.set(p.id, sig);
      const old = this.dynObjs.get(p.id);
      if (old) {
        this.dynamicRoot.remove(old);
        this.animated = this.animated.filter((a) => !isDescendant(a, old));
        this.workers = this.workers.filter((w) => !isDescendant(w.obj, old));
      }
      const g = new THREE.Group();
      const owner = vis.mine === 'company' ? { name: s.company?.name, color: s.company?.color } : { color: '#e0b030' };
      if (proj) g.add(this.constructionSite(p, proj, s, owner));
      else {
        const o = this.plotObject(p, vis.visual, s, owner);
        if (o) g.add(o);
      }
      // Umrandung in Besitzerfarbe
      const outline = new THREE.LineSegments(new THREE.EdgesGeometry(new THREE.BoxGeometry(p.w, 0.01, p.d)), new THREE.LineBasicMaterial({ color: vis.mine === 'company' ? s.company?.color ?? '#3a6ea5' : '#e0b030' }));
      outline.position.set(p.x, 0.15, p.z);
      g.add(outline);
      g.traverse((o) => {
        if (o instanceof THREE.Mesh) o.castShadow = o.receiveShadow = true;
      });
      this.dynamicRoot.add(g);
      this.dynObjs.set(p.id, g);
    }
    for (const [id, obj] of this.dynObjs) if (!seen.has(id)) {
      this.dynamicRoot.remove(obj);
      this.dynObjs.delete(id);
      this.dynSig.delete(id);
    }
  }

  private constructionSite(p: Plot, proj: Project, s: GameState, owner: { name?: string; color?: string }) {
    const g = new THREE.Group();
    const b = buildingType(proj.typeId);
    const rotated = p.facing === 1 || p.facing === 3;
    const bw = rotated ? b.d : b.w, bd = rotated ? b.w : b.d;
    g.position.set(p.x, 0.05, p.z);
    // Bauzaun
    const fence = M.solid('#d0d4d8', { transparent: true, opacity: 0.85 });
    g.add(M.box(p.w - 2, 2, 0.1, fence, 0, 0, -p.d / 2 + 1), M.box(p.w - 2, 2, 0.1, fence, 0, 0, p.d / 2 - 1), M.box(0.1, 2, p.d - 2, fence, -p.w / 2 + 1, 0, 0), M.box(0.1, 2, p.d - 2, fence, p.w / 2 - 1, 0, 0));
    // Baustellenschild
    const label = proj.state === 'permit' ? 'BAUANSUCHEN LÄUFT' : `BAUSTELLE: ${b.phases[proj.phase]?.name.toUpperCase() ?? ''}`;
    const sign = M.plotSign(label, '#f2b705');
    sign.position.set(-p.w / 2 + 4, 0, p.d / 2 - 1.5);
    g.add(sign);
    if (proj.state === 'permit') return g;

    const phases = b.phases;
    const total = phases.reduce((a, ph) => a + ph.work, 0);
    void total;
    const within = Math.min(1, proj.phaseWork / (phases[proj.phase].work * b.workHours));
    const machines = new Set(phases[proj.phase].machines);
    const isModule = phases.length === 3;
    const ph = proj.phase;
    // Baugrube / Fundament
    if (!isModule && ph === 0) {
      const pit = M.box(bw + 2, 0.3, bd + 2, M.solid('#6b4f35'), 0, -0.2, 0);
      g.add(pit);
      for (let i = 0; i < 4; i++) {
        const heap = new THREE.Mesh(new THREE.ConeGeometry(2.4, 2, 6), M.solid('#7a5a3c', { flatShading: true }));
        heap.position.set(bw / 2 + 4, 1, -bd / 2 + i * 4);
        g.add(heap);
      }
    }
    if (isModule ? ph >= 0 : ph >= 1) {
      const slabProgress = !isModule && ph === 1 ? within : 1;
      g.add(M.box((bw + 1) * slabProgress, 0.5, bd + 1, M.solid('#9c9c96'), -(bw + 1) * (1 - slabProgress) / 2, 0, 0));
    }
    // Rohbau wächst
    const finalVisual = b.visual;
    const shellH = b.h;
    if (!isModule && ph >= 2) {
      const f = ph === 2 ? Math.max(0.05, within) : 1;
      if (ph <= 3) {
        const shell = M.box(bw, shellH * f, bd, M.solid('#b3aea4'), 0, 0.5, 0);
        g.add(shell);
        if (ph === 3) {
          const roof = M.box(bw * Math.max(0.1, within), 0.4, bd, M.solid('#6d7680'), -(bw * (1 - within)) / 2, shellH + 0.5, 0);
          g.add(roof);
        }
      } else {
        const fakePlot = { ...p, x: 0, z: 0 } as Plot;
        const o = this.plotObject(fakePlot, finalVisual, s, owner);
        if (o) {
          o.position.set(0, 0, 0);
          g.add(o);
        }
      }
      // Gerüst
      if (ph >= 2 && ph <= 4) g.add(scaffold(bw + 2, shellH * (ph === 2 ? Math.max(0.1, within) : 1) + 1, bd + 2));
    }
    if (isModule && ph >= 1) {
      const f = ph === 1 ? within : 1;
      const fakePlot = { ...p, x: 0, z: 0 } as Plot;
      const o = this.plotObject(fakePlot, finalVisual, s, owner);
      if (o) {
        o.scale.y = Math.max(0.05, f);
        g.add(o);
      }
    }
    // Maschinen
    const place = (obj: THREE.Object3D, x: number, z: number, ry = 0) => {
      obj.position.set(x, 0, z);
      obj.rotation.y = ry;
      g.add(obj);
      if (obj.userData.anim) this.animated.push(obj);
    };
    if (machines.has('bagger')) place(M.excavator(), -bw / 2 - 3, 0, 0.3);
    if (machines.has('lkw')) place(M.dumpTruck(), bw / 2 + 2, p.d / 2 - 8, Math.PI / 2);
    if (machines.has('fahrmischer')) place(M.mixerTruck(), 0, bd / 2 + 6);
    if (machines.has('turmkran')) place(M.towerCrane(shellH + 18, Math.max(24, bw * 0.9)), -bw / 2 - 4, -bd / 2 - 4);
    if (machines.has('mobilkran')) place(M.towerCrane(12, 16), bw / 2 + 4, bd / 2 + 4);
    // Arbeiter
    const n = Math.min(14, proj.crew);
    for (let i = 0; i < n; i++) {
      const w = M.person(i % 3 ? '#f57c00' : '#1565c0', true);
      const base = new THREE.Vector3((Math.random() - 0.5) * (bw + 4), 0, (Math.random() - 0.5) * (bd + 4));
      w.position.copy(base);
      g.add(w);
      this.workers.push({ obj: w, base, phase: Math.random() * 10, r: 2 + Math.random() * 4 });
    }
    return g;
  }

  private spawnTraffic() {
    const L = this.layout;
    const colors = ['#c0392b', '#2c3e50', '#ecf0f1', '#7f8c8d', '#2980b9', '#27ae60', '#f1c40f', '#8e44ad'];
    const streets = L.roads.filter((r) => r.kind === 'street');
    const count = Math.min(80, 10 + L.n * 6);
    for (let i = 0; i < count; i++) {
      const r = streets[i % streets.length];
      const c = i % 7 === 0 ? M.truck(colors[i % colors.length]) : M.car(colors[i % colors.length]);
      const dir = i % 2 ? 1 : -1;
      const horiz = r.z1 === r.z2;
      const off = dir * 3;
      const a = new THREE.Vector3(r.x1 + (horiz ? 0 : off), 0.05, r.z1 + (horiz ? off : 0));
      const b = new THREE.Vector3(r.x2 + (horiz ? 0 : off), 0.05, r.z2 + (horiz ? off : 0));
      this.staticRoot.add(c);
      this.movers.push({ obj: c, a, b, t: Math.random(), speed: 9 + Math.random() * 6, dir });
    }
    const hw = L.roads.find((r) => r.kind === 'highway')!;
    for (let i = 0; i < 24; i++) {
      const dir = i % 2 ? 1 : -1;
      const c = i % 3 === 0 ? M.truck(colors[(i * 3) % colors.length]) : M.car(colors[i % colors.length]);
      const off = dir * (3 + (i % 4 < 2 ? 0 : 3.5));
      this.staticRoot.add(c);
      this.movers.push({ obj: c, a: new THREE.Vector3(hw.x1, 0.1, hw.z1 + off), b: new THREE.Vector3(hw.x2, 0.1, hw.z2 + off), t: Math.random(), speed: 25 + Math.random() * 8, dir });
    }
    // Zug
    const train = new THREE.Group();
    train.add(M.box(16, 4, 3, M.solid('#c62828'), 0, 0.6, 0));
    for (let k = 1; k <= 8; k++) train.add(M.box(14, 3.4, 2.9, M.solid(k % 2 ? '#607d8b' : '#8d6e63'), -k * 15, 0.6, 0));
    this.staticRoot.add(train);
    this.movers.push({ obj: train, a: new THREE.Vector3(L.rail.x1, 0, L.rail.z), b: new THREE.Vector3(L.rail.x2 + 140, 0, L.rail.z), t: 0, speed: 22, dir: 1 });
  }

  selectPlot(p: Plot | null) {
    if (!p) {
      this.selection.visible = false;
      return;
    }
    this.selection.geometry.dispose();
    this.selection.geometry = new THREE.EdgesGeometry(new THREE.BoxGeometry(p.w + 1, 6, p.d + 1));
    this.selection.position.set(p.x, 3, p.z);
    this.selection.visible = true;
  }

  pick(ndc: THREE.Vector2): Plot | null {
    const ray = new THREE.Raycaster();
    ray.setFromCamera(ndc, this.camera);
    const hit = ray.intersectObjects(this.pickRoot.children)[0];
    if (!hit) return null;
    return this.layout.plots[hit.object.userData.plotIdx];
  }

  focusPlot(plotIdx: number) {
    const p = this.layout.plots[plotIdx];
    const off = this.camera.position.clone().sub(this.controls.target);
    off.setLength(Math.min(off.length(), 160));
    this.controls.target.set(p.x, 0, p.z);
    this.camera.position.set(p.x, 0, p.z).add(off);
  }

  setPlayerMode(on: boolean, color: string) {
    this.playerMode = on;
    this.controls.enabled = !on;
    this.avatar.visible = on;
    if (on) {
      this.avatar.traverse((o) => {
        if (o instanceof THREE.Mesh && o.position.y > 0.8 && o.position.y < 1.2) o.material = M.solid(color);
      });
      this.avatar.position.set(this.controls.target.x, 0, this.controls.target.z + 8);
      this.yaw = Math.PI;
    } else {
      this.controls.target.copy(this.avatar.position);
      this.camera.position.copy(this.avatar.position).add(new THREE.Vector3(40, 60, 60));
    }
  }

  resize(w: number, h: number) {
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
  }

  /** hour: Ortszeit 0..24 */
  update(dt: number, hour: number, gameSpeed: number) {
    this.time += dt;
    // Tag/Nacht
    const day = Math.max(0, Math.sin(((hour - 6) / 12) * Math.PI));
    const ang = ((hour - 6) / 12) * Math.PI;
    this.sun.position.set(Math.cos(ang) * 800, 200 + day * 900, 400);
    this.sun.intensity = 0.15 + day * 2.3;
    this.hemi.intensity = 0.25 + day * 1.0;
    const sky = new THREE.Color('#0f1a2e').lerp(new THREE.Color(hour > 5 && hour < 8 ? '#f4c7a1' : hour > 17 && hour < 20 ? '#f0b48a' : '#a9cdea'), Math.min(1, day * 2));
    this.scene.background = sky;
    (this.scene.fog as THREE.Fog).color.copy(sky);
    const night = 1 - Math.min(1, day * 3);
    for (const m of M.nightMaterials) m.emissiveIntensity = night * 0.9;

    for (const a of this.animated) a.userData.anim?.(this.time);
    for (const w of this.workers) {
      const t = this.time * 0.4 + w.phase;
      w.obj.position.set(w.base.x + Math.sin(t) * w.r, 0, w.base.z + Math.cos(t * 0.7) * w.r * 0.6);
      w.obj.rotation.y = Math.atan2(Math.cos(t), -Math.sin(t * 0.7) * 0.6);
      M.animatePerson(w.obj, this.time + w.phase, true);
    }
    const trafficFactor = (hour >= 6 && hour <= 21 ? 1 : 0.35) * Math.min(3, 1 + Math.log10(Math.max(1, gameSpeed)) * 0.5);
    for (const m of this.movers) {
      const len = m.a.distanceTo(m.b);
      m.t += (dt * m.speed * trafficFactor) / len * m.dir;
      if (m.t > 1) m.t -= 1;
      if (m.t < 0) m.t += 1;
      m.obj.position.lerpVectors(m.a, m.b, m.t);
      const dx = (m.b.x - m.a.x) * m.dir, dz = (m.b.z - m.a.z) * m.dir;
      m.obj.rotation.y = Math.atan2(-dz, dx);
    }

    if (this.playerMode) this.updatePlayer(dt);
    else {
      this.controls.update();
      if (this.camera.position.distanceTo(this.controls.target) > 2500) this.onExit?.();
    }
  }

  private updatePlayer(dt: number) {
    const k = this.keys;
    const run = k.has('shift') ? 9 : 4.5;
    let f = 0, r = 0;
    if (k.has('w') || k.has('arrowup')) f += 1;
    if (k.has('s') || k.has('arrowdown')) f -= 1;
    if (k.has('a') || k.has('arrowleft')) r -= 1;
    if (k.has('d') || k.has('arrowright')) r += 1;
    if (k.has('q')) this.yaw += dt * 1.8;
    if (k.has('e')) this.yaw -= dt * 1.8;
    const fwd = new THREE.Vector3(Math.sin(this.yaw), 0, Math.cos(this.yaw));
    const right = new THREE.Vector3(-fwd.z, 0, fwd.x);
    const move = fwd.multiplyScalar(f).add(right.multiplyScalar(r));
    const moving = move.lengthSq() > 0;
    if (moving) {
      move.normalize().multiplyScalar(run * dt);
      this.avatar.position.add(move);
      const lim = this.layout.half + 300;
      this.avatar.position.x = Math.max(-lim, Math.min(lim, this.avatar.position.x));
      this.avatar.position.z = Math.max(-lim, Math.min(lim, this.avatar.position.z));
      this.avatar.rotation.y = Math.atan2(move.x, move.z);
    }
    M.animatePerson(this.avatar, this.time, moving);
    const cam = this.avatar.position.clone().add(new THREE.Vector3(-Math.sin(this.yaw) * 7, 3.6, -Math.cos(this.yaw) * 7));
    this.camera.position.lerp(cam, Math.min(1, dt * 6));
    this.camera.lookAt(this.avatar.position.clone().add(new THREE.Vector3(0, 1.6, 0)));
  }
}

function isDescendant(o: THREE.Object3D, root: THREE.Object3D) {
  let p: THREE.Object3D | null = o;
  while (p) {
    if (p === root) return true;
    p = p.parent;
  }
  return false;
}

function scaffold(w: number, h: number, d: number) {
  const g = new THREE.Group();
  const m = M.solid('#c0c4c8', { metalness: 0.5 });
  const plank = M.solid('#b08850');
  for (const [sx, sz, len, alongX] of [[0, -d / 2, w, true], [0, d / 2, w, true], [-w / 2, 0, d, false], [w / 2, 0, d, false]] as [number, number, number, boolean][]) {
    for (let k = 0; k <= Math.floor(len / 3); k++) {
      const off = -len / 2 + k * 3;
      g.add(M.box(0.12, h, 0.12, m, alongX ? off : sx, 0, alongX ? sz : off));
    }
    for (let y = 2; y < h; y += 2) g.add(M.box(alongX ? len : 0.8, 0.08, alongX ? 0.8 : len, plank, sx, y, sz));
  }
  return g;
}

/** Fasst statische Meshes nach Material zusammen. */
function mergeStatic(root: THREE.Group): THREE.Object3D[] {
  root.updateMatrixWorld(true);
  const buckets = new Map<THREE.Material, THREE.BufferGeometry[]>();
  root.traverse((o) => {
    if (!(o instanceof THREE.Mesh) || Array.isArray(o.material)) return;
    let g = (o.geometry as THREE.BufferGeometry).clone();
    if (g.index) g = g.toNonIndexed();
    for (const name of Object.keys(g.attributes)) if (!['position', 'normal', 'uv'].includes(name)) g.deleteAttribute(name);
    if (!g.attributes.normal) g.computeVertexNormals();
    if (!g.attributes.uv) g.setAttribute('uv', new THREE.BufferAttribute(new Float32Array(g.attributes.position.count * 2), 2));
    g.applyMatrix4(o.matrixWorld);
    const list = buckets.get(o.material) ?? [];
    list.push(g);
    buckets.set(o.material, list);
  });
  const out: THREE.Object3D[] = [];
  for (const [material, geos] of buckets) {
    const merged = mergeGeometries(geos);
    if (!merged) continue;
    const mesh = new THREE.Mesh(merged, material);
    mesh.castShadow = mesh.receiveShadow = true;
    out.push(mesh);
    geos.forEach((g) => g.dispose());
  }
  return out;
}
