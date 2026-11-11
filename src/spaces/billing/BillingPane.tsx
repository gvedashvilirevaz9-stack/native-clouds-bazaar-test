// Billing (Счета): quotes and invoices with a payment block, sharing, statuses and reminders.
import {useEffect, useMemo, useState} from 'react';
import {useLang} from '../../hooks/useLang';
import {invoices, useInvoices, invTotals, invState, lineSum, reminders, fromEstimate, iso, cryptoAmount, type Invoice, type InvLine, type DocKind} from './store';
import {profile, useProfile, hasPayment, type Profile} from './profile';
import {usePlan, plan, PLANS, type PlanId} from './plan';
import {checkAddress, NETWORKS, tokensOn, paymentUri, qrDataUrl, shortAddr, type NetworkId, type TokenId} from './evm';
import {invoicePdf} from './pdf';
import {shareInvoice, downloadInvoice, askAgentToSend, mailto, coverLetter, subjectOf} from './share';
import {useEstimates, totals as esTotals, money} from '../estimate/store';
import {DocVersions} from '../docs/DocVersions';
import '../estimate/estimate.css';
import './billing.css';

const STATE: Record<string, [string, string, string]> = {draft: ['черновик', 'draft', 'draft'], sent: ['отправлен', 'sent', 'sent'], overdue: ['просрочен', 'overdue', 'overdue'], paid: ['оплачен', 'paid', 'paid'], void: ['отменён', 'void', 'void']};
const ADDR_ERR: Record<string, [string, string]> = {format: ['Нужен адрес вида 0x и 40 символов', 'Must be 0x followed by 40 hex characters'], checksum: ['Похоже на опечатку: не сходится контрольная сумма', 'Looks like a typo: checksum does not match'], empty: ['', '']};

function Chip({i, ru}: {i: Invoice; ru: boolean}) { const s = invState(i); const t = STATE[s.key]; return <span className={'bl-chip bl-' + t[2]}>{ru ? t[0] : t[1]}{s.key === 'overdue' ? ` ${s.days} ${ru ? 'дн.' : 'd'}` : ''}</span>; }

