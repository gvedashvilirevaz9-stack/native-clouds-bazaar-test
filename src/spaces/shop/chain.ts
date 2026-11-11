// USDC on Base Mainnet, read straight from public RPC nodes in the browser. No server, no keys.
// Shared by the storefront file (buyer checks their payment) and the owner's cabinet (accounting).
// Logic follows the Snowboarding lab (server/tickets/payment.ts): Transfer events of the USDC
// contract to the receiver, several RPC fallbacks, a confirmation depth, bounded log ranges.

export const CHAIN_ID = 8453;
export const USDC = '0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913';
const TRANSFER = '0xddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef';
export const RPCS = ['https://mainnet.base.org', 'https://base-rpc.publicnode.com', 'https://base.llamarpc.com', 'https://base.drpc.org'];
export const CONFIRMATIONS = 6;          // practical waiting period on Base (not L1 finality)
const RANGE = 2000;                      // blocks per eth_getLogs request (~67 minutes of Base)
export const BLOCK_MS = 2000;

const isAddr = (v: unknown): v is string => typeof v === 'string' && /^0x[0-9a-fA-F]{40}$/.test(v);
const hex = (n: number | bigint) => '0x' + BigInt(n).toString(16);
const topic = (a: string) => '0x' + a.slice(2).toLowerCase().padStart(64, '0');

// ---------- amounts ----------
/** "12.5" → 12500000n (6 decimals), exact, no floats. */
export function units(amount: string): bigint {
  const [w, f = ''] = String(amount).split('.');
  if (!/^\d+$/.test(w) || !/^\d*$/.test(f) || f.length > 6) throw new Error('AMOUNT_INVALID');
  return BigInt(w) * 1000000n + BigInt((f + '000000').slice(0, 6));
}
/** Always 6 decimals: keeps the order number visible (75.001750). */
export const fmt6 = (u: bigint) => `${u / 1000000n}.${(u % 1000000n).toString().padStart(6, '0')}`;
export function fmt(u: bigint): string { const w = u / 1000000n, f = (u % 1000000n).toString().padStart(6, '0').replace(/0+$/, ''); return f ? `${w}.${f}` : `${w}`; }
/** The order number lives in the last 4 of the 6 decimals: 12.5 + #4817 → 12.504817.
 *  Prices themselves keep at most 2 decimals so the tag never collides with the price. */
export function tagged(total: bigint, code: number) { return (total / 10000n) * 10000n + BigInt(code % 10000); }
export const codeOf = (u: bigint) => Number(u % 10000n);
export const newCode = () => 1000 + Math.floor(Math.random() * 9000);

/** ERC-681 request: Base, USDC contract, receiver, exact amount. */
export const payUri = (to: string, u: bigint) => `ethereum:${USDC}@${CHAIN_ID}/transfer?address=${to}&uint256=${u.toString()}`;

// ---------- RPC ----------
let rpcs = RPCS.slice();
export function setRpcs(list: string[]) { if (list.length) rpcs = list.slice(); }
async function call(url: string, method: string, params: unknown[]) {
  const ctl = new AbortController(); const t = setTimeout(() => ctl.abort(), 12000);
  try {
    const r = await fetch(url, {method: 'POST', headers: {'content-type': 'application/json'}, body: JSON.stringify({jsonrpc: '2.0', id: 1, method, params}), signal: ctl.signal});
    if (!r.ok) throw new Error('RPC_HTTP');
    const b = await r.json(); if (b?.error || !('result' in (b || {}))) throw new Error('RPC_ERROR');
    return b.result;
  } finally { clearTimeout(t); }
}
export async function rpc(method: string, params: unknown[] = []) {
  for (const u of rpcs) { try { return await call(u, method, params); } catch { /* next node */ } }
  throw new Error('CHAIN_RPC_UNAVAILABLE');
}
export const head = async () => Number(BigInt(await rpc('eth_blockNumber')));
export async function balance(addr: string) {
  if (!isAddr(addr)) throw new Error('ADDRESS_INVALID');
  return BigInt(await rpc('eth_call', [{to: USDC, data: '0x70a08231' + addr.slice(2).toLowerCase().padStart(64, '0')}, 'latest']));
}

export type Transfer = {tx: string; log: number; from: string; to: string; amount: bigint; block: number; time?: number};
/** Incoming USDC transfers to `to` in [from, toBlock], split into bounded requests. */
export async function transfers(to: string, fromBlock: number, toBlock: number, maxRequests = 30): Promise<{list: Transfer[]; scannedTo: number}> {
  if (!isAddr(to)) throw new Error('ADDRESS_INVALID');
  const out: Transfer[] = []; let cur = fromBlock; let n = 0; let scanned = fromBlock - 1;
  while (cur <= toBlock && n < maxRequests) {
    let end = Math.min(toBlock, cur + RANGE - 1);
    const logs = await rpc('eth_getLogs', [{address: USDC, fromBlock: hex(cur), toBlock: hex(end), topics: [TRANSFER, null, topic(to)]}]);
    n++;
    if (!Array.isArray(logs)) throw new Error('CHAIN_RPC_UNAVAILABLE');
    for (const l of logs) {
      try {
        if (l.removed || l.address.toLowerCase() !== USDC.toLowerCase() || l.topics?.[0]?.toLowerCase() !== TRANSFER) continue;
        out.push({tx: l.transactionHash.toLowerCase(), log: Number(BigInt(l.logIndex)), from: '0x' + l.topics[1].slice(-40), to: '0x' + l.topics[2].slice(-40), amount: BigInt(l.data), block: Number(BigInt(l.blockNumber))});
      } catch { /* skip malformed */ }
    }
    scanned = end; cur = end + 1;
  }
  return {list: out, scannedTo: scanned};
}
export async function blockTime(n: number) { const b = await rpc('eth_getBlockByNumber', [hex(n), false]); return Number(BigInt(b.timestamp)) * 1000; }
/** A block at or before `time`, estimated from Base's 2-second blocks and checked once. */
export async function blockAt(time: number, h?: number) {
  const top = h ?? await head(); const ht = await blockTime(top);
  let b = Math.max(0, top - Math.ceil((ht - time) / BLOCK_MS) - 60);
  try { const t = await blockTime(b); if (t > time) b = Math.max(0, b - Math.ceil((t - time) / BLOCK_MS) - 60); } catch { /* estimate is fine */ }
  return b;
}

