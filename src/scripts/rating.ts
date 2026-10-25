const KEY = 'hunmeng-personal-ratings:v1';

// Это личные оценки на устройстве, не публичная статистика сайта.
export function initPersonalRatings() {
  const section = document.querySelector<HTMLElement>('[data-rating-novel]');
  if (!section) return;
  const slug = section.dataset.ratingNovel!;
  const buttons = Array.from(section.querySelectorAll<HTMLButtonElement>('[data-star]'));
  const status = section.querySelector<HTMLElement>('[data-rating-status]')!;
  let ratings: Record<string, number> = {};
  try {
    const saved: unknown = JSON.parse(localStorage.getItem(KEY) ?? '{}');
    if (saved && typeof saved === 'object' && !Array.isArray(saved)) {
      ratings = Object.fromEntries(
        Object.entries(saved).filter(([key, value]) =>
          /^[a-z0-9-]+$/.test(key) && Number.isInteger(value) && Number(value) >= 1 && Number(value) <= 5,
        ),
      );
    }
  } catch {
    status.textContent = 'Локальное сохранение недоступно.';
  }
  const paint = () => {
    const value = ratings[slug] ?? 0;
    for (const button of buttons) {
      const star = Number(button.dataset.star);
      button.setAttribute('aria-pressed', String(star === value));
      button.classList.toggle('selected', star <= value);
    }
    if (value) status.textContent = 'Ваша оценка: ' + value + ' из 5. Сохранена на этом устройстве.';
    else if (!status.textContent.includes('недоступно')) status.textContent = 'Вы ещё не оценили эту новеллу.';
  };
  for (const button of buttons) {
    button.addEventListener('click', () => {
      ratings[slug] = Number(button.dataset.star);
      try {
        localStorage.setItem(KEY, JSON.stringify(ratings));
      } catch {
        status.textContent = 'Оценка действует только до закрытия этой страницы.';
      }
      paint();
    });
  }
  paint();
}
