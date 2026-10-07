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
const DEMO=false; // demo 已关闭：始终走真实拍照 + 真实 AI（OpenAI key）

/* ---------- 通用 ---------- */
function toast(msg){const t=$('toast');t.textContent=msg;t.classList.add('show');setTimeout(()=>t.classList.remove('show'),2200);}
function loadImg(url){return new Promise(r=>{const i=new Image();i.onload=()=>r(i);i.onerror=()=>r(null);i.src=url.startsWith('data:')?url:url+(url.includes('?')?'':'?v='+MATV);});}
const MATV='2';
const GIFV='9';
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
  for(const g of ['smoke','ribbon','cabinet_open','yarn_liquid','glitter','drawer_open','card_out','bottle_out','smoke_mirror']){
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
  // 液面下降模式：球固定在满液帧（忽略毛球），液体由 lowerLiquidF（0~49）驱动
  const bf=lowerLiquidF!=null ? 51 : Math.min(51,Math.max(0,Math.round(f*51/end)));
  const lf=lowerLiquidF!=null ? Math.max(0,Math.min(49,Math.round(lowerLiquidF))) : Math.min(49,Math.max(0,Math.round(f*49/end)));
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
const P={TREM:0,SMOKE:1,MTREM:2,RIB:3,DOOR:4,YARN:5,FINAL:6,DRAWER:7,BOTTLE:8};
let phase=P.TREM;
let tremble=0;      // 颤动偏移(逻辑px 横)
let mirJit=0, mirOn=false;
const skipGif=new Set();   // 播完一次后不再显示的 gif 层
let yarnTint={};    // layerId -> hex
let lowerLiquidF=null;   // 非 null：液面下降模式（液体帧 0~49，球固定满液帧）
let analyzePromise=null;
let garmentPromise=null;   // 后台生成服装纸艺拼贴图（gpt-image-1）

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
    case P.DRAWER: drawScene(4,{showPhoto:false, yarnTint}); break;
    case P.BOTTLE: drawScene(5,{showPhoto:false, yarnTint}); break;
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
  await begin(P.TREM); SFX.play('tremble'); hint('The wardrobe trembles…'); await trembleAnim(780); await sleep(200);
  // 烟雾①（段1，播完一次即隐藏）
  await begin(P.SMOKE); hint(null);
  const smoke=SEG[0].find(l=>l.kind==='gif'&&(l.gif==='smoke_mirror'||l.gif==='smoke'));
  if(smoke){ await playOnce(smoke); skipGif.add(smoke.id); } else await sleep(2500);
  if(replay){
    // 重播：保留照片与结果，跳过点击/拍照/AI
    await begin(P.MTREM); hint('Old clothes, new scent — blending again…','✨'); await sleep(1600);
  }else{
    // 烟雾散去后直接开摄像头（无需镜子漂浮/溶解过渡）
    let uploaded=false;
    while(!uploaded){
      const r=await shootFlow();
      uploaded=(r==='ok');
    }
    analyzePromise=runAI();   // 后台 AI（段2/段3 期间分析，不显示提示）
    garmentPromise=runGarmentImage();   // 后台生成服装纸艺拼贴图
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
  // 段4 毛球染液 + 飘 8 行（制香动画，泵转 1s 在 yarnFlow 内触发）
  await yarnFlow();
  // 试闻循环：结果界面（A/B modifier + 试闻·取香卡）→ 取香卡 → you like it?
  let liked=false;
  while(!liked){
    await begin(P.FINAL); clearFX(); hint(null);
    showSpiceTags();
    showModifiers();
    await askSmellCard();       // 单个按钮「试闻 · 取香卡」
    await drawerCard();         // 拉开抽屉 + 取香卡
    const like=await askLikeIt();
    liked = (like!=='dont');    // don't like → 回到结果界面重新调 modifier
  }
  // 询问是否 $35 买下
  const buy = await askBuy();
  if(buy){
    await showPay();                 // Chase 付款码 + 手动确认收到钱
    await lowerLiquid();             // 液面下降（三瓶一起倒放；泵转 2s 在 lowerLiquid 内）
    await drawerBottle();            // 拉开抽屉 + 取香水
  }
  // 结果长条 + 二维码占位 + 15 秒后回待机
  await showResultStrip();
}

function resetAll(replay){
  clearFX(); hint(null); bottom(null); hideCam(); hideAI();
  if(!replay){ AI=null; photo={url:null,name:null,img:null,crop:null}; garmentPromise=null; }
  yarnTint={};
  lowerLiquidF=null;
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
    toast('Demo mode · using a sample photo');
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
  showAILoading('Waiting for the AI to finish blending…');
  try{ await analyzePromise; }catch(e){ /* handled in runAI */ }
  hideAI();
}
/* ---------- 电脑泵桥接：AI 风格 → 本机 pump_bridge.py → ESP32 泵 ---------- */
const PUMP_MAP={wild:1,office:2,sweet:3,sporty:4,'natural/home':5,evening:6};
const PUMP_URL='/pump'; // 同源：本机或局域网其它设备打开，都打到这台电脑的 server.py
async function sendToPump(style, duration){
  const pump=PUMP_MAP[style];
  if(!pump){ console.warn('[pump] 未知风格:', style); return; }
  const d=Math.max(0.1, duration||1);
  try{
    const r=await fetch(PUMP_URL,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({style,pump,duration:d})});
    const j=await r.json();
    console.log('[pump]', j);
    if(j&&j.ok) toast('Sent to the machine: '+style+' → pump '+pump+' · '+d+'s');
  }catch(e){ console.warn('[pump] 桥接未启动或串口未接:', e.message); }
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
  showAILoading('AI analysis failed: '+(e&&e.message?e.message:'unknown error'));
  const box=document.createElement('div'); box.id='aiRetryWrap';
  box.innerHTML='<button id="aiRetryBtn">Retry</button>';
  $('aiErr').appendChild(box);
  $('aiRetryBtn').onclick=async()=>{ hideAI(); res(await runAI()); };
}); }
function showAILoading(msg){ $('aiLoading').classList.remove('hidden'); $('aiText').textContent=msg; }
// 确保有 Key：没有就自动弹出输入框，填一次永久记住（不再报“没 key”）
function ensureKey(){
  const k=getKey(); if(k) return Promise.resolve(k);
  return new Promise(resolve=>{
    const kp=$('keyPanel'), inp=$('keyInput'), closeBtn=$('keyClose');
    kp.classList.remove('hidden'); inp.value='';
    // 桌面端自动聚焦；移动端不聚焦，避免一进站就弹键盘挡住画面
    if(window.matchMedia && window.matchMedia('(pointer:fine)').matches){ try{ inp.focus(); }catch(e){} }
    toast('Please enter your OpenAI API key (stored in this browser only)');
    const done=()=>{
      const v=inp.value.trim(); if(!v) return;
      setKey(v);
      const h=$('keyHint'); h.classList.remove('hidden'); setTimeout(()=>h.classList.add('hidden'),1800);
      kp.classList.add('hidden');
      resolve(v);
    };
    // “稍后”：先关掉继续浏览，等真正需要调 AI 时再弹一次
    const skip=()=>{ kp.classList.add('hidden'); resolve(''); };
    $('keySave').onclick=done;
    if(closeBtn) closeBtn.onclick=skip;
    inp.onkeydown=e=>{ if(e.key==='Enter') done(); };
  });
}

