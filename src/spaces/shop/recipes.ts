// Recipes: the agent turns "I'm selling junk from my basement" or "my VHS collection" into a full
// mini-site in one call. The person only answers what cannot be guessed: items, prices, photos,
// banner, wallet, contact. Everything else (texts, sections, icons, colours) comes from the recipe.
import {bakuriani, section, cell, theme, normPrice, uid, type ShopConfig, type Cell, type Img} from './model';

export type Kind = 'goods' | 'collection' | 'handmade' | 'services' | 'single' | 'rental' | 'food';
export type ItemIn = {title: string; price?: string | number | null; qty?: number | null; text?: string; photo?: string | null; tags?: string[]; place?: string; seller?: string; receiver?: string; unit?: string};
export type Answers = {
  about: string;                       // in the person's words: "барахло из подвала", "моя коллекция VHS"
  kind?: Kind; name?: string; place?: string; lang?: 'ru' | 'en' | 'ka';
  items?: ItemIn[]; banner?: string | null; address?: string | null;
  contact?: {telegram?: string; whatsapp?: string; email?: string; phone?: string};
  delivery?: string; style?: string;   // theme preset id
};

export const RECIPES: Record<Kind, {ru: string; theme: string; radius: 'round' | 'soft' | 'square'; words: RegExp;
  sections: [string, string, string]; texts: [string, string, string]; mark: [string, string]; sticker: string}> = {
  goods: {ru: 'Вещи (распродажа)', theme: 'sea', radius: 'soft', words: /барахл|подвал|гараж|распрод|вещи|б\/у|бу\b|переезд|junk|garage|yard|sale|used/i,
    sections: ['Вещи', 'Обо мне', 'Как забрать'], texts: ['Всё в рабочем состоянии, торг уместен.', 'Кто продаёт и почему.', 'Самовывоз или договоримся о доставке. Оплата USDC.'], mark: ['SALE', 'clear out'], sticker: 'ВСЁ\nДЁШЕВО'},
  collection: {ru: 'Коллекция', theme: 'mono', radius: 'soft', words: /коллекц|кассет|vhs|винил|пластинк|книг|марк|монет|открыт|комикс|картрид|cd\b|dvd|record|vinyl|comic|stamp|coin/i,
    sections: ['Коллекция', 'Состояние', 'Как купить'], texts: ['Каждая позиция — с фото и описанием состояния.', 'Как хранилось, что проверено.', 'Отправлю почтой или передам лично.'], mark: ['RARE', 'archive'], sticker: 'ДЛЯ\nЦЕНИТЕЛЕЙ'},
  handmade: {ru: 'Хендмейд', theme: 'berry', radius: 'round', words: /ручн|хендмейд|handmade|серьг|кольц|украш|вязан|свеч|мыл|керам|шью|шить|jewel|craft/i,
    sections: ['Работы', 'На заказ', 'Доставка'], texts: ['Каждая вещь — в единственном экземпляре.', 'Сделаю по вашему эскизу.', 'Самовывоз, курьер или почта.'], mark: ['MADE', 'by hand'], sticker: 'ONE\nOF ONE'},
  services: {ru: 'Услуги', theme: 'coffee', radius: 'soft', words: /услуг|ремонт|мастер|урок|репетит|массаж|стриж|маникюр|фото|съёмк|уборк|ремонт|тренер|инструктор|service|lesson|repair/i,
    sections: ['Услуги', 'Работы', 'Как записаться'], texts: ['Цены за работу. Материалы — отдельно.', 'Примеры: до и после.', 'Напишите — согласуем время.'], mark: ['PRO', 'service'], sticker: 'ЗАПИСЬ\nОТКРЫТА'},
  single: {ru: 'Одна вещь', theme: 'sea', radius: 'soft', words: /машин|авто|квартир|дом\b|мотоцикл|лодк|car\b|apartment|house|bike|продаю одну/i,
    sections: ['Что продаю', 'Детали', 'Купить'], texts: ['Всё, что нужно знать.', 'Документы, история, состояние.', 'Задаток бронирует, остальное — при встрече.'], mark: ['FOR', 'sale'], sticker: 'ТОРГ\nЕСТЬ'},
  rental: {ru: 'Аренда / прокат', theme: 'mountain', radius: 'round', words: /аренд|прокат|сдаю|сдам|rent|rental|hire/i,
    sections: ['Что сдаю', 'Цены', 'Как забронировать'], texts: ['Всё чистое и проверенное.', 'Цена за день или час.', 'Оплата брони по QR, залог при встрече.'], mark: ['RENT', 'it'], sticker: 'БРОНЬ\nОНЛАЙН'},
  food: {ru: 'Еда', theme: 'coffee', radius: 'round', words: /торт|выпеч|пирог|обед|еда|кухн|кофе|хлеб|десерт|food|bake|cake|lunch/i,
    sections: ['Меню', 'О нас', 'Доставка'], texts: ['Готовим в день заказа.', 'Кто готовит и из чего.', 'Самовывоз или доставка по городу.'], mark: ['FRESH', 'today'], sticker: 'СЕГОДНЯ\nСВЕЖЕЕ'},
};
const ICON: [RegExp, string][] = [[/кассет|vhs|видео/i, '📼'], [/винил|пластинк|record/i, '💿'], [/книг|book/i, '📚'], [/велосипед|bike/i, '🚲'], [/кофе/i, '☕'], [/машин|авто|car\b/i, '🚗'],
  [/футбол|одежд|куртк|рубаш|платье|shirt/i, '👕'], [/обув|кроссов|ботин/i, '👟'], [/торт|выпеч|пирог|cake/i, '🍰'], [/серьг|кольц|украш|ring/i, '💍'], [/игрушк|lego|toy/i, '🧸'],
  [/инструмент|дрель|tool/i, '🛠'], [/телефон|phone/i, '📱'], [/ноутбук|компьютер|laptop/i, '💻'], [/стул|стол|мебел|шкаф|chair|table/i, '🪑'], [/лыж|сноуборд|ski|snow/i, '🏂'],
  [/цвет|букет|flower/i, '💐'], [/фото|камер|camera/i, '📷'], [/часы|watch/i, '⌚'], [/сумк|рюкзак|bag/i, '👜'], [/лампа|light/i, '💡'], [/посуд|тарел|чашк/i, '🍽'], [/картин|постер|art/i, '🖼'], [/урок|lesson/i, '🎓'], [/ремонт|repair/i, '🔧']];
