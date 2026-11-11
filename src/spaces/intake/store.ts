// Intake store: the room's reception desk. Originals and page images live in IndexedDB
// (same blob store as the board), the asset list lives in localStorage.
import {useSyncExternalStore} from 'react';
import {putBlob, getBlob} from '../garage/store';
import {detect, type Detected, type Family} from './detect';
import {convert, coverPage, fmtSize, type Converted, type Page} from './convert';
import {suggestCategory, categoryById, type CategoryId} from './categories';

export const INTAKE_KEY = 'sunrise.intake.v1.assets';
export const MAX_FILE = 300 * 1024 * 1024;
const MAX_ASSETS = 200;

export type AssetStatus = 'converting' | 'ready' | 'partial' | 'needs-agent' | 'failed';
export type AssetPage = {n: number; ref: string; w: number; h: number; label?: string};
export type RouteTarget = 'board' | 'notebook' | 'notebook-text' | 'encyclopedia' | 'agent' | 'download';
export type Asset = {
  id: string;
  name: string;
  size: number;
  family: Family;
  format: string;
  mime: string;
  ext: string;
  origRef: string | null;
  pages: AssetPage[];
  textRef: string | null;
  excerpt: string;
  meta: Record<string, unknown>;
  status: AssetStatus;
  note?: string;
  error?: string;
  by: 'human' | 'agent';
  source?: string;
  at: number;
  convertedBy?: 'browser' | 'agent';
  entries?: {name: string; size: number}[];
  routes: {to: RouteTarget; at: number; detail?: string}[];
  agent?: {request: string; at: number; state: 'pending' | 'working' | 'done'; reply?: string};
  category?: CategoryId;
  /** true when the person picked the category; false when the room suggested it. */
  categorySet?: boolean;
  batchId?: string | null;
  /** Structured record extracted by the agent, shaped by the category schema. */
  data?: Record<string, any> | null;
  dataAt?: number;
};

export type BatchState = 'collecting' | 'sent' | 'done';
export type Batch = {
  id: string;
  title: string;
  category: CategoryId;
  assetIds: string[];
  at: number;
  state: BatchState;
  request?: string;
  sentAt?: number;
  summary?: {at: number; notes?: string; by: 'portal' | 'agent'} | null;
};
export const BATCH_KEY = 'sunrise.intake.v1.batches';
export const MAX_BATCH = 50;

const listeners = new Set<() => void>();
let cache: Asset[] | null = null;
let rev = 0;
function load(): Asset[] {
  if (cache) return cache;
  try { const v = JSON.parse(localStorage.getItem(INTAKE_KEY) || '[]'); cache = Array.isArray(v) ? v.filter(a => a && a.id) : []; }
  catch { cache = []; }
  // A reload interrupts any running conversion; say so instead of spinning forever.
  cache = cache!.map(a => a.status === 'converting' ? {...a, status: 'failed', error: 'INTERRUPTED'} : a);
  return cache!;
}
function save(list: Asset[]) {
  cache = list.slice(0, MAX_ASSETS); rev++;
  try { localStorage.setItem(INTAKE_KEY, JSON.stringify(cache)); } catch { /* quota: keep in memory */ }
  listeners.forEach(f => f());
}
const uid = () => 'as-' + Math.random().toString(36).slice(2, 10) + Date.now().toString(36).slice(-4);

export const intake = {
  list: () => load(),
  get: (id: string) => load().find(a => a.id === id) || null,
  subscribe(fn: () => void) { listeners.add(fn); return () => { listeners.delete(fn); }; },
  revision: () => rev,
  patch(id: string, p: Partial<Asset>) {
    const list = load(); const i = list.findIndex(a => a.id === id); if (i < 0) throw new Error('ASSET_NOT_FOUND');
    const next = {...list[i], ...p}; const copy = list.slice(); copy[i] = next; save(copy); return next;
  },
  remove(id: string) {
    const bid = intake.get(id)?.batchId; const b = bid ? loadBatches().find(x => x.id === bid) : null;
    if (b) saveBatches(loadBatches().map(x => x.id === b.id ? {...x, assetIds: x.assetIds.filter(a => a !== id)} : x));
    save(load().filter(a => a.id !== id)); if (selected === id) select(load()[0]?.id || null); return {removed: id}; },
  route(id: string, to: RouteTarget, detail?: string) {
    const a = intake.get(id); if (!a) throw new Error('ASSET_NOT_FOUND');
    return intake.patch(id, {routes: [...a.routes, {to, at: Date.now(), detail}].slice(-30)});
  },
};

