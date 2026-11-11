// Notebook pages (migrated from diary/companion) + ask anchors / numbering.
// Pure logic — covered by spaces-garage-v2.test.mjs.

import type {PresetId} from './presets';

export const PAGES_KEY = 'sunrise.garage.v2.pages';
export const ASK_KEY = 'sunrise.garage.v2.ask';
export const PRESET_KEY = 'sunrise.garage.v2.preset';
export const ASK_POPUP_KEY = 'sunrise.garage.v2.askPopup';
export const MIGRATE_V6_KEY = 'sunrise.garage.v6.migrated';
export const PAGE_CAPACITY = 1400; // chars ≈ one notebook page at fixed editor height
export const MAX_PAGES_PER_DAY = 40;

export type PageKind = 'notebook' | 'diary' | 'companion'; // diary|companion kept for migration
export type Leaf = {n: number; text: string};
export type DayPage = {
  id: string;
  kind: PageKind;
  date: string; // YYYY-MM-DD
  title: string;
  preset: PresetId;
  subPreset: string | null;
  label?: string; // companion label
  leaves: Leaf[];
  leaf: number; // 1-based current leaf
  createdAt: number;
  updatedAt: number;
};
export type AskTarget = 'claude' | 'grok' | 'gpt' | 'gemini';
export type AskAnchor = {
  pageId: string;
  leaf: number;
  start: number;
  end: number;
  quote: string;
};
export type AskItem = {
  id: string;
  text: string;
  target: AskTarget;
  /** Stable question number shown in UI / MCP (1-based). */
  qNum: number;
  preset: string;
  presetId: PresetId;
  subPreset: string | null;
  subPresetId: string | null;
  /** Topic prompt for the agent — only when a chip/topic is selected. */
  prompt: string | null;
  /** Visible bubble header: space · topic · date (no role). */
  header: string;
  /** Full tag line: [Ask Grok] Space · Topic · date */
  tag: string;
  pageDate: string | null;
  pageId: string | null;
  /** Anchored range in the notebook leaf (for yellow highlight). */
  anchor?: AskAnchor | null;
  at: number;
  delivered: boolean;
  reply?: string | null;
  repliedAt?: number | null;
  /** Short inline-ready answer variants (1-based pick via insertedVariant). */
  variants?: string[];
  /** 1-based index of the variant currently inserted after the yellow quote; null if removed/none. */
  insertedVariant?: number | null;
  /** Where the blue « answer » snippet sits in the leaf text. */
  insertAnchor?: AskAnchor | null;
};
export type PresetState = {preset: PresetId; chip: string | null; weekStart: string};

const uid = () => Math.random().toString(36).slice(2, 10);

export function todayISO(d = new Date()) {
  const y = d.getFullYear(), m = String(d.getMonth() + 1).padStart(2, '0'), day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}
export function parseISO(s: string) {
  const [y, m, d] = s.split('-').map(Number);
  return new Date(y, (m || 1) - 1, d || 1);
}
export function formatDate(iso: string, locale = 'ru-RU') {
  const d = parseISO(iso);
  return d.toLocaleDateString(locale, {day: 'numeric', month: 'long', year: 'numeric', weekday: 'long'});
}
/** @deprecated use formatDate */
export function formatRuDate(iso: string) { return formatDate(iso, 'ru-RU'); }
export function addDays(iso: string, n: number) {
  const d = parseISO(iso); d.setDate(d.getDate() + n); return todayISO(d);
}
/** Monday of the week containing iso (ISO week, Mon-Sun). */
export function weekStart(iso: string) {
  const d = parseISO(iso);
  const day = (d.getDay() + 6) % 7; // Mon=0
  d.setDate(d.getDate() - day);
  return todayISO(d);
}
export function weekDays(start: string) {
  return Array.from({length: 7}, (_, i) => addDays(start, i));
}

/** Split text into fixed-capacity leaves; empty text → one empty leaf. */
export function paginate(text: string, capacity = PAGE_CAPACITY): Leaf[] {
  const t = String(text || '');
  if (!t) return [{n: 1, text: ''}];
  const out: Leaf[] = [];
  let i = 0, n = 1;
  while (i < t.length && n <= MAX_PAGES_PER_DAY) {
    let end = Math.min(i + capacity, t.length);
    if (end < t.length) {
      const slice = t.slice(i, end);
      const br = Math.max(slice.lastIndexOf('\n'), slice.lastIndexOf(' '));
      if (br > capacity * 0.4) end = i + br + 1;
    }
    out.push({n, text: t.slice(i, end)});
    i = end; n++;
  }
  if (!out.length) out.push({n: 1, text: ''});
  return out;
}

