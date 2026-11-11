// Media cabinet: Picture and Video modes, one shared "what do you want to make?" step.
import {useEffect, useRef, useState, useSyncExternalStore} from 'react';
import {useLang} from '../../hooks/useLang';
import {useAssets, intake} from '../intake/store';
import {useBlobUrl} from '../intake/useBlobUrl';
import {PicturePane} from './PicturePane';
import {OUTPUTS, outputById, type OutputId} from './outputs';
import {runOutput, useMediaJobs, fmtT, type MediaImage} from './run';
import {videos, useVideos, openYoutube, openVideoAsset, videoFileUrl, addFrame, requestFrame, requestTranscript, grabVideoElement, tabCapture, useTabCapture, loadYouTubeApi, type Video, type Frame} from './video';
import {savePicture} from './render';
import {picture} from './model';
import {gif, useGif, sequence, drawFrame, frameSize, exportGif, videoMime} from './gif';
import {loadImage} from './render';
import {toBoard, toNotebook, downloadAsset} from '../intake/routes';

// ---- mode & the shared output dialog (also driven by the agent / demo) ----
type Ask = {images: MediaImage[]; title?: string; context?: {title?: string; url?: string; videoId?: string}} | null;
let mode: 'picture' | 'video' | 'gif' = 'picture'; let ask: Ask = null; let rev = 0;
const subs = new Set<() => void>(); const emit = () => { rev++; subs.forEach(f => f()); };
export const media = {
  mode: () => mode, setMode(m: 'picture' | 'video' | 'gif') { mode = m; emit(); },
  ask: () => ask, openAsk(a: Ask) { ask = a; emit(); }, closeAsk() { ask = null; emit(); },
  subscribe(f: () => void) { subs.add(f); return () => { subs.delete(f); }; }, revision: () => rev,
};
if (typeof window !== 'undefined') window.addEventListener('media:mode', (e: any) => { if (e.detail === 'picture' || e.detail === 'video' || e.detail === 'gif') media.setMode(e.detail); });
const useMedia = () => { useSyncExternalStore(media.subscribe, media.revision); return {mode, ask}; };

/** The player currently on screen, so commands and the demo can seek and capture. */
export const activePlayer: {current: null | {videoId: string; time(): number; seek(t: number): void; pause(): void; play(): void; grab(): Promise<Blob | null>}} = {current: null};

function OutputDialog({ru}: {ru: boolean}) {
  const {ask: a} = useMedia();
  const [req, setReq] = useState(''); const [busy, setBusy] = useState<string | null>(null); const [done, setDone] = useState<string | null>(null);
  useEffect(() => { setReq(''); setDone(null); }, [a]);
  if (!a) return null;
  const first = intake.get(a.images[0]?.assetId);
  const pick = async (id: OutputId) => {
    setBusy(id);
    try {
      const r: any = await runOutput(id, a.images, {request: req, context: a.context});
      const o = outputById(id)!;
      setDone(r.jobId ? (ru ? `📱 Агент получил задачу «${o.ru}» и промт` : `📱 The agent got “${o.en}” with its prompt`) : (ru ? `Готово: ${o.ru}` : `Done: ${o.en}`));
      setTimeout(() => media.closeAsk(), r.jobId ? 2400 : 900);
    } catch (e) { setDone('⚠ ' + String((e as Error).message || e)); }
    setBusy(null);
  };
  return <div className="md-ask" role="dialog" aria-label={ru ? 'Что сделать' : 'What to make'} data-testid="md-ask">
    <div className="md-ask-card">
      <header><AskThumb assetId={a.images[0]?.assetId}/><div><strong>{a.title || (ru ? 'Что сделать с этим?' : 'What should we make of this?')}</strong>
        <small>{a.images.length > 1 ? (ru ? `${a.images.length} изображений` : `${a.images.length} images`) : (first?.name || '')}{a.images[0]?.t != null ? ' · ' + fmtT(a.images[0].t) : ''}</small></div>
        <button type="button" onClick={() => media.closeAsk()} aria-label={ru ? 'Оставить как есть' : 'Keep as is'}>✕</button></header>
      <div className="md-outputs">{OUTPUTS.map(o => <button type="button" key={o.id} data-testid={'md-out-' + o.id} disabled={!!busy} onClick={() => pick(o.id)} className={o.local ? 'is-local' : ''}>
        <b>{o.icon}</b><span><strong>{ru ? o.ru : o.en}</strong><small>{ru ? o.hintRu : o.hintEn}</small></span>{!o.local && <em title={ru ? 'Сделает агент' : 'Done by the agent'}>📱</em>}</button>)}</div>
      <textarea rows={2} value={req} onChange={e => setReq(e.target.value)} placeholder={ru ? 'Уточнение для агента (необязательно): «рецепт на 4 порции», «презентация для инвесторов»…' : 'Optional note for the agent: "recipe for 4", "investor deck"…'}/>
      <footer><button type="button" onClick={() => media.closeAsk()}>{ru ? 'Просто оставить в ленте' : 'Just keep it'}</button>{done && <span>{done}</span>}</footer>
    </div>
  </div>;
}
function AskThumb({assetId}: {assetId?: string}) { const u = useBlobUrl(assetId ? intake.get(assetId)?.pages[0]?.ref : null); return u ? <img src={u} alt=""/> : <span className="md-ph"/>; }

