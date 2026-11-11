// Version bar under any document: current number, "changed since vN → issue vN+1", send to people, history.
import {useState} from 'react';
import {docs, contacts, useDocs, type DocKind, type DocRecord} from './registry';
import {sendDoc} from './send';
import {downloadBlob} from '../billing/share';
import {formatPref, type DocFormat} from './image';
import './docs.css';

const when = (t: number) => new Date(t).toLocaleString('ru-RU', {day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit'});
const VIA: Record<string, string> = {share: '↗', mail: '✉', agent: '📱', download: '⬇'};

export function DocVersions({kind, source, ru, defaultTo = []}: {kind: DocKind; source: DocRecord['source']; ru: boolean; defaultTo?: string[]}) {
  useDocs();
  const hist = docs.history(kind, source); const last = hist[0] || null;
  // Cheap to compute; the parent pane re-renders whenever its data changes.
  const pend = docs.pending(kind, source);
  const [note, setNote] = useState(''); const [open, setOpen] = useState(false); const [to, setTo] = useState<string[]>(defaultTo);
  const [nc, setNc] = useState({name: '', email: '', phone: ''}); const [flash, setFlash] = useState<string | null>(null); const [busy, setBusy] = useState(false);
  const [fmt, setFmtS] = useState<DocFormat>(() => formatPref.get(kind)); const setFmt = (f: DocFormat) => { formatPref.set(kind, f); setFmtS(f); };
  const people = contacts.list();
  const act = async (fn: () => Promise<unknown>, ok: string) => { setBusy(true); try { await fn(); setFlash(ok); } catch (e) { setFlash('⚠ ' + String((e as Error).message || e)); } setBusy(false); setTimeout(() => setFlash(null), 2800); };
  const issue = () => docs.issue(kind, source, {note: note.trim() || undefined}).then(d => { setNote(''); return d; });
  const changed = !last || pend.changes.length > 0;
  return <section className="dv" data-testid="doc-versions">
    <div className="dv-row">
      <span className="dv-no">{last ? <>📄 <b data-testid="dv-number">{last.number}</b> <small>{when(last.issuedAt)}{last.sent.length ? ' · ' + (ru ? 'отправлен: ' : 'sent: ') + [...new Set(last.sent.map(s => s.to))].join(', ') : ''}</small></> : <small>{ru ? 'Документ ещё не выпускался — номер появится при первом PDF или отправке.' : 'Not issued yet: a number appears on first PDF or send.'}</small>}</span>
      <span className="dv-fmt" role="group" aria-label={ru ? 'Формат' : 'Format'}>{(['jpg', 'pdf'] as DocFormat[]).map(f => <button type="button" key={f} aria-pressed={fmt === f} data-testid={'dv-fmt-' + f} title={f === 'jpg' ? (ru ? 'Одна картинка: сразу открывается в мессенджере на весь экран' : 'One picture: opens full-screen in any messenger') : (ru ? 'PDF: для печати, бухгалтерии, почты' : 'PDF: print, accounting, e-mail')} onClick={() => setFmt(f)}>{f === 'jpg' ? (ru ? '🖼 Картинка' : '🖼 Picture') : '📄 PDF'}</button>)}</span>
      <button type="button" className="dv-primary" disabled={busy} data-testid="dv-pdf" onClick={() => act(async () => { const d = await issue(); downloadBlob(await docs.file(d.id, fmt), docs.fileName(d, fmt)); }, ru ? 'Скачано' : 'Downloaded')}>⬇ {fmt === 'jpg' ? 'JPG' : 'PDF'}{changed && last ? ` v${last.version + 1}` : ''}</button>
      <button type="button" disabled={busy} data-testid="dv-send-open" onClick={() => setOpen(!open)}>↗ {ru ? 'Отправить людям' : 'Send to people'}</button>
    </div>
    {last && pend.changes.length > 0 && <div className="dv-pending" data-testid="dv-pending">
      <b>✎ {ru ? `Изменилось после ${last.number}:` : `Changed since ${last.number}:`}</b>
      <ul>{pend.changes.slice(0, 6).map((c, i) => <li key={i}>{c}</li>)}{pend.changes.length > 6 && <li>… +{pend.changes.length - 6}</li>}</ul>
      <div className="dv-issue"><input value={note} onChange={e => setNote(e.target.value)} placeholder={ru ? 'Пометка к новой версии: «Футбол перенесли из-за дождя»' : 'Note for the new version'}/>
        <button type="button" className="dv-primary" disabled={busy} data-testid="dv-issue" onClick={() => act(issue, ru ? 'Новая версия выпущена' : 'New version issued')}>{ru ? `Выпустить v${last.version + 1}` : `Issue v${last.version + 1}`}</button></div>
    </div>}
    {open && <div className="dv-send" data-testid="dv-send">
      <div className="dv-people">{people.map(p => <button type="button" key={p.name} aria-pressed={to.includes(p.name)} onClick={() => setTo(t => t.includes(p.name) ? t.filter(x => x !== p.name) : [...t, p.name])}>{p.name}<small>{p.email || p.phone || ''}</small></button>)}
        {!people.length && <small>{ru ? 'Добавьте, кому отправлять: ребёнок, муж, клиент…' : 'Add people: kid, spouse, client…'}</small>}</div>
      <div className="dv-add"><input value={nc.name} onChange={e => setNc({...nc, name: e.target.value})} placeholder={ru ? 'Имя (Тимур, Муж)' : 'Name'}/><input value={nc.email} onChange={e => setNc({...nc, email: e.target.value})} placeholder="e-mail"/><input value={nc.phone} onChange={e => setNc({...nc, phone: e.target.value})} placeholder={ru ? 'телефон' : 'phone'}/>
        <button type="button" onClick={() => { if (!nc.name.trim()) return; contacts.add(nc); setTo(t => [...t, nc.name.trim()]); setNc({name: '', email: '', phone: ''}); }}>＋</button></div>
      <div className="dv-via">
        <span>{changed && last ? (ru ? `Уйдёт новая версия v${last.version + 1}` : `Sends new version v${last.version + 1}`) : last ? (ru ? `Уйдёт ${last.number}` : `Sends ${last.number}`) : (ru ? 'Уйдёт v1' : 'Sends v1')} · {ru ? `в мессенджер — ${fmt === 'jpg' ? 'картинкой' : 'PDF'}, на почту — оба` : `messenger: ${fmt === 'jpg' ? 'picture' : 'PDF'}, e-mail: both`}</span>
        {(['share', 'mail', 'agent'] as const).map(v => <button type="button" key={v} disabled={busy || (v !== 'share' && !to.length)} data-testid={'dv-via-' + v} onClick={() => act(async () => { const d = await issue(); await sendDoc(d.id, to, v, fmt); setOpen(false); }, v === 'agent' ? (ru ? 'Агент перешлёт' : 'The agent will forward it') : (ru ? 'Отправлено' : 'Sent'))}>
          {VIA[v]} {v === 'share' ? (ru ? 'Поделиться' : 'Share') : v === 'mail' ? (ru ? 'Письмом' : 'E-mail') : (ru ? 'Агент перешлёт' : 'Agent forwards')}</button>)}
      </div>
    </div>}
    {hist.length > 0 && <details className="dv-hist"><summary>{ru ? 'История версий' : 'Version history'} · {hist.length}</summary>
      {hist.map(d => <div key={d.id} className="dv-h" data-testid="dv-h">
        <b>{d.number}</b><small>{when(d.issuedAt)}{d.by === 'agent' ? ' · 📱' : ''}</small>
        <span>{d.prev ? d.changes.slice(0, 3).join('; ') + (d.changes.length > 3 ? '…' : '') : (ru ? 'первая версия' : 'first version')}{d.note ? ` — «${d.note}»` : ''}</span>
        <em>{d.sent.map(s => VIA[s.via] + ' ' + s.to + (s.format === 'jpg' ? ' 🖼' : s.format === 'pdf' ? ' 📄' : '')).join(', ')}</em>
        <button type="button" onClick={() => act(async () => downloadBlob(await docs.file(d.id, fmt), docs.fileName(d, fmt)), '⬇')}>⬇ {fmt === 'jpg' ? 'JPG' : 'PDF'}</button>
      </div>)}
    </details>}
    {flash && <div className="dv-flash" role="status">{flash}</div>}
  </section>;
}
