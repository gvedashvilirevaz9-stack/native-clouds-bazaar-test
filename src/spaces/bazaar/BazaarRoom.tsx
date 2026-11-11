// "Базар": the buying side. Separate from "My shop" (selling side): own room, own storage, own commands.
// Stalls = price-list files people send you + catalogs agents bring from outside services. One search over all.
import {useEffect, useMemo, useRef, useState} from 'react';
import qrcode from 'qrcode-generator';
import {bazaar, useBazaar, type Order, type Stall, type CatalogItem} from './store';
import {parseCartridge} from './cartridge';
import {payGroup, checkGroup, confirmHash, orderPaid} from './pay';
import {CONNECTORS, STATUS_RU, FLOW_RU} from './connectors';
import {OnlineShops} from './OnlineShops';
import {html} from '../shop/export';
import {payUri, units, txUrl} from '../shop/chain';
import './bazaar.css';

type Tab = 'stalls' | 'online' | 'orders' | 'connect' | 'agent';
export const bazaarNav: {tab: Tab; stall: string | null; order: string | null} = {tab: 'online', stall: null, order: null};
const short = (a: string) => a.slice(0, 6) + '…' + a.slice(-4);
function qr(text: string) { const q = qrcode(0, 'M'); q.addData(text); q.make(); return q.createDataURL(5, 2); }
const ERR: Record<string, string> = {NOT_A_PRICELIST: 'В файле нет прайс-листа. Нужен HTML из «Моего магазина» или products.json.', NO_WALLET: 'Кошелёк в браузере не найден (Coinbase Wallet, MetaMask). Оплатите по QR.',
  TX_NOT_FOUND: 'Транзакция не найдена в сети Base.', TX_FAILED: 'Транзакция не прошла.', TX_NOT_TO_THIS_SELLER: 'В этой транзакции нет USDC на адрес этого продавца.', HASH_INVALID: 'Хеш — это 0x и 64 символа.'};
const errText = (e: any) => { const m = String(e?.message || e); return ERR[m.split(':')[0]] || m; };

export async function importFile(file: File | {name: string; text: string}) {
  const text = 'text' in file && typeof file.text === 'string' ? file.text : await (file as File).text();
  const r = parseCartridge(text);
  return bazaar.addFile({cfg: r.cfg, file: file.name, size: text.length, warnings: r.warnings, source: r.source});
}

function StallCard({s, onOpen}: {s: Stall; onOpen: () => void}) {
  const items = bazaar.catalog(s.key); const prices = items.map(i => Number(i.price)).filter(n => n > 0);
  const cover = s.kind === 'file' ? (s.cfg.sections.find(x => x.banner)?.banner?.src || s.cfg.sections.flatMap(x => x.cells).find(c => c.image)?.image?.src) : s.logo;
  const coverUrl = cover ? (cover.startsWith('#a') && s.kind === 'file' ? s.cfg.assets[+cover.slice(2)] : cover) : null;
  return <button type="button" className="bz-stall" onClick={onOpen} data-testid="bz-stall">
    <span className="bz-cover" style={coverUrl ? {backgroundImage: `url("${coverUrl.replace(/"/g, '%22')}")`} : undefined}>{!coverUrl && (s.kind === 'file' ? '🏪' : '🔌')}</span>
    <strong>{bazaar.name(s)}</strong>
    <small>{s.kind === 'file' ? `файл · ${s.cfg.brand.place || 'место не указано'}` : `${s.protocol.toUpperCase()} · через агента`}</small>
    <small>{items.length} поз.{prices.length ? ` · ${Math.min(...prices)}–${Math.max(...prices)} USDC` : ''}</small>
    {s.warnings.length > 0 && <small className="bz-warn">⚠ {s.warnings[0]}</small>}
  </button>;
}

function ItemRow({i, onBuy}: {i: CatalogItem; onBuy: () => void}) {
  return <div className="bz-item" data-testid="bz-item">
    {i.image ? <span className="bz-thumb" style={{backgroundImage: `url("${i.image.replace(/"/g, '%22')}")`}}/> : <span className="bz-thumb">🛍</span>}
    <span className="bz-item-t"><b>{i.title}</b><small>{i.stallName}{i.place ? ' · 📍 ' + i.place : ''}{i.seller ? ' · ' + i.seller : ''}</small></span>
    <span className="bz-price">{i.price ? `${i.price} USDC` : '—'}</span>
    <span className={'bz-route r-' + i.pay}>{i.pay === 'evm' ? '👤 платит человек · USDC' : i.pay === 'x402' ? '🤖 платит агент · x402' : i.pay === 'link' ? '↗ у продавца' : 'только написать'}</span>
    {i.price && i.pay !== 'none' && <button type="button" className="bz-btn" onClick={onBuy}>Купить</button>}
  </div>;
}

