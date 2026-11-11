// Fast mode: drop files → "what do you want?" → one result to download or share.
// Everything runs in the browser; nothing is stored unless the person opens the full Inbox.
import {detect, type Detected} from '../intake/detect';
import {convert, loadPdfjs} from '../intake/convert';

export type FastFile = {id: string; file: File; det: Detected};
export type ActionId = 'pdf' | 'jpg' | 'png' | 'webp' | 'compress' | 'text' | 'docx' | 'split' | 'rotate';
export type Result = {blob: Blob; name: string; note?: string; before: number; after: number; count?: number};
type Kind = 'image' | 'pdf' | 'doc' | 'other';

export const kindOf = (d: Detected): Kind =>
  d.family === 'pdf' ? 'pdf'
  : ['image', 'raw', 'vector', 'design'].includes(d.family) ? 'image'
  : ['document', 'presentation', 'sheet', 'text'].includes(d.family) ? 'doc' : 'other';

export const ACTIONS: Record<ActionId, {icon: string; ru: string; en: string; hintRu: string; hintEn: string}> = {
  pdf: {icon: '📄', ru: 'Один PDF', en: 'One PDF', hintRu: 'фото, сканы и документы в один файл', hintEn: 'photos, scans and documents in one file'},
  jpg: {icon: '🖼', ru: 'Картинки JPG', en: 'JPG images', hintRu: 'для почты и мессенджеров', hintEn: 'for e-mail and messengers'},
  png: {icon: '🔲', ru: 'PNG', en: 'PNG', hintRu: 'без потери качества', hintEn: 'lossless'},
  webp: {icon: '🌐', ru: 'WebP', en: 'WebP', hintRu: 'лёгкие картинки для сайта', hintEn: 'light images for the web'},
  compress: {icon: '🗜', ru: 'Сжать', en: 'Compress', hintRu: 'чтобы ушло по почте', hintEn: 'small enough to e-mail'},
  text: {icon: '📝', ru: 'Текст', en: 'Text', hintRu: 'вытащить текст (.txt)', hintEn: 'extract the text (.txt)'},
  docx: {icon: '📘', ru: 'Word', en: 'Word', hintRu: 'текст в .docx для правки', hintEn: 'text into .docx to edit'},
  split: {icon: '✂', ru: 'Разделить PDF', en: 'Split PDF', hintRu: 'каждая страница — отдельный файл', hintEn: 'one file per page'},
  rotate: {icon: '↻', ru: 'Повернуть', en: 'Rotate', hintRu: 'на 90° по часовой', hintEn: '90° clockwise'},
};

/** The menu shows only what makes sense for these files, most likely first. */
export function actionsFor(files: FastFile[]): ActionId[] {
  const k = new Set(files.map(f => kindOf(f.det)));
  const only = (x: Kind) => k.size === 1 && k.has(x);
  if (!files.length) return [];
  if (only('image')) return ['pdf', 'jpg', 'compress', 'png', 'webp', 'rotate'];
  if (only('pdf')) return files.length > 1 ? ['pdf', 'compress', 'jpg', 'text', 'docx', 'split'] : ['jpg', 'compress', 'docx', 'text', 'split', 'rotate'];
  if (only('doc')) return ['pdf', 'text', 'jpg', 'docx'];
  if (k.has('other') && k.size === 1) return [];
  return ['pdf', 'jpg', 'compress'];
}
export async function readFiles(list: File[]): Promise<FastFile[]> {
  return Promise.all(list.map(async f => ({id: Math.random().toString(36).slice(2, 9), file: f, det: await detect(f, f.name)})));
}

// ---------- helpers ----------
const base = (n: string) => n.replace(/\.[^.]+$/, '') || 'file';
const canvasOf = (w: number, h: number) => { const c = document.createElement('canvas'); c.width = Math.max(1, Math.round(w)); c.height = Math.max(1, Math.round(h)); return c; };
const encode = (c: HTMLCanvasElement, type: string, q = 0.9) => new Promise<Blob>((res, rej) => c.toBlob(b => b ? res(b) : rej(new Error('ENCODE_FAILED')), type, q));
const MIME: Record<string, string> = {jpg: 'image/jpeg', png: 'image/png', webp: 'image/webp'};

