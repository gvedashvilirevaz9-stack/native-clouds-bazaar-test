// Agent commands for "My shop" (called through window.workshop.execute, like every other room).
import {shop} from './store';
import {TEMPLATES, AGENT_PROMPT, normPrice} from './model';
import {packFile, packSite} from './export';
import {checkAddress} from '../billing/evm';
import {downloadBlob} from '../billing/share';
import {lookupTx, head, balance, transfers, blockAt, fmt, fmt6, codeOf} from './chain';
import {kv} from './store';
import {aiChecks, manifest, llmsTxt} from './seo';
import {compose, missing, resolveImage, RECIPES, QUESTIONNAIRE, type Answers} from './recipes';

export const SHOP_COMMANDS = ['shop.sites', 'shop.switch', 'shop.questionnaire', 'shop.recipes', 'shop.compose', 'shop.photo', 'shop.banner', 'shop.missing', 'shop.finish', 'shop.open', 'shop.templates', 'shop.start', 'shop.get', 'shop.set', 'shop.section.add', 'shop.section.patch', 'shop.section.remove', 'shop.cell.add', 'shop.cell.patch', 'shop.cell.remove', 'shop.payment.set', 'shop.export', 'shop.prompt',
  'admin.open', 'admin.unlock', 'admin.status', 'admin.profile.get', 'admin.profile.set', 'admin.wallets.list', 'admin.wallets.add', 'admin.wallets.patch', 'admin.wallets.remove', 'admin.apply', 'admin.accounting', 'admin.hash', 'admin.publish'];
const ui = (detail: object) => window.dispatchEvent(new CustomEvent('shop:ui', {detail}));
const toDataUrl = (b: Blob) => new Promise<string>(r => { const f = new FileReader(); f.onload = () => r(String(f.result)); f.readAsDataURL(b); });
const lean = () => { const s = shop.get().shop; if (!s) return null; return JSON.parse(JSON.stringify(s, (k, v) => typeof v === 'string' && v.startsWith('data:') ? `(image ${Math.round(v.length / 1365)} KB)` : v)); };
const need = () => { if (!shop.get().shop) shop.start('blank'); return shop.get().shop!; };