function OrderPanel({o}: {o: Order}) {
  const [busy, setBusy] = useState(''); const [msg, setMsg] = useState(''); const [hash, setHash] = useState<Record<number, string>>({});
  const run = async (k: string, f: () => Promise<any>, ok?: string) => { setBusy(k); setMsg(''); try { const r = await f(); setMsg(ok || (r ? '✓ Готово' : 'Пока не видно. Подождите минуту и проверьте снова.')); } catch (e) { setMsg(errText(e)); } setBusy(''); };
  const text = bazaar.message(o); const c = o.contact || {}; const paid = orderPaid(o);
  return <div className="bz-order" data-testid="bz-order">
    <h3>Заказ <span className="bz-code">#{o.code}</span> · {o.stallName}</h3>
    {o.items.map(i => <div key={i.id} className="bz-line"><span>{i.title} ×{i.qty}</span><b>{(Number(i.price) * i.qty).toString()} USDC</b></div>)}
    {o.groups.map((g, i) => <div key={i} className="bz-pay" data-testid="bz-pay">
      {g.route === 'evm' && g.to ? <>
        <img src={qr(payUri(g.to, units(g.amount)))} alt="QR для оплаты"/>
        <div className="bz-pay-b">
          <span className="bz-amt">{g.amount} <small>USDC · Base</small></span>
          <code title={g.to}>→ {g.seller ? g.seller + ' · ' : ''}{short(g.to)}</code>
          {g.paid ? <span className="bz-ok">✓ Оплачено · <a href={txUrl(g.paid.tx)} target="_blank" rel="noreferrer">{short(g.paid.tx)}</a>{!g.paid.exact && ' (без номера заказа — отправьте продавцу хеш)'}</span> : <>
            <div className="bz-row">
              {(window as any).ethereum && <button type="button" className="bz-btn acc" disabled={!!busy} data-testid="bz-wallet" onClick={() => run('w' + i, () => payGroup(o.id, i), 'Отправлено. Проверяю через несколько секунд…').then(() => setTimeout(() => void run('c' + i, () => checkGroup(o.id, i)), 6000))}>Оплатить кошельком</button>}
              <a className="bz-btn" href={payUri(g.to, units(g.amount))}>Открыть в кошельке</a>
              <button type="button" className="bz-btn" disabled={!!busy} data-testid="bz-check" onClick={() => void run('c' + i, () => checkGroup(o.id, i))}>{busy === 'c' + i ? 'Ищу…' : 'Проверить оплату'}</button>
            </div>
            <div className="bz-row"><input placeholder="Уже оплатили? Вставьте хеш 0x…" value={hash[i] || ''} onChange={e => setHash({...hash, [i]: e.target.value.trim()})} data-testid="bz-hash"/>
              <button type="button" className="bz-btn" disabled={!hash[i] || !!busy} data-testid="bz-hash-ok" onClick={() => void run('h' + i, () => confirmHash(o.id, i, hash[i]))}>Подтвердить</button></div>
            <small>Только USDC в сети Base. Платите с личного кошелька (Coinbase Wallet, MetaMask): биржа может округлить сумму.{g.amount !== g.total ? ` Последние цифры (${String(o.code).padStart(4, '0')}) — номер заказа.` : ''}</small>
          </>}
        </div></> : <div className="bz-pay-b"><b>{g.total} USDC · {g.route === 'x402' ? 'оплата агентом (x402)' : 'оплата у продавца'}</b>{g.url && <a className="bz-btn" href={g.url} target="_blank" rel="noreferrer">Открыть ↗</a>}
          <small>{g.route === 'x402' ? 'Этот товар оплачивает агентский кошелёк по протоколу x402 — модуль в плане (см. «Подключения»). После оплаты агент передаёт хеш: bazaar.confirm.' : 'Оплата завершается на странице продавца.'}</small></div>}
    </div>)}
    {msg && <p className="bz-msg" data-testid="bz-msg">{msg}</p>}
    <div className="bz-row bz-send"><b>{paid ? 'Оплачено — отправьте продавцу заказ с хешем:' : 'Отправить заказ продавцу:'}</b>
      {c.whatsapp && <a className="bz-btn" href={`https://wa.me/${c.whatsapp.replace(/\D/g, '')}?text=${encodeURIComponent(text)}`} target="_blank" rel="noreferrer">WhatsApp</a>}
      {c.telegram && <a className="bz-btn" href={'https://t.me/' + c.telegram.replace(/^@/, '')} target="_blank" rel="noreferrer">Telegram</a>}
      {c.email && <a className="bz-btn" href={`mailto:${c.email}?subject=${encodeURIComponent('Заказ #' + o.code)}&body=${encodeURIComponent(text)}`}>E-mail</a>}
      <button type="button" className="bz-btn" onClick={() => navigator.clipboard?.writeText(text)}>Скопировать текст</button></div>
  </div>;
}

