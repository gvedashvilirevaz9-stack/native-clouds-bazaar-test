// Where an Inbox asset can go next. Each route is used by the UI and by the agent alike.
import {garage, getBlob} from '../garage/store';
import {boardAnchor} from '../garage/anchor';
import {garageView} from '../garage/view';
import {nativeRooms} from '../personal/native-clouds-state';
import {communication} from '../communication/store';
import {attachToNotebook, writeToNotebook} from '../garage/notebook-media';
import {intake, batches, readText, type Asset} from './store';
import {categoryById} from './categories';
import {FAMILY_LABEL} from './detect';

const need = (id: string) => { const a = intake.get(id); if (!a) throw new Error('ASSET_NOT_FOUND'); if (a.status === 'converting') throw new Error('ASSET_CONVERTING'); return a; };
/** An animated GIF is shown as itself (the <img> animates), not as its still preview. */
const animated = (a: Asset) => a.format === 'GIF' && a.origRef ? a.origRef : null;
const pick = (a: Asset, pages?: number[]) => {
  const list = pages?.length ? a.pages.filter(p => pages.includes(p.n)) : a.pages;
  if (!list.length) throw new Error('ASSET_HAS_NO_PAGES');
  return list;
};
function reveal(service: 'notebook' | 'sketchbook' | 'inbox') {
  try { nativeRooms.open('garage'); nativeRooms.revealService(service); } catch { /* standalone shell may not mount rooms */ }
  if (service !== 'inbox') garageView.set({tab: service === 'sketchbook' ? 'board' : 'notebook', focusPageId: null});
}

/** Open the sketchbook and wait until the board can tell where its visible centre is. */
export async function boardSpot(open = true, need = 1): Promise<{x: number; y: number} | null> {
  let s: {x: number; y: number} | null = null;
  if (open) {
    reveal('sketchbook');
    for (let i = 0; i < 30 && !s; i++) { s = boardAnchor.spawn(); if (!s) await new Promise(r => setTimeout(r, 50)); }
  } else s = boardAnchor.spawn();
  return s ? freeSpot(s, need) : null;
}
/** Pan the board so a world point is in the middle of the view. */
export function focusBoard(x: number, y: number) { setTimeout(() => window.dispatchEvent(new CustomEvent('garage:focus', {detail: {x, y}})), 60); }
/** Shift right (then down) until `need` card slots next to each other are empty, so new cards never cover old ones. */
export function freeSpot(at: {x: number; y: number}, need = 1) {
  const items = garage.get().items;
  const busy = (x: number, y: number) => items.some(i => Math.abs(i.x - x) < 240 && Math.abs(i.y - y) < 300);
  for (let row = 0; row < 12; row++) for (let col = 0; col < 8; col++) {
    const x = at.x + col * 280, y = at.y + row * 340;
    let ok = true; for (let k = 0; k < Math.min(need, 4) && ok; k++) if (busy(x + k * 280, y)) ok = false;
    if (ok) return {x, y};
  }
  return at;
}

/** Place pages as polaroids, laid out left to right. Default: first 6 pages. */
export async function toBoard(id: string, opts: {pages?: number[]; at?: {x: number; y: number}; by?: 'human' | 'agent'; open?: boolean} = {}) {
  const a = need(id);
  const list = pick(a, opts.pages).slice(0, opts.pages?.length ? 40 : 6);
  const items: string[] = [];
  const at = opts.at || await boardSpot(opts.open !== false, list.length);
  list.forEach((p, k) => {
    const label = a.pages.length > 1 ? `${a.name} · ${p.label || 'p. ' + p.n}` : a.name;
    const pos = at ? {x: at.x + (k % 4) * 280, y: at.y + Math.floor(k / 4) * 340} : {};
    const it = garage.add({kind: 'polaroid', title: label.slice(0, 200), image: animated(a) || p.ref, source: 'Inbox · ' + a.format, tag: a.by === 'agent' ? 'agent' : undefined, by: opts.by || 'human', ...pos} as any);
    items.push(it.id);
  });
  intake.route(id, 'board', `${items.length} page(s)`);
  if (at && !opts.at) focusBoard(at.x + Math.min(list.length, 4) * 140 - 20, at.y + 150);
  return {assetId: id, placed: items.length, itemIds: items};
}

/** Put page images into the notebook's attachment strip. */
export function toNotebook(id: string, opts: {pages?: number[]; by?: 'human' | 'agent'; open?: boolean} = {}) {
  const a = need(id);
  const list = pick(a, opts.pages).slice(0, opts.pages?.length ? 20 : 4);
  let last: ReturnType<typeof attachToNotebook> | null = null;
  for (const p of list) last = attachToNotebook({kind: 'image', ref: animated(a) || p.ref, title: a.pages.length > 1 ? `${a.name} · ${p.label || 'p. ' + p.n}` : a.name, assetId: a.id, by: opts.by || 'human'});
  intake.route(id, 'notebook', `${list.length} image(s)`);
  if (opts.open !== false) reveal('notebook');
  return {assetId: id, attached: list.length, pageId: last?.pageId, leaf: last?.leaf};
}