/** Update leaf `n` in place. Notebook pages are independent sheets — do NOT join/reflow
 *  all leaves (that collapsed empty pages and appended typed text onto page 1).
 *  `capacity` kept for API compat; overflow stays on this leaf. */
export function setLeafText(leaves: Leaf[], n: number, text: string, _capacity = PAGE_CAPACITY) {
  const list = leaves.length ? leaves : [{n: 1, text: ''}];
  const target = Math.min(Math.max(1, Math.floor(Number(n) || 1)), list.length);
  const next = list.map(l => (l.n === target ? {...l, text: String(text ?? '')} : l));
  return {leaves: next, leaf: target};
}

/** Append an empty notebook page (leaf) without reflowing existing text. */
export function appendLeaf(leaves: Leaf[]): {leaves: Leaf[]; leaf: number} {
  const n = (leaves[leaves.length - 1]?.n || leaves.length) + 1;
  return {leaves: [...leaves, {n, text: ''}], leaf: n};
}


export function createDayPage(p: {
  kind?: PageKind; date?: string; title?: string; preset?: PresetId; subPreset?: string | null; label?: string; text?: string;
}): DayPage {
  const date = p.date || todayISO();
  const leaves = paginate(p.text || '');
  const now = Date.now();
  return {
    id: 'pg-' + uid(),
    kind: p.kind || 'notebook',
    date,
    title: (p.title || (p.kind === 'companion' ? 'Companion note' : 'Notebook')).slice(0, 200),
    preset: p.preset || 'daily',
    subPreset: p.subPreset ?? null,
    label: p.label,
    leaves,
    leaf: 1,
    createdAt: now,
    updatedAt: now,
  };
}

export function loadPages(): DayPage[] {
  try {
    const v = JSON.parse(localStorage.getItem(PAGES_KEY) || '[]');
    if (!Array.isArray(v)) return [];
    return v.filter((x: any) => x && x.id && Array.isArray(x.leaves)).map((x: any) => ({
      ...x,
      leaves: x.leaves.map((l: any, i: number) => ({n: l.n || i + 1, text: String(l.text || '')})),
      leaf: Math.min(Math.max(1, x.leaf || 1), x.leaves.length || 1),
    }));
  } catch { return []; }
}
export function savePages(list: DayPage[]) {
  localStorage.setItem(PAGES_KEY, JSON.stringify(list.slice(0, 400)));
}
export function upsertPage(page: DayPage) {
  const list = loadPages().filter(p => p.id !== page.id);
  list.unshift({...page, updatedAt: Date.now()});
  savePages(list);
  return page;
}
export function removePage(id: string) {
  savePages(loadPages().filter(p => p.id !== id));
}
export function isNotebookKind(kind: PageKind | string) {
  return kind === 'notebook' || kind === 'diary' || kind === 'companion';
}
export function pagesOnDate(date: string, kind?: PageKind) {
  return loadPages().filter(p => p.date === date && (!kind || (kind === 'notebook' ? isNotebookKind(p.kind) : p.kind === kind)));
}
export function datesWithPages(kind?: PageKind): string[] {
  const set = new Set(loadPages().filter(p => !kind || (kind === 'notebook' ? isNotebookKind(p.kind) : p.kind === kind)).map(p => p.date));
  return [...set].sort();
}

export function exportPageJson(page: DayPage) {
  return JSON.stringify({schema: 'garage.page.v1', ...page}, null, 2);
}
function leafTextForMdExport(text: string, pageId: string, leaf: number): string {
  let t = String(text || '');
  const inserts = loadAsk()
    .filter(a => a.insertAnchor && a.insertAnchor.pageId === pageId && a.insertAnchor.leaf === leaf)
    .map(a => a.insertAnchor!)
    .sort((a, b) => b.start - a.start);
  for (const ins of inserts) {
    const hit = reanchorRange(t, ins);
    if (!hit) continue;
    const inner = String(ins.quote || '').replace(/^\s*«\s*/, '').replace(/\s*»\s*$/, '');
    t = t.slice(0, hit.start) + ' (' + inner + ')' + t.slice(hit.end);
  }
  return t;
}

