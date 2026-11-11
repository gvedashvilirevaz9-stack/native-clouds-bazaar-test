// Intake: identify a file by its bytes first, extension second.
// Families decide which converter runs; `local` says whether the browser can do it alone.

export type Family =
  | 'image' | 'raw' | 'vector' | 'pdf' | 'document' | 'presentation' | 'sheet'
  | 'text' | 'video' | 'audio' | 'font' | 'archive' | 'design' | 'cad' | 'unknown';

export type Detected = {family: Family; format: string; mime: string; ext: string; local: boolean};

export const RAW_EXT = ['cr2', 'cr3', 'crw', 'nef', 'nrw', 'arw', 'srf', 'sr2', 'dng', 'orf', 'rw2', 'raf', 'pef', 'srw', 'x3f', '3fr', 'iiq', 'erf', 'kdc', 'mos', 'mrw', 'rwl', 'raw'];
const CODE_EXT = ['js', 'mjs', 'cjs', 'ts', 'tsx', 'jsx', 'py', 'rb', 'go', 'rs', 'java', 'kt', 'swift', 'c', 'h', 'cpp', 'hpp', 'cs', 'php', 'sh', 'ps1', 'bat', 'sql', 'css', 'scss', 'html', 'htm', 'xml', 'yaml', 'yml', 'toml', 'ini', 'cfg', 'conf', 'lua', 'r', 'm', 'dart', 'vue', 'svelte'];
const TEXT_EXT = ['txt', 'md', 'markdown', 'log', 'json', 'jsonl', 'ndjson', 'rtf', 'tex', 'srt', 'vtt', 'eml', 'ics', 'vcf', 'gcode', 'nc', 'dxf', 'obj', 'gpx', 'kml', 'geojson'];
const VIDEO_EXT = ['mp4', 'm4v', 'mov', 'webm', 'mkv', 'avi', 'wmv', 'flv', '3gp', 'mpg', 'mpeg', 'ts', 'mts', 'm2ts'];
const AUDIO_EXT = ['mp3', 'wav', 'ogg', 'oga', 'opus', 'flac', 'm4a', 'aac', 'wma', 'aiff', 'aif', 'amr'];
const SHEET_EXT = ['xlsx', 'xlsm', 'xls', 'xlsb', 'ods', 'csv', 'tsv', 'numbers'];
const DOC_EXT = ['docx', 'docm', 'odt', 'doc', 'pages', 'epub'];
const PRES_EXT = ['pptx', 'ppsx', 'odp', 'ppt', 'key'];
const CAD_EXT = ['dwg', 'dxf', 'step', 'stp', 'iges', 'igs', 'stl', '3mf', 'skp', 'f3d', 'sldprt', 'sldasm', 'ipt', 'rvt', 'ifc', 'blend', 'fbx', 'glb', 'gltf'];
const DESIGN_EXT = ['psd', 'psb', 'ai', 'eps', 'indd', 'sketch', 'fig', 'xd', 'cdr', 'afdesign', 'afphoto', 'kra', 'xcf', 'procreate'];
const ARCHIVE_EXT = ['zip', '7z', 'rar', 'gz', 'tgz', 'tar', 'bz2', 'xz'];
const FONT_EXT = ['ttf', 'otf', 'woff', 'woff2'];

export function extOf(name = '') {
  const m = /\.([a-z0-9]{1,8})$/i.exec(name);
  return m ? m[1].toLowerCase() : '';
}

const ascii = (b: Uint8Array, at: number, len: number) => String.fromCharCode(...b.slice(at, at + len));
const starts = (b: Uint8Array, sig: number[], at = 0) => sig.every((v, i) => b[at + i] === v);

function looksText(b: Uint8Array) {
  if (!b.length) return true;
  let bad = 0;
  for (let i = 0; i < b.length; i++) {
    const c = b[i];
    if (c === 0) return false;
    if (c < 9 || (c > 13 && c < 32 && c !== 27)) bad++;
  }
  return bad / b.length < 0.02;
}

const d = (family: Family, format: string, mime: string, ext: string, local = true): Detected => ({family, format, mime, ext, local});

