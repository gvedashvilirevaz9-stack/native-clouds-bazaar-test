// Agent Marketplace: the owner's Money Space services as glass cards (weather, rates, news, crypto, trips, evening).
// Ask in words or pick a package; every answer lands in the same feed as a card. Information only — no payments here.
import {useEffect, useRef, useState} from 'react';
import type React from 'react';

type Opt = {serviceId: string; label: string; desc: string; needsInput: boolean};
type Pkg = {id: string; ru: string; icon: string; question: string; options: Opt[]};
type Res = {serviceId: string; ok: boolean; title: string; summary: string; card: any; sources: {name: string; ok: boolean; url: string | null}[]; fetchedAt?: string};
type Entry = {id: string; at: number; ask: string; items: Res[]; note?: string};
const FEED = 'bz.money.feed.v1';
const load = (): Entry[] => { try { return JSON.parse(localStorage.getItem(FEED) || '[]'); } catch { return []; } };
const save = (v: Entry[]) => { try { localStorage.setItem(FEED, JSON.stringify(v.slice(0, 30))); } catch { /* full */ } };
const PK_COLOR: Record<string, string> = {morning: '#f2a93b', money: '#2f9e63', travel: '#2f8fd8', evening: '#7a5af5', crypto: '#e0503a'};
const EXAMPLES = ['погода в Батуми', 'курс доллара', 'новости', 'цена биткоина', 'индекс страха и жадности', 'что посмотреть вечером', 'праздники', 'аптека рядом'];
const WMO = (c: number, day = true) => c === 0 ? (day ? '☀️' : '🌙') : c <= 2 ? '🌤' : c === 3 ? '☁️' : c <= 48 ? '🌫' : c <= 57 ? '🌦' : c <= 67 ? '🌧' : c <= 77 ? '🌨' : c <= 82 ? '🌧' : c <= 86 ? '🌨' : '⛈';
const r0 = (n: any) => n == null || isNaN(+n) ? '—' : Math.round(+n);
const linkOf = (x: any) => [x?.url, x?.link, x?.map, x?.website].find(u => typeof u === 'string' && /^https?:\/\//.test(u)) || null;
const day = (d: string) => { try { return new Date(d).toLocaleDateString('ru', {weekday: 'short', day: 'numeric'}); } catch { return d; } };

function Rows({items}: {items: any[]}) {
  return <div className="mp-rows">{items.slice(0, 8).map((x, i) => { const u = linkOf(x); const title = x.title || x.name || x.symbol || x.label || '—';
    const value = x.value ?? x.priceLabel ?? (x.price != null ? x.price + (x.currency ? ' ' + x.currency : '') : x.usd != null ? '$' + x.usd : null);
    const sub = x.sub || x.subtitle || x.source || x.description || (x.walkMin ? `🚶 ${x.walkMin} мин` : '') || x.address || '';
    const body = <><span className="mp-row-t"><b>{String(title).slice(0, 120)}</b>{sub && <small>{String(sub).slice(0, 140)}</small>}</span>{value != null && <span className={'mp-row-v' + (x.tone ? ' ' + x.tone : '')}>{String(value)}</span>}</>;
    return u ? <a key={i} className="mp-row" href={u} target="_blank" rel="noreferrer">{body}</a> : <div key={i} className="mp-row">{body}</div>; })}</div>;
}

export function MoneyCard({r}: {r: Res}) {
  const c = r.card || {}; const t = c.type || 'text';
  let body: React.ReactNode;
  if (!r.ok || t === 'error') body = <p className="mp-err">{c.message || r.summary || 'Источник не ответил.'}</p>;
  else if (t === 'weather') body = <div className="mp-weather">
    <div className="mp-w-now"><span className="mp-w-ic">{WMO(c.now?.code ?? 1, c.now?.isDay !== false)}</span><b>{r0(c.now?.tempC)}°</b><span><strong>{c.now?.label}</strong><small>ощущается {r0(c.now?.feelsC)}° · ветер {r0(c.now?.windKmh)} км/ч · влажность {r0(c.now?.humidity)}%</small></span></div>
    {Array.isArray(c.days) && <div className="mp-w-days">{c.days.slice(0, 5).map((d: any, i: number) => <span key={i}><small>{day(d.date)}</small><em>{WMO(d.code ?? 1)}</em><b>{r0(d.maxC)}°</b><small>{r0(d.minC)}°</small></span>)}</div>}
  </div>;
  else if (t === 'gauge') body = <div className="mp-gauge"><div className="mp-g-bar"><span style={{left: Math.max(0, Math.min(100, +c.value || 0)) + '%'}}/></div><b>{c.value}</b><span>{c.label}</span></div>;
  else {
    const items = c.items || c.rows || c.places || c.results || [];
    body = <>{c.headline && <p className="mp-head">{c.headline}</p>}{c.lead && <p className="mp-lead">{String(c.lead).slice(0, 280)}</p>}
      {Array.isArray(c.stats) && <div className="mp-stats">{c.stats.slice(0, 6).map((s: any, i: number) => <span key={i}><small>{s.label}</small><b>{String(s.value)}</b></span>)}</div>}
      {Array.isArray(items) && items.length > 0 ? <Rows items={items}/> : !c.headline && <p className="mp-lead">{r.summary}</p>}</>;
  }
  return <article className={'mp-card t-' + t + (r.ok ? '' : ' bad')} data-testid="mp-card">
    <header><small>{c.kicker || r.serviceId}</small><h3>{c.title || r.title}</h3></header>
    {body}
    <footer>{r.sources.filter(s => s.ok).slice(0, 3).map(s => s.url ? <a key={s.name} href={s.url} target="_blank" rel="noreferrer">{s.name}</a> : <span key={s.name}>{s.name}</span>)}
      {r.fetchedAt && <span>{new Date(r.fetchedAt).toLocaleTimeString('ru', {hour: '2-digit', minute: '2-digit'})}</span>}</footer>
  </article>;
}

export function MoneyPlace() {
  const [meta, setMeta] = useState<{packages: Pkg[]; you: {cc: string | null; city: string | null}} | null>(null);
  const [pk, setPk] = useState(''); const [q, setQ] = useState(''); const [busy, setBusy] = useState(''); const [feed, setFeedS] = useState<Entry[]>(load); const [hint, setHint] = useState('');
  const setFeed = (v: Entry[]) => { setFeedS(v); save(v); };
  useEffect(() => { fetch('/api/money?meta=1').then(r => r.json()).then(setMeta).catch(() => setHint('Сервисы работают на сайте Vercel.')); }, []);
  const ask = async (url: string, label: string) => {
    setBusy(label); setHint('');
    try { const j = await (await fetch(url)).json();
      if (j.kind === 'result') setFeed([{id: Date.now().toString(36), at: Date.now(), ask: label, items: j.items || []}, ...feed]);
      else if (j.kind === 'menu') { setPk(j.package); setHint(j.question || ''); }
      else setHint(j.question || j.error || 'Не понял запрос.');
    } catch { setHint('Сервис не ответил. Попробуйте ещё раз.'); }
    setBusy('');
  };
  const cur = meta?.packages.find(p => p.id === pk);
  const strip = useRef<HTMLDivElement>(null);
  const slide = (d: number) => strip.current?.scrollBy({left: d * Math.max(320, strip.current.clientWidth * 0.8), behavior: 'smooth'});
  useEffect(() => { strip.current?.scrollTo({left: 0, behavior: 'smooth'}); }, [feed.length]);
  // No scrollbars: edges fade out where there is more to see (like iOS), arrows appear only where you can go.
  const [edge, setEdge] = useState({l: false, r: false});
  useEffect(() => {
    const el = strip.current; if (!el) return;
    const mark = (n: HTMLElement) => { n.classList.toggle('fade-t', n.scrollTop > 4); n.classList.toggle('fade-b', n.scrollTop + n.clientHeight < n.scrollHeight - 4); };
    const upd = () => { setEdge({l: el.scrollLeft > 4, r: el.scrollLeft + el.clientWidth < el.scrollWidth - 4}); el.querySelectorAll<HTMLElement>('.mp-card').forEach(mark); };
    const onCard = (e: Event) => { const t = e.target as HTMLElement; if (t.classList?.contains('mp-card')) mark(t); };
    upd(); const t = setTimeout(upd, 400); el.addEventListener('scroll', upd, {passive: true}); el.addEventListener('scroll', onCard, {capture: true, passive: true}); window.addEventListener('resize', upd);
    return () => { clearTimeout(t); el.removeEventListener('scroll', upd); el.removeEventListener('scroll', onCard, {capture: true} as any); window.removeEventListener('resize', upd); };
  }, [feed]);
  const cards = feed.flatMap(e => e.items.map((r, i) => ({r, key: e.id + i, ask: e.ask, at: e.at, first: i === 0})));
  return <div className="mp" data-testid="mp">
    <div className="bz-step"><span>1</span>Что вам нужно <small>{meta?.you.city ? `город по IP: ${meta.you.city}` : 'пакеты сервисов'}</small></div>
    <div className="mp-pkgs">{(meta?.packages || []).map(p => <button key={p.id} type="button" aria-pressed={pk === p.id} style={{'--pc': PK_COLOR[p.id] || '#2f8fd8'} as React.CSSProperties} className="bz-prov mp-pkg" onClick={() => setPk(pk === p.id ? '' : p.id)} data-testid={'mp-pkg-' + p.id}>
      <span className="bz-prov-glow"/><b>{p.icon} {p.ru}</b><small>{p.options.slice(0, 3).map(o => o.label).join(' · ')}</small></button>)}</div>
    {cur && <div className="mp-opts">
      <button type="button" className="mp-chip all" disabled={!!busy} onClick={() => void ask(`/api/money?package=${cur.id}`, cur.icon + ' ' + cur.ru + ' · всё сразу')} data-testid="mp-pkg-run">{busy.endsWith('всё сразу') ? 'Собираю…' : `${cur.icon} Всё сразу`}</button>
      {cur.options.map(o => <button key={o.serviceId} type="button" className="mp-chip" disabled={!!busy || o.needsInput} title={o.needsInput ? 'Нужны ваши данные — спросите словами ниже' : o.desc}
        onClick={() => void ask(`/api/money?service=${o.serviceId}`, o.label)}><b>{o.label}</b><small>{o.needsInput ? 'спросите словами' : o.desc}</small></button>)}
    </div>}
    <div className="bz-step"><span>2</span>Или спросите словами</div>
    <div className="bz-search"><input value={q} onChange={e => setQ(e.target.value)} onKeyDown={e => e.key === 'Enter' && q.trim() && void ask(`/api/money?q=${encodeURIComponent(q.trim())}`, q.trim())} placeholder="погода в Батуми, курс доллара, рейсы Тбилиси — Стамбул 15 ноября…" data-testid="mp-q"/>
      <button type="button" className="bz-btn acc" disabled={!!busy || !q.trim()} onClick={() => void ask(`/api/money?q=${encodeURIComponent(q.trim())}`, q.trim())} data-testid="mp-go">{busy && busy === q.trim() ? 'Ищу…' : 'Спросить'}</button></div>
    <div className="mp-ex">{EXAMPLES.map(x => <button key={x} type="button" onClick={() => { setQ(x); void ask(`/api/money?q=${encodeURIComponent(x)}`, x); }}>{x}</button>)}</div>
    {hint && <p className="bz-note">{hint}</p>}
    {busy && <p className="bz-note">⏳ {busy}…</p>}
    {feed.length > 0 && <div className="bz-step"><span>✦</span>Лента <small>новые сверху · хранится в этом браузере</small><button type="button" className="bz-link" onClick={() => setFeed([])}>очистить</button></div>}
    {cards.length > 0 && <div className={'mp-stripwrap' + (edge.l ? ' can-l' : '') + (edge.r ? ' can-r' : '')}>
      <button type="button" className="mp-arr l" onClick={() => slide(-1)} aria-label="Новее">‹</button>
      <div className="mp-strip" ref={strip} data-testid="mp-strip">{cards.map(c => <div key={c.key} className={'mp-col' + (c.first ? ' first' : '')}>
        <span className="mp-col-tag">{c.first ? c.ask + ' · ' : ''}{new Date(c.at).toLocaleTimeString('ru', {hour: '2-digit', minute: '2-digit'})}</span><MoneyCard r={c.r}/></div>)}</div>
      <button type="button" className="mp-arr r" onClick={() => slide(1)} aria-label="Старее">›</button>
    </div>}
  </div>;
}