async function analyzePhoto(){
  const key=await ensureKey();
  if(!photo.crop) throw new Error('No photo yet');
  const b64=photo.crop.toDataURL('image/jpeg',0.9).split(',')[1];
  const user='Analyse this clothing photo. Output ONE JSON object with exactly these fields:\n'+
   '{"gar":"<garment>","fabric":"<fabric>","pattern":"<pattern>","collar":"<collar>","colors":[{"name":"<colour name>","hex":"<#rrggbb>"},{"name":"<colour name>","hex":"<#rrggbb>"},{"name":"<colour name>","hex":"<#rrggbb>"}],"style":"<style>"}\n'+
   'Hard rules:\n'+
   '- Fill every field from what is actually in the photo. Never copy or reuse the example values above (they are only field placeholders).\n'+
   '- colors = the 3 dominant colours OF THE GARMENT itself, largest area first. Background, hair, skin and surroundings never count as garment colours.\n'+
   '- Every hex must be a colour that genuinely appears on the garment in the photo (never invent one).\n'+
   '- name must be exactly one of: black|dark grey|grey|light grey|white|beige|cream|camel|khaki|brown|dark brown|navy|dark blue|blue|sky blue|light blue|denim blue|dark green|olive|army green|deep olive|green|light green|wine red|red|rose red|pink|light pink|orange|yellow|purple|deep purple|lilac\n'+
   '- gar must be exactly one of: dress|top|shirt|coat|jacket|sweatshirt|sweater|tee|tank|trousers|shorts|skirt|long dress|short skirt|denim|other\n'+
   '- Garment rule: if it is a dress or any one-piece (even if only the top half is visible), always answer "dress". Only answer "top" when top and bottom are clearly separate garments.\n'+
   '- fabric must be exactly one of: cotton|silk/satin|linen|knit/sweater|fleece|denim|leather|tech/sport fabric|other\n'+
   '- pattern must be exactly one of: solid|stripe|check|polka dot|floral|leopard/animal print|tie-dye|print|none\n- collar must be exactly one of: crew|V-neck|turtleneck|square|lapel|shirt collar|collarless\n'+
   '- style must be exactly one of: wild|sweet|sporty|office|natural/home|evening\n- Output JSON only. No explanation, no comments.';
  const body={model:'gpt-4o-mini',temperature:0.2,response_format:{type:'json_object'},
    messages:[{role:'system',content:'You are a clothing perfumer. Read the photo and output JSON only.'},{role:'user',content:[{type:'text',text:user},{type:'image_url',image_url:{url:'data:image/jpeg;base64,'+b64}}]}],
    max_tokens:800};
  let resp;
  try{ resp=await fetch('https://api.openai.com/v1/chat/completions',{method:'POST',headers:{'Content-Type':'application/json','Authorization':'Bearer '+key},body:JSON.stringify(body)}); }
  catch(e){ throw new Error('Network error: '+(e.message||e)); }
  if(!resp.ok){ let t=''; try{t=await resp.text();}catch(_){} throw new Error('OpenAI '+resp.status+' '+(t||'').slice(0,160)); }
  const j=await resp.json();
  const content=((j.choices||[])[0]||{}).message||{}; const raw=(content.content||'').replace(/```json|```/g,'').trim();
  const g=JSON.parse(raw);
  if(!g || typeof g!=='object' || !(g.gar||g.colors||g.style)) throw new Error('Could not recognise a garment — please take another photo');
  return buildResult(g);
}

/* ---------- modifier 选择（来自 perfumeRules.js 规则） ---------- */
const MODIFIER_POOL_CN=['焚香','岩兰草','松针','樱花','白茶','白麝香'];
function hashStr(v){ let h=2166136261; for(const c of JSON.stringify(v)){ h^=c.charCodeAt(0); h=Math.imul(h,16777619); } return h>>>0; }
function modifiersOfRecipe(recipe, seed){
  const recipeNotes=new Set([...(recipe.top||[]),...(recipe.mid||[]),...(recipe.base||[])]);
  const available=MODIFIER_POOL_CN.filter(n=>!recipeNotes.has(n));
  const count=Math.min(available.length, 1+(seed%2));
  const selected=[];
  for(let i=0;i<count;i++){
    const index=(seed+i*7)%available.length;
    selected.push(available.splice(index,1)[0]);
  }
  return selected;
}
function buildResult(g){
  const styleName=(['wild','sweet','sporty','office','natural/home','evening'].includes((g.style||'').trim()))?(g.style).trim():'office';
  const defs=COPY.STYLE_DEFS.find(s=>s.name===styleName)||COPY.STYLE_DEFS[3];
  const colors=(g.colors||[]).slice(0,3);
  while(colors.length<3) colors.push({name:'white',hex:'#f2efe8'});
  const attr={color:(colors[0]||{}).name||'',print:g.pattern||'',fabric:g.fabric||'',garment:g.gar||''};
  const variant=COPY.pickVariant(styleName,attr);
  const rec=JSON.parse(JSON.stringify((COPY.RECIPES[styleName]&&COPY.RECIPES[styleName][variant])||{top:[],mid:[],base:[]}));
  const copyRaw=COPY.makeCopy({style:defs,colors:colors.map(c=>c.name),gar:g.gar,fabric:g.fabric,pattern:g.pattern});
  const noteOf=s=>{
    if(!s) return -1;
    if((defs.top||[]).indexOf(s)>=0) return 0;
    if((defs.mid||[]).indexOf(s)>=0) return 1;
    if((defs.base||[]).indexOf(s)>=0) return 2;
    return -1;
  };
  const segLines=copyRaw.slice(1,6).map(m=>({t:m.t, s:m.s||'', bottle:noteOf(m.s)}));
  const seed=hashStr({gar:g.gar,pattern:g.pattern,fabric:g.fabric,colors:g.colors,style:g.style});
  const modifierOptions=modifiersOfRecipe(rec, seed);
  // modifier 默认不在配方里，由顾客在结果界面点“＋”加进中调
  return {style:styleName,variant,recipe:rec,modifierOptions,colors,gar:g.gar,fabric:g.fabric,pattern:g.pattern,collar:g.collar,copy:copyRaw.map(x=>x.t), segLines};
}
async function exampleAI(){
  return buildResult({gar:'dress',fabric:'silk/satin',pattern:'floral',collar:'crew',
    colors:[{name:'light pink',hex:'#f0a6b8'},{name:'white',hex:'#f2efe8'},{name:'light grey',hex:'#cfd0d6'}],style:'sweet'});
}

