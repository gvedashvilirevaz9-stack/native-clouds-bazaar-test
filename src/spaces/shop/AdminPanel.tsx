// Admin panel = the shop's back office. Front end (the storefront look) is built in the constructor;
// here live the owner's data, wallets, accounting and payment checks. Everything stays in this browser.
import {useEffect, useState} from 'react';
import {shop, useShop, kv, type Wallet} from './store';
import {TEMPLATES} from './model';
import {lookupTx, head, fmt, fmt6, codeOf, txUrl, addrUrl} from './chain';
import {missing} from './recipes';
import {checkAddress} from '../billing/evm';
import {aiChecks, manifest, jsonLd, llmsTxt} from './seo';
import {packSite} from './export';
import {downloadBlob} from '../billing/share';
import {Cabinet, ImgPick, T} from './ShopRoom';

export type Sub = 'home' | 'profile' | 'wallets' | 'money' | 'hash' | 'sites' | 'ai';
const SUBS: [Sub, string][] = [['home', '🏠 Главная'], ['profile', '👤 Мои данные'], ['wallets', '💳 Кошельки'], ['money', '¤ Бухгалтерия'], ['hash', '🔎 Проверить хеш'], ['sites', '🗂 Мои сайты'], ['ai', '🤖 Опубликовать для ИИ']];

export function LoginGate({onPresets}: {onPresets: () => void}) {
  const [pw, setPw] = useState('');
  return <div className="ad-login" data-testid="admin-login">
    <div className="ad-login-card">
      <b className="ad-lock">🔐</b><h2>Админ-панель магазина</h2>
      <p>Здесь ваши данные, кошельки и бухгалтерия. Витрину настраиваете в конструкторе, а всё «за кулисами» — тут.</p>
      <input type="password" value={pw} onChange={e => setPw(e.target.value)} placeholder="Пароль" aria-label="Пароль" onKeyDown={e => e.key === 'Enter' && shop.unlock()} data-testid="admin-password"/>
      <button type="button" className="sh-primary sh-big" data-testid="admin-enter" onClick={() => shop.unlock()}>Войти</button>
      <small>Пароль пока не проверяется — кнопка просто открывает панель. Настоящий вход подключим позже.</small>
      <button type="button" className="sh-link" onClick={onPresets}>или сначала посмотреть примеры витрин →</button>
    </div>
  </div>;
}

