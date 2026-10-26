import {bestHand} from '../offline/engine.mjs';

const ranks=['2','3','4','5','6','7','8','9','10','J','Q','K','A'];
const names=['高牌','一对','两对','三条','顺子','同花','葫芦','四条','同花顺'];
const compare=(a,b)=>{for(let i=0;i<Math.max(a.length,b.length);i++){const d=(a[i]||0)-(b[i]||0);if(d)return d;}return 0;};
const valid=cards=>cards.every(c=>Number.isInteger(c)&&c>=0&&c<52)&&new Set(cards).size===cards.length;

// Examples are legal possibilities, never observations of another player's cards.
function possibleClasses(hole,board,score){
 const used=new Set([...hole,...board]),deck=Array.from({length:52},(_,i)=>i).filter(c=>!used.has(c));
 let lower='',higher='',lowerScore=null,higherScore=null;
 for(let i=0;i<deck.length;i++)for(let j=i+1;j<deck.length;j++){
  const cards=[deck[i],deck[j]],other=bestHand([...board,...cards]),difference=compare(other,score);
  const label=`${cards.slice().sort((a,b)=>b%13-a%13).map(c=>ranks[c%13]).join('')}（${names[other[0]]}${other[0]>=1&&other[0]<=3?ranks[other[1]]:''}）`;
  if(difference<0&&other[0]>=1&&(!lowerScore||compare(other,lowerScore)>0)){lower=label;lowerScore=other;}
  // Prefer a made pair over a slightly better high card as a concrete bluff target.
  if(difference>0&&other[0]>=1&&(!higherScore||compare(other,higherScore)<0)){higher=label;higherScore=other;}
 }
 return {lower,higher};
}

function directDraw(hole,board,score){
 if(board.length>=5)return '';
 const cards=[...hole,...board];
 const flush=[0,1,2,3].some(s=>cards.filter(c=>Math.floor(c/13)===s).length===4&&hole.some(c=>Math.floor(c/13)===s));
 if(flush&&score[0]<5)return '四张同花听牌';
 if(score[0]>=4)return '';
 const held=new Set(cards.map(c=>c%13));if(held.has(12))held.add(-1);
 // Four consecutive ranks with two distinct legal endpoints, verified by evaluator.
 for(let start=0;start<=8;start++){
  if(!Array.from({length:4},(_,i)=>start+i).every(r=>held.has(r)))continue;
  if(!hole.some(c=>c%13>=start&&c%13<=start+3&&!board.some(b=>b%13===c%13)))continue;
  const ends=[start-1,start+4].map(r=>(r+13)%13);
  if(ends.every(r=>Array.from({length:4},(_,s)=>s*13+r).some(c=>!cards.includes(c)&&bestHand([...cards,c])[0]===4)))return '两头顺听牌';
 }
 const straightRanks=new Set();
 for(let next=0;next<52;next++){
  if(cards.includes(next)||bestHand([...cards,next])[0]!==4)continue;
  // Require a straight containing an own rank beyond what the board alone offers.
  for(let start=-1;start<=8;start++){
   const line=Array.from({length:5},(_,i)=>(start+i+13)%13);
   if(line.every(r=>[...cards,next].some(c=>c%13===r))&&hole.some(c=>line.includes(c%13)&&!board.some(b=>b%13===c%13)))straightRanks.add(next%13);
  }
 }
 if(straightRanks.size)return '卡顺听牌';
 return '';
}

