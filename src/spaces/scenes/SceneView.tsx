import {windowContext,accepts,viewReceipt} from '../personal/window-context';
import {playLessonPart} from '../persona/speech';
import React,{useEffect,useId,useLayoutEffect,useRef,useState,type ReactNode} from 'react';
import {createPortal} from 'react-dom';
import {SceneVoiceMenu} from './SceneVoiceMenu';
import {present,useFrame} from './SceneLanguage';
import {BikeArt} from './BikeArt';
import {useCollection, type Build,type Part} from './scene-store';
import './scenes.css';

// labstage: viewBox auto-fits the parts at rest AND fully exploded, so nothing flies out of the stage.
export function fitBox(parts:Part[],boxes:Record<string,{x:number;y:number;width:number;height:number}>,pad=24){
  let x0=0,y0=0,x1=800,y1=400;
  for(const p of parts){const b=boxes[p.key];if(!b)continue;
    for(const t of [0,1]){const a=(p.turn||0)*t*Math.PI/180,c=Math.cos(a),sn=Math.sin(a),tx=p.x+p.dx*t,ty=p.y+p.dy*t;
      for(const [u,v] of [[b.x,b.y],[b.x+b.width,b.y],[b.x,b.y+b.height],[b.x+b.width,b.y+b.height]]){const X=tx+u*c-v*sn,Y=ty+u*sn+v*c;x0=Math.min(x0,X);y0=Math.min(y0,Y);x1=Math.max(x1,X);y1=Math.max(y1,Y)}}}
  return [x0-pad,y0-pad,x1-x0+2*pad,y1-y0+2*pad].map(v=>Math.round(v));
}
function Drawing({build,t,selected,onSelect,fit=false}:{build:Build;t:number;selected?:string;onSelect?:(p:Part)=>void;fit?:boolean}){
  const ref=useRef<SVGSVGElement>(null);const [vb,setVb]=useState('0 0 800 400');
  useLayoutEffect(()=>{if(!fit||!ref.current)return;const boxes:Record<string,any>={};
    ref.current.querySelectorAll<SVGGElement>('g[data-part]').forEach(g=>{const inner=g.firstElementChild?g:null;try{const prev=g.getAttribute('transform');g.removeAttribute('transform');const b=(inner as any).getBBox();g.setAttribute('transform',prev||'');if(b.width||b.height)boxes[g.dataset.part!]={x:b.x,y:b.y,width:b.width,height:b.height}}catch{}});
    setVb(fitBox(build.document.parts,boxes).join(' '))},[build.id,fit]);
  return <svg ref={ref} className="hiw-drawing" viewBox={fit?vb:'0 0 800 400'} preserveAspectRatio="xMidYMid meet" role={onSelect?'group':'img'} aria-label={build.document.title}>
    {build.document.parts.map(p=><g key={p.key} data-part={p.key} className={p.key===selected?'hiw-selected':''}
      transform={`translate(${p.x+p.dx*t} ${p.y+p.dy*t}) rotate(${(p.turn||0)*t})`}
      role={onSelect?'button':undefined} tabIndex={onSelect?0:undefined} aria-label={p.label} aria-pressed={onSelect?p.key===selected:undefined}
      onClick={onSelect?()=>onSelect(p):undefined} onKeyDown={onSelect?e=>{if(e.key==='Enter'||e.key===' '){e.preventDefault();onSelect(p)}}:undefined}>
      {p.art?<BikeArt art={p.art}/>:p.image?<image href={p.image.url} width={p.image.width} height={p.image.height}/>:p.paths?.map((g,i)=><path key={i} d={g.d} fill={g.fill||'none'} stroke={g.stroke||(!g.fill?'#286f66':undefined)} strokeWidth={g.width??2} strokeLinejoin="round" strokeLinecap="round"/>)}
    </g>)}
  </svg>
}
// labbg: paper overlays (CSS patterns, not per scene) + light/dark theme, persisted.
export const PAPERS=['dots','lines','grid','mm','blank'] as const;export type Paper=typeof PAPERS[number];
const PK='sunrise.scene.paper.v1';
function readPaper():{paper:Paper;theme:'light'|'dark'}{try{const v=JSON.parse(localStorage.getItem(PK)||'{}');return {paper:PAPERS.includes(v.paper)?v.paper:'dots',theme:'light'}}catch{return {paper:'dots',theme:'light'}}}
function usePaper(){const [v,setV]=useState(readPaper);useEffect(()=>{const on=()=>setV(readPaper());window.addEventListener('sunrise:scene-paper',on);return ()=>window.removeEventListener('sunrise:scene-paper',on)},[]);
  return [v,(n:Partial<{paper:Paper;theme:'light'|'dark'}>)=>{localStorage.setItem(PK,JSON.stringify({...readPaper(),...n}));window.dispatchEvent(new Event('sunrise:scene-paper'))}] as const}
