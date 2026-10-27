import { makePublicationNews } from './publication-news.mjs';
import fs from 'node:fs/promises';
import path from 'node:path';
const endpoint=(process.env.SUPABASE_URL||'').replace(/\/+$/,'');
const secret=process.env.SUPABASE_SERVICE_ROLE_KEY;
const manifest=path.join(process.env.RUNNER_TEMP||'/tmp','hunmeng-publish.json');
if(!/^https:\/\/[a-z0-9.-]+\.supabase\.co$/.test(endpoint)||!secret)
  throw new Error('Configure SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY in Actions Secrets');
const slug=s=>typeof s==='string'&&/^[a-z0-9]+(-[a-z0-9]+)*$/.test(s);
const today=()=>new Date().toISOString().slice(0,10);
async function api(table,query='',method='GET',body){
  const r=await fetch(endpoint+'/rest/v1/'+table+query,{
    method,headers:{apikey:secret,Authorization:'Bearer '+secret,
      'Content-Type':'application/json',Prefer:'return=representation'},
    ...(body===undefined?{}:{body:JSON.stringify(body)})});
  const text=await r.text();
  if(!r.ok)throw new Error(table+' HTTP '+r.status+': '+text.slice(0,300));
  return text?JSON.parse(text):[];
}
async function exists(file){try{await fs.access(file);return true}catch{return false}}
function rightsOK(s){return s&&s.rights_status==='verified'&&s.permission_translate&&s.permission_publish&&
  s.verified_at&&String(s.rights_evidence||'').trim().length>=20&&
  (!s.rights_valid_until||s.rights_valid_until>=today())}
const safeText=s=>!/<\/?[a-z][^>]*>/i.test(s)&&!/\]\(\s*(javascript|data):/i.test(s);
async function stage(){
  const jobs=await api('novel_translation_jobs','?status=eq.approved&order=approved_at.asc&limit=40&select=*');
  const queued=[];
  await fs.mkdir('src/content/news',{recursive:true});
  for(const j of jobs){
    const source=(await api('novel_sources','?id=eq.'+encodeURIComponent(j.source_id)))[0];
    if(!rightsOK(source)||!slug(source.slug)||!slug(j.chapter_slug)||
      !Number.isInteger(j.chapter_number)||j.chapter_number<1||
      !j.reviewed_by||!j.approved_at||String(j.qa_notes||'').trim().length<20||
      String(j.original_text||'').trim().length<80||
      String(j.translated_text||'').trim().length<80||
      String(j.chapter_description||'').trim().length<10||!safeText(j.translated_text)){
      console.log('SKIP missing rights/review/QA: '+j.id);continue;
    }
    const terms=await api('novel_terms','?source_id=eq.'+source.id+'&select=*');
    if(terms.some(t=>j.original_text.toLowerCase().includes(t.original_term.toLowerCase())&&
      !j.translated_text.toLowerCase().includes(t.translated_term.toLowerCase()))){
      console.log('SKIP glossary mismatch: '+j.id);continue;
    }
    const novelFile='src/content/novels/'+source.slug+'.json';
    const isNewNovel = !(await exists(novelFile));
    if(isNewNovel){
      if(String(source.title_ru||'').trim().length<2||String(source.description_ru||'').trim().length<20)
        {console.log('SKIP missing novel metadata: '+j.id);continue;}
      const cover=source.cover_path||'/images/novel-placeholder.svg';
      if(!(await exists('public'+cover))){console.log('SKIP missing cover: '+j.id);continue;}
      const novel={slug:source.slug,title:source.title_ru,originalTitle:source.original_title,
        author:source.author_name||'Not specified',originalUrl:source.original_url,cover,
        description:source.description_ru,genres:source.genres?.length?source.genres:['Fantasy'],
        tags:source.tags||[],categories:[],originalStatus:source.original_status||'Продолжается',
        translationStatus:source.translation_status||'Переводится',
        updatedAt:today(),addedAt:today(),demo:false};
      await fs.writeFile(novelFile,JSON.stringify(novel,null,2)+'\n');
    }
    const glossFile='src/content/glossaries/'+source.slug+'.json';
    if(!(await exists(glossFile)))await fs.writeFile(glossFile,JSON.stringify({
      novelSlug:source.slug,terms:terms.map(t=>({original:t.original_term,
        translation:t.translated_term,type:t.term_type||'предмет'}))},null,2)+'\n');
    const folder='src/content/chapters/'+source.slug;
    await fs.mkdir(folder,{recursive:true});
    const file=folder+'/'+j.chapter_slug+'.md';
    if(await exists(file)){console.log('SKIP existing chapter: '+file);continue;}
    const lines=['---','novelSlug: '+JSON.stringify(source.slug),
      'slug: '+JSON.stringify(j.chapter_slug),'number: '+j.chapter_number,
      'title: '+JSON.stringify(j.chapter_title),'publishedAt: '+JSON.stringify(today()),
      'description: '+JSON.stringify(j.chapter_description),'---','',j.translated_text.trim(),''];
    await fs.writeFile(file,lines.join('\n'));
    const novelMetadata = JSON.parse(await fs.readFile(novelFile, 'utf8'));
    const publicationDate = today();
    const notes = [
      ...(isNewNovel ? [makePublicationNews({
        kind: 'novel', novelSlug: source.slug, novelTitle: novelMetadata.title, date: publicationDate,
      })] : []),
      makePublicationNews({
        kind: 'chapter', novelSlug: source.slug, novelTitle: novelMetadata.title,
        chapterSlug: j.chapter_slug, chapterNumber: j.chapter_number,
        chapterTitle: j.chapter_title, date: publicationDate,
      }),
    ];
    for (const note of notes) {
      const newsPath = path.join('src/content/news', note.name);
      if (!(await exists(newsPath))) await fs.writeFile(newsPath, note.content, 'utf8');
    }
    queued.push(j.id);
  }
  await fs.writeFile(manifest,JSON.stringify(queued));
  console.log('Staged chapters: '+queued.length);
}
async function finalize(){
  const batch=JSON.parse(await fs.readFile(manifest,'utf8'));
  const sha=process.env.GITHUB_SHA_PUBLISHED;
  if(batch.length&&!/^[0-9a-f]{40}$/.test(sha||''))throw new Error('Invalid commit SHA');
  for(const id of batch){
    const rows=await api('novel_translation_jobs','?id=eq.'+id+'&status=eq.approved','PATCH',
      {status:'published',published_at:new Date().toISOString(),publish_commit:sha});
    if(rows.length!==1)throw new Error('Failed to confirm '+id);
    await api('novel_publication_events','','POST',{job_id:id,commit_sha:sha});
  }
}
if(process.argv[2]==='stage')await stage();
else if(process.argv[2]==='finalize')await finalize();
else throw new Error('Expected stage or finalize');
