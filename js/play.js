/* ============================================================
   play.js — Worn-In「旧衣·新香」交互播放主逻辑
   依据 结构设计_WornIn.md 定稿 + 用户调校 wornin_project.json
   ============================================================ */
'use strict';
const $=id=>document.getElementById(id);
const cv=$('cv'), ctx=cv.getContext('2d');
const sleep=ms=>new Promise(r=>setTimeout(r,ms));
const clone=o=>JSON.parse(JSON.stringify(o));

/* ---------- 音效钩子：先静音占位，真实音频稍后放入 assets/sfx/ ---------- */
const SFX={
  _ctx:null,
  play(name){ /* 将来: new Audio('assets/sfx/'+name+'.mp3').play() 替换此占位 */ }
};

const KEY_SAVE='wornin_openai_key';
let CFG=null;
let SEG=null;
const IMGS={}, META={}, FRAMES={};
let photo={url:null,name:null,img:null,crop:null};
let AI=null;
const DEMO=location.search.includes('demo');

/* ---------- 通用 ---------- */
function toast(msg){const t=$('toast');t.textContent=msg;t.classList.add('show');setTimeout(()=>t.classList.remove('show'),2200);}
function loadImg(url){return new Promise(r=>{const i=new Image();i.onload=()=>r(i);i.onerror=()=>r(null);i.src=url;});}
const GIFV='4';
function frameURL(gif,f){return 'assets/gifs/'+gif+'/frames/f'+String(f).padStart(4,'0')+'.png?v='+GIFV;}
function getFrame(gif,f){const k=gif+'_'+f;if(!FRAMES[k]){const im=new Image();im.onload=()=>{const e=FRAMES[k]; if(e) e.ready=true;};im.src=frameURL(gif,f);FRAMES[k]=im;}return FRAMES[k];}
function sumDelays(gif,f0,f1,speed){
  const m=META[gif]; if(!m) return 1000;
  const e=(f1==null||f1>=m.frames)?m.frames-1:f1, s=Math.min(f0||0,e);
  let t=0; for(let i=s;i<=e;i++) t+=(m.delays&&m.delays[i])||80;
  return t/Math.max(0.05,speed||1);
}

/* ---------- 加载 ---------- */
async function preloadStatic(){
  for(const s of CFG.seg){
    if(!IMGS[s.bg]) IMGS[s.bg]=await loadImg(s.bg);
    for(const L of s.layers) if(L.kind==='img'&&!IMGS[L.src]) IMGS[L.src]=await loadImg(L.src);
  }
}
async function loadMetaAll(){
  for(const g of ['smoke','ribbon','cabinet_open','yarn_liquid','glitter']){
    try{ const m=await (await fetch('assets/gifs/'+g+'/meta.json?v='+GIFV)).json(); META[g]={delays:m.delays,frames:m.frames}; }
    catch(e){ console.warn('meta',g,e); }
  }
}

/* ---------- 画布几何（全段同一竖版比例） ---------- */
let W=1200,H=1703;
function fitCanvas(){
  const bg=IMGS[CFG.seg[0].bg];
  if(bg){ W=1200; H=Math.round(1200*bg.height/bg.width); }
  cv.width=W; cv.height=H;
}
function canvasRect(){return cv.getBoundingClientRect();}
function clearFX(){ $('fx').innerHTML=''; }
function hint(text,mini){ const h=$('hud'); h.innerHTML=text?('<div class="hint">'+text+'</div>'+(mini?'<div class="mini">'+mini+'</div>':'')):''; }
function bottom(html){ const b=$('bottomBar'); if(html==null){b.classList.add('hidden');b.innerHTML='';return;} b.innerHTML=html; b.classList.remove('hidden'); }

/* ============================================================
   绘制
   ============================================================ */
const SVGFRAMES={ball:[],liquid:[]};   // 段4矢量帧：原始 SVG 文本
const SVGIMG={};                       // 'ball|hex|f' -> Image
function hexRGB(h){ const m=/^#?([0-9a-f]{6})$/i.exec(h||''); if(!m) return null;
  return {r:parseInt(m[1].slice(0,2),16),g:parseInt(m[1].slice(2,4),16),b:parseInt(m[1].slice(4,6),16)}; }
// 舒适化：明度 >0.72 压缩；饱和度 >0.70 大幅降（克莱因蓝等艳色靠这步）
function comfortHex(hx){
  const t=hexRGB(hx); if(!t) return hx;
  const r=t.r/255,g=t.g/255,b=t.b/255;
  const mx=Math.max(r,g,b), mn=Math.min(r,g,b), d=mx-mn;
  let h=0,s=0; const l=(mx+mn)/2;
  if(d>1e-6){
    s = l<0.5 ? d/(mx+mn) : d/(2-mx-mn);
    if(mx===r) h=((g-b)/d+(g<b?6:0))/6;
    else if(mx===g) h=((b-r)/d+2)/6;
    else h=((r-g)/d+4)/6;
  }
  const l2 = l<=0.72 ? l : 0.72+(l-0.72)*0.30;
  const s2 = s<=0.70 ? s*0.92 : 0.55+(s-0.70)*0.30;
  let r2,g2,b2;
  if(s2<=1e-6){ r2=g2=b2=l2; }
  else{
    const q = l2<0.5 ? l2*(1+s2) : l2+s2-l2*s2, p=2*l2-q;
    const f=t=>{ if(t<0)t+=1; if(t>1)t-=1;
      return t<1/6?p+(q-p)*6*t : t<1/2?q : t<2/3?p+(q-p)*(2/3-t)*6 : p; };
    r2=f(h+1/3); g2=f(h); b2=f(h-1/3);
  }
  return '#'+[r2,g2,b2].map(v=>Math.round(v*255).toString(16).padStart(2,'0')).join('');
}
function roundRect(x,y,w,h,r){ctx.beginPath();ctx.moveTo(x+r,y);ctx.arcTo(x+w,y,x+w,y+h,r);ctx.arcTo(x+w,y+h,x,y+h,r);ctx.arcTo(x,y+h,x,y,r);ctx.arcTo(x,y,x+w,y,r);ctx.closePath();}