// ---------- payment profile ----------
function ProfileForm({ru, onDone}: {ru: boolean; onDone?: () => void}) {
  const p = useProfile(); const pl = usePlan();
  const [addr, setAddr] = useState(p.evm?.address || '');
  const [net, setNet] = useState<NetworkId>(p.evm?.network || 'base');
  const [tok, setTok] = useState<TokenId>(p.evm?.token || 'USDC');
  const [qrMode, setQrMode] = useState<'address' | 'request'>(p.evm?.qr || 'address');
  const [msg, setMsg] = useState<string | null>(null);
  const chk = checkAddress(addr);
  const set = (x: Partial<Profile>) => { try { profile.set(x); setMsg(null); } catch (e) { setMsg(String((e as Error).message)); } };
  useEffect(() => { if (!tokensOn(net).includes(tok)) setTok(tokensOn(net)[0]); }, [net]);
  // Save the wallet as soon as the address is valid; clearing the field removes it.
  useEffect(() => { if (chk.ok) set({evm: {address: chk.address, network: net, token: tok, qr: qrMode, source: 'manual'}}); else if (!addr.trim() && p.evm) set({evm: null}); }, [addr, net, tok, qrMode]);
  const preview = chk.ok ? qrDataUrl(qrMode === 'request' ? paymentUri({address: chk.address, network: net, token: tok, amount: null}) : chk.address, 200) : null;
  const logo = (f?: File | null) => { if (!f) return; if (f.size > 600_000) { setMsg(ru ? 'Логотип до 600 КБ' : 'Logo up to 600 KB'); return; } const r = new FileReader(); r.onload = () => set({logo: String(r.result)}); r.readAsDataURL(f); };
  const F = (k: keyof Profile, label: string, ph = '', type = 'text') => <label className="bl-f"><span>{label}</span><input type={type} value={(p[k] as any) ?? ''} placeholder={ph} onChange={e => set({[k]: type === 'number' ? parseInt(e.target.value) || 0 : e.target.value} as any)}/></label>;
  return <div className="bl-profile" data-testid="bl-profile">
    <h3>{ru ? 'Кто выставляет и как вам платят' : 'Who issues documents and how you get paid'}</h3>
    <p className="bl-lead">{ru ? 'Заполняется один раз. Эти данные попадут в каждое предложение и счёт.' : 'Fill once. This goes on every quote and invoice.'}</p>
    <section className="bl-card"><h4>1 · {ru ? 'Вы' : 'You'}</h4>
      <div className="bl-grid">{F('name', ru ? 'Имя или компания' : 'Name or business', 'Rivera Renovations')}{F('email', 'E-mail', 'you@gmail.com', 'email')}{F('phone', ru ? 'Телефон' : 'Phone')}{F('address', ru ? 'Адрес' : 'Address')}{F('taxId', ru ? 'ИНН / EIN / VAT' : 'Tax ID / EIN / VAT')}{F('website', ru ? 'Сайт' : 'Website')}</div>
      <div className="bl-logo">{p.logo ? <img src={p.logo} alt=""/> : <span>Logo</span>}<label className="bl-btn">{ru ? 'Логотип' : 'Logo'}<input type="file" accept="image/png,image/jpeg" hidden onChange={e => logo(e.target.files?.[0])}/></label>{p.logo && <button type="button" className="bl-link" onClick={() => set({logo: null})}>{ru ? 'убрать' : 'remove'}</button>}</div>
    </section>
    <section className="bl-card"><h4>2 · {ru ? 'Оплата криптой (EVM-кошелёк)' : 'Crypto (EVM wallet)'}</h4>
      <div className="bl-evm">
        <div className="bl-evm-f">
          <label className="bl-f bl-wide"><span>{ru ? 'Ваш публичный адрес' : 'Your public address'}</span>
            <input data-testid="bl-evm" value={addr} onChange={e => setAddr(e.target.value.trim())} placeholder="0x…" spellCheck={false} className={addr ? (chk.ok ? 'is-ok' : 'is-bad') : ''}/></label>
          {addr && <small className={chk.ok ? 'bl-ok' : 'bl-bad'} data-testid="bl-evm-check">{chk.ok ? '✓ ' + (ru ? 'Адрес верный: ' : 'Valid: ') + shortAddr(chk.address) : '✗ ' + ADDR_ERR[(chk as any).reason][ru ? 0 : 1]}</small>}
          <div className="bl-grid3">
            <label className="bl-f"><span>{ru ? 'Сеть' : 'Network'}</span><select value={net} onChange={e => setNet(e.target.value as NetworkId)}>{(Object.keys(NETWORKS) as NetworkId[]).map(n => <option key={n} value={n}>{NETWORKS[n].name}</option>)}</select></label>
            <label className="bl-f"><span>{ru ? 'Монета' : 'Token'}</span><select value={tok} onChange={e => setTok(e.target.value as TokenId)}>{tokensOn(net).map(t => <option key={t}>{t}</option>)}</select></label>
            <label className="bl-f"><span>QR</span><select value={qrMode} onChange={e => setQrMode(e.target.value as any)}><option value="address">{ru ? 'только адрес (везде читается)' : 'address only (works everywhere)'}</option><option value="request">{ru ? 'адрес + сумма (EIP-681)' : 'address + amount (EIP-681)'}</option></select></label>
          </div>
          <p className="bl-note">{ru ? 'Портал не хранит ключи и деньги — только печатает адрес. Клиент платит прямо на ваш кошелёк. USDC/USDT в долларовом счёте подставляются 1:1.' : 'The portal never holds keys or money; it only prints your address. USDC/USDT on a USD invoice are filled 1:1.'}</p>
          <button type="button" className="bl-btn bl-soon" disabled title={ru ? 'Скоро' : 'Soon'}>◎ {ru ? 'Войти через Google + Coinbase — адрес подставится сам (скоро)' : 'Sign in with Google + Coinbase: fills the address (soon)'}</button>
        </div>
        <div className="bl-qr">{preview ? <><img src={preview} alt="QR" data-testid="bl-qr"/><code>{chk.ok && chk.address}</code><button type="button" className="bl-link" onClick={() => chk.ok && navigator.clipboard?.writeText(chk.address)}>{ru ? 'копировать' : 'copy'}</button></> : <span>QR</span>}</div>
      </div>
    </section>
    <section className="bl-card"><h4>3 · {ru ? 'Картой и банком' : 'Card and bank'}</h4>
      <div className="bl-grid">{F('cardLink', ru ? 'Ссылка на оплату (Stripe, PayPal, Square)' : 'Payment link (Stripe, PayPal, Square)', 'https://buy.stripe.com/…')}
        <label className="bl-f"><span>{ru ? 'Банковские реквизиты' : 'Bank details'}</span><textarea rows={3} value={p.bank || ''} onChange={e => set({bank: e.target.value})} placeholder={'Bank of America · Routing 026009593\nAccount 0000 0000 0000'}/></label></div>
    </section>
    <section className="bl-card"><h4>4 · {ru ? 'Документы' : 'Documents'}</h4>
      <div className="bl-grid3">{F('currency', ru ? 'Валюта' : 'Currency', 'USD')}
        <label className="bl-f"><span>{ru ? 'Язык документа' : 'Document language'}</span><select value={p.docLang} onChange={e => set({docLang: e.target.value as any})}><option value="en">English</option><option value="ru">Русский</option></select></label>
        {F('termsDays', ru ? 'Срок оплаты, дней' : 'Payment terms, days', '14', 'number')}{F('prefix', ru ? 'Префикс номера' : 'Number prefix', 'INV')}{F('next', ru ? 'Следующий номер' : 'Next number', '1', 'number')}
        <label className="bl-f"><span>{ru ? 'Напомнить через (дней после срока)' : 'Remind (days after due)'}</span><input value={(p.reminderDays || []).join(', ')} onChange={e => set({reminderDays: e.target.value.split(/[ ,;]+/).map(Number).filter(n => Number.isFinite(n) && n >= -30 && n <= 120).slice(0, 6)})}/></label></div>
    </section>
    <section className="bl-card"><h4>{ru ? 'Тариф' : 'Plan'}</h4>
      <div className="bl-plans">{(Object.keys(PLANS) as PlanId[]).map(id => { const x = PLANS[id]; return <button type="button" key={id} aria-pressed={pl.id === id} onClick={() => plan.set(id)}>
        <strong>{ru ? x.ru : x.en}</strong><em>{x.price}</em><small>{ru ? `${x.devices.computers} комп. + ${x.devices.phones} тел.` : `${x.devices.computers} computer + ${x.devices.phones} phones`}<br/>{x.brandedDocs ? (ru ? 'без нашей подписи, напоминания' : 'your branding, reminders') : (ru ? 'подпись «Sunrise» в подвале' : '"Sunrise" footer')}</small></button>; })}</div>
      <p className="bl-note">{ru ? 'Оплаты в этой версии нет: тариф переключается для проверки. Вход и семейные устройства — следующий этап (PRODUCT.md).' : 'No payments in this build: switch plans to preview. Login and family devices come next (PRODUCT.md).'}</p>
    </section>
    {msg && <p className="bl-bad">{msg}</p>}
    {onDone && <button type="button" className="bl-primary" onClick={onDone} disabled={!p.name}>{ru ? 'Готово' : 'Done'}</button>}
  </div>;
}

