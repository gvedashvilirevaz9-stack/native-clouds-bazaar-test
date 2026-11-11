// Estimate → final PDF: a short numbered list with tags, totals on top. Readable in ten seconds.
import {newKit, footer, pdfBlob, pills, mapUrl, versionBanner, removedList, type TagKind} from '../billing/pdfkit';
import type {VersionInfo} from '../docs/registry';
import {drawPayBlock} from '../billing/pdf';
import {profile} from '../billing/profile';
import {plan} from '../billing/plan';
import {totals, lineTotal, TEMPLATES, PERIODS, type Estimate, type EstItem} from './store';

const ruDate = (s: string) => new Date(s + 'T12:00:00').toLocaleDateString('ru-RU', {day: 'numeric', month: 'short'});
const m = (v: number, c: string) => v.toLocaleString('ru-RU', {minimumFractionDigits: 2, maximumFractionDigits: 2}).replace(/ | /g, ' ') + ' ' + c;

function tagsOf(e: Estimate, i: EstItem, mark?: 'new' | 'changed') {
  const bills = TEMPLATES[e.template].bills; const out: {text: string; kind: TagKind; url?: string}[] = [];
  if (mark) out.push({text: mark === 'new' ? 'НОВОЕ' : 'ИЗМЕНЕНО', kind: mark});
  if (bills && i.status === 'missing') out.push({text: 'ОПЛАТИТЬ' + (i.due ? ' до ' + ruDate(i.due) : ''), kind: 'pay'});
  else if (i.due && i.status !== 'ok') out.push({text: 'СРОК ' + ruDate(i.due), kind: 'pay'});
  if (bills && i.status === 'ok') out.push({text: 'ОПЛАЧЕНО', kind: 'buy'});
  if (!bills && i.status === 'missing') out.push({text: 'КУПИТЬ', kind: 'buy'});
  if (i.status === 'have') out.push({text: 'ЕСТЬ', kind: 'note'});
  if (i.status === 'check') out.push({text: 'ПРОВЕРИТЬ', kind: 'call'});
  if (i.who) out.push({text: i.who, kind: 'kid'});
  if (i.schedule) out.push({text: i.schedule, kind: 'time'});
  if (i.hours) out.push({text: `${+i.hours.toFixed(1)} ч ${i.period ? PERIODS[i.period].ru : ''}`.trim(), kind: 'time'});
  if (i.place) out.push({text: i.place, kind: 'place', url: mapUrl(i.place)});
  if (i.covers) out.push({text: `хватит на ${+i.covers.value.toFixed(2)} ${i.covers.unit}`, kind: 'note'});
  if (i.duties) out.push({text: i.duties, kind: 'task'});
  if (i.shop && i.url) out.push({text: i.shop, kind: 'buy', url: i.url});
  return out;
}

