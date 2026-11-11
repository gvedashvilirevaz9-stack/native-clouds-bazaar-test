// Bitrefill inside "Платить криптой": phone top-ups, gift cards, eSIMs — paid from the signed-in Coinbase address.
// 1) the wallet signs in to Bitrefill once (a message, no money); 2) search; 3) pick an amount; 4) the wallet shows
// "send X USDC to Bitrefill" (USDC transfer authorization) — you confirm, the code / top-up arrives here.
import {useEffect, useState} from 'react';
import type React from 'react';
import {coinbase, useWallet, signIn, refreshBalance} from './wallet';

type Kind = 'topups' | 'gift-cards' | 'esims';
type Pkg = {value: any; label: string; price?: string | null};
type Prod = {slug: string; id: string; name: string; image: string | null; country?: string | null; pkgs: Pkg[]; raw: any};
type Buy = {invoice: string; product: string; amount: string; at: number; status: string; codes?: any[]; tx?: string | null; phone?: string};
const API = '/api/x/bitrefill';
const KEY = 'bz.bitrefill.v1', ORD = 'bz.bitrefill.orders.v1';
const KINDS: {id: Kind; ru: string; icon: string; color: string}[] = [{id: 'topups', ru: 'Пополнить телефон', icon: '📱', color: '#2f8fd8'}, {id: 'gift-cards', ru: 'Подарочные карты', icon: '🎁', color: '#e0508f'}, {id: 'esims', ru: 'eSIM для поездок', icon: '📶', color: '#14a3a8'}];
const PRESETS: Record<Kind, string[]> = {topups: ['Magti', 'Silknet', 'Beeline'], 'gift-cards': ['Amazon', 'Steam', 'Netflix', 'Spotify', 'Apple', 'Google Play', 'Uber', 'Airbnb'], esims: ['Turkey', 'Europe', 'Georgia', 'USA', 'United Arab Emirates', 'Thailand', 'Asia', 'Global']};
// Starting presets per country (before sign-in). After sign-in they are replaced by what Bitrefill really sells in that country.
const TOPUP: Record<string, string[]> = {GE: ['Magti', 'Silknet', 'Beeline'], AM: ['Ucom', 'Beeline', 'Viva'], AZ: ['Azercell', 'Bakcell', 'Nar'], KZ: ['Kcell', 'Beeline', 'Tele2', 'Altel', 'Activ'],
  TR: ['Turkcell', 'Vodafone', 'Turk Telekom'], US: ['T-Mobile', 'AT&T', 'Verizon', 'Lyca Mobile', 'Cricket'], DE: ['Vodafone', 'Telekom', 'O2', 'Lyca Mobile'], AE: ['Etisalat', 'du', 'Virgin Mobile']};
