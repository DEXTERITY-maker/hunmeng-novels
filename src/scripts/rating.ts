const KEY = 'hunmeng-personal-ratings:v1';

// These ratings are personal to this device, not public site statistics.
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
    status.textContent = 'Local storage is unavailable.';
  }
  const paint = () => {
    const value = ratings[slug] ?? 0;
    for (const button of buttons) {
      const star = Number(button.dataset.star);
      button.setAttribute('aria-pressed', String(star === value));
      button.classList.toggle('selected', star <= value);
      button.textContent = star <= value ? '★' : '☆';
    }
    if (value) status.textContent = 'Your rating: ' + value + ' out of 5. Saved on this device.';
    else if (!status.textContent.includes('unavailable')) status.textContent = 'You have not rated this novel yet.';
  };
  for (const button of buttons) {
    button.addEventListener('click', () => {
      ratings[slug] = Number(button.dataset.star);
      try {
        localStorage.setItem(KEY, JSON.stringify(ratings));
      } catch {
        status.textContent = 'This rating lasts only until you close this page.';
      }
      paint();
    });
  }
  paint();
}
