/* Worn-In · iPad 竖屏定格动画 v1 导演脚本 */
'use strict';
const $ = id => document.getElementById(id);
const sleep = ms => new Promise(r=>setTimeout(r,ms));
const GHOSTS = ['ghost-a.png','ghost-b.png','ghost-c.png'];
const BOTTLES = ['bottle_0_0','bottle_0_1','bottle_0_2','bottle_1_0','bottle_1_1','bottle_1_2']
  .map(n=>'assets/'+n+'.png');
const state = { playing:false, muted:false, hasPhoto:false };

/* ===== 门开前：PPT 原片（1..36）——按衣柜预设位校准 =====
 * PPT 片里衣柜占片宽约 (0.15..0.766)；把它对齐到本页衣柜(左9.6%宽50%)。
 */
const el = {
  wardrobeBox:$('wardrobeBox'), cabinetBox:$('cabinetBox'), spark:$('spark'),
  mirrorBtn:$('mirrorBtn'), mirrorFill:$('mirrorFill'), mirrorTip:$('mirrorTip'),
  cloth:$('cloth'), ribbon:$('ribbon'), bottles:$('bottles'),
  soundBtn:$('soundBtn'), tapArea:$('tapArea'), finish:$('finish'),
  btnUp:$('btnUp'), btnRe:$('btnRe'), file:$('file'),
  film:$('film'), fA:$('fA'), fB:$('fB'),
  playBtn:$('playBtn'), ticks:$('ticks'), fnum:$('fnum'),
  viewer:$('viewer'), fv:$('fv'), vPrev:$('vPrev'), vNext:$('vNext'),
  vNum:$('vNum'), vPlay:$('vPlay'),
};
const PRE_FRAMES = [];
for(let i=1;i<=36;i++) PRE_FRAMES.push('assets/frames/slide_'+String(i).padStart(2,'0')+'.jpg');
// 每帧停留（动作快/定格帧停留更长）
function preDur(i){
  const HOLD={2:760,13:560,14:640,15:980,18:680,28:720,36:640};
  if(HOLD[i]) return HOLD[i];
  if(i>=3&&i<=12) return 240;
  if(i>=19&&i<=35) return 250;
  return 300;
}
let filmOn=false, filmFront='fA';
function anchorFilm(){
  // 片宽 = 衣柜目标宽(50%舞台) / PPT里衣柜占片宽(0.616)
  const k = 0.50/0.616;                       // ≈0.812
  const stageRatio = 761/1080;                 // 舞台宽高比(竖屏)
  const filmHfrac = k*stageRatio/(16/9);       // 片高占舞台高(保持16:9不变形)
  el.film.style.width  = (k*100)+'%';
  el.film.style.height = (filmHfrac*100)+'%';
  // 片左：片内衣柜左(0.15*片宽) 对准 本页衣柜左(0.096)
  el.film.style.left = ((0.096 - 0.15*k)*100)+'%';
  // 片顶：片内衣柜顶(0.062*片高) 对准 本页衣柜顶(0.338)
  el.film.style.top  = ((0.338 - 0.062*filmHfrac)*100)+'%';
}
function showFrame(i){
  const cur = filmFront==='fA'?el.fA:el.fB, nxt = filmFront==='fA'?el.fB:el.fA;
  nxt.src=PRE_FRAMES[i-1];
  return new Promise(res=>{ nxt.onload=()=>{ cur.classList.remove('on'); nxt.classList.add('on');
    filmFront=(filmFront==='fA'?'fB':'fA'); res(); }; });
}
async function playPre(){
  filmOn=true;
  el.wardrobeBox.classList.add('off'); el.mirrorBtn.classList.add('off');
  el.film.classList.remove('off');
  anchorFilm();
  el.fA.classList.remove('on'); el.fB.classList.remove('on');
  el.fA.src=PRE_FRAMES[0];
  await new Promise(r=>el.fA.onload=r); el.fA.classList.add('on'); filmFront='fA';
  // 预载
  [2,3,4].forEach(k=>{const im=new Image(); im.src=PRE_FRAMES[k-1];});
  for(let i=2;i<=36;i++){
    await showFrame(i);
    await sleep(preDur(i));
    [i+1,i+2].forEach(k=>{ if(k<=36){const im=new Image(); im.src=PRE_FRAMES[k-1];} });
    if(!filmOn) return;
  }
  // 门开转场：片收掉 → 回到素材舞台（开柜），衣柜/柜预设位不变
  filmOn=false;
  el.film.classList.add('off');
  el.cabinetBox.classList.remove('off');
  SFX.open(); SFX.chime();
  await sleep(1200);
}