/* ---- 段4：毛球/液面用矢量 SVG 帧 + fill 染色（丝滑、不卡、不闪） ---- */
let svgLoadPromise=null;
async function loadSvgFrames(){
  const load=(folder,n,arr)=>{
    const prefix = folder==='yarn_ball' ? 'yarn_ball_' : 'liquid_';
    const tasks=[];
    for(let i=0;i<n;i++){
      const name=prefix+String(i+1).padStart(2,'0');
      tasks.push(fetch('assets/svg/'+folder+'/'+name+'.svg?v='+GIFV).then(r=>r.text()).then(t=>{arr[i]=t;}).catch(()=>{}));
    }
    return Promise.all(tasks);
  };
  await Promise.all([load('yarn_ball',52,SVGFRAMES.ball), load('liquid',50,SVGFRAMES.liquid)]);
}
function ensureSvgFrames(){ if(!svgLoadPromise) svgLoadPromise=loadSvgFrames(); return svgLoadPromise; }
function svgImg(base,f,hex){
  const key=base+'|'+(hex||'')+'|'+f;
  if(SVGIMG[key]) return SVGIMG[key];
  let t=SVGFRAMES[base]&&SVGFRAMES[base][f]; if(!t) return null;
  if(hex){ t=t.replace(/fill="#(?:ffffff|f4f1e9)"/gi,'fill="'+hex+'"'); }
  const url=URL.createObjectURL(new Blob([t],{type:'image/svg+xml'}));
  const im=new Image(); im.src=url; SVGIMG[key]=im;
  return im;
}
function drawYarnSVG(L,f,hex){
  const s=CFG.seg[3];
  const gx=s.grpX||0, gy=s.grpY||0, gs=(s.grpW!=null?s.grpW:100)/100;
  const dw=(L.w*gs)/100*W;                    // 瓶宽（受整体缩放）
  const ddx=(L.x+gx)/100*W, ddy=(L.y+gy)/100*H;   // 瓶左上角（受整体偏移）
  const ga=gifState[L.id], end=(ga&&ga.end)||529;
  const bf=Math.min(51,Math.max(0,Math.round(f*51/end)));
  const lf=Math.min(49,Math.max(0,Math.round(f*49/end)));
  const bim=svgImg('ball',bf,hex), lim=svgImg('liquid',lf,hex);
  // 球：ballX 中心横向偏移、ballY 向下、ballW 大小（单位均为瓶宽 %）
  const bw=((L.ballW!=null?L.ballW:62)/100)*dw;
  const bxc=ddx+((L.ballX!=null?L.ballX:50)/100)*dw;
  if(bim&&bim.complete&&bim.naturalWidth){
    ctx.drawImage(bim, bxc-bw/2, ddy+((L.ballY!=null?L.ballY:0)/100)*dw, bw, bw);
  }
  // 液面：liqX 中心横向偏移、liqY 向下、liqW 宽（单位均为瓶宽 %）
  const lw=((L.liqW!=null?L.liqW:96)/100)*dw;
  const lxc=ddx+((L.liqX!=null?L.liqX:50)/100)*dw;
  if(lim&&lim.complete&&lim.naturalWidth){
    const lh=lw*(378/352);
    ctx.drawImage(lim, lxc-lw/2, ddy+((L.liqY!=null?L.liqY:45)/100)*dw, lw, lh);
  }
}

