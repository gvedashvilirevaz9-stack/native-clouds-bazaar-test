// Shared application controls. MCP never clicks DOM nodes or starts speech recognition.
import {useSyncExternalStore} from 'react';
import {notifyError} from '../communication/store';
import type {SpaceAdapter} from '../spaceAdapter';
export type Control = {read:()=>any; search?:(q:string)=>Promise<any>; execute?:(id:string,args:any)=>Promise<any>|any};
const controls=new Map<string,Control>();
export function registerControl(id:string,control:Control){controls.set(id,control);return()=>{if(controls.get(id)===control)controls.delete(id);};}
export async function waitFor<T>(read:()=>T|undefined|false,timeout=12000):Promise<T>{
 const until=Date.now()+timeout;
 for(;;){const value=read();if(value!==undefined&&value!==false)return value as T;if(Date.now()>=until)throw new Error('CONTENT_NOT_READY');await new Promise(r=>setTimeout(r,60));}
}
export const controlFor=(id:string,ready=false)=>waitFor(()=>{const c=controls.get(id);return c&&(!ready||c.read().ready)?c:undefined;});
export const readControl=(id:string)=>controls.get(id)?.read()||{ready:false};
type Search={query:string;submittedQuery?:string;status:'idle'|'running'|'complete'|'failed';result?:any;error?:string};
const empty:Search={query:'',status:'idle'}, searches=new Map<string,Search>(),listeners=new Set<()=>void>();
const emit=()=>listeners.forEach(fn=>fn());
export const searchState=(id:string)=>searches.get(id)||empty;
export function setSearchText(id:string,query:string){searches.set(id,{...searchState(id),query});emit();}
export function useSearchState(id:string){return useSyncExternalStore(cb=>{listeners.add(cb);return()=>{listeners.delete(cb);};},()=>searchState(id));}
export async function runSearch(space:SpaceAdapter,query:string){
 const q=query.trim();if(!q||q.length>300)throw new Error('INVALID_QUERY');
 if(searchState(space.id).status==='running')throw new Error('SEARCH_BUSY');
 searches.set(space.id,{query:q,submittedQuery:q,status:'running'});emit();
 try{const result=await space.route(q);searches.set(space.id,{query:q,submittedQuery:q,status:'complete',result});emit();return result;}
 catch(e){notifyError(String((e as Error).message),space.id);searches.set(space.id,{query:q,submittedQuery:q,status:'failed',error:String((e as Error).message).slice(0,160)});emit();throw e;}
}
