/* Worn-In 分段编辑器 v1 */
'use strict';
const $=id=>document.getElementById(id);
const cv=$('cv'), ctx=cv.getContext('2d');
const GIFTOTAL={smoke:21,ribbon:47,cabinet_open:9,yarn_liquid:530,glitter:315};
const GIFDELAY={}; // gifKey -> [delays]
const ASSETV='4';  // 素材版本号：换了 GIF/meta 就 +1，强制刷新缓存

/* ---- 四个时间段 ---- */
const SEG=[
 {id:'seg1',name:'1 · 烟雾飘（上传衣物）',bg:'assets/materials/bg.png',
  layers:[
   {id:'cabinet',kind:'img',label:'柜子',src:'assets/materials/cabinet.png',x:34,y:40,w:20,vis:true},
   {id:'mirror',kind:'img',label:'镜子',src:'assets/materials/mirror.png',x:58,y:26,w:8,vis:true},
   {id:'photo',kind:'photo',label:'衣物照(镜内)',vis:false,follow:true,mx:9.2,my:6.2,mw:80.1,mh:73.0,zoom:100},
   {id:'smoke',kind:'gif',label:'烟雾 GIF',gif:'smoke',x:4,y:14,w:70,vis:true,
      cropX:0,cropY:0,cropW:100,cropH:100,f0:0,f1:null,speed:1}
  ]},
 {id:'seg2',name:'2 · 丝带飘',bg:'assets/materials/bg.png',
  layers:[
   {id:'cabinet',kind:'img',label:'柜子',src:'assets/materials/cabinet.png',x:34,y:40,w:20,vis:true},
   {id:'mirror',kind:'img',label:'镜子',src:'assets/materials/mirror.png',x:58,y:26,w:8,vis:true},
   {id:'photo',kind:'photo',label:'衣物照(镜内)',vis:false,follow:true,mx:9.2,my:6.2,mw:80.1,mh:73.0,zoom:100},
   {id:'ribbon',kind:'gif',label:'丝带 GIF',gif:'ribbon',x:20,y:18,w:60,vis:true,
      cropX:0,cropY:0,cropW:100,cropH:100,f0:0,f1:null,speed:1},
   {id:'glitter',kind:'gif',label:'闪粉 GIF',gif:'glitter',x:0,y:0,w:100,vis:true,
      cropX:0,cropY:0,cropW:100,cropH:100,f0:0,f1:null,speed:1}
  ]},
 {id:'seg3',name:'3 · 衣柜打开',bg:'assets/materials/bg.png',
  layers:[
   {id:'cabopen',kind:'gif',label:'衣柜打开 GIF',gif:'cabinet_open',x:34,y:40,w:20,vis:true,
      cropX:0,cropY:0,cropW:100,cropH:100,f0:0,f1:null,speed:1},
   {id:'mirror',kind:'img',label:'镜子',src:'assets/materials/mirror.png',x:58,y:26,w:8,vis:false}
  ]},
 {id:'seg4',name:'4 · 毛线球变液体(放大)',bg:'assets/materials/bg_zoom.png',
  layers:[
   {id:'cabzoom',kind:'img',label:'放大柜子',src:'assets/materials/cabinet_zoom.png',x:24,y:28,w:46,vis:true},
   {id:'yarn',kind:'gif',label:'毛线球→液体 ①',gif:'yarn_liquid',x:6,y:10,w:88,vis:true,
      cropX:0,cropY:0,cropW:100,cropH:100,f0:0,f1:null,speed:1},
   {id:'yarn2',kind:'gif',label:'毛线球→液体 ②',gif:'yarn_liquid',x:18,y:10,w:88,vis:true,
      cropX:0,cropY:0,cropW:100,cropH:100,f0:0,f1:null,speed:1},
   {id:'yarn3',kind:'gif',label:'毛线球→液体 ③',gif:'yarn_liquid',x:30,y:10,w:88,vis:true,
      cropX:0,cropY:0,cropW:100,cropH:100,f0:0,f1:null,speed:1}
  ]}
];

/* ---- 状态 ---- */
let seg=0, sel=0, playing=true, bgImg=null, imgs={}, frameCache={};
const photo={url:null,name:null};
const gifAnim={}; // per gif layer current frame & last

