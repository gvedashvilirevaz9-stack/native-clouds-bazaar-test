// "💸 Платить криптой": your Coinbase wallet in the Bazaar + where USDC actually works + a manual "pay to address".
// Facts about outside services are as of Nov 2026; each card links to the service itself.
import {useEffect, useState} from 'react';
import {useWallet, signIn, signOut, refreshBalance, payUsdc} from './wallet';
import {fmt, units, txUrl, addrUrl} from '../shop/chain';

const short = (a: string) => a.slice(0, 6) + '…' + a.slice(-4);
type Svc = {icon: string; name: string; what: string; how: string; who: 'human' | 'agent' | 'both'; where: 'here' | 'site' | 'agent'; net: string; link?: string};

export const CRYPTO_SERVICES: Svc[] = [
  {icon: '🏪', name: 'Лавки «Моего магазина»', what: 'Товары из прайс-листов, которые вам прислали (вкладка «Лавки»).', how: 'Корзина → «Оплатить с Coinbase». USDC уходит прямо продавцу, номер заказа зашит в сумму.', who: 'both', where: 'here', net: 'USDC · Base'},
  {icon: '🛍', name: 'Shopify-магазины с оплатой USDC', what: 'Обычные интернет-магазины. Кнопка USDC есть не у всех: только у продавцов из стран, где Shopify её включил.', how: 'Найти товар в «Магазинах онлайн» → открыть магазин → на кассе выбрать USDC → подтвердить в Coinbase.', who: 'human', where: 'site', net: 'USDC · Base и др.', link: 'https://help.shopify.com/en/manual/payments/shopify-payments/usdc-payments'},
  {icon: '🎁', name: 'Bitrefill', what: 'Подарочные карты (Amazon, Steam и др.), пополнение телефона, eSIM для поездок.', how: 'На сайте выбрать товар → оплата «USDC (Base)» → перевести сумму с Coinbase (или через форму ниже).', who: 'both', where: 'site', net: 'USDC · Base', link: 'https://www.bitrefill.com'},
  {icon: '🏨', name: 'Travala', what: 'Отели, а также перелёты и туры за криптовалюту. Для агентов есть протокол бронирования отелей с оплатой USDC.', how: 'Человек: оплата криптой на сайте. Агент: ищет и бронирует, последний шаг — ваша подпись.', who: 'both', where: 'site', net: 'USDC · Base и др.', link: 'https://www.travala.com'},
  {icon: '🧾', name: 'Кнопка «Оплатить криптой» на кассе', what: 'Магазины на Stripe или PayPal, у которых включена оплата криптой.', how: 'На кассе магазина выбрать оплату криптой → подключить Coinbase → подтвердить.', who: 'human', where: 'site', net: 'USDC, разные сети'},
  {icon: '⚡', name: 'Платные API за запрос (x402)', what: 'Данные, ИИ, поиск, погода, отчёты. Цена — центы за запрос. Каталог: x402 Bazaar / agentic.market.', how: 'Платит агент своим отдельным кошельком в рамках лимитов (вкладка «Агент и лимиты»). Человек ничего не нажимает.', who: 'agent', where: 'agent', net: 'USDC · Base', link: 'https://agentic.market'},
  {icon: '💸', name: 'Moneyplace (ваши сервисы)', what: '39 сервисов из вашей сборки Money: утро, деньги, крипта, поездки, вечер. Бесплатные и платные по тарифам.', how: 'Следующий модуль: подключается к Базару отдельно, оплата платных — x402 через агента или вручную.', who: 'both', where: 'agent', net: 'USDC · Base'},
];
const WHO: Record<Svc['who'], string> = {human: '👤 платите вы', agent: '🤖 платит агент', both: '👤 вы или 🤖 агент'};
const WHERE: Record<Svc['where'], string> = {here: 'работает здесь', site: 'на сайте сервиса', agent: 'через агента'};

export function WalletChip() {
  const w = useWallet();
  if (!w.checked) return null;
  if (!w.address) return <button type="button" className="bz-cb" data-testid="bz-cb-signin" disabled={w.busy === 'signin'} onClick={() => void signIn().catch(() => undefined)} title={w.error || 'Подпись подтверждает вход. Денег не списывает.'}>
    <span className="bz-cb-dot"/>{w.busy === 'signin' ? 'Подтвердите в кошельке…' : 'Войти через Coinbase'}</button>;
  return <span className="bz-cb on" data-testid="bz-cb-on" title={w.address}><span className="bz-cb-dot"/>{short(w.address)}{w.usdc != null && <b>{fmt(w.usdc)} USDC</b>}</span>;
}

