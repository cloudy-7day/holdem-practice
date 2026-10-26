import '../teaching/orientation.mjs';
import {requestJSON} from './network.mjs';
const $=id=>document.getElementById(id);
const make=(tag,text,cls)=>{const e=document.createElement(tag);if(text!=null)e.textContent=text;if(cls)e.className=cls;return e;};
const entryParams=new URL(location.href).searchParams;
const entryMode=entryParams.has('room')?'join':entryParams.get('mode');
if(['create','join'].includes(entryMode)){
 document.body.dataset.entryMode=entryMode;
 document.querySelector('#entry h1').textContent=entryMode==='join'?'加入朋友的房间':'创建好友房间';
 document.querySelector('#entry > p').textContent=entryMode==='join'?'填好昵称和房间码，就能一起入座。':'选好人数，开桌后把邀请发给朋友。';
}

let configured=false,configuring=false,retryAction=null;
let base='',snapshot=null,credential=null,busy=false,inflight=false,timer=null,epoch=0,reconnecting=false;
const storage={get(k){try{return localStorage.getItem(k);}catch{return null;}},set(k,v){try{localStorage.setItem(k,v);}catch{}},remove(k){try{localStorage.removeItem(k);}catch{}}};
const key=code=>`pokerth.friend.${code}`;
function status(message,error=false,action=null){
 $('status').textContent=message;$('status').classList.toggle('error',error);
 if(error)retryAction=action||(()=>credential?poll(true):init());
 $('retry').hidden=!error;$('connection-check').hidden=!error;$('retry').textContent='重新连接';
 if(error)requestAnimationFrame(()=>$('connection-feedback').scrollIntoView({block:'nearest'}));
}
function message(error){
 if(error.code==='network')return '未能连接房间服务。可切换 Wi-Fi / 流量后重试；当前网络可能无法访问服务地址。';
 if(error.code==='timeout')return '连接房间服务超时。可切换 Wi-Fi / 流量后重试；当前网络可能无法访问服务地址。';
 if(error.code==='invalid-json')return '房间服务返回了无法读取的内容，请稍后重试。';
 if(error.code==='http'&&[400,401,403,404,409,422,429].includes(error.status))return `${error.message}（${error.status}）`;
 if(error.code==='http')return `房间服务请求失败（${error.status}），请稍后重试。`;
 return error.message||'房间服务暂不可用，请重试。';
}
async function request(path,options={}){return requestJSON(`${base}/api/rooms${path}`,{cache:'no-store',...options,headers:{'Content-Type':'application/json',...(credential?{Authorization:`Bearer ${credential.token}`}:{ }),...options.headers}});}
function updateHistory(url){try{history.replaceState(null,'',url);}catch{}}
function resetRoom(){snapshot=null;}
function accept(next){
 if(!next||credential?.code!==next.code)return;
 if(snapshot&&Number(next.revision)<Number(snapshot.revision))return;
 snapshot=next;
 if(next.phase!=='waiting'){
  clearTimeout(timer);
  location.replace(new URL(`index.html?lang=zh&friend=1&room=${encodeURIComponent(next.code)}`,location.href));
  return;
 }
 render();status('已连接 · 等待朋友入座');
}
function schedule(){clearTimeout(timer);if(credential&&!document.hidden)timer=setTimeout(poll,1000);}
async function poll(initial=false){if(inflight||busy||!credential){schedule();return;}inflight=true;const ownEpoch=epoch;try{const result=await request(`/${encodeURIComponent(credential.code)}`);if(ownEpoch===epoch){accept(result.snapshot,initial||reconnecting);reconnecting=false;}}catch(error){if(ownEpoch===epoch&&[401,403,404].includes(error.status)){storage.remove(key(credential.code));credential=null;resetRoom();++epoch;$('room').hidden=true;$('entry').hidden=false;$('entry-actions').append($('connection-feedback'));status(message(error)+'。请重新加入或创建房间。',true);return;}reconnecting=true;if(ownEpoch===epoch)status(`连接中断：${message(error)} 将自动重试。`,true);}finally{inflight=false;if(snapshot)renderControls();schedule();}}
async function enter(create){if(busy||!configured)return;const name=$('name').value.trim(),code=$('code').value.trim().toUpperCase();if(!name){$('name').reportValidity();return;}if(!create&&!/^[A-Z0-9]{3,16}$/.test(code)){status('请填写邀请中的房间码',true);$('code').focus();return;}busy=true;entryDisabled(true);if(create)$('entry-actions').append($('connection-feedback'));else $('join').after($('connection-feedback'));status(create?'正在创建房间…':'正在加入房间…');$('connection-feedback').scrollIntoView({block:'nearest'});const ownEpoch=++epoch;try{credential=null;const data=await request(create?'':`/${encodeURIComponent(code)}/join`,{method:'POST',body:JSON.stringify(create?{name,config:{maxPlayers:Number($('seats').value),fillBots:$('bots').checked,startMoney:2000,smallBlind:10,turnSeconds:60}}:{name})});if(ownEpoch!==epoch)return;if(!data||typeof data.token!=='string'||!data.token||!data.snapshot||typeof data.snapshot.code!=='string'||!Array.isArray(data.snapshot.players)||!data.snapshot.config||typeof data.snapshot.phase!=='string')throw new Error('房间服务返回的房间信息不完整，请重试。');credential={code:data.snapshot.code,token:data.token};storage.set(key(credential.code),credential.token);storage.set('pokerth.friend.name',name);updateHistory(`${location.pathname}?room=${encodeURIComponent(credential.code)}`);resetRoom();accept(data.snapshot,true);$('room-actions').append($('connection-feedback'));$('room').scrollIntoView({block:'start'});schedule();}catch(error){status(message(error),true,()=>enter(create));$('retry').textContent=create?'重试创建房间':'重试加入房间';}finally{busy=false;entryDisabled(false);if(snapshot)renderControls();}}
function entryDisabled(value){for(const id of ['create','join'])$(id).disabled=value||!configured;}
async function command(type,extra={}){if(busy||!snapshot||!credential)return;busy=true;clearTimeout(timer);renderControls();const ownEpoch=epoch;try{while(inflight)await new Promise(resolve=>setTimeout(resolve,30));if(ownEpoch!==epoch)return;const data=await request(`/${encodeURIComponent(credential.code)}/command`,{method:'POST',body:JSON.stringify({type,requestId:globalThis.crypto?.randomUUID?.()||`${Date.now()}-${Math.random()}`,...extra})});if(ownEpoch!==epoch)return;if(type==='leave'){storage.remove(key(credential.code));credential=null;resetRoom();++epoch;updateHistory(location.pathname);$('room').hidden=true;$('entry').hidden=false;$('entry-actions').append($('connection-feedback'));status('已离桌。可以创建新桌或返回单人练习。');return;}accept(data.snapshot);}catch(error){status(message(error),true);}finally{busy=false;if(snapshot)renderControls();schedule();}}
function render(){
 const s=snapshot;$('room-actions').append($('connection-feedback'));$('entry').hidden=true;$('room').hidden=false;$('room-code').textContent=s.code;
 const box=$('players');box.replaceChildren();
 for(const p of s.players){
  const row=make('li',null,'member');
  row.append(make('strong',`${p.name}${p.id===s.heroId?' · 你':''}${p.id===s.hostId?' · 房主':''}`),make('span',p.isBot?'电脑':p.connected===false?'暂离 · 可重连':'已入座'));
  box.append(row);
 }
 renderControls();
}
function renderControls(){
 const s=snapshot;if(!s)return;
 $('start').hidden=s.hostId!==s.heroId;
 $('start').disabled=busy||(!s.config.fillBots&&s.players.length<2);
 $('leave').disabled=busy;
 $('waiting').textContent=`${s.players.filter(p=>!p.isBot).length} 位朋友已入座 · 最多 ${s.config.maxPlayers} 人${s.config.fillBots?' · 开始时电脑补齐空位':''}`;
 $('turn-label').textContent=s.hostId===s.heroId?'朋友到齐后，开始第一手。':'等待房主开始第一手。';
}
$('entry-form').addEventListener('submit',e=>{e.preventDefault();enter(entryMode!=='join');});$('join').addEventListener('click',()=>enter(false));$('start').addEventListener('click',()=>command('start'));$('leave').addEventListener('click',()=>command('leave'));
$('invite').addEventListener('click',async()=>{const url=new URL(location.pathname,location.origin);url.searchParams.set('room',credential.code);const text=`来我的 PokerTH 教学桌：${url.href}\n房间码：${credential.code}`;try{await navigator.clipboard.writeText(text);status('邀请已复制，发给朋友即可。');}catch{status(`邀请链接：${url.href} · 房间码 ${credential.code}`);}});
$('retry').addEventListener('click',()=>{if(retryAction)retryAction();});document.addEventListener('visibilitychange',()=>{if(document.hidden)clearTimeout(timer);else poll(true);});window.addEventListener('online',()=>poll(true));
async function init(){if(configuring)return;configuring=true;configured=false;entryDisabled(true);status('正在连接牌桌服务…');const code=(new URL(location.href).searchParams.get('room')||'').toUpperCase();if(!$('code').value)$('code').value=code;if(!$('name').value)$('name').value=storage.get('pokerth.friend.name')||'';try{const config=await requestJSON('multiplayer-config.json',{cache:'no-store'});if(!config||typeof config?.apiBase!=='string')throw new Error('房间服务地址配置不正确');const candidate=config.apiBase.replace(/\/$/,'');if(candidate){let parsed;try{parsed=new URL(candidate);}catch{throw new Error('房间服务地址配置不正确');}if(!['https:','http:'].includes(parsed.protocol)||parsed.username||parsed.password)throw new Error('房间服务地址配置不正确');}base=candidate;configured=true;if(code){const token=storage.get(key(code));if(token){credential={code,token};await poll(true);return;}}status('准备就绪 · 创建一桌或输入房间码');}catch(error){configured=false;status(`房间服务暂不可用：${message(error)}`,true,()=>init());}finally{configuring=false;entryDisabled(busy);}}
document.documentElement.dataset.roomClientReady='true';
window.dispatchEvent(new Event('poker-room-client-ready'));
init();