// Labels that differ from what Bitrefill calls the product (Geocell is a Silknet brand since 2018).
const ALIAS: Record<string, string> = {Geocell: 'Silknet'};
// eSIMs are chosen by where you travel, not where you are: "Bitrefill eSIM Turkey" → "Turkey".
const dest = (n: string) => n.replace(/^bitrefill\s+/i, '').replace(/^e-?sim\s+/i, '').trim();
const COUNTRIES = ['GE', 'AM', 'AZ', 'KZ', 'TR', 'US', 'DE', 'AE', 'GB', 'FR', 'ES', 'IT', 'NL', 'PL', 'ALL'];
const CNAME: Record<string, string> = {GB: 'United Kingdom', FR: 'France', ES: 'Spain', IT: 'Italy', NL: 'Netherlands', PL: 'Poland', ALL: '', GE: 'Georgia', AM: 'Armenia', AZ: 'Azerbaijan', KZ: 'Kazakhstan', TR: 'Turkey', US: 'United States', DE: 'Germany', AE: 'United Arab Emirates'};
const hex = (s: string) => '0x' + Array.from(new TextEncoder().encode(s), b => b.toString(16).padStart(2, '0')).join('');
const loadTok = () => { try { const t = JSON.parse(sessionStorage.getItem(KEY) || 'null'); return t && t.exp > Date.now() ? t : null; } catch { return null; } };
const loadOrd = (): Buy[] => { try { return JSON.parse(localStorage.getItem(ORD) || '[]'); } catch { return []; } };
const saveOrd = (v: Buy[]) => { try { localStorage.setItem(ORD, JSON.stringify(v.slice(0, 30))); } catch { /* */ } };
const arr = (j: any): any[] => Array.isArray(j) ? j : j?.products || j?.results || j?.items || j?.data?.products || j?.data || [];
const norm = (p: any): Prod => {
  const pk = p.packages || p.denominations || p.amounts || [];
  return {slug: String(p.slug || p.id || p.product_id || ''), id: String(p.product_id || p.id || p.slug || ''), name: p.name || p.title || p.slug, image: p.image || p.logo_image || p.logoImage || p.icon || p.imageUrl || null,
    country: p.country || p.country_code || null, raw: p,
    pkgs: (Array.isArray(pk) ? pk : []).slice(0, 24).map((x: any) => typeof x === 'object' ? {value: x.package_value ?? x.value ?? x.amount, label: String(x.label || x.package_value || x.value || x.amount) + (x.currency ? ' ' + x.currency : p.currency ? ' ' + p.currency : ''), price: x.price_usdc || x.usd_price || x.price || null} : {value: x, label: String(x) + (p.currency ? ' ' + p.currency : '')})};
};
const usd = (units: string) => { try { const n = BigInt(units); return (Number(n) / 1e6).toFixed(2); } catch { return units; } };