export async function estimatePdf(e: Estimate, o: {pay?: boolean; ver?: VersionInfo | null} = {}) {
  const k = await newKit(); const {pdf, M, W} = k; const t = totals(e); const tpl = TEMPLATES[e.template];
  k.font('normal', 9, '#8b90a3'); k.text(`${tpl.ru}${e.target && e.target.value ? ` · ${e.target.label}: ${e.target.value} ${e.target.unit}` : ''} · ${new Date().toLocaleDateString('ru-RU')}`, M, k.y); k.y += 14;
  k.font('bold', 20); k.y += k.text(e.title, M, k.y, {max: W - M * 2}) + 8;
  versionBanner(k, o.ver);

  // KPI boxes: the answer first.
  const boxes: [string, string, string][] = [];
  if (t.recurring) { boxes.push(['В месяц', m(t.perMonth, e.currency), '#203c4a'], ['В год', m(t.perYear, e.currency), '#3a4ea0']); if (t.oneOff) boxes.push(['Разово', m(t.oneOff, e.currency), '#5a6075']); }
  else boxes.push(['Итого', m(t.sum, e.currency), '#203c4a']);
  if (t.hoursWeek) boxes.push(['Время', `${t.hoursWeek} ч в неделю`, '#17666a']);
  if (tpl.bills && t.unpaidCount) boxes.push([`Оплатить (${t.unpaidCount})`, m(t.unpaid, e.currency), '#a3321a']);
  const hint = t.bottleneck || t.weakest; if (hint) boxes.push([t.bottleneck ? 'Узкое место' : 'Закончится первым', hint.name.slice(0, 28), '#7c5512']);
  const bw = (W - M * 2 - 8 * (boxes.length - 1)) / boxes.length;
  boxes.forEach(([a, b, c], n) => { const x = M + n * (bw + 8); pdf.setFillColor(...k.hex(c)); pdf.roundedRect(x, k.y, bw, 46, 8, 8, 'F'); k.font('normal', 8, '#ffffff'); k.text(a, x + 10, k.y + 8); k.font('bold', boxes.length > 3 ? 11 : 14, '#ffffff'); k.text(b, x + 10, k.y + 22, {max: bw - 16}); });
  k.y += 62;

  // Numbered points, grouped.
  let n = 0; let g: string | null = null;
  const order = [...e.items];
  for (const i of order) {
    if ((i.group || '') !== g) { g = i.group || ''; if (g) { k.ensure(40); k.font('bold', 10.5, '#3a4ea0'); k.text(g.toUpperCase(), M, k.y); const gs = e.items.filter(x => (x.group || '') === g).reduce((s, x) => s + lineTotal(x), 0); k.text(m(gs, e.currency), W - M, k.y, {align: 'right'}); k.y += 18; } }
    const mark = o.ver?.marks?.[i.id]; const tags = tagsOf(e, i, mark);
    k.font('bold', 11); const nameLines = pdf.splitTextToSize(i.name, W - M * 2 - 150) as string[];
    const h = nameLines.length * 14 + (i.basis ? 12 : 0) + (tags.length ? 22 : 4) + 8;
    k.ensure(h); n++;
    k.font('bold', 11, '#8b90a3'); k.text(String(n), M, k.y);
    k.font('bold', 11); pdf.text(nameLines, M + 22, k.y, {baseline: 'top'} as any);
    k.font('normal', 9.5, '#5a6075'); k.text(`${+i.qty.toFixed(3)} ${i.unit}${i.unitPrice ? ' × ' + m(i.unitPrice, '').trim() : ''}`, W - M - 100, k.y + 1, {align: 'right'});
    k.font('bold', 11); k.text(i.status === 'have' ? '—' : m(lineTotal(i), e.currency), W - M, k.y, {align: 'right'});
    let yy = k.y + nameLines.length * 14;
    if (i.basis) { k.font('normal', 8.5, '#8b90a3'); k.text(i.basis, M + 22, yy, {max: W - M * 2 - 150}); yy += 12; }
    if (tags.length) yy += pills(k, M + 22, yy + 2, W - M * 2 - 22, tags);
    k.y = yy + 8; pdf.setDrawColor(...k.hex('#e8eaf0')); pdf.line(M + 22, k.y - 4, W - M, k.y - 4);
  }
  removedList(k, o.ver?.removed);
  if (e.assumptions.filter(Boolean).length) {
    k.ensure(40); k.y += 4; k.font('bold', 10); k.text('Главное и допущения', M, k.y); k.y += 15;
    e.assumptions.filter(Boolean).forEach(a => { k.font('normal', 9, '#3a4060'); const h = k.text('• ' + a, M, k.y, {max: W - M * 2}); k.y += h + 2; k.ensure(14); });
  }
  if (o.pay) { k.y += 10; drawPayBlock(k, {amount: e.currency === 'USD' ? t.sum : null, currency: e.currency, lang: 'ru'}); }
  const p = profile.get();
  footer(k, (o.ver ? o.ver.number + ' · ' : '') + (plan.get().brandedDocs && p.name ? p.name : 'Сделано в Sunrise Workshop · агент посчитал, вы проверили'));
  return pdfBlob(k);
}
export const estimatePdfName = (e: Estimate) => e.title.replace(/[\\/:*?"<>|]/g, '').slice(0, 60) + '.pdf';