/* 轻量音效 */
const SFX = {
  ctx:null, unlocked:false,
  unlock(){ this.unlocked=true; if(!this.ctx){const AC=window.AudioContext||window.webkitAudioContext; if(AC)this.ctx=new AC();} if(this.ctx&&this.ctx.state==='suspended')this.ctx.resume(); },
  ok(){ return this.unlocked&&!state.muted&&this.ctx; },
  t(f,d,ty,v,s){ if(!this.ok())return; try{const c=this.ctx,o=c.createOscillator(),g=c.createGain();o.type=ty||'sine';
    o.frequency.setValueAtTime(Math.max(1,f),c.currentTime); if(s)o.frequency.exponentialRampToValueAtTime(Math.max(1,s),c.currentTime+d);
    const vv=Math.min(.9,Math.max(.02,v||.1)); g.gain.setValueAtTime(.0001,c.currentTime); g.gain.exponentialRampToValueAtTime(vv,c.currentTime+.02);
    g.gain.exponentialRampToValueAtTime(.0001,c.currentTime+d); o.connect(g);g.connect(c.destination);o.start();o.stop(c.currentTime+d+.02);}catch(e){}},
  n(t0,d,v,f0,f1){ if(!this.ok())return; try{const c=this.ctx,n=Math.floor(c.sampleRate*d),b=c.createBuffer(1,n,c.sampleRate),x=b.getChannelData(0);
    for(let i=0;i<n;i++)x[i]=(Math.random()*2-1)*(1-i/n); const s=c.createBufferSource();s.buffer=b;
    const f=c.createBiquadFilter();f.type='bandpass';f.frequency.setValueAtTime(f0,c.currentTime+t0);f.frequency.exponentialRampToValueAtTime(f1,c.currentTime+t0+d);
    const g=c.createGain();g.gain.setValueAtTime(v,c.currentTime+t0);g.gain.exponentialRampToValueAtTime(.0001,c.currentTime+t0+d);
    s.connect(f);f.connect(g);g.connect(c.destination);s.start(c.currentTime+t0);}catch(e){}},
  knock(){ this.t(130,0.1,'sine',.5,60); this.n(0,.12,.4,180,90); },
  open(){ this.n(0,.5,.2,600,2400); },
  chime(){ [660,880,1320].forEach((f,i)=>this.t(f,0,.6,'sine',.12)); },
  gurgle(){ for(let i=0;i<6;i++)this.t(150+Math.random()*220,0,.06,'sine',.04); },
};
function setBtn(){ el.soundBtn.textContent = state.muted?'🔇':'🔊'; }

/* 白布 */
function clothImg(src){ el.cloth.src = src||('assets/'+GHOSTS[Math.floor(Math.random()*GHOSTS.length)]); }

/* 白雾 11 帧（PPT 3-13）映射到本舞台(参考比例)的定点 */
/* 以衣柜门缝为起点、镜框为终点；数值=舞台% (left,top,width, sprite) */
const SMOKE_KEYS = [
  { l:0.171, t:0.500, w:0.050, src:'ghost-a.png' },   // F3 刚探出
  { l:0.210, t:0.470, w:0.085, src:'ghost-b.png' },   // F4
  { l:0.225, t:0.445, w:0.120, src:'ghost-c.png' },   // F5 拉长上升
  { l:0.240, t:0.430, w:0.155, src:'ghost-a.png' },   // F6
  { l:0.262, t:0.415, w:0.190, src:'ghost-d.png' },   // F7 更大
  { l:0.300, t:0.400, w:0.230, src:'ghost-b.png' },   // F8 成团上浮
  { l:0.360, t:0.392, w:0.245, src:'ghost-c.png' },   // F9
  { l:0.430, t:0.392, w:0.230, src:'ghost-a.png' },   // F10 向右飘
  { l:0.500, t:0.400, w:0.200, src:'ghost-d.png' },   // F11
  { l:0.565, t:0.410, w:0.160, src:'ghost-b.png' },   // F12 接近镜框
  { l:0.625, t:0.420, w:0.120, src:'ghost-c.png' },   // F13 收入镜口
];

/* 灌瓶 */
function fillSlots(){
  const imgs = [...document.querySelectorAll('.slot img')];
  imgs.forEach((im,slot)=>{
    el.bottles.querySelectorAll('.slot')[slot].classList.add('on');
    setTimeout(()=>{ let f=0; const iv=setInterval(()=>{ im.src=BOTTLES[Math.min(f,BOTTLES.length-1)]; SFX.gurgle();
      if(f>=BOTTLES.length-1) clearInterval(iv); f++; },180); }, 500*slot);
  });
}

async function play(instant){
  if(state.playing) return; state.playing=true;
  el.finish.classList.add('off');
  el.film.classList.add('off'); el.cabinetBox.classList.add('off');
  el.spark.classList.add('off'); el.mirrorTip.classList.add('off');
  el.cloth.classList.add('off'); el.ribbon.classList.add('off');
  el.bottles.classList.add('off');
  document.querySelectorAll('.slot').forEach(s=>s.classList.remove('on'));
  el.tapArea.style.zIndex='35';
  if(!instant){
    // —— 门开前：PPT 原片 1..36 整段逐帧（一帧不落，按衣柜预设位校准）——
    await playPre();
    // —— 门开后：素材舞台（尺寸沿用已设定）——
    el.spark.classList.add('off');
    el.bottles.classList.remove('off');
    fillSlots();
    await sleep(3200);
  }
  // 落版
  el.mirrorBtn.classList.remove('bob');
  el.tapArea.style.zIndex='0';
  el.finish.classList.remove('off');
  state.playing=false;
}

