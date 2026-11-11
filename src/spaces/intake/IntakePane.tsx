// Inbox (Приёмная): receive → recognise → convert → choose where it goes.
import {useEffect, useMemo, useRef, useState} from 'react';
import {useLang} from '../../hooks/useLang';
import {useBlobUrl} from './useBlobUrl';
import {FAMILY_LABEL} from './detect';
import {fmtSize} from './convert';
import {CATEGORIES, categoryById, type CategoryId} from './categories';
import {
  intake, batches, ingestMany, ingestText, select, selectBatch, useAssets, useSelected, useSelectedBatch,
  readText, extractZip, setAssetCategory, MAX_BATCH, type Asset, type Batch,
} from './store';
import {toBoard, toNotebook, toNotebookText, toEncyclopedia, toAgent, downloadAsset, sendBatch} from './routes';
import {buildSummary, summaryMarkdown, summaryCsv, summaryToBoard, summaryToNotebook, type Summary} from './summary';
import {openPicture} from '../picture/render';
import {openVideoAsset} from '../picture/video';
import {media} from '../picture/MediaPane';
import {nativeRooms} from '../personal/native-clouds-state';
import './intake.css';

export {useBlobUrl};
function Thumb({refId, alt, className}: {refId?: string | null; alt: string; className?: string}) {
  const u = useBlobUrl(refId);
  return u ? <img className={className} src={u} alt={alt} draggable={false}/> : <span className={(className || '') + ' ik-thumb-empty'} aria-hidden="true"/>;
}

const STATUS: Record<string, {ru: string; en: string; tone: string}> = {
  converting: {ru: 'Конвертирую…', en: 'Converting…', tone: 'busy'},
  ready: {ru: 'Готово', en: 'Ready', tone: 'ok'},
  partial: {ru: 'Частично', en: 'Partial', tone: 'warn'},
  'needs-agent': {ru: 'Нужен агент', en: 'Needs agent', tone: 'agent'},
  failed: {ru: 'Ошибка', en: 'Failed', tone: 'bad'},
};
const NOTE: Record<string, {ru: string; en: string}> = {
  'raw-preview': {ru: 'Показано встроенное превью камеры. Полную обработку RAW может сделать агент.', en: 'Showing the camera\'s embedded preview. The agent can develop the full RAW.'},
  'raw-no-preview': {ru: 'В RAW-файле нет превью. Передайте агенту для конвертации.', en: 'No preview in this RAW file. Hand it to the agent to convert.'},
  'pdf-truncated': {ru: 'Показаны первые 40 страниц. Остальные может разобрать агент.', en: 'First 40 pages shown. The agent can process the rest.'},
  'pdf-scanned': {ru: 'В PDF нет текстового слоя (скан). Текст распознает агент.', en: 'No text layer (scanned). The agent can OCR it.'},
  'doc-first-page': {ru: 'Картинкой показана первая страница, текст извлечён полностью.', en: 'First page shown as an image; full text extracted.'},
  'slides-text': {ru: 'Слайды показаны текстом. Точный вид слайдов может сделать агент.', en: 'Slides shown as text. The agent can render exact slides.'},
  'audio-transcript': {ru: 'Расшифровку речи может сделать агент.', en: 'The agent can transcribe speech.'},
  'embedded-preview': {ru: 'Показано встроенное превью. Полную конвертацию сделает агент.', en: 'Embedded preview shown. The agent will do the full conversion.'},
  'needs-agent': {ru: 'Браузер не открывает этот формат. Оригинал сохранён, агент может сконвертировать его через MCP.', en: 'The browser can\'t open this format. Original kept; the agent can convert it via MCP.'},
  'local-failed': {ru: 'Локально открыть не удалось. Оригинал сохранён, передайте агенту.', en: 'Could not open locally. Original kept; hand it to the agent.'},
  'cad-text': {ru: 'Показан текст чертежа. Визуализацию сделает агент.', en: 'Drawing shown as text. The agent can render it.'},
  'agent-converted': {ru: 'Сконвертировано агентом.', en: 'Converted by the agent.'},
};

