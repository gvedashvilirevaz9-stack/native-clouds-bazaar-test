// Garage Space storage. Board JSON → localStorage; images → IndexedDB.
// v2 adds connectors, stickies, captions, boardNumber. Keeps schemaVersion 1 + optional fields for backward compat.
import {useSyncExternalStore} from 'react';
import type {ChoiceSlotId} from './choice-slots';
import {slotOrigin} from './choice-slots';
import {
  type BoardScope, type ScopeState, type LayoutPack,
  SCOPE_MIGRATED_KEY, TIMELESS_KEY, DAYS_KEY,
  loadScopePref, saveScopePref, loadTimeless, saveTimeless, loadDay, saveDay,
  emptyScope, emptySnap, splitComposite, composePack,
} from './board-scopes';
import {pageOrigin, pageAtX} from './page-frames';
import {todayISO} from './pages';
import {boardAnchor} from './anchor';
export type {BoardScope} from './board-scopes';
export const GARAGE_KEY = 'sunrise.garage.v1.board';
export const BOARDS_KEY = 'sunrise.garage.v1.boards';
export const DIARY_KEY = 'sunrise.garage.v1.diary';
export const INBOX_KEY = 'sunrise.garage.v1.inbox';
export type Layout = 'prep' | 'action';
export type BoardSkeleton = 'none' | 'choice' | 'action';
export type CheckState = 'pending' | 'on_time' | 'late' | 'stuck' | 'done';
export type ItemKind = 'polaroid' | 'note' | 'sticky' | 'time' | 'timer' | 'teardown' | 'map' | 'format' | 'scene';
export type FormatKind = 'A' | 'AB' | 'ABC';
export const A4_RATIO = 210 / 297;
export type TimerMode = 'down' | 'up' | 'free';
export type TimerStatus = 'idle' | 'running' | 'paused' | 'done';
export type ItemTimer = {
  mode: TimerMode;
  durationSec: number;
  status: TimerStatus;
  startedAt: number | null;
  elapsedMs: number;
};
export type TeardownPart = {
  key: string;
  label: string;
  image?: string | null;
  price?: string | null;
  unknown?: boolean;
};
export type Item = {
  id: string; kind: ItemKind; x: number; y: number; title: string; text?: string;
  url?: string | null; image?: string | null; price?: string; source?: string;
  addedAt: number; by?: 'human' | 'agent'; tag?: string; rot?: number;
  buildId?: string; // immutable scene in the local My Space collection
  caption?: string; // moves with the card
  clock?: string; // HH:MM for kind=time
  timer?: ItemTimer; // for kind=timer
  parts?: TeardownPart[]; // for kind=teardown
  forItem?: string | null; // source polaroid/item id for teardown
  w?: number; h?: number; // optional resized box (sticky/note/map)
  lat?: number; lon?: number; // kind=map
  mapQuery?: string; // kind=map place query
  mapsUrl?: string | null; // clickable Google Maps (or OSM) link
  lane?: 'A' | 'B' | 'C'; // Action lane tag
  markerIndex?: number; // Action Lane A step index
  page?: number; // sketchbook page frame (1-based) within scope
  fmt?: FormatKind; // kind=format: lane library element
};
export type Connector = {id: string; from: string; to: string};
export type Station = {id: string; line: 'A' | 'B'; time: string; title: string; state: CheckState};
export type Board = {
  schemaVersion: 1; rev: number; why: string; layout: Layout; grid: 'dots' | 'mm';
  items: Item[]; stations: Station[]; agentImage: string | null;
  boardNumber: number; connectors: Connector[];
  skeleton?: BoardSkeleton;
  /** Maps choice-slot id → item id currently occupying it. */
  slots?: Partial<Record<ChoiceSlotId, string>>;
  /** timeless | date — which board map is live */
  scope?: BoardScope;
  /** YYYY-MM-DD when scope==='date'; null for timeless */
  date?: string | null;
  /** Highest page frame index for current layout */
  maxPage?: number;
};
export type Snapshot = {title: string; url?: string | null; image?: string | null; price?: string; source?: string; tag?: string};
const DEF_ST: Station[] = [
  {id: 'a1', line: 'A', time: '18:00', title: 'Leave', state: 'pending'}, {id: 'a2', line: 'A', time: '18:30', title: 'Shop A — check', state: 'pending'},
  {id: 'a3', line: 'A', time: '18:50', title: 'Purchase', state: 'pending'}, {id: 'a4', line: 'A', time: '19:10', title: 'Receipt & warranty', state: 'pending'},
  {id: 'a5', line: 'A', time: '19:30', title: 'Home', state: 'pending'},
  {id: 'b2', line: 'B', time: '19:00', title: 'Shop B — check', state: 'pending'}, {id: 'b3', line: 'B', time: '19:25', title: 'Purchase B', state: 'pending'},
  {id: 'b4', line: 'B', time: '19:45', title: 'Receipt → Garage', state: 'pending'}];
