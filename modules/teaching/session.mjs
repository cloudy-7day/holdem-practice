import { explainSettlement } from './settlement.mjs';
// Teaching bridge for the upstream OfflineTable. Never publish opponents' live context.
export const copy = value => JSON.parse(JSON.stringify(value));
export class TeachingSession {
  constructor(publish = () => {}) { this.publish = publish; this.last = null; this.reset(); }
  emit(packet) { this.last = copy(packet); this.publish(copy(packet)); }
  reset() { this.hand = null; this.contexts = {}; this.ready = false; this.emit({type:'reset'}); }
  start(ev, table, players) {
    this.ready = false; this.contexts = {};
    this.hand = {handNumber:ev.handNum, heroId:1, bb:ev.bb, board:[], decisions:[], players:ev.seats.map(s => {
      const p=players.find(p=>p.id===s.id)||{};
      return {id:s.id,name:p.name||String(s.id),style:p.arch||'human',hole:copy(ev.holeByPlayer[s.id]),stack:s.stack,
        start:s.stack+(table.h.committed[s.id]||0)};
    })};
    this.emit({type:'handStart',handNumber:ev.handNum,heroId:1,players:this.hand.players.map(({id,name,style,start})=>({id,name,style,stack:start})),dealerId:ev.dealerId,bb:ev.bb});
  }
  turn(ev, table) {
    const h=table.h;
    const publicPlayers=h._order.filter(p=>h.inHand[p.id]).map((p,position)=>({
      id:p.id,name:this.name(p.id),stack:p.stack,committed:h.committed[p.id]||0,
      streetCommitted:h.streetCommit[p.id]||0,folded:!!h.folded[p.id],allin:!!h.allin[p.id],position
    }));
    const publicHistory=this.hand.decisions.map(d=>({playerId:d.playerId,action:d.action,paid:d.paid,
      totalStreetBet:d.totalStreetBet,street:d.context.gameState,board:d.context.board.slice(),
      isAggressive:['bet','raise'].includes(d.action)||(d.action==='allin'&&d.totalStreetBet>d.context.currentBet),
      potBefore:d.context.legal.pot,callBefore:d.context.legal.callAmt,currentBet:d.context.currentBet}));
    const context=copy({...ev,currentBet:h.currentBet,minRaise:h.minRaise,streetCommitted:h.streetCommit[ev.playerId]||0,
      heroTotalCommitted:h.committed[ev.playerId]||0,publicPlayers,publicHistory});
    this.contexts[ev.playerId]=context;
    return ev.playerId===1 ? {type:'turn',context,playerName:this.name(ev.playerId)} : {type:'thinking',playerId:ev.playerId,playerName:this.name(ev.playerId)};
  }
  name(id) { return this.hand?.players.find(p=>p.id===id)?.name||String(id); }
  action(ev) {
    this.hand.decisions.push(copy({playerId:ev.playerId,playerName:this.name(ev.playerId),context:this.contexts[ev.playerId],action:ev.action,paid:ev.paid,totalStreetBet:ev.totalStreetBet}));
    const words={fold:'弃牌',check:'过牌',call:'跟注',bet:'下注',raise:'加注',allin:'全下'};
    this.emit({type:'action',playerId:ev.playerId,playerName:this.name(ev.playerId),action:ev.action,paid:ev.paid,totalStreetBet:ev.totalStreetBet,gameState:ev.gameState,
      speech:`${this.name(ev.playerId)}${words[ev.action]||ev.action}${ev.paid>0?`，投入 ${ev.paid} 筹码`:''}。`});
  }
  report(table, gameOver=false) {
    const h=table.h;
    const report = {...copy(this.hand),board:copy(h.board),players:this.hand.players.map(p=>{
      const stack=table.players.find(q=>q.id===p.id)?.stack||0;const {start,...rest}=p;
      const decisions=this.hand.decisions.filter(d=>d.playerId===p.id);
      return {...rest,folded:!!h.folded[p.id],stack,net:stack-start,committed:h.committed[p.id]||0,
        voluntaryPaid:decisions.reduce((sum,d)=>sum+(d.paid||0),0),sawFlop:decisions.some(d=>d.context.board.length>=3)};
    }),winnerIds:(h.results||[]).filter(r=>(r.contestedWon??r.won)>0).map(r=>r.playerId),canContinue:!gameOver&&table.players.some(p=>p.id===1&&p.in&&p.stack>0)};
    if(h.settlement) report.settlement=explainSettlement(copy(h.settlement),report.players);
    return report;
  }
  complete(report) { this.ready=report.canContinue; this.emit({type:'complete',report}); }
  consume() { if(!this.ready)return false;this.ready=false;return true; }
  getState() { return copy(this.last); }
}
