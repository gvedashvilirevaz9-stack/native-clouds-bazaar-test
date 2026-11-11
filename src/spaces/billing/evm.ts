// EVM payment details printed on documents. The portal never holds keys or money:
// it validates the address (EIP-55), builds a payment link (EIP-681) and draws a QR code.
import {keccak_256} from '@noble/hashes/sha3.js';
import {bytesToHex} from '@noble/hashes/utils.js';
import qrcode from 'qrcode-generator';

export type NetworkId = 'base' | 'ethereum' | 'polygon' | 'arbitrum' | 'optimism';
export type TokenId = 'USDC' | 'USDT' | 'ETH';

export const NETWORKS: Record<NetworkId, {name: string; chainId: number; native: string; tokens: Partial<Record<TokenId, {address: string; decimals: number}>>}> = {
  base: {name: 'Base', chainId: 8453, native: 'ETH', tokens: {USDC: {address: '0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913', decimals: 6}}},
  ethereum: {name: 'Ethereum', chainId: 1, native: 'ETH', tokens: {USDC: {address: '0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48', decimals: 6}, USDT: {address: '0xdAC17F958D2ee523a2206206994597C13D831ec7', decimals: 6}}},
  polygon: {name: 'Polygon', chainId: 137, native: 'POL', tokens: {USDC: {address: '0x3c499c542cEF5E3811e1192ce70d8cC03d5c3359', decimals: 6}, USDT: {address: '0xc2132D05D31c914a87C6611C10748AEb04B58e8F', decimals: 6}}},
  arbitrum: {name: 'Arbitrum One', chainId: 42161, native: 'ETH', tokens: {USDC: {address: '0xaf88d065e77c8cC2239327C5EDb3A432268e5831', decimals: 6}, USDT: {address: '0xFd086bC7CD5C481DCC9C85ebE478A1C0b69FCbb9', decimals: 6}}},
  optimism: {name: 'OP Mainnet', chainId: 10, native: 'ETH', tokens: {USDC: {address: '0x0b2C639c533813f4Aa9D7837CAf62653d097Ff85', decimals: 6}, USDT: {address: '0x94b008aA00579c1307B0EF2c499aD98a8ce58e58', decimals: 6}}},
};
export const tokensOn = (n: NetworkId): TokenId[] => [...Object.keys(NETWORKS[n].tokens) as TokenId[], ...(NETWORKS[n].native === 'ETH' ? ['ETH' as TokenId] : [])];

/** EIP-55 mixed-case checksum. */
export function toChecksum(addr: string) {
  const a = addr.toLowerCase().replace(/^0x/, '');
  const h = bytesToHex(keccak_256(new TextEncoder().encode(a)));
  let out = '0x';
  for (let i = 0; i < 40; i++) out += parseInt(h[i], 16) >= 8 ? a[i].toUpperCase() : a[i];
  return out;
}
export type AddrCheck = {ok: true; address: string} | {ok: false; reason: 'empty' | 'format' | 'checksum'};
/** All-lower / all-upper addresses carry no checksum and are accepted; mixed case must match EIP-55. */
export function checkAddress(input: string): AddrCheck {
  const s = (input || '').trim();
  if (!s) return {ok: false, reason: 'empty'};
  if (!/^0x[0-9a-fA-F]{40}$/.test(s)) return {ok: false, reason: 'format'};
  const body = s.slice(2); const sum = toChecksum(s);
  if (body !== body.toLowerCase() && body !== body.toUpperCase() && sum !== s) return {ok: false, reason: 'checksum'};
  return {ok: true, address: sum};
}
export const shortAddr = (a: string) => a.length > 14 ? a.slice(0, 6) + '…' + a.slice(-4) : a;

/** Amount in base units without floating point drift ("12.5", 6 → "12500000"). */
export function toUnits(amount: number | string, decimals: number) {
  const [w, f = ''] = String(amount).replace(',', '.').split('.');
  const frac = (f + '0'.repeat(decimals)).slice(0, decimals);
  return (BigInt(w || '0') * 10n ** BigInt(decimals) + BigInt(frac || '0')).toString();
}

/** EIP-681 payment request. Without an amount it still pins the chain and token. */
export function paymentUri(p: {address: string; network: NetworkId; token: TokenId; amount?: number | null}) {
  const net = NETWORKS[p.network];
  if (p.token === 'ETH') return `ethereum:${p.address}@${net.chainId}` + (p.amount ? `?value=${toUnits(p.amount, 18)}` : '');
  const t = net.tokens[p.token]; if (!t) return `ethereum:${p.address}@${net.chainId}`;
  return `ethereum:${t.address}@${net.chainId}/transfer?address=${p.address}` + (p.amount ? `&uint256=${toUnits(p.amount, t.decimals)}` : '');
}

/** QR as a crisp PNG data URL (black on white, with a quiet zone). */
export function qrDataUrl(text: string, px = 360) {
  const q = qrcode(0, 'M'); q.addData(text); q.make();
  const n = q.getModuleCount(); const quiet = 3; const cell = Math.max(2, Math.floor(px / (n + quiet * 2)));
  const size = cell * (n + quiet * 2);
  const c = document.createElement('canvas'); c.width = c.height = size;
  const g = c.getContext('2d')!; g.fillStyle = '#fff'; g.fillRect(0, 0, size, size); g.fillStyle = '#000';
  for (let r = 0; r < n; r++) for (let k = 0; k < n; k++) if (q.isDark(r, k)) g.fillRect((k + quiet) * cell, (r + quiet) * cell, cell, cell);
  return c.toDataURL('image/png');
}
