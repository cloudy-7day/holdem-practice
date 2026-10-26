// Snapshot-only coaching: public ranges are hypotheses, never revealed opponent cards.
import { bestHand } from '../offline/engine.mjs';
import { evaluateSpot } from './equity.mjs';
import { sizingPlan, assessSizing } from './sizing.mjs';
import { explainBetPurpose } from './bet-purpose.mjs';
import { buildActionPlan } from './action-plan.mjs';
import { plainDecision, explainCall } from './plain-language.mjs';
import { suitedAceContinuation } from './preflop-context.mjs';
const streets={preflop:'翻牌前',flop:'翻牌',turn:'转牌',river:'河牌'};
const actions={fold:'弃牌',check:'过牌',call:'跟注',bet:'下注',raise:'加注',allin:'全下'};
const ranks='23456789TJQKA', suits=['♦','♥','♠','♣'];
const cards=xs=>(xs||[]).map(c=>ranks[c%13]+suits[Math.floor(c/13)]).join(' ')||'无';
const n=x=>Number.isFinite(Number(x))?Number(x):0;
const pct=x=>(100*x).toFixed(1)+'%';
export const teachingSources=[
 {title:'PokerStars Learn：底池赔率',url:'https://www.pokerstars.com/poker/learn/lesson/pot-odds/'},
 {title:'PokerStars Learn：补牌与听牌',url:'https://www.pokerstars.com/poker/learn/lesson/calculating-outs/'},
 {title:'GTO Wizard：多人底池',url:'https://blog.gtowizard.com/10-tips-multiway-pots-in-poker/'},
 {title:'GTO Wizard：胜率实现',url:'https://blog.gtowizard.com/equity-realization/'},
 {title:'PokerStars Learn：大盲防守与价格',url:'https://www.pokerstars.com/poker/learn/strategies/defending-your-big-blind/'},
 {title:'PokerStars Learn：下注大小',url:'https://www.pokerstars.com/poker/learn/lesson/bet-sizing/'},
 {title:'GTO Wizard：下注为什么能获利',url:'https://blog.gtowizard.com/reasons-for-value-betting-in-poker/'}
];
const methodology='基于行动前公开快照，按明确假设的对手范围模拟摊牌份额；范围不是读心，区间不是求解器精度。补牌命中率不等于胜率；跟注EV只是假设后续不再下注的示例。未建模赛事奖金压力、抽水或完整后续策略。';
function starting(hole=[]){
 if(hole.length!==2)return {premium:false,playable:false,label:'未知起手牌'};
 const [a,b]=hole.map(c=>c%13).sort((x,y)=>y-x),pair=a===b,suited=Math.floor(hole[0]/13)===Math.floor(hole[1]/13);
 return {a,b,suited,pair,premium:(pair&&a>=10)||(a===12&&b===11),strong:(pair&&a>=6)||(a>=11&&b>=9),playable:pair||(a>=10&&b>=8)||(a===12&&b>=7)||(suited&&a-b<=2&&b>=4)||(suited&&a===12),label:pair?'口袋对子':suited?'同花起手牌':'不同花起手牌'};
}
// Teaching baselines, not solver charts. Position widens an unopened range;
// callers and reraises must not be mistaken for a chance to steal the blinds.
function opensFrom(s,position,players){
 const {a,b,pair,suited}=s,gap=a-b;
 if(position===0||position===1||players<=3)return pair||a===12||(suited&&(a===11||a===10&&b>=3||a===9&&b>=5||gap<=2&&b>=2))||a===11&&b>=5||a===10&&b>=6||a===9&&b>=6||a===8&&b>=6;
 const remaining=players-position;
 if(remaining<=2)return pair||(suited&&(a===12||a===11&&b>=6||a===10&&b>=7||gap<=1&&b>=4))||a===12&&b>=8||a>=10&&b>=8;
 return (pair&&a>=(players>=8&&remaining>=5?5:3))||(suited&&(a===12&&b>=8||a===11&&b>=9||a===10&&b===9))||a===12&&b>=9||a===11&&b===10;
}
function blindDefense(s,c,e,bb){
 const bigBlind=n(c.posFromButton)===(n(c.numPlayers)===2?1:2);
 const raises=(c.publicHistory||[]).filter(a=>(a.street||a.gameState)==='preflop'&&(a.isAggressive===true||['raise','bet'].includes(a.action)));
 const opener=(c.publicPlayers||[]).find(p=>p.id===raises.at(-1)?.playerId);
 const late=opener&&Number.isInteger(opener.position)&&(opener.position<=1||opener.position>=n(c.numPlayers)-2);
 const {a,b,suited,pair}=s;
 const hand=pair||(suited&&(a===12||a===11&&b>=5||a===10&&b>=6||a-b<=3&&b>=3))||(late&&(a===12||a===11&&b>=7||a===10&&b>=8));
 return bigBlind&&raises.length===1&&e.opponentCount===1&&n(c.currentBet)<=3*bb&&e.callCost<=2*bb&&e.callCost<=n(c.stack)*.1&&hand&&e.threshold!=null&&e.equityLow>e.threshold+(late?.06:.12);
}
// Concrete examples of made hands weaker than hero, using only unblocked public cards.
function valueTargets(hole,board,hero){
 const cmp=(a,b)=>{for(let i=0;i<Math.max(a.length,b.length);i++){const d=(a[i]||0)-(b[i]||0);if(d)return d;}return 0;};
 const deck=Array.from({length:52},(_,i)=>i).filter(c=>![...hole,...board].includes(c)),candidates=[];
 for(let i=0;i<deck.length;i++)for(let j=i+1;j<deck.length;j++){const pair=[deck[i],deck[j]],score=bestHand([...pair,...board]);if(score[0]>=1&&cmp(score,hero)<0)candidates.push({pair,score});}
 candidates.sort((a,b)=>cmp(b.score,a.score));const seen=new Set(),out=[];
 for(const x of candidates){const key=x.pair.map(c=>c%13).sort().join(',');if(seen.has(key))continue;seen.add(key);out.push(cards(x.pair));if(out.length===3)break;}
 return out.join('、');
}
// Describe possibilities from visible cards, never claim they are the opponent's holdings.
function boardRisks(hole,board,category){
 const counts=[0,0,0,0];board.forEach(c=>counts[Math.floor(c/13)]++);
 const risks=[];if(category>=6)return '';counts.forEach((v,i)=>{if(v>=3&&category<=5)risks.push(['方块','红桃','黑桃','梅花'][i]+'同花已可能成牌');else if(v===2&&board.length<5&&category<5)risks.push('对手的'+['方块','红桃','黑桃','梅花'][i]+'听花仍有改善机会');});
 const rs=new Set(board.map(c=>c%13));if(rs.has(12))rs.add(-1);
 if(category<=4&&Array.from({length:10},(_,i)=>i-1).some(start=>Array.from({length:5},(_,i)=>start+i).filter(r=>rs.has(r)).length>=3))risks.push('连接牌使顺子可能成牌');
 if(new Set(board.map(c=>c%13)).size<board.length)risks.push(category>=3?'公共牌配对，要核对更高葫芦':'公共牌配对，要防三条或葫芦');
 else if(category<=2)risks.push(category===0?'对手的一对已领先你的高牌':category===2?'暗三条仍可能领先你':'两对、暗三条可以领先你');
 return risks.join('；');
}
function review(d){
 const c=d.context||{},l=c.legal||{},street=c.gameState||l.street||'preflop',label=streets[street]||street;
 const e=evaluateSpot(c),board=c.board||[],hole=c.hole||[],facing=e.callCost>0,bb=n(l.bb)||20;
 const headsUp=n(c.numPlayers)===2,early=n(c.numPlayers)>=5&&n(c.posFromButton)>=3&&n(c.posFromButton)<n(c.numPlayers)-2;
 const pos=c.posFromButton==null?'位置未知':headsUp?(c.posFromButton===0?'按钮位兼小盲位':'大盲位'):c.posFromButton===0?'按钮位':c.posFromButton===1?'小盲位':c.posFromButton===2?'大盲位':early?'前位':'中后位';
 const shortCall=d.action==='allin'&&n(c.stack)<=e.callCost;
 const minTo=n(l.minRaiseTo)||n(c.currentBet)+Math.max(bb,n(c.minRaise));
 const maxTo=Number.isFinite(l.maxRaiseTo)?l.maxRaiseTo:n(c.streetCommitted)+n(c.stack);
 const canRaise=!!l.canRaise&&maxTo>=minTo;
 const s=starting(hole),score=hole.length===2&&board.length>=3?bestHand([...hole,...board]):null;
 const suitedAce=street==='preflop'?suitedAceContinuation(c,s,e.callCost):null;
 let suitedAceAlternative=false;
 const category=score?.[0]??0,multi=e.opponentCount>1;
 const sizePlan=sizingPlan(c,{category,opponentCount:e.opponentCount,bb,minTo,maxTo});
 let recommendedAction=facing?'fold':'check',recommendedTo;
 let why='',next='';
 let reason='',checkAlternative=false,callAlternative=false,callSafetyMargin=0,defendingBlind=false,noFutureBetting=false;
 if(street==='preflop'){
  const opened=n(c.currentBet)>bb,cheap=e.callCost<=bb;
  const limpers=(c.publicHistory||[]).filter(a=>(a.street||a.gameState)==='preflop'&&a.action==='call').length;
  if(s.premium&&canRaise&&e.callCost<=10*bb&&e.callCost<n(c.stack)/3){recommendedAction='raise';why='AA–QQ、AK通常能从较差对子和AQ、AJ获得价值；这里继续争夺优于直接弃牌。';}
  else if(!opened&&canRaise&&(limpers?s.strong:opensFrom(s,n(c.posFromButton),n(c.numPlayers)))){recommendedAction='raise';why=limpers?'前面有人跟入，这手对子或强大牌有向较差牌取值的基础，可以加注隔离。':early?'前位仍需收紧，但这手对子或同花大牌属于可开池结构，不必只等AA、KK。':'前面尚未主动入池，可以利用位置开池争取盲注；被再加注后要重新评估，不能自动跟到底。';}
  else if(!facing){recommendedAction='check';why='没有补钱要求，保留免费翻牌机会。';}
  else if(opened&&blindDefense(s,c,e,bb)){recommendedAction='call';defendingBlind=true;why=`大盲已投入，补差 ${e.callCost} 即可防守这次小开池；${s.pair?'对子可以保留摊牌价值并争取暗三条':s.suited?'同花结构能形成较强听牌和成牌':'A高或两张大牌对后位较宽开池有摊牌潜力'}，无需直接弃牌，也不必用再加注扩大底池。`;}
  else if(suitedAce?.consider){recommendedAction='call';suitedAceAlternative=true;why=`面对后位单次小开池，你在${suitedAce.facts.heroPosition}，补 ${e.callCost}（${(e.callCost/bb).toFixed(1)} 个大盲），对开池者有效筹码 ${suitedAce.facts.effective}；尚无其他玩家跟齐这次加注。小同花A可争取坚果同花或A2345顺子，跟注与弃牌都可考虑；这只是条件化教学候选，不是求解器频率或盈利保证。只中A时仍要防踢脚被压制，后续再加注需重新评估。`;}
  else if((s.strong&&e.callCost<=6*bb&&e.callCost<=n(c.stack)*0.2)||(s.premium&&e.equity!=null&&e.threshold!=null&&e.equity>e.threshold+0.06)||(cheap&&s.playable&&!early)){recommendedAction='call';why=s.premium&&e.callCost>6*bb?'这次跟注代价较大；当前强起手牌在公开行动假设下仍支持继续，并非仅为等待后面配牌。后面遭遇更大加注时仍需重新判断。':'价格较低且有对子、强大牌或可发展的同花结构，可以继续；面对后面的再加注重新收紧。';}
  else{why=opened?`面对加注要补 ${e.callCost}（${(e.callCost/bb).toFixed(1)} 个大盲），这手${s.suited?'同花牌虽有发展潜力，但击中一对仍可能被更好踢脚压制':s.pair?'对子可能落后更高对子，不宜只为中暗三条支付大价钱':'不同花牌容易被更好踢脚压制'}；${early?'前位后面仍有人行动，继续范围应更紧':'位置有利也不代表能承受这个价格'}。`:'这手牌的高牌、连接性或位置不足，基线弃牌，把入池机会留给更好的结构。';}
  if(defendingBlind&&suitedAce?.smallSuitedAce){suitedAceAlternative=true;why+='小同花A在这里跟注或弃牌都可考虑，不必把任何一次继续视为必须。';}
  next='进入翻牌后，先看能否形成顶对好踢脚、暗三条或真正的四张听牌；未击中又面对多人下注时减少投入。';
 }else{
  const shared=board.length===5&&score&&bestHand(board).every((v,i)=>v===score[i]);
  if(shared){why='公共牌本身就是你的最佳五张牌，底牌没有提高牌力；不要把人人可用的牌型当成独有价值。';recommendedAction=facing?(e.equity!=null&&e.threshold!=null&&e.equity>e.threshold?'call':'fold'):'check';}
  else if(facing){
   const margin=e.equity!=null&&e.threshold!=null?e.equity-e.threshold:null;
   // Raw showdown equity is a lower bar than a profitable non-all-in continuation.
   const opponents=(c.publicPlayers||[]).filter(p=>p.id!==(c.playerId??1)&&!p.folded);
   noFutureBetting=e.callCost>=n(c.stack)||(opponents.length>0&&opponents.every(p=>p.allin));
   callSafetyMargin=street==='river'||noFutureBetting?0:multi?0.07:0.035;
   recommendedAction=margin==null?'review':margin>callSafetyMargin?'call':'fold';
   why=recommendedAction==='call'?'假设范围下的摊牌份额支持跟注；保留对手较弱牌和诈唬，不自动加注。':street==='river'?'假设范围下的份额不足以覆盖价格，基线弃牌。':'假设范围下的份额没有明显覆盖价格与后续压力，基线弃牌；不要仅为“再看一张”付费。';
   if(e.threshold==null&&category>=4&&e.equityLow>0.90){recommendedAction='call';why='底牌构成的强成牌在各范围情景下均明显领先，默认跟注；边池资料不足以给出可靠价格门槛，不能仅因缺少该指标而弃牌。';}
   if(category===0&&street==='river')why=recommendedAction==='call'?'高牌虽只是在抓诈唬，但该价格很低，宽范围中的较差高牌足以支持跟注；没有后续公共牌可改善。':'没有后续公共牌可改善，高牌只能抓诈唬；假设范围中的较差高牌不足以覆盖价格，默认弃牌。';
   if(recommendedAction==='review')why='边池贡献信息不完整，或其他玩家仍可能补齐下注，无法可靠计算这次跟注的价格；不能因此断言应该弃牌，也不能认定你的行动错误。';
   // A fragile high-card gutshot is not a supported call merely because the
   // central showdown estimate barely clears a fixed margin. Subsequent bets
   // remain possible and the more conservative range scenario cannot pay for
   // this call. Keep the alternative debatable in the marginal verdict below.
   const directDraws=(e.draws||[]).filter(d=>d.outs>0);
   const fewOuts=directDraws.length>0&&directDraws.every(d=>d.outs<=4);
   if(recommendedAction==='call'&&!noFutureBetting&&street!=='river'&&category===0&&fewOuts&&e.threshold!=null&&e.equityLow<=e.threshold){
    recommendedAction='fold';
    why='目前只有高牌和少量直接补牌，较保守范围下的份额不足以支付跟注；后续还可能继续收费，默认弃牌。另一张底牌配对并不保证获胜；只有对手确实经常用较差牌下注时，跟注才作为边缘选择。';
   }
  }else{recommendedAction='check';why=category>=3?'强成牌有价值下注候选，但要先确认哪些较差牌愿意付钱，以及顺子、同花或更高葫芦能否反超；没有这些信息时先过牌保留范围。':`${street==='river'?'免费过牌保留现有摊牌价值':'免费过牌能保留现有摊牌价值和改善机会'}；没有足够差牌付钱或更好牌弃牌的依据，先不扩大底池。`;}
  const boardRanks=board.map(c=>c%13),ownPairRanks=hole.filter(h=>boardRanks.includes(h%13));
  const ownMade=!shared&&(category>=4||category===3&&hole.some(h=>h%13===score[1])||category===2&&ownPairRanks.length>0&&hole[0]%13!==hole[1]%13);
  if(ownMade&&!facing&&canRaise&&e.equity>(multi?0.70:0.62)){const targets=valueTargets(hole,board,score);recommendedAction='raise';why=`你的底牌构成${e.madeHand}，在假设范围中领先；可争取 ${targets||'较低对子'} 这类较差成牌跟注，收取价值；根据牌面和对手选择下注大小。`;}
  const dry=board.every((card,i)=>board.findIndex(x=>x%13===card%13)===i)&&Math.max(...[0,1,2,3].map(s=>board.filter(c=>Math.floor(c/13)===s).length))<=2&&!boardRisks(hole,board,category).includes('顺子');
  const top=Math.max(...board.map(c=>c%13));
  const topPair=category===1&&score[1]===top&&hole.some(c=>c%13===top)&&Math.max(...hole.filter(c=>c%13!==top).map(c=>c%13))>=10;
  const overPair=category===1&&hole[0]%13===hole[1]%13&&hole[0]%13>top;
  if(!facing&&!shared&&canRaise&&dry&&(topPair||overPair)&&e.opponentCount<=2&&e.equityLow>(multi?.70:.63)){
   recommendedAction='raise';checkAlternative=true;why=`${overPair?'超对':'顶对好踢脚'}在这块较干燥牌面可小注取值，${valueTargets(hole,board,score)} 等较差对子是跟注候选；过牌控池也合理，不必每次下注。`;
  }
  if(facing&&!shared&&canRaise&&category>=7&&e.equityLow>.97){recommendedAction='raise';callAlternative=true;why=`底牌构成的${e.madeHand}在各范围情景几乎不落后，可向 ${valueTargets(hole,board,score)} 等较差强牌做价值加注；仍需对手愿意支付，跟注诱导也可行。`;}
  const draws=(e.draws||[]).filter(x=>x.outs>0);
  if(street==='river')next='本街已经没有下一张牌；若对手再加注，只用确实能击败其价值范围的牌继续，不因之前投入而跟到底。';
  else if(ownMade&&category>=2&&recommendedAction==='call')next='下一街安全牌上继续向较差成牌取值；若补成明显顺子、同花或更高葫芦，再结合对手下注重新评估。';
  else if(category>=1&&recommendedAction==='call')next='安全牌上保留摊牌价值，面对小注重新比较价格；若对手持续大注或顺子、同花补成，收紧继续范围，不因已有一对而自动跟到底。';
  else if(draws.length)next=`${street==='flop'?'转牌':'河牌'}关注 ${[...new Set(draws.flatMap(x=>x.cards))].join('、')}；命中后先检查是否补成对手更高顺子、同花或葫芦，再考虑价值下注。未命中且对手继续大注，优先过牌／弃牌。`;
  else next=`${street==='flop'?'转牌':'河牌'}若只来无关小牌，继续过牌，面对明显下注优先弃牌；若配对你的底牌，先核对踢脚及牌面顺子／同花，再决定是否跟小注。`;
 }
 if(street!=='preflop'&&facing&&e.threshold==null&&recommendedAction==='fold'){
  recommendedAction='review';why='边池信息不足，无法可靠核算这次跟注价格，不能据此判定应该弃牌。';
 }
 if(noFutureBetting&&recommendedAction==='call'&&e.threshold!=null){
  why='估算份额覆盖当前价格；跟注后直接比牌或发完剩余公共牌，没有后续加注压力。';
  next='跟注后等待公共牌发完并摊牌，不再有后续下注决策。';
 }
 if(recommendedAction==='raise'&&canRaise)recommendedTo=sizePlan.targetTo;
 else if(recommendedAction==='raise')recommendedAction=facing?'call':'check';
 const actual=shortCall?'call':['bet','allin'].includes(d.action)?'raise':d.action;
 const same=actual===recommendedAction;
 const purpose=street!=='preflop'&&actual==='raise'&&!['raise','review'].includes(recommendedAction)?explainBetPurpose({context:c,evaluation:e,recommendedAction,decision:d}):null;
 const drawSizeLarge=purpose?.alternative&&sizePlan.available&&n(d.totalStreetBet)>sizePlan.highTo;
 if(drawSizeLarge){
  purpose.label='有听牌，但这次下得较大';
  purpose.recommendationText=`若选择用下注争取弃牌，先参考 ${sizePlan.lowTo}–${sizePlan.highTo} 筹码的小到中等下注；也可以过牌。`;
  purpose.reason+='这次超过该参考区间，被跟时承担的损失更大，需要更充分的对手会弃牌或补牌后能收钱的依据；仅仅有听牌，不能证明这个金额划算。';
 }
 const sizing=assessSizing(d,sizePlan,{recommendedAction,purpose});
 const raiseIncrement=Math.max(0,Math.min(n(d.totalStreetBet),sizePlan.callableTo??Infinity)-n(c.currentBet));
 const postLarge=sizing.status!=='constrained'&&street!=='preflop'&&actual==='raise'&&raiseIncrement>Math.max(bb,n(l.pot)+e.callCost)*1.5&&n(d.totalStreetBet)>2*(recommendedTo||minTo);
 const sizeUncertain=sizing.status==='large'&&street!=='preflop'&&category>=2;
 const oversized=(sizing.status==='large'&&(street==='preflop'||category<=1)&&raiseIncrement>1.5*Math.max(1,sizePlan.highTo-n(c.currentBet)))||(postLarge&&category<=1&&recommendedAction==='raise');
 const largerBaseline=sizing.status==='large';
 const undersized=sizing.status==='small'&&recommendedAction==='raise';
 const marginal=facing&&street!=='preflop'&&e.threshold!=null&&e.equityLow!=null&&e.equityLow<=e.threshold+callSafetyMargin&&e.equityHigh>=e.threshold;
 const conditionalAce=suitedAceAlternative&&['call','fold'].includes(actual);
 const incompleteAce=suitedAce?.smallSuitedAce&&!suitedAce.facts.complete&&recommendedAction==='fold'&&actual==='call'&&e.callCost<=4*bb&&n(c.stack)>=40*bb;
 const debatableAce=suitedAce?.smallSuitedAce&&recommendedAction==='fold'&&actual==='call'&&e.callCost<=4*bb&&n(c.stack)>=40*bb&&suitedAce.facts.raises<=1&&(suitedAce.facts.effective==null||suitedAce.facts.effective>=suitedAce.requiredEffective);
 const verdict=drawSizeLarge?'有听牌，但下注金额需要复核':purpose?.alternative?'有听牌，过牌或主动下注都可考虑':incompleteAce?'信息不足，倾向弃牌但不能判错':debatableAce?'这手有取舍，我更倾向弃牌':conditionalAce?'边缘，跟注或弃牌均可考虑':recommendedAction==='review'?'信息不足，不能判错':oversized?'尺寸偏大':sizeUncertain?'大额加注，尺寸需复核':largerBaseline?'尺寸偏大，需说明理由':undersized?'尺寸偏小，可调整':checkAlternative&&actual==='check'?'合理，过牌或小注均可':callAlternative&&actual==='call'?'合理，跟注诱导或价值加注均可':same?(marginal?'边缘，符合默认建议':'合理'):marginal?'边缘，默认'+actions[recommendedAction]:'需要改进';
 const severity=purpose?.alternative||incompleteAce||debatableAce||conditionalAce?'note':recommendedAction==='review'?'note':oversized?'warning':largerBaseline||sizeUncertain||undersized?'note':(checkAlternative&&actual==='check'||callAlternative&&actual==='call')?'note':marginal?'note':same?'good':'warning';
 // Metrics, ranges and draws have their own UI sections; keep the coaching prose compact.
 reason=(street==='preflop'?`${pos}的${s.label}。`:`${e.madeHand}，${multi?'多人':'单挑'}底池。`)+why;
 const suitCount=[0,0,0,0];[...hole,...board].forEach(c=>suitCount[Math.floor(c/13)]++);
 if(street==='flop'&&category===0&&Math.max(...suitCount)===3)reason+='同花只属后门，需要连续两张同花色。';
 if(street==='turn'&&category===0&&Math.max(...suitCount)<4)reason+='不是同花听牌，一张河牌不能补成同花。';
 if(street!=='preflop'){
  const risks=boardRisks(hole,board,category);if(risks)reason+=risks+'。';
  if(facing&&e.threshold!=null&&e.equity!=null)reason+=`跟注 ${e.callCost} 争取当前可争底池 ${e.potEligible}，价格门槛 ${pct(e.threshold)}；假设份额 ${pct(e.equity)}。`;
  if(e.draws?.length)reason+=e.draws.map(d=>`${d.name}有${d.outs}张名义补牌，下一张命中率 ${pct(d.nextCardProbability)}`).join('；')+'；补牌命中率不是获胜率。';
  if(category>=1&&category<=3&&recommendedAction!=='raise'){const targets=valueTargets(hole,board,score);if(targets)reason+=`仍可领先 ${targets} 等较差成牌，但它们未必愿意跟加注。`;}
  if(street==='river'&&category>=1&&category<=2&&facing)reason+='若对手只用更强牌取值，这手牌只能抓诈唬；能否跟注取决于较差价值牌和诈唬权重。';
 }
 if(marginal)reason+='范围情景接近跟注门槛及后续下注的评估余量，这次属于边缘决定，不能认定另一动作必错。';
 if(street==='river'&&!reason.includes('没有后续公共牌'))reason+='没有后续公共牌可改善。';
 if(shortCall)reason+='实际全下是跟注，只评估有权参争的主池／边池。';
 if(d.action==='fold'&&!facing)reason+='本可免费过牌，弃牌放弃了免费争夺机会。';
 if(oversized&&street==='preflop')reason+='开池过大使较差牌更容易弃牌，继续范围更强。';
 if(postLarge)reason+=`本次加注增量 ${raiseIncrement}，约为跟注后底池的 ${(raiseIncrement/Math.max(1,n(l.pot)+e.callCost)).toFixed(1)} 倍；${category<=1?'这类中等或较弱牌用大注容易逼走较差牌、留下更强继续范围，小注或控池更合适':'大尺寸需要对手愿用较差强牌跟注，仅凭牌强还不能证明这个尺寸更好'}。`;
 if(recommendedAction==='raise'&&street!=='preflop')next=street==='river'?'若遭再加注，重新比较对手更强的价值牌，避免因已下注而机械跟到底。':'下一街若完成明显顺子或同花，先降速核对对手范围；安全牌上可继续向上述较差成牌取值。';
 const lead=drawSizeLarge?'听牌可以主动下注，但这次金额偏大；更偏向过牌或减小下注。':purpose?.alternative?'可以过牌等补牌，也可以用下注争取对手弃牌。':conditionalAce?`可以跟注：再投入 ${e.callCost} 筹码；弃牌也可考虑。`:recommendedAction==='review'?'暂不强判跟注或弃牌。':recommendedAction==='raise'?(n(c.currentBet)===0?`建议下注 ${recommendedTo} 筹码。`:`建议加注到 ${recommendedTo} 筹码（本次再投 ${recommendedTo-n(c.streetCommitted)} 筹码）。`):`建议${actions[recommendedAction]}${recommendedAction==='call'?'：再投入 '+e.callCost+' 筹码':''}。`;
 // Compact, decision-specific copy for the main review; detailed reasoning stays available.
 const briefReason=purpose?.alternative?'对手不爱弃牌时，更偏向过牌；如果下注后遇到加注，要重新看跟注代价，不能因为已经下了就一直跟。':plainDecision({context:c,evaluation:e,starting:s,score,category,street,recommendedAction,actual,defendingBlind,noFutureBetting,marginal,oversized,sizeUncertain,undersized,checkAlternative,callAlternative,conditionalAce,preflopContinuation:suitedAce});
 const actionPlan=buildActionPlan({context:c,evaluation:e,score,street,recommendedAction,recommendedTo,sizing:{...sizePlan,...sizing},starting:s,conditionalAce,preflopContinuation:suitedAce,purpose,drawSizeLarge,marginal,noFutureBetting,briefReason})||{actionText:lead.replace(/。$/,''),reason:briefReason};
 if(drawSizeLarge)actionPlan.sizeText=`若选择主动下注，先参考 ${sizePlan.lowTo}–${sizePlan.highTo} 筹码；这次 ${n(d.paid)} 筹码超过参考区间，不能仅凭有听牌就下这么大。`;
 let nextAdvice='';
 if(severity==='warning'||sizeUncertain)nextAdvice=lead;
 else if(!noFutureBetting&&street!=='preflop'&&street!=='river'&&actual!=='fold'&&e.draws?.length){
  const draw=e.draws.find(x=>x.outs>0);if(draw)nextAdvice=`${street==='flop'?'转牌':'河牌'}关注 ${draw.cards.join('、')}；未中且再次面对大注，优先弃牌。`;
 }
 return {street,actionPlan,spotLabel:`手牌 ${cards(hole)}${board.length?`｜当时公共牌 ${cards(board)}`:""}`,actualPaid:n(d.paid),preflopContinuation:suitedAce,conditionalAce,action:d.action,title:lead.replace(/。$/,''),severity,briefReason,callExplanation:explainCall(c,e.callCost),nextAdvice,reason,suggestion:next,verdict,recommendedAction,sizing:['bet','raise','allin','call'].includes(d.action)||recommendedAction==='raise'?sizing:null,...(recommendedTo==null?{}:{recommendedTo}),equity:e.equity,equityLow:e.equityLow,equityHigh:e.equityHigh,threshold:e.threshold,callEV:e.callEV,ranges:e.ranges,draws:e.draws,assumptions:e.assumptions,sources:teachingSources,evidence:[`${label}｜手牌 ${cards(hole)}｜当时公共牌 ${cards(board)}`,`位置 ${pos}，剩余 ${n(c.stack)}，本街已投入 ${n(c.streetCommitted)}`,`行动前底池 ${n(l.pot)}，跟注 ${e.callCost}；实际${actions[d.action]||d.action}，支付 ${n(d.paid)}，本街总投入 ${n(d.totalStreetBet)}`]};
}
export function analyzeHand(report={}){
 const decisions=report.decisions||[], heroId=report.heroId??1;
 const heroReviews=decisions.filter(d=>d.playerId===heroId).map(review);
 const playerReviews=(report.players||[]).filter(p=>p.id!==heroId).map(p=>{
  const ds=decisions.filter(d=>d.playerId===p.id);
  const names=['高牌','一对','两对','三条','顺子','同花','葫芦','四条','同花顺'];
  const byStreet=new Map();
  for(const d of ds){const street=d.context?.gameState||d.context?.legal?.street||'preflop';if(!byStreet.has(street))byStreet.set(street,[]);byStreet.get(street).push(d);}
  const known=p.hole?.length===2;
  const entries=[...byStreet];
  const active=d=>['bet','raise'].includes(d.action)||(d.action==='allin'&&n(d.paid)>n(d.context?.legal?.callAmt));
  const post=entries.filter(([street])=>street!=='preflop');
  const lastEntry=entries.at(-1),last=lastEntry?.[1].at(-1);
  let strategy='没有记录到公开行动。';
  if(last){
   const [street,steps]=lastEntry,board=last.context?.board||[];
   const category=known&&board.length>=3?bestHand([...p.hole,...board])[0]:null;
   const aggression=post.filter(([,steps])=>steps.some(active));
   const hand=category==null?'':names[category];
   if(!known)strategy=`${streets[street]}最后选择${actions[last.action]||last.action}，${active(last)?'继续下注，让别人决定跟不跟':last.action==='fold'?'不再往里加钱':'先不加大，看看后面怎么打'}。没看到他的底牌，不能确定他是真有好牌，还是想把人吓跑。`;
   else if(category!=null&&active(last)){
    const earlierDraw=post.slice(0,-1).some(([,steps])=>{const b=steps.at(-1).context?.board||[];const combined=[...p.hole,...b];return b.length<5&&([0,1,2,3].some(suit=>combined.filter(c=>Math.floor(c/13)===suit).length===4)||Array.from({length:10},(_,i)=>i-1).some(lo=>new Set(combined.map(c=>c%13===12&&lo===-1?-1:c%13).filter(r=>r>=lo&&r<lo+5)).size===4));});
    strategy=category===0?`${streets[street]}还没有一对，继续下注可能是想把别人吓跑${street==='river'&&earlierDraw?'；前面想等的牌没来，最后仍然下注，看起来可能是在吓人':''}。这是看完底牌后的推测，不能确定他当时怎么想。`:`${streets[street]}拿着${hand}主动下注，${category>=3?'可能想让拿着更差牌的人继续跟，多赢一些':'可能想让更小的对子跟，或让还没配好的人放弃'}。${aggression.length>1?'前面几轮也在下注，一直让别人决定要不要继续付筹码':'这次下得值不值，还要看比他差的牌愿不愿意跟'}。`;
   }else if(category!=null){
    strategy=`${streets[street]}实际是${hand}，最后${actions[last.action]||last.action}，${last.action==='fold'?'到这里收手，不再加钱':last.action==='check'?'先不下注，等别人行动':'先跟着，不急着加大'}。${aggression.length?'前面还在主动下注，现在慢了下来，可能是新发的牌或别人的下注让他有所顾虑':'发出公共牌后，他主要选择过牌或跟注，没有一直加大'}。`;
   }else strategy=`翻牌前持${cards(p.hole)}，最后${actions[last.action]||last.action}，${active(last)?'想先赢走盲注，或让拿着更差牌的人跟进':last.action==='fold'?'先放下这手牌':'先跟着，看看后面能不能配好'}。还没打到发公共牌，后面的打法暂时看不出来。`;
  }
  return {id:p.id,name:p.name||`玩家 ${p.id}`,summary:`${known?'本手底牌 '+cards(p.hole)+'。':''}${strategy}`};
 });
 return {summary:`本手记录了你的 ${heroReviews.length} 次决定；先看标为需要改进的决定，再按街复盘。`,heroReviews,playerReviews,limitations:methodology,sources:teachingSources};
}
