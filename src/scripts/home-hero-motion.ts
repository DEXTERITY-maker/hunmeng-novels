import { gsap } from 'gsap';

/**
 * Animate the existing Astro Hero, not a replacement React Hero.
 * Its links, search form and featured novel stay server-rendered and functional.
 * Never animate from opacity 0: slow devices must show content immediately.
 */
export function initHomeHeroMotion() {
  const hero = document.querySelector<HTMLElement>('.home-page .home-hero');
  if (!hero) return;
  const media = gsap.matchMedia();
  media.add('(min-width: 761px) and (prefers-reduced-motion: no-preference)', () => {
    const context = gsap.context(() => {
      const timeline = gsap.timeline({ defaults: { ease: 'power3.out' } });
      timeline
        .from(
          ['.home-hero-kicker', '#home-title', '.home-hero-description'],
          { y: 12, duration: 0.3, stagger: 0.06, clearProps: 'all' },
        )
        .from(
          ['.home-search', '.home-discover a'],
          { y: 8, duration: 0.24, stagger: 0.05, clearProps: 'all' },
          '-=0.38',
        )
        .from('.home-hero-feature', {
          x: 9, y: 4, duration: 0.26, clearProps: 'all',
        }, '-=0.7');
    }, hero);
    return () => context.revert();
  });
  window.addEventListener('pagehide', () => media.revert(), { once: true });
}
