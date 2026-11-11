// "My shop" data: one JSON document that fully describes the storefront.
// The same document is rendered in the portal preview and inside the exported single HTML file.
// Images are data: URLs so the file works offline and needs no server.

export type Img = {src: string; pos?: string} | null;       // pos: CSS background-position
export type Cell = {
  id: string; title: string; text: string; tags: string[];
  image: Img; price: string | null;                          // USDC, e.g. "25" or "12.5"; null = not for sale
  unit?: string; receiver?: string | null;                   // individual mode: this cell's own EVM address
  stock?: number | null; hidden?: boolean;
  icon?: string;                                             // shown when there is no photo yet
  place?: string;                                            // where to see / pick it up (opens the map)
  seller?: string;                                           // who sells it (multi-seller shops)
};
export type Section = {
  id: string; tab: string;                                   // tab label: "Каталог"
  kicker: string; title: string; text: string; side: string; // billboard texts
  banner: Img; cta?: string;                                 // billboard button text
  cells: Cell[];
};
export type Theme = {ink: string; paper: string; accent: string; accent2: string; dark: string; preset: string; radius: 'round' | 'soft' | 'square'};
export type ShopConfig = {
  v: 1; id: string; updatedAt: number; lang: 'ru' | 'en' | 'ka';
  brand: {name: string; logo: Img; stripLeft: string; stripRight: string; place: string};
  hero: {eyebrow: string; title: string; sub: string; markTop: string; markMain: string; markItalic: string; markSmall: string; sticker: string; sideText: string; show: boolean};
  discover: {eyebrow: string; title: string};
  sections: Section[];
  payment: {
    network: 'base'; token: 'USDC';
    mode: 'shared' | 'individual';                           // one address for all, or per cell
    address: string | null;                                  // shared receiver
    orderTag: boolean;                                       // encode the order number in the last 4 decimals
    windowMin: number;                                       // how long a QR is meant to be used
    note: string;
  };
  contact: {telegram?: string; whatsapp?: string; email?: string; phone?: string; instagram?: string};
  footer: {text: string; right: string};
  theme: Theme;
  /** Footer credit. Free plan: always the Native Clouds / Sunrise mark. Paid plans: own logo + link, or none. */
  credit?: {mode: 'sunrise' | 'own' | 'none'; text: string; url: string; logo: Img};
  /** Public address of the site once it is published (used in schema.org / products.json). Optional. */
  siteUrl?: string;
};
export const SUNRISE_URL = 'https://sunspace.club/';
export const SUNRISE_CREDIT = {mode: 'sunrise' as const, text: 'Native Clouds · Sunrise', url: SUNRISE_URL, logo: null};

export const THEMES: Record<string, Omit<Theme, 'preset' | 'radius'> & {ru: string}> = {
  mountain: {ru: 'Горы (как в лаборатории)', ink: '#101a1c', paper: '#f3f5f0', accent: '#c8f54e', accent2: '#3466ed', dark: '#172723'},
  sea: {ru: 'Море', ink: '#0f1d2b', paper: '#f2f6f9', accent: '#5ee0d0', accent2: '#ff7a59', dark: '#10283a'},
  coffee: {ru: 'Кофейня', ink: '#24170f', paper: '#f7f2ec', accent: '#f2b84b', accent2: '#b5543a', dark: '#2e1f16'},
  berry: {ru: 'Ягода', ink: '#1d1024', paper: '#f7f2f8', accent: '#ff6fb5', accent2: '#6b4cff', dark: '#26132f'},
  mono: {ru: 'Чёрно-белый', ink: '#111111', paper: '#f4f4f2', accent: '#ffffff', accent2: '#111111', dark: '#151515'},
};
export const theme = (preset = 'mountain', radius: Theme['radius'] = 'round'): Theme => ({...THEMES[preset] || THEMES.mountain, preset, radius} as any);

