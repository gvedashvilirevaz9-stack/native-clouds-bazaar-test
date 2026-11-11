// GET /api/woo-multi?q=sofa&cat=Мебель — search all verified WooCommerce stores at once (no keys).
// The list (api/_lib/woo-stores.json) was built from public rankings and checked store by store.
import fs from 'node:fs';
const STORES = JSON.parse(fs.readFileSync(new URL('./_lib/woo-stores.json', import.meta.url), 'utf8'));
const stem = (w) => w.replace(/(es|s)$/, '');
async function one(s, q) {
  try { const r = await fetch(`https://${s.domain}/wp-json/wc/store/v1/products?search=${encodeURIComponent(q)}&per_page=8`, {headers: {accept: 'application/json', 'user-agent': 'NativeCloudsBazaar/0.1'}, signal: AbortSignal.timeout(6000)});
    if (!r.ok) return []; const list = await r.json(); if (!Array.isArray(list)) return [];
    return list.map(p => { const pr = p.prices || {}; const minor = Number(pr.currency_minor_unit ?? 2);
      return {title: String(p.name || '').replace(/<[^>]+>/g, '').replace(/&#8217;/g, '’').replace(/&amp;/g, '&'), price: pr.price ? (Number(pr.price) / 10 ** minor).toFixed(2) : null, currency: pr.currency_code || null,
        available: p.is_in_stock ?? null, image: p.images?.[0]?.src || null, url: p.permalink, store: s.domain, category: s.category}; });
  } catch { return []; }
}
export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*'); res.setHeader('Cache-Control', 's-maxage=600');
  const u = new URL(req.url, 'http://x'); const q = (u.searchParams.get('q') || '').trim().slice(0, 100); const cat = u.searchParams.get('cat') || '';
  if (u.searchParams.has('list')) return res.status(200).json({stores: STORES});
  if (!q) return res.status(200).json({error: 'EMPTY_QUERY', items: []});
  const pool = STORES.filter(s => !cat || s.category === cat);
  const all = (await Promise.all(pool.map(s => one(s, q)))).flat().filter(i => i.price && Number(i.price) > 0);
  const words = q.toLowerCase().split(/\s+/).filter(w => w.length > 1);
  const score = (t) => words.reduce((a, w) => a + (t.toLowerCase().includes(stem(w)) ? 1 : 0), 0);
  const items = all.map(i => ({...i, _s: score(i.title)})).filter(i => i._s > 0).sort((a, b) => b._s - a._s).slice(0, 48);
  res.status(200).json({searched: pool.length, stores: new Set(items.map(i => i.store)).size, items});
}
