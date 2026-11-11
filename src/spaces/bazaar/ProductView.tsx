// Product popup inside the Bazaar: big gallery with zoom under the cursor, all photos, price, options, description.
// The shop's own site opens only from the button. Missing details are fetched from /api/product (Shopify .js / WooCommerce Store API).
import {useEffect, useRef, useState} from 'react';
import {bazaar} from './store';

export type Product = {title: string; price: string | null; currency?: string | null; image: string | null; images?: string[]; url: string;
  description?: string; compareAt?: string | null; options?: {name: string; values: string[]}[]; rating?: number | null; reviews?: number | null;
  available?: boolean | null; seller?: string | null; store?: string; category?: string; variants?: {id?: number; title: string; price: string; available: boolean}[]; vendor?: string | null; lat?: number; lon?: number; engine?: string};
/** OpenStreetMap: a map window around a point (no key). */
export const osmEmbed = (lat: number, lon: number, d = 0.004) => `https://www.openstreetmap.org/export/embed.html?bbox=${lon - d * 1.6},${lat - d},${lon + d * 1.6},${lat + d}&layer=mapnik&marker=${lat},${lon}`;
export const osmTile = (lat: number, lon: number, z = 16) => { const n = 2 ** z, r = lat * Math.PI / 180; const x = Math.floor((lon + 180) / 360 * n), y = Math.floor((1 - Math.log(Math.tan(r) + 1 / Math.cos(r)) / Math.PI) / 2 * n); return `https://tile.openstreetmap.org/${z}/${x}/${y}.png`; };
const hasGeo = (p: Product) => Number.isFinite(p.lat) && Number.isFinite(p.lon);