function ManualPay() {
  const w = useWallet(); const [to, setTo] = useState(''); const [amt, setAmt] = useState(''); const [ok, setOk] = useState(false); const [msg, setMsg] = useState(''); const [tx, setTx] = useState(''); const [busy, setBusy] = useState(false);
  const validTo = /^0x[0-9a-fA-F]{40}$/.test(to.trim()); let u: bigint | null = null; try { u = amt ? units(amt.replace(',', '.')) : null; } catch { u = null; }
  const ready = !!w.address && validTo && !!u && u > 0n && ok;
  const go = async () => { setBusy(true); setMsg(''); setTx(''); try { const h = await payUsdc(to.trim(), u!); setTx(h); setMsg('✓ Отправлено. Хеш ниже — покажите его получателю.'); setOk(false); } catch (e: any) { setMsg(e?.code === 4001 ? 'Вы отменили в кошельке.' : String(e?.message || e)); } setBusy(false); };
  return <div className="bz-card" data-testid="bz-manual">
    <h3>Оплатить на адрес вручную</h3>
    <p className="bz-note">Для счёта, где сервис дал адрес и сумму в USDC (Base), — например, Bitrefill или продавец в переписке.</p>
    <div className="bz-grid2">
      <label>Адрес получателя<input value={to} onChange={e => { setTo(e.target.value); setOk(false); }} placeholder="0x…" data-testid="bz-mp-to"/></label>
      <label>Сумма, USDC<input value={amt} onChange={e => { setAmt(e.target.value.replace(/[^\d.,]/g, '')); setOk(false); }} placeholder="10.00" inputMode="decimal" data-testid="bz-mp-amt"/></label>
    </div>
    {validTo && u && u > 0n && <label className="bz-check"><input type="checkbox" checked={ok} onChange={e => setOk(e.target.checked)} data-testid="bz-mp-ok"/> Проверил: <b>{fmt(u)} USDC</b> в сети <b>Base</b> на <code>{short(to.trim())}</code>. Перевод не отменить.</label>}
    <div className="bz-row">
      {w.address ? <button type="button" className="bz-btn acc" disabled={!ready || busy} onClick={() => void go()} data-testid="bz-mp-send">{busy ? 'Ждём подтверждения в кошельке…' : 'Отправить с Coinbase'}</button>
        : <button type="button" className="bz-btn acc" onClick={() => void signIn().catch(() => undefined)}>Сначала войти через Coinbase</button>}
      {to && !validTo && <small className="bz-warn">Адрес — это 0x и 40 символов.</small>}
    </div>
    {msg && <p className="bz-msg">{msg}{tx && <> <a href={txUrl(tx)} target="_blank" rel="noreferrer">{short(tx)}</a></>}</p>}
  </div>;
}

export function CryptoPay() {
  const w = useWallet();
  useEffect(() => { if (w.address) void refreshBalance(); }, [w.address]);
  return <div className="bz-sec bz-crypto" data-testid="bz-crypto">
    <h2>Платить криптой</h2>
    <div className="bz-card bz-mywallet">
      {w.address ? <>
        <div><small>Ваш кошелёк · вход через Coinbase</small><b className="bz-addr"><a href={addrUrl(w.address)} target="_blank" rel="noreferrer">{short(w.address)}</a></b>
          <span className="bz-bal">{w.usdc == null ? '…' : fmt(w.usdc)} <small>USDC · Base</small></span></div>
        <div className="bz-row"><button type="button" className="bz-btn" onClick={() => void refreshBalance()}>Обновить баланс</button>
          <a className="bz-btn" href="https://keys.coinbase.com" target="_blank" rel="noreferrer">Открыть кошелёк ↗</a>
          <button type="button" className="bz-link" onClick={() => void signOut()} data-testid="bz-cb-out">выйти</button></div>
        <small className="bz-note">Это тот же вход, что в «Моём магазине». Там этот адрес — владелец магазина, здесь — покупатель: оплаты идут с него, и каждую вы подтверждаете в кошельке.</small>
      </> : <>
        <div><b>Войдите через Coinbase</b><small className="bz-note">Один вход на весь портал: «Мой магазин» и Базар. Подпись только подтверждает, что адрес ваш, — денег не списывает.</small></div>
        <button type="button" className="bz-btn acc" disabled={w.busy === 'signin'} onClick={() => void signIn().catch(() => undefined)} data-testid="bz-cb-signin2">{w.busy === 'signin' ? 'Подтвердите в кошельке…' : 'Войти через Coinbase'}</button>
        {w.error && <small className="bz-warn">{w.error}</small>}
      </>}
    </div>

    <div className="bz-ways">
      <div><b>1 · Перевод на адрес</b><small>Продавец или сервис даёт адрес и сумму. Вы отправляете USDC с Coinbase. Так работают лавки и счета Bitrefill.</small></div>
      <div><b>2 · Касса магазина</b><small>На странице магазина кнопка USDC / «Оплатить криптой». Подключаете Coinbase там же и подтверждаете.</small></div>
      <div><b>3 · x402 — оплата за запрос</b><small>Сервис отвечает «402: заплатите». Платит агент своим отдельным кошельком, маленькими суммами, в ваших лимитах.</small></div>
    </div>

    <h3>Где это работает</h3>
    <div className="bz-svcs">{CRYPTO_SERVICES.map(s => <div key={s.name} className={'bz-svc w-' + s.where} data-testid="bz-svc">
      <div className="bz-svc-h"><span className="bz-svc-i">{s.icon}</span><b>{s.name}</b><span className={'bz-st s-' + (s.where === 'here' ? 'ready' : s.where === 'site' ? 'adapter' : 'planned')}>{WHERE[s.where]}</span></div>
      <small>{s.what}</small>
      <small><b>Как:</b> {s.how}</small>
      <small className="bz-svc-f"><span>{WHO[s.who]}</span><span>{s.net}</span>{s.link && <a href={s.link} target="_blank" rel="noreferrer">{s.link.replace(/^https:\/\/(www\.)?/, '').split('/')[0]} ↗</a>}</small>
    </div>)}</div>

    <ManualPay/>
    <p className="bz-note">Совет: держите на Coinbase-кошельке немного USDC в сети Base. Комиссия сети Base — доли цента; если кошелёк попросит, держите там и немного ETH.</p>
  </div>;
}