export function exportPageMd(page: DayPage) {
  const head = [
    `# ${page.title}`,
    ``,
    `- Date: ${page.date}`,
    `- Preset: ${page.preset}${page.subPreset ? ' / ' + page.subPreset : ''}`,
    page.label ? `- Label: ${page.label}` : null,
    ``,
  ].filter(x => x !== null).join('\n');
  const body = page.leaves.map(l => `## Page ${l.n}\n\n${leafTextForMdExport(l.text, page.id, l.n)}`).join('\n\n');
  return head + body + '\n';
}

export function loadAsk(): AskItem[] {
  try {
    const v = JSON.parse(localStorage.getItem(ASK_KEY) || '[]');
    if (!Array.isArray(v)) return [];
    let max = 0;
    const mapped = v.filter((x: any) => x && x.id).map((x: any, i: number) => {
      const qNum = Number(x.qNum) > 0 ? Number(x.qNum) : 0;
      if (qNum > max) max = qNum;
      const variants = Array.isArray(x.variants)
        ? x.variants.map((v: any) => String(v || '').trim().slice(0, 400)).filter(Boolean).slice(0, 8)
        : [];
      return {
        ...x, qNum,
        anchor: x.anchor || null,
        reply: x.reply ?? null,
        repliedAt: x.repliedAt ?? null,
        variants,
        insertedVariant: Number(x.insertedVariant) > 0 ? Number(x.insertedVariant) : null,
        insertAnchor: x.insertAnchor || null,
      } as AskItem;
    });
    // Backfill missing qNums stably by age (oldest first)
    const need = mapped.filter(a => !a.qNum).sort((a, b) => a.at - b.at);
    for (const a of need) { max += 1; a.qNum = max; }
    if (need.length) {
      try { localStorage.setItem(ASK_KEY, JSON.stringify(mapped)); } catch {}
    }
    return mapped;
  } catch { return []; }
}
export function nextQNum(asks?: AskItem[]): number {
  const list = asks || loadAsk();
  return list.reduce((m, a) => Math.max(m, a.qNum || 0), 0) + 1;
}
const askSubs = new Set<() => void>();
export function subscribeAsk(fn: () => void) { askSubs.add(fn); return () => { askSubs.delete(fn); }; }
function emitAsk() { askSubs.forEach(f => f()); try { window.dispatchEvent(new Event('sunrise.garage.ask')); } catch {} }

export function pushAsk(item: Omit<AskItem, 'id' | 'at' | 'delivered' | 'reply' | 'repliedAt' | 'qNum'> & {qNum?: number}): AskItem {
  const qNum = item.qNum && item.qNum > 0 ? item.qNum : nextQNum();
  const e: AskItem = {...item, qNum, id: 'ask-' + uid(), at: Date.now(), delivered: true, reply: null, repliedAt: null, anchor: item.anchor ?? null};
  const list = [e, ...loadAsk()].slice(0, 100);
  localStorage.setItem(ASK_KEY, JSON.stringify(list));
  emitAsk();
  return e;
}
/** Normalize reply variants: explicit list, else first paragraph of text. */
export function normalizeAskVariants(text: string, variants?: string[] | null): string[] {
  if (Array.isArray(variants) && variants.length) {
    return variants.map(v => String(v || '').trim().slice(0, 400)).filter(Boolean).slice(0, 8);
  }
  const parts = splitReplyParagraphs(String(text || ''));
  const first = (parts[0] || String(text || '').trim()).slice(0, 400);
  return first ? [first] : [];
}

/** Inline snippet placed after the yellow quote: space + « answer ». */
export function formatInlineAnswer(variant: string): string {
  return ' «' + String(variant || '').trim() + '»';
}

export function replyAsk(askId: string, text: string, variants?: string[] | null): AskItem {
  const list = loadAsk();
  const i = list.findIndex(a => a.id === askId);
  if (i < 0) throw new Error('ASK_NOT_FOUND');
  const body = String(text || '').slice(0, 4000);
  const vars = normalizeAskVariants(body, variants);
  // Do NOT auto-insert — user presses Autofill, or agent calls garage.ask.insert.
  const next: AskItem = {
    ...list[i],
    reply: body,
    variants: vars,
    repliedAt: Date.now(),
  };
  list[i] = next;
  localStorage.setItem(ASK_KEY, JSON.stringify(list));
  emitAsk();
  return next;
}
export function unreadAsk() { return loadAsk().filter(a => a.delivered && !a.reply); }

