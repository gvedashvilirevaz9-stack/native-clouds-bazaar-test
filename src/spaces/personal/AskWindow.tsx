import {LibraryProviders} from './LibraryPresentation';
import {windowContext,accepts,viewReceipt} from './window-context';
// Grok 2026-11-04 (askwindows): question windows in the style of «Как это работает».
import {useEffect,useRef,useState,useSyncExternalStore} from 'react';
import {ASK_TYPES,ASK_DEPTHS,ASK_SOURCES,ASK_BUILD_TYPES,askType,askTemplate,mapEmbed} from '../../../shared/ask-types.mjs';
import {PinnedScene} from '../scenes/SceneDesk';
import {SceneVoiceMenu} from '../scenes/SceneVoiceMenu';
import {useCollection,collection} from '../scenes/scene-store';
import {communication} from '../communication/store';
import {askStore} from './ask-store.mjs';
import {CardRead} from './CardReader';
import './ask.css';
const depthName=(d:string,ru:boolean)=>{const x=ASK_DEPTHS.find(v=>v.id===d);return x?(ru?x.ru:x.en):d};
function revealCard(windowId?:string){
  const root=document.querySelector<HTMLElement>('[data-id="'+windowId+'"]');
  const card=root?.querySelector<HTMLElement>('[data-testid=ask-card]');
  if(!card)return;
  // Keep the portrait below the sticky toolbar, including when TV scales the window.
  card.style.scrollMarginTop=((root?.querySelector<HTMLElement>('.ask-topbar')?.offsetHeight||0)+12)+'px';
  card.scrollIntoView({behavior:'smooth',block:'start'});
}
export function AskPresets({type,ru}:{type:string;ru:boolean}){
  useSyncExternalStore(askStore.subscribe,askStore.revision);
  const t=askType(type);if(!t)return null;const on=askStore.presets(type);
  return <div className="ask-presets" role="group" aria-label={ru?'Пресеты запроса':'Request presets'} data-testid={'ask-presets-'+type}>
    {t.presets.map((p:any)=>{const active=on.includes(p.id);return <button key={p.id} type="button" className={'ask-preset d-'+p.depth+(active?' is-on':'')} aria-pressed={active} data-testid={'ask-preset-'+type+'-'+p.id} onClick={()=>askStore.toggle(type,p.id)}>
      <span className="ask-led" aria-hidden>{active?'●':'○'}</span><span className="ask-pl">{ru?p.ru:p.en}</span>
      <span className="ask-info" tabIndex={0} onClick={e=>e.stopPropagation()} aria-label={p.prompt}>ⓘ<span className="ask-pop" role="tooltip"><b>{ru?p.ru:p.en} · {depthName(p.depth,ru)}</b>{p.prompt}</span></span>
    </button>})}
  </div>;
}
export function AskBar({ru,onOpen,onHow,howDisabled}:{ru:boolean;onOpen:(type:string)=>void;onHow:()=>void;howDisabled?:boolean}){
  return <nav className="ask-bar" aria-label={ru?'Вопросы':'Questions'} data-testid="ask-bar">
    {ASK_TYPES.filter((t:any)=>t.visible).map((t:any)=>t.scene
      ?<button key={t.id} disabled={howDisabled} className="hiw-launch ask-btn" data-testid="scene-launch" onClick={onHow}>{t.icon} {ru?t.ru:t.en}</button>
      :<button key={t.id} className="ask-btn" data-testid={'ask-launch-'+t.id} onClick={()=>onOpen(t.id)}>{t.icon} {ru?t.ru:t.en}</button>)}
  </nav>;
}
// askmenu: in-window function menu (centre of the green top bar); switches THIS window.
// cabsearch: search → agent buffer (communication) + ask.query queue.
import {CAB_NOTE} from './ask-store.mjs';
export const CAB_SEARCH_NOTE=CAB_NOTE;
export function sendCabinetSearch(text:string,fn:string|null,ru:boolean,_model?:string,_windowType?:string,windowId?:string,origin='manual'){
  const q=text.trim().slice(0,300);if(!q)return null;const f=fn&&askType(fn)?fn:null;
  const presets=f?askStore.presets(f).map((id:string)=>{const x=askType(f).presets.find((x:any)=>x.id===id);return x&&{id:x.id,title:ru?x.ru:x.en,prompt:x.prompt}}).filter(Boolean):[];
  if(!windowId)throw Error('SELECT_QUESTION_WINDOW');
  const item=askStore.query({text:q,function:f,presets,lang:document.documentElement.lang|| (ru?'ru':'en'),windowId,origin,buildsAt:collection().builds.at(-1)?.number||0,...(f?{}:{note:CAB_SEARCH_NOTE})});
  communication.add({text:'🔎 '+JSON.stringify(askStore.lean(item)),role:'user',source:'Sunrise Lab',contact:'agent',key:'ask-query/'+item.id} as any);
  return item;
}
function CabSearch({ru,model,windowType,text,setText,windowId}:{windowId?:string;ru:boolean;model:string;windowType?:string;text:string;setText:(s:string)=>void}){
  const [open,setOpen]=useState(false);const ref=useRef<HTMLInputElement>(null);
  useSyncExternalStore(askStore.subscribe,askStore.revision);
  useEffect(()=>{const on=(e:any)=>{const d=e.detail||{};if(!accepts(d,windowId))return;
    setOpen(true);if(typeof d.text==='string')setText(d.text);
    try{const q=d.function?sendCabinetSearch(typeof d.text==='string'?d.text:text,d.function,ru,model,windowType,windowId,'command'):null;
      if(d.function&&!q)throw Error('SEARCH_TEXT_REQUIRED');if(q)setText('');
      // Acknowledge the durable queue write immediately. Background-tab paint can
      // be throttled, and waiting for it makes the transport retry the mutation.
      viewReceipt(d,{windowId,queryId:q?.id||null,status:q?'buffer':'draft',text:q?.text||d.text||text});
      requestAnimationFrame(()=>ref.current?.focus());
    }catch(e){viewReceipt(d,null,String((e as Error).message));}
  };window.addEventListener('sunrise:ask-search',on);return()=>window.removeEventListener('sunrise:ask-search',on)},[text,windowId,windowType,ru,model]);
  const send=()=>{if(sendCabinetSearch(text,windowType||null,ru,model,windowType,windowId))setText('')};
  const qs=askStore.queries().filter((q:any)=>q.windowId===windowId),latest=qs.slice(-1)[0],lastDone=[...qs].reverse().find((q:any)=>q.status==='done');
  const last=latest&&latest.status!=='done'&&Date.now()-latest.createdAt<3600000?latest:lastDone;
  const found=last?.status==='done'?askStore.result(last,collection().builds):null;
  const chip=last?(last.status==='done'?(ru?'✓ Готово':'✓ Done')+(found?.number?' · №'+found.number:''):last.status==='running'?(ru?'Исследую и собираю…':'Researching and building…'):last.status==='clarify'?(ru?'Агент уточняет':'Agent is clarifying'):last.status==='failed'?(ru?'Ошибка':'Failed'):(ru?'В буфере…':'In buffer…')):null;
  return <><span className={'ask-search'+(open?' is-open':'')} data-testid="ask-search">
    <button type="button" role="tab" aria-pressed={open} aria-label={ru?'Поиск':'Search'} data-testid="ask-search-btn" onClick={()=>{if(open&&text.trim())send();else{setOpen(!open);setTimeout(()=>ref.current?.focus(),30)}}}>🔍{!open&&<> {ru?'Поиск':'Search'}</>}</button>
    {open&&<input ref={ref} data-testid="ask-search-input" value={text} maxLength={300} placeholder={ru?'Спросить агента…':'Ask the agent…'} onChange={e=>setText(e.target.value)} onKeyDown={e=>{if(e.key==='Enter'){e.preventDefault();send()}if(e.key==='Escape')setOpen(false)}}/>}
  </span>{chip&&(last.status==='done'?<button type="button" className="ask-chip s-done" data-testid="ask-search-chip" title={ru?'Открыть найденное':'Open the result'} onClick={e=>window.dispatchEvent(new CustomEvent('sunrise:cab-open-result',{detail:{queryId:last.id,windowId:((e.currentTarget as HTMLElement).closest('.ps-w[data-id]') as HTMLElement|null)?.dataset.id}}))}>{chip}</button>:<output className={'ask-chip s-'+last.status} data-testid="ask-search-chip" aria-live="polite">{chip}</output>)}</>;
}
export function AskMenu({current,ru,onSwitch,model='',windowId}:{windowId?:string;current:string;ru:boolean;onSwitch:(kind:string)=>void;model?:string}){
  const [text,setText]=useState('');
  return <div className="ask-menu" role="tablist" aria-label={ru?'Функции окна':'Window functions'} data-testid="ask-menu">
    <CabSearch windowId={windowId} ru={ru} model={model} windowType={current} text={text} setText={setText}/>
    {ASK_TYPES.filter((t:any)=>t.visible).map((t:any)=><button key={t.id} role="tab" aria-selected={current===t.id} aria-pressed={current===t.id} data-testid={'ask-menu-'+t.id} onClick={()=>{if(text.trim()){sendCabinetSearch(text,t.id,ru,model,current,windowId);setText('')}if(current!==t.id)onSwitch(t.id)}}>{t.icon} {ru?t.ru:t.en}</button>)}
  </div>;
}
export function AskBody({type,ru,place,placeCard,onSwitch,windowId}:{windowId?:string;type:string;ru:boolean;place?:(id:string,where:any)=>Promise<any>;placeCard?:(type:string,id:string,where:any)=>Promise<any>;onSwitch?:(kind:string)=>void}){
  const scenes=useCollection();const [showBuild,setShowBuild]=useState('');
  useSyncExternalStore(askStore.subscribe,askStore.revision);
  const t=askType(type),[src,setSrc]=useState(''),[tab,setTab]=useState<'all'|'mine'>('all'),[chosen,setChosen]=useState(''),[note,setNote]=useState('');
  if(!t)return <p>Unknown window</p>;
  const all=askStore.items(type),items=all.filter((i:any)=>(!src||i.source===src)&&(tab==='all'||i.mine));
  const cur0=all.find((i:any)=>i.id===chosen);
  const [vi,setVi]=useState(-1);useEffect(()=>{setVi(-1);windowContext.select(windowId,cur0?{kind:'card',itemId:cur0.id,number:cur0.number,title:cur0.title}:null)},[chosen,type,cur0?.id]);const [placed,setPlaced]=useState('');
  const vs=cur0?.variants||[];const cur=cur0&&vi>=0&&vs[vi]?{...cur0,...vs[vi]}:cur0;
  useEffect(()=>{const on=(e:any)=>{if(e.detail?.type!==type||!accepts(e.detail,windowId))return;const c=cur||all[0];if(!c)return;if(!cur)setChosen(c.id);
    if(c.buildId&&scenes.builds.some((x:any)=>x.id===c.buildId))setShowBuild(c.id);else if(!c.buildPending){document.querySelector<HTMLButtonElement>('[data-id="'+windowId+'"] [data-testid=ask-make-build]')?.click()}};
    window.addEventListener('sunrise:ask-build',on);return ()=>window.removeEventListener('sunrise:ask-build',on)},[cur,all,scenes,type]);
  useEffect(()=>{const on=(e:any)=>{const d=e.detail||{};if(d.type!==type||!accepts(d,windowId)||!askStore.item(type,d.itemId))return;setTab('all');setSrc('');setChosen(d.itemId);
    const it=askStore.item(type,d.itemId);if(it?.buildId)setShowBuild(it.id);windowContext.select(windowId,{kind:'card',itemId:it.id,number:it.number,title:it.title});viewReceipt(d,{selected:true,windowId,itemId:it.id});
    setTimeout(()=>revealCard(windowId),120)};
    window.addEventListener('sunrise:ask-open-item',on);return ()=>window.removeEventListener('sunrise:ask-open-item',on)},[type]);
  const copy=async()=>{try{await navigator.clipboard.writeText(askTemplate(type,askStore.presets(type)).prompt);setNote(ru?'Промпт скопирован':'Prompt copied')}catch{setNote(ru?'Не удалось скопировать':'Copy failed')}};
  return <div className="hiw-desk ask-desk" data-testid={'ask-window-'+type} data-ask-type={type}>
    <nav className="ask-topbar" aria-label={ru?'Источник и функции':'Source and functions'}><LibraryProviders>{Object.entries(ASK_SOURCES).map(([id,name])=><button key={id} aria-pressed={src===id} onClick={()=>setSrc(src===id?'':id)}>{name}</button>)}</LibraryProviders>{onSwitch&&<AskMenu windowId={windowId} current={type} ru={ru} onSwitch={onSwitch} model={src}/>}<div className="ask-top-r hiw-voice-slot"><SceneVoiceMenu speechLang={ru?'ru':'en'}/></div></nav>
    <header className="hiw-home-title ask-head"><div><small>SUNRISE LAB</small><h2>{t.icon} {ru?t.ru:t.en}</h2><p>{ru?'Включите пресеты — агент соберёт карточку по ним.':'Turn on presets — your agent builds the card from them.'} <button type="button" className="ask-copy" onClick={copy} data-testid={'ask-copy-'+type}>⧉ {ru?'промпт':'prompt'}</button> <output aria-live="polite">{note}</output></p></div><AskPresets type={type} ru={ru}/></header>
    <div className="hiw-tabs"><button aria-pressed={tab==='all'} onClick={()=>setTab('all')}>{ru?'Все':'All'} · {all.length}</button><button aria-pressed={tab==='mine'} onClick={()=>setTab('mine')}>{ru?'Мои':'Mine'} ★ · {all.filter((i:any)=>i.mine).length}</button></div>
    <div className="hiw-index hiw-all-builds hiw-frame" data-testid="ask-items">{!items.length&&<p className="ask-empty">{ru?'Пока пусто. Скажите агенту: «'+t.ru.toLowerCase()+' …» — карточка появится здесь.':'Empty. Ask your agent — the card will appear here.'}</p>}
      {[...items].reverse().map((i:any)=><button key={i.id} data-item-number={i.number} data-testid="ask-item" aria-pressed={chosen===i.id} onClick={()=>setChosen(chosen===i.id?'':i.id)}><b>№ {i.number}{i.mine?' ★':''}</b><span>{i.title}</span><small>{(ASK_SOURCES as any)[i.source]||i.source}</small></button>)}</div>
    {cur&&<article className="ask-card" data-testid="ask-card">
      {(()=>{const g:any=type==='where'?cur.geo:null;const mini=g?mapEmbed(g.lat!=null?{lat:g.lat,lng:g.lng}:g):'';return (cur.imageUrl||mini)?<div className="ask-hero" data-testid="ask-hero">{cur.imageUrl&&<img src={cur.imageUrl} alt="" loading="lazy" referrerPolicy="no-referrer"/>}{mini&&<div className="ask-map-box" data-testid="ask-map-box"><iframe className="ask-map-mini" data-testid="ask-map-mini" src={mini} title="map" loading="lazy" referrerPolicy="no-referrer-when-downgrade"/></div>}</div>:null})()}
      <CardRead windowId={windowId} cur={cur} ru={ru} type={type}/>
      {!!cur.links.length&&<ul className="ask-links">{cur.links.map((l:any)=><li key={l.url}><a href={l.url} target="_blank" rel="noreferrer noopener">{l.title||l.url}</a></li>)}</ul>}
      {!!vs.length&&<nav className="ask-variants" data-testid="ask-variants"><span>{vi>=0?(ru?'Вы смотрите вариант. Основной ответ:':'Viewing a variant. Main answer:'):(ru?'Может, вы имели в виду:':'Did you mean:')}</span>{vi>=0&&<button type="button" data-testid="ask-variant-main" onClick={()=>setVi(-1)}>↩ {cur0.title}</button>}{vs.map((v:any,n:number)=>n===vi?null:<button type="button" key={n} data-testid="ask-variant" onClick={()=>{setVi(n);document.querySelector('[data-id="'+windowId+'"] [data-testid=ask-card]')?.scrollIntoView({behavior:'smooth',block:'start'})}}>{v.title}</button>)}</nav>}
      {(()=>{const b=cur.buildId&&scenes.builds.find((x:any)=>x.id===cur.buildId);if(!ASK_BUILD_TYPES.includes(type))return null;
        if(b)return <div className="ask-build" data-testid="ask-build">{showBuild===cur.id?<PinnedScene id={b.id} place={place}/>:null}</div>;
        if(cur.buildPending)return <p className="ask-build-wait" role="status" data-testid="ask-build-wait">◈ {ru?'Собираем сборку «'+cur.title+'»… Агент получил запрос.':'Building «'+cur.title+'»… the agent got the request.'}</p>;
        return null})()}
      <div className="hiw-actions" data-testid="ask-actions"><b className="ask-num" data-testid="ask-num">№ {cur.number}</b>
        {([['library',ru?'В учебник':'Save to textbook'],['desktop',ru?'На стол':'To desktop'],['board',ru?'На рабочую доску':'To work board'],['background',ru?'На фон':'Set background']] as const).map(([dst,text])=><button key={dst} data-testid={'ask-pin-'+dst} onClick={()=>{if(!placeCard)return;placeCard(type,cur0.id,dst).then(()=>setPlaced(dst),(e:any)=>setPlaced(String(e?.message||e)))}}>{dst==='library'&&cur.book?(ru?'✓ В учебнике':'✓ In textbook'):text}</button>)}
        <button data-testid="ask-mine" onClick={()=>askStore.pin(type,cur.id)}>{cur.mine?(ru?'✓ В моих':'✓ Mine'):(ru?'★ В мои':'★ Keep')}</button><button data-testid="ask-delete" onClick={()=>{if(confirm((ru?'Удалить карточку № ':'Delete card № ')+cur.number+'?')){askStore.remove(type,cur.id);setChosen('')}}}>{ru?'Удалить':'Delete'}</button>
        {ASK_BUILD_TYPES.includes(type)&&(()=>{const b=cur.buildId&&scenes.builds.find((x:any)=>x.id===cur.buildId);
        return b?<button data-testid="ask-open-build" aria-pressed={showBuild===cur.id} onClick={()=>setShowBuild(showBuild===cur.id?'':cur.id)}>◈ {showBuild===cur.id?(ru?'Скрыть сборку №':'Hide build №'):(ru?'Открыть сборку №':'Open build №')}{b.number}</button>
        :<button data-testid="ask-make-build" disabled={!!cur.buildPending&&Date.now()-cur.buildPending<600000} onClick={()=>{askStore.requestBuild(type,cur.id);communication.add({text:(ru?'Как это работает: «':'How it works: «')+cur.title+'». ask.build {type:"'+type+'", itemId:"'+cur.id+'"} → scene.create {document, attachTo:{type:"'+type+'", itemId:"'+cur.id+'"}}',role:'user',source:'Sunrise Lab',contact:'agent',key:'ask-build/'+cur.id+'/'+Date.now()} as any)}}>{ru?'Как это работает →':'How it works →'}</button>})()}
        <output aria-live="polite" className="ask-placed">{({library:ru?'✓ В учебнике':'✓ Saved',desktop:ru?'✓ Открыто на столе':'✓ On desktop',board:ru?'✓ На доске Garage':'✓ On board',background:ru?'✓ Фон установлен':'✓ Background set'} as any)[placed]||placed}</output></div>
    </article>}
  </div>;
}
