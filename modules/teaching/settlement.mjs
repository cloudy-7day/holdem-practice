// Explain only the recorded allocation; a refund is never a pot win.
export function explainSettlement(settlement, players) {
  const name=id=>players.find(p=>p.id===id)?.name||String(id);
  const ranks=['2','3','4','5','6','7','8','9','10','J','Q','K','A'];
  const winningHands=settlement.winningHands.map(h=>{
    if(![4,8].includes(h.score?.[0])||h.bestFive?.length!==5)return h;
    const wheel=h.score[1]===3;
    const order=c=>wheel&&c%13===12?-1:c%13;
    const bestFive=h.bestFive.slice().sort((a,b)=>order(a)-order(b));
    const straightRanks=bestFive.map(c=>ranks[c%13]).join('–');
    const straightExplanation=wheel?`A 在这里作 1，${straightRanks} 是以 5 为最大牌的${h.handName}。`:`${straightRanks} 连续五个点数，构成以 ${ranks[h.score[1]]} 为最大牌的${h.handName}。`;
    return {...h,bestFive,straightRanks,straightExplanation};
  });
  const pots=settlement.pots.map(p=>{
    let explanation;
    if(p.refundTo!=null) explanation=`${name(p.refundTo)}退回 ${p.amount} 筹码：这部分未被跟注，不算赢得底池。`;
    else if(settlement.kind==='uncontested') explanation=`其他玩家均弃牌，${name(p.winnerIds[0])}无需摊牌，收取 ${p.amount} 筹码。`;
    else {
      const awards=p.awards.map(a=>`${name(a.playerId)}获得 ${a.amount}`).join('，');
      const eligible=p.eligibleIds.map(name).join('、');
      const hands=p.winnerIds.map(id=>{const h=settlement.winningHands.find(h=>h.playerId===id);return `${name(id)}（${h?.handName||'最佳牌'}）`;}).join('、');
      explanation=`${p.label} ${p.amount} 筹码，参与资格：${eligible}。${hands}${p.winnerIds.length>1?'最佳五张完全同分，平分此池':'最佳五张胜出'}，${awards}。`;
      if(p.winnerIds.length>1 && p.amount%p.winnerIds.length) explanation+='不能均分的零头按庄家左手起的座位顺序分配。';
    }
    return {...p,explanation};
  });
  const contested=pots.filter(p=>p.refundTo==null);
  const split=contested.some(p=>p.winnerIds.length>1);
  const different=new Set(contested.map(p=>p.winnerIds.slice().sort((a,b)=>a-b).join(','))).size>1;
  const summary=settlement.kind==='uncontested'?'其他玩家弃牌，本手无需摊牌。':contested.length>1&&different?'本手按主池、边池分别结算；不同底池可由不同玩家获胜。':split?'最佳五张同分，相关底池平分。':'摊牌比较最佳五张，胜者收取底池。';
  const net=players.map(p=>`${p.name}净${p.net>=0?'赢':'输'} ${Math.abs(p.net)} 筹码`).join('；');
  const rule=settlement.kind==='showdown'?'摊牌从两张底牌和五张公共牌中任选最佳五张，可以使用零、一或两张底牌；先比牌型，再按点数和踢脚牌逐项比较。公共牌逐张发出是同一手牌的进程，直到弃牌结束或最终摊牌才结算。':'';
  return {...settlement,winningHands,pots,summary,explanation:[summary,...pots.map(p=>p.explanation),...winningHands.filter(h=>h.straightExplanation).map(h=>`${name(h.playerId)}：${h.straightExplanation}`),rule,`${net}。净输赢＝本手结束筹码－开始筹码；收取底池包含自己的投入。`].filter(Boolean).join('\n')};
}
