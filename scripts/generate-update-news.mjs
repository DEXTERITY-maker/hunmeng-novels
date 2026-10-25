#!/usr/bin/env node
import { execFileSync } from 'node:child_process';
import fs from 'node:fs/promises';
import path from 'node:path';

// Every item comes from a real Git commit; no claims about hosting deployments.
const folder = 'src/content/news';
const git = (...args) => execFileSync('git',args,{encoding:'utf8',maxBuffer:4194304}).trim();
export function affectedAreas(files) {
  const groups = [];
  const any = re => files.some(f => re.test(f));
  if(any(/^src\/pages\/account\.astro$|^src\/scripts\/account\.ts$|^src\/lib\/(backend|sync)\.ts$/)) groups.push('аккаунты и авторизация читателей');
  if(any(/^src\/pages\/admin\.astro$|^src\/scripts\/admin\.ts$|^backend\//)) groups.push('редакторская панель и переводы');
  if(any(/^src\/pages\/catalog|^src\/scripts\/catalog|^src\/components\/.*Novel/)) groups.push('каталог произведений');
  if(any(/^src\/pages\/novel|^src\/scripts\/reader|^src\/lib\/pagination/)) groups.push('читалка и оглавления');
  if(any(/^src\/content\/(novels|chapters|glossaries)\//)) groups.push('новые произведения и главы');
  if(any(/^src\/(pages\/news|scripts\/news|lib\/news|components\/NewsCard)/)) groups.push('раздел новостей');
  if(any(/^src\/pages\/index\.astro$|^src\/components\/ContinueReading/)) groups.push('главная страница');
  if(any(/^src\/styles\/|^public\/images\//)) groups.push('оформление и изображения');
  if(!groups.length && any(/^src\/|^public\/|^astro\.config\.mjs$|^package\.json$/)) groups.push('возможности и стабильность сайта');
  return groups;
}
export function makeNote({ sha, files, subject, timestamp }) {
  if (!/^[a-f0-9]{40}$/.test(sha)) throw new Error('Invalid SHA');
  const relevant = files.filter(p =>
    /^(src\/|public\/|backend\/)|^(astro\.config\.mjs|package\.json)$/.test(p) &&
    !p.startsWith('src/content/news/'));
  if(!relevant.length) return null;
  const groups = affectedAreas(relevant);
  if(!groups.length) return null;
  const when = new Date(timestamp);
  if(!Number.isFinite(when.getTime())) throw new Error('Invalid timestamp');
  const clean = String(subject ?? '').split(/\r?\n/)[0]
    .replace(/[\u0000-\u001f<>{}\[\]*#]/g,'')
    .replaceAll(String.fromCharCode(96),'')
    .replace(/\s+/g,' ').trim().slice(0,110);
  const title = 'Обновление сайта: ' + (clean || 'изменения проекта');
  const excerpt = ('Изменения в основной ветке Хунмэнг: ' +
    groups.slice(0,3).join(', ') + '. Подробности доступны в GitHub.').slice(0,225);
  const news = [
    '---',
    'title: ' + JSON.stringify(title),
    'excerpt: ' + JSON.stringify(excerpt),
    'category: changelog',
    'publishedAt: ' + JSON.stringify(when.toISOString().slice(0,10)),
    'order: ' + (10000 + when.getUTCHours()*100 + when.getUTCMinutes()),
    '---',
    '',
    'В основной ветке проекта **Хунмэнг** внесены изменения:',
    '',
    ...groups.map(g => '- ' + g[0].toUpperCase() + g.slice(1) + '.'),
    '',
    '[Посмотреть изменения в GitHub](https://github.com/DEXTERITY-maker/hunmeng-novels/commit/' + sha + ').',
    '',
    '> Запись подтверждает изменение кода в GitHub, а не завершение развёртывания на Timeweb.',
    '',
  ].join('\n');
  return {name:'update-'+sha.slice(0,12)+'.md',content:news};
}
async function main(){
  const sha=git('rev-parse','HEAD').toLowerCase();
  const event=process.env.GITHUB_EVENT_PATH
    ? JSON.parse(await fs.readFile(process.env.GITHUB_EVENT_PATH,'utf8')) : {};
  const before=event.before;
  let changes;
  if(typeof before==='string' && /^[a-f0-9]{40}$/i.test(before) && !/^0{40}$/.test(before)){
    try {changes=git('diff','--name-only',before,sha);} catch {changes=git('diff-tree','--no-commit-id','--name-only','-r',sha);}
  } else changes=git('diff-tree','--no-commit-id','--name-only','-r',sha);
  const note=makeNote({sha,files:changes.split('\n').filter(Boolean),
    subject:git('log','-1','--format=%s',sha),
    timestamp:git('log','-1','--format=%cI',sha)});
  if(!note){console.log('No reader-visible changes.');return;}
  const dest=path.join(folder,note.name);
  await fs.mkdir(folder,{recursive:true});
  try{
    await fs.writeFile(dest,note.content,{flag:'wx',encoding:'utf8'});
  }catch(error){
    if(error?.code==='EEXIST'){console.log('Already recorded.');return;}
    throw error;
  }
  console.log('News created:',dest);
}
if(process.argv[1] && import.meta.url === new URL('file://' + path.resolve(process.argv[1])).href)
  await main();
