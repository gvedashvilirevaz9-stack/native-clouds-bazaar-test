import {useEffect, useState} from 'react';
import {Square, Volume2} from 'lucide-react';
import {useGarageT, gt} from './i18n';
import {communication} from '../communication/store';

type SpeechState = {owner: string; phase: string; error?: string};
type Speech = {
  snapshot(): SpeechState & {supported: boolean};
  subscribe(fn: (state: SpeechState) => void): () => void;
  detectLanguage(text: string): string;
  voiceOptions(lang: string): {voices: {name: string; lang: string}[]};
  play(item: {itemId: string; owner: string; title: string; text: string}): boolean;
  stop(owner?: string): void;
};
const player = () => (window as unknown as {PORTAL_SPEECH?: Speech}).PORTAL_SPEECH;

/** Uses the portal's one manual queue: a second sticky replaces, never overlaps, speech. */
export function StickySpeech({id, text}: {id: string; text: string}) {
  const {portalLang} = useGarageT();
  const t = (key: Parameters<typeof gt>[1]) => gt(portalLang, key);
  const owner = 'garage-sticky:' + id;
  const [state, setState] = useState<SpeechState>(() => player()?.snapshot() || {owner: '', phase: 'idle'});
  useEffect(() => {
    const p = player();
    const unsubscribe = p?.subscribe(setState);
    return () => { unsubscribe?.(); p?.stop(owner); };
  }, [owner]);
  const active = state.owner === owner && ['playing', 'paused'].includes(state.phase);
  const language = player()?.detectLanguage(text) || 'en-US';
  const label = active ? t('stickyStop') : t('stickyListen');
  const speak = () => {
    const p = player();
    if (active) { p?.stop(owner); return; }
    if (!p?.snapshot().supported) {
      communication.add({role:'system',kind:'error',source:'Garage',text:t('speechUnavailable')}); return;
    }
    if (!p.voiceOptions(language).voices.length) {
      communication.add({role:'system',kind:'error',source:'Garage',text:gt(portalLang,'speechVoiceMissing',{language:language.split('-')[0].toUpperCase()})}); return;
    }
    p.stop(owner);
    p.play({itemId:owner + ':' + Date.now(),owner,title:t('stickyListen'),text});
  };
  return <div className="gr-sticky-audio" onPointerDown={e => e.stopPropagation()} onDoubleClick={e => e.stopPropagation()}>
    <button type="button" data-testid="gr-sticky-speech" title={label} aria-label={label} aria-pressed={active}
      disabled={!text.trim()} onClick={speak}>{active ? <Square size={14}/> : <Volume2 size={16}/>}<span>{language.split('-')[0].toUpperCase()}</span></button>
    {state.owner === owner && state.phase === 'error' && <span role="status" className="gr-speech-error">{t('speechFailed')}</span>}
  </div>;
}
