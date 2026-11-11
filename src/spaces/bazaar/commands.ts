// Agent commands for the Bazaar (buying side). Separate from shop.* / admin.* (selling side).
import {bazaar, type ConnItem, type Protocol} from './store';
import {parseCartridge} from './cartridge';
import {payGroup, checkGroup, confirmHash, orderPaid} from './pay';
import {CONNECTORS} from './connectors';
import {checkAddress} from '../billing/evm';
import {normPrice} from '../shop/model';
import {payUri, units, CHAIN_ID, USDC} from '../shop/chain';

export const BAZAAR_COMMANDS = ['bazaar.open', 'bazaar.import', 'bazaar.stalls', 'bazaar.stall.add', 'bazaar.stall.remove', 'bazaar.search', 'bazaar.items',
  'bazaar.order', 'bazaar.pay', 'bazaar.check', 'bazaar.confirm', 'bazaar.orders', 'bazaar.message', 'bazaar.connectors', 'bazaar.policy.get', 'bazaar.policy.set'];

const ui = (d: object) => { (window as any).__bazaarUiPending = d; window.dispatchEvent(new CustomEvent('bazaar:open')); setTimeout(() => window.dispatchEvent(new CustomEvent('bazaar:ui', {detail: d})), 60); };
const orderOut = (o: ReturnType<typeof bazaar.getOrder>) => o && ({id: o.id, code: o.code, stall: o.stallName, paid: orderPaid(o), items: o.items,
  payments: o.groups.map((g, i) => ({group: i, route: g.route, to: g.to, seller: g.seller || null, amount: g.amount, roundAmount: g.total, url: g.url || null,
    uri: g.to && g.route === 'evm' ? payUri(g.to, units(g.amount)) : null, chainId: CHAIN_ID, token: USDC, sentTx: g.sent?.tx || null, paid: g.paid || null}))});

