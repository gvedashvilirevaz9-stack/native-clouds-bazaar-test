// Global product search over UCP catalogs — free, no API key (anonymous tier, lowest rate limits).
//   shopify : Shopify Global Catalog — products of all Shopify stores (https://catalog.shopify.com/api/ucp/mcp)
//   channel3: Channel3 UCP catalog — many retailers (https://ucp.trychannel3.com/mcp), anonymous tier
// UCP requires an agent profile URL in meta; default is Shopify's documented example profile (override: UCP_PROFILE_URL).
export const SOURCES = {
  shopify: {name: 'Shopify (все магазины)', url: 'https://catalog.shopify.com/api/ucp/mcp'},
  channel3: {name: 'Channel3 (разные магазины)', url: 'https://ucp.trychannel3.com/mcp'},
};
const PROFILE = process.env.UCP_PROFILE_URL || 'https://shopify.dev/ucp/agent-profiles/examples/2026-08-25/valid-with-capabilities.json';

async function mcpCall(url, name, args) {
  const r = await fetch(url, {method: 'POST', headers: {'content-type': 'application/json', accept: 'application/json, text/event-stream', 'user-agent': 'NativeCloudsBazaar/0.1'},
    body: JSON.stringify({jsonrpc: '2.0', id: 1, method: 'tools/call', params: {name, arguments: args}})});
  const text = await r.text();
  if (!r.ok) throw new Error(`HTTP_${r.status}: ${text.slice(0, 200)}`);
  let j; if (text.trim().startsWith('{')) j = JSON.parse(text); else { const line = text.split('\n').filter(l => l.startsWith('data:')).pop(); j = line ? JSON.parse(line.slice(5)) : null; }
  if (!j) throw new Error('EMPTY_RESPONSE');
  if (j.error) throw new Error('MCP: ' + (j.error.message || JSON.stringify(j.error)).slice(0, 300));
  const res = j.result || {}; if (res.isError) throw new Error('TOOL: ' + (res.content?.[0]?.text || '').slice(0, 300));
  if (res.structuredContent) return res.structuredContent;
  const t = res.content?.find(c => c.type === 'text')?.text; try { return JSON.parse(t); } catch { throw new Error('UNREADABLE: ' + String(t).slice(0, 200)); }
}

const money = (p) => p && p.amount != null ? {amount: (Number(p.amount) / 100).toFixed(2), currency: p.currency || 'USD'} : null;

export async function globalSearch(source, q, {limit = 20, country, maxPrice} = {}) {
  const s = SOURCES[source]; if (!s) throw new Error('UNKNOWN_SOURCE');
  const filters = {available: true}; if (country) filters.ships_to = {country}; if (maxPrice) filters.price = {max: Math.round(Number(maxPrice) * 100)};
  const meta = source === 'shopify' ? {'ucp-agent': {profile: PROFILE}} : null; // Channel3 docs: meta may be null, its own profile is used
  const out = await mcpCall(s.url, 'search_catalog', {meta, catalog: {query: String(q).slice(0, 200), filters, pagination: {limit: Math.min(50, Math.max(1, +limit || 20))}}});
  const items = (out.products || []).map(p => {
    const v = (p.variants || [])[0] || {}; const seller = v.seller || {}; const price = money(v.price) || money(p.price_range?.min);
    const imgs = (p.media || []).filter(m => m.type === 'image' && m.url).map(m => m.url).slice(0, 12);
    const list = money(v.list_price);
    return {title: p.title, price: price?.amount || null, currency: price?.currency || null, image: imgs[0] || null, images: imgs,
      description: String(p.description?.html || p.description?.plain || '').replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 900),
      compareAt: list && Number(list.amount) > Number(price?.amount || 0) ? list.amount : null,
      options: (p.options || []).map(o => ({name: o.name, values: (o.values || []).map(x => typeof x === 'string' ? x : x.label || x.name || x.value).filter(Boolean).slice(0, 24)})).filter(o => o.values.length),
      available: (p.variants || []).some(x => x.availability?.available !== false), reviews: p.rating?.count ?? null,
      url: p.url || v.url || v.checkout_url || seller.url || null, store: seller.name || seller.domain || null, storeDomain: seller.domain || null, rating: p.rating?.value ?? null,
      sellers: new Set((p.variants || []).map(x => x.seller?.domain).filter(Boolean)).size || 1};
  });
  return {source, sourceName: s.name, total: out.pagination?.total_count ?? null, items};
}