const empty = (): Board => ({schemaVersion: 1, rev: 0, why: '', layout: 'prep', grid: 'dots', items: [], stations: DEF_ST, agentImage: null, boardNumber: 1, connectors: [], skeleton: 'none', slots: {}, scope: 'timeless', date: null, maxPage: 1});
function load(): Board {
  try {
    const v = JSON.parse(localStorage.getItem(GARAGE_KEY) || 'null');
    if (v && v.schemaVersion === 1 && Array.isArray(v.items)) {
      return {...empty(), ...v, connectors: Array.isArray(v.connectors) ? v.connectors : [], boardNumber: Number(v.boardNumber) > 0 ? Number(v.boardNumber) : 1, skeleton: v.skeleton === 'choice' || v.skeleton === 'action' ? v.skeleton : 'none', slots: (v.slots && typeof v.slots === 'object') ? v.slots : {}};
    }
  } catch {}
  return empty();
}

type LegacyBoardSnap = {items: Item[]; connectors: Connector[]; agentImage: string | null; layout: Layout; grid: 'dots' | 'mm'; skeleton?: BoardSkeleton; slots?: Partial<Record<ChoiceSlotId, string>>};
function loadLegacyArchive(): Record<number, LegacyBoardSnap> {
  try {
    const v = JSON.parse(localStorage.getItem(BOARDS_KEY) || '{}');
    if (!v || typeof v !== 'object') return {};
    const out: Record<number, LegacyBoardSnap> = {};
    for (const [k, val] of Object.entries(v)) {
      const n = Number(k); if (n > 0 && val && typeof val === 'object') out[n] = val as LegacyBoardSnap;
    }
    return out;
  } catch { return {}; }
}
const LAYOUT_KEY = 'sunrise.garage.v1.layoutBoards';
function loadLegacyLayoutArchive(): Record<string, LegacyBoardSnap> {
  try {
    const v = JSON.parse(localStorage.getItem(LAYOUT_KEY) || '{}');
    return v && typeof v === 'object' ? v as Record<string, LegacyBoardSnap> : {};
  } catch { return {}; }
}
function snapBoard(b: Board): LegacyBoardSnap {
  return {items: b.items, connectors: b.connectors, agentImage: b.agentImage, layout: b.layout, grid: b.grid, skeleton: b.skeleton || 'none', slots: b.slots || {}};
}

/** Active scope preference + selected calendar date for date-scoped boards. */
let activeScope: BoardScope = typeof localStorage !== 'undefined' ? loadScopePref() : 'timeless';
let activeDate: string = typeof localStorage !== 'undefined' ? (todayISO() || '2026-10-27') : '2026-10-27';

