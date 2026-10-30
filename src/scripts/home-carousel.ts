// No autoplay: a visitor controls the featured recommendation.
function initFeaturedCarousel(root: HTMLElement) {
  const slides = Array.from(root.querySelectorAll<HTMLElement>('[data-feature-slide]'));
  const dots = Array.from(root.querySelectorAll<HTMLButtonElement>('[data-feature-dot]'));
  if (slides.length < 2) return;
  let active = 0;
  const show = (next: number) => {
    active = (next + slides.length) % slides.length;
    slides.forEach((slide, index) => {
      slide.hidden = index !== active;
      slide.setAttribute('aria-hidden', String(index !== active));
    });
    dots.forEach((dot, index) => {
      if (index === active) dot.setAttribute('aria-current', 'true');
      else dot.removeAttribute('aria-current');
    });
  };
  root.querySelector('[data-feature-prev]')?.addEventListener('click', () => show(active - 1));
  root.querySelector('[data-feature-next]')?.addEventListener('click', () => show(active + 1));
  dots.forEach((dot, index) => dot.addEventListener('click', () => show(index)));
  root.addEventListener('keydown', event => {
    if (event.key !== 'ArrowLeft' && event.key !== 'ArrowRight') return;
    const target = event.target as HTMLElement;
    if (target.matches('input, textarea, select, [contenteditable]')) return;
    event.preventDefault();
    show(active + (event.key === 'ArrowRight' ? 1 : -1));
  });
  let startX: number | null = null;
  root.addEventListener('touchstart', event => {
    startX = event.changedTouches[0]?.clientX ?? null;
  }, { passive: true });
  root.addEventListener('touchend', event => {
    if (startX === null) return;
    const delta = (event.changedTouches[0]?.clientX ?? startX) - startX;
    startX = null;
    if (Math.abs(delta) > 45) show(active + (delta < 0 ? 1 : -1));
  }, { passive: true });
}
if (typeof document !== 'undefined') {
  document.querySelectorAll<HTMLElement>('[data-feature-carousel]').forEach(initFeaturedCarousel);
}
