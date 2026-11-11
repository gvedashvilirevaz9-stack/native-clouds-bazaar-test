// GET /api/shop-search?store=allbirds.com&q=shoes — public search of a Shopify store, for the Bazaar page.
import {shopifyPublicSearch} from './_lib/shopify.mjs';
export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*'); res.setHeader('Cache-Control', 's-maxage=120');
  const u = new URL(req.url, 'http://x'); const store = u.searchParams.get('store') || ''; const q = (u.searchParams.get('q') || '').slice(0, 100);
  try { res.status(200).json(await shopifyPublicSearch(store, q, 12)); } catch (e) { res.status(200).json({store, error: e.message, items: []}); }
}
