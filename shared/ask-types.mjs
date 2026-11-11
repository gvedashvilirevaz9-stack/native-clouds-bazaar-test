// Grok 2026-11-04 (askwindows): data-driven question windows for My Space ("Кто это такой", "Что это такое"…).
// Add a type = add one object here. visible:false keeps it in the registry (agents can open it) but hides its top-bar button.
// depth: simple = простой читатель, expert = разбирающийся, thesis = уровень диссертации.
const P=(id,ru,en,depth,prompt,on=false)=>({id,ru,en,depth,prompt,on});
const SRC=P('sources','Источники','Sources','expert','Перечисли 3–8 проверяемых источников со ссылками (официальный сайт, Википедия, первоисточник, авторитетные СМИ или научные публикации). Для каждой ссылки — одна строка, что именно там подтверждается. Не выдумывай URL: если не уверен, не давай ссылку.',true);
const PIC=P('images','Картинки','Images','simple','Подбери 1–4 изображения по теме: прямые https-ссылки на картинки (Wikimedia Commons, официальный сайт). Первую положи в imageUrl карточки. Для каждой — короткая подпись, что на ней.',true);
export const ASK_DEPTHS=[{id:'simple',ru:'простой',en:'simple'},{id:'expert',ru:'разбирающийся',en:'informed'},{id:'thesis',ru:'диссертация',en:'thesis'}];
export const ASK_TYPES=[
 {id:'how',ru:'Как это работает',en:'How it works',icon:'◈',visible:true,scene:true,
  base:'Объясни, как устроено и работает «{topic}»: из каких частей состоит, что делает каждая часть и в какой последовательности они взаимодействуют. Начни с одной фразы-сути, затем — подробности.',
  presets:[P('principle','Принцип','Principle','simple','Объясни основной принцип работы простыми словами, как для школьника, с бытовой аналогией.',true),
   P('parts','Детали','Parts','simple','Перечисли основные детали/узлы и роль каждой в одну строку.',true),
   P('sequence','Последовательность','Sequence','expert','Опиши по шагам, что происходит от запуска до результата (вход → преобразование → выход).'),
   PIC,
   P('physics','Физика / формулы','Physics','thesis','Дай физическую/математическую модель: ключевые законы, формулы с обозначениями, типичные величины и единицы.'),
   P('history','История','History','expert','Кратко: кто и когда изобрёл, главные этапы развития, как менялась конструкция.'),
   P('video','Видео','Video','simple','Дай 1–3 ссылки на понятные видео-объяснения (YouTube) с названием канала.'),
   SRC]},
 {id:'who',ru:'Кто это такой',en:'Who is this',icon:'👤',visible:true,
  base:'Расскажи, кто такой «{topic}»: чем известен, почему о нём говорят, ключевые факты биографии. Отделяй проверенные факты от мнений. Если имя неоднозначно — назови самого известного носителя и перечисли других.',
  presets:[P('person','Личность','Person','simple','Кратко: полное имя, годы жизни, страна, образование, семья (только публичное), 3–5 фактов, которые стоит знать.',true),
   P('role','Публичная роль','Public role','simple','Чем занимается сейчас: должности, компании, организации, сфера влияния и на кого влияет.',true),
   P('projects','Проекты','Projects','expert','Главные проекты, работы, компании или достижения — с годами и одной строкой результата у каждого.',true),
   P('interviews','Интервью','Interviews','expert','Ключевые интервью и выступления: где, когда, главные тезисы своими словами и ссылка.'),
   P('news','Новости','News','simple','Самые свежие новости о человеке (последние месяцы) с датами и источником. Пиши, если сведений после твоей даты знаний нет.'),
   P('critique','Критика','Criticism','thesis','Основные спорные моменты, критика и скандалы: суть, кто критикует, ответ самого человека. Нейтрально, без оценок.'),
   P('photos','Фото','Photos','simple','1–3 публичных фото (прямые https-ссылки, предпочтительно Wikimedia Commons); первое — в imageUrl.',true),
   SRC]},
 {id:'what',ru:'Что это такое',en:'What is this',icon:'❓',visible:true,
  base:'Объясни, что такое «{topic}»: определение в одну фразу, для чего это нужно, к какой категории относится и чем отличается от похожего.',
  presets:[P('definition','Определение','Definition','simple','Простое определение без терминов + одна бытовая аналогия.',true),
   P('purpose','Зачем нужно','Purpose','simple','Где и зачем используется, кому полезно, 3 примера применения.',true),
   P('types','Виды','Types','expert','Основные виды/разновидности с отличиями (можно таблицей в тексте).'),
   P('compare','Отличия от похожего','Compared','expert','С чем это часто путают и чем отличается.'),
   P('wiki','Техописание из Википедии','Wikipedia','thesis','Строгое техническое/научное описание в стиле энциклопедии: термины, характеристики, классификация, ссылка на статью Википедии.'),
   PIC,
   P('history','История','History','expert','Происхождение термина/предмета и ключевые даты.'),
   SRC]},
 {id:'where',ru:'Где это находится',en:'Where is it',icon:'📍',visible:true,
  base:'Определи, где находится «{topic}»: страна, регион, город, точный адрес или координаты, как добраться. Если мест несколько — перечисли главные.',
  presets:[P('location','Адрес и координаты','Location','simple','Точный адрес, координаты (широта, долгота) и ссылка на карту (Google Maps или OpenStreetMap).',true),
   P('map','Координаты / Карта','Map','simple','Если это реальное место — верни card.geo = {lat, lng, place}: координаты в десятичных градусах и place — название/адрес для поиска на карте. Если точных координат нет — только place. Для абстрактных вопросов geo не нужно.',true),
   P('route','Как добраться','Getting there','simple','Как добраться из ближайшего крупного города: транспорт, время, ориентировочная стоимость.',true),
   P('hours','Часы и цены','Hours & prices','simple','Часы работы, стоимость входа, нужна ли бронь (с пометкой, что данные надо проверить).'),
   P('around','Рядом','Nearby','expert','Что интересного рядом в радиусе 5 км.'),
   P('about','О месте','About','expert','Чем место известно, история, интересные факты.'),
   PIC,
   P('tips','Советы','Tips','simple','Практические советы: лучшее время, безопасность, что взять.'),
   SRC]},
 {id:'howto',ru:'Как это сделать',en:'How to do it',icon:'🛠',visible:true,
  base:'Объясни, как сделать «{topic}». Сначала оцени сложность, время и стоимость, затем дай понятную пошаговую инструкцию. Предупреди об опасных шагах.',
  presets:[P('steps','Пошаговая инструкция','Step by step','simple','Пронумерованные шаги, по одному действию на шаг, с ожидаемым результатом после ключевых шагов.',true),
   PIC,
   P('wiki','Техописание из Википедии','Wikipedia','thesis','Техническое описание процесса/технологии в стиле Википедии: принцип, параметры, нормы, ссылка на статью.'),
   P('maker','Описание производителя','Manufacturer','expert','Что рекомендует производитель/официальная документация: инструкция, допуски, гарантия, ссылка на мануал.'),
   P('video','Видео','Video','simple','1–3 ссылки на видеоинструкции (YouTube) с названием канала и длительностью.',true),
   P('tools','Инструменты / материалы','Tools & materials','simple','Список инструментов и материалов с количеством и примерной ценой.',true),
   P('mistakes','Ошибки и советы','Mistakes & tips','expert','Типичные ошибки новичков, как их избежать, и советы профессионалов.'),
   SRC]},
 {id:'choose',ru:'Что лучше выбрать',en:'What to choose',icon:'⚖️',visible:true,
  base:'Помоги выбрать: «{topic}». Определи варианты, критерии выбора и дай чёткую рекомендацию для разных сценариев. Не рекламируй — сравнивай честно.',
  presets:[P('options','Варианты','Options','simple','3–5 лучших вариантов с одной строкой «кому подходит».',true),
   P('criteria','Критерии','Criteria','expert','Ключевые критерии выбора и почему они важны.',true),
   P('table','Сравнение','Comparison','expert','Сравнение вариантов по критериям (текстом-таблицей: вариант — плюсы — минусы — цена).',true),
   P('verdict','Вердикт','Verdict','simple','Итог: лучший в целом, лучший бюджетный, лучший премиум — по одной фразе почему.',true),
   P('prices','Цены','Prices','simple','Ориентировочные цены и где купить (с пометкой, что цены надо проверить).'),
   P('reviews','Отзывы','Reviews','expert','Что пишут пользователи и эксперты: частые плюсы и жалобы.'),
   PIC,
   SRC]},
 {id:'cost',ru:'Сколько стоит',en:'How much',icon:'💰',visible:false,
  base:'Оцени, сколько стоит «{topic}»: диапазон цен, от чего зависит цена, где дешевле. Укажи валюту и дату актуальности.',
  presets:[P('range','Диапазон','Range','simple','Минимальная, типичная и максимальная цена.',true),P('factors','Факторы','Factors','expert','От чего зависит цена.'),P('where','Где купить','Where to buy','simple','Где купить и где дешевле.'),SRC]},
 {id:'when',ru:'Когда',en:'When',icon:'🗓',visible:false,
  base:'Ответь, когда «{topic}»: точная дата/время или период, часовой пояс, и связанные даты.',
  presets:[P('date','Дата','Date','simple','Точная дата и время с часовым поясом.',true),P('timeline','Хронология','Timeline','expert','Связанные события по датам.'),SRC]},
 {id:'why',ru:'Почему',en:'Why',icon:'🤔',visible:false,
  base:'Объясни, почему «{topic}»: главные причины, механизм, доказательства и альтернативные объяснения.',
  presets:[P('short','Коротко','Short','simple','Ответ в 2–3 фразах.',true),P('causes','Причины','Causes','expert','Причины по значимости.'),P('evidence','Доказательства','Evidence','thesis','Исследования и данные.'),SRC]},
 {id:'news',ru:'Что нового',en:"What's new",icon:'📰',visible:false,
  base:'Расскажи, что нового по теме «{topic}»: главные свежие события с датами и источниками.',
  presets:[P('latest','Последнее','Latest','simple','5 последних событий с датами.',true),P('context','Контекст','Context','expert','Почему это важно.'),SRC]},
 {id:'fact',ru:'Правда или нет',en:'True or false',icon:'✔︎',visible:false,
  base:'Проверь утверждение «{topic}»: вердикт (правда / ложь / частично / недостаточно данных), аргументы и источники.',
  presets:[P('verdict','Вердикт','Verdict','simple','Вердикт одним словом и одной фразой.',true),P('evidence','Доводы','Evidence','expert','Доводы за и против.'),SRC]},
 {id:'advice',ru:'Что посоветуешь',en:'Advice',icon:'💡',visible:false,
  base:'Дай совет по теме «{topic}»: учти контекст человека, предложи 2–3 варианта действий и что сделать первым.',
  presets:[P('plan','План','Plan','simple','Короткий план из 3–5 шагов.',true),P('risks','Риски','Risks','expert','Чего опасаться.'),SRC]},
];
export const ASK_SOURCES={openai:'ChatGPT',grok:'Grok',anthropic:'Anthropic',gemini:'Gemini'};
export const askIds=ASK_TYPES.map(t=>t.id);
export const askType=id=>ASK_TYPES.find(t=>t.id===id);
export const defaultPresets=id=>(askType(id)?.presets||[]).filter(p=>p.on).map(p=>p.id);
export const ASK_CARD_SCHEMA={type:'object',required:['title','sections'],properties:{
 title:{type:'string',maxLength:200},summary:{type:'string',maxLength:600},imageUrl:{type:'string',description:'https image URL'},
 sections:{type:'array',maxItems:12,items:{type:'object',required:['preset','text'],properties:{preset:{type:'string',description:'preset id from enabled presets'},title:{type:'string'},text:{type:'string',maxLength:4000},images:{type:'array',items:{type:'string'}}}}},
 links:{type:'array',maxItems:12,items:{type:'object',required:['url'],properties:{title:{type:'string'},url:{type:'string'}}}},
 geo:{type:'object',description:'where cards: {lat,lng,place} — real-place coordinates (decimal degrees) and/or a place query; shows a map'},source:{enum:Object.keys(ASK_SOURCES)}}};
