// Screenshot the title screen on phone and desktop.   node title_shot.js index.html shots/title
const {launch,url,PHONE,DESK,watch}=require('./_pw');
(async()=>{const b=await launch();for(const [n,vp] of [['phone',PHONE],['desk',DESK]]){const p=await b.newPage(vp);p.setDefaultTimeout(120000);const errs=watch(p);
  await p.goto(url(process.argv[2],false));await p.waitForTimeout(4500);await p.screenshot({path:process.argv[3]+'_'+n+'.png'});console.log(n,errs.length?errs.join(' | '):'ok');await p.close();}await b.close();})();
