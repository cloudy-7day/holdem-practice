import {createRoomSocket} from './native-socket.mjs';
import {createFriendInputGuard} from './friend-input-guard.mjs';
import {requestJSON} from './network.mjs';
import {mountRoomSocial} from './social.mjs';

// Friends and solo practice share the entire PokerTH renderer and action bar.
// Only the source of authoritative game messages changes.
if(new URL(location.href).searchParams.get('friend')==='1') startRoom();

async function startRoom(){
 const code=(new URL(location.href).searchParams.get('room')||'').toUpperCase();
 const home=new URL('index.html?lang=zh',location.href);
 const lobby=new URL('multiplayer.html',location.href);lobby.searchParams.set('room',code);
 const key=`pokerth.friend.${code}`;
 let token;try{token=localStorage.getItem(key);}catch{}
 if(!token){location.replace(lobby);return;}
 document.body.classList.add('friend-table');
 const style=document.createElement('link');style.rel='stylesheet';style.href=new URL('./native-room.css',import.meta.url);document.head.append(style);
 const socialStyle=document.createElement('link');socialStyle.rel='stylesheet';socialStyle.href=new URL('./social.css',import.meta.url);document.head.append(socialStyle);
 const loading=document.createElement('div');loading.id='friend-loading';loading.textContent='正在回到好友牌桌…';document.body.append(loading);
 const bar=document.createElement('div');bar.id='friend-bar';bar.setAttribute('aria-label','好友房间');
 const label=document.createElement('span');label.id='friend-status';label.setAttribute('role','status');
 const retry=document.createElement('button');retry.textContent='重试';retry.hidden=true;
 const leave=document.createElement('button');leave.textContent='离桌';
 bar.append(label,retry,leave);document.querySelector('#s-game > .header').after(bar);
 const socialHost=document.createElement('div');socialHost.id='friend-social';bar.after(socialHost);
 let base='',socket=null,state=null,lastPacket=null,connected=false,pending=false,social=null,actionPending=null;
 const guard=createFriendInputGuard({getTurn:()=>state?.turn,getHero:()=>state?.heroId,getKeys:()=>window._keyBindings?.()||{}});
 for(const type of ['keydown','keyup','pointerdown','click'])document.addEventListener(type,event=>{if(!guard(event)){event.preventDefault();event.stopImmediatePropagation();}},true);
 const text=(value,error=false)=>{label.textContent=value;bar.classList.toggle('error',error);};
 async function request(path,body){
  const result=await requestJSON(`${base}/api/rooms/${encodeURIComponent(code)}${path}`,{method:body?'POST':'GET',headers:{Authorization:`Bearer ${token}`,...(body?{'Content-Type':'application/json'}:{})},...(body?{body:JSON.stringify({...body,requestId:crypto.randomUUID?.()||`${Date.now()}-${Math.random()}`})}:{})});
  if(body?.type!=='leave'&&(!result?.snapshot||result.snapshot.code!==code||!Array.isArray(result.snapshot.players)))throw new Error('房间服务返回的数据不完整，请重试。');
  return result?.snapshot;
 }
 function update(){
  if(!state)return;
  const host=state.hostId===state.heroId;
  const phase=state.phase==='review'?(host?'你是房主 · 可发下一手':'等待房主发下一手'):state.phase==='finished'?'本场已结束':state.turn?`第 ${state.handNumber} 手 · ${state.turn.playerId===state.heroId?'轮到你':state.players.find(p=>p.id===state.turn.playerId)?.name||'对手'} · ${Math.max(0,Math.ceil((state.turn.deadline-Date.now())/1000))} 秒`:'';
  if(connected)text(actionPending?`房间 ${code} · 正在提交操作… ${Math.floor((Date.now()-actionPending.started)/1000)} 秒，请勿重复点击`:`房间 ${code} · ${phase}`);
  const next=document.getElementById('teaching-next-hand');
  if(next&&state.report){next.disabled=pending||!connected||(!host&&state.phase==='review');next.textContent=state.phase==='finished'?'本场结束 · 返回首页':host?'下一手 →':'等待房主发下一手';}
 }
 function publish(packet){
  if(packet.type==='roomSync'){
   // Old persisted rooms lack an event journal. Restore their public totals
   // directly instead of inventing bets that would pollute the hand history.
   const sync=packet.snapshot,s=window.PthState;
   if(s){for(const p of sync.players){s.seatData[p.id]??={};Object.assign(s.seatData[p.id],{money:p.stack,bet:p.streetCommitted,folded:p.folded,active:p.in});}
    s.collectedPot=Math.max(0,sync.pot-sync.players.reduce((n,p)=>n+p.streetCommitted,0));s.pot=sync.pot;s.highestBet=sync.currentBet;s.minRaise=sync.minRaise;s._handSbPid=sync.sbId;s._handBbPid=sync.bbId;s.dealerPid=sync.dealerId;s.handNum=sync.handNumber;
    window.setPot?.(sync.pot);window.renderSeats?.();
   }
   return;
  }
  lastPacket=packet;window.dispatchEvent(new CustomEvent('pth-teaching',{detail:packet}));loading.remove();update();
 }
 async function sendCommand(command){const marker=command.type==='action'?{started:Date.now(),turnId:command.turnId}:null;if(marker){actionPending=marker;update();}try{return await request('/command',command);}finally{if(marker&&actionPending===marker){actionPending=null;update();}}}
 async function voiceRequest(id,blob,durationMs){
  const controller=new AbortController(),timeout=setTimeout(()=>controller.abort(),12000);
  try{
   const response=await fetch(`${base}/api/rooms/${encodeURIComponent(code)}/voice${id?'/'+encodeURIComponent(id):''}`,{method:blob?'POST':'GET',headers:{Authorization:`Bearer ${token}`,...(blob?{'Content-Type':blob.type,'X-Voice-Duration-Ms':String(durationMs)}:{})},...(blob?{body:blob}:{}),cache:'no-store',signal:controller.signal});
   if(!response.ok){let error;try{error=(await response.json()).error;}catch{}throw new Error(error||'语音请求失败，请重试');}
   return blob?await response.json():await response.blob();
  }finally{clearTimeout(timeout);}
 }
 async function exitRoom(){if(pending)return;pending=true;try{await sendCommand({type:'leave'});try{localStorage.removeItem(key);}catch{}socket?.close();location.assign(home);}catch(e){connected=false;text(e.message,true);}finally{pending=false;update();}}
 leave.addEventListener('click',exitRoom);
 retry.addEventListener('click',()=>socket?socket.refresh().catch(e=>text(e.message,true)):location.reload());
 const timer=setInterval(update,1000);
 window.addEventListener('pagehide',()=>{clearInterval(timer);social?.destroy();socket?.close();});
 window.addEventListener('pageshow',e=>{if(e.persisted)location.reload();});
 try{
  const config=await requestJSON(new URL('multiplayer-config.json',location.href));
  if(typeof config?.apiBase!=='string')throw new Error('房间服务配置不正确');base=config.apiBase.replace(/\/$/,'');
  state=await request('');if(state.phase==='waiting'){location.replace(lobby);return;}
  social=mountRoomSocial({container:socialHost,heroId:state.heroId,
   sendEmoji:async emoji=>{if(!socket)throw new Error('牌桌正在连接');await socket.command({type:'emoji',emoji});},
   sendVoice:async(blob,durationMs)=>{await voiceRequest(null,blob,durationMs);await socket?.refresh();},
   loadVoice:id=>voiceRequest(id)});social.update(state.socialMessages||[]);
  await import('../offline/index.mjs');
  const deadline=Date.now()+30000;while(!window.App?.connect||document.readyState==='loading'||!window._appConfigSettled){if(Date.now()>deadline)throw new Error('牌桌还没加载好，请刷新重试');await new Promise(r=>setTimeout(r,100));}
  window.PokerTeaching={
   getState:()=>lastPacket,
   nextHand(){
    if(pending||!connected||!socket||state.phase!=='review'||state.hostId!==state.heroId)return false;
    pending=true;socket.command({type:'next'}).catch(e=>{connected=false;text(e.message,true);document.getElementById('teaching-open-review')?.click();}).finally(()=>{pending=false;update();});return true;
   },
   leaveRoom:exitRoom
  };
  window.PokerOffline.createSocket=()=>{
   socket=createRoomSocket({snapshot:state,sendCommand,fetchSnapshot:()=>request(''),publish,onLeave:()=>{try{localStorage.removeItem(key);}catch{}location.assign(home);},onStatus:status=>{
    connected=status.connected&&!status.error;state=status.snapshot||state;retry.hidden=!status.error;
    if(actionPending&&state.turn?.turnId!==actionPending.turnId)actionPending=null;
    if(window.PthState){window.PthState._preAction='';window.PthState._playingMode=0;}
    social?.update(state.socialMessages||[]);
    if(status.error)text(`房间 ${code} · ${status.error} · 自动重连中`,true);else update();
   }});return socket;
  };
  window.PokerOffline.resumeNextHand=()=>false;
  window.PokerRoom={getSnapshot:()=>state,refresh:()=>socket?.refresh()};
  // Offline's native leave shortcut normally disconnects without a LeaveGame
  // packet; explicitly leave the authoritative room only on user activation.
  window.App.leaveGame=exitRoom;window.App.disconnect=exitRoom;
  const mode=document.getElementById('server-mode');mode.value='offline';mode.dispatchEvent(new Event('change',{bubbles:true}));
  const name=state.players.find(p=>p.id===state.heroId)?.name||'朋友';window._pthNick?.set(name);document.getElementById('nick').value=name;
  // This HTTP transport does not need the native WebSocket/SW takeover delay.
  window._swReadyOnce=true;
  window.App.connect({_gameChecked:true});
 }catch(e){loading.textContent=`${e.message}。`;const again=document.createElement('button');again.textContent='重新连接';again.onclick=()=>location.reload();const back=document.createElement('a');back.href=home;back.textContent='返回首页';loading.append(again,back);text(e.message,true);}
}
