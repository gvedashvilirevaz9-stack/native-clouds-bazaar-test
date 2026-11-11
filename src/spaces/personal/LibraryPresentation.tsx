import React,{createContext,useContext} from 'react';
import {createPortal} from 'react-dom';

// Presentation only: the original controls keep their handlers and provider/library state.
export const LibraryPresentation=createContext<{providerHost:HTMLElement|null}|null>(null);
export function LibraryProviders({children}:{children:React.ReactNode}){
 const presentation=useContext(LibraryPresentation);
 const controls=<div className="ask-top-l">{children}</div>;
 return presentation?(presentation.providerHost?createPortal(controls,presentation.providerHost):null):controls;
}
