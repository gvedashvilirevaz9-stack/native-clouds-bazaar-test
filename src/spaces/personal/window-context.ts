import {createWindowContext} from '../../../shared/myspace-layers.mjs';
export const windowContext=createWindowContext();
// A receipt is emitted by the addressed mounted view, never by a timeout.
export function viewCommand(name:string,detail:any):Promise<any>{
 const requestId=crypto.randomUUID();
 return new Promise((resolve,reject)=>{
  let retry:ReturnType<typeof setInterval>|undefined;
  const done=(e:any)=>{if(e.detail?.requestId===requestId)finish(e.detail.result,e.detail.error)};
  function finish(result:any,error?:string){clearTimeout(timer);clearInterval(retry);window.removeEventListener('sunrise:window-receipt',done);error?reject(Error(error)):resolve(result)}
  const timer=setTimeout(()=>finish(null,'WINDOW_VIEW_TIMEOUT'),2500);
  window.addEventListener('sunrise:window-receipt',done);
  const send=()=>window.dispatchEvent(new CustomEvent(name,{detail:{...detail,requestId}}));
  retry=setInterval(send,80);send();
 });
}
const seen=new Set<string>();
export function accepts(d:any,windowId?:string){if(!windowId||d?.windowId!==windowId)return false;if(d.requestId&&seen.has(d.requestId))return false;return true;}
export function viewReceipt(d:any,result:any,error?:string){if(!d?.requestId)return;seen.add(d.requestId);if(seen.size>500)seen.delete(seen.values().next().value!);window.dispatchEvent(new CustomEvent('sunrise:window-receipt',{detail:{requestId:d.requestId,result,error}}));}
