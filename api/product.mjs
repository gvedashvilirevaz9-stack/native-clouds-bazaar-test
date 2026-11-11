// GET /api/product?url=<product page> — full details for the popup. Shopify: <url>.js (public on every Shopify store).
// WooCommerce: Store API by slug. Returns images, description, options, variants, prices.
const strip = (h) => String(h || '').replace(/<[^>]+>/g, ' ').replace(/&#8217;/g, '’').replace(/&amp;/g, '&').replace(/&nbsp;/g, ' ').replace(/\s+/g, ' ').trim();
const abs = (u) => !u ? null : u.startsWith('//') ? 'https:' + u : u;
export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*'); res.setHeader('Cache-Control', 's-maxage=900');
  const raw = new URL(req.url, 'http://x').searchParams.get('url') || '';
  let u; try { u = new URL(raw); } catch { return res.status(200).json({error: 'BAD_URL'}); }
  if (u.protocol !== 'https:') return res.status(200).json({error: 'BAD_URL'});
  const H = {headers: {accept: 'application/json', 'user-agent': 'NativeCloudsBazaar/0.1'}, signal: AbortSignal.timeout(8000)};
  try {
    const m = u.pathname.match(/\/products\/([^/?#]+)/);
    if (m) { // Shopify
      const r = await fetch(`${u.origin}/products/${m[1]}.js`, H);
      if (r.ok) { const p = await r.json(); const v = p.variants || [];
        return res.status(200).json({kind: 'shopify', title: p.title, vendor: p.vendor || null, images: (p.images || []).map(abs).slice(0, 20), description: strip(p.description).slice(0, 2000),
          price: (p.price / 100).toFixed(2), compareAt: p.compare_at_price && p.compare_at_price > p.price ? (p.compare_at_price / 100).toFixed(2) : null, available: p.available,
          options: (p.options || []).map(o => ({name: o.name, values: o.values})), variants: v.slice(0, 60).map(x => ({title: x.title, price: (x.price / 100).toFixed(2), available: x.available}))}); }
    }
    const slug = (u.pathname.match(/\/product\/([^/?#]+)/) || [])[1];
    if (slug) { // WooCommerce
      const r = await fetch(`${u.origin}/wp-json/wc/store/v1/products?slug=${encodeURIComponent(slug)}`, H);
      if (r.ok) { const [p] = await r.json(); if (p) { const pr = p.prices || {}; const minor = Number(pr.currency_minor_unit ?? 2); const mm = (x) => x ? (Number(x) / 10 ** minor).toFixed(2) : null;
        return res.status(200).json({kind: 'woo', title: strip(p.name), images: (p.images || []).map(i => i.src).slice(0, 20), description: strip(p.description || p.short_description).slice(0, 2000),
          price: mm(pr.price), compareAt: pr.regular_price !== pr.price ? mm(pr.regular_price) : null, currency: pr.currency_code, available: p.is_in_stock, rating: Number(p.average_rating) || null, reviews: p.review_count || null,
          options: (p.attributes || []).map(a => ({name: a.name, values: (a.terms || []).map(t => t.name)})).filter(o => o.values.length)}); } }
    }
    res.status(200).json({error: 'NO_DETAILS'});
  } catch (e) { res.status(200).json({error: String(e.message).slice(0, 100)}); }
}