// ---------------- Video ----------------
function FrameThumb({f, onSeek, videoId, ru}: {f: Frame; onSeek: () => void; videoId: string; ru: boolean}) {
  const u = useBlobUrl(f.assetId ? intake.get(f.assetId)?.pages[0]?.ref : null);
  const set = (p: Partial<Frame>) => { const v = videos.get(videoId)!; videos.patch(videoId, {frames: v.frames.map(x => x.id === f.id ? {...x, ...p} : x)}); };
  return <figure className={'md-frame' + (f.picked ? ' is-picked' : '') + (f.status === 'pending' ? ' is-pending' : '')} data-testid="md-frame">
    <button type="button" className="md-frame-img" onClick={onSeek} title={ru ? 'Перейти к моменту' : 'Go to this moment'}>{u ? <img src={u} alt=""/> : <span>📱 {ru ? 'ждёт агента' : 'agent…'}</span>}<i>{fmtT(f.t)}</i></button>
    <input type="checkbox" checked={!!f.picked} onChange={e => set({picked: e.target.checked})} aria-label={ru ? 'Выбрать кадр' : 'Pick frame'}/>
    <input className="md-note" value={f.note || ''} onChange={e => set({note: e.target.value})} placeholder={ru ? 'заметка' : 'note'}/>
    <button type="button" className="md-frame-x" aria-label="×" onClick={() => { const v = videos.get(videoId)!; videos.patch(videoId, {frames: v.frames.filter(x => x.id !== f.id)}); }}>×</button>
  </figure>;
}

function Player({v, ru, onPaused}: {v: Video; ru: boolean; onPaused: (t: number) => void}) {
  const host = useRef<HTMLDivElement>(null), vid = useRef<HTMLVideoElement>(null), yt = useRef<any>(null);
  const [src, setSrc] = useState<string | null>(null); const [err, setErr] = useState<string | null>(null);
  const pausedCb = useRef(onPaused); pausedCb.current = onPaused;
  useEffect(() => {
    let alive = true; setErr(null); setSrc(null);
    if (v.kind === 'file') { void videoFileUrl(v).then(u => { if (alive) setSrc(u); }); }
    else {
      loadYouTubeApi().then(YT => {
        if (!alive || !host.current) return;
        host.current.innerHTML = ''; const div = document.createElement('div'); host.current.appendChild(div);
        yt.current = new YT.Player(div, {videoId: v.ytId, width: '100%', height: '100%', playerVars: {rel: 0, modestbranding: 1, playsinline: 1},
          events: {onStateChange: (e: any) => { if (e.data === 2) pausedCb.current(yt.current.getCurrentTime()); }}});
      }).catch(e => { if (alive) setErr(String(e.message || e)); });
    }
    return () => { alive = false; try { yt.current?.destroy?.(); } catch { /* ignore */ } yt.current = null; };
  }, [v.id]);
  useEffect(() => () => { if (src) URL.revokeObjectURL(src); }, [src]);
  useEffect(() => {
    activePlayer.current = {videoId: v.id,
      time: () => v.kind === 'file' ? (vid.current?.currentTime || 0) : (yt.current?.getCurrentTime?.() || 0),
      seek: (t: number) => { if (v.kind === 'file' && vid.current) vid.current.currentTime = t; else yt.current?.seekTo?.(t, true); },
      pause: () => { if (v.kind === 'file') vid.current?.pause(); else yt.current?.pauseVideo?.(); },
      play: () => { if (v.kind === 'file') void vid.current?.play(); else yt.current?.playVideo?.(); },
      grab: async () => {
        if (v.kind === 'file' && vid.current) { if (vid.current.seeking) await new Promise(r => vid.current!.addEventListener('seeked', r, {once: true})); return grabVideoElement(vid.current); }
        if (tabCapture.active() && host.current) return tabCapture.grab(host.current);
        return null;
      }};
    return () => { if (activePlayer.current?.videoId === v.id) activePlayer.current = null; };
  });
  return <div className="md-player" data-testid="md-player">
    {v.kind === 'file' ? (src ? <video ref={vid} src={src} controls preload="auto" onPause={e => { if (!(e.target as HTMLVideoElement).seeking) pausedCb.current((e.target as HTMLVideoElement).currentTime); }}/> : <div className="md-loading">…</div>)
      : <div ref={host} className="md-yt"/>}
    {err && <div className="md-err">{ru ? 'YouTube-плеер здесь не загрузился (' + err + '). В обычном браузере он работает; кадры и расшифровку может принести агент по ссылке.' : 'The YouTube player could not load here (' + err + '). It works in a normal browser; the agent can still bring frames and the transcript.'}</div>}
  </div>;
}

