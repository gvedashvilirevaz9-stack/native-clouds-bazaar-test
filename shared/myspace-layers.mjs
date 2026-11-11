// Four-layer command projection. Canonical MCP registry and access grants stay authoritative.
export const LAYER_VERSION = 'myspace-layers/1';
export const VOICE_TOOL_BUDGET = 18;
const base = ['space.state','spaces.open','space.widget','ask.open','space.avatar'];
export function myspaceLayers(context = {}, access = 'portal', allowed = () => true) {
  const w = context.activeWindow, c = w?.component;
  const window = !w ? [] : w.type==='room'&&w.roomId==='home'?['home.state','home.room','home.search','home.pick','home.scroll','home.providers'] : w.type==='room'&&w.roomId==='garage'?['garage.open','garage.quick','garage.date.set','garage.space.set','garage.topic.set','garage.calendar.open','garage.page.open'] : w.kind ? ['ask.search','ask.list','ask.openItem','ask.presets']
    : w.type === 'V' ? ['space.v'] : w.type === 'avatar' ? ['avatar.catalog','space.avatar']
    : w.type === 'board' ? ['garage.board.add_note','garage.board.clear'] : [];
  const component = !c ? [] : c.kind==='home-item'?['home.play','home.favorite.add'] : c.kind === 'card' ? ['ask.play','ask.place','ask.build',...(w.kind === 'where' ? ['ask.map'] : ['ask.youtube'])]
    : c.kind === 'build' ? ['ask.play','ask.place','scene.read'] : c.kind === 'player' ? ['space.v'] : [];
  const layers = {registry: {source:'COMMANDS',discovery:'portal_describe'}, space:context.nativeClouds?[...base,'space.room','space.service','space.delivery']:base, window, component};
  if(context.screen === 'tv') { layers.space=['space.state','spaces.open','tv.control','tv.place','ask.open']; if(!w?.kind){layers.window=[];layers.component=['space.v'];} }
  const ids = [...new Set([...layers.space,...layers.window,...layers.component])].filter(id => allowed(access,id)).slice(0,VOICE_TOOL_BUDGET-2);
  return {version:LAYER_VERSION,budget:VOICE_TOOL_BUDGET,commands:ids,layers,
    workflow:['Read context and its activeWindow.',...(context.nativeClouds?['Native Clouds Rooms: spaces.open garage or space.room open garage embeds Workshop with the existing garage commands. Its encyclopedia uses unchanged ask.open/scene.menu then space.delivery open; notebook/sketchbook have entrance parcels too: inspect space.delivery list, pass the returned id as windowId to space.delivery open. Explicit garage.open/quick/edit actions reveal their editor directly. Native Clouds Rooms: spaces.open home or space.room open home keeps the sky, avatar and dock. Home Room/Home Place mean this same room. Then use home.room cinema, home.search, home.state, home.pick and home.play; only claim actual provider playback. space.room close closes only the room and stops its media. A focused room exposes Home actions in L3 and its selected item in L4. Native Clouds: space.service list/run/status displays read-only services without leaving MySpace. Run once, poll jobId. For question windows use space.delivery list/open to unpack the exact windowId, then normal ask.search/query status. Pending/loading and an empty parcel are not a completed answer. Windows are temporary; do not save to the cabinet.']:[]), 'Discover exact schemas for an unfamiliar action; absence from this short list is not denial.', 'Bind actions to windowId and selected item. Do not guess the newest card.', 'Execute once; read the terminal receipt and updated context before speaking.'],
    instructions:(context.nativeClouds?'Native Clouds: Home Room, Home Space and Home Place mean the embedded Home room. Use spaces.open home or space.room open, then home.room/search/state/pick/play. Closing the room must preserve the sky and bot. Use space.room close. ':'')+'My Space uses four layers: canonical registry, Space, active window, selected component. Use room.context, not DOM order or the newest saved card. ask.open opens a question window; ask.search searches inside that window. ask.openItem opens an already saved numbered item. Reading and placing target its selected item. A buffered search is not a completed answer. After opening/focusing/switching a window, read space.state before planning component actions. On WINDOW_CLOSED or STALE_WINDOW_CONTEXT refresh state, never silently retarget. For unknown capabilities call portal_describe with query or command IDs. Only claim what a receipt confirms.'};
}
// Bind only actions using the snapshot. A preceding navigation/open invalidates it;
// plan a subsequent state read before resolving an implicit component target.
export function bindWindowPlan(commands, context) {
  let changed=false;
  return commands.map(c=>{
    const args={...c.args}, w=args.windowId?(context?.windows||[context?.activeWindow]).find(w=>w?.id===args.windowId):context?.activeWindow;
    if(!changed && w?.kind && c.commandId.startsWith('ask.') && !['ask.open','ask.save','ask.query'].includes(c.commandId) && (!args.type||args.type===w.kind)) {
      args.windowId ||= w.id;
      // The planner receives a fresh snapshot; contextVersion is the WINDOW version, not room.revision.
      args.contextVersion=w.version;
      if(!args.type && c.commandId!=='ask.search') args.type=w.kind;
      if(['ask.play','ask.place','ask.delete','ask.build','ask.youtube','ask.map'].includes(c.commandId) && (!args.itemId||args.itemId==='$current') && args.n==null && !args.title){
        if(!w.component?.itemId) throw Error('SELECT_CARD_FIRST');
        args.itemId=w.component.itemId; args.contextVersion=w.version;
      }
    }
    if(['spaces.open','space.room','ask.open','ask.openItem','scene.open','scene.menu','ask.search','space.widget'].includes(c.commandId))changed=true;
    return {...c,args};
  });
}
// Pure lifecycle store; views own selections, windows own their version.
export function createWindowContext() {
  let windows=[], revision=0, signature=''; const components=new Map(), versions=new Map();
  return {
    select(id, component) { const next=component||null; if(JSON.stringify(components.get(id)||null)!==JSON.stringify(next)){components.set(id,next);versions.set(id,(versions.get(id)||0)+1);} },
    sync(list) {
      const visible=list.filter(w=>!w.hidden).sort((a,b)=>(b.z||0)-(a.z||0));
      for(const old of windows){const now=visible.find(w=>w.id===old.id);if(!now||now.kind!==old.kind){components.delete(old.id);versions.set(old.id,(versions.get(old.id)||0)+1);}}
      windows=visible; return this.read();
    },
    read() {
      const all=windows.map(w=>({...w,version:versions.get(w.id)||0,component:components.get(w.id)||null}));
      const sig=JSON.stringify(all);if(sig!==signature){signature=sig;revision++;}
      return {version:LAYER_VERSION,spaceId:'personal',revision,activeWindow:all[0]||null,windows:all};
    },
    assert(id,version) { const w=this.read().windows.find(w=>w.id===id);if(!w)throw Error('WINDOW_CLOSED');if(version!=null&&w.version!==version)throw Error('STALE_WINDOW_CONTEXT');return w; },
  };
}
