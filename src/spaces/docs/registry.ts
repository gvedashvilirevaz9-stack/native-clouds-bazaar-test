// Document registry: every document that leaves the portal gets a number and a version.
// A change in the source (day plan, estimate, invoice) → a NEW number (…-v2) with "what changed",
// marks on changed lines and a list of removed ones. Old versions stay; sending is recorded.
import {useSyncExternalStore} from 'react';
import {putBlob, getBlob} from '../garage/store';
import {day, type DayEntry} from '../day/store';
import {estimates, lineTotal, totals as esTotals, type Estimate} from '../estimate/store';
import {invoices, invTotals, type Invoice} from '../billing/store';

export type DocKind = 'day' | 'estimate' | 'invoice';
export type Mark = 'new' | 'changed';
export type VersionInfo = {number: string; version: number; issuedAt: number; prev?: {number: string; issuedAt: number} | null; changes: string[]; marks: Record<string, Mark>; removed: string[]; note?: string};
export type Sent = {to: string; via: 'share' | 'mail' | 'agent' | 'download'; at: number; format?: 'jpg' | 'pdf'};
export type DocRecord = VersionInfo & {
  id: string; kind: DocKind; series: string; key: string; title: string;
  source: {estimateId?: string; invoiceId?: string; date?: string; forWhom?: string | null};
  snapshot: any; pdf: string; size: number; jpg?: string; by: 'human' | 'agent'; sent: Sent[];
};
export type Contact = {name: string; email?: string; phone?: string};

const KEY = 'sunrise.docs.v1', CKEY = 'sunrise.docs.contacts.v1', NKEY = 'sunrise.docs.counter.v1';
const subs = new Set<() => void>(); let rev = 0; let cache: DocRecord[] | null = null;
const load = (): DocRecord[] => { if (cache) return cache; try { const v = JSON.parse(localStorage.getItem(KEY) || '[]'); cache = Array.isArray(v) ? v : []; } catch { cache = []; } return cache!; };
const save = (l: DocRecord[]) => { cache = l.slice(-1000); rev++; try { localStorage.setItem(KEY, JSON.stringify(cache)); } catch { /* */ } subs.forEach(f => f()); };
const uid = () => 'doc-' + Math.random().toString(36).slice(2, 9);
const PREFIX: Record<DocKind, string> = {day: 'D', estimate: 'E', invoice: 'INV'};

