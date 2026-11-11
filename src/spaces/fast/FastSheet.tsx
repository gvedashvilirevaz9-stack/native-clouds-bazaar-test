// Fast mode sheet: one question, big buttons, one result. For people who just need it done.
import {useEffect, useRef, useState, useSyncExternalStore} from 'react';
import {ACTIONS, actionsFor, readFiles, run, fmtSize, kindOf, type ActionId, type FastFile, type Result} from './fast';
import {FAMILY_LABEL} from '../intake/detect';
import {downloadBlob, shareFile} from '../billing/share';
import {plan} from '../billing/plan';
import {ingestMany} from '../intake/store';
import {nativeRooms} from '../personal/native-clouds-state';
import {communication} from '../communication/store';
import './fast.css';

// ---------- tiny store: open/closed + files waiting ----------
let state: {open: boolean; files: File[]; v: number} = {open: false, files: [], v: 0};
const subs = new Set<() => void>();
const emit = (p: Partial<typeof state>) => { state = {...state, ...p, v: state.v + 1}; subs.forEach(f => f()); };
export const fastSheet = {
  open(files: File[] = []) { emit({open: true, files}); },
  close() { emit({open: false, files: []}); },
  get: () => state, subscribe(f: () => void) { subs.add(f); return () => { subs.delete(f); }; },
};
const PREF = 'sunrise.drop.v1';
/** Where dropped files go: 'fast' (default) or 'inbox'. */
export const dropPref = {get: (): 'fast' | 'inbox' => { try { return localStorage.getItem(PREF) === 'inbox' ? 'inbox' : 'fast'; } catch { return 'fast'; } }, set(v: 'fast' | 'inbox') { try { localStorage.setItem(PREF, v); } catch { /* */ } }};

