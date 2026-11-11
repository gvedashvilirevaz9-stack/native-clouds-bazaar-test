// Demo player: reads demo/scenarios.json and plays it step by step in the real UI.
// Every action goes through the same window.workshop.execute commands an agent would use,
// so a scenario is also a working example of the agent protocol. Format: DEMO.md.
import {useSyncExternalStore} from 'react';
import {invoices} from '../billing/store';
import {day, today, shiftDate} from '../day/store';
import {fastSheet} from '../fast/FastSheet';
import {docs} from '../docs/registry';
import {intake, batches, ingestMany, select, selectBatch, clearIntake} from './store';
import {nativeRooms} from '../personal/native-clouds-state';
import {garage} from '../garage/store';
import {clearNotebookMedia} from '../garage/notebook-media';
import type {CategoryId} from './categories';
import {estimates} from '../estimate/store';
import {videos} from '../picture/video';
import {mediaJobs} from '../picture/run';
import {picture} from '../picture/model';

export type DemoStep = {
  say?: string;
  files?: string[]; category?: CategoryId;
  cmd?: string; args?: unknown;
  ui?: 'select' | 'batch' | 'tab' | 'page' | 'prompt' | 'scroll' | 'click' | 'service' | 'mode' | 'close-fast';
  /** Opens the Fast sheet with these demo files (as if dropped). */
  fast?: string[];
  asset?: string; value?: string | number; target?: string;
  wait?: number;
};
export type Scenario = {id: string; icon: string; title: string; subtitle: string; steps: DemoStep[]};

type State = {scenarios: Scenario[]; loaded: boolean; error?: string; running: string | null; step: number; total: number; caption: string; paused: boolean; speed: number; log: string[]};
let state: State = {scenarios: [], loaded: false, running: null, step: 0, total: 0, caption: '', paused: false, speed: 1, log: []};
const subs = new Set<() => void>();
const set = (p: Partial<State>) => { state = {...state, ...p}; subs.forEach(f => f()); };
export const demo = {get: () => state, subscribe(f: () => void) { subs.add(f); return () => { subs.delete(f); }; }};
export const useDemo = () => useSyncExternalStore(demo.subscribe, demo.get);

export const DEMO_BASE = 'demo/';
export async function loadScenarios() {
  if (state.loaded) return state.scenarios;
  try {
    const r = await fetch(DEMO_BASE + 'scenarios.json', {cache: 'no-store'});
    if (!r.ok) throw new Error('HTTP ' + r.status);
    const j = await r.json();
    set({scenarios: j.scenarios || [], loaded: true, error: undefined});
  } catch (e) { set({loaded: true, error: String((e as Error).message || e)}); }
  return state.scenarios;
}

let stopFlag = false, skipFlag = false;
export function stop() { stopFlag = true; set({paused: false}); }
export function pause(on: boolean) { set({paused: on}); }
export function skip() { skipFlag = true; }
export function speed(x: number) { set({speed: x}); }

/** Sleep that respects pause, stop, skip and speed. */
async function wait(ms: number) {
  let left = ms;
  while (left > 0) {
    if (stopFlag) throw new Error('DEMO_STOPPED');
    if (skipFlag) { skipFlag = false; return; }
    await new Promise(r => setTimeout(r, 100));
    if (!state.paused) left -= 100 * state.speed;
  }
}
const readTime = (text: string) => Math.max(2200, Math.min(7000, text.length * 55));

