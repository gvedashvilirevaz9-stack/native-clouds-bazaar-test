# Handoff to Claude / Anthropic

## Scope

This is the Native Clouds **Workshop room inside MySpace**, extracted from the local portal's 2026-11-08 revision. It contains the real Notebook, Sketchbook and Encyclopedia components, not the rest of Sunrise Spaces. Keep experiments in this copy. Do not replace the owner's portal or deploy it.

Read README.md to run. Prebuilt `web/` requires only Node.js; source rebuilding requires `npm install && npm run build`. No credentials or personal browser data are supplied. No paid model is called by this package.

## Structure and visual contract

- `standalone/main.tsx` mounts `GarageSpace active embedded`, with the existing AskBody/SceneDesk as its Encyclopedia. `standalone/NativePresentation.tsx` extracts the original sky and courier presentation without importing other rooms.
- `src/spaces/garage/`: Notebook/Sketchbook, dates, presets, question buffer, local persistence, pages, board objects and exports. The old `garage` identifier is intentional; it is the command namespace of this room.
- `shared/native-rooms.mjs`: presentation state: service, normal/wide/full size, entrance parcel, animation preference. It still contains shared metadata names of the parent portal; other rooms are not mounted or reachable here.
- `src/spaces/personal/AskWindow.tsx` + `ask-store.mjs`: six visible question modes, preset prompts, cards and query lifecycle. `shared/ask-types.mjs`: card sanitizer/schema.
- `src/spaces/scenes/`: validated SVG scene documents, built-in bicycle demonstration, interactive parts, reading and placement. `shared/scene-format.mjs`: validation and sample document.
- `shared/myspace-layers.mjs` + `window-context.ts`: original context helpers, not an authentication layer.
- `src/sunrise402/` files here are only editor dependencies for favorite snapshots; no Money/Marketplace UI or backend was exported.

Preserve the single header: Notebook-only context/presets on the left; enlarged clock/week in the middle; service buttons below them; calendar/favorites on the right. Notebook arrives as a golden book, Sketchbook as a golden atlas, Encyclopedia as an airship. First Encyclopedia entrance stays animated; its animation toggle controls later deliveries only. Hover reveals local chrome; full-screen covers the upper room panel, while the bottom dock stays above it. The parent portal's avatar, account/keys, TV remote and global navigation are outside this export.

## How MCP works in the original portal

1. A browser tab authorizes a connection and supplies a short-lived connectionCode.
2. Agent calls `get_protocol(connectionCode)`, then `get_portal_state`, reads the current passport/schemas.
3. `execute_command` gets a unique requestId. The router validates arguments, access state and target, sends the command to that tab; the mounted controller returns a receipt.
4. Agent polls `get_command_result` and reads current state. Never announce completion from an accepted/pending receipt alone. Never infer that a hidden button is forbidden.

Workshop example in the full portal: `space.room {action:"open",room:"garage",section:"encyclopedia"}` → `space.delivery {action:"list"}` → open the returned exact windowId → `ask.open {type:"who"}` / `ask.search` → read `ask.query` and presets → research → `ask.save {type,card,queryId}` → `ask.openItem` with the actual item/window identifiers → check final receipt/state. “How it works” produces `scene.create {document,queryId}` instead of a text-only card. Opening a parcel is not generation of an answer.

The original registry reference is in `reference/original-room-commands.json`; it is **documentation**, not a claim that every MCP command is exposed by this export. Original transport/server files, pairing/auth, execute queue and get_command_result are deliberately not bundled.

## How API-key Voice works in the original portal

Voice is a separate pipeline: user key → live speech session → decision/router → same command controllers. A research/builder model handles web research and validated card/scene generation, then returns its result to the query buffer and window. Do not expect a live speech model alone to browse and populate a card.

There are four context levels: L1 complete command registry; L2 compact current-space tools; L3 active window; L4 selected card/scene/player. Narrow the voice context, not the reasoning agent's entire registry. The existing budget constant is 18. Bind operations to windowId, itemId and context version; check status before retrying a running query.

Original access states are separate from those layers: MCP connection grants; normal cabinet Voice; TV Voice limited to the remote; TV Voice with manually enabled full-portal access. Preserve checks. TV idle hangup/close-remote rules belong only to that TV session. This standalone room has no TV session or key cabinet.

To add Anthropic: implement a provider adapter behind a deliberate connection UI, consume query text/type/enabled presets/language, generate the existing card JSON or validated scene JSON, save it, link the query result, update status, then open the actual result. Handle timeout/failed/running explicitly. Keep API secrets out of source, ZIP, browser-visible logs and model prompts. Add credentials only with the owner's explicit setup; this handoff provides none. Model names should come from the chosen provider's current API, not from display names of the portal's coding assistants.

## Local adapter in THIS export (not MCP)

Open DevTools in this isolated page or use browser automation:

```js
await window.workshop.execute('space.state');
await window.workshop.execute('workshop.select', {service:'notebook'});
await window.workshop.execute('garage.quick', {action:'new-page'});
await window.workshop.execute('garage.board.add_sticky', {text:'A note from Claude'});
await window.workshop.execute('ask.open', {type:'who'});
// Read the returned windowId / parcels rather than guessing identifiers:
await window.workshop.execute('space.delivery', {action:'list'});
await window.workshop.execute('space.delivery', {action:'open', windowId:'<returned id>'});
await window.workshop.execute('ask.search', {text:'Who is Ada Lovelace?'});
await window.workshop.execute('ask.query');
```

The local facade supports `workshop.select`, `workshop.size`, `workshop.animation`, `space.state`, `space.delivery`, `ask.open`, `ask.search` (text), `ask.query`, `ask.save`, `ask.openItem`, `scene.create`, and the room's mounted `garage.*` controller. Marketplace-dependent add-from-result/favorite commands are excluded. **These facade argument shapes are not a replacement for the original MCP schemas.**

Response flow: `ask.save {type,card,source:"anthropic",queryId?}` returns the saved card/id; `ask.openItem {type,itemId}` awaits a receipt from the matching mounted window. `scene.create {provider:"anthropic",document,deliveryId?,queryId?}` returns buildId; open it with `ask.openItem {type:"how",buildId}` in a how window. `queryId` marks the corresponding request done and links its result. Desktop/background placements are local host adapters; the original full MySpace window manager is not included. There is one active Encyclopedia pane here.

The dock's Adapter / JSON panel exposes the query buffer and imports `{command,args}` using exactly this facade. `examples/card.json` and `examples/scene.json` are explicit examples, not generated research. You can copy their content into that panel. Saving a card does not automatically select it: select it in its list, or call ask.openItem.

## Next work suggested for Claude

First inspect and propose UI/editor improvements within this room. If adding real AI connectivity, implement the server/provider/transport adapter separately and keep these existing validated data formats. Add an explicit pending/error/completed state and make the model check receipts. Do not add Marketplace, Money or other portal rooms just to get this prototype running.
