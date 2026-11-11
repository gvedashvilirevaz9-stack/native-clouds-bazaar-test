import React,{createContext,useContext,useState,type ReactNode} from 'react';
import {useLang} from '../../hooks/useLang';
import {bicycleEnglish} from './bicycle';
import type {Build,Scene} from './scene-store';
export type FrameLang='en'|'ru';
type Settings={lang:FrameLang;choose:(lang:FrameLang|null)=>void};
export const FrameContext=createContext<Settings|null>(null);
export const useFrame=()=>useContext(FrameContext)!;
export function FrameLanguage({children,value,onChange}:{children:ReactNode;value?:FrameLang;onChange?:(value:FrameLang|null)=>void}){
 const {lang:global}=useLang(),[local,setLocal]=useState<FrameLang|null>(null);
 const override=onChange?value:local;
 return <FrameContext.Provider value={{lang:override||(global==='en'?'en':'ru'),choose:onChange||setLocal}}>{children}</FrameContext.Provider>;
}
const bikeLabels:Record<string,string>={'rear-wheel':'Rear wheel','front-wheel':'Front wheel',frame:'Frame',fork:'Fork',saddle:'Saddle and seatpost',cockpit:'Handlebars and stem',drive:'Chain and sprockets',pedals:'Pedals and cranks'};
export function portableScene(b:Build):Scene{
 const d=b.document;
 if(b.id!=='sunrise-bicycle-v1')return d;
 return {...d,translations:{en:{title:'How a bicycle works',description:'Explore eight parts of a city bicycle. Move the slider, then select a part to hear how it works.',parts:Object.fromEntries(d.parts.map(p=>[p.key,{label:bikeLabels[p.key],speech:bicycleEnglish[p.key]}]))}}};
}
export function present(b:Build,lang:FrameLang):Build{
 const d=portableScene(b),tr=d.translations?.[lang];
 if(d.lang===lang||!tr)return b;
 return {...b,document:{...d,lang,title:tr.title,description:tr.description,parts:d.parts.map(p=>({...p,...tr.parts[p.key]}))}};
}
