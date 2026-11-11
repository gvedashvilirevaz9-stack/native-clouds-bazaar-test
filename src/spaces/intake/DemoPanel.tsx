// ▶ Demo: scenario menu + caption bar. Scenarios come from demo/scenarios.json.
import {useEffect, useState} from 'react';
import {useDemo, loadScenarios, play, stop, pause, skip, speed, clearDemo} from './demo';

export function DemoPanel({ru, open, onClose}: {ru: boolean; open: boolean; onClose: () => void}) {
  const d = useDemo();
  const [confirm, setConfirm] = useState(false);
  useEffect(() => { if (open) void loadScenarios(); }, [open]);
  const cur = d.scenarios.find(s => s.id === d.running);
  return <>
    {open && !d.running && <aside className="dm-panel" data-testid="demo-panel" aria-label={ru ? 'Демонстрация' : 'Demo'}>
      <header><strong>▶ {ru ? 'Демонстрация Приёмной' : 'Inbox demo'}</strong><button type="button" onClick={onClose} aria-label={ru ? 'Закрыть' : 'Close'}>✕</button></header>
      <p className="dm-hint">{ru ? 'Выберите сценарий: я сам принесу файлы и проведу их по цепочке. Действия агента симулируются, это помечено 📱.' : 'Pick a scenario: files are brought in and walked through the pipeline. Agent actions are simulated and marked 📱.'}</p>
      {d.error && <p className="dm-err">⚠ {d.error}</p>}
      <div className="dm-list">{d.scenarios.map(s => <button type="button" key={s.id} data-testid={'demo-' + s.id} onClick={() => { void play([s.id]); }}>
        <b>{s.icon}</b><span><strong>{s.title}</strong><small>{s.subtitle}</small></span><em>▶</em></button>)}</div>
      <footer>
        <button type="button" className="dm-all" disabled={!d.scenarios.length} onClick={() => { void play(d.scenarios.map(s => s.id)); }}>▶ {ru ? 'Прогнать все подряд' : 'Play all'}</button>
        {confirm
          ? <span className="dm-confirm">{ru ? 'Убрать файлы Приёмной, вложения блокнота и их карточки с доски?' : 'Remove Inbox files, notebook attachments and their board cards?'} <button type="button" onClick={() => { clearDemo(); setConfirm(false); }}>{ru ? 'Да' : 'Yes'}</button><button type="button" onClick={() => setConfirm(false)}>{ru ? 'Нет' : 'No'}</button></span>
          : <button type="button" className="dm-clear" onClick={() => setConfirm(true)}>{ru ? 'Очистить результаты' : 'Clear results'}</button>}
      </footer>
    </aside>}
    {d.running && <div className="dm-bar" role="status" aria-live="polite" data-testid="demo-bar">
      <div className="dm-bar-head"><b>{cur?.icon}</b><strong>{cur?.title}</strong><span>{d.step}/{d.total}</span></div>
      <p>{d.caption}</p>
      <div className="dm-progress"><i style={{width: (d.total ? d.step / d.total * 100 : 0) + '%'}}/></div>
      <div className="dm-ctrl">
        <button type="button" onClick={() => pause(!d.paused)}>{d.paused ? '▶' : '⏸'}</button>
        <button type="button" onClick={skip} title={ru ? 'Дальше' : 'Next'}>⏭</button>
        <button type="button" onClick={() => speed(d.speed === 1 ? 2 : d.speed === 2 ? 0.5 : 1)}>{d.speed}×</button>
        <button type="button" onClick={stop}>⏹</button>
      </div>
    </div>}
  </>;
}