export const iconFor = (t: string) => ICON.find(([re]) => re.test(t))?.[1] || '✳';
export function detectKind(a: Answers): Kind {
  if (a.kind && RECIPES[a.kind]) return a.kind;
  const t = [a.about, ...(a.items || []).map(i => i.title)].join(' ');
  if ((a.items || []).length === 1 && RECIPES.single.words.test(t)) return 'single';
  for (const k of ['collection', 'handmade', 'rental', 'food', 'services', 'single', 'goods'] as Kind[]) if (RECIPES[k].words.test(t)) return k;
  return 'goods';
}
const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);
const latin = (s: string) => (s.match(/[A-Za-z]{3,}/)?.[0] || '').toUpperCase().slice(0, 6);

/** Build the full shop from the answers. Photos are resolved separately (they can be slow). */
export function compose(a: Answers): {shop: ShopConfig; kind: Kind; photos: {cellId: string; src: string}[]} {
  const kind = detectKind(a); const r = RECIPES[kind]; const base = bakuriani();
  const about = (a.about || '').trim().replace(/[.!]+$/, ''); const name = (a.name || cap(about)).slice(0, 60);
  const items = (a.items || []).slice(0, 40);
  const photos: {cellId: string; src: string}[] = [];
  const cells: Cell[] = items.length ? items.map(i => {
    const c = cell({title: String(i.title || 'Позиция').slice(0, 80), text: (i.text || (i.qty && i.qty > 1 ? `В наличии: ${i.qty} шт.` : '')).slice(0, 300),
      tags: (i.tags || []).map(t => String(t).toUpperCase()).slice(0, 4), price: normPrice(i.price ?? null), unit: i.unit, icon: iconFor(i.title + ' ' + about),
      place: i.place, seller: i.seller, receiver: i.receiver || null, stock: i.qty ?? null, image: null});
    if (i.photo) photos.push({cellId: c.id, src: i.photo});
    return c;
  }) : [cell({title: 'Первая позиция', text: 'Добавьте фото и цену.', icon: iconFor(about)}), cell({title: 'Вторая позиция', icon: iconFor(about)})];
  const priced = cells.filter(c => c.price).map(c => Number(c.price));
  const from = priced.length ? Math.min(...priced) : null;
  const shop: ShopConfig = {...base, id: uid('shop'), updatedAt: Date.now(), lang: a.lang || 'ru',
    brand: {name, logo: null, stripLeft: `${r.ru.toUpperCase()} / ${(a.place || 'ONLINE').toUpperCase()}`, stripRight: 'ОПЛАТА USDC ✳ BASE', place: a.place || ''},
    hero: {...base.hero, eyebrow: `${r.ru.toUpperCase()} / 01`, title: name, sub: `${cap(about)}. ${from != null ? `Цены от ${from} USDC. ` : ''}Выберите, оплатите по QR и напишите мне.`,
      markTop: items.length ? `${items.length} шт` : 'NEW', markMain: latin(about) || r.mark[0], markItalic: r.mark[1], markSmall: (a.place || 'ONLINE').toUpperCase() + ' · USDC', sticker: r.sticker, sideText: 'DIRECT\nTO SELLER', show: true},
    discover: {eyebrow: '✳ ' + r.ru.toUpperCase(), title: r.sections[0].toUpperCase()},
    sections: [
      section({tab: r.sections[0], kicker: r.ru.toUpperCase(), title: r.sections[0] + '.', text: r.texts[0], side: (latin(about) || r.mark[0]) + ' / ' + items.length, cta: 'Смотреть', cells}),
      section({tab: r.sections[1], kicker: r.sections[1].toUpperCase(), title: r.sections[1] + '.', text: r.texts[1], side: 'INFO', cta: 'Подробнее', cells: [cell({title: r.sections[1], text: r.texts[1], icon: 'ℹ'})]}),
      section({tab: r.sections[2], kicker: 'КАК КУПИТЬ', title: r.sections[2] + '.', text: a.delivery || r.texts[2], side: 'HOW', cta: 'Узнать', cells: [
        cell({title: 'Выберите', text: 'Нажмите «В корзину».', icon: '①'}), cell({title: 'Оплатите по QR', text: 'USDC в сети Base, прямо на мой кошелёк.', icon: '②'}),
        cell({title: 'Напишите мне', text: a.delivery || 'Отправьте заказ кнопкой — договоримся о передаче.', icon: '③'})]}),
    ],
    payment: {...base.payment, address: null, mode: items.some(i => i.receiver) ? 'individual' : 'shared'},
    contact: {...(a.contact || {})},
    footer: {text: cap(about).toUpperCase().slice(0, 60) + '.', right: (a.place || 'ONLINE').toUpperCase() + ' ✳ ' + new Date().getFullYear()},
    theme: theme(a.style && a.style in {mountain: 1, sea: 1, coffee: 1, berry: 1, mono: 1} ? a.style : r.theme, r.radius)};
  if (a.banner) photos.push({cellId: 'banner:0', src: a.banner});
  return {shop, kind, photos};
}

