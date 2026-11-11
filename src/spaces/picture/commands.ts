// Agent commands for the Estimate and Media cabinets (window.workshop.execute).
import {estimates, totals, TEMPLATES, type EstItem} from '../estimate/store';
import {estimateToBoard, estimateToNotebook, estimateRequest, estimateMarkdown, storeItemImage} from '../estimate/routes';
import {intake, blobFromSource} from '../intake/store';
import {nativeRooms} from '../personal/native-clouds-state';
import {picture, uid, type Obj} from './model';
import {openPicture, savePicture, copyRegion, cutRegion, pasteImage, rotateRight} from './render';
import {media, activePlayer} from './MediaPane';
import {levelByLine} from './PicturePane';
import {videos, openYoutube, openVideoAsset, addFrame, requestFrame, requestTranscript} from './video';
import {runOutput, mediaJobs, jobForAgent} from './run';
import {OUTPUTS, type OutputId} from './outputs';
import {gif, exportGif} from './gif';
import {toBoard, toNotebook} from '../intake/routes';

export const TOOL_COMMANDS = [
  'estimate.templates', 'estimate.list', 'estimate.create', 'estimate.read', 'estimate.patch', 'estimate.item', 'estimate.item.remove', 'estimate.request', 'estimate.route', 'estimate.open',
  'picture.open', 'picture.annotate', 'picture.crop', 'picture.rotate', 'picture.level', 'picture.copy', 'picture.cut', 'picture.paste', 'picture.save', 'picture.state',
  'video.open', 'video.state', 'video.seek', 'video.capture', 'video.frame', 'video.transcript', 'video.output',
  'gif.load', 'gif.set', 'gif.export', 'gif.state',
  'media.outputs', 'media.ask', 'media.run', 'media.jobs', 'media.job.read', 'media.job.reply',
];
const show = (s: 'estimate' | 'media') => { try { nativeRooms.open('garage'); nativeRooms.select(s); } catch { /* ignore */ } };
async function prepItems(items: any[] = []): Promise<Partial<EstItem>[]> {
  const out = [];
  for (const i of items.slice(0, 200)) out.push({...i, image: await storeItemImage(i.image || i.imageUrl || i.dataUrl || null)});
  return out;
}
const leanEstimate = (id: string) => { const e = estimates.get(id); if (!e) throw new Error('ESTIMATE_NOT_FOUND'); const t = totals(e); return {...e, totals: {sum: t.sum, count: t.count, toBuy: t.toBuy, bottleneck: t.bottleneck?.name || null, runsOutFirst: t.weakest ? {name: t.weakest.name, covers: t.weakest.covers} : null, short: t.short.map(i => i.name), recurring: t.recurring, perMonth: t.perMonth, perYear: t.perYear, oneOff: t.oneOff, hoursWeek: t.hoursWeek, unpaid: t.unpaid, unpaidCount: t.unpaidCount, nextDue: t.nextDue ? {name: t.nextDue.name, due: t.nextDue.due} : null}}; };

