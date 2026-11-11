// Estimate (Смета) pane: list of estimates + the visual estimate.
import {useEffect, useState} from 'react';
import {useLang} from '../../hooks/useLang';
import {useBlobUrl} from '../intake/useBlobUrl';
import {estimates, useEstimates, totals, lineTotal, money, TEMPLATES, PERIODS, type Estimate, type EstItem, type TemplateId, type Period} from './store';
import {estimatePdf, estimatePdfName} from './pdf';
import {downloadBlob, shareFile} from '../billing/share';
import {fromEstimate} from '../billing/store';
import {estimateToDay} from '../day/store';
import {nativeRooms} from '../personal/native-clouds-state';
import {DocVersions} from '../docs/DocVersions';
import {docs} from '../docs/registry';
import {estimateToBoard, estimateToNotebook, estimateRequest, estimateMarkdown, estimateCsv} from './routes';
import './estimate.css';

function Thumb({src}: {src?: string | null}) {
  const u = useBlobUrl(src);
  const [bad, setBad] = useState(false);
  return u && !bad ? <img src={u} alt="" onError={() => setBad(true)}/> : <span className="es-noimg">◻</span>;
}
const STATUS: Record<string, [string, string, string]> = {ok: ['ок', 'ok', ''], check: ['проверить', 'check', 'warn'], missing: ['купить', 'buy', 'buy'], have: ['есть', 'have', 'have']};
// Bills: "ok" means paid, "missing" means still to pay; "have" (zero cost) is not offered.
const BILL_STATUS: Record<string, [string, string, string]> = {ok: ['оплачено', 'paid', 'have'], missing: ['оплатить', 'to pay', 'buy'], check: ['проверить', 'check', 'warn']};
const statusSet = (e: Estimate) => TEMPLATES[e.template].bills ? BILL_STATUS : STATUS;
const mapLink = (q: string) => 'https://www.google.com/maps/search/?api=1&query=' + encodeURIComponent(q);

function NewEstimate({ru, onDone}: {ru: boolean; onDone: () => void}) {
  const btn = (id: TemplateId) => { const t = TEMPLATES[id]; return <button type="button" key={id} data-testid={'es-new-' + id}
    onClick={() => { estimates.create({template: id, title: ru ? t.ru : t.en, target: {label: t.target.label, value: 0, unit: t.target.unit}}); onDone(); }}>
    <b>{t.icon}</b><span><strong>{ru ? t.ru : t.en}</strong><small>{ru ? t.hintRu : t.hintEn}</small></span></button>; };
  const ids = Object.keys(TEMPLATES) as TemplateId[];
  return <>
    <h5 className="es-cat">{ru ? 'Работа: посчитать и выставить клиенту' : 'Work: estimate and bill a client'}</h5>
    <div className="es-new">{ids.filter(i => ['renovation', 'services', 'parts'].includes(i)).map(btn)}</div>
    <h5 className="es-cat">{ru ? 'Дом и семья: деньги, время, сроки' : 'Home & family: money, time, due dates'}</h5>
    <div className="es-new">{ids.filter(i => TEMPLATES[i].household || ['groceries', 'event'].includes(i)).map(btn)}</div>
    <div className="es-new" style={{marginTop: 8}}>{btn('custom')}</div>
  </>;
}