export const uid = (p = 'c') => p + '-' + Math.random().toString(36).slice(2, 8);
export const cell = (p: Partial<Cell> = {}): Cell => ({id: uid('c'), title: 'Новая ячейка', text: 'Короткое описание: что это и почему стоит купить.', tags: [], image: null, price: null, ...p});
export const section = (p: Partial<Section> = {}): Section => ({id: uid('s'), tab: 'Новый раздел', kicker: 'НОВЫЙ РАЗДЕЛ', title: 'Заголовок баннера.', text: 'Пара строк о том, что здесь найдёт покупатель.', side: '', banner: null, cta: 'Смотреть', cells: [cell(), cell(), cell()], ...p});

/** Normalises a price string: "12,5" → "12.5"; invalid → null. Max 6 decimals (USDC). */
export function normPrice(v: unknown): string | null {
  if (v == null || v === '') return null;
  const s = String(v).trim().replace(',', '.');
  if (!/^\d{1,9}(\.\d{1,6})?$/.test(s) || Number(s) <= 0) return null;
  return s.replace(/(\.\d*?)0+$/, '$1').replace(/\.$/, '');
}

// ---------- templates ----------
const SHOP = 'shop/';
export const TEMPLATE_IMAGES = ['bakuriani-travel.webp', 'bakuriani-services.webp', 'bakuriani-prices.webp', 'bakuriani-rider.webp'];

