// Keep range simulation off the rendering thread so review controls stay responsive.
const cache=new WeakMap();
export function analyzeHandAsync(report){
  if(cache.has(report))return cache.get(report);
  const pending=new Promise((resolve,reject)=>{
    let worker;
    try{worker=new Worker(new URL('./review-worker.mjs',import.meta.url),{type:'module'});}
    catch(error){reject(new Error('无法启动复盘计算，请刷新页面后重试。'));return;}
    const timeout=setTimeout(()=>finish(null,new Error('复盘计算超时。可以先查看底牌，或手动继续下一手。')),30000);
    function finish(value,error){clearTimeout(timeout);worker.terminate();error?reject(error):resolve(value);}
    worker.onmessage=({data})=>data.ok?finish(data.analysis):finish(null,new Error(data.error));
    worker.onerror=()=>finish(null,new Error('复盘计算未完成，请重新打开页面后重试。'));
    worker.postMessage({report});
  });
  cache.set(report,pending);pending.catch(()=>cache.delete(report));return pending;
}
