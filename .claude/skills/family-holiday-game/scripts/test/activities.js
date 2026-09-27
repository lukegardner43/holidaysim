// Run activities through the debug API and screenshot them mid-animation.
//   node activities.js index.html shots/prefix '[{"name":"bbq","id":"bbq","time":14,"tp":[22,14],"sim":3}]' [--phone] [--sound]
// Test fields: name, id (doAction id or "none"), time (hour), pre (JS run first, e.g. "VillaDebug.setScene('plaza')"),
//   tp:[x,z], yaw, sim (seconds to advance before the shot), cam:[px,py,pz,lx,ly,lz] (override camera), wait (ms), after (seconds to finish).
const {launch,url,PHONE,DESK,watch}=require('./_pw');
const [,,file,prefix,json,...flags]=process.argv;const tests=JSON.parse(json);
(async()=>{const b=await launch({sound:flags.includes('--sound')});const p=await b.newPage(flags.includes('--phone')?PHONE:DESK);p.setDefaultTimeout(120000);const errs=watch(p);
  await p.goto(url(file));await p.waitForTimeout(2500);
  if(flags.includes('--sound')){await p.mouse.click(8,(flags.includes('--phone')?770:590));await p.waitForTimeout(500);}   // bottom-left: away from the 🔊 button
  await p.evaluate(()=>{VillaDebug.start();document.getElementById('title').style.display='none';});
  for(const t of tests){
    const r=await p.evaluate(t=>{try{VillaDebug.cam(null);if(t.time!=null)VillaDebug.setTime(t.time);if(t.pre)eval(t.pre);if(t.tp)VillaDebug.tp(t.tp[0],t.tp[1],t.yaw);VillaDebug.sim(0.2);
      if(t.id&&t.id!=='none')VillaDebug.doAction({id:t.id});VillaDebug.sim(t.sim||0);if(t.cam)VillaDebug.cam(t.cam);return VillaDebug.state().scn;}catch(e){return 'ERR '+e.message;}},t);
    await p.waitForTimeout(t.wait||900);await p.screenshot({path:prefix+'_'+t.name+'.png',timeout:90000});console.log(t.name,'→',r);
    if(t.after)await p.evaluate(s=>{VillaDebug.cam(null);VillaDebug.sim(s);},t.after);}
  console.log(errs.length?errs.join('\n'):'no errors');await b.close();process.exit(errs.length?1:0);})();
