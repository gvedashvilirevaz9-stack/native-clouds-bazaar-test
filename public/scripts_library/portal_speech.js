(function(win){
  'use strict';
  // One manual speech queue for the portal and its same-origin product frames.
  if(win.PORTAL_SPEECH)return;
  try{if(win.parent!==win&&win.parent.location.origin===win.location.origin&&win.parent.PORTAL_SPEECH){win.PORTAL_SPEECH=win.parent.PORTAL_SPEECH;return;}}catch{}
  const synth=win.speechSynthesis,Utterance=win.SpeechSynthesisUtterance;
  const supported=!!(synth&&Utterance&&synth.pause&&synth.resume);
  const listeners=new Set(),voiceListeners=new Set(),storageKey='portal-speech-preferences-v1';
  let preferences={voices:{},rate:1},voices=[],chunks=[],active=null,token=0,nextTimer=null;
  let onSpeechCue;
  let state={supported,audible:false,phase:'idle',itemId:'',owner:'',title:'',language:'en-US',cursor:0,total:0,progress:0,voiceName:'',natural:false,error:''};
  try{const saved=JSON.parse(win.localStorage.getItem(storageKey)||'null');if(saved){preferences.voices=saved.voices&&typeof saved.voices==='object'?saved.voices:{};if([0.85,1,1.15,1.3].includes(saved.rate))preferences.rate=saved.rate;}}catch{}
  // Optional source offsets keep the cursor aligned with the original message, including Markdown.
  function prepareReading(raw, withOffsets=true){
    let text=String(raw||'');
    let offsets=withOffsets?Array.from({length:text.length},(_,i)=>i):null;
    function rewrite(pattern, replacement, prefix=0){
      if(!offsets){text=text.replace(pattern,replacement);return;}
      const next=[];let tail=0;
      text=text.replace(pattern,(...args)=>{
        const match=args[0],at=args.at(-2);
        const value=typeof replacement==='function'?replacement(...args):replacement;
        const from=typeof prefix==='function'?prefix(match):prefix;
        for(let i=tail;i<at;i++)next.push(offsets[i]);
        for(let i=0;i<value.length;i++)next.push(offsets[at+Math.min(match.length-1,from+i)]);
        tail=at+match.length;return value;
      });
      for(let i=tail;i<offsets.length;i++)next.push(offsets[i]);
      offsets=next;
    }
    rewrite(/```[\s\S]*?```/g,m=>m.replace(/^```[^\n]*\n?|```$/g,''),m=>m.match(/^```[^\n]*\n?/)[0].length);
    rewrite(/!\[([^\]]*)\]\([^)]*\)/g,(_,label)=>label,2);
    rewrite(/\[([^\]]+)\]\([^)]*\)/g,(_,label)=>label,1);
    rewrite(/https?:\/\/\S+/g,'');rewrite(/^\s*[|:\s-]{3,}$/gm,'');rewrite(/[|]/g,', ');
    rewrite(/^\s*(?:#{1,6}\s+|[-*]\s+)/gm,'');
    rewrite(/[*`]/g,'');rewrite(/\r/g,'');rewrite(/[ \t]+/g,' ');rewrite(/\n{3,}/g,'\n\n');
    rewrite(/^\s+|\s+$/g,'');return {text,offsets};
  }
  function normalize(text){return prepareReading(text,false).text;}
  function language(text){return /[\u10A0-\u10FF\u1C90-\u1CBF\u2D00-\u2D2F]/u.test(text)?'ka-GE':/[А-Яа-яЁё]/u.test(text)?'ru-RU':'en-US';}
  function split(text, pauseAtBreaks=false){
    const parts=[];let start=0;
    while(start<text.length){let end=Math.min(start+280,text.length);
      if(end<text.length){const section=text.slice(start,end),sentences=[...section.matchAll(/[.!?;\n](?:\s|$)/g)],last=sentences.at(-1);if(last&&last.index>60)end=start+last.index+1;else{const space=section.lastIndexOf(' ');if(space>60)end=start+space;}if(/[\uD800-\uDBFF]/.test(text[end-1]))end--;}
      parts.push({text:text.slice(start,end),start,end});start=end;
    }
    if(!pauseAtBreaks)return parts;
    // Each voiced clause gets its own native start/end. This also gates the mouth on
    // browsers that expose no word events. Offsets still refer to the normalized text.
    const clauses=[];
    for(const part of parts){
      let from=part.start;
      for(const br of part.text.matchAll(/(?:[,.!?;:…]+[»”’"')\]]*(?=\s|$)|[—–](?=\s)|\n)\s*/gu)){
        const to=part.start+br.index+br[0].length;
        if(!/[\p{L}\p{N}]/u.test(text.slice(from,to)))continue;
        clauses.push({start:from,end:to,text:text.slice(from,to)});from=to;
      }
      if(from<part.end)clauses.push({start:from,end:part.end,text:text.slice(from,part.end)});
    }
    return clauses;
  }
  const isNatural=v=>/natural|neural|premium|enhanced|нейронн|естественн/i.test(v.name);
  const locales={en:'en-US',ru:'ru-RU',ka:'ka-GE'};
  function localeFor(hint,text){return locales[String(hint||'').toLowerCase().split('-')[0]]||language(text);}
  const ruName={female:/светлана|svetlana/i,male:/дмитрий|dmitr[yi]|dmitri/i};
  function ruGender(name){return ruName.male.test(name||'')?'male':'female';}
  function candidates(lang){return voices.filter(v=>v.lang?.toLowerCase().split('-')[0]===lang.toLowerCase().split('-')[0] &&
    (lang!=='ru-RU'||/microsoft/i.test(v.name)&&isNatural(v)&&(ruName.female.test(v.name)||ruName.male.test(v.name))));}
  function setRussianVoice(gender){
    if(!['female','male'].includes(gender))throw Error('INVALID_VOICE');
    configure({language:'ru-RU',voice:gender==='male'?'Дмитрий':'Светлана'});
    return {...voiceOptions('ru-RU'),gender};
  }
  function score(v,lang){
    return (isNatural(v)?100:0)+(/online/i.test(v.name)?20:0)+
      (v.lang.toLowerCase()===lang.toLowerCase()?8:0)+
      (/svetlana|светлана|aria|jenny|sonia|samantha|google русский|google us english/i.test(v.name)?5:0)+(v.default?1:0);
  }
  function chooseVoice(lang){
    const list=candidates(lang),saved=preferences.voices[lang];
    if(lang==='ru-RU')return list.find(v=>ruName[ruGender(saved)].test(v.name))||null;
    return list.find(v=>v.name===saved)||list.sort((a,b)=>score(b,lang)-score(a,lang))[0]||null;
  }
  function snapshot(){return {...state,rate:preferences.rate,voices:candidates(state.language).map(v=>({name:v.name,lang:v.lang,natural:isNatural(v)}))};}
  function emit(){state.progress=state.total?Math.min(100,Math.floor(state.cursor/state.total*100)):0;const value=snapshot();for(const fn of listeners)fn(value);}
  function refreshVoices(){
    if(!supported)return;
    voices=synth.getVoices();
    for(const fn of voiceListeners)fn();emit();
  }
  win.addEventListener('storage',e=>{
    if(e.key!==storageKey)return;
    try{const other=JSON.parse(e.newValue||'{}');preferences={voices:other.voices||{},rate:[.85,1,1.15,1.3].includes(other.rate)?other.rate:1};
      for(const fn of voiceListeners)fn();emit();}catch{}
  });
  function save(){try{win.localStorage.setItem(storageKey,JSON.stringify(preferences));}catch{}}
  function clearQueue(){token++;if(nextTimer!==null){win.clearTimeout(nextTimer);nextTimer=null;}active=null;state.audible=false;synth?.cancel();if(synth?.paused)synth.resume();}
  function speakChunk(){
    if(state.phase!=='playing')return;
    const part=chunks.find(c=>c.end>state.cursor);
    if(!part){state.phase='ended';state.cursor=state.total;active=null;emit();return;}
    const offset=Math.max(part.start,state.cursor),text=part.text.slice(offset-part.start);
    if(!text.trim()){state.cursor=part.end;speakChunk();return;}
    const currentToken=token,voice=chooseVoice(state.language),utterance=new Utterance(text);
    if(state.language==='ru-RU'&&!voice){state.phase='error';state.voiceName='';state.error='RUSSIAN_NATURAL_VOICE_UNAVAILABLE';emit();return;}
    utterance.lang=voice?.lang||state.language;utterance.rate=preferences.rate;if(voice)utterance.voice=voice;
    state.voiceName=voice?.name||'';state.natural=!!voice&&isNatural(voice);active=utterance;
    const valid=()=>token===currentToken&&active===utterance;
    const boundary=e=>{if(!valid()||!Number.isFinite(e.charIndex))return;state.cursor=Math.max(state.cursor,Math.min(part.end,offset+e.charIndex));emit();};
    utterance.onstart=()=>{
      if(!valid())return;
      onSpeechCue?.(text,0,false,utterance.rate,offset);state.audible=true;emit();
    };
    utterance.onboundary=e=>{
      if(!valid()||!Number.isFinite(e.charIndex))return;
      if(state.phase==='playing'&&e.charIndex<text.length&&!synth.paused)state.audible=true;
      onSpeechCue?.(text,e.charIndex,e.name!=='sentence',utterance.rate,offset);boundary(e);
    };
    utterance.onpause=e=>{if(valid()){state.audible=false;if(Number.isFinite(e.charIndex))boundary(e);else emit()}};
    utterance.onresume=()=>{if(valid()){state.audible=true;emit()}};
    utterance.onend=()=>{if(!valid())return;active=null;state.audible=false;if(state.phase==='paused'){emit();return;}if(state.phase!=='playing')return;state.cursor=part.end;emit();nextTimer=win.setTimeout(()=>{nextTimer=null;if(token===currentToken)speakChunk();},0);};
    utterance.onerror=e=>{if(!valid())return;active=null;state.audible=false;state.phase='error';state.error=String(e.error||'speech_error');emit();};
    emit();try{synth.speak(utterance);}catch(e){active=null;state.phase='error';state.error=String(e.message||'speech_error');emit();}
  }
  function play(item){
    if(!supported)return false;
    if(state.itemId===item.itemId&&(state.phase==='paused'||state.phase==='error')){resume();return true;}
    if(state.itemId===item.itemId&&state.phase==='playing')return true;
    const text=normalize(item.text);if(!text)return false;
    voices=synth.getVoices();clearQueue();onSpeechCue=item.onSpeechCue;chunks=split(text,!!onSpeechCue);state={...state,phase:'playing',itemId:String(item.itemId),owner:item.owner||'',title:item.title||'',language:localeFor(item.lang,text),cursor:Number.isInteger(item.startOffset)?Math.max(0,Math.min(text.length,item.startOffset)):0,total:text.length,error:''};speakChunk();return state.phase!=='error';
  }
  function pause(){if(state.phase!=='playing')return;state.phase='paused';if(nextTimer!==null){win.clearTimeout(nextTimer);nextTimer=null;}synth.pause();emit();}
  function resume(){if(!['paused','error'].includes(state.phase))return;state.phase='playing';state.error='';if(active&&(synth.speaking||synth.pending)){synth.resume();emit();}else{active=null;if(synth.paused)synth.resume();speakChunk();}}
  function stop(owner){if(owner&&state.owner!==owner)return;clearQueue();onSpeechCue=undefined;state={...state,phase:'idle',cursor:0,total:0,itemId:'',owner:'',title:'',error:''};chunks=[];emit();}
  function configure(options){if(typeof options.voice==='string')preferences.voices[localeFor(options.language||state.language,'')]=options.voice;if([0.85,1,1.15,1.3].includes(options.rate))preferences.rate=options.rate;save();for(const fn of voiceListeners)fn();emit();}
  function subscribe(fn){listeners.add(fn);return ()=>listeners.delete(fn);}
  function voiceOptions(hint=state.language){
    const lang=localeFor(hint,''),chosen=chooseVoice(lang);
    return {language:lang,rate:preferences.rate,selectedVoice:lang==='ru-RU'?(chosen?.name||''):preferences.voices[lang]||'',effectiveVoice:chosen?.name||'',natural:!!chosen&&isNatural(chosen),voices:candidates(lang).map(v=>({name:v.name,lang:v.lang,natural:isNatural(v)}))};
  }
  function watchVoices(fn){voiceListeners.add(fn);return ()=>voiceListeners.delete(fn);}
  /** Arbitrate the visible Card/Codex sources without replacing a paused utterance. */
  function createSourceController(owner='sunrise-reply'){
    let sources={card:null,codex:null},mode='auto',selected=null,pinned=null,order=0,destroyed=false,changing=false;
    const subscribers=new Set();
    const reference=item=>item?{kind:item.kind,id:item.id||item.itemId,revision:item.revision,title:item.title,itemId:item.itemId}:null;
    const same=(a,b)=>!!a&&!!b&&a.itemId===b.itemId;
    const latest=()=>mode==='auto'?Object.values(sources).filter(Boolean).sort((a,b)=>b.order-a.order)[0]||null:sources[mode];
    const ownState=()=>state.owner===owner?state:null;
    function getState(){
      const current=ownState(),active=current&&['playing','paused','error'].includes(current.phase);
      const target=latest();
      return {supported,phase:active?current.phase:(current?.phase==='ended'&&same(selected,pinned)?'ended':'idle'),mode,
        selected:reference(selected),active:active?reference(pinned):null,pending:active&&!same(target,pinned)?reference(target):null,
        cursor:active?current.cursor:0,total:active?current.total:0,progress:active?current.progress:0,
        voiceName:current?.voiceName||'',error:active?current.error:'',hasContent:!!selected};
    }
    function emitSource(){if(destroyed)return;const value=getState();for(const fn of subscribers)fn(value);}
    function selectLatest(){selected=latest();}
    function start(item){if(!item)return false;pinned=item;selected=item;return play({...item,owner});}
    const unsubscribe=subscribe(()=>{
      if(destroyed||changing)return;
      const current=ownState();
      if(current?.phase==='ended')selectLatest();
      emitSource();
    });
    function update(values){
      for(const kind of ['card','codex']){
        if(!Object.prototype.hasOwnProperty.call(values,kind))continue;
        const value=values[kind],old=sources[kind];
        const text=value?normalize(value.text):'';
        sources[kind]=text?{...value,text,kind,owner,order:same(old,value)?old.order:++order}:null;
      }
      const current=ownState(),target=latest();
      if(current?.phase==='paused'||current?.phase==='error'){emitSource();return;}
      if(current?.phase==='playing'&&!same(target,pinned)){
        changing=true;stop(owner);pinned=null;selected=target;if(target)start(target);changing=false;
      }else{selectLatest();if(same(selected,pinned)&&current?.phase==='playing')pinned=selected;}
      emitSource();
    }
    return {
      update,
      play(){if(destroyed)return false;const current=ownState();if(current?.phase==='paused'||current?.phase==='error'){resume();return true;}if(current?.phase==='playing')return true;selectLatest();return start(selected);},
      pause(){if(destroyed||ownState()?.phase!=='playing')return false;pause();return true;},
      stop(){if(destroyed)return false;changing=true;stop(owner);pinned=null;selectLatest();changing=false;emitSource();return true;},
      setSource(value){if(!['auto','card','codex'].includes(value))return false;mode=value;update({});return true;},
      getState,
      getSnapshot(){return selected?{kind:selected.kind,id:selected.id||selected.itemId,revision:selected.revision,title:selected.title,text:selected.text,language:language(selected.text),capturedAt:new Date().toISOString(),...(selected.cardJSON?{cardJSON:selected.cardJSON}:{})}:null;},
      subscribe(fn){subscribers.add(fn);return ()=>subscribers.delete(fn);},
      destroy(){if(destroyed)return;changing=true;stop(owner);changing=false;destroyed=true;unsubscribe();subscribers.clear();},
    };
  }
  function mount(container,initial){
    const doc=container.ownerDocument;let item=initial,lastVoiceKey='';
    container.classList.add('portal-speech-player');
    function element(tag,className){const el=doc.createElement(tag);el.className=className;return el;}
    function button(className,fn){const el=element('button',className);el.type='button';el.addEventListener('click',e=>{e.stopPropagation();fn();});return el;}
    const speaker=button('speech-speaker',()=>play(item));speaker.textContent='🔊';
    const toggle=button('speech-toggle',()=>{if(state.phase==='playing')pause();else if(['paused','error'].includes(state.phase))resume();else play(item);});
    const status=element('span','speech-status');status.setAttribute('role','status');
    const progress=element('progress','speech-progress');progress.max=100;
    const settings=element('details','speech-settings'),summary=element('summary','');
    const voiceLabel=element('label',''),voiceSelect=element('select',''),rateLabel=element('label',''),rateSelect=element('select','');
    for(const rate of [0.85,1,1.15,1.3]){const option=element('option','');option.value=String(rate);option.textContent=rate+'×';rateSelect.append(option);}
    voiceSelect.addEventListener('change',()=>configure({voice:voiceSelect.value,language:language(item.text)}));rateSelect.addEventListener('change',()=>configure({rate:Number(rateSelect.value)}));
    voiceLabel.append(voiceSelect);rateLabel.append(rateSelect);settings.append(summary,voiceLabel,rateLabel);container.append(speaker,toggle,progress,status,settings);
    function render(){
      const ru=language(item.text)==='ru-RU',current=snapshot(),inProgress=['playing','paused','error'].includes(current.phase),previous=inProgress&&current.itemId!==item.itemId,phase=inProgress||current.itemId===item.itemId?current.phase:'idle';
      const label=current.phase==='playing'?(ru?'Пауза':'Pause'):(ru?'Play':'Play');toggle.textContent=(current.phase==='playing'?'❚❚ ':'▶ ')+label;
      speaker.title=speaker.ariaLabel=ru?'Слушать этот ответ':'Listen to this reply';toggle.ariaLabel=current.phase==='paused'?(ru?'Продолжить с места паузы':'Resume from pause'):label;toggle.title=toggle.ariaLabel;
      speaker.disabled=toggle.disabled=!supported;progress.value=current.progress;progress.ariaLabel=ru?'Прочитано':'Read progress';progress.hidden=!inProgress&&phase!=='ended';
      const phases={idle:ru?'Нажмите динамик':'Press the speaker',playing:ru?'Читаю':'Reading',paused:ru?'На паузе':'Paused',ended:ru?'Прочитано':'Finished',error:ru?'Ошибка озвучки':'Speech error'};
      status.textContent=!supported?(ru?'Озвучка недоступна в этом браузере':'Speech is unavailable in this browser'):(previous?(ru?'Предыдущий ответ · ':'Previous reply · '):'')+phases[phase]+(inProgress?' · '+current.progress+'%':'');
      status.title=current.error||current.voiceName;summary.textContent=ru?'Голос':'Voice';
      const lang=inProgress?current.language:language(item.text),list=candidates(lang),voice=chooseVoice(lang),key=lang+'|'+ru+'|'+list.map(v=>v.name).join('|');
      if(key!==lastVoiceKey){voiceSelect.replaceChildren();const automatic=element('option','');automatic.value='';automatic.textContent=ru?'Лучший доступный':'Best available';voiceSelect.append(automatic);for(const v of list){const option=element('option','');option.value=v.name;option.textContent=v.name;voiceSelect.append(option);}lastVoiceKey=key;}
      voiceSelect.value=lang==='ru-RU'?(voice?.name||''):(preferences.voices[lang]||'');voiceSelect.disabled=inProgress;rateSelect.disabled=inProgress;rateSelect.value=String(preferences.rate);voiceSelect.ariaLabel=ru?'Голос озвучки':'Reading voice';rateSelect.ariaLabel=ru?'Скорость озвучки':'Reading speed';
      voiceLabel.title=voice?.name||(ru?'Голос по умолчанию браузера':'Browser default voice');
    }
    const unsubscribe=subscribe(render);render();
    return {update(value){item=value;render();},destroy(){unsubscribe();container.replaceChildren();}};
  }
  win.PORTAL_SPEECH={play,pause,resume,stop,configure,snapshot,subscribe,mount,createSourceController,voiceOptions,setRussianVoice,watchVoices,normalize,prepareReading,split,detectLanguage:language};
  synth?.addEventListener?.('voiceschanged',refreshVoices);refreshVoices();
  win.addEventListener('pagehide',()=>stop());
})(window);