/* 照片进镜框 */
function usePhoto(url){
  state.hasPhoto=true;
  const f=el.mirrorFill;
  f.innerHTML='';
  const img=document.createElement('img'); img.src=url;
  f.appendChild(img);
  el.mirrorTip.classList.remove('off');
}
function bind(){
  el.tapArea.addEventListener('click', ()=>{ if(state.playing) play(true); });
  el.btnRe.addEventListener('click', ()=>play(false));
  el.btnUp.addEventListener('click', ()=>{ el.file.click(); });
  el.file.addEventListener('change', ()=>{ const f=el.file.files[0]; if(!f) return;
    const rd=new FileReader(); rd.onload=()=>usePhoto(rd.result); rd.readAsDataURL(f); el.file.value=''; });
  el.soundBtn.addEventListener('click', ()=>{ state.muted=!state.muted; setBtn(); });
  ['pointerdown','touchstart','click'].forEach(ev=>document.addEventListener(ev, ()=>SFX.unlock()));
}

/* ===== 63 帧逐帧检查器 ===== */
function FR(i){ return 'assets/frames/slide_'+String(i).padStart(2,'0')+'.jpg'; }
let curFrame = 1;
const tickBtns = [];
function buildTicks(){
  el.ticks.innerHTML='';
  for(let i=1;i<=63;i++){
    const b=document.createElement('button');
    b.title='第 '+i+' 帧';
    b.addEventListener('click', ()=>openViewer(i));
    el.ticks.appendChild(b); tickBtns.push(b);
  }
}
function paintTicks(i){
  tickBtns.forEach((b,k)=>b.classList.toggle('cur', k+1===i));
  el.fnum.textContent = i+'/63';
}
function openViewer(i){
  curFrame = Math.min(63,Math.max(1,i));
  state.playing = false;                 // 停下自动放映，便于逐帧核对
  el.viewer.classList.remove('off');
  el.fv.src = FR(curFrame);
  el.vNum.textContent = curFrame+'/63';
  paintTicks(curFrame);
}
function closeViewer(){ el.viewer.classList.add('off'); }
function bindScrub(){
  buildTicks(); paintTicks(1);
  el.playBtn.addEventListener('click', ()=>{ closeViewer(); if(state.playing) return; state.playing=false; play(false); });
  el.vPrev.addEventListener('click', ()=>openViewer(curFrame-1));
  el.vNext.addEventListener('click', ()=>openViewer(curFrame+1));
  el.vPlay.addEventListener('click', ()=>{ closeViewer(); state.playing=false; playFrom(curFrame); });
  // 查看器空白处点右键 = 上/下一帧；点图像区也走下一帧（方便快速翻）
  el.viewer.addEventListener('click', (e)=>{
    if(e.target===el.fv || e.target===el.viewer) openViewer(curFrame+1);
  });
}
async function playFrom(startFrame){
  // 从指定 PPT 帧开始整段放映（门开前部分用原片从 start 播）
  if(state.playing) return; state.playing=true;
  el.finish.classList.add('off');
  el.film.classList.add('off'); el.cabinetBox.classList.add('off');
  el.bottles.classList.add('off');
  document.querySelectorAll('.slot').forEach(s=>s.classList.remove('on'));
  el.tapArea.style.zIndex='35';
  if(startFrame<=36){
    filmOn=true;
    el.wardrobeBox.classList.add('off'); el.mirrorBtn.classList.add('off');
    el.film.classList.remove('off'); anchorFilm();
    el.fA.classList.remove('on'); el.fB.classList.remove('on');
    el.fA.src = FR(startFrame);
    await new Promise(r=>el.fA.onload=r); el.fA.classList.add('on'); filmFront='fA';
    for(let i=startFrame+1;i<=36;i++){
      await showFrame(i); await sleep(preDur(i));
      if(!filmOn) return;
    }
    filmOn=false; el.film.classList.add('off');
    el.cabinetBox.classList.remove('off');
  } else if(startFrame<=47){
    // 47 内仍用原片（衣柜/门开）
    filmOn=true;
    el.film.classList.remove('off'); anchorFilm();
    el.fA.src = FR(startFrame); await new Promise(r=>el.fA.onload=r);
    el.fA.classList.add('on'); filmFront='fA';
    for(let i=startFrame+1;i<=47;i++){ await showFrame(i); await sleep(preDur(i)); if(!filmOn) return; }
    filmOn=false; el.film.classList.add('off');
    el.cabinetBox.classList.remove('off');
  } else {
    el.cabinetBox.classList.remove('off');
  }
  SFX.chime();
  el.bottles.classList.remove('off'); fillSlots();
  await sleep(3200);
  el.tapArea.style.zIndex='0'; el.finish.classList.remove('off');
  state.playing=false;
}
document.addEventListener('DOMContentLoaded', ()=>{ bind(); bindScrub(); setBtn(); play(false); });
