import {useSyncExternalStore} from 'react';
import {createCommunicationStore} from './model.mjs';
let storage:Storage|null=null;try{storage=window.sessionStorage;}catch{}
export const communication=createCommunicationStore({storage});
export const useCommunication=()=>useSyncExternalStore(communication.subscribe,communication.snapshot);
export const notifyError=(text:string,source='Sunrise')=>communication.add({text:String(text).slice(0,1800),role:'system',kind:'error',source});
