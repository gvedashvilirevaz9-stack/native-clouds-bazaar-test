// Storefront runtime: renders a ShopConfig into the page. No framework, no server.
// Runs in three places: the portal preview (mode "edit"), the preset gallery ("gallery"),
// and the exported single HTML file ("file") that the owner sends in a messenger.
import qrcode from 'qrcode-generator';
import type {ShopConfig, Cell, Section, Img} from '../model';
import {units, fmt, fmt6, tagged, newCode, payUri, findPayment, payWithWallet, head, txUrl} from '../chain';

type Mode = 'file' | 'edit' | 'gallery' | 'bazaar';   // bazaar: someone else's price list opened in the portal's Bazaar; the portal takes the payment
type Line = {id: string; qty: number};
type Group = {to: string | null; seller?: string; total: string; amount: string; paid?: {tx: string; from: string; confirmed: boolean; exact?: boolean; amount?: string} | null};
type Order = {code: number; created: number; startBlock: number | null; items: {id: string; title: string; price: string; qty: number; seller?: string}[]; groups: Group[]; buyer: {name: string; contact: string; comment: string}};

const esc = (s: unknown) => String(s ?? '').replace(/[&<>"']/g, c => ({'&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'}[c]!));
let ASSETS: string[] = [];
const src = (s: string) => s.startsWith('#a') ? ASSETS[+s.slice(2)] || '' : s;
const bg = (i: Img) => i?.src ? `background-image:linear-gradient(180deg,transparent,#07141cbb),url('${src(i.src).replace(/'/g, '%27')}');background-position:${esc(i.pos || 'center')}` : '';
const bgPlain = (i: Img) => i?.src ? `background-image:url('${src(i.src).replace(/'/g, '%27')}');background-position:${esc(i.pos || 'center')}` : '';
const mapUrl = (q: string) => 'https://www.google.com/maps/search/?api=1&query=' + encodeURIComponent(q);
const SUN = 'https://sunspace.club/';
const short = (a: string) => a.slice(0, 6) + '…' + a.slice(-4);
function qr(text: string) {
  const q = qrcode(0, 'M'); q.addData(text); q.make(); const n = q.getModuleCount(), cell = 6, pad = 3, size = (n + pad * 2) * cell;
  const c = document.createElement('canvas'); c.width = c.height = size; const g = c.getContext('2d')!;
  g.fillStyle = '#fff'; g.fillRect(0, 0, size, size); g.fillStyle = '#000';
  for (let r = 0; r < n; r++) for (let k = 0; k < n; k++) if (q.isDark(r, k)) g.fillRect((k + pad) * cell, (r + pad) * cell, cell, cell);
  return c.toDataURL('image/png');
}
const store = {
  get<T>(k: string, d: T): T { try { const v = localStorage.getItem(k); return v ? JSON.parse(v) : d; } catch { return d; } },
  set(k: string, v: unknown) { try { localStorage.setItem(k, JSON.stringify(v)); } catch { /* private mode */ } },
};

export function mount(root: HTMLElement, initial: ShopConfig, mode: Mode = 'file') {
  let cfg = initial; ASSETS = (initial as any).assets || []; let active = 0; let cart: Line[] = mode === 'file' ? store.get('sx.cart.' + cfg.id, []) : [];
  let orders: Order[] = mode === 'file' ? store.get('sx.orders.' + cfg.id, []) : [];
  let view: null | {k: 'cart'} | {k: 'order'; code: number} = null;
  const saveCart = () => mode === 'file' && store.set('sx.cart.' + cfg.id, cart);
  const saveOrders = () => mode === 'file' && store.set('sx.orders.' + cfg.id, orders.slice(-30));
  const post = (msg: any) => { try { window.parent?.postMessage({source: 'sunrise-shop', ...msg}, '*'); } catch { /* standalone */ } };
  const cells = () => cfg.sections.flatMap(s => s.cells);
  const cellById = (id: string) => cells().find(c => c.id === id);
  const receiverOf = (c: Cell) => cfg.payment.mode === 'individual' ? (c.receiver || null) : (cfg.payment.address || null);
  let toastT: any;
  const toast = (t: string) => { let el = root.querySelector('.sx-toast') as HTMLElement; if (!el) { el = document.createElement('div'); el.className = 'sx-toast'; root.appendChild(el); } el.textContent = t; clearTimeout(toastT); toastT = setTimeout(() => el.remove(), 2400); };
  const copy = async (t: string, what = 'Скопировано') => { try { await navigator.clipboard.writeText(t); toast(what); } catch { prompt('Скопируйте:', t); } };
  const editBtn = (target: object, cls = 'tr', label = '✎') => mode === 'edit' ? `<button class="sx-edit ${cls}" data-edit='${esc(JSON.stringify(target))}'>${label}</button>` : '';

  // ---------- page ----------
  function render() {
    const t = cfg.theme; const s = cfg.sections[Math.min(active, cfg.sections.length - 1)];
    root.className = `sx r-${t.radius}`;
    root.style.cssText = `--ink:${t.ink};--paper:${t.paper};--accent:${t.accent};--accent2:${t.accent2};--dark:${t.dark}`;
    const n = cart.reduce((a, l) => a + l.qty, 0); const h = cfg.hero;
    root.innerHTML = `
<div class="sx-strip"><span>${esc(cfg.brand.stripLeft)}</span><span>${esc(cfg.brand.stripRight)}</span></div>
<header class="sx-head" style="position:relative">${editBtn({kind: 'brand'}, 'tl')}
 <div class="sx-brand"><span class="sx-logo" style="${bgPlain(cfg.brand.logo)}">${cfg.brand.logo ? '' : esc((cfg.brand.name || '?').trim()[0] || '?')}</span><span>${esc(cfg.brand.name)}</span></div>
 <div class="sx-head-r">${cfg.brand.place ? `<span class="sx-chip">📍 ${esc(cfg.brand.place)}</span>` : ''}${contactBtn()}
  <button class="sx-btn dark" data-act="cart">🛒 Корзина ${n ? `<span class="sx-cart-n">${n}</span>` : ''}</button></div></header>
${h.show ? `<section class="sx-wrap" style="position:relative">${editBtn({kind: 'hero'})}
 <div class="sx-hero-h"><div><span class="sx-eyebrow"><span class="sx-dot"></span>${esc(h.eyebrow)}</span><h1>${esc(h.title)}<span class="sx-period">.</span></h1><p>${esc(h.sub)}</p></div></div>
 <div class="sx-board"><div class="sx-bl"><span class="sx-num">${esc(h.markTop)}</span><span class="sx-mark">${esc(h.markMain)}<br><i>${esc(h.markItalic)}</i></span><span class="sx-small">${esc(h.markSmall)}</span></div>
  <div class="sx-bc"><strong>${esc(cfg.brand.name)}</strong><small>${orders.length ? `ВАШИХ ЗАКАЗОВ: ${orders.length}` : 'ОПЛАТА USDC · СЕТЬ BASE'}</small>
   <form class="sx-search" data-act="search"><input name="q" placeholder="Найти товар или услугу…" maxlength="80"><button>Найти</button></form></div>
  <div class="sx-br"><span class="sx-sticker">${esc(h.sticker)}</span><span class="sx-cross">✳</span><span>${esc(h.sideText)}</span></div></div></section>` : ''}
<section class="sx-wrap sx-disc"><div class="sx-sh"><div><span class="sx-eyebrow">${esc(cfg.discover.eyebrow)}</span><h2>${esc(cfg.discover.title)}<span class="sx-period">.</span></h2></div>
 <div class="sx-ctl"><span>${String(active + 1).padStart(2, '0')} / ${String(cfg.sections.length).padStart(2, '0')}</span><button data-act="prev" aria-label="Назад">‹</button><button data-act="next" aria-label="Вперёд">›</button></div></div>
 ${s ? `<div class="sx-bb">${editBtn({kind: 'section', sectionId: s.id}, 'tr', '✎ Баннер и раздел')}<div class="sx-bb-img ${s.banner?.src ? '' : 'empty'}" style="${bgPlain(s.banner)}"></div><div class="sx-bb-ov"></div>
  <div class="sx-bb-c"><span class="sx-kick">${String(active + 1).padStart(2, '0')} / ${String(cfg.sections.length).padStart(2, '0')} · ${esc(s.kicker)}</span><h3>${esc(s.title)}</h3><p>${esc(s.text)}</p>${s.cta ? `<button class="sx-cta" data-act="tocells">${esc(s.cta)} ↘</button>` : ''}</div>
  ${s.side ? `<div class="sx-side">${esc(s.side)}<b>✳</b></div>` : ''}</div>` : ''}
 <div class="sx-tabs" role="tablist">${cfg.sections.map((x, i) => `<button role="tab" aria-selected="${i === active}" data-tab="${i}"><span>${String(i + 1).padStart(2, '0')}</span><strong>${esc(x.tab)}</strong>↘</button>`).join('')}</div></section>
${s ? `<section class="sx-cab" id="sx-cells"><div class="sx-cab-top"><span class="sx-eyebrow">✳ ${String(active + 1).padStart(2, '0')} / ${esc(cfg.brand.place || cfg.brand.name)}</span><h2>${esc(s.tab)}<span class="sx-period">.</span></h2><p>${esc(s.text)}</p></div>
 <div class="sx-grid">${s.cells.filter(c => !c.hidden || mode === 'edit').map(c => card(s, c)).join('')}${mode === 'edit' ? `<button class="sx-card" data-edit='${esc(JSON.stringify({kind: 'add-cell', sectionId: s.id}))}' style="min-height:220px;align-items:center;justify-content:center;border-style:dashed;font-weight:800;font-size:14px">＋ Добавить ячейку</button>` : ''}</div></section>` : ''}
<footer class="sx-foot"><div><strong>${esc(cfg.brand.name)}</strong>${credit()}</div><p>${esc(cfg.footer.text)}</p><span>${esc(cfg.footer.right)}</span></footer>
${(cfg.credit?.mode ?? 'sunrise') === 'sunrise' ? `<a class="sx-wm" href="${esc(SUN)}" target="_blank" rel="noopener" title="Сделано в Native Clouds · Sunrise">☁ Native Clouds</a>` : ''}`;
    if (view) overlay();
  }
  function credit() {
    const c = cfg.credit || {mode: 'sunrise', text: 'Native Clouds · Sunrise', url: SUN, logo: null};
    if (c.mode === 'none') return '';
    const url = c.mode === 'sunrise' ? SUN : (c.url || '');
    const inner = `${c.logo?.src ? `<span class="sx-credit-logo" style="${bgPlain(c.logo)}"></span>` : '<b>☁</b>'}<span>${esc(c.mode === 'sunrise' ? 'Сделано в Native Clouds · Sunrise' : c.text)}</span>`;
    return url ? `<a class="sx-credit" href="${esc(url)}" target="_blank" rel="noopener">${inner}</a>` : `<span class="sx-credit">${inner}</span>`;
  }
  function contactBtn() {
    const c = cfg.contact || {};
    const href = c.telegram ? 'https://t.me/' + c.telegram.replace(/^@|https?:\/\/t\.me\//g, '') : c.whatsapp ? 'https://wa.me/' + c.whatsapp.replace(/\D/g, '') : c.email ? 'mailto:' + c.email : c.phone ? 'tel:' + c.phone : '';
    return href ? `<a class="sx-btn" href="${esc(href)}" target="_blank" rel="noopener">✉ Написать</a>` : '';
  }
  function card(s: Section, c: Cell) {
    const inCart = cart.find(l => l.id === c.id);
    const to = c.price ? receiverOf(c) : null;
    return `<article class="sx-card" ${c.hidden ? 'style="opacity:.45"' : ''}>${editBtn({kind: 'cell', sectionId: s.id, cellId: c.id}, 'tl')}
  <div class="sx-ci ${c.image?.src ? '' : 'empty'}" style="${bg(c.image)}">${!c.image?.src && c.icon ? `<span class="ico">${esc(c.icon)}</span>` : ''}<span style="position:relative">${esc(c.tags[0] || '')}</span><span class="sx-arrow">↘</span></div>
  <div class="sx-cc">${c.tags.length > 1 ? `<div class="sx-tags">${c.tags.slice(1).map(t => `<span>${esc(t)}</span>`).join('')}</div>` : ''}
   <h3>${esc(c.title)}</h3>${c.text ? `<p>${esc(c.text)}</p>` : ''}
   ${c.place || c.seller || (cfg.payment.mode === 'individual' && c.price) ? `<div class="sx-meta">${c.place ? `<a href="${mapUrl(c.place)}" target="_blank" rel="noopener">📍 ${esc(c.place)}</a>` : ''}${c.seller ? `<span>🙋 Продавец: <b>${esc(c.seller)}</b></span>` : ''}${cfg.payment.mode === 'individual' && c.price ? `<span>💳 ${to ? 'Свой кошелёк: ' + short(to) : mode === 'gallery' ? 'Свой кошелёк продавца' : 'Кошелёк не указан'}</span>` : ''}</div>` : ''}
   ${c.price ? `<div class="sx-buy"><span class="sx-price">${esc(c.price)}<small>USDC${c.unit ? ' / ' + esc(c.unit) : ''}</small></span><button class="sx-add ${inCart ? 'in' : ''}" data-add="${esc(c.id)}">${inCart ? '✓ В корзине · ' + inCart.qty : '＋ В корзину'}</button></div>` : ''}
  </div></article>`;
  }

  // ---------- cart and checkout ----------
  function overlay() {
    root.querySelector('.sx-scrim')?.remove();
    if (!view) return;
    const el = document.createElement('div');
    el.className = 'sx-scrim' + (view.k === 'order' ? ' center' : '');
    el.innerHTML = view.k === 'cart' ? cartHtml() : orderHtml(orders.find(o => o.code === (view as any).code)!);
    root.appendChild(el);
  }
  const lineItems = () => cart.map(l => ({l, c: cellById(l.id)})).filter(x => x.c && x.c.price) as {l: Line; c: Cell}[];
  function cartHtml() {
    const items = lineItems(); const total = items.reduce((a, x) => a + units(x.c.price!) * BigInt(x.l.qty), 0n);
    const recvs = new Set(items.map(x => receiverOf(x.c) || '—'));
    return `<aside class="sx-drawer" role="dialog" aria-label="Корзина"><button class="sx-x" data-act="close">×</button><h2 class="sx-h">Корзина</h2>
  ${items.length ? items.map(({l, c}) => `<div class="sx-line"><span>${esc(c.title)}<small>${esc(c.price)} USDC${c.unit ? ' / ' + esc(c.unit) : ''}${c.seller ? ' · ' + esc(c.seller) : ''}</small></span>
   <span class="sx-qty"><button data-qty="${esc(c.id)}" data-d="-1">−</button>${l.qty}<button data-qty="${esc(c.id)}" data-d="1">＋</button></span><b>${fmt(units(c.price!) * BigInt(l.qty))}</b></div>`).join('') : '<p class="sx-note">Корзина пуста. Добавьте товар или услугу кнопкой «＋ В корзину».</p>'}
  ${items.length ? `<div class="sx-total"><span>Итого</span><span>${fmt(total)} USDC</span></div>
  ${recvs.size > 1 ? `<p class="sx-note">В корзине вещи ${recvs.size} продавцов — каждому будет свой QR.</p>` : ''}
  <label class="sx-f">Ваше имя<input name="name" maxlength="60"></label><label class="sx-f">Как с вами связаться (телефон, Telegram)<input name="contact" maxlength="80"></label><label class="sx-f">Комментарий (размер, дата, адрес доставки)<textarea name="comment" rows="2" maxlength="300"></textarea></label>
  <button class="sx-btn acc" data-act="checkout" style="justify-content:center;padding:13px">Перейти к оплате →</button>` : ''}
  ${orders.length ? `<h3 style="margin:14px 0 0;font-size:14px">Ваши заказы</h3>${orders.slice().reverse().map(o => `<button class="sx-line" data-order="${o.code}" style="text-align:left;border:0"><span>Заказ <span class="sx-code">#${o.code}</span><small>${new Date(o.created).toLocaleString()}</small></span><span>${o.groups.every(g => g.paid) ? '✓ оплачен' : 'ждёт оплаты'}</span><b>›</b></button>`).join('')}` : ''}
 </aside>`;
  }
  function checkout() {
    const items = lineItems(); if (!items.length) return;
    const f = root.querySelector('.sx-drawer') as HTMLElement;
    const val = (n: string) => ((f.querySelector(`[name=${n}]`) as HTMLInputElement)?.value || '').trim();
    // In the Bazaar the page only collects the cart; payment, wallet and checks happen in the portal (outside this sandbox).
    if (mode === 'bazaar') { post({type: 'bazaar:checkout', lines: items.map(({l, c}) => ({id: c.id, qty: l.qty})), buyer: {name: val('name'), contact: val('contact'), comment: val('comment')}}); cart = []; view = null; render(); toast('Корзина передана в Базар → оплата'); return; }
    const code = newCode(); const by = new Map<string, {to: string | null; seller?: string; total: bigint}>();
    for (const {l, c} of items) { const to = receiverOf(c); const k = (to || 'none') + '|' + (cfg.payment.mode === 'individual' ? c.seller || '' : ''); const g = by.get(k) || {to, seller: cfg.payment.mode === 'individual' ? c.seller : undefined, total: 0n}; g.total += units(c.price!) * BigInt(l.qty); by.set(k, g); }
    const groups: Group[] = [...by.values()].map(g => ({to: g.to, seller: g.seller, total: fmt(g.total), amount: cfg.payment.orderTag && g.total % 10000n === 0n ? fmt6(tagged(g.total, code)) : fmt(g.total), paid: null}));
    const o: Order = {code, created: Date.now(), startBlock: null, items: items.map(({l, c}) => ({id: c.id, title: c.title, price: c.price!, qty: l.qty, seller: c.seller})), groups, buyer: {name: val('name'), contact: val('contact'), comment: val('comment')}};
    orders.push(o); cart = []; saveCart(); saveOrders(); view = {k: 'order', code}; render();
    if (mode !== 'gallery') head().then(h => { o.startBlock = h - 30; saveOrders(); }).catch(() => { /* offline: estimated later from the order time */ });
    post({type: 'shop:order', code});
  }
  function message(o: Order) {
    const lines = o.items.map(i => `• ${i.title} ×${i.qty} — ${fmt(units(i.price) * BigInt(i.qty))} USDC${i.seller ? ' (' + i.seller + ')' : ''}`);
    const pay = o.groups.map(g => `${g.seller ? g.seller + ': ' : ''}${g.amount} USDC → ${g.to || 'адрес не указан'}${g.paid ? `\n  ✓ оплачено${g.paid.exact === false ? ' (' + g.paid.amount + ' USDC, без номера)' : ''}, tx ${g.paid.tx}` : '\n  ещё не оплачено'}`);
    return `Заказ #${o.code} · ${cfg.brand.name}\n${lines.join('\n')}\nК оплате (USDC, сеть Base):\n${pay.join('\n')}${o.buyer.name ? '\nИмя: ' + o.buyer.name : ''}${o.buyer.contact ? '\nСвязь: ' + o.buyer.contact : ''}${o.buyer.comment ? '\nКомментарий: ' + o.buyer.comment : ''}`;
  }
  function orderHtml(o: Order) {
    const c = cfg.contact || {}; const msg = message(o); const allPaid = o.groups.every(g => g.paid);
    const wa = c.whatsapp ? `https://wa.me/${c.whatsapp.replace(/\D/g, '')}?text=${encodeURIComponent(msg)}` : '';
    const tg = c.telegram ? 'https://t.me/' + c.telegram.replace(/^@|https?:\/\/t\.me\//g, '') : '';
    const mail = c.email ? `mailto:${c.email}?subject=${encodeURIComponent('Заказ #' + o.code)}&body=${encodeURIComponent(msg)}` : '';
    return `<div class="sx-modal" role="dialog" aria-label="Оплата"><button class="sx-x" data-act="close">×</button>
  <h2 class="sx-h">Заказ <span class="sx-code">#${o.code}</span></h2>
  ${mode === 'gallery' ? '<p class="sx-demo">Это пример витрины. В вашем магазине здесь будет QR на ваш кошелёк — покупатель оплатит, а портал увидит платёж.</p>' : ''}
  ${o.groups.map((g, i) => payHtml(o, g, i)).join('')}
  <p class="sx-note">${esc(cfg.payment.note)}${cfg.payment.orderTag ? ` Последние цифры суммы — номер заказа (${String(o.code).padStart(4, '0')}): так продавец узнает ваш платёж. Не округляйте сумму.` : ''}</p>
  <div class="sx-st ${allPaid ? 'ok' : ''}">${allPaid ? '✓ Оплата найдена в сети Base. Отправьте заказ продавцу — это ваш чек.' : 'После оплаты нажмите «Проверить оплату», затем отправьте заказ продавцу.'}</div>
  <div class="sx-row"><b style="font-size:12px">Отправить заказ продавцу:</b>
   ${wa ? `<a class="sx-mini" href="${esc(wa)}" target="_blank" rel="noopener">WhatsApp</a>` : ''}${tg ? `<a class="sx-mini" href="${esc(tg)}" target="_blank" rel="noopener" data-copy-first="1">Telegram</a>` : ''}${mail ? `<a class="sx-mini" href="${esc(mail)}">E-mail</a>` : ''}
   <button class="sx-mini" data-copy="${esc(msg)}">Скопировать текст</button></div>
 </div>`;
  }
  function payHtml(o: Order, g: Group, i: number) {
    if (!g.to) return `<div class="sx-pay" style="grid-template-columns:1fr"><h4>${g.seller ? esc(g.seller) + ' · ' : ''}${esc(g.amount)} USDC</h4><p class="sx-warn">${mode === 'gallery' ? 'В примере адрес не указан.' : 'Продавец ещё не указал кошелёк для оплаты. Отправьте ему заказ — он пришлёт реквизиты.'}</p></div>`;
    const u = units(g.amount); const uri = payUri(g.to, u);
    return `<div class="sx-pay" data-g="${i}"><img src="${qr(uri)}" alt="QR для оплаты"><div style="display:flex;flex-direction:column;gap:7px">
   <h4>${g.seller ? 'Продавец: ' + esc(g.seller) : 'Оплата'} · USDC · Base</h4><span class="sx-amt">${esc(g.amount)} <small style="font-size:12px">USDC</small></span>
   <span class="sx-addr">${esc(g.to)}</span>
   <div class="sx-row"><button class="sx-mini" data-copy="${esc(g.to)}">Копировать адрес</button><button class="sx-mini" data-copy="${esc(g.amount)}">Копировать сумму</button><a class="sx-mini" href="${esc(uri)}">Открыть в кошельке</a>${(window as any).ethereum ? `<button class="sx-mini" data-wallet="${i}">Оплатить кошельком браузера</button>` : ''}</div>
   <span class="sx-warn">Только USDC в сети Base (chain 8453). Сумму, сеть и получателя проверьте в кошельке до подтверждения. Платите с личного кошелька (MetaMask, Coinbase Wallet…): биржа может округлить сумму или удержать из неё комиссию.</span>
   ${g.amount !== g.total ? `<span class="sx-note">Кошелёк не даёт ввести 6 знаков после точки? Отправьте ровно <b>${esc(g.total)}</b> USDC <button class="sx-mini" data-copy="${esc(g.total)}">копировать</button> и обязательно отправьте продавцу заказ — по хешу он найдёт ваш платёж.</span>` : ''}
   <div class="sx-row"><button class="sx-mini" data-check="${i}" style="background:var(--dark);color:#fff">Проверить оплату</button><span class="sx-st ${g.paid ? (g.paid.exact === false ? 'wait' : 'ok') : ''}" data-status="${i}">${g.paid ? `${g.paid.exact === false ? `✓ Найден платёж ${esc(g.paid.amount)} USDC без номера заказа — отправьте продавцу заказ, в нём будет хеш` : '✓ Оплачено'} · <a href="${txUrl(g.paid.tx)}" target="_blank" rel="noopener">${short(g.paid.tx)}</a>` : 'ждёт оплаты'}</span></div></div></div>`;
  }
  async function check(o: Order, i: number) {
    const g = o.groups[i]; const st = root.querySelector(`[data-status="${i}"]`) as HTMLElement;
    if (!g.to) return; if (mode === 'gallery') { st.textContent = 'В примере проверка не выполняется'; return; }
    st.className = 'sx-st wait'; st.textContent = 'Ищу платёж в сети Base…';
    try {
      const r = await findPayment({to: g.to, amount: units(g.amount), base: units(g.total), startBlock: o.startBlock, created: o.created});
      if (r.paid) { g.paid = {tx: r.tx, from: r.from, confirmed: r.confirmed, exact: r.exact, amount: fmt(r.amount)}; saveOrders(); post({type: 'shop:paid', code: o.code, tx: r.tx}); render(); }
      else { st.className = 'sx-st'; st.textContent = 'Пока не видно. Если уже оплатили — подождите минуту и проверьте снова.'; }
    } catch { st.className = 'sx-st err'; st.textContent = 'Нет связи с сетью. Проверьте интернет и попробуйте ещё раз.'; }
  }

  // ---------- events ----------
  root.addEventListener('click', async e => {
    const t = (e.target as HTMLElement).closest('[data-act],[data-tab],[data-add],[data-qty],[data-copy],[data-check],[data-wallet],[data-order],[data-edit]') as HTMLElement | null;
    if (!t) { if ((e.target as HTMLElement).classList.contains('sx-scrim')) { view = null; overlay(); } return; }
    const d = t.dataset;
    if (d.edit) { e.preventDefault(); post({type: 'shop:edit', target: JSON.parse(d.edit)}); return; }
    if (d.tab) { active = +d.tab; render(); post({type: 'shop:section', index: active}); return; }
    if (d.add) { const l = cart.find(x => x.id === d.add); if (l) { view = {k: 'cart'}; } else { cart.push({id: d.add, qty: 1}); toast('Добавлено в корзину'); } saveCart(); render(); return; }
    if (d.qty) { const l = cart.find(x => x.id === d.qty); if (l) { l.qty += +d.d!; if (l.qty <= 0) cart = cart.filter(x => x !== l); } saveCart(); render(); return; }
    if (d.copy !== undefined) { await copy(d.copy); if (t.dataset.copyFirst) { /* link opens as well */ } return; }
    if (d.order) { view = {k: 'order', code: +d.order}; render(); return; }
    const o = view?.k === 'order' ? orders.find(x => x.code === (view as any).code) : null;
    if (d.check && o) { void check(o, +d.check); return; }
    if (d.wallet && o) { const g = o.groups[+d.wallet]; try { const tx = await payWithWallet(g.to!, units(g.amount)); toast('Отправлено: ' + short(tx)); setTimeout(() => check(o, +d.wallet!), 6000); } catch (er: any) { toast(er?.message === 'NO_WALLET' ? 'Кошелёк в браузере не найден' : 'Оплата отменена'); } return; }
    switch (d.act) {
      case 'cart': view = {k: 'cart'}; render(); break;
      case 'close': view = null; overlay(); break;
      case 'checkout': checkout(); break;
      case 'prev': active = (active + cfg.sections.length - 1) % cfg.sections.length; render(); break;
      case 'next': active = (active + 1) % cfg.sections.length; render(); break;
      case 'tocells': root.querySelector('#sx-cells')?.scrollIntoView({behavior: 'smooth'}); break;
    }
  });
  root.addEventListener('submit', e => {
    e.preventDefault(); const q = String(new FormData(e.target as HTMLFormElement).get('q') || '').toLowerCase().trim(); if (!q) return;
    const i = cfg.sections.findIndex(s => (s.tab + ' ' + s.title + ' ' + s.cells.map(c => c.title + ' ' + c.text + ' ' + c.tags.join(' ')).join(' ')).toLowerCase().includes(q));
    if (i >= 0) { active = i; render(); root.querySelector('#sx-cells')?.scrollIntoView({behavior: 'smooth'}); } else toast('Ничего не нашлось');
  });
  // The portal pushes new configs into the preview without reloading it (keeps the section and scroll).
  if (mode !== 'file') window.addEventListener('message', e => {
    const m = e.data; if (!m || m.source !== 'sunrise-portal') return;
    if (m.type === 'config') { cfg = m.config; if (active >= cfg.sections.length) active = 0; render(); }
    if (m.type === 'section') { active = Math.max(0, Math.min(cfg.sections.length - 1, m.index)); render(); }
    if (m.type === 'cart') { view = {k: 'cart'}; render(); }
  });
  render();
  return {update(c: ShopConfig) { cfg = c; render(); }, select(i: number) { active = i; render(); }};
}

// Auto-start inside the exported file.
const data = typeof document !== 'undefined' ? document.getElementById('shop-data') : null;
if (data) { const el = document.getElementById('shop')!; mount(el, JSON.parse(data.textContent || '{}'), (el.dataset.mode as Mode) || 'file'); }
(globalThis as any).SunriseShop = {mount};
