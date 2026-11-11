// Room "My shop": see example storefronts, build your own with a tutorial, watch the money arrive,
// pack the whole site into one HTML file and send it in a messenger.
import {useEffect, useMemo, useRef, useState} from 'react';
import {TEMPLATES, THEMES, theme as mkTheme, normPrice, AGENT_PROMPT, type ShopConfig, type Section, type Cell, type Img} from './model';
import {shop, useShop, kv} from './store';
import {previewHtml, packFile, packSite, compressImage, fileName} from './export';
import {head, balance, transfers, blockAt, fmt, fmt6, codeOf, txUrl, addrUrl, CONFIRMATIONS, type Transfer} from './chain';
import {checkAddress} from '../billing/evm';
import {downloadBlob, shareFile} from '../billing/share';
import {communication} from '../communication/store';
import {usePlan, PLANS} from '../billing/plan';
import {SUNRISE_CREDIT, SUNRISE_URL} from './model';
import {missing} from './recipes';
import {AdminPanel, adminNav} from './AdminPanel';
import './shop.css';

type Edit = {kind: 'brand' | 'hero' | 'section' | 'cell' | 'theme' | 'payment' | 'contact' | 'sections'; sectionId?: string; cellId?: string} | null;
const STEPS = [
  {t: 'Баннер', d: 'Поставьте свою картинку на первый раздел — это лицо магазина.'},
  {t: 'Свой сервис', d: 'Назовите раздел так, как вы называете своё дело: «Серьги», «Уроки», «Машина».'},
  {t: 'Свой товар', d: 'Добавьте ячейку: фото, название, цена в USDC. Это то, что можно купить.'},
  {t: 'EVM-адрес', d: 'Куда приходят деньги: ваш публичный адрес (Coinbase Wallet, MetaMask…). Сеть Base, монета USDC.'},
  {t: 'Упаковать', d: 'Один HTML-файл: отправьте в мессенджер — человек откроет и увидит магазин, даже без интернета.'},
];
const PRESET_NOTES: Record<string, string> = {
  bakuriani: 'Услуги на курорте: баннеры с фото, цены в USDC, корзина и оплата по QR. Это ваша лаборатория, превращённая в шаблон.',
  jewelry: 'Украшения: у каждого изделия своё место — где посмотреть или забрать, ссылка открывает карту.',
  market: 'Несколько продавцов на одной странице: у каждой вещи свой продавец и свой EVM-адрес. Корзина делится на отдельные QR.',
  clothes: 'Одежда: размеры в тегах, наборы, обмен — простой каталог.',
  services: 'Услуги мастера: цена за м² или за штуку, портфолио, порядок работы.',
  car: 'Одна вещь: всё о машине и задаток за бронь через QR.',
  blank: 'Пустой скелет: О магазине / Каталог / Доставка.',
};
const ICONS = ['✳', '💎', '👕', '🚲', '☕', '🎁', '🛠', '🚗', '🏂', '📦', '🍰', '📚', '💐', '🎨', '🧵', '🐾'];

