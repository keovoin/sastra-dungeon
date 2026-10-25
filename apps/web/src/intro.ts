// @ts-nocheck — 1:1 port of the prototype intro-cinematic script (JS semantics kept).
/* Sastra Dungeon — story-intro cinematic (ported from prototype lines 5161-5537). */
import { CLASSES, TAU } from './game';

(function(){
const W=320,H=180,GY=122;
const cv=document.getElementById('siCanvas'),ctx=cv.getContext('2d');cv.width=W;cv.height=H;
const R=(x,y,w,h,c)=>{ctx.fillStyle=c;ctx.fillRect(Math.round(x),Math.round(y),Math.round(w)||1,Math.round(h)||1)};
const cl=(v,a=0,b=1)=>Math.max(a,Math.min(b,v)),lp=(a,b,t)=>a+(b-a)*t,ez=t=>t*t*(3-2*t);
const rng=s=>()=>(s=(s*16807)%2147483647)/2147483647,rn=rng(7);
const hex=c=>{const n=parseInt(c.slice(1),16);return[n>>16,n>>8&255,n&255]};
const mix=(a,b,t)=>{const A=hex(a),B=hex(b);return'#'+A.map((v,i)=>('0'+Math.round(lp(v,B[i],t)).toString(16)).slice(-2)).join('')};
const disc=(cx,cy,r,c)=>{for(let y=-r;y<=r;y++){const w=Math.floor(Math.sqrt(r*r-y*y));R(cx-w,cy+y,w*2+1,1,c)}};
const tri=(cx,y,w,h,c)=>{for(let i=0;i<h;i++){const ww=Math.round(w*(i+1)/h);R(cx-ww/2,y+i,ww,1,c)}};
const spike=(x0,y0,dx,dy,len,w,c,cu)=>{for(let i=0;i<len;i++){const ww=Math.max(1,Math.round(w*(1-i/len)));R(x0+dx*i+cu*i*i-ww/2,y0+dy*i,ww,2,c)}};

/* sky (dithered bands) */
const skyC=document.createElement('canvas');skyC.width=W;skyC.height=GY;
const skx=skyC.getContext('2d'),img=skx.createImageData(W,GY),sd=img.data;
const DUSK=['#0d0a24','#1a1040','#2c1a5a','#4a2670','#74347c','#a8467c','#d8685c','#f09a5a'];
const DOOM=['#12040c','#2a0612','#4a0a18','#6e1220','#962028','#c23a2c','#e8603a','#ff9a4a'];
const BAY=[0,8,2,10,12,4,14,6,3,11,1,9,15,7,13,5];
function drawSky(d,fl){drawPal(DUSK.map((c,i)=>mix(c,DOOM[i],d)),fl)}
function drawPal(pl,fl){
  const pal=pl.map(hex);
  for(let y=0;y<GY;y++){const f=y/(GY-1)*7,i=Math.min(6,f|0),fr=f-i;
    for(let x=0;x<W;x++){const th=(BAY[(y&3)*4+(x&3)]+.5)/16,c=pal[fr>th?i+1:i],o=(y*W+x)*4;
      sd[o]=Math.min(255,c[0]+fl*120);sd[o+1]=Math.min(255,c[1]+fl*110);sd[o+2]=Math.min(255,c[2]+fl*150);sd[o+3]=255}}
  skx.putImageData(img,0,0);ctx.drawImage(skyC,0,0);
}
const stars=Array.from({length:80},()=>({x:rn()*W|0,y:rn()*70|0,p:rn()*6}));
const BT=[5.0,7.6,12.7,16.5],flash=t=>Math.max(0,...BT.map(b=>t>=b?Math.exp(-(t-b)*7):0));
function bolts(t){BT.forEach((b,i)=>{if(t<b||t-b>.35)return;const r=rng(i+11);let x=40+i*65,y=0;while(y<GY-24){R(x-1,y,4,4,'rgba(200,180,255,.35)');R(x,y,2,4,'#ffffff');y+=4;x+=(r()-.5)*9}})}

/* terrain */
function ridge(off,amp,base,seed,c1,c2){for(let x=0;x<W;x++){const X=x+off,y=Math.round(base-(Math.sin(X*.021+seed)*amp+Math.sin(X*.047+seed*2)*amp*.5+Math.sin(X*.11+seed*3)*amp*.18));R(x,y,1,GY-y+1,c2);R(x,y,1,2,c1)}}
function rift(t){const L=ez(cl((t-4)/4));if(L<=0)return;const r=rng(5);let x=212,y=12;const pts=[];
  for(let i=0;i<46*L;i++){pts.push([x,y]);y+=1.6;x+=(r()-.5)*5;x=lp(x,212,.12)}
  pts.forEach(([x,y],i)=>{const w=2+Math.sin(i/46*Math.PI)*4*L;R(x-w-3,y,w*2+6,2,'rgba(150,60,255,.18)');R(x-w,y,w*2,2,'#6a2cc0');R(x-w/2,y,w,2,'#f0d0ff')})}

/* the Lord */
function lord(t,cam,rise,eyes,roar,d){
  if(rise<=0)return;const u=1,x=212-cam*.06,by=GY+10+(1-rise)*110;
  ctx.save();ctx.beginPath();ctx.rect(0,0,W,GY);ctx.clip();
  const hy=by-86*u,rim=mix('#4a2e80','#ff6a3a',d);
  for(let i=5;i>0;i--)disc(x,hy+8,(14+i*11)*u,`rgba(255,40,70,${(.025+roar*.03)*eyes})`);
  for(let y=-64;y<=0;y++){const k=(y+64)/64,hw=Math.round(13+k*k*20+k*14),yy=by+y,a=Math.max(2,hw*.35|0);
    R(x-hw,yy,hw*2,2,'#0e0818');R(x-hw,yy,a,2,'#241648');R(x-hw+a,yy,Math.max(2,hw*.3|0),2,'#171028');
    R(x-hw,yy,2,2,rim);R(x+hw-2,yy,2,2,rim)}
  for(const s of[-1,1]){for(let j=0;j<3;j++)spike(x+s*(18+j*4),by-62+j*3,s*1.1,-.9-j*.15,10-j*2,4,'#1a1030',0);R(x+s*14-2,by-64,4,3,rim)}
  disc(x,hy,12,'#0a0612');R(x-12,hy-4,2,10,rim);
  for(const s of[-1,1]){spike(x+s*8,hy-8,s*.6,-1.1,22,5,'#c9b890',s*.018);spike(x+s*9,hy-8,s*.6,-1.1,20,2,'#8a7a5a',s*.018)}
  const fk=((t*9|0)%7===0)?.5:1,ec=roar>.2?'#ffd0a0':'#ff3030';
  for(const s of[-1,1]){disc(x+s*5,hy+1,6,`rgba(255,50,50,${.22*eyes})`);R(x+s*5-2,hy,4,2,eyes*fk>.3?ec:'#0a0612')}
  if(roar>.05){R(x-5,hy+6,10,2+roar*5,'#ff4a2a');R(x-3,hy+7,6,roar*3,'#300808')}
  const pu=.6+.4*Math.sin(t*4);disc(x,by-40,5,`rgba(190,90,255,${.3*pu})`);R(x-1,by-45,2,10,'#d8a0ff');R(x-4,by-41,8,2,'#d8a0ff');R(x-1,by-41,2,2,'#fff');
  ctx.restore();
}

/* village */
const houses=[];for(let x=-20;x<900;){const w=22+rn()*18|0,h=18+rn()*14|0;houses.push({x,w,h,roof:8+rn()*7|0,lit:rn()>.25,chim:rn()>.5,fire:14+rn()*6});x+=w+4+rn()*22|0}
function village(t,cam,d){
  const body=mix('#1a1030','#2a0c18',d),bodyD=mix('#0f0919','#1a060f',d),roofC=mix('#0a0612','#1a0610',d),rimC=mix('#3a2468','#a8442c',d);
  houses.forEach((h,i)=>{const sx=Math.round(h.x-cam*.55);if(sx>W+4||sx+h.w<-6)return;
    const top=GY-h.h,burn=t>h.fire,fire=ez(cl((t-h.fire)/1.2));
    R(sx,top,h.w,h.h,body);R(sx+h.w-4,top,4,h.h,bodyD);R(sx,top,1,h.h,rimC);tri(sx+h.w/2,top-h.roof,h.w+6,h.roof,roofC);
    if(h.chim){R(sx+h.w*.7,top-h.roof+2,4,8,bodyD);if(!burn)for(let k=0;k<3;k++){const p=(t*.3+k/3+i*.13)%1;R(sx+h.w*.7+Math.sin(p*5)*3,top-h.roof-p*18,2+p*3,2+p*3,'rgba(130,120,150,'+.4*(1-p)+')')}}
    R(sx+h.w/2-2,GY-8,4,8,'#05030a');
    if(h.lit){const wc=burn?(((t*8+i)|0)%2?'#ff8a20':'#ffd060'):'#ffd060';R(sx+3,top+5,6,7,'rgba(255,200,90,.16)');R(sx+4,top+6,4,5,wc);R(sx+h.w-9,top+6,4,5,wc)}
    if(burn&&fire>0){disc(sx+h.w/2,top-6,h.w*.7|0,`rgba(255,120,30,${.1*fire})`);
      for(let k=0;k<h.w;k+=3){const fh=(3+Math.abs(Math.sin(t*9+k+i))*8)*fire|0;if(fh>0){R(sx+k,top-fh+2,2,fh,k%2?'#ff7a18':'#ffd060');R(sx+k,top+2-fh*.4,2,fh*.4,'#fff0a0')}}}
  });
}
const pines=Array.from({length:14},(_,i)=>({x:i*48+rn()*30,h:30+rn()*22|0}));
function drawPines(cam){pines.forEach(p=>{const cx=Math.round(p.x-cam*.85),w=14,h=p.h;if(cx<-30||cx>W+30)return;R(cx-1,GY-6,3,6,'#0b0714');
  tri(cx,GY-h,w,h*.4|0,'#0b0714');tri(cx,GY-h*.7|0,w*1.3|0,h*.4|0,'#0b0714');tri(cx,GY-h*.4|0,w*1.6|0,h*.45|0,'#0b0714')})}
function ground(d){R(0,GY,W,H-GY,mix('#150f26','#1a0a14',d));R(0,GY,W,3,mix('#2a1c44','#5a2020',d));
  for(let y=GY+6;y<H;y+=6)R(0,y,W,1,mix('#1d1436','#240c18',d));
  for(let y=GY;y<H;y++){const k=(y-GY)/(H-GY),cx=lp(250,110,k),hw=lp(8,60,k);R(cx-hw,y,hw*2,1,mix('#2a2040','#3a1a24',d))}
  R(0,GY-2,W,5,mix('rgba(200,140,120,.0)','rgba(255,120,60,.12)',0))}

/* hero (cape uses the chosen class colour) */
let HC={c:'#c0392b',d:'#7a1f18',l:'#e0573f',a:'#c8a040'},cls={name:'Hero'};
function hero(x,y,t,d){
  const C=HC.c,Cd=HC.d,Cl=HC.l;
  for(let i=0;i<22;i++){const cx=x-6-i,wave=Math.sin(t*5+i*.55)*1.6*(i/22+.3),top=y-19+i*.3,bot=y-7+i*.2+wave;R(cx,top+wave*.3,1,bot-top,i%5<3?C:Cd);if(i<18)R(cx,top+wave*.3,1,1,Cl)}
  R(x-6,y-19,12,16,C);R(x+3,y-19,3,16,Cd);R(x-6,y-19,2,16,Cl);
  R(x-5,y-3,4,3,'#2a1a14');R(x+1,y-3,4,3,'#2a1a14');R(x-4,y-8,3,5,'#3a3a5a');R(x+1,y-8,3,5,'#3a3a5a');
  R(x-7,y-21,14,3,'#9a9ab8');R(x-7,y-21,14,1,'#d8d8f0');
  R(x-3,y-28,6,7,'#8a8aa8');R(x-3,y-28,6,1,'#c0c0d8');R(x+2,y-28,1,7,'#5a5a78');
  const pl=Math.sin(t*6)*1.5;R(x-8,y-29+pl*.3,7,2,C);R(x-12,y-28+pl,4,2,Cd);
  if(d>.3)R(x+6,y-21,1,14,mix('#6a4a40','#ff9a4a',d));
  const r=ez(cl((t-18)/1.4)),hx=x+8,hy=y-17,tx=lp(x+10,x+9,r),ty=lp(y-4,y-40,r),L=18;
  R(x+5,y-19,3,6,'#9a9ab8');
  if(r>0){disc(Math.round(tx),Math.round(ty),8,`rgba(150,200,255,${.12*r})`);disc(Math.round(tx),Math.round(ty),4,`rgba(220,240,255,${.25*r})`)}
  for(let i=0;i<=L;i++)R(lp(hx,tx,i/L),lp(hy,ty,i/L),2,2,i<3?'#8a8aa8':'#dfe8ff');
  R(hx-2,hy-1,6,2,HC.a);
}

/* particles (deterministic, so scrubbing works) */
const AS=Array.from({length:70},()=>({x:rn()*340,y:rn()*160,sp:8+rn()*22,up:2+rn()*8,ph:rn()*6}));
function ash(t,d){const act=ez(cl((t-5)/4));AS.forEach((a,i)=>{if(i/70>act)return;
  const x=((a.x-t*a.sp)%340+340)%340-10,y=((a.y-t*a.up+Math.sin(t*1.5+a.ph)*5)%160+160)%160+10,hot=d>.5&&i%3===0;
  R(x,y,hot?2:1,hot?2:1,hot?'#ff9a4a':'rgba(210,190,230,.55)')})}
function burst(t){const a=t-13;if(a<0||a>3)return;for(let i=0;i<45;i++){const r=rng(i+3),ang=-Math.PI/2+(r()-.5)*2.2,sp=40+r()*70;
  R(212+Math.cos(ang)*sp*a*.6,GY-40+Math.sin(ang)*sp*a*.6+a*a*18,2,2,i%2?'#ffd060':'#ff5a30')}}
function grass(t){for(let x=0;x<W;x+=3){const h=5+(Math.sin(x*12.9)*43758.5%1+1)%1*9|0,s=Math.sin(t*2+x*.1)*1.5;R(x+s,H-h,1,h,'#0a0612');if(x%6===0)R(x+s,H-h,1,2,'#1a1530')}
  for(let x=1;x<W;x+=7){const h=8+(Math.sin(x*7.3)*4375.5%1+1)%1*10|0,s=Math.sin(t*1.7+x*.2)*2;R(x+s,H-h,2,h,'#05030a')}}

const S2=22;

function post(fl){if(fl>.02){ctx.fillStyle=`rgba(230,220,255,${fl*.35})`;ctx.fillRect(0,0,W,H)}
  const vg=ctx.createRadialGradient(W/2,H/2,H*.45,W/2,H/2,W*.62);vg.addColorStop(0,'rgba(0,0,0,0)');vg.addColorStop(1,'rgba(0,0,0,.6)');ctx.fillStyle=vg;ctx.fillRect(0,0,W,H)}
function army(s){for(let i=0;i<34;i++){const row=i%4,sc=1+row*.22,y=GY+8+row*7,x=((i*23-s*17)%400+400)%400-40,by=y-Math.abs(Math.sin(s*7+i))*1.6;
  R(x-3*sc,by-13*sc,6*sc,13*sc,'#07040d');R(x-2*sc,by-18*sc,4*sc,5*sc,'#07040d');R(x-4*sc,by-13*sc,1,13*sc,'#3a2468');
  R(x-2,by-16*sc,1,1,'#ff3030');R(x+1,by-16*sc,1,1,'#ff3030');R(x+4*sc,by-24*sc,1,22*sc,'#0a0612');
  if(i%6===0)R(x+5*sc,by-24*sc,9*sc+Math.sin(s*5+i)*2,6*sc,'#7a1020')}}
function scene2(s){
  const T=40+s,fl=Math.max(0,...[4,12,19.5].map(b=>s>=b?Math.exp(-(s-b)*7):0)),cam=60+s*3.2;
  ctx.fillStyle='#000';ctx.fillRect(0,0,W,H);ctx.save();ctx.translate(0,(s*1.27)%1<.1?1:0);
  drawSky(1,fl*.6);disc(52,34,16,'rgba(255,255,255,.02)');disc(52,34,9,'#ff7a5a');
  const cc=mix('#2a1850','#3a0a18',1);for(let j=0;j<6;j++){const x=((j*90-T*(4+j))%(W+80)+W+80)%(W+80)-60,y=20+j*9;R(x,y,50,4,cc);R(x+10,y-3,32,3,cc)}
  ridge(cam*.15,16,GY-34,1.3,mix('#5a3a8c','#c0503c',1),mix('#3c2868','#5a1630',1));
  lord(T,cam,1,1,0,1);
  ridge(cam*.3,12,GY-14,4.1,mix('#3a2468','#7a2a2a',1),mix('#241646','#34101e',1));
  village(T,cam,1);drawPines(cam);ground(1);army(s);hero(58,160,T,1);ash(T,1);grass(T);
  ctx.restore();post(fl)}
const S3=44,S4=66,S5=88,S6=110,S7=132,S8=154,TA=178;
function titleCard(t){if(t<=TA)return;const u=t-TA,a=ez(cl(u/1.2)),s='SASTRA DUNGEON',sp=14,x0=(W-s.length*sp)/2;R(0,H/2-28,W,52,`rgba(0,0,0,${.55*a})`);
  ctx.font='bold 26px "Courier New",monospace';ctx.textBaseline='middle';ctx.textAlign='center';
  const n=Math.min(s.length,Math.floor((u-.3)*6)+1);
  for(let i=0;i<n;i++){const lx=x0+i*sp+sp/2;ctx.fillStyle='#4a0a10';ctx.fillText(s[i],lx+1,H/2-9);ctx.fillStyle='#ff5a3a';ctx.fillText(s[i],lx,H/2-10);ctx.fillStyle='rgba(255,214,138,.55)';ctx.fillText(s[i],lx-1,H/2-11)}
  if(u>2.2){const b=ez(cl((u-2.2)/.8));ctx.font='bold 9px "Courier New",monospace';ctx.fillStyle=`rgba(244,230,200,${b})`;ctx.fillText((cls.name||'Hero').toUpperCase()+'  —  YOUR QUEST BEGINS',W/2,H/2+10)}}

/* ===== realms ===== */
function floor(c1,c2,c3){R(0,GY,W,H-GY,c1);R(0,GY,W,3,c2);for(let y=GY+6;y<H;y+=6)R(0,y,W,1,c3);
  for(let i=-8;i<=8;i++)for(let y=GY;y<H;y+=2){const k=(y-GY)/(H-GY);R(160+i*8+i*32*k,y,1,2,c3)}}
function banner(a,l1,l2,c){if(a<=.02)return;ctx.globalAlpha=a;R(0,26,W,34,'rgba(0,0,0,.5)');ctx.textAlign='center';ctx.textBaseline='middle';
  ctx.font='bold 8px "Courier New",monospace';ctx.fillStyle='#d8d0c0';ctx.fillText(l1,W/2,34);
  ctx.font='bold 17px "Courier New",monospace';ctx.fillStyle='#000';ctx.fillText(l2,W/2+1,48);ctx.fillStyle=c;ctx.fillText(l2,W/2,47);ctx.globalAlpha=1}
const fade=(s,a,b)=>ez(cl((s-a)/.8))*(1-ez(cl((s-b)/.8)));
function torch(x,y,t,i){disc(x,y-4,22,'rgba(255,140,40,.07)');R(x-1,y,3,8,'#2a1a10');const h=4+Math.abs(Math.sin(t*9+i*3))*5;R(x-2,y-h,5,h,'#ff7a18');R(x-1,y-h*.6,3,h*.6,'#ffd060')}
function sk(x,y,rise,s,i){if(rise<=0)return;ctx.save();ctx.beginPath();ctx.rect(x-12,0,24,y);ctx.clip();
  const oy=y+(1-rise)*24,b=Math.abs(Math.sin(s*5+i))*1.2;
  R(x-3,oy-8,1,8,'#b8b8a8');R(x+2,oy-8,1,8,'#a0a090');R(x-3,oy-10,6,2,'#c0c0b0');R(x,oy-19-b,1,9,'#b8b8a8');
  for(let r=0;r<4;r++)R(x-4,oy-18-b+r*2,8,1,r%2?'#a0a090':'#d0d0c0');
  R(x-7,oy-18-b,3,1,'#b8b8a8');R(x+4,oy-18-b,3,1,'#b8b8a8');R(x+7,oy-24-b,1,10,'#8a8aa0');
  R(x-3,oy-25-b,6,5,'#d8d8c8');R(x+2,oy-25-b,1,5,'#a0a090');R(x-2,oy-23-b,1,1,'#ff3030');R(x+1,oy-23-b,1,1,'#ff3030');ctx.restore()}
function cryptLord(x,by,eyes,roar,t){
  for(let y=-62;y<=0;y++){const k=(y+62)/62,hw=Math.round(9+k*20),yy=by+y;R(x-hw,yy,hw*2,1,'#120e1a');R(x-hw,yy,Math.max(2,hw*.3|0),1,'#2a2040');R(x-hw,yy,1,1,'#c04040');R(x+hw-1,yy,1,1,'#c04040')}
  R(x-24,by-58,2,26,'#c8c8b8');R(x+22,by-58,2,26,'#c8c8b8');R(x-28,by-92,2,92,'#4a3a2a');R(x-26,by-34,6,2,'#c8c8b8');
  const pu=.6+.4*Math.sin(t*5);disc(x-27,by-96,10,`rgba(80,255,140,${.2*pu})`);disc(x-27,by-96,4,'#70ffa0');
  disc(x,by-74,9,'#d0d0c0');R(x+3,by-80,4,12,'#a8a898');R(x-6,by-68,12,4,'#c0c0b0');R(x-5,by-66,10,1,'#201810');R(x-5,by-76,4,4,'#0a0408');R(x+1,by-76,4,4,'#0a0408');
  if(eyes>.3){const ec=roar>.2?'#ffd0a0':'#ff3030';disc(x-3,by-74,5,`rgba(255,50,50,${.2*eyes})`);disc(x+3,by-74,5,`rgba(255,50,50,${.2*eyes})`);R(x-4,by-75,2,2,ec);R(x+2,by-75,2,2,ec)}
  for(let i=-2;i<=2;i++)tri(x+i*4,by-90-(2-Math.abs(i))*2,4,6+(2-Math.abs(i))*2,'#d8b050');R(x-9,by-84,18,3,'#b8902c')}
function realm1(s){
  const cam=s*4,fl=s>=14.5?Math.exp(-(s-14.5)*6):0,roar=s>14.2&&s<17?Math.sin(cl((s-14.2)/2.8)*Math.PI):0,rise=ez(cl((s-9)/5));
  ctx.fillStyle='#000';ctx.fillRect(0,0,W,H);ctx.save();ctx.translate(Math.round(Math.sin(s*90)*roar*2.5),Math.round(Math.cos(s*77)*roar*2.5));
  drawPal(['#07080c','#0c0f14','#12171d','#1a2128','#222c33','#2c3840','#384650','#46555e'],fl*.5+roar*.1);
  for(let x=0;x<W;x++){const X=((x+cam*.3)%70+70)%70;if(X<9){R(x,0,1,GY,'#090c10');if(X<2)R(x,0,1,GY,'#2c3a44')}else R(x,0,1,Math.round(40-Math.sqrt(Math.max(0,900-(X-40)*(X-40)))),'#090c10')}
  for(let m=0;m<=5;m++)torch(Math.round(70*m+4-cam*.3),62,s,m);
  for(let i=4;i>0;i--)disc(236,GY-50,i*22,`rgba(255,40,60,${.03*rise})`);
  floor('#12161a','#26323a','#0e1216');
  ctx.save();ctx.beginPath();ctx.rect(0,0,W,GY+8);ctx.clip();cryptLord(236,GY+14+(1-rise)*95,cl((s-12)/1.5),roar,s);ctx.restore();
  R(202,GY+8,68,20,'#2a323a');R(202,GY+8,68,2,'#4a5a66');R(202+ez(cl((s-8.5)/1.5))*28+4,GY+2,68,6,'#38444e');
  for(let i=0;i<9;i++)sk(34+i*30,GY+12+(i%3)*9,ez(cl((s-3-i*.45)/1.2)),s,i);
  for(let i=0;i<8;i++){const x=((i*53+s*10*(1+i%3))%360)-20,y=40+i*10+Math.sin(s*2+i)*6;R(x,y,3,5,'rgba(180,255,200,.35)');R(x+1,y+5,1,2,'rgba(180,255,200,.2)')}
  R(0,GY-6,W,10,'rgba(96,255,144,.05)');
  ctx.restore();banner(fade(s,2,6.5),'REALM I','THE CRYPT','#e04040');banner(fade(s,15,20),'RULER','CRYPT LORD','#e04040');post(fl)}
const blk=(x,y,w,h,t)=>{R(x,y,w,h,'#2e211a');R(x,y,w,2,'#5a4436');R(x,y,2,h,'#4a382c');R(x+w-3,y,3,h,'#1c120d');
  const r=rng(w*7+h);for(let i=0;i<w*h/150;i++){const cx=x+3+r()*(w-8)|0,cy=y+3+r()*(h-8)|0,l=3+r()*6|0;R(cx,cy,1,l,'rgba(255,170,50,'+(.5+.4*Math.sin(t*3+i))+')')}};
function titan(x,by,eyes,roar,t){
  blk(x-18,by-22,14,22,t);blk(x+4,by-22,14,22,t);blk(x-26,by-70,52,48,t);blk(x-44,by-76,20,22,t);blk(x+24,by-76,20,22,t);
  blk(x-48,by-56,14,34,t);blk(x+34,by-56,14,34,t);blk(x-50,by-24,18,18,t);blk(x+32,by-24,18,18,t);blk(x-11,by-92,22,18,t);
  const pu=.6+.4*Math.sin(t*4);disc(x,by-46,9,`rgba(255,160,40,${.3*pu})`);R(x-3,by-49,6,6,'#ffd060');
  if(eyes>.2){const ec=roar>.2?'#fff0b0':'#ffa020';disc(x-5,by-84,6,`rgba(255,160,40,${.25*eyes})`);disc(x+5,by-84,6,`rgba(255,160,40,${.25*eyes})`);R(x-8,by-85,6,3,ec);R(x+2,by-85,6,3,ec)}}
function realm2(s){
  const rise=ez(cl((s-7)/6)),roar=s>13.4&&s<16?Math.sin(cl((s-13.4)/2.6)*Math.PI):0,fl=roar>.5?.15:0,sh=(s>6&&s<14?1:0)+roar*2.5;
  ctx.fillStyle='#000';ctx.fillRect(0,0,W,H);ctx.save();ctx.translate(Math.round(Math.sin(s*90)*sh),Math.round(Math.cos(s*77)*sh));
  drawPal(['#0a0604','#140c06','#20120a','#321a0c','#4a2a12','#6a3e1a','#8a5424','#a8702e'],fl);
  for(let x=-10;x<W+20;x+=14){const cx=x-(s*2%14)*0+Math.round(Math.sin(x)*3),len=14+Math.abs(Math.sin(x*1.7))*30|0;for(let i=0;i<len;i++){const w=Math.round(10*(1-i/len));R(cx-w/2,i,w,1,'#0a0604')}}
  for(let i=4;i>0;i--)disc(235,GY-50,i*24,`rgba(255,150,40,${.035*rise})`);
  floor('#1a0f0a','#3a2414','#120a06');
  for(const cx of [30,64,300,276]){const pu=.7+.3*Math.sin(s*3+cx);spike(cx,GY+10,.3,-1,26,7,'#ffb040',0);spike(cx+5,GY+10,.5,-1,16,5,'#ffd070',0);disc(cx,GY-6,16,`rgba(255,160,40,${.08*pu})`)}
  ctx.save();ctx.beginPath();ctx.rect(0,0,W,GY+12);ctx.clip();titan(235,GY+14+(1-rise)*108,cl((s-10)/1.5),roar,s);ctx.restore();
  for(let j=0;j<7;j++){const p=((s*.5+j/7)%1),x=(j*47+20)%W,y=p*GY*1.1;R(x,y-6,1,6,'rgba(120,90,60,.4)');R(x,y,4,4,'#4a382c');R(x,y,4,1,'#6a5444')}
  ash(40+s,1);
  ctx.restore();banner(fade(s,2,6.5),'REALM II','THE DEEP CAVERNS','#e8b060');banner(fade(s,15,20),'RULER','CAVERN TITAN','#e8b060');post(fl)}
/* ===== realms III-V + the hero's oath ===== */
const FXP=Array.from({length:90},()=>({x:rn()*340,y:rn()*170,sp:6+rn()*20,ph:rn()*6}));
const rgb=(c,a)=>{const[r,g,b]=hex(c);return`rgba(${r},${g},${b},${a})`};
function wyrm(x,by,rise,eyes,roar,t){
  const N=18,H=100*rise,P=[];
  for(let i=0;i<=N;i++){const u=i/N;P.push([x+Math.sin(u*4-t*1.4)*6*u-u*u*26,by-u*H])}
  for(let i=0;i<=N;i++){const[px,py]=P[i],u=i/N,r=Math.round(lp(15,8,u));
    disc(px,py,r,'#24445f');disc(px-2,py-1,r-3,'#6aa8d0');disc(px-3,py-2,Math.max(1,r-7),'#bfeaff');if(i<N)tri(px+r-1,py-6,6,8,'#e8f8ff')}
  const[hx,hy]=P[N],jaw=roar*8+2;
  for(let i=0;i<28;i++){const k=i/28,h=Math.round(lp(3,11,k)),X=hx-24+i;
    R(X,hy-2-h,1,h,'#9fd8f5');R(X,hy-2-h,1,2,'#e8f8ff');R(X,hy-1+Math.round(jaw*(1-k)),1,4,'#5a8cb0');if(i%4===1)R(X,hy-2,1,2,'#fff')}
  spike(hx+2,hy-10,.6,-1,18,4,'#e8f8ff',.015);spike(hx-6,hy-12,.4,-1,12,3,'#bfeaff',.015);
  disc(hx-8,hy-8,4,`rgba(200,240,255,${.3*eyes})`);R(hx-9,hy-9,3,2,eyes>.2?'#ffffff':'#0a1a2a');
  if(roar>.15)for(let k=0;k<44;k++){const p=((t*1.6+k/44)%1);R(hx-24-p*120,hy+3+p*p*45+Math.sin(k*2)*6*p,2+p*4,2+p*4,rgb(k%2?'#ffffff':'#8fdcff',(1-p)*roar*1.4))}}
function realm3(s){
  const rise=ez(cl((s-7)/6)),roar=s>13.4&&s<16?Math.sin(cl((s-13.4)/2.6)*Math.PI):0,fl=roar>.5?.12:0,shk=(s>6&&s<14?1:0)+roar*2.5;
  ctx.fillStyle='#000';ctx.fillRect(0,0,W,H);ctx.save();ctx.translate(Math.round(Math.sin(s*90)*shk),Math.round(Math.cos(s*77)*shk));
  drawPal(['#040814','#081230','#0e2050','#173468','#245080','#3a7098','#6098b4','#98c4d4'],fl);
  for(let i=0;i<40;i++)R((i*83)%W,(i*37)%60,1,1,`rgba(255,255,255,${.4+.3*Math.sin(s*2+i)})`);
  for(let x=0;x<W;x+=2){const y=30+Math.sin(x*.03+s*.8)*10+Math.sin(x*.07-s*.5)*5,h=18+Math.sin(x*.05+s)*8;R(x,y,2,h,'rgba(80,255,190,.08)');R(x,y,2,h*.5,'rgba(120,200,255,.09)')}
  ridge(s*2,26,GY-40,2.1,'#a8d8f0','#2a4a6a');ridge(s*5,18,GY-16,5.3,'#d8f0ff','#1a3048');
  floor('#0e1c2c','#3a6a8c','#0a1420');
  const cr=ez(cl((s-5)/3));for(let k=0;k<8;k++){const a=k*.8;for(let j=4;j<70*cr;j++)R(236+Math.cos(a)*j*1.8+Math.sin(j*.5+k*3)*3,GY+16+Math.abs(Math.sin(a))*j*.3,1,1,'#bfeaff')}
  ctx.save();ctx.beginPath();ctx.rect(0,0,W,GY+12);ctx.clip();wyrm(236,GY+14,rise,cl((s-10)/1.5),roar,s);ctx.restore();
  for(let j=0;j<8;j++){const p=cl((s-7-j*.2)/1.6);if(p>0&&p<1)R(236+(j-4)*9*p,GY+10-Math.sin(p*Math.PI)*50,3,3,'#e8f8ff')}
  for(const cx of[30,64,300,276]){const pu=.7+.3*Math.sin(s*3+cx);spike(cx,GY+10,.3,-1,26,7,'#8fdcff',0);spike(cx+5,GY+10,.5,-1,16,5,'#e8f8ff',0);disc(cx,GY-6,16,`rgba(120,210,255,${.08*pu})`)}
  FXP.forEach((p,i)=>{const x=((p.x-s*p.sp*.6+Math.sin(s+p.ph)*4)%340+340)%340-10,y=(p.y+s*p.sp*1.4)%170;R(x,y,i%3?1:2,i%3?1:2,'rgba(240,250,255,.8)')});
  ctx.restore();banner(fade(s,2,6.5),'REALM III','FROZEN PEAKS','#8fdcff');banner(fade(s,15,20),'RULER','FROST WYRM','#8fdcff');post(fl)}
function behemoth(x,by,rise,eyes,roar,t){
  const y0=by+(1-rise)*115,fy=y0-16-roar*58,pu=.6+.4*Math.sin(t*4);
  for(const sd of[-1,1]){for(let i=0;i<=8;i++){const u=i/8;disc(Math.round(x+sd*lp(34,44,u)),Math.round(lp(y0-56,fy,u)),Math.round(lp(13,9,u)),'#2a0e08')}
    disc(x+sd*44,fy,13,'#3e1a0e');disc(x+sd*44,fy+2,6,`rgba(255,120,30,${.5*pu})`)}
  disc(x,y0-38,30,'#2a0e08');disc(x-7,y0-43,21,'#3e1a0e');
  for(let k=0;k<7;k++)R(x-18+k*6,y0-58+(k*9)%26,2,8+k%3*3,`rgba(255,170,40,${.5+.4*Math.sin(t*3+k)})`);
  disc(x,y0-38,7,`rgba(255,120,30,${.4*pu})`);R(x-3,y0-41,6,6,'#ffd060');disc(x,y0-80,15,'#3e1a0e');
  for(const sd of[-1,1]){spike(x+sd*9,y0-90,sd*.7,-1,26,6,'#1a0804',sd*.02);disc(x+sd*6,y0-82,6,`rgba(255,200,40,${.25*eyes})`);if(eyes>.2)R(x+sd*6-2,y0-83,5,3,roar>.2?'#fff0b0':'#ffd54f')}
  R(x-7,y0-74,14,2+roar*9,'#ff7a20');R(x-5,y0-73,10,roar*5,'#ffd060')}
function realm4(s){
  const rise=ez(cl((s-7)/6)),roar=s>13.4&&s<16?Math.sin(cl((s-13.4)/2.6)*Math.PI):0,fl=roar>.5?.15:0,shk=(s>6&&s<14?1:0)+roar*2.5;
  ctx.fillStyle='#000';ctx.fillRect(0,0,W,H);ctx.save();ctx.translate(Math.round(Math.sin(s*90)*shk),Math.round(Math.cos(s*77)*shk));
  drawPal(['#0a0202','#1a0505','#2e0a06','#4a1208','#701c0a','#a02c0c','#d04a10','#ff7a20'],fl);
  for(let j=0;j<6;j++){const x=((j*90-s*(5+j))%(W+80)+W+80)%(W+80)-60,y=14+j*9;R(x,y,54,5,'#1a0604');R(x+10,y-3,34,3,'#1a0604')}
  tri(90,GY-90,160,90,'#1a0806');disc(90,GY-90,13,'rgba(255,120,30,.4)');R(84,GY-91,12,3,'#ff9a30');
  for(let i=0;i<4;i++)for(let y=0;y<60;y+=2)R(90-i*9+y*(i-1.5)*.3+Math.sin(y*.2+s*2),GY-84+y*1.3,2,2,`rgba(255,${100+i*20},30,${.6+.3*Math.sin(s*3+y)})`);
  for(let j=0;j<30;j++){const p=(s*.45+j/30)%1,a=-Math.PI/2+(j%7-3)*.28;R(90+Math.cos(a)*p*60*(1+j%3*.3),GY-90+Math.sin(a)*p*100+p*p*110,2,2,j%2?'#ffb040':'#ff5020')}
  ridge(s*3,14,GY-18,3.7,'#5a1a0c','#1a0804');floor('#1a0805','#4a1a0c','#120403');
  ctx.save();ctx.beginPath();ctx.rect(0,0,W,GY+22);ctx.clip();behemoth(235,GY+28,rise,cl((s-10)/1.5),roar,s);ctx.restore();
  for(let y=GY+18;y<GY+34;y+=2)for(let x=0;x<W;x+=2){const v=Math.sin(x*.08+s*2+y*.5);R(x,y,2,2,v>.3?'#ffd060':v>-.3?'#ff7a20':'#c43a10')}
  for(const cx of[30,64,300,276]){spike(cx,GY+12,.2,-1,24,8,'#1a0804',0);disc(cx,GY-4,14,`rgba(255,120,30,${.08*(.7+.3*Math.sin(s*3+cx))})`)}
  FXP.forEach((p,i)=>{const x=(p.x+Math.sin(s+p.ph)*8+340)%340,y=170-(p.y+s*p.sp*1.6)%170;R(x,y,2,2,i%2?'#ff8a30':'#ffd060')});
  ctx.restore();banner(fade(s,2,6.5),'REALM IV','THE EMBER DEPTHS','#ff7030');banner(fade(s,15,20),'RULER','EMBER BEHEMOTH','#ff7030');post(fl)}
function prince(x,by,rise,eyes,roar,t){
  const Hh=Math.round(lp(30,62,rise)),rim='#7a38c8',pu=.6+.4*Math.sin(t*4),hy=by-Hh-6;
  for(let i=-4;i<=4;i++){const L=74-Math.abs(i)*8;spike(x+i*10,by-4,i*.16,-1,L,9,'#0e0518',0);spike(x+i*10-3,by-4,i*.16,-1,L-2,2,'#4a1c80',0)}
  for(let y=-Hh;y<=0;y++){const k=(y+Hh)/Hh,hw=Math.round(9+k*k*22+k*8),yy=by+y;R(x-hw,yy,hw*2,2,'#0c0614');R(x-hw,yy,Math.max(2,hw*.3|0),2,'#1e1040');R(x-hw,yy,2,2,rim);R(x+hw-2,yy,2,2,rim)}
  for(const sd of[-1,1])for(let i=0;i<16;i++){const ax=x+sd*(12+i*1.2),ay=by-Hh+10-roar*i*1.6+i*.5;R(ax,ay,3,3,'#14081f');if(i===15)disc(ax,ay,5,`rgba(200,140,255,${.2+.4*roar})`)}
  disc(x,hy,10,'#0a0612');R(x-10,hy-3,2,8,rim);for(let i=-2;i<=2;i++)tri(x+i*4,hy-12-(2-Math.abs(i))*3,4,5+(2-Math.abs(i))*3,'#2a1450');R(x-9,hy-10,18,3,'#6a38b0');
  for(const sd of[-1,1]){disc(x+sd*4,hy,6,`rgba(190,120,255,${.25*eyes})`);if(eyes>.2)R(x+sd*4-2,hy-1,4,2,roar>.2?'#ffffff':'#d09aff')}
  const gy=by-Hh*.55;disc(x,gy,5,`rgba(190,90,255,${.3*pu})`);R(x-1,gy-5,2,10,'#d8a0ff');R(x-4,gy-1,8,2,'#d8a0ff');
  for(let i=0;i<3;i++){const a=t*1.8+i*TAU/3,ox=x+Math.cos(a)*46,oy=by-Hh*.6+Math.sin(a)*14;disc(ox,oy,6,'rgba(160,96,255,.3)');disc(ox,oy,3,'#d8a0ff')}}
function realm5(s){
  const rise=ez(cl((s-7)/6)),roar=s>13.4&&s<16?Math.sin(cl((s-13.4)/2.6)*Math.PI):0,fl=roar>.5?.15:0,shk=(s>6&&s<14?1:0)+roar*3;
  ctx.fillStyle='#000';ctx.fillRect(0,0,W,H);ctx.save();ctx.translate(Math.round(Math.sin(s*90)*shk),Math.round(Math.cos(s*77)*shk));
  drawPal(['#04010a','#080214','#100424','#1a0838','#280c54','#3a1274','#5a1c98','#8a34c4'],fl);
  for(let i=0;i<50;i++)R((i*71)%W,(i*29)%80,1,1,`rgba(220,180,255,${.3+.3*Math.sin(s*2+i)})`);
  const TC=['#e04040','#e8b060','#8fdcff','#ff7030'];
  for(let k=0;k<5;k++){const x=((k*83+s*3*(1+k%2))%(W+80)+W+80)%(W+80)-40,y=Math.round(30+k*14+Math.sin(s*.8+k)*4);
    R(x,y,40-k*3,5,'#140a28');R(x,y,40-k*3,1,'#4a2480');for(let i=0;i<10;i++)R(x+i*1.2,y+5+i,34-k*3-i*2.4,1,'#0e0620');
    if(k<4){const tx=x+14;disc(tx+3,y-6,9,rgb(TC[k],.18));R(tx,y-10,6,10,'#0a0414');R(tx-1,y-12,2,12,'#0a0414');R(tx+5,y-12,2,12,'#0a0414');R(tx+2,y-8,2,2,TC[k])}}
  floor('#0e0618','#3a1a60','#0a0412');
  for(let a=0;a<TAU;a+=.07){const al=.4+.4*Math.sin(s*3+a*3);R(235+Math.cos(a)*72,GY+24+Math.sin(a)*11,2,1,`rgba(180,100,255,${al})`);R(235+Math.cos(a)*44,GY+24+Math.sin(a)*7,2,1,`rgba(180,100,255,${al*.7})`)}
  if(roar>0)for(let a=0;a<TAU;a+=.05)R(235+Math.cos(a)*roar*120,GY+24+Math.sin(a)*roar*18,2,1,`rgba(220,170,255,${1-roar})`);
  R(175,GY+6,120,10,'#1a0a30');R(175,GY+6,120,2,'#7a38c8');
  prince(235,GY+6,rise,cl((s-10)/1.5),roar,s);
  for(let j=0;j<30;j++){const p=(s*.25+j/30)%1;R((j*37)%W+Math.sin(s+j)*6,GY+30-p*GY,1,3,rgb('#c080ff',.5*(1-p)))}
  ctx.restore();banner(fade(s,2,6.5),'REALM V','THE SHADOW REALM','#c080ff');banner(fade(s,15,20),'RULER','SHADOW PRINCE','#c080ff');post(fl)}
const FIVE=['#e04040','#e8b060','#8fdcff','#ff7030','#c080ff'],PX=[28,92,160,226,292];
function heroOath(x,y,t,k,rs,gl){
  const C=HC.c,Cd=HC.d,Cl=HC.l,dy=Math.round(k*7),bw=k>.5,hh=16-Math.round(dy*.5),bx=Math.round(k*2),by=Math.round(k*3);
  for(let i=0;i<22;i++){const cx=x-6-i,wv=Math.sin(t*4+i*.55)*1.8*(i/22+.3)*(1+rs),top=y-19+dy+i*.3,bot=y-7+i*.2+wv+(bw?2:0);R(cx,top+wv*.3,1,bot-top,i%5<3?C:Cd);if(i<18)R(cx,top+wv*.3,1,1,Cl)}
  if(bw){R(x-9,y-3,11,3,'#3a3a5a');R(x+1,y-10,7,3,'#3a3a5a');R(x+5,y-8,3,5,'#3a3a5a');R(x+4,y-3,6,3,'#2a1a14');R(x-10,y-3,3,3,'#2a1a14')}
  else{R(x-5,y-3,4,3,'#2a1a14');R(x+1,y-3,4,3,'#2a1a14');R(x-4,y-8,3,5,'#3a3a5a');R(x+1,y-8,3,5,'#3a3a5a')}
  R(x-6,y-19+dy,12,hh,C);R(x+3,y-19+dy,3,hh,Cd);R(x-6,y-19+dy,2,hh,Cl);R(x-7,y-21+dy,14,3,'#9a9ab8');R(x-7,y-21+dy,14,1,'#d8d8f0');
  R(x-3+bx,y-28+dy+by,6,7,'#8a8aa8');R(x-3+bx,y-28+dy+by,6,1,'#c0c0d8');R(x+2+bx,y-28+dy+by,1,7,'#5a5a78');
  const pl=Math.sin(t*6)*1.5;R(x-8,y-29+dy+by+pl*.3,7,2,C);R(x-12,y-28+dy+by+pl,4,2,Cd);
  const hx=x+8,hy=y-17+dy-Math.round(rs*7),ang=rs<.5?lp(Math.PI/2,0,rs*2):lp(0,-1.45,(rs-.5)*2),L=20,ca=Math.cos(ang),sa=Math.sin(ang);
  R(x+5,y-19+dy,4,3,'#9a9ab8');R(hx-1,hy-1,3,3,'#9a9ab8');R(x+5,y-19+dy,3,Math.max(1,hy-(y-19+dy)),'#9a9ab8');
  const tx=hx+ca*L,ty=hy+sa*L;if(gl>0){disc(Math.round(tx),Math.round(ty),Math.round(6+gl*10),`rgba(200,230,255,${.15*gl})`);disc(Math.round(tx),Math.round(ty),4,`rgba(255,255,255,${.4*gl})`)}
  for(let i=0;i<=L;i++)R(hx+ca*i,hy+sa*i,2,2,i<2?'#8a8aa8':mix('#dfe8ff','#ffffff',gl));
  for(let j=-3;j<=3;j++)R(hx+ca*2-sa*j,hy+sa*2+ca*j,1,2,HC.a);R(hx-ca*3,hy-sa*3,2,2,HC.a);
  return[tx,ty]}
function oath(s){
  const fs=s-20.5,fl=fs>0?Math.exp(-fs*4):0,shk=fs>0&&fs<.8?3*(1-fs/.8):0,k=1-ez(cl((s-10.2)/1.6)),rs=ez(cl((s-11.8)/2.2)),gl=fs>0?1:cl((s-8)/14);
  ctx.fillStyle='#000';ctx.fillRect(0,0,W,H);ctx.save();ctx.translate(Math.round(Math.sin(s*90)*shk),Math.round(Math.cos(s*77)*shk));
  drawPal(DOOM,fl*.6);
  for(let j=0;j<6;j++){const x=((j*90-(40+s)*(4+j))%(W+80)+W+80)%(W+80)-60,y=20+j*9;R(x,y,50,4,'#3a0a18');R(x+10,y-3,32,3,'#3a0a18')}
  rift(99);ridge(s*1.5,16,GY-34,1.3,'#c0503c','#5a1630');
  FIVE.forEach((c,i)=>{const on=ez(cl((s-14.2-i*.8)/.7));if(on<=0)return;const x=PX[i],fk=.75+.25*Math.sin(s*9+i*2),bh=GY-30;
    R(x-5,0,10,bh,rgb(c,.1*on*fk));R(x-2,0,4,bh,rgb(c,.3*on*fk));R(x-1,0,2,bh,`rgba(255,255,255,${.7*on*fk})`);disc(x,bh,10,rgb(c,.25*on));
    R(x-3,bh-6,6,6,'#0a0510');R(x-4,bh-10,2,10,'#0a0510');R(x+2,bh-10,2,10,'#0a0510')});
  ridge(s*3,12,GY-14,4.1,'#7a2a2a','#34101e');village(40+s,60+s*2,1);
  for(let x=0;x<W;x++){const top=Math.round(GY+22+Math.max(0,x-140)*.45);R(x,top,1,H-top,'#0b0612');R(x,top,1,1,'#4a2430')}
  const tip=heroOath(96,GY+22,s,k,rs,gl);
  FIVE.forEach((c,i)=>{const a=cl((s-16.5-i*.5)/1.2);if(a<=0)return;for(let j=0;j<=24*a;j++){const u=j/24,x=lp(PX[i],tip[0],u),y=lp(GY-30,tip[1],u)-Math.sin(u*Math.PI)*45;R(x-1,y-1,4,4,rgb(c,.2));R(x,y,2,2,c)}});
  if(s>19){const b=cl((s-19)/1.5)*(fs>0?.55:.35);R(tip[0]-5,0,10,tip[1],`rgba(255,255,255,${b*.3})`);R(tip[0]-1,0,3,tip[1],`rgba(255,255,255,${b})`)}
  if(fs>0&&fs<1.6)for(let a=0;a<TAU;a+=.04)R(tip[0]+Math.cos(a)*fs*180,tip[1]+Math.sin(a)*fs*90,2,2,`rgba(255,255,255,${1-fs/1.6})`);
  ash(40+s,1);grass(s);ctx.restore();post(fl)}
function render(t){
  if(t<S2)scene1(t);else if(t<S3)scene2(t-S2);else if(t<S4)realm1(t-S3);else if(t<S5)realm2(t-S4);else if(t<S6)realm3(t-S5);else if(t<S7)realm4(t-S6);else if(t<S8)realm5(t-S7);else oath(t-S8);
  const bh=14*ez(cl(t/1.5));R(0,0,W,bh,'#000');R(0,H-bh,W,bh,'#000');
  if(t<1.5){ctx.fillStyle=`rgba(0,0,0,${1-t/1.5})`;ctx.fillRect(0,0,W,H)}
  const x=Math.min(...[S2,S3,S4,S5,S6,S7,S8].map(b=>Math.abs(t-b)));if(x<.8){ctx.fillStyle=`rgba(0,0,0,${1-x/.8})`;ctx.fillRect(0,0,W,H)}
  titleCard(t);caption(t)}
/* captions */
const CAPS=[[.8,4.3,'For a hundred years, the village slept in peace.'],[4.8,9,'Then the sky bled, and the Rift tore open.'],[9.4,14,'From the Sastra Dungeon rose the Lord of the Five Realms.'],[14.5,19,'Torches fell. The night grew loud.'],[19.4,21.8,'One hero refused to kneel.'],[22.9,28,'But the Lord’s army was already on the march.'],[28.6,34,'Five realms trembled beneath its banners.'],[34.6,39.8,'And the Rift kept growing.'],[40.2,43.8,'It began with the realm of the dead.'],[S3+6.5,S3+13,'Beneath the Crypt, the dead never rest.'],[S3+17.5,S3+21.7,'And the Crypt Lord woke to claim his crown.'],[S4+7,S4+13,'Far below, the Deep Caverns shook.'],[S4+16,S4+21.7,'The Cavern Titan rose, ancient and hungry.'],[S5+6.5,S5+13,'Higher still, the Frozen Peaks sleep beneath endless winter.'],[S5+17.5,S5+21.7,'And the Frost Wyrm tore free of the ice.'],[S6+6.5,S6+13,'The mountain burns from within, and rivers of fire run red.'],[S6+17.5,S6+21.7,'The Ember Behemoth rose, hungry for ruin.'],[S7+6.5,S7+13,'At the heart of the Rift lies the Shadow Realm.'],[S7+17.5,S7+21.7,'Five realms. Five thrones. And he has been waiting.'],[S8+1.2,S8+5.4,'On a hill above the burning world, the hero knelt.'],[S8+6,S8+10.4,'“I swear upon my blade and my blood —”'],[S8+10.6,S8+15.6,'“I will break the five thrones, and close the Rift.”'],[S8+16.4,S8+22,'And far away, five thrones began to tremble.']];
const cap=document.getElementById('siCap');
function caption(t){const c=CAPS.find(c=>t>=c[0]&&t<c[1]);cap.textContent=c?c[2].slice(0,Math.floor((t-c[0])*30)):''}

function scene1(t){
  const d=ez(cl((t-4)/7)),roar=t>13&&t<15.5?Math.sin(cl((t-13)/2.5)*Math.PI):0,fl=flash(t),cam=t*2.2;
  ctx.fillStyle='#000';ctx.fillRect(0,0,W,H);ctx.save();
  ctx.translate(Math.round(Math.sin(t*90)*roar*2.5),Math.round(Math.cos(t*77)*roar*2.5));
  drawSky(d,fl*.6);
  stars.forEach(s=>{const a=(1-d*.7)*(.5+.5*Math.sin(t*3+s.p));if(a>.15)R(s.x,s.y,1,1,`rgba(255,255,255,${a})`)});
  const mc=mix('#f6efd6','#ff7a5a',d);disc(52,34,16,`rgba(255,255,255,${.05*(1-d)})`);disc(52,34,9,mc);R(49,31,2,2,'rgba(0,0,0,.12)');R(54,36,3,2,'rgba(0,0,0,.12)');
  const cc=mix('#2a1850','#3a0a18',d);for(let j=0;j<6;j++){const x=((j*90-t*(4+j))%(W+80)+W+80)%(W+80)-60,y=20+j*9;R(x,y,50,4,cc);R(x+10,y-3,32,3,cc);R(x+4,y+4,36,2,'rgba(0,0,0,.2)')}
  rift(t);bolts(t);
  ridge(cam*.15,16,GY-34,1.3,mix('#5a3a8c','#c0503c',d),mix('#3c2868','#5a1630',d));
  lord(t,cam,ez(cl((t-6)/6)),cl((t-11)/1.5),roar,d);
  ridge(cam*.3,12,GY-14,4.1,mix('#3a2468','#7a2a2a',d),mix('#241646','#34101e',d));
  village(t,cam,d);drawPines(cam);ground(d);hero(78,150,t,d);ash(t,d);burst(t);grass(t);
  ctx.restore();
  post(fl);
}


/* ===== sound + music (WebAudio, no files) ===== */
let AC=null,mg=null,nb=null,muted=false,seq=0,nextT=0,stp=0,mode=0,fired=0;
const EV=[[5,'th'],[7.6,'th'],[12.7,'roar'],[16.5,'th'],[18.3,'sword'],[S2+4,'th'],[S2+12,'th'],[S2+19.5,'th'],[S3+9,'stone'],[S3+14.4,'roar'],[S4+4,'stone'],[S4+7,'rumble'],[S4+10,'stone'],[S4+13.4,'roar'],[S5+3,'wind'],[S5+6.5,'crack'],[S5+9,'crack'],[S5+12,'crack'],[S5+13.4,'roar'],[S6+4,'rumble'],[S6+8,'erupt'],[S6+11,'stone'],[S6+13.4,'roar'],[S7+4,'void'],[S7+9,'th'],[S7+13.4,'roar'],[S8+4,'wind'],[S8+11,'sword'],[S8+16,'th'],[S8+20.5,'chime'],[S8+20.5,'hit'],[TA+.3,'hit']];
const PR=[45,41,43,40],QL=[3,4,4,4],PM={5:[[52,3],[48,4],[55,4],[50,4]],6:[[45,3],[45,3],[53,4],[52,4]],7:[[48,3],[44,4],[46,4],[43,4]],8:[[45,3],[41,4],[48,4],[43,4]]},mf=m=>440*Math.pow(2,(m-69)/12);let SD=60/76/4;
function aInit(){try{AC=new(window.AudioContext||(window as any).webkitAudioContext)();mg=AC.createGain();mg.gain.value=muted?0:.55;mg.connect(AC.destination);
  nb=AC.createBuffer(1,AC.sampleRate*2,AC.sampleRate);const d=nb.getChannelData(0);for(let i=0;i<d.length;i++)d[i]=Math.random()*2-1;if(AC.resume)AC.resume()}catch(e){AC=null}}
function tn(ty,f,at,du,v,f2){if(!AC)return;const o=AC.createOscillator(),g=AC.createGain();o.type=ty;o.frequency.setValueAtTime(f,at);if(f2)o.frequency.exponentialRampToValueAtTime(Math.max(20,f2),at+du);
  g.gain.setValueAtTime(0,at);g.gain.linearRampToValueAtTime(v,at+.01);g.gain.exponentialRampToValueAtTime(.0001,at+du);o.connect(g);g.connect(mg);o.start(at);o.stop(at+du+.05)}
function nz(at,du,v,ty,f1,f2){if(!AC)return;const s=AC.createBufferSource();s.buffer=nb;s.loop=true;const fl=AC.createBiquadFilter();fl.type=ty;fl.frequency.setValueAtTime(f1,at);if(f2)fl.frequency.exponentialRampToValueAtTime(f2,at+du);
  const g=AC.createGain();g.gain.setValueAtTime(v,at);g.gain.exponentialRampToValueAtTime(.0001,at+du);s.connect(fl);fl.connect(g);g.connect(mg);s.start(at);s.stop(at+du+.05)}
function sfx(n){if(!AC)return;const at=AC.currentTime+.02;
  if(n==='th'){nz(at,1.8,.5,'lowpass',2400,120);tn('sine',70,at,1.2,.3,35)}
  else if(n==='roar'){tn('sawtooth',150,at,1.9,.12,45);tn('square',90,at,1.6,.06,40);nz(at,1.9,.22,'bandpass',900,200)}
  else if(n==='sword'){nz(at,.5,.2,'highpass',3000,8000);tn('triangle',1800,at,.45,.06,2600)}
  else if(n==='stone'){nz(at,.9,.4,'lowpass',1500,150);tn('sine',90,at,.8,.25,35)}
  else if(n==='rumble'){nz(at,3,.45,'lowpass',220,60);tn('sine',45,at,3,.3,30)}
  else if(n==='wind'){nz(at,3.2,.25,'bandpass',400,1400)}
  else if(n==='crack'){nz(at,.25,.4,'highpass',1500,6000);tn('triangle',2400,at,.2,.08,600)}
  else if(n==='erupt'){nz(at,2.5,.5,'lowpass',900,70);tn('sine',60,at,2,.35,28)}
  else if(n==='void'){tn('sine',200,at,2.5,.15,40);tn('sawtooth',55,at,2.5,.06,40);nz(at,2,.12,'bandpass',300,1500)}
  else if(n==='chime'){[72,76,79,84].forEach((m,i)=>tn('triangle',mf(m),at+i*.09,2.2,.1))}
  else if(n==='hit'){tn('sine',120,at,1.4,.3,35);nz(at,1.2,.3,'lowpass',900,80)}}
function step(i,at){const bar=(i>>4)&3,s=i&15;let r=PR[bar],q=QL[bar];const pm=PM[mode];if(pm){r=pm[bar][0];q=pm[bar][1]}
  const soft=mode===5||mode===7;
  if(s===0){tn('triangle',mf(r+12),at,SD*15,.05);tn('triangle',mf(r+19),at,SD*15,.03)}
  if(mode>=1&&s%(mode===6?2:4)===0)tn('sawtooth',mf(r-12),at,SD*(mode===6?1.8:3.5),mode===6?.05:.06);
  if(s%2===0)tn(soft?'sine':mode?'square':'triangle',mf(r+12+[0,q,7,12][(s>>1)%4]),at,SD*1.6,soft?.03:mode?.028:.024);
  if(mode===2||mode===4||mode===6||mode===8){const hv=mode===4||mode===6;if(s%4===0||(hv&&s%16===10))tn('sine',hv?110:150,at,.18,.24,40);if(s%8===4)nz(at,.12,.1,'highpass',1800);if(s%8===0)tn('sawtooth',mf(r+24+(bar%2?3:0)),at,SD*6,.022);if(mode===8&&s%2===0)tn('square',mf(r+24+[0,4,7,12,7,4,0,7][(s>>1)&7]),at,SD*1.6,.02)}
  if(mode===3||mode===7){if(s===0)tn('sawtooth',mf(r-24),at,SD*15,.06);if(s%8===2)tn('sine',mf(r+24+(bar%2?1:0)),at,SD*7,.03);if(s%4===2)nz(at,.35,.025,'bandpass',500,260);if(mode===7){if(s===8)tn('sine',mf(r+18),at,SD*7,.03);if(s===0||s===3)tn('sine',60,at,.3,.25,30)}}
  if(mode===5){if(s%4===0)tn('sine',mf(r+24+[0,q,7,12][(s>>2)&3]),at,SD*8,.026);if(s===0)nz(at,SD*14,.03,'bandpass',900,1500)}}
function aTick(){if(!AC)return;while(nextT<AC.currentTime+.4){step(stp++,nextT);nextT+=SD}}
function aStart(){aInit();fired=0;stp=0;mode=0;if(AC){nextT=AC.currentTime+.1;seq=setInterval(aTick,40)}}
function aFrame(t){mode=t<4?0:t<S2?1:t<S3?2:t<S4?3:t<S5?4:t<S6?5:t<S7?6:t<S8?7:t<TA?8:2;SD=60/(mode===6?112:mode===8?92:mode===5?68:76)/4;while(fired<EV.length&&EV[fired][0]<=t){sfx(EV[fired][1]);fired++}}
function aStop(){clearInterval(seq);if(AC){try{mg.gain.linearRampToValueAtTime(0,AC.currentTime+.4);const a=AC;setTimeout(()=>{try{a.close()}catch(e){}},600)}catch(e){}AC=null}}
function setMute(m){muted=m;if(mg)mg.gain.value=m?0:.55;document.getElementById('siMute').textContent=m?'♪ SOUND OFF [M]':'♪ SOUND ON [M]'}
/* ===== intro runtime ===== */
const root=document.getElementById('storyIntro'),wrap=document.getElementById('siWrap');
const TEND=TA+4,END=TA+5;let raf=0,t0=0,active=false,done=null;
function frame(ts){if(!active)return;if(!t0)t0=ts;const rt=(ts-t0)/1000;const tt=Math.min(rt,TEND);render(tt);aFrame(tt);
  if(rt>=END-1&&!root.classList.contains('fade'))root.classList.add('fade');
  if(rt>=END){finish();return}raf=requestAnimationFrame(frame)}
function finish(){if(!active)return;active=false;cancelAnimationFrame(raf);removeEventListener('keydown',onKey,true);removeEventListener('resize',fit);
  root.classList.add('hidden');root.classList.remove('fade');cap.textContent='';aStop();const cb=done;done=null;if(cb)cb()}
function onKey(e){const k=(e.key||'').toLowerCase();if(k===' '||k==='enter'||k==='escape'){e.preventDefault();e.stopPropagation();finish()}else if(k==='m'){e.stopPropagation();setMute(!muted)}}
function fit(){wrap.style.setProperty('--u',(wrap.clientWidth/320)+'px')}
document.getElementById('siSkip').addEventListener('click',finish);document.getElementById('siMute').addEventListener('click',()=>setMute(!muted));
function play(clsKey,cb){
  cls=Object.assign({name:'Hero',color:'#c0392b',accent:'#c8a040'},CLASSES[clsKey]||{});
  const ok=c=>/^#[0-9a-f]{6}$/i.test(c||''),c=ok(cls.color)?cls.color:'#c0392b';
  HC={c:c,d:mix(c,'#000000',.4),l:mix(c,'#ffffff',.28),a:ok(cls.accent)?cls.accent:'#c8a040'};
  ctx.imageSmoothingEnabled=false;done=cb;active=true;t0=0;aStart();setMute(muted);
  document.getElementById('menu').classList.add('hidden');root.classList.remove('hidden','fade');fit();addEventListener('resize',fit);
  addEventListener('keydown',onKey,true);raf=requestAnimationFrame(frame)}
const core=window.__coreStart||window.startGame;window.__coreStart=core;
window.startGame=function(k){try{play(k,()=>core(k))}catch(e){console.error('intro failed',e);root.classList.add('hidden');core(k)}};
window.__introTest={play,render};
})();
