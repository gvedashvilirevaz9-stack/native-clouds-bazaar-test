// "Магазины онлайн": search real Shopify stores from the Bazaar page. No tokens: the site's own
// /api/shop-search asks the store's public search. Works on the deployed site (Vercel), not offline.
import {useEffect, useState} from 'react';
import type React from 'react';
import {bazaar} from './store';
import {ProductView, sized, type Product} from './ProductView';

type Engine = 'shopify' | 'woo';
type Source = 'all' | Engine | 'market';
// The owner's Marketplace (archive): search by country / city / scope through /api/marketplace.
type Country = {cc: string; name: string; capital: string; currency: string; market: string; cities: {en: string; ru: string}[]};
type MarketMeta = {countries: Country[]; you: {cc: string | null; supported: boolean; city: string | null; name: string | null}};
const SCOPES = [{id: 'local', ru: 'Только страна'}, {id: 'local+world', ru: 'Страна + соседи + мир'}, {id: 'world', ru: 'Весь мир'}];
const FLAG: Record<string, string> = {GE: '🇬🇪', AM: '🇦🇲', AZ: '🇦🇿', KZ: '🇰🇿', CN: '🇨🇳', TR: '🇹🇷'};
type Store = {domain: string; name: string; icon: string; ru: string; hint: string; engine?: Engine};
const DEFAULT_STORES: Store[] = [
  {domain: 'floydhome.com', name: 'Floyd', icon: '🛋', ru: 'мебель', hint: 'sofa'},
  {domain: 'fromourplace.com', name: 'Our Place', icon: '🍳', ru: 'посуда', hint: 'pan'},
  {domain: 'allbirds.com', name: 'Allbirds', icon: '👟', ru: 'обувь', hint: 'shoes'},
  {domain: 'gymshark.com', name: 'Gymshark', icon: '🏋', ru: 'спорт', hint: 'hoodie'},
  {domain: 'brooklinen.com', name: 'Brooklinen', icon: '🛏', ru: 'постельное', hint: 'sheets'},
  {domain: 'colourpop.com', name: 'ColourPop', icon: '💄', ru: 'косметика', hint: 'lipstick'},
];
// Stores search in English; a few everyday words are translated so "диван" just works.
const RU: Record<string, string> = {мужчина: 'men', мужчины: 'men', мужской: 'men', мужские: 'men', мужская: 'men', мен: 'men', женщина: 'women', женский: 'women', женские: 'women', женская: 'women', детский: 'kids', детские: 'kids', дети: 'kids', игрушки: 'toys', игрушка: 'toy', машинки: 'cars', машинка: 'car', свитер: 'sweater', свитера: 'sweater', платье: 'dress', сумка: 'bag', часы: 'watch', очки: 'glasses', кофе: 'coffee', чай: 'tea', диван: 'sofa', диваны: 'sofa', кровать: 'bed', стол: 'table', стул: 'chair', кресло: 'chair', кастрюля: 'pot', кастрюли: 'pot', сковорода: 'pan', сковородка: 'pan', нож: 'knife', посуда: 'cookware',
  кроссовки: 'sneakers', обувь: 'shoes', ботинки: 'boots', носки: 'socks', худи: 'hoodie', футболка: 'shirt', штаны: 'pants', шорты: 'shorts', куртка: 'jacket', простыни: 'sheets', подушка: 'pillow', одеяло: 'comforter', полотенце: 'towel', помада: 'lipstick', тени: 'eyeshadow'};
// Score helpers: best title matches first.
const stem = (w: string) => w.replace(/(es|s)$/, '');
// Score = how many query words are in the title. Matches go first; a store whose results match nothing is hidden (lipstick for "men").
const score = (title: string, q: string) => { const t = title.toLowerCase(); return q.split(/\s+/).filter(w => w.length > 1).reduce((a, w) => a + (t.includes(stem(w)) ? 1 : 0), 0); };
const toEn = (q: string) => q.toLowerCase().split(/\s+/).map(w => RU[w] || w).join(' ').trim();

