import { createClient } from 'npm:@supabase/supabase-js@2.118.0';
import { ImageResponse } from 'npm:@vercel/og@0.8.6';
import React from 'npm:react@19.3.1';
import './graphic-elements.js';
import './scene-layout.js';
const Graphics=(globalThis as any).AnonsGraphics;
const Scene=(globalThis as any).AnonsScene;
// Server-rendered PNGs are the only paid downloads; browser state cannot grant access.
const ORIGIN='https://anons-studio-preview.pages.dev';
const DBURL=Deno.env.get('SUPABASE_URL')||'https://kvgnjsntumofwqhywiea.supabase.co';
const HEADERS={'Access-Control-Allow-Origin':ORIGIN,'Access-Control-Allow-Methods':'POST,OPTIONS','Access-Control-Allow-Headers':'authorization,apikey,content-type','Cache-Control':'private, no-store','Vary':'Origin'};
const respond=(value:unknown,status=200)=>Response.json(value,{status,headers:HEADERS});
async function boundedJson(req:Request,limit:number){
  if(Number(req.headers.get('content-length')||0)>limit)throw Error('TOO_LARGE');
  if(!req.body)throw Error('BAD_JSON');
  const reader=req.body.getReader(),chunks:Uint8Array[]=[];
  let total=0;
  try{
    for(;;){
      const {done,value}=await reader.read();
      if(done)break;
      total+=value.byteLength;
      if(total>limit){await reader.cancel();throw Error('TOO_LARGE');}
      chunks.push(value);
    }
  }finally{reader.releaseLock();}
  const bytes=new Uint8Array(total);let offset=0;
  for(const chunk of chunks){bytes.set(chunk,offset);offset+=chunk.byteLength;}
  try{return JSON.parse(new TextDecoder('utf-8',{fatal:true}).decode(bytes));}
  catch{throw Error('BAD_JSON');}
}
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
const PRO_TEMPLATES=new Set(['pro-campaign','pro-magazine','pro-impact']);
const STUDIO_TEMPLATES=new Set(['studio-identity','studio-launch','studio-portfolio']);
const AGENCY_TEMPLATES=new Set(['agency-brand','agency-social','agency-showcase']);
const ULTIMATE_TEMPLATES=new Set(['ultimate-signature','ultimate-cinema','ultimate-vision']);
const TEMPLATES=new Set(['aurora','editorial','spotlight','pulse','minimal','bulletin',
  'business-brief','business-pitch','business-report',...PRO_TEMPLATES,...STUDIO_TEMPLATES,...AGENCY_TEMPLATES,...ULTIMATE_TEMPLATES]);
