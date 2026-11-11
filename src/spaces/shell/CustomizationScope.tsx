import {createContext,useContext,type ReactNode} from 'react';
import {createPortal} from 'react-dom';
import {useLang} from '../../hooks/useLang';
import {settingsText,type CopyKey} from './customization-copy';

// A Space supplies only the controls it actually renders. Its local state and handlers stay with it.
export const CustomizationOutlet = createContext<{space:string;host:HTMLElement|null}>({space:'',host:null});
export function CustomizationScope({id,title,children}:{id:string;title:string;children:ReactNode}){
  const {space,host}=useContext(CustomizationOutlet);
  if(!host || id.split('.')[0]!==space)return null;
  return createPortal(<section data-customization-scope={id} className={'pcw-section pcw-scope--'+id.replaceAll('.','-')}>
    <h3>{title}</h3>{children}
  </section>,host);
}
export function SettingButton({id,label,shortcut,onClick,pressed}:{id:string;label:CopyKey;shortcut?:string;onClick:()=>void;pressed?:boolean}){
  const {lang}=useLang();
  return <button type="button" className="pcw-action" data-testid={'pcw-'+id} aria-pressed={pressed} onClick={onClick}>
    <span>{settingsText(lang,label)}</span>{shortcut&&<kbd>{shortcut}</kbd>}{pressed!==undefined&&<i className="pcw-switch" aria-hidden="true"/>}
  </button>;
}
