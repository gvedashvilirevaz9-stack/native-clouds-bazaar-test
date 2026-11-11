import {nativeRooms} from '../personal/native-clouds-state';
import {WORKSHOP_SERVICES} from '../../../shared/native-rooms.mjs';
import {IntakePane} from '../intake/IntakePane';
import {EstimatePane} from '../estimate/EstimatePane';
import {MediaPane} from '../picture/MediaPane';
import {BillingPane} from '../billing/BillingPane';
import {DayPane} from '../day/DayPane';
import {ingestMany} from '../intake/store';
import {toBoard} from '../intake/routes';
import {stampTo} from './stamp';
import {attachToNotebook} from './notebook-media';
import './workshop.css';
import {WorkshopEntrance} from './WorkshopEntrance';
import {usePublishRemoteSection} from '../shell/remote-section';
import {CustomizationScope,SettingButton} from '../shell/CustomizationScope';
import {loadRegion,effectiveCountry} from '../regionState';
import {regions} from '../../../shared/corridor.mjs';
import {PinnedScene} from '../scenes/SceneDesk';
import {SCENE_MIME} from '../scenes/scene-store';
import {addBoardScene} from '../scenes/place-board';
// Sunrise Garage Space v6: Notebook + Sketchbook, ask highlights/popups, no WHY strip.
import {useEffect, useSyncExternalStore, useMemo, useRef, useState, type CSSProperties, type ReactNode} from 'react';
import {garage, useGarage, getBlob, storeImageFile, importImageUrl, safeImage, DRAG_MIME, marketResult, inbox, connectorPath, type Item, type Snapshot, type Station, type CheckState} from './store';
import {CHOICE_LANES, CHOICE_SLOTS, CHOICE_WORLD, hitSlot, slotOrigin, slotById, SLOT_IDS, type ChoiceSlotId} from './choice-slots';
import {PAGE_FRAME, PAGE_STRIDE, pageOrigin, pageAtX, panToCenterPage, worldSize} from './page-frames';
import {ACTION_DEFAULT_TIMES, ACTION_WORLD, ACTION_LANE_A_TOP, ACTION_LANE_B_TOP, ACTION_LANE_C_TOP, ACTION_LANE_HEIGHT, ACTION_LANE_LEFT, ACTION_LANE_WIDTH, actionMarkerAt, actionMarkers, actionLaneOrigin, hitActionMarkerSticky, hitActionLane, osmStaticMapUrl, googleMapsLink} from './action-slots';
import {loadFavs, favVisual, safeUrl, FAV_KEY, type Fav} from '../../sunrise402/favorites';
import {FavKindTabs, favEmptyText, useFavKind} from '../../sunrise402/FavKindTabs';
import {filterFavs} from '../../sunrise402/favKinds.mjs';
import {useCommunication, communication} from '../communication/store';
import {registerControl} from '../agent/controls';
import {PRESETS, contextTags, presetTitle, presetHint, chipTitle, chipShort, type PresetId} from './presets';
import {
  loadPages, upsertPage, pagesOnDate, datesWithPages,
  formatDate, todayISO, weekStart, weekDays, addDays, appendLeaf,
  loadPresetState, savePresetState, loadAsk, replyAsk, unreadAsk, insertAskVariant,
  needsDailyStart, markDailyStartShown, autofillAskInserts,
  monthGrid, migratePagesToNotebook, normalizeStart, type StartChoice,
} from './pages';
import {
  readGarageState, searchHits, setSelectedDate as remoteSetDate, doPageNew, doPageOpen,
  doSpaceSet, doTopicSet, downloadText, currentNotebookPage, pageInfo, ensureNb,
  exportPageJson, exportPageMd,
} from './garage-remote';
import {useGarageT, gt, type GarageKey} from './i18n';
import {exportFrame} from './format-export';
import {compareRecipe} from '../../../server/agent/garage-compare.mjs';
import {boardAnchor, useBoardAnchor} from './anchor';
import type {FormatKind} from './store';
import {garageView, coerceTab, type Tab} from './view';
import {normalizeClock, timerView, playBell, TIMER_PRESETS, pad2, type TimerMode} from './timers';
import {NotebookPane, ensureNotebookPage} from './notebook';
import {StickySpeech} from './StickySpeech';
import {Maximize2, X} from 'lucide-react';
import './garage.css';

/** Row-2 slot order — swap 'newPage' and 'date' later without rewriting the chrome. */
export const CHROME_ROW2_ORDER = ['newPage', 'date', 'pages'] as const;
export type ChromeSlot = typeof CHROME_ROW2_ORDER[number];
export type {Tab};
export {garageView};
function useView() { const [, f] = useState(0); useEffect(() => garageView.subscribe(() => f(n => n + 1)), []); return garageView.get(); }

const favSnapshot = (f: Fav, favSource: string): Snapshot => {
  const v = favVisual(f);
  return {title: f.title, url: safeUrl(f.url), image: v.image || (v.photo ? `/sunrise/shop/banners/photo/${v.photo}.jpg` : null), price: f.price || '', source: [favSource, f.provider, f.category].filter(Boolean).join(' · ')};
};
export function boardSummary() {
  const b = garage.get();
  const now = Date.now();
  const addr = garage.address();
  const address = addr.scope === 'timeless'
    ? ('garage·timeless·page ' + addr.page)
    : ('garage·' + addr.date + '·page ' + addr.page);
  return {anchor: boardAnchor.get(), rev: b.rev, why: b.why, layout: b.layout, grid: b.grid, boardNumber: b.boardNumber, maxPage: b.maxPage, scope: b.scope || addr.scope, date: b.date ?? addr.date, address, agentImage: b.agentImage,
    items: b.items.map(i => {
      const base: any = {id: i.id, page: i.page || 1, kind: i.kind, title: i.title, text: i.text?.slice(0, 300), url: i.url, price: i.price, source: i.source, image: i.image?.startsWith('idb:') ? 'stored-in-browser' : i.image, by: i.by, caption: i.caption, addedAt: new Date(i.addedAt).toISOString(), x: i.x, y: i.y, w: i.w, h: i.h, lane: i.lane, markerIndex: i.markerIndex};
      if (i.kind === 'format') base.format = i.fmt || 'A';
      if (i.kind === 'time') base.clock = i.clock || i.text || '00:00';
      if (i.kind === 'map') { base.lat = i.lat; base.lon = i.lon; base.mapQuery = i.mapQuery; base.mapsUrl = i.mapsUrl; }
      if (i.kind === 'timer' && i.timer) {
        const v = timerView(i.timer, now);
        base.timer = {
          mode: i.timer.mode, durationSec: i.timer.durationSec, status: i.timer.status,
          startedAt: i.timer.startedAt, elapsedMs: v.elapsedMs,
          remainingMs: v.remainingMs, display: v.display,
        };
      }
      if (i.kind === 'teardown') {
        base.forItem = i.forItem || null;
        base.parts = (i.parts || []).map(p => ({
          key: p.key, label: p.label, image: p.image?.startsWith('idb:') ? 'stored-in-browser' : p.image,
          price: p.unknown || p.price == null || p.price === '' ? null : p.price,
          unknown: !!(p.unknown || p.price == null || p.price === ''),
        }));
        base.total = garage.teardownTotal(i.parts);
      }
      return base;
    }),
    connectors: b.connectors, stations: b.stations,
    skeleton: b.skeleton || 'none', slots: b.slots || {}};
}

function Img({src, alt = '', empty, onSize}: {src?: string | null; alt?: string; empty: string; onSize?: (w: number) => void}) {
  const [u, setU] = useState<string | null>(null);
  useEffect(() => { let url: string | null = null, live = true; const s = safeImage(src);
    if (s?.startsWith('idb:')) getBlob(s).then(b => { if (b && live) { url = URL.createObjectURL(b); setU(url); } }); else setU(s);
    return () => { live = false; if (url) URL.revokeObjectURL(url); }; }, [src]);
  return u ? <img src={u} alt={alt} draggable={false} onLoad={e => onSize?.(e.currentTarget.naturalWidth)}/> : <div className="gr-noimg">{empty}</div>;
}

/** Native top-layer dialog keeps image zoom independent of board scale and drag. */
function DiagramViewer({it, onClose}: {it: Item; onClose: () => void}) {
  const {t} = useGarageT();
  const dialog = useRef<HTMLDialogElement>(null);
  const [scale, setScale] = useState(0);
  const [width, setWidth] = useState(1448);
  useEffect(() => { const el = dialog.current; el?.showModal(); return () => el?.close(); }, []);
  return <dialog ref={dialog} className={`gr-image-viewer ${scale === 0 ? 'is-fit' : 'is-detail'}`} data-testid="gr-image-viewer"
    aria-label={it.title} onClose={onClose} onCancel={onClose} onPointerDown={e => e.stopPropagation()} onKeyDown={e => e.stopPropagation()}>
    <header><strong>{it.title}</strong><div>
      <button onClick={() => setScale(0)} aria-pressed={scale === 0}>{t('imageFit')}</button>
      <button onClick={() => setScale(1)} aria-pressed={scale === 1}>{t('imageOriginal')} · 100%</button>
      <button onClick={() => setScale(2)} aria-pressed={scale === 2}>2×</button>
      <button onClick={onClose} aria-label={t('imageClose')} autoFocus><X size={20}/></button>
    </div></header>
    <div className="gr-image-scroll" tabIndex={0} style={{'--gr-image-width': `${width * (scale || 1)}px`} as CSSProperties}>
      <Img src={it.image} alt={it.title} empty={t('noPhoto')} onSize={setWidth}/>
    </div>
    {it.caption && <p>{it.caption}</p>}
  </dialog>;
}

function download(name: string, body: string, mime: string) {
  const a = document.createElement('a'); a.href = URL.createObjectURL(new Blob([body], {type: mime})); a.download = name; a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 2000);
}

function DailyStart({onDone}: {onDone: (start: StartChoice) => void}) {
  const {t} = useGarageT();
  return <div className="gr-onboard" data-testid="gr-onboard">
    <div className="gr-onboard-card">
      <p className="gr-eyebrow">{t('onboardEyebrow')}</p>
      <h2 data-testid="gr-start-title">{t('startTodayTitle')}</h2>
      <p className="hint">{t('onboardStartHint')}</p>
      <div className="gr-onboard-start">
        <button data-testid="gr-start-notebook" onClick={() => onDone('notebook')}><strong>{t('startNotebook')}</strong><span>{t('startNotebookHint')}</span></button>
        <button data-testid="gr-start-board" onClick={() => onDone('board')}><strong>{t('startPlanBoard')}</strong><span>{t('startPlanBoardHint')}</span></button>
        {/* legacy test ids — same notebook target */}
        <button hidden data-testid="gr-start-diary" onClick={() => onDone('notebook')}/>
        <button hidden data-testid="gr-start-ai" onClick={() => onDone('notebook')}/>
      </div>
    </div>
  </div>;
}

function CalendarBlock({selectedDate, onSelectDate, preset, chip, onPreset, onChip, onSearch, compact=false, children}: {
  compact?: boolean;
  children?: ReactNode;
  selectedDate: string; onSelectDate: (d: string) => void;
  preset: PresetId; chip: string | null; onPreset: (p: PresetId) => void; onChip: (c: string | null) => void; onSearch: () => void;
}) {
  const {t, locale, lang} = useGarageT();
  const [ws, setWs] = useState(() => weekStart(selectedDate));
  useEffect(() => { setWs(weekStart(selectedDate)); }, [selectedDate]);
  const days = weekDays(ws);
  const p = PRESETS.find(x => x.id === preset)!;
  const today = todayISO();
  return <div className="gr-calblock" data-testid="gr-calblock">
    <div className="gr-cal-top">
      {compact&&<WorkshopClock/>}
      <div className="gr-datestrip" data-testid="gr-datestrip">
        <button aria-label={t('prevWeek')} onClick={() => setWs(addDays(ws, -7))}>‹</button>
        {days.map(d => {
          const dt = new Date(d + 'T12:00:00');
          const marked = datesWithPages().includes(d);
          return <button key={d} ref={el => { if (el && d === selectedDate) el.scrollIntoView({inline: 'center', block: 'nearest', behavior: 'smooth'}); }}
            className={`gr-day ${d === selectedDate ? 'on' : ''} ${d === today ? 'today' : ''} ${marked ? 'has' : ''}`}
            data-testid={'gr-day-' + d} onClick={() => onSelectDate(d)}>
            <small>{dt.toLocaleDateString(locale, {weekday: 'short'})}</small>
            <strong>{dt.getDate()}</strong>
          </button>;
        })}
        <button aria-label={t('nextWeek')} onClick={() => setWs(addDays(ws, 7))}>›</button>
      </div>
      <button className="gr-search-btn" data-testid="gr-search-btn" onClick={onSearch} title={t('searchTitle')}>{t('searchBtn')}</button>
    </div>
    <div className="gr-presets" role="tablist" aria-label="presets">
      {PRESETS.map(pr => <button key={pr.id} className={preset === pr.id ? 'on' : ''} data-testid={'gr-preset-' + pr.id}
        onClick={() => onPreset(pr.id)}>
        <span>{pr.num}</span><strong>{presetTitle(lang, pr.id)}</strong></button>)}
    </div>
    <div className="gr-chips" data-testid="gr-chips">
      {p.chips.map(c => <button key={c.id} className={chip === c.id ? 'on' : ''} data-testid={'gr-chip-' + c.id}
        onClick={() => onChip(chip === c.id ? null : c.id)} title={chipTitle(lang, c.id)}>{c.icon} {chipShort(lang, c.id)}</button>)}
    </div>
    <p className="gr-preset-hint">{presetHint(lang, p.id)}</p>
    {children}
  </div>;
}

function SidePanel({selectedDate, onSelectDate, calOpen, setCalOpen, section}: {
  section?: 'calendar' | 'favorites';
  selectedDate: string; onSelectDate: (d: string) => void; calOpen: boolean; setCalOpen: (v: boolean) => void;
}) {
  const {t, locale} = useGarageT();
  const [favs, setFavs] = useState<Fav[]>(() => loadFavs()); const favKindSel = useFavKind('garage'); const shownFavs = filterFavs(favs, favKindSel); // Grok 2026-11-03 (favtabs)
  const [ib, setIb] = useState(() => inbox());
  const now = new Date(selectedDate + 'T12:00:00');
  const [ym, setYm] = useState({y: now.getFullYear(), m: now.getMonth()});
  useEffect(() => { setYm({y: now.getFullYear(), m: now.getMonth()}); }, [selectedDate]);
  useEffect(() => { const f = (e: StorageEvent) => { if (e.key === FAV_KEY) setFavs(loadFavs()); setIb(inbox()); }; window.addEventListener('storage', f); const tmr = setInterval(() => { setFavs(loadFavs()); setIb(inbox()); }, 3000); return () => { window.removeEventListener('storage', f); clearInterval(tmr); }; }, []);
  const marked = useMemo(() => new Set(datesWithPages()), [calOpen, selectedDate]);
  const cells = monthGrid(ym.y, ym.m);
  const wd = useMemo(() => {
    // 2024-01-01 is Monday
    return Array.from({length: 7}, (_, i) => new Date(2024, 0, 1 + i).toLocaleDateString(locale, {weekday: 'short'}));
  }, [locale]);
  const row = (s: Snapshot, key: string, n?: number) => <li key={key} draggable onDragStart={e => { e.dataTransfer.setData(DRAG_MIME, JSON.stringify(s)); if (s.url) e.dataTransfer.setData('text/uri-list', s.url); e.dataTransfer.effectAllowed = 'copy'; }} data-testid="gr-src">
    {n != null && <span className="n">{n}</span>}<span className="th"><Img src={s.image} empty={t('noPhoto')}/></span><span className="t"><b title={s.title}>{s.title}</b><small>{[s.price, s.source].filter(Boolean).join(' · ')}</small></span>
    <button onClick={() => garage.addSnapshot(s)} title={t('toBoard')} data-testid="gr-src-add">＋</button>
    <button onClick={() => attachToNotebook({kind: 'favorite', ref: s.image || null, title: s.title.slice(0, 200), url: s.url || null, price: s.price, by: 'human'})} title={String(locale).startsWith('ru') ? 'В блокнот' : 'To notebook'} data-testid="gr-src-notebook">✎</button></li>;
  return <aside className="gr-side" data-testid="gr-side">
    {section!=='favorites'&&<div className="gr-side-cal" data-testid="gr-side-cal">
      <button className="gr-side-cal-head" data-testid="gr-cal-toggle" onClick={() => setCalOpen(!calOpen)}>
        <strong>{t('sideCalendar')}</strong><span className="arrow">{calOpen ? '▾' : '▸'}</span>
      </button>
      {calOpen && <div className="gr-month" data-testid="gr-month">
        <div className="gr-month-nav">
          <button onClick={() => setYm(v => { const d = new Date(v.y, v.m - 1, 1); return {y: d.getFullYear(), m: d.getMonth()}; })}>‹</button>
          <span>{new Date(ym.y, ym.m, 1).toLocaleDateString(locale, {month: 'long', year: 'numeric'})}</span>
          <button onClick={() => setYm(v => { const d = new Date(v.y, v.m + 1, 1); return {y: d.getFullYear(), m: d.getMonth()}; })}>›</button>
        </div>
        <div className="gr-month-grid">
          {wd.map(d => <span key={d} className="wd">{d}</span>)}
          {cells.map(c => <button key={c.iso} className={`${c.inMonth ? '' : 'out'} ${c.iso === selectedDate ? 'on' : ''} ${marked.has(c.iso) ? 'has' : ''}`}
            onClick={() => { onSelectDate(c.iso); }}>{c.day}</button>)}
        </div>
        <div className="gr-stamp-row" data-testid="gr-stamp-row">
          <span>📅 {String(locale).startsWith('ru') ? 'Метка дня' : 'Day stamp'}</span>
          <button type="button" data-testid="gr-stamp-board" onClick={() => { void stampTo('board', {date: selectedDate, lang: String(locale).slice(0, 2)}); }}>{String(locale).startsWith('ru') ? 'на доску' : 'to board'}</button>
          <button type="button" data-testid="gr-stamp-notebook" onClick={() => { void stampTo('notebook', {date: selectedDate}); }}>{String(locale).startsWith('ru') ? 'в блокнот' : 'to notebook'}</button>
        </div>
      </div>}
    </div>
    }{section!=='calendar'&&<>
    <h3>{t('sideFavorites')} <span className="star">★</span><span className="c">{shownFavs.length}</span></h3>
    <p className="hint">{t('sideFavHint')}</p>
    <FavKindTabs container="garage" list={favs} ru={String(locale).startsWith('ru')}/>
    {!shownFavs.length ? <p className="hint">{favs.length ? favEmptyText(favKindSel, String(locale).startsWith('ru')) : t('sideFavEmpty')}</p> : <ol>{shownFavs.map(({f, n}) => row(favSnapshot(f, t('favSource')), f.id, n))}</ol>}
    <h3>{t('sideInbox')} <span className="c">{ib.length}</span></h3>
    <p className="hint">{t('sideInboxHint')}</p>
    {ib.length > 0 && <ol>{ib.map(s => row(s, s.id))}</ol>}
    </>}
  </aside>;
}

