import {bestHand} from '../offline/engine.mjs';
const ranks=['2','3','4','5','6','7','8','9','10','J','Q','K','A'], suits=['方块','红桃','黑桃','梅花'];
const finite=x=>typeof x==='number'&&Number.isFinite(x);
const num=x=>finite(x)?x:0;
const show=c=>ranks[c%13]+['♦','♥','♠','♣'][Math.floor(c/13)];
const compare=(a,b)=>{for(let i=0;i<Math.max(a.length,b.length);i++){const d=(a[i]||0)-(b[i]||0);if(d)return d;}return 0;};
// Only visible blockers are used. Examples are legal weaker made hands, not reads.
function targets(c,score,weaker=true){
 const used=new Set([...c.hole,...c.board]),deck=Array.from({length:52},(_,i)=>i).filter(x=>!used.has(x)),out=[],seen=new Set();
 const choices=[];
 for(let i=0;i<deck.length;i++)for(let j=i+1;j<deck.length;j++){
  const pair=[deck[i],deck[j]],s=bestHand([...pair,...c.board]);
  if(s[0]>=1&&(weaker?compare(s,score)<0:compare(s,score)>0))choices.push({pair,s});
 }
 choices.sort((a,b)=>weaker?compare(b.s,a.s):compare(a.s,b.s));
 for(const x of choices){const key=x.pair.map(z=>z%13).sort().join(',');if(seen.has(key))continue;seen.add(key);out.push(x.pair.map(show).join(' '));if(out.length===2)break;}
 return out.join('、');
}
function drawFacts(c,score){
 const known=[...c.hole,...c.board],deck=Array.from({length:52},(_,i)=>i).filter(x=>!known.includes(x)),out=new Set(),parts=[];
 if(c.board.length<3||c.board.length>=5)return null;
 for(let s=0;s<4;s++)if(score[0]<5&&known.filter(x=>Math.floor(x/13)===s).length===4&&c.hole.some(x=>Math.floor(x/13)===s)){
  const hits=deck.filter(x=>Math.floor(x/13)===s);hits.forEach(x=>out.add(x));parts.push(`一张${suits[s]}补同花`);
 }
 if(score[0]<4){
  const hits=deck.filter(x=>{const rs=new Set([...known,x].map(z=>z%13));if(rs.has(12))rs.add(-1);const publicRanks=new Set([...c.board,x].map(z=>z%13));if(publicRanks.has(12))publicRanks.add(-1);return Array.from({length:10},(_,i)=>i-1).some(start=>{const line=Array.from({length:5},(_,i)=>start+i);return line.every(r=>rs.has(r))&&line.some(r=>!publicRanks.has(r));});});
  if(hits.length){hits.forEach(x=>out.add(x));parts.push(`${[...new Set(hits.map(x=>ranks[x%13]))].join('或')}补顺子`);}
 }
 return out.size?{text:parts.join('；'),count:out.size,prob:(100*out.size/deck.length).toFixed(1)}:null;
}
function price(e,c){
 if((c.publicPlayers||[]).some(p=>p.allin)||e.potEligible<c.legal?.pot)return "涉及全下或只能争部分底池，不能用整个底池把这次跟注说成便宜。";
 if(!finite(e.threshold))return '这次能争哪些筹码不清楚，不能只按底池金额判断。';
 return `若忽略平分和后续下注，约要${(100*e.threshold).toFixed(0)}%的赢面才值这个跟注价。`;
}
function missedDraw(c,score){
 if(c.board.length!==5)return '';
 const used=new Set([...c.hole,...c.board]);
 for(let suit=0;suit<4;suit++){
  if(c.board.slice(0,4).filter(x=>Math.floor(x/13)===suit).length!==2||Math.floor(c.board[4]/13)===suit)continue;
  const deck=Array.from({length:13},(_,r)=>suit*13+r).filter(x=>!used.has(x));
  for(let i=0;i<deck.length;i++)for(let j=i+1;j<deck.length;j++)if(bestHand([...c.board,deck[i],deck[j]])[0]===0&&compare(bestHand([...c.board,deck[i],deck[j]]),score)<0)return `没补中的${suits[suit]}听牌`;
 }
 return '';
}
export function buildActionPlan({context:c={},evaluation:e={},score,street,recommendedAction:a,recommendedTo,sizing,starting:s={},conditionalAce,preflopContinuation,marginal,noFutureBetting=false,briefReason=''}){
 if(!['fold','check','call','raise','bet'].includes(a)||c.hole?.length!==2)return null;
 street=street||c.gameState||c.legal?.street||'preflop';
 const cost=num(e.callCost),committed=num(c.streetCommitted),bb=num(c.legal?.bb),facing=cost>0,hasBet=num(c.currentBet)>0;
 let actionText=a==='check'?'过牌，不追加筹码':a==='fold'?`弃牌，不再跟这 ${cost} 筹码`:a==='call'?`跟注，再投入 ${cost} 筹码`:null;
 if(!actionText){if(!finite(recommendedTo))return null;actionText=hasBet?`加注到 ${recommendedTo} 筹码，再投入 ${Math.max(0,recommendedTo-committed)} 筹码`:`下注 ${Math.max(0,recommendedTo-committed)} 筹码`;}
 let reason='',nextStep='',sizeText='';
 if(street==='preflop'){
  const raises=(c.publicHistory||[]).filter(x=>(x.street||x.gameState)==='preflop'&&(x.isAggressive||['raise','bet'].includes(x.action))).length;
  const position=c.numPlayers===2?(c.posFromButton===0?'按钮位兼小盲位':'大盲位'):c.posFromButton===0?'按钮位':c.posFromButton===1?'小盲位':c.posFromButton===2?'大盲位':num(c.numPlayers)-num(c.posFromButton)>=4?'前位':'中后位';
  const priceText=!facing?'目前无需补款':bb?`补 ${cost} 筹码，约 ${Number((cost/bb).toFixed(1))} 个大盲`:`补 ${cost} 筹码`;
  const chain=(c.publicHistory||[]).filter(x=>(x.street||x.gameState)==='preflop'&&['raise','bet','call'].includes(x.action)).slice(-4).map(x=>`${x.action==='call'?'跟到':'加到'}${num(x.totalStreetBet)}`).join('→');
  if(conditionalAce||s.suited&&s.a===12&&s.b<=3)return null;
  if(s.premium)reason=s.pair?`${ranks[s.a]}${ranks[s.a]}的现有牌力领先${ranks[s.a-1]}${ranks[s.a-1]}、${ranks[s.a-2]}${ranks[s.a-2]}等较差对子，${a==='raise'?'加注是让这些牌付钱':'先跟能保留对手较差的牌'}，不只是等翻牌再配好。`:`AK还没成对，但配到A或K时另一张牌也大；${a==='raise'?'加注可以向AQ、AJ这类大牌收钱':'这次可以跟，但翻牌没中又遇大注时不能硬撑'}。`;
  else if(a==='fold'){
   const weakness=s.pair?'已有对子，但只为追三条支付这个价格，后面不一定能赢回足够筹码':s.a>=10&&s.b<8?`即使配成一对${ranks[s.a]}，另一张${ranks[s.b]}也容易被同样大对子配大牌的人压住；${s.suited?'同花潜力不能抵消这次跟注的代价':'不同花也少了一种补成强牌的机会'}`:!s.suited&&s.a-s.b<=2?'两张小牌虽然相连，但不同花；只中一对往往仍小于对手的对子':s.suited?'同花牌仍未成对，面对这个加注价格，被跟后的发展不足以支持继续':'两张牌既不同花又不相连，只中一对也缺少好踢脚';
   reason=`你在${position}，前面${raises?`已有 ${raises} 次加注`:'尚未加注'}，${priceText}；${weakness}。`;
   const pending=(c.publicPlayers||[]).filter(p=>p.id!==c.playerId&&!p.folded&&!p.allin&&finite(p.streetCommitted)&&p.streetCommitted<num(c.currentBet)).length;
   if(raises>1&&pending)reason+=`还有 ${pending} 人没跟齐，付完也可能再被加注。`;
  }
  else if(a==='check')reason='当前无需补款，免费进入翻牌，再依据是否形成有价值的对子或真实听牌决定投入。';
  else reason=`你在${position}，${priceText}；${s.pair?'对子已有摊牌价值':s.suited?'同花及连接结构保留后续发展机会':'两张大牌能争取顶对好踢脚'}，${raises?'面对后续再加注重新比较价格':'可争取盲注及较差起手牌的跟注'}。`;
  if(raises>1&&chain)reason=`前面${chain}。`+reason.replace(`前面已有 ${raises} 次加注，`,'');
  if(a==='raise'&&finite(sizing?.lowTo)&&finite(sizing?.highTo))sizeText=`本轮加到 ${sizing.lowTo}–${sizing.highTo} 筹码作参考；当前建议加到 ${recommendedTo}，扣掉已投的 ${committed}，这次再投 ${Math.max(0,recommendedTo-committed)}。`;
 }else{
  if(!Array.isArray(c.board)||c.board.length<3)return null;
  score=score||bestHand([...c.hole,...c.board]);
  const draw=street==='river'?null:drawFacts(c,score),count=num(e.opponentCount);
  const shared=c.board.length===5&&compare(score,bestHand(c.board))===0;
  if(shared){
   reason='你的底牌没有提高公共牌的最好五张，别人至少也能用这五张；下注很难从更差的牌收钱。'+(a==='check'?'过牌保留免费争取平分的机会。':a==='fold'?'继续付钱主要是争平分，还可能输给用底牌改进的人。':'跟注主要是争平分，不能当成自己独有的强牌继续加注。');
  }else if(a==='raise'||a==='bet'){
   const examples=targets(c,score);
   reason=examples?`想让 ${examples} 这类较差成牌付钱。`:briefReason;
   const pot=num(c.legal?.pot)+cost,increment=Math.max(0,recommendedTo-num(c.currentBet));
   if(pot>0)reason+=`这次主动加的 ${increment} 约为${facing?'跟齐后':''}底池的 ${Math.round(100*increment/pot)}%。`;
   const twoSuit=street!=='river'?[0,1,2,3].find(suit=>c.board.filter(x=>Math.floor(x/13)===suit).length===2):undefined;
   reason+=twoSuit!==undefined?`公共牌有两张${suits[twoSuit]}，追同花的人也要付钱；这个金额比小注多收费，又不直接把较差对子全压走。`:'小到中等下注更容易留下较差对子；直接下大注，更容易只剩强牌跟。';
   const plan=sizing?.plan||sizing;
   if(finite(plan?.lowTo)&&finite(plan?.highTo))sizeText=`参考${hasBet?'加到':'下注'} ${plan.lowTo}–${plan.highTo} 筹码；以较差牌愿意付钱为前提。`;
  }else if(draw){
   reason=`${count>1?`还有 ${count} 个对手，` :''}等${draw.text}；共 ${draw.count} 张不重复补牌，下一张命中约 ${draw.prob}%，不是获胜概率。`;
   reason+=a==='check'?(count>1?'免费等一张；要让所有对手都弃牌很难，先别花钱诈唬。':'现在免费等一张，不必主动扩大底池。'):price(e,c)+(a==='fold'?'不要只为追补牌支付这笔钱。':noFutureBetting?'跟注后不用再付下一街的钱。':'跟注后仍可能面对下一街下注。');
   if(a!=='fold')nextStep=`下一张关注${draw.text}；没中又遇下注，不为之前投入继续追。`;
  }else{
   const stronger=score[0]<=1?targets(c,score,false):'';
   const specifics=score[0]===0?'尚无一对':score[0]===1?`一对${ranks[score[1]]}`:['高牌','一对','两对','三条','顺子','同花','葫芦','四条','同花顺'][score[0]];
   reason=`${count>1?`仍有 ${count} 个对手；`:''}${specifics}，${street==='river'?'公共牌已发完':score[0]>=4?'已经成牌，重点是对手用什么牌继续':'没有一张可补成的同花或顺子'}。`;
   if(stronger&&score[0]>0)reason+=`例如 ${stronger.split('、')[0]} 已领先。`;
   if(score[0]===0&&a==='fold'&&street!=='river'){
    const top=Math.max(...c.board.map(x=>x%13)),low=c.hole.filter(x=>x%13<top).map(x=>ranks[x%13]);
    if(low.length)reason+=`就算配到${low.join('或')}，也仍小于对手可能配出的${ranks[top]}对子。`;
   }
   reason+=a==='check'?(count>1&&score[0]===0?'先免费看牌；要让所有对手都弃牌很难，别轻易花钱诈唬。':'免费保留摊牌机会，先不扩大底池。'):price(e,c)+(a==='call'?'先跟，让较弱牌和诈唬继续留在底池。':street==='river'?'牌已发完，不能再靠后面改善来回本。':'不为再看一张继续付钱。');
  }
  if(marginal&&facing&&['call','fold'].includes(a)){
   actionText=`倾向${a==='call'?'跟注':'弃牌'}（有争议），${a==='call'?`再投入 ${cost}`:`不再跟这 ${cost}`} 筹码`;
   if(!draw&&!shared){
   const examples=targets(c,score,false).split('、')[0],missed=missedDraw(c,score),aggressive=(c.publicHistory||[]).filter(x=>x.isAggressive||['bet','raise'].includes(x.action));
   const repeated=street==='river'&&aggressive.some(x=>(x.street||x.gameState)==='river'&&aggressive.some(y=>(y.street||y.gameState)==='turn'&&y.playerId===x.playerId));
   const top=Math.max(...c.board.map(x=>x%13)),weakKicker=score[0]===1&&score[1]===top&&c.hole.some(x=>x%13===top)&&Math.max(...c.hole.filter(x=>x%13!==top).map(x=>x%13))<8;
   reason=`${repeated?'对方转牌下注后，河牌又下注；':''}${score[0]===1?`一对${ranks[score[1]]}${weakKicker?'弱踢脚':''}`:'当前成牌'}主要是在抓诈唬。${missed?`能赢${missed}；`:''}${examples?`却输给 ${examples} 这类成牌。`:''}无法确认对方诈唬有多频繁，这手不能强判${a==='call'?'跟注':'弃牌'}一定对。`;
   }
  }
 }
 if(noFutureBetting&&a==='call')nextStep=street==='river'?'跟注后直接比牌，不再有下注决定。':'跟注后等剩下的公共牌发完再比牌，不再有下注决定。';
 return {actionText,reason,nextStep,...(sizeText?{sizeText}:{})};
}
