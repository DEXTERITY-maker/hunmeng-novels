import { rightsStatusLabels, jobStatusLabels } from '../lib/labels';
import { backendConfigured, BackendError, getStaffRole, rest, signOut, type ApiRecord, type StaffRole } from '../lib/backend';

type Source = {
  id: string; slug: string; original_title: string; rights_status: string;
  permission_publish: boolean; permission_translate: boolean; rights_evidence?: string;
};
type Term = { id: string; source_id: string; original_term: string; translated_term: string };
type Job = {
  id: string; source_id: string; chapter_number: number; chapter_title: string;
  chapter_slug: string; status: string; updated_at: string; qa_notes: string; original_text: string;
  translated_text: string; chapter_description: string;
};
const el = <K extends keyof HTMLElementTagNameMap>(tag: K, content = '') => {
  const node = document.createElement(tag);
  node.textContent = content;
  return node;
};
const value = (form: HTMLFormElement, name: string) =>
  String(new FormData(form).get(name) ?? '').trim();
export async function initAdmin() {
  const message = document.getElementById('admin-status')!;
  const workspace = document.getElementById('admin-workspace')!;
  const loginLink = document.getElementById('admin-login-link')!;
  const logout = document.querySelector<HTMLButtonElement>('#admin-signout')!;
  const lock = (text: string) => {
    workspace.hidden = true;
    // Remove loaded editorial data and unsaved text from the DOM after session loss.
    workspace.querySelectorAll('form').forEach(form => form.reset());
    for (const id of ['admin-source-list', 'admin-term-list', 'admin-job-list'])
      document.getElementById(id)?.replaceChildren();
    loginLink.hidden = false;
    message.textContent = text;
  };
  window.addEventListener('hunmeng:session-ended', () => {
    logout.hidden = true;
    lock('Your session has ended. Sign in to the editorial team again.');
  });
  logout.addEventListener('click', async () => {
    logout.disabled = true;
    const revoked = await signOut();
    lock(revoked ? 'You are signed out of editorial tools.' :
      'You are signed out in this tab. The server could not confirm sign-out. Sign in and out again when your connection is restored.');
    logout.hidden = true;
    logout.disabled = false;
  });
  if (!backendConfigured) {
    message.textContent = 'Sign-in is not configured. Contact the project owner.';
    return;
  }
  let role: StaffRole | null;
  try { role = await getStaffRole(); }
  catch (error) {
    message.textContent = error instanceof BackendError ? error.message : 'Unable to verify access. Please try again.';
    return;
  }
  if (!role) {
    message.textContent = 'Access denied. Sign in with an editor or administrator account.';
    return;
  }
  loginLink.hidden = true;
  logout.hidden = false;
  workspace.hidden = false;
  message.textContent = role === 'admin' ? 'Administrator: full editorial access.' :
    'Editor: drafts and glossary are available. Only administrators can manage permissions and approve publication.';
  const rightsForm = document.querySelector<HTMLFormElement>('#rights-form')!;
  const sourceForm = document.querySelector<HTMLFormElement>('#source-form')!;
  const termForm = document.querySelector<HTMLFormElement>('#term-form')!;
  const jobForm = document.querySelector<HTMLFormElement>('#job-form')!;
  const sourcesDiv = document.getElementById('admin-source-list')!;
  const termsDiv = document.getElementById('admin-term-list')!;
  const jobsDiv = document.getElementById('admin-job-list')!;
  if (role !== 'admin') {
    rightsForm.hidden = true;
    sourceForm.hidden = true;
  }
  let sources: Source[] = [];
  let terms: Term[] = [];
  let jobs: Job[] = [];

  const notify = (error: unknown) => {
    const text = error instanceof Error ? error.message : 'The server rejected the request. Please try again.';
    if (error instanceof BackendError && (error.status === 401 || error.status === 403)) lock(text);
    else message.textContent = text;
  };
  // Revalidate on returning to the tab and once a minute. RLS still checks every request.
  let checking = false;
  const checkAccess = async () => {
    if (checking || workspace.hidden || document.hidden) return;
    checking = true;
    try {
      if (await getStaffRole() !== role) {
        lock('Your editorial access has changed. Sign in again.');
        await signOut();
      }
    } catch (error) { lock('Unable to verify access. Sign in to the editorial team again.'); }
    finally { checking = false; }
  };
  window.addEventListener('focus', () => void checkAccess());
  document.addEventListener('visibilitychange', () => void checkAccess());
  window.setInterval(() => void checkAccess(), 60000);
  function sourceOptions() {
    for (const form of [rightsForm, termForm, jobForm]) {
      const select = form.elements.namedItem('source_id') as HTMLSelectElement;
      const selected = select.value;
      select.replaceChildren();
      for (const source of sources) {
        const option = el('option', source.slug + ' — ' + source.original_title);
        option.value = source.id;
        select.append(option);
      }
      if (sources.some((s) => s.id === selected)) select.value = selected;
    }
  }
  async function load() {
    sources = await rest<Source[]>('novel_sources', 'GET',
      'select=id,slug,original_title,rights_status,permission_publish,permission_translate,rights_evidence&order=created_at.desc');
    terms = await rest<Term[]>('novel_terms','GET',
      'select=id,source_id,original_term,translated_term&order=original_term.asc');
    jobs = await rest<Job[]>('novel_translation_jobs','GET',
      'select=id,source_id,chapter_number,chapter_title,chapter_slug,status,updated_at,qa_notes,original_text,translated_text,chapter_description&order=updated_at.desc&limit=100');
    if (workspace.hidden) return;
    sourceOptions();
    sourcesDiv.replaceChildren();
    const ul = el('ul');
    for (const source of sources) ul.append(el('li', source.slug + ' · ' + (rightsStatusLabels[source.rights_status] ?? 'Unknown status')));
    sourcesDiv.append(ul);
    termsDiv.replaceChildren();
    const termsList = el('ul');
    for (const term of terms) {
      const row = el('li', term.original_term + ' → ' + term.translated_term + ' ');
      const remove = el('button', 'Delete');
      remove.type = 'button';
      remove.className = 'text-button';
      remove.onclick = async () => {
        try {
          const removed = await rest<ApiRecord[]>('novel_terms','DELETE','id=eq.' + encodeURIComponent(term.id));
          if (removed.length !== 1) throw new Error('The term was already removed. Refresh the list.');
          await load();
        } catch (error) { notify(error); }
      };
      row.append(remove); termsList.append(row);
    }
    termsDiv.append(termsList);
    jobsDiv.replaceChildren();
    if (!jobs.length) jobsDiv.append(el('p', 'The queue is empty.'));
    for (const job of jobs) {
      const wrapper = el('div');
      wrapper.className = 'admin-job-row';
      wrapper.append(el('strong',
        (sources.find(s => s.id === job.source_id)?.slug ?? 'Source') +
        ' / ' + job.chapter_number + '. ' + job.chapter_title + ' · ' + (jobStatusLabels[job.status] ?? 'Unknown status')));
      const note = el('textarea') as HTMLTextAreaElement;
      note.value = job.qa_notes ?? '';
      note.placeholder = 'Review notes, at least 20 characters for approval';
      note.rows = 2;
      note.setAttribute('aria-label','Review notes: '+job.chapter_title);
      wrapper.append(note);
      const actions = el('div');
      actions.className = 'admin-actions';
      const edit = el('button','Open in editor');
      edit.type = 'button';
      edit.className = 'button secondary';
      edit.disabled = job.status === 'approved' || job.status === 'published';
      edit.title = edit.disabled ? 'Reopen an approved chapter before editing; published chapters are immutable.' : '';
      edit.onclick = () => {
        if (edit.disabled) return;
        for (const [name,data] of Object.entries({
          source_id:job.source_id, chapter_number:job.chapter_number,chapter_slug:job.chapter_slug,
          chapter_title:job.chapter_title,chapter_description:job.chapter_description,
          original_text:job.original_text,translated_text:job.translated_text,
        })) {
          const input = jobForm.elements.namedItem(name);
          if (input instanceof HTMLInputElement || input instanceof HTMLTextAreaElement || input instanceof HTMLSelectElement)
            input.value = String(data);
        }
        jobForm.dataset.editId = job.id;
        jobForm.dataset.editStatus = job.status;
        jobForm.dataset.editVersion = job.updated_at;
        const save = jobForm.querySelector<HTMLButtonElement>('[data-job-status="save"]')!;
        save.textContent = job.status === 'review' ? 'Save changes (keep in review)' : 'Save draft';
        jobForm.querySelector<HTMLButtonElement>('[data-job-status="draft"]')!.hidden = job.status !== 'review';
        jobForm.scrollIntoView({block:'start'});
      };
      actions.append(edit);
      if (role === 'admin' && job.status === 'review') {
        const approve = el('button','Approve for publication');
        approve.type = 'button';
        approve.className = 'button';
        approve.onclick = async () => {
          try {
            if (job.status !== 'review') throw new Error('Only reviewed chapters can be approved.');
            const rows = await rest<Job[]>('novel_translation_jobs','PATCH',
              'id=eq.'+encodeURIComponent(job.id)+'&updated_at=eq.'+encodeURIComponent(job.updated_at),
              {status:'approved',qa_notes:note.value});
            if (rows.length !== 1) throw new Error('The chapter changed in another session. Refresh and review it again.');
            message.textContent = 'Chapter approved. A server job will publish it.';
            await load();
          } catch(error) { notify(error); }
        };
        actions.append(approve);
      }
      if (role === 'admin' && job.status === 'approved') {
        const reopen = el('button','Return to review');
        reopen.type = 'button';
        reopen.className = 'button secondary';
        reopen.onclick = async () => {
          if (!window.confirm('Withdraw approval and return this chapter to review?')) return;
          try {
            const rows = await rest<Job[]>('novel_translation_jobs','PATCH',
              'id=eq.'+encodeURIComponent(job.id)+'&updated_at=eq.'+encodeURIComponent(job.updated_at),
              {status:'review'});
            if (rows.length !== 1) throw new Error('The chapter changed in another session. Refresh and try again.');
            message.textContent = 'Approval withdrawn. Chapter returned to review.';
            await load();
          } catch (error) { notify(error); }
        };
        actions.append(reopen);
      }
      wrapper.append(actions); jobsDiv.append(wrapper);
    }
  }
  function onSubmit(form: HTMLFormElement, fn: (f: HTMLFormElement, submitter: HTMLElement | null) => Promise<void | string>) {
    form.addEventListener('submit', async (e) => {
      e.preventDefault();
      // Evaluate form values synchronously, then lock the controls until the
      // server confirms the mutation and the refreshed list is rendered.
      const operation = fn(form, e instanceof SubmitEvent ? e.submitter as HTMLElement | null : null);
      const controls = Array.from(form.querySelectorAll<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement | HTMLButtonElement>(
        'input, select, textarea, button'));
      const priorDisabled = controls.map(control => control.disabled);
      controls.forEach(control => { control.disabled = true; });
      try {
        const result = await operation;
        form.reset();
        if (form === jobForm) {
          delete jobForm.dataset.editId;
          delete jobForm.dataset.editStatus;
          delete jobForm.dataset.editVersion;
          jobForm.querySelector<HTMLButtonElement>('[data-job-status="save"]')!.textContent = 'Save draft';
          jobForm.querySelector<HTMLButtonElement>('[data-job-status="draft"]')!.hidden = true;
        }
        await load();
        message.textContent = result || 'Saved.';
      } catch (error) { notify(error); }
      finally { controls.forEach((control, index) => { control.disabled = priorDisabled[index]; }); }
    });
  }
  onSubmit(sourceForm, async f => {
    const saved = await rest<ApiRecord[]>('novel_sources','POST','',{
      slug:value(f,'slug'),original_title:value(f,'original_title'),
      original_url:value(f,'original_url'),author_name:value(f,'author_name'),
      title_ru:value(f,'title_ru'),description_ru:value(f,'description_ru'),
      genres:value(f,'genres').split(',').map(s=>s.trim()).filter(Boolean),
      tags:value(f,'tags').split(',').map(s=>s.trim()).filter(Boolean),
      original_status:value(f,'original_status'),
      translation_status:value(f,'translation_status'),
    });
    if (saved.length !== 1) throw new Error('The server did not confirm the new source.');
  });
  onSubmit(rightsForm, async f => {
    const saved = await rest<ApiRecord[]>('novel_sources','PATCH','id=eq.'+encodeURIComponent(value(f,'source_id')),{
      rights_status:value(f,'rights_status'),
      rights_evidence:value(f,'rights_evidence') || null,
      rights_valid_until:value(f,'rights_valid_until') || null,
      permission_translate:new FormData(f).has('permission_translate'),
      permission_publish:new FormData(f).has('permission_publish'),
    });
    if (saved.length !== 1) throw new Error('The server did not confirm the permissions update.');
  });
  onSubmit(termForm, async f => {
    const saved = await rest<ApiRecord[]>('novel_terms','POST','',{
      source_id:value(f,'source_id'),original_term:value(f,'original_term'),
      translated_term:value(f,'translated_term'),term_type:value(f,'term_type'),note:value(f,'note'),
    });
    if (saved.length !== 1) throw new Error('The server did not confirm the glossary entry.');
  });
  onSubmit(jobForm, async (f, submitter) => {
    const action = submitter?.dataset.jobStatus ?? 'save';
    const oldStatus = f.dataset.editStatus;
    if (oldStatus === 'approved' || oldStatus === 'published')
      throw new Error('Approved and published chapters cannot be edited here.');
    const requestedStatus = action === 'review' ? 'review' :
      action === 'draft' ? 'draft' : oldStatus === 'review' ? 'review' : 'draft';
    if (requestedStatus === 'review' &&
        (value(f, 'original_text').length < 80 || value(f, 'translated_text').length < 80 ||
         value(f, 'chapter_description').length < 10)) {
      throw new Error('Complete the source, translation, and description before sending for review.');
    }
    const body: ApiRecord = {
      source_id:value(f,'source_id'),chapter_number:Number(value(f,'chapter_number')),
      chapter_slug:value(f,'chapter_slug'),chapter_title:value(f,'chapter_title'),
      chapter_description:value(f,'chapter_description'),original_text:value(f,'original_text'),
      translated_text:value(f,'translated_text'),status:requestedStatus,
    };
    if (f.dataset.editId) {
      if (!f.dataset.editVersion) throw new Error('Missing revision version. Refresh the chapter.');
      const rows = await rest<Job[]>('novel_translation_jobs','PATCH',
        'id=eq.'+encodeURIComponent(f.dataset.editId)+
        '&updated_at=eq.'+encodeURIComponent(f.dataset.editVersion),body);
      if (rows.length !== 1) throw new Error('Conflict: another session changed or removed this chapter. Refresh before saving.');
    } else {
      const rows = await rest<Job[]>('novel_translation_jobs','POST','',body);
      if (rows.length !== 1) throw new Error('The server did not confirm the saved chapter.');
    }
    return requestedStatus === 'review' ? 'Chapter saved in review.' : 'Draft saved privately.';
  });
  document.getElementById('admin-refresh')?.addEventListener('click',()=> {
    void load().catch(notify);
  });
  await load().catch(notify);
}
