// Presentation context, never an access grant. Only Native Clouds instantiates this store.
export const WORKSHOP_SERVICES = [
 {id:'inbox',ru:'Приёмная',en:'Inbox',icon:'⇣'},
 {id:'notebook',ru:'Блокнот',en:'Notebook',icon:'✎'},
 {id:'sketchbook',ru:'Скетчбук',en:'Sketchbook',icon:'▦'},
 {id:'encyclopedia',ru:'Энциклопедия',en:'Encyclopedia',icon:'◈'},
 {id:'media',ru:'Медиа',en:'Media',icon:'◐'},
 {id:'estimate',ru:'Смета',en:'Estimate',icon:'Σ'},
 {id:'billing',ru:'Счета',en:'Billing',icon:'¤'},
 {id:'day',ru:'День',en:'Day',icon:'◷'},
];
export const NATIVE_ROOMS = [
 {id:'home',title:'My Home Space',aliases:['Home Room','Home Space','Home Place'],sections:['food','cinema','series','music','books']},
 {id:'garage',title:'Мастерская · Workshop',aliases:['Garage Room','Workshop','Мастерская'],sections:WORKSHOP_SERVICES.map(s=>s.id)},
];
export function createNativeRooms(){
 let state={active:null,focused:false,version:0,service:'notebook',size:'normal',workshopEntrance:null,libraryWindowId:null,libraryWindows:[],libraryAnimations:true,libraryEntered:false,libraryEntranceId:null,libraryEntrancePending:false};const listeners=new Set();
 let entranceSequence=0;
 const entrance=service=>['encyclopedia','inbox','media','estimate','billing','day'].includes(service)?null:{id:`workshop-${service}-${++entranceSequence}`,service,opened:false};
 const update=patch=>{if(Object.entries(patch).every(([k,v])=>state[k]===v))return state;state={...state,...patch,version:state.version+1};listeners.forEach(fn=>fn());return state;};
 return {get:()=>state,subscribe:fn=>{listeners.add(fn);return()=>listeners.delete(fn)},
  open(id='home'){if(!NATIVE_ROOMS.some(r=>r.id===id))throw Error('NATIVE_ROOM_NOT_AVAILABLE');return update({active:id,focused:true,...(id!==state.active?{workshopEntrance:id==='garage'?entrance(state.service):null,libraryEntered:false,libraryEntrancePending:id==='garage'&&state.service==='encyclopedia',libraryEntranceId:state.libraryWindowId}:{})})},
  select(service){if(!WORKSHOP_SERVICES.some(s=>s.id===service))throw Error('NATIVE_SERVICE_NOT_AVAILABLE');return update({service,focused:true,...(service!==state.service?{workshopEntrance:state.active==='garage'?entrance(service):null}:{}),...(service!=='encyclopedia'?{libraryEntered:false,libraryEntrancePending:false}:{})})},
  revealService(service){this.select(service);if(state.active==='garage'&&state.workshopEntrance&&!state.workshopEntrance.opened)return update({workshopEntrance:{...state.workshopEntrance,opened:true}});return state},
  resize(size){if(!['normal','wide','full'].includes(size))throw Error('NATIVE_ROOM_SIZE_INVALID');return update({size})},
  adoptWindow(id){if(state.active!=='garage')return state;return update({service:'encyclopedia',workshopEntrance:null,libraryWindowId:id,libraryWindows:state.libraryWindows.includes(id)?state.libraryWindows:[...state.libraryWindows,id],focused:false,...(!state.libraryEntered?{libraryEntered:true,libraryEntranceId:id,libraryEntrancePending:true}:{})})},
  animations(enabled){return update({libraryAnimations:!!enabled})},
  openedParcel(id){if(state.active!=='garage')return state;if(state.workshopEntrance?.id===id&&!state.workshopEntrance.opened)return update({workshopEntrance:{...state.workshopEntrance,opened:true}});if(state.libraryEntranceId===id)return update({libraryEntered:true,libraryEntrancePending:false});return state},
  close(){return update({active:null,focused:false,size:'normal',workshopEntrance:null,libraryEntered:false,libraryEntrancePending:false})},focus(){if(state.active)return update({focused:true});return state},blur(){return update({focused:false})}};
}
// Suppress only subsequent Workshop parcels; first entrance and other rooms stay animated.
export function nativeLibraryInstant(room,id){return room.active==='garage'&&room.service==='encyclopedia'&&room.libraryWindows.includes(id)&&room.libraryAnimations===false&&!(room.libraryEntrancePending&&room.libraryEntranceId===id)}
export function nativeLibraryVisible(room,id){return !room.libraryWindows?.includes(id)||(room.active==='garage'&&room.service==='encyclopedia'&&room.libraryWindowId===id)}
export function nativeRoomContext(context,room,home={},garage={}){
 if(!room.active)return {...context,nativeRoom:room};
 const isHome=room.active==='home';
 const w={id:'native-room-'+room.active,type:'room',roomId:room.active,version:room.version,title:isHome?'My Home Space':'Workshop',section:isHome?home.room:room.service,component:isHome&&home.detail?{kind:'home-item',itemId:home.detail.id,title:home.detail.title}:null};
 const library=room.active==='garage'&&room.service==='encyclopedia'?(context.windows||[]).find(w=>w.id===room.libraryWindowId):null;
 return {...context,nativeRoom:{...room,section:w.section,...(isHome?{status:home.status,query:home.query}:{garage})},activeWindow:room.focused?(library||w):context.activeWindow,windows:[...(context.windows||[]),w]};
}
export const nativeEmbeddedTarget=(enabled,id)=>enabled&&['home','garage'].includes(id);
