// Cabin (flights, 500+ airlines) inside the Bazaar. Independent small service — search is free; booking returns a USDC
// deposit address on Base that the person pays from their own wallet (a normal transfer they confirm).
//   POST ?op=search {from, to, date, return_date?, adults?}    POST ?op=book {offer_id, search_id, passengers:[…]}
//   GET  ?op=status&id=CBN-…
const API = 'https://api.cabin.team';
const body = (req) => (typeof req.body === 'string' ? (() => { try { return JSON.parse(req.body); } catch { return {}; } })() : req.body || {});
const iata = (v) => String(v || '').toUpperCase().replace(/[^A-Z]/g, '').slice(0, 3);
const date = (v) => /^\d{4}-\d{2}-\d{2}$/.test(String(v || '')) ? String(v) : null;
async function out(res, r) { const t = await r.text(); let j; try { j = JSON.parse(t); } catch { j = {raw: t.slice(0, 800)}; } return res.status(r.ok ? 200 : r.status).json(r.ok ? j : {error: 'CABIN_' + r.status, detail: j}); }
const call = (path, json) => fetch(API + path, {method: json ? 'POST' : 'GET', headers: {'Content-Type': 'application/json', Accept: 'application/json'}, body: json ? JSON.stringify(json) : undefined, signal: AbortSignal.timeout(28000)});
export default async function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store');
  const q = req.query || {}; const op = String(q.op || ''); const b = body(req);
  try {
    if (op === 'search') {
      const from = iata(b.from), to = iata(b.to); if (from.length !== 3 || to.length !== 3 || !date(b.date)) return res.status(400).json({error: 'FROM_TO_DATE_REQUIRED'});
      return out(res, await call('/v1/search', {from, to, date: b.date, ...(date(b.return_date) ? {return_date: b.return_date} : {}), adults: Math.min(6, Math.max(1, +b.adults || 1))}));
    }
    if (op === 'book') {
      const p = (Array.isArray(b.passengers) ? b.passengers : []).slice(0, 6).map(x => ({type: 'adult', given_name: String(x.given_name || '').slice(0, 60), family_name: String(x.family_name || '').slice(0, 60),
        email: String(x.email || '').slice(0, 120), born_on: date(x.born_on), gender: x.gender === 'f' ? 'f' : 'm', ...(x.phone_number ? {phone_number: String(x.phone_number).slice(0, 30)} : {})}));
      if (!b.offer_id || !b.search_id || !p.length || p.some(x => !x.given_name || !x.family_name || !/@/.test(x.email) || !x.born_on)) return res.status(400).json({error: 'PASSENGER_REQUIRED'});
      return out(res, await call('/v1/book', {offer_id: String(b.offer_id), search_id: String(b.search_id), passengers: p}));
    }
    if (op === 'status') return out(res, await call('/v1/booking/' + encodeURIComponent(String(q.id || '').slice(0, 40))));
    return res.status(404).json({error: 'UNKNOWN_OP'});
  } catch (e) { return res.status(500).json({error: 'CABIN_ERROR', message: String(e?.message || e).slice(0, 200)}); }
}
