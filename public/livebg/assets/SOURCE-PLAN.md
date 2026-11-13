# План для Codex: сцена «Горы» из мастер-кадра → слои и объекты в одном масштабе и свете

## Цель

Сначала сгенерировать ОДНУ большую картинку со всей сценой, где все объекты стоят на реальных расстояниях, в одной перспективе и при одном свете. Потом разобрать её на отдельные слои и объекты так, чтобы:
- сложенные обратно в движке, они совпадали с мастером пиксель в пиксель;
- каждый объект можно было двигать отдельно (агент), не ломая масштаб и свет.

Результат: папка `assets/scene-mountains/` + `scene.json` (формат ниже) + отчёт со сравнением сборки и мастера.

Ключ: только `OPENAI_API_KEY` в окружении. Модель: `gpt-image-2.6-sunburst`, `quality: "high"`, PNG.

---

## Шаг 0. Задать «паспорт сцены» до генерации

Создать `scene-passport.json` и использовать его во ВСЕХ промптах дословно:

```json
{
  "canvas": { "w": 2880, "h": 1440, "note": "2:1 = 16:9 плюс ~6% запаса по бокам для параллакса" },
  "camera": { "height_m": 1.7, "horizon_y": 0.46, "lens": "35mm equivalent", "tilt": 0 },
  "sun": { "azimuth": "upper-left, behind camera's left shoulder", "elevation_deg": 40, "time": "11:00", "color_temp_k": 5500 },
  "season": "late summer", "air": "clear, light haze in distance",
  "planes": [
    { "id": "sky",       "distance_m": "inf" },
    { "id": "mountains", "distance_m": 25000 },
    { "id": "foothills", "distance_m": 4000 },
    { "id": "forest",    "distance_m": 400 },
    { "id": "meadow",    "distance_m": "3-60" }
  ],
  "objects": [
    { "id": "airship", "real_size_m": 120, "distance_m": 2500, "altitude_m": 600 },
    { "id": "balloon", "real_size_m": 20,  "distance_m": 700,  "altitude_m": 150 },
    { "id": "eagle",   "real_size_m": 2.0, "distance_m": 45,   "altitude_m": 25 }
  ]
}
```

Высота горизонта, свет и масштабы задаются один раз и больше не меняются.

## Шаг 1. Посчитать, какого размера каждый объект должен быть в кадре

Формула перспективы: `высота_в_px = real_size_m / distance_m × focal_px`, где для 35 мм и ширины кадра 2880 `focal_px ≈ 2880 × 35 / 36 ≈ 2800`.

| объект | реальный размер | дистанция | размер в кадре |
|---|---|---|---|
| дирижабль | 120 м длина | 2500 м | ≈ 134 px длина |
| шар | 20 м высота | 700 м | ≈ 80 px |
| орёл | 2 м размах | 45 м | ≈ 124 px размах |

Числа записать в `scene-passport.json → objects[].expected_px`. Если объект в мастере сильно отличается (больше ±25%), перегенерировать мастер, а не подгонять.

Это и есть причина «сломанной перспективы» сейчас: дирижабль висел крупным на фоне гор в 25 км, при этом был явно ближе гор, но его свет и дымка ничего об этом не говорили.

## Шаг 2. Мастер-кадр (всё вместе)

`/v1/images/generations`, `size: "2880x1440"`, `background: "opaque"`. Промпт:

```
Photorealistic wide landscape with a slight cinematic matte-painting touch, late summer, 11:00,
clear air with light distant haze. Sun at upper LEFT, 40° elevation, 5500K, soft natural shadows.
Eye-level camera 1.7 m high, 35mm lens, horizon at 46% of the image height, no tilt.
Back to front: snowy alpine range ~25 km away; forested foothills with meadows ~4 km away;
a dense spruce forest edge ~400 m away; a flowering meadow in the foreground.
In the sky: a silver vintage airship ~2.5 km away (small, about 134 px long), hazy from distance;
a striped hot-air balloon ~700 m away (about 80 px tall); an eagle in flight ~45 m away
(about 124 px wingspan), sharp. All objects lit from the upper left, consistent with the landscape,
with atmospheric haze proportional to distance. Center of the image kept calm (UI goes there).
No text, no logos, no people.
```

Сохранить `master.png`. Это эталон.

## Шаг 3. Измерить мастер

Для каждого объекта найти bounding box: детекцию сделать через `/v1/responses` с моделью, умеющей смотреть на картинки (попросить JSON с bbox в пикселях), затем проверить глазами.

Записать в `scene-passport.json → measured` для каждого объекта:
- `bbox` (x, y, w, h в px мастера);
- центр;
- линию горизонта и линии силуэтов слоёв (y в px) для гор, предгорий, леса и луга.

## Шаг 4. Фон без объектов

`/v1/images/edits`, вход — `master.png`, без маски или с маской на bbox объектов. Промпт:

```
Remove the airship, the balloon and the eagle. Fill the sky naturally.
Change nothing else: same framing, light, colors, haze and details.
```

Сохранить `background_clean.png`. Сравнить с мастером вне bbox: различие должно быть минимальным.

## Шаг 5. Разобрать фон на слои глубины

Для каждого слоя — `/v1/images/edits` с `background_clean.png` как входом и `background: "transparent"`, `size: "2880x1440"`:

| файл | что оставить | промпт-суть |
|---|---|---|
| `mountains.png` | только горы + дымку у подножия | «Keep ONLY the distant mountain range and its base haze. Everything else fully transparent, including sky. Extend the range naturally where it was hidden behind closer hills, down to the bottom edge.» |
| `foothills.png` | только предгорья | «Keep ONLY the foothills; transparent above their silhouette; extend them down to the bottom edge where the forest covered them.» |
| `forest.png` | только ближний лес | «Keep ONLY the forest edge; transparent above the treeline; continue the forest down to the bottom edge.» |
| `meadow.png` | только луг | «Keep ONLY the foreground meadow; transparent above it.» |

Важно: каждый слой должен быть **достроен** там, где его закрывал более близкий слой, и непрозрачен до нижнего края. Иначе при сдвиге параллакса откроются дыры.

Проверка: сложить 4 слоя на небо цвета мастера → сравнить с `background_clean.png` (SSIM ≥ 0.9 вне неба).

## Шаг 6. Объекты отдельно, в том же свете и масштабе

Для каждого объекта:
1. Вырезать из мастера область `bbox` с запасом 30%.
2. `/v1/images/edits` с этим кропом как референсом, `size: "2048x1152"`, `background: "transparent"`:
   ```
   The same <airship> as in the reference: identical design, colors, light direction (upper left),
   shading and amount of atmospheric haze. Render it alone, larger and sharper, centered,
   10% margin, transparent background, no shadow, no sky.
   ```
3. Обрезать по альфе.
4. Записать в манифест его место из мастера (bbox из шага 3), а не размер новой картинки. Движок сам масштабирует объект до размера из мастера: высокое разрешение даёт качество, мастер — размер.

Орёл: 5 кадров взмаха тем же способом, референс — кроп орла из мастера (кадры описаны в `ASSETS.md`).

## Шаг 7. `scene.json` для движка

Координаты — в долях холста мастера (0…1), `size` — высота объекта в долях высоты холста.

```json
{
  "name": "Горы · мастер",
  "canvas": { "w": 2880, "h": 1440 },
  "time": "live", "weather": "live",
  "layers": [
    { "id": "sky", "type": "sky", "depth": 0 },
    { "id": "sun", "type": "sun", "depth": 0.06 },
    { "id": "clouds-far", "type": "clouds", "depth": 0.1, "sprites": ["clouds/cloud1.webp", "clouds/cloud2.webp", "clouds/cloud3.webp"] },
    { "id": "mountains", "type": "plate", "depth": 0.12, "src": "scene-mountains/mountains.webp", "snow": 0.6 },
    { "id": "foothills", "type": "plate", "depth": 0.25, "src": "scene-mountains/foothills.webp", "snow": 0.7 },
    { "id": "sky-objects", "type": "objects", "depth": 0.3, "agent": true, "objects": [
      { "id": "airship", "kind": "image", "url": "scene-mountains/airship.webp", "x": 0.31, "y": 0.22, "size": 0.035, "distance_m": 2500, "motion": { "type": "drift", "speed": 0.2 } },
      { "id": "balloon", "kind": "image", "url": "scene-mountains/balloon.webp", "x": 0.62, "y": 0.3, "size": 0.055, "distance_m": 700, "motion": { "type": "bob", "speed": 0.5 } }
    ] },
    { "id": "forest", "type": "plate", "depth": 0.45, "src": "scene-mountains/forest.webp", "snow": 0.6 },
    { "id": "near-objects", "type": "objects", "depth": 0.6, "objects": [
      { "id": "eagle", "kind": "image", "frames": ["scene-mountains/eagle_1.webp", "scene-mountains/eagle_2.webp", "scene-mountains/eagle_3.webp", "scene-mountains/eagle_4.webp", "scene-mountains/eagle_5.webp"], "fps": 10, "x": 0.7, "y": 0.28, "size": 0.09, "distance_m": 45 }
    ] },
    { "id": "meadow", "type": "plate", "depth": 0.88, "src": "scene-mountains/meadow.webp", "snow": 0.8 },
    { "id": "precip", "type": "precip", "depth": 1 }
  ]
}
```

Правило глубины: `depth` планов берём как в примере (0.12 / 0.25 / 0.45 / 0.88). Объект кладём в слой objects между теми двумя планами, между которыми он стоит по `distance_m`. Дирижабль за 2,5 км — между предгорьями (4 км) и лесом (400 м), орёл за 45 м — между лесом и лугом.

## Шаг 8. Контроль

1. Отрендерить `scene.json` без параллакса (мышь в центре) в 2880×1440 и сравнить с `master.png`. Объекты должны совпасть по месту и размеру (±3%), слои — по силуэтам.
2. Свет: на всех объектах освещённая сторона — левая верхняя.
3. Дымка: дирижабль заметно светлее и контрастнее не больше, чем горы за 4 км.
4. Положить в `assets/scene-mountains/REPORT.md` три картинки (мастер / сборка / разница) и таблицу размеров «ожидаемо → в мастере → в сборке».

## Что делает движок (уже есть или доделаю я)

- Погода и время перекрашивают слои и объекты одинаково: пасмурно — темнее и серее, закат — теплее, ночь — синее.
- Объекты, добавленные агентом позже, получают размер по `distance_m` той же формулой, что в шаге 1, поэтому новый дирижабль сам станет нужного размера.
- Поддержку `canvas` (координаты в долях мастер-кадра, привязанные к слоям) и `distance_m` добавлю в движок, когда придут файлы.