// ---------- invoice editor ----------
function LineRow({i, l, ru}: {i: Invoice; l: InvLine; ru: boolean}) {
  const set = (p: Partial<InvLine>) => invoices.patch(i.id, {lines: i.lines.map(x => x.id === l.id ? {...x, ...p} : x)});
  return <div className="bl-line" data-testid="bl-line">
    <input className="bl-ln-name" value={l.name} onChange={e => set({name: e.target.value})} aria-label={ru ? 'Позиция' : 'Item'}/>
    <input type="number" step="any" value={l.qty} onChange={e => set({qty: parseFloat(e.target.value) || 0})} aria-label={ru ? 'Кол-во' : 'Qty'}/>
    <input value={l.unit} onChange={e => set({unit: e.target.value})} aria-label={ru ? 'Ед.' : 'Unit'} placeholder={ru ? 'ед.' : 'unit'}/>
    <input type="number" step="any" value={l.unitPrice} onChange={e => set({unitPrice: parseFloat(e.target.value) || 0})} aria-label={ru ? 'Цена' : 'Price'}/>
    <strong>{money(lineSum(l), i.currency)}</strong>
    <button type="button" className="es-x" aria-label={ru ? 'Удалить' : 'Remove'} onClick={() => invoices.patch(i.id, {lines: i.lines.filter(x => x.id !== l.id)})}>×</button>
  </div>;
}

