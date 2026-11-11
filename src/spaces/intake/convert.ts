// Intake converters. Every file becomes the same three things the room understands:
//   pages    — WebP images (what the board, notebook and the agent's eyes see)
//   markdown — text layer (what the notebook, search and the agent read)
//   meta     — JSON facts (size, pages, duration, sheets, camera…)
// Heavy libraries are imported lazily, so the room stays fast until a file needs them.
import type {Detected} from './detect';

export type Page = {blob: Blob; w: number; h: number; label?: string};
export type Converted = {
  pages: Page[];
  markdown: string;
  meta: Record<string, unknown>;
  status: 'ready' | 'partial' | 'needs-agent';
  note?: string;
  /** Files found inside an archive, offered for extraction. */
  entries?: {name: string; size: number}[];
};

const MAX_EDGE = 2400;
const MAX_PDF_PAGES = 40;
const MAX_SHEET_ROWS = 400;
const WEBP_Q = 0.9;

// ---------- canvas helpers ----------
function canvas(w: number, h: number) {
  const c = document.createElement('canvas');
  c.width = Math.max(1, Math.round(w)); c.height = Math.max(1, Math.round(h));
  return c;
}
function toBlob(c: HTMLCanvasElement): Promise<Blob> {
  return new Promise((res, rej) => c.toBlob(b => (b ? res(b) : rej(new Error('ENCODE_FAILED'))), 'image/webp', WEBP_Q));
}
export async function sourceToPage(src: CanvasImageSource, w: number, h: number, label?: string, max = MAX_EDGE): Promise<Page> {
  const k = Math.min(1, max / Math.max(w, h));
  const c = canvas(w * k, h * k);
  const ctx = c.getContext('2d')!;
  ctx.imageSmoothingQuality = 'high';
  ctx.drawImage(src, 0, 0, c.width, c.height);
  return {blob: await toBlob(c), w: c.width, h: c.height, label};
}
async function bitmapPage(blob: Blob, label?: string): Promise<Page> {
  const bmp = await createImageBitmap(blob, {imageOrientation: 'from-image'} as ImageBitmapOptions);
  try { return await sourceToPage(bmp, bmp.width, bmp.height, label); } finally { bmp.close?.(); }
}
function loadImg(url: string): Promise<HTMLImageElement> {
  return new Promise((res, rej) => { const i = new Image(); i.onload = () => res(i); i.onerror = () => rej(new Error('IMAGE_DECODE_FAILED')); i.src = url; });
}
function withTimeout<T>(p: Promise<T>, ms: number, code = 'TIMEOUT'): Promise<T> {
  return Promise.race([p, new Promise<T>((_, rej) => setTimeout(() => rej(new Error(code)), ms))]);
}

/** A neutral cover card, used when a format can only be shown by name until the agent converts it. */
export async function coverPage(title: string, format: string, lines: string[] = [], tone = '#5d6fae'): Promise<Page> {
  const c = canvas(1200, 900); const x = c.getContext('2d')!;
  const g = x.createLinearGradient(0, 0, 1200, 900); g.addColorStop(0, '#f7f4ee'); g.addColorStop(1, '#e8ecf7');
  x.fillStyle = g; x.fillRect(0, 0, 1200, 900);
  x.fillStyle = tone; x.beginPath(); (x as any).roundRect?.(80, 90, 300, 110, 22); x.fill();
  x.fillStyle = '#fff'; x.font = '600 52px system-ui, sans-serif'; x.textBaseline = 'middle';
  x.fillText(format.slice(0, 10), 106, 147);
  x.fillStyle = '#1f2433'; x.font = '600 54px system-ui, sans-serif';
  wrap(x, title, 80, 300, 1040, 64, 3);
  x.fillStyle = '#5a6074'; x.font = '32px system-ui, sans-serif';
  lines.slice(0, 6).forEach((l, i) => x.fillText(l.slice(0, 70), 80, 560 + i * 48));
  return {blob: await toBlob(c), w: 1200, h: 900, label: format};
}
function wrap(x: CanvasRenderingContext2D, text: string, left: number, top: number, width: number, lh: number, maxLines: number) {
  const words = text.split(/\s+/); let line = '', n = 0;
  for (const w of words) {
    const t = line ? line + ' ' + w : w;
    if (x.measureText(t).width > width && line) { x.fillText(line, left, top + n * lh); line = w; if (++n >= maxLines) return; }
    else line = t;
  }
  if (line && n < maxLines) x.fillText(line, left, top + n * lh);
}

