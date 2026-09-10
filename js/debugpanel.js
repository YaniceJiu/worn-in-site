/* ============================================================
   临时调试小框：展示 AI 分析的完整结果（颜色用真实色块）。
   之后要删除：直接删掉 play.html 里 <script src="js/debugpanel.js"> 这一行即可。
   不要在此文件里写任何业务逻辑。
   ============================================================ */
(function(){
  if(document.getElementById('aiDebugPanel')) return;
  let shown=null;

  function esc(s){ return String(s==null?'':s).replace(/[&<>"]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c])); }

  function swatches(colors){
    const items=(colors||[]).map(c=>{
      const hex=(c&&c.hex)||'#ffffff';
      return '<span class="dbg-swatch"><i style="background:'+hex+'"></i>'+esc(c&&c.name)+' '+hex+'</span>';
    }).join('');
    return '<div class="dbg-colors">'+items+'</div>';
  }

  function render(r){
    const el=document.getElementById('aiDebugPanel'); if(!el) return;
    const rec=r.recipe||{}, c=r.colors||[];
    const rows=[
      ['款式', r.gar||'—'],
      ['材质', r.fabric||'—'],
      ['印花', r.pattern||'—'],
      ['领口', r.collar||'—'],
      ['风格', (r.style||'')+(r.variant?' · '+r.variant:'')],
    ];
    el.innerHTML =
      '<div class="dbg-h">AI 分析（调试）<button class="dbg-x" onclick="this.parentNode.parentNode.remove()">✕</button></div>'+
      rows.map(([k,v])=>'<div class="dbg-row"><span>'+esc(k)+'</span><b>'+esc(v)+'</b></div>').join('')+
      '<div class="dbg-row"><span>颜色</span></div>'+swatches(c)+
      '<div class="dbg-row"><span>前调</span><b>'+esc((rec.top||[]).join(' · '))+'</b></div>'+
      '<div class="dbg-row"><span>中调</span><b>'+esc((rec.mid||[]).join(' · '))+'</b></div>'+
      '<div class="dbg-row"><span>后调</span><b>'+esc((rec.base||[]).join(' · '))+'</b></div>'+
      '<div class="dbg-row dbg-copy"><span>文案</span></div>'+
      '<ol class="dbg-lines">'+((r.copy||[]).map(t=>'<li>'+esc(t)+'</li>').join(''))+'</ol>';
  }

  function poll(){
    let r=null;
    if(window.PLAY && window.PLAY.getResult) r=window.PLAY.getResult();
    if(r && r!==shown){ shown=r; render(r); }
    setTimeout(poll,300);
  }

  const style=document.createElement('style');
  style.textContent=
    '#aiDebugPanel{position:fixed;top:10px;right:10px;z-index:200;width:min(320px,92vw);max-height:74vh;overflow:auto;background:rgba(20,16,12,.88);backdrop-filter:blur(8px);-webkit-backdrop-filter:blur(8px);border:1px solid #4a4134;border-radius:12px;padding:10px 12px;color:#eee;font-size:12px;line-height:1.55;font-family:sans-serif}'+
    '#aiDebugPanel .dbg-h{font-weight:700;color:#e6c383;margin-bottom:6px;display:flex;justify-content:space-between;align-items:center}'+
    '#aiDebugPanel .dbg-x{background:none;border:none;color:#ddd;cursor:pointer;font-size:15px;padding:0 2px}'+
    '#aiDebugPanel .dbg-row{display:flex;gap:8px;margin:3px 0}'+
    '#aiDebugPanel .dbg-row span{color:#9a8c78;min-width:34px}'+
    '#aiDebugPanel .dbg-row b{color:#eee;font-weight:600}'+
    '#aiDebugPanel .dbg-colors{display:flex;flex-wrap:wrap;gap:6px;margin:4px 0 6px}'+
    '#aiDebugPanel .dbg-swatch{display:inline-flex;align-items:center;gap:5px;background:rgba(255,255,255,.06);border-radius:6px;padding:2px 6px}'+
    '#aiDebugPanel .dbg-swatch i{width:14px;height:14px;border-radius:3px;display:inline-block;border:1px solid rgba(0,0,0,.35)}'+
    '#aiDebugPanel .dbg-lines{margin:2px 0 0 18px;color:#d8cdbc}'+
    '#aiDebugPanel .dbg-lines li{margin:2px 0}';
  document.head.appendChild(style);

  const div=document.createElement('div'); div.id='aiDebugPanel'; document.body.appendChild(div);
  poll();
})();
