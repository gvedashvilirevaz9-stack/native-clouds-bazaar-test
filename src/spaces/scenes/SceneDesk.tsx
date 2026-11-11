import {LibraryProviders} from '../personal/LibraryPresentation';
import {windowContext,accepts,viewReceipt} from '../personal/window-context';
import {FrameContext,FrameLanguage,useFrame,present} from './SceneLanguage';
import {SceneVoiceMenu} from './SceneVoiceMenu';
import {AskPresets,AskMenu} from '../personal/AskWindow';
import React,{useContext,useState} from 'react';
import {SceneView,type Loop} from './SceneView';
import {names,SCENE_MIME,useCollection,removeBuild,demo,type Build} from './scene-store';
export type Destination='desktop'|'board'|'background'|'library';
type Actions={showBoard:()=>void;open:(provider:string)=>void;place:(id:string,where:Destination)=>Promise<any>;setLoop:(patch:Partial<Loop>|null)=>void;switchKind?:(kind:string)=>void};
export function SceneDesk({provider,loop,actions,hub=false,windowId}:{windowId?:string;provider:string;hub?:boolean;loop?:Loop;actions:Actions}){
  const s=useCollection(); const [tab,setTab]=useState<'inbox'|'library'|'all'>(hub?'all':'inbox'),[chosen,setChosen]=useState(''),[notice,setNotice]=useState('');
  const {lang}=useFrame(),ru=lang==='ru';const t=(r:string,e:string)=>ru?r:e;
  React.useEffect(()=>{const on=(e:any)=>{const d=e.detail||{};if(d.type!=='how'||!accepts(d,windowId)||!s.builds.some(b=>b.id===d.buildId))return;setTab('all');setChosen(d.buildId);setNotice('');viewReceipt(d,{selected:true,windowId,itemId:d.buildId})};window.addEventListener('sunrise:ask-open-item',on);return ()=>window.removeEventListener('sunrise:ask-open-item',on)},[hub,windowId,s.builds]);
  const current=s.builds.find(b=>b.id===(tab==='inbox'?s.inbox[provider]:chosen));
  React.useEffect(()=>{if(windowId)windowContext.select(windowId,current?{kind:'build',itemId:current.id,number:current.number,title:current.document.title}:null);
    if(!windowId||!current)return;const timer=setTimeout(()=>document.querySelector('[data-id="'+windowId+'"] [data-testid=scene-view]')?.scrollIntoView({behavior:'smooth',block:'start'}),120);return()=>clearTimeout(timer);
  },[windowId,current?.id]);
  return <div className="hiw-desk" data-testid={hub?'scene-menu':'scene-inbox'} data-provider={hub?'all':provider}>
    <nav className="ask-topbar" aria-label={t('Окна провайдеров','Provider windows')}><LibraryProviders>{Object.entries(names).map(([id,name])=><button key={id} aria-pressed={!hub&&id===provider} onClick={()=>actions.open(id)}>{name}</button>)}</LibraryProviders>{actions.switchKind&&<AskMenu windowId={windowId} current="how" ru={ru} onSwitch={actions.switchKind}/>}<div className="ask-top-r hiw-voice-slot"><SceneVoiceMenu speechLang={current?present(current,lang).document.lang:lang}/></div></nav>
    {hub&&<header className="hiw-home-title ask-head"><div><small>SUNRISE LAB</small><h2>{t('Как это работает','How It Works')}</h2><p>{t('Выберите сборку, чтобы открыть её и послушать объяснение.','Choose a build to explore its parts and hear the explanation.')}</p></div><AskPresets type="how" ru={ru}/></header>}
    <div className="hiw-tabs">{hub?<button aria-pressed={tab==='all'} onClick={()=>{setTab('all');setChosen('');setNotice('')}}>{t('Все сборки','All builds')} · {s.builds.length}</button>:<button aria-pressed={tab==='inbox'} onClick={()=>{setTab('inbox');setNotice('')}}>{t('Входящие','Inbox')}</button>}<button data-testid="scene-library" aria-pressed={tab==='library'} onClick={()=>{setTab('library');setChosen('');setNotice('')}}>{t('Мой учебник','My textbook')} · {s.saved.length}</button></div>
    {tab==='all'&&<div className="hiw-index hiw-all-builds hiw-frame">{[...s.builds].reverse().map(b=><button key={b.id} data-build-number={b.number} data-item-number={b.number} aria-pressed={chosen===b.id} onClick={()=>{setChosen(b.id);setNotice('')}}><b>№ {b.number}</b><span>{present(b,lang).document.title}</span><small>{names[b.provider]||'Sunrise Lab'}</small></button>)}</div>}
    {tab==='library'&&<div className="hiw-index hiw-frame">{!s.saved.length&&<p>{t('Закрепите сборку кнопкой «В учебник».','Use “Save to textbook” to keep a build here.')}</p>}{s.saved.map(id=>{const b=s.builds.find(v=>v.id===id);return b&&<button key={id} onClick={()=>setChosen(id)} aria-pressed={chosen===id}>№ {b.number} · {present(b,lang).document.title}</button>})}</div>}
    {current&&<SceneView windowId={windowId} key={current.id} build={current} header={false}><BuildActions current={current} placeBuild={actions.place} setNotice={setNotice}/></SceneView>}
    {!current&&tab==='inbox'&&<div className="hiw-empty"><strong>{t('Окно','Inbox ·')} {names[provider]}</strong><p>{t('Здесь появится сборка, когда подключённый агент пришлёт её через MCP.','Builds delivered by your connected agent will appear here.')}</p></div>}
    {s.builds.filter(b=>b.provider===provider).length>1&&tab==='inbox'&&<details><summary>{t('Предыдущие сборки','Previous builds')}</summary>{s.builds.filter(b=>b.provider===provider).slice().reverse().map(b=><button key={b.id} onClick={()=>void place(b.id,'desktop')}>{t('Открыть','Open')} № {b.number} · {present(b,lang).document.title}</button>)}</details>}
    {loop&&<div className="hiw-loop"><strong>{t('Живой фон','Live background')}</strong> <label>{t('Цикл, с','Cycle, s')} <input key={loop.id+'-'+loop.seconds} type="number" min="2" max="86400" defaultValue={loop.seconds} onBlur={e=>{const seconds=Number(e.target.value);if(seconds>=2&&seconds<=86400)actions.setLoop({seconds})}}/></label><button onClick={()=>actions.setLoop({reverse:!loop.reverse})}>{loop.reverse?t('← Назад','← Reverse'):t('→ Вперёд','→ Forward')}</button><button onClick={()=>actions.setLoop({paused:!loop.paused})}>{loop.paused?t('▶ Пуск','▶ Play'):t('Ⅱ Пауза','Ⅱ Pause')}</button><button onClick={()=>actions.setLoop(null)}>{t('Убрать фон','Clear background')}</button></div>}
    <output aria-live="polite">{({library:t('Сохранено в учебнике','Saved to textbook'),board:t('Добавлено на текущую доску Garage','Added to your Garage board'),desktop:t('Открыта копия на рабочем столе','Opened on desktop'),background:t('Анимация установлена на фон','Background animation set')} as Record<string,string>)[notice]||notice} {notice==='board'&&<button onClick={actions.showBoard}>{t('Показать доску','Show board')}</button>}</output>
  </div>
}
function BuildActions({current,placeBuild,setNotice}:{current:Build;placeBuild:Actions['place'];setNotice:(notice:string)=>void}){
  const {lang}=useFrame(),s=useCollection(),t=(r:string,e:string)=>lang==='ru'?r:e;
  const place=async(id:string,target:Destination)=>{try{await placeBuild(id,target);setNotice(target)}catch(e){setNotice(String(e))}};
  const drag=(e:React.DragEvent,b:Build)=>{e.dataTransfer.setData(SCENE_MIME,b.id);e.dataTransfer.effectAllowed='copy'};
  return <div className="hiw-actions" aria-label={t("Разместить сборку","Place build")}>
      <button draggable onDragStart={e=>drag(e,current)} title={t("Перетащите на рабочий стол или доску","Drag to the desktop or board")} data-testid="scene-drag">⠿ № {current.number}</button>
      {([['library',t('В учебник','Save to textbook')],['desktop',t('На стол','To desktop')],['board',t('На рабочую доску','To work board')],['background',t('На фон','Set background')]] as const).map(([dst,text])=><button data-testid={'scene-pin-'+dst} key={dst} onClick={()=>void place(current.id,dst)}>{dst==='library'&&s.saved.includes(current.id)?t('✓ В учебнике','✓ In textbook'):text}</button>)}
      <button data-testid="scene-delete" disabled={current.id===demo.id} title={current.id===demo.id?t('Встроенную сборку удалить нельзя','Built-in build cannot be deleted'):''} onClick={()=>{if(current.id!==demo.id&&confirm(t('Удалить сборку № ','Delete build № ')+current.number+'?'))removeBuild(current.id).then(()=>setNotice(t('Сборка удалена','Build deleted')),e=>setNotice(String(e)))}}>{t('Удалить','Delete')}</button>
    </div>;
}
export function PinnedScene({id,bare=false,place,windowId}:{windowId?:string;id:string;bare?:boolean;place?:Actions['place']}){
  const [notice,setNotice]=useState('');
  const b=useCollection().builds.find(b=>b.id===id);
  const frame=useContext(FrameContext);
  const view=b?<SceneView windowId={windowId} key={id} build={b} bare={bare}>{place&&<><BuildActions current={b} placeBuild={place} setNotice={setNotice}/><output aria-live="polite">{notice&&({library:'✓',desktop:'✓',board:'✓',background:'✓'}[notice]||notice)}</output></>}</SceneView>:<small>{frame?.lang==='en'?'Build missing from this browser’s library.':'Сборка отсутствует в библиотеке этого браузера.'}</small>;
  return frame?view:<FrameLanguage>{view}</FrameLanguage>;
}
