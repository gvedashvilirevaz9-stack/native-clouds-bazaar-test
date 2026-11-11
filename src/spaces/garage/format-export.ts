/** v14: client-side export of an A4 Format frame (and everything over it) to JPEG / PDF. */
import type {Item} from './store';

export type ExportResult = {format: 'jpeg' | 'pdf'; filename: string; bytes: number; width: number; height: number};

function download(blob: Blob, filename: string) {
  const u = URL.createObjectURL(blob);
  const a = document.createElement('a'); a.href = u; a.download = filename; document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(u), 4000);
}

/** Renders the world crop covered by the frame item at 1:1 world scale (x2 pixel ratio). */
export async function renderFrameCanvas(frame: Item): Promise<HTMLCanvasElement> {
  const world = document.querySelector('.gr-world') as HTMLElement | null;
  if (!world) throw new Error('BOARD_NOT_VISIBLE');
  const {toCanvas} = await import('html-to-image');
  const w = Math.round(frame.w || 1188), h = Math.round(frame.h || 840);
  return toCanvas(world, {
    width: w, height: h, pixelRatio: 2, backgroundColor: '#ffffff', cacheBust: false, skipFonts: true,
    imagePlaceholder: 'data:image/gif;base64,R0lGODlhAQABAAAAACH5BAEKAAEALAAAAAABAAEAAAICTAEAOw==',
    style: {transform: `translate(${-frame.x}px,${-frame.y}px)`, transformOrigin: '0 0'},
    filter: n => {
      const el = n as HTMLElement;
      if (!el.classList) return true;
      return !(el.classList.contains('gr-x') || el.classList.contains('gr-plus') || el.classList.contains('gr-resize')
        || el.classList.contains('gr-fmt-tools') || el.classList.contains('gr-page-frame') || el.classList.contains('gr-wm') || el.classList.contains('gr-empty'));
    },
  });
}

export async function exportFrame(frame: Item, format: 'jpeg' | 'pdf', doDownload = true): Promise<ExportResult> {
  const canvas = await renderFrameCanvas(frame);
  const stamp = new Date().toISOString().slice(0, 16).replace(/[:T]/g, '-');
  if (format === 'jpeg') {
    const blob: Blob = await new Promise((res, rej) => canvas.toBlob(b => b ? res(b) : rej(new Error('EXPORT_FAILED')), 'image/jpeg', 0.92));
    const filename = `garage-a4-${stamp}.jpg`;
    if (doDownload) download(blob, filename);
    return {format, filename, bytes: blob.size, width: canvas.width, height: canvas.height};
  }
  const {jsPDF} = await import('jspdf');
  const pdf = new jsPDF({orientation: 'landscape', unit: 'mm', format: 'a4'});
  pdf.addImage(canvas.toDataURL('image/jpeg', 0.92), 'JPEG', 0, 0, 297, 210);
  const blob = pdf.output('blob');
  const filename = `garage-a4-${stamp}.pdf`;
  if (doDownload) download(blob, filename);
  return {format, filename, bytes: blob.size, width: canvas.width, height: canvas.height};
}