/** Buyer side: was this exact amount paid to this receiver after the order was created?
 *  USDC/USDT carry 6 decimals on chain, so 75.001750 is a valid transfer. Some apps and exchanges
 *  only let people type 2 decimals; then the order number is lost. `base` (the price without the
 *  number) lets us still find the payment: rounded down or up to the cent, marked exact:false. */
export async function findPayment(p: {to: string; amount: bigint; base?: bigint; startBlock?: number | null; created: number}) {
  const h = await head();
  const start = p.startBlock ?? await blockAt(p.created - 120000, h);
  // Look up to ~24 h after the order; most payments land within minutes.
  const r = await transfers(p.to, start, Math.min(h, start + 43200), 22);
  let hit = r.list.find(t => t.amount === p.amount); let exact = true;
  if (!hit && p.base != null && p.base !== p.amount) {
    // Only payments without any order number: exactly the price, or the tagged sum rounded to a cent.
    const near = r.list.filter(t => t.amount % 10000n === 0n && t.amount >= p.base! && t.amount <= p.base! + 10000n);
    if (near.length) { hit = near[0]; exact = false; }
  }
  if (!hit) return {paid: false as const, scannedTo: r.scannedTo, head: h};
  return {paid: true as const, exact, amount: hit.amount, tx: hit.tx, from: hit.from, block: hit.block, confirmations: h - hit.block, confirmed: h - hit.block >= CONFIRMATIONS};
}

// ---------- browser wallet (MetaMask / Coinbase Wallet / any EIP-1193) ----------
export async function payWithWallet(to: string, amount: bigint) {
  const eth = (globalThis as any).ethereum; if (!eth) throw new Error('NO_WALLET');
  const [from] = await eth.request({method: 'eth_requestAccounts'});
  try { await eth.request({method: 'wallet_switchEthereumChain', params: [{chainId: hex(CHAIN_ID)}]}); }
  catch (e: any) {
    if (e?.code === 4902) await eth.request({method: 'wallet_addEthereumChain', params: [{chainId: hex(CHAIN_ID), chainName: 'Base', nativeCurrency: {name: 'Ether', symbol: 'ETH', decimals: 18}, rpcUrls: ['https://mainnet.base.org'], blockExplorerUrls: ['https://basescan.org']}]});
    else throw e;
  }
  const data = '0xa9059cbb' + to.slice(2).toLowerCase().padStart(64, '0') + amount.toString(16).padStart(64, '0');
  return await eth.request({method: 'eth_sendTransaction', params: [{from, to: USDC, data}]}) as string;
}
export const txUrl = (tx: string) => 'https://basescan.org/tx/' + tx;
export const addrUrl = (a: string) => 'https://basescan.org/address/' + a;

/** "Paste the hash": what USDC did this transaction send to any of my addresses, when, from whom.
 *  Same idea as findIncomingByHash in the lab: the verified Transfer event decides, not the wallet UI. */
export async function lookupTx(hash: string, mine: string[]) {
  if (!/^0x[0-9a-fA-F]{64}$/.test(hash.trim())) throw new Error('HASH_INVALID');
  const tx = hash.trim().toLowerCase(); const set = new Set(mine.map(a => a.toLowerCase()));
  const receipt = await rpc('eth_getTransactionReceipt', [tx]);
  if (!receipt) return {found: false as const, reason: 'NOT_FOUND_OR_PENDING'};
  if (receipt.status !== '0x1') return {found: false as const, reason: 'FAILED'};
  const block = Number(BigInt(receipt.blockNumber)); const [h, time] = await Promise.all([head(), blockTime(block).catch(() => 0)]);
  const all = (receipt.logs || []).filter((l: any) => l.address?.toLowerCase() === USDC.toLowerCase() && l.topics?.[0]?.toLowerCase() === TRANSFER && l.topics.length === 3)
    .map((l: any) => ({from: '0x' + l.topics[1].slice(-40), to: '0x' + l.topics[2].slice(-40), amount: BigInt(l.data), log: Number(BigInt(l.logIndex))}));
  const toMe = all.filter((t: any) => set.has(t.to));
  return {found: true as const, tx, block, time, confirmations: h - block, confirmed: h - block >= CONFIRMATIONS, toMe, other: all.filter((t: any) => !set.has(t.to))};
}
