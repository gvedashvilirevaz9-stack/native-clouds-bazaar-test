// Quotes and invoices: the last step of "estimate → document → paid".
// The portal owns numbering, totals, due dates, statuses and reminder dates; the agent can
// fill items, write cover letters and send mail through its own connectors.
import {useSyncExternalStore} from 'react';
import {profile, type DocLang} from './profile';
import {estimates, lineTotal, type Estimate} from '../estimate/store';

export const INVOICE_KEY = 'sunrise.billing.invoices.v1';
export type DocKind = 'invoice' | 'quote';
export type InvStatus = 'draft' | 'sent' | 'paid' | 'void';
export type InvLine = {id: string; name: string; qty: number; unit: string; unitPrice: number; note?: string};
export type Client = {name: string; email?: string; phone?: string; address?: string};
export type Invoice = {
  id: string; kind: DocKind; number: string; title?: string;
  client: Client; issueDate: string; dueDate: string; currency: string; lang: DocLang;
  lines: InvLine[]; taxRate: number; discount: number; notes?: string;
  status: InvStatus; sentAt?: number; paidAt?: number; paidVia?: string;
  /** Overrides the profile's crypto amount when the invoice currency is not a stablecoin's. */
  cryptoAmount?: number | null;
  estimateId?: string | null; by: 'human' | 'agent'; at: number; updatedAt: number;
  log: {at: number; text: string}[];
};

const subs = new Set<() => void>(); let rev = 0; let cache: Invoice[] | null = null; let selected: string | null = null;
function load(): Invoice[] { if (cache) return cache; try { const v = JSON.parse(localStorage.getItem(INVOICE_KEY) || '[]'); cache = Array.isArray(v) ? v : []; } catch { cache = []; } return cache!; }
function save(l: Invoice[]) { cache = l.slice(0, 500); rev++; try { localStorage.setItem(INVOICE_KEY, JSON.stringify(cache)); } catch { /* */ } subs.forEach(f => f()); }
const uid = (p: string) => p + Math.random().toString(36).slice(2, 9);
export const iso = (d: Date | number) => { const x = new Date(d); return `${x.getFullYear()}-${String(x.getMonth() + 1).padStart(2, '0')}-${String(x.getDate()).padStart(2, '0')}`; };
const addDays = (s: string, n: number) => { const d = new Date(s + 'T12:00:00'); d.setDate(d.getDate() + n); return iso(d); };
const num = (v: unknown, d = 0) => { const n = typeof v === 'number' ? v : parseFloat(String(v ?? '').replace(/\s/g, '').replace(',', '.')); return Number.isFinite(n) ? n : d; };
const normLine = (x: Partial<InvLine>): InvLine => ({id: x.id || uid('ln-'), name: String(x.name || 'Item').slice(0, 200), qty: num(x.qty, 1), unit: String(x.unit || '').slice(0, 20), unitPrice: num(x.unitPrice), note: x.note ? String(x.note).slice(0, 300) : undefined});

export const invoices = {
  list: () => load(),
  get: (id?: string | null) => load().find(i => i.id === id) || null,
  subscribe(f: () => void) { subs.add(f); return () => { subs.delete(f); }; },
  revision: () => rev,
  selected: () => selected,
  select(id: string | null) { selected = id; rev++; subs.forEach(f => f()); },
  create(p: Partial<Invoice> & {kind?: DocKind}): Invoice {
    const pr = profile.get(); const kind: DocKind = p.kind === 'quote' ? 'quote' : 'invoice';
    const issue = p.issueDate || iso(Date.now()); const now = Date.now();
    const inv: Invoice = {id: uid('inv-'), kind, number: p.number || profile.take(kind), title: p.title, client: {name: '', ...(p.client || {})},
      issueDate: issue, dueDate: p.dueDate || addDays(issue, kind === 'quote' ? 30 : pr.termsDays || 14), currency: (p.currency || pr.currency || 'USD').toUpperCase(),
      lang: p.lang || pr.docLang || 'en', lines: (p.lines || []).map(normLine), taxRate: num(p.taxRate), discount: num(p.discount), notes: p.notes,
      status: 'draft', cryptoAmount: p.cryptoAmount ?? null, estimateId: p.estimateId || null, by: p.by || 'human', at: now, updatedAt: now, log: [{at: now, text: 'created'}]};
    save([inv, ...load()]); selected = inv.id; return inv;
  },
  patch(id: string, p: Partial<Invoice>, note?: string) {
    const l = load(); const i = l.findIndex(x => x.id === id); if (i < 0) throw new Error('INVOICE_NOT_FOUND');
    const next: Invoice = {...l[i], ...p, updatedAt: Date.now()};
    if (p.lines) next.lines = p.lines.map(normLine);
    if (p.client) next.client = {...l[i].client, ...p.client};
    if (note) next.log = [...(l[i].log || []), {at: Date.now(), text: note}].slice(-40);
    const c = l.slice(); c[i] = next; save(c); return next;
  },
  setStatus(id: string, status: InvStatus, via?: string) {
    const p: Partial<Invoice> = {status};
    if (status === 'sent') p.sentAt = Date.now();
    if (status === 'paid') { p.paidAt = Date.now(); p.paidVia = via; }
    return invoices.patch(id, p, status + (via ? ' · ' + via : ''));
  },
  remove(id: string) { save(load().filter(i => i.id !== id)); if (selected === id) selected = null; return {removed: id}; },
  clear() { save([]); selected = null; },
};
export function useInvoices() { useSyncExternalStore(invoices.subscribe, invoices.revision); return load(); }

