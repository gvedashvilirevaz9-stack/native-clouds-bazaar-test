// Intake categories: what the file is FOR, independent of its format.
// Each category carries the instruction and the data shape the agent should return,
// so "here are 20 receipts" becomes a defined pipeline instead of a guess.
import type {Family} from './detect';

export type CategoryId = 'receipts' | 'invoices' | 'manuals' | 'drawings' | 'design' | 'documents' | 'products' | 'program' | 'photos' | 'other';

export type Category = {
  id: CategoryId;
  icon: string;
  ru: string; en: string;
  hintRu: string; hintEn: string;
  /** Instruction the agent receives with every file of this category. */
  prompt: string;
  /** Instruction for a whole batch (what the summary should be). */
  batchPrompt: string;
  /** Shape of `data` the agent writes back per file (intake.data). */
  schema: Record<string, string>;
  /** Default output after a batch: the portal builds this view from the records. */
  output: 'ledger' | 'table' | 'notes';
};

export const CATEGORIES: Category[] = [
  {
    id: 'receipts', icon: '🧾', ru: 'Чеки', en: 'Receipts',
    hintRu: 'Покупки по дням: суммы, товары, магазины', hintEn: 'Purchases by day: totals, items, shops',
    prompt: 'This is a purchase receipt. Read it (OCR the page image if there is no text layer). Return data exactly in the schema: date as YYYY-MM-DD, shop name, every line item with name, qty, unit, unitPrice and total, the receipt total, currency (ISO code), tax if shown, payment method if shown. Do not invent values: use null when unreadable and list them in "unclear".',
    batchPrompt: 'For every receipt in the batch call intake.data with the extracted record. Then call intake.batch.summary: the portal groups by day, sums totals per currency and merges identical items. Add your own short remarks in "notes" (unusual spending, duplicates, unreadable receipts).',
    schema: {date: 'YYYY-MM-DD', time: 'HH:MM|null', shop: 'string', items: '[{name, qty, unit, unitPrice, total, category?}]', total: 'number', currency: 'ISO 4217', tax: 'number|null', payment: 'cash|card|other|null', unclear: 'string[]'},
    output: 'ledger',
  },
  {
    id: 'invoices', icon: '📑', ru: 'Счета и инвойсы', en: 'Invoices',
    hintRu: 'Поставщик, номер, сроки, НДС, к оплате', hintEn: 'Supplier, number, due date, VAT, amount due',
    prompt: 'This is an invoice or bill. Extract supplier, buyer, invoice number, issue date and due date (YYYY-MM-DD), line items, subtotal, VAT/tax, total, currency, payment details and status if visible. Use null for missing fields; never guess bank details.',
    batchPrompt: 'Call intake.data for each invoice, then intake.batch.summary. Point out overdue or soon-due invoices and duplicates in "notes".',
    schema: {number: 'string', supplier: 'string', buyer: 'string|null', date: 'YYYY-MM-DD', due: 'YYYY-MM-DD|null', items: '[{name, qty, unitPrice, total}]', subtotal: 'number|null', tax: 'number|null', total: 'number', currency: 'ISO 4217', status: 'paid|unpaid|unknown'},
    output: 'ledger',
  },
  {
    id: 'manuals', icon: '📘', ru: 'Инструкции', en: 'Manuals',
    hintRu: 'Модель, характеристики, шаги, предупреждения', hintEn: 'Model, specs, steps, warnings',
    prompt: 'This is a product manual or instruction. Identify the product and model, list key specifications with units, the essential setup/usage steps, safety warnings and the parts/consumables list. Keep page references (p. N) for every fact.',
    batchPrompt: 'Extract each manual with intake.data, then intake.batch.summary with a comparison of the products where that makes sense.',
    schema: {product: 'string', model: 'string|null', specs: '[{name, value, unit, page}]', steps: '[{n, text, page}]', warnings: 'string[]', parts: '[{name, code?, qty?}]'},
    output: 'notes',
  },
  {
    id: 'drawings', icon: '📐', ru: 'Чертежи и техдоки', en: 'Drawings & tech docs',
    hintRu: 'Детали, размеры, материалы, стандарты', hintEn: 'Parts, dimensions, materials, standards',
    prompt: 'This is a technical drawing or engineering document. Identify the object, list the parts with names (e.g. lock nut, guide rail), dimensions and tolerances, materials, standards (ISO/DIN/GOST) and the title-block data. Explain unfamiliar parts in one plain sentence each, and save those explanations to the Encyclopedia when the user asks.',
    batchPrompt: 'Extract each drawing, then summarise the assembly: bill of materials with quantities.',
    schema: {object: 'string', drawingNo: 'string|null', parts: '[{name, qty, material?, size?, standard?, explain?}]', dimensions: '[{what, value, tolerance?}]', notes: 'string[]'},
    output: 'table',
  },
  {
    id: 'design', icon: '◩', ru: 'Дизайн-файлы', en: 'Design files',
    hintRu: 'PSD, AI, Figma, Sketch: превью, слои, экспорт', hintEn: 'PSD, AI, Figma, Sketch: preview, layers, export',
    prompt: 'This is a layered design file (Photoshop, Illustrator, Figma, Sketch…). If the room shows only a placeholder, convert it with an available converter and return flattened page images via intake.attach. Then list artboards/layers, fonts, main colours (hex) and text content.',
    batchPrompt: 'Convert every file, then summarise the palette and fonts used across the set.',
    schema: {artboards: '[{name, w, h}]', layers: 'string[]', fonts: 'string[]', colors: 'string[] (hex)', texts: 'string[]'},
    output: 'notes',
  },
  {
    id: 'documents', icon: '📄', ru: 'Документы и договоры', en: 'Documents & contracts',
    hintRu: 'Стороны, даты, обязательства, риски', hintEn: 'Parties, dates, obligations, risks',
    prompt: 'This is a document or contract. Summarise it: type, parties, key dates (YYYY-MM-DD), amounts, obligations of each side, deadlines, termination terms and anything unusual. Quote clause numbers. You are not giving legal advice; flag points to check with a professional.',
    batchPrompt: 'Extract each document, then build one timeline of all dates and obligations.',
    schema: {type: 'string', parties: 'string[]', dates: '[{date, what}]', amounts: '[{value, currency, what}]', obligations: '[{party, text, clause}]', flags: 'string[]'},
    output: 'table',
  },
  {
    id: 'products', icon: '🛍', ru: 'Товары и сравнение', en: 'Products to compare',
    hintRu: 'Цены, характеристики, плюсы и минусы', hintEn: 'Prices, specs, pros and cons',
    prompt: 'This file shows a product (photo, spec sheet, shop page, catalogue). Identify it, find the current price in a shop if the user allows browsing, and return comparable specifications with units, pros and cons, and the source link.',
    batchPrompt: 'Extract every product with the same spec names so rows line up, then intake.batch.summary to build the comparison table. Place it on the board when asked.',
    schema: {name: 'string', brand: 'string|null', price: 'number|null', currency: 'ISO 4217|null', shop: 'string|null', url: 'string|null', specs: '[{name, value, unit}]', pros: 'string[]', cons: 'string[]'},
    output: 'table',
  },
  {
    id: 'program', icon: '⌘', ru: 'Программные файлы', en: 'Program files',
    hintRu: 'Код, конфиги, проекты: что это и чем открыть', hintEn: 'Code, configs, projects: what it is and how to open',
    prompt: 'This is a program, configuration or project file. Say what it is, which application or language it belongs to, how to open or run it safely, and summarise what it does. Never execute it. Point out secrets (keys, passwords) if present without repeating them.',
    batchPrompt: 'Describe each file, then describe how the files fit together as a project.',
    schema: {kind: 'string', app: 'string|null', language: 'string|null', summary: 'string', open: 'string', risks: 'string[]'},
    output: 'notes',
  },
  {
    id: 'photos', icon: '🖼', ru: 'Фото и интерьер', en: 'Photos & interiors',
    hintRu: 'Что на фото, зоны, палитра, размеры', hintEn: 'What is shown, zones, palette, sizes',
    prompt: 'Describe the photo for the user\'s task: main objects, for rooms the zones, surfaces (walls, floor, ceiling) with approximate areas when a reference size is known, the colour palette (hex) and the condition of materials. Ask the user for one known dimension before estimating areas.',
    batchPrompt: 'Describe each photo, then combine them: one list of surfaces with total areas, ready for an estimate.',
    schema: {objects: 'string[]', zones: '[{name, surfaces:[{type, areaM2?, material?, condition?}]}]', palette: 'string[] (hex)', notes: 'string[]'},
    output: 'notes',
  },
  {
    id: 'other', icon: '◇', ru: 'Другое', en: 'Other',
    hintRu: 'Агент сам спросит, что нужно', hintEn: 'The agent will ask what you need',
    prompt: 'Look at the file, tell the user in two sentences what it is, and ask what they want to do with it (board, notebook, encyclopedia, comparison, estimate). Then follow their answer.',
    batchPrompt: 'Describe the set and ask the user what result they want.',
    schema: {summary: 'string', suggestions: 'string[]'},
    output: 'notes',
  },
];