// ---- variables: $batch, $asset, $asset:<file name>, @file:<demo file> ----
type Vars = {batch: string | null; first: string | null; names: Map<string, string>; estimate?: string; video?: string; job?: string; last?: string; invoice?: string};
/** Fetch a demo file. Hosts that refuse some extensions (.dwg, .psd…) may store it as name + '.bin' or '.txt'. */
export async function demoBlob(name: string) {
  let r = await fetch(DEMO_BASE + name);
  if (!r.ok) r = await fetch(DEMO_BASE + name + '.bin');
  if (!r.ok) r = await fetch(DEMO_BASE + name + '.txt');
  if (!r.ok) throw new Error('DEMO_FILE_MISSING ' + name);
  return r.blob();
}
async function fileUrl(name: string) {
  const b = await demoBlob(name);
  return new Promise<string>(res => { const r = new FileReader(); r.onload = () => res(String(r.result)); r.readAsDataURL(b); });
}
function assetByName(v: Vars, name: string) {
  return v.names.get(name) || intake.list().find(a => a.name === name)?.id || null;
}
async function resolve(x: unknown, v: Vars): Promise<unknown> {
  if (typeof x === 'string') {
    if (x === '$batch') return v.batch;
    if (x === '$asset') return v.first;
    if (x === '$estimate') return v.estimate;
    if (x === '$video') return v.video;
    if (x === '$job') return v.job;
    if (x === '$last') return v.last;
    if (x === '$invoice') return v.invoice;
    { const m = x.match(/^\$today([+-]\d+)?$/); if (m) return shiftDate(today(), +(m[1] || 0)); }
    if (x === '$curvideo') return videos.current();
    if (x === '$lastjob') return mediaJobs.list()[0]?.id || null;
    if (x.startsWith('$asset:')) { const id = assetByName(v, x.slice(7)); if (!id) throw new Error('DEMO_ASSET_NOT_FOUND ' + x); return id; }
    if (x.startsWith('@file:')) return fileUrl(x.slice(6));
    return x;
  }
  if (Array.isArray(x)) return Promise.all(x.map(y => resolve(y, v)));
  if (x && typeof x === 'object') { const o: Record<string, unknown> = {}; for (const [k, y] of Object.entries(x)) o[k] = await resolve(y, v); return o; }
  return x;
}

const inbox = () => { try { nativeRooms.open('garage'); nativeRooms.select('inbox'); } catch { /* ignore */ } };
const ui = (detail: Record<string, unknown>) => window.dispatchEvent(new CustomEvent('intake:ui', {detail}));
async function untilConverted(ids: string[]) {
  for (let i = 0; i < 300; i++) { if (ids.every(id => intake.get(id)?.status !== 'converting')) return; await new Promise(r => setTimeout(r, 100)); }
}

async function runStep(s: DemoStep, v: Vars) {
  if (s.say) { set({caption: s.say}); await wait(s.wait ?? readTime(s.say)); if (!s.files && !s.cmd && !s.ui && !s.fast) return; }
  if (s.fast) {
    const files = await Promise.all(s.fast.map(async n => new File([await demoBlob(n)], n)));
    fastSheet.open(files); await wait(s.wait ?? 1800); return;
  }
  if (s.files) {
    inbox();
    const files = await Promise.all(s.files.map(async n => new File([await demoBlob(n)], n)));
    const r = await ingestMany(files, {category: s.category, source: 'demo'});
    r.assets.forEach(a => v.names.set(a.name, a.id));
    v.first = r.assets[0]?.id || null; v.batch = r.batchId;
    await untilConverted(r.assets.map(a => a.id));
    if (v.batch) { selectBatch(v.batch); select(null); } else if (v.first) { select(v.first); selectBatch(null); }
    await wait(s.wait ?? 1500);
    return;
  }
  if (s.cmd) {
    const args = await resolve(s.args || {}, v);
    const res = await (window as any).workshop.execute(s.cmd, args);
    if (s.cmd === 'intake.extract' && res?.assetIds) { await untilConverted(res.assetIds); for (const id of res.assetIds) { const a = intake.get(id); if (a) v.names.set(a.name, id); } }
    // Remember ids the next steps may refer to.
    if (res && typeof res === 'object') {
      if (typeof res.id === 'string' && res.id.startsWith('es-')) v.estimate = res.id;
      if (res.estimateId) v.estimate = res.estimateId;
      if (typeof res.id === 'string' && res.id.startsWith('inv-')) v.invoice = res.id;
      if (res.videoId) v.video = res.videoId;
      if (res.jobId) v.job = res.jobId;
      if (res.assetId) { v.last = res.assetId; if (res.name) v.names.set(res.name, res.assetId); }
    }
    set({log: [...state.log.slice(-30), `${s.cmd} ✓`]});
    await wait(s.wait ?? 1200);
    return;
  }
  if (s.ui) {
    if (s.ui === 'select') { const id = String(await resolve(s.asset || '$asset', v)); inbox(); selectBatch(null); select(id); }
    if (s.ui === 'batch' && v.batch) { inbox(); select(null); selectBatch(v.batch); }
    if (s.ui === 'tab') { inbox(); ui({tab: s.value}); }
    if (s.ui === 'page') { inbox(); ui({page: Number(s.value)}); }
    if (s.ui === 'prompt') { inbox(); ui({prompt: true}); }
    if (s.ui === 'service') { try { nativeRooms.open('garage'); nativeRooms.select(String(s.value)); } catch { /* ignore */ } }
    if (s.ui === 'close-fast') fastSheet.close();
    if (s.ui === 'mode') window.dispatchEvent(new CustomEvent('media:mode', {detail: s.value}));
    if (s.ui === 'click') { let el = document.querySelector(`[data-testid="${s.target}"]`) as HTMLElement | null; for (let k = 0; !el && k < 60; k++) { await new Promise(r => setTimeout(r, 200)); el = document.querySelector(`[data-testid="${s.target}"]`) as HTMLElement | null; } if (!el) throw new Error('DEMO_TARGET_MISSING ' + s.target); el.scrollIntoView({block: 'center'}); flashEl(el); await new Promise(r => setTimeout(r, 450 / state.speed)); el.click(); }
    await new Promise(r => setTimeout(r, 250));
    if (s.ui === 'click' || s.ui === 'service' || s.ui === 'mode') { /* no scroll */ }
    else if (s.ui === 'scroll') document.querySelector(`[data-testid="${s.target}"]`)?.scrollIntoView({behavior: 'smooth', block: 'start'});
    else if (s.ui === 'prompt') document.querySelector('[data-testid="ik-prompt"]')?.scrollIntoView({behavior: 'smooth', block: 'center'});
    else document.querySelector('.ik-main')?.scrollTo({top: 0, behavior: 'smooth'});
    await wait(s.wait ?? 1500);
  }
}

