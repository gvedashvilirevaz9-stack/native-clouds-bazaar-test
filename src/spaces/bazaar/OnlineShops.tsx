// "Магазины онлайн": search real Shopify stores from the Bazaar page. No tokens: the site's own
// /api/shop-search asks the store's public search. Works on the deployed site (Vercel), not offline.
import {useState} from 'react';
import {bazaar} from './store';

type Store = {domain: string; name: string; icon: string; ru: string; hint: string};
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
// The person's own list of stores (kept in this browser). Starts with the six examples.
const KEY = 'bz.stores.v1';
const loadStores = (): Store[] => { try { const v = JSON.parse(localStorage.getItem(KEY) || 'null'); if (Array.isArray(v)) return v; } catch { /* storage off */ } return DEFAULT_STORES; };
const saveStores = (v: Store[]) => { try { localStorage.setItem(KEY, JSON.stringify(v)); } catch { /* storage off */ } };
const isDomain = (x: string) => /^[a-z0-9-]+(\.[a-z0-9-]+)+$/i.test(x.trim().replace(/^https?:\/\//, '').replace(/\/.*$/, ''));
const cleanDomain = (x: string) => x.trim().replace(/^https?:\/\//, '').replace(/\/.*$/, '').replace(/^www\./, '').toLowerCase();

function AddStore({stores, onAdd}: {stores: Store[]; onAdd: (s: Store) => void}) {
  const [open, setOpen] = useState(false); const [name, setName] = useState(''); const [busy, setBusy] = useState(false);
  const [found, setFound] = useState<{name: string; domain: string}[]>([]); const [msg, setMsg] = useState('');
  const has = (d: string) => stores.some(s => s.domain === d);
  const works = async (d: string) => { try { const j = await (await fetch(`/api/shop-search?store=${encodeURIComponent(d)}&q=a`)).json(); return !j.error; } catch { return false; } };
  const add = async (n: string, d: string) => { setBusy(true); setMsg(''); const ok = await works(d); setBusy(false);
    if (!ok) { setMsg(`У магазина ${d} закрыт свой поиск — искать по нему можно через «Весь Shopify».`); return; }
    onAdd({domain: d, name: n, icon: '🛒', ru: '', hint: ''}); setOpen(false); setName(''); setFound([]); };
  const find = async () => {
    const q = name.trim(); if (!q) return; setMsg(''); setFound([]);
    if (isDomain(q)) { await add(cleanDomain(q), cleanDomain(q)); return; }
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
    <div className="bz-search"><input autoFocus value={name} onChange={e => setName(e.target.value)} onKeyDown={e => e.key === 'Enter' && void find()} placeholder="Название или адрес магазина: Mattel, nike, shop.example.com" data-testid="bz-addstore-q"/>
      <button type="button" className="bz-btn acc" disabled={busy || !name.trim()} onClick={() => void find()} data-testid="bz-addstore-go">{busy ? 'Ищу…' : 'Найти магазин'}</button>
      <button type="button" className="bz-btn" onClick={() => { setOpen(false); setFound([]); setMsg(''); }}>Отмена</button></div>
    {found.length > 0 && <div className="bz-found">{found.slice(0, 12).map(f => <div key={f.domain} className="bz-found-row"><b>{f.name}</b><small>{f.domain}</small>
      {has(f.domain) ? <span className="bz-note">уже на панели</span> : <button type="button" className="bz-btn" disabled={busy} onClick={() => void add(f.name, f.domain)}>＋ Добавить</button>}</div>)}</div>}
    {msg && <p className="bz-warnbox">{msg}</p>}
  </div>;
}

export function OnlineShops() {
  const [STORES, setStores] = useState<Store[]>(loadStores); const setList = (v: Store[]) => { setStores(v); saveStores(v); };
  const [pick, setPick] = useState<string>(GLOBAL); const [total, setTotal] = useState<number | null>(null); const [own, setOwn] = useState(''); const [q, setQ] = useState('');
  const [busy, setBusy] = useState(false); const [items, setItems] = useState<Item[]>([]); const [notes, setNotes] = useState<string[]>([]); const [done, setDone] = useState(false);
  const run = async () => {
    const query = toEn(q); if (!query) return; setBusy(true); setNotes([]); setItems([]); setDone(false);
    setTotal(null);
    if (pick === GLOBAL && !own.trim()) {
      try { const j = await (await fetch(`/api/global-search?source=shopify&q=${encodeURIComponent(query)}`)).json();
        if (j.error) setNotes([j.error.startsWith('HTTP_429') ? 'Shopify просит подождать (лимит бесплатного поиска). Повторите через минуту.' : 'Общий каталог Shopify не ответил: ' + j.error]);
        setItems((j.items || []).filter((i: any) => i.price && Number(i.price) > 0).map((i: any) => ({...i, available: true, vendor: null, store: GLOBAL, seller: i.store}))); setTotal(j.total ?? null);
      } catch { setNotes(['Поиск работает на сайте Vercel (нужен сервер /api).']); }
      setBusy(false); setDone(true); return;
    }
    const list = own.trim() ? [own.trim()] : pick === 'all' ? STORES.map(s => s.domain) : [pick];
    const res = await Promise.all(list.map(async d => { try { const r = await fetch(`/api/shop-search?store=${encodeURIComponent(d)}&q=${encodeURIComponent(query)}`); const j = await r.json(); return j; } catch { return {store: d, error: 'OFFLINE', items: []}; } }));
    const out: Item[] = []; const n: string[] = [];
    for (const r of res) { if (r.error) n.push(r.error === 'OFFLINE' ? 'Поиск по магазинам работает на сайте Vercel (нужен сервер /api).' : `${r.store}: магазин не открыл поиск`); const its = (r.items || []).filter((i: any) => i.price && Number(i.price) > 0).map((i: any) => ({...i, store: r.store, _s: score(i.title, query)}));
      if (its.some((i: any) => i._s > 0)) out.push(...its.sort((a: any, b: any) => b._s - a._s)); }
    setItems(out); setNotes([...new Set(n)]); setBusy(false); setDone(true);
  };
  const toBazaar = (store: string) => {
    const its = items.filter(i => i.store === store); if (!its.length) return;
    bazaar.addConnector({name: store === GLOBAL ? 'Shopify: ' + q : STORES.find(s => s.domain === store)?.name || store, protocol: store === GLOBAL ? 'ucp' : 'api', endpoint: store === GLOBAL ? 'https://catalog.shopify.com/api/ucp/mcp' : 'https://' + store, note: `Shopify-магазин ${store}. Цены в валюте магазина; оплата на его странице.`, logo: its[0].image,
      items: its.map((i, k) => ({id: 'p' + k, title: i.title, price: i.price, image: i.image, url: i.url, pay: {kind: 'link' as const, url: i.url}}))});
  };
  const stores = [...new Set(items.map(i => i.store))];
  return <div className="bz-sec bz-online" data-testid="bz-online">
    <h2>Магазины онлайн</h2>
    <p className="bz-note">«Весь Shopify» — поиск по всем магазинам на Shopify сразу (общий каталог Shopify, бесплатно, без ключей). Или выберите отдельный магазин. Пишите по-русски или по-английски.</p>
    <div className="bz-storechips">
      <button type="button" aria-pressed={pick === GLOBAL && !own} onClick={() => { setPick(GLOBAL); setOwn(''); }} data-testid="bz-online-global"><b>🌍</b>Весь Shopify<small>все магазины</small></button>
      {STORES.length > 1 && <button type="button" aria-pressed={pick === 'all' && !own} onClick={() => { setPick('all'); setOwn(''); }}>Мои магазины сразу ({STORES.length})</button>}
      {STORES.map(s => <span key={s.domain} className="bz-chip"><button type="button" aria-pressed={pick === s.domain && !own} onClick={() => { setPick(s.domain); setOwn(''); if (!q && s.hint) setQ(s.hint); }}><b>{s.icon}</b>{s.name}{s.ru && <small>{s.ru}</small>}</button>
        <button type="button" className="bz-chip-x" title="Убрать с панели" aria-label={'Убрать ' + s.name} onClick={() => { setList(STORES.filter(x => x.domain !== s.domain)); if (pick === s.domain) setPick(GLOBAL); }}>×</button></span>)}
      <AddStore stores={STORES} onAdd={st => { setList([...STORES, st]); setPick(st.domain); }}/>
    </div>
    <div className="bz-search">
      <input value={q} onChange={e => setQ(e.target.value)} onKeyDown={e => e.key === 'Enter' && void run()} placeholder="Что ищем? диван, кастрюля, кроссовки…" data-testid="bz-online-q"/>
      <button type="button" className="bz-btn acc" disabled={busy || !q.trim()} onClick={() => void run()} data-testid="bz-online-go">{busy ? 'Ищу…' : 'Найти'}</button>
    </div>
    {notes.map((n, i) => <p key={i} className="bz-warnbox">{n}</p>)}
    {done && !items.length && !notes.length && <p className="bz-note" data-testid="bz-online-none">{pick === GLOBAL ? 'Ничего не нашлось. Попробуйте по-английски или другое слово.' : 'В этих магазинах такого нет. Попробуйте «Весь Shopify».'}</p>}
    {total != null && items.length > 0 && <p className="bz-note">Найдено примерно {total.toLocaleString()} · показаны первые {items.length}</p>}
    {stores.map(st => <div key={st} className="bz-storeblock">
      <div className="bz-storehead"><b>{st === GLOBAL ? '🌍 Весь Shopify' : `${STORES.find(s => s.domain === st)?.icon || '🛒'} ${STORES.find(s => s.domain === st)?.name || st}`}</b>{st !== GLOBAL && <small>{st}</small>}<button type="button" className="bz-btn" onClick={() => toBazaar(st)}>＋ Сохранить как лавку в Базаре</button></div>
      <div className="bz-cards">{items.filter(i => i.store === st).map((i, k) => <a key={k} className="bz-card" href={i.url} target="_blank" rel="noreferrer" data-testid="bz-online-card">
        <span className="bz-card-img" style={i.image ? {backgroundImage: `url("${i.image.replace(/"/g, '%22')}")`} : undefined}/>
        <b>{i.title}</b><span className="bz-card-p">{i.currency && i.currency !== 'USD' ? `${Number(i.price).toFixed(2)} ${i.currency}` : `$${Number(i.price).toFixed(2)}`}{i.available === false ? ' · нет в наличии' : ''}</span>{i.seller && <small className="bz-card-s">{i.seller}</small>}<small>Купить в магазине ↗</small>
      </a>)}</div>
    </div>)}
  </div>;
}
