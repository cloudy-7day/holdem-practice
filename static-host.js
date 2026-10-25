/* Static hosting adapter: preserve the offline server contract without a backend. */
(()=>{
 const base="/holdem-practice/",config={"modes":{"offline":true,"lan":false,"pokerthnet":false},"loginDefaults":{"mode":"offline"},"serverName":"PokerTH · 中文教学桌","serverTagline":"先打一手，再看懂每个决定。由你决定何时继续。","tableDefaults":{"players":9,"blind":10,"stack":2000,"timeout":120},"defaults":{"voice":"0","sound":"0","assist":"1"},"musicEnabled":false,"featureOff":["voice","forum","chat_translate","err_report"]},revision="b8d7158e6be7123b882620ca2e2650ab945ddd62";
 window.POKER_TEACHING_LOCAL=true;
 const nativeFetch=window.fetch.bind(window),nativeBeacon=navigator.sendBeacon?.bind(navigator);
 const json=value=>new Response(JSON.stringify(value),{headers:{'Content-Type':'application/json'}});
 function local(input){try{const u=new URL(typeof input==='string'?input:input.url||String(input),location.href);if(u.origin!==location.origin)return null;return {url:u,path:u.pathname.startsWith(base)?'/'+u.pathname.slice(base.length):u.pathname};}catch{return null;}}
 const telemetry=p=>['/__visit','/__error','/clienterr'].includes(p);
 window.fetch=(input,init)=>{
  const target=local(input);
  if(target){const p=target.path;
   if(p==='/app-config')return Promise.resolve(json(config));
   if(p==='/__ver')return Promise.resolve(json({version:revision,ver:revision}));
   if(telemetry(p))return Promise.resolve(new Response(null,{status:204}));
   if(['/cards/decks.json','/seats/seats.json','/table/tables.json'].includes(p))return Promise.resolve(json([]));
   if(p.startsWith('/api/'))return Promise.resolve(json({enabled:false,items:[],players:[],events:[],count:0}));
   if(!target.url.pathname.startsWith(base)){target.url.pathname=base+target.url.pathname.slice(1);return nativeFetch(input instanceof Request?new Request(target.url,input):target.url,init);}
  }
  return nativeFetch(input,init);
 };
 if(nativeBeacon)navigator.sendBeacon=(url,data)=>{const target=local(url);return target&&telemetry(target.path)?true:nativeBeacon(url,data);};
 const nativeOpen=XMLHttpRequest.prototype.open;
 XMLHttpRequest.prototype.open=function(method,url,...args){const target=local(url);if(target&&!target.url.pathname.startsWith(base)){target.url.pathname=base+target.url.pathname.slice(1);url=target.url.href;}return nativeOpen.call(this,method,url,...args);};
})();
