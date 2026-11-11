import {lessonIntent} from '../../../shared/lesson-intent.mjs';
export const DOCK_KEY = 'sunrise.communication.v1';
export const MODES = ['hidden','bar','notifications','keyboard'];
export const MAX_TEXT = 1800;
export function createCommunicationStore({storage=null,now=()=>Date.now(),id=()=>crypto.randomUUID()}={}) {
 let saved;try{saved=JSON.parse(storage?.getItem(DOCK_KEY)||'null');}catch{}
 let messages=(Array.isArray(saved?.messages)?saved.messages:[]).filter(m=>m&&Number.isSafeInteger(m.seq)&&m.seq>0&&typeof m.text==='string'&&['agent','system','user'].includes(m.role)&&typeof m.contact==='string').slice(-100).map(m=>({...m,text:m.text.slice(0,MAX_TEXT)}));
 let sequence=Math.max(Number.isSafeInteger(saved?.sequence)?saved.sequence:0,...messages.map(m=>m.seq),0);
 let state={mode:'hidden',messages,unread:messages.filter(m=>!m.read&&m.role!=='user'&&m.contact==='agent').length,sequence};
 if(state.unread)state.mode='bar';
 const listeners=new Set();
 const emit=()=>{try{storage?.setItem(DOCK_KEY,JSON.stringify({messages:state.messages,sequence:state.sequence}));}catch{}for(const fn of listeners)fn();};
 const snapshot=()=>state;
 function mode(value){if(!MODES.includes(value))throw Error('INVALID_DOCK_VIEW');state={...state,mode:value};emit();return summary();}
 function add({text,role='system',kind='info',source='Sunrise',contact='agent',key='',reveal=true,replyTo,buildId,replyLanguage}) {
  if(typeof text!=='string'||!text.trim()||text.length>MAX_TEXT)throw Error('INVALID_MESSAGE');
  if(!['agent','system','user'].includes(role)||!['info','error'].includes(kind))throw Error('INVALID_MESSAGE');
  const stamp=now();
  const duplicate=key&&state.messages.find(m=>m.key===key);
  if(duplicate)return {messageId:duplicate.id,sequence:duplicate.seq,duplicate:true};
  const last=state.messages.at(-1);
  if(role==='system'&&last?.role==='system'&&last.text===text&&stamp-last.createdAt<5000)return {messageId:last.id,sequence:last.seq,duplicate:true};
  const seq=++sequence,visible=contact==='agent'&&['notifications','keyboard'].includes(state.mode);
  const lesson=role==='user'&&contact==='agent'?lessonIntent(text):null;
  const m={...(['ru','en','ka'].includes(replyLanguage)?{replyLanguage}:{}),...(lesson?{lesson}:{}),...(replyTo?{replyTo}:{}),...(buildId?{buildId}:{}),id:id(),seq,text:text.trim(),role,kind,source:String(source).slice(0,80),contact,key,createdAt:stamp,read:role==='user'};
  const next=[...state.messages,m].slice(-100);
  const incoming=role!=='user'&&contact==='agent';
  state={...state,sequence:seq,messages:next,unread:next.filter(m=>!m.read&&m.role!=='user'&&m.contact==='agent').length,mode:incoming&&reveal&&state.mode==='hidden'?'bar':state.mode};emit();
  return {messageId:m.id,sequence:seq,transport:contact==='agent'?'portal-tab':'local-prototype'};
 }
 function markRead(){state={...state,unread:0,messages:state.messages.map(m=>m.contact==='agent'?{...m,read:true}:m)};emit();}
 function summary(){return {mode:state.mode,unread:state.unread,messageCount:state.messages.filter(m=>m.contact==='agent').length,lastSequence:state.sequence,lastUserSequence:state.messages.filter(m=>m.role==='user'&&m.contact==='agent').at(-1)?.seq||0,transport:'portal-tab',dht:'prototype',backgroundWake:false,questionEvents:'push-v1',lessonReplies:1,roomControls:2,savedWindows:1,cabinetEntries:1};}
 function read(after=0){if(!Number.isSafeInteger(after)||after<0)throw Error('INVALID_CURSOR');const list=state.messages.filter(m=>m.contact==='agent'&&m.seq>after),page=list.slice(0,5);return {messages:page.map(({text,key,...m})=>({...m,textParts:text.match(/[\s\S]{1,450}/g)||[]})),nextCursor:page.at(-1)?.seq||after,hasMore:list.length>page.length,oldestAvailable:state.messages[0]?.seq||0};}
 return {snapshot,subscribe:fn=>{listeners.add(fn);return()=>listeners.delete(fn)},mode,add,markRead,summary,read};
}
// The keyboard edits the selection, not just the end. Backspace keeps emoji intact.
export function editDraft(text,start,end,key) {
 const a=Math.max(0,Math.min(start??text.length,text.length)),b=Math.max(a,Math.min(end??a,text.length));
 if(key==='BACKSPACE'){const before=a===b?Array.from(text.slice(0,a)).slice(0,-1).join(''):text.slice(0,a);return {text:before+text.slice(b),caret:before.length};}
 const insert=key==='SPACE'?' ':key==='TAB'?'	':key==='ENTER'?'\n':key;
 const next=text.slice(0,a)+insert+text.slice(b);return {text:next.slice(0,MAX_TEXT),caret:Math.min(a+insert.length,MAX_TEXT)};
}
