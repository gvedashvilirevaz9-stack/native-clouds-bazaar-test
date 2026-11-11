// Estimate (Смета): one shape for any "how much / how many / for how long" question.
// The agent on the phone does the reasoning and writes items; the portal shows them,
// keeps totals and coverage consistent, and lets the person adjust quantities.
import {useSyncExternalStore} from 'react';

export const ESTIMATE_KEY = 'sunrise.estimate.v1';

export type TemplateId = 'renovation' | 'groceries' | 'event' | 'parts' | 'services' | 'utilities' | 'kids' | 'subscriptions' | 'custom';
export type Period = 'once' | 'week' | 'month' | 'quarter' | 'year';
export type Covers = {value: number; unit: string};
export type EstItem = {
  id: string;
  group?: string;
  name: string;
  image?: string | null;      // idb:… / https / data: (data: is moved to idb on write)
  url?: string | null;
  shop?: string | null;
  qty: number;
  unit: string;
  unitPrice: number;
  /** Explicit line total when the shop sells in packs; otherwise qty × unitPrice. */
  total?: number | null;
  /** What this line is enough for: 25 м², 6 порций, 3 дня, 1 мотор. */
  covers?: Covers | null;
  /** How the quantity was derived, e.g. "1,2 кг/м² × 25 м² + 10%". */
  basis?: string;
  note?: string;
  status?: 'ok' | 'check' | 'missing' | 'have';
  /** Household lines: how often it is paid, time it takes (hours per the same period), who it is for. */
  period?: Period | null;
  hours?: number | null;
  who?: string;
  schedule?: string;   // "Mon, Wed 17:00–18:30"
  place?: string;      // address or place name (becomes a map link)
  due?: string;        // YYYY-MM-DD: next payment date
  duties?: string;     // what the family has to do: drive, uniform, volunteer shift
  edited?: boolean;           // changed by the person since the agent's last write
  by?: 'human' | 'agent';
};
export type Estimate = {
  id: string;
  title: string;
  template: TemplateId;
  currency: string;
  /** What the estimate is for: {label:"Кухня", value:25, unit:"м²"} or {label:"Гостей", value:12, unit:"чел."}. */
  target?: {label: string; value: number; unit: string} | null;
  items: EstItem[];
  assumptions: string[];
  notes?: string;
  status: 'draft' | 'with-agent' | 'ready';
  request?: string;
  by: 'human' | 'agent';
  at: number;
  updatedAt: number;
  sources?: string[];         // Inbox asset ids it was built from
};

type Tpl = {icon: string; ru: string; en: string; hintRu: string; hintEn: string; target: {label: string; unit: string}; prompt: string; currency?: string;
  /** Household templates show period / time / who / place / due on each line and monthly totals. */
  household?: boolean; bills?: boolean};
