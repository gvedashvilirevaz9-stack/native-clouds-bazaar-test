export const regions={
 GE:{city:'Tbilisi',lang:'ka',lat:41.715,lon:44.827,currency:'GEL',tz:'Asia/Tbilisi',neighbors:['AM','AZ','TR','KZ','CN'],name:'MyMarket',search:'https://www.mymarket.ge/ka/search/?Keyword='},
 AM:{city:'Yerevan',lang:'hy',lat:40.18,lon:44.51,currency:'AMD',tz:'Asia/Yerevan',neighbors:['GE','AZ','TR','KZ','CN'],name:'List.am',search:'https://www.list.am/en/category?q='},
 AZ:{city:'Baku',lang:'az',lat:40.409,lon:49.867,currency:'AZN',tz:'Asia/Baku',neighbors:['GE','AM','TR','KZ','CN'],name:'Tap.az',search:'https://tap.az/elanlar?q%5Bkeywords%5D='},
 KZ:{city:'Astana',lang:'kk',lat:51.169,lon:71.449,currency:'KZT',tz:'Asia/Almaty',neighbors:['CN','AZ','GE','AM','TR'],name:'Kaspi',search:'https://kaspi.kz/shop/search/?text='},
 CN:{city:'Beijing',lang:'zh',lat:39.904,lon:116.407,currency:'CNY',tz:'Asia/Shanghai',neighbors:['KZ','AZ','GE','AM','TR'],name:'京东 · JD',search:'https://search.jd.com/Search?keyword='},
 TR:{city:'Ankara',lang:'tr',lat:39.933,lon:32.86,currency:'TRY',tz:'Europe/Istanbul',neighbors:['GE','AM','AZ','KZ','CN'],name:'Trendyol',search:'https://www.trendyol.com/sr?q='}
};
export const countries=Object.keys(regions);
export function validCountry(x){return typeof x==='string'&&countries.includes(x.toUpperCase())?x.toUpperCase():null}
const displayLanguages=['en','ru','ka','az','hy','tr','kk','zh'];
const regionLabels={GE:['Georgia','Грузия','საქართველო','Gürcüstan','Վրաստան','Gürcistan','Грузия','格鲁吉亚'],AM:['Armenia','Армения','სომხეთი','Ermənistan','Հայաստան','Ermenistan','Армения','亚美尼亚'],AZ:['Azerbaijan','Азербайджан','აზერბაიჯანი','Azərbaycan','Ադրբեջան','Azerbaycan','Әзербайжан','阿塞拜疆'],KZ:['Kazakhstan','Казахстан','ყაზახეთი','Qazaxıstan','Ղազախստան','Kazakistan','Қазақстан','哈萨克斯坦'],CN:['China','Китай','ჩინეთი','Çin','Չինաստան','Çin','Қытай','中国'],TR:['Türkiye','Турция','თურქეთი','Türkiyə','Թուրքիա','Türkiye','Түркия','土耳其']};
export function countryName(cc,lang){const known=regionLabels[cc]?.[displayLanguages.indexOf(lang)];if(known)return known;try{return new Intl.DisplayNames([lang],{type:'region'}).of(cc)||cc}catch{return cc}}
export const scopeIds=['local','local+world','world'];
export function queryScope(q){const t=q.normalize('NFKC').toLowerCase();
 if(/только (?:по )?(?:миру|мир|в мире)|world(?:wide)? only|only (?:worldwide|abroad)|მხოლოდ მსოფლიო|yalnız dünya|միայն աշխարհ|yalnızca dünya|тек әлем|仅全球/.test(t))return 'world';
 if(/местн.*\+.*мир|грузия \+ мир|local \+ world|ქვეყანა \+ მსოფლიო|ქვეყანაშიც და მსოფლიოშიც|ölkə \+ dünya|երկիր \+ աշխարհ|ülke \+ dünya|ел \+ әлем|本国及全球|全球和本地/.test(t))return 'local+world';
 if(/только (?:в стране|локально)|local only|მხოლოდ ქვეყანაში|yalnız ölkədə|միայն երկրում|yalnızca ülkede|тек ел ішінде|仅本国/.test(t))return 'local';return null}

