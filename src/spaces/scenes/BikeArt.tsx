import React from 'react';
// Parts share the same coordinate system and meet at the two hubs and bottom bracket at zero separation.
const ink='#203238', steel='#abb6b1', teal='#238073', lime='#baca77', brass='#c29955';
function tube(d:string,w:number,c:string,edge=ink){return <><path d={d} fill="none" stroke={edge} strokeWidth={w+2}/><path d={d} fill="none" stroke={c} strokeWidth={w}/></>}
function wheel(){return <><circle r="65" fill="none" stroke={ink} strokeWidth="11"/><circle r="63" fill="none" stroke="#b99764" strokeWidth="3.5"/><circle r="60" fill="none" stroke={steel} strokeWidth="3"/>
  {Array.from({length:24},(_,i)=><g key={i} transform={'rotate('+i*15+')'}><path d={'M'+(i%2?5:-5)+' 2 L0 -59'} fill="none" stroke="#738381" strokeWidth="1.1"/></g>)}<circle r="8" fill={steel} stroke={ink} strokeWidth="2"/><circle r="3" fill={ink}/><path d="M42 -41l4 -4" stroke={brass} strokeWidth="3"/></>}
function gear(x:number,y:number,r:number){return <g transform={'translate('+x+' '+y+')'}><circle r={r} fill="#c2c8bd" stroke={ink} strokeWidth="3" strokeDasharray="3 1"/><circle r={r*.74} fill="#f0f2e9" stroke={ink}/>{[0,72,144,216,288].map(a=><path key={a} d={'M0 0 L0 '+(-r*.78)} transform={'rotate('+a+')'} stroke={ink} strokeWidth="3"/>)}<circle r="4" fill={ink}/></g>}
export function BikeArt({art}:{art:string}){switch(art){
  case 'rear-wheel':case 'front-wheel':return wheel();
  case 'frame':return <g strokeLinejoin="round" strokeLinecap="round">
    {tube('M245 255 L340 178 L357 260 Z',5,teal)}
    {tube('M340 178 L465 139 L475 163 L357 260 Z',10,teal)}
    {tube('M357 260 L338 167',11,teal)}
    {tube('M464 135 L477 168',14,teal)}
    <path d="M375 236l49 -40" stroke={lime} strokeWidth="5"/><path d="M345 174l83 -26" stroke="#86c6ad" strokeWidth="2"/>
    <circle cx="357" cy="260" r="11" fill={teal} stroke={ink} strokeWidth="2"/><circle cx="357" cy="260" r="5" fill="#e4e8d9"/></g>;
  case 'fork':return <g strokeLinecap="round">{tube('M-11 -31L0 0',8,steel)}{tube('M0 0 Q25 58 57 92',8,teal)}{tube('M3 2 Q34 61 57 92',3,'#7aa294')}<circle cx="57" cy="92" r="5" fill={steel} stroke={ink}/></g>;
  case 'saddle':return <g strokeLinejoin="round" strokeLinecap="round">{tube('M1 0 L-7 -38',7,steel)}<path d="M-24 -46 Q-9 -33 9 -45" stroke={ink} fill="none" strokeWidth="3"/><path d="M-39 -52 Q-38 -59 -22 -54 Q-9 -50 12 -51 Q21 -50 19 -46 Q-9 -42 -30 -44 Q-40 -45 -39 -52Z" fill="#754c36" stroke={ink} strokeWidth="2"/><path d="M-33 -51q12 5 38 3" stroke="#cfa588" fill="none"/></g>;
  case 'cockpit':return <g strokeLinecap="round" strokeLinejoin="round">{tube('M0 0 L-7 -19 L11 -27 L22 -33 L35 -29',6,steel)}{tube('M21 -33L36 -29',7,ink)}<path d="M22 -29 Q30 -12 36 -13" fill="none" stroke={ink} strokeWidth="3"/><path d="M26 -26 Q55 9 19 24" fill="none" stroke="#5e716b" strokeWidth="1.5"/></g>;
  case 'drive':return <>{gear(245,255,11)}{gear(357,260,21)}<path d="M245 243L356 238A22 22 0 1 1 355 282L243 267A12 12 0 0 1 245 243Z" fill="none" stroke={ink} strokeWidth="3.7"/><path d="M245 243L356 238A22 22 0 1 1 355 282L243 267A12 12 0 0 1 245 243Z" fill="none" stroke={brass} strokeWidth="2.2" strokeDasharray="3 2"/></>;
  case 'pedals':return <g strokeLinecap="round">{tube('M-19 -18L0 0L24 21',6,steel)}{[-1,1].map(n=><g key={n} transform={'translate('+(n<0?-19:24)+' '+(n<0?-19:21)+')'}><rect x="-10" y="-3" width="20" height="6" rx="1.5" fill={ink}/><path d="M-7 0h11" stroke={brass} strokeWidth="2"/></g>)}<circle r="4" fill={ink}/></g>;
  default:return null;
}}