function VideoMode({ru}: {ru: boolean}) {
  const list = useVideos(); const assets = useAssets().filter(a => a.family === 'video' && a.status !== 'failed');
  const v = videos.get(videos.current()) || null;
  const [url, setUrl] = useState(''); const [auto, setAuto] = useState(true); const [msg, setMsg] = useState<string | null>(null);
  const cap = useTabCapture();
  const jobs = useMediaJobs().filter(j => j.context?.videoId === v?.id);
  const say = (s: string) => { setMsg(s); setTimeout(() => setMsg(null), 3200); };
  const shoot = async (t?: number, askAfter = true) => {
    if (!v || !activePlayer.current) return;
    const time = t ?? activePlayer.current.time();
    const blob = await activePlayer.current.grab().catch(() => null);
    if (blob) {
      const f = await addFrame(v.id, time, blob);
      if (askAfter && f.assetId) media.openAsk({images: [{assetId: f.assetId, t: time}], title: ru ? `Кадр ${fmtT(time)}: что сделать?` : `Frame ${fmtT(time)}: what to make?`, context: {title: v.title, url: v.url, videoId: v.id}});
    } else { requestFrame(v.id, time); say(ru ? `📱 Отметил ${fmtT(time)}. Кадр достанет агент (или включите «Захват вкладки»).` : `📱 Marked ${fmtT(time)}; the agent will fetch the frame (or enable tab capture).`); }
  };
  const picked = v ? v.frames.filter(f => f.picked && f.assetId) : [];
  return <div className="md-video">
    <div className="md-src">
      <form onSubmit={e => { e.preventDefault(); try { openYoutube(url); setUrl(''); } catch (err) { say('⚠ ' + (ru ? 'Это не ссылка YouTube' : 'Not a YouTube link')); } }}>
        <input value={url} onChange={e => setUrl(e.target.value)} placeholder={ru ? 'Вставьте ссылку YouTube…' : 'Paste a YouTube link…'} data-testid="md-yt-url"/>
        <button type="submit" disabled={!url.trim()}>▶ {ru ? 'Открыть' : 'Open'}</button>
      </form>
      {assets.length > 0 && <select value="" onChange={e => { if (e.target.value) openVideoAsset(e.target.value); }} aria-label={ru ? 'Видео из Приёмной' : 'Video from Inbox'}>
        <option value="">{ru ? '🎞 Видео из Приёмной…' : '🎞 Video from Inbox…'}</option>{assets.map(a => <option key={a.id} value={a.id}>{a.name}</option>)}</select>}
      <div className="md-vlist">{list.map(x => <button type="button" key={x.id} aria-pressed={x.id === v?.id} onClick={() => videos.select(x.id)}>{x.kind === 'youtube' ? '▶' : '🎞'} {x.title.slice(0, 28)}</button>)}</div>
    </div>
    {!v ? <div className="md-empty"><h3>🎞 {ru ? 'Видео: смотреть, ставить на паузу, доставать кадры' : 'Video: watch, pause, take frames'}</h3>
      <p>{ru ? 'Вставьте ссылку YouTube или выберите видео из Приёмной. На паузе кадр сохраняется, и вы выбираете, что из него сделать: рецепт, меню, разбор для кинокритика, презентацию, книжку…' : 'Paste a YouTube link or pick a video from the Inbox. On pause the frame is kept and you choose what to make: a recipe, menu, shot analysis, a presentation, a booklet…'}</p></div>
    : <div className="md-vbody">
      <div className="md-vmain">
        <Player v={v} ru={ru} onPaused={t => { if (auto) void shoot(t); }}/>
        <div className="md-vctrl">
          <button type="button" className="md-shot" data-testid="md-shot" onClick={() => shoot()}>📸 {ru ? 'Достать кадр' : 'Take frame'}</button>
          <label><input type="checkbox" checked={auto} onChange={e => setAuto(e.target.checked)}/> {ru ? 'Кадр при паузе' : 'Frame on pause'}</label>
          {v.kind === 'youtube' && <button type="button" onClick={async () => { try { cap ? tabCapture.stop() : await tabCapture.start(); } catch (e) { say('⚠ ' + String((e as Error).message)); } }}>{cap ? (ru ? '● Захват вкладки включён' : '● Tab capture on') : (ru ? 'Захват вкладки' : 'Tab capture')}</button>}
          <span className="md-sep"/>
          <button type="button" onClick={() => requestTranscript(v.id)}>≡ {ru ? 'Расшифровка' : 'Transcript'}</button>
        </div>
        <div className="md-strip">{v.frames.map(f => <FrameThumb key={f.id} f={f} videoId={v.id} ru={ru} onSeek={() => activePlayer.current?.seek(f.t)}/>)}
          {!v.frames.length && <p className="md-hint">{ru ? 'Кадров пока нет. Поставьте на паузу или нажмите «Достать кадр».' : 'No frames yet. Pause or press “Take frame”.'}</p>}</div>
        {v.frames.length > 0 && <div className="md-bulk">
          <button type="button" data-testid="md-make" disabled={!picked.length} onClick={() => media.openAsk({images: picked.map(f => ({assetId: f.assetId!, t: f.t, note: f.note})), title: ru ? `Что сделать из ${picked.length} кадров?` : `What to make from ${picked.length} frames?`, context: {title: v.title, url: v.url, videoId: v.id}})}>✨ {ru ? `Что сделать из выбранных (${picked.length})` : `Make something from ${picked.length}`}</button>
          {jobs.slice(0, 4).map(j => { const o = outputById(j.output)!; return <span key={j.id} className={'md-job is-' + j.state}>{o.icon} {ru ? o.ru : o.en} · {j.state === 'done' ? '✓' : '📱…'}</span>; })}
        </div>}
      </div>
      <aside className="md-transcript"><h5>≡ {ru ? 'Расшифровка' : 'Transcript'}</h5>
        {v.transcript.length ? <ol>{v.transcript.map((s, i) => <li key={i}><button type="button" onClick={() => activePlayer.current?.seek(s.t)}><i>{fmtT(s.t)}</i> {s.text}</button></li>)}</ol>
          : <p className="md-hint">{v.transcriptState === 'requested' ? (ru ? '📱 Агент готовит расшифровку…' : '📱 The agent is preparing it…') : (ru ? 'Нажмите «Расшифровка»: агент достанет текст видео с таймкодами.' : 'Press “Transcript”: the agent brings the text with timestamps.')}</p>}
      </aside>
    </div>}
    {msg && <div className="md-flash" role="status">{msg}</div>}
  </div>;
}

