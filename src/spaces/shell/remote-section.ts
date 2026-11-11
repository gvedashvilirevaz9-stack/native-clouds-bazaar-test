import {useLayoutEffect,useSyncExternalStore} from 'react';
export type SectionState={selected:string;count?:number};
const states=new Map<string,SectionState>();
const listeners=new Set<()=>void>();
const notify=()=>listeners.forEach(fn=>fn());
export const readRemoteSection=(space:string)=>states.get(space)||null;
function subscribe(listener:()=>void){listeners.add(listener);return ()=>{listeners.delete(listener);};}
export const useRemoteSection=(space:string)=>useSyncExternalStore(subscribe,()=>readRemoteSection(space));
// Each mounted Space publishes only its navigation state, without including search results or private content.
export function usePublishRemoteSection(space:string,selected:string,count?:number,active=true){
  useLayoutEffect(()=>{
    if(!active)return;
    const value={selected,count};states.set(space,value);notify();
    return ()=>{if(states.get(space)===value){states.delete(space);notify();}};
  },[space,selected,count,active]);
}
