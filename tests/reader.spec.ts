import { test, expect, serveStatic } from './fixtures';
const chapter = '/novel/khranitel-mayaka/glava-1/';
test('главная: разделы с реальным контентом, обложки и поиск', async ({ page }) => {
  await page.goto('/');
  await expect(page.getByRole('heading', { name: 'New novels' })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Latest chapters' })).toBeVisible();
  await expect(page.locator('#popular-novels')).toHaveCount(0);
  await expect(page.locator('a[href="#popular-novels"]')).toHaveCount(0);
  await expect(page.getByRole('heading', { name: 'Recommended reads' })).toBeVisible();
  await expect(page.locator('#new-novels .home-book-card')).toHaveCount(2);
  await expect(page.locator('#latest-chapters .home-chapter-link')).toHaveCount(4);
  // Пока нет подтверждённыхviews — рейтинг не показывается.
  await expect(page.locator('#recommended-novels .home-recommendation-card')).toHaveCount(2);
  await page.getByRole('searchbox', { name: 'Search novels' }).fill('winter');
  await page.getByRole('button', { name: 'Search' }).click();
  await expect(page).toHaveURL(/search=winter/);
  expect(new URL(page.url()).pathname).toBe('/catalog/');
  await expect(page.locator('#result-count')).toHaveText('Novels found: 1');
  await expect(page.locator('[data-novel]:visible')).toHaveCount(1);
  await expect(page.locator('[data-novel]:visible h2')).toContainText('The Garden');
});
test('все обновления: главная показывает четыре главы, отдельная страница — полный список', async ({ page }) => {
  await page.goto('/');
  await expect(page.locator('#latest-chapters .home-chapter-link')).toHaveCount(4);
  await page.getByRole('link', { name: 'All updates' }).click();
  expect(new URL(page.url()).pathname).toBe('/updates/');
  await expect(page.getByRole('heading', { name: 'All updates' })).toBeVisible();
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
    expect(rect!.height).toBeLessThan(175);
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
test('новости: единственная приветственная запись без технических релизов', async ({ page }) => {
  await page.goto('/');
  await expect(page.getByRole('heading', { name: 'Latest news' })).toBeVisible();
  await expect(page.locator('#latest-news [data-news-card]')).toHaveCount(1);
  await expect(page.locator('#latest-news')).toContainText('Welcome to Hunmeng');
  await page.locator('#latest-news').getByRole('link', { name: 'View all' }).click();
  expect(new URL(page.url()).pathname).toBe('/news/');
  await expect(page.locator('#news-feed [data-news-card]:visible')).toHaveCount(1);
  await expect(page.locator('#news-pagination')).toBeHidden();
  await expect(page.locator('a[href*="github.com"]')).toHaveCount(0);
  await expect(page.locator('#news-feed')).not.toContainText('Site update:');
});
test('новости: категории сохраняются, несуществующие публикации не показываются', async ({ page }) => {
  await page.goto('/news/');
  await page.getByRole('link', { name: 'Announcements', exact: true }).click();
  await expect(page.locator('#news-feed [data-news-card]:visible')).toHaveCount(1);
  await expect(page.locator('[data-news-filter=announcements]')).toHaveAttribute('aria-current', 'page');
  await page.getByRole('link', { name: 'Changelog', exact: true }).click();
  await expect(page.locator('#news-empty')).toBeVisible();
  await page.getByRole('link', { name: 'Giveaways', exact: true }).click();
  await expect(page.locator('#news-empty')).toBeVisible();
  await page.getByRole('link', { name: 'All', exact: true }).click();
  await expect(page.locator('#news-feed [data-news-card]:visible')).toHaveCount(1);
});
test('отдельная новость: приветствие, разрешения правообладателей и локальные реакции', async ({ page }) => {
  await page.goto('/news/hunmeng-opens/');
  await expect(page.getByRole('heading', { name: 'Welcome to Hunmeng' })).toBeVisible();
  await expect(page.locator('.news-article-body')).toContainText('permission from authors');
  await expect(page.locator('.news-article')).not.toContainText('GitHub');
  await page.getByRole('button', { name: 'Reaction 🔥' }).click();
  await expect(page.getByRole('button', { name: 'Reaction 🔥' })).toHaveAttribute('aria-pressed', 'true');
  await page.reload();
  await expect(page.getByRole('button', { name: 'Reaction 🔥' })).toHaveAttribute('aria-pressed', 'true');
  await page.getByRole('button', { name: 'Reaction 🔥' }).click();
  await expect(page.getByRole('button', { name: 'Reaction 🔥' })).toHaveAttribute('aria-pressed', 'false');
  await page.getByRole('link', { name: 'All news' }).last().click();
  expect(new URL(page.url()).pathname).toBe('/news/');
});
test('мобильная страница новостей без горизонтальной прокрутки', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  for (const url of ['/news/', '/news/hunmeng-opens/']) {
    await page.goto(url);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBeTruthy();
  }
});
test('аккаунты читателей: видимый вход без публичной ссылки в редакцию', async ({ page }) => {
  for (const url of ['/', '/catalog/', '/library/', '/news/']) {
    await page.goto(url);
    await expect(page.locator('header a[href="/account/"]')).toBeVisible();
  }
  await page.goto('/account/');
  await expect(page.getByRole('heading', { name: 'Sign in or register' })).toBeVisible();
  await expect(page.locator('#auth-form')).toBeVisible();
  await expect(page.locator('#google-sign-in, a[href="/admin/"]')).toHaveCount(0);
});
test('локальная библиотека сохраняется без запросов к Supabase', async ({ page }) => {
  const outgoing: string[] = [];
  page.on('request', request => {
    if (request.url().includes('.supabase.co')) outgoing.push(request.url());
  });
  await page.goto('/novel/khranitel-mayaka/');
  await page.getByRole('button', { name: 'Add to library', exact: true }).click();
  await page.goto('/library/');
  await page.locator('[data-shelf-tab=later]').click();
  await expect(page.locator('.library-row')).toHaveCount(1);
  await page.reload();
  await page.locator('[data-shelf-tab=later]').click();
  await expect(page.locator('.library-row')).toHaveCount(1);
  await expect(page.locator('.storage-explanation')).toContainText('saved only in this browser');
  expect(outgoing).toEqual([]);
});
test('мобильная читалка: выключены автоматические переносы, текст слева', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto(chapter);
  const mobile = await page.locator('#chapter-text').evaluate(el => ({
    hyphens: getComputedStyle(el).hyphens,
    align: getComputedStyle(el).textAlign,
  }));
  expect(mobile).toEqual({ hyphens: 'manual', align: 'left' });
  await page.setViewportSize({ width: 1024, height: 800 });
  const desktop = await page.locator('#chapter-text').evaluate(el => getComputedStyle(el).hyphens);
  expect(desktop).toBe('auto');
});
test('админка продолжает проверять роль, отдельно от читательских аккаунтов', async ({ page }) => {
  await page.goto('/admin/');
  await expect(page.getByRole('heading', { name: 'Translation management' })).toBeVisible();
  await expect(page.locator('#admin-workspace')).toBeHidden();
  await expect(page.locator('#admin-status')).toContainText('Access denied');
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
    '/news/hunmeng-opens/',
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
    expect(await page.locator('html').getAttribute('lang')).toBe('en');
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
  await expect(page.locator('#result-count')).toHaveText('Novels found: 2');
  await page.getByPlaceholder('English or original title').fill('winter');
  await expect(page.locator('[data-novel]:visible')).toHaveCount(1);
  await expect(page.locator('[data-novel]:visible h2')).toContainText('The Garden');
  await page.getByRole('button', { name: 'Reset filters' }).click();
  const options = page.locator('#catalog-options');
  if (!(await options.evaluate(el => (el as HTMLDetailsElement).open))) await options.locator(':scope > summary').click();
  await page.locator('.tag-filters > summary').click();
  await page.locator('input[name=exclude][value="Sea"]').check();
  await expect(page.locator('[data-novel]:visible')).toHaveCount(1);
  await page.locator('input[name=include][value="Sea"]').check();
  await expect(page.locator('#catalog-empty')).toBeVisible();
  await page.getByRole('button', { name: 'Reset filters' }).click();
  await page.locator('select[name=status]').selectOption('Completed');
  await expect(page.locator('[data-novel]:visible h2')).toContainText('The Garden');
  await page.getByRole('button', { name: 'Reset filters' }).click();
  await page.locator('select[name=sort]').selectOption('chapters');
  await expect(page.locator('[data-novel]:visible').first()).toHaveAttribute(
    'data-novel',
    'sad-zimy',
  );
});
test('расширенный каталог: категории, автор, количество глав, теги и рейтинг', async ({ page }) => {
  await page.goto('/catalog/');
  const options = page.locator('#catalog-options');
  if (!(await options.evaluate(el => (el as HTMLDetailsElement).open))) await options.locator(':scope > summary').click();
  await expect(page.locator('#result-count')).toHaveText('Novels found: 2');
  await page.locator('select[name=category]').selectOption('Slice of life');
  await expect(page.locator('[data-novel]:visible')).toHaveCount(1);
  await expect(page.locator('[data-novel]:visible').first()).toHaveAttribute('data-novel', 'sad-zimy');
  await page.getByRole('button', { name: 'Reset filters' }).click();
  await page.getByPlaceholder('English or original title').fill('Alexey');
  await expect(page.locator('[data-novel]:visible')).toHaveCount(1);
  await expect(page.locator('[data-novel]:visible').first()).toHaveAttribute('data-novel', 'khranitel-mayaka');
  await page.getByRole('button', { name: 'Reset filters' }).click();
  await page.locator('[name=minChapters]').fill('4');
  await expect(page.locator('[data-novel]:visible')).toHaveCount(1);
  await page.getByRole('button', { name: 'Reset filters' }).click();
  await page.locator('select[name=minRating]').selectOption('4');
  await expect(page.locator('#catalog-empty')).toBeVisible();
  await page.getByRole('button', { name: 'Reset filters' }).click();
  await page.locator('select[name=sort]').selectOption('views');
  await expect(page.locator('[data-novel]:visible')).toHaveCount(2);
  await expect(page.locator('.catalog-card-stats')).toHaveCount(0);
  await expect(page.locator('#catalog-results')).not.toContainText('No view data');
});
test('ссылки категории и тегов открывают каталог с предустановленными фильтрами', async ({ page }) => {
  await page.goto('/novel/sad-zimy/');
  await page.locator('.work-categories').getByRole('link', { name: 'Slice of life' }).click();
  await expect(page).toHaveURL(/category=/);
  await expect(page.locator('select[name=category]')).toHaveValue('Slice of life');
  await expect(page.locator('[data-novel]:visible')).toHaveCount(1);
  await page.goto('/catalog/?include=%D0%9C%D0%BE%D1%80%D0%B5');
  await expect(page.locator('input[name=include][value="Sea"]')).toBeChecked();
  await expect(page.locator('[data-novel]:visible')).toHaveCount(1);
});

test('социальные карточки: OG и Twitter, дефолтный PNG 1200x630', async ({ page }) => {
  for (const url of ['/', '/catalog/', '/news/', '/about/', '/library/']) {
    await page.goto(url);
    const image = await page.locator('meta[property="og:image"]').getAttribute('content');
    expect(image).toMatch(/^https:\/\/.*\/images\/og-default\.png$/);
    await expect(page.locator('meta[name="twitter:card"]')).toHaveAttribute('content', 'summary_large_image');
    await expect(page.locator('meta[name="twitter:image"]')).toHaveAttribute('content', image!);
    await expect(page.locator('meta[property="og:image:width"]')).toHaveAttribute('content', '1200');
    await expect(page.locator('meta[property="og:image:height"]')).toHaveAttribute('content', '630');
  }
  const image = await page.request.get('/images/og-default.png');
  expect(image.ok()).toBeTruthy();
  const bytes = await image.body();
  expect(bytes.toString('ascii', 1, 4)).toBe('PNG');
  expect(bytes.readUInt32BE(16)).toBe(1200);
  expect(bytes.readUInt32BE(20)).toBe(630);
});
test('OG обложка романа и глав — одна PNG с корректными размерами', async ({ page }) => {
  for (const url of ['/novel/khranitel-mayaka/', chapter, '/novel/khranitel-mayaka/glava-2/']) {
    await page.goto(url);
    const image = await page.locator('meta[property="og:image"]').getAttribute('content');
    expect(image).toMatch(/\/images\/khranitel-mayaka-og\.png$/);
    await expect(page.locator('meta[name="twitter:image"]')).toHaveAttribute('content', image!);
    await expect(page.locator('meta[property="og:image:width"]')).toHaveAttribute('content', '520');
    await expect(page.locator('meta[property="og:image:height"]')).toHaveAttribute('content', '760');
  }
  const image = await page.request.get('/images/khranitel-mayaka-og.png');
  expect(image.ok()).toBeTruthy();
  const bytes = await image.body();
  expect(bytes.readUInt32BE(16)).toBe(520);
  expect(bytes.readUInt32BE(20)).toBe(760);
});
test('JSON-LD Book, Chapter и BreadcrumbList', async ({ page }) => {
  await page.goto('/novel/khranitel-mayaka/');
  const book = JSON.parse((await page.locator('script[type="application/ld+json"]').textContent())!);
  const entity = book['@graph'].find((value: { '@type': string }) => value['@type'] === 'Book');
  const crumbs = book['@graph'].find((value: { '@type': string }) => value['@type'] === 'BreadcrumbList');
  expect(entity.name).toBe('The Keeper of the Quiet Lighthouse');
  expect(entity.image).toMatch(/khranitel-mayaka-og\.png$/);
  expect(crumbs.itemListElement.map((item: { name: string }) => item.name)).toEqual(['Home', 'Catalog', 'The Keeper of the Quiet Lighthouse']);
  await page.goto(chapter);
  const chapterData = JSON.parse((await page.locator('script[type="application/ld+json"]').textContent())!);
  const chapterEntity = chapterData['@graph'].find((value: { '@type': string }) => value['@type'] === 'Chapter');
  const trail = chapterData['@graph'].find((value: { '@type': string }) => value['@type'] === 'BreadcrumbList');
  expect(chapterEntity.position).toBe(1);
  expect(chapterEntity.isPartOf['@id']).toMatch(/\/novel\/khranitel-mayaka\/#book$/);
  expect(trail.itemListElement.map((item: { position: number }) => item.position)).toEqual([1, 2, 3, 4]);
  expect(trail.itemListElement[3].item).toMatch(/\/novel\/khranitel-mayaka\/glava-1\/$/);
});
test('глоссарий по типам, сведения об авторе и отсутствие ложной лицензии у demo', async ({ page }) => {
  await page.goto('/novel/khranitel-mayaka/');
  await expect(page.getByRole('heading', { name: 'Glossary' })).toBeVisible();
  await expect(page.locator('.glossary-group')).toHaveCount(4);
  await expect(page.locator('.glossary-group h3')).toHaveText(['Characters', 'Places', 'Techniques', 'Items']);
  await expect(page.locator('.glossary-section')).toContainText('Returning Light');
  await expect(page.locator('.glossary-section')).toContainText('Returning Light');
  await expect(page.getByRole('heading', { name: 'About the author' })).toBeVisible();
  await expect(page.locator('.author-section')).toContainText('Alexey Vetrov');
  await expect(page.locator('.author-outbound-links')).toHaveCount(0);
  await expect(page.locator('.author-section')).not.toContainText('Published with the author');
});
test('пустой reportUrl не выводит кнопку в конце главы', async ({ page }) => {
  await page.goto(chapter);
  await expect(page.getByRole('link', { name: /Report an error/ })).toHaveCount(0);
  await expect(page.locator('.chapter-report')).toHaveCount(0);
});

test('страница novels: статистика без фиктивных чисел и личная оценка', async ({ page }) => {
  await page.goto('/novel/khranitel-mayaka/');
  await expect(page.locator('.novel-facts')).not.toContainText('Reader rating');
  await expect(page.locator('.novel-facts')).not.toContainText('Views');
  await page.getByRole('button', { name: 'Rate 4 out of 5' }).click();
  await expect(page.getByText('Your rating: 4 out of 5.', { exact: false })).toBeVisible();
  await page.reload();
  await expect(page.getByRole('button', { name: 'Rate 4 out of 5' })).toHaveAttribute('aria-pressed', 'true');
  await expect(page.locator('.novel-facts')).not.toContainText('Reader rating');
});
test('оглавление произведения разбито на страницы, диалог не выводит весь список', async ({ page }) => {
  await page.goto('/novel/khranitel-mayaka/');
  await page.getByRole('link', { name: 'Full contents' }).click();
  expect(new URL(page.url()).pathname).toBe('/novel/khranitel-mayaka/chapters/1/');
  await expect(page.locator('.chapter-pages .chapter-list li')).toHaveCount(3);
  await page.locator('.chapter-pages .chapter-list a').first().click();
  await expect(page.locator('#chapter-text')).toBeVisible();
  await page.getByRole('button', { name: 'Open contents' }).click();
  await expect(page.getByRole('link', { name: /Full contents \(3 chapters\)/ })).toBeVisible();
});
test('полки сохраняются и изменяются', async ({ page }) => {
  await page.goto('/novel/khranitel-mayaka/');
  await page.getByRole('button', { name: 'Add to library', exact: true }).click();
  await expect(page.locator('[data-shelf]')).toHaveValue('later');
  await page.goto('/library/');
  await page.locator('[data-shelf-tab=later]').click();
  await expect(page.locator('.library-row')).toHaveCount(1);
  await expect(page.locator('.library-row .fine')).toContainText('3 chapters');
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
test('ранний скрипт не меняет документ при unavailableм localStorage', async ({ page }) => {
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
  await expect(page.getByRole('dialog', { name: 'Reading settings' })).toBeVisible();
  await page.locator('input[name=theme][value=sepia]').check();
  await page.locator('input[name=font][value=sans]').check();
  await page.locator('input[name=size]').fill('26');
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'sepia');
  await page.getByRole('button', { name: 'Close settings' }).click();
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
  await expect(page.getByRole('dialog', { name: 'Contents', exact: true })).toBeVisible();
  await page.getByRole('dialog').getByRole('link', { name: 'Chapter 2. A Letter Without an Address' }).click();
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
  await page.locator('.chapter-end-nav').getByRole('link', { name: 'Next' }).click();
  await expect(page).toHaveURL(/glava-2/);
  await context.close();
});

test('склонение после клиентского поиска и в полном оглавлении', async ({ page }) => {
  await page.goto('/catalog/?search=winter');
  await expect(page.locator('#catalog-results .novel-card')).toHaveCount(1);
  await expect(page.locator('#catalog-results .fine')).toContainText('4 chapters');
  await expect(page.locator('#catalog-results')).not.toContainText('4 chapter ·');
  await page.goto('/novel/sad-zimy/');
  await expect(page.locator('.chapter-pages-footer')).toContainText('4 chapters');
  await page.goto('/novel/sad-zimy/glava-1/');
  await page.getByRole('button', { name:'Open contents', exact:true }).click();
  await expect(page.locator('.reader-toc-all')).toHaveText('Full contents (4 chapters) →');
});
test('контакты без выдуманных каналов и технических заглушек', async ({page}) => {
  for (const route of ['/contacts/','/rights/']) {
    await page.goto(route);
    await expect(page.locator('main')).not.toContainText('Placeholder page');
    await expect(page.locator('main a[href^="mailto:"], main a[href^="https://t.me/"]')).toHaveCount(0);
    await expect(page.locator('main')).toContainText('not been published yet');
  }
});
test('метка версии и исключение всей редакции из sitemap', async ({page}) => {
  const version = await page.goto('/version.json');
  const data = JSON.parse(await version!.text());
  expect(data.version).toBe('0.5.2');
  expect(data.commit === null || /^[0-9a-f]{40}$/.test(data.commit)).toBe(true);
  const sitemap = (await (await page.goto('/sitemap-0.xml'))!.text());
  expect(sitemap).not.toContain('/admin/');
  expect(sitemap).not.toContain('/account/');
  const robots = (await (await page.goto('/robots.txt'))!.text());
  expect(robots).toContain('Disallow: /admin/');
});

test('мобильный каталог: поиск сразу доступен, фильтры раскрываются и сохраняются при сворачивании',async({page})=>{
 await page.setViewportSize({width:390,height:844});await page.goto('/catalog/');
 await expect(page.locator('#result-count')).toHaveText('Novels found: 2');
 const options=page.locator('#catalog-options');
 await expect(options).not.toHaveAttribute('open','');
 await expect(page.getByPlaceholder('English or original title')).toBeVisible();
 expect((await page.locator('#catalog-results .novel-card').first().boundingBox())!.y).toBeLessThan(700);
 await options.locator(':scope > summary').click();await page.locator('[name=status]').selectOption('Completed');
 await expect(page.locator('#active-filter-count')).toHaveText('Selected: 1');
 await expect(page.locator('#catalog-results .novel-card')).toHaveCount(1);
 await options.locator(':scope > summary').click();await expect(page.locator('#active-filter-count')).toBeVisible();
 await page.getByRole('button',{name:'Reset filters',exact:true}).click();
 await expect(page.locator('#active-filter-count')).toBeHidden();
 await expect(page.locator('#catalog-results .novel-card')).toHaveCount(2);
 await page.setViewportSize({width:1280,height:900});await expect(options).toHaveAttribute('open','');
 await expect(page.locator('[name=status]')).toBeVisible();
 await page.setViewportSize({width:390,height:844});await expect(options).not.toHaveAttribute('open','');
});
test('конец главы ведёт к следующей, дочитанная книга исчезает с главной без изменения полок',async({page})=>{
 await page.goto('/');await page.evaluate(()=>{
  const progress=(chapterSlug:string,chapterNumber:number,updatedAt:number)=>({chapterSlug,chapterNumber,updatedAt,blockId:'block-0',offset:0,ratio:1});
  localStorage.setItem('hunmeng-novels:v1',JSON.stringify({version:1,settings:{},library:{'khranitel-mayaka':'reading','sad-zimy':'reading'},progress:{'khranitel-mayaka':progress('glava-1',1,100),'sad-zimy':progress('glava-4',4,200)}}));
 });await page.reload();
 await expect(page.locator('#continue-list a')).toHaveCount(1);
 await expect(page.locator('#continue-list a')).toHaveAttribute('href','/novel/khranitel-mayaka/glava-2/');
 await expect(page.locator('#continue-list')).toContainText('Next chapter');
 await page.goto('/novel/khranitel-mayaka/');
 await expect(page.locator('[data-continue]')).toHaveAttribute('href','/novel/khranitel-mayaka/glava-2/');
 await page.goto('/novel/sad-zimy/');await expect(page.locator('[data-continue]')).toHaveText('Read from the beginning');
 await page.goto('/library/');await expect(page.locator('.library-row')).toHaveCount(2);
 await expect(page.locator('.library-row').filter({hasText:'The Garden at Winter’s Edge'})).toContainText('You are all caught up');
 await expect(page.locator('.library-row').filter({hasText:'The Garden at Winter’s Edge'}).getByRole('link',{name:'Read from the beginning →'})).toHaveAttribute('href','/novel/sad-zimy/glava-1/');
 expect(await page.evaluate(()=>JSON.parse(localStorage.getItem('hunmeng-novels:v1')!).library)).toEqual({'khranitel-mayaka':'reading','sad-zimy':'reading'});
});
test('брошенные и прочитанные полки не предлагают продолжение, даты и ссылки читаемы на телефоне',async({page})=>{
 await page.setViewportSize({width:390,height:844});await page.goto('/');await page.evaluate(()=>localStorage.setItem('hunmeng-novels:v1',JSON.stringify({version:1,settings:{},library:{'khranitel-mayaka':'dropped','sad-zimy':'completed'},progress:{'khranitel-mayaka':{chapterSlug:'glava-1',chapterNumber:1,ratio:.4,blockId:'',offset:0,updatedAt:100},'sad-zimy':{chapterSlug:'glava-2',chapterNumber:2,ratio:.3,blockId:'',offset:0,updatedAt:200}}})));
 await page.reload();await expect(page.locator('#continue-section')).toBeHidden();
 for(const selector of ['.home-book-meta','.home-book-genre','.home-chapter-info time','.home-section-heading > a','.header-inner nav a']) {
  expect(await page.locator(selector).first().evaluate(el=>parseFloat(getComputedStyle(el).fontSize))).toBeGreaterThanOrEqual(14);
 }
 for(const selector of ['.home-section-heading > a','.header-inner nav a','.site-footer nav a','.news-read-more']) {
  expect((await page.locator(selector).first().boundingBox())!.height).toBeGreaterThanOrEqual(44);
 }
 expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
});
