// Presentation consumes public teaching packets and already-rendered board only.
// The upstream renderer owns dealing, board flips and seat-to-pot transfers.
const root = document.documentElement;
const animations = new Map();
let activeId = null, dealerId = null, finished = false, frame = 0, generation = 0, lastPot = null;
const media = matchMedia('(prefers-reduced-motion: reduce)');
function motionEnabled() {
  try { const setting = localStorage.getItem('pth_teaching_motion'); return setting === null ? !media.matches : setting !== '0'; }
  catch { return !media.matches; }
}
function cancelTransfers() {
  for (const [animation, element] of animations) { animation.cancel(); element.remove(); }
  animations.clear();
}
function settings() {
  root.classList.toggle('tc-motion-off', !motionEnabled());
  if (!motionEnabled()) cancelTransfers();
}
function seat(id) { return document.querySelector(`#g-seats .seat[data-pid="${Number(id)}"]`); }
function center(element) {
  const r = element?.getBoundingClientRect();
  return r && r.width && r.height ? {x:r.left+r.width/2,y:r.top+r.height/2} : null;
}
function sync() {
  frame = 0;
  for (const el of document.querySelectorAll('#g-seats .seat')) {
    el.classList.toggle('tc-turn', !finished && Number(el.dataset.pid) === activeId);
    el.classList.toggle('tc-dealer', Number(el.dataset.pid) === dealerId);
  }
  // Count visible rendered cards, never consult the engine's undealt board.
  const count = document.querySelectorAll('#g-comm > [data-c]:not(.comm-slot)').length;
  const pot = document.getElementById('g-potbar');
  const visiblePot = center(pot);
  if (visiblePot) lastPot = visiblePot;
  if (pot) pot.dataset.street = finished ? '本手结束' : count >= 5 ? '河牌 · 最后一轮' : count === 4 ? '转牌 · 第三轮' : count >= 3 ? '翻牌 · 第二轮' : '翻牌前 · 第一轮';
}
function scheduleSync() { if (!frame) frame = requestAnimationFrame(sync); }
function settle(report) {
  if (!motionEnabled()) return;
  // Upstream clears its pot badge before publishing complete.
  const from = center(document.getElementById('g-potbar')) || lastPot;
  if (!from) return;
  for (const id of new Set(report?.winnerIds || [])) {
    const to = center(seat(id));
    if (!to) continue;
    // Three stacked chips represent a transfer, not a fabricated amount.
    for (let i = 0; i < 3; i++) {
      const el = document.createElement('span');
      el.className = 'tc-settlement-chip'; el.setAttribute('aria-hidden','true');
      el.style.left = `${from.x - 11 + i*3}px`; el.style.top = `${from.y - 11 - i*3}px`;
      document.body.append(el);
      const animation = el.animate([
        {transform:'translate(0,0) scale(.85)',opacity:0},
        {transform:'translate(0,0) scale(1)',opacity:1,offset:.12},
        {transform:`translate(${to.x-from.x}px,${to.y-from.y}px) scale(.75)`,opacity:1,offset:.86},
        {transform:`translate(${to.x-from.x}px,${to.y-from.y}px) scale(.65)`,opacity:0}
      ],{duration:650,delay:i*75,easing:'cubic-bezier(.22,.7,.25,1)',fill:'both'});
      animations.set(animation,el);
      animation.finished.then(()=>{animations.delete(animation);el.remove();},()=>{animations.delete(animation);el.remove();});
    }
  }
}
window.addEventListener('pth-teaching', ({detail:p}) => {
  if (!p) return;
  if (p.type === 'reset' || p.type === 'handStart') {
    generation++; cancelTransfers(); lastPot = null; activeId = null; finished = false; dealerId = p.dealerId ?? null;
    document.querySelectorAll('.fly-chip,.flying-chip,.fly-card,.allin-chip,.confetti-piece,.win-star').forEach(el=>el.remove());
  } else if (p.type === 'thinking') activeId = Number(p.playerId);
  else if (p.type === 'turn') activeId = Number(p.context?.playerId ?? 1);
  else if (p.type === 'action') activeId = null;
  else if (p.type === 'complete') { activeId = null; finished = true; const current=generation; requestAnimationFrame(()=>{if(current===generation && finished)settle(p.report);}); }
  scheduleSync();
});
// Seat nodes may be replaced by the upstream renderer; preserve current state.
const observer = new MutationObserver(scheduleSync);
for (const id of ['g-seats','g-comm']) { const el=document.getElementById(id); if(el) observer.observe(el,{childList:true,subtree:true}); }
window.addEventListener('pth-motion-settings',settings);
media.addEventListener('change',settings);
window.addEventListener('pagehide',()=>{cancelTransfers();if(frame)cancelAnimationFrame(frame);observer.disconnect();});
settings(); scheduleSync();
