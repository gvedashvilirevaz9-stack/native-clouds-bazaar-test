// The owner's Marketplace search (country / city / scope), served for the Bazaar "📍 Marketplace" provider.
//   GET /api/marketplace?meta=1                     → countries + cities + where you are (by IP)
//   GET /api/marketplace?q=игрушки&country=GE&city=Batumi&scope=local|local+world|world&lang=ru
// Search logic is the archive's own runShop (bundled as-is into _lib/market.bundle.mjs); this file only adapts in/out.
import {runShop, regions, countryName, CITIES, geocode} from './_lib/market.bundle.mjs';
import {intents, woltFood, woltStores} from './_lib/local-extra.mjs';

const CC = Object.keys(regions);
const LANGS = ['ru', 'en', 'ka', 'hy', 'az', 'tr', 'kk', 'zh'];
const ipGeo = (req) => {
  const cc = String(req.headers['x-vercel-ip-country'] || '').toUpperCase();
  let city = ''; try { city = decodeURIComponent(String(req.headers['x-vercel-ip-city'] || '')); } catch { /* */ }
  return {cc: /^[A-Z]{2}$/.test(cc) ? cc : null, city: city || null};
};
const coords = (i) => { if (Number.isFinite(i.lat) && Number.isFinite(i.lon)) return {lat: i.lat, lon: i.lon};
  const m = String(i.buy?.url || i.url || '').match(/mlat=(-?[\d.]+)&mlon=(-?[\d.]+)/); return m ? {lat: +m[1], lon: +m[2]} : {}; };
const http = (u) => (typeof u === 'string' && /^https?:\/\//.test(u) ? u : null);

export default async function handler(req, res) {
  const q = String(req.query.q || '').trim().slice(0, 160);
  const lang = LANGS.includes(req.query.lang) ? req.query.lang : 'ru';
  const ip = ipGeo(req);
  if (req.query.meta) {
    res.setHeader('Cache-Control', 'no-store');
    return res.status(200).json({
      countries: CC.map(cc => ({cc, name: countryName(cc, lang), capital: regions[cc].city, currency: regions[cc].currency, market: regions[cc].name,
        cities: CITIES.filter(c => c.cc === cc).map(c => ({en: c.en, ru: c.ru}))})),
      you: {cc: ip.cc, supported: CC.includes(ip.cc), city: ip.city, name: ip.cc ? countryName(ip.cc, lang) : null},
      scopes: [{id: 'local', ru: 'Только страна'}, {id: 'local+world', ru: 'Страна + соседи + мир'}, {id: 'world', ru: 'Весь мир'}],
    });
  }
  if (!q) return res.status(400).json({error: 'QUERY_REQUIRED'});
  const country = CC.includes(String(req.query.country || '').toUpperCase()) ? String(req.query.country).toUpperCase() : null;
  const scope = ['local', 'local+world', 'world'].includes(req.query.scope) ? req.query.scope : 'local';
  const city = String(req.query.city || '').trim().slice(0, 60);
  const cityHit = CITIES.find(c => c.en === city && (!country || c.cc === country));
  const query = cityHit && !cityHit.re.test(q) ? q + ' ' + cityHit.en : q; // the archive reads the city from the query text
  try {
    const r = await runShop({query, lang, scope, ...(country ? {country} : {}), marketGeo: ip.cc ? {cc: ip.cc, source: 'ip'} : undefined}, {});
    const s = r.shop || {};
    // Extra local sources (food, delivery, big stores) for every country — the archive has them only for Georgia.
    const cc = s.location?.cc; const extra = [];
    if (cc && scope !== 'world') {
      const int = intents(q); const have = (s.sections || []).some(x => /wolt/i.test(x.provider || '') || (x.items || []).some(i => i.provider === 'Wolt'));
      if ((int.food && !have) || int.store) {
        const cityName = cityHit?.en || regions[cc].city; let anchor = {lat: regions[cc].lat, lon: regions[cc].lon, cc, city: cityName};
        if (cityHit && cityHit.en !== regions[cc].city) { try { const g = await geocode(cityHit.en, []); if (g?.lat) anchor = {lat: g.lat, lon: g.lon, cc, city: cityName}; } catch { /* capital */ } }
        const log = r.sources || (r.sources = []); const place = countryName(cc, lang) + ' · ' + (cityHit?.ru || cityName);
        const [food, stores] = await Promise.all([int.food && !have ? woltFood(anchor, int.dishTags, log) : [], int.store ? woltStores(anchor, int.retailTags, log) : []]);
        if (food.length) extra.push({id: 'x-wolt-food', title: place + ' · 🛵 Еда с доставкой', provider: 'Wolt', slot: 'local', country: cc, kind: 'venues', status: {ok: true}, items: food});
        if (stores.length) extra.push({id: 'x-wolt-stores', title: place + ' · 🏬 Магазины с доставкой', provider: 'Wolt', slot: 'local', country: cc, kind: 'venues', status: {ok: true}, items: stores});
      }
    }
    s.sections = [...extra, ...(s.sections || [])];
    res.setHeader('Cache-Control', 's-maxage=300, stale-while-revalidate=600');
    return res.status(200).json({
      query: q, title: r.title, speak: r.speak, location: s.location, scope: s.scope, order: s.sourceOrder, breadcrumb: s.breadcrumb, route: s.route,
      stats: s.stats, notes: s.notes || [],
      sections: (s.sections || []).filter(x => x.kind !== 'nodes').map(x => ({id: x.id, title: x.title, provider: x.provider, slot: x.slot, country: x.country || null, kind: x.kind || 'products', tab: x.tab || null, ok: x.status?.ok !== false, status: x.status?.label || null,
        items: (x.items || []).slice(0, 24).map(i => ({id: i.id, title: i.title, subtitle: i.subtitle || '', kind: i.kind, price: Number.isFinite(i.price) ? i.price : null, currency: i.currency || null, priceLabel: i.priceLabel || '',
          image: http(i.image), provider: i.provider || x.provider, url: http(i.buy?.url) || http(i.url), buyType: i.buy?.type || null, buyLabel: i.buy?.label || null, rating: i.rating || null, country: i.sourceCountry || x.country || null, ...coords(i)}))})),
      nav: (s.sections || []).filter(x => x.kind === 'nodes').flatMap(x => x.items.map(i => i.title)),
      directories: (s.directories || []).map(d => ({cc: d.cc, slot: d.slot, name: d.name, url: http(d.url)})).filter(d => d.url),
      sources: (r.sources || []).map(x => ({name: x.name, cc: x.cc || null, ok: !!x.ok, count: x.count ?? null, ms: x.ms ?? null, transport: x.transport || null, error: x.error ? String(x.error).slice(0, 120) : null})),
      tookMs: r.tookMs,
    });
  } catch (e) { return res.status(500).json({error: 'MARKET_ERROR', message: String(e?.message || e).slice(0, 200)}); }
}