/* ---------- LLM 香语重写：配方固定，基于衣服特征+意象连接写自然句（失败回退模板） ---------- */
function buildScentPrompt(){
  const rec=AI.recipe;
  const colors=(AI.colors||[]).map(c=>c.name).join(', ');
  return 'You are a perfumer blending a scent for a customer, thinking out loud. Write 6 short spoken lines.\n'+
    "Customer's garment: garment="+(AI.gar||'')+', collar='+(AI.collar||'')+', fabric='+(AI.fabric||'')+', pattern='+(AI.pattern||'')+', main colours='+colors+', style='+(AI.style||'')+'.\n'+
    'Fixed recipe — top: '+(rec.top||[]).join(', ')+'; heart: '+(rec.mid||[]).join(', ')+'; base: '+(rec.base||[]).join(', ')+'.\n'+
    'Step 1: choose THE single most eye-catching feature of this garment — exactly one of (1) one of its colours, (2) its pattern, (3) its silhouette (garment + collar), (4) its fabric. Then choose a second feature of a DIFFERENT kind.\n'+
    'Step 2: write 6 lines in order:\n'+
    '- Line 1: react to the main feature ("I see ...") and lead into the 1st note.\n'+
    '- Line 2: an image the main feature brings to mind ("it reminds me of ..."), landing on the 2nd note.\n'+
    '- Line 3: move to the second feature, phrased differently, landing on the 3rd note.\n'+
    '- Line 4: one more line on the second feature or the overall feel, landing on the 4th note.\n'+
    '- Line 5: close with "and a final touch of X", landing on the 5th note.\n'+
    '- Line 6: what you say as the three liquids blend into one perfume (e.g. "let me bring them together", "balanced — one bottle of perfume"). Leave "s" empty.\n'+
    'Imagery requirements (important):\n'+
    '- At least 3 of the 5 lines must carry a concrete image (a real picture or simile, e.g. "a dark green sweatshirt, like a vineyard").\n'+
    "- Imagery must match the fabric's texture / temperature / weight (this matters most; if it clashes, rewrite it):\n"+
    '  silk/satin = smooth, cool, bright -> dew, moonlight, running water, glass; linen = light, breathable -> thin mist, morning breeze, sun-warmed bedsheets; leather = hard, tough, aged -> old wood, worn book cover, tobacco; fleece/knit = soft, plush, warm -> clouds, cotton fluff, milk foam, first snow.\n'+
    '- If the fabric is soft the imagery must be soft too; never pair soft fabric with hard, heavy imagery such as oak, rock or iron.\n'+
    '- Imagery must be concrete and visual, never abstract filler.\n'+
    '- 12 words per line is the budget: fill the picture within it, and do not waste words on filler such as "very", "really", "especially".\n'+
    'Hard requirements:\n'+
    '- Each line: at most 12 words and at most 1 comma.\n'+
    '- Natural spoken English, warm and understated — not written, not formal.\n'+
    '- Each line should naturally bring out its note (describe the smell; the note name may appear in the line or in "s").\n'+
    '- All 5 notes must come from the fixed recipe above and should not repeat. "s" MUST be the exact note name copied from that recipe (keep it in the original Chinese).\n'+
    '- If a note clashes with the fabric (e.g. a soft fabric with a woody note), write it as contrast rather than forcing a simile: write "the cloth is so soft, and yet there is wood in it", not "soft fabric, like an ancient oak".\n'+
    '- Forbidden: two lines in a row with the same structure, every line starting with "I", parallelism, or instruction-manual tone.\n'+
    'Style reference (shows only "short + with imagery"; swap in your own notes):\n'+
    '{"lines":[{"t":"A dark green sweatshirt, like a vineyard.","s":"青草"},{"t":"It reminds me of grass after rain.","s":"海水"},{"t":"Clean lapels; saffron suits it.","s":"藏红花"},{"t":"The cloth is soft, like a sun-warmed cloud.","s":"白麝香"},{"t":"And a final touch of vetiver.","s":"香根草"},{"t":"Balanced now — one bottle of perfume.","s":""}]}\n'+
    'Output JSON only: {"lines":[{"t":"sentence","s":"note"}, ...]} with 6 items. No extra text.';
}
async function genScentLinesLLM(){
  if(!AI || !AI.recipe) return;
  const key=getKey(); if(!key) return;
  try{
    const resp=await fetch('https://api.openai.com/v1/chat/completions',{
      method:'POST',
      headers:{'Content-Type':'application/json','Authorization':'Bearer '+key},
      body:JSON.stringify({model:'gpt-4o-mini',temperature:0.9,response_format:{type:'json_object'},
        messages:[{role:'system',content:'You are an English scent-copy writer. Output JSON only.'},{role:'user',content:buildScentPrompt()}],
        max_tokens:500})
    });
    if(!resp.ok) return;
    const j=await resp.json();
    const raw=((j.choices||[])[0]||{}).message.content.replace(/```json|```/g,'').trim();
    const o=JSON.parse(raw);
    if(Array.isArray(o.lines)){
      const rec=AI.recipe;
      const noteOf=s=>{
        if(!s) return -1;
        if((rec.top||[]).indexOf(s)>=0) return 0;
        if((rec.mid||[]).indexOf(s)>=0) return 1;
        if((rec.base||[]).indexOf(s)>=0) return 2;
        return -1;
      };
      const tmpl=(AI.segLines||[]).slice(0,5);
      // 合格判定：≤1 个逗号、≤70 字符、非空；不合格整句丢弃（绝不截断成半句）
      const clean=t=>{
        let s=String(t||'').trim();
        const commas=(s.match(/,/g)||[]).length;
        if(!s || commas>1 || s.length>70) return '';
        return s.replace(/[,.!?~…]+$/,'');
      };
      const got=o.lines.map(l=>({t:clean(l&&l.t), s:String((l&&l.s)||'').trim()}))
        .filter(l=>l.t && noteOf(l.s)>=0).slice(0,5);
      if(got.length>=3){   // 至少 3 句有效才采用，不足从模板补齐
        const out=got.map(l=>({t:l.t, s:l.s, bottle:noteOf(l.s)}));
        for(let i=out.length;i<5 && tmpl[i];i++) out.push({t:tmpl[i].t, s:tmpl[i].s, bottle:tmpl[i].bottle});
        AI.segLines=out;
      }
      // 第6句：三瓶调和成香水的收尾话（不参与涨液）
      const harm=o.lines[5];
      const ht=clean(harm && harm.t);
      if(ht) AI.harmonyLine=ht;
    }
  }catch(e){ console.warn('[scent-llm]',e); }
}

