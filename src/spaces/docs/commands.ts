// Agent commands for numbered documents: issue a version, forward it, read history.
import {docs, contacts, type DocKind, type DocRecord} from './registry';
import {sendDoc, reissueAndSend, messageFor} from './send';
import {downloadBlob} from '../billing/share';

export const DOC_COMMANDS = ['docs.list', 'docs.issue', 'docs.send', 'docs.reissue_send', 'docs.get', 'docs.sent', 'docs.contacts'];
const src = (a: any): DocRecord['source'] => a.kind === 'day' ? {date: a.date, forWhom: a.forWhom ?? null} : a.kind === 'estimate' ? {estimateId: a.estimateId} : {invoiceId: a.invoiceId};
const lean = (d: DocRecord) => { const x: any = {...d}; delete x.snapshot; return x; };
const toDataUrl = (b: Blob) => new Promise<string>(r => { const f = new FileReader(); f.onload = () => r(String(f.result)); f.readAsDataURL(b); });

export async function executeDocs(id: string, a: any = {}) {
  switch (id) {
    case 'docs.list': return {docs: (a.kind ? docs.history(a.kind as DocKind, src(a)) : docs.all().slice().reverse()).map(lean), ...(a.kind ? {pending: docs.pending(a.kind, src(a))} : {})};
    case 'docs.issue': return lean(await docs.issue(a.kind, src(a), {note: a.note, by: 'agent', force: !!a.force}));
    case 'docs.send': return lean(await sendDoc(a.docId, a.to || [], a.via || 'agent', a.format));
    case 'docs.reissue_send': return reissueAndSend(a.kind, src(a), a.to || [], a.via || 'agent', {note: a.note, by: 'agent', format: a.format});
    case 'docs.get': { const d = docs.get(a.docId); if (!d) throw new Error('DOC_NOT_FOUND'); const f = a.format === 'jpg' ? 'jpg' : 'pdf'; const b = await docs.file(d.id, f); const name = docs.fileName(d, f); if (a.as === 'download') { downloadBlob(b, name); return {downloaded: name}; } return {...lean(d), message: messageFor(d), name, format: f, size: b.size, ...(a.as === 'dataUrl' ? {dataUrl: await toDataUrl(b)} : {})}; }
    case 'docs.sent': return lean(docs.markSent(a.docId, a.to || [], a.via || 'agent'));
    case 'docs.contacts': return {contacts: a.set ? contacts.set(a.set) : a.add ? contacts.add(a.add) : contacts.list()};
  }
  throw new Error('COMMAND_NOT_INCLUDED');
}
