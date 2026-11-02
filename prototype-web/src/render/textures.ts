// Prozedurale Canvas-Texturen (keine fremden Assets).
import * as THREE from 'three';

const cache = new Map<string, THREE.Texture>();

function canvasTex(key: string, w: number, h: number, draw: (g: CanvasRenderingContext2D) => void, repeat = true) {
  const hit = cache.get(key);
  if (hit) return hit;
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  draw(c.getContext('2d')!);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  if (repeat) t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.anisotropy = 4;
  cache.set(key, t);
  return t;
}

/** Fassade: eine Zelle = ein Fenster (ein Geschoß × eine Achse). */
export function facade(style: 'house' | 'apartment' | 'office' | 'glass' | 'industrial', wall: string, mask = false) {
  return canvasTex(`fac-${style}-${wall}-${mask}`, 64, 64, (g) => {
    g.fillStyle = mask ? '#000' : wall;
    g.fillRect(0, 0, 64, 64);
    const win = (x: number, y: number, w: number, h: number, frame = true) => {
      if (frame && !mask) {
        g.fillStyle = 'rgba(255,255,255,0.75)';
        g.fillRect(x - 2, y - 2, w + 4, h + 4);
      }
      if (mask) g.fillStyle = Math.random() < 0.6 ? '#ffd890' : '#000';
      else {
        const grd = g.createLinearGradient(x, y, x + w, y + h);
        grd.addColorStop(0, '#5b7a96');
        grd.addColorStop(1, '#a9c4d8');
        g.fillStyle = grd;
      }
      g.fillRect(x, y, w, h);
    };
    if (style === 'house') win(18, 16, 28, 30);
    else if (style === 'apartment') {
      win(10, 14, 44, 30);
      if (!mask) {
        g.fillStyle = 'rgba(0,0,0,0.25)';
        g.fillRect(0, 54, 64, 4);
      }
    } else if (style === 'office') {
      win(0, 12, 64, 36, false);
      if (!mask) {
        g.fillStyle = 'rgba(30,40,50,0.6)';
        for (let x = 0; x < 64; x += 16) g.fillRect(x, 12, 2, 36);
      }
    } else if (style === 'glass') {
      if (!mask) {
        const grd = g.createLinearGradient(0, 0, 64, 64);
        grd.addColorStop(0, '#6f93b3');
        grd.addColorStop(1, '#2d4c6a');
        g.fillStyle = grd;
        g.fillRect(0, 0, 64, 64);
        g.fillStyle = 'rgba(220,235,255,0.35)';
        g.fillRect(0, 0, 64, 3);
        g.fillRect(0, 0, 2, 64);
      } else win(4, 6, 56, 52, false);
    } else if (style === 'industrial') {
      if (!mask) {
        g.fillStyle = 'rgba(0,0,0,0.10)';
        for (let x = 0; x < 64; x += 8) g.fillRect(x, 0, 3, 64);
      }
      win(4, 4, 56, 10, false);
    }
  });
}

export const roofTiles = (color: string) =>
  canvasTex(`roof-${color}`, 64, 64, (g) => {
    g.fillStyle = color;
    g.fillRect(0, 0, 64, 64);
    g.fillStyle = 'rgba(0,0,0,0.18)';
    for (let y = 0; y < 64; y += 8) g.fillRect(0, y, 64, 2);
    for (let y = 0; y < 64; y += 16) for (let x = 0; x < 64; x += 16) g.fillRect(x + ((y / 8) % 2) * 8, y, 2, 8);
  });

export const corrugated = (color: string) =>
  canvasTex(`corr-${color}`, 64, 64, (g) => {
    g.fillStyle = color;
    g.fillRect(0, 0, 64, 64);
    for (let x = 0; x < 64; x += 8) {
      g.fillStyle = 'rgba(255,255,255,0.15)';
      g.fillRect(x, 0, 3, 64);
      g.fillStyle = 'rgba(0,0,0,0.18)';
      g.fillRect(x + 4, 0, 3, 64);
    }
  });

