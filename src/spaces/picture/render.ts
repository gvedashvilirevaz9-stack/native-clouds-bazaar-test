// Picture rendering and actions shared by the editor UI, the agent commands and the demo.
import {getBlob, putBlob} from '../garage/store';
import {ingest} from '../intake/store';
import {toBoard, toNotebook} from '../intake/routes';
import {picture, clipboard, uid, DEFAULT_ADJUST, rotateObj, rotRect, flipObj, type PicDoc, type Obj, type Rect} from './model';

const cache = new Map<string, Promise<HTMLImageElement>>();
export function loadImage(src: string): Promise<HTMLImageElement> {
  if (!cache.has(src)) cache.set(src, (async () => {
    let url = src;
    if (src.startsWith('idb:')) { const b = await getBlob(src); if (!b) throw new Error('IMAGE_MISSING'); url = URL.createObjectURL(b); }
    return new Promise<HTMLImageElement>((res, rej) => { const i = new Image(); i.onload = () => res(i); i.onerror = () => rej(new Error('IMAGE_DECODE_FAILED')); i.src = url; });
  })());
  return cache.get(src)!;
}

/** Scale that makes a w×h image rotated by `deg` still cover the whole w×h frame. */
export function levelScale(w: number, h: number, deg: number) {
  const t = Math.abs(deg) * Math.PI / 180, c = Math.cos(t), s = Math.sin(t);
  return Math.max((w * c + h * s) / w, (w * s + h * c) / h);
}
const leveled = new Map<string, HTMLCanvasElement>();
/** The base after straightening (cached per angle), so marks, blur and export all see the same pixels. */
async function levelBase(d: PicDoc): Promise<CanvasImageSource> {
  const img = await loadImage(d.base);
  const a = d.angle || 0; if (Math.abs(a) < 0.01) return img;
  const key = d.base + '|' + a.toFixed(2) + '|' + d.w + 'x' + d.h;
  let c = leveled.get(key);
  if (!c) {
    c = document.createElement('canvas'); c.width = d.w; c.height = d.h; const x = c.getContext('2d')!;
    const k = levelScale(d.w, d.h, a);
    x.translate(d.w / 2, d.h / 2); x.rotate(a * Math.PI / 180); x.scale(k, k); x.imageSmoothingQuality = 'high'; x.drawImage(img, -d.w / 2, -d.h / 2, d.w, d.h);
    if (leveled.size > 6) leveled.clear();
    leveled.set(key, c);
  }
  return c;
}