/** The Snowboarding Bakuriani lab, as an editable starting point (no real addresses). */
export function bakuriani(): ShopConfig {
  const rider = (pos: string): Img => ({src: SHOP + 'bakuriani-rider.webp', pos});
  return {
    v: 1, id: uid('shop'), updatedAt: Date.now(), lang: 'ru',
    brand: {name: 'Snowboarding Bakuriani', logo: null, stripLeft: 'GEORGIA / MOUNTAIN LIFE', stripRight: 'INTO THE WHITE ✳ BAKURIANI', place: 'Bakuriani'},
    hero: {eyebrow: 'ТВОЙ ГОРНЫЙ ГИД / 01', title: 'Горы ближе, чем кажется', sub: 'Уроки, прокат, катание и всё, что нужно знать перед поездкой. Оплата в USDC — прямо со страницы.',
      markTop: '87°', markMain: 'RIDE', markItalic: 'WILD', markSmall: 'GEORGIA · EST. IN THE SNOW', sticker: 'STAY\nSTOKED', sideText: 'POWDER\nSTATE OF MIND', show: true},
    discover: {eyebrow: '✳ THE MOUNTAIN IS CALLING', title: 'ТВОЙ ПЛАН НА ГОРЫ'},
    sections: [
      section({id: 'travel', tab: 'Как добраться', kicker: 'ГРУЗИЯ', title: 'Путешествие начинается здесь.', text: 'Трансфер из Тбилиси и Кутаиси, точка встречи у подъёмника. Напишите нам — встретим.', side: 'THE WAY TO THE MOUNTAINS', banner: {src: SHOP + 'bakuriani-travel.webp', pos: '65% 50%'}, cta: 'Маршрут',
        cells: [
          cell({title: 'Трансфер из Тбилиси', text: '3 часа, встреча в аэропорту, до 4 человек с досками.', tags: ['TRANSFER'], image: {src: SHOP + 'bakuriani-travel.webp', pos: '70% 50%'}, price: '0.03'}),
          cell({title: 'Точка встречи', text: 'У нижней станции канатки «Дидвели», 9:30 каждый день.', tags: ['MEETING'], image: rider('30% 40%')}),
          cell({title: 'Где жить', text: 'Подскажем гостевые дома рядом со склоном под ваш бюджет.', tags: ['STAY'], image: rider('60% 50%')})]}),
      section({id: 'services', tab: 'Услуги', kicker: 'ГРУЗИЯ', title: 'Всё для дней на склоне.', text: 'Катание, инструкторы, экипировка и трассы — местная команда.', side: 'BOARDS / SLOPES / GUIDES', banner: {src: SHOP + 'bakuriani-services.webp', pos: '67% 50%'}, cta: 'Выбрать',
        cells: [
          cell({title: 'Урок с инструктором', text: 'Первый спуск или уверенный прогресс. 2 часа, один на один.', tags: ['BEGINNER', 'PRIVATE'], image: rider('80% 55%'), price: '0.02', unit: '2 ч'}),
          cell({title: 'Прокат сноуборда', text: 'Доска, ботинки, крепления. Подберём по росту и уровню.', tags: ['BOARD', 'GEAR'], image: {src: SHOP + 'bakuriani-services.webp', pos: '75% 50%'}, price: '0.01', unit: 'день'}),
          cell({title: 'Катание на трассе', text: 'Маршруты под ваш уровень, сопровождение гида.', tags: ['SLOPES', 'GUIDE'], image: rider('30% 40%'), price: '0.03', unit: 'день'})]}),
      section({id: 'prices', tab: 'Цены', kicker: 'ГРУЗИЯ', title: 'Планируй свой день.', text: 'Выбери услугу и оплати в USDC — QR откроет кошелёк с суммой.', side: 'GEAR / RIDES / PRICES', banner: {src: SHOP + 'bakuriani-prices.webp', pos: '67% 50%'}, cta: 'К ценам',
        cells: [
          cell({title: 'Аренда снаряжения', text: 'Шлем, маска, защита — полный комплект на день.', tags: ['GEAR'], image: {src: SHOP + 'bakuriani-prices.webp', pos: '80% 50%'}, price: '0.04', unit: 'день'}),
          cell({title: 'Сопровождение на склоне', text: 'Гид на весь день: трассы, фрирайд по погоде, фото.', tags: ['GUIDE', 'PHOTO'], image: rider('55% 45%'), price: '0.05', unit: 'день'})]}),
    ],
    payment: {network: 'base', token: 'USDC', mode: 'shared', address: null, orderTag: true, windowMin: 40, note: 'Оплата в USDC в сети Base. Проверьте сумму и сеть в кошельке перед подтверждением.'},
    contact: {telegram: '', whatsapp: '', email: ''},
    footer: {text: 'GOOD DAYS START ON THE MOUNTAIN.', right: 'GEORGIA ✳ BAKURIANI'},
    theme: theme('mountain'),
  };
}
/** A neutral shop anyone can start from. */
export function blankShop(): ShopConfig {
  const b = bakuriani();
  return {...b, id: uid('shop'),
    brand: {name: 'Мой магазин', logo: null, stripLeft: 'MY SHOP / HANDMADE', stripRight: 'ОПЛАТА В USDC ✳ ДОСТАВКА', place: 'Ваш город'},
    hero: {...b.hero, eyebrow: 'МАГАЗИН / 01', title: 'Вещи, которые мы делаем сами', sub: 'Выберите товар, оплатите по QR и напишите нам — отправим в тот же день.', markTop: 'No.1', markMain: 'MADE', markItalic: 'BY HAND', markSmall: 'SMALL BATCH · SINCE 2026', sticker: 'NEW\nDROP', sideText: 'FRESH\nEVERY WEEK'},
    discover: {eyebrow: '✳ ДОБРО ПОЖАЛОВАТЬ', title: 'НАШ МАГАЗИН'},
    sections: [
      section({tab: 'О магазине', kicker: 'О НАС', title: 'Кто мы и что делаем.', text: 'Расскажите историю: откуда вы, из чего делаете и почему это стоит своих денег.', side: 'ABOUT', cta: 'Подробнее',
        cells: [cell({title: 'Наша мастерская', text: 'Фото мастерской и пара слов о процессе.'}), cell({title: 'Материалы', text: 'Из чего делаем и где берём.'}), cell({title: 'Отзывы', text: 'Что говорят покупатели.'})]}),
      section({tab: 'Каталог', kicker: 'КАТАЛОГ', title: 'Выберите своё.', text: 'Цены в USDC. Добавьте в корзину и оплатите одним переводом.', side: 'CATALOG', cta: 'Смотреть',
        cells: [cell({title: 'Товар 1', price: '10', tags: ['NEW']}), cell({title: 'Товар 2', price: '25'}), cell({title: 'Товар 3', price: '40', tags: ['HIT']})]}),
      section({tab: 'Доставка и оплата', kicker: 'ДОСТАВКА', title: 'Как получить заказ.', text: 'Самовывоз, курьер по городу или почта. Оплата USDC в сети Base.', side: 'DELIVERY', cta: 'Узнать',
        cells: [cell({title: 'Самовывоз', text: 'Адрес и часы работы.'}), cell({title: 'Курьер', text: 'Сроки и стоимость.'}), cell({title: 'Как оплатить', text: 'Сканируете QR — кошелёк откроется с нужной суммой.'})]}),
    ],
    footer: {text: 'СДЕЛАНО С ЛЮБОВЬЮ.', right: 'MY SHOP ✳ 2026'},
  };
}
/** Quick starts for different kinds of work: the same skeleton, other words, colours and icons. */
function kind(p: {name: string; strip: [string, string]; place: string; hero: Partial<ShopConfig['hero']>; discover: string; preset: string; radius?: Theme['radius'];
  sections: {tab: string; kicker: string; title: string; text: string; side: string; cta: string; cells: Partial<Cell>[]}[]; footer: [string, string]}): ShopConfig {
  const b = bakuriani();
  return {...b, id: uid('shop'), brand: {name: p.name, logo: null, stripLeft: p.strip[0], stripRight: p.strip[1], place: p.place},
    hero: {...b.hero, ...p.hero}, discover: {eyebrow: '✳ ДОБРО ПОЖАЛОВАТЬ', title: p.discover},
    sections: p.sections.map(x => section({...x, banner: null, cells: x.cells.map(c => cell(c))})),
    footer: {text: p.footer[0], right: p.footer[1]}, theme: theme(p.preset, p.radius || 'round')};
}
export const jewelry = () => kind({name: 'Серьги ручной работы', strip: ['HANDMADE / SILVER & STONE', 'ОПЛАТА USDC ✳ ДОСТАВКА'], place: 'Тбилиси', preset: 'berry',
  hero: {eyebrow: 'МАСТЕРСКАЯ / 01', title: 'Серьги, которых нет у других', sub: 'Серебро, натуральные камни, каждая пара — в единственном экземпляре.', markTop: '925', markMain: 'SHINE', markItalic: 'by hand', markSmall: 'SILVER · STONE · LOVE', sticker: 'ONE\nOF ONE', sideText: 'NEW DROP\nEVERY FRIDAY'},
  discover: 'КОЛЛЕКЦИЯ', footer: ['КАЖДАЯ ПАРА — ОДНА.', 'HANDMADE ✳ TBILISI'],
  sections: [
    {tab: 'Коллекция', kicker: 'НОВОЕ', title: 'Выберите свою пару.', text: 'Цены в USDC. Отправим в коробочке в течение 2 дней.', side: 'SILVER / STONE', cta: 'Смотреть', cells: [
      {title: 'Капли с лунным камнем', text: 'Серебро 925, длина 3 см.', price: '45', tags: ['SILVER'], icon: '💧', place: 'Шоурум Ваке, Чавчавадзе 37'}, {title: 'Кольца-конго', text: 'Лёгкие, на каждый день.', price: '30', tags: ['DAILY'], icon: '⭕', place: 'Dry Bridge Market, стол 14 (по субботам)'}, {title: 'Гвоздики с гранатом', text: 'Маленькие и яркие.', price: '25', tags: ['GIFT'], icon: '♦', place: 'Шоурум Ваке, Чавчавадзе 37'}]},
    {tab: 'На заказ', kicker: 'ИНДИВИДУАЛЬНО', title: 'Сделаем по вашему эскизу.', text: 'Пришлите идею — посчитаем и пришлём макет.', side: 'CUSTOM', cta: 'Обсудить', cells: [
      {title: 'Эскиз и примерка', text: 'Рисуем, согласуем, делаем.', icon: '✏'}, {title: 'Гравировка', text: 'Имя или дата внутри.', price: '10', icon: '✒'}]},
    {tab: 'Доставка', kicker: 'ДОСТАВКА', title: 'Как получить.', text: 'Самовывоз в Тбилиси, курьер, почта по миру.', side: 'DELIVERY', cta: 'Узнать', cells: [
      {title: 'Самовывоз', text: 'Ваке, по договорённости.', icon: '📍'}, {title: 'Почта по миру', text: '7–14 дней, трек-номер.', price: '8', icon: '✈'}]}]});
