// Output scenarios for the Media cabinet: what the person wants to MAKE from frames or pictures.
// "local" scenarios are done by the portal right away; the others go to the agent with their prompt,
// together with the selected images, and the agent writes the result back through the normal commands
// (garage.notebook.write, intake.add, estimate.create, garage.board.*, …).

export type OutputId = 'gif' | 'board' | 'notebook' | 'pdf' | 'document' | 'recipe' | 'menu' | 'presentation' | 'book' | 'instructions' | 'review' | 'explain' | 'remove-bg' | 'estimate';
export type Output = {
  id: OutputId; icon: string; ru: string; en: string; hintRu: string; hintEn: string;
  local?: boolean;
  /** Instruction the agent receives with the images (frames carry their timestamps). */
  prompt: string;
  /** Where the agent should put the result. */
  deliver: string;
};

export const OUTPUTS: Output[] = [
  {id: 'gif', icon: '🎞', ru: 'Гифка / мем', en: 'GIF / meme', hintRu: 'Картинки в ряд → GIF, MP4; подписи, Ч/Б', hintEn: 'Pictures in a row → GIF, MP4; captions, B/W', local: true, prompt: '', deliver: ''},
  {id: 'board', icon: '▦', ru: 'На доску', en: 'To the board', hintRu: 'Кадры рядом, сравнить, собрать', hintEn: 'Side by side, compare, compose', local: true, prompt: '', deliver: ''},
  {id: 'notebook', icon: '✎', ru: 'В блокнот', en: 'To the notebook', hintRu: 'Картинки к странице + таймкоды', hintEn: 'Images on the page + timestamps', local: true, prompt: '', deliver: ''},
  {id: 'pdf', icon: '⎙', ru: 'PDF-раскадровка', en: 'Storyboard PDF', hintRu: 'Кадры с таймкодами и заметками', hintEn: 'Frames with timestamps and notes', local: true, prompt: '', deliver: ''},
  {id: 'document', icon: '📄', ru: 'Документ', en: 'Document', hintRu: 'Связный текст с иллюстрациями', hintEn: 'A written piece with illustrations',
    prompt: 'Write a clear document from these images (and the video transcript if present). Use each image as an illustration where it fits, keep timestamps as references, add headings.', deliver: 'garage.notebook.write (mode new-leaf) + garage.notebook.attach for each image in order'},
  {id: 'recipe', icon: '🍳', ru: 'Рецепт', en: 'Recipe', hintRu: 'Ингредиенты, шаги по кадрам, время', hintEn: 'Ingredients, steps by frame, timing',
    prompt: 'Turn the cooking frames into a recipe: title, servings, ingredient list with quantities (ask if unsure), numbered steps — one step per frame, citing its timestamp — cooking times and temperatures. Use the transcript to fill quantities.', deliver: 'garage.notebook.write with the recipe + garage.notebook.attach frames; optionally estimate.create (template groceries) for the shopping list'},
  {id: 'menu', icon: '🍽', ru: 'Меню', en: 'Menu', hintRu: 'Карточки блюд с фото и описанием', hintEn: 'Dish cards with photo and blurb',
    prompt: 'Make a menu: one dish per frame with an appetising name, a one-line description, key ingredients and an indicative price if the person gave a price level.', deliver: 'garage.board.add_note per dish next to its frame, or garage.notebook.write'},
  {id: 'presentation', icon: '🖥', ru: 'Презентация', en: 'Presentation', hintRu: 'Слайд на кадр: заголовок и тезисы', hintEn: 'One slide per image: title and points',
    prompt: 'Build a short presentation: one slide per image, a title and 2–4 bullet points each, plus a title slide and a closing slide. Keep text short.', deliver: 'garage.format.add + garage.board.add_note per slide on the board, in order (or a Slides artifact if the host provides one)'},
  {id: 'book', icon: '📖', ru: 'Книжка', en: 'Booklet', hintRu: 'Страницы: картинка + текст', hintEn: 'Pages: picture + text',
    prompt: 'Make a small illustrated booklet: one page per image with a paragraph of text that tells a continuous story or explanation. Ask for tone and audience (children, adults) if unknown.', deliver: 'garage.notebook.write one leaf per page (mode new-leaf) + garage.notebook.attach the matching image'},
  {id: 'instructions', icon: '🔧', ru: 'Пошаговая инструкция', en: 'Step-by-step guide', hintRu: 'Шаги по кадрам, инструменты, предупреждения', hintEn: 'Steps by frame, tools, warnings',
    prompt: 'Write step-by-step instructions: one step per image with what to do, tools and materials, and safety warnings. Cite timestamps for video frames.', deliver: 'garage.notebook.write + garage.notebook.attach'},
  {id: 'review', icon: '🎬', ru: 'Разбор кадра (кинокритик)', en: 'Shot analysis', hintRu: 'Композиция, свет, цвет, смысл', hintEn: 'Composition, light, colour, meaning',
    prompt: 'Analyse each frame like a film critic: composition and framing, camera angle and lens feel, lighting, colour palette, blocking, what the shot means in the scene. Keep each analysis to 4–6 sentences and cite the timestamp.', deliver: 'garage.board.add_note next to each frame + garage.notebook.write a combined annotation'},
  {id: 'explain', icon: '◈', ru: 'Объяснить (в энциклопедию)', en: 'Explain (to encyclopedia)', hintRu: 'Что на картинке — сохранить как знание', hintEn: 'What is shown — save as knowledge',
    prompt: 'Explain what is shown: objects, parts, places or people (no identification of private persons), and why it matters for the person\'s task. Save it as an encyclopedia card.', deliver: 'ask.open {type:"what"} → ask.save with the card → ask.openItem'},
  {id: 'remove-bg', icon: '✂', ru: 'Стереть фон', en: 'Remove background', hintRu: 'Объект на прозрачном фоне', hintEn: 'Subject on transparent background',
    prompt: 'Remove the background and return the subject as a PNG with transparency (use an available background-removal tool). Keep the original size.', deliver: 'intake.add {name:"… · без фона.png", dataUrl} then intake.route to board if asked'},
  {id: 'estimate', icon: 'Σ', ru: 'Посчитать (смета)', en: 'Estimate', hintRu: 'Материалы, количество, цены', hintEn: 'Materials, quantities, prices',
    prompt: 'From these images, build an estimate: identify what has to be bought or done, quantities with the basis, prices from real shops with links and photos. Ask for one known dimension if areas are needed.', deliver: 'estimate.create {template, target, items, assumptions}'},
];
export const outputById = (id?: string | null) => OUTPUTS.find(o => o.id === id) || null;
