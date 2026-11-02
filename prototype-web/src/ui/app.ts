// Bedienoberfläche und Spielschleife.
import * as THREE from 'three';
import * as G from '../sim/game';
import { casinoHere, spin, RED, type Bet } from '../sim/casino';
import { allLocations, countryName, econOf, getLocation, layoutOf } from '../sim/world';
import { WorldMap, project } from '../render/worldMap';
import { CityView } from '../render/cityView';
import { BUILDING_TYPES, buildingType, estimateWorkDays } from '../data/buildings';
import { INDUSTRIES, industry } from '../data/industries';
import { CASINOS, SHOP_ITEMS, SHOP_LABEL } from '../data/places';
import { COUNTRY_ECON } from '../data/countries';
import type { Plot } from '../sim/cityGen';
import type { Location } from '../sim/geo';
import { distanceKm } from '../sim/geo';

const $ = (id: string) => document.getElementById(id)!;
const esc = (s: string) => s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!);
const SPEED_LABEL = ['1×', '2×', '5×', '10×', '100×', '1.000×', '10.000×'];
type Tab = 'start' | 'firma' | 'bau' | 'finanzen' | 'privat' | 'casino' | null;

export class App {
  s: G.GameState | null = null;
  renderer: THREE.WebGLRenderer;
  world: WorldMap;
  city: CityView;
  mode: 'world' | 'city' = 'world';
  tab: Tab = 'start';
  selected: { kind: 'plot'; plot: Plot } | { kind: 'city'; loc: Location } | { kind: 'country'; a3: string; name: string } | null = null;
  private labelPool: HTMLDivElement[] = [];
  private lastUi = 0;
  private lastSave = 0;
  private lastClock = performance.now();
  private roulette: { result?: number; win?: number; spinning?: boolean } = {};
  private stake = 50;
  /** „Vorspulen bis zum nächsten Ereignis": Zielzeit (Spielsekunden) oder 0. */
  skipUntil = 0;
  private pointerDown = false;

  constructor(world: WorldMap) {
    this.world = world;
    const view = $('view');
    this.renderer = new THREE.WebGLRenderer({ antialias: true });
    this.renderer.setPixelRatio(Math.min(2, window.devicePixelRatio));
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFShadowMap;
    view.appendChild(this.renderer.domElement);
    const canvas = this.renderer.domElement;
    this.city = new CityView(view);
    this.city.controls.enabled = false;
    this.city.onExit = () => this.showWorld();
    window.addEventListener('resize', () => this.resize());
    window.addEventListener('pointerdown', () => (this.pointerDown = true), true);
    window.addEventListener('pointerup', () => setTimeout(() => (this.pointerDown = false), 50), true);
    this.resize();
    this.setupPicking(canvas);
    this.setupKeys();
    document.addEventListener('visibilitychange', () => this.s && G.saveLocal(this.s));
    requestAnimationFrame(this.frame);
  }

  resize() {
    const w = window.innerWidth, h = window.innerHeight;
    this.renderer.setSize(w, h);
    this.world.resize(w, h);
    this.city.resize(w, h);
  }

  // ---------- Eingabe ----------
  private setupPicking(canvas: HTMLCanvasElement) {
    let down = { x: 0, y: 0 };
    canvas.addEventListener('pointerdown', (e) => (down = { x: e.clientX, y: e.clientY }));
    canvas.addEventListener('pointerup', (e) => {
      if (Math.hypot(e.clientX - down.x, e.clientY - down.y) > 5 || e.button !== 0) return;
      const ndc = new THREE.Vector2((e.clientX / window.innerWidth) * 2 - 1, -(e.clientY / window.innerHeight) * 2 + 1);
      if (this.mode === 'city') {
        if (this.city.playerMode) return;
        const p = this.city.pick(ndc);
        this.selected = p ? { kind: 'plot', plot: p } : null;
        this.city.selectPlot(p);
      } else {
        const hit = this.world.pick(ndc);
        if (!hit) return;
        const near = this.nearestCity(e.clientX, e.clientY);
        if (near) this.selected = { kind: 'city', loc: near };
        else if (hit.country) {
          this.selected = { kind: 'country', a3: hit.country.a3, name: hit.country.nde };
          if (!this.s) this.startCountry = hit.country.a3;
        } else this.selected = null;
        if (!this.s) this.renderStart();
      }
      this.renderContext();
    });
    canvas.addEventListener('dblclick', () => {
      if (this.mode === 'world' && this.selected?.kind === 'city') this.showCity(this.selected.loc.id);
    });
  }

  private nearestCity(x: number, y: number): Location | null {
    let best: Location | null = null, bd = 14;
    const d = this.world.zoomDistance;
    for (const l of allLocations()) {
      if (d > 30 && l.pop < 1000000 && !l.cap) continue;
      const p = this.toScreen(project(l.lon, l.lat), this.world.camera);
      if (!p) continue;
      const dist = Math.hypot(p.x - x, p.y - y);
      if (dist < bd) {
        bd = dist;
        best = l;
      }
    }
    return best;
  }

  private setupKeys() {
    window.addEventListener('keydown', (e) => {
      if (!this.s || (e.target as HTMLElement).tagName === 'INPUT') return;
      if (e.code === 'Space') {
        e.preventDefault();
        this.s.paused = !this.s.paused;
        this.renderTop();
      }
      const n = parseInt(e.key);
      if (n >= 1 && n <= 7 && !this.city.playerMode) this.setSpeed(G.SPEEDS[n - 1]);
      if (e.key === 'f' || e.key === 'F') this.togglePlayer();
      if (e.key === 'n' || e.key === 'N') this.skip();
      if (e.key === 'Escape') {
        if (this.city.playerMode) this.togglePlayer();
        else {
          this.selected = null;
          this.city.selectPlot(null);
          this.renderContext();
        }
      }
    });
  }

  skip() {
    if (!this.s) return;
    this.skipUntil = this.skipUntil ? 0 : this.s.t + 90 * G.DAY;
    this.renderTop();
  }

  setSpeed(v: number) {
    if (!this.s) return;
    this.skipUntil = 0;
    this.s.speed = v;
    this.s.paused = false;
    this.renderTop();
  }

  // ---------- Ansichten ----------
  showCity(locId: string) {
    if (!this.s) return;
    this.city.load(locId, this.s);
    this.mode = 'city';
    this.world.controls.enabled = false;
    this.city.controls.enabled = !this.city.playerMode;
    this.selected = null;
    this.renderAll();
  }
  showWorld() {
    if (this.city.playerMode) this.togglePlayer();
    this.mode = 'world';
    this.world.controls.enabled = true;
    this.city.controls.enabled = false;
    if (this.city.locId) {
      const l = getLocation(this.city.locId);
      this.world.flyTo(l.lon, l.lat, 6);
    }
    this.selected = null;
    this.renderAll();
  }
  togglePlayer() {
    if (!this.s || this.mode !== 'city') return;
    if (!this.city.playerMode && this.s.player.locId !== this.city.locId) {
      this.toast('Du bist gerade nicht in dieser Stadt. Reise zuerst hierher.', 'bad');
      return;
    }
    this.city.setPlayerMode(!this.city.playerMode, this.s.player.color);
    this.renderTop();
  }

