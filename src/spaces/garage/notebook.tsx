// Notebook tab: white-sheet editor + ask highlights/popups + history.
import {useEffect, useRef, useState, useCallback, type MouseEvent as ReactMouseEvent} from 'react';
import {
  loadPages, upsertPage, createDayPage, pagesOnDate, setLeafText, appendLeaf,
  exportPageJson, exportPageMd, pushAsk, loadAsk, subscribeAsk,
  loadAskPopupEnabled, saveAskPopupEnabled, renderLeafHtml, reanchorAsksForLeaf,
  buildAskMeta, splitReplyParagraphs, todayISO, formatDate,
  insertAskVariant, removeAskInsert, autofillAskInserts, normalizeAskVariants, loadPresetState,
  type DayPage, type AskItem, type AskTarget, type AskAnchor,
} from './pages';
import {contextTags, type PresetId} from './presets';
import {useGarageT} from './i18n';
import {communication} from '../communication/store';
import {garageView} from './view';
import {MediaStrip, notebookDropProps, exportNotebookPdf} from './NotebookMedia';
import {mediaForExport} from './notebook-media';

function download(name: string, body: string, mime: string) {
  const a = document.createElement('a'); a.href = URL.createObjectURL(new Blob([body], {type: mime})); a.download = name; a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 2000);
}

function mediaMd(pageId: string) {
  const m = mediaForExport(pageId); const out: string[] = [];
  for (const [leaf, list] of Object.entries(m)) for (const x of list) out.push(`- p. ${leaf}: ${x.kind === 'stamp' ? '📅 ' + x.stamp : (x.kind === 'favorite' ? '★ ' : '') + x.title}${x.url ? ' — ' + x.url : ''}`);
  return out.length ? '\n## Attachments\n\n' + out.join('\n') + '\n' : '';
}

function useAskList() {
  const [list, setList] = useState<AskItem[]>(() => loadAsk());
  useEffect(() => {
    const refresh = () => setList(loadAsk());
    const unsub = subscribeAsk(refresh);
    window.addEventListener('sunrise.garage.ask', refresh);
    const tmr = setInterval(refresh, 2000);
    return () => { unsub(); window.removeEventListener('sunrise.garage.ask', refresh); clearInterval(tmr); };
  }, []);
  return list;
}

function usePopupToggle() {
  const [on, setOn] = useState(() => loadAskPopupEnabled());
  useEffect(() => {
    const refresh = () => setOn(loadAskPopupEnabled());
    window.addEventListener('sunrise.garage.askPopup', refresh);
    window.addEventListener('storage', refresh);
    return () => { window.removeEventListener('sunrise.garage.askPopup', refresh); window.removeEventListener('storage', refresh); };
  }, []);
  const set = (v: boolean) => { saveAskPopupEnabled(v); setOn(v); };
  return [on, set] as const;
}

function Toast({text, onDone}: {text: string; onDone: () => void}) {
  useEffect(() => { const id = setTimeout(onDone, 1400); return () => clearTimeout(id); }, [onDone]);
  return <div className="gr-toast" data-testid="gr-toast">{text}</div>;
}

function ReplyParts({text, onCopy}: {text: string; onCopy: (s: string) => void}) {
  const {t} = useGarageT();
  const parts = splitReplyParagraphs(text);
  if (!parts.length) return <p className="hint">{t('askWaiting')}</p>;
  return <div className="gr-reply-parts">{parts.map((para, i) =>
    <p key={i} className="gr-reply-para" data-testid="gr-reply-para" onClick={() => onCopy(para)}>{para}</p>)}</div>;
}

/** Place popup to the RIGHT of the notebook editor, aligned with the mark line; clamp to viewport. */
export function placeAskPopupRight(editor: HTMLElement | null, mark: HTMLElement, popW = 300, popH = 180) {
  const gap = 12;
  const markR = mark.getBoundingClientRect();
  const edR = editor?.getBoundingClientRect();
  let x = (edR ? edR.right + gap : markR.right + gap);
  let y = markR.top;
  const maxX = Math.max(8, window.innerWidth - popW - 8);
  const maxY = Math.max(8, window.innerHeight - popH - 8);
  x = Math.max(8, Math.min(x, maxX));
  y = Math.max(8, Math.min(y, maxY));
  return {x, y};
}

