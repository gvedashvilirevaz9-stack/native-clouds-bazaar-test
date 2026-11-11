// overlay37: MarketSpace favorites — browser localStorage only, numbered in add order.
import {BLOCKED} from './blockedData.ts';
import {favKind} from './favKinds.mjs'; // Grok 2026-11-03 (favtabs)
import {photoKey, isOurPlaceholder} from './photoKeys.ts'; // overlay38: category photo for favorites
export const FAV_KEY = 'sunrise.marketspace.favorites.v1';
export type Fav = {id: string; title: string; url: string | null; provider: string; category: string; image: string | null; addedAt: number; photo?: string | null; section?: string; price?: string | null; kind?: string};
type Store = Pick<Storage, 'getItem' | 'setItem'>;
const TLD = new RegExp(`\\.(${BLOCKED.suspiciousTlds.join('|')})$`, 'i');
/** Same rules as server/sunrise402-safelinks.mjs blockReason(). */
export function isBlockedUrl(url?: string | null) { if (!url) return false; let u: URL; try { u = new URL(url); } catch { return false; } const h = u.hostname.toLowerCase().replace(/^www\./, '');
  if (BLOCKED.hosts.some(x => h === x.host || h.endsWith('.' + x.host))) return true; const ul = url.toLowerCase(); if (BLOCKED.urls.some(x => ul.startsWith(x.url.toLowerCase()))) return true; return TLD.test(h) && h.split('.').length > 2; }
