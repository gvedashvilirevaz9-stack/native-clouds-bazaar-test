// GET /api/woo-search?store=example.com&q=… — any WooCommerce store via its public Store API (no key).
export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*'); res.setHeader('Cache-Control', 's-maxage=120');
  const u = new URL(req.url, 'http://x'); const d = (u.searchParams.get('store') || '').trim().replace(/^https?:\/\//, '').replace(/\/.*$/, '').toLowerCase(); const q = (u.searchParams.get('q') || '').slice(0, 100);
  if (!/^[a-z0-9.-]+\.[a-z]{2,}$/.test(d)) return res.status(200).json({error: 'BAD_STORE', items: []});
  try {
    const r = await fetch(`https://${d}/wp-json/wc/store/v1/products?search=${encodeURIComponent(q)}&per_page=24`, {headers: {accept: 'application/json', 'user-agent': 'NativeCloudsBazaar/0.1'}});
    if (!r.ok) return res.status(200).json({store: d, error: `STORE_SEARCH_CLOSED: HTTP ${r.status} — not WooCommerce or Store API is off`, items: []});
    const list = await r.json(); if (!Array.isArray(list)) return res.status(200).json({store: d, error: 'NOT_WOOCOMMERCE', items: []});
    res.status(200).json({store: d, via: 'woocommerce-store-api', items: list.map(p => {const pr = p.prices || {}; const minor = Number(pr.currency_minor_unit ?? 2); const m = (x) => x ? (Number(x) / 10 ** minor).toFixed(2) : null; const strip = (h) => String(h || '').replace(/<[^>]+>/g, ' ').replace(/&#8217;/g, '’').replace(/&amp;/g, '&').replace(/&nbsp;/g, ' ').replace(/\s+/g, ' ').trim();
      return {title: strip(p.name), price: m(pr.price), compareAt: pr.regular_price && pr.regular_price !== pr.price ? m(pr.regular_price) : null, currency: pr.currency_code || null, available: p.is_in_stock ?? null,
        image: p.images?.[0]?.src || null, images: (p.images || []).map(i => i.src).filter(Boolean).slice(0, 12), url: p.permalink, description: strip(p.short_description || p.description).slice(0, 900),
        options: (p.attributes || []).map(a => ({name: a.name, values: (a.terms || []).map(t => t.name).slice(0, 24)})).filter(o => o.values.length), rating: p.average_rating ? Number(p.average_rating) || null : null, reviews: p.review_count || null, vendor: null}; })});
  } catch (e) { res.status(200).json({store: d, error: e.message, items: []}); }
}