export const categoryById = (id?: string | null) => CATEGORIES.find(c => c.id === id) || null;

const KW: [CategoryId, RegExp][] = [
  ['receipts', /(кассовый чек|чек №|итого|итог:|фн[: ]|фд[: ]|фпд|receipt|subtotal.*total|thank you for shopping|cashier|касс(ир|а)|ჩეკი|სულ)/i],
  ['invoices', /(invoice|инвойс|счёт[- ]фактура|счет[- ]фактура|счёт №|счет №|bill to|due date|к оплате|amount due|vat no|ინვოისი)/i],
  ['manuals', /(manual|instruction|инструкц|руководство|user guide|safety instructions|warning:|предупреждени|bedienungsanleitung)/i],
  ['drawings', /(чертёж|чертеж|drawing no|scale 1:|масштаб 1:|допуск|tolerance|гост|din \d|iso \d{3,}|спецификация)/i],
  ['documents', /(договор|contract|agreement|соглашени|стороны|parties|настоящим|hereby|акт выполненных|доверенност)/i],
];
const NAME_KW: [CategoryId, RegExp][] = [
  ['receipts', /(receipt|чек|check|kvitt|bon\b|ticket)/i],
  ['invoices', /(invoice|инвойс|сч[её]т|bill|factura|rechnung)/i],
  ['manuals', /(manual|instruc|инструк|guide|руковод)/i],
  ['drawings', /(drawing|чертеж|чертёж|dwg|spec|cad)/i],
  ['documents', /(contract|договор|agreement|акт|nda)/i],
];

/** Suggest a category from format, file name and the first text found. */
export function suggestCategory(family: Family, name: string, text = ''): CategoryId {
  for (const [id, re] of NAME_KW) if (re.test(name)) return id;
  const code = /^```/.test(text);
  if (['pdf', 'document', 'image', 'raw', 'sheet', 'presentation'].includes(family) || (family === 'text' && !code))
    for (const [id, re] of KW) if (re.test(text.slice(0, 4000))) return id;
  if (family === 'design') return 'design';
  if (family === 'cad') return 'drawings';
  if (family === 'text') return code ? 'program' : 'documents';
  if (family === 'archive') return 'other';
  if (family === 'image' || family === 'raw') return 'photos';
  if (family === 'pdf' || family === 'document') return 'documents';
  return 'other';
}
