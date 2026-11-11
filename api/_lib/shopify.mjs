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