// ---------- identity, snapshot, diff per kind ----------
export const keyOf = (kind: DocKind, s: DocRecord['source']) => kind === 'day' ? `day:${s.date}:${s.forWhom || '*'}` : kind === 'estimate' ? `est:${s.estimateId}` : `inv:${s.invoiceId}`;
const r2 = (v: number) => Math.round(v * 100) / 100;
function snapshot(kind: DocKind, s: DocRecord['source']): {title: string; data: any} {
  if (kind === 'day') {
    const list = day.list(s.date!, s.forWhom ?? null);
    return {title: `План ${s.date}${s.forWhom ? ' · ' + s.forWhom : ''}`, data: list.map((e: DayEntry) => ({id: e.id, label: e.title, time: e.time || '', end: e.end || '', place: e.place || '', who: e.who || '', amount: e.amount || 0, why: e.why || '', buy: (e.buy || []).join(', '), phone: e.phone || ''}))};
  }
  if (kind === 'estimate') {
    const e = estimates.get(s.estimateId); if (!e) throw new Error('ESTIMATE_NOT_FOUND');
    return {title: e.title, data: {total: esTotals(e).sum, items: e.items.map(i => ({id: i.id, label: i.name, qty: i.qty, unitPrice: i.unitPrice, total: lineTotal(i), status: i.status || '', due: i.due || '', schedule: i.schedule || '', place: i.place || '', who: i.who || ''}))}};
  }
  const i = invoices.get(s.invoiceId); if (!i) throw new Error('INVOICE_NOT_FOUND');
  return {title: `${i.number}${i.client.name ? ' · ' + i.client.name : ''}`, data: {total: invTotals(i).total, due: i.dueDate, client: i.client.name, paid: i.status === 'paid', items: i.lines.map(l => ({id: l.id, label: l.name, qty: l.qty, unitPrice: l.unitPrice}))}};
}
const FIELD_EN: Record<string, string> = {time: 'time', end: 'end', place: 'place', who: 'who', amount: 'amount', why: 'why', buy: 'buy', phone: 'phone', qty: 'qty', unitPrice: 'price', total: 'amount', status: 'status', due: 'due', schedule: 'schedule', label: 'name'};
const FIELD_RU: Record<string, string> = {time: 'время', end: 'конец', place: 'место', who: 'кто', amount: 'сумма', why: 'зачем', buy: 'купить', phone: 'телефон', qty: 'кол-во', unitPrice: 'цена', total: 'сумма', status: 'статус', due: 'срок', schedule: 'расписание', label: 'название'};
const show = (v: unknown) => v === '' || v == null ? '—' : String(v);
function diff(kind: DocKind, prev: any, next: any, en = false): {changes: string[]; marks: Record<string, Mark>; removed: string[]} {
  const F = en ? FIELD_EN : FIELD_RU; const W = en ? {nw: 'New', at: 'at', off: 'Cancelled', tot: 'Total', due: 'Due date', cl: 'Client', paid: 'Paid'} : {nw: 'Новое', at: 'в', off: 'Отменено', tot: 'Итог', due: 'Срок оплаты', cl: 'Клиент', paid: 'Оплачено'};
  const pl: any[] = kind === 'day' ? prev : prev.items; const nl: any[] = kind === 'day' ? next : next.items;
  const changes: string[] = []; const marks: Record<string, Mark> = {}; const removed: string[] = [];
  const pm = new Map(pl.map(x => [x.id, x]));
  for (const x of nl) {
    const o = pm.get(x.id);
    if (!o) { marks[x.id] = 'new'; changes.push(`${W.nw}: ${x.label}${x.time ? ` ${W.at} ` + x.time : ''}`); continue; }
    const f = Object.keys(x).filter(k => k !== 'id' && String(x[k]) !== String(o[k]));
    if (f.length) { marks[x.id] = 'changed'; changes.push(`${f.includes('label') ? `${o.label} → ${x.label}` : x.label}: ` + f.filter(k => k !== 'label').map(k => `${F[k] || k} ${show(o[k])} → ${show(x[k])}`).join(', ')); }
  }
  for (const o of pl) if (!nl.some(x => x.id === o.id)) { removed.push(o.label + (o.time ? ' (' + o.time + ')' : '')); changes.push(`${W.off}: ${o.label}`); }
  if (kind !== 'day' && r2(prev.total) !== r2(next.total)) changes.push(`${W.tot}: ${prev.total} → ${next.total}`);
  if (kind === 'invoice') { if (prev.due !== next.due) changes.push(`${W.due}: ${prev.due} → ${next.due}`); if (prev.client !== next.client) changes.push(`${W.cl}: ${prev.client} → ${next.client}`); if (!prev.paid && next.paid) changes.push(W.paid); }
  return {changes: changes.map(c => c.replace(/:\s*$/, '')), marks, removed};
}

// ---------- rendering through the existing PDF builders ----------
async function render(kind: DocKind, s: DocRecord['source'], ver: VersionInfo): Promise<Blob> {
  if (kind === 'day') { const {dayPdf} = await import('../day/pdf'); return dayPdf(s.date!, s.forWhom ?? null, ver); }
  if (kind === 'estimate') { const {estimatePdf} = await import('../estimate/pdf'); return estimatePdf(estimates.get(s.estimateId)!, {ver}); }
  const {invoicePdf} = await import('../billing/pdf'); return invoicePdf(invoices.get(s.invoiceId)!, ver);
}
function nextSeries(kind: DocKind, s: DocRecord['source']) {
  if (kind === 'invoice') return invoices.get(s.invoiceId)!.number;
  let n = 1; try { const c = JSON.parse(localStorage.getItem(NKEY) || '{}'); n = (c[kind] || 0) + 1; c[kind] = n; localStorage.setItem(NKEY, JSON.stringify(c)); } catch { /* */ }
  return `${PREFIX[kind]}-${new Date().getFullYear()}-${String(n).padStart(4, '0')}`;
}
const isEn = (kind: DocKind, s: DocRecord['source']) => kind === 'invoice' && invoices.get(s.invoiceId)?.lang === 'en';
const numberOf = (kind: DocKind, series: string, v: number) => kind === 'invoice' && v === 1 ? series : `${series}-v${v}`;

