/** Decorative cover fallback for every featured slide, including slides not initially visible. */
export function initFeaturedCover() {
  document.querySelectorAll<HTMLElement>('[data-feature-cover]').forEach((root) => {
    const img = root.querySelector<HTMLImageElement>('img');
    const label = root.querySelector<HTMLElement>('.home-feature-cover-fallback');
    if (!img || !label) return;
    const fallback = () => {
      if (img.dataset.fallback === 'used') {
        img.hidden = true;
        label.hidden = false;
        root.dataset.coverStatus = 'unavailable';
        return;
      }
      img.dataset.fallback = 'used';
      img.src = '/images/novel-placeholder.svg';
      root.dataset.coverStatus = 'fallback';
    };
    img.addEventListener('error', fallback);
    if (img.complete && img.naturalWidth === 0) fallback();
    else img.addEventListener('load', () => { root.dataset.coverStatus = 'loaded'; label.hidden = true; });
  });
}
