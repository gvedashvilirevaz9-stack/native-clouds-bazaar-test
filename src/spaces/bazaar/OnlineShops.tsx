// "Магазины онлайн": search real Shopify stores from the Bazaar page. No tokens: the site's own
// /api/shop-search asks the store's public search. Works on the deployed site (Vercel), not offline.
import {useState} from 'react';
import type React from 'react';
import {bazaar} from './store';

type Engine = 'shopify' | 'woo';
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

type Item = {title: string; price: string | null; available: boolean | null; image: string | null; url: string; vendor: string | null; store: string; seller?: string | null; currency?: string | null};
const GLOBAL = 'global';
const WOO_CATS = ['Одежда и обувь', 'Украшения и аксессуары', 'Красота и здоровье', 'Дом и сад', 'Мебель', 'Игрушки и коллекции', 'Еда и напитки', 'Питомцы', 'Электроника и техника', 'Спорт и отдых', 'Музыка и хобби', 'Цифровые товары'];
// The person's own list of stores (kept in this browser). Starts with the six examples.
const KEY = 'bz.stores.v1';
const DEFAULT_WOO: Store[] = [{domain: 'porterandyork.com', name: 'Porter & York', icon: '🥩', ru: 'мясо', hint: 'steak', engine: 'woo'}];
const loadStores = (): Store[] => { try { const v = JSON.parse(localStorage.getItem(KEY) || 'null'); if (Array.isArray(v)) return v.some((x: Store) => x.engine === 'woo') ? v : [...v, ...DEFAULT_WOO]; } catch { /* storage off */ } return [...DEFAULT_STORES, ...DEFAULT_WOO]; };
const engineOf = (s: Store): Engine => s.engine || 'shopify';
const API: Record<Engine, string> = {shopify: '/api/shop-search', woo: '/api/woo-search'};

