# Ассеты живых фонов — задание на генерацию (для Codex с ключом OpenAI)

Сейчас в `assets/` лежит первый набор из ChatGPT, 1536×1024. Задача — перегенерировать его в 2K и добавить недостающее.
Имена и папки не менять: движок подхватит файлы сам.

## Как генерировать

- Endpoint: `POST /v1/images/generations` (или `/v1/images/edits` для вариаций одного объекта).
- Модель: `gpt-image-2.6-sunburst` (детальнее), для черновиков — `gpt-image-2.6-flare`.
- `quality: "high"`, `output_format: "png"`, `background: "transparent"` — для ВСЕХ ассетов.
- Размер:
  - широкие слои — `2560x1440` (16:9; ширина и высота кратны 16);
  - облака и объекты — `2048x1152`;
  - высокие деревья — `1152x2048`.
- Ключ — только в переменной окружения `OPENAI_API_KEY`, не в коде и не в репозитории.
- Каждый ассет — отдельный запрос. В начало каждого промпта вставлять MASTER BRIEF из конца этого файла.
- После генерации:
  - широкие слои: PNG → WebP q88 без обрезки;
  - облака и объекты: обрезать по альфе с отступом 12 px → WebP q88.

## Список

| файл в `assets/` | что | размер | статус |
|---|---|---|---|
| `nature/mountains.webp` | 01 дальние снежные горы, вершины на 22–55% высоты, внизу дымка | 2560×1440 | есть 1536, перегенерировать |
| `nature/foothills.webp` | 02 предгорья с лесом и лугами, силуэт на 50–62% | 2560×1440 | есть 1536, перегенерировать |
| `nature/forest.webp` | 03 ближний хвойный лес, линия верхушек на 58–70% | 2560×1440 | есть 1536, перегенерировать |
| `nature/meadow.webp` | 04 передний луг с цветами, край травы на ~80% | 2560×1440 | есть 1536, перегенерировать |
| `nature/fog.webp` | 05 полоса тумана, полупрозрачная | 2560×1440 | нужно |
| `clouds/cloud1..3.webp` | 09–11 кучевые: большое, среднее, малое | 2048×1152 | есть, перегенерировать |
| `clouds/cloud4.webp` | 12 длинная полоса слоистых облаков | 2048×1152 | нужно |
| `clouds/cloud5.webp` | 13 перистые, полупрозрачные | 2048×1152 | нужно |
| `clouds/cloud6.webp` | 14 тёмная грозовая туча | 2048×1152 | нужно |
| `objects/airship.webp` | 15 дирижабль, вид сбоку, нос вправо | 2048×1152 | оставить как есть |
| `objects/eagle_1..5.webp` | 16 орёл, 5 кадров взмаха (ниже) | 2048×1152 | нужно |
| `objects/balloon.webp` | 17 воздушный шар | 2048×1152 | есть |
| `objects/kite.webp`, `objects/paper_plane.webp`, `objects/birds.webp` | 18–20 | 2048×1152 | нужно |
| `nature/pine_left.webp`, `pine_right.webp`, `birch.webp` | 06–08 большие деревья для краёв | 1152×2048 | нужно |

## Орёл: 5 кадров взмаха

Генерировать через `/v1/images/edits`, подавая `objects/eagle.webp` как референс, чтобы птица была та же самая. Масштаб, положение тела и вид одинаковые во всех кадрах — меняются только крылья.

1. `eagle_1` — крылья подняты высоко вверх, кончики почти сходятся над спиной.
2. `eagle_2` — крылья на полпути вниз, под ~30° вверх.
3. `eagle_3` — крылья горизонтально, полностью раскрыты (планирование).
4. `eagle_4` — крылья опущены вниз под ~40°, перья изогнуты от нагрузки.
5. `eagle_5` — крылья поднимаются, сложены наполовину, перья раскрыты.

Промпт для каждого кадра: «Same eagle as the reference image, identical size, position, body angle, colors and lighting. Only the wings change: <описание кадра>. Transparent background, no shadow.»

В сцене кадры подключаются так: `{"kind":"image","frames":["objects/eagle_1.webp",…,"objects/eagle_5.webp","objects/eagle_4.webp","objects/eagle_3.webp","objects/eagle_2.webp"],"fps":10}`. Последовательность 1→5→2 даёт плавный цикл. Пока кадров нет, работает `"flap": 0.6`.

## MASTER BRIEF (вставлять в начало каждого промпта)

```
Asset for a layered parallax desktop wallpaper. Transparent background, no sky, no sun, no frame.
Photorealistic nature with a slight cinematic, painterly touch (high-end animated film matte painting).
Neutral soft daylight ~5500K from the upper LEFT at ~45°. No sunset or night colors — code relights it.
Eye-level camera, no tilt, no fisheye. Late summer. No text, logos, watermarks.
Full-width landscape layers: touch the left and right edges completely, fully opaque from the silhouette
down to the bottom edge, everything above the silhouette transparent.
Cutout objects: whole object centered with ~10% empty margin, no ground, no cast shadow.
```