function Home({go, onBuild, onSite}: {go: (s: Sub) => void; onBuild: (t: string) => void; onSite: () => void}) {
  const st = useShop(); const p = st.profile; const ws = shop.wallets(); const sites = shop.sites();
  const profileOk = !!(p.firstName || p.business) && !!(p.telegram || p.whatsapp || p.email || p.phone);
  const left = st.shop ? missing(st.shop, shop.addresses().length) : [];
  const paid = Object.values(st.fulfil).filter(f => f.done).length;
  return <div className="ad-home" data-testid="admin-home">
    <h2>{p.firstName ? `Привет, ${p.firstName}!` : 'Ваша админ-панель'}</h2>
    <p className="sh-note">Заполните один раз — данные и кошелёк сами попадут в каждый новый сайт.</p>
    <div className="ad-cards">
      <button type="button" className={'ad-card ' + (profileOk ? 'ok' : 'todo')} onClick={() => go('profile')} data-testid="admin-card-profile"><b>{profileOk ? '✓' : '1'}</b><strong>Мои данные</strong><small>{profileOk ? [p.firstName, p.lastName].filter(Boolean).join(' ') || p.business : 'Имя, контакты, город, доставка'}</small></button>
      <button type="button" className={'ad-card ' + (ws.length ? 'ok' : 'todo')} onClick={() => go('wallets')} data-testid="admin-card-wallets"><b>{ws.length ? '✓' : '2'}</b><strong>Кошельки</strong><small>{ws.length ? `${ws.length} шт · основной: ${shop.defaultWallet()?.label}` : 'Куда приходят деньги (USDC, Base)'}</small></button>
      <button type="button" className={'ad-card ' + (st.shop ? 'ok' : 'todo')} onClick={() => st.shop ? onSite() : go('sites')}><b>{st.shop ? '✓' : '3'}</b><strong>Мой сайт</strong><small>{st.shop ? `${st.shop.brand.name}${left.length ? ` · осталось ${left.length}` : ' · готов'}` : 'Выберите пресет ниже'}</small></button>
      <button type="button" className="ad-card" onClick={() => go('money')}><b>¤</b><strong>Бухгалтерия</strong><small>{ws.length ? `Кошельков: ${ws.length} · выдано: ${paid}` : 'Появится после кошелька'}</small></button>
    </div>
    <h3>Новый сайт за минуту</h3>
    <p className="sh-note">Пресет + ваши данные + основной кошелёк. Дальше только товары, цены и фото.</p>
    <div className="ad-quick">{Object.entries(TEMPLATES).map(([k, t]) => <button type="button" key={k} data-testid={'admin-new-' + k} onClick={() => onBuild(k)}><b>{t.icon}</b>{t.ru}</button>)}</div>
    <p className="sh-note">Или скажите агенту: «собери сайт, продаю покрышки из гаража» — он соберёт по анкете (shop.compose) с этими же данными.</p>
    {sites.length > 0 && <><h3>Мои сайты</h3><div className="sh-sites">{sites.map(x => <button type="button" key={x.id} aria-pressed={x.current} onClick={() => { if (!x.current) shop.switchTo(x.id); onSite(); }}>{x.current ? '● ' : ''}{x.name}<small>{new Date(x.updatedAt).toLocaleDateString()}</small></button>)}</div></>}
    <div className="ad-row"><button type="button" className="sh-btn" onClick={() => go('hash')}>🔎 Покупатель прислал хеш</button><button type="button" className="sh-link" onClick={() => shop.lock()}>выйти</button></div>
  </div>;
}

function ProfileForm() {
  const st = useShop(); const p = st.profile; const set = (x: Partial<typeof p>) => shop.setProfile(x);
  return <div className="ad-sec" data-testid="admin-profile">
    <h2>Мои данные</h2><p className="sh-note">Сохраняются сразу. Подставляются в новые сайты: контакты, город, логотип, доставка.</p>
    <div className="sh-row2"><T label="Имя" v={p.firstName} set={v => set({firstName: v})} max={40}/><T label="Фамилия" v={p.lastName} set={v => set({lastName: v})} max={40}/></div>
    <div className="sh-row2"><T label="Название (дело, бренд)" v={p.business} set={v => set({business: v})} max={60}/><T label="Город / район" v={p.place} set={v => set({place: v})} max={60}/></div>
    <div className="sh-row2"><T label="Telegram (без @)" v={p.telegram} set={v => set({telegram: v.replace(/^@/, '')})} max={40}/><T label="WhatsApp" v={p.whatsapp} set={v => set({whatsapp: v})} max={30}/></div>
    <div className="sh-row2"><T label="E-mail" v={p.email} set={v => set({email: v})} max={80}/><T label="Телефон" v={p.phone} set={v => set({phone: v})} max={30}/></div>
    <T label="Как отдаёте товар (доставка, самовывоз)" v={p.delivery} set={v => set({delivery: v})} area max={240}/>
    <ImgPick img={p.logo} set={i => set({logo: i})} label="Логотип" edge={300}/>
    {st.shop && <button type="button" className="sh-btn" data-testid="admin-apply" onClick={() => shop.applyAdminToCurrent()}>↻ Подставить в текущий сайт «{st.shop.brand.name}»</button>}
  </div>;
}