export const clothes = () => kind({name: 'Basic Wear', strip: ['ОДЕЖДА / БАЗА НА КАЖДЫЙ ДЕНЬ', 'ОПЛАТА USDC ✳ ОБМЕН 14 ДНЕЙ'], place: 'Онлайн', preset: 'mono', radius: 'soft',
  hero: {eyebrow: 'МАГАЗИН / 01', title: 'Хлопок, который не стыдно носить', sub: 'Футболки, бельё, носки. Размеры S–XXL, обмен 14 дней.', markTop: 'S–XXL', markMain: 'BASIC', markItalic: 'wear', markSmall: '100% COTTON', sticker: '3 ЗА\n2', sideText: 'COTTON\nEVERY DAY'},
  discover: 'КАТАЛОГ', footer: ['ПРОСТО. УДОБНО. НАДОЛГО.', 'BASIC WEAR ✳ 2026'],
  sections: [
    {tab: 'Футболки', kicker: 'ХЛОПОК', title: 'Футболки на каждый день.', text: 'Плотность 180 г/м², не садятся после стирки.', side: 'T-SHIRTS', cta: 'Смотреть', cells: [
      {title: 'Белая футболка', price: '15', unit: 'шт', tags: ['S–XXL'], icon: '👕'}, {title: 'Чёрная футболка', price: '15', unit: 'шт', tags: ['S–XXL'], icon: '👕'}, {title: 'Набор 3 шт', price: '36', tags: ['ВЫГОДА'], icon: '🎁'}]},
    {tab: 'Бельё', kicker: 'КОМФОРТ', title: 'Бельё и носки.', text: 'Мягкий хлопок с эластаном.', side: 'UNDERWEAR', cta: 'Смотреть', cells: [
      {title: 'Трусы-боксеры, 3 шт', price: '20', icon: '🩲'}, {title: 'Носки, 5 пар', price: '12', icon: '🧦'}]},
    {tab: 'Размеры и доставка', kicker: 'ИНФО', title: 'Подберите размер.', text: 'Таблица размеров, обмен и доставка.', side: 'INFO', cta: 'Узнать', cells: [
      {title: 'Таблица размеров', text: 'S — 46, M — 48, L — 50, XL — 52, XXL — 54.', icon: '📏'}, {title: 'Обмен 14 дней', text: 'Если не подошло — поменяем.', icon: '↺'}]}]});