// ---------- HTML → page image / markdown ----------
const SAFE_TAGS = new Set(['P', 'H1', 'H2', 'H3', 'H4', 'H5', 'H6', 'UL', 'OL', 'LI', 'TABLE', 'THEAD', 'TBODY', 'TR', 'TD', 'TH', 'STRONG', 'B', 'EM', 'I', 'U', 'BR', 'IMG', 'A', 'SPAN', 'DIV', 'BLOCKQUOTE', 'PRE', 'CODE', 'SUP', 'SUB', 'HR', 'SECTION', 'ARTICLE', 'FIGURE', 'FIGCAPTION']);
/** Keep only inert markup: no scripts, handlers, styles or remote URLs. */
export function sanitizeHtml(html: string) {
  const doc = new DOMParser().parseFromString(html, 'text/html');
  const walk = (el: Element) => {
    for (const child of [...el.children]) {
      if (!SAFE_TAGS.has(child.tagName)) { child.replaceWith(...[...child.childNodes]); continue; }
      for (const a of [...child.attributes]) {
        const keep = (child.tagName === 'IMG' && a.name === 'src' && /^data:image\//.test(a.value)) || ['colspan', 'rowspan'].includes(a.name);
        if (!keep) child.removeAttribute(a.name);
      }
      walk(child);
    }
  };
  walk(doc.body);
  return doc.body.innerHTML;
}
export function htmlToMarkdown(html: string) {
  const doc = new DOMParser().parseFromString(html, 'text/html');
  const out: string[] = [];
  const text = (n: Node): string => {
    if (n.nodeType === 3) return (n.textContent || '').replace(/\s+/g, ' ');
    if (n.nodeType !== 1) return '';
    const el = n as Element, inner = [...el.childNodes].map(text).join('');
    switch (el.tagName) {
      case 'STRONG': case 'B': return inner.trim() ? `**${inner.trim()}**` : '';
      case 'EM': case 'I': return inner.trim() ? `*${inner.trim()}*` : '';
      case 'BR': return '\n';
      case 'IMG': return '[image]';
      default: return inner;
    }
  };
  const block = (el: Element) => {
    const t = el.tagName;
    if (/^H[1-6]$/.test(t)) out.push('#'.repeat(+t[1]) + ' ' + text(el).trim());
    else if (t === 'UL' || t === 'OL') [...el.children].forEach((li, i) => out.push((t === 'OL' ? `${i + 1}. ` : '- ') + text(li).trim()));
    else if (t === 'TABLE') {
      const rows = [...el.querySelectorAll('tr')].map(tr => [...tr.children].map(td => text(td).trim().replace(/\|/g, '\\|')));
      if (rows.length) { out.push(mdTable(rows)); }
    } else if (t === 'PRE') out.push('```\n' + (el.textContent || '') + '\n```');
    else if (t === 'BLOCKQUOTE') out.push('> ' + text(el).trim());
    else if (['DIV', 'SECTION', 'ARTICLE'].includes(t) && el.children.length) [...el.children].forEach(block);
    else { const s = text(el).trim(); if (s) out.push(s); }
  };
  [...doc.body.children].forEach(block);
  return out.join('\n\n');
}
export function mdTable(rows: string[][]) {
  const width = Math.max(...rows.map(r => r.length), 1);
  const pad = (r: string[]) => '| ' + Array.from({length: width}, (_, i) => r[i] ?? '').join(' | ') + ' |';
  return [pad(rows[0]), '| ' + Array(width).fill('---').join(' | ') + ' |', ...rows.slice(1).map(pad)].join('\n');
}

const PAGE_CSS = 'box-sizing:border-box;width:900px;padding:56px 64px;background:#fffdf8;color:#222;font:17px/1.55 Georgia,"Times New Roman",serif;overflow:hidden;';
/** Render trusted (sanitized) HTML into one A4-proportioned page image. */
export async function htmlPage(html: string, label?: string, tall = false): Promise<Page> {
  const {toCanvas} = await import('html-to-image');
  const host = document.createElement('div');
  host.setAttribute('aria-hidden', 'true');
  host.style.cssText = 'position:fixed;left:-12000px;top:0;pointer-events:none;';
  const sheet = document.createElement('div');
  sheet.style.cssText = PAGE_CSS + `height:${tall ? 'auto' : Math.round(900 * 297 / 210) + 'px'};max-height:${Math.round(900 * 297 / 210)}px;`;
  sheet.innerHTML = '<style>table{border-collapse:collapse;font:13px/1.35 system-ui,sans-serif}td,th{border:1px solid #c9c4b8;padding:3px 6px;vertical-align:top}th{background:#f1ede4}img{max-width:100%}h1,h2,h3{font-family:system-ui,sans-serif;line-height:1.2}pre{white-space:pre-wrap;font:13px/1.45 ui-monospace,Menlo,Consolas,monospace}</style>' + html;
  host.appendChild(sheet); document.body.appendChild(host);
  try {
    const c = await toCanvas(sheet, {pixelRatio: 1.4, backgroundColor: '#fffdf8', cacheBust: false});
    return {blob: await toBlob(c), w: c.width, h: c.height, label};
  } finally { host.remove(); }
}
const esc = (s: string) => s.replace(/[&<>"]/g, c => ({'&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;'}[c]!));

// ---------- embedded JPEG previews (RAW, PSD, EPS, INDD…) ----------
/** Many professional formats carry a ready JPEG preview. Find the largest one that decodes. */
export async function embeddedJpeg(buf: ArrayBuffer): Promise<{page: Page; w: number; h: number} | null> {
  const b = new Uint8Array(buf);
  const hits: number[] = [];
  for (let i = 0; i < b.length - 3 && hits.length < 24; i++) {
    if (b[i] === 0xff && b[i + 1] === 0xd8 && b[i + 2] === 0xff && (b[i + 3] & 0xf0) === 0xe0 || (b[i] === 0xff && b[i + 1] === 0xd8 && b[i + 2] === 0xff && b[i + 3] === 0xdb)) hits.push(i);
  }
  let best: {bmp: ImageBitmap; area: number} | null = null;
  for (let k = 0; k < hits.length; k++) {
    const end = k + 1 < hits.length ? hits[k + 1] : b.length;
    if (end - hits[k] < 4000) continue;
    try {
      const bmp = await createImageBitmap(new Blob([b.slice(hits[k], end)], {type: 'image/jpeg'}));
      const area = bmp.width * bmp.height;
      if (!best || area > best.area) { best?.bmp.close(); best = {bmp, area}; } else bmp.close();
    } catch { /* not a decodable preview */ }
  }
  if (!best || best.bmp.width < 160) { best?.bmp.close(); return null; }
  const page = await sourceToPage(best.bmp, best.bmp.width, best.bmp.height, 'preview');
  const r = {page, w: best.bmp.width, h: best.bmp.height};
  best.bmp.close();
  return r;
}

// ---------- family converters ----------
async function convertImage(file: Blob, det: Detected): Promise<Converted> {
  let blob = file;
  if (det.format === 'HEIC') {
    const heic2any = (await import('heic2any')).default as any;
    const out = await heic2any({blob: file, toType: 'image/jpeg', quality: 0.92});
    blob = Array.isArray(out) ? out[0] : out;
  }
  if (det.format === 'TIFF') return convertTiff(await file.arrayBuffer());
  try {
    const page = await bitmapPage(blob);
    return {pages: [page], markdown: '', meta: {width: page.w, height: page.h}, status: 'ready'};
  } catch {
    // Some browsers cannot decode AVIF/ICO through createImageBitmap; try an <img> element.
    const url = URL.createObjectURL(blob);
    try { const img = await loadImg(url); const page = await sourceToPage(img, img.naturalWidth, img.naturalHeight); return {pages: [page], markdown: '', meta: {width: img.naturalWidth, height: img.naturalHeight}, status: 'ready'}; }
    finally { URL.revokeObjectURL(url); }
  }
}

async function convertTiff(buf: ArrayBuffer): Promise<Converted> {
  const UTIF = (await import('utif')).default as any;
  const ifds = UTIF.decode(buf).filter((f: any) => f.t256 && f.t257);
  const pages: Page[] = [];
  for (const ifd of ifds.slice(0, 20)) {
    try {
      UTIF.decodeImage(buf, ifd);
      const rgba = UTIF.toRGBA8(ifd); const w = ifd.width, h = ifd.height;
      if (!w || !h) continue;
      const c = canvas(w, h); c.getContext('2d')!.putImageData(new ImageData(new Uint8ClampedArray(rgba.buffer, rgba.byteOffset, w * h * 4), w, h), 0, 0);
      pages.push(await sourceToPage(c, w, h, 'p. ' + (pages.length + 1)));
    } catch { /* skip undecodable sub-image */ }
  }
  if (!pages.length) throw new Error('TIFF_DECODE_FAILED');
  return {pages, markdown: '', meta: {pages: pages.length, width: pages[0].w, height: pages[0].h}, status: 'ready'};
}

async function convertRaw(file: Blob, det: Detected): Promise<Converted> {
  const buf = await file.arrayBuffer();
  const prev = await embeddedJpeg(buf);
  if (prev) return {pages: [prev.page], markdown: '', meta: {previewWidth: prev.w, previewHeight: prev.h, source: 'embedded camera preview'}, status: 'partial', note: 'raw-preview'};
  try { const t = await convertTiff(buf); return {...t, status: 'partial', note: 'raw-preview'}; } catch { /* fall through */ }
  return {pages: [await coverPage(det.format, 'RAW')], markdown: '', meta: {}, status: 'needs-agent', note: 'raw-no-preview'};
}

async function convertSvg(file: Blob): Promise<Converted> {
  const src = await file.text();
  // The SVG is drawn as an <img>, so its scripts never run.
  const url = URL.createObjectURL(new Blob([src], {type: 'image/svg+xml'}));
  try {
    const img = await loadImg(url);
    const w = img.naturalWidth || 1200, h = img.naturalHeight || 900, k = Math.max(1, 1600 / Math.max(w, h));
    const c = canvas(w * k, h * k); const x = c.getContext('2d')!; x.fillStyle = '#fff'; x.fillRect(0, 0, c.width, c.height); x.drawImage(img, 0, 0, c.width, c.height);
    return {pages: [{blob: await toBlob(c), w: c.width, h: c.height}], markdown: '```svg\n' + src.slice(0, 20000) + '\n```', meta: {width: w, height: h}, status: 'ready'};
  } finally { URL.revokeObjectURL(url); }
}

export async function loadPdfjs() {
  const pdfjs: any = await import('pdfjs-dist');
  pdfjs.GlobalWorkerOptions.workerSrc = '/vendor/pdf.worker.min.mjs';
  return pdfjs;
}
async function convertPdf(file: Blob): Promise<Converted> {
  const pdfjs = await loadPdfjs();
  const doc = await pdfjs.getDocument({data: new Uint8Array(await file.arrayBuffer()), isEvalSupported: false}).promise;
  const pages: Page[] = []; const text: string[] = [];
  const n = Math.min(doc.numPages, MAX_PDF_PAGES);
  for (let i = 1; i <= n; i++) {
    const p = await doc.getPage(i);
    const base = p.getViewport({scale: 1});
    const vp = p.getViewport({scale: Math.min(2.2, 1600 / base.width)});
    const c = canvas(vp.width, vp.height); const ctx = c.getContext('2d')!;
    ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, c.width, c.height);
    await p.render({canvasContext: ctx, viewport: vp}).promise;
    pages.push({blob: await toBlob(c), w: c.width, h: c.height, label: 'p. ' + i});
    const tc = await p.getTextContent();
    const s = tc.items.map((it: any) => (it.str || '') + (it.hasEOL ? '\n' : ' ')).join('').replace(/[ \t]+\n/g, '\n').trim();
    text.push(`## Page ${i}\n\n${s}`);
    p.cleanup();
  }
  const info = await doc.getMetadata().catch(() => null);
  const meta = {pages: doc.numPages, shownPages: n, title: info?.info?.Title || null, author: info?.info?.Author || null};
  const hasText = text.some(t => t.split('\n\n')[1]?.trim());
  await doc.destroy();
  return {pages, markdown: text.join('\n\n'), meta, status: doc.numPages > n ? 'partial' : 'ready', note: doc.numPages > n ? 'pdf-truncated' : (!hasText ? 'pdf-scanned' : undefined)};
}

async function convertDocx(file: Blob): Promise<Converted> {
  const mod: any = await import('mammoth');
  const mammoth = mod.convertToHtml ? mod : mod.default;
  const r = await mammoth.convertToHtml({arrayBuffer: await file.arrayBuffer()});
  const html = sanitizeHtml(r.value || '');
  const md = htmlToMarkdown(html);
  const pages = [await htmlPage(html || '<p>(empty)</p>', 'p. 1')];
  return {pages, markdown: md, meta: {words: md.split(/\s+/).filter(Boolean).length, warnings: (r.messages || []).length}, status: 'ready', note: 'doc-first-page'};
}

async function unzip(file: Blob) {
  const {unzipSync} = await import('fflate');
  return unzipSync(new Uint8Array(await file.arrayBuffer()));
}
const xmlText = (xml: string, tag: string) => [...xml.matchAll(new RegExp(`<${tag}[^>]*>([^<]*)</${tag}>`, 'g'))].map(m => decodeXml(m[1]));
const decodeXml = (s: string) => s.replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&apos;/g, "'").replace(/&amp;/g, '&');
const utf8 = (u?: Uint8Array) => (u ? new TextDecoder().decode(u) : '');

async function convertOpenDoc(file: Blob, det: Detected): Promise<Converted> {
  const files = await unzip(file);
  if (det.ext === 'epub') {
    const chapters = Object.keys(files).filter(n => /\.x?html?$/i.test(n)).sort().slice(0, 12);
    const html = chapters.map(n => sanitizeHtml(new DOMParser().parseFromString(utf8(files[n]), 'text/html').body.innerHTML)).join('<hr>');
    return {pages: [await htmlPage(html, 'p. 1')], markdown: htmlToMarkdown(html), meta: {chapters: chapters.length}, status: 'partial', note: 'doc-first-page'};
  }
  const content = utf8(files['content.xml']);
  const paras = [...content.matchAll(/<text:(h|p)[^>]*>([\s\S]*?)<\/text:\1>/g)].map(m => ({h: m[1] === 'h', t: decodeXml(m[2].replace(/<[^>]+>/g, ''))}));
  const html = paras.map(p => p.h ? `<h2>${esc(p.t)}</h2>` : `<p>${esc(p.t)}</p>`).join('');
  const thumb = files['Thumbnails/thumbnail.png'];
  const pages = [await htmlPage(html || '<p>(empty)</p>', 'p. 1')];
  if (thumb && !paras.length) pages.unshift(await bitmapPage(new Blob([thumb], {type: 'image/png'}), 'thumbnail'));
  return {pages, markdown: paras.map(p => (p.h ? '## ' : '') + p.t).join('\n\n'), meta: {paragraphs: paras.length}, status: 'ready', note: 'doc-first-page'};
}

async function convertPptx(file: Blob, det: Detected): Promise<Converted> {
  const files = await unzip(file);
  if (det.ext === 'odp') {
    const content = utf8(files['content.xml']);
    const slides = content.split(/<draw:page\b/).slice(1).map(s => [...s.matchAll(/<text:(?:p|span)[^>]*>([^<]+)</g)].map(m => decodeXml(m[1])));
    return slidesToPages(slides, files['Thumbnails/thumbnail.png'], 'image/png');
  }
  const names = Object.keys(files).filter(n => /^ppt\/slides\/slide\d+\.xml$/.test(n)).sort((a, b) => +a.match(/\d+/)![0] - +b.match(/\d+/)![0]);
  const slides = names.map(n => xmlText(utf8(files[n]), 'a:t'));
  return slidesToPages(slides, files['docProps/thumbnail.jpeg'], 'image/jpeg');
}
async function slidesToPages(slides: string[][], thumb: Uint8Array | undefined, thumbType: string): Promise<Converted> {
  const pages: Page[] = [];
  if (thumb) { try { pages.push(await bitmapPage(new Blob([thumb], {type: thumbType}), 'cover')); } catch { /* ignore */ } }
  for (const [i, s] of slides.slice(0, 30).entries()) {
    const [title, ...rest] = s.filter(Boolean);
    pages.push(await htmlPage(`<div style="font-family:system-ui,sans-serif"><div style="color:#8a8fa3;font-size:14px">Slide ${i + 1}</div><h1 style="font-size:40px;margin:.4em 0">${esc(title || '')}</h1>${rest.map(r => `<p style="font-size:22px">${esc(r)}</p>`).join('')}</div>`, 'slide ' + (i + 1)));
  }
  const markdown = slides.map((s, i) => `## Slide ${i + 1}\n\n${s.filter(Boolean).join('\n')}`).join('\n\n');
  return {pages, markdown, meta: {slides: slides.length}, status: 'partial', note: 'slides-text'};
}

async function convertSheet(file: Blob, det: Detected): Promise<Converted> {
  const XLSX: any = await import('xlsx');
  const wb = det.family === 'sheet' && ['csv', 'tsv'].includes(det.ext)
    ? XLSX.read(await file.text(), {type: 'string', FS: det.ext === 'tsv' ? '\t' : undefined})
    : XLSX.read(new Uint8Array(await file.arrayBuffer()), {type: 'array'});
  const md: string[] = []; const pages: Page[] = []; const sheets: Record<string, unknown> = {};
  for (const name of wb.SheetNames.slice(0, 12)) {
    const rows: string[][] = XLSX.utils.sheet_to_json(wb.Sheets[name], {header: 1, raw: false, blankrows: false, defval: ''}).map((r: any[]) => r.map(v => String(v ?? '')));
    const cut = rows.slice(0, MAX_SHEET_ROWS).map(r => r.slice(0, 40));
    sheets[name] = {rows: rows.length, cols: Math.max(0, ...rows.map(r => r.length))};
    md.push(`## ${name}\n\n` + (cut.length ? mdTable(cut.map(r => r.map(v => v.replace(/\|/g, '\\|').replace(/\n/g, ' ')))) : '(empty)'));
    if (pages.length < 6 && cut.length) {
      const view = cut.slice(0, 45).map(r => r.slice(0, 12));
      const html = `<h3 style="margin:0 0 12px">${esc(name)}</h3><table>${view.map((r, i) => `<tr>${r.map(v => i ? `<td>${esc(v.slice(0, 40))}</td>` : `<th>${esc(v.slice(0, 40))}</th>`).join('')}</tr>`).join('')}</table>`;
      pages.push(await htmlPage(html, name));
    }
  }
  return {pages, markdown: md.join('\n\n'), meta: {sheets}, status: 'ready'};
}

async function convertText(file: Blob, det: Detected): Promise<Converted> {
  let s = await file.text();
  if (det.format === 'JSON') { try { s = JSON.stringify(JSON.parse(s), null, 2); } catch { /* keep as is */ } }
  if (det.format === 'RTF') s = s.replace(/\\par[d]?/g, '\n').replace(/\{\\\*[^}]*\}/g, '').replace(/\\[a-z]+-?\d* ?/g, '').replace(/[{}]/g, '').trim();
  const code = det.format.startsWith('Code') || det.format === 'JSON' || det.family === 'cad';
  const markdown = code ? '```' + det.ext + '\n' + s + '\n```' : s;
  const lines = s.split('\n');
  const html = `<pre style="${code ? '' : 'font:16px/1.55 Georgia,serif;'}">${esc(lines.slice(0, 70).join('\n').slice(0, 6000))}</pre>`;
  return {pages: [await htmlPage(html, 'p. 1')], markdown, meta: {lines: lines.length, chars: s.length, words: s.split(/\s+/).filter(Boolean).length}, status: det.family === 'cad' ? 'needs-agent' : 'ready', note: det.family === 'cad' ? 'cad-text' : undefined};
}