function SearchPopup({open, onClose, onOpenPage, onOpenBoard}: {open: boolean; onClose: () => void; onOpenPage: (id: string) => void; onOpenBoard: () => void}) {
  const {t} = useGarageT();
  const viewQ = garageView.get().searchQuery || '';
  const [q, setQ] = useState(viewQ);
  useEffect(() => { if (open) setQ(garageView.get().searchQuery || ''); }, [open, viewQ]);
  const pages = loadPages();
  const b = garage.get();
  const qq = q.trim().toLowerCase();
  const hits = !qq ? [] : [
    ...pages.filter(p => p.title.toLowerCase().includes(qq) || p.leaves.some(l => l.text.toLowerCase().includes(qq)) || p.date.includes(qq))
      .map(p => ({kind: 'page' as const, id: p.id, title: `${t('searchDiary')} · ${p.date} · ${p.title}`, snippet: p.leaves.map(l => l.text).join(' ').slice(0, 120)})),
    ...b.items.filter(i => (i.title + (i.text || '') + (i.caption || '')).toLowerCase().includes(qq))
      .map(i => ({kind: 'board' as const, id: i.id, title: `${t('searchBoard', {n: b.boardNumber})} · ${i.kind}`, snippet: (i.title + ' ' + (i.text || '')).slice(0, 120)})),
  ].slice(0, 30);
  if (!open) return null;
  return <div className="gr-search-overlay" data-testid="gr-search" onClick={onClose}>
    <div className="gr-search-box" onClick={e => e.stopPropagation()}>
      <input autoFocus value={q} onChange={e => setQ(e.target.value)} placeholder={t('searchPlaceholder')} data-testid="gr-search-input"/>
      <ul>{!qq ? <li className="hint">{t('searchStart')}</li> : !hits.length ? <li className="hint">{t('searchEmpty')}</li> : hits.map(h =>
        <li key={h.kind + h.id}><button onClick={() => { if (h.kind === 'page') onOpenPage(h.id); else onOpenBoard(); onClose(); }}><b>{h.title}</b><small>{h.snippet}</small></button></li>)}</ul>
      <p className="hint">{t('searchEsc')}</p>
    </div>
  </div>;
}


function WorkspaceChrome({
  tab, dateLabel, topicLabel, pageNums, activePage, onNewPage, onSelectPage,
}: {
  tab: Tab; dateLabel: string; topicLabel: string; pageNums: number[]; activePage: number;
  onNewPage: () => void; onSelectPage: (n: number) => void;
}) {
  const {t} = useGarageT();
  const tabs: [Tab, GarageKey][] = [['notebook', 'tabNotebook'], ['board', 'tabBoard']];
  const slots: Record<ChromeSlot, ReactNode> = {
    newPage: <button type="button" className="gr-plate gr-btn-create" data-testid="gr-new-page" onClick={onNewPage}>{t('newPage')}</button>,
    date: <div className="gr-chrome-date" data-testid="gr-chrome-date">
      <strong>{dateLabel}</strong>
      {topicLabel ? <span className="params">{topicLabel}</span> : null}
    </div>,
    pages: <div className="gr-chrome-pages" data-testid="gr-chrome-pages" role="tablist" aria-label="pages">
      {pageNums.map(n => <button type="button" key={n} className={'gr-plate' + (n === activePage ? ' on' : '')}
        data-testid={'gr-page-num-' + n} aria-selected={n === activePage} onClick={() => onSelectPage(n)}>{n}</button>)}
    </div>,
  };
  return <div className="gr-chrome" data-testid="gr-chrome">
    <nav className="gr-chrome-tabs" role="tablist" aria-label="garage-tabs">
      {tabs.map(([id, k]) => <button type="button" key={id} role="tab" aria-selected={tab === id}
        className={'gr-plate' + (tab === id ? ' on' : '')} data-testid={'gr-tab-' + id}
        onClick={() => garageView.set({tab: id})}>{t(k)}</button>)}
    </nav>
    <div className="gr-chrome-row2" data-testid="gr-chrome-row2">
      {CHROME_ROW2_ORDER.map(slot => <div key={slot} className={'gr-chrome-slot gr-chrome-' + slot} data-chrome-slot={slot}>{slots[slot]}</div>)}
    </div>
  </div>;
}

const CHIP_CLS: Record<CheckState, string> = {pending: 'wait', on_time: 'ok', late: 'late', stuck: 'stuck', done: 'ok'};
const CHIP_KEY: Record<CheckState, GarageKey> = {pending: 'chipPending', on_time: 'chipOnTime', late: 'chipLate', stuck: 'chipStuck', done: 'chipDone'};
const NEXT: Record<CheckState, CheckState> = {pending: 'on_time', on_time: 'late', late: 'stuck', stuck: 'done', done: 'pending'};
function Stations({list}: {list: Station[]}) {
  const {t} = useGarageT();
  const lane = (l: 'A' | 'B') => list.filter(s => s.line === l);
  return <div className="gr-action-guides">
    {(['A', 'B'] as const).map(l => <div key={l} className={`gr-lane lane-${l}`} data-testid={'gr-lane-' + l}><span className="gr-lane-t">{l === 'A' ? t('laneA') : t('laneB')}</span>
      {lane(l).map((s, i) => <div key={s.id} className={`gr-st ${s.state === 'stuck' ? 'fail' : ''}`} style={{left: (l === 'A' ? 0 : 1) * 210 + 60 + i * 420}} data-station={s.id}>
        <div className="tm">{s.time}</div><h4>{s.title}</h4>
        <button className={`gr-chip ${CHIP_CLS[s.state]}`} onClick={() => garage.station(s.id, {state: NEXT[s.state]})}>{t(CHIP_KEY[s.state])}</button></div>)}</div>)}
  </div>;
}

