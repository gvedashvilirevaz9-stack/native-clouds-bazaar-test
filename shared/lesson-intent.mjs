export function lessonIntent(text){
 const phrase=String(text||'').toLowerCase().replace(/ё/g,'е');
 if(!/(?:как\s+(?:это\s+)?(?:работа(?:ет|ют)|устроен[оаы]?)|how\s+(?:does|do)\b.*\bwork\b|how\s+.*\bworks?\b|როგორ\s+მუშაობს)/u.test(phrase))return null;
 const template=/(?:вентилятор[а-я]*|\bfans?\b|ვენტილატორ)/u.test(phrase)?'fan':/(?:велосипед[а-я]*|\b(?:bicycles?|bikes?)\b|ველოსიპედ)/u.test(phrase)?'bicycle':null;
 return {format:'how-it-works',template};
}