/** What the agent must still ask for. Ordered by importance. */
export function missing(s: ShopConfig, addresses: number) {
  const out: {id: string; ask: string}[] = [];
  const priced = s.sections.flatMap(x => x.cells).filter(c => c.price);
  const sale = s.sections[0]?.cells || [];
  if (!sale.some(c => c.price)) out.push({id: 'prices', ask: 'Сколько стоит каждая позиция (в USDC)?'});
  const noPhoto = sale.filter(c => !c.image?.src);
  if (noPhoto.length) out.push({id: 'photos', ask: `Фото для: ${noPhoto.slice(0, 6).map(c => c.title).join(', ')}${noPhoto.length > 6 ? ` и ещё ${noPhoto.length - 6}` : ''}`});
  if (!s.sections[0]?.banner?.src) out.push({id: 'banner', ask: 'Баннер — одна широкая картинка для первого экрана (можно лучшее фото товара).'});
  if (priced.length && !addresses) out.push({id: 'address', ask: 'EVM-адрес для оплаты (сеть Base, USDC) — публичный адрес вашего кошелька.'});
  if (!s.contact.telegram && !s.contact.whatsapp && !s.contact.email && !s.contact.phone) out.push({id: 'contact', ask: 'Куда покупателю писать: Telegram, WhatsApp, e-mail или телефон?'});
  return out;
}

