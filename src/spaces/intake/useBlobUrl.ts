import {useEffect, useState} from 'react';
import {getBlob} from '../garage/store';
/** Resolve an `idb:` blob reference (or plain URL) to something an <img> can show. */
export function useBlobUrl(ref?: string | null) {
  const [url, setUrl] = useState<string | null>(null);
  useEffect(() => {
    let live = true, made: string | null = null;
    setUrl(null);
    if (ref?.startsWith('idb:')) getBlob(ref).then(b => { if (b && live) { made = URL.createObjectURL(b); setUrl(made); } });
    else if (ref) setUrl(ref);
    return () => { live = false; if (made) URL.revokeObjectURL(made); };
  }, [ref]);
  return url;
}