function migrateLegacyToScopesOnce() {
  if (typeof localStorage === 'undefined') return;
  if (localStorage.getItem(SCOPE_MIGRATED_KEY) === '1') return;
  // A restored scoped board is authoritative even if its migration marker was not exported.
  if (localStorage.getItem(TIMELESS_KEY)) {
    localStorage.setItem(SCOPE_MIGRATED_KEY, '1');
    return;
  }
  const live = load();
  const pages = loadLegacyArchive();
  const layouts = loadLegacyLayoutArchive();
  const timeless = emptyScope(live.grid || 'dots', live.stations || DEF_ST);
  timeless.why = live.why || '';
  timeless.focusLayout = live.layout === 'action' ? 'action' : 'prep';
  timeless.focusPage = Math.max(1, live.boardNumber || 1);
  timeless.grid = live.grid === 'mm' ? 'mm' : 'dots';

  // Seed page snaps from legacy page archive (treated as prep content historically).
  const prepPages: LayoutPack['pages'] = {};
  const actionPages: LayoutPack['pages'] = {};
  let maxPage = Math.max(1, live.boardNumber || 1, ...Object.keys(pages).map(Number));
  for (let n = 1; n <= maxPage; n++) {
    prepPages[n] = emptySnap('prep', timeless.grid) as any;
    actionPages[n] = emptySnap('action', timeless.grid) as any;
  }
  for (const [k, snap] of Object.entries(pages)) {
    const n = Number(k);
    if (n < 1) continue;
    const target = (snap.layout === 'action') ? actionPages : prepPages;
    target[n] = {
      items: (snap.items || []).map(it => ({...it, page: n})),
      connectors: snap.connectors || [],
      agentImage: snap.agentImage ?? null,
      layout: snap.layout === 'action' ? 'action' : 'prep',
      grid: snap.grid === 'mm' ? 'mm' : timeless.grid,
      skeleton: snap.skeleton === 'choice' || snap.skeleton === 'action' ? snap.skeleton : 'none',
      slots: snap.slots || {},
    } as any;
  }
  // Live board overwrites its page for its layout.
  const liveN = Math.max(1, live.boardNumber || 1);
  const liveSnap = {
    items: (live.items || []).map(it => ({...it, page: liveN})),
    connectors: live.connectors || [],
    agentImage: live.agentImage,
    layout: live.layout,
    grid: live.grid,
    skeleton: live.skeleton || 'none',
    slots: live.slots || {},
  } as any;
  if (live.layout === 'action') actionPages[liveN] = liveSnap; else prepPages[liveN] = liveSnap;
  // Layout archive (prep/action swap for "current" page) — merge onto liveN if present.
  for (const [lk, snap] of Object.entries(layouts)) {
    const pack = lk === 'action' ? actionPages : prepPages;
    const n = liveN;
    if (!pack[n] || !(pack[n].items && pack[n].items.length)) {
      pack[n] = {
        items: (snap.items || []).map((it: Item) => ({...it, page: n})),
        connectors: snap.connectors || [],
        agentImage: snap.agentImage ?? null,
        layout: lk === 'action' ? 'action' : 'prep',
        grid: snap.grid === 'mm' ? 'mm' : timeless.grid,
        skeleton: snap.skeleton === 'choice' || snap.skeleton === 'action' ? snap.skeleton : 'none',
        slots: snap.slots || {},
      } as any;
    }
  }
  timeless.prep = {pages: prepPages, maxPage};
  timeless.action = {pages: actionPages, maxPage};
  saveTimeless(timeless);

  // Migrate real boards only. Demo content must never replace a calendar day.
  try { localStorage.setItem(SCOPE_MIGRATED_KEY, '1'); } catch {}
  try {
    localStorage.setItem(BOARDS_KEY + '.legacy', localStorage.getItem(BOARDS_KEY) || '{}');
    localStorage.setItem(LAYOUT_KEY + '.legacy', localStorage.getItem(LAYOUT_KEY) || '{}');
    localStorage.setItem(GARAGE_KEY + '.legacy', localStorage.getItem(GARAGE_KEY) || '{}');
  } catch {}
}

function readActiveScopeState(): ScopeState {
  if (activeScope === 'date') return loadDay(activeDate);
  return loadTimeless();
}

function writeActiveScopeState(st: ScopeState) {
  if (activeScope === 'date') saveDay(activeDate, st);
  else saveTimeless(st);
}

function boardFromScope(st: ScopeState): Board {
  const layout = st.focusLayout;
  const pack = layout === 'action' ? st.action : st.prep;
  const composed = composePack(pack, layout);
  const selected = pack.pages[st.focusPage] || emptySnap(layout, st.grid);
  return {
    ...empty(),
    why: st.why || '',
    layout,
    grid: st.grid,
    stations: (st.stations as Station[])?.length ? (st.stations as Station[]) : DEF_ST,
    boardNumber: st.focusPage,
    maxPage: composed.maxPage,
    items: composed.items as Item[],
    connectors: composed.connectors as Connector[],
    agentImage: composed.agentImage,
    skeleton: selected.skeleton || 'none',
    slots: selected.slots || {},
    scope: activeScope,
    date: activeScope === 'date' ? activeDate : null,
  };
}

function flushBoardIntoScope() {
  const st = readActiveScopeState();
  const layout = board.layout === 'action' ? 'action' : 'prep';
  const maxPage = Math.max(1, board.maxPage || board.boardNumber || 1);
  const prev = layout === 'action' ? st.action : st.prep;
  const pack = splitComposite(
    board.items as any,
    board.connectors as any,
    board.agentImage,
    layout,
    board.grid,
    board.skeleton,
    board.slots,
    maxPage,
  );
  // Preserve per-page actionSeeded flags across composite split/merge.
  for (let n = 1; n <= pack.maxPage; n++) {
    // Items share one world, but Choice slots and guide layout belong to one page.
    if (n !== board.boardNumber) {
      const prior = prev?.pages?.[n];
      const ids = new Set(pack.pages[n].items.map(i => i.id));
      pack.pages[n].skeleton = prior?.skeleton || 'none';
      pack.pages[n].slots = Object.fromEntries(Object.entries(prior?.slots || {}).filter(([,id]) => id && ids.has(id)));
    }
    if (prev?.pages?.[n]?.actionSeeded || (st.actionSeededPages || []).includes(n)) {
      pack.pages[n] = {...pack.pages[n], actionSeeded: true};
    }
  }
  if (layout === 'action') st.action = pack; else st.prep = pack;
  st.focusLayout = layout;
  st.focusPage = board.boardNumber || 1;
  st.grid = board.grid;
  st.why = board.why || '';
  st.stations = board.stations || DEF_ST;
  writeActiveScopeState(st);
}