function drawLayer(L,st){
  if(L.vis===false && L.kind!=='photo') return;   // 照片层由 photo.url / showPhoto 控制，不看 vis
  if(L.id==='mirror' && st.hideMirror) return;
  const dx=L.x/100*W, dy=L.y/100*H, dw=L.w/100*W;
  if(L.kind==='img'){
    const im=IMGS[L.src]; if(!im) return;
    const dh=dw*im.height/im.width;
    let oa=1,os=1,ox=0,oy=0;
    if(st.mirrorOff && L.id==='mirror'){ ox=st.mirrorOff.dx*W; oy=st.mirrorOff.dy*H; oa=st.mirrorOff.alpha; os=st.mirrorOff.scale||1; }
    if(oa<=0.02) return;
    ctx.save(); ctx.globalAlpha=oa;
    if(ox||oy||os!==1){ ctx.translate(dx+dw/2,dy+dh/2); ctx.scale(os,os); ctx.translate(-(dx+dw/2),-(dy+dh/2)); ctx.translate(ox,oy); }
    ctx.drawImage(im,dx,dy,dw,dh); ctx.restore();
  }else if(L.kind==='photo'){
    if(!photo.img||!photo.url||st.showPhoto===false) return;
    const mirL=SEG[st.segIdx].find(l=>l.id==='mirror');
    const mir=IMGS[mirL.src]||{height:437,width:271};
    let mx=dx,my=dy,mw=dw;
    if(L.follow&&mirL){ mx=mirL.x/100*W; my=mirL.y/100*H; mw=mirL.w/100*W; }
    const mh=mw*mir.height/mir.width;
    let oa=1,os=1,ox=0,oy=0;
    if(st.mirrorOff){ ox=st.mirrorOff.dx*W; oy=st.mirrorOff.dy*H; oa=st.mirrorOff.alpha; os=st.mirrorOff.scale||1; }
    if(oa<=0.02) return;
    ctx.save(); ctx.globalAlpha=oa;
    if(ox||oy||os!==1){ ctx.translate(mx+mw/2,my+mh/2); ctx.scale(os,os); ctx.translate(-(mx+mw/2),-(my+mh/2)); ctx.translate(ox,oy); }
    // 照片框（相对镜面，%，可在编辑器手动调）
    const bx0=L.mx!=null?L.mx:9.2, by0=L.my!=null?L.my:6.2;
    const bw=L.mw!=null?L.mw:80.1, bh=L.mh!=null?L.mh:73.0;
    const ax=mx+bx0/100*mw, ay=my+by0/100*mh, aw=bw/100*mw, ah=bh/100*mh;
    if(aw>0&&ah>0){ ctx.save(); roundRect(ax,ay,aw,ah,aw*0.08); ctx.clip();
      const pim=photo.img, iw=pim.naturalWidth, ih=pim.naturalHeight;
      const zoom=(L.zoom!=null?L.zoom:100)/100;
      const sc=Math.max(aw/iw, ah/ih)*zoom; const pdw=iw*sc, pdh=ih*sc;
      ctx.drawImage(pim, ax+(aw-pdw)/2, ay+(ah-pdh)/2, pdw, pdh);
      ctx.restore(); }
    ctx.restore();
  }else if(L.kind==='gif'){
    if(skipGif.has(L.id)) return;
    const g=META[L.gif]; if(!g) return;
    const ga=gifState[L.id]; if(!ga||ga.f==null) return;
    const f=Math.min(ga.f,g.frames-1);
    // 毛线球/液面：矢量 SVG 帧 + fill 染色（丝滑不闪）
    if(L.id.startsWith('yarn') && SVGFRAMES.ball.length){
      drawYarnSVG(L, f, (st.yarnTint&&st.yarnTint[L.id])||null);
      return;
    }
    const im=getFrame(L.gif,f);
    if(!im.complete||!im.naturalWidth) return;   // 帧未加载完，等下一帧
    const fw=im.naturalWidth,fh=im.naturalHeight;
    const cx=L.cropX||0, cy=L.cropY||0, cw=L.cropW==null?100:L.cropW, ch=L.cropH==null?100:L.cropH;
    const sx=cx/100*fw, sy=cy/100*fh, sw=cw/100*fw, sh=ch/100*fh;
    const dh=dw*fh/fw;                                             // 完整素材框（位置固定）
    const ddx=dx+cx/100*dw, ddy=dy+cy/100*dh, ddw=cw/100*dw, ddh=ch/100*dh;   // 框内保留区
    ctx.drawImage(im, sx,sy,sw,sh, ddx,ddy,ddw,ddh);
  }
}
function drawScene(segIdx,st){
  ctx.clearRect(0,0,W,H);
  const segDef=CFG.seg[segIdx];
  const bg=IMGS[segDef.bg];
  if(bg){
    const bx=(segDef.bgX||0)/100*W, by=(segDef.bgY||0)/100*H, bw=(segDef.bgW!=null?segDef.bgW:100)/100*W;
    ctx.drawImage(bg,bx,by,bw,bw*bg.height/bg.width);
  } else { ctx.fillStyle='#000'; ctx.fillRect(0,0,W,H); }
  const base=Object.assign({segIdx},st);
  for(const L of SEG[segIdx]) drawLayer(L,base);
}

/* ============================================================
   GIF 层
   ============================================================ */
const gifState={};
function playGifLayer(L,loops,cb){
  const m=META[L.gif]; if(!m){ cb&&cb(); return; }
  const end=L.f1==null?m.frames-1:Math.min(L.f1,m.frames-1);
  const start=Math.min(L.f0||0,end);
  gifState[L.id]={f:start,acc:0,play:true,start,end,loops:loops||1,cb:cb||null};
  preload(L.gif,start,end,8);
}
function stopGifLayer(id){ const a=gifState[id]; if(a){ a.play=false; a.cb=null; } }
function preload(gif,from,to,n){
  for(let i=0;i<n;i++){ const f=Math.min(from+i,to); getFrame(gif,f); }
}
function stepGifs(dt){
  for(const segArr of SEG) for(const L of segArr){
    if(L.kind!=='gif') continue;
    const a=gifState[L.id]; if(!a||!a.play) continue;
    const m=META[L.gif];
    const delay=((m.delays&&m.delays[a.f])||80)/Math.max(0.05,L.speed||1);
    a.acc+=dt; let guard=0;
    while(a.acc>=delay&&guard<30){
      a.acc-=delay; a.f++; guard++;
      if(a.f>a.end){
        if(a.loops-1<=0){ a.f=a.end; a.loops=0; a.play=false; if(a.cb){const cb=a.cb;a.cb=null;cb();} break; }
        a.f=a.start; a.loops--;
      }
    }
    preload(L.gif,a.f,a.end,4);
  }
}

/* ============================================================
   相位 & 场景映射
   ============================================================ */
const P={TREM:0,SMOKE:1,MTREM:2,RIB:3,DOOR:4,YARN:5,FINAL:6};
let phase=P.TREM;
let tremble=0;      // 颤动偏移(逻辑px 横)
let mirJit=0, mirOn=false;
const skipGif=new Set();   // 播完一次后不再显示的 gif 层
let yarnTint={};    // layerId -> hex
let analyzePromise=null;

