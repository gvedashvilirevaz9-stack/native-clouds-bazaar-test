// Reading a "cartridge": someone else's price list (the HTML file made by "My shop", its products.json,
// or a bare nativeclouds.pricelist.v1 JSON). The file is NOT trusted:
//  - it is parsed with DOMParser (scripts inside are never run);
//  - only known fields are copied, every string is cut to size, prices and EVM addresses are re-checked;
//  - pictures are kept only as data:image/* or plain https URLs;
//  - the storefront is later drawn by OUR runtime inside a sandboxed iframe, never by the file's own script.
import {blankShop, normPrice, type ShopConfig, type Img, type Cell, type Section} from '../shop/model';
import {PRICELIST_SCHEMA, type PriceList} from '../shop/seo';
import {checkAddress} from '../billing/evm';

export type Parsed = {cfg: ShopConfig & {assets: string[]}; source: 'shop-data' | 'pricelist'; warnings: string[]};

const S = (v: unknown, max = 200) => (typeof v === 'string' ? v : v == null ? '' : String(v)).slice(0, max);
const COLOR = /^#[0-9a-f]{3,8}$/i;
const DATA_IMG = /^data:image\/(png|jpe?g|webp|gif|avif);base64,[A-Za-z0-9+/=\s]+$/;
const HTTPS_IMG = /^https:\/\/[^\s'"()<>\\]+$/;

function addr(v: unknown, warn: string[], where: string): string | null {
  if (!v) return null; const c = checkAddress(S(v, 64));
  if (c.ok) return c.address; warn.push(`${where}: адрес кошелька с ошибкой — убран`); return null;
}

/** Turn any of the accepted inputs into a clean ShopConfig. Throws NOT_A_PRICELIST when nothing is found. */
export function parseCartridge(text: string): Parsed {
  const t = text.trim();
  if (t.startsWith('{')) {
    const j = JSON.parse(t);
    if (j?.schema === PRICELIST_SCHEMA) return fromPriceList(j, []);
    if (Array.isArray(j?.sections)) return {...sanitize(j, Array.isArray(j.assets) ? j.assets : []), source: 'shop-data'};
    throw new Error('NOT_A_PRICELIST');
  }
  const doc = new DOMParser().parseFromString(t, 'text/html');
  const data = doc.getElementById('shop-data')?.textContent;
  if (data) { const j = JSON.parse(data); return {...sanitize(j, Array.isArray(j.assets) ? j.assets : []), source: 'shop-data'}; }
  const pl = doc.getElementById('nc-pricelist')?.textContent;
  if (pl) return fromPriceList(JSON.parse(pl), []);
  throw new Error('NOT_A_PRICELIST');
}

function sanitize(j: any, assets0: unknown[]): {cfg: ShopConfig & {assets: string[]}; warnings: string[]} {
  const warn: string[] = []; const base = blankShop();
  const assets = assets0.slice(0, 400).map(a => typeof a === 'string' && DATA_IMG.test(a) && a.length < 6e6 ? a : '');
  const img = (i: any): Img => {
    const src = S(i?.src, 7e6); if (!src) return null;
    if (/^#a\d+$/.test(src) && assets[+src.slice(2)]) return {src, pos: S(i.pos, 30).replace(/[^\w %.-]/g, '') || 'center'};
    if (DATA_IMG.test(src) || HTTPS_IMG.test(src)) return {src, pos: 'center'};
    return null;
  };
  const individual = j?.payment?.mode === 'individual';
  const cell = (c: any, si: number, ci: number): Cell => ({
    id: S(c?.id, 40).replace(/[^\w-]/g, '') || `c${si}-${ci}`, title: S(c?.title, 120) || 'Без названия', text: S(c?.text, 1200),
    tags: Array.isArray(c?.tags) ? c.tags.slice(0, 12).map((x: unknown) => S(x, 40)) : [], image: img(c?.image), price: normPrice(c?.price),
    unit: S(c?.unit, 30) || undefined, receiver: individual ? addr(c?.receiver, warn, `«${S(c?.title, 40)}»`) : null,
    stock: Number.isFinite(c?.stock) ? Math.max(0, Math.floor(c.stock)) : null, hidden: false, icon: S(c?.icon, 8) || undefined,
    place: S(c?.place, 120) || undefined, seller: S(c?.seller, 60) || undefined,
  });
  const sections: Section[] = (Array.isArray(j?.sections) ? j.sections : []).slice(0, 40).map((s: any, si: number) => ({
    id: S(s?.id, 40).replace(/[^\w-]/g, '') || 's' + si, tab: S(s?.tab, 40) || 'Раздел', kicker: S(s?.kicker, 60), title: S(s?.title, 160), text: S(s?.text, 600), side: S(s?.side, 200),
    banner: img(s?.banner), cta: S(s?.cta, 30) || undefined,
    cells: (Array.isArray(s?.cells) ? s.cells : []).filter((c: any) => !c?.hidden).slice(0, 300).map((c: any, ci: number) => cell(c, si, ci)),
  }));
  if (!sections.length) throw new Error('NOT_A_PRICELIST');
  const th = j?.theme || {};
  const cfg: ShopConfig & {assets: string[]} = {
    ...base, id: S(j?.id, 60).replace(/[^\w-]/g, '') || 'shop-' + Math.random().toString(36).slice(2, 8), updatedAt: Number(j?.updatedAt) || Date.now(),
    lang: ['ru', 'en', 'ka'].includes(j?.lang) ? j.lang : 'ru',
    brand: {name: S(j?.brand?.name, 80) || 'Магазин', logo: img(j?.brand?.logo), stripLeft: S(j?.brand?.stripLeft, 80), stripRight: S(j?.brand?.stripRight, 80), place: S(j?.brand?.place, 100)},
    hero: {...base.hero, ...Object.fromEntries(Object.keys(base.hero).map(k => [k, k === 'show' ? j?.hero?.show !== false : S(j?.hero?.[k], 300)]))} as any,
    discover: {eyebrow: S(j?.discover?.eyebrow, 60), title: S(j?.discover?.title, 120)},
    sections,
    payment: {network: 'base', token: 'USDC', mode: individual ? 'individual' : 'shared', address: individual ? null : addr(j?.payment?.address, warn, 'Общий кошелёк'),
      orderTag: j?.payment?.orderTag !== false, windowMin: 30, note: S(j?.payment?.note, 300)},
    contact: Object.fromEntries(['telegram', 'whatsapp', 'email', 'phone', 'instagram'].map(k => [k, S(j?.contact?.[k], 80).replace(/[<>"']/g, '')]).filter(([, v]) => v)),
    footer: {text: S(j?.footer?.text, 200), right: S(j?.footer?.right, 100)},
    theme: {...base.theme, ...Object.fromEntries(['ink', 'paper', 'accent', 'accent2', 'dark'].filter(k => COLOR.test(th[k] || '')).map(k => [k, th[k]])),
      radius: ['round', 'soft', 'square'].includes(th.radius) ? th.radius : base.theme.radius, preset: S(th.preset, 20)},
    credit: j?.credit?.mode === 'own' && /^https:\/\//.test(S(j.credit.url, 300)) ? {mode: 'own', text: S(j.credit.text, 60), url: S(j.credit.url, 300), logo: img(j.credit.logo)} : {mode: 'sunrise', text: 'Native Clouds · Sunrise', url: 'https://sunspace.club/', logo: null},
    siteUrl: /^https:\/\/[^\s"'<>]+$/.test(S(j?.siteUrl, 300)) ? S(j.siteUrl, 300) : undefined,
    assets,
  };
  const priced = sections.flatMap(s => s.cells).filter(c => c.price);
  if (priced.length && !priced.some(c => cfg.payment.mode === 'shared' ? cfg.payment.address : c.receiver)) warn.push('В прайс-листе нет ни одного кошелька — оплатить через Базар не получится, только написать продавцу');
  return {cfg, warnings: warn};
}

/** A bare price list (from another system, or products.json) becomes a simple one-section storefront. */
function fromPriceList(p: PriceList, assets: string[]): Parsed {
  const bySec = new Map<string, any[]>();
  for (const i of (Array.isArray(p.items) ? p.items : []).slice(0, 500)) bySec.set(S(i.section, 40) || 'Каталог', [...(bySec.get(S(i.section, 40) || 'Каталог') || []), i]);
  const individual = p.payment?.mode === 'individual';
  const j = {id: p.id, updatedAt: Date.parse(p.updatedAt) || Date.now(), lang: p.lang, siteUrl: p.url,
    brand: {name: p.name, place: p.seller?.place}, hero: {title: p.name, sub: p.description, show: true},
    contact: p.seller?.contact, payment: {mode: individual ? 'individual' : 'shared', address: p.payment?.address, orderTag: p.payment?.orderTag, note: p.payment?.note},
    sections: [...bySec].map(([tab, items]) => ({tab, title: tab, cells: items.map(i => ({...i, image: i.image && !String(i.image).startsWith('#a') ? {src: i.image} : null}))}))};
  const r = sanitize(j, assets);
  if (p.payment?.chainId && p.payment.chainId !== 8453) r.warnings.push('Прайс-лист для другой сети — Базар платит только USDC в Base');
  return {...r, source: 'pricelist'};
}
