import Lenis from 'lenis';
import 'lenis/dist/lenis.css';

/**
 * Opt-in smooth scroll only on editorial discovery routes.
 * Never run on chapter readers, account/auth, studio, or admin screens:
 * those surfaces have their own scroll restoration, inputs and overlays.
 */
export function initEditorialScroll() {
  const allowed = /^\/(?:$|catalog\/|genres\/|tags\/|authors\/|updates\/|news\/|ranks\/|about\/$)/.test(location.pathname);
  if (!allowed || document.querySelector('[data-reader]')) return null;

  const canSmooth = window.matchMedia('(min-width: 1024px) and (pointer: fine) and (prefers-reduced-motion: no-preference)');
  if (!canSmooth.matches) return null;

  const lenis = new Lenis({
    autoRaf: true,
    anchors: true,
    duration: 0.85,
    smoothWheel: true,
    syncTouch: false,
    wheelMultiplier: 0.92,
    prevent: (node: Element) => Boolean(node.closest('dialog, [data-lenis-prevent], [role="dialog"]')),
  });

  // Reduced-motion and viewport changes should immediately restore native scroll.
  const onChange = () => {
    if (!canSmooth.matches) lenis.stop();
    else lenis.start();
  };
  canSmooth.addEventListener('change', onChange);
  window.addEventListener('pagehide', () => {
    canSmooth.removeEventListener('change', onChange);
    lenis.destroy();
  }, { once: true });
  return lenis;
}
