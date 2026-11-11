// Day plan → phone-sized PDF (reads like a screen on a phone or a tablet in the car).
import {newKit, footer, pdfBlob, pills, mapUrl, versionBanner, removedList, type TagKind} from '../billing/pdfkit';
import type {VersionInfo} from '../docs/registry';
import {day, type DayEntry} from './store';

const TAG_TEXT: Record<string, string> = {pay: 'ОПЛАТИТЬ', place: 'МЕСТО', buy: 'КУПИТЬ', kid: 'ДЕТИ', time: 'ВРЕМЯ', call: 'ПОЗВОНИТЬ', task: 'ДЕЛО'};
export const dateLong = (s: string) => new Date(s + 'T12:00:00').toLocaleDateString('ru-RU', {weekday: 'long', day: 'numeric', month: 'long'});
const money = (v: number, c = '') => v.toLocaleString('ru-RU', {minimumFractionDigits: 2, maximumFractionDigits: 2}).replace(/ | /g, ' ') + (c ? ' ' + c : '');

export function entryTags(e: DayEntry, mark?: 'new' | 'changed') {
  const out: {text: string; kind: TagKind; url?: string}[] = [];
  if (mark) out.push({text: mark === 'new' ? 'НОВОЕ' : 'ИЗМЕНЕНО', kind: mark});
  if (e.tags.includes('pay')) out.push({text: e.amount ? `ОПЛАТИТЬ ${money(e.amount, e.currency)}` : 'ОПЛАТИТЬ', kind: 'pay', url: e.link});
  if (e.who) out.push({text: e.who, kind: 'kid'});
  if (e.place) out.push({text: e.place, kind: 'place', url: mapUrl(e.place)});
  if (e.phone) out.push({text: 'ПОЗВОНИТЬ ' + e.phone, kind: 'call', url: 'tel:' + e.phone.replace(/[^\d+]/g, '')});
  else if (e.tags.includes('call')) out.push({text: 'ПОЗВОНИТЬ / НАПИСАТЬ', kind: 'call'});
  if (e.buy?.length) out.push({text: 'КУПИТЬ: ' + e.buy.length, kind: 'buy'});
  for (const t of e.tags) if (!['pay', 'place', 'kid', 'call', 'buy', 'time'].includes(t)) out.push({text: TAG_TEXT[t] || t, kind: t as TagKind});
  return out;
}

export async function dayPdf(date = day.date(), forWhom: string | null = day.forWhom(), ver?: VersionInfo | null) {
  const list = day.list(date, forWhom);
  const k = await newKit({format: [380, 720], margin: 22}); const {pdf, M, W} = k;
  k.font('normal', 9, '#8b90a3'); k.text(forWhom ? `План · ${forWhom}` : 'План на день', M, k.y); k.y += 13;
  k.font('bold', 19); k.y += k.text(dateLong(date), M, k.y, {max: W - M * 2}) + 6;
  versionBanner(k, ver);
  const pay = list.filter(e => e.tags.includes('pay') && !e.done); const sum = pay.reduce((s, e) => s + (e.amount || 0), 0);
  const places = list.filter(e => e.place).length; const buy = list.reduce((s, e) => s + (e.buy?.length || 0), 0);
  const boxes: [string, string, string][] = [['Пунктов', String(list.length), '#203c4a']];
  if (pay.length) boxes.push([`Оплатить · ${pay.length}`, sum ? money(sum, pay[0].currency) : '—', '#a3321a']);
  if (places) boxes.push(['Поездок', String(places), '#2a4597']);
  if (buy) boxes.push(['Купить', String(buy), '#1d6a40']);
  const bw = (W - M * 2 - 6 * (boxes.length - 1)) / boxes.length;
  boxes.forEach(([a, b, c], n) => { const x = M + n * (bw + 6); pdf.setFillColor(...k.hex(c)); pdf.roundedRect(x, k.y, bw, 38, 7, 7, 'F'); k.font('normal', 7, '#ffffff'); k.text(a, x + 7, k.y + 6); k.font('bold', 11, '#ffffff'); k.text(b, x + 7, k.y + 18, {max: bw - 10}); });
  k.y += 50;
  if (!list.length) { k.font('normal', 11, '#5a6075'); k.text('Свободный день.', M, k.y); }
  list.forEach((e, n) => {
    const mark = ver?.marks?.[e.id]; const tags = entryTags(e, mark);
    k.font('bold', 12); const tl = pdf.splitTextToSize(e.title, W - M * 2 - 64) as string[];
    k.font('normal', 9); const wl = e.why ? pdf.splitTextToSize(e.why, W - M * 2 - 64) as string[] : [];
    const buyL = e.buy?.length ? pdf.splitTextToSize('• ' + e.buy.join('   • '), W - M * 2 - 64) as string[] : [];
    const h = tl.length * 15 + wl.length * 11.5 + buyL.length * 11.5 + (tags.length ? 3 + pills(k, 0, 0, W - M - (M + 64) - 8, tags, true) : 0) + 18;
    k.ensure(h);
    const top = k.y;
    pdf.setFillColor(...k.hex(e.done ? '#f1f2f5' : mark === 'changed' ? '#fff4d6' : mark === 'new' ? '#e6f5ff' : '#f6f7fb')); pdf.roundedRect(M, top, W - M * 2, h - 6, 9, 9, 'F');
    k.font('bold', 13, e.done ? '#a0a4b4' : '#3a4ea0'); k.text(String(n + 1), M + 10, top + 9);
    k.font('bold', 10.5, '#1d2233'); k.text(e.time || '—', M + 26, top + 10); if (e.end) { k.font('normal', 8, '#8b90a3'); k.text(e.end, M + 26, top + 24); }
    let y = top + 9; const x = M + 64;
    k.font('bold', 12, e.done ? '#a0a4b4' : '#1d2233'); pdf.text(tl, x, y, {baseline: 'top'} as any); y += tl.length * 15;
    if (wl.length) { k.font('normal', 9, '#5a6075'); pdf.text(wl, x, y, {baseline: 'top'} as any); y += wl.length * 11.5; }
    if (buyL.length) { k.font('normal', 9, '#1d6a40'); pdf.text(buyL, x, y, {baseline: 'top'} as any); y += buyL.length * 11.5; }
    if (tags.length) y += pills(k, x, y + 3, W - M - x - 8, tags);
    if (e.done) { k.font('bold', 8, '#2e9d63'); k.text('ГОТОВО', W - M - 10, top + 10, {align: 'right'}); }
    k.y = top + h;
  });
  removedList(k, ver?.removed);
  footer(k, (ver ? ver.number + ' · ' : '') + 'Sunrise Workshop · собрано агентом');
  return pdfBlob(k);
}
export const dayPdfName = (date: string, forWhom?: string | null) => `План ${date}${forWhom ? ' ' + forWhom : ''}.pdf`;
