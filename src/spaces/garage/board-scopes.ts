/** Timeless + per-date board scopes; page packs with Prep/Action. */
import type {ChoiceSlotId} from './choice-slots';
import {toLocal, toWorld, pageAtX} from './page-frames';
import {readableChoiceItems} from './readable-choice';

export type BoardScope = 'timeless' | 'date';
export type Layout = 'prep' | 'action';
export type BoardSkeleton = 'none' | 'choice' | 'action';

export type ScopeItem = {
  id: string; kind: string; x: number; y: number; title: string;
  page?: number; [k: string]: unknown;
};
export type ScopeConnector = {id: string; from: string; to: string};

export type BoardSnap = {
  items: ScopeItem[];
  connectors: ScopeConnector[];
  agentImage: string | null;
  layout: Layout;
  grid: 'dots' | 'mm';
  skeleton?: BoardSkeleton;
  slots?: Partial<Record<ChoiceSlotId, string>>;
  /** Action lane-A times were seeded once for this page; never auto-reseed after edits/clear. */
  actionSeeded?: boolean;
};

export type LayoutPack = {
  pages: Record<number, BoardSnap>;
  maxPage: number;
};

export type ScopeState = {
  prep: LayoutPack;
  action: LayoutPack;
  focusPage: number;
  focusLayout: Layout;
  grid: 'dots' | 'mm';
  stations: unknown[];
  why: string;
  favSnapshot?: unknown[];
  inboxSnapshot?: unknown[];
  /** Pages (1-based) whose Action skeleton was seeded at least once in this scope. */
  actionSeededPages?: number[];
};

export const SCOPE_PREF_KEY = 'sunrise.garage.v1.boardScope';
export const TIMELESS_KEY = 'sunrise.garage.v1.timelessBoard';
export const DAYS_KEY = 'sunrise.garage.v1.dayBoards';
export const SCOPE_MIGRATED_KEY = 'sunrise.garage.v1.scopeMigrated.v1';
export const BIKE_SEED_KEY = 'sunrise.garage.v1.bikeDaySeed.v2';
export const BIKE_DAY = '2026-10-28';

export function emptySnap(layout: Layout = 'prep', grid: 'dots' | 'mm' = 'dots'): BoardSnap {
  return {items: [], connectors: [], agentImage: null, layout, grid, skeleton: 'none', slots: {}};
}

export function emptyPack(layout: Layout = 'prep', grid: 'dots' | 'mm' = 'dots'): LayoutPack {
  return {pages: {1: emptySnap(layout, grid)}, maxPage: 1};
}

export function emptyScope(grid: 'dots' | 'mm' = 'dots', stations: unknown[] = []): ScopeState {
  return {
    prep: emptyPack('prep', grid),
    action: emptyPack('action', grid),
    focusPage: 1,
    focusLayout: 'prep',
    grid,
    stations,
    why: '',
    actionSeededPages: [],
  };
}

export function loadJson<T>(key: string, fallback: T): T {
  try {
    const v = JSON.parse(localStorage.getItem(key) || 'null');
    return (v == null ? fallback : v) as T;
  } catch { return fallback; }
}

export function saveJson(key: string, v: unknown) {
  try { localStorage.setItem(key, JSON.stringify(v)); } catch {}
}

export function loadScopePref(): BoardScope {
  const v = localStorage.getItem(SCOPE_PREF_KEY);
  return v === 'date' ? 'date' : 'timeless';
}

export function saveScopePref(s: BoardScope) {
  try { localStorage.setItem(SCOPE_PREF_KEY, s); } catch {}
}

function normalizePack(p: LayoutPack | undefined, layout: Layout, grid: 'dots' | 'mm'): LayoutPack {
  if (!p || typeof p !== 'object') return emptyPack(layout, grid);
  const pages: Record<number, BoardSnap> = {};
  let max = 1;
  for (const [k, val] of Object.entries(p.pages || {})) {
    const n = Number(k);
    if (n > 0 && val && typeof val === 'object') {
      const snap = val as BoardSnap;
      pages[n] = {
        items: Array.isArray(snap.items) ? (layout === 'prep' && snap.skeleton === 'choice' ? readableChoiceItems(snap.items) : snap.items) : [],
        connectors: Array.isArray(snap.connectors) ? snap.connectors : [],
        agentImage: snap.agentImage ?? null,
        layout,
        grid: snap.grid === 'mm' ? 'mm' : grid,
        skeleton: snap.skeleton === 'choice' || snap.skeleton === 'action' ? snap.skeleton : 'none',
        slots: snap.slots && typeof snap.slots === 'object' ? snap.slots : {},
        actionSeeded: snap.actionSeeded === true,
      };
      if (n > max) max = n;
    }
  }
  if (!pages[1]) pages[1] = emptySnap(layout, grid);
  max = Math.max(max, Number(p.maxPage) || 1, ...Object.keys(pages).map(Number));
  return {pages, maxPage: max};
}

