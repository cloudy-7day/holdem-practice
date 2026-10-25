/* Keep geometry independent of upstream auto-fit, using only CSS variables. */
const query=matchMedia('(max-width:760px), (max-width:1000px) and (max-height:500px)');
let frame=0;
export function syncMobileLayout(){
 if(!query.matches)return;
 const zone=document.querySelector('#g-table-zone'),seats=document.querySelector('#g-seats');
 if(!zone||!seats)return;
 let i=0;
 for(const seat of seats.children){if(seat.classList.contains('me'))continue;
  seat.style.setProperty('--tc-seat-x',`calc(${(i%4)*25}% + 3px)`);
  seat.style.setProperty('--tc-seat-y',`${Math.floor(i/4)*(innerHeight<500?55:65)+6}px`);i++;
 }
 const actions=document.querySelector('.my-zone');
 if(actions) document.documentElement.style.setProperty('--tc-action-height',`${Math.ceil(actions.getBoundingClientRect().height)+4}px`);
 const area=document.querySelector('.game-area');if(area)document.documentElement.style.setProperty('--tc-header-height',`${Math.round(area.getBoundingClientRect().top)}px`);
}
function schedule(){if(!frame)frame=requestAnimationFrame(()=>{frame=0;syncMobileLayout();});}
new MutationObserver(schedule).observe(document.documentElement,{subtree:true,childList:true,attributes:true,attributeFilter:['class']});
addEventListener('resize',schedule);visualViewport?.addEventListener('resize',schedule);query.addEventListener('change',schedule);
function init(){
 const actions=document.querySelector('.my-zone');if(actions)new ResizeObserver(schedule).observe(actions);
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
