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