export function explainBetPurpose({context={},evaluation={},recommendedAction,decision={}}={}){
 const c=context,board=c.board||[],hole=c.hole||[],street=c.gameState||c.street;
 const alternative={check:'过牌',call:'跟注',fold:'弃牌'}[recommendedAction];
 const recommendationText=alternative?`这次优先${alternative}。`:'先核对当时的跟注价格与可争底池。';
 if(recommendedAction==='review')return {label:'信息不足，暂不评价加注目的',reason:'当时的价格或可争底池信息不完整，无法可靠比较跟注、弃牌和加注。',recommendationText:'先补齐当时信息再判断。'};
 if(board.length===0&&hole.length===2&&valid(hole)){
  const hi=Math.max(...hole.map(c=>c%13)),lo=Math.min(...hole.map(c=>c%13)),pair=hi===lo,suited=Math.floor(hole[0]/13)===Math.floor(hole[1]/13);
  const holding=hole.slice().sort((a,b)=>b%13-a%13).map(c=>ranks[c%13]).join('')+(pair?'口袋对子':suited?'同花':'不同花');
  const why=pair?(hi<8?'小对子常需补成三条才有大额收钱机会，未命中时要承受高牌压力':'较高口袋对子有摊牌价值，但对手反复加注时仍需核对其更强牌范围与价格'):suited&&hi-lo<=3?'同花且相连有补成强牌的潜力，但跟注需要合适价格和足够剩余筹码':hi>=10?'高牌被更好踢脚压制时，即使配对也可能落后': '不同花或间隔较大的底牌较难补成强牌，被跟后改善机会有限';
  return {label:recommendedAction==='fold'?'这手牌不宜继续扩大底池':'保留跟注选择，不急着再加',reason:`${holding}：${why}；再加注还需要较差牌跟进或更好牌弃掉的依据，不能只为抢回已投入的盲注。`,recommendationText};
 }
 if(board.length<3||hole.length!==2||!valid([...hole,...board]))return {label:'加注要有明确目的',reason:'加注取值需要较差的牌愿意跟，诈唬需要更好的牌愿意弃；现有牌面信息不足以指出具体对象。',recommendationText};
 const score=bestHand([...hole,...board]),shared=board.length===5&&compare(score,bestHand(board))===0;
 const {lower,higher}=possibleClasses(hole,board,score),draw=directDraw(hole,board,score);
 const count=Number.isFinite(evaluation.opponentCount)?evaluation.opponentCount:(c.publicPlayers||[]).filter(p=>!p.folded&&p.id!==c.playerId).length||1;
 const facing=Number(c.legal?.callAmt)>0||Number(c.currentBet)>Number(c.streetCommitted||0);
 let label,reason;
 if(shared){label='公共牌强，不等于能让差牌付钱';reason=`你的最好五张就是公共牌，其他人也能使用；加注可能只留下${higher?'平分或更强':'平分'}的牌，不能把公共牌的强度当成自己的价值下注理由。`;}
 else if(facing){label='先找愿意付钱的较差牌';reason=lower?`例如对手可能有${lower}，但这些较差牌未必肯跟加注；若只留下${higher||'更强的牌'}，加大底池反而不利。`:'现有牌面找不到明确的较差成牌作为加注收钱对象；加注要靠更好的牌弃掉，不能仅因已经投入筹码就继续加大底池。';if(draw)reason+=`你有${draw}，半诈唬也可考虑，但仍需要弃牌机会和可承受的再加注风险。`;}
 else if(draw){label='有听牌，下注也有理由';reason=`你有${draw}，下注既可争取现在赢下底池，也保留补成强牌的机会；${count>1?'但多人底池需要所有对手都弃牌才立即获胜，':'但'}即使补成顺子或同花，也要防更大的牌，不能仅凭听牌就认定必须下注。`;}
 else if(score[0]===0){label=board.length===5?'下注需要更好的牌弃掉':'诈唬需要明确的弃牌对象';const target=higher?`例如${higher}是可能领先你的牌，下注需要它们弃掉才有诈唬收益`:'下注需要比你好的牌弃掉才有诈唬收益';reason=board.length===5?`河牌已发完，没有再补牌的机会；${target}，不能假定对手会弃牌。`:`${count>1?'多人底池要让所有对手都弃牌才立即获胜；':''}${target}，而你没有直接的同花或顺子听牌，被跟时仅配对也未必够赢。`;}
 else {label='保留较差牌，控制底池';reason=lower?`例如${lower}是可能落后的牌，但未必愿意付钱；过牌保留它们，避免下注把差牌赶走、只留下较强的牌。`:'加注取值需要较差的牌愿意跟，目前没有清楚的跟注对象；过牌保留摊牌机会，避免仅凭成牌名称就扩大底池。';if(board.length<5)reason+='小注赶走两张高牌、不给它们免费反超的机会，也有好处；但这不等于任何一对都应该下注。';}
 const paid=Number(decision.paid??decision.totalStreetBet),pot=Number(c.legal?.pot);
 const opponents=(c.publicPlayers||[]).filter(p=>!p.folded&&p.id!==c.playerId);
 const safeBluffMath=board.length===5&&score[0]===0&&!shared&&decision.action==='bet'&&Number(c.legal?.callAmt)===0&&Number(c.currentBet)===0&&Number(c.streetCommitted)===0&&pot>0&&paid>0&&opponents.length>0&&opponents.every(p=>Number.isFinite(p.stack)&&p.stack>=paid&&Number(p.streetCommitted)===0&&!p.allin&&!p.allIn)&&!c.sidePots?.length&&!c.sidepots?.length&&!c.hasSidePot&&!c.allin&&!c.allIn;
 const basisText=safeBluffMath?`若被跟必输、没有后续投入，这次下 ${paid} 争取 ${pot}，需要所有对手都弃牌的比例超过 ${Math.round(paid/(pot+paid)*100)}% 才有收益；这是条件门槛，不是预测对手的弃牌率。`:undefined;
 const drawAlternative=!!draw&&recommendedAction==='check'&&!facing&&['bet','raise','allin'].includes(decision.action);
 return {label,reason,recommendationText:drawAlternative?'可以过牌；下注则是想先让对手弃牌，被跟后还有补成强牌的机会。':recommendationText,...(basisText?{basisText}:{}),...(drawAlternative?{alternative:true}:{})};
}
