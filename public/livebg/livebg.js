// Native Clouds · Live Backgrounds engine (no dependencies).
// Layers with depth -> parallax from mouse or webcam (head tracking).
// Weather preset reads Open-Meteo, sun/moon follow the real day, rain/snow/storm/fog,
// glare effects, and one "agent" layer the AI bot may write to.
//
//   import { createLiveBG } from '/livebg/livebg.js'
//   const bg = createLiveBG(canvas, { preset: 'weather', input: 'mouse' })
//   bg.addObject({ kind: 'airship', x: .3, y: .25, size: .12, motion: { type: 'drift', speed: 1 } })

const clamp = (v, a = 0, b = 1) => Math.max(a, Math.min(b, v));
const lerp = (a, b, t) => a + (b - a) * t;
const smooth = (t) => { t = clamp(t); return t * t * (3 - 2 * t); };
const mix = (c1, c2, t) => [lerp(c1[0], c2[0], t), lerp(c1[1], c2[1], t), lerp(c1[2], c2[2], t)];
const mul = (c, k) => [c[0] * k, c[1] * k, c[2] * k];
const css = (c, a = 1) => `rgba(${c[0] | 0},${c[1] | 0},${c[2] | 0},${a})`;
function rng(seed) { let s = (seed * 2654435761) >>> 0 || 1; return () => { s ^= s << 13; s >>>= 0; s ^= s >>> 17; s ^= s << 5; s >>>= 0; return (s % 1000003) / 1000003; }; }
function noise1(seed) {
  const r = rng(seed), v = Array.from({ length: 64 }, r);
  return (x) => { const i = Math.floor(x), f = x - i, a = v[((i % 64) + 64) % 64], b = v[(((i + 1) % 64) + 64) % 64]; return lerp(a, b, smooth(f)); };
}

// ---------- palettes ----------
const SKY = {
  night: [[8, 12, 34], [30, 42, 78]],
  golden: [[62, 72, 132], [255, 168, 112]],
  day: [[48, 124, 214], [182, 222, 252]],
  overcast: [[118, 128, 144], [178, 186, 196]],
  storm: [[46, 52, 64], [92, 98, 110]],
};

// ---------- presets ----------
export const KINDS = ['airship', 'eagle', 'balloon', 'kite', 'plane', 'pine', 'emoji', 'svg', 'image'];

// Image layers live next to this file: assets/<group>/<name>.webp (RGBA, painted in neutral daylight).
// The engine relights them for time of day and weather. See ASSETS.md for the generation brief.
const ROOT = new URL('./', import.meta.url).href;
const BASE = ROOT + 'assets/';
const CLOUDS = [1, 2, 3].map((i) => `${BASE}clouds/cloud${i}.webp`);
export const ASSET = (p) => BASE + p;

export const PRESETS = {
  // master-shot scene from Codex: one shared canvas, measured objects (assets/scene-mountains/scene.json)
  mountains: () => ({ name: 'Горы · мастер-сцена', url: BASE + 'scene-mountains/scene.json', live: true }),
  // what the stand has today: sky + clouds, now layered with parallax
  sky: () => ({
    name: 'Небо (как сейчас)', time: 'live', weather: 'live',
    layers: [
      { id: 'sky', type: 'sky', depth: 0 },
      { id: 'stars', type: 'stars', depth: 0.02 },
      { id: 'sun', type: 'sun', depth: 0.06 },
      { id: 'clouds-far', type: 'clouds', depth: 0.16, alt: [0.0, 0.5], scale: 0.8, density: 0.8, speed: 0.6, sprites: CLOUDS },
      { id: 'agent', type: 'objects', depth: 0.45, agent: true, objects: [] },
      { id: 'clouds-near', type: 'clouds', depth: 0.7, alt: [0.3, 0.8], scale: 1.5, density: 0.4, speed: 1.2, sprites: CLOUDS },
      { id: 'precip', type: 'precip', depth: 1 },
    ],
  }),
  weather: () => ({
    name: 'Погода · горы, лес, луг', time: 'live', weather: 'live',
    layers: [
      { id: 'sky', type: 'sky', depth: 0 },
      { id: 'stars', type: 'stars', depth: 0.02 },
      { id: 'sun', type: 'sun', depth: 0.06 },
      { id: 'clouds-far', type: 'clouds', depth: 0.1, alt: [-0.04, 0.22], scale: 0.75, density: 0.9, speed: 0.5, sprites: CLOUDS },
      { id: 'mountains', type: 'plate', depth: 0.16, src: BASE + 'nature/mountains.webp', y: 0.12, snow: 0.6 },
      { id: 'clouds-mid', type: 'clouds', depth: 0.24, alt: [0.14, 0.3], scale: 0.6, density: 0.3, speed: 0.8, sprites: CLOUDS },
      { id: 'foothills', type: 'plate', depth: 0.3, src: BASE + 'nature/foothills.webp', y: 0.06, snow: 0.7 },
      { id: 'birds', type: 'birds', depth: 0.38, count: 7 },
      { id: 'forest', type: 'plate', depth: 0.5, src: BASE + 'nature/forest.webp', y: 0.14, snow: 0.6 },
      { id: 'agent', type: 'objects', depth: 0.6, agent: true, objects: [] },
      { id: 'meadow', type: 'plate', depth: 0.88, src: BASE + 'nature/meadow.webp', y: 0.08, snow: 0.8 },
      { id: 'precip', type: 'precip', depth: 1 },
      { id: 'fog', type: 'fog', depth: 0.45 },
    ],
  }),
};

export const WEATHER_PRESETS = {
  clear: { cloud: 0.08, rain: 0, snow: 0, storm: false, fog: 0, wind: 3 },
  partly: { cloud: 0.4, rain: 0, snow: 0, storm: false, fog: 0, wind: 5 },
  cloudy: { cloud: 0.85, rain: 0, snow: 0, storm: false, fog: 0, wind: 6 },
  rain: { cloud: 0.95, rain: 0.6, snow: 0, storm: false, fog: 0.1, wind: 7 },
  storm: { cloud: 1, rain: 1, snow: 0, storm: true, fog: 0.1, wind: 14 },
  snow: { cloud: 0.9, rain: 0, snow: 0.7, storm: false, fog: 0.15, wind: 3 },
  fog: { cloud: 0.6, rain: 0, snow: 0, storm: false, fog: 0.8, wind: 1 },
};

// ---------- weather (Open-Meteo, free, no key, CORS ok) ----------
const toHours = (s) => { const m = /T(\d\d):(\d\d)/.exec(s || ''); return m ? +m[1] + +m[2] / 60 : null; };
export async function fetchWeather(lat, lon) {
  const u = `https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lon}&current=temperature_2m,cloud_cover,precipitation,rain,showers,snowfall,weather_code,wind_speed_10m,is_day&daily=sunrise,sunset&timezone=auto&forecast_days=1`;
  const r = await fetch(u); if (!r.ok) throw new Error('weather ' + r.status);
  const j = await r.json(), c = j.current || {}, code = c.weather_code ?? 0;
  const rainCode = (code >= 51 && code <= 67) || (code >= 80 && code <= 82) || code >= 95;
  const snowCode = (code >= 71 && code <= 77) || code === 85 || code === 86;
  return {
    cloud: clamp((c.cloud_cover ?? 30) / 100),
    rain: clamp(Math.max(((c.rain || 0) + (c.showers || 0)) / 4, rainCode ? 0.4 : 0)),
    snow: clamp(Math.max((c.snowfall || 0) / 1.5, snowCode ? 0.5 : 0)),
    storm: code >= 95, fog: code === 45 || code === 48 ? 0.75 : 0,
    wind: (c.wind_speed_10m ?? 10) / 3.6, temp: c.temperature_2m, code,
    sunrise: toHours(j.daily?.sunrise?.[0]), sunset: toHours(j.daily?.sunset?.[0]),
    utcOffset: j.utc_offset_seconds ?? 0, tz: j.timezone,
  };
}
export async function geocode(name) {
  const r = await fetch(`https://geocoding-api.open-meteo.com/v1/search?count=1&language=ru&name=${encodeURIComponent(name)}`);
  const j = await r.json(), g = j.results?.[0];
  if (!g) throw new Error('Город не найден');
  return { lat: g.latitude, lon: g.longitude, name: g.name + (g.country ? ', ' + g.country : '') };
}