/* ---------- 段4：毛球染液，每句涨1/5、句间随机涨1/5、最后补满 ---------- */
async function yarnFlow(){
  sendToPump(AI && AI.style, 0.5);   // 液面升高：对应泵转 0.5s
  hint(null);
  const yarns=SEG[3].filter(l=>l.kind==='gif'&&l.id.startsWith('yarn'));
  if(!yarns.length){ await sleep(1200); return; }
  const g=META[yarns[0].gif]; if(!g){ await sleep(1200); return; }
  const start=Math.max(1, Math.min(yarns[0].f0||0, g.frames-1));   // 跳过毛球动画第1帧
  const end=yarns[0].f1==null?g.frames-1:Math.min(yarns[0].f1,g.frames-1);
  const totalFrames=Math.max(1,end-start+1);
  const stepF=totalFrames/5;                    // 每次涨 1/5
  const dur=sumDelays(yarns[0].gif,yarns[0].f0,yarns[0].f1,yarns[0].speed);
  const stepDur=Math.max(1100, dur/5*1.4);      // 放慢节奏
  // 切到段3：柜子里三个毛球（未上色），在毛球画面飘字
  await begin(P.YARN);
  yarnTint={};                                   // 先不上色
  yarns.forEach(L=>{ gifState[L.id]={f:start,acc:0,play:false,start,end,loops:1,cb:null}; });
  await ensureSvgFrames();
  hint(null);
  // 开场白两句（毛球未上色画面，与 LLM 加载并行）
  const llmP=genScentLinesLLM();
  floatLine('Hello there.', 1700);
  const opening=(async()=>{ await sleep(1500); floatLine('Let me blend something for you.', 1900); })();
  await Promise.race([Promise.all([llmP, opening]), sleep(6000)]);
  // 飘完字：上色（每瓶一个主色）
  yarnTint={};
  yarns.forEach((L,i)=>{ const hex=(AI.colors[i%3]||{}).hex; if(hex) yarnTint[L.id]=hex; });
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
  const harmony=(AI && AI.harmonyLine) ? AI.harmonyLine : 'Let me bring them together.';
  floatLine(harmony, Math.max(1200, fillDur));
  await Promise.all(yarns.map(L=>animateYarnStep(L, gifState[L.id].f, end, fillDur)));
  await sleep(300);
}

