// Picture (Картинка) editor: crop, cut/copy/paste, arrows, frames, text, marker, pen, blur, adjust.
import {useEffect, useRef, useState} from 'react';
import {useLang} from '../../hooks/useLang';
import {useAssets, ingest} from '../intake/store';
import {useBlobUrl} from '../intake/useBlobUrl';
import {picture, usePicture, clipboard, uid, normRect, bbox, moveObj, type Pt, type Rect, type Obj} from './model';
import {drawDoc, openPicture, rotateRight, flipH, copyRegion, cutRegion, pasteImage, savePicture, downloadPicture} from './render';
import './picture.css';

type Tool = 'move' | 'select' | 'crop' | 'level' | 'arrow' | 'rect' | 'ellipse' | 'highlight' | 'pen' | 'text' | 'pixelate';
const TOOLS: [Tool, string, string, string][] = [
  ['move', '✥', 'Двигать', 'Move'], ['select', '⬚', 'Выделить', 'Select'], ['crop', '⌗', 'Обрезать', 'Crop'], ['level', '📐', 'Уровень', 'Level'],
  ['arrow', '➚', 'Стрелка', 'Arrow'], ['rect', '▭', 'Рамка', 'Frame'], ['ellipse', '◯', 'Овал', 'Oval'],
  ['highlight', '▬', 'Маркер', 'Marker'], ['pen', '✎', 'Карандаш', 'Pen'], ['text', 'T', 'Текст', 'Text'], ['pixelate', '▦', 'Скрыть', 'Blur'],
];
const COLORS = ['#e5383b', '#ff8c42', '#f5b54a', '#2fbf71', '#3d7bfd', '#9b5de5', '#ff6fb5', '#1f2433', '#ffffff'];
const STICKERS = ['⭐', '❤️', '😀', '😂', '😎', '🌈', '☀️', '🌸', '🐱', '🐶', '🦄', '🎈', '👑', '🔥', '👍', '✅', '❗', '💬'];
function OverlayThumb({refId, onPick}: {refId: string; onPick: () => void}) { const u = useBlobUrl(refId); return <button type="button" className="pc-ovl-item" onClick={onPick}>{u ? <img src={u} alt=""/> : <span/>}</button>; }

// Tools are also settable from outside (agent, demo).
let toolState: {tool: Tool; color: string; width: number; text: string; sel: Rect | null} = {tool: 'arrow', color: '#e5383b', width: 6, text: '', sel: null};
const toolSubs = new Set<() => void>();
export const pictureUi = {
  get: () => toolState,
  set(p: Partial<typeof toolState>) { toolState = {...toolState, ...p}; toolSubs.forEach(f => f()); },
};
function useTool() { const [, f] = useState(0); useEffect(() => { const g = () => f(n => n + 1); toolSubs.add(g); return () => { toolSubs.delete(g); }; }, []); return toolState; }

function Picker({ru}: {ru: boolean}) {
  const assets = useAssets().filter(a => a.pages.length && a.status !== 'failed');
  const input = useRef<HTMLInputElement>(null);
  return <div className="pc-picker">
    <h3>✂ {ru ? 'Картинка: обрезать, вырезать, вставить, подписать' : 'Picture: crop, cut, paste, annotate'}</h3>
    <p>{ru ? 'Выберите картинку из Приёмной или откройте файл. Готовый результат сохраняется новой картинкой и уходит на доску или в блокнот.' : 'Pick an image from the Inbox or open a file. The result is saved as a new image and can go to the board or notebook.'}</p>
    <button type="button" className="pc-open" onClick={() => input.current?.click()}>⇣ {ru ? 'Открыть файл' : 'Open a file'}</button>
    <input ref={input} type="file" accept="image/*,.heic,.tif,.tiff,.pdf" hidden onChange={async e => { const f = e.target.files?.[0]; if (!f) return; const a = await ingest(f, {select: false}); if (a.pages[0]) await openPicture(a.pages[0].ref, a.name, a.id); }}/>
    <div className="pc-grid">{assets.flatMap(a => a.pages.slice(0, a.family === 'pdf' ? 4 : 1).map(p => <PickThumb key={a.id + p.n} refId={p.ref} label={a.pages.length > 1 ? `${a.name} · ${p.n}` : a.name} onPick={() => openPicture(p.ref, a.name, a.id)}/>))}</div>
    {!assets.length && <p className="pc-empty">{ru ? 'В Приёмной пока нет картинок.' : 'No images in the Inbox yet.'}</p>}
  </div>;
}
function PickThumb({refId, label, onPick}: {refId: string; label: string; onPick: () => void}) {
  const u = useBlobUrl(refId);
  return <button type="button" className="pc-thumb" onClick={onPick} title={label}>{u ? <img src={u} alt=""/> : <span/>}<small>{label}</small></button>;
}

