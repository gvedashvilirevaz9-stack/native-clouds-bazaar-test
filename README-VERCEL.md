# Native Clouds · Bazaar test on Vercel

Тестовый стенд: портал (Мой магазин + Базар) как статический сайт и маленький MCP-сервер Базара в `api/`. Это **отдельный тестовый проект**, не живой стенд.

## 1. Деплой
1. Vercel → **Add New → Project** → импортировать `native-clouds-bazaar-test` из GitHub.
2. Framework: **Other**. Остальное подхватится из `vercel.json`:
   - установка `npm install`;
   - сборка `node build.mjs`;
   - папка сайта `web`;
   - функции `api/*.mjs`.
3. **Deploy**. Проверка: `https://<app>.vercel.app/api/health`.

## 2. Переменные (Vercel → Project → Settings → Environment Variables)

Все необязательные: без них работают поиск по прайс-листам, проверка оплат и пробный запрос x402.

| Переменная | Зачем |
|---|---|
| `MCP_TOKEN` | Пароль для MCP: любая длинная случайная строка. Без него оплата агентом выключена |
| `CATALOG_URLS` | Адреса опубликованных прайс-листов через запятую: по ним идёт `catalog_search` |
| `SHOPIFY_STORE_DOMAIN`, `SHOPIFY_STOREFRONT_TOKEN` | Тестовый магазин Shopify и токен Storefront API (только чтение) |
| `SHOPIFY_API_VERSION` | По умолчанию `2026-07` |
| `AGENT_PRIVATE_KEY` | Ключ **отдельного тестового** кошелька агента. Не личного! Пополнить тестовыми USDC в Base Sepolia |
| `AGENT_NETWORKS` | По умолчанию `base-sepolia`. Добавлять `base` (настоящие деньги) только осознанно |
| `AGENT_MAX_PER_CALL_USDC` | Лимит на одну оплату, по умолчанию `0.10` |
| `BASE_RPC`, `BASE_SEPOLIA_RPC` | Свои RPC при желании (по умолчанию публичные) |

После изменения переменных нажмите **Redeploy**.

## 3. Подключить MCP к Claude

Claude → Settings → Connectors → **Add custom connector** → URL:

```
https://<app>.vercel.app/api/mcp?key=<MCP_TOKEN>
```

Инструменты:
- `status`;
- `pricelist_fetch`, `catalog_search`, `shopify_search`;
- `payment_request`, `payment_verify`, `wallet_balance`;
- `x402_probe`, `x402_pay`.

## Кто платит

- **Человек:** `payment_request` (точная сумма с номером заказа, ссылка для кошелька) → платит со своего кошелька → `payment_verify {tx}`.
- **Shopify:** оплата на странице магазина (ссылка в результате поиска).
- **Агент:** `x402_probe` → человек соглашается → `x402_pay {confirm:true}`. Платит только тестовый кошелёк, только в разрешённых сетях и не больше лимита.

## Ограничения этой версии

- Сервер без памяти: каталоги берутся из `CATALOG_URLS` и из адресов в запросе. Лавки и заказы Базара в браузере хранятся отдельно и серверу не видны.
- x402 v1 (`X-PAYMENT`) проверен на подменённом сервере. v2 (`PAYMENT-SIGNATURE`) экспериментальный.
- Shopify: поиск по одному магазину через Storefront API; оплата на стороне Shopify.

## Вход через Coinbase и оплата с Coinbase (Базар)
- Те же адреса и та же сессия, что у «Моего магазина» на портале: `/api/my-shop/auth/{session,challenge,verify,logout}`.
  Подпись Sign-In with Ethereum в сети Base (8453), проверка подписи на сервере (обычные и смарт-кошельки Coinbase), cookie на 7 дней.
- В тестовом проекте эти маршруты даёт `api/my-shop/auth/[action].mjs`. **В живой портал этот файл не переносить** — там маршруты уже есть.
  Базар берёт только `session` (адрес) и провайдер кошелька; портал может отдать свой: `window.__ncWallet = {provider, signIn, signOut}`.
- Env: `AUTH_SECRET` — любая длинная случайная строка (без неё работает слабый тестовый запасной ключ).
- В Базаре: кнопка «Войти через Coinbase» в шапке, вкладка «💸 Платить криптой» (баланс USDC, где работает крипта, перевод на адрес вручную),
  оплата заказов лавок — «Оплатить с Coinbase». Каждую оплату человек подтверждает в кошельке.

## Кошелёк агента (временно)
Отдельный EVM-адрес со своим ключом, только для x402 и только в лимитах: `AGENT_PRIVATE_KEY`, `AGENT_NETWORKS` (по умолчанию base-sepolia),
`AGENT_MAX_PER_CALL_USDC` (0.10), `MCP_TOKEN`. Личный Coinbase-кошелёк агент не трогает. Позже заменяется системой владельца.

## TODO · Travala (отели за USDC) — отложено, код готов
Статус: сервер готов (`api/_lib/travala.mjs`, маршрут `/api/x/travala?op=…`): вход в аккаунт Travala (OAuth 2.1 + PKCE,
сам регистрирует приложение), запросы к Travel MCP (`op=tools`, `op=call`), оплата брони — x402 с кошелька человека.
Почему не работает на тестовом сайте: Travala пускает возврат после входа только на «разрешённые HTTPS-домены» или на
локальный адрес (`http://127.0.0.1…` / `localhost`). Ответ их сервера: `invalid_redirect_uri — redirect_uris must contain
1-10 URLs, each HTTPS to an allowed host or HTTP on loopback`.

Что сделать при переносе в портал (для Codex):
1. Перенести `api/_lib/travala.mjs` и маршрут `/api/x/travala` (или эквивалент в серверном слое портала).
2. На локальном стенде (`http://127.0.0.1:8825`) адрес возврата будет `http://127.0.0.1:8825/api/x/travala?op=callback` —
   loopback Travala разрешает, ключ и письма не нужны. Cookie `Secure` для http://127.0.0.1 убрать (как в my-shop/auth).
3. Кнопка «Войти в Travala» открывает `/api/x/travala?op=login` в окне; после «Разрешить» окно шлёт `postMessage({source:'travala',ok:true})`.
4. Дальше `op=tools` → список инструментов (travala_search_hotel → travala_search_package → travala_book → x402 оплата).

Для боевого HTTPS-адреса портала: написать в Travala (поддержка / партнёрская программа для разработчиков Travel MCP),
приложить: название приложения (Native Clouds), финальный домен портала и точный адрес возврата
`https://<домен>/api/x/travala?op=callback`, просьбу добавить домен в список разрешённых для OAuth Travel MCP
(scopes mcp:read mcp:book mcp:pay mcp:cancel). Заодно попросить agent_id для 10% cbBTC-ребейта разработчику.
Тест: бронь с бесплатной отменой → сразу отмена (песочницы у Travala нет).