/** Fallback sizes when DOM node is not mounted yet (must match CSS / stored w·h). */
function itemFallbackSize(it: Item) {
  if (it.w && it.h) return {w: it.w, h: it.h};
  if (it.kind === 'scene') return {w:it.w||540,h:it.h||475};
  if (it.kind === 'timer') return {w: 190, h: 120};
  if (it.kind === 'time') return {w: 190, h: 110};
  if (it.kind === 'teardown') return {w: 560, h: 520 + (it.parts?.length || 0) * 26};
  if (it.kind === 'map') return {w: it.w || 240, h: it.h || 220};
  if (it.kind === 'sticky' || it.kind === 'note') return {w: it.w || 200, h: it.h || 130};
  return {w: 230, h: 240};
}
type ItemBox = {x: number; y: number; w: number; h: number; cx: number; cy: number};
/** Live axis-aligned box in world coords from DOM (follows move/resize/zoom). */
function itemBox(it: Item): ItemBox {
  if (typeof document !== 'undefined') {
    const el = document.querySelector(`[data-item-id="${CSS.escape(it.id)}"]`) as HTMLElement | null;
    const world = document.querySelector('.gr-world') as HTMLElement | null;
    if (el && world) {
      const er = el.getBoundingClientRect();
      const wr = world.getBoundingClientRect();
      let z = 1;
      const tr = getComputedStyle(world).transform;
      if (tr && tr !== 'none') {
        const m = tr.match(/matrix\(([^,]+)/);
        if (m) z = Math.abs(Number.parseFloat(m[1])) || 1;
      }
      if (z < 0.01) z = 1;
      const x = (er.left - wr.left) / z;
      const y = (er.top - wr.top) / z;
      const w = er.width / z;
      const h = er.height / z;
      if (w > 2 && h > 2) return {x, y, w, h, cx: x + w / 2, cy: y + h / 2};
    }
    // During drag style.left/top are authoritative even before reflow
    if (el) {
      const lx = Number.parseFloat(el.style.left);
      const ly = Number.parseFloat(el.style.top);
      const left = Number.isFinite(lx) ? lx : it.x;
      const top = Number.isFinite(ly) ? ly : it.y;
      const w = el.offsetWidth || itemFallbackSize(it).w;
      const h = el.offsetHeight || itemFallbackSize(it).h;
      return {x: left, y: top, w, h, cx: left + w / 2, cy: top + h / 2};
    }
  }
  const {w, h} = itemFallbackSize(it);
  return {x: it.x, y: it.y, w, h, cx: it.x + w / 2, cy: it.y + h / 2};
}
function itemCenter(it: Item) { const b = itemBox(it); return {x: b.cx, y: b.cy}; }
/** Anchor connectors on the facing edges of live boxes (not a drifting fixed offset). */
function connectorEnds(a: Item, b: Item) {
  const A = itemBox(a), B = itemBox(b);
  const dx = B.cx - A.cx, dy = B.cy - A.cy;
  let p1: {x: number; y: number}, p2: {x: number; y: number};
  if (Math.abs(dy) >= Math.abs(dx)) {
    if (dy >= 0) { p1 = {x: A.cx, y: A.y + A.h}; p2 = {x: B.cx, y: B.y}; }
    else { p1 = {x: A.cx, y: A.y}; p2 = {x: B.cx, y: B.y + B.h}; }
  } else {
    if (dx >= 0) { p1 = {x: A.x + A.w, y: A.cy}; p2 = {x: B.x, y: B.cy}; }
    else { p1 = {x: A.x, y: A.cy}; p2 = {x: B.x + B.w, y: B.cy}; }
  }
  return {p1, p2};
}

function TimerLive({it}: {it: Item}) {
  const {t} = useGarageT();
  const [, tick] = useState(0);
  const rung = useRef(false);
  useEffect(() => {
    if (!it.timer || it.timer.status !== 'running') return;
    const id = setInterval(() => tick(n => n + 1), 250);
    return () => clearInterval(id);
  }, [it.timer?.status, it.id]);
  useEffect(() => {
    if (!it.timer || it.timer.status !== 'running') { rung.current = false; return; }
    const v = timerView(it.timer);
    if (v.shouldComplete && !rung.current) {
      rung.current = true;
      garage.timerComplete(it.id);
      playBell();
    }
  });
  if (!it.timer) return null;
  const v = timerView(it.timer);
  const modeLabel = it.timer.mode === 'down' ? t('timerCountdown') : it.timer.mode === 'up' ? t('timerCountUp') : t('timerFree');
  const ringing = it.timer.status === 'done';
  return <>
    <div className="gr-timer-mode">{modeLabel}{ringing ? ' · ' + t('timerDone') + ' ' + t('timerRinging') : ''}</div>
    <div className="tm" data-testid="gr-timer-display">{v.display}</div>
    <div className="gr-timer-ctrls" onPointerDown={e => e.stopPropagation()}>
      {it.timer.status !== 'running'
        ? <button type="button" data-testid="gr-timer-start" onClick={() => garage.timerControl(it.id, 'start')}>{t('timerStart')}</button>
        : <button type="button" data-testid="gr-timer-pause" onClick={() => garage.timerControl(it.id, 'pause')}>{t('timerPause')}</button>}
      <button type="button" data-testid="gr-timer-stop" onClick={() => garage.timerControl(it.id, 'stop')}>{t('timerStop')}</button>
      <button type="button" data-testid="gr-timer-reset" onClick={() => garage.timerControl(it.id, 'reset')}>{t('timerReset')}</button>
    </div>
  </>;
}

/** v14: sticky title text. Single press drags the sticky (handled by parent); double-click edits. */
function StickyText({it, edit, setEdit}: {it: Item; edit: boolean; setEdit: (v: boolean) => void}) {
  const {t} = useGarageT();
  const ta = useRef<HTMLTextAreaElement>(null);
  useEffect(() => { if (edit && ta.current) { ta.current.focus(); const n = ta.current.value.length; ta.current.setSelectionRange(n, n); } }, [edit]);
  if (edit) return <textarea ref={ta} data-testid="gr-sticky-edit" value={it.text || ''} onPointerDown={e => e.stopPropagation()}
    onChange={e => garage.patch(it.id, {text: e.target.value.slice(0, 1000)})} onBlur={() => setEdit(false)}
    onKeyDown={e => { if (e.key === 'Escape') { e.stopPropagation(); setEdit(false); } }} placeholder={t('stickyPlaceholder')}/>;
  return <div className={`gr-sticky-text ${it.text ? '' : 'is-empty'}`} data-testid="gr-sticky-text" title={t('stickyEditHint')}>{it.text || t('stickyPlaceholder')}</div>;
}

/** v14: Format library element (A / A+B / A+B+C on A4). Dragged by its header strip only; body pans the board. */
function FormatBody({it}: {it: Item}) {
  const {t} = useGarageT();
  const [busy, setBusy] = useState<string | null>(null);
  const fmt = it.fmt || 'A';
  const lanes: {k: GarageKey; c: string}[] = [{k: 'laneA', c: 'A'}, ...(fmt !== 'A' ? [{k: 'laneBManual' as GarageKey, c: 'B'}] : []), ...(fmt === 'ABC' ? [{k: 'laneCManual' as GarageKey, c: 'C'}] : [])];
  const run = async (f: 'jpeg' | 'pdf') => {
    setBusy(f);
    try { await exportFrame(garage.get().items.find(i => i.id === it.id) || it, f); }
    catch (err) { communication.add({text: String((err as Error).message), role: 'system', kind: 'error', source: 'Garage'}); }
    finally { setBusy(null); }
  };
  return <>
    <div className="gr-fmt-head" data-testid="gr-format-head" title={t('formatDragHint')}>
      <span>{fmt === 'ABC' ? t('formatA4Label') : fmt === 'AB' ? t('formatAB') : t('formatA')}</span>
      {fmt === 'ABC' && <span className="gr-fmt-tools" onPointerDown={e => e.stopPropagation()}>
        <button type="button" data-testid="gr-format-export-jpeg" disabled={!!busy} onClick={() => run('jpeg')}>{busy === 'jpeg' ? '…' : t('exportJpeg')}</button>
        <button type="button" data-testid="gr-format-export-pdf" disabled={!!busy} onClick={() => run('pdf')}>{busy === 'pdf' ? '…' : t('exportPdf')}</button>
      </span>}
      <button className="gr-x" onPointerDown={e => e.stopPropagation()} onClick={() => garage.remove(it.id)} aria-label={t('remove')}>×</button>
    </div>
    <div className="gr-fmt-lanes">
      {lanes.map(L => <div key={L.c} className={`gr-fmt-lane lane-${L.c}`} data-testid={'gr-format-lane-' + L.c}><span className="gr-lane-t">{t(L.k)}</span></div>)}
    </div>
    {fmt === 'ABC' && <span className="gr-fmt-a4" data-testid="gr-format-a4">{t('formatA4Size')}</span>}
  </>;
}

function Polaroid({it, selected, onDown, onSelect, linking, onPlusDown, onResizeDown}: {
  it: Item; selected: boolean; onDown: (e: React.PointerEvent, it: Item) => void; onSelect: (id: string, e?: React.PointerEvent) => boolean | void;
  linking: string | null; onPlusDown: (e: React.PointerEvent, id: string) => void;
  onResizeDown: (e: React.PointerEvent, it: Item) => void;
}) {
  const {t, locale} = useGarageT();
  const date = new Date(it.addedAt).toLocaleDateString(locale, {day: '2-digit', month: '2-digit', year: '2-digit'});
  const kindCls = it.kind === 'scene' ? 'gr-hiw' : it.kind === 'sticky' ? 'gr-sticky' : it.kind === 'note' ? 'gr-note' : it.kind === 'time' ? 'gr-time-block' : it.kind === 'timer' ? 'gr-timer-block' : it.kind === 'teardown' ? 'gr-teardown' : it.kind === 'map' ? 'gr-map' : it.kind === 'format' ? 'gr-format fmt-' + (it.fmt || 'A') : 'gr-pol';
  const done = it.kind === 'timer' && it.timer?.status === 'done';
  const [editing, setEditing] = useState(false);
  const [imageOpen, setImageOpen] = useState(false);
  const cls = `gr-item ${kindCls} ${it.by === 'agent' ? 'by-agent' : ''} ${selected ? 'is-sel' : ''} ${done ? 'is-done is-ring' : ''}`;
  let body: ReactNode;
  if(it.kind==='scene'){
    body=<><div className="gr-hiw-grip">⠿ · {it.title}<button className="gr-x" aria-label={t('remove')} onPointerDown={e=>e.stopPropagation()} onClick={()=>garage.remove(it.id)}>×</button></div><div style={{height:'calc(100% - 20px)'}} onPointerDown={e=>e.stopPropagation()}><PinnedScene id={it.buildId||''} bare/></div></>;
  } else if (it.kind === 'format') {
    body = <FormatBody it={it}/>;
  } else if (it.kind === 'sticky' || it.kind === 'note') {
    body = <>
      <button className="gr-x" onPointerDown={e => e.stopPropagation()} onClick={() => garage.remove(it.id)} aria-label={t('remove')}>×</button>
      <StickySpeech id={it.id} text={it.text || ''}/>
      <StickyText it={it} edit={editing} setEdit={setEditing}/>
      <small>{it.by === 'agent' ? t('byAgent') + ' · ' : ''}{date}</small>
    </>;
  } else if (it.kind === 'time') {
    body = <>
      <button className="gr-x" onPointerDown={e => e.stopPropagation()} onClick={() => garage.remove(it.id)} aria-label={t('remove')}>×</button>
      <input className="tm-edit" data-testid="gr-time-display" value={it.clock || it.text || '00:00'}
        onPointerDown={e => e.stopPropagation()}
        onChange={e => {
          const v = e.target.value.slice(0, 5);
          garage.patch(it.id, {clock: v, text: v});
        }}
        onBlur={e => {
          const v = normalizeClock(e.target.value);
          garage.patch(it.id, {clock: v, text: v});
        }}/>
      <small>{it.by === 'agent' ? t('byAgent') + ' · ' : ''}{date}</small>
    </>;
  } else if (it.kind === 'timer') {
    body = <>
      <button className="gr-x" onPointerDown={e => e.stopPropagation()} onClick={() => garage.remove(it.id)} aria-label={t('remove')}>×</button>
      <TimerLive it={it}/>
      <small>{it.by === 'agent' ? t('byAgent') + ' · ' : ''}{date}</small>
    </>;
  } else if (it.kind === 'teardown') {
    const total = garage.teardownTotal(it.parts);
    body = <>
      <button className="gr-x" onPointerDown={e => e.stopPropagation()} onClick={() => garage.remove(it.id)} aria-label={t('remove')}>×</button>
      <div className="gr-teardown-head">{t('teardownTitle')}</div>
      <button type="button" className="gr-teardown-photo" data-testid="gr-diagram-open" disabled={!it.image} aria-label={t('imageOpen')}
        onPointerDown={e => e.stopPropagation()} onClick={() => setImageOpen(true)}>
        <Img src={it.image} alt={it.title} empty={t('noPhoto')}/><span className="gr-image-open-hint"><Maximize2 size={14}/>{t('imageOpen')}</span>
      </button>
      {imageOpen && <DiagramViewer it={it} onClose={() => setImageOpen(false)}/>}
      <b className="gr-teardown-name" title={it.title}>{it.title}</b>
      <ul className="gr-teardown-parts" data-testid="gr-teardown-parts">
        {(it.parts || []).map(p => <li key={p.key}>
          <span className="lbl">{p.label}</span>
          <span className="prc">{p.unknown || !p.price ? '?' : p.price}</span>
        </li>)}
      </ul>
      {total && <div className="gr-teardown-total">{t('teardownTotal')}: <strong>{total}</strong></div>}
      <small>{it.by === 'agent' ? t('byAgent') + ' · ' : ''}{date}</small>
    </>;
  } else if (it.kind === 'map') {
    const maps = it.mapsUrl || it.url;
    body = <>
      <button className="gr-x" onPointerDown={e => e.stopPropagation()} onClick={() => garage.remove(it.id)} aria-label={t('remove')}>×</button>
      <div className="gr-map-photo"><Img src={it.image} alt={it.title} empty={t('noPhoto')}/></div>
      <b className="gr-map-title" title={it.title}>{it.title}</b>
      {maps && <a className="gr-map-link" href={maps} target="_blank" rel="noopener noreferrer nofollow" onPointerDown={e => e.stopPropagation()}>{t('mapOpen')}</a>}
      <small>{it.by === 'agent' ? t('byAgent') + ' · ' : ''}{date}</small>
    </>;
  } else {
    body = <>
      <span className="gr-pin"/><button className="gr-x" onPointerDown={e => e.stopPropagation()} onClick={() => garage.remove(it.id)} aria-label={t('remove')}>×</button>
      <div className="gr-photo"><Img src={it.image} alt={it.title} empty={t('noPhoto')}/></div>
      <figcaption><b title={it.title}>{it.title}</b>{it.price && <span className="gr-price">{it.price}</span>}
        <small>{[it.source, date].filter(Boolean).join(' · ')}</small>
        {it.url && <a href={it.url} target="_blank" rel="noopener noreferrer nofollow" onPointerDown={e => e.stopPropagation()}>{t('sourceLink')}</a>}</figcaption>
      {it.tag && <span className="gr-tag">{it.tag}</span>}
    </>;
  }
  const testid = it.kind === 'scene' ? 'gr-scene' : it.kind === 'polaroid' ? 'gr-polaroid' : it.kind === 'sticky' ? 'gr-sticky' : it.kind === 'time' ? 'gr-time' : it.kind === 'timer' ? 'gr-timer' : it.kind === 'teardown' ? 'gr-teardown' : it.kind === 'map' ? 'gr-map' : it.kind === 'format' ? 'gr-format' : 'gr-note';
  const sizeStyle: CSSProperties = {left: it.x, top: it.y, transform: `rotate(${it.rot || 0}deg)`};
  if (it.w) sizeStyle.width = it.w;
  if (it.h) sizeStyle.height = it.h;
  const canResize = it.kind === 'scene' || it.kind === 'sticky' || it.kind === 'note' || it.kind === 'map' || it.kind === 'format';
  if (it.kind === 'format') sizeStyle.transform = 'none';
  return <div className={cls} style={sizeStyle}
    data-testid={testid} data-item-id={it.id}
    onDoubleClick={e => { if ((it.kind === 'sticky' || it.kind === 'note') && !(e.target as HTMLElement).closest('.gr-caption,button,a,input,textarea')) { e.stopPropagation(); setEditing(true); } }}
    onPointerDown={e => { if (it.kind === 'format' && !(e.target as HTMLElement).closest('.gr-fmt-head')) return; if (e.ctrlKey || e.shiftKey || e.metaKey || e.altKey) { if (e.button === 0 && !e.altKey) { e.stopPropagation(); onSelect(it.id, e); } return; } onSelect(it.id, e); onDown(e, it); }}>
    {body}
    {it.kind !== 'scene' && it.kind !== 'time' && it.kind !== 'timer' && it.kind !== 'teardown' && it.kind !== 'map' && it.kind !== 'format' && <div className="gr-caption" onPointerDown={e => e.stopPropagation()}>
      <input value={it.caption || ''} placeholder={t('captionPlaceholder')} onChange={e => garage.setCaption(it.id, e.target.value)} data-testid="gr-caption"/>
    </div>}
    {(selected || linking === it.id) && <button className="gr-plus" data-testid="gr-plus" title={t('plusTitle')}
      onPointerDown={e => { e.stopPropagation(); onPlusDown(e, it.id); }}>+</button>}
    {canResize && selected && <div className="gr-resize" data-testid="gr-resize" title={t('resizeHandle')}
      onPointerDown={e => { e.stopPropagation(); onResizeDown(e, it); }}/>}
  </div>;
}


function TimePopover({onPlace, onClose}: {onPlace: (clock: string) => void; onClose: () => void}) {
  const {t} = useGarageT();
  const [h, setH] = useState(0);
  const [m, setM] = useState(0);
  const clock = pad2(h === 24 ? 0 : h) + ':' + pad2(m);
  return <div className="gr-pop" data-testid="gr-time-pop" onPointerDown={e => e.stopPropagation()}>
    <strong>{t('timePopoverTitle')}</strong>
    <div className="tm-big" data-testid="gr-time-pop-display">{clock}</div>
    <div className="gr-pop-row"><span>{t('timeHours')}</span>
      <select data-testid="gr-time-hours" value={h || 24} onChange={e => setH(Number(e.target.value))}>
        {Array.from({length: 24}, (_, i) => i + 1).map(n => <option key={n} value={n}>{pad2(n)}</option>)}
      </select>
    </div>
    <div className="gr-pop-row"><span>{t('timeMinutes')}</span>
      <select data-testid="gr-time-mins" value={m} onChange={e => setM(Number(e.target.value))}>
        {Array.from({length: 60}, (_, i) => i).map(n => <option key={n} value={n}>{pad2(n)}</option>)}
      </select>
    </div>
    <div className="gr-pop-actions">
      <button type="button" className="gr-btn-place" data-testid="gr-time-place" onClick={() => { onPlace(clock); onClose(); }}>{t('timePlace')}</button>
    </div>
  </div>;
}

function StopwatchPopover({onPlace, onClose}: {
  onPlace: (mode: TimerMode, sec: number) => void; onClose: () => void;
}) {
  const {t} = useGarageT();
  const [sec, setSec] = useState(30 * 60);
  const [custom, setCustom] = useState('');
  const applyCustom = () => {
    const n = Math.floor(Number(custom));
    if (Number.isFinite(n) && n >= 1 && n <= 86400) setSec(n);
  };
  return <div className="gr-pop" data-testid="gr-timer-pop" onPointerDown={e => e.stopPropagation()}>
    <strong>{t('stopwatchTitle')}</strong>
    <div className="gr-pop-presets">
      {TIMER_PRESETS.map(p => <button type="button" key={p.sec} className={sec === p.sec ? 'on' : ''}
        data-testid={'gr-timer-preset-' + p.sec} onClick={() => setSec(p.sec)}>{t(p.labelKey as any)}</button>)}
    </div>
    <div className="gr-pop-row">
      <span>{t('timerCustom')}</span>
      <input data-testid="gr-timer-custom" placeholder="sec" value={custom}
        onChange={e => setCustom(e.target.value)} onBlur={applyCustom}
        onKeyDown={e => { if (e.key === 'Enter') applyCustom(); }}/>
    </div>
    <div className="gr-pop-actions">
      <button type="button" className="gr-btn-down" data-testid="gr-timer-down"
        onClick={() => { onPlace('down', sec); onClose(); }}>{t('timerCountdown')}</button>
      <button type="button" className="gr-btn-up" data-testid="gr-timer-up"
        onClick={() => { onPlace('up', sec); onClose(); }}>{t('timerCountUp')}</button>
      <button type="button" className="gr-btn-free" data-testid="gr-timer-free"
        onClick={() => { onPlace('free', 0); onClose(); }}>{t('timerFree')}</button>
    </div>
  </div>;
}


const FORMAT_SEED_KEY = 'sunrise.garage.v14.actionFormatSeeded';
function ensureActionFormat(page: number) {
  const b = garage.get();
  const key = `${b.scope || 'timeless'}|${b.date || ''}|${page}`;
  let seen: string[] = [];
  try { seen = JSON.parse(localStorage.getItem(FORMAT_SEED_KEY) || '[]'); } catch {}
  if (seen.includes(key)) return;
  const onPage = b.items.some(i => i.kind === 'format' && (i.page || pageAtX(i.x, b.maxPage || 999)) === page);
  if (!onPage) {
    const o = pageOrigin(page);
    const f = garage.addFormat('ABC', {x: o.x + 20, y: o.y + 10}, 'human', {w: 1760});
    garage.patch(f.id, {page});
  }
  try { localStorage.setItem(FORMAT_SEED_KEY, JSON.stringify([...seen, key].slice(-500))); } catch {}
}

function seedActionIfEmpty() {
  let b = garage.get();
  if (b.layout !== 'action') return;
  garage.enableActionSkeleton();
  b = garage.get();
  const page = b.boardNumber || 1;
  ensureActionFormat(page);
  b = garage.get();
  // Once-per-page flag: never reseed after first seed or after user/agent edits on this page.
  if (garage.isActionSeeded(page)) return;
  const hasTime = b.items.some(i => i.kind === 'time' && (i.page || pageAtX(i.x, b.maxPage || 999)) === page);
  if (hasTime) {
    garage.markActionSeeded(page);
    return;
  }
  const times = [...ACTION_DEFAULT_TIMES];
  const ids: string[] = [];
  const o = pageOrigin(page);
  times.forEach((clock, i) => {
    const m = actionMarkerAt(i);
    const tm = garage.addTime(clock, {x: o.x + m.timeX, y: o.y + m.timeY}, 'human');
    garage.patch(tm.id, {lane: 'A', markerIndex: i, rot: 0, page});
    const st = garage.addSticky('', {x: o.x + m.stickyX, y: o.y + m.stickyY}, 'human');
    garage.patch(st.id, {lane: 'A', markerIndex: i, text: '', title: 'Sticky', page});
    ids.push(tm.id, st.id);
    if (i > 0) {
      try { garage.connect(ids[(i - 1) * 2], tm.id); } catch {}
    }
  });
  garage.markActionSeeded(page);
}

/** v14: same pan rule for Prep (Timeless/By date) and Action: any press that is not on a card/control pans. */
function isPanTarget(el: HTMLElement | null): boolean {
  if (!el) return false;
  if (el.closest('a,button,input,textarea,select,.gr-pop,.gr-toolbar,.gr-fmt-head,.gr-link')) return false;
  const card = el.closest('.gr-item');
  return !card || card.classList.contains('gr-format');
}

function FormatPopover({onPick, onClose}: {onPick: (k: FormatKind) => void; onClose: () => void}) {
  const {t} = useGarageT();
  const opts: {k: FormatKind; l: GarageKey; d: GarageKey}[] = [
    {k: 'A', l: 'formatA', d: 'formatADesc'}, {k: 'AB', l: 'formatAB', d: 'formatABDesc'}, {k: 'ABC', l: 'formatABC', d: 'formatABCDesc'}];
  return <div className="gr-pop gr-fmt-pop" data-testid="gr-format-pop" onPointerDown={e => e.stopPropagation()}>
    <b>{t('formatLibrary')}</b>
    {opts.map(o => <button key={o.k} type="button" className={'gr-fmt-opt fmt-' + o.k} data-testid={'gr-format-add-' + o.k} onClick={() => onPick(o.k)}>
      <i className="gr-fmt-thumb">{Array.from({length: o.k.length}, (_, i) => <em key={i}/>)}</i><span>{t(o.l)}<small>{t(o.d)}</small></span></button>)}
    <button type="button" onClick={onClose}>{t('close')}</button>
  </div>;
}

/** v15: right-click menu on empty board. One submenu at a time, opens right (flips near edge). */
function BoardContextMenu({x, y, wrapEl, onClose, onSticky, onTime, onTimer, onUpload, onFormat}: {
  x: number; y: number; wrapEl: HTMLElement | null; onClose: () => void; onSticky: () => void; onTime: (clock: string) => void;
  onTimer: (mode: TimerMode, sec: number) => void; onUpload: () => void; onFormat: (k: FormatKind) => void;
}) {
  const {t} = useGarageT();
  const [sub, setSub] = useState<'time' | 'timer' | 'format' | null>(null);
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const out = (e: PointerEvent) => { if (ref.current && !ref.current.contains(e.target as Node)) onClose(); };
    const esc = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('pointerdown', out, true); window.addEventListener('keydown', esc);
    return () => { window.removeEventListener('pointerdown', out, true); window.removeEventListener('keydown', esc); };
  }, [onClose]);
  const W = wrapEl?.clientWidth || 1200, H = wrapEl?.clientHeight || 800;
  const wr = wrapEl?.getBoundingClientRect();
  const visH = Math.max(240, Math.min(H, (typeof window !== 'undefined' ? window.innerHeight : H) - Math.max(0, wr?.top || 0)));
  const left = Math.min(x, W - 230), top = Math.min(y, Math.max(0, visH - 220));
  const flip = left + 230 + 300 > W;
  const up = top + 440 > visH;
  const row = (k: 'time' | 'timer' | 'format', label: string) => <button type="button" className={'gr-ctx-row ' + (sub === k ? 'on' : '')}
    data-testid={'gr-ctx-' + k} onClick={() => setSub(v => v === k ? null : k)} onMouseEnter={() => setSub(k)}>{label}<span>▸</span></button>;
  return <div ref={ref} className={`gr-ctx ${flip ? 'is-flip' : ''} ${up ? 'is-up' : ''}`} data-testid="gr-ctx" style={{left, top}} onPointerDown={e => e.stopPropagation()} onContextMenu={e => e.preventDefault()}>
    <button type="button" className="gr-ctx-row" data-testid="gr-ctx-sticky" onClick={onSticky} onMouseEnter={() => setSub(null)}>{t('addSticky')}</button>
    {row('time', t('ctxTime'))}
    {row('timer', t('addStopwatch'))}
    <button type="button" className="gr-ctx-row" data-testid="gr-ctx-upload" onClick={onUpload} onMouseEnter={() => setSub(null)}>{t('upload')}</button>
    {row('format', t('formatBtn'))}
    {sub && <div className="gr-ctx-sub" data-testid={'gr-ctx-sub-' + sub}>
      {sub === 'time' && <TimePopover onClose={() => {}} onPlace={onTime}/>}
      {sub === 'timer' && <StopwatchPopover onClose={() => {}} onPlace={onTimer}/>}
      {sub === 'format' && <FormatPopover onClose={onClose} onPick={onFormat}/>}
    </div>}
  </div>;
}

