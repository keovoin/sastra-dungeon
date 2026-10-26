// @ts-nocheck — 1:1 port of the prototype music engine script (JS semantics kept).
/* Sastra Dungeon — music engine (ported from prototype lines 5548-5611). */
import { G, cutscene, getBiomeForWave } from './game';

(function(){
const btn=document.getElementById('bgmBtn'),intro=document.getElementById('storyIntro');
let AC=null,master=null,nbuf=null,an=null,anBuf=null,pw={},timer=0,stopT=0,nextT=0,step=0,off=false,tr=null,hot=false;
try{off=localStorage.getItem('sd_music_off')==='1'}catch(e){}
const BASE=.34;                       // overall loudness: kept low so it sits under the game sounds
const mtof=m=>440*Math.pow(2,(m-69)/12);
const ch=(r,q)=>q==='m'?[r,r+3,r+7]:[r,r+4,r+7];
const mel=a=>{const m=[];let s=0;a.forEach(n=>{m[s]=n;s+=n[1]});return m};
/* one 4-bar loop per realm: bpm, chord progression [root,quality], lead melody [midi,16th-steps] (0 = rest) */
const TR={
 crypt:{bpm:96,prog:[[57,'m'],[53,'M'],[55,'M'],[52,'m']],
  lead:mel([[69,4],[72,2],[71,2],[69,4],[0,4],[65,4],[69,2],[67,2],[65,4],[0,4],[67,4],[71,2],[69,2],[67,4],[62,4],[64,4],[67,2],[66,2],[64,8]])},
 caverns:{bpm:80,prog:[[50,'m'],[46,'M'],[48,'M'],[45,'m']],
  lead:mel([[62,6],[65,2],[64,4],[62,4],[62,4],[65,4],[70,4],[69,4],[67,4],[64,4],[60,4],[64,4],[69,6],[67,2],[64,4],[0,4]])},
 frost:{bpm:100,prog:[[52,'m'],[48,'M'],[55,'M'],[50,'M']],
  lead:mel([[76,2],[79,2],[83,4],[79,4],[76,4],[72,2],[76,2],[79,4],[76,4],[72,4],[74,2],[79,2],[83,4],[86,4],[83,4],[78,2],[81,2],[86,4],[81,4],[78,4]])},
 volcano:{bpm:118,prog:[[45,'m'],[45,'m'],[53,'M'],[52,'M']],
  lead:mel([[69,2],[0,2],[69,2],[72,2],[76,4],[72,4],[69,2],[0,2],[69,2],[72,2],[76,4],[81,4],[77,4],[76,4],[72,4],[69,4],[68,4],[71,4],[76,8]])},
 shadow:{bpm:88,prog:[[48,'m'],[44,'M'],[46,'M'],[43,'M']],
  lead:mel([[72,6],[75,2],[74,4],[72,4],[68,6],[72,2],[71,4],[68,4],[70,6],[74,2],[73,4],[70,4],[67,4],[71,4],[74,4],[71,4]])}
};
function pulse(d){const n=32,re=new Float32Array(n),im=new Float32Array(n);for(let k=1;k<n;k++){const A=2/(k*Math.PI)*Math.sin(k*Math.PI*d);re[k]=A*Math.cos(k*Math.PI*d);im[k]=A*Math.sin(k*Math.PI*d)}return AC.createPeriodicWave(re,im)}
function init(){try{AC=new(window.AudioContext||(window as any).webkitAudioContext)();master=AC.createGain();master.gain.value=0;master.connect(AC.destination);
  an=AC.createAnalyser();an.fftSize=1024;anBuf=new Float32Array(an.fftSize);master.connect(an);
  nbuf=AC.createBuffer(1,AC.sampleRate,AC.sampleRate);const d=nbuf.getChannelData(0);for(let i=0;i<d.length;i++)d[i]=Math.random()*2-1;
  pw[.25]=pulse(.25);pw[.125]=pulse(.125)}catch(e){AC=null}}
function note(f,at,dur,vol,wave,type){try{const o=AC.createOscillator(),g=AC.createGain();if(wave)o.setPeriodicWave(wave);else o.type=type||'triangle';o.frequency.setValueAtTime(f,at);
  g.gain.setValueAtTime(0,at);g.gain.linearRampToValueAtTime(vol,at+.005);g.gain.setValueAtTime(vol,at+Math.max(.006,dur*.55));g.gain.exponentialRampToValueAtTime(.0001,at+dur);
  o.connect(g);g.connect(master);o.start(at);o.stop(at+dur+.03)}catch(e){}}
function noise(at,dur,vol,type,f){try{const s=AC.createBufferSource();s.buffer=nbuf;s.loop=true;const fl=AC.createBiquadFilter();fl.type=type;fl.frequency.value=f;const g=AC.createGain();
  g.gain.setValueAtTime(vol,at);g.gain.exponentialRampToValueAtTime(.0001,at+dur);s.connect(fl);fl.connect(g);g.connect(master);s.start(at);s.stop(at+dur+.03)}catch(e){}}
function kick(at,v){try{const o=AC.createOscillator(),g=AC.createGain();o.type='sine';o.frequency.setValueAtTime(150,at);o.frequency.exponentialRampToValueAtTime(40,at+.12);
  g.gain.setValueAtTime(v,at);g.gain.exponentialRampToValueAtTime(.0001,at+.16);o.connect(g);g.connect(master);o.start(at);o.stop(at+.2)}catch(e){}}
function playStep(T,i,at,sd){
  const bar=Math.floor(i/16)%4,s=i%16,root=T.prog[bar][0],c=ch(root,T.prog[bar][1]);
  const L=T.lead[i%64];if(L&&L[0])note(mtof(L[0]),at,L[1]*sd*.92,hot?.052:.045,pw[.25]);
  if(hot||s%2===0)note(mtof(c[hot?[0,1,2,1][s%4]:[0,1,2,1][(s/2)%4]]+12),at,sd*(hot?1.2:1.7),hot?.018:.022,pw[.125]);
  if(hot||s%2===0)note(mtof(root-12+(s%8===6?12:0)),at,sd*1.8,.12,null,'triangle');
  if(hot){if(s%8===0)kick(at,.16);if(s===4||s===12){noise(at,.1,.05,'bandpass',1800);note(190,at,.05,.03,null,'square')}if(s%2===0)noise(at,.025,.02,'highpass',7000)}
  else{if(s===0)kick(at,.11);if(s===4||s===12)noise(at,.025,.012,'highpass',7000)}}
const inGame=()=>typeof G!=='undefined'&&G&&G.running&&G.player&&intro.classList.contains('hidden');
function want(){const k=getBiomeForWave(Math.max(1,G.wave)).key;return TR[k]?k:'crypt'}
function tick(){if(!AC||!inGame())return;
  while(nextT<AC.currentTime+.4){
    if(step%16===0){const k=want(),h=G.enemies.some(e=>e.boss&&e.hp>0);hot=h;
      if(!tr||tr.key!==k){tr=Object.assign({key:k},TR[k]);step=0}}
    playStep(tr,step,nextT,60/(tr.bpm*(hot?1.18:1))/4);step++;nextT+=60/(tr.bpm*(hot?1.18:1))/4}}
function paint(){btn.textContent=off?'♪ MUSIC OFF [M]':'♪ MUSIC ON [M]';btn.classList.toggle('off',off)}
function toggle(){off=!off;try{localStorage.setItem('sd_music_off',off?'1':'0')}catch(e){}paint();watch()}
function watch(){
  const ig=inGame();btn.style.display=ig?'block':'none';
  if(ig&&!off){
    if(!AC)init();if(!AC)return;if(AC.state==='suspended')AC.resume();
    if(stopT){clearTimeout(stopT);stopT=0}
    if(!timer){nextT=AC.currentTime+.1;step=0;tr=null;timer=setInterval(tick,50)}
    const v=(G.paused||G.pauseMenu)?BASE*.3:cutscene.active?BASE*.55:BASE;
    master.gain.setTargetAtTime(v,AC.currentTime,.25)}
  else if(timer&&!stopT){master.gain.setTargetAtTime(0,AC.currentTime,.2);stopT=setTimeout(()=>{clearInterval(timer);timer=0;stopT=0},900)}}
btn.addEventListener('click',toggle);
addEventListener('keydown',e=>{if(e.key&&e.key.toLowerCase()==='m'&&!e.repeat&&inGame()&&intro.classList.contains('hidden'))toggle()});
['pointerdown','keydown'].forEach(ev=>addEventListener(ev,()=>{if(AC&&AC.state==='suspended'&&inGame()&&!off)AC.resume()},true));
paint();setInterval(watch,250);
window.__bgm={info:()=>({ac:AC&&AC.state,run:!!timer,track:tr&&tr.key,hot,off}),level:()=>{if(!an)return 0;an.getFloatTimeDomainData(anBuf);let s=0;for(const v of anBuf)s+=v*v;return Math.sqrt(s/anBuf.length)}};
})();