/** Put the text layer into the notebook as written text. */
export async function toNotebookText(id: string, opts: {by?: 'human' | 'agent'; open?: boolean; mode?: 'append' | 'new-leaf'} = {}) {
  const a = need(id);
  const text = (await readText(a)).replace(/^```\w*\n|\n```$/g, '');
  if (!text.trim()) throw new Error('ASSET_HAS_NO_TEXT');
  const r = writeToNotebook(text.slice(0, 8000), {mode: opts.mode || 'new-leaf', heading: `— ${a.name} —`});
  intake.route(id, 'notebook-text', `${Math.min(text.length, 8000)} chars`);
  if (opts.open !== false) reveal('notebook');
  return {assetId: id, ...r, truncated: text.length > 8000};
}

/** Ask the Encyclopedia "what is this?" — the question is saved there, not lost in a chat. */
export async function toEncyclopedia(id: string, question?: string) {
  const a = need(id);
  const ws = () => (window as any).workshop;
  if (!ws()?.execute) throw new Error('ENCYCLOPEDIA_NOT_MOUNTED');
  await ws().execute('ask.open', {type: 'what'});
  // The shell re-publishes window.workshop after the window mounts; wait for that render.
  await new Promise(r => setTimeout(r, 120));
  const text = (question?.trim() || `What is this? ${a.name} (${a.format})`).slice(0, 200) + ` [asset:${a.id}]`;
  const q = await ws().execute('ask.search', {text: text.slice(0, 300)});
  intake.route(id, 'encyclopedia', q?.id ? 'query ' + q.id : undefined);
  return {assetId: id, queryId: q?.id || null};
}

/** "I don't know what to do with it": hand the file to the agent on the phone. */
export function toAgent(id: string, request: string) {
  const a = need(id);
  const req = (request || '').trim() || (a.status === 'needs-agent' ? 'Convert this file so the room can show it, then help me with it.' : 'Help me understand this file and suggest what to do with it.');
  intake.patch(id, {agent: {request: req.slice(0, 1200), at: Date.now(), state: 'pending'}});
  intake.route(id, 'agent');
  try { communication.add({text: `📥 ${a.name} · ${a.format} · ${FAMILY_LABEL[a.family].en}\n${req.slice(0, 600)}\n[intake.read {assetId:"${a.id}"}]`, role: 'user', contact: 'agent', source: 'Inbox', kind: 'info', key: 'intake-agent/' + a.id + '/' + Date.now()} as any); } catch { /* dock optional */ }
  return {assetId: id, state: 'pending'};
}

export async function downloadAsset(id: string, what: 'original' | 'pages' | 'text' | 'card') {
  const a = need(id);
  const base = a.name.replace(/\.[^.]+$/, '') || 'file';
  const save = (blob: Blob, name: string) => { const u = URL.createObjectURL(blob); const el = document.createElement('a'); el.href = u; el.download = name; el.click(); setTimeout(() => URL.revokeObjectURL(u), 2000); };
  if (what === 'original' && a.origRef) { const b = await getBlob(a.origRef); if (b) save(b, a.name); }
  if (what === 'pages') for (const p of a.pages) { const b = await getBlob(p.ref); if (b) save(b, `${base}${a.pages.length > 1 ? '-' + p.n : ''}.webp`); }
  if (what === 'text') save(new Blob([await readText(a)], {type: 'text/markdown'}), base + '.md');
  if (what === 'card') save(new Blob([JSON.stringify({schema: 'intake.asset.v1', ...a}, null, 2)], {type: 'application/json'}), base + '.json');
  intake.route(id, 'download', what);
  return {assetId: id, downloaded: what};
}

/** Hand a whole batch to the agent with its category prompt. */
export function sendBatch(batchId: string, request = '') {
  const b = batches.get(batchId); if (!b) throw new Error('BATCH_NOT_FOUND');
  if (!b.assetIds.length) throw new Error('BATCH_EMPTY');
  const cat = categoryById(b.category)!;
  const req = request.trim().slice(0, 1200);
  batches.patch(batchId, {state: 'sent', sentAt: Date.now(), request: req || undefined});
  for (const id of b.assetIds) if (intake.get(id)) intake.patch(id, {agent: {request: req || cat.prompt.slice(0, 200), at: Date.now(), state: 'pending'}});
  try { communication.add({text: `📦 ${b.title} · ${cat.en} · ${b.assetIds.length} files${req ? '\n' + req.slice(0, 500) : ''}\n[intake.batch.read {batchId:"${b.id}"}]`, role: 'user', contact: 'agent', source: 'Inbox', kind: 'info', key: 'intake-batch/' + b.id + '/' + Date.now()} as any); } catch { /* dock optional */ }
  return {batchId, state: 'sent', files: b.assetIds.length, category: b.category};
}