/** Draw the document in base coordinates; caller sets the transform (scale, crop offset). */
export async function drawDoc(ctx: CanvasRenderingContext2D, d: PicDoc) {
  const base = await levelBase(d) as HTMLImageElement;
  const a = d.adjust;
  ctx.save();
  ctx.filter = `brightness(${a.brightness}%) contrast(${a.contrast}%) saturate(${a.saturate}%)`;
  ctx.drawImage(base, 0, 0, d.w, d.h);
  ctx.restore();
  for (const o of d.objects) await drawObj(ctx, o, d, base);
}
async function drawObj(ctx: CanvasRenderingContext2D, o: Obj, d: PicDoc, base: HTMLImageElement) {
  ctx.save();
  switch (o.type) {
    case 'arrow': {
      ctx.strokeStyle = ctx.fillStyle = o.color; ctx.lineWidth = o.width; ctx.lineCap = 'round';
      const ang = Math.atan2(o.b.y - o.a.y, o.b.x - o.a.x), head = Math.max(14, o.width * 4);
      ctx.beginPath(); ctx.moveTo(o.a.x, o.a.y); ctx.lineTo(o.b.x - Math.cos(ang) * head * 0.6, o.b.y - Math.sin(ang) * head * 0.6); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(o.b.x, o.b.y);
      ctx.lineTo(o.b.x - head * Math.cos(ang - 0.45), o.b.y - head * Math.sin(ang - 0.45));
      ctx.lineTo(o.b.x - head * Math.cos(ang + 0.45), o.b.y - head * Math.sin(ang + 0.45)); ctx.closePath(); ctx.fill();
      break;
    }
    case 'rect': ctx.strokeStyle = o.color; ctx.lineWidth = o.width; ctx.strokeRect(o.r.x, o.r.y, o.r.w, o.r.h); break;
    case 'ellipse': ctx.strokeStyle = o.color; ctx.lineWidth = o.width; ctx.beginPath(); ctx.ellipse(o.r.x + o.r.w / 2, o.r.y + o.r.h / 2, Math.abs(o.r.w / 2), Math.abs(o.r.h / 2), 0, 0, Math.PI * 2); ctx.stroke(); break;
    case 'highlight': ctx.globalAlpha = 0.32; ctx.fillStyle = o.color; ctx.fillRect(o.r.x, o.r.y, o.r.w, o.r.h); break;
    case 'pen': ctx.strokeStyle = o.color; ctx.lineWidth = o.width; ctx.lineCap = ctx.lineJoin = 'round'; ctx.beginPath(); o.pts.forEach((p, i) => i ? ctx.lineTo(p.x, p.y) : ctx.moveTo(p.x, p.y)); ctx.stroke(); break;
    case 'text': {
      if (o.meme) { ctx.font = `900 ${o.size}px Impact, "Arial Black", sans-serif`; ctx.textAlign = 'center'; ctx.textBaseline = 'alphabetic'; ctx.lineJoin = 'round'; ctx.lineWidth = Math.max(2, o.size / 7); ctx.strokeStyle = '#000'; ctx.fillStyle = '#fff'; ctx.strokeText(o.text.toUpperCase(), o.at.x, o.at.y); ctx.fillText(o.text.toUpperCase(), o.at.x, o.at.y); break; }
      ctx.font = `600 ${o.size}px system-ui, sans-serif`; ctx.textBaseline = 'alphabetic';
      if (o.bg) { const w = ctx.measureText(o.text).width; ctx.fillStyle = '#ffffffe6'; ctx.fillRect(o.at.x - o.size * 0.25, o.at.y - o.size * 1.0, w + o.size * 0.5, o.size * 1.3); }
      ctx.fillStyle = o.color; ctx.fillText(o.text, o.at.x, o.at.y); break;
    }
    case 'pixelate': {
      const r = o.r, cell = Math.max(4, o.cell); const tw = Math.max(1, Math.round(r.w / cell)), th = Math.max(1, Math.round(r.h / cell));
      const t = document.createElement('canvas'); t.width = tw; t.height = th; t.getContext('2d')!.drawImage(base, r.x, r.y, r.w, r.h, 0, 0, tw, th);
      ctx.imageSmoothingEnabled = false; ctx.drawImage(t, 0, 0, tw, th, r.x, r.y, r.w, r.h); break;
    }
    case 'erase': ctx.fillStyle = o.color; ctx.fillRect(o.r.x, o.r.y, o.r.w, o.r.h); break;
    case 'image': { try { const im = await loadImage(o.src); ctx.drawImage(im, o.r.x, o.r.y, o.r.w, o.r.h); } catch { /* missing layer */ } break; }
  }
  ctx.restore();
}

/** Render a region (default: crop or whole image) at 1:1 into a canvas. */
export async function renderRegion(d: PicDoc, region?: Rect | null) {
  const r = region || d.crop || {x: 0, y: 0, w: d.w, h: d.h};
  const c = document.createElement('canvas'); c.width = Math.max(1, Math.round(r.w)); c.height = Math.max(1, Math.round(r.h));
  const ctx = c.getContext('2d')!; ctx.translate(-r.x, -r.y); await drawDoc(ctx, d);
  return c;
}
const toBlob = (c: HTMLCanvasElement, type = 'image/webp') => new Promise<Blob>((res, rej) => c.toBlob(b => b ? res(b) : rej(new Error('ENCODE_FAILED')), type, 0.92));

/** Open any image: Inbox page ref, data URL, https URL or blob. */
export async function openPicture(src: string, name = 'image', sourceAssetId: string | null = null) {
  const im = await loadImage(src);
  picture.open({id: uid(), name, base: src, w: im.naturalWidth, h: im.naturalHeight, rotate: 0, flip: false, crop: null, adjust: {...DEFAULT_ADJUST}, objects: [], sourceAssetId, updatedAt: Date.now()});
  return {opened: name, w: im.naturalWidth, h: im.naturalHeight};
}

