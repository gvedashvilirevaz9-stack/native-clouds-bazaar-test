// Grok 2026-11-04 (askwindows): per-window preset toggles + per-window items (all belong to the user; each records its source).
import {askType,defaultPresets,cleanCard} from '../../../shared/ask-types.mjs';
const PK='sunrise.ask.presets.v1',IK='sunrise.ask.items.v1',QK='sunrise.ask.queries.v1';
export const CAB_NOTE='Запрос пришёл из поиска кабинета без категории; если смысл неясен, переспроси категорию; если запрос конкретный, ищи сразу.';
export const VARIANTS_HINT='Если запрос расплывчатый, дай главный ответ плюс 2–3 варианта в card.variants:[{title, summary, imageUrl, sections, links}]. Каждая секция: preset = id из presets.';
const subs=new Set();let rev=0;
const read=(k)=>{try{return JSON.parse(localStorage.getItem(k)||'{}')||{}}catch{return {}}};
const write=(k,v)=>{try{localStorage.setItem(k,JSON.stringify(v))}catch{};rev++;subs.forEach(f=>f())};
export const askStore={
 subscribe(f){subs.add(f);return()=>subs.delete(f)},revision:()=>rev,
 presets(type){const v=read(PK)[type];return Array.isArray(v)?v.filter(id=>askType(type)?.presets.some(p=>p.id===id)):defaultPresets(type)},
 toggle(type,id,on){const all=read(PK),cur=new Set(this.presets(type));(on??!cur.has(id))?cur.add(id):cur.delete(id);all[type]=[...cur];write(PK,all);return all[type]},
 setPresets(type,ids){const all=read(PK);all[type]=ids.filter(id=>askType(type)?.presets.some(p=>p.id===id));write(PK,all);return all[type]},
 items(type){const v=read(IK)[type];return Array.isArray(v)?v:[]},
 save(type,card,source,itemId){const c=cleanCard({...card,source:card?.source||source},type);const all=read(IK),list=Array.isArray(all[type])?all[type]:[];
  if(itemId){const old=list.find(i=>i.id===itemId);if(!old)throw Error('ASK_ITEM_NOT_FOUND');const {variants:_v,...keep}=old;const item={...keep,...c,id:old.id,number:old.number,createdAt:old.createdAt,updatedAt:Date.now()};all[type]=list.map(i=>i.id===itemId?item:i);write(IK,all);return item}
  const item={id:'ask-'+Date.now().toString(36)+Math.random().toString(36).slice(2,6),number:1+Math.max(0,...list.map(i=>i.number||0)),createdAt:Date.now(),presets:this.presets(type),mine:false,...c};
  all[type]=[...list,item].slice(-200);write(IK,all);return item},
 pin(type,id,mine){const all=read(IK);all[type]=(all[type]||[]).map(i=>i.id===id?{...i,mine:mine??!i.mine}:i);write(IK,all)},
 item(type,id){return this.items(type).find(i=>i.id===id)},
 requestBuild(type,id){const all=read(IK);all[type]=(all[type]||[]).map(i=>i.id===id?{...i,buildPending:Date.now()}:i);write(IK,all)},
 attach(type,id,buildId){const all=read(IK);if(!(all[type]||[]).some(i=>i.id===id))throw Error('ASK_ITEM_NOT_FOUND');all[type]=all[type].map(i=>i.id===id?{...i,buildId,buildPending:undefined}:i);write(IK,all);return true},
 // cabsearch: cabinet search queue (agent reads it with ask.query).
 queries(){const v=read(QK).list;return Array.isArray(v)?v:[]},
 query(p){const item={id:'q-'+Date.now().toString(36)+Math.random().toString(36).slice(2,5),status:'buffer',createdAt:Date.now(),...p};write(QK,{list:[...this.queries(),item].slice(-30)});return item},
 setQuery(id,status,note,result){const list=this.queries();if(!list.some(q=>q.id===id))throw Error('ASK_QUERY_NOT_FOUND');write(QK,{list:list.map(q=>q.id===id?{...q,status:status||q.status,note:note||q.note,result:result||q.result,updatedAt:Date.now()}:q)});return true},
 // donechip: link a found card/build to its query (explicit, or the latest card of that type saved after the query).
 linkResult(id,result){return this.setQuery(id,undefined,undefined,result)},
 result(q,builds=[]){return q?.result||null},
 // leanquery: the ONLY shape the agent sees (buffer message + ask.query/ask.search).
 lean(q,windowId){const f=q.function||null;const o={text:q.text,function:f};if(f){const t=askType(f);o.presets=(q.presets||[]).map(p=>{if(p&&typeof p==='object')return {id:p.id,title:p.title,prompt:p.prompt};const d=t?.presets.find(x=>x.prompt===p||x.id===p);return d?{id:d.id,title:d.ru,prompt:d.prompt}:{id:null,title:null,prompt:p}}).filter((p,i,a)=>p.prompt&&a.findIndex(x=>x.prompt===p.prompt)===i)}else o.note=q.note||CAB_NOTE;o.lang=q.lang;
  o.reply={windowId:windowId||q.windowId||null,queryId:q.id,saveWith:f==='how'?'scene.create {document, queryId:"'+q.id+'"}':'ask.save {type:"'+(f||'<type>')+'", card, queryId:"'+q.id+'"}',type:f,hint:VARIANTS_HINT,then:'ask.query {queryId:"'+q.id+'", status:"done"}'};return o},
 setGeo(type,id,g){const all=read(IK);if(!(all[type]||[]).some(i=>i.id===id))throw Error('ASK_ITEM_NOT_FOUND');all[type]=all[type].map(i=>i.id===id?{...i,geo:g||undefined,updatedAt:Date.now()}:i);write(IK,all);return true},
 mark(type,id,patch){const all=read(IK);all[type]=(all[type]||[]).map(i=>i.id===id?{...i,...patch}:i);write(IK,all)},
 remove(type,id){const all=read(IK);all[type]=(all[type]||[]).filter(i=>i.id!==id);write(IK,all)},
};
