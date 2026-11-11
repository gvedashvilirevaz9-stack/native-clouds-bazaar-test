import React,{useEffect,useState,useSyncExternalStore} from 'react';
import {createRoot} from 'react-dom/client';
import {GarageSpace,executeGarage,garageView,boardSummary} from '../src/spaces/garage/GarageSpace';
import {controlFor} from '../src/spaces/agent/controls';
import {readGarageState} from '../src/spaces/garage/garage-remote';
import {garage} from '../src/spaces/garage/store';
import {LangProvider,useLang} from '../src/hooks/useLang';
import {LibraryPresentation} from '../src/spaces/personal/LibraryPresentation';
import {nativeRooms,nativeDelivery} from '../src/spaces/personal/native-clouds-state';
import {windowContext,viewCommand} from '../src/spaces/personal/window-context';
import {AskBody,sendCabinetSearch} from '../src/spaces/personal/AskWindow';
import {askStore} from '../src/spaces/personal/ask-store.mjs';
import {ASK_TYPES} from '../shared/ask-types.mjs';
import {SceneDesk,PinnedScene} from '../src/spaces/scenes/SceneDesk';
import {FrameLanguage} from '../src/spaces/scenes/SceneLanguage';
import {collection,deliver,bookmark} from '../src/spaces/scenes/scene-store';
import {Background,type Loop} from '../src/spaces/scenes/SceneView';
import {addBoardScene} from '../src/spaces/scenes/place-board';
import {NativeSky,NativeArrival} from './NativePresentation';
import {executeIntake,INTAKE_COMMANDS} from '../src/spaces/intake/commands';
import {intake,ingestMany,ingestText,batches} from '../src/spaces/intake/store';
import {toNotebook} from '../src/spaces/intake/routes';
import {DemoPanel} from '../src/spaces/intake/DemoPanel';
import {picture} from '../src/spaces/picture/model';
import {pasteBlob} from '../src/spaces/picture/render';
import {executeTools,TOOL_COMMANDS} from '../src/spaces/picture/commands';
import {executeBilling,BILLING_COMMANDS} from '../src/spaces/billing/commands';
import {executeDay,DAY_COMMANDS} from '../src/spaces/day/commands';
import {executeDocs,DOC_COMMANDS} from '../src/spaces/docs/commands';
import {SHOP_COMMANDS} from '../src/spaces/shop/commands';
import {BAZAAR_COMMANDS} from '../src/spaces/bazaar/commands';
import {lazy,Suspense} from 'react';
const BazaarRoom=lazy(()=>import('../src/spaces/bazaar/BazaarRoom').then(m=>({default:m.BazaarRoom})));
const ShopRoom=lazy(()=>import('../src/spaces/shop/ShopRoom').then(m=>({default:m.ShopRoom})));
import {FastSheet,fastSheet,dropPref} from '../src/spaces/fast/FastSheet';
import './native-clouds.css';
import './standalone.css';