function saveAskList(list: AskItem[]) {
  localStorage.setItem(ASK_KEY, JSON.stringify(list));
  emitAsk();
}

/** Insert or replace the blue inline answer for askId with variants[variant-1] (1-based). */
export function insertAskVariant(askId: string, variant: number): AskItem {
  const list = loadAsk();
  const i = list.findIndex(a => a.id === askId);
  if (i < 0) throw new Error('ASK_NOT_FOUND');
  const ask = list[i];
  const vars = (ask.variants && ask.variants.length)
    ? ask.variants
    : normalizeAskVariants(ask.reply || '');
  if (!vars.length) throw new Error('NO_VARIANTS');
  const idx = Math.max(1, Math.floor(Number(variant) || 1));
  if (idx > vars.length) throw new Error('VARIANT_NOT_FOUND');
  const snippet = formatInlineAnswer(vars[idx - 1]);

  if (!ask.anchor) {
    const next = {...ask, variants: vars, insertedVariant: idx, insertAnchor: null};
    list[i] = next; saveAskList(list); return next;
  }

  const pages = loadPages();
  const page = pages.find(p => p.id === ask.anchor!.pageId);
  if (!page) throw new Error('PAGE_NOT_FOUND');
  const leafN = ask.anchor.leaf;
  const leaf = page.leaves.find(l => l.n === leafN);
  if (!leaf) throw new Error('LEAF_NOT_FOUND');
  let text = leaf.text;
  const hit = reanchorRange(text, ask.anchor);
  if (!hit) throw new Error('ANCHOR_LOST');

  let insertStart: number;
  let newText: string;
  if (ask.insertAnchor) {
    const oldHit = reanchorRange(text, ask.insertAnchor);
    if (oldHit) {
      newText = text.slice(0, oldHit.start) + snippet + text.slice(oldHit.end);
      insertStart = oldHit.start;
    } else {
      insertStart = hit.end;
      newText = text.slice(0, hit.end) + snippet + text.slice(hit.end);
    }
  } else {
    insertStart = hit.end;
    newText = text.slice(0, hit.end) + snippet + text.slice(hit.end);
  }
  const oldLen = ask.insertAnchor
    ? Math.max(0, (ask.insertAnchor.end - ask.insertAnchor.start))
    : 0;
  // When replacing, net delta = new - old; when first insert, delta = snippet.length.
  const replacing = !!(ask.insertAnchor && reanchorRange(text, ask.insertAnchor));
  const delta = replacing ? (snippet.length - oldLen) : snippet.length;
  const insertEnd = insertStart + snippet.length;
  const newLeaves = page.leaves.map(l => l.n === leafN ? {...l, text: newText} : l);
  upsertPage({...page, leaves: newLeaves});

  const next: AskItem = {
    ...ask,
    variants: vars,
    insertedVariant: idx,
    insertAnchor: {pageId: page.id, leaf: leafN, start: insertStart, end: insertEnd, quote: snippet},
    anchor: {...ask.anchor, start: hit.start, end: hit.end},
  };
  const list2 = loadAsk();
  const j = list2.findIndex(a => a.id === askId);
  if (j < 0) throw new Error('ASK_NOT_FOUND');
  // Shift sibling anchors on the same leaf that sit at/after the edit point.
  const shiftFrom = replacing ? insertStart : hit.end;
  const shifted = list2.map((a, k) => {
    if (k === j) return next;
    let cur = a;
    if (a.anchor && a.anchor.pageId === page.id && a.anchor.leaf === leafN && a.anchor.start >= shiftFrom && delta) {
      cur = {...cur, anchor: {...a.anchor, start: a.anchor.start + delta, end: a.anchor.end + delta}};
    }
    if (cur.insertAnchor && cur.insertAnchor.pageId === page.id && cur.insertAnchor.leaf === leafN
        && cur.insertAnchor.start >= shiftFrom && delta) {
      cur = {...cur, insertAnchor: {
        ...cur.insertAnchor,
        start: cur.insertAnchor.start + delta,
        end: cur.insertAnchor.end + delta,
      }};
    }
    return cur;
  });
  saveAskList(shifted);
  return next;
}

