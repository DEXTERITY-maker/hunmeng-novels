const PAGE_SIZE = 4;
const CATEGORIES = ['changelog', 'announcements', 'giveaways'];
const REACTION_KEY = 'hunmeng-news-reactions:v1';

export function initNewsFeed() {
  const feed = document.getElementById('news-feed');
  const pager = document.getElementById('news-pagination');
  const tabs = document.getElementById('news-filters');
  const empty = document.getElementById('news-empty');
  if (!feed || !pager || !tabs || !empty) return;
  const cards = Array.from(feed.querySelectorAll<HTMLElement>('[data-news-card]'));

  const urlFor = (category: string, page: number) => {
    const params = new URLSearchParams();
    if (category !== 'all') params.set('category', category);
    if (page > 1) params.set('page', String(page));
    return '/news/' + (params.size ? '?' + params.toString() : '');
  };
  const render = (updateUrl = false, nextCategory?: string, nextPage?: number) => {
    const params = new URLSearchParams(location.search);
    const rawCategory = nextCategory ?? params.get('category') ?? 'all';
    const category = CATEGORIES.includes(rawCategory) ? rawCategory : 'all';
    const matches = cards.filter((card) => category === 'all' || card.dataset.newsCategory === category);
    const pages = Math.max(1, Math.ceil(matches.length / PAGE_SIZE));
    const requested = nextPage ?? Number(params.get('page') || '1');
    const page = Number.isSafeInteger(requested) ? Math.max(1, Math.min(requested, pages)) : 1;
    const visible = new Set(matches.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE));

    for (const card of cards) card.hidden = !visible.has(card);
    empty.hidden = matches.length > 0;
    for (const tab of tabs.querySelectorAll<HTMLAnchorElement>('[data-news-filter]')) {
      if (tab.dataset.newsFilter === category) tab.setAttribute('aria-current', 'page');
      else tab.removeAttribute('aria-current');
    }

    pager.replaceChildren();
    pager.hidden = pages <= 1;
    if (pages > 1) {
      const add = (label: string, target: number, active = false) => {
        const link = document.createElement('a');
        link.textContent = label;
        link.href = urlFor(category, target);
        if (active) link.setAttribute('aria-current', 'page');
        pager.append(link);
      };
      if (page > 1) add('←', page - 1);
      for (let n = Math.max(1, page - 2); n <= Math.min(pages, page + 2); n++) add(String(n), n, n === page);
      if (page < pages) add('→', page + 1);
    }
    if (updateUrl) history.pushState(null, '', urlFor(category, page));
  };

  tabs.addEventListener('click', (event) => {
    const target = event.target;
    if (!(target instanceof Element)) return;
    const link = target.closest<HTMLAnchorElement>('a[data-news-filter]');
    if (!link) return;
    event.preventDefault();
    render(true, link.dataset.newsFilter, 1);
  });
  pager.addEventListener('click', (event) => {
    const target = event.target;
    if (!(target instanceof Element)) return;
    const link = target.closest<HTMLAnchorElement>('a');
    if (!link) return;
    event.preventDefault();
    const targetUrl = new URL(link.href);
    const category = targetUrl.searchParams.get('category') ?? 'all';
    const page = Number(targetUrl.searchParams.get('page') || '1');
    render(true, category, page);
    document.getElementById('news-filters')?.scrollIntoView({ block: 'start' });
  });
  window.addEventListener('popstate', () => render());
  render();
}

export function initNewsReactions() {
  const section = document.querySelector<HTMLElement>('[data-news-reactions]');
  if (!section) return;
  const postId = section.dataset.newsReactions!;
  const buttons = Array.from(section.querySelectorAll<HTMLButtonElement>('button[data-reaction]'));
  const message = section.querySelector<HTMLElement>('#news-reaction-status')!;
  const validReactions = buttons.map((button) => button.dataset.reaction!);
  let reactions: Record<string, string> = {};
  let writable = true;
  try {
    const stored: unknown = JSON.parse(localStorage.getItem(REACTION_KEY) ?? '{}');
    if (stored && typeof stored === 'object' && !Array.isArray(stored)) {
      reactions = Object.fromEntries(
        Object.entries(stored).filter(([key, value]) =>
          /^[a-z0-9-]+$/.test(key) && typeof value === 'string' && validReactions.includes(value),
        ),
      );
    }
  } catch {
    writable = false;
  }
  const paint = () => {
    const selected = reactions[postId] ?? '';
    for (const button of buttons) {
      const active = selected === button.dataset.reaction;
      button.setAttribute('aria-pressed', String(active));
    }
    message.textContent = selected
      ? `Вы выбрали ${selected}. ${writable ? 'Сохранено на этом устройстве.' : 'Локальное сохранение недоступно.'}`
      : 'Пока без реакции.';
  };
  for (const button of buttons) {
    button.addEventListener('click', () => {
      const reaction = button.dataset.reaction!;
      if (reactions[postId] === reaction) delete reactions[postId];
      else reactions[postId] = reaction;
      try {
        localStorage.setItem(REACTION_KEY, JSON.stringify(reactions));
        writable = true;
      } catch {
        writable = false;
      }
      paint();
    });
  }
  paint();
}