export async function play(ids: string[]) {
  if (state.running) return;
  const all = await loadScenarios();
  const list = ids.map(id => all.find(s => s.id === id)).filter(Boolean) as Scenario[];
  stopFlag = false; skipFlag = false;
  try {
    for (const sc of list) {
      const v: Vars = {batch: null, first: null, names: new Map()};
      set({running: sc.id, step: 0, total: sc.steps.length, caption: sc.title, paused: false});
      await wait(1200);
      for (let i = 0; i < sc.steps.length; i++) {
        set({step: i + 1});
        try { await runStep(sc.steps[i], v); }
        catch (e) { if ((e as Error).message === 'DEMO_STOPPED') throw e; set({caption: '⚠ ' + String((e as Error).message || e), log: [...state.log, '⚠ ' + (e as Error).message]}); await wait(2500); }
      }
      await wait(1500);
    }
  } catch { /* stopped */ }
  set({running: null, caption: '', step: 0, total: 0, paused: false});
}

/** Briefly ring the element the demo is about to press, so the viewer sees where the "click" happens. */
function flashEl(el: HTMLElement) {
  const r = el.getBoundingClientRect(); const d = document.createElement('div');
  d.style.cssText = `position:fixed;left:${r.left - 6}px;top:${r.top - 6}px;width:${r.width + 12}px;height:${r.height + 12}px;border:3px solid #f5b54a;border-radius:12px;z-index:200000;pointer-events:none;box-shadow:0 0 0 6px #f5b54a44;transition:opacity .4s`;
  document.body.appendChild(d); setTimeout(() => { d.style.opacity = '0'; }, 700); setTimeout(() => d.remove(), 1200);
}

/** Remove what demos (and the Inbox) created: assets, batches, notebook attachments, board items from Inbox/Calendar. */
export function clearDemo() {
  clearIntake();
  clearNotebookMedia();
  estimates.clear(); videos.clear(); mediaJobs.clear(); picture.close(); invoices.clear(); day.clear(); docs.clear();
  const b = garage.get();
  garage.set({items: b.items.filter(i => !/^(Inbox|Calendar|Estimate)/.test(String((i as any).source || '')))} as any);
  return {cleared: true};
}
