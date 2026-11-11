// Garage shared UI state (tab/size/focus/date/search/calendar) — avoids circular imports.
export type Tab = 'notebook' | 'board';

function todayISO() {
  const d = new Date();
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

let tabState: Tab = 'board';
let sizeState: 'embedded' | 'fullscreen' = 'embedded';
/** Notebook Expand (focus sheet) page id; null = collapsed. */
let focusPageIdState: string | null = null;
let selectedDateState: string = todayISO();
let searchOpenState = false;
let searchQueryState = '';
let calOpenState = false;
const tabSubs = new Set<() => void>();

export function coerceTab(t: string | null | undefined): Tab {
  if (t === 'board' || t === 'sketchbook') return 'board';
  // diary | companion | notebook → notebook
  return 'notebook';
}

export const garageView = {
  get: () => ({
    tab: tabState,
    size: sizeState,
    focusPageId: focusPageIdState,
    selectedDate: selectedDateState,
    searchOpen: searchOpenState,
    searchQuery: searchQueryState,
    calOpen: calOpenState,
  }),
  set(p: {
    tab?: string;
    size?: 'embedded' | 'fullscreen';
    focusPageId?: string | null;
    selectedDate?: string;
    searchOpen?: boolean;
    searchQuery?: string;
    calOpen?: boolean;
  }) {
    if (p.tab) tabState = coerceTab(p.tab);
    if (p.size) sizeState = p.size;
    if (p.focusPageId !== undefined) focusPageIdState = p.focusPageId;
    if (p.selectedDate) {
      const d = String(p.selectedDate).slice(0, 10);
      if (/^\d{4}-\d{2}-\d{2}$/.test(d)) selectedDateState = d;
    }
    if (p.searchOpen !== undefined) searchOpenState = !!p.searchOpen;
    if (p.searchQuery !== undefined) searchQueryState = String(p.searchQuery || '').slice(0, 300);
    if (p.calOpen !== undefined) calOpenState = !!p.calOpen;
    tabSubs.forEach(f => f());
  },
  subscribe(cb: () => void) { tabSubs.add(cb); return () => { tabSubs.delete(cb); }; },
};
