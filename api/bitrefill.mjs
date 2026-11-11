// Bitrefill inside the Bazaar: gift cards, phone top-ups, eSIMs — paid with the person's own wallet (USDC on Base).
// No Bitrefill account: the wallet signs in (SIWX) and gets a ~2h token; search/detail/invoice are free with it.
// Payment = x402 on invoice/pay: the wallet signs a USDC transfer authorization (it shows amount + receiver), we pass it on.
// This server never holds keys or money; it only forwards requests to api.bitrefill.com.
//   POST ?op=connect-start   {address}              → {message, fields}   (text to sign)
//   POST ?op=connect-finish  {fields, signature}    → {token, expires_in}
//   GET  ?op=search&kind=topups|gift-cards|esims&q=&country=   (X-Access-Token)
//   GET  ?op=detail&slug=
//   POST ?op=create {items:[{product_id, package_value, refill_input?}]}
//   POST ?op=pay-start  {invoice_id}               → {requirements, typedData}   (to sign with eth_signTypedData_v4)
//   POST ?op=pay-finish {invoice_id, requirements, authorization, signature}
//   GET  ?op=status&invoice_id=
import {getAddress, isAddress} from 'viem';
import {createSiweMessage} from 'viem/siwe';
import {readRequirements} from './_lib/x402.mjs';

const API = 'https://api.bitrefill.com';
const b64 = (o) => Buffer.from(JSON.stringify(o)).toString('base64');
const unb64 = (s) => { try { return JSON.parse(Buffer.from(s, 'base64').toString('utf8')); } catch { return null; } };
const body = (req) => (typeof req.body === 'string' ? (() => { try { return JSON.parse(req.body); } catch { return {}; } })() : req.body || {});
const KINDS = new Set(['topups', 'gift-cards', 'esims']);
async function call(path, {method = 'GET', token, json, headers = {}} = {}) {
  const r = await fetch(API + path, {method, headers: {accept: 'application/json', ...(json ? {'content-type': 'application/json'} : {}), ...(token ? {'X-Access-Token': token} : {}), ...headers}, body: json ? JSON.stringify(json) : undefined, signal: AbortSignal.timeout(20000)});
  return r;
}
async function out(res, r) { const text = await r.text(); let j; try { j = JSON.parse(text); } catch { j = {raw: text.slice(0, 600)}; } return res.status(r.status === 402 ? 402 : r.ok ? 200 : r.status).json(r.ok ? j : {error: 'BITREFILL_' + r.status, detail: j}); }