/* 加载背景与静态图 */
function loadImg(url){return new Promise(r=>{const i=new Image();i.onload=()=>r(i);i.onerror=()=>r(null);i.src=url;});}
async function preloadStatic(){
  for(const s of SEG){
    if(!imgs[s.bg]){ imgs[s.bg]=await loadImg(s.bg); }
    for(const L of s.layers){
      if(L.kind==='img' && !imgs[L.src]){ imgs[L.src]=await loadImg(L.src); }
    }
  }
}
function frameURL(gif,f){ return 'assets/gifs/'+gif+'/frames/f'+String(f).padStart(4,'0')+'.png?v='+ASSETV; }
function getFrame(gif,f){
  const k=gif+'_'+f;
  if(!frameCache[k]){ const im=new Image(); im.src=frameURL(gif,f); frameCache[k]=im; }
  return frameCache[k];
}
async function loadMeta(){
  for(const g in GIFTOTAL){
    try{ const m=await (await fetch('assets/gifs/'+g+'/meta.json?v='+ASSETV)).json();
      GIFDELAY[g]=m.delays; GIFTOTAL[g]=m.frames; }catch(e){}
  }
}

/* ---- 画布几何 ---- */
function bgSize(){
  const bg=imgs[SEG[seg].bg]||{width:1939,height:1233};
  const aspect=bg.width/bg.height;           // 宽/高
  const W=1200, H=Math.round(1200/aspect);
  if(cv.width!==W||cv.height!==H){cv.width=W;cv.height=H;}
  return {W,H};
}
const pxw=()=>cv.width, pxh=()=>cv.height;

/* ---- 绘制一层 ---- */
function roundRect(x,y,w,h,r){ctx.beginPath();ctx.moveTo(x+r,y);ctx.arcTo(x+w,y,x+w,y+h,r);ctx.arcTo(x+w,y+h,x,y+h,r);ctx.arcTo(x,y+h,x,y,r);ctx.arcTo(x,y,x+w,y,r);ctx.closePath();}
function drawLayer(L){
  if(!L.vis) return;
  const W=cv.width,H=cv.height;
  const dx=L.x/100*W, dy=L.y/100*H, dw=L.w/100*W;
  if(L.kind==='img'){
    const im=imgs[L.src]; if(!im) return;
    const dh=dw*im.height/im.width;
    ctx.drawImage(im,dx,dy,dw,dh);
  }else if(L.kind==='photo'){
    if(!photo.url) return;
    const mirror=SEG[seg].layers.find(l=>l.id==='mirror');
    let bx=L.x, by=L.y, bwd=L.w;
    if(L.follow && mirror){ bx=mirror.x; by=mirror.y; bwd=mirror.w; }
    const mw=bwd/100*W, mh=mw*(imgs['assets/materials/mirror.png']?imgs['assets/materials/mirror.png'].height/imgs['assets/materials/mirror.png'].width:1.6);
    const mx=bx/100*W, my=by/100*H;
    const bx0=L.mx!=null?L.mx:9.2, by0=L.my!=null?L.my:6.2;
    const bww=L.mw!=null?L.mw:80.1, bhh=L.mh!=null?L.mh:73.0;
    const ax=mx+bx0/100*mw, ay=my+by0/100*mh, aw=bww/100*mw, ah=bhh/100*mh;
    if(aw<=0||ah<=0) return;
    ctx.save(); roundRect(ax,ay,aw,ah,aw*0.10); ctx.clip();
    const im=photo.img||(photo.img=new Image()); 
    if(im.src!==photo.url){im.src=photo.url;}
    if(im.complete&&im.naturalWidth){
      const zoom=(L.zoom!=null?L.zoom:100)/100;
      const sc=Math.max(aw/im.naturalWidth, ah/im.naturalHeight)*zoom;
      const pdw=im.naturalWidth*sc, pdh=im.naturalHeight*sc;
      ctx.drawImage(im, ax+(aw-pdw)/2, ay+(ah-pdh)/2, pdw, pdh);
    }
    ctx.restore();
  }else if(L.kind==='gif'){
    const g=GIFTOTAL[L.gif]; if(!g) return;
    const fi=(gifAnim[L.id]&&gifAnim[L.id].f)||0;
    const im=getFrame(L.gif, fi);
    if(!im.complete||!im.naturalWidth) return;
    const fw=im.naturalWidth, fh=im.naturalHeight;
    const cx=L.cropX||0, cy=L.cropY||0, cw=L.cropW==null?100:L.cropW, ch=L.cropH==null?100:L.cropH;
    const sx=cx/100*fw, sy=cy/100*fh, sw=cw/100*fw, sh=ch/100*fh;
    const dh=dw*fh/fw;
    const ddx=dx+cx/100*dw, ddy=dy+cy/100*dh, ddw=cw/100*dw, ddh=ch/100*dh;
    ctx.drawImage(im,sx,sy,sw,sh,ddx,ddy,ddw,ddh);
  }
}
function draw(){
  const bg=imgs[SEG[seg].bg];
  if(bg){
    const s=SEG[seg];
    const bx=(s.bgX||0)/100*cv.width, by=(s.bgY||0)/100*cv.height, bw=(s.bgW!=null?s.bgW:100)/100*cv.width;
    ctx.drawImage(bg,bx,by,bw,bw*bg.height/bg.width);
  } else { ctx.fillStyle='#000'; ctx.fillRect(0,0,cv.width,cv.height); }
  for(const L of SEG[seg].layers) drawLayer(L);
}