function applyScopeToLive(st: ScopeState) {
  const next = boardFromScope(st);
  board = {...next, rev: board.rev + 1};
  try { localStorage.setItem(GARAGE_KEY, JSON.stringify(board)); } catch { throw new Error('GARAGE_STORAGE_FULL'); }
  subs.forEach(f => f());
  return board;
}

if (typeof localStorage !== 'undefined') {
  migrateLegacyToScopesOnce();
  activeScope = loadScopePref();
}

let board: Board = typeof localStorage !== 'undefined' ? boardFromScope(readActiveScopeState()) : empty();
try { if (typeof localStorage !== 'undefined') localStorage.setItem(GARAGE_KEY, JSON.stringify(board)); } catch {}

const subs = new Set<() => void>();
function commit(next: Board) {
  board = {
    ...next,
    rev: board.rev + 1,
    scope: activeScope,
    date: activeScope === 'date' ? activeDate : null,
    maxPage: Math.max(1, next.maxPage || next.boardNumber || board.maxPage || 1),
  };
  try { localStorage.setItem(GARAGE_KEY, JSON.stringify(board)); } catch { throw new Error('GARAGE_STORAGE_FULL'); }
  try { flushBoardIntoScope(); } catch {}
  subs.forEach(f => f());
  return board;
}
if (typeof window !== 'undefined') window.addEventListener('storage', e => {
  if (e.key === GARAGE_KEY || e.key === TIMELESS_KEY || e.key === DAYS_KEY) {
    board = boardFromScope(readActiveScopeState());
    subs.forEach(f => f());
  }
});

