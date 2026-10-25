import { test, expect, serveStatic } from './fixtures';
const chapter = '/novel/khranitel-mayaka/glava-1/';
test('главная: четыре раздела, обложки и поиск из главной в каталог', async ({ page }) => {
  await page.goto('/');
  await expect(page.getByRole('heading', { name: 'Новые новеллы' })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Последние главы' })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Популярное' })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Рекомендации' })).toBeVisible();
  await expect(page.locator('#new-novels .home-book-card')).toHaveCount(2);
  await expect(page.locator('#latest-chapters .home-chapter-link')).toHaveCount(4);
  await expect(page.locator('#popular-novels .home-popular-empty')).toBeVisible();
  await expect(page.locator('#recommended-novels .home-recommendation-card')).toHaveCount(2);
  await page.getByRole('searchbox', { name: 'Поиск новелл' }).fill('winter');
  await page.getByRole('button', { name: 'Найти' }).click();
  await expect(page).toHaveURL(/search=winter/);
  expect(new URL(page.url()).pathname).toBe('/catalog/');
  await expect(page.locator('#result-count')).toHaveText('Найдено новелл: 1');
  await expect(page.locator('[data-novel]:visible')).toHaveCount(1);
  await expect(page.locator('[data-novel]:visible h2')).toContainText('Сад');
});
test('все обновления: главная показывает четыре главы, отдельная страница — полный список', async ({ page }) => {
  await page.goto('/');
  await expect(page.locator('#latest-chapters .home-chapter-link')).toHaveCount(4);
  await page.getByRole('link', { name: 'Все обновления' }).click();
  expect(new URL(page.url()).pathname).toBe('/updates/');
  await expect(page.getByRole('heading', { name: 'Все обновления' })).toBeVisible();
  await expect(page.locator('.updates-page .home-chapter-link')).toHaveCount(7);
  await page.locator('.updates-page .home-chapter-link').first().click();
  await expect(page.locator('#chapter-text')).toBeVisible();
});
test('мобильная главная: компактное продолжение чтения и читаемые подписи', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/');
  await page.evaluate(() => {
    const progress = () => ({
      chapterSlug: 'glava-1',
      chapterNumber: 1,
      blockId: 'block-0',
      offset: 0,
      ratio: 0.3,
      updatedAt: Date.now(),
    });
    localStorage.setItem('hunmeng-novels:v1', JSON.stringify({
      version: 1,
      settings: { font: 'serif', size: 20, lineHeight: 1.85, width: 720, theme: 'system' },
      library: {},
      progress: {
        'khranitel-mayaka': progress(),
        'sad-zimy': progress(),
      },
    }));
  });
  await page.reload();
  const cards = page.locator('.home-page .continue-card');
  await expect(cards).toHaveCount(2);
  for (const card of await cards.all()) {
    const rect = await card.boundingBox();
    expect(rect).not.toBeNull();
    expect(rect!.height).toBeLessThan(150);
  }
  for (const selector of [
    '.home-book-genre',
    '.home-book-meta',
    '.home-chapter-novel',
    '.home-chapter-info time',
    '.home-recommendation-description',
    '.home-section-heading > a',
  ]) {
    const fontSize = await page.locator(selector).first().evaluate((element) =>
      parseFloat(getComputedStyle(element).fontSize),
    );
    expect(fontSize).toBeGreaterThanOrEqual(13);
  }
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBeTruthy();
});
test('новости: блок на главной и открытие полной ленты', async ({ page }) => {
  await page.goto('/');
  await expect(page.getByRole('heading', { name: 'Последние новости' })).toBeVisible();
  await expect(page.locator('#latest-news [data-news-card]')).toHaveCount(3);
  await page.locator('#latest-news').getByRole('link', { name: 'Просмотреть все' }).click();
  expect(new URL(page.url()).pathname).toBe('/news/');
  await expect(page.getByRole('heading', { name: 'Новости', exact: true })).toBeVisible();
  await expect(page.locator('#news-feed [data-news-card]:visible')).toHaveCount(4);
  await expect(page.locator('#news-pagination')).toBeVisible();
});
test('новостная лента: категории, пагинация, пустой раздел и возврат', async ({ page }) => {
  await page.goto('/news/');
  await page.locator('#news-pagination').getByRole('link', { name: '2' }).click();
  await expect(page.locator('#news-feed [data-news-card]:visible')).toHaveCount(2);
  await expect(page).toHaveURL(/page=2/);
  await page.getByRole('link', { name: 'Объявления', exact: true }).click();
  await expect(page.locator('#news-feed [data-news-card]:visible')).toHaveCount(2);
  await expect(page.locator('[data-news-filter=announcements]')).toHaveAttribute('aria-current', 'page');
  await page.getByRole('link', { name: 'Розыгрыши', exact: true }).click();
  await expect(page.locator('#news-empty')).toBeVisible();
  await expect(page.locator('#news-pagination')).toBeHidden();
  await page.getByRole('link', { name: 'Все', exact: true }).click();
  await expect(page.locator('#news-feed [data-news-card]:visible')).toHaveCount(4);
});
test('отдельная новость: статья, категории и локальные реакции', async ({ page }) => {
  await page.goto('/news/catalog-release/');
  await expect(page.getByRole('heading', { name: 'Каталог стал удобнее: расширенный поиск и оглавления' })).toBeVisible();
  await expect(page.locator('.news-article-body h3')).toHaveCount(2);
  await page.getByRole('button', { name: 'Реакция 🔥' }).click();
  await expect(page.getByRole('button', { name: 'Реакция 🔥' })).toHaveAttribute('aria-pressed', 'true');
  await page.reload();
  await expect(page.getByRole('button', { name: 'Реакция 🔥' })).toHaveAttribute('aria-pressed', 'true');
  await page.getByRole('button', { name: 'Реакция 🔥' }).click();
  await expect(page.getByRole('button', { name: 'Реакция 🔥' })).toHaveAttribute('aria-pressed', 'false');
  await page.getByRole('link', { name: 'Все новости' }).last().click();
  expect(new URL(page.url()).pathname).toBe('/news/');
});
test('мобильная страница новостей без горизонтальной прокрутки', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  for (const url of ['/news/', '/news/news-launch/']) {
    await page.goto(url);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBeTruthy();
  }
});
test('аккаунт и редакторская панель безопасно отключены до настройки сервера', async ({ page }) => {
  await page.goto('/account/');
  await expect(page.getByRole('heading', { name: 'Аккаунт' })).toBeVisible();
  await expect(page.locator('#account-status')).toContainText('Сервер ещё не подключён');
  await expect(page.getByRole('button', { name: 'Продолжить' })).toBeDisabled();
  await page.goto('/admin/');
  await expect(page.getByRole('heading', { name: 'Управление переводами' })).toBeVisible();
  await expect(page.locator('#admin-workspace')).toBeHidden();
  await expect(page.locator('#admin-status')).toContainText('Backend ещё не подключён');
});
test('статические страницы, SEO и отсутствие внешних запросов', async ({ page }) => {
  const errors: string[] = [],
    external: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  page.on('request', (r) => {
    if (!r.url().startsWith('http://127.0.0.1:4321') && !r.url().startsWith('data:'))
      external.push(r.url());
  });
  for (const route of [
    '/',
    '/catalog/',
    '/updates/',
    '/news/',
    '/news/news-launch/',
    '/account/',
    '/admin/',
    '/library/',
    '/novel/khranitel-mayaka/',
    chapter,
    '/about/',
    '/rules/',
    '/contacts/',
    '/rights/',
    '/404/',
  ]) {
    await page.goto(route);
    await expect(page.locator('h1')).toBeVisible();
    expect(await page.locator('html').getAttribute('lang')).toBe('ru');
    expect(await page.locator('meta[name=description]').getAttribute('content')).toBeTruthy();
    expect(
      await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth),
    ).toBeTruthy();
  }
  expect(external).toEqual([]);
  expect(errors).toEqual([]);
  const sitemap = await page.goto('/sitemap-0.xml');
  expect(await sitemap!.text()).toContain('glava-1/');
  expect((await page.goto('/robots.txt'))!.ok()).toBeTruthy();
});
test('каталог: оригинальное название, исключение тегов, статус и сортировка', async ({ page }) => {
  await page.goto('/catalog/');
  await expect(page.locator('#result-count')).toHaveText('Найдено новелл: 2');
  await page.getByPlaceholder('Русское или оригинальное название').fill('winter');
  await expect(page.locator('[data-novel]:visible')).toHaveCount(1);
  await expect(page.locator('[data-novel]:visible h2')).toContainText('Сад');
  await page.getByRole('button', { name: 'Сбросить фильтры' }).click();
  await page.locator('details').evaluate((e) => ((e as HTMLDetailsElement).open = true));
  await page.locator('input[name=exclude][value="Море"]').check();
  await expect(page.locator('[data-novel]:visible')).toHaveCount(1);
  await page.locator('input[name=include][value="Море"]').check();
  await expect(page.locator('#catalog-empty')).toBeVisible();
  await page.getByRole('button', { name: 'Сбросить фильтры' }).click();
  await page.locator('select[name=status]').selectOption('Завершён');
  await expect(page.locator('[data-novel]:visible h2')).toContainText('Сад');
  await page.getByRole('button', { name: 'Сбросить фильтры' }).click();
  await page.locator('select[name=sort]').selectOption('chapters');
  await expect(page.locator('[data-novel]:visible').first()).toHaveAttribute(
    'data-novel',
    'sad-zimy',
  );
});
test('расширенный каталог: категории, автор, количество глав, теги и рейтинг', async ({ page }) => {
  await page.goto('/catalog/');
  await expect(page.locator('#result-count')).toHaveText('Найдено новелл: 2');
  await page.locator('select[name=category]').selectOption('Повседневность');
  await expect(page.locator('[data-novel]:visible')).toHaveCount(1);
  await expect(page.locator('[data-novel]:visible').first()).toHaveAttribute('data-novel', 'sad-zimy');
  await page.getByRole('button', { name: 'Сбросить фильтры' }).click();
  await page.getByPlaceholder('Русское или оригинальное название').fill('Алексей');
  await expect(page.locator('[data-novel]:visible')).toHaveCount(1);
  await expect(page.locator('[data-novel]:visible').first()).toHaveAttribute('data-novel', 'khranitel-mayaka');
  await page.getByRole('button', { name: 'Сбросить фильтры' }).click();
  await page.locator('[name=minChapters]').fill('4');
  await expect(page.locator('[data-novel]:visible')).toHaveCount(1);
  await page.getByRole('button', { name: 'Сбросить фильтры' }).click();
  await page.locator('select[name=minRating]').selectOption('4');
  await expect(page.locator('#catalog-empty')).toBeVisible();
  await page.getByRole('button', { name: 'Сбросить фильтры' }).click();
  await page.locator('select[name=sort]').selectOption('views');
  await expect(page.locator('[data-novel]:visible')).toHaveCount(2);
  await expect(page.locator('.catalog-card-stats').first()).toContainText('Нет оценок');
  await expect(page.locator('.catalog-card-stats').first()).toContainText('Нет данных о просмотрах');
});
test('ссылки категории и тегов открывают каталог с предустановленными фильтрами', async ({ page }) => {
  await page.goto('/novel/sad-zimy/');
  await page.getByRole('link', { name: 'Повседневность' }).first().click();
  await expect(page).toHaveURL(/category=/);
  await expect(page.locator('select[name=category]')).toHaveValue('Повседневность');
  await expect(page.locator('[data-novel]:visible')).toHaveCount(1);
  await page.goto('/catalog/?include=%D0%9C%D0%BE%D1%80%D0%B5');
  await expect(page.locator('input[name=include][value="Море"]')).toBeChecked();
  await expect(page.locator('[data-novel]:visible')).toHaveCount(1);
});
test('страница новеллы: статистика без фиктивных чисел и личная оценка', async ({ page }) => {
  await page.goto('/novel/khranitel-mayaka/');
  await expect(page.getByText('Пока нет оценок')).toBeVisible();
  await expect(page.getByText('Нет данных', { exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Оценить на 4 из 5' }).click();
  await expect(page.getByText('Ваша оценка: 4 из 5.', { exact: false })).toBeVisible();
  await page.reload();
  await expect(page.getByRole('button', { name: 'Оценить на 4 из 5' })).toHaveAttribute('aria-pressed', 'true');
  await expect(page.getByText('Пока нет оценок')).toBeVisible();
});
test('оглавление произведения разбито на страницы, диалог не выводит весь список', async ({ page }) => {
  await page.goto('/novel/khranitel-mayaka/');
  await page.getByRole('link', { name: 'Полное оглавление' }).click();
  expect(new URL(page.url()).pathname).toBe('/novel/khranitel-mayaka/chapters/1/');
  await expect(page.locator('.chapter-pages .chapter-list li')).toHaveCount(3);
  await page.locator('.chapter-pages .chapter-list a').first().click();
  await expect(page.locator('#chapter-text')).toBeVisible();
  await page.getByRole('button', { name: 'Открыть оглавление' }).click();
  await expect(page.getByRole('link', { name: /Полное оглавление \(3 глав\)/ })).toBeVisible();
});
test('полки сохраняются и изменяются', async ({ page }) => {
  await page.goto('/novel/khranitel-mayaka/');
  await page.getByRole('button', { name: 'В библиотеку', exact: true }).click();
  await expect(page.locator('[data-shelf]')).toHaveValue('later');
  await page.goto('/library/');
  await page.locator('[data-shelf-tab=later]').click();
  await expect(page.locator('.library-row')).toHaveCount(1);
  await expect(page.locator('.library-row .fine')).toContainText('3 главы');
  await page.locator('.library-row select').selectOption('completed');
  await page.locator('[data-shelf-tab=completed]').click();
  await expect(page.locator('.library-row')).toHaveCount(1);
  await page.reload();
  await page.locator('[data-shelf-tab=completed]').click();
  await expect(page.locator('.library-row')).toHaveCount(1);
  await page.locator('.library-row select').selectOption('remove');
  await expect(page.locator('#library-empty')).toBeVisible();
});
test('настройки чтения применяются до загрузки основных скриптов', async ({ page }) => {
  await page.route('**/_astro/*.js', (route) => route.abort());
  await page.addInitScript(() =>
    localStorage.setItem(
      'hunmeng-novels:v1',
      JSON.stringify({
        version: 1,
        settings: { font: 'sans', size: 25, lineHeight: 2.15, width: 880, theme: 'sepia' },
      }),
    ),
  );
  await page.goto(chapter);
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'sepia');
  await expect(page.locator('html')).toHaveAttribute('data-reader-font', 'sans');
  const styles = await page.locator('#chapter-text').evaluate((el) => ({
    size: getComputedStyle(el).fontSize,
    leading: getComputedStyle(el).lineHeight,
    font: getComputedStyle(el).fontFamily,
    width: getComputedStyle(document.querySelector('.reader-main')!).maxWidth,
  }));
  expect(styles.size).toBe('25px');
  expect(styles.leading).toBe('53.75px');
  expect(styles.font).toContain('Manrope');
  expect(styles.width).toBe('880px');
});
test('ранний скрипт не меняет документ при недоступном localStorage', async ({ page }) => {
  await page.route('**/_astro/*.js', (route) => route.abort());
  await page.addInitScript(() =>
    Object.defineProperty(window, 'localStorage', {
      get() {
        throw new DOMException('Denied', 'SecurityError');
      },
    }),
  );
  await page.goto(chapter);
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'system');
  expect(await page.locator('html').getAttribute('style')).toBeNull();
  expect(await page.locator('html').getAttribute('data-reader-font')).toBeNull();
  expect(await page.locator('#chapter-text').evaluate((el) => getComputedStyle(el).fontSize)).toBe(
    '20px',
  );
});
test('системная тема по умолчанию: смена схемы, логотип и ручной выбор', async ({ page }) => {
  await page.emulateMedia({ colorScheme: 'light' });
  await page.goto('/');
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'light');
  await expect(page.locator('.brand-logo-light').first()).toBeVisible();
  await expect(page.locator('.brand-logo-dark').first()).toBeHidden();
  await page.emulateMedia({ colorScheme: 'dark' });
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');
  await expect(page.locator('.brand-logo-dark').first()).toBeVisible();
  await expect(page.locator('.brand-logo-light').first()).toBeHidden();
  await page.goto(chapter);
  await page.locator('[data-open=settings]').click();
  await expect(page.locator('input[name=theme][value=system]')).toBeChecked();
  await expect(page.locator('input[name=size]')).toHaveValue('20');
  await page.locator('input[name=theme][value=dark]').check();
  await page.emulateMedia({ colorScheme: 'light' });
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');
  await page.locator('input[name=theme][value=system]').check();
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'light');
  await page.reload();
  await page.emulateMedia({ colorScheme: 'dark' });
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');
  const saved = await page.evaluate(
    () => JSON.parse(localStorage.getItem('hunmeng-novels:v1')!).settings,
  );
  expect(saved.theme).toBe('system');
});
test('кнопки читалки удобны для касания и текст не уменьшен', async ({ page }) => {
  await page.goto('/novel/khranitel-mayaka/glava-2/');
  for (const control of await page.locator('.reader-toolbar button, .toolbar-arrows a').all()) {
    const box = await control.boundingBox();
    expect(box!.width).toBeGreaterThanOrEqual(44);
    expect(box!.height).toBeGreaterThanOrEqual(44);
  }
  const sizes = await page
    .locator('.reader-toolbar button, #progress-label')
    .evaluateAll((els) => els.map((el) => parseFloat(getComputedStyle(el).fontSize)));
  for (const size of sizes) expect(size).toBeGreaterThanOrEqual(13);
  const nav = page.locator('.chapter-end-nav');
  for (const button of await nav.locator('a').all()) {
    expect(
      await button.evaluate((el) => parseFloat(getComputedStyle(el).fontSize)),
    ).toBeGreaterThanOrEqual(15);
    if (page.viewportSize()!.width <= 760) {
      expect((await button.boundingBox())!.width).toBeCloseTo((await nav.boundingBox())!.width, 0);
    }
  }
});
test('читалка: настройки, скрытие панели и восстановление абзаца', async ({ page }) => {
  await page.goto(chapter);
  await expect
    .poll(() =>
      page.evaluate(
        () =>
          JSON.parse(localStorage.getItem('hunmeng-novels:v1') || '{}').progress?.[
            'khranitel-mayaka'
          ]?.chapterSlug,
      ),
    )
    .toBe('glava-1');
  await page.locator('[data-open=settings]').click();
  await expect(page.getByRole('dialog', { name: 'Настройки чтения' })).toBeVisible();
  await page.locator('input[name=theme][value=sepia]').check();
  await page.locator('input[name=font][value=sans]').check();
  await page.locator('input[name=size]').fill('26');
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'sepia');
  await page.getByRole('button', { name: 'Закрыть настройки' }).click();
  expect(await page.locator('#chapter-text').evaluate((el) => getComputedStyle(el).fontSize)).toBe(
    '26px',
  );
  await page.evaluate(() => window.scrollTo(0, 500));
  await page.waitForTimeout(500);
  const old = await page.evaluate(
    () => JSON.parse(localStorage.getItem('hunmeng-novels:v1')!).progress['khranitel-mayaka'],
  );
  expect(old.blockId).toMatch(/^block-/);
  await expect(page.locator('#show-reader-controls')).toBeVisible();
  await page.reload();
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'sepia');
  await expect.poll(() => page.evaluate(() => window.scrollY)).toBeGreaterThan(300);
  await page.goto('/');
  await expect(page.locator('#continue-section')).toBeVisible();
  await page.locator('#continue-list a').first().click();
  await expect.poll(() => page.evaluate(() => window.scrollY)).toBeGreaterThan(300);
  if (await page.locator('#show-reader-controls').isVisible())
    await page.locator('#show-reader-controls').click();
  await page.locator('[data-open=toc]').first().click();
  await expect(page.getByRole('dialog', { name: 'Оглавление', exact: true })).toBeVisible();
  await page.getByRole('dialog').getByRole('link', { name: 'Глава 2. Письмо без адреса' }).click();
  await expect(page).toHaveURL(/glava-2/);
  await expect.poll(() => page.evaluate(() => window.scrollY)).toBeLessThan(50);
});
test('повреждённые или запрещённые хранилища не ломают чтение', async ({ page }) => {
  await page.addInitScript(() => localStorage.setItem('hunmeng-novels:v1', '{broken'));
  await page.goto(chapter);
  await expect(page.locator('#chapter-text p').first()).toBeVisible();
  await page.addInitScript(() =>
    Object.defineProperty(window, 'localStorage', {
      get() {
        throw new DOMException('Denied', 'SecurityError');
      },
    }),
  );
  await page.reload();
  await expect(page.locator('#chapter-text p').first()).toBeVisible();
  await expect(page.locator('#storage-notice')).toBeVisible();
});
test('чтение работает без JavaScript', async ({ browser }) => {
  const context = await browser.newContext({ javaScriptEnabled: false });
  await serveStatic(context);
  const page = await context.newPage();
  await page.goto('http://127.0.0.1:4321' + chapter);
  await expect(page.locator('#chapter-text p').first()).toBeVisible();
  await page.locator('.chapter-end-nav').getByRole('link', { name: 'Следующая' }).click();
  await expect(page).toHaveURL(/glava-2/);
  await context.close();
});
