// Calendar stamp: a tear-off calendar leaf that marks "this was done on that day".
// On the board it is an image (so it survives export to PDF/JPG); in the notebook a stamp chip.
import {garage, putBlob} from './store';
import {attachToNotebook} from './notebook-media';
import {todayISO} from './pages';
import {garageView} from './view';

export async function stampImage(iso: string, lang = 'ru', caption = '') {
  const d = new Date(iso + 'T12:00:00'); if (isNaN(+d)) throw new Error('INVALID_DATE');
  const loc = lang === 'ru' ? 'ru-RU' : 'en-GB';
  // 5:4, the polaroid's photo ratio, so nothing is cropped on the board.
  const W = 600, H = 480;
  const c = document.createElement('canvas'); c.width = W; c.height = H; const x = c.getContext('2d')!;
  x.fillStyle = '#fffdf8'; x.fillRect(0, 0, W, H);
  x.fillStyle = '#c8433a'; x.fillRect(0, 0, W, 96);
  for (const rx of [150, 450]) { x.fillStyle = '#ffffffcc'; x.beginPath(); x.arc(rx, 22, 9, 0, Math.PI * 2); x.fill(); }
  x.textAlign = 'center'; x.fillStyle = '#fff'; x.font = '600 40px system-ui, sans-serif';
  x.fillText(d.toLocaleDateString(loc, {month: 'long', year: 'numeric'}).toUpperCase(), W / 2, 74);
  x.fillStyle = '#1f2433'; x.font = '700 190px Georgia, serif'; x.fillText(String(d.getDate()), W / 2, caption ? 290 : 315);
  x.fillStyle = '#5a6074'; x.font = '500 36px system-ui, sans-serif';
  x.fillText(d.toLocaleDateString(loc, {weekday: 'long'}), W / 2, caption ? 350 : 390);
  if (caption) { x.font = 'italic 34px Georgia, serif'; x.fillStyle = '#7c5512'; x.fillText(caption.slice(0, 30), W / 2, 420); }
  x.strokeStyle = '#e6dcc8'; x.lineWidth = 6; x.strokeRect(3, 3, W - 6, H - 6);
  const blob: Blob = await new Promise((res, rej) => c.toBlob(b => b ? res(b) : rej(new Error('ENCODE_FAILED')), 'image/png'));
  return blob;
}

export async function stampTo(to: 'board' | 'notebook', opts: {date?: string; caption?: string; lang?: string; by?: 'human' | 'agent'} = {}) {
  const date = (opts.date || garageView.get().selectedDate || todayISO()).slice(0, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) throw new Error('INVALID_DATE');
  const caption = (opts.caption || '').slice(0, 60);
  if (to === 'notebook') return {to, date, ...attachToNotebook({kind: 'stamp', stamp: date, title: '📅 ' + date, caption, by: opts.by || 'human'})};
  const ref = await putBlob(await stampImage(date, opts.lang || (document.documentElement.lang || 'ru').slice(0, 2), caption));
  const {boardSpot, focusBoard} = await import('../intake/routes');
  const at = await boardSpot(true);
  if (at) focusBoard(at.x + 120, at.y + 150);
  const it = garage.add({...(at || {}), kind: 'polaroid', title: '📅 ' + date + (caption ? ' · ' + caption : ''), image: ref, source: 'Calendar', by: opts.by || 'human'} as any);
  garageView.set({tab: 'board'});
  return {to, date, itemId: it.id};
}
