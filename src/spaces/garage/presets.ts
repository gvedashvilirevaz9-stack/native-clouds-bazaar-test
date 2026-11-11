// Preset structure (ids only). Visible titles/hints come from i18n.ts via portal locale.
import type {GarageKey} from './i18n';
import {CHIP_SHORT_KEY, CHIP_TITLE_KEY, PRESET_HINT_KEY, PRESET_TITLE_KEY, gt} from './i18n';

export type PresetId = 'daily' | 'study' | 'workspace';
export type ChipDef = {id: string; icon: string; prompt: string};
export type PresetDef = {id: PresetId; num: string; chips: ChipDef[]};

export const PRESETS: PresetDef[] = [
  {
    id: 'daily', num: '01',
    chips: [
      {id: 'person', icon: '⚖', prompt: 'Context: personal rights and safety. Answer calmly: risks, local norms, safe action template. Do not send the diary outside.'},
      {id: 'children', icon: '👶', prompt: 'Context: child protection. Check norms about risk to a child, guardianship, school, urgent protection.'},
      {id: 'women', icon: '👩', prompt: 'Context: women\'s rights and personal safety. Calmly: risks, where to apply, how to phrase a report.'},
      {id: 'animals', icon: '🐾', prompt: 'Context: animal protection. If an animal is in danger — calm monitoring report template.'},
      {id: 'trade', icon: '💼', prompt: 'Context: trade, contracts, infrastructure. Consumer rights, transaction evidence.'},
    ],
  },
  {
    id: 'study', num: '02',
    chips: [
      {id: 'math', icon: '🧮', prompt: 'Context: exact sciences / maths. Formulas, definitions, tasks, proofs.'},
      {id: 'medicine', icon: '🧬', prompt: 'Context: natural science / medicine. Definitions, cause-effect, notes.'},
      {id: 'humanities', icon: '📜', prompt: 'Context: humanities. Theses, authors, eras, arguments.'},
      {id: 'code', icon: '💻', prompt: 'Context: technology and code. Implementations, errors, patterns, APIs.'},
      {id: 'rules', icon: '📝', prompt: 'Context: languages and rules. Grammar, exceptions, examples, translations.'},
    ],
  },
  {
    id: 'workspace', num: '03',
    chips: [
      {id: 'history', icon: '📜', prompt: 'Context: history. Chronology, sources, events, links between eras.'},
      {id: 'geography', icon: '🌍', prompt: 'Context: geography and locations. Place, region, routes, coordinates.'},
      {id: 'science', icon: '🧬', prompt: 'Context: science and technology. Models, protocols, working materials.'},
      {id: 'psychology', icon: '🎭', prompt: 'Context: psychology and characters. Motivation, roles, emotions, image structure.'},
      {id: 'language', icon: '🗣', prompt: 'Context: linguistics. Phrasing, synonyms, translations, shades of meaning.'},
    ],
  },
];

export const presetById = (id: PresetId) => PRESETS.find(p => p.id === id) || PRESETS[0];
export const chipById = (preset: PresetId, chipId: string | null | undefined) =>
  presetById(preset).chips.find(c => c.id === chipId) || null;

export function presetTitle(lang: string, id: PresetId) {
  return gt(lang, PRESET_TITLE_KEY[id] as GarageKey);
}
export function presetHint(lang: string, id: PresetId) {
  return gt(lang, PRESET_HINT_KEY[id] as GarageKey);
}
export function chipTitle(lang: string, chipId: string) {
  const k = CHIP_TITLE_KEY[chipId]; return k ? gt(lang, k) : chipId;
}
export function chipShort(lang: string, chipId: string) {
  const k = CHIP_SHORT_KEY[chipId]; return k ? gt(lang, k) : chipId;
}

/** Agent context tags from selected preset + chip (localized labels + English prompt). */
export function contextTags(lang: string, preset: PresetId, chipId?: string | null) {
  const p = presetById(preset);
  const c = chipById(preset, chipId);
  return {
    preset: presetTitle(lang, p.id),
    presetId: p.id,
    subPreset: c ? chipTitle(lang, c.id) : null,
    subPresetId: c?.id || null,
    // Topic prompt only when a chip is selected; otherwise null (space only).
    prompt: c ? c.prompt : null,
  };
}
