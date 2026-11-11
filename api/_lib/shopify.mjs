// Shopify Storefront API (read-only product search) for ONE store you configure in Vercel env:
//   SHOPIFY_STORE_DOMAIN=your-store.myshopify.com   SHOPIFY_STOREFRONT_TOKEN=...   (optional) SHOPIFY_API_VERSION
// Checkout stays on Shopify: each product comes with its page URL (pay route "link").
export const shopifyConfigured = () => !!(process.env.SHOPIFY_STORE_DOMAIN && process.env.SHOPIFY_STOREFRONT_TOKEN);

export async function shopifySearch(q, first = 10) {
  if (!shopifyConfigured()) throw new Error('SHOPIFY_NOT_CONFIGURED: set SHOPIFY_STORE_DOMAIN and SHOPIFY_STOREFRONT_TOKEN in Vercel');
  const domain = process.env.SHOPIFY_STORE_DOMAIN.replace(/^https?:\/\//, '').replace(/\/.*$/, '');
  const version = process.env.SHOPIFY_API_VERSION || '2026-07';
  const query = `query($q:String!,$n:Int!){products(first:$n,query:$q){edges{node{id title handle description onlineStoreUrl featuredImage{url} priceRange{minVariantPrice{amount currencyCode}} availableForSale}}}}`;
  const r = await fetch(`https://${domain}/api/${version}/graphql.json`, {method: 'POST', headers: {'content-type': 'application/json', 'X-Shopify-Storefront-Access-Token': process.env.SHOPIFY_STOREFRONT_TOKEN}, body: JSON.stringify({query, variables: {q: String(q || ''), n: Math.min(50, Math.max(1, +first || 10))}})});
  const j = await r.json(); if (!r.ok || j.errors) throw new Error('SHOPIFY: ' + (j.errors ? JSON.stringify(j.errors).slice(0, 300) : 'HTTP_' + r.status));
  return {store: domain, apiVersion: version, items: j.data.products.edges.map(({node: p}) => ({
    id: p.id, title: p.title, text: (p.description || '').slice(0, 300), price: p.priceRange?.minVariantPrice?.amount || null, currency: p.priceRange?.minVariantPrice?.currencyCode || null,
    available: p.availableForSale, image: p.featuredImage?.url || null, url: p.onlineStoreUrl || `https://${domain}/products/${p.handle}`, pay: {kind: 'link', url: p.onlineStoreUrl || `https://${domain}/products/${p.handle}`},
  }))};
}

// Public search of ANY Shopify store by its address — no token. Uses the store's own open endpoints
// (/search/suggest.json, fallback /products.json). Some stores switch these off; then the tool says so.
const clean = (d) => String(d || '').trim().replace(/^https?:\/\//, '').replace(/\/.*$/, '').toLowerCase();
const money = (v) => v == null ? null : String(v).includes('.') ? String(v) : (Number(v) / 100).toFixed(2);
export async function shopifyPublicSearch(store, q, limit = 10) {
  const d = clean(store); if (!/^[a-z0-9.-]+\.[a-z]{2,}$/.test(d)) throw new Error('BAD_STORE: give a domain like shop.example.com');
  const n = Math.min(20, Math.max(1, +limit || 10)); const ua = {headers: {accept: 'application/json', 'user-agent': 'NativeCloudsBazaar/0.1'}};
  try {
    const r = await fetch(`https://${d}/search/suggest.json?q=${encodeURIComponent(q)}&resources[type]=product&resources[limit]=${n}`, ua);
    if (r.ok) { const j = await r.json(); const ps = j?.resources?.results?.products;
      if (Array.isArray(ps)) return {store: d, via: 'search/suggest.json', items: ps.map(p => ({title: p.title, price: money(p.price), available: p.available, image: p.image || p.featured_image?.url || null, url: p.url?.startsWith('http') ? p.url.split('?')[0] : `https://${d}${(p.url || '').split('?')[0]}`, vendor: p.vendor || null, pay: {kind: 'link'}}))}; }
  } catch { /* try next */ }
  const r = await fetch(`https://${d}/products.json?limit=250`, ua);
  if (!r.ok) throw new Error(`STORE_SEARCH_CLOSED: ${d} answered HTTP ${r.status} — store may not be Shopify or has public search off`);
  const j = await r.json(); const words = String(q).toLowerCase().split(/\s+/).filter(Boolean);
  const items = (j.products || []).filter(p => words.every(w => `${p.title} ${p.product_type} ${p.vendor} ${(p.tags || []).join(' ')}`.toLowerCase().includes(w))).slice(0, n)
    .map(p => ({title: p.title, price: p.variants?.[0]?.price || null, available: p.variants?.some(v => v.available) ?? null, image: p.images?.[0]?.src || null, url: `https://${d}/products/${p.handle}`, vendor: p.vendor || null, pay: {kind: 'link'}}));
  return {store: d, via: 'products.json', items};
}
