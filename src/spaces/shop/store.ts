// The owner's shop lives only in this browser (IndexedDB): nothing is deployed until the owner decides.
import {useSyncExternalStore} from 'react';
import {TEMPLATES, normPrice, uid, cell as newCell, section as newSection, type ShopConfig, type Cell, type Section} from './model';

const DB = 'sunrise-shop', OS = 'kv';
function db(): Promise<IDBDatabase> {
  return new Promise((res, rej) => { const r = indexedDB.open(DB, 1); r.onupgradeneeded = () => r.result.createObjectStore(OS); r.onsuccess = () => res(r.result); r.onerror = () => rej(r.error); });
}
async function idb<T>(mode: IDBTransactionMode, fn: (s: IDBObjectStore) => IDBRequest): Promise<T> {
  const d = await db(); return new Promise((res, rej) => { const t = d.transaction(OS, mode); const q = fn(t.objectStore(OS)); q.onsuccess = () => res(q.result as T); q.onerror = () => rej(q.error); });
}
export const kv = {get: <T>(k: string) => idb<T | undefined>('readonly', s => s.get(k)), set: (k: string, v: unknown) => idb('readwrite', s => s.put(v, k))};

// ---------- the shop being built ----------
export type Receiver = {address: string; label: string; at: number; block: number | null; event: 'injected' | 'ejected'};
export type Fulfil = Record<string, {done: boolean; note?: string; at: number}>;   // key: tx hash
/** The owner's back office: who I am and where money goes. Saved once, used by every site. */
export type Wallet = {id: string; label: string; address: string; isDefault: boolean; at: number; removed?: boolean};
export type Profile = {firstName: string; lastName: string; business: string; place: string; telegram: string; whatsapp: string; email: string; phone: string; delivery: string; logo: import('./model').Img};
const EMPTY_PROFILE: Profile = {firstName: '', lastName: '', business: '', place: '', telegram: '', whatsapp: '', email: '', phone: '', delivery: '', logo: null};
type State = {shop: ShopConfig | null; started: boolean; step: number; receivers: Receiver[]; fulfil: Fulfil; loaded: boolean; archive: ShopConfig[]; profile: Profile; wallets: Wallet[]; unlocked: boolean};
let st: State = {shop: null, started: false, step: 0, receivers: [], fulfil: {}, loaded: false, archive: [], profile: {...EMPTY_PROFILE}, wallets: [], unlocked: false};
const subs = new Set<() => void>(); let rev = 0; let saveT: any;
const emit = () => { rev++; subs.forEach(f => f()); };
function persist() { clearTimeout(saveT); saveT = setTimeout(() => { void kv.set('state', {shop: st.shop, started: st.started, step: st.step, receivers: st.receivers, fulfil: st.fulfil, archive: st.archive, profile: st.profile, wallets: st.wallets}); }, 250); }

