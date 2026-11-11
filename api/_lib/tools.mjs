// Tools of the Bazaar MCP server. Each: {description, inputSchema, run(args)}.
import {netOf, units, fmt, tagged, isAddr, usdcBalance, verifyTx} from './chain.mjs';
import {fetchPriceList, searchItems} from './pricelist.mjs';
import {shopifyConfigured, shopifySearch, shopifyPublicSearch} from './shopify.mjs';
import {agentConfig, probe, pay} from './x402.mjs';
import {globalSearch} from './ucp.mjs';
import marketplace from '../marketplace.mjs';
import money from '../money.mjs';
// Run one of our own API handlers in-process (same answer the Bazaar page gets).
const callApi = (h, query) => new Promise((resolve) => { const res = {statusCode: 200, setHeader() {}, status(c) { this.statusCode = c; return this; }, json(o) { resolve(o); return this; }};
  Promise.resolve(h({query: Object.fromEntries(Object.entries(query).filter(([, v]) => v != null && v !== '').map(([k, v]) => [k, String(v)])), headers: {}}, res)).catch(e => resolve({error: String(e?.message || e)})); });

const O = (properties, required = []) => ({type: 'object', properties, required});
const str = (description) => ({type: 'string', description});
const catalogs = () => (process.env.CATALOG_URLS || '').split(/[\s,]+/).filter(u => /^https:\/\//.test(u));

export const TOOLS = {
  local_marketplace_search: {
    description: 'Local Marketplace: shops, food, delivery (Wolt), places on the map and local classifieds in one country/city. Countries: GE, AM, AZ, KZ, CN, TR. Russian queries work (пицца, игрушки, аптека, iPhone 15). Returns sections with items (title, price, url, image, lat/lon).',
    inputSchema: O({q: str('what to find, e.g. "пицца", "аптека", "игрушки"'), country: str('GE | AM | AZ | KZ | CN | TR'), city: str('city in English, e.g. Batumi, Yerevan, Baku, Almaty (optional)'), scope: {type: 'string', enum: ['local', 'local+world', 'world']}}, ['q', 'country']),
    run: (a) => callApi(marketplace, a),
  },
  agent_services: {
    description: 'Agent Marketplace (information services as cards): weather, currency rates, news, crypto prices, fear&greed, holidays, air quality, sun times, flights, places, what to watch… Ask in words (q) or call one service (service + its params) or a whole package (package: morning|money|travel|evening|crypto). Information only, no payments.',
    inputSchema: O({q: str('question in words, e.g. "погода в Батуми", "курс доллара"'), service: str('service id, e.g. weather, fx, news, crypto_price (optional)'), package: str('morning | money | travel | evening | crypto (optional)'), city: str('city (optional)'), country: str('ISO country (optional)')}),
    run: (a) => callApi(money, a.q || a.service || a.package ? a : {meta: '1'}),
  },
  status: {
    description: 'What this Bazaar server can do right now: networks, configured catalogs, Shopify store, agent test wallet and its limits. Call first.',
    inputSchema: O({}),
    async run() {
      const a = agentConfig();
      return {server: 'Native Clouds · Bazaar MCP (test)', networks: ['base', 'base-sepolia'], catalogs: catalogs(), shopify: shopifyConfigured() ? process.env.SHOPIFY_STORE_DOMAIN : null,
        agentWallet: a.wallet, agentNetworks: a.networks, agentMaxPerCallUsdc: a.maxPerCall, x402PayEnabled: a.payEnabled,
        routes: {human: 'payment_request → person pays from own wallet → payment_verify {tx}', link: 'Shopify and other shops: checkout on their page', agent: 'x402_probe → x402_pay (test wallet, limits)'}};
    },
  },
  pricelist_fetch: {
    description: 'Open a published price list (site made with Native Clouds "My shop", its products.json, or any nativeclouds.pricelist.v1) by https URL and return its items with prices and payment addresses.',
    inputSchema: O({url: str('https URL of the site or products.json')}, ['url']),
    async run({url}) { const l = await fetchPriceList(url); return {...l, items: l.items.slice(0, 100)}; },
  },
  catalog_search: {
    description: 'Search goods across price lists (CATALOG_URLS on the server + urls you pass) and the configured Shopify store. Each result says how it is paid: evm (USDC to seller address), link (shop checkout).',
    inputSchema: O({q: str('what to find, e.g. "диван", "кастрюля"'), urls: {type: 'array', items: {type: 'string'}, description: 'extra price-list URLs'}, limit: {type: 'number'}}, ['q']),
    async run({q, urls = [], limit = 20}) {
      const list = [...new Set([...catalogs(), ...urls.filter(u => /^https:\/\//.test(u))])].slice(0, 15);
      const lists = []; const errors = [];
      await Promise.all(list.map(async u => { try { lists.push(await fetchPriceList(u)); } catch (e) { errors.push({url: u, error: e.message}); } }));
      const found = searchItems(lists, q).slice(0, limit).map(i => ({source: 'pricelist', stall: i.stall, url: i.stallUrl, id: i.id, title: i.title, price: i.price ? i.price + ' USDC' : null, place: i.place, seller: i.seller, pay: i.receiver ? {kind: 'evm', network: 'base', to: i.receiver} : {kind: 'none'}}));
      let shop = []; if (shopifyConfigured()) { try { shop = (await shopifySearch(q, 10)).items.map(i => ({source: 'shopify', ...i, price: i.price ? `${i.price} ${i.currency}` : null})); } catch (e) { errors.push({url: 'shopify', error: e.message}); } }
      return {q, found: [...found, ...shop], searched: {pricelists: list.length, shopify: shopifyConfigured()}, errors};
    },
  },
  shopify_search: {
    description: 'Search products in the Shopify store configured on the server (Storefront API, read-only). Checkout happens on Shopify (url).',
    inputSchema: O({q: str('search text'), first: {type: 'number'}}, ['q']),
    run: ({q, first}) => shopifySearch(q, first),
  },
  global_search: {
    description: 'Search products across ALL Shopify stores (Shopify Global Catalog) or Channel3 (many retailers). Free, no key. Returns title, price, store, image, link to buy.',
    inputSchema: O({q: str('what to find, in English works best, e.g. "toy cars"'), source: {type: 'string', enum: ['shopify', 'channel3']}, country: str('ships to, ISO code e.g. US, GE (optional)'), max_price: str('max price in USD (optional)'), limit: {type: 'number'}}, ['q']),
    run: ({q, source = 'shopify', country, max_price, limit}) => globalSearch(source, q, {limit, country, maxPrice: max_price}),
  },
  woo_catalog_search: {
    description: 'Search ALL verified WooCommerce stores at once (our own list of ~80 stores across clothing, jewelry, beauty, home, furniture, toys, food, pets, electronics, sport, music, digital). Optional category. No key.',
    inputSchema: O({q: str('what to find'), category: str('optional, one of: Одежда и обувь, Украшения и аксессуары, Красота и здоровье, Дом и сад, Мебель, Игрушки и коллекции, Еда и напитки, Питомцы, Электроника и техника, Спорт и отдых, Музыка и хобби, Цифровые товары')}, ['q']),
    async run({q, category}) { const mod = await import('../woo-multi.mjs'); let out; const res = {setHeader() { return res; }, status() { return res; }, json(j) { out = j; return res; }};
      await mod.default({url: `/api/woo-multi?q=${encodeURIComponent(q)}${category ? '&cat=' + encodeURIComponent(category) : ''}`}, res); if (out?.error) throw new Error(out.error); return out; },
  },
  woo_store_search: {
    description: 'Search products in ANY WooCommerce store by its web address (public Store API, no key). Checkout on the store page.',
    inputSchema: O({store: str('store domain, e.g. "porterandyork.com"'), q: str('what to find')}, ['store', 'q']),
    async run({store, q}) { const mod = await import('../woo-search.mjs'); let out; const res = {setHeader() { return res; }, status() { return res; }, json(j) { out = j; return res; }};
      await mod.default({url: `/api/woo-search?store=${encodeURIComponent(store)}&q=${encodeURIComponent(q)}`}, res); if (out?.error) throw new Error(out.error); return out; },
  },
  shopify_store_search: {
    description: 'Search products in ANY Shopify store by its web address, no token needed (uses the store\'s public search). Prices are in the store currency; checkout happens on the store page (url).',
    inputSchema: O({store: str('store domain, e.g. "allbirds.com"'), q: str('what to find'), limit: {type: 'number'}}, ['store', 'q']),
    run: ({store, q, limit}) => shopifyPublicSearch(store, q, limit),
  },
  payment_request: {
    description: 'Make a USDC payment request for a person to pay from their own wallet: exact amount (order number in the last 4 decimals), EIP-681 link for wallets/QR.',
    inputSchema: O({to: str('seller EVM address'), amount: str('price in USDC, e.g. "25" or "12.5"'), order: {type: 'number', description: 'order number 1–9999 (optional)'}, network: {type: 'string', enum: ['base', 'base-sepolia']}}, ['to', 'amount']),
    async run({to, amount, order, network = 'base'}) {
      if (!isAddr(to)) throw new Error('BAD_ADDRESS'); const net = netOf(network); let u = units(amount); const code = order || (1 + Math.floor(Math.random() * 9999));
      const total = u; if (u % 10000n === 0n) u = tagged(u, code);
      return {network: net.key, chainId: net.chainId, token: net.usdc, to, price: fmt(total), amount: fmt(u), order: code, uri: `ethereum:${net.usdc}@${net.chainId}/transfer?address=${to}&uint256=${u}`,
        next: 'Person pays from their own wallet (not an exchange). Then payment_verify {tx, to, min_amount}.'};
    },
  },
  payment_verify: {
    description: 'Check a transaction hash: did USDC reach this address, how much, how many confirmations.',
    inputSchema: O({tx: str('transaction hash 0x…'), to: str('expected receiver (optional)'), min_amount: str('minimum USDC (optional)'), network: {type: 'string', enum: ['base', 'base-sepolia']}}, ['tx']),
    run: ({tx, to, min_amount, network = 'base'}) => verifyTx(netOf(network), tx, to, min_amount),
  },
  wallet_balance: {
    description: 'USDC balance of an address (read-only). Without address: the agent test wallet.',
    inputSchema: O({address: str('0x… (optional)'), network: {type: 'string', enum: ['base', 'base-sepolia']}}),
    async run({address, network = 'base-sepolia'}) { const a = address || agentConfig().wallet; if (!isAddr(a)) throw new Error('NO_ADDRESS'); const net = netOf(network); return {network: net.key, address: a, usdc: fmt(await usdcBalance(net, a))}; },
  },
  x402_probe: {
    description: 'Ask an x402 (HTTP 402) paid URL what it costs without paying: networks, amount, receiver.',
    inputSchema: O({url: str('https URL of the paid resource'), method: {type: 'string', enum: ['GET', 'POST']}, body: {type: 'object'}}, ['url']),
    run: ({url, method, body}) => probe(url, method, body),
  },
  x402_pay: {
    description: 'Pay an x402 URL from the AGENT TEST WALLET (separate wallet, limits from the server: networks, max per call). Use only after x402_probe and the person\'s OK. Returns the response and the payment receipt.',
    inputSchema: O({url: str('https URL'), method: {type: 'string', enum: ['GET', 'POST']}, body: {type: 'object'}, max_usdc: str('lower limit for this call (optional)'), confirm: {type: 'boolean', description: 'must be true'}}, ['url', 'confirm']),
    async run({url, method, body, max_usdc, confirm}) { if (confirm !== true) throw new Error('CONFIRM_REQUIRED: ask the person, then call with confirm:true'); return pay(url, {method, body, maxUsdc: max_usdc}); },
  },
};
