import {loadCatalog, loadLatest, novelUrl, chapterUrl} from './catalog.mjs';
const SITE = 'https://hunmeng-novel.ru';
const HOME = {text:'🏠 Главное меню',callback_data:'home'};
const label = (s, max=45) => {const chars=Array.from(String(s).replace(/[\u0000-\u001f\u007f]/g,' ').replace(/\s+/g,' ').trim());return chars.length > max ? chars.slice(0,max-1).join('')+'…' : chars.join('');};
const keyboard = rows => ({inline_keyboard:rows});
const home = () => ({text:'📚 Добро пожаловать в Hunmeng Novels!\nЧитайте произведения, открывайте новые главы и находите интересные книги.',reply_markup:keyboard([
  [{text:'📚 Каталог',callback_data:'catalog:0'}, {text:'🆕 Новые главы',callback_data:'latest'}],
  [{text:'🔎 Поиск произведений',callback_data:'search'}],
  [{text:'🌐 Открыть сайт',url:SITE}, {text:'ℹ️ Помощь',callback_data:'help'}],
])});
const help = () => ({text:'ℹ️ Команды Hunmeng Novels\n\n/start — главное меню\n/catalog — каталог произведений\n/latest — новые опубликованные главы\n/search название — поиск по названию\n/help — помощь\n\nДля поиска также можно отправить название обычным сообщением.',reply_markup:keyboard([[HOME]])});
const searchPrompt = () => ({text:'🔎 Отправьте название произведения или его часть. Например: Dracula',reply_markup:keyboard([[HOME]])});
const listing = (novels, page) => {
  const size=6, max=Math.max(0,Math.ceil(novels.length/size)-1), p=Math.min(page,max);
  const rows=novels.slice(p*size,p*size+size).map(n=>[{text:'📖 '+label(n.title),callback_data:'book:'+n.index}]);
  const nav=[]; if(p>0) nav.push({text:'← Назад',callback_data:'catalog:'+(p-1)}); if(p<max) nav.push({text:'Вперёд →',callback_data:'catalog:'+(p+1)});
  if(nav.length)rows.push(nav); rows.push([HOME]);
  return {text:'📚 Каталог\nСтраница '+(p+1)+' из '+(max+1),reply_markup:keyboard(rows)};
};
export async function makeReply(action, env, fetcher=fetch) {
  if(action === 'home')return home();
  if(action === 'help')return help();
  if(action === 'search')return searchPrompt();
  const novels=(await loadCatalog(env)).map((n,index)=>({...n,index}));
  if(action === 'latest') {
    const latest=(await loadLatest(env,novels,fetcher)).slice(0,5);
    const rows=latest.map(c=>[{text:'📖 '+label(c.novelTitle,26)+' · '+c.number+': '+label(c.title,24),url:chapterUrl(c)}]);
    rows.push([HOME]);
    return {text:latest.length ? '🆕 Последние опубликованные главы\n\n'+latest.map(c=>`${label(c.novelTitle,65)} — Chapter ${c.number}: ${label(c.title,80)} (${c.publishedAt.slice(0,10)})`).join('\n') : 'Пока нет доступных глав.',reply_markup:keyboard(rows)};
  }
  if(action.startsWith('catalog:')) {
    const p=action.slice(8); if(!/^\d{1,5}$/.test(p))return home();
    return listing(novels,Number(p));
  }
  if(action.startsWith('book:')) {
    const i=action.slice(5); if(!/^\d{1,5}$/.test(i) || !novels[Number(i)])return home();
    const n=novels[Number(i)];return {text:'📖 '+label(n.title,180)+'\n\nОткройте страницу произведения на Hunmeng Novels.',reply_markup:keyboard([[{text:'🌐 Читать на сайте',url:novelUrl(n.slug)}],[{text:'← К каталогу',callback_data:'catalog:'+Math.floor(Number(i)/6)},HOME]])};
  }
  if(action.startsWith('query:')) {
    const query=action.slice(6).trim();
    if(!query)return searchPrompt();
    if(Array.from(query).length>100 || /[\u0000-\u001f\u007f]/.test(query))return {text:'Запрос должен содержать не более 100 символов без управляющих знаков.',reply_markup:keyboard([[HOME]])};
    const matches=novels.filter(n=>n.title.toLocaleLowerCase('und').includes(query.toLocaleLowerCase('und'))).slice(0,10);
    const rows=matches.map(n=>[{text:'📖 '+label(n.title),callback_data:'book:'+n.index}]); rows.push([{text:'🔎 Новый поиск',callback_data:'search'},HOME]);
    return {text:matches.length ? '🔎 Результаты поиска: '+label(query,100) : 'По запросу «'+label(query,100)+'» ничего не найдено.',reply_markup:keyboard(rows)};
  }
  return home();
}
export function commandAction(text) {
  const clean = typeof text === 'string' ? text.trim() : '';
  if(!clean)return 'search';
  if(!clean.startsWith('/'))return 'query:'+clean;
  const match=/^\/([a-z]+)(?:@[a-z0-9_]+)?(?:\s+([\s\S]*))?$/i.exec(clean);
  if(!match)return 'unknown';
  switch(match[1].toLowerCase()) {
    case 'start':return 'home'; case 'help':return 'help'; case 'latest':return 'latest'; case 'catalog':return 'catalog:0'; case 'search':return match[2]?.trim() ? 'query:'+match[2].trim() : 'search'; default:return 'unknown';
  }
}
export const unknownReply = () => ({text:'Неизвестная команда. Используйте /help, чтобы посмотреть доступные команды.',reply_markup:keyboard([[HOME]])});
