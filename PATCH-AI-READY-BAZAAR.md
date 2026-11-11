# Патчи от 11 ноября 2026: «Читается ИИ» и «Базар»

База — версия `Sunrise-Workshop-20261110-shop.zip` (магазин с админкой). Патчей два, они независимы по смыслу:

| Патч | Что делает | Риск для текущего портала |
|---|---|---|
| `01-ai-ready.patch` | Пункты 1–2: каждый HTML-файл магазина несёт разметку schema.org и прайс-лист `nativeclouds.pricelist.v1`; в zip сайта добавляются `products.json` и `llms.txt`; в админке новая страница «🤖 Опубликовать для ИИ»; команда `admin.publish` | Низкий: в существующих файлах только дописаны строки. ShopConfig получил одно **необязательное** поле `siteUrl`. Старые сайты и сохранённые магазины открываются как раньше |
| `02-bazaar.patch` | Новый отдельный модуль «🧺 Базар» (покупка): `src/spaces/bazaar/*`, кнопка в доке, команды `bazaar.*`, демо-сценарий `bazaar`, BAZAAR.md | Низкий: новая папка. В «Моём магазине» тронута одна ветка в runtime (режим `bazaar` в checkout), она срабатывает только в Базаре. В `standalone/main.tsx` добавлены кнопка, ленивая комната, маршрутизация команд и места `portal.open` |

## Как применить (Codex)

```bash
git apply --check 01-ai-ready.patch && git apply 01-ai-ready.patch
node build.mjs          # пересоздаёт runtime.generated.ts — он в патч не входит
# проверить, затем:
git apply --check 02-bazaar.patch && git apply 02-bazaar.patch
node build.mjs
```

Если портал уже правили и патч не ложится автоматически, вставьте руками. Места:

**01-ai-ready**
- `src/spaces/shop/seo.ts` — новый файл, копировать целиком.
- `src/spaces/shop/export.ts`:
  - импорт `headTags, manifest, llmsTxt`;
  - в `html()` после `<meta name="generator">` строка `${mode === 'file' ? headTags(cfg, safe) : ''}`;
  - тип mode дополнен `'bazaar'`;
  - в `packSite()` два файла в zip (`products.json`, `llms.txt`) и константа `AI_README`.
- `src/spaces/shop/model.ts` — `siteUrl?: string` в конце `ShopConfig`.
- `src/spaces/shop/AdminPanel.tsx`:
  - пункт меню `ai`;
  - компонент `AiPublish`;
  - строка `{sub === 'ai' && <AiPublish/>}`;
  - чтение `__shopUiPending` при монтировании. Это исправление: раньше `admin.open {page}` при закрытой комнате открывал «Главную», а не нужную страницу.
- `src/spaces/shop/commands.ts` — `'admin.publish'` в списке команд и его `case`.
- `src/spaces/shop/shop.css` — 7 строк `.ad-checks`, `.ad-steps`, `.ad-pre`.
- `standalone/main.tsx` — место `'ai-publish'` в `portal.open`.

**02-bazaar**
- `src/spaces/bazaar/` — новая папка, копировать целиком.
- `src/spaces/shop/runtime/index.ts`:
  - тип `Mode` дополнен `'bazaar'`;
  - в `checkout()` ветка `if (mode === 'bazaar') { post({type:'bazaar:checkout', …}); … return; }`.
- `standalone/main.tsx`:
  - импорт `BAZAAR_COMMANDS`;
  - `lazy(BazaarRoom)`;
  - маршрут `bazaar.*` в `execute`;
  - места `bazaar / marketplace / purchases / bazaar.connect` и ветка `p[0]==='bazaar'` в `portal.open`;
  - состояние `bazaarOpen` и события `bazaar:open / bazaar:close`;
  - кнопка `🧺 Базар` в доке;
  - `.bz-room` в списке зон, где глобальный drop не перехватывает файлы.

## Что проверено (Playwright, сеть Base подменена)

**Продавец**
- Сборка магазина агентом.
- `admin.publish` с адресом сайта: проверки готовности видны.
- В файле есть `#nc-pricelist` и JSON-LD; число `<script>` и `</script>` совпадает, даже если в названии товара есть `</script>`.
- В прайс-листе только товары с ценой и адресом.

**Покупатель (Базар)**
- Файл бросили через «Принести прайс-лист»: лавка появилась, витрина показана в песочнице.
- В корзину → «Перейти к оплате» → заказ #code с суммой 120.00xxxx.
- «Проверить оплату» → «✓ Оплачено».

**Подключённый каталог**
- `bazaar.stall.add` с тремя маршрутами: evm, link, x402. Адрес с ошибкой отброшен.
- Поиск «кастрюля» находит товар, «холодильник» — нет, и Базар подсказывает, где ещё искать.
- `bazaar.confirm {tx}` подтверждает оплату по хешу.

**Лимиты агента**
- `bazaar.pay` при выключенном агенте → `AGENT_PAY_OFF`.
- Агент пытается включить себя сам → `ONLY_PERSON_CAN_ENABLE`.

**«Злой» файл**
- Его скрипт не выполнился.
- HTML в названии остался текстом.
- `javascript:` в картинке и битый адрес убраны, выданы предупреждения.

**Регрессия**
- Админка: вход, данные, кошельки, бухгалтерия, хеш.
- Сборка агентом: «барахло из подвала», VHS.
- Демо-сценарии `shop`, `shop-admin`, `bazaar`.

Живые платежи в сети не проверялись.