// ---------- money the portal owns ----------
export const lineSum = (l: InvLine) => Math.round(l.qty * l.unitPrice * 100) / 100;
export function invTotals(i: Invoice) {
  const sub = Math.round(i.lines.reduce((s, l) => s + lineSum(l), 0) * 100) / 100;
  const disc = Math.min(sub, Math.max(0, i.discount || 0));
  const tax = Math.round((sub - disc) * (i.taxRate || 0)) / 100;
  return {sub, disc, tax, total: Math.round((sub - disc + tax) * 100) / 100};
}
/** What the person sees: draft / sent / overdue N days / paid. */
export function invState(i: Invoice, now = Date.now()) {
  if (i.status !== 'sent') return {key: i.status, days: 0};
  const days = Math.floor((now - new Date(i.dueDate + 'T23:59:59').getTime()) / 864e5) + 1;
  return days > 0 && i.kind === 'invoice' ? {key: 'overdue' as const, days} : {key: 'sent' as const, days: 0};
}
/** Stablecoins are paid 1:1 in USD; other currencies need an explicit crypto amount. */
export function cryptoAmount(i: Invoice) {
  const t = invTotals(i).total; const tok = profile.get().evm?.token;
  if (i.cryptoAmount) return i.cryptoAmount;
  if ((tok === 'USDC' || tok === 'USDT') && i.currency === 'USD') return t;
  return null;
}

/** Reminders fall on due date + profile.reminderDays for sent, unpaid invoices. */
export function reminders(now = Date.now()) {
  const days = profile.get().reminderDays || [0, 7, 14]; const today = iso(now);
  const out: {invoiceId: string; number: string; client: string; on: string; due: boolean; overdueDays: number; total: number; currency: string; text: string}[] = [];
  for (const i of load()) {
    if (i.kind !== 'invoice' || i.status !== 'sent') continue;
    const st = invState(i, now);
    for (const d of days) {
      const on = addDays(i.dueDate, d);
      const done = (i.log || []).some(x => x.text === 'reminded ' + on);
      if (done) continue;
      // A reminder sent late speaks about the real delay, not the planned one.
      out.push({invoiceId: i.id, number: i.number, client: i.client.name, on, due: on <= today, overdueDays: st.days, total: invTotals(i).total, currency: i.currency, text: reminderText(i, on < today ? Math.max(d, st.days) : d)});
      break;   // only the next one per invoice
    }
  }
  return out.sort((a, b) => a.on.localeCompare(b.on));
}
export function reminderText(i: Invoice, after: number) {
  const t = invTotals(i).total; const p = profile.get(); const m = t.toLocaleString('en-US', {minimumFractionDigits: 2}) + ' ' + i.currency;
  if (i.lang === 'ru') return after <= 0
    ? `Здравствуйте${i.client.name ? ', ' + i.client.name : ''}! Напоминаю, что сегодня срок оплаты по счёту ${i.number} на ${m}. Счёт с QR-кодом во вложении. Спасибо!${p.name ? '\n' + p.name : ''}`
    : `Здравствуйте${i.client.name ? ', ' + i.client.name : ''}! Счёт ${i.number} на ${m} просрочен на ${after} дн. Если уже оплатили — спасибо, просто ответьте на письмо. Счёт во вложении.${p.name ? '\n' + p.name : ''}`;
  return after <= 0
    ? `Hi${i.client.name ? ' ' + i.client.name : ''}, a friendly reminder that invoice ${i.number} for ${m} is due today. The invoice with payment QR codes is attached. Thank you!${p.name ? '\n' + p.name : ''}`
    : `Hi${i.client.name ? ' ' + i.client.name : ''}, invoice ${i.number} for ${m} is now ${after} days past due. If you've already paid, thank you, just reply to let me know. The invoice is attached.${p.name ? '\n' + p.name : ''}`;
}

/** Quote or invoice from an estimate: lines to buy become lines to bill. */
export function fromEstimate(e: Estimate, kind: DocKind = 'invoice', extra: Partial<Invoice> = {}) {
  const lines = e.items.filter(x => x.status !== 'have').map(x => {
    const tot = lineTotal(x);
    // Pack prices ("3 bags = 54") become one line so the document matches the estimate total.
    return x.total != null ? {name: x.name, qty: 1, unit: '', unitPrice: tot, note: `${+x.qty.toFixed(3)} ${x.unit}`} : {name: x.name, qty: x.qty, unit: x.unit, unitPrice: x.unitPrice};
  });
  return invoices.create({kind, title: e.title, lines: lines as InvLine[], currency: e.currency, estimateId: e.id, notes: e.assumptions.filter(Boolean).join('\n') || undefined, ...extra});
}
export const fromEstimateId = (id: string, kind: DocKind = 'invoice', extra: Partial<Invoice> = {}) => { const e = estimates.get(id); if (!e) throw new Error('ESTIMATE_NOT_FOUND'); return fromEstimate(e, kind, extra); };
