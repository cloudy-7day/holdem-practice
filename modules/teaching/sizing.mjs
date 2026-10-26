import {bestHand} from '../offline/engine.mjs';
// Public-snapshot teaching baselines, not a solver or a unique optimal size.
const num=(x,f=0)=>Number.isFinite(Number(x))?Number(x):f;
const clamp=(x,a,b)=>Math.min(b,Math.max(a,x));
function texture(board=[]){
 const suits=[0,0,0,0],ranks=new Set();
 for(const c of board){suits[Math.floor(c/13)]++;ranks.add(c%13);}
 if(ranks.has(12))ranks.add(-1);
 const connected=Array.from({length:10},(_,i)=>i-1).some(s=>Array.from({length:5},(_,i)=>s+i).filter(r=>ranks.has(r)).length>=3);
 return Math.max(...suits)>=2||connected;
}

const rankName=r=>['2','3','4','5','6','7','8','9','10','J','Q','K','A'][r];
function explainBoard(c,street){
 const board=c.board||[],hole=c.hole||[],used=new Set([...board,...hole]);
 if(board.length<3)return '';
 const names=['还没有对子','一对','两对','三条','顺子','同花','葫芦','四条','同花顺'];
 const own=hole.length===2?bestHand([...hole,...board]):null;
 let text=own?`按你的手牌和公共牌，你现在${own[0]===0?'':'是'}${names[own[0]]}。`:'';
 const pick=(r,preferred=0)=>Array.from({length:4},(_,s)=>((s+preferred)%4)*13+r).find(x=>!used.has(x));
 const ranks=new Set(board.map(x=>x%13));
 let made='',draw='';
 for(let start=-1;start<=8&&own&&own[0]<4;start++){
  const line=Array.from({length:5},(_,i)=>(start+i+13)%13),missing=line.filter(r=>!ranks.has(r));
  if(!made&&missing.length===2){
   const cards=missing.map((r,i)=>pick(r,i));
   if(cards.every(x=>x!==undefined)&&bestHand([...board,...cards])?.[0]===4)made=`例如对手可能拿着 ${missing.slice().sort((a,b)=>b-a).map(rankName).join('、')}，已经有顺子。`;
  }
  if(street!=='river'&&board.length<5&&!draw&&missing.length===2){
   // Pair one board rank with one missing rank; verify the next card really makes a straight.
   for(const present of line.filter(r=>ranks.has(r)).sort((a,b)=>Number(hole.some(x=>x%13===a))-Number(hole.some(x=>x%13===b))||b-a)){
    const held=[present,missing[1]],cards=held.map((r,i)=>pick(r,i)),next=pick(missing[0]);
    if(cards.every(x=>x!==undefined)&&next!==undefined&&bestHand([...board,...cards])?.[0]<4&&bestHand([...board,...cards,next])?.[0]===4){
     const before=bestHand([...board,...cards]);
     draw=`也可能拿着 ${held.map(rankName).join('、')}，现在是${names[before[0]]}${before[0]===1?rankName(before[1]):''}，等一张 ${rankName(missing[0])} 凑成顺子。`;break;
    }
   }
  }
 }
 if(made||draw)text+=made+draw+(own?.[0]>=2?'下注是想让目前比你小的牌继续跟，但不能因此忽略已经比你大的牌。':'')+'这些只是可能的牌，不是说对手一定拿着它们。';
 if(street==='river')text+='公共牌已经发完，只考虑现在有哪些较差的牌愿意跟注。';
 return text;
}

