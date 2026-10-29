import { createPersonalTermReplacer, personalTermPrefix, readPersonalTerms, removePersonalTerm,
  savePersonalTerm, type PersonalTerm } from '../lib/personal-terms';

/** Adjusts only text nodes on this page, never the source, links or reader state. */
export function initPersonalTerms(slug: string, article: HTMLElement): void {
  const section = document.querySelector<HTMLElement>('#personal-terms');
  const form = document.querySelector<HTMLFormElement>('#personal-terms-form');
  const list = document.querySelector<HTMLElement>('#personal-terms-list');
  const status = document.querySelector<HTMLElement>('#personal-terms-status');
  const from = document.querySelector<HTMLInputElement>('#personal-term-from');
  const to = document.querySelector<HTMLInputElement>('#personal-term-to');
  if (!section || !form || !list || !status || !from || !to) return;
  const walker = document.createTreeWalker(article, NodeFilter.SHOW_TEXT);
  const originals: Array<{ node: Text; text: string }> = [];
  for (let node = walker.nextNode(); node; node = walker.nextNode()) {
    const text = node as Text;
    if (!text.parentElement?.closest('script,style,code,pre')) originals.push({ node: text, text: text.data });
  }
  let storage: Storage;
  try { storage = window.localStorage; personalTermPrefix(slug); readPersonalTerms(storage, slug); }
  catch { section.hidden = false; form.hidden = true; status.textContent = 'Personal replacements are unavailable on this device.'; return; }
  const render = (notice = '') => {
    let terms: PersonalTerm[];
    try { terms = readPersonalTerms(storage, slug); }
    catch { status.textContent = 'Unable to read personal replacements on this device.'; return; }
    const anchor = Array.from(article.children).find(element => element.getBoundingClientRect().bottom > 88);
    const anchorTop = anchor?.getBoundingClientRect().top;
    const replace = createPersonalTermReplacer(terms);
    for (const original of originals) original.node.data = replace(original.text);
    if (anchor && anchorTop !== undefined && window.scrollY > 0)
      window.scrollBy(0, anchor.getBoundingClientRect().top - anchorTop);
    list.replaceChildren();
    for (const term of terms) {
      const item = document.createElement('li');
      const label = document.createElement('span');
      label.textContent = `${term.from} → ${term.to}`;
      const remove = document.createElement('button');
      remove.type = 'button'; remove.textContent = 'Remove';
      remove.setAttribute('aria-label', `Remove replacement for ${term.from}`);
      remove.addEventListener('click', () => {
        try { removePersonalTerm(storage, slug, term.from); render('Replacement removed.'); }
        catch { status.textContent = 'Unable to remove the replacement. Please try again.'; }
      });
      item.append(label, remove); list.append(item);
    }
    status.textContent = notice || (terms.length ? `${terms.length} saved on this device.` : 'No personal replacements yet.');
  };
  form.addEventListener('submit', event => {
    event.preventDefault();
    try {
      savePersonalTerm(storage, slug, { from: from.value.trim(), to: to.value.trim() });
      form.reset(); render('Replacement saved on this device.');
    } catch { status.textContent = 'Unable to save. Use two non-empty terms of up to 100 characters, with at most 50 replacements.'; }
  });
  window.addEventListener('storage', event => {
    if (event.key === null || event.key.startsWith(personalTermPrefix(slug))) render();
  });
  section.hidden = false;
  render();
}