export async function executeTools(id: string, a: any = {}) {
  switch (id) {
    // ---------- estimate ----------
    case 'estimate.templates': return {templates: Object.entries(TEMPLATES).map(([k, t]) => ({id: k, ru: t.ru, en: t.en, target: t.target, prompt: t.prompt})),
      itemShape: {group: 'string?', name: 'string', image: 'https|data: URL?', url: 'shop link?', shop: 'string?', qty: 'number', unit: 'string', unitPrice: 'number', total: 'number? (pack price)', covers: '{value, unit}? what the line is enough for', basis: 'how qty was derived', status: 'ok|check|missing|have', note: 'string?'}};
    case 'estimate.list': return {estimates: estimates.list().map(e => ({id: e.id, title: e.title, template: e.template, sum: totals(e).sum, currency: e.currency, items: e.items.length, status: e.status}))};
    case 'estimate.create': { const e = estimates.create({...a, by: 'agent', items: await prepItems(a.items) as EstItem[]}); if (a.open !== false) { show('estimate'); estimates.select(e.id); } return leanEstimate(e.id); }
    case 'estimate.open': show('estimate'); estimates.select(a.estimateId); return {opened: a.estimateId};
    case 'estimate.read': return {...leanEstimate(a.estimateId), markdown: estimateMarkdown(estimates.get(a.estimateId)!), prompt: TEMPLATES[estimates.get(a.estimateId)!.template].prompt};
    case 'estimate.patch': { const p = {...a}; delete p.estimateId; if (p.items) p.items = await prepItems(p.items); if (!('status' in p)) p.status = 'ready'; estimates.patch(a.estimateId, p); return leanEstimate(a.estimateId); }
    case 'estimate.item': { const [it] = await prepItems([a.item || {}]); const by = a.by === 'human' ? 'human' : 'agent'; if (!(a.item || {}).image) delete (it as any).image; estimates.upsertItem(a.estimateId, it, by); if (by === 'agent') estimates.patch(a.estimateId, {status: 'ready'}); return leanEstimate(a.estimateId); }
    case 'estimate.item.remove': estimates.removeItem(a.estimateId, a.itemId); return leanEstimate(a.estimateId);
    case 'estimate.request': return estimateRequest(a.estimateId, a.text || '');
    case 'estimate.route': return a.to === 'board' ? estimateToBoard(a.estimateId, 'agent', a.open !== false) : a.to === 'notebook' ? estimateToNotebook(a.estimateId, a.open !== false) : (() => { throw new Error('UNKNOWN_DESTINATION'); })();

    // ---------- picture ----------
    case 'picture.open': {
      show('media'); media.setMode('picture');
      if (a.assetId) { const x = intake.get(a.assetId); if (!x?.pages.length) throw new Error('ASSET_HAS_NO_PAGES'); const p = x.pages.find(pg => pg.n === (a.page || 1)) || x.pages[0]; return openPicture(p.ref, x.name, x.id); }
      const src = String(a.dataUrl || a.url || ''); if (!src) throw new Error('INVALID_ARGS');
      return openPicture(src, a.name || 'image');
    }
    case 'picture.state': { const d = picture.get().doc; return d ? {name: d.name, w: d.w, h: d.h, crop: d.crop, objects: d.objects.map(o => ({id: o.id, type: o.type}))} : {open: false}; }
    case 'picture.annotate': {
      // {objects:[{type:'arrow',a:{x,y},b:{x,y},color,width} | {type:'rect'|'ellipse'|'highlight'|'pixelate', r:{x,y,w,h}} | {type:'text', at:{x,y}, text, size}]}
      const d = picture.get().doc; if (!d) throw new Error('NO_PICTURE');
      const scaleW = Math.max(1, Math.min(d.w, d.h) / 900);
      const objs: Obj[] = (a.objects || []).map((o: any) => ({color: '#e5383b', width: 6 * scaleW, size: Math.round(Math.min(d.w, d.h) / 22), cell: Math.round(Math.min(d.w, d.h) / 60), bg: true, ...o, id: uid()}));
      picture.change(x => ({...x, objects: [...x.objects, ...objs]}));
      return {added: objs.length};
    }
    case 'picture.crop': picture.change(x => ({...x, crop: a.rect || null})); return {crop: a.rect || null};
    case 'picture.rotate': await rotateRight(); return {rotated: 90};
    case 'picture.level': {
      // {angle} sets the tilt directly; {line:{a,b}} levels by a line that should be horizontal/vertical.
      if (a.line) return {angle: levelByLine(a.line.a, a.line.b)};
      const v = Math.max(-45, Math.min(45, Number(a.angle) || 0)); picture.change(x => ({...x, angle: v})); return {angle: v};
    }
    case 'picture.copy': return copyRegion(a.rect);
    case 'picture.cut': return cutRegion(a.rect, a.fill);
    case 'picture.paste': return pasteImage(a.dataUrl || null, a.at);
    case 'picture.save': return savePicture(a.to || null, 'agent', a.rect || null);

    // ---------- video ----------
    case 'video.open': {
      show('media'); media.setMode('video');
      const v = a.assetId ? openVideoAsset(a.assetId) : openYoutube(String(a.url || ''), a.title);
      return {videoId: v.id, kind: v.kind, title: v.title, url: v.url || null};
    }
    case 'video.state': { const v = videos.get(a.videoId || videos.current()); if (!v) return {open: false}; return {...v, currentTime: activePlayer.current?.videoId === v.id ? activePlayer.current.time() : null}; }
    case 'video.seek': { activePlayer.current?.seek(Number(a.t) || 0); if (a.pause !== false) activePlayer.current?.pause(); return {t: a.t}; }
    case 'video.capture': {
      // Seek (optional), take the frame the person sees; YouTube without capture → pending frame for the agent.
      const p = activePlayer.current; if (!p) throw new Error('NO_PLAYER');
      if (a.t != null) { p.seek(Number(a.t)); p.pause(); await new Promise(r => setTimeout(r, 350)); }
      const t = a.t != null ? Number(a.t) : p.time();
      const blob = await p.grab().catch(() => null);
      if (!blob) return {pending: requestFrame(p.videoId, t, a.note)};
      const f = await addFrame(p.videoId, t, blob, a.by || 'human', a.note);
      if (a.ask) media.openAsk({images: [{assetId: f.assetId!, t}], title: `Кадр ${Math.floor(t / 60)}:${String(Math.floor(t % 60)).padStart(2, '0')}: что сделать?`, context: {title: videos.get(p.videoId)?.title, videoId: p.videoId}});
      return f;
    }
    case 'video.frame': { const blob = await blobFromSource(String(a.dataUrl || a.url || '')); return addFrame(a.videoId, Number(a.t) || 0, blob, 'agent', a.note); }
    case 'video.transcript': {
      if (!a.segments) return requestTranscript(a.videoId);
      const seg = (a.segments as any[]).slice(0, 3000).map(s => ({t: Number(s.t) || 0, text: String(s.text || '').slice(0, 500)}));
      videos.patch(a.videoId, {transcript: seg, transcriptState: 'ready'}); return {videoId: a.videoId, segments: seg.length};
    }
    case 'video.output': {
      const v = videos.get(a.videoId || videos.current()); if (!v) throw new Error('VIDEO_NOT_FOUND');
      const fr = v.frames.filter(f => f.assetId && (a.frameIds ? a.frameIds.includes(f.id) : f.picked));
      return runOutput(a.output as OutputId, fr.map(f => ({assetId: f.assetId!, t: f.t, note: f.note})), {request: a.text, context: {title: v.title, url: v.url, videoId: v.id}, by: 'human'});
    }

    // ---------- gif ----------
    case 'gif.load': {
      show('media'); media.setMode('gif');
      let frames = (a.assetIds || []).map((x: string) => ({assetId: x}));
      if (a.videoId || a.fromVideo) { const v = videos.get(a.videoId || videos.current()); frames = (v?.frames || []).filter(f => f.assetId && (a.all || f.picked)).map(f => ({assetId: f.assetId!, label: String(Math.round(f.t)) + 's'})); }
      return gif.load(frames, !!a.append);
    }
    case 'gif.set': { const p = {...a}; return gif.set(p); }
    case 'gif.state': return gif.get();
    case 'gif.export': {
      const r = await exportGif(a.format || 'gif', 'agent');
      if (a.to === 'board') await toBoard(r.assetId, {by: 'agent'});
      if (a.to === 'notebook') toNotebook(r.assetId, {by: 'agent'});
      return r;
    }

    // ---------- shared outputs ----------
    case 'media.outputs': return {outputs: OUTPUTS};
    case 'media.ask': media.openAsk({images: (a.assetIds || []).map((x: string) => ({assetId: x})), title: a.title}); return {asked: true};
    case 'media.run': return runOutput(a.output, (a.assetIds || []).map((x: string) => ({assetId: x})), {request: a.text, context: a.context});
    case 'media.jobs': return {jobs: mediaJobs.list()};
    case 'media.job.read': return jobForAgent(a.jobId);
    case 'media.job.reply': return mediaJobs.patch(a.jobId, {state: a.state === 'working' ? 'working' : 'done', reply: String(a.text || '').slice(0, 2000)});
  }
  throw new Error('COMMAND_NOT_INCLUDED');
}
