// Run an output scenario on a set of images (Inbox assets: frames, edited pictures, photos).
import {useSyncExternalStore} from 'react';
import {intake} from '../intake/store';
import {toBoard, toNotebook, boardSpot, focusBoard} from '../intake/routes';
import {writeToNotebook} from '../garage/notebook-media';
import {getBlob, garage} from '../garage/store';
import {communication} from '../communication/store';
import {nativeRooms} from '../personal/native-clouds-state';
import {garageView} from '../garage/view';
import {outputById, type OutputId} from './outputs';

export type MediaImage = {assetId: string; label?: string; t?: number | null; note?: string};
export type MediaJob = {id: string; output: OutputId; images: MediaImage[]; request?: string; context?: {title?: string; url?: string; videoId?: string}; state: 'pending' | 'working' | 'done'; reply?: string; at: number};

const KEY = 'sunrise.media.jobs.v1';
const subs = new Set<() => void>(); let rev = 0;
const load = (): MediaJob[] => { try { const v = JSON.parse(localStorage.getItem(KEY) || '[]'); return Array.isArray(v) ? v : []; } catch { return []; } };
const save = (l: MediaJob[]) => { try { localStorage.setItem(KEY, JSON.stringify(l.slice(0, 80))); } catch { /* ignore */ } rev++; subs.forEach(f => f()); };
export const mediaJobs = {
  list: load, get: (id: string) => load().find(j => j.id === id) || null,
  subscribe(f: () => void) { subs.add(f); return () => { subs.delete(f); }; }, revision: () => rev,
  patch(id: string, p: Partial<MediaJob>) { const l = load(); const i = l.findIndex(j => j.id === id); if (i < 0) throw new Error('JOB_NOT_FOUND'); l[i] = {...l[i], ...p}; save(l); return l[i]; },
  clear() { save([]); },
};
export const useMediaJobs = () => { useSyncExternalStore(mediaJobs.subscribe, mediaJobs.revision); return load(); };

export const fmtT = (s?: number | null) => s == null ? '' : `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, '0')}`;
const reveal = (s: string, tab?: 'board' | 'notebook') => { try { nativeRooms.open('garage'); nativeRooms.revealService(s); } catch { /* ignore */ } if (tab) garageView.set({tab}); };

async function storyboardPdf(images: MediaImage[], title: string) {
  const {jsPDF} = await import('jspdf');
  const pdf = new jsPDF({unit: 'pt', format: 'a4'}); const W = pdf.internal.pageSize.getWidth();
  let y = 50; pdf.setFontSize(16); pdf.text(title.replace(/[^\x20-\x7e]/g, '') || 'Storyboard', 40, 34);
  for (const [k, im] of images.entries()) {
    const a = intake.get(im.assetId); const ref = a?.pages[0]?.ref; if (!ref) continue;
    const b = await getBlob(ref); if (!b) continue;
    const url = await new Promise<string>(r => { const f = new FileReader(); f.onload = () => r(String(f.result)); f.readAsDataURL(b); });
    const w = (W - 100) / 2, h = w * (a!.pages[0].h / a!.pages[0].w);
    const x = 40 + (k % 2) * (w + 20);
    if (k % 2 === 0 && k > 0) y += h + 40;
    if (y + h > 800) { pdf.addPage(); y = 40; }
    // jsPDF's base font has no Cyrillic, so the label is drawn into the image in the board/notebook routes; here we keep the timestamp.
    pdf.addImage(url, 'WEBP', x, y, w, h); pdf.setFontSize(10); pdf.text(`${k + 1}. ${fmtT(im.t)}`, x, y + h + 12);
  }
  pdf.save((title || 'storyboard').replace(/[\\/:*?"<>|]/g, '_') + '.pdf');
}

/** Do it now (local outputs) or hand it to the agent with the scenario's prompt. */
export async function runOutput(output: OutputId, images: MediaImage[], opts: {request?: string; context?: MediaJob['context']; by?: 'human' | 'agent'} = {}) {
  const o = outputById(output); if (!o) throw new Error('UNKNOWN_OUTPUT');
  const list = images.filter(i => intake.get(i.assetId)); if (!list.length) throw new Error('NO_IMAGES');
  const title = opts.context?.title || '';
  if (output === 'board') {
    const at = await boardSpot(true, Math.min(4, list.length));
    const ids: string[] = [];
    for (const [k, im] of list.entries()) {
      const pos = at ? {x: at.x + (k % 4) * 280, y: at.y + Math.floor(k / 4) * 340} : undefined;
      const r = await toBoard(im.assetId, {pages: [1], at: pos, open: false, by: opts.by});
      ids.push(...r.itemIds);
      if (im.t != null || im.note) for (const id of r.itemIds) garage.patch(id, {caption: [fmtT(im.t), im.note].filter(Boolean).join(' · ')} as any);
    }
    if (at) focusBoard(at.x + Math.min(4, list.length) * 140, at.y + 150);
    return {output, placed: ids.length};
  }
  if (output === 'notebook') {
    const lines = list.map((im, k) => `${k + 1}. ${im.t != null ? fmtT(im.t) + ' — ' : ''}${im.note || intake.get(im.assetId)?.name || ''}`);
    writeToNotebook(lines.join('\n'), {mode: 'new-leaf', heading: title ? `🎞 ${title}` : undefined});
    for (const im of list) toNotebook(im.assetId, {pages: [1], open: false, by: opts.by});
    reveal('notebook', 'notebook');
    return {output, attached: list.length};
  }
  if (output === 'gif') {
    const {gif} = await import('./gif'); const {media} = await import('./MediaPane');
    gif.load(list.map(im => ({assetId: im.assetId, label: im.t != null ? fmtT(im.t) : im.note})));
    try { nativeRooms.open('garage'); nativeRooms.select('media'); } catch { /* ignore */ }
    media.setMode('gif');
    return {output, frames: list.length};
  }
  if (output === 'pdf') { await storyboardPdf(list, title); return {output, saved: true}; }
  // Agent scenarios: queue a job with the prompt and the images.
  const job: MediaJob = {id: 'mj-' + Math.random().toString(36).slice(2, 9), output, images: list, request: opts.request?.trim() || undefined, context: opts.context, state: 'pending', at: Date.now()};
  save([job, ...load()]);
  try { communication.add({text: `${o.icon} ${o.en}: ${list.length} image(s)${title ? ' · ' + title : ''}${job.request ? '\n' + job.request.slice(0, 400) : ''}\n[media.job.read {jobId:"${job.id}"}]`, role: 'user', contact: 'agent', source: 'Media', kind: 'info', key: 'media/' + job.id} as any); } catch { /* dock optional */ }
  return {output, jobId: job.id, state: 'pending'};
}

export function jobForAgent(id: string) {
  const j = mediaJobs.get(id); if (!j) throw new Error('JOB_NOT_FOUND');
  const o = outputById(j.output)!;
  return {...j, prompt: o.prompt, deliver: o.deliver,
    images: j.images.map(im => ({...im, timestamp: fmtT(im.t), name: intake.get(im.assetId)?.name || null, hint: `intake.page {assetId:"${im.assetId}", n:1}`}))};
}