export const TEMPLATES: Record<TemplateId, Tpl> = {
  renovation: {icon: '🧱', ru: 'Ремонт и материалы', en: 'Renovation & materials', hintRu: 'Площади, расход, упаковки, запас', hintEn: 'Areas, consumption, packs, waste',
    target: {label: 'Площадь', unit: 'м²'},
    prompt: 'Build a materials estimate. For each material give consumption per unit area (basis), quantity rounded up to whole packs, unit price from a real shop with link and photo, what it covers (m²), and add 10% waste unless told otherwise. List assumptions. Ask for missing dimensions instead of guessing. When the person is a contractor, add labour lines in a "Работа / Labor" group so the estimate can become a quote (invoice.from_estimate kind:"quote").'},
  services: {icon: '🛠', ru: 'Услуги и часы', en: 'Services & hours', hintRu: 'Работа по часам + материалы → предложение и счёт', hintEn: 'Hourly work + materials → quote and invoice',
    target: {label: 'Часов', unit: 'ч'}, currency: 'USD',
    prompt: 'Build a client-ready job estimate for a contractor or freelancer. Group "Labor": tasks with hours (qty in "h") × hourly rate; group "Materials": items with quantities and prices; optional "Trip / disposal" fees. covers = hours of work for labour lines. State scope, exclusions and payment terms in assumptions. Keep names short and client-friendly; the estimate becomes a quote and then an invoice (invoice.from_estimate).'},
  utilities: {icon: '💡', ru: 'Коммуналка и счета дома', en: 'Utilities & home bills', hintRu: 'Свет, газ, вода, интернет: сколько, когда платить, где переплата', hintEn: 'Power, gas, water, internet: amounts, due dates, overspend',
    target: {label: 'Месяц', unit: ''}, currency: 'USD', household: true, bills: true,
    prompt: 'From bill photos/PDFs in the Inbox (or the person\'s list) build the monthly home bills for a US/Canada household: electricity (kWh), natural gas (therms or m³), water & sewer, trash/recycling, internet, mobile, HOA, home/renter insurance, property-tax instalment. One line per bill: name = provider + service, qty 1, unitPrice = amount, period (month/quarter/year), due = next due date (YYYY-MM-DD), basis = usage and rate ("820 kWh × $0.17"), note = autopay or account last 4. status "missing" = still to pay, "ok" = paid, "check" = amount ≥20% above the previous bill. Add assumptions with concrete savings (budget billing, time-of-use plan, assistance programs if they may qualify). Then add the unpaid ones to the day plan (day.add with tag "pay").'},
  kids: {icon: '🧒', ru: 'Кружки и секции детей', en: 'Kids\' activities', hintRu: 'Деньги + время + обязанности родителей по каждому ребёнку', hintEn: 'Money + time + parent duties per child',
    target: {label: 'Детей', unit: ''}, currency: 'USD', household: true,
    prompt: 'List each child\'s activities. One line per cost: name = activity + cost type (fee, equipment, uniform, competition, camp), who = child\'s name, period (week/month/year/once), qty × unitPrice, hours = time per that period INCLUDING driving there and back, schedule = days and times, place = address, duties = what parents must do (drive, wash uniform, volunteer shift, fundraising, buy gear). Group by child. In assumptions summarise per child: money per month, hours per week, and the busiest day. Flag schedule clashes between children and suggest carpools. Then put the next week into the day plan (day.add with tags kid/place/pay).'},
  subscriptions: {icon: '🔁', ru: 'Подписки семьи', en: 'Family subscriptions', hintRu: 'Что продлевается, кто пользуется, что отменить', hintEn: 'What renews, who uses it, what to cancel',
    target: {label: 'Человек', unit: ''}, currency: 'USD', household: true, bills: true,
    prompt: 'From statements, receipts or the person\'s list, list every subscription: name, who uses it, price, period (month/year), due = next renewal date. status "check" for duplicates (two music services), unused ones, or ones covered by a family plan; note the cheaper alternative. Assumptions: monthly total, yearly total, and what to cancel first with the saving.'},
  groceries: {icon: '🥕', ru: 'Продукты и запасы', en: 'Groceries & stock', hintRu: 'Что есть, на сколько дней хватит, что докупить', hintEn: 'What is there, how many days, what to buy',
    target: {label: 'Людей', unit: 'чел.'},
    prompt: 'From the fridge/pantry photo or list, list items with quantities. For each, estimate how many days it covers for the target number of people (covers in "дн."), mark status "have" for what is already there and "missing" for what should be bought, and price only what is missing.'},
  event: {icon: '🎉', ru: 'Событие', en: 'Event', hintRu: 'Гости, порции, бюджет', hintEn: 'Guests, portions, budget',
    target: {label: 'Гостей', unit: 'чел.'},
    prompt: 'Plan quantities for the event: food in portions, drinks in litres, decoration and services. Each line covers a number of guests (covers in "чел."). Give prices with shop links where possible and keep the total within the stated budget.'},
  parts: {icon: '⚙', ru: 'Детали и комплектующие', en: 'Parts & components', hintRu: 'Спецификация, артикулы, количество на изделие', hintEn: 'BOM, part numbers, per-unit quantity',
    target: {label: 'Изделий', unit: 'шт'},
    prompt: 'Build a bill of materials: part name with standard (DIN/ISO/GOST) and size, quantity per product multiplied by the target count, unit price and supplier link. covers = number of products the line is enough for.'},
  custom: {icon: 'Σ', ru: 'Своя смета', en: 'Custom', hintRu: 'Любой список с количеством и ценой', hintEn: 'Any list with quantities and prices',
    target: {label: 'Цель', unit: ''},
    prompt: 'Make a clear list with quantities, units, prices and what each line covers. State assumptions.'},
};
export const PERIODS: Record<Period, {ru: string; en: string; perMonth: number; perWeek: number}> = {
  once: {ru: 'разово', en: 'once', perMonth: 0, perWeek: 0},
  week: {ru: 'в неделю', en: 'weekly', perMonth: 52 / 12, perWeek: 1},
  month: {ru: 'в месяц', en: 'monthly', perMonth: 1, perWeek: 12 / 52},
  quarter: {ru: 'в квартал', en: 'quarterly', perMonth: 1 / 3, perWeek: 4 / 52},
  year: {ru: 'в год', en: 'yearly', perMonth: 1 / 12, perWeek: 1 / 52},
};

