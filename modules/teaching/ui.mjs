import { analyzeHandAsync } from './review-client.mjs';
import { syncMobileLayout } from './mobile.mjs';
const $=id=>document.getElementById(id);
const words={fold:'弃牌',check:'过牌',call:'跟注',bet:'下注',raise:'加注',allin:'全下'};
const streets={preflop:'翻牌前',flop:'翻牌',turn:'转牌',river:'河牌',0:'翻牌前',1:'翻牌',2:'转牌',3:'河牌'};
function node(tag,text,cls){const e=document.createElement(tag);if(text!==undefined)e.textContent=text;if(cls)e.className=cls;return e;}
function cards(list){const box=node('span',undefined,'tc-cards');for(const c of list||[]){if(!Number.isInteger(c)||c<0||c>51)continue;const s=Math.floor(c/13);box.append(node('span',`${['♦','♥','♠','♣'][s]}${['2','3','4','5','6','7','8','9','10','J','Q','K','A'][c%13]}`,'tc-card'+(s<2?' red':'')));}return box;}
const panel=node('aside',undefined,'tc-panel');panel.id='teaching-panel';panel.setAttribute('aria-label','练习工具');
const head=node('div',undefined,'tc-head');const open=node('button','本手复盘','tc-open');open.id='teaching-open-review';open.hidden=true;head.append(open);panel.append(head);document.body.append(panel);
const dialog=node('dialog',undefined,'tc-dialog');dialog.id='teaching-review-dialog';dialog.setAttribute('aria-labelledby','teaching-review-title');document.body.append(dialog);
let spectating=false;
let heroId=1,active=false,reviewing=false,bubble=null,bubbleTimer=null,lastReport=null,returnFocus=null,revision=0;
function closeReview(){if(dialog.open)dialog.close();returnFocus?.focus?.();}
open.addEventListener('click',()=>{returnFocus=document.activeElement;dialog.showModal();});
dialog.addEventListener('click',e=>{if(e.target===dialog){const r=dialog.getBoundingClientRect();if(e.clientX<r.left||e.clientX>r.right||e.clientY<r.top||e.clientY>r.bottom)closeReview();}});
dialog.addEventListener('cancel',e=>{e.preventDefault();closeReview();});
dialog.addEventListener('keydown',e=>{if(e.key!=='Tab')return;const a=[...dialog.querySelectorAll('button,a[href],summary,[tabindex="0"]')].filter(x=>!x.hidden&&!x.disabled&&x.getClientRects().length);if(!a.length)return;const first=a[0],last=a.at(-1);if(e.shiftKey&&document.activeElement===first){e.preventDefault();last.focus();}else if(!e.shiftKey&&document.activeElement===last){e.preventDefault();first.focus();}});
function speech(packet){clearTimeout(bubbleTimer);bubble?.remove();bubble=node('div',packet.speech||`${packet.playerName}${words[packet.action]||packet.action}。`,'tc-speech');bubble.setAttribute('role','status');document.body.append(bubble);bubble.dataset.pid=packet.playerId;positionBubble();bubbleTimer=setTimeout(()=>{bubble?.remove();bubble=null;},spectating?900:2000);}
function positionBubble(){if(!bubble)return;
 // The upstream seat redraw replaces inline styles. Restore small-screen seat
 // geometry before measuring, rather than reading the temporary top-left origin.
 syncMobileLayout();
 const seat=document.querySelector(`#g-seats .seat[data-pid="${Number(bubble.dataset.pid)}"]`)||(Number(bubble.dataset.pid)===heroId?$('g-myseat-av'):null);if(!seat){bubble.style.visibility='hidden';return;}bubble.style.visibility='visible';const r=seat.getBoundingClientRect(),w=bubble.offsetWidth;const top=r.top>110?r.top-bubble.offsetHeight-10:r.bottom+9;bubble.style.left=`${Math.max(8,Math.min(innerWidth-w-8,r.left+r.width/2-w/2))}px`;bubble.style.top=`${Math.max(8,Math.min(innerHeight-bubble.offsetHeight-8,top))}px`;}
