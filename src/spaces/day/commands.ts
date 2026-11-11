// Agent commands for the day plan.
import {day, gatherDay, estimateToDay, today} from './store';
import {dayPdf, dayPdfName} from './pdf';
import {DAY_PROMPT} from './DayPane';
import {downloadBlob} from '../billing/share';
import {ingest} from '../intake/store';
import {nativeRooms} from '../personal/native-clouds-state';

export const DAY_COMMANDS = ['day.list', 'day.add', 'day.patch', 'day.done', 'day.remove', 'day.clear', 'day.gather', 'day.from_estimate', 'day.export', 'day.open', 'day.prompt'];
const show = () => { try { nativeRooms.open('garage'); nativeRooms.select('day'); } catch { /* */ } };
const toDataUrl = (b: Blob) => new Promise<string>(r => { const f = new FileReader(); f.onload = () => r(String(f.result)); f.readAsDataURL(b); });

export async function executeDay(id: string, a: any = {}) {
  switch (id) {
    case 'day.list': return {date: a.date || day.date(), forWhom: a.forWhom ?? null, entries: day.list(a.date || day.date(), a.forWhom ?? null), people: day.people()};
    case 'day.add': { const list = Array.isArray(a.entries) ? a.entries : [a.entry || a]; const added = day.add(list, 'agent'); if (a.open !== false) { show(); day.view({date: added[0]?.date || day.date(), ...(a.forWhom ? {forWhom: a.forWhom} : {})}); } return {added: added.map(e => e.id), date: day.date()}; }
    case 'day.patch': { const p = {...a}; delete p.entryId; return day.patch(a.entryId, p); }
    case 'day.done': return day.patch(a.entryId, {done: a.done !== false});
    case 'day.remove': return day.remove(a.entryId);
    case 'day.clear': day.clear(a.date); return {cleared: a.date || 'all'};
    case 'day.gather': { const r = gatherDay(a.days || 7, a.from || today()); if (a.open !== false) show(); return r; }
    case 'day.from_estimate': return estimateToDay(a.estimateId, a.days || 7, a.from || today());
    case 'day.export': {
      const date = a.date || day.date(); const who = a.forWhom ?? null; const blob = await dayPdf(date, who); const name = dayPdfName(date, who);
      if (a.as === 'download') { downloadBlob(blob, name); return {downloaded: name}; }
      if (a.as === 'inbox') { const asset = await ingest(blob, {name, by: 'agent', source: 'Day'}); return {assetId: asset.id, name}; }
      return {name, size: blob.size, dataUrl: await toDataUrl(blob)};
    }
    case 'day.open': show(); day.view({date: a.date || today(), ...(a.forWhom !== undefined ? {forWhom: a.forWhom} : {})}); return {opened: day.date()};
    case 'day.prompt': return {prompt: DAY_PROMPT.replace('{date}', a.date || day.date()).replace('{for}', a.forWhom ? ' for ' + a.forWhom : '')};
  }
  throw new Error('COMMAND_NOT_INCLUDED');
}