function begin(p){ phase=p; }
let last=performance.now(),raf=0;
function loop(t){
  const dt=Math.min(60,t-last); last=t;
  mirJit=mirOn?Math.sin(t/420)*7:0;
  stepGifs(dt); draw();
  raf=requestAnimationFrame(loop);
}
function draw(){
  ctx.save();
  if(tremble){ ctx.translate(tremble,0); }
  switch(phase){
    case P.TREM:
    case P.SMOKE: drawScene(0,{showPhoto:false}); break;
    case P.MTREM: drawScene(0,{showPhoto:!!photo.url, mirrorOff:{dx:0, dy:mirJit/H, alpha:1, scale:1}}); break;
    case P.RIB:   drawScene(1,{showPhoto:true}); break;
    case P.DOOR:  drawScene(2,{showPhoto:false}); break;
    case P.YARN:
    case P.FINAL: drawScene(3,{showPhoto:false, yarnTint}); break;
  }
  ctx.restore();
}

/* 颤动一次 */
function trembleAnim(ms){ return new Promise(res=>{
  const t0=performance.now();
  (function k(){ const p=Math.min(1,(performance.now()-t0)/ms);
    tremble=p<1?Math.sin(p*Math.PI*9)*(1-p)*3.2:0;
    if(p<1) requestAnimationFrame(k); else { tremble=0; res(); } })(); });
}

/* ============================================================
   总流程
   ============================================================ */
async function runAll(replay){
  resetAll(replay);
  await begin(P.TREM); SFX.play('tremble'); hint('衣橱轻轻颤动…'); await trembleAnim(780); await sleep(200);
  // 烟雾①（段1，播完一次即隐藏）
  await begin(P.SMOKE); hint(null);
  const smoke=SEG[0].find(l=>l.kind==='gif'&&l.gif==='smoke');
  if(smoke){ await playOnce(smoke); skipGif.add(smoke.id); } else await sleep(2500);
  await sleep(300);
  if(replay){
    // 重播：保留照片与结果，跳过点击/拍照/AI
    await begin(P.MTREM); hint('旧衣新香，再次为你调香…','✨'); await sleep(1600);
  }else{
    // 镜子颤抖等点击 → 拍照/上传 → 顾客确认后才继续
    let uploaded=false;
    while(!uploaded){
      await begin(P.MTREM); hint(null);
      await waitMirrorClick();
      const r=await shootFlow();
      uploaded=(r==='ok');
    }
    analyzePromise=runAI();   // 后台 AI（段2/段3 期间分析，不显示提示）
  }
  // 丝带②
  await begin(P.RIB); hint(null);
  const glitter=SEG[1].find(l=>l.kind==='gif'&&l.gif==='glitter');
  if(glitter) playGifLayer(glitter, Infinity);
  const rib=SEG[1].find(l=>l.kind==='gif'&&l.gif==='ribbon');
  if(rib) await playOnce(rib); else await sleep(2200);
  if(glitter) stopGifLayer(glitter.id);
  // 颤柜 → 开门（段3：门先定格在关闭→颤→开）
  await begin(P.DOOR); hint(null); SFX.play('tremble');
  const door=SEG[2].find(l=>l.kind==='gif'&&l.gif==='cabinet_open');
  if(door){
    const g=META[door.gif]; const end=door.f1==null?g.frames-1:Math.min(door.f1,g.frames-1);
    const st0=Math.min(door.f0||0,end);
    gifState[door.id]={f:st0,acc:0,play:false,start:st0,end,loops:1,cb:null};
    preload(door.gif,st0,end,10);
    await trembleAnim(650);
    await new Promise(res=>{ gifState[door.id].cb=res; gifState[door.id].play=true; });
  } else { await trembleAnim(650); await sleep(2000); }
  // 等 AI（段2+段3 一般已好；没好则显示 loading）
  await waitAI();
  // 段4 毛球染液 + 飘 8 行
  await yarnFlow();
  // final
  await begin(P.FINAL); clearFX(); hint(null);
  showSpiceTags();
  bottom('<button onclick="PLAY.retry()">🔄 再试一次</button><button class="ghost" onclick="PLAY.reshoot()">👕 换一件衣服</button>');
}

function resetAll(replay){
  clearFX(); hint(null); bottom(null); hideCam(); hideAI();
  if(!replay){ AI=null; photo={url:null,name:null,img:null,crop:null}; }
  yarnTint={};
  mirOn=false; mirJit=0; tremble=0; skipGif.clear();
  for(const k in gifState) delete gifState[k];
  for(const k in SVGIMG) delete SVGIMG[k];
  $('aiLoading').classList.add('hidden');
}
function playOnce(L){ return new Promise(res=>{ playGifLayer(L,1,res); }); }

/* 等点击（命中镜子区域） */
function mirrorBox(){ const L=SEG[0].find(l=>l.id==='mirror'); return L; }
function waitMirrorClick(){
  if(DEMO){ mirOn=true; return sleep(900).then(()=>{ mirOn=false; }); }
  return new Promise(res=>{
    mirOn=true;
    const hit=e=>{
      const r=canvasRect(), L=mirrorBox();
      const lx=(e.clientX-r.left)/r.width*W, ly=(e.clientY-r.top)/r.height*H;
      const mir=IMGS[L.src]; const hw=(L.w/100*W)*(mir?mir.height/mir.width:1.6);
      if(lx>=L.x/100*W-30 && lx<=L.x/100*W+L.w/100*W+30 && ly>=L.y/100*H-30 && ly<=L.y/100*H+hw+40){
        mirOn=false;
        $('stageBox').removeEventListener('click',hit); res();
      }
    };
    $('stageBox').addEventListener('click',hit);
  });
}

