/* Local Chinese teaching fork defaults, AGPL-3.0-or-later. */
window.POKER_TEACHING_LOCAL = true;
try {
  localStorage.setItem('pth_lang','zh');
  localStorage.setItem('pth_server_mode','offline');
  localStorage.setItem('pth_poker_en','0');
  localStorage.setItem('pth_pause_hands','1');
  localStorage.setItem('pth_voice','0');
  // Preserve mute and volume choices; the setup screen offers an explicit preview.
  if(localStorage.getItem('pth_sound')===null) localStorage.setItem('pth_sound','1');
  if(localStorage.getItem('pth_sound_vol')===null) localStorage.setItem('pth_sound_vol','0.45');
  if(!localStorage.getItem('pth_nick')) localStorage.setItem('pth_nick','我');
} catch (_) {}

const mobileStyle=document.createElement('link');mobileStyle.rel='stylesheet';mobileStyle.href='/holdem-practice/modules/teaching/mobile.css';document.head.append(mobileStyle);


// A separate friend table shares the existing rules and personal review engine.
function addFriendEntry(){
 if(document.getElementById('tc-friend-entry'))return;
 const link=document.createElement('a');link.id='tc-friend-entry';link.href='https://cloudy-7day.github.io/holdem-practice/multiplayer.html';link.textContent='朋友联机 →';
 const style=document.createElement('style');style.textContent='#tc-friend-entry{position:fixed;right:12px;top:max(12px,env(safe-area-inset-top));z-index:1100;padding:10px 14px;border:1px solid #b9a269;border-radius:10px;color:#f1d99a;background:#132c25;font:600 14px system-ui;text-decoration:none}body.tc-active #tc-friend-entry{display:none}';
 document.head.append(style);document.body.append(link);
}
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',addFriendEntry,{once:true});else addFriendEntry();

import('./modules/teaching/orientation.mjs');
