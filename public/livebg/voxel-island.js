// Native Clouds · Voxel Island — a hand-built voxel (pixel-cube) island scene in three.js.
// Inspired by isometric voxel games; all models are original (no copied art, logos or characters).
// Same API as the other background engines: deliver / setWeather / setTime / setFlyers / on('drop') …
//
//   import { createVoxelIsland } from '/livebg/voxel-island.js'
//   const bg = createVoxelIsland(canvas, { view:'iso' })
//   import { attachWidgets } from '/livebg/widgets.js'; attachWidgets(bg)

import * as THREE from './vendor/three.module.min.js';
import { fetchWeather, geocode, WEATHER_PRESETS } from './livebg.js';

const clamp = (v, a = 0, b = 1) => Math.max(a, Math.min(b, v));
const lerp = (a, b, t) => a + (b - a) * t;
const smooth = (t) => { t = clamp(t); return t * t * (3 - 2 * t); };
function mulberry(seed) { return () => { seed |= 0; seed = (seed + 0x6D2B79F5) | 0; let t = Math.imul(seed ^ (seed >>> 15), 1 | seed); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }
function hash(x, z) { const s = Math.sin(x * 127.1 + z * 311.7) * 43758.5453; return s - Math.floor(s); }
function vnoise(x, z) {
  const xi = Math.floor(x), zi = Math.floor(z), xf = x - xi, zf = z - zi, u = xf * xf * (3 - 2 * xf), v = zf * zf * (3 - 2 * zf);
  const a = hash(xi, zi), b = hash(xi + 1, zi), c = hash(xi, zi + 1), d = hash(xi + 1, zi + 1);
  return a + (b - a) * u + (c - a) * v + (a - b - c + d) * u * v;
}

// ---------- palette (saturated, warm) ----------
export const PAL = {
  sandTop: 0xf6e2b0, sand: 0xead196, sandDk: 0xd8b77a, sandDeep: 0xc9a466, path: 0xf1dba6,
  grass: 0x79cd45, grass2: 0x6cc03b, grass3: 0x8ad957, grassDk: 0x5aae33,
  foam: 0xe8fcff, foam2: 0xc3f3fb, shallow: 0x6fe0f0, shallow2: 0x48cfe8, mid: 0x31b3df, mid2: 0x2a98d6, deep: 0x2479c4, deep2: 0x1f68b4,
  wood: 0xd59a52, wood2: 0xc4863f, woodDk: 0x7e4f25, woodLt: 0xe8b46c, plank: 0xb87a3e,
  roof: 0xec7a2c, roof2: 0xf58f3e, roofDk: 0xc85a1c, roofB: 0x3f86d6, roofB2: 0x5498e0, roofR: 0xd9483b, roofR2: 0xe85e4d,
  wall: 0xf5e6c4, wall2: 0xebd7ad, stone: 0xa3a8ae, stone2: 0x8c9198, stoneDk: 0x6e737a, stoneLt: 0xc2c6cb,
  glass: 0x3f7fd6, fire: 0xff8a1e, fire2: 0xffc63d, ember: 0xff5a1a,
  red: 0xdc4638, white: 0xf7f2e6, green: 0x3fae5a, yellow: 0xf6c344, teal: 0x2fb3a8, purple: 0x8a5cc4, pink: 0xff7aa8, black: 0x2a2a30,
  leaf: 0x3eb04e, leaf2: 0x2e9140, leafLt: 0x5dcc5d, trunk: 0xb0743c, trunk2: 0x8e5a2b, coconut: 0x6b4423,
  rock: 0xbfc3c8, rock2: 0xa5aab0, rockTop: 0xdadde1, hedge: 0x3c9a3e, hedge2: 0x2f8634,
};

class Vox {
  constructor() { this.m = new Map(); }
  put(x, y, z, c) { this.m.set(x + '|' + y + '|' + z, c); }
  has(x, y, z) { return this.m.has(x + '|' + y + '|' + z); }
  box(x0, y0, z0, w, h, d, c) { for (let x = x0; x < x0 + w; x++) for (let y = y0; y < y0 + h; y++) for (let z = z0; z < z0 + d; z++) this.put(x, y, z, typeof c === 'function' ? c(x, y, z) : c); }
  mesh(material, jitter = 0.03, rng = Math.random) {
    const n = this.m.size, im = new THREE.InstancedMesh(new THREE.BoxGeometry(1, 1, 1), material, Math.max(1, n));
    const mtx = new THREE.Matrix4(), col = new THREE.Color(); let i = 0;
    for (const [k, c] of this.m) {
      const [x, y, z] = k.split('|').map(Number);
      mtx.makeTranslation(x + 0.5, y + 0.5, z + 0.5); im.setMatrixAt(i, mtx);
      col.setHex(c); if (jitter) col.offsetHSL(0, (rng() - 0.5) * jitter * 0.6, (rng() - 0.5) * 2 * jitter); im.setColorAt(i, col); i++;
    }
    im.count = n; im.instanceMatrix.needsUpdate = true; if (im.instanceColor) im.instanceColor.needsUpdate = true;
    im.castShadow = true; im.receiveShadow = true; return im;
  }
}

export function createVoxelIsland(canvas, opts = {}) {
  const listeners = {};
  const emit = (e, d) => (listeners[e] || []).forEach((f) => { try { f(d); } catch { /* ignore */ } });
  const rng = mulberry(opts.seed || 7);
  const PIX = opts.pixel || 2; // render scale -> chunky crisp pixels

  // ---------- renderer / scene / camera ----------
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: false, powerPreference: 'high-performance' });
  renderer.shadowMap.enabled = true; renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  canvas.style.imageRendering = 'pixelated';
  const scene = new THREE.Scene();
  const cam = new THREE.OrthographicCamera(-30, 30, 20, -20, 0.1, 1200);
  const S = {
    t: 0, dt: 0, raf: 0, last: 0, W: 1, H: 1,
    view: { az: Math.PI / 4, el: 0.72, zoom: 36 }, viewTarget: { az: Math.PI / 4, el: 0.72, zoom: 36 }, autoRotate: false,
    location: opts.location || { lat: 41.7151, lon: 44.8271, name: 'Тбилиси' },
    weatherMode: 'live', weather: { ...WEATHER_PRESETS.partly }, live: null,
    timeMode: 'live', hour: 12, speed: 0, curH: 12,
    flyers: { ship: 2, parrot: 4 }, couriers: [], seq: 1,
  };
  const VIEWS = { iso: { el: 0.72 }, top: { el: 1.36 }, side: { el: 0.28 } };
  if (opts.view && VIEWS[opts.view]) { S.view.el = S.viewTarget.el = VIEWS[opts.view].el; }

  // ---------- lights ----------
  const amb = new THREE.AmbientLight(0xffffff, 0.55); scene.add(amb);
  const hemi = new THREE.HemisphereLight(0xdff3ff, 0x7aa36a, 0.45); scene.add(hemi);
  const sun = new THREE.DirectionalLight(0xfff1d6, 1.55);
  sun.castShadow = true; sun.shadow.mapSize.set(2048, 2048);
  Object.assign(sun.shadow.camera, { left: -62, right: 62, top: 62, bottom: -62, near: 1, far: 300 });
  sun.shadow.bias = -0.0004; sun.shadow.normalBias = 0.04;
  scene.add(sun, sun.target);

  // dark navy branded background, darker toward the edges
  const bgCv = document.createElement('canvas'); bgCv.width = bgCv.height = 160;
  const bgTex = new THREE.CanvasTexture(bgCv); bgTex.colorSpace = THREE.SRGBColorSpace; scene.background = bgTex;
  let bgKey = '';
  function paintBg(night, warm) {
    const k = (night * 10 | 0) + '|' + (warm * 6 | 0); if (k === bgKey) return; bgKey = k;
    const g = bgCv.getContext('2d');
    g.fillStyle = '#05060b'; g.fillRect(0, 0, 160, 160);                 // near-black field (stays put while the land rotates)
    const gr = g.createRadialGradient(80, 83, 5, 80, 86, 82);            // centered glow spot = backlight behind the island
    const glow = [lerp(116, 54, night) + warm * 24, lerp(140, 76, night) + warm * 12, lerp(176, 118, night)];
    const mid = [glow[0] * 0.34 + 7, glow[1] * 0.34 + 8, glow[2] * 0.4 + 12];
    const edge = [5, 6, 12];
    const hx = (c) => '#' + c.map((v) => Math.round(clamp(v, 0, 255)).toString(16).padStart(2, '0')).join('');
    gr.addColorStop(0, hx(glow)); gr.addColorStop(0.42, hx(mid)); gr.addColorStop(1, hx(edge));
    g.fillStyle = gr; g.fillRect(0, 0, 160, 160); bgTex.needsUpdate = true;
    }

  // ---------- terrain grid: big, flat, open island ----------
  const G = 62, SZ = 2 * G + 1;
  const H = new Int8Array(SZ * SZ), T = new Uint8Array(SZ * SZ); // T: 0 ground, 1 path/plaza, 2 rock, 3 pier
  const I = (x, z) => (x + G) * SZ + (z + G);
  const inG = (x, z) => x >= -G && x <= G && z >= -G && z <= G;
  const hAt = (x, z) => (inG(x, z) ? H[I(x, z)] : 0);

  const ISLETS = [[-44, -6, 6], [42, -26, 5], [-28, 36, 4.5], [38, 28, 4.5], [-46, 22, 3.5]];
  for (let x = -G; x <= G; x++) for (let z = -G; z <= G; z++) {
    const n = vnoise(x * 0.07, z * 0.07) * 8 + vnoise(x * 0.17 + 5, z * 0.17 - 3) * 3.4;
    const d = Math.hypot(x * 0.95, (z - 2) * 1.02) - n;
    let h = 0;
    if (d < 34) h = 1;
    if (d < 30) h = 2;
    const hd = Math.hypot(x + 23, z + 18) - vnoise(x * 0.3, z * 0.3) * 1.6;
    if (hd < 8) h = Math.max(h, 3);
    if (hd < 4.5) h = Math.max(h, 4);
    for (const [ix, iz, r] of ISLETS) { const di = Math.hypot(x - ix, z - iz) - vnoise(x * 0.4, z * 0.4) * 1.5; if (di < r) h = Math.max(h, di < r - 1.6 ? 2 : 1); }
    H[I(x, z)] = h;
  }
  const flat = (x0, z0, w, d, lv) => { for (let x = x0; x < x0 + w; x++) for (let z = z0; z < z0 + d; z++) if (inG(x, z) && H[I(x, z)] >= 1) { H[I(x, z)] = lv; T[I(x, z)] = 0; } };
  const markPath = (pts, wdt = 3) => {
    for (let i = 0; i < pts.length - 1; i++) {
      const [ax, az] = pts[i], [bx, bz] = pts[i + 1], steps = Math.max(Math.abs(bx - ax), Math.abs(bz - az));
      for (let st = 0; st <= steps; st++) { const x = Math.round(ax + (bx - ax) * st / steps), z = Math.round(az + (bz - az) * st / steps);
        for (let ox = 0; ox < wdt; ox++) for (let oz = 0; oz < wdt; oz++) if (inG(x + ox, z + oz) && H[I(x + ox, z + oz)] >= 1 && H[I(x + ox, z + oz)] < 3) T[I(x + ox, z + oz)] = 1; }
    }
  };

  // building lots — spaced far apart, each surrounded by open ground
  const LOT = { tavern: [-16, -8], tower: [-23, -19], forge: [13, -15], harbour: [20, 9],
    houseA: [-26, 6], houseB: [-10, 20], houseC: [16, 17], totem: [-3, 8], well: [2, 1] };
  flat(-17, -9, 11, 8, 2);    // tavern
  flat(-24, -20, 9, 9, 4);    // tower hilltop
  flat(12, -16, 8, 7, 2);     // forge
  flat(18, 8, 7, 6, 2);       // harbour
  flat(-27, 5, 7, 7, 2);      // house A
  flat(-11, 19, 7, 7, 2);     // house B
  flat(15, 16, 7, 7, 2);      // house C
  flat(5, -18, 18, 5, 2);     // stall row
  flat(-6, 5, 10, 10, 2);     // totem garden
  // wide open plaza + sandy streets (the negative space between buildings)
  markPath([[2, 1], [1, 9], [-6, 16], [-10, 20]], 3);
  markPath([[2, 1], [9, -5], [13, -13]], 3);
  markPath([[1, 2], [-10, -4], [-16, -7]], 3);
  markPath([[5, 2], [13, 6], [20, 9]], 3);
  markPath([[6, 3], [13, 13], [16, 17]], 2);
  markPath([[9, -5], [11, -16]], 2);

  const PIER = { x0: 24, x1: 38, z0: 9, z1: 11 };
  for (let x = PIER.x0; x <= PIER.x1; x++) for (let z = PIER.z0; z <= PIER.z1; z++) if (!hAt(x, z)) T[I(x, z)] = 3;

  const ROCKS = [[-36, -22, 2], [32, 26, 2], [18, -34, 1], [-14, 38, 1], [44, 8, 2], [-40, 30, 1]];
  for (const [rx, rz, srk] of ROCKS) for (let x = rx; x < rx + 1 + srk; x++) for (let z = rz; z < rz + 1 + srk; z++) if (!hAt(x, z)) { H[I(x, z)] = (x + z) % 2 ? 2 : 1; T[I(x, z)] = 2; }

  // ---------- voxelize terrain ----------
  const land = new Vox();
  for (let x = -G; x <= G; x++) for (let z = -G; z <= G; z++) {
    const h = H[I(x, z)]; if (!h) continue; const tp = T[I(x, z)];
    const nb = Math.min(hAt(x + 1, z), hAt(x - 1, z), hAt(x, z + 1), hAt(x, z - 1));
    for (let y = Math.max(0, Math.min(nb, h - 1) - 1); y < h; y++) {
      let c;
      if (tp === 2) c = y === h - 1 ? PAL.rockTop : (y % 2 ? PAL.rock : PAL.rock2);
      else if (y === h - 1) {
        if (h === 1) c = rng() < 0.2 ? PAL.sand : PAL.sandTop;
        else if (tp === 1) c = rng() < 0.25 ? PAL.sandTop : PAL.path;
        else { const r = rng(); c = r < 0.18 ? PAL.grass3 : r < 0.45 ? PAL.grass2 : r < 0.53 ? PAL.grassDk : PAL.grass; }
      } else c = y === 0 ? PAL.sandDeep : ((y + (x & 1)) % 3 === 0 ? PAL.sandDk : PAL.sand);
      land.put(x, y, z, c);
    }
  }

  // ---------- props ----------
  const vox = land, glow = new Vox(), fireV = new Vox();

  // compact single palm (small crown so it never blankets the top view)
  function palm(x, z, ht = 6) {
    const y0 = hAt(x, z); if (!y0) return; let px = x; const dz = rng() < 0.5 ? 1 : -1;
    for (let i = 0; i < ht; i++) { if (i === ht - 1) px += 0; vox.put(px, y0 + i, z, i % 2 ? PAL.trunk : PAL.trunk2); }
    const ty = y0 + ht; vox.put(px, ty, z, PAL.leaf);
    for (const [ax, az] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) { vox.put(px + ax, ty, z + az, PAL.leaf); vox.put(px + ax * 2, ty - 1, z + az * 2, PAL.leafLt); }
    for (const [ax, az] of [[1, 1], [-1, 1], [1, -1], [-1, -1]]) vox.put(px + ax, ty, z + az, PAL.leaf2);
    vox.put(px + 1, ty - 1, z + dz, PAL.coconut);
  }

  function house(x0, z0, w, d, wh, o = {}) {
    const y0 = hAt(x0, z0), wall = o.wall || PAL.wall, wall2 = o.wall2 || PAL.wall2, r1 = o.roof || PAL.roof, r2 = o.roof2 || PAL.roof2, rd = o.roofDk || PAL.roofDk;
    for (let x = 0; x < w; x++) for (let z = 0; z < d; z++) for (let y = 0; y < wh; y++) {
      const edge = x === 0 || x === w - 1 || z === 0 || z === d - 1; if (!edge) continue;
      const corner = (x === 0 || x === w - 1) && (z === 0 || z === d - 1);
      let c = corner ? PAL.woodDk : (y === 0 ? PAL.stone2 : ((x + z) % 2 ? wall : wall2));
      const frontZ = z === d - 1, frontX = x === w - 1;
      if (!corner && y === wh - 1) c = PAL.woodDk;
      if (frontZ && y < 2 && Math.abs(x - (w - 1) / 2) < 1) c = PAL.woodDk;
      const win = y === 2 && !corner && ((frontZ && (x === 1 || x === w - 2) && w > 4) || (frontX && (z === 1 || z === d - 2)));
      if (win) { glow.put(x0 + x, y0 + y, z0 + z, PAL.glass); continue; }
      vox.put(x0 + x, y0 + y, z0 + z, c);
    }
    for (let k = 0; ; k++) {
      const zl = -1 + k, zr = d - k; if (zl > zr) break; const yy = y0 + wh + k;
      for (let x = -1; x <= w; x++) for (let z = zl; z <= zr; z++) { const shell = z === zl || z === zr || zl + 1 >= zr; if (!shell) continue; const isRidge = zl + 1 >= zr; vox.put(x0 + x, yy, z0 + z, isRidge ? rd : (k === 0 ? rd : ((x + k) % 2 ? r1 : r2))); }
      if (zl + 1 < zr) for (const gx of [0, w - 1]) for (let z = zl + 1; z < zr; z++) vox.put(x0 + gx, yy, z0 + z, wall2);
    }
    if (o.chimney) { const cx = x0 + w - 2, cz = z0 + 1; for (let y = y0 + wh; y < y0 + wh + Math.ceil(d / 2) + 2; y++) vox.put(cx, y, cz, y % 2 ? PAL.stone : PAL.stone2); }
    return { y0, top: y0 + wh + Math.ceil(d / 2) };
  }

  // tavern (big, golden) with round emblem + barrels
  const tav = house(LOT.tavern[0], LOT.tavern[1], 9, 7, 5, { wall: PAL.wood, wall2: PAL.woodLt, roof: PAL.roof, roof2: PAL.roof2, chimney: true });
  { const ex = LOT.tavern[0] + 4, ez = LOT.tavern[1] + 7; for (let a = 0; a < 16; a++) { const ang = a / 16 * Math.PI * 2; vox.put(ex + Math.round(Math.cos(ang) * 1.6), tav.y0 + 3 + Math.round(Math.sin(ang) * 1.6), ez, PAL.roofB); } vox.put(ex, tav.y0 + 3, ez, PAL.white); vox.put(ex + 1, tav.y0 + 3, ez, PAL.yellow); vox.put(ex - 1, tav.y0 + 3, ez, PAL.yellow); vox.put(ex, tav.y0 + 4, ez, PAL.yellow); vox.put(ex, tav.y0 + 2, ez, PAL.yellow); glow.put(ex, tav.y0 + 1, ez, 0xffc86b); }
  for (const [bx, bz] of [[LOT.tavern[0] + 10, LOT.tavern[1] + 2], [LOT.tavern[0] + 10, LOT.tavern[1] + 4]]) { const by = hAt(bx, bz); if (by) { vox.put(bx, by, bz, PAL.plank); vox.put(bx, by + 1, bz, PAL.woodDk); vox.put(bx, by + 2, bz, PAL.plank); } }

  // watchtower on the hill
  { const x0 = LOT.tower[0] + 1, z0 = LOT.tower[1] + 1, y0 = hAt(x0, z0);
    for (const [cx, cz] of [[0, 0], [4, 0], [0, 4], [4, 4]]) for (let y = 0; y < 7; y++) vox.put(x0 + cx, y0 + y, z0 + cz, PAL.woodDk);
    for (let x = 0; x < 5; x++) for (let z = 0; z < 5; z++) vox.put(x0 + x, y0 + 6, z0 + z, (x + z) % 2 ? PAL.plank : PAL.wood);
    for (let i = 0; i < 5; i++) { vox.put(x0 + i, y0 + 3, z0, PAL.woodDk); vox.put(x0 + i, y0 + 3, z0 + 4, PAL.woodDk); vox.put(x0, y0 + 3, z0 + i, PAL.woodDk); vox.put(x0 + 4, y0 + 3, z0 + i, PAL.woodDk); vox.put(x0 + i, y0 + 7, z0, PAL.wood); vox.put(x0 + i, y0 + 7, z0 + 4, PAL.wood); }
    for (let k = 0; k < 4; k++) for (let x = -1 + k; x <= 5 - k; x++) for (let z = -1 + k; z <= 5 - k; z++) { const sh = x === -1 + k || x === 5 - k || z === -1 + k || z === 5 - k; if (sh || k === 3) vox.put(x0 + x, y0 + 9 + k, z0 + z, k === 0 ? PAL.roofDk : ((x + z) % 2 ? PAL.roof : PAL.roof2)); }
    for (let y = 0; y < 3; y++) vox.put(x0 + 2, y0 + 13 + y, z0 + 2, PAL.woodDk);
    for (let x = 1; x <= 3; x++) for (let y = 0; y < 2; y++) vox.put(x0 + 2 + x, y0 + 14 + y, z0 + 2, y === 1 && x === 2 ? PAL.yellow : PAL.red);
    glow.put(x0 + 2, y0 + 7, z0 + 2, 0xffd36b); }

  // forge (stone, fire, chimney, anvil)
  { const x0 = LOT.forge[0], z0 = LOT.forge[1], y0 = hAt(x0, z0), w = 6, d = 5;
    for (let x = 0; x < w; x++) for (let z = 0; z < d; z++) for (let y = 0; y < 4; y++) { const edge = x === 0 || x === w - 1 || z === 0; if (!edge) continue; vox.put(x0 + x, y0 + y, z0 + z, (x + y + z) % 3 ? PAL.stone : PAL.stone2); }
    for (let x = -1; x <= w; x++) for (let z = -1; z <= d; z++) vox.put(x0 + x, y0 + 4, z0 + z, (x + z) % 2 ? PAL.roofR : PAL.roofR2);
    for (let x = 0; x < w; x++) for (let z = 0; z < d - 1; z++) vox.put(x0 + x, y0 + 5, z0 + z, (x + z) % 2 ? PAL.roofR2 : PAL.roofR);
    for (let y = 0; y < 10; y++) { vox.put(x0 + 1, y0 + y, z0 + 1, y % 2 ? PAL.stoneDk : PAL.stone2); vox.put(x0 + 2, y0 + y, z0 + 1, PAL.stone2); }
    fireV.put(x0 + 3, y0, z0 + 2, PAL.fire); fireV.put(x0 + 4, y0, z0 + 2, PAL.fire2); fireV.put(x0 + 3, y0 + 1, z0 + 2, PAL.fire2); fireV.put(x0 + 4, y0, z0 + 3, PAL.ember);
    vox.put(x0 + 3, y0, z0 + 6, PAL.stoneDk); vox.put(x0 + 3, y0 + 1, z0 + 6, PAL.black); vox.put(x0 + 4, y0 + 1, z0 + 6, PAL.black); }

  // market stalls (spaced along the street)
  [[5, -17, PAL.red], [12, -17, PAL.green], [19, -17, PAL.purple]].forEach(([x0, z0, col], si) => {
    const y0 = hAt(x0, z0); if (!y0) return;
    for (const [cx, cz] of [[0, 0], [3, 0], [0, 2], [3, 2]]) for (let y = 0; y < 3; y++) vox.put(x0 + cx, y0 + y, z0 + cz, PAL.woodDk);
    for (let x = -1; x <= 4; x++) for (let z = -1; z <= 3; z++) vox.put(x0 + x, y0 + 3 + (z > 1 ? 0 : 1), z0 + z, x % 2 ? col : PAL.white);
    for (let x = 0; x < 4; x++) { vox.put(x0 + x, y0 + 1, z0 + 1, PAL.plank); vox.put(x0 + x, y0 + 2, z0 + 1, [[PAL.red, PAL.yellow, PAL.green], [PAL.yellow, PAL.pink, PAL.teal], [PAL.purple, PAL.red, PAL.yellow]][si][x % 3]); }
  });

  // harbour house + pier with posts & lanterns
  house(LOT.harbour[0], LOT.harbour[1], 6, 5, 4, { roof: PAL.roofB, roof2: PAL.roofB2, roofDk: 0x2c66b0 });
  for (let x = PIER.x0 - 2; x <= PIER.x1; x++) for (let z = PIER.z0; z <= PIER.z1; z++) { if (hAt(x, z) > 1) continue; vox.put(x, 0, z, (x + z) % 2 ? PAL.plank : PAL.wood); }
  for (let x = PIER.x0; x <= PIER.x1; x += 3) for (const z of [PIER.z0 - 1, PIER.z1 + 1]) { vox.put(x, -1, z, PAL.woodDk); vox.put(x, 0, z, PAL.woodDk); vox.put(x, 1, z, PAL.woodDk); }
  for (const z of [PIER.z0 - 1, PIER.z1 + 1]) { vox.put(PIER.x1, 2, z, PAL.woodDk); glow.put(PIER.x1, 3, z, 0xffd36b); }

  // totem garden (hedge ring + flowers)
  { const cx = LOT.totem[0], cz = LOT.totem[1], y0 = hAt(cx, cz); if (y0) {
    for (let x = -3; x <= 3; x++) for (let z = -3; z <= 3; z++) { const ring = Math.max(Math.abs(x), Math.abs(z)) === 3; if (ring && !(z === -3 && Math.abs(x) <= 0)) vox.put(cx + x, y0, cz + z, (x + z) % 2 ? PAL.hedge : PAL.hedge2); }
    [PAL.red, PAL.teal, PAL.yellow, PAL.purple, PAL.red, PAL.teal].forEach((c, i) => vox.put(cx, y0 + i, cz, c));
    vox.put(cx - 1, y0 + 3, cz, PAL.yellow); vox.put(cx + 1, y0 + 3, cz, PAL.yellow); vox.put(cx, y0 + 6, cz, PAL.yellow);
    for (const [fx, fz, fc] of [[-2, -1, PAL.pink], [2, 1, PAL.white], [-1, 2, PAL.pink], [1, -2, PAL.white]]) vox.put(cx + fx, y0, cz + fz, fc); } }

  // houses (each on its own lot)
  house(LOT.houseA[0], LOT.houseA[1], 5, 5, 4, { roof: PAL.roofR, roof2: PAL.roofR2, roofDk: 0xb23a2e });
  house(LOT.houseB[0], LOT.houseB[1], 5, 5, 4, { roof: PAL.roof, roof2: PAL.roof2, chimney: true });
  house(LOT.houseC[0], LOT.houseC[1], 6, 5, 4, { roof: PAL.roofB, roof2: PAL.roofB2, roofDk: 0x2c66b0 });

  // well in the plaza
  { const x = LOT.well[0], z = LOT.well[1], y = hAt(x, z); if (y) { for (const [dx, dz] of [[0, 0], [1, 0], [0, 1], [1, 1]]) { vox.put(x + dx, y, z + dz, PAL.stone2); vox.put(x + dx, y + 1, z + dz, (dx + dz) % 2 ? PAL.stone : PAL.stoneDk); } vox.put(x, y + 3, z, PAL.woodDk); vox.put(x + 1, y + 3, z, PAL.woodDk); vox.put(x, y + 4, z, PAL.roofDk); vox.put(x + 1, y + 4, z, PAL.roofDk); glow.put(x, y + 2, z + 1, 0x8fe3ff); } }

  // ---- detail objects (the "штучные" pieces) ----
  // pirate skeleton resting by a chest
  function skeleton(x, z) { const y = hAt(x, z); if (!y) return; const B = 0xe9e7dc, B2 = 0xcfcdc2, DK = 0x3a3a40;
    vox.put(x, y, z, B2); vox.put(x, y + 1, z, B); vox.put(x, y + 2, z, B); // spine
    vox.put(x - 1, y + 1, z, B2); vox.put(x + 1, y + 1, z, B2); // arms out
    vox.put(x - 1, y, z - 1, B2); vox.put(x + 1, y, z - 1, B2); // legs
    vox.put(x, y + 1, z - 1, DK); // belt/gap
  }
  function chest(x, z) { const y = hAt(x, z); if (!y) return; vox.put(x, y, z, PAL.woodDk); vox.put(x + 1, y, z, PAL.woodDk); vox.put(x, y + 1, z, PAL.wood); vox.put(x + 1, y + 1, z, PAL.wood); vox.put(x, y + 2, z, PAL.woodDk); vox.put(x + 1, y + 2, z, PAL.woodDk); glow.put(x, y + 2, z, PAL.yellow); glow.put(x + 1, y + 2, z, PAL.yellow); }
  function campfire(x, z) { const y = hAt(x, z); if (!y) return; vox.put(x - 1, y, z, PAL.woodDk); vox.put(x + 1, y, z, PAL.wood); vox.put(x, y, z - 1, PAL.wood); vox.put(x, y, z + 1, PAL.woodDk); fireV.put(x, y, z, PAL.fire); fireV.put(x, y + 1, z, PAL.fire2); }
  skeleton(-20, 26); chest(-18, 26); chest(LOT.tavern[0] + 10, LOT.tavern[1] + 6); campfire(6, 3);
  // a couple of crates & a rowboat on the sand
  for (const [cx, cz] of [[22, 10], [23, 10], [-24, -2]]) { const y = hAt(cx, cz); if (y && T[I(cx, cz)] !== 3) { vox.put(cx, y, cz, PAL.plank); vox.put(cx, y + 1, cz, PAL.woodDk); } }
  { const x = 24, z = 18, y = hAt(x, z); if (y) { for (let i = -1; i <= 1; i++) { vox.put(x + i, y, z, PAL.woodDk); vox.put(x + i, y + 1, z, i === 0 ? PAL.plank : PAL.wood); } vox.put(x - 2, y, z, PAL.woodDk); vox.put(x + 2, y, z, PAL.woodDk); } }
  // signpost + flag near the plaza
  { const x = -2, z = 30, y = hAt(x, z); if (y) { for (let k = 0; k < 8; k++) vox.put(x, y + k, z, PAL.woodDk); for (let a = 1; a <= 3; a++) for (let b = 5; b < 8; b++) vox.put(x + a, y + b, z, a === 2 && b === 6 ? PAL.yellow : PAL.red); } }

  // ---- palms: individual, spaced, mostly by the beach + a small grove + islets ----
  const PALMS = [[-32, 6], [-30, -10], [30, 2], [33, 12], [-14, 30], [10, 30], [28, -12], [-30, 22], [6, -28], [26, 22],
    [-24, 16], [-22, 14], [-26, 13], [12, 24], [-16, -2]];
  PALMS.forEach(([x, z], i) => { if (hAt(x, z) >= 1 && !(inG(x, z) && T[I(x, z)])) palm(x, z, 5 + (i % 3)); });
  for (const [ix, iz] of ISLETS.map((a) => [a[0], a[1]])) { if (hAt(ix, iz) >= 1) palm(ix, iz, 5); if (hAt(ix + 1, iz + 1) >= 1 && rng() < 0.6) palm(ix + 1, iz + 1, 4); }

  // ---- sparse bushes & flowers only on open grass (keep breathing room) ----
  for (let i = 0; i < 55; i++) {
    const x = Math.round((rng() - 0.5) * 52), z = Math.round((rng() - 0.5) * 52), h = hAt(x, z), ti = inG(x, z) ? T[I(x, z)] : 0;
    if (h < 2 || ti || land.has(x, h, z) || vox.has(x, h, z)) continue;
    if (rng() < 0.3) { vox.put(x, h, z, PAL.leaf2); if (rng() < 0.5) vox.put(x, h + 1, z, PAL.leafLt); }
    else vox.put(x, h, z, [PAL.pink, PAL.white, PAL.yellow][(rng() * 3) | 0]);
  }

  // ---------- build static meshes ----------
  const landMat = new THREE.MeshLambertMaterial({ color: 0xffffff });
  const landMesh = land.mesh(landMat, 0.035, rng); scene.add(landMesh);
  const glowMat = new THREE.MeshLambertMaterial({ color: 0xffffff, emissive: new THREE.Color(0xffc45a), emissiveIntensity: 0 });
  const glowMesh = glow.mesh(glowMat, 0, rng); scene.add(glowMesh);
  const fireMat = new THREE.MeshBasicMaterial({ color: 0xffffff });
  const fireMesh = fireV.mesh(fireMat, 0, rng); fireMesh.castShadow = false; scene.add(fireMesh);

  // ---------- water tiles coloured by distance to land ----------
  const dist = new Int16Array(SZ * SZ).fill(99), q = [];
  for (let x = -G; x <= G; x++) for (let z = -G; z <= G; z++) if (H[I(x, z)] > 0) { dist[I(x, z)] = 0; q.push(x, z); }
  for (let qi = 0; qi < q.length; qi += 2) {
    const x = q[qi], z = q[qi + 1], d0 = dist[I(x, z)]; if (d0 > 10) continue;
    for (const [dx, dz] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) { const nx = x + dx, nz = z + dz; if (inG(nx, nz) && dist[I(nx, nz)] > d0 + 1) { dist[I(nx, nz)] = d0 + 1; q.push(nx, nz); } }
  }
  const water = []; const wcol = (d) => {
    const r = rng();
    if (d <= 1) return r < 0.55 ? PAL.foam : PAL.foam2;
    if (d === 2) return r < 0.25 ? PAL.foam2 : PAL.shallow;
    if (d === 3) return r < 0.5 ? PAL.shallow : PAL.shallow2;
    if (d <= 5) return r < 0.5 ? PAL.shallow2 : PAL.mid;
    if (d <= 8) return r < 0.5 ? PAL.mid : PAL.mid2;
    return r < 0.55 ? PAL.deep : PAL.deep2;
  };
  for (let x = -G; x <= G; x++) for (let z = -G; z <= G; z++) { if (H[I(x, z)] > 0 || T[I(x, z)] === 3) continue; water.push([x, z, wcol(dist[I(x, z)])]); }
  const waterMesh = new THREE.InstancedMesh(new THREE.BoxGeometry(1, 0.3, 1), new THREE.MeshLambertMaterial({ color: 0xffffff }), water.length);
  {
    const m = new THREE.Matrix4(), c = new THREE.Color();
    water.forEach(([x, z, col], i) => { m.makeTranslation(x + 0.5, 0.35, z + 0.5); waterMesh.setMatrixAt(i, m); c.setHex(col).offsetHSL(0, 0, (rng() - 0.5) * 0.04); waterMesh.setColorAt(i, c); });
    waterMesh.receiveShadow = true; waterMesh.instanceColor.needsUpdate = true;
  }
  scene.add(waterMesh);
  const waterBase = Float32Array.from(waterMesh.instanceColor.array);
  // ---------- floating slab: a water-blue rim (with the brand text) over a brown earth cone ----------
  const EARTH = { dirt: 0x9c6a35, dirtDk: 0x7a4e26, rock: 0x6b4a30, rockDk: 0x503724 };
  const RIM = { c1: PAL.deep, c2: PAL.mid2, c3: PAL.deep2 };
  const RIMH = 9, DEEP = 34;
  const FONT = { A: ["01110","10001","10001","11111","10001","10001","10001"], B: ["11110","10001","10001","11110","10001","10001","11110"], C: ["01111","10000","10000","10000","10000","10000","01111"], E: ["11111","10000","10000","11110","10000","10000","11111"], L: ["10000","10000","10000","10000","10000","10000","11111"], N: ["10001","11001","10101","10011","10001","10001","10001"], P: ["11110","10001","10001","11110","10000","10000","10000"], S: ["01111","10000","10000","01110","00001","00001","11110"], U: ["10001","10001","10001","10001","10001","10001","01110"], ".": ["00000","00000","00000","00000","00000","01100","01100"] };
  const TXT = "SUNSPACE.CLUB", GW = 5, GH = 7, SP = 6, totalW = TXT.length * SP;
  const textKeys = new Set(), textList = [];
  function stamp(axis, dir, wall) {
    let cur = -totalW / 2 + 0.5;
    for (const ch of TXT) { const g = FONT[ch] || FONT['.'];
      for (let r = 0; r < GH; r++) for (let c = 0; c < GW; c++) if (g[r][c] === '1') {
        const a = cur + c, y = -(r + 2); let x, z;
        if (axis === 'x') { x = Math.round(dir * a); z = wall; } else { z = Math.round(dir * a); x = wall; }
        const k = x + '|' + y + '|' + z; if (!textKeys.has(k)) { textKeys.add(k); textList.push([x, y, z]); }
      }
      cur += SP;
    }
  }
  stamp('x', 1, G); stamp('x', -1, -G); stamp('z', -1, G); stamp('z', 1, -G);

  const earthV = new Vox();
  for (let i = 0; i <= DEEP; i++) {
    const yL = -(i + 1), cap = i >= DEEP - 1;
    let r; if (i < RIMH) r = G; else { const t = (i - RIMH) / (DEEP - RIMH); r = Math.round(G - (G - 3) * t); }
    for (let x = -r; x <= r; x++) for (let z = -r; z <= r; z++) {
      const m = Math.max(Math.abs(x), Math.abs(z));
      if (i < RIMH) { if (m !== G) continue; } else if (!cap && m <= r - 3) continue;
      if (i < RIMH) {
        if (textKeys.has(x + '|' + yL + '|' + z)) continue;       // leave the text voxels blank
        const nz = (vnoise(x * 0.3 + i, z * 0.3) + 1) * 0.5;
        earthV.put(x, yL, z, nz < 0.4 ? RIM.c2 : (nz < 0.75 ? RIM.c1 : RIM.c3));
      } else {
        const nz = (vnoise(x * 0.26 + i * 0.4, z * 0.26) + 1) * 0.5; let c;
        if (i < DEEP * 0.45) c = nz < 0.5 ? EARTH.dirt : EARTH.dirtDk;
        else if (i < DEEP * 0.78) c = nz < 0.5 ? EARTH.dirtDk : EARTH.rock;
        else c = nz < 0.5 ? EARTH.rock : EARTH.rockDk;
        earthV.put(x, yL, z, c);
      }
    }
  }
  const earthMesh = earthV.mesh(new THREE.MeshLambertMaterial({ color: 0xffffff, emissive: 0x120a04, emissiveIntensity: 0.5 }), 0.05, rng);
  earthMesh.castShadow = false; scene.add(earthMesh);
  // light-blue brand text glowing on the blue rim
  const textV = new Vox(); for (const [x, y, z] of textList) textV.put(x, y, z, 0x9fe6ff);
  const textMesh = textV.mesh(new THREE.MeshLambertMaterial({ color: 0x9fe6ff, emissive: 0x4aa8dc, emissiveIntensity: 0.95 }), 0, rng);
  textMesh.castShadow = false; scene.add(textMesh);

  // ---------- edge waterfalls: discrete streams pouring off the rim, fading as they fall ----------
  const wfCv = document.createElement('canvas'); wfCv.width = 32; wfCv.height = 64;
  { const g = wfCv.getContext('2d'); g.clearRect(0, 0, 32, 64); const cols = ['#9bd8ff', '#c8ecff', '#6fb6e8', '#ffffff', '#58a6db'];
    for (let cx = 0; cx < 32; cx += 2) { const col = cols[(rng() * cols.length) | 0]; let on = rng() < 0.75;
      for (let y = 0; y < 64; y++) { if (rng() < 0.07) on = !on; if (!on) continue; g.globalAlpha = 0.5 + rng() * 0.5; g.fillStyle = col; g.fillRect(cx, y, 2, 1); } }
    g.globalAlpha = 1; }
  const wfMap = new THREE.CanvasTexture(wfCv); wfMap.wrapS = wfMap.wrapT = THREE.RepeatWrapping; wfMap.magFilter = THREE.NearestFilter; wfMap.minFilter = THREE.NearestFilter; wfMap.colorSpace = THREE.SRGBColorSpace; wfMap.repeat.set(2, 3);
  const faCv = document.createElement('canvas'); faCv.width = 2; faCv.height = 64;
  { const g = faCv.getContext('2d'); for (let y = 0; y < 64; y++) { const t = 1 - y / 63; const a = Math.round(clamp(Math.pow(t, 0.8), 0, 1) * 255); g.fillStyle = 'rgb(' + a + ',' + a + ',' + a + ')'; g.fillRect(0, y, 2, 1); } }
  const wfAlpha = new THREE.CanvasTexture(faCv); wfAlpha.wrapS = wfAlpha.wrapT = THREE.ClampToEdgeWrapping;
  const wfMat = new THREE.MeshBasicMaterial({ map: wfMap, alphaMap: wfAlpha, transparent: true, opacity: 0.9, depthWrite: false, side: THREE.DoubleSide, color: 0xffffff });
  const wfGeo = new THREE.PlaneGeometry(7, 22), wfY = 0.3 - 11, R = G + 0.55, PER = 6, span = 2 * G / PER;
  const wfFalls = [];
  for (let j = 0; j < PER; j++) {
    const t = Math.round(-G + (j + 0.5) * span);
    for (const [px, pz, ry] of [[t, R, 0], [t, -R, Math.PI], [R, t, Math.PI / 2], [-R, t, -Math.PI / 2]]) {
      const mf = new THREE.Mesh(wfGeo, wfMat); mf.position.set(px, wfY - (rng() * 2), pz); mf.rotation.y = ry; scene.add(mf); wfFalls.push(mf);
    }
  }
  // falling mist that drifts down off the rim and disappears
  const MIST = 380, mistPos = new Float32Array(MIST * 3);
  const mistSpawn = (i) => { const e = (rng() * 4) | 0, t = (rng() - 0.5) * 2 * G; if (e === 0) { mistPos[i * 3] = t; mistPos[i * 3 + 2] = G + 0.5; } else if (e === 1) { mistPos[i * 3] = t; mistPos[i * 3 + 2] = -G - 0.5; } else if (e === 2) { mistPos[i * 3] = G + 0.5; mistPos[i * 3 + 2] = t; } else { mistPos[i * 3] = -G - 0.5; mistPos[i * 3 + 2] = t; } mistPos[i * 3 + 1] = -1 - rng() * 18; };
  for (let i = 0; i < MIST; i++) mistSpawn(i);
  const mistGeo = new THREE.BufferGeometry(); mistGeo.setAttribute('position', new THREE.BufferAttribute(mistPos, 3));
  const mistPts = new THREE.Points(mistGeo, new THREE.PointsMaterial({ color: 0xbfe6ff, size: 0.8, transparent: true, opacity: 0.5, depthWrite: false }));
  scene.add(mistPts);

  // alternate backdrop for "infinite board" mode: endless blue sea with white flecks
  const seaCv = document.createElement('canvas'); seaCv.width = seaCv.height = 128;
  { const g = seaCv.getContext('2d'), gr = g.createLinearGradient(0, 0, 0, 128); gr.addColorStop(0, '#2a84c8'); gr.addColorStop(1, '#1c63ad'); g.fillStyle = gr; g.fillRect(0, 0, 128, 128);
    for (let i = 0; i < 200; i++) { const x = rng() * 128 | 0, y = rng() * 128 | 0, s = rng() < 0.8 ? 1 : 2; g.globalAlpha = 0.3 + rng() * 0.6; g.fillStyle = rng() < 0.5 ? '#bfeaff' : '#ffffff'; g.fillRect(x, y, s, s); }
    g.globalAlpha = 1; }
  const seaTex = new THREE.CanvasTexture(seaCv); seaTex.colorSpace = THREE.SRGBColorSpace; seaTex.magFilter = THREE.NearestFilter;

  // a giant 3D sea plane for the "endless sea" mode: light turquoise, same gradient as the island's water so there is no seam
  const seaA = new THREE.Color(0x45b4da), seaB = new THREE.Color(0x72d9ee), _tc = new THREE.Color(), seaFarCol = seaB.clone();
  const gcol = (r) => { const t = clamp((r - 40) / 150, 0, 1); return _tc.copy(seaA).lerp(seaB, t); };
  const SEA = 6000, SEG = 72, seaGeo = new THREE.PlaneGeometry(SEA, SEA, SEG, SEG);
  { const pos = seaGeo.attributes.position, col = new Float32Array(pos.count * 3);
    for (let i = 0; i < pos.count; i++) { const c = gcol(Math.hypot(pos.getX(i), pos.getY(i))); col[i * 3] = c.r; col[i * 3 + 1] = c.g; col[i * 3 + 2] = c.b; }
    seaGeo.setAttribute('color', new THREE.BufferAttribute(col, 3)); }
  const seaPlane = new THREE.Mesh(seaGeo, new THREE.MeshLambertMaterial({ vertexColors: true }));
  seaPlane.rotation.x = -Math.PI / 2; seaPlane.position.y = 0.44; seaPlane.receiveShadow = false; seaPlane.visible = false; scene.add(seaPlane);

  let mode = 'normal';
  const applyMode = (m) => { mode = m; const nrm = m === 'normal';
    earthMesh.visible = nrm; textMesh.visible = nrm; mistPts.visible = nrm; for (const f of wfFalls) f.visible = nrm;
    seaPlane.visible = m === 'sea'; scene.background = m === 'flat' ? seaTex : (m === 'sea' ? seaFarCol : bgTex); };

  // ---------- ship model ----------
  function buildShip(flagCol = PAL.red) {
    const v = new Vox();
    // hull
    for (let x = -7; x <= 7; x++) {
      const hw = x <= -6 ? 1 : x >= 6 ? (x === 7 ? 0 : 1) : 2;
      for (let z = -hw; z <= hw; z++) for (let y = 0; y < 3; y++) {
        if (y === 0 && Math.abs(z) === hw && hw > 0) continue;
        const shell = Math.abs(z) === hw || x === -7 || y === 0; if (!shell && y < 2) continue;
        v.put(x, y, z, y === 1 ? PAL.woodDk : (y === 2 ? PAL.woodLt : PAL.plank));
      }
      if (hw >= 1) for (let z = -hw + 1; z <= hw - 1; z++) v.put(x, 2, z, (x % 2) ? PAL.wood : PAL.plank);
    }
    // gold trim stripe
    for (let x = -6; x <= 5; x++) v.put(x, 2, 3 * 0 + (x % 2 ? 0 : 0), PAL.woodLt);
    // bow figurehead + bowsprit
    v.put(8, 3, 0, PAL.woodDk); v.put(7, 3, 0, PAL.yellow); v.put(7, 4, 0, PAL.yellow);
    // cannons poking from both sides
    for (const x of [-3, 0, 3]) for (const z of [-3, 3]) { v.put(x, 1, z, PAL.black); v.put(x, 1, z + Math.sign(z), PAL.stoneDk); }
    // portholes
    for (const x of [-4, -1, 2]) { v.put(x, 1, 3, PAL.yellow); v.put(x, 1, -3, PAL.yellow); }
    // stern cabin
    for (let x = -7; x <= -5; x++) for (let z = -1; z <= 1; z++) for (let y = 3; y < 5; y++) v.put(x, y, z, y === 4 ? PAL.roofDk : (x === -5 && z === 0 && y === 3 ? PAL.glass : PAL.wood));
    // main mast + crow's nest
    for (let y = 3; y < 17; y++) v.put(0, y, 0, PAL.woodDk);
    for (let z = -1; z <= 1; z++) for (let x = -1; x <= 1; x++) if (Math.abs(x) === 1 || Math.abs(z) === 1) v.put(x, 15, z, PAL.wood);
    for (let y = 3; y < 12; y++) v.put(4, y, 0, PAL.woodDk);
    // big main sail (white) with a black skull
    const SK = ["01110", "11111", "10101", "11111", "01110", "00100"]; // 5x6 skull-ish
    for (let z = -3; z <= 3; z++) for (let y = 6; y <= 13; y++) v.put(0, y, z, (Math.abs(z) === 3 || y === 6 || y === 13) ? PAL.wall2 : PAL.white);
    for (let r = 0; r < 6; r++) for (let c = 0; c < 5; c++) if (SK[r][c] === '1') v.put(0, 12 - r, c - 2, PAL.black);
    // eyes punched back to white
    v.put(0, 11, -1, PAL.white); v.put(0, 11, 1, PAL.white);
    // fore sail
    for (let z = -2; z <= 2; z++) for (let y = 6; y < 10; y++) v.put(4, y, z, z === 0 && y === 8 ? flagCol : PAL.white);
    // skull flag on top
    for (let x = 1; x <= 3; x++) for (let y = 16; y < 18; y++) v.put(x, y, 0, flagCol);
    v.put(0, 15, 1, PAL.woodDk); v.put(0, 15, -1, PAL.woodDk);
    const g = new THREE.Group(), m = v.mesh(new THREE.MeshLambertMaterial({ color: 0xffffff }), 0.025, rng);
    m.position.set(-0.5, 0, -0.5); g.add(m); g.scale.setScalar(0.6); return g;
  }
  function buildParrot(body = PAL.red, wing = PAL.green) {
    const g = new THREE.Group(), bm = (c) => new THREE.MeshLambertMaterial({ color: c });
    const b = new THREE.Mesh(new THREE.BoxGeometry(0.6, 0.6, 1.1), bm(body)); g.add(b);
    const hd = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.5, 0.5), bm(body)); hd.position.set(0, 0.25, 0.65); g.add(hd);
    const bk = new THREE.Mesh(new THREE.BoxGeometry(0.2, 0.25, 0.3), bm(PAL.yellow)); bk.position.set(0, 0.15, 0.95); g.add(bk);
    const tl = new THREE.Mesh(new THREE.BoxGeometry(0.3, 0.15, 0.8), bm(PAL.roofB)); tl.position.set(0, -0.05, -0.85); g.add(tl);
    const wl = new THREE.Mesh(new THREE.BoxGeometry(1.1, 0.12, 0.6), bm(wing)); wl.geometry.translate(-0.55, 0, 0); wl.position.set(-0.3, 0.1, 0); g.add(wl);
    const wr = new THREE.Mesh(new THREE.BoxGeometry(1.1, 0.12, 0.6), bm(wing)); wr.geometry.translate(0.55, 0, 0); wr.position.set(0.3, 0.1, 0); g.add(wr);
    g.userData.wings = [wl, wr]; g.traverse((o) => { if (o.isMesh) o.castShadow = true; });
    g.scale.setScalar(0.9); return g;
  }

  function buildGull() {
    const g = new THREE.Group(), w = new THREE.MeshLambertMaterial({ color: 0xf4f4f0 }), gm = new THREE.MeshLambertMaterial({ color: 0x9aa0a8 });
    g.add(new THREE.Mesh(new THREE.BoxGeometry(0.6, 0.55, 1.8), w));
    const head = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.5, 0.55), w); head.position.set(0, 0.18, 1.0); g.add(head);
    const beak = new THREE.Mesh(new THREE.BoxGeometry(0.16, 0.2, 0.35), new THREE.MeshLambertMaterial({ color: 0xf6a742 })); beak.position.set(0, 0.12, 1.35); g.add(beak);
    const tail = new THREE.Mesh(new THREE.BoxGeometry(0.45, 0.16, 0.7), gm); tail.position.set(0, 0, -1.1); g.add(tail);
    const wl = new THREE.Mesh(new THREE.BoxGeometry(2.6, 0.18, 0.9), w); wl.geometry.translate(-1.3, 0, 0); wl.position.set(-0.25, 0.12, 0);
    const wtl = new THREE.Mesh(new THREE.BoxGeometry(0.8, 0.2, 0.9), gm); wtl.position.set(-2.6, 0, 0); wl.add(wtl); g.add(wl);
    const wr = new THREE.Mesh(new THREE.BoxGeometry(2.6, 0.18, 0.9), w); wr.geometry.translate(1.3, 0, 0); wr.position.set(0.25, 0.12, 0);
    const wtr = new THREE.Mesh(new THREE.BoxGeometry(0.8, 0.2, 0.9), gm); wtr.position.set(2.6, 0, 0); wr.add(wtr); g.add(wr);
    g.userData.wings = [wl, wr]; g.scale.setScalar(2.1); return g;
  }
  // ---------- ambient movers ----------
  const ships = [], parrots = [];
  function rebuildFlyers() {
    for (const o of ships) scene.remove(o.g); for (const o of parrots) scene.remove(o.g); ships.length = 0; parrots.length = 0;
    for (let i = 0; i < S.flyers.ship; i++) { const g = buildShip([PAL.red, PAL.roofB, PAL.green][i % 3]); scene.add(g); ships.push({ g, a: i * 2.6 + 0.5, rx: 41 + i * 4, rz: 37 + i * 3, sp: (0.018 + i * 0.006) * (i % 2 ? -1 : 1) }); }
    const pc = [[PAL.red, PAL.green], [PAL.roofB, PAL.yellow], [PAL.yellow, PAL.roofB], [PAL.green, PAL.red], [PAL.purple, PAL.yellow]];
    for (let i = 0; i < S.flyers.parrot; i++) { const g = buildParrot(...pc[i % pc.length]); scene.add(g); parrots.push({ g, a: rng() * 6.28, r: 8 + rng() * 14, y: 13 + rng() * 6, sp: (0.25 + rng() * 0.2) * (rng() < 0.5 ? 1 : -1), ph: rng() * 6.28, cx: (rng() - 0.5) * 10, cz: (rng() - 0.5) * 10 }); }
  }
  function flap(g, t, speed = 14) { const f = Math.sin(t * speed) * 0.7; g.userData.wings[0].rotation.z = f; g.userData.wings[1].rotation.z = -f; }
  const gulls = [];
  for (let i = 0; i < 3; i++) { const g = buildGull(); scene.add(g); gulls.push({ g, a: rng() * 6.28, r: 17 + i * 6, y: 31 + i * 5, sp: (0.055 + rng() * 0.04) * (i % 2 ? -1 : 1), ph: rng() * 6.28 }); }

  // ---------- rain ----------
  const rainN = 2200, rp = new Float32Array(rainN * 3);
  for (let i = 0; i < rainN; i++) { rp[i * 3] = (rng() - 0.5) * 90; rp[i * 3 + 1] = rng() * 40; rp[i * 3 + 2] = (rng() - 0.5) * 90; }
  const rainGeo = new THREE.BufferGeometry(); rainGeo.setAttribute('position', new THREE.BufferAttribute(rp, 3));
  const rain = new THREE.Points(rainGeo, new THREE.PointsMaterial({ color: 0xcfe3f7, size: 2, sizeAttenuation: false, transparent: true, opacity: 0.7 }));
  rain.visible = false; scene.add(rain);

  // ---------- time & weather ----------
  function localHour() { if (S.timeMode === 'fixed') return S.hour; const off = S.live?.utcOffset ?? -new Date().getTimezoneOffset() * 60; return ((Date.now() / 1000 + off) % 86400 + 86400) % 86400 / 3600; }
  function solar() {
    const rise = S.live?.sunrise ?? 7.2, set = S.live?.sunset ?? 17.8, h = S.curH;
    if (h >= rise && h <= set) { const t = (h - rise) / (set - rise); return { day: true, t, el: Math.sin(Math.PI * t) }; }
    const len = 24 - (set - rise), since = h > set ? h - set : h + 24 - set, t = since / len; return { day: false, t, el: -Math.sin(Math.PI * t) };
  }
  const weather = () => (S.weatherMode === 'live' && S.live ? S.live : S.weather);
  const hex = (r, g, b) => '#' + [r, g, b].map((v) => Math.round(clamp(v, 0, 255)).toString(16).padStart(2, '0')).join('');
  function grade() {
    const s = solar(), w = weather(), gray = clamp(w.cloud * 0.45 + w.rain * 0.4 + (w.storm ? 0.3 : 0));
    const el = s.el, dayK = s.day ? smooth(el / 0.35) : 0, warm = s.day ? 1 - smooth(el / 0.3) : 0, night = s.day ? 0 : smooth(-el / 0.25);
    const az = s.day ? (s.t - 0.5) * Math.PI * 0.9 : (s.t - 0.5) * Math.PI * 0.9;
    const dir = new THREE.Vector3(Math.sin(az) * 0.9 - 0.35, Math.max(Math.abs(el), 0.25), 0.55 - Math.cos(az) * 0.2).normalize();
    sun.position.copy(dir).multiplyScalar(120); sun.target.position.set(0, 0, 0);
    if (s.day) { sun.color.setRGB(1, lerp(0.95, 0.66, warm), lerp(0.85, 0.42, warm)); sun.intensity = lerp(0.7, 1.55, dayK) * (1 - gray * 0.55); }
    else { sun.color.setRGB(0.55, 0.65, 1); sun.intensity = 0.32; }
    amb.color.setRGB(lerp(1, 0.45, night), lerp(1, 0.52, night), lerp(1, 0.85, night)); amb.intensity = lerp(0.55, 0.3, night) * (1 - gray * 0.15);
    hemi.intensity = lerp(0.45, 0.15, night);
    glowMat.emissiveIntensity = lerp(0, 1.6, clamp(night + warm * 0.4 + gray * 0.3));
    fireMat.color.setRGB(1, 0.75 + Math.sin(S.t * 12) * 0.12, 0.5);
    const topD = [60, 150, 236], horD = [182, 222, 250], topN = [12, 20, 48], horN = [34, 44, 86], horW = [255, 168, 112];
    let top = topD.map((v, i) => lerp(v, topN[i], night)), hor = horD.map((v, i) => lerp(lerp(v, horW[i], warm * 0.8), horN[i], night));
    top = top.map((v, i) => lerp(v, [120, 128, 146][i], gray * 0.6)); hor = hor.map((v, i) => lerp(v, [170, 178, 192][i], gray * 0.6));
    paintBg(night, warm);
    rain.visible = w.rain > 0.05 || w.snow > 0.05;
    rain.material.color.setHex(w.snow > w.rain ? 0xffffff : 0xcfe3f7); rain.material.size = w.snow > w.rain ? 3 : 2;
    return { s, w };
  }

  // ---------- courier delivery (ships dock at the pier, parrots fly in) ----------
  const MAP = { airship: 'ship', balloon: 'ship', eagle: 'parrot', ship: 'ship', parrot: 'parrot' };
  function deliver(widget, o = {}) {
    const kind = MAP[o.by] || 'ship';
    const at = [clamp(+(o.at?.[0] ?? 0.5), 0.05, 0.95), clamp(+(o.at?.[1] ?? 0.4), 0.1, 0.9)];
    const size = ['S', 'M', 'L'].includes(o.size) ? o.size : 'M';
    const g = kind === 'ship' ? buildShip(PAL.yellow) : buildParrot(PAL.red, PAL.green);
    if (kind === 'parrot') g.scale.multiplyScalar(size === 'L' ? 1.6 : size === 'S' ? 1 : 1.3);
    scene.add(g);
    const c = { id: S.seq++, kind, g, widget: String(widget).slice(0, 40), data: o.data || null, size, tag: o.tag ?? null, at, t: 0, state: 'in', dropped: false };
    if (kind === 'ship') { c.from = new THREE.Vector3(80, 0.45, 26); c.to = new THREE.Vector3(PIER.x1 + 5, 0.45, PIER.z0 - 3); c.dur = size === 'L' ? 5 : size === 'S' ? 11 : 8; }
    else { c.from = new THREE.Vector3(-70, 22, -30); c.to = new THREE.Vector3(1, 16, 4); c.dur = size === 'L' ? 3 : size === 'S' ? 8 : 5; }
    g.position.copy(c.from); S.couriers.push(c);
    return new Promise((res) => { c.resolve = res; });
  }
  function toScreen(v3) { const v = v3.clone().project(cam); return [(v.x * 0.5 + 0.5) * S.W, (-v.y * 0.5 + 0.5) * S.H]; }
  function stepCouriers() {
    for (const c of S.couriers) {
      c.t += S.dt;
      if (c.state === 'in') {
        const u = smooth(c.t / c.dur), p = c.from.clone().lerp(c.to, 1 - Math.pow(1 - clamp(c.t / c.dur), 3));
        c.g.position.copy(p); c.g.lookAt(c.to.x, p.y, c.to.z); if (c.kind === 'ship') c.g.rotateY(-Math.PI / 2);
        if (u >= 1) { c.state = 'hover'; c.t = 0; }
      } else if (c.state === 'hover') {
        if (!c.dropped && c.t > 0.5) {
          c.dropped = true;
          emit('drop', { id: c.id, widget: c.widget, data: c.data, size: c.size, tag: c.tag, from: toScreen(c.g.position.clone().add(new THREE.Vector3(0, c.kind === 'ship' ? 5 : 0, 0))), to: [c.at[0] * S.W, c.at[1] * S.H] });
          c.resolve?.(c.id);
        }
        if (c.t > 1.4) { c.state = 'out'; c.t = 0; c.out = c.kind === 'ship' ? new THREE.Vector3(c.to.x + 50, 0.45, c.to.z - 40) : new THREE.Vector3(70, 26, 40); c.base = c.g.position.clone(); }
      } else {
        const u = clamp(c.t / (c.kind === 'ship' ? 9 : 5)), p = c.base.clone().lerp(c.out, u * u);
        c.g.position.copy(p); c.g.lookAt(c.out.x, p.y, c.out.z); if (c.kind === 'ship') c.g.rotateY(-Math.PI / 2);
        if (u >= 1) c.done = true;
      }
      if (c.kind === 'ship') c.g.position.y = 0.55 + Math.sin(S.t * 1.6 + c.id) * 0.06; else flap(c.g, S.t + c.id);
    }
    S.couriers = S.couriers.filter((c) => { if (c.done) { scene.remove(c.g); return false; } return true; });
  }

  // ---------- camera ----------
  function applyCamera() {
    const v = S.view, tgt = new THREE.Vector3(1, 3, 2), r = 200;
    cam.position.set(tgt.x + Math.cos(v.el) * Math.sin(v.az) * r, tgt.y + Math.sin(v.el) * r, tgt.z + Math.cos(v.el) * Math.cos(v.az) * r);
    cam.up.set(0, 1, 0); cam.lookAt(tgt);
    const asp = S.W / S.H, f = v.zoom;
    cam.left = -f * asp; cam.right = f * asp; cam.top = f; cam.bottom = -f; cam.updateProjectionMatrix();
  }
  function resize() {
    const r = canvas.getBoundingClientRect(); S.W = Math.max(1, r.width); S.H = Math.max(1, r.height);
    renderer.setPixelRatio(1); renderer.setSize(Math.ceil(S.W / PIX), Math.ceil(S.H / PIX), false);
    canvas.style.width = '100%'; canvas.style.height = '100%'; applyCamera();
  }
  const ro = new ResizeObserver(resize); ro.observe(canvas); resize();

  // drag to rotate, wheel to zoom
  let drag = null;
  canvas.addEventListener('pointerdown', (e) => { drag = { x: e.clientX, y: e.clientY, az: S.viewTarget.az, el: S.viewTarget.el }; canvas.setPointerCapture(e.pointerId); });
  canvas.addEventListener('pointermove', (e) => { if (!drag) return; S.viewTarget.az = drag.az - (e.clientX - drag.x) * 0.006; S.viewTarget.el = clamp(drag.el + (e.clientY - drag.y) * 0.004, 0.2, 1.45); });
  canvas.addEventListener('pointerup', () => { drag = null; });
  canvas.addEventListener('wheel', (e) => { e.preventDefault(); S.viewTarget.zoom = clamp(S.viewTarget.zoom * (1 + Math.sign(e.deltaY) * 0.08), 12, 60); }, { passive: false });

  // ---------- loop ----------
  let sparkT = 0;
  const wc = waterMesh.instanceColor.array;
  function frame(now) {
    S.raf = requestAnimationFrame(frame);
    if (document.hidden) { S.last = now; return; }
    const dt = Math.min(0.05, (now - (S.last || now)) / 1000); S.last = now; S.dt = dt; S.t += dt;
    if (S.timeMode === 'fixed' && S.speed) S.hour = (S.hour + dt * S.speed / 3600 + 24) % 24;
    S.curH = localHour();
    const { w } = grade();

    if (S.autoRotate) S.viewTarget.az += dt * 0.05;
    const k = 1 - Math.exp(-dt * 4);
    S.view.az += (S.viewTarget.az - S.view.az) * k; S.view.el += (S.viewTarget.el - S.view.el) * k; S.view.zoom += (S.viewTarget.zoom - S.view.zoom) * k;
    applyCamera();

    // water sparkle: a few tiles flash white each tick
    sparkT += dt;
    if (sparkT > 0.34) {
      sparkT = 0; wc.set(waterBase);
      const n = 130;
      for (let i = 0; i < n; i++) { const j = (Math.random() * water.length) | 0; const d = dist[I(water[j][0], water[j][1])]; if (d < 3) continue; wc[j * 3] = wc[j * 3 + 1] = wc[j * 3 + 2] = 0.78; }
      waterMesh.instanceColor.needsUpdate = true;
    }

    for (const o of ships) { o.a += o.sp * dt; const x = Math.cos(o.a) * o.rx, z = Math.sin(o.a) * o.rz; o.g.position.set(x, 0.55 + Math.sin(S.t * 1.5 + o.a) * 0.06, z); const nx = Math.cos(o.a + Math.sign(o.sp) * 0.05) * o.rx, nz = Math.sin(o.a + Math.sign(o.sp) * 0.05) * o.rz; o.g.lookAt(nx, o.g.position.y, nz); o.g.rotateY(-Math.PI / 2); o.g.rotation.z = Math.sin(S.t * 1.2 + o.a) * 0.04; }
    for (const o of parrots) { o.a += o.sp * dt; const x = o.cx + Math.cos(o.a) * o.r, z = o.cz + Math.sin(o.a) * o.r, y = o.y + Math.sin(S.t * 0.8 + o.ph) * 1.2; o.g.position.set(x, y, z); const nx = o.cx + Math.cos(o.a + Math.sign(o.sp) * 0.1) * o.r, nz = o.cz + Math.sin(o.a + Math.sign(o.sp) * 0.1) * o.r; o.g.lookAt(nx, y, nz); flap(o.g, S.t + o.ph); }

    for (const o of gulls) { o.a += o.sp * dt; const x = Math.cos(o.a) * o.r, z = Math.sin(o.a) * o.r, y = o.y + Math.sin(S.t * 0.3 + o.ph) * 1.6; o.g.position.set(x, y, z); const nx = Math.cos(o.a + Math.sign(o.sp) * 0.12) * o.r, nz = Math.sin(o.a + Math.sign(o.sp) * 0.12) * o.r; o.g.lookAt(nx, y, nz); const f = Math.sin(S.t * 2.4 + o.ph) * 0.5; o.g.userData.wings[0].rotation.z = f; o.g.userData.wings[1].rotation.z = -f; }
    if (rain.visible) {
      const p = rainGeo.attributes.position, fall = w.snow > w.rain ? 6 : 38;
      for (let i = 0; i < p.count; i++) { let y = p.getY(i) - fall * dt; if (y < 0.5) y = 40; p.setY(i, y); }
      p.needsUpdate = true;
    }
    wfMap.offset.y = (wfMap.offset.y + dt * 1.15) % 1;
    for (let i = 0; i < MIST; i++) { mistPos[i * 3 + 1] -= (7 + (i % 3)) * dt; if (mistPos[i * 3 + 1] < -20) mistSpawn(i); }
    mistGeo.attributes.position.needsUpdate = true;
    stepCouriers();
    renderer.render(scene, cam);
  }

  // ---------- weather API ----------
  let wTimer = 0;
  async function refreshWeather() { clearTimeout(wTimer); wTimer = setTimeout(() => refreshWeather().catch(() => {}), 15 * 60e3); try { S.live = await fetchWeather(S.location.lat, S.location.lon); emit('weather', { ...S.live, location: S.location }); } catch (e) { emit('weather', { error: e.message }); } }
  function setWeather(wv) {
    if (wv === 'live') { S.weatherMode = 'live'; refreshWeather(); return; }
    S.weatherMode = 'manual'; const b = typeof wv === 'string' ? WEATHER_PRESETS[wv] : { ...S.weather, ...wv };
    if (!b) throw new Error('weather: live | ' + Object.keys(WEATHER_PRESETS).join(' | '));
    S.weather = { cloud: clamp(+b.cloud || 0), rain: clamp(+b.rain || 0), snow: clamp(+b.snow || 0), storm: !!b.storm, fog: clamp(+b.fog || 0), wind: clamp(+b.wind || 0, 0, 40) };
    emit('weather', S.weather);
  }

  const api = {
    is3D: true, scene, renderer,
    deliver, on(e, f) { (listeners[e] ||= []).push(f); return () => { listeners[e] = listeners[e].filter((x) => x !== f); }; },
    setWeather, refreshWeather, getWeather: () => ({ mode: S.weatherMode, ...(weather() || {}), location: S.location }),
    async setLocation(loc) { S.location = typeof loc === 'string' ? await geocode(loc) : loc; return refreshWeather(); },
    setTime(h, speed = 0) { if (h == null || h === 'live') { S.timeMode = 'live'; S.speed = 0; } else { S.timeMode = 'fixed'; S.hour = ((+h % 24) + 24) % 24; S.speed = +speed || 0; } },
    getTime: () => ({ mode: S.timeMode, hour: S.curH, sunrise: S.live?.sunrise ?? 7.2, sunset: S.live?.sunset ?? 17.8 }),
    setView(name) { const v = VIEWS[name]; if (!v) throw new Error('view: iso | top | side'); S.viewTarget.el = v.el; return name; },
    setAutoRotate(on) { S.autoRotate = !!on; return S.autoRotate; },
    setZoom(z) { S.viewTarget.zoom = clamp(+z, 12, 60); },
    setFlyers(c = {}) { const n = (v) => clamp(+v | 0, 0, 8); if (c.ship != null) S.flyers.ship = n(c.ship); if (c.parrot != null) S.flyers.parrot = n(c.parrot);
      for (const p of ['far', 'mid', 'near']) if (c[p]) { if (c[p].airship != null || c[p].balloon != null) S.flyers.ship = n((c[p].airship || 0) + (c[p].balloon || 0)); if (c[p].eagle != null) S.flyers.parrot = n(c[p].eagle); }
      rebuildFlyers(); return { ...S.flyers }; },
    getFlyers: () => ({ ...S.flyers }),
    setInput() {}, calibrate() {}, setStrength() {}, setEffects() {}, getInput: () => 'off',
    setInfinite(on) { applyMode((on == null ? mode !== 'flat' : !!on) ? 'flat' : 'normal'); return mode === 'flat'; },
    setInfiniteSea(on) { applyMode((on == null ? mode !== 'sea' : !!on) ? 'sea' : 'normal'); return mode === 'sea'; },
    getScene: () => ({ name: 'Воксельный остров', is3D: true, voxels: land.m.size, water: water.length }),
    destroy() { cancelAnimationFrame(S.raf); ro.disconnect(); clearTimeout(wTimer); renderer.dispose(); },
    _state: S,
  };

  if (opts.bridge !== false) {
    window.addEventListener('message', async (e) => {
      const m = e.data; if (!m || m.type !== 'livebg' || typeof api[m.cmd] !== 'function' || m.cmd.startsWith('_') || m.cmd === 'on' || m.cmd === 'destroy') return;
      if (opts.bridgeOrigin && e.origin !== opts.bridgeOrigin) return;
      let reply; try { reply = { ok: true, result: await api[m.cmd](...(m.args || [])) }; } catch (err) { reply = { ok: false, error: err.message }; }
      e.source?.postMessage?.({ type: 'livebg:reply', id: m.id, ...reply }, e.origin === 'null' ? '*' : e.origin);
    });
  }

  rebuildFlyers();
  setWeather(opts.weather || 'live');
  S.raf = requestAnimationFrame(frame);
  return api;
}