export const shop = {
  get: () => st, subscribe(f: () => void) { subs.add(f); return () => { subs.delete(f); }; }, revision: () => rev,
  async load() { if (st.loaded) return; try { const v = await kv.get<any>('state'); if (v) st = {...st, ...v, profile: {...EMPTY_PROFILE, ...(v.profile || {})}, wallets: v.wallets || [], unlocked: false}; } catch { /* first run */ } st = {...st, loaded: true}; emit(); },
  // ---------- admin (back office) ----------
  /** Password field is a placeholder for now: any click enters. The real check comes later. */
  unlock() { st = {...st, unlocked: true}; emit(); }, lock() { st = {...st, unlocked: false}; emit(); },
  setProfile(p: Partial<Profile>) { st = {...st, profile: {...st.profile, ...p}}; persist(); emit(); return st.profile; },
  wallets: () => st.wallets.filter(w => !w.removed),
  defaultWallet: () => st.wallets.find(w => w.isDefault && !w.removed) || st.wallets.find(w => !w.removed) || null,
  addWallet(label: string, address: string, block: number | null = null) {
    const a = address.toLowerCase(); const ex = st.wallets.find(w => w.address.toLowerCase() === a && !w.removed); if (ex) return ex;
    const w: Wallet = {id: uid('w'), label: label || 'Кошелёк', address, isDefault: !shop.wallets().length, at: Date.now()};
    st = {...st, wallets: [...st.wallets, w]}; shop.logReceiver(address, w.label, 'injected', block); return w;
  },
  patchWallet(id: string, p: Partial<Wallet>) { st = {...st, wallets: st.wallets.map(w => w.id === id ? {...w, ...p} : (p.isDefault ? {...w, isDefault: false} : w))}; persist(); emit(); },
  removeWallet(id: string, block: number | null = null) { const w = st.wallets.find(x => x.id === id); if (!w) return; st = {...st, wallets: st.wallets.map(x => x.id === id ? {...x, removed: true, isDefault: false} : x)}; const d = shop.wallets(); if (d.length && !d.some(x => x.isDefault)) st.wallets = st.wallets.map(x => x.id === d[0].id ? {...x, isDefault: true} : x); shop.logReceiver(w.address, w.label, 'ejected', block); },
  walletLabel: (address?: string | null) => address ? st.wallets.find(w => w.address.toLowerCase() === address.toLowerCase())?.label || null : null,
  /** Owner data flows into a site: contacts, place, logo and the default wallet, where the site has none yet. */
  applyAdmin(cfg: ShopConfig, force = false): ShopConfig {
    const p = st.profile; const w = shop.defaultWallet(); const c = {...cfg.contact};
    for (const k of ['telegram', 'whatsapp', 'email', 'phone'] as const) if (p[k] && (force || !c[k])) c[k] = p[k];
    return {...cfg, contact: c,
      brand: {...cfg.brand, place: (force || !cfg.brand.place) && p.place ? p.place : cfg.brand.place, logo: (force || !cfg.brand.logo) && p.logo ? p.logo : cfg.brand.logo},
      payment: {...cfg.payment, address: (force || !cfg.payment.address) && w ? w.address : cfg.payment.address}};
  },
  applyAdminToCurrent() { if (!st.shop) throw new Error('SHOP_NOT_STARTED'); return shop.set(shop.applyAdmin(st.shop, true)); },
  /** Start building: from a template (the owner's own copy) or keep the current one. */
  start(template: keyof typeof TEMPLATES | string = 'blank') {
    const t = TEMPLATES[template] || TEMPLATES.blank; let s = t.make();
    s.payment.address = st.shop?.payment.address || null;      // keep an address already entered
    if (st.shop) s.contact = {...st.shop.contact};
    s = shop.applyAdmin(s, true);                              // owner's saved data and default wallet replace the template's demo ones
    st = {...st, archive: keep(st.shop, s), shop: s, started: true, step: 0}; persist(); emit(); return s;
  },
  /** Take a ready-made config (from a recipe). */
  adopt(cfg: ShopConfig) { cfg = shop.applyAdmin(cfg); st = {...st, archive: keep(st.shop, cfg), shop: cfg, started: true, step: 0}; persist(); emit(); return cfg; },
  /** Earlier sites ("my sites"): today the basement sale, tomorrow the VHS collection. */
  sites: () => [st.shop, ...st.archive].filter(Boolean).map(x => ({id: x!.id, name: x!.brand.name, updatedAt: x!.updatedAt, current: x === st.shop})),
  switchTo(id: string) { const x = st.archive.find(a => a.id === id); if (!x) throw new Error('SITE_NOT_FOUND'); st = {...st, archive: keep(st.shop, x).filter(a => a.id !== id), shop: x, started: true}; persist(); emit(); return x; },
  set(p: Partial<ShopConfig>) { if (!st.shop) throw new Error('SHOP_NOT_STARTED'); st = {...st, shop: {...st.shop, ...p, updatedAt: Date.now()}}; persist(); emit(); return st.shop!; },
  patch<K extends keyof ShopConfig>(k: K, p: Partial<ShopConfig[K]>) { return shop.set({[k]: {...(st.shop as any)[k], ...p}} as any); },
  step(n: number) { st = {...st, step: n}; persist(); emit(); },
  close() { st = {...st, started: false}; persist(); emit(); },
  resume() { if (!st.shop) throw new Error('SHOP_NOT_STARTED'); st = {...st, started: true}; persist(); emit(); return st.shop; },
  // sections
  addSection(p: Partial<Section> = {}, at?: number) { const s = newSection(p); const l = st.shop!.sections.slice(); l.splice(at ?? l.length, 0, s); shop.set({sections: l}); return s; },
  patchSection(id: string, p: Partial<Section>) { shop.set({sections: st.shop!.sections.map(s => s.id === id ? {...s, ...p} : s)}); return st.shop!.sections.find(s => s.id === id)!; },
  removeSection(id: string) { if (st.shop!.sections.length <= 1) throw new Error('LAST_SECTION'); shop.set({sections: st.shop!.sections.filter(s => s.id !== id)}); },
  moveSection(id: string, d: number) { const l = st.shop!.sections.slice(); const i = l.findIndex(s => s.id === id); const j = i + d; if (i < 0 || j < 0 || j >= l.length) return; [l[i], l[j]] = [l[j], l[i]]; shop.set({sections: l}); },
  // cells
  addCell(sectionId: string, p: Partial<Cell> = {}) { const c = newCell(p); shop.set({sections: st.shop!.sections.map(s => s.id === sectionId ? {...s, cells: [...s.cells, c]} : s)}); return c; },
  patchCell(sectionId: string, cellId: string, p: Partial<Cell>) {
    if ('price' in p) p.price = p.price == null || p.price === '' ? null : normPrice(p.price);
    shop.set({sections: st.shop!.sections.map(s => s.id === sectionId ? {...s, cells: s.cells.map(c => c.id === cellId ? {...c, ...p} : c)} : s)});
  },
  removeCell(sectionId: string, cellId: string) { shop.set({sections: st.shop!.sections.map(s => s.id === sectionId ? {...s, cells: s.cells.filter(c => c.id !== cellId)} : s)}); },
  moveCell(sectionId: string, cellId: string, d: number) { shop.set({sections: st.shop!.sections.map(s => { if (s.id !== sectionId) return s; const l = s.cells.slice(); const i = l.findIndex(c => c.id === cellId), j = i + d; if (i < 0 || j < 0 || j >= l.length) return s; [l[i], l[j]] = [l[j], l[i]]; return {...s, cells: l}; })}); },
  // receivers history: injected (address put into a slot) / ejected (taken out)
  logReceiver(address: string, label: string, event: Receiver['event'], block: number | null) { st = {...st, receivers: [...st.receivers, {address: address.toLowerCase(), label, at: Date.now(), block, event}]}; persist(); emit(); },
  fulfil(tx: string, done: boolean, note?: string) { st = {...st, fulfil: {...st.fulfil, [tx]: {done, note, at: Date.now()}}}; persist(); emit(); },
  /** Every address the shop takes money on, with its label. */
  addresses(): {address: string; label: string}[] {
    const s = st.shop; const out = new Map<string, string>();
    for (const w of shop.wallets()) out.set(w.address.toLowerCase(), w.label);
    if (!s) return [...out].map(([address, label]) => ({address, label}));
    if (s.payment.address && !out.has(s.payment.address.toLowerCase())) out.set(s.payment.address.toLowerCase(), 'Общий адрес');
    if (s.payment.mode === 'individual') for (const x of s.sections) for (const c of x.cells) if (c.receiver) out.set(c.receiver.toLowerCase(), out.get(c.receiver.toLowerCase()) ? out.get(c.receiver.toLowerCase()) + ', ' + (c.seller || c.title) : (c.seller || c.title));
    return [...out].map(([address, label]) => ({address, label}));
  },
};
const keep = (cur: ShopConfig | null, next: ShopConfig) => cur && cur.id !== next.id ? [cur, ...st.archive.filter(a => a.id !== cur.id)].slice(0, 12) : st.archive;
export function useShop() { useSyncExternalStore(shop.subscribe, shop.revision); return st; }
export {uid};