async function convertVideo(file: Blob): Promise<Converted> {
  const url = URL.createObjectURL(file);
  const v = document.createElement('video'); v.muted = true; v.preload = 'auto'; v.playsInline = true; v.src = url;
  try {
    await withTimeout(new Promise<void>((res, rej) => { v.onloadeddata = () => res(); v.onerror = () => rej(new Error('VIDEO_DECODE_FAILED')); }), 12000, 'VIDEO_DECODE_FAILED');
    const duration = v.duration || 0; const frames: Page[] = [];
    // Three stills give the board and the agent a sense of the whole clip.
    for (const at of duration > 3 ? [0.08, 0.5, 0.9] : [0]) {
      v.currentTime = Math.max(0, Math.min(duration - 0.05, duration * at));
      await withTimeout(new Promise<void>(res => { v.onseeked = () => res(); }), 6000).catch(() => undefined);
      if (!v.videoWidth) break;
      frames.push(await sourceToPage(v, v.videoWidth, v.videoHeight, fmtTime(v.currentTime), 1600));
    }
    if (!frames.length) throw new Error('VIDEO_DECODE_FAILED');
    return {pages: frames, markdown: '', meta: {duration: Math.round(duration * 10) / 10, width: v.videoWidth, height: v.videoHeight}, status: 'ready'};
  } finally { v.removeAttribute('src'); v.load(); URL.revokeObjectURL(url); }
}
const fmtTime = (s: number) => `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, '0')}`;

