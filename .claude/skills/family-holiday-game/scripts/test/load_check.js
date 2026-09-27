// Does the game load without errors?   node load_check.js path/to/index.html
const {launch,url,watch}=require('./_pw');
(async()=>{const b=await launch();const p=await b.newPage();p.setDefaultTimeout(120000);const errs=watch(p);
  await p.goto(url(process.argv[2]));await p.waitForTimeout(4000);
  const msg=await p.evaluate(()=>{const e=document.getElementById('loadmsg');return e&&!e.classList.contains('hidden')?e.textContent:'loaded';});
  console.log('status:',msg);console.log(errs.length?errs.join('\n'):'no errors');await b.close();process.exit(errs.length||/Error/.test(msg)?1:0);})();
