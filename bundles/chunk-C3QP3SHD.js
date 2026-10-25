import{d as y}from"./chunk-YMPHKW4R.js";var u=52,M=["high","pair","two","trips","straight","flush","full","quads","sf","royal"],O=[1,2,3,4,5,6,8,12,20,50],T=["h10n","h9n","h8n","h7n","h6n","h5n","h4n","h3n","h2n","h1n"],d=t=>t%13+2,x=t=>Math.floor(t/13),k=t=>t.slice().sort((e,a)=>d(a)-d(e));function E(t){let e={};for(let a of t){let n=d(a);e[n]==null&&(e[n]=a)}e[14]!=null&&(e[1]=e[14]);for(let a=14;a>=5;a--){let n=!0;for(let r=0;r<5;r++)if(e[a-r]==null){n=!1;break}if(n)return[0,1,2,3,4].map(r=>e[a-r])}return null}function w(t){let e=[[],[],[],[]],a={};for(let o of t)e[x(o)].push(o),(a[d(o)]=a[d(o)]||[]).push(o);let n=(o,p)=>k(t.filter(S=>o.indexOf(S)<0)).slice(0,p),r=o=>o.map(d),c=o=>d(o[0])===14&&d(o[1])===5?5:d(o[0]),m=null;for(let o of e)if(o.length>=5){let p=E(o);p&&(!m||c(p)>c(m))&&(m=p)}if(m)return[c(m)===14?9:8,m,[c(m)]];let i=Object.keys(a).map(o=>a[o]).sort((o,p)=>p.length-o.length||d(p[0])-d(o[0])),l=i[0],g=i[1];if(l.length>=4){let o=l.slice(0,4),p=o.concat(n(o,1));return[7,p,r(p)]}if(l.length===3&&g&&g.length>=2){let o=l.concat(g.slice(0,2));return[6,o,r(o)]}let f=null;for(let o of e)if(o.length>=5){let p=k(o).slice(0,5);(!f||$(r(p),r(f))>0)&&(f=p)}if(f)return[5,f,r(f)];let h=E(t);if(h)return[4,h,[c(h)]];if(l.length===3){let o=l.concat(n(l,2));return[3,o,r(o)]}if(l.length===2&&g&&g.length===2){let o=l.concat(g),p=o.concat(n(o,1));return[2,p,r(p)]}if(l.length===2){let o=l.concat(n(l,3));return[1,o,r(o)]}let b=k(t).slice(0,5);return[0,b,r(b)]}function $(t,e){for(let a=0;a<Math.max(t.length,e.length);a++){let n=(t[a]||0)-(e[a]||0);if(n)return n}return 0}function K(t,e){return!e||t[0]>e[0]||t[0]===e[0]&&$(t[2],e[2])>0}function A(t){let e=(t||[]).filter(n=>Number.isInteger(n)&&n>=0&&n<52);if(!e.length)return{cat:-1,best:[],tb:[],nameKey:""};let a=w(e);return{cat:a[0],best:a[1],tb:a[2],nameKey:T[a[0]]}}function B(t,e){return t.cat!==e.cat?t.cat-e.cat:$(t.tb,e.tb)}function H(t){let e=(t||[]).filter(m=>Number.isInteger(m)&&m>=0&&m<=52);if(!e.length)return{cat:-1,id:"none",mult:1,best:[],nameKey:""};let a=e.filter(m=>m!==52),n=e.length-a.length,r=a.length?w(a):null;if(n){let m=[];for(let l=0;l<52;l++)a.indexOf(l)<0&&m.push(l);let i=(l,g)=>{if(!g){let f=w(l);if(K(f,r)){let h=l.slice(a.length);f[1]=f[1].map(b=>h.indexOf(b)>=0?52:b),r=f}return}for(let f of m)l.indexOf(f)<0&&i(l.concat([f]),g-1)};i(a.slice(),Math.min(n,2))}let c=r[0];return{cat:c,id:M[c],mult:O[c],best:r[1],nameKey:T[c]}}var s="pth-game-ace",v=["\u2666","\u2665","\u2660","\u2663"],L=["2","3","4","5","6","7","8","9","10","J","Q","K","A"],W=[["#b3261e","#f5f0e3"],["#1f4e9e","#f5f0e3"],["#1e7a46","#f5f0e3"],["#1b1b1b","#d8b25a"]],C=`
#${s}{position:absolute;inset:0;pointer-events:none;overflow:hidden}
#${s} .ar-box{position:absolute;left:0;top:0;width:168px;height:228px;transform-origin:84px 212px;will-change:transform}
#${s} svg>ellipse[cy="180"]{display:none}
#${s} .run .mc-lean{transform:rotate(7deg)}
#${s} .run .mc-legL{animation:arLeg .3s ease-in-out infinite alternate}
#${s} .run .mc-legR{animation:arLeg .3s ease-in-out infinite alternate-reverse}
#${s} .run .mc-armL{animation:arArm .3s ease-in-out infinite alternate-reverse}
#${s} .run .mc-armR{animation:arArm .3s ease-in-out infinite alternate}
#${s} .run .mc-bob{animation:arBob .15s ease-in-out infinite alternate}
@keyframes arLeg{from{transform:rotate(26deg)}to{transform:rotate(-26deg)}}
@keyframes arArm{from{transform:rotate(30deg)}to{transform:rotate(-24deg)}}
@keyframes arBob{from{transform:translateY(0)}to{transform:translateY(-5px)}}
#${s} .air .mc-lean{transform:rotate(7deg)}
#${s} .air .mc-legL{transform:rotate(38deg)}#${s} .air .mc-legR{transform:rotate(-30deg)}
#${s} .air .mc-armL{transform:rotate(70deg)}#${s} .air .mc-armR{transform:rotate(-70deg)}
#${s} .duck .mc-squash{transform:scale(1.12,.55)}
#${s} .duck .mc-lean{transform:rotate(16deg)}
#${s} .idle .mc-breath{animation:arBreath 1.6s ease-in-out infinite alternate}
@keyframes arBreath{from{transform:scale(1,1)}to{transform:scale(1.02,.975)}}
#${s} .balance .mc-armL{transform:rotate(-62deg)}#${s} .balance .mc-armR{transform:rotate(62deg)}
#${s} .balance .mc-breath{animation:arBreath 1.1s ease-in-out infinite alternate}
#${s} .wave .mc-armR{animation:arWave .5s ease-in-out infinite alternate}
@keyframes arWave{from{transform:rotate(-120deg)}to{transform:rotate(-150deg)}}
#${s} .ko .mc-lean{transform:rotate(-78deg) translateX(-30px);transition:transform .35s cubic-bezier(.3,1.6,.5,1)}
#${s} .ko .mc-armL{transform:rotate(90deg)}#${s} .ko .mc-armR{transform:rotate(-100deg)}
#${s} .mc-m-jump .mc-f-es,#${s} .mc-m-jump .mc-f-mo,
#${s} .mc-m-yay .mc-f-eo,#${s} .mc-m-yay .mc-f-mo,
#${s} .mc-m-ko .mc-f-ed,#${s} .mc-m-ko .mc-f-mo{opacity:1}
#${s} .ar-king{filter:drop-shadow(0 0 6px rgba(245,197,24,.85))}
#${s} .ar-king.ar-ending{animation:arEnd .2s steps(2,start) infinite}
@keyframes arEnd{50%{filter:none}}
#pth-game .ar-lab{font:600 10px/1 'Inter',system-ui,sans-serif;letter-spacing:.12em;text-transform:uppercase;color:#9bb0a3;margin-bottom:4px}
#pth-game .ar-num{font:700 clamp(15px,2.4vw,20px)/1 'Inconsolata',monospace;font-variant-numeric:tabular-nums;color:#f5f0e3;text-shadow:0 1px 2px rgba(0,0,0,.6)}
#pth-game .ar-stats{display:flex;gap:16px}
#pth-game .ar-hand{display:flex;flex-direction:column;align-items:flex-end;gap:5px}
#pth-game .ar-slots{display:flex;gap:4px}
#pth-game .ar-slots .pk{margin:0;flex:none}
#pth-game .ar-slot{width:32px;height:46px;border-radius:4px;border:1px dashed rgba(216,178,90,.35);box-sizing:border-box}
#pth-game .pk.ar-joker{background:#f5f0e3;display:flex;align-items:center;justify-content:center;font-size:22px;line-height:1}
#pth-game .pk.sm.ar-joker{font-size:18px}
#pth-game .ar-name{font:600 12px/1 'Inter',system-ui,sans-serif;color:#d8b25a;text-shadow:0 1px 2px rgba(0,0,0,.6)}
#pth-game .ar-name b{font-family:'Inconsolata',monospace;font-size:14px;margin-left:4px}
#pth-game .ar-show{display:flex;gap:6px;justify-content:center;min-height:84px}
#pth-game .ar-show .pk{margin:0;flex:none}
#pth-game .ar-final{font:700 clamp(14px,2.2vw,17px)/1.3 'Inconsolata',monospace;font-variant-numeric:tabular-nums;color:#f5f0e3}
#pth-game .ar-final em{font-style:normal;color:#d8b25a}
/* Choice tiles (arcade menu, game modes) */
#pth-game .gm-tiles{display:flex;gap:12px;justify-content:center;width:min(640px,100%);pointer-events:auto}
#pth-game .gm-tile{appearance:none;border:0;cursor:pointer;flex:1 1 0;min-width:0;max-width:190px;padding:14px 10px 12px;border-radius:12px;
  background:rgba(19,30,25,.92);box-shadow:inset 0 0 0 1px rgba(216,178,90,.3);color:#f5f0e3;display:flex;flex-direction:column;align-items:center;gap:6px;
  font:600 14px/1.2 'Inter',system-ui,sans-serif;transition:transform .12s,box-shadow .12s}
#pth-game .gm-tile i{font-style:normal;font-size:32px;line-height:1}
#pth-game .gm-tile b{font:700 16px/1.15 'Cinzel',Georgia,serif;letter-spacing:.02em}
#pth-game .gm-tile small{font:500 11px 'Inconsolata',monospace;color:#9bb0a3;min-height:1.2em}
#pth-game .gm-tile.on{box-shadow:inset 0 0 0 2px #d8b25a,0 0 18px rgba(216,178,90,.25);transform:translateY(-2px)}
#pth-game .gm-tile:focus-visible{outline:2px solid #f5f0e3;outline-offset:2px}
#pth-game.pg-light .gm-tile{background:rgba(255,252,246,.96);color:#1d222b;box-shadow:inset 0 0 0 1px rgba(140,105,20,.35)}
#pth-game.pg-light .gm-tile small{color:#5a6470}
#pth-game.pg-light .gm-tile.on{box-shadow:inset 0 0 0 2px #a07a12,0 0 14px rgba(160,122,18,.25)}
@media (max-width:520px){#pth-game .gm-tile{padding:10px 8px;gap:4px}#pth-game .gm-tile i{font-size:24px}#pth-game .gm-tile b{font-size:14px}}
@media (max-width:520px){#pth-game .ar-slot{width:22px;height:32px}#pth-game .ar-slots .pk.sm{width:22px;height:32px;font-size:10px}
  #pth-game .ar-show{min-height:58px;gap:4px}#pth-game .ar-show .pk.lg{width:40px;height:58px;font-size:15px}
  #pth-game .pg-panel>div{gap:4px}#pth-game .pg-panel h2{font-size:20px}#pth-game .ar-stats{gap:10px}}
`,G=t=>t===52?"\u{1F0CF}":L[t%13]+v[x(t)],I=t=>t!==52&&x(t)<2,P=t=>{try{return t.toLocaleString(document.documentElement.lang||void 0)}catch{return String(t)}};function j(t){if(t===52)return"";try{let e=typeof window.cardToHtml=="function"?window.cardToHtml(t,!1):"",a=/--cf:url\(([^)]*)\)/.exec(e);return a&&a[1]?a[1].replace(/^["']|["']$/g,""):""}catch{return""}}function U(){try{let t=getComputedStyle(document.documentElement).getPropertyValue("--card-back")||"",e=/url\((['"]?)(.*?)\1\)/.exec(t);return e?e[2]:""}catch{return""}}function Y(t,e){if(t===52)return'<div class="pk '+e+' ar-joker">\u{1F0CF}</div>';try{if(typeof window.cardToHtml=="function")return window.cardToHtml(t,e==="sm",!1,e==="sm"?"":" "+e)}catch{}return'<div class="pk '+e+(I(t)?" red":"")+'"><span class="c-rank">'+L[t%13]+'</span><span class="c-suit">'+v[x(t)]+"</span></div>"}function q(){let t=[];for(let e=0;e<52;e++)t.push(e);for(let e=t.length-1;e>0;e--){let a=Math.floor(Math.random()*(e+1)),n=t[e];t[e]=t[a],t[a]=n}return t.splice(t.length-6-Math.floor(Math.random()*30),0,52),t}function D(){let t={};return function(a){if(!a)return null;if(!t[a]){let r=new Image;r.decoding="async",r.src=a,t[a]=r}let n=t[a];return n.complete&&n.naturalWidth?n:null}}function F(t,e,a,n,r){R(t,-n/2,-r/2,n,r,Math.max(2,n*.1));let c=a===52?null:e(j(a));if(c){t.save(),t.clip(),t.drawImage(c,-n/2,-r/2,n,r),t.restore(),R(t,-n/2,-r/2,n,r,Math.max(2,n*.1)),t.strokeStyle="rgba(0,0,0,.5)",t.lineWidth=1,t.stroke();return}if(t.fillStyle="#f5f0e3",t.fill(),t.strokeStyle="rgba(0,0,0,.5)",t.lineWidth=1,t.stroke(),t.textAlign="center",t.textBaseline="middle",a===52){t.font=Math.round(r*.55)+"px system-ui, sans-serif",t.fillText("\u{1F0CF}",0,1);return}t.fillStyle=I(a)?"#c62828":"#141414",t.font="700 "+Math.round(r*.3)+"px Inconsolata, monospace",t.fillText(L[a%13],-n*.18,-r*.26),t.font=Math.round(r*.44)+"px Georgia, serif",t.fillText(v[x(a)],n*.04,r*.14)}function _(t){return t?{light:!0,gold:"#8a6510",text:"#2b3138",red:"#c62828",band:"rgba(255,250,240,.9)",bandText:"#1d222b",bandGold:"#8a6510",bandLine:"rgba(140,105,20,.6)",skyTop:"#f7f0e3",skyBot:"#e6d9c1",rim:"#8a6a4a",farFelt:"#3f8f63",shade:"#4b5a54",lamp:"200,150,60",glow:"200,150,60"}:{light:!1,gold:"#d8b25a",text:"#f5f0e3",red:"#ff8a80",band:"rgba(11,18,16,.72)",bandText:"#f5f0e3",bandGold:"#d8b25a",bandLine:"rgba(216,178,90,.6)",skyTop:"#0a100e",skyBot:"#16251e",rim:"#2a1a10",farFelt:"#123d28",shade:"#20302a",lamp:"216,178,90",glow:"216,178,90"}}function R(t,e,a,n,r,c){t.beginPath(),t.moveTo(e+c,a),t.arcTo(e+n,a,e+n,a+r,c),t.arcTo(e+n,a+r,e,a+r,c),t.arcTo(e,a+r,e,a,c),t.arcTo(e,a,e+n,a,c),t.closePath()}function Q(t){if(!document.getElementById(s+"-css")){let i=document.createElement("style");i.id=s+"-css",i.textContent=y(s).css+C,document.head.appendChild(i)}let e=document.createElement("div");e.id=s,e.innerHTML='<div class="ar-box"><div class="mc-pos mc-m-smile mc-hat-none mc-tool-none idle">'+y(s).html+"</div></div>",t.appendChild(e);let a=e.firstElementChild,n=a.firstElementChild,r="idle",c="mc-m-smile",m=!1;return{pose(i){i!==r&&(n.classList.remove(r),n.classList.add(i),r=i)},mood(i){i!==c&&(n.classList.remove(c),n.classList.add(i),c=i)},king(i,l){i!==m&&(n.classList.toggle("mc-hat-none",!i),n.classList.toggle("mc-hat-crown",i),n.classList.toggle("mc-tool-none",!i),n.classList.toggle("mc-tool-scepter",i),n.classList.toggle("ar-king",i),m=i),n.classList.toggle("ar-ending",!!(i&&l))},place(i,l,g,f,h){a.style.transform="translate("+(i*f-84)+"px,"+(l*f-212)+"px) scale("+g*f+")"+(h?" rotate("+h+"deg)":"")},show(i){e.style.display=i?"":"none"},fade(i){a.style.opacity=i>=1?"":String(i)},remove(){e.remove()}}}export{u as a,T as b,d as c,x as d,A as e,B as f,H as g,v as h,L as i,W as j,G as k,I as l,P as m,j as n,U as o,Y as p,q,D as r,F as s,_ as t,R as u,Q as v};
