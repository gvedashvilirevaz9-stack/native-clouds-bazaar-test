// Seller / payment profile: who issues documents and how they get paid.
// One profile per account; every exported quote, invoice or estimate can carry its payment block.
import {useSyncExternalStore} from 'react';
import {checkAddress, type NetworkId, type TokenId} from './evm';

export const PROFILE_KEY = 'sunrise.billing.profile.v1';
export type DocLang = 'en' | 'ru';
export type Profile = {
  name: string;            // person or business name printed on documents
  email?: string; phone?: string; address?: string; taxId?: string; website?: string;
  logo?: string | null;    // data: URL (small) for the PDF header
  currency: string;
  docLang: DocLang;
  /** Crypto: EVM address (checksummed), network and token. The wallet itself stays with the person. */
  evm?: {address: string; network: NetworkId; token: TokenId; qr: 'address' | 'request'; source: 'manual' | 'coinbase'} | null;
  /** Card / bank: a Stripe / PayPal / Square payment link and free-text bank details. */
  cardLink?: string; bank?: string;
  termsDays: number;       // invoice due in N days
  prefix: string; next: number;   // numbering: INV-2026-0001
  reminderDays: number[];  // after the due date
  footer?: string;
};
const DEF: Profile = {name: '', currency: 'USD', docLang: 'en', evm: null, termsDays: 14, prefix: 'INV', next: 1, reminderDays: [0, 7, 14]};

const subs = new Set<() => void>(); let rev = 0; let cache: Profile | null = null;
function load(): Profile {
  if (cache) return cache;
  try { cache = {...DEF, ...JSON.parse(localStorage.getItem(PROFILE_KEY) || '{}')}; } catch { cache = {...DEF}; }
  return cache!;
}
export const profile = {
  get: load,
  subscribe(f: () => void) { subs.add(f); return () => { subs.delete(f); }; },
  revision: () => rev,
  set(p: Partial<Profile>) {
    const next = {...load(), ...p};
    if (p.evm) { const c = checkAddress(p.evm.address); if (!c.ok) throw new Error('EVM_ADDRESS_' + (c as {reason: string}).reason.toUpperCase()); next.evm = {...p.evm, address: c.address, qr: p.evm.qr || 'address', source: p.evm.source || 'manual'}; }
    if (p.cardLink && !/^https:\/\//.test(p.cardLink)) throw new Error('CARD_LINK_MUST_BE_HTTPS');
    next.currency = (next.currency || 'USD').toUpperCase().slice(0, 6);
    cache = next; rev++; try { localStorage.setItem(PROFILE_KEY, JSON.stringify(next)); } catch { /* memory only */ } subs.forEach(f => f());
    return next;
  },
  /** Reserve the next document number. */
  take(kind: 'invoice' | 'quote') {
    const p = load(); const n = p.next || 1;
    profile.set({next: n + 1});
    return `${kind === 'quote' ? 'Q' : p.prefix || 'INV'}-${new Date().getFullYear()}-${String(n).padStart(4, '0')}`;
  },
  reset() { cache = {...DEF}; rev++; try { localStorage.removeItem(PROFILE_KEY); } catch { /* */ } subs.forEach(f => f()); },
};
export function useProfile() { useSyncExternalStore(profile.subscribe, profile.revision); return load(); }
export const hasPayment = (p: Profile) => !!(p.evm?.address || p.cardLink || p.bank);
