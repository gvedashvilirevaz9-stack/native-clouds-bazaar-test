// Day (День): today's plan as numbered points with tags. Built for a phone or a tablet in the car.
import {useState} from 'react';
import {useLang} from '../../hooks/useLang';
import {day, useDay, today, shiftDate, gatherDay, type DayEntry, type DayTag} from './store';
import {dayPdf, dayPdfName, dateLong, entryTags} from './pdf';
import {downloadBlob, shareFile} from '../billing/share';
import {communication} from '../communication/store';
import {TAG} from '../billing/pdfkit';
import {DocVersions} from '../docs/DocVersions';
import './day.css';

const TAG_UI: Record<DayTag, [string, string, string]> = {pay: ['💳', 'Оплатить', 'Pay'], place: ['📍', 'Место', 'Place'], buy: ['🛒', 'Купить', 'Buy'], kid: ['👧', 'Дети', 'Kids'], time: ['⏰', 'Время', 'Time'], call: ['📞', 'Позвонить', 'Call'], task: ['✓', 'Дело', 'Task']};
export const DAY_PROMPT = 'Build the day plan for {date}{for}. Read estimates (estimate.list / estimate.read: kids\' activities, bills, subscriptions), invoice.reminders and recent notebook pages. Return numbered points in time order with day.add {entries:[{date, time, end, title, why, who, forWhom, place, amount, currency, buy:[...], phone, tags:[pay|place|buy|kid|time|call|task]}]}. One point = one action. "why" says in a few words why it matters. Put payments with the amount, places with an address the maps app can open, shopping as a short list. Do not invent times: ask when unknown.';

function Card({e, n, ru}: {e: DayEntry; n: number; ru: boolean}) {
  const [edit, setEdit] = useState(false);
  const tags = entryTags(e);
  return <article className={'dy-card' + (e.done ? ' is-done' : '')} data-testid="dy-card">
    <button type="button" className="dy-n" aria-label={ru ? 'Готово' : 'Done'} aria-pressed={e.done} onClick={() => day.toggle(e.id)}>{e.done ? '✓' : n}</button>
    <div className="dy-time"><b>{e.time || '—'}</b>{e.end && <small>{e.end}</small>}</div>
    <div className="dy-body">
      {edit ? <div className="dy-edit">
        <input value={e.title} onChange={ev => day.patch(e.id, {title: ev.target.value})}/>
        <div><input type="time" value={e.time || ''} onChange={ev => day.patch(e.id, {time: ev.target.value})}/><input type="time" value={e.end || ''} onChange={ev => day.patch(e.id, {end: ev.target.value})}/>
          <input value={e.who || ''} placeholder={ru ? 'кто' : 'who'} onChange={ev => day.patch(e.id, {who: ev.target.value})}/><input value={e.place || ''} placeholder={ru ? 'адрес' : 'address'} onChange={ev => day.patch(e.id, {place: ev.target.value})}/>
          <input type="number" step="any" value={e.amount ?? ''} placeholder={ru ? 'сумма' : 'amount'} onChange={ev => day.patch(e.id, {amount: ev.target.value ? parseFloat(ev.target.value) : null})}/></div>
        <input value={e.why || ''} placeholder={ru ? 'зачем' : 'why'} onChange={ev => day.patch(e.id, {why: ev.target.value})}/>
        <input value={(e.buy || []).join(', ')} placeholder={ru ? 'купить: молоко, хлеб' : 'buy: milk, bread'} onChange={ev => day.patch(e.id, {buy: ev.target.value.split(',').map(s => s.trim()).filter(Boolean)})}/>
        <div className="dy-edit-row"><button type="button" onClick={() => setEdit(false)}>{ru ? 'Готово' : 'Done'}</button><button type="button" className="dy-del" onClick={() => day.remove(e.id)}>{ru ? 'Удалить' : 'Delete'}</button></div>
      </div> : <>
        <h4 onClick={() => setEdit(true)}>{e.title}</h4>
        {e.why && <p>{e.why}</p>}
        {e.buy?.length ? <ul className="dy-buy">{e.buy.map((b, k) => <li key={k}>{b}</li>)}</ul> : null}
        {tags.length > 0 && <div className="dy-tags">{tags.map((t, k) => { const c = TAG[t.kind]; const st = {background: c.bg, color: c.fg}; return t.url ? <a key={k} href={t.url} target="_blank" rel="noreferrer" style={st}>{t.text}</a> : <span key={k} style={st}>{t.text}</span>; })}</div>}
      </>}
    </div>
  </article>;
}

function QuickAdd({ru, date, forWhom}: {ru: boolean; date: string; forWhom: string | null}) {
  const [title, setTitle] = useState(''); const [time, setTime] = useState(''); const [tags, setTags] = useState<DayTag[]>([]);
  const add = () => { if (!title.trim()) return; day.add([{date, time, title: title.trim(), tags, forWhom: forWhom || undefined}], 'human'); setTitle(''); setTime(''); setTags([]); };
  return <div className="dy-add">
    <input type="time" value={time} onChange={e => setTime(e.target.value)} aria-label={ru ? 'Время' : 'Time'}/>
    <input value={title} onChange={e => setTitle(e.target.value)} onKeyDown={e => e.key === 'Enter' && add()} placeholder={ru ? 'Что сделать: «Забрать Машу с плавания»' : 'What: "Pick up Mia from swimming"'} data-testid="dy-add-title"/>
    <span className="dy-tagpick">{(Object.keys(TAG_UI) as DayTag[]).map(t => <button type="button" key={t} aria-pressed={tags.includes(t)} title={TAG_UI[t][ru ? 1 : 2]} onClick={() => setTags(x => x.includes(t) ? x.filter(y => y !== t) : [...x, t])}>{TAG_UI[t][0]}</button>)}</span>
    <button type="button" className="dy-primary" onClick={add} data-testid="dy-add">＋</button>
  </div>;
}