/* ---------- 液面下降：付款后把三瓶液体倒放一遍（忽略毛球） ---------- */
async function lowerLiquid(){
  await begin(P.YARN); hint(null); clearFX();
  sendToPump(AI && AI.style, 2);   // 液面下降：对应泵转 2s
  const yarns=SEG[3].filter(l=>l.kind==='gif'&&l.id.startsWith('yarn'));
  if(!yarns.length){ await sleep(800); return; }
  const g=META[yarns[0].gif]; if(!g){ await sleep(800); return; }
  // 时长沿用涨液节奏（约 4 份 stepDur）
  const dur=sumDelays(yarns[0].gif,yarns[0].f0,yarns[0].f1,yarns[0].speed);
  const stepDur=Math.max(1100, dur/5*1.4);
  const lowerDur=Math.max(1500, stepDur*4);
  floatLine('Bottling it now.', lowerDur);
  const t0=performance.now();
  await new Promise(res=>{
    (function tick(){
      const p=Math.min(1,(performance.now()-t0)/lowerDur);
      const e=p<0.5?2*p*p:1-Math.pow(-2*p+2,2)/2;   // easeInOut
      lowerLiquidF=Math.round(49*(1-e));             // 49→0：满→空
      if(p<1) requestAnimationFrame(tick);
      else {
        // 停在空液面：球保持消失(帧51) + 液体空(帧0)，取香水时背后即空瓶
        lowerLiquidF=0;
        res();
      }
    })();
  });
  await sleep(250);
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
function showSpiceTags(){  document.querySelectorAll('.spiceTag').forEach(e=>e.remove());  const tags=[['🌅 Top',AI.recipe.top||[]],['☀️ Heart',AI.recipe.mid||[]],['🌙 Base',AI.recipe.base||[]]];
  const yarns=SEG[3].filter(l=>l.kind==='gif'&&l.id.startsWith('yarn')).slice(0,3);
  const r=canvasRect();
  tags.forEach((tg,i)=>{
    const L=yarns[i]; if(!L) return;
    const cx=(L.x/100*W+L.w/100*W/2)/W, cy=(L.y/100*H)/H;
    const el=document.createElement('div'); el.className='spiceTag';
  const rows=tg[1].map(n=>'<div class="sr">'+(COPY.SPICE_EN[n]||n)+'</div>').join('');
    el.innerHTML='<div class="nt">'+tg[0]+'</div><div class="sp">'+rows+'</div>';
    $('fx').appendChild(el);
    el.style.left=(r.left+cx*r.width)+'px';
    el.style.top=(r.top+Math.max(0.03,cy-0.03)*r.height)+'px';
  });
}

/* ============================================================
   结果界面 modifier 按钮 + edit 摆放模式（?edit=1）
   ============================================================ */
const EDIT_MODE=/[?&]edit=1/.test(location.search);
const MOD_POS_KEY='wornin_modifier_pos_v2';
function loadModPos(){
  try{
    if(CFG && CFG.modifierPos && Object.keys(CFG.modifierPos).length) return JSON.parse(JSON.stringify(CFG.modifierPos));
    return JSON.parse(localStorage.getItem(MOD_POS_KEY)||'{}');
  }catch(e){ return {}; }
}
function saveModPos(id,x,y){
  const m=loadModPos();
  m[id]={x:Math.max(0,Math.min(100,x)), y:Math.max(0,Math.min(100,y))};
  try{ localStorage.setItem(MOD_POS_KEY, JSON.stringify(m)); }catch(e){}
  if(CFG){
    CFG.modifierPos=m;
    try{ fetch('/save',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({seg:CFG.seg, modifierPos:m, photo:CFG.photo||''})}); }catch(e){}
  }
}
function showModifiers(){
  document.querySelectorAll('.modBtn').forEach(e=>e.remove());
  const saved=loadModPos();
  const opts=(AI&&AI.modifierOptions)||[];
  const defs=[
    {id:'mod1', x:52, y:24},
    {id:'mod2', x:52, y:33},
  ];
  defs.forEach((d,i)=>{
    const label=opts[i]; if(!label) return;   // modifier 只有 1 个时跳过第 2 个按钮
    const p=saved[d.id]||d;
    const b=document.createElement('button');
    b.className='modBtn'+(EDIT_MODE?' edit':'');
    b.dataset.letter=label;
    b.dataset.en=COPY.SPICE_EN[label]||label;
    b.dataset.plus='1';
    b.textContent='＋'+b.dataset.en;
    b.style.left=p.x+'%'; b.style.top=p.y+'%';
    $('fx').appendChild(b);
    if(EDIT_MODE) makeModDraggable(b, d.id);
    else b.addEventListener('click', ()=>toggleMod(b));
  });
}
function toggleMod(b){
  const L=b.dataset.letter||'?';
  const en=b.dataset.en||L;
  const adding=b.dataset.plus==='1';   // 当前是“＋” → 点击执行添加
  b.dataset.plus=adding?'0':'1';
  b.textContent=adding?'−'+en:'＋'+en;
  b.classList.toggle('minus', b.dataset.plus==='0');
  applyModifier(L, adding);
}
function applyModifier(note, add){
  if(!AI||!AI.recipe) return;
  const r=AI.recipe;
  const has=(r.top||[]).includes(note)||(r.mid||[]).includes(note)||(r.base||[]).includes(note);
  if(add && !has){ r.mid=r.mid||[]; r.mid.push(note); }          // 加 → 进中调
  else if(!add && has){
    r.top=(r.top||[]).filter(x=>x!==note);
    r.mid=(r.mid||[]).filter(x=>x!==note);
    r.base=(r.base||[]).filter(x=>x!==note);
  }
  showSpiceTags();   // 实时刷新香料标签
}
function makeModDraggable(el,id){
  let dragging=false, sx=0, sy=0, moved=false;
  el.addEventListener('pointerdown',e=>{
    dragging=true; moved=false; sx=e.clientX; sy=e.clientY;
    el._base={x:parseFloat(el.style.left), y:parseFloat(el.style.top)};
    el.setPointerCapture(e.pointerId); e.preventDefault();
  });
  el.addEventListener('pointermove',e=>{
    if(!dragging) return;
    const box=$('stageBox').getBoundingClientRect();
    el.style.left=(el._base.x+(e.clientX-sx)/box.width*100)+'%';
    el.style.top=(el._base.y+(e.clientY-sy)/box.height*100)+'%';
    if(Math.hypot(e.clientX-sx, e.clientY-sy)>5) moved=true;
  });
  const end=e=>{
    if(!dragging) return;
    dragging=false;
    if(moved){
      saveModPos(id, parseFloat(el.style.left), parseFloat(el.style.top));
      toast(id+' saved at x='+parseFloat(el.style.left).toFixed(1)+'% y='+parseFloat(el.style.top).toFixed(1)+'%');
    }else{
      toggleMod(el);
    }
  };
  el.addEventListener('pointerup',end);
  el.addEventListener('pointercancel',end);
  el.addEventListener('wheel',e=>{
    e.preventDefault();
    const fs=parseFloat(getComputedStyle(el).fontSize)||18;
    el.style.fontSize=Math.max(12, fs+(e.deltaY<0?1:-1))+'px';
  },{passive:false});
}
async function editPreview(){
  const gate=document.getElementById('catGate'); if(gate) gate.style.display='none';
  if(!document.getElementById('editBanner')){
    const banner=document.createElement('div'); banner.id='editBanner';
    banner.textContent='⚠ Placement mode (?edit=1) — drag the A/B buttons to position · scroll to resize';
    document.body.appendChild(banner);
  }
  AI=await exampleAI();
  await begin(P.FINAL); clearFX(); hint(null);
  showSpiceTags();
  showModifiers();
  bottom('<button onclick="PLAY.retry()">🔄 Try again</button><button class="ghost" onclick="PLAY.reshoot()">👕 Another garment</button>');
}

/* ============================================================
   制香结果 → 取香卡 → 买下 → 付款 → 结果长条
   ============================================================ */
