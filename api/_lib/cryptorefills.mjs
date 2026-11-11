// Cryptorefills inside the Bazaar: 10,500+ gift cards, mobile top-ups and eSIMs in 180+ countries, no account, no key.
// Public x402 REST (x402.cryptorefills.com): brands → catalog → order (two-phase: 402 → signed USDC authorization) → poll delivery.
//   GET  ?op=brands&country=ge            GET ?op=catalog&country=ge&brand=Magti
//   POST ?op=order-start  {email, items:[{product_id, beneficiary_account, product_value?}]}  → requirements to sign
//   POST ?op=order-finish {email, items, requirements, authorization, signature, version, sessionId}
//   GET  ?op=order&id=&token=
import {readRequirements} from './x402.mjs';
const API = 'https://x402.cryptorefills.com';
const b64 = (o) => Buffer.from(JSON.stringify(o)).toString('base64');
const unb64 = (s) => { try { return JSON.parse(Buffer.from(s, 'base64').toString('utf8')); } catch { return null; } };
const body = (req) => (typeof req.body === 'string' ? (() => { try { return JSON.parse(req.body); } catch { return {}; } })() : req.body || {});
const cc = (v) => String(v || '').toLowerCase().replace(/[^a-z]/g, '').slice(0, 2);
const items = (v) => (Array.isArray(v) ? v : []).slice(0, 3).map(i => ({product_id: String(i.product_id || ''), beneficiary_account: String(i.beneficiary_account || '').slice(0, 120), ...(i.product_value ? {product_value: String(i.product_value).slice(0, 20)} : {})}));
async function out(res, r) { const t = await r.text(); let j; try { j = JSON.parse(t); } catch { j = {raw: t.slice(0, 800)}; } return res.status(r.ok ? 200 : r.status).json(r.ok ? j : {error: 'CRYPTOREFILLS_' + r.status, detail: j}); }
const call = (path, {method = 'GET', json, headers = {}} = {}) => fetch(API + path, {method, headers: {Accept: 'application/json', ...(json ? {'Content-Type': 'application/json'} : {}), 'X-Preferred-Network': 'base', ...headers}, body: json ? JSON.stringify(json) : undefined, signal: AbortSignal.timeout(28000)});
export default async function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store');
  const q = req.query || {}; const op = String(q.op || ''); const b = body(req);
  try {
    if (op === 'brands') return out(res, await call(`/v1/brands?country_code=${cc(q.country) || 'us'}`));
    if (op === 'catalog') return out(res, await call(`/v1/catalog?${new URLSearchParams({country_code: cc(q.country) || 'us', brand_name: String(q.brand || '').slice(0, 80)})}`));
    if (op === 'order-start') {
      if (!/@/.test(String(b.email || '')) || !items(b.items).length || items(b.items).some(i => !i.product_id || !i.beneficiary_account)) return res.status(400).json({error: 'EMAIL_AND_ITEM_REQUIRED'});
      const r = await call('/v1/orders', {method: 'POST', json: {email: String(b.email).slice(0, 120), items: items(b.items)}});
      if (r.status !== 402) return out(res, r);
      const sessionId = r.headers.get('x-session-id'); const rq = await readRequirements(r);
      const pick = rq.accepts.find(a => a.scheme === 'exact' && /8453$|^base$/.test(String(a.network)) && String(a.asset).toLowerCase() === '0x833589fcd6edb6e08f4c7c32d4f71b54bda02913');
      if (!pick) return res.status(502).json({error: 'NO_BASE_USDC_OPTION', offered: rq.accepts.map(a => [a.scheme, a.network, a.amount])});
      return res.status(200).json({version: rq.version, sessionId, requirements: pick.raw, amount: pick.amount, payTo: pick.payTo, asset: pick.asset, network: pick.network, name: pick.extra?.name || 'USD Coin', tokenVersion: pick.extra?.version || '2', maxTimeoutSeconds: pick.maxTimeoutSeconds || 600});
    }
    if (op === 'order-finish') {
      const {requirements, authorization, signature, version, sessionId} = b; if (!requirements || !authorization || !signature) return res.status(400).json({error: 'BAD_INPUT'});
      const headers = {...(sessionId ? {'X-Session-Id': String(sessionId)} : {}), ...(Number(version) >= 2 ? {'PAYMENT-SIGNATURE': b64({x402Version: 2, scheme: 'exact', network: requirements.network, accepted: requirements, payload: {signature, authorization}})}
        : {'X-PAYMENT': b64({x402Version: 1, scheme: 'exact', network: requirements.network, payload: {signature, authorization}})})};
      const r = await call('/v1/orders', {method: 'POST', json: {email: String(b.email || '').slice(0, 120), items: items(b.items)}, headers});
      const receipt = r.headers.get('payment-response') || r.headers.get('x-payment-response');
      const t = await r.text(); let j; try { j = JSON.parse(t); } catch { j = {raw: t.slice(0, 800)}; }
      return res.status(r.ok ? 200 : r.status).json({...j, receipt: receipt ? unb64(receipt) || receipt : null, ...(r.ok ? {} : {error: 'ORDER_' + r.status})});
    }
    if (op === 'order') return out(res, await call(`/v1/orders/${encodeURIComponent(String(q.id || '').slice(0, 80))}?token=${encodeURIComponent(String(q.token || '').slice(0, 300))}`));
    return res.status(404).json({error: 'UNKNOWN_OP'});
  } catch (e) { return res.status(500).json({error: 'CRYPTOREFILLS_ERROR', message: String(e?.message || e).slice(0, 200)}); }
}