// askbuild: card -> «Как это работает» build prompt (read-only).
export const ASK_BUILD_TYPES=['what','how','howto'];
export function askBuildTemplate(type,item){
 if(!item)throw Error('ASK_ITEM_NOT_FOUND');
 const facts=(item.sections||[]).filter(s=>['definition','wiki','principle','parts','summary','steps'].includes(s.preset)).map(s=>s.title+': '+s.text).join('\n').slice(0,3000);
 return {type,itemId:item.id,topic:item.title,buildId:item.buildId||null,facts,
  prompt:'Сделай интерактивную сборку «Как это работает» для темы «'+item.title+'» по фактам карточки. 3–8 деталей (parts). Для каждой детали: key латиницей, label по-русски, speech — одна простая фраза по-русски для обычного человека; x/y — положение в покое на холсте 800×400; dx/dy — куда деталь отъезжает при «разборке» (слайдер 100%); turn — поворот в градусах, если деталь вращается. Рисуй paths (SVG d, hex-цвета). lang:"ru", добавь translations.en {title,description,parts:{key:{label,speech}}}. Отправь scene.create {document, attachTo:{type:"'+type+'",itemId:"'+item.id+'"}}.',
  call:{commandId:'scene.create',args:{document:'<scene v1>',attachTo:{type,itemId:item.id}}}};
}
export function askTemplate(id,enabled,topic){
 const t=askType(id);if(!t)throw Error('UNKNOWN_ASK_TYPE');
 const on=(enabled||defaultPresets(id)).filter(p=>t.presets.some(x=>x.id===p));
 const presets=t.presets.filter(p=>on.includes(p.id)).map(({id,ru,depth,prompt})=>({id,title:ru,depth,prompt}));
 const base=topic?t.base.replace('{topic}',topic):t.base;
 return {type:id,title:t.ru,base,presets,prompt:[base,...presets.map(p=>'['+p.title+'] '+p.prompt),'Ответь по-русски, если человек не просил иначе. Верни ОДИН JSON по cardSchema: одна секция на каждый включённый пресет (preset = его id).'].join('\n'),cardSchema:ASK_CARD_SCHEMA,
  save:id==='how'?'Для «Как это работает» используй scene.request/scene.answer (интерактивная сборка); можно также ask.save с type=how для простой карточки.':'Сохрани результат командой ask.save {type, card}.'};
}
const str=(v,n)=>typeof v==='string'&&v.trim()?v.trim().slice(0,n):'';
const url=v=>{const s=str(v,2000);return /^https?:\/\/\S+$/i.test(s)?s:''};
// cardmap: optional geo for where cards + keyless map embeds.
export function cleanGeo(g){if(g==null)return null;if(typeof g==='string'){const p=g.trim().slice(0,200);const m=/^\s*(-?\d+(?:\.\d+)?)\s*,\s*(-?\d+(?:\.\d+)?)\s*$/.exec(p);if(m)g={lat:+m[1],lng:+m[2]};else return p?{place:p}:null}
 if(typeof g!=='object')return null;const lat=Number(g.lat),lng=Number(g.lng??g.lon);const ok=g.lat!=null&&g.lat!==''&&Number.isFinite(lat)&&Number.isFinite(lng)&&Math.abs(lat)<=90&&Math.abs(lng)<=180;const place=str(g.place??g.query??g.name,200);if(!ok&&!place)return null;return {...(ok?{lat:Math.round(lat*1e6)/1e6,lng:Math.round(lng*1e6)/1e6}:{}),...(place?{place}:{})}}
