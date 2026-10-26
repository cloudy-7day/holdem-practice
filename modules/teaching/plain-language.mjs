import { bestHand } from '../offline/engine.mjs';
import { preflopContext } from './preflop-context.mjs';
// Presentation only: decisions and probabilities are calculated in analysis/equity.
const ranks=['2','3','4','5','6','7','8','9','10','J','Q','K','A'];
const show=cards=>(cards||[]).map(c=>ranks[c%13]+['♦','♥','♠','♣'][Math.floor(c/13)]).join(' ');
function shortText(intro,holding,reason,draw){
 // Reserve space for the recommendation; optional card detail never displaces it.
 const parts=[intro,holding,reason,draw];
 for(const index of [3,1])if(parts.join('').length>200)parts[index]='';
 if(parts.join('').length>200)parts[0]=intro.split('桌上是')[0];
 return parts.join('');
}
// Compare a call with the stakes and pot; the absolute chip number is not a
// strategy. These descriptions do not turn raw pot odds into a winning chance.
function callPrice(c,cost){
 const bb=c.legal?.bb,pot=c.legal?.pot,pre=(c.gameState||c.legal?.street||'preflop')==='preflop';
 const parts=[];
 if(pre&&Number.isFinite(bb)&&bb>0){
  const multiple=cost/bb;parts.push(`相当于 ${multiple<.1?'不到0.1':Number(multiple.toFixed(1))} 个大盲（大盲是 ${bb}）`);
 }
 const sidepot=(c.publicPlayers||[]).some(p=>p.allin)||cost>=c.stack;
 if(!sidepot&&Number.isFinite(pot)&&pot>0){
  const ratio=cost/pot;
  const size=ratio<.1?'不到一成':ratio<1?`约${['','一','二','三','四','五','六','七','八','九','十'][Math.round(ratio*10)]}成`:ratio===1?'一样多':`的 ${Number(ratio.toFixed(1))} 倍`;
  parts.push(ratio>=1?`这笔补款${ratio===1?'和当前底池一样多':`约为当前底池${size}`}`:`约占当前底池${size.replace(/^约/,'')}`);
  parts.push(ratio<=.25?'相对底池较便宜，但仍要看手牌和位置':ratio>=.5?'不是便宜看牌的价格，但也不能只凭金额就弃牌':'价格不算特别便宜，要结合手牌和位置');
 }
 return parts.length?parts.join('，')+'。':'';
}
// Explain the cost at the moment of the decision, not the final stack or pot.
export function explainCall(c,callCost){
 if(!Number.isFinite(callCost)||callCost<=0)return '';
 const street=c.gameState||c.legal?.street||'preflop',committed=c.streetCommitted,stack=c.stack;
 const haveCommitted=Number.isFinite(committed)&&committed>=0,haveStack=Number.isFinite(stack)&&stack>=0;
 const fullCost=haveCommitted&&Number.isFinite(c.currentBet)?Math.max(0,c.currentBet-committed):null;
 const last=(c.publicHistory||[]).findLast(a=>(a.street||a.gameState)===street&&a.totalStreetBet===c.currentBet&&(a.isAggressive||['raise','bet'].includes(a.action)));
 const bettor=last&&(c.publicPlayers||[]).find(p=>p.id===last.playerId)?.name;
 let text=fullCost!=null?`${bettor||'对方'}这一轮已经下到 ${c.currentBet} 筹码。`:'';
 if(fullCost!=null&&fullCost>callCost){
  text+=`还差 ${fullCost} 筹码才能跟齐，但你${haveStack?'只有 '+stack+' 筹码':'的筹码不够'}。跟注就要全下 ${callCost} 筹码，只能争取自己投入所对应的那部分筹码。`;
 }else text+=`跟注需要额外投入 ${callCost} 筹码。${callPrice(c,callCost)}`;
 if(haveStack&&!(fullCost!=null&&fullCost>callCost)){
  if(callCost===stack)text+='这会用掉你剩下的全部筹码。';
  else if(callCost>=stack/2)text+='这会用掉你手里至少一半的筹码，不能只为了再看一张就跟。';
 }
 return text;
}
export function plainDecision({context:c,evaluation:e,starting:s,score,category,street,recommendedAction,actual,defendingBlind,noFutureBetting,marginal,oversized,sizeUncertain,undersized,checkAlternative,callAlternative,conditionalAce,preflopContinuation}){
 const hole=c.hole||[],board=c.board||[],call=e.callCost||0;
 if(hole.length!==2)return '这次的手牌记录不完整，先不硬说你打得对不对。';
 const shared=board.length===5&&score&&bestHand(board).every((v,i)=>v===score[i]);
 const pre=street==='preflop',top=Math.max(...board.map(x=>x%13));
 let intro=`你拿 ${show(hole)}${pre?(s.pair?`，是一对${ranks[s.a]}`:s.suited?'，两张同花':'，两张不同花'):''}。`;
 if(!pre)intro+=`桌上是 ${show(board)}。`;
 let holding='',draw='',reason='';
 if(!pre){
  if(category===0)holding='你还没有一对。';
  else if(category===1){
   const pair=score[1],onBoard=board.filter(x=>x%13===pair).length;
   if(onBoard>=2)holding=`这一对${ranks[pair]}在桌上，别人也能用。`;
   else if(hole[0]%13===hole[1]%13&&pair>top)holding=`你有一对${ranks[pair]}，比桌上的单张牌都大。`;
   else if(pair===top){const kicker=hole.find(x=>x%13!==pair);holding=`你凑出一对${ranks[pair]}，另一张是${ranks[kicker%13]}。`;}
   else holding=`你有一对${ranks[pair]}，但桌上还有更大的${ranks[top]}，别人可能配出更大的对子。`;
  }else if(category===2)holding=`你已经有${ranks[score[1]]}和${ranks[score[2]]}两对。`;
  else if(category===3)holding=`${board.filter(x=>x%13===score[1]).length===3?'桌上就有':'你凑出了'}三张${ranks[score[1]]}。`;
  else holding=`你已经有${e.madeHand}。`;
  if(shared)holding='桌上这五张已经是你能用的最好组合，别人也能用；你的底牌没有让它更大。';
  const d=e.draws?.find(d=>d.outs>0&&(d.name.includes('同花')?category<5:category<4));
  if(street!=='river'&&d){
   const wanted=[...new Set(d.cards.map(x=>x.replace(/[♦♥♠♣]/g,'')))].join('或');
   draw=d.name.includes('同花')?`再来一张${({'♦':'方块','♥':'红桃','♠':'黑桃','♣':'梅花'})[d.cards[0].slice(-1)]}，就能凑成同花，但不保证能赢。`:`后面来${wanted}，就能连成顺子，但现在还没成。`;
  }
 }
 if(recommendedAction==='review')reason='这次谁能争哪些筹码的信息还不完整，先不硬说你该跟还是该弃。';
 else if(c.legal?.callAmt===0&&actual==='fold')reason='这里不用花筹码就能继续，没必要弃牌，点过牌就好。';
 else if(shared){reason=recommendedAction==='call'?`再跟${call}可以考虑，主要是争取平分桌上的筹码；也要看别人能否用底牌凑出更强的牌。`:recommendedAction==='fold'?`再跟${call}代价偏高，最多可能和别人平分，还可能输给用底牌凑出更大牌的人，我更建议收手。`:'现在不用加钱，先过牌。如果后面有人下注，再考虑值不值得跟着争取平分。';}
 else if(oversized&&recommendedAction!=='raise')reason=`这次加得太多了，这里更建议${({fold:'弃牌',call:'先跟着',check:'先过牌'})[recommendedAction]}，不用把筹码一下推这么多。`;
 else if(oversized)reason=pre?'这次一下加得太多，差牌可能被你吓跑，肯继续跟的人反而拿着好牌。可以先少加一点。':'这次下得太大，可能把比你差的牌吓跑，留下的反而更难打。先下小注或过牌更合适。';
 else if(sizeUncertain)reason='你的牌虽然不错，也得有人拿更差的牌跟，你下这么大才划算。不能只因为自己牌大就把筹码全推上去。';
 else if(undersized&&recommendedAction==='raise')reason='可以下注，但这次下得有点少。如果别人拿着更差的牌也愿意跟，你就少赢了一些；如果是故意引他加注，要有这个打算。';
 else if(checkAlternative&&actual==='check')reason='先过牌没问题，别急着把桌上的筹码越堆越多。也可以下小注，试着让比你差的对子跟。';
 else if(callAlternative&&actual==='call')reason='这手牌很强，加注可以；先跟着，让对方有机会继续下注，也说得通。';
 else if(noFutureBetting&&recommendedAction==='call')reason=`这次跟注可以考虑。跟完后${street==='river'?'直接比牌':'等剩下的牌发完再比大小'}，不会再有人让你加钱。`;
 else if(pre&&s.suited&&s.a===12&&s.b<=3&&['call','fold'].includes(recommendedAction)){
  const f=preflopContinuation?.facts||preflopContext(c,call);
  holding='它有机会凑成A领头的同花，或A2345顺子；但现在都还没成。';
  if(recommendedAction==='call'){
   reason=conditionalAce&&preflopContinuation?.consider?`你在${f.heroPosition}，面对后位的一次加注，双方后续还有筹码可打，可以跟一次试试，弃牌也可以。`:defendingBlind?'你在大盲，只补差额就能继续，这次可以跟；不必因为另一张小就直接弃牌。':'同花让这手牌有发展的机会，这个价格可以考虑跟一次。';
   if(f.pendingOwed>0)reason+=`还有${f.pendingOwed}人没跟齐，仍可能再加注。`;
   reason+='翻牌没配好、也没差一张的同花或顺子，遇下注优先收手；只来一张A，也别自动跟大注。';
  }else{
   if(f.raises>1)reason='前面已经反复加注，不能按一次普通加注来试牌。';
   else if(Number.isFinite(f.bb)&&call>4*f.bb)reason='这次要补超过4个大盲，光靠等同花不值得付这么多。';
   else if(f.complete&&!f.lateOpener)reason='加注者的位置较靠前，先按较强的起手牌看待，不能当作后位随便争盲注。';
   else if(!f.heroButton&&!f.heroBB&&Number.isInteger(c.posFromButton))reason=`你在${f.heroPosition}，翻牌后不占最后行动的优势，只配一对A也容易被更大的另一张牌压住。`;
   else if(f.complete&&f.effective<Math.max(40*f.bb,20*call))reason='相对双方能继续争的筹码，这次试牌余地不够，不能指望凑好后一定赢回更多。';
   else if(f.matchedCallers>0)reason='已经有人跟进这次加注，仍是多人争夺；这手未成对的牌需要更好的价格和后续牌面。';
   else if(!f.complete)reason='记录不足以确认对手位置和后续筹码，不能仅凭这个金额认定跟注错。';
   else reason='目前不满足后位对单次小加注、双方筹码较深的试牌条件。';
   if(f.pendingOwed>0)reason+=`还有${f.pendingOwed}人没跟齐，付完也未必就能看到翻牌。`;
   reason+='这次我更倾向弃牌；不是因为A2同花一律不能玩。';
  }
 }
 else if(pre){
  if(recommendedAction==='fold'){
   if(s.pair)reason=c.currentBet>(c.legal?.bb||20)?'这对牌有机会变成三条，但不能为了等那一张就花太多。':'你后面还有人没行动，这对小牌可以先放下，等更好打的机会。';
   else if(s.suited&&s.a-s.b<=2)reason=c.currentBet>(c.legal?.bb||20)?'它有机会凑成顺子或同花，但现在还没成，为了等后面的牌花这么多不划算。':'这两张要靠后面配好才好打，你后面还有人，可以先放下。';
   else if(s.b<8)reason=`就算后面来一张${ranks[s.a]}，也可能输给同样拿${ranks[s.a]}、另一张牌比你大的人。`;
   else reason=c.currentBet>(c.legal?.bb||20)?'这两张牌不算差，但前面已经加得比较重，没有必要硬跟。':'这两张牌不算差，但后面还有人，遇到更好的牌容易吃亏，这次可以先放下。';
   if(call)reason+=`这次还要再跟${call}，我更建议弃牌。`;
  }else if(recommendedAction==='raise')reason=s.premium?'这两张牌很强，可以先加注，让拿差一些牌的人付钱跟你玩。':(c.publicHistory||[]).some(x=>x.action==='call')?'前面有人跟进，你这手牌值得争一争，可以加一点，让想继续的人多付些筹码。':c.posFromButton===0?'你的位置靠后，前面没人主动加注，可以先争一争盲注。有人再加很多时，别自动跟到底。':'这两张牌值得进场，可以先加注争一争。后面还有人没行动，被再次加注时再重新考虑。';
  else if(recommendedAction==='call'){
   const cost=`这次需要额外投入 ${call} 筹码跟注。`;
   reason=defendingBlind?`你在大盲，已经付过一部分了。${cost}这两张牌能继续争一争，后面被加很多时再重新判断。`:s.pair?`你已经有一对${ranks[s.a]}，能领先许多还没配对的牌，不只是等后面配好。${cost}可以考虑先跟，但不能因此认定后面怎么加都要跟。`:s.premium?`你有A和K，配成一对时另一张也是大牌，比拿大牌配小牌更好打，但现在还没一对。${cost}可以考虑跟注，后面没配好又遇到大注时，要重新判断。`:`你有${s.suited?'两张同花的牌，后面可能凑成同花或较好的对子':'两张较大的牌，后面配成一对时有机会赢更小的对子'}。${cost}可以继续考虑，后面被加很多时重新判断。`;
  }
  else reason='现在不用再花筹码，先过牌继续看就好。';
 }else if(recommendedAction==='fold'){
  const flushSuit=[0,1,2,3].find(suit=>board.filter(x=>Math.floor(x/13)===suit).length>=3);
  if(flushSuit!==undefined&&category<5)reason=`桌上已经有至少三张${['方块','红桃','黑桃','梅花'][flushSuit]}，别人可能已经凑成同花。`;
  else if(category===1)reason='有一对也不代表够赢，对方可能有更大的对子、两对或三条。';
  else if(category>=2)reason='你的牌已经不错，但对方也可能拿着比你更大的牌，不能因为已经配好就一直跟。';
  if(street==='river')reason+=`已经不会再发牌了，再跟${call}要靠这手牌直接赢，或者对方是在吓你。我更倾向收手。`;
  else reason+=draw?`为了等后面补好，还得再跟${call}，这个代价不太值得。`:`这次还要再跟${call}，牌不够好，先收手更稳妥。`;
  if(marginal)reason+='这手不好一口咬定，跟注也不一定错。';
 }else if(recommendedAction==='call')reason=category===0&&street==='river'?`你还没一对，但只要再跟${call}。如果对方也没配上，你的大牌仍可能赢，可以考虑接这一下。`:draw&&category===0?`这次再跟${call}可以考虑，后面还有补成好牌的机会；没补上时再重新判断，别一路跟到底。`:`这次再跟${call}可以。你还能赢一些更差的牌，先跟着，不用加注把它们吓跑。`;
 else if(recommendedAction==='raise')reason='你的牌不错，可以下点注，试着让比你差的牌付钱跟。具体下多少，看下面的金额建议。';
 else reason=street==='river'?'已经不会再发牌了，现在不用花筹码，可以先过牌；如果后面有人下注，再重新考虑。':'现在不用花筹码，先过牌继续看。还没把握让更差的牌跟，就不用急着下注。';
 // Keep the reason, dropping optional detail before shortening any sentence.
 return shortText(intro,holding,reason,draw).replaceAll(`再跟${call}`,`再跟${call}筹码`);
}
