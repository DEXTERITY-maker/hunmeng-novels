import { createClient } from 'npm:@supabase/supabase-js@2.118.0';
import { ImageResponse } from 'npm:@vercel/og@0.8.6';
import React from 'npm:react@19.3.1';
// Server-rendered PNGs are the only paid downloads; browser state cannot grant access.
const ORIGIN='https://anons-studio-preview.pages.dev';
const DBURL=Deno.env.get('SUPABASE_URL')||'https://kvgnjsntumofwqhywiea.supabase.co';
const HEADERS={'Access-Control-Allow-Origin':ORIGIN,'Access-Control-Allow-Methods':'POST,OPTIONS','Access-Control-Allow-Headers':'authorization,apikey,content-type','Cache-Control':'private, no-store','Vary':'Origin'};
const respond=(value:unknown,status=200)=>Response.json(value,{status,headers:HEADERS});
function getKey(named:string,legacy:string){
  try {const x=JSON.parse(Deno.env.get(named)||'null')?.default;if(typeof x==='string')return x;if(typeof x?.api_key==='string')return x.api_key;}catch{}
  return Deno.env.get(legacy)||'';
}
const anon=getKey('SUPABASE_PUBLISHABLE_KEYS','SUPABASE_ANON_KEY')||Deno.env.get('SUPABASE_PUBLISHABLE_KEY')||'';
const secret=getKey('SUPABASE_SECRET_KEYS','SUPABASE_SERVICE_ROLE_KEY')||Deno.env.get('SUPABASE_SECRET_KEY')||'';
const auth=anon?createClient(DBURL,anon,{auth:{persistSession:false}}):null;
const admin=secret?createClient(DBURL,secret,{auth:{persistSession:false}}):null;
const THEMES:Record<string,string[]>={ultraviolet:['#1a1636','#4a3486','#c2a1ff','#ffffff','#ded6ef'],
  emerald:['#102e2d','#145c56','#7ef0cb','#ffffff','#d6f4eb'],
  sunset:['#60274c','#aa4e66','#ffcc9a','#ffffff','#ffecdd'],
  ink:['#181c2a','#34405c','#b8c9ef','#ffffff','#e0e5ee'],
  paper:['#f9f0e1','#e9d5b5','#95592f','#302737','#5b5058']};
