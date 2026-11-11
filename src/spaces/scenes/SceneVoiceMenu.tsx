import {useEffect,useId,useRef,useState} from 'react';
import {NarrationVoiceSettings} from '../../components/NarrationVoiceSettings';
import {useFrame} from './SceneLanguage';
export function SceneVoiceMenu({speechLang}:{speechLang?:string}){
 const {lang:language,choose}=useFrame(),ru=language==='ru';
 const [open,setOpen]=useState(false),box=useRef<HTMLDivElement>(null),trigger=useRef<HTMLButtonElement>(null),id=useId();
 useEffect(()=>{
   if(!open)return;
   const outside=(e:PointerEvent)=>{if(!box.current?.contains(e.target as Node))setOpen(false)};
   const escape=(e:KeyboardEvent)=>{if(e.key==='Escape'){e.stopPropagation();setOpen(false);trigger.current?.focus()}};
   document.addEventListener('pointerdown',outside);document.addEventListener('keydown',escape,true);
   return()=>{document.removeEventListener('pointerdown',outside);document.removeEventListener('keydown',escape,true)};
 },[open]);
 return <div className="hiw-voice-menu" ref={box}>
  <button type="button" ref={trigger} data-testid="scene-voice-toggle" aria-label={(ru?'Язык фрейма · ':'Frame language · ')+language.toUpperCase()} aria-controls={id} aria-expanded={open} onClick={()=>setOpen(v=>!v)}><span className={ru?'':'is-current'}>EN</span> / <span className={ru?'is-current':''}>RU</span> ⌄⌄</button>
  {open&&<div id={id} className="hiw-voice-pop" role="group" aria-label={ru?'Язык и голос':'Language and voice'}>
   <label>{ru?'Язык фрейма':'Frame language'} <select value={language} aria-label={ru?'Язык фрейма':'Frame language'} data-testid="scene-frame-language" onChange={e=>choose(e.target.value as 'en'|'ru')}>
    <option value="en">English</option><option value="ru">Русский</option></select></label>
   <button className="hiw-system-lang" onClick={()=>choose(null)}>{ru?'Как в AI-панели':'Use AI panel language'}</button>
   <NarrationVoiceSettings expanded language={speechLang||language} ru={ru} showName/>

  </div>}
 </div>
}
