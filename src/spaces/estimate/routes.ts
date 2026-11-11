// Estimate outputs: board card, notebook text, Markdown/CSV, and the agent hand-off.
import {estimates, totals, lineTotal, money, TEMPLATES, type Estimate, type EstItem} from './store';
import {putBlob, getBlob, garage} from '../garage/store';
import {htmlPage} from '../intake/convert';
import {boardSpot, focusBoard} from '../intake/routes';
import {writeToNotebook} from '../garage/notebook-media';
import {communication} from '../communication/store';
import {nativeRooms} from '../personal/native-clouds-state';
import {garageView} from '../garage/view';

const esc = (s: unknown) => String(s ?? '').replace(/[&<>"]/g, c => ({'&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;'}[c]!));
const need = (id: string) => { const e = estimates.get(id); if (!e) throw new Error('ESTIMATE_NOT_FOUND'); return e; };
const qtyText = (i: EstItem) => `${+i.qty.toFixed(3)} ${i.unit}`;
const coverText = (i: EstItem) => i.covers ? `${+i.covers.value.toFixed(2)} ${i.covers.unit}` : '';

/** data: images are moved into IndexedDB so the estimate stays small in localStorage. */
export async function storeItemImage(src?: string | null) {
  if (!src) return null;
  if (/^data:image\//.test(src)) return putBlob(await (await fetch(src)).blob());
  return src;
}
async function imgData(ref?: string | null) {
  if (!ref) return null;
  if (ref.startsWith('idb:')) { const b = await getBlob(ref); if (!b) return null; return new Promise<string>(r => { const f = new FileReader(); f.onload = () => r(String(f.result)); f.readAsDataURL(b); }); }
  return ref.startsWith('data:') ? ref : null;   // remote images can't be painted into a canvas
}

export function estimateMarkdown(e: Estimate) {
  const t = totals(e); const out = [`# ${e.title}`, ''];
  if (e.target) out.push(`${e.target.label}: ${e.target.value} ${e.target.unit}`, '');
  out.push(`| Группа | Позиция | Кол-во | Цена | Сумма | Хватит на | Основание |`, '| --- | --- | --- | --- | --- | --- | --- |');
  for (const i of e.items) out.push(`| ${i.group || ''} | ${i.name}${i.status === 'have' ? ' (есть)' : ''} | ${qtyText(i)} | ${money(i.unitPrice, e.currency)} | ${money(lineTotal(i), e.currency)} | ${coverText(i)} | ${i.basis || ''} |`);
  out.push('', `**Итого: ${money(t.sum, e.currency)}**`);
  if (t.bottleneck) out.push(`Узкое место: ${t.bottleneck.name}: ${coverText(t.bottleneck)}`);
  if (t.weakest) out.push(`Закончится первым: ${t.weakest.name}: ${coverText(t.weakest)}`);
  if (e.assumptions.length) out.push('', '## Допущения', ...e.assumptions.map(a => '- ' + a));
  if (e.notes) out.push('', e.notes);
  return out.join('\n') + '\n';
}
export function estimateText(e: Estimate) {
  const t = totals(e); const out = [`${TEMPLATES[e.template].icon} ${e.title}`];
  if (e.target) out.push(`${e.target.label}: ${e.target.value} ${e.target.unit}`);
  let g = '';
  for (const i of e.items) {
    if ((i.group || '') !== g) { g = i.group || ''; if (g) out.push('', g + ':'); }
    out.push(`  • ${i.name} — ${qtyText(i)} — ${i.status === 'have' ? 'есть' : money(lineTotal(i), e.currency)}${i.covers ? ' — хватит на ' + coverText(i) : ''}`);
  }
  out.push('', `ИТОГО: ${money(t.sum, e.currency)}`);
  if (t.weakest) out.push(`Закончится первым: ${t.weakest.name} (${coverText(t.weakest)})`);
  if (e.assumptions.length) out.push('', 'Допущения:', ...e.assumptions.map(a => '  – ' + a));
  return out.join('\n');
}
export function estimateCsv(e: Estimate) {
  const q = (v: unknown) => '"' + String(v ?? '').replace(/"/g, '""') + '"';
  return ['group,name,qty,unit,unit_price,total,currency,covers,covers_unit,status,shop,url,basis',
    ...e.items.map(i => [i.group, i.name, i.qty, i.unit, i.unitPrice, lineTotal(i), e.currency, i.covers?.value ?? '', i.covers?.unit ?? '', i.status, i.shop, i.url, i.basis].map(q).join(','))].join('\n');
}

export async function estimateHtml(e: Estimate) {
  const t = totals(e); const tpl = TEMPLATES[e.template];
  const rows: string[] = [];
  for (const i of e.items.slice(0, 22)) {
    const img = await imgData(i.image);
    rows.push(`<tr><td style="width:46px">${img ? `<img src="${img}" style="width:42px;height:42px;object-fit:cover;border-radius:6px">` : ''}</td><td><b>${esc(i.name)}</b>${i.group ? `<div style="font-size:11px;color:#889">${esc(i.group)}</div>` : ''}</td><td>${esc(qtyText(i))}</td><td style="text-align:right">${i.status === 'have' ? '<i>есть</i>' : esc(money(lineTotal(i), e.currency))}</td><td>${esc(coverText(i))}</td></tr>`);
  }
  return `<div style="font-family:system-ui,sans-serif"><div style="color:#8a8fa3;font-size:14px">${esc(tpl.icon + ' ' + tpl.ru)}${e.target ? ' · ' + esc(`${e.target.label}: ${e.target.value} ${e.target.unit}`) : ''}</div>
  <h1 style="font-size:30px;margin:.25em 0 .5em">${esc(e.title)}</h1>
  <div style="display:flex;gap:12px;margin-bottom:14px"><div style="background:#eef1fa;border-radius:12px;padding:10px 16px"><div style="font-size:12px;color:#667">Итого</div><div style="font-size:28px;font-weight:650">${esc(money(t.sum, e.currency))}</div></div>
  ${t.weakest || t.bottleneck ? `<div style="background:#fbefd6;border-radius:12px;padding:10px 16px"><div style="font-size:12px;color:#7c5512">${t.bottleneck ? 'Узкое место' : 'Закончится первым'}</div><div style="font-size:18px;font-weight:600">${esc((t.bottleneck || t.weakest)!.name)} · ${esc(coverText((t.bottleneck || t.weakest)!))}</div></div>` : ''}</div>
  <table><tr><th></th><th>Позиция</th><th>Кол-во</th><th>Сумма</th><th>Хватит на</th></tr>${rows.join('')}</table>
  ${e.assumptions.length ? `<p style="font-size:12px;color:#556;margin-top:12px">${e.assumptions.map(esc).join(' · ')}</p>` : ''}</div>`;
}

export async function estimateToBoard(id: string, by: 'human' | 'agent' = 'human', open = true) {
  const e = need(id);
  const page = await htmlPage(await estimateHtml(e), 'estimate');
  const ref = await putBlob(page.blob);
  const at = await boardSpot(open);
  if (at) focusBoard(at.x + 120, at.y + 150);
  const it = garage.add({kind: 'polaroid', title: e.title, image: ref, source: 'Estimate · ' + TEMPLATES[e.template].en, by, ...(at || {})} as any);
  return {estimateId: id, itemId: it.id};
}
export function estimateToNotebook(id: string, open = true) {
  const r = writeToNotebook(estimateText(need(id)), {mode: 'new-leaf'});
  if (open) { try { nativeRooms.open('garage'); nativeRooms.revealService('notebook'); } catch { /* ignore */ } garageView.set({tab: 'notebook'}); }
  return r;
}
/** "Recalculate with the agent": the person changed something or asks a question. */
export function estimateRequest(id: string, text: string) {
  const e = need(id);
  const req = text.trim() || (e.items.some(i => i.edited) ? 'I changed quantities; please recheck totals, packs and coverage.' : TEMPLATES[e.template].prompt);
  estimates.patch(id, {status: 'with-agent', request: req.slice(0, 1200)});
  try { communication.add({text: `Σ ${e.title}\n${req.slice(0, 600)}\n[estimate.read {estimateId:"${e.id}"}]`, role: 'user', contact: 'agent', source: 'Estimate', kind: 'info', key: 'estimate/' + e.id + '/' + Date.now()} as any); } catch { /* dock optional */ }
  return {estimateId: id, state: 'with-agent'};
}
