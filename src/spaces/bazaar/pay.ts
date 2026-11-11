// Paying in the Bazaar (buyer side). Same chain helpers as the seller's page, so the seller's admin
// recognises the payment (order number in the amount) and the hash proves it.
import {payWithWallet, findPayment, lookupTx, head, units, fmt, codeOf} from '../shop/chain';
import {bazaar, type Order} from './store';

/** The buyer's browser wallet (Coinbase Wallet, MetaMask… — any EIP-1193) sends USDC on Base. The wallet always asks the person. */
export async function payGroup(orderId: string, i: number, byAgent = false) {
  const o = bazaar.getOrder(orderId); if (!o) throw new Error('ORDER_NOT_FOUND'); const g = o.groups[i];
  if (!g || g.route !== 'evm' || !g.to) throw new Error('NOT_AN_EVM_PAYMENT');
  if (g.paid) return {already: true, tx: g.paid.tx};
  if (byAgent) { const m = bazaar.agentMay(o, g); if (!m.ok) throw new Error(m.reason); }
  if (o.startBlock == null) { try { const h = await head(); bazaar.patchOrder(o.id, x => { x.startBlock = h - 30; }); } catch { /* offline */ } }
  const tx = await payWithWallet(g.to, units(g.amount));
  bazaar.patchOrder(o.id, x => { x.groups[i].sent = {tx, at: Date.now(), byAgent}; });
  return {tx};
}

/** Look in the chain for the payment (exact amount with the order number, or the round price as a fallback). */
export async function checkGroup(orderId: string, i: number) {
  const o = bazaar.getOrder(orderId); if (!o) throw new Error('ORDER_NOT_FOUND'); const g = o.groups[i];
  if (!g?.to) throw new Error('NOT_AN_EVM_PAYMENT'); if (g.paid) return g.paid;
  if (g.sent?.tx) { const r = await confirmHash(o.id, i, g.sent.tx).catch(() => null); if (r) return r; }
  const r = await findPayment({to: g.to, amount: units(g.amount), base: units(g.total), startBlock: o.startBlock, created: o.created});
  if (!r.paid) return null;
  const paid = {tx: r.tx!, from: r.from!, amount: fmt(r.amount!), exact: !!r.exact, confirmed: !!r.confirmed, at: Date.now()};
  bazaar.patchOrder(o.id, x => { x.groups[i].paid = paid; }); return paid;
}

/** "I paid, here is the hash": verifies that this transaction moved USDC to this seller's address, with the right amount. */
export async function confirmHash(orderId: string, i: number, tx: string) {
  const o = bazaar.getOrder(orderId); if (!o) throw new Error('ORDER_NOT_FOUND'); const g = o.groups[i];
  if (!g?.to) throw new Error('NOT_AN_EVM_PAYMENT');
  const r: any = await lookupTx(tx, [g.to.toLowerCase()]);
  if (!r.found) throw new Error(r.reason === 'FAILED' ? 'TX_FAILED' : 'TX_NOT_FOUND');
  const t = r.toMe.find((x: any) => x.amount === units(g.amount) || x.amount === units(g.total)) || r.toMe[0];
  if (!t) throw new Error('TX_NOT_TO_THIS_SELLER');
  if (t.amount < units(g.total)) throw new Error(`AMOUNT_TOO_SMALL: ${fmt(t.amount)} < ${g.total}`);
  const paid = {tx: r.tx, from: t.from, amount: fmt(t.amount), exact: t.amount === units(g.amount) || codeOf(t.amount) === o.code % 10000, confirmed: !!r.confirmed, at: Date.now()};
  bazaar.patchOrder(o.id, x => { x.groups[i].paid = paid; x.groups[i].sent = x.groups[i].sent || {tx: r.tx, at: Date.now()}; });
  return paid;
}

export const orderPaid = (o: Order) => o.groups.filter(g => g.route === 'evm').every(g => g.paid);
