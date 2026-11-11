import {useEffect,useSyncExternalStore,type ReactNode} from 'react';
import {nativeDelivery,nativeRooms} from '../personal/native-clouds-state';

// Only the embedded Workshop mounts this presentation gate. The original editors
// remain mounted; opening a parcel never creates, clears or copies user pages.
export function WorkshopEntrance({service,ru,children}:{service:string;ru:boolean;children:ReactNode}){
 const room=useSyncExternalStore(nativeRooms.subscribe,nativeRooms.get);
 useSyncExternalStore(nativeDelivery.subscribe,nativeDelivery.revision);
 const entry=room.workshopEntrance?.service===service?room.workshopEntrance:null;
 const id=entry?.id;
 const delivered=!!nativeDelivery.list().find(d=>d.id===id)?.opened;
 const opened=!entry||entry.opened||delivered;
 useEffect(()=>{if(!id)return;nativeDelivery.ensure(id,service);return()=>nativeDelivery.remove(id)},[id,service]);
 useEffect(()=>{if(!id)return;if(entry.opened&&!delivered)nativeDelivery.open(id);else if(delivered&&!entry.opened)nativeRooms.openedParcel(id)},[id,entry?.opened,delivered]);
 const title=service==='notebook'?(ru?'Блокнот':'Notebook'):(ru?'Скетчбук':'Sketchbook');
 return <div className="nw-service-stage" data-delivered={opened} data-testid="nw-service-stage">
   <div className="nw-service-content" aria-hidden={!opened} {...(!opened?{inert:''} as any:{})}>{children}</div>
   {!opened&&<button type="button" className={'nc-courier nw-service-courier nw-courier-'+service} data-testid={'nw-package-'+service} aria-label={(ru?'Открыть посылку: ':'Open your package: ')+title} onClick={()=>{nativeDelivery.open(id);nativeRooms.openedParcel(id)}}>
     <img src={'/native-clouds/'+(service==='notebook'?'entrance-notebook-v2.png':'entrance-sketchbook.png')} alt="" draggable={false}/>
     <span><small>{title}</small>Open your package <b>↗</b></span>
   </button>}
 </div>;
}