// Where the Bazaar can look for goods. "on" = works now without keys; the rest are shown honestly as not yet possible.
const PROVIDERS: {id: string; name: string; sub: string; color: string; on: boolean}[] = [
  {id: 'shopify', name: 'Shopify', sub: 'все магазины на Shopify', color: '#5fae3e', on: true},
  {id: 'woo', name: 'WooCommerce', sub: 'любой магазин по адресу', color: '#9a63d6', on: true},
  {id: 'files', name: 'Прайс-листы', sub: 'файлы Native Clouds', color: '#3f95dd', on: true},
  {id: 'amazon', name: 'Amazon', sub: 'только через платных посредников', color: '#999', on: false},
  {id: 'ebay', name: 'eBay', sub: 'нужен ключ разработчика', color: '#999', on: false},
  {id: 'etsy', name: 'Etsy', sub: 'нужен ключ разработчика', color: '#999', on: false},
];
const saveStores = (v: Store[]) => { try { localStorage.setItem(KEY, JSON.stringify(v)); } catch { /* storage off */ } };
const isDomain = (x: string) => /^[a-z0-9-]+(\.[a-z0-9-]+)+$/i.test(x.trim().replace(/^https?:\/\//, '').replace(/\/.*$/, ''));
const cleanDomain = (x: string) => x.trim().replace(/^https?:\/\//, '').replace(/\/.*$/, '').replace(/^www\./, '').toLowerCase();

function AddStore({stores, onAdd, engine}: {stores: Store[]; onAdd: (s: Store) => void; engine: Engine}) {
  const [open, setOpen] = useState(false); const [name, setName] = useState(''); const [busy, setBusy] = useState(false);
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
      <button type="button" className="bz-btn" onClick={() => { setOpen(false); setFound([]); setMsg(''); }}>Отмена</button></div>
    {found.length > 0 && <div className="bz-found">{found.slice(0, 12).map(f => <div key={f.domain} className="bz-found-row"><b>{f.name}</b><small>{f.domain}</small>
      {has(f.domain) ? <span className="bz-note">уже на панели</span> : <button type="button" className="bz-btn" disabled={busy} onClick={() => void add(f.name, f.domain)}>＋ Добавить</button>}</div>)}</div>}
    {msg && <p className="bz-warnbox">{msg}</p>}
  </div>;
}

export function OnlineShops({onFiles}: {onFiles?: () => void}) {
  const [ALL, setAll] = useState<Store[]>(loadStores); const setAllList = (v: Store[]) => { setAll(v); saveStores(v); };
  const [engine, setEngine] = useState<Engine>('shopify');
  const STORES = ALL.filter(x => engineOf(x) === engine);
  const setList = (v: Store[]) => setAllList([...ALL.filter(x => engineOf(x) !== engine), ...v]);
  const [pick, setPick] = useState<string>(GLOBAL); const [cat, setCat] = useState(''); const [total, setTotal] = useState<number | null>(null); const [own, setOwn] = useState(''); const [q, setQ] = useState('');
  const [busy, setBusy] = useState(false); const [items, setItems] = useState<Item[]>([]); const [notes, setNotes] = useState<string[]>([]); const [done, setDone] = useState(false);
  const run = async () => {
    const query = toEn(q); if (!query) return; setBusy(true); setNotes([]); setItems([]); setDone(false);
    setTotal(null);
    if (pick === GLOBAL && engine === 'woo' && !own.trim()) {
      try { const j = await (await fetch(`/api/woo-multi?q=${encodeURIComponent(query)}${cat ? '&cat=' + encodeURIComponent(cat) : ''}`)).json();
        if (j.error) setNotes(['Каталог WooCommerce не ответил: ' + j.error]);
        setItems((j.items || []).map((i: any) => ({...i, vendor: null, seller: i.store, store: GLOBAL}))); setTotal(null);
        if (!j.error && !(j.items || []).length) setNotes([`Проверил ${j.searched} магазинов — такого нет. Попробуйте по-английски или другую категорию.`]);
      } catch { setNotes(['Поиск работает на сайте Vercel (нужен сервер /api).']); }
      setBusy(false); setDone(true); return;
    }
    if (pick === GLOBAL && engine === 'shopify' && !own.trim()) {
      try { const j = await (await fetch(`/api/global-search?source=shopify&q=${encodeURIComponent(query)}`)).json();
        if (j.error) setNotes([j.error.startsWith('HTTP_429') ? 'Shopify просит подождать (лимит бесплатного поиска). Повторите через минуту.' : 'Общий каталог Shopify не ответил: ' + j.error]);
        setItems((j.items || []).filter((i: any) => i.price && Number(i.price) > 0).map((i: any) => ({...i, available: true, vendor: null, store: GLOBAL, seller: i.store}))); setTotal(j.total ?? null);
      } catch { setNotes(['Поиск работает на сайте Vercel (нужен сервер /api).']); }
      setBusy(false); setDone(true); return;
    }
    const list = own.trim() ? [own.trim()] : pick === 'all' ? STORES.map(s => s.domain) : [pick];
    const res = await Promise.all(list.map(async d => { try { const r = await fetch(`${API[engine]}?store=${encodeURIComponent(d)}&q=${encodeURIComponent(query)}`); const j = await r.json(); return j; } catch { return {store: d, error: 'OFFLINE', items: []}; } }));
    const out: Item[] = []; const n: string[] = [];
    for (const r of res) { if (r.error) n.push(r.error === 'OFFLINE' ? 'Поиск по магазинам работает на сайте Vercel (нужен сервер /api).' : `${r.store}: магазин не открыл поиск`); const its = (r.items || []).filter((i: any) => i.price && Number(i.price) > 0).map((i: any) => ({...i, store: r.store, _s: score(i.title, query)}));
      if (its.some((i: any) => i._s > 0)) out.push(...its.sort((a: any, b: any) => b._s - a._s)); }
    setItems(out); setNotes([...new Set(n)]); setBusy(false); setDone(true);
  };
  const toBazaar = (store: string) => {
    const its = items.filter(i => i.store === store); if (!its.length) return;
    bazaar.addConnector({name: store === GLOBAL ? 'Shopify: ' + q : STORES.find(s => s.domain === store)?.name || store, protocol: store === GLOBAL ? 'ucp' : 'api', endpoint: store === GLOBAL ? 'https://catalog.shopify.com/api/ucp/mcp' : 'https://' + store, note: `${engine === 'woo' ? 'WooCommerce' : 'Shopify'}-магазин ${store}. Цены в валюте магазина; оплата на его странице.`, logo: its[0].image,
      items: its.map((i, k) => ({id: 'p' + k, title: i.title, price: i.price, image: i.image, url: i.url, pay: {kind: 'link' as const, url: i.url}}))});
  };
  const stores = [...new Set(items.map(i => i.store))];
  return <div className="bz-sec bz-online" data-testid="bz-online">
    <div className="bz-providers" role="tablist" aria-label="Где искать">{PROVIDERS.map(p => <button key={p.id} type="button" role="tab" disabled={!p.on} data-testid={'bz-prov-' + p.id}
      aria-pressed={p.id === engine} style={{'--pc': p.color} as React.CSSProperties} className={'bz-prov' + (p.on ? '' : ' off')}
      onClick={() => { if (p.id === 'files') { onFiles?.(); return; } setEngine(p.id as Engine); setPick(GLOBAL); setItems([]); setDone(false); setNotes([]); }}>
      <span className="bz-prov-glow"/><b>{p.name}</b><small>{p.sub}</small>{!p.on && <i>скоро</i>}</button>)}</div>
    <p className="bz-note">{engine === 'shopify' ? '«Весь Shopify» — поиск сразу по всем магазинам на Shopify, бесплатно и без ключей. Или выберите магазин на панели.' : 'WooCommerce — движок магазинов на WordPress. Своего общего каталога у него нет, поэтому мы собрали свой: 82 проверенных магазина по категориям. Любой другой магазин можно добавить по адресу.'} Пишите по-русски или по-английски.</p>
    <div className="bz-storechips">
      {engine === 'shopify' && <button type="button" aria-pressed={pick === GLOBAL && !own} onClick={() => { setPick(GLOBAL); setOwn(''); }} data-testid="bz-online-global"><b>🌍</b>Весь Shopify<small>все магазины</small></button>}
      {engine === 'woo' && <button type="button" aria-pressed={pick === GLOBAL && !own} onClick={() => { setPick(GLOBAL); setOwn(''); }} data-testid="bz-online-wooall"><b>🌐</b>Каталог WooCommerce<small>82 проверенных магазина</small></button>}
      {STORES.length > 1 && <button type="button" aria-pressed={pick === 'all' && !own} onClick={() => { setPick('all'); setOwn(''); }}>Мои магазины сразу ({STORES.length})</button>}
      {STORES.map(s => <span key={s.domain} className="bz-chip"><button type="button" aria-pressed={pick === s.domain && !own} onClick={() => { setPick(s.domain); setOwn(''); if (!q && s.hint) setQ(s.hint); }}><b>{s.icon}</b>{s.name}{s.ru && <small>{s.ru}</small>}</button>
        <button type="button" className="bz-chip-x" title="Убрать с панели" aria-label={'Убрать ' + s.name} onClick={() => { setList(STORES.filter(x => x.domain !== s.domain)); if (pick === s.domain) setPick(GLOBAL); }}>×</button></span>)}
      <AddStore key={engine} engine={engine} stores={STORES} onAdd={st => { setList([...STORES, st]); setPick(st.domain); }}/>
    </div>
    {engine === 'woo' && pick === GLOBAL && <div className="bz-cats">{['', ...WOO_CATS].map(c => <button key={c || 'all'} type="button" aria-pressed={cat === c} onClick={() => setCat(c)}>{c || 'Все категории'}</button>)}</div>}
    <div className="bz-search">
      <input value={q} onChange={e => setQ(e.target.value)} onKeyDown={e => e.key === 'Enter' && void run()} placeholder="Что ищем? диван, кастрюля, кроссовки…" data-testid="bz-online-q"/>
      <button type="button" className="bz-btn acc" disabled={busy || !q.trim()} onClick={() => void run()} data-testid="bz-online-go">{busy ? 'Ищу…' : 'Найти'}</button>
    </div>
    {notes.map((n, i) => <p key={i} className="bz-warnbox">{n}</p>)}
    {done && !items.length && !notes.length && <p className="bz-note" data-testid="bz-online-none">{pick === GLOBAL ? 'Ничего не нашлось. Попробуйте по-английски или другое слово.' : 'В этих магазинах такого нет. Попробуйте «Весь Shopify».'}</p>}
    {total != null && items.length > 0 && <p className="bz-note">Найдено примерно {total.toLocaleString()} · показаны первые {items.length}</p>}
    {stores.map(st => <div key={st} className="bz-storeblock">
      <div className="bz-storehead"><b>{st === GLOBAL ? (engine === 'woo' ? '🌐 Каталог WooCommerce' : '🌍 Весь Shopify') : `${STORES.find(s => s.domain === st)?.icon || '🛒'} ${STORES.find(s => s.domain === st)?.name || st}`}</b>{st !== GLOBAL && <small>{st}</small>}<button type="button" className="bz-btn" onClick={() => toBazaar(st)}>＋ Сохранить как лавку в Базаре</button></div>
      <div className="bz-cards">{items.filter(i => i.store === st).map((i, k) => <a key={k} className="bz-card" href={i.url} target="_blank" rel="noreferrer" data-testid="bz-online-card">
        <span className="bz-card-img" style={i.image ? {backgroundImage: `url("${i.image.replace(/"/g, '%22')}")`} : undefined}/>
        <b>{i.title}</b><span className="bz-card-p">{i.currency && i.currency !== 'USD' ? `${Number(i.price).toFixed(2)} ${i.currency}` : `$${Number(i.price).toFixed(2)}`}{i.available === false ? ' · нет в наличии' : ''}</span>{i.seller && <small className="bz-card-s">{i.seller}</small>}<small>Купить в магазине ↗</small>
      </a>)}</div>
    </div>)}
  </div>;
}