function Wallets() {
  useShop(); const ws = shop.wallets(); const [label, setLabel] = useState(''); const [addr, setAddr] = useState(''); const chk = addr ? checkAddress(addr) : null;
  const add = async () => { if (!chk?.ok) return; let b: number | null = null; try { b = await head(); } catch { /* offline */ } shop.addWallet(label.trim() || (ws.length ? 'Кошелёк ' + (ws.length + 1) : 'Основной'), chk.address, b); setAddr(''); setLabel(''); };
  const used = (w: Wallet) => { const s = shop.get().shop; if (!s) return []; const a = w.address.toLowerCase(); return [...(s.payment.address?.toLowerCase() === a ? ['весь сайт'] : []), ...s.sections.flatMap(x => x.cells).filter(c => c.receiver?.toLowerCase() === a).map(c => c.title)]; };
  return <div className="ad-sec" data-testid="admin-wallets">
    <h2>Кошельки</h2><p className="sh-note">Сколько угодно адресов: свой, жены, партнёра, «для аренды». Основной подставляется в новые сайты; в ячейках адрес выбирается из этого списка. USDC, сеть Base.</p>
    {ws.map(w => <div key={w.id} className="ad-wallet" data-testid="admin-wallet">
      <input value={w.label} onChange={e => shop.patchWallet(w.id, {label: e.target.value})} aria-label="Подпись"/>
      <a href={addrUrl(w.address)} target="_blank" rel="noreferrer"><code>{w.address}</code></a>
      <small>{used(w).length ? 'используется: ' + used(w).slice(0, 4).join(', ') : 'в текущем сайте не используется'}</small>
      <div className="sh-row"><label className="sh-check"><input type="radio" checked={w.isDefault} onChange={() => shop.patchWallet(w.id, {isDefault: true})}/> основной</label>
        <button type="button" className="sh-link" onClick={() => navigator.clipboard?.writeText(w.address)}>копировать</button>
        <button type="button" className="sh-link sh-danger" onClick={async () => { let b: number | null = null; try { b = await head(); } catch { /* */ } shop.removeWallet(w.id, b); }}>снять</button></div>
    </div>)}
    <div className="ad-add"><input value={label} onChange={e => setLabel(e.target.value)} placeholder="Подпись: Основной, Аня, Аренда…" maxLength={40}/>
      <input value={addr} onChange={e => setAddr(e.target.value.trim())} placeholder="0x… адрес" spellCheck={false} className={addr ? (chk?.ok ? 'ok' : 'bad') : ''} data-testid="admin-wallet-address"/>
      <button type="button" className="sh-primary" disabled={!chk?.ok} onClick={() => void add()} data-testid="admin-wallet-add">＋ Добавить</button></div>
    {addr && !chk?.ok && <small className="sh-bad">{(chk as any)?.reason === 'checksum' ? 'Похоже на опечатку (контрольная сумма не сходится)' : 'Нужен адрес 0x и 40 символов'}</small>}
    {shop.get().receivers.length > 0 && <details className="sh-hist"><summary>История: поставлен / снят · {shop.get().receivers.length}</summary>{shop.get().receivers.slice().reverse().map((r, i) => <div key={i}><b>{r.event === 'injected' ? '⇣ поставлен' : '⇡ снят'}</b> {r.label} <code>{r.address.slice(0, 8)}…{r.address.slice(-6)}</code> · {new Date(r.at).toLocaleString()}{r.block ? ` · блок ${r.block}` : ''}</div>)}</details>}
  </div>;
}

