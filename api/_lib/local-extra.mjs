// Extra local sources for Local Marketplace, for every country (the archive has food/delivery only for Georgia):
// Wolt restaurants (food + delivery) and Wolt "Stores" (supermarkets, electronics, pharmacies — big local shops).
// Same public pages the archive uses for Tbilisi, asked for the chosen city's coordinates. No keys.
const UA = {'user-agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130 Safari/537.36', accept: 'application/json', 'accept-language': 'en'};
const cache = new Map();
async function get(url, ms = 9000) {
  const hit = cache.get(url); if (hit && hit.until > Date.now()) return hit.v;
  const r = await fetch(url, {headers: UA, signal: AbortSignal.timeout(ms)}); if (!r.ok) throw new Error('HTTP ' + r.status);
  const v = await r.json(); cache.set(url, {v, until: Date.now() + 15 * 60e3}); if (cache.size > 60) cache.delete(cache.keys().next().value); return v;
}
// Russian / local dish words → what Wolt venues are tagged with.
const DISH = [[/пицц|pizza|პიც|պիցց/i, ['pizza']], [/бургер|burger/i, ['burger']], [/суши|ролл|sushi/i, ['sushi', 'japanese']], [/шаурм|донер|кебаб|shawarma|kebab|doner/i, ['shawarma', 'kebab', 'doner']],
  [/кофе|coffee|кофейн/i, ['coffee', 'cafe']], [/хачапур|khachapuri|грузин/i, ['georgian', 'khachapuri']], [/шашлык|мангал|bbq|grill/i, ['bbq', 'grill', 'kebab']], [/десерт|торт|dessert|cake|выпечк|bakery/i, ['dessert', 'bakery', 'cake']],
  [/завтрак|breakfast/i, ['breakfast']], [/куриц|chicken|крыл/i, ['chicken', 'wings']], [/салат|здоров|healthy|salad|vegan|веган/i, ['healthy', 'salad', 'vegan']], [/азиат|китай|лапш|wok|asian|chinese|noodle/i, ['asian', 'chinese', 'noodles']],
  [/хинкал|khinkali/i, ['khinkali', 'georgian']], [/плов|узбек|uzbek/i, ['uzbek', 'plov']], [/стейк|steak|мяс/i, ['steak', 'meat']]];
const FOOD = /ед[аыу]|доставк|ресторан|кафе|поесть|обед|ужин|food|delivery|restaurant|cafe|wolt|глово|glovo/i;
const STORE = /магазин|супермаркет|продукт|гастроном|аптек|лекарств|электрон|техник|телефон|смартфон|ноутбук|цвет|зоотовар|косметик|алкогол|вино|store|shop|market|grocery|pharmacy|electronics|flowers/i;
const RETAIL_HINT = [[/аптек|лекарств|pharmacy/i, ['pharmacy', 'health']], [/продукт|супермаркет|гастроном|grocery|market/i, ['grocery', 'supermarket', 'market']], [/электрон|техник|телефон|смартфон|ноутбук|electronics/i, ['electronics', 'tech']],
  [/цвет|flowers/i, ['flowers']], [/зоо|pet/i, ['pet']], [/косметик|beauty/i, ['beauty', 'cosmetics']], [/алкогол|вино|wine|liquor/i, ['alcohol', 'wine', 'liquor']]];

export const intents = (q) => { const dish = DISH.find(([re]) => re.test(q)); const retail = RETAIL_HINT.find(([re]) => re.test(q));
  return {food: !!dish || FOOD.test(q), dishTags: dish ? dish[1] : [], store: !!retail || STORE.test(q), retailTags: retail ? retail[1] : []}; };

