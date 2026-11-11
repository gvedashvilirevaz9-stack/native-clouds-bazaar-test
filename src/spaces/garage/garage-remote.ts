// Shared helpers for MCP Garage pult (executeGarage + control.read).
import {garage} from './store';
import {
  loadPages, pagesOnDate, upsertPage, createDayPage, appendLeaf,
  loadPresetState, savePresetState, unreadAsk, autofillAskInserts,
  exportPageJson, exportPageMd, todayISO, addDays,
  type DayPage,
} from './pages';
import {type PresetId} from './presets';
import {garageView, coerceTab} from './view';

export function downloadText(name: string, body: string, mime: string) {
  const blob = new Blob([body], {type: mime});
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url; a.download = name; a.click();
  URL.revokeObjectURL(url);
}

export function currentNotebookPage(): DayPage | null {
  const date = garageView.get().selectedDate || todayISO();
  return pagesOnDate(date, 'notebook')[0] || null;
}

export function pageInfo() {
  const v = garageView.get();
  if (v.tab === 'board') {
    const nums = garage.boardPageNumbers();
    const b = garage.get(); const addr = garage.address();
    const address = addr.scope === 'timeless' ? ('garage·timeless·page ' + addr.page) : ('garage·' + addr.date + '·page ' + addr.page);
    return {n: b.boardNumber, total: nums.length || 1, scope: addr.scope, date: addr.date, address};
  }
  const page = currentNotebookPage();
  return {n: page?.leaf || 1, total: page?.leaves.length || 0};
}

export function readGarageState() {
  const v = garageView.get();
  const ps = loadPresetState();
  const b = garage.get();
  return {
    ready: true,
    tab: v.tab,
    size: v.size,
    expanded: !!v.focusPageId,
    focusPageId: v.focusPageId,
    selectedDate: v.selectedDate,
    space: ps.preset,
    topic: ps.chip,
    page: pageInfo(),
    calOpen: v.calOpen,
    searchOpen: v.searchOpen,
    searchQuery: v.searchQuery,
    board: {rev: b.rev, layout: b.layout, items: b.items.length, boardNumber: b.boardNumber},
    askPending: unreadAsk().length,
  };
}

export function searchHits(query: string) {
  const qq = String(query || '').trim().toLowerCase();
  if (!qq) return [] as {kind: string; id: string; title: string}[];
  const pages = loadPages();
  const b = garage.get();
  return [
    ...pages.filter(p => p.title.toLowerCase().includes(qq) || p.leaves.some(l => l.text.toLowerCase().includes(qq)) || p.date.includes(qq))
      .map(p => ({kind: 'page', id: p.id, title: `${p.date} · ${p.title}`})),
    ...b.items.filter(i => (i.title + (i.text || '') + (i.caption || '')).toLowerCase().includes(qq))
      .map(i => ({kind: 'board', id: i.id, title: i.title || i.kind})),
  ].slice(0, 30);
}

export function setSelectedDate(date: string) {
  const d = String(date || '').slice(0, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(d)) throw new Error('INVALID_DATE');
  garageView.set({selectedDate: d});
  try { garage.setBoardDate(d); } catch {}
  return d;
}

export function ensureNb(title = 'Notebook') {
  const date = garageView.get().selectedDate || todayISO();
  const ps = loadPresetState();
  let page = pagesOnDate(date, 'notebook')[0];
  if (!page) {
    page = createDayPage({kind: 'notebook', date, title, preset: ps.preset, subPreset: ps.chip});
    upsertPage(page);
  }
  return page;
}

export function doPageNew() {
  const v = garageView.get();
  if (v.tab === 'board') {
    garage.nextBoardNumber();
    return {tab: 'board' as const, page: pageInfo()};
  }
  const ps = loadPresetState();
  let page = ensureNb();
  const r = appendLeaf(page.leaves);
  upsertPage({...page, leaves: r.leaves, leaf: r.leaf, updatedAt: Date.now()});
  return {tab: 'notebook' as const, page: pageInfo(), pageId: page.id};
}

export function doPageOpen(n: number) {
  const v = garageView.get();
  const pageN = Math.floor(Number(n) || 0);
  if (pageN < 1) throw new Error('PAGE_NOT_FOUND');
  if (v.tab === 'board') {
    const nums = garage.boardPageNumbers();
    if (!nums.includes(pageN)) throw new Error('PAGE_NOT_FOUND');
    garage.selectBoard(pageN);
    return {tab: 'board' as const, page: pageInfo()};
  }
  const page = currentNotebookPage();
  if (!page || !page.leaves.some(l => l.n === pageN)) throw new Error('PAGE_NOT_FOUND');
  upsertPage({...page, leaf: pageN});
  return {tab: 'notebook' as const, page: pageInfo(), pageId: page.id};
}

export function doSpaceSet(space: string) {
  if (space !== 'daily' && space !== 'study' && space !== 'workspace') throw new Error('INVALID_ARGS');
  const ps = loadPresetState();
  const next = {preset: space as PresetId, chip: null as string | null, weekStart: ps.weekStart};
  savePresetState(next);
  return {space: next.preset, topic: next.chip};
}

const ALL_TOPICS = ['person','children','women','animals','trade','math','medicine','humanities','code','rules','history','geography','science','psychology','language'];

export function doTopicSet(topic: string | null | undefined) {
  const ps = loadPresetState();
  let chip: string | null = null;
  if (topic != null && topic !== '') {
    if (!ALL_TOPICS.includes(topic)) throw new Error('TOPIC_NOT_FOUND');
    // toggle: same chip → clear (mirrors chip button)
    chip = ps.chip === topic ? null : topic;
  }
  const next = {...ps, chip};
  savePresetState(next);
  return {space: next.preset, topic: next.chip};
}

export {coerceTab, garageView, todayISO, addDays, autofillAskInserts, exportPageJson, exportPageMd, loadPresetState, upsertPage};
