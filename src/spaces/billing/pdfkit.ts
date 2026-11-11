// Shared PDF kit for every "final document" (quote, invoice, estimate, day plan).
// Text stays real text (Inter, Latin + Cyrillic), so addresses and amounts can be selected and copied.
import type {jsPDF as JsPDF} from 'jspdf';

let fontCache: Promise<{regular: string; bold: string}> | null = null;
async function fetchFont(name: string) {
  for (const p of [`vendor/fonts/${name}.ttf`, `vendor/fonts/${name}.ttf.txt`]) {
    try {
      const r = await fetch(new URL(p, document.baseURI).href); if (!r.ok) continue;
      const buf = new Uint8Array(await r.arrayBuffer()); if (buf.length < 1000) continue;
      let s = ''; for (let i = 0; i < buf.length; i += 0x8000) s += String.fromCharCode(...buf.subarray(i, i + 0x8000));
      return btoa(s);
    } catch { /* next */ }
  }
  throw new Error('PDF_FONT_MISSING');
}
const fonts = () => (fontCache ||= Promise.all([fetchFont('Inter-Regular'), fetchFont('Inter-Bold')]).then(([regular, bold]) => ({regular, bold})));

export type Kit = {
  pdf: JsPDF; W: number; H: number; M: number; y: number;
  font(w?: 'normal' | 'bold', size?: number, color?: string): void;
  text(s: string, x: number, y: number, o?: {align?: 'left' | 'right' | 'center'; max?: number}): number;
  ensure(h: number): void;
  hex(c: string): [number, number, number];
};
export async function newKit(o: {format?: [number, number]; margin?: number} = {}): Promise<Kit> {
  const [{jsPDF}, f] = await Promise.all([import('jspdf'), fonts()]);
  const pdf = new jsPDF({unit: 'pt', format: o.format || 'a4'});
  pdf.addFileToVFS('Inter-Regular.ttf', f.regular); pdf.addFont('Inter-Regular.ttf', 'Inter', 'normal');
  pdf.addFileToVFS('Inter-Bold.ttf', f.bold); pdf.addFont('Inter-Bold.ttf', 'Inter', 'bold');
  const W = pdf.internal.pageSize.getWidth(), H = pdf.internal.pageSize.getHeight();
  const hex = (c: string): [number, number, number] => { const v = c.replace('#', ''); return [parseInt(v.slice(0, 2), 16), parseInt(v.slice(2, 4), 16), parseInt(v.slice(4, 6), 16)]; };
  const M0 = o.margin ?? 44;
  const k: Kit = {pdf, W, H, M: M0, y: M0, hex,
    font(w = 'normal', size = 10, color = '#1d2233') { pdf.setFont('Inter', w); pdf.setFontSize(size); pdf.setTextColor(...hex(color)); },
    /** Draws wrapped text and returns its height. */
    text(s, x, y, o = {}) {
      const lines = o.max ? pdf.splitTextToSize(String(s ?? ''), o.max) as string[] : [String(s ?? '')];
      pdf.text(lines, x, y, {align: o.align || 'left', baseline: 'top'} as any);
      return lines.length * pdf.getFontSize() * 1.25;
    },
    ensure(h) { if (k.y + h > H - Math.max(36, M0 + 12)) { pdf.addPage(o.format || 'a4'); k.y = k.M; } },
  };
  return k;
}
export const imgFormat = (data: string) => /^data:image\/(png|gif|webp)/.test(data) ? 'PNG' : 'JPEG';

