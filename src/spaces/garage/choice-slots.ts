/** Choice skeleton (Prep vertical): fixed slots in lanes 1..5. */

export type ChoiceSlotId = 'intent' | 'optA' | 'optB' | 'tdA' | 'tdB' | 'compare' | 'timer' | 'verdict';

export type SlotRect = {id: ChoiceSlotId; lane: 1 | 2 | 3 | 4 | 5; x: number; y: number; w: number; h: number; label: string};

/** Two 560px-wide diagrams; text below retains the original font size. */
export const CHOICE_SLOTS: SlotRect[] = [
  {id: 'intent',  lane: 1, x: 420, y: 70,   w: 480, h: 170, label: 'INTENT'},
  {id: 'optA',    lane: 2, x: 100, y: 280,  w: 280, h: 280, label: 'OPTION A'},
  {id: 'optB',    lane: 2, x: 720, y: 280,  w: 280, h: 280, label: 'OPTION B'},
  {id: 'tdA',     lane: 3, x: 80,  y: 620,  w: 580, h: 920, label: 'TEARDOWN A'},
  {id: 'tdB',     lane: 3, x: 700, y: 620,  w: 580, h: 920, label: 'TEARDOWN B'},
  {id: 'compare', lane: 4, x: 160, y: 1600, w: 580, h: 320, label: 'COMPARE'},
  {id: 'timer',   lane: 4, x: 820, y: 1600, w: 220, h: 180, label: 'TIMER'},
  {id: 'verdict', lane: 5, x: 360, y: 2000, w: 580, h: 280, label: 'VERDICT'},
];

/** Lane band tops/heights for prep guides when skeleton=choice (taller than default 250). */
export const CHOICE_LANES: {n: number; top: number; height: number; key: string}[] = [
  {n: 1, top: 40,   height: 220, key: 'bandIntent'},
  {n: 2, top: 260,  height: 340, key: 'bandOptions'},
  {n: 3, top: 600,  height: 960, key: 'bandTeardown'},
  {n: 4, top: 1560, height: 400, key: 'bandCompare'},
  {n: 5, top: 1960, height: 340, key: 'bandVerdict'},
];

export const CHOICE_WORLD = {width: 1400, height: 2400};

export function slotById(id: string): SlotRect | undefined {
  return CHOICE_SLOTS.find(s => s.id === id);
}

export function slotOrigin(id: ChoiceSlotId): {x: number; y: number} {
  const s = slotById(id)!;
  // small inset so card sits inside dashed placeholder
  return {x: s.x + 12, y: s.y + 28};
}

export function hitSlot(wx: number, wy: number): ChoiceSlotId | null {
  for (const s of CHOICE_SLOTS) {
    if (wx >= s.x && wx <= s.x + s.w && wy >= s.y && wy <= s.y + s.h) return s.id;
  }
  return null;
}

export const SLOT_IDS: ChoiceSlotId[] = CHOICE_SLOTS.map(s => s.id);
