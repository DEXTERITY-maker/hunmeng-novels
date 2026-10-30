/**
 * Manual-only featured carousel. The first server-rendered slide is the
 * progressively enhanced fallback: without JS its cover and link still work.
 */
export function initFeaturedCarousel() {
  const root = document.querySelector<HTMLElement>('[data-feature-carousel]');
  if (!root || root.dataset.carouselReady === 'true') return;
  root.dataset.carouselReady = 'true';
  const slides = Array.from(root.querySelectorAll<HTMLElement>('[data-feature-slide]'));
  const controls = root.querySelector<HTMLElement>('[data-feature-controls]');
  const dots = Array.from(root.querySelectorAll<HTMLButtonElement>('[data-feature-dot]'));
  const status = root.querySelector<HTMLElement>('[data-feature-status]');
  if (!slides.length) return;
  let active = 0;

  const show = (index: number) => {
    active = (index + slides.length) % slides.length;
    slides.forEach((slide, i) => {
      slide.hidden = i !== active;
      slide.setAttribute('aria-hidden', i === active ? 'false' : 'true');
    });
    dots.forEach((dot, i) => dot.setAttribute('aria-pressed', String(i === active)));
    if (status) status.textContent = slides[active].getAttribute('aria-label') || '';
  };
  show(0);
  if (slides.length === 1) {
    if (controls) controls.hidden = true;
    return;
  }
  if (controls) controls.hidden = false;
  root.querySelector<HTMLButtonElement>('[data-feature-prev]')?.addEventListener('click', () => show(active - 1));
  root.querySelector<HTMLButtonElement>('[data-feature-next]')?.addEventListener('click', () => show(active + 1));
  dots.forEach((dot, i) => dot.addEventListener('click', () => show(i)));

  root.addEventListener('keydown', (event) => {
    if (event.altKey || event.ctrlKey || event.metaKey) return;
    if (event.key === 'ArrowLeft') { event.preventDefault(); show(active - 1); }
    if (event.key === 'ArrowRight') { event.preventDefault(); show(active + 1); }
    if (event.key === 'Home' && (event.target as HTMLElement).closest('[data-feature-dot]')) { event.preventDefault(); show(0); dots[0]?.focus(); }
    if (event.key === 'End' && (event.target as HTMLElement).closest('[data-feature-dot]')) { event.preventDefault(); show(slides.length - 1); dots.at(-1)?.focus(); }
  });

  let x0: number | null = null;
  let y0: number | null = null;
  root.addEventListener('pointerdown', (event) => {
    if (event.pointerType !== 'touch') return;
    x0 = event.clientX;
    y0 = event.clientY;
  }, { passive: true });
  root.addEventListener('pointerup', (event) => {
    if (event.pointerType !== 'touch' || x0 === null || y0 === null) return;
    const dx = event.clientX - x0, dy = event.clientY - y0;
    x0 = y0 = null;
    if (Math.abs(dx) < 45 || Math.abs(dx) < Math.abs(dy) * 1.2) return;
    show(active + (dx < 0 ? 1 : -1));
  }, { passive: true });
  root.addEventListener('pointercancel', () => { x0 = y0 = null; });
}
