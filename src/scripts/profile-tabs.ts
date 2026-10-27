/** Mobile account sections behave as deep-linkable panels. Desktop retains a full-page layout.
 * The content remains available without JavaScript, and no account data is changed. */
export function initProfileTabs() {
  const root = document.getElementById('auth-logged-in');
  const nav = root?.querySelector<HTMLElement>('.profile-sidebar nav');
  if (!root || !nav) return;
  const sections = ['profile-details', 'profile-reading', 'profile-account'] as const;
  const links = [...nav.querySelectorAll<HTMLAnchorElement>('a[data-profile-section]')];
  const select = () => {
    const id = location.hash.slice(1);
    const active = sections.includes(id as (typeof sections)[number]) ? id : sections[0];
    root.dataset.profileActive = active;
    links.forEach(link => {
      if (link.dataset.profileSection === active) link.setAttribute('aria-current', 'location');
      else link.removeAttribute('aria-current');
    });
  };
  links.forEach(link => link.addEventListener('click', () => {
    root.dataset.profileTabbed = 'true';
    // Hashchange will also run for a different destination; handle same-hash clicks.
    if (link.hash === location.hash) select();
  }));
  window.addEventListener('hashchange', () => {
    if (sections.includes(location.hash.slice(1) as (typeof sections)[number])) root.dataset.profileTabbed = 'true';
    select();
  });
  if (sections.includes(location.hash.slice(1) as (typeof sections)[number])) root.dataset.profileTabbed = 'true';
  select();
  root.dataset.profileTabsReady = 'true';
}