type Item = Product & {vendor: string | null; store: string; available: boolean | null};
const GLOBAL = 'global';
// One set of categories for every platform. Shopify gets an English hint word; WooCommerce filters its store list.
const CATS: {ru: string; icon: string; en: string}[] = [
  {ru: 'Одежда и обувь', icon: '👕', en: 'clothing'}, {ru: 'Украшения и аксессуары', icon: '💍', en: 'jewelry'}, {ru: 'Красота и здоровье', icon: '💄', en: 'beauty'}, {ru: 'Дом и сад', icon: '🏡', en: 'home'},
  {ru: 'Мебель', icon: '🛋', en: 'furniture'}, {ru: 'Игрушки и коллекции', icon: '🧸', en: 'toys'}, {ru: 'Еда и напитки', icon: '🍯', en: 'food'}, {ru: 'Питомцы', icon: '🐾', en: 'pet'},
  {ru: 'Электроника и техника', icon: '🔌', en: 'electronics'}, {ru: 'Спорт и отдых', icon: '🏃', en: 'sports'}, {ru: 'Музыка и хобби', icon: '🎸', en: 'music'}, {ru: 'Цифровые товары', icon: '💾', en: 'digital'},
];
const WOO_CATS = ['Одежда и обувь', 'Украшения и аксессуары', 'Красота и здоровье', 'Дом и сад', 'Мебель', 'Игрушки и коллекции', 'Еда и напитки', 'Питомцы', 'Электроника и техника', 'Спорт и отдых', 'Музыка и хобби', 'Цифровые товары'];
// The person's favourite stores (kept in this browser). Starts empty: search works over everything without them.
const KEY = 'bz.favs.v2';
const DEFAULT_WOO: Store[] = [{domain: 'porterandyork.com', name: 'Porter & York', icon: '🥩', ru: 'мясо', hint: 'steak', engine: 'woo'}];
const loadStores = (): Store[] => { try { const v = JSON.parse(localStorage.getItem(KEY) || 'null'); if (Array.isArray(v)) return v; } catch { /* storage off */ } return []; };
void DEFAULT_STORES; void DEFAULT_WOO; // examples kept for reference
const engineOf = (s: Store): Engine => s.engine || 'shopify';
const API: Record<Engine, string> = {shopify: '/api/shop-search', woo: '/api/woo-search'};

