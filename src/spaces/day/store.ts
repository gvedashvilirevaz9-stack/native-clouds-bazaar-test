// Day plan (День): the final document for home life. Numbered points with time, place and tags,
// gathered by the agent from estimates (kids' schedules, bills), invoices and the person's notes.
import {useSyncExternalStore} from 'react';
import {estimates, TEMPLATES, lineTotal} from '../estimate/store';
import {reminders} from '../billing/store';
import type {TagKind} from '../billing/pdfkit';

export const DAY_KEY = 'sunrise.day.v1';
export type DayTag = Exclude<TagKind, 'note'>;
export type DayEntry = {
  id: string; date: string; time?: string; end?: string;
  title: string; why?: string; who?: string; forWhom?: string;   // who: child / person it concerns; forWhom: whose plan it is (Мама, Папа)
  place?: string; amount?: number | null; currency?: string; buy?: string[]; phone?: string; link?: string;
  tags: DayTag[]; done: boolean; source?: {kind: 'estimate' | 'invoice' | 'agent' | 'human'; id?: string; key?: string};
};
const TAGS: DayTag[] = ['pay', 'place', 'buy', 'kid', 'time', 'call', 'task'];
const subs = new Set<() => void>(); let rev = 0; let cache: DayEntry[] | null = null;
function load(): DayEntry[] { if (cache) return cache; try { const v = JSON.parse(localStorage.getItem(DAY_KEY) || '[]'); cache = Array.isArray(v) ? v : []; } catch { cache = []; } return cache!; }
function save(l: DayEntry[]) { cache = l.slice(-2000); rev++; try { localStorage.setItem(DAY_KEY, JSON.stringify(cache)); } catch { /* */ } subs.forEach(f => f()); }
const uid = () => 'd-' + Math.random().toString(36).slice(2, 9);
export const today = () => { const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`; };
export const shiftDate = (s: string, n: number) => { const d = new Date(s + 'T12:00:00'); d.setDate(d.getDate() + n); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`; };
const hhmm = (v?: string) => {
  const m = String(v || '').trim().match(/^(\d{1,2})(?:[:.](\d{2}))?\s*(am|pm)?$/i); if (!m) return undefined;
  let h = +m[1]; const mi = m[2] ? +m[2] : 0; const ap = (m[3] || '').toLowerCase();
  if (ap === 'pm' && h < 12) h += 12; if (ap === 'am' && h === 12) h = 0;
  return h < 24 && mi < 60 ? `${String(h).padStart(2, '0')}:${String(mi).padStart(2, '0')}` : undefined;
};

