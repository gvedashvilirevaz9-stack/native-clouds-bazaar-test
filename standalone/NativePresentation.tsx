import React,{useEffect,useLayoutEffect,useRef,useSyncExternalStore} from 'react';
import {courierFor} from '../shared/native-clouds.mjs';
import {nativeDelivery,nativeRooms} from '../src/spaces/personal/native-clouds-state';
import {nativeLibraryInstant} from '../shared/native-rooms.mjs';
const clouds=[
 {x:3,y:8,w:36,depth:'high',time:91,delay:-28},{x:66,y:4,w:29,depth:'high',time:113,delay:-57},
 {x:-7,y:36,w:44,depth:'middle',time:73,delay:-18},{x:65,y:37,w:43,depth:'middle',time:97,delay:-69},
 {x:-13,y:77,w:59,depth:'low',time:127,delay:-38},{x:57,y:72,w:62,depth:'low',time:137,delay:-94},
];
export function NativeSky(){return <div className="nc-sky" data-portal-surface="decoration" aria-hidden="true">
 <div className="nc-horizon"/>{clouds.map((c,i)=><img key={i} data-cloud={i} data-depth={c.depth} className="nc-cloud" src="/native-clouds/cloud.png" alt="" draggable={false} style={{left:c.x+'%',top:c.y+'%',width:c.w+'%',animationDuration:c.time+'s',animationDelay:c.delay+'s'} as React.CSSProperties}/>)}
 </div>}

export function NativeArrival({w,children}:{w:any;children:React.ReactNode}){
 const ref=useRef<HTMLDivElement>(null),ship=courierFor(w);
 const parcelOrigin=useRef<{x:number;y:number}|null>(null);
 const rememberParcel=(el:HTMLElement)=>{const r=el.getBoundingClientRect();parcelOrigin.current={x:r.left+r.width/2,y:r.top+r.height/2}};
 useSyncExternalStore(nativeDelivery.subscribe,nativeDelivery.revision);
 const room=useSyncExternalStore(nativeRooms.subscribe,nativeRooms.get),instant=nativeLibraryInstant(room,w.id);
 const delivered=!!nativeDelivery.list().find(d=>d.id===w.id)?.opened;
 const opened=!ship||instant||delivered;
 useEffect(()=>{if(ship)nativeDelivery.ensure(w.id,ship);return ()=>nativeDelivery.remove(w.id)},[w.id,ship]);
 useEffect(()=>{if(ship&&instant&&!delivered)nativeDelivery.open(w.id);if(ship&&delivered)nativeRooms.openedParcel(w.id)},[w.id,ship,instant,delivered]);
 useLayoutEffect(()=>{
   if(!opened||w.type==='avatar')return;
   const frame=ref.current?.querySelector<HTMLElement>('.ps-w');if(!frame)return;
   // Measure the resting rectangle, not the first scaled animation frame.
   frame.style.animation='none';
   const r=frame.getBoundingClientRect(),x=r.left+r.width/2,y=r.top+r.height/2;
   const candidates=[...document.querySelectorAll<HTMLElement>('[data-cloud]')].map(el=>{const b=el.getBoundingClientRect();return {x:b.left+b.width/2,y:b.top+b.height/2}});
   const source=(ship&&parcelOrigin.current)||candidates.sort((a,b)=>Math.hypot(a.x-x,a.y-y)-Math.hypot(b.x-x,b.y-y))[0]||{x,y};
   frame.style.setProperty('--nc-from-x',(source.x-x)+'px');frame.style.setProperty('--nc-from-y',(source.y-y)+'px');
   frame.style.animation='';
 },[opened,w.id]);
 return <div ref={ref} className="nc-arrival" data-delivered={opened} data-arrival-motion={instant?'off':'on'}>
   {children}
   {ship&&!opened&&<button className={'nc-courier nc-courier-'+ship} style={{left:({library:7,manta:36,sail:65} as any)[ship]+'%',top:'20%'}} onAnimationEnd={e=>rememberParcel(e.currentTarget)} onClick={e=>{rememberParcel(e.currentTarget);nativeDelivery.open(w.id)}} aria-label={'Open your package: '+(w.props.title||w.props.kind||'How it works')}>
     <img src={'/native-clouds/courier-'+ship+'.png'} alt="" draggable={false}/><span><small>{w.props.title||({who:'Кто это такой',where:'Где это находится',how:'Как это работает'} as any)[w.props.kind]||'Как это работает'}</small>Open your package <b>↗</b></span>
   </button>}
 </div>;
}