function text(v:unknown,max:number,fallback=''){return typeof v==='string'?v.replace(/[\u0000-\u001f]/g,' ').slice(0,max):fallback;}
function validColor(v:unknown,fallback:string){return typeof v==='string'&&/^#[A-Fa-f0-9]{6}$/.test(v)?v:fallback;}
function el(tag:any,style:Record<string,unknown>,...children:any[]){return React.createElement(tag,{style},...children);}
let fontsPromise:Promise<any[]>|null=null;
const extras=new Map<string,Promise<any[]>>();
async function loadFont(name:string,pkg:string){
  const requests=['cyrillic','latin'].map(async block=>{
    const path='https://cdn.jsdelivr.net/npm/@fontsource/'+pkg+'@5.3.0/files/'+pkg+'-'+block+'-700-normal.woff';
    const response=await fetch(path);
    if(!response.ok)throw Error('Optional font unavailable');
    const data=await response.arrayBuffer();
    if(data.byteLength<1000||data.byteLength>1500000)throw Error('Unexpected font size');
    return {name,data,weight:700,style:'normal'};
  });
  return await Promise.all(requests);
}
async function fonts(requested='auto'){
  if(!fontsPromise)fontsPromise=Promise.all(['cyrillic','latin'].map(async block=>{
    const u='https://cdn.jsdelivr.net/npm/@fontsource/manrope@5.2.8/files/manrope-'+block+'-700-normal.woff';
    const response=await fetch(u);
    if(!response.ok)throw Error('Font unavailable');
    const data=await response.arrayBuffer();
    if(data.byteLength<1000||data.byteLength>1500000)throw Error('Unexpected font size');
    return{name:'Manrope',data,weight:700,style:'normal'};
  })).catch(e=>{fontsPromise=null;throw e;});
  const base=await fontsPromise;
  const optional:Record<string,[string,string]>={georgia:['Noto Serif','noto-serif'],arial:['Arimo','arimo']};
  const option=optional[requested];
  if(!option)return base;
  if(!extras.has(requested))extras.set(requested,loadFont(option[0],option[1]).catch(()=>{
    extras.delete(requested);return [];
  }));
  return [...base,...(await extras.get(requested)!)];
}
function renderPoster(snapshot:any,card:any,width:number,height:number,availableFonts:string[]){
  const plan=Scene.layout(snapshot,card);
  if(plan.width!==width||plan.height!==height)throw Error('INVALID_SCENE');
  const p=plan.palette,margin=plan.margin,order=plan.order;
  const offset=(name:string)=>({
    x:plan.offsets[name].x*width/100,
    y:plan.offsets[name].y*height/100
  });
  const z=(name:string)=>order.indexOf(name)+1;
  const box=(style:any,...children:any[])=>el('div',{position:'absolute',display:'flex',...style},...children);
  const title=text(card.title,85,'Заголовок публикации')||'Заголовок публикации';
  const description=text(card.description,210,'Расскажите коротко, что произошло и почему это важно.');
  const titleSpec=Scene.titleLines(title,plan);
  const descriptionTop=Scene.descriptionTop(plan,titleSpec);
  const descLines=Scene.breakLines(description,plan.contentWidth-(height<=1100?10:80),plan.descriptionSize,3);
  const list=(typeof card.points==='string'?card.points:'').split(/\r?\n/).map((s:string)=>s.trim().slice(0,120)).filter(Boolean).slice(0,3);
  if(!list.length)list.push('Важная информация','Следите за новостями');
  const align=plan.center?'center':'left';
  const fontMap:Record<string,string>={manrope:'Manrope',georgia:'Noto Serif',arial:'Arimo'};
  const desiredFont=fontMap[plan.titleFamily]||'Manrope';
  const titleFamily=availableFonts.includes(desiredFont)?desiredFont:'Manrope';
  const fontTitleSize=titleSpec.size;
  const layerShift=(name:string,baseX:number,baseY:number)=>({
    left:baseX+offset(name).x,top:baseY+offset(name).y,zIndex:z(name)
  });
  const blocks:any[]=[];
  // Match the Canvas background exactly: diagonal linear gradient, radial glow
  // (inner radius 20 px), and diagonal 73 px-spaced hairlines.
  const bgLines=[];
  const aurora=plan.template==='aurora',d=plan.decorationTuning;
  if(!aurora||plan.decorations){
    for(let i=-height;i<width+height;i+=73){
      bgLines.push(React.createElement('line',{key:'line-'+i,x1:i,y1:0,
        x2:i+height,y2:height,stroke:Scene.rgb(p.text,aurora?d.grid:.055),strokeWidth:1.5}));
    }
  }
  const svgStyle={position:'absolute',left:0,top:0,width,height,zIndex:0};
  const linear=React.createElement('linearGradient',{
    id:'anons-gradient',x1:0,y1:0,x2:width,y2:height,gradientUnits:'userSpaceOnUse'
  },React.createElement('stop',{offset:'0%',stopColor:p.bg1}),
    React.createElement('stop',{offset:'100%',stopColor:p.bg2}));
  const inner=20/(width*.85);
  const radial=React.createElement('radialGradient',{
    id:'anons-glow',cx:width*.87,cy:height*.16,r:width*.85,gradientUnits:'userSpaceOnUse'
  },React.createElement('stop',{offset:'0%',stopColor:p.glow,stopOpacity:aurora?d.glow:.34}),
    React.createElement('stop',{offset:inner,stopColor:p.glow,stopOpacity:aurora?d.glow:.34}),
    React.createElement('stop',{offset:'100%',stopColor:p.glow,stopOpacity:0}));
  blocks.push(React.createElement('svg',{key:'background',width,height,
    viewBox:'0 0 '+width+' '+height,style:svgStyle},
    React.createElement('defs',null,linear,radial),
    React.createElement('rect',{x:0,y:0,width,height,fill:'url(#anons-gradient)'}),
    React.createElement('rect',{x:0,y:0,width,height,fill:'url(#anons-glow)'}),
    ...bgLines));
  if(plan.enabled.decoration && plan.decorations){
    const pos=offset('decoration');
    const deco:any[]=[];
    if(plan.template==='editorial'){
      deco.push(React.createElement('rect',{key:'border',x:38,y:38,
        width:width-76,height:height-76,fill:'none',
        stroke:Scene.rgb(p.text,.3),strokeWidth:3}));
      deco.push(React.createElement('rect',{key:'accent',x:width-170,y:95,
        width:76,height:76,fill:Scene.rgb(p.accent,.28)}));
    }else if(plan.template==='spotlight'){
      for(const r of [270,185])deco.push(React.createElement('circle',{
        key:'c'+r,cx:width*.84,cy:height*.24,r,fill:Scene.rgb(p.accent,.22)
      }));
    }else if(plan.template==='pulse'){
      deco.push(React.createElement('g',{key:'slants',
        transform:'translate('+width*.77+' '+height*.15+') rotate('+(-.36*180/Math.PI)+')'},
        React.createElement('rect',{x:0,y:-190,width:118,height:height*.72,fill:Scene.rgb(p.accent,.48)}),
        React.createElement('rect',{x:137,y:-190,width:38,height:height*.72,fill:Scene.rgb(p.text,.16)})));
    }else if(plan.template==='bulletin'){
      deco.push(React.createElement('rect',{key:'top',x:0,y:0,width,height:20,fill:p.accent}));
      deco.push(React.createElement('rect',{key:'rule',x:0,y:136,width,height:8,fill:Scene.rgb(p.text,.12)}));
      for(let x=75;x<width-75;x+=80)deco.push(React.createElement('rect',{
        key:'dash-'+x,x,y:height*.19,width:48,height:8,fill:Scene.rgb(p.accent,.3)
      }));
    }else{
      const cx=width*.84,cy=height*d.centerY;
      for(let i=0;i<3;i++)deco.push(React.createElement('ellipse',{
        key:'ellipse-'+i,cx,cy,rx:d.ringRadius+i*d.ringStep,
        ry:d.ringRadius*.88+i*d.ringStep,
        fill:'none',stroke:Scene.rgb(p.accent,d.rings),strokeWidth:2.5,
        transform:'rotate('+(-.35*180/Math.PI)+' '+cx+' '+cy+')'
      }));
      deco.push(React.createElement('circle',{key:'center',cx,cy,r:d.discRadius,
        fill:Scene.rgb(p.accent,d.disc)}));
      deco.push(React.createElement('path',{key:'spark',
        d:'M0 -43 Q12 -12 43 0 Q12 12 0 43 Q-12 12 -43 0 Q-12 -12 0 -43 Z',
        fill:Scene.rgb(p.accent,d.spark),
        transform:'translate('+cx+' '+cy+') rotate(45)'}));
    }
    blocks.push(React.createElement('svg',{key:'decorations',width,height,
      viewBox:'0 0 '+width+' '+height,style:{
        position:'absolute',left:pos.x,top:pos.y,width,height,zIndex:z('decoration')
      }},...deco));
  }
  // The same bounded decorative frames as the editor Canvas preview.
  // An SVG accent is image-only and cannot change membership/export rights.
  if(plan.enabled.decoration && plan.frameStyle!=='none'){
    const frame=Scene.frameGeometry(plan);
    const graphics:any[]=[];
    if(frame.style==='hairline'){
      graphics.push(React.createElement('rect',{key:'hairline',x:frame.x,y:frame.y,
        width:frame.width,height:frame.height,fill:'none',
        stroke:Scene.rgb(p.accent,frame.alpha),strokeWidth:frame.lineWidth}));
    }else{
      for(const [i,segment] of frame.segments.entries()){
        graphics.push(React.createElement('line',{key:'corner-'+i,
          x1:segment[0],y1:segment[1],x2:segment[2],y2:segment[3],
          stroke:Scene.rgb(p.accent,frame.alpha),strokeWidth:frame.lineWidth,
          strokeLinecap:'round'}));
      }
    }
    blocks.push(React.createElement('svg',{key:'decorative-frame',width,height,
      viewBox:'0 0 '+width+' '+height,
      style:{position:'absolute',left:0,top:0,width,height,zIndex:z('decoration')}},...graphics));
  }
  if(plan.enabled.photo && typeof snapshot.imageData==='string' && snapshot.imageData.length<600000
    && /^data:image\/(png|jpeg|webp);base64,[a-z0-9+/=]+$/i.test(snapshot.imageData)){
    const r=plan.photo,off=offset('photo');
    const layerX=r.x+off.x*width/100, layerY=r.y+off.y*height/100;
    const zoomWidth=r.width*r.zoom,zoomHeight=r.height*r.zoom;
    const filter='brightness('+r.brightness+'%) contrast('+r.contrast+
      '%) saturate('+r.saturation+'%)';
    const image=React.createElement('img',{key:'photo-bitmap',src:snapshot.imageData,style:{
      position:'absolute',left:(r.width-zoomWidth)*r.focusX,
      top:(r.height-zoomHeight)*r.focusY,width:zoomWidth,height:zoomHeight,
      objectFit:'cover',objectPosition:(r.focusX*100)+'% '+(r.focusY*100)+'%',filter
    }});
    const layers=[image];
    if(r.overlay.alpha){
      layers.push(React.createElement('div',{key:'photo-tint',style:{
        position:'absolute',left:0,top:0,width:r.width,height:r.height,
        background:Scene.rgb(r.overlay.color,r.overlay.alpha)
      }}));
    }
    blocks.push(React.createElement('div',{key:'photo',style:{
      display:'flex',position:'absolute',left:layerX,top:layerY,
      width:r.width,height:r.height,borderRadius:r.radius,
      overflow:'hidden',opacity:plan.imageOpacity,zIndex:z('photo')
    }},...layers));
  }
  if(plan.enabled.brand){
    const p0=layerShift('brand',margin,72);
    blocks.push(box({...p0,padding:'13px 24px',borderRadius:28,
      background:Scene.rgb(p.text,.10),color:p.text,fontSize:27,fontWeight:700,
      fontFamily:'Manrope',maxWidth:width*.52+48},text(snapshot.project,45,'МОЙ ПРОЕКТ')));
    blocks.push(box({right:margin-offset('brand').x,top:82+offset('brand').y,
      color:Scene.rgb(p.text,.75),fontSize:24,fontWeight:700,zIndex:z('brand')},'✳ ANONS / STUDIO'));
  }
  if(plan.enabled.title){
    const x=margin+offset('title').x,y=plan.titleY+offset('title').y;
    blocks.push(box({left:x,top:y-76,width:plan.contentWidth,
      fontSize:24,fontWeight:700,color:p.accent,zIndex:z('title')},plan.label+'  /  2026'));
    blocks.push(box({left:plan.center?margin+offset('title').x:x,top:y,width:plan.contentWidth,
      height:Math.max(145,fontTitleSize*titleSpec.lines.length*1.2),color:p.text,
      fontFamily:titleFamily,fontSize:fontTitleSize,fontWeight:plan.titleWeight,
      letterSpacing:plan.titleTracking,zIndex:z('title'),
      flexDirection:'column',alignItems:plan.center?'center':'flex-start',overflow:'hidden'},
      ...titleSpec.lines.map((line:string,i:number)=>el('div',{
        display:'flex',width:'100%',height:Math.round(fontTitleSize*1.14),
        whiteSpace:'pre',alignItems:'flex-start',justifyContent:plan.center?'center':'flex-start'
      },line))));
  }
  if(plan.enabled.description){
    const x=margin+offset('description').x,y=descriptionTop+offset('description').y;
    blocks.push(box({left:x,top:y,width:plan.contentWidth,height:plan.descriptionSize*1.5*3,
      flexDirection:'column',alignItems:plan.center?'center':'flex-start',zIndex:z('description'),
      color:p.sub,fontFamily:'Manrope',fontSize:plan.descriptionSize,fontWeight:700},
      ...descLines.map((line:string,i:number)=>el('div',{
        display:'flex',width:'100%',height:Math.round(plan.descriptionSize*1.5),
        whiteSpace:'pre',justifyContent:plan.center?'center':'flex-start'
      },line))));
  }
  if(plan.enabled.highlights){
    const x=margin+offset('highlights').x,y=plan.detailsY+offset('highlights').y;
    const h=Scene.highlightGeometry(plan,list.length);
    const top=h.top+offset('highlights').y;
    if(h.style!=='separated'){
      const outlined=h.style==='outline'||plan.template==='minimal'||plan.template==='editorial';
      blocks.push(box({left:x,top,width:h.width,height:h.height,borderRadius:23,
        background:outlined?'transparent':Scene.rgb(p.text,.085),
        border:outlined?'2px solid '+Scene.rgb(p.text,.36):'none',
        zIndex:z('highlights')}));
    }
    list.forEach((line:string,i:number)=>{
      const cy=y+i*h.rowHeight+16;
      if(h.featured===i)blocks.push(box({
        left:x+13,top:top+12+i*h.rowHeight,width:h.width-26,height:h.rowHeight-3,
        borderRadius:12,background:Scene.rgb(p.accent,.16),zIndex:z('highlights')
      }));
      if(h.style==='separated'&&i>0)blocks.push(box({
        left:x+12,top:top+12+i*h.rowHeight,width:h.width-24,height:2,
        background:Scene.rgb(p.text,.22),zIndex:z('highlights')
      }));
      const icon=h.icons[i];
      if(icon==='dot'){
        blocks.push(box({left:x+20,top:cy-1,width:22,height:22,borderRadius:999,
          background:p.accent,zIndex:z('highlights')}));
      }else{
        blocks.push(React.createElement('svg',{
          key:'highlight-icon-'+i,viewBox:'0 0 100 100',width:24,height:24,
          style:{position:'absolute',left:x+19,top:cy-3,width:24,height:24,
            zIndex:z('highlights')}
        },React.createElement('path',{d:Graphics.paths[icon],fill:p.accent})));
      }
      let short=line;
      while(Scene.textWidth(short,height<=1100?27:30,0)>h.width-112 && short.length>1)
        short=short.slice(0,-1);
      if(short!==line)short=short.slice(0,-1)+'…';
      blocks.push(box({left:x+63,top:cy-10,width:h.width-94,
        fontSize:height<=1100?27:30,fontWeight:700,fontFamily:'Manrope',
        color:p.text,zIndex:z('highlights')},short));
    });
  }
  // Same immutable SVG paths and pixel frames as browser Canvas.
  for(const [i,item] of Graphics.normalizeElements(card.graphicElements).entries()){
    if(item.hidden)continue;
    const fr=Graphics.frame(item,width,height);
    blocks.push(React.createElement('svg',{
      key:item.id,viewBox:'0 0 100 100',width:fr.size,height:fr.size,
      style:{position:'absolute',left:fr.x-fr.size/2,top:fr.y-fr.size/2,width:fr.size,
        height:fr.size,transform:'rotate('+fr.rotation+'deg)',
        transformOrigin:'center center',opacity:fr.opacity,zIndex:100+i}
    },React.createElement('path',{d:fr.path,fill:fr.color})));
  }
  blocks.push(box({left:margin,right:margin,top:plan.footerY-39,
    height:2,background:Scene.rgb(p.text,.22),zIndex:200}));
  blocks.push(box({left:margin,top:plan.footerY-19,color:p.sub,
    fontFamily:'Manrope',fontWeight:700,fontSize:20,zIndex:200},'СОЗДАНО ДЛЯ ВДОХНОВЕНИЯ'));
  blocks.push(box({right:margin,top:plan.footerY-19,color:p.accent,
    fontFamily:'Manrope',fontWeight:700,fontSize:20,zIndex:200},'✦'));
  return el('div',{display:'flex',width,height,position:'relative',overflow:'hidden',
    background:p.bg1,fontFamily:'Manrope'},...blocks);
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
  const expires=member?.current_period_end?Date.parse(member.current_period_end):NaN;
  if(!member||!['basic','pro','studio','agency','ultimate'].includes(member.plan)
    ||!['active','trialing'].includes(member.status)||!member.current_period_end
    ||!Number.isFinite(expires)||expires<=Date.now())return respond({error:'SUBSCRIPTION_REQUIRED'},403);
  let body:any;
  try{body=await boundedJson(req,900000);}
  catch(e){return e instanceof Error&&e.message==='TOO_LARGE'
    ?respond({error:'TOO_LARGE'},413):respond({error:'BAD_JSON'},400);}
  const snapshot=body?.snapshot,idx=body?.cardIndex;
  if(!snapshot||!SIZES[snapshot.ratio]||!Array.isArray(snapshot.cards)
    ||snapshot.cards.length<1||snapshot.cards.length>8||!Number.isInteger(idx)
    ||idx<0||idx>=snapshot.cards.length||!snapshot.cards[idx]
    ||typeof snapshot.cards[idx]!=='object'||Array.isArray(snapshot.cards[idx]))return respond({error:'INVALID_POSTER'},400);
  // Older project snapshots may omit template; preserve their Aurora default.
  const requestedTemplate=snapshot.cards[idx].template??'aurora';
  if(typeof requestedTemplate!=='string'||!TEMPLATES.has(requestedTemplate))
    return respond({error:'INVALID_TEMPLATE'},400);
  // A browser-crafted snapshot must never get Pro designs using a Basic membership.
  if(PRO_TEMPLATES.has(requestedTemplate)&&!['pro','studio','agency','ultimate'].includes(member.plan))
    return respond({error:'PRO_SUBSCRIPTION_REQUIRED'},403);
  if(STUDIO_TEMPLATES.has(requestedTemplate)&&!['studio','agency','ultimate'].includes(member.plan))
    return respond({error:'STUDIO_SUBSCRIPTION_REQUIRED'},403);
  if(AGENCY_TEMPLATES.has(requestedTemplate)&&!['agency','ultimate'].includes(member.plan))
    return respond({error:'AGENCY_SUBSCRIPTION_REQUIRED'},403);
  if(ULTIMATE_TEMPLATES.has(requestedTemplate)&&member.plan!=='ultimate')
    return respond({error:'ULTIMATE_SUBSCRIPTION_REQUIRED'},403);
  // Reject photos we cannot render, rather than silently returning a PNG without them.
  if(snapshot.imageData){
    if(typeof snapshot.imageData!=='string'||!/^data:image\/(png|jpeg|webp);base64,[a-z0-9+/=]+$/i.test(snapshot.imageData))
      return respond({error:'INVALID_IMAGE'},400);
    if(snapshot.imageData.length>=600000)return respond({error:'IMAGE_TOO_LARGE'},413);
  }
  try{
    const [width,height]=SIZES[snapshot.ratio];
    const typefaces=await fonts(snapshot.cards[idx].titleFont);
    const element=renderPoster(snapshot,snapshot.cards[idx],width,height,typefaces.map((f:any)=>f.name));
    const image=new ImageResponse(element,{width,height,fonts:typefaces});
    return new Response(image.body,{status:200,headers:{...HEADERS,'Content-Type':'image/png',
      'Content-Disposition':'attachment; filename="anons-premium.png"'}});
  }catch(e){console.error('premium render',String(e));return respond({error:'RENDER_UNAVAILABLE'},503);}
});
