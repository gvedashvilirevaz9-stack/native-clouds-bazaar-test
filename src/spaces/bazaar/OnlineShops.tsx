// "Магазины онлайн": search real Shopify stores from the Bazaar page. No tokens: the site's own
// /api/shop-search asks the store's public search. Works on the deployed site (Vercel), not offline.
import {useEffect, useState} from 'react';
import {Eye as LEye, EyeOff as LEyeOff} from 'lucide-react';
import type React from 'react';
import {bazaar} from './store';
import {ProductView, sized, osmTile, type Product} from './ProductView';
import {MoneyPlace} from './MoneyPlace';

type Engine = 'shopify' | 'woo';
type Source = 'all' | Engine | 'market' | 'money';
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
// The most-bought things: right inside the search line.
const PRESETS: {ru: string; cat?: string}[] = [{ru: 'кроссовки', cat: 'Одежда и обувь'}, {ru: 'наушники', cat: 'Электроника и техника'}, {ru: 'iphone', cat: 'Электроника и техника'}, {ru: 'платье', cat: 'Одежда и обувь'},
  {ru: 'худи', cat: 'Одежда и обувь'}, {ru: 'диван', cat: 'Мебель'}, {ru: 'игрушки', cat: 'Игрушки и коллекции'}, {ru: 'кофе', cat: 'Еда и напитки'}, {ru: 'подарок'}];
const LOCAL_PRESETS: {ru: string; cat?: string}[] = [{ru: 'пицца'}, {ru: 'суши'}, {ru: 'аптека'}, {ru: 'супермаркет'}, {ru: 'кофе'}, {ru: 'хачапури'}, {ru: 'iPhone 15'}, {ru: 'игрушки'}, {ru: 'цветы'}];
// Packages, like "Утро" in Agent Marketplace: the 12 categories folded into 8 groups people think in.
const GROUPS: {id: string; ru: string; icon: string; color: string; cat: string; all: string; items: {ru: string; sub?: string; cat?: string}[]}[] = [
  {id: 'women', ru: 'Женщинам', icon: '👗', color: '#e0508f', cat: 'Одежда и обувь', all: 'женская одежда', items: [{ru: 'платье'}, {ru: 'женская обувь'}, {ru: 'сумка', cat: 'Украшения и аксессуары'}, {ru: 'украшения', cat: 'Украшения и аксессуары'}, {ru: 'свитер'}, {ru: 'помада', cat: 'Красота и здоровье'}]},
  {id: 'men', ru: 'Мужчинам', icon: '👔', color: '#2f6fd8', cat: 'Одежда и обувь', all: 'мужская одежда', items: [{ru: 'мужские кроссовки'}, {ru: 'худи'}, {ru: 'мужские штаны'}, {ru: 'куртка'}, {ru: 'часы', cat: 'Украшения и аксессуары'}, {ru: 'носки'}]},
  {id: 'kids', ru: 'Детям', icon: '🧸', color: '#f2a93b', cat: 'Игрушки и коллекции', all: 'игрушки', items: [{ru: 'игрушки'}, {ru: 'машинки'}, {ru: 'конструктор'}, {ru: 'детская одежда', cat: 'Одежда и обувь'}, {ru: 'настольные игры'}]},
  {id: 'home', ru: 'Дом', icon: '🏡', color: '#2f9e63', cat: 'Дом и сад', all: 'для дома', items: [{ru: 'диван', cat: 'Мебель'}, {ru: 'стол', cat: 'Мебель'}, {ru: 'кастрюля'}, {ru: 'сковорода'}, {ru: 'простыни'}, {ru: 'подушка'}, {ru: 'для питомцев', sub: 'корм, лежанки', cat: 'Питомцы'}]},
  {id: 'beauty', ru: 'Красота', icon: '💄', color: '#c4508f', cat: 'Красота и здоровье', all: 'косметика', items: [{ru: 'помада'}, {ru: 'тени'}, {ru: 'крем'}, {ru: 'парфюм'}, {ru: 'уход за кожей'}]},
  {id: 'tech', ru: 'Техника', icon: '🔌', color: '#5a6b7c', cat: 'Электроника и техника', all: 'электроника', items: [{ru: 'наушники'}, {ru: 'колонка'}, {ru: 'зарядка'}, {ru: 'чехол для телефона'}, {ru: 'iphone'}, {ru: 'цифровые товары', cat: 'Цифровые товары'}]},
  {id: 'sport', ru: 'Спорт и отдых', icon: '🏃', color: '#14a3a8', cat: 'Спорт и отдых', all: 'спорт', items: [{ru: 'кроссовки для бега'}, {ru: 'спортивная одежда'}, {ru: 'велосипед'}, {ru: 'туризм'}, {ru: 'гитара', cat: 'Музыка и хобби'}]},
  {id: 'food', ru: 'Еда', icon: '🍯', color: '#d98a2f', cat: 'Еда и напитки', all: 'еда', items: [{ru: 'кофе'}, {ru: 'чай'}, {ru: 'шоколад'}, {ru: 'мёд'}, {ru: 'соусы'}]},
];
// Score helpers: best title matches first.
const stem = (w: string) => w.replace(/(es|s)$/, '');
// Score = how many query words are in the title. Matches go first; a store whose results match nothing is hidden (lipstick for "men").
const score = (title: string, q: string) => { const t = title.toLowerCase(); return q.split(/\s+/).filter(w => w.length > 1).reduce((a, w) => a + (t.includes(stem(w)) ? 1 : 0), 0); };
const RU2: Record<string, string> = {одежда: 'clothing', женская: 'women', мужская: 'men', детская: 'kids', конструктор: 'building blocks', настольные: 'board', игры: 'games', для: '', дома: 'home', крем: 'cream', парфюм: 'perfume', уход: '', за: '', кожей: 'skincare',
  колонка: 'speaker', зарядка: 'charger', чехол: 'case', телефона: 'phone', бега: 'running', спортивная: 'sport', велосипед: 'bike', туризм: 'camping', гитара: 'guitar', шоколад: 'chocolate', мёд: 'honey', мед: 'honey', соусы: 'sauce', питомцев: 'pet',
  наушники: 'headphones', подарок: 'gift', косметика: 'makeup', электроника: 'electronics', спорт: 'sport', еда: 'food', цифровые: 'digital', товары: '', украшения: 'jewelry', сумка: 'bag', штаны: 'pants', куртка: 'jacket', кроссовки: 'sneakers'};
