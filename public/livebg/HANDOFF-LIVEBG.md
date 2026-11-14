# Хендовер: «Живые фоны» (Live Backgrounds) → отдельная комната портала Native Clouds

Репозиторий: https://github.com/gvedashvilirevaz9-stack/native-clouds-bazaar-test, ветка `main`.
Всё лежит в `public/livebg/`. Рабочий тестовый стенд: https://native-clouds-bazaar-test.vercel.app/livebg/

Задача: перенести модуль в сборку портала отдельной комнатой-фоном. Модуль самостоятельный: ванильный JS, без зависимостей и без React. Встраивается одной функцией.

---

## 1. Что это

Фон рабочего стола из слоёв с параллаксом.
- **Ввод.** Сцена сдвигается от мыши или от положения лица перед веб-камерой.
- **Время и погода.** Небо, солнце, луна и звёзды идут по реальному времени суток и погоде (Open-Meteo). Слои перекрашиваются под рассвет, закат, ночь, пасмурность, дождь и снег.
- **Летающие объекты.** Орлы, дирижабли и шары на трёх планах глубины.
- **Курьеры.** По команде курьер прилетает, сбрасывает на рабочий стол прозрачный виджет и улетает. Виджеты — часы или любой ответ Agent Marketplace (курс биткоина, погода, курс доллара…). Наведёшь мышь — появляется стеклянная рамка: тащить или закрыть.
- **Слой агента.** AI-бот может добавлять объекты в отдельный слой. Остальные слои для него закрыты.

## 2. Файлы

### Код (переносить)

| файл | что |
|---|---|
| `public/livebg/livebg.js` | движок: `createLiveBG(canvas, opts)`, слои, параллакс, мышь и камера, погода, эффекты, летающие объекты, курьеры, мост `postMessage`. ~920 строк, ES-модуль |
| `public/livebg/widgets.js` | виджеты на рабочем столе (DOM поверх canvas): `attachWidgets(bg)`, сетка мест 3×5, часы, погода, Agent Marketplace |
| `public/livebg/index.html` | демо-страница с панелью настроек. Для портала — как пример подключения, сама панель не нужна |

### Документация (читать)

| файл | что |
|---|---|
| `public/livebg/AGENT.md` | контракт для бота: формат сцены, слои, объекты, команды, места для виджетов, MCP |
| `public/livebg/ASSETS.md`, `CODEX-SCENE-PLAN.md`, `assets/scene-mountains/v5/README.md` | как генерировались ассеты (история, для следующих сцен) |

### Ассеты, которые реально грузит браузер (≈3,9 МБ — переносить только их)

```
public/livebg/assets/scene-mountains/v5/scene.json          манифест сцены «Горы · v5» (по умолчанию)
public/livebg/assets/scene-mountains/v5/site/*.webp         4 слоя 3840×1920: mountains, foothills, forest, foreground (3,2 МБ)
public/livebg/assets/scene-mountains/v5/layers/sky-existing.webp   небо (36 КБ)
public/livebg/assets/scene-mountains/clouds/cloud1..3.webp  облака (228 КБ)
public/livebg/assets/fly/<eagle|airship|balloon>/<кадр>_<высота>.webp + catalog.json   готовые размеры летающих (364 КБ, 43 файла)
```

### НЕ переносить в сборку (исходники и история, ~60 МБ)

- `assets/scene-mountains/v5/layers/*.png` и `v5/layers/{mountains,foothills,forest,foreground}.webp` — исходники без потерь.
- `v5/previews`, `v5/metadata`, `v5/prompts`.
- `assets/scene-mountains/*.webp`, `scene.json`, `v1/` — прошлые версии (v3 и v4).
- `assets/nature`, `assets/objects`, `assets/clouds` — первый набор из ChatGPT для пресетов `weather` и `sky`.

Важно: папку с именем `web` не создавать — она в `.gitignore` (это папка сборки). Из-за этого один раз файлы не ушли на стенд.

## 3. Подключение в комнату портала

```js
import { createLiveBG } from '/livebg/livebg.js';
import { attachWidgets } from '/livebg/widgets.js';

const canvas = document.querySelector('#room-bg');           // canvas на весь экран, position:fixed; inset:0; z-index ниже UI
const bg = createLiveBG(canvas, {
  preset: 'mountains-v5',        // сцена по умолчанию
  input: 'mouse',                // 'mouse' | 'camera' | 'off' (камеру включает только сам человек кнопкой)
  bridge: true,                  // мост postMessage для бота и портала (см. §6, безопасность)
  bridgeOrigin: location.origin, // ОБЯЗАТЕЛЬНО в портале
});
const widgets = attachWidgets(bg);   // виджеты поверх canvas (z-index 5); UI комнаты ставить выше
```

