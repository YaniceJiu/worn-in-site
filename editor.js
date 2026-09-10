/* Worn-In 分段编辑器 v1 */
'use strict';
const $=id=>document.getElementById(id);
const cv=$('cv'), ctx=cv.getContext('2d');
const GIFTOTAL={smoke:21,ribbon:47,cabinet_open:9,yarn_liquid:530};
const GIFDELAY={}; // gifKey -> [delays]

/* ---- 四个时间段 ---- */
const SEG=[
 {id:'seg1',name:'1 · 烟雾飘（上传衣物）',bg:'assets/materials/bg.png',
  layers:[
   {id:'cabinet',kind:'img',label:'柜子',src:'assets/materials/cabinet.png',x:34,y:40,w:20,vis:true},
   {id:'mirror',kind:'img',label:'镜子',src:'assets/materials/mirror.png',x:58,y:26,w:8,vis:true},
   {id:'photo',kind:'photo',label:'衣物照(镜内)',vis:false,inset:8,follow:true,x:58,y:26,w:8},
   {id:'smoke',kind:'gif',label:'烟雾 GIF',gif:'smoke',x:4,y:14,w:70,vis:true,
      cropX:0,cropY:0,cropW:100,cropH:100,f0:0,f1:null,speed:1}
  ]},
 {id:'seg2',name:'2 · 丝带飘',bg:'assets/materials/bg.png',
  layers:[
   {id:'cabinet',kind:'img',label:'柜子',src:'assets/materials/cabinet.png',x:34,y:40,w:20,vis:true},
   {id:'mirror',kind:'img',label:'镜子',src:'assets/materials/mirror.png',x:58,y:26,w:8,vis:true},
   {id:'ribbon',kind:'gif',label:'丝带 GIF',gif:'ribbon',x:20,y:18,w:60,vis:true,
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
function frameURL(gif,f){ return 'assets/gifs/'+gif+'/frames/f'+String(f).padStart(4,'0')+'.png'; }
function getFrame(gif,f){
  const k=gif+'_'+f;
  if(!frameCache[k]){ const im=new Image(); im.src=frameURL(gif,f); frameCache[k]=im; }
  return frameCache[k];
}
async function loadMeta(){
  for(const g in GIFTOTAL){
    try{ const m=await (await fetch('assets/gifs/'+g+'/meta.json')).json();
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
    let box={x:L.x,y:L.y,w:L.w};
    if(L.follow && mirror){ box={x:mirror.x,y:mirror.y,w:mirror.w}; L.x=mirror.x;L.y=mirror.y;L.w=mirror.w; }
    const mw=box.w/100*W, mh=mw*(imgs['assets/materials/mirror.png']?imgs['assets/materials/mirror.png'].height/imgs['assets/materials/mirror.png'].width:1.6);
    const mx=box.x/100*W, my=box.y/100*H;
    const ix=L.inset/100*Math.min(mw,mh);   // 内缩
    const ax=mx+ix, ay=my+ix, aw=mw-2*ix, ah=mh-2*ix;
    if(aw<=0||ah<=0) return;
    ctx.save(); roundRect(ax,ay,aw,ah,aw*0.10); ctx.clip();
    const im=photo.img||(photo.img=new Image()); 
    if(im.src!==photo.url){im.src=photo.url;}
    if(im.complete&&im.naturalWidth){ ctx.drawImage(im,ax,ay,aw,ah); }
    ctx.restore();
  }else if(L.kind==='gif'){
    const g=GIFTOTAL[L.gif]; if(!g) return;
    const fi=(gifAnim[L.id]&&gifAnim[L.id].f)||0;
    const im=getFrame(L.gif, fi);
    // 裁切(相对原帧 %)
    const fw=im.width||(960), fh=im.height||(540);
    const sx=L.cropX/100*fw, sy=L.cropY/100*fh, sw=L.cropW/100*fw, sh=L.cropH/100*fh;
    const dh=dw*sh/sw;
    ctx.drawImage(im,sx,sy,sw,sh, dx,dy,dw,dh);
  }
}
function draw(){
  const bg=imgs[SEG[seg].bg];
  if(bg) ctx.drawImage(bg,0,0,cv.width,cv.height); else ctx.fillStyle='#000',ctx.fillRect(0,0,cv.width,cv.height);
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
function buildPanel(){
  const box=$('layers'); box.innerHTML='';
  SEG[seg].layers.forEach((L,idx)=>{
    const el=document.createElement('div'); el.className='layer'+(idx===sel?' sel':'');
    const kindtxt = L.kind==='gif'?('GIF/'+GIFTOTAL[L.gif]+'帧'):L.kind==='photo'?'照片':L.kind==='img'?'图片':'';
    el.innerHTML=`<div class="lhead"><input type="checkbox" ${L.vis?'checked':''}><b>${L.label}</b><span>${kindtxt}</span></div>`;
    el.onclick=(ev)=>{ if(ev.target.tagName==='INPUT') return; sel=idx; buildPanel(); };
    const cb=el.querySelector('input[type=checkbox]');
    cb.onchange=()=>{L.vis=cb.checked; el.className='layer'+(idx===sel?' sel':'');};
    if(idx===sel){
      const add=elm=>el.appendChild(elm);
      add(sliderRow('X %',+(L.x).toFixed(1),-60,160,0.5,v=>{L.x=v;}));
      add(sliderRow('Y %',+(L.y).toFixed(1),-60,160,0.5,v=>{L.y=v;}));
      add(sliderRow('宽 %',+(L.w).toFixed(1),1,200,0.5,v=>{L.w=v;}));
      if(L.kind==='gif'){
        const wrap=document.createElement('div'); wrap.className='giftitle';
        wrap.textContent='— GIF 裁切 / 帧 / 速度 —'; el.appendChild(wrap);
        add(sliderRow('裁X %',L.cropX,0,100,1,v=>L.cropX=v));
        add(sliderRow('裁Y %',L.cropY,0,100,1,v=>L.cropY=v));
        add(sliderRow('裁宽 %',L.cropW,1,100,1,v=>L.cropW=v));
        add(sliderRow('裁高 %',L.cropH,1,100,1,v=>L.cropH=v));
        const g=GIFTOTAL[L.gif];
        const fr=document.createElement('div'); fr.className='lrow';
        fr.innerHTML=`<label>帧</label><input type="number" class="f0" min="0" max="${g-1}" value="${L.f0||0}">~<input type="number" class="f1" min="0" max="${g-1}" value="${L.f1==null?g-1:L.f1}">`;
        el.appendChild(fr);
        fr.querySelector('.f0').onchange=e=>L.f0=Math.min(Math.max(0,+e.target.value),g-1);
        fr.querySelector('.f1').onchange=e=>L.f1=Math.min(Math.max(0,+e.target.value),g-1);
        add(sliderRow('速度',L.speed,0.1,20,0.1,v=>L.speed=v));
      }
      if(L.kind==='photo'){
        add(sliderRow('镜内缩 %',L.inset,0,40,0.5,v=>L.inset=v));
      }
    }
    box.appendChild(el);
  });
  if(SEG[seg].layers.some(l=>l.kind==='photo')){
    const note=document.createElement('p'); note.className='hint';
    note.textContent='照片默认贴在镜子内侧（内缩可调）；要放别处可拖动 X/Y/宽。';
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
  const state={ seg:SEG.map(s=>JSON.parse(JSON.stringify(s.layers))), photoName:photo.name, photoUrl:photo.url||null };
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
  $('btnSave').onclick=saveAll;
  $('btnExport').onclick=()=>{
    const data={seg:SEG.map(s=>({name:s.name,bg:s.bg,layers:s.layers})), photo:photo.name};
    const a=document.createElement('a');a.href='data:application/json;charset=utf-8,'+encodeURIComponent(JSON.stringify(data,null,1));
    a.download='wornin_project.json';a.click();
  };
  $('btnImport').onclick=()=>$('importFile').click();
  $('importFile').onchange=e=>{
    const f=e.target.files[0]; if(!f) return;
    const rd=new FileReader(); rd.onload=()=>{
      try{ const d=JSON.parse(rd.result); if(d.seg&&d.seg.length===SEG.length){
        d.seg.forEach((s,i)=>{ if(s.layers) SEG[i].layers=mergeLayers(s.layers,SEG[i].layers); });
        buildPanel(); toast('已导入并合并配置 ✓');
      } }catch(err){ alert('导入失败'); }
    }; rd.readAsText(f);
  };
  $('btnPhoto').onclick=()=>$('photoFile').click();
  $('photoFile').onchange=e=>{
    const f=e.target.files[0]; if(!f) return;
    const rd=new FileReader(); rd.onload=()=>{ photo.url=rd.result; photo.name=f.name; photo.img=new Image(); photo.img.onload=()=>{}; photo.img.src=rd.result;
      const p=SEG[0].layers.find(l=>l.id==='photo'); if(p){p.vis=true;} buildPanel(); }; rd.readAsDataURL(f);
  };
}

/* ---- 启动 ---- */
(async function(){
  loadSaved();
  await preloadStatic();
  await loadMeta();
  buildPanel(); segTabs(); bindTools(); bgSize();
  requestAnimationFrame(step);
})();
