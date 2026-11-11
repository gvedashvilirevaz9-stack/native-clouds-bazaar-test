// Notebook attachments: images, favorites and calendar stamps that belong to one notebook leaf.
// Kept beside the page text (not inside it) so the yellow ask marks and blue inserts,
// which are anchored by character offsets, stay intact.
import {useSyncExternalStore} from 'react';
import {loadPages, upsertPage, appendLeaf, pagesOnDate, createDayPage, setLeafText, loadPresetState, todayISO, type DayPage} from './pages';
import {garageView} from './view';

export const MEDIA_KEY = 'sunrise.garage.v3.media';
export type LeafMedia = {
  id: string;
  kind: 'image' | 'favorite' | 'stamp';
  ref?: string | null;      // idb:… or https image
  title: string;
  caption?: string;
  url?: string | null;      // source link (favorite / web image)
  price?: string;
  assetId?: string;         // Inbox asset it came from
  stamp?: string;           // ISO date for calendar stamps
  by: 'human' | 'agent';
  at: number;
};
type MediaMap = Record<string, Record<string, LeafMedia[]>>;

const subs = new Set<() => void>(); let rev = 0;
function load(): MediaMap { try { const v = JSON.parse(localStorage.getItem(MEDIA_KEY) || '{}'); return v && typeof v === 'object' ? v : {}; } catch { return {}; } }
function save(m: MediaMap) { localStorage.setItem(MEDIA_KEY, JSON.stringify(m)); rev++; subs.forEach(f => f()); }
export const notebookMedia = {
  subscribe(fn: () => void) { subs.add(fn); return () => { subs.delete(fn); }; },
  revision: () => rev,
  of(pageId: string, leaf: number): LeafMedia[] { return load()[pageId]?.[String(leaf)] || []; },
  add(pageId: string, leaf: number, m: Omit<LeafMedia, 'id' | 'at'>) {
    const map = load(); const page = map[pageId] || (map[pageId] = {}); const list = page[String(leaf)] || [];
    const item: LeafMedia = {...m, id: 'nm-' + Math.random().toString(36).slice(2, 10), at: Date.now()};
    page[String(leaf)] = [...list, item].slice(-40); save(map); return item;
  },
  remove(pageId: string, leaf: number, id: string) {
    const map = load(); const list = map[pageId]?.[String(leaf)]; if (!list) return false;
    map[pageId][String(leaf)] = list.filter(x => x.id !== id); save(map); return true;
  },
  patch(pageId: string, leaf: number, id: string, p: Partial<LeafMedia>) {
    const map = load(); const list = map[pageId]?.[String(leaf)]; if (!list) return;
    map[pageId][String(leaf)] = list.map(x => x.id === id ? {...x, ...p} : x); save(map);
  },
};
export function useLeafMedia(pageId: string, leaf: number) {
  useSyncExternalStore(notebookMedia.subscribe, notebookMedia.revision);
  return notebookMedia.of(pageId, leaf);
}

/** Re-render the notebook without switching the visible tab. */
function bump() { garageView.set({}); }

/** Today's (or the selected day's) notebook page, created if missing. */
export function activeNotebookPage(date?: string): DayPage {
  const d = date || garageView.get().selectedDate || todayISO();
  const existing = pagesOnDate(d, 'notebook')[0];
  if (existing) return existing;
  const ps = loadPresetState();
  const p = createDayPage({kind: 'notebook', date: d, title: 'Notebook', preset: ps.preset, subPreset: ps.chip});
  upsertPage(p); return p;
}

/** Attach to the leaf the user is looking at. */
export function attachToNotebook(m: Omit<LeafMedia, 'id' | 'at'>, opts: {date?: string; leaf?: number} = {}) {
  const page = activeNotebookPage(opts.date);
  const leaf = opts.leaf || page.leaf || 1;
  const item = notebookMedia.add(page.id, leaf, m);
  bump();
  return {pageId: page.id, leaf, mediaId: item.id, date: page.date};
}

/** Agent inbound buffer: write text into the notebook without a prior question. */
export function writeToNotebook(text: string, opts: {mode?: 'append' | 'replace' | 'new-leaf'; date?: string; heading?: string} = {}) {
  const body = String(text || '').slice(0, 8000);
  if (!body.trim()) throw new Error('INVALID_ARGS');
  let page = activeNotebookPage(opts.date);
  const mode = opts.mode || 'append';
  const curLeaf = page.leaves.find(l => l.n === page.leaf);
  // Reuse an untouched empty page instead of opening another one.
  if (mode === 'new-leaf' && (curLeaf?.text.trim() || notebookMedia.of(page.id, page.leaf).length)) { const r = appendLeaf(page.leaves); page = {...page, leaves: r.leaves, leaf: r.leaf}; }
  const current = page.leaves.find(l => l.n === page.leaf)?.text || '';
  const block = (opts.heading ? opts.heading.trim() + '\n' : '') + body;
  const next = mode === 'replace' || !current.trim() ? block : current.replace(/\s+$/, '') + '\n\n' + block;
  const r = setLeafText(page.leaves, page.leaf, next);
  upsertPage({...page, leaves: r.leaves, leaf: r.leaf});
  bump();
  return {pageId: page.id, leaf: r.leaf, date: page.date, chars: next.length, mode};
}

export function mediaForExport(pageId: string) {
  return load()[pageId] || {};
}
export {loadPages};
export function clearNotebookMedia() { save({}); }
