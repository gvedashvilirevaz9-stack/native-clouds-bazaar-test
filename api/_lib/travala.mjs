// Travala inside the Bazaar: hotels (2.2M+) searched and booked here, paid from the person's own wallet (USDC on Base, x402).
// Same public endpoints as Travala's own agent CLI (@travalanpm/travel-cli): no key for search; booking is x402-paywalled.
// There is no sandbox: test with a free-cancellation rate and cancel right after.
//   POST ?op=hotels   {location, checkIn, checkOut, rooms:["2"], minPrice?, maxPrice?, limit?, filters?}
//   POST ?op=packages {hotelId, sessionId, checkIn, checkOut, rooms, filters?}
//   POST ?op=book-start  {package_id, session_id, contact:{given_name, sur_name, email, phone}} → requirements to sign
//   POST ?op=book-finish {package_id, session_id, contact, requirements, authorization, signature, version}
//   GET  ?op=status&package_id=&session_id=      (did a booking go through? never pay twice)
//   POST ?op=manage {bookingId, lastName, email}   POST ?op=cancel {bookingId, lastName, email}
import crypto from 'node:crypto';
import {readRequirements} from './x402.mjs';

// ---- Official route: Travel MCP with the person's own Travala login (OAuth 2.1 + PKCE, dynamic client registration) ----
const MCP = 'https://travel-mcp.travala.com';
const ck = (req) => Object.fromEntries(String(req.headers.cookie || '').split(';').map(c => c.trim().split('=')).filter(x => x[0]).map(([k, ...v]) => [k, decodeURIComponent(v.join('='))]));
const host = (req) => String(req.headers['x-forwarded-host'] || req.headers.host || '').split(',')[0].trim();
const cookie = (name, val, age) => `${name}=${encodeURIComponent(val)}; Path=/api/x/travala; HttpOnly; Secure; SameSite=Lax; Max-Age=${age}`;
const b64u = (buf) => Buffer.from(buf).toString('base64url');
async function mcpCall(token, method, params) {
  const h = {'Content-Type': 'application/json', Accept: 'application/json, text/event-stream', Authorization: 'Bearer ' + token};
  const read = async (r) => { const t = await r.text(); if ((r.headers.get('content-type') || '').includes('event-stream')) { const d = t.split('\n').filter(l => l.startsWith('data:')).map(l => l.slice(5).trim()).filter(Boolean).pop(); return d ? JSON.parse(d) : {}; } try { return JSON.parse(t); } catch { return {raw: t.slice(0, 500)}; } };
  const init = await fetch(MCP + '/mcp', {method: 'POST', headers: h, body: JSON.stringify({jsonrpc: '2.0', id: 1, method: 'initialize', params: {protocolVersion: '2025-06-18', capabilities: {}, clientInfo: {name: 'Native Clouds Bazaar', version: '1.0'}}}), signal: AbortSignal.timeout(20000)});
  if (init.status === 401) throw Object.assign(new Error('TRAVALA_LOGIN_REQUIRED'), {status: 401});
  const sid = init.headers.get('mcp-session-id'); await read(init); const hs = sid ? {...h, 'Mcp-Session-Id': sid} : h;
  await fetch(MCP + '/mcp', {method: 'POST', headers: hs, body: JSON.stringify({jsonrpc: '2.0', method: 'notifications/initialized'})}).catch(() => null);
  const r = await fetch(MCP + '/mcp', {method: 'POST', headers: hs, body: JSON.stringify({jsonrpc: '2.0', id: 2, method, params}), signal: AbortSignal.timeout(28000)});
  if (r.status === 401) throw Object.assign(new Error('TRAVALA_LOGIN_REQUIRED'), {status: 401});
  return read(r);
}

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
    if (op === 'login') { // start: register our app (no key needed), PKCE, then send the person to Travala's own login/consent page
      const redirect = `https://${host(req)}/api/x/travala?op=callback`;
      let client = ck(req).tv_client;
      if (!client) { const r = await fetch(MCP + '/oauth/register', {method: 'POST', headers: {'Content-Type': 'application/json'}, body: JSON.stringify({client_name: 'Native Clouds Bazaar', redirect_uris: [redirect], grant_types: ['authorization_code', 'refresh_token'], response_types: ['code'], token_endpoint_auth_method: 'none', scope: 'mcp:read mcp:book mcp:pay mcp:cancel'})});
        const j = await r.json().catch(() => ({})); if (!j.client_id) return res.status(502).json({error: 'REGISTER_FAILED', status: r.status, detail: j}); client = j.client_id; }
      const verifier = b64u(crypto.randomBytes(32)), state = b64u(crypto.randomBytes(16));
      const challenge = b64u(crypto.createHash('sha256').update(verifier).digest());
      res.setHeader('Set-Cookie', [cookie('tv_client', client, 3e7), cookie('tv_pkce', JSON.stringify({verifier, state, redirect}), 900)]);
      const url = `${MCP}/oauth/authorize?${new URLSearchParams({response_type: 'code', client_id: client, redirect_uri: redirect, code_challenge: challenge, code_challenge_method: 'S256', state, scope: 'mcp:read mcp:book mcp:pay mcp:cancel', resource: MCP + '/mcp'})}`;
      res.statusCode = 302; res.setHeader('Location', url); return res.end();
    }
    if (op === 'callback') {
      const c = ck(req); let p = {}; try { p = JSON.parse(c.tv_pkce || '{}'); } catch { /* */ }
      const page = (ok, msg) => { res.setHeader('Content-Type', 'text/html; charset=utf-8'); return res.end(`<!doctype html><meta charset=utf-8><body style="font:16px system-ui;padding:40px;text-align:center">${ok ? '✓ Travala подключена. Окно можно закрыть.' : '✗ ' + String(msg).replace(/[<>&]/g, '')}<script>try{opener&&opener.postMessage({source:'travala',ok:${ok ? 'true' : 'false'}},location.origin)}catch(e){};setTimeout(()=>close(),${ok ? 900 : 6000})</script>`); };
      if (!q.code || q.state !== p.state) return page(false, q.error_description || q.error || 'Вход отменён или устарел. Попробуйте ещё раз.');
      const r = await fetch(MCP + '/oauth/token', {method: 'POST', headers: {'Content-Type': 'application/x-www-form-urlencoded'}, body: new URLSearchParams({grant_type: 'authorization_code', code: String(q.code), redirect_uri: p.redirect, client_id: c.tv_client, code_verifier: p.verifier, resource: MCP + '/mcp'})});
      const j = await r.json().catch(() => ({})); if (!j.access_token) return page(false, 'Travala не выдала доступ: ' + (j.error_description || j.error || r.status));
      res.setHeader('Set-Cookie', [cookie('tv_at', j.access_token, Math.max(60, (j.expires_in || 3600) - 60)), ...(j.refresh_token ? [cookie('tv_rt', j.refresh_token, 3e7)] : []), cookie('tv_pkce', '', 0)]);
      return page(true);
    }
    if (op === 'me') { const c = ck(req); return res.status(200).json({connected: !!c.tv_at, canRefresh: !!c.tv_rt}); }
    if (op === 'logout') { res.setHeader('Set-Cookie', [cookie('tv_at', '', 0), cookie('tv_rt', '', 0)]); return res.status(200).json({connected: false}); }
    if (op === 'tools' || op === 'call') {
      const c = ck(req); let token = c.tv_at;
      if (!token && c.tv_rt && c.tv_client) { const r = await fetch(MCP + '/oauth/token', {method: 'POST', headers: {'Content-Type': 'application/x-www-form-urlencoded'}, body: new URLSearchParams({grant_type: 'refresh_token', refresh_token: c.tv_rt, client_id: c.tv_client})});
        const j = await r.json().catch(() => ({})); if (j.access_token) { token = j.access_token; res.setHeader('Set-Cookie', [cookie('tv_at', token, Math.max(60, (j.expires_in || 3600) - 60)), ...(j.refresh_token ? [cookie('tv_rt', j.refresh_token, 3e7)] : [])]); } }
      if (!token) return res.status(401).json({error: 'TRAVALA_LOGIN_REQUIRED'});
      try {
        const j = op === 'tools' ? await mcpCall(token, 'tools/list', {}) : await mcpCall(token, 'tools/call', {name: String(b.name || ''), arguments: b.arguments || {}});
        return res.status(200).json(j.result || j);
      } catch (e) { return res.status(e.status || 502).json({error: String(e.message || e)}); }
    }
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