function ItemRow({e, i, ru}: {e: Estimate; i: EstItem; ru: boolean}) {
  const set = (p: Partial<EstItem>) => estimates.upsertItem(e.id, {id: i.id, ...p}, 'human');
  const tgt = e.target; const cov = i.covers;
  // Each template shows only the fields it needs; a field with a value is always shown.
  const FIELDS: Partial<Record<TemplateId, string[]>> = {kids: ['hours', 'who', 'schedule', 'due', 'place', 'duties'], utilities: ['due'], subscriptions: ['due', 'who']};
  const show = (f: keyof EstItem) => (FIELDS[e.template] || []).includes(f as string) || !!i[f];
  const short = cov && tgt && tgt.value > 0 && cov.unit.trim() === tgt.unit.trim() && cov.value < tgt.value;
  return <div className={'es-row' + (i.status === 'have' ? ' is-have' : '') + (i.edited ? ' is-edited' : '')} data-testid="es-row">
    <div className="es-img"><Thumb src={i.image}/></div>
    <div className="es-name">
      <input value={i.name} onChange={ev => set({name: ev.target.value})} aria-label={ru ? 'Позиция' : 'Item'}/>
      <small>{i.shop && (i.url ? <a href={i.url} target="_blank" rel="noreferrer">{i.shop} ↗</a> : i.shop)}{i.basis && <span title={i.basis}> · {i.basis}</span>}{i.note && <span> · {i.note}</span>}</small>
    </div>
    <label className="es-qty"><input type="number" step="any" value={i.qty} onChange={ev => set({qty: parseFloat(ev.target.value) || 0, total: null})} aria-label={ru ? 'Количество' : 'Qty'}/><span>{i.unit}</span></label>
    <label className="es-price"><input type="number" step="any" value={i.unitPrice} onChange={ev => set({unitPrice: parseFloat(ev.target.value) || 0, total: null})} aria-label={ru ? 'Цена' : 'Price'}/></label>
    <strong className="es-sum">{i.status === 'have' ? <i>{ru ? 'есть' : 'have'}</i> : money(lineTotal(i), e.currency)}</strong>
    <span className={'es-cover' + (short ? ' is-short' : cov ? ' is-ok' : '')} title={ru ? 'Хватит на' : 'Covers'}>{cov ? `${+cov.value.toFixed(2)} ${cov.unit}` : '—'}</span>
    <select value={i.status || 'ok'} onChange={ev => set({status: ev.target.value as EstItem['status']})} className={'es-st es-st-' + (statusSet(e)[i.status || 'ok'] || STATUS.ok)[2]} aria-label={ru ? 'Статус' : 'Status'}>
      {Object.entries(statusSet(e)).map(([k, v]) => <option key={k} value={k}>{ru ? v[0] : v[1]}</option>)}</select>
    <button type="button" className="es-x" aria-label={ru ? 'Удалить строку' : 'Remove line'} onClick={() => estimates.removeItem(e.id, i.id)}>×</button>
    {(TEMPLATES[e.template].household || i.period || i.hours || i.who || i.due || i.place || i.duties) && <div className="es-extra" data-testid="es-extra">
      <select value={i.period || ''} onChange={ev => set({period: (ev.target.value || null) as Period | null})} aria-label={ru ? 'Как часто' : 'How often'}><option value="">{ru ? 'период…' : 'period…'}</option>{(Object.keys(PERIODS) as Period[]).map(k => <option key={k} value={k}>{ru ? PERIODS[k].ru : PERIODS[k].en}</option>)}</select>
      {show('hours') && <label title={ru ? 'Часов за этот период, с дорогой' : 'Hours per period incl. driving'}>⏱<input type="number" step="any" value={i.hours ?? ''} placeholder={ru ? 'ч' : 'h'} onChange={ev => set({hours: ev.target.value === '' ? null : parseFloat(ev.target.value)})}/></label>}
      {show('who') && <label>👤<input value={i.who || ''} placeholder={ru ? 'кто' : 'who'} onChange={ev => set({who: ev.target.value})}/></label>}
      {show('schedule') && <label>🗓<input value={i.schedule || ''} placeholder={ru ? 'Пн, Ср 17:00' : 'Mon, Wed 5pm'} onChange={ev => set({schedule: ev.target.value})}/></label>}
      {show('due') && <label>💳<input type="date" value={i.due || ''} onChange={ev => set({due: ev.target.value || undefined})} aria-label={ru ? 'Оплатить до' : 'Due'}/></label>}
      {show('place') && <label className="es-x-place">{i.place ? <a href={mapLink(i.place)} target="_blank" rel="noreferrer">📍</a> : '📍'}<input value={i.place || ''} placeholder={ru ? 'где' : 'where'} onChange={ev => set({place: ev.target.value})}/></label>}
      {show('duties') && <label className="es-x-duty">✋<input value={i.duties || ''} placeholder={ru ? 'обязанности: возить, форма…' : 'duties: drive, uniform…'} onChange={ev => set({duties: ev.target.value})}/></label>}
    </div>}
  </div>;
}

