// GET /api/woo-check?stores=a.com,b.com — which of these sites answer the public WooCommerce Store API (max 40 per call).
const T = (ms) => AbortSignal.timeout(ms);
async function check(d) {
  try { const r = await fetch(`https://${d}/wp-json/wc/store/v1/products?per_page=1`, {headers: {accept: 'application/json', 'user-agent': 'NativeCloudsBazaar/0.1'}, signal: T(7000), redirect: 'follow'});
    if (!r.ok) return {store: d, ok: false, why: 'HTTP ' + r.status};
    const j = await r.json(); if (!Array.isArray(j)) return {store: d, ok: false, why: 'not a list'};
    const p = j[0]; return {store: d, ok: true, currency: p?.prices?.currency_code || null, sample: p?.name?.replace(/<[^>]+>/g, '').slice(0, 60) || null};
  } catch (e) { return {store: d, ok: false, why: e.name === 'TimeoutError' ? 'timeout' : String(e.message).slice(0, 60)}; }
}
export default async function handler(req, res) {
  const u = new URL(req.url, 'http://x');
  const list = [...new Set((u.searchParams.get('stores') || '').split(',').map(s => s.trim().replace(/^https?:\/\//, '').replace(/\/.*$/, '').toLowerCase()).filter(d => /^[a-z0-9.-]+\.[a-z]{2,}$/.test(d)))].slice(0, 40);
  const out = await Promise.all(list.map(check));
  res.setHeader('Cache-Control', 'no-store'); res.status(200).json({ok: out.filter(x => x.ok).map(x => x.store), results: out});
}
