const spec = [
  ['rear-wheel','Заднее колесо',245,255,-80,26,'Задняя втулка получает вращение от цепи через кассету. Спицы передают усилие ободу. Когда вы перестаёте крутить педали, механизм свободного хода позволяет колесу катиться дальше.'],
  ['front-wheel','Переднее колесо',532,255,100,26,'Переднее колесо катится на подшипниках вокруг оси. Вместе с вилкой оно поворачивается и задаёт направление движения.'],
  ['frame','Рама',0,0,0,-22,'Рама соединяет оси педалей, колёс и руля. Треугольники труб помогают ей сохранять жёсткость, когда велосипедист давит на педали или наезжает на неровность.'],
  ['fork','Вилка',475,163,65,-38,'Вилка держит ось переднего колеса. Её шток проходит через подшипники в передней части рамы. Поворот руля разворачивает вилку вместе с колесом.'],
  ['saddle','Седло и штырь',340,178,-35,-68,'Седло крепится к подседельному штырю. Штырь входит в трубу рамы и фиксируется зажимом. Изменяя его высоту, подбирают положение ног при педалировании.'],
  ['cockpit','Руль и вынос',465,139,52,-66,'Вынос соединяет руль со штоком вилки. Когда руки поворачивают руль, вынос передаёт движение вилке. На руле также размещают тормозные ручки.'],
  ['drive','Цепь и звёзды',0,0,-10,82,'Зубья передней звезды тянут цепь. Цепь вращает выбранную заднюю звезду и через втулку приводит колесо в движение. Размер звёзд меняет передаточное отношение.'],
  ['pedals','Педали и шатуны',357,260,77,86,'Нога давит на педаль, а шатун работает как рычаг. Шатуны вращают вал каретки и переднюю звезду, передавая усилие цепи.']
] as const;
export const bicycle = {version:1,title:'Как устроен велосипед',description:'Восемь узлов городского велосипеда. Разведите детали и выберите ту, о которой хотите услышать.',lang:'ru',parts:spec.map(([key,label,x,y,dx,dy,speech])=>({key,art:key,label,speech,x,y,dx,dy}))};

// English narration track for the immutable, built-in bicycle edition.
export const bicycleEnglish:Record<string,string> = {
  'rear-wheel':'The sprocket drives the rear hub, and the spokes carry that turning force to the rim. When you stop pedalling, the freewheel lets the wheel keep rolling.',
  'front-wheel':'The front wheel spins on bearings around its axle. Turn the handlebars and the fork turns this wheel, steering the bicycle.',
  frame:'The frame joins the steering, the wheels and the bottom bracket. Its triangles help it keep its shape as you press the pedals or ride over a bump.',
  fork:'The fork holds the axle of the front wheel. Its steerer tube runs through bearings in the head tube, so the handlebars can turn the fork and wheel together.',
  saddle:'The saddle sits on a seatpost clamped inside the frame. Raising or lowering the post changes how far your leg extends at the bottom of each pedal stroke.',
  cockpit:'The stem connects the handlebars to the steerer tube. Turning the bars turns the fork. Brake levers on the bars let you slow down while keeping your hands in place.',
  drive:'The front chainring pulls the chain. The chain turns a rear sprocket, which drives the hub. Changing sprocket sizes changes how far the bicycle travels per turn of the cranks.',
  pedals:'Your foot pushes on a pedal. The crank arm acts as a lever, turning the axle in the bottom bracket and the chainring that pulls the chain.'
};
