// Quote / invoice PDF: header, client, lines, totals and the "Pay" block
// (EVM QR + copyable address, card-link QR, bank details).
import {newKit, imgFormat, footer, pdfBlob, versionBanner, removedList, pill, type Kit} from './pdfkit';
import type {VersionInfo} from '../docs/registry';
import {profile} from './profile';
import {plan} from './plan';
import {NETWORKS, paymentUri, qrDataUrl} from './evm';
import {invTotals, lineSum, cryptoAmount, type Invoice} from './store';

const L = {
  en: {invoice: 'INVOICE', quote: 'QUOTE', no: 'No.', issued: 'Issued', due: 'Due', valid: 'Valid until', billTo: 'Bill to', for: 'Prepared for', item: 'Item', qty: 'Qty', price: 'Price', amount: 'Amount',
    sub: 'Subtotal', disc: 'Discount', tax: 'Tax', total: 'Total', pay: 'How to pay', crypto: (t: string, n: string) => `${t} on ${n}`, onlyNet: (t: string, n: string) => `Send only ${t} on the ${n} network to this address.`,
    amountC: 'Amount', card: 'Card / online', bank: 'Bank transfer', notes: 'Notes', paid: 'PAID', thanks: 'Thank you for your business.', made: 'Made with Sunrise Workshop'},
  ru: {invoice: 'СЧЁТ', quote: 'КОММЕРЧЕСКОЕ ПРЕДЛОЖЕНИЕ', no: '№', issued: 'Дата', due: 'Оплатить до', valid: 'Действует до', billTo: 'Плательщик', for: 'Для', item: 'Позиция', qty: 'Кол-во', price: 'Цена', amount: 'Сумма',
    sub: 'Подытог', disc: 'Скидка', tax: 'Налог', total: 'Итого', pay: 'Как оплатить', crypto: (t: string, n: string) => `${t} в сети ${n}`, onlyNet: (t: string, n: string) => `Отправляйте на этот адрес только ${t} в сети ${n}.`,
    amountC: 'Сумма', card: 'Картой / онлайн', bank: 'Банковский перевод', notes: 'Примечания', paid: 'ОПЛАЧЕНО', thanks: 'Спасибо за сотрудничество.', made: 'Сделано в Sunrise Workshop'},
};
const fmt = (v: number, c: string, lang: 'en' | 'ru') => v.toLocaleString(lang === 'ru' ? 'ru-RU' : 'en-US', {minimumFractionDigits: 2, maximumFractionDigits: 2}).replace(/ | /g, ' ') + ' ' + c;
const dateText = (s: string, lang: 'en' | 'ru') => new Date(s + 'T12:00:00').toLocaleDateString(lang === 'ru' ? 'ru-RU' : 'en-US', {year: 'numeric', month: 'short', day: 'numeric'});

/** The payment block, reusable on any document. Crypto gets a full-width row so the address stays on one
 * selectable line; card and bank share the row below. Returns the height used. */