function netLabel(p){return Number.isFinite(p.net)?`${p.net>0?'+':''}${p.net.toLocaleString('zh-CN')} 筹码`:'未记录';}
function netNode(p){return node('span',netLabel(p),'tc-net '+(p.net>0?'win':p.net<0?'loss':'even'));}
function finalParticipant(p,report){
 const lastStreet=report.decisions?.at(-1)?.context?.gameState;
 return p.id===report.heroId||!p.folded||(report.winnerIds||[]).includes(p.id)||
  (lastStreet&&lastStreet!=='preflop'&&(report.decisions||[]).some(d=>d.playerId===p.id&&d.context?.gameState===lastStreet));
}
function playerCard(p,report,showNet=true){
 const item=node('article',undefined,'tc-player'+(p.id===report.heroId?' tc-hero':''));
 const winner=(report.winnerIds||[]).includes(p.id);
 item.append(node('div',`${p.name}${p.id===report.heroId?' · 你':''}`,'tc-player-name'),cards(p.hole),node('span',winner?'分得底池':p.folded?'已弃牌':'参与摊牌','tc-player-state'));
 const hand=report.settlement?.winningHands?.find(h=>h.playerId===p.id);
 if(hand)item.append(node('small',hand.handName,'tc-player-hand'));
 if(hand?.straightRanks){item.append(node('small',hand.straightRanks,'tc-straight-label'));if(hand.score[1]===3)item.append(node('small','A 作 1，5 最大','tc-straight-label'));}
 if(showNet)item.append(netNode(p));return item;
}
function plainVerdict(text){return ({'尺寸偏大':'这次下得有点大','尺寸偏小，可调整':'这次可以多下一点','大额加注，尺寸需复核':'下这么大，要有更充分的理由','尺寸偏大，需说明理由':'这次下得较大，想想谁还会跟','合理，过牌或小注均可':'过牌可以，下小注也可以','合理，跟注诱导或价值加注均可':'先跟着可以，加注也可以','边缘，符合默认建议':'这手不好判断，这样打可以考虑'})[text]||text?.replace('边缘，默认','这手不好判断，我更倾向');}
function decision(r,i){
 const item=node('article',undefined,`tc-decision ${r.severity||'note'}`);
 item.append(node('span',`${i+1} · ${streets[r.street]||r.street} · 你选择${words[r.action]||r.action}`,'tc-eyebrow'),node('h3',plainVerdict(r.verdict)||'决策回看'));
 item.append(node('p',r.title,'tc-suggestion'));
 if(r.callExplanation)item.append(node('p',r.callExplanation,'tc-call-context'));
 item.append(node('p',r.briefReason||r.reason));
 if(r.sizing&&!(r.sizing.status==='fixed'&&r.callExplanation)){
  const size=node('section',undefined,'tc-sizing');size.setAttribute('aria-label','下注大小分析');
  size.append(node('strong',`下注大小 · ${r.sizing.label}`));
  if(r.sizing.actualText)size.append(node('p',r.sizing.actualText));
  if(r.sizing.recommendationText)size.append(node('p',r.sizing.recommendationText,'tc-size-advice'));
  if(r.sizing.reason)size.append(node('p',r.sizing.reason));
  if(r.sizing.basisText)size.append(node('p',r.sizing.basisText,'tc-size-basis'));
  if(r.sizing.boardReason)size.append(node('p',r.sizing.boardReason,'tc-size-board'));
  item.append(size);
 }
 return item;
}
function fillAnalysis(report,analysis,container){
 container.replaceChildren();const main=node('section',undefined,'tc-main-advice');const reviews=analysis.heroReviews||[];
 main.append(node('h2',`你的每次决策 · ${reviews.length} 次`));
 reviews.forEach((r,i)=>main.append(decision(r,i)));
 if(!reviews.length)main.append(node('p','本手没有需要你主动决定的动作。'));
 container.append(main);
 const opponents=node('section',undefined,'tc-opponent-reviews');opponents.append(node('h2','最后几位玩家的打法'));
 for(const p of analysis.playerReviews||[]){
  if(!(report.players||[]).some(x=>x.id===p.id&&finalParticipant(x,report)))continue;
  const row=node('article',undefined,'tc-opponent-review');row.append(node('h3',p.name),node('p',p.summary));opponents.append(row);
 }
 if(opponents.children.length>1)container.append(opponents);
 container.append(node('p','这些建议只看你当时知道的牌和下注，猜不到对手的底牌。赢了不一定打对，输了也不一定打错。','tc-analysis-note'));
}
function settlementView(report){
 const box=node('section',undefined,'tc-settlement');const settlement=report.settlement;
 box.append(node('h2','这手为什么这样结算'),node('p',settlement?.summary||'本手已结束。'));
 const name=id=>report.players?.find(p=>p.id===id)?.name||String(id);
 for(const h of settlement?.winningHands||[]){
  if(!h.straightRanks)continue;
  const proof=node('div',undefined,'tc-straight-proof');proof.append(node('p',`${name(h.playerId)}的${h.handName}：`),cards(h.bestFive),node('p',h.straightExplanation));
  const hole=report.players?.find(p=>p.id===h.playerId)?.hole||[];
  const usedHole=h.bestFive.filter(c=>hole.includes(c)),usedBoard=h.bestFive.filter(c=>!hole.includes(c));
  const source=node('p','其中底牌：');if(usedHole.length)source.append(cards(usedHole));else source.append('未使用');source.append('；公共牌：',cards(usedBoard));proof.append(source);
  if(h.score[0]===4&&(report.winnerIds||[]).includes(h.playerId)&&(settlement.winningHands||[]).some(other=>other.score[0]===3))proof.append(node('p','顺子的牌型高于三条，所以这里顺子能赢三条 A，也能赢其他三条。'));
  box.append(proof);
 }
 for(const pot of settlement?.pots||[]){
  if(pot.refundTo!=null){box.append(node('p',`${name(pot.refundTo)}退回 ${pot.amount} 筹码（无人跟注部分，不算赢得底池）。`,'tc-pot-result'));continue;}
  const awards=pot.awards.map(a=>`${name(a.playerId)}收取 ${a.amount}`).join('，');
  box.append(node('p',`${pot.label} ${pot.amount}：${pot.winnerIds.length>1?'平分，':''}${awards}。`,'tc-pot-result'));
 }
 if((settlement?.pots||[]).filter(p=>p.refundTo==null).length>1)box.append(node('p','主池与边池分别比大小。短筹码玩家只能争取自己投入所覆盖的部分，剩余筹码由其他有资格的玩家争夺。'));
 box.append(node('p','每发一轮公共牌，先进行一轮下注，并非每翻一张就结算。通常到河牌下注结束，才用两张底牌和五张公共牌任选最佳五张比大小。','tc-rule'));
 const detail=node('details',undefined,'tc-showdown-help');detail.append(node('summary','发牌顺序与摊牌细节'));
 detail.append(node('p','底牌 → 下注 → 翻牌3张 → 下注 → 转牌1张 → 下注 → 河牌1张 → 下注 → 摊牌。若已全下且无人能继续互相下注，会直接补完公共牌再比大小；如果其他人全部弃牌，剩下的人直接获胜。'));
 for(const h of settlement?.winningHands||[]){const row=node('p',`${name(h.playerId)}：${h.handName}，最佳五张 `);row.append(cards(h.bestFive));detail.append(row);}
 for(const pot of settlement?.pots||[])if(pot.explanation)detail.append(node('p',pot.explanation));
 detail.append(node('p','最佳五张先比牌型，再比较点数和踢脚；完全相同则平分，花色不分大小。底牌可以用零张、一张或两张。'));
 box.append(detail);return box;
}
function renderReview(report){lastReport=report;reviewing=true;const token=++revision;open.hidden=false;dialog.replaceChildren();const header=node('header',undefined,'tc-review-head');const title=node('div');title.append(node('span','POKERTH · 本手已结束','tc-eyebrow'));const h=node('h1',`第 ${report.handNumber} 手复盘`);h.id='teaching-review-title';title.append(h);const close=node('button','关闭 ×','tc-close');close.setAttribute('aria-label','关闭复盘，留在本手');close.addEventListener('click',closeReview);header.append(title,close);dialog.append(header);const board=node('div',undefined,'tc-board');board.append(node('span','公共牌'),cards(report.board));dialog.append(board);const participants=node('section',undefined,'tc-players');participants.setAttribute('aria-label','本手主要参与者底牌');const relevant=p=>finalParticipant(p,report);for(const p of report.players||[])if(relevant(p))participants.append(playerCard(p,report));dialog.append(participants);dialog.append(node('p','以上金额为本手净输赢，已扣除自己的投入。','tc-net-caption'));const rest=(report.players||[]).filter(p=>!relevant(p));if(rest.length){const amounts=node('div',undefined,'tc-other-results');amounts.setAttribute('aria-label','其他玩家净输赢');for(const p of rest){const row=node('div');row.append(node('span',p.name),netNode(p));amounts.append(row);}dialog.append(amounts);const others=node('details',undefined,'tc-other-cards');others.append(node('summary',`其他底牌 · ${rest.length} 人`));const grid=node('div',undefined,'tc-players');for(const p of rest)grid.append(playerCard(p,report,false));others.append(grid);dialog.append(others);}dialog.append(settlementView(report));const content=node('section',undefined,'tc-analysis');content.setAttribute('aria-live','polite');content.append(node('p','正在回看你的决定…'));dialog.append(content);const footer=node('footer',undefined,'tc-review-footer');footer.append(node('span',report.multiplayer?'关闭后可随时重新打开；由房主决定何时发下一手。':'关闭后可随时重新打开；由你决定何时继续。'));const next=node('button',report.canContinue?'下一手 →':'本场结束 · 重新开桌 →','tc-next');next.id='teaching-next-hand';next.addEventListener('click',()=>{if(report.multiplayer){if(window.PokerRoom?.getSnapshot()?.phase==='finished'){window.PokerTeaching?.leaveRoom?.();return;}if(window.PokerTeaching?.nextHand()){next.disabled=true;closeReview();}return;}if(!report.canContinue){closeReview();window.App?.leaveGame?.();return;}if(window.PokerTeaching?.nextHand()){next.disabled=true;closeReview();}});footer.append(next);dialog.append(footer);returnFocus=document.activeElement;if(!dialog.open)dialog.showModal();close.focus();suppressUpstream();requestAnimationFrame(()=>requestAnimationFrame(async()=>{if(token!==revision)return;try{const analysis=await analyzeHandAsync(report);if(token!==revision)return;fillAnalysis(report,analysis,content);}catch(e){if(token!==revision)return;content.replaceChildren(node('p','本手分析暂不可用。你仍可查看底牌并继续练习。'));console.error(e);}}));}
function suppressUpstream(){if(!active)return;for(const e of document.querySelectorAll('#g-actions .pct-p'))if(e.textContent==='Pot')e.textContent='底池';for(const id of ['g-winner-overlay','g-next-hand-btn','g-endgame-overlay']){const e=$(id);if(e&&e.style.display!=='none')e.style.display='none';}if(window._winnerTimer){clearTimeout(window._winnerTimer);window._winnerTimer=null;}}
function receive(p){if(!p)return;if(p.type==='reset'){spectating=false;revision++;reviewing=false;active=false;lastReport=null;open.hidden=true;closeReview();document.body.classList.remove('tc-active');return;}active=true;document.body.classList.add('tc-active');if(p.type==='handStart'){spectating=false;clearTimeout(bubbleTimer);bubble?.remove();bubble=null;revision++;window.App?.setPlayingMode?.(0);heroId=p.heroId;reviewing=false;lastReport=null;open.hidden=true;closeReview();dialog.replaceChildren();}else if(p.type==='action'){if(p.playerId===heroId&&['fold','allin'].includes(p.action))spectating=true;speech(p);}else if(p.type==='complete')renderReview(p.report);}
window.addEventListener('pth-teaching',e=>receive(e.detail));window.addEventListener('resize',positionBubble);window.addEventListener('scroll',positionBubble,true);new MutationObserver(()=>{suppressUpstream();positionBubble();}).observe($('s-game')||document.body,{childList:true,subtree:true});for(const id of ['g-winner-overlay','g-endgame-overlay'])if($(id))new MutationObserver(suppressUpstream).observe($(id),{attributes:true,attributeFilter:['style']});receive(window.PokerTeaching?.getState?.());