export function mapEmbed(g,z){if(!g)return '';const q=g.lat!=null?g.lat+','+g.lng:g.place;if(!q)return '';return 'https://www.google.com/maps?q='+encodeURIComponent(q)+'&z='+(z||(g.lat!=null?16:13))+'&output=embed'}
export function osmEmbed(g){if(!g||g.lat==null)return '';const d=0.006;return 'https://www.openstreetmap.org/export/embed.html?bbox='+[g.lng-d,g.lat-d,g.lng+d,g.lat+d].join('%2C')+'&layer=mapnik&marker='+g.lat+'%2C'+g.lng}
export function cleanCard(card,id,depth=0){
 const t=askType(id);if(!t)throw Error('UNKNOWN_ASK_TYPE');
 if(!card||typeof card!=='object'||Array.isArray(card))throw Error('CARD_OBJECT_REQUIRED');
 const title=str(card.title,200);if(!title)throw Error('CARD_TITLE_REQUIRED');
 const sections=(Array.isArray(card.sections)?card.sections:[]).slice(0,12).map(s=>({preset:str(s?.preset,40),title:str(s?.title,120)||t.presets.find(p=>p.id===s?.preset)?.ru||'',text:str(s?.text,4000),images:(Array.isArray(s?.images)?s.images:[]).map(url).filter(Boolean).slice(0,4)})).filter(s=>s.text||s.images.length);
 if(!sections.length&&!str(card.summary,600))throw Error('CARD_SECTIONS_REQUIRED');
 const geo=depth?null:cleanGeo(card.geo??card.coords??null);const links=(Array.isArray(card.links)?card.links:[]).slice(0,12).map(l=>({title:str(l?.title,160),url:url(l?.url)})).filter(l=>l.url);
 // variants: optional alternative answers for a vague query (one level, max 4).
 const variants=depth?[]:(Array.isArray(card.variants)?card.variants:[]).slice(0,4).map(v=>{try{const c=cleanCard({...v,source:card.source},id,1);return {title:c.title,summary:c.summary,imageUrl:c.imageUrl,sections:c.sections,links:c.links}}catch{return null}}).filter(Boolean);
 return {title,summary:str(card.summary,600),imageUrl:url(card.imageUrl),sections,links,...(variants.length?{variants}:{}),...(geo?{geo}:{}),source:ASK_SOURCES[card.source]?card.source:'openai'};
}