export async function detect(file: Blob, name = ''): Promise<Detected> {
  const ext = extOf(name);
  const b = new Uint8Array(await file.slice(0, 4096).arrayBuffer());

  // Camera RAW files are often TIFF containers, so the extension wins over the TIFF signature.
  if (RAW_EXT.includes(ext)) return d('raw', 'RAW ' + ext.toUpperCase(), 'image/x-raw', ext);
  if (ascii(b, 0, 15) === 'FUJIFILMCCD-RAW') return d('raw', 'RAW RAF', 'image/x-fuji-raf', ext || 'raf');

  if (starts(b, [0xff, 0xd8, 0xff])) return d('image', 'JPEG', 'image/jpeg', ext || 'jpg');
  if (starts(b, [0x89, 0x50, 0x4e, 0x47])) return d('image', 'PNG', 'image/png', ext || 'png');
  if (ascii(b, 0, 4) === 'GIF8') return d('image', 'GIF', 'image/gif', ext || 'gif');
  if (ascii(b, 0, 4) === 'RIFF') {
    const kind = ascii(b, 8, 4);
    if (kind === 'WEBP') return d('image', 'WebP', 'image/webp', ext || 'webp');
    if (kind === 'WAVE') return d('audio', 'WAV', 'audio/wav', ext || 'wav');
    if (kind === 'AVI ') return d('video', 'AVI', 'video/x-msvideo', ext || 'avi');
  }
  if (ascii(b, 0, 2) === 'BM' && b.length > 26) return d('image', 'BMP', 'image/bmp', ext || 'bmp');
  if (starts(b, [0, 0, 1, 0]) && ext === 'ico') return d('image', 'ICO', 'image/x-icon', 'ico');
  if (ascii(b, 4, 4) === 'ftyp') {
    const brand = ascii(b, 8, 4).toLowerCase();
    if (['heic', 'heix', 'hevc', 'heim', 'heis', 'mif1', 'msf1'].includes(brand)) return d('image', 'HEIC', 'image/heic', ext || 'heic');
    if (brand === 'avif' || brand === 'avis') return d('image', 'AVIF', 'image/avif', ext || 'avif');
    if (brand === 'crx ') return d('raw', 'RAW CR3', 'image/x-canon-cr3', ext || 'cr3');
    if (brand.startsWith('m4a') || brand === 'm4b ') return d('audio', 'M4A', 'audio/mp4', ext || 'm4a');
    if (brand.startsWith('qt')) return d('video', 'MOV', 'video/quicktime', ext || 'mov');
    return d('video', 'MP4', 'video/mp4', ext || 'mp4');
  }
  if (starts(b, [0x49, 0x49, 0x2a, 0]) || starts(b, [0x4d, 0x4d, 0, 0x2a])) return d('image', 'TIFF', 'image/tiff', ext || 'tif');
  if (ascii(b, 0, 5) === '%PDF-') return d('pdf', ext === 'ai' ? 'Illustrator (PDF)' : 'PDF', 'application/pdf', ext || 'pdf');
  if (ascii(b, 0, 4) === '8BPS') return d('design', 'Photoshop', 'image/vnd.adobe.photoshop', ext || 'psd', false);
  if (ascii(b, 0, 4) === '%!PS') return d('design', 'PostScript / EPS', 'application/postscript', ext || 'eps', false);
  if (ascii(b, 0, 4) === 'AC10') return d('cad', 'AutoCAD DWG', 'image/vnd.dwg', ext || 'dwg', false);
  if (ascii(b, 0, 4) === 'OggS') return d('audio', 'Ogg', 'audio/ogg', ext || 'ogg');
  if (ascii(b, 0, 4) === 'fLaC') return d('audio', 'FLAC', 'audio/flac', ext || 'flac');
  if (ascii(b, 0, 3) === 'ID3' || (b[0] === 0xff && (b[1] & 0xe0) === 0xe0 && AUDIO_EXT.includes(ext))) return d('audio', 'MP3', 'audio/mpeg', ext || 'mp3');
  if (starts(b, [0x1a, 0x45, 0xdf, 0xa3])) return d('video', ext === 'mkv' ? 'Matroska' : 'WebM', ext === 'mkv' ? 'video/x-matroska' : 'video/webm', ext || 'webm');
  if (['wOFF', 'wOF2', 'OTTO'].includes(ascii(b, 0, 4)) || (starts(b, [0, 1, 0, 0]) && FONT_EXT.includes(ext))) return d('font', 'Font ' + (ext || 'ttf').toUpperCase(), 'font/' + (ext || 'ttf'), ext || 'ttf');

  if (starts(b, [0x50, 0x4b, 0x03, 0x04]) || starts(b, [0x50, 0x4b, 0x05, 0x06])) {
    if (['docx', 'docm', 'odt', 'epub', 'pages'].includes(ext)) return d('document', ext.toUpperCase(), 'application/zip', ext);
    if (['xlsx', 'xlsm', 'ods', 'numbers'].includes(ext)) return d('sheet', ext.toUpperCase(), 'application/zip', ext, ext !== 'numbers');
    if (['pptx', 'ppsx', 'odp', 'key'].includes(ext)) return d('presentation', ext.toUpperCase(), 'application/zip', ext);
    if (['3mf'].includes(ext)) return d('cad', '3MF', 'model/3mf', ext, false);
    if (['sketch', 'fig', 'xd', 'afdesign', 'kra', 'procreate'].includes(ext)) return d('design', ext.toUpperCase(), 'application/zip', ext, false);
    // Office files saved without an extension still carry their folder names near the start.
    const head = ascii(b, 0, b.length);
    if (head.includes('word/')) return d('document', 'DOCX', 'application/zip', 'docx');
    if (head.includes('xl/')) return d('sheet', 'XLSX', 'application/zip', 'xlsx');
    if (head.includes('ppt/')) return d('presentation', 'PPTX', 'application/zip', 'pptx');
    return d('archive', 'ZIP', 'application/zip', ext || 'zip');
  }
  if (starts(b, [0xd0, 0xcf, 0x11, 0xe0])) {
    if (['xls'].includes(ext)) return d('sheet', 'Excel 97', 'application/vnd.ms-excel', ext);
    if (['ppt'].includes(ext)) return d('presentation', 'PowerPoint 97', 'application/vnd.ms-powerpoint', ext, false);
    return d('document', ext === 'msg' ? 'Outlook MSG' : 'Word 97', 'application/msword', ext || 'doc', false);
  }
  if (ascii(b, 0, 6) === '7z\xbc\xaf\x27\x1c' || ascii(b, 0, 4) === 'Rar!' || starts(b, [0x1f, 0x8b]) || ascii(b, 257, 5) === 'ustar') return d('archive', (ext || 'archive').toUpperCase(), 'application/octet-stream', ext, false);

  if (CAD_EXT.includes(ext)) {
    if (['dxf', 'gltf', 'obj'].includes(ext) || (ext === 'stl' && ascii(b, 0, 5) === 'solid')) return d('cad', ext.toUpperCase(), 'text/plain', ext, false);
    return d('cad', ext.toUpperCase(), 'application/octet-stream', ext, false);
  }
  if (DESIGN_EXT.includes(ext)) return d('design', ext.toUpperCase(), 'application/octet-stream', ext, false);

  if (looksText(b)) {
    const head = new TextDecoder().decode(b).trimStart().slice(0, 400).toLowerCase();
    if (ext === 'svg' || (head.startsWith('<svg') || (head.startsWith('<?xml') && head.includes('<svg')))) return d('vector', 'SVG', 'image/svg+xml', 'svg');
    if (['csv', 'tsv'].includes(ext)) return d('sheet', ext.toUpperCase(), 'text/csv', ext);
    if (ext === 'rtf' || head.startsWith('{\\rtf')) return d('document', 'RTF', 'application/rtf', 'rtf');
    if (CODE_EXT.includes(ext)) return d('text', 'Code ' + ext.toUpperCase(), 'text/plain', ext);
    if (ext === 'json' || ((head.startsWith('{') || head.startsWith('[')) && !ext)) return d('text', 'JSON', 'application/json', ext || 'json');
    if (['md', 'markdown'].includes(ext)) return d('text', 'Markdown', 'text/markdown', ext);
    return d('text', ext ? ext.toUpperCase() + ' text' : 'Text', 'text/plain', ext || 'txt');
  }

  if (VIDEO_EXT.includes(ext)) return d('video', ext.toUpperCase(), 'video/' + ext, ext);
  if (AUDIO_EXT.includes(ext)) return d('audio', ext.toUpperCase(), 'audio/' + ext, ext);
  if (SHEET_EXT.includes(ext)) return d('sheet', ext.toUpperCase(), 'application/octet-stream', ext, ext !== 'numbers');
  if (DOC_EXT.includes(ext)) return d('document', ext.toUpperCase(), 'application/octet-stream', ext, false);
  if (PRES_EXT.includes(ext)) return d('presentation', ext.toUpperCase(), 'application/octet-stream', ext, false);
  if (ARCHIVE_EXT.includes(ext)) return d('archive', ext.toUpperCase(), 'application/octet-stream', ext, false);
  if (FONT_EXT.includes(ext)) return d('font', 'Font ' + ext.toUpperCase(), 'font/' + ext, ext);
  return d('unknown', ext ? ext.toUpperCase() : 'Unknown', file.type || 'application/octet-stream', ext, false);
}

