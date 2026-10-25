import { analyzeHand } from './analysis.mjs';
self.onmessage=({data})=>{
  try { self.postMessage({ok:true,analysis:analyzeHand(data.report)}); }
  catch(error) { self.postMessage({ok:false,error:error?.message||'复盘计算失败'}); }
};
