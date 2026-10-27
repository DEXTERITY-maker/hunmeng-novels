export function initHeader() {
  const header = document.querySelector<HTMLElement>('.site-header');
  if (!header) return;
  const popovers = [...header.querySelectorAll<HTMLDetailsElement>('.header-popover')];
  const close = (popover: HTMLDetailsElement, restoreFocus = false) => {
    popover.open = false;
    if (restoreFocus) popover.querySelector<HTMLElement>('summary')?.focus();
  };
  popovers.forEach(popover => {
    popover.addEventListener('toggle', () => {
      if (!popover.open) return;
      popovers.forEach(other => { if (other !== popover) close(other); });
      popover.querySelector<HTMLInputElement>('input[type="search"]')?.focus();
    });
    popover.addEventListener('keydown', event => {
      if (event.key === 'Escape' && popover.open) {
        event.preventDefault();
        close(popover, true);
      }
    });
  });
  document.addEventListener('click', event => {
    popovers.forEach(popover => {
      if (popover.open && !popover.contains(event.target as Node)) close(popover);
    });
  });
  header.addEventListener('focusout', event => {
    if (!event.relatedTarget) return;
    popovers.forEach(popover => {
      if (popover.open && !popover.contains(event.relatedTarget as Node)) close(popover);
    });
  });
}