export async function executeShop(id: string, a: any = {}) {
  await shop.load();
  switch (id) {
    // ---- the fast path: questionnaire → compose → photos → finish ----
    case 'shop.questionnaire': return {...QUESTIONNAIRE, recipes: Object.fromEntries(Object.entries(RECIPES).map(([k, r]) => [k, r.ru])), next: 'Задайте вопросы по порядку, потом вызовите shop.compose с ответами.'};
    case 'shop.sites': return {sites: shop.sites()};
    case 'shop.switch': { window.dispatchEvent(new CustomEvent('shop:open')); const x = shop.switchTo(a.id); ui({tab: 'build', edit: null}); return {opened: x.brand.name, sites: shop.sites()}; }
    case 'shop.recipes': return {recipes: Object.entries(RECIPES).map(([k, r]) => ({id: k, name: r.ru, sections: r.sections}))};
    case 'shop.compose': {
      if (!a.about) throw new Error('ABOUT_REQUIRED');
      const cur = shop.get().shop;
      if (cur && shop.get().started && !a.replace) throw new Error('SHOP_EXISTS: a shop is already being built; pass replace:true to start a new one (the old one is overwritten)');
      const {shop: cfg, kind, photos} = compose(a as Answers);
      // Same person, new site: wallet and contacts carry over unless given again.
      if (cur && !a.address && cur.payment.address) cfg.payment.address = cur.payment.address;
      if (cur && !a.contact) cfg.contact = {...cur.contact};
      if (a.address) { const c = checkAddress(a.address); if (!c.ok) throw new Error('EVM_ADDRESS_' + (c as any).reason.toUpperCase()); cfg.payment.address = c.address; }
      window.dispatchEvent(new CustomEvent('shop:open'));
      shop.adopt(cfg); if (cfg.payment.address) shop.logReceiver(cfg.payment.address, 'Общий адрес', 'injected', null);
      ui({tab: 'build', edit: null});
      const failed: string[] = [];
      for (const p of photos) {
        try { const img = await resolveImage(p.src, p.cellId === 'banner:0' ? 1600 : 1000);
          if (p.cellId === 'banner:0') shop.patchSection(shop.get().shop!.sections[0].id, {banner: img});
          else shop.patchCell(shop.get().shop!.sections[0].id, p.cellId, {image: img}); }
        catch { failed.push(p.src.slice(0, 60)); }
      }
      const s = shop.get().shop!;
      return {kind, recipe: RECIPES[kind].ru, name: s.brand.name, sections: s.sections.map(x => ({sectionId: x.id, tab: x.tab, cells: x.cells.map(c => ({cellId: c.id, title: c.title, price: c.price, photo: !!c.image}))})),
        photoErrors: failed, missing: missing(s, shop.addresses().length), next: 'Спросите недостающее (missing), подставьте shop.photo / shop.banner / shop.payment.set, затем shop.finish.'};
    }
    case 'shop.photo': {
      const s = need(); let sec = a.sectionId ? s.sections.find(x => x.id === a.sectionId) : null; let c = sec && a.cellId ? sec.cells.find(x => x.id === a.cellId) : null;
      if (!c && a.title) for (const x of s.sections) { const f = x.cells.find(y => y.title.toLowerCase().includes(String(a.title).toLowerCase())); if (f) { sec = x; c = f; break; } }
      if (!sec || !c) throw new Error('CELL_NOT_FOUND: pass sectionId+cellId or a title');
      shop.patchCell(sec.id, c.id, {image: await resolveImage(a.image)}); return {ok: true, cellId: c.id, title: c.title, missing: missing(shop.get().shop!, shop.addresses().length)};
    }
    case 'shop.banner': { const s = need(); const sec = s.sections[a.index ?? 0] || s.sections[0]; shop.patchSection(sec.id, {banner: await resolveImage(a.image, 1600)}); return {ok: true, sectionId: sec.id, missing: missing(shop.get().shop!, shop.addresses().length)}; }
    case 'shop.missing': { const s = need(); return {missing: missing(s, shop.addresses().length)}; }
    case 'shop.finish': {
      const s = need(); const left = missing(s, shop.addresses().length).filter(m => m.id === 'address' || m.id === 'prices');
      window.dispatchEvent(new CustomEvent('shop:open')); ui({tab: 'pack'});
      const r = await packFile(s); if (a.as === 'download') downloadBlob(r.blob, r.name);
      return {name: r.name, size: r.size, blockers: left, ready: !left.length, note: 'The site is one HTML file: send it in any messenger. To get a web link, publish the same file (shop.export as:"site" → Netlify Drop / Cloudflare Pages / GitHub Pages).', ...(a.as === 'dataUrl' ? {dataUrl: await toDataUrl(r.blob)} : {})};
    }
    case 'shop.open': { const d = a.preset ? {preset: a.preset} : a.tab ? {tab: a.tab} : a.view ? {view: a.view} : null; (window as any).__shopUiPending = d; window.dispatchEvent(new CustomEvent('shop:open')); if (d) ui(d); return {opened: true}; }
    case 'shop.templates': return {templates: Object.entries(TEMPLATES).map(([k, t]) => ({id: k, name: t.ru, hint: t.hint}))};
    case 'shop.start': window.dispatchEvent(new CustomEvent('shop:open')); shop.start(a.template || 'blank'); ui({tab: 'build', edit: null}); return lean();
    case 'shop.get': return {shop: lean(), started: shop.get().started, addresses: shop.addresses()};
    case 'shop.set': { need(); const p = {...a}; delete p.sections; delete p.payment; for (const k of ['brand', 'hero', 'discover', 'footer', 'contact'] as const) if (p[k]) p[k] = {...(shop.get().shop as any)[k], ...p[k]}; shop.set(p); return lean(); }
    case 'shop.section.add': { need(); const s = shop.addSection({...a, cells: (a.cells || []).map((c: any) => ({...c, price: normPrice(c.price)}))}); if (!a.cells) s.cells = []; return {sectionId: s.id}; }
    case 'shop.section.patch': { const p = {...a}; delete p.sectionId; return shop.patchSection(a.sectionId, p); }
    case 'shop.section.remove': shop.removeSection(a.sectionId); return {removed: a.sectionId};
    case 'shop.cell.add': { const p = {...a}; delete p.sectionId; const c = shop.addCell(a.sectionId, {...p, price: normPrice(p.price), tags: p.tags || []}); return {cellId: c.id}; }
    case 'shop.cell.patch': { const p = {...a}; delete p.sectionId; delete p.cellId; shop.patchCell(a.sectionId, a.cellId, p); return {ok: true}; }
    case 'shop.cell.remove': shop.removeCell(a.sectionId, a.cellId); return {removed: a.cellId};
    case 'shop.payment.set': {
      need(); const p: any = {};
      if (a.cellId && a.sectionId && a.receiver) { const c = checkAddress(a.receiver); if (!c.ok) throw new Error('EVM_ADDRESS_' + (c as any).reason.toUpperCase()); shop.patchCell(a.sectionId, a.cellId, {receiver: c.address}); shop.patch('payment', {mode: 'individual'}); shop.logReceiver(c.address, a.seller || 'Продавец', 'injected', null); return shop.get().shop!.payment; }
      if (a.address !== undefined) { if (a.address) { const c = checkAddress(a.address); if (!c.ok) throw new Error('EVM_ADDRESS_' + (c as any).reason.toUpperCase()); p.address = c.address; shop.logReceiver(c.address, 'Общий адрес', 'injected', null); } else p.address = null; }
      if (a.mode) p.mode = a.mode === 'individual' ? 'individual' : 'shared'; if (a.orderTag !== undefined) p.orderTag = !!a.orderTag; if (a.note) p.note = String(a.note);
      shop.patch('payment', p); return shop.get().shop!.payment;
    }
    case 'shop.export': {
      const s = need();
      if (a.as === 'site') { const r = await packSite(s); downloadBlob(r.blob, r.name); return {downloaded: r.name}; }
      const r = await packFile(s); if (a.as === 'download') { downloadBlob(r.blob, r.name); return {downloaded: r.name, size: r.size}; }
      return {name: r.name, size: r.size, dataUrl: await toDataUrl(r.blob)};
    }
    case 'shop.prompt': return {prompt: AGENT_PROMPT};
    // ---- admin (back office): owner data, wallets, accounting, hash check ----
    case 'admin.open': { const sub = a.page || 'home'; (window as any).__shopUiPending = {view: 'admin', admin: sub}; window.dispatchEvent(new CustomEvent('shop:open')); ui({view: 'admin', admin: sub}); return {opened: sub, unlocked: shop.get().unlocked, pages: ['home', 'profile', 'wallets', 'money', 'hash', 'sites']}; }
    case 'admin.unlock': shop.unlock(); ui({view: 'admin'}); return {unlocked: true, note: 'Пароль пока заглушка: вход без проверки.'};
    case 'admin.status': { const st = shop.get(); const p = st.profile; return {unlocked: st.unlocked, profile: p.firstName || p.business ? {name: [p.firstName, p.lastName].filter(Boolean).join(' '), business: p.business} : null,
      wallets: shop.wallets().length, defaultWallet: shop.defaultWallet()?.label || null, site: st.shop ? {name: st.shop.brand.name, missing: missing(st.shop, shop.addresses().length).map(m => m.id)} : null, sites: shop.sites().length,
      todo: [...(!(p.firstName || p.business) ? ['admin.profile.set'] : []), ...(!shop.wallets().length ? ['admin.wallets.add'] : []), ...(!st.shop ? ['shop.compose или shop.start'] : [])]}; }
    case 'admin.profile.get': return {profile: {...shop.get().profile, logo: shop.get().profile.logo ? '(image)' : null}};
    case 'admin.profile.set': { const keys = ['firstName', 'lastName', 'business', 'place', 'telegram', 'whatsapp', 'email', 'phone', 'delivery'] as const; const p: any = {}; for (const k of keys) if (a[k] !== undefined) p[k] = String(a[k]).slice(0, 240); if (p.telegram) p.telegram = p.telegram.replace(/^@/, '');
      if (a.logo) p.logo = await resolveImage(a.logo, 300); shop.setProfile(p); if (a.applyToCurrent && shop.get().shop) shop.applyAdminToCurrent(); return {profile: {...shop.get().profile, logo: shop.get().profile.logo ? '(image)' : null}}; }
    case 'admin.wallets.list': return {wallets: shop.wallets().map(w => ({id: w.id, label: w.label, address: w.address, isDefault: w.isDefault}))};
    case 'admin.wallets.add': { const c = checkAddress(a.address || ''); if (!c.ok) throw new Error('EVM_ADDRESS_' + (c as any).reason.toUpperCase()); let b: number | null = null; try { b = await head(); } catch { /* offline */ }
      const w = shop.addWallet(a.label || '', c.address, b); if (a.isDefault) shop.patchWallet(w.id, {isDefault: true}); return {wallet: {id: w.id, label: w.label, address: w.address}, wallets: shop.wallets().length}; }
    case 'admin.wallets.patch': { const w = shop.wallets().find(x => x.id === a.id || x.label === a.label || x.address.toLowerCase() === String(a.address || '').toLowerCase()); if (!w) throw new Error('WALLET_NOT_FOUND'); const p: any = {}; if (a.newLabel) p.label = String(a.newLabel); if (a.isDefault) p.isDefault = true; shop.patchWallet(w.id, p); return {wallets: shop.wallets()}; }
    case 'admin.wallets.remove': { const w = shop.wallets().find(x => x.id === a.id || x.label === a.label || x.address.toLowerCase() === String(a.address || '').toLowerCase()); if (!w) throw new Error('WALLET_NOT_FOUND'); let b: number | null = null; try { b = await head(); } catch { /* */ } shop.removeWallet(w.id, b); return {removed: w.label, wallets: shop.wallets().length}; }
    case 'admin.apply': return {site: shop.applyAdminToCurrent().brand.name, applied: ['contacts', 'place', 'logo', 'defaultWallet']};
    case 'admin.accounting': {
      const addrs = shop.addresses(); if (!addrs.length) throw new Error('NO_WALLETS: admin.wallets.add first');
      const acct: any = (await kv.get('acct')) || {}; const h = await head(); const out: any[] = []; let total = 0n, bal = 0n;
      for (const {address, label} of addrs) {
        const cur = acct[address]; const inj = shop.get().receivers.filter(r => r.address === address && r.event === 'injected' && r.block).map(r => r.block!) ;
        const from = cur?.from ?? (inj.length ? Math.min(...inj) : await blockAt(Date.now() - 7 * 864e5, h));
        const r = await transfers(address, Math.max(from, (cur?.scannedTo ?? from - 1) + 1), h - 1, 25);
        const seen = new Set((cur?.list || []).map((t: any) => t.tx + ':' + t.log)); const list = [...(cur?.list || []), ...r.list.filter(t => !seen.has(t.tx + ':' + t.log)).map(t => ({...t, amount: t.amount.toString()}))];
        const b = await balance(address); acct[address] = {from, scannedTo: r.scannedTo, list, balance: b.toString(), at: Date.now()};
        const sum = list.reduce((x: bigint, t: any) => x + BigInt(t.amount), 0n); total += sum; bal += b;
        out.push({label, address, incoming: fmt(sum), count: list.length, balance: fmt(b), complete: r.scannedTo >= h - 1,
          payments: list.slice(-20).map((t: any) => ({tx: t.tx, from: t.from, amount: fmt6(BigInt(t.amount)), order: codeOf(BigInt(t.amount)) || null, block: t.block, handedOver: !!shop.get().fulfil[t.tx]?.done}))});
      }
      await kv.set('acct', acct); window.dispatchEvent(new CustomEvent('shop:acct'));
      if (a.show !== false) { window.dispatchEvent(new CustomEvent('shop:open')); ui({view: 'admin', admin: 'money'}); }
      return {totalIncoming: fmt(total) + ' USDC', onWalletsNow: fmt(bal) + ' USDC', wallets: out, note: 'Пришло — сумма входящих USDC с момента подключения адреса; баланс может быть меньше, если деньги выводились.'};
    }
    case 'admin.publish': {
      const s = shop.get().shop; if (!s) throw new Error('SHOP_NOT_STARTED');
      if (a.siteUrl !== undefined) { const u = String(a.siteUrl || '').replace(/\/+$/, ''); if (u && !/^https:\/\/[^\s"'<>]+$/.test(u)) throw new Error('SITE_URL_INVALID'); shop.set({siteUrl: u || undefined}); }
      if (a.show !== false) { (window as any).__shopUiPending = {view: 'admin', admin: 'ai'}; window.dispatchEvent(new CustomEvent('shop:open')); ui({view: 'admin', admin: 'ai'}); }
      const cur = shop.get().shop!;
      return {checks: aiChecks(cur), siteUrl: cur.siteUrl || null, files: {'products.json': a.full ? manifest(cur) : {items: manifest(cur).items.length, schema: 'nativeclouds.pricelist.v1'}, 'llms.txt': a.full ? llmsTxt(cur) : llmsTxt(cur).slice(0, 600)},
        next: ['shop.export {as:"site"} → выложить папку (Netlify Drop / Cloudflare Pages)', 'admin.publish {siteUrl:"https://…"} → затем снова shop.export {as:"site"}', 'ChatGPT Business Hub: https://chatgpt.com/business-hub (нужен сайт)', 'Google Merchant Center: https://merchants.google.com/']};
    }
    case 'admin.hash': {
      const mine = shop.addresses().map(x => x.address); const r: any = await lookupTx(a.tx || a.hash || '', mine);
      if (!r.found) return {found: false, reason: r.reason, hint: r.reason === 'FAILED' ? 'Транзакция не прошла — денег нет.' : 'Не найдена в Base: проверьте хеш и сеть или подождите.'};
      const cells = [shop.get().shop, ...shop.get().archive].filter(Boolean).flatMap(s => s!.sections.flatMap(x => x.cells.filter(c => c.price).map(c => ({site: s!.brand.name, title: c.title, price: c.price!}))));
      const toMe = r.toMe.map((t: any) => { const base = (t.amount / 10000n) * 10000n; return {wallet: shop.walletLabel(t.to) || shop.addresses().find(x => x.address === t.to)?.label, to: t.to, from: t.from, amount: fmt6(t.amount), order: codeOf(t.amount) || null,
        looksLike: cells.filter(c => { const u = BigInt(Math.round(Number(c.price) * 100)) * 10000n; return u === base || u === t.amount; }).slice(0, 4)}; });
      if (a.handedOver && toMe.length) shop.fulfil(r.tx, true);
      return {found: true, tx: r.tx, block: r.block, time: r.time ? new Date(r.time).toISOString() : null, confirmed: r.confirmed, confirmations: r.confirmations, toMe, otherTransfers: r.other.length, verdict: toMe.length ? 'Деньги пришли на ваш кошелёк.' : 'В этой транзакции нет USDC на ваши кошельки.'};
    }

  }
  throw new Error('COMMAND_NOT_INCLUDED');
}