  // ---------- Spielschleife ----------
  private frame = (now: number) => {
    requestAnimationFrame(this.frame);
    const dt = Math.min(0.1, (now - this.lastClock) / 1000);
    this.lastClock = now;
    const s = this.s;
    if (s) this.flushNotices();
    if (s && this.skipUntil) {
      // Bis zu 3 Spieltage pro Bild; stoppt beim ersten Ereignis
      const end = Math.min(this.skipUntil, s.t + 3 * G.DAY);
      while (s.t < end && !s.notices.length) G.advance(s, 600);
      if (s.notices.length || s.t >= this.skipUntil) {
        this.skipUntil = 0;
        s.paused = true;
        this.renderTop();
      }
    } else if (s && !s.paused) {
      try {
        G.advance(s, dt * s.speed);
      } catch (e) {
        console.error(e);
        s.paused = true;
      }
    }
    if (s) {
      this.flushNotices();
      const loc = getLocation(s.player.locId);
      this.world.setPlayer(loc.lon, loc.lat);
    }
    if (this.mode === 'world') {
      this.world.update(dt, s?.speed ?? 1);
      this.renderer.render(this.world.scene, this.world.camera);
      this.updateLabels();
      if (s && this.world.zoomDistance < 0.9) {
        const t = this.world.controls.target;
        const near = allLocations().reduce<{ l: Location | null; d: number }>((acc, l) => {
          const p = project(l.lon, l.lat);
          const d = Math.hypot(p.x - t.x, p.z - t.z);
          return d < acc.d ? { l, d } : acc;
        }, { l: null, d: 0.6 });
        if (near.l) {
          this.world.flyTo(near.l.lon, near.l.lat, 3);
          this.showCity(near.l.id);
        }
      }
    } else {
      if (s && now - this.lastUi > 250) this.city.syncDynamic(s);
      const hour = s ? (() => { const d = this.localDateForCity(s); return d.getUTCHours() + d.getUTCMinutes() / 60; })() : 12;
      this.city.update(dt, hour, s && !s.paused ? s.speed : 0);
      this.renderer.render(this.city.scene, this.city.camera);
      this.clearLabels();
    }
    if (s && now - this.lastUi > 500) {
      this.lastUi = now;
      this.renderTop();
      if (!this.pointerDown && !this.hasFocus('#panel')) this.renderPanel();
      if (!this.pointerDown && !this.hasFocus('#context')) this.renderContext();
    }
    if (s && now - this.lastSave > 30000) {
      this.lastSave = now;
      G.saveLocal(s);
    }
  };

  private localDateForCity(s: G.GameState) {
    const lon = getLocation(this.city.locId || s.player.locId).lon;
    return new Date((s.t + Math.round(lon / 15) * 3600) * 1000);
  }

  private hasFocus(sel: string) {
    const a = document.activeElement;
    return !!a && !!a.closest(sel) && (a.tagName === 'INPUT' || a.tagName === 'SELECT');
  }

  private toScreen(v: THREE.Vector3, cam: THREE.Camera) {
    const p = v.clone().project(cam);
    if (p.z > 1 || p.x < -1.1 || p.x > 1.1 || p.y < -1.1 || p.y > 1.1) return null;
    return { x: ((p.x + 1) / 2) * window.innerWidth, y: ((1 - p.y) / 2) * window.innerHeight };
  }

  // ---------- Kartenbeschriftung ----------
  private clearLabels() {
    for (const l of this.labelPool) l.style.display = 'none';
  }
  private updateLabels() {
    const d = this.world.zoomDistance;
    const cam = this.world.camera;
    let i = 0;
    const take = () => {
      let el = this.labelPool[i];
      if (!el) {
        el = document.createElement('div');
        el.addEventListener('click', () => {
          const id = el.dataset.loc;
          if (!id) return;
          this.selected = { kind: 'city', loc: getLocation(id) };
          this.renderContext();
        });
        el.addEventListener('dblclick', () => el.dataset.loc && this.showCity(el.dataset.loc));
        $('labels').appendChild(el);
        this.labelPool.push(el);
      }
      i++;
      el.style.display = '';
      return el;
    };
    if (d > 18) {
      for (const c of this.world.data.countries) {
        if (c.pop < (d > 120 ? 30e6 : d > 60 ? 8e6 : 1e6)) continue;
        const p = this.toScreen(project(c.lx, c.ly), cam);
        if (!p) continue;
        const el = take();
        el.className = 'lbl country';
        el.dataset.loc = '';
        el.textContent = c.nde;
        el.style.fontSize = `${Math.max(9, Math.min(22, 10 + Math.log10(c.pop) * 2 - d / 30))}px`;
        el.style.left = p.x + 'px';
        el.style.top = p.y + 'px';
      }
    }
    if (d < 70) {
      const minPop = d > 40 ? 3e6 : d > 20 ? 1e6 : d > 8 ? 3e5 : 0;
      let count = 0;
      for (const l of allLocations()) {
        if (count > 140) break;
        if (l.pop < minPop && !(l.cap && d < 40)) continue;
        const p = this.toScreen(project(l.lon, l.lat), cam);
        if (!p) continue;
        count++;
        const el = take();
        el.className = 'lbl city' + (l.cap ? ' capital' : '');
        el.dataset.loc = l.id;
        el.textContent = l.name;
        el.style.fontSize = '';
        el.style.left = p.x + 'px';
        el.style.top = p.y + 'px';
      }
    }
    if (d < 25) {
      for (const c of CASINOS) {
        const p = this.toScreen(project(c.lon, c.lat), cam);
        if (!p) continue;
        const el = take();
        el.className = 'lbl casino';
        el.dataset.loc = '';
        el.textContent = '♦ ' + c.name;
        el.style.fontSize = '';
        el.style.left = p.x + 'px';
        el.style.top = p.y + 'px';
      }
    }
    for (; i < this.labelPool.length; i++) this.labelPool[i].style.display = 'none';
  }

  // ---------- Hinweise ----------
  private flushNotices() {
    const s = this.s;
    while (s && s.notices.length) {
      const n = s.notices.shift()!;
      this.toast(n.text, n.kind);
    }
  }

  toast(text: string, kind: 'info' | 'good' | 'bad' = 'info') {
    const el = document.createElement('div');
    el.className = 'notice ' + kind;
    el.textContent = text;
    $('notices').appendChild(el);
    setTimeout(() => el.remove(), kind === 'bad' ? 9000 : 6000);
    while ($('notices').children.length > 6) $('notices').firstElementChild!.remove();
  }

  /** Führt eine Spielaktion aus und zeigt Fehler verständlich an. */
  act(fn: () => void) {
    try {
      fn();
    } catch (e) {
      this.toast((e as Error).message, 'bad');
    }
    if (this.s) this.city.syncDynamic(this.s);
    this.renderAll();
  }

  money = (v: number) => (this.s ? G.fmtPlain(this.s, v) : String(v));

  // ---------- Start ----------
  startCountry = 'AUT';
  showStart() {
    $('loading').classList.add('hidden');
    this.tab = 'start';
    this.renderStart();
    this.world.highlightCountry(this.startCountry);
  }

  renderStart() {
    const save = G.loadLocal();
    const playable = Object.keys(COUNTRY_ECON);
    const others = this.world.data.countries.filter((c) => !playable.includes(c.a3) && allLocations().some((l) => l.a3 === c.a3)).sort((a, b) => a.nde.localeCompare(b.nde));
    const cities = allLocations().filter((l) => l.a3 === this.startCountry).sort((a, b) => b.pop - a.pop);
    const e = econOf(this.startCountry);
    const prevName = ($('modal').querySelector('#st-name') as HTMLInputElement | null)?.value ?? 'Alex';
    const fmt = (v: number) => new Intl.NumberFormat('de-AT', { style: 'currency', currency: e.currency, maximumFractionDigits: 0 }).format(v);
    $('modal').classList.remove('hidden');
    $('modal').innerHTML = `<div class="dialog">
      <h2>World Sim – Industrie &amp; Leben</h2>
      <p class="muted">Du hast gerade die Matura / das Abitur / die High School abgeschlossen. Mit deinen Ersparnissen startest du ins Leben: Firma gründen, Halle bauen, Haus kaufen – oder alles im Casino verspielen. Tipp: Du kannst auch direkt auf ein Land auf der Karte klicken.</p>
      <div class="form">
        <label>Dein Name</label><input id="st-name" value="${esc(prevName)}" maxlength="30" />
        <label>Land</label>
        <select id="st-country">
          <optgroup label="Ausgearbeitete Länder">${playable.map((a) => `<option value="${a}" ${a === this.startCountry ? 'selected' : ''}>${esc(countryName(a))}</option>`).join('')}</optgroup>
          <optgroup label="Weitere Länder (geschätzte Werte)">${others.map((c) => `<option value="${c.a3}" ${c.a3 === this.startCountry ? 'selected' : ''}>${esc(c.nde)}</option>`).join('')}</optgroup>
        </select>
        <label>Startstadt</label>
        <select id="st-city">${cities.map((c) => `<option value="${esc(c.id)}">${esc(c.name)} (${(c.pop / 1000).toFixed(0)} Tsd.)</option>`).join('')}</select>
        <label>Startkapital</label>
        <select id="st-diff"><option value="low">Bescheiden – ${fmt(e.startBudget * 0.5)}</option><option value="normal" selected>Normal – ${fmt(e.startBudget)}</option><option value="rich">Erbe – ${fmt(e.startBudget * 10)}</option></select>
        <label>Deine Farbe</label><input id="st-color" type="color" value="#e0b030" />
      </div>
      <div class="card kv">
        <span>Lebenshaltung (bei den Eltern / WG)</span><b>${fmt(e.livingCost)} / Monat</b>
        <span>Industriegrund (mittlere Stadt)</span><b>${fmt(e.landIndustrial)} / m²</b>
        <span>Fachkraft (Arbeitgeberkosten)</span><b>${fmt(e.skilledMonthly)} / Monat</b>
        <span>Kreditzins</span><b>${(e.loanRate * 100).toFixed(1)} %</b>
      </div>
      ${e.real ? '' : '<p class="muted">Für dieses Land sind die Werte aus dem BIP pro Kopf geschätzt.</p>'}
      <div class="row" style="justify-content:flex-end">
        ${save ? '<button id="st-load">Spielstand laden</button>' : ''}
        <button class="primary" id="st-go">Spiel starten</button>
      </div>
    </div>`;
    const sel = $('st-country') as HTMLSelectElement;
    sel.onchange = () => {
      this.startCountry = sel.value;
      this.world.highlightCountry(sel.value);
      const c = allLocations().filter((l) => l.a3 === sel.value).sort((a, b) => b.pop - a.pop)[0];
      if (c) this.world.flyTo(c.lon, c.lat, 30);
      this.renderStart();
    };
    if (save) $('st-load').onclick = () => this.begin(save);
    $('st-go').onclick = () => {
      const s = G.newGame({
        name: ($('st-name') as HTMLInputElement).value.trim() || 'Alex',
        a3: this.startCountry,
        homeId: ($('st-city') as HTMLSelectElement).value,
        color: ($('st-color') as HTMLInputElement).value,
        difficulty: ($('st-diff') as HTMLSelectElement).value as 'low' | 'normal' | 'rich',
      });
      this.begin(s);
    };
  }