// ---------- persistence ----------
const subs = new Set<() => void>(); let rev = 0; let cache: Estimate[] | null = null;
function load(): Estimate[] {
  if (cache) return cache;
  try { const v = JSON.parse(localStorage.getItem(ESTIMATE_KEY) || '[]'); cache = Array.isArray(v) ? v : []; } catch { cache = []; }
  return cache!;
}
function save(list: Estimate[]) { cache = list.slice(0, 100); rev++; try { localStorage.setItem(ESTIMATE_KEY, JSON.stringify(cache)); } catch { /* memory only */ } subs.forEach(f => f()); }
const uid = (p: string) => p + Math.random().toString(36).slice(2, 9);
let selected: string | null = null;

export const estimates = {
  list: () => load(),
  get: (id?: string | null) => load().find(e => e.id === id) || null,
  subscribe(f: () => void) { subs.add(f); return () => { subs.delete(f); }; },
  revision: () => rev,
  selected: () => selected,
  select(id: string | null) { selected = id; rev++; subs.forEach(f => f()); },
  create(p: Partial<Estimate> & {title?: string}): Estimate {
    const t = (p.template && TEMPLATES[p.template]) ? p.template : 'custom';
    const now = Date.now();
    const e: Estimate = {id: uid('es-'), title: (p.title || TEMPLATES[t].ru).slice(0, 160), template: t, currency: (p.currency || TEMPLATES[t].currency || 'GEL').toUpperCase().slice(0, 6),
      target: p.target || null, items: (p.items || []).map(normItem), assumptions: (p.assumptions || []).map(String).slice(0, 30), notes: p.notes,
      status: p.items?.length ? 'ready' : 'draft', by: p.by || 'human', at: now, updatedAt: now, sources: p.sources};
    save([e, ...load()]); selected = e.id; return e;
  },
  patch(id: string, p: Partial<Estimate>) {
    const list = load(); const i = list.findIndex(e => e.id === id); if (i < 0) throw new Error('ESTIMATE_NOT_FOUND');
    const next = {...list[i], ...p, updatedAt: Date.now()}; if (p.items) next.items = p.items.map(normItem);
    const copy = list.slice(); copy[i] = next; save(copy); return next;
  },
  remove(id: string) { save(load().filter(e => e.id !== id)); if (selected === id) selected = null; return {removed: id}; },
  upsertItem(id: string, item: Partial<EstItem> & {name?: string}, by: 'human' | 'agent' = 'agent') {
    const e = estimates.get(id); if (!e) throw new Error('ESTIMATE_NOT_FOUND');
    const items = e.items.slice();
    const i = item.id ? items.findIndex(x => x.id === item.id) : items.findIndex(x => x.name === item.name && x.group === item.group);
    if (i >= 0) {
      const old = items[i]; const next = {...old, ...item};
      // A hand-changed quantity scales what the line covers (3 bags instead of 2 → 1.5× the area).
      if (by === 'human' && item.qty != null && old.covers && old.qty > 0 && item.covers === undefined) next.covers = {...old.covers, value: Math.round(old.covers.value * (Number(item.qty) / old.qty) * 100) / 100};
      items[i] = normItem({...next, by, edited: by === 'human'});
    }
    else items.push(normItem({...item, by} as EstItem));
    return estimates.patch(id, {items});
  },
  removeItem(id: string, itemId: string) { const e = estimates.get(id); if (!e) throw new Error('ESTIMATE_NOT_FOUND'); return estimates.patch(id, {items: e.items.filter(x => x.id !== itemId)}); },
  clear() { save([]); selected = null; },
};
export function useEstimates() { useSyncExternalStore(estimates.subscribe, estimates.revision); return load(); }

