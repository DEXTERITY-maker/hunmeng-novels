/* Anons Studio shared scene contract, v1.0 release candidate.
   The same pure calculations are loaded by browser Canvas and Supabase Edge.
   They must never accept executable markup from user projects. */
(function(root){
  "use strict";
  const themes=Object.freeze({
    ultraviolet:{bg1:"#17172f",bg2:"#4a3486",glow:"#a079f7",accent:"#c2a1ff",text:"#ffffff",sub:"#e0d8f3",dark:true},
    emerald:{bg1:"#0c2c2b",bg2:"#145b56",glow:"#35c6a2",accent:"#7ef0cb",text:"#ffffff",sub:"#d6f4eb",dark:true},
    sunset:{bg1:"#60274c",bg2:"#aa4e66",glow:"#ffaf7d",accent:"#ffcc9a",text:"#ffffff",sub:"#ffecdd",dark:true},
    ink:{bg1:"#181c2a",bg2:"#34405c",glow:"#8299b8",accent:"#b8c9ef",text:"#ffffff",sub:"#e0e5ee",dark:true},
    paper:{bg1:"#f9f0e1",bg2:"#e9d5b5",glow:"#d8ac76",accent:"#95592f",text:"#302737",sub:"#5b5058",dark:false}
  });
  const templates=["aurora","editorial","spotlight","pulse","minimal","bulletin"];
  const formats=Object.freeze({portrait:[1080,1350],square:[1080,1080],story:[1080,1920]});
  const layers=["decoration","photo","brand","title","description","highlights"];
  const presetLabels=Object.freeze({update:"ОБНОВЛЕНИЕ",launch:"ЗАПУСК",event:"СОБЫТИЕ",notice:"ОБЪЯВЛЕНИЕ"});
  const decorations=Object.freeze({
    subtle:Object.freeze({grid:.022,glow:.23,rings:.16,disc:.10,spark:.83,centerY:.235,ringRadius:158,ringStep:28,discRadius:125}),
    balanced:Object.freeze({grid:.035,glow:.31,rings:.22,disc:.13,spark:.94,centerY:.255,ringRadius:173,ringStep:32,discRadius:136}),
    expressive:Object.freeze({grid:.055,glow:.40,rings:.29,disc:.18,spark:1,centerY:.285,ringRadius:188,ringStep:37,discRadius:142})
  });
  const clamp=(n,lo,hi,fallback)=>Number.isFinite(Number(n))?Math.max(lo,Math.min(hi,Number(n))):fallback;
  const rgb=(hex,a=1)=>{const n=Number.parseInt(hex.slice(1),16);return "rgba("+((n>>16)&255)+","+((n>>8)&255)+","+(n&255)+","+a+")";};
  function layout(snapshot={},card={}){
    const format=Object.hasOwn(formats,snapshot.ratio)?snapshot.ratio:"portrait";
    const [width,height]=formats[format];
    const theme=Object.hasOwn(themes,card.theme)?card.theme:(Object.hasOwn(themes,snapshot.theme)?snapshot.theme:"ultraviolet");
    const template=templates.includes(card.template)?card.template:"aurora";
    const palette={...themes[theme]};
    if(typeof card.accentColor==="string"&&/^#[0-9a-fA-F]{6}$/.test(card.accentColor))palette.accent=card.accentColor.toLowerCase();
    const offset=(name)=>{
      const v=card.layerOffsets?.[name];
      return {x:Math.round(clamp(v?.x,-30,30,0)*10)/10,y:Math.round(clamp(v?.y,-30,30,0)*10)/10};
    };
    const requested=Array.isArray(card.layerOrder)?card.layerOrder.filter(v=>layers.includes(v)):[];
    const order=[...new Set([...requested,...layers])];
    const enabled={};
    for(const name of layers)enabled[name]=card.layers?.[name]!==false;
    const titleShift=clamp(card.titleShift,-12,12,0);
    const descShift=clamp(card.descriptionShift,-12,12,0);
    const titleY=Math.round(height*(template==="editorial"?.31:template==="minimal"?.35:template==="bulletin"?.27:height>=1700?.258:height<=1100?.265:.285))+Math.round(height*titleShift/100);
    const detailsY=Math.round(height*(template==="editorial"?.75:template==="minimal"?.77:template==="bulletin"?.72:height>=1700?.735:height<=1100?.716:.733));
    const margin=76,contentWidth=width-2*margin;
    const headingScale=clamp(card.headingScale,80,120,100);
    const descriptionScale=clamp(card.descriptionScale,80,130,100);
    const titleFont=card.titleFont||"auto";
    const titleWeight=[700,800,900].includes(card.titleWeight)?card.titleWeight:800;
    const titleTracking=clamp(card.titleTracking,-2,6,0);
    const titleFamily=titleFont==="auto"?((template==="editorial"||template==="minimal")?"georgia":"manrope"):
      (["georgia","arial","manrope"].includes(titleFont)?titleFont:"manrope");
    const effectiveWeight=titleFont==="auto"&&(template==="editorial"||template==="minimal")&&titleWeight===800?700:titleWeight;
    const photo={x:width*.52,y:height*.11,width:width*.49,height:Math.min(height*.36,570),radius:140};
    const footerY=height-74;
    const titleBaseSize=Math.round((height<=1100?83:105)*headingScale/100);
    const descriptionSize=Math.round((height<=1100?29:32)*descriptionScale/100);
    const highlightRowHeight=height<=1100?61:height>=1700?91:76;
    const imageOpacity=clamp(card.photoOpacity,15,85,35)/100;
    const decorationLevel=Object.hasOwn(decorations,card.decorationLevel)?card.decorationLevel:"subtle";
    const textSpacing=["compact","balanced","airy"].includes(card.textSpacing)?card.textSpacing:"balanced";
    return {
      width,height,format,theme,template,palette,order,enabled,offsets:Object.fromEntries(layers.map(name=>[name,offset(name)])),
      margin,contentWidth,titleY,detailsY,footerY,photo,imageOpacity,
      titleBaseSize,titleFamily,titleWeight:effectiveWeight,titleTracking,textSpacing,
      decorationLevel,decorationTuning:decorations[decorationLevel],
      titleMaxHeight:Math.max(195,detailsY-titleY-225),
      descriptionSize,descriptionShift:Math.round(height*descShift/100),
      highlightRowHeight,
      center:card.alignment==="center",
      decorations:card.decorations!==false && template!=="minimal",
      label:presetLabels[card.preset]||"АНОНС",
      project:typeof snapshot.project==="string"?snapshot.project.slice(0,45):"МОЙ ПРОЕКТ"
    };
  }
  // Text position is based on the LAST drawn title baseline rather than
  // the next unused baseline. This prevents an oversized empty gap after
  // two-line headings without moving descriptions into the highlight box.
  function descriptionTop(scene,titleSpec){
    const count=Math.max(1,titleSpec.lines.length);
    const lastBaseline=scene.titleY+titleSpec.size*.8+(count-1)*titleSpec.size*1.14;
    const gap=scene.textSpacing==="compact"?44:scene.textSpacing==="airy"?86:62;
    const reserved=scene.height<=1100?140:155;
    return Math.round(Math.min(scene.detailsY-reserved,lastBaseline+gap))+scene.descriptionShift;
  }
  // Free exports retain several smaller diagonal watermarks, covering
  // distinct areas without placing large opaque text across the heading.
  function watermarkStamps(width,height,dark=true){
    const scale=width/1080;
    const marks=[[.28,.20,43,.15],[.72,.43,49,.14],[.34,.69,49,.15],[.73,.86,45,.14]];
    return marks.map(([x,y,size,alpha])=>Object.freeze({
      x:Math.round(width*x),y:Math.round(height*y),
      size:Math.round(size*scale),alpha:dark?alpha:Math.min(.20,alpha+.035),
      rotation:-.29
    }));
  }
  // Deterministic line breaking for the preview and the Edge renderer.
  // Uses conservative font-independent width estimates; tests cover long Cyrillic.
  function textWidth(value,size,tracking=0){
    let result=0;
    for(const ch of String(value||"")){
      const code=ch.codePointAt(0);
      let factor;
      if(ch===" ")factor=.32;
      else if(/[.,:;!|']/.test(ch))factor=.3;
      else if(/[ilI1]/.test(ch))factor=.33;
      else if(/[MWЖШЩФЮЫ]/.test(ch))factor=.82;
      else if(/[A-ZА-ЯЁ]/.test(ch))factor=.69;
      else if(/[а-яё]/.test(ch))factor=.59;
      else if(/[a-z0-9]/.test(ch))factor=.56;
      else if(code>0xffff)factor=1;
      else factor=.59;
      result+=factor*size+tracking;
    }
    return result;
  }
  function breakLines(source,maxWidth,fontSize,maxLines,tracking=0){
    const words=String(source||"").replace(/\s+/g," ").trim().split(" ").filter(Boolean);
    const lines=[];let line="";
    const max=Math.max(fontSize,maxWidth*.92);
    for(const word of words){
      const candidate=line?line+" "+word:word;
      if(line&&textWidth(candidate,fontSize,tracking)>max){
        lines.push(line);line=word;
      }else line=candidate;
      if(textWidth(line,fontSize,tracking)>max){
        let rest="";
        for(const ch of line){
          if(rest&&textWidth(rest+ch,fontSize,tracking)>max){
            lines.push(rest);rest=ch;
          }else rest+=ch;
        }
        line=rest;
      }
    }
    if(line)lines.push(line);
    if(lines.length>maxLines){
      const last=lines.slice(maxLines-1).join(" ").trim();
      lines.length=maxLines;
      let short=last;
      while(short.length&&textWidth(short+"…",fontSize,tracking)>max)short=short.slice(0,-1);
      lines[maxLines-1]=short.trimEnd()+"…";
    }
    return lines;
  }
  function titleLines(value,scene){
    const maxLines=scene.height<=1100?3:4,tracking=scene.titleTracking;
    let size=scene.titleBaseSize,lines=[];
    for(;size>=42;size-=3){
      lines=breakLines(value,scene.contentWidth,size,maxLines,tracking);
      if(lines.length*size*1.17<=scene.titleMaxHeight)break;
    }
    return {size:Math.max(42,size),lines};
  }
  root.AnonsScene=Object.freeze({layout,formats,themes,presetLabels,rgb,textWidth,breakLines,titleLines,descriptionTop,watermarkStamps});
})(globalThis);
