// Agent Marketplace (the owner's Money Space): information services as cards — weather, rates, news, crypto, trips, evening.
//   GET /api/money?meta=1                         → packages (Утро, Деньги, Путешествия, Вечер, Крипта) + services
//   GET /api/money?q=погода в Батуми               → the archive's router picks the service(s) and runs them
//   GET /api/money?service=weather&city=Batumi     → one service
//   GET /api/money?package=morning&city=Tbilisi    → a few ready-to-run services of a package
// Payments of the old test stand are switched off here: everything runs as information only.
import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {runAtomic, listServices, SERVICE_BY_ID, readMoneyForecast, plan, cleanParams, runService, moneyParams} from './_lib/money.bundle.mjs';
import {regions} from './_lib/market.bundle.mjs';

const PACKAGES = JSON.parse(fs.readFileSync(path.join(path.dirname(fileURLToPath(import.meta.url)), '_lib', 'money-packages.json'), 'utf8'));
// Services that need the person's own input (address, route, token…) are not run from a package tile.
const NEEDS = new Set(['portfolio', 'flights', 'trains', 'route', 'best_swap', 'best_bridge', 'token_check', 'liquidity', 'do_it_for_me', 'recipe', 'book', 'morning_brief']);
const geoOf = (req, q) => {
  const cc = String(q.country || req.headers['x-vercel-ip-country'] || '').toUpperCase(); let city = String(q.city || '');
  if (!city) { try { city = decodeURIComponent(String(req.headers['x-vercel-ip-city'] || '')); } catch { city = ''; } }
  return {cc: /^[A-Z]{2}$/.test(cc) ? cc : null, city: city || regions[cc]?.city || null};
};
async function run(id, params, geo) {
  const p = moneyParams(id, {...params}, geo);
  try {
    const r = SERVICE_BY_ID[id] ? await runAtomic(id, cleanParams(id, p), {weather: readMoneyForecast}) : await runService(id, p, {});
    return {serviceId: id, ok: !!r.ok, title: r.title, summary: r.speak || r.summary || '', card: r.card || r.data || null, params: r.params || p,
      sources: (r.sources || []).map(s => ({name: s.name, ok: s.ok !== false, url: typeof s.url === 'string' && /^https:/.test(s.url) ? s.url : null})).slice(0, 6), fetchedAt: r.fetchedAt || new Date().toISOString(), tookMs: r.tookMs};
  } catch (e) { return {serviceId: id, ok: false, title: SERVICE_BY_ID[id]?.ru || id, summary: 'Источник не ответил.', card: {type: 'error', message: String(e?.message || e).slice(0, 160)}, sources: []}; }
}

export default async function handler(req, res) {
  const q = req.query || {}; const geo = geoOf(req, q);
  res.setHeader('Cache-Control', 'no-store');
  if (q.meta) {
    const services = listServices('ru').map(s => ({id: s.id, title: s.title, category: s.category, categoryRu: s.categoryRu, needsInput: NEEDS.has(s.id)}));
    return res.status(200).json({you: geo, packages: PACKAGES.map(p => ({id: p.id, ru: p.ru, icon: p.icon, question: p.question, options: p.options.map(o => ({serviceId: o.serviceId, label: o.label, desc: o.desc, needsInput: NEEDS.has(o.serviceId)}))})), services});
  }
  try {
    if (q.service) {
      const id = String(q.service); if (!SERVICE_BY_ID[id] && !listServices('ru').some(s => s.id === id)) return res.status(404).json({error: 'UNKNOWN_SERVICE'});
      const params = {}; for (const [k, v] of Object.entries(q)) if (!['service', 'country'].includes(k) && typeof v === 'string' && v.length < 120) params[k] = v;
      return res.status(200).json({kind: 'result', items: [await run(id, params, geo)]});
    }
    if (q.package) {
      const pk = PACKAGES.find(p => p.id === q.package); if (!pk) return res.status(404).json({error: 'UNKNOWN_PACKAGE'});
      const ids = pk.options.filter(o => !NEEDS.has(o.serviceId)).slice(0, 6);
      const items = await Promise.all(ids.map(o => run(o.serviceId, {...o.params, ...(geo.city ? {city: geo.city} : {})}, geo)));
      return res.status(200).json({kind: 'result', package: pk.id, title: pk.icon + ' ' + pk.ru, items});
    }
    const text = String(q.q || '').trim().slice(0, 200); if (!text) return res.status(400).json({error: 'QUERY_REQUIRED'});
    const pl = plan(text, {lang: 'ru', city: geo.city}, {});
    if (pl.kind === 'run' && pl.services?.length) return res.status(200).json({kind: 'result', items: await Promise.all(pl.services.slice(0, 3).map(s => run(s.serviceId, s.params || {}, geo)))});
    if (pl.package) { const pk = PACKAGES.find(p => p.id === pl.package); if (pk) return res.status(200).json({kind: 'menu', package: pk.id, question: pl.question || pk.question}); }
    return res.status(200).json({kind: 'clarify', question: pl.question || 'Уточните: погода, курс, новости, крипта, рейсы, что посмотреть вечером…', options: (pl.options || []).slice(0, 6)});
  } catch (e) { return res.status(500).json({error: 'MONEY_ERROR', message: String(e?.message || e).slice(0, 200)}); }
}