/** Same idea everywhere: numbered points with tags; used by the day plan and summaries. */
export function footer(k: Kit, text: string) {
  const n = k.pdf.getNumberOfPages();
  for (let p = 1; p <= n; p++) { k.pdf.setPage(p); k.font('normal', 7.5, '#8b90a3'); k.text(text, k.M, k.H - Math.min(30, k.M + 4), {max: k.W - k.M * 2 - 40}); k.text(`${p} / ${n}`, k.W - k.M, k.H - Math.min(30, k.M + 4), {align: 'right'}); }
}
/** Tag colours shared by every document: the same meaning looks the same everywhere. */
export const TAG = {
  pay: {bg: '#fde3dc', fg: '#a3321a'}, place: {bg: '#dfe9fb', fg: '#2a4597'}, buy: {bg: '#dff3e6', fg: '#1d6a40'},
  kid: {bg: '#efe3fb', fg: '#6a2fa0'}, time: {bg: '#dcf2f2', fg: '#17666a'}, call: {bg: '#fbefd6', fg: '#7c5512'}, task: {bg: '#eceef3', fg: '#3a4060'}, note: {bg: '#f3f3f3', fg: '#5a6075'},
  changed: {bg: '#ffd88a', fg: '#6b3a00'}, new: {bg: '#bfe6ff', fg: '#0b4a73'},
} as const;
export type TagKind = keyof typeof TAG;
/** Draws a small rounded label; returns its width. Optional link (maps, payment). */
export function pill(k: Kit, x: number, y: number, text: string, kind: TagKind, url?: string) {
  const c = TAG[kind] || TAG.note; k.font('bold', 7.6, c.fg);
  const w = k.pdf.getTextWidth(text) + 12;
  k.pdf.setFillColor(...k.hex(c.bg)); k.pdf.roundedRect(x, y, w, 14, 7, 7, 'F');
  k.pdf.text(text, x + 6, y + 3.4, {baseline: 'top'} as any);
  if (url) k.pdf.link(x, y, w, 14, {url});
  return w;
}
/** Lays pills out left to right, wrapping; returns the height used. */
export function pills(k: Kit, x: number, y: number, maxW: number, list: {text: string; kind: TagKind; url?: string}[], dry = false) {
  let cx = x, cy = y;
  for (const p of list) {
    k.font('bold', 7.6); const w = k.pdf.getTextWidth(p.text) + 12;
    if (cx + w > x + maxW && cx > x) { cx = x; cy += 18; }
    const t = p.text.length > 70 ? p.text.slice(0, 68) + '…' : p.text;
    cx += (dry ? (k.pdf.getTextWidth(t) + 12) : pill(k, cx, cy, t, p.kind, p.url)) + 5;
  }
  return list.length ? cy - y + 18 : 0;
}
export const mapUrl = (q: string) => 'https://www.google.com/maps/search/?api=1&query=' + encodeURIComponent(q);
/** Version stamp: number, date, which version it replaces and what changed. Returns height used. */
export type VerLike = {number: string; version: number; issuedAt: number; prev?: {number: string; issuedAt: number} | null; changes: string[]; removed?: string[]; note?: string};
const when = (t: number) => new Date(t).toLocaleString('ru-RU', {day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit'});
export function versionBanner(k: Kit, v?: VerLike | null, lang: 'ru' | 'en' = 'ru') {
  const en = lang === 'en'; const whenL = (t: number) => en ? new Date(t).toLocaleString('en-US', {month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit'}) : when(t);
  if (!v) return 0;
  const {pdf, M, W} = k; const y0 = k.y;
  if (!v.prev) { k.font('bold', 8.5, '#3a4ea0'); k.text(`№ ${v.number} · ${whenL(v.issuedAt)}`, M, k.y); k.y += 16; return k.y - y0; }
  const lines = [...v.changes.slice(0, 8), ...(v.changes.length > 8 ? [`… ${en ? 'more' : 'ещё'} ${v.changes.length - 8}`] : [])];
  k.font('normal', 8.4); const wrapped = lines.map(l => pdf.splitTextToSize('• ' + l, W - M * 2 - 20) as string[]);
  const noteL = v.note ? pdf.splitTextToSize(v.note, W - M * 2 - 20) as string[] : [];
  const h = 34 + wrapped.reduce((s, w) => s + w.length * 10.5, 0) + noteL.length * 10.5 + 6;
  pdf.setFillColor(...k.hex('#fff4d6')); pdf.setDrawColor(...k.hex('#e0a526')); pdf.roundedRect(M, k.y, W - M * 2, h, 7, 7, 'FD');
  k.font('bold', 9.5, '#6b3a00'); k.text(en ? `No. ${v.number} · revised ${whenL(v.issuedAt)}` : `№ ${v.number} · новая версия ${whenL(v.issuedAt)}`, M + 10, k.y + 8, {max: W - M * 2 - 20});
  k.font('normal', 8, '#8a5a10'); k.text(en ? `replaces ${v.prev.number} of ${whenL(v.prev.issuedAt)}` : `заменяет ${v.prev.number} от ${whenL(v.prev.issuedAt)}`, M + 10, k.y + 21, {max: W - M * 2 - 20});
  let y = k.y + 34;
  if (noteL.length) { k.font('bold', 8.4, '#3a2a00'); pdf.text(noteL, M + 10, y, {baseline: 'top'} as any); y += noteL.length * 10.5; }
  k.font('normal', 8.4, '#3a2a00'); for (const w of wrapped) { pdf.text(w, M + 10, y, {baseline: 'top'} as any); y += w.length * 10.5; }
  k.y += h + 10; return k.y - y0;
}
/** "Cancelled" list for removed lines. */
export function removedList(k: Kit, removed?: string[], lang: 'ru' | 'en' = 'ru') {
  if (!removed?.length) return;
  k.ensure(30 + removed.length * 12); k.font('bold', 9, '#a3321a'); k.text(lang === 'en' ? 'REMOVED in this version' : 'ОТМЕНЕНО в этой версии', k.M, k.y); k.y += 13;
  k.font('normal', 8.8, '#8b90a3'); for (const r of removed) { const w = k.pdf.getTextWidth(r); k.text(r, k.M + 8, k.y); k.pdf.setDrawColor(...k.hex('#a0a4b4')); k.pdf.line(k.M + 8, k.y + 5.5, k.M + 8 + w, k.y + 5.5); k.y += 12; }
  k.y += 6;
}
export function pdfBlob(k: Kit) { return k.pdf.output('blob') as Blob; }