function InvoiceView({i, ru}: {i: Invoice; ru: boolean}) {
  const p = useProfile(); const tot = invTotals(i); const st = invState(i);
  const [flash, setFlash] = useState<string | null>(null);
  const [preview, setPreview] = useState<string | null>(null);
  useEffect(() => () => { if (preview) URL.revokeObjectURL(preview); }, [preview]);
  useEffect(() => { setPreview(null); }, [i.id]);
  const act = async (fn: () => unknown, ok: string) => { try { const r: any = await fn(); setFlash(typeof r === 'string' ? ok + (r === 'downloaded' ? (ru ? ' (скачан)' : ' (downloaded)') : '') : ok); } catch (e) { setFlash('⚠ ' + String((e as Error).message || e)); } setTimeout(() => setFlash(null), 2800); };
  const showPreview = async () => { const b = await invoicePdf(invoices.get(i.id)!); if (preview) URL.revokeObjectURL(preview); setPreview(URL.createObjectURL(b)); };
  const C = (k: 'name' | 'email' | 'phone' | 'address', label: string) => <label className="bl-f"><span>{label}</span><input value={i.client[k] || ''} onChange={e => invoices.patch(i.id, {client: {...i.client, [k]: e.target.value}})}/></label>;
  const crypto = cryptoAmount(i);
  return <div className="bl-inv" data-testid="bl-invoice">
    <header className="bl-inv-head">
      <div>
        <span className="es-tpl">{i.kind === 'quote' ? (ru ? '📄 Коммерческое предложение' : '📄 Quote') : (ru ? '🧾 Счёт' : '🧾 Invoice')} · <b>{i.number}</b> <Chip i={i} ru={ru}/></span>
        <input className="bl-title" value={i.title || ''} placeholder={ru ? 'За что: «Ремонт ванной, 6 м²»' : 'For: "Bathroom remodel, 65 sq ft"'} onChange={e => invoices.patch(i.id, {title: e.target.value})}/>
      </div>
      <div className="es-kpi es-total"><small>{ru ? 'К оплате' : 'Total due'}</small><strong data-testid="bl-total">{money(tot.total, i.currency)}</strong></div>
    </header>

    <section className="bl-two">
      <div className="bl-card"><h4>{i.kind === 'quote' ? (ru ? 'Для кого' : 'For') : (ru ? 'Плательщик' : 'Bill to')}</h4><div className="bl-grid">{C('name', ru ? 'Имя / компания' : 'Name / company')}{C('email', 'E-mail')}{C('phone', ru ? 'Телефон' : 'Phone')}{C('address', ru ? 'Адрес' : 'Address')}</div></div>
      <div className="bl-card"><h4>{ru ? 'Даты и язык' : 'Dates & language'}</h4><div className="bl-grid">
        <label className="bl-f"><span>{ru ? 'Дата' : 'Issued'}</span><input type="date" value={i.issueDate} onChange={e => invoices.patch(i.id, {issueDate: e.target.value})}/></label>
        <label className="bl-f"><span>{i.kind === 'quote' ? (ru ? 'Действует до' : 'Valid until') : (ru ? 'Оплатить до' : 'Due')}</span><input type="date" value={i.dueDate} onChange={e => invoices.patch(i.id, {dueDate: e.target.value})}/></label>
        <label className="bl-f"><span>{ru ? 'Валюта' : 'Currency'}</span><input value={i.currency} onChange={e => invoices.patch(i.id, {currency: e.target.value.toUpperCase().slice(0, 6)})}/></label>
        <label className="bl-f"><span>{ru ? 'Язык документа' : 'Language'}</span><select value={i.lang} onChange={e => invoices.patch(i.id, {lang: e.target.value as any})}><option value="en">English</option><option value="ru">Русский</option></select></label></div></div>
    </section>

    <section className="bl-card bl-lines">
      <div className="bl-line bl-th"><span>{ru ? 'Позиция' : 'Item'}</span><span>{ru ? 'Кол-во' : 'Qty'}</span><span>{ru ? 'Ед.' : 'Unit'}</span><span>{ru ? 'Цена' : 'Price'}</span><span>{ru ? 'Сумма' : 'Amount'}</span><span/></div>
      {i.lines.map(l => <LineRow key={l.id} i={i} l={l} ru={ru}/>)}
      <button type="button" className="es-add" onClick={() => invoices.patch(i.id, {lines: [...i.lines, {id: '', name: ru ? 'Работа' : 'Labor', qty: 1, unit: ru ? 'ч' : 'h', unitPrice: 0}]})}>＋ {ru ? 'Строка' : 'Line'}</button>
      <div className="bl-sums">
        <label>{ru ? 'Скидка' : 'Discount'} <input type="number" step="any" value={i.discount} onChange={e => invoices.patch(i.id, {discount: parseFloat(e.target.value) || 0})}/></label>
        <label>{ru ? 'Налог, %' : 'Tax, %'} <input type="number" step="any" value={i.taxRate} onChange={e => invoices.patch(i.id, {taxRate: parseFloat(e.target.value) || 0})}/></label>
        <span>{ru ? 'Подытог' : 'Subtotal'} <b>{money(tot.sub, i.currency)}</b></span>{tot.tax ? <span>{ru ? 'Налог' : 'Tax'} <b>{money(tot.tax, i.currency)}</b></span> : null}
      </div>
    </section>
    <label className="bl-f bl-notes"><span>{ru ? 'Примечания (условия, гарантия)' : 'Notes (terms, warranty)'}</span><textarea rows={2} value={i.notes || ''} onChange={e => invoices.patch(i.id, {notes: e.target.value})}/></label>

    <section className={'bl-paybar' + (hasPayment(p) ? '' : ' is-empty')}>
      {hasPayment(p) ? <span>💳 {ru ? 'В документе будет:' : 'On the document:'} {p.evm && <b>QR {p.evm.token} · {NETWORKS[p.evm.network].name}{crypto ? ` · ${crypto} ${p.evm.token}` : i.currency !== 'USD' ? (ru ? ' · без суммы (валюта не USD)' : ' · no amount (not USD)') : ''}</b>}{p.cardLink && <b>QR {ru ? 'карта' : 'card'}</b>}{p.bank && <b>{ru ? 'банк' : 'bank'}</b>}</span>
        : <span>⚠ {ru ? 'Способ оплаты не указан — добавьте кошелёк или ссылку на карту в «Оплата и профиль».' : 'No payment method yet: add a wallet or card link in "Payment & profile".'}</span>}
    </section>

    <section className="bl-actions">
      <button type="button" className="bl-primary" data-testid="bl-pdf" disabled={!i.lines.length} onClick={() => act(() => downloadInvoice(i.id), ru ? 'PDF скачан' : 'PDF downloaded')}>⬇ PDF</button>
      <button type="button" className="bl-primary bl-alt" data-testid="bl-share" disabled={!i.lines.length} onClick={() => act(() => shareInvoice(i.id), ru ? 'Готово' : 'Done')}>↗ {ru ? 'Поделиться' : 'Share'}</button>
      <a className="bl-btn" href={mailto(i.client.email || '', subjectOf(i), coverLetter(i))} onClick={() => i.status === 'draft' && setTimeout(() => invoices.setStatus(i.id, 'sent', 'mail'), 300)}>✉ {ru ? 'Письмо' : 'E-mail'}</a>
      <button type="button" className="bl-btn" data-testid="bl-agent-send" onClick={() => act(() => askAgentToSend(i.id), ru ? 'Агент отправит с вашей почты' : 'The agent will send it from your mailbox')}>📱 {ru ? 'Агент отправит' : 'Agent sends'}</button>
      <button type="button" className="bl-btn" data-testid="bl-preview" disabled={!i.lines.length} onClick={() => act(showPreview, ru ? 'Предпросмотр' : 'Preview')}>👁 {ru ? 'Посмотреть' : 'Preview'}</button>
      <span className="es-sep"/>
      {i.status === 'draft' && <button type="button" className="bl-btn" onClick={() => invoices.setStatus(i.id, 'sent', 'manual')}>{ru ? 'Отметить: отправлен' : 'Mark sent'}</button>}
      {i.status !== 'paid' && i.kind === 'invoice' && <button type="button" className="bl-btn bl-paid" data-testid="bl-mark-paid" onClick={() => invoices.setStatus(i.id, 'paid', 'manual')}>✓ {ru ? 'Оплачен' : 'Paid'}</button>}
      {i.kind === 'quote' && <button type="button" className="bl-btn" onClick={() => { const n = invoices.create({...i, kind: 'invoice', number: undefined, dueDate: undefined, issueDate: undefined, lines: i.lines}); invoices.patch(i.id, {status: 'sent'}, 'accepted → ' + n.number); }}>→ {ru ? 'Счёт по предложению' : 'Invoice from quote'}</button>}
      {st.key === 'overdue' && <button type="button" className="bl-btn bl-warn" onClick={() => act(() => askAgentToSend(i.id, 'remind', st.days), ru ? 'Агент напомнит клиенту' : 'The agent will remind the client')}>⏰ {ru ? 'Напомнить' : 'Remind'}</button>}
      <button type="button" className="bl-link es-danger" onClick={() => invoices.remove(i.id)}>{ru ? 'Удалить' : 'Delete'}</button>
    </section>
    {i.lines.length > 0 && <DocVersions kind="invoice" source={{invoiceId: i.id}} ru={ru} defaultTo={i.client.name ? [i.client.name] : []}/>}
    {preview && <div className="bl-preview"><button type="button" onClick={() => setPreview(null)}>×</button><iframe title="PDF" src={preview}/></div>}
    {i.log?.length > 1 && <details className="bl-log"><summary>{ru ? 'История' : 'History'}</summary>{i.log.slice().reverse().map((x, k) => <div key={k}><time>{new Date(x.at).toLocaleString()}</time> {x.text}</div>)}</details>}
    {flash && <div className="es-flash" role="status">{flash}</div>}
  </div>;
}

