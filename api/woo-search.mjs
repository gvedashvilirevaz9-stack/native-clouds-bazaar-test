// GET /api/woo-search?store=example.com&q=… — any WooCommerce store via its public Store API (no key).
export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*'); res.setHeader('Cache-Control', 's-maxage=120');
  const u = new URL(req.url, 'http://x'); const d = (u.searchParams.get('store') || '').trim().replace(/^https?:\/\//, '').replace(/\/.*$/, '').toLowerCase(); const q = (u.searchParams.get('q') || '').slice(0, 100);
  if (!/^[a-z0-9.-]+\.[a-z]{2,}$/.test(d)) return res.status(200).json({error: 'BAD_STORE', items: []});
  try {
    const r = await fetch(`https://${d}/wp-json/wc/store/v1/products?search=${encodeURIComponent(q)}&per_page=24`, {headers: {accept: 'application/json', 'user-agent': 'NativeCloudsBazaar/0.1'}});
    if (!r.ok) return res.status(200).json({store: d, error: `STORE_SEARCH_CLOSED: HTTP ${r.status} — not WooCommerce or Store API is off`, items: []});
    const list = await r.json(); if (!Array.isArray(list)) return res.status(200).json({store: d, error: 'NOT_WOOCOMMERCE', items: []});
    res.status(200).json({store: d, via: 'woocommerce-store-api', items: list.map(p => { const pr = p.prices || {}; const minor = Number(pr.currency_minor_unit ?? 2);
      return {title: String(p.name || '').replace(/<[^>]+>/g, ''), price: pr.price ? (Number(pr.price) / 10 ** minor).toFixed(2) : null, currency: pr.currency_code || null, available: p.is_in_stock ?? null, image: p.images?.[0]?.src || null, url: p.permalink, vendor: null}; })});
  } catch (e) { res.status(200).json({store: d, error: e.message, items: []}); }
}
