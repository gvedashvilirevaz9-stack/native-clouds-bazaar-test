// Picture (Картинка): a light, non-destructive image editor document.
// Everything is stored in base-image pixel coordinates; crop is only a viewport,
// so the person (or the agent) can always undo, move or restyle any mark.
import {useSyncExternalStore} from 'react';

export type Pt = {x: number; y: number};
export type Rect = {x: number; y: number; w: number; h: number};
export type Obj =
  | {id: string; type: 'arrow'; a: Pt; b: Pt; color: string; width: number}
  | {id: string; type: 'rect' | 'ellipse' | 'highlight'; r: Rect; color: string; width: number}
  | {id: string; type: 'pen'; pts: Pt[]; color: string; width: number}
  | {id: string; type: 'text'; at: Pt; text: string; color: string; size: number; bg?: boolean; meme?: boolean}
  | {id: string; type: 'pixelate'; r: Rect; cell: number}
  | {id: string; type: 'erase'; r: Rect; color: string}
  | {id: string; type: 'image'; r: Rect; src: string /* data URL or idb: */};

export type Adjust = {brightness: number; contrast: number; saturate: number};
export type PicDoc = {
  id: string; name: string;
  base: string;            // idb:… or data: URL of the source image
  w: number; h: number;    // base pixel size
  rotate: 0 | 90 | 180 | 270; flip: boolean;
  crop: Rect | null;
  adjust: Adjust;
  /** Straighten angle in degrees (−45…45). The base is rotated and scaled to fill, so no empty corners. */
  angle?: number;
  objects: Obj[];
  sourceAssetId?: string | null;
  updatedAt: number;
};

export const DEFAULT_ADJUST: Adjust = {brightness: 100, contrast: 100, saturate: 100};
export const uid = () => 'o' + Math.random().toString(36).slice(2, 9);

// One open document at a time; undo/redo as snapshots.
type S = {doc: PicDoc | null; past: PicDoc[]; future: PicDoc[]; rev: number};
let s: S = {doc: null, past: [], future: [], rev: 0};
const subs = new Set<() => void>();
const emit = () => { s = {...s, rev: s.rev + 1}; subs.forEach(f => f()); };
export const picture = {
  get: () => s,
  subscribe(f: () => void) { subs.add(f); return () => { subs.delete(f); }; },
  open(doc: PicDoc) { s = {doc, past: [], future: [], rev: s.rev}; emit(); },
  close() { s = {doc: null, past: [], future: [], rev: s.rev}; emit(); },
  /** Commit a change (pushes undo). */
  change(fn: (d: PicDoc) => PicDoc) { if (!s.doc) return; const next = {...fn(structuredClone(s.doc)), updatedAt: Date.now()}; s = {...s, past: [...s.past.slice(-60), s.doc], future: [], doc: next}; emit(); },
  /** Live change without undo (dragging). */
  live(fn: (d: PicDoc) => PicDoc) { if (!s.doc) return; s = {...s, doc: fn({...s.doc})}; emit(); },
  undo() { const p = s.past.at(-1); if (!p || !s.doc) return; s = {...s, past: s.past.slice(0, -1), future: [s.doc, ...s.future], doc: p}; emit(); },
  redo() { const f = s.future[0]; if (!f || !s.doc) return; s = {...s, past: [...s.past, s.doc], future: s.future.slice(1), doc: f}; emit(); },
};
export const usePicture = () => useSyncExternalStore(picture.subscribe, picture.get);

// Internal clipboard: the last copied region as a PNG data URL (system clipboard is used too when allowed).
let clip: string | null = null;
export const clipboard = {get: () => clip, set: (v: string | null) => { clip = v; emit(); }};

/** Map a point/rect when the base is rotated 90° clockwise (w×h → h×w). */
export function rot90(p: Pt, h: number): Pt { return {x: h - p.y, y: p.x}; }
export function rotRect(r: Rect, h: number): Rect { return {x: h - r.y - r.h, y: r.x, w: r.h, h: r.w}; }
export function rotateObj(o: Obj, h: number): Obj {
  switch (o.type) {
    case 'arrow': return {...o, a: rot90(o.a, h), b: rot90(o.b, h)};
    case 'pen': return {...o, pts: o.pts.map(p => rot90(p, h))};
    case 'text': return {...o, at: rot90(o.at, h)};
    default: return {...o, r: rotRect((o as any).r, h)} as Obj;
  }
}
export function flipObj(o: Obj, w: number): Obj {
  const fp = (p: Pt) => ({x: w - p.x, y: p.y}); const fr = (r: Rect) => ({...r, x: w - r.x - r.w});
  switch (o.type) {
    case 'arrow': return {...o, a: fp(o.a), b: fp(o.b)};
    case 'pen': return {...o, pts: o.pts.map(fp)};
    case 'text': return o;
    default: return {...o, r: fr((o as any).r)} as Obj;
  }
}
export function normRect(a: Pt, b: Pt): Rect { return {x: Math.min(a.x, b.x), y: Math.min(a.y, b.y), w: Math.abs(a.x - b.x), h: Math.abs(a.y - b.y)}; }
export function bbox(o: Obj): Rect {
  switch (o.type) {
    case 'arrow': return normRect(o.a, o.b);
    case 'pen': { const xs = o.pts.map(p => p.x), ys = o.pts.map(p => p.y); return {x: Math.min(...xs), y: Math.min(...ys), w: Math.max(...xs) - Math.min(...xs), h: Math.max(...ys) - Math.min(...ys)}; }
    case 'text': { const w = Math.max(20, o.text.length * o.size * 0.6); return {x: o.meme ? o.at.x - w / 2 : o.at.x, y: o.at.y - o.size, w, h: o.size * 1.3}; }
    default: return (o as any).r;
  }
}
export function moveObj(o: Obj, dx: number, dy: number): Obj {
  const mp = (p: Pt) => ({x: p.x + dx, y: p.y + dy});
  switch (o.type) {
    case 'arrow': return {...o, a: mp(o.a), b: mp(o.b)};
    case 'pen': return {...o, pts: o.pts.map(mp)};
    case 'text': return {...o, at: mp(o.at)};
    default: { const r = (o as any).r as Rect; return {...o, r: {...r, x: r.x + dx, y: r.y + dy}} as Obj; }
  }
}