export function sizingPlan(context={},options={}){
 const c=context,l=c.legal||{},bb=num(options.bb,num(l.bb,20))||20;
 const committed=num(c.streetCommitted),currentBet=num(c.currentBet),pot=num(l.pot),callAmt=Math.min(num(l.callAmt),num(c.stack,Infinity));
 const maxTo=Math.max(0,Math.min(num(options.maxTo,num(l.maxRaiseTo,committed+num(c.stack))),committed+num(c.stack,Infinity)));
 const minTo=Math.max(0,num(options.minTo,num(l.minRaiseTo,currentBet+bb)));
 const street=c.gameState||c.street||'preflop',category=options.category;
 const opponentCount=num(options.opponentCount,(c.publicPlayers||[]).filter(p=>!p.folded&&p.id!==c.playerId).length||1);
 const wet=texture(c.board),multi=opponentCount>1;
 let low,high,target,kind,reason,basisText;
 if(street==='preflop'){
  if(currentBet<=bb){
   const limpers=new Set((c.publicHistory||[]).filter(a=>(a.street||a.gameState)==='preflop'&&a.action==='call'&&num(a.totalStreetBet,bb)<=bb).map((a,i)=>a.playerId??i)).size;
   low=(2+limpers)*bb;high=(3+limpers)*bb;target=(2.5+limpers)*bb;kind='open';
   reason=`前面还没人加注，可以先加到 ${Math.round(target)} 试试${limpers?`；已有 ${limpers} 人跟进，所以比没人跟时多下些`:''}。`;
  }else{
   const blind=c.numPlayers===2?c.posFromButton===0:c.posFromButton===1||c.posFromButton===2;
   const history=(c.publicHistory||[]).filter(a=>(a.street||a.gameState)==='preflop');
   const lastRaise=history.findLastIndex(a=>a.isAggressive||['raise','bet'].includes(a.action));
   const callers=history.slice(lastRaise+1).filter(a=>a.action==='call').length;
   low=2.5*currentBet;high=4*currentBet;target=Math.min(4,(blind?3.5:3)+.5*callers)*currentBet;kind='reraise';
   reason='前面有人加注了，再加时可以多下些；如果后面还有人跟进，也要看看大家手里还剩多少筹码。';
   if(history.filter(a=>a.isAggressive===true||['raise','bet'].includes(a.action)).length>=2){
    low=2*currentBet;high=2.5*currentBet;target=(blind?2.5:2.2)*currentBet;kind='fourbet';
    reason='前面已经来回加过注，桌上的筹码不少了。这次不用再加得那么猛，也要看看自己和对手还剩多少。';
   }
  }
 }else{
  const strong=Number.isFinite(category)&&category>=2;
  let lo=1/3,hi=.5;
  if(strong){lo=.5;hi=wet||multi?.75:2/3;}
  else if(wet){lo=.4;hi=.65;}
  if(multi&&!strong){lo=1/3;hi=.5;}
  const base=pot+callAmt;
  low=currentBet+base*lo;high=currentBet+base*hi;target=(low+high)/2;kind=currentBet>0?'raise':'bet';
  reason=`你现在${strong?'有两对或更好的牌':'只有一对或还没凑成对子'}，${wet?'桌上的牌容易让人凑成顺子或同花':'桌上的牌不太容易凑成顺子或同花'}${multi?'，而且还不止一个对手':''}。${strong?'可以多下些，争取让比你差的牌跟进。':multi?'先别下太大，看看还有谁愿意跟。':'可以先下小些，看看比你差的牌愿不愿意跟。'}`;
 }
 if(street==='preflop'){
  basisText=kind==='open'?`大盲是 ${bb} 筹码；以加到大盲的 ${low/bb}–${high/bb} 倍作参考，所以是 ${Math.round(low)}–${Math.round(high)} 筹码。`:`大盲是 ${bb} 筹码，前面已加到 ${currentBet} 筹码；这次以它的 ${low/currentBet}–${high/currentBet} 倍作参考，所以加到 ${Math.round(low)}–${Math.round(high)} 筹码。`;
 }else{
  const base=pot+callAmt,percent=x=>Math.abs(x-.5)<.001?'一半':Math.abs(x-.75)<.001?'四分之三':Math.abs(x-.4)<.001?'四成':Math.abs(x-.65)<.001?'六成半':Math.abs(x-1/3)<.001?'三分之一':Math.abs(x-2/3)<.001?'三分之二':`${Math.round(x*100)}%`;
  const lo=low-currentBet,hi=high-currentBet,range=`${Math.round(lo)}–${Math.round(hi)}`;
  basisText=currentBet>0?`现在底池有 ${pot} 筹码，先用 ${callAmt} 筹码 跟注后，底池是 ${base} 筹码；参考它的${percent(lo/base)}到${percent(hi/base)}，再多加 ${range} 筹码，因此本轮加到 ${Math.round(low)}–${Math.round(high)} 筹码；扣掉本轮已投的 ${committed} 筹码，这次再投 ${Math.round(low-committed)}–${Math.round(high-committed)} 筹码。`:`现在底池有 ${pot} 筹码，参考它的${percent(lo/base)}到${percent(hi/base)}，所以这次下 ${range} 筹码。`;
 }
 const boardReason=explainBoard(c,street);
 const baselineLowTo=Math.round(low),baselineHighTo=Math.round(high);
 const legalFloor=Math.min(minTo,maxTo),available=l.canRaise!==false&&maxTo>currentBet&&maxTo>committed;
 const opponents=(c.publicPlayers||[]).filter(p=>!p.folded&&c.playerId!=null&&p.id!==c.playerId);
 const callableTo=opponents.length&&opponents.every(p=>Number.isFinite(p.stack)&&Number.isFinite(p.streetCommitted))?Math.max(currentBet,...opponents.map(p=>p.streetCommitted+p.stack)):null;
 const sizingCap=callableTo==null?maxTo:Math.min(maxTo,Math.max(legalFloor,callableTo));
 const bound=x=>Math.round(clamp(x,legalFloor,sizingCap));
 const targetTo=available?bound(target):null,lowTo=available?bound(low):null,highTo=available?bound(high):null;
 if(available&&(lowTo!==baselineLowTo||highTo!==baselineHighTo)){
  basisText+=` 规则要求至少加到 ${minTo} 筹码，自己最多加到 ${maxTo} 筹码${callableTo!=null?`，对手最多跟到 ${callableTo} 筹码`:''}；范围因此调整为 ${lowTo}–${highTo} 筹码。`;
  if(maxTo<minTo)basisText+=' 剩余筹码不足最低加注额，只能全投。';
 }
 basisText+=' 下得越大，越可能把差牌吓跑、只留下好牌；小于这个范围也不一定错。';
 return {targetTo,lowTo,highTo,kind,reason,basisText,boardReason,available,bb,street,category,committed,currentBet,pot,callAmt,stack:num(c.stack),minTo,maxTo,callableTo,wet,opponentCount,baselineLowTo,baselineHighTo,constrained:lowTo!==baselineLowTo||highTo!==baselineHighTo,payAmount:targetTo==null?null:targetTo-committed,raiseIncrement:targetTo==null?null:targetTo-currentBet,potFraction:street==='preflop'||!(pot+callAmt)?null:(targetTo-currentBet)/(pot+callAmt),evidenceSufficient:street==='preflop'||Number.isFinite(category)&&pot>0};
}
export function assessSizing(decision={},plan={}, {recommendedAction,purpose}={}){
 const action=decision.action||decision.type,paid=num(decision.paid,action==='call'?plan.callAmt:NaN);
 const actualTo=num(decision.totalStreetBet,num(decision.raiseTo,Number.isFinite(paid)?plan.committed+paid:NaN));
 const actualPaid=Number.isFinite(paid)?paid:actualTo-plan.committed;
 const fixedCall=action==='call'||action==='allin'&&actualTo<=plan.currentBet;
 const active=['raise','bet','allin'].includes(action)&&!fixedCall;
 const knownAmount=Number.isFinite(actualTo)&&Number.isFinite(actualPaid)&&actualPaid>0&&actualTo>0;
 const raiseIncrement=actualTo-plan.currentBet,potFraction=plan.street!=='preflop'&&plan.pot+plan.callAmt>0?raiseIncrement/(plan.pot+plan.callAmt):null;
 const fractionLabel=potFraction==null?'':potFraction>1?`约 ${Number(potFraction.toFixed(1))} 倍`:Math.abs(potFraction-1/3)<.005?'三分之一':Math.abs(potFraction-.5)<.005?'一半':Math.abs(potFraction-2/3)<.005?'三分之二':Math.abs(potFraction-.75)<.005?'四分之三':Math.abs(potFraction-1)<.005?'一倍':`约 ${Math.round(potFraction*100)}%`;
 const sizeLabel=potFraction==null?'':potFraction<=.5?'小注':potFraction<=.75?'中等下注':potFraction<=1?'大注':'超过底池的大注';
 const firstBet=plan.currentBet===0&&plan.street!=='preflop';
 const actualText=(fixedCall||active)&&!knownAmount?'实际金额未记录':fixedCall?`你这次跟注再投了 ${actualPaid} 筹码`:active?firstBet?(fractionLabel?`这次下 ${actualPaid} 筹码，是底池的${fractionLabel}，属于${sizeLabel}。`:`这次下 ${actualPaid} 筹码；缺少底池记录，无法比较大小。`):`你这次再投了 ${actualPaid} 筹码，本轮加到 ${actualTo} 筹码；其中先用 ${plan.callAmt} 筹码 跟上，再多加 ${raiseIncrement} 筹码`:action==='check'?'你这次过牌':'你这次弃牌';
 const result=(status,label,reason,recommendationText='')=>({status,label,actualText,recommendationText,reason,basisText:status==='action-first'?purpose?.basisText||'':['unknown','fixed'].includes(status)?'':plan.basisText||'',boardReason:['unknown','fixed','action-first'].includes(status)?'':plan.boardReason||'',actualTo,actualPaid,raiseIncrement,potFraction});
 if((active||fixedCall)&&!knownAmount)return result('unknown','金额缺失','没记下这次具体投了多少，暂时没法判断下得大不大。');
 if(fixedCall)return result('fixed','跟注要付这么多','对手已经下好了，你跟上就要付这些；筹码不够时只能把剩下的全放进去。');
 if(recommendedAction&&!['raise','bet','allin'].includes(recommendedAction))return result('action-first',purpose?.label||'下注理由与金额',purpose?.reason||(recommendedAction==='review'?'缺少可靠的跟注价格或可争底池记录，无法据此判断加注是否划算。':'金额小不代表值得下注；本次没有足够依据证明加注比'+({check:'过牌',call:'跟注',fold:'弃牌'}[recommendedAction]||recommendedAction)+'更有利。'),purpose?.recommendationText||'');
 if(!plan.available||!plan.evidenceSufficient)return result('unknown','信息不足','现在还不好判断该下多少。');
 const recommendationText=plan.kind==='bet'?`建议这次下 ${plan.payAmount} 筹码，${plan.lowTo}–${plan.highTo} 筹码 都可以考虑。`:`建议本轮加到 ${plan.targetTo} 筹码，这次再投 ${plan.payAmount} 筹码（金额框填这个数）；加到 ${plan.lowTo}–${plan.highTo} 筹码 都可以考虑，也就是这次再投 ${plan.lowTo-plan.committed}–${plan.highTo-plan.committed} 筹码。`;
 if(!active)return result('proposed','可以试试这个金额',plan.reason,recommendationText);
 if(plan.callableTo!=null&&actualTo>plan.callableTo){
  const large=plan.callableTo>plan.highTo;
  return result(large?'large':'constrained',large?'有些会退回，剩下的还是偏大':'对手没那么多筹码',`对手这轮最多只能跟到 ${plan.callableTo}，多出的 ${actualTo-plan.callableTo} 没人跟，会退回给你。${large?`剩下的仍超过建议的 ${plan.highTo}，想想比你差的牌还会不会跟。`:'所以真正留在桌上的筹码没有你推出去的那么多。'}`,recommendationText);
 }
 if(actualTo>=plan.lowTo&&actualTo<=plan.highTo)return result('within','这个金额可以考虑',plan.constrained?'这个建议已经考虑了至少要加多少，以及你和对手还剩多少筹码。':plan.reason,recommendationText);
 if(actualTo===plan.maxTo&&plan.maxTo<plan.minTo)return result('constrained','剩下的筹码全投了','你已经把剩下的全放进去了，没法再多加，不能因为金额小就说下得不好。',recommendationText);
 const small=actualTo<plan.lowTo,strong=plan.category>=2;
 let detail=plan.street==='preflop'?(small?'加得有点少，对手不用再付多少就能跟进。':'加得比较多，想想比你差的牌还会不会跟，或者对手会不会因此弃牌。'):small?(strong&&plan.wet&&plan.street!=='river'?'你有不错的牌，但下得太少，对手只花一点筹码就能等下一张，看看能不能凑成顺子或同花。':plan.opponentCount>1?'还有好几个对手，下得太少可能让他们都跟进。想想你希望哪些比你差的牌跟，又想让哪些牌放弃。':plan.street==='river'?'牌已经发完了。小注可以让比你差一点的牌也愿意跟，想想对手有没有这样的牌。':'小注可以让比你差一点的牌也愿意跟，不一定需要下得很大。'):!strong&&!plan.wet?'下太大可能把比你差的对子吓跑，肯跟的反而牌更好。':strong?(plan.street==='river'?'你有不错的牌，可以多下些；牌已经发完了，要想想哪些比你差的牌还愿意跟。':'你有不错的牌，可以多下些；但也要想想，比你差的牌或还在等顺子、同花的牌愿不愿意跟。'):'桌上的牌容易凑成顺子或同花，或者对手比较多，也不代表一定要下大注。先想想你希望谁跟、谁弃牌。';
 return result(small?'small':'large',small?'下得偏小':'下得偏大',detail,recommendationText);
}
