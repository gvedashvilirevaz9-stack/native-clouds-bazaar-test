// "Readable for AI": the same shop described as data, so assistants (ChatGPT, Gemini, Claude, Grok…),
// search engines and other portals (the Bazaar) can read the price list without guessing from the page.
//
// Three outputs, all generated from the ShopConfig and nothing else:
//   1. manifest()  → nativeclouds.pricelist.v1 — our open price-list format ("cartridge"). Embedded in every
//                    exported HTML file as <script type="application/json" id="nc-pricelist"> and saved as
//                    products.json in the site zip. The Bazaar imports files by it.
//   2. jsonLd()    → schema.org Store + OfferCatalog + Offer/Product (what search and AI crawlers understand).
//   3. llmsTxt()   → plain Markdown summary for language models (llms.txt convention).
// Nothing private goes in: hidden cells are dropped, same as in the buyer's file.
import type {ShopConfig, Cell} from './model';
import {CHAIN_ID, USDC} from './chain';

export const PRICELIST_SCHEMA = 'nativeclouds.pricelist.v1';

export type PriceItem = {
  id: string; section: string; title: string; text: string; tags: string[];
  price: string | null; unit: string | null; currency: 'USDC';
  receiver: string | null; seller: string | null; place: string | null; stock: number | null;
  image: string | null;                     // "#aN" (picture N inside the same HTML file), https URL, or null
};
export type PriceList = {
  schema: typeof PRICELIST_SCHEMA; id: string; name: string; updatedAt: string; lang: string;
  description: string; url: string | null;
  seller: {name: string; place: string | null; contact: Record<string, string>};
  payment: {chainId: number; network: 'base'; token: 'USDC'; tokenAddress: string; decimals: 6;
    mode: 'shared' | 'individual'; address: string | null; orderTag: boolean; note: string};
  items: PriceItem[];
  generator: string;
};

const visible = (cfg: ShopConfig) => cfg.sections.map(s => ({s, cells: s.cells.filter(c => !c.hidden)}));
const receiverOf = (cfg: ShopConfig, c: Cell) => cfg.payment.mode === 'individual' ? (c.receiver || null) : (cfg.payment.address || null);
const imgRef = (src?: string | null) => !src ? null : src.startsWith('#a') || /^https:\/\//.test(src) ? src : null;  // data: pictures live in the file, not here
const clean = (o: Record<string, unknown>) => Object.fromEntries(Object.entries(o).filter(([, v]) => v != null && v !== '')) as Record<string, string>;

export function manifest(cfg: ShopConfig): PriceList {
  return {
    schema: PRICELIST_SCHEMA, id: cfg.id, name: cfg.brand.name, updatedAt: new Date(cfg.updatedAt || Date.now()).toISOString(), lang: cfg.lang,
    description: [cfg.hero.title, cfg.hero.sub].filter(Boolean).join(' — ').slice(0, 300), url: cfg.siteUrl || null,
    seller: {name: cfg.brand.name, place: cfg.brand.place || null, contact: clean(cfg.contact as any)},
    payment: {chainId: CHAIN_ID, network: 'base', token: 'USDC', tokenAddress: USDC, decimals: 6, mode: cfg.payment.mode, address: cfg.payment.address || null, orderTag: cfg.payment.orderTag, note: cfg.payment.note},
    items: visible(cfg).flatMap(({s, cells}) => cells.map(c => ({
      id: c.id, section: s.tab, title: c.title, text: c.text, tags: c.tags || [], price: c.price, unit: c.unit || null, currency: 'USDC' as const,
      receiver: c.price ? receiverOf(cfg, c) : null, seller: c.seller || null, place: c.place || null, stock: c.stock ?? null, image: imgRef(c.image?.src),
    }))),
    generator: 'Native Clouds · My shop (https://sunspace.club/)',
  };
}

/** schema.org graph. Prices are in USDC, a dollar stablecoin: priceCurrency is "USD" (ISO 4217 has no USDC) and the offer says how it is paid. */
export function jsonLd(cfg: ShopConfig) {
  const url = cfg.siteUrl || undefined; const m = manifest(cfg);
  const sameAs = [m.seller.contact.telegram && 'https://t.me/' + m.seller.contact.telegram.replace(/^@/, ''), m.seller.contact.instagram && 'https://instagram.com/' + m.seller.contact.instagram.replace(/^@/, '')].filter(Boolean);
  const store: any = {'@type': 'Store', '@id': (url || '') + '#store', name: cfg.brand.name, description: m.description || undefined, url,
    address: cfg.brand.place ? {'@type': 'PostalAddress', addressLocality: cfg.brand.place} : undefined,
    telephone: m.seller.contact.phone || m.seller.contact.whatsapp || undefined, email: m.seller.contact.email || undefined,
    sameAs: sameAs.length ? sameAs : undefined, paymentAccepted: 'USDC (Base network)', currenciesAccepted: 'USD'};
  store.hasOfferCatalog = {'@type': 'OfferCatalog', name: cfg.brand.name, itemListElement: m.items.filter(i => i.price).map(i => ({
    '@type': 'Offer', price: i.price, priceCurrency: 'USD', availability: i.stock === 0 ? 'https://schema.org/OutOfStock' : 'https://schema.org/InStock',
    description: `Paid in USDC on Base${i.unit ? ' · per ' + i.unit : ''}`, url: url ? url + '#' + i.id : undefined,
    seller: i.seller ? {'@type': 'Person', name: i.seller} : {'@id': (url || '') + '#store'},
    availableAtOrFrom: i.place ? {'@type': 'Place', name: i.place} : undefined,
    itemOffered: {'@type': 'Product', name: i.title, description: i.text || undefined, category: i.section, image: i.image?.startsWith('https://') ? i.image : undefined, keywords: i.tags.length ? i.tags.join(', ') : undefined},
  }))};
  return {'@context': 'https://schema.org', '@graph': [store]};
}