Альтернатива — iframe `/livebg/?embed=1&preset=mountains-v5&input=mouse`. Мышь при этом пробрасывать через `postMessage` нельзя: движок слушает `pointermove` своего окна. Поэтому прямой импорт лучше.

Демо-панель (`index.html`) показывает все настройки — по ней видно, что выносить в настройки комнаты.

## 4. API движка (коротко; полностью — `AGENT.md`)

| метод | что |
|---|---|
| `loadPreset('mountains-v5' \| 'sky' …)` | загрузить сцену |
| `loadSceneUrl(url)`, `loadScene(json)`, `getScene()` | работа со сценой |
| `setInput('mouse' \| 'camera' \| 'off')`, `calibrate()`, `setStrength(0..2.5)` | ввод и сила параллакса |
| `setWeather('live' \| 'clear' \| 'partly' \| 'cloudy' \| 'rain' \| 'storm' \| 'snow' \| 'fog' \| {…})`, `setLocation('Batumi' \| {lat,lon,name})` | погода |
| `setTime(null \| hour, speed)` | время: живое или вручную |
| `setEffects({glare, blindspot, blindCorner, birds, ground})` | эффекты |
| `setFlyers({far:{eagle,airship,balloon}, mid:{…}, near:{…}})`, `getFlyers()` | кто летает на каждом плане (0..8) |
| `deliver(widget, {by, size, data, col?})` | курьер приносит виджет (см. §5) |
| `addObject / updateObject / removeObject / clearAgent` | слой агента |
| `on('drop' \| 'scene' \| 'weather' \| 'camera' \| 'face' \| 'error', fn)` | события |

## 5. Курьеры и места для виджетов

- `deliver('clock', {by:'airship', size:'L'})` — часы, локальные, без сети.
- `deliver('agent', {by:'eagle', size:'M', data:{q:'курс биткоина'}})` — ответ Agent Marketplace по вопросу словами. Берётся из `GET /api/money?q=…` того же сайта; можно и `data:{service:'fx'}`.

**Ряд задаёт курьер:**

| курьер | ряд | высота (y) |
|---|---|---|
| орёл | небо | 0.27 |
| шар | уровень гор | 0.45 |
| дирижабль | нижний ряд | 0.64 |

**В каждом ряду 5 мест**, колонки x: 0.22 / 0.36 / 0.5 / 0.64 / 0.78 (`ROWS`, `COLS` в `widgets.js`).
- Часы всегда в центре; кто там лежал, переезжает на свободное место.
- Остальное заполняется по порядку: центр → справа → слева → дальше справа → дальше слева.
- Место занято → курьер летит к следующему свободному. Ряд полный → перезаписывается самое старое.
- Тот же виджет повторно заменяет себя на своём месте.
- Перетащили рукой — место освобождается.
- Положение хранится в `localStorage` (`lw.widgets.v2`).

**Размер курьера = план = скорость = размер виджета:**

| размер | план | прилёт | масштаб виджета |
|---|---|---|---|
| S | дальний | ~12 с | 0.75 |
| M | средний | ~6,5 с | 1 |
| L | ближний | ~3,4 с | 1.3 |

L влетает на скорости и плавно тормозит до нуля, затем плавно разгоняется на выходе.

Виджет в покое — только текст с мягкой тенью, без фона. При наведении появляется стеклянная рамка в стиле портала (полупрозрачный фон, размытие 16 px, радиус 18 px) с ручкой и ×.

## 6. Бот и MCP

- На стенде есть MCP-сервер `/api/mcp`, файл `api/_lib/tools.mjs`. Добавлены инструменты:
  - `background_deliver {widget, q|service, by, size, col?}` — возвращает ответ Agent Marketplace и готовую команду для страницы `{type:'livebg', cmd:'deliver', args:[…]}`;
  - `background_flyers {far, mid, near}` — команда `setFlyers`.
- **Канала «сервер → открытая страница» нет — его подключаете вы.** Страница уже принимает команды:
  `window.postMessage({type:'livebg', cmd:'deliver', args:[…], id}, origin)` → ответ `{type:'livebg:reply', id, ok, result|error}`.
  Проверено end-to-end на стенде: вызов MCP → команда → `postMessage` → курьер → виджет на своём месте.