  begin(s: G.GameState) {
    this.s = s;
    $('modal').classList.add('hidden');
    for (const id of ['topbar', 'tabs', 'layers']) $(id).classList.remove('hidden');
    this.world.highlightCountry(s.player.a3);
    const l = getLocation(s.player.locId);
    this.world.flyTo(l.lon, l.lat, 8);
    this.tab = 'start';
    this.renderLayers();
    this.showCity(s.player.locId);
  }

  // ---------- Rendering der UI ----------
  renderAll() {
    this.renderTop();
    this.renderPanel();
    this.renderContext();
  }

  renderTop() {
    const s = this.s;
    if (!s) return;
    const d = G.localDate(s);
    const date = d.toLocaleDateString('de-AT', { weekday: 'short', day: '2-digit', month: '2-digit', year: 'numeric', timeZone: 'UTC' });
    const time = d.toLocaleTimeString('de-AT', { hour: '2-digit', minute: '2-digit', timeZone: 'UTC' });
    const l30 = G.last30(s);
    const loc = getLocation(s.player.locId);
    const travel = s.player.travel ? `unterwegs nach ${getLocation(s.player.travel.to).name}` : `in ${loc.name}`;
    // Statischer Teil: nur neu aufbauen, wenn sich Struktur ändert (sonst gehen Klicks verloren)
    const html = `
      <div class="clock"><b id="tb-date"></b><span class="muted" id="tb-who"></span></div>
      <div class="row speeds">
        <button data-sp="pause" class="${s.paused && !this.skipUntil ? 'on' : ''}" title="Pause (Leertaste)">⏸</button>
        ${G.SPEEDS.map((v, i) => `<button data-sp="${v}" class="${!s.paused && s.speed === v ? 'on' : ''}" title="Taste ${i + 1}${v >= 1000 ? ' – Schnellvorlauf' : ''}">${SPEED_LABEL[i]}</button>`).join('')}
        <button data-sp="skip" class="${this.skipUntil ? 'on' : ''}" title="Vorspulen bis zum nächsten Ereignis (max. 90 Tage) – Taste N">⏭ Nächstes Ereignis</button>
      </div>
      <div class="row">
        ${this.mode === 'city' ? '<button data-act="world">🌍 Weltkarte</button>' : `<button data-act="city">🏙 ${esc(getLocation(this.city.locId || s.player.locId).name)}</button>`}
        ${this.mode === 'city' ? `<button data-act="player" class="${this.city.playerMode ? 'on' : ''}" title="Taste F">🚶 Spielerfigur</button>` : ''}
        <button data-act="menu">☰</button>
      </div>
      <div class="money">
        <div><span class="tip" title="Dein privates Geld. Damit kaufst du Haus, Auto, Urlaub oder spielst im Casino.">Geldbörserl</span><b id="tb-wallet"></b></div>
        <div><span class="tip" title="Das Geld deiner Firma. Damit zahlt die Firma Löhne, Miete, Material und Bauprojekte.">Firmenkonto</span><b id="tb-company"></b></div>
        <div><span class="tip" title="Alles was dir gehört (Konten, Grundstücke, Gebäude) minus Schulden.">Vermögen</span><b id="tb-worth"></b></div>
        <div><span class="tip" title="Einnahmen minus laufende Ausgaben der letzten 30 Tage (ohne Käufe von Grundstücken, Kredite und Umbuchungen).">Letzte 30 Tage</span><b id="tb-30"></b></div>
      </div>`;
    const top = $('topbar');
    if (top.dataset.html !== html) {
      top.dataset.html = html;
      top.innerHTML = html;
      top.querySelectorAll<HTMLButtonElement>('[data-sp]').forEach((b) => (b.onclick = () => {
        if (b.dataset.sp === 'pause') {
          this.skipUntil = 0;
          s.paused = !s.paused;
          this.renderTop();
        } else if (b.dataset.sp === 'skip') this.skip();
        else this.setSpeed(+b.dataset.sp!);
      }));
      top.querySelectorAll<HTMLButtonElement>('[data-act]').forEach((b) => (b.onclick = () => {
        const a = b.dataset.act;
        if (a === 'world') this.showWorld();
        if (a === 'city') this.showCity(this.city.locId || s.player.locId);
        if (a === 'player') this.togglePlayer();
        if (a === 'menu') this.showMenu();
      }));
    }
    const set = (id: string, text: string, cls = '') => {
      const el = $(id);
      el.textContent = text;
      el.className = cls;
    };
    set('tb-date', `${date} · ${time}`);
    set('tb-who', `${s.player.name} ${travel}`, 'muted');
    set('tb-wallet', this.money(s.wallet), s.wallet < 0 ? 'bad' : '');
    set('tb-company', s.company ? this.money(s.companyAcct) : '–', s.companyAcct < 0 ? 'bad' : '');
    set('tb-worth', this.money(G.netWorth(s)));
    set('tb-30', `${l30.net >= 0 ? '+' : ''}${this.money(l30.net)}`, l30.net >= 0 ? 'good' : 'bad');
    const tabs: [Tab, string][] = [['start', '🧭 Übersicht'], ['firma', '🏭 Firma'], ['bau', '🏗 Bauen'], ['finanzen', '💶 Finanzen'], ['privat', '🏠 Privat'], ['casino', '🎰 Casino']];
    const th = tabs.map(([t, l]) => `<button data-tab="${t}" class="${this.tab === t ? 'on' : ''}">${l}</button>`).join('');
    const tabsEl = $('tabs');
    if (tabsEl.dataset.html !== th) {
      tabsEl.dataset.html = th;
      tabsEl.innerHTML = th;
      tabsEl.querySelectorAll<HTMLButtonElement>('button').forEach((b) => (b.onclick = () => {
        this.tab = this.tab === b.dataset.tab ? null : (b.dataset.tab as Tab);
        this.renderAll();
      }));
    }
  }

