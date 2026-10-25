import { backendConfigured, getStaffRole, rest, type ApiRecord } from '../lib/backend';

type Source = {
  id: string; slug: string; original_title: string; rights_status: string;
  permission_publish: boolean; permission_translate: boolean; rights_evidence?: string;
};
type Term = { id: string; source_id: string; original_term: string; translated_term: string };
type Job = {
  id: string; source_id: string; chapter_number: number; chapter_title: string;
  chapter_slug: string; status: string; qa_notes: string; original_text: string;
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
  if (!backendConfigured) {
    message.textContent = 'Backend ещё не подключён. Панель доступна после настройки Supabase.';
    return;
  }
  const role = await getStaffRole().catch(() => null);
  if (!role) {
    message.textContent = 'Доступ запрещён. Войдите в аккаунт редактора или администратора.';
    return;
  }
  workspace.hidden = false;
  message.textContent = role === 'admin' ? 'Администратор: полный редакторский доступ.' :
    'Редактор: доступны черновики и словарь, права и утверждение публикаций — только админу.';
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

  const notify = (error: unknown) =>
    message.textContent = error instanceof Error ? error.message : 'Сервер отклонил запрос';
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
      'select=id,source_id,chapter_number,chapter_title,chapter_slug,status,qa_notes,original_text,translated_text,chapter_description&order=updated_at.desc&limit=100');
    sourceOptions();
    sourcesDiv.replaceChildren();
    const ul = el('ul');
    for (const source of sources) ul.append(el('li', source.slug + ' · ' + source.rights_status));
    sourcesDiv.append(ul);
    termsDiv.replaceChildren();
    const termsList = el('ul');
    for (const term of terms) {
      const row = el('li', term.original_term + ' → ' + term.translated_term + ' ');
      const remove = el('button', 'Удалить');
      remove.type = 'button';
      remove.className = 'text-button';
      remove.onclick = async () => {
        try {
          await rest('novel_terms','DELETE','id=eq.' + term.id);
          await load();
        } catch (error) { notify(error); }
      };
      row.append(remove); termsList.append(row);
    }
    termsDiv.append(termsList);
    jobsDiv.replaceChildren();
    if (!jobs.length) jobsDiv.append(el('p', 'Очередь пока пуста.'));
    for (const job of jobs) {
      const wrapper = el('div');
      wrapper.className = 'admin-job-row';
      wrapper.append(el('strong',
        (sources.find(s => s.id === job.source_id)?.slug ?? 'Источник') +
        ' / ' + job.chapter_number + '. ' + job.chapter_title + ' · ' + job.status));
      const note = el('textarea') as HTMLTextAreaElement;
      note.value = job.qa_notes ?? '';
      note.placeholder = 'Комментарий о проверке, минимум 20 символов для одобрения';
      note.rows = 2;
      note.setAttribute('aria-label','Заметки проверки: '+job.chapter_title);
      wrapper.append(note);
      const actions = el('div');
      actions.className = 'admin-actions';
      const edit = el('button','Открыть в редакторе');
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
        jobForm.scrollIntoView({block:'start'});
      };
      actions.append(edit);
      if (role === 'admin' && job.status !== 'published') {
        const approve = el('button','Одобрить для публикации');
        approve.type = 'button';
        approve.className = 'button';
        approve.onclick = async () => {
          try {
            await rest('novel_translation_jobs','PATCH','id=eq.'+job.id,
              {status:'approved',qa_notes:note.value});
            message.textContent = 'Глава одобрена. Публикация выполняется серверным заданием.';
            await load();
          } catch(error) { notify(error); }
        };
        actions.append(approve);
      }
      wrapper.append(actions); jobsDiv.append(wrapper);
    }
  }
  function onSubmit(form: HTMLFormElement, fn: (f: HTMLFormElement) => Promise<void>) {
    form.addEventListener('submit', async (e) => {
      e.preventDefault();
      try {
        await fn(form);
        message.textContent = 'Сохранено.';
        form.reset();
        await load();
      } catch (error) { notify(error); }
    });
  }
  onSubmit(sourceForm, async f => {
    await rest('novel_sources','POST','',{
      slug:value(f,'slug'),original_title:value(f,'original_title'),
      original_url:value(f,'original_url'),author_name:value(f,'author_name'),
    });
  });
  onSubmit(rightsForm, async f => {
    await rest('novel_sources','PATCH','id=eq.'+encodeURIComponent(value(f,'source_id')),{
      rights_status:value(f,'rights_status'),
      rights_evidence:value(f,'rights_evidence') || null,
      rights_valid_until:value(f,'rights_valid_until') || null,
      permission_translate:new FormData(f).has('permission_translate'),
      permission_publish:new FormData(f).has('permission_publish'),
    });
  });
  onSubmit(termForm, async f => {
    await rest('novel_terms','POST','',{
      source_id:value(f,'source_id'),original_term:value(f,'original_term'),
      translated_term:value(f,'translated_term'),note:value(f,'note'),
    });
  });
  onSubmit(jobForm, async f => {
    const body: ApiRecord = {
      source_id:value(f,'source_id'),chapter_number:Number(value(f,'chapter_number')),
      chapter_slug:value(f,'chapter_slug'),chapter_title:value(f,'chapter_title'),
      chapter_description:value(f,'chapter_description'),original_text:value(f,'original_text'),
      translated_text:value(f,'translated_text'),status:'review',
    };
    if (f.dataset.editId) {
      await rest('novel_translation_jobs','PATCH','id=eq.'+encodeURIComponent(f.dataset.editId),body);
      delete f.dataset.editId;
    } else await rest('novel_translation_jobs','POST','',body);
  });
  document.getElementById('admin-refresh')?.addEventListener('click',()=> {
    void load().catch(notify);
  });
  await load().catch(notify);
}
