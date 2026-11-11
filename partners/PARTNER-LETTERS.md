# Письма партнёрам · Native Clouds (Bazaar)

## Принцип (не нарушать)
Native Clouds — **бесплатный агрегатор / витрина**. Мы:
- **не** принимаем деньги покупателей, **не** держим их кошельки, **не** пополняем балансы у поставщиков, **не** перепродаём;
- показываем каталоги поставщиков у себя и даём кнопку оплаты, при которой **покупатель платит поставщику напрямую** со своего кошелька
  (как сейчас с Bitrefill: x402, получатель — адрес Bitrefill, подпись делает кошелёк человека);
- зарабатываем только на **партнёрских бонусах** (referral / affiliate) за трафик, который приводим.

Почему так: приём и хранение средств клиентов (кошельки, балансы, обмен) в Грузии требует лицензии/регистрации
Национального банка Грузии (VASP). Это — когда компания вырастет. Сейчас — только агрегатор. (Не юридическая консультация;
при регистрации компании проверить с юристом.)

Что спрашиваем у каждого:
1. Можно ли **засчитывать нам** покупки, которые человек делает **у нас в окне** со своего кошелька (partner/referral id в API или x402-запросе)?
2. Есть ли **открытый каталог / виджет / API без перепродажи** (покупатель платит вам напрямую), и условия использования.
3. Размер и форма вознаграждения (процент, в чём платится, порог выплаты), нужна ли компания или можно частному лицу на старте.

Подставить перед отправкой: `[NAME]`, `[EMAIL]`, `[PORTAL URL]` (сейчас тест: https://native-clouds-bazaar-test.vercel.app).

---

## 1. Bitrefill — partner / affiliate attribution for in-portal x402 purchases
**To:** Bitrefill partnerships (via https://www.bitrefill.com/integrate/ or the affiliate form https://www.bitrefill.com/affiliate/)
**Subject:** Native Clouds × Bitrefill — referral attribution for wallet-native (x402) purchases

Hello Bitrefill team,

I'm [NAME], founder of Native Clouds ([PORTAL URL]) — a free web portal where people find and buy things
with their own crypto wallets. We are an aggregator only: we never hold user funds, never take deposits and never resell.

We have already integrated Bitrefill's public wallet-native flow (SIWX sign-in → search → invoice → x402 pay on Base):
the buyer signs in with their own Coinbase wallet, picks a top-up / gift card / eSIM inside our page, and pays Bitrefill
directly (payTo = Bitrefill). A real purchase (Silknet Georgia top-up) went through end-to-end today.

We would like to become a Bitrefill partner and ask:
1. Can purchases made this way inside Native Clouds be **attributed to us** (a referral / partner id we pass in the
   x402 calls, or via the Affiliate API)?
2. Is the Affiliate API (commission tracking) available for a platform like ours, and what are the terms
   (rate, store credit vs. cash, payout threshold)?
3. Is a registered company required at this stage, or can we start as an individual and move to a company later?
4. Could we get access to test products to verify the flow without real spending?

We are happy to show a short demo. Thank you!

Best regards,
[NAME] · Native Clouds · [EMAIL]

---

## 2. CoinGate Gift Cards / GIFQ — catalog + affiliate without reselling
**To:** CoinGate Gift Cards affiliates (https://coingate.com/gift-cards/affiliates · affiliates.coingate.gift) and GIFQ (https://www.gifq.com)
**Subject:** Native Clouds — showing CoinGate Gift Cards in our portal (affiliate, buyer pays CoinGate directly)

Hello CoinGate team,

I'm [NAME], founder of Native Clouds ([PORTAL URL]), a free portal where people search shops and services
and pay with their own crypto wallets. We are an aggregator: we do not accept or hold customer funds and we do not resell.

We would like to feature CoinGate Gift Cards inside our portal: the user browses brands in our interface and
completes the purchase with CoinGate, paying CoinGate directly from their own wallet.

Questions:
1. Do you offer a **catalog API or embeddable widget** for affiliates (not bulk/reseller purchasing), so the buyer pays CoinGate directly?
2. If not, can we use your affiliate links with **deep links to a specific brand and amount**, so the user lands right at checkout?
3. Affiliate terms for a platform like ours (rate, payout currency, threshold), and whether a company is required.
4. Is GIFQ API available in a mode where the end customer pays (we never pre-fund a balance)?

Thank you — happy to share a demo.

Best regards,
[NAME] · Native Clouds · [EMAIL]

---

## 3. Coinsbee — partnership for a crypto aggregator
**To:** Coinsbee (support / partnerships via https://www.coinsbee.com · press@coinsbee.com for routing)
**Subject:** Partnership request — Native Clouds (crypto spending aggregator)

Hello Coinsbee team,

I'm [NAME], founder of Native Clouds ([PORTAL URL]). We build a free portal where people discover where they can
spend crypto and buy with their own wallets. We are an aggregator only — no custody, no deposits, no reselling.

We would love to list Coinsbee's catalog (5,000+ brands, 200+ cryptocurrencies) in our portal and send buyers to complete
the purchase with Coinsbee, paying you directly.

Could you tell us:
1. Do you have an **affiliate / referral program** or partner API (catalog, deep links to brand + amount, widget)?
2. Terms (commission, payout, threshold) and whether a registered company is required.
3. Any guidelines for showing your brands and prices in a third-party interface.

Thank you!

Best regards,
[NAME] · Native Clouds · [EMAIL]

---

## 4. Travala — allow our domain for Travel MCP OAuth (when the final HTTPS domain exists)
**To:** Travala support / developer contact for Travel MCP (help.travala.com chat → ask for the Travel MCP / agent team)
**Subject:** Travel MCP OAuth — please allow redirect for Native Clouds

Hello Travala team,

I'm [NAME], founder of Native Clouds ([PORTAL URL]). We integrated your Travel MCP (travel-mcp.travala.com) so our users
can search and book hotels with their own Travala login, paying with their own wallet (x402, USDC on Base).
We never hold user funds.

Dynamic client registration currently rejects our redirect URI:
`invalid_redirect_uri — redirect_uris must contain 1-10 URLs, each HTTPS to an allowed host or HTTP on loopback`.

Could you please allow this redirect URI for OAuth:
`https://[FINAL DOMAIN]/api/x/travala?op=callback`
(scopes: mcp:read mcp:book mcp:pay mcp:cancel)

We'd also like to join the developer rebate program — please share how to get an agent_id for attribution.

Thank you!

Best regards,
[NAME] · Native Clouds · [EMAIL]
