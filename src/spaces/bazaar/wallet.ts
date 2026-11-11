// One Coinbase sign-in for the whole portal: the same session as "My shop" (/api/my-shop/auth/*).
// In My shop the address is the owner (loginWallet); in the Bazaar it is the buyer — payments go FROM it.
// The wallet always asks the person before sending money; the portal never holds keys.
//
// Integration hooks (live portal): if the portal already has its wagmi/Coinbase connection, it can expose
//   window.__ncWallet = {provider: () => Promise<EIP1193>, signIn: () => Promise<void>, signOut: () => Promise<void>}
// and the Bazaar uses those instead of its own SDK instance — one connection, one session.
import {useEffect, useState} from 'react';
import {CHAIN_ID, USDC, balance} from '../shop/chain';

export const AUTH = '/api/my-shop/auth/';
export type WalletState = {checked: boolean; address: string | null; chainId?: number; provider?: string; expires?: number; usdc?: bigint | null; busy?: string; error?: string};
let state: WalletState = {checked: false, address: null};
const subs = new Set<() => void>();
const set = (p: Partial<WalletState>) => { state = {...state, ...p}; subs.forEach(f => f()); };
const host = () => (globalThis as any).__ncWallet as undefined | {provider?: () => Promise<any>; signIn?: () => Promise<void>; signOut?: () => Promise<void>};

let cb: any = null;
/** The Coinbase Wallet provider (Smart Wallet in the browser or the extension — the person chooses). */
export async function coinbase() {
  const h = host(); if (h?.provider) return h.provider();
  if (cb) return cb;
  const {createCoinbaseWalletSDK} = await import('@coinbase/wallet-sdk');
  cb = createCoinbaseWalletSDK({appName: 'Native Clouds · Bazaar', appChainIds: [CHAIN_ID], preference: {options: 'all'}}).getProvider();
  return cb;
}

const hex = (s: string) => '0x' + Array.from(new TextEncoder().encode(s), b => b.toString(16).padStart(2, '0')).join('');
async function api(path: string, body?: unknown) {
  const r = await fetch(AUTH + path, {method: body ? 'POST' : 'GET', credentials: 'same-origin', cache: 'no-store', headers: body ? {'Content-Type': 'application/json'} : undefined, body: body ? JSON.stringify(body) : undefined});
  const j = await r.json().catch(() => ({})); if (!r.ok) throw new Error(j.error || 'AUTH_HTTP_' + r.status); return j;
}

export async function refresh() {
  try { const s = await api('session'); set({checked: true, address: s.authenticated ? s.address : null, chainId: s.chainId, provider: s.provider, expires: s.expires, error: undefined}); }
  catch { set({checked: true, address: null}); }
  if (state.address) void refreshBalance();
}
export async function refreshBalance() { if (!state.address) return; try { set({usdc: await balance(state.address)}); } catch { set({usdc: null}); } }

/** Connect Coinbase Wallet → sign the one-time message → server checks the signature → session cookie. */
export async function signIn() {
  set({busy: 'signin', error: undefined});
  try {
    const h = host(); if (h?.signIn) { await h.signIn(); await refresh(); return; }
    const eth = await coinbase();
    const [address] = await eth.request({method: 'eth_requestAccounts'}) as string[];
    if (!address) throw new Error('WALLET_NOT_CONNECTED');
    const {message} = await api('challenge', {address, chainId: CHAIN_ID});
    const signature = await eth.request({method: 'personal_sign', params: [hex(message), address]});
    await api('verify', {message, signature});
    await refresh();
  } catch (e: any) { set({error: e?.code === 4001 ? 'Вы отменили вход в кошельке.' : String(e?.message || e)}); throw e; }
  finally { set({busy: undefined}); }
}

export async function signOut() {
  try { const h = host(); if (h?.signOut) await h.signOut(); else await api('logout', {}); } catch { /* already out */ }
  try { await cb?.disconnect?.(); } catch { /* */ } cb = null;
  set({address: null, usdc: undefined});
}

/** Send USDC on Base from the signed-in Coinbase address. The wallet shows the amount and asks the person. */
export async function payUsdc(to: string, amount: bigint) {
  const eth = await coinbase();
  const accounts = await eth.request({method: 'eth_requestAccounts'}) as string[];
  const from = (state.address && accounts.find(a => a.toLowerCase() === state.address!.toLowerCase())) || accounts[0];
  if (!from) throw new Error('WALLET_NOT_CONNECTED');
  if (state.address && from.toLowerCase() !== state.address.toLowerCase()) throw new Error('WALLET_OTHER_ADDRESS');
  try { await eth.request({method: 'wallet_switchEthereumChain', params: [{chainId: '0x' + CHAIN_ID.toString(16)}]}); } catch { /* Coinbase is on Base already */ }
  const data = '0xa9059cbb' + to.slice(2).toLowerCase().padStart(64, '0') + amount.toString(16).padStart(64, '0');
  const tx = await eth.request({method: 'eth_sendTransaction', params: [{from, to: USDC, data}]}) as string;
  setTimeout(() => void refreshBalance(), 8000);
  return tx;
}

export const walletState = () => state;
export function useWallet() {
  const [, tick] = useState(0);
  useEffect(() => { const f = () => tick(x => x + 1); subs.add(f); if (!state.checked) void refresh(); return () => { subs.delete(f); }; }, []);
  return state;
}
