/* Keep geometry independent of upstream auto-fit, using only CSS variables. */
const query=matchMedia('(max-width:760px), (max-width:1000px) and (max-height:500px)');
let frame=0;
export function syncMobileLayout(){
 if(!query.matches)return;
 const zone=document.querySelector('#g-table-zone'),seats=document.querySelector('#g-seats');
 if(!zone||!seats)return;
 const actions=document.querySelector('.my-zone'),area=document.querySelector('.game-area');
 // Read layout before changing any seat styles, so this pass needs no forced reflow.
 const actionHeight=actions?`${Math.ceil(actions.getBoundingClientRect().height)+4}px`:null;
 const headerHeight=area?`${Math.max(0,Math.round(area.getBoundingClientRect().top))}px`:null;
 let i=0;
 for(const seat of seats.children){if(seat.classList.contains('me'))continue;
  const x=`calc(${(i%4)*25}% + 3px)`,y=`${Math.floor(i/4)*65+6}px`;
  if(seat.style.getPropertyValue('--tc-seat-x')!==x)seat.style.setProperty('--tc-seat-x',x);
  if(seat.style.getPropertyValue('--tc-seat-y')!==y)seat.style.setProperty('--tc-seat-y',y);i++;
 }
 const rootStyle=document.documentElement.style;
 if(actionHeight&&rootStyle.getPropertyValue('--tc-action-height')!==actionHeight)rootStyle.setProperty('--tc-action-height',actionHeight);
 if(headerHeight&&rootStyle.getPropertyValue('--tc-header-height')!==headerHeight)rootStyle.setProperty('--tc-header-height',headerHeight);
}
function schedule(){if(!frame)frame=requestAnimationFrame(()=>{frame=0;syncMobileLayout();});}
addEventListener('resize',schedule);visualViewport?.addEventListener('resize',schedule);query.addEventListener('change',schedule);
function init(){
 const actions=document.querySelector('.my-zone');if(actions)new ResizeObserver(schedule).observe(actions);
 const seats=document.querySelector('#g-seats');
 if(seats)new MutationObserver(records=>{if(records.some(r=>r.type==='childList' || (r.target.parentElement===seats && r.target.classList.contains('seat'))))schedule();}).observe(seats,{subtree:true,childList:true,attributes:true,attributeFilter:['class']});
 new MutationObserver(schedule).observe(document.body,{attributes:true,attributeFilter:['class']});
 // Append after upstream and theme sheets to resolve equal-specificity rules.
 const sheet=document.querySelector('link[href="/holdem-practice/modules/teaching/mobile.css"]');if(sheet)document.head.append(sheet);
 schedule();
}
if(document.readyState==='loading')addEventListener('DOMContentLoaded',init);else init();
schedule();
/* Upstream deal positions belong to its ellipse. Retarget the visual flight
   to the actual mobile seats without changing cards or game state. */
let dealt=0;
addEventListener('pth-teaching',({detail})=>{if(detail?.type==='handStart'||detail?.type==='reset')dealt=0;});
new MutationObserver(records=>{
 if(!query.matches)return;
 for(const record of records)for(const node of record.addedNodes){
  if(!(node instanceof HTMLElement)||!node.classList.contains('fly-card'))continue;
  const seats=[...document.querySelectorAll('#g-seats .seat:not(.seat-ghost)')];
  if(!seats.length)continue;
  const seat=node.classList.contains('mine')?seats.find(s=>s.classList.contains('me')):seats[(dealt%seats.length)];
  dealt++;
  const target=seat?.getBoundingClientRect(),pot=document.querySelector('#g-potbar')?.getBoundingClientRect();
  if(!target||!pot)continue;
  node.animate([{left:`${pot.left+pot.width/2-13}px`,top:`${pot.top+pot.height/2-18}px`,transform:'rotate(-8deg) scale(.7)'},{left:`${target.left+target.width/2-13}px`,top:`${target.top+target.height/2-18}px`,transform:'rotate(0deg) scale(1)'}],{duration:380,easing:'cubic-bezier(.2,.8,.3,1)',fill:'forwards'});
 }
}).observe(document.documentElement,{childList:true,subtree:true});