/* ---------- 拍照流程 ---------- */
function shootFlow(){
  if(DEMO){
    toast('演示模式 · 自动使用示例照片');
    return makeDemoPhoto().then(()=>'ok');
  }
  return showCam();
}
function hideCam(){ $('camOverlay').classList.add('hidden'); }
function hideAI(){ $('aiLoading').classList.add('hidden'); }

/* ---------- AI ---------- */
async function waitAI(){
  if(!analyzePromise){ analyzePromise=runAI(); }
  if(AI) return;
  showAILoading('正在等待 AI 完成调香…');
  try{ await analyzePromise; }catch(e){ /* handled in runAI */ }
  hideAI();
}
async function runAI(){
  try{ AI = DEMO ? await exampleAI() : await analyzePhoto(); }
  catch(e){
    console.error('[AI]',e);
    AI = await askRetry(e);
  }
  return AI;
}
function askRetry(e){ return new Promise(res=>{
  showAILoading('AI 分析失败：'+(e&&e.message?e.message:'未知错误'));
  const box=document.createElement('div'); box.id='aiRetryWrap';
  box.innerHTML='<button id="aiRetryBtn">重试</button>';
  $('aiErr').appendChild(box);
  $('aiRetryBtn').onclick=async()=>{ hideAI(); res(await runAI()); };
}); }
function showAILoading(msg){ $('aiLoading').classList.remove('hidden'); $('aiText').textContent=msg; }
// 确保有 Key：没有就自动弹出输入框，填一次永久记住（不再报“没 key”）
function ensureKey(){
  const k=getKey(); if(k) return Promise.resolve(k);
  return new Promise(resolve=>{
    const kp=$('keyPanel'), inp=$('keyInput');
    kp.classList.remove('hidden'); inp.value=''; inp.focus();
    toast('请先填入 OpenAI API Key（只存本机浏览器）');
    const done=()=>{
      const v=inp.value.trim(); if(!v) return;
      setKey(v);
      $('keyHint').classList.remove('hidden');
      kp.classList.add('hidden');
      resolve(v);
    };
    $('keySave').onclick=done;
    inp.onkeydown=e=>{ if(e.key==='Enter') done(); };
  });
}

async function analyzePhoto(){
  const key=await ensureKey();
  if(!photo.crop) throw new Error('没有照片');
  const b64=photo.crop.toDataURL('image/jpeg',0.9).split(',')[1];
  const user='分析这张衣服照片，只输出一个 JSON，字段如下：\n'+
   '{"gar":"<款式>","fabric":"<材质>","pattern":"<印花>","collar":"<领口>","colors":[{"name":"<颜色名>","hex":"<#rrggbb>"},{"name":"<颜色名>","hex":"<#rrggbb>"},{"name":"<颜色名>","hex":"<#rrggbb>"}],"style":"<风格>"}\n'+
   '铁规则：\n'+
   '- 必须根据图片真实内容填写，禁止套用或照抄任何示例值（上面只是字段占位符）。\n'+
   '- colors 是「衣服本身」的 3 个主色，按所占面积从大到小；背景、头发、皮肤、环境一律不算衣服颜色。\n'+
   '- 每个 hex 必须是图片里衣服上真实出现的色值（不是凭空想象）。\n'+
   '- name 只能取：黑色|深灰|灰色|浅灰|白色|米色|米黄|驼色|卡其|棕色|深棕|藏青|深蓝|蓝色|天蓝|浅蓝|牛仔蓝|墨绿|橄榄绿|军绿|暗橄榄绿|绿色|浅绿|酒红|红色|玫红|粉色|浅粉|橙色|黄色|紫色|深紫|淡紫\n'+
   '- gar∈连衣裙|上衣|衬衫|外套|夹克|卫衣|毛衣|T恤|背心|长裤|短裤|半身裙|长裙|短裙|牛仔|其他\n'+
   '- 款式判断优先规则：只要看到是裙子/连身裙装（哪怕只拍到上半身、没拍到裙摆），一律判「连衣裙」；只有明显是分开的上衣+下装时才判「上衣」。\n'+
   '- fabric∈棉|丝绸/缎面|棉麻/亚麻|针织/毛衣|毛绒|牛仔|皮革|科技/运动面料|其他\n'+
   '- pattern∈纯色|条纹|格纹|波点|碎花|豹纹/动物纹|扎染|印花|无\n- collar∈圆领|V领|高领|方领|翻领|衬衫领|无领\n'+
   '- style∈野性风|甜美少女|运动风|办公风格|森系居家|晚礼服/名媛\n- 只输出 JSON，不要任何解释或注释。';
  const body={model:'gpt-4o-mini',temperature:0.2,response_format:{type:'json_object'},
    messages:[{role:'system',content:'你是服装调香师，看图后按要求只输出 JSON。'},{role:'user',content:[{type:'text',text:user},{type:'image_url',image_url:{url:'data:image/jpeg;base64,'+b64}}]}],
    max_tokens:800};
  let resp;
  try{ resp=await fetch('https://api.openai.com/v1/chat/completions',{method:'POST',headers:{'Content-Type':'application/json','Authorization':'Bearer '+key},body:JSON.stringify(body)}); }
  catch(e){ throw new Error('网络错误：'+(e.message||e)); }
  if(!resp.ok){ let t=''; try{t=await resp.text();}catch(_){} throw new Error('OpenAI '+resp.status+' '+(t||'').slice(0,160)); }
  const j=await resp.json();
  const content=((j.choices||[])[0]||{}).message||{}; const raw=(content.content||'').replace(/```json|```/g,'').trim();
  const g=JSON.parse(raw);
  return buildResult(g);
}
function buildResult(g){
  const styleName=(g.style||'').trim()==='晚礼服/名媛'?'晚礼服/名媛':(['野性风','甜美少女','运动风','办公风格','森系居家','晚礼服/名媛'].includes((g.style||'').trim())?(g.style).trim():'办公风格');
  const defs=COPY.STYLE_DEFS.find(s=>s.name===styleName)||COPY.STYLE_DEFS[3];
  const colors=(g.colors||[]).slice(0,3);
  while(colors.length<3) colors.push({name:'白色',hex:'#f2efe8'});
  const attr={color:(colors[0]||{}).name||'',print:g.pattern||'',fabric:g.fabric||'',garment:g.gar||''};
  const variant=COPY.pickVariant(styleName,attr);
  const rec=(COPY.RECIPES[styleName]&&COPY.RECIPES[styleName][variant])||{top:[],mid:[],base:[]};
  const copyRaw=COPY.makeCopy({style:defs,colors:colors.map(c=>c.name),gar:g.gar,fabric:g.fabric,pattern:g.pattern});
  const noteOf=s=>{
    if(!s) return -1;
    if((defs.top||[]).indexOf(s)>=0) return 0;
    if((defs.mid||[]).indexOf(s)>=0) return 1;
    if((defs.base||[]).indexOf(s)>=0) return 2;
    return -1;
  };
  const segLines=copyRaw.slice(1,6).map(m=>({t:m.t, s:m.s||'', bottle:noteOf(m.s)}));
  return {style:styleName,variant,recipe:rec,colors,gar:g.gar,fabric:g.fabric,pattern:g.pattern,collar:g.collar,copy:copyRaw.map(x=>x.t), segLines};
}
async function exampleAI(){
  return buildResult({gar:'连衣裙',fabric:'丝绸/缎面',pattern:'碎花',collar:'圆领',
    colors:[{name:'浅粉',hex:'#f0a6b8'},{name:'白色',hex:'#f2efe8'},{name:'浅灰',hex:'#cfd0d6'}],style:'甜美少女'});
}