export const car = () => kind({name: 'Toyota RAV4 2019 — продаю', strip: ['ЧАСТНАЯ ПРОДАЖА / ОДИН ВЛАДЕЛЕЦ', 'ТБИЛИСИ ✳ ТОРГ У МАШИНЫ'], place: 'Тбилиси', preset: 'sea', radius: 'soft',
  hero: {eyebrow: 'ПРОДАЖА / 01', title: 'RAV4 2019, 68 000 км, один владелец', sub: 'Полная история обслуживания, не битая. Задаток бронирует машину на 3 дня.', markTop: '2019', markMain: 'RAV4', markItalic: 'hybrid', markSmall: '68 000 KM · 1 OWNER', sticker: 'ТОРГ\nЕСТЬ', sideText: 'SERVICE\nHISTORY'},
  discover: 'ВСЁ О МАШИНЕ', footer: ['ЗВОНИТЕ, ПОКАЖУ В ЛЮБОЙ ДЕНЬ.', 'TBILISI ✳ 2026'],
  sections: [
    {tab: 'Машина', kicker: 'ХАРАКТЕРИСТИКИ', title: 'Что за машина.', text: '2.5 гибрид, полный привод, кожа, камера, подогревы.', side: 'SPECS', cta: 'Смотреть', cells: [
      {title: 'Двигатель', text: '2.5 гибрид, 218 л.с., расход 5,8 л.', icon: '⚙'}, {title: 'Комплектация', text: 'Кожа, камера 360, CarPlay, подогрев руля.', icon: '★'}, {title: 'Состояние', text: 'Не битая, 2 ключа, резина зима+лето.', icon: '✓'}]},
    {tab: 'Документы', kicker: 'ИСТОРИЯ', title: 'Всё прозрачно.', text: 'Сервисная книжка, отчёт по VIN, ПТС.', side: 'DOCS', cta: 'Открыть', cells: [
      {title: 'Сервисная история', text: 'Все ТО у дилера, чеки есть.', icon: '📘'}, {title: 'Отчёт по VIN', text: 'Пришлю по запросу.', icon: '🔎'}]},
    {tab: 'Купить', kicker: 'СДЕЛКА', title: 'Как купить.', text: 'Задаток бронирует машину на 3 дня, остальное — при оформлении.', side: 'DEAL', cta: 'Забронировать', cells: [
      {title: 'Задаток за бронь', text: 'Возвращается, если машина не соответствует описанию.', price: '500', icon: '🔑'}, {title: 'Осмотр и тест-драйв', text: 'В любой день по договорённости.', icon: '🚗'}]}]});