const money = (v: string | null | undefined, cur?: string | null) => !v ? '' : cur && cur !== 'USD' ? `${Number(v).toLocaleString()} ${cur}` : `$${Number(v).toFixed(2)}`;
/** Ask the shop's image server for a smaller file when it can resize (Shopify CDN: ?width=). Cards get ~400px, the big view ~1600px, not the 4000px original. */
export const sized = (u: string | null | undefined, w: number) => { if (!u) return u || ''; const abs = u.startsWith('//') ? 'https:' + u : u;
  if (/cdn\.shopify\.com|\/cdn\/shop\//.test(abs)) { try { const x = new URL(abs); x.searchParams.set('width', String(w)); return x.toString(); } catch { return abs; } }
  return abs; };
// Same picture, different link (CDN size, ?v=, protocol): compare by the file name without size suffixes.
const imgKey = (u: string) => u.replace(/^https?:/, '').split('?')[0].replace(/_(\d+x\d*|\d*x\d+|pico|icon|thumb|small|compact|medium|large|grande|original|master)(@\dx)?(?=\.[a-z]+$)/i, '').replace(/-\d+x\d+(?=\.[a-z]+$)/i, '').toLowerCase().split('/').pop() || u;
const mergeImgs = (have: string[], more: string[]) => { const out = [...have]; const seen = new Set(have.map(imgKey)); for (const m of more) { const k = imgKey(m); if (!seen.has(k)) { seen.add(k); out.push(m); } } return out; };
const host = (u: string) => { try { return new URL(u).hostname.replace(/^www\./, ''); } catch { return ''; } };

export function ProductView({p, onClose, onPrev, onNext, onSave, idx, total}: {p: Product; onClose: () => void; onPrev?: () => void; onNext?: () => void; onSave?: (p: Product) => void; idx?: number; total?: number}) {
  const [full, setFull] = useState<Product>(p); const [i, setI] = useState(0); const [zoom, setZoom] = useState(false); const [pos, setPos] = useState('50% 50%');
  const [loading, setLoading] = useState(false); const [saved, setSaved] = useState(false);
  const stage = useRef<HTMLDivElement>(null);
  useEffect(() => { setFull(p); setI(0); setZoom(false); setSaved(false);
    const thin = (p.images?.length || 0) < 2 || !p.description || !p.options?.length;
    if (!thin || !/^https:\/\//.test(p.url) || p.store === 'market') return;
    let alive = true; setLoading(true);
    fetch(`/api/product?url=${encodeURIComponent(p.url)}`).then(r => r.json()).then(d => { if (!alive || d.error) return;
      setFull(x => ({...x, images: mergeImgs((x.images?.length ? x.images : [x.image]).filter(Boolean) as string[], d.images || []), description: d.description || x.description, options: d.options?.length ? d.options : x.options,
        compareAt: x.compareAt || d.compareAt, rating: x.rating ?? d.rating, reviews: x.reviews ?? d.reviews, variants: d.variants, vendor: d.vendor, available: x.available ?? d.available, engine: d.engine})); })
      .catch(() => undefined).finally(() => alive && setLoading(false));
    return () => { alive = false; };
  }, [p]);
  const imgs = (full.images?.length ? full.images : [full.image]).filter(Boolean) as string[];
  const go = (d: number) => { if (imgs.length) { setI((i + d + imgs.length) % imgs.length); setZoom(false); } };
  useEffect(() => { const k = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); if (e.key === 'ArrowRight') go(1); if (e.key === 'ArrowLeft') go(-1); };
    window.addEventListener('keydown', k); return () => window.removeEventListener('keydown', k); });
  const move = (e: React.MouseEvent) => { const r = stage.current!.getBoundingClientRect(); setPos(`${((e.clientX - r.left) / r.width * 100).toFixed(1)}% ${((e.clientY - r.top) / r.height * 100).toFixed(1)}%`); };
  const src = imgs[i]; const desc = full.description || '';
  // Swap the big picture only after the new file is loaded: no blank flash, no reload of the same picture.
  const [shown, setShown] = useState<string | undefined>(src);
  useEffect(() => { if (!src || src === shown) return; let ok = true; const im = new Image(); im.onload = im.onerror = () => { if (ok) setShown(src); }; im.src = sized(src, 1600); if (im.complete) setShown(src); return () => { ok = false; }; }, [src]);
  const shop = full.seller || full.vendor || host(full.url);

  const isFav = saved || bazaar.isFavorite(full.title, full.url);
  const opts = (full.options || []).filter(o => !(o.values.length === 1 && /default/i.test(o.values[0])));
  // Fixed frame: the window never changes size. Each area (photo, thumbnails, head, details, actions, player) has its own box;
  // only the content inside the boxes changes when you flip products.
  return <div className="bz-pv-veil" onClick={onClose} data-testid="bz-pv">
    <div className="bz-pv" onClick={e => e.stopPropagation()} role="dialog" aria-label={full.title}>
      <button type="button" className="bz-pv-x" onClick={onClose} aria-label="Закрыть">×</button>
      <div className="bz-pv-gal">
        <div ref={stage} className={'bz-pv-stage' + (zoom ? ' z' : '')} onMouseMove={zoom ? move : undefined} onClick={e => { if (!src) return; if (!zoom) move(e); setZoom(!zoom); }} data-testid="bz-pv-stage">
          {shown && <div className="bz-pv-img" style={{backgroundImage: `url("${sized(shown, 1600).replace(/"/g, '%22')}")`, backgroundPosition: zoom ? pos : 'center', backgroundSize: zoom ? '240%' : 'contain'}}/>}
          {!shown && hasGeo(full) && <iframe className="bz-pv-map" title="Карта" src={osmEmbed(full.lat!, full.lon!)} loading="lazy" onClick={e => e.stopPropagation()} data-testid="bz-pv-map"/>}
          {!shown && !hasGeo(full) && <span className="bz-pv-noimg">нет фото</span>}
          <button type="button" className="bz-pv-arr l" style={{visibility: imgs.length > 1 ? 'visible' : 'hidden'}} onClick={e => { e.stopPropagation(); go(-1); }} aria-label="Предыдущее фото">‹</button>
          <button type="button" className="bz-pv-arr r" style={{visibility: imgs.length > 1 ? 'visible' : 'hidden'}} onClick={e => { e.stopPropagation(); go(1); }} aria-label="Следующее фото">›</button>
          <span className="bz-pv-hint" style={!shown && hasGeo(full) ? {display: 'none'} : undefined}>{zoom ? 'ведите мышью · клик — уменьшить' : 'клик — увеличить'}{imgs.length > 1 ? ` · ${i + 1} / ${imgs.length}` : ''}</span>
        </div>
        <div className="bz-pv-thumbs">{imgs.length > 1 ? imgs.map((t, k) => <button key={k} type="button" aria-pressed={k === i} onClick={() => { setI(k); setZoom(false); }} aria-label={`Фото ${k + 1}`}><img src={sized(t, 160)} alt="" loading="lazy" decoding="async"/></button>) : <span className="bz-pv-thumbs-empty">{loading ? 'загружаю фото…' : 'одно фото'}</span>}</div>
      </div>
      <div className="bz-pv-info">
        <div className="bz-pv-head">
          <small className="bz-pv-shop">{shop}{full.category ? ' · ' + full.category : ''}</small>
          <h3 title={full.title}>{full.title}</h3>
          <div className="bz-pv-price"><b>{money(full.price, full.currency)}</b>{full.compareAt && <s>{money(full.compareAt, full.currency)}</s>}
            {full.compareAt && full.price && <em>−{Math.round((1 - Number(full.price) / Number(full.compareAt)) * 100)}%</em>}</div>
          <div className="bz-pv-meta">{full.available === false ? <span className="no">нет в наличии</span> : full.available ? <span className="yes">в наличии</span> : <span>&nbsp;</span>}
            {full.rating ? <span>★ {full.rating.toFixed(1)}{full.reviews ? ` · ${full.reviews} отзывов` : ''}</span> : null}<span className="bz-pv-load" style={{visibility: loading ? 'visible' : 'hidden'}}>загружаю детали…</span></div>
        </div>
        <div className="bz-pv-body">
          {opts.map(o => <div key={o.name} className="bz-pv-opt"><small>{o.name}</small><div>{o.values.map(v => <span key={v}>{v}</span>)}</div></div>)}
          {desc ? <p className="bz-pv-text">{desc}</p> : <p className="bz-pv-text muted">{loading ? '' : 'Магазин не прислал описания.'}</p>}
        </div>
        <div className="bz-pv-actions">
          {(() => { const v = full.engine === 'shopify' && (full.variants || []).find(x => x.available && x.id); if (!v) return null; let o = ''; try { o = new URL(full.url).origin; } catch { return null; }
            return <a className="bz-btn acc bz-pv-cart" href={`${o}/cart/${v.id}:1`} target="_blank" rel="noreferrer" data-testid="bz-pv-cart" title={'Касса магазина с этим товаром в корзине' + (full.variants!.length > 1 ? ' · вариант: ' + v.title : '')}>Сразу к оплате ↗</a>; })()}
          {/^https?:\/\//.test(full.url || '') ? <a className="bz-btn" href={full.url} target="_blank" rel="noreferrer" data-testid="bz-pv-go">{/wolt\.com/.test(full.url) ? 'Открыть в Wolt ↗' : /openstreetmap\.org/.test(full.url) ? 'Открыть на карте ↗' : 'Перейти в магазин ↗'}</a> : <span className="bz-btn" aria-disabled="true">Ссылки нет</span>}
          {onSave && <button type="button" className={'bz-btn' + (isFav ? ' on' : '')} onClick={() => { onSave(full); setSaved(true); }} data-testid="bz-pv-save">{isFav ? '★ В избранном' : '☆ В избранное'}</button>}
          <button type="button" className="bz-btn" onClick={() => navigator.clipboard?.writeText(full.url)}>Копировать ссылку</button>
        </div>
        <div className="bz-pv-player" role="group" aria-label="Листать товары">
          <button type="button" className="bz-pv-skip" disabled={!onPrev} onClick={onPrev} aria-label="Предыдущий товар" data-testid="bz-pv-prev">
            <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6 5h2v14H6zM20 5v14L9.5 12z"/></svg></button>
          <div className="bz-pv-count"><b>{idx != null ? idx + 1 : '–'}</b><span>из {total ?? '–'}</span><small>товары в выдаче</small></div>
          <button type="button" className="bz-pv-skip" disabled={!onNext} onClick={onNext} aria-label="Следующий товар" data-testid="bz-pv-next">
            <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M16 5h2v14h-2zM4 5v14l10.5-7z"/></svg></button>
        </div>
      </div>
    </div>
  </div>;
}