// UI-only adapter. There is deliberately no network MCP server or API-key storage.
nativeRooms.open('garage');
function App(){
 const {lang,setLang}=useLang(),ru=lang==='ru';
 const room=useSyncExternalStore(nativeRooms.subscribe,nativeRooms.get);
 useSyncExternalStore(askStore.subscribe,askStore.revision);
 const [windowSpec,setWindowSpec]=useState<any>(null),[provider,setProvider]=useState('openai'),[hub,setHub]=useState(true);
 const [providerHost,setProviderHost]=useState<HTMLElement|null>(null),[tools,setTools]=useState(false),[importText,setImportText]=useState(''),[message,setMessage]=useState('');
 const [pinned,setPinned]=useState<string[]>([]),[loop,setLoop]=useState<Loop|undefined>();
 const [cardBackground,setCardBackground]=useState<any>(null),[pinnedCards,setPinnedCards]=useState<any[]>([]);
 function openKind(kind='how'){
   if(!ASK_TYPES.some((x:any)=>x.id===kind))throw Error('UNKNOWN_ASK_TYPE');
   nativeRooms.open('garage');
   const id='workshop-'+kind+'-'+crypto.randomUUID();
   const w={id,type:kind==='how'?'scene':'ask',props:{kind,title:ASK_TYPES.find((x:any)=>x.id===kind)?.[ru?'ru':'en']},z:1};
   setWindowSpec(w);setHub(true);nativeRooms.adoptWindow(id);
   windowContext.sync([{id,type:w.type,kind,title:w.props.title,z:1}]);
   return {windowId:id,type:kind};
 }
 function selectService(service:string){
   if(service==='encyclopedia')return openKind();
   if(['inbox','estimate','media','billing','day'].includes(service)){nativeRooms.open('garage');nativeRooms.select(service);return {service};}
   nativeRooms.open('garage');nativeRooms.select(service);garageView.set({tab:service==='sketchbook'?'board':'notebook'});
   return {service};
 }
 async function place(id:string,where:string){
   if(where==='library')return bookmark(id);
   if(where==='board')return addBoardScene(id);
   if(where==='desktop'){setPinned(p=>p.includes(id)?p:[...p,id]);return {id,placed:where};}
   if(where==='background'){setLoop({id,seconds:20,reverse:false,paused:false});return {id,placed:where};}
   throw Error('UNKNOWN_DESTINATION');
 }
 async function placeCard(type:string,id:string,where:string){
   const card=askStore.item(type,id);if(!card)throw Error('ASK_ITEM_NOT_FOUND');
   if(where==='library'){askStore.mark(type,id,{book:true});return {id,placed:where};}
   if(where==='board')return garage.add({kind:'note',title:card.title,text:[card.summary,...card.sections.map((s:any)=>s.title+'\n'+s.text)].join('\n\n'),by:'human'});
   if(where==='desktop')setPinnedCards(p=>[...p.filter(c=>c.id!==id),card]);
   else if(where==='background')setCardBackground(card);else throw Error('UNKNOWN_DESTINATION');
   return {id,placed:where};
 }
 async function execute(id:string,args:any={}){
   if(INTAKE_COMMANDS.includes(id))return executeIntake(id,args);
   if(TOOL_COMMANDS.includes(id))return executeTools(id,args);
   if(BILLING_COMMANDS.includes(id))return executeBilling(id,args);
   if(DAY_COMMANDS.includes(id))return executeDay(id,args);
   if(DOC_COMMANDS.includes(id))return executeDocs(id,args);
   if(BAZAAR_COMMANDS.includes(id))return import('../src/spaces/bazaar/commands').then(m=>m.runBazaar(id,args));
   if(SHOP_COMMANDS.includes(id))return import('../src/spaces/shop/commands').then(m=>m.executeShop(id,args));
   if(id==='fast.open'){fastSheet.open();return {opened:'fast'}}
   // One door for the agent: "открой бухгалтерию", "открой сборку сайта", "открой счета"…
   if(id==='portal.open'){const P:any={bazaar:['bazaar','stalls'],marketplace:['bazaar','stalls'],'bazaar.orders':['bazaar','orders'],purchases:['bazaar','orders'],'bazaar.connect':['bazaar','connect'],shop:['shop','admin:home'],admin:['shop','admin:home'],presets:['shop','presets'],gallery:['shop','presets'],'shop.build':['shop','build'],site:['shop','build'],accounting:['shop','admin:money'],wallets:['shop','admin:wallets'],profile:['shop','admin:profile'],hash:['shop','admin:hash'],'ai-publish':['shop','admin:ai'],'my-sites':['shop','admin:sites'],'shop.cash':['shop','cash'],'shop.pack':['shop','pack'],billing:['ws','billing'],invoices:['ws','billing'],day:['ws','day'],estimate:['ws','estimate'],inbox:['ws','inbox'],media:['ws','media'],notebook:['ws','notebook'],sketchbook:['ws','sketchbook'],encyclopedia:['ws','encyclopedia'],workshop:['ws','notebook'],fast:['fast','']};
    const p=P[String(args.place||'').toLowerCase()];if(!p)return {error:'UNKNOWN_PLACE',places:Object.keys(P)};
    if(p[0]==='fast'){fastSheet.open();return {opened:'fast'}}
    if(p[0]==='bazaar'){const d={tab:p[1]};(window as any).__bazaarUiPending=d;window.dispatchEvent(new CustomEvent('bazaar:open'));setTimeout(()=>window.dispatchEvent(new CustomEvent('bazaar:ui',{detail:d})),60);return {opened:args.place,places:Object.keys(P)}}
    if(p[0]==='shop'){const d=p[1].startsWith('admin:')?{admin:p[1].slice(6),view:'admin'}:p[1]==='presets'?{view:'presets'}:{tab:p[1]};(window as any).__shopUiPending=d;window.dispatchEvent(new CustomEvent('shop:open'));setTimeout(()=>window.dispatchEvent(new CustomEvent('shop:ui',{detail:d})),60);return {opened:args.place,places:Object.keys(P),...(p[1].startsWith('admin:')?{note:'Админка открыта. Если на экране вход — admin.unlock (пароль пока заглушка).'}:{})}}
    window.dispatchEvent(new CustomEvent('shop:close'));nativeRooms.open('garage');nativeRooms.select(p[1]);return {opened:args.place,places:Object.keys(P)}}
   if(id==='space.state')return {intake:{assets:intake.list().length,pendingAgent:intake.list().filter(a=>a.agent?.state==='pending'||a.status==='needs-agent').length,batches:batches.list().map(b=>({id:b.id,title:b.title,category:b.category,files:b.assetIds.length,state:b.state}))},room:nativeRooms.get(),context:windowContext.read(),garage:readGarageState(),queries:askStore.queries(),builds:collection().builds.map(b=>({id:b.id,title:b.document.title})),cards:Object.fromEntries(ASK_TYPES.map((x:any)=>[x.id,askStore.items(x.id)]))};
   if(id==='workshop.select')return selectService(args.service);
   if(id==='workshop.size')return nativeRooms.resize(args.size);
   if(id==='workshop.animation')return nativeRooms.animations(args.enabled);
   if(id==='space.delivery'){
     if(args.action==='list')return nativeDelivery.list();
     const parcel=nativeDelivery.list().find(p=>p.id===args.windowId);if(!parcel)throw Error('PARCEL_NOT_FOUND');
     nativeDelivery.open(parcel.id);nativeRooms.openedParcel(parcel.id);return {opened:true,windowId:parcel.id};
   }
   if(id==='ask.open')return openKind(args.type);
   if(id==='ask.query'){
     if(args.queryId&&args.status)askStore.setQuery(args.queryId,args.status,args.note,args.result);
     return args.queryId?askStore.queries().find((q:any)=>q.id===args.queryId):askStore.queries();
   }
   if(id==='ask.search'){
     const w=windowSpec;if(!w)throw Error('OPEN_WINDOW_FIRST');
     return sendCabinetSearch(args.text,w.props.kind,ru,undefined,undefined,w.id,'standalone-adapter');
   }
   if(id==='ask.save'){
     const card=askStore.save(args.type,args.card,args.source||'anthropic',args.itemId);
     if(args.queryId)askStore.setQuery(args.queryId,'done',undefined,{type:args.type,itemId:card.id});
     return card;
   }
   if(id==='scene.create'){
     const b=await deliver(args.provider||'anthropic',args.deliveryId||crypto.randomUUID(),args.document);
     if(args.queryId)askStore.setQuery(args.queryId,'done',undefined,{type:'how',buildId:b.id});
     return {buildId:b.id,title:b.document.title};
   }
   if(id==='ask.openItem'){
     if(!windowSpec||windowSpec.props.kind!==args.type)throw Error('OPEN_MATCHING_WINDOW_FIRST');
     nativeDelivery.open(windowSpec.id);nativeRooms.openedParcel(windowSpec.id);
     return viewCommand('sunrise:ask-open-item',{...args,windowId:windowSpec.id});
   }
   if(id.startsWith('garage.')){
     // Cross-portal favorites/search commands are outside this package.
     if(/add_from_(favorite|result)/.test(id))throw Error('PORTAL_SERVICE_NOT_INCLUDED');
     nativeRooms.open('garage');
     const control=await controlFor('garage');
     return control.execute!(id,args);
   }
   throw Error('COMMAND_NOT_INCLUDED');
 }
 useEffect(()=>{
   (window as any).workshop={execute,state:()=>execute('space.state'),version:'standalone-20261109',transport:'in-page only; not MCP'};
   const receive=(e:any)=>{const q=askStore.queries().find((x:any)=>x.id===e.detail?.queryId);if(!q?.result)return;const type=q.result.type||q.function;const w=openKind(type);setTimeout(()=>{nativeDelivery.open(w.windowId);nativeRooms.openedParcel(w.windowId);void viewCommand('sunrise:ask-open-item',{...q.result,type,windowId:w.windowId})},150)};
   window.addEventListener('sunrise:cab-open-result',receive);return()=>window.removeEventListener('sunrise:cab-open-result',receive);
 });
 const [veil,setVeil]=useState(false),[demoOpen,setDemoOpen]=useState(()=>location.hash==='#demo');
 useEffect(()=>{if(location.hash==='#fast')fastSheet.open()},[]);
 const [shopOpen,setShopOpen]=useState(()=>location.hash==='#shop');
 const [bazaarOpen,setBazaarOpen]=useState(()=>location.hash==='#bazaar');
 useEffect(()=>{const f=()=>{setBazaarOpen(true);setShopOpen(false);nativeRooms.close()},g=()=>setBazaarOpen(false),h=()=>setBazaarOpen(false);window.addEventListener('bazaar:open',f);window.addEventListener('bazaar:close',g);window.addEventListener('shop:open',h);return()=>{window.removeEventListener('bazaar:open',f);window.removeEventListener('bazaar:close',g);window.removeEventListener('shop:open',h)}},[]);
 useEffect(()=>{if(location.hash==='#shop')nativeRooms.close()},[]);
 useEffect(()=>{const f=()=>{setShopOpen(true);nativeRooms.close()},g=()=>setShopOpen(false);window.addEventListener('shop:open',f);window.addEventListener('shop:close',g);return()=>{window.removeEventListener('shop:open',f);window.removeEventListener('shop:close',g)}},[]);
 useEffect(()=>{
   let hide:any=0;
   const hasFiles=(e:DragEvent)=>!!e.dataTransfer&&[...e.dataTransfer.types].includes('Files');
   const local=(t:any)=>t instanceof Element&&!!t.closest('[data-testid=gr-board],.gr-page,.gr-focus,.ik-drop,.fs-veil,.shop-room,.bz-room');
   const over=(e:DragEvent)=>{if(!hasFiles(e))return;e.preventDefault();if(e.dataTransfer)e.dataTransfer.dropEffect='copy';clearTimeout(hide);setVeil(!local(e.target));hide=setTimeout(()=>setVeil(false),180)};
   // Dropped files open the Fast sheet (one question, one result) unless the person works in the Inbox or prefers it.
   const toInbox=()=>dropPref.get()==='inbox'||(nativeRooms.get().active==='garage'&&nativeRooms.get().service==='inbox');
   const route=(files:File[])=>{if(toInbox()){nativeRooms.open('garage');nativeRooms.select('inbox');void ingestMany(files)}else fastSheet.open(files)};
   const drop=(e:DragEvent)=>{setVeil(false);if(e.defaultPrevented||!hasFiles(e))return;e.preventDefault();const files=[...(e.dataTransfer?.files||[])];if(!files.length)return;route(files)};
   const paste=(e:ClipboardEvent)=>{
     const files=[...(e.clipboardData?.files||[])];const t=e.target as Element|null;
     const editable=!!t&&t instanceof Element&&!!t.closest('input,textarea,[contenteditable=true],[contenteditable=""]');
     if(files.length){
       e.preventDefault();
       // In the picture editor a pasted image becomes a movable layer.
       if(nativeRooms.get().service==='media'&&picture.get().doc&&files[0].type.startsWith('image/')){void pasteBlob(files[0]);return;}
       // Pasting a picture while writing attaches it to that notebook page.
       if(t instanceof Element&&t.closest('.gr-page-editor')){void ingestMany(files).then(r=>{for(const a of r.assets)if(a.pages.length&&a.status!=='failed')toNotebook(a.id,{pages:[1],open:false})});return;}
       route(files);return;
     }
     const text=e.clipboardData?.getData('text/plain')||'';
     if(!editable&&text.trim()&&nativeRooms.get().service==='inbox'){e.preventDefault();void ingestText(text.trim())}
   };
   window.addEventListener('dragover',over);window.addEventListener('drop',drop);window.addEventListener('paste',paste);
   return()=>{window.removeEventListener('dragover',over);window.removeEventListener('drop',drop);window.removeEventListener('paste',paste);clearTimeout(hide)};
 },[]);
 const library=windowSpec&&<FrameLanguage><NativeArrival key={windowSpec.id} w={windowSpec}><section className="ps-w" data-id={windowSpec.id}><div className="ps-w-b">
 {windowSpec.props.kind==='how'?<SceneDesk provider={provider} hub={hub} windowId={windowSpec.id} loop={loop} actions={{switchKind:openKind,showBoard:()=>selectService('sketchbook'),open:p=>{setProvider(p);setHub(false)},place,setLoop:patch=>setLoop(l=>patch&&l?{...l,...patch}:undefined)}}/>:<AskBody type={windowSpec.props.kind} ru={ru} windowId={windowSpec.id} onSwitch={openKind} place={place} placeCard={placeCard}/>}
 </div></section></NativeArrival></FrameLanguage>;
 const renderCard=(c:any)=><article className="sa-card"><h2>{c.title}</h2><p>{c.summary}</p>{c.sections.map((s:any,i:number)=><section key={i}><h3>{s.title}</h3><p>{s.text}</p></section>)}</article>;
 return <main className="native-clouds standalone"><div className="sa-background"/><NativeSky/>
 {loop&&<div className="sa-live-background"><Background loop={loop}/><button onClick={()=>setLoop(undefined)}>×</button></div>}
 {cardBackground&&<div className="sa-live-background">{renderCard(cardBackground)}<button onClick={()=>setCardBackground(null)}>×</button></div>}
 {room.active&&<LibraryPresentation.Provider value={{providerHost}}><section className="nc-room nc-workshop" data-testid="native-room-garage"><GarageSpace active embedded library={library} onProviderHost={setProviderHost} onLibrary={()=>openKind()} onClose={()=>nativeRooms.close()}/></section></LibraryPresentation.Provider>}
 {pinned.map(id=><aside className="sa-pinned" key={id}><button onClick={()=>setPinned(p=>p.filter(x=>x!==id))}>×</button><PinnedScene id={id} place={place}/></aside>)}
 {pinnedCards.map(c=><aside className="sa-pinned" key={c.id}><button onClick={()=>setPinnedCards(p=>p.filter(x=>x.id!==c.id))}>×</button>{renderCard(c)}</aside>)}
 {veil&&<div className="ik-veil" aria-hidden="true"><div><b>{dropPref.get()==='inbox'?'⇣':'⚡'}</b><strong>{dropPref.get()==='inbox'?(ru?'Отпустите: файл попадёт в Приёмную':'Drop: the file goes to the Inbox'):(ru?'Отпустите — и выберите, что получить':'Drop, then choose what you want')}</strong><span>{dropPref.get()==='inbox'?(ru?'Распознаю, сконвертирую и спрошу, куда дальше':'I\'ll recognise, convert and ask where next'):(ru?'PDF, JPG, сжать, текст, Word — в один клик':'PDF, JPG, compress, text, Word in one click')}</span></div></div>}
 <FastSheet ru={ru}/>
 {shopOpen&&<Suspense fallback={null}><ShopRoom onClose={()=>setShopOpen(false)}/></Suspense>}
 {bazaarOpen&&<Suspense fallback={null}><BazaarRoom onClose={()=>setBazaarOpen(false)}/></Suspense>}
 <DemoPanel ru={ru} open={demoOpen} onClose={()=>setDemoOpen(false)}/>
 <nav className="nc-dock nc-global-dock"><button onClick={()=>{setShopOpen(false);setBazaarOpen(false);nativeRooms.open('garage')}}>☁ Native Clouds · Workshop</button><button className="sh-dock-btn" data-testid="shop-open" aria-pressed={shopOpen} onClick={()=>{setShopOpen(true);nativeRooms.close()}}>🛍 {ru?'Мой магазин':'My shop'}</button><button className="bz-dock-btn" data-testid="bazaar-open" aria-pressed={bazaarOpen} onClick={()=>{setBazaarOpen(true);setShopOpen(false);nativeRooms.close()}}>🧺 {ru?'Базар':'Bazaar'}</button><button className="fs-dock-btn" data-testid="fast-open" onClick={()=>fastSheet.open()}>⚡ {ru?'Быстро':'Fast'}</button><button className="dm-dock-btn" data-testid="demo-open" aria-expanded={demoOpen} onClick={()=>setDemoOpen(!demoOpen)}>▶ {ru?'Демо':'Demo'}</button><select aria-label="Language" value={lang} onChange={e=>setLang(e.target.value as any)}>{[['ru','RU'],['ka','KA'],['en','EN'],['az','AZ'],['hy','HY'],['tr','TR'],['kk','KK'],['zh','ZH']].map(([id,n])=><option key={id} value={id}>{n}</option>)}</select><button aria-expanded={tools} onClick={()=>setTools(!tools)}>{ru?'Адаптер / JSON':'Adapter / JSON'}</button></nav>
 {tools&&<aside className="nc-tools sa-tools"><header><b>Workshop · standalone</b><button onClick={()=>setTools(false)}>×</button></header><p>{ru?'Это отдельная комната. MCP-сервер и платный Voice сюда не включены. Запрос из поиска ждёт подключаемый адаптер; сам по себе AI не запускается.':'Standalone room. No MCP server or paid Voice. Search queues a request for an adapter; it does not call an AI model.'}</p><p><code>window.workshop.execute(id, args)</code></p><details><summary>{ru?'Буфер запросов':'Request buffer'} · {askStore.queries().length}</summary><pre>{JSON.stringify(askStore.queries(),null,2)}</pre></details><label htmlFor="import-json">{ru?'Импорт ответа агента (JSON)':'Import agent response (JSON)'}</label><textarea id="import-json" rows={7} value={importText} onChange={e=>setImportText(e.target.value)} placeholder={'{"command":"ask.save","args":{"type":"who","card":{...}}}'}/><button onClick={async()=>{try{const x=JSON.parse(importText);const out=[];for(const c of Array.isArray(x)?x:[x])out.push(await execute(c.command,c.args));setMessage(JSON.stringify(Array.isArray(x)?out:out[0],null,2))}catch(e:any){setMessage(e.message)}}}>{ru?'Выполнить импорт':'Apply import'}</button><pre role="status">{message}</pre><small>README.md · HANDOFF-CLAUDE.md</small></aside>}
 </main>;
}
createRoot(document.getElementById('root')!).render(<LangProvider><App/></LangProvider>);