export function Board({forceFull, onExitFull}: {forceFull?: boolean; onExitFull?: () => void}) {
  const {t} = useGarageT();
  const b = useGarage(); const view = useView();

  const vp = useRef<HTMLDivElement>(null); const [z, setZ] = useState(1); const [pan, setPan] = useState({x: 0, y: 0});
  const [sel, setSel] = useState<string | null>(null);
  // v15: marquee / modifier multi-select
  const [multi, setMulti] = useState<string[]>([]);
  const [marq, setMarq] = useState<{x: number; y: number; w: number; h: number} | null>(null);
  const isSel = (id: string) => sel === id || multi.includes(id);
  const [linkFrom, setLinkFrom] = useState<string | null>(null);
  const [linkPt, setLinkPt] = useState<{x: number; y: number} | null>(null);
  const [pop, setPop] = useState<'time' | 'timer' | 'format' | null>(null);
  const wrap = useRef<HTMLDivElement>(null);
  const anchor = useBoardAnchor();
  const [ctx, setCtx] = useState<{cx: number; cy: number; at: {x: number; y: number}} | null>(null);
  const live = useRef({pan: {x: 0, y: 0}, z: 1});
  // v14: trackpad pinch / ctrl+wheel / Safari gestures / Ctrl +-0 zoom ONLY the board; the page (and toolbar) never zooms.
  useEffect(() => {
    const el = wrap.current; if (!el) return;
    const clampZ = (v: number) => Math.min(2, Math.max(.4, +v.toFixed(2)));
    const onWheel = (e: WheelEvent) => {
      if (!e.ctrlKey && !e.metaKey) return;
      e.preventDefault();
      if ((e.target as Element)?.closest?.('dialog.gr-image-viewer')) return;
      const step = Math.max(-0.25, Math.min(0.25, -e.deltaY * (Math.abs(e.deltaY) < 30 ? 0.01 : 0.002)));
      setZ(v => clampZ(v + step));
    };
    let gz = 1;
    const onGs = (e: Event) => { e.preventDefault(); gz = 1; };
    const onGc = (e: Event) => { e.preventDefault(); if ((e.target as Element)?.closest?.('dialog.gr-image-viewer')) return; const sc = Number((e as any).scale) || 1; const d = sc / gz; gz = sc; setZ(v => clampZ(v * d)); };
    const onKey = (e: KeyboardEvent) => {
      if (document.querySelector('dialog.gr-image-viewer[open]')) return;
      if (!(e.ctrlKey || e.metaKey)) return;
      if (e.key === '+' || e.key === '=' || e.code === 'NumpadAdd') { e.preventDefault(); setZ(v => clampZ(v + .1)); }
      else if (e.key === '-' || e.key === '_' || e.code === 'NumpadSubtract') { e.preventDefault(); setZ(v => clampZ(v - .1)); }
      else if (e.key === '0' || e.code === 'Numpad0') { e.preventDefault(); setZ(1); }
    };
    el.addEventListener('wheel', onWheel, {passive: false});
    el.addEventListener('gesturestart', onGs as EventListener, {passive: false} as AddEventListenerOptions);
    el.addEventListener('gesturechange', onGc as EventListener, {passive: false} as AddEventListenerOptions);
    el.addEventListener('gestureend', onGs as EventListener, {passive: false} as AddEventListenerOptions);
    window.addEventListener('keydown', onKey, {capture: true});
    return () => {
      el.removeEventListener('wheel', onWheel);
      el.removeEventListener('gesturestart', onGs as EventListener);
      el.removeEventListener('gesturechange', onGc as EventListener);
      el.removeEventListener('gestureend', onGs as EventListener);
      window.removeEventListener('keydown', onKey, {capture: true});
    };
  }, []);
  // Smooth pan to focused page frame
  useEffect(() => {
    const el = vp.current; if (!el) return;
    const target = panToCenterPage(b.boardNumber || 1, el.clientWidth || 900, el.clientHeight || 600, z);
    setPan(target);
  }, [b.boardNumber, b.scope, b.date, b.layout]);

  // Zoom around the visible canvas centre, not world origin (which may be several pages away).
  const previousZoom = useRef(z);
  useEffect(() => {
    const before = previousZoom.current; previousZoom.current = z;
    const el = vp.current; if (!el || before === z) return;
    const cx = el.clientWidth / 2, cy = el.clientHeight / 2, ratio = z / before;
    setPan(p => ({x: cx - (cx - p.x) * ratio, y: cy - (cy - p.y) * ratio}));
  }, [z]);

  const [, setLive] = useState(0);
  const drag = useRef<{id?: string; sx: number; sy: number; ox: number; oy: number; pan?: boolean; marquee?: boolean; group?: Array<{id: string; x: number; y: number}>; link?: boolean; resize?: boolean; ow?: number; oh?: number} | null>(null);
  const liveRaf = useRef(0);
  const bumpLive = () => {
    if (liveRaf.current) return;
    liveRaf.current = requestAnimationFrame(() => { liveRaf.current = 0; setLive(n => n + 1); });
  };
  const hasRunningTimer = b.items.some(i => i.kind === 'timer' && i.timer?.status === 'running');
  useEffect(() => {
    if (!hasRunningTimer) return;
    const id = window.setInterval(() => setLive(n => n + 1), 400);
    return () => clearInterval(id);
  }, [hasRunningTimer]);
  // Delete / Backspace removes selected item (+ arrows). Skip when typing in an input/textarea.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Delete' && e.key !== 'Backspace') return;
      if (!sel && !multi.length) return;
      const tag = (e.target as HTMLElement)?.tagName;
      if (tag === 'INPUT' || tag === 'TEXTAREA' || (e.target as HTMLElement)?.isContentEditable) return;
      if ((e.target as HTMLElement)?.closest?.('input,textarea,[contenteditable="true"]')) return;
      e.preventDefault();
      const ids = Array.from(new Set([...(sel ? [sel] : []), ...multi]));
      if (ids.length > 1) garage.removeMany(ids); else garage.remove(ids[0]);
      setSel(null); setMulti([]);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [sel, multi]);
  live.current = {pan, z};
  useEffect(() => {
    boardAnchor.setCenterProvider(() => { const el = vp.current; if (!el) return null; const {pan: p, z: zz} = live.current; return {x: (el.clientWidth / 2 - p.x) / zz, y: (el.clientHeight / 2 - p.y) / zz}; });
    const onEsc = (e: KeyboardEvent) => { if (e.key !== 'Escape') return; const tg = e.target as HTMLElement; if (tg?.closest?.('textarea')) return; setCtx(null); boardAnchor.clear(); setMulti([]); setSel(null); setMarq(null); };
    window.addEventListener('keydown', onEsc);
    // Inbox / agent placements ask the board to bring the new cards into view.
    const onFocus = (e: any) => { const el = vp.current; const d = e.detail || {}; if (!el || typeof d.x !== 'number') return; const zz = live.current.z; setPan({x: el.clientWidth / 2 - d.x * zz, y: el.clientHeight / 2 - d.y * zz}); };
    window.addEventListener('garage:focus', onFocus);
    return () => { boardAnchor.setCenterProvider(null); window.removeEventListener('keydown', onEsc); window.removeEventListener('garage:focus', onFocus); };
  }, []);
  const ctxFile = useRef<HTMLInputElement>(null);
  const ctxAt = useRef<{x: number; y: number} | null>(null);
  const isFull = forceFull || view.size === 'fullscreen';
  const toWorld = (cx: number, cy: number) => { const r = vp.current!.getBoundingClientRect(); return {x: Math.round((cx - r.left - pan.x) / z), y: Math.round((cy - r.top - pan.y) / z)}; };
  const onDown = (e: React.PointerEvent, it: Item) => { if ((e.target as HTMLElement).closest('a,button,input,textarea')) return; e.stopPropagation(); (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId); try { window.getSelection()?.removeAllRanges(); } catch {} const grp = multi.length > 1 && multi.includes(it.id) ? b.items.filter(i => multi.includes(i.id)).map(i => ({id: i.id, x: i.x, y: i.y})) : undefined; drag.current = {id: it.id, sx: e.clientX, sy: e.clientY, ox: it.x, oy: it.y, group: grp}; };
  const onSelectItem = (id: string, e?: React.PointerEvent) => {
    if (e && (e.ctrlKey || e.shiftKey || e.metaKey)) {
      const cur = Array.from(new Set([...(sel ? [sel] : []), ...multi]));
      const next = cur.includes(id) ? cur.filter(x => x !== id) : [...cur, id];
      setMulti(next); setSel(next.length === 1 ? next[0] : null);
      return true;
    }
    if (multi.includes(id) && multi.length > 1) return false;
    setMulti([]); setSel(id); return false;
  };
  const onPlusDown = (e: React.PointerEvent, id: string) => {
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
    setLinkFrom(id); drag.current = {link: true, sx: e.clientX, sy: e.clientY, ox: 0, oy: 0};
    setLinkPt(toWorld(e.clientX, e.clientY));
  };
  const onMove = (e: React.PointerEvent) => {
    const d = drag.current; if (!d) return;
    if (d.link) { setLinkPt(toWorld(e.clientX, e.clientY)); bumpLive(); return; }
    const dx = (e.clientX - d.sx), dy = (e.clientY - d.sy);
    if (d.marquee) { const r = vp.current!.getBoundingClientRect(); setMarq({x: Math.min(d.sx, e.clientX) - r.left, y: Math.min(d.sy, e.clientY) - r.top, w: Math.abs(dx), h: Math.abs(dy)}); return; }
    if (d.pan) setPan({x: d.ox + dx, y: d.oy + dy});
    else if (d.group) {
      for (const g of d.group) { const el = vp.current!.querySelector<HTMLElement>(`[data-item-id="${CSS.escape(g.id)}"]`); if (el) { el.style.left = g.x + dx / z + 'px'; el.style.top = g.y + dy / z + 'px'; } }
      bumpLive();
    }
    else if (d.resize && d.id) {
      const el = vp.current!.querySelector<HTMLElement>(`[data-item-id="${CSS.escape(d.id)}"]`);
      const nw = Math.max(120, (d.ow || 200) + dx / z);
      const fi = b.items.find(i => i.id === d.id);
      const nh = fi?.kind === 'format' && fi.fmt === 'ABC' ? nw * 210 / 297 : Math.max(80, (d.oh || 110) + dy / z);
      if (el) { el.style.width = nw + 'px'; el.style.height = nh + 'px'; }
      bumpLive();
    } else {
      const el = vp.current!.querySelector<HTMLElement>(`[data-item-id="${CSS.escape(d.id || '')}"]`);
      if (el) { el.style.left = d.ox + dx / z + 'px'; el.style.top = d.oy + dy / z + 'px'; }
      bumpLive();
    }
  };
  const onUp = (e: React.PointerEvent) => {
    const d = drag.current; drag.current = null;
    if (d?.link && linkFrom) {
      const at = toWorld(e.clientX, e.clientY);
      const hit = b.items.find(it => { const c = itemCenter(it); return Math.hypot(c.x - at.x, c.y - at.y) < 120 && it.id !== linkFrom; });
      if (hit) try { garage.connect(linkFrom, hit.id); } catch {}
      setLinkFrom(null); setLinkPt(null); return;
    }
    if (d?.marquee) {
      setMarq(null);
      const a = toWorld(Math.min(d.sx, e.clientX), Math.min(d.sy, e.clientY)), c = toWorld(Math.max(d.sx, e.clientX), Math.max(d.sy, e.clientY));
      const hits = b.items.filter(it => { const bx = itemBox(it); return bx.x < c.x && bx.x + bx.w > a.x && bx.y < c.y && bx.y + bx.h > a.y; }).map(i => i.id);
      setMulti(hits); setSel(hits.length === 1 ? hits[0] : null);
      return;
    }
    if (d?.group) {
      const dx = (e.clientX - d.sx) / z, dy = (e.clientY - d.sy) / z;
      if (dx || dy) garage.moveMany(d.group.map(g => ({id: g.id, x: g.x + dx, y: g.y + dy})));
      bumpLive(); return;
    }
    if (d?.resize && d.id) {
      const nw = Math.max(120, Math.round((d.ow || 200) + (e.clientX - d.sx) / z));
      const nh = Math.max(80, Math.round((d.oh || 110) + (e.clientY - d.sy) / z));
      garage.resize(d.id, nw, nh);
      bumpLive();
      return;
    }
    if (d?.id) {
      const nx = Math.round(d.ox + (e.clientX - d.sx) / z);
      const ny = Math.round(d.oy + (e.clientY - d.sy) / z);
      garage.move(d.id, nx, ny);
      if (b.skeleton === 'choice') {
        const hit = hitSlot(nx + 40, ny + 40);
        if (hit) garage.assignSlot(hit, d.id);
      }
    }
  };
  const onResizeDown = (e: React.PointerEvent, it: Item) => {
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
    const box = itemBox(it);
    drag.current = {id: it.id, sx: e.clientX, sy: e.clientY, ox: it.x, oy: it.y, resize: true, ow: it.w || box.w, oh: it.h || box.h};
  };
  const onDrop = async (e: React.DragEvent) => { e.preventDefault(); const at = toWorld(e.clientX, e.clientY);
    const buildId=e.dataTransfer.getData(SCENE_MIME);
    if(buildId){e.stopPropagation();try{addBoardScene(buildId,at)}catch(err){communication.add({role:'system',kind:'error',source:'Garage',text:String(err)})}return}
    const slotHit = b.skeleton === 'choice' ? hitSlot(at.x, at.y) : null;
    const placeAt = slotHit ? slotOrigin(slotHit) : at;
    const afterAdd = (itemId: string) => { if (slotHit) garage.assignSlot(slotHit, itemId); };
    const raw = e.dataTransfer.getData(DRAG_MIME); if (raw) { try { const r = garage.addSnapshot(JSON.parse(raw), placeAt); afterAdd(r.item.id); } catch {} return; }
    const fl = Array.from(e.dataTransfer.files || []); if (fl.length) { e.stopPropagation();
      // Any format: the Inbox converts it, then its pages land where it was dropped.
      try { const r = await ingestMany(fl); let k = 0; for (const a of r.assets) { if (!a.pages.length || a.status === 'failed') continue; const res = await toBoard(a.id, {at: {x: (placeAt as any).x + k * 40, y: (placeAt as any).y + k * 40}, open: false}); k++; if (res.itemIds[0]) afterAdd(res.itemIds[0]); } }
      catch (err) { communication.add({text: String((err as Error).message), role: 'system', kind: 'error', source: 'Garage'}); } return; }
    const url = e.dataTransfer.getData('text/uri-list') || e.dataTransfer.getData('text/plain'); if (/^https?:\/\//.test(url)) { const r = garage.addSnapshot({title: url.slice(0, 120), url, source: t('fromLink')}, placeAt); afterAdd(r.item.id); } };
  const file = useRef<HTMLInputElement>(null);
  const upload = async (fl: FileList | null, at?: {x: number; y: number}) => { let k = 0; for (const f of Array.from(fl || [])) { try { const ref = await storeImageFile(f); garage.add({kind: 'polaroid', title: f.name.slice(0, 120), image: ref, source: t('fromUpload'), by: 'human', ...(at ? {x: at.x + k * 30, y: at.y + k * 30} : {})}); k++; } catch (err) { communication.add({text: String((err as Error).message), role: 'system', kind: 'error', source: 'Garage'}); } } };
  const bands: GarageKey[] = ['bandIntent', 'bandOptions', 'bandTeardown', 'bandCompare', 'bandVerdict'];
  const isChoice = b.skeleton === 'choice';
  // v15: connector layer covers bbox of all items + endpoints (+400 margin), negative coords allowed; recomputed each render (items/links/drag).
  const linkBox = (() => {
    let x0 = 0, y0 = 0, x1 = worldSize(Math.max(1, b.maxPage || b.boardNumber || 1)).width, y1 = PAGE_FRAME.height + 200;
    const grow = (x: number, y: number) => { if (x < x0) x0 = x; if (y < y0) y0 = y; if (x > x1) x1 = x; if (y > y1) y1 = y; };
    for (const it of b.items) { const bx = itemBox(it); grow(it.x, it.y); grow(it.x + (bx.w || 240), it.y + (bx.h || 300)); }
    if (linkPt) grow(linkPt.x, linkPt.y);
    const M = 400;
    return {x: Math.floor(x0 - M), y: Math.floor(y0 - M), w: Math.ceil(x1 - x0 + 2 * M), h: Math.ceil(y1 - y0 + 2 * M)};
  })();
  return <div className={`gr-board-wrap ${isFull ? 'is-full' : ''} ${b.layout === 'action' ? 'is-action' : ''} ${isChoice ? 'is-choice' : ''}`} data-testid="gr-board-wrap" ref={wrap}>
    <div className="gr-toolbar">
      <div className="gr-seg" role="tablist" aria-label="board-scope" title={t('scopeHint')}>
        <button className={(b.scope || garage.getScope()) === 'timeless' ? 'on' : ''} onClick={() => garage.setScope('timeless')} data-testid="gr-scope-timeless">{t('scopeTimeless')}</button>
        <button className={(b.scope || garage.getScope()) === 'date' ? 'on' : ''} onClick={() => garage.setScope('date', garageView.get().selectedDate)} data-testid="gr-scope-date">{t('scopeByDate')}</button></div>
      <div className="gr-seg" role="tablist" aria-label="board-layout">
        <button className={b.layout === 'prep' ? 'on' : ''} onClick={() => { garage.setLayoutBoard('prep'); }} data-testid="gr-layout-prep">{t('layoutPrep')}</button>
        <button className={b.layout === 'action' ? 'on' : ''} onClick={() => { garage.setLayoutBoard('action'); seedActionIfEmpty(); }} data-testid="gr-layout-action">{t('layoutAction')}</button></div>
      <div className="gr-seg"><button className={b.grid === 'dots' ? 'on' : ''} onClick={() => garage.set({grid: 'dots'})}>{t('gridDots')}</button><button className={b.grid === 'mm' ? 'on' : ''} onClick={() => garage.set({grid: 'mm'})}>{t('gridMm')}</button></div>
      <button onClick={() => setZ(v => Math.max(.4, +(v - .1).toFixed(2)))}>−</button><span className="gr-z">{Math.round(z * 100)}%</span><button onClick={() => setZ(v => Math.min(2, +(v + .1).toFixed(2)))}>+</button>
      <button data-testid="gr-add-sticky" onClick={() => { setPop(null); garage.addSticky(t('stickyDefault')); }}>{t('addSticky')}</button>
      <div className="gr-pop-wrap">
        <button type="button" data-testid="gr-add-time" onClick={() => setPop(p => p === 'time' ? null : 'time')}>{t('addTime')}</button>
        {pop === 'time' && <TimePopover onClose={() => setPop(null)} onPlace={clock => garage.addTime(clock)}/>}
      </div>
      <div className="gr-pop-wrap">
        <button type="button" data-testid="gr-add-stopwatch" onClick={() => setPop(p => p === 'timer' ? null : 'timer')}>{t('addStopwatch')}</button>
        {pop === 'timer' && <StopwatchPopover onClose={() => setPop(null)} onPlace={(mode, sec) => garage.addTimer(mode, sec, undefined, 'human', true)}/>}
      </div>
      <button onClick={() => file.current?.click()} data-testid="gr-upload">{t('upload')}</button><input ref={file} type="file" accept="image/*" multiple hidden onChange={e => { upload(e.target.files); e.target.value = ''; }} data-testid="gr-file"/>
      <div className="gr-pop-wrap">
        <button type="button" data-testid="gr-format" onClick={() => setPop(p => p === 'format' ? null : 'format')}>{t('formatBtn')}</button>
        {pop === 'format' && <FormatPopover onClose={() => setPop(null)} onPick={k => { garage.addFormat(k); setPop(null); }}/>}
      </div>
      {forceFull ? <button className="gr-btn-black" data-testid="gr-full" onClick={onExitFull}>{t('focusExit')}</button>
        : <button className="gr-btn-black" onClick={() => garageView.set({size: view.size === 'fullscreen' ? 'embedded' : 'fullscreen'})} data-testid="gr-full">{view.size === 'fullscreen' ? t('fullExit') : t('fullEnter')}</button>}
    </div>
    <div ref={vp} className={`gr-vp grid-${b.grid}`} data-testid="gr-board" onDragOver={e => { e.preventDefault(); e.dataTransfer.dropEffect = 'copy'; }} onDrop={onDrop}
      onPointerDown={e => { if (e.button === 0 && (e.ctrlKey || e.shiftKey || e.altKey || e.metaKey) && !(e.target as HTMLElement).closest('a,button,input,textarea,select,.gr-pop,.gr-toolbar,.gr-ctx')) { e.preventDefault(); try { vp.current!.setPointerCapture(e.pointerId); } catch {} drag.current = {marquee: true, sx: e.clientX, sy: e.clientY, ox: 0, oy: 0}; setMarq({x: 0, y: 0, w: 0, h: 0}); return; } if (e.button === 0 && isPanTarget(e.target as HTMLElement)) { setSel(null); setMulti([]); setPop(null); try { vp.current!.setPointerCapture(e.pointerId); } catch {} drag.current = {pan: true, sx: e.clientX, sy: e.clientY, ox: pan.x, oy: pan.y}; } }}
      onPointerMove={onMove} onPointerUp={onUp} onPointerCancel={() => { drag.current = null; }}
      onDoubleClick={e => { if (isPanTarget(e.target as HTMLElement)) boardAnchor.set(toWorld(e.clientX, e.clientY)); }}
      onContextMenu={e => { e.preventDefault(); if (!isPanTarget(e.target as HTMLElement)) { setCtx(null); return; }
        const r = wrap.current!.getBoundingClientRect(); setPop(null); setCtx({cx: e.clientX - r.left, cy: e.clientY - r.top, at: toWorld(e.clientX, e.clientY)}); }}>
      {marq && marq.w + marq.h > 2 && <div className="gr-marquee" data-testid="gr-marquee" style={{left: marq.x, top: marq.y, width: marq.w, height: marq.h}}/>}
      <div className="gr-world" onDragStart={e => e.preventDefault()} style={{transform: `translate(${pan.x}px,${pan.y}px) scale(${z})`}}>
        {Array.from({length: Math.max(1, b.maxPage || b.boardNumber || 1)}, (_, i) => {
          const n = i + 1; const o = pageOrigin(n);
          const focused = n === (b.boardNumber || 1);
          return <div key={'pf-' + n} className={`gr-page-frame ${focused ? 'is-focus' : ''}`} data-testid={'gr-page-frame-' + n}
            style={{left: o.x, top: o.y, width: PAGE_FRAME.width, height: isChoice ? CHOICE_WORLD.height : PAGE_FRAME.height}}>
            <div className="gr-wm" data-testid={n === (b.boardNumber || 1) ? 'gr-watermark' : undefined} aria-hidden="true">{String(n).padStart(3, '0')}</div>
          </div>;
        })}
        {b.layout === 'prep' ? (isChoice
          ? <div className="gr-prep-guides gr-choice-guides" data-testid="gr-choice-guides" style={{left: pageOrigin(b.boardNumber || 1).x, top: pageOrigin(b.boardNumber || 1).y, width: CHOICE_WORLD.width, height: CHOICE_WORLD.height, position: 'absolute'}}>
              {CHOICE_LANES.map(L => <div key={L.n} className="gr-band gr-choice-band" style={{top: L.top, height: L.height, width: CHOICE_WORLD.width}}><span>{L.n}. {t(L.key as GarageKey)}</span></div>)}
              {CHOICE_SLOTS.map(s => {
                const filled = !!(b.slots && b.slots[s.id]);
                return <div key={s.id} className={`gr-choice-slot ${filled ? 'is-filled' : ''}`} data-testid={'gr-slot-' + s.id} data-slot={s.id}
                  style={{left: s.x, top: s.y, width: s.w, height: s.h}}><span>{s.label}</span></div>;
              })}
            </div>
          : <div className="gr-prep-guides" style={{left: pageOrigin(b.boardNumber || 1).x, top: 0, position: 'absolute', width: PAGE_FRAME.width}}>{bands.map((k, i) => <div key={k} className="gr-band" style={{top: i * 260}}><span>{i + 1}. {t(k)}</span></div>)}</div>)
          : <div className="gr-action-guides" data-testid="gr-action-guides" style={{left: pageOrigin(b.boardNumber || 1).x, top: pageOrigin(b.boardNumber || 1).y, position: 'absolute', width: ACTION_WORLD.width, height: ACTION_WORLD.height}}>
            </div>}
        <svg className="gr-links" style={{left: linkBox.x, top: linkBox.y}} width={linkBox.w} height={linkBox.h} data-testid="gr-links" data-box={`${linkBox.x},${linkBox.y},${linkBox.w},${linkBox.h}`}><g transform={`translate(${-linkBox.x},${-linkBox.y})`}>
          {b.connectors.map(c => {
            const a = b.items.find(i => i.id === c.from), bb = b.items.find(i => i.id === c.to);
            if (!a || !bb) return null;
            const {p1, p2} = connectorEnds(a, bb);
            return <g key={c.id}><path d={connectorPath(p1.x, p1.y, p2.x, p2.y)} className="gr-link" onClick={() => garage.disconnect(c.id)}/><circle cx={p2.x} cy={p2.y} r={4} className="gr-link-end"/></g>;
          })}
          {linkFrom && linkPt && (() => { const a = b.items.find(i => i.id === linkFrom); if (!a) return null; const p1 = itemCenter(a); return <path d={connectorPath(p1.x, p1.y, linkPt.x, linkPt.y)} className="gr-link draft"/>; })()}
        </g></svg>
        {anchor && <div className="gr-anchor" data-testid="gr-anchor" style={{left: anchor.x, top: anchor.y}} title={t('anchorHint')}/>}
        {b.layout === 'prep' && <AgentSlot src={b.agentImage}/>}
        {[...b.items.filter(i => i.kind === 'format'), ...b.items.filter(i => i.kind !== 'format')].map(it => <Polaroid key={it.id} it={it} selected={isSel(it.id)} onDown={onDown} onSelect={onSelectItem} linking={linkFrom} onPlusDown={onPlusDown} onResizeDown={onResizeDown}/>)}
        {!b.items.length && <div className="gr-empty">{t('boardEmpty')}</div>}
      </div>
    </div>
    <input ref={ctxFile} type="file" accept="image/*" multiple hidden data-testid="gr-ctx-file" onChange={e => { upload(e.target.files, ctxAt.current || undefined); e.target.value = ''; }}/>
    {ctx && <BoardContextMenu x={ctx.cx} y={ctx.cy} wrapEl={wrap.current} onClose={() => setCtx(null)}
      onSticky={() => { garage.addSticky(t('stickyDefault'), ctx.at); setCtx(null); }}
      onTime={clock => { garage.addTime(clock, ctx.at); setCtx(null); }}
      onTimer={(mode, sec) => { garage.addTimer(mode, sec, ctx.at, 'human', true); setCtx(null); }}
      onUpload={() => { ctxAt.current = ctx.at; setCtx(null); ctxFile.current?.click(); }}
      onFormat={k => { garage.addFormat(k, ctx.at); setCtx(null); }}/>}
  </div>;
}
function AgentSlot({src}: {src: string | null}) {
  const {t} = useGarageT();
  return <figure className="gr-item gr-pol gr-agent-slot" style={{left: 1400, top: 40}} data-testid="gr-agent-slot"><span className="gr-pin"/>
    <div className="gr-photo">{src ? <Img src={src} alt={t('agentSlotTitle')} empty={t('noPhoto')}/> : <div className="gr-noimg">{t('agentSlotEmpty')}</div>}</div>
    <figcaption><b>{t('agentSlotTitle')}</b><small>{t('agentSlotHint')}</small></figcaption></figure>;
}

function WorkshopClock(){
 const {locale}=useGarageT();const [now,setNow]=useState(()=>new Date());
 useEffect(()=>{const id=setInterval(()=>setNow(new Date()),30000);return()=>clearInterval(id)},[]);
 return <div className="nw-clock"><time>{now.toLocaleTimeString(locale,{hour:'2-digit',minute:'2-digit'})}</time><span>{now.toLocaleDateString(locale,{day:'numeric',month:'long'})}</span></div>;
}
export function GarageSpace({active,embedded=false,library,onLibrary,onClose,onProviderHost}: {active:boolean;embedded?:boolean;library?:ReactNode;onLibrary?:()=>void;onClose?:()=>void;onProviderHost?:(host:HTMLDivElement|null)=>void}) {
  const {t, lang, locale} = useGarageT();
  const b = useGarage(); const view = useView();
  const native=useSyncExternalStore(nativeRooms.subscribe,nativeRooms.get);
  const [utility,setUtility]=useState<'calendar'|'favorites'|null>(null);
  const [globalLibrary,setGlobalLibrary]=useState(false);
  const isLibrary=embedded&&native.service==='encyclopedia';
  // MCP Garage commands and UI share the same original tab store.
  const previousTab=useRef(view.tab);
  useEffect(()=>{const service=view.tab==='board'?'sketchbook':'notebook';if(embedded&&(previousTab.current!==view.tab||(!isLibrary&&native.service!==service)))nativeRooms.select(service);previousTab.current=view.tab},[embedded,view.tab]);
  useEffect(()=>{if(embedded)setUtility(v=>view.calOpen?'calendar':v==='calendar'?null:v)},[embedded,view.calOpen]);
  const [showStart, setShowStart] = useState(() => !embedded&&needsDailyStart());
  const selectedDate = view.selectedDate || todayISO();
  const setSelectedDate = (d: string) => { garageView.set({selectedDate: d}); try { garage.setBoardDate(d); } catch {} };
  const [ps, setPs] = useState(() => loadPresetState());
  // Re-read preset when remote MCP changes it
  useEffect(() => garageView.subscribe(() => setPs(loadPresetState())), []);
  const calOpen = !!view.calOpen;
  const setCalOpen = (on: boolean) => garageView.set({calOpen: on});
  const searchOpen = !!view.searchOpen;
  useEffect(() => {
    if (active && searchOpen && showStart) {
      markDailyStartShown(todayISO());
      setShowStart(false);
    }
  }, [active, searchOpen, showStart]);
  const setSearchOpen = (on: boolean) => garageView.set({searchOpen: on, searchQuery: on ? garageView.get().searchQuery : ''});
  const focusPageId = view.focusPageId || null;
  const setFocusPageId = (id: string | null) => garageView.set({focusPageId: id});
  const [boardFocus, setBoardFocus] = useState(false);
  usePublishRemoteSection('garage',view.tab==='board'?'sketchbook':'notebook',undefined,active);
  function createNotebookLeaf(){
    const date=garageView.get().selectedDate||todayISO(),preset=loadPresetState();
    const existing=pagesOnDate(date,'notebook')[0];
    if(!existing)return ensureNotebookPage(date,preset.preset,preset.chip,t('dayEntryTitle'));
    const {leaves,leaf}=appendLeaf(existing.leaves);
    const page={...existing,leaves,leaf,updatedAt:Date.now()};upsertPage(page);return page;
  }

  useEffect(() => { migratePagesToNotebook(); }, []);

  useEffect(() => {
    if (!active) return;
    return registerControl('garage', {
      read: () => ({...readGarageState(), onboarding: showStart}),
      execute: async (id, args) => {
        // An explicit remote tab choice is the same choice as the two start buttons.
        if(id==='garage.quick'){
          const notebook=args.action==='new-page';
          if(embedded)nativeRooms.revealService(notebook?'notebook':'sketchbook');
          markDailyStartShown(todayISO());setShowStart(false);setBoardFocus(false);
          garageView.set({tab:notebook?'notebook':'board',focusPageId:null,size:'embedded',searchOpen:false});
          if(!notebook)return {tab:'board'};
          const page=createNotebookLeaf();setPageTick(n=>n+1);
          return {tab:'notebook',pageId:page.id,leaf:page.leaf,total:page.leaves.length};
        }
        // Grok 2026-11-03: any acting command dismisses the daily start screen; before, page.new/add_note/date.today ran hidden behind it.
        if (!/^garage\.(?:board\.read|ask\.read|search\.read|state)$/.test(id)) {
          markDailyStartShown(todayISO());
          setShowStart(false); setBoardFocus(false);
        }
        const r: any = await executeGarage(id, args);
        if(embedded&&/^garage\.(open|view\.set|page\.|board\.(?!read)|notebook\.)/.test(id))nativeRooms.revealService(garageView.get().tab==='board'?'sketchbook':'notebook');
        if (id === 'garage.page.new' || id === 'garage.page.open') setPageTick(n => n + 1);
        return r;
      },
    });
  }, [active, showStart, embedded]);
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (!active) return;
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k') { e.preventDefault(); garageView.set({searchOpen: true}); }
      if (e.key === 'Escape') { garageView.set({searchOpen: false, calOpen: false, focusPageId: null, size: 'embedded'}); setBoardFocus(false); if(embedded){nativeRooms.resize('normal');setUtility(null);} }
    };
    window.addEventListener('keydown', onKey); return () => window.removeEventListener('keydown', onKey);
  }, [active,embedded]);

  // Preset switch: update preset + clear chip in ONE write so chips don't wipe the new space.
  const setPreset = (preset: PresetId) => {
    const next = {preset, chip: null as string | null, weekStart: ps.weekStart};
    setPs(next); savePresetState(next);
  };
  const setChip = (chip: string | null) => {
    const next = {...ps, chip};
    setPs(next); savePresetState(next);
  };

  const finishStart = (start: StartChoice) => {
    markDailyStartShown(todayISO());
    setShowStart(false);
    const tab = normalizeStart(start);
    garageView.set({tab, size: 'embedded'});
    setBoardFocus(false);
    setFocusPageId(null);
    if (tab === 'notebook') {
      ensureNotebookPage(selectedDate, ps.preset, ps.chip, t('dayEntryTitle'));
    }
  };

  const [pageTick, setPageTick] = useState(0);
  const refreshPages = () => setPageTick(n => n + 1);
  const notebookPage = pagesOnDate(selectedDate, 'notebook')[0] || null;
  const tags = contextTags(lang, ps.preset, ps.chip);
  const topicLabel = [tags.preset, tags.subPreset].filter(Boolean).join(' · ');
  const dateLabel = formatDate(selectedDate, locale);
  const pageNums = view.tab === 'board' ? garage.boardPageNumbers() : (notebookPage ? notebookPage.leaves.map(l => l.n) : []);
  const activePage = view.tab === 'board' ? b.boardNumber : (notebookPage?.leaf || 1);

  const onNewPage = () => {
    if (view.tab === 'board') { garage.nextBoardNumber(); refreshPages(); return; }
    createNotebookLeaf();
    refreshPages();
  };
  const onSelectPage = (n: number) => {
    if (view.tab === 'board') { garage.selectBoard(n); refreshPages(); return; }
    const page = pagesOnDate(selectedDate, 'notebook')[0];
    if (!page) return;
    const leaf = Math.min(Math.max(1, n), page.leaves.length);
    upsertPage({...page, leaf});
    refreshPages();
  };

  if(embedded){
    const ru=lang==='ru';const isInbox=native.service==='inbox',isTool=['estimate','media','billing','day'].includes(native.service);const service=isLibrary?'encyclopedia':isInbox?'inbox':isTool?native.service:view.tab==='board'?'sketchbook':'notebook';
    const full=native.size==='full'||!!focusPageId||view.size==='fullscreen';
    const select=(id:string,reveal=false)=>{setUtility(null);garageView.set({focusPageId:null,size:'embedded'});if(id==='encyclopedia'){onLibrary?.();return;}if(['inbox','estimate','media','billing','day'].includes(id)){nativeRooms.select(id);return;}if(reveal)nativeRooms.revealService(id);else nativeRooms.select(id);garageView.set({tab:id==='sketchbook'?'board':'notebook'});};
    const size=(value:string)=>{garageView.set({focusPageId:null,size:'embedded'});setBoardFocus(false);nativeRooms.resize(value)};
    return <div className={'gr-space nw-shell'+(full?' nw-full':'')+' nw-'+native.size} data-testid="sp-content-garage" data-workshop-service={service}>
      <header className="nw-context" data-space-region="header">
        <div className="nw-heading"><span>WORKSHOP <small> / NATIVE CLOUDS</small></span><button type="button" onClick={onClose} aria-label={ru?'Закрыть Мастерскую':'Close Workshop'}>✕</button></div>
        <CalendarBlock compact selectedDate={selectedDate} onSelectDate={setSelectedDate} preset={ps.preset} chip={ps.chip} onPreset={setPreset} onChip={setChip} onSearch={()=>setSearchOpen(true)}>
      <nav className="nw-services" aria-label={ru?'Сервисы Мастерской':'Workshop services'}>
        <div className="nw-service-tabs">{WORKSHOP_SERVICES.map(s=><button type="button" key={s.id} data-testid={'nw-service-'+s.id} aria-pressed={service===s.id} onClick={()=>select(s.id)}><span>{s.icon}</span>{ru?s.ru:s.en}</button>)}</div>
        <div className="nw-utilities">{(['calendar','favorites'] as const).map((id,i)=><button type="button" key={id} data-testid={'nw-'+id} aria-expanded={utility===id} onClick={()=>{setUtility(utility===id?null:id);if(id==='calendar')setCalOpen(utility!==id)}}>{i?'☆':'▦'} {ru?(i?'Избранное':'Календарь'):(i?'Favorites':'Calendar')}</button>)}</div>
        {utility&&<div className="nw-utility-panel" data-testid="nw-utility-panel"><button className="nw-utility-close" onClick={()=>{setUtility(null);setCalOpen(false)}} aria-label={ru?'Закрыть панель':'Close panel'}>✕</button><SidePanel section={utility} selectedDate={selectedDate} onSelectDate={d=>{setSelectedDate(d);select('notebook',true);setCalOpen(false)}} calOpen={utility==='calendar'} setCalOpen={()=>{setUtility(null);setCalOpen(false)}}/></div>}
      </nav>
        </CalendarBlock>
      </header>
      <section className={'nw-work '+(full?'is-expanded':'')} data-testid="nw-work" data-space-region="results" aria-label={ru?'Рабочее окно':'Work window'}>
        <header className="nw-work-header"><div className="nw-work-title"><strong>{ru?WORKSHOP_SERVICES.find(s=>s.id===service)?.ru:WORKSHOP_SERVICES.find(s=>s.id===service)?.en}</strong><small>{dateLabel} · {topicLabel}</small></div><div className="nw-sizes">
          {isLibrary&&<><div className="nw-global-library"><button type="button" data-testid="nw-global-library" aria-expanded={globalLibrary} onClick={()=>setGlobalLibrary(!globalLibrary)}>{ru?'Глобальная энциклопедия':'Global encyclopedia'} ▾</button>{globalLibrary&&<div className="nw-provider-panel" role="dialog" aria-label={ru?'Глобальная энциклопедия':'Global encyclopedia'}><div className="nw-provider-title"><strong>{ru?'Библиотеки агентов':'Agent libraries'}</strong><button type="button" onClick={()=>setGlobalLibrary(false)} aria-label={ru?'Закрыть библиотеки':'Close libraries'}>✕</button></div><div ref={onProviderHost} data-testid="nw-provider-controls"/></div>}</div><button type="button" data-testid="nw-library-animation" aria-pressed={native.libraryAnimations} title={ru?'Последующие прилёты внутри энциклопедии. Стартовый корабль остаётся.':'Subsequent encyclopedia arrivals. The entrance ship stays.'} onClick={()=>nativeRooms.animations(!native.libraryAnimations)}>{ru?'Анимация':'Animation'}: {native.libraryAnimations?(ru?'вкл.':'on'):(ru?'выкл.':'off')}</button></>}
          <button type="button" data-testid="nw-size-wide" aria-pressed={native.size==='wide'&&!full} onClick={()=>size(native.size==='wide'?'normal':'wide')}>{ru?'По ширине':'Wide'} ↔</button>
          <button type="button" data-testid="nw-size-full" aria-pressed={full} onClick={()=>size(full?'normal':'full')}>{full?(ru?'Вернуть':'Restore'):(ru?'На весь экран':'Full screen')} {full?'↙':'⛶'}</button>
        </div></header>
        {isInbox?<div className="nw-body nw-inbox" key="inbox"><IntakePane/></div>:native.service==='estimate'?<div className="nw-body nw-inbox" key="estimate"><EstimatePane/></div>:native.service==='media'?<div className="nw-body nw-inbox" key="media"><MediaPane/></div>:native.service==='billing'?<div className="nw-body nw-inbox" key="billing"><BillingPane/></div>:native.service==='day'?<div className="nw-body nw-inbox" key="day"><DayPane/></div>:isLibrary?<div className="nw-body nw-library" key="library">{library||<button className="nw-library-open" onClick={onLibrary}>{ru?'Открыть энциклопедию':'Open encyclopedia'} ↗</button>}</div>:<WorkshopEntrance service={service} ru={ru}>
          <WorkspaceChrome tab={view.tab} dateLabel={dateLabel} topicLabel={topicLabel} pageNums={pageNums} activePage={activePage} onNewPage={onNewPage} onSelectPage={onSelectPage}/>
          <div className="nw-body" key={pageTick+':'+view.tab+':'+selectedDate+':'+activePage}>{view.tab==='board'?<Board/>:<NotebookPane date={selectedDate} preset={ps.preset} chip={ps.chip} focusId={null} setFocusId={setFocusPageId}/>}</div>
        </WorkshopEntrance>}
      </section>
      <SearchPopup open={searchOpen} onClose={()=>setSearchOpen(false)} onOpenPage={id=>{const p=loadPages().find(x=>x.id===id);if(p){setSelectedDate(p.date);select('notebook',true);setFocusPageId(id)}}} onOpenBoard={()=>select('sketchbook',true)}/>
    </div>;
  }

  if (showStart) return <div data-portal-surface="background" className="gr-space" data-testid="sp-content-garage"><DailyStart onDone={finishStart}/></div>;

  // Focus mode ONLY via Expand button (focusPageId) — never from start.
  if (focusPageId) {
    return <div data-portal-surface="background" className="gr-space" data-testid="sp-content-garage">
      <NotebookPane date={selectedDate} preset={ps.preset} chip={ps.chip} focusId={focusPageId} setFocusId={setFocusPageId}/>
    </div>;
  }
  if (boardFocus || view.size === 'fullscreen') {
    return <div data-portal-surface="background" className="gr-space" data-testid="sp-content-garage">
      <Board forceFull onExitFull={() => { setBoardFocus(false); garageView.set({size: 'embedded'}); }}/>
    </div>;
  }

  return <div data-portal-surface="background" className="gr-space" data-testid="sp-content-garage">
    <CustomizationScope id="garage" title="Garage Space">
      <SettingButton id="notebook" label="notebook" pressed={view.tab==='notebook'} onClick={()=>garageView.set({tab:'notebook'})}/>
      <SettingButton id="board" label="board" pressed={view.tab==='board'} onClick={()=>garageView.set({tab:'board'})}/>
    </CustomizationScope>
    <div className="sp-space-header gr-header" data-space-region="header">
      <div className="gr-cover"><div><p className="gr-eyebrow">{t('eyebrow')}</p><h2>{t('coverTitle')}<br/><span>{t('coverSub')}</span></h2></div>
        <div className="gr-cover-art" aria-hidden="true"><div className="o1"/><div className="gr-cover-card"><span>{t('coverCardEyebrow')}</span><strong>{t('coverCardTitle')}</strong></div></div>
      </div>
      <CalendarBlock selectedDate={selectedDate} onSelectDate={d => { setSelectedDate(d); }} preset={ps.preset} chip={ps.chip} onPreset={setPreset} onChip={setChip} onSearch={() => setSearchOpen(true)}/>
    </div>
    <div data-portal-surface="background" className="gr-main">
      <section className="sp-results-scroll gr-results" data-space-region="results" tabIndex={0} aria-label="Garage">
        <WorkspaceChrome tab={view.tab} dateLabel={dateLabel} topicLabel={topicLabel}
          pageNums={pageNums} activePage={activePage} onNewPage={onNewPage} onSelectPage={onSelectPage}/>
        <div className="gr-results-body" data-testid="gr-results-body" key={pageTick + ':' + view.tab + ':' + selectedDate + ':' + activePage}>
          {view.tab === 'board'
            ? <Board/>
            : <NotebookPane date={selectedDate} preset={ps.preset} chip={ps.chip} focusId={null} setFocusId={setFocusPageId}/>}
        </div>
      </section>
      <SidePanel selectedDate={selectedDate} onSelectDate={d => { setSelectedDate(d); garageView.set({tab: 'notebook'}); }} calOpen={calOpen} setCalOpen={setCalOpen}/>
    </div>
    <SearchPopup open={searchOpen} onClose={() => garageView.set({searchOpen: false})}
      onOpenPage={id => { const p = loadPages().find(x => x.id === id); if (p) { setSelectedDate(p.date); garageView.set({tab: 'notebook', searchOpen: false}); setFocusPageId(id); } }}
      onOpenBoard={() => garageView.set({tab: 'board', searchOpen: false})}/>
  </div>;
}

