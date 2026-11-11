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
