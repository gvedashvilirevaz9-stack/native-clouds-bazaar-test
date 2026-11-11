// Portable vector scene v1: fixed 800 × 400 viewBox; coordinates use SVG user units.
export const PROVIDERS = ['openai', 'xai', 'anthropic', 'google'];
export const BIKE_ART = ['rear-wheel','front-wheel','frame','fork','saddle','cockpit','drive','pedals'];
export const SCENE_GUIDE = {
  version:1, canvas:'800 × 400; x/y place a part at rest; dx/dy move it at 100%; turn is rotation in degrees around its local origin.',
  creation:'scene.create {document:{version:1,title,description,lang,parts}}. The authenticated connection determines the provider inbox. Each new request creates an immutable numbered build in this browser.',
  avatar:'When a human asks how something works, read the question id via communication.read. First call scene.request {questionId} to show a pending window. Generate the requested visual style (educational, technical, professional infographic, child-friendly, overview, visual or schematic). Reply using scene.answer {questionId,document} for any new topic, or {questionId,template:"fan"} for the ready lesson. The frame renders the document and speaks one introduction; do not also post its text. Future detail selections share the avatar lip cues.',
  translation:'Add document.translations.en or .ru with {title,description,parts:{partKey:{label,speech}}} for every part. Both providers use the same format. Generate the alternate language when creating bilingual lessons; runtime language changes preserve the SVG, selection, build number and slider.',
  part:'{key,label,speech,x,y,dx,dy,turn?,art? or paths? or image?}. Use one graphic per part. Built-in bicycle artwork: '+BIKE_ART.join(', ')+'. Custom graphics: paths:[{d,fill?,stroke?,width?}] with hex colors or none; image:{url,width,height} with https URL, anchored at the part origin.',
  example:{version:1,title:'Sliding wedge',lang:'en',parts:[{key:'wedge',label:'Wedge',speech:'The slope turns a forward push into a lifting force.',x:200,y:160,dx:180,dy:-30,paths:[{d:'M0 70 L120 70 L120 0 Z',fill:'#419987'}]}]},
  use:'Read sunrise-bicycle-v1 with scene.read for a working bicycle template, join its jsonParts, edit and submit to scene.create. scene.list returns builds (page using offset); scene.open selects a stored build; scene.place targets library, desktop, board or background. scene.background adjusts a silent forward/reverse loop using seconds per cycle. A pinned build stays independent of later inbox deliveries.'
};
const obj=v=>v && typeof v==='object' && !Array.isArray(v);
const text=(v,max)=>typeof v==='string' && v.trim().length>0 && v.length<=max;
const number=(v,lo,hi)=>Number.isFinite(v)&&v>=lo&&v<=hi;
const color=v=>v===undefined||v==='none'||typeof v==='string'&&/^#(?:[a-f0-9]{3}|[a-f0-9]{6})$/i.test(v);
const only=(o,keys)=>Object.keys(o).every(k=>keys.includes(k));
export function validateScene(s) {
  const bad=why=>{throw Error('INVALID_SCENE: '+why)};
  if(!obj(s)||!only(s,['version','title','description','lang','parts','translations'])||s.version!==1||!text(s.title,90)||s.description!==undefined&&!text(s.description,400)||!['en','ru','ka'].includes(s.lang))bad('header');
  if(!Array.isArray(s.parts)||!s.parts.length||s.parts.length>24)bad('1–24 parts');
  const ids=new Set();
  for(const p of s.parts){
    if(!obj(p)||!only(p,['key','label','speech','x','y','dx','dy','turn','art','paths','image'])||typeof p.key!=='string'||!/^[a-z][a-z0-9_-]{0,39}$/.test(p.key)||ids.has(p.key))bad('part key');
    ids.add(p.key);
    if(!text(p.label,60)||!text(p.speech,900)||![p.x,p.y,p.dx,p.dy].every(n=>number(n,-1600,1600))||p.turn!==undefined&&!number(p.turn,-720,720))bad(p.key);
    if([p.art,p.paths,p.image].filter(v=>v!==undefined).length!==1)bad('one graphic per part');
    if(p.art!==undefined&&!BIKE_ART.includes(p.art))bad('art');
    if(p.paths!==undefined&&(!Array.isArray(p.paths)||!p.paths.length||p.paths.length>32||!p.paths.every(g=>obj(g)&&only(g,['d','fill','stroke','width'])&&text(g.d,1400)&&/^\s*[Mm][MmZzLlHhVvCcSsQqTtAaEe0-9.,+\s-]+$/.test(g.d)&&color(g.fill)&&color(g.stroke)&&(g.width===undefined||number(g.width,0,30)))))bad('SVG path');
    if(p.image!==undefined){
      if(!obj(p.image)||!only(p.image,['url','width','height'])||!text(p.image.url,600)||!number(p.image.width,1,1000)||!number(p.image.height,1,1000))bad('image');
      let u;try{u=new URL(p.image.url)}catch{bad('image URL')}
      if(u.protocol!=='https:'||u.username||u.password)bad('https image required');
    }
  }
  if(s.translations!==undefined){
    if(!obj(s.translations)||!only(s.translations,['en','ru','ka']))bad('translations');
    for(const tr of Object.values(s.translations)){
      if(!obj(tr)||!only(tr,['title','description','parts'])||!text(tr.title,90)||tr.description!==undefined&&!text(tr.description,400)||!obj(tr.parts)||Object.keys(tr.parts).length!==ids.size)bad('translated document');
      for(const key of ids){
        const part=tr.parts[key];
        if(!obj(part)||!only(part,['label','speech'])||!text(part.label,60)||!text(part.speech,900))bad('translated part '+key);
      }
    }
  }
  if(JSON.stringify(s).length>24000)bad('document too large');
  return s;
}
