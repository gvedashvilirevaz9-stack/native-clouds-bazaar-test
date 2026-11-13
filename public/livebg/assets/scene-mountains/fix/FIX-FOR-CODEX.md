# Исправление слоёв scene-mountains: убрать «призраков» в скрытых зонах

## Что сломано

Сборка совпадает с мастером. Брак внутри самих слоёв: там, где слой закрыт более близким слоем, вместо продолжения рельефа остались размазанные вертикальные полосы и полупрозрачные силуэты соседнего слоя. В покое этого не видно. При параллаксе ближний слой сдвигается, и мусор вылезает.

| слой | что внутри скрытой зоны |
|---|---|
| `mountains.webp` | тёмные волнистые линии от гребня предгорий и вертикальные потёки под ними |
| `foothills.webp` | призраки ёлок ближнего леса и вертикальные потёки |
| `forest.webp` | у нижнего края — полоса луга с кустами из мастера, ниже — растянутые и повторённые ёлки |

## Что сделать

Для каждого из трёх слоёв — один запрос `POST /v1/images/edits`:
- `image` = сам слой (PNG-оригинал или этот WebP, переведённый в PNG);
- `mask` = `fix/<слой>_mask.png` (прозрачное = перерисовать, 2880×1440, маски уже готовы);
- `size: "2880x1440"`, `background: "transparent"`, `quality: "high"`, модель та же, что для сцены.

Маска — полоса от 40 px выше силуэта ближнего слоя до 260 px ниже него. Её максимально открывает параллакс. Превью: `fix/<слой>_mask_preview.jpg`, полоса там красная.

### Промпты

**mountains**
```
Repaint ONLY the masked band. Continue the distant alpine range and its blue atmospheric haze downward:
lower rocky slopes and hazy valleys of the SAME mountains, same light from the upper left, same colors.
No foothill ridges, no dark lines, no trees, no vertical streaks. Keep everything outside the mask unchanged.
```

**foothills**
```
Repaint ONLY the masked band. Continue the hazy forested foothills downward: rolling hills covered with
distant forest texture, same blue-green haze and light. Absolutely no individual near trees, no tree silhouettes,
no ghosts, no vertical streaks. Keep everything outside the mask unchanged.
```

**forest**
```
Repaint ONLY the masked band. Continue the dense spruce forest downward to the bottom edge: lower parts of
the same trees and dark forest floor between trunks. No meadow strip, no bushes line, no clearing,
no repeated or stretched trees. Keep everything outside the mask unchanged.
```

Положить результат вместо старых файлов: те же имена, WebP q88, альфу не трогать.

## Проверка перед коммитом

1. Каждый слой на розовом фоне (#FF00FF): в красной зоне превью не должно быть ни потёков, ни полупрозрачных силуэтов.
2. Собрать сцену со сдвигом ближних слоёв на ±80 px по горизонтали и ±40 px по вертикали (влево, вправо, вверх, вниз). Вдоль краёв слоёв не должно быть двойных линий, ёлок на заднем плане и «ямы» у луга.
3. Приложить в `fix/` четыре картинки сдвигов.

Коммит — в ту же папку `public/livebg/assets/scene-mountains/`. Ничего больше не менять.

На будущее — правило для разборки мастера: скрытые зоны всегда перерисовываются через edits с маской как продолжение собственного рельефа слоя. Растягивать или размазывать пиксели нельзя.