  renderLayers() {
    const names: [string, string][] = [['highways', 'Autobahnen'], ['railways', 'Bahn'], ['shipping', 'Schifffahrt'], ['ferries', 'Fähren'], ['ports', 'Häfen'], ['cities', 'Städte'], ['casinos', 'Casinos']];
    const state = (this.world as any).layerState ?? ((this.world as any).layerState = {} as Record<string, boolean>);
    const lh = this.mode === 'world' ? names.map(([k, l]) => `<button data-l="${k}" class="${state[k] === false ? '' : 'on'}">${l}</button>`).join('') : '';
    if ($('layers').dataset.html === lh) return;
    $('layers').dataset.html = lh;
    $('layers').innerHTML = lh;
    $('layers').querySelectorAll<HTMLButtonElement>('button').forEach((b) => (b.onclick = () => {
      const k = b.dataset.l!;
      state[k] = state[k] === false;
      this.world.setLayerVisible(k, state[k]);
      this.renderLayers();
    }));
  }

  renderPanel() {
    const s = this.s;
    const el = $('panel');
    this.renderLayers();
    if (!s || !this.tab) {
      el.classList.add('hidden');
      return;
    }
    el.classList.remove('hidden');
    const html = this.tab === 'start' ? this.htmlOverview(s) : this.tab === 'firma' ? this.htmlCompany(s) : this.tab === 'bau' ? this.htmlProjects(s) : this.tab === 'finanzen' ? this.htmlFinance(s) : this.tab === 'privat' ? this.htmlPrivate(s) : this.htmlCasino(s);
    if (el.dataset.html === html) return;
    el.dataset.html = html;
    el.innerHTML = html;
    this.bind(el);
    const chart = el.querySelector<HTMLCanvasElement>('canvas.chart');
    if (chart) this.drawChart(chart, s);
  }

  /** Verknüpft Buttons mit data-a="aktion" und data-arg. */
  private bind(root: HTMLElement) {
    root.querySelectorAll<HTMLElement>('[data-a]').forEach((b) => (b.onclick = () => this.handle(b.dataset.a!, b.dataset.arg ?? '', root)));
    root.querySelectorAll<HTMLInputElement>('input[type=range][data-live]').forEach((r) => {
      r.oninput = () => {
        const out = root.querySelector<HTMLElement>(`#${r.dataset.live}`);
        if (out) out.textContent = r.value;
        if (r.dataset.onlive) this.handle(r.dataset.onlive, r.value, root);
      };
    });
  }

  private val(root: HTMLElement, sel: string) {
    return (root.querySelector(sel) as HTMLInputElement | HTMLSelectElement | null)?.value ?? '';
  }

  private handle(a: string, arg: string, root: HTMLElement) {
    const s = this.s!;
    const plot = this.selected?.kind === 'plot' ? this.selected.plot : null;
    switch (a) {
      case 'tab': this.tab = arg as Tab; this.renderAll(); return;
      case 'found': return this.act(() => G.foundCompany(s, { name: this.val(root, '#f-name'), color: this.val(root, '#f-color'), industryId: this.val(root, '#f-ind'), legal: this.val(root, '#f-legal') as 'sole' | 'ltd' }));
      case 'resume': return this.act(() => G.startNextStep(s));
      case 'deposit': return this.act(() => G.transfer(s, 'wallet', +this.val(root, '#tr-amt')));
      case 'withdraw': return this.act(() => G.transfer(s, 'company', +this.val(root, '#tr-amt')));
      case 'hire': return this.act(() => G.setEmployees(s, (s.company?.employees ?? 0) + +arg));
      case 'accept': return this.act(() => G.acceptOrder(s, +arg));
      case 'decline': return this.act(() => G.declineOrder(s, +arg));
      case 'loan': return this.act(() => G.takeLoan(s, arg as G.Account, +this.val(root, `#loan-${arg}`), +this.val(root, `#loan-y-${arg}`)));
      case 'repay': return this.act(() => G.repayLoan(s, +arg));
      case 'buy': return this.act(() => plot && G.buyPlot(s, plot.id, arg as G.Account));
      case 'rent': return this.act(() => plot && G.rentPlot(s, plot.id));
      case 'sell': return this.act(() => plot && G.sellPlot(s, plot.id));
      case 'movein': return this.act(() => G.moveIn(s, arg || null));
      case 'build': return this.act(() => plot && G.startProject(s, plot.id, this.val(root, '#b-type'), +this.val(root, '#b-crew')));
      case 'btype': this.renderContext(true); return;
      case 'crew': return this.act(() => G.setCrew(s, +arg.split(':')[0], +arg.split(':')[1]));
      case 'cancel': return this.act(() => G.cancelProject(s, +arg));
      case 'goto': {
        const [locId, idx] = arg.split('#');
        if (this.mode !== 'city' || this.city.locId !== locId) this.showCity(locId);
        const p = layoutOf(locId).plots[+idx];
        this.city.focusPlot(p.idx);
        this.city.selectPlot(p);
        this.selected = { kind: 'plot', plot: p };
        this.renderContext();
        return;
      }
      case 'travel': return this.act(() => G.travel(s, arg));
      case 'viewcity': this.showCity(arg); return;
      case 'shop': {
        const [acct, i] = arg.split(':');
        const kind = plot?.shop?.kind;
        if (!kind) return;
        const item = SHOP_ITEMS[kind][+i];
        return this.act(() => G.buyItem(s, item.name, item.price, acct as G.Account, plot!.shop!.name));
      }
      case 'bet': {
        const bet = JSON.parse(arg) as Bet;
        if (bet.kind === 'number') bet.n = Math.max(0, Math.min(36, Math.round(+this.val(root, '#bet-num'))));
        this.stake = +this.val(root, '#bet-stake') || this.stake;
        return this.spinRoulette(bet, this.stake);
      }
      case 'selfban': s.casino.blockedUntil = s.t + 30 * G.DAY; this.toast('Du hast dich für 30 Tage im Casino gesperrt.', 'info'); this.renderAll(); return;
    }
  }

  private spinRoulette(bet: Bet, stake: number) {
    const s = this.s!;
    if (this.roulette.spinning) return;
    let res: { result: number; win: number };
    try {
      res = spin(s, bet, stake);
    } catch (e) {
      this.toast((e as Error).message, 'bad');
      return;
    }
    this.roulette = { spinning: true };
    let k = 0;
    const tick = () => {
      k++;
      const el = document.querySelector('.roulette-num');
      if (el) {
        const n = k < 14 ? Math.floor(Math.random() * 37) : res.result;
        el.textContent = String(n);
        el.className = 'roulette-num ' + (n === 0 ? 'r-green' : RED.has(n) ? 'r-red' : 'r-black');
      }
      if (k < 14) setTimeout(tick, 60 + k * 12);
      else {
        this.roulette = { result: res.result, win: res.win };
        this.renderAll();
      }
    };
    tick();
  }

  // ---------- Panels ----------
  private nextStep(s: G.GameState): string {
    const c = s.company;
    if (!c) return 'Gründe eine Firma im Tab <b>Firma</b>. Oder kauf dir privat ein Grundstück und bau ein Haus. Du kannst auch in eine Casino-Stadt reisen und dein Glück versuchen.';
    if (!c.active) {
      const st = c.steps.find((x) => !x.doneAt)!;
      return st.startedAt ? `Gründung läuft: <b>${esc(st.label)}</b>. Drück <b>⏭ Nächstes Ereignis</b>, um bis zum nächsten Schritt vorzuspulen.` : `Gründung pausiert: Für <b>${esc(st.label)}</b> fehlt Geld im Geldbörserl.`;
    }
    if (G.workshopArea(s) === 0) {
      const pending = Object.values(s.plots).some((o) => o.owner === 'company');
      if (pending || s.projects.some((p) => p.payer === 'company')) return 'Deine Betriebsstätte ist in Vorbereitung (Übergabe, Genehmigung oder Bau). Mit <b>⏭ Nächstes Ereignis</b> spulst du vor.';
      return 'Du brauchst eine Betriebsstätte: Miete eine Halle (grünes Schild <b>ZU VERMIETEN</b> im Industriegebiet) oder kauf ein Industriegrundstück (rotes Schild) und bau darauf. Vorher Geld als <b>Einlage</b> ins Firmenkonto überweisen.';
    }
    if (c.offers.length && !c.orders.length) return 'Du hast Kundenanfragen! Nimm im Tab <b>Firma</b> Aufträge an.';
    if (c.employees === 0 && c.completedOrders >= 3) return 'Läuft gut! Stelle Personal ein, um mehr Aufträge gleichzeitig zu schaffen.';
    if (c.completedOrders >= 10 && G.workshopArea(s) < 400) return 'Für größere Aufträge brauchst du mehr Fläche: Kauf ein Industriegrundstück und bau eine Produktionshalle.';
    return 'Nimm Aufträge an, halte das Firmenkonto im Plus und zahl dir regelmäßig ein Gehalt ins Geldbörserl aus.';
  }

