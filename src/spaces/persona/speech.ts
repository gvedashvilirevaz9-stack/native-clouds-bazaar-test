import {portalVoice} from '../../components/portalVoice';
import {mouthClock} from './mouth.mjs';

type L = () => void;
const subs = new Set<L>();
export const voice = {speaking:false, text:'', sys:'', err:'',source:''};
const mouth=mouthClock(()=>performance.now());
let liveLevel=0;
let localPlayback=false;
export const mouthPose=()=>localPlayback||liveLevel<=0?mouth.pose():{width:1,open:liveLevel};
export function liveMouth(level:number){liveLevel=Math.min(1,Math.max(0,level))}

let cursorItem='';
export function avatarCursor(id:string){return cursorItem===id?mouth.cursor():null}
const emit = () => subs.forEach(f => f());
export const onVoice = (f:L) => {subs.add(f);return ()=>{subs.delete(f)}};
const owner='my-space-avatar';
let listening=false;
function articulatedPlayer(){
  const p=portalVoice();
  if(!p?.snapshot().supported)return null;
  if(!listening){listening=true;p.subscribe(s=>{
    const scene=s.owner?.startsWith('hiw-');
    localPlayback=(scene||s.owner===owner)&&s.phase==='playing';
    voice.speaking=localPlayback&&s.audible;
    voice.source=localPlayback?(scene?'scene':'avatar'):'';
    voice.err=s.owner===owner?s.error:'';
    mouth.audible(voice.speaking);emit();
  })}
  return p;
}
export function playLessonPart(text:string,sceneOwner:string,itemId:string,title:string,lang:string){
  const p=articulatedPlayer();if(!p)return false;
  // The lesson owns the sound. Only the speech cues feed the avatar's mouth.
  return p.play({owner:sceneOwner,itemId,text,title,lang,onSpeechCue:(fragment,offset,_word,rate,from)=>{
    cursorItem=itemId;
    // Some system voices emit just one word boundary per utterance. Keep tracking
    // its remaining words and punctuation until a new cue or a native end/pause.
    mouth.cue(fragment,offset,false,rate,from);
  }});
}
export function speak(text:string,opt:{sys?:string;rate?:number;pitch?:number;lang?:string;itemId?:string;startOffset?:number;onCue?:(offset:number,length:number,wordOnly:boolean)=>void}={}){
  const p=articulatedPlayer(),line=String(text||'').trim().slice(0,2000);
  if(!line||!p)return {spoken:false,reason:line?'NO_TTS':'EMPTY'};
  voice.text=line;voice.sys=opt.sys||'';
  const itemId=opt.itemId||crypto.randomUUID();cursorItem='';
  const accepted=p.play({owner,itemId,text:line,title:'AI Persona',lang:opt.lang,startOffset:opt.startOffset,
    onSpeechCue:(fragment,offset,wordOnly,rate,from)=>{cursorItem=itemId;mouth.cue(fragment,offset,wordOnly,rate,from);try{opt.onCue?.(offset,String(fragment||'').length,wordOnly)}catch{}}});
  const state=p.snapshot();return {spoken:accepted&&state.phase==='playing',voice:state.voiceName,lang:state.language,reason:state.error||undefined};
}
export function stopSpeak(){portalVoice()?.stop(owner);}
// K buffer = the bottom communication dock (keyboard K) input draft; read-only DOM access, the dock module is untouched.
export function readKBuffer(): string { const el = document.querySelector<HTMLTextAreaElement>('[data-testid="dock-input"]'); return el?.value?.trim() || ''; }
export async function readClipboard(): Promise<string> { try { return (await navigator.clipboard.readText()).trim(); } catch { return ''; } }
