const langs=['en','ru','ka','az','hy','tr','kk','zh'];
const rows=`
unknown|I didn’t recognize that search|Не понял запрос|მოთხოვნა ვერ ამოვიცანი|Sorğunu tanımadım|Հարցումը չճանաչեցի|Aramayı anlayamadım|Сұрауды түсінбедім|未能识别搜索内容
choose|Choose a category below|Выбери один из ближайших разделов ниже|ქვემოთ აირჩიე ერთ-ერთი განყოფილება|Aşağıdan bölmə seçin|Ստորև ընտրեք բաժին|Aşağıdan bir kategori seçin|Төменнен санат таңдаңыз|请从下方选择类别
categories|Suggested categories|Похожие разделы|მსგავსი განყოფილებები|Oxşar bölmələr|Նման բաժիններ|Önerilen kategoriler|Ұқсас санаттар|推荐类别
open|Open category|Открыть раздел|განყოფილების გახსნა|Bölməni aç|Բացել բաժինը|Kategoriyi aç|Санатты ашу|打开类别
market|Sunrise Marketplace|Маркетплейс Sunrise|Sunrise მარკეტპლეისი|Sunrise marketpleysi|Sunrise շուկա|Sunrise pazaryeri|Sunrise маркетплейсі|Sunrise 市场
intro|What are you looking for?|Скажи, что ищешь, — соберу витрину.|რას ეძებ?|Nə axtarırsınız?|Ի՞նչ եք փնտրում։|Ne arıyorsunuz?|Не іздеп жүрсіз?|您在找什么？
matches|Search results|Результаты поиска|ძიების შედეგები|Axtarış nəticələri|Որոնման արդյունքներ|Arama sonuçları|Іздеу нәтижелері|搜索结果
offers|Offers|Предложения|შეთავაზებები|Təkliflər|Առաջարկներ|Teklifler|Ұсыныстар|商品和服务
stores|Sources|Источники|წყაროები|Mənbələr|Աղբյուրներ|Kaynaklar|Дереккөздер|来源
noOffers|No matching offers from these sources|Нет подходящих предложений у этих источников|ამ წყაროებში შესაბამისი შეთავაზება ვერ მოიძებნა|Bu mənbələrdə uyğun təklif yoxdur|Այս աղբյուրներում համապատասխան առաջարկ չկա|Bu kaynaklarda eşleşen teklif bulunamadı|Бұл дереккөздерден сәйкес ұсыныс табылмады|这些来源中没有匹配的商品
local|Local only|Только в стране|მხოლოდ ქვეყანაში|Yalnız ölkədə|Միայն երկրում|Yalnızca ülkede|Тек ел ішінде|仅本国
both|Local + world|Страна + мир|ქვეყანა + მსოფლიო|Ölkə + dünya|Երկիր + աշխարհ|Ülke + dünya|Ел + әлем|本国及全球
world|Worldwide only|Только мир|მხოლოდ მსოფლიო|Yalnız dünya|Միայն աշխարհ|Yalnızca dünya|Тек әлем|仅全球
worldshops|Global shops|Мировые магазины|მსოფლიო მაღაზიები|Dünya mağazaları|Աշխարհի խանութներ|Dünya mağazaları|Әлем дүкендері|全球商店
area|Search region|Регион поиска|ძიების რეგიონი|Axtarış regionu|Որոնման տարածաշրջան|Arama bölgesi|Іздеу аймағы|搜索地区
corridor|Middle Corridor|Средний коридор|შუა დერეფანი|Orta Dəhliz|Միջին միջանցք|Orta Koridor|Орта дәліз|中间走廊
directory|Search on the seller’s site|Поиск на сайте продавца|ძიება გამყიდველის საიტზე|Satıcının saytında axtar|Որոնել վաճառողի կայքում|Satıcının sitesinde ara|Сатушы сайтынан іздеу|在商家网站搜索
directories|Search links · availability not checked|Ссылки для поиска · наличие не проверено|საძიებო ბმულები · ხელმისაწვდომობა არ შემოწმებულა|Axtarış keçidləri · mövcudluq yoxlanmayıb|Որոնման հղումներ · առկայությունը ստուգված չէ|Arama bağlantıları · stok doğrulanmadı|Іздеу сілтемелері · қолда бары тексерілмеді|搜索链接 · 库存未经核实
auto|Auto · IP|Авто · IP|ავტო · IP|Avto · IP|Ավտո · IP|Otomatik · IP|Авто · IP|自动 · IP
sim|Test country|Тестовая страна|სატესტო ქვეყანა|Sınaq ölkəsi|Փորձնական երկիր|Test ülkesi|Сынақ елі|模拟国家
unknownGeo|Country unavailable|Страна не определена|ქვეყანა დაუდგენელია|Ölkə müəyyən edilməyib|Երկիրը որոշված չէ|Ülke belirlenemedi|Ел анықталмады|无法确定国家
unsupported|No local catalog connected|Локальный каталог не подключён|ადგილობრივი კატალოგი არ არის დაკავშირებული|Yerli kataloq qoşulmayıb|Տեղական կատալոգը միացված չէ|Yerel katalog bağlı değil|Жергілікті каталог қосылмаған|尚未接入本地目录
near|Shops on the map|Магазины на карте|მაღაზიები რუკაზე|Xəritədə mağazalar|Խանութներ քարտեզի վրա|Haritadaki mağazalar|Картадағы дүкендер|地图上的商店
all|All|Все|ყველა|Hamısı|Բոլորը|Tümü|Барлығы|全部
online|Online|Онлайн|ონლაინ|Onlayn|Առցանց|Çevrim içi|Онлайн|线上
travel|Travel|Путешествия|მოგზაურობა|Səyahət|Ճամփորդություն|Seyahat|Саяхат|旅行
real|Local places|Реальный мир|ადგილზე|Yerli məkanlar|Տեղեր|Yerel yerler|Жергілікті орындар|实体店
best|Best|Лучшее|საუკეთესო|Ən yaxşı|Լավագույնը|En iyi|Үздік|最佳
cheap|Cheapest|Дешевле|იაფი|Ucuz|Էժան|En ucuz|Арзан|低价
crypto|Crypto|Крипто|კრიპტო|Kripto|Կրիպտո|Kripto|Крипто|加密货币
lang|Menu language|Язык меню|მენიუს ენა|Menyu dili|Ցանկի լեզու|Menü dili|Мәзір тілі|菜单语言
search|Search…|Поиск…|ძიება…|Axtarış…|Որոնել…|Ara…|Іздеу…|搜索…
favorites|Favorites|Избранное|რჩეულები|Seçilmişlər|Ընտրյալներ|Favoriler|Таңдаулылар|收藏
favHint|Tap ☆ on a card to save it here|Нажми ☆ на карточке — она появится здесь|დააჭირე ☆ ბარათზე — აქ გამოჩნდება|Kartda ☆ basın|Սեղմեք քարտի ☆ նշանը|Karttaki ☆ simgesine dokunun|Карточкадағы ☆ белгісін басыңыз|点击卡片上的 ☆ 以收藏
nodata|No data|Нет данных|მონაცემები არ არის|Məlumat yoxdur|Տվյալներ չկան|Veri yok|Дерек жоқ|暂无数据
down|Source unavailable|Источник недоступен|წყარო მიუწვდომელია|Mənbə əlçatan deyil|Աղբյուրն անհասանելի է|Kaynağa ulaşılamıyor|Дереккөз қолжетімсіз|来源暂不可用
check|Check price on site|Цена на сайте|ფასი იხილეთ საიტზე|Qiymət saytda|Գինը՝ կայքում|Fiyat sitede|Бағасы сайтта|价格见网站
seller|Open seller site|Открыть на сайте|საიტის გახსნა|Saytı aç|Բացել կայքը|Siteyi aç|Сайтты ашу|打开商家网站
here|Open here ▣|Открыть здесь ▣|აქ გახსნა ▣|Burada aç ▣|Բացել այստեղ ▣|Burada aç ▣|Осында ашу ▣|在这里打开 ▣
map|On the map|На карте|რუკაზე|Xəritədə|Քարտեզի վրա|Haritada|Картада|在地图上查看
yours|YOUR SPACES|ВАШИ ПРОСТРАНСТВА|თქვენი სივრცეები|MƏKANLARINIZ|ՁԵՐ ՏԱՐԱԾՔՆԵՐԸ|ALANLARINIZ|КЕҢІСТІКТЕРІҢІЗ|您的空间
agent|Connect agent|Подключить агента|აგენტის დაკავშირება|Agenti qoş|Միացնել գործակալին|Aracıyı bağla|Агентті қосу|连接智能体
disconnected|Not connected|Не подключён|არ არის დაკავშირებული|Qoşulmayıb|Միացված չէ|Bağlı değil|Қосылмаған|未连接
agentHint|AI not connected — explore your spaces|AI не подключён — навигация по пространствам|AI არ არის დაკავშირებული — სივრცეებში ნავიგაცია|AI qoşulmayıb — məkanlara baxın|AI-ը միացված չէ․ բացահայտեք տարածքները|AI bağlı değil — alanları keşfedin|AI қосылмаған — кеңістіктерді қараңыз|AI 未连接，可浏览空间
connected|Connected|Подключён|დაკავშირებულია|Qoşulub|Միացված է|Bağlı|Қосылған|已连接
pizza|Pizza|Пицца|პიცა|Pizza|Պիցցա|Pizza|Пицца|披萨
gift|Gift|Подарок|საჩუქარი|Hədiyyə|Նվեր|Hediye|Сыйлық|礼物
giftcard|Gift card|Подарочная карта|სასაჩუქრე ბარათი|Hədiyyə kartı|Նվեր քարտ|Hediye kartı|Сыйлық картасы|购物礼品卡
directoryshort|Seller site|Внешний сайт|გამყიდველის საიტი|Satıcı saytı|Վաճառողի կայք|Satıcı sitesi|Сатушы сайты|商家网站
nearbyword|Nearby|Рядом|ახლოს|Yaxında|Մոտակայքում|Yakında|Жақын жерде|附近
shopword|Shop|Магазин|მაღაზია|Mağaza|Խանութ|Mağaza|Дүкен|商店
foodword|Delivery|Доставка|მიტანა|Çatdırılma|Առաքում|Teslimat|Жеткізу|配送
eventword|Events|События|ღონისძიებები|Tədbirlər|Միջոցառումներ|Etkinlikler|Іс-шаралар|活动
myspaces|Your spaces|Ваши пространства|თქვენი სივრცეები|Məkanlarınız|Ձեր տարածքները|Alanlarınız|Сіздің кеңістіктеріңіз|您的空间
notready|AI not connected — explore your spaces|AI не подключён — навигация по пространствам|AI არ არის დაკავშირებული — სივრცეებში ნავიგაცია|AI qoşulmayıb — məkanlara baxın|AI-ը միացված չէ․ դիտեք ձեր տարածքները|AI bağlı değil — alanlarınıza göz atın|AI қосылмаған — кеңістіктеріңізді қараңыз|AI 未连接，可浏览各空间
replycard|Agent replies and Action Cards|Ответы агента и Action Card|აგენტის პასუხები და მოქმედების ბარათები|Agent cavabları və əməliyyat kartları|Գործակալի պատասխաններն ու գործողությունների քարտերը|Ajan yanıtları ve işlem kartları|Агент жауаптары мен әрекет карталары|智能体回复和操作卡
previousspace|Previous space|Предыдущее пространство|წინა სივრცე|Əvvəlki məkan|Նախորդ տարածք|Önceki alan|Алдыңғы кеңістік|上一个空间
nextspace|Next space|Следующее пространство|შემდეგი სივრცე|Növbəti məkan|Հաջորդ տարածք|Sonraki alan|Келесі кеңістік|下一个空间
waiting|Searching live catalogs…|Собираю витрину из живых источников…|კატალოგებში ვეძებ…|Kataloqlarda axtarılır…|Որոնում կատալոգներում…|Kataloglar aranıyor…|Каталогтардан ізделуде…|正在搜索商品目录…
regionlinks|Other countries|Другие страны|სხვა ქვეყნები|Digər ölkələr|Այլ երկրներ|Diğer ülkeler|Басқа елдер|其他国家
favkMarket|Market|Маркет|მარკეტი|Market|Շուկա|Market|Маркет|市场
favkFood|Food|Еда|საკვები|Yemək|Սնունդ|Yemek|Тағам|美食
favkRecipe|Recipes|Рецепты|რეცეპტები|Reseptlər|Բաղադրատոմսեր|Tarifler|Рецепттер|食谱
favkMusic|Music|Музыка|მუსიკა|Musiqi|Երաժշտություն|Müzik|Музыка|音乐
favkMovie|Movies|Кино|კინო|Filmlər|Ֆիլմեր|Filmler|Кино|电影
favkBook|Books|Книги|წიგნები|Kitablar|Գրքեր|Kitaplar|Кітаптар|书籍
favkEmpty|Empty|Пусто|ცარიელია|Boşdur|Դատարկ է|Boş|Бос|空
favkNone|No favorites yet|Избранное пусто|რჩეულები ცარიელია|Seçilmişlər boşdur|Ընտրյալները դատարկ են|Henüz favori yok|Таңдаулылар бос|暂无收藏
favkCats|Favorite categories|Категории избранного|რჩეულების კატეგორიები|Seçilmiş kateqoriyaları|Ընտրյալների կատեգորիաներ|Favori kategorileri|Таңдаулы санаттары|收藏分类
`.trim().split('\n');
export const copy=Object.fromEntries(rows.map(r=>{const [id,...v]=r.split('|');if(v.length!==8)throw Error(id);return [id,Object.fromEntries(langs.map((l,i)=>[l,v[i]]))]}));
export const msg=(id,lang='en')=>copy[id]?.[lang]??copy[id]?.en??id;
export const uiKeys=new Map(Object.entries(copy).flatMap(([id,row])=>Object.values(row).map(v=>[v.toLowerCase(),id])));
for(const [v,id] of Object.entries({'favorit':'favorites','добавляй ★ на карточках — они появятся здесь':'favHint','избранное ★':'favorites','что подобрал':'matches','лучший выбор':'best','по запросу ·':'matches','где ты находишься:':'area','где искать':'area','ниже грузинских':'corridor','для твоих покупок':'market','источник':'stores','роутер sunrise':'categories','поиск в активном пространстве':'search','в избранное':'favorites','избранное ⭐':'favorites','не подключён':'disconnected','не подключен':'disconnected','▣ подключить агента':'agent','🌍 мировые магазины':'worldshops'}))uiKeys.set(v,id);

