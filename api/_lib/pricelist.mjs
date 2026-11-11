// Read a published price list (site made with "My shop", its products.json, or any nativeclouds.pricelist.v1).
// Server side: only text is parsed, nothing from the page is executed.
const SCHEMA = 'nativeclouds.pricelist.v1';
const S = (v, n = 200) => (typeof v === 'string' ? v : v == null ? '' : String(v)).slice(0, n);
const price = (v) => { const s = String(v ?? '').replace(',', '.').trim(); return /^\d+(\.\d{1,6})?$/.test(s) && Number(s) > 0 ? s : null; };

function unescapeScript(t) { return t.replace(/<\\\//g, '</'); }

export function parsePriceList(text, sourceUrl) {
  const t = text.trim(); let j = null;
  if (t.startsWith('{')) j = JSON.parse(t);
  else {
    const m = t.match(/<script[^>]*id=["']nc-pricelist["'][^>]*>([\s\S]*?)<\/script>/i);
    if (m) j = JSON.parse(unescapeScript(m[1]));
    else { const d = t.match(/<script[^>]*id=["']shop-data["'][^>]*>([\s\S]*?)<\/script>/i); if (d) j = fromShopData(JSON.parse(unescapeScript(d[1]))); }
  }
  if (!j) throw new Error('NOT_A_PRICELIST');
  if (j.schema !== SCHEMA && Array.isArray(j.sections)) j = fromShopData(j);
  if (j.schema !== SCHEMA) throw new Error('NOT_A_PRICELIST');
  const pay = j.payment || {};
  return {
    schema: SCHEMA, id: S(j.id, 60), name: S(j.name, 80), url: S(j.url || sourceUrl || '', 300) || null, place: S(j.seller?.place, 100) || null,
    contact: Object.fromEntries(Object.entries(j.seller?.contact || {}).map(([k, v]) => [k, S(v, 80)])),
    payment: {chainId: Number(pay.chainId) || 8453, token: 'USDC', mode: pay.mode === 'individual' ? 'individual' : 'shared', address: /^0x[0-9a-fA-F]{40}$/.test(pay.address || '') ? pay.address : null, orderTag: pay.orderTag !== false},
    items: (Array.isArray(j.items) ? j.items : []).slice(0, 500).map((i, n) => ({
      id: S(i.id, 60) || 'i' + n, title: S(i.title, 160), text: S(i.text, 400), section: S(i.section, 40), price: price(i.price), unit: S(i.unit, 30) || null,
      receiver: /^0x[0-9a-fA-F]{40}$/.test(i.receiver || '') ? i.receiver : null, seller: S(i.seller, 60) || null, place: S(i.place, 100) || null,
      image: /^https:\/\//.test(i.image || '') ? S(i.image, 500) : null,
    })),
  };
}

function fromShopData(c) {
  const individual = c?.payment?.mode === 'individual';
  return {schema: SCHEMA, id: c.id, name: c.brand?.name, url: c.siteUrl || null, seller: {place: c.brand?.place, contact: c.contact},
    payment: {chainId: 8453, mode: individual ? 'individual' : 'shared', address: c.payment?.address, orderTag: c.payment?.orderTag},
    items: (c.sections || []).flatMap(s => (s.cells || []).filter(x => !x.hidden).map(x => ({...x, section: s.tab, receiver: x.price ? (individual ? x.receiver : c.payment?.address) : null, image: x.image?.src})))};
}

export async function fetchPriceList(url) {
  if (!/^https:\/\/[^\s"'<>]+$/.test(url)) throw new Error('URL_MUST_BE_HTTPS');
  const tries = /\.json$|\/products\.json/.test(url) ? [url] : [url.replace(/\/?$/, '/') + 'products.json', url];
  let last;
  for (const u of tries) {
    try { const r = await fetch(u, {headers: {accept: 'application/json,text/html'}, redirect: 'follow'}); if (!r.ok) { last = new Error('HTTP_' + r.status); continue; }
      const text = await r.text(); if (text.length > 8e6) throw new Error('TOO_BIG'); return parsePriceList(text, url); } catch (e) { last = e; }
  }
  throw last || new Error('NOT_A_PRICELIST');
}

export function searchItems(lists, q) {
  const words = String(q || '').toLowerCase().split(/\s+/).filter(Boolean);
  return lists.flatMap(l => l.items.map(i => ({...i, stall: l.name, stallUrl: l.url, receiver: i.receiver || (l.payment.mode === 'shared' ? l.payment.address : null)})))
    .map(i => { const hay = `${i.title} ${i.text} ${i.section} ${i.stall} ${i.place || ''}`.toLowerCase(); return {i, s: words.reduce((a, w) => a + (i.title.toLowerCase().includes(w) ? 3 : hay.includes(w) ? 1 : 0), 0)}; })
    .filter(x => !words.length || x.s >= words.length).sort((a, b) => b.s - a.s).map(x => x.i);
}
