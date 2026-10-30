// Use the viewport, not a device-name list; preserve the layout while a keyboard opens.
let frame=0,referenceWidth=0,referenceHeight=0;
function update(){
 frame=0;
 const width=innerWidth,height=innerHeight;
 const editing=document.activeElement?.matches('input,textarea,[contenteditable="true"]');
 const keyboard=editing&&Math.abs(width-referenceWidth)<30&&height<referenceHeight-100;
 if(!keyboard){
  referenceWidth=width;referenceHeight=height;
  const compact=width<=760||(width<=1100&&height<=600);
  const mode=compact?(width>height?'landscape':'portrait'):'desktop';
  document.documentElement.dataset.phoneLayout=mode;
  const hint=document.getElementById('phone-orientation');
  if(hint){
   const text=mode==='landscape'?'建议转回竖屏，获得更完整的牌桌和操作空间。':'';
   if(hint.textContent!==text)hint.textContent=text;
  }
 }
 document.documentElement.style.setProperty('--phone-height',`${height}px`);
}
function schedule(){if(!frame)frame=requestAnimationFrame(update);}
function init(){
 const style=document.createElement('link');style.rel='stylesheet';style.href=new URL('./orientation.css',import.meta.url).href;document.head.append(style);
 const hint=document.createElement('aside');hint.id='phone-orientation';hint.setAttribute('aria-label','手机握持建议');hint.setAttribute('aria-live','polite');
 const header=document.querySelector('.mp-page > .top');
 if(header)header.after(hint);else document.body.append(hint);
 update();
}
addEventListener('resize',schedule);addEventListener('orientationchange',schedule);
globalThis.visualViewport?.addEventListener('resize',schedule);
if(document.readyState==='loading')addEventListener('DOMContentLoaded',init,{once:true});else init();