function AskHoverPopup({ask, x, y, onClose, onCopy, onPickVariant, onRemoveInsert}: {
  ask: AskItem; x: number; y: number; onClose: () => void; onCopy: (s: string) => void;
  onPickVariant: (n: number) => void; onRemoveInsert: () => void;
}) {
  const {t} = useGarageT();
  const ref = useRef<HTMLDivElement>(null);
  const [pos, setPos] = useState({x, y});
  const drag = useRef<{ox: number; oy: number} | null>(null);
  const busy = useRef(false);

  // Reset to right-side placement on each open
  useEffect(() => { setPos({x, y}); }, [x, y, ask.id]);

  // Clamp after mount with real size
  useEffect(() => {
    const el = ref.current; if (!el) return;
    const w = el.offsetWidth, h = el.offsetHeight;
    setPos(p => ({
      x: Math.max(8, Math.min(p.x, window.innerWidth - w - 8)),
      y: Math.max(8, Math.min(p.y, window.innerHeight - h - 8)),
    }));
  }, [ask.id, x, y]);

  useEffect(() => {
    const onMove = (e: MouseEvent) => {
      if (!drag.current) return;
      busy.current = true;
      const el = ref.current;
      const w = el?.offsetWidth || 280, h = el?.offsetHeight || 160;
      let nx = e.clientX - drag.current.ox;
      let ny = e.clientY - drag.current.oy;
      nx = Math.max(8, Math.min(nx, window.innerWidth - w - 8));
      ny = Math.max(8, Math.min(ny, window.innerHeight - h - 8));
      setPos({x: nx, y: ny});
    };
    const onUp = () => {
      if (drag.current) {
        drag.current = null;
        setTimeout(() => { busy.current = false; }, 0);
      }
    };
    document.addEventListener('mousemove', onMove);
    document.addEventListener('mouseup', onUp);
    return () => { document.removeEventListener('mousemove', onMove); document.removeEventListener('mouseup', onUp); };
  }, []);

  const onHeaderDown = (e: ReactMouseEvent) => {
    if ((e.target as HTMLElement).closest('button')) return;
    e.preventDefault();
    drag.current = {ox: e.clientX - pos.x, oy: e.clientY - pos.y};
  };

  return <div
    ref={ref}
    className="gr-ask-popup"
    data-testid="gr-ask-popup"
    style={{left: pos.x, top: pos.y}}
    onMouseLeave={() => { if (!drag.current && !busy.current) onClose(); }}
  >
    <div className="gr-ask-popup-h" data-testid="gr-ask-popup-drag" onMouseDown={onHeaderDown}>
      <span>{t('askQLabel', {n: ask.qNum})}</span>
      <button type="button" className="gr-ask-popup-x" data-testid="gr-ask-popup-close"
        aria-label={t('askPopupClose')} onClick={onClose}>×</button>
    </div>
    {ask.reply
      ? <>
          <small className="gr-bot-label">{t('grokBotLabel')}</small>
          {(() => {
            const vars = (ask.variants && ask.variants.length) ? ask.variants : normalizeAskVariants(ask.reply || '');
            if (vars.length) {
              return <div className="gr-ask-variants" data-testid="gr-ask-variants">
                <div className="gr-ask-variants-t">{t('askVariantsTitle')}</div>
                {vars.map((v, i) => {
                  const n = i + 1;
                  const on = ask.insertedVariant === n;
                  return <button type="button" key={n} className={'gr-ask-var' + (on ? ' on' : '')}
                    data-testid={'gr-ask-var-' + n} onClick={() => onPickVariant(n)}>
                    <span className="gr-ask-var-n">{n}</span>
                    <span>{v}</span>
                    {on ? <span className="gr-ask-var-badge">{t('askInsertedMark')}</span> : null}
                  </button>;
                })}
                {ask.insertAnchor ? <button type="button" className="gr-ask-remove-insert gr-plate"
                  data-testid="gr-ask-remove-insert" onClick={onRemoveInsert}>{t('askRemoveInsert')} ×</button> : null}
              </div>;
            }
            return null;
          })()}
          <ReplyParts text={ask.reply} onCopy={onCopy}/>
        </>
      : <p className="hint" data-testid="gr-ask-waiting">{t('askWaiting')}</p>}
  </div>;
}

