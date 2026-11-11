import {uiKeys,msg} from '../../shared/market-copy.mjs';
import rows from './spaces-messages.json';
import {legacyEnglish} from './legacy';
import {dict,type Lang} from './dict';
const normalize=(s:string)=>s.trim().replace(/\s+/g,' ');
const lookup=new Map<string,string[]>();
for(const row of rows)for(const text of row)lookup.set(normalize(text),row);
const english=new Map(Object.entries(legacyEnglish));
for(const key of Object.keys(dict.ru) as (keyof typeof dict.ru)[])english.set(dict.ru[key],dict.en[key]);
export function translate(text:string,lang:Lang):string {
 if(typeof text!=='string')return text;
 const key=normalize(text);
 // Package chips carry an icon; translate their owned label, never the query payload.
 const icon=key.match(/^((?:[^\p{L}\p{N}]|ℹ)+\s+)(.+)$/u);
 const row=lookup.get(key)??(icon?lookup.get(icon[2]):undefined);
 const mk=uiKeys.get(key.toLowerCase())??uiKeys.get((row?.[0]||'').toLowerCase())??uiKeys.get((row?.[1]||'').toLowerCase());
 const value=(mk?msg(mk,lang):undefined)??row?.[lang==='ru'?0:lang==='ka'?2:1]??(lang!=='ru'?english.get(key):undefined);
 if(!value)return text;
 return `${/^\s/.test(text)?' ':''}${icon&&!lookup.has(key)?icon[1]:''}${value}${/\s$/.test(text)?' ':''}`;
}
