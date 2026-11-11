// A numbered document as ONE picture: opens full-screen in any messenger, no PDF viewer needed.
// Pages of the issued PDF are stacked into a single tall JPEG (same number, same content).
import {loadPdfjs} from '../intake/convert';

export type DocFormat = 'jpg' | 'pdf';
const PREF = 'sunrise.docs.format.v1';
/** Phones get pictures by default; invoices stay PDF (accountants, legal copy). */
export const formatPref = {
  get(kind: string): DocFormat { try { const v = JSON.parse(localStorage.getItem(PREF) || '{}')[kind]; if (v === 'jpg' || v === 'pdf') return v; } catch { /* */ } return kind === 'invoice' ? 'pdf' : 'jpg'; },
  set(kind: string, f: DocFormat) { try { const v = JSON.parse(localStorage.getItem(PREF) || '{}'); v[kind] = f; localStorage.setItem(PREF, JSON.stringify(v)); } catch { /* */ } },
};

/** width: target pixel width (1080 ≈ a phone screen at full sharpness). */
export async function pdfToJpeg(pdf: Blob, width = 1080, quality = 0.88): Promise<Blob> {
  const pdfjs = await loadPdfjs();
  const doc = await pdfjs.getDocument({data: new Uint8Array(await pdf.arrayBuffer()), isEvalSupported: false}).promise;
  const pages: HTMLCanvasElement[] = [];
  try {
    for (let i = 1; i <= Math.min(doc.numPages, 12); i++) {
      const p = await doc.getPage(i); const b = p.getViewport({scale: 1}); const vp = p.getViewport({scale: width / b.width});
      const c = document.createElement('canvas'); c.width = Math.round(vp.width); c.height = Math.round(vp.height);
      const g = c.getContext('2d')!; g.fillStyle = '#fff'; g.fillRect(0, 0, c.width, c.height);
      await p.render({canvasContext: g, viewport: vp}).promise; p.cleanup(); pages.push(c);
    }
  } finally { await doc.destroy(); }
  // Trim the empty bottom of each page (phone pages are fixed-size) so the picture is one continuous sheet.
  const used = pages.map(trimHeight);
  const gap = 0; const H = Math.min(16000, used.reduce((s, h) => s + h, 0) + gap * (pages.length - 1));
  const out = document.createElement('canvas'); out.width = pages[0].width; out.height = H;
  const g = out.getContext('2d')!; g.fillStyle = '#fff'; g.fillRect(0, 0, out.width, out.height);
  let y = 0; pages.forEach((c, i) => { if (y >= H) return; g.drawImage(c, 0, 0, c.width, used[i], 0, y, c.width, used[i]); y += used[i] + gap; });
  return new Promise((res, rej) => out.toBlob(b => b ? res(b) : rej(new Error('ENCODE_FAILED')), 'image/jpeg', quality));
}
/** Last non-white row + a small margin, keeping the page footer (number) when there is one. */
function trimHeight(c: HTMLCanvasElement) {
  const g = c.getContext('2d')!; const {width: w, height: h} = c;
  const data = g.getImageData(0, 0, w, h).data; const step = Math.max(1, Math.floor(w / 300));
  // Skip the footer band (bottom 6%) when looking for content, then add it back below the content.
  const footer = Math.round(h * 0.06);
  for (let y = h - footer - 1; y > 0; y--) {
    for (let x = 0; x < w; x += step) { const k = (y * w + x) * 4; if (data[k] < 235 || data[k + 1] < 235 || data[k + 2] < 235) {
      const end = Math.min(h - footer, y + Math.round(w * 0.04));
      // Copy the footer right under the content so the number stays visible.
      if (end < h - footer) { const f = g.getImageData(0, h - footer, w, footer); g.putImageData(f, 0, end); return end + footer; }
      return h;
    } }
  }
  return h;
}