function selectionOffsets(root: HTMLElement): {start: number; end: number; text: string} | null {
  const sel = window.getSelection();
  if (!sel || sel.rangeCount === 0 || sel.isCollapsed) return null;
  const range = sel.getRangeAt(0);
  if (!root.contains(range.commonAncestorContainer)) return null;
  const pre = document.createRange();
  pre.selectNodeContents(root);
  pre.setEnd(range.startContainer, range.startOffset);
  const start = pre.toString().length;
  const text = range.toString();
  if (!text.trim()) return null;
  return {start, end: start + text.length, text};
}

export function AskMenu({x, y, text, anchor, tags, popupOn, onTogglePopup, onClose}: {
  x: number; y: number; text: string; anchor: AskAnchor | null;
  tags: ReturnType<typeof contextTags> & {pageDate?: string | null; pageId?: string | null};
  popupOn: boolean; onTogglePopup: (v: boolean) => void; onClose: () => void;
}) {
  const {t} = useGarageT();
  const askLabels: Record<AskTarget, string> = {
    grok: `${t('askTagAsk')} Grok`,
    gpt: `${t('askTagAsk')} GPT`,
    gemini: `${t('askTagAsk')} Gemini`,
    claude: `${t('askTagAsk')} Claude`,
  };
  const send = (target: AskTarget) => {
    const meta = buildAskMeta({
      target, askLabel: askLabels[target],
      space: tags.preset, topic: tags.subPreset, date: tags.pageDate || todayISO(),
    });
    pushAsk({
      text: text.slice(0, 1800), target,
      preset: tags.preset, presetId: tags.presetId, subPreset: tags.subPreset, subPresetId: tags.subPresetId,
      prompt: tags.prompt, header: meta.header, tag: meta.tag,
      pageDate: tags.pageDate || todayISO(), pageId: tags.pageId || null,
      anchor,
    });
    communication.add({text: meta.header + '\n\n' + text.slice(0, 1600), role: 'user', contact: 'agent', source: t('askDockSource'), kind: 'info'} as any);
    garageView.set({tab: 'notebook'});
    onClose();
  };
  return <div className="gr-askmenu" style={{left: x, top: y}} data-testid="gr-askmenu" onContextMenu={e => e.preventDefault()}>
    <div className="gr-askmenu-t">{t('askTitle')}</div>
    {(['claude', 'grok', 'gpt', 'gemini'] as AskTarget[]).map(tg =>
      <button key={tg} type="button" data-testid={'gr-ask-' + tg} onClick={() => send(tg)}>{askLabels[tg]}</button>)}
    <label className="gr-askmenu-check" data-testid="gr-ask-popup-toggle">
      <input type="checkbox" checked={popupOn} onChange={e => onTogglePopup(e.target.checked)}/>
      <span>{t('askPopupToggle')}</span>
    </label>
    <button type="button" className="muted" onClick={onClose}>{t('askCancel')}</button>
  </div>;
}

