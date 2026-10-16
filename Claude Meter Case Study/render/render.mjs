import { chromium } from '/Users/lokalaw/.hermes/hermes-agent/node_modules/playwright-core/index.mjs';
import fs from 'fs'; import { execFileSync } from 'child_process';
const UI = 'file:///Users/lokalaw/Desktop/Claude%20Meter/ui/';
const OUT = '/Users/lokalaw/Desktop/Claude Meter/Claude Meter Case Study/assets';
const FF = '/Users/lokalaw/.hermes/tools/ffmpeg-9.0.1-darwin-arm64/ffmpeg';
const FPS = 24, W = 600, H = 450;
fs.rmSync(OUT, { recursive: true, force: true }); fs.mkdirSync(OUT, { recursive: true });
const b = await chromium.launch({ channel: 'chrome' });

// The "world": dark ink with a faint pixel-dot grid. Card sits centred (or anchored) in it.
const WORLD = `
html{background:#0B0A12 radial-gradient(#1D1A2D 1.5px,transparent 1.6px) 0 0/16px 16px !important;overflow:hidden}
body{background:transparent !important;overflow:hidden}
.card{top:50% !important;left:50% !important;transform:translate(-50%,-50%) !important}
canvas,.card{image-rendering:pixelated}`;

const H3 = 3600e3;
const data = (o) => { const now = Date.now(); return { now, plan:'Pro', syncedAt: now-12*60e3, live:true, liveAt: now-20e3, theme:'dark', mini:false,
  session:{ kind:'session', known:true, idle:false, percentUsed:23, startsAt:now-2.5*H3, resetsAt:now+2.5*H3, ...(o.session||{}) },
  weekly:{ kind:'weekly', known:true, percentUsed:40, startsAt:now-5*24*H3, resetsAt:now+2*24*H3 }, ...(o.top||{}) }; };
const STATES = {
  ok:{ percentUsed:23 }, close:{ percentUsed:46 },
  warn:{ percentUsed:71, emptyAt:'+1.2' }, out:{ percentUsed:100, startsAt:'-4', resetsAt:'+1' } };
const mk = (name, extra={}) => { const s = STATES[name]; const now=Date.now(); const session={...s};
  if (session.emptyAt) session.emptyAt = now+1.2*H3; if (session.startsAt) session.startsAt = now-4*H3; if (session.resetsAt) session.resetsAt = now+1*H3; return data({session, ...extra}); };

async function page(url, css = WORLD) {
  const ctx = await b.newContext({ viewport:{width:W,height:H}, deviceScaleFactor:2, reducedMotion:'no-preference' });
  const p = await ctx.newPage();
  await p.clock.install({ time: Date.now() });
  await p.goto(url); if (css) await p.addStyleTag({ content: css });
  await p.evaluate(() => document.fonts.ready); await p.clock.runFor(600);
  return p;
}
async function film(name, p, seconds, onFrame) {
  const dir = `${OUT}/.f-${name}`; fs.mkdirSync(dir, { recursive:true });
  const n = Math.round(seconds*FPS);
  for (let i=0;i<n;i++) {
    if (onFrame) await onFrame(i/FPS, i);
    await p.screenshot({ path:`${dir}/${String(i).padStart(4,'0')}.png` });
    await p.clock.runFor(1000/FPS);
  }
  execFileSync(FF, ['-y','-framerate',String(FPS),'-i',`${dir}/%04d.png`,'-c:v','libx264','-preset','slower','-crf','22','-pix_fmt','yuv420p','-movflags','+faststart','-an',`${OUT}/${name}.mp4`], {stdio:'ignore'});
  fs.copyFileSync(`${dir}/0000.png`, `${OUT}/${name}.png`.replace('.png','-poster.png'));
  fs.rmSync(dir, { recursive:true });
}

// 01 live: full card
{ const p = await page(UI+'index.html?state=ok'); await film('01-live', p, 4); await p.screenshot({path:`${OUT}/01-live.png`}); await p.context().close(); }

// 02 race: safe, close, caught, out — sequence
{ const p = await page(UI+'index.html?state=ok'); const seq=['ok','close','warn','out']; let cur=-1;
  await film('02-race', p, 6.4, async (t) => { const k = Math.min(3, Math.floor(t/1.6)); if (k!==cur){ cur=k; await p.evaluate(d=>window.meter.update(d), mk(seq[k])); } });
  for (const [i,s] of seq.entries()) { await p.evaluate(d=>window.meter.update(d), mk(s)); await p.clock.runFor(2500); await p.screenshot({path:`${OUT}/02-race-${i+1}-${s}.png`}); }
  await p.context().close(); }

