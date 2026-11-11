import { createContext, useContext, useMemo, useSyncExternalStore, useEffect, type ReactNode } from "react";
import { dict, type Lang, type DictKey } from "../i18n/dict";

import {translate} from '../i18n/translate';
import {getLocale,setLocale,subscribeLocale} from '../i18n/locale-store.mjs';

const Ctx = createContext<{
  lang: Lang;
  setLang: (l: Lang) => void;
  t: (k: DictKey) => string;
  l: (text: string) => string;
} | null>(null);

export function LangProvider({ children }: { children: ReactNode }) {
  const lang=useSyncExternalStore(subscribeLocale,getLocale,()=> 'ru') as Lang;
  useEffect(() => { document.documentElement.lang = lang; }, [lang]);
  const value = useMemo(
    () => ({
      lang,
      setLang: setLocale,
      t: (k: DictKey) => lang==='en'?dict.en[k]:translate(dict.ru[k],lang),
      l: (text: string) => translate(text,lang),
    }),
    [lang],
  );
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useLang() {
  const v = useContext(Ctx);
  if (!v) throw new Error("LangProvider missing");
  return v;
}