function AskHistory({asks}: {asks: AskItem[]}) {
  const {t} = useGarageT();
  const [toast, setToast] = useState(false);
  const copy = async (s: string) => {
    try { await navigator.clipboard.writeText(s); } catch {
      const ta = document.createElement('textarea'); ta.value = s; document.body.appendChild(ta); ta.select(); document.execCommand('copy'); ta.remove();
    }
    setToast(true);
  };
  return <div className="gr-ask-history" data-testid="gr-ask-history">
    <h3>{t('askHistoryTitle')}</h3>
    {!asks.length ? <p className="hint">{t('askHistoryEmpty')}</p> :
      <div className="gr-ask-history-list">
        {asks.map(a => <div key={a.id} className="gr-ask-hist-item" data-testid="gr-ask-hist-item">
          <div className="gr-ask-hist-q">
            <div className="gr-ask-hist-head"><span className="gr-qnum">#{a.qNum}</span> <small>{a.header}</small></div>
            <p className="gr-ask-hist-quote" data-testid="gr-ask-hist-quote">«{a.text}»?</p>
            {(() => {
              const vars = (a.variants && a.variants.length) ? a.variants : (a.reply ? normalizeAskVariants(a.reply) : []);
              if (!vars.length) return null;
              return <div className="gr-ask-hist-vars" data-testid="gr-ask-hist-vars">
                {vars.map((v, i) => {
                  const n = i + 1;
                  return <span key={n} className={'gr-ask-hist-var' + (a.insertedVariant === n ? ' on' : '')}
                    data-testid={'gr-ask-hist-var-' + n}>{n}. {v}</span>;
                })}
              </div>;
            })()}
          </div>
          <div className="gr-ask-hist-a" data-testid="gr-agent-reply">
            {a.reply
              ? <><small className="gr-bot-label" data-testid="gr-bot-label">{t('grokBotLabel')}</small>
                  <ReplyParts text={a.reply} onCopy={copy}/></>
              : <p className="hint">{t('askWaiting')}</p>}
          </div>
        </div>)}
      </div>}
    {toast && <Toast text={t('copiedToast')} onDone={() => setToast(false)}/>}
  </div>;
}

