export function initTaxonomyDirectory() {
  document.querySelectorAll<HTMLElement>('[data-taxonomy-directory]').forEach(root => {
    const search = root.querySelector<HTMLInputElement>('[data-term-search]')!;
    const group = root.querySelector<HTMLSelectElement>('[data-term-group]');
    const available = root.querySelector<HTMLSelectElement>('[data-term-availability]')!;
    const sort = root.querySelector<HTMLSelectElement>('[data-term-sort]')!;
    const list = root.querySelector<HTMLElement>('[data-term-list]')!;
    const items = Array.from(root.querySelectorAll<HTMLElement>('[data-term]'));
    const fold = (value: string) => value.normalize('NFKC').toLocaleLowerCase('en').trim();
    function render() {
      let shown = 0;
      for (const item of items) {
        item.hidden = !fold(item.dataset.label!).includes(fold(search.value)) ||
          Boolean(group?.value && item.dataset.group !== group.value) ||
          (available.value === 'available' && Number(item.dataset.count) === 0);
        if (!item.hidden) shown++;
      }
      items.sort((a, b) => (sort.value === 'count' ? Number(b.dataset.count) - Number(a.dataset.count) : 0) ||
        a.dataset.label!.localeCompare(b.dataset.label!, 'en'));
      list.append(...items);
      root.querySelector('[data-term-count]')!.textContent = `Showing ${shown} of ${items.length}`;
      (root.querySelector('[data-term-empty]') as HTMLElement).hidden = shown > 0;
    }
    search.addEventListener('input', render);
    for (const control of [group, available, sort]) control?.addEventListener('change', render);
    root.querySelector('[data-term-reset]')!.addEventListener('click', () => {
      search.value = ''; if (group) group.value = ''; available.value = 'all'; sort.value = 'name'; render();
    });
  });
}