export function FastSheet({ru}: {ru: boolean}) {
  const st = useSyncExternalStore(fastSheet.subscribe, fastSheet.get);
  const [files, setFiles] = useState<FastFile[]>([]);
  const [busy, setBusy] = useState<string | null>(null);
  const [res, setRes] = useState<Result | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [last, setLast] = useState<ActionId | null>(null);
  const pick = useRef<HTMLInputElement>(null);
  const [pref, setPref] = useState(dropPref.get());
  const limit = plan.get().fastFiles;
  const add = async (list: File[]) => { if (!list.length) return; setRes(null); setErr(null); const ff = await readFiles(list); setFiles(f => [...f, ...ff].slice(0, limit)); if (files.length + ff.length > limit) setErr(ru ? `Не больше ${limit} файлов за раз` : `Up to ${limit} files at once`); };
  useEffect(() => { if (st.open) { setFiles([]); setRes(null); setErr(null); setBusy(null); void add(st.files); } }, [st.v]);
  useEffect(() => { if (!st.open) return; const k = (e: KeyboardEvent) => { if (e.key === 'Escape') fastSheet.close(); }; window.addEventListener('keydown', k); return () => window.removeEventListener('keydown', k); }, [st.open]);
  if (!st.open) return null;
  const acts = actionsFor(files);
  const go = async (a: ActionId) => {
    setBusy('…'); setErr(null); setRes(null); setLast(a);
    try { setRes(await run(a, files, s => setBusy(s))); } catch (e) { setErr((ru ? 'Не получилось: ' : 'Failed: ') + String((e as Error).message || e)); }
    setBusy(null);
  };
  const toInbox = () => { void ingestMany(files.map(f => f.file)); nativeRooms.open('garage'); nativeRooms.select('inbox'); fastSheet.close(); };
  const toAgent = () => { void ingestMany(files.map(f => f.file)).then(r => { try { communication.add({text: `⚡ ${ru ? 'Что можно сделать с этими файлами?' : 'What can be done with these files?'} [intake.read ${r.assets.map(a => a.id).join(', ')}]`, role: 'user', contact: 'agent', source: 'Fast', kind: 'info', key: 'fast/' + Date.now()} as any); } catch { /* */ } }); nativeRooms.open('garage'); nativeRooms.select('inbox'); fastSheet.close(); };
  const note = res?.note === 'already-small' ? (ru ? 'Файл уже лёгкий — оставили как есть.' : 'Already small: kept as is.')
    : res?.note === 'no-text' ? (ru ? 'Текста не нашлось: похоже на скан. Агент распознает — «Спросить агента».' : 'No text found (looks scanned). Ask the agent to read it.')
    : res?.note === 'text-only' ? (ru ? 'Только текст, без картинок и вёрстки.' : 'Text only, no images or layout.') : null;
  return <div className="fs-veil" data-testid="fast-sheet" onClick={e => { if (e.target === e.currentTarget) fastSheet.close(); }}
    onDragOver={e => { e.preventDefault(); e.stopPropagation(); }} onDrop={e => { e.preventDefault(); e.stopPropagation(); void add([...e.dataTransfer.files]); }}>
    <section className="fs" role="dialog" aria-label={ru ? 'Быстро' : 'Fast'}>
      <header><b>⚡ {ru ? 'Быстро' : 'Fast'}</b><button type="button" className="fs-x" onClick={() => fastSheet.close()} aria-label={ru ? 'Закрыть' : 'Close'}>×</button></header>

      {!files.length ? <button type="button" className="fs-drop" onClick={() => pick.current?.click()} data-testid="fast-pick">
        <b>⇣</b><strong>{ru ? 'Перетащите файлы сюда или нажмите' : 'Drop files here or click'}</strong><small>{ru ? 'Фото, PDF, Word, Excel, HEIC с iPhone…' : 'Photos, PDF, Word, Excel, iPhone HEIC…'}</small></button>
        : <div className="fs-files">{files.map(f => <span key={f.id} className="fs-file" title={f.det.format}>{FAMILY_LABEL[f.det.family]?.icon || '•'} {f.file.name.length > 28 ? f.file.name.slice(0, 26) + '…' : f.file.name} <em>{fmtSize(f.file.size)}</em><button type="button" onClick={() => { setFiles(x => x.filter(y => y.id !== f.id)); setRes(null); }} aria-label="×">×</button></span>)}
          <button type="button" className="fs-more" onClick={() => pick.current?.click()}>＋</button></div>}
      <input ref={pick} type="file" multiple hidden onChange={e => { void add([...(e.target.files || [])]); e.target.value = ''; }}/>

      {files.length > 0 && !res && !busy && <>
        <h3>{ru ? 'Что получить?' : 'What do you want?'}</h3>
        {acts.length ? <div className="fs-acts">{acts.map((a, i) => { const x = ACTIONS[a]; return <button type="button" key={a} className={i === 0 ? 'is-first' : ''} data-testid={'fast-' + a} onClick={() => go(a)}>
          <b>{x.icon}</b><strong>{ru ? (a === 'pdf' && files.every(f => kindOf(f.det) === 'pdf') ? 'Склеить в один PDF' : x.ru) : x.en}</strong><small>{ru ? x.hintRu : x.hintEn}</small></button>; })}</div>
          : <p className="fs-none">{ru ? 'С этим форматом быстро не справиться — откройте в Приёмной или спросите агента.' : 'Nothing quick for this format: open it in the Inbox or ask the agent.'}</p>}
      </>}

      {busy && <div className="fs-busy" role="status"><span className="fs-spin"/>{busy}</div>}

      {res && <div className="fs-res" data-testid="fast-result">
        <div className="fs-res-file"><b>{/\.pdf$/.test(res.name) ? '📄' : /\.zip$/.test(res.name) ? '🗂' : /\.docx$/.test(res.name) ? '📘' : /\.txt$/.test(res.name) ? '📝' : '🖼'}</b>
          <span><strong data-testid="fast-result-name">{res.name}</strong><small>{fmtSize(res.after)}{res.count && res.count > 1 ? ` · ${res.count} ${ru ? (res.name.endsWith('.pdf') ? 'стр.' : 'файлов') : (res.name.endsWith('.pdf') ? 'pages' : 'files')}` : ''}{last === 'compress' && res.after < res.before ? ` · ${ru ? 'было' : 'was'} ${fmtSize(res.before)} (−${Math.round((1 - res.after / res.before) * 100)}%)` : ''}</small></span></div>
        {note && <p className="fs-note">{note}</p>}
        <div className="fs-res-act">
          <button type="button" className="fs-primary" data-testid="fast-download" onClick={() => downloadBlob(res.blob, res.name)}>⬇ {ru ? 'Скачать' : 'Download'}</button>
          <button type="button" onClick={() => void shareFile(res.blob, res.name)}>↗ {ru ? 'Отправить' : 'Send'}</button>
          <button type="button" onClick={() => setRes(null)}>↺ {ru ? 'Другое действие' : 'Something else'}</button>
          <button type="button" onClick={() => { setFiles([]); setRes(null); }}>{ru ? 'Новые файлы' : 'New files'}</button>
        </div>
      </div>}
      {err && <p className="fs-err">{err}</p>}

      <footer>
        {files.length > 0 && <><button type="button" className="fs-link" onClick={toInbox}>⇣ {ru ? 'Больше возможностей (Приёмная)' : 'More options (Inbox)'}</button><button type="button" className="fs-link" onClick={toAgent}>📱 {ru ? 'Спросить агента' : 'Ask the agent'}</button></>}
        <label className="fs-pref"><input type="checkbox" checked={pref === 'inbox'} onChange={e => { const v = e.target.checked ? 'inbox' : 'fast'; dropPref.set(v); setPref(v); }}/> {ru ? 'Сразу открывать Приёмную вместо этого окна' : 'Open the Inbox instead of this window'}</label>
      </footer>
    </section>
  </div>;
}