function norm(x: Partial<DayEntry>): DayEntry {
  const tags = (x.tags || []).filter(t => TAGS.includes(t as DayTag)) as DayTag[];
  // Tags follow from the data so the person never has to set them.
  if (x.amount && !tags.includes('pay')) tags.push('pay');
  if (x.place && !tags.includes('place')) tags.push('place');
  if (x.buy?.length && !tags.includes('buy')) tags.push('buy');
  if (x.who && !tags.includes('kid')) tags.push('kid');
  if (x.phone && !tags.includes('call')) tags.push('call');
  return {id: x.id || uid(), date: /^\d{4}-\d{2}-\d{2}$/.test(x.date || '') ? x.date! : today(), time: hhmm(x.time), end: hhmm(x.end),
    title: String(x.title || '—').slice(0, 160), why: x.why ? String(x.why).slice(0, 300) : undefined, who: x.who ? String(x.who).slice(0, 60) : undefined,
    forWhom: x.forWhom ? String(x.forWhom).slice(0, 40) : undefined, place: x.place ? String(x.place).slice(0, 200) : undefined,
    amount: x.amount == null ? null : Number(x.amount) || null, currency: x.currency ? String(x.currency).toUpperCase().slice(0, 6) : undefined,
    buy: Array.isArray(x.buy) ? x.buy.map(String).filter(Boolean).slice(0, 40) : undefined, phone: x.phone ? String(x.phone).slice(0, 40) : undefined,
    link: x.link && /^https?:\/\//.test(x.link) ? x.link : undefined, tags: [...new Set(tags)], done: !!x.done, source: x.source};
}
const byTime = (a: DayEntry, b: DayEntry) => (a.time || '99:99').localeCompare(b.time || '99:99') || a.title.localeCompare(b.title);
let selDate = today(); let selFor: string | null = null;

export const day = {
  all: () => load(),
  list: (date = selDate, forWhom: string | null = null) => load().filter(e => e.date === date && (!forWhom || !e.forWhom || e.forWhom === forWhom)).sort(byTime),
  people: () => [...new Set(load().map(e => e.forWhom).filter(Boolean) as string[])],
  subscribe(f: () => void) { subs.add(f); return () => { subs.delete(f); }; },
  revision: () => rev,
  date: () => selDate, forWhom: () => selFor,
  view(p: {date?: string; forWhom?: string | null}) { if (p.date) selDate = p.date; if (p.forWhom !== undefined) selFor = p.forWhom; rev++; subs.forEach(f => f()); },
  /** Adds entries; entries with the same source key replace the old ones (re-gathering is safe). */
  add(list: Partial<DayEntry>[], by: 'agent' | 'human' = 'agent') {
    const all = load().slice(); const added: DayEntry[] = [];
    for (const raw of list) {
      const e = norm({...raw, source: raw.source || {kind: by}});
      const k = e.source?.key; const i = k ? all.findIndex(x => x.source?.key === k) : -1;
      if (i >= 0) { all[i] = {...e, id: all[i].id, done: all[i].done}; added.push(all[i]); } else { all.push(e); added.push(e); }
    }
    save(all); return added;
  },
  patch(id: string, p: Partial<DayEntry>) { const all = load().slice(); const i = all.findIndex(x => x.id === id); if (i < 0) throw new Error('DAY_ENTRY_NOT_FOUND'); all[i] = norm({...all[i], ...p, id}); save(all); return all[i]; },
  toggle(id: string) { const e = load().find(x => x.id === id); if (!e) throw new Error('DAY_ENTRY_NOT_FOUND'); return day.patch(id, {done: !e.done}); },
  remove(id: string) { save(load().filter(x => x.id !== id)); return {removed: id}; },
  clear(date?: string) { save(date ? load().filter(x => x.date !== date) : []); },
};
export function useDay() { useSyncExternalStore(day.subscribe, day.revision); return {date: selDate, forWhom: selFor, entries: day.list(selDate, selFor), people: day.people()}; }

// ---------- schedule text → dates ----------
const WD: [RegExp, number][] = [[/^(пн|пон|mon|mo)/i, 1], [/^(вт|tue|tu)/i, 2], [/^(ср|wed|we)/i, 3], [/^(чт|thu|th)/i, 4], [/^(пт|fri|fr)/i, 5], [/^(сб|sat|sa)/i, 6], [/^(вс|воск|sun|su)/i, 0]];
/** "Пн, Ср 17:00–18:30" / "Mon & Thu 5:30pm-7pm" / "Sat 10:00" → weekdays + start/end. */
export function parseSchedule(s: string) {
  const days = new Set<number>(); const words = s.split(/[\s,;/&+]+/).filter(Boolean);
  for (const w of words) { if (/^(ежедневно|daily|every\s*day)/i.test(w)) [0, 1, 2, 3, 4, 5, 6].forEach(d => days.add(d)); for (const [re, d] of WD) if (re.test(w)) days.add(d); }
  const range = s.match(/(\d{1,2}(?:[:.]\d{2})?\s*(?:am|pm)?)\s*[–—-]\s*(\d{1,2}(?:[:.]\d{2})?\s*(?:am|pm)?)/i);
  const single = s.match(/(\d{1,2}[:.]\d{2}\s*(?:am|pm)?|\d{1,2}\s*(?:am|pm))/i);
  let start = range ? hhmm(range[1]) : single ? hhmm(single[1]) : undefined; let end = range ? hhmm(range[2]) : undefined;
  // "5-7pm": the first time borrows the second's am/pm.
  if (range && start && end && !/am|pm/i.test(range[1]) && /pm/i.test(range[2]) && +start.slice(0, 2) < 12 && +start.slice(0, 2) + 12 <= +end.slice(0, 2)) start = String(+start.slice(0, 2) + 12).padStart(2, '0') + start.slice(2);
  return {days: [...days], start, end};
}

/** Estimate lines → day entries for the next `days` days: bills on their due date, activities on their weekdays. */
export function estimateToDay(estimateId: string, days = 7, from = today()) {
  const e = estimates.get(estimateId); if (!e) throw new Error('ESTIMATE_NOT_FOUND');
  const tpl = TEMPLATES[e.template]; const out: Partial<DayEntry>[] = []; const last = shiftDate(from, days - 1);
  for (const i of e.items) {
    if (i.due && i.status !== 'ok' && i.status !== 'have' && i.due >= from && i.due <= last) out.push({date: i.due, title: (tpl.bills ? 'Оплатить: ' : 'Срок: ') + i.name, amount: lineTotal(i), currency: e.currency, why: [i.basis, i.note].filter(Boolean).join(' · ') || e.title, tags: ['pay'], link: i.url || undefined, source: {kind: 'estimate', id: e.id, key: `est:${e.id}:${i.id}:due:${i.due}`}});
    if (i.schedule) {
      const sc = parseSchedule(i.schedule); if (!sc.days.length) continue;
      for (let n = 0; n < days; n++) {
        const d = shiftDate(from, n); if (!sc.days.includes(new Date(d + 'T12:00:00').getDay())) continue;
        out.push({date: d, time: sc.start, end: sc.end, title: i.name, who: i.who, place: i.place, why: i.duties || i.note, tags: ['time'], source: {kind: 'estimate', id: e.id, key: `est:${e.id}:${i.id}:on:${d}`}});
      }
    }
  }
  const added = day.add(out);
  return {estimateId, added: added.length, dates: [...new Set(added.map(a => a.date))].sort()};
}
/** Everything the portal already knows for the coming days: household estimates + invoice reminders. */
export function gatherDay(days = 7, from = today()) {
  let added = 0;
  for (const e of estimates.list()) if (TEMPLATES[e.template].household || e.items.some(i => i.schedule || i.due)) added += estimateToDay(e.id, days, from).added;
  const last = shiftDate(from, days - 1);
  const rem = reminders().filter(r => r.on <= last).map(r => ({date: r.on < from ? from : r.on, title: `Напомнить об оплате: ${r.client || r.number}`, why: `Счёт ${r.number}${r.overdueDays > 0 ? `, просрочен ${r.overdueDays} дн.` : ''}`, amount: r.total, currency: r.currency, tags: ['call', 'pay'] as DayTag[], source: {kind: 'invoice' as const, id: r.invoiceId, key: `inv:${r.invoiceId}:${r.on}`}}));
  added += day.add(rem).length;
  return {added, from, to: last};
}