export function BitrefillPanel() {
  const w = useWallet();
  const [tok, setTok] = useState<{token: string; exp: number; address: string} | null>(loadTok);
  const [kind, setKind] = useState<Kind>('topups'); const [cc, setCc] = useState('GE'); const [q, setQ] = useState('');
  const [items, setItems] = useState<Prod[]>([]); const [sel, setSel] = useState<Prod | null>(null); const [pkg, setPkg] = useState<Pkg | null>(null); const [phone, setPhone] = useState('');
  const [busy, setBusy] = useState(''); const [msg, setMsg] = useState(''); const [raw, setRaw] = useState<any>(null); const [orders, setOrdersS] = useState<Buy[]>(loadOrd);
  const setOrders = (v: Buy[]) => { setOrdersS(v); saveOrd(v); };
  const [live, setLive] = useState<Record<string, string[]>>({});
  const [gone, setGone] = useState<Set<string>>(new Set());
  const presets = (kind === 'esims' ? live.esimsALL : live[kind + cc]) || (kind === 'topups' ? TOPUP[cc] || PRESETS.topups : PRESETS[kind]);
  const valid = tok && w.address && tok.address.toLowerCase() === w.address.toLowerCase();
  const H = (): Record<string, string> => (valid ? {'X-Access-Token': tok!.token} : {});
  const post = async (op: string, b: any) => { const r = await fetch(`${API}?op=${op}`, {method: 'POST', headers: {'content-type': 'application/json', ...H()}, body: JSON.stringify(b)}); const j = await r.json().catch(() => ({})); if (!r.ok) throw Object.assign(new Error(j.error || 'HTTP ' + r.status), {j}); return j; };
  const get = async (qs: string) => { const r = await fetch(`${API}?${qs}`, {headers: H()}); const j = await r.json().catch(() => ({})); if (!r.ok) throw Object.assign(new Error(j.error || 'HTTP ' + r.status), {j}); return j; };
  const fail = (e: any) => { const m = String(e?.message || e); setMsg(e?.code === 4001 ? 'Вы отменили в кошельке.' : m.startsWith('UNAVAILABLE:') ? `Bitrefill сейчас не продаёт этот товар: нет в наличии или закрыт для покупки из вашего региона. Попробуйте «${m.slice(12)}» в другой стране — кнопка ниже.` : m.includes('404') ? 'Bitrefill не нашёл этот товар или номинал (404). Подробности — в «Техническом ответе» ниже.' : m.includes('400') ? 'Bitrefill не принял запрос (400). Подробности — ниже.' : m); if (e?.j) setRaw(e.j); };

  /** Sign in to Bitrefill with the wallet: one message, no money. */
  const connect = async () => {
    setBusy('connect'); setMsg('');
    try {
      if (!w.address) await signIn();
      const eth = await coinbase(); const [addr] = await eth.request({method: 'eth_requestAccounts'}) as string[];
      const {message, fields} = await post('connect-start', {address: addr});
      const signature = await eth.request({method: 'personal_sign', params: [hex(message), addr]});
      const j = await post('connect-finish', {fields, signature});
      if (!j.token) throw Object.assign(new Error('Bitrefill не выдал доступ'), {j});
      const t = {token: j.token, exp: Date.now() + Math.max(60, (j.expires_in || 7200) - 120) * 1000, address: addr}; setTok(t); sessionStorage.setItem(KEY, JSON.stringify(t));
    } catch (e) { fail(e); }
    setBusy('');
  };
  const search = async (text = q, k = kind, c0 = cc) => { const c = k === 'esims' ? 'ALL' : c0;
    if (!text.trim()) return; setBusy('search'); setMsg(''); setSel(null); setPkg(null); setRaw(null);
    try {
      // Bitrefill searches top-ups by country/operator slug, not always by brand name: try the word, then the whole country, then the country name.
      const word = text.trim(); const tries = [word, ...(k !== 'gift-cards' ? ['', CNAME[c] || cc, word.toLowerCase() + ' ' + (CNAME[c] || '')] : [word.toLowerCase()])];
      let list: Prod[] = []; let last: any = null; let used = word;
      for (const t of tries) { const j = await get(`op=search&kind=${k}&q=${encodeURIComponent(t)}${c === 'ALL' ? '' : '&country=' + c}`); last = j; list = arr(j).map(norm).filter(p => p.slug); used = t; if (list.length) break; }
      const w0 = word.toLowerCase(); const hit = list.filter(p => (p.name + ' ' + p.slug).toLowerCase().includes(w0));
      setItems(hit.length ? hit : list);
      if (!list.length) { setMsg('Ничего не нашлось. Попробуйте другую страну или вкладку.'); setRaw(last); }
      else if (!hit.length && used !== word) setMsg(`«${word}» отдельно не нашёлся — показываю всё, что Bitrefill даёт по стране ${c}.`);
    }
    catch (e: any) { setItems([]); if (String(e.message).includes('402')) setMsg('Сначала войдите в Bitrefill кошельком — поиск станет бесплатным.'); else fail(e); }
    setBusy('');
  };
  const open = async (p: Prod) => {
    setSel(p); setPkg(null); setMsg('');
    if (!p.pkgs.length) { setBusy('detail'); try { let j: any; try { j = await get(`op=detail&slug=${encodeURIComponent(p.slug)}`); } catch (e) { if (p.id && p.id !== p.slug) j = await get(`op=detail&slug=${encodeURIComponent(p.id)}`); else throw e; } const d = norm(j.product || j); setSel({...p, ...d, image: p.image || d.image, pkgs: d.pkgs}); if (!d.pkgs.length) setRaw(j); } catch (e) { fail(e); } setBusy(''); }
  };
  /** Create the invoice, then let the wallet sign "send X USDC to Bitrefill"; Bitrefill confirms and delivers. */
  const buy = async () => {
    if (!sel || !pkg) return; setBusy('pay'); setMsg('');
    try {
      const extra = kind === 'topups' && phone ? {refill_input: phone.replace(/[^\d+]/g, '')} : {};
      // Bitrefill wants the product slug and package_value exactly as returned; fall back to the other id on 404.
      let inv: any; try { inv = await post('create', {items: [{product_id: sel.slug, package_value: pkg.value, ...extra}]}); }
      catch (e: any) { if (!String(e.message).includes('404')) throw e;
        if (sel.id && sel.id !== sel.slug) { try { inv = await post('create', {items: [{product_id: sel.id, package_value: pkg.value, ...extra}]}); } catch { /* still unavailable */ } }
        if (!inv) { setGone(g => new Set(g).add(sel.slug)); const brand = sel.name.split(/\s+/)[0];
          throw Object.assign(new Error(`UNAVAILABLE:${brand}`), {j: e.j}); } }
      const invoice = inv.invoice_id; if (!invoice) throw Object.assign(new Error('Счёт не создан'), {j: inv});
      const rq = await post('pay-start', {invoice_id: invoice});
      const eth = await coinbase(); const [from] = await eth.request({method: 'eth_requestAccounts'}) as string[];
      const nonce = '0x' + Array.from(crypto.getRandomValues(new Uint8Array(32)), b => b.toString(16).padStart(2, '0')).join('');
      const authorization = {from, to: rq.payTo, value: String(rq.amount), validAfter: '0', validBefore: String(Math.floor(Date.now() / 1000) + Math.min(900, rq.maxTimeoutSeconds || 300)), nonce};
      const typed = {types: {EIP712Domain: [{name: 'name', type: 'string'}, {name: 'version', type: 'string'}, {name: 'chainId', type: 'uint256'}, {name: 'verifyingContract', type: 'address'}],
        TransferWithAuthorization: [{name: 'from', type: 'address'}, {name: 'to', type: 'address'}, {name: 'value', type: 'uint256'}, {name: 'validAfter', type: 'uint256'}, {name: 'validBefore', type: 'uint256'}, {name: 'nonce', type: 'bytes32'}]},
        primaryType: 'TransferWithAuthorization', domain: {name: rq.name, version: rq.tokenVersion, chainId: 8453, verifyingContract: rq.asset}, message: authorization};
      const signature = await eth.request({method: 'eth_signTypedData_v4', params: [from, JSON.stringify(typed)]});
      const paid = await post('pay-finish', {invoice_id: invoice, requirements: rq.requirements, version: rq.version, authorization, signature});
      const o: Buy = {invoice, product: sel.name + ' · ' + pkg.label, amount: usd(String(rq.amount)) + ' USDC', at: Date.now(), status: paid.status || 'оплачено', tx: paid.transaction || paid.receipt?.transaction || null, phone: kind === 'topups' ? phone : undefined};
      setOrders([o, ...orders]); setMsg('✓ Оплачено. Жду доставку…'); setSel(null); setPkg(null); void refreshBalance(); void poll(invoice);
    } catch (e) { fail(e); }
    setBusy('');
  };
  const poll = async (invoice: string) => {
    for (let i = 0; i < 30; i++) {
      await new Promise(r => setTimeout(r, 4000));
      try { const j = await get(`op=status&invoice_id=${encodeURIComponent(invoice)}`); const codes = (j.redemption_info?.orders || []).map((x: any) => x.redemption_info).filter(Boolean);
        setOrdersS(v => { const n = v.map(o => o.invoice === invoice ? {...o, status: j.delivery_status || j.status || o.status, codes: codes.length ? codes : o.codes} : o); saveOrd(n); return n; });
        if (j.delivery_status === 'all_delivered' || codes.length) { setMsg('✓ Готово — смотрите «Мои покупки Bitrefill» ниже.'); return; } } catch { /* keep polling */ }
    }
  };
  // When the country or tab changes (and we are signed in), ask Bitrefill what it sells there and turn the names into presets.
  useEffect(() => {
    if (!valid || kind === 'gift-cards') return; const key = 'bz.bitrefill.p.' + kind + (kind === 'esims' ? 'ALL' : cc);
    try { const c = JSON.parse(sessionStorage.getItem(key) || 'null'); if (c) { setLive(v => ({...v, [kind + cc]: c})); return; } } catch { /* */ }
    let alive = true;
    (async () => { for (const t of kind === 'esims' ? ['esim', ''] : [CNAME[cc] || cc, '']) { try { const j = await get(`op=search&kind=${kind}&q=${encodeURIComponent(t)}${kind === 'esims' || cc === 'ALL' ? '' : '&country=' + cc}`); const names = arr(j).map((p: any) => String(p.name || p.slug || ''))
      .map(n => kind === 'esims' ? dest(n) : n.replace(new RegExp('\\s*(' + (CNAME[cc] || cc) + '|USA|PIN|Bundle|Top ?up|eSIM)\\b.*$', 'i'), '').trim()).filter(Boolean); const uniq = [...new Set(names)].slice(0, 10);
      if (uniq.length) { if (alive) setLive(v => ({...v, [kind + (kind === 'esims' ? 'ALL' : cc)]: uniq})); sessionStorage.setItem(key, JSON.stringify(uniq)); return; } } catch { /* next */ } } })();
    return () => { alive = false; };
  }, [kind, cc, valid]);

  return <div className="bf" data-testid="bitrefill">
    <div className="bf-head">
      <div><b>🎁 Bitrefill</b><small>пополнение телефона, подарочные карты, eSIM · платите USDC с вашего Coinbase · аккаунт Bitrefill не нужен</small></div>
      {valid ? <span className="bf-on">● вход выполнен</span> : <button type="button" className="bz-btn acc" disabled={busy === 'connect'} onClick={() => void connect()} data-testid="bf-connect">{busy === 'connect' ? 'Подтвердите в кошельке…' : w.address ? 'Войти в Bitrefill кошельком' : 'Войти через Coinbase'}</button>}
    </div>
    <div className="mp-pkgs bz-groups">{KINDS.map(k => <button key={k.id} type="button" aria-pressed={kind === k.id} style={{'--pc': k.color} as React.CSSProperties} className="bz-prov mp-pkg" onClick={() => { setKind(k.id); setItems([]); setSel(null); }}>
      <span className="bz-prov-glow"/><b>{k.icon} {k.ru}</b><small>{(k.id === 'topups' ? TOPUP[cc] || PRESETS.topups : PRESETS[k.id]).slice(0, 3).join(' · ')}</small></button>)}</div>
    <div className="mp-top">
      {kind === 'esims' ? <span className="bf-cc bf-where">✈ Куда едете</span> : <select className="bf-cc" value={cc} onChange={e => { setCc(e.target.value); setItems([]); setSel(null); setMsg(''); }} aria-label="Страна">{COUNTRIES.map(c => <option key={c}>{c}</option>)}</select>}
      <div className="mp-bar" onClick={e => { if (e.target === e.currentTarget) (e.currentTarget.querySelector('input') as HTMLInputElement)?.focus(); }}>
        <input value={q} onChange={e => setQ(e.target.value)} onKeyDown={e => e.key === 'Enter' && void search()} placeholder={kind === 'esims' ? 'страна поездки…' : 'оператор, бренд…'} style={{width: `min(60%, ${Math.max(140, q.length * 8.6 + 40)}px)`}} data-testid="bf-q"/>
        <div className="mp-presets">{presets.map(x => <button key={x} type="button" disabled={!!busy} onClick={() => { const t = ALIAS[x] || x; setQ(t); void search(t); }}>{x}</button>)}</div>
        <button type="button" className="mp-ask" disabled={!!busy || !q.trim()} onClick={() => void search()} aria-label="Найти">{busy === 'search' ? '…' : '→'}</button>
      </div>
    </div>
    {msg && <p className="bz-note" data-testid="bf-msg">{msg}{msg.includes('в другой стране') && <> <button type="button" className="bz-link" onClick={() => { const b = (msg.match(/«(.+?)»/) || [])[1] || q; setCc('ALL'); setSel(null); setQ(b); void search(b, kind, 'ALL'); }}>Искать «{(msg.match(/«(.+?)»/) || [])[1]}» во всех странах →</button></>}</p>}
    {items.length > 0 && !sel && <div className="bz-cards">{items.map(p => <button key={p.slug} type="button" className={'bz-card' + (gone.has(p.slug) ? ' bf-gone' : '')} disabled={gone.has(p.slug)} title={gone.has(p.slug) ? 'Сейчас недоступно в Bitrefill' : undefined} onClick={() => void open(p)}>
      <span className={'bz-card-img' + (p.image ? '' : ' art t1')}>{p.image ? <img src={p.image} alt="" loading="lazy"/> : <span className="bz-glyph">{KINDS.find(k => k.id === kind)!.icon}</span>}</span>
      <b>{kind === 'esims' ? 'eSIM · ' + dest(p.name) : p.name}</b><small>{p.country || ''} {p.pkgs.length ? `· ${p.pkgs.length} номиналов` : ''}</small><small>{gone.has(p.slug) ? 'сейчас недоступно' : 'Выбрать ⤢'}</small></button>)}</div>}
    {sel && <div className="bz-box bz-svcdetail bf-buy" style={{'--pc': '#3f7bf2'} as React.CSSProperties} data-testid="bf-buy">
      <div className="bz-svcdetail-h"><b>{sel.name}</b><button type="button" className="bz-link" onClick={() => setSel(null)}>← к списку</button></div>
      {busy === 'detail' ? <p>Загружаю номиналы…</p> : <div className="mp-opts">{sel.pkgs.map(x => <button key={String(x.value)} type="button" className="mp-chip" aria-pressed={pkg?.value === x.value} onClick={() => setPkg(x)}><b>{x.label}</b>{x.price && <small>≈ {x.price} USDC</small>}</button>)}</div>}
      {kind === 'topups' && <label className="bf-phone">Номер телефона<input value={phone} onChange={e => setPhone(e.target.value)} placeholder="+995 5xx xxx xxx" inputMode="tel"/><small>Номер уйдёт в Bitrefill, чтобы пополнить баланс.</small></label>}
      <div className="bz-row"><button type="button" className="bz-btn acc" disabled={!pkg || !valid || busy === 'pay' || (kind === 'topups' && phone.replace(/\D/g, '').length < 7)} onClick={() => void buy()} data-testid="bf-pay">
        {busy === 'pay' ? 'Подтвердите в кошельке…' : pkg ? `Оплатить ${pkg.label} с Coinbase` : 'Выберите номинал'}</button>
        {!valid && <small className="bz-warn">Сначала «Войти в Bitrefill кошельком» вверху.</small>}</div>
      <small className="bz-note">Кошелёк покажет: отправить N USDC (Base) получателю Bitrefill. Это и есть оплата — отдельно ничего пересылать не нужно. Счёт действует ~15 минут.</small>
    </div>}
    {orders.length > 0 && <div className="bf-orders"><div className="bz-step"><span>🧾</span>Мои покупки Bitrefill</div>
      {orders.map(o => <div key={o.invoice} className="bz-box bf-order"><div className="bz-svcdetail-h"><b>{o.product}</b><span>{o.amount}</span><span>{o.status}</span><span>{new Date(o.at).toLocaleString('ru')}</span></div>
        {o.phone && <small>на номер {o.phone}</small>}
        {(o.codes || []).map((c: any, i: number) => <div key={i} className="bf-code">{c.code && <><small>Код</small><code>{c.code}</code></>}{c.pin && <><small>PIN</small><code>{c.pin}</code></>}{c.link && <a href={c.link} target="_blank" rel="noreferrer">Открыть ↗</a>}</div>)}
        <div className="bz-row"><button type="button" className="bz-link" onClick={() => void poll(o.invoice)}>обновить статус</button>{o.tx && <a className="bz-link" href={`https://basescan.org/tx/${o.tx}`} target="_blank" rel="noreferrer">транзакция ↗</a>}</div></div>)}</div>}
    {raw && <details className="bf-raw"><summary>Технический ответ Bitrefill</summary><pre>{JSON.stringify(raw, null, 1).slice(0, 2500)}</pre></details>}
  </div>;
}
