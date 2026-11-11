import {windowContext,accepts,viewReceipt} from './window-context';
// Grok 2026-11-04 (cardtts): read-aloud player inside an ask card + ▶ YouTube.
// Reuses the portal voice via persona/speech.speak (same owner as AI Persona → the visible avatar moves its lips).
// The spoken word is underlined from the voice's boundary cues; without cues the whole current section is highlighted.
import {useEffect,useMemo,useRef,useState} from 'react';
import {speak,stopSpeak} from '../persona/speech';
import {portalVoice} from '../../components/portalVoice';
// cardmap: ▶ YouTube only on howto / choose / how cards (not who/what); where cards get 🗺 Карта + a mini map when card.geo is known.
export const SHOW_CARD_YOUTUBE=true;
export const CARD_YOUTUBE_TYPES=['howto','choose','how'];
import {cardChunks,cardLang,wordAt} from './card-reader.mjs';

export function CardRead({cur,ru,type,windowId}:{windowId?:string;cur:any;ru:boolean;type:string}){
  const chunks=useMemo(()=>cardChunks(cur),[cur]);const lang=cardLang(cur);
  const [i,setI]=useState(-1),[phase,setPhase]=useState<'idle'|'playing'|'paused'>('idle'),[cue,setCue]=useState<{seg:number;off:number}|null>(null),[yt,setYt]=useState('');
  const rid=useRef('ask-read-'+Math.random().toString(36).slice(2,8));const iRef=useRef(-1);const root=useRef<HTMLDivElement>(null);
  const total=chunks.reduce((n:number,c:any)=>n+c.len,0)||1;
  const play=(n:number)=>{const c=chunks[n];if(!c){stop();return}iRef.current=n;setI(n);setCue(null);setPhase('playing');
    const r=speak(c.speak,{lang,itemId:rid.current+':'+n,onCue:(o:number)=>{if(iRef.current!==n)return;const d=o-c.pre;if(d>=0&&d<c.len)setCue({seg:c.seg,off:c.base+d})}});
    if(!r.spoken&&r.reason==='NO_TTS'){setPhase('idle');iRef.current=-1;setI(-1)}};
  const stop=()=>{iRef.current=-1;setI(-1);setCue(null);setPhase('idle');stopSpeak()};
  useEffect(()=>{const p=portalVoice();if(!p)return;return p.subscribe((s:any)=>{const n=iRef.current;if(n<0||s.itemId!==rid.current+':'+n)return;
    if(s.phase==='ended')play(n+1);else if(s.phase==='error')stop();else if(s.phase==='paused')setPhase('paused');else if(s.phase==='playing')setPhase('playing')})},[chunks]);
  useEffect(()=>()=>{if(iRef.current>=0)stopSpeak()},[]);
  useEffect(()=>{const w:any=window;if(phase!=='idle')w.__sunriseCardReader={type,itemId:cur?.id,phase};else if(w.__sunriseCardReader?.itemId===cur?.id)w.__sunriseCardReader=null;return()=>{if(w.__sunriseCardReader?.itemId===cur?.id)w.__sunriseCardReader=null}},[phase,cur?.id]);
  useEffect(()=>{if(iRef.current>=0)stop()},[cur?.id,cur?.title]);
  useEffect(()=>{windowContext.select(windowId,{kind:'card',itemId:cur.id,number:cur.number,title:cur.title,player:{phase,section:i}})},[windowId,cur.id,phase,i]);
  const seg=i>=0?chunks[i]?.seg:-1;
  const segStart=(s:number)=>chunks.findIndex((c:any)=>c.seg===s);
  const seek=(dir:number)=>{if(i<0){play(0);return}const segs=[...new Set(chunks.map((c:any)=>c.seg))] as number[];const k=segs.indexOf(seg)+dir;if(k<0){play(0);return}if(k>=segs.length){stop();return}play(segStart(segs[k]))};
  const toggle=()=>{const p=portalVoice();if(phase==='playing'){p?.pause();setPhase('paused')}else if(phase==='paused'){p?.resume();setPhase('playing')}else play(0)};
  useEffect(()=>{const on=(e:any)=>{const d=e.detail||{};if(d.type!==type||d.itemId!==cur?.id||!accepts(d,windowId))return;const a=d.action||'play';
    if(a==='play')play(0);else if(a==='pause'&&phase==='playing')toggle();else if(a==='resume'&&phase==='paused')toggle();else if(a==='stop')stop();else if(a==='next')seek(1);else if(a==='prev')seek(-1);viewReceipt(d,{accepted:true,windowId,itemId:cur.id,action:a})};
    window.addEventListener('sunrise:ask-play',on);return()=>window.removeEventListener('sunrise:ask-play',on)});
  const done=i>=0?chunks.slice(0,i).reduce((n:number,c:any)=>n+c.len,0)+(cue&&chunks[i]?Math.max(0,cue.off-chunks[i].base):0):0;
  useEffect(()=>{const el=root.current?.querySelector(cue?'.ask-word':'.ask-reading');if(!el)return;const r=el.getBoundingClientRect();if(r.top<60||r.bottom>innerHeight-40)el.scrollIntoView({block:'center',behavior:'smooth'})},[seg,cue?.off]);
  const video=()=>{setYt('…');const parentId=(root.current?.closest('.ps-w[data-id]') as HTMLElement|null)?.dataset.id;
    window.dispatchEvent(new CustomEvent('sunrise:ask-youtube',{detail:{card:cur,parentId,onError:(m:string)=>setYt(m==='NO_VIDEO'?(ru?'видео не найдено':'no video'):m)}}));setTimeout(()=>setYt(y=>y==='…'?'':y),6000)};
  const showYt=SHOW_CARD_YOUTUBE&&CARD_YOUTUBE_TYPES.includes(type);const geo:any=type==='where'?(cur?.geo||null):null;
  const openMap=()=>{const parentId=(root.current?.closest('.ps-w[data-id]') as HTMLElement|null)?.dataset.id;window.dispatchEvent(new CustomEvent('sunrise:ask-map',{detail:{card:cur,geo,parentId,onError:(m:string)=>setYt(m==='NO_PLACE'?(ru?'место не указано':'no place'):m)}}))};
  const text=(s:number,t:string)=>{if(seg!==s||!cue)return t;const w=wordAt(t,cue.off);if(!w)return t;return <>{t.slice(0,w[0])}<u className="ask-word">{t.slice(w[0],w[1])}</u>{t.slice(w[1])}</>};
  return <div ref={root} className="ask-read-wrap">
    <div className="ask-player" data-testid="ask-player" role="group" aria-label={ru?'Озвучка карточки':'Read aloud'}>
      <button type="button" onClick={()=>seek(-1)} title={ru?'Предыдущий раздел':'Previous section'} data-testid="ask-play-prev">⏪</button>
      <button type="button" onClick={toggle} data-testid="ask-play" title={phase==='playing'?(ru?'Пауза':'Pause'):(ru?'Слушать':'Play')}>{phase==='playing'?'⏸':'▶'}</button>
      <button type="button" onClick={()=>seek(1)} title={ru?'Следующий раздел':'Next section'} data-testid="ask-play-next">⏩</button>
      {phase!=='idle'&&<button type="button" onClick={stop} title={ru?'Стоп':'Stop'}>⏹</button>}
      <span className="ask-prog" aria-hidden><i style={{width:Math.min(100,Math.round(done/total*100))+'%'}}/></span>
      <small>{phase==='idle'?(ru?'Слушать карточку':'Listen'):(seg===0?(ru?'Начало':'Intro'):(cur.sections[seg-1]?.title||''))}</small>
      {showYt&&<button type="button" className="ask-yt" onClick={video} data-testid="ask-youtube" title={ru?'Видео по теме в окне V':'Video in the V window'}>▶ YouTube</button>}{showYt&&yt&&<small>{yt}</small>}{geo&&<button type="button" className="ask-yt ask-map" onClick={openMap} data-testid="ask-map" title={ru?'Открыть карту поверх окна':'Open the map above the window'}>🗺 {ru?'Карта':'Map'}</button>}{!showYt&&yt&&<small>{yt}</small>}
    </div>
    <h3>№ {cur.number} · {cur.title}</h3>{cur.summary&&<p className={'ask-sum'+(seg===0?' ask-reading':'')}>{text(0,cur.summary)}</p>}
    {cur.sections.map((s:any,n:number)=><section key={n} className={seg===n+1?'ask-reading':''}><h4>{s.title}</h4><p>{text(n+1,s.text)}</p>{s.images?.map((u:string)=><img key={u} src={u} alt="" loading="lazy" referrerPolicy="no-referrer"/>)}</section>)}
  </div>;
}
