// Presentation-only laboratory. Never selected by a public URL or persisted as the user's room.
import {createNativeRooms} from '../../../shared/native-rooms.mjs';
export const nativeRooms=createNativeRooms();
export const nativeClouds = typeof location !== 'undefined' && ['localhost','127.0.0.1','[::1]'].includes(location.hostname) && new URLSearchParams(location.search).get('nativeClouds') === '1';
export const nativeCloudsUrl = () => location.origin + '/?nativeClouds=1#/shop?space=personal';
export const nativeLabAvailable = () => ['localhost','127.0.0.1','[::1]'].includes(location.hostname);
const deliveries = new Map<string, {id:string;kind:string;opened:boolean}>();
const listeners=new Set<()=>void>();let revision=0;
const emit=()=>{revision++;listeners.forEach(fn=>fn())};
export const nativeDelivery={
 subscribe(fn:()=>void){listeners.add(fn);return ()=>{listeners.delete(fn)}},revision:()=>revision,
 list:()=>[...deliveries.values()],
 ensure(id:string,kind:string){if(!deliveries.has(id)){deliveries.set(id,{id,kind,opened:false});emit()}},
 open(id:string){const d=deliveries.get(id);if(!d)throw Error('DELIVERY_NOT_FOUND');d.opened=true;emit();return {...d}},
 remove(id:string){if(deliveries.delete(id))emit()},
};