function EstimateView({e, ru}: {e: Estimate; ru: boolean}) {
  const t = totals(e); const tpl = TEMPLATES[e.template];
  const [req, setReq] = useState('');
  const [flash, setFlash] = useState<string | null>(null);
  const [showPrompt, setShowPrompt] = useState(false);
  useEffect(() => { setReq(''); }, [e.id]);
  const act = async (fn: () => unknown, ok: string) => { try { await fn(); setFlash(ok); } catch (err) { setFlash('⚠ ' + String((err as Error).message || err)); } setTimeout(() => setFlash(null), 2600); };
  const save = (name: string, body: string, type: string) => { const u = URL.createObjectURL(new Blob([body], {type})); const a = document.createElement('a'); a.href = u; a.download = name; a.click(); setTimeout(() => URL.revokeObjectURL(u), 2000); };
  const groups: [string, EstItem[]][] = [];
  for (const i of e.items) { const g = i.group || ''; const last = groups.at(-1); if (last && last[0] === g) last[1].push(i); else groups.push([g, [i]]); }
  const hint = t.bottleneck || t.weakest;
  return <div className="es-view" data-testid="es-view">
    <header className="es-head">
      <div className="es-title"><span className="es-tpl">{tpl.icon} {ru ? tpl.ru : tpl.en}</span>
        <input value={e.title} onChange={ev => estimates.patch(e.id, {title: ev.target.value.slice(0, 160)})} aria-label={ru ? 'Название' : 'Title'}/>
        <div className="es-target">
          <input value={e.target?.label || ''} onChange={ev => estimates.patch(e.id, {target: {label: ev.target.value, value: e.target?.value || 0, unit: e.target?.unit || ''}})} placeholder={ru ? 'Для чего' : 'For'} aria-label={ru ? 'Цель' : 'Target'}/>
          <input type="number" step="any" value={e.target?.value ?? 0} onChange={ev => estimates.patch(e.id, {target: {label: e.target?.label || '', value: parseFloat(ev.target.value) || 0, unit: e.target?.unit || ''}})} aria-label={ru ? 'Значение' : 'Value'}/>
          <input value={e.target?.unit || ''} onChange={ev => estimates.patch(e.id, {target: {label: e.target?.label || '', value: e.target?.value || 0, unit: ev.target.value}})} placeholder="м²" aria-label={ru ? 'Единица' : 'Unit'} className="es-unit"/>
          <input value={e.currency} onChange={ev => estimates.patch(e.id, {currency: ev.target.value.toUpperCase().slice(0, 6)})} aria-label={ru ? 'Валюта' : 'Currency'} className="es-unit"/>
        </div>
      </div>
      <div className="es-kpis" data-testid="es-kpis">
        <div className="es-kpi es-total"><small>{t.recurring ? (ru ? 'Сумма строк' : 'All lines') : (ru ? 'Итого' : 'Total')}</small><strong>{money(t.sum, e.currency)}</strong></div>
        <div className="es-kpi"><small>{ru ? 'Позиций' : 'Lines'}</small><strong>{t.count}{t.toBuy !== t.count ? <em> / {ru ? 'купить' : 'buy'} {t.toBuy}</em> : null}</strong></div>
        {hint && <div className="es-kpi es-warn"><small>{t.bottleneck ? (ru ? 'Узкое место' : 'Bottleneck') : (ru ? 'Закончится первым' : 'Runs out first')}</small><strong>{hint.name}</strong><em>{+hint.covers!.value.toFixed(2)} {hint.covers!.unit}</em></div>}
        {t.short.length > 0 && <div className="es-kpi es-bad"><small>{ru ? 'Не хватает на цель' : 'Short of target'}</small><strong>{t.short.length}</strong></div>}
        {t.recurring && <div className="es-kpi" data-testid="es-month"><small>{ru ? 'В месяц' : 'Per month'}</small><strong>{money(t.perMonth, e.currency)}</strong><em>{ru ? 'в год' : 'year'} {money(t.perYear, e.currency)}{t.oneOff ? ` · ${ru ? 'разово' : 'one-off'} ${money(t.oneOff, e.currency)}` : ''}</em></div>}
        {t.hoursWeek > 0 && <div className="es-kpi" data-testid="es-hours"><small>{ru ? 'Время семьи' : 'Family time'}</small><strong>{t.hoursWeek} {ru ? 'ч/нед' : 'h/wk'}</strong></div>}
        {t.unpaidCount > 0 && TEMPLATES[e.template].bills && <div className="es-kpi es-warn"><small>💳 {ru ? 'Оплатить' : 'To pay'} · {t.unpaidCount}</small><strong>{money(t.unpaid, e.currency)}</strong>{t.nextDue && <em>{ru ? 'ближайший' : 'next'}: {t.nextDue.due}</em>}</div>}
      </div>
    </header>
    {e.status === 'with-agent' && <p className="es-agent">📱 {ru ? 'У агента' : 'With the agent'}: «{(e.request || '').slice(0, 160)}»</p>}

    <div className="es-table">
      <div className="es-row es-th"><span/><span>{ru ? 'Позиция' : 'Item'}</span><span>{ru ? 'Кол-во' : 'Qty'}</span><span>{ru ? 'Цена' : 'Price'}</span><span>{ru ? 'Сумма' : 'Amount'}</span><span>{ru ? 'Хватит на' : 'Covers'}</span><span/><span/></div>
      {groups.map(([g, list], k) => <section key={k}>{g && <h5>{g} <em>{money(list.reduce((s, i) => s + lineTotal(i), 0), e.currency)}</em></h5>}{list.map(i => <ItemRow key={i.id} e={e} i={i} ru={ru}/>)}</section>)}
      {!e.items.length && <p className="es-empty">{ru ? 'Пусто. Скажите агенту, что нужно посчитать, или добавьте строку.' : 'Empty. Tell the agent what to calculate, or add a line.'}</p>}
      <button type="button" className="es-add" onClick={() => estimates.upsertItem(e.id, {name: ru ? 'Новая позиция' : 'New item', qty: 1, unit: 'шт', unitPrice: 0}, 'human')}>＋ {ru ? 'Строка' : 'Line'}</button>
    </div>

    <div className="es-assume">
      <h5>{ru ? 'Допущения' : 'Assumptions'}</h5>
      <textarea rows={Math.max(2, e.assumptions.length)} value={e.assumptions.join('\n')} onChange={ev => estimates.patch(e.id, {assumptions: ev.target.value.split('\n')})} placeholder={ru ? 'Запас 10%, расход 1,2 кг/м²…' : 'Waste 10%, 1.2 kg/m²…'}/>
    </div>

    <section className="es-actions">
      <div className="es-ask">
        <textarea rows={2} value={req} onChange={ev => setReq(ev.target.value)} placeholder={ru ? 'Агенту: «посчитай кухню 25 м² под штукатурку и плитку» или «я поменял количество — пересчитай»' : 'To the agent: "estimate a 25 m² kitchen" or "I changed quantities, recheck"'}/>
        <button type="button" data-testid="es-request" onClick={() => act(() => estimateRequest(e.id, req), ru ? 'Отправлено агенту' : 'Sent to the agent')}>📱 {e.items.some(i => i.edited) ? (ru ? 'Пересчитать с агентом' : 'Recheck with agent') : (ru ? 'Посчитать с агентом' : 'Calculate with agent')}</button>
      </div>
      <div className="es-minor">
        <button type="button" data-testid="es-to-board" disabled={!e.items.length} onClick={() => act(() => estimateToBoard(e.id), ru ? 'Смета на доске' : 'On the board')}>▦ {ru ? 'На доску' : 'Board'}</button>
        <button type="button" disabled={!e.items.length} onClick={() => act(() => estimateToNotebook(e.id), ru ? 'Смета в блокноте' : 'In the notebook')}>✎ {ru ? 'В блокнот' : 'Notebook'}</button>
        {!tpl.household && <button type="button" data-testid="es-to-quote" disabled={!e.items.length} onClick={() => act(() => { fromEstimate(e, 'quote'); nativeRooms.select('billing'); }, ru ? 'Предложение создано' : 'Quote created')}>📄 {ru ? 'Предложение клиенту' : 'Quote'}</button>}
        {!tpl.household && <button type="button" disabled={!e.items.length} onClick={() => act(() => { fromEstimate(e, 'invoice'); nativeRooms.select('billing'); }, ru ? 'Счёт создан' : 'Invoice created')}>🧾 {ru ? 'Счёт' : 'Invoice'}</button>}
        {(tpl.household || e.items.some(i => i.due || i.schedule)) && <button type="button" data-testid="es-to-day" disabled={!e.items.length} onClick={() => act(() => { const r = estimateToDay(e.id); nativeRooms.select('day'); return r; }, ru ? 'В расписании дня' : 'In the day plan')}>📅 {ru ? 'В расписание' : 'To day plan'}</button>}
        <span className="es-sep"/>
        <button type="button" disabled={!e.items.length} onClick={() => save(e.title + '.md', estimateMarkdown(e), 'text/markdown')}>MD</button>
        <button type="button" disabled={!e.items.length} onClick={() => save(e.title + '.csv', estimateCsv(e), 'text/csv')}>CSV</button>
        <button type="button" onClick={() => save(e.title + '.json', JSON.stringify({schema: 'estimate.v1', ...e}, null, 2), 'application/json')}>JSON</button>
        <span className="es-sep"/>
        <button type="button" className="es-link" onClick={() => setShowPrompt(!showPrompt)}>{ru ? 'промт для агента' : 'agent prompt'}</button>
        <button type="button" className="es-danger" onClick={() => estimates.remove(e.id)}>{ru ? 'Удалить' : 'Delete'}</button>
      </div>
      {showPrompt && <pre className="es-prompt">{tpl.prompt}</pre>}
      {e.items.length > 0 && <DocVersions kind="estimate" source={{estimateId: e.id}} ru={ru}/>}
    </section>
    {flash && <div className="es-flash" role="status">{flash}</div>}
  </div>;
}