function WhiteSheet({page, asks, popupOn, focus, onChange, onEnterFocus, onExitFocus}: {
  page: DayPage; asks: AskItem[]; popupOn: boolean; focus: boolean;
  onChange: () => void; onEnterFocus: () => void; onExitFocus: () => void;
}) {
  const {t, lang, locale} = useGarageT();
  const leaf = page.leaves.find(l => l.n === page.leaf) || page.leaves[0];
  const text = leaf?.text || '';
  const ed = useRef<HTMLDivElement>(null);
  const skip = useRef(false);
  const [menu, setMenu] = useState<{x: number; y: number; text: string; anchor: AskAnchor} | null>(null);
  const [openAsk, setOpenAsk] = useState<{ask: AskItem; x: number; y: number} | null>(null);
  const [toast, setToast] = useState(false);
  const [autofillN, setAutofillN] = useState<number | null>(null);
  const [, setPopup] = usePopupToggle();
  // Ask with the space/topic selected now; a page keeps no stale topic from the moment it was created.
  const ps = loadPresetState();
  const tags = contextTags(lang, ps.preset, ps.chip);

  const paint = useCallback(() => {
    const el = ed.current; if (!el) return;
    const html = renderLeafHtml(text, asks, page.id, page.leaf, popupOn);
    if (el.innerHTML !== html) {
      skip.current = true;
      el.innerHTML = html || '<br>';
      skip.current = false;
    }
  }, [text, asks, page.id, page.leaf, popupOn]);

  useEffect(() => { paint(); }, [paint]);

  // Keep popup ask object fresh when variants/insert change.
  useEffect(() => {
    if (!openAsk) return;
    const fresh = asks.find(a => a.id === openAsk.ask.id);
    if (fresh && fresh !== openAsk.ask) setOpenAsk({...openAsk, ask: fresh});
  }, [asks, openAsk]);

  // Popup opens on click only (not hover); closes when leaving popup or clicking outside.
  useEffect(() => {
    if (!openAsk) return;
    const onDown = (ev: MouseEvent) => {
      const t = ev.target as HTMLElement | null;
      if (!t) return;
      if (t.closest('.gr-ask-popup') || t.closest('mark.gr-ask-mark')) return;
      setOpenAsk(null);
    };
    document.addEventListener('mousedown', onDown);
    return () => document.removeEventListener('mousedown', onDown);
  }, [openAsk]);

  const saveText = (nextText: string) => {
    const r = setLeafText(page.leaves, page.leaf, nextText);
    upsertPage({...page, leaves: r.leaves, leaf: r.leaf});
    reanchorAsksForLeaf(page.id, page.leaf, nextText);
    onChange();
  };

  const onInput = () => {
    if (skip.current) return;
    const el = ed.current; if (!el) return;
    const next = el.innerText.replace(/\u00a0/g, ' ');
    // Avoid trailing newline artifact from contenteditable
    const normalized = next.endsWith('\n') ? next.slice(0, -1) : next;
    saveText(normalized);
  };

  const openMarkPopup = (mark: HTMLElement) => {
    if (!popupOn) return false;
    const id = mark.getAttribute('data-ask-id');
    const ask = asks.find(a => a.id === id);
    if (!ask) return false;
    setMenu(null);
    const place = placeAskPopupRight(ed.current, mark);
    setOpenAsk({ask, x: place.x, y: place.y});
    return true;
  };

  const onCtx = (e: ReactMouseEvent) => {
    const el = ed.current; if (!el) return;
    const mark = (e.target as HTMLElement).closest('mark.gr-ask-mark') as HTMLElement | null;
    if (mark && openMarkPopup(mark)) {
      e.preventDefault();
      return;
    }
    const off = selectionOffsets(el);
    if (!off) return;
    e.preventDefault();
    setOpenAsk(null);
    setMenu({
      x: e.clientX, y: e.clientY, text: off.text,
      anchor: {pageId: page.id, leaf: page.leaf, start: off.start, end: off.end, quote: off.text.slice(0, 500)},
    });
  };

  const onEditorClick = (e: ReactMouseEvent) => {
    const mark = (e.target as HTMLElement).closest('mark.gr-ask-mark') as HTMLElement | null;
    if (mark && openMarkPopup(mark)) {
      e.preventDefault();
    }
  };

  const copy = async (s: string) => {
    try { await navigator.clipboard.writeText(s); } catch {
      const ta = document.createElement('textarea'); ta.value = s; document.body.appendChild(ta); ta.select(); document.execCommand('copy'); ta.remove();
    }
    setToast(true);
  };

  const tools = <div className="gr-page-tools">
    <button type="button" onClick={() => { upsertPage({...page, leaf: Math.max(1, page.leaf - 1)}); onChange(); }} disabled={page.leaf <= 1}>←</button>
    <span>{t('pageOf', {n: page.leaf, total: page.leaves.length})}</span>
    <button type="button" onClick={() => {
      if (page.leaf >= page.leaves.length) {
        const leaves = appendLeaf(page.leaves).leaves;
        upsertPage({...page, leaves, leaf: leaves.length});
      } else upsertPage({...page, leaf: page.leaf + 1});
      onChange();
    }}>→</button>
    <button type="button" data-testid="gr-page-save" onClick={() => { upsertPage(page); onChange(); }}>{t('save')}</button>
    <button type="button" onClick={() => download(`garage-${page.date}.json`, JSON.stringify({...JSON.parse(exportPageJson(page)), media: mediaForExport(page.id)}, null, 2), 'application/json')}>{t('exportJson')}</button>
    <button type="button" onClick={() => download(`garage-${page.date}.md`, exportPageMd(page) + mediaMd(page.id), 'text/markdown')}>{t('exportMd')}</button>
    <button type="button" data-testid="gr-export-pdf" onClick={() => { void exportNotebookPdf(page, text, page.leaf); }}>PDF</button>
    <button type="button" data-testid="gr-ask-autofill" className="gr-plate"
      onClick={() => {
        const ids = loadPages().filter(p => p.date === page.date).map(p => p.id);
        const r = autofillAskInserts(ids.length ? ids : [page.id]);
        onChange();
        setToast(true);
        setAutofillN(r.inserted);
      }}>{t('askAutofill')}</button>
    {!focus && <button type="button" data-testid="gr-page-focus" className="gr-btn-primary" onClick={onEnterFocus}>{t('focusOpen')}</button>}
    {focus && <button type="button" data-testid="gr-page-exit" className="gr-btn-primary" onClick={onExitFocus}>{t('focusExit')}</button>}
  </div>;

  const sheet = <>
    {focus ? <div className="gr-page-head">
      <div className="gr-page-date" data-testid="gr-page-date">
        <strong>{formatDate(page.date, locale)}</strong>
        <span className="params">{tags.preset}{tags.subPreset ? ' · ' + tags.subPreset : ''}</span>
      </div>
    </div> : null}
    <div
      ref={ed}
      className="gr-page-editor gr-white-sheet"
      data-testid="gr-page-editor"
      contentEditable
      suppressContentEditableWarning
      role="textbox"
      aria-multiline="true"
      data-placeholder={t('pagePlaceholderDiary')}
      onInput={onInput}
      onContextMenu={onCtx}
      onClick={onEditorClick}
    />
    <MediaStrip pageId={page.id} leaf={page.leaf}/>
    {tools}
    {menu && <AskMenu x={menu.x} y={menu.y} text={menu.text} anchor={menu.anchor}
      tags={{...tags, pageDate: page.date, pageId: page.id}}
      popupOn={popupOn} onTogglePopup={v => { setPopup(v); }}
      onClose={() => setMenu(null)}/>}
    {openAsk && popupOn && <AskHoverPopup ask={openAsk.ask} x={openAsk.x} y={openAsk.y}
      onClose={() => setOpenAsk(null)} onCopy={copy}
      onPickVariant={n => { insertAskVariant(openAsk.ask.id, n); onChange(); }}
      onRemoveInsert={() => { removeAskInsert(openAsk.ask.id); onChange(); }}/>}
    {toast && <Toast text={autofillN != null ? t('askAutofillDone', {n: autofillN}) : t('copiedToast')}
      onDone={() => { setToast(false); setAutofillN(null); }}/>}
  </>;

  if (focus) return <div className="gr-focus" data-testid="gr-focus" {...notebookDropProps()}>{sheet}</div>;
  return <div className="gr-page" data-testid="gr-page" {...notebookDropProps()}>{sheet}</div>;
}

