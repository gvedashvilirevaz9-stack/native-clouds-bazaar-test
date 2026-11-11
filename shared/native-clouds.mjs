// Shared, testable presentation contract. It does not grant command access.
export function courierFor(w){
 const kind=w?.type==='ask'?w.props?.kind:w?.type==='scene'?'how':null;
 return kind?({who:'manta',where:'sail',how:'library',what:'library',howto:'sail',choose:'manta'}[kind]||'library'):null;
}
export function nativeSlot(index,type){
 const slots=[{x:96,y:125,w:430,h:350},{x:1368,y:125,w:450,h:350},{x:96,y:620,w:430,h:350},{x:1320,y:620,w:510,h:350}];
 if(type==='ask'||type==='scene')return {x:480+(index%2)*120,y:140+(index%2)*100,w:960,h:780};
 return slots[index%slots.length];
}
export function serviceOutcome(d){
 if(d?.paymentRequired||(d?.items||[]).some(x=>x.paymentRequired))return 'payment_required';
 if(d?.error)return 'failed';
 if(d?.kind==='needs_clarification'||d?.kind==='menu')return 'needs_input';
 const cards=d?.result?[d.result]:(d?.items||[]).map(x=>x.result).filter(Boolean);
 if(!cards.length)return 'no_data';
 return cards.every(c=>c.ok===false)?'no_data':cards.some(c=>c.ok===false||c.partial)?'partial':'ready';
}