export async function executeGarage(id: string, a: any) {
  const by = 'agent' as const;
  // Agent-facing labels: English technical defaults (MCP); UI shows localized via garageDict when rendered.
  switch (id) {
    case 'garage.open': garageView.set({tab: a.tab || 'board'}); return {tab: garageView.get().tab};
    case 'garage.board.scope': {
      const scope = a.scope === 'date' ? 'date' : 'timeless';
      garageView.set({tab: 'board'});
      const date = scope === 'date' ? (a.date || garageView.get().selectedDate) : undefined;
      if (scope === 'date' && a.date) garageView.set({selectedDate: String(a.date).slice(0, 10)});
      garage.setScope(scope as any, date);
      const addr = garage.address();
      const address = addr.scope === 'timeless' ? ('garage·timeless·page ' + addr.page) : ('garage·' + addr.date + '·page ' + addr.page);
      return {scope: addr.scope, date: addr.date, page: addr.page, address, rev: garage.get().rev};
    }
    case 'garage.view.set': {
      if (a.layout === 'prep' || a.layout === 'action') {
        garage.setLayoutBoard(a.layout);
        if (a.layout === 'action') seedActionIfEmpty();
      } else if (a.layout) garage.set({layout: a.layout});
      const patch: any = {};
      if (a.size) patch.size = a.size;
      if (a.tab) patch.tab = coerceTab(a.tab);
      else if (a.layout || a.size) patch.tab = 'board';
      if (Object.keys(patch).length) garageView.set(patch);
      const v = garageView.get();
      return {tab: v.tab, layout: garage.get().layout, size: v.size};
    }
    case 'garage.why.set': garage.set({why: a.text}); return {why: garage.get().why, rev: garage.get().rev};
    case 'garage.board.read': return boardSummary();
    case 'garage.board.add_note': { garageView.set({tab: 'board'}); const it = garage.add({kind: 'note', title: gt('en', 'noteTitle'), text: a.text, by}); return {itemId: it.id, rev: garage.get().rev}; }
    case 'garage.board.add_sticky': { garageView.set({tab: 'board'}); const it = garage.addSticky(a.text || '', undefined, by); return {itemId: it.id, rev: garage.get().rev}; }
    case 'garage.board.add_time': {
      garageView.set({tab: 'board'});
      const clock = normalizeClock(a.time || '00:00');
      const at = (a.x != null || a.y != null) ? {x: Math.floor(Number(a.x) || 0), y: Math.floor(Number(a.y) || 0)} : undefined;
      const it = garage.addTime(clock, at, by);
      return {itemId: it.id, clock: it.clock, rev: garage.get().rev};
    }
    case 'garage.board.add_timer': {
      garageView.set({tab: 'board'});
      const mode = (a.mode === 'up' || a.mode === 'free') ? a.mode : 'down';
      if (mode !== 'free' && !(Number(a.seconds) >= 1)) throw new Error('INVALID_ARGS');
      const at = (a.x != null || a.y != null) ? {x: Math.floor(Number(a.x) || 0), y: Math.floor(Number(a.y) || 0)} : undefined;
      const start = a.start === undefined ? true : !!a.start;
      const it = garage.addTimer(mode, Number(a.seconds) || 0, at, by, start);
      const now = Date.now();
      const v = it.timer ? timerView(it.timer, now) : null;
      return {itemId: it.id, timer: it.timer && v ? {...it.timer, elapsedMs: v.elapsedMs, remainingMs: v.remainingMs, display: v.display} : null, rev: garage.get().rev};
    }
    case 'garage.board.timer_control': {
      const it = garage.timerControl(a.itemId, a.action);
      const now = Date.now();
      const v = it.timer ? timerView(it.timer, now) : null;
      return {itemId: it.id, timer: it.timer && v ? {...it.timer, elapsedMs: v.elapsedMs, remainingMs: v.remainingMs, display: v.display} : null, rev: garage.get().rev};
    }
    case 'garage.board.connect': { garageView.set({tab: 'board'}); const c = garage.connect(a.fromId, a.toId); return {connectorId: c?.id, rev: garage.get().rev}; }
    case 'garage.board.anchor': {
      garageView.set({tab: 'board'});
      if (a.clear) { boardAnchor.clear(); return {anchor: null}; }
      if (a.x == null || a.y == null) return {anchor: boardAnchor.get()};
      return {anchor: boardAnchor.set({x: Math.floor(Number(a.x) || 0), y: Math.floor(Number(a.y) || 0)})};
    }
    case 'garage.format.add': {
      garageView.set({tab: 'board'});
      const kind: FormatKind = a.kind === 'AB' || a.kind === 'ABC' ? a.kind : 'A';
      const at = (a.x != null || a.y != null) ? {x: Math.floor(Number(a.x) || 0), y: Math.floor(Number(a.y) || 0)} : undefined;
      const it = garage.addFormat(kind, at, by);
      return {itemId: it.id, kind, x: it.x, y: it.y, w: it.w, h: it.h, rev: garage.get().rev};
    }
    case 'garage.format.export': {
      const it = garage.get().items.find(i => i.id === a.itemId);
      if (!it || it.kind !== 'format') throw new Error('FORMAT_NOT_FOUND');
      if (it.fmt !== 'ABC') throw new Error('EXPORT_NEEDS_A4_FRAME');
      garageView.set({tab: 'board'});
      await new Promise(r => setTimeout(r, 250));
      const r = await exportFrame(it, a.format === 'pdf' ? 'pdf' : 'jpeg');
      return {itemId: it.id, ...r};
    }
    case 'garage.board.caption': { garage.setCaption(a.itemId, a.text); return {itemId: a.itemId, caption: a.text, rev: garage.get().rev}; }
    case 'garage.board.add_polaroid': { garageView.set({tab: 'board'}); let image: string | null = null, stored = 'none';
      if (a.imageUrl) { const r = await importImageUrl(a.imageUrl); image = r.ref; stored = r.stored; }
      const r = garage.addSnapshot({title: a.title, url: a.url || null, image, price: a.price || '', source: a.source || gt('en', 'fromAgent')}, undefined, by); return {itemId: r.item.id, added: r.added, image: stored, rev: garage.get().rev}; }
    case 'garage.board.add_from_favorite': { const f = loadFavs().find(x => x.id === a.favoriteId); if (!f) throw new Error('FAVORITE_NOT_FOUND'); garageView.set({tab: 'board'}); const r = garage.addSnapshot(favSnapshot(f, gt('en', 'favSource')), undefined, by); return {itemId: r.item.id, added: r.added, rev: garage.get().rev}; }
    case 'garage.board.add_from_result': { const s = marketResult(a.resultId); if (!s) throw new Error('RESULT_NOT_FOUND'); garageView.set({tab: 'board'}); const r = garage.addSnapshot(s, undefined, by); return {itemId: r.item.id, added: r.added, title: s.title, rev: garage.get().rev}; }
    case 'garage.teardown.build': {
      garageView.set({tab: 'board'});
      if (!a.forItem || !garage.get().items.some(i => i.id === a.forItem)) throw new Error('ITEM_NOT_FOUND');
      let image: string | null = null, stored = 'none';
      if (a.uploadId) {
        const res = await fetch('/api/garage/attachments/' + encodeURIComponent(a.uploadId), {credentials: 'same-origin'});
        if (!res.ok) throw new Error('ATTACHMENT_NOT_FOUND');
        const blob = await res.blob();
        image = await storeImageFile(blob);
        stored = 'indexeddb';
        fetch('/api/garage/attachments/' + encodeURIComponent(a.uploadId), {method: 'DELETE', credentials: 'same-origin'}).catch(() => {});
      } else if (a.imageUrl) {
        const r = await importImageUrl(a.imageUrl);
        image = r.ref; stored = r.stored;
      }
      const partsIn = Array.isArray(a.parts) ? a.parts : [];
      const parts = [];
      for (const p of partsIn) {
        let pImg: string | null = null;
        if (p && p.image && typeof p.image === 'string' && /^https?:\/\//i.test(p.image)) {
          try { const r = await importImageUrl(p.image); pImg = r.ref; } catch { pImg = p.image; }
        } else if (p && typeof p.image === 'string') pImg = p.image;
        parts.push({
          key: String(p.key || ''),
          label: String(p.label || ''),
          image: pImg,
          price: p.unknown ? null : (p.price != null ? String(p.price) : null),
          unknown: !!p.unknown || p.price == null || p.price === '',
        });
      }
      const at = (a.x != null || a.y != null) ? {x: Math.floor(Number(a.x) || 0), y: Math.floor(Number(a.y) || 0)} : undefined;
      const it = garage.addTeardown({
        title: a.title || gt('en', 'teardownTitle'),
        image, parts, forItem: a.forItem, ...(at || {}),
      }, by);
      return {
        itemId: it.id, forItem: a.forItem, parts: it.parts?.length || 0,
        total: garage.teardownTotal(it.parts), image: stored, connector: true, rev: garage.get().rev,
      };
    }
    case 'garage.compare.recipe': return compareRecipe();
    case 'garage.board.delete_many': { const ids: string[] = Array.isArray(a.itemIds) ? a.itemIds.map(String) : []; const have = new Set(garage.get().items.map(i => i.id)); const found = ids.filter(id => have.has(id)); const missing = ids.filter(id => !have.has(id)); if (!found.length) throw new Error('ITEM_NOT_FOUND'); garage.removeMany(found); return {removed: found, missing, rev: garage.get().rev}; }
    case 'garage.board.remove': { if (!garage.get().items.some(i => i.id === a.itemId)) throw new Error('ITEM_NOT_FOUND'); garage.remove(a.itemId); return {removed: a.itemId, rev: garage.get().rev}; }
    case 'garage.attach.url': { garageView.set({tab: 'board'}); const r = await importImageUrl(a.url); if (a.target === 'slot') { garage.set({agentImage: r.ref}); return {target: 'slot', stored: r.stored, rev: garage.get().rev}; }
      const it = garage.add({kind: 'polaroid', title: a.title, image: r.ref, source: gt('en', 'fromAgentImage'), by, tag: gt('en', 'tagAgent')}); return {itemId: it.id, stored: r.stored, rev: garage.get().rev}; }
    case 'garage.attach.commit': { garageView.set({tab: 'board'}); const res = await fetch('/api/garage/attachments/' + encodeURIComponent(a.uploadId), {credentials: 'same-origin'}); if (!res.ok) throw new Error('ATTACHMENT_NOT_FOUND');
      const blob = await res.blob(); const ref = await storeImageFile(blob); fetch('/api/garage/attachments/' + encodeURIComponent(a.uploadId), {method: 'DELETE', credentials: 'same-origin'}).catch(() => {});
      if (a.target === 'slot') { garage.set({agentImage: ref}); return {target: 'slot', stored: 'indexeddb', rev: garage.get().rev}; }
      const it = garage.add({kind: 'polaroid', title: a.title, image: ref, source: gt('en', 'fromAgentImage'), by, tag: gt('en', 'tagAgent')}); return {itemId: it.id, stored: 'indexeddb', rev: garage.get().rev}; }
    case 'garage.plan.checkpoint': { if (!garage.get().stations.some(s => s.id === a.stationId)) throw new Error('STATION_NOT_FOUND'); garage.station(a.stationId, {state: a.state}); return {stationId: a.stationId, state: a.state, rev: garage.get().rev}; }
    case 'garage.plan.set_stations': { garage.set({stations: a.stations.map((s: any, i: number) => ({id: (s.line === 'B' ? 'b' : 'a') + (i + 1), line: s.line, time: s.time, title: s.title, state: 'pending'})), layout: 'action'}); return {stations: garage.get().stations.length, rev: garage.get().rev}; }
    case 'garage.ask.read': {
      const list = loadAsk();
      return {
        count: list.length,
        pending: list.filter(x => !x.reply).length,
        items: list.slice(0, 20).map(x => ({
          id: x.id, qNum: x.qNum, target: x.target,
          tag: x.tag, header: x.header,
          preset: x.preset, presetId: x.presetId,
          subPreset: x.subPreset, subPresetId: x.subPresetId,
          prompt: x.prompt,
          pageDate: x.pageDate, pageId: x.pageId,
          anchor: x.anchor || null,
          text: x.text.slice(0, 800),
          reply: x.reply ? x.reply.slice(0, 500) : null,
          variants: Array.isArray(x.variants) ? x.variants : [],
          insertedVariant: x.insertedVariant || null,
          insertAnchor: x.insertAnchor || null,
          at: new Date(x.at).toISOString(),
        })),
      };
    }
    case 'garage.ask.reply': {
      const text = String(a.text || '').slice(0, 4000);
      if (!a.askId || !text) throw new Error('INVALID_ARGS');
      // PowerShell ConvertTo-Json may send a lone string for a 1-element array — coerce.
      let variants: string[] | undefined;
      if (Array.isArray(a.variants)) variants = a.variants;
      else if (typeof a.variants === 'string' && a.variants.trim()) variants = [a.variants];
      const item = replyAsk(a.askId, text, variants);
      garageView.set({tab: 'notebook'});
      communication.add({text, role: 'agent', contact: 'agent', source: 'AI · Sunrise', kind: 'info', key: 'ask-reply-' + item.id} as any);
      return {
        askId: item.id, replied: true, inserted: false,
        header: item.header, tag: item.tag,
        variants: item.variants || [],
        insertedVariant: item.insertedVariant || null,
      };
    }
    case 'garage.ask.insert': {
      if (!a.askId) throw new Error('INVALID_ARGS');
      const variant = Math.max(1, Math.floor(Number(a.variant) || 1));
      const item = insertAskVariant(a.askId, variant);
      garageView.set({tab: 'notebook'});
      return {
        askId: item.id, inserted: true,
        variant: item.insertedVariant,
        insertAnchor: item.insertAnchor || null,
        variants: item.variants || [],
      };
    }
    case 'garage.notebook.autofill': {
      garageView.set({tab: 'notebook'});
      const focusId = garageView.get().focusPageId;
      const all = loadPages().filter(p => p.kind === 'notebook');
      const focus = focusId ? all.find(p => p.id === focusId) : null;
      const day = focus?.date || garageView.get().selectedDate || todayISO();
      const ids = all.filter(p => p.date === day).map(p => p.id);
      const r = autofillAskInserts(ids);
      return {inserted: r.inserted, skipped: r.skipped, pageDate: day, pageIds: ids};
    }
    case 'garage.notebook.expand': {
      const on = a.on === undefined ? true : !!a.on;
      garageView.set({tab: 'notebook'});
      if (!on) {
        garageView.set({focusPageId: null});
        return {expanded: false, focusPageId: null};
      }
      const page = ensureNb('Notebook');
      garageView.set({focusPageId: page.id});
      return {expanded: true, focusPageId: page.id, pageDate: page.date};
    }
    case 'garage.notebook.collapse': {
      garageView.set({focusPageId: null});
      return {expanded: false, focusPageId: null};
    }
    case 'garage.page.new': return doPageNew();
    case 'garage.page.open': return doPageOpen(a.page);
    case 'garage.notebook.save': {
      garageView.set({tab: 'notebook'});
      const page = currentNotebookPage() || ensureNb('Notebook');
      upsertPage(page);
      return {saved: true, pageId: page.id, page: pageInfo()};
    }
    case 'garage.notebook.export': {
      garageView.set({tab: 'notebook'});
      const page = currentNotebookPage() || ensureNb('Notebook');
      const format = a.format === 'md' ? 'md' : 'json';
      const body = format === 'md' ? exportPageMd(page) : exportPageJson(page);
      const filename = `garage-${page.date}-p${page.leaf}.${format === 'md' ? 'md' : 'json'}`;
      downloadText(filename, body, format === 'md' ? 'text/markdown' : 'application/json');
      return {exported: true, format, filename, pageId: page.id};
    }
    case 'garage.space.set': return doSpaceSet(a.space);
    case 'garage.topic.set': return doTopicSet(a.topic);
    case 'garage.search': {
      const query = String(a.query ?? '');
      garageView.set({searchOpen: true, searchQuery: query});
      return {query, open: true, hits: searchHits(query)};
    }
    case 'garage.date.set': {
      const selectedDate = remoteSetDate(a.date);
      return {selectedDate};
    }
    case 'garage.date.next': {
      const cur = garageView.get().selectedDate || todayISO();
      const selectedDate = remoteSetDate(addDays(cur, 1));
      return {selectedDate};
    }
    case 'garage.date.prev': {
      const cur = garageView.get().selectedDate || todayISO();
      const selectedDate = remoteSetDate(addDays(cur, -1));
      return {selectedDate};
    }
    case 'garage.date.today': {
      const selectedDate = remoteSetDate(todayISO());
      let label = selectedDate; try { label = new Date(selectedDate + 'T12:00:00').toLocaleDateString('ru-RU', {weekday: 'long', day: 'numeric', month: 'long', year: 'numeric'}); } catch {}
      return {selectedDate, speak: '\u0421\u0435\u0433\u043e\u0434\u043d\u044f ' + label};
    }
    case 'garage.calendar.open': {
      const on = a.on === undefined ? true : !!a.on;
      garageView.set({calOpen: on});
      return {calOpen: on, selectedDate: garageView.get().selectedDate};
    }
    case 'garage.board.clear': {
      if (a.confirm !== true) throw new Error('CONFIRM_REQUIRED');
      garageView.set({tab: 'board'});
      garage.clear(true);
      return {cleared: true, rev: garage.get().rev, boardNumber: garage.get().boardNumber};
    }
    case 'garage.item.move': {
      if (!garage.get().items.some(i => i.id === a.itemId)) throw new Error('ITEM_NOT_FOUND');
      if (a.x != null && a.y != null) garage.move(a.itemId, Math.floor(Number(a.x) || 0), Math.floor(Number(a.y) || 0));
      else if (a.dx != null || a.dy != null) {
        const it = garage.get().items.find(i => i.id === a.itemId)!;
        garage.move(a.itemId, it.x + Math.floor(Number(a.dx) || 0), it.y + Math.floor(Number(a.dy) || 0));
      } else throw new Error('INVALID_ARGS');
      return {itemId: a.itemId, rev: garage.get().rev};
    }
    case 'garage.slot.put': {
      garageView.set({tab: 'board'});
      if (garage.get().skeleton !== 'choice') garage.enableChoiceSkeleton();
      const slot = String(a.slot || '') as ChoiceSlotId;
      if (!SLOT_IDS.includes(slot)) throw new Error('SLOT_NOT_FOUND');
      const item = a.item || {};
      const placed = await placeIntoChoiceSlot(slot, item, by);
      return {slot, itemId: placed.itemId, kind: placed.kind, rev: garage.get().rev};
    }
    case 'garage.preset.choice': {
      garageView.set({tab: 'board'});
      const out = await buildChoicePreset(a, by);
      return out;
    }
    case 'garage.preset.action': {
      garageView.set({tab: 'board'});
      return await buildActionPreset(a, by);
    }
    case 'garage.action.marker.add': {
      garage.setLayoutBoard('action'); seedActionIfEmpty();
      const page = garage.get().boardNumber || 1;
      const origin = pageOrigin(page);
      const clock = String(a.time || a.clock || '12:00').slice(0, 5);
      const times = garage.get().items.filter(i => i.kind === 'time' && i.lane === 'A' && (i.page || pageAtX(i.x, garage.get().maxPage || 999)) === page);
      const index = a.index != null ? Math.floor(Number(a.index)) : times.length;
      const m = actionMarkerAt(Math.max(0, index));
      const tm = garage.addTime(clock, {x: origin.x + m.timeX, y: origin.y + m.timeY}, by);
      garage.patch(tm.id, {lane: 'A', markerIndex: index, rot: 0, page});
      const st = garage.addSticky(String(a.sticky || ''), {x: origin.x + m.stickyX, y: origin.y + m.stickyY}, by);
      garage.patch(st.id, {lane: 'A', markerIndex: index, page});
      if (times.length) {
        const prev = times.sort((x, y) => (x.markerIndex || 0) - (y.markerIndex || 0)).at(-1);
        if (prev) try { garage.connect(prev.id, tm.id); } catch {}
      }
      garage.markActionSeeded(page);
      return {itemId: tm.id, stickyId: st.id, index, clock, page, rev: garage.get().rev};
    }
    case 'garage.action.marker.remove': {
      const idx = Math.floor(Number(a.index));
      const b = garage.get();
      const victims = b.items.filter(i => i.markerIndex === idx && i.lane === 'A');
      for (const v of victims) garage.remove(v.id);
      return {removed: victims.map(v => v.id), rev: garage.get().rev};
    }
    case 'garage.action.put': {
      garage.setLayoutBoard('action'); seedActionIfEmpty();
      const page = garage.get().boardNumber || 1;
      const origin = pageOrigin(page);
      const lane = (a.lane === 'B' || a.lane === 'C' || a.lane === 'A') ? a.lane : 'A';
      const index = Math.max(0, Math.floor(Number(a.index) || 0));
      const m = actionMarkerAt(index);
      const local = lane === 'A'
        ? (a.under === 'sticky' ? {x: m.stickyX, y: m.stickyY} : a.under === 'card' ? {x: m.cardX, y: m.cardY} : {x: m.timeX, y: m.timeY})
        : actionLaneOrigin(lane, index);
      const o = {x: origin.x + local.x, y: origin.y + local.y};
      const item = a.item || {};
      const kind = String(a.kind || item.kind || 'sticky');
      let placed: {itemId: string; kind: string};
      if (kind === 'time') {
        const it = garage.addTime(String(item.time || item.clock || '12:00').slice(0, 5), o, by);
        garage.patch(it.id, {lane, markerIndex: index, page});
        placed = {itemId: it.id, kind: 'time'};
      } else if (kind === 'timer') {
        const it = garage.addTimer(item.mode === 'up' || item.mode === 'free' ? item.mode : 'down', Number(item.seconds) || 1800, o, by, item.start !== false);
        garage.patch(it.id, {lane, markerIndex: index, page});
        placed = {itemId: it.id, kind: 'timer'};
      } else if (kind === 'map') {
        const it = garage.addMap({
          title: item.title, lat: item.lat, lon: item.lon, mapQuery: item.mapQuery || item.query || item.title,
          image: item.imageUrl || item.image, mapsUrl: item.mapsUrl || item.url,
          x: o.x, y: o.y,
        }, by);
        garage.patch(it.id, {lane, markerIndex: index, page});
        placed = {itemId: it.id, kind: 'map'};
      } else if (kind === 'shop' || kind === 'polaroid') {
        const img = await resolveChoiceImage(item);
        const r = garage.addSnapshot({
          title: String(item.title || 'Shop').slice(0, 200),
          url: item.url || null, image: img.ref, price: item.price || '', source: item.source || '',
        }, o, by);
        garage.patch(r.item.id, {lane, markerIndex: index, page});
        placed = {itemId: r.item.id, kind: 'polaroid'};
      } else {
        const it = garage.addSticky(String(item.text || item.title || ''), o, by);
        garage.patch(it.id, {lane, markerIndex: index, page});
        placed = {itemId: it.id, kind: 'sticky'};
      }
      garage.markActionSeeded(page);
      return {lane, index, page, ...placed, rev: garage.get().rev};
    }
  }
  throw new Error('COMMAND_NOT_ALLOWED');
}