// ---------------- drop zone ----------------
function DropZone({ru, batchId}: {ru: boolean; batchId?: string | null}) {
  const input = useRef<HTMLInputElement>(null);
  const [over, setOver] = useState(false);
  const [text, setText] = useState('');
  const take = (files: FileList | File[] | null) => { const list = Array.from(files || []); if (list.length) void ingestMany(list, {batchId: batchId || null}); };
  return <div className={'ik-drop' + (over ? ' is-over' : '')} data-testid="ik-drop"
    onDragOver={e => { if ([...e.dataTransfer.types].includes('Files')) { e.preventDefault(); setOver(true); } }}
    onDragLeave={() => setOver(false)}
    onDrop={e => { if (!e.dataTransfer.files?.length) return; e.preventDefault(); e.stopPropagation(); setOver(false); take(e.dataTransfer.files); }}>
    <button type="button" className="ik-drop-main" onClick={() => input.current?.click()}>
      <b>⇣</b>
      <span><strong>{batchId ? (ru ? 'Добавить файлы в пакет' : 'Add files to batch') : (ru ? 'Бросьте файлы сюда или в любое место' : 'Drop files here or anywhere')}</strong>
        <small>{ru ? `Фото, RAW, PDF, документы, таблицы, видео… До ${MAX_BATCH} за раз · Ctrl+V тоже работает` : `Photos, RAW, PDF, docs, sheets, video… Up to ${MAX_BATCH} at once · Ctrl+V works too`}</small></span>
    </button>
    <input ref={input} type="file" multiple hidden data-testid="ik-file" onChange={e => { take(e.target.files); e.target.value = ''; }}/>
    <form className="ik-drop-text" onSubmit={e => { e.preventDefault(); if (text.trim()) { void ingestText(text.trim()); setText(''); } }}>
      <input value={text} onChange={e => setText(e.target.value)} placeholder={ru ? 'Или вставьте текст / ссылку' : 'Or paste text / a link'} aria-label={ru ? 'Текст или ссылка' : 'Text or link'}/>
      <button type="submit" disabled={!text.trim()}>{ru ? 'Принять' : 'Add'}</button>
    </form>
  </div>;
}

// ---------------- sidebar ----------------
function Sidebar({ru, assets, sel, batchSel, filter, setFilter, picked, setPicked}: {ru: boolean; assets: Asset[]; sel: string | null; batchSel: string | null; filter: CategoryId | 'all'; setFilter: (f: CategoryId | 'all') => void; picked: string[]; setPicked: (p: string[]) => void}) {
  const list = filter === 'all' ? assets : assets.filter(a => a.category === filter);
  const counts = useMemo(() => { const m = new Map<string, number>(); assets.forEach(a => a.category && m.set(a.category, (m.get(a.category) || 0) + 1)); return m; }, [assets]);
  const bl = batches.list();
  const toggle = (id: string) => setPicked(picked.includes(id) ? picked.filter(x => x !== id) : [...picked, id]);
  return <aside className="ik-side">
    <DropZone ru={ru}/>
    {bl.length > 0 && <section className="ik-batches" aria-label={ru ? 'Пакеты' : 'Batches'}>
      <h4>{ru ? 'Пакеты' : 'Batches'}</h4>
      {bl.map(b => { const c = categoryById(b.category); return <button type="button" key={b.id} data-testid="ik-batch" aria-pressed={batchSel === b.id} className="ik-batch-row" onClick={() => { selectBatch(b.id); select(null); }}>
        <span className="ik-cat-ico">{c?.icon}</span><span className="ik-row-t"><strong>{b.title}</strong><small>{b.assetIds.length} · {batchStateLabel(b, ru)}</small></span>
      </button>; })}
    </section>}
    <section className="ik-files" aria-label={ru ? 'Файлы' : 'Files'}>
      <div className="ik-filter" role="tablist">
        <button type="button" aria-pressed={filter === 'all'} onClick={() => setFilter('all')}>{ru ? 'Все' : 'All'} <i>{assets.length}</i></button>
        {CATEGORIES.filter(c => counts.get(c.id)).map(c => <button type="button" key={c.id} aria-pressed={filter === c.id} onClick={() => setFilter(c.id)} title={ru ? c.ru : c.en}>{c.icon} <i>{counts.get(c.id)}</i></button>)}
      </div>
      {picked.length > 0 && <div className="ik-picked">
        <span>{ru ? `Выбрано: ${picked.length}` : `${picked.length} selected`}</span>
        <button type="button" data-testid="ik-make-batch" onClick={() => { const b = batches.create({assetIds: picked}); selectBatch(b.id); select(null); setPicked([]); }}>{ru ? 'Собрать в пакет' : 'Make a batch'}</button>
        <button type="button" onClick={() => setPicked([])}>✕</button>
      </div>}
      {!list.length && <p className="ik-empty-small">{ru ? 'Пока пусто.' : 'Nothing yet.'}</p>}
      <ul>{list.map(a => { const st = STATUS[a.status]; return <li key={a.id} className={'ik-file-row' + (sel === a.id && !batchSel ? ' is-on' : '')}>
        <input type="checkbox" checked={picked.includes(a.id)} onChange={() => toggle(a.id)} aria-label={(ru ? 'Выбрать ' : 'Select ') + a.name}/>
        <button type="button" data-testid="ik-asset" onClick={() => { select(a.id); selectBatch(null); }}>
          <Thumb refId={a.pages[0]?.ref} alt="" className="ik-row-thumb"/>
          <span className="ik-row-t"><strong title={a.name}>{a.name}</strong><small>{categoryById(a.category)?.icon || FAMILY_LABEL[a.family].icon} {a.format} · {fmtSize(a.size)}</small></span>
          <em className={'ik-dot ik-' + st.tone} title={ru ? st.ru : st.en}/>
        </button>
      </li>; })}</ul>
    </section>
  </aside>;
}
function batchStateLabel(b: Batch, ru: boolean) {
  return b.state === 'collecting' ? (ru ? 'собирается' : 'collecting') : b.state === 'sent' ? (ru ? 'у агента' : 'with agent') : (ru ? 'сводка готова' : 'summary ready');
}

