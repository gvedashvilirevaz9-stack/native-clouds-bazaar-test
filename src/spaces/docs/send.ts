// Sending a numbered document to people, and recording who got which version.
import {docs, contacts, type DocKind, type DocRecord} from './registry';
import {shareFile, downloadBlob, mailto} from '../billing/share';
import {communication} from '../communication/store';
import {invoices} from '../billing/store';
import {formatPref, type DocFormat} from './image';

export function messageFor(d: DocRecord) {
  const head = d.kind === 'day' ? `План ${d.title.replace(/^План\s*/, '')}` : d.kind === 'estimate' ? `Смета «${d.title}»` : `Счёт ${d.title}`;
  if (!d.prev) return `${head}\n№ ${d.number}`;
  return `${head} — НОВАЯ ВЕРСИЯ\n№ ${d.number} (вместо ${d.prev.number})${d.note ? '\n' + d.note : ''}\nЧто изменилось:\n${d.changes.slice(0, 10).map(c => '• ' + c).join('\n')}`;
}
/** to: contact names (or free text). via: share sheet / e-mail / the agent forwards it. */
export async function sendDoc(id: string, to: string[], via: 'share' | 'mail' | 'agent' | 'download', format?: DocFormat) {
  const d = docs.get(id); if (!d) throw new Error('DOC_NOT_FOUND');
  const f: DocFormat = format || formatPref.get(d.kind); const file = () => docs.file(id, f); const name = docs.fileName(d, f);
  const text = messageFor(d);
  // An invoice's client is a known recipient even when not saved as a contact.
  const client = d.kind === 'invoice' ? invoices.get(d.source.invoiceId)?.client : null;
  const people = to.map(n => contacts.find(n) || (client && client.name === n ? {name: n, email: client.email, phone: client.phone} : {name: n}));
  if (via === 'download') { downloadBlob(await file(), name); return docs.markSent(id, to.length ? to : ['—'], 'download', f); }
  if (via === 'share') { const r = await shareFile(await file(), name, text); if (r === 'cancelled') return d; return docs.markSent(id, to.length ? to : ['—'], 'share', f); }
  if (via === 'mail') {
    // A mailto link cannot carry the attachment, so the PDF is downloaded next to it.
    // E-mail carries both: the picture to look at, the PDF to print or keep.
    downloadBlob(await docs.image(id), docs.fileName(d, 'jpg')); downloadBlob(await docs.pdf(id), docs.fileName(d, 'pdf'));
    const emails = people.map(p => (p as any).email).filter(Boolean).join(',');
    location.href = mailto(emails, `${d.number} · ${d.title}`, text + '\n\nВо вложении: картинка (открыть на телефоне) и PDF (печать).');
    return docs.markSent(id, to, 'mail');
  }
  // Per person: e-mail → both files; messenger/phone → only the chosen format.
  const who = people.map((p: any) => `${p.name}: ${p.email ? `почта ${p.email} → JPG + PDF` : p.phone ? `мессенджер ${p.phone} → ${f === 'jpg' ? 'картинка JPG' : 'PDF'}` : `→ ${f === 'jpg' ? 'картинка JPG' : 'PDF'}`}`).join('\n');
  try { communication.add({text: `📤 Перешли ${d.number}\n${who}\n[docs.get {docId:"${d.id}", as:"dataUrl", format:"jpg"}] [docs.get {docId:"${d.id}", as:"dataUrl", format:"pdf"}]\nТекст:\n${text}\nПосле отправки: docs.sent {docId:"${d.id}", to:${JSON.stringify(to)}, via:"agent"}`, role: 'user', contact: 'agent', source: 'Docs', kind: 'info', key: 'doc/' + d.id + '/' + Date.now()} as any); } catch { /* dock optional */ }
  return docs.markSent(id, to, 'agent', f);
}
/** One step for the agent: issue the current state (new number if changed) and forward it. */
export async function reissueAndSend(kind: DocKind, source: DocRecord['source'], to: string[], via: 'share' | 'mail' | 'agent' | 'download' = 'agent', o: {note?: string; by?: 'human' | 'agent'; format?: DocFormat} = {}) {
  const d = await docs.issue(kind, source, o);
  const sent = to.length ? await sendDoc(d.id, to, via, o.format) : d;
  return {docId: d.id, number: d.number, version: d.version, format: o.format || formatPref.get(kind), unchanged: !!(d as any).unchanged, changes: d.changes, sentTo: to, sent: (sent as DocRecord).sent};
}