function PaperSwitch({ru}:{ru:boolean}){const [v,set]=usePaper();
  const L:Record<Paper,[string,string]>={dots:['Точки','Dots'],lines:['Линейка','Lines'],grid:['Клетка','Grid'],mm:['Миллиметровка','Millimetre'],blank:['Пусто','Blank']};
  return <div className="hiw-paper-switch" data-testid="scene-paper" role="group" aria-label={ru?'Фон':'Background'}>
    {PAPERS.map(p=><button key={p} aria-pressed={v.paper===p} onClick={()=>set({paper:p})}>{L[p][ru?0:1]}</button>)}
    </div>}
export type Loop={id:string;seconds:number;reverse:boolean;paused:boolean};
export function Background({loop}:{loop:Loop}){
  const build=useCollection().builds.find(b=>b.id===loop.id);
  const [t,setT]=useState(0);const phase=useRef(0);
  useEffect(()=>{if(loop.paused)return;let raf=0,last=0;
    function frame(now:number){if(last)phase.current=(phase.current+(loop.reverse?-1:1)*Math.min(now-last,100)/(1000*loop.seconds)+1)%1;
      last=now;setT((1-Math.cos(phase.current*2*Math.PI))/2);raf=requestAnimationFrame(frame)}
    raf=requestAnimationFrame(frame);return ()=>cancelAnimationFrame(raf);
  },[loop.seconds,loop.reverse,loop.paused]);
  return build?<div data-portal-surface="decoration" className="hiw-background" aria-hidden="true" data-testid="scene-background" data-phase={t.toFixed(3)}><Drawing build={build} t={t}/></div>:null;
}
export function SceneView({build:original,bare=false,header=true,children,windowId}:{windowId?:string;build:Build;bare?:boolean;header?:boolean;children?:ReactNode}){
  const [full,setFull]=useState(false);const [paper]=usePaper();
  useEffect(()=>{const on=(e:any)=>{if(e.detail?.source!=='stage')setFull(!!e.detail?.on)};window.addEventListener('sunrise:scene-full',on);return ()=>window.removeEventListener('sunrise:scene-full',on)},[]);
  useEffect(()=>{if(full)window.dispatchEvent(new CustomEvent('sunrise:scene-full',{detail:{on:true,source:'stage'}}))},[full]);
  useEffect(()=>{if(!full)return;const k=(e:KeyboardEvent)=>{if(e.key==='Escape')setFull(false)};window.addEventListener('keydown',k);return ()=>window.removeEventListener('keydown',k)},[full]);
  const {lang}=useFrame(),ru=lang==='ru',build=present(original,lang),language=build.document.lang;
  const [amount,setAmount]=useState(0),[key,setKey]=useState(''),[error,setError]=useState('');const owner='hiw-'+useId();
  const selected=build.document.parts.find(p=>p.key===key);
  const player=()=>(window as any).PORTAL_SPEECH;
  useEffect(()=>{setError('');const p=player();const unsub=p?.subscribe((s:any)=>{if(s.owner===owner&&s.phase==='error')setError(s.error||'TTS_UNAVAILABLE')});return()=>{unsub?.();p?.stop(owner)}},[owner,build.id,language,lang]);
  const select=(p:Part)=>{setKey(p.key);setError('');const engine=player();
    if(!engine?.snapshot().supported){setError('TTS_UNAVAILABLE');return}
    if(!playLessonPart(p.speech,owner,owner+'-'+language+'-'+p.key,p.label,language)){setError(engine.snapshot().error||'TTS_UNAVAILABLE')}
  };
  useEffect(()=>{const on=(e:any)=>{const d=e.detail||{};if(d.type!=='how'||d.itemId!==build.id||!accepts(d,windowId))return;
    const p=player(),action=d.action||'play',parts=build.document.parts;let n=parts.findIndex(x=>x.key===key);
    if(action==='stop')p?.stop(owner);else if(action==='pause')p?.pause();else if(action==='resume')p?.resume();
    else {if(action==='next')n++;else if(action==='prev')n--;if(n<0)n=0;if(n>=parts.length)n=parts.length-1;if(parts[n])select(parts[n]);}
    viewReceipt(d,{accepted:true,windowId,itemId:build.id,action,part:parts[n]?.key||null});
  };window.addEventListener('sunrise:ask-play',on);return()=>window.removeEventListener('sunrise:ask-play',on)},[windowId,build.id,key,language]);
  useEffect(()=>{const on=(e:any)=>{const d=e.detail||{};if(d.type==='how'&&d.buildId===build.id&&accepts(d,windowId))requestAnimationFrame(()=>viewReceipt(d,{selected:true,windowId,itemId:build.id}))};window.addEventListener('sunrise:ask-open-item',on);return()=>window.removeEventListener('sunrise:ask-open-item',on)},[windowId,build.id]);
  useEffect(()=>{if(windowId)windowContext.select(windowId,{kind:'build',itemId:build.id,number:build.number,title:build.document.title,part:key||null})},[windowId,build.id,key]);
  const stage=(immersive:boolean)=><>
    <div className={'hiw-figure'+(immersive?' hiw-figure-full':'')} data-paper={paper.paper} data-theme={paper.theme}><Drawing fit build={build} t={amount/100} selected={key} onSelect={select}/><small>FIG. {String(build.number).padStart(2,'0')} / {build.document.parts.length} {ru?'узл.':'parts'}</small>
      {immersive&&<button className="hiw-expand" data-testid="scene-collapse" onClick={()=>setFull(false)} aria-label={ru?'Свернуть':'Close'}>✕</button>}{immersive&&<PaperSwitch ru={ru}/>}{immersive?null
      :<button className="hiw-expand" data-testid="scene-expand" onClick={()=>setFull(true)}>⤢ {ru?'Раскрыть':'Expand'}</button>}</div>
    <label className="hiw-slider"><span>{ru?'В сборе':'Assembled'}</span><input aria-label={ru?'Раздвинуть детали':'Separate parts'} type="range" min="0" max="100" value={amount} onChange={e=>setAmount(+e.target.value)}/><b>{amount}%</b><span>{ru?'Разобрано':'Exploded'}</span></label>
    <div className="hiw-parts">{build.document.parts.map((p,i)=><button key={p.key} aria-pressed={key===p.key} onClick={()=>select(p)}>{String(i+1).padStart(2,'0')} · {p.label}</button>)}</div>
    <div className="hiw-caption" aria-live="polite">{selected?<><strong>{selected.label}</strong> {selected.speech} <button onClick={()=>player()?.stop(owner)}>■ {ru?'Стоп':'Stop'}</button></>:build.document.description||(ru?'Выберите деталь, чтобы услышать объяснение.':'Choose a part to hear its explanation.')}{error&&<small role="status">{error==='RUSSIAN_NATURAL_VOICE_UNAVAILABLE'?(ru?'Для выбранного русского голоса нужен браузер с Microsoft Natural.':'This Russian voice requires Microsoft Natural in this browser.'):(ru?'Озвучка недоступна.':'Speech is unavailable.')}</small>}</div></>;
  return <section className={'hiw-view hiw-stageframe'+(bare?' hiw-bare':'')} data-testid="scene-view" data-build={build.id} lang={lang}>
    {header&&<div className="hiw-local-voice"><SceneVoiceMenu speechLang={language}/></div>}
    <div className="hiw-eyebrow">SUNRISE LAB <i/> {ru?'ИНТЕРАКТИВНЫЙ АТЛАС':'INTERACTIVE ATLAS'} <span>№ {String(build.number).padStart(4,'0')}</span></div>
    {language!==lang&&<small>{ru?'Оригинал материала':'Original content'} · {language.toUpperCase()}</small>}
    <h2>{build.document.title}</h2>
    {full?<div className="hiw-figure hiw-figure-placeholder">{ru?'Открыто на весь экран · Esc — свернуть':'Open fullscreen · Esc to close'}</div>:stage(false)}
    {children}
    {full&&createPortal(<div className="hiw-immersive" data-theme={paper.theme} role="dialog" aria-modal="true" aria-label={build.document.title} data-testid="scene-immersive" lang={lang}><h2>{build.document.title}</h2>{stage(true)}</div>,document.body)}
  </section>
}
