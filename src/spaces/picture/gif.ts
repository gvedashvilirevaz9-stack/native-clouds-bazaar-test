// GIF mode: a few pictures or video frames → an animated GIF (or MP4/WebM), with meme captions and B/W.
// Everything happens in the browser: gifenc for GIF, MediaRecorder for video.
import {useSyncExternalStore} from 'react';
import {intake, ingest} from '../intake/store';
import {loadImage} from './render';

export type GifSettings = {delay: number; width: number; ratio: '1:1' | '4:3' | '16:9' | '9:16' | 'auto'; fit: 'contain' | 'cover'; bg: string; grayscale: boolean; boomerang: boolean; top: string; bottom: string; textSize: number};
export type GifFrame = {assetId: string; label?: string};
type S = {frames: GifFrame[]; settings: GifSettings; rev: number};
const KEY = 'sunrise.media.gif.v1';
const DEFAULTS: GifSettings = {delay: 500, width: 480, ratio: 'auto', fit: 'contain', bg: '#ffffff', grayscale: false, boomerang: false, top: '', bottom: '', textSize: 11};
let s: S = (() => { try { const v = JSON.parse(localStorage.getItem(KEY) || 'null'); if (v?.frames) return {frames: v.frames, settings: {...DEFAULTS, ...v.settings}, rev: 0}; } catch { /* ignore */ } return {frames: [], settings: {...DEFAULTS}, rev: 0}; })();
const subs = new Set<() => void>();
const emit = () => { s = {...s, rev: s.rev + 1}; try { localStorage.setItem(KEY, JSON.stringify({frames: s.frames, settings: s.settings})); } catch { /* ignore */ } subs.forEach(f => f()); };
export const gif = {
  get: () => s, subscribe(f: () => void) { subs.add(f); return () => { subs.delete(f); }; },
  load(frames: GifFrame[], keep = false) { s = {...s, frames: [...(keep ? s.frames : []), ...frames.filter(f => intake.get(f.assetId)?.pages.length)].slice(0, 120)}; emit(); return {frames: s.frames.length}; },
  set(p: Partial<GifSettings>) { s = {...s, settings: {...s.settings, ...p}}; emit(); return s.settings; },
  move(i: number, d: number) { const f = s.frames.slice(); const j = i + d; if (j < 0 || j >= f.length) return; [f[i], f[j]] = [f[j], f[i]]; s = {...s, frames: f}; emit(); },
  remove(i: number) { s = {...s, frames: s.frames.filter((_, k) => k !== i)}; emit(); },
  clear() { s = {...s, frames: []}; emit(); },
};
export const useGif = () => useSyncExternalStore(gif.subscribe, gif.get);

/** Frame order including the boomerang return trip. */
export function sequence(st = s) { const f = st.frames; return st.settings.boomerang && f.length > 2 ? [...f, ...f.slice(1, -1).reverse()] : f; }

async function sourceImages(st = s) {
  const out: HTMLImageElement[] = [];
  for (const f of st.frames) { const a = intake.get(f.assetId); const ref = a?.pages[0]?.ref; if (ref) out.push(await loadImage(ref)); }
  return out;
}
export function frameSize(imgs: HTMLImageElement[], st = s) {
  const W = st.settings.width;
  const r = st.settings.ratio === 'auto' ? (imgs[0] ? imgs[0].naturalWidth / imgs[0].naturalHeight : 1) : ({'1:1': 1, '4:3': 4 / 3, '16:9': 16 / 9, '9:16': 9 / 16} as const)[st.settings.ratio];
  return {w: Math.round(W / 2) * 2, h: Math.round(W / r / 2) * 2};
}
/** Draw one frame: fit the picture, optional B/W, meme captions. */
export function drawFrame(ctx: CanvasRenderingContext2D, img: HTMLImageElement, w: number, h: number, st = s) {
  const o = st.settings;
  ctx.save(); ctx.fillStyle = o.bg; ctx.fillRect(0, 0, w, h);
  const k = (o.fit === 'cover' ? Math.max : Math.min)(w / img.naturalWidth, h / img.naturalHeight);
  const dw = img.naturalWidth * k, dh = img.naturalHeight * k;
  if (o.grayscale) ctx.filter = 'grayscale(1)';
  ctx.drawImage(img, (w - dw) / 2, (h - dh) / 2, dw, dh);
  ctx.filter = 'none';
  const size = Math.round(w * o.textSize / 100);
  const meme = (text: string, y: number, base: CanvasTextBaseline) => {
    if (!text.trim()) return;
    ctx.font = `900 ${size}px Impact, "Arial Black", "Helvetica Neue", sans-serif`; ctx.textAlign = 'center'; ctx.textBaseline = base;
    ctx.lineJoin = 'round'; ctx.lineWidth = Math.max(2, size / 7); ctx.strokeStyle = '#000'; ctx.fillStyle = '#fff';
    const lines = wrap(ctx, text.toUpperCase(), w * 0.92);
    const lh = size * 1.05; const list = base === 'bottom' ? lines.slice().reverse() : lines;
    list.forEach((l, i) => { const yy = base === 'bottom' ? y - i * lh : y + i * lh; ctx.strokeText(l, w / 2, yy); ctx.fillText(l, w / 2, yy); });
  };
  meme(o.top, size * 0.35, 'top'); meme(o.bottom, h - size * 0.35, 'bottom');
  ctx.restore();
}
function wrap(ctx: CanvasRenderingContext2D, t: string, max: number) {
  const words = t.split(/\s+/); const out: string[] = []; let line = '';
  for (const wd of words) { const n = line ? line + ' ' + wd : wd; if (ctx.measureText(n).width > max && line) { out.push(line); line = wd; } else line = n; }
  if (line) out.push(line); return out.slice(0, 3);
}

