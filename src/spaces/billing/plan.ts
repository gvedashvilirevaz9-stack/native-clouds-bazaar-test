// Product plans. Entitlements only; there are no accounts or payments in this package yet.
// Login (Gmail → Coinbase wallet, signed message) will set `plan` later; see PRODUCT.md.
import {useSyncExternalStore} from 'react';

export type PlanId = 'free' | 'pro' | 'family';
export const PLANS: Record<PlanId, {ru: string; en: string; price: string; fastFiles: number; batch: number; brandedDocs: boolean; paymentQr: boolean; reminders: boolean; devices: {computers: number; phones: number}}> = {
  // Fast mode stays free: it is how people find us from search ("jpg to pdf").
  free: {ru: 'Бесплатно', en: 'Free', price: '$0', fastFiles: 20, batch: 10, brandedDocs: false, paymentQr: true, reminders: false, devices: {computers: 1, phones: 1}},
  pro: {ru: 'Pro', en: 'Pro', price: '$12 / мес', fastFiles: 200, batch: 50, brandedDocs: true, paymentQr: true, reminders: true, devices: {computers: 1, phones: 2}},
  family: {ru: 'Семья', en: 'Family', price: '$19 / мес', fastFiles: 200, batch: 50, brandedDocs: true, paymentQr: true, reminders: true, devices: {computers: 2, phones: 5}},
};
const KEY = 'sunrise.plan.v1';
const subs = new Set<() => void>(); let rev = 0;
const read = (): PlanId => { try { const v = localStorage.getItem(KEY) as PlanId; return v && PLANS[v] ? v : 'free'; } catch { return 'free'; } };
export const plan = {
  id: read,
  get: () => PLANS[read()],
  set(id: PlanId) { if (!PLANS[id]) throw new Error('UNKNOWN_PLAN'); try { localStorage.setItem(KEY, id); } catch { /* */ } rev++; subs.forEach(f => f()); return {plan: id}; },
  subscribe(f: () => void) { subs.add(f); return () => { subs.delete(f); }; },
  revision: () => rev,
};
export function usePlan() { useSyncExternalStore(plan.subscribe, plan.revision); return {id: read(), ...PLANS[read()]}; }
