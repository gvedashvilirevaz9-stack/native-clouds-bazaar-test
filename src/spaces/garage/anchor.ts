/** v15: board placement anchor (double-click on empty board) + viewport-centre fallback. */
import {useSyncExternalStore} from 'react';

export type Pt = {x: number; y: number};
let anchor: Pt | null = null;
let centerProvider: (() => Pt | null) | null = null;
const subs = new Set<() => void>();
const emit = () => subs.forEach(f => f());

export const boardAnchor = {
  get: () => anchor,
  set(p: Pt | null) { anchor = p ? {x: Math.round(p.x), y: Math.round(p.y)} : null; emit(); return anchor; },
  clear() { anchor = null; emit(); },
  subscribe(cb: () => void) { subs.add(cb); return () => { subs.delete(cb); }; },
  /** Board registers a function returning the world point at the viewport centre. */
  setCenterProvider(fn: (() => Pt | null) | null) { centerProvider = fn; },
  /** Default spawn point (item top-left): anchor, else viewport centre (item centred), else null. */
  spawn(): Pt | null {
    if (anchor) return {...anchor};
    const c = centerProvider?.();
    return c ? {x: Math.round(c.x - 100), y: Math.round(c.y - 60)} : null;
  },
};

export function useBoardAnchor() { return useSyncExternalStore(boardAnchor.subscribe, boardAnchor.get, boardAnchor.get); }