async function convertAudio(file: Blob, name: string): Promise<Converted> {
  const Ctx = (window as any).AudioContext || (window as any).webkitAudioContext;
  const ac = new Ctx();
  try {
    const buf: AudioBuffer = await withTimeout(ac.decodeAudioData(await file.arrayBuffer()), 20000, 'AUDIO_DECODE_FAILED');
    const c = canvas(1600, 500); const x = c.getContext('2d')!;
    x.fillStyle = '#f7f4ee'; x.fillRect(0, 0, 1600, 500);
    const data = buf.getChannelData(0), step = Math.max(1, Math.floor(data.length / 1500));
    x.fillStyle = '#5d6fae';
    for (let i = 0; i < 1500; i++) {
      let peak = 0; for (let j = 0; j < step; j++) peak = Math.max(peak, Math.abs(data[i * step + j] || 0));
      const h = Math.max(2, peak * 300); x.fillRect(50 + i * (1500 / 1500), 270 - h / 2, 0.8, h);
    }
    x.fillStyle = '#1f2433'; x.font = '600 34px system-ui, sans-serif'; x.fillText(name.slice(0, 60), 50, 70);
    x.fillStyle = '#5a6074'; x.font = '26px system-ui, sans-serif'; x.fillText(`${fmtTime(buf.duration)} · ${buf.numberOfChannels} ch · ${buf.sampleRate} Hz`, 50, 460);
    return {pages: [{blob: await toBlob(c), w: 1600, h: 500, label: 'waveform'}], markdown: '', meta: {duration: Math.round(buf.duration * 10) / 10, channels: buf.numberOfChannels, sampleRate: buf.sampleRate}, status: 'ready', note: 'audio-transcript'};
  } finally { ac.close?.(); }
}

