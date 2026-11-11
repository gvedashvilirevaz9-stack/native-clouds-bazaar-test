// Video part of the Media cabinet: YouTube links and video files, frames at timestamps, transcript.
// Frames become Inbox assets (so the agent and every route can use them).
// Getting pixels: a video file is drawn straight into a canvas. A YouTube player is a cross-origin
// iframe the page cannot read, so a frame comes either from tab capture (the person allows it once)
// or from the agent, which grabs the frame at that timestamp on its side (video.frame).
import {useSyncExternalStore} from 'react';
import {ingest, intake} from '../intake/store';
import {getBlob} from '../garage/store';
import {communication} from '../communication/store';
import {fmtT} from './run';

export type Frame = {id: string; t: number; assetId: string | null; status: 'ready' | 'pending'; note?: string; picked?: boolean; by?: 'human' | 'agent'};
export type Video = {id: string; kind: 'youtube' | 'file'; url?: string; ytId?: string; assetId?: string; title: string; frames: Frame[]; transcript: {t: number; text: string}[]; at: number; transcriptState?: 'requested' | 'ready'};

const KEY = 'sunrise.media.videos.v1';
const subs = new Set<() => void>(); let rev = 0; let cache: Video[] | null = null; let current: string | null = null;
const load = (): Video[] => { if (cache) return cache; try { const v = JSON.parse(localStorage.getItem(KEY) || '[]'); cache = Array.isArray(v) ? v : []; } catch { cache = []; } return cache!; };
const save = (l: Video[]) => { cache = l.slice(0, 50); try { localStorage.setItem(KEY, JSON.stringify(cache)); } catch { /* ignore */ } rev++; subs.forEach(f => f()); };
const uid = (p: string) => p + Math.random().toString(36).slice(2, 9);
export const videos = {
  list: load, get: (id?: string | null) => load().find(v => v.id === id) || null,
  current: () => current, select(id: string | null) { current = id; rev++; subs.forEach(f => f()); },
  subscribe(f: () => void) { subs.add(f); return () => { subs.delete(f); }; }, revision: () => rev,
  patch(id: string, p: Partial<Video>) { const l = load().slice(); const i = l.findIndex(v => v.id === id); if (i < 0) throw new Error('VIDEO_NOT_FOUND'); l[i] = {...l[i], ...p}; save(l); return l[i]; },
  remove(id: string) { save(load().filter(v => v.id !== id)); if (current === id) current = null; },
  clear() { save([]); current = null; },
};
export const useVideos = () => { useSyncExternalStore(videos.subscribe, videos.revision); return load(); };

export function youtubeId(url: string) {
  const m = /(?:youtube\.com\/(?:watch\?(?:.*&)?v=|shorts\/|embed\/|live\/)|youtu\.be\/)([\w-]{11})/.exec(url) || /^([\w-]{11})$/.exec(url.trim());
  return m ? m[1] : null;
}
export function openYoutube(url: string, title?: string) {
  const id = youtubeId(url); if (!id) throw new Error('NOT_A_YOUTUBE_LINK');
  const existing = load().find(v => v.ytId === id);
  if (existing) { videos.select(existing.id); return existing; }
  const v: Video = {id: uid('vd-'), kind: 'youtube', url: `https://www.youtube.com/watch?v=${id}`, ytId: id, title: title || 'YouTube · ' + id, frames: [], transcript: [], at: Date.now()};
  save([v, ...load()]); videos.select(v.id); return v;
}
export function openVideoAsset(assetId: string) {
  const a = intake.get(assetId); if (!a || a.family !== 'video') throw new Error('NOT_A_VIDEO_ASSET');
  const existing = load().find(v => v.assetId === assetId);
  if (existing) { videos.select(existing.id); return existing; }
  const v: Video = {id: uid('vd-'), kind: 'file', assetId, title: a.name, frames: [], transcript: [], at: Date.now()};
  save([v, ...load()]); videos.select(v.id); return v;
}
export async function videoFileUrl(v: Video) {
  const a = v.assetId ? intake.get(v.assetId) : null; if (!a?.origRef) return null;
  const b = await getBlob(a.origRef); return b ? URL.createObjectURL(b) : null;
}

