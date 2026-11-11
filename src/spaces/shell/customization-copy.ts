import type {Lang} from '../../i18n/dict';

const columns: Lang[] = ['en','ru','ka','az','hy','tr','kk','zh'];
const copy = {
  language: ['Portal language','Язык портала','პორტალის ენა','Portalın dili','Պորտալի լեզու','Portal dili','Портал тілі','门户语言'],
  sort: ['Sort results','Сортировка результатов','შედეგების დალაგება','Nəticələri sırala','Դասավորել արդյունքները','Sonuçları sırala','Нәтижелерді сұрыптау','结果排序'],
  panels: ['Portal panels','Панели портала','პორტალის პანელები','Portal panelləri','Պորտալի վահանակներ','Portal panelleri','Портал панельдері','门户面板'],
  restore: ['Show all panels','Вернуть все панели','ყველა პანელის ჩვენება','Bütün panelləri göstər','Ցուցադրել բոլոր վահանակները','Tüm panelleri göster','Барлық панельді көрсету','显示全部面板'],
  hide: ['Hide panels','Спрятать панели','პანელების დამალვა','Panelləri gizlət','Թաքցնել վահանակները','Panelleri gizle','Панельдерді жасыру','隐藏面板'],
  previous: ['Restore previous layout','Вернуть прежний вид','წინა განლაგების აღდგენა','Əvvəlki görünüşü qaytar','Վերականգնել նախորդ տեսքը','Önceki düzeni geri getir','Алдыңғы орналасуды қайтару','还原先前布局'],
  top: ['Top AI panel','Верхняя панель AI','AI-ის ზედა პანელი','Üst AI paneli','AI-ի վերին վահանակ','Üst AI paneli','Жоғарғы AI панелі','顶部 AI 面板'],
  header: ['Space banner','Баннер пространства','სივრცის ბანერი','Məkanın banneri','Տարածքի բաններ','Alan başlığı','Кеңістік баннері','空间横幅'],
  left: ['Left · Human','Левая панель · Human','მარცხენა · Human','Sol panel · Human','Ձախ · Human','Sol panel · Human','Сол жақ · Human','左侧 · Human'],
  right: ['Right · AI','Правая панель · AI','მარჯვენა · AI','Sağ panel · AI','Աջ · AI','Sağ panel · AI','Оң жақ · AI','右侧 · AI'],
  keyboard: ['Keyboard and messages','Клавиатура и сообщения','კლავიატურა და შეტყობინებები','Klaviatura və mesajlar','Ստեղնաշար և հաղորդագրություններ','Klavye ve mesajlar','Пернетақта және хабарлар','键盘与消息'],
  providers: ['Search providers','Панель источников поиска','ძიების წყაროები','Axtarış mənbələri','Որոնման աղբյուրներ','Arama kaynakları','Іздеу көздері','搜索来源'],
  dim: ['Dim background','Затемнение фона','ფონის დაბნელება','Fonu tündləşdir','Մգացնել ֆոնը','Arka planı karart','Фонды күңгірттеу','调暗背景'],
  fridge: ['Fridge','Холодильник','მაცივარი','Soyuducu','Սառնարան','Buzdolabı','Тоңазытқыш','冰箱'],
  feed: ['Live Cards','Лента Live Cards','Live Cards','Live Cards','Live Cards','Live Cards','Live Cards','Live Cards'],
  last: ['Last search','Последний поиск','ბოლო ძიება','Son axtarış','Վերջին որոնում','Son arama','Соңғы іздеу','最近一次搜索'],
  all: ['All today','Все за сегодня','დღევანდელი ყველა','Bu günün hamısı','Այսօրվա բոլորը','Bugünkilerin tümü','Бүгінгілердің бәрі','今天的全部结果'],
  style: ['Portal style','Стиль портала','ფანჯრების სტილი','Pəncərə üslubu','Պատուհանների ոճ','Pencere stili','Терезелер стилі','窗口样式'],
  close: ['Close window','Закрыть окно','ფანჯრის დახურვა','Pəncərəni bağla','Փակել պատուհանը','Pencereyi kapat','Терезені жабу','关闭窗口'],
  study: ['Expand Study','Развернуть Study','Study-ს გაშლა','Study-ni genişləndir','Ընդարձակել Study-ն','Study alanını genişlet','Study терезесін кеңейту','展开 Study'],
  board: ['Sketchbook','Скетчбук','ჩანახატების წიგნი','Eskiz dəftəri','Էսքիզների տետր','Eskiz defteri','Эскиз дәптері','速写本'],
  notebook: ['Notebook','Блокнот','ბლოკნოტი','Bloknot','Նոթատետր','Not defteri','Қойын дәптер','笔记本'],
  cinema: ['Cinema','Кинотеатр','კინოთეატრი','Kinoteatr','Կինոթատրոն','Sinema','Кинотеатр','影院'],
  food: ['Kitchen','Кухня','სამზარეულო','Mətbəx','Խոհանոց','Mutfak','Асүй','厨房'],
  music: ['Music','Музыка','მუსიკა','Musiqi','Երաժշտություն','Müzik','Музыка','音乐'],
  books: ['Books','Книги','წიგნები','Kitablar','Գրքեր','Kitaplar','Кітаптар','图书'],
  series: ['Series','Сериалы','სერიალები','Seriallar','Սերիալներ','Diziler','Сериалдар','剧集'],
};
export type CopyKey = keyof typeof copy;
export const settingsText = (lang:Lang,key:CopyKey) => copy[key][columns.indexOf(lang)] ?? copy[key][0];