export const FAMILY_LABEL: Record<Family, {ru: string; en: string; icon: string}> = {
  image: {ru: 'Изображение', en: 'Image', icon: '🖼'},
  raw: {ru: 'RAW-фото', en: 'RAW photo', icon: '📷'},
  vector: {ru: 'Вектор', en: 'Vector', icon: '✒'},
  pdf: {ru: 'PDF', en: 'PDF', icon: '📄'},
  document: {ru: 'Документ', en: 'Document', icon: '📝'},
  presentation: {ru: 'Презентация', en: 'Presentation', icon: '📊'},
  sheet: {ru: 'Таблица', en: 'Spreadsheet', icon: '▦'},
  text: {ru: 'Текст / код', en: 'Text / code', icon: '≡'},
  video: {ru: 'Видео', en: 'Video', icon: '🎞'},
  audio: {ru: 'Аудио', en: 'Audio', icon: '♪'},
  font: {ru: 'Шрифт', en: 'Font', icon: 'Aa'},
  archive: {ru: 'Архив', en: 'Archive', icon: '🗜'},
  design: {ru: 'Дизайн-файл', en: 'Design file', icon: '◩'},
  cad: {ru: 'Чертёж / 3D', en: 'Drawing / 3D', icon: '⌖'},
  unknown: {ru: 'Неизвестный формат', en: 'Unknown format', icon: '?'},
};