function askSmellCard(){
  bottom('<button id="smellCard">👃 Smell it · take a card</button>');
  return new Promise(res=>{
    $('smellCard').onclick=()=>res();
  });
}
function askLikeIt(){
  clearFX(); bottom(null);
  hint('you like it?','Do you like this scent?');
  bottom('<button id="likeIt1">like</button><button id="likeIt2">so, so</button><button id="likeIt3">don\'t like</button>');
  return new Promise(res=>{
    $('likeIt1').onclick=()=>res('like');
    $('likeIt2').onclick=()=>res('soso');
    $('likeIt3').onclick=()=>res('dont');
  });
}
function setupYarns(segArr, empty){
  // 三瓶液体：静止在最后一帧（empty=true 时空液面）+ 程序上色（继承段4的 AI 颜色）
  const yarns=segArr.filter(l=>l.kind==='gif'&&l.id.startsWith('yarn'));
  yarns.forEach((L,i)=>{
    const g=META[L.gif]; if(!g) return;
    const end=L.f1==null?g.frames-1:Math.min(L.f1,g.frames-1);
    const start=Math.max(1, Math.min(L.f0||0, g.frames-1));
    const f=empty?start:end;
    gifState[L.id]={f,acc:0,play:false,start:f,end,loops:1,cb:null};
    const hex=(AI&&AI.colors&&AI.colors[i%3]||{}).hex;
    if(hex) yarnTint[L.id]=hex;
  });
}
async function playDrawer(){
  await begin(P.DRAWER);
  const seg5=SEG[4]; if(!seg5) return;
  delete gifState['card']; delete gifState['bottle'];   // 两个取出动画默认不显示
  setupYarns(SEG[4]);
  const drawer=seg5.find(l=>l.kind==='gif'&&l.gif==='drawer_open');
  if(drawer){
    const g=META[drawer.gif]; const end=drawer.f1==null?g.frames-1:Math.min(drawer.f1,g.frames-1); const st=Math.min(drawer.f0||0,end);
    gifState[drawer.id]={f:st,acc:0,play:false,start:st,end,loops:1,cb:null}; preload(drawer.gif,st,end,10);
    await new Promise(r=>{ gifState[drawer.id].cb=r; gifState[drawer.id].play=true; });
  }
}
async function playCardOut(){
  await begin(P.DRAWER);
  setupYarns(SEG[4]);
  const L=SEG[4].find(l=>l.id==='card'); if(!L) return;
  const m=META[L.gif]; if(!m){ await sleep(2100); return; }
  const end=L.f1==null?m.frames-1:Math.min(L.f1,m.frames-1); const st=Math.min(L.f0||0,end);
  gifState[L.id]={f:st,acc:0,play:false,start:st,end,loops:1,cb:null};
  preload(L.gif,st,end,m.frames);
  await new Promise(r=>{ gifState[L.id].cb=r; gifState[L.id].play=true; });
}
async function playBottleOut(){
  await begin(P.BOTTLE);
  setupYarns(SEG[5], true);   // 液面已下降完：取香水时背后是空瓶
  const L=SEG[5].find(l=>l.id==='bottle'); if(!L) return;
  const m=META[L.gif]; if(!m){ await sleep(2100); return; }
  const end=L.f1==null?m.frames-1:Math.min(L.f1,m.frames-1); const st=Math.min(L.f0||0,end);
  gifState[L.id]={f:st,acc:0,play:false,start:st,end,loops:1,cb:null};
  preload(L.gif,st,end,m.frames);
  await new Promise(r=>{ gifState[L.id].cb=r; gifState[L.id].play=true; });
}
async function drawerCard(){
  clearFX(); bottom(null);
  hint('The drawer slides open…','Please take your scent card');
  await playCardOut();   // 完整视频（抽屉打开 + 拿出卡片）
  await sleep(1200);
}
function askBuy(){
  clearFX(); bottom(null);
  hint('Take this bottle home for $35?','Pay with Chase');
  bottom('<button id="buyNo">No thanks · scan for the recipe</button><button id="buyYes">Yes · buy it</button>');
  return new Promise(res=>{
    $('buyNo').onclick=()=>res(false);
    $('buyYes').onclick=()=>res(true);
  });
}
function showPay(){
  return new Promise(res=>{
    clearFX(); bottom(null); hint(null);
    const el=document.createElement('div'); el.className='payBox';
    el.innerHTML='<div class="payTitle">Scan to pay · Chase</div><div class="payQr" id="payQr"><span class="payLoading">Loading…</span></div><div class="payAmt">$35.00</div><div class="payStatus" id="payStatus">Waiting for scan…</div>';
    $('fx').appendChild(el);
    bottom('<button id="payDone">I have received the payment (confirm manually)</button>');
    let done=false, pollTimer=null;
    const finish=()=>{ if(done) return; done=true; if(pollTimer) clearInterval(pollTimer); document.querySelectorAll('.payBox').forEach(e=>e.remove()); res(); };
    $('payDone').onclick=finish;
    // Stripe：创建付款会话 → 生成二维码 → 轮询付款状态（收到付款自动继续）
    (async()=>{
      const qr=$('payQr'), st=$('payStatus');
      try{
        const r=await fetch('/create-payment',{method:'POST',headers:{'Content-Type':'application/json'},body:'{}'});
        const d=await r.json();
        if(d.ok && d.url){
          qr.innerHTML='';
          new QRCode(qr,{text:d.url,width:230,height:230,correctLevel:QRCode.CorrectLevel.M});
          st.textContent='Waiting for payment…';
          pollTimer=setInterval(async()=>{
            try{
              const s=await (await fetch('/payment-status?id='+encodeURIComponent(d.id))).json();
              if(s.status==='paid'){
                st.textContent='✓ Payment received';
                setTimeout(finish,1200);
              }
            }catch(e){}
          },2000);
        }else{
          qr.textContent='Payment not configured';
          st.textContent=(d.error||'Stripe not configured')+' · you can confirm manually';
        }
      }catch(e){
        qr.textContent='Payment service unavailable';
        st.textContent='Please confirm manually';
      }
    })();
  });
}
async function drawerBottle(){
  clearFX(); bottom(null);
  hint('The drawer slides open…','Please take your perfume');
  await playBottleOut();   // 完整视频（抽屉打开 + 拿出香水）
  await sleep(1200);
}

/* ============================================================
   服装纸艺拼贴图（gpt-image-1 后台生成）+ 图床二维码
   ============================================================ */