async function textFrom(a: any): Promise<{name: string; text: string}> {
  if (typeof a.text === 'string') return {name: a.name || 'price-list.html', text: a.text};
  if (typeof a.dataUrl === 'string' && a.dataUrl.startsWith('data:')) return {name: a.name || 'price-list.html', text: await (await fetch(a.dataUrl)).text()};
  if (typeof a.url === 'string' && /^https:\/\//.test(a.url)) { const r = await fetch(a.url); if (!r.ok) throw new Error('FETCH_FAILED_' + r.status); return {name: a.url.split('/').pop() || 'price-list', text: await r.text()}; }
  if (typeof a.assetId === 'string') {
    const {intake} = await import('../intake/store'); const {getBlob} = await import('../garage/store');
    const x: any = intake.get(a.assetId.replace(/^asset:/, '')); if (!x) throw new Error('ASSET_NOT_FOUND');
    const b = x.origRef ? await getBlob(x.origRef) : null; if (!b) throw new Error('ASSET_FILE_MISSING');
    return {name: x.name || 'price-list.html', text: await b.text()};
  }
  throw new Error('GIVE_text_OR_dataUrl_OR_url_OR_assetId');
}

export async function runBazaar(cmd: string, a: any = {}) {
  await bazaar.load();
  switch (cmd) {
    case 'bazaar.open': ui({tab: a.tab || 'stalls', stall: a.stall ? bazaar.stall(a.stall)?.key ?? null : null, q: a.q}); return {opened: true, stalls: bazaar.get().stalls.length};
    case 'bazaar.import': {
      const {name, text} = await textFrom(a); const r = parseCartridge(text);
      const s = bazaar.addFile({cfg: r.cfg, file: name, size: text.length, warnings: r.warnings, source: r.source});
      if (a.show !== false) ui({tab: 'stalls', stall: s.key});
      return {stall: s.key, name: s.cfg.brand.name, items: bazaar.catalog(s.key).length, payable: bazaar.catalog(s.key).filter(i => i.pay === 'evm' && i.price).length, warnings: r.warnings};
    }
    case 'bazaar.stalls': return {stalls: bazaar.get().stalls.map(s => ({key: s.key, name: bazaar.name(s), kind: s.kind, protocol: s.kind === 'connector' ? s.protocol : 'file', items: bazaar.catalog(s.key).length, importedAt: new Date(s.importedAt).toISOString()}))};
    case 'bazaar.stall.add': {
      // An agent brings a catalog from an outside service (MCP / UCP / ACP / x402 / API). Only plain data is accepted.
      const protocol: Protocol = ['mcp', 'ucp', 'acp', 'x402', 'api', 'manual'].includes(a.protocol) ? a.protocol : 'api';
      if (!a.name || !Array.isArray(a.items)) throw new Error('NEED_name_AND_items');
      const items: ConnItem[] = a.items.slice(0, 500).map((i: any, n: number) => {
        const p = i.pay || {}; let pay: ConnItem['pay'] = {kind: 'none'};
        if (p.kind === 'evm') { const c = checkAddress(String(p.to || '')); pay = c.ok ? {kind: 'evm', to: c.address} : {kind: 'none'}; }
        else if ((p.kind === 'x402' || p.kind === 'link') && /^https:\/\/[^\s"'<>]+$/.test(String(p.url || ''))) pay = {kind: p.kind, url: String(p.url)};
        return {id: String(i.id || 'i' + n).slice(0, 60), title: String(i.title || 'Товар').slice(0, 160), text: String(i.text || '').slice(0, 1000), price: normPrice(i.price), unit: i.unit ? String(i.unit).slice(0, 30) : undefined,
          image: /^https:\/\/[^\s"'()<>]+$/.test(String(i.image || '')) ? String(i.image) : null, url: /^https:\/\//.test(String(i.url || '')) ? String(i.url) : undefined, pay};
      });
      const s = bazaar.addConnector({key: a.key, name: String(a.name).slice(0, 80), protocol, endpoint: a.endpoint ? String(a.endpoint).slice(0, 300) : undefined, note: a.note ? String(a.note).slice(0, 400) : undefined, logo: null, items});
      if (a.show !== false) ui({tab: 'stalls', stall: s.key});
      return {stall: s.key, items: items.length, payableByHuman: items.filter(i => i.pay.kind === 'evm' && i.price).length, viaLink: items.filter(i => i.pay.kind === 'link').length, x402: items.filter(i => i.pay.kind === 'x402').length};
    }
    case 'bazaar.stall.remove': { const s = bazaar.stall(a.stall || ''); if (!s) throw new Error('STALL_NOT_FOUND'); bazaar.remove(s.key); return {removed: s.key}; }
    case 'bazaar.search': {
      const found = bazaar.search(String(a.q || ''), a.stall ? bazaar.stall(a.stall)?.key : undefined).slice(0, a.limit || 30);
      if (a.show) ui({tab: 'stalls', stall: null, q: a.q});
      return {q: a.q, found: found.map(i => ({stall: i.stall, stallName: i.stallName, item: i.id, title: i.title, price: i.price, unit: i.unit || null, seller: i.seller || null, place: i.place || null, pay: i.pay})),
        elsewhere: found.length ? undefined : CONNECTORS.filter(c => c.status !== 'ready').map(c => ({id: c.id, title: c.title, how: c.how})),
        hint: found.length ? undefined : 'Не найдено в лавках. Найдите у сервисов (MCP/UCP) своими инструментами и положите каталог: bazaar.stall.add.'};
    }
    case 'bazaar.items': { const s = bazaar.stall(a.stall || ''); if (!s) throw new Error('STALL_NOT_FOUND'); return {stall: s.key, items: bazaar.catalog(s.key).map(i => ({item: i.id, title: i.title, text: i.text.slice(0, 200), price: i.price, unit: i.unit || null, seller: i.seller || null, place: i.place || null, pay: i.pay}))}; }
    case 'bazaar.order': {
      const s = bazaar.stall(a.stall || ''); if (!s) throw new Error('STALL_NOT_FOUND');
      const o = bazaar.order(s.key, (a.items || []).map((x: any) => ({id: String(x.item || x.id || x.title), qty: Math.max(1, Math.min(999, +x.qty || 1))})), a.buyer || {});
      if (a.show !== false) ui({tab: 'stalls', stall: s.key, order: o.id});
      return {order: orderOut(o), next: 'Человек платит по QR/кошельку в панели заказа, или bazaar.pay {order} (если разрешено в «Агент и лимиты»). Затем bazaar.check или bazaar.confirm {order, tx}.'};
    }
    case 'bazaar.pay': {
      const o = bazaar.getOrder(a.order || ''); if (!o) throw new Error('ORDER_NOT_FOUND'); ui({tab: 'stalls', stall: o.stall, order: o.id});
      const p = bazaar.get().policy; const out: any[] = [];
      for (const [i, g] of o.groups.entries()) {
        if (a.group != null && +a.group !== i) continue; if (g.route !== 'evm' || g.paid) continue;
        const may = bazaar.agentMay(o, g); if (!may.ok) { out.push({group: i, error: may.reason}); continue; }
        if (units(g.amount) > units(p.needConfirmAbove)) { out.push({group: i, needsHuman: true, reason: `Сумма ${g.amount} выше порога ${p.needConfirmAbove} USDC — пусть человек нажмёт «Оплатить» в панели заказа`}); continue; }
        try { out.push({group: i, ...(await payGroup(o.id, i, true))}); } catch (e: any) { out.push({group: i, error: e.message}); }
      }
      return {order: o.id, results: out, note: 'Кошелёк браузера всё равно спрашивает человека. Через ~10 секунд: bazaar.check.'};
    }
    case 'bazaar.check': { const o = bazaar.getOrder(a.order || ''); if (!o) throw new Error('ORDER_NOT_FOUND'); const res = [];
      for (const [i, g] of o.groups.entries()) if (g.route === 'evm') res.push({group: i, paid: await checkGroup(o.id, i)});
      return {order: orderOut(bazaar.getOrder(o.id)), results: res}; }
    case 'bazaar.confirm': { const o = bazaar.getOrder(a.order || ''); if (!o) throw new Error('ORDER_NOT_FOUND'); const i = a.group != null ? +a.group : o.groups.findIndex(g => g.route === 'evm' && !g.paid);
      return {paid: await confirmHash(o.id, i < 0 ? 0 : i, String(a.tx || '')), order: orderOut(bazaar.getOrder(o.id))}; }
    case 'bazaar.orders': return {orders: bazaar.get().orders.slice(-30).reverse().map(o => orderOut(o))};
    case 'bazaar.message': { const o = bazaar.getOrder(a.order || ''); if (!o) throw new Error('ORDER_NOT_FOUND'); return {text: bazaar.message(o), contact: o.contact}; }
    case 'bazaar.connectors': return {connectors: CONNECTORS};
    case 'bazaar.policy.get': return {policy: bazaar.get().policy, spentToday: (Number(bazaar.agentSpentToday()) / 1e6).toString()};
    case 'bazaar.policy.set': {
      // The agent may only make the rules stricter (lower limits, switch itself off). Raising limits or switching on is done by the person in the UI.
      const cur = bazaar.get().policy; const p: any = {};
      for (const k of ['perOrderMax', 'perDayMax', 'needConfirmAbove'] as const) if (a[k] != null) { const v = normPrice(a[k]); if (v == null) throw new Error('BAD_' + k); if (units(v) > units(cur[k])) throw new Error('ONLY_PERSON_CAN_RAISE_' + k); p[k] = v; }
      if (a.enabled === true && !cur.enabled) throw new Error('ONLY_PERSON_CAN_ENABLE'); if (a.enabled === false) p.enabled = false;
      if (Array.isArray(a.onlyStalls)) { if (cur.onlyStalls.length && a.onlyStalls.some((k: string) => !cur.onlyStalls.includes(k))) throw new Error('ONLY_PERSON_CAN_WIDEN'); p.onlyStalls = a.onlyStalls.map(String); }
      return {policy: bazaar.setPolicy(p)};
    }
  }
  throw new Error('UNKNOWN_COMMAND');
}