export function normalizeScope(v: ScopeState | null): ScopeState {
  if (!v || typeof v !== 'object') return emptyScope();
  const grid = v.grid === 'mm' ? 'mm' : 'dots';
  const prep = normalizePack(v.prep, 'prep', grid);
  const action = normalizePack(v.action, 'action', grid);
  const focusLayout: Layout = v.focusLayout === 'action' ? 'action' : 'prep';
  const pack = focusLayout === 'action' ? action : prep;
  const focusPage = Math.max(1, Math.min(pack.maxPage, Math.floor(Number(v.focusPage) || 1)));
  const seeded = Array.isArray(v.actionSeededPages)
    ? [...new Set(v.actionSeededPages.map(n => Math.floor(Number(n))).filter(n => n >= 1))]
    : [];
  return {
    prep, action, focusPage, focusLayout, grid,
    stations: Array.isArray(v.stations) ? v.stations : [],
    why: String(v.why || ''),
    favSnapshot: Array.isArray(v.favSnapshot) ? v.favSnapshot : undefined,
    inboxSnapshot: Array.isArray(v.inboxSnapshot) ? v.inboxSnapshot : undefined,
    actionSeededPages: seeded,
  };
}

export function loadTimeless(): ScopeState {
  const value = loadJson<ScopeState | null>(TIMELESS_KEY, null);
  return readableScope(value, TIMELESS_KEY);
}

export function saveTimeless(s: ScopeState) {
  saveJson(TIMELESS_KEY, s);
}

export function loadDay(date: string): ScopeState {
  const all = loadJson<Record<string, ScopeState>>(DAYS_KEY, {});
  return readableScope(all[date] || null, DAYS_KEY + ':' + date);
}

function readableScope(value: ScopeState | null, key: string): ScopeState {
  const needsUpgrade = value && Object.values(value.prep?.pages || {}).some(s =>
    s?.skeleton === 'choice' && Array.isArray(s.items) && readableChoiceItems(s.items) !== s.items);
  if (needsUpgrade) {
    // Preserve the original page pack before an eventual normal save writes new spacing.
    const backupKey = key + ':before-readable-layout-v1';
    try { if (!localStorage.getItem(backupKey)) localStorage.setItem(backupKey, JSON.stringify(value)); }
    catch { return value; } // A full browser store must not discard the rollback copy.
  }
  return normalizeScope(value);
}

export function saveDay(date: string, s: ScopeState) {
  const all = loadJson<Record<string, ScopeState>>(DAYS_KEY, {});
  all[date] = s;
  saveJson(DAYS_KEY, all);
}

export function splitComposite(
  items: ScopeItem[],
  connectors: ScopeConnector[],
  agentImage: string | null,
  layout: Layout,
  grid: 'dots' | 'mm',
  skeleton: BoardSkeleton | undefined,
  slots: Partial<Record<ChoiceSlotId, string>> | undefined,
  maxPage: number,
): LayoutPack {
  const pages: Record<number, BoardSnap> = {};
  for (let n = 1; n <= maxPage; n++) pages[n] = emptySnap(layout, grid);
  const idToPage = new Map<string, number>();
  for (const it of items) {
    const n = Math.max(1, Math.min(maxPage, Number(it.page) || pageAtX(it.x, maxPage)));
    idToPage.set(it.id, n);
    const loc = toLocal(it.x, it.y, n);
    pages[n].items.push({...it, x: loc.x, y: loc.y, page: n});
  }
  for (let n = 1; n <= maxPage; n++) {
    pages[n].skeleton = skeleton || 'none';
    pages[n].agentImage = n === 1 ? agentImage : null;
  }
  if (slots) {
    for (const [slot, itemId] of Object.entries(slots)) {
      if (!itemId) continue;
      const n = idToPage.get(itemId) || 1;
      pages[n].slots = pages[n].slots || {};
      (pages[n].slots as Record<string, string>)[slot] = itemId;
    }
  }
  for (const c of connectors) {
    const pf = idToPage.get(c.from);
    if (pf) pages[pf].connectors.push(c);
  }
  return {pages, maxPage};
}

export function composePack(pack: LayoutPack, layout: Layout) {
  const items: ScopeItem[] = [];
  const connectors: ScopeConnector[] = [];
  let agentImage: string | null = null;
  let skeleton: BoardSkeleton = 'none';
  const slots: Partial<Record<ChoiceSlotId, string>> = {};
  for (let n = 1; n <= pack.maxPage; n++) {
    const p = pack.pages[n] || emptySnap(layout);
    if (n === 1 && p.agentImage) agentImage = p.agentImage;
    if (p.skeleton && p.skeleton !== 'none') skeleton = p.skeleton;
    for (const it of p.items) {
      const w = toWorld(it.x, it.y, n);
      items.push({...it, x: w.x, y: w.y, page: n});
    }
    for (const c of p.connectors) connectors.push(c);
    if (p.slots) Object.assign(slots, p.slots);
  }
  return {items, connectors, agentImage, skeleton, slots, maxPage: pack.maxPage};
}

export function isBikeChoiceSnap(snap: BoardSnap): boolean {
  if (!snap || !Array.isArray(snap.items) || !snap.items.length) return false;
  const blob = snap.items.map(i => `${i.title} ${i.text || ''} ${i.source || ''} ${i.url || ''}`).join(' ').toLowerCase();
  if (!/marlin|trek|velo|\u0432\u0435\u043b\u043e\u0441\u0438\u043f\u0435\u0434|bike|extra\.ge/.test(blob)) return false;
  if (snap.skeleton === 'choice') return true;
  // Loose detection: at least one Marlin/Trek polaroid (legacy boards without skeleton flag).
  return snap.items.some(i => i.kind === 'polaroid' && /marlin|trek/i.test(`${i.title} ${i.source || ''}`));
}