// ---------------- category picker ----------------
function CategoryPicker({ru, value, suggested, onPick}: {ru: boolean; value?: CategoryId; suggested?: boolean; onPick: (c: CategoryId) => void}) {
  const c = categoryById(value);
  const [showPrompt, setShowPrompt] = useState(false);
  useEffect(() => { const on = (e: any) => { if (e.detail?.prompt) setShowPrompt(true); }; window.addEventListener('intake:ui', on); return () => window.removeEventListener('intake:ui', on); }, []);
  return <div className="ik-cats">
    <div className="ik-cats-head"><strong>{ru ? 'Что это за файл?' : 'What is this file for?'}</strong>{suggested && c && <small>{ru ? 'предложено автоматически' : 'suggested'}</small>}</div>
    <div className="ik-cat-chips">{CATEGORIES.map(x => <button type="button" key={x.id} data-testid={'ik-cat-' + x.id} aria-pressed={value === x.id} onClick={() => onPick(x.id)} title={ru ? x.hintRu : x.hintEn}>{x.icon} {ru ? x.ru : x.en}</button>)}</div>
    {c && <p className="ik-cat-hint">{ru ? c.hintRu : c.hintEn} · <button type="button" className="ik-link" onClick={() => setShowPrompt(!showPrompt)}>{showPrompt ? (ru ? 'скрыть промт' : 'hide prompt') : (ru ? 'промт для агента' : 'agent prompt')}</button></p>}
    {c && showPrompt && <pre className="ik-prompt" data-testid="ik-prompt">{c.prompt}{'\n\n'}{ru ? 'Схема данных:' : 'Data schema:'}{'\n'}{JSON.stringify(c.schema, null, 2)}</pre>}
  </div>;
}