let batchCache: Batch[] | null = null;
function loadBatches(): Batch[] {
  if (batchCache) return batchCache;
  try { const v = JSON.parse(localStorage.getItem(BATCH_KEY) || '[]'); batchCache = Array.isArray(v) ? v : []; } catch { batchCache = []; }
  return batchCache!;
}
function saveBatches(list: Batch[]) {
  batchCache = list.slice(0, 60); rev++;
  try { localStorage.setItem(BATCH_KEY, JSON.stringify(batchCache)); } catch { /* keep in memory */ }
  listeners.forEach(f => f());
}
export const batches = {
  list: () => loadBatches(),
  get: (id?: string | null) => loadBatches().find(b => b.id === id) || null,
  create(p: {title?: string; category?: CategoryId; assetIds?: string[]} = {}) {
    const ids = (p.assetIds || []).filter(id => intake.get(id)).slice(0, MAX_BATCH);
    const cat = p.category || (ids.length ? (intake.get(ids[0])?.category || 'other') : 'other');
    const b: Batch = {id: 'bt-' + Math.random().toString(36).slice(2, 9), title: (p.title || defaultBatchTitle(cat)).slice(0, 120), category: cat, assetIds: ids, at: Date.now(), state: 'collecting', summary: null};
    saveBatches([b, ...loadBatches()]);
    for (const id of ids) intake.patch(id, {batchId: b.id, category: cat, categorySet: !!p.category || intake.get(id)?.categorySet});
    return b;
  },
  patch(id: string, p: Partial<Batch>) {
    const list = loadBatches(); const i = list.findIndex(b => b.id === id); if (i < 0) throw new Error('BATCH_NOT_FOUND');
    const copy = list.slice(); copy[i] = {...list[i], ...p}; saveBatches(copy); return copy[i];
  },
  add(id: string, assetIds: string[]) {
    const b = batches.get(id); if (!b) throw new Error('BATCH_NOT_FOUND');
    const ids = [...new Set([...b.assetIds, ...assetIds.filter(x => intake.get(x))])];
    if (ids.length > MAX_BATCH) throw new Error('BATCH_FULL');
    for (const a of assetIds) { const old = intake.get(a)?.batchId; if (old && old !== id) batches.drop(old, [a]); intake.patch(a, {batchId: id, category: b.category}); }
    return batches.patch(id, {assetIds: ids});
  },
  drop(id: string, assetIds: string[]) {
    const b = batches.get(id); if (!b) throw new Error('BATCH_NOT_FOUND');
    for (const a of assetIds) if (intake.get(a)?.batchId === id) intake.patch(a, {batchId: null});
    return batches.patch(id, {assetIds: b.assetIds.filter(x => !assetIds.includes(x))});
  },
  setCategory(id: string, category: CategoryId) {
    if (!categoryById(category)) throw new Error('UNKNOWN_CATEGORY');
    const b = batches.get(id); if (!b) throw new Error('BATCH_NOT_FOUND');
    for (const a of b.assetIds) if (intake.get(a)) intake.patch(a, {category, categorySet: true});
    return batches.patch(id, {category, title: b.title === defaultBatchTitle(b.category) ? defaultBatchTitle(category) : b.title});
  },
  remove(id: string, withFiles = false) {
    const b = batches.get(id); if (!b) return {removed: null};
    for (const a of b.assetIds) { if (withFiles) intake.remove(a); else if (intake.get(a)) intake.patch(a, {batchId: null}); }
    saveBatches(loadBatches().filter(x => x.id !== id));
    if (selectedBatch === id) selectBatch(null);
    return {removed: id};
  },
};
function defaultBatchTitle(cat: CategoryId) {
  const c = categoryById(cat); const d = new Date();
  const ru = !/^en/.test(document.documentElement.lang || 'ru'); const loc = ru ? 'ru-RU' : 'en-GB';
  return `${(ru ? c?.ru : c?.en) || 'Batch'} · ${d.toLocaleDateString(loc, {day: 'numeric', month: 'short'})} ${d.toLocaleTimeString(loc, {hour: '2-digit', minute: '2-digit'})}`;
}
export function setAssetCategory(id: string, category: CategoryId) {
  if (!categoryById(category)) throw new Error('UNKNOWN_CATEGORY');
  return intake.patch(id, {category, categorySet: true});
}
export function setAssetData(id: string, data: Record<string, any> | null) {
  if (data != null && (typeof data !== 'object' || Array.isArray(data))) throw new Error('INVALID_DATA');
  const json = JSON.stringify(data ?? null); if (json.length > 60000) throw new Error('DATA_TOO_LARGE');
  return intake.patch(id, {data: data ? JSON.parse(json) : null, dataAt: Date.now()});
}

let selectedBatch: string | null = null;
const batchSubs = new Set<() => void>();
export function selectBatch(id: string | null) { selectedBatch = id; batchSubs.forEach(f => f()); }
export const batchSelection = {get: () => selectedBatch, subscribe(fn: () => void) { batchSubs.add(fn); return () => { batchSubs.delete(fn); }; }};
export function useSelectedBatch() { return useSyncExternalStore(batchSelection.subscribe, batchSelection.get); }