const IMGBB_KEY='41d52b57239851f3a97f33e3003d2a4a';
const GARMENT_PROMPT=`First identify and isolate the primary outfit worn by the person in the reference image. Ignore and completely remove the person's face, hair, skin, hands, legs, body, pose, accessories unrelated to the clothing, and the original background.

Carefully analyze the clothing and reconstruct the complete garment as a standalone fashion piece. Preserve the recognizable identity of the original outfit as accurately as possible, including its overall silhouette, proportions, neckline, collar, sleeves, cuffs, shoulder shape, front opening, buttons, pockets, waistline, major panels, layering, hemline, patterns, and other distinctive construction details. Infer naturally any portions of the garment that are hidden by the person's body or pose.

Transform the reconstructed clothing into a handmade FLAT washi-tape and decorative-paper fashion collage. The garment must look physically assembled from real pieces of washi tape, Japanese paper, thin decorative paper, translucent paper, and textured craft paper, rather than like fabric with a digital paper texture applied.

Visually simplify and abstract the original garment into a SMALL NUMBER OF RELATIVELY LARGE, CLEAR PAPER SHAPES. Represent one visually continuous area of the garment with one larger piece of paper (bodice as one shape, each sleeve as one shape, collar as one or two shapes, waistband as one strip, a large skirt as one silhouette or a few broad panels). Use the FEWEST paper pieces necessary while preserving the recognizable design. Avoid mosaics made from many tiny fragments and excessive segmentation.

Choose ONE paper material per major shape, translating textile qualities into paper qualities: matte cotton to matte washi; smooth solid fabric to clean solid Japanese paper; plaid to subtle printed plaid washi; stripes to striped decorative paper; floral to restrained botanical washi; denim to fibrous blue-gray paper; wool/tweed to textured fiber paper; silk/satin to thin smooth paper with subtle sheen; lace to patterned translucent paper; chiffon/organza/sheer to translucent Japanese tissue; heavy structured fabric to denser matte craft paper. Reinterpret the textile character through paper texture, not photorealistic fabric.

Preserve the original garment's color identity and important color relationships, translating source colors into slightly softened, natural paper colors. Do not redesign the outfit or introduce unrelated colors, patterns, pleats, bows, ruffles, pockets, or layers. Preserve important plaid, stripe, floral, graphic or woven patterns as simplified printed or textured paper surfaces. Small functional details like buttons or trims may be small simple paper shapes when visually important.

Keep the entire collage FLAT. All paper pieces remain visually flat on the same two-dimensional plane. No 3D paper sculpture, no folds, no curled corners, no floating edges, no accordion folds, no dimensional ruffles. Pleats, gathers, folds and draping are SIMPLIFIED GRAPHICALLY rather than physically constructed.

The garment should read immediately as a handmade paper collage: broad silhouettes, large uninterrupted paper surfaces, subtle flat overlaps, carefully hand-cut slightly imperfect edges, subtle natural paper fibers and faint printed textures. The aesthetic sits between fashion collage, Japanese paper craft, material study, and minimal graphic abstraction.

Present the complete reconstructed outfit alone, without a human body or mannequin, vertically centered. The garment occupies approximately 45-55% of the image height with generous transparent empty space on every side. The entire area outside the garment must be TRUE TRANSPARENCY with a clean alpha channel. No white, ivory, beige, gray, colored or paper background, no floor, wall, table, sketchbook, or canvas texture, no checkerboard or fake transparency.

Use soft, even, neutral illumination only to reveal subtle material qualities. No directional lighting, no dramatic highlights, no dimensional shading, no cast shadows, no halo, glow, outline or border around the garment, no additional objects.

Avoid: human model, mannequin, human body, face, head, hair, skin, arms, hands, legs, feet, person wearing clothes, hanger, clothing rack, realistic fabric clothing, textile photography, 3D paper sculpture, origami, folded or curled paper, many tiny paper pieces, dozens of narrow strips, fragmented mosaic, excessive torn paper, invented patterns or embellishments, digitally painted or watercolor or vector or cartoon or CGI clothing, glossy plastic, perfectly computer-cut or laser-cut edges, white or colored background, cast or drop shadow, scrapbook decorations, flowers, stamps, text, typography, logo, watermark, dramatic lighting, strong saturation, neon colors. Output a clean isolated transparent PNG of the garment only.`;
async function runGarmentImage(){
  try{
    const key=getKey();
    if(!key || !photo.crop) return null;
    const b64=photo.crop.toDataURL('image/jpeg',0.9).split(',')[1];
    const resp=await fetch('https://api.openai.com/v1/images/edits',{
      method:'POST',
      headers:{'Content-Type':'application/json','Authorization':'Bearer '+key},
      body:JSON.stringify({model:'gpt-image-1',prompt:GARMENT_PROMPT,images:[{image_url:'data:image/jpeg;base64,'+b64}],background:'transparent',output_format:'png',size:'1024x1536',quality:'medium'}),
    });
    if(!resp.ok){ console.warn('[garment-img]',resp.status,(await resp.text()).slice(0,200)); return null; }
    const j=await resp.json();
    const b=j&&j.data&&j.data[0]&&j.data[0].b64_json;
    return b?('data:image/png;base64,'+b):null;
  }catch(e){ console.warn('[garment-img]',e); return null; }
}
async function waitGarment(){
  if(!garmentPromise) return null;
  try{ return await Promise.race([garmentPromise, sleep(25000).then(()=>null)]); }
  catch(e){ return null; }
}
async function uploadToImgbb(dataUrl){
  if(!IMGBB_KEY) return null;
  try{
    const fd=new FormData();
    fd.append('image', dataUrl.split(',')[1]);
    const r=await fetch('https://api.imgbb.com/1/upload?key='+IMGBB_KEY,{method:'POST',body:fd});
    const j=await r.json();
    return (j&&j.data&&j.data.url)||null;
  }catch(e){ console.warn('[imgbb]',e); return null; }
}
function makeQR(text, size){
  return new Promise(res=>{
    try{
      const div=document.createElement('div');
      div.style.cssText='position:absolute;left:-9999px;top:0;width:'+size+'px;height:'+size+'px';
      document.body.appendChild(div);
      new QRCode(div, { text, width:size, height:size, correctLevel:QRCode.CorrectLevel.M });
      setTimeout(()=>{
        const c=div.querySelector('canvas');
        const data=c?c.toDataURL('image/png'):null;
        div.remove();
        res(data);
      }, 100);
    }catch(e){ console.warn('[qr]',e); res(null); }
  });
}
async function showResultStrip(){
  clearFX(); bottom(null); hint(null);
  const garment=await waitGarment();
  const gImg=garment?await loadImg(garment):null;
  // 第一次生成长条图（二维码占位）→ 上传 imgbb 得公网 URL → 生成二维码（JPEG 压缩，减小体积加速加载）
  let qrImg=null;
  const url1=await uploadToImgbb(renderResultStrip(gImg,null).toDataURL('image/jpeg',0.9));
  if(url1){
    const qrData=await makeQR(url1, 520);
    if(qrData) qrImg=await loadImg(qrData);
  }
  // 第二次生成长条图（含真实二维码）
  const wrap=document.createElement('div'); wrap.id='stripWrap';
  const img=document.createElement('img'); img.className='resultStrip';
  img.src=renderResultStrip(gImg,qrImg).toDataURL('image/jpeg',0.9);
  wrap.appendChild(img);
  document.body.appendChild(wrap);
  setTimeout(()=>{ location.replace(location.origin + location.pathname); }, 60000);   // 60 秒后回猫眼待机（清掉参数，确保回到入口门）
}
function renderResultStrip(gImg, qrImg){
  const c=document.createElement('canvas'); const CW=1200, CH=1703;
  c.width=CW; c.height=CH; const x=c.getContext('2d');
  x.fillStyle='#1c1712'; x.fillRect(0,0,CW,CH);
  x.fillStyle='#e6c383'; x.textAlign='center';
  x.font='bold 72px Georgia,"Times New Roman",serif';
  x.fillText('Worn-In · Old Clothes, New Scent', CW/2, 140);
  x.font='38px sans-serif'; x.fillStyle='#f0e3cd';
  x.fillText('Your Personal Scent', CW/2, 210);
  // ① 顾客照片（保持原始比例，不压缩）
  const boxW=860, boxH=640, py=270;
  if(photo.img && photo.img.naturalWidth){
    const iw=photo.img.naturalWidth, ih=photo.img.naturalHeight;
    const sc=Math.min(boxW/iw, boxH/ih);
    const dw=iw*sc, dh=ih*sc;
    x.strokeStyle='#e6c383'; x.lineWidth=4; x.strokeRect((CW-dw)/2, py+(boxH-dh)/2, dw, dh);
    x.drawImage(photo.img, (CW-dw)/2, py+(boxH-dh)/2, dw, dh);
  }else{
    x.strokeStyle='#5a4f42'; x.lineWidth=4; x.strokeRect((CW-boxW)/2, py, boxW, boxH);
    x.fillStyle='#5a4f42'; x.fillText('[ customer photo placeholder ]', CW/2, py+330);
  }
  // ② 配方
  const cy=960;
  x.fillStyle='#e6c383'; x.textAlign='left'; x.font='bold 44px sans-serif';
  x.fillText('Your Recipe', 120, cy);
  x.font='33px sans-serif'; x.fillStyle='#f0e3cd';
  x.fillText('Top    '+((AI&&AI.recipe.top||[]).map(n=>COPY.SPICE_EN[n]||n).join(' · ')), 120, cy+66);
  x.fillText('Heart  '+((AI&&AI.recipe.mid||[]).map(n=>COPY.SPICE_EN[n]||n).join(' · ')), 120, cy+132);
  x.fillText('Base   '+((AI&&AI.recipe.base||[]).map(n=>COPY.SPICE_EN[n]||n).join(' · ')), 120, cy+198);
  // ③ 衣服图（纸艺拼贴图，失败则空白占位）
  const gw=340, gh=240, gx0=120, gy0=1300;
  if(gImg && gImg.naturalWidth){
    const sc=Math.min(gw/gImg.naturalWidth, gh/gImg.naturalHeight);
    const dw=gImg.naturalWidth*sc, dh=gImg.naturalHeight*sc;
    x.drawImage(gImg, gx0+(gw-dw)/2, gy0+(gh-dh)/2, dw, dh);
  }else{
    x.strokeStyle='#5a4f42'; x.lineWidth=3; x.strokeRect(gx0, gy0, gw, gh);
    x.fillStyle='#5a4f42'; x.textAlign='center'; x.font='28px sans-serif';
    x.fillText('[ garment image placeholder ]', gx0+gw/2, gy0+gh/2+10);
  }
  // ④ location
  x.textAlign='left'; x.fillStyle='#f0e3cd'; x.font='32px sans-serif';
  x.fillText('📍 1234 avenue, Boston, MA', 120, 1620);
  // 二维码（指向 imgbb 长条图 URL；未上传成功时占位）
  if(qrImg && qrImg.naturalWidth){
    x.drawImage(qrImg, 620, 1280, 260, 260);
  }else{
    x.strokeStyle='#e6c383'; x.lineWidth=3; x.strokeRect(620, 1280, 260, 260);
    x.textAlign='center'; x.fillStyle='#e6c383'; x.font='28px sans-serif';
    x.fillText('Scan to save', 750, 1350);
    x.fillText('[ QR placeholder ]', 750, 1420);
  }
  return c;
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
    const sx=r.width/W, sy=r.height/H;   // 画布→屏幕缩放
    const cx=r.left + ((L?L.x/100*W:0)+mw/2)*sx;
    const cy=r.top  + ((L?L.y/100*H:0)+mh/2)*sy;
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
      if(!okCam){ toast('Camera unavailable — allow access, then take the photo again'); busy=false; return; }
      cd.classList.remove('hidden');
      for(let i=3;i>=1;i--){ num.textContent=i; restartRing(); await sleep(900); }
      cd.classList.add('hidden');
      // 先按竖屏构图把视频画进 shot，再关摄像头（关后再画会黑屏）
      const vw=v.videoWidth||640, vh=v.videoHeight||480;
      shot.width=vw; shot.height=vh;      // 拍完整画面（缩小，不裁切）
      const ctx2=shot.getContext('2d');
      ctx2.translate(vw,0); ctx2.scale(-1,1);   // 左右镜像
      ctx2.drawImage(v, 0, 0, vw, vh);
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
  // 首次访问（本机没存过 Key）→ 一打开网站就弹出 Key 输入框，填一次永久记住
  if(!getKey()) setTimeout(()=>{ ensureKey(); }, 350);
  // 猫眼门放行后才真正开始
  let started=false;
  window.__startWornIn=()=>{ if(started) return; started=true; if(DEMO) toast('Demo mode · running the full flow'); runAll(false); };
  if(EDIT_MODE){ editPreview(); }
  else if(!document.getElementById('catGate')) window.__startWornIn();
  else if(window.__unlocked) window.__startWornIn();
})();