/* ---- GIF 计时 ---- */
let last=performance.now();
function step(t){
  const dt=Math.min(80,t-last); last=t;
  if(playing){
    for(const L of SEG[seg].layers){
      if(L.kind!=='gif'||!L.vis) continue;
      const g=GIFTOTAL[L.gif]; if(!g) continue;
      const a=gifAnim[L.id]=gifAnim[L.id]||{f:Math.min(L.f0||0,g-1),acc:0};
      const end=L.f1==null?g-1:Math.min(L.f1,g-1);
      const start=Math.min(L.f0||0,end);
      const delay=(GIFDELAY[L.gif]?GIFDELAY[L.gif][a.f]:80)/(L.speed||1);
      a.acc+=dt;
      while(a.acc>=delay){ a.acc-=delay; a.f++; if(a.f>end) a.f=start; }
    }
  }
  draw();
  requestAnimationFrame(step);
}

/* ---- UI ---- */
function segTabs(){
  const box=$('segs'); box.innerHTML='';
  SEG.forEach((s,i)=>{
    const b=document.createElement('button'); b.textContent=s.name; b.className=i===seg?'on':'';
    b.onclick=()=>{seg=i;sel=0;renderTabs();bgSize();buildPanel();$('segTitle').textContent=s.name;};
    box.appendChild(b);
  });
  $('segTitle').textContent=SEG[seg].name;
}
function renderTabs(){ [...$('segs').children].forEach((b,i)=>b.className=i===seg?'on':''); }
function sliderRow(label,val,min,max,step,oninput){
  const d=document.createElement('div'); d.className='lrow';
  const st=step||1;
  d.innerHTML=`<label>${label}</label><input type="range" class="rg" min="${min}" max="${max}" step="${st}" value="${val}"><input type="number" class="nm" min="${min}" max="${max}" step="${st}" value="${val}">`;
  const rg=d.querySelector('.rg'), nm=d.querySelector('.nm');
  const clamp=v=>isNaN(v)?min:Math.min(max,Math.max(min,v));
  rg.oninput=()=>{ nm.value=rg.value; oninput(clamp(parseFloat(rg.value))); };
  nm.onchange=()=>{ const v=clamp(parseFloat(nm.value)); nm.value=v; rg.value=v; oninput(v); };
  nm.oninput=()=>{ const v=parseFloat(nm.value); if(!isNaN(v)){ const c=clamp(v); rg.value=c; oninput(c); } };
  return d;
}
function cropToCut(L){
  const cx=L.cropX||0, cy=L.cropY||0, cw=L.cropW==null?100:L.cropW, ch=L.cropH==null?100:L.cropH;
  L.cutL=cx; L.cutT=cy; L.cutR=Math.max(0,100-cx-cw); L.cutB=Math.max(0,100-cy-ch);
}
function cutToCrop(L){
  const l=L.cutL||0, r=L.cutR||0, t=L.cutT||0, b=L.cutB||0;
  L.cropX=l; L.cropY=t; L.cropW=Math.max(1,100-l-r); L.cropH=Math.max(1,100-t-b);
}
function buildPanel(){
  const box=$('layers'); box.innerHTML='';
  { const s=SEG[seg];
    const bgEl=document.createElement('div'); bgEl.className='layer';
    bgEl.innerHTML=`<div class="lhead"><b>🖼 背景</b><span>图片</span></div>`;
    bgEl.appendChild(sliderRow('X %',+(s.bgX||0).toFixed(1),-100,200,0.5,v=>{s.bgX=v;}));
    bgEl.appendChild(sliderRow('Y %',+(s.bgY||0).toFixed(1),-100,200,0.5,v=>{s.bgY=v;}));
    bgEl.appendChild(sliderRow('宽 %',+(s.bgW!=null?s.bgW:100).toFixed(1),1,400,0.5,v=>{s.bgW=v;}));
    box.appendChild(bgEl);
  }
  SEG[seg].layers.forEach((L,idx)=>{
    const el=document.createElement('div'); el.className='layer'+(idx===sel?' sel':'');
    const kindtxt = L.kind==='gif'?('GIF/'+GIFTOTAL[L.gif]+'帧'):L.kind==='photo'?'照片':L.kind==='img'?'图片':'';
    el.innerHTML=`<div class="lhead"><input type="checkbox" ${L.vis?'checked':''}><b>${L.label}</b><span>${kindtxt}</span></div>`;
    el.onclick=(ev)=>{ if(ev.target.tagName==='INPUT') return; sel=idx; buildPanel(); };
    const cb=el.querySelector('input[type=checkbox]');
    cb.onchange=()=>{L.vis=cb.checked; el.className='layer'+(idx===sel?' sel':'');};
    if(idx===sel){
      const add=elm=>el.appendChild(elm);
      if(L.kind!=='photo'){
        add(sliderRow('X %',+(L.x).toFixed(1),-500,500,0.5,v=>{L.x=v;}));
        add(sliderRow('Y %',+(L.y).toFixed(1),-500,500,0.5,v=>{L.y=v;}));
        add(sliderRow('宽 %',+(L.w).toFixed(1),1,1000,0.5,v=>{L.w=v;}));
      }
      if(L.kind==='gif'){
        const wrap=document.createElement('div'); wrap.className='giftitle';
        wrap.textContent='— GIF 裁切 / 帧 / 速度 —'; el.appendChild(wrap);
        cropToCut(L);
        add(sliderRow('裁左 %',L.cutL,0,99,1,v=>{L.cutL=v;cutToCrop(L);}));
        add(sliderRow('裁右 %',L.cutR,0,99,1,v=>{L.cutR=v;cutToCrop(L);}));
        add(sliderRow('裁上 %',L.cutT,0,99,1,v=>{L.cutT=v;cutToCrop(L);}));
        add(sliderRow('裁下 %',L.cutB,0,99,1,v=>{L.cutB=v;cutToCrop(L);}));
        const g=GIFTOTAL[L.gif];
        const fr=document.createElement('div'); fr.className='lrow';
        fr.innerHTML=`<label>帧</label><input type="number" class="f0" min="0" max="${g-1}" value="${L.f0||0}">~<input type="number" class="f1" min="0" max="${g-1}" value="${L.f1==null?g-1:L.f1}">`;
        el.appendChild(fr);
        fr.querySelector('.f0').onchange=e=>L.f0=Math.min(Math.max(0,+e.target.value),g-1);
        fr.querySelector('.f1').onchange=e=>L.f1=Math.min(Math.max(0,+e.target.value),g-1);
        add(sliderRow('速度',L.speed,0.1,20,0.1,v=>L.speed=v));
      }
      if(L.kind==='photo'){
        add(sliderRow('镜内 X %',+(L.mx!=null?L.mx:9.2).toFixed(1),0,100,0.5,v=>L.mx=v));
        add(sliderRow('镜内 Y %',+(L.my!=null?L.my:6.2).toFixed(1),0,100,0.5,v=>L.my=v));
        add(sliderRow('镜内宽 %',+(L.mw!=null?L.mw:80.1).toFixed(1),1,100,0.5,v=>L.mw=v));
        add(sliderRow('镜内高 %',+(L.mh!=null?L.mh:73.0).toFixed(1),1,100,0.5,v=>L.mh=v));
        add(sliderRow('照片缩放 %',+(L.zoom!=null?L.zoom:100).toFixed(0),100,400,5,v=>L.zoom=v));
      }
    }
    box.appendChild(el);
  });
  if(SEG[seg].layers.some(l=>l.kind==='photo')){
    const note=document.createElement('p'); note.className='hint';
    note.textContent='照片框相对镜面：镜内 X/Y 是左上角位置，镜内宽/高是大小（单位 %），缩放控制照片在框内的裁剪。';
    box.appendChild(note);
  }
}