function Start({ru, onProfile}: {ru: boolean; onProfile: () => void}) {
  const ests = useEstimates(); const p = useProfile(); const [kind, setKind] = useState<DocKind>('quote');
  return <div className="bl-start">
    <h3>¤ {ru ? 'Смета → документ → деньги' : 'Estimate → document → paid'}</h3>
    <ol className="bl-steps">
      <li className={p.name && hasPayment(p) ? 'is-done' : ''}><b>1</b><span>{ru ? 'Один раз: кто вы и куда платить (кошелёк, карта, банк)' : 'Once: who you are and where to pay (wallet, card, bank)'}</span><button type="button" className="bl-btn" onClick={onProfile}>{p.name && hasPayment(p) ? '✓ ' + (ru ? 'изменить' : 'edit') : (ru ? 'Заполнить' : 'Set up')}</button></li>
      <li><b>2</b><span>{ru ? 'Предложение клиенту из сметы, потом счёт' : 'Quote from an estimate, then an invoice'}</span></li>
      <li><b>3</b><span>{ru ? 'PDF с QR → поделиться / агент отправит → напоминания' : 'PDF with QR → share / agent sends → reminders'}</span></li>
    </ol>
    <div className="bl-kind"><button type="button" aria-pressed={kind === 'quote'} onClick={() => setKind('quote')}>📄 {ru ? 'Предложение' : 'Quote'}</button><button type="button" aria-pressed={kind === 'invoice'} onClick={() => setKind('invoice')}>🧾 {ru ? 'Счёт' : 'Invoice'}</button></div>
    <div className="es-new">
      <button type="button" data-testid="bl-new-blank" onClick={() => invoices.create({kind, lines: [{id: '', name: ru ? 'Работа' : 'Labor', qty: 1, unit: ru ? 'ч' : 'h', unitPrice: 0}]})}><b>＋</b><span><strong>{ru ? 'С нуля' : 'Blank'}</strong><small>{ru ? 'Строки руками или агентом' : 'Lines by hand or by the agent'}</small></span></button>
      {ests.filter(e => e.items.length).slice(0, 8).map(e => <button type="button" key={e.id} data-testid="bl-from-estimate" onClick={() => fromEstimate(e, kind)}><b>Σ</b><span><strong>{e.title}</strong><small>{money(esTotals(e).sum, e.currency)} · {ru ? 'из сметы' : 'from estimate'}</small></span></button>)}
    </div>
  </div>;
}