function StallView({s, onOrder}: {s: Stall; onOrder: (o: Order) => void}) {
  const ref = useRef<HTMLIFrameElement>(null);
  const doc = useMemo(() => s.kind === 'file' ? html(s.cfg, 'bazaar') : '', [s]);
  useEffect(() => {
    const f = (e: MessageEvent) => { if (e.source !== ref.current?.contentWindow) return; const m = e.data; if (m?.source !== 'sunrise-shop' || m.type !== 'bazaar:checkout') return;
      try { onOrder(bazaar.order(s.key, (m.lines || []).slice(0, 100).map((l: any) => ({id: String(l.id), qty: Math.max(1, Math.min(999, +l.qty || 1))})), {name: String(m.buyer?.name || '').slice(0, 60), contact: String(m.buyer?.contact || '').slice(0, 80), comment: String(m.buyer?.comment || '').slice(0, 300)})); } catch { /* nothing priced */ } };
    window.addEventListener('message', f); return () => window.removeEventListener('message', f);
  }, [s.key]);
  if (s.kind === 'file') return <iframe ref={ref} className="bz-frame" title={s.cfg.brand.name} sandbox="allow-scripts allow-popups allow-popups-to-escape-sandbox" srcDoc={doc} data-testid="bz-frame"/>;
  return <div className="bz-list">{s.note && <p className="bz-note">{s.note}</p>}{bazaar.catalog(s.key).map(i => <ItemRow key={i.id} i={i} onBuy={() => onOrder(bazaar.order(s.key, [{id: i.id, qty: 1}]))}/>)}</div>;
}

