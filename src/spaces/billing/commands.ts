// Agent commands for billing (MCP-facing names, called through window.workshop.execute).
import {invoices, invTotals, invState, reminders, fromEstimateId, cryptoAmount, type Invoice} from './store';
import {profile, hasPayment} from './profile';
import {plan, PLANS} from './plan';
import {checkAddress, paymentUri, NETWORKS} from './evm';
import {invoicePdf, invoiceFileName} from './pdf';
import {downloadInvoice, askAgentToSend, coverLetter, subjectOf} from './share';
import {nativeRooms} from '../personal/native-clouds-state';
import {ingest} from '../intake/store';

export const BILLING_COMMANDS = [
  'billing.profile.get', 'billing.profile.set', 'billing.wallet.check', 'billing.plan',
  'invoice.list', 'invoice.create', 'invoice.from_estimate', 'invoice.read', 'invoice.patch', 'invoice.status', 'invoice.export', 'invoice.send', 'invoice.reminders', 'invoice.open', 'invoice.remove',
];
const show = (view?: string) => { try { nativeRooms.open('garage'); nativeRooms.select('billing'); } catch { /* */ } if (view) setTimeout(() => window.dispatchEvent(new CustomEvent('billing:ui', {detail: {view}})), 30); };
const need = (id: string) => { const i = invoices.get(id); if (!i) throw new Error('INVOICE_NOT_FOUND'); return i; };
const lean = (i: Invoice) => ({...i, totals: invTotals(i), state: invState(i), cryptoAmount: cryptoAmount(i)});
const toDataUrl = (b: Blob) => new Promise<string>(r => { const f = new FileReader(); f.onload = () => r(String(f.result)); f.readAsDataURL(b); });

export async function executeBilling(id: string, a: any = {}) {
  switch (id) {
    case 'billing.profile.get': { const p = profile.get(); return {...p, logo: p.logo ? '(set)' : null, ready: !!p.name && hasPayment(p)}; }
    case 'billing.profile.set': { if (a.ifEmpty && profile.get().name) { if (a.open !== false) show('profile'); return {skipped: 'profile already filled', name: profile.get().name}; } const p = {...a}; delete p.open; delete p.ifEmpty; const r = profile.set(p); if (a.open !== false) show('profile'); return {...r, logo: r.logo ? '(set)' : null}; }
    case 'billing.wallet.check': { const c = checkAddress(a.address || ''); return c.ok ? {ok: true, address: c.address, uri: paymentUri({address: c.address, network: a.network || 'base', token: a.token || 'USDC', amount: a.amount ?? null}), networks: Object.keys(NETWORKS)} : c; }
    case 'billing.plan': return a.set ? plan.set(a.set) : {plan: plan.id(), ...plan.get(), all: PLANS};
    case 'invoice.list': return {invoices: invoices.list().map(i => ({id: i.id, kind: i.kind, number: i.number, client: i.client.name, title: i.title, total: invTotals(i).total, currency: i.currency, state: invState(i), dueDate: i.dueDate})), reminders: reminders()};
    case 'invoice.create': { const i = invoices.create({...a, by: 'agent'}); if (a.open !== false) show('doc'); return lean(i); }
    case 'invoice.from_estimate': { const extra = {...a}; delete extra.estimateId; delete extra.kind; delete extra.open; const i = fromEstimateId(a.estimateId, a.kind === 'quote' ? 'quote' : 'invoice', {...extra, by: 'agent'}); if (a.open !== false) show('doc'); return lean(i); }
    case 'invoice.read': { const i = need(a.invoiceId); return {...lean(i), coverLetter: coverLetter(i), subject: subjectOf(i)}; }
    case 'invoice.patch': { const p = {...a}; delete p.invoiceId; return lean(invoices.patch(a.invoiceId, p, 'agent edit')); }
    case 'invoice.status': {
      if (a.status === 'reminded') { const r = reminders().find(x => x.invoiceId === a.invoiceId); return lean(invoices.patch(a.invoiceId, {}, 'reminded ' + (r?.on || new Date().toISOString().slice(0, 10)))); }
      if (!['draft', 'sent', 'paid', 'void'].includes(a.status)) throw new Error('BAD_STATUS');
      return lean(invoices.setStatus(a.invoiceId, a.status, a.via || 'agent'));
    }
    case 'invoice.export': {
      const i = need(a.invoiceId);
      if (a.as === 'download') return downloadInvoice(i.id);
      const blob = await invoicePdf(i);
      if (a.as === 'inbox') { const asset = await ingest(blob, {name: invoiceFileName(i), by: 'agent', source: 'Billing'}); return {assetId: asset.id, name: invoiceFileName(i)}; }
      return {name: invoiceFileName(i), size: blob.size, dataUrl: await toDataUrl(blob)};
    }
    case 'invoice.send': return askAgentToSend(a.invoiceId, a.what === 'remind' ? 'remind' : 'send', a.after || 0);
    case 'invoice.reminders': return {today: reminders().filter(r => r.due), upcoming: reminders().filter(r => !r.due)};
    case 'invoice.open': show(a.invoiceId ? 'doc' : a.view); if (a.invoiceId) invoices.select(a.invoiceId); return {opened: a.invoiceId || a.view || 'billing'};
    case 'invoice.remove': return invoices.remove(a.invoiceId);
  }
  throw new Error('COMMAND_NOT_INCLUDED');
}
