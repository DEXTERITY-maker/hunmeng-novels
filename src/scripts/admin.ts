import { rightsStatusLabels, jobStatusLabels } from '../lib/labels';
import { backendConfigured, BackendError, getStaffRole, rest, signOut, type ApiRecord, type StaffRole } from '../lib/backend';

type Source = {
  id: string; slug: string; original_title: string; rights_status: string;
  permission_publish: boolean; permission_translate: boolean; rights_evidence?: string;
};
type Term = { id: string; source_id: string; original_term: string; translated_term: string };
type Job = {
  id: string; source_id: string; chapter_number: number; chapter_title: string;
  chapter_slug: string; status: string; qa_notes: string; original_text: string;
  translated_text: string; chapter_description: string; updated_at: string;
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
  const draftButton = jobForm.querySelector<HTMLButtonElement>('[data-job-status="draft"]')!;
  const reviewButton = jobForm.querySelector<HTMLButtonElement>('[data-job-status="review"]')!;
  if (role !== 'admin') {
    rightsForm.hidden = true;
    sourceForm.hidden = true;
  }
  let sources: Source[] = [];
  let terms: Term[] = [];
  let jobs: Job[] = [];
  let editingVersion = '';
  let editingStatus = '';

  const notify = (error: unknown) => {
    const text = error instanceof BackendError ? error.message : 'The server rejected the request. Please try again.';
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
      'select=id,source_id,chapter_number,chapter_title,chapter_slug,status,qa_notes,original_text,translated_text,chapter_description,updated_at&order=updated_at.desc&limit=100');
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
          await confirmedMutation('novel_terms','DELETE','id=eq.' + encodeURIComponent(term.id));
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
      edit.onclick = () => {
        for (const [name,data] of Object.entries({
          source_id:job.source_id, chapter_number:job.chapter_number,chapter_slug:job.chapter_slug,
          chapter_title:job.chapter_title,chapter_description:job.chapter_description,
          original_text:job.original_text,translated_text:job.translated_text,
        })) {
          const input = jobForm.elements.namedItem(name);
          if (input instanceof HTMLInputElement || input instanceof HTMLTextAreaElement || input instanceof HTMLSelectElement)
            input.value = String(data);
        }
        (jobForm as HTMLFormElement).dataset.editId = job.id;
        editingVersion = job.updated_at;
        editingStatus = job.status;
        draftButton.disabled = job.status !== 'draft';
        reviewButton.disabled = job.status === 'approved' || job.status === 'published';
        jobForm.scrollIntoView({block:'start'});
      };
      actions.append(edit);
      if (role === 'admin' && job.status === 'review') {
        const approve = el('button','Approve for publication');
        approve.type = 'button';
        approve.className = 'button';
        approve.onclick = async () => {
          try {
            const changed = await rest<Job[]>('novel_translation_jobs','PATCH',
              'id=eq.'+encodeURIComponent(job.id)+'&status=eq.review&updated_at=eq.'+encodeURIComponent(job.updated_at),
              {status:'approved',qa_notes:note.value});
            if (!Array.isArray(changed) || changed.length !== 1) throw new BackendError('Chapter changed in another session. Refresh the queue.',409);
            await load();
            message.textContent = 'Chapter approved. A server job will publish it.';
          } catch(error) { notify(error); }
        };
        actions.append(approve);
      }
      if (role === 'admin' && job.status === 'approved') {
        const revoke = el('button', 'Return approval to review');
        revoke.type = 'button';
        revoke.className = 'button secondary';
        revoke.onclick = async () => {
          revoke.disabled = true;
          try {
            const changed = await rest<Job[]>('novel_translation_jobs', 'PATCH',
              'id=eq.' + encodeURIComponent(job.id) + '&status=eq.approved&updated_at=eq.' + encodeURIComponent(job.updated_at),
              { status: 'review' });
            if (!Array.isArray(changed) || changed.length !== 1)
              throw new BackendError('Chapter changed in another session. Refresh the queue.', 409);
            await load();
            message.textContent = 'Approval revoked. Chapter returned to review.';
          } catch (error) { notify(error); }
          finally { revoke.disabled = false; }
        };
        actions.append(revoke);
      }
      wrapper.append(actions); jobsDiv.append(wrapper);
    }
  }
  function onSubmit(form: HTMLFormElement, fn: (f: HTMLFormElement, submitter: HTMLElement | null) => Promise<void | string>) {
    let busy = false;
    form.addEventListener('submit', async (e) => {
      e.preventDefault();
      if (busy) return;
      busy = true;
      const buttons = Array.from(form.querySelectorAll<HTMLButtonElement>('button[type="submit"]'));
      const disabled = buttons.map(button => button.disabled);
      buttons.forEach(button => { button.disabled = true; });
      try {
        const result = await fn(form, e instanceof SubmitEvent ? e.submitter as HTMLElement | null : null);
        await load();
        message.textContent = result || 'Saved.';
        form.reset();
        if (form === jobForm) {
          delete form.dataset.editId;
          editingVersion = '';
          editingStatus = '';
        }
      } catch (error) { notify(error); }
      finally {
        busy = false;
        buttons.forEach((button,index) => {button.disabled = disabled[index];});
        if (form === jobForm && !form.dataset.editId) {
          draftButton.disabled = false;
          reviewButton.disabled = false;
        }
      }
    });
  }
  async function confirmedMutation(table: string, method: string, query: string, body?: ApiRecord) {
    const rows = await rest<ApiRecord[]>(table, method, query, body);
    if (!Array.isArray(rows) || rows.length !== 1) throw new BackendError('Server did not confirm the change. Refresh before retrying.', 409);
    return rows[0];
  }
  onSubmit(sourceForm, async f => {
    await confirmedMutation('novel_sources','POST','',{
      slug:value(f,'slug'),original_title:value(f,'original_title'),
      original_url:value(f,'original_url'),author_name:value(f,'author_name'),
      title_ru:value(f,'title_ru'),description_ru:value(f,'description_ru'),
      genres:value(f,'genres').split(',').map(s=>s.trim()).filter(Boolean),
      tags:value(f,'tags').split(',').map(s=>s.trim()).filter(Boolean),
      original_status:value(f,'original_status'),
      translation_status:value(f,'translation_status'),
    });
  });
  onSubmit(rightsForm, async f => {
    await confirmedMutation('novel_sources','PATCH','id=eq.'+encodeURIComponent(value(f,'source_id')),{
      rights_status:value(f,'rights_status'),
      rights_evidence:value(f,'rights_evidence') || null,
      rights_valid_until:value(f,'rights_valid_until') || null,
      permission_translate:new FormData(f).has('permission_translate'),
      permission_publish:new FormData(f).has('permission_publish'),
    });
  });
  onSubmit(termForm, async f => {
    await confirmedMutation('novel_terms','POST','',{
      source_id:value(f,'source_id'),original_term:value(f,'original_term'),
      translated_term:value(f,'translated_term'),term_type:value(f,'term_type'),note:value(f,'note'),
    });
  });
  onSubmit(jobForm, async (f, submitter) => {
    const requestedStatus = submitter?.dataset.jobStatus === 'review' ? 'review' : 'draft';
    if (f.dataset.editId && (editingStatus === 'approved' || editingStatus === 'published'))
      throw new BackendError('Approved or published chapters cannot be edited here. Request an administrator review.',409);
    if (f.dataset.editId && editingStatus === 'review' && requestedStatus === 'draft')
      throw new BackendError('This chapter is in review. Use Send for review to save it without downgrading.',409);
    if (requestedStatus === 'review' &&
        (value(f, 'original_text').length < 80 || value(f, 'translated_text').length < 80 ||
         value(f, 'chapter_description').length < 10)) {
      throw new BackendError('Complete the source, translation, and description before sending for review.',400);
    }
    const body: ApiRecord = {
      source_id:value(f,'source_id'),chapter_number:Number(value(f,'chapter_number')),
      chapter_slug:value(f,'chapter_slug'),chapter_title:value(f,'chapter_title'),
      chapter_description:value(f,'chapter_description'),original_text:value(f,'original_text'),
      translated_text:value(f,'translated_text'),status:requestedStatus,
    };
    if (f.dataset.editId) {
      if (!editingVersion || !['draft','review'].includes(editingStatus))
        throw new BackendError('The editor must reload the current chapter before saving.',409);
      const changed = await rest<Job[]>('novel_translation_jobs','PATCH',
        'id=eq.'+encodeURIComponent(f.dataset.editId)+'&status=eq.'+encodeURIComponent(editingStatus)+'&updated_at=eq.'+encodeURIComponent(editingVersion),body);
      if (!Array.isArray(changed) || changed.length !== 1) throw new BackendError('Chapter was changed in another session. Reload before saving.',409);
      delete f.dataset.editId;
      editingVersion = '';
      editingStatus = '';
    } else {
      const created = await rest<Job[]>('novel_translation_jobs','POST','',body);
      if (!Array.isArray(created) || created.length !== 1) throw new BackendError('Server did not confirm creation.',409);
    }
    return requestedStatus === 'review' ? 'Sent for editorial review.' : 'Draft saved privately.';
  });
  document.getElementById('admin-refresh')?.addEventListener('click',()=> {
    void load().catch(notify);
  });
  await load().catch(notify);
}
