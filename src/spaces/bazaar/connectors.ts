// How each kind of seller plugs into the Bazaar, and who pays. One table, so modules can be added one by one.
// Status here = status IN THIS BUILD: "ready" works now; "adapter" works when an agent/adapter pushes the catalog
// in with bazaar.stall.add (the portal itself makes no outside calls); "planned" is designed, not built.
export type Payer = 'human' | 'agent';
export type Flow = 'human→seller' | 'agent→seller' | 'agent→agent';
export type Connector = {
  id: string; title: string; standard: string; status: 'ready' | 'adapter' | 'planned';
  payers: Payer[]; flows: Flow[]; money: string;
  how: string; agent: string; needs: string; link?: string;
};

export const CONNECTORS: Connector[] = [
  {id: 'file', title: 'Прайс-лист файлом (HTML «Мой магазин»)', standard: 'nativeclouds.pricelist.v1 внутри HTML (#shop-data, #nc-pricelist)', status: 'ready',
    payers: ['human', 'agent'], flows: ['human→seller', 'agent→seller'], money: 'USDC в сети Base напрямую на кошелёк продавца',
    how: 'Перетащить файл в Базар или bazaar.import. Лавка остаётся в памяти; новая версия файла того же магазина заменяет старую.',
    agent: 'bazaar.search → bazaar.order → человек платит (QR/кошелёк) или агент: bazaar.pay (в пределах лимитов) → bazaar.confirm {tx}.',
    needs: 'Ничего: ни сервера, ни регистрации.'},
  {id: 'pricelist-json', title: 'products.json с чужого сайта', standard: 'nativeclouds.pricelist.v1 (JSON)', status: 'ready',
    payers: ['human', 'agent'], flows: ['human→seller', 'agent→seller'], money: 'USDC в Base на адрес из прайс-листа',
    how: 'bazaar.import {text} с содержимым products.json (агент скачивает его сам).', agent: 'Как для файла.', needs: 'Опубликованный сайт продавца.'},
  {id: 'mcp', title: 'Каталог магазина через MCP', standard: 'Model Context Protocol: инструменты search / product / cart у сервера продавца', status: 'adapter',
    payers: ['human', 'agent'], flows: ['human→seller', 'agent→seller'], money: 'Как у магазина: USDC (если даёт адрес), иначе его checkout-ссылка',
    how: 'Агент (Codex/Claude/Grok) подключён к MCP-серверу магазина, читает каталог и кладёт его в Базар: bazaar.stall.add {protocol:"mcp", items}.',
    agent: 'Поиск у себя → bazaar.stall.add → человек выбирает в Базаре → оплата по маршруту товара.', needs: 'MCP-клиент на стороне агента; адрес сервера магазина.'},
  {id: 'ucp', title: 'Shopify / Google: Universal Commerce Protocol', standard: 'UCP (открытый стандарт Google + Shopify и др.; совместим с MCP, A2A, AP2)', status: 'adapter',
    payers: ['human'], flows: ['human→seller'], money: 'Checkout магазина (карта, Shop Pay, у части магазинов USDC через Shopify Payments)',
    how: 'Агент получает каталог через UCP/MCP магазина и кладёт его лавкой: bazaar.stall.add {protocol:"ucp", items:[…pay:{kind:"link"}]}.',
    agent: 'Агент ищет и собирает корзину; оплату завершает человек на странице магазина.', needs: 'Доступ агента к UCP/Catalog; продавец остаётся продавцом по сделке.'},
  {id: 'acp', title: 'OpenAI: Agentic Commerce Protocol', standard: 'ACP (открытый, OpenAI + Stripe)', status: 'adapter',
    payers: ['human'], flows: ['human→seller'], money: 'Checkout продавца / Stripe',
    how: 'Как UCP: каталог приносит агент, в Базаре товар со ссылкой на оплату.', agent: 'Поиск и сравнение; оплата у продавца.', needs: 'Интеграция продавца с ACP.'},
  {id: 'x402', title: 'Сервисы с оплатой x402 (API, данные, домены, гифт-карты…)', standard: 'HTTP 402 Payment Required → подпись EIP-3009 → USDC в Base', status: 'planned',
    payers: ['agent'], flows: ['agent→seller', 'agent→agent'], money: 'USDC в Base, обычно копейки за запрос; без газа для плательщика',
    how: 'Лавка с товарами pay:{kind:"x402", url}. Платит агентский кошелёк: запрос → 402 с ценой → подпись → повтор запроса с подписью.',
    agent: 'Только агент с отдельным кошельком и лимитами (см. «Агент и лимиты»). Хеш/квитанция сохраняется в «Мои покупки».',
    needs: 'Агентский кошелёк (отдельный от личного), сервер или агент, который умеет отвечать на 402. В этой сборке — только описание и лимиты.', link: 'https://www.x402.org/'},
  {id: 'a2a', title: 'Агент ↔ агент (A2A / AP2)', standard: 'Agent2Agent + Agent Payments Protocol (мандаты на оплату)', status: 'planned',
    payers: ['agent'], flows: ['agent→agent'], money: 'По мандату пользователя: лимит, срок, продавец',
    how: 'Ваш агент договаривается с агентом продавца, оплата — по подписанному вами мандату.', agent: 'Нужна политика: кому, сколько, до какого числа.', needs: 'Сервер/хостинг агента; будущий модуль.'},
];

export const STATUS_RU = {ready: 'работает', adapter: 'через агента', planned: 'план'} as const;
export const FLOW_RU: Record<Flow, string> = {'human→seller': 'человек → продавец', 'agent→seller': 'агент → продавец', 'agent→agent': 'агент → агент'};

/** Agent spending rules. The agent never gets keys: it can only ask the browser wallet, inside these limits; the wallet still asks the person. */
export type AgentPolicy = {enabled: boolean; perOrderMax: string; perDayMax: string; onlyStalls: string[]; needConfirmAbove: string; routes: {evm: boolean; x402: boolean}};
export const DEFAULT_POLICY: AgentPolicy = {enabled: false, perOrderMax: '50', perDayMax: '100', onlyStalls: [], needConfirmAbove: '20', routes: {evm: true, x402: false}};
