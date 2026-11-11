// "Forwarding": getting the finished document to the other person.
// Phone share sheet when available, otherwise download + a prepared e-mail; or ask the agent to send it.
import {communication} from '../communication/store';
import {invoices, invTotals, reminderText, type Invoice} from './store';
import {invoicePdf, invoiceFileName} from './pdf';
import {profile} from './profile';
import {docs} from '../docs/registry';

export function downloadBlob(blob: Blob, name: string) {
  const u = URL.createObjectURL(blob); const a = document.createElement('a'); a.href = u; a.download = name; document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(u), 4000);
}
/** Returns 'shared' | 'downloaded' | 'cancelled'. */
export async function shareFile(blob: Blob, name: string, text = ''): Promise<'shared' | 'downloaded' | 'cancelled'> {
  const file = new File([blob], name, {type: blob.type || 'application/octet-stream'});
  const nav = navigator as any;
  if (nav.canShare?.({files: [file]})) {
    try { await nav.share({files: [file], title: name, text}); return 'shared'; }
    catch (e: any) { if (e?.name === 'AbortError') return 'cancelled'; }
  }
  downloadBlob(blob, name); return 'downloaded';
}
export const mailto = (to: string, subject: string, body: string) => `mailto:${encodeURIComponent(to || '')}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;

export function coverLetter(i: Invoice) {
  const t = invTotals(i).total; const p = profile.get(); const m = t.toLocaleString('en-US', {minimumFractionDigits: 2}) + ' ' + i.currency;
  const due = new Date(i.dueDate + 'T12:00:00').toLocaleDateString(i.lang === 'ru' ? 'ru-RU' : 'en-US', {month: 'long', day: 'numeric'});
  if (i.lang === 'ru') return i.kind === 'quote'
    ? `Здравствуйте${i.client.name ? ', ' + i.client.name : ''}!\n\nВо вложении коммерческое предложение ${i.number}${i.title ? ' «' + i.title + '»' : ''} на ${m}. Оно действует до ${due}.\n\nЕсли всё подходит, ответьте на это письмо, и я пришлю счёт.\n\n${p.name}`
    : `Здравствуйте${i.client.name ? ', ' + i.client.name : ''}!\n\nВо вложении счёт ${i.number}${i.title ? ' «' + i.title + '»' : ''} на ${m}. Срок оплаты: ${due}. Оплатить можно по QR-коду в счёте.\n\nСпасибо!\n${p.name}`;
  return i.kind === 'quote'
    ? `Hi${i.client.name ? ' ' + i.client.name : ''},\n\nPlease find attached quote ${i.number}${i.title ? ' for ' + i.title : ''}: ${m}, valid until ${due}.\n\nIf it works for you, just reply and I'll send the invoice.\n\nBest,\n${p.name}`
    : `Hi${i.client.name ? ' ' + i.client.name : ''},\n\nPlease find attached invoice ${i.number}${i.title ? ' for ' + i.title : ''}: ${m}, due ${due}. You can pay with the QR codes on the invoice.\n\nThank you!\n${p.name}`;
}
export const subjectOf = (i: Invoice) => i.lang === 'ru' ? `${i.kind === 'quote' ? 'Предложение' : 'Счёт'} ${i.number}${i.title ? ' · ' + i.title : ''}` : `${i.kind === 'quote' ? 'Quote' : 'Invoice'} ${i.number}${i.title ? ' · ' + i.title : ''}`;

// Every invoice that leaves the portal is an issued, numbered version (INV-…, INV-…-v2 after changes).
export async function shareInvoice(id: string) {
  const i = invoices.get(id); if (!i) throw new Error('INVOICE_NOT_FOUND');
  const d = await docs.issue('invoice', {invoiceId: id});
  const res = await shareFile(await docs.pdf(d.id), invoiceFileName(i).replace(i.number, d.number), coverLetter(i));
  if (res === 'shared') { docs.markSent(d.id, [i.client.name || '—'], 'share'); if (i.status === 'draft') invoices.setStatus(id, 'sent', 'share'); }
  return res;
}
export async function downloadInvoice(id: string) { const i = invoices.get(id); if (!i) throw new Error('INVOICE_NOT_FOUND'); const d = await docs.issue('invoice', {invoiceId: id}); const name = invoiceFileName(i).replace(i.number, d.number); downloadBlob(await docs.pdf(d.id), name); return {downloaded: name, number: d.number}; }

/** The agent sends it from the person's own mailbox (Gmail/Outlook connector on the phone). */
export function askAgentToSend(id: string, what: 'send' | 'remind' = 'send', after = 0) {
  const i = invoices.get(id); if (!i) throw new Error('INVOICE_NOT_FOUND');
  void docs.issue('invoice', {invoiceId: id}, {by: 'agent'}).then(d => docs.markSent(d.id, [i.client.email || i.client.name || '—'], 'agent')).catch(() => {});
  const body = what === 'send' ? coverLetter(i) : reminderText(i, after);
  const text = `${what === 'send' ? '✉ Отправь' : '⏰ Напомни об оплате'}: ${i.number} → ${i.client.email || i.client.name || '?'}\n` +
    `[invoice.read {invoiceId:"${i.id}"}] [invoice.export {invoiceId:"${i.id}", as:"dataUrl"}]\n` +
    `Тема: ${subjectOf(i)}\n\n${body}\n\nПосле отправки: invoice.status {invoiceId:"${i.id}", status:"${what === 'send' ? 'sent' : 'reminded'}"}`;
  try { communication.add({text, role: 'user', contact: 'agent', source: 'Billing', kind: 'info', key: 'invoice/' + i.id + '/' + what + '/' + Date.now()} as any); } catch { /* dock optional */ }
  invoices.patch(id, {}, what === 'send' ? 'asked agent to send' : 'asked agent to remind');
  return {invoiceId: id, queued: what, to: i.client.email || null, subject: subjectOf(i), body};
}
