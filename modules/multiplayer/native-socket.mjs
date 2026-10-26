import {buildMessage,encode,packed,parseClientFrame,frame,TYPE} from '../offline/proto.mjs';
const GS={preflop:0,flop:1,turn:2,river:3};
const ACTION={1:'fold',2:'check',3:'call',4:'bet',5:'raise',6:'allin'};
const NPA={fold:1,check:2,call:3,bet:4,raise:5,allin:6};

/** A transport bridge only: all cards, decisions and chip accounting belong to the room server. */
export function createRoomSocket({snapshot,sendCommand,fetchSnapshot,publish=()=>{},onLeave=()=>{},onStatus=()=>{},pollInterval=1000}) {
  let state=snapshot,initialized=false,started=false,closed=false,lastEvent=0,lastTurn=null,lastReport=null,busy=false,submittedTurn=null,localHand=0,hydrated=false,lastNativeResetRevision=null;
  const roster=new Set();
  const socket={CONNECTING:0,OPEN:1,CLOSING:2,CLOSED:3,readyState:0,binaryType:'arraybuffer',onopen:null,onmessage:null,onerror:null,onclose:null};
  const send=(name,spec)=>{const bytes=name==='GameStartRejoin'?frame(encode([[1,0,39],[40,2,encode(spec)]])):buildMessage(name,spec);setTimeout(()=>{if(!closed)socket.onmessage?.({data:bytes.buffer});},0);};
  const emit=packet=>setTimeout(()=>{if(!closed)publish(packet);},0);
  const info=id=>{const p=state.players.find(p=>p.id===id);if(p)send('PlayerInfoReply',[[1,0,id],[2,2,encode([[1,2,p.name],[2,0,p.isBot?0:1],[3,0,p.isBot?2:1]])]]);};
  function gameInfo(){const c=state.config;return encode([[1,2,`好友房 ${state.code}`],[2,0,1],[3,0,c.maxPlayers],[4,0,1],[5,0,0],[7,0,3],[9,0,5],[10,0,0],[11,0,c.turnSeconds],[12,0,c.smallBlind],[13,0,c.startMoney],[14,2,packed([c.smallBlind])],[15,0,1]]);}
  function join(){const gi=gameInfo(),ids=state.players.map(p=>p.id);send('GameListNew',[[1,0,1],[2,0,1],[3,0,0],[4,2,packed(ids)],[5,0,state.hostId],[6,2,gi]]);send('JoinGameAck',[[1,0,1],[2,0,state.heroId===state.hostId?1:0],[3,2,gi]]);for(const p of state.players){roster.add(p.id);send('GamePlayerJoined',[[1,0,1],[2,0,p.id],[3,0,p.id===state.hostId?1:0]]);info(p.id);} }
  function action(ev){send('PlayersActionDone',[[1,0,1],[2,0,ev.playerId],[3,0,ev.type==='blindPosted'?(ev.blind==='sb'?4:5):(GS[ev.gameState]??0)],[4,0,NPA[ev.action]||0],[5,0,ev.totalStreetBet],[6,0,ev.stack],[7,0,ev.currentBet],[8,0,ev.minRaise]]);}
  function event(ev,{announceAction=false}={}){
    switch(ev.type){
      case 'handStart': {
        localHand=ev.handNum||localHand+1;const seats=ev.seats||state.players;const hole=state.players.find(p=>p.id===state.heroId)?.hole||[];
        for(const p of state.players){let stack=ev.startingStacks?.[p.id]??(seats.some(q=>q.id===p.id)?p.stack:0)+(p.id===ev.sbId?ev.sb:0)+(p.id===ev.bbId?ev.bb:0);action({playerId:p.id,stack,totalStreetBet:0,currentBet:0,minRaise:ev.bb});}
        send('HandStart',[[1,0,1],[2,2,encode([[1,0,hole[0]],[2,0,hole[1]]])],[4,0,ev.sb],...seats.map(()=>[5,0,0]),[6,0,ev.dealerId]]);
        emit({type:'handStart',handNumber:state.handNumber,heroId:state.heroId,players:seats.map(p=>({id:p.id,name:state.players.find(q=>q.id===p.id)?.name,stack:ev.startingStacks?.[p.id]??p.stack})),dealerId:ev.dealerId,bb:ev.bb});lastTurn=null;lastReport=null;break;
      }
      case 'blindPosted':action(ev);break;
      case 'actionDone': {
        action(ev);
        if(announceAction){const playerName=state.players.find(p=>p.id===ev.playerId)?.name||String(ev.playerId);const word={fold:'弃牌',check:'过牌',call:'跟注',bet:'下注',raise:'加注',allin:'全下'}[ev.action]||ev.action;
          emit({type:'action',playerId:ev.playerId,playerName,action:ev.action,paid:ev.paid,totalStreetBet:ev.totalStreetBet,gameState:ev.gameState,speech:`${playerName}${word}${ev.paid>0?`，投入 ${ev.paid} 筹码`:''}。`});}
        break;
      }
      case 'dealFlop':send('DealFlop',[[1,0,1],[2,0,ev.cards[0]],[3,0,ev.cards[1]],[4,0,ev.cards[2]]]);break;
      case 'dealTurn':case 'dealRiver':send(ev.type==='dealTurn'?'DealTurn':'DealRiver',[[1,0,1],[2,0,ev.card]]);break;
      case 'showdown':send('EndOfHandShow',[[1,0,1],...ev.results.map(r=>[2,2,encode([[1,0,r.playerId],[2,0,r.cards[0]],[3,0,r.cards[1]],[5,0,r.won],[6,0,r.stack??state.players.find(p=>p.id===r.playerId)?.stack]])])]);break;
      case 'gameOver':send('EndOfGame',[[1,0,1],[2,0,ev.winnerId]]);break;
      case 'endOfHandHide':send('EndOfHandHide',[[1,0,1],[2,0,ev.playerId],[3,0,ev.moneyWon],[4,0,ev.playerMoney]]);break;
    }
  }
  function render(next){
    if(closed||!next||next.revision<state.revision)return;state=next;onStatus({connected:true,snapshot:state});if(!initialized)return;
    for(const p of state.players)if(!roster.has(p.id)){roster.add(p.id);send('GamePlayerJoined',[[1,0,1],[2,0,p.id],[3,0,p.id===state.hostId?1:0]]);info(p.id);}
    for(const id of roster)if(!state.players.some(p=>p.id===id)){roster.delete(id);send('GamePlayerLeft',[[1,0,1],[2,0,id],[3,0,0]]);}
    if(!started){if(state.phase==='waiting')return;started=true;send('GameStartInitial',[[1,0,1],[2,0,state.dealerId],[3,2,packed(state.players.map(p=>p.id))]]);if(state.handNumber>1){localHand=state.handNumber-1;send('GameStartRejoin',[[1,0,1],[2,0,state.dealerId],[3,0,localHand],...state.players.map(p=>[4,2,encode([[1,0,p.id],[2,0,p.stack]])])]);}}
    if(state.nativeReset&&lastNativeResetRevision!==state.revision){lastNativeResetRevision=state.revision;
      if(!hydrated)event({type:'handStart',handNum:state.handNumber,sb:state.config.smallBlind,bb:state.config.smallBlind*2,dealerId:state.dealerId,seats:state.players,startingStacks:Object.fromEntries(state.players.map(p=>[p.id,p.stack+p.streetCommitted]))});
      // Old persisted rooms have no event journal. Render only their visible snapshot.
      if(state.board.length>=3)event({type:'dealFlop',cards:state.board.slice(0,3)});
      if(state.board.length>=4)event({type:'dealTurn',card:state.board[3]});
      if(state.board.length>=5)event({type:'dealRiver',card:state.board[4]});
      for(const p of state.players)action({playerId:p.id,action:p.folded?'fold':undefined,stack:p.stack,totalStreetBet:p.streetCommitted,currentBet:state.turn?.currentBet||0,minRaise:state.turnContext?.minRaise||state.config.smallBlind*2,gameState:state.street});
      for(const ev of state.nativeEvents||[])lastEvent=Math.max(lastEvent,ev.id);
      const settled=state.phase==='review'||state.phase==='finished';
      emit({type:'roomSync',snapshot:{handNumber:state.handNumber,phase:state.phase,pot:settled?0:state.pot,street:state.street,dealerId:state.dealerId,sbId:state.sbId,bbId:state.bbId,
        currentBet:settled?0:(state.turn?.currentBet||0),minRaise:state.turnContext?.minRaise||state.config.smallBlind*2,
        players:state.players.map(p=>({id:p.id,stack:p.stack,in:p.in,folded:p.folded,allin:p.allin,streetCommitted:settled?0:p.streetCommitted}))}});
    }
    const fresh=state.nativeReset?[]:(state.nativeEvents||[]).filter(ev=>ev.id>lastEvent);const lastAction=fresh.filter(ev=>ev.type==='actionDone').at(-1);
    for(const ev of fresh){event(ev,{announceAction:hydrated&&ev===lastAction});lastEvent=ev.id;}hydrated=true;
    if(state.turn&&state.turn.turnId!==lastTurn){lastTurn=state.turn.turnId;submittedTurn=null;send('PlayersTurn',[[1,0,1],[2,0,state.turn.playerId],[3,0,GS[state.street||state.turnContext?.gameState]??(state.board.length===5?3:state.board.length===4?2:state.board.length===3?1:0)]]);emit(state.turn.playerId===state.heroId&&state.turnContext?{type:'turn',context:state.turnContext,playerName:state.players.find(p=>p.id===state.heroId)?.name}:{type:'thinking',playerId:state.turn.playerId,playerName:state.players.find(p=>p.id===state.turn.playerId)?.name});}
    if(state.report&&lastReport!==state.handNumber){lastReport=state.handNumber;emit({type:'complete',report:{...state.report,multiplayer:{hostId:state.hostId,heroId:state.heroId}}});}
  }
  async function command(value){try{const next=await sendCommand(value);render(next);return next;}catch(error){submittedTurn=null;lastTurn=null;onStatus({connected:true,error:error.message,snapshot:state});try{render(await fetchSnapshot());}catch{}throw error;}}
  socket.send=data=>{if(closed)return;const bytes=data instanceof ArrayBuffer?new Uint8Array(data):new Uint8Array(data.buffer||data,data.byteOffset||0,data.byteLength);let m;try{m=parseClientFrame(bytes);}catch{return;}
    if(m.typeId===TYPE.Init){send('InitAck',[[1,2,Uint8Array.from({length:16},(_,i)=>i+1)],[2,0,state.heroId]]);send('PlayerList',state.players.map(p=>[1,0,p.id]));initialized=true;join();render(state);}
    else if(m.typeId===TYPE.PlayerInfoRequest)for(const id of m.fields[1]||[])info(id);
    else if(m.typeId===TYPE.MyActionRequest){const t=state.turn;if(!t||t.playerId!==state.heroId||submittedTurn===t.turnId)return;const street=GS[state.street||state.turnContext?.gameState]??(state.board.length===5?3:state.board.length===4?2:state.board.length===3?1:0);if(m.fields[2]?.[0]!==localHand||m.fields[3]?.[0]!==street)return;const action=ACTION[m.fields[4]?.[0]];if(!action)return;submittedTurn=t.turnId;const cmd={type:'action',turnId:t.turnId,action};if(['bet','raise','allin'].includes(action))cmd.amountTo=t.streetCommitted+(m.fields[5]?.[0]||0);command(cmd).catch(()=>{});}
    else if(m.typeId===TYPE.LeaveGame)command({type:'leave'}).then(onLeave).catch(()=>{});
    else if(m.typeId===36&&state.phase==='waiting'&&state.hostId===state.heroId)command({type:'start'}).catch(()=>{});
  };
  socket.close=()=>{if(closed)return;closed=true;clearInterval(timer);socket.readyState=3;socket.onclose?.({code:1000,reason:'room transport closed'});};
  socket.getSnapshot=()=>state;socket.command=command;socket.refresh=async()=>render(await fetchSnapshot());
  const timer=setInterval(async()=>{if(closed||busy)return;busy=true;try{render(await fetchSnapshot());}catch(error){onStatus({connected:false,error:error.message,snapshot:state});}finally{busy=false;}},pollInterval);
  setTimeout(()=>{if(closed)return;socket.readyState=1;socket.onopen?.({});const ver=encode([[1,0,5],[2,0,1]]);send('Announce',[[1,2,ver],[2,2,encode([[1,0,2],[2,0,0]])],[3,0,0],[4,0,0],[5,0,1]]);},0);
  return socket;
}
