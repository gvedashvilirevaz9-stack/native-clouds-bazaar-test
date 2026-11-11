// Stylised letter shapes, shared by the SVG and the 3D rig. Width is relative to the character's own lips.
export const rest = {width: 1, open: 0};
const open = {width: 1.03, open: .86};
const round = {width: .67, open: .7};
const pursed = {width: .53, open: .44};
const wide = {width: 1.2, open: .37};
const consonant = {width: .94, open: .16};

function poseFor(letter) {
  if (/[мбпmbpმბპფ]/u.test(letter)) return rest;
  if (/[аяaა]/u.test(letter)) return open;
  if (letter === 'oo' || /[уюuუ]/u.test(letter)) return pursed;
  if (/[оёoო]/u.test(letter)) return round;
  if (/[иеэыeiyეი]/u.test(letter)) return wide;
  return consonant;
}

// A boundary-aware voice advances one word at a time. Other voices use the text of the
// current utterance as a rough guide, including its punctuation and paragraph breaks.
export function mouthTrack(text, offset, wordOnly, rate) {
  let fragment = text.slice(offset);
  if (wordOnly) fragment = fragment.match(/^[\p{L}\p{M}\p{N}’'\-]+/u)?.[0] || '';
  let end = 0;
  const cues = [];
  for (const match of fragment.matchAll(/\r?\n+|[^\S\r\n]+|\.{2,}|[!?]+|oo|ee|./giu)) {
    const unit=match[0].toLowerCase();
    let pose = rest, ms = 42;
    if (/^[\p{L}\p{N}]/u.test(unit)) {
      pose = poseFor(unit);
      ms = pose === consonant || pose === rest ? 48 : 92;
    } else if (/[.!?…\n]/u.test(unit)) ms = 340;
    else if (/[,;:—–]/u.test(unit)) ms = 175;
    end += ms / rate;
    cues.push({end, pose, offset:offset+match.index});
  }
  return cues;
}

export function mouthClock(now) {
  let cues = [], index = 0, active = false, started = 0, elapsed = 0;
  let base=0,initial=0;
  function advance(){
    const time=elapsed+(active?now()-started:0);
    while(index<cues.length&&time>=cues[index].end)index++;
  }
  return {
    cue(text, offset, wordOnly, rate, from=0) {
      base=from;initial=offset;
      cues = mouthTrack(text, offset, wordOnly, rate);
      index = 0; elapsed = 0; started = now();
    },
    audible(value) {
      if (value === active) return;
      if (value) started = now();
      else elapsed += now() - started;
      active = value;
    },
    pose() {
      if (!active) return rest;
      advance();
      return cues[index]?.pose || rest;
    },
    cursor(){
      advance();
      return base+(cues[Math.min(index,cues.length-1)]?.offset??initial);
    }
  };
}
