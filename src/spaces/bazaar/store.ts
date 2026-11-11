// The Bazaar: rows of "stalls" (лавки) the person collects. Everything stays in this browser (IndexedDB).
//  - file stall: a price-list HTML someone sent you (made with "My shop"), kept here after you drop it in;
//  - connector stall: a catalog brought in by an agent/adapter from an outside service (MCP, UCP/ACP, x402, API).
// One search goes through all stalls. Buying = paying the seller's own address in USDC on Base (from your wallet),
// or, for connector items, the service's own route (x402 / checkout link) handled by the agent.
import {useSyncExternalStore} from 'react';
import type {ShopConfig, Cell} from '../shop/model';
import {units, fmt, fmt6, tagged, newCode} from '../shop/chain';
import {DEFAULT_POLICY, type AgentPolicy} from './connectors';

const DB = 'sunrise-bazaar', OS = 'kv';
function db(): Promise<IDBDatabase> { return new Promise((res, rej) => { const r = indexedDB.open(DB, 1); r.onupgradeneeded = () => r.result.createObjectStore(OS); r.onsuccess = () => res(r.result); r.onerror = () => rej(r.error); }); }
async function idb<T>(mode: IDBTransactionMode, fn: (s: IDBObjectStore) => IDBRequest): Promise<T> { const d = await db(); return new Promise((res, rej) => { const t = d.transaction(OS, mode); const q = fn(t.objectStore(OS)); q.onsuccess = () => res(q.result as T); q.onerror = () => rej(q.error); }); }
const kv = {get: <T>(k: string) => idb<T | undefined>('readonly', s => s.get(k)), set: (k: string, v: unknown) => idb('readwrite', s => s.put(v, k))};

export type Protocol = 'mcp' | 'ucp' | 'acp' | 'x402' | 'api' | 'manual';
export type ConnItem = {id: string; title: string; text?: string; price: string | null; unit?: string; image?: string | null; url?: string;
  pay: {kind: 'evm'; to: string} | {kind: 'x402'; url: string} | {kind: 'link'; url: string} | {kind: 'none'}};
export type FileStall = {key: string; kind: 'file'; cfg: ShopConfig & {assets: string[]}; file: string; size: number; importedAt: number; warnings: string[]; source: string};
export type ConnStall = {key: string; kind: 'connector'; name: string; protocol: Protocol; endpoint?: string; note?: string; logo?: string | null; items: ConnItem[]; importedAt: number; warnings: string[]};
export type Stall = FileStall | ConnStall;

export type Group = {to: string | null; seller?: string; total: string; amount: string; route: 'evm' | 'x402' | 'link' | 'none'; url?: string;
  sent?: {tx: string; at: number; byAgent?: boolean} | null; paid?: {tx: string; from: string; amount: string; exact: boolean; confirmed: boolean; at: number} | null};
export type Order = {id: string; stall: string; stallName: string; code: number; created: number; startBlock: number | null;
  items: {id: string; title: string; price: string; qty: number; seller?: string}[]; groups: Group[];
  buyer: {name: string; contact: string; comment: string}; contact: Record<string, string>};

type State = {stalls: Stall[]; orders: Order[]; policy: AgentPolicy; loaded: boolean};
let st: State = {stalls: [], orders: [], policy: DEFAULT_POLICY, loaded: false};
const subs = new Set<() => void>(); let rev = 0; let saveT: any;
const emit = () => { rev++; subs.forEach(f => f()); };
const persist = () => { clearTimeout(saveT); saveT = setTimeout(() => void kv.set('state', {stalls: st.stalls, orders: st.orders.slice(-200), policy: st.policy}), 200); };
const set = (p: Partial<State>) => { st = {...st, ...p}; persist(); emit(); };

/** One row of the shared catalog: what search and the agent see, whatever the stall kind. */
export type CatalogItem = {stall: string; stallName: string; kind: Stall['kind']; protocol?: Protocol; id: string; title: string; text: string; price: string | null; unit?: string;
  seller?: string; place?: string; pay: 'evm' | 'x402' | 'link' | 'none'; to?: string | null; url?: string; image?: string | null};

const receiverOf = (cfg: ShopConfig, c: Cell) => cfg.payment.mode === 'individual' ? (c.receiver || null) : (cfg.payment.address || null);
const imgOf = (s: FileStall, src?: string | null) => !src ? null : src.startsWith('#a') ? s.cfg.assets[+src.slice(2)] || null : src;