const uid = () => Math.random().toString(36).slice(2, 10);
export const garage = {
  get: () => board,
  subscribe(cb: () => void) { subs.add(cb); return () => { subs.delete(cb); }; },
  set(p: Partial<Board>) { return commit({...board, ...p}); },
  nextSpot() {
    const sp = boardAnchor.spawn();
    if (sp) return sp;
    const page = board.boardNumber || 1;
    const o = pageOrigin(page);
    const onPage = board.items.filter(i => (i.page || pageAtX(i.x, board.maxPage || 999)) === page).length;
    return {x: o.x + 60 + (onPage % 5) * 270, y: o.y + 60 + Math.floor(onPage / 5) * 330};
  },
  add(it: Omit<Item, 'id' | 'addedAt' | 'x' | 'y'> & {x?: number; y?: number; page?: number}) {
    const spot = garage.nextSpot();
    const page = it.page || board.boardNumber || 1;
    const item: Item = {id: 'g-' + uid(), addedAt: Date.now(), rot: Math.round((Math.random() * 4 - 2) * 10) / 10, ...spot, ...it, page} as Item;
    commit({...board, items: [...board.items, item]}); return item;
  },
  addSnapshot(s: Snapshot, at?: {x: number; y: number}, by: 'human' | 'agent' = 'human') {
    const dup = board.items.find(i => i.kind === 'polaroid' && s.url && i.url === s.url && i.title === s.title);
    if (dup) return {item: dup, added: false};
    return {item: garage.add({kind: 'polaroid', title: s.title.slice(0, 200), url: safeHttp(s.url), image: s.image || null, price: s.price, source: s.source, tag: s.tag, by, ...(at || {})}), added: true};
  },
  move(id: string, x: number, y: number) { commit({...board, items: board.items.map(i => i.id === id ? {...i, x, y, page: pageAtX(x, board.maxPage || 999)} : i)}); },
  patch(id: string, p: Partial<Item>) { commit({...board, items: board.items.map(i => i.id === id ? {...i, ...p} : i)}); },
  /** v15: remove several items and all their connectors in one commit. */
  removeMany(ids: string[]) {
    const del = new Set(ids);
    const slots = {...(board.slots || {})};
    for (const [k, v] of Object.entries(slots)) if (del.has(v as string)) delete slots[k as ChoiceSlotId];
    commit({...board, items: board.items.filter(i => !del.has(i.id)), connectors: board.connectors.filter(c => !del.has(c.from) && !del.has(c.to)), slots});
  },
  /** v15: move several items in one commit. */
  moveMany(pos: Array<{id: string; x: number; y: number}>) {
    const m = new Map(pos.map(p => [p.id, p]));
    commit({...board, items: board.items.map(i => { const p = m.get(i.id); return p ? {...i, x: Math.round(p.x), y: Math.round(p.y)} : i; })});
  },
  remove(id: string) {
    const slots = {...(board.slots || {})};
    for (const [k, v] of Object.entries(slots)) if (v === id) delete slots[k as ChoiceSlotId];
    commit({...board, items: board.items.filter(i => i.id !== id), connectors: board.connectors.filter(c => c.from !== id && c.to !== id), slots});
  },
  clear(confirm: boolean) {
    if (!confirm) throw new Error('CONFIRM_REQUIRED');
    const page = board.boardNumber || 1;
    const keep = board.items.filter(i => (i.page || 1) !== page);
    const keepIds = new Set(keep.map(i => i.id));
    const connectors = board.connectors.filter(c => keepIds.has(c.from) && keepIds.has(c.to));
    const slots = {...(board.slots || {})};
    for (const [k, v] of Object.entries(slots)) if (v && !keepIds.has(v)) delete slots[k as ChoiceSlotId];
    return commit({...board, items: keep, connectors, agentImage: page === 1 ? null : board.agentImage, slots, skeleton: board.skeleton || 'none'});
  },
  assignSlot(slot: ChoiceSlotId, itemId: string | null) {
    const slots = {...(board.slots || {})};
    if (!itemId) {
      delete slots[slot];
      return commit({...board, slots});
    }
    for (const [k, v] of Object.entries(slots)) if (v === itemId) delete slots[k as ChoiceSlotId];
    slots[slot] = itemId;
    const o = slotOrigin(slot);
    const origin = pageOrigin(board.boardNumber || 1);
    const items = board.items.map(i => i.id === itemId ? {...i, x: o.x + origin.x, y: o.y + origin.y, page: board.boardNumber || 1} : i);
    return commit({...board, items, slots});
  },
  enableChoiceSkeleton() {
    return commit({...board, layout: 'prep', skeleton: 'choice', slots: board.slots || {}});
  },
  enableActionSkeleton() {
    return commit({...board, layout: 'action', skeleton: 'action', slots: board.slots || {}});
  },
  isActionSeeded(page?: number) {
    const p = Math.max(1, Math.floor(Number(page) || board.boardNumber || 1));
    const st = readActiveScopeState();
    if ((st.actionSeededPages || []).includes(p)) return true;
    const snap = st.action?.pages?.[p];
    return !!(snap && snap.actionSeeded);
  },
  markActionSeeded(page?: number) {
    const p = Math.max(1, Math.floor(Number(page) || board.boardNumber || 1));
    flushBoardIntoScope();
    const st = readActiveScopeState();
    const set = new Set(st.actionSeededPages || []);
    set.add(p);
    st.actionSeededPages = [...set];
    if (!st.action.pages[p]) st.action.pages[p] = emptySnap('action', st.grid);
    st.action.pages[p] = {...st.action.pages[p], actionSeeded: true};
    st.action.maxPage = Math.max(st.action.maxPage || 1, p);
    writeActiveScopeState(st);
    return true;
  },
  /** Swap Prep ↔ Action content so the two maps never mix (per scope). */
  setLayoutBoard(layout: Layout) {
    if (layout !== 'prep' && layout !== 'action') layout = 'prep';
    if (board.layout === layout) {
      if (layout === 'action' && board.skeleton !== 'action') return garage.enableActionSkeleton();
      return board;
    }
    flushBoardIntoScope();
    const st = readActiveScopeState();
    st.focusLayout = layout;
    const pack = layout === 'action' ? st.action : st.prep;
    pack.maxPage = Math.max(pack.maxPage, st.focusPage);
    if (!pack.pages[st.focusPage]) pack.pages[st.focusPage] = emptySnap(layout, st.grid);
    writeActiveScopeState(st);
    return applyScopeToLive(st);
  },
  resize(id: string, w: number, h: number) {
    const fi = board.items.find(i => i.id === id);
    if (fi && fi.kind === 'format') {
      const fw = Math.max(240, Math.min(3200, Math.round(w)));
      const fh = fi.fmt === 'ABC' ? Math.round(fw * A4_RATIO) : Math.max(80, Math.min(2400, Math.round(h)));
      garage.patch(id, {w: fw, h: fh}); return;
    }
    const ww = Math.max(120, Math.min(640, Math.round(w)));
    const hh = Math.max(80, Math.min(800, Math.round(h)));
    garage.patch(id, {w: ww, h: hh});
  },
  addMap(opts: {
    title?: string; lat?: number; lon?: number; mapQuery?: string;
    image?: string | null; mapsUrl?: string | null; url?: string | null;
    x?: number; y?: number; w?: number; h?: number;
  }, by: 'human' | 'agent' = 'agent') {
    const lat = Number(opts.lat), lon = Number(opts.lon);
    const hasLL = Number.isFinite(lat) && Number.isFinite(lon);
    const q = String(opts.mapQuery || opts.title || '').slice(0, 200);
    const mapsUrl = opts.mapsUrl || (hasLL
      ? `https://www.google.com/maps?q=${lat},${lon}`
      : (q ? `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(q)}` : null));
    const image = opts.image || (hasLL
      ? `https://staticmap.openstreetmap.de/staticmap.php?center=${lat},${lon}&zoom=14&size=360x200&maptype=mapnik&markers=${lat},${lon},lightblue1`
      : null);
    const at = (opts.x != null || opts.y != null) ? {x: Math.floor(Number(opts.x) || 0), y: Math.floor(Number(opts.y) || 0)} : undefined;
    return garage.add({
      kind: 'map',
      title: String(opts.title || q || 'Map').slice(0, 200),
      text: q,
      lat: hasLL ? lat : undefined,
      lon: hasLL ? lon : undefined,
      mapQuery: q || undefined,
      image,
      mapsUrl: mapsUrl,
      url: opts.url || mapsUrl,
      by, rot: 0,
      w: opts.w || 240, h: opts.h || 220,
      ...(at || {}),
    });
  },
  station(id: string, p: Partial<Station>) { commit({...board, stations: board.stations.map(s => s.id === id ? {...s, ...p} : s)}); },
  connect(from: string, to: string) {
    if (from === to) return null;
    if (!board.items.some(i => i.id === from) || !board.items.some(i => i.id === to)) throw new Error('ITEM_NOT_FOUND');
    if (board.connectors.some(c => (c.from === from && c.to === to) || (c.from === to && c.to === from))) return board.connectors.find(c => (c.from === from && c.to === to) || (c.from === to && c.to === from))!;
    const c: Connector = {id: 'c-' + uid(), from, to};
    commit({...board, connectors: [...board.connectors, c]}); return c;
  },
  disconnect(id: string) { commit({...board, connectors: board.connectors.filter(c => c.id !== id)}); },
  addSticky(text = '', at?: {x: number; y: number}, by: 'human' | 'agent' = 'human') {
    return garage.add({kind: 'sticky', title: 'Sticky', text: text.slice(0, 1000), by, ...(at || {})});
  },
  addFormat(fmt: FormatKind, at?: {x: number; y: number}, by: 'human' | 'agent' = 'human', size?: {w: number; h?: number}) {
    const f: FormatKind = fmt === 'AB' || fmt === 'ABC' ? fmt : 'A';
    const w = Math.max(240, Math.round(size?.w || (f === 'ABC' ? 1188 : 1100)));
    const h = f === 'ABC' ? Math.round(w * A4_RATIO) : Math.round(size?.h || (f === 'AB' ? 520 : 260));
    return garage.add({kind: 'format', title: 'Format ' + f, fmt: f, by, rot: 0, w, h, ...(at || {})});
  },
  addTime(clock = '00:00', at?: {x: number; y: number}, by: 'human' | 'agent' = 'human') {
    const c = String(clock || '00:00').slice(0, 5);
    return garage.add({kind: 'time', title: 'Time', clock: c, text: c, by, rot: 0, ...(at || {})});
  },
  addTimer(mode: TimerMode, durationSec = 0, at?: {x: number; y: number}, by: 'human' | 'agent' = 'human', start = true) {
    const m: TimerMode = mode === 'up' || mode === 'free' ? mode : 'down';
    const dur = m === 'free' ? 0 : Math.max(1, Math.min(86400, Math.floor(Number(durationSec) || 0)));
    const now = Date.now();
    const timer: ItemTimer = {
      mode: m,
      durationSec: dur,
      status: start ? 'running' : 'idle',
      startedAt: start ? now : null,
      elapsedMs: 0,
    };
    return garage.add({
      kind: 'timer', title: m === 'free' ? 'Free' : (m === 'down' ? 'Countdown' : 'Count up'),
      timer, text: '', by, rot: 0, ...(at || {}),
    });
  },
  timerControl(id: string, action: 'start' | 'pause' | 'stop' | 'reset') {
    const it = board.items.find(i => i.id === id);
    if (!it || it.kind !== 'timer' || !it.timer) throw new Error('ITEM_NOT_FOUND');
    const now = Date.now();
    let t = {...it.timer};
    if (action === 'start') {
      if (t.status === 'running') return it;
      if (t.status === 'done') t = {...t, status: 'running', startedAt: now, elapsedMs: 0};
      else t = {...t, status: 'running', startedAt: now};
    } else if (action === 'pause') {
      if (t.status !== 'running') return it;
      let e = t.elapsedMs || 0;
      if (t.startedAt) e += Math.max(0, now - t.startedAt);
      t = {...t, status: 'paused', elapsedMs: e, startedAt: null};
    } else {
      t = {...t, status: 'idle', startedAt: null, elapsedMs: 0};
    }
    garage.patch(id, {timer: t});
    return board.items.find(i => i.id === id)!;
  },
  timerComplete(id: string) {
    const it = board.items.find(i => i.id === id);
    if (!it || it.kind !== 'timer' || !it.timer) return;
    if (it.timer.status !== 'running') return;
    const durMs = (it.timer.durationSec || 0) * 1000;
    garage.patch(id, {timer: {...it.timer, status: 'done', startedAt: null, elapsedMs: durMs}});
  },
  addTeardown(opts: {
    title?: string; image?: string | null; parts?: TeardownPart[]; forItem?: string | null;
    x?: number; y?: number;
  }, by: 'human' | 'agent' = 'agent') {
    const parts = Array.isArray(opts.parts) ? opts.parts.map((p, i) => ({
      key: String(p.key || ('p' + (i + 1))).slice(0, 40),
      label: String(p.label || '').slice(0, 120),
      image: p.image || null,
      price: p.unknown ? null : (p.price != null ? String(p.price).slice(0, 40) : null),
      unknown: !!p.unknown || p.price == null || p.price === '',
    })).filter(p => p.label) : [];
    const at = (opts.x != null || opts.y != null) ? {x: Math.floor(Number(opts.x) || 0), y: Math.floor(Number(opts.y) || 0)} : undefined;
    const item = garage.add({
      kind: 'teardown',
      title: String(opts.title || 'Teardown').slice(0, 200),
      image: opts.image || null,
      parts,
      forItem: opts.forItem || null,
      by, rot: 0, ...(at || {}),
    });
    if (opts.forItem && board.items.some(i => i.id === opts.forItem)) {
      try { garage.connect(opts.forItem, item.id); } catch {}
    }
    return item;
  },
  teardownTotal(parts?: TeardownPart[] | null) {
    let sum = 0; let currency: string | null = null; let any = false;
    for (const p of parts || []) {
      if (p.unknown || p.price == null || p.price === '') continue;
      const raw = String(p.price).trim().replace(/,/g, '.');
      const m = raw.match(/^([^\d]*?)(\d+(?:\.\d+)?)([^\d]*)$/);
      if (!m) return null; // Ranges and ambiguous separators are not exact amounts.
      const unit = (m[1] + m[3]).replace(/\s/g, '').toUpperCase();
      if (!/^(?:[A-Z]{3}|[$€£₾])?$/.test(unit)) return null;
      if (currency !== null && currency !== unit) return null;
      currency = unit;
      any = true; sum += Number(m[2]);
    }
    return any ? (Math.round(sum * 100) / 100) + (currency ? ' ' + currency : '') : null;
  },
    setCaption(id: string, caption: string) {
    if (!board.items.some(i => i.id === id)) throw new Error('ITEM_NOT_FOUND');
    garage.patch(id, {caption: caption.slice(0, 200)});
  },
  nextBoardNumber() {
    const maxPage = Math.max(1, board.maxPage || board.boardNumber || 1) + 1;
    return garage.selectBoard(maxPage);
  },
  selectBoard(n: number) {
    const num = Math.max(1, Math.floor(Number(n) || 1));
    const maxPage = Math.max(1, board.maxPage || 1, num);
    if (num === board.boardNumber && maxPage === (board.maxPage || 1)) return board;
    flushBoardIntoScope();
    const st = readActiveScopeState();
    const pack = board.layout === 'action' ? st.action : st.prep;
    pack.maxPage = maxPage;
    if (!pack.pages[num]) pack.pages[num] = emptySnap(board.layout, board.grid);
    st.focusPage = num;
    writeActiveScopeState(st);
    return applyScopeToLive(st);
  },
  boardPageNumbers() {
    const max = Math.max(1, board.maxPage || board.boardNumber || 1);
    return Array.from({length: max}, (_, i) => i + 1);
  },
  getScope(): BoardScope { return activeScope; },
  getScopeDate(): string | null { return activeScope === 'date' ? activeDate : null; },
  /** Timeless | By date. Persists current scope first. */
  setScope(scope: BoardScope, date?: string) {
    const next: BoardScope = scope === 'date' ? 'date' : 'timeless';
    flushBoardIntoScope();
    activeScope = next;
    saveScopePref(next);
    if (next === 'date') {
      const d = String(date || activeDate || todayISO()).slice(0, 10);
      if (!/^\d{4}-\d{2}-\d{2}$/.test(d)) throw new Error('INVALID_DATE');
      activeDate = d;
    }
    return applyScopeToLive(readActiveScopeState());
  },
  /** When scope is date, switch the calendar day board. No-op for timeless. */
  setBoardDate(date: string) {
    const d = String(date || '').slice(0, 10);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(d)) throw new Error('INVALID_DATE');
    if (activeScope !== 'date') {
      activeDate = d;
      return board;
    }
    if (d === activeDate) return board;
    flushBoardIntoScope();
    activeDate = d;
    return applyScopeToLive(readActiveScopeState());
  },
  address(): {scope: BoardScope; date: string | null; page: number} {
    return {scope: activeScope, date: activeScope === 'date' ? activeDate : null, page: board.boardNumber || 1};
  },
};

