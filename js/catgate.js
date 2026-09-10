import { FilesetResolver, FaceDetector } from '../assets/vendor/vision_bundle.mjs';

/* ============================================================
   catgate.js — Worn-In 猫眼入口门
   眼睛跟随人脸，靠近显示 touch me，点击后眯眼笑 + 喵叫 +
   显示「let me make your clothes into a perfume」，然后放行进入网站
   ============================================================ */
(() => {
'use strict';

const GATE = document.getElementById('catGate');
const cv = document.getElementById('catCv');
const cctx = cv.getContext('2d');
const touchEl = document.getElementById('catTouch');
const perfumeEl = document.getElementById('catPerfume');

const MIRROR_X = true;      // 前置摄像头镜像
const CLOSE_AREA = 0.13;
const FAR_AREA = 0.08;
const HAPPY_MS = 1600;

const clamp = (v, a, b) => Math.max(a, Math.min(b, v));

let W = 0, H = 0, DPR = 1;
let lookX = 0, lookY = 0, targetX = 0, targetY = 0;
let eyeOpen = 1, blinking = false, blinkStart = 0, blinkDur = 180, nextBlink = 0;
let isClose = false, excite = 0;
let happy = false, happyUntil = 0, unlocking = false;
let faceDetector = null, camOk = false;

const video = document.createElement('video');
video.muted = true; video.playsInline = true; video.autoplay = true;
video.style.cssText = 'position:fixed;width:2px;height:2px;opacity:0;pointer-events:none;';
document.body.appendChild(video);

/* ---------- 尺寸 ---------- */
function resize(){
  DPR = Math.min(window.devicePixelRatio || 1, 3);
  W = window.innerWidth; H = window.innerHeight;
  cv.width = Math.round(W * DPR); cv.height = Math.round(H * DPR);
  cctx.setTransform(DPR, 0, 0, DPR, 0, 0);
}
window.addEventListener('resize', resize);
window.addEventListener('orientationchange', () => setTimeout(resize, 60));

/* ---------- 喵叫（Web Audio 合成） ---------- */
let actx = null;
function ensureAudio(){
  try{ if(!actx) actx = new (window.AudioContext || window.webkitAudioContext)(); if(actx.state === 'suspended') actx.resume(); return actx; }
  catch(e){ return null; }
}
function playMeow(){
  const ac = ensureAudio(); if(!ac) return;
  const t0 = ac.currentTime, dur = 0.55;
  const mk = (type, f0, f1, f2, peak) => {
    const o = ac.createOscillator(); o.type = type; const g = ac.createGain();
    o.frequency.setValueAtTime(f0, t0);
    o.frequency.linearRampToValueAtTime(f1, t0 + dur * 0.22);
    o.frequency.exponentialRampToValueAtTime(f2, t0 + dur * 0.9);
    const lfo = ac.createOscillator(); lfo.type = 'sine'; lfo.frequency.value = 26;
    const lg = ac.createGain(); lg.gain.value = f0 * 0.06;
    lfo.connect(lg); lg.connect(o.frequency);
    g.gain.setValueAtTime(0.0001, t0);
    g.gain.exponentialRampToValueAtTime(peak, t0 + dur * 0.14);
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
    o.connect(g); g.connect(ac.destination);
    o.start(t0); lfo.start(t0); o.stop(t0 + dur); lfo.stop(t0 + dur);
  };
  mk('triangle', 620, 1120, 430, 0.20);
  mk('sawtooth', 310, 560, 220, 0.05);
}

/* ---------- 绘制 ---------- */
function layout(){
  const eyeW = Math.min(W, H * 1.1) * 0.33;
  const eyeH = eyeW * 0.88;
  const gap = eyeW * 0.52;
  const cy = H * 0.42;
  const cxl = W / 2 - gap / 2 - eyeW / 2;
  const cxr = W / 2 + gap / 2 + eyeW / 2;
  return { eyeW, eyeH, cy, cxl, cxr };
}

function drawPupil(px, py, prx, pry){
  // 略呈菱形的竖瞳：上下尖、两侧微凸
  cctx.beginPath();
  cctx.moveTo(px, py - pry);
  cctx.quadraticCurveTo(px + prx * 1.12, py - pry * 0.12, px + prx, py);
  cctx.quadraticCurveTo(px + prx * 1.12, py + pry * 0.12, px, py + pry);
  cctx.quadraticCurveTo(px - prx * 1.12, py + pry * 0.12, px - prx, py);
  cctx.quadraticCurveTo(px - prx * 1.12, py - pry * 0.12, px, py - pry);
  cctx.closePath(); cctx.fill();
}

function drawLashes(cx, cy, ew, eh, dir){
  const p0 = { x: cx - dir * ew * 0.50, y: cy - eh * 0.04 };
  const p1 = { x: cx - dir * ew * 0.30, y: cy - eh * 0.58 };
  const p2 = { x: cx + dir * ew * 0.30, y: cy - eh * 0.58 };
  const p3 = { x: cx + dir * ew * 0.50, y: cy - eh * 0.16 };
  const bez = (t) => {
    const mt = 1 - t;
    return {
      x: mt*mt*mt*p0.x + 3*mt*mt*t*p1.x + 3*mt*t*t*p2.x + t*t*t*p3.x,
      y: mt*mt*mt*p0.y + 3*mt*mt*t*p1.y + 3*mt*t*t*p2.y + t*t*t*p3.y,
    };
  };
  const tang = (t) => {
    const mt = 1 - t;
    return {
      x: 3*mt*mt*(p1.x-p0.x) + 6*mt*t*(p2.x-p1.x) + 3*t*t*(p3.x-p2.x),
      y: 3*mt*mt*(p1.y-p0.y) + 6*mt*t*(p2.y-p1.y) + 3*t*t*(p3.y-p2.y),
    };
  };
  cctx.fillStyle = '#1c1108';
  const N = 9;
  for(let i = 0; i < N; i++){
    const t = 0.06 + 0.84 * (i / (N - 1));
    const b = bez(t);
    const tg = tang(t);
    let nx = -tg.y, ny = tg.x;
    if(ny > 0){ nx = -nx; ny = -ny; }
    const len = Math.hypot(nx, ny) || 1;
    nx /= len; ny /= len;
    const lashLen = eh * (0.20 + 0.18 * t);
    const w = eh * (0.075 + 0.03 * t);
    const tipX = b.x + nx * lashLen;
    const tipY = b.y + ny * lashLen;
    const bx = -ny, by = nx;
    cctx.beginPath();
    cctx.moveTo(b.x - bx * w / 2, b.y - by * w / 2);
    cctx.lineTo(b.x + bx * w / 2, b.y + by * w / 2);
    cctx.lineTo(tipX, tipY);
    cctx.closePath(); cctx.fill();
  }
}

function drawOpenEye(cx, cy, ew, eh, lid, dir){
  const ox = cx + lookX * eh * 0.14;
  const oy = cy + lookY * eh * 0.14;

  const path = new Path2D();
  path.moveTo(ox - dir * ew * 0.50, oy - eh * 0.04);
  path.bezierCurveTo(ox - dir * ew * 0.30, oy - eh * 0.58, ox + dir * ew * 0.30, oy - eh * 0.58, ox + dir * ew * 0.50, oy - eh * 0.16);
  path.bezierCurveTo(ox + dir * ew * 0.42, oy + eh * 0.40, ox - dir * ew * 0.42, oy + eh * 0.42, ox - dir * ew * 0.50, oy - eh * 0.04);
  path.closePath();

  cctx.save();
  cctx.clip(path);

  const ir = eh * 0.47;
  const ig = cctx.createRadialGradient(ox, oy, ir * 0.12, ox, oy, ir * 1.05);
  ig.addColorStop(0.00, '#e9f0a0');
  ig.addColorStop(0.35, '#c8d85f');
  ig.addColorStop(0.70, '#9cb644');
  ig.addColorStop(1.00, '#6c8c2e');
  cctx.fillStyle = ig;
  cctx.fillRect(ox - ew / 2, oy - eh / 2, ew, eh);

  cctx.save();
  cctx.translate(ox, oy);
  cctx.strokeStyle = 'rgba(90,110,40,0.28)';
  cctx.lineWidth = Math.max(0.8, ir * 0.055);
  for(let i = 0; i < 36; i++){
    const a = i / 36 * Math.PI * 2;
    const r0 = ir * 0.24, r1 = ir * 0.94;
    cctx.globalAlpha = 0.10 + 0.16 * Math.abs(Math.sin(a * 3 + 0.8));
    cctx.beginPath();
    cctx.moveTo(Math.cos(a) * r0, Math.sin(a) * r0);
    cctx.lineTo(Math.cos(a) * r1, Math.sin(a) * r1);
    cctx.stroke();
  }
  cctx.restore();

  const dil = 0.8 + excite * 0.8;
  const px = ox + lookX * ir * 0.50;
  const py = oy + lookY * ir * 0.50;
  const prx = Math.max(ew * 0.042, eh * 0.070) * dil;
  const pry = eh * 0.34 * dil;
  cctx.fillStyle = '#0a0a0a';
  drawPupil(px, py, prx, pry);

  cctx.strokeStyle = 'rgba(42,58,16,0.95)';
  cctx.lineWidth = Math.max(1.1, eh * 0.030);
  cctx.beginPath(); cctx.arc(ox, oy, ir * 0.97, 0, Math.PI * 2); cctx.stroke();

  const softGlow = (x, y, r, a) => {
    const g = cctx.createRadialGradient(x, y, 0, x, y, r);
    g.addColorStop(0, `rgba(255,255,255,${a})`);
    g.addColorStop(1, 'rgba(255,255,255,0)');
    cctx.fillStyle = g;
    cctx.beginPath(); cctx.arc(x, y, r, 0, Math.PI * 2); cctx.fill();
  };
  softGlow(ox - ir * 0.46, oy - ir * 0.50, ir * 0.24, 0.75);
  softGlow(ox + ir * 0.34, oy + ir * 0.40, ir * 0.12, 0.35);
  cctx.fillStyle = 'rgba(255,255,255,0.95)';
  cctx.beginPath(); cctx.arc(ox - ir * 0.46, oy - ir * 0.50, ir * 0.06, 0, Math.PI * 2); cctx.fill();

  cctx.restore();

  cctx.strokeStyle = '#1f1308';
  cctx.lineWidth = Math.max(1.6, eh * 0.05);
  cctx.lineJoin = 'round';
  cctx.stroke(path);

  if(lid < eh * 0.3) drawLashes(ox, oy, ew, eh, dir);

  if(lid > 0){
    cctx.save();
    cctx.clip(path);
    cctx.fillStyle = '#2b1a10';
    cctx.fillRect(ox - ew / 2, oy - eh / 2, ew, lid);
    cctx.restore();
  }
}

function drawSquintEye(cx, cy, ew, eh){
  const w = ew / 2;
  const y0 = cy + eh * 0.10;
  const top = cy - eh * 0.52;
  const bot = cy - eh * 0.22;
  cctx.fillStyle = '#1a1008';
  cctx.beginPath();
  cctx.moveTo(cx - w, y0);
  cctx.quadraticCurveTo(cx, top, cx + w, y0);
  cctx.quadraticCurveTo(cx, bot, cx - w, y0);
  cctx.closePath(); cctx.fill();
  cctx.strokeStyle = '#1a1008';
  cctx.lineWidth = Math.max(1.5, eh * 0.06);
  cctx.lineCap = 'round';
  for(const side of [-1, 1]){
    const ex = cx + side * w;
    cctx.beginPath();
    cctx.moveTo(ex - side * ew * 0.02, y0);
    cctx.lineTo(ex - side * ew * 0.05, y0 - eh * 0.16);
    cctx.stroke();
  }
}

function drawClosedEye(cx, cy, ew, eh){
  cctx.strokeStyle = '#1a1008';
  cctx.lineWidth = Math.max(2, eh * 0.07);
  cctx.lineCap = 'round';
  cctx.beginPath();
  cctx.moveTo(cx - ew / 2, cy);
  cctx.quadraticCurveTo(cx, cy + eh * 0.45, cx + ew / 2, cy);
  cctx.stroke();
}

function drawSparkle(x, y, r){
  cctx.save();
  cctx.translate(x, y);
  cctx.fillStyle = 'rgba(255,225,150,0.9)';
  cctx.beginPath();
  for(let i = 0; i < 8; i++){
    const a = i * Math.PI / 4;
    const rad = (i % 2 === 0) ? r : r * 0.35;
    const px = Math.cos(a) * rad, py = Math.sin(a) * rad;
    if(i === 0) cctx.moveTo(px, py); else cctx.lineTo(px, py);
  }
  cctx.closePath(); cctx.fill();
  cctx.restore();
}

function render(t){
  cctx.clearRect(0, 0, W, H);
  const L = layout();
  const breathe = 1 + Math.sin(t * 0.002) * 0.015;
  const eh = L.eyeH * breathe * (1 + excite * 0.05);

  for(const cx of [L.cxl, L.cxr]){
    const g = cctx.createRadialGradient(cx, L.cy, 0, cx, L.cy, L.eyeW * 0.75);
    g.addColorStop(0, 'rgba(150,185,70,0.12)');
    g.addColorStop(1, 'rgba(150,185,70,0)');
    cctx.fillStyle = g;
    cctx.beginPath(); cctx.arc(cx, L.cy, L.eyeW * 0.75, 0, Math.PI * 2); cctx.fill();
  }

  if(happy){
    drawSquintEye(L.cxl, L.cy, L.eyeW, eh);
    drawSquintEye(L.cxr, L.cy, L.eyeW, eh);
    drawSparkle(L.cxl - L.eyeW * 0.6, L.cy - eh * 0.85, eh * 0.16);
    drawSparkle(L.cxr + L.eyeW * 0.6, L.cy - eh * 0.85, eh * 0.13);
  } else if(eyeOpen < 0.45){
    drawClosedEye(L.cxl, L.cy, L.eyeW, eh);
    drawClosedEye(L.cxr, L.cy, L.eyeW, eh);
  } else {
    const lid = clamp((1 - eyeOpen) * 2, 0, 1) * eh * 1.15;
    drawOpenEye(L.cxl, L.cy, L.eyeW, eh, lid, -1);
    drawOpenEye(L.cxr, L.cy, L.eyeW, eh, lid, 1);
  }
}

/* ---------- 检测 ---------- */
function normBox(bb){
  if(bb.width <= 1 && bb.height <= 1 && bb.originX <= 1 && bb.originY <= 1){
    return { x: bb.originX + bb.width / 2, y: bb.originY + bb.height / 2, area: bb.width * bb.height };
  }
  const vw = video.videoWidth || 640;
  const vh = video.videoHeight || 480;
  return {
    x: (bb.originX + bb.width / 2) / vw,
    y: (bb.originY + bb.height / 2) / vh,
    area: (bb.width * bb.height) / (vw * vh),
  };
}

function processDetections(res){
  let best = null, bestArea = 0;
  const dets = (res && res.detections) ? res.detections : [];
  for(const d of dets){
    const n = normBox(d.boundingBox);
    if(n.area > bestArea){ bestArea = n.area; best = d; }
  }
  if(best){
    const n = normBox(best.boundingBox);
    targetX = clamp((MIRROR_X ? -1 : 1) * (n.x - 0.5) * 2.6, -1, 1);
    targetY = clamp((n.y - 0.5) * 2.6, -1, 1);
    isClose = n.area >= CLOSE_AREA ? true : (n.area <= FAR_AREA ? false : isClose);
  } else {
    isClose = false;
  }
}

async function initCam(){
  if(!window.isSecureContext) return false;
  if(!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) return false;
  try{
    const stream = await navigator.mediaDevices.getUserMedia({
      video: { facingMode: 'user', width: { ideal: 640 }, height: { ideal: 480 } }, audio: false,
    });
    video.srcObject = stream;
    await video.play().catch(() => {});
    return true;
  }catch(e){ return false; }
}

async function initDetector(){
  try{
    const vision = await FilesetResolver.forVisionTasks(location.origin + '/assets/vendor');
    const opts = (delegate) => ({
      baseOptions: { modelAssetPath: location.origin + '/assets/vendor/blaze_face_short_range.tflite', delegate },
      runningMode: 'VIDEO',
    });
    try{ faceDetector = await FaceDetector.createFromOptions(vision, opts('GPU')); }
    catch(e){ faceDetector = await FaceDetector.createFromOptions(vision, opts('CPU')); }
    return true;
  }catch(e){ return false; }
}

/* ---------- 主循环 ---------- */
function loop(t){
  requestAnimationFrame(loop);

  if(camOk && faceDetector && video.readyState >= 2 && video.videoWidth > 0){
    let res = null;
    try{ res = faceDetector.detectForVideo(video, t); }catch(e){}
    processDetections(res);
  } else {
    isClose = false;
    const s = t / 1000;
    targetX = Math.sin(s * 0.5) * 0.4;
    targetY = Math.sin(s * 0.8 + 1) * 0.25;
  }

  lookX += (targetX - lookX) * 0.22;
  lookY += (targetY - lookY) * 0.22;
  excite += ((isClose && !happy ? 1 : 0) - excite) * 0.12;

  if(blinking){
    const p = clamp((t - blinkStart) / blinkDur, 0, 1);
    eyeOpen = 1 - Math.sin(p * Math.PI);
    if(p >= 1) blinking = false;
  } else {
    eyeOpen = 1;
    if(t > nextBlink){
      blinking = true; blinkStart = t; blinkDur = 180;
      nextBlink = t + 2500 + Math.random() * 3000;
    }
  }

  if(happy && t > happyUntil){
    happy = false;
    if(!unlocking){ unlocking = true; unlock(); }
  }

  touchEl.classList.toggle('show', !happy && !unlocking && isClose);
  perfumeEl.classList.toggle('show', happy);

  render(t);
}

/* ---------- 点击 & 放行 ---------- */
function onTap(){
  if(unlocking || happy) return;
  happy = true;
  happyUntil = performance.now() + HAPPY_MS;
  isClose = false;
  playMeow();
}

function unlock(){
  if(video.srcObject){ video.srcObject.getTracks().forEach(t => t.stop()); video.srcObject = null; }
  if(GATE){
    GATE.style.transition = 'opacity .6s';
    GATE.style.opacity = '0';
    GATE.style.pointerEvents = 'none';
    setTimeout(() => { if(GATE.parentNode) GATE.parentNode.removeChild(GATE); }, 650);
  }
  window.__unlocked = true;
  if(window.__startWornIn) window.__startWornIn();
}

cv.addEventListener('pointerdown', onTap);
touchEl.addEventListener('pointerdown', (e) => { e.stopPropagation(); onTap(); });

async function boot(){
  resize();
  nextBlink = performance.now() + 1200;
  camOk = await initCam();
  if(camOk){
    const ok = await initDetector();
    if(!ok) camOk = false;
  }
  requestAnimationFrame(loop);
}
boot();
})();
