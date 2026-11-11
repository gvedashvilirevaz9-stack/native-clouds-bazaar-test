// overlay34: pure photo-category mapping (no JSX) so it can be unit-tested with node.
export const SVG_TO: Record<string, string> = {bus: 'bus', metro: 'metro', taxi: 'taxi', route: 'car-route', cinema: 'cinema', theatre: 'theatre', opera: 'opera', tickets: 'tickets'};
// order matters: specific first
export const RULES: [RegExp, string][] = [
  [/life-pair|life-rates|nbg|нбг|официальн/, 'national-bank'], [/life-online|myfin|kursi|онлайн.*курс|агрегатор/, 'rates-online'], [/крипт|crypto/, 'crypto'],
  [/exchange|обмен|рико|валюто|гиро|rico|valuto|giro/, 'exchange'], [/(^|[^а-я])банк|bank/, 'bank'],
  [/посольств|embass|консул/, 'embassy'], [/школ|school|институт|institute|goethe|alliance|british council/, 'school'], [/community|сообществ|землячеств|клуб/, 'community'],
  [/кино|cinema|cavea|amirani/, 'cinema'], [/опер|opera|консерват|филармон|concert hall/, 'opera'], [/театр|theat|марионет/, 'theatre'], [/билет|ticket|tkt|biletebi/, 'tickets'], [/музе|museum|gallery|галере/, 'museum'],
  [/kazbeg|казбег|gudauri|гудаур|svaneti|сванет|juta|truso|горн|mountain|rafting|рафтинг|birtvisi/, 'tour-mountains'], [/kakheti|кахет|wine|вин|sighnaghi|сигнах|rtveli/, 'tour-wine'], [/tour|тур|экскурс|day trip/, 'tour-city'],
  [/аэропорт|airport|flight|авиа|перел[её]т/, 'airport'], [/metro|метро/, 'metro'], [/taxi|такси|bolt|yandex go/, 'taxi'], [/автобус|bus|общественн|transit/, 'bus'], [/машин|car route|osrm|маршрут/, 'car-route'], [/навигатор|navigator/, 'navigator'],
  [/пицц|pizza/, 'pizza'], [/бургер|burger/, 'burger'], [/фастфуд|fast ?food|kfc|mcdonald|шаурм|хот-?дог/, 'fastfood'], [/грузинск|georgian cuisine|хинкал|хачапур/, 'cuisine-georgian'], [/итальян|italian|паст[аы]/, 'cuisine-italian'],
  [/азиат|asian|суши|sushi|китай|chinese|japan|япон|wok|thai|тайск/, 'cuisine-asian'], [/греч|greek/, 'cuisine-greek'], [/доставк|delivery|wolt|glovo|food_delivery/, 'delivery'], [/ресторан|restaurant|кафе|cafe|food|еда/, 'restaurant'],
  [/кукл|doll|мягк|soft ?toy|плюш|girls|девоч/, 'toys-dolls'], [/машинк|toy car|hot wheels|boys|мальчик|lego|конструктор|игрушк|toy|kids/, 'toys-cars'], [/настольн|board ?game/, 'board-games'],
  [/телефон|смартфон|phone|iphone|samsung|xiaomi/, 'phones'], [/электрон|electronic|ноутбук|laptop|наушник|headphone|digital|appliances|техник/, 'electronics'],
  [/обув|shoe|кроссов|sneaker|ботин/, 'shoes'], [/одежд|cloth|куртк|плать|футболк|accessor/, 'clothing'], [/продукт|grocer|супермаркет|supermarket|carrefour|nikora|spar|goodwill|agrohub/, 'groceries']];
export const isOurPlaceholder = (src?: string | null) => !src || /\/sunrise\/shop\/(ph|banners)\/|banner-[a-z]+\.(webp|svg|png)/.test(src);
export function photoKey(sec: any, it: any): string | null {
  const m = String(it?.image || '').match(/\/banners\/([a-z]+)\.svg$/); if (m && SVG_TO[m[1]]) return SVG_TO[m[1]];
  // overlay34: category comes from section / category / cuisine first, then the item title. Never from subtitle/address/street (e.g. «Kazbegi Ave»).
  const pick = (t: string) => { const r = RULES.find(([re]) => re.test(t.toLowerCase())); return r ? r[1] : null; };
  return pick(`${it?.category || ''} ${it?.cuisine || ''}`) || pick(`${sec?.id || ''} ${sec?.title || ''}`) || pick(`${it?.title || ''}`); }