// Where the Bazaar can look for goods. "on" = works now without keys; the rest are shown honestly as not yet possible.
const PROVIDERS: {id: string; name: string; sub: string; color: string; on: boolean}[] = [
  {id: 'all', name: 'Везде', sub: 'Shopify + WooCommerce сразу', color: '#2f8fd8', on: true},
  {id: 'shopify', name: 'Shopify', sub: 'все магазины на Shopify', color: '#5fae3e', on: true},
  {id: 'woo', name: 'WooCommerce', sub: '82 проверенных магазина', color: '#9a63d6', on: true},
  {id: 'market', name: '📍 Marketplace', sub: 'по стране и городу: магазины, еда, места', color: '#e0503a', on: true},
  {id: 'files', name: 'Прайс-листы', sub: 'файлы Native Clouds', color: '#d98a2f', on: true},
  {id: 'amazon', name: 'Amazon', sub: 'только через платных посредников', color: '#999', on: false},
  {id: 'ebay', name: 'eBay', sub: 'нужен ключ разработчика', color: '#999', on: false},
  {id: 'etsy', name: 'Etsy', sub: 'нужен ключ разработчика', color: '#999', on: false},
];
const saveStores = (v: Store[]) => { try { localStorage.setItem(KEY, JSON.stringify(v)); } catch { /* storage off */ } };
const isDomain = (x: string) => /^[a-z0-9-]+(\.[a-z0-9-]+)+$/i.test(x.trim().replace(/^https?:\/\//, '').replace(/\/.*$/, ''));
const cleanDomain = (x: string) => x.trim().replace(/^https?:\/\//, '').replace(/\/.*$/, '').replace(/^www\./, '').toLowerCase();

function AddStore({stores, onAdd, engine, startOpen, onCancel}: {stores: Store[]; onAdd: (s: Store) => void; engine: Engine; startOpen?: boolean; onCancel?: () => void}) {
  const [open, setOpen] = useState(!!startOpen); const [name, setName] = useState(''); const [busy, setBusy] = useState(false);
  const [found, setFound] = useState<{name: string; domain: string}[]>([]); const [msg, setMsg] = useState('');
  const has = (d: string) => stores.some(s => s.domain === d);
  const works = async (d: string) => { try { const j = await (await fetch(`${API[engine]}?store=${encodeURIComponent(d)}&q=a`)).json(); return !j.error; } catch { return false; } };
  const add = async (n: string, d: string) => { setBusy(true); setMsg(''); const ok = await works(d); setBusy(false);
    if (!ok) { setMsg(engine === 'woo' ? `${d}: это не магазин на WooCommerce или его каталог закрыт.` : `У магазина ${d} закрыт свой поиск — искать по нему можно через «Весь Shopify».`); return; }
    onAdd({domain: d, name: n, icon: '🛒', ru: '', hint: '', engine}); setOpen(false); setName(''); setFound([]); };
  const find = async () => {
    const q = name.trim(); if (!q) return; setMsg(''); setFound([]);
    if (isDomain(q)) { await add(cleanDomain(q), cleanDomain(q)); return; }
    if (engine === 'woo') { setMsg('Для WooCommerce впишите адрес сайта магазина, например porterandyork.com'); return; }
    setBusy(true);
    try { const j = await (await fetch(`/api/global-search?source=shopify&q=${encodeURIComponent(q)}`)).json(); const map = new Map<string, string>();
      for (const i of j.items || []) if (i.storeDomain) map.set(cleanDomain(i.storeDomain), i.store || i.storeDomain);
      const all = [...map].map(([domain, n]) => ({name: n, domain}));
      const near = all.filter(x => (x.name + ' ' + x.domain).toLowerCase().includes(q.toLowerCase()));
      setFound(near.length ? near : all); if (!all.length) setMsg('Магазин не найден. Попробуйте адрес сайта, например mattel.com');
    } catch { setMsg('Поиск работает на сайте Vercel.'); }
    setBusy(false);
  };
  if (!open) return <button type="button" className="bz-addstore" onClick={() => setOpen(true)} data-testid="bz-addstore">＋ Магазин</button>;
  return <div className="bz-addpanel" data-testid="bz-addpanel">
    <div className="bz-search"><input autoFocus value={name} onChange={e => setName(e.target.value)} onKeyDown={e => e.key === 'Enter' && void find()} placeholder={engine === 'woo' ? 'Адрес магазина на WooCommerce: example.com' : 'Название или адрес магазина: Mattel, nike, shop.example.com'} data-testid="bz-addstore-q"/>
      <button type="button" className="bz-btn acc" disabled={busy || !name.trim()} onClick={() => void find()} data-testid="bz-addstore-go">{busy ? 'Ищу…' : 'Найти магазин'}</button>
      <button type="button" className="bz-btn" onClick={() => { setOpen(false); setFound([]); setMsg(''); onCancel?.(); }}>Отмена</button></div>
    {found.length > 0 && <div className="bz-found">{found.slice(0, 12).map(f => <div key={f.domain} className="bz-found-row"><b>{f.name}</b><small>{f.domain}</small>
      {has(f.domain) ? <span className="bz-note">уже на панели</span> : <button type="button" className="bz-btn" disabled={busy} onClick={() => void add(f.name, f.domain)}>＋ Добавить</button>}</div>)}</div>}
    {msg && <p className="bz-warnbox">{msg}</p>}
  </div>;
}

export function OnlineShops({onFiles}: {onFiles?: () => void}) {
  const [favs, setFavsState] = useState<Store[]>(loadStores); const setFavs = (v: Store[]) => { setFavsState(v); saveStores(v); };
  const [src, setSrc] = useState<Source>('all'); const [cat, setCat] = useState(''); const [fav, setFav] = useState<string | null>(null);
  const [q, setQ] = useState(''); const [busy, setBusy] = useState(false); const [notes, setNotes] = useState<string[]>([]); const [done, setDone] = useState(false);
  const [blocks, setBlocks] = useState<{key: string; title: string; sub?: string; items: Item[]}[]>([]);
  const [adding, setAdding] = useState<Engine | null>(null);
  const [view, setView] = useState<{b: number; k: number} | null>(null);
  const [meta, setMeta] = useState<MarketMeta | null>(null); const [cc, setCc] = useState(''); const [city, setCity] = useState(''); const [scope, setScope] = useState('local');
  const [dirs, setDirs] = useState<{cc: string | null; name: string; url: string}[]>([]); const [srcInfo, setSrcInfo] = useState('');
  useEffect(() => { if (src !== 'market' || meta) return; fetch('/api/marketplace?meta=1').then(r => r.json()).then((m: MarketMeta) => { setMeta(m); if (!cc) setCc(m.you.supported && m.you.cc ? m.you.cc : 'GE'); }).catch(() => setNotes(['Marketplace работает на сайте Vercel (нужен сервер /api).'])); }, [src]);
  const country = meta?.countries.find(c => c.cc === cc);
  const catEn = CATS.find(c => c.ru === cat)?.en || '';
  const shown = favs.filter(f => src === 'all' || engineOf(f) === src);

  const shopifyAll = async (query: string) => { const j = await (await fetch(`/api/global-search?source=shopify&q=${encodeURIComponent(query)}`)).json();
    if (j.error) throw new Error(j.error.startsWith('HTTP_429') ? 'Shopify просит подождать минуту (лимит бесплатного поиска).' : 'Shopify не ответил.');
    return {total: j.total as number | null, items: (j.items || []).filter((i: any) => i.price && Number(i.price) > 0).map((i: any) => ({...i, vendor: null, seller: i.store, store: 'shopify'})) as Item[]}; };
  const wooAll = async (query: string) => { const j = await (await fetch(`/api/woo-multi?q=${encodeURIComponent(query)}${cat ? '&cat=' + encodeURIComponent(cat) : ''}`)).json();
    if (j.error) throw new Error('Каталог WooCommerce не ответил.');
    return {searched: j.searched as number, items: (j.items || []).map((i: any) => ({...i, vendor: null, seller: i.store, store: 'woo'})) as Item[]}; };
  const oneStore = async (f: Store, query: string) => { const j = await (await fetch(`${API[engineOf(f)]}?store=${encodeURIComponent(f.domain)}&q=${encodeURIComponent(query)}`)).json();
    if (j.error) throw new Error(`${f.name}: магазин не открыл поиск.`);
    return (j.items || []).filter((i: any) => i.price && Number(i.price) > 0).map((i: any) => ({...i, store: f.domain, _s: score(i.title, query)})).sort((a: any, b: any) => b._s - a._s) as Item[]; };

  const market = async () => {
    const query = q.trim() || cat; if (!query) return;
    setBusy(true); setNotes([]); setBlocks([]); setDone(false); setDirs([]); setSrcInfo('');
    try {
      const j = await (await fetch(`/api/marketplace?q=${encodeURIComponent(query)}&country=${cc}&scope=${encodeURIComponent(scope)}${city ? '&city=' + encodeURIComponent(city) : ''}&lang=ru`)).json();
      if (j.error) throw new Error('Marketplace не ответил.');
      setBlocks((j.sections || []).map((s: any) => ({key: 'm-' + s.id, title: s.title, sub: [s.provider, s.slot === 'local' ? 'рядом' : s.slot === 'corridor' ? 'соседняя страна' : 'мир', !s.ok && s.status].filter(Boolean).join(' · '),
        items: (s.items || []).map((i: any) => ({title: i.title, price: i.price != null ? String(i.price) : '', currency: i.currency || '', image: i.image, images: i.image ? [i.image] : [], url: i.url || '', description: i.subtitle || '', seller: i.provider, store: 'market', vendor: null, available: null, kind: i.kind, priceLabel: i.priceLabel, rating: i.rating}))})));
      setDirs((j.directories || []).filter((d: any) => d.url));
      const ok = (j.sources || []).filter((x: any) => x.ok).length; setSrcInfo(`${j.location?.label || ''}${j.location?.city ? ', ' + j.location.city : ''} · ${j.breadcrumb || j.title} · источников ответило ${ok} из ${(j.sources || []).length}`);
      if (j.nav?.length) setNotes([`Уточните: ${j.nav.join(', ')}`]);
    } catch (e: any) { setNotes([e?.message === 'Failed to fetch' ? 'Marketplace работает на сайте Vercel.' : e?.message || 'Ошибка']); }
    setBusy(false); setDone(true);
  };
  const run = async () => {
    if (src === 'market') return market();
    const typed = toEn(q); if (!typed && !cat) return;
    setBusy(true); setNotes([]); setBlocks([]); setDone(false);
    const out: typeof blocks = []; const n: string[] = [];
    try {
      if (fav) { const f = favs.find(x => x.domain === fav)!; out.push({key: f.domain, title: `★ ${f.name}`, sub: f.domain, items: await oneStore(f, typed || catEn)}); }
      else {
        const jobs: Promise<void>[] = [];
        if (src !== 'woo') jobs.push(shopifyAll([typed, typed ? '' : catEn].filter(Boolean).join(' ') || catEn).then(r => { out.push({key: 'shopify', title: 'Shopify', sub: r.total ? `примерно ${r.total.toLocaleString()} совпадений` : undefined, items: r.items}); }).catch(e => { n.push(e.message); }));
        if (src !== 'shopify') jobs.push(wooAll(typed || catEn).then(r => { out.push({key: 'woo', title: 'WooCommerce', sub: `проверено ${r.searched} магазинов${cat ? ' · ' + cat : ''}`, items: r.items}); }).catch(e => { n.push(e.message); }));
        await Promise.all(jobs); out.sort((a, b) => (a.key === 'shopify' ? -1 : 1) - (b.key === 'shopify' ? -1 : 1));
      }
    } catch (e: any) { n.push(e?.message === 'Failed to fetch' ? 'Поиск работает на сайте Vercel (нужен сервер /api).' : e?.message || 'Ошибка'); }
    setBlocks(out); setNotes(n); setBusy(false); setDone(true);
  };
  const toBazaar = (b: typeof blocks[number]) => {
    if (!b.items.length) return;
    bazaar.addConnector({key: 'c-' + Date.now().toString(36), name: `${b.title}: ${q || cat}`, protocol: b.key === 'shopify' ? 'ucp' : 'api', endpoint: b.key === 'shopify' ? 'https://catalog.shopify.com/api/ucp/mcp' : undefined, note: 'Найдено в «Магазинах онлайн». Цены в валюте магазина; оплата на его странице.', logo: b.items[0].image,
      items: b.items.map((i, k) => ({id: 'p' + k, title: i.title, price: i.price, image: i.image, url: i.url, pay: {kind: 'link' as const, url: i.url}}))});
  };
  const price = (i: Item) => !i.price || !Number(i.price) ? ((i as any).priceLabel || ((i as any).kind === 'store' ? '📍 на карте' : 'цена у продавца')) : i.currency && i.currency !== 'USD' ? `${Number(i.price).toLocaleString()} ${i.currency}` : `$${Number(i.price).toFixed(2)}`;
  const empty = done && !notes.length && blocks.every(b => !b.items.length);

  return <div className="bz-sec bz-online" data-testid="bz-online">
    <div className="bz-providers" role="tablist" aria-label="Где искать">{PROVIDERS.map(p => <button key={p.id} type="button" role="tab" disabled={!p.on} data-testid={'bz-prov-' + p.id}
      aria-pressed={p.id === src} style={{'--pc': p.color} as React.CSSProperties} className={'bz-prov' + (p.on ? '' : ' off')}
      onClick={() => { if (p.id === 'files') { onFiles?.(); return; } setSrc(p.id as Source); setFav(null); setBlocks([]); setDone(false); setNotes([]); setDirs([]); setSrcInfo(''); }}>
      <span className="bz-prov-glow"/><b>{p.name}</b><small>{p.sub}</small>{!p.on && <i>скоро</i>}</button>)}</div>

    <div className="bz-step"><span>1</span>Категория</div>
    <div className="bz-cats" data-testid="bz-cats">
      <button type="button" aria-pressed={!cat} onClick={() => setCat('')}>Все</button>
      {CATS.map(c => <button key={c.ru} type="button" aria-pressed={cat === c.ru} onClick={() => setCat(cat === c.ru ? '' : c.ru)}><b>{c.icon}</b>{c.ru}</button>)}
    </div>

    {src === 'market' && <><div className="bz-step"><span>📍</span>Где <small>{meta?.you.cc ? (meta.you.supported ? `по IP вы в стране: ${meta.you.name}` : `по IP: ${meta.you.name || meta.you.cc} — этой страны пока нет, выберите вручную`) : 'выберите страну'}</small></div>
      <div className="bz-where" data-testid="bz-market-where">
        <div className="bz-countries">{(meta?.countries || []).map(c => <button key={c.cc} type="button" aria-pressed={c.cc === cc} onClick={() => { setCc(c.cc); setCity(''); }} data-testid={'bz-cc-' + c.cc}><b>{FLAG[c.cc] || '🌍'}</b>{c.name}</button>)}</div>
        <label>Город<select value={city} onChange={e => setCity(e.target.value)} data-testid="bz-market-city"><option value="">{country ? `${country.cities.find(x => x.en === country.capital)?.ru || country.capital} (по умолчанию)` : '—'}</option>{country?.cities.map(x => <option key={x.en} value={x.en}>{x.ru}</option>)}</select></label>
        <label>Охват<select value={scope} onChange={e => setScope(e.target.value)} data-testid="bz-market-scope">{SCOPES.map(x => <option key={x.id} value={x.id}>{x.ru}</option>)}</select></label>
      </div></>}

    <div className="bz-step"><span>2</span>Что ищем</div>
    <div className="bz-search">
      <input value={q} onChange={e => setQ(e.target.value)} onKeyDown={e => e.key === 'Enter' && void run()} placeholder={src === 'market' ? 'пицца, игрушки, iPhone 15, отель, такси, eSIM…' : cat ? `${cat}: уточните или просто нажмите «Найти»` : 'диван, кастрюля, кроссовки, toy cars…'} data-testid="bz-online-q"/>
      <button type="button" className="bz-btn acc" disabled={busy || (!q.trim() && !cat)} onClick={() => void run()} data-testid="bz-online-go">{busy ? 'Ищу…' : 'Найти'}</button>
    </div>

    {src !== 'market' && <>
    <div className="bz-step"><span>★</span>Мои магазины <small>{fav ? 'поиск только в выбранном — нажмите ещё раз, чтобы искать везде' : 'необязательно: добавьте любимые, чтобы искать только в них'}</small></div>
    <div className="bz-storechips bz-favs">
      {shown.map(s => <span key={s.domain} className="bz-chip"><button type="button" aria-pressed={fav === s.domain} onClick={() => setFav(fav === s.domain ? null : s.domain)}><b>{s.icon}</b>{s.name}<small>{engineOf(s) === 'woo' ? 'Woo' : 'Shopify'}</small></button>
        <button type="button" className="bz-chip-x" title="Убрать" aria-label={'Убрать ' + s.name} onClick={() => { setFavs(favs.filter(x => x.domain !== s.domain)); if (fav === s.domain) setFav(null); }}>×</button></span>)}
      {!adding && <>{src !== 'woo' && <button type="button" className="bz-addstore" onClick={() => setAdding('shopify')} data-testid="bz-addstore">＋ Магазин Shopify</button>}
        {src !== 'shopify' && <button type="button" className="bz-addstore" onClick={() => setAdding('woo')}>＋ Магазин WooCommerce</button>}</>}
      {adding && <AddStore key={adding} engine={adding} stores={favs} startOpen onCancel={() => setAdding(null)} onAdd={st => { setFavs([...favs, st]); setFav(st.domain); setAdding(null); }}/>}
    </div></>}
    {srcInfo && <p className="bz-note" data-testid="bz-market-info">📍 {srcInfo}</p>}

    {notes.map((t, i) => <p key={i} className="bz-warnbox">{t}</p>)}
    {empty && <p className="bz-note" data-testid="bz-online-none">Ничего не нашлось. Попробуйте по-английски, другое слово или другую категорию.</p>}
    {blocks.filter(b => b.items.length).map((b, bi) => <div key={b.key} className="bz-storeblock">
      <div className="bz-storehead"><b>{b.title}</b>{b.sub && <small>{b.sub}</small>}<button type="button" className="bz-btn" onClick={() => toBazaar(b)}>＋ Сохранить как лавку</button></div>
      <div className="bz-cards">{b.items.map((i, k) => <button type="button" key={k} className="bz-card" onClick={() => setView({b: bi, k})} data-testid="bz-online-card">
        <span className="bz-card-img">{i.image && <img src={sized(i.image, 400)} alt="" loading="lazy" decoding="async"/>}{(i.images?.length || 0) > 1 && <em className="bz-card-n">{i.images!.length} фото</em>}</span>
        <b>{i.title}</b><span className="bz-card-p">{price(i)}{i.compareAt && <s> {price({...i, price: i.compareAt})}</s>}{i.available === false ? ' · нет в наличии' : ''}</span>{i.seller && <small className="bz-card-s">{i.seller}</small>}<small>Смотреть ⤢</small>
      </button>)}</div>
    </div>)}
    {dirs.length > 0 && <div className="bz-dirs" data-testid="bz-market-dirs"><b>Искать там же на площадках:</b>{dirs.map(d => <a key={d.url} className="bz-btn" href={d.url} target="_blank" rel="noreferrer">{FLAG[d.cc || ''] || '🌍'} {d.name} ↗</a>)}</div>}
    {view && (() => { const list = blocks.filter(b => b.items.length)[view.b]?.items || []; const it = list[view.k]; if (!it) return null;
      return <ProductView p={it} idx={view.k} total={list.length} onClose={() => setView(null)} onPrev={view.k > 0 ? () => setView({...view, k: view.k - 1}) : undefined} onNext={view.k < list.length - 1 ? () => setView({...view, k: view.k + 1}) : undefined}
        onSave={x => bazaar.saveFavorite({title: x.title, price: x.price, image: x.image, url: x.url, text: x.description?.slice(0, 300), pay: {kind: 'link', url: x.url}})}/>; })()}
  </div>;
}
