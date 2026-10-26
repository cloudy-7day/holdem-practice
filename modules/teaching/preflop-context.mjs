// Public snapshot facts only. Owed chips do not imply a player has never acted.
const finite=x=>Number.isFinite(x)&&x>=0;
export function preflopContext(c={},callCost=0){
 const bb=c.legal?.bb,players=c.publicPlayers||[],count=c.numPlayers,heroId=c.playerId??1;
 const historyComplete=Array.isArray(c.publicHistory);
 const publicPlayersComplete=Array.isArray(c.publicPlayers)&&Number.isInteger(count)&&count>=2&&players.length===count&&new Set(players.map(p=>p.id)).size===count&&new Set(players.map(p=>p.position)).size===count&&players.every(p=>Number.isInteger(p.position)&&p.position>=0&&p.position<count&&finite(p.stack)&&finite(p.streetCommitted)&&typeof p.folded==='boolean'&&typeof p.allin==='boolean');
 const raises=(c.publicHistory||[]).filter(a=>(a.street||a.gameState)==='preflop'&&(a.isAggressive===true||(a.isAggressive!==false&&['raise','bet'].includes(a.action))));
 const opener=players.find(p=>p.id===raises[0]?.playerId),hero=players.find(p=>p.id===heroId);
 const position=c.posFromButton,heroButton=position===0,heroBB=position===(count===2?1:2);
 const lateOpener=!!opener&&(opener.position===0||(count>2&&opener.position===1)||(count>=4&&opener.position===count-1));
 const early=Number.isInteger(position)&&position>=3&&position<count-2;
 const heroPosition=heroButton?(count===2?'按钮位兼小盲位':'按钮位'):heroBB?'大盲位':position===1?'小盲位':early?'前位':Number.isInteger(position)?'中后位':'位置未知';
 const active=players.filter(p=>p.id!==heroId&&!p.folded&&!p.allin);
 const pendingOwed=publicPlayersComplete&&finite(c.currentBet)?active.filter(p=>p.streetCommitted<c.currentBet).length:null;
 const effective=publicPlayersComplete&&hero&&opener&&finite(c.stack)?Math.min(c.stack,opener.stack):null;
 const matchedCallers=players.filter(p=>p.id!==heroId&&p.id!==opener?.id&&!p.folded&&p.streetCommitted>=c.currentBet&&c.currentBet>0).length;
 const otherContenders=players.filter(p=>p.id!==heroId&&p.id!==opener?.id&&!p.folded);
 const onlyUnmatchedBlinds=otherContenders.every(p=>!p.allin&&(count===2?p.position===1:p.position===1||p.position===2)&&p.streetCommitted<c.currentBet&&!(c.publicHistory||[]).some(a=>a.playerId===p.id&&(a.street||a.gameState)==='preflop'&&a.action==='call'));
 const openingAmountMatches=raises.length===1&&raises[0].totalStreetBet===c.currentBet;
 const complete=publicPlayersComplete&&historyComplete&&!!hero&&hero.position===position&&!!opener&&raises.every(a=>players.some(p=>p.id===a.playerId)&&finite(a.totalStreetBet));
 return {bb,raises:raises.length,opener:opener||null,publicPlayersComplete,historyComplete,complete,heroPosition,pendingOwed,effective,early,lateOpener,heroButton,heroBB,matchedCallers,onlyUnmatchedBlinds,openingAmountMatches,callCost};
}
export function suitedAceContinuation(c={},s={},callCost=0){
 const facts=preflopContext(c,callCost),bb=facts.bb;
 const smallSuitedAce=s.a===12&&s.b>=0&&s.b<=3&&s.suited===true&&!s.pair;
 const requiredEffective=finite(bb)?Math.max(40*bb,20*callCost):null;
 const consider=!!(smallSuitedAce&&facts.complete&&facts.raises===1&&facts.lateOpener&&(facts.heroButton||facts.heroBB)&&bb>0&&callCost>0&&c.currentBet>bb&&c.currentBet<=4*bb&&callCost<=4*bb&&facts.effective>=requiredEffective&&facts.matchedCallers===0&&facts.onlyUnmatchedBlinds&&facts.openingAmountMatches&&!facts.opener.allin&&callCost<c.stack&&facts.opener.id!==(c.playerId??1));
 return {consider,facts,smallSuitedAce,requiredEffective};
}
