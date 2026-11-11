// Grok 2026-11-03 (favtabs): reusable favorites-category switcher (Market, Garage, My Space).
import React, {useEffect, useSyncExternalStore} from 'react';
import {FAV_KINDS, FAV_KIND_LABEL, kindCounts, getFavKind, setFavKind, resetFavKind, subscribeFavKind} from './favKinds.mjs';
import './favKindTabs.css';
import {msg} from '../../shared/market-copy.mjs';
import {getLocale, subscribeLocale} from '../i18n/locale-store.mjs';
// favtabs-i18n: labels follow the portal language (8 langs via market-copy rows favk*)
const KMSG: any = {market: 'favkMarket', food: 'favkFood', recipe: 'favkRecipe', music: 'favkMusic', movie: 'favkMovie', book: 'favkBook', all: 'all'};
export function favKindLabel(k: string, lang: string) { return msg(KMSG[k] || 'all', lang); }
function usePortalLang() { return useSyncExternalStore(subscribeLocale, getLocale, () => 'ru') as string; }
export function useFavKind(container: string) {
  useEffect(() => { resetFavKind(container); }, [container]);
  return useSyncExternalStore(subscribeFavKind, () => getFavKind(container), () => getFavKind(container)) as string;
}
export function favEmptyText(kind: string, _ru = true) { const lang = getLocale() as string; return kind === 'all' ? msg('favkNone', lang) : msg('favkEmpty', lang) + ': ' + favKindLabel(kind, lang); }
export function FavKindTabs({container, list, ru = true}: {container: string; list: any[]; ru?: boolean}) {
  const cur = useFavKind(container); const c: any = kindCounts(list); const lang = usePortalLang();
  const kinds = FAV_KINDS; // favtabs2: always show every category (empty one => empty list)
  const tip = (k: string) => favKindLabel(k, lang) + ' · ' + c[k];
  return <div className="fk-tabs" role="tablist" aria-label={msg('favkCats', lang)} data-testid={'fk-tabs-' + container}>
    {kinds.map(k => <button key={k} type="button" role="tab" aria-selected={cur === k} title={tip(k)} className={'fk-tab' + (cur === k ? ' on' : '')} onClick={() => setFavKind(container, k)} data-testid={'fk-' + container + '-' + k}>{(FAV_KIND_LABEL as any)[k].s}</button>)}
    <button type="button" role="tab" aria-selected={cur === 'all'} title={tip('all')} className={'fk-tab fk-all' + (cur === 'all' ? ' on' : '')} onClick={() => setFavKind(container, 'all')} data-testid={'fk-' + container + '-all'}>{favKindLabel('all', lang)}</button>
  </div>;
}
