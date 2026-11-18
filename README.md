# Лендинг «Тёплые балконы и лоджии под ключ»

Статический сайт без сборки: HTML, CSS, JS. Библиотеки подключены с CDN (GSAP 3.15,
Lenis 1.3, Three.js 0.170), шрифт Geologica из Google Fonts.

## Структура
```
index.html               страница
css/style.css            стили и цвета (токены в :root)
js/config.js             ← телефоны, название, директор, гарантия, адрес формы
js/calc.js               ← калькулятор, цены в объекте PRICES
js/main.js               анимации, форма, галерея
js/layers3d.js           3D-разрез утепления (Three.js)
js/layers-section.js     связка разреза со страницей
assets/img/team/         фото директора
assets/img/avito/        фото работ: work-01.webp … work-12.webp, before.webp, after.webp
assets/img/gen/          картинки от GPT (имена в docs/gpt-image-prompts.md)
docs/                    дизайн-план, референсы, задание для GPT
```

Картинки подхватываются сами: положили файл с нужным именем в папку, и он появился на
сайте. Пока файла нет, на его месте показана штриховка с именем файла.

## Что заполнить перед запуском
1. `js/config.js`: название, телефон, WhatsApp/Telegram, имя директора, город, ИНН,
   цифры «лет на рынке», «объектов» и срок гарантии.
2. Заявки: в `formEndpoint` вставьте адрес сервиса форм (например, Formspree). Если
   оставить пустым, заявка откроется в WhatsApp с готовым текстом.
3. Цены калькулятора: `js/calc.js` → `PRICES`.

## Локальный просмотр
```bash
python3 -m http.server 8770
```
и открыть http://localhost:8770

## Публикация на GitHub Pages
Репозиторий: https://github.com/ITENCH21/heated-loggia
Сайт: https://itench21.github.io/heated-loggia/

Обновить сайт после правок:
```bash
git add -A && git commit -m "Что поменяли" && git push
```
Через 1–2 минуты GitHub Pages пересоберёт сайт.
Если меняли CSS или JS, сначала обновите номер версии в `index.html`, иначе браузеры
посетителей до 10 минут будут показывать старые файлы:
```bash
V=$(date +%Y%m%d%H%M); sed -i '' -E "s/\?v=[0-9]+/?v=$V/g" index.html
``` Свой домен: Settings → Pages →
Custom domain, плюс CNAME-запись у регистратора; тогда же поменяйте адрес в
`og:image` и `og:url` в `index.html`.
