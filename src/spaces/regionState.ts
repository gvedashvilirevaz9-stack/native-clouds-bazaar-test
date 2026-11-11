import {regions,validCountry} from '../../shared/corridor.mjs';
import {traceCountry} from '../../shared/region-hint.mjs';
const key='sunrise.lab.corridor.v1',event='sunrise:lab-region';
export const isLab=()=>['127.0.0.1','localhost','[::1]'].includes(window.location.hostname);
export function getLabCountry(){try{return isLab()?validCountry(sessionStorage.getItem(key))||'':''}catch{return ''}}
export function selectLabCountry(value:string){if(!isLab())return;const cc=validCountry(value);try{if(cc)sessionStorage.setItem(key,cc);else sessionStorage.removeItem(key)}catch{}window.dispatchEvent(new Event(event));}
export function regionHeaders():Record<string,string>{const cc=getLabCountry();return cc?{'x-sunrise-lab-country':cc}:ip?.source==='browser-hint'&&ip.cc?{'x-sunrise-country-hint':ip.cc}:{}}
export function subscribeRegion(fn:()=>void){window.addEventListener(event,fn);return ()=>window.removeEventListener(event,fn);}
let ip:{cc?:string,city?:string,lab?:boolean,source?:string}|null=null, until=0, pending:Promise<any>|undefined;
export const ipRegion=()=>ip;
export const effectiveCountry=()=>getLabCountry()||ip?.cc||'';
export const effectiveCity=()=>regions[getLabCountry()]?.city||ip?.city||regions[ip?.cc||'']?.city||'';
export function loadRegion(){if(pending)return pending;if(ip&&Date.now()<until)return Promise.resolve(ip);
 pending=fetch('/api/market/region',{cache:'no-store',signal:AbortSignal.timeout(5000)}).then(r=>r.ok?r.json():null).catch(()=>null).then(async v=>{
   if(!v?.cc&&!isLab()){
     try{const r=await fetch('/cdn-cgi/trace',{cache:'no-store',signal:AbortSignal.timeout(2500)});const cc=r.ok?traceCountry(await r.text()):null;if(cc)v={...v,cc,source:'browser-hint'};}catch{}
   }
   ip=v;until=Date.now()+(v?.cc?900000:30000);window.dispatchEvent(new Event(event));return v;
 }).finally(()=>{pending=undefined});return pending;
}