export function llmsTxt(cfg: ShopConfig) {
  const m = manifest(cfg); const c = m.seller.contact;
  const lines = [`# ${m.name}`, '', `> ${m.description || 'Price list'}${m.seller.place ? ' · ' + m.seller.place : ''}`, ''];
  const bySec = new Map<string, PriceItem[]>(); for (const i of m.items) bySec.set(i.section, [...(bySec.get(i.section) || []), i]);
  for (const [sec, items] of bySec) {
    lines.push(`## ${sec}`, '');
    for (const i of items) lines.push(`- **${i.title}** — ${i.price ? `${i.price} USDC${i.unit ? ' / ' + i.unit : ''}` : 'price on request'}${i.place ? ` · 📍 ${i.place}` : ''}${i.seller ? ` · seller: ${i.seller}` : ''}${i.text ? `\n  ${i.text.replace(/\s+/g, ' ').slice(0, 240)}` : ''}`);
    lines.push('');
  }
  lines.push('## How to buy', '',
    `- Pay in USDC on Base (chainId ${CHAIN_ID}, token ${USDC}, 6 decimals).`,
    m.payment.mode === 'shared' ? `- Receiver: ${m.payment.address || 'ask the seller'}` : '- Each item has its own receiver address (see products.json).',
    m.payment.orderTag ? '- The last 4 of the 6 decimals of the amount carry the order number (e.g. 25.001234 = order #1234). If the wallet cannot send 6 decimals, send the round price and give the seller the transaction hash.' : '- Send the exact price and give the seller the transaction hash.',
    `- Then send the order and the transaction hash to the seller${Object.keys(c).length ? ': ' + Object.entries(c).map(([k, v]) => `${k} ${v}`).join(', ') : '.'}`,
    '', '## Machine-readable', '', '- products.json — the full price list (nativeclouds.pricelist.v1).', '- The HTML page embeds the same list (#nc-pricelist) and schema.org JSON-LD.', '');
  return lines.join('\n');
}

/** Tags placed in the <head> of the exported page. `safe` escapes "</script" so text from cells cannot close the tag. */
export function headTags(cfg: ShopConfig, safe: (s: string) => string) {
  return `<meta name="nc:pricelist" content="${PRICELIST_SCHEMA}">
<script type="application/ld+json">${safe(JSON.stringify(jsonLd(cfg)))}</script>
<script type="application/json" id="nc-pricelist">${safe(JSON.stringify(manifest(cfg)))}</script>`;
}

/** Readiness for AI and search: what is missing, in plain words. Used by the admin "Опубликовать для ИИ" page. */
export function aiChecks(cfg: ShopConfig | null) {
  if (!cfg) return [{id: 'site', ok: false, text: 'Нет сайта — соберите его из пресета'}];
  const items = manifest(cfg).items; const priced = items.filter(i => i.price);
  return [
    {id: 'items', ok: priced.length > 0, text: priced.length ? `Товаров с ценой: ${priced.length}` : 'Нет ни одного товара с ценой'},
    {id: 'texts', ok: items.every(i => (i.text || '').length >= 20), text: items.every(i => (i.text || '').length >= 20) ? 'У всех товаров есть описание' : `Без нормального описания: ${items.filter(i => (i.text || '').length < 20).map(i => i.title).slice(0, 4).join(', ')}`},
    {id: 'wallet', ok: items.filter(i => i.price).every(i => i.receiver), text: priced.every(i => i.receiver) ? 'Кошелёк для оплаты указан' : 'Не у всех товаров есть кошелёк для оплаты'},
    {id: 'contact', ok: Object.keys(clean(cfg.contact as any)).length > 0, text: Object.keys(clean(cfg.contact as any)).length ? 'Контакты есть' : 'Нет контактов продавца'},
    {id: 'place', ok: !!cfg.brand.place, text: cfg.brand.place ? `Город: ${cfg.brand.place}` : 'Не указан город — ИИ не поймёт, где вы'},
    {id: 'url', ok: !!cfg.siteUrl, text: cfg.siteUrl ? `Адрес сайта: ${cfg.siteUrl}` : 'Сайт ещё не выложен в интернет (для ChatGPT и Google нужен адрес)'},
  ];
}