// Which asset the Inbox shows. Kept outside React so the agent and drops can change it.
let selected: string | null = null;
const selSubs = new Set<() => void>();
export function select(id: string | null) { selected = id; selSubs.forEach(f => f()); }
export const selection = {get: () => selected, subscribe(fn: () => void) { selSubs.add(fn); return () => { selSubs.delete(fn); }; }};
export function useAssets() { useSyncExternalStore(intake.subscribe, intake.revision); return load(); }
export function useSelected() { return useSyncExternalStore(selection.subscribe, selection.get); }

async function storePages(pages: Page[]): Promise<AssetPage[]> {
  const out: AssetPage[] = [];
  for (const [i, p] of pages.entries()) out.push({n: i + 1, ref: await putBlob(p.blob), w: p.w, h: p.h, label: p.label});
  return out;
}

/** Accept one file: register it at once (so the user sees it), then convert in place. */
export async function ingest(file: Blob, opts: {name?: string; by?: 'human' | 'agent'; source?: string; select?: boolean; batchId?: string | null; category?: CategoryId} = {}): Promise<Asset> {
  const name = (opts.name || (file as File).name || 'file').slice(0, 200);
  const id = uid();
  const base: Asset = {id, name, size: file.size, family: 'unknown', format: '…', mime: file.type || '', ext: '', origRef: null, pages: [], textRef: null, excerpt: '', meta: {}, status: 'converting', by: opts.by || 'human', source: opts.source, at: Date.now(), routes: [], batchId: opts.batchId || null, category: opts.category, categorySet: !!opts.category};
  save([base, ...load()]);
  if (opts.batchId) { const b = batches.get(opts.batchId); if (b) batches.patch(b.id, {assetIds: [...b.assetIds, id].slice(0, MAX_BATCH)}); }
  if (opts.select !== false) select(id);
  let det: Detected;
  try { det = await detect(file, name); } catch { det = {family: 'unknown', format: 'Unknown', mime: file.type, ext: '', local: false}; }
  intake.patch(id, {family: det.family, format: det.format, mime: det.mime, ext: det.ext});
  if (file.size > MAX_FILE) return intake.patch(id, {status: 'failed', error: 'FILE_TOO_LARGE'});
  try {
    const origRef = await putBlob(file);
    intake.patch(id, {origRef});
    let out: Converted;
    try { out = await convert(file, det, name); }
    catch (e) {
      // Local conversion failed: keep the original, show a card, hand it to the agent.
      out = {pages: [await coverPage(name, det.format, [det.family.toUpperCase(), fmtSize(file.size)], '#9a6b4f')], markdown: '', meta: {}, status: 'needs-agent', note: 'local-failed'};
      intake.patch(id, {error: String((e as Error)?.message || e).slice(0, 120)});
    }
    const pages = await storePages(out.pages);
    const textRef = out.markdown ? await putBlob(new Blob([out.markdown], {type: 'text/markdown'})) : null;
    const cur = intake.get(id);
    const category = cur?.categorySet && cur.category ? cur.category : suggestCategory(det.family, name, out.markdown);
    return intake.patch(id, {category, pages, textRef, excerpt: out.markdown.slice(0, 600), meta: {...out.meta, sizeLabel: fmtSize(file.size)}, status: out.status, note: out.note, entries: out.entries, convertedBy: out.status === 'needs-agent' ? undefined : 'browser'});
  } catch (e) {
    return intake.patch(id, {status: 'failed', error: String((e as Error)?.message || e).slice(0, 160)});
  }
}

/** Several files at once become one batch, so 20 receipts stay together. Converted one by one. */
export async function ingestMany(files: Blob[], opts: {by?: 'human' | 'agent'; source?: string; category?: CategoryId; batchId?: string | null} = {}) {
  const list = files.slice(0, MAX_BATCH);
  let batchId = opts.batchId || null;
  if (!batchId && list.length > 1) { const b = batches.create({category: opts.category}); batchId = b.id; selectBatch(b.id); }
  const out: Asset[] = [];
  for (const [i, f] of list.entries()) out.push(await ingest(f, {...opts, batchId, select: i === 0 && !batchId}));
  if (batchId && !opts.category) {
    // Batch category = the most common suggestion among its files.
    const b = batches.get(batchId);
    if (b && b.assetIds.length) {
      const votes = new Map<string, number>();
      for (const a of b.assetIds.map(x => intake.get(x)).filter(Boolean) as Asset[]) if (a.category) votes.set(a.category, (votes.get(a.category) || 0) + 1);
      const top = [...votes.entries()].sort((x, y) => y[1] - x[1])[0]?.[0] as CategoryId | undefined;
      if (top) batches.patch(batchId, {category: top, title: defaultBatchTitle(top)});
    }
  }
  return {batchId, assets: out, skipped: Math.max(0, files.length - list.length)};
}