- **Безопасность моста.** Если `bridgeOrigin` не задан, мост принимает команды из любого окна. В портале обязательно передать `bridgeOrigin` или `bridge:false` и вызывать API напрямую. Команды `on`, `destroy` и `_*` через мост закрыты всегда.

## 7. Что проверить и доделать при переносе (по порядку важности)

1. **`bridgeOrigin`** — см. §6.
2. **CSP портала.** Браузер ходит наружу:
   - `api.open-meteo.com`, `geocoding-api.open-meteo.com` (погода и время восхода — `connect-src`);
   - `cdn.jsdelivr.net` и `storage.googleapis.com` (MediaPipe для веб-камеры — `script-src`, `connect-src`, `wasm-unsafe-eval`).

   Либо разрешить, либо положить MediaPipe к себе. Без камеры MediaPipe не грузится вообще.
3. **`/api/money`.** Виджет агента обращается к `/api/money` на том же домене. В портале этот эндпоинт должен быть (он в этом репо: `api/money.mjs` + `api/_lib/money.bundle.mjs`) или путь надо поменять в `widgets.js`.
4. **Слои UI.** Canvas фона — ниже всего. Слой виджетов `.lw-layer` — `z-index: 5`. UI комнаты — выше. Ряды мест (`ROWS`) рассчитаны на фон во весь экран: если в комнате сверху или по центру своя панель, сдвиньте `ROWS`/`COLS` в `widgets.js`.
5. **Слабые машины.** На GPU всё плавно. Слои 3840 px перекрашиваются в кэш только при смене времени или погоды, а не каждый кадр; `devicePixelRatio` ограничен 1.5. На слабом лэптопе проверить; при необходимости уменьшить слои до 2560.
6. **Мобильные не проверялись.**
7. **Демо-пресеты.** `weather`, `sky`, `mountains`, `mountains-v1` в `PRESETS` — пресеты прошлых итераций. Для комнаты оставить `mountains-v5` (и при желании `sky`), остальные убрать вместе с их ассетами.

## 8. Как проверял я

- Слои v5: детализация 3240–3690 px из 3840 (без растягивания), без маджента-каймы, без дыр и призраков в скрытых зонах.
- Параллакс со сдвигом 1,6× от нормы во все стороны: края не открываются, слои независимы.
- Погода, время, закат, ночь, дождь, снег.
- Сетка 3×5:
  - заполнение ряда;
  - часы в центре со сдвигом соседа;
  - перезапись самого старого;
  - освобождение места при перетаскивании;
  - восстановление после перезагрузки.
- На стенде в Chrome: все спрайты и слои грузятся. Вызов MCP `background_deliver` привёл к доставке настоящего курса биткоина, погоды и часов в правильные ряды.

## 9. Правила проекта, которые действуют и здесь

- Никаких кошельков, приёма денег и пополнений — портал только бесплатный агрегатор.
- Секреты (ключи, токены) — только в переменных окружения Vercel, не в коде и не в чатах.
- Ассеты для новых сцен генерировать по `assets/scene-mountains/v5/README.md`:
  - каждый слой отдельно, без вырезания из общего кадра, сплошной до нижнего края;
  - нативное разрешение, без растягивания.

---

## 11. Сцена «Летающий остров» (3D, отдельный движок)

Файлы: `public/livebg/island.js` + `public/livebg/vendor/three.module.min.js` (~732 КБ) + демо `public/livebg/island.html`. Строится кодом на three.js, без генерации картинок и без параллакса.

Монтируется так же, как 2D-движок, и **совместим с `widgets.js` и MCP-командами**:
```js
import { createIsland } from '/livebg/island.js';
import { attachWidgets } from '/livebg/widgets.js';
const bg = createIsland(canvas, { bridge:true, bridgeOrigin:location.origin });
attachWidgets(bg);
```
API тот же: `deliver`, `setWeather`, `setTime`, `setFlyers`, `setLocation`, `on('drop'|'weather')`, `destroy`. Команды `background_deliver` / `background_flyers` работают без изменений. Курьеры: дирижабль→шар, шар→корабль (плывёт по морю), орёл→попугай. Виджеты падают в ту же сетку 3×5.

2D-движок (`createLiveBG`) и 3D-остров (`createIsland`) — взаимозаменяемые: в комнате выбираешь, какой создать. three.js уже есть в бандле портала — для продакшена можно импортировать его оттуда вместо `vendor/`.
