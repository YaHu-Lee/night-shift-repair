import {Session} from './m0/Session.js';
const canvas=document.querySelector('#arena'),ctx=canvas.getContext('2d',{alpha:false}),session=new Session(),W=360,H=640;
const pause=document.querySelector('#pause'),banner=document.querySelector('#pauseBanner'),stats=document.querySelector('#stats'),status=document.querySelector('#status');
const tracked=new Set(), arrows=['ArrowLeft','ArrowRight','ArrowUp','ArrowDown'];
let pointer=null, origin=null, control=null, prev=0, report=0, intervals=[];
function clearInput(){pointer=null;origin=null;control=null;tracked.clear();session.resetInput();}
session.platform.onHide(clearInput);session.platform.onShow(clearInput);
function point(event){const r=canvas.getBoundingClientRect();return {x:(event.clientX-r.left)*W/r.width,y:(event.clientY-r.top)*H/r.height};}
canvas.addEventListener('pointerdown',event=>{const p=point(event); if(pointer!==null||p.y<H*.75||session.paused)return;pointer=event.pointerId;origin=p;control=p;canvas.setPointerCapture(pointer);});
canvas.addEventListener('pointermove',event=>{if(pointer===event.pointerId)control=point(event);});
for(const type of ['pointerup','pointercancel','lostpointercapture']) canvas.addEventListener(type,event=>{if(pointer===event.pointerId)clearInput();});
addEventListener('keydown',e=>{if(arrows.includes(e.key)){e.preventDefault();if(!session.paused)tracked.add(e.key);}});
addEventListener('keyup',e=>tracked.delete(e.key));
addEventListener('blur',()=>{clearInput();session.pause();});
pause.onclick=()=>{clearInput();if(session.paused)session.resume();else session.pause();};
document.querySelector('#save').onclick=()=>{status.textContent=session.save()?'已保存压力场景种子；恢复会从该场景起点开始。':'保存失败。';};
document.querySelector('#load').onclick=()=>{clearInput();status.textContent=session.load()?'已恢复检查点 · 点击继续。':'无有效检查点。';};
document.querySelector('#restart').onclick=()=>{clearInput();session.restart();session.resume();intervals=[];status.textContent='已用相同种子重开。';};
function draw(t){
 const delta=prev? t-prev:0;prev=t;
 if(!session.paused&&delta>0&&delta<250){intervals.push(delta);if(intervals.length>240)intervals.shift();}
 if(session.paused){pointer=null;origin=null;control=null;}
 else if(control&&origin){session.x=(control.x-origin.x)/34;session.y=(origin.y-control.y)/34;}
 else{session.x=Number(tracked.has('ArrowRight'))-Number(tracked.has('ArrowLeft'));session.y=Number(tracked.has('ArrowUp'))-Number(tracked.has('ArrowDown'));}
 session.advance(delta/1000);
 const world=session.world;
 ctx.fillStyle='#15262a';ctx.fillRect(0,0,W,H);
 ctx.strokeStyle='#263837';ctx.beginPath();for(let x=0;x<W;x+=32){ctx.moveTo(x,0);ctx.lineTo(x,H);}for(let y=0;y<H;y+=32){ctx.moveTo(0,y);ctx.lineTo(W,y);}ctx.stroke();
 ctx.fillStyle='#25414080';ctx.fillRect(0,H*.75,W,H*.25);
 for(const [objs,color,size] of [[world.pickups,'#74e7b0',4],[world.enemies,'#ed806c',8],[world.projectiles,'#ffd488',3],[ [world.player],'#eaf8ef',13]]){
  ctx.fillStyle=color;for(const obj of objs)ctx.fillRect(Math.round(obj.x-size/2),Math.round(H-obj.y-size/2),size,size);
 }
 if(origin&&control){ctx.strokeStyle='#92d5c8';ctx.lineWidth=2;ctx.beginPath();ctx.arc(origin.x,origin.y,34,0,Math.PI*2);ctx.moveTo(origin.x,origin.y);ctx.lineTo(control.x,control.y);ctx.stroke();ctx.lineWidth=1;}
 banner.hidden=!session.paused;pause.textContent=session.paused?'继续':'暂停';
 if(t-report>250){report=t;const sorted=[...intervals].sort((a,b)=>a-b),p95=sorted[Math.max(0,Math.ceil(sorted.length*.95)-1)];stats.textContent='Tick '+world.tick+' · '+world.enemies.length+'/'+world.projectiles.length+'/'+world.pickups.length+' · p95 '+(p95?.toFixed(1)??'–')+' ms';}
 requestAnimationFrame(draw);
}
requestAnimationFrame(draw);
