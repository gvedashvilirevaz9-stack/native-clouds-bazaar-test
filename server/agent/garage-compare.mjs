// Garage "compare" recipe: fixed knolling (flat-lay) teardown prompt + agent steps. Read-only; ASCII only.
// Term: "knolling" / "flat lay exploded parts diagram" = every part laid flat, top-down orthographic, aligned grid.
// Style rule: FLAT (knolling) is preferred over 3D exploded/perspective views.
export const COMPARE_PROMPT_TEMPLATE = [
 'Knolling teardown (flat lay exploded parts diagram) of {object_model}.',
 'Top-down orthographic view, 90 degrees overhead, no perspective, no 3D exploded view.',
 'Black-and-white technical line art: thin uniform black strokes on a pure white background, no color, no gradients, no shading, no shadows.',
 'PARTS - show each part exactly once: {parts_list}.',
 'LAYOUT - every part laid flat and fully disassembled, arranged in a clean rectilinear grid aligned to horizontal and vertical axes;',
 'parts grouped by subassembly and kept adjacent as one cluster; fasteners placed beside the part they secure;',
 'even spacing, no overlapping parts, no diagonal scatter, consistent scale across all parts.',
 'CALLOUTS - numbered callouts (1, 2, 3 ...) next to each part with thin straight leader lines that never cross;',
 'a numbered parts key in the lower right corner matching the callout numbers.',
 'Truthful depiction: no duplicated or phantom parts, preserve true orientation of left/right parts.',
 'Clean editorial technical-manual look, no watermark, no logo, no text other than numbers and the parts key, 4:3 landscape.'
].join(' ');
export const COMPARE_STYLE_NOTE = 'Teardown sketches: prefer FLAT knolling (top-down orthographic, black-and-white line art, numbered callouts, white background) over 3D exploded/perspective views.';
export function compareRecipe(){
 return {
  id:'garage.compare',
  triggers:['сравни','сравнить','сравнение','разбор','разбери','compare','teardown','breakdown'],
  sayFirst:{ru:'Я могу визуализировать сравнение: разберу объекты по деталям в плоскости. Подождите, генерирую картинку.',en:'I can visualize the comparison as a flat parts breakdown. Please wait, generating the image.'},
  term:'knolling (flat lay exploded parts diagram)',
  styleNote:COMPARE_STYLE_NOTE,
  promptTemplate:COMPARE_PROMPT_TEMPLATE,
  placeholders:{object_model:'exact make + model + year/variant of the object, e.g. "Trek Marlin 5 Gen 3 (2024) hardtail mountain bike"',parts_list:'comma-separated parts with counts, e.g. "frame x1, fork x1, front wheel x1, rear wheel x1, crankset x1, chain x1, cassette x1, rear derailleur x1, saddle x1, seatpost x1, handlebar x1, stem x1, brake levers x2, brake calipers x2, pedals x2"'},
  rules:['Use promptTemplate verbatim; only replace {object_model} and {parts_list}. Do not restyle.','One image per compared object (A and B).','Never pay for or purchase anything; generation uses the agent own image tool.','Verify the model and parts against sources. Label generated diagrams as illustrative, not a service manual. Unknown specifications and prices remain unknown. Never sum different currencies.','garage.preset.choice replaces its page. First create a new Prep page; never clear the source board. Upload IDs are consumed once: place images after building the skeleton, not before.'],
  steps:[
   {n:1,call:'garage.board.read',why:'find the source item(s): polaroids on the board or an uploaded frame (attach). Take ids + titles.'},
   {n:2,call:'(agent) say sayFirst in the user language',why:'Only when image generation is actually available and about to start; otherwise explain the limitation.'},
   {n:3,call:'(agent) build parts_list for each object; fill promptTemplate; generate image with the agent image tool'},
   {n:4,call:'garage.view.set then garage.page.new',args:'{tab:"board",layout:"prep"} then {}',why:'For two-object comparison, use a new Prep page. Preserve the source items and their snapshot fields.'},
   {n:5,call:'garage.preset.choice',args:'{intent, optionA, optionB, compare:<sourced comparison text>}',why:'Build the empty comparison skeleton on the NEW page; retain returned optA/optB IDs.'},
   {n:6,call:'POST /api/garage/attachments',why:'Upload each generated image with Bearer connectionCode; returns a single-use uploadId.'},
   {n:7,call:'garage.slot.put',args:'{slot:"tdA" or "tdB",item:{forItem:<new option id>,title,uploadId,parts:[{key,label,price?,unknown?}]}}',why:'Attach images AFTER skeleton creation. For a single existing item, garage.teardown.build can attach directly without rebuilding the page.'},
   {n:8,call:'garage.teardown.build',when:'Single-object alternative only; skip for the two-object slot workflow.',args:'{forItem:<existing source id>,title,uploadId,parts:[{key,label,price?,unknown?}]}',why:'Attach one diagram to an existing object without clearing or rebuilding its page.'},
   {n:9,call:'garage.board.read',why:'Verify two options, teardown parts and images; check that the source page is intact.'}
  ]
 };
}