export default async function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store');
  const q = req.query || {}; const op = String(q.op || ''); const token = String(req.headers['x-access-token'] || '') || undefined; const b = body(req);
  try {
    if (op === 'connect-start') {
      if (!isAddress(String(b.address || ''))) return res.status(400).json({error: 'ADDRESS_INVALID'});
      const r = await call('/x402/connect', {method: 'POST', json: {}});
      const text = await r.text(); let j = {}; try { j = JSON.parse(text); } catch { /* */ }
      const hdr = r.headers.get('payment-required'); const v2 = hdr ? unb64(hdr) : null;
      const ext = (v2?.extensions || j.extensions || {})['sign-in-with-x'] || {}; const info = ext.info || ext;
      if (!info?.nonce) return res.status(502).json({error: 'NO_CHALLENGE', status: r.status, detail: (text || JSON.stringify(v2)).slice(0, 800)});
      const address = getAddress(b.address); const now = new Date();
      const fields = {domain: info.domain || 'api.bitrefill.com', address, statement: info.statement || undefined, uri: info.uri || API + '/x402/connect', version: info.version || '1',
        chainId: 'eip155:8453', type: 'eip191', nonce: info.nonce, issuedAt: info.issuedAt || now.toISOString(), expirationTime: info.expirationTime || new Date(now.getTime() + 5 * 60e3).toISOString(), resources: info.resources || undefined};
      const message = createSiweMessage({domain: fields.domain, address, statement: fields.statement, uri: fields.uri, version: '1', chainId: 8453, nonce: fields.nonce,
        issuedAt: new Date(fields.issuedAt), expirationTime: new Date(fields.expirationTime), resources: fields.resources});
      return res.status(200).json({message, fields});
    }
    if (op === 'connect-finish') {
      const {fields, signature} = b; if (!fields?.nonce || !/^0x[0-9a-fA-F]+$/.test(String(signature || ''))) return res.status(400).json({error: 'BAD_INPUT'});
      const r = await call('/x402/connect', {method: 'POST', json: {}, headers: {'sign-in-with-x': b64({...fields, signature})}});
      return out(res, r);
    }
    if (op === 'search') {
      const kind = KINDS.has(q.kind) ? q.kind : 'topups'; const p = new URLSearchParams({q: String(q.q || '').slice(0, 80)}); if (q.country) p.set('country', String(q.country).slice(0, 2).toUpperCase());
      return out(res, await call(`/x402/${kind}/search?${p}`, {token}));
    }
    if (op === 'detail') return out(res, await call(`/x402/products/detail?slug=${encodeURIComponent(String(q.slug || ''))}`, {token}));
    if (op === 'create') {
      const items = (Array.isArray(b.items) ? b.items : []).slice(0, 5).map(i => ({product_id: String(i.product_id), package_value: i.package_value, ...(i.refill_input ? {refill_input: String(i.refill_input).slice(0, 40)} : {})}));
      if (!items.length) return res.status(400).json({error: 'NO_ITEMS'});
      return out(res, await call('/x402/invoice/create', {method: 'POST', token, json: {items}}));
    }
    if (op === 'pay-start') {
      const r = await call('/x402/invoice/pay', {method: 'POST', json: {invoice_id: String(b.invoice_id || '')}});
      if (r.status !== 402) return out(res, r);
      const rq = await readRequirements(r);
      const pick = rq.accepts.find(a => a.scheme === 'exact' && /8453$|^base$/.test(String(a.network)) && String(a.asset).toLowerCase() === '0x833589fcd6edb6e08f4c7c32d4f71b54bda02913');
      if (!pick) return res.status(502).json({error: 'NO_BASE_USDC_OPTION', offered: rq.accepts.map(a => [a.scheme, a.network, a.amount])});
      return res.status(200).json({version: rq.version, requirements: pick.raw, amount: pick.amount, payTo: pick.payTo, asset: pick.asset, network: pick.network, name: pick.extra?.name || 'USD Coin', tokenVersion: pick.extra?.version || '2', maxTimeoutSeconds: pick.maxTimeoutSeconds || 300});
    }
    if (op === 'pay-finish') {
      const {invoice_id, requirements, authorization, signature, version} = b;
      if (!requirements || !authorization || !signature) return res.status(400).json({error: 'BAD_INPUT'});
      const headers = Number(version) >= 2 ? {'PAYMENT-SIGNATURE': b64({x402Version: 2, scheme: 'exact', network: requirements.network, accepted: requirements, payload: {signature, authorization}})}
        : {'X-PAYMENT': b64({x402Version: 1, scheme: 'exact', network: requirements.network, payload: {signature, authorization}})};
      const r = await call('/x402/invoice/pay', {method: 'POST', json: {invoice_id: String(invoice_id || '')}, headers});
      const receipt = r.headers.get('payment-response') || r.headers.get('x-payment-response');
      const text = await r.text(); let j; try { j = JSON.parse(text); } catch { j = {raw: text.slice(0, 600)}; }
      return res.status(r.ok ? 200 : r.status).json({...j, receipt: receipt ? unb64(receipt) || receipt : null, ...(r.ok ? {} : {error: 'PAY_' + r.status})});
    }
    if (op === 'status') return out(res, await call(`/x402/invoice/status?invoice_id=${encodeURIComponent(String(q.invoice_id || ''))}`, {token}));
    return res.status(404).json({error: 'UNKNOWN_OP'});
  } catch (e) { return res.status(500).json({error: 'BITREFILL_ERROR', message: String(e?.message || e).slice(0, 200)}); }
}