/* ---------- 段4：毛球染液，每句涨1/5、句间随机涨1/5、最后补满 ---------- */
async function yarnFlow(){
  await begin(P.YARN); hint(null);
  const yarns=SEG[3].filter(l=>l.kind==='gif'&&l.id.startsWith('yarn'));
  if(!yarns.length){ await sleep(1200); return; }
  const g=META[yarns[0].gif]; if(!g){ await sleep(1200); return; }
  const start=Math.max(1, Math.min(yarns[0].f0||0, g.frames-1));   // 跳过毛球动画第1帧
  const end=yarns[0].f1==null?g.frames-1:Math.min(yarns[0].f1,g.frames-1);
  const totalFrames=Math.max(1,end-start+1);
  const stepF=totalFrames/5;                    // 每次涨 1/5
  const dur=sumDelays(yarns[0].gif,yarns[0].f0,yarns[0].f1,yarns[0].speed);
  const stepDur=Math.max(1100, dur/5*1.4);      // 放慢节奏
  // 染色（每瓶一个主色）
  yarnTint={};
  yarns.forEach((L,i)=>{ const hex=(AI.colors[i%3]||{}).hex; if(hex) yarnTint[L.id]=hex; });
  // 三瓶先冻结在起始帧
  yarns.forEach(L=>{ gifState[L.id]={f:start,acc:0,play:false,start,end,loops:1,cb:null}; });
  // 用矢量 SVG 帧（fill 染色），播放期零 CPU，不闪不卡
  await ensureSvgFrames();
  hint(null);
  const level=yarns.map(()=>0);
  const seg=(AI.segLines||[]).slice(0,5);
  while(seg.length<5) seg.push({t:'',s:'',bottle:-1});
  const assign=seg.map(l=>(l.bottle!=null&&l.bottle>=0&&l.bottle<=2)?l.bottle:-1);
  const fallback=assign.map(b=>b<0);
  assign.forEach((b,i)=>{ if(b<0) assign[i]=Math.floor(Math.random()*3); });
  balanceBottles(assign, fallback);
  // 步骤：句子→对应瓶涨；每两句之间随机一瓶也涨
  const steps=[];
  for(let i=0;i<5;i++){
    steps.push({line:seg[i], bottle:assign[i]});
    if(i<4) steps.push({line:null, bottle:Math.floor(Math.random()*3)});
  }
  for(const stp of steps){
    const b=stp.bottle;
    if(stp.line && stp.line.t){ SFX.play('sentence'); floatLine(stp.line.t, Math.max(1000, stepDur*0.85)); }
    const fromF=start+level[b]*stepF;
    const toF=Math.min(end, fromF+stepF);
    await animateYarnStep(yarns[b], fromF, toF, stepDur);
    level[b]=Math.min(5, level[b]+1);
  }
  // 收尾：没满的瓶一起补满（时长按剩余量比例）
  let maxRem=0;
  yarns.forEach((L,i)=>{ const rem=5-level[i]; if(rem>maxRem) maxRem=rem; });
  const fillDur=Math.max(900, maxRem*stepDur*0.8);
  await Promise.all(yarns.map(L=>animateYarnStep(L, gifState[L.id].f, end, fillDur)));
  await sleep(300);
}
// 均衡：每瓶至少1次、且最多2次（5句/3瓶 → 2/2/1）；优先挪动“随机兜底”的句子
function balanceBottles(a,fallback){
  const c=[0,0,0]; a.forEach(b=>c[b]++);
  for(let k=0;k<20;k++){
    const mx=c.indexOf(Math.max(c[0],c[1],c[2])), mn=c.indexOf(Math.min(c[0],c[1],c[2]));
    if(c[mx]-c[mn]<=1) break;
    let idx=-1;
    for(let i=a.length-1;i>=0;i--){ if(a[i]===mx&&fallback[i]){ idx=i; break; } }
    if(idx<0) for(let i=a.length-1;i>=0;i--){ if(a[i]===mx){ idx=i; break; } }
    if(idx<0) break;
    a[idx]=mn; c[mx]--; c[mn]++;
  }
}
function animateYarnStep(L,fromF,toF,durMs){
  const m=META[L.gif];
  const maxF=m?m.frames-1:0;
  return new Promise(res=>{
    const t0=performance.now();
    (function tick(){
      const p=Math.min(1,(performance.now()-t0)/durMs);
      const e=p<0.5?2*p*p:1-Math.pow(-2*p+2,2)/2;   // easeInOut 平滑
      const f=Math.round(fromF+(toF-fromF)*e);
      gifState[L.id].f=Math.max(0,Math.min(maxF,f));
      if(p<1) requestAnimationFrame(tick); else res();
    })();
  });
}
function floatLine(text,durMs){
  const el=document.createElement('div'); el.className='floatLine';
  const r=canvasRect();
  el.style.left=(r.left+r.width/2)+'px'; el.style.top=(r.top+r.height*0.16)+'px';
  el.style.animationDuration=(durMs||3200)+'ms';
  el.textContent=text; $('fx').appendChild(el);
  requestAnimationFrame(()=>el.classList.add('in'));
  setTimeout(()=>{ if(el.parentNode) el.parentNode.removeChild(el); },(durMs||3200)+150);
}
function showSpiceTags(){
  const tags=[['🌅 前调',(AI.recipe.top||[]).join(' · ')],['☀️ 中调',(AI.recipe.mid||[]).join(' · ')],['🌙 后调',(AI.recipe.base||[]).join(' · ')]];
  const yarns=SEG[3].filter(l=>l.kind==='gif'&&l.id.startsWith('yarn')).slice(0,3);
  const r=canvasRect();
  tags.forEach((tg,i)=>{
    const L=yarns[i]; if(!L) return;
    const cx=(L.x/100*W+L.w/100*W/2)/W, cy=(L.y/100*H)/H;
    const el=document.createElement('div'); el.className='spiceTag';
    el.innerHTML='<div class="nt">'+tg[0]+'</div><div class="sp">'+tg[1]+'</div>';
    $('fx').appendChild(el);
    el.style.left=(r.left+cx*r.width)+'px';
    el.style.top=(r.top+Math.max(0.03,cy-0.03)*r.height)+'px';
  });
}

