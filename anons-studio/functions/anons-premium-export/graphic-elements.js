/* Anons Studio 0.9: shared deterministic geometry contract for graphic elements.
   Used unchanged by browser Canvas (Path2D) and the server React/SVG renderer. */
(function(root){
  "use strict";
  const paths=Object.freeze({
    spark:"M50 4 L60 37 L96 50 L60 62 L50 96 L39 62 L4 50 L39 37 Z",
    star:"M50 5 L61 36 L95 37 L68 58 L78 92 L50 73 L22 92 L32 58 L5 37 L39 36 Z",
    bolt:"M59 4 L17 55 L44 55 L33 97 L86 36 L57 36 Z",
    heart:"M50 88 C16 62 6 45 13 26 C20 8 42 9 50 27 C60 8 83 8 91 26 C99 45 80 66 50 88 Z",
    check:"M8 53 L30 74 L92 17 L82 7 L30 53 L18 43 Z",
    circle:"M50 4 A46 46 0 1 0 50 96 A46 46 0 1 0 50 4 Z",
    diamond:"M50 4 L96 50 L50 96 L4 50 Z",
    badge:"M50 3 L63 16 L81 13 L84 31 L97 50 L84 63 L81 85 L63 82 L50 97 L37 82 L19 85 L16 63 L3 50 L16 37 L19 15 L37 18 Z",
    arrow:"M7 42 L63 42 L63 21 L96 50 L63 79 L63 59 L7 59 Z",
    bubble:"M12 13 L88 13 Q96 13 96 22 L96 68 Q96 76 88 76 L42 76 L20 95 L20 76 L12 76 Q4 76 4 68 L4 22 Q4 13 12 13 Z",
    ribbon:"M26 5 L74 5 L74 97 L50 79 L26 97 Z",
    wave:"M4 42 C21 9 37 9 50 42 C63 75 79 75 96 42 L96 71 C79 97 62 97 50 68 C38 39 21 39 4 71 Z"
  });
  const labels=Object.freeze({
    spark:"Искра",star:"Звезда",bolt:"Молния",heart:"Сердце",check:"Галочка",
    circle:"Круг",diamond:"Ромб",badge:"Значок",arrow:"Стрелка",bubble:"Облако",
    ribbon:"Лента",wave:"Волна"
  });
  const MAX=12;
  function clamp(value,min,max,fallback){
    const n=Number(value);
    return Number.isFinite(n)?Math.max(min,Math.min(max,n)):fallback;
  }
  function safeColor(value){
    return typeof value==="string"&&/^#[0-9a-f]{6}$/i.test(value)?value.toLowerCase():"#c2a1ff";
  }
  function normalizeOne(raw,index){
    const a=raw&&typeof raw==="object"&&!Array.isArray(raw)?raw:{};
    return {
      id:typeof a.id==="string"&&/^[a-zA-Z0-9_-]{1,48}$/.test(a.id)?a.id:"element-"+index,
      kind:Object.hasOwn(paths,a.kind)?a.kind:"spark",
      x:Math.round(clamp(a.x,0,100,50)*10)/10,
      y:Math.round(clamp(a.y,0,100,50)*10)/10,
      size:Math.round(clamp(a.size,4,35,12)*10)/10,
      rotation:Math.round(clamp(a.rotation,-180,180,0)),
      opacity:Math.round(clamp(a.opacity,20,100,100)),
      color:safeColor(a.color),
      hidden:a.hidden===true,
      label:typeof a.label==="string"?a.label.trim().slice(0,48):"",
      groupId:typeof a.groupId==="string"&&/^[a-z0-9_-]{1,32}$/.test(a.groupId)?a.groupId:""
    };
  }
  function normalizeElements(values){
    if(!Array.isArray(values))return [];
    const used=new Set();
    return values.slice(0,MAX).map((a,i)=>{
      const v=normalizeOne(a,i);
      if(used.has(v.id)){v.id="element-"+i;}
      used.add(v.id);return v;
    });
  }
  function frame(raw,width,height){
    const v=normalizeOne(raw,0);
    const w=Math.max(1,Number(width)||1080),h=Math.max(1,Number(height)||1350);
    const size=Math.min(w,h)*v.size/100;
    return {x:w*v.x/100,y:h*v.y/100,size,rotation:v.rotation,opacity:v.opacity/100,
      color:v.color,path:paths[v.kind],kind:v.kind,id:v.id};
  }
  root.AnonsGraphics=Object.freeze({
    paths,labels,MAX,normalizeOne,normalizeElements,frame
  });
})(globalThis);
