/** Heuristic + Monte-Carlo bot decision for the offline (Training-mode) engine.
 *  Pure & deterministic given bot.rng.
 *
 *  Strength is a real win-probability (equity) estimated by Monte-Carlo rollout
 *  against the *actual number of opponents still in the hand*, evaluated with
 *  the vendored phe module (direct 5-7 card lookup, ~20x faster than the
 *  engine's combinatorial bestHand()) — so draws, board texture and multiway
 *  spots are all valued correctly, at much higher sample counts for the same
 *  CPU budget. On top of that:
 *    • short stacks (<= 8 BB preflop) switch to correct shove-or-fold play;
 *    • a difficulty level (bot.skill) tunes MC precision, hand-reading noise,
 *      whether push/fold is used, and bluff frequency.
 */
import { ACT } from './engine.mjs';
import { evaluateCardCodes, cardCode } from '../../vendor/phe.mjs';

// PokerTH index (0..12=diamonds, 13..25=hearts, 26..38=spades, 39..51=clubs;
// value = n % 13, 0=deuce) -> phe card code. Built once at module load.
// NOTE: phe cardCode takes TWO arguments (rank, suit) — the single-string
// form silently returns 0 (see scripts/test-phe.mjs).
const PHE_MAP = (() => {
  const suits = ['d', 'h', 's', 'c'];
  const rk = ['2', '3', '4', '5', '6', '7', '8', '9', 'T', 'J', 'Q', 'K', 'A'];
  const m = new Array(52);
  for (let n = 0; n < 52; n++) m[n] = cardCode(rk[n % 13], suits[(n / 13) | 0]);
  return m;
})();
// Hand strength for 5-7 PokerTH indices — phe scale: SMALLER = better.
function pheStrength(cards){
  const codes = new Array(cards.length);
  for (let i = 0; i < cards.length; i++) codes[i] = PHE_MAP[cards[i]];
  return evaluateCardCodes(codes);
}

