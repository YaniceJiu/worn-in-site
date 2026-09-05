/* ===== Worn-In 定格放映器 =====
 * 直接把 PPT 里已渲染好的 63 张定格帧按顺序放映 = 开场动画。
 * 每帧停留时长按“动作段”配置；点一下画面=跳到结尾落版。
 */
'use strict';

const N = 63;
const F = i => `assets/frames/slide_${String(i).padStart(2,'0')}.jpg`;

const $ = id => document.getElementById(id);
const el = {
  fA:$('fA'), fB:$('fB'),
  frame:$('frame'), pan:$('pan'),
  finish:$('finish'), soundBtn:$('soundBtn'), skipBtn:$('skipBtn'),
  btnUpload:$('btnUpload'), btnReplay:$('btnReplay'),
  result:$('resultCard'), rBack:$('rBack'),
  rStyle:$('rStyle'), rPrint:$('rPrint'), rMat:$('rMat'), rCol:$('rCol'),
  p1:$('p1'),p2:$('p2'),p3:$('p3'),
  file:$('fileInput'),
};

/* ---- 竖屏取景窗：每帧把镜头对准画面重心（横屏 = 整帧居中，不平移） ---- */
function anchorOf(i){
  let a;
  if(i<=7)      a = 0.54;                       // 衣柜
  else if(i<=12) a = [0.56,0.62,0.68,0.72,0.75][i-8]; // 白布飞向镜
  else if(i<=18) a = 0.78;                      // 镜框
  else if(i<=28) a = [0.78,0.74,0.70,0.66,0.62,0.58,0.55,0.53,0.52,0.52][i-19]; // 缎带探出向下
  else if(i<=36) a = [0.54,0.56,0.58,0.60,0.57,0.55,0.53,0.55][i-29];           // 缎带回卷
  else if(i<=47) a = 0.55;                      // 衣柜开门
  else a = 0.50;                                // 药水机(中心)
  return a;
}
function setPortrait(){
  const p = window.innerHeight > window.innerWidth;
  document.getElementById('app').classList.toggle('isPortrait', p);
  if(state.cur) applyPan(state.cur);
}
function applyPan(i){
  if(!document.getElementById('app').classList.contains('isPortrait')){ el.pan.style.transform='translateX(0)'; return; }
  const vw = window.innerWidth, vh = window.innerHeight;
  const imgW = vh * 16 / 9;
  let a = anchorOf(i);
  // 视口可平移范围：a 需在 [vw/(2w), 1-vw/(2w)]
  const lo = vw/(2*imgW), hi = 1 - lo;
  a = Math.min(hi, Math.max(lo, a));
  const L = vw/2 - a*imgW;
  el.pan.style.transform = `translateX(${L}px)`;
}

/* ---- 每帧停留时长(ms)：按你 PPT 的动作节奏 ---- */
function durOf(i){
  // i: 1..63
  const HOLD = {1:900,2:760,13:560,14:640,15:980,18:680,28:720,36:640,42:600,45:680,48:900,49:980,54:540,62:720,63:1600};
  if(HOLD[i]) return HOLD[i];
  if(i>=3&&i<=12) return 230;    // 白布钻出/化烟飞向镜
  if(i>=19&&i<=27) return 250;   // 缎带探伸
  if(i>=29&&i<=35) return 250;   // 缎带回卷
  if(i>=37&&i<=44) return 290;   // 开门+白光
  if(i>=50&&i<=53) return 330;   // 毛线球游走/瓶出现
  if(i>=55&&i<=61) return 300;   // 瓶子灌液
  if(i>=46&&i<=47) return 480;
  return 260;
}

/* ---- 状态 ---- */
const state = { cur:0, playing:false, muted:false };let front = 'fA';   // 当前显示层

/* ---- 放映 ---- */
async function play(){
  if(state.playing) return;
  state.playing = true;
  el.finish.classList.add('hidden');
  const a = el.fA, b = el.fB;
  a.classList.remove('on'); b.classList.remove('on');
  a.src = F(1); b.src = F(2);
  await new Promise(res=>a.onload=res);
  a.classList.add('on');
  front='fA';
  state.cur = 1;
  applyPan(1);
  // 预载
  for(let k=3;k<=Math.min(8,N);k++){ const im=new Image(); im.src=F(k); }
  for(let i=2;i<=N;i++){
    await new Promise(res=>{
      // 装载下一帧后切换
      const nxt = (front==='fA') ? el.fB : el.fA;
      nxt.onload = () => {
        (front==='fA'?el.fA:el.fB).classList.remove('on');
        nxt.classList.add('on');
        front = (front==='fA'?'fB':'fA');
        state.cur = i;
        applyPan(i);
        // 预热后面两帧
        for(let k=i+1;k<=Math.min(i+2,N);k++){ const im=new Image(); im.src=F(k); }
        res();
      };
      nxt.src = F(i);
    });
    if(!state.playing) return;
    await sleep(durOf(i));
    if(!state.playing) return;
  }
  state.playing=false;
  endScreen();
}
const sleep = ms => new Promise(r=>setTimeout(r,ms));

