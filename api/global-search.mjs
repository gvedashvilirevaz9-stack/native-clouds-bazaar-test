// GET /api/global-search?q=toy+cars&source=shopify|channel3&country=US — search whole catalogs, no keys.
import {globalSearch} from './_lib/ucp.mjs';
export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*'); res.setHeader('Cache-Control', 's-maxage=300');
  const u = new URL(req.url, 'http://x'); const q = (u.searchParams.get('q') || '').trim(); const source = u.searchParams.get('source') || 'shopify';
  if (!q) return res.status(200).json({error: 'EMPTY_QUERY', items: []});
  try { res.status(200).json(await globalSearch(source, q, {limit: 24, country: u.searchParams.get('country') || undefined, maxPrice: u.searchParams.get('max') || undefined})); }
  catch (e) { res.status(200).json({source, error: e.message, items: []}); }
}