async function resolveChoiceImage(spec: any): Promise<{ref: string | null; stored: string}> {
  if (!spec) return {ref: null, stored: 'none'};
  if (spec.uploadId) {
    const res = await fetch('/api/garage/attachments/' + encodeURIComponent(spec.uploadId), {credentials: 'same-origin'});
    if (!res.ok) throw new Error('ATTACHMENT_NOT_FOUND');
    const blob = await res.blob();
    const ref = await storeImageFile(blob);
    fetch('/api/garage/attachments/' + encodeURIComponent(spec.uploadId), {method: 'DELETE', credentials: 'same-origin'}).catch(() => {});
    return {ref, stored: 'indexeddb'};
  }
  if (spec.imageUrl) {
    const r = await importImageUrl(spec.imageUrl);
    return {ref: r.ref, stored: r.stored};
  }
  return {ref: null, stored: 'none'};
}

function normalizeParts(partsIn: any[] | undefined) {
  const parts = [];
  for (const p of partsIn || []) {
    parts.push({
      key: String(p.key || ''),
      label: String(p.label || ''),
      image: typeof p.image === 'string' ? p.image : null,
      price: p.unknown ? null : (p.price != null ? String(p.price) : null),
      unknown: !!p.unknown || p.price == null || p.price === '' || p.price === '?',
    });
  }
  return parts.filter(p => p.label);
}