const num = (v: unknown, d = 0) => { const n = typeof v === 'number' ? v : parseFloat(String(v ?? '').replace(/\s/g, '').replace(',', '.')); return Number.isFinite(n) ? n : d; };
function normItem(x: Partial<EstItem>): EstItem {
  const covers = x.covers && Number.isFinite(num(x.covers.value, NaN)) ? {value: num(x.covers.value), unit: String(x.covers.unit || '').slice(0, 20)} : null;
  return {
    id: x.id || uid('it-'), group: x.group ? String(x.group).slice(0, 60) : undefined, name: String(x.name || 'Позиция').slice(0, 160),
    image: x.image || null, url: x.url && /^https?:\/\//.test(x.url) ? x.url : null, shop: x.shop || null,
    qty: num(x.qty, 1), unit: String(x.unit || 'шт').slice(0, 20), unitPrice: num(x.unitPrice, 0),
    total: x.total == null || x.total === ('' as any) ? null : num(x.total), covers, basis: x.basis ? String(x.basis).slice(0, 200) : undefined,
    note: x.note ? String(x.note).slice(0, 400) : undefined, status: x.status || 'ok', edited: !!x.edited, by: x.by,
    period: x.period && PERIODS[x.period] ? x.period : null, hours: x.hours == null || (x.hours as any) === '' ? null : num(x.hours),
    who: x.who ? String(x.who).slice(0, 60) : undefined, schedule: x.schedule ? String(x.schedule).slice(0, 120) : undefined,
    place: x.place ? String(x.place).slice(0, 200) : undefined, due: x.due && /^\d{4}-\d{2}-\d{2}$/.test(x.due) ? x.due : undefined,
    duties: x.duties ? String(x.duties).slice(0, 300) : undefined,
  };
}

// ---------- maths the portal owns ----------
export const lineTotal = (i: EstItem) => i.status === 'have' ? 0 : (i.total != null ? i.total : Math.round(i.qty * i.unitPrice * 100) / 100);
export function totals(e: Estimate) {
  const sum = e.items.reduce((s, i) => s + lineTotal(i), 0);
  const groups = new Map<string, number>();
  for (const i of e.items) groups.set(i.group || '—', (groups.get(i.group || '—') || 0) + lineTotal(i));
  const toBuy = e.items.filter(i => i.status !== 'have').length;
  // Coverage: compare each line's "covers" with the target, in the target's unit.
  const tu = e.target?.unit?.trim();
  const covered = tu ? e.items.filter(i => i.covers && i.covers.unit.trim() === tu) : [];
  const bottleneck = covered.length ? covered.reduce((a, b) => (b.covers!.value < a.covers!.value ? b : a)) : null;
  // Same unit across lines but not the target unit (e.g. "дн." for groceries): report the weakest line.
  const anyCover = e.items.filter(i => i.covers);
  const units = new Set(anyCover.map(i => i.covers!.unit));
  const weakest = !bottleneck && units.size === 1 && anyCover.length ? anyCover.reduce((a, b) => (b.covers!.value < a.covers!.value ? b : a)) : null;
  // Household view: recurring money per month / year, one-off money, and family time per week.
  const recurring = e.items.some(i => i.period && i.period !== 'once');
  const perMonth = e.items.reduce((s2, i) => s2 + (i.period ? lineTotal(i) * PERIODS[i.period].perMonth : 0), 0);
  const oneOff = e.items.reduce((s2, i) => s2 + (!i.period || i.period === 'once' ? lineTotal(i) : 0), 0);
  const hoursWeek = e.items.reduce((s2, i) => s2 + (i.hours && i.period ? i.hours * PERIODS[i.period].perWeek : 0), 0);
  const unpaid = e.items.filter(i => i.status === 'missing');
  const nextDue = e.items.filter(i => i.due && i.status !== 'ok' && i.status !== 'have').sort((a, b) => a.due!.localeCompare(b.due!))[0] || null;
  const r2 = (v: number) => Math.round(v * 100) / 100;
  return {sum: Math.round(sum * 100) / 100, groups: [...groups.entries()], count: e.items.length, toBuy, bottleneck, weakest,
    short: tu && e.target ? covered.filter(i => i.covers!.value < e.target!.value) : [],
    recurring, perMonth: r2(perMonth), perYear: r2(perMonth * 12), oneOff: r2(oneOff), hoursWeek: Math.round(hoursWeek * 10) / 10,
    unpaid: r2(unpaid.reduce((s2, i) => s2 + lineTotal(i), 0)), unpaidCount: unpaid.length, nextDue};
}
export const money = (v: number, c: string) => `${v.toLocaleString('ru-RU', {minimumFractionDigits: 2, maximumFractionDigits: 2})} ${c}`;
