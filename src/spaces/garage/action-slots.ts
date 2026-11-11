/** Action skeleton (horizontal route): Lane A timeline + empty lanes B/C. Separate from Prep. */

export type ActionLaneId = 'A' | 'B' | 'C';

export type ActionMarkerSlot = {
  index: number; // 0-based along Lane A
  timeX: number;
  timeY: number;
  stickyX: number;
  stickyY: number;
  cardX: number;
  cardY: number;
  timeW: number;
  timeH: number;
  stickyW: number;
  stickyH: number;
  cardW: number;
  cardH: number;
};

export const ACTION_DEFAULT_TIMES = ['12:00', '13:00', '14:00', '15:00'] as const;

export const ACTION_WORLD = {width: 2800, height: 1600};

/** Horizontal pitch between Lane A steps. */
export const ACTION_STEP_GAP = 420;
export const ACTION_LANE_A_TOP = 40;
export const ACTION_LANE_B_TOP = 520;
export const ACTION_LANE_C_TOP = 900;
export const ACTION_LANE_HEIGHT = 340;
export const ACTION_LANE_LEFT = 40;
export const ACTION_LANE_WIDTH = 2600;

export function actionMarkerAt(index: number): ActionMarkerSlot {
  const x0 = 80 + index * ACTION_STEP_GAP;
  return {
    index,
    timeX: x0,
    timeY: ACTION_LANE_A_TOP + 36,
    timeW: 190,
    timeH: 110,
    cardX: x0,
    cardY: ACTION_LANE_A_TOP + 160,
    cardW: 230,
    cardH: 200,
    stickyX: x0,
    stickyY: ACTION_LANE_A_TOP + 380,
    stickyW: 200,
    stickyH: 120,
  };
}

export function actionMarkers(count = ACTION_DEFAULT_TIMES.length): ActionMarkerSlot[] {
  return Array.from({length: count}, (_, i) => actionMarkerAt(i));
}

export function actionLaneOrigin(lane: ActionLaneId, index = 0): {x: number; y: number} {
  const top = lane === 'A' ? ACTION_LANE_A_TOP : lane === 'B' ? ACTION_LANE_B_TOP : ACTION_LANE_C_TOP;
  return {x: 80 + index * ACTION_STEP_GAP, y: top + 48};
}

export function hitActionMarkerSticky(wx: number, wy: number, count = 4): number | null {
  for (let i = 0; i < count; i++) {
    const m = actionMarkerAt(i);
    if (wx >= m.stickyX && wx <= m.stickyX + m.stickyW + 40 && wy >= m.stickyY - 20 && wy <= m.stickyY + m.stickyH + 40) return i;
  }
  return null;
}

export function hitActionLane(wx: number, wy: number): ActionLaneId | null {
  if (wy >= ACTION_LANE_A_TOP && wy < ACTION_LANE_A_TOP + ACTION_LANE_HEIGHT) return 'A';
  if (wy >= ACTION_LANE_B_TOP && wy < ACTION_LANE_B_TOP + ACTION_LANE_HEIGHT) return 'B';
  if (wy >= ACTION_LANE_C_TOP && wy < ACTION_LANE_C_TOP + ACTION_LANE_HEIGHT) return 'C';
  return null;
}

/** Free OSM static map snapshot (no paid API). */
export function osmStaticMapUrl(lat: number, lon: number, zoom = 14, w = 360, h = 200): string {
  const clat = Math.max(-85, Math.min(85, lat));
  const clon = ((lon + 180) % 360 + 360) % 360 - 180;
  return `https://staticmap.openstreetmap.de/staticmap.php?center=${clat},${clon}&zoom=${zoom}&size=${w}x${h}&maptype=mapnik&markers=${clat},${clon},lightblue1`;
}

export function googleMapsLink(lat: number, lon: number, query?: string): string {
  if (query && query.trim()) return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(query.trim())}`;
  return `https://www.google.com/maps?q=${lat},${lon}`;
}
