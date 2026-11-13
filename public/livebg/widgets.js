// Native Clouds · desktop widgets delivered by Live Background couriers.
// A courier (airship / balloon / eagle) drops a widget; the widget falls to its spot and stays.
// Places: 3 rows × 5 — eagle drops in the sky row, balloon in the mountain row, airship in the lower row.
// No frame and no background at rest; on hover a glass frame appears — drag it, or close it with ×.
//
//   import { attachWidgets } from '/livebg/widgets.js'
//   const w = attachWidgets(bg)              // bg = createLiveBG(...)
//   bg.deliver('clock', { by: 'airship', size: 'M' })
//   bg.deliver('weather', { by: 'balloon', size: 'L', at: [0.3, 0.4] })
//   bg.deliver('agent', { by: 'eagle', data: { q: 'курс биткоина' } })   // any Agent Marketplace answer

import { fetchWeather, WIDGET_SCALE } from './livebg.js';

const CSS = `
.lw-layer{position:fixed;inset:0;pointer-events:none;z-index:5}
.lw{position:absolute;transform:translate(-50%,-50%);pointer-events:auto;user-select:none;-webkit-user-select:none;
  padding:calc(14px*var(--s)) calc(20px*var(--s));border-radius:18px;border:1px solid transparent;color:#fff;
  font-family:Inter,system-ui,-apple-system,sans-serif;text-shadow:0 0 22px rgba(8,18,36,.55),0 0 6px rgba(8,18,36,.45),0 1px 2px rgba(8,18,36,.5);
  transition:background .2s,border-color .2s,box-shadow .2s,backdrop-filter .2s;cursor:default;min-width:max-content}
.lw:hover,.lw.drag{background:rgba(255,255,255,.18);border-color:rgba(255,255,255,.55);box-shadow:0 12px 36px rgba(32,57,79,.18);
  backdrop-filter:blur(16px);-webkit-backdrop-filter:blur(16px);cursor:grab}
.lw.drag{cursor:grabbing}
.lw-bar{position:absolute;left:0;right:0;top:-1px;height:22px;display:flex;justify-content:space-between;align-items:center;padding:0 8px;opacity:0;transition:opacity .2s}
.lw:hover .lw-bar,.lw.drag .lw-bar{opacity:1}
.lw-grip{font-size:12px;letter-spacing:2px;opacity:.8}
.lw-x{all:unset;cursor:pointer;width:18px;height:18px;border-radius:6px;text-align:center;line-height:18px;font-size:14px;text-shadow:none;background:rgba(255,255,255,.25)}
.lw-x:hover{background:rgba(255,255,255,.45)}
.lw-time{font-weight:400;font-size:calc(64px*var(--s));line-height:1;letter-spacing:-.02em;font-variant-numeric:tabular-nums}
.lw-time small{font-size:.38em;opacity:.8;margin-left:.15em;font-weight:400}
.lw-date{font-size:calc(15px*var(--s));opacity:.92;margin-top:calc(6px*var(--s));text-transform:capitalize}
.lw-wx{display:flex;align-items:center;gap:calc(14px*var(--s))}
.lw-ico{font-size:calc(46px*var(--s));line-height:1;filter:drop-shadow(0 2px 8px rgba(10,20,40,.3))}
.lw-temp{font-weight:400;font-size:calc(56px*var(--s));line-height:1}
.lw-desc{font-size:calc(15px*var(--s));opacity:.92;margin-top:calc(4px*var(--s))}
.lw-kick{font-size:calc(11px*var(--s));letter-spacing:.08em;text-transform:uppercase;opacity:.85}
.lw-title{font-size:calc(15px*var(--s));font-weight:600;margin-top:calc(2px*var(--s))}
.lw-big{font-weight:400;font-size:calc(52px*var(--s));line-height:1.05;margin-top:calc(6px*var(--s));font-variant-numeric:tabular-nums}
.lw-sub{font-size:calc(14px*var(--s));opacity:.92;margin-top:calc(4px*var(--s))}
.lw-sub.bad{color:#ffd0d0}.lw-sub.good{color:#d6ffd9}
.lw-stats{display:flex;gap:calc(16px*var(--s));margin-top:calc(8px*var(--s));font-size:calc(12px*var(--s))}
.lw-stats span{display:flex;flex-direction:column;opacity:.9}.lw-stats b{font-size:calc(14px*var(--s));font-weight:600}
.lw-foot{font-size:calc(11px*var(--s));opacity:.7;margin-top:calc(8px*var(--s))}
`;

