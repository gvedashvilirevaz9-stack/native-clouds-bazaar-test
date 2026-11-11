import {useEffect, useState} from 'react';

type Options = {language:string; rate:number; selectedVoice:string; effectiveVoice:string; natural:boolean; voices:{name:string;natural:boolean}[]};
type Player = {voiceOptions(lang:string):Options; watchVoices(cb:()=>void):()=>void; configure(opts:{language:string; voice?:string; rate?:number}):void};
const player=()=>(window as unknown as {PORTAL_SPEECH?:Player}).PORTAL_SPEECH;

export function NarrationVoiceSettings({language,ru,disabled=false,showName=false,translate=s=>s,expanded=false}:{language:string;ru:boolean;disabled?:boolean;showName?:boolean;expanded?:boolean;translate?:(s:string)=>string}){
  const [,refresh]=useState(0);
  useEffect(()=>player()?.watchVoices(()=>refresh(n=>n+1)),[]);
  const p=player(),opts=p?.voiceOptions(language);
  if(!p||!opts)return null;
  const name=opts.effectiveVoice || (opts.language==='ru-RU'?'Natural недоступен':ru?'Голос браузера':'Browser default');
  const fields=<>    <label><select aria-label={translate(ru?'Скорость озвучки':'Reading speed')} value={opts.rate} disabled={disabled}
      onChange={e=>p.configure({language,rate:Number(e.target.value)})}>
      {[0.85,1,1.15,1.3].map(rate=><option key={rate} value={rate}>{rate}×</option>)}</select></label>
    <label><select aria-label={translate(ru?'Голос озвучки':'Reading voice')} value={opts.voices.some(v=>v.name===opts.selectedVoice)?opts.selectedVoice:''} disabled={disabled||!opts.voices.length}
      onChange={e=>p.configure({language,voice:e.target.value})}>
      <option value="">{opts.language==='ru-RU'?(ru?'Светлана · по умолчанию':'Svetlana · default'):translate(ru?'Лучший доступный':'Best available')}</option>
      {opts.voices.map(v=><option key={v.name} value={v.name}>{v.name}</option>)}</select></label>
    {showName&&<small>{opts.natural?(ru?'Естественный голос':'Natural voice'):opts.voices.some(v=>v.natural)?(ru?'Выбран обычный голос':'Standard voice selected'):(ru?'Сейчас браузер не предлагает Natural для этого языка.':'This browser currently offers no Natural voice for this language.')}</small>}
</>;
  if(expanded)return <div className="hiw-voice-fields" data-testid="narration-settings">{fields}</div>;
  return <details className="speech-settings hiw-voice-settings" data-testid="narration-settings">
    <summary>{translate(ru?'Голос':'Voice')}{showName?' · '+name:''}</summary>
    {fields}
  </details>;
}