// ---------------- single asset ----------------
function AssetView({ru, a}: {ru: boolean; a: Asset}) {
  const [page, setPage] = useState(1);
  const [tab, setTab] = useState<'preview' | 'text' | 'data' | 'card'>('preview');
  const [text, setText] = useState<string | null>(null);
  const [ask, setAsk] = useState('');
  const [question, setQuestion] = useState('');
  const [busy, setBusy] = useState<string | null>(null);
  const [flash, setFlash] = useState<string | null>(null);
  useEffect(() => { setPage(1); setTab('preview'); setText(null); setAsk(''); setQuestion(''); }, [a.id]);
  // The demo player (and any host) can switch the visible tab or page.
  useEffect(() => { const on = (e: any) => { const d = e.detail || {}; if (d.tab) setTab(d.tab); if (d.page) { setTab('preview'); setPage(d.page); } }; window.addEventListener('intake:ui', on); return () => window.removeEventListener('intake:ui', on); }, []);
  useEffect(() => { if (tab === 'text' && text == null) void readText(a).then(setText); }, [tab, a.id, a.textRef]);
  const orig = useBlobUrl((a.family === 'video' || a.family === 'audio') ? a.origRef : null);
  const st = STATUS[a.status]; const cur = a.pages.find(p => p.n === page) || a.pages[0];
  const run = async (key: string, fn: () => Promise<unknown> | unknown, done?: string) => {
    setBusy(key);
    try { await fn(); if (done) { setFlash(done); setTimeout(() => setFlash(null), 2600); } }
    catch (e) { setFlash('⚠ ' + String((e as Error).message || e)); setTimeout(() => setFlash(null), 4000); }
    finally { setBusy(null); }
  };
  const ready = a.status !== 'converting' && a.status !== 'failed';
  const step = (on: boolean, label: string) => <li className={on ? 'is-done' : ''}>{label}</li>;
  const bl = batches.list();
  return <div className="ik-asset" data-testid="ik-asset-view" data-status={a.status}>
    <header className="ik-asset-head">
      <div><h3 title={a.name}>{a.name}</h3>
        <p><span className="ik-chip">{FAMILY_LABEL[a.family].icon} {ru ? FAMILY_LABEL[a.family].ru : FAMILY_LABEL[a.family].en}</span><span className="ik-chip">{a.format}</span><span className="ik-chip">{fmtSize(a.size)}</span>{a.pages.length > 1 && <span className="ik-chip">{a.pages.length} {ru ? 'стр.' : 'pp.'}</span>}<span className={'ik-chip ik-' + st.tone}>{ru ? st.ru : st.en}</span>{a.convertedBy && <span className="ik-chip">{a.convertedBy === 'agent' ? (ru ? 'конвертировал агент' : 'by agent') : (ru ? 'в браузере' : 'in browser')}</span>}</p>
      </div>
      <ol className="ik-steps" aria-label={ru ? 'Этапы' : 'Stages'}>
        {step(true, ru ? 'Принят' : 'Received')}
        {step(a.format !== '…', ru ? 'Распознан' : 'Recognised')}
        {step(a.status === 'ready' || a.status === 'partial' || a.convertedBy === 'agent', ru ? 'Приведён' : 'Converted')}
        {step(a.routes.some(r => r.to !== 'download'), ru ? 'Отправлен' : 'Routed')}
      </ol>
    </header>
    {(a.note || a.error) && <p className="ik-note">{a.note && NOTE[a.note] ? (ru ? NOTE[a.note].ru : NOTE[a.note].en) : ''}{a.error ? ` (${a.error})` : ''}</p>}

    <CategoryPicker ru={ru} value={a.category} suggested={!a.categorySet} onPick={c => setAssetCategory(a.id, c)}/>

    <div className="ik-tabs" role="tablist">
      {(['preview', 'text', 'data', 'card'] as const).map(t => <button type="button" role="tab" key={t} aria-selected={tab === t} onClick={() => setTab(t)}>{({preview: ru ? 'Превью' : 'Preview', text: ru ? 'Текст' : 'Text', data: ru ? 'Данные' : 'Data', card: ru ? 'Карточка' : 'Card'})[t]}</button>)}
    </div>
    <div className="ik-view">
      {tab === 'preview' && <>
        {a.status === 'converting' && <div className="ik-spinner" role="status">{ru ? 'Распознаю и конвертирую…' : 'Recognising and converting…'}</div>}
        {orig && a.family === 'video' && <video className="ik-media" src={orig} controls preload="metadata"/>}
        {orig && a.family === 'audio' && <audio className="ik-media-audio" src={orig} controls preload="metadata"/>}
        {cur && <figure className="ik-stage"><Thumb refId={cur.ref} alt={a.name + ' ' + (cur.label || '')}/>{cur.label && <figcaption>{cur.label}</figcaption>}</figure>}
        {a.pages.length > 1 && <div className="ik-strip">{a.pages.map(p => <button type="button" key={p.n} aria-pressed={p.n === (cur?.n || 1)} onClick={() => setPage(p.n)} title={p.label || String(p.n)}><Thumb refId={p.ref} alt=""/><span>{p.n}</span></button>)}</div>}
      </>}
      {tab === 'text' && (a.textRef ? <pre className="ik-text" data-testid="ik-text">{text == null ? '…' : text.slice(0, 60000)}</pre> : <p className="ik-empty-small">{ru ? 'Текстового слоя нет. Агент может распознать текст на изображениях.' : 'No text layer. The agent can OCR the images.'}</p>)}
      {tab === 'data' && (a.data ? <pre className="ik-text" data-testid="ik-data">{JSON.stringify(a.data, null, 2)}</pre> : <p className="ik-empty-small">{ru ? 'Агент ещё не заполнил данные по схеме категории. Нажмите «Разобраться с агентом» или отправьте пакет.' : 'The agent has not filled in the category data yet. Use “Work it out with the agent” or send the batch.'}</p>)}
      {tab === 'card' && <pre className="ik-text">{JSON.stringify({id: a.id, name: a.name, family: a.family, format: a.format, mime: a.mime, size: a.size, status: a.status, category: a.category, batchId: a.batchId, meta: a.meta, pages: a.pages.map(p => ({n: p.n, w: p.w, h: p.h})), routes: a.routes, agent: a.agent}, null, 2)}</pre>}
    </div>

    <section className="ik-actions" aria-label={ru ? 'Что сделать с файлом' : 'What to do with the file'}>
      <h4>{ru ? 'Куда дальше?' : 'Where next?'}</h4>
      <div className="ik-action-grid">
        <button type="button" data-testid="ik-to-board" disabled={!ready || !a.pages.length || !!busy} onClick={() => run('board', () => toBoard(a.id), ru ? 'Положено на доску' : 'Placed on the board')}><b>▦</b><span>{ru ? 'На доску' : 'To the board'}<small>{a.pages.length > 1 ? (ru ? `первые ${Math.min(6, a.pages.length)} стр.` : `first ${Math.min(6, a.pages.length)} pp.`) : (ru ? 'сравнивать, собирать' : 'compare, compose')}</small></span></button>
        <button type="button" data-testid="ik-to-notebook" disabled={!ready || !a.pages.length || !!busy} onClick={() => run('nb', () => toNotebook(a.id, {pages: a.pages.length > 1 ? [cur?.n || 1] : undefined}), ru ? 'Добавлено в блокнот' : 'Added to the notebook')}><b>✎</b><span>{ru ? 'В блокнот' : 'To the notebook'}<small>{ru ? 'картинкой к странице' : 'as an image'}</small></span></button>
        <button type="button" data-testid="ik-to-notebook-text" disabled={!a.textRef || !!busy} onClick={() => run('nbt', () => toNotebookText(a.id), ru ? 'Текст записан в блокнот' : 'Text written to the notebook')}><b>≡</b><span>{ru ? 'Текст в блокнот' : 'Text to notebook'}<small>{a.textRef ? (ru ? 'извлечённый текст' : 'extracted text') : (ru ? 'текста нет' : 'no text')}</small></span></button>
        {a.pages.length > 0 && a.family !== 'video' && a.family !== 'audio' ? <button type="button" data-testid="ik-to-picture" disabled={!ready || !!busy} onClick={() => run('pic', async () => { await openPicture((a.pages.find(p => p.n === page) || a.pages[0]).ref, a.name, a.id); media.setMode('picture'); nativeRooms.select('media'); })}><b>✂</b><span>{ru ? 'В редактор' : 'Edit picture'}<small>{ru ? 'обрезать, подписать, вырезать' : 'crop, label, cut'}</small></span></button> : null}
        {a.family === 'video' ? <button type="button" data-testid="ik-to-video" disabled={!ready || !!busy} onClick={() => run('vid', () => { openVideoAsset(a.id); media.setMode('video'); nativeRooms.select('media'); })}><b>🎞</b><span>{ru ? 'Смотреть и брать кадры' : 'Watch & take frames'}<small>{ru ? 'кабинет Медиа' : 'Media cabinet'}</small></span></button> : null}
        {a.family === 'archive' && a.entries?.length ? <button type="button" disabled={!!busy} onClick={() => run('zip', () => extractZip(a.id), ru ? 'Файлы распакованы в Приёмную' : 'Unpacked into the Inbox')}><b>🗜</b><span>{ru ? 'Распаковать' : 'Unpack'}<small>{a.entries.length} {ru ? 'файлов' : 'files'}</small></span></button> : null}
      </div>
      <div className="ik-ask-row">
        <input value={question} onChange={e => setQuestion(e.target.value)} placeholder={ru ? 'Вопрос в энциклопедию: что это за деталь?' : 'Ask the encyclopedia: what is this part?'} aria-label={ru ? 'Вопрос в энциклопедию' : 'Encyclopedia question'}/>
        <button type="button" data-testid="ik-to-encyclopedia" disabled={!ready || !!busy} onClick={() => run('enc', () => toEncyclopedia(a.id, question), ru ? 'Вопрос сохранён в энциклопедии' : 'Question saved in the encyclopedia')}>◈ {ru ? 'В энциклопедию' : 'Encyclopedia'}</button>
      </div>
      <div className="ik-ask-row ik-agent-row">
        <textarea value={ask} onChange={e => setAsk(e.target.value)} rows={2} placeholder={ru ? 'Не знаете, что делать? Опишите задачу или оставьте пусто: агент спросит сам.' : 'Not sure? Describe the task or leave empty: the agent will ask.'} aria-label={ru ? 'Задача для агента' : 'Task for the agent'}/>
        <button type="button" data-testid="ik-to-agent" disabled={a.status === 'converting' || !!busy} onClick={() => run('agent', () => toAgent(a.id, ask), ru ? 'Отправлено агенту' : 'Sent to the agent')}>📱 {ru ? 'Разобраться с агентом' : 'Work it out with the agent'}</button>
      </div>
      {a.agent && <p className="ik-agent-state">📱 {a.agent.state === 'done' ? (ru ? 'Агент ответил' : 'Agent replied') : (ru ? 'Ждёт агента' : 'Waiting for the agent')}: «{a.agent.request.slice(0, 140)}»{a.agent.reply ? <><br/>↳ {a.agent.reply.slice(0, 400)}</> : null}</p>}
      <div className="ik-minor">
        <label>{ru ? 'В пакет:' : 'Batch:'} <select value={a.batchId || ''} onChange={e => { const v = e.target.value; if (v === '__new') { const b = batches.create({assetIds: [a.id]}); selectBatch(b.id); select(null); } else if (v) batches.add(v, [a.id]); else if (a.batchId) batches.drop(a.batchId, [a.id]); }}>
          <option value="">{ru ? '— нет —' : '— none —'}</option>{bl.map(b => <option key={b.id} value={b.id}>{b.title}</option>)}<option value="__new">{ru ? '+ новый пакет' : '+ new batch'}</option></select></label>
        <span className="ik-sep"/>
        <span>{ru ? 'Скачать:' : 'Download:'}</span>
        <button type="button" onClick={() => run('d1', () => downloadAsset(a.id, 'original'))}>{ru ? 'оригинал' : 'original'}</button>
        <button type="button" disabled={!a.pages.length} onClick={() => run('d2', () => downloadAsset(a.id, 'pages'))}>WebP</button>
        <button type="button" disabled={!a.textRef} onClick={() => run('d3', () => downloadAsset(a.id, 'text'))}>MD</button>
        <button type="button" onClick={() => run('d4', () => downloadAsset(a.id, 'card'))}>JSON</button>
        <span className="ik-sep"/>
        <button type="button" className="ik-danger" onClick={() => intake.remove(a.id)}>{ru ? 'Удалить' : 'Delete'}</button>
      </div>
      {a.routes.length > 0 && <p className="ik-routes">{a.routes.slice(-5).map((r, i) => <span key={i}>{routeLabel(r.to, ru)} {new Date(r.at).toLocaleTimeString(ru ? 'ru-RU' : 'en-GB', {hour: '2-digit', minute: '2-digit'})}</span>)}</p>}
    </section>
    {flash && <div className="ik-flash" role="status">{flash}</div>}
  </div>;
}
function routeLabel(to: string, ru: boolean) {
  const m: Record<string, [string, string]> = {board: ['▦ доска', '▦ board'], notebook: ['✎ блокнот', '✎ notebook'], 'notebook-text': ['≡ текст→блокнот', '≡ text→notebook'], encyclopedia: ['◈ энциклопедия', '◈ encyclopedia'], agent: ['📱 агент', '📱 agent'], download: ['⇩ скачано', '⇩ downloaded']};
  return (m[to] || [to, to])[ru ? 0 : 1];
}

