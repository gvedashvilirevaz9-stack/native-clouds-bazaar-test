// Agent-facing commands for the Inbox, notebook inbound buffer and calendar stamps.
// Exposed through window.workshop.execute (and the dock's Adapter / JSON panel).
import {intake, batches, ingest, ingestText, blobFromSource, readText, pageDataUrl, attachAgentResult, setAssetCategory, setAssetData, extractZip, select, selectBatch, lean, MAX_BATCH} from './store';
import {toBoard, toNotebook, toNotebookText, toEncyclopedia, toAgent, sendBatch} from './routes';
import {CATEGORIES, categoryById, type CategoryId} from './categories';
import {buildSummary, summaryMarkdown, summaryToBoard, summaryToNotebook} from './summary';
import {writeToNotebook, attachToNotebook} from '../garage/notebook-media';
import {stampTo} from '../garage/stamp';
import {garageView} from '../garage/view';
import {nativeRooms} from '../personal/native-clouds-state';

export const INTAKE_COMMANDS = [
  'intake.open', 'intake.list', 'intake.read', 'intake.page', 'intake.add', 'intake.attach', 'intake.category', 'intake.data', 'intake.route', 'intake.request', 'intake.reply', 'intake.extract', 'intake.remove',
  'intake.categories', 'intake.batches', 'intake.batch.create', 'intake.batch.add', 'intake.batch.read', 'intake.batch.send', 'intake.batch.summary', 'intake.batch.route',
  'garage.notebook.write', 'garage.notebook.attach', 'garage.stamp',
];

const needCat = (c: unknown): CategoryId => { if (!categoryById(String(c))) throw new Error('UNKNOWN_CATEGORY'); return c as CategoryId; };
const reveal = (s: string) => { try { nativeRooms.open('garage'); nativeRooms.revealService(s); } catch { /* ignore */ } };