export function MediaPane() {
  const {lang} = useLang(); const ru = lang === 'ru';
  const {mode: m} = useMedia();
  const pic = useSyncExternalStore(picture.subscribe, picture.get);
  return <div className="md" data-testid="media-pane">
    <div className="md-modes" role="tablist">
      <button type="button" role="tab" aria-selected={m === 'picture'} data-testid="md-mode-picture" onClick={() => media.setMode('picture')}>✂ {ru ? 'Картинка' : 'Picture'}</button>
      <button type="button" role="tab" aria-selected={m === 'video'} data-testid="md-mode-video" onClick={() => media.setMode('video')}>🎞 {ru ? 'Видео' : 'Video'}</button>
      <button type="button" role="tab" aria-selected={m === 'gif'} data-testid="md-mode-gif" onClick={() => media.setMode('gif')}>🌀 {ru ? 'Гифка' : 'GIF'}</button>
      {m === 'picture' && pic.doc && <button type="button" className="md-make-pic" data-testid="md-make-picture" onClick={async () => { const r = await savePicture(null); media.openAsk({images: [{assetId: r.assetId}], title: ru ? 'Картинка готова: что из неё сделать?' : 'Picture ready: what to make?', context: {title: pic.doc?.name}}); }}>✨ {ru ? 'Что сделать с картинкой?' : 'What to make?'}</button>}
    </div>
    <div className="md-body">{m === 'picture' ? <PicturePane/> : m === 'gif' ? <GifMode ru={ru}/> : <VideoMode ru={ru}/>}</div>
    <OutputDialog ru={ru}/>
  </div>;
}