const WX = { 0: ['☀️', 'ясно'], 1: ['🌤️', 'почти ясно'], 2: ['⛅', 'переменная облачность'], 3: ['☁️', 'пасмурно'], 45: ['🌫️', 'туман'], 48: ['🌫️', 'туман'],
  51: ['🌦️', 'морось'], 53: ['🌦️', 'морось'], 55: ['🌦️', 'морось'], 61: ['🌧️', 'дождь'], 63: ['🌧️', 'дождь'], 65: ['🌧️', 'ливень'],
  71: ['🌨️', 'снег'], 73: ['🌨️', 'снег'], 75: ['❄️', 'снегопад'], 80: ['🌦️', 'ливень'], 81: ['🌧️', 'ливень'], 82: ['🌧️', 'ливень'], 95: ['⛈️', 'гроза'], 96: ['⛈️', 'гроза'], 99: ['⛈️', 'гроза'] };

// Drop grid: 3 rows (by courier) × 5 places. Eagle drops in the sky, balloon at the mountains, airship lower.
export const ROWS = { eagle: 0.27, balloon: 0.45, airship: 0.64 };
export const COLS = [0.22, 0.36, 0.5, 0.64, 0.78];
const ORDER = [2, 3, 1, 4, 0]; // centre first, then alternating outwards; the clock always takes the centre
const KEY = 'lw.widgets.v2';
const save = (list) => { try { localStorage.setItem(KEY, JSON.stringify(list)); } catch { /* storage may be unavailable */ } };
const load = () => { try { return JSON.parse(localStorage.getItem(KEY) || '[]'); } catch { return []; } };