// 03 bubble above the meter: thinking ×2, then done
{ const wrap = `data:text/html,` + encodeURIComponent(`<style>html,body{margin:0}iframe{position:absolute;border:0;background:transparent}</style>
  <iframe id=m src="${UI}index.html?state=ok" style="left:0;top:0;width:600px;height:450px"></iframe>
  <iframe id=b src="${UI}bubble.html" style="left:0;top:0;width:360px;height:90px" allowtransparency></iframe>`);
  // simpler: two pages can't share a frame, so use file-based wrapper
  const html = `<!doctype html><meta charset=utf-8><style>html,body{margin:0;height:100%;background:#0B0A12;background-image:radial-gradient(#1D1A2D 1.5px,transparent 1.6px);background-size:16px 16px}
   iframe{position:absolute;border:0;background:transparent}</style>
   <iframe id=m src="${UI}index.html?state=ok" style="left:0;top:0;width:600px;height:450px"></iframe>
   <iframe id=b src="${UI}bubble.html" style="left:118px;top:0;width:360px;height:112px;transform-origin:0 100%;transform:scale(1.7)"></iframe>`;
  fs.writeFileSync('wrap03.html', html);
  const p = await page('file://'+process.cwd()+'/wrap03.html', ''); 
  const mf = p.frame({url:/index\.html/}), bf = p.frame({url:/bubble\.html/});
  await mf.addStyleTag({content:`html,body{background:transparent !important}.card{top:auto !important;left:50% !important;bottom:60px;transform:translateX(-50%) !important}`});
  await bf.addStyleTag({content:`html,body{background:transparent !important}`});
  // place bubble just over the card's top-left (card is 352 wide centred: left edge 124; top = 450-60-287 = 103)
  await p.evaluate(()=>{const f=document.getElementById('b');f.style.left='122px';f.style.top='-12px';});
  const show = (s,c,l) => bf.evaluate(([s,c,l])=>window.bubble.show(s,'dark','above',c,l),[s,c,l]);
  await show('working',2,'');
  const steps=[[0,'working',2,''],[2.4,'done',1,'Chat']]; let k=-1;
  await film('03-thinking-done', p, 4.8, async t=>{ const j=t>=2.4?1:0; if(j!==k){k=j; await show(steps[j][1],steps[j][2],steps[j][3]);} });
  await show('working',2,''); await p.clock.runFor(900); await p.screenshot({path:`${OUT}/03-thinking.png`});
  await show('done',1,'Chat'); await p.clock.runFor(900); await p.screenshot({path:`${OUT}/03-done.png`});
  await p.context().close(); }

// 04 mini strip in the corner of a desktop mock; it grows away from the edge when expanded
{ const css = `html,body{background:#0B0A12 !important}
  html{background:#0B0A12 !important}
  .card{top:auto !important;left:auto !important;right:28px;bottom:48px;transform:none !important}
  .desk{position:fixed;inset:0;pointer-events:none}
  .bar{position:absolute;left:0;right:0;top:0;height:22px;background:#141122;border-bottom:2px solid #2A2640}
  .bar i{position:absolute;top:7px;width:8px;height:8px;background:#2A2640}
  .win{position:absolute;left:36px;top:52px;width:330px;height:250px;border:2px solid #2A2640;background:#100E1C}
  .win b{display:block;height:20px;border-bottom:2px solid #2A2640}
  .win span{position:absolute;left:14px;height:8px;background:#1D1A2D}
  .dock{position:absolute;left:50%;transform:translateX(-50%);bottom:8px;width:230px;height:26px;background:#141122;border:2px solid #2A2640;display:flex;gap:6px;padding:4px;box-sizing:border-box}
  .dock i{flex:1;background:#2A2640}`;
  const p = await page(UI+'index.html?state=ok&mini=1', css);
  await p.evaluate(()=>{ const d=document.createElement('div'); d.className='desk'; d.innerHTML=
   '<div class=bar><i style="left:12px"></i><i style="left:28px"></i><i style="left:44px"></i><i style="right:12px"></i><i style="right:28px"></i></div>'+
   '<div class=win><b></b><span style="top:40px;width:200px"></span><span style="top:60px;width:260px"></span><span style="top:80px;width:150px"></span><span style="top:120px;width:240px"></span><span style="top:140px;width:180px"></span></div>'+
   '<div class=dock>'+'<i></i>'.repeat(7)+'</div>'; document.body.prepend(d); });
  await p.clock.runFor(300);
  let cur=-1;
  await film('04-stays-out-of-the-way', p, 5, async t => { const full = t>=1.8 && t<3.6; if (full!==cur){ cur=full; await p.evaluate(d=>window.meter.update(d), data({top:{mini:full}})); } });
  await p.evaluate(d=>window.meter.update(d), data({top:{mini:true}})); await p.clock.runFor(600);
  await p.screenshot({path:`${OUT}/04-mini-corner.png`}); await p.context().close(); }
await b.close(); console.log('done');