/** Full-resolution drawable for any image-like input (HEIC, TIFF, RAW preview, PSD preview, SVG). */
async function toCanvas(f: FastFile, maxEdge = 8000): Promise<HTMLCanvasElement[]> {
  let src: Blob = f.file;
  if (f.det.format === 'HEIC') { const h2a = (await import('heic2any')).default as any; const o = await h2a({blob: f.file, toType: 'image/jpeg', quality: 0.95}); src = Array.isArray(o) ? o[0] : o; }
  else if (f.det.family !== 'image' || ['TIFF', 'ICO'].includes(f.det.format)) {
    const conv = await convert(f.file, f.det, f.file.name);   // documents, RAW, PSD, TIFF → page images
    const out: HTMLCanvasElement[] = [];
    for (const p of conv.pages) { const b = await createImageBitmap(p.blob); const c = canvasOf(b.width, b.height); const g = c.getContext('2d')!; g.fillStyle = '#fff'; g.fillRect(0, 0, c.width, c.height); g.drawImage(b, 0, 0); b.close?.(); out.push(c); }
    return out;
  }
  const bmp = await createImageBitmap(src, {imageOrientation: 'from-image'} as ImageBitmapOptions);
  const k = Math.min(1, maxEdge / Math.max(bmp.width, bmp.height));
  const c = canvasOf(bmp.width * k, bmp.height * k); const g = c.getContext('2d')!;
  g.fillStyle = '#fff'; g.fillRect(0, 0, c.width, c.height); g.imageSmoothingQuality = 'high'; g.drawImage(bmp, 0, 0, c.width, c.height); bmp.close?.();
  return [c];
}
async function pdfPages(f: FastFile, scale = 2, maxEdge = 3000): Promise<HTMLCanvasElement[]> {
  const pdfjs = await loadPdfjs();
  const doc = await pdfjs.getDocument({data: new Uint8Array(await f.file.arrayBuffer()), isEvalSupported: false}).promise;
  const out: HTMLCanvasElement[] = [];
  try {
    for (let i = 1; i <= Math.min(doc.numPages, 300); i++) {
      const p = await doc.getPage(i); const b = p.getViewport({scale: 1});
      const vp = p.getViewport({scale: Math.min(scale, maxEdge / Math.max(b.width, b.height))});
      const c = canvasOf(vp.width, vp.height); const g = c.getContext('2d')!; g.fillStyle = '#fff'; g.fillRect(0, 0, c.width, c.height);
      await p.render({canvasContext: g, viewport: vp}).promise; p.cleanup(); out.push(c);
    }
  } finally { await doc.destroy(); }
  return out;
}
async function pdfText(f: FastFile) {
  const pdfjs = await loadPdfjs();
  const doc = await pdfjs.getDocument({data: new Uint8Array(await f.file.arrayBuffer()), isEvalSupported: false}).promise;
  const pages: string[] = [];
  try { for (let i = 1; i <= doc.numPages; i++) { const p = await doc.getPage(i); const tc = await p.getTextContent(); pages.push(tc.items.map((it: any) => (it.str || '') + (it.hasEOL ? '\n' : ' ')).join('').replace(/[ \t]+\n/g, '\n').trim()); p.cleanup(); } }
  finally { await doc.destroy(); }
  return pages;
}
async function textOf(f: FastFile): Promise<string[]> {
  if (f.det.family === 'pdf') return pdfText(f);
  const c = await convert(f.file, f.det, f.file.name);
  return [c.markdown.replace(/^#+\s*/gm, '').replace(/\*\*/g, '')];
}
async function zip(files: {name: string; blob: Blob}[], name: string): Promise<Blob> {
  const {zipSync} = await import('fflate');
  const used = new Set<string>(); const entries: Record<string, Uint8Array> = {};
  for (const f of files) { let n = f.name; let k = 2; while (used.has(n)) n = f.name.replace(/(\.[^.]+)?$/, ` (${k++})$1`); used.add(n); entries[n] = new Uint8Array(await f.blob.arrayBuffer()); }
  return new Blob([zipSync(entries, {level: 0})], {type: 'application/zip'});
}
const xmlEsc = (s: string) => s.replace(/[&<>]/g, c => ({'&': '&amp;', '<': '&lt;', '>': '&gt;'}[c]!)).replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f]/g, '');
/** Minimal valid .docx: one paragraph per line, page break between source pages. */
export async function makeDocx(pages: string[]): Promise<Blob> {
  const {zipSync, strToU8} = await import('fflate');
  const body = pages.map((pg, i) => pg.split('\n').map(l => `<w:p><w:r><w:t xml:space="preserve">${xmlEsc(l)}</w:t></w:r></w:p>`).join('') + (i < pages.length - 1 ? '<w:p><w:r><w:br w:type="page"/></w:r></w:p>' : '')).join('');
  const files = {
    '[Content_Types].xml': strToU8('<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/></Types>'),
    '_rels/.rels': strToU8('<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/></Relationships>'),
    'word/document.xml': strToU8(`<?xml version="1.0" encoding="UTF-8" standalone="yes"?><w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:body>${body}<w:sectPr><w:pgSz w:w="11906" w:h="16838"/><w:pgMar w:top="1134" w:right="1134" w:bottom="1134" w:left="1134"/></w:sectPr></w:body></w:document>`),
  };
  return new Blob([zipSync(files)], {type: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'});
}

// ---------- the actions ----------
export async function run(action: ActionId, files: FastFile[], onStep: (s: string) => void = () => {}): Promise<Result> {
  const before = files.reduce((s, f) => s + f.file.size, 0);
  const one = files.length === 1 ? base(files[0].file.name) : `${base(files[0].file.name)} +${files.length - 1}`;
  const done = (blob: Blob, name: string, note?: string, count?: number): Result => ({blob, name, note, before, after: blob.size, count});

  if (action === 'pdf' || action === 'rotate' && files.every(f => kindOf(f.det) === 'pdf')) {
    const {PDFDocument, degrees} = await import('pdf-lib');
    const out = await PDFDocument.create();
    for (const [n, f] of files.entries()) {
      onStep(`${n + 1} / ${files.length} · ${f.file.name}`);
      if (kindOf(f.det) === 'pdf') {
        const src = await PDFDocument.load(await f.file.arrayBuffer(), {ignoreEncryption: true});
        for (const p of await out.copyPages(src, src.getPageIndices())) { if (action === 'rotate') p.setRotation(degrees((p.getRotation().angle + 90) % 360)); out.addPage(p); }
        continue;
      }
      const canvases = await toCanvas(f, 3000);
      for (const c of canvases) {
        // JPEG keeps photos small; the original JPEG bytes are reused when nothing needs re-encoding.
        const reuse = f.det.format === 'JPEG' && canvases.length === 1 && f.file.size < 15e6;
        const img = reuse ? await out.embedJpg(await f.file.arrayBuffer()) : await out.embedJpg(await (await encode(c, 'image/jpeg', 0.9)).arrayBuffer());
        const land = img.width > img.height; const W = land ? 841.89 : 595.28, H = land ? 595.28 : 841.89, m = 18;
        const k = Math.min((W - m * 2) / img.width, (H - m * 2) / img.height);
        const page = out.addPage([W, H]); page.drawImage(img, {x: (W - img.width * k) / 2, y: (H - img.height * k) / 2, width: img.width * k, height: img.height * k});
      }
    }
    const blob = new Blob([await out.save()], {type: 'application/pdf'});
    return done(blob, `${action === 'rotate' ? one + ' (rotated)' : one}.pdf`, undefined, out.getPageCount());
  }

  if (action === 'jpg' || action === 'png' || action === 'webp' || action === 'rotate' || action === 'compress' && files.every(f => kindOf(f.det) !== 'pdf')) {
    const fmt = action === 'compress' ? 'jpg' : action === 'rotate' ? (files[0].det.format === 'PNG' ? 'png' : 'jpg') : action;
    const outs: {name: string; blob: Blob}[] = [];
    for (const [n, f] of files.entries()) {
      onStep(`${n + 1} / ${files.length} · ${f.file.name}`);
      const canvases = kindOf(f.det) === 'pdf' ? await pdfPages(f, action === 'compress' ? 1.4 : 2) : await toCanvas(f, action === 'compress' ? 2000 : 8000);
      for (const [i, c0] of canvases.entries()) {
        let c = c0;
        if (action === 'rotate') { c = canvasOf(c0.height, c0.width); const g = c.getContext('2d')!; g.translate(c.width, 0); g.rotate(Math.PI / 2); g.drawImage(c0, 0, 0); }
        const blob = await encode(c, MIME[fmt], action === 'compress' ? 0.72 : 0.9);
        outs.push({name: `${base(f.file.name)}${canvases.length > 1 ? '-' + String(i + 1).padStart(2, '0') : ''}.${fmt}`, blob});
      }
    }
    if (outs.length === 1) return done(outs[0].blob, outs[0].name, undefined, 1);
    return done(await zip(outs, one), `${one} (${fmt.toUpperCase()}).zip`, undefined, outs.length);
  }

  if (action === 'compress') {
    // PDFs: re-draw every page as a JPEG at ~130 dpi. Keep the original if that does not help.
    const {PDFDocument} = await import('pdf-lib');
    const outs: {name: string; blob: Blob}[] = []; let note: string | undefined;
    for (const [n, f] of files.entries()) {
      onStep(`${n + 1} / ${files.length} · ${f.file.name}`);
      if (kindOf(f.det) !== 'pdf') { const [c] = await toCanvas(f, 2000); outs.push({name: base(f.file.name) + '.jpg', blob: await encode(c, 'image/jpeg', 0.72)}); continue; }
      const pdfjs = await loadPdfjs();
      const doc = await pdfjs.getDocument({data: new Uint8Array(await f.file.arrayBuffer()), isEvalSupported: false}).promise;
      const out = await PDFDocument.create();
      try {
        for (let i = 1; i <= doc.numPages; i++) {
          onStep(`${f.file.name} · ${i} / ${doc.numPages}`);
          const p = await doc.getPage(i); const b = p.getViewport({scale: 1}); const vp = p.getViewport({scale: 1.8});
          const c = canvasOf(vp.width, vp.height); const g = c.getContext('2d')!; g.fillStyle = '#fff'; g.fillRect(0, 0, c.width, c.height);
          await p.render({canvasContext: g, viewport: vp}).promise; p.cleanup();
          const img = await out.embedJpg(await (await encode(c, 'image/jpeg', 0.6)).arrayBuffer());
          out.addPage([b.width, b.height]).drawImage(img, {x: 0, y: 0, width: b.width, height: b.height});
        }
      } finally { await doc.destroy(); }
      const small = new Blob([await out.save()], {type: 'application/pdf'});
      if (small.size < f.file.size * 0.95) outs.push({name: base(f.file.name) + ' (small).pdf', blob: small});
      else { outs.push({name: f.file.name, blob: f.file}); note = 'already-small'; }
    }
    if (outs.length === 1) return done(outs[0].blob, outs[0].name, note, 1);
    return done(await zip(outs, one), `${one} (small).zip`, note, outs.length);
  }

  if (action === 'text' || action === 'docx') {
    const pages: string[] = [];
    for (const [n, f] of files.entries()) { onStep(`${n + 1} / ${files.length} · ${f.file.name}`); pages.push(...(await textOf(f))); }
    const empty = !pages.join('').trim();
    if (action === 'text') return done(new Blob([pages.join('\n\n\f\n\n')], {type: 'text/plain;charset=utf-8'}), `${one}.txt`, empty ? 'no-text' : undefined);
    return done(await makeDocx(pages), `${one}.docx`, empty ? 'no-text' : 'text-only');
  }

  if (action === 'split') {
    const {PDFDocument} = await import('pdf-lib'); const outs: {name: string; blob: Blob}[] = [];
    for (const f of files.filter(x => kindOf(x.det) === 'pdf')) {
      const src = await PDFDocument.load(await f.file.arrayBuffer(), {ignoreEncryption: true});
      for (const i of src.getPageIndices()) { onStep(`${f.file.name} · ${i + 1}`); const d = await PDFDocument.create(); const [p] = await d.copyPages(src, [i]); d.addPage(p); outs.push({name: `${base(f.file.name)}-p${String(i + 1).padStart(2, '0')}.pdf`, blob: new Blob([await d.save()], {type: 'application/pdf'})}); }
    }
    return done(await zip(outs, one), `${one} (pages).zip`, undefined, outs.length);
  }
  throw new Error('UNKNOWN_ACTION');
}
export const fmtSize = (n: number) => n < 1024 ? n + ' B' : n < 1048576 ? (n / 1024).toFixed(0) + ' KB' : (n / 1048576).toFixed(1) + ' MB';
