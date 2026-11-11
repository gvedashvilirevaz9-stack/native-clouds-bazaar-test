// Packs the shop into ONE html file: storefront script, styles, settings and every picture inside.
// The owner's cabinet is not part of the file at all: only the storefront runtime is included.
import {RUNTIME_JS, RUNTIME_CSS} from './runtime.generated';
import {SUNRISE_CREDIT, type ShopConfig, type Img} from './model';
import {plan} from '../billing/plan';
import {headTags, manifest, llmsTxt} from './seo';

const abs = (src: string) => /^(data:|https?:|blob:)/.test(src) ? src : new URL(src, document.baseURI).href;
async function toDataUrl(src: string) {
  if (src.startsWith('data:')) return src;
  const b = await (await fetch(abs(src))).blob();
  return await new Promise<string>((res, rej) => { const r = new FileReader(); r.onload = () => res(String(r.result)); r.onerror = () => rej(r.error); r.readAsDataURL(b); });
}
async function mapImages(cfg: ShopConfig, fn: (src: string) => Promise<string> | string): Promise<ShopConfig> {
  const cache = new Map<string, string>();
  const one = async (i: Img): Promise<Img> => { if (!i?.src) return i; if (!cache.has(i.src)) cache.set(i.src, await fn(i.src)); return {...i, src: cache.get(i.src)!}; };
  const c: ShopConfig = JSON.parse(JSON.stringify(cfg));
  c.brand.logo = await one(c.brand.logo);
  for (const s of c.sections) { s.banner = await one(s.banner); for (const x of s.cells) x.image = await one(x.image); }
  return c;
}
/** Everything a buyer must not get is removed here (nothing private is stored in the config, but be explicit). */
/** Free plan: the Native Clouds / Sunrise mark is always on. Paid plans keep the owner's choice. */
export function withCredit(c: ShopConfig): ShopConfig { return plan.get().brandedDocs ? {...c, credit: c.credit || SUNRISE_CREDIT} : {...c, credit: SUNRISE_CREDIT}; }
function forBuyers(c: ShopConfig): ShopConfig {
  const x: ShopConfig = JSON.parse(JSON.stringify(withCredit(c)));
  for (const s of x.sections) s.cells = s.cells.filter(cell => !cell.hidden);
  return x;
}
const safe = (s: string) => s.replace(/<\/(script)/gi, '<\\/$1').replace(/<!--/g, '<\\!--');
export function html(cfg: ShopConfig, mode: 'file' | 'edit' | 'gallery' | 'bazaar' = 'file') {
  const title = cfg.brand.name.replace(/[<>&"]/g, '');
  return `<!doctype html><html lang="${cfg.lang}"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>${title}</title><meta name="description" content="${(cfg.hero.sub || '').replace(/[<>&"]/g, '').slice(0, 160)}"><meta name="generator" content="Sunrise Workshop · My shop">
${mode === 'file' ? headTags(cfg, safe) + '\n' : ''}<style>html,body{margin:0}${RUNTIME_CSS}</style></head><body>
<div id="shop" data-mode="${mode}"></div>
<script type="application/json" id="shop-data">${safe(JSON.stringify(cfg))}</script>
<script>${safe(RUNTIME_JS)}</script></body></html>`;
}
/** The file to send: images inside, cabinet out. */
export async function packFile(cfg: ShopConfig) {
  // Every picture is stored once (the same banner may be used by several cells).
  const assets: string[] = []; const idx = new Map<string, number>();
  const c0 = forBuyers(await mapImages(cfg, toDataUrl));
  const c = await mapImages(c0, src => { if (!idx.has(src)) { idx.set(src, assets.length); assets.push(src); } return '#a' + idx.get(src); });
  (c as any).assets = assets;
  const text = html(c, 'file'); const blob = new Blob([text], {type: 'text/html'});
  return {blob, name: fileName(cfg), size: blob.size};
}
/** For the portal preview iframe: same page, images by URL (fast), edit buttons on. */
export async function previewHtml(cfg: ShopConfig, mode: 'edit' | 'gallery') { return html(await mapImages(withCredit(cfg), abs), mode); }
export const fileName = (cfg: ShopConfig) => (cfg.brand.name || 'shop').replace(/[\\/:*?"<>|]/g, '').trim().slice(0, 60) + '.html';

/** Ready-to-host folder: index.html (the same file) + a short README. Any static hosting accepts it. */
export async function packSite(cfg: ShopConfig) {
  const {blob} = await packFile(cfg);
  const {zipSync, strToU8} = await import('fflate');
  const readme = `${cfg.brand.name}\n\nThis folder is your whole website: one index.html.\n\nPublish it (free options):\n- Netlify Drop: open https://app.netlify.com/drop and drag this folder in.\n- Cloudflare Pages: Create project > Upload assets > this folder.\n- GitHub Pages: new repository > upload index.html > Settings > Pages > Deploy from branch.\n\nPayments go to the EVM addresses inside the page (USDC on Base). Keep this file private until the addresses are correct.\n`;
  const buyers = forBuyers(cfg);
  const zip = zipSync({'index.html': new Uint8Array(await blob.arrayBuffer()), 'README.txt': strToU8(readme + AI_README),
    'products.json': strToU8(JSON.stringify(manifest(buyers), null, 1)), 'llms.txt': strToU8(llmsTxt(buyers))});
  return {blob: new Blob([zip], {type: 'application/zip'}), name: fileName(cfg).replace(/\.html$/, '') + ' (site).zip'};
}

const AI_README = `\nFor AI assistants and search (already done for you):\n- products.json: the price list as data (nativeclouds.pricelist.v1).\n- llms.txt: a short description for language models.\n- index.html carries the same list plus schema.org markup.\nAfter publishing, put the site address into the shop admin (Опубликовать для ИИ) and pack again, so links point to it.\n`;

/** Photos are shrunk before they go into the shop, so the file stays small enough for messengers. */
export async function compressImage(file: Blob, maxEdge = 1600, quality = 0.78): Promise<string> {
  const bmp = await createImageBitmap(file); const k = Math.min(1, maxEdge / Math.max(bmp.width, bmp.height));
  const c = document.createElement('canvas'); c.width = Math.round(bmp.width * k); c.height = Math.round(bmp.height * k);
  c.getContext('2d')!.drawImage(bmp, 0, 0, c.width, c.height); bmp.close?.();
  const webp = c.toDataURL('image/webp', quality);
  return webp.startsWith('data:image/webp') ? webp : c.toDataURL('image/jpeg', quality);
}