const text = (v) => [v.name, v.short_description, ...(v.tags || []), ...(v.venue_preview_items || []).map(p => p.name)].join(' ').toLowerCase();
const loc = (v) => Array.isArray(v.location) && v.location.length === 2 ? {lat: +v.location[1], lon: +v.location[0]} : {};
const citySlugOf = (list, anchor) => (list.find(i => i.link?.target)?.link?.target || '').match(/\/geo\/([^/]+)\//)?.[1] || String(anchor.city || '').toLowerCase().replace(/[^a-z]+/g, '-') || null;

/** Wolt restaurants near a point. Only places that match the dish when a dish was asked (honest: no padding). */
export async function woltFood(anchor, tags, log) {
  const t = Date.now();
  try {
    const r = await get(`https://restaurant-api.wolt.com/v1/pages/restaurants?lat=${anchor.lat}&lon=${anchor.lon}`);
    const list = (r.sections || []).flatMap(s => s.items || []).filter(i => i?.venue?.slug); const slug = citySlugOf(list, anchor);
    let v = list.map(i => ({...i.venue, image: i.image?.url || null})).filter(x => x.online !== false);
    if (tags.length) v = v.filter(x => tags.some(w => text(x).includes(w)));
    v.sort((a, b) => (b.rating?.score || 0) * Math.log10(10 + (b.rating?.volume || 0)) - (a.rating?.score || 0) * Math.log10(10 + (a.rating?.volume || 0)));
    const items = v.slice(0, 12).map(x => ({id: 'wolt-' + x.slug, title: x.name, subtitle: [x.short_description, x.address, x.estimate_range && x.estimate_range + ' мин'].filter(Boolean).join(' · ').slice(0, 140), kind: 'venue',
      price: null, currency: x.currency || null, priceLabel: 'меню и цены в Wolt', image: x.image, provider: 'Wolt', url: slug ? `https://wolt.com/en/geo/${slug}/restaurant/${encodeURIComponent(x.slug)}` : null, buyType: 'external', rating: x.rating?.score || null, ...loc(x)}));
    log.push({name: 'Wolt (рестораны)', cc: anchor.cc, ok: true, count: items.length, ms: Date.now() - t, transport: 'Wolt HTTP', error: list.length ? null : 'нет Wolt в этом городе'});
    return items;
  } catch (e) { log.push({name: 'Wolt (рестораны)', cc: anchor.cc, ok: false, count: null, ms: Date.now() - t, transport: 'Wolt HTTP', error: String(e.message || e).slice(0, 80)}); return []; }
}

/** Wolt "Stores" near a point: supermarkets, electronics, pharmacies… (big local shops with delivery). */
export async function woltStores(anchor, tags, log) {
  const t = Date.now();
  try {
    const r = await get(`https://restaurant-api.wolt.com/v1/pages/retail?lat=${anchor.lat}&lon=${anchor.lon}`);
    const list = (r.sections || []).flatMap(s => s.items || []).filter(i => i?.venue?.slug); const slug = citySlugOf(list, anchor); const seen = new Set();
    let v = list.map(i => ({...i.venue, image: i.image?.url || null})).filter(x => x.online !== false && !seen.has(x.slug) && seen.add(x.slug));
    if (tags.length) { const f = v.filter(x => tags.some(w => (text(x) + ' ' + (x.product_line || '')).includes(w))); if (f.length) v = f; }
    const items = v.slice(0, 12).map(x => ({id: 'woltr-' + x.slug, title: x.name, subtitle: [x.short_description, x.address].filter(Boolean).join(' · ').slice(0, 140), kind: 'venue',
      price: null, currency: null, priceLabel: 'товары и цены в Wolt', image: x.image, provider: 'Wolt', url: slug ? `https://wolt.com/en/geo/${slug}/venue/${encodeURIComponent(x.slug)}` : null, buyType: 'external', rating: x.rating?.score || null, ...loc(x)}));
    log.push({name: 'Wolt (магазины)', cc: anchor.cc, ok: true, count: items.length, ms: Date.now() - t, transport: 'Wolt HTTP', error: list.length ? null : 'нет Wolt в этом городе'});
    return items;
  } catch (e) { log.push({name: 'Wolt (магазины)', cc: anchor.cc, ok: false, count: null, ms: Date.now() - t, transport: 'Wolt HTTP', error: String(e.message || e).slice(0, 80)}); return []; }
}