export function BillingPane() {
  const {lang} = useLang(); const ru = lang === 'ru';
  const list = useInvoices(); const p = useProfile();
  const sel = invoices.selected(); const cur = (sel && invoices.get(sel)) || null;
  const [view, setView] = useState<'doc' | 'profile' | 'new'>(() => profile.get().name ? 'doc' : 'profile');
  useEffect(() => { const f = (e: any) => { if (e.detail?.view) setView(e.detail.view); }; window.addEventListener('billing:ui', f); return () => window.removeEventListener('billing:ui', f); }, []);
  const rem = useMemo(() => reminders(), [list]);
  const dueNow = rem.filter(r => r.due);
  const owed = list.filter(i => i.kind === 'invoice' && i.status === 'sent').reduce((s, i) => s + invTotals(i).total, 0);
  return <div className="es bl" data-testid="billing-pane">
    <aside className="es-side">
      <button type="button" className="es-new-btn" data-testid="bl-new" onClick={() => { invoices.select(null); setView('new'); }}>＋ {ru ? 'Предложение или счёт' : 'Quote or invoice'}</button>
      <button type="button" className={'bl-side-btn' + (view === 'profile' ? ' is-on' : '')} data-testid="bl-profile-open" onClick={() => setView('profile')}>⚙ {ru ? 'Оплата и профиль' : 'Payment & profile'}{!hasPayment(p) && <i>!</i>}</button>
      {owed > 0 && <div className="bl-owed"><small>{ru ? 'Ждём оплату' : 'Awaiting payment'}</small><strong>{owed.toLocaleString('ru-RU', {minimumFractionDigits: 2, maximumFractionDigits: 2})} {list.find(i => i.status === 'sent')?.currency}</strong></div>}
      {dueNow.length > 0 && <div className="bl-rem" data-testid="bl-reminders"><small>⏰ {ru ? 'Напомнить сегодня' : 'Remind today'}</small>{dueNow.map(r => <button type="button" key={r.invoiceId} onClick={() => { invoices.select(r.invoiceId); setView('doc'); }}>{r.number} · {r.client || '—'}{r.overdueDays > 0 ? ` · +${r.overdueDays}` : ''}</button>)}</div>}
      <ul>{list.map(i => <li key={i.id}><button type="button" aria-pressed={cur?.id === i.id && view === 'doc'} onClick={() => { invoices.select(i.id); setView('doc'); }}>
        <b>{i.kind === 'quote' ? '📄' : '🧾'}</b><span><strong>{i.number} · {i.client.name || i.title || '—'}</strong><small>{money(invTotals(i).total, i.currency)} · <Chip i={i} ru={ru}/></small></span></button></li>)}</ul>
    </aside>
    <main className="es-main">
      {view === 'profile' ? <ProfileForm ru={ru} onDone={() => setView(cur ? 'doc' : 'new')}/>
        : cur && view === 'doc' ? <InvoiceView i={cur} ru={ru}/>
        : <Start ru={ru} onProfile={() => setView('profile')}/>}
    </main>
  </div>;
}
// created invoices select themselves; show them
invoices.subscribe(() => { if (invoices.selected()) window.dispatchEvent(new CustomEvent('billing:ui', {detail: {view: 'doc'}})); });
export {iso};