const toEn = (q: string) => q.toLowerCase().split(/\s+/).map(w => w in RU2 ? RU2[w] : RU[w] || w).filter(Boolean).join(' ').trim();

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
// Map pin (teardrop) and globe, drawn inline so they match the glass style.
export const Pin = ({size = 18}: {size?: number}) => <svg className="bz-pin" viewBox="0 0 24 24" width={size} height={size} aria-hidden="true"><path d="M12 22.5s-7.5-7.6-7.5-13A7.5 7.5 0 0 1 19.5 9.5c0 5.4-7.5 13-7.5 13z" fill="currentColor"/><circle cx="12" cy="9.6" r="2.8" fill="#fff"/></svg>;
export const Spark = ({size = 18}: {size?: number}) => <svg className="bz-pin" viewBox="0 0 24 24" width={size} height={size} aria-hidden="true"><path d="M12 2l2.2 6.3L20.5 10l-6.3 2.2L12 18.5l-2.2-6.3L3.5 10l6.3-1.7z" fill="currentColor"/><circle cx="19" cy="18" r="2.2" fill="currentColor"/></svg>;
/** Eye toggle: a clean line icon (Lucide) inside a crystal glass tile. */
export const Eye = ({open}: {open: boolean}) => open ? <LEye size={22} strokeWidth={1.7} aria-hidden="true"/> : <LEyeOff size={22} strokeWidth={1.7} aria-hidden="true"/>;
export const Globe = ({size = 18}: {size?: number}) => <svg className="bz-pin" viewBox="0 0 24 24" width={size} height={size} aria-hidden="true" fill="none" stroke="currentColor" strokeWidth="1.8"><circle cx="12" cy="12" r="9"/><path d="M3 12h18M12 3c2.6 2.6 3.8 5.6 3.8 9s-1.2 6.4-3.8 9c-2.6-2.6-3.8-5.6-3.8-9S9.4 5.6 12 3z"/></svg>;
const PROVIDERS: {id: string; name: string; sub: string; color: string; on: boolean}[] = [
  {id: 'all', name: 'Везде', sub: 'Shopify + WooCommerce сразу', color: '#2f8fd8', on: true},
  {id: 'shopify', name: 'Shopify', sub: 'все магазины на Shopify', color: '#5fae3e', on: true},
  {id: 'woo', name: 'WooCommerce', sub: '82 проверенных магазина', color: '#9a63d6', on: true},
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
  const [folded, setFolded] = useState(false);
  // Any click below the panel (a package, a service, a card, a button) folds the panel up; typing in fields does not.
  const foldOnUse = (e: React.MouseEvent) => { const t = e.target as HTMLElement; if (t.closest('input,textarea,select,label')) return; if (t.closest('button,a,[role=button],.bz-card,.mp-card')) setFolded(true); };
  const [meta, setMeta] = useState<MarketMeta | null>(null); const [cc, setCc] = useState(''); const [city, setCity] = useState(''); const [scope, setScope] = useState('local');
  const [dirs, setDirs] = useState<{cc: string | null; name: string; url: string}[]>([]); const [srcInfo, setSrcInfo] = useState('');
  useEffect(() => { if (src !== 'market' || meta) return; fetch('/api/marketplace?meta=1').then(r => r.json()).then((m: MarketMeta) => { setMeta(m); if (!cc) setCc(m.you.supported && m.you.cc ? m.you.cc : 'GE'); }).catch(() => setNotes(['Marketplace работает на сайте Vercel (нужен сервер /api).'])); }, [src]);
  const country = meta?.countries.find(c => c.cc === cc);
  const pick = (id: Source) => { setSrc(id); setFav(null); setBlocks([]); setDone(false); setNotes([]); setDirs([]); setSrcInfo(''); };
  useEffect(() => { if (meta) return; fetch('/api/marketplace?meta=1').then(r => r.json()).then((m: MarketMeta) => { setMeta(m); setCc(c => c || (m.you.supported && m.you.cc ? m.you.cc : 'GE')); }).catch(() => undefined); }, []);
  const catEn = CATS.find(c => c.ru === cat)?.en || '';
  const [grp, setGrp] = useState(''); const curGrp = GROUPS.find(g => g.id === grp); const [goN, setGoN] = useState(0);
  // A preset or a sub-category fills the search line and searches right away (same as Agent Marketplace).
  const go = (text: string, c = '') => { setQ(text); setCat(c); setGoN(n => n + 1); };
  useEffect(() => { if (goN) void run(); }, [goN]);
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
        items: (s.items || []).map((i: any) => ({title: i.title, price: i.price != null ? String(i.price) : '', currency: i.currency || '', image: i.image, images: i.image ? [i.image] : [], url: i.url || '', description: i.subtitle || '', seller: i.provider, store: 'market', vendor: null, available: null, kind: i.kind, priceLabel: i.priceLabel, rating: i.rating, lat: i.lat, lon: i.lon}))})));
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
  const glyph = (t: string) => (t.match(/\p{Extended_Pictographic}/u) || ['🛍'])[0];
  const empty = done && !notes.length && blocks.every(b => !b.items.length);

  return <div className="bz-sec bz-online" data-testid="bz-online">
    <div className={'bz-mkwrap' + (folded ? ' folded' : '')}>
    <button type="button" className={'bz-eye' + (folded ? ' shut' : '')} onClick={() => setFolded(!folded)} title={folded ? 'Показать панель' : 'Спрятать панель'} aria-pressed={!folded} data-testid="bz-eye"><Eye open={!folded}/></button>
    <div className="bz-markets">
      <section className={'bz-mk' + (src !== 'market' && src !== 'money' ? ' on' : '')}><h4 role="button" onClick={() => { if (src === 'market' || src === 'money') pick('all'); else setFolded(!folded); }}><Globe/> Global Marketplace <small>весь интернет</small></h4>
        <div className="bz-providers" role="tablist" aria-label="Global Marketplace">{PROVIDERS.map(p => <button key={p.id} type="button" role="tab" disabled={!p.on} data-testid={'bz-prov-' + p.id}
          aria-pressed={p.id === src} style={{'--pc': p.color} as React.CSSProperties} className={'bz-prov' + (p.on ? '' : ' off')}
          onClick={() => { if (p.id === 'files') { onFiles?.(); return; } pick(p.id as Source); }}>
          <span className="bz-prov-glow"/><b>{p.name}</b><small>{p.sub}</small>{!p.on && <i>скоро</i>}</button>)}</div></section>
      <section className={'bz-mk local' + (src === 'market' ? ' on' : '')}><h4 role="button" onClick={() => { if (src !== 'market') pick('market'); else setFolded(!folded); }}><Pin/> Local Marketplace <small>в вашей стране</small></h4>
        <button type="button" role="tab" data-testid="bz-prov-market" aria-pressed={src === 'market'} style={{'--pc': '#e0503a'} as React.CSSProperties} className="bz-prov bz-prov-local" onClick={() => pick('market')}>
          <span className="bz-prov-glow"/><span className="bz-prov-pin"><Pin size={34}/></span><b>{meta && cc ? `${FLAG[cc] || ''} ${meta.countries.find(c => c.cc === cc)?.name || ''}` : 'Рядом'}</b><small>магазины, еда, места и услуги по стране и городу</small></button></section>
      <section className={'bz-mk agent' + (src === 'money' ? ' on' : '')}><h4 role="button" onClick={() => { if (src !== 'money') pick('money'); else setFolded(!folded); }}><Spark/> Agent Marketplace <small>информация и сервисы</small></h4>
        <button type="button" role="tab" data-testid="bz-prov-money" aria-pressed={src === 'money'} style={{'--pc': '#7a5af5'} as React.CSSProperties} className="bz-prov bz-prov-local" onClick={() => pick('money')}>
          <span className="bz-prov-glow"/><span className="bz-prov-pin agent"><Spark size={34}/></span><b>Погода, деньги, новости</b><small>курсы, крипта, поездки, вечер — карточками; агент тоже спрашивает (MCP)</small></button></section>
    </div></div>
    <div className="bz-below" onClickCapture={foldOnUse}>
    {src === 'money' ? <MoneyPlace/> : <>

    <div className="mp-top">
      <div className="bz-step mp-label"><span>✦</span>Что ищем</div>
      <div className="mp-bar" data-testid="bz-bar" onClick={e => { if (e.target === e.currentTarget) (e.currentTarget.querySelector('input') as HTMLInputElement)?.focus(); }}>
        <input value={q} onChange={e => setQ(e.target.value)} onKeyDown={e => e.key === 'Enter' && void run()} placeholder={cat ? cat + '…' : 'найти…'} style={{width: `min(70%, ${Math.max(140, q.length * 8.6 + 40)}px)`}} data-testid="bz-online-q"/>
        <div className="mp-presets">{(src === 'market' ? LOCAL_PRESETS : PRESETS).map(x => <button key={x.ru} type="button" disabled={busy} onClick={() => go(x.ru, x.cat)}>{x.ru}</button>)}</div>
        <button type="button" className="mp-ask" disabled={busy || (!q.trim() && !cat)} onClick={() => void run()} data-testid="bz-online-go" aria-label="Найти">{busy ? '…' : '→'}</button>
      </div>
    </div>
    <div className="mp-pkgs bz-groups">{GROUPS.map(g => <button key={g.id} type="button" aria-pressed={grp === g.id} style={{'--pc': g.color} as React.CSSProperties} className="bz-prov mp-pkg" onClick={() => setGrp(grp === g.id ? '' : g.id)} data-testid={'bz-grp-' + g.id}>
      <span className="bz-prov-glow"/><b>{g.icon} {g.ru}</b><small>{g.items.slice(0, 3).map(i => i.ru).join(' · ')}</small></button>)}</div>
    {curGrp && <div className="mp-opts">
      <button type="button" className="mp-chip all" disabled={busy} onClick={() => go(curGrp.all, curGrp.cat)}>{curGrp.icon} Всё в «{curGrp.ru}»</button>
      {curGrp.items.map(i => <button key={i.ru} type="button" className="mp-chip" disabled={busy} onClick={() => go(i.ru, i.cat || curGrp.cat)}><b>{i.ru}</b>{i.sub && <small>{i.sub}</small>}</button>)}
    </div>}
    {src === 'market' && <><div className="bz-step"><span>📍</span>Где <small>{meta?.you.cc ? (meta.you.supported ? `по IP вы в стране: ${meta.you.name}` : `по IP: ${meta.you.name || meta.you.cc} — этой страны пока нет, выберите вручную`) : 'выберите страну'}</small></div>
      <div className="bz-where" data-testid="bz-market-where">
        <div className="bz-countries">{(meta?.countries || []).map(c => <button key={c.cc} type="button" aria-pressed={c.cc === cc} onClick={() => { setCc(c.cc); setCity(''); }} data-testid={'bz-cc-' + c.cc}><b>{FLAG[c.cc] || '🌍'}</b>{c.name}</button>)}</div>
        <label>Город<select value={city} onChange={e => setCity(e.target.value)} data-testid="bz-market-city"><option value="">{country ? `${country.cities.find(x => x.en === country.capital)?.ru || country.capital} (по умолчанию)` : '—'}</option>{country?.cities.map(x => <option key={x.en} value={x.en}>{x.ru}</option>)}</select></label>
        <label>Охват<select value={scope} onChange={e => setScope(e.target.value)} data-testid="bz-market-scope">{SCOPES.map(x => <option key={x.id} value={x.id}>{x.ru}</option>)}</select></label>
      </div></>}

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
        <span className={'bz-card-img' + (i.image ? '' : ' art t' + (k % 5))}>{i.image ? <img src={sized(i.image, 400)} alt="" loading="lazy" decoding="async"/> : Number.isFinite(i.lat) ? <span className="bz-cardmap"><img src={osmTile(i.lat!, i.lon!)} alt="" loading="lazy"/><Pin size={34}/></span> : (i as any).kind === 'store' ? <span className="bz-glyph pin"><Pin size={46}/></span> : <span className="bz-glyph">{glyph(b.title)}</span>}{(i.images?.length || 0) > 1 && <em className="bz-card-n">{i.images!.length} фото</em>}</span>
        <b>{i.title}</b><span className="bz-card-p">{price(i)}{i.compareAt && <s> {price({...i, price: i.compareAt})}</s>}{i.available === false ? ' · нет в наличии' : ''}</span>{i.seller && <small className="bz-card-s">{i.seller}</small>}<small>Смотреть ⤢</small>
      </button>)}</div>
    </div>)}
    {dirs.length > 0 && <div className="bz-dirs" data-testid="bz-market-dirs"><b>Искать там же на площадках:</b>{dirs.map(d => <a key={d.url} className="bz-btn" href={d.url} target="_blank" rel="noreferrer">{FLAG[d.cc || ''] || '🌍'} {d.name} ↗</a>)}</div>}
    </>}
    </div>
    {view && (() => { const list = blocks.filter(b => b.items.length)[view.b]?.items || []; const it = list[view.k]; if (!it) return null;
      return <ProductView p={it} idx={view.k} total={list.length} onClose={() => setView(null)} onPrev={view.k > 0 ? () => setView({...view, k: view.k - 1}) : undefined} onNext={view.k < list.length - 1 ? () => setView({...view, k: view.k + 1}) : undefined}
        onSave={x => bazaar.saveFavorite({title: x.title, price: x.price, image: x.image, url: x.url, text: x.description?.slice(0, 300), pay: {kind: 'link', url: x.url}})}/>; })()}
  </div>;
}