export const services = () => kind({name: 'Ремонт квартир · Гиорги', strip: ['РЕМОНТ / ПЛИТКА / САНТЕХНИКА', 'СМЕТА ЗА 1 ДЕНЬ ✳ ГАРАНТИЯ'], place: 'Тбилиси', preset: 'coffee', radius: 'soft',
  hero: {eyebrow: 'УСЛУГИ / 01', title: 'Ремонт без сюрпризов в смете', sub: 'Выезд и замер бесплатно. Смета за день, гарантия 1 год. Оплата этапами.', markTop: '12 лет', markMain: 'FIX', markItalic: 'it right', markSmall: 'TILE · PLUMBING · PAINT', sticker: 'ГАРАН-\nТИЯ', sideText: 'FREE\nMEASURE'},
  discover: 'ЧТО Я ДЕЛАЮ', footer: ['ЧЕСТНАЯ СМЕТА — ЧЕСТНАЯ РАБОТА.', 'TBILISI ✳ 2026'],
  sections: [
    {tab: 'Услуги', kicker: 'РАБОТЫ', title: 'Что сделаю.', text: 'Плитка, сантехника, покраска, мелкий ремонт.', side: 'SERVICES', cta: 'Выбрать', cells: [
      {title: 'Укладка плитки', price: '12', unit: 'м²', icon: '▦'}, {title: 'Замена смесителя', price: '25', unit: 'шт', icon: '🚰'}, {title: 'Покраска стен', price: '5', unit: 'м²', icon: '🖌'}]},
    {tab: 'Работы', kicker: 'ПОРТФОЛИО', title: 'Посмотрите, как получается.', text: 'Фото до и после.', side: 'PORTFOLIO', cta: 'Смотреть', cells: [
      {title: 'Ванная, Ваке', text: '6 м², 5 дней.', icon: '🛁'}, {title: 'Кухня, Сабуртало', text: '12 м², 9 дней.', icon: '🍳'}]},
    {tab: 'Как работаем', kicker: 'ПОРЯДОК', title: 'Шаг за шагом.', text: 'Замер → смета → предоплата за материалы → работа → оплата.', side: 'PROCESS', cta: 'Узнать', cells: [
      {title: 'Выезд и замер', text: 'Бесплатно, в течение 2 дней.', icon: '📐'}, {title: 'Предоплата материалов', text: 'Чеки прикладываю к смете.', price: '100', icon: '🧾'}]}]});
