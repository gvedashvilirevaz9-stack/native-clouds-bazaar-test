/** Side-by-side sketchbook page frames on the infinite board (Prep & Action). */
export const PAGE_FRAME = {width: 1600, height: 1500, gap: 120} as const;
export const PAGE_STRIDE = PAGE_FRAME.width + PAGE_FRAME.gap;

export function pageOrigin(page: number): {x: number; y: number} {
  const n = Math.max(1, Math.floor(Number(page) || 1));
  return {x: (n - 1) * PAGE_STRIDE, y: 0};
}

/** 1-based page index for a world X (clamped). */
export function pageAtX(x: number, maxPage = 999): number {
  const n = Math.floor(Number(x) / PAGE_STRIDE) + 1;
  return Math.max(1, Math.min(maxPage, n));
}

export function toLocal(x: number, y: number, page: number) {
  const o = pageOrigin(page);
  return {x: x - o.x, y: y - o.y};
}

export function toWorld(x: number, y: number, page: number) {
  const o = pageOrigin(page);
  return {x: x + o.x, y: y + o.y};
}

/** Pan so page centre sits in the viewport (approx). */
export function panToCenterPage(page: number, vpW: number, vpH: number, zoom = 1) {
  const o = pageOrigin(page);
  const cx = o.x + PAGE_FRAME.width / 2;
  const cy = o.y + PAGE_FRAME.height / 2;
  return {
    x: vpW / 2 - cx * zoom,
    y: vpH / 2 - cy * zoom,
  };
}

export function worldSize(maxPage: number) {
  const n = Math.max(1, maxPage);
  return {
    width: n * PAGE_STRIDE - PAGE_FRAME.gap + 200,
    height: PAGE_FRAME.height + 200,
  };
}