export const docs = {
  all: () => load(),
  history: (kind: DocKind, s: DocRecord['source']) => load().filter(d => d.key === keyOf(kind, s)).sort((a, b) => b.version - a.version),
  latest: (kind: DocKind, s: DocRecord['source']) => docs.history(kind, s)[0] || null,
  get: (id: string) => load().find(d => d.id === id) || null,
  subscribe(f: () => void) { subs.add(f); return () => { subs.delete(f); }; },
  revision: () => rev,
  /** Is the source different from its last issued version? */
  pending(kind: DocKind, s: DocRecord['source']) {
    const last = docs.latest(kind, s); if (!last) return {issued: false, changes: [] as string[]};
    try { const d = diff(kind, last.snapshot, snapshot(kind, s).data, isEn(kind, s)); return {issued: true, changes: d.changes}; } catch { return {issued: true, changes: []}; }
  },
  /** Issue the document: the same number when nothing changed, a new version (new number) when it did. */
  async issue(kind: DocKind, s: DocRecord['source'], o: {note?: string; by?: 'human' | 'agent'; force?: boolean} = {}): Promise<DocRecord & {unchanged?: boolean}> {
    const snap = snapshot(kind, s); const last = docs.latest(kind, s);
    const d = last ? diff(kind, last.snapshot, snap.data, isEn(kind, s)) : {changes: [], marks: {}, removed: []};
    if (last && !d.changes.length && !o.force && !o.note) return {...last, unchanged: true};
    const version = last ? last.version + 1 : 1; const series = last?.series || nextSeries(kind, s);
    const ver: VersionInfo = {number: numberOf(kind, series, version), version, issuedAt: Date.now(), prev: last ? {number: last.number, issuedAt: last.issuedAt} : null, changes: d.changes, marks: d.marks, removed: d.removed, note: o.note?.slice(0, 400)};
    const blob = await render(kind, s, ver);
    const rec: DocRecord = {...ver, id: uid(), kind, series, key: keyOf(kind, s), title: snap.title, source: s, snapshot: snap.data, pdf: await putBlob(blob), size: blob.size, by: o.by || 'human', sent: []};
    save([...load(), rec]); return rec;
  },
  async pdf(id: string) { const d = docs.get(id); if (!d) throw new Error('DOC_NOT_FOUND'); const b = await getBlob(d.pdf); if (!b) throw new Error('DOC_PDF_MISSING'); return new Blob([b], {type: 'application/pdf'}); },
  /** The same version as one tall JPEG for messengers (made once, then kept). */
  async image(id: string) {
    const d = docs.get(id); if (!d) throw new Error('DOC_NOT_FOUND');
    if (d.jpg) { const b = await getBlob(d.jpg); if (b) return new Blob([b], {type: 'image/jpeg'}); }
    const {pdfToJpeg} = await import('./image'); const jpg = await pdfToJpeg(await docs.pdf(id), d.kind === 'day' ? 1080 : 1240);
    const ref = await putBlob(jpg); const l = load().slice(); const i = l.findIndex(x => x.id === id); if (i >= 0) { l[i] = {...l[i], jpg: ref}; save(l); }
    return jpg;
  },
  file: (id: string, f: 'jpg' | 'pdf') => f === 'jpg' ? docs.image(id) : docs.pdf(id),
  fileName: (d: DocRecord, f: 'jpg' | 'pdf' = 'pdf') => `${d.number} ${d.title.replace(/[\\/:*?"<>|]/g, '').slice(0, 50)}.${f}`,
  markSent(id: string, to: string[], via: Sent['via'], format?: 'jpg' | 'pdf') { const l = load().slice(); const i = l.findIndex(d => d.id === id); if (i < 0) throw new Error('DOC_NOT_FOUND'); l[i] = {...l[i], sent: [...l[i].sent, ...to.map(t => ({to: t, via, at: Date.now(), format}))]}; save(l); return l[i]; },
  clear() { save([]); try { localStorage.removeItem(NKEY); } catch { /* */ } },
};
export function useDocs() { useSyncExternalStore(docs.subscribe, docs.revision); return load(); }

// ---------- people to send to (family / clients) ----------
export const contacts = {
  list(): Contact[] { try { const v = JSON.parse(localStorage.getItem(CKEY) || '[]'); return Array.isArray(v) ? v : []; } catch { return []; } },
  set(list: Contact[]) { const clean = list.filter(c => c.name?.trim()).map(c => ({name: c.name.trim().slice(0, 40), email: c.email?.trim() || undefined, phone: c.phone?.trim() || undefined})); try { localStorage.setItem(CKEY, JSON.stringify(clean)); } catch { /* */ } rev++; subs.forEach(f => f()); return clean; },
  add(c: Contact) { return contacts.set([...contacts.list().filter(x => x.name !== c.name), c]); },
  find: (name: string) => contacts.list().find(c => c.name.toLowerCase() === name.toLowerCase()) || null,
};
export const sourceOf = {day: (date: string, forWhom: string | null) => ({date, forWhom}), estimate: (id: string) => ({estimateId: id}), invoice: (id: string) => ({invoiceId: id})};