// ---------------- batch ----------------
function BatchView({ru, b}: {ru: boolean; b: Batch}) {
  useAssets();
  const members = b.assetIds.map(id => intake.get(id)).filter(Boolean) as Asset[];
  const cat = categoryById(b.category)!;
  const [req, setReq] = useState(b.request || '');
  const [summary, setSummary] = useState<Summary | null>(null);
  const [flash, setFlash] = useState<string | null>(null);
  const withData = members.filter(a => a.data).length;
  useEffect(() => { setReq(b.request || ''); setSummary(b.summary ? buildSummary(b.id) : null); }, [b.id]);
  useEffect(() => { if (summary || b.summary) setSummary(buildSummary(b.id)); }, [withData, b.summary?.at]);
  const say = (s: string) => { setFlash(s); setTimeout(() => setFlash(null), 2800); };
  const act = async (fn: () => unknown, ok: string) => { try { await fn(); say(ok); } catch (e) { say('⚠ ' + String((e as Error).message || e)); } };
  const save = (name: string, body: string, type: string) => { const u = URL.createObjectURL(new Blob([body], {type})); const el = document.createElement('a'); el.href = u; el.download = name; el.click(); setTimeout(() => URL.revokeObjectURL(u), 2000); };
  return <div className="ik-batch" data-testid="ik-batch-view">
    <header className="ik-asset-head">
      <div><input className="ik-title-input" value={b.title} onChange={e => batches.patch(b.id, {title: e.target.value.slice(0, 120)})} aria-label={ru ? 'Название пакета' : 'Batch title'}/>
        <p><span className="ik-chip">{cat.icon} {ru ? cat.ru : cat.en}</span><span className="ik-chip">{members.length}/{MAX_BATCH} {ru ? 'файлов' : 'files'}</span><span className="ik-chip">{ru ? 'с данными' : 'with data'}: {withData}</span><span className={'ik-chip ik-' + (b.state === 'done' ? 'ok' : b.state === 'sent' ? 'agent' : 'busy')}>{batchStateLabel(b, ru)}</span></p></div>
      <ol className="ik-steps">
        <li className={members.length ? 'is-done' : ''}>{ru ? 'Собран' : 'Collected'}</li>
        <li className={b.state !== 'collecting' ? 'is-done' : ''}>{ru ? 'У агента' : 'With agent'}</li>
        <li className={withData ? 'is-done' : ''}>{ru ? 'Данные' : 'Data'}</li>
        <li className={summary ? 'is-done' : ''}>{ru ? 'Сводка' : 'Summary'}</li>
      </ol>
    </header>
    <CategoryPicker ru={ru} value={b.category} onPick={c => batches.setCategory(b.id, c)}/>
    <div className="ik-grid">{members.map(a => <figure key={a.id} className={'ik-grid-cell' + (a.data ? ' has-data' : '')}>
      <button type="button" className="ik-grid-open" onClick={() => { select(a.id); selectBatch(null); }}><Thumb refId={a.pages[0]?.ref} alt={a.name}/></button>
      <figcaption><span title={a.name}>{a.name}</span><em>{a.status === 'converting' ? '…' : a.data ? '✓' : '·'}</em></figcaption>
      <button type="button" className="ik-grid-x" aria-label={ru ? 'Убрать из пакета' : 'Remove from batch'} onClick={() => batches.drop(b.id, [a.id])}>×</button>
    </figure>)}</div>
    <section className="ik-actions">
      <h4>{ru ? 'Задача для агента' : 'Task for the agent'}</h4>
      <p className="ik-cat-hint">{ru ? `Агент разберёт каждый файл по схеме «${cat.ru}», заполнит данные, а портал соберёт сводку.` : `The agent reads every file with the “${cat.en}” schema and fills in the data; the portal builds the summary.`}</p>
      <div className="ik-ask-row ik-agent-row">
        <textarea rows={2} value={req} onChange={e => setReq(e.target.value)} placeholder={ru ? 'Уточнение (необязательно): например, «только продукты, раздели по магазинам»' : 'Optional: e.g. "groceries only, split by shop"'}/>
        <button type="button" data-testid="ik-batch-send" disabled={!members.length || members.some(a => a.status === 'converting')} onClick={() => act(() => sendBatch(b.id, req), ru ? 'Пакет отправлен агенту' : 'Batch sent to the agent')}>📱 {b.state === 'collecting' ? (ru ? 'Запустить с агентом' : 'Run with the agent') : (ru ? 'Отправить ещё раз' : 'Send again')}</button>
      </div>
      <div className="ik-minor">
        <button type="button" data-testid="ik-batch-summary" disabled={!withData} onClick={() => setSummary(buildSummary(b.id))}>Σ {ru ? 'Собрать сводку' : 'Build summary'}</button>
        {!withData && <small>{ru ? 'Сводка появится, когда агент заполнит данные хотя бы по одному файлу.' : 'The summary appears once the agent fills data for at least one file.'}</small>}
        <span className="ik-sep"/>
        <button type="button" className="ik-danger" onClick={() => batches.remove(b.id)}>{ru ? 'Расформировать' : 'Ungroup'}</button>
      </div>
    </section>
    {summary && <SummaryView ru={ru} b={b} s={summary} onBoard={() => act(() => summaryToBoard(b.id), ru ? 'Сводка на доске' : 'Summary on the board')} onNotebook={() => act(() => summaryToNotebook(b.id), ru ? 'Сводка в блокноте' : 'Summary in the notebook')}
      onMd={() => save(b.title + '.md', summaryMarkdown(b, summary), 'text/markdown')} onCsv={() => save(b.title + '.csv', summaryCsv(summary), 'text/csv')}/>}
    <DropZone ru={ru} batchId={b.id}/>
    {flash && <div className="ik-flash" role="status">{flash}</div>}
  </div>;
}
const money = (v: number, c: string) => `${v.toLocaleString('ru-RU', {minimumFractionDigits: 2, maximumFractionDigits: 2})} ${c}`;
function SummaryView({ru, b, s, onBoard, onNotebook, onMd, onCsv}: {ru: boolean; b: Batch; s: Summary; onBoard: () => void; onNotebook: () => void; onMd: () => void; onCsv: () => void}) {
  return <section className="ik-summary" data-testid="ik-summary">
    <header><h4>Σ {ru ? 'Сводка' : 'Summary'}</h4><div className="ik-minor">
      <button type="button" onClick={onBoard}>▦ {ru ? 'На доску' : 'Board'}</button><button type="button" onClick={onNotebook}>✎ {ru ? 'В блокнот' : 'Notebook'}</button><button type="button" onClick={onMd}>MD</button><button type="button" onClick={onCsv}>CSV</button>
    </div></header>
    {b.summary?.notes && <p className="ik-note">📱 {b.summary.notes}</p>}
    {s.kind === 'ledger' && <>
      <div className="ik-totals">{Object.entries(s.totals).map(([c, v]) => <div key={c}><small>{ru ? 'Итого' : 'Total'}</small><strong>{money(v, c)}</strong></div>)}
        <div><small>{ru ? 'Документов' : 'Documents'}</small><strong>{s.withData}</strong></div>
        {s.range.from && <div><small>{ru ? 'Период' : 'Period'}</small><strong>{s.range.from}{s.range.to !== s.range.from ? ' – ' + s.range.to : ''}</strong></div>}</div>
      <table><thead><tr><th>{ru ? 'Дата' : 'Date'}</th><th>{ru ? 'Док.' : 'Docs'}</th><th>{ru ? 'Сумма' : 'Amount'}</th><th>{ru ? 'Где' : 'Where'}</th></tr></thead>
        <tbody>{s.days.map(d => <tr key={d.date}><td>{d.date}</td><td>{d.docs}</td><td>{Object.entries(d.totals).map(([c, v]) => money(v, c)).join(', ')}</td><td>{d.shops.join(', ')}</td></tr>)}</tbody></table>
      {s.items.length > 0 && <table><thead><tr><th>{ru ? 'Товар' : 'Item'}</th><th>{ru ? 'Кол-во' : 'Qty'}</th><th>{ru ? 'Сумма' : 'Amount'}</th><th>{ru ? 'Раз' : 'Times'}</th></tr></thead>
        <tbody>{s.items.slice(0, 60).map(i => <tr key={i.name + i.currency}><td>{i.name}</td><td>{+i.qty.toFixed(3)} {i.unit}</td><td>{money(i.total, i.currency)}</td><td>{i.times}</td></tr>)}</tbody></table>}
      {s.unclear.length > 0 && <p className="ik-note">{ru ? 'Неразборчиво: ' : 'Unclear: '}{s.unclear.map(u => `${u.asset} (${u.fields.join(', ')})`).join('; ')}</p>}
    </>}
    {s.kind === 'table' && <div className="ik-table-wrap"><table><thead><tr><th>{ru ? 'Файл' : 'File'}</th>{s.columns.map(c => <th key={c}>{c}</th>)}</tr></thead><tbody>{s.rows.map(r => <tr key={r.asset}><td>{r.asset}</td>{r.cells.map((c, i) => <td key={i}>{c}</td>)}</tr>)}</tbody></table></div>}
    {s.kind === 'notes' && s.entries.map(e => <article key={e.asset} className="ik-note-card"><strong>{e.asset}</strong><p>{e.text}</p></article>)}
    {s.missing.length > 0 && <p className="ik-empty-small">{ru ? 'Ещё без данных: ' : 'Still without data: '}{s.missing.join(', ')}</p>}
  </section>;
}