/** Store pixels as a frame asset. */
export async function addFrame(videoId: string, t: number, blob: Blob, by: 'human' | 'agent' = 'human', note?: string) {
  const v = videos.get(videoId); if (!v) throw new Error('VIDEO_NOT_FOUND');
  const name = `${v.title.replace(/\.[a-z0-9]+$/i, '').slice(0, 60)} · ${fmtT(t).replace(':', '-')}.webp`;
  const asset = await ingest(blob, {name, by, source: 'video', select: false});
  const fresh = videos.get(videoId)!;
  const pending = fresh.frames.find(f => f.status === 'pending' && Math.abs(f.t - t) < 0.6);
  const frame: Frame = pending ? {...pending, assetId: asset.id, status: 'ready', by, note: note ?? pending.note} : {id: uid('fr-'), t, assetId: asset.id, status: 'ready', note, picked: true, by};
  videos.patch(videoId, {frames: (pending ? fresh.frames.map(f => f.id === pending.id ? frame : f) : [...fresh.frames, frame]).sort((a, b) => a.t - b.t)});
  return frame;
}
/** YouTube without tab capture: mark the moment; the agent grabs the frame at that timestamp. */
export function requestFrame(videoId: string, t: number, note?: string) {
  const v = videos.get(videoId); if (!v) throw new Error('VIDEO_NOT_FOUND');
  if (v.frames.some(f => Math.abs(f.t - t) < 0.6)) return v.frames.find(f => Math.abs(f.t - t) < 0.6)!;
  const frame: Frame = {id: uid('fr-'), t, assetId: null, status: 'pending', note, picked: true};
  videos.patch(videoId, {frames: [...v.frames, frame].sort((a, b) => a.t - b.t)});
  try { communication.add({text: `🎞 ${v.title} — frame at ${fmtT(t)}\n${v.url || ''}\n[video.frame {videoId:"${v.id}", t:${Math.round(t * 10) / 10}, dataUrl}]`, role: 'user', contact: 'agent', source: 'Media', kind: 'info', key: 'frame/' + v.id + '/' + Math.round(t * 10)} as any); } catch { /* ignore */ }
  return frame;
}
export function requestTranscript(videoId: string) {
  const v = videos.get(videoId); if (!v) throw new Error('VIDEO_NOT_FOUND');
  videos.patch(videoId, {transcriptState: 'requested'});
  try { communication.add({text: `🎞 ${v.title} — transcript please\n${v.url || ''}\n[video.transcript {videoId:"${v.id}", segments:[{t,text}]}]`, role: 'user', contact: 'agent', source: 'Media', kind: 'info', key: 'transcript/' + v.id + '/' + Date.now()} as any); } catch { /* ignore */ }
  return {videoId, state: 'requested'};
}

// ---------- capture ----------
export function grabVideoElement(el: HTMLVideoElement): Promise<Blob> {
  const c = document.createElement('canvas'); c.width = el.videoWidth; c.height = el.videoHeight;
  c.getContext('2d')!.drawImage(el, 0, 0);
  return new Promise((res, rej) => c.toBlob(b => b ? res(b) : rej(new Error('ENCODE_FAILED')), 'image/webp', 0.92));
}

/** Tab capture: the person allows sharing this tab once; frames are cut out of the player's rectangle. */
let capture: {stream: MediaStream; video: HTMLVideoElement} | null = null;
const capSubs = new Set<() => void>();
export const tabCapture = {
  active: () => !!capture,
  subscribe(f: () => void) { capSubs.add(f); return () => { capSubs.delete(f); }; },
  async start() {
    if (capture) return true;
    const md = navigator.mediaDevices as any;
    if (!md?.getDisplayMedia) throw new Error('CAPTURE_NOT_SUPPORTED');
    const stream: MediaStream = await md.getDisplayMedia({video: {displaySurface: 'browser', frameRate: 5}, audio: false, preferCurrentTab: true, selfBrowserSurface: 'include'});
    const video = document.createElement('video'); video.muted = true; video.srcObject = stream; await video.play();
    capture = {stream, video};
    stream.getVideoTracks()[0].addEventListener('ended', () => { capture = null; capSubs.forEach(f => f()); });
    capSubs.forEach(f => f()); return true;
  },
  stop() { capture?.stream.getTracks().forEach(t => t.stop()); capture = null; capSubs.forEach(f => f()); },
  /** Crop the captured tab to an element's on-screen rectangle. */
  async grab(el: Element): Promise<Blob> {
    if (!capture) throw new Error('CAPTURE_NOT_STARTED');
    const v = capture.video; const r = el.getBoundingClientRect();
    const kx = v.videoWidth / window.innerWidth, ky = v.videoHeight / window.innerHeight;
    const c = document.createElement('canvas'); c.width = Math.round(r.width * kx); c.height = Math.round(r.height * ky);
    c.getContext('2d')!.drawImage(v, r.left * kx, r.top * ky, r.width * kx, r.height * ky, 0, 0, c.width, c.height);
    return new Promise((res, rej) => c.toBlob(b => b ? res(b) : rej(new Error('ENCODE_FAILED')), 'image/webp', 0.92));
  },
};
export const useTabCapture = () => useSyncExternalStore(tabCapture.subscribe, tabCapture.active);

// ---------- YouTube IFrame API ----------
let ytReady: Promise<any> | null = null;
export function loadYouTubeApi(): Promise<any> {
  if ((window as any).YT?.Player) return Promise.resolve((window as any).YT);
  if (!ytReady) ytReady = new Promise((res, rej) => {
    const prev = (window as any).onYouTubeIframeAPIReady;
    (window as any).onYouTubeIframeAPIReady = () => { prev?.(); res((window as any).YT); };
    const s = document.createElement('script'); s.src = 'https://www.youtube.com/iframe_api'; s.async = true;
    s.onerror = () => { ytReady = null; rej(new Error('YOUTUBE_API_BLOCKED')); };
    document.head.appendChild(s);
    setTimeout(() => rej(new Error('YOUTUBE_API_TIMEOUT')), 12000);
  });
  return ytReady;
}
