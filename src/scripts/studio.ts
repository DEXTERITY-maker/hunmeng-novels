import { studioUser, studioRest as rest, onStudioSignedOut } from '../lib/studio-session';

type Novel = {
  id: string; title: string; synopsis: string; outline: string; characters: string;
  genres: string[]; tags: string[]; updated_at: string;
};
type Chapter = { id: string; novel_id: string; number: number; title: string; body: string; updated_at: string };
type Revision = { id: string; title: string; body: string; created_at: string };

const $ = <T extends HTMLElement>(selector: string) => document.querySelector<T>(selector)!;
const query = (id: string) => 'id=eq.' + encodeURIComponent(id);
const labels = (value: string) => value.split(',').map(v => v.trim()).filter(Boolean).slice(0, 30);
const shortError = (error: unknown) => error instanceof Error ? error.message : 'Request failed. Please retry.';

export async function initStudio() {
  const status = $('#studio-status');
  const workspace = $('#studio-workspace');
  const login = $('#studio-login');
  const novelPicker = $<HTMLSelectElement>('#studio-novels');
  const chapterPicker = $<HTMLSelectElement>('#studio-chapters');
  const novelPanel = $('#studio-novel-panel');
  const chapterPanel = $('#studio-chapter-panel');
  const novelForm = $<HTMLFormElement>('#studio-novel-form');
  const chapterForm = $<HTMLFormElement>('#studio-chapter-form');
  const versionPanel = $('#studio-revisions-panel');
  const versionPicker = $<HTMLSelectElement>('#studio-versions');
  const chapterTitle = $<HTMLInputElement>('#studio-chapter-form [name="title"]');
  const body = $<HTMLTextAreaElement>('#studio-chapter-form [name="body"]');
  const saveState = $('#studio-save-state');
  const count = $('#studio-count');

  let novels: Novel[] = [];
  let chapters: Chapter[] = [];
  let revisions: Revision[] = [];
  let novel: Novel | null = null;
  let chapter: Chapter | null = null;
  let dirty = false;
  let editVersion = 0;
  let timer: number | undefined;
  let saving: Promise<boolean> | null = null;
  let authenticated = false;

  function message(value: string) { status.textContent = value; }
  function choices(select: HTMLSelectElement, items: { id: string; label: string }[], empty: string) {
    select.replaceChildren();
    if (!items.length) {
      const opt = new Option(empty, '');
      select.add(opt);
    } else for (const item of items) select.add(new Option(item.label, item.id));
  }
  function chars() { count.textContent = Array.from(body.value).length.toLocaleString('en-US') + ' characters'; }
  function schedule() {
    clearTimeout(timer);
    timer = window.setTimeout(() => { void flush(); }, 2500);
  }
  function changed() {
    if (!chapter) return;
    dirty = true;
    editVersion++;
    saveState.textContent = 'Unsaved changes · autosave in 2.5s';
    chars();
    schedule();
  }

  async function flush(): Promise<boolean> {
    clearTimeout(timer);
    if (saving) return await saving;
    if (!dirty || !chapter) return true;
    const current = chapter;
    const revision = editVersion;
    const title = chapterTitle.value.trim();
    const text = body.value;
    if (!title) { saveState.textContent = 'Enter a chapter title to save'; return false; }
    saveState.textContent = 'Saving…';
    saving = (async () => {
      try {
        const modified = new Date().toISOString();
        const result = await rest<Chapter[]>('author_chapters', 'PATCH', query(current.id),
          { title, body: text, updated_at: modified });
        if (!result.length) throw new Error('Save was not confirmed. Check your access.');
        current.title = title;
        current.body = text;
        current.updated_at = modified;
        if (chapter?.id === current.id && revision === editVersion) {
          dirty = false;
          saveState.textContent = 'Saved privately';
        } else if (chapter?.id === current.id) {
          saveState.textContent = 'New changes waiting to save';
          schedule();
        }
        return true;
      } catch (error) {
        saveState.textContent = 'Save failed · retry with Save now';
        message('Could not save the chapter: ' + shortError(error));
        return false;
      } finally { saving = null; }
    })();
    return await saving;
  }

  async function settle() {
    for (let i = 0; i < 4; i++) {
      if (!await flush()) return false;
      if (!dirty) return true;
    }
    message('Please stop typing briefly and save before changing chapters.');
    return false;
  }

  async function loadVersions() {
    if (!chapter) return;
    revisions = await rest<Revision[]>('author_revisions', 'GET',
      'select=id,title,body,created_at&chapter_id=eq.' + encodeURIComponent(chapter.id)
      + '&order=created_at.desc&limit=100');
    choices(versionPicker, revisions.map((r, i) => ({
      id: r.id, label: 'Version ' + (revisions.length - i) + ' · ' + new Date(r.created_at).toLocaleString('en-US')
    })), 'No saved versions');
    versionPanel.hidden = false;
    $<HTMLButtonElement>('#studio-restore').disabled = revisions.length === 0;
  }

  async function showChapter(id: string) {
    chapter = chapters.find(c => c.id === id) ?? null;
    chapterPicker.value = chapter?.id ?? '';
    chapterForm.hidden = !chapter;
    versionPanel.hidden = !chapter;
    dirty = false; editVersion++;
    if (!chapter) return;
    chapterTitle.value = chapter.title;
    body.value = chapter.body;
    chars();
    saveState.textContent = 'Saved privately';
    await loadVersions();
  }

  async function loadChapters() {
    if (!novel) return;
    chapters = await rest<Chapter[]>('author_chapters', 'GET',
      'select=id,novel_id,number,title,body,updated_at&novel_id=eq.' + encodeURIComponent(novel.id)
      + '&order=number.asc');
    choices(chapterPicker, chapters.map(c => ({ id: c.id, label: c.number + '. ' + c.title })),
      'No chapters yet');
    await showChapter(chapters[0]?.id ?? '');
  }

  async function showNovel(id: string) {
    novel = novels.find(n => n.id === id) ?? null;
    novelPicker.value = novel?.id ?? '';
    novelPanel.hidden = !novel;
    chapterPanel.hidden = !novel;
    if (!novel) { chapter = null; return; }
    for (const name of ['title', 'synopsis', 'outline', 'characters'] as const) {
      const input = novelForm.elements.namedItem(name);
      if (input instanceof HTMLInputElement || input instanceof HTMLTextAreaElement)
        input.value = novel[name];
    }
    for (const name of ['genres', 'tags'] as const) {
      const input = novelForm.elements.namedItem(name);
      if (input instanceof HTMLInputElement) input.value = novel[name].join(', ');
    }
    await loadChapters();
  }

  async function loadNovels(preferred?: string) {
    novels = await rest<Novel[]>('author_novels', 'GET',
      'select=id,title,synopsis,outline,characters,genres,tags,updated_at&order=updated_at.desc');
    choices(novelPicker, novels.map(n => ({ id: n.id, label: n.title })), 'Create your first novel');
    await showNovel(preferred ?? novels[0]?.id ?? '');
  }

  window.addEventListener('beforeunload', event => {
    if (dirty && authenticated) { event.preventDefault(); event.returnValue = ''; }
  });
  const subscription = onStudioSignedOut(() => {
    authenticated = false; workspace.hidden = true; login.hidden = false;
    message('Your session has ended. Sign in to access drafts again.');
  });

  try {
    const user = await studioUser();
    if (!user) {
      message('Sign in to access your private writing studio.');
      login.hidden = false;
      return;
    }
    authenticated = true;
    workspace.hidden = false;
    await loadNovels();
    message('Private workspace ready. Drafts are never automatically published.');
  } catch (error) {
    workspace.hidden = true;
    message('Unable to load your drafts: ' + shortError(error));
    return;
  }

  window.addEventListener('pagehide', () => subscription.unsubscribe(), {once:true});
  $<HTMLFormElement>('#studio-create').addEventListener('submit', async event => {
    event.preventDefault();
    if (!await settle()) return;
    const input = $<HTMLInputElement>('#studio-new-title');
    const title = input.value.trim();
    if (!title) return;
    try {
      const created = await rest<Novel[]>('author_novels', 'POST', '', { title });
      if (!created[0]) throw new Error('Novel creation was not confirmed.');
      input.value = '';
      await loadNovels(created[0].id);
      message('Private novel created.');
    } catch (error) { message('Could not create novel: ' + shortError(error)); }
  });

  novelPicker.addEventListener('change', async () => {
    const next = novelPicker.value;
    if (!await settle()) { novelPicker.value = novel?.id ?? ''; return; }
    try { await showNovel(next); } catch (error) { message('Could not load novel: ' + shortError(error)); }
  });

  novelForm.addEventListener('submit', async event => {
    event.preventDefault();
    if (!novel) return;
    const data = new FormData(novelForm);
    const payload = {
      title: String(data.get('title') ?? '').trim(),
      synopsis: String(data.get('synopsis') ?? '').trim(),
      outline: String(data.get('outline') ?? ''),
      characters: String(data.get('characters') ?? ''),
      genres: labels(String(data.get('genres') ?? '')),
      tags: labels(String(data.get('tags') ?? '')),
      updated_at: new Date().toISOString(),
    };
    if (!payload.title) return;
    try {
      const result = await rest<Novel[]>('author_novels', 'PATCH', query(novel.id), payload);
      if (!result.length) throw new Error('Changes were not confirmed.');
      Object.assign(novel, payload);
      novelPicker.selectedOptions[0].textContent = novel.title;
      message('Novel details saved privately.');
    } catch (error) { message('Could not save novel details: ' + shortError(error)); }
  });

  $<HTMLButtonElement>('#studio-add-chapter').addEventListener('click', async () => {
    if (!novel || !await settle()) return;
    const number = chapters.reduce((max, c) => Math.max(max, c.number), 0) + 1;
    try {
      const created = await rest<Chapter[]>('author_chapters', 'POST', '',
        { novel_id: novel.id, number, title: 'Chapter ' + number, body: '' });
      if (!created[0]) throw new Error('Chapter creation was not confirmed.');
      await loadChapters();
      await showChapter(created[0].id);
      chapterTitle.focus();
      message('New private chapter created.');
    } catch (error) { message('Could not create chapter: ' + shortError(error)); }
  });

  chapterPicker.addEventListener('change', async () => {
    const next = chapterPicker.value;
    if (!await settle()) { chapterPicker.value = chapter?.id ?? ''; return; }
    try { await showChapter(next); } catch (error) { message('Could not load chapter: ' + shortError(error)); }
  });

  chapterTitle.addEventListener('input', changed);
  body.addEventListener('input', changed);
  chapterForm.addEventListener('submit', async event => {
    event.preventDefault();
    if (await settle()) message('Chapter saved privately.');
  });

  $<HTMLButtonElement>('#studio-save-version').addEventListener('click', async () => {
    if (!chapter || !await settle()) return;
    try {
      const rows = await rest<Revision[]>('author_revisions', 'POST', '',
        { chapter_id: chapter.id, title: chapter.title, body: chapter.body });
      if (!rows.length) throw new Error('Version was not confirmed.');
      await loadVersions();
      message('Version saved. You can restore it later.');
    } catch (error) { message('Could not save version: ' + shortError(error)); }
  });

  $<HTMLButtonElement>('#studio-restore').addEventListener('click', async () => {
    if (!chapter || !await settle()) return;
    const version = revisions.find(v => v.id === versionPicker.value);
    if (!version || !window.confirm('Restore this version? Your current text will be saved as a version first.')) return;
    try {
      const previous = await rest<Revision[]>('author_revisions', 'POST', '',
        { chapter_id: chapter.id, title: chapter.title, body: chapter.body });
      if (!previous.length) throw new Error('Could not back up your current draft.');
      chapterTitle.value = version.title;
      body.value = version.body;
      changed();
      if (!await settle()) return;
      await loadVersions();
      message('Previous version restored. A backup of your former text was saved.');
    } catch (error) { message('Could not restore version: ' + shortError(error)); }
  });
}
