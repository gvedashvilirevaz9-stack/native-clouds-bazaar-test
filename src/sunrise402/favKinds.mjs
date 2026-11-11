// Grok 2026-11-03 (favtabs): one favorites store, viewed per container through a kind filter.
// kinds: market (Market Space), food, music, movie, book (Home). Old items without kind are inferred.
export const FAV_KINDS = ['market', 'food', 'recipe', 'music', 'movie', 'book']; // favtabs2: + recipe
export const FAV_KIND_LABEL = {market: {s: 'M', ru: 'Маркет', en: 'Market'}, food: {s: '🍕', ru: 'Еда', en: 'Food'}, recipe: {s: '📜', ru: 'Рецепты', en: 'Recipes'}, music: {s: '♪', ru: 'Музыка', en: 'Music'}, movie: {s: '🎬', ru: 'Кино', en: 'Movies'}, book: {s: '📖', ru: 'Книги', en: 'Books'}, all: {s: 'All', ru: 'Все', en: 'All'}};
const HOME = {food: 'food', music: 'music', cinema: 'movie', series: 'movie', movie: 'movie', books: 'book', book: 'book', recipe: 'recipe', recipes: 'recipe'};
export function favKind(f) {
  if (f && FAV_KINDS.includes(f.kind)) return f.kind;
  const sec = String(f?.section || ''), cat = String(f?.category || '').toLowerCase(), prov = String(f?.provider || '').toLowerCase();
  if (sec.startsWith('home-')) return HOME[sec.slice(5)] || HOME[cat] || 'market';
  if (FAV_KINDS.includes(cat) && cat !== 'market') return cat;
  if (/^(itunes|deezer|apple|youtube|yandex)/.test(prov)) return 'music';
  return 'market';
}
/** Filtered list with 1..N numbering of the filtered order (what the user sees and says). */
export function filterFavs(list, kind) { return (list || []).filter(f => kind === 'all' || favKind(f) === kind).map((f, i) => ({f, n: i + 1})); }
export function kindCounts(list) { const c = {all: (list || []).length}; for (const k of FAV_KINDS) c[k] = 0; for (const f of list || []) c[favKind(f)]++; return c; }
// Per-container choice. Market always opens on 'market' (not remembered); others remember, default 'all'.
export const FAV_CONTAINERS = {market: {def: 'market', remember: false}, garage: {def: 'all', remember: true}, personal: {def: 'all', remember: true}};
const KEY = c => 'sunrise.favorites.kind.' + c; const mem = {}; const subs = new Set();
const store = () => (typeof localStorage !== 'undefined' ? localStorage : null);
export function getFavKind(c, s = store()) { if (mem[c]) return mem[c]; const cfg = FAV_CONTAINERS[c] || {def: 'all', remember: true}; let v = null; if (cfg.remember) try { v = s?.getItem(KEY(c)); } catch {} return v === 'all' || FAV_KINDS.includes(v) ? v : cfg.def; }
export function setFavKind(c, kind, s = store()) {
  if (kind !== 'all' && !FAV_KINDS.includes(kind)) throw new Error('INVALID_KIND');
  const cfg = FAV_CONTAINERS[c] || {def: 'all', remember: true}; mem[c] = kind; if (cfg.remember) try { s?.setItem(KEY(c), kind); } catch {}
  subs.forEach(f => f()); return {container: c, kind, label: FAV_KIND_LABEL[kind].ru};
}
/** Market resets to 'market' each time its favorites open. */
export function resetFavKind(c) { if (FAV_CONTAINERS[c] && !FAV_CONTAINERS[c].remember) { delete mem[c]; subs.forEach(f => f()); } }
export function subscribeFavKind(f) { subs.add(f); return () => { subs.delete(f); }; }

// Grok 2026-11-03 (favtabs2): two Market favorites vanished from localStorage (no app code path deletes them; most likely a ★ toggle or
// another browser origin/profile). Recovered from server receipts (spaces.open market, 12:20 Tbilisi). Re-added ONCE if missing; never again after.
export const RECOVERED_FAVS = [
  {id: 'u:poshshoes.com/product/clay-sneakers-7', title: 'Clay Sneakers', url: 'https://poshshoes.com/product/clay-sneakers-7/', provider: 'Posh Shoes', category: 'Грузия · Кроссовки и кеды', image: null, photo: null, section: '', price: null, kind: 'market'},
  {id: 'u:myvelo.ge', title: 'მაი ველო', url: 'https://myvelo.ge/', provider: 'OpenStreetMap', category: 'Грузия · Велосипеды', image: null, photo: null, section: '', price: null, kind: 'market'}];
export const RESTORE_FLAG = 'sunrise.favorites.restored.favtabs2';
export function restoreOnce(list, s) { try { if (!s || s.getItem(RESTORE_FLAG)) return null; s.setItem(RESTORE_FLAG, '1'); } catch { return null; }
  const add = RECOVERED_FAVS.filter(r => !(list || []).some(f => f.id === r.id)).map((r, i) => ({...r, addedAt: Date.now() - 1000 + i}));
  return add.length ? [...add, ...(list || [])] : null; }
