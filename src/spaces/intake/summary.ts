// Batch summaries. The agent extracts one record per file (intake.data);
// the portal does the bookkeeping: group by day, sum per currency, merge items.
import {intake, batches, type Asset, type Batch} from './store';
import {categoryById} from './categories';
import {htmlPage} from './convert';
import {putBlob, garage} from '../garage/store';
import {writeToNotebook} from '../garage/notebook-media';
import {boardSpot, focusBoard} from './routes';

const num = (v: unknown) => { const n = typeof v === 'number' ? v : parseFloat(String(v ?? '').replace(/\s/g, '').replace(',', '.')); return Number.isFinite(n) ? n : null; };
const money = (v: number, cur: string) => `${v.toLocaleString('ru-RU', {minimumFractionDigits: 2, maximumFractionDigits: 2})} ${cur}`;
const esc = (s: unknown) => String(s ?? '').replace(/[&<>"]/g, c => ({'&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;'}[c]!));

export type LedgerDay = {date: string; docs: number; totals: Record<string, number>; shops: string[]};
export type LedgerItem = {name: string; qty: number; unit: string; total: number; currency: string; times: number};
export type Ledger = {
  kind: 'ledger';
  docs: number; withData: number; missing: string[];
  days: LedgerDay[]; totals: Record<string, number>; items: LedgerItem[];
  range: {from: string | null; to: string | null};
  unclear: {asset: string; fields: string[]}[];
};
export type Table = {kind: 'table'; columns: string[]; rows: {asset: string; cells: string[]}[]; docs: number; withData: number; missing: string[]};
export type Notes = {kind: 'notes'; entries: {asset: string; text: string}[]; docs: number; withData: number; missing: string[]};
export type Summary = Ledger | Table | Notes;

function members(b: Batch) { return b.assetIds.map(id => intake.get(id)).filter(Boolean) as Asset[]; }

export function buildSummary(batchId: string): Summary {
  const b = batches.get(batchId); if (!b) throw new Error('BATCH_NOT_FOUND');
  const cat = categoryById(b.category)!;
  const list = members(b); const withData = list.filter(a => a.data); const missing = list.filter(a => !a.data).map(a => a.name);
  if (cat.output === 'ledger') {
    const days = new Map<string, LedgerDay>(); const totals: Record<string, number> = {}; const items = new Map<string, LedgerItem>(); const unclear: Ledger['unclear'] = [];
    for (const a of withData) {
      const d = a.data!; const cur = String(d.currency || '—').toUpperCase().slice(0, 6);
      const date = /^\d{4}-\d{2}-\d{2}$/.test(String(d.date)) ? String(d.date) : 'без даты';
      const lines: any[] = Array.isArray(d.items) ? d.items : [];
      const total = num(d.total) ?? lines.reduce((s, l) => s + (num(l?.total) ?? 0), 0);
      const day = days.get(date) || {date, docs: 0, totals: {}, shops: []};
      day.docs++; day.totals[cur] = (day.totals[cur] || 0) + total;
      const who = String(d.shop || d.supplier || '').trim(); if (who && !day.shops.includes(who)) day.shops.push(who);
      days.set(date, day); totals[cur] = (totals[cur] || 0) + total;
      for (const l of lines) {
        const name = String(l?.name || '').trim(); if (!name) continue;
        const key = name.toLowerCase().replace(/\s+/g, ' ') + '|' + cur;
        const it = items.get(key) || {name, qty: 0, unit: String(l?.unit || ''), total: 0, currency: cur, times: 0};
        it.qty += num(l?.qty) ?? 1; it.total += num(l?.total) ?? ((num(l?.unitPrice) ?? 0) * (num(l?.qty) ?? 1)); it.times++;
        items.set(key, it);
      }
      if (Array.isArray(d.unclear) && d.unclear.length) unclear.push({asset: a.name, fields: d.unclear.map(String).slice(0, 10)});
    }
    const dayList = [...days.values()].sort((x, y) => x.date.localeCompare(y.date));
    const dated = dayList.filter(x => x.date !== 'без даты');
    return {kind: 'ledger', docs: list.length, withData: withData.length, missing, days: dayList, totals, unclear,
      items: [...items.values()].sort((x, y) => y.total - x.total), range: {from: dated[0]?.date || null, to: dated.at(-1)?.date || null}};
  }
  if (cat.output === 'table') {
    const cols = new Set<string>();
    for (const a of withData) for (const [k, v] of Object.entries(a.data!)) if (v == null || typeof v !== 'object') cols.add(k);
    for (const a of withData) for (const s of Array.isArray(a.data!.specs) ? a.data!.specs : []) if (s?.name) cols.add('· ' + s.name);
    const columns = [...cols].slice(0, 16);
    const rows = withData.map(a => {
      const specs = new Map((Array.isArray(a.data!.specs) ? a.data!.specs : []).map((s: any) => ['· ' + s.name, [s.value, s.unit].filter(Boolean).join(' ')]));
      return {asset: a.name, cells: columns.map(c => String(c.startsWith('· ') ? (specs.get(c) ?? '') : (a.data![c] ?? '')))};
    });
    return {kind: 'table', columns, rows, docs: list.length, withData: withData.length, missing};
  }
  return {kind: 'notes', docs: list.length, withData: withData.length, missing,
    entries: withData.map(a => ({asset: a.name, text: String(a.data!.summary || a.data!.product || a.data!.type || a.data!.object || '') || JSON.stringify(a.data).slice(0, 400)}))};
}

export function summaryMarkdown(b: Batch, s: Summary) {
  const cat = categoryById(b.category)!;
  const head = [`# ${b.title}`, '', `${cat.ru} · файлов: ${s.docs} · с данными: ${s.withData}`];
  if (b.summary?.notes) head.push('', '> ' + b.summary.notes.replace(/\n/g, '\n> '));
  const out = [head.join('\n')];
  if (s.kind === 'ledger') {
    if (s.range.from) out.push(`Период: ${s.range.from}${s.range.to !== s.range.from ? ' — ' + s.range.to : ''}`);
    out.push('## Итого\n\n' + (Object.entries(s.totals).map(([c, v]) => `- **${money(v, c)}**`).join('\n') || '—'));
    out.push('## По дням\n\n| Дата | Документов | Сумма | Где |\n| --- | --- | --- | --- |\n' + s.days.map(d => `| ${d.date} | ${d.docs} | ${Object.entries(d.totals).map(([c, v]) => money(v, c)).join(', ')} | ${d.shops.join(', ')} |`).join('\n'));
    if (s.items.length) out.push('## Товары\n\n| Товар | Кол-во | Сумма | Раз |\n| --- | --- | --- | --- |\n' + s.items.slice(0, 80).map(i => `| ${i.name} | ${+i.qty.toFixed(3)} ${i.unit} | ${money(i.total, i.currency)} | ${i.times} |`).join('\n'));
    if (s.unclear.length) out.push('## Неразборчиво\n\n' + s.unclear.map(u => `- ${u.asset}: ${u.fields.join(', ')}`).join('\n'));
  } else if (s.kind === 'table') {
    out.push(`| Файл | ${s.columns.join(' | ')} |\n| --- | ${s.columns.map(() => '---').join(' | ')} |\n` + s.rows.map(r => `| ${r.asset} | ${r.cells.join(' | ')} |`).join('\n'));
  } else out.push(s.entries.map(e => `### ${e.asset}\n\n${e.text}`).join('\n\n'));
  if (s.missing.length) out.push('## Ещё без данных\n\n' + s.missing.map(m => '- ' + m).join('\n'));
  return out.join('\n\n') + '\n';
}

export function summaryCsv(s: Summary) {
  const q = (v: unknown) => '"' + String(v ?? '').replace(/"/g, '""') + '"';
  if (s.kind === 'ledger') return ['date,docs,currency,total,shops', ...s.days.flatMap(d => Object.entries(d.totals).map(([c, v]) => [d.date, d.docs, c, v.toFixed(2), q(d.shops.join('; '))].join(',')))].join('\n');
  if (s.kind === 'table') return [['file', ...s.columns].map(q).join(','), ...s.rows.map(r => [r.asset, ...r.cells].map(q).join(','))].join('\n');
  return ['file,text', ...s.entries.map(e => [q(e.asset), q(e.text)].join(','))].join('\n');
}

/** The same summary as an HTML page (used for the board image). */
export function summaryHtml(b: Batch, s: Summary) {
  const cat = categoryById(b.category)!;
  let body = `<div style="font-family:system-ui,sans-serif"><div style="color:#8a8fa3;font-size:14px">${esc(cat.icon + ' ' + cat.ru)} · ${s.withData}/${s.docs}</div><h1 style="font-size:30px;margin:.25em 0 .6em">${esc(b.title)}</h1>`;
  if (s.kind === 'ledger') {
    body += `<div style="display:flex;gap:14px;flex-wrap:wrap;margin-bottom:18px">${Object.entries(s.totals).map(([c, v]) => `<div style="background:#eef1fa;border-radius:12px;padding:10px 16px"><div style="font-size:12px;color:#667">Итого</div><div style="font-size:26px;font-weight:650">${esc(money(v, c))}</div></div>`).join('')}</div>`;
    body += `<h3>По дням</h3><table><tr><th>Дата</th><th>Док.</th><th>Сумма</th><th>Где</th></tr>${s.days.map(d => `<tr><td>${esc(d.date)}</td><td>${d.docs}</td><td>${esc(Object.entries(d.totals).map(([c, v]) => money(v, c)).join(', '))}</td><td>${esc(d.shops.join(', '))}</td></tr>`).join('')}</table>`;
    if (s.items.length) body += `<h3>Товары</h3><table><tr><th>Товар</th><th>Кол-во</th><th>Сумма</th></tr>${s.items.slice(0, 22).map(i => `<tr><td>${esc(i.name)}</td><td>${+i.qty.toFixed(3)} ${esc(i.unit)}</td><td>${esc(money(i.total, i.currency))}</td></tr>`).join('')}</table>`;
  } else if (s.kind === 'table') {
    body += `<table><tr><th>Файл</th>${s.columns.map(c => `<th>${esc(c)}</th>`).join('')}</tr>${s.rows.map(r => `<tr><td>${esc(r.asset)}</td>${r.cells.map(c => `<td>${esc(c)}</td>`).join('')}</tr>`).join('')}</table>`;
  } else body += s.entries.map(e => `<h3>${esc(e.asset)}</h3><p>${esc(e.text)}</p>`).join('');
  if (b.summary?.notes) body += `<p style="margin-top:16px;color:#445;border-left:3px solid #c9b98f;padding-left:10px">${esc(b.summary.notes)}</p>`;
  return body + '</div>';
}

export async function summaryToBoard(batchId: string, by: 'human' | 'agent' = 'human', open = true) {
  const b = batches.get(batchId); if (!b) throw new Error('BATCH_NOT_FOUND');
  const s = buildSummary(batchId);
  const page = await htmlPage(summaryHtml(b, s), 'summary');
  const ref = await putBlob(page.blob);
  const at = await boardSpot(open);
  if (at) focusBoard(at.x + 120, at.y + 150);
  const it = garage.add({kind: 'polaroid', title: b.title, image: ref, source: 'Inbox · ' + (categoryById(b.category)?.en || 'batch'), by, ...(at || {})} as any);
  return {batchId, itemId: it.id};
}
/** Plain-text version for the notebook sheet (it shows text, not Markdown tables). */
export function summaryText(b: Batch, s: Summary) {
  const cat = categoryById(b.category)!; const out: string[] = [`${cat.icon} ${b.title}`, `Файлов: ${s.docs}, с данными: ${s.withData}`];
  if (b.summary?.notes) out.push('', b.summary.notes);
  if (s.kind === 'ledger') {
    out.push('', 'ИТОГО: ' + (Object.entries(s.totals).map(([c, v]) => money(v, c)).join(', ') || '—'));
    out.push('', 'По дням:', ...s.days.map(d => `  ${d.date} — ${Object.entries(d.totals).map(([c, v]) => money(v, c)).join(', ')} · ${d.docs} док. · ${d.shops.join(', ')}`));
    if (s.items.length) out.push('', 'Товары:', ...s.items.slice(0, 40).map(i => `  • ${i.name} — ${+i.qty.toFixed(3)} ${i.unit} — ${money(i.total, i.currency)}`));
  } else if (s.kind === 'table') {
    for (const r of s.rows) out.push('', '• ' + r.asset, ...s.columns.map((c, k) => r.cells[k] ? `  ${c.replace(/^· /, '')}: ${r.cells[k]}` : '').filter(Boolean));
  } else for (const e of s.entries) out.push('', '• ' + e.asset, '  ' + e.text);
  return out.join('\n');
}
export function summaryToNotebook(batchId: string) {
  const b = batches.get(batchId); if (!b) throw new Error('BATCH_NOT_FOUND');
  return writeToNotebook(summaryText(b, buildSummary(batchId)), {mode: 'new-leaf'});
}
