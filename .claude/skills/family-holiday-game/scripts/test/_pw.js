// shared Playwright launcher: software WebGL (SwiftShader) so it runs headless in the cloud
let pw;try{pw=require('playwright');}catch(e){pw=require('/opt/node22/lib/node_modules/playwright');}
const path=require('path');
const ARGS=['--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader','--ignore-gpu-blocklist'];
async function launch(opts={}){return pw.chromium.launch({args:opts.sound?ARGS.concat(['--autoplay-policy=no-user-gesture-required']):ARGS});}
const url=(f,debug=true)=>'file://'+path.resolve(f)+(debug?'?debug':'');
const PHONE={viewport:{width:390,height:780},deviceScaleFactor:1.5,isMobile:true,hasTouch:true};
const DESK={viewport:{width:900,height:600}};
function watch(p){const errs=[];p.on('pageerror',e=>errs.push('pageerror: '+e.message));p.on('console',m=>{if(m.type()==='error'&&!/ERR_CERT|favicon/.test(m.text()))errs.push(m.text().slice(0,300));});return errs;}
module.exports={launch,url,PHONE,DESK,watch};