function HashCheck() {
  const st = useShop(); const [hash, setHash] = useState(''); const [busy, setBusy] = useState(false); const [res, setRes] = useState<any>(null); const [err, setErr] = useState('');
  const mine = shop.addresses().map(a => a.address);
  const cells = [st.shop, ...st.archive].filter(Boolean).flatMap(s => s!.sections.flatMap(x => x.cells.filter(c => c.price).map(c => ({site: s!.brand.name, title: c.title, price: c.price!}))));
  const guess = (amount: bigint) => { const base = (amount / 10000n) * 10000n; return cells.filter(c => { try { const u = BigInt(Math.round(Number(c.price) * 100)) * 10000n; return u === base || u === amount; } catch { return false; } }).slice(0, 4); };
  const check = async () => { setBusy(true); setErr(''); setRes(null); try { setRes(await lookupTx(hash, mine)); } catch (e: any) { setErr(e.message === 'HASH_INVALID' ? 'Хеш — это 0x и 64 символа' : 'Нет связи с сетью Base. Проверьте интернет.'); } setBusy(false); };
  const toAcct = async (t: any) => {
    const acct: any = (await kv.get('acct')) || {}; const a = acct[t.to] || {from: res.block, scannedTo: res.block - 1, list: []};
    if (!a.list.some((x: any) => x.tx === res.tx && x.log === t.log)) a.list.push({tx: res.tx, log: t.log, from: t.from, to: t.to, amount: t.amount.toString(), block: res.block});
    acct[t.to] = a; await kv.set('acct', acct); window.dispatchEvent(new CustomEvent('shop:acct'));
  };
  return <div className="ad-sec" data-testid="admin-hash">
    <h2>Проверить платёж по хешу</h2>
    <p className="sh-note">Покупатель говорит «я заплатил», а номер заказа потерялся (кошелёк округлил сумму, платил с биржи)? Попросите хеш транзакции — он есть в его кошельке или в сообщении с заказом. Вставьте сюда.</p>
    <div className="ad-add"><input value={hash} onChange={e => setHash(e.target.value.trim())} placeholder="0x… хеш транзакции (64 символа)" spellCheck={false} data-testid="admin-hash-input"/><button type="button" className="sh-primary" disabled={busy || !hash} onClick={() => void check()} data-testid="admin-hash-check">{busy ? 'Читаю сеть…' : 'Проверить'}</button></div>
    {!mine.length && <p className="sh-warnbox">Сначала добавьте кошельки — проверка ищет переводы на ваши адреса.</p>}
    {err && <p className="sh-warnbox">{err}</p>}
    {res && !res.found && <p className="sh-warnbox">{res.reason === 'FAILED' ? 'Транзакция есть, но не прошла (failed). Денег нет.' : 'Транзакция не найдена в сети Base. Проверьте хеш и сеть — возможно, платили в другой сети или она ещё в пути.'}</p>}
    {res?.found && <div className="ad-tx" data-testid="admin-hash-result">
      {res.toMe.length ? res.toMe.map((t: any, i: number) => { const g = guess(t.amount); const f = st.fulfil[res.tx]; return <div key={i} className="ad-tx-ok">
        <b>✓ {fmt6(t.amount)} USDC пришло на «{shop.walletLabel(t.to) || shop.addresses().find(a => a.address === t.to)?.label || 'ваш адрес'}»</b>
        <span>от <code>{t.from.slice(0, 8)}…{t.from.slice(-6)}</code> · {res.time ? new Date(res.time).toLocaleString() : `блок ${res.block}`} · {res.confirmed ? 'подтверждено' : `подтверждений: ${res.confirmations}`}</span>
        <span>{codeOf(t.amount) ? <>Номер заказа в сумме: <span className="sh-code">#{String(codeOf(t.amount)).padStart(4, '0')}</span></> : 'Сумма без номера заказа.'}{g.length ? <> · похоже на: {g.map(x => `${x.title} (${x.price})`).join(', ')}</> : ''}</span>
        <div className="sh-row"><a className="sh-btn" href={txUrl(res.tx)} target="_blank" rel="noreferrer">Basescan</a>
          <label className="sh-check"><input type="checkbox" checked={!!f?.done} onChange={e => shop.fulfil(res.tx, e.target.checked)} data-testid="admin-hash-done"/> выдано</label>
          <button type="button" className="sh-btn" onClick={() => void toAcct(t)}>＋ в бухгалтерию</button></div></div>; })
        : <p className="sh-warnbox">Транзакция прошла, но USDC на ваши адреса в ней нет.{res.other.length ? ` Перевод ушёл на ${res.other.map((o: any) => o.to.slice(0, 8) + '…').join(', ')} — это не ваш кошелёк из списка.` : ''}</p>}
    </div>}
  </div>;
}

// "Опубликовать для ИИ": the site is already machine-readable inside; this page says what is left to do by hand.
type AiState = {done: Record<string, boolean>};
const AI_STEPS: {id: string; title: string; text: string; link?: [string, string]}[] = [
  {id: 'zip', title: 'Скачать папку сайта', text: 'В папке: index.html (витрина), products.json (прайс-лист как данные), llms.txt (описание для ИИ). Разметка schema.org уже внутри страницы.'},
  {id: 'host', title: 'Выложить в интернет', text: 'Netlify Drop, Cloudflare Pages или GitHub Pages — бесплатно. Перетащите папку и получите адрес. Вставьте адрес выше и скачайте папку ещё раз: ссылки в данных станут правильными.', link: ['https://app.netlify.com/drop', 'Netlify Drop']},
  {id: 'check', title: 'Проверить разметку', text: 'Вставьте адрес сайта в валидатор schema.org — он покажет магазин и товары так, как их видят поисковики и ИИ.', link: ['https://validator.schema.org/', 'validator.schema.org']},
  {id: 'chatgpt', title: 'ChatGPT: заявить бизнес', text: 'Business Hub (бета с 10.11.2026): профиль, фид товаров, статистика упоминаний. Нужен сайт. Агент для покупателей пока только у бизнесов в США — профиль можно заявить там, где работает ChatGPT.', link: ['https://chatgpt.com/business-hub', 'chatgpt.com/business-hub']},
  {id: 'google', title: 'Google: профиль компании и Merchant Center', text: 'Профиль компании — для карт и поиска; Merchant Center — для товаров в Google и Gemini. Используйте адрес сайта и products.json как источник данных.', link: ['https://merchants.google.com/', 'Merchant Center']},
  {id: 'share', title: 'Разослать прайс-лист', text: 'Тот же HTML-файл можно отправить в мессенджер или вставить в «Базар» другого портала — там его откроют как витрину и оплатят.'},
];
function AiPublish() {
  const st = useShop(); const cfg = st.shop; const [ai, setAi] = useState<AiState>({done: {}}); const [url, setUrl] = useState(cfg?.siteUrl || '');
  useEffect(() => { void kv.get<AiState>('aiPublish').then(v => v && setAi(v)); }, []);
  useEffect(() => setUrl(cfg?.siteUrl || ''), [cfg?.siteUrl]);
  const tick = (id: string, v: boolean) => { const n = {done: {...ai.done, [id]: v}}; setAi(n); void kv.set('aiPublish', n); };
  const checks = aiChecks(cfg); const okUrl = !url || /^https:\/\/[^\s"'<>]+$/.test(url);
  const saveUrl = () => { if (cfg && okUrl) shop.set({siteUrl: url.replace(/\/+$/, '') || undefined}); };
  return <div className="ad-sec" data-testid="admin-ai">
    <h2>Опубликовать для ИИ</h2>
    <p className="sh-note">ChatGPT, Gemini, Claude и поисковики читают не картинку сайта, а данные. В каждом файле и папке сайта они уже есть: прайс-лист (products.json), разметка schema.org и llms.txt. Здесь — что осталось сделать руками.</p>
    {!cfg ? <p className="sh-warnbox">Сначала соберите сайт.</p> : <>
      <div className="ad-checks" data-testid="admin-ai-checks">{checks.map(c => <div key={c.id} className={c.ok ? 'ok' : 'todo'}><b>{c.ok ? '✓' : '•'}</b>{c.text}</div>)}</div>
      <div className="ad-add"><input value={url} onChange={e => setUrl(e.target.value.trim())} onBlur={saveUrl} placeholder="https://адрес-вашего-сайта (после публикации)" className={url ? (okUrl ? 'ok' : 'bad') : ''} data-testid="admin-ai-url"/>
        <button type="button" className="sh-btn" disabled={!okUrl} onClick={saveUrl}>Сохранить адрес</button></div>
      <ol className="ad-steps">{AI_STEPS.map(s => <li key={s.id} className={ai.done[s.id] ? 'done' : ''}>
        <label className="sh-check"><input type="checkbox" checked={!!ai.done[s.id]} onChange={e => tick(s.id, e.target.checked)} data-testid={'admin-ai-step-' + s.id}/> <b>{s.title}</b></label>
        <span>{s.text}</span>
        <div className="sh-row">{s.id === 'zip' && <button type="button" className="sh-primary" data-testid="admin-ai-zip" onClick={async () => { const r = await packSite(cfg); downloadBlob(r.blob, r.name); tick('zip', true); }}>⬇ Папка сайта (.zip)</button>}
          {s.link && <a className="sh-btn" href={s.link[0]} target="_blank" rel="noreferrer">{s.link[1]} ↗</a>}</div>
      </li>)}</ol>
      <details className="sh-hist"><summary>Посмотреть, что видит ИИ</summary>
        <h4>llms.txt</h4><pre className="ad-pre" data-testid="admin-ai-llms">{llmsTxt(cfg)}</pre>
        <h4>products.json</h4><pre className="ad-pre">{JSON.stringify(manifest(cfg), null, 1).slice(0, 6000)}</pre>
        <h4>schema.org (JSON-LD)</h4><pre className="ad-pre">{JSON.stringify(jsonLd(cfg), null, 1).slice(0, 6000)}</pre>
      </details>
    </>}
  </div>;
}

/** Which admin page to show when the panel mounts (set by agent commands before the lazy room loads). */
export const adminNav: {sub: Sub} = {sub: 'home'};

export function AdminPanel({onBuild, onSite, onPresets}: {onBuild: (t: string) => void; onSite: () => void; onPresets: () => void}) {
  const st = useShop(); const [sub, setSub0] = useState<Sub>(adminNav.sub); const setSub = (x: Sub) => { adminNav.sub = x; setSub0(x); };
  useEffect(() => { const pend = (window as any).__shopUiPending; if (pend?.admin) { adminNav.sub = pend.admin; setSub0(pend.admin); } const f = (e: any) => { if (e.detail?.admin) setSub0(e.detail.admin); }; window.addEventListener('shop:ui', f); return () => window.removeEventListener('shop:ui', f); }, []);
  if (!st.unlocked) return <LoginGate onPresets={onPresets}/>;
  return <section className="ad" data-testid="admin-panel">
    <nav className="ad-nav">{SUBS.map(([k, l]) => <button type="button" key={k} aria-pressed={sub === k} data-testid={'admin-sub-' + k} onClick={() => setSub(k)}>{l}</button>)}
      <span className="ad-nav-sp"/><button type="button" onClick={onPresets}>🧩 Пресеты</button>{st.shop && <button type="button" onClick={onSite}>✎ Конструктор</button>}</nav>
    <div className="ad-body">
      {sub === 'home' && <Home go={setSub} onBuild={onBuild} onSite={onSite}/>}
      {sub === 'profile' && <ProfileForm/>}
      {sub === 'wallets' && <Wallets/>}
      {sub === 'money' && <div className="ad-sec"><h2>Бухгалтерия</h2><p className="sh-note">Все ваши кошельки: сколько пришло, баланс, платежи с номерами заказов. Читается прямо из сети Base.</p>{st.shop || shop.wallets().length ? <Cabinet cfg={st.shop || TEMPLATES.blank.make()}/> : <p className="sh-note">Добавьте кошелёк.</p>}</div>}
      {sub === 'hash' && <HashCheck/>}
      {sub === 'ai' && <AiPublish/>}
      {sub === 'sites' && <div className="ad-sec"><h2>Мои сайты</h2>
        {shop.sites().length ? <div className="sh-sites">{shop.sites().map(x => <button type="button" key={x.id} aria-pressed={x.current} onClick={() => { if (!x.current) shop.switchTo(x.id); onSite(); }}>{x.current ? '● ' : ''}{x.name}<small>{new Date(x.updatedAt).toLocaleDateString()}</small></button>)}</div> : <p className="sh-note">Пока нет. Начните с пресета:</p>}
        <div className="ad-quick">{Object.entries(TEMPLATES).map(([k, t]) => <button type="button" key={k} onClick={() => onBuild(k)}><b>{t.icon}</b>{t.ru}</button>)}</div></div>}
    </div>
  </section>;
}
