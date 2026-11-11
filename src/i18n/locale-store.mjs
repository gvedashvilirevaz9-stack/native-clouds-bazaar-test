export const LOCALE_KEY='sunrise.spaces.uiLocale.v1';
export const LOCALES=['ru','en','ka','az','hy','tr','kk','zh'];
export const isLocale=value=>LOCALES.includes(value);
export function readLocale(storage,language='ru'){
 try {for(const key of [LOCALE_KEY,'sunrise.portal.language','sunrise:language']){const value=storage?.getItem(key);if(isLocale(value))return value;}}catch{}
 const base=String(language).toLowerCase().split('-')[0];return isLocale(base)?base:'ru';
}
let current;
const listeners=new Set();
function publish(value){if(!isLocale(value)||value===current)return;current=value;listeners.forEach(fn=>fn());}
export function getLocale(){if(current)return current;try{return current=readLocale(window.localStorage,navigator.language);}catch{return current='ru';}}
export function setLocale(value){if(!isLocale(value))return;getLocale();try{localStorage.setItem(LOCALE_KEY,value);}catch{}publish(value);}
export function subscribeLocale(fn){listeners.add(fn);return()=>listeners.delete(fn);}
export function acceptLocaleMessage(event,parent,origin){return parent&&event.source===parent&&event.origin===origin&&event.data?.type==='sunrise.ui.locale'&&isLocale(event.data.locale);}
if(typeof window!=='undefined'){
 window.addEventListener('storage',event=>{if(event.key===LOCALE_KEY&&isLocale(event.newValue))publish(event.newValue);});
 window.addEventListener('sunrise:settings',event=>{if(isLocale(event.detail?.language))setLocale(event.detail.language);});
 window.addEventListener('message',event=>{if(window.parent!==window&&acceptLocaleMessage(event,window.parent,location.origin))publish(event.data.locale);});
}
