// Travala inside the Bazaar: hotels (2.2M+) searched and booked here, paid from the person's own wallet (USDC on Base, x402).
// Same public endpoints as Travala's own agent CLI (@travalanpm/travel-cli): no key for search; booking is x402-paywalled.
// There is no sandbox: test with a free-cancellation rate and cancel right after.
//   POST ?op=hotels   {location, checkIn, checkOut, rooms:["2"], minPrice?, maxPrice?, limit?, filters?}
//   POST ?op=packages {hotelId, sessionId, checkIn, checkOut, rooms, filters?}
//   POST ?op=book-start  {package_id, session_id, contact:{given_name, sur_name, email, phone}} → requirements to sign
//   POST ?op=book-finish {package_id, session_id, contact, requirements, authorization, signature, version}
//   GET  ?op=status&package_id=&session_id=      (did a booking go through? never pay twice)
//   POST ?op=manage {bookingId, lastName, email}   POST ?op=cancel {bookingId, lastName, email}
import {readRequirements} from './x402.mjs';

const API = 'https://api.travala.com', PAY = 'https://payment-mcp.travala.com';
const UA = 'native-clouds-bazaar/1.0 (+https://native-clouds-bazaar-test.vercel.app)';
const b64 = (o) => Buffer.from(JSON.stringify(o)).toString('base64');
const unb64 = (s) => { try { return JSON.parse(Buffer.from(s, 'base64').toString('utf8')); } catch { return null; } };
const body = (req) => (typeof req.body === 'string' ? (() => { try { return JSON.parse(req.body); } catch { return {}; } })() : req.body || {});
const str = (v, n = 120) => String(v ?? '').slice(0, n);
const date = (v) => /^\d{4}-\d{2}-\d{2}$/.test(String(v || '')) ? String(v) : null;
const rooms = (v) => (Array.isArray(v) ? v : ['2']).slice(0, 4).map(r => str(r, 20).replace(/[^\d,]/g, '')).filter(Boolean);
const contact = (c = {}) => ({given_name: str(c.given_name, 60), sur_name: str(c.sur_name, 60), email: str(c.email, 120), phone: str(c.phone, 30).replace(/[^\d+]/g, '')});
async function call(url, {method = 'POST', json, headers = {}} = {}) {
  return fetch(url, {method, headers: {'Content-Type': 'application/json', Accept: 'application/json', 'User-Agent': UA, ...headers}, body: json !== undefined ? JSON.stringify(json) : undefined, signal: AbortSignal.timeout(28000)});
}
async function out(res, r) { const t = await r.text(); let j; try { j = JSON.parse(t); } catch { j = {raw: t.slice(0, 800)}; } return res.status(r.ok ? 200 : r.status).json(r.ok ? j : {error: 'TRAVALA_' + r.status, detail: j}); }
const bookUrl = (b) => `${PAY}/m2m-payment/book/v2?${new URLSearchParams({package_id: str(b.package_id, 200), session_id: str(b.session_id, 200)})}`;

export default async function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store');
  const q = req.query || {}; const op = String(q.op || ''); const b = body(req);
  try {
    if (op === 'hotels') {
      if (!b.location || !date(b.checkIn) || !date(b.checkOut)) return res.status(400).json({error: 'LOCATION_AND_DATES_REQUIRED'});
      return out(res, await call(API + '/searching/mcp/search-hotel', {json: {location: str(b.location, 80), checkIn: b.checkIn, checkOut: b.checkOut, rooms: rooms(b.rooms),
        ...(Number.isFinite(+b.lat) && b.lat !== '' && b.lat != null ? {lat: +b.lat, lng: +b.lng} : {}), ...(b.minPrice ? {minPrice: +b.minPrice} : {}), ...(b.maxPrice ? {maxPrice: +b.maxPrice} : {}),
        limit: Math.min(20, Math.max(1, +b.limit || 12)), ...(Array.isArray(b.filters) && b.filters.length ? {filters: b.filters.slice(0, 4).map(f => str(f, 30))} : {})}}));
    }
    if (op === 'packages') {
      if (!b.hotelId || !b.sessionId || !date(b.checkIn) || !date(b.checkOut)) return res.status(400).json({error: 'BAD_INPUT'});
      return out(res, await call(API + '/searching/mcp/search-package', {json: {hotelId: str(b.hotelId, 80), sessionId: str(b.sessionId, 200), checkIn: b.checkIn, checkOut: b.checkOut, rooms: rooms(b.rooms),
        ...(Array.isArray(b.filters) && b.filters.length ? {filters: b.filters.slice(0, 4).map(f => str(f, 30))} : {})}}));
    }
    if (op === 'book-start') {
      const c = contact(b.contact); if (!c.given_name || !c.sur_name || !/@/.test(c.email) || c.phone.length < 7) return res.status(400).json({error: 'CONTACT_REQUIRED'});
      const r = await call(bookUrl(b), {json: {contact: c}});
      if (r.status !== 402) return out(res, r);
      const rq = await readRequirements(r);
      const pick = rq.accepts.find(a => a.scheme === 'exact' && /8453$|^base$/.test(String(a.network)) && String(a.asset).toLowerCase() === '0x833589fcd6edb6e08f4c7c32d4f71b54bda02913');
      if (!pick) return res.status(502).json({error: 'NO_BASE_USDC_OPTION', offered: rq.accepts.map(a => [a.scheme, a.network, a.amount])});
      return res.status(200).json({version: rq.version, requirements: pick.raw, amount: pick.amount, payTo: pick.payTo, asset: pick.asset, network: pick.network, name: pick.extra?.name || 'USD Coin', tokenVersion: pick.extra?.version || '2', maxTimeoutSeconds: pick.maxTimeoutSeconds || 300, description: pick.description});
    }
    if (op === 'book-finish') {
      const {requirements, authorization, signature, version} = b; if (!requirements || !authorization || !signature) return res.status(400).json({error: 'BAD_INPUT'});
      const headers = Number(version) >= 2 ? {'PAYMENT-SIGNATURE': b64({x402Version: 2, scheme: 'exact', network: requirements.network, accepted: requirements, payload: {signature, authorization}})}
        : {'X-PAYMENT': b64({x402Version: 1, scheme: 'exact', network: requirements.network, payload: {signature, authorization}})};
      const r = await call(bookUrl(b), {json: {contact: contact(b.contact)}, headers});
      const receipt = r.headers.get('payment-response') || r.headers.get('x-payment-response');
      const t = await r.text(); let j; try { j = JSON.parse(t); } catch { j = {raw: t.slice(0, 800)}; }
      return res.status(r.ok ? 200 : r.status).json({...j, receipt: receipt ? unb64(receipt) || receipt : null, ...(r.ok ? {} : {error: 'BOOK_' + r.status})});
    }
    if (op === 'status') return out(res, await call(`${PAY}/m2m-payment/book/status?${new URLSearchParams({package_id: str(q.package_id, 200), session_id: str(q.session_id, 200)})}`, {method: 'GET'}));
    if (op === 'manage' || op === 'cancel') {
      if (!b.bookingId || !b.lastName || !b.email) return res.status(400).json({error: 'BAD_INPUT'});
      return out(res, await call(API + (op === 'manage' ? '/orders/mcp/manage-booking' : '/orders/mcp/cancel-booking'), {json: {bookingId: str(b.bookingId, 40), lastName: str(b.lastName, 60), email: str(b.email, 120)}}));
    }
    return res.status(404).json({error: 'UNKNOWN_OP'});
  } catch (e) { return res.status(500).json({error: 'TRAVALA_ERROR', message: String(e?.message || e).slice(0, 200)}); }
}