export const bazaar = {
  get: () => st,
  async load() { if (st.loaded) return; const v = await kv.get<Partial<State>>('state'); st = {stalls: v?.stalls || [], orders: v?.orders || [], policy: {...DEFAULT_POLICY, ...(v?.policy || {})}, loaded: true}; emit(); },
  stall: (key: string) => st.stalls.find(s => s.key === key || (s.kind === 'file' ? s.cfg.brand.name : s.name).toLowerCase() === key.toLowerCase()) || null,
  name: (s: Stall) => s.kind === 'file' ? s.cfg.brand.name : s.name,

  /** Adds or updates a stall from a dropped file (same shop id = new version replaces the old one). */
  addFile(p: Omit<FileStall, 'key' | 'kind' | 'importedAt'>) {
    const key = 'f-' + p.cfg.id; const s: FileStall = {...p, key, kind: 'file', importedAt: Date.now()};
    set({stalls: [s, ...st.stalls.filter(x => x.key !== key)]}); return s;
  },
  addConnector(p: Omit<ConnStall, 'key' | 'kind' | 'importedAt' | 'warnings'> & {key?: string}) {
    const key = p.key || 'c-' + p.name.toLowerCase().replace(/[^\p{L}\p{N}]+/gu, '-').replace(/^-|-$/g, '').slice(0, 40);
    const s: ConnStall = {...p, key, kind: 'connector', importedAt: Date.now(), warnings: []};
    set({stalls: [s, ...st.stalls.filter(x => x.key !== key)]}); return s;
  },
  remove(key: string) { set({stalls: st.stalls.filter(s => s.key !== key)}); },

  catalog(stallKey?: string): CatalogItem[] {
    return st.stalls.filter(s => !stallKey || s.key === stallKey).flatMap((s): CatalogItem[] => s.kind === 'file'
      ? s.cfg.sections.flatMap(sec => sec.cells.map(c => ({stall: s.key, stallName: s.cfg.brand.name, kind: 'file' as const, id: c.id, title: c.title, text: c.text, price: c.price, unit: c.unit,
          seller: c.seller, place: c.place || s.cfg.brand.place || undefined, pay: (receiverOf(s.cfg, c) ? 'evm' : 'none') as CatalogItem['pay'], to: receiverOf(s.cfg, c), image: imgOf(s, c.image?.src)})))
      : s.items.map(i => ({stall: s.key, stallName: s.name, kind: 'connector' as const, protocol: s.protocol, id: i.id, title: i.title, text: i.text || '', price: i.price, unit: i.unit,
          pay: i.pay.kind, to: i.pay.kind === 'evm' ? i.pay.to : null, url: i.pay.kind === 'x402' || i.pay.kind === 'link' ? i.pay.url : i.url, image: i.image || null})));
  },
  search(q: string, stallKey?: string) {
    const words = q.toLowerCase().split(/\s+/).filter(Boolean);
    return bazaar.catalog(stallKey).map(i => { const hay = (i.title + ' ' + i.text + ' ' + i.stallName + ' ' + (i.seller || '') + ' ' + (i.place || '')).toLowerCase();
      return {i, score: words.reduce((a, w) => a + (i.title.toLowerCase().includes(w) ? 3 : hay.includes(w) ? 1 : 0), 0)}; })
      .filter(x => !words.length || x.score >= words.length).sort((a, b) => b.score - a.score).map(x => x.i);
  },

  /** Cart lines → an order with one payment per receiver (same rules as the seller's own page, incl. the order number in the amount). */
  order(stallKey: string, lines: {id: string; qty: number}[], buyer: Partial<Order['buyer']> = {}): Order {
    const s = bazaar.stall(stallKey); if (!s) throw new Error('STALL_NOT_FOUND');
    const cat = bazaar.catalog(s.key); const code = newCode();
    const items = lines.map(l => ({l, c: cat.find(c => c.id === l.id || c.title.toLowerCase() === String(l.id).toLowerCase())})).filter(x => x.c && x.c.price && x.l.qty > 0) as {l: {qty: number}; c: CatalogItem}[];
    if (!items.length) throw new Error('NOTHING_TO_BUY');
    const orderTag = s.kind === 'file' ? s.cfg.payment.orderTag : true;
    const by = new Map<string, {to: string | null; seller?: string; total: bigint; route: Group['route']; url?: string}>();
    for (const {l, c} of items) {
      const k = c.pay === 'evm' ? 'evm|' + c.to + '|' + (c.seller || '') : c.pay + '|' + (c.url || c.id);
      const g = by.get(k) || {to: c.pay === 'evm' ? c.to! : null, seller: c.seller, total: 0n, route: c.pay, url: c.url}; g.total += units(c.price!) * BigInt(l.qty); by.set(k, g);
    }
    const groups: Group[] = [...by.values()].map(g => ({to: g.to, seller: g.seller, route: g.route, url: g.url, total: fmt(g.total),
      amount: g.route === 'evm' && orderTag && g.total % 10000n === 0n ? fmt6(tagged(g.total, code)) : fmt(g.total), paid: null, sent: null}));
    const o: Order = {id: 'o-' + Date.now().toString(36) + Math.random().toString(36).slice(2, 5), stall: s.key, stallName: bazaar.name(s), code, created: Date.now(), startBlock: null,
      items: items.map(({l, c}) => ({id: c.id, title: c.title, price: c.price!, qty: l.qty, seller: c.seller})), groups,
      buyer: {name: buyer.name || '', contact: buyer.contact || '', comment: buyer.comment || ''}, contact: s.kind === 'file' ? {...s.cfg.contact} as any : {}};
    set({orders: [...st.orders, o]});
    // Where to start looking for the payment in the chain (a little before now).
    import('../shop/chain').then(c => c.head()).then(h => { if (h) bazaar.patchOrder(o.id, x => { if (x.startBlock == null) x.startBlock = h - 30; }); }).catch(() => { /* offline: estimated from the order time */ });
    return o;
  },
  getOrder: (id: string) => st.orders.find(o => o.id === id || String(o.code) === String(id).replace('#', '')) || null,
  patchOrder(id: string, fn: (o: Order) => void) { const o = bazaar.getOrder(id); if (!o) throw new Error('ORDER_NOT_FOUND'); const c: Order = JSON.parse(JSON.stringify(o)); fn(c); set({orders: st.orders.map(x => x.id === o.id ? c : x)}); return c; },

  setPolicy(p: Partial<AgentPolicy>) { set({policy: {...st.policy, ...p}}); return st.policy; },
  /** USDC the agent has sent today (from orders it paid). */
  agentSpentToday() { const d0 = new Date(); d0.setHours(0, 0, 0, 0); return st.orders.flatMap(o => o.groups).filter(g => g.sent?.byAgent && g.sent.at >= d0.getTime()).reduce((a, g) => a + units(g.amount), 0n); },
  /** Checks the agent's limits before it may ask the wallet to pay. Returns a reason in plain words when not allowed. */
  agentMay(o: Order, g: Group): {ok: true} | {ok: false; reason: string} {
    const p = st.policy; const amt = units(g.amount);
    if (!p.enabled) return {ok: false, reason: 'AGENT_PAY_OFF: агенту не разрешено платить (Базар → Агент и лимиты)'};
    if (g.route === 'evm' && !p.routes.evm) return {ok: false, reason: 'ROUTE_OFF: оплата на адрес выключена для агента'};
    if (g.route === 'x402' && !p.routes.x402) return {ok: false, reason: 'ROUTE_OFF: x402 выключен для агента'};
    if (p.onlyStalls.length && !p.onlyStalls.includes(o.stall)) return {ok: false, reason: 'STALL_NOT_ALLOWED: этой лавки нет в списке разрешённых'};
    if (amt > units(p.perOrderMax)) return {ok: false, reason: `OVER_ORDER_LIMIT: ${g.amount} > ${p.perOrderMax} USDC за заказ`};
    if (bazaar.agentSpentToday() + amt > units(p.perDayMax)) return {ok: false, reason: `OVER_DAY_LIMIT: лимит ${p.perDayMax} USDC в день`};
    return {ok: true};
  },
  /** Text for the seller: what was bought, how much, and the transaction hashes (the proof). */
  message(o: Order) {
    const lines = o.items.map(i => `• ${i.title} ×${i.qty} — ${fmt(units(i.price) * BigInt(i.qty))} USDC${i.seller ? ' (' + i.seller + ')' : ''}`);
    const pay = o.groups.map(g => `${g.seller ? g.seller + ': ' : ''}${g.amount} USDC${g.to ? ' → ' + g.to : ''}${g.paid ? `\n  ✓ оплачено, tx ${g.paid.tx}` : g.sent ? `\n  отправлено, tx ${g.sent.tx}` : '\n  ещё не оплачено'}`);
    return `Заказ #${o.code} · ${o.stallName} (через Базар)\n${lines.join('\n')}\nОплата USDC, сеть Base:\n${pay.join('\n')}${o.buyer.name ? '\nИмя: ' + o.buyer.name : ''}${o.buyer.contact ? '\nСвязь: ' + o.buyer.contact : ''}${o.buyer.comment ? '\nКомментарий: ' + o.buyer.comment : ''}`;
  },
};

export function useBazaar() { useSyncExternalStore(f => { subs.add(f); return () => { subs.delete(f); }; }, () => rev); return st; }
