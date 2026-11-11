// "Магазины онлайн": search real Shopify stores from the Bazaar page. No tokens: the site's own
// /api/shop-search asks the store's public search. Works on the deployed site (Vercel), not offline.
import {useState} from 'react';
import {bazaar} from './store';

const STORES: {domain: string; name: string; icon: string; ru: string; hint: string}[] = [
  {domain: 'floydhome.com', name: 'Floyd', icon: '🛋', ru: 'мебель', hint: 'sofa'},
  {domain: 'fromourplace.com', name: 'Our Place', icon: '🍳', ru: 'посуда', hint: 'pan'},
  {domain: 'allbirds.com', name: 'Allbirds', icon: '👟', ru: 'обувь', hint: 'shoes'},
  {domain: 'gymshark.com', name: 'Gymshark', icon: '🏋', ru: 'спорт', hint: 'hoodie'},
  {domain: 'brooklinen.com', name: 'Brooklinen', icon: '🛏', ru: 'постельное', hint: 'sheets'},
  {domain: 'colourpop.com', name: 'ColourPop', icon: '💄', ru: 'косметика', hint: 'lipstick'},
];
// Stores search in English; a few everyday words are translated so "диван" just works.
const RU: Record<string, string> = {диван: 'sofa', диваны: 'sofa', кровать: 'bed', стол: 'table', стул: 'chair', кресло: 'chair', кастрюля: 'pot', кастрюли: 'pot', сковорода: 'pan', сковородка: 'pan', нож: 'knife', посуда: 'cookware',
  кроссовки: 'sneakers', обувь: 'shoes', ботинки: 'boots', носки: 'socks', худи: 'hoodie', футболка: 'shirt', штаны: 'pants', шорты: 'shorts', куртка: 'jacket', простыни: 'sheets', подушка: 'pillow', одеяло: 'comforter', полотенце: 'towel', помада: 'lipstick', тени: 'eyeshadow'};
// A store's own search is loose ("toy cars" brings shoes). Keep only items whose title has every word (car = cars).
const stem = (w: string) => w.replace(/(es|s)$/, '');
const fits = (title: string, q: string) => { const t = title.toLowerCase(); return q.split(/\s+/).filter(w => w.length > 1).every(w => t.includes(stem(w))); };
const toEn = (q: string) => q.toLowerCase().split(/\s+/).map(w => RU[w] || w).join(' ').trim();

type Item = {title: string; price: string | null; available: boolean | null; image: string | null; url: string; vendor: string | null; store: string; seller?: string | null; currency?: string | null};
const GLOBAL = 'global';

export function OnlineShops() {
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
    for (const r of res) { if (r.error) n.push(r.error === 'OFFLINE' ? 'Поиск по магазинам работает на сайте Vercel (нужен сервер /api).' : `${r.store}: магазин не открыл поиск`); for (const i of r.items || []) if (i.price && Number(i.price) > 0 && fits(i.title, query)) out.push({...i, store: r.store}); }
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
      <button type="button" aria-pressed={pick === 'all' && !own} onClick={() => { setPick('all'); setOwn(''); }}>6 магазинов сразу</button>
      {STORES.map(s => <button key={s.domain} type="button" aria-pressed={pick === s.domain && !own} onClick={() => { setPick(s.domain); setOwn(''); if (!q) setQ(s.hint); }}><b>{s.icon}</b>{s.name}<small>{s.ru}</small></button>)}
    </div>
    <div className="bz-search">
      <input value={q} onChange={e => setQ(e.target.value)} onKeyDown={e => e.key === 'Enter' && void run()} placeholder="Что ищем? диван, кастрюля, кроссовки…" data-testid="bz-online-q"/>
      <button type="button" className="bz-btn acc" disabled={busy || !q.trim()} onClick={() => void run()} data-testid="bz-online-go">{busy ? 'Ищу…' : 'Найти'}</button>
    </div>
    <details className="bz-own"><summary>Свой магазин на Shopify</summary><input value={own} onChange={e => setOwn(e.target.value)} placeholder="адрес магазина, например shop.example.com"/></details>
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
