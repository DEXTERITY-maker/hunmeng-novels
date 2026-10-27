/**
 * Three deep-linkable account views, on every screen size.
 * URL hashes remain ordinary links and no account/storage logic changes.
 * Without JavaScript the sections remain readable in their original order.
 */
export function initProfileTabs() {
  const root = document.getElementById('auth-logged-in');
  const nav = root?.querySelector<HTMLElement>('.profile-sidebar nav');
  if (!root || !nav) return;

  const ids = ['profile-details', 'profile-reading', 'profile-account'] as const;
  type Section = (typeof ids)[number];
  const sections = new Map(ids.map(id => [id, document.getElementById(id)!]));
  const links = [...nav.querySelectorAll<HTMLAnchorElement>('a[data-profile-section]')];

  const views: Record<Section, { title: string; subtitle: string }> = {
    'profile-details': {
      title: 'My profile',
      subtitle: 'Manage your personal information and profile.',
    },
    'profile-reading': {
      title: 'Reading settings',
      subtitle: 'Make your reading experience comfortable.',
    },
    'profile-account': {
      title: 'My account',
      subtitle: 'Manage your account and library access.',
    },
  };

  const activeFromUrl = (): Section => {
    const hash = location.hash.slice(1);
    return ids.includes(hash as Section) ? hash as Section : 'profile-details';
  };

  const show = (active: Section) => {
    root.dataset.profileActive = active;
    for (const [id, section] of sections) {
      section.hidden = id !== active;
    }
    links.forEach(link => {
      if (link.dataset.profileSection === active) link.setAttribute('aria-current', 'location');
      else link.removeAttribute('aria-current');
    });

    if (!root.hidden) {
      document.getElementById('account-title')!.textContent = views[active].title;
      document.getElementById('account-subtitle')!.textContent = views[active].subtitle;
      document.title = views[active].title + ' — Hunmeng novels';
    }
  };

  links.forEach(link => link.addEventListener('click', () => {
    // Switch before native hash navigation so the target is not hidden while
    // the browser handles keyboard focus, scroll and the URL fragment.
    const id = link.dataset.profileSection as Section;
    if (sections.has(id)) show(id);
  }));
  window.addEventListener('hashchange', () => show(activeFromUrl()));
  window.addEventListener('reader:auth-change', () => queueMicrotask(() => show(activeFromUrl())));
  root.dataset.profileTabsReady = 'true';
  show(activeFromUrl());
}