export async function encodeGif(): Promise<Blob> {
  const mod: any = await import('gifenc'); const lib = mod.GIFEncoder ? mod : (mod.default || mod); const {GIFEncoder, quantize, applyPalette} = lib;
  const imgs = await sourceImages(); if (!imgs.length) throw new Error('NO_FRAMES');
  const {w, h} = frameSize(imgs);
  const order = sequence().map(f => imgs[s.frames.indexOf(f)]);
  const c = document.createElement('canvas'); c.width = w; c.height = h; const ctx = c.getContext('2d', {willReadFrequently: true})!;
  const enc = GIFEncoder();
  for (const im of order) {
    drawFrame(ctx, im, w, h);
    const data = ctx.getImageData(0, 0, w, h).data;
    const palette = quantize(data, 256); const index = applyPalette(data, palette);
    enc.writeFrame(index, w, h, {palette, delay: s.settings.delay});
  }
  enc.finish();
  return new Blob([enc.bytes()], {type: 'image/gif'});
}

export function videoMime(prefer: 'mp4' | 'webm' = 'mp4') {
  const MR = (window as any).MediaRecorder; if (!MR) return null;
  const list = prefer === 'mp4' ? ['video/mp4;codecs=avc1', 'video/mp4', 'video/webm;codecs=vp9', 'video/webm'] : ['video/webm;codecs=vp9', 'video/webm', 'video/mp4'];
  return list.find(t => MR.isTypeSupported?.(t)) || null;
}
/** Record the animation as a video (loops until at least 3 s). */
export async function encodeVideo(prefer: 'mp4' | 'webm' = 'mp4'): Promise<Blob> {
  const mime = videoMime(prefer); if (!mime) throw new Error('VIDEO_RECORDING_NOT_SUPPORTED');
  const imgs = await sourceImages(); if (!imgs.length) throw new Error('NO_FRAMES');
  const {w, h} = frameSize(imgs);
  const order = sequence().map(f => imgs[s.frames.indexOf(f)]);
  const c = document.createElement('canvas'); c.width = w; c.height = h; const ctx = c.getContext('2d')!;
  drawFrame(ctx, order[0], w, h);
  const stream = (c as any).captureStream(30) as MediaStream;
  const rec = new MediaRecorder(stream, {mimeType: mime, videoBitsPerSecond: 2_500_000});
  const chunks: Blob[] = []; rec.ondataavailable = e => { if (e.data.size) chunks.push(e.data); };
  const done = new Promise<void>(r => { rec.onstop = () => r(); });
  rec.start(200);
  const loops = Math.max(1, Math.ceil(3000 / (order.length * s.settings.delay)));
  for (let l = 0; l < loops; l++) for (const im of order) { drawFrame(ctx, im, w, h); await new Promise(r => setTimeout(r, s.settings.delay)); }
  rec.stop(); await done; stream.getTracks().forEach(t => t.stop());
  return new Blob(chunks, {type: mime.split(';')[0]});
}

/** Save the result into the Inbox (so it can go to the board, notebook or be downloaded). */
export async function exportGif(format: 'gif' | 'mp4' | 'webm' = 'gif', by: 'human' | 'agent' = 'human') {
  const blob = format === 'gif' ? await encodeGif() : await encodeVideo(format);
  const ext = blob.type.includes('gif') ? 'gif' : blob.type.includes('mp4') ? 'mp4' : 'webm';
  const name = `${(s.settings.top || s.settings.bottom || 'animation').slice(0, 40).replace(/[\\/:*?"<>|]/g, '')} · ${s.frames.length} кадр.${ext}`;
  const asset = await ingest(blob, {name, by, source: 'gif', select: false});
  return {assetId: asset.id, name, size: blob.size, type: blob.type, frames: sequence().length};
}