export const QUESTIONNAIRE = {
  intro: 'Чтобы собрать мини-сайт (магазин, прайс-лист и визитку в одном файле), мне нужно несколько ответов. Остальное соберу сам.',
  questions: [
    {id: 'about', required: true, ask: 'Что вы продаёте или делаете? Своими словами.', example: 'барахло из подвала / моя коллекция VHS-кассет / уроки сноуборда'},
    {id: 'items', required: true, ask: 'Список позиций: название, цена в USDC, сколько штук.', example: 'Видеомагнитофон Panasonic — 40, 1 шт; кассета «Терминатор» — 8, 3 шт'},
    {id: 'photos', required: false, ask: 'Фото позиций: перетащите в Приёмную портала или пришлите — я подставлю.', example: 'asset:… или ссылка https://…'},
    {id: 'banner', required: false, ask: 'Баннер — широкая картинка для первого экрана.', example: 'лучшее общее фото'},
    {id: 'address', required: true, ask: 'Ваш EVM-адрес для оплаты (USDC, сеть Base).', example: '0x…'},
    {id: 'contact', required: true, ask: 'Куда писать покупателю: Telegram, WhatsApp, e-mail или телефон.', example: '@username'},
    {id: 'name', required: false, ask: 'Название (если не скажете — придумаю из описания).', example: 'Подвал Гиорги'},
    {id: 'place', required: false, ask: 'Город или район — где забрать.', example: 'Тбилиси, Ваке'},
    {id: 'delivery', required: false, ask: 'Как отдаёте: самовывоз, курьер, почта.', example: 'самовывоз по вечерам'},
  ],
  tips: ['Цены можно дробные: 12.5. Не точнее центов — последние цифры суммы занимает номер заказа.', 'Фото лучше квадратные или горизонтальные, до 10 МБ — портал сам их сожмёт.'],
};
export async function resolveImage(src: string, edge = 1200): Promise<Img> {
  const {compressImage} = await import('./export');
  let blob: Blob;
  if (src.startsWith('asset:')) {
    const {intake, pageDataUrl} = await import('../intake/store'); const {getBlob} = await import('../garage/store');
    const a = intake.get(src.slice(6)); if (!a) throw new Error('ASSET_NOT_FOUND');
    const page = a.pages?.[0] ? await pageDataUrl(a.pages[0].ref) : null;
    blob = page ? await (await fetch(page)).blob() : (await getBlob(a.origRef!))!; if (!blob) throw new Error('ASSET_IMAGE_MISSING');
  } else if (src.startsWith('data:') || /^https?:\/\//.test(src)) blob = await (await fetch(src)).blob();
  else throw new Error('IMAGE_SOURCE_INVALID');
  return {src: await compressImage(blob, edge), pos: 'center'};
}
