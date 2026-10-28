import { gsap } from 'gsap';

/**
 * Animate the existing Astro Hero, not a replacement React Hero.
 * Its links, search form and featured novel stay server-rendered and functional.
 */
export function initHomeHeroMotion() {
  const hero = document.querySelector<HTMLElement>('.home-page .home-hero');
  if (!hero) return;
  const media = gsap.matchMedia();
  media.add('(prefers-reduced-motion: no-preference)', () => {
    const context = gsap.context(() => {
      const timeline = gsap.timeline({ defaults: { ease: 'power3.out' } });
      timeline
        .from(
          ['.home-hero-kicker', '#home-title', '.home-hero-description'],
          { y: 22, opacity: 0, duration: 0.72, stagger: 0.1, clearProps: 'all' },
        )
        .from(
          ['.home-search', '.home-discover a'],
          { y: 13, opacity: 0, duration: 0.56, stagger: 0.07, clearProps: 'all' },
          '-=0.38',
        )
        .from('.home-hero-feature', {
          x: 18, y: 8, opacity: 0, duration: 0.82, clearProps: 'all',
        }, '-=0.7');
    }, hero);
    return () => context.revert();
  });
  window.addEventListener('pagehide', () => media.revert(), { once: true });
}