/** Plain text or a link dropped/pasted: still an asset, so it follows the same routes. */
export async function ingestText(text: string, opts: {name?: string; by?: 'human' | 'agent'; source?: string} = {}) {
  const name = opts.name || (/^https?:\/\//.test(text.trim()) ? 'link.txt' : 'text.txt');
  return ingest(new Blob([text], {type: 'text/plain'}), {...opts, name});
}

export async function readText(a: Asset): Promise<string> {
  if (!a.textRef) return '';
  const b = await getBlob(a.textRef); return b ? b.text() : '';
}
export async function pageDataUrl(ref: string): Promise<string | null> {
  const b = await getBlob(ref); if (!b) return null;
  return new Promise(res => { const r = new FileReader(); r.onload = () => res(String(r.result)); r.onerror = () => res(null); r.readAsDataURL(b); });
}

/** The agent returns its own conversion (from an online converter or MCP app). */
export async function attachAgentResult(id: string, res: {pages?: (string | Blob)[]; text?: string; meta?: Record<string, unknown>; note?: string; status?: AssetStatus}) {
  const a = intake.get(id); if (!a) throw new Error('ASSET_NOT_FOUND');
  const blobs: Page[] = [];
  for (const p of (res.pages || []).slice(0, 60)) {
    const blob = typeof p === 'string' ? await fetchImage(p) : p;
    const bmp = await createImageBitmap(blob);
    blobs.push({blob, w: bmp.width, h: bmp.height}); bmp.close();
  }
  const pages = blobs.length ? await storePages(blobs) : a.pages;
  const textRef = res.text ? await putBlob(new Blob([res.text], {type: 'text/markdown'})) : a.textRef;
  return intake.patch(id, {pages, textRef, excerpt: res.text ? res.text.slice(0, 600) : a.excerpt, meta: {...a.meta, ...(res.meta || {})}, status: res.status || 'ready', note: res.note ?? 'agent-converted', convertedBy: 'agent', agent: a.agent ? {...a.agent, state: 'done'} : a.agent});
}
export async function fetchImage(src: string): Promise<Blob> {
  if (/^data:image\/[\w.+-]+;base64,/.test(src)) { const r = await fetch(src); return r.blob(); }
  if (/^https?:\/\//.test(src)) { const r = await fetch(src, {mode: 'cors', credentials: 'omit'}); if (!r.ok) throw new Error('FETCH_FAILED'); return r.blob(); }
  throw new Error('INVALID_IMAGE_SOURCE');
}
export async function blobFromSource(src: string): Promise<Blob> {
  if (/^data:[\w.+-]+\/[\w.+-]+;base64,/.test(src)) return (await fetch(src)).blob();
  if (/^https?:\/\//.test(src)) { const r = await fetch(src, {mode: 'cors', credentials: 'omit'}); if (!r.ok) throw new Error('FETCH_FAILED'); return r.blob(); }
  throw new Error('INVALID_SOURCE');
}

/** Unpack a ZIP into separate assets. */
export async function extractZip(id: string, limit = 50) {
  const a = intake.get(id); if (!a?.origRef) throw new Error('ASSET_NOT_FOUND');
  const blob = await getBlob(a.origRef); if (!blob) throw new Error('ORIGINAL_MISSING');
  const {unzipSync} = await import('fflate');
  const files = unzipSync(new Uint8Array(await blob.arrayBuffer()), {filter: f => !f.name.endsWith('/') && !/(^|\/)(__MACOSX|\.DS_Store)/.test(f.name)});
  const names = Object.keys(files).slice(0, limit);
  const out: string[] = [];
  for (const n of names) { const x = await ingest(new Blob([files[n]]), {name: n.split('/').pop() || n, source: a.name, select: false}); out.push(x.id); }
  intake.route(id, 'download', `extracted ${out.length}`);
  return out;
}

/** Compact, agent-facing view of an asset (no blobs). */
export function lean(a: Asset) {
  return {assetId: a.id, name: a.name, size: a.size, family: a.family, format: a.format, status: a.status, note: a.note || null, error: a.error || null,
    pages: a.pages.map(p => ({n: p.n, w: p.w, h: p.h, label: p.label || null})), hasText: !!a.textRef, excerpt: a.excerpt.slice(0, 300),
    meta: a.meta, by: a.by, convertedBy: a.convertedBy || null, routes: a.routes, agent: a.agent || null, at: new Date(a.at).toISOString(), entries: a.entries?.length || 0,
    category: a.category || null, batchId: a.batchId || null, hasData: !!a.data};
}

/** Empty the Inbox (assets and batches). Blobs stay in IndexedDB until the browser clears them. */
export function clearIntake() {
  save([]); saveBatches([]); select(null); selectBatch(null);
}