export function attachWidgets(bg, root = document.body) {
  if (!document.getElementById('lw-css')) { const st = document.createElement('style'); st.id = 'lw-css'; st.textContent = CSS; document.head.append(st); }
  const layer = document.createElement('div'); layer.className = 'lw-layer'; root.append(layer);
  const items = new Map();
  const slots = new Map(); // 'row:col' -> widget id (or 'pending')
  let seq = 1;

  const KINDS = {
    clock(el) {
      el.innerHTML = '<div class="lw-time"></div><div class="lw-date"></div>';
      const t = el.querySelector('.lw-time'), d = el.querySelector('.lw-date');
      const tick = () => {
        const n = new Date();
        t.innerHTML = `${String(n.getHours()).padStart(2, '0')}:${String(n.getMinutes()).padStart(2, '0')}<small>${String(n.getSeconds()).padStart(2, '0')}</small>`;
        d.textContent = n.toLocaleDateString('ru-RU', { weekday: 'long', day: 'numeric', month: 'long' });
      };
      tick(); const iv = setInterval(tick, 1000); return () => clearInterval(iv);
    },
    // any Agent Marketplace answer: data = { q: 'курс биткоина' } or { service: 'fx', params: {...} }
    agent(el, data = {}) {
      el.innerHTML = '<div class="lw-kick">агент</div><div class="lw-big">…</div><div class="lw-sub">спрашиваю</div>';
      const esc = (v) => String(v ?? '').replace(/[&<>"]/g, (ch) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[ch]));
      const url = data.service
        ? '/api/money?' + new URLSearchParams({ service: data.service, ...(data.params || {}) })
        : '/api/money?q=' + encodeURIComponent(String(data.q || '').slice(0, 200));
      const upd = async () => {
        try {
          const r = await (await fetch(url)).json(), it = (r.items || [])[0];
          if (!it) { el.innerHTML = `<div class="lw-title">${esc(r.question || 'Уточните вопрос')}</div>`; return; }
          const c = it.card || {}, t = c.type || 'text';
          let big = '', sub = '', tone = '', stats = c.stats || [];
          if (!it.ok || t === 'error') { big = '—'; sub = c.message || it.summary; }
          else if (t === 'weather' && c.now) { const [i, txt] = WX[c.now.code] || ['🌡️', c.now.label]; big = `${i} ${Math.round(c.now.tempC)}°`; sub = c.now.label || txt; stats = []; }
          else if (t === 'gauge') { big = String(c.value); sub = c.label; }
          else if (c.headline) big = c.headline;
          else if ((c.items || [])[0]?.value) { const x = c.items[0]; big = x.value; sub = [x.title, x.sub].filter(Boolean).join(' · '); tone = x.tone || ''; stats = []; }
          else { big = ''; sub = it.summary; }
          stats = stats.filter((x) => !/источник|данные на|source/i.test(x.label)).slice(0, 3);
          const time = new Date(it.fetchedAt || Date.now()).toLocaleTimeString('ru', { hour: '2-digit', minute: '2-digit' });
          el.innerHTML = `<div class="lw-kick">${esc(c.kicker || it.serviceId)}</div><div class="lw-title">${esc(c.title || it.title)}</div>`
            + (big ? `<div class="lw-big">${esc(big)}</div>` : '') + (sub ? `<div class="lw-sub ${tone}">${esc(sub)}</div>` : '')
            + (stats.length ? `<div class="lw-stats">${stats.map((x) => `<span>${esc(x.label)}<b>${esc(x.value)}</b></span>`).join('')}</div>` : '')
            + `<div class="lw-foot">${esc((it.sources || []).filter((x) => x.ok).map((x) => x.name).slice(0, 2).join(' · '))} · ${time}</div>`;
        } catch { el.querySelector('.lw-sub') && (el.querySelector('.lw-sub').textContent = 'агент недоступен'); }
      };
      upd(); const iv = setInterval(upd, (data.every || 5) * 60e3); return () => clearInterval(iv);
    },
    weather(el) {
      el.innerHTML = '<div class="lw-wx"><div class="lw-ico">⛅</div><div><div class="lw-temp">…</div><div class="lw-desc">загружаю погоду</div></div></div>';
      const ico = el.querySelector('.lw-ico'), tmp = el.querySelector('.lw-temp'), desc = el.querySelector('.lw-desc');
      const upd = async () => {
        const loc = bg.getWeather().location;
        try {
          const w = await fetchWeather(loc.lat, loc.lon), [i, txt] = WX[w.code] || ['🌡️', 'погода'];
          ico.textContent = i; tmp.textContent = `${Math.round(w.temp)}°`; desc.textContent = `${loc.name} · ${txt}`;
        } catch { desc.textContent = 'погода недоступна'; }
      };
      upd(); const iv = setInterval(upd, 15 * 60e3); return () => clearInterval(iv);
    },
  };

  function create(rec, from) {
    const kind = KINDS[rec.kind]; if (!kind) return null;
    const el = document.createElement('div'); el.className = 'lw'; el.dataset.kind = rec.kind;
    el.style.setProperty('--s', WIDGET_SCALE[rec.size] || 1);
    el.style.left = rec.x * innerWidth + 'px'; el.style.top = rec.y * innerHeight + 'px';
    const body = document.createElement('div'); const stop = kind(body, rec.data || {});
    const bar = document.createElement('div'); bar.className = 'lw-bar'; bar.innerHTML = '<span class="lw-grip">⠿</span><button class="lw-x" title="Убрать">×</button>';
    el.append(bar, body); layer.append(el);
    const id = rec.id || seq++; rec.id = id; items.set(id, { el, rec, stop, born: Date.now() });
    if (rec.row && rec.col != null) slots.set(rec.row + ':' + rec.col, id);
    bar.querySelector('.lw-x').onclick = (e) => { e.stopPropagation(); remove(id); };
    drag(el, rec);
    if (from) {
      // falls from the courier to its spot with a light sway
      const dx = from[0] - rec.x * innerWidth, dy = from[1] - rec.y * innerHeight;
      el.animate([
        { transform: `translate(calc(-50% + ${dx}px), calc(-50% + ${dy}px)) scale(.25) rotate(-10deg)`, opacity: 0.4 },
        { transform: `translate(calc(-50% + ${dx * 0.4}px), calc(-50% + ${dy * 0.35}px)) scale(.7) rotate(6deg)`, opacity: 1, offset: 0.55 },
        { transform: 'translate(-50%, -50%) scale(1.04) rotate(-2deg)', offset: 0.85 },
        { transform: 'translate(-50%, -50%) scale(1) rotate(0)' },
      ], { duration: 1300, easing: 'cubic-bezier(.35,.1,.3,1)' });
    }
    persist(); return id;
  }
  function drag(el, rec) {
    el.addEventListener('pointerdown', (e) => {
      if (e.target.closest('.lw-x') || e.button !== 0) return;
      const sx = e.clientX, sy = e.clientY, x0 = parseFloat(el.style.left), y0 = parseFloat(el.style.top);
      el.setPointerCapture(e.pointerId); el.classList.add('drag');
      const mv = (ev) => { el.style.left = x0 + ev.clientX - sx + 'px'; el.style.top = y0 + ev.clientY - sy + 'px'; };
      const up = (ev) => { el.classList.remove('drag'); el.removeEventListener('pointermove', mv); el.removeEventListener('pointerup', up);
        rec.x = parseFloat(el.style.left) / innerWidth; rec.y = parseFloat(el.style.top) / innerHeight;
        // moved by hand: it no longer holds its drop place
        if (Math.hypot(ev.clientX - sx, ev.clientY - sy) > 12 && rec.row) { free(rec.row, rec.col, rec.id); rec.row = null; rec.col = null; }
        persist(); };
      el.addEventListener('pointermove', mv); el.addEventListener('pointerup', up);
    });
  }
  function remove(id) { const it = items.get(id); if (!it) return; it.stop?.(); it.el.remove(); items.delete(id); if (it.rec.row) free(it.rec.row, it.rec.col, id); persist(); }
  function free(row, col, id) { const k = row + ':' + col; if (slots.get(k) === id) slots.delete(k); }
  function moveTo(id, row, col) {
    const it = items.get(id); if (!it) return; free(it.rec.row, it.rec.col, id);
    it.rec.row = row; it.rec.col = col; it.rec.x = COLS[col]; it.rec.y = ROWS[row]; slots.set(row + ':' + col, id);
    it.el.animate([{ left: it.el.style.left, top: it.el.style.top }, { left: COLS[col] * innerWidth + 'px', top: ROWS[row] * innerHeight + 'px' }], { duration: 600, easing: 'ease-in-out' });
    it.el.style.left = COLS[col] * innerWidth + 'px'; it.el.style.top = ROWS[row] * innerHeight + 'px';
  }
  function persist() { save([...items.values()].map(({ rec }) => ({ kind: rec.kind, data: rec.data || null, size: rec.size, x: rec.x, y: rec.y, row: rec.row || null, col: rec.col ?? null }))); }

  // restore widgets the person kept from last time (no courier needed)
  for (const r of load()) create({ ...r });

  const keyOf = (k, dt) => k + '|' + JSON.stringify(dt || null);
  const holder = (row, col) => slots.get(row + ':' + col);

  // choose the place before the courier takes off, so two couriers never aim at one place
  function pick(row, widget, data) {
    const k = keyOf(widget, data);
    for (const [id, it] of items) if (keyOf(it.rec.kind, it.rec.data) === k && it.rec.row === row) return it.rec.col; // same thing again: same place
    if (widget === 'clock') return 2;
    const freeCol = ORDER.find((c) => !holder(row, c));
    if (freeCol != null) return freeCol;
    // all five taken: overwrite the oldest one in this row (never the clock if avoidable)
    let best = null, bestT = Infinity;
    for (const c of ORDER) { const it = items.get(holder(row, c)); if (it && it.rec.kind !== 'clock' && it.born < bestT) { best = c; bestT = it.born; } }
    return best ?? 0;
  }
  const rawDeliver = bg.deliver.bind(bg);
  bg.deliver = (widget, o = {}) => {
    const by = ROWS[o.by] ? o.by : 'airship', row = by;
    const col = Number.isInteger(o.col) && o.col >= 0 && o.col < 5 ? o.col : pick(row, widget, o.data);
    if (!holder(row, col)) slots.set(row + ':' + col, 'pending');
    return rawDeliver(widget, { ...o, by, at: [COLS[col], ROWS[row]], tag: { row, col } });
  };

  bg.on('drop', (d) => {
    const row = d.tag?.row, col = d.tag?.col, k = keyOf(d.widget, d.data);
    for (const [id, it] of items) if (keyOf(it.rec.kind, it.rec.data) === k) remove(id); // same thing: replace
    if (row) {
      const occ = holder(row, col);
      if (occ && occ !== 'pending' && items.has(occ)) {
        // the clock takes the centre: the current occupant moves to a free place, otherwise it is overwritten
        const alt = d.widget === 'clock' ? ORDER.find((c) => c !== col && !holder(row, c)) : null;
        if (alt != null) moveTo(occ, row, alt); else remove(occ);
      }
      slots.delete(row + ':' + col);
    }
    create({ kind: d.widget, data: d.data, size: d.size, row: row || null, col: row ? col : null, x: row ? COLS[col] : d.to[0] / innerWidth, y: row ? ROWS[row] : d.to[1] / innerHeight }, d.from);
  });

  return {
    kinds: Object.keys(KINDS),
    list: () => [...items.values()].map(({ rec }) => ({ ...rec })),
    remove, clear: () => [...items.keys()].forEach(remove),
    slots: () => Object.fromEntries([...slots].map(([k, v]) => [k, v === 'pending' ? 'pending' : items.get(v)?.rec.kind])),
  };
}
