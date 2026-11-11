import {useSyncExternalStore} from 'react';
import {validateScene} from '../../../shared/scene-format.mjs';
import {bicycle} from './bicycle';
export const SCENE_KEY='sunrise.myspace.scenes.v1';
export const SCENE_MIME='application/x-sunrise-scene';
export const names:Record<string,string>={openai:'ChatGPT',xai:'Grok',anthropic:'Anthropic',google:'Gemini'};
export type Part={key:string;label:string;speech:string;x:number;y:number;dx:number;dy:number;turn?:number;art?:string;paths?:{d:string;fill?:string;stroke?:string;width?:number}[];image?:{url:string;width:number;height:number}};
type SceneText={title:string;description?:string;parts:Record<string,{label:string;speech:string}>};
export type Scene={translations?:Record<string,SceneText>;version:number;title:string;description?:string;lang:string;parts:Part[]};
export type Build={id:string;number:number;provider:string;document:Scene;delivery?:string};
type Collection={builds:Build[];saved:string[];inbox:Record<string,string>};
export const demo:Build={id:'sunrise-bicycle-v1',number:1,provider:'openai',document:bicycle};
const initial:Collection={builds:[demo],saved:[],inbox:{openai:demo.id}};
let cachedRaw:string|null=null, cached=initial;
const subs=new Set<()=>void>();
const emit=()=>subs.forEach(f=>f());
export function collection():Collection {
  const raw=localStorage.getItem(SCENE_KEY);
  if(raw!==cachedRaw){const next=raw?JSON.parse(raw):initial;
    if(!Array.isArray(next.builds)||!Array.isArray(next.saved)||!next.inbox)throw Error('INVALID_SCENE_STORAGE');
    cached=next;cachedRaw=raw;
  }
  return cached;
}
window.addEventListener('storage',e=>{if(e.key===SCENE_KEY||e.key===null)emit()});
const subscribe=(f:()=>void)=>{subs.add(f);return ()=>{subs.delete(f)}};
export const useCollection=()=>useSyncExternalStore(subscribe,collection);
function write<T>(fn:(next:Collection)=>T):Promise<T>{
  return navigator.locks.request(SCENE_KEY,()=>{
    const next=structuredClone(collection()), result=fn(next);
    const raw=JSON.stringify(next);
    try{localStorage.setItem(SCENE_KEY,raw)}catch{throw Error('SCENE_STORAGE_FULL_OR_UNAVAILABLE')}
    cachedRaw=raw;cached=next;emit();return result;
  });
}
export function ensureDemo(){return localStorage.getItem(SCENE_KEY)?Promise.resolve():write(()=>undefined)}
export function getBuild(id:string){const b=collection().builds.find(b=>b.id===id);if(!b)throw Error('SCENE_NOT_FOUND');return b}
export function buildInfo(b:Build){return {buildId:b.id,number:b.number,title:b.document.title,provider:b.provider,parts:b.document.parts.map(p=>p.key)}}
export function deliver(provider:string,delivery:string,document:Scene){
  validateScene(document);
  return write(s=>{
    const old=s.builds.find(b=>b.delivery===delivery);if(old)return old;
    const b={id:crypto.randomUUID(),number:s.builds.at(-1)!.number+1,provider,document,delivery};
    s.builds.push(b);s.inbox[provider]=b.id;return b;
  });
}
export function removeBuild(id:string){if(id===demo.id)throw Error('BUILTIN_BUILD');getBuild(id);return write(s=>{s.builds=s.builds.filter(b=>b.id!==id);s.saved=s.saved.filter(x=>x!==id);for(const k of Object.keys(s.inbox))if(s.inbox[k]===id)delete s.inbox[k];return {removed:id}})}
export function bookmark(id:string){getBuild(id);return write(s=>{if(!s.saved.includes(id))s.saved.push(id);return id})}