function Connections() {
  return <div className="bz-sec" data-testid="bz-connect">
    <h2>Подключения: кто и как продаёт в Базаре</h2>
    <p className="bz-note">У каждого источника свой стандарт. Модули включаются по одному: сначала покупаете вы сами (USDC с личного кошелька), потом — агент со своим кошельком и лимитами.</p>
    <div className="bz-conns">{CONNECTORS.map(c => <div key={c.id} className={'bz-conn s-' + c.status}>
      <div className="bz-conn-h"><b>{c.title}</b><span className={'bz-st s-' + c.status}>{STATUS_RU[c.status]}</span></div>
      <small><b>Стандарт:</b> {c.standard}</small>
      <small><b>Кто платит:</b> {c.payers.map(p => p === 'human' ? '👤 человек' : '🤖 агент').join(', ')} · {c.flows.map(f => FLOW_RU[f]).join(', ')}</small>
      <small><b>Деньги:</b> {c.money}</small>
      <small><b>Как подключить:</b> {c.how}</small>
      <small><b>Агент:</b> {c.agent}</small>
      <small><b>Нужно:</b> {c.needs}{c.link && <> · <a href={c.link} target="_blank" rel="noreferrer">{c.link.replace(/^https:\/\//, '')}</a></>}</small>
    </div>)}</div>
  </div>;
}

function AgentLimits() {
  const st = useBazaar(); const p = st.policy; const spent = bazaar.agentSpentToday();
  return <div className="bz-sec" data-testid="bz-agent">
    <h2>Агент и лимиты</h2>
    <p className="bz-note">Агент не получает ключей и не держит деньги. Он может только попросить кошелёк браузера заплатить — и только в этих рамках. Сам кошелёк всё равно спросит вас. Агентский кошелёк для x402 (платит без вас) — следующий модуль; лимиты ниже станут его правилами.</p>
    <label className="bz-check"><input type="checkbox" checked={p.enabled} onChange={e => bazaar.setPolicy({enabled: e.target.checked})} data-testid="bz-agent-on"/> Разрешить агенту запускать оплату</label>
    <div className="bz-grid2">
      <label>Максимум за один заказ, USDC<input value={p.perOrderMax} onChange={e => bazaar.setPolicy({perOrderMax: e.target.value.replace(/[^\d.]/g, '') || '0'})}/></label>
      <label>Максимум в день, USDC<input value={p.perDayMax} onChange={e => bazaar.setPolicy({perDayMax: e.target.value.replace(/[^\d.]/g, '') || '0'})}/></label>
      <label>Спрашивать меня в портале выше, USDC<input value={p.needConfirmAbove} onChange={e => bazaar.setPolicy({needConfirmAbove: e.target.value.replace(/[^\d.]/g, '') || '0'})}/></label>
    </div>
    <label className="bz-check"><input type="checkbox" checked={p.routes.evm} onChange={e => bazaar.setPolicy({routes: {...p.routes, evm: e.target.checked}})}/> Оплата USDC на адрес продавца</label>
    <label className="bz-check"><input type="checkbox" checked={p.routes.x402} disabled onChange={() => undefined}/> x402 (агентский кошелёк) — модуль в плане</label>
    <div><b>Только эти лавки</b> (пусто = любые):<div className="bz-chips">{st.stalls.map(s => <label key={s.key} className="bz-check"><input type="checkbox" checked={p.onlyStalls.includes(s.key)} onChange={e => bazaar.setPolicy({onlyStalls: e.target.checked ? [...p.onlyStalls, s.key] : p.onlyStalls.filter(k => k !== s.key)})}/> {bazaar.name(s)}</label>)}</div></div>
    <p className="bz-note">Агент потратил сегодня: <b>{(Number(spent) / 1e6).toString()} USDC</b> из {p.perDayMax}.</p>
  </div>;
}

export function BazaarRoom({onClose}: {onClose: () => void}) {
  const st = useBazaar(); const [tab, setTab] = useState<Tab>(bazaarNav.tab); const [open, setOpen] = useState<string | null>(bazaarNav.stall); const [orderId, setOrderId] = useState<string | null>(bazaarNav.order);
  const [q, setQ] = useState(''); const [err, setErr] = useState(''); const [solid, setSolid] = useState(() => { try { return localStorage.getItem('bz.solid') === '1'; } catch { return false; } }); const [drag, setDrag] = useState(false); const fileRef = useRef<HTMLInputElement>(null);
  useEffect(() => { void bazaar.load(); const f = (e: any) => { (window as any).__bazaarUiPending = null; const d = e.detail || {}; if (d.tab) setTab(d.tab); if (d.stall !== undefined) setOpen(d.stall); if (d.order !== undefined) setOrderId(d.order); if (d.q !== undefined) setQ(d.q); };
    window.addEventListener('bazaar:ui', f); const pend = (window as any).__bazaarUiPending; if (pend) f({detail: pend}); return () => window.removeEventListener('bazaar:ui', f); }, []);
  useEffect(() => { bazaarNav.tab = tab; bazaarNav.stall = open; bazaarNav.order = orderId; }, [tab, open, orderId]);
  const take = async (files: FileList | File[]) => { setErr(''); for (const f of Array.from(files)) { try { const s = await importFile(f); setOpen(s.key); setTab('stalls'); } catch (e) { setErr(`${f.name}: ${errText(e)}`); } } };
  const stall = open ? bazaar.stall(open) : null; const order = orderId ? bazaar.getOrder(orderId) : null;
  const found = q.trim() ? bazaar.search(q) : [];
  return <div className={'bz-room' + (solid ? ' bz-solid' : '')} data-testid="bazaar-room" onDragOver={e => { e.preventDefault(); setDrag(true); }} onDragLeave={() => setDrag(false)} onDrop={e => { e.preventDefault(); e.stopPropagation(); setDrag(false); void take(e.dataTransfer.files); }}>
    <header className="bz-top">
      <div className="bz-title"><b>🧺 Базар</b><small>здесь вы покупаете: лавки из присланных прайс-листов и каталоги сервисов</small></div>
      <nav className="bz-tabs">{([['stalls', '🏪 Лавки'], ['online', '🛒 Магазины онлайн'], ['orders', '🧾 Мои покупки'], ['connect', '🔌 Подключения'], ['agent', '🤖 Агент и лимиты']] as const).map(([k, l]) => <button key={k} type="button" aria-pressed={tab === k} data-testid={'bz-tab-' + k} onClick={() => { setTab(k); if (k === 'stalls') setOpen(null); }}>{l}{k === 'orders' && st.orders.length ? ` (${st.orders.length})` : ''}</button>)}</nav>
      <button type="button" className="bz-bgtoggle" title={solid ? 'Показать облака за окном' : 'Спокойный фон'} onClick={() => { const v = !solid; setSolid(v); try { localStorage.setItem('bz.solid', v ? '1' : '0'); } catch { /* */ } }}>{solid ? '☁' : '◐'}</button>
      <button type="button" className="bz-x" onClick={onClose} aria-label="Закрыть">×</button>
    </header>
    {drag && <div className="bz-dropping">Отпустите — прайс-лист станет лавкой</div>}
    <div className="bz-body">
      {tab === 'stalls' && (stall ? <div className="bz-open">
        <div className="bz-open-h"><button type="button" className="bz-btn" onClick={() => setOpen(null)}>← Все лавки</button><b>{bazaar.name(stall)}</b>
          {stall.kind === 'file' && <small>{stall.file} · {Math.round(stall.size / 1024)} КБ · добавлен {new Date(stall.importedAt).toLocaleDateString()}</small>}
          <button type="button" className="bz-link" onClick={() => { bazaar.remove(stall.key); setOpen(null); }}>убрать лавку</button></div>
        {stall.warnings.map((w, i) => <p key={i} className="bz-warnbox">⚠ {w}</p>)}
        <div className={'bz-split' + (order && order.stall === stall.key ? ' with-order' : '')}>
          <StallView s={stall} onOrder={o => setOrderId(o.id)}/>
          {order && order.stall === stall.key ? <OrderPanel o={order}/> : <aside className="bz-hint">Добавляйте товары в корзину на витрине и нажмите «Перейти к оплате» — счёт появится здесь. Платите сами (QR или кошелёк) или скажите агенту: «оплати заказ».</aside>}
        </div>
      </div> : <>
        <div className="bz-search"><input value={q} onChange={e => setQ(e.target.value)} placeholder="Что ищем? диван, кастрюля, сноуборд…" data-testid="bz-search"/>
          <button type="button" className="bz-btn acc" onClick={() => fileRef.current?.click()} data-testid="bz-import">＋ Принести прайс-лист (HTML)</button>
          <input ref={fileRef} type="file" accept=".html,.htm,.json,text/html,application/json" multiple hidden onChange={e => e.target.files && void take(e.target.files)}/></div>
        {err && <p className="bz-warnbox">{err}</p>}
        {q.trim() ? <div className="bz-results" data-testid="bz-results">
          {found.length ? found.map(i => <ItemRow key={i.stall + i.id} i={i} onBuy={() => { const o = bazaar.order(i.stall, [{id: i.id, qty: 1}]); setOrderId(o.id); setOpen(i.stall); }}/>) : <p className="bz-note">В ваших лавках «{q}» нет.</p>}
          <div className="bz-elsewhere"><b>Где ещё искать «{q}»:</b>
            {CONNECTORS.filter(c => c.status !== 'ready').map(c => <span key={c.id}>{c.title} — {STATUS_RU[c.status]}</span>)}
            <small>Скажите агенту: «найди {q} в магазинах (Shopify/UCP, MCP) и положи в Базар» — он принесёт каталог лавкой (bazaar.stall.add), а оплату выберете вы.</small></div>
        </div> : st.stalls.length ? <div className="bz-stalls">{st.stalls.map(s => <StallCard key={s.key} s={s} onOpen={() => setOpen(s.key)}/>)}</div>
          : <div className="bz-empty" data-testid="bz-empty"><b>🏪 Базар пуст</b><p>Вам прислали прайс-лист из «Моего магазина»? Перетащите HTML-файл сюда — он станет лавкой и останется в памяти. Каталоги сервисов (Shopify и др.) приносит агент — см. «Подключения».</p></div>}
      </>)}
      {tab === 'orders' && <div className="bz-sec" data-testid="bz-orders"><h2>Мои покупки</h2>
        {st.orders.length ? st.orders.slice().reverse().map(o => <div key={o.id} className="bz-ord-row"><button type="button" className="bz-link" onClick={() => { setOpen(o.stall); setOrderId(o.id); setTab('stalls'); }}>#{o.code} · {o.stallName}</button>
          <span>{o.items.map(i => i.title).join(', ').slice(0, 80)}</span><b>{o.groups.reduce((a, g) => a + Number(g.total), 0)} USDC</b><span>{orderPaid(o) ? '✓ оплачено' : 'ждёт оплаты'}</span><small>{new Date(o.created).toLocaleString()}</small></div>) : <p className="bz-note">Пока ничего.</p>}</div>}
      {tab === 'online' && <OnlineShops onFiles={() => { setTab('stalls'); setOpen(null); }}/>}
      {tab === 'connect' && <Connections/>}
      {tab === 'agent' && <AgentLimits/>}
    </div>
  </div>;
}
export default BazaarRoom;
