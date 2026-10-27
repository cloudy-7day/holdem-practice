// Friend rooms require a fresh input during the authoritative turn.
export function createFriendInputGuard({getTurn,getHero,getKeys}) {
 let pressedTurn=null, keyTurn=null;
 return event=>{
  const turn=getTurn(), current=turn&&turn.playerId===getHero()?turn.turnId:null;
  const actionTarget=!!event.target?.closest?.('#g-actions .btn-action');
  if(event.type==='keyup'){
   if(event.key===' '&&keyTurn!==null){const allowed=!!current&&keyTurn===current;keyTurn=null;return allowed;}
   return true;
  }
  if(event.type==='keydown'){
   const key=event.key.toLowerCase(), keys=Object.values(getKeys()||{}).map(k=>String(k).toLowerCase());
   if(['f6','f7','f8'].includes(key)||(event.altKey&&['m','k','f'].includes(key)))return false;
   if(!actionTarget&&event.target?.id!=='raise-amt'&&event.target?.closest?.('button, a, input, textarea, select, [contenteditable=true]'))return true;
   if(!keys.includes(key)&&!['f1','f2','f3','f4',' ','enter'].includes(key))return true;
   if(key===' '&&!event.repeat)keyTurn=current||false;
   return !!current&&!event.repeat;
  }
  if(!actionTarget)return true;
  if(event.type==='pointerdown'){pressedTurn=current;return !!current;}
  if(event.type==='click'&&event.detail!==0){const allowed=event.detail===1&&!!current&&pressedTurn===current;pressedTurn=null;return allowed;}
  return !!current;
 };
}
