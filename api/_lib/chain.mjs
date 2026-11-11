// Networks, USDC contracts and small RPC helpers shared by the API functions (server side, Node).
export const NETWORKS = {
  'base': {chainId: 8453, caip: 'eip155:8453', rpc: process.env.BASE_RPC || 'https://mainnet.base.org', usdc: '0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913', usdcName: 'USD Coin', explorer: 'https://basescan.org'},
  'base-sepolia': {chainId: 84532, caip: 'eip155:84532', rpc: process.env.BASE_SEPOLIA_RPC || 'https://sepolia.base.org', usdc: '0x036CbD53842c5426634e7929541eC2318f3dCF7e', usdcName: 'USDC', explorer: 'https://sepolia.basescan.org'},
};
export const netOf = (n = 'base') => {
  const k = String(n).toLowerCase(); const byCaip = Object.entries(NETWORKS).find(([, v]) => v.caip === k);
  const key = NETWORKS[k] ? k : byCaip ? byCaip[0] : null; if (!key) throw new Error('UNKNOWN_NETWORK: ' + n);
  return {key, ...NETWORKS[key]};
};
export const TRANSFER = '0xddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef';
export async function rpc(net, method, params) {
  const r = await fetch(net.rpc, {method: 'POST', headers: {'content-type': 'application/json'}, body: JSON.stringify({jsonrpc: '2.0', id: 1, method, params})});
  const j = await r.json(); if (j.error) throw new Error('RPC: ' + (j.error.message || JSON.stringify(j.error))); return j.result;
}
export const units = (s) => { const [a, b = ''] = String(s).trim().split('.'); if (!/^\d+$/.test(a || '0') || !/^\d*$/.test(b) || b.length > 6) throw new Error('BAD_AMOUNT: ' + s); return BigInt(a || '0') * 1000000n + BigInt((b + '000000').slice(0, 6)); };
export const fmt = (u) => { const s = BigInt(u).toString().padStart(7, '0'); return (s.slice(0, -6) + '.' + s.slice(-6)).replace(/\.?0+$/, '') || '0'; };
export const isAddr = (a) => /^0x[0-9a-fA-F]{40}$/.test(String(a || ''));

/** Order number in the last 4 of 6 decimals (same scheme as the portal): 25 + #1234 → 25.001234 */
export const tagged = (total, code) => total + BigInt(code % 10000);

export async function usdcBalance(net, addr) {
  const data = '0x70a08231' + addr.toLowerCase().replace('0x', '').padStart(64, '0');
  return BigInt(await rpc(net, 'eth_call', [{to: net.usdc, data}, 'latest']));
}

/** What USDC this transaction moved, and whether it reached `to` with at least `min`. */
export async function verifyTx(net, tx, to, min) {
  if (!/^0x[0-9a-fA-F]{64}$/.test(tx)) throw new Error('HASH_INVALID');
  const r = await rpc(net, 'eth_getTransactionReceipt', [tx]);
  if (!r) return {found: false, reason: 'NOT_FOUND_OR_PENDING'};
  if (r.status !== '0x1') return {found: false, reason: 'FAILED'};
  const head = Number(await rpc(net, 'eth_blockNumber', [])); const block = Number(r.blockNumber);
  const transfers = r.logs.filter(l => l.address.toLowerCase() === net.usdc.toLowerCase() && l.topics[0] === TRANSFER)
    .map(l => ({from: '0x' + l.topics[1].slice(26), to: '0x' + l.topics[2].slice(26), amount: fmt(BigInt(l.data))}));
  const mine = to ? transfers.filter(t => t.to.toLowerCase() === to.toLowerCase()) : transfers;
  const ok = to ? mine.some(t => !min || units(t.amount) >= units(min)) : mine.length > 0;
  return {found: true, network: net.key, tx, block, confirmations: head - block + 1, transfers, toReceiver: mine, ok, explorer: `${net.explorer}/tx/${tx}`};
}