export function EstimatePane() {
  const {lang} = useLang(); const ru = lang === 'ru';
  const list = useEstimates();
  const sel = estimates.selected();
  const cur = (sel && estimates.get(sel)) || null;
  const [creating, setCreating] = useState(false);
  return <div className="es" data-testid="estimate-pane">
    <aside className="es-side">
      <button type="button" className="es-new-btn" data-testid="es-new" onClick={() => { setCreating(true); estimates.select(null); }}>＋ {ru ? 'Новая смета' : 'New estimate'}</button>
      <ul>{list.map(e => { const t = totals(e); return <li key={e.id}><button type="button" aria-pressed={cur?.id === e.id} onClick={() => { setCreating(false); estimates.select(e.id); }}>
        <b>{TEMPLATES[e.template].icon}</b><span><strong>{e.title}</strong><small>{money(t.sum, e.currency)} · {t.count} {ru ? 'поз.' : 'lines'}{e.status === 'with-agent' ? ' · 📱' : ''}</small></span></button></li>; })}</ul>
    </aside>
    <main className="es-main">
      {cur && !creating ? <EstimateView e={cur} ru={ru}/> : <div className="es-welcome">
        <h3>Σ {ru ? 'Смета: посчитать что угодно' : 'Estimate: count anything'}</h3>
        <p>{ru ? 'Считает агент на телефоне, портал показывает: позиции с фото, количеством, ценой и тем, на что хватит. Количество можно менять руками, агент пересчитает.' : 'The agent on your phone calculates; the portal shows lines with photos, quantities, prices and what each line is enough for. Change quantities by hand and the agent rechecks.'}</p>
        <NewEstimate ru={ru} onDone={() => setCreating(false)}/>
      </div>}
    </main>
  </div>;
}