// ---------------- pane ----------------
export function IntakePane() {
  const {lang} = useLang(); const ru = lang === 'ru';
  const assets = useAssets(); const sel = useSelected(); const batchSel = useSelectedBatch();
  const [filter, setFilter] = useState<CategoryId | 'all'>('all');
  const [picked, setPicked] = useState<string[]>([]);
  const a = sel ? intake.get(sel) : null; const b = batchSel ? batches.get(batchSel) : null;
  return <div className="ik" data-testid="intake-pane">
    <Sidebar ru={ru} assets={assets} sel={sel} batchSel={batchSel} filter={filter} setFilter={setFilter} picked={picked} setPicked={setPicked}/>
    <main className="ik-main">
      {b ? <BatchView ru={ru} b={b}/> : a ? <AssetView ru={ru} a={a}/> : <Welcome ru={ru}/>}
    </main>
  </div>;
}
function Welcome({ru}: {ru: boolean}) {
  const steps = ru
    ? [['⇣', 'Принять', 'Бросьте файл в любое место портала, вставьте Ctrl+V или выберите. Можно сразу 10–50 файлов: они станут пакетом.'], ['⌕', 'Распознать', 'Формат определяется по содержимому, а не по расширению. Категорию (чек, инвойс, инструкция…) предложит приёмная.'], ['⟳', 'Привести', 'Всё становится страницами WebP + текстом Markdown + карточкой JSON. Это видят доска, блокнот и агент.'], ['➜', 'Отправить', 'На доску, в блокнот, в энциклопедию или агенту на телефон: «разберись с этим».']]
    : [['⇣', 'Receive', 'Drop a file anywhere in the portal, paste with Ctrl+V or pick one. 10–50 files at once become a batch.'], ['⌕', 'Recognise', 'The format is read from the bytes, not the extension. The Inbox suggests a category (receipt, invoice, manual…).'], ['⟳', 'Convert', 'Everything becomes WebP pages + Markdown text + a JSON card that the board, notebook and agent understand.'], ['➜', 'Route', 'To the board, the notebook, the encyclopedia, or to the agent on your phone: “work this out”.']];
  return <div className="ik-welcome">
    <DropZone ru={ru}/>
    <ol>{steps.map(([i, t, d]) => <li key={t}><b>{i}</b><strong>{t}</strong><span>{d}</span></li>)}</ol>
    <div className="ik-welcome-cats">{CATEGORIES.map(c => <span key={c.id} title={ru ? c.hintRu : c.hintEn}>{c.icon} {ru ? c.ru : c.en}</span>)}</div>
  </div>;
}
