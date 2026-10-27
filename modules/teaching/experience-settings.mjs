import Music from '../music.mjs';
/* Chinese teaching fork — AGPL-3.0-or-later. Shared setup/table preferences. */
const groups=[];
const el=(tag,text)=>{const n=document.createElement(tag);if(text!=null)n.textContent=text;return n;};
const read=(key,fallback)=>{try{return localStorage.getItem(key)??fallback;}catch{return fallback;}};
const write=(key,value)=>{try{if(value==='auto')localStorage.removeItem(key);else localStorage.setItem(key,value);}catch{}};
function createAudioControls(){
  const box=el('div');box.className='tc-audio-controls';
  const mute=el('button','♫'),music=el('button','♪');
  for(const [button,kind] of [[mute,'sound'],[music,'music']]){button.type='button';button.className='tc-audio-icon tc-'+kind+'-toggle';box.append(button);}
  mute.addEventListener('click',()=>{window.SOUNDS?.toggleSound();sync();});
  music.addEventListener('click',()=>{void Music.toggleTeaching().then(sync);});
  return {box,mute,music};
}
function createSettings(id,expanded=false){
  const box=el('section');box.className='tc-experience';box.id=id;
  const bar=el('div');bar.className='tc-experience-bar';bar.append(el('strong','牌桌视听'));
  const controls=createAudioControls();bar.append(controls.box);const mute=controls.mute;box.append(bar);
  const details=el('details');details.open=expanded;details.append(el('summary','音量、试听与动画'));
  const grid=el('div');grid.className='tc-experience-grid';details.append(grid);
  const volumeLabel=el('label','音效音量');const volume=el('input');volume.type='range';volume.min='0';volume.max='100';volume.step='5';volume.id=id+'-volume';volumeLabel.htmlFor=volume.id;
  const output=el('output');output.htmlFor=volume.id;const volumeWrap=el('div');volumeWrap.className='tc-volume-wrap';volumeWrap.append(volume,output);grid.append(volumeLabel,volumeWrap);
  const musicLabel=el('label','背景音乐音量');const musicVolume=el('input');musicVolume.type='range';musicVolume.min='0';musicVolume.max='100';musicVolume.step='5';musicVolume.id=id+'-music-volume';musicLabel.htmlFor=musicVolume.id;grid.append(musicLabel,musicVolume);
  musicVolume.addEventListener('input',()=>{Music.setTeachingVolume(Number(musicVolume.value)/100);sync();});
  const profileLabel=el('label','声音风格');const profile=el('select');profile.id=id+'-profile';profileLabel.htmlFor=profile.id;
  for(const [value,text] of [['table','纸牌与筹码'],['original','PokerTH 原版']]){const option=el('option',text);option.value=value;profile.append(option);}grid.append(profileLabel,profile);
  const motionLabel=el('label','动态效果');const motion=el('select');motion.id=id+'-motion';motionLabel.htmlFor=motion.id;
  for(const [value,text] of [['auto','跟随系统'],['1','完整动画'],['0','减少动态']]){const option=el('option',text);option.value=value;motion.append(option);}grid.append(motionLabel,motion);
  const previews=el('div');previews.className='tc-audio-previews';
  for(const [sample,label] of [['deal','发牌'],['raise','筹码'],['turn','轮到你']]){
    const button=el('button','试听'+label);button.type='button';button.dataset.sample=sample;
    button.addEventListener('click',()=>{const api=window.SOUNDS;if(!api)return;if(!api.isSoundEnabled())api.toggleSound();api.previewSample(sample);sync();});previews.append(button);
  }
  details.append(previews,el('p','试听会开启音效；♫ 控制音效，♪ 控制背景音乐。音乐需点击开启，刷新后保持暂停。'));box.append(details);
  volume.addEventListener('input',()=>{window.SOUNDS?.setSoundVolume(Number(volume.value)/100);sync();});
  profile.addEventListener('change',()=>{window.SOUNDS?.setSoundProfile(profile.value);sync();});
  motion.addEventListener('change',()=>{write('pth_teaching_motion',motion.value);window.dispatchEvent(new Event('pth-motion-settings'));sync();});
  groups.push({box,mute,music:controls.music,musicVolume,volume,output,profile,motion});return box;
}
function sync(){
  const api=window.SOUNDS;
  for(const g of groups){
    const enabled=api?.isSoundEnabled?.()??read('pth_sound','1')!=='0';
    g.mute.setAttribute('aria-label',enabled?'关闭游戏音效':'开启游戏音效');g.mute.title=enabled?'关闭游戏音效':'开启游戏音效';g.mute.setAttribute('aria-pressed',String(enabled));
    const playing=Music.isTeachingPlaying();g.music.setAttribute('aria-pressed',String(playing));g.music.setAttribute('aria-label',playing?'暂停背景音乐':'播放背景音乐');g.music.title=playing?'暂停背景音乐':'播放背景音乐';
    if(Music.getTeachingError()){g.music.title=Music.getTeachingError();g.music.setAttribute('aria-label',g.music.title);}
    if(!(window.AudioContext||window.webkitAudioContext)){g.music.disabled=true;g.music.title='此浏览器不支持背景音乐';g.music.setAttribute('aria-label',g.music.title);}
    if(g.musicVolume)g.musicVolume.value=String(Math.round(Music.getTeachingVolume()*100));
    g.mute.disabled=!api;
    if(!g.volume)continue;
    const vol=Math.round(100*(api?.getSoundVolume?.()??Number(read('pth_sound_vol','0.45'))));g.volume.value=String(vol);g.output.textContent=vol+'%';
    g.profile.value=api?.getSoundProfile?.()??read('pth_sound_profile','table');
    g.motion.value=read('pth_teaching_motion','auto');
  }
}
function mount(){
  const setup=document.getElementById('create-form');
  if(setup&&!document.getElementById('tc-setup-experience'))setup.prepend(createSettings('tc-setup-experience',true));
  const legacySound=document.getElementById('sound-toggle-btn');
  if(legacySound&&!document.getElementById('tc-header-audio')){
    const quick=createAudioControls();quick.box.id='tc-header-audio';
    legacySound.before(quick.box);legacySound.hidden=true;legacySound.style.display='none';
    groups.push(quick);
  }
  const panel=document.getElementById('teaching-panel');
  if(panel&&!document.getElementById('tc-table-experience')){
    const menu=el('details');menu.className='tc-experience-flyout';
    const trigger=el('summary','⚙');trigger.setAttribute('aria-label','声音与动画设置');trigger.title='声音与动画设置';
    menu.append(trigger,createSettings('tc-table-experience',true));
    const close=el('button','收起设置');close.type='button';close.className='tc-settings-close';
    close.addEventListener('click',()=>{menu.open=false;menu.querySelector('summary').focus();});
    menu.querySelector('.tc-experience').append(close);
    panel.querySelector('.tc-head')?.after(menu);
  }
  sync();return !!setup&&!!panel&&!!legacySound;
}
if(!mount()){
  const observer=new MutationObserver(()=>{if(document.getElementById('create-form')&&document.getElementById('teaching-panel')&&document.getElementById('sound-toggle-btn')){observer.disconnect();mount();}});observer.observe(document.body,{childList:true,subtree:true});
}
window.addEventListener('pth-sound-settings',sync);
window.addEventListener('pth-motion-settings',sync);
window.addEventListener('storage',sync);
window.addEventListener('pth-teaching',e=>{if(e.detail?.type==='handStart')sync();});
setTimeout(sync,500);

window.addEventListener('pth-music-settings',sync);