// ---------------- GIF ----------------
function GifThumb({assetId}: {assetId: string}) { const u = useBlobUrl(intake.get(assetId)?.pages[0]?.ref); return u ? <img src={u} alt=""/> : <span/>; }
function GifMode({ru}: {ru: boolean}) {
  const g = useGif(); const o = g.settings;
  const assets = useAssets().filter(a => a.pages.length && a.status !== 'failed' && a.family !== 'audio');
  const cv = useRef<HTMLCanvasElement>(null);
  const [adding, setAdding] = useState(false); const [picked, setPicked] = useState<string[]>([]);
  const [busy, setBusy] = useState<string | null>(null); const [out, setOut] = useState<{assetId: string; name: string; type: string} | null>(null); const [msg, setMsg] = useState<string | null>(null);
  // Live preview loop.
  useEffect(() => {
    let alive = true; let timer: any; const c = cv.current; if (!c) return;
    (async () => {
      const imgs: HTMLImageElement[] = [];
      for (const f of g.frames) { const ref = intake.get(f.assetId)?.pages[0]?.ref; if (ref) try { imgs.push(await loadImage(ref)); } catch { /* skip */ } }
      if (!alive || !imgs.length) { const x = c.getContext('2d')!; c.width = 480; c.height = 300; x.fillStyle = '#ffffff60'; x.fillRect(0, 0, 480, 300); return; }
      const {w, h} = frameSize(imgs, g); c.width = w; c.height = h; const x = c.getContext('2d')!;
      const order = sequence(g).map(f => imgs[g.frames.indexOf(f)]).filter(Boolean); let i = 0;
      const tick = () => { if (!alive) return; drawFrame(x, order[i % order.length], w, h, g); i++; timer = setTimeout(tick, o.delay); };
      tick();
    })();
    return () => { alive = false; clearTimeout(timer); };
  }, [g.rev]);
  const run = async (key: string, fn: () => Promise<any>) => { setBusy(key); try { const r = await fn(); if (r?.assetId) setOut(r); } catch (e) { setMsg('⚠ ' + String((e as Error).message || e)); setTimeout(() => setMsg(null), 3500); } setBusy(null); };
  const mp4 = videoMime('mp4');
  return <div className="gf" data-testid="gif-mode">
    <div className="gf-strip">
      {g.frames.map((f, i) => <figure key={f.assetId + i} className="gf-frame"><GifThumb assetId={f.assetId}/><figcaption>{i + 1}{f.label ? ' · ' + f.label : ''}</figcaption>
        <div><button type="button" onClick={() => gif.move(i, -1)} aria-label="←">←</button><button type="button" onClick={() => gif.move(i, 1)} aria-label="→">→</button><button type="button" onClick={() => gif.remove(i)} aria-label="×">×</button></div></figure>)}
      <button type="button" className="gf-add" data-testid="gif-add" onClick={() => { setAdding(!adding); setPicked([]); }}>＋ {ru ? 'Картинки' : 'Pictures'}</button>
    </div>
    {adding && <div className="gf-picker"><div className="gf-picker-grid">{assets.map(a => <button type="button" key={a.id} aria-pressed={picked.includes(a.id)} onClick={() => setPicked(p => p.includes(a.id) ? p.filter(x => x !== a.id) : [...p, a.id])}><GifThumb assetId={a.id}/><small>{a.name}</small></button>)}</div>
      <div className="gf-row"><button type="button" disabled={!picked.length} onClick={() => { gif.load(picked.map(id => ({assetId: id})), true); setAdding(false); }}>{ru ? `Добавить (${picked.length})` : `Add (${picked.length})`}</button><span className="gf-hint">{ru ? 'Порядок — как вы отмечали. Кадры из видео приходят сюда кнопкой «Гифка» в «Что сделать».' : 'Order follows your clicks. Video frames arrive via “GIF” in “What to make”.'}</span></div></div>}
    <div className="gf-body">
      <div className="gf-preview"><canvas ref={cv} data-testid="gif-preview"/>{!g.frames.length && <p>{ru ? 'Добавьте 2 и больше картинок: рисунки, фото, кадры из фильма.' : 'Add 2+ pictures: drawings, photos, film frames.'}</p>}</div>
      <aside className="gf-side">
        <label>{ru ? 'Скорость' : 'Speed'} <b>{(o.delay / 1000).toFixed(2)} {ru ? 'с/кадр' : 's/frame'}</b><input type="range" min={60} max={2000} step={20} value={o.delay} onChange={e => gif.set({delay: +e.target.value})}/></label>
        <label>{ru ? 'Ширина' : 'Width'} <select value={o.width} onChange={e => gif.set({width: +e.target.value})}>{[240, 320, 480, 640, 800].map(w => <option key={w} value={w}>{w}px</option>)}</select></label>
        <label>{ru ? 'Формат кадра' : 'Aspect'} <select value={o.ratio} onChange={e => gif.set({ratio: e.target.value as any})}>{['auto', '1:1', '4:3', '16:9', '9:16'].map(r => <option key={r} value={r}>{r === 'auto' ? (ru ? 'как у первой' : 'as first') : r}</option>)}</select></label>
        <label>{ru ? 'Вписать' : 'Fit'} <select value={o.fit} onChange={e => gif.set({fit: e.target.value as any})}><option value="contain">{ru ? 'целиком' : 'contain'}</option><option value="cover">{ru ? 'заполнить' : 'cover'}</option></select></label>
        <div className="gf-checks"><label><input type="checkbox" checked={o.grayscale} onChange={e => gif.set({grayscale: e.target.checked})} data-testid="gif-bw"/> ◐ {ru ? 'Ч/Б' : 'B/W'}</label><label><input type="checkbox" checked={o.boomerang} onChange={e => gif.set({boomerang: e.target.checked})}/> ⇄ {ru ? 'Бумеранг' : 'Boomerang'}</label></div>
        <h5>😂 {ru ? 'Мем-подпись' : 'Meme caption'}</h5>
        <input value={o.top} onChange={e => gif.set({top: e.target.value})} placeholder={ru ? 'Текст сверху' : 'Top text'} data-testid="gif-top"/>
        <input value={o.bottom} onChange={e => gif.set({bottom: e.target.value})} placeholder={ru ? 'Текст снизу' : 'Bottom text'} data-testid="gif-bottom"/>
        <label>{ru ? 'Размер текста' : 'Text size'}<input type="range" min={6} max={18} value={o.textSize} onChange={e => gif.set({textSize: +e.target.value})}/></label>
        <h5>{ru ? 'Сохранить' : 'Save'}</h5>
        <div className="gf-save">
          <button type="button" data-testid="gif-export-gif" disabled={g.frames.length < 1 || !!busy} onClick={() => run('gif', () => exportGif('gif'))}>{busy === 'gif' ? '…' : 'GIF'}</button>
          <button type="button" data-testid="gif-export-mp4" disabled={g.frames.length < 1 || !!busy || !mp4} title={mp4 || ''} onClick={() => run('mp4', () => exportGif('mp4'))}>{busy === 'mp4' ? '…' : (mp4?.includes('mp4') ? 'MP4' : 'MP4→WebM')}</button>
          <button type="button" disabled={g.frames.length < 1 || !!busy || !videoMime('webm')} onClick={() => run('webm', () => exportGif('webm'))}>{busy === 'webm' ? '…' : 'WebM'}</button>
        </div>
        {out && <div className="gf-out" data-testid="gif-out"><p>✓ {out.name}</p><div className="gf-save">
          <button type="button" data-testid="gif-to-board" onClick={() => toBoard(out.assetId)}>▦ {ru ? 'На доску' : 'Board'}</button>
          <button type="button" onClick={() => toNotebook(out.assetId)}>✎ {ru ? 'В блокнот' : 'Notebook'}</button>
          <button type="button" onClick={() => downloadAsset(out.assetId, 'original')}>⇩ {ru ? 'Скачать' : 'Download'}</button></div></div>}
        <button type="button" className="gf-clear" onClick={() => { gif.clear(); setOut(null); }}>{ru ? 'Очистить' : 'Clear'}</button>
      </aside>
    </div>
    {msg && <div className="md-flash" role="status">{msg}</div>}
  </div>;
}