function endScreen(){
  el.finish.classList.remove('hidden');
  SFX.chime();
}

/* 跳过 → 直接落版 */
async function skip(){
  if(!state.playing) return;
  state.playing = false;
  el.finish.classList.remove('hidden');
  SFX.chime();
}

/* ---- 示例结果（占位假数据） ---- */
const OUTFITS = [
  { g:'廓形西装', print:'纯色', mat:'羊毛', col:'藏青 · 燕麦 · 浅灰', p:['葡萄柚','鸢尾','雪松'] },
  { g:'宽松卫衣', print:'字母印花', mat:'棉', col:'雾灰 · 米黄 · 墨绿', p:['青柠','鼠尾草','檀木'] },
  { g:'一字肩针织', print:'纯色', mat:'羊绒', col:'酒红 · 浅粉 · 奶油白', p:['黑加仑','玫瑰','零陵香豆'] },
  { g:'法式碎花裙', print:'碎花', mat:'真丝', col:'奶油白 · 浅粉 · 杏', p:['佛手柑','小苍兰','白麝香'] },
];
function showSample(){
  const o = OUTFITS[Math.floor(Math.random()*OUTFITS.length)];
  el.rStyle.textContent=o.g;
  el.rPrint.textContent=o.print;
  el.rMat.textContent=o.mat;
  el.rCol.textContent=o.col;
  el.p1.textContent=o.p[0]; el.p2.textContent=o.p[1]; el.p3.textContent=o.p[2];
  el.result.classList.remove('hidden');
}

/* ---- 轻量音效 ---- */
const SFX = {
  ctx:null, unlocked:false,
  unlock(){ this.unlocked=true; if(!this.ctx){ const AC=window.AudioContext||window.webkitAudioContext; if(AC) this.ctx=new AC(); } if(this.ctx&&this.ctx.state==='suspended') this.ctx.resume(); },
  _ok(){ return this.unlocked && !state.muted && this.ctx; },
  chime(){
    if(!this._ok()) return;
    const c=this.ctx, n=[660,880,1320];
    n.forEach((f,i)=>{
      const o=c.createOscillator(),g=c.createGain();
      o.frequency.value=f; o.type='sine';
      g.gain.setValueAtTime(0.0001,c.currentTime+i*.11);
      g.gain.exponentialRampToValueAtTime(.12,c.currentTime+i*.11+.03);
      g.gain.exponentialRampToValueAtTime(.0001,c.currentTime+i*.11+.7);
      o.connect(g);g.connect(c.destination);o.start(c.currentTime+i*.11);o.stop(c.currentTime+i*.11+.8);
    });
  },
};
function toggleMute(){ state.muted=!state.muted; el.soundBtn.textContent=state.muted?'🔇':'🔊'; }
function bind(){
  el.frame = document.getElementById('frame');
  el.frame.addEventListener('click', skip);
  el.skipBtn.addEventListener('click', skip);
  el.soundBtn.addEventListener('click', toggleMute);
  el.btnReplay.addEventListener('click', ()=>{ SFX.unlock(); play(); });
  el.btnUpload.addEventListener('click', ()=>{ SFX.unlock(); el.file.click(); });
  el.file.addEventListener('change', ()=>{ el.file.value=''; showSample(); });
  el.rBack.addEventListener('click', ()=>el.result.classList.add('hidden'));
  ['pointerdown','touchstart','click'].forEach(ev=>document.addEventListener(ev, ()=>SFX.unlock()));
}

/* ---- 单帧静态显示（?frame=N 调试用：停播只显示第 N 帧） ---- */
async function showOnly(n){
  const a = el.fA, b = el.fB;
  a.classList.remove('on'); b.classList.remove('on');
  b.src = F(n);
  await new Promise(r=>{ b.onload=r; b.onerror=r; });
  b.classList.add('on');
  front = 'fB';
  state.cur = n;
  applyPan(n);
}

/* ---- 启动 ---- */
document.addEventListener('DOMContentLoaded', ()=>{
  bind();
  setPortrait();
  window.addEventListener('resize', ()=>setPortrait());
  const qp = new URLSearchParams(location.search);
  const f = parseInt(qp.get('frame')||'',10);
  if(f && f>=1 && f<=N){ showOnly(f); return; }
  const probe = new Image();
  probe.src = F(1);
  probe.onload = () => play();
  probe.onerror = () => { /* 若 frames 未生成则保持空场 */ };
});