/* ---- 一键保持：存/读 localStorage ---- */
const SAVE_KEY='wornin_editor_state_v1';
const BACKUP_KEY=SAVE_KEY+'_bak';
let toastTimer=null;
function toast(msg){
  const t=$('toast'); t.textContent=msg; t.classList.add('show');
  clearTimeout(toastTimer); toastTimer=setTimeout(()=>t.classList.remove('show'),2200);
}
// 把“已保存的图层数组”与“最新默认图层”合并：
// 已存在的沿用你调过的数值，新加的默认图层(如毛线球②③)自动补进来，避免导入/载入后缺层或错位
function mergeLayers(saved,defs){
  if(!Array.isArray(saved)) return defs.map(d=>JSON.parse(JSON.stringify(d)));
  const byId=new Map(saved.map(l=>[l.id,l]));
  return defs.map(def=>{
    const sv=byId.get(def.id);
    return sv?Object.assign({},def,sv,{label:def.label}):JSON.parse(JSON.stringify(def));
  });
}
function saveAll(){
  const state={ seg:SEG.map(s=>JSON.parse(JSON.stringify(s.layers))), bg:SEG.map(s=>({x:s.bgX||0,y:s.bgY||0,w:s.bgW!=null?s.bgW:100})), photoName:photo.name, photoUrl:photo.url||null };
  // 先备份当前这份，防止误覆盖/误删导致丢数据
  const cur=localStorage.getItem(SAVE_KEY);
  if(cur){ try{ localStorage.setItem(BACKUP_KEY,cur); }catch(e){} }
  let msg='已保持四个时间段的所有位置 ✓ 刷新也会保留';
  try{
    localStorage.setItem(SAVE_KEY,JSON.stringify(state));
  }catch(err){
    state.photoUrl=null; // 照片 dataURL 太大则去掉
    try{ localStorage.setItem(SAVE_KEY,JSON.stringify(state)); msg='位置已保持 ✓（照片太大未存，请重新上传）'; }
    catch(e2){ alert('保存失败：浏览器本地存储不可用'); return; }
  }
  toast(msg);
}
function loadSaved(){
  const apply=raw=>{
    try{
      if(!raw) return false;
      const d=JSON.parse(raw);
      if(Array.isArray(d.seg)&&d.seg.length===SEG.length){
        d.seg.forEach((ly,i)=>{ SEG[i].layers=mergeLayers(ly,SEG[i].layers); });
        if(Array.isArray(d.bg)) d.bg.forEach((b,i)=>{ if(b){ SEG[i].bgX=b.x!=null?b.x:0; SEG[i].bgY=b.y!=null?b.y:0; SEG[i].bgW=b.w!=null?b.w:100; } });
      }
      if(d.photoUrl){ photo.url=d.photoUrl; photo.name=d.photoName||''; }
      return true;
    }catch(e){ return false; }
  };
  // 主存档读不到就读上一份备份
  return apply(localStorage.getItem(SAVE_KEY)) || apply(localStorage.getItem(BACKUP_KEY));
}