export function useGarage() { return useSyncExternalStore(garage.subscribe, garage.get); }
export function safeHttp(u?: string | null) { if (!u) return null; try { const x = new URL(u, location.origin); return /^https?:$/.test(x.protocol) ? x.href : null; } catch { return null; } }
export function safeImage(u?: string | null) { if (!u) return null; if (/^idb:[\w-]+$/.test(u)) return u; return safeHttp(u); }

export function inbox(): (Snapshot & {id: string; at: number})[] { try { const v = JSON.parse(localStorage.getItem(INBOX_KEY) || '[]'); return Array.isArray(v) ? v : []; } catch { return []; } }
export function pushInbox(s: Snapshot) { const list = inbox().filter(x => !(x.url === s.url && x.title === s.title)); const e = {...s, id: 'in-' + uid(), at: Date.now()}; localStorage.setItem(INBOX_KEY, JSON.stringify([e, ...list].slice(0, 40))); return e; }

const results = new Map<string, Snapshot>();
export function setMarketResults(entries: {resultId: string; item: any; section: any}[]) { for (const e of entries) if (!results.has(e.resultId)) results.set(e.resultId, itemSnapshot(e.item, e.section)); while (results.size > 300) results.delete(results.keys().next().value as string); }
export const marketResult = (id: string) => results.get(id);
export function itemSnapshot(it: any, sec?: any): Snapshot {
  const price = it?.priceLabel || (it?.price != null ? it.price + ' ' + (it.currency || '') : '');
  return {title: String(it?.title || 'Untitled').slice(0, 200), url: it?.buy?.url || it?.url || it?.website || null, image: typeof it?.image === 'string' && /^(https?:)?\/\//.test(it.image) ? it.image : null, price: String(price || '').slice(0, 60), source: [it?.provider, sec?.title].filter(Boolean).join(' · ').slice(0, 120) || 'MarketSpace'};
}
export const DRAG_MIME = 'application/x-sunrise-card+json';

export type Entry = {id: string; at: number; text: string};
export function diary(): Entry[] { try { const v = JSON.parse(localStorage.getItem(DIARY_KEY) || '[]'); return Array.isArray(v) ? v : []; } catch { return []; } }
export function addDiary(text: string) { const e = {id: 'd-' + uid(), at: Date.now(), text: text.slice(0, 4000)}; localStorage.setItem(DIARY_KEY, JSON.stringify([e, ...diary()].slice(0, 500))); return e; }

function db(): Promise<IDBDatabase> { return new Promise((res, rej) => { const r = indexedDB.open('sunrise-garage-v1', 1); r.onupgradeneeded = () => r.result.createObjectStore('blobs'); r.onsuccess = () => res(r.result); r.onerror = () => rej(r.error); }); }
export async function putBlob(b: Blob) { const id = 'b' + uid() + uid(); const d = await db(); await new Promise((res, rej) => { const t = d.transaction('blobs', 'readwrite'); t.objectStore('blobs').put(b, id); t.oncomplete = res; t.onerror = () => rej(t.error); }); return 'idb:' + id; }
export async function getBlob(ref: string): Promise<Blob | null> { const d = await db(); return new Promise(res => { const r = d.transaction('blobs').objectStore('blobs').get(ref.slice(4)); r.onsuccess = () => res(r.result || null); r.onerror = () => res(null); }); }
export const IMAGE_TYPES = ['image/jpeg', 'image/png', 'image/webp', 'image/gif'];
export async function storeImageFile(f: Blob) { if (!IMAGE_TYPES.includes(f.type)) throw new Error('GARAGE_IMAGE_TYPE'); if (f.size > 8 * 1024 * 1024) throw new Error('GARAGE_IMAGE_TOO_LARGE'); return putBlob(f); }
export async function importImageUrl(url: string) { const u = safeHttp(url); if (!u) throw new Error('GARAGE_URL_INVALID'); try { const r = await fetch(u, {mode: 'cors', credentials: 'omit'}); if (!r.ok) throw 0; const b = await r.blob(); if (!IMAGE_TYPES.includes(b.type) || b.size > 8 * 1024 * 1024) throw 0; return {ref: await putBlob(b), stored: 'indexeddb'}; } catch { return {ref: u, stored: 'url'}; } }

/** Bezier path between two board points (card centres). Pure — for tests & SVG. */
export function connectorPath(x1: number, y1: number, x2: number, y2: number) {
  const dx = Math.max(40, Math.abs(x2 - x1) * 0.35);
  const c1x = x1 + (x2 >= x1 ? dx : -dx), c2x = x2 - (x2 >= x1 ? dx : -dx);
  return `M ${x1} ${y1} C ${c1x} ${y1}, ${c2x} ${y2}, ${x2} ${y2}`;
}