export function DayPane() {
  const {lang} = useLang(); const ru = lang === 'ru';
  const {date, forWhom, entries, people} = useDay();
  const [flash, setFlash] = useState<string | null>(null);
  const [who, setWho] = useState('');
  const act = async (fn: () => unknown, ok: string) => { try { await fn(); setFlash(ok); } catch (e) { setFlash('⚠ ' + String((e as Error).message || e)); } setTimeout(() => setFlash(null), 2600); };
  const pay = entries.filter(e => e.tags.includes('pay') && !e.done);
  const askAgent = () => { const text = '📅 ' + DAY_PROMPT.replace('{date}', date).replace('{for}', forWhom ? ' for ' + forWhom : ''); communication.add({text, role: 'user', contact: 'agent', source: 'Day', kind: 'info', key: 'day/' + date + '/' + Date.now()} as any); };
  return <div className="dy" data-testid="day-pane">
    <header className="dy-head">
      <div className="dy-nav">
        <button type="button" onClick={() => day.view({date: shiftDate(date, -1)})} aria-label={ru ? 'Вчера' : 'Previous'}>‹</button>
        <div><small>{date === today() ? (ru ? 'Сегодня' : 'Today') : date === shiftDate(today(), 1) ? (ru ? 'Завтра' : 'Tomorrow') : date}</small><strong data-testid="dy-date">{dateLong(date)}</strong></div>
        <button type="button" onClick={() => day.view({date: shiftDate(date, 1)})} aria-label={ru ? 'Завтра' : 'Next'}>›</button>
        {date !== today() && <button type="button" className="dy-today" onClick={() => day.view({date: today()})}>{ru ? 'Сегодня' : 'Today'}</button>}
        <input type="date" value={date} onChange={e => e.target.value && day.view({date: e.target.value})} aria-label={ru ? 'Дата' : 'Date'}/>
      </div>
      <div className="dy-people">
        <button type="button" aria-pressed={!forWhom} onClick={() => day.view({forWhom: null})}>{ru ? 'Все' : 'Everyone'}</button>
        {people.map(p => <button type="button" key={p} aria-pressed={forWhom === p} onClick={() => day.view({forWhom: p})}>{p}</button>)}
        <input value={who} onChange={e => setWho(e.target.value)} onKeyDown={e => { if (e.key === 'Enter' && who.trim()) { day.view({forWhom: who.trim()}); setWho(''); } }} placeholder={ru ? '＋ чей план (Мама)' : '+ whose plan (Mom)'}/>
      </div>
    </header>
    <div className="dy-kpis">
      <span><b>{entries.length}</b> {ru ? 'пунктов' : 'points'}</span>
      {pay.length > 0 && <span className="dy-k-pay">💳 <b>{pay.length}</b> {ru ? 'оплатить' : 'to pay'}{pay.some(e => e.amount) ? ` · ${pay.reduce((s, e) => s + (e.amount || 0), 0).toLocaleString('ru-RU', {maximumFractionDigits: 2})} ${pay.find(e => e.currency)?.currency || ''}` : ''}</span>}
      {entries.some(e => e.place) && <span>📍 <b>{entries.filter(e => e.place).length}</b> {ru ? 'поездок' : 'trips'}</span>}
      {entries.some(e => e.buy?.length) && <span>🛒 <b>{entries.reduce((s, e) => s + (e.buy?.length || 0), 0)}</b> {ru ? 'купить' : 'to buy'}</span>}
      {entries.some(e => e.who) && <span>👧 {[...new Set(entries.flatMap(e => (e.who || '').split(/\s*,\s*/)).filter(Boolean))].join(', ')}</span>}
    </div>
    <main className="dy-list">
      {entries.map((e, k) => <Card key={e.id} e={e} n={k + 1} ru={ru}/>)}
      {!entries.length && <div className="dy-empty"><p>{ru ? 'На этот день пусто. Соберите план из смет (кружки, коммуналка, подписки) и счетов или попросите агента.' : 'Nothing yet. Gather from estimates (activities, bills) and invoices, or ask the agent.'}</p></div>}
      <QuickAdd ru={ru} date={date} forWhom={forWhom}/>
    </main>
    {entries.length > 0 && <DocVersions kind="day" source={{date, forWhom}} ru={ru}/>}
    <footer className="dy-actions">
      <button type="button" data-testid="dy-gather" onClick={() => act(() => gatherDay(7, date), ru ? 'Собрано на 7 дней из смет и счетов' : 'Gathered 7 days from estimates and invoices')}>⟳ {ru ? 'Собрать из смет и счетов' : 'Gather from estimates & invoices'}</button>
      <button type="button" data-testid="dy-agent" onClick={() => act(askAgent, ru ? 'Агент соберёт день' : 'The agent will build the day')}>📱 {ru ? 'Агент: собери мой день' : 'Agent: build my day'}</button>
      {entries.length > 0 && <button type="button" className="dy-del" onClick={() => day.clear(date)}>{ru ? 'Очистить день' : 'Clear day'}</button>}
    </footer>
    {flash && <div className="es-flash" role="status">{flash}</div>}
  </div>;
}