  private htmlOverview(s: G.GameState) {
    const c = s.company;
    const loc = getLocation(s.player.locId);
    const casino = casinoHere(s);
    return `<h2>Übersicht</h2>
      <div class="hint"><b>Nächster Schritt:</b><br>${this.nextStep(s)}</div>
      <div class="card kv">
        <span>Alter</span><b>${G.localDate(s).getUTCFullYear() - s.player.birthYear} Jahre</b>
        <span>Aufenthaltsort</span><b>${esc(loc.name)}, ${esc(countryName(loc.a3))}</b>
        <span>Wohnen</span><b>${s.player.home ? 'Eigenes Haus' : 'Bei den Eltern / WG'}</b>
        <span>Firma</span><b>${c ? esc(c.name) + (c.active ? '' : ' (in Gründung)') : 'keine'}</b>
        <span>Grundstücke</span><b>${Object.keys(s.plots).length}</b>
        <span>Bauprojekte</span><b>${s.projects.filter((p) => p.state !== 'done').length}</b>
      </div>
      ${casino ? `<div class="card">🎰 In ${esc(loc.name)} gibt es das <b>${esc(casino)}</b>. <button data-a="tab" data-arg="casino">Hingehen</button></div>` : ''}
      <h3>Steuerung</h3>
      <div class="muted">Linke Maustaste ziehen: verschieben · Rechte Maustaste: drehen (Stadt) · Mausrad: zoomen · Klick: auswählen · Doppelklick auf Stadt: hineinzoomen · Leertaste: Pause · 1–7: Geschwindigkeit · N: bis zum nächsten Ereignis vorspulen · F: Spielerfigur (WASD, Q/E drehen, Shift laufen)</div>`;
  }

  private htmlCompany(s: G.GameState) {
    const c = s.company;
    const e = G.econ(s);
    if (!c) {
      return `<h2>Firma gründen</h2>
        <p class="muted">Eine Firma braucht in ${esc(countryName(s.player.a3))} einige Behördenwege. Jeder Schritt kostet Geld und Zeit – genau wie im echten Leben.</p>
        <div class="form">
          <label>Firmenname</label><input id="f-name" value="${esc(s.player.name)} Metallbau" maxlength="32" />
          <label>Branche</label><select id="f-ind">${INDUSTRIES.map((i) => `<option value="${i.id}">${esc(i.name)}</option>`).join('')}</select>
          <label>Rechtsform</label><select id="f-legal"><option value="sole">${esc(e.soleName)} – haftet privat, billig</option><option value="ltd">${esc(e.legalFormName)} – haftet nur Firma, Stammkapital ${this.money(e.minCapitalPaid)}</option></select>
          <label>Firmenfarbe</label><input id="f-color" type="color" value="#2f6fb3" />
        </div>
        <div class="card"><b>Ablauf ${esc(e.legalFormName)}:</b>${G.foundingSteps(e, 'ltd', e.regulatedTrades).map((st) => `<div class="step"><div class="dot"></div><div>${esc(st.label)} <span class="muted">· ${st.days} Tage · ${this.money(st.fee + st.capital)}</span></div></div>`).join('')}</div>
        <button class="primary" data-a="found">Gründung starten</button>`;
    }
    const ind = industry(c.industryId);
    const area = G.workshopArea(s);
    let h = `<h2>${esc(c.name)}</h2><div class="muted">${esc(ind.name)} · ${esc(c.legal === 'ltd' ? e.legalFormName : e.soleName)}</div>`;
    if (!c.active) {
      h += `<h3>Gründung</h3>${c.steps.map((st) => {
        const cls = st.doneAt ? 'done' : st.startedAt ? 'active' : '';
        const rest = st.startedAt && !st.doneAt ? ` · noch ${Math.max(0, Math.ceil((st.startedAt + st.days * G.DAY - s.t) / G.DAY))} Tage` : '';
        return `<div class="step ${cls}"><div class="dot"></div><div><b>${esc(st.label)}</b><div class="muted">${esc(st.info)} · ${st.days} Tage · ${this.money(st.fee + st.capital)}${rest}</div></div></div>`;
      }).join('')}`;
      if (!c.steps.find((x) => !x.doneAt)?.startedAt) h += '<button class="primary" data-a="resume">Weiter (bezahlen)</button>';
      return h;
    }
    h += `<div class="card kv">
      <span>Betriebsfläche</span><b>${area ? area + ' m²' : 'keine'}</b>
      <span>${esc(ind.worker)} angestellt</span><b>${c.employees}</b>
      <span>Kosten pro Fachkraft</span><b>${this.money(e.skilledMonthly)} / Monat</b>
      <span>Erledigte Aufträge</span><b>${c.completedOrders}</b>
      ${c.managerNeeded ? `<span class="tip" title="Reglementiertes Gewerbe: Ohne eigene Meisterprüfung braucht die Firma eine:n gewerberechtliche:n Geschäftsführer:in.">Gewerberechtl. GF</span><b>${this.money(e.skilledMonthly * 0.3)} / Monat</b>` : ''}
    </div>
    <div class="row"><button data-a="hire" data-arg="-1" ${c.employees ? '' : 'disabled'}>− Kündigen</button><button data-a="hire" data-arg="1" ${area ? '' : 'disabled'}>+ Einstellen</button><span class="muted">Max. ${Math.floor(area / 25)} (25 m² pro Person)</span></div>
    <h3>Geld zwischen Privat und Firma</h3>
    <div class="row"><input id="tr-amt" type="number" min="0" step="100" value="${Math.round(e.startBudget / 3)}" style="width:120px" />
    <button data-a="deposit" title="Privat → Firma">Einlage →</button><button data-a="withdraw" title="Firma → Privat (wird versteuert)">← Gehalt/Entnahme</button></div>
    <h3>Laufende Aufträge</h3>
    ${c.orders.length ? c.orders.map((o) => `<div class="card"><div class="spread"><b>${esc(o.name)}</b><span>${this.money(o.price)}</span></div><div class="bar"><div style="width:${(o.done / o.hours) * 100}%"></div></div><div class="muted">${o.done.toFixed(0)} / ${o.hours} Arbeitsstunden · fällig ${new Date(o.deadline * 1000).toLocaleDateString('de-AT')}</div></div>`).join('') : '<div class="muted">Keine.</div>'}
    <h3>Anfragen von Kund:innen</h3>
    ${area === 0 ? '<div class="muted">Ohne Betriebsstätte (Werkstatt/Halle) bekommst du keine Anfragen.</div>' : c.offers.length ? c.offers.map((o) => `<div class="card"><div class="spread"><b>${esc(o.name)}</b><span class="good">${this.money(o.price)}</span></div><div class="muted">${o.hours} Arbeitsstunden · Material ${this.money(o.material)} · Frist ${o.deadline} Tage · Gewinn vor Löhnen ≈ ${this.money(o.price - o.material)}</div><div class="row" style="margin-top:6px"><button class="primary" data-a="accept" data-arg="${o.id}">Annehmen</button><button data-a="decline" data-arg="${o.id}">Ablehnen</button></div></div>`).join('') : '<div class="muted">Gerade keine. Neue Anfragen kommen alle paar Tage.</div>'}
    <h3>Szenario: ${esc(ind.name)}</h3>${ind.scenario.map((x, i) => `<div class="muted">${i + 1}. ${esc(x)}</div>`).join('')}`;
    return h;
  }