/* ============================================================
   摄像头
   ============================================================ */
let camStream=null;
// 镜子从中心向外扩散消失、露出镜头：给 camOverlay 套一个从镜子中心扩张的径向遮罩
function mirrorWipe(){
  return new Promise(res=>{
    const ov=$('camOverlay');
    const r=canvasRect();
    const L=SEG[0].find(l=>l.id==='mirror');
    const mir=L&&IMGS[L.src];
    const mw=(L?L.w/100*W:0), mh=mw*(mir?mir.height/mir.width:1.6);
    const cx=r.left + (L?L.x/100*W:0) + mw/2;
    const cy=r.top + (L?L.y/100*H:0) + mh/2;
    const diag=Math.hypot(window.innerWidth, window.innerHeight);
    ov.classList.add('wiping');
    ov.style.setProperty('--cx', cx.toFixed(1)+'px');
    ov.style.setProperty('--cy', cy.toFixed(1)+'px');
    ov.style.setProperty('--r', '0px');
    const t0=performance.now(), dur=850;
    (function tick(){
      const p=Math.min(1,(performance.now()-t0)/dur);
      const e=1-Math.pow(1-p,3);   // easeOut 扩散
      ov.style.setProperty('--r', (diag*e).toFixed(1)+'px');
      if(p<1) requestAnimationFrame(tick);
      else { ov.classList.remove('wiping'); ov.style.setProperty('--r','0px'); res(); }
    })();
  });
}
function showCam(){
  return new Promise(resolve=>{
    const ov=$('camOverlay'), v=$('video'), shot=$('photoShot');
    const cd=$('countdown'), num=$('countNum'), arc=$('cdArc');
    const doneBox=$('camDone'), ok=$('btnOk'), rk=$('btnRetake'), close=$('camClose');
    ov.classList.remove('hidden');
    let busy=false;
    const finish=()=>{ hideCam(); resolve('ok'); };
    const restartRing=()=>{ arc.style.animation='none'; void arc.offsetWidth; arc.style.animation=''; };
    async function shoot(first){
      if(busy) return; busy=true;
      shot.classList.add('hidden'); v.classList.remove('hidden'); doneBox.classList.add('hidden');
      const okCam=await startCam();
      if(!okCam){ toast('摄像头不可用，请允许权限后重拍'); busy=false; return; }
      if(first) await mirrorWipe();   // 镜子从中心向外扩散消失，露出镜头
      cd.classList.remove('hidden');
      for(let i=3;i>=1;i--){ num.textContent=i; restartRing(); await sleep(900); }
      cd.classList.add('hidden');
      // 先按竖屏构图把视频画进 shot，再关摄像头（关后再画会黑屏）
      const vw=v.videoWidth||640, vh=v.videoHeight||480;
      const aspect=1200/1703;               // 竖屏取景比例，与取景框一致
      let sw=vw, sh=vh;
      if(vw/vh>aspect){ sw=vh*aspect; } else { sh=vw/aspect; }
      const sx=(vw-sw)/2, sy=(vh-sh)/2;
      shot.width=Math.max(2,Math.round(sw)); shot.height=Math.max(2,Math.round(sh));
      shot.getContext('2d').drawImage(v, sx, sy, sw, sh, 0, 0, shot.width, shot.height);
      await stopCam();
      v.classList.add('hidden'); shot.classList.remove('hidden'); doneBox.classList.remove('hidden');
      busy=false;
    }
    ok.onclick=()=>{ acceptImage(shot.toDataURL('image/jpeg',0.9), finish); };
    rk.onclick=()=>shoot(false);
    close.onclick=async()=>{ await stopCam(); ov.classList.add('hidden'); resolve('cancelled'); };
    shoot(true);
  });
}
async function startCam(){
  const v=$('video');
  try{
    camStream=await navigator.mediaDevices.getUserMedia({video:{facingMode:'user',width:{ideal:720},height:{ideal:1280}},audio:false});
    v.srcObject=camStream; await v.play();
    return true;
  }catch(e){ console.warn('[cam]',e); return false; }
}
async function stopCam(){ if(camStream){ camStream.getTracks().forEach(t=>t.stop()); camStream=null; } }
function acceptImage(url,onReady){
  const im=new Image();
  im.onload=()=>{
    photo.url=url; photo.name='shot'; photo.img=im;
    const c=document.createElement('canvas');
    const sc=Math.min(1,1024/im.naturalWidth);
    c.width=Math.round(im.naturalWidth*sc); c.height=Math.round(im.naturalHeight*sc);
    c.getContext('2d').drawImage(im,0,0,c.width,c.height);
    photo.crop=c;
    if(onReady) onReady();
  };
  im.src=url;
}
async function makeDemoPhoto(){
  const c=document.createElement('canvas'); c.width=640; c.height=900;
  const x=c.getContext('2d');
  x.fillStyle='#f6e7d8'; x.fillRect(0,0,640,900);
  x.fillStyle='#f0a6b8'; x.fillRect(130,160,380,460);
  x.fillStyle='#eceef2'; x.beginPath(); x.arc(320,180,66,0,7); x.fill();
  x.fillStyle='#e0c9a6'; x.fillRect(150,720,140,70);
  const url=c.toDataURL('image/jpeg',0.9);
  await acceptImage(url,null);
}