/* ---- 工具栏 ---- */
function bindTools(){
  $('btnPlay').onclick=()=>{playing=!playing; $('btnPlay').textContent=playing?'⏸ 暂停预览':'▶ 播放预览';};
  $('btnSave').onclick=async()=>{
    saveAll();
    const data={seg:SEG.map(s=>({name:s.name,bg:s.bg,bgX:s.bgX,bgY:s.bgY,bgW:s.bgW,layers:s.layers})), photo:photo.name};
    try{
      const r=await fetch('/save',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(data,null,1)});
      if(r.ok) toast('已保存到工程 wornin_project.json ✓');
      else toast('保存失败：'+(await r.text()));
    }catch(e){ toast('保存接口不可用，请用「导出配置 JSON」手动覆盖'); }
  };
  $('btnExport').onclick=()=>{
    const data={seg:SEG.map(s=>({name:s.name,bg:s.bg,bgX:s.bgX,bgY:s.bgY,bgW:s.bgW,layers:s.layers})), photo:photo.name};
    const a=document.createElement('a');a.href='data:application/json;charset=utf-8,'+encodeURIComponent(JSON.stringify(data,null,1));
    a.download='wornin_project.json';a.click();
  };
  $('btnImport').onclick=()=>$('importFile').click();
  $('importFile').onchange=e=>{
    const f=e.target.files[0]; if(!f) return;
    const rd=new FileReader(); rd.onload=()=>{
      try{ const d=JSON.parse(rd.result); if(d.seg&&d.seg.length===SEG.length){
        d.seg.forEach((s,i)=>{ if(s.layers) SEG[i].layers=mergeLayers(s.layers,SEG[i].layers); SEG[i].bgX=s.bgX!=null?s.bgX:0; SEG[i].bgY=s.bgY!=null?s.bgY:0; SEG[i].bgW=s.bgW!=null?s.bgW:100; });
        buildPanel(); toast('已导入并合并配置 ✓');
      } }catch(err){ alert('导入失败'); }
    }; rd.readAsText(f);
  };
  $('btnPhoto').onclick=()=>$('photoFile').click();
  $('btnSample').onclick=()=>{ makePlaceholderPhoto(); buildPanel(); };
  $('photoFile').onchange=e=>{
    const f=e.target.files[0]; if(!f) return;
    const rd=new FileReader(); rd.onload=()=>{ photo.url=rd.result; photo.name=f.name; photo.img=new Image(); photo.img.onload=()=>{}; photo.img.src=rd.result;
      SEG.forEach(s=>{ const p=s.layers.find(l=>l.id==='photo'); if(p) p.vis=true; }); buildPanel(); }; rd.readAsDataURL(f);
  };
}