async function placeIntoChoiceSlot(slot: ChoiceSlotId, item: any, by: 'human' | 'agent') {
  const o = slotOrigin(slot);
  // sticky-like slots
  if (slot === 'intent' || slot === 'compare' || slot === 'verdict') {
    const text = String(item.text || item.title || '').slice(0, 1000);
    const it = garage.addSticky(text || (slot === 'intent' ? 'Intent' : slot === 'verdict' ? 'Verdict' : 'Compare'), o, by);
    garage.patch(it.id, {w: slot === 'intent' ? 480 : 560});
    garage.assignSlot(slot, it.id);
    return {itemId: it.id, kind: 'sticky'};
  }
  if (slot === 'timer') {
    const mode = (item.mode === 'up' || item.mode === 'free') ? item.mode : 'down';
    const sec = Math.max(1, Math.floor(Number(item.seconds) || 1800));
    const start = item.start === false ? false : true;
    const it = garage.addTimer(mode, sec, o, by, start);
    if (item.caption) garage.setCaption(it.id, String(item.caption).slice(0, 200));
    garage.assignSlot(slot, it.id);
    return {itemId: it.id, kind: 'timer'};
  }
  if (slot === 'tdA' || slot === 'tdB') {
    const img = await resolveChoiceImage(item);
    const forItem = item.forItem || (slot === 'tdA' ? garage.get().slots?.optA : garage.get().slots?.optB) || null;
    if (!forItem || !garage.get().items.some(i => i.id === forItem)) throw new Error('ITEM_NOT_FOUND');
    const it = garage.addTeardown({
      title: item.title || 'Teardown',
      image: img.ref,
      parts: normalizeParts(item.parts),
      forItem,
      x: o.x, y: o.y,
    }, by);
    garage.assignSlot(slot, it.id);
    return {itemId: it.id, kind: 'teardown'};
  }
  // optA / optB polaroid
  const img = await resolveChoiceImage(item);
  const r = garage.addSnapshot({
    title: String(item.title || 'Option').slice(0, 200),
    url: item.url || null,
    image: img.ref,
    price: item.price || '',
    source: item.source || '',
  }, o, by);
  garage.assignSlot(slot, r.item.id);
  return {itemId: r.item.id, kind: 'polaroid'};
}