// Small fast PRNG (mulberry32). Seeded once per decision from bot.rng so the
// rollout is reproducible AND we touch the engine's shared rng only once,
// instead of draining hundreds of values from the deck-shuffling stream.
function mulberry32(seed){
  let a = seed >>> 0;
  return function(){
    a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/**
 * Win probability of `hole` vs `opp` random opponents given `board`
 * (0/3/4/5 community cards already known). Ties split the pot fairly.
 * Deterministic given `rng`.
 */
export function equityMC(hole, board, opp, samples, rng){
  opp = Math.max(1, Math.min(opp, 5));        // cap opponents modelled (bounds cost)
  const known = new Set([...hole, ...board]);
  const deck = [];
  for(let c=0;c<52;c++) if(!known.has(c)) deck.push(c);
  const needBoard = 5 - board.length;
  const need = needBoard + opp*2;
  let equity = 0;
  for(let s=0;s<samples;s++){
    // partial Fisher–Yates: only shuffle the cards we consume this sample
    const d = deck;
    for(let i=0;i<need;i++){
      const j = i + Math.floor(rng()*(d.length-i));
      const tmp=d[i]; d[i]=d[j]; d[j]=tmp;
    }
    const fullBoard = needBoard ? board.concat(d.slice(0, needBoard)) : board;
    let k = needBoard;
    const my = pheStrength(hole.concat(fullBoard));   // phe: smaller = better
    let beat = true, tied = 0;
    for(let o=0;o<opp;o++){
      const os = pheStrength([d[k++], d[k++]].concat(fullBoard));
      if(os < my){ beat=false; break; }
      if(os === my) tied++;
    }
    if(beat) equity += tied>0 ? 1/(tied+1) : 1;   // split fairly on ties
  }
  return equity / samples;
}

// Difficulty presets. samples = MC precision; noise = hand-reading error
// (beginner bots misjudge equity); pushfold = use correct short-stack play;
// bluffMul = bluff-frequency multiplier.
// Sample counts sized for the phe evaluator (each sample = 1+opp direct 7-card
// lookups): even 'hard' costs only a few ms per decision on mobile.
const SKILLS = {
  easy:   { samples: 100,  noise: 0.20, pushfold: false, bluffMul: 0.5 },
  normal: { samples: 700,  noise: 0.06, pushfold: true,  bluffMul: 1.0 },
  hard:   { samples: 2500, noise: 0.00, pushfold: true,  bluffMul: 1.4 },
};
export function skillOf(s){ return (s && SKILLS[s]) ? SKILLS[s] : SKILLS.normal; }

// Player archetypes — a *style* layer orthogonal to skill. Skill tunes how well
// a bot reads equity; the archetype tunes how it plays:
//   aggrLo/aggrHi = range the per-bot aggression is drawn from;
//   callMargin    = equity cushion required to call a bet (default 0.04);
//   bluffMul      = style bluff-frequency multiplier (on top of skill.bluffMul);
//   weight        = relative frequency at a freshly filled table.
export const ARCHETYPES = {
  rock:    { weight: 15, aggrLo: 0.15, aggrHi: 0.30, callMargin:  0.10, bluffMul: 0.2, entryEq: 0.63, openMul: 1.30 },
  tag:     { weight: 30, aggrLo: 0.55, aggrHi: 0.75, callMargin:  0.05, bluffMul: 1.0, entryEq: 0.55, openMul: 1.80 },
  lag:     { weight: 20, aggrLo: 0.70, aggrHi: 0.95, callMargin:  0.00, bluffMul: 1.6, entryEq: 0.45, openMul: 0.65 },
  station: { weight: 20, aggrLo: 0.10, aggrHi: 0.25, callMargin: -0.06, bluffMul: 0.3, entryEq: 0.00, openMul: 0.03 },
  maniac:  { weight: 15, aggrLo: 0.85, aggrHi: 1.00, callMargin: -0.02, bluffMul: 2.4, entryEq: 0.08, openMul: 0.55 },
};

// Deterministic weighted archetype pick. Consumes exactly two rng() values
// (one for the profile, one for the aggression draw). Returns a ready-to-use
// style bundle to merge into a bot config.
export function pickArchetype(rng){
  const r = rng || Math.random;
  const names = Object.keys(ARCHETYPES);
  let total = 0; for (const n of names) total += ARCHETYPES[n].weight;
  let x = r() * total, name = names[names.length - 1];
  for (const n of names){ x -= ARCHETYPES[n].weight; if (x < 0){ name = n; break; } }
  const A = ARCHETYPES[name];
  const aggr = A.aggrLo + r() * (A.aggrHi - A.aggrLo);
  return { arch: name, aggr, callMargin: A.callMargin, bluffMul: A.bluffMul, entryEq: A.entryEq, openMul: A.openMul };
}

// Strong drawing hands for semi-bluffing: a 4-card flush draw or an open-ended
// straight draw. Uses the engine's card encoding (rank = c%13, suit = c/13) and
// only applies on the flop or turn (3–4 board cards) — never the river.
function hasStrongDraw(hole, board){
  const b = board || [];
  if (b.length < 3 || b.length >= 5) return false;
  const cs = (hole || []).concat(b).filter(c=>c!=null && c>=0 && c<52);
  if (cs.length < 4) return false;
  const suit = [0,0,0,0]; cs.forEach(c=>suit[Math.floor(c/13)]++);
  if (suit.some(n=>n===4)) return true;                 // flush draw (5+ = made flush, ignored)
  const r = new Set(cs.map(c=>c%13));
  if (r.has(12)) r.add(-1);                             // ace plays low (wheel A-2-3-4-5)
  for (let lo=-1; lo<=9; lo++){                         // window of 4 consecutive ranks lo..lo+3
    let run=0; for (let k=0;k<4;k++) if (r.has(lo+k)) run++;
    if (run===4){
      const canLow  = (lo-1)>=0 && !r.has(lo-1);
      const canHigh = (lo+4)<=12 && !r.has(lo+4);
      if (canLow || canHigh) return true;               // open-ended straight draw
    }
  }
  return false;
}

// A deterministic starting-hand ordering, calibrated by all 1,326 combinations.
// This is a teaching heuristic, not a solver range. It uses only the bot's cards.
function openingScore(hole){
  const ranks=hole.map(c=>c%13+2).sort((a,b)=>b-a),[hi,lo]=ranks;
  const high=hi===14?10:hi===13?8:hi===12?7:hi===11?6:hi/2;
  if(hi===lo)return Math.max(5,high*2);
  const gap=hi-lo-1;
  return high+(Math.floor(hole[0]/13)===Math.floor(hole[1]/13)?2:0)
    -(gap<=0?0:gap===1?1:gap===2?2:gap===3?4:5)
    +(gap<=1&&hi<12?1:0);
}
const OPENING_SCORES=[];
for(let a=0;a<52;a++)for(let b=a+1;b<52;b++)OPENING_SCORES.push(openingScore([a,b]));
OPENING_SCORES.sort((a,b)=>a-b);
export function startingHandPercentile(hole){
  const score=openingScore(hole);
  let lower=0,equal=0;
  for(const s of OPENING_SCORES){if(s<score)lower++;else if(s===score)equal++;else break;}
  return (lower+equal/2)/OPENING_SCORES.length;
}

// ctx = the engine 'turn' event payload.
// bot = { aggr:0..1, rng, skill:'easy'|'normal'|'hard' }
export function decide(ctx, bot){
  bot = bot || {};
  const rng = bot.rng || Math.random;
  const a   = bot.aggr!=null ? bot.aggr : 0.5;
  const sk  = skillOf(bot.skill);
  const mc  = mulberry32((Math.floor(rng()*4294967296) ^ 0x9e3779b9) >>> 0); // isolated rollout rng
  const L = ctx.legal, pot = L.pot, toCall = L.callAmt;
  const board = ctx.board || [];
  const potOdds = toCall/(pot+toCall);

  // equity vs `opp` opponents, with difficulty-scaled precision + misjudgement
  const eq = (opp)=>{
    const n = Math.max(100, Math.round(sk.samples / Math.sqrt(Math.max(1,opp))));
    let e = equityMC(ctx.hole, board, opp, n, mc);
    if (sk.noise > 0){ e += (mc()*2-1)*sk.noise; e = Math.max(0, Math.min(1, e)); }
    return e;
  };

  const preflop = ((L.street || ctx.gameState) === 'preflop');
  const committed = Math.max(0, L.maxRaiseTo - (ctx.stack || 0));
  const streetBet = ctx.currentBet ?? (toCall + committed);
  const openedPre = preflop && streetBet > (L.bb || 0);
  // A pot-sized raise pays the call first, then raises a fraction of the
  // resulting pot. minRaiseTo is a legal floor, not an extra sizing component.
  const sizedRaise = fraction => Math.max(L.minRaiseTo, Math.min(L.maxRaiseTo,
    Math.round(streetBet + (pot + toCall) * fraction)));
  const fieldSize = Math.max(1, (ctx.numActive || 2) - 1);
  const fieldSizing = 1 / Math.sqrt(fieldSize);
  const raiseTo = ()=>sizedRaise((0.4+a*0.3)*fieldSizing);
  const raiseRiver = ()=>sizedRaise((0.55+a*0.25)*fieldSizing);
  // Pre-flop sizing: realistic opens (~2.3–3.3 BB, +1 BB per limper) and 3-bet/4-bet
  // sized off the current bet (~2.5–3.3×), instead of a fraction of a snowballing pot.
  // This is what keeps the first betting round from escalating to all-in so fast.
  const raiseToPre = ()=>{
    const bb = L.bb || 0;
    let t;
    if (!openedPre){                                          // unopened pot → standard open
      const limped = Math.max(0, pot - 1.5*bb);                 // chips limped beyond the blinds
      t = bb*(2.3 + a*1.0) + limped;                            // ~2.3–3.3 BB +1 BB per limper
    } else {                                                    // facing a raise → 3-bet / 4-bet
      const curBet = (L.maxRaiseTo - (ctx.stack||0)) + toCall;  // highest total street commit
      t = curBet*(2.5 + a*0.8);                                 // ~2.5–3.3× the current bet
    }
    t = Math.round(t);
    return Math.max(L.minRaiseTo, Math.min(L.maxRaiseTo, t));
  };
  const jam     = ()=> ({ action: ACT.RAISE, amountTo: L.maxRaiseTo });

  // ── Short-stack push/fold (skill-gated) ──────────────────────────────────
  // Preflop at <=8 actual BB, use a shove-or-fold heuristic. Never apply
  // this entry-range shortcut after community cards have been dealt.
  const stackBB = ctx.stackBB ?? ((L.bb || 0)>0 ? ctx.stack/L.bb : 99);
  if (preflop && sk.pushfold && stackBB <= 8 && L.canRaise){
    const M = stackBB;
    const shoveEq = eq(1);                                       // ~one caller assumed
    const late = (ctx.numPlayers && ctx.posFromButton!=null) ? (ctx.posFromButton <= 1) : false;
    let need = 0.50 + (M/8)*0.12 - (late?0.06:0) - a*0.04;        // looser when shorter / in position
    need = Math.max(0.42, Math.min(0.66, need));
    if (L.canCheck) return (shoveEq > need + 0.06) ? jam() : { action: ACT.CHECK };  // BB free option
    if (shoveEq > need) return jam();
    if (shoveEq > potOdds + 0.02) return { action: ACT.CALL };   // priced-in call
    return { action: ACT.FOLD };
  }

  // ── Normal play (equity vs the real field) ───────────────────────────────
  const opp = Math.max(1, (ctx.numActive || 2) - 1);
  // Random-hand equity overstates strength against a bettor, especially a
  // player raising our existing wager. Use a conservative range cushion;
  // checked-to value bets and strong hands retain their full equity.
  const pressure = !preflop && !L.canCheck ? (committed > 0 ? 0.18 : 0.10) : 0;
  const rawStrength = preflop ? (openedPre ? eq(1) : startingHandPercentile(ctx.hole)) : eq(opp);
  const str = Math.max(0, rawStrength - pressure * (1 - Math.pow(rawStrength, 8)));
  const cm  = bot.callMargin != null ? bot.callMargin : 0.04;
  const om  = bot.openMul    != null ? bot.openMul    : 1;
  const bm  = bot.bluffMul   != null ? bot.bluffMul   : 1;
  const pRaise  = Math.min(0.92, a * om);             // PRE-FLOP raise propensity (PFR), openMul-tuned
  const pPost   = Math.min(0.92, a * 0.9);            // POST-FLOP raise propensity, aggr-driven (decoupled)
  // Fewer bluffs and smaller bets into several players; a large raise is
  // evidence against blindly re-raising every available draw.
  const cbetP      = Math.min(0.90, a*0.95) / opp;
  const semiBluffP = Math.min(0.85, a*0.65) / Math.sqrt(opp);          // semi-bluff-a-draw frequency, aggr-driven
  const draw    = !preflop && hasStrongDraw(ctx.hole, board);
  const isAggr  = (ctx.aggressorId != null && ctx.playerId != null && ctx.aggressorId === ctx.playerId);
  const bluff   = ()=> (L.canRaise && rng() < 0.05*a*sk.bluffMul*bm && L.maxRaiseTo > toCall*3);

  // An unopened pot is a range-entry decision: opponents who have not acted
  // are not all guaranteed callers. Multiway showdown equity against every seat
  // would incorrectly fold even AA at a full table. After an actual raise use
  // heads-up equity plus the archetype's price/range cushion instead.
  if (preflop){
    let pPre=pRaise;
    const n=ctx.numPlayers||6, pos=ctx.posFromButton;
    let range=({rock:0.14,tag:0.20,lag:0.34,station:0.55,maniac:0.65})[bot.arch];
    // Imported/custom configs may carry entryEq without the archetype name.
    if(range==null){const e=bot.entryEq??0.55;range=e>=0.60?0.14:e>=0.50?0.20:e>=0.30?0.34:e<=0?0.55:0.65;}
    if(n<=3)range+=0.16;
    else if(pos===0||pos===n-1){range+=0.08;pPre=Math.min(0.95,pPre+0.15);}
    else if(n>=6&&(pos===3||pos===4))range-=0.04;
    else if(pos===1)range+=0.02;
    range=Math.max(0.08,Math.min(0.85,range));
    let enter;
    if(openedPre){
      const entry=bot.entryEq??0.55;
      const priceBB = streetBet / (L.bb || 1);
      // Large reraises represent a tighter range than a single opening raise.
      // Preserve style differences without treating random-opponent equity as
      // permission to keep escalating ordinary broadways and small pairs.
      const rangeFloor = priceBB >= 20 ? 0.97 : priceBB >= 8 ? 0.90 : 0;
      enter=str>=Math.max(entry,potOdds+cm)
        && startingHandPercentile(ctx.hole) >= Math.max(0,rangeFloor-(a*0.04));
      pPre*=0.35;
      if(str>0.80)pPre=Math.max(pPre,0.85);
    }else enter=str>=1-range;
    if(L.canCheck){
      if(enter&&L.canRaise&&rng()<pPre)return {action:ACT.RAISE,amountTo:raiseToPre()};
      return {action:ACT.CHECK};
    }
    if(!enter)return {action:ACT.FOLD};
    if(L.canRaise&&rng()<pPre)return {action:ACT.RAISE,amountTo:raiseToPre()};
    return {action:ACT.CALL};
  }

  // ── Multi-street barrelling state (per hand, carried on the bot config) ───
  // The engine keeps `aggressorId` = the LAST player to bet/raise, and never
  // resets it between streets. So at the first decision of a new post-flop
  // street, aggressorId === playerId means *I* fired the previous street and
  // nobody has raised since → I'm the one who can barrel. We track how many
  // barrels I've already fired this hand (bot._barrels) and on which street
  // (bot._barrelStreet), both reset at handStart by the server. This adds NO
  // extra rng draw on paths that didn't barrel before (the barrel rng() is
  // pulled only inside the barrel guard, which is a brand-new branch).
  const street = (L.street || ctx.gameState);
  const iFiredPrev = (ctx.aggressorId != null && ctx.playerId != null && ctx.aggressorId === ctx.playerId);
  // A barrel only makes sense on turn/river as the previous-street aggressor,
  // facing a checked-to spot (canCheck), and not on the flop (that's the c-bet
  // branch below, already handled by isAggr).
  const canBarrel = (bot._barrelOn === true) && (street === 'turn' || street === 'river')
                    && iFiredPrev && L.canCheck && L.canRaise;

  // Post-flop: continuation-bet as the pre-flop aggressor, value-bet made hands,
  // and semi-bluff strong draws; raise frequency scales with aggr.
  if (L.canCheck){
    // ── Barrel: keep telling the story on later streets ──────────────────
    // Frequency decays per street and per barrel already fired, and scales
    // with skill (a 'hard' bot barrels more credibly) and archetype aggression
    // (aggr + bluffMul). Made hands barrel for VALUE regardless of frequency;
    // air barrels as a skill-gated bluff; weak-no-draw hands GIVE UP (check),
    // and the give-up is stronger for skilled bots (they don't spew).
    if (canBarrel){
      const already   = bot._barrels || 0;
      const isRiver    = (street === 'river');
      const streetFade = isRiver ? 0.55 : 0.75;                     // river barrels rarer than turn
      const fireFade   = Math.pow(0.7, already);                    // each extra barrel less likely
      const barrelP    = Math.min(0.9, (0.35 + a*0.4) * bm * sk.bluffMul) * streetFade * fireFade;
      const giveUpStr  = 0.30 + (1 - a)*0.10 - (sk.pushfold ? 0 : 0.08); // skilled/tight give up wider

      // Strong made hand → value barrel (bigger sizing on the river).
      if (str > 0.62){
        bot._barrels = already + 1;
        return { action:ACT.RAISE, amountTo: isRiver ? raiseRiver() : raiseTo() };
      }

      if (!isRiver){
        // ── TURN ── still a card to come : semi-bluff draws, then air bluffs.
        if (draw){                                                  // draw → semi-bluff barrel
          bot._hadDraw = true;                                      // remember for a river bluff if it busts
          if (rng() < semiBluffP){ bot._barrels = already + 1; return { action:ACT.RAISE, amountTo:raiseTo() }; }
        }
        if (str > giveUpStr && rng() < barrelP){                    // marginal air → skill-gated bluff barrel
          bot._barrels = already + 1;
          return { action:ACT.RAISE, amountTo:raiseTo() };
        }
        return { action:ACT.CHECK };                                // give up : pot control, no spew
      }

      // ── RIVER ── no more cards : polarise into value / give-up / bluff.
      // A hand that was a draw on the turn and BUSTED (weak now, no showdown
      // value) is the prime bluff candidate — only aggression can win the pot,
      // so bluff it more often than random air. A medium hand with some
      // showdown value gives up (checks to see the showdown for free) rather
      // than turning itself into a bluff. Pure air bluffs at the skill-gated
      // base rate. All frequencies remain doped by skill + archetype.
      const bustedDraw = (bot._hadDraw === true) && str < 0.40;     // had a draw, missed
      if (bustedDraw){
        const bluffP = Math.min(0.92, barrelP * 1.8);              // busted draws bluff far more
        if (rng() < bluffP){ bot._barrels = already + 1; return { action:ACT.RAISE, amountTo:raiseRiver() }; }
        return { action:ACT.CHECK };
      }
      if (str >= 0.40 && str <= 0.62){                              // medium showdown value → check it down
        return { action:ACT.CHECK };
      }
      if (str > giveUpStr && rng() < barrelP){                      // residual air → occasional bluff
        bot._barrels = already + 1;
        return { action:ACT.RAISE, amountTo:raiseRiver() };
      }
      return { action:ACT.CHECK };                                  // give up
    }
    if (isAggr && L.canRaise && (opp === 1 || str > 0.32 || draw) && rng() < cbetP){ bot._barrels = (bot._barrels||0) + 1; return { action:ACT.RAISE, amountTo:raiseTo() }; }   // c-bet
    if (str>0.85 && L.canRaise) return { action:ACT.RAISE, amountTo:raiseTo() };
    if (str>0.58 && L.canRaise && rng() < pPost) return { action:ACT.RAISE, amountTo:raiseTo() };
    if (draw && L.canRaise && rng() < semiBluffP){ bot._hadDraw = true; return { action:ACT.RAISE, amountTo:raiseTo() }; } // semi-bluff
    return { action:ACT.CHECK };
  }
  // facing a bet — raise big hands, call when equity beats the price, else semi-bluff/bluff/fold
  if (str>0.82 && L.canRaise) return rng()<0.75 ? { action:ACT.RAISE, amountTo:raiseTo() } : { action:ACT.CALL };
  if (str > potOdds + cm){
    if (str>0.6 && L.canRaise && rng() < pPost*0.7) return { action:ACT.RAISE, amountTo:raiseTo() };
    return { action:ACT.CALL };
  }
  if (draw && L.canRaise && toCall <= pot*0.6 && committed === 0 && rng() < semiBluffP*0.7) return { action:ACT.RAISE, amountTo:raiseTo() }; // semi-bluff raise
  if (bluff()) return { action:ACT.RAISE, amountTo:raiseTo() };
  return { action:ACT.FOLD };
}
