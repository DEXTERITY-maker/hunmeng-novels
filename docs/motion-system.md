# Hunmeng Motion System · Astro + React islands + GSAP + Lenis

## Что установлено

Это не миграция на Next.js. Сайт остаётся статическим Astro + TypeScript + Supabase.

Используются четыре независимых слоя:

1. **Astro HTML** — Hero, поисковая форма, ссылки, авторизация, библиотека и каталог остаются серверно сгенерированной разметкой.
2. **GSAP** — один короткий staggered entrance Hero, без ScrollTrigger и без бесконечной анимации. Только если `prefers-reduced-motion: no-preference`.
3. **Motion for React** — единый React island для сетки новых книг. `client:visible` сохраняет HTML до гидратации, обеспечивает доступность ссылок без JS и не загружает React, пока сетка не приблизится к экрану.
4. **Lenis** — плавный скролл только в каталоге и публичных редакционных разделах на широких экранах с мышью. **Нет Lenis** в ридере, аккаунте, личной библиотеке, админке и студии.

## Команды для локальной разработки

```bash
git clone https://github.com/DEXTERITY-maker/hunmeng-novels.git
cd hunmeng-novels
npm ci
npm run check
npm run build
npm run build:demo
npm test
npm run dev
```

Если переносить решение в другую ветку вручную, установите зависимости (в текущем PR `package.json` и `package-lock.json` уже обновлены):

```bash
npm install @astrojs/react react react-dom motion gsap lenis
npm install -D @types/react @types/react-dom
```

`npx astro add react` — поддерживаемая официальная альтернатива ручной настройке. Но не запускайте одновременно `astro add` и ручное редактирование конфигурации.

## Файлы и назначение

| Путь | Ответственность |
| --- | --- |
| `astro.config.mjs` | `react()` + существующий sitemap, без SSR-адаптера |
| `tsconfig.json` | `jsx: react-jsx`, `jsxImportSource: react` |
| `src/pages/index.astro` | Astro Hero и реальный список новелл + единственный `<MotionNovelGrid client:visible />` |
| `src/components/MotionNovelGrid.tsx` | SSR React-карточки с лёгким spring tilt на мыши, без hover на сенсорных устройствах |
| `src/scripts/home-hero-motion.ts` | Каскадное появление текста, поиска, навигации и featured novel |
| `src/scripts/editorial-scroll.ts` | Динамический импорт Lenis только на безопасных страницах |
| `src/styles/presentation.css` | Изолированные визуальные улучшения только главной страницы |
| `src/layouts/Layout.astro` | Последний CSS-слой + условный загрузчик Lenis |
| `tests/motion-home.spec.ts` | SSR, навигация, responsive, reduced motion и исключение аккаунта |

## Организация CSS

Глобальные стили подключаются в `Layout.astro` в фиксированном порядке: `foundation.css` (базовые правила и компоненты), `components.css` (общие компоненты, каталог и шапка), `pages.css` (страницы и атмосфера), `presentation.css` (профиль, прогресс, анимации и завершающие переопределения). `ranks-showcase.css` остаётся отдельным файлом страницы рангов. Внутри глобальных файлов указаны исходные разделы: их порядок сохраняет существующий каскад.

Правьте подходящий существующий раздел и проверяйте соседние страницы: правила могут переопределять друг друга. Не добавляйте датированные файлы `polish` или `fixes`. Не вводите глобальный `@layer` без отдельной проверки приоритетов.

## Бюджет анимаций

- Hero: единичный stagger 0,56–0,82 секунды, только `opacity` и `transform`.
- Карточка: tilt ≤5° и подъём ≤5 px, физический spring, GPU-friendly transforms.
- Плавный скролл: отключён на мобильных, при reduced motion, на экранах чтения и аккаунта.
- Нет тяжёлых WebGL-фонов, бесконечных параллаксов или бесконечных циклов GSAP.
- Пользователь с `prefers-reduced-motion: reduce` получает статичную Hero, неповорачивающиеся карточки и нативный скролл.

## Проверка в CI

`npm ci && node --test tests/*.test.mjs && npm run build && npm run build:demo && npm test`.

Особенно важно проверить при ширине 320/390/768/1440 px: доступность поисковой формы, отсутствие горизонтального скролла, кликабельные ссылки и состояние карточек до загрузки React.

## Ссылки на официальную документацию

- Astro React: https://docs.astro.build/en/guides/integrations-guide/react/
- Motion for React: https://motion.dev/docs/react-installation
- GSAP matchMedia: https://gsap.com/docs/v3/GSAP/gsap.matchMedia%28%29/
- Lenis: https://github.com/darkroomengineering/lenis