const SIZES:Record<string,[number,number]>={portrait:[1080,1350],square:[1080,1080],story:[1080,1920]};
const LABELS:Record<string,string>={update:'ОБНОВЛЕНИЕ',launch:'ЗАПУСК',event:'СОБЫТИЕ',notice:'ОБЪЯВЛЕНИЕ'};
const TEMPLATES=new Set(['aurora','editorial','spotlight','pulse','minimal','bulletin']);
function text(v:unknown,max:number,fallback=''){return typeof v==='string'?v.replace(/[\u0000-\u001f]/g,' ').slice(0,max):fallback;}
function validColor(v:unknown,fallback:string){return typeof v==='string'&&/^#[A-Fa-f0-9]{6}$/.test(v)?v:fallback;}
function el(tag:any,style:Record<string,unknown>,...children:any[]){return React.createElement(tag,{style},...children);}
let fontsPromise:Promise<any[]>|null=null;
function fonts(){
  if(!fontsPromise)fontsPromise=Promise.all(['cyrillic','latin'].map(async block=>{
    const u='https://cdn.jsdelivr.net/npm/@fontsource/manrope@5.2.8/files/manrope-'+block+'-700-normal.woff';
    const response=await fetch(u);
    if(!response.ok)throw Error('Font unavailable');
    const data=await response.arrayBuffer();
    if(data.byteLength<1000||data.byteLength>1500000)throw Error('Unexpected font size');
    return{name:'Manrope',data,weight:700,style:'normal'};
  })).catch(e=>{fontsPromise=null;throw e;});
  return fontsPromise;
}
function renderPoster(snapshot:any,card:any,width:number,height:number){
  const colors=THEMES[card.theme]||THEMES[snapshot.theme]||THEMES.ultraviolet;
  const template=TEMPLATES.has(card.template)?card.template:'aurora';
  const pale=template==='minimal'||template==='editorial';
  const primary=pale?'#f7efe2':colors[0],secondary=pale?'#e6d7c7':colors[1];
  const ink=pale?'#302737':colors[3],muted=pale?'#5b5058':colors[4];
  const accent=validColor(card.accentColor,colors[2]);
  const title=text(card.title,85,'Новая публикация')||'Новая публикация';
  const details=text(card.description,210,'');
  const points=(typeof card.points==='string'?card.points:'').split('\n').map((s:string)=>s.trim().slice(0,100)).filter(Boolean).slice(0,3);
  const scale=Math.max(80,Math.min(120,Number(card.headingScale)||100));
  const fontsize=Math.round((height>1500?102:height<1200?76:94)*scale/100);
  const align=card.alignment==='center'?'center':'left';
  const background='linear-gradient(145deg, '+primary+', '+secondary+')';
  const photograph=typeof snapshot.imageData==='string'&&snapshot.imageData.length<600000
      &&/^data:image\/(png|jpeg|webp);base64,[a-z0-9+/=]+$/i.test(snapshot.imageData)
    ? el('img',{position:'absolute',right:30,top:height*.18,width:width*.43,height:height*.31,
        borderRadius:32,objectFit:'cover',opacity:Math.max(.15,Math.min(.85,Number(card.photoOpacity||35)/100))})
    : null;
  // Using a real img React element to preserve user images in the premium render.
  if(photograph)photograph.props.src=snapshot.imageData;
  const decoration=card.decorations!==false&&template!=='minimal'
    ?el('div',{position:'absolute',width:470,height:470,border:'55px solid '+accent,borderRadius:300,
      right:-95,top:height*.16,opacity:.18,transform:'rotate(19deg)'})
    :null;
  const row=el('div',{display:'flex',width:'100%',justifyContent:'space-between',alignItems:'center'},
    el('div',{display:'flex',fontSize:24,fontWeight:700,color:ink,padding:'14px 22px',
      borderRadius:27,background:pale?'#ffffffaa':'#ffffff1e'},text(snapshot.project,45,'ANONS STUDIO')),
    el('div',{display:'flex',fontSize:19,fontWeight:700,color:muted,letterSpacing:2},'✦ ANONS STUDIO'));
  const titleBlock=el('div',{display:'flex',flexDirection:'column',alignItems:align==='center'?'center':'flex-start',
      width:'100%',marginTop:height>1700?300:height<1200?145:215,textAlign:align},
    el('div',{display:'flex',fontSize:24,fontWeight:700,color:accent,letterSpacing:4,marginBottom:21},
      LABELS[card.preset]||'АНОНС'),
    el('div',{display:'flex',fontSize:fontsize,fontWeight:700,lineHeight:1.12,
      color:ink,letterSpacing:-2,width:'100%',wordBreak:'break-word'},title),
    el('div',{display:'flex',fontSize:29,fontWeight:700,lineHeight:1.5,marginTop:24,
      maxWidth:850,color:muted,wordBreak:'break-word'},details));
  const cardPoints=points.length?points:['Новые возможности','Подробности внутри'];
  const lines=el('div',{display:'flex',flexDirection:'column',width:'100%',gap:14,padding:27,
      borderRadius:25,background:pale?'#ffffff66':'#ffffff13',border:'1px solid '+accent},
    ...cardPoints.map((p:string)=>el('div',{display:'flex',alignItems:'center',gap:18},
      el('div',{width:18,height:18,borderRadius:100,background:accent,flexShrink:0}),
      el('div',{display:'flex',fontSize:height<1200?25:29,lineHeight:1.4,color:ink,fontWeight:700,flex:1},p))));
  const foot=el('div',{display:'flex',justifyContent:'space-between',paddingTop:25,
      borderTop:'2px solid '+accent,color:muted,fontSize:19,letterSpacing:1},
    'СОЗДАНО ДЛЯ ВДОХНОВЕНИЯ','✦');
  return el('div',{display:'flex',flexDirection:'column',width:'100%',height:'100%',position:'relative',
      background,overflow:'hidden',padding:74,fontFamily:'Manrope'},decoration,photograph,
    el('div',{display:'flex',flexDirection:'column',position:'relative',width:'100%',height:'100%'},
      row,titleBlock,el('div',{display:'flex',flexDirection:'column',gap:36,marginTop:'auto'},lines,foot)));
}
Deno.serve(async(req:Request)=>{
  if(req.method==='OPTIONS')return new Response(null,{status:204,headers:HEADERS});
  if(req.headers.get('origin')&&req.headers.get('origin')!==ORIGIN)return respond({error:'ORIGIN_FORBIDDEN'},403);
  if(req.method!=='POST')return respond({error:'METHOD_NOT_ALLOWED'},405);
  const token=/^Bearer (.+)$/i.exec(req.headers.get('authorization')||'')?.[1];
  if(!token||!auth||!admin)return respond({error:'LOGIN_REQUIRED'},401);
  const {data,error}=await auth.auth.getUser(token);
  if(error||!data?.user?.email_confirmed_at)return respond({error:'LOGIN_REQUIRED'},401);
  const {data:member,error:readError}=await admin.from('anons_studio_memberships')
    .select('plan,status,current_period_end').eq('user_id',data.user.id).maybeSingle();
  if(readError)return respond({error:'CHECK_FAILED'},503);
  if(!member||!['basic','pro','studio'].includes(member.plan)
    ||!['active','trialing'].includes(member.status)||!member.current_period_end
    ||Date.parse(member.current_period_end)<=Date.now())return respond({error:'SUBSCRIPTION_REQUIRED'},403);
  if(Number(req.headers.get('content-length')||0)>900000)return respond({error:'TOO_LARGE'},413);
  let body:any;try{body=await req.json();}catch{return respond({error:'BAD_JSON'},400);}
  const snapshot=body?.snapshot,idx=body?.cardIndex;
  if(!snapshot||!SIZES[snapshot.ratio]||!Array.isArray(snapshot.cards)
    ||snapshot.cards.length<1||snapshot.cards.length>8||!Number.isInteger(idx)
    ||idx<0||idx>=snapshot.cards.length)return respond({error:'INVALID_POSTER'},400);
  if(JSON.stringify(snapshot).length>900000)return respond({error:'TOO_LARGE'},413);
  try{
    const [width,height]=SIZES[snapshot.ratio];
    const element=renderPoster(snapshot,snapshot.cards[idx],width,height);
    const image=new ImageResponse(element,{width,height,fonts:await fonts()});
    return new Response(image.body,{status:200,headers:{...HEADERS,'Content-Type':'image/png',
      'Content-Disposition':'attachment; filename="anons-premium.png"'}});
  }catch(e){console.error('premium render',String(e));return respond({error:'RENDER_UNAVAILABLE'},503);}
});