/** Rotate 90° clockwise: bake into a new base so marks and crop stay aligned. */
export async function rotateRight() {
  const d = picture.get().doc; if (!d) return;
  const im = await loadImage(d.base);
  const c = document.createElement('canvas'); c.width = d.h; c.height = d.w; const x = c.getContext('2d')!;
  x.translate(d.h, 0); x.rotate(Math.PI / 2); x.drawImage(im, 0, 0, d.w, d.h);
  const ref = await putBlob(await toBlob(c, 'image/png'));
  picture.change(doc => ({...doc, base: ref, w: d.h, h: d.w, crop: doc.crop ? rotRect(doc.crop, d.h) : null, objects: doc.objects.map(o => rotateObj(o, d.h))}));
}
export async function flipH() {
  const d = picture.get().doc; if (!d) return;
  const im = await loadImage(d.base);
  const c = document.createElement('canvas'); c.width = d.w; c.height = d.h; const x = c.getContext('2d')!;
  x.translate(d.w, 0); x.scale(-1, 1); x.drawImage(im, 0, 0);
  const ref = await putBlob(await toBlob(c, 'image/png'));
  picture.change(doc => ({...doc, base: ref, crop: doc.crop ? {...doc.crop, x: d.w - doc.crop.x - doc.crop.w} : null, objects: doc.objects.map(o => flipObj(o, d.w))}));
}

export async function copyRegion(r: Rect) {
  const d = picture.get().doc; if (!d) throw new Error('NO_PICTURE');
  const c = await renderRegion(d, r);
  const url = c.toDataURL('image/png'); clipboard.set(url);
  try { const blob = await toBlob(c, 'image/png'); await (navigator.clipboard as any)?.write?.([new (window as any).ClipboardItem({'image/png': blob})]); } catch { /* system clipboard is optional */ }
  return {copied: {w: c.width, h: c.height}};
}
export async function cutRegion(r: Rect, fill = '#ffffff') {
  await copyRegion(r);
  picture.change(doc => ({...doc, objects: [...doc.objects, {id: uid(), type: 'erase', r, color: fill}]}));
  return {cut: r};
}
/** Paste an image as a movable layer, centred in the visible area. */
export async function pasteImage(src?: string | null, at?: {x: number; y: number}) {
  const d = picture.get().doc; const url = src || clipboard.get(); if (!d || !url) throw new Error('NOTHING_TO_PASTE');
  const im = await loadImage(url);
  const view = d.crop || {x: 0, y: 0, w: d.w, h: d.h};
  const k = Math.min(1, (view.w * 0.6) / im.naturalWidth, (view.h * 0.6) / im.naturalHeight);
  const w = im.naturalWidth * k, h = im.naturalHeight * k;
  const p = at || {x: view.x + (view.w - w) / 2, y: view.y + (view.h - h) / 2};
  const id = uid();
  picture.change(doc => ({...doc, objects: [...doc.objects, {id, type: 'image', r: {x: p.x, y: p.y, w, h}, src: url}]}));
  return {layerId: id};
}
export async function pasteBlob(b: Blob) {
  const ref = await putBlob(b); return pasteImage(ref);
}

/** Save the edited picture as a new Inbox asset and optionally send it on. */
export async function savePicture(to?: 'board' | 'notebook' | null, by: 'human' | 'agent' = 'human', region?: Rect | null) {
  const d = picture.get().doc; if (!d) throw new Error('NO_PICTURE');
  const c = await renderRegion(d, region);
  const name = d.name.replace(/\.[a-z0-9]+$/i, '') + (region ? ' · фрагмент' : ' · правка') + '.webp';
  const asset = await ingest(await toBlob(c), {name, by, source: 'picture', select: false, category: undefined});
  if (to === 'board') await toBoard(asset.id, {by});
  if (to === 'notebook') toNotebook(asset.id, {by});
  return {assetId: asset.id, name, w: c.width, h: c.height, to: to || null};
}
export async function downloadPicture() {
  const d = picture.get().doc; if (!d) return;
  const c = await renderRegion(d);
  const a = document.createElement('a'); a.href = c.toDataURL('image/png'); a.download = d.name.replace(/\.[a-z0-9]+$/i, '') + '-edit.png'; a.click();
}