export function drawPayBlock(k: Kit, o: {amount?: number | null; currency: string; lang: 'en' | 'ru'; reference?: string}) {
  const p = profile.get(); const t = L[o.lang]; const {pdf, M, W} = k;
  if (!p.evm?.address && !p.cardLink && !p.bank) return 0;
  const y0 = k.y; k.ensure(60); k.font('bold', 11); k.text(t.pay, M, k.y); k.y += 18;
  const box = (x: number, y: number, w: number, h: number) => { pdf.setFillColor(...k.hex('#f3f5fa')); pdf.roundedRect(x, y, w, h, 8, 8, 'F'); };
  if (p.evm?.address) {
    const net = NETWORKS[p.evm.network]; const amt = o.amount; const h = 118; k.ensure(h + 8);
    const uri = p.evm.qr === 'request' ? paymentUri({address: p.evm.address, network: p.evm.network, token: p.evm.token, amount: amt}) : p.evm.address;
    box(M, k.y, W - M * 2, h); pdf.addImage(qrDataUrl(uri), 'PNG', M + 10, k.y + 10, 98, 98);
    const x = M + 122; let y = k.y + 12;
    k.font('bold', 11); k.text(t.crypto(p.evm.token, net.name), x, y); y += 18;
    k.font('bold', 9.6); k.text(p.evm.address, x, y); y += 16;      // one line: copy-paste safe
    if (amt) { k.font('normal', 9.5); k.text(`${t.amountC}: ${amt.toLocaleString('en-US', {maximumFractionDigits: 6})} ${p.evm.token}${o.reference ? '  ·  ' + o.reference : ''}`, x, y); y += 15; }
    k.font('normal', 8.3, '#a3321a'); k.text(t.onlyNet(p.evm.token, net.name), x, y, {max: W - M - x - 10});
    k.y += h + 8;
  }
  const cols: {title: string; qr?: string; lines: string[]; link?: string}[] = [];
  if (p.cardLink) cols.push({title: t.card, qr: qrDataUrl(p.cardLink), lines: [p.cardLink], link: p.cardLink});
  if (p.bank) cols.push({title: t.bank, lines: p.bank.split('\n').slice(0, 7)});
  if (cols.length) {
    const h = 96; k.ensure(h + 8); const gap = 8; const cw = (W - M * 2 - gap * (cols.length - 1)) / cols.length; const top = k.y;
    cols.forEach((c, i) => {
      const x = M + i * (cw + gap); box(x, top, cw, h);
      let tx = x + 10, tw = cw - 20;
      if (c.qr) { pdf.addImage(c.qr, 'PNG', x + 8, top + 8, 80, 80); tx = x + 96; tw = cw - 106; }
      k.font('bold', 10); k.text(c.title, tx, top + 12, {max: tw});
      let ly = top + 30;
      c.lines.forEach((ln, j) => {
        k.font(j === 0 && c.link ? 'bold' : 'normal', 8.6, c.link ? '#2a4597' : '#1d2233');
        const parts = pdf.splitTextToSize(ln, tw) as string[]; pdf.text(parts, tx, ly, {baseline: 'top'} as any);
        if (c.link) pdf.link(tx, ly, tw, parts.length * 11, {url: c.link});
        ly += parts.length * 11 + 2;
      });
    });
    k.y = top + h + 8;
  }
  k.y += 6;
  return k.y - y0;
}

