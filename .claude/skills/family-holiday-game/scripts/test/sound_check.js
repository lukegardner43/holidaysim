// Is there sound, at sensible levels, in each scene?   node sound_check.js index.html
// Measures RMS/peak of the master output via an analyser (VillaDebug.SND.tap). Aim: music RMS ~0.015-0.04, peaks < 0.8.
const {launch,url,watch}=require('./_pw');
(async()=>{const b=await launch({sound:true});const p=await b.newPage({viewport:{width:120,height:90}});p.setDefaultTimeout(120000);const errs=watch(p);
  await p.goto(url(process.argv[2]));await p.waitForTimeout(2500);await p.mouse.click(4,86);await p.waitForTimeout(2500);
  const m=async(label,setup)=>{await p.evaluate(setup);await p.waitForTimeout(3000);const r=await p.evaluate(async()=>{const S=VillaDebug.SND;if(!window.__tap)window.__tap=S.tap();const {an}=window.__tap,buf=new Float32Array(an.fftSize);let s=0,n=0,pk=0;const t0=performance.now();
    while(performance.now()-t0<4000){an.getFloatTimeDomainData(buf);for(const v of buf){s+=v*v;n++;pk=Math.max(pk,Math.abs(v));}await new Promise(r=>setTimeout(r,45));}return 'rms '+Math.sqrt(s/n).toFixed(4)+'  peak '+pk.toFixed(3)+'  '+JSON.stringify(S.state());});console.log(label.padEnd(16),r);};
  await m('title',"0");await m('main day',"VillaDebug.start();VillaDebug.setTime(14);");await m('main night',"VillaDebug.setTime(22.5);");
  console.log(errs.length?errs.join('\n'):'no errors');await b.close();})();
