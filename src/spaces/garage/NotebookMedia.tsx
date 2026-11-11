// Notebook attachment strip + drop handling + PDF export of a notebook page with its images.
import {useState, type DragEvent} from 'react';
import {notebookMedia, useLeafMedia, type LeafMedia} from './notebook-media';
import {useBlobUrl} from '../intake/useBlobUrl';
import {getBlob, DRAG_MIME} from './store';
import {ingestMany} from '../intake/store';
import {toNotebook} from '../intake/routes';
import {useGarageT} from './i18n';
import type {DayPage} from './pages';

function MediaThumb({m, onOpen}: {m: LeafMedia; onOpen: (u: string) => void}) {
  const u = useBlobUrl(m.ref);
  const [broken, setBroken] = useState(false);
  if (!u || broken) return <span className="nm-noimg">{m.kind === 'favorite' ? '★' : '▧'}</span>;
  return <img src={u} alt={m.title} onClick={() => onOpen(u)} onError={() => setBroken(true)} draggable={false}/>;
}

export function MediaStrip({pageId, leaf}: {pageId: string; leaf: number}) {
  const list = useLeafMedia(pageId, leaf);
  const {lang} = useGarageT(); const ru = lang === 'ru';
  const [light, setLight] = useState<string | null>(null);
  return <>
    <div className="nm-strip" data-testid="nb-media">{list.map(m => m.kind === 'stamp'
      ? <figure key={m.id} className="nm-item nm-stamp" title={m.title}><b>{(m.stamp || '').slice(8, 10)}</b><span>{stampLabel(m.stamp || '', ru)}{m.caption ? <><br/>{m.caption}</> : null}</span>
          <button type="button" className="nm-x" aria-label={ru ? 'Убрать' : 'Remove'} onClick={() => notebookMedia.remove(pageId, leaf, m.id)}>×</button></figure>
      : <figure key={m.id} className="nm-item" title={m.title}>
          <MediaThumb m={m} onOpen={setLight}/>
          <figcaption>{m.kind === 'favorite' ? '★ ' : ''}{m.title}{m.price ? ' · ' + m.price : ''}</figcaption>
          <button type="button" className="nm-x" aria-label={ru ? 'Убрать' : 'Remove'} onClick={() => notebookMedia.remove(pageId, leaf, m.id)}>×</button>
        </figure>)}</div>
    {!list.length && <p className="nm-drop-hint">{ru ? 'Перетащите сюда фото или файл, вставьте Ctrl+V: они прикрепятся к этой странице.' : 'Drop a photo or file here or paste with Ctrl+V: it attaches to this page.'}</p>}
    {light && <div className="nm-light" onClick={() => setLight(null)} role="dialog" aria-label="Image"><img src={light} alt=""/></div>}
  </>;
}
export function stampLabel(iso: string, ru: boolean) {
  const d = new Date(iso + 'T12:00:00');
  if (isNaN(+d)) return iso;
  return d.toLocaleDateString(ru ? 'ru-RU' : 'en-GB', {weekday: 'short', month: 'long', year: 'numeric'});
}

/** Files dropped on the notebook go through the Inbox (so any format works), then attach here. */
export function notebookDropProps() {
  return {
    onDragOver: (e: DragEvent) => { const t = [...e.dataTransfer.types]; if (t.includes('Files') || t.includes(DRAG_MIME)) { e.preventDefault(); e.dataTransfer.dropEffect = 'copy'; } },
    onDrop: async (e: DragEvent) => {
      const raw = e.dataTransfer.getData(DRAG_MIME);
      if (raw) { e.preventDefault(); try { const s = JSON.parse(raw); const {attachToNotebook} = await import('./notebook-media'); attachToNotebook({kind: 'favorite', ref: s.image || null, title: String(s.title || 'Favorite').slice(0, 200), url: s.url || null, price: s.price, by: 'human'}); } catch { /* ignore */ } return; }
      const files = Array.from(e.dataTransfer.files || []); if (!files.length) return;
      e.preventDefault(); e.stopPropagation();
      const r = await ingestMany(files);
      for (const a of r.assets) if (a.pages.length && a.status !== 'failed') toNotebook(a.id, {pages: [1], open: false});
    },
  };
}