/* ============================================================
   Key 设置 + 对外接口
   ============================================================ */
function getKey(){ try{ return localStorage.getItem(KEY_SAVE)||window.WORNIN_API_KEY||''; }catch(e){ return ''; } }
function setKey(k){ try{ localStorage.setItem(KEY_SAVE,k); }catch(e){} }
function bindSettings(){
  const kp=$('keyPanel');
  const gear=document.createElement('button'); gear.textContent='⚙';
  gear.style.cssText='position:fixed;top:8px;right:8px;z-index:90;background:rgba(40,34,26,.7);border:1px solid #5a4f42;color:#e8dcc8;border-radius:50%;width:36px;height:36px;cursor:pointer;font-size:17px';
  gear.title='OpenAI Key';
  gear.onclick=()=>{ kp.classList.toggle('hidden'); if(!kp.classList.contains('hidden')) $('keyInput').value=getKey(); };
  document.body.appendChild(gear);
  $('keySave').onclick=()=>{ setKey($('keyInput').value.trim()); const h=$('keyHint'); h.classList.remove('hidden'); setTimeout(()=>h.classList.add('hidden'),1800); };
  if(DEMO) gear.style.display='none';
}

const PLAY={
  retry(){ runAll(true); },
  reshoot(){ runAll(false); },
  phase:()=>phase, demo:DEMO,
  getResult:()=>AI,
  // 调试：直接用 dataURL 跑一次真实 AI 分析，返回 {style,variant,recipe,colors,...,copy}
  async analyzeDebug(dataUrl){
    const im=new Image();
    await new Promise((res,rej)=>{ im.onload=res; im.onerror=rej; im.src=dataUrl; });
    const c=document.createElement('canvas');
    const sc=Math.min(1,1024/im.naturalWidth);
    c.width=Math.max(1,Math.round(im.naturalWidth*sc)); c.height=Math.max(1,Math.round(im.naturalHeight*sc));
    c.getContext('2d').drawImage(im,0,0,c.width,c.height);
    photo.crop=c;
    const r=await analyzePhoto();
    AI=r;
    return r;
  },
};
window.PLAY=PLAY;

/* ---------- 启动 ---------- */
(async function(){
  try{ const r=await fetch('wornin_project.json?v='+Date.now()); CFG=await r.json(); }
  catch(e){ console.error('config',e); }
  if(!CFG) return;
  bindSettings();
  await loadMetaAll(); await preloadStatic();
  fitCanvas();
  SEG=CFG.seg.map(s=>clone(s.layers));
  // 让丝带段(1)也带照片层（跟随它的镜；拍摄后镜内显示衣物照并随镜消失）
  const ph=SEG[0].find(l=>l.kind==='photo');
  if(ph && !SEG[1].some(l=>l.kind==='photo')){
    const mi=SEG[1].findIndex(l=>l.id==='mirror'&&l.vis!==false);
    if(mi>=0) SEG[1].splice(mi+1,0,clone(ph));   // 照片紧跟镜子，丝带/闪粉在照片之上
    else SEG[1].push(clone(ph));
  }
  raf=requestAnimationFrame(loop);
  // 猫眼门放行后才真正开始
  let started=false;
  window.__startWornIn=()=>{ if(started) return; started=true; if(DEMO) toast('演示模式 · 自动跑完整流程'); runAll(false); };
  if(!document.getElementById('catGate')) window.__startWornIn();
  else if(window.__unlocked) window.__startWornIn();
})();