/** Remove the blue inline snippet for askId (keeps reply/variants). */
export function removeAskInsert(askId: string): AskItem {
  const list = loadAsk();
  const i = list.findIndex(a => a.id === askId);
  if (i < 0) throw new Error('ASK_NOT_FOUND');
  const ask = list[i];
  let removedHit: {start: number; end: number} | null = null;
  let pageId: string | null = null;
  let leafN = 0;
  if (ask.insertAnchor) {
    pageId = ask.insertAnchor.pageId;
    leafN = ask.insertAnchor.leaf;
    const page = loadPages().find(p => p.id === pageId);
    if (page) {
      const leaf = page.leaves.find(l => l.n === leafN);
      if (leaf) {
        const hit = reanchorRange(leaf.text, ask.insertAnchor);
        if (hit) {
          removedHit = hit;
          const newText = leaf.text.slice(0, hit.start) + leaf.text.slice(hit.end);
          upsertPage({...page, leaves: page.leaves.map(l => l.n === leaf.n ? {...l, text: newText} : l)});
        }
      }
    }
  }
  const next = {...ask, insertedVariant: null, insertAnchor: null};
  const list2 = loadAsk();
  const j = list2.findIndex(a => a.id === askId);
  const delta = removedHit ? -(removedHit.end - removedHit.start) : 0;
  const shifted = list2.map((a, k) => {
    if (k === j) return next;
    if (!removedHit || !pageId || !delta) return a;
    let cur = a;
    if (a.anchor && a.anchor.pageId === pageId && a.anchor.leaf === leafN && a.anchor.start >= removedHit.start) {
      cur = {...cur, anchor: {...a.anchor, start: a.anchor.start + delta, end: a.anchor.end + delta}};
    }
    if (cur.insertAnchor && cur.insertAnchor.pageId === pageId && cur.insertAnchor.leaf === leafN
        && cur.insertAnchor.start >= removedHit.start) {
      cur = {...cur, insertAnchor: {
        ...cur.insertAnchor,
        start: cur.insertAnchor.start + delta,
        end: cur.insertAnchor.end + delta,
      }};
    }
    return cur;
  });
  saveAskList(shifted);
  return next;
}

/**
 * Autofill: for asks on the given page ids that have a reply but no insert yet,
 * insert variant 1. Does not overwrite user-chosen inserts.
 */
export function autofillAskInserts(pageIds: string[]): {inserted: number; skipped: number} {
  const idSet = new Set(pageIds);
  const onPages = loadAsk().filter(a => a.anchor && idSet.has(a.anchor.pageId));
  // Insert from the end of the leaf so earlier offsets stay valid.
  const candidates = onPages
    .filter(a => a.reply && !(a.insertAnchor && a.insertedVariant))
    .slice()
    .sort((a, b) => (b.anchor!.start - a.anchor!.start) || (b.qNum - a.qNum));
  let inserted = 0;
  for (const a of candidates) {
    try {
      insertAskVariant(a.id, 1);
      inserted++;
    } catch { /* skip broken anchors */ }
  }
  return {inserted, skipped: onPages.length - inserted};
}

export function loadPresetState(): PresetState {
  try {
    const v = JSON.parse(localStorage.getItem(PRESET_KEY) || 'null');
    if (v && (v.preset === 'daily' || v.preset === 'study' || v.preset === 'workspace')) {
      return {preset: v.preset, chip: v.chip ?? null, weekStart: v.weekStart || weekStart(todayISO())};
    }
  } catch {}
  return {preset: 'daily', chip: null, weekStart: weekStart(todayISO())};
}
export function savePresetState(s: PresetState) {
  localStorage.setItem(PRESET_KEY, JSON.stringify(s));
}

/** Month grid cells: 6 weeks × 7 days starting Monday of first week covering the month. */
export function monthGrid(year: number, month0: number) {
  const first = new Date(year, month0, 1);
  const start = weekStart(todayISO(first));
  return Array.from({length: 42}, (_, i) => {
    const iso = addDays(start, i);
    const d = parseISO(iso);
    return {iso, day: d.getDate(), inMonth: d.getMonth() === month0};
  });
}