  private htmlProjects(s: G.GameState) {
    const list = s.projects.filter((p) => p.state !== 'done');
    const own = Object.entries(s.plots);
    return `<h2>Bauprojekte & Grundstücke</h2>
      ${list.length ? list.map((p) => this.htmlProject(s, p)).join('') : '<div class="muted">Keine laufenden Bauprojekte. Wähle ein eigenes Grundstück in der Stadt, um zu bauen.</div>'}
      <h3>Deine Grundstücke</h3>
      ${own.length ? own.map(([id, o]) => {
        const loc = getLocation(id.split('#')[0]);
        const b = o.building && o.building !== 'npc' ? buildingType(o.building).name : o.building === 'npc' ? 'Bestandsgebäude' : 'unbebaut';
        return `<div class="card spread"><div><b>${esc(loc.name)}</b> · ${o.mode === 'rented' ? 'gemietet' : 'Eigentum'} (${o.owner === 'company' ? 'Firma' : 'privat'})<div class="muted">${esc(b)}${s.t < o.usableAt ? ' · Übergabe/Grundbuch läuft' : ''}</div></div><button data-a="goto" data-arg="${esc(id)}">Zeigen</button></div>`;
      }).join('') : '<div class="muted">Noch keine.</div>'}`;
  }

  private htmlProject(s: G.GameState, p: G.Project) {
    const b = buildingType(p.typeId);
    const prog = G.projectProgress(p);
    const eta = new Date(G.projectEta(s, p) * 1000).toLocaleDateString('de-AT');
    const status = p.state === 'permit' ? `Baugenehmigung läuft bis ${new Date(p.permitEndsAt * 1000).toLocaleDateString('de-AT')}` : `Phase ${p.phase + 1}/${b.phases.length}: ${b.phases[p.phase].name}`;
    return `<div class="card">
      <div class="spread"><b>${esc(b.name)}</b><button data-a="goto" data-arg="${esc(p.plotId)}">Zeigen</button></div>
      <div class="bar"><div style="width:${prog * 100}%"></div></div>
      <div class="kv"><span>Status</span><b>${esc(status)}</b><span>Fortschritt</span><b>${(prog * 100).toFixed(1)} %</b><span>Voraussichtlich fertig</span><b>${eta}</b><span>Bisher ausgegeben</span><b>${this.money(p.spent)}</b><span>Bezahlt von</span><b>${p.payer === 'company' ? 'Firma' : 'Geldbörserl'}</b>
      <span>Arbeiter</span><b>${p.crew} · ${this.money(p.crew * G.econ(s).constructionWageHour * 8)} / Arbeitstag</b></div>
      <div class="row" style="margin-top:6px"><button data-a="crew" data-arg="${p.id}:${p.crew - 1}">− Arbeiter</button><button data-a="crew" data-arg="${p.id}:${p.crew + 1}">+ Arbeiter</button><button class="danger" data-a="cancel" data-arg="${p.id}">Einstellen</button></div>
      <div class="muted">Mehr Arbeiter = schneller, aber teurer (abnehmender Nutzen). Gearbeitet wird Mo–Fr 7–16 Uhr.</div>
    </div>`;
  }

  private htmlFinance(s: G.GameState) {
    const l30 = G.last30(s);
    const ledger = s.ledger.slice(-60).reverse();
    const loanBox = (acct: G.Account, label: string) => {
      const lim = G.loanLimit(s, acct);
      return `<div class="card"><b>${label}</b><div class="muted">Die Bank gibt dir bis zu ${this.money(lim)} (${((G.econ(s).loanRate + (acct === 'wallet' ? 0.02 : 0)) * 100).toFixed(1)} % Zinsen).</div>
        <div class="row" style="margin-top:6px"><input id="loan-${acct}" type="number" min="0" step="1000" value="${Math.round(Math.min(lim, G.econ(s).startBudget * 2) / 1000) * 1000}" style="width:110px"/><select id="loan-y-${acct}"><option>5</option><option selected>10</option><option>20</option><option>30</option></select> Jahre <button data-a="loan" data-arg="${acct}" ${lim > 0 ? '' : 'disabled'}>Aufnehmen</button></div></div>`;
    };
    return `<h2>Finanzen</h2>
      <div class="card kv">
        <span>Einnahmen (30 Tage)</span><b class="good">${this.money(l30.income)}</b>
        <span>Ausgaben (30 Tage)</span><b class="bad">${this.money(l30.expense)}</b>
        <span>Ergebnis</span><b class="${l30.net >= 0 ? 'good' : 'bad'}">${this.money(l30.net)}</b>
      </div>
      <div class="muted">Verlauf: <span style="color:#e8c66e">Vermögen</span> · <span style="color:#5aa0e0">Geldbörserl</span> · <span style="color:#6cc070">Firmenkonto</span></div>
      <canvas class="chart" width="700" height="260"></canvas>
      <h3>Kredite</h3>
      ${s.loans.map((l) => `<div class="card spread"><div>${l.holder === 'company' ? 'Firma' : 'Privat'}: noch ${this.money(l.remaining)}<div class="muted">Rate ${this.money(l.monthly)} / Monat · ${(l.rate * 100).toFixed(1)} %</div></div><button data-a="repay" data-arg="${l.id}">Tilgen</button></div>`).join('')}
      ${loanBox('wallet', 'Privatkredit')}${s.company?.active ? loanBox('company', 'Firmenkredit') : ''}
      <h3>Kontoauszug</h3>
      <table class="ledger">${ledger.map((l) => `<tr><td class="muted">${new Date(l.t * 1000).toLocaleDateString('de-AT')}</td><td>${l.acct === 'wallet' ? '👛' : '🏭'} ${esc(l.text)}</td><td class="amt ${l.amount >= 0 ? 'good' : 'bad'}">${this.money(l.amount)}</td></tr>`).join('')}</table>`;
  }

  private drawChart(c: HTMLCanvasElement, s: G.GameState) {
    const g = c.getContext('2d')!;
    const h = s.history;
    g.clearRect(0, 0, c.width, c.height);
    if (h.length < 2) {
      g.fillStyle = '#a9a59a';
      g.font = '22px sans-serif';
      g.fillText('Noch zu wenig Daten – lass die Zeit laufen.', 20, 130);
      return;
    }
    const keys: ['worth' | 'wallet' | 'company', string][] = [['worth', '#e8c66e'], ['wallet', '#5aa0e0'], ['company', '#6cc070']];
    let lo = Infinity, hi = -Infinity;
    for (const p of h) for (const [k] of keys) {
      lo = Math.min(lo, p[k]);
      hi = Math.max(hi, p[k]);
    }
    if (hi === lo) hi = lo + 1;
    const X = (i: number) => 10 + (i / (h.length - 1)) * (c.width - 20);
    const Y = (v: number) => c.height - 20 - ((v - lo) / (hi - lo)) * (c.height - 40);
    if (lo < 0 && hi > 0) {
      g.strokeStyle = 'rgba(255,255,255,0.2)';
      g.beginPath();
      g.moveTo(0, Y(0));
      g.lineTo(c.width, Y(0));
      g.stroke();
    }
    for (const [k, col] of keys) {
      g.strokeStyle = col;
      g.lineWidth = 3;
      g.beginPath();
      h.forEach((p, i) => (i ? g.lineTo(X(i), Y(p[k])) : g.moveTo(X(i), Y(p[k]))));
      g.stroke();
    }
    g.fillStyle = '#ccc';
    g.font = '18px sans-serif';
    g.fillText(this.money(hi), 12, 22);
    g.fillText(this.money(lo), 12, c.height - 4);
  }