async function convertFont(file: Blob, name: string): Promise<Converted> {
  const family = 'intake-' + Math.random().toString(36).slice(2, 8);
  const face = new FontFace(family, await file.arrayBuffer());
  await face.load(); (document.fonts as any).add(face);
  try {
    const c = canvas(1600, 1000); const x = c.getContext('2d')!;
    x.fillStyle = '#fffdf8'; x.fillRect(0, 0, 1600, 1000); x.fillStyle = '#1f2433';
    x.font = `96px "${family}"`; x.fillText('Aa Бб Gg 123', 70, 200);
    x.font = `56px "${family}"`; x.fillText('The quick brown fox jumps', 70, 360); x.fillText('Съешь ещё этих мягких булок', 70, 450);
    x.font = `34px "${family}"`; x.fillText('ABCDEFGHIJKLMNOPQRSTUVWXYZ abcdefghijklmnopqrstuvwxyz', 70, 600); x.fillText('0123456789 !?&@#%()[]{}«»—', 70, 660);
    x.font = '28px system-ui'; x.fillStyle = '#5a6074'; x.fillText(name, 70, 900);
    return {pages: [{blob: await toBlob(c), w: 1600, h: 1000, label: 'specimen'}], markdown: '', meta: {}, status: 'ready'};
  } finally { (document.fonts as any).delete(face); }
}