export async function executeIntake(id: string, a: any = {}) {
  switch (id) {
    case 'intake.open': { reveal('inbox'); if (a.assetId) { select(a.assetId); selectBatch(null); } if (a.batchId) selectBatch(a.batchId); return {service: 'inbox', assetId: a.assetId || null, batchId: a.batchId || null}; }
    case 'intake.list': {
      let list = intake.list();
      if (a.status) list = list.filter(x => x.status === a.status);
      if (a.category) list = list.filter(x => x.category === a.category);
      if (a.pendingAgent) list = list.filter(x => x.agent?.state === 'pending' || x.status === 'needs-agent');
      return {count: list.length, assets: list.slice(0, Math.min(100, a.limit || 40)).map(lean)};
    }
    case 'intake.read': {
      const x = intake.get(a.assetId); if (!x) throw new Error('ASSET_NOT_FOUND');
      const cat = categoryById(x.category);
      const text = a.text === false ? null : (await readText(x)).slice(0, Math.min(Number(a.maxChars) || 20000, 60000));
      return {...lean(x), text, data: x.data || null, category: cat ? {id: cat.id, prompt: cat.prompt, schema: cat.schema} : null,
        hint: x.status === 'needs-agent' ? 'Convert the original (intake.page n=0 returns it) and call intake.attach with page images and/or text.' : 'Use intake.page {assetId, n} to see a page image.'};
    }
    case 'intake.page': {
      // n=0 → the original file (for outside conversion); n≥1 → the WebP page the room shows.
      const x = intake.get(a.assetId); if (!x) throw new Error('ASSET_NOT_FOUND');
      const n = Math.floor(Number(a.n ?? 1));
      const ref = n === 0 ? x.origRef : x.pages.find(p => p.n === n)?.ref;
      if (!ref) throw new Error('PAGE_NOT_FOUND');
      const url = await pageDataUrl(ref); if (!url) throw new Error('BLOB_MISSING');
      if (url.length > 25_000_000) throw new Error('TOO_LARGE_FOR_TRANSPORT');
      return {assetId: x.id, n, dataUrl: url};
    }
    case 'intake.add': {
      // The agent brings a file in: data: URL, https URL, or plain text.
      let asset;
      if (a.text && !a.dataUrl && !a.url) asset = await ingestText(String(a.text).slice(0, 200000), {name: a.name, by: 'agent', source: a.source || 'agent'});
      else asset = await ingest(await blobFromSource(String(a.dataUrl || a.url || '')), {name: a.name || 'agent-file', by: 'agent', source: a.source || 'agent', batchId: a.batchId || null, category: a.category ? needCat(a.category) : undefined, select: a.select !== false});
      if (a.open) reveal('inbox');
      return lean(asset);
    }
    case 'intake.attach': {
      const r = await attachAgentResult(a.assetId, {pages: Array.isArray(a.pages) ? a.pages : [], text: a.text, meta: a.meta, note: a.note, status: a.status});
      return lean(r);
    }
    case 'intake.category': return lean(setAssetCategory(a.assetId, needCat(a.category)));
    case 'intake.data': {
      const x = setAssetData(a.assetId, a.data ?? null);
      if (a.reply) intake.patch(x.id, {agent: {...(x.agent || {request: '', at: Date.now()}), state: 'done', reply: String(a.reply).slice(0, 2000)}});
      return {assetId: x.id, hasData: !!x.data, batchId: x.batchId || null};
    }
    case 'intake.route': {
      const to = String(a.to);
      if (to === 'board') return toBoard(a.assetId, {pages: a.pages, by: 'agent', open: a.open !== false});
      if (to === 'notebook') return toNotebook(a.assetId, {pages: a.pages, by: 'agent', open: a.open !== false});
      if (to === 'notebook-text') return toNotebookText(a.assetId, {by: 'agent', open: a.open !== false});
      if (to === 'encyclopedia') return toEncyclopedia(a.assetId, a.question);
      throw new Error('UNKNOWN_DESTINATION');
    }
    case 'intake.request': return toAgent(a.assetId, a.text || '');
    case 'intake.reply': {
      const x = intake.get(a.assetId); if (!x) throw new Error('ASSET_NOT_FOUND');
      return lean(intake.patch(x.id, {agent: {request: x.agent?.request || '', at: x.agent?.at || Date.now(), state: a.state === 'working' ? 'working' : 'done', reply: String(a.text || '').slice(0, 2000)}}));
    }
    case 'intake.extract': return {assetIds: await extractZip(a.assetId, Math.min(MAX_BATCH, a.limit || MAX_BATCH))};
    case 'intake.remove': return intake.remove(a.assetId);

    case 'intake.categories': return {categories: CATEGORIES.map(c => ({id: c.id, ru: c.ru, en: c.en, prompt: c.prompt, batchPrompt: c.batchPrompt, schema: c.schema, output: c.output}))};
    case 'intake.batches': return {batches: batches.list().map(b => ({...b, files: b.assetIds.length, withData: b.assetIds.filter(id => intake.get(id)?.data).length}))};
    case 'intake.batch.create': { const b = batches.create({title: a.title, category: a.category ? needCat(a.category) : undefined, assetIds: a.assetIds || []}); if (a.open !== false) { reveal('inbox'); selectBatch(b.id); } return b; }
    case 'intake.batch.add': return batches.add(a.batchId, a.assetIds || []);
    case 'intake.batch.read': {
      const b = batches.get(a.batchId); if (!b) throw new Error('BATCH_NOT_FOUND');
      const cat = categoryById(b.category)!;
      return {batch: b, category: {id: cat.id, prompt: cat.prompt, batchPrompt: cat.batchPrompt, schema: cat.schema, output: cat.output},
        assets: b.assetIds.map(id => intake.get(id)).filter(Boolean).map(x => ({...lean(x!), data: x!.data || null})),
        steps: ['For each asset: intake.read (+ intake.page to see the image)', 'intake.data {assetId, data} shaped by category.schema', 'intake.batch.summary {batchId, notes?}', 'Optionally intake.batch.route {batchId, to:"board"|"notebook"}']};
    }
    case 'intake.batch.send': return sendBatch(a.batchId, a.text || '');
    case 'intake.batch.summary': {
      const b = batches.get(a.batchId); if (!b) throw new Error('BATCH_NOT_FOUND');
      batches.patch(b.id, {state: 'done', summary: {at: Date.now(), notes: a.notes ? String(a.notes).slice(0, 2000) : b.summary?.notes, by: a.notes ? 'agent' : 'portal'}});
      const s = buildSummary(b.id);
      if (a.open !== false) { reveal('inbox'); selectBatch(b.id); }
      return {batchId: b.id, summary: s, markdown: summaryMarkdown(batches.get(b.id)!, s)};
    }
    case 'intake.batch.route': {
      if (a.to === 'board') return summaryToBoard(a.batchId, 'agent', a.open !== false);
      if (a.to === 'notebook') { const r = summaryToNotebook(a.batchId); if (a.open !== false) { reveal('notebook'); garageView.set({tab: 'notebook'}); } return r; }
      throw new Error('UNKNOWN_DESTINATION');
    }

    case 'garage.notebook.write': {
      const r = writeToNotebook(String(a.text || ''), {mode: a.mode, date: a.date, heading: a.heading});
      if (a.open !== false) { reveal('notebook'); garageView.set({tab: 'notebook'}); }
      return r;
    }
    case 'garage.notebook.attach': {
      let r;
      if (a.assetId) r = toNotebook(a.assetId, {pages: a.pages, by: 'agent', open: false});
      else {
        const src = String(a.dataUrl || a.url || a.image || '');
        const asset = await ingest(await blobFromSource(src), {name: a.title || 'image', by: 'agent', source: 'agent', select: false});
        r = asset.pages.length ? toNotebook(asset.id, {pages: [1], by: 'agent', open: false}) : attachToNotebook({kind: 'image', ref: null, title: a.title || 'image', url: src.startsWith('http') ? src : null, by: 'agent'});
      }
      if (a.open !== false) { reveal('notebook'); garageView.set({tab: 'notebook'}); }
      return r;
    }
    case 'garage.stamp': {
      const r = await stampTo(a.to === 'board' ? 'board' : 'notebook', {date: a.date, caption: a.caption, lang: a.lang, by: 'agent'});
      if (a.open !== false) { reveal(a.to === 'board' ? 'sketchbook' : 'notebook'); garageView.set({tab: a.to === 'board' ? 'board' : 'notebook'}); }
      return r;
    }
  }
  throw new Error('COMMAND_NOT_INCLUDED');
}
