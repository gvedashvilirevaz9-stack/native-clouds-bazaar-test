// cardtts: pure helpers (tested in scripts/cardtts.test.mjs).
const MAX=1800;
function split(t){const out=[];let s=String(t||''),b=0;while(s.length>MAX){let k=s.lastIndexOf('. ',MAX);if(k<MAX/2)k=s.lastIndexOf(' ',MAX);if(k<1)k=MAX;else k+=1;out.push([b,s.slice(0,k)]);b+=k;s=s.slice(k)}if(s.trim())out.push([b,s]);return out}
// seg 0 = title + summary, seg n = section n-1. pre = spoken prefix length before the displayed text.
export function cardChunks(card){if(!card)return [];const out=[];const head=String(card.title||'')+'. ';
 const sum=split(card.summary);if(!sum.length)out.push({seg:0,base:0,pre:head.length,len:0,speak:head});
 sum.forEach(([b,t],k)=>{const pre=k?0:head.length;out.push({seg:0,base:b,pre,len:t.length,speak:(k?'':head)+t})});
 (card.sections||[]).forEach((s,n)=>{const h=s.title?s.title+'. ':'';split(s.text).forEach(([b,t],k)=>{const pre=k?0:h.length;out.push({seg:n+1,base:b,pre,len:t.length,speak:(k?'':h)+t})})});return out}
export const cardLang=(c)=>c?.lang||(/[а-яё]/i.test(String(c?.title||'')+String(c?.summary||''))?'ru-RU':'en-US');
export function wordAt(t,off){if(off<0||off>=t.length)return null;let a=off;while(a>0&&!/\s/.test(t[a-1]))a--;let b=off;while(b<t.length&&!/\s/.test(t[b]))b++;return b>a?[a,b]:null}