export function marketQuery(url?: string | null) {
  if (!url || !url.startsWith('#/shop?')) return null;
  const p = new URLSearchParams(url.slice(7)), q = p.get('q')?.trim();
  return [...p.keys()].every(k => k === 'q') && p.getAll('q').length === 1 && q && q.length <= 300 && !/[\u0000-\u001f]/.test(q) ? q : null;
}
export function safeUrl(url?: string | null) {
  const query = marketQuery(url); if (query) return '#/shop?q=' + encodeURIComponent(query);
  if (!url || !/^https?:\/\//i.test(url) || isBlockedUrl(url)) return null;
  try { const u = new URL(url); return u.username || u.password ? null : url; } catch { return null; }
}
/** Stable id: normalized url (no scheme/www/query/hash/trailing slash) or provider+title. Map/search links are not unique per item, so they fall back to provider+title. */
export function normUrl(url?: string | null) { if (!url) return ''; try { const u = new URL(url); if (/openstreetmap|google\.[a-z.]+\/maps|maps\.google|yandex\.[a-z]+\/maps/i.test(u.hostname + u.pathname) || /[?&](q|query|search)=/.test(u.search)) return ''; return (u.hostname.replace(/^www\./, '') + u.pathname).replace(/\/+$/, '').toLowerCase(); } catch { return ''; } }
const norm = (s: any) => String(s || '').toLowerCase().replace(/\s+/g, ' ').trim();
export function favId(it: any) { if (it && typeof it.addedAt === 'number' && /^[up]:/.test(String(it.id))) return it.id; /* a stored Fav */ const u = normUrl(it?.buy?.url || it?.url || it?.website); return u ? 'u:' + u : 'p:' + norm(it?.provider) + '|' + norm(it?.title); }
/** overlay38: real image only if it is not our generic placeholder. */
export const realImage = (src: any) => typeof src === 'string' && src && !isOurPlaceholder(src) && /^(https?:)?\/\/|^\//.test(src) ? src : null;
/** overlay38: banner key from category / section / title only (never address). */
export function favPhoto(f: {category?: string; section?: string; title?: string; cuisine?: string}) { return photoKey({id: f.section || '', title: f.category || ''}, {title: f.title || '', category: f.category || '', cuisine: f.cuisine || ''}); }
/** overlay38: what to show — own image first, else category photo key. Works for old saved favorites too (migration). */
export function favVisual(f: Fav): {image: string | null; photo: string | null} { const image = realImage(f.image); return {image, photo: image ? null : (f.photo || favPhoto(f))}; }
export function migrateFavs(list: Fav[]): {list: Fav[]; changed: boolean} { let changed = false; const out = list.map(f => { const v = favVisual(f); if ((f.image && !v.image) || (!v.image && v.photo && f.photo !== v.photo)) { changed = true; return {...f, image: v.image, photo: v.photo}; } return f; }); return {list: out, changed}; }
export function toFav(it: any, category = '', now = Date.now(), sec?: {id?: string; title?: string}): Fav { const image = realImage(it?.image); const photo = image ? null : photoKey({id: sec?.id || '', title: sec?.title || category}, {title: it?.title, category: it?.category || category, cuisine: it?.cuisine}); const price = it?.priceLabel != null || it?.price != null ? String(it?.priceLabel || it?.price || '').slice(0, 60) : ''; return {photo, section: String(sec?.id || ''), ...{id: favId(it), title: String(it?.title || '').slice(0, 160), url: safeUrl(it?.buy?.url || it?.url || it?.website), provider: String(it?.provider || '').slice(0, 60), category: String(category || it?.category || it?.cuisine || '').slice(0, 80), image, price: price || null, addedAt: now, kind: favKind({kind: it?.kind, section: sec?.id, category: String(category || it?.category || ''), provider: it?.provider})}}; }
export function loadFavs(s: Store | null = typeof localStorage !== 'undefined' ? localStorage : null): Fav[] { try { const v = JSON.parse(s?.getItem(FAV_KEY) || '[]'); return Array.isArray(v) ? v.filter(f => f && typeof f.id === 'string' && f.title).map(f => ({...f, url: safeUrl(f.url)})) : []; } catch { return []; } }
export function saveFavs(list: Fav[], s: Store | null = typeof localStorage !== 'undefined' ? localStorage : null, strict = false) {
  try { if (!s) throw new Error('FAVORITES_STORAGE_UNAVAILABLE'); s.setItem(FAV_KEY, JSON.stringify(list)); }
  catch { if (strict) throw new Error('FAVORITES_STORAGE_UNAVAILABLE'); }
}
export function addFavorite(it: any, category = '', sec?: {id?: string; title?: string}, s: Store | null = typeof localStorage !== 'undefined' ? localStorage : null) {
  const list = loadFavs(s), id = favId(it);
  const existing = list.findIndex(f => f.id === id);
  if (existing >= 0) return {list, favorite: list[existing], number: existing + 1, added: false};
  const favorite = toFav(it, category, Date.now(), sec), next = [...list, favorite];
  saveFavs(next, s, true);
  return {list: next, favorite, number: next.length, added: true};
}
export function toggleFav(list: Fav[], it: any, category = '', now = Date.now(), sec?: {id?: string; title?: string}): Fav[] { const id = favId(it); return list.some(f => f.id === id) ? list.filter(f => f.id !== id) : [...list, toFav(it, category, now, sec)]; }
export const isFav = (list: Fav[], it: any) => { const id = favId(it); return list.some(f => f.id === id); };
/** overlay38: top-level category for the default-view chips (from stored category/section/title via the photo mapping). */
const GROUPS: [RegExp, string][] = [[/^(pizza|burger|fastfood|restaurant|cuisine-|delivery|groceries)/, 'Еда'], [/^(clothing|shoes)$/, 'Одежда'], [/^(bank|exchange|rates-online|national-bank)$/, 'Банки'], [/^crypto$/, 'Крипто'],
  [/^(toys-|board-games)/, 'Игрушки'], [/^(phones|electronics)$/, 'Электроника'], [/^tour-/, 'Туры'], [/^(cinema|theatre|opera|tickets|museum)$/, 'Культура'], [/^(bus|metro|taxi|car-route|navigator|airport)$/, 'Транспорт'], [/^(embassy|school|community)$/, 'Сервисы']];
export function favGroup(f: Fav) { const k = f.photo || favPhoto(f) || ''; return GROUPS.find(([re]) => re.test(k))?.[1] || 'Другое'; }
export function favGroups(list: Fav[]) { const out: string[] = []; for (const f of list) { const g = favGroup(f); if (!out.includes(g)) out.push(g); } return out; }
