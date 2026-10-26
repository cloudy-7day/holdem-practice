const failure=(code,message,status)=>Object.assign(new Error(message),{code,...(status?{status}:{})});

// One deadline covers headers AND body parsing. Never automatically replay a
// create/join/action POST: the server may have committed it before a disconnect.
export async function requestJSON(url,options={}, {timeoutMs=12000}={}){
 const controller=new AbortController();let timer;
 const timeout=failure('timeout','连接超时，未收到服务器结果。请检查网络后重试。');
 const deadline=new Promise((_,reject)=>{timer=setTimeout(()=>{reject(timeout);controller.abort();},timeoutMs);});
 const operation=(async()=>{
  let response,text;
  try{response=await fetch(url,{cache:'no-store',...options,signal:controller.signal});text=await response.text();}
  catch{throw failure('network','当前网络未能连接服务器。请尝试切换 Wi-Fi／手机流量后重试；当前网络可能无法访问服务地址。');}
  let data;try{data=JSON.parse(text);}catch{
   if(!response.ok)throw failure('http',`房间服务暂时无法响应（HTTP ${response.status}），请稍后重试。`,response.status);
   throw failure('invalid-json','服务器返回的数据不完整或格式不正确，请重试。');
  }
  if(!response.ok)throw failure('http',typeof data?.error==='string'?data.error.slice(0,240):`牌桌请求失败（HTTP ${response.status}），请重试。`,response.status);
  return data;
 })();
 try{return await Promise.race([operation,deadline]);}finally{clearTimeout(timer);}
}