// ---------- live preview in an iframe (same code as the exported file) ----------
function Preview({cfg, mode, device, onEdit, frameRef}: {cfg: ShopConfig; mode: 'edit' | 'gallery'; device: 'desktop' | 'phone'; onEdit?: (e: any) => void; frameRef?: React.MutableRefObject<HTMLIFrameElement | null>}) {
  const ref = useRef<HTMLIFrameElement | null>(null); const [doc, setDoc] = useState('');
  const first = useRef(true); const shopId = cfg.id;
  // Full reload only when another shop is shown; edits are pushed in without losing the scroll.
  useEffect(() => { first.current = true; void previewHtml(cfg, mode).then(setDoc); }, [shopId, mode]);
  useEffect(() => { if (first.current) { first.current = false; return; } void previewHtml(cfg, mode).then(h => { const j = h.match(/id="shop-data">([\s\S]*?)<\/script>/); if (j) ref.current?.contentWindow?.postMessage({source: 'sunrise-portal', type: 'config', config: JSON.parse(j[1].replace(/<\\\//g, '</'))}, '*'); }); }, [cfg]);
  useEffect(() => { const f = (e: MessageEvent) => { if (e.source === ref.current?.contentWindow && e.data?.source === 'sunrise-shop' && e.data.type === 'shop:edit') onEdit?.(e.data.target); }; window.addEventListener('message', f); return () => window.removeEventListener('message', f); }, [onEdit]);
  return <div className={'sh-frame sh-' + device}><iframe ref={r => { ref.current = r; if (frameRef) frameRef.current = r; }} title="Витрина" srcDoc={doc} data-testid="shop-preview"/></div>;
}

// ---------- small form pieces ----------
export const T = ({label, v, set, ph, area, max = 200}: {label: string; v: string; set: (v: string) => void; ph?: string; area?: boolean; max?: number}) =>
  <label className="sh-f"><span>{label}</span>{area ? <textarea rows={2} value={v} maxLength={max} placeholder={ph} onChange={e => set(e.target.value)}/> : <input value={v} maxLength={max} placeholder={ph} onChange={e => set(e.target.value)}/>}</label>;
export function ImgPick({img, set, label, edge = 1600, testid}: {img: Img; set: (i: Img) => void; label: string; edge?: number; testid?: string}) {
  const [busy, setBusy] = useState(false);
  const pick = async (f?: File | null) => { if (!f) return; setBusy(true); try { set({src: await compressImage(f, edge), pos: 'center'}); } finally { setBusy(false); } };
  return <div className="sh-img" onDragOver={e => { e.preventDefault(); e.stopPropagation(); }} onDrop={e => { e.preventDefault(); e.stopPropagation(); void pick(e.dataTransfer.files[0]); }}>
    <div className="sh-img-p" style={img?.src ? {backgroundImage: `url("${img.src.startsWith('data:') || img.src.startsWith('http') ? img.src : new URL(img.src, document.baseURI).href}")`, backgroundPosition: img.pos || 'center'} : {}}>{!img?.src && '🖼'}</div>
    <div className="sh-img-a"><b>{label}</b><label className="sh-btn">{busy ? '…' : img?.src ? 'Заменить' : 'Загрузить'}<input type="file" accept="image/*" hidden data-testid={testid} onChange={e => void pick(e.target.files?.[0])}/></label>
      {img?.src && <><select value={img.pos || 'center'} onChange={e => set({...img, pos: e.target.value})} aria-label="Фокус"><option value="center">центр</option><option value="30% 50%">левее</option><option value="70% 50%">правее</option><option value="50% 25%">выше</option><option value="50% 75%">ниже</option></select><button type="button" className="sh-link" onClick={() => set(null)}>убрать</button></>}
      <small>или перетащите сюда</small></div></div>;
}

// Pick one of the admin's wallets (or type an address by hand).
function WalletPick({value, set, label, testid}: {value: string | null; set: (a: string | null) => void; label: string; testid?: string}) {
  useShop(); const ws = shop.wallets(); const known = value ? ws.find(w => w.address.toLowerCase() === value.toLowerCase()) : null;
  if (!ws.length) return null;
  return <label className="sh-f"><span>{label}</span><select data-testid={testid} value={known ? known.id : value ? '_custom' : ''} onChange={e => { const w = ws.find(x => x.id === e.target.value); if (w) set(w.address); else if (!e.target.value) set(null); }}>
    <option value="">— не выбран —</option>{ws.map(w => <option key={w.id} value={w.id}>{w.label}{w.isDefault ? ' ★' : ''} · {w.address.slice(0, 6)}…{w.address.slice(-4)}</option>)}{value && !known && <option value="_custom">свой адрес {value.slice(0, 6)}…</option>}
  </select></label>;
}

function CellForm({s, c, cfg}: {s: Section; c: Cell; cfg: ShopConfig}) {
  const set = (p: Partial<Cell>) => shop.patchCell(s.id, c.id, p);
  const [price, setPrice] = useState(c.price || ''); useEffect(() => setPrice(c.price || ''), [c.id]);
  const rc = c.receiver ? checkAddress(c.receiver) : null;
  return <div className="sh-cell" data-testid="shop-cell-form">
    <ImgPick img={c.image} set={i => set({image: i})} label="Фото" edge={1000} testid="shop-cell-photo"/>
    {!c.image?.src && <div className="sh-icons"><span>или значок:</span>{ICONS.map(i => <button type="button" key={i} aria-pressed={c.icon === i} onClick={() => set({icon: i})}>{i}</button>)}</div>}
    <T label="Название" v={c.title} set={v => set({title: v})} max={80}/>
    <T label="Описание" v={c.text} set={v => set({text: v})} area max={300}/>
    <div className="sh-row2">
      <label className="sh-f"><span>Цена, USDC (пусто — не продаётся)</span><input data-testid="shop-cell-price" inputMode="decimal" value={price} placeholder="например 25" onChange={e => setPrice(e.target.value)} onBlur={() => { const n = normPrice(price); set({price: n}); setPrice(n || ''); }}/></label>
      <T label="За что (шт, день, м²)" v={c.unit || ''} set={v => set({unit: v})} max={20}/>
    </div>
    {price && !normPrice(price) && <small className="sh-bad">Цена: число больше нуля, до 6 знаков после точки</small>}
    {cfg.payment.orderTag && c.price && /\.\d{3,}$/.test(c.price) && <small className="sh-bad">Для номера заказа в сумме цена должна быть не точнее центов (2 знака).</small>}
    <T label="Теги через запятую (первый — на фото)" v={c.tags.join(', ')} set={v => set({tags: v.split(',').map(x => x.trim().toUpperCase()).filter(Boolean).slice(0, 5)})}/>
    <T label="📍 Место: где посмотреть или забрать (откроет карту)" v={c.place || ''} set={v => set({place: v})} ph="Шоурум, ул. Чавчавадзе 37"/>
    {cfg.payment.mode === 'individual' && <>
      <T label="🙋 Продавец" v={c.seller || ''} set={v => set({seller: v})} ph="Ника"/>
      <WalletPick value={c.receiver || null} set={a => set({receiver: a})} label="💳 Кошелёк из админки" testid="shop-cell-wallet"/>
      <label className="sh-f"><span>💳 EVM-адрес этого продавца</span><input className={c.receiver ? (rc?.ok ? 'ok' : 'bad') : ''} value={c.receiver || ''} placeholder="0x…" spellCheck={false} onChange={e => set({receiver: e.target.value.trim() || null})}/></label>
      {c.receiver && !rc?.ok && <small className="sh-bad">Адрес с ошибкой — покупатель не сможет оплатить</small>}</>}
    <div className="sh-row"><button type="button" className="sh-btn" onClick={() => shop.moveCell(s.id, c.id, -1)}>↑</button><button type="button" className="sh-btn" onClick={() => shop.moveCell(s.id, c.id, 1)}>↓</button>
      <label className="sh-check"><input type="checkbox" checked={!!c.hidden} onChange={e => set({hidden: e.target.checked})}/> скрыть</label>
      <button type="button" className="sh-link sh-danger" onClick={() => shop.removeCell(s.id, c.id)}>удалить ячейку</button></div>
  </div>;
}

function SectionForm({s, cfg, focusCell, setEdit}: {s: Section; cfg: ShopConfig; focusCell?: string; setEdit: (e: Edit) => void}) {
  const set = (p: Partial<Section>) => shop.patchSection(s.id, p);
  return <div data-testid="shop-section-form">
    <ImgPick img={s.banner} set={i => set({banner: i})} label="Баннер раздела" testid="shop-banner"/>
    <div className="sh-row2"><T label="Вкладка" v={s.tab} set={v => set({tab: v})} max={30}/><T label="Над заголовком" v={s.kicker} set={v => set({kicker: v})} max={40}/></div>
    <T label="Заголовок баннера" v={s.title} set={v => set({title: v})} max={80}/>
    <T label="Текст" v={s.text} set={v => set({text: v})} area max={260}/>
    <div className="sh-row2"><T label="Кнопка" v={s.cta || ''} set={v => set({cta: v})} max={24}/><T label="Подпись справа" v={s.side} set={v => set({side: v})} max={40}/></div>
    <h5>Ячейки · {s.cells.length}</h5>
    <div className="sh-cells">{s.cells.map(c => <button type="button" key={c.id} aria-pressed={focusCell === c.id} onClick={() => setEdit({kind: 'cell', sectionId: s.id, cellId: c.id})}>{c.icon || (c.image ? '🖼' : '▫')} {c.title}{c.price ? <em> · {c.price}</em> : ''}</button>)}
      <button type="button" className="sh-add" data-testid="shop-add-cell" onClick={() => { const c = shop.addCell(s.id); setEdit({kind: 'cell', sectionId: s.id, cellId: c.id}); }}>＋ ячейка</button></div>
    <div className="sh-row" style={{marginTop: 10}}><button type="button" className="sh-btn" onClick={() => shop.moveSection(s.id, -1)}>← раньше</button><button type="button" className="sh-btn" onClick={() => shop.moveSection(s.id, 1)}>позже →</button>
      <button type="button" className="sh-link sh-danger" disabled={cfg.sections.length <= 1} onClick={() => { shop.removeSection(s.id); setEdit({kind: 'sections'}); }}>удалить раздел</button></div>
  </div>;
}

function PaymentForm({cfg}: {cfg: ShopConfig}) {
  const p = cfg.payment; const [addr, setAddr] = useState(p.address || ''); const chk = addr ? checkAddress(addr) : null;
  const save = async () => {
    if (!chk?.ok) return; const old = p.address; if (old?.toLowerCase() === chk.address.toLowerCase()) return;
    shop.patch('payment', {address: chk.address});
    let b: number | null = null; try { b = await head(); } catch { /* offline: history starts from the time */ }
    if (old) shop.logReceiver(old, 'Общий адрес', 'ejected', b);
    shop.logReceiver(chk.address, 'Общий адрес', 'injected', b);
  };
  const pick = async (a: string | null) => { if (!a) return; const old = p.address; if (old?.toLowerCase() === a.toLowerCase()) return; setAddr(a); shop.patch('payment', {address: a}); let b: number | null = null; try { b = await head(); } catch { /* */ } if (old) shop.logReceiver(old, 'Общий адрес', 'ejected', b); shop.logReceiver(a, shop.walletLabel(a) || 'Общий адрес', 'injected', b); };
  useEffect(() => setAddr(p.address || ''), [p.address]);
  return <div data-testid="shop-payment-form">
    <div className="sh-seg"><button type="button" aria-pressed={p.mode === 'shared'} onClick={() => shop.patch('payment', {mode: 'shared'})}>Один адрес на всё</button><button type="button" aria-pressed={p.mode === 'individual'} onClick={() => shop.patch('payment', {mode: 'individual'})}>Свой адрес у каждой ячейки</button></div>
    <WalletPick value={p.address} set={a => void pick(a)} label={p.mode === 'shared' ? 'Кошелёк из админки' : 'Запасной кошелёк из админки'} testid="shop-payment-wallet"/>
    <label className="sh-f"><span>{p.mode === 'shared' ? 'Ваш EVM-адрес (сеть Base, USDC)' : 'Запасной адрес (для ячеек без своего)'}</span>
      <input data-testid="shop-evm" className={addr ? (chk?.ok ? 'ok' : 'bad') : ''} value={addr} spellCheck={false} placeholder="0x…" onChange={e => setAddr(e.target.value.trim())} onBlur={save}/></label>
    {addr && <small className={chk?.ok ? 'sh-ok' : 'sh-bad'} data-testid="shop-evm-check">{chk?.ok ? '✓ Адрес верный' + (p.address?.toLowerCase() === chk.address.toLowerCase() ? ' и сохранён' : ' — нажмите «Сохранить»') : (chk as any).reason === 'checksum' ? '✗ Похоже на опечатку (контрольная сумма)' : '✗ Нужен адрес 0x и 40 символов'}</small>}
    <button type="button" className="sh-primary" disabled={!chk?.ok} data-testid="shop-evm-save" onClick={() => void save()}>Сохранить адрес</button>
    <label className="sh-check"><input type="checkbox" checked={p.orderTag} onChange={e => shop.patch('payment', {orderTag: e.target.checked})}/> Номер заказа в последних цифрах суммы (12.004817 → заказ 4817) — так вы узнаете, кто заплатил</label>
    <T label="Подсказка покупателю" v={p.note} set={v => shop.patch('payment', {note: v})} area max={240}/>
    <p className="sh-note">Портал не хранит ключи и деньги. Покупатель платит прямо на этот адрес; кабинет видит поступления через публичные RPC-ноды Base. Сначала проверьте магазин маленькой суммой.</p>
  </div>;
}

// ---------- owner's cabinet: money in ----------
type Acct = Record<string, {from: number; scannedTo: number; list: (Omit<Transfer, 'amount'> & {amount: string})[]; balance?: string; at?: number}>;
export function Cabinet({cfg}: {cfg: ShopConfig}) {
  const st = useShop(); const addrs = shop.addresses();
  const [acct, setAcct] = useState<Acct>({}); const [busy, setBusy] = useState(''); const [err, setErr] = useState('');
  const accRef = useRef<Acct>({});
  const reload = () => void kv.get<Acct>('acct').then(a => { if (a) { accRef.current = a; setAcct(a); } });
  useEffect(() => { reload(); window.addEventListener('shop:acct', reload); return () => window.removeEventListener('shop:acct', reload); }, []);
  const save = (a: Acct) => { accRef.current = a; setAcct(a); void kv.set('acct', a); };
  const refresh = async (address: string) => {
    setBusy(address); setErr('');
    try {
      const h = await head(); const acct = accRef.current; const cur = acct[address];
      const injected = st.receivers.filter(r => r.address === address && r.event === 'injected').map(r => r.block).filter(Boolean) as number[];
      const from = cur?.from ?? (injected.length ? Math.min(...injected) : await blockAt(Date.now() - 7 * 864e5, h));
      const r = await transfers(address, Math.max(from, (cur?.scannedTo ?? from - 1) + 1), h - 1, 25);
      const seen = new Set((cur?.list || []).map(t => t.tx + ':' + t.log));
      const list = [...(cur?.list || []), ...r.list.filter(t => !seen.has(t.tx + ':' + t.log)).map(t => ({...t, amount: t.amount.toString()}))];
      const bal = await balance(address);
      save({...acct, [address]: {from, scannedTo: r.scannedTo, list, balance: bal.toString(), at: Date.now()}});
      if (r.scannedTo < h - 1) setErr('История догружается: нажмите «Обновить» ещё раз.');
    } catch { setErr('Нет связи с сетью Base. Проверьте интернет.'); }
    setBusy('');
  };
  if (!addrs.length) return <div className="sh-empty"><h3>Касса появится, когда будет адрес</h3><p>Добавьте EVM-адрес в «Оплата» — здесь будут видны деньги, которые пришли, и номера заказов.</p></div>;
  const tot = addrs.reduce((o, {address}) => { const a = acct[address]; if (!a) return o; o.in += a.list.reduce((x, t) => x + BigInt(t.amount), 0n); o.n += a.list.length; o.bal += a.balance ? BigInt(a.balance) : 0n; o.done += a.list.filter(t => st.fulfil[t.tx]?.done).length; return o; }, {in: 0n, n: 0, bal: 0n, done: 0});
  const all = async () => { for (const {address} of addrs) await refresh(address); };
  return <div className="sh-cab" data-testid="shop-cabinet">
    <div className="sh-total" data-testid="shop-total"><span><small>Пришло всего</small><b data-testid="shop-total-in">{fmt(tot.in)} USDC</b></span><span><small>Платежей</small><b>{tot.n}</b></span><span><small>Выдано</small><b>{tot.done} из {tot.n}</b></span><span><small>На кошельках сейчас</small><b>{fmt(tot.bal)} USDC</b></span>
      <button type="button" className="sh-primary" disabled={!!busy} data-testid="shop-refresh-all" onClick={() => void all()}>{busy ? 'Читаю сеть…' : `⟳ Обновить все (${addrs.length})`}</button></div>
    {err && <p className="sh-warnbox">{err}</p>}
    {addrs.map(({address, label}) => { const a = acct[address]; const list = (a?.list || []).slice().sort((x, y) => y.block - x.block); const sum = list.reduce((s, t) => s + BigInt(t.amount), 0n);
      return <section key={address} className="sh-acct">
        <header><div><b>{label}</b><a href={addrUrl(address)} target="_blank" rel="noreferrer"><code>{address.slice(0, 8)}…{address.slice(-6)}</code></a></div>
          <div className="sh-kpis"><span><small>Баланс сейчас</small><b data-testid="shop-balance">{a?.balance ? fmt(BigInt(a.balance)) : '—'} USDC</b></span><span><small>Пришло за период</small><b data-testid="shop-incoming">{fmt(sum)} USDC · {list.length}</b></span></div>
          <button type="button" className="sh-primary" disabled={!!busy} data-testid="shop-refresh" onClick={() => void refresh(address)}>{busy === address ? 'Читаю сеть…' : '⟳ Обновить'}</button></header>
        {list.length ? <table className="sh-tx"><thead><tr><th>Блок</th><th>От кого</th><th>Сумма</th><th>Заказ</th><th>Выдано</th></tr></thead><tbody>
          {list.map(t => { const f = st.fulfil[t.tx]; const code = codeOf(BigInt(t.amount)); return <tr key={t.tx + t.log} data-testid="shop-tx">
            <td><a href={txUrl(t.tx)} target="_blank" rel="noreferrer">{t.block}</a></td><td><code>{t.from.slice(0, 6)}…{t.from.slice(-4)}</code></td><td><b>{cfg.payment.orderTag ? fmt6(BigInt(t.amount)) : fmt(BigInt(t.amount))}</b></td>
            <td>{cfg.payment.orderTag && code ? <span className="sh-code">#{String(code).padStart(4, '0')}</span> : <span title="Сумма без номера заказа: кошелёк или биржа округлили до центов. Сверьте по хешу из сообщения покупателя.">без номера</span>}</td>
            <td><label className="sh-check"><input type="checkbox" checked={!!f?.done} onChange={e => shop.fulfil(t.tx, e.target.checked)}/> {f?.done ? 'да' : ''}</label></td></tr>; })}</tbody></table>
          : <p className="sh-note">{a ? 'Поступлений с момента подключения адреса нет.' : 'Нажмите «Обновить», чтобы прочитать поступления.'}</p>}
        {a && <p className="sh-note">Проверено до блока {a.scannedTo} · {new Date(a.at || 0).toLocaleString()} · подтверждение ≈ {CONFIRMATIONS} блоков Base. Баланс и «пришло» — разные числа: деньги могли выводиться.</p>}
      </section>; })}
    {st.receivers.length > 0 && <details className="sh-hist"><summary>История адресов · {st.receivers.length}</summary>{st.receivers.slice().reverse().map((r, i) => <div key={i}><b>{r.event === 'injected' ? '⇣ поставлен' : '⇡ снят'}</b> <code>{r.address.slice(0, 8)}…{r.address.slice(-6)}</code> {r.label} · {new Date(r.at).toLocaleString()}{r.block ? ` · блок ${r.block}` : ''}</div>)}</details>}
  </div>;
}

// ---------- pack & send ----------
function Pack({cfg}: {cfg: ShopConfig}) {
  const [info, setInfo] = useState<{size: number} | null>(null); const [flash, setFlash] = useState('');
  useEffect(() => { void packFile(cfg).then(r => setInfo({size: r.size})); }, [cfg]);
  const addrs = shop.addresses(); const priced = cfg.sections.flatMap(s => s.cells).filter(c => c.price && !c.hidden);
  const noAddr = priced.filter(c => !(cfg.payment.mode === 'individual' ? c.receiver || cfg.payment.address : cfg.payment.address));
  const act = async (fn: () => Promise<unknown>, ok: string) => { try { await fn(); setFlash(ok); } catch (e) { setFlash('⚠ ' + String((e as Error).message)); } setTimeout(() => setFlash(''), 2600); };
  const mb = (n: number) => (n / 1048576).toFixed(n > 1048576 ? 1 : 2) + ' МБ';
  return <div className="sh-pack" data-testid="shop-pack">
    <h3>Магазин в одном файле</h3>
    <p>Файл <b>{fileName(cfg)}</b>{info ? ` · ${mb(info.size)}` : ''}. Внутри: все фото, тексты, корзина и оплата. Кабинета владельца внутри нет. Открывается в любом браузере, в том числе без интернета; для оплаты и проверки платежа интернет нужен.</p>
    <ul className="sh-checklist">
      <li className={addrs.length ? 'ok' : 'bad'}>{addrs.length ? `✓ Адресов для оплаты: ${addrs.length}` : '✗ Нет EVM-адреса — покупатели не смогут заплатить'}</li>
      <li className={noAddr.length ? 'bad' : 'ok'}>{noAddr.length ? `✗ Без адреса: ${noAddr.map(c => c.title).slice(0, 3).join(', ')}` : `✓ Товаров с ценой: ${priced.length}`}</li>
      {info && <li className={info.size > 15e6 ? 'bad' : 'ok'}>{info.size > 15e6 ? '✗ Файл тяжёлый для мессенджеров — уменьшите фото' : '✓ Размер подходит для мессенджеров'}</li>}
    </ul>
    <div className="sh-row">
      <button type="button" className="sh-primary" data-testid="shop-download" onClick={() => act(async () => { const r = await packFile(cfg); downloadBlob(r.blob, r.name); }, 'Файл скачан')}>⬇ Скачать файл магазина</button>
      <button type="button" className="sh-btn" onClick={() => act(async () => { const r = await packFile(cfg); await shareFile(r.blob, r.name, cfg.brand.name); }, 'Готово')}>↗ Отправить в мессенджер</button>
      <button type="button" className="sh-btn" data-testid="shop-open-as-buyer" onClick={() => act(async () => { const r = await packFile(cfg); window.open(URL.createObjectURL(r.blob), '_blank'); }, 'Открыто в новой вкладке')}>👁 Открыть как покупатель</button>
    </div>
    {shop.sites().length > 1 && <><h4>Мои сайты</h4><div className="sh-sites" data-testid="shop-sites">{shop.sites().map(x => <button type="button" key={x.id} aria-pressed={x.current} disabled={x.current} onClick={() => shop.switchTo(x.id)}>{x.current ? '● ' : ''}{x.name}<small>{new Date(x.updatedAt).toLocaleDateString()}</small></button>)}</div></>}
    <h4>Задеплоить, когда вырастете</h4>
    <p className="sh-note">Тот же файл — это готовый сайт. Скачайте папку с index.html и перетащите в Netlify Drop, Cloudflare Pages или GitHub Pages — получите ссылку. Портал сам никуда не публикует.</p>
    <button type="button" className="sh-btn" data-testid="shop-site-zip" onClick={() => act(async () => { const r = await packSite(cfg); downloadBlob(r.blob, r.name); }, 'Папка сайта скачана')}>🌐 Папка для хостинга (.zip)</button>
    {flash && <div className="sh-flash" role="status">{flash}</div>}
  </div>;
}

// ---------- footer credit: free = Native Clouds mark, paid = own logo ----------
function CreditForm({cfg}: {cfg: ShopConfig}) {
  const pl = usePlan(); const c = cfg.credit || SUNRISE_CREDIT; const paid = pl.brandedDocs;
  const set = (p: Partial<NonNullable<ShopConfig['credit']>>) => shop.set({credit: {...c, ...p}});
  return <div className="sh-credit" data-testid="shop-credit">
    <h5>Знак внизу сайта · тариф «{pl.ru}»</h5>
    {!paid ? <p className="sh-note">На бесплатном тарифе внизу всегда стоит знак <b>☁ Native Clouds · Sunrise</b> со ссылкой на <a href={SUNRISE_URL} target="_blank" rel="noreferrer">sunspace.club</a>. На {PLANS.pro.ru} ({PLANS.pro.price}) можно поставить своё лого или убрать знак.</p>
      : <><div className="sh-seg"><button type="button" aria-pressed={c.mode === 'sunrise'} onClick={() => set({mode: 'sunrise'})}>Native Clouds</button><button type="button" aria-pressed={c.mode === 'own'} onClick={() => set({mode: 'own', text: c.mode === 'own' ? c.text : cfg.brand.name, url: c.mode === 'own' ? c.url : ''})}>Своё лого</button><button type="button" aria-pressed={c.mode === 'none'} onClick={() => set({mode: 'none'})}>Без знака</button></div>
        {c.mode === 'own' && <><ImgPick img={c.logo} set={i => set({logo: i})} label="Ваше лого" edge={200}/><T label="Подпись" v={c.text} set={v => set({text: v})} max={50}/><T label="Ссылка" v={c.url} set={v => set({url: v})} ph="https://…" max={200}/></>}</>}
  </div>;
}

// ---------- what is still missing (same list the agent gets from shop.missing) ----------
function Missing({cfg, setEdit}: {cfg: ShopConfig; setEdit: (e: Edit) => void}) {
  const m = missing(cfg, shop.addresses().length); if (!m.length) return <div className="sh-ready" data-testid="shop-ready">✓ Всё главное на месте — можно упаковывать.</div>;
  const sec = cfg.sections[0]; const noPhoto = sec.cells.filter(c => !c.image?.src).slice(0, 6);
  return <div className="sh-missing" data-testid="shop-missing"><b>Осталось ({m.length}):</b>
    {m.map(x => <div key={x.id} className="sh-miss">
      <span>{x.ask}</span>
      {x.id === 'photos' && <div className="sh-miss-photos">{noPhoto.map(c => <ImgPick key={c.id} img={c.image} set={i => shop.patchCell(sec.id, c.id, {image: i})} label={c.title} edge={1000}/>)}</div>}
      {x.id === 'banner' && <ImgPick img={sec.banner} set={i => shop.patchSection(sec.id, {banner: i})} label="Баннер"/>}
      {x.id === 'address' && <button type="button" className="sh-btn" onClick={() => setEdit({kind: 'payment'})}>Указать адрес</button>}
      {x.id === 'contact' && <button type="button" className="sh-btn" onClick={() => setEdit({kind: 'contact'})}>Указать контакт</button>}
      {x.id === 'prices' && <button type="button" className="sh-btn" onClick={() => setEdit({kind: 'section', sectionId: sec.id})}>Открыть позиции</button>}
    </div>)}</div>;
}

// ---------- the room ----------
function PlanChip({onBrand}: {onBrand: () => void}) { const pl = usePlan(); return <button type="button" className={'sh-plan' + (pl.brandedDocs ? ' paid' : '')} data-testid="shop-plan" onClick={onBrand} title="Знак внизу сайта">{pl.brandedDocs ? `★ ${pl.ru}: своё лого` : '☁ Бесплатно: знак Native Clouds'}</button>; }
export function ShopRoom({onClose}: {onClose: () => void}) {
  const st = useShop(); const cfg = st.shop;
  const [preset, setPreset] = useState<string>('bakuriani');
  const gallery = useMemo(() => TEMPLATES[preset].make(), [preset]);
  const [tab, setTab] = useState<'build' | 'cash' | 'pack'>('build');
  const [view, setView] = useState<'admin' | 'presets' | 'site'>(() => location.hash.includes('preset') ? 'presets' : 'admin');
  const [edit, setEdit] = useState<Edit>(null); const [device, setDevice] = useState<'desktop' | 'phone'>('desktop');
  const frame = useRef<HTMLIFrameElement | null>(null);
  useEffect(() => { void shop.load(); }, []);
  useEffect(() => { const f = (e: any) => { (window as any).__shopUiPending = null; if (e.detail?.admin) adminNav.sub = e.detail.admin; if (e.detail?.tab) setTab(e.detail.tab); if (e.detail?.edit !== undefined) setEdit(e.detail.edit); if (e.detail?.preset) { setPreset(e.detail.preset); setView('presets'); } if (e.detail?.view) setView(e.detail.view); if (e.detail?.tab || e.detail?.edit !== undefined) setView('site'); if (e.detail?.admin) setView('admin'); }; window.addEventListener('shop:ui', f); const pend = (window as any).__shopUiPending; if (pend) f({detail: pend}); return () => window.removeEventListener('shop:ui', f); }, []);
  const building = view === 'site' && !!cfg;
  useEffect(() => { if (building && !st.started) shop.resume(); }, [building]);
  const buildFrom = (k: string) => { shop.start(k); setEdit(null); setTab('build'); setView('site'); };
  const onEdit = (t: any) => { if (t.kind === 'add-cell') { const c = shop.addCell(t.sectionId); setEdit({kind: 'cell', sectionId: t.sectionId, cellId: c.id}); } else setEdit(t); };
  const selectSection = (i: number) => frame.current?.contentWindow?.postMessage({source: 'sunrise-portal', type: 'section', index: i}, '*');
  const step = st.step; const s0 = cfg?.sections[0];
  const done = cfg ? [
    !!s0?.banner?.src?.startsWith('data:'),
    cfg.sections.some(s => !Object.values(TEMPLATES).some(t => t.make().sections.some(x => x.tab === s.tab))),
    cfg.sections.some(s => s.cells.some(c => c.image?.src?.startsWith('data:') && c.price)),
    shop.addresses().length > 0,
    false,
  ] : [];
  const curSection = edit?.sectionId ? cfg?.sections.find(s => s.id === edit.sectionId) : null;
  const curCell = curSection && edit?.cellId ? curSection.cells.find(c => c.id === edit.cellId) : null;

  const panel = () => {
    if (!cfg) return null;
    // Tutorial steps show exactly the form they talk about.
    if (!edit) {
      const s = cfg.sections[0];
      return <div className="sh-step" data-testid="shop-tutorial">
        <span className="sh-step-n">Шаг {step + 1} из {STEPS.length}</span><h3>{STEPS[step].t}</h3><p>{STEPS[step].d}</p>
        {step === 0 && s && <ImgPick img={s.banner} set={i => shop.patchSection(s.id, {banner: i})} label="Баннер первого раздела" testid="shop-banner"/>}
        {step === 1 && <>{cfg.sections.map((x, i) => <div key={x.id} className="sh-row2"><T label={`Раздел ${i + 1}: вкладка`} v={x.tab} set={v => shop.patchSection(x.id, {tab: v})} max={30}/><T label="Заголовок" v={x.title} set={v => shop.patchSection(x.id, {title: v})} max={80}/></div>)}
          <button type="button" className="sh-btn" data-testid="shop-add-section" onClick={() => { const n = shop.addSection({tab: 'Мой сервис', title: 'Что я делаю.'}); selectSection(cfg.sections.length); setEdit({kind: 'section', sectionId: n.id}); }}>＋ Добавить раздел</button></>}
        {step === 2 && <>{(() => { const sec = cfg.sections.find(x => x.cells.some(c => c.price)) || cfg.sections[0]; return <><p className="sh-note">Раздел «{sec.tab}». Нажмите на ячейку или добавьте новую:</p>
          <div className="sh-cells">{sec.cells.map(c => <button type="button" key={c.id} onClick={() => setEdit({kind: 'cell', sectionId: sec.id, cellId: c.id})}>{c.icon || '▫'} {c.title}{c.price ? <em> · {c.price}</em> : ''}</button>)}
            <button type="button" className="sh-add" data-testid="shop-tut-add-cell" onClick={() => { const c = shop.addCell(sec.id, {title: 'Мой товар', price: '10'}); selectSection(cfg.sections.indexOf(sec)); setEdit({kind: 'cell', sectionId: sec.id, cellId: c.id}); }}>＋ товар</button></div></>; })()}</>}
        {step === 3 && <PaymentForm cfg={cfg}/>}
        {step === 4 && <><p className="sh-note">Готово! Магазин можно отправлять.</p><button type="button" className="sh-primary" data-testid="shop-go-pack" onClick={() => setTab('pack')}>📦 Упаковать и отправить</button></>}
        <div className="sh-row sh-step-nav"><button type="button" className="sh-btn" disabled={step === 0} onClick={() => shop.step(step - 1)}>← Назад</button>
          <button type="button" className="sh-primary" data-testid="shop-next" disabled={step === STEPS.length - 1} onClick={() => shop.step(step + 1)}>{done[step] ? 'Дальше →' : 'Пропустить →'}</button></div>
      </div>;
    }
    const back = <button type="button" className="sh-link" onClick={() => setEdit(edit.kind === 'cell' ? {kind: 'section', sectionId: edit.sectionId} : null)}>← {edit.kind === 'cell' ? 'к разделу' : 'к шагам'}</button>;
    if (edit.kind === 'cell' && curSection && curCell) return <div>{back}<h3>Ячейка</h3><CellForm s={curSection} c={curCell} cfg={cfg}/></div>;
    if (edit.kind === 'section' && curSection) return <div>{back}<h3>Раздел «{curSection.tab}»</h3><SectionForm s={curSection} cfg={cfg} focusCell={edit.cellId} setEdit={setEdit}/></div>;
    if (edit.kind === 'sections') return <div>{back}<h3>Разделы</h3>{cfg.sections.map((x, i) => <button type="button" key={x.id} className="sh-listbtn" onClick={() => { selectSection(i); setEdit({kind: 'section', sectionId: x.id}); }}>{String(i + 1).padStart(2, '0')} · {x.tab} <em>{x.cells.length} яч.</em></button>)}
      <button type="button" className="sh-btn" onClick={() => { const n = shop.addSection(); selectSection(cfg.sections.length); setEdit({kind: 'section', sectionId: n.id}); }}>＋ Раздел</button></div>;
    if (edit.kind === 'brand') return <div>{back}<h3>Название и логотип</h3>
      <ImgPick img={cfg.brand.logo} set={i => shop.patch('brand', {logo: i})} label="Логотип (круглый)" edge={300}/>
      <T label="Название магазина" v={cfg.brand.name} set={v => shop.patch('brand', {name: v})} max={60}/><T label="Город / место" v={cfg.brand.place} set={v => shop.patch('brand', {place: v})} max={40}/>
      <div className="sh-row2"><T label="Полоса сверху слева" v={cfg.brand.stripLeft} set={v => shop.patch('brand', {stripLeft: v})} max={60}/><T label="справа" v={cfg.brand.stripRight} set={v => shop.patch('brand', {stripRight: v})} max={60}/></div>
      <div className="sh-row2"><T label="Подвал" v={cfg.footer.text} set={v => shop.patch('footer', {text: v})} max={80}/><T label="Подвал справа" v={cfg.footer.right} set={v => shop.patch('footer', {right: v})} max={60}/></div>
      <CreditForm cfg={cfg}/></div>;
    if (edit.kind === 'hero') return <div>{back}<h3>Главный экран и доска</h3>
      <label className="sh-check"><input type="checkbox" checked={cfg.hero.show} onChange={e => shop.patch('hero', {show: e.target.checked})}/> показывать</label>
      <T label="Надзаголовок" v={cfg.hero.eyebrow} set={v => shop.patch('hero', {eyebrow: v})} max={50}/><T label="Заголовок" v={cfg.hero.title} set={v => shop.patch('hero', {title: v})} max={90}/><T label="Подзаголовок" v={cfg.hero.sub} set={v => shop.patch('hero', {sub: v})} area max={220}/>
      <div className="sh-row2"><T label="Доска: цифра" v={cfg.hero.markTop} set={v => shop.patch('hero', {markTop: v})} max={10}/><T label="Слово" v={cfg.hero.markMain} set={v => shop.patch('hero', {markMain: v})} max={10}/></div>
      <div className="sh-row2"><T label="Курсив" v={cfg.hero.markItalic} set={v => shop.patch('hero', {markItalic: v})} max={12}/><T label="Мелко" v={cfg.hero.markSmall} set={v => shop.patch('hero', {markSmall: v})} max={40}/></div>
      <div className="sh-row2"><T label="Наклейка" v={cfg.hero.sticker} set={v => shop.patch('hero', {sticker: v})} area max={14}/><T label="Справа" v={cfg.hero.sideText} set={v => shop.patch('hero', {sideText: v})} area max={30}/></div>
      <div className="sh-row2"><T label="Над разделами" v={cfg.discover.eyebrow} set={v => shop.patch('discover', {eyebrow: v})} max={40}/><T label="Заголовок разделов" v={cfg.discover.title} set={v => shop.patch('discover', {title: v})} max={40}/></div></div>;
    if (edit.kind === 'theme') return <div>{back}<h3>Цвета и форма</h3>
      <div className="sh-themes">{Object.entries(THEMES).map(([k, t]) => <button type="button" key={k} aria-pressed={cfg.theme.preset === k} onClick={() => shop.set({theme: mkTheme(k, cfg.theme.radius)})}><i style={{background: `linear-gradient(135deg,${t.dark} 50%,${t.accent} 50%)`}}/>{t.ru}</button>)}</div>
      <div className="sh-row2">{(['accent', 'accent2', 'dark', 'paper', 'ink'] as const).map(k => <label key={k} className="sh-f"><span>{({accent: 'Акцент', accent2: 'Второй акцент', dark: 'Тёмный', paper: 'Фон', ink: 'Текст'})[k]}</span><input type="color" value={cfg.theme[k]} onChange={e => shop.set({theme: {...cfg.theme, [k]: e.target.value, preset: 'custom'}})}/></label>)}</div>
      <div className="sh-seg">{(['round', 'soft', 'square'] as const).map(r => <button type="button" key={r} aria-pressed={cfg.theme.radius === r} onClick={() => shop.set({theme: {...cfg.theme, radius: r}})}>{({round: 'Доска', soft: 'Мягко', square: 'Строго'})[r]}</button>)}</div></div>;
    if (edit.kind === 'payment') return <div>{back}<h3>Оплата</h3><PaymentForm cfg={cfg}/></div>;
    if (edit.kind === 'contact') return <div>{back}<h3>Куда писать покупателю</h3><p className="sh-note">Покупатель отправит сюда заказ одной кнопкой.</p>
      <T label="Telegram (имя без @)" v={cfg.contact.telegram || ''} set={v => shop.patch('contact', {telegram: v})} ph="myshop"/><T label="WhatsApp (номер)" v={cfg.contact.whatsapp || ''} set={v => shop.patch('contact', {whatsapp: v})} ph="+995 5xx xx xx xx"/>
      <T label="E-mail" v={cfg.contact.email || ''} set={v => shop.patch('contact', {email: v})}/><T label="Телефон" v={cfg.contact.phone || ''} set={v => shop.patch('contact', {phone: v})}/></div>;
    return null;
  };

  return <div className="shop-room" data-testid="shop-room">
    <header className="sh-top">
      <div className="sh-title"><b>🛍 Мой магазин</b><small>витрина — в конструкторе, данные и деньги — в админке</small></div>
      <div className="sh-seg sh-views" role="tablist">{([['admin', '🔐 Админка'], ['presets', '🧩 Пресеты'], ['site', '✎ Мой сайт']] as const).map(([k, l]) => <button type="button" key={k} data-testid={'shop-view-' + k} aria-pressed={view === k} disabled={k === 'site' && !cfg} onClick={() => setView(k)}>{l}</button>)}</div>
      <PlanChip onBrand={() => { if (cfg) { setView('site'); setTab('build'); setEdit({kind: 'brand'}); } }}/>
      <button type="button" className="sh-x" onClick={onClose} aria-label="Закрыть">×</button>
    </header>
    {view === 'admin' ? <AdminPanel onBuild={buildFrom} onSite={() => { setView('site'); setTab('build'); }} onPresets={() => setView('presets')}/> : <>
    <nav className="sh-presets" aria-label="Примеры магазинов">
      <span className="sh-presets-l">Примеры:</span>
      {Object.entries(TEMPLATES).map(([k, t]) => <button type="button" key={k} data-testid={'shop-preset-' + k} aria-pressed={!building && preset === k} onClick={() => { setPreset(k); setView('presets'); }}><b>{t.icon}</b><span><strong>{t.ru}</strong><small>{t.hint}</small></span></button>)}
      {building ? <button type="button" className="sh-mine" aria-pressed>✎ Мой магазин</button> : cfg ? <button type="button" className="sh-mine" data-testid="shop-continue" onClick={() => setView('site')}>✎ Продолжить мой</button> : null}
    </nav>

    {!building ? <section className="sh-gallery">
      <div className="sh-gallery-bar"><p data-testid="shop-preset-note"><b>{TEMPLATES[preset].icon} {TEMPLATES[preset].ru}.</b> {PRESET_NOTES[preset]}</p>
        <div className="sh-row"><button type="button" className="sh-primary sh-big" data-testid="shop-build" onClick={() => buildFrom(preset)}>Собрать свой на основе этого →</button>
          <button type="button" className="sh-btn" onClick={() => buildFrom('blank')}>с нуля</button>
          {(st.profile.firstName || shop.wallets().length) ? <small className="sh-note" data-testid="shop-admin-hint">Ваши данные и кошелёк «{shop.defaultWallet()?.label || '—'}» подставятся сами</small> : null}
          <div className="sh-seg sh-dev">{(['desktop', 'phone'] as const).map(d => <button type="button" key={d} aria-pressed={device === d} onClick={() => setDevice(d)}>{d === 'desktop' ? '🖥' : '📱'}</button>)}</div></div></div>
      <Preview cfg={gallery} mode="gallery" device={device}/>
    </section> : <section className="sh-build">
      <aside className="sh-side">
        <div className="sh-tabs">{([['build', '✎ Конструктор'], ['cash', '¤ Касса'], ['pack', '📦 Упаковать']] as const).map(([k, l]) => <button type="button" key={k} data-testid={'shop-tab-' + k} aria-pressed={tab === k} onClick={() => setTab(k)}>{l}</button>)}</div>
        {tab === 'build' && <>
          {cfg && <Missing cfg={cfg} setEdit={setEdit}/>}
          <ol className="sh-steps">{STEPS.map((x, i) => <li key={i} className={(i === step && !edit ? 'on ' : '') + (done[i] ? 'done' : '')}><button type="button" onClick={() => { setEdit(null); shop.step(i); }}><b>{done[i] ? '✓' : i + 1}</b>{x.t}</button></li>)}</ol>
          <div className="sh-panel">{panel()}</div>
          <div className="sh-more"><span>Всё остальное:</span>{([['brand', 'Название'], ['hero', 'Главный экран'], ['sections', 'Разделы'], ['theme', 'Цвета'], ['payment', 'Оплата'], ['contact', 'Контакты']] as const).map(([k, l]) => <button type="button" key={k} data-testid={'shop-edit-' + k} onClick={() => setEdit({kind: k})}>{l}</button>)}
            <button type="button" data-testid="shop-apply-admin" onClick={() => shop.applyAdminToCurrent()} title="Контакты, город, логотип и основной кошелёк из админки">👤 Мои данные из админки</button>
            <button type="button" onClick={() => { try { communication.add({text: '🛍 ' + AGENT_PROMPT, role: 'user', contact: 'agent', source: 'Shop', kind: 'info', key: 'shop/agent/' + Date.now()} as any); } catch { /* */ } }}>📱 Агент: распиши мой магазин</button></div>
        </>}
        {tab === 'cash' && cfg && <Cabinet cfg={cfg}/>}
        {tab === 'pack' && cfg && <Pack cfg={cfg}/>}
      </aside>
      <div className="sh-stage"><div className="sh-stage-bar"><span>Так увидит покупатель · нажмите ✎ на витрине, чтобы изменить</span>
        <div className="sh-seg sh-dev">{(['desktop', 'phone'] as const).map(d => <button type="button" key={d} aria-pressed={device === d} onClick={() => setDevice(d)}>{d === 'desktop' ? '🖥' : '📱'}</button>)}</div></div>
        <Preview cfg={cfg!} mode="edit" device={device} onEdit={onEdit} frameRef={frame}/></div>
    </section>}
    </>}
  </div>;
}