/** The agent's own wallet (server side, test only): what is configured right now. */
export function AgentWalletCard() {
  const [h, setH] = useState<any>(null);
  useEffect(() => { fetch('/api/health', {cache: 'no-store'}).then(r => r.ok ? r.json() : null).then(setH).catch(() => setH(null)); }, []);
  const addr = h?.agentWallet && h.agentWallet !== 'INVALID_KEY' ? h.agentWallet : null;
  return <div className="bz-card" data-testid="bz-agent-wallet">
    <h3>🤖 Кошелёк агента — отдельный</h3>
    <p className="bz-note">Это <b>не ваш Coinbase-кошелёк</b>. У агента свой EVM-адрес и свой приватный ключ. Ключ лежит только на сервере (Vercel → Settings → Environment Variables), не в коде и не в чате. Агент платит им только x402-сервисы и только в лимитах сервера. Ваш Coinbase-кошелёк агент не трогает: там каждую оплату подтверждаете вы.</p>
    <div className="bz-kv">
      <span>Адрес агента</span><b>{h == null ? 'сервер не отвечает' : addr ? <a href={addrUrl(addr)} target="_blank" rel="noreferrer">{short(addr)}</a> : h.agentWallet === 'INVALID_KEY' ? '⚠ ключ вставлен неверно' : 'не подключён'}</b>
      <span>Сети</span><b>{h?.agentNetworks?.join(', ') || '—'}{h?.agentNetworks?.includes('base-sepolia') && !h?.agentNetworks?.includes('base') ? ' (тестовые деньги)' : ''}</b>
      <span>Может платить</span><b>{h?.x402PayEnabled ? '✓ да, в лимитах' : 'нет'}</b>
    </div>
    <details><summary>Как подключить (временно, до вашей системы)</summary>
      <ol className="bz-steps">
        <li>Создайте <b>новый отдельный</b> кошелёк (например, новый аккаунт в Rabby или MetaMask) и скопируйте его приватный ключ. Личный кошелёк не используйте.</li>
        <li>В Vercel → проект → Settings → Environment Variables добавьте <code>AGENT_PRIVATE_KEY</code> = этот ключ.</li>
        <li>Там же: <code>AGENT_MAX_PER_CALL_USDC</code> = <code>0.10</code> (максимум за один запрос), <code>AGENT_NETWORKS</code> = <code>base-sepolia</code> (тест; <code>base</code> — только когда решите платить настоящими), <code>MCP_TOKEN</code> = любой длинный пароль (без него агент не платит).</li>
        <li>Положите на адрес агента немного USDC (в тесте — бесплатные тестовые с faucet.circle.com). Redeploy.</li>
      </ol>
      <small className="bz-note">Это временная схема: ключ на сервере + жёсткие лимиты. Позже её заменит ваша система безопасных платежей агента — Базар обращается к агенту через одну точку (x402_pay), поэтому замена не затронет интерфейс.</small>
    </details>
  </div>;
}
