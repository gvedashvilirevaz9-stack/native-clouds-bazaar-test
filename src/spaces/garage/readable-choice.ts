/** Upgrade only untouched old slot coordinates. Text/images/links and manual moves stay intact. */
export function readableChoiceItems<T extends {kind: string; x: number; y: number; w?: unknown}>(items: T[]): T[] {
  let changed = false;
  const rules = [
    {x:432,y:98,nx:432,ny:98,w:480},
    {x:172,y:1128,nx:172,ny:1628,w:560},
    {x:372,y:1428,nx:372,ny:2028,w:560},
    {x:532,y:1128,nx:832,ny:1628,w:undefined},
  ];
  const result = items.map(it => {
    if (!['sticky','note','timer'].includes(it.kind)) return it;
    const rule = rules.find(r => Math.abs(it.x-r.x)<.1 && Math.abs(it.y-r.y)<.1);
    if (!rule) return it;
    const w = rule.w && (!it.w || it.w === 200) ? rule.w : it.w;
    if (it.x===rule.nx && it.y===rule.ny && it.w===w) return it;
    changed = true;
    return {...it,x:rule.nx,y:rule.ny,...(w ? {w} : {})};
  });
  return changed ? result : items;
}