export function NotebookPane({date, preset, chip, focusId, setFocusId}: {
  date: string; preset: PresetId; chip: string | null; focusId: string | null; setFocusId: (id: string | null) => void;
}) {
  const {t, locale} = useGarageT();
  const [, tick] = useState(0); const refresh = () => tick(n => n + 1);
  const asks = useAskList();
  useEffect(() => subscribeAsk(refresh), []);
  const [popupOn] = usePopupToggle();
  const list = pagesOnDate(date, 'notebook');
  const active = (focusId && loadPages().find(p => p.id === focusId)) || list[0] || null;

  if (focusId && active) {
    return <WhiteSheet page={active} asks={asks} popupOn={popupOn} focus
      onChange={refresh} onEnterFocus={() => setFocusId(active.id)} onExitFocus={() => setFocusId(null)}/>;
  }

  return <div className="gr-notebook" data-testid="gr-notebook">
    {active
      ? <WhiteSheet page={active} asks={asks} popupOn={popupOn} focus={false}
          onChange={refresh} onEnterFocus={() => setFocusId(active.id)} onExitFocus={() => setFocusId(null)}/>
      : <p className="hint">{t('noDayEntry', {date: formatDate(date, locale)})}</p>}
    <AskHistory asks={asks}/>
  </div>;
}

export function ensureNotebookPage(date: string, preset: PresetId, chip: string | null, title: string) {
  const list = pagesOnDate(date, 'notebook');
  if (list.length) return list[0];
  const p = createDayPage({kind: 'notebook', date, preset, subPreset: chip, title});
  upsertPage(p);
  return p;
}