/** Render text + attachments to A4 pages; html-to-image keeps every script (Cyrillic, Georgian…). */
export async function exportNotebookPdf(page: DayPage, text: string, leaf: number) {
  const [{toCanvas}, {jsPDF}] = await Promise.all([import('html-to-image'), import('jspdf')]);
  const media = notebookMedia.of(page.id, leaf);
  const imgs: string[] = [];
  for (const m of media) {
    if (m.kind === 'stamp') { imgs.push(`<div style="display:inline-block;border:1px solid #e8d9a8;background:#fffdf3;border-radius:8px;padding:8px 14px;margin:6px 8px 0 0;color:#7c5512;font:600 14px system-ui">📅 ${esc(m.stamp || '')}${m.caption ? ' · ' + esc(m.caption) : ''}</div>`); continue; }
    if (!m.ref || m.kind === 'favorite') { if (m.kind === 'favorite') imgs.push(`<div style="border:1px solid #e6e1d6;border-radius:8px;padding:8px 12px;margin:8px 0;font:14px system-ui">★ ${esc(m.title)}${m.price ? ' · ' + esc(m.price) : ''}${m.url ? `<div style="font-size:11px;color:#667">${esc(m.url)}</div>` : ''}</div>`); if (!m.ref) continue; }
    const b = m.ref.startsWith('idb:') ? await getBlob(m.ref) : null;
    const src = b ? await new Promise<string>(res => { const r = new FileReader(); r.onload = () => res(String(r.result)); r.readAsDataURL(b); }) : (m.ref.startsWith('http') ? m.ref : '');
    if (src) imgs.push(`<figure style="margin:14px 0"><img src="${src}" style="max-width:100%;max-height:900px;border-radius:4px"/><figcaption style="font:12px system-ui;color:#667">${esc(m.title)}</figcaption></figure>`);
  }
  const host = document.createElement('div'); host.style.cssText = 'position:fixed;left:-12000px;top:0';
  const sheet = document.createElement('div');
  sheet.style.cssText = 'width:794px;box-sizing:border-box;padding:56px 60px;background:#fff;color:#222;font:15px/1.6 Georgia,serif';
  sheet.innerHTML = `<div style="font:12px system-ui;color:#889">${esc(page.date)} · ${esc(page.title)} · p. ${leaf}</div><div style="white-space:pre-wrap;margin-top:14px">${esc(text)}</div>${imgs.join('')}`;
  host.appendChild(sheet); document.body.appendChild(host);
  try {
    const c = await toCanvas(sheet, {pixelRatio: 2, backgroundColor: '#ffffff'});
    const pdf = new jsPDF({unit: 'pt', format: 'a4'});
    const pw = pdf.internal.pageSize.getWidth(), ph = pdf.internal.pageSize.getHeight();
    const slice = Math.floor(c.width * ph / pw);
    for (let y = 0, i = 0; y < c.height; y += slice, i++) {
      const part = document.createElement('canvas'); part.width = c.width; part.height = Math.min(slice, c.height - y);
      const x = part.getContext('2d')!; x.fillStyle = '#fff'; x.fillRect(0, 0, part.width, part.height); x.drawImage(c, 0, -y);
      if (i) pdf.addPage();
      pdf.addImage(part.toDataURL('image/jpeg', 0.9), 'JPEG', 0, 0, pw, part.height * pw / part.width);
    }
    pdf.save(`notebook-${page.date}-p${leaf}.pdf`);
  } finally { host.remove(); }
}
const esc = (s: string) => s.replace(/[&<>"]/g, c => ({'&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;'}[c]!));