// —— Daily start window (once per calendar day; no role) ——
export const START_KEY = 'sunrise.garage.v2.startShownDate';
export type StartChoice = 'notebook' | 'board';
export type LegacyStartChoice = StartChoice | 'diary' | 'companion';

/** Pure: show start when stored date !== today. */
export function shouldShowDailyStart(stored: string | null | undefined, today: string): boolean {
  return !stored || stored !== today;
}
export function loadStartShownDate(): string | null {
  try { return localStorage.getItem(START_KEY); } catch { return null; }
}
export function markDailyStartShown(today = todayISO()) {
  localStorage.setItem(START_KEY, today);
}
export function needsDailyStart(today = todayISO()): boolean {
  return shouldShowDailyStart(loadStartShownDate(), today);
}

/** Split agent reply into clickable paragraphs/topics. */
export function splitReplyParagraphs(text: string): string[] {
  const raw = String(text || '').replace(/\r\n/g, '\n').trim();
  if (!raw) return [];
  let parts = raw.split(/\n\s*\n+/).map(s => s.trim()).filter(Boolean);
  if (parts.length === 1 && raw.includes('\n')) {
    parts = raw.split(/\n+/).map(s => s.trim()).filter(Boolean);
  }
  return parts;
}

/** Build ask tag + bubble header (no role). */
export function buildAskMeta(opts: {
  target: AskTarget;
  askLabel: string; // localized "Ask Grok" / equivalent
  space: string;
  topic?: string | null;
  date?: string | null;
}) {
  const bits = [opts.space, opts.topic || null, opts.date || null].filter(Boolean) as string[];
  const header = bits.join(' · ');
  const tag = `[${opts.askLabel}] ${header}`;
  return {tag, header};
}


// —— v6: popup toggle, page migration, ask anchors ——
export function loadAskPopupEnabled(): boolean {
  try {
    const v = localStorage.getItem(ASK_POPUP_KEY);
    if (v === null || v === undefined) return true; // default ON
    return v !== '0' && v !== 'false';
  } catch { return true; }
}
export function saveAskPopupEnabled(on: boolean) {
  localStorage.setItem(ASK_POPUP_KEY, on ? '1' : '0');
  try { window.dispatchEvent(new Event('sunrise.garage.askPopup')); } catch {}
}

/** Pure: re-find quote in text near previous offsets. */
export function reanchorRange(
  text: string,
  anchor: {start: number; end: number; quote: string},
): {start: number; end: number} | null {
  const q = String(anchor.quote || '');
  if (!q) return null;
  const t = String(text || '');
  if (anchor.start >= 0 && t.slice(anchor.start, anchor.start + q.length) === q) {
    return {start: anchor.start, end: anchor.start + q.length};
  }
  const win = 120;
  const from = Math.max(0, (anchor.start || 0) - win);
  const to = Math.min(t.length, (anchor.end || 0) + win);
  const region = t.slice(from, to);
  const idx = region.indexOf(q);
  if (idx >= 0) return {start: from + idx, end: from + idx + q.length};
  const g = t.indexOf(q);
  if (g >= 0) return {start: g, end: g + q.length};
  return null;
}