/** Several sellers on one page: every item has its own seller and, in the owner's version, its own EVM address. */
export const market = () => { const m = kind({name: 'Общий стол · вещи соседей', strip: ['ВЕЩИ ОТ НЕСКОЛЬКИХ ПРОДАВЦОВ', 'КАЖДЫЙ ПОЛУЧАЕТ НА СВОЙ КОШЕЛЁК'], place: 'Сабуртало', preset: 'sea', radius: 'soft',
  hero: {eyebrow: 'ОБЩИЙ СТОЛ / 01', title: 'Хорошие вещи от соседей', sub: 'Каждая вещь — от своего продавца. Платите прямо ему: у каждого свой кошелёк.', markTop: '3', markMain: 'SWAP', markItalic: 'local', markSmall: 'SELLERS · ONE PAGE', sticker: 'ОТ\nРУК', sideText: 'DIRECT\nTO SELLER'},
  discover: 'ЧТО ПРОДАЮТ', footer: ['ДЕНЬГИ ИДУТ ПРЯМО ПРОДАВЦУ.', 'SABURTALO ✳ 2026'],
  sections: [
    {tab: 'Вещи', kicker: 'В НАЛИЧИИ', title: 'Забирайте у соседей.', text: 'У каждой вещи указано, кто продаёт и где забрать.', side: 'GOODS', cta: 'Смотреть', cells: [
      {title: 'Велосипед Trek, 26"', text: 'Катался 2 сезона, новая цепь.', price: '120', icon: '🚲', seller: 'Ника', place: 'Сабуртало, ул. Пекини 12'}, {title: 'Кофемашина De\'Longhi', text: 'Рабочая, с капучинатором.', price: '60', icon: '☕', seller: 'Аня', place: 'Ваке, у метро'}, {title: 'Детская коляска', text: 'Лёгкая, складывается одной рукой.', price: '80', icon: '👶', seller: 'Дато', place: 'Дидубе'}]},
    {tab: 'Продавцы', kicker: 'КТО ПРОДАЁТ', title: 'Три соседа, три кошелька.', text: 'Каждый продавец получает оплату на свой EVM-адрес.', side: 'SELLERS', cta: 'Узнать', cells: [
      {title: 'Ника', text: 'Спорт и велосипеды.', icon: '🙋'}, {title: 'Аня', text: 'Кухня и дом.', icon: '🙋‍♀'}, {title: 'Дато', text: 'Детские вещи.', icon: '🙋‍♂'}]},
    {tab: 'Как купить', kicker: 'ПОРЯДОК', title: 'Оплата прямо продавцу.', text: 'В корзине вещи разных продавцов оплачиваются отдельными QR.', side: 'HOW', cta: 'Узнать', cells: [
      {title: 'Выберите вещи', text: 'Можно у разных продавцов.', icon: '①'}, {title: 'Оплатите по QR', text: 'Отдельный QR на каждого продавца.', icon: '②'}, {title: 'Заберите', text: 'Адрес — в карточке вещи.', icon: '③'}]}]});
  return {...m, payment: {...m.payment, mode: 'individual' as const}}; };
export const TEMPLATES: Record<string, {ru: string; icon: string; hint: string; make: () => ShopConfig}> = {
  bakuriani: {ru: 'Сноуборд Бакуриани', icon: '🏂', hint: 'услуги на курорте, с фото', make: bakuriani},
  jewelry: {ru: 'Украшения', icon: '💎', hint: 'у каждой вещи своё место', make: jewelry},
  clothes: {ru: 'Одежда', icon: '👕', hint: 'футболки, бельё, размеры', make: clothes},
  market: {ru: 'Вещи: несколько продавцов', icon: '🧺', hint: 'у каждой вещи свой кошелёк', make: market},
  services: {ru: 'Услуги мастера', icon: '🛠', hint: 'ремонт, цена за м²', make: services},
  car: {ru: 'Продаю машину', icon: '🚗', hint: 'одна вещь, задаток', make: car},
  blank: {ru: 'Пустой магазин', icon: '◻', hint: 'с нуля', make: blankShop},
};
/** Prompt for the agent: write the shop texts from what the person says about their work. */
export const AGENT_PROMPT = 'Help write my mini-site (a shop / business card that is sent as one HTML file). Ask me in 3–5 short questions what I sell or do, for whom, prices and how I deliver. Then fill the shop with shop.set {brand, hero, discover, footer} and shop.section.* / shop.cell.* commands: 2–5 sections (tab + billboard title/text), 2–6 cells each (title, one-line text, tags, price in USDC only where it can be bought, unit). Short, concrete, no hype. Keep my language. Do not touch payment addresses.';