// ---------- validation of objects (agent writes go through this) ----------
function okUrl(u) {
  if (/^https:\/\//.test(u)) return true;
  try { return new URL(u, BASE).origin === new URL(BASE).origin; } catch { return false; }
}
function cleanObject(o, id) {
  if (!o || typeof o !== 'object') throw new Error('object expected');
  const kind = String(o.kind || '');
  if (!KINDS.includes(kind)) throw new Error('kind must be one of ' + KINDS.join(', '));
  const out = {
    id: String(o.id || id).slice(0, 40), kind,
    x: clamp(+o.x || 0.5, -0.2, 1.2), y: clamp(+o.y || 0.4, -0.2, 1.2),
    size: clamp(+o.size || 0.1, 0.01, 0.8), flip: !!o.flip, z: +o.z || 0,
  };
  if (o.motion) {
    const t = ['drift', 'bob', 'circle', 'none'].includes(o.motion.type) ? o.motion.type : 'none';
    out.motion = { type: t, speed: clamp(+o.motion.speed || 1, -5, 5) };
  }
  if (o.color) out.color = String(o.color).slice(0, 30);
  if (kind === 'emoji') out.emoji = String(o.emoji || '⭐').slice(0, 8);
  if (kind === 'svg') { const s = String(o.svg || ''); if (!/^\s*<svg[\s>]/i.test(s) || s.length > 20000) throw new Error('svg must be an <svg> string under 20k'); out.svg = s; }
  if (kind === 'image') {
    const u = String(o.url || ''); if (!okUrl(u)) throw new Error('image url must be https or same-site');
    out.url = new URL(u, BASE).href;
    if (Array.isArray(o.frames)) out.frames = o.frames.slice(0, 12).map((f) => new URL(String(f), BASE).href).filter((f) => /^https?:/.test(f));
    if (o.fps) out.fps = clamp(+o.fps, 1, 30);
    if (o.flap) out.flap = clamp(+o.flap, 0, 1);
    if (Array.isArray(o.frameSequence)) out.frameSequence = o.frameSequence.slice(0, 32).map((n) => Math.max(0, n | 0));
  }
  if (o.label) out.label = String(o.label).slice(0, 60);
  if (o.width) out.width = clamp(+o.width, 0.001, 2);
  if (Array.isArray(o.anchor)) out.anchor = [clamp(+o.anchor[0], 0, 1), clamp(+o.anchor[1], 0, 1)];
  if (o.distance_m) out.distance_m = +o.distance_m;
  return out;
}

// ---------- engine ----------
export function createLiveBG(canvas, opts = {}) {
  const ctx = canvas.getContext('2d');
  const hasFilter = 'filter' in ctx;
  const listeners = {};
  const emit = (e, d) => (listeners[e] || []).forEach((f) => { try { f(d); } catch { /* ignore */ } });

  const S = {
    scene: null, W: 0, H: 0, dpr: 1,
    v: { x: 0, y: 0, z: 0 }, target: { x: 0, y: 0, z: 0 }, pointer: null,
    input: 'off', strength: opts.strength ?? 1,
    effects: { glare: true, blindspot: true, blindCorner: 'auto', birds: true, ground: true, ...(opts.effects || {}) },
    weatherMode: 'live', weather: { ...WEATHER_PRESETS.partly }, live: null,
    location: opts.location || { lat: 41.7151, lon: 44.8271, name: 'Тбилиси' },
    timeMode: 'live', hour: 12, speed: 0,
    t: 0, last: 0, raf: 0, flash: 0, bolt: null, nextBolt: 4,
    layerState: new Map(), images: new Map(), agentSeq: 1,
  };

  // ----- sizing -----
  function resize() {
    const r = canvas.getBoundingClientRect();
    S.dpr = Math.min(window.devicePixelRatio || 1, 1.5);
    S.W = Math.max(1, r.width); S.H = Math.max(1, r.height);
    canvas.width = Math.round(S.W * S.dpr); canvas.height = Math.round(S.H * S.dpr);
    S.layerState.forEach((st) => { st.profile = null; });
  }
  const ro = new ResizeObserver(resize); ro.observe(canvas); resize();

  // ----- time / sun -----
  function localHour() {
    if (S.timeMode === 'fixed') return S.hour;
    const off = S.live?.utcOffset ?? -new Date().getTimezoneOffset() * 60;
    return (((Date.now() / 1000 + off) % 86400) + 86400) % 86400 / 3600;
  }
  function solar() {
    const rise = S.live?.sunrise ?? 7.2, set = S.live?.sunset ?? 17.8, h = S.curH;
    if (h >= rise && h <= set) { const t = (h - rise) / (set - rise); return { day: true, t, el: Math.sin(Math.PI * t) }; }
    const len = 24 - (set - rise), since = h > set ? h - set : h + 24 - set, t = since / len;
    return { day: false, t, el: -Math.sin(Math.PI * t) };
  }
  function weather() { return S.weatherMode === 'live' && S.live ? S.live : S.weather; }

  // ----- inputs -----
  function onMouse(e) {
    S.pointer = { x: e.clientX, y: e.clientY };
    if (S.input !== 'mouse') return;
    const r = canvas.getBoundingClientRect();
    S.target.x = clamp(((e.clientX - r.left) / r.width) * 2 - 1, -1, 1);
    S.target.y = clamp(((e.clientY - r.top) / r.height) * 2 - 1, -1, 1);
  }
  function onLeave() { if (S.input === 'mouse') { S.target.x = 0; S.target.y = 0; } }
  window.addEventListener('pointermove', onMouse, { passive: true });
  document.addEventListener('pointerleave', onLeave);

  const cam = { stream: null, video: null, detector: null, mode: '', busy: false, base: null, prev: null, small: null, frame: 0 };
  async function startCamera() {
    emit('camera', { state: 'starting' });
    if (!navigator.mediaDevices?.getUserMedia) throw new Error('Камера недоступна в этом браузере');
    cam.stream = await navigator.mediaDevices.getUserMedia({ video: { width: 320, height: 240, facingMode: 'user' }, audio: false });
    const v = document.createElement('video'); v.muted = true; v.playsInline = true; v.srcObject = cam.stream; await v.play(); cam.video = v;
    try {
      const mp = await import('https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.14/vision_bundle.mjs');
      const files = await mp.FilesetResolver.forVisionTasks('https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.14/wasm');
      const make = (delegate) => mp.FaceDetector.createFromOptions(files, {
        baseOptions: { modelAssetPath: 'https://storage.googleapis.com/mediapipe-models/face_detector/blaze_face_short_range/float16/1/blaze_face_short_range.tflite', delegate },
        runningMode: 'VIDEO', minDetectionConfidence: 0.5,
      });
      cam.detector = await make('GPU').catch(() => make('CPU'));
      cam.mode = 'face';
    } catch (e) {
      cam.mode = 'motion'; // fallback: frame-difference centroid, no downloads
      cam.small = document.createElement('canvas'); cam.small.width = 64; cam.small.height = 48;
      emit('camera', { state: 'fallback', msg: 'Распознавание лица не загрузилось, работает упрощённый режим (по движению).' });
    }
    emit('camera', { state: 'on', mode: cam.mode, video: v });
  }
  function stopCamera() {
    cam.stream?.getTracks().forEach((t) => t.stop());
    cam.stream = null; cam.video = null; cam.detector?.close?.(); cam.detector = null; cam.prev = null; cam.base = null;
    emit('camera', { state: 'off' });
  }
  function readCamera() {
    const v = cam.video; if (!v || v.readyState < 2 || (cam.frame++ & 1)) return;
    if (cam.mode === 'face' && cam.detector) {
      const res = cam.detector.detectForVideo(v, performance.now());
      const d = res.detections?.[0]?.boundingBox; if (!d) { emit('face', null); return; }
      const cx = (d.originX + d.width / 2) / v.videoWidth, cy = (d.originY + d.height / 2) / v.videoHeight, sz = d.width / v.videoWidth;
      if (!cam.base) cam.base = { x: cx, y: cy, s: sz };
      S.target.x = clamp(-(cx - cam.base.x) * 3.2, -1, 1); // mirrored: head right -> +x
      S.target.y = clamp((cy - cam.base.y) * 3.2, -1, 1);
      S.target.z = clamp((sz - cam.base.s) / cam.base.s, -0.6, 1);
      emit('face', { x: cx, y: cy, size: sz });
    } else if (cam.mode === 'motion') {
      const c = cam.small.getContext('2d', { willReadFrequently: true });
      c.drawImage(v, 0, 0, 64, 48); const px = c.getImageData(0, 0, 64, 48).data, g = new Uint8Array(64 * 48);
      for (let i = 0; i < g.length; i++) g[i] = (px[i * 4] + px[i * 4 + 1] * 2 + px[i * 4 + 2]) >> 2;
      if (cam.prev) {
        let sx = 0, sy = 0, n = 0;
        for (let y = 0; y < 48; y++) for (let x = 0; x < 64; x++) { const i = y * 64 + x; if (Math.abs(g[i] - cam.prev[i]) > 22) { sx += x; sy += y; n++; } }
        if (n > 25) {
          const cx = sx / n / 64, cy = sy / n / 48;
          if (!cam.base) cam.base = { x: 0.5, y: 0.45 };
          S.target.x = lerp(S.target.x, clamp(-(cx - cam.base.x) * 2.4, -1, 1), 0.3);
          S.target.y = lerp(S.target.y, clamp((cy - cam.base.y) * 2.4, -1, 1), 0.3);
        }
      }
      cam.prev = g;
    }
  }
  async function setInput(mode) {
    if (!['mouse', 'camera', 'off'].includes(mode)) throw new Error('input: mouse | camera | off');
    if (mode !== 'camera' && cam.stream) stopCamera();
    S.input = mode; S.target = { x: 0, y: 0, z: 0 };
    if (mode === 'camera' && !cam.stream) {
      try { await startCamera(); } catch (e) { S.input = 'off'; emit('camera', { state: 'error', msg: e.message || String(e) }); throw e; }
    }
    emit('input', mode);
  }

  // ----- layer helpers -----
  function st(layer) { let s = S.layerState.get(layer.id); if (!s) { s = {}; S.layerState.set(layer.id, s); } return s; }
  function offset(depth) {
    const k = S.strength * Math.min(S.W, S.H) * 0.09 * depth;
    return { x: -S.v.x * k, y: -S.v.y * k * 0.55, s: 1 + S.v.z * 0.12 * depth };
  }
  function withLayer(depth, fn) {
    const o = offset(depth);
    ctx.save(); ctx.translate(S.W / 2 + o.x, S.H / 2 + o.y); ctx.scale(o.s, o.s); ctx.translate(-S.W / 2, -S.H / 2); fn(); ctx.restore();
  }
  // scenes with a shared master canvas: every plate and object uses the same fit, so layers register exactly
  function fit() {
    const c = S.scene.canvas; if (!c) return null;
    const sc = Math.max((S.W * 1.06) / c.w, (S.H * 1.1) / c.h);
    return { sc, ox: (S.W - c.w * sc) / 2, oy: (S.H - c.h * sc) / 2, cw: c.w * sc, ch: c.h * sc };
  }
  function lightLevel(sun) { return clamp(0.3 + sun.el * 1.4, 0.16, 1); }

  // sky colors are shared by several layers
  function skyColors(sun, w) {
    let top, bot; const el = sun.el;
    if (el < 0) { const k = smooth(-el / 0.28); top = mix(SKY.golden[0], SKY.night[0], k); bot = mix(SKY.golden[1], SKY.night[1], k); }
    else { const k = smooth(el / 0.32); top = mix(SKY.golden[0], SKY.day[0], k); bot = mix(SKY.golden[1], SKY.day[1], k); }
    const gray = clamp(w.cloud * 0.55 + w.rain * 0.35 + (w.fog || 0) * 0.3);
    const lit = clamp(0.25 + Math.max(el, -0.2) * 2);
    const oc = w.storm ? SKY.storm : SKY.overcast;
    top = mix(top, mul(oc[0], lit), gray); bot = mix(bot, mul(oc[1], lit), gray);
    return { top, bot };
  }

  // ----- clouds -----
  const cloudSprites = [];
  function makeCloudSprites() {
    const tints = { white: [255, 255, 255], gray: [128, 136, 150], warm: [255, 178, 140] };
    for (let i = 0; i < 8; i++) {
      const r = rng(100 + i), puffs = [];
      const n = 6 + Math.floor(r() * 6);
      for (let k = 0; k < n; k++) { const u = k / (n - 1); puffs.push({ x: 60 + u * 280 + (r() - 0.5) * 30, y: 140 - Math.sin(u * Math.PI) * (40 + r() * 50) + (r() - 0.5) * 20, rad: 34 + r() * 40 * Math.sin(u * Math.PI + 0.3) + 14 }); }
      const set = {};
      for (const [name, c] of Object.entries(tints)) {
        const cv = document.createElement('canvas'); cv.width = 400; cv.height = 220; const g = cv.getContext('2d');
        if (hasFilter) g.filter = 'blur(5px)';
        for (const p of puffs) {
          const gr = g.createRadialGradient(p.x, p.y - p.rad * 0.3, p.rad * 0.1, p.x, p.y, p.rad);
          gr.addColorStop(0, css(c, 1)); gr.addColorStop(0.7, css(c, 0.95)); gr.addColorStop(1, css(c, 0));
          g.fillStyle = gr; g.beginPath(); g.arc(p.x, p.y, p.rad, 0, Math.PI * 2); g.fill();
        }
        g.filter = 'none'; g.globalCompositeOperation = 'source-atop';
        const sh = g.createLinearGradient(0, 60, 0, 200); sh.addColorStop(0, 'rgba(0,0,0,0)'); sh.addColorStop(1, 'rgba(30,40,60,0.22)');
        g.fillStyle = sh; g.fillRect(0, 0, 400, 220);
        set[name] = cv;
      }
      cloudSprites.push(set);
    }
  }
  makeCloudSprites();

  // ----- hills -----
  function hillProfile(layer, s) {
    if (s.profile && s.pw === S.W && s.ph === S.H) return s.profile;
    const n = noise1(layer.seed || 1), n2 = noise1((layer.seed || 1) + 50), pts = [];
    const rough = layer.rough || 1;
    for (let i = 0; i <= 96; i++) {
      const u = -0.25 + (i / 96) * 1.5;
      const h = n(u * 4 * rough) * 0.7 + n2(u * 11 * rough) * 0.3;
      pts.push([u, (layer.base ?? 0.8) - h * (layer.amp ?? 0.08)]);
    }
    s.profile = pts; s.pw = S.W; s.ph = S.H;
    // trees
    const tr = layer.trees; s.trees = [];
    if (tr?.list) s.trees = tr.list.map((t) => ({ u: +t.u, size: +t.size || 0.1 }));
    else if (tr?.count) { const r = rng((layer.seed || 1) + 7); for (let i = 0; i < tr.count; i++) s.trees.push({ u: -0.1 + r() * 1.2, size: (tr.size || 0.06) * (0.6 + r() * 0.7) }); }
    s.trees.sort((a, b) => a.size - b.size);
    return pts;
  }
  const yAt = (pts, u) => { for (let i = 1; i < pts.length; i++) if (pts[i][0] >= u) { const a = pts[i - 1], b = pts[i], t = (u - a[0]) / (b[0] - a[0]); return lerp(a[1], b[1], t); } return pts[pts.length - 1][1]; };
  function drawPine(x, y, h, col, dark) {
    ctx.fillStyle = css(mul(col, 0.55)); ctx.fillRect(x - h * 0.035, y - h * 0.16, h * 0.07, h * 0.18);
    for (let k = 0; k < 3; k++) {
      const top = y - h * (0.42 + k * 0.29), bot = y - h * (0.1 + k * 0.27), wd = h * (0.3 - k * 0.07);
      ctx.fillStyle = css(mix(col, dark, k * 0.12)); ctx.beginPath(); ctx.moveTo(x, top); ctx.lineTo(x + wd, bot); ctx.lineTo(x - wd, bot); ctx.closePath(); ctx.fill();
    }
  }

  // ----- builtin objects -----
  const DRAW = {
    airship(s, t) {
      const w = s * 1.6, h = s * 0.5;
      const g = ctx.createLinearGradient(0, -h, 0, h); g.addColorStop(0, '#e9edf3'); g.addColorStop(0.55, '#b8c2cf'); g.addColorStop(1, '#7c8797');
      ctx.fillStyle = '#6b7685'; ctx.beginPath(); ctx.moveTo(-w * 0.82, 0); ctx.lineTo(-w * 1.02, -h * 0.75); ctx.lineTo(-w * 0.9, 0); ctx.lineTo(-w * 1.02, h * 0.75); ctx.closePath(); ctx.fill();
      ctx.fillStyle = g; ctx.beginPath(); ctx.ellipse(0, 0, w, h, 0, 0, Math.PI * 2); ctx.fill();
      ctx.strokeStyle = 'rgba(80,90,110,.35)'; ctx.lineWidth = s * 0.02;
      for (let k = -2; k <= 2; k++) { ctx.beginPath(); ctx.ellipse(0, 0, w * (1 - Math.abs(k) * 0.08), h * Math.abs(k) * 0.3 + 0.01, 0, Math.PI, Math.PI * 2); ctx.stroke(); }
      ctx.fillStyle = '#c0663a'; ctx.fillRect(-w * 0.25, -h * 0.05, w * 0.5, h * 0.18);
      ctx.fillStyle = '#4b5563'; ctx.beginPath(); ctx.roundRect(-w * 0.2, h * 0.95, w * 0.4, h * 0.38, h * 0.1); ctx.fill();
      ctx.fillStyle = '#fde68a'; for (let k = 0; k < 4; k++) ctx.fillRect(-w * 0.16 + k * w * 0.09, h * 1.05, w * 0.05, h * 0.12);
      const pa = Math.sin(t * 30) * h * 0.4; ctx.fillStyle = '#374151'; ctx.fillRect(w * 0.2, h * 1.05 - pa / 2, s * 0.02, pa + 1);
    },
    eagle(s, t) {
      const f = Math.sin(t * 2.2), sp = s * 1.4;
      ctx.fillStyle = '#3b2a1e';
      ctx.beginPath(); ctx.moveTo(0, 0);
      ctx.quadraticCurveTo(-sp * 0.5, -s * 0.5 * f - s * 0.1, -sp, -s * 0.35 * f + s * 0.05);
      ctx.quadraticCurveTo(-sp * 0.55, s * 0.05, -s * 0.15, s * 0.12);
      ctx.lineTo(s * 0.15, s * 0.12);
      ctx.quadraticCurveTo(sp * 0.55, s * 0.05, sp, -s * 0.35 * f + s * 0.05);
      ctx.quadraticCurveTo(sp * 0.5, -s * 0.5 * f - s * 0.1, 0, 0); ctx.fill();
      ctx.beginPath(); ctx.ellipse(0, s * 0.08, s * 0.14, s * 0.32, 0, 0, Math.PI * 2); ctx.fill();
      ctx.beginPath(); ctx.moveTo(-s * 0.12, s * 0.35); ctx.lineTo(0, s * 0.55); ctx.lineTo(s * 0.12, s * 0.35); ctx.fill();
      ctx.fillStyle = '#f3efe6'; ctx.beginPath(); ctx.arc(0, -s * 0.2, s * 0.1, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = '#e0a526'; ctx.beginPath(); ctx.moveTo(-s * 0.03, -s * 0.28); ctx.lineTo(0, -s * 0.36); ctx.lineTo(s * 0.03, -s * 0.28); ctx.fill();
    },
    balloon(s, t) {
      const cols = ['#e4572e', '#f3a712', '#29335c', '#f3a712'];
      for (let k = 0; k < 4; k++) {
        ctx.fillStyle = cols[k]; ctx.beginPath();
        ctx.moveTo(0, s * 0.62); ctx.bezierCurveTo(-s * 0.5 + k * s * 0.25, s * 0.2, -s * 0.62 + k * s * 0.31, -s * 0.9, -s * 0.15 + k * s * 0.1, -s * 0.8);
        ctx.lineTo(-s * 0.05 + k * s * 0.1, -s * 0.8);
        ctx.bezierCurveTo(-s * 0.62 + (k + 1) * s * 0.31, -s * 0.9, -s * 0.5 + (k + 1) * s * 0.25, s * 0.2, 0, s * 0.62); ctx.fill();
      }
      const g = ctx.createRadialGradient(-s * 0.2, -s * 0.4, 0, 0, -s * 0.2, s * 0.8); g.addColorStop(0, 'rgba(255,255,255,.35)'); g.addColorStop(1, 'rgba(255,255,255,0)');
      ctx.fillStyle = g; ctx.beginPath(); ctx.ellipse(0, -s * 0.2, s * 0.6, s * 0.75, 0, 0, Math.PI * 2); ctx.fill();
      ctx.strokeStyle = '#5b4636'; ctx.lineWidth = s * 0.015; ctx.beginPath(); ctx.moveTo(-s * 0.1, s * 0.62); ctx.lineTo(-s * 0.09, s * 0.85); ctx.moveTo(s * 0.1, s * 0.62); ctx.lineTo(s * 0.09, s * 0.85); ctx.stroke();
      ctx.fillStyle = '#8a5a3b'; ctx.fillRect(-s * 0.11, s * 0.85, s * 0.22, s * 0.16);
    },
    kite(s, t) {
      ctx.strokeStyle = 'rgba(60,60,60,.6)'; ctx.lineWidth = s * 0.012; ctx.beginPath(); ctx.moveTo(0, s * 0.6);
      for (let k = 1; k <= 8; k++) ctx.lineTo(Math.sin(t * 3 + k) * s * 0.12, s * 0.6 + k * s * 0.14); ctx.stroke();
      ctx.fillStyle = '#ef476f'; ctx.beginPath(); ctx.moveTo(0, -s * 0.6); ctx.lineTo(s * 0.4, 0); ctx.lineTo(0, s * 0.6); ctx.closePath(); ctx.fill();
      ctx.fillStyle = '#ffd166'; ctx.beginPath(); ctx.moveTo(0, -s * 0.6); ctx.lineTo(-s * 0.4, 0); ctx.lineTo(0, s * 0.6); ctx.closePath(); ctx.fill();
      for (let k = 1; k <= 3; k++) { ctx.fillStyle = k % 2 ? '#06d6a0' : '#118ab2'; ctx.save(); ctx.translate(Math.sin(t * 3 + k * 2.6) * s * 0.12, s * 0.6 + k * s * 0.28); ctx.rotate(0.6); ctx.fillRect(-s * 0.05, -s * 0.03, s * 0.1, s * 0.06); ctx.restore(); }
    },
    plane(s) {
      ctx.fillStyle = '#ffffff'; ctx.beginPath(); ctx.moveTo(s * 0.8, 0); ctx.lineTo(-s * 0.7, -s * 0.35); ctx.lineTo(-s * 0.35, 0); ctx.closePath(); ctx.fill();
      ctx.fillStyle = '#d7dde6'; ctx.beginPath(); ctx.moveTo(s * 0.8, 0); ctx.lineTo(-s * 0.7, s * 0.25); ctx.lineTo(-s * 0.35, 0); ctx.closePath(); ctx.fill();
    },
    pine(s) { drawPine(0, s * 0.5, s, [40, 92, 56], [24, 60, 36]); },
  };

  function getImage(o) {
    const key = o.kind === 'svg' ? 'svg:' + o.svg : 'img:' + o.url;
    let im = S.images.get(key);
    if (!im) {
      im = new Image();
      im.src = o.kind === 'svg' ? URL.createObjectURL(new Blob([o.svg], { type: 'image/svg+xml' })) : o.url;
      S.images.set(key, im);
    }
    return im.complete && im.naturalWidth ? im : null;
  }

  function drawObject(o, light) {
    const F = fit();
    const s = o.size * (F ? F.ch : S.H); let x = F ? F.ox + o.x * F.cw : o.x * S.W, y = F ? F.oy + o.y * F.ch : o.y * S.H;
    const m = o.motion, sp = m?.speed ?? 1;
    if (m?.type === 'drift') { const span = S.W + s * 4; x = ((((x + s * 2 + S.t * sp * S.W * 0.012) % span) + span) % span) - s * 2; y += Math.sin(S.t * 0.6 * sp + o.x * 9) * s * 0.06; }
    if (m?.type === 'bob') y += Math.sin(S.t * 1.6 * sp + o.x * 9) * s * 0.06;
    if (m?.type === 'circle') { x += Math.cos(S.t * 0.4 * sp) * S.W * 0.08; y += Math.sin(S.t * 0.4 * sp) * S.H * 0.04; }
    ctx.save(); ctx.translate(x, y); if (o.flip || (m?.type === 'drift' && sp < 0)) ctx.scale(-1, 1);
    if (hasFilter && light < 0.97) ctx.filter = `brightness(${(0.35 + light * 0.65).toFixed(2)})`;
    if (DRAW[o.kind]) DRAW[o.kind](s, S.t);
    else if (o.kind === 'emoji') { ctx.font = `${s}px "Apple Color Emoji","Segoe UI Emoji","Noto Color Emoji",sans-serif`; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillText(o.emoji, 0, 0); }
    else {
      let im = null;
      if (o.frames?.length) {
        const fr = o.frames.map(loadImg), seq = o.frameSequence?.length ? o.frameSequence : fr.map((_, i) => i);
        const k = seq[Math.floor(S.t * (o.fps || 8) + o.x * 7) % seq.length] % fr.length; im = fr[k] || fr.find(Boolean);
      }
      else im = getImage(o);
      if (im) {
        const w = o.width ? o.width * (F ? F.cw : S.W) : s * (im.naturalWidth / im.naturalHeight);
        if (o.anchor) ctx.translate((0.5 - o.anchor[0]) * w, (0.5 - o.anchor[1]) * s);
        if (o.flap) {
          // procedural wing beat: vertical strips bend around the body axis (until real frames exist)
          const N = 140, iw = im.naturalWidth, ih = im.naturalHeight, ph = Math.sin(S.t * 5.5 + o.x * 9), cx = 0.5;
          for (let i = 0; i < N; i++) {
            const u0 = i / N, u1 = (i + 1) / N, um = (u0 + u1) / 2, d = (um - cx) / 0.5, k2 = Math.sign(d) * Math.pow(Math.abs(d), 1.6);
            const dy = -ph * Math.abs(k2) * s * 0.42 * o.flap, sy = 1 - Math.abs(k2) * 0.25 * o.flap * Math.abs(ph);
            ctx.drawImage(im, u0 * iw, 0, (u1 - u0) * iw + 1, ih, -w / 2 + u0 * w, -s / 2 * sy + dy + s / 2 * (1 - sy), (u1 - u0) * w + 0.6, s * sy);
          }
          ctx.translate(0, Math.sin(S.t * 5.5 + o.x * 9 + 1.2) * s * 0.04 * o.flap);
        } else ctx.drawImage(im, -w / 2, -s / 2, w, s);
      }
    }
    ctx.restore();
  }

  // ----- photo plates: load once, relight into a cached canvas when time/weather changes -----
  function grading(env, snowable = 0) {
    const night = clamp(-env.sun.el * 2.5), warm = env.sun.el > -0.15 ? 1 - smooth(Math.abs(env.sun.el) / 0.3) : 0;
    const gray = clamp(env.w.cloud * 0.3 + env.w.rain * 0.5 + (env.w.storm ? 0.3 : 0));
    const light = lightLevel(env.sun);
    const snow = clamp(env.w.snow) * snowable;
    const q = (v, n) => Math.round(v * n) / n;
    return { light: q(light, 24), night: q(night, 12), warm: q(warm, 12), gray: q(gray, 12), snow: q(snow, 6) };
  }
  function relight(src, g, w, h, out) {
    const cv = out || document.createElement('canvas'); cv.width = Math.max(1, w); cv.height = Math.max(1, h);
    const c = cv.getContext('2d');
    c.clearRect(0, 0, w, h);
    if (hasFilter) c.filter = `brightness(${(0.42 + 0.62 * g.light - g.gray * 0.12).toFixed(3)}) saturate(${(1.05 - g.gray * 0.45 - g.night * 0.45).toFixed(3)})`;
    c.drawImage(src, 0, 0, w, h); c.filter = 'none';
    // blend tints over the whole layer, then cut back to the layer's own alpha
    const tint = (op, col, a) => { if (a <= 0.003) return; c.globalCompositeOperation = op; c.fillStyle = col; c.globalAlpha = a; c.fillRect(0, 0, w, h); c.globalAlpha = 1; };
    if (!hasFilter) tint('source-atop', '#000', (1 - g.light) * 0.55);
    tint('soft-light', 'rgb(255,120,60)', 0.4 * g.warm * (1 - g.gray));
    tint('multiply', 'rgb(255,190,150)', 0.25 * g.warm * (1 - g.gray));
    tint('multiply', 'rgb(70,92,170)', 0.55 * g.night);
    tint('source-atop', 'rgb(118,128,142)', 0.16 * g.gray);
    tint('source-atop', 'rgb(236,241,248)', 0.42 * g.snow);
    c.globalCompositeOperation = 'destination-in'; c.drawImage(src, 0, 0, w, h);
    c.globalCompositeOperation = 'source-over';
    return cv;
  }
  function loadImg(url) {
    let im = S.images.get('url:' + url);
    if (!im) { im = new Image(); im.decoding = 'async'; im.crossOrigin = 'anonymous'; im.src = url; S.images.set('url:' + url, im); im.onload = () => emit('asset', url); }
    return im.complete && im.naturalWidth ? im : null;
  }
  let regradeBudget = 0;

  const sp0 = (sp, c) => { const x = sp[c.k % sp.length].white; return { width: x.naturalWidth || x.width, height: x.naturalHeight || x.height }; };
  // ----- layer renderers -----
  const R = {
    plate(L, env) {
      const im = loadImg(L.src); if (!im) return;
      const s = st(L), m = 0.05 + L.depth * 0.07, F = fit();
      const sc = Math.max((S.W * (1 + 2 * m)) / im.naturalWidth, (S.H * (1 + 2 * m)) / im.naturalHeight) * (L.zoom || 1);
      let dw = im.naturalWidth * sc, dh = im.naturalHeight * sc;
      let dx = (S.W - dw) / 2, dy = (L.anchor === 'center' ? (S.H - dh) / 2 : S.H * (1 + m * 0.5) - dh) + (L.y || 0) * S.H;
      if (F) { dx = F.ox; dy = F.oy; dw = F.cw; dh = F.ch; }
      const g = grading(env, L.snow || 0), key = JSON.stringify(g), tw = Math.round(Math.min(im.naturalWidth, dw * S.dpr)), th = Math.round(tw * im.naturalHeight / im.naturalWidth);
      if ((!s.cv || s.key !== key || s.tw !== tw) && (regradeBudget > 0 || !s.cv)) { s.cv = relight(im, g, tw, th, s.cv); s.key = key; s.tw = tw; regradeBudget--; }
      withLayer(L.depth, () => ctx.drawImage(s.cv, dx, dy, dw, dh));
    },

    sky(L, env) {
      const g = ctx.createLinearGradient(0, 0, 0, S.H); g.addColorStop(0, css(env.sky.top)); g.addColorStop(1, css(env.sky.bot));
      ctx.fillStyle = g; ctx.fillRect(0, 0, S.W, S.H);
      if (L.src) {
        const a = smooth((env.sun.el - 0.05) / 0.35) * (1 - clamp(env.w.cloud * 0.6 + env.w.rain * 0.5)); if (a < 0.01) return;
        ctx.globalAlpha = a; R.plate({ ...L, depth: 0 }, env); ctx.globalAlpha = 1;
      }
    },
    stars(L, env) {
      const a = clamp(-env.sun.el * 3) * (1 - env.w.cloud * 0.9); if (a <= 0.01) return;
      const s = st(L); if (!s.stars) { const r = rng(42); s.stars = Array.from({ length: 160 }, () => [r() * 1.2 - 0.1, r() * 0.7, r() * 1.4 + 0.3, r() * 6]); }
      withLayer(L.depth, () => { for (const [x, y, z, p] of s.stars) { ctx.fillStyle = `rgba(255,255,240,${(a * (0.5 + 0.5 * Math.sin(S.t * 1.5 + p))).toFixed(3)})`; ctx.fillRect(x * S.W, y * S.H, z, z); } });
    },
    sun(L, env) {
      const { sun, w } = env, p = sunPos(sun);
      if (L.only === 'night' && sun.day) return;
      withLayer(L.depth, () => {
        const clear = 1 - w.cloud * 0.75 - w.rain * 0.2;
        if (sun.day) {
          const low = 1 - smooth(sun.el / 0.35), col = mix([255, 246, 214], [255, 150, 80], low), r = S.H * (0.034 + low * 0.012);
          const gl = ctx.createRadialGradient(p.x, p.y, 0, p.x, p.y, S.H * 0.45); gl.addColorStop(0, css(col, 0.55 * clear)); gl.addColorStop(0.25, css(col, 0.18 * clear)); gl.addColorStop(1, css(col, 0));
          ctx.fillStyle = gl; ctx.fillRect(0, 0, S.W, S.H);
          ctx.fillStyle = css(mix(col, [255, 255, 255], 0.5), clamp(clear + 0.25)); ctx.beginPath(); ctx.arc(p.x, p.y, r, 0, Math.PI * 2); ctx.fill();
        } else {
          const r = S.H * 0.026, gl = ctx.createRadialGradient(p.x, p.y, 0, p.x, p.y, S.H * 0.2);
          gl.addColorStop(0, `rgba(220,230,255,${0.25 * clear})`); gl.addColorStop(1, 'rgba(220,230,255,0)'); ctx.fillStyle = gl; ctx.fillRect(0, 0, S.W, S.H);
          ctx.fillStyle = `rgba(240,242,255,${clamp(clear + 0.3)})`; ctx.beginPath(); ctx.arc(p.x, p.y, r, 0, Math.PI * 2); ctx.fill();
          ctx.fillStyle = css(env.sky.top, 0.9); ctx.beginPath(); ctx.arc(p.x + r * 0.45, p.y - r * 0.2, r * 0.9, 0, Math.PI * 2); ctx.fill();
        }
      });
    },
    clouds(L, env) {
      const s = st(L), w = env.w, max = 26;
      if (!s.list) { const r = rng(L.id.length * 31 + 5); s.list = Array.from({ length: max }, (_, i) => ({ u: r() * 1.4 - 0.2, y: r(), w: 0.6 + r() * 0.8, sp: 0.6 + r() * 0.8, k: i % cloudSprites.length, d: r() })); }
      let sprites = cloudSprites;
      if (L.sprites?.length) {
        if (!s.sp) s.sp = [];
        L.sprites.forEach((u, i) => { if (!s.sp[i]) { const im = loadImg(u); if (im) s.sp[i] = {
          white: im,
          gray: relight(im, { light: 0.62, night: 0, warm: 0, gray: 1, snow: 0 }, im.naturalWidth >> 1, im.naturalHeight >> 1),
          warm: relight(im, { light: 1, night: 0, warm: 1, gray: 0, snow: 0 }, im.naturalWidth >> 1, im.naturalHeight >> 1) } } });
        const ready = s.sp.filter(Boolean); if (ready.length) sprites = ready;
      }
      const n = Math.round((3 + w.cloud * 20) * (L.density ?? 1)), [y0, y1] = L.alt || [0.05, 0.5];
      const gray = clamp(w.cloud * 0.35 + w.rain * 0.6 + (w.storm ? 0.3 : 0)), night = clamp(-env.sun.el * 2.5), warm = env.sun.el > -0.15 ? 1 - smooth(Math.abs(env.sun.el) / 0.3) : 0;
      const wind = (w.wind || 4) * (L.speed ?? 1) * 0.0009;
      withLayer(L.depth, () => {
        for (let i = 0; i < Math.min(n, max); i++) {
          const c = s.list[i]; c.u += wind * c.sp * S.dt; if (c.u > 1.25) c.u = -0.3 - c.d * 0.2;
          const cw = S.W * 0.28 * (L.scale ?? 1) * c.w * (0.8 + w.cloud * 0.5), ch = cw * (sp0(sprites, c).height / sp0(sprites, c).width), x = c.u * S.W, y = lerp(y0, y1, c.y) * S.H;
          const sp = sprites[c.k % sprites.length], a = 0.6 + 0.4 * (1 - c.d * 0.5);
          ctx.globalAlpha = a * (1 - gray) * (1 - night * 0.75); ctx.drawImage(sp.white, x, y, cw, ch);
          ctx.globalAlpha = a * Math.max(gray, night * 0.85) * (night ? 1 - 0.55 * night : 1); ctx.drawImage(sp.gray, x, y, cw, ch);
          if (warm > 0.02) { ctx.globalAlpha = a * warm * 0.65 * (1 - gray); ctx.drawImage(sp.warm, x, y, cw, ch); }
        }
        ctx.globalAlpha = 1;
      });
    },
    hills(L, env) {
      if (!S.effects.ground) return;
      const s = st(L), pts = hillProfile(L, s), light = lightLevel(env.sun);
      let col = mix(L.color || [70, 130, 80], env.sky.bot, L.haze ?? 0.3);
      if (env.w.snow > 0.2) col = mix(col, [228, 234, 242], clamp(env.w.snow));
      col = mul(col, light);
      withLayer(L.depth, () => {
        const g = ctx.createLinearGradient(0, (L.base - L.amp) * S.H, 0, S.H); g.addColorStop(0, css(col)); g.addColorStop(1, css(mul(col, 0.62)));
        ctx.fillStyle = g; ctx.beginPath(); ctx.moveTo(pts[0][0] * S.W, S.H * 1.3);
        for (const [u, y] of pts) ctx.lineTo(u * S.W, y * S.H);
        ctx.lineTo(pts[pts.length - 1][0] * S.W, S.H * 1.3); ctx.closePath(); ctx.fill();
        const tc = mul(mix(L.color || [70, 130, 80], [20, 60, 36], 0.4), light), dark = mul(tc, 0.7);
        for (const t of s.trees || []) drawPine(t.u * S.W, yAt(pts, t.u) * S.H + t.size * S.H * 0.04, t.size * S.H, env.w.snow > 0.3 ? mix(tc, [210, 220, 230], 0.35) : tc, dark);
      });
    },
    birds(L, env) {
      if (!S.effects.birds || !env.sun.day || env.w.storm) return;
      const s = st(L), n = Math.round((L.count || 7) * (1 - env.w.rain * 0.8));
      if (!s.flock) { const r = rng(9); s.flock = { u: -0.1, y: 0.28, sp: 0.018 }; s.b = Array.from({ length: 12 }, (_, i) => ({ dx: -(i % 2 ? 1 : -1) * Math.ceil(i / 2) * 0.022, dy: Math.ceil(i / 2) * 0.016 + r() * 0.008, ph: r() * 6, sz: 0.8 + r() * 0.4 })); }
      const f = s.flock; f.u += f.sp * S.dt; if (f.u > 1.3) { f.u = -0.3; f.y = 0.15 + Math.random() * 0.25; }
      const c = mul([40, 44, 56], lightLevel(env.sun) * 0.9);
      withLayer(L.depth, () => {
        ctx.strokeStyle = css(c, 0.85); ctx.lineCap = 'round';
        for (let i = 0; i < n; i++) {
          const b = s.b[i], x = (f.u + b.dx) * S.W, y = (f.y + b.dy + Math.sin(S.t * 0.8 + i) * 0.006) * S.H, sz = S.H * 0.012 * b.sz, fl = Math.sin(S.t * 7 + b.ph);
          ctx.lineWidth = sz * 0.22; ctx.beginPath(); ctx.moveTo(x - sz, y - sz * 0.2 * fl); ctx.quadraticCurveTo(x - sz * 0.45, y - sz * 0.7 * fl, x, y); ctx.quadraticCurveTo(x + sz * 0.45, y - sz * 0.7 * fl, x + sz, y - sz * 0.2 * fl); ctx.stroke();
        }
      });
    },
    objects(L, env) {
      const light = lightLevel(env.sun) * (1 - clamp(env.w.cloud * 0.25 + env.w.rain * 0.25)), list = [...(L.objects || [])].sort((a, b) => (a.z || 0) - (b.z || 0));
      withLayer(L.depth, () => { for (const o of list) drawObject(o, light); });
    },
    precip(L, env) {
      const w = env.w, s = st(L), rain = w.rain, snow = w.snow; if (rain < 0.02 && snow < 0.02) return;
      if (!s.p) { const r = rng(77); s.p = Array.from({ length: 900 }, () => ({ x: r() * 1.3 - 0.15, y: r(), z: 0.4 + r() * 0.6, ph: r() * 6 })); }
      const n = Math.round(900 * Math.max(rain, snow * 0.5)), slant = clamp((w.wind || 3) / 14, 0, 1) * 0.35;
      withLayer(L.depth, () => {
        if (rain >= snow) {
          ctx.strokeStyle = 'rgba(205,218,236,0.42)'; ctx.lineWidth = 1; ctx.beginPath();
          for (let i = 0; i < n; i++) { const p = s.p[i]; p.y += S.dt * (1.4 + p.z) * 1.1; p.x += S.dt * slant * 1.2; if (p.y > 1.05) { p.y = -0.05; p.x = Math.random() * 1.3 - 0.15; } const x = p.x * S.W, y = p.y * S.H, l = S.H * 0.028 * p.z; ctx.moveTo(x, y); ctx.lineTo(x - slant * l, y - l); }
          ctx.stroke();
        } else {
          ctx.fillStyle = 'rgba(255,255,255,0.85)';
          for (let i = 0; i < n; i++) { const p = s.p[i]; p.y += S.dt * 0.09 * (0.5 + p.z); p.x += S.dt * (slant * 0.1 + Math.sin(S.t + p.ph) * 0.01); if (p.y > 1.03) { p.y = -0.03; p.x = Math.random() * 1.3 - 0.15; } ctx.beginPath(); ctx.arc(p.x * S.W, p.y * S.H, 1 + p.z * 2.2, 0, Math.PI * 2); ctx.fill(); }
        }
      });
    },
    fog(L, env) {
      const f = env.w.fog || 0; if (f < 0.02) return;
      const c = mix(env.sky.bot, [235, 238, 242], 0.5);
      withLayer(L.depth, () => { const g = ctx.createLinearGradient(0, S.H * 0.35, 0, S.H); g.addColorStop(0, css(c, 0)); g.addColorStop(0.5, css(c, 0.55 * f)); g.addColorStop(1, css(c, 0.8 * f)); ctx.fillStyle = g; ctx.fillRect(-S.W * 0.2, 0, S.W * 1.4, S.H * 1.2); });
    },
  };

  function sunPos(sun) { const horizon = 0.8; return { x: S.W * (0.06 + 0.88 * sun.t), y: S.H * (horizon - Math.abs(sun.el) * 0.64) }; }

  // ----- effects -----
  function drawStorm(env) {
    if (!env.w.storm) { S.flash = 0; return; }
    S.nextBolt -= S.dt;
    if (S.nextBolt <= 0) {
      S.flash = 1; S.nextBolt = 3 + Math.random() * 7;
      const pts = [[0.2 + Math.random() * 0.6, 0]]; while (pts[pts.length - 1][1] < 0.7) { const [x, y] = pts[pts.length - 1]; pts.push([x + (Math.random() - 0.5) * 0.06, y + 0.04 + Math.random() * 0.05]); } S.bolt = pts;
    }
    if (S.flash > 0.01) {
      ctx.fillStyle = `rgba(230,236,255,${(S.flash * 0.45).toFixed(3)})`; ctx.fillRect(0, 0, S.W, S.H);
      if (S.bolt && S.flash > 0.4) { ctx.strokeStyle = `rgba(255,255,255,${S.flash})`; ctx.lineWidth = 2.5; ctx.beginPath(); S.bolt.forEach(([x, y], i) => (i ? ctx.lineTo : ctx.moveTo).call(ctx, x * S.W, y * S.H)); ctx.stroke(); }
      S.flash *= Math.pow(0.02, S.dt);
    }
  }
  function drawGlare(env, sunLayer) {
    const { sun, w } = env, base = sun.day ? clamp(0.25 + sun.el) * clamp(1 - w.cloud * 0.85 - w.rain * 0.5) : 0.12 * (1 - w.cloud);
    if (base < 0.02) return;
    const o = offset(sunLayer?.depth ?? 0.06), p = sunPos(sun); p.x += o.x; p.y += o.y;
    const diag = Math.hypot(S.W, S.H);
    ctx.save(); ctx.globalCompositeOperation = 'screen';
    if (S.effects.glare) {
      // scanner band: a long stripe pointing away from the sun that slides as the head/mouse moves
      let dx = S.W / 2 - p.x, dy = S.H / 2 - p.y; const L = Math.hypot(dx, dy) || 1; dx /= L; dy /= L;
      const off = (S.v.x * 0.6 + S.v.y * 0.3 + Math.sin(S.t * 0.15) * 0.05) * diag * 0.5, bw = diag * 0.07;
      ctx.save(); ctx.translate(S.W / 2 - dy * off, S.H / 2 + dx * off); ctx.rotate(Math.atan2(dy, dx));
      const g = ctx.createLinearGradient(0, -bw, 0, bw), a = 0.22 * base;
      g.addColorStop(0, 'rgba(255,248,230,0)'); g.addColorStop(0.42, `rgba(255,248,230,${a})`); g.addColorStop(0.5, `rgba(255,255,255,${a * 1.6})`); g.addColorStop(0.58, `rgba(255,248,230,${a})`); g.addColorStop(1, 'rgba(255,248,230,0)');
      ctx.fillStyle = g; ctx.fillRect(-diag, -bw, diag * 2, bw * 2);
      const g2 = ctx.createLinearGradient(0, bw * 1.6, 0, bw * 2.1); g2.addColorStop(0, 'rgba(200,230,255,0)'); g2.addColorStop(0.5, `rgba(200,230,255,${a * 0.6})`); g2.addColorStop(1, 'rgba(200,230,255,0)');
      ctx.fillStyle = g2; ctx.fillRect(-diag, bw * 1.6, diag * 2, bw * 0.5);
      ctx.restore();
    }
    if (S.effects.blindspot) {
      // blind spot: a corner that flares white when you look/point into it
      const side = S.effects.blindCorner === 'auto' ? (p.x > S.W / 2 ? 'right' : 'left') : S.effects.blindCorner;
      const cx = side === 'left' ? S.W * 0.06 : S.W * 0.94, cy = S.H * 0.08;
      const ptr = S.input === 'mouse' && S.pointer ? S.pointer : { x: S.W * (0.5 + S.v.x * 0.5), y: S.H * (0.5 + S.v.y * 0.5) };
      const k = smooth(1 - Math.hypot(ptr.x - cx, ptr.y - cy) / (diag * 0.33)) * clamp(base * 1.6);
      if (k > 0.01) {
        const r = lerp(S.H * 0.12, S.H * 0.75, k), g = ctx.createRadialGradient(cx, cy, 0, cx, cy, r);
        g.addColorStop(0, `rgba(255,255,255,${0.98 * k})`); g.addColorStop(0.3, `rgba(255,252,236,${0.6 * k})`); g.addColorStop(1, 'rgba(255,250,230,0)');
        ctx.fillStyle = g; ctx.fillRect(0, 0, S.W, S.H);
        ctx.fillStyle = `rgba(255,255,250,${0.28 * k * k})`; ctx.fillRect(0, 0, S.W, S.H);
        const ghosts = [[0.35, 0.05, [255, 210, 150]], [0.6, 0.025, [170, 220, 255]], [0.85, 0.07, [200, 255, 210]], [1.25, 0.04, [255, 190, 230]]];
        for (const [t, rr, c] of ghosts) { const gx = lerp(cx, S.W / 2, t), gy = lerp(cy, S.H / 2, t), R2 = S.H * rr * (1 + k), gg = ctx.createRadialGradient(gx, gy, 0, gx, gy, R2); gg.addColorStop(0, css(c, 0.28 * k)); gg.addColorStop(0.8, css(c, 0.12 * k)); gg.addColorStop(1, css(c, 0)); ctx.fillStyle = gg; ctx.beginPath(); ctx.arc(gx, gy, R2, 0, Math.PI * 2); ctx.fill(); }
      }
    }
    ctx.restore();
  }

  // ----- loop -----
  function frame(now) {
    S.raf = requestAnimationFrame(frame);
    if (document.hidden) { S.last = now; return; }
    const dt = Math.min(0.05, (now - (S.last || now)) / 1000); S.last = now; S.dt = dt; S.t += dt;
    if (S.timeMode === 'fixed' && S.speed) S.hour = (S.hour + dt * S.speed / 3600 + 24) % 24;
    S.curH = localHour();
    if (S.input === 'camera') readCamera();
    const k = 1 - Math.exp(-dt * (S.input === 'camera' ? 5 : 7));
    S.v.x += (S.target.x - S.v.x) * k; S.v.y += (S.target.y - S.v.y) * k; S.v.z += (S.target.z - S.v.z) * k;
    regradeBudget = 1;
    const sun = solar(), w = weather(), env = { sun, w, sky: skyColors(sun, w) };
    ctx.setTransform(S.dpr, 0, 0, S.dpr, 0, 0);
    let sunLayer = null;
    for (const L of S.scene.layers) { if (L.hidden) continue; if (L.type === 'sun') sunLayer = L; const f = R[L.type]; if (f) f(L, env); }
    drawStorm(env);
    if (S.effects.glare || S.effects.blindspot) drawGlare(env, sunLayer);
  }

  // ----- scene API -----
  function layerById(id) { return S.scene.layers.find((l) => l.id === id); }
  function agentLayer() { return S.scene.layers.find((l) => l.agent); }
  function loadScene(scene) {
    if (!scene || !Array.isArray(scene.layers)) throw new Error('scene.layers[] required');
    const types = Object.keys(R);
    const base = scene.assetBase ? new URL(scene.assetBase, scene._from || location.href).href : BASE;
    const abs = (u) => (u ? new URL(String(u), base).href : u);
    const layers = scene.layers.slice(0, 24).map((l0, i) => {
      const l = { ...l0 };
      if (l.src) l.src = abs(l.src);
      if (l.sprites) l.sprites = l.sprites.map(abs);
      if (l.objects) l.objects = l.objects.map((o) => ({ ...o, url: abs(o.url), frames: o.frames?.map(abs) }));
      if (l.enabled === false) l.hidden = true;
      if (!types.includes(l.type)) throw new Error(`layer ${i}: type must be ${types.join(', ')}`);
      const out = { ...l, id: String(l.id || l.type + i), depth: clamp(+l.depth || 0, 0, 1.2) };
      if (l.type === 'plate' || (l.type === 'sky' && l.src)) { const u = String(l.src || ''); if (!okUrl(u)) throw new Error(`layer ${i}: plate src must be https or same-site`); out.src = new URL(u, BASE).href; }
      if (l.type === 'objects') out.objects = (l.objects || []).slice(0, 40).map((o, j) => cleanObject(o, out.id + '-' + j));
      return out;
    });
    const canvas = scene.canvas && +scene.canvas.w > 0 && +scene.canvas.h > 0 ? { w: +scene.canvas.w, h: +scene.canvas.h } : null;
    S.scene = { ...scene, canvas, layers }; delete S.scene._from; S.layerState.clear();
    if (scene.weather && scene.weather !== 'live') setWeather(scene.weather); else if (scene.weather === 'live') setWeather('live');
    emit('scene', getScene());
  }
  function getScene() { return JSON.parse(JSON.stringify({ ...S.scene, effects: S.effects, input: S.input })); }
  function addObject(obj, layerId) {
    const L = layerId ? layerById(layerId) : agentLayer();
    if (!L || L.type !== 'objects') throw new Error('no objects layer ' + (layerId || '(agent)'));
    if (!L.agent && !opts.allowAllLayers) throw new Error(`layer "${L.id}" is locked; agent may write only to the agent layer`);
    if (L.objects.length >= 24) throw new Error('agent layer is full (24 objects)');
    const o = cleanObject(obj, 'a' + S.agentSeq++); L.objects = L.objects.filter((x) => x.id !== o.id).concat(o); emit('scene', getScene()); return o.id;
  }
  function updateObject(id, patch) {
    for (const L of S.scene.layers) if (L.type === 'objects') { const i = L.objects.findIndex((o) => o.id === id); if (i >= 0) { if (!L.agent && !opts.allowAllLayers) throw new Error('locked layer'); L.objects[i] = cleanObject({ ...L.objects[i], ...patch, id }, id); emit('scene', getScene()); return true; } }
    return false;
  }
  function removeObject(id) {
    const L = agentLayer(); if (!L) return false; const n = L.objects.length; L.objects = L.objects.filter((o) => o.id !== id); emit('scene', getScene()); return L.objects.length < n;
  }
  function setWeather(w) {
    if (w === 'live') { S.weatherMode = 'live'; refreshWeather().catch(() => {}); return; }
    S.weatherMode = 'manual';
    const base = typeof w === 'string' ? WEATHER_PRESETS[w] : { ...S.weather, ...w };
    if (!base) throw new Error('weather: live | ' + Object.keys(WEATHER_PRESETS).join(' | ') + ' | {cloud,rain,snow,storm,fog,wind}');
    S.weather = { cloud: clamp(+base.cloud || 0), rain: clamp(+base.rain || 0), snow: clamp(+base.snow || 0), storm: !!base.storm, fog: clamp(+base.fog || 0), wind: clamp(+base.wind || 0, 0, 40) };
    emit('weather', S.weather);
  }
  let wTimer = 0;
  async function refreshWeather() {
    clearTimeout(wTimer); wTimer = setTimeout(() => refreshWeather().catch(() => {}), 15 * 60e3);
    try { S.live = await fetchWeather(S.location.lat, S.location.lon); emit('weather', { ...S.live, location: S.location }); }
    catch (e) { emit('weather', { error: e.message }); throw e; }
  }

  const api = {
    setInput, getInput: () => S.input,
    calibrate() { cam.base = null; S.target = { x: 0, y: 0, z: 0 }; },
    setStrength(v) { S.strength = clamp(+v, 0, 3); },
    setEffects(e) { Object.assign(S.effects, e); emit('scene', getScene()); },
    setWeather, refreshWeather, getWeather: () => ({ mode: S.weatherMode, ...(weather() || {}), location: S.location }),
    async setLocation(loc) { S.location = typeof loc === 'string' ? await geocode(loc) : loc; return refreshWeather(); },
    setTime(h, speed = 0) { if (h == null || h === 'live') { S.timeMode = 'live'; S.speed = 0; } else { S.timeMode = 'fixed'; S.hour = ((+h % 24) + 24) % 24; S.speed = +speed || 0; } },
    getTime: () => ({ mode: S.timeMode, hour: S.curH ?? localHour(), sunrise: S.live?.sunrise ?? 7.2, sunset: S.live?.sunset ?? 17.8 }),
    async loadPreset(name) {
      if (!PRESETS[name]) throw new Error('preset: ' + Object.keys(PRESETS).join(' | '));
      const p = PRESETS[name]();
      if (p.url) return api.loadSceneUrl(p.url, { live: p.live, name: p.name });
      loadScene(p);
    },
    async loadSceneUrl(url, o = {}) {
      const r = await fetch(url); if (!r.ok) throw new Error('scene ' + r.status);
      const sc = await r.json(); sc._from = new URL(url, location.href).href; if (o.name) sc.name = o.name;
      if (o.live) {
        // reference manifests switch clouds/precip off for comparison; a live wallpaper turns them on
        sc.layers = sc.layers.map((l) => (l.type === 'clouds' ? { ...l, enabled: true, density: l.density ?? 0.6, alt: l.alt || [-0.02, 0.22], scale: l.scale ?? 0.55 }
          : l.type === 'precip' ? { ...l, enabled: true }
          : l.type === 'sun' ? { ...l, enabled: true, only: 'night' } : l));
        const i = sc.layers.findIndex((l) => l.type === 'sky');
        if (!sc.layers.some((l) => l.type === 'stars')) sc.layers.splice(i + 1, 0, { id: 'stars', type: 'stars', depth: 0.02 });
        if (!sc.layers.some((l) => l.type === 'fog')) sc.layers.push({ id: 'fog', type: 'fog', depth: 0.45 });
      }
      loadScene(sc);
    },
    loadScene, getScene, addObject, updateObject, removeObject,
    clearAgent() { const L = agentLayer(); if (L) L.objects = []; emit('scene', getScene()); },
    setLayerVisible(id, on) { const L = layerById(id); if (L) L.hidden = !on; },
    on(e, f) { (listeners[e] ||= []).push(f); return () => { listeners[e] = listeners[e].filter((x) => x !== f); }; },
    destroy() { cancelAnimationFrame(S.raf); ro.disconnect(); stopCamera(); clearTimeout(wTimer); window.removeEventListener('pointermove', onMouse); document.removeEventListener('pointerleave', onLeave); },
    _state: S,
  };

  // command bridge: the portal / bot can drive the background with postMessage({type:'livebg', cmd, args})
  if (opts.bridge !== false) {
    window.addEventListener('message', async (e) => {
      const m = e.data; if (!m || m.type !== 'livebg' || typeof api[m.cmd] !== 'function' || m.cmd.startsWith('_') || m.cmd === 'on' || m.cmd === 'destroy') return;
      if (opts.bridgeOrigin && e.origin !== opts.bridgeOrigin) return;
      let reply;
      try { reply = { ok: true, result: await api[m.cmd](...(m.args || [])) }; } catch (err) { reply = { ok: false, error: err.message }; }
      e.source?.postMessage?.({ type: 'livebg:reply', id: m.id, ...reply }, e.origin === 'null' ? '*' : e.origin);
    });
  }

  { const p0 = !opts.scene && PRESETS[opts.preset || 'weather']?.();
    if (p0?.url) { loadScene(PRESETS.sky()); api.loadPreset(opts.preset).catch((e) => emit('error', e.message)); }
    else loadScene(opts.scene || p0 || PRESETS.weather()); }
  if (opts.weather) setWeather(opts.weather);
  if (opts.input) setInput(opts.input).catch(() => {});
  S.raf = requestAnimationFrame(frame);
  return api;
}