export function PicturePane() {
  const {lang} = useLang(); const ru = lang === 'ru';
  const st = usePicture(); const ui = useTool();
  const d = st.doc;
  const wrap = useRef<HTMLDivElement>(null), cv = useRef<HTMLCanvasElement>(null);
  const [size, setSize] = useState({w: 800, h: 500});
  const [draft, setDraft] = useState<Obj | null>(null);
  const [cropDraft, setCropDraft] = useState<Rect | null>(null);
  const [selObj, setSelObj] = useState<string | null>(null);
  const [flash, setFlash] = useState<string | null>(null);
  const [overlay, setOverlay] = useState(false);
  const [gridOn, setGridOn] = useState(false);
  const gridTimer = useRef<any>(null);
  const showGrid = () => { setGridOn(true); clearTimeout(gridTimer.current); gridTimer.current = setTimeout(() => setGridOn(false), 1600); };
  const overlayInput = useRef<HTMLInputElement>(null);
  const allAssets = useAssets();
  const drag = useRef<{start: Pt; mode: string; id?: string; last?: Pt; pts?: Pt[]} | null>(null);
  const view: Rect = d ? (d.crop || {x: 0, y: 0, w: d.w, h: d.h}) : {x: 0, y: 0, w: 1, h: 1};
  const scale = Math.min(size.w / view.w, size.h / view.h);

  useEffect(() => { const el = wrap.current; if (!el) return; const ro = new ResizeObserver(() => setSize({w: el.clientWidth - 4, h: Math.max(260, el.clientHeight - 4)})); ro.observe(el); return () => ro.disconnect(); }, [d?.id]);

  // Render: document, then the in-progress shape, selection and crop preview.
  useEffect(() => {
    let live = true; const c = cv.current; if (!c || !d) return;
    (async () => {
      const W = Math.round(view.w * scale), H = Math.round(view.h * scale);
      const off = document.createElement('canvas'); off.width = W; off.height = H; const x = off.getContext('2d')!;
      x.setTransform(scale, 0, 0, scale, -view.x * scale, -view.y * scale);
      await drawDoc(x, draft ? {...d, objects: [...d.objects, draft]} : d);
      x.setTransform(scale, 0, 0, scale, -view.x * scale, -view.y * scale);
      x.lineWidth = 1.5 / scale; x.setLineDash([6 / scale, 4 / scale]);
      if (ui.tool === 'level' || gridOn) {
        // Levelling grid: thin double lines so they read on light and dark photos.
        x.setLineDash([]); const n = 8;
        for (const [col, lw] of [['#0006', 2.2 / scale], ['#fffc', 1 / scale]] as const) {
          x.strokeStyle = col; x.lineWidth = lw; x.beginPath();
          for (let i = 1; i < n; i++) { const gx = view.x + view.w * i / n, gy = view.y + view.h * i / n; x.moveTo(gx, view.y); x.lineTo(gx, view.y + view.h); x.moveTo(view.x, gy); x.lineTo(view.x + view.w, gy); }
          x.stroke();
        }
        x.lineWidth = 1.5 / scale; x.setLineDash([6 / scale, 4 / scale]);
      }
      if (ui.sel) { x.strokeStyle = '#3d7bfd'; x.strokeRect(ui.sel.x, ui.sel.y, ui.sel.w, ui.sel.h); }
      const so = d.objects.find(o => o.id === selObj); if (so) { const b = bbox(so); x.strokeStyle = '#3d7bfd'; x.strokeRect(b.x - 4 / scale, b.y - 4 / scale, b.w + 8 / scale, b.h + 8 / scale); if (so.type === 'image' || so.type === 'text') { x.setLineDash([]); x.fillStyle = '#3d7bfd'; x.fillRect(b.x + b.w - 6 / scale, b.y + b.h - 6 / scale, 12 / scale, 12 / scale); } }
      if (cropDraft) { x.setLineDash([]); x.fillStyle = '#0008'; x.fillRect(view.x, view.y, view.w, cropDraft.y - view.y); x.fillRect(view.x, cropDraft.y + cropDraft.h, view.w, view.h); x.fillRect(view.x, cropDraft.y, cropDraft.x - view.x, cropDraft.h); x.fillRect(cropDraft.x + cropDraft.w, cropDraft.y, view.w, cropDraft.h); x.strokeStyle = '#fff'; x.strokeRect(cropDraft.x, cropDraft.y, cropDraft.w, cropDraft.h); }
      if (!live) return;
      c.width = W; c.height = H; c.getContext('2d')!.drawImage(off, 0, 0);
    })();
    return () => { live = false; };
  }, [d, draft, cropDraft, ui.sel, ui.tool, gridOn, selObj, scale, view.x, view.y, view.w, view.h]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (!d || (e.target as HTMLElement)?.closest?.('input,textarea')) return;
      if ((e.key === 'Delete' || e.key === 'Backspace') && selObj) { picture.change(doc => ({...doc, objects: doc.objects.filter(o => o.id !== selObj)})); setSelObj(null); }
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'z') { e.preventDefault(); e.shiftKey ? picture.redo() : picture.undo(); }
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'c' && ui.sel) { void copyRegion(ui.sel).then(() => say(ru ? 'Скопировано' : 'Copied')); }
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'x' && ui.sel) { void cutRegion(ui.sel).then(() => say(ru ? 'Вырезано' : 'Cut')); }
    };
    window.addEventListener('keydown', onKey); return () => window.removeEventListener('keydown', onKey);
  }, [d, selObj, ui.sel]);

  const say = (t: string) => { setFlash(t); setTimeout(() => setFlash(null), 2200); };
  const act = async (fn: () => Promise<unknown> | unknown, ok?: string) => { try { await fn(); if (ok) say(ok); } catch (e) { say('⚠ ' + String((e as Error).message || e)); } };
  if (!d) return <div className="pc" data-testid="picture-pane"><Picker ru={ru}/></div>;

  const toBase = (e: React.PointerEvent): Pt => { const r = cv.current!.getBoundingClientRect(); return {x: (e.clientX - r.left) / scale + view.x, y: (e.clientY - r.top) / scale + view.y}; };
  const hit = (p: Pt) => [...d.objects].reverse().find(o => { const b = bbox(o); const m = 6 / scale; return p.x >= b.x - m && p.x <= b.x + b.w + m && p.y >= b.y - m && p.y <= b.y + b.h + m; });
  const down = (e: React.PointerEvent) => {
    (e.target as HTMLElement).setPointerCapture(e.pointerId);
    const p = toBase(e); const t = ui.tool;
    if (t === 'move') {
      const so = d.objects.find(o => o.id === selObj);
      if (so && (so.type === 'image' || so.type === 'text')) { const b = bbox(so); if (Math.abs(p.x - (b.x + b.w)) < 16 / scale && Math.abs(p.y - (b.y + b.h)) < 16 / scale) { picture.change(x => x); drag.current = {start: p, mode: 'resize', id: so.id, last: p}; return; } }
      const o = hit(p); setSelObj(o?.id || null); if (o) { picture.change(x => x); drag.current = {start: p, mode: 'move', id: o.id, last: p}; }
      return;
    }
    if (t === 'text') { const id = uid(); picture.change(x => ({...x, objects: [...x.objects, {id, type: 'text', at: p, text: ui.text.trim() || (ru ? 'Текст' : 'Text'), color: ui.color, size: Math.max(18, Math.round(Math.min(d.w, d.h) / 22)), bg: true}]})); setSelObj(id); pictureUi.set({tool: 'move'}); return; }
    drag.current = {start: p, mode: t, pts: [p]};
  };
  const moveP = (e: React.PointerEvent) => {
    const g = drag.current; if (!g) return; const p = toBase(e); const t = g.mode;
    const w = ui.width * Math.max(1, Math.min(d.w, d.h) / 900);
    if (t === 'move' || t === 'resize') {
      const dx = p.x - g.last!.x, dy = p.y - g.last!.y; g.last = p;
      picture.live(x => ({...x, objects: x.objects.map(o => o.id !== g.id ? o : t === 'move' ? moveObj(o, dx, dy) : o.type === 'image' ? {...o, r: {...o.r, w: Math.max(10, o.r.w + dx), h: Math.max(10, (o.r.w + dx) * o.r.h / o.r.w)}} : o.type === 'text' ? {...o, size: Math.max(10, o.size + dy)} : o)}));
    }
    else if (t === 'select') pictureUi.set({sel: normRect(g.start, p)});
    else if (t === 'crop') setCropDraft(normRect(g.start, p));
    else if (t === 'arrow') setDraft({id: 'draft', type: 'arrow', a: g.start, b: p, color: ui.color, width: w});
    else if (t === 'level') setDraft({id: 'draft', type: 'pen', pts: [g.start, p], color: '#3d7bfd', width: Math.max(2, 3 / scale)});
    else if (t === 'pen') { g.pts!.push(p); setDraft({id: 'draft', type: 'pen', pts: [...g.pts!], color: ui.color, width: w}); }
    else if (t === 'pixelate') setDraft({id: 'draft', type: 'pixelate', r: normRect(g.start, p), cell: Math.max(8, Math.round(Math.min(d.w, d.h) / 60))});
    else setDraft({id: 'draft', type: t as 'rect', r: normRect(g.start, p), color: ui.color, width: w});
  };
  const up = () => {
    const g = drag.current; drag.current = null; if (!g) return;
    if (g.mode === 'crop' && cropDraft && cropDraft.w > 8 && cropDraft.h > 8) { const r = cropDraft; picture.change(x => ({...x, crop: clampRect(r, x.w, x.h)})); }
    setCropDraft(null);
    if (g.mode === 'level') {
      const ln = draft && draft.type === 'pen' ? draft.pts : null; setDraft(null);
      if (ln && Math.hypot(ln[1].x - ln[0].x, ln[1].y - ln[0].y) > 20 / scale) { levelByLine(ln[0], ln[1]); showGrid(); }
      return;
    }
    if (draft) { const o = {...draft, id: uid()} as Obj; const b = bbox(o); if (b.w > 3 || b.h > 3 || o.type === 'pen') picture.change(x => ({...x, objects: [...x.objects, o]})); setDraft(null); }
  };
  const sel = ui.sel;
  const overlayAssets = allAssets.filter(a => a.pages.length && a.status !== 'failed' && a.family !== 'video' && a.family !== 'audio').slice(0, 40);
  return <div className="pc" data-testid="picture-pane">
    <input ref={overlayInput} type="file" accept="image/*,.heic" hidden onChange={async e => { const f = e.target.files?.[0]; if (!f) return; const a = await ingest(f, {select: false}); if (a.pages[0]) { const r = await pasteImage(a.pages[0].ref); setSelObj(r.layerId); pictureUi.set({tool: 'move'}); } e.target.value = ''; }}/>
    <div className="pc-bar">
      <div className="pc-tools" role="toolbar">{TOOLS.map(([id, ic, r, en]) => <button type="button" key={id} data-testid={'pc-tool-' + id} aria-pressed={ui.tool === id} title={ru ? r : en} onClick={() => { pictureUi.set({tool: id}); if (id !== 'select') pictureUi.set({sel: null}); }}><b>{ic}</b><span>{ru ? r : en}</span></button>)}</div>
      <div className="pc-style">
        {COLORS.map(c => <button type="button" key={c} className="pc-color" style={{background: c}} aria-pressed={ui.color === c} aria-label={c} onClick={() => { pictureUi.set({color: c}); if (selObj) picture.change(x => ({...x, objects: x.objects.map(o => o.id === selObj && 'color' in o ? {...o, color: c} as Obj : o)})); }}/>)}
        <input type="range" min={2} max={40} value={ui.width} onChange={e => pictureUi.set({width: +e.target.value})} aria-label={ru ? 'Толщина' : 'Width'}/>
        <input className="pc-text" value={ui.text} onChange={e => { pictureUi.set({text: e.target.value}); if (selObj) picture.live(x => ({...x, objects: x.objects.map(o => o.id === selObj && o.type === 'text' ? {...o, text: e.target.value} : o)})); }} placeholder={ru ? 'Текст подписи' : 'Label text'}/>
      </div>
    </div>
    <div className="pc-body">
      <div className="pc-stage" ref={wrap}>
        <canvas ref={cv} data-testid="pc-canvas" className={'pc-canvas pc-cur-' + ui.tool} onPointerDown={down} onPointerMove={moveP} onPointerUp={up} onPointerCancel={up}/>
      </div>
      <aside className="pc-side">
        <section><h5>{ru ? 'Изображение' : 'Image'}</h5>
          <div className="pc-row"><button type="button" onClick={() => act(rotateRight)}>⟳ 90°</button><button type="button" onClick={() => act(flipH)}>⇋</button><button type="button" disabled={!d.crop} onClick={() => picture.change(x => ({...x, crop: null}))}>{ru ? 'Без обрезки' : 'Uncrop'}</button></div>
          <div className="pc-row">
            <button type="button" data-testid="pc-bw" aria-pressed={d.adjust.saturate === 0} onClick={() => picture.change(x => ({...x, adjust: {...x.adjust, saturate: x.adjust.saturate === 0 ? 100 : 0}}))}>◐ {ru ? 'Ч/Б' : 'B/W'}</button>
            <button type="button" data-testid="pc-meme" onClick={() => { const v = d.crop || {x: 0, y: 0, w: d.w, h: d.h}; const size = Math.round(v.w / 11); const t = ui.text.trim() || (ru ? 'Когда купил плитку' : 'When you bought the tiles'); picture.change(x => ({...x, objects: [...x.objects, {id: uid(), type: 'text', meme: true, text: t, at: {x: v.x + v.w / 2, y: v.y + size * 1.15}, color: '#fff', size}, {id: uid(), type: 'text', meme: true, text: ru ? 'а она не подошла' : 'and it did not fit', at: {x: v.x + v.w / 2, y: v.y + v.h - size * 0.35}, color: '#fff', size}]})); }}>😂 {ru ? 'Мем' : 'Meme'}</button>
          </div>
          <div className="pc-level" data-testid="pc-level">
            <span>📐 {ru ? 'Уровень' : 'Level'} <b>{(d.angle || 0).toFixed(1)}°</b></span>
            <div className="pc-row">
              <button type="button" onClick={() => { picture.change(x => ({...x, angle: clampA((x.angle || 0) - 0.5)})); showGrid(); }}>−0,5°</button>
              <button type="button" onClick={() => { picture.change(x => ({...x, angle: clampA((x.angle || 0) + 0.5)})); showGrid(); }}>+0,5°</button>
              <button type="button" disabled={!d.angle} onClick={() => picture.change(x => ({...x, angle: 0}))}>0°</button>
            </div>
            <input type="range" min={-45} max={45} step={0.1} value={d.angle || 0} aria-label={ru ? 'Наклон' : 'Tilt'}
              onPointerDown={() => { picture.change(x => x); showGrid(); }} onChange={e => { picture.live(x => ({...x, angle: +e.target.value})); showGrid(); }}/>
            <small>{ru ? 'Или инструмент «Уровень»: проведите линию по горизонту или краю стола.' : 'Or use the Level tool: draw a line along the horizon or a table edge.'}</small>
          </div>
          {(['brightness', 'contrast', 'saturate'] as const).map(k => <label key={k} className="pc-slider"><span>{ru ? {brightness: 'Яркость', contrast: 'Контраст', saturate: 'Цвет'}[k] : k}</span><input type="range" min={30} max={180} value={d.adjust[k]} onChange={e => picture.live(x => ({...x, adjust: {...x.adjust, [k]: +e.target.value}}))} onPointerUp={() => picture.change(x => x)}/></label>)}
        </section>
        <section><h5>{ru ? 'Наложить' : 'Put on top'}</h5>
          <div className="pc-row"><button type="button" data-testid="pc-overlay" onClick={() => setOverlay(!overlay)}>🖼 {ru ? 'Фото сверху' : 'Photo on top'}</button>
            <button type="button" onClick={() => overlayInput.current?.click()}>⇣ {ru ? 'Файл' : 'File'}</button></div>
          {overlay && <div className="pc-ovl">{overlayAssets.map(a => <OverlayThumb key={a.id} refId={a.pages[0].ref} onPick={() => act(async () => { const r = await pasteImage(a.pages[0].ref); setSelObj(r.layerId); pictureUi.set({tool: 'move'}); setOverlay(false); }, ru ? 'Тяните, угол — размер' : 'Drag; corner resizes')}/>)}</div>}
          <div className="pc-stickers">{STICKERS.map(e => <button type="button" key={e} onClick={() => { const v = d.crop || {x: 0, y: 0, w: d.w, h: d.h}; const id = uid(); const size = Math.round(Math.min(v.w, v.h) / 6); picture.change(x => ({...x, objects: [...x.objects, {id, type: 'text', text: e, at: {x: v.x + v.w / 2 - size / 2 + (Math.random() - .5) * v.w / 3, y: v.y + v.h / 2 + size / 2 + (Math.random() - .5) * v.h / 3}, color: '#000', size}]})); setSelObj(id); pictureUi.set({tool: 'move'}); }} aria-label={e}>{e}</button>)}</div>
          <p className="pc-hint">{ru ? 'Всё — слои: двигать, менять размер за угол, удалить. При сохранении склеивается в одну картинку.' : 'Everything is a layer: drag, resize by the corner, delete. Saving merges it into one picture.'}</p>
        </section>
        <section><h5>{ru ? 'Выделение' : 'Selection'}</h5>
          <p className="pc-hint">{sel ? `${Math.round(sel.w)}×${Math.round(sel.h)}` : (ru ? 'Инструмент «Выделить» → обведите область' : 'Use Select and drag an area')}</p>
          <div className="pc-row">
            <button type="button" data-testid="pc-copy" disabled={!sel} onClick={() => act(() => copyRegion(sel!), ru ? 'Скопировано' : 'Copied')}>{ru ? 'Копировать' : 'Copy'}</button>
            <button type="button" disabled={!sel} onClick={() => act(() => cutRegion(sel!), ru ? 'Вырезано' : 'Cut')}>{ru ? 'Вырезать' : 'Cut'}</button>
            <button type="button" data-testid="pc-paste" disabled={!clipboard.get()} onClick={() => act(async () => { const r = await pasteImage(); setSelObj(r.layerId); pictureUi.set({tool: 'move'}); }, ru ? 'Вставлено: двигайте' : 'Pasted: drag it')}>{ru ? 'Вставить' : 'Paste'}</button>
          </div>
          <div className="pc-row">
            <button type="button" disabled={!sel} onClick={() => { picture.change(x => ({...x, crop: clampRect(sel!, x.w, x.h)})); pictureUi.set({sel: null}); }}>{ru ? 'Обрезать по ней' : 'Crop to it'}</button>
            <button type="button" disabled={!sel} onClick={() => act(() => savePicture(null, 'human', sel), ru ? 'Фрагмент в Приёмной' : 'Fragment in the Inbox')}>{ru ? 'Фрагмент → Приёмная' : 'Fragment → Inbox'}</button>
          </div>
        </section>
        <section><h5>{ru ? 'Слои' : 'Marks'} · {d.objects.length}</h5>
          <ul className="pc-layers">{d.objects.slice().reverse().map(o => <li key={o.id} aria-selected={o.id === selObj}><button type="button" onClick={() => { setSelObj(o.id); pictureUi.set({tool: 'move'}); }}>{layerLabel(o, ru)}</button><span className="pc-lord"><button type="button" aria-label={ru ? 'Выше' : 'Up'} onClick={() => picture.change(x => { const l = x.objects.slice(); const i = l.findIndex(y => y.id === o.id); if (i < l.length - 1) [l[i], l[i + 1]] = [l[i + 1], l[i]]; return {...x, objects: l}; })}>↑</button><button type="button" aria-label={ru ? 'Ниже' : 'Down'} onClick={() => picture.change(x => { const l = x.objects.slice(); const i = l.findIndex(y => y.id === o.id); if (i > 0) [l[i], l[i - 1]] = [l[i - 1], l[i]]; return {...x, objects: l}; })}>↓</button><button type="button" aria-label="×" onClick={() => picture.change(x => ({...x, objects: x.objects.filter(y => y.id !== o.id)}))}>×</button></span></li>)}</ul>
          <div className="pc-row"><button type="button" disabled={!st.past.length} onClick={picture.undo}>↶</button><button type="button" disabled={!st.future.length} onClick={picture.redo}>↷</button></div>
        </section>
        <section className="pc-save"><h5>{ru ? 'Готово' : 'Done'}</h5>
          <button type="button" data-testid="pc-to-board" onClick={() => act(() => savePicture('board'), ru ? 'На доске' : 'On the board')}>▦ {ru ? 'На доску' : 'To board'}</button>
          <button type="button" onClick={() => act(() => savePicture('notebook'), ru ? 'В блокноте' : 'In the notebook')}>✎ {ru ? 'В блокнот' : 'To notebook'}</button>
          <button type="button" onClick={() => act(() => savePicture(null), ru ? 'Сохранено в Приёмной' : 'Saved to the Inbox')}>⇣ {ru ? 'В Приёмную' : 'To Inbox'}</button>
          <button type="button" onClick={() => act(downloadPicture)}>PNG</button>
          <button type="button" className="pc-close" onClick={() => picture.close()}>{ru ? 'Закрыть' : 'Close'}</button>
        </section>
      </aside>
    </div>
    <p className="pc-name">{d.name} · {d.w}×{d.h}{d.crop ? ` → ${Math.round(d.crop.w)}×${Math.round(d.crop.h)}` : ''}</p>
    {flash && <div className="pc-flash" role="status">{flash}</div>}
  </div>;
}
const clampA = (a: number) => Math.max(-45, Math.min(45, Math.round(a * 10) / 10));
/** Rotate so the drawn line becomes horizontal (or vertical, if it was closer to vertical). */
export function levelByLine(a: Pt, b: Pt) {
  let deg = Math.atan2(b.y - a.y, b.x - a.x) * 180 / Math.PI;
  if (deg > 90) deg -= 180; if (deg <= -90) deg += 180;
  const fix = Math.abs(deg) <= 45 ? -deg : -(deg - 90 * Math.sign(deg));
  picture.change(x => ({...x, angle: clampA((x.angle || 0) + fix)}));
  return picture.get().doc?.angle || 0;
}
function clampRect(r: Rect, w: number, h: number): Rect { const x = Math.max(0, r.x), y = Math.max(0, r.y); return {x, y, w: Math.min(w - x, r.w - (x - r.x)), h: Math.min(h - y, r.h - (y - r.y))}; }
function layerLabel(o: Obj, ru: boolean) {
  const m: Record<string, [string, string]> = {arrow: ['➚ Стрелка', '➚ Arrow'], rect: ['▭ Рамка', '▭ Frame'], ellipse: ['◯ Овал', '◯ Oval'], highlight: ['▬ Маркер', '▬ Marker'], pen: ['✎ Линия', '✎ Line'], pixelate: ['▦ Скрыто', '▦ Blurred'], erase: ['✂ Вырезано', '✂ Cut'], image: ['▣ Вставка', '▣ Pasted'], text: ['T ', 'T ']};
  return (m[o.type] || [o.type, o.type])[ru ? 0 : 1] + (o.type === 'text' ? o.text.slice(0, 18) : '');
}