async function convertZip(file: Blob): Promise<Converted> {
  const {unzipSync} = await import('fflate');
  const entries: {name: string; size: number}[] = [];
  unzipSync(new Uint8Array(await file.arrayBuffer()), {filter: f => { if (!f.name.endsWith('/')) entries.push({name: f.name, size: f.originalSize}); return false; }});
  const list = entries.slice(0, 60).map(e => `<tr><td>${esc(e.name)}</td><td style="text-align:right">${fmtSize(e.size)}</td></tr>`).join('');
  return {pages: [await htmlPage(`<h2>${entries.length} files</h2><table>${list}</table>`, 'contents')], markdown: entries.map(e => `- ${e.name} (${fmtSize(e.size)})`).join('\n'), meta: {files: entries.length}, status: 'ready', entries};
}
export const fmtSize = (n: number) => n < 1024 ? n + ' B' : n < 1048576 ? (n / 1024).toFixed(1) + ' KB' : (n / 1048576).toFixed(1) + ' MB';

/** Everything the browser can't open: try an embedded preview, otherwise a cover card for the agent. */
async function convertForeign(file: Blob, det: Detected, name: string): Promise<Converted> {
  if (file.size < 120 * 1024 * 1024) {
    const prev = await embeddedJpeg(await file.arrayBuffer()).catch(() => null);
    if (prev) return {pages: [prev.page], markdown: '', meta: {previewWidth: prev.w, previewHeight: prev.h, source: 'embedded preview'}, status: 'needs-agent', note: 'embedded-preview'};
  }
  return {pages: [await coverPage(name, det.format, [det.family.toUpperCase(), fmtSize(file.size)])], markdown: '', meta: {}, status: 'needs-agent', note: 'needs-agent'};
}

export async function convert(file: Blob, det: Detected, name: string): Promise<Converted> {
  switch (det.family) {
    case 'image': return convertImage(file, det);
    case 'raw': return convertRaw(file, det);
    case 'vector': return convertSvg(file);
    case 'pdf': return convertPdf(file);
    case 'document':
      if (['docx', 'docm'].includes(det.ext)) return convertDocx(file);
      if (['odt', 'epub'].includes(det.ext)) return convertOpenDoc(file, det);
      if (det.format === 'RTF') return convertText(file, det);
      return convertForeign(file, det, name);
    case 'presentation': return det.local ? convertPptx(file, det) : convertForeign(file, det, name);
    case 'sheet': return det.local ? convertSheet(file, det) : convertForeign(file, det, name);
    case 'text': return convertText(file, det);
    case 'cad': return det.mime === 'text/plain' ? convertText(file, det) : convertForeign(file, det, name);
    case 'video': return convertVideo(file);
    case 'audio': return convertAudio(file, name);
    case 'font': return convertFont(file, name);
    case 'archive': return det.format === 'ZIP' ? convertZip(file) : convertForeign(file, det, name);
    default: return convertForeign(file, det, name);
  }
}
