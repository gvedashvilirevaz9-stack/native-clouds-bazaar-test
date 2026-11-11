// Pure timer/time helpers for board Time + Stopwatch blocks.
export type TimerMode = 'down' | 'up' | 'free';
export type TimerStatus = 'idle' | 'running' | 'paused' | 'done';
export type TimerState = {
  mode: TimerMode;
  durationSec: number; // 0 for free
  status: TimerStatus;
  startedAt: number | null;
  elapsedMs: number;
};

export function pad2(n: number) { return String(Math.max(0, Math.floor(n))).padStart(2, '0'); }

export function normalizeClock(hhmm: string): string {
  const m = String(hhmm || '').trim().match(/^(\d{1,2}):(\d{1,2})$/);
  if (!m) return '00:00';
  let h = Math.min(24, Math.max(0, parseInt(m[1], 10)));
  let min = Math.min(59, Math.max(0, parseInt(m[2], 10)));
  if (h === 24) { h = 0; }
  return pad2(h) + ':' + pad2(min);
}

export function formatMs(ms: number): string {
  const s = Math.max(0, Math.floor(ms / 1000));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = s % 60;
  if (h > 0) return pad2(h) + ':' + pad2(m) + ':' + pad2(sec);
  return pad2(m) + ':' + pad2(sec);
}

/** Elapsed ms for a running/paused/done timer at wall `now`. */
export function timerElapsedMs(t: TimerState, now = Date.now()): number {
  let e = Math.max(0, t.elapsedMs || 0);
  if (t.status === 'running' && t.startedAt) e += Math.max(0, now - t.startedAt);
  return e;
}

/** Display value + whether the run should flip to done. */
export function timerView(t: TimerState, now = Date.now()): {display: string; remainingMs: number; elapsedMs: number; shouldComplete: boolean} {
  const elapsed = timerElapsedMs(t, now);
  const dur = Math.max(0, (t.durationSec || 0) * 1000);
  if (t.mode === 'free') {
    return {display: formatMs(elapsed), remainingMs: 0, elapsedMs: elapsed, shouldComplete: false};
  }
  if (t.mode === 'down') {
    const rem = Math.max(0, dur - elapsed);
    return {display: formatMs(rem), remainingMs: rem, elapsedMs: elapsed, shouldComplete: t.status === 'running' && rem <= 0};
  }
  // up
  const capped = dur > 0 ? Math.min(elapsed, dur) : elapsed;
  return {display: formatMs(capped), remainingMs: Math.max(0, dur - capped), elapsedMs: capped, shouldComplete: t.status === 'running' && dur > 0 && elapsed >= dur};
}

export function timerControl(t: TimerState, action: 'start' | 'pause' | 'stop' | 'reset', now = Date.now()): TimerState {
  if (action === 'start') {
    if (t.status === 'running') return t;
    if (t.status === 'done') {
      return {...t, status: 'running', startedAt: now, elapsedMs: 0};
    }
    return {...t, status: 'running', startedAt: now};
  }
  if (action === 'pause') {
    if (t.status !== 'running') return t;
    return {...t, status: 'paused', elapsedMs: timerElapsedMs(t, now), startedAt: null};
  }
  if (action === 'stop' || action === 'reset') {
    return {...t, status: 'idle', startedAt: null, elapsedMs: 0};
  }
  return t;
}

export function timerMarkDone(t: TimerState, now = Date.now()): TimerState {
  const v = timerView(t, now);
  const elapsed = t.mode === 'down' ? (t.durationSec || 0) * 1000 : v.elapsedMs;
  return {...t, status: 'done', startedAt: null, elapsedMs: elapsed};
}

const PRESETS: {labelKey: string; sec: number}[] = [
  {labelKey: 'timer15m', sec: 15 * 60},
  {labelKey: 'timer30m', sec: 30 * 60},
  {labelKey: 'timer45m', sec: 45 * 60},
  {labelKey: 'timer1h', sec: 60 * 60},
  {labelKey: 'timer2h', sec: 2 * 60 * 60},
  {labelKey: 'timer3h', sec: 3 * 60 * 60},
];
export const TIMER_PRESETS = PRESETS;

let audioCtx: AudioContext | null = null;
/** Generated WebAudio bell (no external assets). Safe no-op if AudioContext unavailable. */
export function playBell() {
  try {
    const AC = (window as any).AudioContext || (window as any).webkitAudioContext;
    if (!AC) return;
    if (!audioCtx) audioCtx = new AC();
    const ctx = audioCtx!;
    if (ctx.state === 'suspended') ctx.resume().catch(() => {});
    const now = ctx.currentTime;
    for (let i = 0; i < 3; i++) {
      const osc = ctx.createOscillator();
      const g = ctx.createGain();
      osc.type = 'sine';
      osc.frequency.value = 880 - i * 40;
      g.gain.setValueAtTime(0.0001, now + i * 0.22);
      g.gain.exponentialRampToValueAtTime(0.35, now + i * 0.22 + 0.02);
      g.gain.exponentialRampToValueAtTime(0.0001, now + i * 0.22 + 0.35);
      osc.connect(g); g.connect(ctx.destination);
      osc.start(now + i * 0.22);
      osc.stop(now + i * 0.22 + 0.4);
    }
  } catch { /* ignore */ }
}