export const rollerDoor = () =>
  canvasTex('roller', 64, 64, (g) => {
    g.fillStyle = '#8d949a';
    g.fillRect(0, 0, 64, 64);
    g.fillStyle = 'rgba(0,0,0,0.25)';
    for (let y = 0; y < 64; y += 6) g.fillRect(0, y, 64, 2);
  }, false);

export const asphalt = (lanes: boolean) =>
  canvasTex(`asphalt-${lanes}`, 128, 128, (g) => {
    g.fillStyle = '#4a4d52';
    g.fillRect(0, 0, 128, 128);
    for (let i = 0; i < 900; i++) {
      g.fillStyle = `rgba(${Math.random() < 0.5 ? '255,255,255' : '0,0,0'},0.06)`;
      g.fillRect(Math.random() * 128, Math.random() * 128, 2, 2);
    }
    g.fillStyle = '#d8d8d0';
    if (lanes) {
      g.fillRect(0, 6, 128, 3);
      g.fillRect(0, 119, 128, 3);
      for (let x = 0; x < 128; x += 32) g.fillRect(x, 63, 18, 3);
    } else for (let x = 0; x < 128; x += 32) g.fillRect(x, 62, 16, 3);
  });

export const grass = () =>
  canvasTex('grass', 128, 128, (g) => {
    g.fillStyle = '#6f9a4f';
    g.fillRect(0, 0, 128, 128);
    for (let i = 0; i < 1500; i++) {
      g.fillStyle = `rgba(${Math.random() < 0.5 ? '40,70,20' : '160,190,100'},0.15)`;
      g.fillRect(Math.random() * 128, Math.random() * 128, 2, 2);
    }
  });

export const concrete = () =>
  canvasTex('concrete', 128, 128, (g) => {
    g.fillStyle = '#a8a59c';
    g.fillRect(0, 0, 128, 128);
    for (let i = 0; i < 1200; i++) {
      g.fillStyle = `rgba(0,0,0,${Math.random() * 0.06})`;
      g.fillRect(Math.random() * 128, Math.random() * 128, 2, 2);
    }
    g.strokeStyle = 'rgba(0,0,0,0.12)';
    g.strokeRect(0, 0, 128, 128);
  });

export const paving = () =>
  canvasTex('paving', 64, 64, (g) => {
    g.fillStyle = '#bdb6a8';
    g.fillRect(0, 0, 64, 64);
    g.fillStyle = 'rgba(0,0,0,0.10)';
    for (let i = 0; i < 64; i += 16) {
      g.fillRect(i, 0, 1, 64);
      g.fillRect(0, i, 64, 1);
    }
  });

export const railTex = () =>
  canvasTex('rail', 64, 64, (g) => {
    g.fillStyle = '#7a6f62';
    g.fillRect(0, 0, 64, 64);
    g.fillStyle = '#5a4030';
    for (let x = 0; x < 64; x += 10) g.fillRect(x, 8, 5, 48);
    g.fillStyle = '#c8c8c8';
    g.fillRect(0, 18, 64, 3);
    g.fillRect(0, 43, 64, 3);
  });

/** Schild mit Text (z. B. Geschäftsname, „Zu verkaufen"). Nur Text, keine Logos. */
export function signTexture(text: string, bg: string, fg: string, w = 512, h = 128) {
  return canvasTex(`sign-${text}-${bg}-${fg}-${w}`, w, h, (g) => {
    g.fillStyle = bg;
    g.fillRect(0, 0, w, h);
    g.strokeStyle = fg;
    g.lineWidth = 6;
    g.strokeRect(6, 6, w - 12, h - 12);
    g.fillStyle = fg;
    let size = h * 0.55;
    g.font = `bold ${size}px "Segoe UI", Arial, sans-serif`;
    while (g.measureText(text).width > w - 40 && size > 10) {
      size -= 2;
      g.font = `bold ${size}px "Segoe UI", Arial, sans-serif`;
    }
    g.textAlign = 'center';
    g.textBaseline = 'middle';
    g.fillText(text, w / 2, h / 2 + 2);
  }, false);
}