export function escapeHtml(s: string): string {
  return String(s || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

/** Build HTML for a leaf with yellow ask marks + blue insert spans (when show=true).
 *  When show=false, colours are off but inserted « answer » text stays in the plain export. */
export function renderLeafHtml(
  text: string,
  asks: AskItem[],
  pageId: string,
  leaf: number,
  show: boolean,
): string {
  const t = String(text || '');
  if (!show) return escapeHtml(t);
  type Mark = {start: number; end: number; id: string; qNum: number; kind: 'ask' | 'insert'};
  const marks: Mark[] = [];
  for (const a of asks) {
    if (a.anchor && a.anchor.pageId === pageId && a.anchor.leaf === leaf) {
      const hit = reanchorRange(t, a.anchor);
      if (hit) marks.push({start: hit.start, end: hit.end, id: a.id, qNum: a.qNum, kind: 'ask'});
    }
    if (a.insertAnchor && a.insertAnchor.pageId === pageId && a.insertAnchor.leaf === leaf) {
      const hit = reanchorRange(t, a.insertAnchor);
      if (hit) marks.push({start: hit.start, end: hit.end, id: a.id, qNum: a.qNum, kind: 'insert'});
    }
  }
  marks.sort((a, b) => a.start - b.start || b.end - a.end);
  const kept: Mark[] = [];
  let cursor = 0;
  for (const m of marks) {
    if (m.start < cursor) continue;
    kept.push(m);
    cursor = m.end;
  }
  let html = '';
  let i = 0;
  for (const m of kept) {
    html += escapeHtml(t.slice(i, m.start));
    if (m.kind === 'insert') {
      html += `<mark class="gr-ask-insert" data-ask-id="${escapeHtml(m.id)}" data-testid="gr-ask-insert">${escapeHtml(t.slice(m.start, m.end))}</mark>`;
    } else {
      html += `<mark class="gr-ask-mark" data-ask-id="${escapeHtml(m.id)}" data-qnum="${m.qNum}" data-testid="gr-ask-mark">${escapeHtml(t.slice(m.start, m.end))}</mark>`;
    }
    i = m.end;
  }
  html += escapeHtml(t.slice(i));
  return html;
}

/** Re-anchor yellow + insert ranges for a page leaf after text edit; persists. */
export function reanchorAsksForLeaf(pageId: string, leaf: number, text: string): AskItem[] {
  const list = loadAsk();
  let changed = false;
  const next = list.map(a => {
    let cur = a;
    if (a.anchor && a.anchor.pageId === pageId && a.anchor.leaf === leaf) {
      const hit = reanchorRange(text, a.anchor);
      if (hit && (hit.start !== a.anchor.start || hit.end !== a.anchor.end)) {
        changed = true;
        cur = {...cur, anchor: {...a.anchor, start: hit.start, end: hit.end}};
      }
    }
    if (cur.insertAnchor && cur.insertAnchor.pageId === pageId && cur.insertAnchor.leaf === leaf) {
      const hit = reanchorRange(text, cur.insertAnchor);
      if (hit && (hit.start !== cur.insertAnchor.start || hit.end !== cur.insertAnchor.end)) {
        changed = true;
        cur = {...cur, insertAnchor: {...cur.insertAnchor, start: hit.start, end: hit.end}};
      }
    }
    return cur;
  });
  if (changed) {
    localStorage.setItem(ASK_KEY, JSON.stringify(next));
    emitAsk();
  }
  return next;
}

export function normalizeTab(tab: string | null | undefined): 'notebook' | 'board' {
  if (tab === 'board') return 'board';
  return 'notebook';
}

export function normalizeStart(choice: LegacyStartChoice): StartChoice {
  if (choice === 'board') return 'board';
  return 'notebook';
}

/** One-shot: diary/companion pages → notebook; merge same-date docs preferring diary body. */
export function migratePagesToNotebook(): {migrated: boolean; count: number} {
  try {
    if (localStorage.getItem(MIGRATE_V6_KEY) === '1') return {migrated: false, count: 0};
  } catch {}
  const raw = loadPages();
  let count = 0;
  const byDate = new Map<string, DayPage[]>();
  for (const p of raw) {
    const kind = isNotebookKind(p.kind) ? 'notebook' as PageKind : p.kind;
    if (p.kind !== kind) count++;
    const np = {...p, kind};
    const arr = byDate.get(np.date) || [];
    arr.push(np);
    byDate.set(np.date, arr);
  }
  const out: DayPage[] = [];
  for (const [, arr] of byDate) {
    if (arr.length === 1) { out.push(arr[0]); continue; }
    // Prefer original diary, then longest text
    arr.sort((a, b) => {
      const score = (p: DayPage) => (raw.find(r => r.id === p.id)?.kind === 'diary' ? 2 : 0) + p.leaves.reduce((s, l) => s + l.text.length, 0) / 1e6;
      return score(b) - score(a);
    });
    const primary = {...arr[0]};
    for (const extra of arr.slice(1)) {
      for (const leaf of extra.leaves) {
        if (!leaf.text.trim()) continue;
        const r = appendLeaf(primary.leaves);
        primary.leaves = r.leaves.map(l => l.n === r.leaf ? {...l, text: leaf.text} : l);
      }
      count++;
    }
    out.push(primary);
  }
  // Preserve relative order by updatedAt
  out.sort((a, b) => b.updatedAt - a.updatedAt);
  savePages(out);
  try { localStorage.setItem(MIGRATE_V6_KEY, '1'); } catch {}
  return {migrated: true, count};
}
