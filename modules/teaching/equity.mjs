import { evaluateCardCodes, handRank } from '../../vendor/phe.mjs';
const RS='23456789TJQKA', SS='dhsc', names=['同花顺','四条','葫芦','同花','顺子','三条','两对','一对','高牌'];
const num=x=>Math.max(0,Number(x)||0);
const label=c=>(c%13===8?'10':RS[c%13])+['♦','♥','♠','♣'][Math.floor(c/13)];
const readable=c=>['方块','红桃','黑桃','梅花'][Math.floor(c/13)]+RS[c%13];
const notation=pair=>{const ranks=pair.map(c=>c%13).sort((a,b)=>b-a);return RS[ranks[0]]+RS[ranks[1]]+(ranks[0]===ranks[1]?'':Math.floor(pair[0]/13)===Math.floor(pair[1]/13)?'s':'o');};
const code=c=>(c%13)*4+[2,1,0,3][Math.floor(c/13)];
const rank=cards=>evaluateCardCodes(cards.map(code));
function rng(seed){return ()=>{seed|=0;seed=seed+0x6D2B79F5|0;let t=Math.imul(seed^seed>>>15,1|seed);t^=t+Math.imul(t^t>>>7,61|t);return ((t^t>>>14)>>>0)/4294967296;};}
function hash(s){let h=2166136261;for(const c of s)h=Math.imul(h^c.charCodeAt(0),16777619);return h>>>0;}
function draws(hole,board){
 if(board.length<3||board.length>4)return [];
 const known=[...hole,...board], unseen=Array.from({length:52},(_,i)=>i).filter(c=>!known.includes(c)), out=[];
 const add=(name,cards)=>{if(cards.length)out.push({name,outs:cards.length,cards:cards.map(label),nextCardProbability:cards.length/unseen.length,byRiverProbability:board.length===3?1-(unseen.length-cards.length)*(unseen.length-cards.length-1)/(unseen.length*(unseen.length-1)):cards.length/unseen.length,note:'补成该牌型的名义概率，不是获胜概率；可能与其他听牌重叠，也可能输给更大牌。'});};
 for(let s=0;s<4;s++)if(known.filter(c=>Math.floor(c/13)===s).length===4&&hole.some(c=>Math.floor(c/13)===s))add('同花听牌',unseen.filter(c=>Math.floor(c/13)===s));
 const ranks=new Set(known.map(c=>c%13));if(ranks.has(12))ranks.add(-1);
 const missing=new Set();let already=false;
 for(let start=-1;start<=8;start++){const seq=Array.from({length:5},(_,i)=>start+i);const lack=seq.filter(r=>!ranks.has(r));if(lack.length===0)already=true;if(lack.length===1&&seq.some(r=>hole.some(c=>c%13===(r===-1?12:r))))missing.add(lack[0]===-1?12:lack[0]);}
 if(!already&&missing.size)add(missing.size>=2?'两头或双卡顺听牌':'卡顺听牌',unseen.filter(c=>missing.has(c%13)));
 return out;
}
function strength(pair,board){
 const [a,b]=pair.map(c=>c%13),suited=Math.floor(pair[0]/13)===Math.floor(pair[1]/13);
 if(board.length<3)return Math.min(1,(a===b?.48+a*.04:Math.max(a,b)/22+Math.min(a,b)/42+(suited?.09:0)+(Math.abs(a-b)<=2?.06:0)));
 const cat=handRank(rank([...pair,...board]));
 const top=Math.max(...board.map(c=>c%13));const paired=pair.some(c=>board.some(b=>b%13===c%13));
 let v=[1,.99,.97,.94,.90,.84,.70,.40,.08][cat];
 if(cat===7)v=paired?(pair.some(c=>c%13===top)?.61:.39):a===b?.48:.22;
 if(cat===8)v+=Math.max(a,b)/120;
 if(draws(pair,board).length)v+=.16;
 return Math.min(1,v);
}
function rangeFor(player,context,deck){
 const board=context.board||[];
 const hist=(context.publicHistory||[]).filter(a=>a.playerId===player.id);
 const agg=hist.filter(a=>a.isAggressive===true||(a.isAggressive!==false&&['bet','raise','allin'].includes(a.action)));const calls=hist.filter(a=>a.action==='call'||(a.action==='allin'&&a.isAggressive===false));
 const post=agg.filter(a=>(a.street||a.gameState)!=='preflop');
 const tight=/tight|nit|紧/.test(player.style||'');const loose=/loose|maniac|松/.test(player.style||'');
 // Each likelihood is conditioned on information available when that action occurred.
 // Missing legacy snapshots use only the corresponding prefix, never later streets.
 const evidence=hist.flatMap(a=>{
  const street=a.street||a.gameState||context.gameState||context.legal?.street;
  const length={preflop:0,flop:3,turn:4,river:5}[street];
  if(length===undefined||length>board.length)return [];
  const snapshot=Array.isArray(a.board)&&a.board.length===length&&a.board.every((c,i)=>c===board[i])?a.board:board.slice(0,length);
  const aggressive=a.isAggressive===true||(a.isAggressive!==false&&['bet','raise','allin'].includes(a.action));
  const call=a.action==='call'||(a.action==='allin'&&a.isAggressive===false);
  if(!aggressive&&!call&&a.action!=='check')return [];
  const sizing=Math.min(2,num(a.paid)/Math.max(1,num(a.potBefore)));
  return [{board:snapshot,aggressive,call,power:(aggressive?2:1)+(aggressive?sizing*.5:0)+(tight?.3:loose?-.3:0)}];
 });
 const combos=[];for(let i=0;i<deck.length;i++)for(let j=i+1;j<deck.length;j++){
 const pair=[deck[i],deck[j]],s=strength(pair,context.board||[]);
 // A broad prior remains broad without voluntary action. Bounded likelihoods
 // preserve bluff/missed-draw tails instead of treating aggression as certainty.
 let w=.8+.4*strength(pair,[]);
 for(const e of evidence){const then=strength(pair,e.board);w*=(e.aggressive||e.call)?(.12+.88*Math.pow(then,e.power)):(1-.25*then);}
 combos.push({pair,s,w});}
 const descriptions=[];if(agg.length)descriptions.push(`此前${agg.length}次下注/加注（翻后${post.length}次），提高成牌和强听牌权重`);else if(calls.length)descriptions.push(`此前${calls.length}次跟注，保留中等成牌和听牌`);else descriptions.push('尚无主动入池行动，强牌、中等牌与可发展的牌都可能出现');
 const sorted=[...combos].sort((a,b)=>b.w-a.w), chosen=[], classes=new Set();
 const take=c=>{if(c&&!classes.has(notation(c.pair))){chosen.push(c);classes.add(notation(c.pair));}};
 // Show distinct rank classes, then a plausible draw/bluff tail rather than four suit variants of the nuts.
 if(agg.length){for(const c of sorted){take(c);if(chosen.length===2)break;}}
 else {
  take(sorted[0]);
  take(sorted.find(c=>c.s>=.35&&c.s<=.65&&!classes.has(notation(c.pair))));
  const developing=board.length>=3?sorted.find(c=>draws(c.pair,board).length&&!classes.has(notation(c.pair))):sorted.find(c=>Math.floor(c.pair[0]/13)===Math.floor(c.pair[1]/13)&&Math.abs(c.pair[0]%13-c.pair[1]%13)===1&&Math.max(...c.pair.map(x=>x%13))<=8&&!classes.has(notation(c.pair)));
  take(developing);
  take([...sorted].reverse().find(c=>c.s>=.15&&c.s<.4&&!classes.has(notation(c.pair))));
 }
 if(agg.length&&board.length>=3)take(sorted.find(c=>draws(c.pair,board).length&&handRank(rank([...c.pair,...board]))>=7&&!classes.has(notation(c.pair))));
 if(agg.length)take([...sorted].reverse().find(c=>c.s>=.2&&c.s<.5&&!classes.has(notation(c.pair))));
 for(const c of sorted){if(chosen.length>=4)break;take(c);}
 const examples=chosen.slice(0,4).map(x=>`${notation(x.pair)}（${x.pair.map(readable).join('、')}${board.length>=3?(draws(x.pair,board).length?`；${names[handRank(rank([...x.pair,...board]))]}＋${draws(x.pair,board).map(d=>d.name).join('、')}`:handRank(rank([...x.pair,...board]))===8?(agg.length?'；小权重诈唬候选':'；高牌候选'):'；成牌候选'):''}）`);
 return {playerId:player.id,name:player.name||`玩家${player.id}`,description:descriptions.join('；')+'；下列仅为可能底牌的示例，不代表对手实际持牌或完整范围',examples,combos};
}
function simulate(ranges,hole,board,deck,samples,seed,power,layers){
 const random=rng(seed), prepared=ranges.map(r=>{let total=0;const values=r.combos.map(c=>({pair:c.pair,cumulative:total+=Math.pow(c.w,power)}));return {values,total};});let result=0;
 for(let i=0;i<samples;i++){
  const used=new Set([...hole,...board]), opponents=[];
  for(const r of prepared){let pair;for(let tries=0;tries<300;tries++){const t=random()*r.total;let lo=0,hi=r.values.length-1;while(lo<hi){const m=(lo+hi)>>1;if(r.values[m].cumulative<t)lo=m+1;else hi=m;}const p=r.values[lo].pair;if(!used.has(p[0])&&!used.has(p[1])){pair=p;break;}}if(!pair){const avail=deck.filter(c=>!used.has(c));pair=[avail[0],avail[1]];}pair.forEach(c=>used.add(c));opponents.push(pair);}
  const run=[...board];while(run.length<5){const c=deck[Math.floor(random()*deck.length)];if(!used.has(c)){run.push(c);used.add(c);}}
  const hero=rank([...hole,...run]),scores=opponents.map(p=>rank([...p,...run]));
  if(layers){let award=0;for(const layer of layers){let ties=1,win=true;for(const index of layer.opponents){const v=scores[index];if(v<hero){win=false;break;}if(v===hero)ties++;}if(win)award+=layer.amount/ties;}result+=award;}
  else {let ties=1,win=true;for(const v of scores){if(v<hero){win=false;break;}if(v===hero)ties++;}if(win)result+=1/ties;}
 }return result/samples;
}
export function evaluateSpot(context={},options={}){
 const hole=context.hole||[],board=context.board||[],legal=context.legal||{};const callCost=Math.min(num(legal.callAmt??context.callAmt),num(context.stack));
 const publicPlayers=context.publicPlayers||[];const heroId=context.playerId??1;
 const opponents=publicPlayers.length?publicPlayers.filter(p=>p.id!==heroId&&!p.folded):Array.from({length:Math.max(1,num(context.numActive||context.numPlayers||2)-1)},(_,i)=>({id:i+100,name:`对手${i+1}`}));
 const pot=num(legal.pot??context.pot);let potEligible=pot;
 if(publicPlayers.length&&Number.isFinite(context.heroTotalCommitted)){
 const cap=num(context.heroTotalCommitted)+callCost;const accounted=publicPlayers.reduce((s,p)=>s+num(p.committed),0);
 potEligible=publicPlayers.reduce((s,p)=>s+Math.min(num(p.committed),cap),0)+Math.max(0,pot-accounted);
 }
 const cap=num(context.heroTotalCommitted)+callCost;
 const hero=publicPlayers.find(p=>p.id===heroId);
 const complete=Number.isFinite(context.heroTotalCommitted)&&hero&&num(hero.committed)===num(context.heroTotalCommitted)&&publicPlayers.every(p=>Number.isFinite(p.committed)&&p.committed>=0)&&publicPlayers.reduce((s,p)=>s+p.committed,0)===pot;
 const unmatched=complete&&opponents.some(p=>!p.allin&&num(p.committed)<cap);
 const shortAllin=Number.isFinite(context.heroTotalCommitted)&&opponents.some(p=>p.allin&&num(p.committed)<cap);
 let layers=null;
 if(complete&&!unmatched){
  const projected=publicPlayers.map(p=>({...p,committed:p.id===heroId?cap:p.committed}));
  const levels=[...new Set(projected.map(p=>Math.min(p.committed,cap)).filter(x=>x>0))].sort((a,b)=>a-b);
  let previous=0;layers=levels.map(top=>{const amount=projected.reduce((s,p)=>s+Math.max(0,Math.min(p.committed,top)-previous),0);const eligible=opponents.flatMap((p,i)=>p.committed>=top?[i]:[]);previous=top;return {amount,opponents:eligible};});
 }
 const complexSidepots=!layers&&shortAllin;
 const unknownShortCall=!publicPlayers.length&&callCost<num(context.currentBet)-num(context.streetCommitted);
 const uncertainPot=complexSidepots||unknownShortCall;
 const threshold=uncertainPot?null:callCost>0?callCost/(potEligible+callCost):0;
 const base={equityModel:layers?'layered':'showdown',equity:null,equityLow:null,equityHigh:null,threshold,callCost,potEligible,callEV:null,opponentCount:opponents.length,ranges:[],draws:[],madeHand:'未知',assumptions:['范围由此前公开行动作启发式加权，不是求解器或对手实际底牌。','上下界为更窄/更宽范围情景的敏感性，不是统计置信区间。','EV仅假定跟注后无人再投入、直接摊牌的当前底池模型；不含后续下注、弃牌率或额外边池。'],sampleCount:0};
 if(hole.length!==2||board.length>5||[...hole,...board].some(c=>!Number.isInteger(c)||c<0||c>51)||new Set([...hole,...board]).size!==hole.length+board.length)return base;
 const deck=Array.from({length:52},(_,i)=>i).filter(c=>![...hole,...board].includes(c));
 const ranges=opponents.map(p=>rangeFor(p,context,deck));
 const samples=Math.max(100,Math.min(10000,Math.floor(options.samples||1200)));
 const seed=hash(JSON.stringify({hole,board,players:opponents.map(p=>({id:p.id,committed:p.committed})),history:(context.publicHistory||[]).map(a=>({playerId:a.playerId,action:a.action,paid:a.paid,totalStreetBet:a.totalStreetBet,street:a.street||a.gameState,board:a.board,isAggressive:a.isAggressive,potBefore:a.potBefore,callBefore:a.callBefore,currentBet:a.currentBet})),pot,callCost}));
 const projectedPot=potEligible+callCost;
 const eq=[1,.55,1.65].map(power=>simulate(ranges,hole,board,deck,samples,seed,power,layers)/(layers?Math.max(1,projectedPot):1));
 return {...base,equity:eq[0],equityLow:Math.min(...eq),equityHigh:Math.max(...eq),callEV:uncertainPot?null:eq[0]*(potEligible+callCost)-callCost,assumptions:[...base.assumptions,...(layers?['按公开贡献投影本次跟注，逐层计算主池和边池；权益为可争底池的加权预期份额，弃牌筹码计入底池但不参与比牌。']:[]),...(uncertainPot?[unmatched?'边池仍有未匹配投入的非全下对手可能继续行动：不假定英雄独赢新增贡献层，不提供跟注门槛或EV。':'边池分层或短码可争取底池不完整：胜率仅为全部活跃对手摊牌份额，不提供跟注门槛或EV。']:[])],ranges:ranges.map(({combos,...r})=>r),draws:draws(hole,board),madeHand:board.length>=3?names[handRank(rank([...hole,...board]))]:hole[0]%13===hole[1]%13?'口袋对子':'未成对底牌',sampleCount:samples};
}
