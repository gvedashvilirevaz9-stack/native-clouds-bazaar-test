// x402 client (buyer side): probe a paid URL, and — only with an agent test wallet configured — pay it.
// Supports the v1 shape (402 JSON body {accepts:[…maxAmountRequired…]}, X-PAYMENT header) and the v2 shape
// (PAYMENT-REQUIRED header, PAYMENT-SIGNATURE header, network "eip155:…", amount). v2 is EXPERIMENTAL here.
//
// Safety rules (env):
//   AGENT_PRIVATE_KEY        test wallet key — a SEPARATE wallet with a few test USDC, never your personal one
//   AGENT_NETWORKS           allowed networks, default "base-sepolia" (add "base" only on purpose)
//   AGENT_MAX_PER_CALL_USDC  default 0.10
//   MCP_TOKEN                required for paying at all (the MCP URL must carry ?key=… or Bearer)
import {privateKeyToAccount} from 'viem/accounts';
import {netOf, units, fmt} from './chain.mjs';

const b64 = (o) => Buffer.from(JSON.stringify(o)).toString('base64');
const unb64 = (s) => { try { return JSON.parse(Buffer.from(s, 'base64').toString('utf8')); } catch { return null; } };

export function agentConfig() {
  const allowed = (process.env.AGENT_NETWORKS || 'base-sepolia').split(',').map(s => s.trim()).filter(Boolean);
  const max = process.env.AGENT_MAX_PER_CALL_USDC || '0.10';
  let address = null; if (process.env.AGENT_PRIVATE_KEY) { try { address = privateKeyToAccount(normKey(process.env.AGENT_PRIVATE_KEY)).address; } catch { address = 'INVALID_KEY'; } }
  return {wallet: address, networks: allowed, maxPerCall: max, payEnabled: !!(address && address !== 'INVALID_KEY' && process.env.MCP_TOKEN)};
}
const normKey = (k) => (k.startsWith('0x') ? k : '0x' + k).trim();

/** Normalised requirements from a 402 response. */
export async function readRequirements(res) {
  const hdr = res.headers.get('payment-required'); let body = null; const text = await res.text();
  try { body = JSON.parse(text); } catch { /* not json */ }
  const v2 = hdr ? unb64(hdr) : null; const src = v2 || body || {};
  const version = Number(src.x402Version || (v2 ? 2 : 1));
  const accepts = (Array.isArray(src.accepts) ? src.accepts : []).map(a => ({
    raw: a, scheme: a.scheme, network: a.network, amount: String(a.amount ?? a.maxAmountRequired ?? ''), payTo: a.payTo, asset: a.asset,
    resource: a.resource || src.resource?.url || null, description: a.description || src.resource?.description || null, maxTimeoutSeconds: a.maxTimeoutSeconds || 60, extra: a.extra || {},
  }));
  return {version, accepts, error: src.error || null, bodyPreview: v2 ? null : text.slice(0, 400)};
}

export async function probe(url, method = 'GET', body) {
  if (!/^https:\/\//.test(url)) throw new Error('URL_MUST_BE_HTTPS');
  const res = await fetch(url, {method, headers: body ? {'content-type': 'application/json'} : {}, body: body ? JSON.stringify(body) : undefined});
  if (res.status !== 402) return {status: res.status, paid: false, needsPayment: false, preview: (await res.text()).slice(0, 600)};
  const req = await readRequirements(res);
  return {status: 402, needsPayment: true, x402Version: req.version, error: req.error,
    options: req.accepts.map(a => { let human = null; try { human = fmt(BigInt(a.amount)) + ' (base units ' + a.amount + ')'; } catch { /* */ } return {scheme: a.scheme, network: a.network, amount: human, payTo: a.payTo, asset: a.asset, description: a.description}; })};
}

export async function pay(url, {method = 'GET', body, maxUsdc} = {}) {
  const cfg = agentConfig();
  if (!cfg.payEnabled) throw new Error('AGENT_PAY_DISABLED: set AGENT_PRIVATE_KEY and MCP_TOKEN in Vercel (test wallet only)');
  const account = privateKeyToAccount(normKey(process.env.AGENT_PRIVATE_KEY));
  const first = await fetch(url, {method, headers: body ? {'content-type': 'application/json'} : {}, body: body ? JSON.stringify(body) : undefined});
  if (first.status !== 402) return {status: first.status, paid: false, note: 'No payment was required', preview: (await first.text()).slice(0, 800)};
  const req = await readRequirements(first);
  const limit = units(maxUsdc && units(maxUsdc) < units(cfg.maxPerCall) ? maxUsdc : cfg.maxPerCall);
  const pick = req.accepts.find(a => { if (a.scheme !== 'exact') return false; let n; try { n = netOf(a.network); } catch { return false; }
    return cfg.networks.includes(n.key) && a.asset?.toLowerCase() === n.usdc.toLowerCase() && BigInt(a.amount || 0) > 0n && BigInt(a.amount) <= limit; });
  if (!pick) throw new Error(`NO_ACCEPTABLE_OPTION: need scheme "exact", USDC on ${cfg.networks.join('/')}, amount ≤ ${fmt(limit)} USDC. Offered: ${JSON.stringify(req.accepts.map(a => [a.scheme, a.network, a.amount]))}`);
  const net = netOf(pick.network); const now = Math.floor(Date.now() / 1000);
  const nonce = '0x' + [...crypto.getRandomValues(new Uint8Array(32))].map(b => b.toString(16).padStart(2, '0')).join('');
  const authorization = {from: account.address, to: pick.payTo, value: pick.amount, validAfter: '0', validBefore: String(now + Math.min(600, pick.maxTimeoutSeconds || 60)), nonce};
  const signature = await account.signTypedData({
    domain: {name: pick.extra.name || net.usdcName, version: pick.extra.version || '2', chainId: net.chainId, verifyingContract: pick.asset},
    types: {TransferWithAuthorization: [{name: 'from', type: 'address'}, {name: 'to', type: 'address'}, {name: 'value', type: 'uint256'}, {name: 'validAfter', type: 'uint256'}, {name: 'validBefore', type: 'uint256'}, {name: 'nonce', type: 'bytes32'}]},
    primaryType: 'TransferWithAuthorization',
    message: {...authorization, value: BigInt(authorization.value), validAfter: 0n, validBefore: BigInt(authorization.validBefore)},
  });
  const headers = {...(body ? {'content-type': 'application/json'} : {})};
  if (req.version >= 2) headers['PAYMENT-SIGNATURE'] = b64({x402Version: 2, scheme: 'exact', network: pick.network, accepted: pick.raw, payload: {signature, authorization}});
  else headers['X-PAYMENT'] = b64({x402Version: 1, scheme: 'exact', network: pick.network, payload: {signature, authorization}});
  const second = await fetch(url, {method, headers, body: body ? JSON.stringify(body) : undefined});
  const receipt = second.headers.get('payment-response') || second.headers.get('x-payment-response');
  return {status: second.status, paid: second.ok, network: net.key, amount: fmt(BigInt(pick.amount)) + ' USDC', payTo: pick.payTo, from: account.address,
    receipt: receipt ? (unb64(receipt) || receipt) : null, preview: (await second.text()).slice(0, 1500)};
}