  private htmlPrivate(s: G.GameState) {
    const e = G.econ(s);
    const houses = Object.entries(s.plots).filter(([id, o]) => {
      if (o.owner !== 'wallet' || s.t < o.usableAt) return false;
      const { plot } = { plot: layoutOf(id.split('#')[0]).plots[+id.split('#')[1]] };
      const v = o.building === 'npc' ? plot.npc : o.building ? buildingType(o.building).visual : null;
      return v === 'house' || v === 'tinyhouse';
    });
    return `<h2>Privat</h2>
      <div class="card kv"><span>Geldbörserl</span><b>${this.money(s.wallet)}</b><span>Lebenshaltung</span><b>${this.money(s.player.home ? e.livingCostOwnHome : e.livingCost)} / Monat</b></div>
      <h3>Wohnen</h3>
      <div class="card">${s.player.home ? 'Du wohnst im eigenen Haus.' : 'Du wohnst bei den Eltern oder in einer WG (günstig).'}
        ${houses.map(([id]) => `<div class="row" style="margin-top:6px"><button data-a="movein" data-arg="${esc(id)}" ${s.player.home === id ? 'disabled' : ''}>In Haus einziehen (${esc(getLocation(id.split('#')[0]).name)})</button></div>`).join('')}
        ${s.player.home ? '<button data-a="movein" data-arg="">Wieder zu den Eltern</button>' : ''}
        <div class="muted" style="margin-top:6px">Haus kaufen: Klick in der Stadt auf ein Haus mit rotem Schild <b>ZU VERKAUFEN</b>, oder kauf ein leeres Wohngrundstück und bau selbst.</div></div>
      <h3>Besitz</h3>
      ${s.inventory.length ? `<table class="ledger">${s.inventory.slice().reverse().map((i) => `<tr><td>${i.owner === 'wallet' ? '👛' : '🏭'} ${esc(i.name)}</td><td class="amt">${this.money(i.price)}</td></tr>`).join('')}</table>` : '<div class="muted">Noch nichts gekauft. Geschäfte findest du in der Stadt (Schilder mit Namen).</div>'}
      <h3>Reisen</h3>
      <div class="muted">Klick auf der Weltkarte auf eine Stadt und wähle „Hierher reisen". Bahn bis 700 km, darüber Flug.</div>`;
  }

  private htmlCasino(s: G.GameState) {
    const here = casinoHere(s);
    const lost = s.casino.wagered - s.casino.won;
    if (!here) {
      const loc = getLocation(s.player.locId);
      const near = CASINOS.map((c) => ({ c, d: distanceKm(c, loc) })).sort((a, b) => a.d - b.d).slice(0, 5);
      return `<h2>Casino</h2><p>In ${esc(loc.name)} gibt es kein Casino. Die nächsten echten Casinos:</p>
        ${near.map(({ c, d }) => {
          const target = allLocations().find((l) => distanceKm(l, c) < 25);
          return `<div class="card spread"><div><b>${esc(c.name)}</b><div class="muted">${esc(c.town)} · ${Math.round(d)} km</div></div>${target ? `<button data-a="travel" data-arg="${esc(target.id)}">Reisen (${this.money(G.travelQuote(s, target.id).cost)})</button>` : ''}</div>`;
        }).join('')}`;
    }
    const r = this.roulette;
    const n = r.result;
    const cls = n === undefined ? 'r-green' : n === 0 ? 'r-green' : RED.has(n) ? 'r-red' : 'r-black';
    const bets: [string, Bet][] = [['Rot', { kind: 'red' }], ['Schwarz', { kind: 'black' }], ['Gerade', { kind: 'even' }], ['Ungerade', { kind: 'odd' }], ['1–18', { kind: 'low' }], ['19–36', { kind: 'high' }], ['1. Dutzend', { kind: 'dozen', n: 1 }], ['2. Dutzend', { kind: 'dozen', n: 2 }], ['3. Dutzend', { kind: 'dozen', n: 3 }]];
    const blocked = s.t < s.casino.blockedUntil;
    return `<h2>🎰 ${esc(here)}</h2>
      <div class="muted">Europäisches Roulette mit einer Null. Echte Gewinnchancen: Auf lange Sicht verlierst du 2,7 % jedes Einsatzes. Nur Spielgeld.</div>
      <div class="roulette-num ${cls}">${n ?? '–'}</div>
      <div style="text-align:center">${r.win !== undefined ? (r.win > 0 ? `<b class="good">Gewonnen: ${this.money(r.win)}</b>` : '<b class="bad">Verloren</b>') : 'Setz deinen Einsatz'}</div>
      ${blocked ? `<div class="card bad">Selbstsperre aktiv bis ${new Date(s.casino.blockedUntil * 1000).toLocaleDateString('de-AT')}.</div>` : `
      <div class="row" style="margin-top:8px">Einsatz <input id="bet-stake" type="number" min="1" value="${this.stake}" style="width:100px" /> (Geldbörserl: ${this.money(s.wallet)})</div>
      <div class="bets">${bets.map(([l, b]) => `<button data-a="bet" data-arg='${JSON.stringify(b)}'>${l}</button>`).join('')}</div>
      <div class="row">Zahl <input id="bet-num" type="number" min="0" max="36" value="17" style="width:70px" /><button data-a="bet" data-arg='{"kind":"number","n":17}'>Auf Zahl setzen (36×)</button></div>`}
      <div class="card kv"><span>Gesetzt gesamt</span><b>${this.money(s.casino.wagered)}</b><span>Ausbezahlt gesamt</span><b>${this.money(s.casino.won)}</b><span>Bilanz</span><b class="${lost > 0 ? 'bad' : 'good'}">${this.money(-lost)}</b></div>
      <button data-a="selfban">30 Tage Selbstsperre</button>`;
  }