function applyConfigLayers(cfgLayers, defLayers){
  const byId=new Map(cfgLayers.map(l=>[l.id,l]));
  const out=defLayers.map(def=>{
    const c=byId.get(def.id);
    return c?Object.assign({}, def, c) : JSON.parse(JSON.stringify(def));
  });
  const known=new Set(out.map(l=>l.id));
  for(const c of cfgLayers){ if(!known.has(c.id)) out.push(c); }
  return out;
}
async function loadConfig(){
  try{
    const r=await fetch('wornin_project.json?v='+Date.now());
    const d=await r.json();
    if(d.seg&&d.seg.length===SEG.length){
      d.seg.forEach((s,i)=>{
        if(s.layers) SEG[i].layers=applyConfigLayers(s.layers, SEG[i].layers);
        if(s.bgX!=null) SEG[i].bgX=s.bgX;
        if(s.bgY!=null) SEG[i].bgY=s.bgY;
        if(s.bgW!=null) SEG[i].bgW=s.bgW;
      });
    }
  }catch(e){ console.warn('[config]',e); }
}

/* ---- 示例照片（长方形例图，用于预览镜子里的照片位置/大小/裁剪） ---- */
function makePlaceholderPhoto(){
  const c=document.createElement('canvas'); c.width=360; c.height=460;
  const x=c.getContext('2d');
  x.fillStyle='#e6d8c2'; x.fillRect(0,0,360,460);
  x.strokeStyle='#c9ad83'; x.lineWidth=10; x.strokeRect(5,5,350,450);
  x.fillStyle='#9b825e'; x.font='bold 26px sans-serif'; x.textAlign='center'; x.textBaseline='middle';
  x.fillText('示例照片',180,230);
  const url=c.toDataURL('image/jpeg',0.92);
  photo.url=url; photo.name='示例照片';
  photo.img=new Image(); photo.img.src=url;
  SEG.forEach(s=>{ const p=s.layers.find(l=>l.id==='photo'); if(p) p.vis=true; });
}

/* ---- 启动 ---- */
(async function(){
  loadSaved();
  await preloadStatic();
  await loadMeta();
  await loadConfig();
  if(!photo.url) makePlaceholderPhoto();
  buildPanel(); segTabs(); bindTools(); bgSize();
  requestAnimationFrame(step);
})();