export async function invoicePdf(inv: Invoice, ver?: VersionInfo | null) {
  const k = await newKit(); const {pdf, M, W} = k; const p = profile.get(); const t = L[inv.lang]; const tot = invTotals(inv);
  // Header: logo + seller on the left, document title on the right.
  let lx = M;
  if (p.logo) { try { pdf.addImage(p.logo, imgFormat(p.logo), M, k.y, 54, 54); lx = M + 66; } catch { /* bad image */ } }
  k.font('bold', 13); k.text(p.name || '—', lx, k.y);
  k.font('normal', 8.5, '#5a6075');
  let sy = k.y + 18; for (const s of [p.address, [p.email, p.phone].filter(Boolean).join(' · '), p.website, p.taxId].filter(Boolean) as string[]) sy += k.text(s, lx, sy, {max: 250});
  k.font('bold', inv.kind === 'quote' && inv.lang === 'ru' ? 14 : 20, '#3a4ea0'); k.text(inv.kind === 'quote' ? t.quote : t.invoice, W - M, k.y, {align: 'right'});
  k.font('normal', 9, '#1d2233');
  const meta = [[t.no, ver?.number || inv.number], [t.issued, dateText(inv.issueDate, inv.lang)], [inv.kind === 'quote' ? t.valid : t.due, dateText(inv.dueDate, inv.lang)]];
  meta.forEach(([a, b], i) => { k.font('normal', 8.5, '#5a6075'); k.text(a, W - M - 120, k.y + 30 + i * 14, {align: 'right'}); k.font('bold', 9); k.text(b, W - M, k.y + 30 + i * 14, {align: 'right'}); });
  k.y = Math.max(sy, k.y + 30 + meta.length * 14) + 22;

  // Client
  k.font('normal', 8.5, '#5a6075'); k.text(inv.kind === 'quote' ? t.for : t.billTo, M, k.y); k.y += 13;
  k.font('bold', 11); k.y += k.text(inv.client.name || '—', M, k.y, {max: 300});
  k.font('normal', 8.5, '#5a6075'); for (const s of [inv.client.address, [inv.client.email, inv.client.phone].filter(Boolean).join(' · ')].filter(Boolean) as string[]) k.y += k.text(s, M, k.y, {max: 300});
  if (inv.title) { k.y += 8; k.font('bold', 12); k.y += k.text(inv.title, M, k.y, {max: W - M * 2}); }
  k.y += 12;
  if (ver?.prev) versionBanner(k, ver, inv.lang);

  // Lines
  const cx = {n: M, name: M + 22, qty: W - M - 210, price: W - M - 110, amt: W - M};
  const head = () => { pdf.setFillColor(...k.hex('#eef1fa')); pdf.rect(M, k.y, W - M * 2, 20, 'F'); k.font('bold', 8.5, '#3a4060');
    k.text('#', cx.n + 4, k.y + 6); k.text(t.item, cx.name, k.y + 6); k.text(t.qty, cx.qty, k.y + 6, {align: 'right'}); k.text(t.price, cx.price, k.y + 6, {align: 'right'}); k.text(t.amount, cx.amt - 4, k.y + 6, {align: 'right'}); k.y += 26; };
  head();
  inv.lines.forEach((l, i) => {
    k.font('normal', 9.5); const nameLines = pdf.splitTextToSize(l.name, cx.qty - cx.name - 60) as string[];
    const h = nameLines.length * 12 + (l.note ? 11 : 0) + 8;
    if (k.y + h > k.H - 70) { pdf.addPage(); k.y = M; head(); }
    k.font('normal', 9, '#8b90a3'); k.text(String(i + 1), cx.n + 4, k.y);
    k.font('normal', 9.5); pdf.text(nameLines, cx.name, k.y, {baseline: 'top'} as any);
    if (l.note) { k.font('normal', 8, '#8b90a3'); k.text(l.note, cx.name, k.y + nameLines.length * 12); }
    const mk = ver?.marks?.[l.id]; if (mk) { k.font('normal', 9.5); const wN = pdf.getTextWidth(nameLines[nameLines.length - 1]); pill(k, cx.name + Math.min(wN + 6, cx.qty - cx.name - 110), k.y + (nameLines.length - 1) * 12 - 1, mk === 'new' ? (inv.lang === 'ru' ? 'НОВОЕ' : 'NEW') : (inv.lang === 'ru' ? 'ИЗМЕНЕНО' : 'CHANGED'), mk); }
    k.font('normal', 9.5); k.text(`${+l.qty.toFixed(3)}${l.unit ? ' ' + l.unit : ''}`, cx.qty, k.y, {align: 'right'});
    k.text(fmt(l.unitPrice, '', inv.lang).trim(), cx.price, k.y, {align: 'right'});
    k.font('bold', 9.5); k.text(fmt(lineSum(l), '', inv.lang).trim(), cx.amt - 4, k.y, {align: 'right'});
    k.y += h; pdf.setDrawColor(...k.hex('#e3e6ef')); pdf.line(M, k.y - 4, W - M, k.y - 4);
  });

  removedList(k, ver?.removed, inv.lang);
  // Totals
  k.ensure(90); k.y += 6;
  const rows: [string, string, boolean][] = [[t.sub, fmt(tot.sub, inv.currency, inv.lang), false]];
  if (tot.disc) rows.push([t.disc, '− ' + fmt(tot.disc, inv.currency, inv.lang), false]);
  if (inv.taxRate) rows.push([`${t.tax} ${inv.taxRate}%`, fmt(tot.tax, inv.currency, inv.lang), false]);
  rows.forEach(([a, b]) => { k.font('normal', 9.5, '#5a6075'); k.text(a, W - M - 150, k.y, {align: 'right'}); k.font('normal', 9.5); k.text(b, W - M - 4, k.y, {align: 'right'}); k.y += 15; });
  pdf.setFillColor(...k.hex('#3a4ea0')); pdf.roundedRect(W - M - 250, k.y, 250, 34, 6, 6, 'F');
  k.font('bold', 11, '#ffffff'); k.text(t.total, W - M - 238, k.y + 11); k.font('bold', 15, '#ffffff'); k.text(fmt(tot.total, inv.currency, inv.lang), W - M - 12, k.y + 8, {align: 'right'});
  k.y += 52;
  if (inv.status === 'paid') { k.font('bold', 28, '#2e9d63'); pdf.saveGraphicsState?.(); k.text(t.paid, M, k.y - 46); pdf.restoreGraphicsState?.(); }

  // Pay
  if (inv.status !== 'paid') drawPayBlock(k, {amount: cryptoAmount(inv), currency: inv.currency, lang: inv.lang, reference: inv.number});
  if (inv.notes) { k.ensure(50); k.font('bold', 9.5); k.text(t.notes, M, k.y); k.y += 14; k.font('normal', 8.8, '#3a4060'); k.y += k.text(inv.notes, M, k.y, {max: W - M * 2}); }
  k.y += 8; k.ensure(20); k.font('normal', 9, '#5a6075'); k.text(t.thanks, M, k.y);
  const no = ver?.number || inv.number;
  footer(k, plan.get().brandedDocs ? (p.footer || `${p.name} · ${no}`) : `${no} · ${t.made}`);
  return pdfBlob(k);
}
export const invoiceFileName = (inv: Invoice) => `${inv.number}${inv.client.name ? ' ' + inv.client.name.replace(/[\\/:*?"<>|]/g, '').slice(0, 40) : ''}.pdf`;