  // ---------- Kontextpanel (rechts) ----------
  renderContext(keepForm = false) {
    const el = $('context');
    const s = this.s;
    const sel = this.selected;
    if (!sel || (!s && sel.kind !== 'country')) {
      el.classList.add('hidden');
      return;
    }
    const prevType = this.val(el, '#b-type');
    const prevCrew = keepForm ? '' : this.val(el, '#b-crew');
    el.classList.remove('hidden');
    if (sel.kind === 'country') {
      const e = econOf(sel.a3);
      const fmt = (v: number) => new Intl.NumberFormat('de-AT', { style: 'currency', currency: e.currency, maximumFractionDigits: 0 }).format(v);
      el.innerHTML = `<h2>${esc(sel.name)}</h2><div class="card kv">
        <span>Währung</span><b>${e.currency}</b><span>Startkapital</span><b>${fmt(e.startBudget)}</b><span>Fachkraft / Monat</span><b>${fmt(e.skilledMonthly)}</b>
        <span>Industriegrund / m²</span><b>${fmt(e.landIndustrial)}</b><span>Wohngrund / m²</span><b>${fmt(e.landResidential)}</b><span>Kreditzins</span><b>${(e.loanRate * 100).toFixed(1)} %</b></div>
        ${e.real ? '' : '<div class="muted">Geschätzte Werte.</div>'}`;
      return;
    }
    if (sel.kind === 'city') {
      const l = sel.loc;
      const here = s!.player.locId === l.id;
      const q = here ? null : G.travelQuote(s!, l.id);
      const cas = CASINOS.filter((c) => distanceKm(c, l) < 25);
      el.innerHTML = `<h2>${esc(l.name)}</h2><div class="muted">${esc(countryName(l.a3))}${l.cap ? ' · Hauptstadt' : ''}</div>
        <div class="card kv"><span>Einwohner</span><b>${l.pop.toLocaleString('de-AT')}</b>${cas.map((c) => `<span>Casino</span><b>${esc(c.name)}</b>`).join('')}</div>
        <div class="row"><button class="primary" data-a="viewcity" data-arg="${esc(l.id)}">Stadt ansehen</button>
        ${here ? '<span class="muted">Du bist hier.</span>' : `<button data-a="travel" data-arg="${esc(l.id)}" ${s!.player.travel ? 'disabled' : ''}>Hierher reisen</button>`}</div>
        ${q ? `<div class="muted">${q.mode}, ${q.km} km, ca. ${q.hours.toFixed(1)} h, ${this.money(q.cost)}</div>` : ''}`;
      this.bind(el);
      return;
    }
    const p = sel.plot;
    const st = s!;
    const own = st.plots[p.id];
    const vis = G.plotVisual(st, p.id, p);
    const zoneName = { industrial: 'Industrie / Gewerbe', residential: 'Wohnbau', commercial: 'Geschäftsgebiet', park: 'Park' }[p.zone];
    let h = `<h2>${p.shop ? esc(p.shop.name) : p.casino ? esc(p.casino) : 'Grundstück'}</h2>
      <div class="muted">${esc(getLocation(this.city.locId).name)} · Widmung: ${zoneName} · ${Math.round(p.w * p.d).toLocaleString('de-AT')} m²</div>`;
    if (p.shop && !own) {
      const items = SHOP_ITEMS[p.shop.kind];
      h += `<div class="card"><b>${SHOP_LABEL[p.shop.kind]}</b>${items.length ? '' : '<div class="muted">Kredite findest du im Tab Finanzen.</div>'}
        ${items.map((it, i) => `<div class="spread" style="margin:6px 0"><span>${esc(it.name)}<br><span class="muted">${this.money(it.price * G.matScale(G.econ(st)))}</span></span>
        <span class="row">${it.kind === 'private' ? `<button data-a="shop" data-arg="wallet:${i}">Privat kaufen</button>` : `<button data-a="shop" data-arg="company:${i}" ${st.company?.active ? '' : 'disabled'}>Für Firma</button>`}</span></div>`).join('')}</div>`;
    }
    if (p.casino) {
      h += `<div class="card">Echtes Casino an seinem echten Ort.${st.player.locId === this.city.locId ? ' <button data-a="tab" data-arg="casino">Spielen</button>' : ' Du musst zuerst hierher reisen.'}</div>`;
    }
    if (!own && p.forSale) {
      const pr = G.plotPrice(st, p.id);
      h += `<div class="card kv"><span>Grund (${Math.round(p.w * p.d)} m² × ${this.money(layoutOf(this.city.locId).landPrice[p.zone === 'park' ? 'residential' : p.zone])})</span><b>${this.money(pr.land)}</b>
        ${pr.building ? `<span>Bestehendes Haus</span><b>${this.money(pr.building)}</b>` : ''}
        <span class="tip" title="Grunderwerbsteuer, Notar, Grundbuch-Eintragung">Nebenkosten</span><b>${this.money(pr.fees)}</b><span><b>Gesamt</b></span><b>${this.money(pr.total)}</b></div>
        <div class="row"><button class="primary" data-a="buy" data-arg="wallet" ${st.wallet >= pr.total ? '' : 'disabled'}>Privat kaufen</button>
        ${p.zone === 'industrial' ? `<button class="primary" data-a="buy" data-arg="company" ${st.company?.active && st.companyAcct >= pr.total ? '' : 'disabled'}>Mit Firma kaufen</button>` : ''}</div>
        ${st.wallet < pr.total && (st.companyAcct < pr.total || p.zone !== 'industrial') ? '<div class="muted">Zu wenig Geld. Ein Kredit (Tab Finanzen) könnte helfen.</div>' : ''}`;
    }
    if (!own && p.forRent) {
      const rent = G.monthlyRent(st, p.id);
      h += `<div class="card kv"><span>Hallenfläche</span><b>${G.rentedArea(p)} m²</b><span>Miete</span><b>${this.money(rent)} / Monat</b><span>Kaution (3 Mieten)</span><b>${this.money(rent * 3)}</b></div>
        <button class="primary" data-a="rent" ${st.company?.active ? '' : 'disabled'}>Für Firma mieten</button>${st.company?.active ? '' : '<div class="muted">Nur eine fertig gegründete Firma kann mieten.</div>'}`;
    }
    if (own) {
      h += `<div class="card kv"><span>Besitz</span><b>${own.mode === 'rented' ? 'gemietet' : 'Eigentum'} · ${own.owner === 'company' ? 'Firma' : 'privat'}</b>
        <span>Nutzbar ab</span><b>${st.t < own.usableAt ? new Date(own.usableAt * 1000).toLocaleDateString('de-AT') : 'jetzt'}</b>
        <span>Gebäude</span><b>${own.building === 'npc' ? 'Bestand' : own.building ? esc(buildingType(own.building).name) : vis.project ? 'im Bau' : 'keins'}</b>
        ${own.mode === 'owned' ? `<span>Geschätzter Wert</span><b>${this.money(G.assetValue(st, p.id))}</b>` : `<span>Miete</span><b>${this.money(own.rent!)}</b>`}</div>`;
      if (vis.project) h += this.htmlProject(st, vis.project);
      else if (own.mode === 'owned' && !own.building) {
        const types = BUILDING_TYPES.filter((b) => b.zone === p.zone);
        const chosen = buildingType(prevType && types.some((t) => t.id === prevType) ? prevType : types[0]?.id ?? 'efh');
        if (types.length) {
          const e = G.econ(st);
          const crew = +(prevCrew || chosen.defaultCrew);
          const err = G.canBuild(st, p.id, chosen.id);
          h += `<h3>Bauen</h3><div class="form"><label>Gebäude</label><select id="b-type" onchange="">${types.map((b) => `<option value="${b.id}" ${b.id === chosen.id ? 'selected' : ''}>${esc(b.name)}</option>`).join('')}</select>
            <label>Arbeiter: <span id="crew-v">${crew}</span></label><input id="b-crew" type="range" min="1" max="${chosen.maxCrew}" value="${crew}" data-live="crew-v" /></div>
            <div class="muted">${esc(chosen.description)}</div>
            <div class="card kv"><span>Baugenehmigung</span><b>${G.permitDays(e, chosen)} Tage · ${this.money(G.permitFee(e, chosen))}</b>
            <span>Bauzeit (Standard-Kolonne)</span><b>≈ ${Math.round(estimateWorkDays(chosen, chosen.defaultCrew) * 7 / 5 / 30.4 * 10) / 10} Monate</b>
            <span>Geschätzte Kosten</span><b>${this.money(G.buildCost(e, chosen))}</b>
            <span class="muted">Material zu Beginn jeder Phase, Löhne täglich, Maschinenmiete pro Arbeitstag.</span><b></b></div>
            ${err ? `<div class="bad">${esc(err)}</div>` : ''}
            <button class="primary" data-a="build" ${err ? 'disabled' : ''}>Bauantrag stellen</button>`;
        }
      }
      if (own.owner === 'wallet' && (vis.visual === 'house' || vis.visual === 'tinyhouse') && st.player.home !== p.id && st.t >= own.usableAt) h += `<button data-a="movein" data-arg="${esc(p.id)}">Einziehen</button> `;
      if (!vis.project) h += `<button class="danger" data-a="sell">${own.mode === 'rented' ? 'Mietvertrag kündigen' : 'Verkaufen'}</button>`;
    }
    if (!own && !p.forSale && !p.forRent && !p.shop && !p.casino) h += '<div class="muted">Privatbesitz – nicht zu verkaufen.</div>';
    if (el.dataset.html === h) return;
    el.dataset.html = h;
    el.innerHTML = h;
    this.bind(el);
    const bt = el.querySelector<HTMLSelectElement>('#b-type');
    if (bt) bt.onchange = () => this.renderContext(true);
  }

  showMenu() {
    const s = this.s!;
    s.paused = true;
    $('modal').classList.remove('hidden');
    $('modal').innerHTML = `<div class="dialog"><h2>Menü</h2>
      <div class="row"><button data-m="save">Speichern</button><button data-m="export">Spielstand exportieren</button><button data-m="new" class="danger">Neues Spiel</button><button data-m="close" class="primary">Weiter spielen</button></div>
      <h3>Credits & Datenquellen</h3>
      <p class="muted">Kartendaten: Made with Natural Earth – Free vector and raster map data @ naturalearthdata.com (Public Domain). Ländergrenzen, Städte, Autobahnen, Eisenbahnen, Häfen.<br>
      Namen echter Firmen, Geschäfte und Casinos dienen nur als Faktenangabe; keine Logos. Alle Marken gehören ihren Inhabern.<br>
      Alle 3D-Modelle sind prozedural erzeugt. Wirtschaftswerte sind gerundete Näherungen (Stand 2025/26).</p></div>`;
    $('modal').querySelectorAll<HTMLButtonElement>('[data-m]').forEach((b) => (b.onclick = () => {
      const m = b.dataset.m;
      if (m === 'save') this.toast(G.saveLocal(s) ? 'Gespeichert.' : 'Speichern fehlgeschlagen.', 'good');
      if (m === 'export') {
        const a = document.createElement('a');
        a.href = URL.createObjectURL(new Blob([G.serialize(s)], { type: 'application/json' }));
        a.download = 'world-sim-spielstand.json';
        a.click();
      }
      if (m === 'new') {
        if (!confirm('Neues Spiel starten? Der aktuelle Spielstand wird überschrieben, sobald du startest.')) return;
        this.s = null;
        this.selected = null;
        for (const id of ['topbar', 'tabs', 'layers', 'panel', 'context']) $(id).classList.add('hidden');
        this.mode = 'world';
        this.showStart();
        return;
      }
      if (m === 'close' || m === 'save') $('modal').classList.add('hidden');
    }));
  }
}