async function buildChoicePreset(a: any, by: 'human' | 'agent') {
  // Reject malformed options before replacing any content on the current page.
  if (!a.optionA || typeof a.optionA.title !== 'string' || !a.optionA.title.trim()) throw new Error('INVALID_ARGS');
  if (a.optionB && (typeof a.optionB.title !== 'string' || !a.optionB.title.trim())) throw new Error('INVALID_ARGS');
  garage.enableChoiceSkeleton();
  // clear current board content for a clean choice layout
  garage.clear(true);
  garage.enableChoiceSkeleton();

  const intentText = String(a.intent || 'Intent').slice(0, 1000);
  const intent = await placeIntoChoiceSlot('intent', {text: intentText}, by);

  if (!a.optionA || !a.optionA.title) throw new Error('INVALID_ARGS');
  const optA = await placeIntoChoiceSlot('optA', a.optionA, by);
  let optB: {itemId: string; kind: string} | null = null;
  if (a.optionB && a.optionB.title) optB = await placeIntoChoiceSlot('optB', a.optionB, by);

  let tdA: {itemId: string; kind: string} | null = null;
  let tdB: {itemId: string; kind: string} | null = null;
  if (a.teardownA && Array.isArray(a.teardownA.parts)) {
    tdA = await placeIntoChoiceSlot('tdA', {...a.teardownA, forItem: optA.itemId, title: a.teardownA.title || (a.optionA.title + ' — parts')}, by);
  }
  if (optB && a.teardownB && Array.isArray(a.teardownB.parts)) {
    tdB = await placeIntoChoiceSlot('tdB', {...a.teardownB, forItem: optB.itemId, title: a.teardownB.title || (a.optionB.title + ' — parts')}, by);
  }

  let timer: {itemId: string; kind: string} | null = null;
  if (a.timer) {
    timer = await placeIntoChoiceSlot('timer', {
      mode: a.timer.mode || 'down',
      seconds: a.timer.seconds || 1800,
      start: a.timer.start !== false,
      caption: a.timer.caption || '',
    }, by);
  }

  let compare: {itemId: string; kind: string} | null = null;
  if (a.compare) {
    compare = await placeIntoChoiceSlot('compare', {text: String(a.compare)}, by);
  }
  let verdict: {itemId: string; kind: string} | null = null;
  if (a.verdict) {
    verdict = await placeIntoChoiceSlot('verdict', {text: String(a.verdict)}, by);
  }

  // arrows: intent→A, intent→B, A→tdA, B→tdB (teardown auto), tdA/tdB→compare, timer→compare, compare→verdict
  try { garage.connect(intent.itemId, optA.itemId); } catch {}
  if (optB) try { garage.connect(intent.itemId, optB.itemId); } catch {}
  // product→teardown already by addTeardown
  if (tdA && compare) try { garage.connect(tdA.itemId, compare.itemId); } catch {}
  if (tdB && compare) try { garage.connect(tdB.itemId, compare.itemId); } catch {}
  if (timer && compare) try { garage.connect(timer.itemId, compare.itemId); } catch {}
  if (compare && verdict) try { garage.connect(compare.itemId, verdict.itemId); } catch {}

  const b = garage.get();
  return {
    skeleton: 'choice',
    rev: b.rev,
    boardNumber: b.boardNumber,
    slots: b.slots,
    ids: {
      intent: intent.itemId,
      optA: optA.itemId,
      optB: optB?.itemId || null,
      tdA: tdA?.itemId || null,
      tdB: tdB?.itemId || null,
      timer: timer?.itemId || null,
      compare: compare?.itemId || null,
      verdict: verdict?.itemId || null,
    },
    connectors: b.connectors.length,
    items: b.items.length,
  };
}



async function buildActionPreset(a: any, by: 'human' | 'agent') {
  garage.setLayoutBoard('action');
  garage.clear(true);
  garage.enableActionSkeleton();
  const page = garage.get().boardNumber || 1;
  const origin = pageOrigin(page);
  const steps = Array.isArray(a.steps) && a.steps.length
    ? a.steps
    : ACTION_DEFAULT_TIMES.map((time) => ({time, sticky: '', kind: 'note'}));
  const ids: {time?: string; card?: string; sticky?: string}[] = [];
  let prevTime: string | null = null;
  for (let i = 0; i < Math.min(12, steps.length); i++) {
    const step = steps[i] || {};
    const m = actionMarkerAt(i);
    const clock = String(step.time || ACTION_DEFAULT_TIMES[i] || '12:00').slice(0, 5);
    const tm = garage.addTime(clock, {x: origin.x + m.timeX, y: origin.y + m.timeY}, by);
    garage.patch(tm.id, {lane: 'A', markerIndex: i, rot: 0, page});
    if (prevTime) try { garage.connect(prevTime, tm.id); } catch {}
    prevTime = tm.id;

    let cardId: string | null = null;
    const kind = String(step.kind || 'note');
    if (kind === 'shop' || kind === 'polaroid') {
      const img = await resolveChoiceImage(step);
      const r = garage.addSnapshot({
        title: String(step.title || step.sticky || 'Shop').slice(0, 200),
        url: step.url || null, image: img.ref, price: step.price || '', source: step.source || '',
      }, {x: origin.x + m.cardX, y: origin.y + m.cardY}, by);
      garage.patch(r.item.id, {lane: 'A', markerIndex: i, page});
      cardId = r.item.id;
      try { garage.connect(tm.id, cardId); } catch {}
    } else if (kind === 'map') {
      let lat = Number(step.lat), lon = Number(step.lon);
      const q = String(step.mapQuery || step.query || step.title || '').slice(0, 200);
      if (!Number.isFinite(lat) || !Number.isFinite(lon)) {
        // Unpinned maps start at the regional reference point, never at a made-up seller location.
        await loadRegion();const reg=regions[effectiveCountry()];
        if(!reg)throw Error('MAP_COORDINATES_REQUIRED');
        lat=reg.lat;lon=reg.lon;
      }
      const img = step.imageUrl ? (await resolveChoiceImage(step)).ref : osmStaticMapUrl(lat, lon);
      const mapsUrl = step.mapsUrl || step.url || googleMapsLink(lat, lon, q);
      const it = garage.addMap({
        title: String(step.title || q || 'Map').slice(0, 200),
        lat, lon, mapQuery: q, image: img, mapsUrl, url: mapsUrl,
        x: origin.x + m.cardX, y: origin.y + m.cardY,
      }, by);
      garage.patch(it.id, {lane: 'A', markerIndex: i, page});
      cardId = it.id;
      try { garage.connect(tm.id, cardId); } catch {}
    }

    const stickyText = String(step.sticky || step.text || '').slice(0, 1000);
    const st = garage.addSticky(stickyText, {x: origin.x + m.stickyX, y: origin.y + m.stickyY}, by);
    garage.patch(st.id, {lane: 'A', markerIndex: i, page});
    try { garage.connect(cardId || tm.id, st.id); } catch {}
    ids.push({time: tm.id, card: cardId || undefined, sticky: st.id});
  }
  garage.markActionSeeded(page);
  const b = garage.get();
  return {
    skeleton: 'action', layout: 'action', rev: b.rev, boardNumber: b.boardNumber, page,
    steps: ids.length, items: b.items.length, connectors: b.connectors.length, ids,
  };
}
