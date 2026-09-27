<script>"use strict";
(function(){
const T = THREE;
let scene, cam, renderer, sun, hemi, clockObj;
let player, playerYaw=0;
// family: fam[id] = {id, def, p (person), mood, ...}; the player controls one adult, the rest are NPCs
const fam={};
let playerId='mum', playerP=null, kid=null;   // kid = the toddler's family entry (+ minder state)
let npcs=[];                                  // adult family entries the player isn't controlling
let photoMode=null;                           // plaza group-photo cinematic
let world, plaza, kidsRoom, terminal, cabin, wingview, landing;  // groups
let skyGroup, skyMat, envScene, pmrem, envRT=null, envT=-99, clouds=[];
let tucked=false;
let todsAsleep=false;
let bedtimeWarned=false, wakeupWarned=false;
let bedtimeEntry=false; // true when we entered bedroom to put toddlers down (vs. to wake them)
let scn='villa';
let started=false;

// ---- state ----
let vibes=0, timeOfDay=18.0, day=1, won=false, drunk=0;
let shellsTotal=0, orangesTotal=0;
let sunscreenApplied=false, sunburnWarned=false;
let playerAnim=null;
let donePool=false,doneLounge=false,donePaella=false,doneSangria=false,doneSunset=false;
let doneSauna=false,doneSea=false,doneIce=false,doneBBQ=false;
let doneJacuzzi=false,doneStargaze=false,doneNap=false;
const solids=[];             // {x,z,rx,rz} keep-out boxes (villa world)
const plazaSolids=[];        // keep-out boxes (plaza world)
const terminalSolids=[];     // keep-out boxes (airport terminal)
const spots=[];              // interaction points {x,z,r,id,label}
let collectibles=[];         // {mesh,type,x,z}
const hearts=[];

// ---- input ----
const keys={}, mv={x:0,z:0};
let actHeld=false, actEdge=false, handEdge=false;
let camYaw=Math.PI, camPitch=0, dragging=false, lastX=0, lastY=0;

// ---- HUD ----
const $=id=>document.getElementById(id);
function toast(m){const b=$('toasts');const t=document.createElement('div');t.className='toast';t.textContent=m;b.appendChild(t);setTimeout(()=>t.remove(),2700);}
function addV(n){vibes=Math.min(100,vibes+n);if(n>0&&SND.throttle('chime',0.6))SND.sfx('chime');}
// cheer the little one (only if they're with you) and give the player's own mood a lift
function cheer(a){
  if(playerP){const me=fam[playerId];me.mood=Math.min(100,me.mood+a*0.4);}
  if(!kid||todsAsleep||!kid.p.root.visible)return;
  if(Math.hypot(kid.p.root.position.x-player.position.x,kid.p.root.position.z-player.position.z)>16)return;
  kid.mood=Math.min(100,kid.mood+a);kid.hop=0.45;spawnHeart(kid.p.root.position.x,kid.p.root.position.z,kid.p.H+0.6);
}
const heartGeo=(()=>{const s=new T.Shape();s.moveTo(0,-0.5);s.bezierCurveTo(-0.15,-0.35,-0.55,-0.1,-0.55,0.18);s.bezierCurveTo(-0.55,0.45,-0.2,0.55,0,0.3);s.bezierCurveTo(0.2,0.55,0.55,0.45,0.55,0.18);s.bezierCurveTo(0.55,-0.1,0.15,-0.35,0,-0.5);
  const g=new T.ExtrudeGeometry(s,{depth:0.14,bevelEnabled:true,bevelThickness:0.06,bevelSize:0.05,bevelSegments:2,curveSegments:10});g.center();return g;})();
const heartMat=new T.MeshStandardMaterial({color:0xff4d7d,emissive:0xff2d6d,emissiveIntensity:0.45,roughness:0.35,transparent:true});
function spawnHeart(x,z,h){if(SND.throttle('pop',0.15))SND.sfx('pop');const g=new T.Group();const m=new T.Mesh(heartGeo,heartMat.clone());m.scale.setScalar(0.5);g.add(m);g.position.set(x+(Math.random()-0.5)*0.4,h||2.2,z);scene.add(g);hearts.push({grp:g,life:1.3});}

// ===================== INIT =====================
function init(){
  scene=new T.Scene();
  scene.background=new T.Color(0x0d1421);
  scene.fog=new T.FogExp2(0x9fcfe0,0.0006);

  cam=new T.PerspectiveCamera(55,innerWidth/innerHeight,0.1,16000);
  renderer=new T.WebGLRenderer({canvas:$('c'),antialias:true});
  renderer.setPixelRatio(Math.min(devicePixelRatio,2));
  renderer.setSize(innerWidth,innerHeight);
  renderer.shadowMap.enabled=true;renderer.shadowMap.type=T.PCFSoftShadowMap;
  renderer.outputEncoding=T.sRGBEncoding;
  renderer.toneMapping=T.ACESFilmicToneMapping;renderer.toneMappingExposure=1.05;

  // ---- shader sky dome (gradient + sun glow), also rendered into the PMREM environment map ----
  skyGroup=new T.Group();scene.add(skyGroup);
  skyMat=new T.ShaderMaterial({
    uniforms:{top:{value:new T.Color()},mid:{value:new T.Color()},hor:{value:new T.Color()},gnd:{value:new T.Color()},sunDir:{value:new T.Vector3(0,1,0)},sunCol:{value:new T.Color()},glow:{value:1}},
    vertexShader:'varying vec3 vDir;void main(){vDir=position;gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.0);}',
    fragmentShader:'uniform vec3 top,mid,hor,gnd,sunCol,sunDir;uniform float glow;varying vec3 vDir;\n'+
      'void main(){vec3 d=normalize(vDir);float h=d.y;vec3 c;\n'+
      'if(h>=0.0){float t=pow(h,0.5);c=mix(hor,mid,smoothstep(0.0,0.42,t));c=mix(c,top,smoothstep(0.42,1.0,t));}\n'+
      'else{c=mix(hor,gnd,smoothstep(0.0,0.1,-h));}\n'+
      'float s=max(dot(d,normalize(sunDir)),0.0);float hz=1.0-min(1.0,abs(h)*2.0);\n'+
      'c+=sunCol*(pow(s,5.0)*0.22*glow*(0.35+0.65*hz)+pow(s,40.0)*0.55*glow);\n'+
      'gl_FragColor=vec4(c,1.0);\n#include <encodings_fragment>\n}',
    side:T.BackSide,depthWrite:false,fog:false,toneMapped:false});
  const dome=new T.Mesh(new T.SphereGeometry(9000,32,16),skyMat);dome.renderOrder=-10;dome.frustumCulled=false;skyGroup.add(dome);scene.userData.dome=dome;
  envScene=new T.Scene();envScene.add(new T.Mesh(new T.SphereGeometry(50,32,16),skyMat));
  pmrem=new T.PMREMGenerator(renderer);
  // soft drifting clouds (canvas sprites)
  {const bl=[];for(let i=0;i<26;i++){const x=40+Math.random()*176,y=58+Math.random()*34-Math.abs(x-128)*0.12,rr=18+Math.random()*26;bl.push([x,y,0,rr,[[0,0.55],[1,0]]]);}
   const ct=radialTex(256,128,bl,[255,255,255]);
   for(let i=0;i<16;i++){const m=new T.SpriteMaterial({map:ct,transparent:true,depthWrite:false,fog:false,opacity:0.9});const s=new T.Sprite(m);
     const a=Math.random()<0.65?(Math.random()-0.5)*Math.PI:(Math.random()*2-1)*Math.PI,d=2600+Math.random()*3200;s.position.set(Math.sin(a)*d,380+Math.random()*700,-Math.cos(a)*d);
     const sc=900+Math.random()*1300;s.scale.set(sc,sc*0.45,1);s.renderOrder=-5;skyGroup.add(s);clouds.push(s);}}

  // visible sun disk
  const sunMesh=new T.Mesh(new T.SphereGeometry(85,16,16),new T.MeshBasicMaterial({color:0xfffde0,fog:false}));
  const sunGlow=new T.Mesh(new T.SphereGeometry(150,12,12),new T.MeshBasicMaterial({color:0xffaa30,transparent:true,opacity:0.22,fog:false}));
  sunMesh.add(sunGlow);skyGroup.add(sunMesh);scene.userData.sunMesh=sunMesh;
  // visible moon: billboard plane with canvas crescent (destination-out erases shadow portion)
  {const cv=document.createElement('canvas');cv.width=256;cv.height=256;const cx=cv.getContext('2d');
  cx.fillStyle='#f0f0e8';cx.beginPath();cx.arc(128,128,110,0,Math.PI*2);cx.fill();
  cx.globalCompositeOperation='destination-out';
  cx.beginPath();cx.arc(208,128,130,0,Math.PI*2);cx.fill(); // offset circle erases right portion — radius controls crescent thickness
  cx.globalCompositeOperation='source-over';
  const moonTex=new T.CanvasTexture(cv);moonTex.generateMipmaps=false;moonTex.minFilter=T.LinearFilter;
  const moonMesh=new T.Mesh(new T.PlaneGeometry(160,160),new T.MeshBasicMaterial({map:moonTex,transparent:true,fog:false,depthWrite:false}));
  moonMesh.renderOrder=2;
  const moonGlow=new T.Mesh(new T.SphereGeometry(115,12,12),new T.MeshBasicMaterial({color:0xb8c8e8,transparent:true,opacity:0.15,fog:false,depthWrite:false}));
  moonGlow.renderOrder=1;moonMesh.add(moonGlow);
  moonMesh.visible=false;skyGroup.add(moonMesh);scene.userData.moonMesh=moonMesh;}
  // star field
  {const n=2000,sp=new Float32Array(n*3);for(let i=0;i<n;i++){const th=Math.random()*Math.PI*2,v=Math.random(),ph=Math.acos(1-v),r=7600;sp[i*3]=r*Math.sin(ph)*Math.cos(th);sp[i*3+1]=r*Math.cos(ph);sp[i*3+2]=r*Math.sin(ph)*Math.sin(th);}
  const sg=new T.BufferGeometry();sg.setAttribute('position',new T.BufferAttribute(sp,3));
  const sf=new T.Points(sg,new T.PointsMaterial({color:0xffffff,size:2,sizeAttenuation:false,fog:false,transparent:true,depthWrite:false}));
  sf.visible=false;skyGroup.add(sf);scene.userData.stars=sf;}
  hemi=new T.HemisphereLight(0xcfeaff,0xd8b483,0.4);scene.add(hemi);
  sun=new T.DirectionalLight(0xfff1d6,1.25);
  sun.position.set(40,60,20);sun.castShadow=true;
  sun.shadow.mapSize.set(2048,2048);
  const s=58;sun.shadow.camera.left=-s;sun.shadow.camera.right=s;sun.shadow.camera.top=s;sun.shadow.camera.bottom=-s;
  sun.shadow.camera.near=1;sun.shadow.camera.far=320;sun.shadow.bias=-0.0003;sun.shadow.normalBias=0.03;
  scene.add(sun);scene.add(sun.target);

  buildVillaWorld();
  buildPlaza();
  buildTerminal();
  buildCabin();
  buildWingview();
  buildLanding();
  buildFamily();
  buildNav();

  bindInput();
  addEventListener('resize',onResize);
  $('loadmsg').classList.add('hidden');
  $('title').classList.remove('hidden');document.body.classList.add('ontitle');
  // family HUD — one face per member, lights up when they're happy
  const td=$('tods');FAMILY_ORDER.forEach(id=>{const sp=document.createElement('span');sp.className='tod';sp.textContent=FAMILY[id].emoji;sp.title=FAMILY[id].name;sp.dataset.id=id;td.appendChild(sp);});
  buildPicker();
  linearizeScene();
  applyTime();refreshEnv(true);
  warmUp();
}
// compile every scene's shaders and push the large canvas textures to the GPU up front, so the intro
// shots and the Seville/airport scenes don't stall (and jump) the first time they appear
function warmUp(){
  const groups=[world,plaza,terminal,cabin,wingview,landing,kidsRoom],vis=groups.map(g=>g.visible);
  groups.forEach(g=>g.visible=true);
  try{renderer.compile(scene,cam);}catch(e){}
  const seen=new Set();scene.traverse(o=>{if(!o.material)return;(Array.isArray(o.material)?o.material:[o.material]).forEach(m=>{['map','normalMap','bumpMap','emissiveMap'].forEach(k=>{const t=m[k];if(t&&!seen.has(t)){seen.add(t);if(renderer.initTexture)renderer.initTexture(t);}});});});
  groups.forEach((g,i)=>g.visible=vis[i]);
}
// world colours were authored as sRGB hex: convert every material once so they render true to swatch
function linearizeScene(){const done=new Set(Object.values(_mat));
  scene.traverse(o=>{if(o.isInstancedMesh&&o.instanceColor&&!o.userData.lin){o.userData.lin=true;const a=o.instanceColor.array;for(let i=0;i<a.length;i++)a[i]=Math.pow(a[i],2.2);o.instanceColor.needsUpdate=true;}
    if(o.geometry&&o.geometry.attributes.color&&o.material&&o.material.vertexColors&&!o.geometry.userData.lin&&o.material!==_mat.bakedM){o.geometry.userData.lin=true;const a=o.geometry.attributes.color.array;for(let i=0;i<a.length;i++)a[i]=Math.pow(a[i],2.2);o.geometry.attributes.color.needsUpdate=true;}
    if(!o.material)return;(Array.isArray(o.material)?o.material:[o.material]).forEach(m=>{if(done.has(m)||m.isShaderMaterial)return;done.add(m);
      if(m.color&&!m.vertexColors)m.color.convertSRGBToLinear();if(m.emissive)m.emissive.convertSRGBToLinear();});});
  heartMat.color.convertSRGBToLinear();heartMat.emissive.convertSRGBToLinear();}

// ---- material helper ----
const mat=(c,opts={})=>new T.MeshStandardMaterial(Object.assign({color:c,roughness:0.85,metalness:0.0},opts));
function box(w,h,d,c,opts){const m=new T.Mesh(new T.BoxGeometry(w,h,d),mat(c,opts));m.castShadow=true;m.receiveShadow=true;return m;}
function cyl(rt,rb,h,c,seg=16){const m=new T.Mesh(new T.CylinderGeometry(rt,rb,h,seg),mat(c));m.castShadow=true;m.receiveShadow=true;return m;}

// ---- procedural textures (realism pass) ----
// Soft see-through textures are computed in JS rather than drawn on a canvas: iPhone Safari's
// anti-fingerprinting adds noise to canvas pixels, which speckles faint gradients (clouds, shadows, steam).
// blobs: [cx, cy, r0, r1, [[t, alpha], ...]] in canvas coordinates (y down), composited source-over.
function radialTex(w,h,blobs,rgb){const A=new Float32Array(w*h);
  blobs.forEach(([bx,by,r0,r1,st])=>{const x0=Math.max(0,Math.floor(bx-r1)),x1=Math.min(w-1,Math.ceil(bx+r1)),y0=Math.max(0,Math.floor(by-r1)),y1=Math.min(h-1,Math.ceil(by+r1));
    for(let y=y0;y<=y1;y++)for(let x=x0;x<=x1;x++){let t=(Math.hypot(x+0.5-bx,y+0.5-by)-r0)/(r1-r0);t=t<0?0:t>1?1:t;let a=st[st.length-1][1];
      for(let k=1;k<st.length;k++)if(t<=st[k][0]){const u=(t-st[k-1][0])/((st[k][0]-st[k-1][0])||1);a=st[k-1][1]+(st[k][1]-st[k-1][1])*u;break;}
      const i=(h-1-y)*w+x;A[i]=a+A[i]*(1-a);}});
  const d=new Uint8Array(w*h*4);for(let i=0;i<w*h;i++){d[i*4]=rgb[0];d[i*4+1]=rgb[1];d[i*4+2]=rgb[2];d[i*4+3]=Math.round(A[i]*255);}
  const t=new T.DataTexture(d,w,h,T.RGBAFormat);t.magFilter=T.LinearFilter;t.minFilter=T.LinearMipmapLinearFilter;t.generateMipmaps=true;t.needsUpdate=true;return t;}
function _speck(c,s,n,amp,dot){for(let i=0;i<n;i++){const a=(Math.random()*amp)/255;c.fillStyle=Math.random()>0.5?'rgba(255,255,255,'+a+')':'rgba(0,0,0,'+a+')';c.fillRect(Math.random()*s,Math.random()*s,dot,dot);}}
function mkTex(draw,rx,ry){const s=256,cv=document.createElement('canvas');cv.width=cv.height=s;const c=cv.getContext('2d');draw(c,s);const t=new T.CanvasTexture(cv);t.wrapS=t.wrapT=T.RepeatWrapping;t.repeat.set(rx,ry);t.encoding=T.sRGBEncoding;t.anisotropy=4;return t;}
// merge static opaque meshes that share a material into one draw call each (keeps world transforms, geometry groups, mirrored parts)
const matSig=m=>[m.type,m.color&&m.color.getHexString(),m.roughness,m.metalness,m.map&&m.map.uuid,m.bumpMap&&m.bumpMap.uuid,m.bumpScale,m.normalMap&&m.normalMap.uuid,m.emissive&&m.emissive.getHexString(),m.emissiveIntensity,m.emissiveMap&&m.emissiveMap.uuid,m.side,m.flatShading,m.clearcoat,m.envMapIntensity,m.alphaTest,m.fog,m.depthWrite,m.polygonOffset].join('|');
function mergeStatic(root,skip){
  root.updateMatrixWorld(true);const inv=new T.Matrix4().copy(root.matrixWorld).invert();
  const buckets=new Map(),victims=[];
  const skipped=o=>{for(let p=o;p&&p!==root;p=p.parent)if(skip&&skip.has(p))return true;return false;};
  root.traverse(o=>{if(!o.isMesh||o.isInstancedMesh||!o.visible||skipped(o))return;const g=o.geometry;if(!g||g.attributes.color||!g.attributes.normal)return;
    const mats=Array.isArray(o.material)?o.material:[o.material];if(mats.some(m=>m.transparent||m.isShaderMaterial))return;
    const ng=g.index?g.toNonIndexed():g,m4=new T.Matrix4().multiplyMatrices(inv,o.matrixWorld);
    const groups=Array.isArray(o.material)&&ng.groups.length?ng.groups:[{start:0,count:ng.attributes.position.count,materialIndex:0}];
    groups.forEach(gr=>{const mat=mats[gr.materialIndex]||mats[0],key=matSig(mat)+(o.castShadow?'s':'')+(o.receiveShadow?'r':'');
      if(!buckets.has(key))buckets.set(key,{mat,cast:o.castShadow,recv:o.receiveShadow,parts:[]});buckets.get(key).parts.push({g:ng,m4,start:gr.start,count:Math.min(gr.count,ng.attributes.position.count-gr.start)});});
    victims.push(o);});
  const v=new T.Vector3(),nm=new T.Matrix3();
  buckets.forEach(b=>{let n=0;b.parts.forEach(q=>n+=q.count-q.count%3);
    const P=new Float32Array(n*3),N=new Float32Array(n*3),U=new Float32Array(n*2);let o=0;
    b.parts.forEach(q=>{nm.getNormalMatrix(q.m4);const flip=q.m4.determinant()<0,pa=q.g.attributes.position,na=q.g.attributes.normal,ua=q.g.attributes.uv;
      for(let t=q.start;t+2<q.start+q.count;t+=3){const ord=flip?[0,2,1]:[0,1,2];for(const k of ord){const i=t+k;
        v.fromBufferAttribute(pa,i).applyMatrix4(q.m4);P[o*3]=v.x;P[o*3+1]=v.y;P[o*3+2]=v.z;
        v.fromBufferAttribute(na,i).applyMatrix3(nm).normalize();N[o*3]=v.x;N[o*3+1]=v.y;N[o*3+2]=v.z;
        if(ua){U[o*2]=ua.getX(i);U[o*2+1]=ua.getY(i);}o++;}}});
    const g=new T.BufferGeometry();g.setAttribute('position',new T.BufferAttribute(P,3));g.setAttribute('normal',new T.BufferAttribute(N,3));g.setAttribute('uv',new T.BufferAttribute(U,2));
    const me=new T.Mesh(g,b.mat);me.castShadow=b.cast;me.receiveShadow=b.recv;root.add(me);});
  victims.forEach(o=>o.parent&&o.parent.remove(o));
  return victims.length;}
const mkTexG=(d,rx,ry)=>mkTex(d,rx,ry);
function rep(t,x,y){const c=t.clone();c.needsUpdate=true;c.repeat.set(x,y);return c;}
const sandT=mkTex((c,s)=>{c.fillStyle='#e7d2a0';c.fillRect(0,0,s,s);_speck(c,s,4200,55,2);_speck(c,s,600,85,3);},1,1);
const grassT=mkTex((c,s)=>{c.fillStyle='#8fae58';c.fillRect(0,0,s,s);const gs=['#7c9c49','#9dbb66','#86a850','#a8c470','#6e8f40'];for(let i=0;i<5200;i++){c.strokeStyle=gs[i%5];c.globalAlpha=0.4+Math.random()*0.6;c.lineWidth=1;const x=Math.random()*s,y=Math.random()*s,l=2+Math.random()*4;c.beginPath();c.moveTo(x,y);c.lineTo(x+(Math.random()-0.5)*2,y-l);c.stroke();}c.globalAlpha=1;},1,1);
const tileT=mkTex((c,s)=>{c.fillStyle='#ddceb2';c.fillRect(0,0,s,s);_speck(c,s,2400,24,2);c.strokeStyle='rgba(96,80,58,0.5)';c.lineWidth=2;const st=s/4;for(let i=0;i<=4;i++){c.beginPath();c.moveTo(i*st,0);c.lineTo(i*st,s);c.stroke();c.beginPath();c.moveTo(0,i*st);c.lineTo(s,i*st);c.stroke();}},1,1);
const stucT=mkTex((c,s)=>{c.fillStyle='#808080';c.fillRect(0,0,s,s);_speck(c,s,7500,28,1);},4,2);
// tileable ripple normal map (water surfaces)
const rippleN=(()=>{const n=128,cv=document.createElement('canvas');cv.width=cv.height=n;const c=cv.getContext('2d');const img=c.createImageData(n,n);
  const h=(x,y)=>{const u=x/n*Math.PI*2,v=y/n*Math.PI*2;return Math.sin(u*3+Math.sin(v*2)*1.2)*0.5+Math.sin(v*4+u)*0.35+Math.sin((u+v)*5)*0.2+Math.sin(u*7-v*3)*0.12+Math.sin(u*2-v*6)*0.1;};
  for(let y=0;y<n;y++)for(let x=0;x<n;x++){const dx=(h(x+1,y)-h(x-1,y))*6,dy=(h(x,y+1)-h(x,y-1))*6,l=Math.hypot(dx,dy,1),i=(y*n+x)*4;
    img.data[i]=(-dx/l*0.5+0.5)*255;img.data[i+1]=(-dy/l*0.5+0.5)*255;img.data[i+2]=(1/l*0.5+0.5)*255;img.data[i+3]=255;}
  c.putImageData(img,0,0);const t=new T.CanvasTexture(cv);t.wrapS=t.wrapT=T.RepeatWrapping;return t;})();
// tileable caustic web (voronoi edges) for the pool floor
const causticT=(()=>{const n=128,cv=document.createElement('canvas');cv.width=cv.height=n;const c=cv.getContext('2d');const img=c.createImageData(n,n);
  const pts=[];for(let i=0;i<20;i++)pts.push([Math.random()*n,Math.random()*n]);
  for(let y=0;y<n;y++)for(let x=0;x<n;x++){let f1=1e9,f2=1e9;for(const p of pts){let dx=Math.abs(x-p[0]),dy=Math.abs(y-p[1]);dx=Math.min(dx,n-dx);dy=Math.min(dy,n-dy);const d=Math.hypot(dx,dy);if(d<f1){f2=f1;f1=d;}else if(d<f2)f2=d;}
    const v=Math.max(0,1-(f2-f1)/5.5);const b=Math.pow(v,2.2)*255,i=(y*n+x)*4;img.data[i]=b;img.data[i+1]=b;img.data[i+2]=b;img.data[i+3]=255;}
  c.putImageData(img,0,0);const t=new T.CanvasTexture(cv);t.wrapS=t.wrapT=T.RepeatWrapping;return t;})();
// small glass-mosaic pool tiles
const poolTileT=mkTex((c,s)=>{const n=16,st=s/n;for(let y=0;y<n;y++)for(let x=0;x<n;x++){const k=Math.random();c.fillStyle=k<0.12?'#4fb8cf':k<0.5?'#7fd3e2':k<0.85?'#95dcea':'#b8ecf4';c.fillRect(x*st,y*st,st,st);}
  c.strokeStyle='rgba(235,250,252,0.85)';c.lineWidth=1.5;for(let i=0;i<=n;i++){c.beginPath();c.moveTo(i*st,0);c.lineTo(i*st,s);c.stroke();c.beginPath();c.moveTo(0,i*st);c.lineTo(s,i*st);c.stroke();}},1,1);
// warm travertine deck slabs
const deckT=mkTex((c,s)=>{c.fillStyle='#e9dcc0';c.fillRect(0,0,s,s);_speck(c,s,3000,20,2);for(let i=0;i<60;i++){c.strokeStyle='rgba(170,140,100,'+(0.05+Math.random()*0.08)+')';c.lineWidth=1;c.beginPath();const y=Math.random()*s;c.moveTo(0,y);c.bezierCurveTo(s*0.3,y+Math.random()*8-4,s*0.6,y+Math.random()*8-4,s,y);c.stroke();}
  c.strokeStyle='rgba(120,100,70,0.45)';c.lineWidth=2;for(let i=0;i<=2;i++){c.beginPath();c.moveTo(0,i*s/2);c.lineTo(s,i*s/2);c.stroke();}c.beginPath();c.moveTo(s/2,0);c.lineTo(s/2,s/2);c.stroke();c.beginPath();c.moveTo(0,s/2);c.lineTo(0,s);c.stroke();c.beginPath();c.moveTo(s*0.999,s/2);c.lineTo(s*0.999,s);c.stroke();},1,1);
// radial stripes for beach parasol canopies
function stripeT(a,b){const cv=document.createElement('canvas');cv.width=128;cv.height=16;const c=cv.getContext('2d');for(let i=0;i<8;i++){c.fillStyle=i%2?b:a;c.fillRect(i*16,0,16,16);}const t=new T.CanvasTexture(cv);t.encoding=T.sRGBEncoding;return t;}

// ---- realistic palm: curved segmented trunk + alpha-tested drooping fronds ----
const frondT=(()=>{const cv=document.createElement('canvas');cv.width=128;cv.height=256;const c=cv.getContext('2d');
  c.strokeStyle='#4f7a3a';c.lineWidth=5;c.beginPath();c.moveTo(64,4);c.lineTo(64,252);c.stroke();
  const gs=['#57853f','#4b7636','#63924a','#5d8a44'];
  for(let i=0;i<22;i++){const y=10+i*11;const len=54*(1-Math.abs(i/22-0.4)*0.75);
    c.strokeStyle=gs[i%4];c.lineWidth=5.5;
    c.beginPath();c.moveTo(64,y);c.lineTo(64-len,y+15);c.stroke();
    c.beginPath();c.moveTo(64,y);c.lineTo(64+len,y+15);c.stroke();}
  const t=new T.CanvasTexture(cv);t.encoding=T.sRGBEncoding;return t;})();
const frondGeo=(()=>{const g=new T.PlaneGeometry(1.5,4.4,1,8);g.translate(0,2.2,0);g.rotateX(Math.PI/2);
  const p=g.attributes.position;for(let i=0;i<p.count;i++){const d=p.getZ(i);p.setY(i,p.getY(i)-d*d*0.075);}
  g.computeVertexNormals();return g;})();
const frondMat=new T.MeshStandardMaterial({map:frondT,transparent:true,alphaTest:0.35,side:T.DoubleSide,roughness:0.9});
function tree(x,z){const g=new T.Group();
  const tm=mat(0x8c7a62,{roughness:1});
  let lean=0.5+Math.random()*0.6, crx=0, cry=0;
  for(let i=0;i<6;i++){const r0=0.34-i*0.022;
    const seg=new T.Mesh(new T.CylinderGeometry(r0-0.02,r0,1.05,8),tm);
    crx=lean*0.028*i*i;cry=0.55+i*0.96;
    seg.position.set(crx,cry,0);seg.rotation.z=-lean*0.055*i;seg.castShadow=true;seg.receiveShadow=true;g.add(seg);}
  const crown=new T.Group();crown.position.set(crx,cry+0.55,0);g.add(crown);
  for(let i=0;i<8;i++){const f=new T.Mesh(frondGeo,frondMat);
    f.rotation.y=i*(Math.PI/4)+Math.random()*0.4;
    f.rotation.x=-0.5+(i%3)*0.28+Math.random()*0.15;
    crown.add(f);}
  for(let i=0;i<3;i++){const co=new T.Mesh(new T.SphereGeometry(0.17,8,8),mat(0x5a3d22));const a=i*2.1;co.position.set(Math.cos(a)*0.3,-0.15,Math.sin(a)*0.3);co.castShadow=true;crown.add(co);}
  g.position.set(x,0,z);g.rotation.y=Math.random()*Math.PI*2;return g;}

// modern pool lounger: slim aluminium frame, thick cushion, raised backrest, own parasol
function lounger(x,z,rot){const g=new T.Group();
  const fm=mat(0xf2f2ee,{roughness:0.35,metalness:0.4}),cu=mat(0xeee6d6,{roughness:0.95});
  [[-0.48],[0.48]].forEach(p=>{const rail=box(0.07,0.07,2.2,0xf2f2ee,{roughness:0.35,metalness:0.4});rail.position.set(p[0],0.36,0);g.add(rail);
    [-1.0,0.95].forEach(zz=>{const lg=box(0.07,0.36,0.07,0xf2f2ee,{roughness:0.35,metalness:0.4});lg.position.set(p[0],0.18,zz);g.add(lg);});});
  const seat=box(0.95,0.16,1.35,0xeee6d6,{roughness:0.95});seat.position.set(0,0.47,0.4);g.add(seat);
  const bk=new T.Group();bk.position.set(0,0.47,-0.28);bk.rotation.x=-0.82;g.add(bk);
  const bc=box(0.95,0.16,0.95,0xeee6d6,{roughness:0.95});bc.position.set(0,0,-0.47);bk.add(bc);
  const pil=box(0.6,0.14,0.28,0xc2562f,{roughness:0.9});pil.position.set(0,0.13,-0.72);bk.add(pil);
  const tw=box(0.7,0.03,1.0,0xf6f1e6,{roughness:1});tw.position.set(0,0.56,0.5);g.add(tw);
  g.add(parasol(1.05,0,0xf2e8d2));
  g.position.set(x,0,z);g.rotation.y=rot||0;return g;}
// parasol: pole, 8-panel canopy with a scalloped valance and finial
function parasol(x,z,col,tex){const g=new T.Group();
  const pole=cyl(0.045,0.05,2.9,0xd9d2c4,8);pole.position.y=1.45;g.add(pole);
  const cm=tex?new T.MeshStandardMaterial({map:tex,roughness:0.85,side:T.DoubleSide}):mat(col,{roughness:0.85,side:T.DoubleSide});
  const can=new T.Mesh(new T.ConeGeometry(1.7,0.62,8,1,true),cm);can.position.y=2.95;can.castShadow=true;g.add(can);
  const val=new T.Mesh(new T.CylinderGeometry(1.7,1.72,0.16,8,1,true),cm);val.position.y=2.58;g.add(val);
  const fin=new T.Mesh(new T.SphereGeometry(0.09,8,6),mat(0xd9d2c4));fin.position.y=3.3;g.add(fin);
  g.position.set(x,0,z);return g;}

// ---- rental car: extruded side profile with wheel arches, glasshouse with tumblehome, proper details ----
const carParts=(()=>{
  const body=new T.Shape();const arch=(cx,from,to,st)=>{for(let k=0;k<=10;k++){const a=from+(to-from)*k/10;body.lineTo(cx+Math.cos(a)*0.56,0.44+Math.sin(a)*0.56);}};
  body.moveTo(-2.5,0.42);body.lineTo(-2.2,0.36);arch(-1.62,Math.PI,0);body.lineTo(-1.06,0.33);body.lineTo(1.08,0.33);arch(1.64,Math.PI,0);
  body.lineTo(2.3,0.36);body.quadraticCurveTo(2.66,0.4,2.7,0.7);body.quadraticCurveTo(2.72,0.92,2.55,1.0);body.quadraticCurveTo(2.0,1.12,1.3,1.18);
  body.lineTo(-2.2,1.23);body.quadraticCurveTo(-2.55,1.22,-2.62,0.95);body.lineTo(-2.62,0.58);body.closePath();
  const bg=new T.ExtrudeGeometry(body,{depth:2.08,bevelEnabled:true,bevelThickness:0.12,bevelSize:0.1,bevelSegments:4,curveSegments:10});bg.translate(0,0,-1.04);bg.rotateY(-Math.PI/2);
  const gh=new T.Shape();gh.moveTo(1.32,1.16);gh.quadraticCurveTo(0.75,1.62,0.2,1.87);gh.lineTo(-1.55,1.93);gh.quadraticCurveTo(-1.9,1.92,-2.02,1.83);gh.lineTo(-2.42,1.24);gh.lineTo(1.32,1.16);
  const gg=new T.ExtrudeGeometry(gh,{depth:1.66,bevelEnabled:true,bevelThickness:0.08,bevelSize:0.07,bevelSegments:3,curveSegments:10});gg.translate(0,0,-0.83);gg.rotateY(-Math.PI/2);
  const tumble=(g)=>{const p=g.attributes.position;for(let k=0;k<p.count;k++){const y=p.getY(k);if(y>1.2)p.setX(k,p.getX(k)*(1-(y-1.2)*0.14));}g.computeVertexNormals();return g;};
  tumble(gg);
  const win=(pts)=>{const sh=new T.Shape();sh.moveTo(pts[0][0],pts[0][1]);for(let k=1;k<pts.length;k++)sh.lineTo(pts[k][0],pts[k][1]);sh.closePath();const g=new T.ShapeGeometry(sh);g.rotateY(-Math.PI/2);return g;};
  const wf=win([[1.14,1.25],[0.26,1.79],[-0.44,1.82],[-0.44,1.25]]),wr=win([[-0.6,1.25],[-0.6,1.83],[-1.5,1.87],[-1.84,1.73],[-1.98,1.28]]);
  const tyre=(()=>{const pts=[];for(let k=0;k<=8;k++){const a=-Math.PI/2+k/8*Math.PI;pts.push(new T.Vector2(0.36+Math.cos(a)*0.08,Math.sin(a)*0.15));}pts.unshift(new T.Vector2(0.27,-0.15));pts.push(new T.Vector2(0.27,0.15));const g=new T.LatheGeometry(pts,22);g.rotateZ(Math.PI/2);return g;})();
  return {bg,gg,wf,wr,tyre};})();
const plateTex=(()=>{const cv=document.createElement('canvas');cv.width=256;cv.height=56;const c=cv.getContext('2d');c.fillStyle='#fbfbf6';c.fillRect(0,0,256,56);c.fillStyle='#1d3f9e';c.fillRect(0,0,34,56);
  c.fillStyle='#f5d33a';c.font='bold 11px Arial';c.fillText('★',11,16);c.fillStyle='#fff';c.font='bold 18px Arial';c.fillText('E',10,48);c.fillStyle='#111';c.font='bold 36px Arial';c.fillText('4721 KMB',44,42);
  c.strokeStyle='#222';c.lineWidth=3;c.strokeRect(1.5,1.5,253,53);const t=new T.CanvasTexture(cv);t.encoding=T.sRGBEncoding;return t;})();
const carLinerGeo=new T.CylinderGeometry(0.55,0.55,1.9,18,1,true,0,Math.PI).rotateZ(Math.PI/2),carLinerMat=new T.MeshStandardMaterial({color:0x0a0a0b,roughness:1,side:T.DoubleSide});
function carMesh(col){const g=new T.Group();const P=carParts;
  const paint=new T.MeshPhysicalMaterial({color:col,roughness:0.32,metalness:0.55,clearcoat:1,clearcoatRoughness:0.07});
  const blk=mat(0x141518,{roughness:0.75}),trim=mat(0x24262a,{roughness:0.55}),chrome=mat(0xd8dde2,{roughness:0.18,metalness:1});
  const glass=new T.MeshPhysicalMaterial({color:0x0e1822,roughness:0.04,metalness:0.2,clearcoat:1,clearcoatRoughness:0.02,side:T.DoubleSide});
  const add=(geo,m,x,y,z,sh)=>{const me=new T.Mesh(geo,m);me.position.set(x||0,y||0,z||0);me.castShadow=sh!==false;me.receiveShadow=true;g.add(me);return me;};
  add(P.bg,paint);add(P.gg,paint);
  // glazing: side windows both sides (following the tumblehome), windscreen and hatch glass
  [1,-1].forEach(sd=>{[P.wf,P.wr].forEach(w=>{const m=add(w,glass,sd*1.078,0,0,false);m.rotation.z=sd*0.136;});});
  const pane=(w,h,cz,cy,nz,ny)=>{const n=new T.Vector3(0,ny,nz).normalize();const m=add(new T.PlaneGeometry(w,h),glass,0,cy+n.y*0.09,cz+n.z*0.09,false);m.quaternion.setFromUnitVectors(new T.Vector3(0,0,1),n);return m;};
  pane(1.56,1.2,0.78,1.53,0.62,0.86);pane(1.4,0.68,-2.22,1.55,-0.83,0.56);
  // wheels: tyre, five-spoke alloy, dark arch liners
  [[1.0,1.64],[-1.0,1.64],[1.0,-1.62],[-1.0,-1.62]].forEach(w=>{const wx=w[0]*0.98,wz=w[1];
    add(P.tyre,blk,wx,0.44,wz);const rim=add(new T.CylinderGeometry(0.29,0.29,0.26,20),chrome,wx+Math.sign(wx)*0.01,0.44,wz);rim.rotation.z=Math.PI/2;
    for(let k=0;k<5;k++){const sp=add(new T.BoxGeometry(0.06,0.5,0.07),trim,wx+Math.sign(wx)*0.14,0.44,wz,false);sp.rotation.x=k/5*Math.PI*2;}
    const hub=add(new T.CylinderGeometry(0.07,0.07,0.3,10),trim,wx+Math.sign(wx)*0.02,0.44,wz,false);hub.rotation.z=Math.PI/2;
    add(carLinerGeo,carLinerMat,0,0.44,wz,false);});
  // bumpers, sills, grille, lights, plates, mirrors, handles, rails
  [[0,0.44,2.62,2.2,0.22,0.22],[0,0.5,-2.6,2.2,0.28,0.2]].forEach(b=>add(new T.BoxGeometry(b[3],b[4],b[5]),trim,b[0],b[1],b[2]));
  [1,-1].forEach(sd=>{add(new T.BoxGeometry(0.08,0.12,2.1),trim,sd*1.16,0.4,0.01);});
  add(new T.BoxGeometry(1.05,0.2,0.08),blk,0,0.7,2.74,false);add(new T.BoxGeometry(1.5,0.14,0.08),blk,0,0.47,2.74,false);
  const hl=new T.MeshStandardMaterial({color:0xf4f6f8,emissive:0xfff4d8,emissiveIntensity:0.35,roughness:0.1,metalness:0.4});
  const tl=new T.MeshStandardMaterial({color:0xa01016,emissive:0xff2020,emissiveIntensity:0.35,roughness:0.2});
  [1,-1].forEach(sd=>{const h=add(new T.BoxGeometry(0.52,0.14,0.18),hl,sd*0.72,0.93,2.58,false);h.rotation.set(-0.35,sd*0.25,0);
    const d=add(new T.BoxGeometry(0.4,0.03,0.05),new T.MeshBasicMaterial({color:0xffffff}),sd*0.7,0.85,2.66,false);d.rotation.y=sd*0.25;
    const t=add(new T.BoxGeometry(0.46,0.16,0.14),tl,sd*0.8,1.02,-2.6,false);t.rotation.y=-sd*0.2;
    const m=add(new T.BoxGeometry(0.24,0.14,0.1),paint,sd*1.23,1.32,1.12);add(new T.BoxGeometry(0.16,0.04,0.05),trim,sd*1.1,1.28,1.16,false);
    [0.35,-0.95].forEach(hz=>add(new T.BoxGeometry(0.03,0.04,0.18),chrome,sd*1.17,1.06,hz,false));
    [1.18,-0.52,-1.58].forEach(lz=>add(new T.BoxGeometry(0.012,0.8,0.012),blk,sd*1.165,0.8,lz,false));
    add(new T.BoxGeometry(0.05,0.05,1.9),chrome,sd*0.62,1.98,-0.8);});
  const pm=new T.MeshStandardMaterial({map:plateTex,roughness:0.5});
  add(new T.PlaneGeometry(0.62,0.14),pm,0,0.55,2.745,false);const rp=add(new T.PlaneGeometry(0.62,0.14),pm,0,0.78,-2.705,false);rp.rotation.y=Math.PI;
  const fin=add(new T.BoxGeometry(0.08,0.07,0.22),blk,0,1.97,-1.55,false);
  add(new T.BoxGeometry(0.9,0.02,0.03),blk,0.25,1.2,1.33,false);add(new T.BoxGeometry(0.8,0.02,0.03),blk,-0.35,1.2,1.33,false);
  const ex=add(new T.CylinderGeometry(0.05,0.05,0.14,10),chrome,-0.65,0.33,-2.7,false);ex.rotation.x=Math.PI/2;
  return g;}

// ===================== REAL GEOGRAPHY: La Barrosa, Chiclana (OpenStreetMap) =====================
// Built from OpenStreetMap data (© OpenStreetMap contributors, ODbL). Everything keeps its true compass
// bearing from the villa; distances are compressed (g(d)=1050·ln(1+d/1500)) so far landmarks stay on screen.
const GEO_V={"A":850.0,"B":650.0,"terrain":{"na":420,"r":[36.0,37.3,38.64,40.03,41.47,42.96,44.51,46.11,47.77,49.49,51.27,53.12,55.03,57.01,59.07,61.19,63.4,65.68,68.04,70.49,73.03,75.66,78.38,81.2,84.13,87.16,90.29,93.54,96.91,100.4,104.01,107.76,111.64,115.66,119.82,124.13,128.6,133.23,138.03,143.0,148.15,153.48,159.01,164.73,170.66,176.8,183.17,189.76,196.59,203.67,211.0,218.6,226.47,234.62,243.07,251.82,260.88,270.28,280.01,290.09,300.53,311.35,322.56,334.17,346.2,358.66,371.57,384.95,398.81,413.17,428.04,443.45,459.41,475.95,493.09,510.84,529.23,548.28,568.02,588.47,609.65,631.6,654.34,677.89,702.3,727.58,753.77,780.91,809.02,838.15,868.32,899.58,931.97,965.52,1000.28,1036.29,1073.59,1112.24,1152.28,1193.76,1236.74,1281.26,1327.39,1375.17,1424.68,1475.97,1529.1,1584.15,1641.18,1700.26,1761.47,1824.88,1890.58,1958.64,2029.15,2102.2,2177.88,2256.28,2337.51,2421.66,2508.84,2599.16,2692.73,2789.67,2890.1,2994.14,3101.93,3213.6,3329.29,3449.14,3573.31,3701.95,3835.22,3973.29,4116.33,4264.51,4418.04,4577.09,4741.86,4912.57,5089.42,5272.64,5462.45,5659.1,5862.83,6073.89,6292.55,6519.08,6753.77,6996.91],"c":["b102f215b103","b102f215b103","b102f215b103","b102f214b104","b102f214b104","b102f214b104","b102f214b104","b102f214b104","b102f214b104","b102f214b104","b102f214b104","b102f214b104","b102f214b104","b102f214b104","b103f213b104","b103f213b104","b103f213b104","b103f213b104","b5a2b96f213b104","a16b87f213b97a7","a22b81f213b91a13","a27b76f213b85a19","a31b72f213b81a23","a35b68f213b76a28","a38b65f213b72a32","a41b62f213b68a36","a44b59f213b65a39","a46b57f213b61a43","a49b54f213b59a45","a51b52f212b57a48","a53b50f212b55a50","a55b48f212b52a53","a57b46f212b50a55","a59b44f212b48a57","a60b43f212b46a59","a62b41f212b44a61","a64b39f212b43a62","a65b37f213b41a64","a66b36f213b39a66","a68b34f213b37a68","a69b33f215b34a69","a70b32f216b31a71","a71b31f216b30a72","a72b30f216b28a74","a74b28f215b28a75","a75b26f217b26a76","a76b25f218b23a78","a77b24f219b21a79","a78b23f218b22a79","a79b22f217b22a80","a80b21f216b23a80","a80b21f215b23a81","a81b20f215b23a81","a82b19f215b22a82","a83b18f214b23a82","a84b16f215b22a83","a84b16f215b22a83","a85b15f215b21a84","a85b15f216b19a85","a86b14f216b19a85","a86b14f216b18a86","a86b14f216b18a86","a86b13f217b17a87","a87b12f217b17a87","a87b12f218b15a88","a87b12f218b15a88","a87b12f218b14a89","a88b11f219b13a89","a88b11f219b12a90","a88b11f219b12a90","a88b10f220b11a91","a89b7cf221b11a91","a89b7cf221b10a92","a89b6cf222b10a92","a89b6f223b10a92","a91b3f223b11a92","a89b2f228b8a93","a89bf229b8a93","a89bf230b8a92","a88b4f7d4f217b8a92","a88b2d13f218b6a93","a88b2d12f219b6a93","a88b2d12f219b7a92","a87b2d11f222b6a92","a87bd11f74c4f145b7a91","a86bd12f69c11f143b7a91","a86bd11f71jc11f15j10f117b7a90","a85b2d10f67c19f5j24f112b6a90","a85bd11f58d3jc20j4f5j34f102b6a90","a86bd9f55d8jc3j2d8j7f16j6f6j2f2j14f98b6a90","a86bd8f58d19j3f25jf12j8fj10f92b6a90","a86bd8f52jd23j3f39jf10j12f88c2b4a90","a87bd7f49jd4cg4j2gj2gj4g4c2j3f32j7f11j27f75cb4a90","a88bd7f48j2cg9j3g3jg4cj7f29j8f9j4h4j22f75cb4a89","a89bd6f43j2g4jg2jg2j3cg9c2j8f29j12fjfj2h5j27f54df19c2b3a89","a89bcd6f29j9g6jg3jg7jgjcg4c3jf50j7hj30f44d16f6d2f4c3b5a87","a91c4d3f18jg3j2g2jg3jgjg2jg11jg3j3g4j3c2f46j4f5j38f4j10f22d31f6c2b4a87","a92c4d4f10jg5jg5jgjg3jg10j9g9j6f19j5f24j45f3j15f13d31j2f3c6b4a87","a92bc4d4cf7jg6j2gjg6j3g3j10g2jg11j2g5j6f14j17f11j64f12j4d20jhjhj3f8c4b3a87","a94c4d4cf5jg2jg4j3g9j8g8jg10jg9j8f21j9f2j3f3j65cf6j10h4jd6je5f17c3b3a87","a95bc3d5chj6g3jg8j21g7jg13j10f24j6f6j64f3j6f9jh6je7f17d3c3b2a86","a97c3d2c2j4gj3g4jg6j9g3j2g7jg3jg3jg16j7f23j5f6j65fj2f16j3h3je10f4e6f2d4j3c3b2a85","a99c4j6g5jg2jg2jg3j9g11jgjg2j2gjgj5g18j3f14j8f8j44f7j21f13h5jf4e2f4e5d7jdj5c3b2a85","a98b2j2b3j7g6jg3j3g2j2g10jg18jg21jfjf38j28f2jf4j4f2j7fj6f2jf2j2f10h4j6f2eje2f4e3d4j11c3b2a84","a100j6b2j8g2jg3j6g9jg7j6g25f22j7f20j23f10j12f8j3f5j4fjf3hj10f3e3f2e2j3h2j9c4b2a84","a87b3a11bj7bj3f2j9g12j2g5jg9j6g17j2f30j2f20j20f14j10fj2f2j3f8jf5j2f2c4j2cf6e9jc2ejc2j3c3b2a83","a70jaj4a5ja18j19fj6g16j2g27f27j3f33j18f13j13f17jfj2f3c7e13f3ec3j4c3ba83","a81ja19j24g18j2g23j3f15j4f3j20f17j23f10j19f8j2f7j4c3h2j2e10fj4e5j4c2i2a82","a104j27g2j5gj4g22j54f11j23f7j28fj15c9j4e4j2e5j8cia82","a93ja16j42g3j174c6j2cbia80","a113j194c2j6c3j2cj5c5j6c3ia79","a115j194c3j16c6j4c2bia78","a117j198cj3d7j9bj4cia78","a119j193dj2d13j4d3j5cia78","a120j196d15j10ia78","a121j194d14j7d4j2ba77","a122j183d5j10d2jd9j10ba77","a124j173d11j15d14j5a78","a123j176d3j36a82","a122j206b2a90","a124j203a93","a125j202a93","a126j202a92","a126j204ba89","a127j204ba88","a128j204a88","a152j180a88","a157j167a96","a157j162a101","a156j160a104","a156j157a107","a156j155a109","a156j152a112","a156j147a117","a156j142a122","a156j138a126","a199j34a187","a214j3a203","a420","a420","a420","a420","a420","a420","a420","a420","a420","a420","a420","a420"],"h":["0x420","0x420","0x420","0x420","0x420","0x420","0x420","0x420","0x420","0x420","0x420","0x420","0x420","0x420","0x420","0x420","0x420","0x420","0x420","0x420","0x420","0x420","0x420","0x420","0x420","0x420","0x420","0x420","0x420","0x420","0x420","0x420","0x420","0x420","0x420","0x420","0x420","0x420","0x420","0x420","0x420","0x420","0x420","0x420","0x420","0x420","0x420","0x420","0x420","0x420","0x420","0x420","0x420","0x420","0x420","0x420","0x420","0x420","0x420","0x420","0x420","0x420","0x420","0x420","0x420","0x420","0x420","0x420","0x420","0x420","0x420","0x420","0x420","0x420","0x420","0x420","0x420","0x420","0x420","0x420","0x420","0x420","0x420","0x420","0x420","0x420","0x420","0x420","0x420","0x420","0x420","0x420","0x420","0x420","0x420","0x420","0x420","0x420","0x420","0x420","0x420","0x420","0x420","0x420","0x420","0x420","0x420","0x328,1,3,4,6,7,8x2,9x2,10,0x82","0x323,4,6,8,9,11,12,13,14,15,16,17x2,18x2,19,0x82","0x319,1,5,7,9,11,13,14,16,17,18,20,21,22,23x2,24,25x2,26x3,0x80","0x318,4,7,9,11,13,15,17,18,20,21,23,24,25,26,28,29x2,30,31,32x4,0x79","0x318,4,7,10,12,14,16,17,19,21,22,24,25,27,28,30,31,32,34,35,36,37,38x2,37,0x78","0x198,3,7,13,18,24,29,33,37,39,40,39,38,35,31,26,21,16,10,6,2,0x101,4,6,9,11,13,15,16,18,20,21,23,24,26,27,28,29,30,31,32,33x2,34,33,0x78","0x195,5,13,24,36,48,61,74,86,96,105,111,115,116,115,111,105,97,87,76,64,52,40,28,18,9,3,0x101,3,6,8,10,11,13,14,16,17,18,19,20,21,22x2,23x5,0x78","0x195,6,15,28,42,57,72,87,101,114,124,131,136,138,136,131,124,114,102,89,75,60,46,33,21,11,4,0x107,1,3,5,6,7,8,9,10x2,11x5,0x78","0x198,3,9,17,25,34,41,48,53,57,58x2,55,50,44,37,29,21,14,7,2,0x202","0x250,1x2,2,3x2,4,5x2,6x4,5x2,4,3,2x2,1,0x151","0x244,1,3,5,7,9,12,14,17,20,23,25,27,29,30,31x3,30,29,28,26,24,21,19,16,13,11,8,6,4,2,1,0x144","0x241,1,2,4,7,10,14,17,21,26,30,34,38,42,45,48,51,52,53x3,51,49,47,44,40,37,33,29,26,22,19,16,12,9,6,4,2,0x142","0x241,1,2,4,7,10,13,17,21,25,29,33,37,40,43,46,48,49,50,51,52x2,51,50,47,45,41,38,34,29,25,21,17,13,10,7,4,2,0x142","0x237,1x3,2x6,3,5,7,9,11,13,16,19,22,24,27,29,31,32x3,31,29,27,24,21,18,15,12,10,7,5,3,1,0x145","0x227,1,2,3,5,6,8,10,11,13,14,15,16,17x3,16x2,15,14x4,15x3,14x2,13,12,11,10,9,7,6,4,3,2,1,0x155","0x222,1,2,3,5,6,9,11,14,17,20,23,27,30,32,35,36,37,38x2,39,41x4,40,39,38,37,35,34,32,31,29,28,26,24,22,20,19,16,14,12,9,7,5,3,1,0x151","0x220,1,2,4,7,10,13,16,19,23,26,29,32,35,37,40,43,48,54,61,66,71,74,75,76,74,71,68,63,58,53,48,47x3,46x2,45,43,41,38,34,30,26,21,17,13,9,6,4,2x2,3,4,5,6,8,9,11,12x2,13,12x2,11,9,8,6,5,3,2,1,0x129","0x221,1,3,6,10,14,19,23,27,30,33,35,39,44,49,54,59,64,68,73,76,79,80x3,83x2,82,80,77,72,68,63,58,54,50,46,42,38,36,33,30,26,21,17,13,12,16,20,24,27,31,34,38,42,45,48,50,51,53x2,52,50,47,43,39,35,32,29,25,22,19,15,12,8,4,2,0x123","0x225,1,3,6,9,13,17,22,26,30,33,35,36,37,38,41,46,50,54,58,60,62x2,60,56,52,47,44,42,39,36,33,30,27,24,20,17,13,10,7,12,18,24,31,37,44,51,58,66,74,82,88,93,95,94,90,84,77,69,61,54,51,48,46,44,41,37,33,27,21,16,10,5,2,3,9,16,24,31,37,43,46,47,45,39,31,21,10,2,0x107","0x229,2,19,45,77,110,149,189,222,243,250,243,225,199,170,140,120,96,67,38,12,6,5,4,3,2,1x2,0x9,2,6,9,14,20,26,33,40,48,55,60,64,65,64,61,56,51,47,43,39,36,33,30,26,22,17,12,8,4,1,0,3,12,25,42,60,81,100,116,127,132,129,119,104,86,66,47,28,13,2,0x105","0x233,2,10,20,29,36,42,46,45,38,27,16,6,0x175","0x301,3,10,17,25,31,35,36,33,28,22,16,10,4,0x106","0x298,9,32,61,90,113,130,140,148,156,164,167,163,149,127,99,71,45,24,0x104","0x269,2,10,21,30,35x2,34,33,34,32,26,17,8,2,0x23,5,17,29,41,51,56,55,0x107","0x223,14,38,57,85,136,190,228,242,277,278,254,225,244,271,253,194,124,166,222,286,335,343,382,376,350,328,313,342,329,267,190,170,209,294,361,378,349,305,295,340,361,335,270,197,139,147,228,308,363,385,391,406,429,455,460,419,357,303,262,221,168,108,99,83,76,75,69,55,34,15,9,28,57,96,137,168,183,187,190,193,191,173,137,92,82,107,128,146,0x109","0x225,3,20,51,89,118,147,166,168,162,184,188,158,109,80,55,62,100,144,176,192,203,234,261,242,192,144,133,109,68,77,92,122,159,182,173,141,134,132,123,96,57,30,14,2,0x3,3,7,12,16x2,12,8,31,69,113,148,175,207,242,257,236,189,143,108,82,50,19,1,0x125","0x223,1,28,61,106,147,178,253,288,238,244,300,327,311,291,218,149,137,94,36,4,0x177","0x218,24,67,153,242,345,398,353,498,573,553,517,404,435,420,267,194,127,65,18,0x183","0x217,30,77,130,177,254,279,246,241,221,190,96,60,18,0x190","0x420","0x420","0x420","0x420","0x420","0x420","0x420","0x420","0x420","0x420","0x420","0x420","0x420","0x420"]},"bld":[[0,3.1,-1493.7,-81.6,-1498.8,-62.7,-1501.3,-65.3,-1501.7,-63.9,-1502.0,-62.6,-1500.8,-61.3,-1502.5,-54.6,-1501.9,-53.8,-1503.8,-46.6,-1506.0,-48.8,-1510.9,-53.9,-1508.9,-61.3,-1508.4,-60.7,-1506.6,-67.4,-1505.4,-66.1,-1504.7,-68.5,-1507.2,-71.1,-1504.9,-80.1,-1502.4,-77.7,-1499.7,-87.7,-1497.1,-85.0,-1496.5,-84.4],[1,3.7,-1165.0,138.2,-1184.8,123.6,-1215.6,144.8,-1245.8,139.8,-1246.1,118.7,-1244.5,119.6,-1243.2,119.9,-1241.4,119.4,-1232.5,113.3,-1230.6,110.9,-1229.5,107.9,-1228.2,102.1,-1224.0,106.1,-1221.6,91.0,-1221.0,87.9,-1217.1,74.3,-1221.6,70.3,-1216.6,47.7,-1211.6,27.8,-1208.7,30.2,-1207.3,24.7,-1209.7,22.7,-1205.0,17.9,-1204.2,18.5,-1203.9,17.0,-1177.3,36.0,-1172.1,39.6,-1166.1,46.6,-1162.1,52.6,-1159.9,57.6,-1157.5,65.6,-1156.5,74.1,-1156.4,81.4,-1157.5,91.6],[0,6.3,483.1,-15.0,482.9,-4.2,471.2,-5.1,471.5,-16.0],[0,5.0,-821.9,-53.2,-824.1,-39.6,-833.4,-42.7,-831.2,-56.4],[0,6.4,-414.7,178.7,-416.1,208.9,-457.1,198.6,-456.0,167.2],[0,6.2,-464.0,225.3,-469.4,224.1,-469.3,230.5,-463.9,231.7],[0,6.2,-494.3,61.8,-494.6,65.3,-499.2,127.0,-499.5,130.8,-510.4,128.0,-505.4,62.4,-505.2,59.4],[0,6.2,-478.9,134.2,-484.0,132.9,-496.5,129.9,-497.1,129.7,-498.2,129.5,-498.9,143.2,-479.8,147.8],[0,6.3,-464.5,66.5,-464.8,70.5,-469.6,135.3,-479.8,132.8,-474.7,64.3],[0,6.9,-341.0,34.5,-342.7,61.5,-357.4,59.5,-355.7,32.7],[0,6.4,-443.8,39.8,-457.9,39.3,-457.6,17.6,-443.6,17.9],[0,6.1,-526.7,172.5,-530.1,171.7,-530.3,176.2,-537.9,174.6,-536.2,116.7,-525.2,119.6],[0,6.7,424.3,75.0,421.9,25.6,421.1,7.8,419.0,8.2,418.5,-0.0,412.3,1.0,411.8,-4.1,366.0,3.2,367.0,9.8,363.9,10.6,365.1,25.0,373.0,23.6,376.5,82.2,395.8,79.3,392.1,24.5,403.7,22.9,407.7,77.3],[0,6.1,-522.4,42.3,-529.4,41.4,-529.1,35.5,-528.7,29.8,-523.7,30.4,-521.7,30.7],[0,7.7,158.7,51.3,144.5,54.7,145.5,66.6,161.3,60.7],[0,5.3,-734.1,-64.4,-736.4,-54.6,-737.2,-51.3,-743.8,-53.9,-742.2,-60.6,-738.5,-65.9],[0,5.8,-609.8,-44.2,-617.2,-45.8,-618.6,-37.6,-622.2,-38.1,-623.4,-32.5,-624.9,-32.8,-625.4,-29.7,-614.5,-27.0,-613.1,-34.2,-611.4,-34.0],[0,6.0,-1071.8,-83.5,-1077.0,-81.2,-1077.8,-89.7,-1072.2,-90.3],[0,4.1,-1090.8,-132.3,-1091.7,-132.4,-1092.0,-129.9,-1090.9,-130.0],[0,4.2,-1085.1,-137.9,-1085.3,-135.6,-1085.2,-134.1,-1085.0,-132.7,-1086.5,-131.6,-1086.6,-134.0,-1086.7,-135.7,-1086.4,-138.5],[1,8.1,-1118.9,-105.2,-1120.6,-99.4,-1119.6,-98.6,-1120.8,-94.8,-1119.9,-94.1,-1121.1,-90.2,-1120.4,-89.6,-1121.5,-85.8,-1120.8,-85.3,-1121.9,-81.7,-1125.0,-84.2,-1125.4,-83.0,-1127.0,-84.3,-1127.7,-81.9,-1128.6,-82.6,-1127.9,-85.1,-1130.7,-87.4,-1125.0,-106.3,-1124.3,-105.7,-1123.4,-108.7],[1,8.1,-1114.0,-149.1,-1119.7,-130.0,-1121.2,-131.1,-1122.1,-128.1,-1120.3,-126.9,-1121.5,-122.6,-1122.5,-123.3,-1124.7,-115.6,-1125.6,-116.3,-1126.8,-112.4,-1127.7,-113.0,-1128.9,-109.1,-1135.8,-114.1,-1134.5,-118.5,-1133.8,-118.0,-1132.7,-121.6,-1131.7,-120.9,-1130.6,-124.8,-1129.8,-124.3,-1128.7,-127.9,-1128.1,-127.4,-1126.8,-131.7,-1125.1,-130.5,-1124.3,-133.1,-1126.0,-134.3,-1124.9,-138.0,-1125.7,-138.5,-1123.3,-146.4,-1124.2,-147.0,-1123.0,-150.9,-1124.0,-151.6,-1122.9,-155.1,-1119.7,-153.0,-1118.0,-151.8],[1,7.9,-1151.7,-149.6,-1154.0,-151.2,-1154.5,-149.5,-1153.5,-148.8,-1154.0,-147.1,-1154.9,-147.7,-1155.3,-146.2,-1153.2,-144.7,-1158.8,-125.7,-1162.9,-128.7,-1162.5,-130.2,-1163.1,-130.6,-1162.4,-133.0,-1163.3,-133.7,-1163.9,-131.8,-1164.4,-132.2,-1164.8,-131.0,-1167.3,-132.8,-1166.2,-136.5,-1165.1,-135.8,-1164.0,-139.8,-1163.4,-139.4,-1162.3,-142.9,-1161.6,-142.4,-1160.4,-146.5,-1159.5,-145.9,-1158.4,-149.7,-1156.4,-148.3,-1155.6,-150.8,-1157.9,-152.4,-1156.7,-156.5,-1157.5,-157.1,-1156.3,-161.1,-1156.9,-161.5,-1155.9,-164.8,-1156.5,-165.2,-1155.3,-169.1,-1156.0,-169.6,-1154.9,-173.5,-1151.8,-171.4,-1152.1,-170.3,-1151.4,-169.8,-1151.8,-168.5,-1151.2,-168.1,-1150.4,-170.6,-1148.2,-169.1,-1149.1,-166.3,-1147.0,-164.9],[1,7.9,-1159.2,-124.1,-1165.0,-104.6,-1167.5,-106.5,-1167.1,-107.9,-1168.2,-108.7,-1168.7,-106.8,-1171.0,-108.6,-1169.9,-112.3,-1171.0,-113.1,-1169.8,-117.0,-1170.6,-117.5,-1169.5,-121.1,-1170.0,-121.4,-1169.0,-124.8,-1169.7,-125.4,-1168.4,-129.9,-1165.7,-127.9,-1166.1,-126.7,-1165.3,-126.2,-1165.9,-124.4,-1165.0,-123.8,-1164.3,-125.9,-1162.8,-124.7,-1162.3,-126.4],[1,8.1,-1136.2,-77.0,-1141.7,-57.8,-1139.1,-55.7,-1138.1,-59.0,-1136.8,-58.0,-1137.8,-54.5,-1135.0,-52.3,-1133.9,-56.3,-1133.0,-55.6,-1131.9,-59.4,-1131.2,-58.9,-1130.2,-62.2,-1129.4,-61.6,-1128.3,-65.5,-1127.4,-64.8,-1126.1,-69.3,-1129.6,-72.1,-1130.4,-69.5,-1132.9,-71.5,-1132.2,-73.8],[1,8.0,-1150.4,-34.8,-1151.5,-30.8,-1152.1,-31.3,-1153.1,-27.6,-1153.8,-28.2,-1154.9,-24.1,-1155.6,-24.7,-1156.5,-21.1,-1157.3,-21.8,-1158.3,-18.1,-1160.8,-20.2,-1160.0,-23.5,-1161.2,-24.5,-1162.1,-21.3,-1164.6,-23.4,-1159.6,-42.3,-1155.6,-39.1,-1156.3,-36.3,-1153.4,-34.0,-1152.7,-36.6],[1,8.0,-1138.2,-51.8,-1139.3,-48.1,-1140.1,-48.8,-1141.2,-44.8,-1142.0,-45.4,-1143.1,-41.4,-1143.9,-42.0,-1145.0,-37.9,-1146.1,-38.7,-1146.9,-35.6,-1149.2,-37.5,-1148.2,-41.0,-1149.5,-42.1,-1150.6,-38.1,-1153.3,-40.4,-1147.8,-60.0,-1143.8,-56.8,-1144.5,-54.1,-1141.4,-51.5,-1140.8,-53.8],[1,8.0,-1151.4,-124.1,-1157.6,-104.2,-1154.9,-102.0,-1155.2,-101.0,-1153.9,-99.9,-1153.2,-102.5,-1152.5,-101.9,-1151.9,-103.8,-1150.9,-103.0,-1151.4,-101.0,-1150.7,-100.5,-1151.1,-99.2,-1148.5,-97.1,-1147.2,-101.2,-1148.0,-101.8,-1146.8,-105.8,-1147.7,-106.6,-1146.6,-110.1,-1147.5,-110.8,-1146.3,-114.5,-1146.9,-115.0,-1145.6,-119.2,-1148.0,-121.2,-1148.4,-120.0,-1149.5,-120.9,-1149.1,-122.2],[1,8.0,-1138.6,-165.8,-1144.6,-146.6,-1142.6,-145.1,-1143.1,-143.2,-1145.4,-144.9,-1151.3,-125.3,-1148.9,-123.5,-1148.4,-125.0,-1147.7,-124.5,-1148.5,-122.1,-1147.6,-121.5,-1147.1,-123.3,-1146.2,-122.7,-1145.5,-124.9,-1144.3,-124.1,-1144.6,-123.0,-1145.0,-121.9,-1141.9,-119.6,-1140.7,-123.5,-1141.5,-124.1,-1140.4,-128.0,-1141.1,-128.5,-1139.8,-132.7,-1140.5,-133.2,-1139.3,-137.1,-1140.1,-137.6,-1138.0,-144.6,-1137.1,-144.0,-1135.8,-148.0,-1135.2,-147.5,-1132.0,-157.7,-1134.2,-159.3,-1133.7,-161.0,-1136.6,-163.1,-1136.3,-164.1],[0,4.1,-1123.1,-74.2,-1126.4,-77.0,-1125.2,-81.0,-1122.1,-78.1],[1,7.9,-1161.6,-104.8,-1166.6,-86.5,-1159.6,-81.5,-1155.3,-97.1,-1160.2,-100.6,-1159.5,-103.3],[1,8.0,-1146.8,-84.1,-1153.7,-59.6,-1155.3,-61.2,-1157.9,-52.8,-1156.9,-51.5,-1158.6,-45.8,-1159.9,-47.3,-1160.8,-46.8,-1161.0,-48.1,-1162.4,-49.6,-1161.5,-53.9,-1169.8,-60.9,-1164.9,-76.3,-1156.7,-70.3,-1151.5,-87.6],[1,7.9,-1161.3,-17.1,-1162.4,-13.0,-1163.0,-13.5,-1163.9,-9.9,-1164.7,-10.4,-1165.7,-6.4,-1166.4,-7.0,-1167.3,-3.5,-1168.1,-4.1,-1169.0,-0.5,-1171.7,-2.7,-1170.9,-5.9,-1172.0,-6.8,-1172.8,-3.7,-1175.4,-5.8,-1170.6,-24.8,-1166.4,-21.5,-1167.1,-18.7,-1164.3,-16.4,-1163.7,-19.0],[1,8.0,-1130.0,-107.3,-1135.5,-88.1,-1138.5,-90.3,-1139.0,-88.6,-1140.4,-89.6,-1139.1,-94.0,-1140.8,-95.3,-1141.3,-93.7,-1141.7,-94.0,-1142.1,-92.5,-1144.9,-94.5,-1143.8,-98.4,-1142.8,-97.7,-1141.7,-101.6,-1140.9,-101.1,-1139.8,-104.9,-1139.1,-104.4,-1138.1,-108.2,-1137.2,-107.6,-1136.1,-111.5,-1133.5,-109.6,-1133.9,-108.2,-1132.6,-107.2,-1132.1,-108.8],[0,6.3,-453.5,241.7,-443.7,243.5,-443.6,223.5,-453.4,221.2],[0,6.2,-474.0,233.8,-473.9,255.6,-482.5,253.4,-483.2,213.6,-473.4,216.0],[0,6.2,-469.3,243.0,-469.2,253.4,-463.8,254.7,-447.4,259.9,-447.1,248.2],[0,3.8,-1180.7,-252.8,-1181.9,-248.7,-1180.8,-248.1,-1179.5,-252.1,-1178.9,-251.8,-1178.2,-254.1,-1180.3,-255.2,-1181.0,-253.0],[0,4.3,-1037.4,-180.2,-1038.8,-175.7,-1037.4,-174.9,-1036.0,-179.4,-1035.3,-179.0,-1034.5,-181.6,-1037.1,-183.0,-1037.9,-180.5],[1,7.9,-1177.0,-61.4,-1178.1,-57.4,-1177.5,-56.9,-1178.5,-53.2,-1177.8,-52.7,-1178.9,-48.7,-1178.2,-48.1,-1179.2,-44.6,-1178.4,-44.0,-1179.4,-40.4,-1176.8,-38.3,-1175.9,-41.5,-1174.8,-40.5,-1175.6,-37.4,-1173.1,-35.3,-1167.9,-54.3,-1171.9,-57.6,-1172.7,-54.8,-1175.4,-57.0,-1174.7,-59.6],[1,7.8,-1192.1,-25.6,-1191.1,-29.6,-1191.7,-30.1,-1190.7,-33.7,-1191.4,-34.3,-1190.4,-38.2,-1191.1,-38.8,-1190.1,-42.3,-1190.9,-42.9,-1189.9,-46.4,-1192.5,-48.5,-1193.3,-45.4,-1194.4,-46.2,-1193.6,-49.3,-1196.1,-51.4,-1201.1,-32.8,-1197.1,-29.5,-1196.4,-32.2,-1193.7,-30.0,-1194.4,-27.5],[1,7.8,-1188.9,-16.4,-1189.9,-12.4,-1189.3,-11.9,-1190.2,-8.3,-1189.5,-7.7,-1190.6,-3.7,-1189.9,-3.1,-1190.7,0.3,-1190.0,1.0,-1190.9,4.5,-1188.3,6.7,-1187.5,3.5,-1186.4,4.5,-1187.1,7.6,-1184.5,9.8,-1179.7,-9.0,-1183.8,-12.4,-1184.5,-9.7,-1187.3,-12.0,-1186.6,-14.5],[1,7.8,-1181.1,-67.4,-1182.2,-63.3,-1182.8,-63.8,-1183.8,-60.2,-1184.5,-60.7,-1185.6,-56.7,-1186.3,-57.3,-1187.2,-53.8,-1188.0,-54.4,-1188.9,-50.8,-1191.5,-52.9,-1190.6,-56.0,-1191.7,-56.9,-1192.6,-53.8,-1195.1,-55.8,-1190.0,-74.6,-1186.0,-71.5,-1186.7,-68.7,-1184.0,-66.6,-1183.3,-69.2],[1,7.8,-1188.0,-20.1,-1187.0,-24.1,-1186.4,-23.6,-1185.4,-27.2,-1184.7,-26.6,-1183.7,-30.6,-1182.9,-30.0,-1182.0,-33.5,-1181.2,-32.9,-1180.3,-36.4,-1177.7,-34.3,-1178.6,-31.1,-1177.4,-30.2,-1176.6,-33.3,-1174.0,-31.2,-1179.0,-12.3,-1183.1,-15.7,-1182.4,-18.5,-1185.1,-20.7,-1185.7,-18.2],[1,7.7,-1193.2,-22.4,-1194.2,-18.4,-1194.8,-18.9,-1195.7,-15.3,-1196.4,-15.9,-1197.4,-11.9,-1198.1,-12.5,-1199.0,-9.0,-1199.7,-9.7,-1200.6,-6.2,-1203.2,-8.3,-1202.4,-11.4,-1203.5,-12.3,-1204.3,-9.3,-1206.8,-11.3,-1202.1,-29.9,-1198.1,-26.7,-1198.8,-23.9,-1196.1,-21.7,-1195.4,-24.3],[0,5.1,-730.9,388.3,-736.3,386.2,-736.4,385.0,-739.8,383.7,-739.9,379.0,-737.0,380.1,-736.9,383.2,-734.7,384.0,-734.8,381.3,-731.1,382.8],[0,4.2,-1074.5,-32.0,-1079.1,-20.0,-1087.8,-28.8,-1083.4,-41.4],[0,4.4,928.1,445.7,926.2,439.8,928.9,437.2,930.6,443.2],[0,4.5,911.5,468.5,897.9,479.4,890.8,441.6,904.8,430.6],[0,4.4,924.3,424.4,923.4,418.0,937.2,408.2,937.8,414.7],[0,4.4,925.2,434.5,924.5,428.1,935.3,420.6,936.4,433.5,930.7,437.5,930.0,431.2],[0,11.2,-632.8,171.6,-630.7,162.0,-630.6,151.9,-632.5,141.4,-672.1,117.2,-677.8,115.2,-677.0,153.6,-659.7,163.0,-648.1,169.8],[0,5.5,-679.2,95.0,-691.4,94.2,-707.1,95.9,-707.4,73.2,-676.7,71.9],[1,6.1,-487.5,227.3,-511.1,221.7,-502.9,258.6,-489.7,257.2,-489.0,244.9],[0,6.2,-170.9,494.4,-151.9,495.1,-148.0,517.7,-166.8,517.6],[0,4.5,-959.7,-100.4,-965.7,-103.2,-966.8,-98.7,-965.4,-98.1,-965.6,-97.2,-962.6,-95.8,-962.4,-96.7,-960.8,-96.0],[0,4.6,-950.8,-96.2,-957.1,-99.1,-958.4,-94.6,-956.6,-93.8,-956.8,-92.9,-953.7,-91.5,-953.5,-92.5,-951.9,-91.7],[0,4.6,-933.9,-87.4,-940.1,-90.2,-941.2,-85.7,-939.8,-85.0,-940.0,-84.2,-936.8,-82.7,-936.6,-83.6,-934.9,-82.9],[0,4.8,-885.4,-65.8,-891.7,-70.1,-893.2,-65.6,-891.7,-64.6,-892.0,-63.7,-888.8,-61.5,-888.5,-62.5,-886.8,-61.3],[0,4.7,-905.1,-66.5,-903.6,-72.9,-905.0,-73.5,-905.3,-72.1,-911.4,-74.8,-912.3,-70.8,-910.7,-70.2,-911.0,-68.9,-908.0,-67.6,-907.7,-69.0,-906.9,-68.6,-907.2,-67.5],[0,4.8,-899.4,-61.9,-901.0,-62.9,-900.7,-64.0,-904.2,-66.2,-902.5,-72.0,-897.9,-69.1,-897.3,-71.2,-895.3,-69.9,-895.8,-68.4,-894.8,-67.8,-896.6,-61.5,-899.1,-63.0],[0,4.7,-914.2,-77.2,-915.1,-72.9,-916.9,-73.7,-917.2,-72.1,-920.0,-73.2,-919.7,-74.6,-920.0,-74.7,-920.2,-73.7,-922.0,-74.4,-920.4,-82.0,-918.4,-81.1,-918.8,-79.0],[0,4.7,-925.0,-82.5,-931.3,-85.4,-932.4,-80.8,-930.9,-80.1,-931.1,-79.3,-927.9,-77.8,-927.7,-78.8,-926.0,-78.0],[0,4.6,-942.8,-91.8,-949.0,-94.6,-950.1,-90.1,-948.7,-89.4,-948.9,-88.6,-947.0,-87.8,-947.1,-87.0,-945.9,-86.6,-945.6,-88.1,-943.9,-87.3],[0,4.5,-968.8,-96.5,-969.8,-96.8,-970.0,-96.0,-971.3,-96.5,-971.2,-97.3,-972.7,-97.9,-969.7,-112.0,-966.0,-110.7,-967.5,-103.7,-967.0,-103.6,-968.0,-98.8,-968.3,-98.9],[0,4.5,-974.2,-124.0,-980.9,-126.1,-982.0,-120.7,-980.0,-120.0,-980.2,-119.1,-979.2,-118.8,-979.4,-117.9,-977.6,-117.3,-977.9,-115.7,-976.0,-115.1],[0,5.2,-765.1,132.8,-772.3,131.7,-772.4,129.8,-776.4,129.2,-776.4,124.6,-775.7,124.7,-775.7,121.4,-771.0,122.1,-771.0,119.8,-767.4,120.3,-767.3,127.2,-765.2,127.6],[0,6.9,-345.4,141.4,-351.5,132.2,-325.8,109.8,-319.7,119.1,-342.6,138.9],[0,7.0,-317.2,117.0,-323.7,107.5,-306.0,91.8,-299.5,101.4],[0,6.9,-334.0,158.3,-339.4,150.7,-340.2,149.6,-337.0,146.7,-305.7,118.2,-299.3,127.1],[0,6.8,-333.2,165.6,-331.0,168.7,-329.5,167.4,-325.1,173.4,-327.0,175.1,-324.9,177.9,-323.5,176.7,-314.0,189.4,-315.6,190.8,-312.1,195.5,-316.6,199.5,-318.5,197.0,-320.6,198.9,-318.8,201.2,-323.3,205.2,-324.9,203.1,-344.5,177.0,-337.7,170.7,-338.1,170.2],[0,6.7,-365.5,136.3,-369.6,130.2,-387.2,104.1,-381.1,98.3,-359.4,131.1],[0,6.7,-371.4,141.9,-377.8,147.5,-406.8,104.0,-401.0,98.0,-375.4,136.2],[0,6.7,-388.5,101.3,-382.8,95.6,-395.1,77.5,-400.8,83.2],[0,6.6,-370.7,171.2,-379.7,179.8,-384.3,173.5,-383.0,172.3,-384.6,170.1,-387.8,173.2,-386.3,175.3,-385.3,174.4,-380.8,180.7,-390.1,190.1,-395.5,182.9,-394.0,181.4,-395.1,179.8,-396.8,181.5,-401.8,174.6,-396.8,169.7,-395.6,171.2,-394.5,170.1,-395.5,168.8,-394.7,168.0,-393.5,168.3,-386.3,161.1,-386.9,160.3,-385.5,158.9,-383.7,159.5,-380.3,156.1,-376.2,161.8,-378.1,163.5,-375.8,166.6,-374.8,165.6],[0,6.9,83.1,399.4,65.1,404.4,56.5,377.0,63.2,375.0,61.8,372.7,56.0,374.5,46.9,347.7,64.2,343.0,66.1,348.4,68.3,347.7,63.6,335.6,66.3,334.8,70.4,347.0,71.8,346.7,70.2,341.4,87.9,336.1,96.4,363.3,90.0,365.4,90.8,367.7,97.2,366.0,104.9,392.3,88.4,397.6,86.7,393.7,81.6,395.2],[0,7.0,50.3,339.2,45.0,323.8,71.3,316.6,76.7,333.5,74.1,334.1,73.3,332.7,66.3,334.8,63.6,335.6],[0,6.2,520.7,-45.9,498.2,-41.7,497.4,-46.6,503.7,-47.7,502.7,-54.0,518.9,-56.8],[0,5.2,777.9,137.6,775.9,138.5,775.7,136.8,775.2,137.0,775.1,137.5,774.7,137.9,774.3,137.8,773.9,137.4,773.3,137.7,773.5,139.4,770.9,140.5,770.0,132.0,771.7,131.3,771.6,130.3,776.0,128.5,776.0,129.2,776.9,129.0],[0,5.2,784.3,134.9,781.8,135.9,781.6,134.3,781.2,134.5,781.0,135.0,780.6,135.4,780.2,135.3,779.9,134.9,779.2,135.2,779.4,136.9,777.9,137.6,776.9,129.0,777.7,128.8,777.6,127.8,781.9,126.0,782.1,127.0,783.4,126.6],[0,5.1,790.7,132.4,788.8,133.3,788.6,131.6,788.1,131.8,788.0,132.4,787.6,132.7,787.2,132.7,786.8,132.3,786.2,132.6,786.4,134.2,784.3,134.9,783.4,126.6,784.7,126.2,784.5,125.2,788.8,123.4,789.0,124.4,789.8,124.1],[0,5.1,796.9,130.0,794.9,130.8,794.7,129.1,794.3,129.3,794.2,129.9,793.8,130.2,793.4,130.2,793.0,129.8,792.4,130.1,792.6,131.7,790.7,132.4,789.8,124.1,790.8,123.7,790.7,122.7,795.0,120.9,795.1,121.7,795.9,121.5],[0,5.1,803.2,127.4,801.2,128.2,801.0,126.6,800.6,126.8,800.5,127.3,800.1,127.7,799.7,127.6,799.3,127.2,798.7,127.5,798.9,129.1,796.9,130.0,795.9,121.5,797.2,121.1,797.1,120.2,801.3,118.4,801.4,119.3,802.2,119.0],[0,5.1,809.8,124.5,807.6,125.5,807.4,123.8,807.0,124.0,806.9,124.6,806.5,124.9,806.1,124.9,805.7,124.5,805.1,124.7,805.3,126.4,803.2,127.4,802.2,119.0,803.6,118.4,803.5,117.5,807.6,115.7,807.7,116.4,808.9,116.0],[0,5.2,769.6,140.8,767.6,141.7,767.4,140.0,766.9,140.2,766.8,140.7,766.4,141.1,766.0,141.1,765.6,140.7,765.0,140.9,765.2,142.6,763.2,143.5,762.3,134.9,763.4,134.5,763.3,133.5,767.7,131.6,767.8,132.4,768.6,132.0],[0,5.2,763.2,143.5,761.1,144.4,760.9,142.7,760.4,142.9,760.3,143.5,759.9,143.8,759.5,143.8,759.2,143.4,758.5,143.7,758.7,145.3,756.6,146.2,755.7,137.6,756.9,137.2,756.8,136.2,761.2,134.3,761.4,135.2,762.3,134.9],[0,5.2,756.6,146.2,754.4,147.0,754.2,145.3,753.7,145.5,753.6,146.1,753.2,146.4,752.7,146.4,752.4,146.0,751.7,146.3,751.9,148.0,749.7,148.9,748.7,140.3,750.1,139.8,750.0,138.8,754.5,136.9,754.7,138.0,755.7,137.6],[0,5.3,749.7,148.9,747.7,149.6,747.5,147.9,747.0,148.1,746.9,148.7,746.5,149.0,746.0,149.0,745.7,148.6,745.0,148.9,745.2,150.6,743.0,151.5,742.1,142.8,743.4,142.4,743.3,141.4,747.8,139.5,748.0,140.6,748.7,140.3],[0,5.3,743.0,151.5,740.9,152.3,740.7,150.6,740.2,150.8,740.0,151.4,739.6,151.8,739.2,151.7,738.8,151.3,738.2,151.6,738.3,153.3,736.2,154.3,735.4,145.5,736.6,145.1,736.5,144.1,741.0,142.2,741.1,143.3,742.1,142.8],[0,5.3,736.2,154.3,734.0,155.2,733.8,153.5,733.3,153.7,733.1,154.3,732.7,154.6,732.3,154.6,731.9,154.2,731.2,154.5,731.4,156.2,729.4,157.0,728.5,148.4,729.7,147.9,729.5,147.0,734.1,145.0,734.2,146.1,735.4,145.5],[0,4.3,1049.8,-32.6,1049.6,-32.2,1046.8,-37.6,1048.7,-40.4,1052.5,-33.0,1052.0,-32.2,1052.4,-31.3,1051.3,-29.7],[0,4.3,1053.4,-32.2,1053.1,-31.8,1050.4,-37.2,1052.3,-40.0,1056.0,-32.6,1055.5,-31.8,1055.9,-31.0,1054.8,-29.3],[0,4.3,1057.0,-31.6,1056.7,-31.2,1054.1,-36.5,1055.9,-39.4,1059.7,-32.0,1059.1,-31.2,1059.6,-30.4,1058.5,-28.7],[0,4.3,1060.4,-31.3,1060.2,-30.9,1057.5,-36.2,1059.4,-39.0,1063.1,-31.7,1062.6,-30.9,1063.0,-30.1,1061.9,-28.4],[0,4.3,1064.1,-30.9,1063.8,-30.5,1061.1,-35.8,1063.0,-38.6,1066.7,-31.3,1066.2,-30.5,1066.6,-29.6,1065.5,-28.0],[0,4.2,1067.7,-30.4,1067.4,-30.0,1064.8,-35.3,1066.7,-38.1,1070.3,-30.8,1069.8,-30.0,1070.2,-29.1,1069.1,-27.5],[0,4.2,1071.2,-30.2,1070.9,-29.8,1068.3,-35.1,1070.1,-37.9,1073.8,-30.6,1073.2,-29.8,1073.7,-29.0,1072.6,-27.3],[0,4.3,1049.2,11.5,1049.5,11.0,1046.8,5.9,1044.9,9.0,1048.7,16.0,1049.2,15.2,1049.6,16.0,1050.7,14.2],[0,4.3,1049.6,5.3,1049.8,4.9,1047.1,-0.2,1045.2,2.9,1049.0,9.9,1049.5,9.1,1050.0,9.9,1051.1,8.1],[0,4.3,1049.2,-3.8,1049.5,-4.2,1046.7,-9.3,1044.8,-6.3,1048.7,0.8,1049.2,-0.1,1049.6,0.7,1050.7,-1.0],[0,4.3,1049.1,-10.7,1049.3,-11.2,1046.5,-16.3,1044.7,-13.3,1048.5,-6.2,1049.1,-7.0,1049.5,-6.2,1050.6,-8.0],[0,4.3,1049.2,-17.0,1049.4,-17.4,1046.6,-22.5,1044.8,-19.5,1048.6,-12.4,1049.2,-13.3,1049.6,-12.4,1050.7,-14.2],[0,4.3,1049.1,-23.5,1049.4,-23.9,1046.5,-29.1,1044.7,-26.0,1048.6,-18.9,1049.1,-19.8,1049.5,-18.9,1050.6,-20.7],[0,4.3,1049.2,-29.9,1049.4,-30.3,1046.6,-35.5,1044.8,-32.4,1048.7,-25.3,1049.2,-26.2,1049.6,-25.3,1050.7,-27.1],[0,4.3,1049.4,18.2,1049.6,17.8,1046.9,12.7,1045.0,15.8,1048.8,22.8,1049.3,21.9,1049.7,22.8,1050.8,21.0],[0,4.3,1049.0,24.4,1049.3,23.9,1046.5,18.8,1044.6,21.9,1048.4,28.9,1048.9,28.1,1049.4,28.9,1050.5,27.1],[0,4.2,1077.3,-27.5,1077.0,-27.3,1075.5,-33.7,1077.8,-35.2,1079.9,-26.4,1079.3,-26.0,1079.5,-25.0,1078.2,-24.1],[0,4.2,1080.5,-26.0,1080.2,-25.8,1078.6,-32.1,1080.9,-33.7,1083.0,-25.0,1082.4,-24.5,1082.6,-23.5,1081.3,-22.6],[0,4.2,1083.8,-23.8,1083.5,-23.6,1081.9,-29.9,1084.2,-31.4,1086.3,-22.7,1085.7,-22.3,1086.0,-21.3,1084.6,-20.4],[0,4.2,1087.1,-21.7,1086.8,-21.5,1085.2,-27.8,1087.5,-29.4,1089.6,-20.7,1089.0,-20.2,1089.2,-19.2,1087.9,-18.3],[0,4.2,1090.4,-19.7,1090.1,-19.5,1088.5,-25.8,1090.8,-27.3,1092.9,-18.6,1092.3,-18.2,1092.5,-17.2,1091.2,-16.3],[0,4.2,1093.7,-17.4,1093.4,-17.2,1091.8,-23.5,1094.1,-25.0,1096.2,-16.3,1095.6,-15.9,1095.8,-14.9,1094.5,-14.0],[0,4.2,1096.9,-15.4,1096.6,-15.2,1095.1,-21.4,1097.4,-23.0,1099.4,-14.3,1098.8,-13.9,1099.0,-12.9,1097.7,-12.0],[0,4.1,1103.1,-11.2,1102.8,-11.0,1101.3,-17.3,1103.7,-18.8,1105.7,-10.3,1105.0,-9.8,1105.2,-8.8,1103.9,-7.9],[0,4.1,1106.5,-8.8,1106.1,-8.5,1104.7,-14.8,1107.0,-16.3,1109.0,-7.8,1108.3,-7.3,1108.5,-6.3,1107.2,-5.4],[0,4.1,1109.6,-6.8,1109.3,-6.6,1107.8,-12.8,1110.1,-14.4,1112.1,-5.9,1111.4,-5.4,1111.7,-4.4,1110.4,-3.5],[0,4.1,1112.9,-4.5,1112.6,-4.3,1111.1,-10.5,1113.4,-12.0,1115.4,-3.6,1114.7,-3.1,1114.9,-2.1,1113.6,-1.2],[0,4.1,1116.0,-2.7,1115.7,-2.5,1114.3,-8.6,1116.6,-10.2,1118.5,-1.8,1117.9,-1.3,1118.1,-0.3,1116.8,0.6],[0,4.1,1119.2,-0.5,1118.9,-0.3,1117.5,-6.5,1119.8,-8.0,1121.7,0.4,1121.0,0.9,1121.3,1.9,1120.0,2.8],[0,4.1,1122.4,1.5,1122.1,1.7,1120.7,-4.4,1123.0,-6.0,1124.9,2.4,1124.2,2.9,1124.5,3.9,1123.2,4.8],[0,4.2,1091.7,15.6,1091.5,16.0,1088.5,11.7,1090.2,8.3,1094.2,14.2,1093.7,15.2,1094.2,15.9,1093.3,17.9],[0,4.2,1088.3,16.4,1088.1,16.8,1085.1,12.5,1086.7,9.1,1090.8,15.0,1090.3,16.1,1090.8,16.7,1089.9,18.7],[0,4.2,1081.0,18.0,1080.8,18.5,1077.8,14.2,1079.5,10.7,1083.5,16.6,1083.1,17.7,1083.5,18.4,1082.6,20.4],[0,4.2,1077.5,18.8,1077.2,19.3,1074.2,14.9,1075.9,11.4,1080.0,17.4,1079.5,18.5,1080.0,19.2,1079.1,21.1],[0,4.2,1074.0,19.7,1073.7,20.1,1070.7,15.8,1072.4,12.3,1076.5,18.2,1076.0,19.3,1076.5,20.0,1075.6,22.0],[0,4.2,1070.4,20.6,1070.2,21.1,1067.2,16.8,1068.9,13.3,1073.0,19.2,1072.5,20.3,1073.0,21.0,1072.0,23.0],[0,4.3,1066.9,21.6,1066.7,22.1,1063.7,17.7,1065.4,14.2,1069.5,20.2,1069.0,21.3,1069.5,22.0,1068.6,24.0],[0,4.3,1063.4,22.5,1063.2,23.0,1060.2,18.6,1061.9,15.1,1066.0,21.1,1065.5,22.2,1066.0,22.9,1065.1,24.9],[0,4.3,1059.8,23.3,1059.6,23.8,1056.6,19.4,1058.3,15.9,1062.4,21.9,1062.0,23.0,1062.4,23.7,1061.5,25.7],[1,7.4,-1248.7,-84.2,-1250.3,-81.3,-1252.0,-77.7,-1254.3,-72.8,-1273.5,-105.8,-1267.9,-117.1],[1,7.6,-1172.3,-170.0,-1187.9,-119.5,-1211.7,-106.0,-1213.8,-129.6,-1205.5,-134.4,-1205.8,-137.4,-1207.8,-136.2,-1209.6,-158.7,-1236.3,-142.8,-1234.7,-123.3,-1237.5,-121.6,-1237.2,-117.9,-1239.1,-116.8,-1237.5,-100.0,-1232.7,-102.8,-1233.4,-110.4,-1231.9,-111.2,-1232.3,-115.5,-1228.6,-117.7,-1226.8,-98.1,-1246.2,-86.9,-1245.8,-83.3,-1246.3,-79.6,-1248.4,-78.2,-1250.3,-81.3,-1252.0,-77.7,-1249.0,-72.6,-1244.3,-75.1,-1242.7,-58.3,-1239.4,-60.0,-1238.3,-49.5,-1234.9,-46.7,-1230.0,-49.7,-1228.9,-41.1,-1223.8,-44.2,-1225.0,-52.8,-1220.5,-55.5,-1222.3,-69.2,-1223.0,-69.5,-1224.7,-85.9,-1221.9,-87.5,-1220.3,-72.0,-1215.5,-74.6,-1211.1,-77.1,-1212.8,-93.6,-1189.0,-106.9,-1184.2,-109.6,-1182.7,-114.7,-1180.2,-112.8,-1164.5,-164.2],[0,4.3,-931.8,491.8,-934.4,494.6,-935.1,496.9,-935.1,499.7,-934.0,503.3,-890.1,564.5,-888.7,566.0,-887.5,566.1,-883.1,560.8],[0,4.5,-853.7,528.1,-848.3,523.4,-848.3,521.7,-848.7,519.6,-894.1,456.9,-896.0,455.7,-897.3,456.1,-901.3,460.9],[0,4.8,-876.5,-93.0,-879.0,-83.9,-881.9,-85.4,-879.4,-94.5],[1,4.6,-952.4,-5.3,-956.4,24.5,-964.6,21.3,-961.2,-9.8],[1,7.7,-1202.5,62.7,-1204.6,72.2,-1201.9,74.6,-1203.1,80.0,-1197.7,84.7,-1198.6,88.5,-1197.2,89.7,-1199.2,99.0,-1200.8,97.6,-1202.4,105.2,-1204.1,103.7,-1208.0,122.3,-1224.4,108.0,-1224.0,106.1,-1223.2,102.5,-1220.4,104.9,-1219.4,101.5,-1209.5,110.6,-1205.9,93.5,-1216.2,84.6,-1215.4,80.9,-1218.1,78.5,-1217.1,74.3,-1214.4,62.1,-1216.3,60.4,-1215.9,58.6,-1214.3,60.1,-1212.8,53.7,-1210.0,56.2,-1209.5,53.9,-1204.4,58.2,-1204.9,60.6],[1,7.8,-1189.6,63.4,-1193.5,80.9,-1196.6,78.2,-1195.4,72.6,-1197.2,71.1,-1197.0,70.2,-1197.9,69.4,-1196.9,65.3,-1197.6,64.7,-1196.1,57.9],[1,7.9,-1160.0,74.6,-1162.0,83.7,-1160.3,85.2,-1162.5,95.2,-1160.9,96.6,-1165.4,117.4,-1163.7,118.9,-1165.9,129.7,-1187.8,110.8,-1188.5,114.1,-1194.6,108.8,-1192.2,97.8,-1196.3,94.3,-1194.5,85.8,-1176.3,101.4,-1170.7,75.9,-1168.1,78.1,-1166.1,69.4],[1,7.6,-1194.9,108.6,-1201.0,134.1,-1204.2,131.0,-1206.2,139.3,-1216.4,129.2,-1219.8,143.7,-1229.8,133.9,-1228.2,126.9,-1224.5,130.5,-1222.7,123.0,-1219.8,123.4,-1217.8,115.0,-1206.2,126.2,-1200.6,103.0],[1,7.7,-1182.0,38.5,-1187.4,58.5,-1195.9,50.2,-1195.5,48.6,-1200.0,44.2,-1202.9,55.0,-1205.1,52.9,-1201.7,40.3,-1202.7,39.3,-1207.4,55.0,-1213.4,49.5,-1208.7,30.2,-1207.3,24.7,-1205.9,18.8,-1188.3,35.9,-1187.5,33.1],[0,3.8,-1216.3,88.4,-1218.3,97.9,-1219.5,96.8,-1219.3,93.5,-1219.8,92.4,-1221.6,91.0,-1221.0,87.9,-1219.2,89.3,-1218.4,89.2,-1217.5,87.3],[1,4.4,-1001.6,-102.9,-1003.9,-92.1,-1005.0,-86.6,-1018.2,-98.1,-1014.2,-113.0],[0,5.5,-576.8,201.0,-576.0,177.7,-596.3,170.4,-598.0,192.6],[0,5.5,-594.4,140.6,-592.5,117.1,-631.5,107.5,-631.4,118.8],[0,6.5,359.3,37.0,357.9,23.8,359.7,23.1,358.8,19.5,345.7,20.6,346.1,24.7,347.2,24.7,349.1,38.4],[0,6.6,340.4,46.4,329.2,20.5,324.4,22.3,324.7,24.9,321.0,26.2,321.4,29.1,315.8,31.8,321.0,55.0,332.7,49.7,332.9,50.4,335.7,49.2,335.7,48.7],[0,1.8,1224.9,10.2,1225.0,9.7,1225.7,10.2,1225.6,10.7],[0,4.7,942.7,94.5,922.4,105.2,918.8,81.4,939.1,71.0],[0,7.5,-207.2,45.6,-206.5,72.8,-206.4,74.0,-222.1,74.1,-223.3,45.7],[0,7.6,-161.1,77.5,-165.6,77.2,-165.3,78.9,-172.6,78.8,-172.2,76.9,-177.9,77.0,-178.2,72.5,-179.5,45.4,-162.8,45.9,-161.4,72.5],[0,3.1,1342.5,-673.6,1340.8,-669.6,1342.0,-667.9,1342.5,-668.8,1347.2,-662.8,1347.0,-662.5,1347.3,-662.0,1347.6,-662.3,1349.5,-659.6,1349.4,-659.3,1349.8,-658.8,1349.9,-659.2,1351.6,-657.0,1353.0,-654.8,1353.4,-655.4,1352.0,-657.3,1352.7,-658.9,1352.3,-660.4,1352.3,-660.5,1351.5,-662.0,1350.7,-660.8,1347.3,-665.4,1347.7,-666.3,1347.2,-666.8,1343.9,-671.8],[0,3.1,1324.7,-695.7,1323.0,-691.7,1322.2,-692.7,1322.5,-693.2,1320.7,-695.6,1321.2,-696.6,1322.3,-695.3,1323.4,-697.4],[0,3.1,1323.1,-697.3,1322.3,-695.6,1321.0,-697.2,1319.4,-699.2,1320.3,-701.0]],"villas":"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","roads":[[443.7,18.9,441.6,19.6,439.3,20.3,436.2,22.3,433.4,25.0,431.3,27.8,430.1,30.2,428.5,35.1,428.4,38.3,428.2,45.1,430.2,80.5,430.4,91.1,430.7,132.2,428.1,180.1,424.5,233.9,419.5,281.7],[717.3,166.0,708.8,163.6,672.8,165.3,630.6,167.6,434.9,179.8,428.1,180.1],[260.4,354.3,171.2,354.3,126.5,352.4],[276.7,719.3,224.2,719.9,212.8,714.8,197.9,701.2,192.7,693.8,182.6,679.5,174.6,666.0,140.4,609.7,144.1,576.4,149.6,527.1,152.7,504.5,161.2,436.2,171.2,354.3],[-450.5,342.3,-441.2,260.5,-440.3,240.0,-440.7,219.8,-440.8,212.7],[-385.4,226.5,-385.8,234.2,-388.2,280.7,-388.9,363.1,-358.1,511.8,-287.1,522.4,-285.1,518.7,-303.4,432.8,-322.6,338.2,-332.2,246.2,-332.5,239.1],[-212.8,440.0,-303.4,432.8],[65.2,486.9,-130.2,495.6,-151.9,495.1,-170.9,494.4,-201.6,493.0],[161.2,436.2,260.4,354.3,281.8,334.8,300.1,317.7,304.1,310.1],[388.5,309.8,387.2,317.0,384.0,325.0,379.0,331.2],[285.6,310.4,284.1,317.6,281.8,334.8],[666.2,-16.9,631.8,-3.4,593.7,12.6,586.7,15.3,583.7,16.5,574.8,19.8,567.7,21.3,564.9,21.8,550.8,22.6,505.9,21.2,486.2,20.5,459.8,19.7,443.7,18.9],[631.9,126.1,440.8,131.8,430.7,132.2],[304.1,310.1,305.4,302.9,276.6,228.7,245.2,148.8,204.7,53.7],[366.1,74.6,305.5,112.2,245.2,148.8,139.8,205.5,69.8,240.0],[182.6,308.9,183.9,302.3,181.0,295.4,139.8,205.5,93.8,109.7],[15.7,84.0,19.7,293.8,19.8,300.8],[-514.3,33.5,-510.0,33.7,-505.9,33.9,-481.0,34.8,-476.7,37.2,-468.7,46.5,-458.3,55.8,-453.7,57.8,-433.5,56.6,-419.4,57.3,-387.7,61.3,-370.1,64.0,-367.4,64.4,-308.7,73.4,-273.0,78.9,-269.1,79.5,-236.4,81.9,-232.2,82.2,-177.7,85.9,-127.4,85.9,10.6,84.2,15.7,84.0],[-463.4,207.1,-463.5,200.2,-460.9,157.7,-453.7,57.8],[-460.9,157.7,-411.8,171.0,-408.0,172.0],[367.0,171.3,335.8,191.5,276.6,228.7],[280.6,47.9,283.2,42.5,285.7,38.2,285.2,35.0,283.5,32.9,281.2,32.3,278.5,33.0,276.8,35.2,276.9,37.5,278.1,41.8,280.6,47.9],[93.8,109.7,198.2,52.9,204.7,53.7],[-269.1,79.5,-269.4,84.5,-273.2,244.3,-273.1,252.7],[-408.8,190.9,-356.0,204.0,-304.2,215.5,-301.4,219.6,-299.7,238.6,-299.2,246.9],[-177.7,85.9,-177.5,90.3,-166.4,266.6,-165.2,275.0],[-504.0,196.8,-498.3,198.1,-463.4,207.1,-454.8,209.2,-440.8,212.7,-409.9,220.4,-385.4,226.5,-357.7,233.4,-332.5,239.1,-299.2,246.9,-273.1,252.7,-252.6,257.0,-243.7,258.8,-165.2,275.0,-140.3,279.3,-2.8,298.6,19.8,300.8,141.2,307.9,182.6,308.9,276.9,310.3,285.6,310.4,304.1,310.1,359.9,309.9,388.5,309.8],[379.0,331.2,149.6,527.1],[379.0,331.2,391.7,317.9,398.6,310.6],[419.5,281.7,417.9,288.0,415.9,292.5,412.5,298.4],[410.4,300.5,404.0,304.8,399.1,307.4,388.5,309.8],[388.5,309.8,398.6,310.6,403.4,311.8,407.8,313.9],[424.2,297.0,421.9,292.1,420.1,286.8,419.5,281.7],[-409.9,220.4,-409.3,212.9,-408.8,190.9,-408.0,172.0],[280.6,47.9,305.5,112.2,335.8,191.5],[-199.3,838.3,-177.8,834.8,-145.8,831.4,-141.2,829.8,-138.2,827.1,-137.2,823.9,-137.5,819.5,-138.3,813.5,-151.8,743.0,-165.9,676.5,-171.1,653.8,-173.3,644.1,-176.1,626.8,-180.1,602.6,-183.4,585.3,-195.2,529.9,-196.3,523.9,-201.6,493.0,-212.8,440.0,-226.8,360.9,-243.7,266.8,-243.7,258.8],[19.8,300.8,22.4,309.8,34.6,343.3,59.8,418.5,65.2,435.1,65.7,461.7,65.2,486.9,65.0,508.9,64.9,550.2],[-118.1,560.0,-130.2,495.6,-149.5,381.7,-163.7,282.6,-165.2,275.0],[410.4,300.5,408.7,303.1,407.5,305.9,406.9,308.7,407.0,311.5,407.8,313.9],[412.5,298.4,410.4,300.5],[424.2,297.0,421.7,295.8,418.7,295.6,415.5,296.5,412.5,298.4]],"lm":{"islet":[1368.2,-629.0,1369.6,-629.2,1372.7,-629.6,1376.5,-624.7,1378.5,-622.2,1381.5,-616.3,1385.1,-615.5,1388.4,-608.7,1391.5,-607.8,1390.5,-615.3,1388.6,-619.0,1382.4,-624.5,1381.3,-637.9,1380.0,-649.7,1381.8,-650.8,1395.1,-634.1,1397.9,-631.1,1436.3,-589.1,1444.9,-573.3,1457.8,-557.9,1465.2,-552.9,1500.5,-510.3,1515.2,-481.7,1521.2,-474.2,1518.8,-486.3,1521.9,-483.9,1548.4,-446.7,1549.1,-439.9,1560.5,-422.4,1563.8,-427.6,1568.2,-422.5,1571.7,-415.9,1577.5,-411.2,1578.4,-405.0,1587.8,-395.6,1592.3,-385.3,1599.2,-374.7,1603.6,-373.2,1607.6,-378.4,1609.8,-380.7,1599.4,-389.1,1581.4,-412.5,1471.9,-555.9,1439.9,-592.1,1432.7,-596.3,1392.1,-643.5,1362.9,-683.5,1354.0,-698.1,1341.8,-712.5,1330.4,-725.9,1328.0,-733.1,1325.5,-740.4,1324.4,-744.4,1325.2,-750.3,1329.7,-754.6,1330.3,-756.5,1324.1,-758.4,1319.6,-756.1,1316.7,-748.3,1318.9,-742.6,1317.7,-738.9,1314.3,-739.7,1310.1,-735.6,1310.2,-723.3,1308.2,-716.0,1312.6,-711.6,1313.2,-707.1,1311.4,-705.1,1310.5,-702.2,1310.0,-697.2,1310.3,-693.5,1310.8,-690.0,1309.7,-687.7,1310.3,-686.0,1311.1,-685.0,1311.0,-687.9,1312.0,-690.9,1313.4,-691.1,1314.5,-689.5,1314.6,-687.1,1313.8,-685.2,1317.5,-680.7,1321.0,-677.0,1324.3,-672.3,1327.4,-668.6,1327.5,-668.5,1329.3,-666.3,1331.4,-664.4,1334.7,-661.1,1337.6,-657.0,1342.1,-651.1,1345.4,-646.9,1349.7,-640.4,1351.5,-637.0,1351.2,-633.6,1352.3,-627.8,1352.7,-622.2,1353.8,-616.0,1353.3,-612.4,1353.8,-609.7,1355.7,-605.0,1358.9,-597.7,1361.0,-592.8,1362.1,-589.6,1364.5,-587.4,1366.8,-586.7,1370.0,-586.4,1373.0,-588.1,1374.5,-592.9,1374.6,-595.7,1371.7,-597.8,1371.4,-596.2,1370.7,-594.8,1368.7,-592.8,1365.4,-592.6,1363.9,-593.4,1361.2,-598.1,1357.4,-605.9,1355.4,-611.4,1355.7,-614.0,1356.2,-614.9,1357.7,-616.1,1359.5,-616.9,1360.7,-618.4,1362.5,-620.7,1363.5,-624.6],"rocks":[[1264.9,-785.4,1267.8,-784.4,1269.5,-782.5,1270.1,-778.1,1269.8,-774.8,1272.3,-775.2,1273.3,-777.7,1272.2,-781.4,1268.4,-785.3,1265.6,-787.3],[1275.0,-771.3,1276.3,-769.5,1278.3,-767.3,1279.4,-767.6,1280.9,-768.3,1282.6,-766.8,1283.6,-763.7,1283.5,-760.7,1281.2,-760.5,1278.1,-759.3,1279.3,-757.5,1281.7,-757.4,1285.7,-755.2,1288.0,-757.2,1290.5,-760.7,1293.5,-761.3,1296.3,-763.9,1297.0,-768.0,1296.8,-773.7,1295.0,-773.5,1295.1,-770.8,1293.6,-769.1,1291.2,-772.3,1287.9,-775.0,1286.3,-771.7,1287.8,-768.6,1286.9,-766.9,1284.5,-768.5,1283.6,-771.7,1282.4,-775.3,1280.7,-779.3,1279.3,-781.8,1278.0,-784.6,1276.4,-788.2,1275.2,-787.6,1274.9,-785.5,1278.1,-779.8,1280.0,-776.5,1278.3,-776.2,1277.0,-778.6,1276.4,-775.6,1276.2,-773.6],[1283.0,-803.3,1285.0,-800.9,1285.8,-798.8,1287.5,-796.0,1288.6,-792.7,1288.2,-791.1,1290.1,-788.6,1291.8,-790.3,1292.9,-791.9,1290.3,-795.5,1287.4,-801.0,1285.0,-804.0],[1251.2,-800.9,1251.8,-797.2,1251.0,-795.4,1252.9,-793.8,1254.1,-795.4,1253.3,-798.9],[1220.3,-800.4,1219.1,-798.2,1219.8,-795.1,1222.1,-794.6,1222.2,-800.4],[1280.7,-790.0,1281.2,-787.2,1282.4,-785.0,1283.5,-786.6,1282.7,-789.6],[1624.4,-360.1,1620.2,-363.3,1619.1,-359.8,1618.5,-352.4,1622.2,-343.6,1629.7,-337.3,1633.3,-333.9,1635.1,-334.3,1632.5,-339.0,1635.6,-336.8,1638.1,-332.8,1641.7,-327.3,1643.3,-324.1,1647.4,-315.7,1650.2,-307.1,1655.7,-297.3,1659.8,-295.4,1658.7,-300.0,1656.6,-303.7,1662.1,-297.5,1663.9,-292.4,1665.2,-296.2,1661.4,-301.0,1656.7,-309.9,1651.1,-319.5,1644.5,-329.8,1638.4,-340.7,1630.3,-351.5],[1667.8,-290.7,1666.8,-287.6,1666.6,-284.4,1670.4,-275.1,1672.3,-271.1,1678.6,-261.2,1687.3,-258.4,1691.3,-254.3,1693.0,-248.0,1695.3,-242.7,1695.4,-246.6,1694.3,-254.7,1691.9,-261.2,1687.3,-265.6,1683.2,-267.8,1679.2,-272.9,1675.4,-280.0,1672.0,-283.9],[1703.0,-241.0,1701.9,-238.3,1703.6,-234.3,1706.7,-232.7,1710.3,-229.3,1712.3,-223.5,1714.0,-217.0,1713.4,-227.8,1710.1,-235.2,1708.4,-239.0,1704.9,-241.9],[1720.2,-209.2,1719.1,-205.4,1718.9,-202.5,1720.1,-193.1,1720.2,-186.9,1720.5,-182.2,1724.4,-179.5,1728.2,-174.2,1730.8,-170.8,1733.5,-172.5,1736.4,-173.6,1740.2,-176.9,1736.1,-181.7,1732.9,-185.5,1728.6,-193.2,1726.4,-195.9,1723.5,-203.5],[1732.9,-166.4,1735.7,-158.5,1738.6,-157.7,1741.6,-150.5,1742.9,-147.4,1744.4,-149.2,1745.4,-152.7,1743.7,-159.8,1742.6,-166.2,1738.4,-167.6],[1455.4,-346.2,1450.0,-353.7,1447.1,-359.4,1450.3,-360.3,1458.0,-357.6,1453.4,-364.1,1440.4,-373.3,1430.1,-377.0,1422.9,-372.8,1415.7,-364.9,1408.2,-367.1,1398.9,-380.7,1387.2,-402.2,1383.3,-413.5,1386.0,-415.3,1381.9,-424.9,1373.0,-428.0,1362.5,-437.5,1353.3,-440.7,1352.4,-435.7,1356.1,-429.0,1363.3,-415.7,1377.4,-398.9,1389.8,-372.6,1402.1,-341.8,1411.0,-316.0,1417.0,-302.9,1421.8,-300.7,1428.7,-304.5,1435.5,-310.3,1445.7,-320.3,1451.8,-333.8],[1481.8,-435.9,1474.8,-450.3,1468.1,-463.3,1461.3,-476.2,1454.5,-485.0,1450.4,-488.1,1446.4,-495.2,1440.2,-507.4,1430.2,-518.8,1429.4,-514.3,1437.5,-504.1,1441.9,-495.8,1445.1,-492.8,1452.8,-482.3,1456.6,-478.0,1461.8,-470.5,1464.8,-466.5,1469.8,-456.9,1470.1,-452.5,1474.0,-445.0,1478.6,-436.6,1482.7,-426.2,1485.7,-423.7],[1553.9,-378.4,1552.1,-382.8,1550.0,-388.4,1546.7,-390.3,1543.7,-394.4,1543.5,-391.0,1544.9,-385.8,1546.0,-383.7,1547.9,-378.9,1548.9,-373.9,1551.4,-371.1,1552.9,-374.3]],"castle":[1344.5,-672.9,1345.6,-674.6,1347.4,-673.0,1348.4,-668.6,1350.2,-666.9,1350.1,-664.4,1351.5,-662.0,1352.3,-660.5,1352.6,-660.6,1355.9,-656.0,1354.1,-653.1,1353.2,-654.3,1352.1,-653.1,1350.9,-652.9,1349.7,-653.4,1348.0,-654.6,1347.2,-655.5,1346.2,-656.8,1345.1,-658.3,1344.2,-660.2,1343.5,-662.1,1343.2,-663.1,1342.9,-664.9,1343.0,-666.2,1322.5,-691.8,1323.4,-688.5,1324.2,-685.5,1322.8,-687.3,1317.6,-688.8,1314.1,-691.8,1312.8,-694.6,1312.2,-698.1,1316.9,-710.3,1317.7,-709.3,1317.7,-707.9,1323.5,-700.9,1323.1,-699.6,1326.7,-695.2,1331.6,-689.0,1332.0,-689.8,1334.1,-687.5,1336.2,-684.6,1335.8,-683.8],"inner":[[1342.5,-673.6,1340.8,-669.6,1342.0,-667.9,1342.5,-668.8,1347.2,-662.8,1347.0,-662.5,1347.3,-662.0,1347.6,-662.3,1349.5,-659.6,1349.4,-659.3,1349.8,-658.8,1349.9,-659.2,1351.6,-657.0,1353.0,-654.8,1353.4,-655.4,1352.0,-657.3,1352.7,-658.9,1352.3,-660.4,1352.3,-660.5,1351.5,-662.0,1350.7,-660.8,1347.3,-665.4,1347.7,-666.3,1347.2,-666.8,1343.9,-671.8],[1324.7,-695.7,1323.0,-691.7,1322.2,-692.7,1322.5,-693.2,1320.7,-695.6,1321.2,-696.6,1322.3,-695.3,1323.4,-697.4]],"light":[1354.5,-656.4,1352.7,-658.9,1352.0,-657.3,1353.4,-655.4,1353.7,-654.9],"pier":[1332.3,-672.8,1328.8,-667.0,1329.2,-666.5,1325.8,-660.9,1324.1,-663.3,1327.4,-668.8,1327.6,-668.6,1327.7,-668.4,1331.2,-674.4,1331.5,-674.0],"cs":0.4745,"torre":[-1721.8,-647.8,-1721.9,-648.0,-1721.9,-648.2,-1721.8,-648.5,-1721.7,-648.9,-1721.7,-648.9,-1721.5,-649.1,-1721.4,-649.4,-1721.4,-649.4,-1721.2,-649.5,-1721.1,-649.5,-1721.0,-649.5,-1720.9,-649.4,-1720.9,-649.2,-1720.9,-648.9,-1720.9,-648.7,-1721.1,-648.4,-1721.2,-648.1,-1721.4,-647.9,-1721.5,-647.8,-1721.7,-647.7,-1721.7,-647.7],"ts":0.3649,"torreH":12.41},"far":[["medina",-1305.0,2861.3,0.1249,68],["vejer",-3045.2,486.6,0.1299,124],["conil",-2609.7,-318.8,0.1917,140],["cadiz",2800.9,920.0,0.1468,331],["bridge",2558.3,1282.7,0.1587,339],["sanfernando",1820.2,1591.9,0.2324,354],["chiclana",304.1,2014.6,0.3193,34],["sanctipetri",1458.6,234.9,0.4862,321],["hotels",-1381.5,-226.3,0.5125,143]]};
function unRLE(s){const out=[];const re=/([a-z])(\d*)/g;let m;while((m=re.exec(s))){const n=m[2]?+m[2]:1;for(let k=0;k<n;k++)out.push(m[1]);}return out;}
function unRLEh(s){const out=[];s.split(',').forEach(tok=>{const p=tok.split('x');const v=+p[0],n=p[1]?+p[1]:1;for(let k=0;k<n;k++)out.push(v);});return out;}
function b64u8(s){const bin=atob(s),u=new Uint8Array(bin.length);for(let i=0;i<bin.length;i++)u[i]=bin.charCodeAt(i);return u;}
let terrainY=null;                      // (x,z) → ground height in the villa world
const geoRng=(()=>{let s=12345;return ()=>((s=(s*16807)%2147483647)/2147483647);})();
function flatShape(flat){const sh=new T.Shape();sh.moveTo(flat[0],-flat[1]);for(let i=2;i<flat.length;i+=2)sh.lineTo(flat[i],-flat[i+1]);sh.closePath();return sh;}
function extrudeFlat(flat,h,bevel){const g=new T.ExtrudeGeometry(flatShape(flat),{depth:h,bevelEnabled:!!bevel,bevelThickness:bevel||0,bevelSize:bevel||0,bevelSegments:2});g.rotateX(-Math.PI/2);return g;}
function centroidOf(flat){let x=0,z=0;const n=flat.length/2;for(let i=0;i<flat.length;i+=2){x+=flat[i];z+=flat[i+1];}return [x/n,z/n];}
const facadeTex=(()=>{const cv=document.createElement('canvas');cv.width=64;cv.height=64;const c=cv.getContext('2d');c.fillStyle='#f6f2ea';c.fillRect(0,0,64,64);_speck(c,64,300,14,1);
  c.fillStyle='#39434c';[[8,12],[36,12],[8,40],[36,40]].forEach(p=>c.fillRect(p[0],p[1],18,14));c.fillStyle='#d9cfbe';[[8,26],[36,26],[8,54],[36,54]].forEach(p=>c.fillRect(p[0]-2,p[1],22,3));
  const t=new T.CanvasTexture(cv);t.wrapS=t.wrapT=T.RepeatWrapping;t.encoding=T.sRGBEncoding;return t;})();
const hotelTex=(()=>{const cv=document.createElement('canvas');cv.width=64;cv.height=64;const c=cv.getContext('2d');c.fillStyle='#f3ede2';c.fillRect(0,0,64,64);
  for(let y=0;y<2;y++)for(let x=0;x<2;x++){c.fillStyle='#4a5560';c.fillRect(6+x*32,8+y*32,20,16);c.fillStyle='#e7dccb';c.fillRect(3+x*32,24+y*32,26,4);c.fillStyle='#9a6a44';c.fillRect(6+x*32,24+y*32,20,2);}
  const t=new T.CanvasTexture(cv);t.wrapS=t.wrapT=T.RepeatWrapping;t.repeat.set(0.33,0.33);t.encoding=T.sRGBEncoding;return t;})();
const groundDetail=mkTex((c,s)=>{c.fillStyle='#d8d8d8';c.fillRect(0,0,s,s);_speck(c,s,6000,40,2);for(let i=0;i<60;i++){const x=Math.random()*s,y=Math.random()*s,r=6+Math.random()*18;const g=c.createRadialGradient(x,y,0,x,y,r);g.addColorStop(0,'rgba(0,0,0,0.10)');g.addColorStop(1,'rgba(0,0,0,0)');c.fillStyle=g;c.fillRect(x-r,y-r,r*2,r*2);}},1,1);

function buildGeoVilla(){
  const G=GEO_V,TR=G.terrain,NA=TR.na,RR=TR.r,NR=RR.length,VZ=22;
  const cls=TR.c.map(unRLE),hts=TR.h.map(unRLEh);
  const near=(x,z)=>Math.abs(x)<700&&z>-47;
  const COL={a:0x1a5a78,b:0xe3d2a4,c:0x96985f,d:0x566a3b,e:0x80bd58,f:0xb4b889,g:0x7e8c6c,h:0x8fb45f,i:0xba8b58,j:0xaba16f};
  const pos=new Float32Array(NR*NA*3),colr=new Float32Array(NR*NA*3),uv=new Float32Array(NR*NA*2),Y=new Float32Array(NR*NA);
  const cc=new T.Color(),MTN_G=new T.Color(0x6c7c4a),MTN_R=new T.Color(0x9c998a),HAZE=new T.Color(0xa9b5c2);
  for(let ri=0;ri<NR;ri++){const r=RR[ri];for(let ai=0;ai<NA;ai++){const a=ai/NA*Math.PI*2,x=r*Math.sin(a),z=VZ-r*Math.cos(a),k=ri*NA+ai,c=cls[ri][ai];
    let y=c==='a'||(Math.abs(x)<760&&z<-44)?-1.6:(near(x,z)?-0.03:(z<-47?0.7:0.32))+hts[ri][ai]/2;
    Y[k]=y;pos[k*3]=x;pos[k*3+1]=y;pos[k*3+2]=z;uv[k*2]=x/9;uv[k*2+1]=z/9;
    cc.setHex(COL[c]);const nz=0.93+geoRng()*0.12;cc.multiplyScalar(nz);if(c==='f'&&near(x,z))cc.lerp(new T.Color(0x9fb074),0.45);
    {const hg=hts[ri][ai]/2;if(c!=='a'&&c!=='i'){if(hg>10)cc.lerp(MTN_G,Math.min(0.6,(hg-10)/40));if(hg>70)cc.lerp(MTN_R,Math.min(0.5,(hg-70)/160));}
     if(c!=='a')cc.lerp(HAZE,Math.min(0.55,1-Math.exp(-Math.pow(r/3800,1.5))));}
    colr[k*3]=cc.r;colr[k*3+1]=cc.g;colr[k*3+2]=cc.b;}}
  const idx=[];for(let ri=0;ri<NR-1;ri++)for(let ai=0;ai<NA;ai++){const a0=ri*NA+ai,a1=ri*NA+(ai+1)%NA,b0=(ri+1)*NA+ai,b1=(ri+1)*NA+(ai+1)%NA;idx.push(a0,a1,b0,a1,b1,b0);}
  const tg=new T.BufferGeometry();tg.setAttribute('position',new T.BufferAttribute(pos,3));tg.setAttribute('color',new T.BufferAttribute(colr,3));tg.setAttribute('uv',new T.BufferAttribute(uv,2));
  tg.setIndex(idx);tg.computeVertexNormals();
  const gd=groundDetail.clone();gd.needsUpdate=true;gd.repeat.set(1,1);
  const terr=new T.Mesh(tg,new T.MeshStandardMaterial({vertexColors:true,map:gd,roughness:0.96}));terr.receiveShadow=true;terr.userData.lin=true;world.add(terr);
  // ground height lookup (bilinear on the polar grid)
  terrainY=(x,z)=>{const r=Math.hypot(x,z-VZ);if(r<RR[0])return 0;let lo=0,hi=NR-1;if(r>=RR[hi])return Y[hi*NA];while(hi-lo>1){const m=(lo+hi)>>1;if(RR[m]<=r)lo=m;else hi=m;}
    let a=Math.atan2(x,VZ-z);if(a<0)a+=Math.PI*2;const fa=a/(Math.PI*2)*NA,a0=Math.floor(fa)%NA,a1=(a0+1)%NA,ta=fa-Math.floor(fa),tr=(r-RR[lo])/(RR[hi]-RR[lo]);
    const y0=Y[lo*NA+a0]*(1-ta)+Y[lo*NA+a1]*ta,y1=Y[hi*NA+a0]*(1-ta)+Y[hi*NA+a1]*ta;return y0*(1-tr)+y1*tr;};
  const sizeAt=(x,z)=>{const r=Math.max(20,Math.hypot(x,z-VZ));const d=G.B*(Math.exp(r/G.A)-1);return r/d;};   // game units per real metre here (1.31 next to the villa)
  const dm=new T.Object3D(),col=new T.Color();

  // ---- villas along the real streets: varied storeys, L-wings, roofs, colours, façades, walls, pools and trees ----
  const vb=b64u8(G.villas),dv=new DataView(vb.buffer),NV=vb.length/9;
  const V=[];for(let i=0;i<NV;i++){const o=i*9;V.push({x:dv.getInt16(o,true)/10,z:dv.getInt16(o+2,true)/10,w:dv.getUint8(o+4)/10,d:dv.getUint8(o+5)/10,h:dv.getUint8(o+6)/10,rot:dv.getUint8(o+7)/255*Math.PI*2,st:dv.getUint8(o+8)});}
  const mk=(geo,m,n,shadow)=>{const cap=Math.max(1,n),im=new T.InstancedMesh(geo,m,cap);im.instanceColor=new T.InstancedBufferAttribute(new Float32Array(cap*3).fill(1),3);im.count=0;im.castShadow=!!shadow;im.receiveShadow=true;im.frustumCulled=false;world.add(im);return im;};
  const winTex=(modern)=>{const cv=document.createElement('canvas');cv.width=cv.height=64;const c=cv.getContext('2d');c.fillStyle='#ffffff';c.fillRect(0,0,64,64);_speck(c,64,160,12,1);
    if(modern){c.fillStyle='#2a3440';c.fillRect(6,14,52,34);c.fillStyle='#8a929a';c.fillRect(6,46,52,3);c.fillRect(31,14,2,34);}
    else{c.fillStyle='#34404a';c.fillRect(22,14,20,28);c.fillStyle=['#2f5a3a','#2f5f8a','#6b4a2e'][Math.floor(geoRng()*3)];c.fillRect(13,14,8,28);c.fillRect(43,14,8,28);c.fillStyle='#d9cfbe';c.fillRect(19,42,26,3);}
    const t=new T.CanvasTexture(cv);t.wrapS=t.wrapT=T.RepeatWrapping;t.encoding=T.sRGBEncoding;return t;};
  const texC=[winTex(false),winTex(false),winTex(true)];
  const bodyG=(storeys,across)=>{const g=new T.BoxGeometry(1,1,1).translate(0,0.5,0),uv=g.attributes.uv;
    for(let f=0;f<6;f++)for(let k=0;k<4;k++){const i=f*4+k;if(f===2||f===3){uv.setXY(i,0.02,0.02);continue;}uv.setXY(i,uv.getX(i)*(f<2?Math.max(1,across-1):across),uv.getY(i)*storeys);}return g;};
  const R=geoRng,pick=a=>a[Math.floor(R()*a.length)];
  const WALLS=[0xf6f3ec,0xf6f3ec,0xf6f3ec,0xf3ecdf,0xf6f3ec,0xefe2c8,0xeed7b4,0xe9c79c,0xf0d6c8,0xf3e6b8,0xe4e0d8],TERRA=[0xb85a32,0xa94f2c,0xc4663a,0x9e4a2a,0xb66a40];
  const GROUND=[0x7fa653,0x6f9848,0x8aae5c,0xd9cdb0,0xcbbf9e,0xb9774e,0x9aad6a];
  const hipG=new T.ConeGeometry(0.72,1,4,1).rotateY(Math.PI/4).translate(0,0.5,0),slabG=new T.BoxGeometry(1,1,1).translate(0,0.5,0);
  const cyprG=new T.ConeGeometry(1,1,7).translate(0,0.5,0),trunkG=new T.CylinderGeometry(0.5,0.7,1,5,1,true).translate(0,0.5,0),crownG=new T.IcosahedronGeometry(1,0),roundG=new T.IcosahedronGeometry(1,1);
  const plain=new T.MeshStandardMaterial({color:0xffffff,roughness:0.9}),poolM=new T.MeshStandardMaterial({color:0x3fb8d6,roughness:0.08,metalness:0.2});
  [0,1].forEach(pass=>{const list=V.filter(v=>(Math.hypot(v.x,v.z-VZ)<260)===(pass===0)),shadow=pass===0,N=list.length;
    const bodies={};[1,2,3].forEach(s=>texC.forEach((t,ti)=>{bodies[s+'_'+ti]=mk(bodyG(s,3),new T.MeshStandardMaterial({map:t,roughness:0.85}),N*2,shadow);}));
    const hips=mk(hipG,plain,N*2,shadow),slabs=mk(slabG,plain,N*3,shadow),pools=mk(slabG,poolM,N,false),grounds=mk(slabG,plain,N,false);
    const walls=pass===0?mk(slabG,plain,N*4,false):null,cypr=mk(cyprG,plain,N*2,shadow),trunks=mk(trunkG,plain,N*2,shadow),crowns=mk(crownG,plain,N*2,shadow),rounds=mk(roundG,plain,N*2,shadow);
    const put=(im,px,py,pz,ry,sx,sy,sz,c)=>{dm.position.set(px,py,pz);dm.rotation.set(0,ry,0);dm.scale.set(sx,sy,sz);dm.updateMatrix();const k=im.count++;im.setMatrixAt(k,dm.matrix);if(c!=null){col.setHex(c);im.setColorAt(k,col);}};
    const Y=new T.Vector3(0,1,0),off=(v,ry,a,b)=>{const o=new T.Vector3(a,0,b).applyAxisAngle(Y,ry);return [v.x+o.x,v.z+o.z];};
    list.forEach(v=>{const s=v.h/6.7,y=terrainY(v.x,v.z),ry=v.rot+(R()-0.5)*0.22,wall=pick(WALLS),ti=R()<0.3?2:(R()<0.5?0:1);
      const storeys=R()<0.3?1:(R()<0.9||v.w<17?2:3),H=storeys*3.2*s,W=v.w*(0.75+R()*0.45),D=v.d*(0.75+R()*0.4);
      // plot ground (lawn, gravel or terracotta) and a low garden wall near the villa
      const PW=W*1.7,PD=D*2.2;const [gx,gz]=off(v,ry,0,D*0.35);put(grounds,gx,y+0.02,gz,ry,PW,0.06,PD,pick(GROUND));
      if(walls){const wc=R()<0.7?0xf4f0e6:0xe9dcc4,wh=1.3*s;[[0,PD/2,PW,0.18],[0,-PD/2,PW,0.18],[PW/2,0,0.18,PD],[-PW/2,0,0.18,PD]].forEach(q=>{const [wx,wz]=off({x:gx,z:gz},ry,q[0],q[1]);put(walls,wx,y,wz,ry,q[2]*1.0+0.05,wh,q[3]+0.05,wc);});}
      // main block
      put(bodies[storeys+'_'+ti],v.x,y,v.z,ry,W,H,D,wall);
      const roofType=R();
      if(roofType<0.42){put(hips,v.x,y+H,v.z,ry,W*1.04,Math.min(W,D)*0.32,D*1.04,pick(TERRA));}
      else{put(slabs,v.x,y+H,v.z,ry,W+0.3,0.55*s,D+0.3,R()<0.5?0xf2eee6:0xe2dbcf);
        if(roofType>0.8){const [tx,tz]=off(v,ry,W*0.25,-D*0.2);put(bodies['1_'+ti],tx,y+H,tz,ry,W*0.35,2.8*s,D*0.4,wall);put(slabs,tx,y+H+2.8*s,tz,ry,W*0.37,0.4*s,D*0.42,0xe6e0d6);}}
      // L-shaped wing
      if(R()<0.5){const ws=R()<0.5?1:Math.min(storeys,2),ww=W*(0.4+R()*0.2),wd=D*(0.55+R()*0.35),side=R()<0.5?-1:1;const [wx,wz]=off(v,ry,side*(W/2+ww/2-0.2),D*0.2);const wh=ws*3.2*s;
        put(bodies[ws+'_'+ti],wx,y,wz,ry,ww,wh,wd,wall);
        if(roofType<0.42)put(hips,wx,y+wh,wz,ry,ww*1.05,Math.min(ww,wd)*0.32,wd*1.05,pick(TERRA));else put(slabs,wx,y+wh,wz,ry,ww+0.3,0.5*s,wd+0.3,0xefebe3);}
      // pool in front
      if(R()<0.65){const [px,pz]=off(v,ry,(R()-0.5)*W*0.4,D*0.5+D*0.45);put(pools,px,y+0.05,pz,ry,W*(0.35+R()*0.25),0.1,D*(0.25+R()*0.12));}
      // garden trees: palms, cypresses, orange trees
      const nt=1+Math.floor(R()*3);for(let k=0;k<nt;k++){const [tx,tz]=off(v,ry,(R()<0.5?-1:1)*(W*0.55+R()*W*0.25),(R()-0.2)*PD*0.45),kind=R();
        if(kind<0.35){const h=(7+R()*5)*s;put(trunks,tx,y,tz,0,0.28*s,h,0.28*s,0x8a7458);put(crowns,tx,y+h,tz,R()*3,2.3*s,0.7*s,2.3*s,0x4f7a38);}
        else if(kind<0.65){const h=(6+R()*5)*s;put(cypr,tx,y,tz,0,0.8*s,h,0.8*s,0x2f4a2a);}
        else{put(trunks,tx,y,tz,0,0.18*s,1.4*s,0.18*s,0x6e5238);put(rounds,tx,y+1.4*s+1.2*s,tz,R()*3,1.5*s,1.25*s,1.5*s,R()<0.5?0x4d7a34:0x5e8a3e);}}});
  });

  // ---- stone pines on the real forests (plus garden trees in the urbanizaciones) ----
  const pines=[];
  for(let ri=0;ri<NR-1&&pines.length<7500;ri++){const r=RR[ri],dr=RR[ri+1]-r,area=r*(Math.PI*2/NA)*dr,sz=sizeAt(0,VZ+r);
    for(let ai=0;ai<NA;ai++){const c=cls[ri][ai],spac=c==='d'?14:c==='c'?30:c==='f'?36:0;if(!spac)continue;
      const sp=spac*sz;let n=Math.min(c==='d'?3:1.2,area/(sp*sp));
      while(n>0){if(n<1&&geoRng()>n)break;n-=1;const a=(ai+geoRng())/NA*Math.PI*2,rr=r+geoRng()*dr,x=rr*Math.sin(a),z=VZ-rr*Math.cos(a);
        if(Math.abs(x)<66&&z>-50&&z<60)continue;if(z<-40&&near(x,z))continue;pines.push({x,z,s:sizeAt(x,z)*(0.8+geoRng()*0.5)});}}}
  const trunkGeo=new T.CylinderGeometry(0.1,0.16,1,4,1,true).translate(0,0.5,0),crownGeo=new T.SphereGeometry(1,8,4);
  const pos2=crownGeo.attributes.position;for(let k=0;k<pos2.count;k++){const y=pos2.getY(k);pos2.setY(k,y>0?y*0.42:y*0.18);}crownGeo.computeVertexNormals();
  const trunkM=new T.MeshStandardMaterial({color:0x6e5238,roughness:1}),crownM=new T.MeshStandardMaterial({color:0xffffff,roughness:0.95});
  [0,1].forEach(pass=>{const list=pines.filter(p=>(Math.hypot(p.x,p.z-VZ)<240)===(pass===0));
    const tr=mk(trunkGeo,trunkM,list.length,pass===0),cr=mk(crownGeo,crownM,list.length,pass===0);tr.count=cr.count=list.length;
    list.forEach((p,i)=>{const y=terrainY(p.x,p.z),h=13*p.s,w=5*p.s;dm.rotation.set(0,geoRng()*6,0);
      dm.position.set(p.x,y,p.z);dm.scale.set(w*0.9,h*0.82,w*0.9);dm.updateMatrix();tr.setMatrixAt(i,dm.matrix);
      dm.position.set(p.x+(geoRng()-0.5)*w*0.3,y+h*0.84,p.z+(geoRng()-0.5)*w*0.3);dm.scale.set(w,w*1.1,w*(0.85+geoRng()*0.3));dm.updateMatrix();cr.setMatrixAt(i,dm.matrix);
      col.setHSL(0.24+geoRng()*0.05,0.38+geoRng()*0.15,0.22+geoRng()*0.08);cr.setColorAt(i,col);});});
  world.userData.pineCount=pines.length;

  // ---- real OSM buildings (hotel strip at Novo Sancti Petri etc.) ----
  const wallM=new T.MeshStandardMaterial({map:hotelTex,roughness:0.85}),terraM=mat(0xb35a34,{roughness:0.9}),flatRoofM=mat(0xd8d2c6,{roughness:0.9});
  {const bg=new T.Group();world.add(bg);G.bld.forEach(b=>{const kind=b[0],h=Math.max(0.8,b[1]),flat=b.slice(2);const c=centroidOf(flat);
    const geo=extrudeFlat(flat,h);const m=new T.Mesh(geo,[kind===1?terraM:flatRoofM,wallM]);m.position.y=terrainY(c[0],c[1]);m.castShadow=Math.hypot(c[0],c[1]-VZ)<300;m.receiveShadow=true;bg.add(m);});
   mergeStatic(bg);}

  // ---- the real residential streets near the villa ----
  {const P=[],I=[];G.roads.forEach(r=>{for(let i=0;i+3<r.length;i+=2){const x0=r[i],z0=r[i+1],x1=r[i+2],z1=r[i+3],dx=x1-x0,dz=z1-z0,L=Math.hypot(dx,dz)||1,w=3.2*sizeAt(x0,z0),nx=-dz/L*w,nz=dx/L*w;
      if((Math.abs(x0)<64&&z0>-50&&z0<58)||(Math.abs(x1)<64&&z1>-50&&z1<58))continue;
      const y0=terrainY(x0,z0)+0.05,y1=terrainY(x1,z1)+0.05,b=P.length/3;P.push(x0+nx,y0,z0+nz,x0-nx,y0,z0-nz,x1+nx,y1,z1+nz,x1-nx,y1,z1-nz);I.push(b,b+2,b+1,b+1,b+2,b+3);}});
   const rg=new T.BufferGeometry();rg.setAttribute('position',new T.Float32BufferAttribute(P,3));rg.setIndex(I);rg.computeVertexNormals();
   const road=new T.Mesh(rg,mat(0x5b5c5e,{roughness:0.9}));road.receiveShadow=true;world.add(road);}

  // ---- Sancti Petri islet: castle, lighthouse, pier (true outline from OSM) ----
  {const L=G.lm,cs=L.cs,ex=2.0;
   const islet=new T.Mesh(extrudeFlat(L.islet,1.4,0.25),mat(0xcbb993,{roughness:1}));islet.position.y=-1.1;islet.receiveShadow=true;world.add(islet);
   const reefM=mat(0x4f5a52,{roughness:0.35,metalness:0.1});L.rocks.forEach(r=>{const m=new T.Mesh(extrudeFlat(r,0.9,0.15),reefM);m.position.y=-0.75;world.add(m);});
   {const cc=centroidOf(L.castle),mound=new T.Mesh(new T.CylinderGeometry(9,13,2.2,12),mat(0x8f8472,{roughness:1}));mound.scale.set(1.9,1,0.9);mound.rotation.y=Math.atan2(L.castle[2]-L.castle[0],L.castle[3]-L.castle[1]);mound.position.set(cc[0],0.2,cc[1]);world.add(mound);}
   const stone=mat(0xd2c19d,{roughness:0.95}),stoneD=mat(0xb9a67f,{roughness:0.95});
   const wall=new T.Mesh(extrudeFlat(L.castle,10*cs*ex),[stoneD,stone]);wall.position.y=1.2;wall.castShadow=true;world.add(wall);
   L.inner.forEach(f=>{const m=new T.Mesh(extrudeFlat(f,13*cs*ex),[stoneD,stone]);m.position.y=1.2;world.add(m);});
   const lc=centroidOf(L.light),lh=20*cs*ex;
   const tower=new T.Mesh(new T.BoxGeometry(2.6*cs*ex*1.6,lh,2.6*cs*ex*1.6),stone);tower.position.set(lc[0],1.2+lh/2,lc[1]);tower.castShadow=true;world.add(tower);
   const lant=new T.Mesh(new T.CylinderGeometry(0.9*cs*ex*1.4,0.9*cs*ex*1.4,1.8*cs*ex,10),new T.MeshStandardMaterial({color:0xfff6d8,emissive:0xfff0b0,emissiveIntensity:0.4,roughness:0.2}));lant.position.set(lc[0],1.2+lh+0.9*cs*ex,lc[1]);world.add(lant);
   const beam=new T.Mesh(new T.SphereGeometry(2.2,10,8),new T.MeshBasicMaterial({color:0xfff2c0,transparent:true,opacity:0,fog:false,depthWrite:false}));beam.position.copy(lant.position);world.add(beam);world.userData.lighthouse={lant,beam};
   const pier=new T.Mesh(extrudeFlat(L.pier,0.5),mat(0xc9c2b2,{roughness:0.9}));pier.position.y=0.5;world.add(pier);
   // Torre del Puerco watchtower on its cliff
   const tc=centroidOf(L.torre),th=7*L.ts*2.2,tr=Math.max(1.1,4*L.ts*2.2);
   const torre=new T.Mesh(new T.CylinderGeometry(tr*0.9,tr,th,14),mat(0xcdb68e,{roughness:1}));torre.position.set(tc[0],terrainY(tc[0],tc[1])+th/2,tc[1]);torre.castShadow=true;world.add(torre);}

  // ---- distant towns on the true bearings: white pueblos, Cádiz and the Constitution bridge ----
  const houseM=new T.MeshStandardMaterial({color:0xffffff,roughness:0.9});
  const town=(nm,n,radM,hM,tower)=>{const f=G.far.find(q=>q[0]===nm);if(!f)return;const [,fx,fz,s]=f;const list=[];
    for(let i=0;i<n;i++){const a=geoRng()*Math.PI*2,rr=Math.sqrt(geoRng())*radM*s,x=fx+Math.cos(a)*rr,z=fz+Math.sin(a)*rr;list.push({x,z,w:(8+geoRng()*14)*s,h:hM*(0.6+geoRng()*0.8)*s,rot:geoRng()*3});}
    const im=mk(slabG,houseM,list.length,false);im.count=list.length;list.forEach((v,i)=>{dm.position.set(v.x,terrainY(v.x,v.z),v.z);dm.rotation.set(0,v.rot,0);dm.scale.set(v.w,v.h,v.w*0.8);dm.updateMatrix();im.setMatrixAt(i,dm.matrix);col.setHex(WALLS[i%5]);im.setColorAt(i,col);});
    if(tower){const t=new T.Mesh(new T.BoxGeometry(12*s,tower*s,12*s),mat(0xefe6d2));t.position.set(fx,terrainY(fx,fz)+tower*s/2,fz);world.add(t);}};
  town('medina',140,420,9,38);town('vejer',120,380,9,32);town('conil',160,700,9,24);town('sanfernando',180,1400,12,0);town('chiclana',160,1200,10,0);town('sanctipetri',30,160,7,0);town('cadiz',260,1100,18,0);
  {const f=G.far.find(q=>q[0]==='cadiz');if(f){const [,x,z,s]=f;const dome=new T.Mesh(new T.SphereGeometry(28*s,14,8,0,Math.PI*2,0,Math.PI/2),mat(0xd9a93a,{roughness:0.4,metalness:0.4}));dome.position.set(x,terrainY(x,z)+34*s,z);world.add(dome);
     [[-40,0],[40,0]].forEach(o=>{const t=new T.Mesh(new T.BoxGeometry(12*s,70*s,12*s),mat(0xe9dfc8));t.position.set(x+o[0]*s,terrainY(x,z)+35*s,z);world.add(t);});}}
  {const f=G.far.find(q=>q[0]==='bridge');if(f){const [,x,z,s]=f;const pm=mat(0xe8e8ea);
     [[-270,0],[270,0]].forEach(o=>{const p=new T.Mesh(new T.BoxGeometry(14*s,185*s,14*s),pm);p.position.set(x+o[0]*s*0.5,92*s,z+o[0]*s*0.85);world.add(p);});
     const deck=new T.Mesh(new T.BoxGeometry(30*s,6*s,1400*s),pm);deck.position.set(x,69*s,z);deck.rotation.y=Math.atan2(0.5,0.85);world.add(deck);}}
}

// ===================== ACTIVITY PROPS (realism pass) =====================
// map a texture in world units (box projection) so bricks, slats and boards keep their real size on any shape
function worldUV(o,tw,th){const g=o.geometry=o.geometry.clone(),p=g.attributes.position,n=g.attributes.normal,uv=g.attributes.uv;if(!uv||!n)return o;
  const ws=new T.Vector3();o.updateMatrixWorld(true);o.getWorldScale(ws);th=th||tw;
  for(let i=0;i<p.count;i++){const x=p.getX(i)*ws.x,y=p.getY(i)*ws.y,z=p.getZ(i)*ws.z,ax=Math.abs(n.getX(i)),ay=Math.abs(n.getY(i)),az=Math.abs(n.getZ(i));
    if(ay>ax&&ay>az)uv.setXY(i,x/tw,z/tw);else if(ax>=az)uv.setXY(i,z/tw,y/th);else uv.setXY(i,x/tw,y/th);}
  uv.needsUpdate=true;return o;}
function cvTex(w,h,draw,wrap){const cv=document.createElement('canvas');cv.width=w;cv.height=h;const c=cv.getContext('2d');draw(c,w,h);const t=new T.CanvasTexture(cv);t.encoding=T.sRGBEncoding;t.anisotropy=4;if(wrap)t.wrapS=t.wrapT=T.RepeatWrapping;return t;}
function _grain(c,w,h,n,rgb,horiz){for(let i=0;i<n;i++){c.strokeStyle='rgba('+rgb+','+(0.04+Math.random()*0.1).toFixed(3)+')';c.lineWidth=0.6+Math.random();c.beginPath();const o=Math.random()*6;
  if(horiz){const y=Math.random()*h;c.moveTo(0,y);for(let x=0;x<=w;x+=16)c.lineTo(x,y+Math.sin(x*0.05+o)*1.5);}else{const x=Math.random()*w;c.moveTo(x,0);for(let y=0;y<=h;y+=16)c.lineTo(x+Math.sin(y*0.05+o)*1.5,y);}c.stroke();}}
// a straight rod between two points
function rod(a,b,r,m,seg){const d=new T.Vector3().subVectors(b,a),L=d.length(),o=new T.Mesh(new T.CylinderGeometry(r,r,L,seg||6),m);o.position.copy(a).addScaledVector(d,0.5);o.quaternion.setFromUnitVectors(new T.Vector3(0,1,0),d.normalize());o.castShadow=true;return o;}
// teardrop flame sprite texture, computed in JS (hot = yellow/orange wood fire, else blue gas)
function flameTex(hot){const w=32,h=64,d=new Uint8Array(w*h*4);
  for(let y=0;y<h;y++)for(let x=0;x<w;x++){const v=y/(h-1),u=(x+0.5)/w*2-1,half=Math.sin(Math.PI*Math.pow(v,0.6))*0.9,e=half>0.01?Math.abs(u)/half:9;
    let a=Math.max(0,1-e);a=a*a*(3-2*a)*Math.min(1,v*8)*(1-Math.pow(v,3));const core=Math.max(0,1-e*1.7)*(1-v),i=(y*w+x)*4;
    if(hot){d[i]=255;d[i+1]=Math.round(80+150*core+30*(1-v));d[i+2]=Math.round(15+190*core*core);}else{d[i]=Math.round(70+160*core);d[i+1]=Math.round(120+120*core);d[i+2]=255;}
    d[i+3]=Math.round(Math.min(1,a)*255);}
  const t=new T.DataTexture(d,w,h,T.RGBAFormat);t.magFilter=T.LinearFilter;t.minFilter=T.LinearFilter;t.needsUpdate=true;return t;}

// ---- textures (all opaque canvases, so Safari's canvas noise is invisible on them) ----
const slatT=cvTex(256,256,(c,w,h)=>{const C=['#c28a55','#b67d49','#cb9660','#b07645','#bd8550'];for(let i=0;i<8;i++){const y=i*32;c.fillStyle=C[Math.floor(Math.random()*C.length)];c.fillRect(0,y,w,32);
  c.fillStyle='rgba(255,235,200,0.28)';c.fillRect(0,y+1,w,2);c.fillStyle='rgba(40,20,8,0.85)';c.fillRect(0,y+29,w,3);}
  _grain(c,w,h,90,'90,50,20',true);for(let k=0;k<6;k++){c.fillStyle='rgba(80,40,15,0.5)';c.beginPath();c.ellipse(Math.random()*w,Math.random()*h,5,2.5,0,0,Math.PI*2);c.fill();}_speck(c,w,800,14,1);},true);
const boardT=cvTex(256,256,(c,w,h)=>{for(let i=0;i<8;i++){const x=i*32,g=Math.round(236*(0.9+Math.random()*0.1));c.fillStyle='rgb('+g+','+Math.round(g*0.97)+','+Math.round(g*0.92)+')';c.fillRect(x,0,32,h);
  c.fillStyle='rgba(60,45,30,0.55)';c.fillRect(x+30,0,2,h);c.fillStyle='rgba(255,255,255,0.25)';c.fillRect(x+1,0,1,h);}_grain(c,w,h,110,'120,95,70',false);_speck(c,w,1200,16,1);},true);
const shingleT=cvTex(256,256,(c,w,h)=>{c.fillStyle='#2b2d30';c.fillRect(0,0,w,h);for(let r=0;r<8;r++)for(let k=-1;k<5;k++){const x=k*64+(r%2?32:0),y=r*32,v=Math.random()*18;
  c.fillStyle='rgb('+Math.round(52+v)+','+Math.round(54+v)+','+Math.round(58+v)+')';c.fillRect(x+2,y+2,60,28);c.fillStyle='rgba(0,0,0,0.35)';c.fillRect(x+2,y+26,60,4);}_speck(c,w,2500,26,1);},true);
const sandCT=cvTex(128,128,(c,w,h)=>{c.fillStyle='#e2cb98';c.fillRect(0,0,w,h);_speck(c,w,3500,46,1);for(let i=0;i<400;i++){c.fillStyle='rgba(110,80,40,0.28)';c.fillRect(Math.random()*w,Math.random()*h,1,1);}},true);
const waffleT=cvTex(128,128,(c,w,h)=>{c.fillStyle='#d9a05c';c.fillRect(0,0,w,h);_speck(c,w,700,30,1);c.strokeStyle='#a66c36';c.lineWidth=3;
  for(let i=-w;i<w*2;i+=16){c.beginPath();c.moveTo(i,0);c.lineTo(i+h,h);c.stroke();c.beginPath();c.moveTo(i,h);c.lineTo(i+h,0);c.stroke();}},true);
const paellaT=cvTex(512,512,(c,w)=>{const r=w/2;c.fillStyle='#94541a';c.fillRect(0,0,w,w);
  const g=c.createRadialGradient(r,r,0,r,r,r);g.addColorStop(0,'#ebb94a');g.addColorStop(0.68,'#e2a538');g.addColorStop(0.9,'#c47f27');g.addColorStop(1,'#8f5018');c.fillStyle=g;c.beginPath();c.arc(r,r,r,0,Math.PI*2);c.fill();
  for(let i=0;i<15000;i++){const a=Math.random()*Math.PI*2,d=Math.sqrt(Math.random())*r*0.985;c.save();c.translate(r+Math.cos(a)*d,r+Math.sin(a)*d);c.rotate(Math.random()*3.2);const v=Math.random();
    c.fillStyle=v<0.5?'rgba(252,226,148,0.75)':v<0.8?'rgba(214,150,52,0.7)':'rgba(140,84,28,0.6)';c.beginPath();c.ellipse(0,0,3.4,1.5,0,0,Math.PI*2);c.fill();c.restore();}
  const blob=(n,f)=>{for(let i=0;i<n;i++){const a=Math.random()*Math.PI*2,d=Math.sqrt(Math.random())*r*0.86;c.save();c.translate(r+Math.cos(a)*d,r+Math.sin(a)*d);c.rotate(Math.random()*6.3);f();c.restore();}};
  blob(16,()=>{c.fillStyle='#c42a1c';c.fillRect(-26,-4,52,8);c.fillStyle='rgba(255,150,130,0.5)';c.fillRect(-24,-3,48,2);});       // roasted red pepper strips
  blob(14,()=>{c.fillStyle='#5f8f2c';c.fillRect(-18,-5,36,10);c.fillStyle='rgba(30,60,10,0.5)';c.fillRect(-18,3,36,2);});           // flat green beans
  blob(80,()=>{c.fillStyle='#6ea83a';c.beginPath();c.arc(0,0,5,0,Math.PI*2);c.fill();c.fillStyle='rgba(225,255,190,0.6)';c.beginPath();c.arc(-1.5,-1.5,1.6,0,Math.PI*2);c.fill();});   // peas
  blob(8,()=>{c.fillStyle='rgba(55,85,35,0.85)';for(let k=0;k<7;k++){c.fillRect(k*4-14,-1,3,2);c.fillRect(k*4-14,k%2?-5:3,1.5,4);}});   // rosemary
});
const citrusT=(rind,flesh)=>cvTex(64,64,(c,w)=>{const r=w/2;c.fillStyle=rind;c.fillRect(0,0,w,w);c.fillStyle='#fff4d6';c.beginPath();c.arc(r,r,r*0.86,0,Math.PI*2);c.fill();
  for(let k=0;k<10;k++){const a0=k/10*Math.PI*2+0.06,a1=(k+1)/10*Math.PI*2-0.06;c.fillStyle=flesh;c.beginPath();c.moveTo(r,r);c.arc(r,r,r*0.78,a0,a1);c.closePath();c.fill();}});
const menuT=cvTex(256,384,(c,w,h)=>{c.fillStyle='#8a5a32';c.fillRect(0,0,w,h);c.fillStyle='#1f2825';c.fillRect(14,14,w-28,h-28);
  for(let i=0;i<14;i++){const x=20+Math.random()*(w-40),y=20+Math.random()*(h-40),g=c.createRadialGradient(x,y,0,x,y,40);g.addColorStop(0,'rgba(255,255,255,0.05)');g.addColorStop(1,'rgba(255,255,255,0)');c.fillStyle=g;c.fillRect(x-40,y-40,80,80);}
  c.textAlign='center';c.fillStyle='#f6e27a';c.font='bold 40px Georgia, serif';c.fillText('HELADOS',w/2,62);c.strokeStyle='rgba(255,255,255,0.7)';c.lineWidth=2;c.beginPath();c.moveTo(40,76);c.lineTo(w-40,76);c.stroke();
  const it=[['Fresa','2€','#f4a6b8'],['Chocolate','2€','#d8b08c'],['Pistacho','2,50€','#b8dc8a'],['Limón','2€','#fff2a0'],['Vainilla','2€','#fbf3dc'],['Turrón','2,50€','#f0d6a8'],['Polo de hielo','1,50€','#9fd8f4']];
  c.font='24px Georgia, serif';it.forEach((q,i)=>{const y=116+i*36;c.textAlign='left';c.fillStyle=q[2];c.fillText(q[0],30,y);c.textAlign='right';c.fillStyle='#ffffff';c.fillText(q[1],w-30,y);});
  c.textAlign='center';c.font='italic 20px Georgia, serif';c.fillStyle='#ffffff';c.fillText('¡Fresquitos!',w/2,h-30);});
const signT=cvTex(512,96,(c,w,h)=>{c.fillStyle='#1f5f8e';c.fillRect(0,0,w,h);c.strokeStyle='#f7f2e6';c.lineWidth=5;c.strokeRect(8,8,w-16,h-16);
  c.fillStyle='#f7f2e6';c.textAlign='center';c.textBaseline='middle';let fs=46;c.font='bold '+fs+'px Georgia, serif';const tw=c.measureText('CHIRINGUITO · HELADOS').width;if(tw>w-60){fs=Math.floor(fs*(w-60)/tw);c.font='bold '+fs+'px Georgia, serif';}c.fillText('CHIRINGUITO · HELADOS',w/2,h/2+2);_speck(c,w,900,30,1);});
const freezerT=cvTex(256,128,(c,w,h)=>{c.fillStyle='#f7f7f4';c.fillRect(0,0,w,h);c.fillStyle='#1d58b8';c.fillRect(0,h-22,w,22);
  c.fillStyle='#d9a05c';c.beginPath();c.moveTo(46,108);c.lineTo(28,50);c.lineTo(64,50);c.closePath();c.fill();c.fillStyle='#f29ab4';c.beginPath();c.arc(46,44,18,0,Math.PI*2);c.fill();
  c.fillStyle='#d8322a';c.font='bold 34px Georgia, serif';c.textBaseline='middle';c.fillText('HELADOS',84,56);c.fillStyle='#1d58b8';c.font='18px Georgia, serif';c.fillText('artesanos · La Barrosa',86,88);});

// ---- sangria: a glass pitcher with a pouring lip, fruit and ice, and tumblers ----
function sangriaJugGroup(){const g=new T.Group(),V=(a)=>a.map(p=>new T.Vector2(p[0],p[1]));
  const gg=new T.LatheGeometry(V([[0,0],[0.07,0],[0.088,0.012],[0.1,0.05],[0.104,0.13],[0.099,0.22],[0.086,0.29],[0.077,0.33],[0.08,0.37],[0.09,0.4]]),28),pos=gg.attributes.position;
  for(let i=0;i<pos.count;i++){const y=pos.getY(i);if(y>0.33){const x=pos.getX(i),z=pos.getZ(i),c=Math.cos(Math.atan2(z,x));if(c>0)pos.setX(i,x+Math.pow(c,8)*0.045*(y-0.33)/0.07);}}gg.computeVertexNormals();
  const glass=mc('sgGlass',()=>new T.MeshStandardMaterial({color:0xffffff,transparent:true,opacity:0.2,roughness:0.03,metalness:0.1,side:T.DoubleSide,depthWrite:false}));
  const jg=new T.Mesh(gg,glass);jg.renderOrder=3;g.add(jg);
  const liq=new T.Mesh(new T.LatheGeometry(V([[0,0.012],[0.084,0.012],[0.097,0.05],[0.1,0.13],[0.095,0.22],[0.088,0.26],[0,0.26]]),24),mc('sgWine',()=>new T.MeshStandardMaterial({color:lin(0x7a0d22),transparent:true,opacity:0.84,roughness:0.12})));
  liq.renderOrder=2;g.add(liq);
  const h=new T.Mesh(new T.TorusGeometry(0.075,0.012,8,18,Math.PI),glass);h.rotation.z=Math.PI/2;h.position.set(-0.098,0.215,0);h.renderOrder=3;g.add(h);
  const oc=mc('sgOrange',()=>new T.MeshStandardMaterial({map:citrusT('#f08a1c','#f7a53a'),roughness:0.6})),lc=mc('sgLemon',()=>new T.MeshStandardMaterial({map:citrusT('#e8cf2a','#f6e27a'),roughness:0.6}));
  const or=mc('sgRindO',()=>new T.MeshStandardMaterial({color:lin(0xf08a1c),roughness:0.6})),lr=mc('sgRindL',()=>new T.MeshStandardMaterial({color:lin(0xe8cf2a),roughness:0.6}));
  const sliceG=new T.CylinderGeometry(0.036,0.036,0.008,16);
  for(let i=0;i<7;i++){const lem=i%3===2,s=new T.Mesh(sliceG,lem?[lr,lc,lc]:[or,oc,oc]);const a=Math.random()*6.3,d=Math.random()*0.05,top=i<3;
    s.position.set(Math.cos(a)*d,top?0.255:0.05+Math.random()*0.18,Math.sin(a)*d);s.rotation.set(top?(Math.random()-0.5)*0.4:Math.random()*3,Math.random()*3,top?(Math.random()-0.5)*0.4:Math.random()*3);g.add(s);}
  const apple=mc('sgApple',()=>new T.MeshStandardMaterial({color:lin(0xf1e3a8),roughness:0.7}));for(let i=0;i<6;i++){const b=new T.Mesh(new T.BoxGeometry(0.022,0.022,0.022),apple);b.position.set((Math.random()-0.5)*0.12,0.03+Math.random()*0.2,(Math.random()-0.5)*0.12);b.rotation.set(Math.random()*3,Math.random()*3,0);g.add(b);}
  const ice=mc('sgIce',()=>new T.MeshStandardMaterial({color:0xffffff,transparent:true,opacity:0.45,roughness:0.05}));for(let i=0;i<4;i++){const b=new T.Mesh(new T.BoxGeometry(0.034,0.03,0.034),ice);b.position.set((Math.random()-0.5)*0.09,0.24,(Math.random()-0.5)*0.09);b.rotation.set(0.3,Math.random()*3,0.2);b.renderOrder=1;g.add(b);}
  const stick=new T.Mesh(new T.CylinderGeometry(0.006,0.006,0.44,6),mc('sgSpoon',()=>new T.MeshStandardMaterial({color:lin(0xb08a5a),roughness:0.6})));stick.position.set(0.02,0.25,0.03);stick.rotation.set(0.28,0,-0.22);g.add(stick);
  return g;}
function buildSangria(){const X=5.5,Y=1.04,Z=9.0;
  const j=sangriaJugGroup();j.position.set(X,Y,Z);j.rotation.y=-0.6;world.add(j);
  const glass=mc('sgGlass',()=>null),wine=mc('sgWine',()=>null),V=(a)=>a.map(p=>new T.Vector2(p[0],p[1]));
  const tG=new T.LatheGeometry(V([[0,0],[0.042,0],[0.046,0.006],[0.05,0.13],[0.052,0.134]]),20),lG=new T.LatheGeometry(V([[0,0.008],[0.043,0.008],[0.047,0.085],[0,0.085]]),16);
  [[0.55,0.3],[-0.45,0.42],[0.25,-0.5],[-0.35,-0.35]].forEach((p,i)=>{const t=new T.Group();t.position.set(X+p[0],Y,Z+p[1]);
    const gl=new T.Mesh(tG,glass);gl.renderOrder=3;t.add(gl);if(i<3){const l=new T.Mesh(lG,wine);l.renderOrder=2;t.add(l);
      const s=new T.Mesh(new T.CylinderGeometry(0.034,0.034,0.007,14,1,false,0,Math.PI),[mc('sgRindO',()=>null),mc('sgOrange',()=>null),mc('sgOrange',()=>null)]);s.rotation.set(Math.PI/2,0,0.3);s.position.set(0.03,0.13,0.0);t.add(s);}
    world.add(t);});
  // fruit bowl
  const bowl=new T.Mesh(new T.LatheGeometry(V([[0,0],[0.09,0],[0.16,0.05],[0.19,0.1],[0.185,0.105]]),24),mat(0x2f6fa8,{roughness:0.3,side:T.DoubleSide}));bowl.position.set(X-0.2,Y,Z+0.05);world.add(bowl);
  [[0.05,0.02,0xf08a1c],[-0.06,0.03,0xf08a1c],[0.0,-0.07,0xe8cf2a],[0.02,0.08,0xf08a1c]].forEach(f=>{const o=new T.Mesh(new T.SphereGeometry(0.05,12,10),mat(f[2],{roughness:0.55}));o.position.set(X-0.2+f[0],Y+0.09,Z+0.05+f[1]);o.castShadow=true;world.add(o);});
  solids.push({x:X,z:Z,rx:1.1,rz:1.1});
  spots.push({x:X,z:10.8,r:3.2,id:'sangria',label:'pour a sangria 🍷'});}

// ---- built-in brick barbecue with a charcoal bed, glowing coals, flames and food ----
function buildBBQ(){const bx=22,bz=11,H=1.12,D=1.25,g=new T.Group();g.position.set(bx,0,bz);world.add(g);
  const brick=new T.MeshStandardMaterial({map:brickT,color:0xf0c0a0,roughness:0.95}),stone=mat(0xe6dac4,{roughness:0.55}),steel=mat(0x26282a,{roughness:0.5,metalness:0.6});
  const B=(w,h,d,m,x,y,z,uv)=>{const o=new T.Mesh(new T.BoxGeometry(w,h,d),m);o.position.set(x,y,z);o.castShadow=o.receiveShadow=true;if(uv)worldUV(o,1.12,1.36);g.add(o);return o;};
  B(0.7,H-0.08,D,brick,-0.95,(H-0.08)/2,0,true);B(0.7,H-0.08,D,brick,0.95,(H-0.08)/2,0,true);B(1.2,H-0.08,0.14,brick,0,(H-0.08)/2,-D/2+0.07,true);
  B(1.2,0.1,D-0.14,mat(0x8a8580,{roughness:0.95}),0,0.78,0.07);
  // log store under the firebox
  const logM=mat(0x7a5a3a,{roughness:0.95}),endM=mat(0xc9a06a,{roughness:0.9});
  for(let r=0;r<3;r++)for(let k=0;k<5-r;k++){const l=new T.Mesh(new T.CylinderGeometry(0.06,0.065,0.95,8),[logM,endM,endM]);l.rotation.x=Math.PI/2;l.position.set(-0.48+k*0.13+r*0.065,0.07+r*0.115,0.08);l.castShadow=true;g.add(l);}
  // travertine worktops around the firebox
  B(0.75,0.08,D+0.1,stone,-0.975,H-0.04,0);B(0.75,0.08,D+0.1,stone,0.975,H-0.04,0);B(1.2,0.08,0.13,stone,0,H-0.04,D/2-0.015);B(1.2,0.08,0.13,stone,0,H-0.04,-D/2+0.015);
  // steel fire tray and charcoal
  B(1.2,0.04,D-0.26,steel,0,0.86,0);[[0,-0.5],[0,0.5]].forEach(q=>B(1.2,0.2,0.03,steel,0,0.96,q[1]*(D-0.26)));
  const coalM=new T.MeshStandardMaterial({color:0x1c1714,roughness:0.95,emissive:0xff4a12,emissiveIntensity:0.04});
  const coals=new T.InstancedMesh(new T.DodecahedronGeometry(0.045,0),coalM,120),dm=new T.Object3D();
  for(let i=0;i<120;i++){dm.position.set((Math.random()-0.5)*1.1,0.9+Math.random()*0.05,(Math.random()-0.5)*(D-0.34));dm.rotation.set(Math.random()*3,Math.random()*3,Math.random()*3);dm.scale.setScalar(0.7+Math.random()*0.6);dm.updateMatrix();coals.setMatrixAt(i,dm.matrix);}
  coals.receiveShadow=true;g.add(coals);
  const ember=new T.Mesh(new T.PlaneGeometry(1.12,D-0.32),new T.MeshBasicMaterial({color:0xff5a1a,transparent:true,opacity:0,blending:T.AdditiveBlending,depthWrite:false}));ember.rotation.x=-Math.PI/2;ember.position.y=0.955;g.add(ember);
  // cast-iron grate
  for(let i=0;i<17;i++){const b=new T.Mesh(new T.CylinderGeometry(0.009,0.009,D-0.28,5),steel);b.rotation.x=Math.PI/2;b.position.set(-0.56+i*0.07,1.09,0);g.add(b);}
  [-0.46,0.46].forEach(z=>{const r=new T.Mesh(new T.BoxGeometry(1.18,0.03,0.03),steel);r.position.set(0,1.08,z);g.add(r);});
  // worktop bits: plate of prawns, olive oil, tongs, a board of lemons
  const plate=new T.Mesh(new T.CylinderGeometry(0.2,0.17,0.025,20),mat(0xf6f3ee,{roughness:0.3}));plate.position.set(0.95,H+0.012,0.15);g.add(plate);
  const prawnM=mat(0xe2552e,{roughness:0.45}),rawM=mat(0xd9a0a0,{roughness:0.45}),fishM=mat(0xb9c4cc,{roughness:0.25,metalness:0.5}),pepM=mat(0x3f8a2a,{roughness:0.35}),chorM=mat(0x9a2a1c,{roughness:0.5});
  const prawn=(m)=>{const p=new T.Group(),b=new T.Mesh(new T.TorusGeometry(0.05,0.02,6,10,Math.PI*1.25),m);b.rotation.x=-Math.PI/2;p.add(b);const hd=new T.Mesh(new T.SphereGeometry(0.026,8,6),m);hd.scale.set(1,0.8,1.5);hd.position.set(0.05,0,0);p.add(hd);return p;};
  for(let i=0;i<4;i++){const p=prawn(rawM);p.position.set(0.95+(i%2-0.5)*0.14,H+0.04,0.15+(i<2?-0.06:0.06));p.rotation.y=i*1.3;g.add(p);}
  const oil=new T.Mesh(new T.CylinderGeometry(0.04,0.045,0.26,12),mat(0x3d5a1e,{roughness:0.15,metalness:0.1}));oil.position.set(1.18,H+0.13,-0.3);g.add(oil);const neck=new T.Mesh(new T.CylinderGeometry(0.014,0.02,0.07,8),mat(0x3d5a1e,{roughness:0.15}));neck.position.set(1.18,H+0.295,-0.3);g.add(neck);
  const tong=mat(0xc9cdd2,{roughness:0.25,metalness:0.9});[-0.012,0.012].forEach(o=>{const t=new T.Mesh(new T.BoxGeometry(0.34,0.01,0.018),tong);t.position.set(0.8,H+0.01,-0.35+o);t.rotation.y=0.12+o*3;g.add(t);});
  const board=new T.Mesh(new T.BoxGeometry(0.42,0.03,0.28),mat(0xb0834f,{roughness:0.7}));board.position.set(-0.95,H+0.015,0.1);g.add(board);
  [[-1.02,0.08],[-0.9,0.14]].forEach(q=>{const l=new T.Mesh(new T.SphereGeometry(0.045,12,8,0,Math.PI*2,0,Math.PI/2),mat(0xf2d33a,{roughness:0.5}));l.position.set(q[0],H+0.03,q[1]);g.add(l);});
  // fire + food (shown while cooking)
  const fx=new T.Group();fx.visible=false;g.add(fx);const flames=[],fT=flameTex(true);
  for(let i=0;i<12;i++){const s=new T.Sprite(new T.SpriteMaterial({map:fT,blending:T.AdditiveBlending,transparent:true,depthWrite:false,opacity:0.9}));s.position.set(-0.5+Math.random()*1.0,1.02,(Math.random()-0.5)*0.7);
    s.userData.b=0.12+Math.random()*0.1;s.userData.ph=Math.random()*9;s.center.set(0.5,0.05);fx.add(s);flames.push(s);}
  for(let i=0;i<6;i++){const p=prawn(prawnM);p.position.set(-0.42+(i%3)*0.2,1.12,i<3?0.22:0.36);p.rotation.y=i*0.9;fx.add(p);}
  for(let i=0;i<4;i++){const f=new T.Group(),b=new T.Mesh(new T.SphereGeometry(0.03,10,6),fishM);b.scale.set(4.2,0.9,1.2);f.add(b);const tl=new T.Mesh(new T.ConeGeometry(0.035,0.06,4),fishM);tl.rotation.z=Math.PI/2;tl.scale.z=0.3;tl.position.x=-0.15;f.add(tl);
    const st=new T.Mesh(new T.BoxGeometry(0.2,0.004,0.012),mat(0x2a2a2a));st.position.y=0.028;f.add(st);f.position.set(0.18+(i%2)*0.2,1.13,-0.3+Math.floor(i/2)*0.17);f.rotation.y=0.2;fx.add(f);}
  for(let i=0;i<5;i++){const p=new T.Mesh(new T.SphereGeometry(0.02,8,6),pepM);p.scale.set(1,3,1);p.rotation.set(Math.PI/2,0,i);p.position.set(-0.4+i*0.1,1.12,-0.3);fx.add(p);}
  for(let i=0;i<3;i++){const c=new T.Mesh(new T.CylinderGeometry(0.03,0.03,0.2,10),chorM);c.rotation.z=Math.PI/2;c.position.set(0.3,1.13,0.12+i*0.09);fx.add(c);}
  fx.userData={flames,tick:(t,u)=>{coalM.emissiveIntensity=0.7+0.25*Math.sin(t*5.3)+0.1*Math.sin(t*13.1);ember.material.opacity=0.28+0.12*Math.sin(t*4.1);
      flames.forEach(s=>{const k=s.userData,f=0.65+0.45*Math.abs(Math.sin(t*(7+k.ph)+k.ph));s.scale.set(k.b*(0.8+0.25*Math.sin(t*11+k.ph)),k.b*2.3*f,1);s.material.opacity=0.55+0.4*f;});},
    cool:()=>{flames.forEach(s=>s.visible=false);coalM.emissiveIntensity=0.35;ember.material.opacity=0.12;},
    off:()=>{flames.forEach(s=>s.visible=true);coalM.emissiveIntensity=0.04;ember.material.opacity=0;}};
  world.userData.bbqFx=fx;world.userData.bbqCoals=coals;
  solids.push({x:bx,z:bz,rx:1.45,rz:0.8});
  spots.push({x:bx,z:bz+3,r:5,id:'bbq',label:'fire up the BBQ'});}

// ---- paella: tripod stand with a concentric gas ring, a real pan, saffron rice and seafood, orange butane bottle ----
function buildPaella(){const qx=16.25,qz=11,g=new T.Group();g.position.set(qx,0,qz);world.add(g);world.userData.paellaAt={x:qx,z:qz};
  const V=(a)=>a.map(p=>new T.Vector2(p[0],p[1])),steel=mat(0x2a2c2e,{roughness:0.45,metalness:0.7}),burnM=mat(0x5e5850,{roughness:0.5,metalness:0.6});
  for(let k=0;k<3;k++){const a=k/3*Math.PI*2+0.5;g.add(rod(new T.Vector3(Math.cos(a)*0.3,0.84,Math.sin(a)*0.3),new T.Vector3(Math.cos(a)*0.5,0,Math.sin(a)*0.5),0.014,steel));
    const sup=new T.Mesh(new T.BoxGeometry(0.1,0.03,0.02),steel);sup.position.set(Math.cos(a)*0.3,0.855,Math.sin(a)*0.3);sup.rotation.y=-a;g.add(sup);}
  const ring=new T.Mesh(new T.TorusGeometry(0.3,0.012,6,32),steel);ring.rotation.x=Math.PI/2;ring.position.y=0.84;g.add(ring);
  [0.12,0.24].forEach(r=>{const t=new T.Mesh(new T.TorusGeometry(r,0.018,6,32),burnM);t.rotation.x=Math.PI/2;t.position.y=0.79;g.add(t);});
  for(let k=0;k<4;k++){const s=new T.Mesh(new T.BoxGeometry(0.26,0.02,0.02),burnM);s.position.set(Math.cos(k*Math.PI/2)*0.13,0.79,Math.sin(k*Math.PI/2)*0.13);s.rotation.y=-k*Math.PI/2;g.add(s);}
  g.add(rod(new T.Vector3(0.24,0.79,0),new T.Vector3(0.36,0.79,0),0.012,burnM));const knob=new T.Mesh(new T.CylinderGeometry(0.025,0.025,0.03,10),mat(0xc8281e,{roughness:0.4}));knob.rotation.z=Math.PI/2;knob.position.set(0.37,0.79,0);g.add(knob);
  // the pan (≈95 cm) with two handles
  const pan=new T.Mesh(new T.LatheGeometry(V([[0,0],[0.58,0],[0.6,0.01],[0.64,0.07],[0.652,0.078],[0.66,0.072]]),48),mat(0x6a6d72,{roughness:0.32,metalness:0.85,side:T.DoubleSide}));pan.position.y=0.855;pan.castShadow=pan.receiveShadow=true;g.add(pan);
  [1,-1].forEach(s=>{const h=new T.Mesh(new T.TorusGeometry(0.05,0.011,6,12,Math.PI),pan.material);h.rotation.x=s*Math.PI/2;h.position.set(0,0.925,s*0.645);g.add(h);});
  const rice=new T.Mesh(new T.CircleGeometry(0.6,48),new T.MeshStandardMaterial({map:paellaT,roughness:0.7}));rice.rotation.x=-Math.PI/2;rice.position.y=0.9;rice.receiveShadow=true;g.add(rice);
  const top=new T.Group();top.position.y=0.9;g.add(top);
  const prM=mat(0xe2552e,{roughness:0.4}),shM=mat(0x1b2130,{roughness:0.3}),meatM=mat(0xe88a3a,{roughness:0.5}),lemM=mat(0xf2d33a,{roughness:0.5,side:T.DoubleSide}),chM=mat(0xb57236,{roughness:0.6}),redM=mat(0xb8261a,{roughness:0.3});
  for(let k=0;k<8;k++){const a=k/8*Math.PI*2,p=new T.Group();p.position.set(Math.cos(a)*0.4,0.012,Math.sin(a)*0.4);p.rotation.y=-a+Math.PI/2;
    const b=new T.Mesh(new T.TorusGeometry(0.06,0.024,6,12,Math.PI*1.25),prM);b.rotation.x=-Math.PI/2;p.add(b);
    const hd=new T.Mesh(new T.SphereGeometry(0.03,8,6),prM);hd.scale.set(1.6,0.8,1);hd.position.set(0.075,0.005,-0.02);p.add(hd);
    const tl=new T.Mesh(new T.ConeGeometry(0.025,0.04,4),prM);tl.rotation.z=Math.PI/2;tl.scale.z=0.35;tl.position.set(-0.06,0,-0.035);p.add(tl);top.add(p);}
  const shG=new T.SphereGeometry(0.042,10,6,0,Math.PI*2,0,Math.PI/2);
  for(let k=0;k<10;k++){const a=(k+0.5)/10*Math.PI*2,r=k%2?0.52:0.22,m=new T.Group();m.position.set(Math.cos(a)*r,0.015,Math.sin(a)*r);m.rotation.y=Math.random()*6;
    const s=new T.Mesh(shG,shM);s.scale.set(1,0.4,0.6);s.rotation.x=Math.PI;s.position.y=0.018;m.add(s);const mt=new T.Mesh(new T.SphereGeometry(0.03,8,6),meatM);mt.scale.set(1,0.35,0.5);mt.position.y=0.014;m.add(mt);top.add(m);}
  for(let k=0;k<4;k++){const a=k/4*Math.PI*2+Math.PI/4,w=new T.Mesh(new T.SphereGeometry(0.055,10,8,0,Math.PI/2),lemM);w.position.set(Math.cos(a)*0.3,0.01,Math.sin(a)*0.3);w.rotation.set(0,-a,Math.PI/2);top.add(w);}
  for(let k=0;k<6;k++){const a=k/6*Math.PI*2+0.3,c=new T.Mesh(new T.DodecahedronGeometry(0.045,0),chM);c.scale.set(1.3,0.6,1);c.position.set(Math.cos(a)*0.13,0.012,Math.sin(a)*0.13);c.rotation.y=a;top.add(c);}
  for(let k=0;k<6;k++){const a=k/6*Math.PI*2,s=new T.Mesh(new T.BoxGeometry(0.13,0.012,0.026),redM);s.position.set(Math.cos(a)*0.31,0.01,Math.sin(a)*0.31);s.rotation.y=-a+Math.PI/2;top.add(s);}
  // blue gas flames under the pan (shown while cooking)
  const fx=new T.Group();fx.visible=false;g.add(fx);const gT=flameTex(false),jets=[];
  [[0.12,14],[0.24,24]].forEach(([r,n])=>{for(let k=0;k<n;k++){const a=k/n*Math.PI*2,s=new T.Sprite(new T.SpriteMaterial({map:gT,blending:T.AdditiveBlending,transparent:true,depthWrite:false,opacity:0.85}));
    s.center.set(0.5,0.05);s.position.set(Math.cos(a)*r,0.8,Math.sin(a)*r);s.userData.ph=Math.random()*6;fx.add(s);jets.push(s);}});
  fx.userData.tick=t=>jets.forEach(s=>{const f=0.8+0.3*Math.sin(t*23+s.userData.ph);s.scale.set(0.035,0.075*f,1);});fx.userData.tick(0);
  world.userData.paellaFx=fx;
  // orange butane bottle and hose
  const bot=new T.Group();bot.position.set(0.95,0,0.4);g.add(bot);
  const bb=new T.Mesh(new T.LatheGeometry(V([[0,0],[0.17,0],[0.195,0.03],[0.2,0.08],[0.2,0.58],[0.18,0.68],[0.12,0.73],[0.05,0.75],[0,0.75]]),24),mat(0xf07a12,{roughness:0.4,metalness:0.2}));bb.castShadow=true;bot.add(bb);
  const col=new T.Mesh(new T.CylinderGeometry(0.1,0.1,0.1,16,1,true),mat(0x9a9ea2,{roughness:0.4,metalness:0.7,side:T.DoubleSide}));col.position.y=0.8;bot.add(col);
  const reg=new T.Mesh(new T.CylinderGeometry(0.04,0.04,0.07,12),mat(0x1a1a1a,{roughness:0.5}));reg.position.y=0.79;bot.add(reg);
  const hose=new T.Mesh(new T.TubeGeometry(new T.CatmullRomCurve3([new T.Vector3(0.95,0.8,0.4),new T.Vector3(0.9,0.5,0.25),new T.Vector3(0.75,0.04,0.12),new T.Vector3(0.5,0.04,0.02),new T.Vector3(0.4,0.4,0),new T.Vector3(0.37,0.77,0)]),24,0.012,6),mat(0x151515,{roughness:0.6}));g.add(hose);
  // folding side table: lemons, olive oil, garlic, stock pot
  const tb=new T.Group();tb.position.set(0,0,1.35);g.add(tb);const wd=new T.MeshStandardMaterial({map:boardT,color:0xb98a5c,roughness:0.8});
  const tt=worldUV(new T.Mesh(new T.BoxGeometry(0.95,0.04,0.55),wd),0.9);tt.position.y=0.84;tt.castShadow=tt.receiveShadow=true;tb.add(tt);
  [[-0.42,-0.22],[0.42,-0.22],[-0.42,0.22],[0.42,0.22]].forEach(p=>tb.add(rod(new T.Vector3(p[0],0.82,p[1]),new T.Vector3(p[0]*1.05,0,p[1]*1.1),0.015,mat(0x8a6a44))));
  const pot=new T.Mesh(new T.CylinderGeometry(0.16,0.16,0.26,18),mat(0xc9cdd2,{roughness:0.25,metalness:0.9}));pot.position.set(-0.22,0.99,0);tb.add(pot);const lid=new T.Mesh(new T.CylinderGeometry(0.165,0.165,0.02,18),pot.material);lid.position.set(-0.22,1.13,0);tb.add(lid);
  const ob=new T.Mesh(new T.CylinderGeometry(0.035,0.04,0.24,12),mat(0x3d5a1e,{roughness:0.15}));ob.position.set(0.1,0.98,-0.12);tb.add(ob);
  const lb=new T.Mesh(new T.LatheGeometry(V([[0,0],[0.07,0],[0.12,0.05],[0.13,0.08]]),18),mat(0xe9e2d6,{roughness:0.4,side:T.DoubleSide}));lb.position.set(0.26,0.86,0.08);tb.add(lb);
  [[0.23,0.05],[0.3,0.11],[0.28,0.02]].forEach(p=>{const l=new T.Mesh(new T.SphereGeometry(0.04,10,8),mat(0xf2d33a,{roughness:0.5}));l.scale.set(1,0.85,1.25);l.position.set(p[0],0.93,p[1]);tb.add(l);});
  const gar=new T.Mesh(new T.SphereGeometry(0.035,10,8),mat(0xf2ede0,{roughness:0.6}));gar.scale.y=0.8;gar.position.set(0.12,0.89,0.14);tb.add(gar);
  solids.push({x:qx,z:qz,rx:0.8,rz:0.8});solids.push({x:qx,z:qz+1.35,rx:0.55,rz:0.35});solids.push({x:qx+0.95,z:qz+0.4,rx:0.25,rz:0.25});
  spots.push({x:qx-1.2,z:qz+1.0,r:4,id:'paella',label:'cook a giant paella 🥘'});}

// ---- beach chiringuito: timber hut, striped awning, ice-cream display, chalk menu, chest freezer ----
function buildChiringuito(para){const ix=30,iz=-13,g=new T.Group();g.position.set(ix,0,iz);world.add(g);
  const wash=new T.MeshStandardMaterial({map:boardT,color:0xf6f1e8,roughness:0.85}),nat=new T.MeshStandardMaterial({map:boardT,color:0xb98a5c,roughness:0.85}),post=mat(0x8a6440,{roughness:0.8});
  const B=(w,h,d,m,x,y,z,t)=>{const o=new T.Mesh(new T.BoxGeometry(w,h,d),m);o.position.set(x,y,z);o.castShadow=o.receiveShadow=true;if(t)worldUV(o,t);g.add(o);return o;};
  B(6.6,0.18,4.6,nat,0,0.09,0.1,1.6);                                   // deck
  const F=0.18,WH=2.6;
  B(6,WH,0.12,wash,0,F+WH/2,1.9,1.6);B(0.12,WH,3.8,wash,-2.94,F+WH/2,0,1.6);B(0.12,WH,3.8,wash,2.94,F+WH/2,0,1.6);   // back + sides
  B(6,1.0,0.12,wash,0,F+0.5,-1.9,1.6);B(6,0.45,0.12,wash,0,F+WH-0.225,-1.9,1.6);[-2.7,2.7].forEach(x=>B(0.5,1.15,0.12,wash,x,F+1.575,-1.9,1.6));   // front with a serving hatch
  [[-3,-1.96],[3,-1.96],[-3,1.96],[3,1.96]].forEach(p=>B(0.16,WH+0.1,0.16,post,p[0],F+(WH+0.1)/2,p[1]));
  B(5.2,0.07,0.55,nat,0,F+1.02,-2.08,1.2);                              // counter shelf
  // interior: shade, shelves with bottles, the ice-cream display under a glass hood
  B(5.7,0.02,3.6,mat(0x3a2e24,{roughness:1}),0,F+0.01,0);
  const shelfM=nat;[1.35,1.8].forEach(y=>B(5.4,0.05,0.3,shelfM,0,F+y,1.7));
  const bC=[0x2f7a3a,0xc8a24a,0x9c1f32,0x2a4f8e,0xe8e2d6,0xd8622a];for(let i=0;i<22;i++){const y=i<11?1.35:1.8,b=new T.Mesh(new T.CylinderGeometry(0.05,0.05,0.28,8),mat(bC[i%6],{roughness:0.25}));b.position.set(-2.5+(i%11)*0.5,F+y+0.165,1.7);g.add(b);}
  B(4.4,0.9,0.75,mat(0xf4f4f2,{roughness:0.4}),0,F+0.45,-1.45);
  const tubs=[0xf4a6b8,0x5a3622,0xb8dc8a,0xfff2a0,0xfbf3dc,0xf0b25a,0x7a5aa8,0x9fe0c8];tubs.forEach((c,i)=>{const x=-1.75+i*0.5;B(0.44,0.08,0.4,mat(0x9aa0a6,{roughness:0.3,metalness:0.6}),x,F+0.93,-1.45);
    const s=new T.Mesh(new T.SphereGeometry(0.2,12,8,0,Math.PI*2,0,Math.PI/2),mat(c,{roughness:0.8}));s.scale.set(1,0.45,0.9);s.position.set(x,F+0.96,-1.45);g.add(s);});
  const hood=new T.Mesh(new T.BoxGeometry(4.3,0.02,0.8),new T.MeshStandardMaterial({color:0xdff4f8,transparent:true,opacity:0.25,roughness:0.05,metalness:0.2}));hood.position.set(0,F+1.25,-1.5);hood.rotation.x=0.35;g.add(hood);
  // roof, fascia sign, ice-cream cone sign
  B(6.8,0.18,4.8,nat,0,F+WH+0.09,0.1,1.6);B(6.8,0.35,0.06,mat(0xf7f2e6,{roughness:0.8}),0,F+WH+0.05,-2.52);
  const sign=new T.Mesh(new T.PlaneGeometry(4.4,0.52),new T.MeshStandardMaterial({map:signT,roughness:0.7}));sign.position.set(0,F+WH+0.05,-2.56);sign.rotation.y=Math.PI;g.add(sign);
  const cg=new T.Group();cg.position.set(1.8,F+WH+0.18,0.8);g.add(cg);cg.add(rod(new T.Vector3(0,0,0),new T.Vector3(0,0.5,0),0.04,post));
  const cone=new T.Mesh(new T.ConeGeometry(0.36,1.2,20),new T.MeshStandardMaterial({map:waffleT,roughness:0.8}));cone.rotation.x=Math.PI;cone.position.y=1.1;cone.castShadow=true;cg.add(cone);
  [[0xf4a6b8,0.34,1.78],[0x9fe0c8,0.3,2.2],[0x5a3622,0.26,2.56]].forEach(q=>{const s=new T.Mesh(new T.SphereGeometry(q[1],18,12),mat(q[0],{roughness:0.6}));s.position.y=q[2];s.scale.y=0.88;s.castShadow=true;cg.add(s);
    for(let k=0;k<5;k++){const a=k/5*Math.PI*2+q[2],d=new T.Mesh(new T.SphereGeometry(q[1]*0.22,8,6),s.material);d.scale.y=1.8;d.position.set(Math.cos(a)*q[1]*0.9,q[2]-q[1]*0.55,Math.sin(a)*q[1]*0.9);cg.add(d);}});
  const cherry=new T.Mesh(new T.SphereGeometry(0.09,12,10),mat(0xc8102e,{roughness:0.3}));cherry.position.y=2.86;cg.add(cherry);
  // striped awning over the hatch, scalloped valance, support arms
  const aw=new T.Group();aw.position.set(0,F+2.33,-1.97);aw.rotation.x=-0.28;g.add(aw);const L=1.4;
  const st=stripeT('#d33a2c','#f7f2e6');st.wrapS=T.RepeatWrapping;st.repeat.set(2.6,1);
  const cloth=new T.Mesh(new T.PlaneGeometry(6.2,L),new T.MeshStandardMaterial({map:st,roughness:0.9,side:T.DoubleSide}));cloth.rotation.x=-Math.PI/2;cloth.position.z=-L/2;cloth.castShadow=true;aw.add(cloth);
  const val=new T.Group();val.position.z=-L;val.rotation.x=0.28;aw.add(val);const vr=mat(0xd33a2c,{roughness:0.9,side:T.DoubleSide}),vw=mat(0xf7f2e6,{roughness:0.9,side:T.DoubleSide});
  for(let i=0;i<20;i++){const s=new T.Mesh(new T.CircleGeometry(0.155,10,Math.PI,Math.PI),i%2?vw:vr);s.position.set(-3.1+0.155+i*0.31,0,0);val.add(s);}
  [-2.9,2.9].forEach(x=>g.add(rod(new T.Vector3(x,F+1.55,-1.97),new T.Vector3(x,F+2.33-Math.sin(0.28)*L,-1.97-Math.cos(0.28)*L),0.02,mat(0xc8ccd0,{metalness:0.8,roughness:0.3}))));
  // chalk A-frame menu
  const mb=new T.Group();mb.position.set(-2.9,0,-3.05);mb.rotation.y=0.35;g.add(mb);const mM=new T.MeshStandardMaterial({map:menuT,roughness:0.9}),fr=mat(0x8a5a32,{roughness:0.8});
  [[-0.12,0.2,5],[0.12,-0.2,4]].forEach(q=>{const mats=[fr,fr,fr,fr,fr,fr];mats[q[2]]=mM;const b=new T.Mesh(new T.BoxGeometry(0.66,1.0,0.035),mats);b.position.set(0,0.5,q[0]);b.rotation.x=q[1];b.castShadow=true;mb.add(b);});
  // chest freezer by the vendor
  const fz=new T.Group();fz.position.set(2.4,0,-2.75);g.add(fz);const fzM=mat(0xf7f7f4,{roughness:0.35});
  const body=new T.Mesh(new T.BoxGeometry(1.2,0.82,0.62),[fzM,fzM,fzM,fzM,fzM,new T.MeshStandardMaterial({map:freezerT,roughness:0.35})]);body.position.y=0.41;body.castShadow=body.receiveShadow=true;fz.add(body);
  [0xf4a6b8,0x5a3622,0xfff2a0,0xb8dc8a,0x9fd8f4,0xf0b25a].forEach((c,i)=>{const t=new T.Mesh(new T.BoxGeometry(0.34,0.06,0.24),mat(c,{roughness:0.7}));t.position.set(-0.4+(i%3)*0.4,0.8,i<3?-0.13:0.13);fz.add(t);});
  const gl=new T.Mesh(new T.BoxGeometry(1.14,0.03,0.56),new T.MeshStandardMaterial({color:0x9fc8ff,transparent:true,opacity:0.35,roughness:0.05,metalness:0.3}));gl.position.y=0.84;fz.add(gl);
  // bar stools, lifebuoy, surfboard
  [-1.6,-2.4].forEach(x=>{const s=new T.Group();s.position.set(x,0,-2.75);g.add(s);const seat=new T.Mesh(new T.CylinderGeometry(0.2,0.2,0.06,16),nat);seat.position.y=0.95;seat.castShadow=true;s.add(seat);
    [[1,1],[1,-1],[-1,1],[-1,-1]].forEach(p=>s.add(rod(new T.Vector3(p[0]*0.12,0.93,p[1]*0.12),new T.Vector3(p[0]*0.18,0,p[1]*0.18),0.015,post)));});
  const lbT=stripeT('#d8322a','#f7f2e6');lbT.wrapS=T.RepeatWrapping;lbT.repeat.set(0.5,1);const buoy=new T.Mesh(new T.TorusGeometry(0.28,0.075,10,24),new T.MeshStandardMaterial({map:lbT,roughness:0.6}));buoy.position.set(3.03,F+1.8,0.5);buoy.rotation.y=Math.PI/2;g.add(buoy);
  const surf=new T.Mesh(new T.SphereGeometry(0.28,20,10),mat(0x2aa6b8,{roughness:0.3}));surf.scale.set(1,4.2,0.12);surf.position.set(3.3,1.15,-0.9);surf.rotation.set(0,Math.PI/2,-0.18);surf.castShadow=true;g.add(surf);
  const strip=new T.Mesh(new T.BoxGeometry(0.02,2.2,0.036),mat(0xf7f2e6));strip.position.copy(surf.position);strip.rotation.copy(surf.rotation);g.add(strip);
  world.add(para(ix-6,iz-3,0xefb13a));
  solids.push({x:ix,z:iz+0.1,rx:3.3,rz:2.3});solids.push({x:ix+2.4,z:iz-2.75,rx:0.65,rz:0.4});solids.push({x:ix-2.9,z:iz-3.05,rx:0.4,rz:0.35});
  spots.push({x:ix,z:iz-2.9,r:3.6,id:'ice',label:'grab ice creams 🍦'});}

// ---- cedar sauna cabin: slatted walls, gable roof, glass-panel door, benches and stove inside, window, porch bench ----
function buildSauna(){const sxx=-12.5,szz=6.5,W=3.4,D=3.0,H=2.45,t=0.12,g=new T.Group();g.position.set(sxx,0,szz);world.add(g);
  const cedar=new T.MeshStandardMaterial({map:slatT,roughness:0.8}),aspen=mat(0xe6c79c,{roughness:0.8}),trim=mat(0x5e3d22,{roughness:0.8}),roofM=new T.MeshStandardMaterial({map:shingleT,roughness:0.95});
  const B=(w,h,d,m,x,y,z,uv)=>{const o=new T.Mesh(new T.BoxGeometry(w,h,d),m);o.position.set(x,y,z);o.castShadow=o.receiveShadow=true;if(uv)worldUV(o,1.3);g.add(o);return o;};
  const fz=-D/2+t/2;
  B(W,H,t,cedar,0,H/2,D/2-t/2,true);B(t,H,D-2*t,cedar,-(W/2-t/2),H/2,0,true);B(t,H,D-2*t,cedar,W/2-t/2,H/2,0,true);
  B(1.15,H,t,cedar,-1.125,H/2,fz,true);B(1.15,H,t,cedar,1.125,H/2,fz,true);B(1.1,H-2.0,t,cedar,0,2.0+(H-2)/2,fz,true);
  B(W-2*t,0.06,D-2*t,mat(0x4a3322,{roughness:0.9}),0,0.03,0);
  [[-1,-1],[1,-1],[-1,1],[1,1]].forEach(p=>B(0.1,H,0.1,trim,p[0]*(W/2-0.02),H/2,p[1]*(D/2-0.02)));
  B(0.08,2.05,0.14,trim,-0.59,1.02,fz-0.01);B(0.08,2.05,0.14,trim,0.59,1.02,fz-0.01);B(1.26,0.08,0.14,trim,0,2.04,fz-0.01);
  // gable roof (ridge along x) with shingles, gable ends and a ridge cap
  const k=0.7/1.5,ang=Math.atan(k),Lr=1.8/Math.cos(ang);
  [1,-1].forEach(s=>{const r=new T.Mesh(new T.BoxGeometry(W+0.5,0.08,Lr),roofM);r.position.set(0,H+0.7-k*0.9+0.05,s*0.9);r.rotation.x=s*ang;r.castShadow=r.receiveShadow=true;worldUV(r,1.2);g.add(r);});
  const tri=new T.Shape();tri.moveTo(-W/2,0);tri.lineTo(W/2,0);tri.lineTo(0,0.7);tri.closePath();
  [D/2-0.1,-D/2].forEach(z=>{const m=new T.Mesh(new T.ExtrudeGeometry(tri,{depth:0.1,bevelEnabled:false}),cedar);m.position.set(0,H,z);m.castShadow=true;worldUV(m,1.3);g.add(m);});
  B(W+0.55,0.1,0.2,trim,0,H+0.76,0);
  // interior: two-tier aspen benches, stove with sauna stones, bucket
  [[0.48,0.55,0.45],[0.95,1.08,0.5]].forEach(([y,z,d])=>{for(let i=0;i<4;i++)B(W-0.4,0.035,d/4-0.02,aspen,0,y,z-d/2+(i+0.5)*d/4);B(W-0.4,y,0.05,aspen,0,y/2,z-d/2);});
  const stove=B(0.42,0.62,0.38,mat(0x1c1c1e,{roughness:0.6,metalness:0.5}),1.05,0.31,-0.95);
  const stoneM=[mat(0x6d6a66,{roughness:0.9}),mat(0x8a8680,{roughness:0.9}),mat(0x55524e,{roughness:0.9,emissive:0xff3300,emissiveIntensity:0.25})];
  for(let i=0;i<18;i++){const s=new T.Mesh(new T.DodecahedronGeometry(0.05+Math.random()*0.02,0),stoneM[i%3]);s.position.set(1.05+(Math.random()-0.5)*0.32,0.66+Math.random()*0.12,-0.95+(Math.random()-0.5)*0.28);s.rotation.set(Math.random()*3,Math.random()*3,0);g.add(s);}
  const flueTop=3.5;g.add(rod(new T.Vector3(1.05,0.62,-0.95),new T.Vector3(1.05,flueTop,-0.95),0.06,mat(0x2a2a2c,{roughness:0.4,metalness:0.7}),10));
  const cap=new T.Mesh(new T.ConeGeometry(0.14,0.12,10),mat(0x2a2a2c,{roughness:0.4,metalness:0.7}));cap.position.set(1.05,flueTop+0.1,-0.95);g.add(cap);
  world.userData.saunaChim=[sxx+1.05,flueTop+0.2,szz-0.95];
  // warm-lit window on the east wall
  B(0.06,0.62,0.62,trim,W/2+0.02,1.55,0.3);const win=new T.Mesh(new T.BoxGeometry(0.07,0.5,0.5),new T.MeshStandardMaterial({color:0x3a2410,emissive:0xffa050,emissiveIntensity:0.55,roughness:0.1}));win.position.set(W/2+0.03,1.55,0.3);g.add(win);
  // glass-panel door on its hinge (the script swings this group)
  const sdp=new T.Group();sdp.position.set(sxx-0.55,0,szz-D/2-0.03);world.add(sdp);world.userData.saunaDoor=sdp;
  const door=new T.Mesh(new T.BoxGeometry(1.08,1.98,0.06),cedar);door.position.set(0.55,1.0,0);door.castShadow=true;worldUV(door,1.3);sdp.add(door);
  const dg=new T.Mesh(new T.BoxGeometry(0.42,1.1,0.07),new T.MeshStandardMaterial({color:0x6b4a2a,transparent:true,opacity:0.6,roughness:0.05,metalness:0.3}));dg.position.set(0.5,1.25,0);sdp.add(dg);
  const hdl=new T.Mesh(new T.BoxGeometry(0.05,0.45,0.05),trim);hdl.position.set(0.95,1.05,-0.07);sdp.add(hdl);
  // porch deck, bench with a bucket and ladle, towels on hooks
  const deck=worldUV(new T.Mesh(new T.BoxGeometry(2.6,0.05,1.1),new T.MeshStandardMaterial({map:boardT,color:0xa9774a,roughness:0.85})),1.2);deck.position.set(0,0.025,-D/2-0.55);deck.receiveShadow=true;g.add(deck);
  B(0.95,0.05,0.36,aspen,-1.2,0.46,-D/2-0.3);[-1.6,-0.8].forEach(x=>B(0.06,0.44,0.3,trim,x,0.22,-D/2-0.3));
  const bk=new T.Mesh(new T.CylinderGeometry(0.12,0.1,0.2,14),mat(0xa87a4a,{roughness:0.8}));bk.position.set(-1.4,0.585,-D/2-0.3);bk.castShadow=true;g.add(bk);
  [0.04,-0.06].forEach(y=>{const bnd=new T.Mesh(new T.TorusGeometry(0.115,0.008,4,20),mat(0x9a9ea2,{metalness:0.8,roughness:0.3}));bnd.rotation.x=Math.PI/2;bnd.position.set(-1.4,0.585+y,-D/2-0.3);g.add(bnd);});
  g.add(rod(new T.Vector3(-1.4,0.62,-D/2-0.3),new T.Vector3(-1.1,0.9,-D/2-0.32),0.01,mat(0xa87a4a)));
  [[0.95,0xf6f3ee],[1.3,0x3b7fbf]].forEach(([x,c])=>{const tw=new T.Mesh(new T.BoxGeometry(0.3,0.6,0.02),mat(c,{roughness:1}));tw.position.set(x,1.3,-D/2-0.02);tw.rotation.z=(Math.random()-0.5)*0.1;tw.castShadow=true;g.add(tw);});
  solids.push({x:sxx,z:szz,rx:1.9,rz:1.7});
  spots.push({x:sxx,z:szz-2.4,r:3.2,id:'sauna',label:'warm up in the sauna'});}

// ---- sandcastle: moat, platform, four bucket towers, crenellated walls, keep with turret, gate and shells ----
// built part by part (setBuild 0..1) so it rises while the family digs
function buildSandcastle(){const g=new T.Group();g.position.set(-8,0.02,-38);world.add(g);
  const sW=new T.MeshStandardMaterial({map:sandCT,color:0xe6cf9c,roughness:1}),sD=new T.MeshStandardMaterial({map:sandCT,color:0xc9a870,roughness:1}),dark=mat(0x5a4630,{roughness:1});
  const parts=[],part=(x,y,z)=>{const p=new T.Group();p.position.set(x,y,z);g.add(p);parts.push(p);return p;};
  const M=(geo,m,x,y,z,par)=>{const o=new T.Mesh(geo,m);o.position.set(x,y,z);o.castShadow=o.receiveShadow=true;par.add(o);return o;};
  const merlons=(par,n,r,y)=>{for(let k=0;k<n;k++){const a=k/n*Math.PI*2;const b=M(new T.BoxGeometry(0.075,0.08,0.075),sW,Math.cos(a)*r,y,Math.sin(a)*r,par);b.rotation.y=-a;}};
  const p0=part(0,0,0);
  const moat=M(new T.RingGeometry(1.2,1.5,40),mat(0x8a7450,{roughness:0.7}),0,0.005,0,p0);moat.rotation.x=-Math.PI/2;moat.castShadow=false;
  const wtr=new T.Mesh(new T.RingGeometry(1.24,1.46,40),new T.MeshStandardMaterial({color:0x7fb3c2,transparent:true,opacity:0.55,roughness:0.05,metalness:0.2}));wtr.rotation.x=-Math.PI/2;wtr.position.y=0.02;p0.add(wtr);
  const heap=M(new T.TorusGeometry(1.72,0.17,6,40),sW,0,0,0,p0);heap.rotation.x=-Math.PI/2;heap.scale.z=0.5;
  M(new T.CylinderGeometry(1.08,1.2,0.22,32),sD,0,0.11,0,p0);
  const TW=[[-0.62,-0.62],[0.62,-0.62],[0.62,0.62],[-0.62,0.62]];
  TW.forEach(([x,z])=>{const p=part(x,0.22,z);M(new T.CylinderGeometry(0.17,0.21,0.5,16),sW,0,0.25,0,p);
    [0.14,0.32].forEach(y=>{const r=M(new T.TorusGeometry(0.2-y*0.06,0.012,4,20),sD,0,y,0,p);r.rotation.x=Math.PI/2;});merlons(p,6,0.14,0.54);
    const a=Math.atan2(x,z),w=M(new T.BoxGeometry(0.05,0.08,0.02),dark,Math.sin(a)*0.195,0.32,Math.cos(a)*0.195,p);w.rotation.y=a;});
  for(let i=0;i<4;i++){const [ax,az]=TW[i],[bx,bz]=TW[(i+1)%4],p=part((ax+bx)/2,0.22,(az+bz)/2),rot=Math.atan2(bz-az,bx-ax);p.rotation.y=-rot;
    M(new T.BoxGeometry(0.95,0.3,0.14),sW,0,0.15,0,p);for(let k=0;k<5;k++)M(new T.BoxGeometry(0.08,0.07,0.14),sW,-0.36+k*0.18,0.335,0,p);}
  const kp=part(0,0.22,0);M(new T.CylinderGeometry(0.28,0.33,0.72,20),sW,0,0.36,0,kp);[0.2,0.45].forEach(y=>{const r=M(new T.TorusGeometry(0.33-y*0.07,0.014,4,24),sD,0,y,0,kp);r.rotation.x=Math.PI/2;});
  merlons(kp,8,0.24,0.76);M(new T.ConeGeometry(0.16,0.3,14),sD,0,0.87,0,kp);
  const gp=part(0,0.22,-0.62);M(new T.BoxGeometry(0.18,0.16,0.02),dark,0,0.08,-0.075,gp);const arch=M(new T.CircleGeometry(0.09,12,0,Math.PI),dark,0,0.16,-0.086,gp);arch.rotation.y=Math.PI;
  const shells=[0xfbf3e6,0xf4c6c0,0xf2b27a,0xfbf3e6];for(let k=0;k<10;k++){const a=k/10*Math.PI*2,s=M(new T.SphereGeometry(0.035,8,6),mat(shells[k%4],{roughness:0.5}),Math.cos(a)*1.02,0.02,Math.sin(a)*1.02,gp);s.position.x-=0;s.position.z+=0.62;s.scale.set(1,0.35,0.8);}
  const star=new T.Group();star.position.set(0.72,0.03,1.05);gp.add(star);for(let k=0;k<5;k++){const a=k/5*Math.PI*2,c=M(new T.ConeGeometry(0.028,0.12,5),mat(0xe8742a,{roughness:0.7}),Math.cos(a)*0.05,0,Math.sin(a)*0.05,star);c.rotation.set(0,-a,-Math.PI/2);c.scale.z=0.45;}
  // a flag on the keep once it's finished
  const fg=new T.Group(),fp=new T.Mesh(new T.CylinderGeometry(0.012,0.012,0.5,6),mat(0xd8c8a8));fp.position.set(0,1.3,0);fg.add(fp);
  const fl=new T.Mesh(new T.PlaneGeometry(0.24,0.15),mat(0xc8102e,{side:T.DoubleSide}));fl.position.set(0.12,1.47,0);fg.add(fl);g.add(fg);fg.visible=false;
  // bucket and rake left on the sand
  const bu=new T.Mesh(new T.CylinderGeometry(0.15,0.11,0.2,16,1,true),mat(0x2f7fd8,{roughness:0.5,side:T.DoubleSide}));bu.position.set(1.95,0.1,-0.9);bu.rotation.set(0,0,2.9);g.add(bu);
  const rk=new T.Group();rk.position.set(-1.9,0.02,0.9);rk.rotation.y=0.6;g.add(rk);rk.add(rod(new T.Vector3(0,0.01,0),new T.Vector3(0.5,0.01,0),0.012,mat(0x3aa845,{roughness:0.5})));
  const rh=new T.Mesh(new T.BoxGeometry(0.03,0.02,0.2),mat(0x3aa845,{roughness:0.5}));rh.position.set(0.5,0.01,0);rk.add(rh);
  parts.forEach(p=>mergeStatic(p));
  const setBuild=u=>{const N=parts.length;parts.forEach((p,i)=>{let k=Math.max(0,Math.min(1,u*N-i));k=k*k*(3-2*k);p.visible=k>0.002;p.scale.set(1,Math.max(0.002,k),1);});};
  setBuild(0.08);g.userData.flag=fg;g.userData.setBuild=setBuild;world.userData.castle=g;
  spots.push({x:-8,z:-38,r:7,id:'sandcastle',label:'build a sandcastle with the little one 🏖️'});}

function buildVillaWorld(){
  world=new T.Group();scene.add(world);
  // ground planes with a hole cut where the sunken pool basin sits (x ±8, z 1.75..8.25)
  const holed=(x0,x1,z0,z1)=>{const sh=new T.Shape();sh.moveTo(x0,-z1);sh.lineTo(x1,-z1);sh.lineTo(x1,-z0);sh.lineTo(x0,-z0);sh.closePath();
    const h=new T.Path();h.moveTo(-8,-8.25);h.lineTo(-8,-1.75);h.lineTo(8,-1.75);h.lineTo(8,-8.25);h.closePath();sh.holes.push(h);
    const g=new T.ShapeGeometry(sh);g.rotateX(-Math.PI/2);return g;};
  const lt=rep(grassT,0.217,0.219);
  const lawn=new T.Mesh(holed(-60,60,-12,52),new T.MeshStandardMaterial({map:lt,bumpMap:lt,bumpScale:0.04,roughness:0.9}));lawn.position.y=0.02;lawn.receiveShadow=true;world.add(lawn);
  // ---- promenade (tiled) + low wall + La Barrosa-style navy lamps ----
  const pt=rep(tileT,27,1);
  const prom=new T.Mesh(new T.PlaneGeometry(220,8),new T.MeshStandardMaterial({map:pt,bumpMap:pt,bumpScale:0.03,roughness:0.85}));prom.rotation.x=-Math.PI/2;prom.position.set(0,0.03,-15);prom.receiveShadow=true;world.add(prom);
  const pwall=box(190,0.9,0.6,0xeae0c8);pwall.position.set(0,0.45,-18.7);world.add(pwall);
  // swan-neck promenade lamps: cast base, tapered navy post, arm reaching over the walk, lantern head with a lens that lights at night
  const lampLights=[],lampPosts=[];world.userData.lampPosts=lampPosts;
  const navy=mat(0x1f3552,{roughness:0.45,metalness:0.55}),lens=new T.MeshBasicMaterial({color:0xd8d4c8});world.userData.lampLens=lens;
  const glowT=radialTex(64,64,[[32,32,0,32,[[0,0.9],[0.25,0.4],[1,0]]]],[255,226,160]);
  const armG=new T.TubeGeometry(new T.QuadraticBezierCurve3(new T.Vector3(0,5.65,0),new T.Vector3(0,6.6,0.05),new T.Vector3(0,6.3,1.35)),20,0.07,8,false);
  for(let lx=-72;lx<=72;lx+=24){const lg=new T.Group();lampPosts.push(lg);lg.position.set(lx,0,-17.9);world.add(lg);
    const P=(geo,m,x,y,z)=>{const o=new T.Mesh(geo,m);o.position.set(x,y,z);o.castShadow=true;lg.add(o);return o;};
    P(new T.CylinderGeometry(0.3,0.42,0.7,14),navy,0,0.35,0);P(new T.CylinderGeometry(0.19,0.26,0.28,14),navy,0,0.84,0);
    P(new T.CylinderGeometry(0.085,0.14,4.8,12),navy,0,3.28,0);
    [2.4,4.9].forEach(y=>{const r=P(new T.TorusGeometry(0.13,0.035,6,14),navy,0,y,0);r.rotation.x=Math.PI/2;});
    P(new T.SphereGeometry(0.11,10,8),navy,0,5.72,0);P(armG,navy,0,0,0);
    P(new T.CylinderGeometry(0.1,0.42,0.3,16),navy,0,6.22,1.36);P(new T.SphereGeometry(0.1,8,6),navy,0,6.42,1.36);
    const ln=P(new T.CircleGeometry(0.37,16),lens,0,6.065,1.36);ln.rotation.x=Math.PI/2;ln.castShadow=false;
    mergeStatic(lg);
    const pl=new T.PointLight(0xffdd88,0,20,2);pl.position.set(lx,5.9,-16.54);world.add(pl);
    const halo=new T.Sprite(new T.SpriteMaterial({map:glowT,blending:T.AdditiveBlending,transparent:true,depthWrite:false,opacity:0,fog:false}));halo.scale.set(2.2,2.2,1);halo.position.set(lx,6.0,-16.54);world.add(halo);
    lampLights.push({pl:pl,halo:halo});}
  world.userData.lampLights=lampLights;
  // ---- golden beach + wet sand + foam ----
  const bt=rep(sandT,210,4.5);
  const beach=new T.Mesh(new T.PlaneGeometry(1400,30),new T.MeshStandardMaterial({map:bt,bumpMap:bt,bumpScale:0.06,roughness:0.95}));beach.rotation.x=-Math.PI/2;beach.position.set(0,0.025,-32);beach.receiveShadow=true;world.add(beach);
  const wt=rep(sandT,210,1.2);
  const wet=new T.Mesh(new T.PlaneGeometry(1400,8),new T.MeshStandardMaterial({map:wt,color:0xb59d72,bumpMap:wt,bumpScale:0.02,roughness:0.55,metalness:0.08}));wet.rotation.x=-Math.PI/2;wet.position.set(0,0.035,-43);wet.receiveShadow=true;world.add(wet);
  const foam=new T.Mesh(new T.PlaneGeometry(1400,2.6),new T.MeshStandardMaterial({color:0xffffff,roughness:0.6,transparent:true,opacity:0.85}));foam.rotation.x=-Math.PI/2;foam.position.set(0,0.05,-45.6);world.add(foam);
  // shore breaking wave crests (animated in update loop)
  const waveCrests=[];
  for(let wi=0;wi<4;wi++){const wc=new T.Mesh(new T.PlaneGeometry(1400,3.5),new T.MeshStandardMaterial({color:0xffffff,roughness:0.5,transparent:true,opacity:0.0,depthWrite:false}));wc.rotation.x=-Math.PI/2;wc.position.set(0,0.09,-52);world.add(wc);waveCrests.push(wc);}
  world.userData.waveCrests=waveCrests;
  // ---- daytime birds ----
  {const mkBird=function(){const g=new T.Group();const bm=new T.MeshBasicMaterial({color:0x1a1a28,fog:false});g.add(new T.Mesh(new T.BoxGeometry(0.9,0.12,0.22),bm));const lw=new T.Mesh(new T.BoxGeometry(1.7,0.09,0.38),bm);lw.position.set(-1.1,0,0);g.add(lw);g.userData.lw=lw;const rw=new T.Mesh(new T.BoxGeometry(1.7,0.09,0.38),bm);rw.position.set(1.1,0,0);g.add(rw);g.userData.rw=rw;return g;};
  const flocks=[{cx:0,cy:72,cz:-80,r:180,spd:0.18,n:4},{cx:-60,cy:95,cz:-50,r:140,spd:0.22,n:3},{cx:80,cy:58,cz:-20,r:100,spd:0.28,n:5}];
  const birds=[];
  flocks.forEach(function(fl){for(let bi=0;bi<fl.n;bi++){const b=mkBird();const off=bi*(Math.PI*2/fl.n);b.visible=false;world.add(b);birds.push({mesh:b,cx:fl.cx+(Math.random()-0.5)*12,cy:fl.cy+(Math.random()-0.5)*8,cz:fl.cz+(Math.random()-0.5)*12,r:fl.r,spd:fl.spd,a:off,fp:2.2+Math.random()*0.8,fa:Math.random()*Math.PI*2});}});
  world.userData.birds=birds;}
  // ---- sea (turquoise, gently waving) ----
  const seaGeo=new T.PlaneGeometry(12000,6000,90,45);
  const sea=new T.Mesh(seaGeo,new T.MeshStandardMaterial({color:0x1f9fc4,roughness:0.06,metalness:0.68,flatShading:false,emissive:0x99ccee,emissiveIntensity:0.0}));
  sea.rotation.x=-Math.PI/2;sea.position.set(0,0.12,-3047);sea.receiveShadow=false;world.add(sea);world.userData.sea=sea;
  // calm side water beyond the hand-made beach: shows wherever the real coastline curves inland (terrain sea sits below it)
  [[-3350,1],[3350,1]].forEach(q=>{const sw=new T.Mesh(new T.PlaneGeometry(5300,1600),sea.material);sw.rotation.x=-Math.PI/2;sw.position.set(q[0],0.12,-47+800);world.add(sw);});
  {const sn=rippleN.clone();sn.needsUpdate=true;sn.repeat.set(960,480);sea.material.normalMap=sn;sea.material.normalScale=new T.Vector2(0.25,0.25);world.userData.seaN=sn;}
  // shimmer canvas texture (wave lines + sparkles, updated per-frame)
  {const shCv=document.createElement('canvas');shCv.width=128;shCv.height=128;const shCtx=shCv.getContext('2d');const shTex=new T.CanvasTexture(shCv);shTex.wrapS=shTex.wrapT=T.RepeatWrapping;shTex.repeat.set(30,15);shTex.generateMipmaps=false;shTex.minFilter=T.LinearFilter;sea.material.emissiveMap=shTex;world.userData.shimCtx=shCtx;world.userData.shimTex=shTex;}
  // beach parasols + towels
  const twT=(a,b)=>{const cv=document.createElement('canvas');cv.width=64;cv.height=32;const c=cv.getContext('2d');for(let i=0;i<8;i++){c.fillStyle=i%2?b:a;c.fillRect(i*8,0,8,32);}const t=new T.CanvasTexture(cv);t.encoding=T.sRGBEncoding;return t;};
  const paraCols={0xe05a4a:['#e05a4a','#fbf6ec'],0xefb13a:['#efb13a','#fbf6ec'],0x4aa3c2:['#2f86b0','#fbf6ec']};
  const para=(x,z,c)=>{const gp=new T.Group();const pc=paraCols[c]||['#e05a4a','#fbf6ec'];const pp=parasol(0,0,c,stripeT(pc[0],pc[1]));pp.scale.setScalar(1.15);gp.add(pp);
    const tw=new T.Mesh(new T.BoxGeometry(2.2,0.04,1.2),new T.MeshStandardMaterial({map:twT(pc[0],'#fdfbf5'),roughness:1}));tw.position.set(0.4,0.05,1.4);tw.receiveShadow=true;gp.add(tw);gp.position.set(x,0,z);return gp;};
  world.add(para(-42,-30,0xe05a4a));world.add(para(-22,-35,0xefb13a));world.add(para(36,-31,0x4aa3c2));world.add(para(56,-36,0xe05a4a));

  // ===== modern villa (after the brochure) =====
  const vx=0,vz=22, whiteA=0xf3eee6, whiteB=0xf7f3ec, stone=0x34383d;
  const glass=()=>new T.MeshStandardMaterial({color:0x16222e,roughness:0.12,metalness:0.55});
  const terr=box(22,0.12,9,0xe8dcc4);terr.position.set(vx,0.06,vz-7);world.add(terr);
  const lower=box(20,4.6,10,whiteA);lower.position.set(vx,2.3,vz);world.add(lower);
  const upper=box(20,3.8,8,whiteB);upper.position.set(vx,6.5,vz-2);world.add(upper);            // cantilever over terrace
  const roof=box(20.6,0.5,8.6,0xeae3d6);roof.position.set(vx,8.6,vz-2);world.add(roof);
  [lower,upper,roof,terr].forEach(m=>{m.material.bumpMap=stucT;m.material.bumpScale=0.025;});
  // dark-stone feature column (full height, beside the entrance)
  const feat=new T.Mesh(new T.BoxGeometry(2.8,8.8,0.6),mat(stone,{roughness:0.95}));feat.position.set(vx-5.5,4.3,vz-5.25);feat.castShadow=true;feat.receiveShadow=true;world.add(feat);
  // glazing
  const gb=new T.Mesh(new T.BoxGeometry(15,2.4,0.25),glass());gb.position.set(vx+1.2,6.7,vz-6.02);world.add(gb);
  [-7,6.5].forEach(gxx=>{const gp=new T.Mesh(new T.BoxGeometry(4.2,3.2,0.25),glass());gp.position.set(vx+gxx,2.5,vz-5.02);world.add(gp);});
  // recessed entrance + steps + glass doors
  const ent=box(4,3.8,0.5,0x20242a);ent.position.set(vx+0.5,1.9,vz-4.95);world.add(ent);
  const doors=new T.Mesh(new T.BoxGeometry(3,3.2,0.2),glass());doors.position.set(vx+0.5,1.7,vz-5.2);world.add(doors);
  const st1=box(5.5,0.25,1.4,0xe3d7bd);st1.position.set(vx+0.5,0.12,vz-6.2);world.add(st1);
  const st2=box(4.4,0.25,0.9,0xe8dcc4);st2.position.set(vx+0.5,0.32,vz-5.7);world.add(st2);
  solids.push({x:vx,z:vz,rx:10.4,rz:5.3});

  // ===== long heated salt-water pool — sunken mosaic basin, travertine deck =====
  const px=0,pz=5,pw=16,pd=6.5,pDepth=1.5,wY=-0.1;
  {const sh=new T.Shape();sh.moveTo(-10,-11.25);sh.lineTo(10,-11.25);sh.lineTo(10,0.25);sh.lineTo(-10,0.25);sh.closePath();
   const hole=new T.Path();hole.moveTo(-8.5,-8.75);hole.lineTo(-8.5,-1.25);hole.lineTo(8.5,-1.25);hole.lineTo(8.5,-8.75);hole.closePath();sh.holes.push(hole);
   const dg=new T.ExtrudeGeometry(sh,{depth:0.07,bevelEnabled:false});dg.rotateX(-Math.PI/2);
   const dt=rep(deckT,0.5,0.5);const deck=new T.Mesh(dg,new T.MeshStandardMaterial({map:dt,bumpMap:dt,bumpScale:0.02,roughness:0.8}));deck.receiveShadow=true;world.add(deck);}
  // bull-nosed coping ring
  [[0,1.5,17,0.5],[0,8.5,17,0.5],[-8.25,5,0.5,6.5],[8.25,5,0.5,6.5]].forEach(c=>{const cp=box(c[2],0.12,c[3],0xf1e7d2,{roughness:0.6});cp.position.set(px+c[0],0.06,c[1]);cp.castShadow=false;world.add(cp);});
  // basin: mosaic walls + floor with animated caustics
  const ptw=rep(poolTileT,pw/2,pDepth/2),ptd=rep(poolTileT,pd/2,pDepth/2),ptf=rep(poolTileT,pw/2,pd/2);
  const cst=causticT.clone();cst.needsUpdate=true;cst.repeat.set(3.2,1.3);
  const floorM=new T.MeshStandardMaterial({map:ptf,roughness:0.35,emissive:0x9ff6ff,emissiveMap:cst,emissiveIntensity:0.5});
  const pfl=new T.Mesh(new T.PlaneGeometry(pw,pd),floorM);pfl.rotation.x=-Math.PI/2;pfl.position.set(px,-pDepth,pz);pfl.receiveShadow=true;world.add(pfl);
  [[0,pz-pd/2,0,pw,ptw],[0,pz+pd/2,Math.PI,pw,ptw],[-pw/2,pz,Math.PI/2,pd,ptd],[pw/2,pz,-Math.PI/2,pd,ptd]].forEach(w=>{const wl=new T.Mesh(new T.PlaneGeometry(w[3],pDepth+0.12),new T.MeshStandardMaterial({map:w[4],roughness:0.35}));wl.position.set(px+w[0],-pDepth/2+0.06,w[1]);wl.rotation.y=w[2];wl.receiveShadow=true;world.add(wl);});
  // roman steps at the shallow end
  [[0.6,-0.45],[1.2,-0.9]].forEach((st,i)=>{const sb=new T.Mesh(new T.BoxGeometry(st[0],pDepth+st[1],pd),new T.MeshStandardMaterial({map:rep(poolTileT,1,pd/2),roughness:0.35}));sb.position.set(-pw/2+st[0]/2,-pDepth+(pDepth+st[1])/2,pz);world.add(sb);});
  // water surface: clear, rippling, reflects the sky
  const pwt=rippleN.clone();pwt.needsUpdate=true;pwt.repeat.set(5,2);
  const water=new T.Mesh(new T.PlaneGeometry(pw,pd),new T.MeshStandardMaterial({color:0x5cc9dc,transparent:true,opacity:0.55,roughness:0.05,metalness:0.25,normalMap:pwt,normalScale:new T.Vector2(0.35,0.35),envMapIntensity:1.3}));
  water.rotation.x=-Math.PI/2;water.position.set(px,wY,pz);water.renderOrder=2;world.add(water);world.userData.water=water;world.userData.poolTex=pwt;world.userData.caustic=cst;world.userData.poolFloor=floorM;
  // underwater pool light
  const poolPL=new T.PointLight(0x20aaee,0,14,1.8);poolPL.position.set(px,-1.0,pz);world.add(poolPL);world.userData.poolPL=poolPL;
  // soft glow plane just under the surface
  const poolGlow=new T.Mesh(new T.PlaneGeometry(pw,pd),new T.MeshBasicMaterial({color:0x40ccff,transparent:true,opacity:0,fog:false,depthWrite:false}));poolGlow.rotation.x=-Math.PI/2;poolGlow.position.set(px,wY-0.05,pz);world.add(poolGlow);world.userData.poolGlow=poolGlow;
  solids.push({x:px,z:pz,rx:pw/2+0.6,rz:pd/2+0.6});
  spots.push({x:px,z:pz-pd/2-2,r:5,id:'pool',label:'dive into the heated pool'});
  // jacuzzi at the far end (raised stone tub)
  const jx=10.5,jz=5;const jbase=box(4,0.9,4,0xdfd2b4);jbase.position.set(jx,0.45,jz);jbase.material.map=rep(deckT,1,0.5);world.add(jbase);
  [[0,-1.95,4.2,0.3],[0,1.95,4.2,0.3],[-1.95,0,0.3,3.6],[1.95,0,0.3,3.6]].forEach(r=>{const jr=box(r[2],0.1,r[3],0xf1e7d2,{roughness:0.6});jr.position.set(jx+r[0],0.95,jz+r[1]);world.add(jr);});
  const jwt=rippleN.clone();jwt.needsUpdate=true;jwt.repeat.set(1.5,1.5);
  const jwat=new T.Mesh(new T.BoxGeometry(3.4,0.45,3.4),new T.MeshStandardMaterial({color:0x8fdcea,roughness:0.05,metalness:0.2,transparent:true,opacity:0.82,normalMap:jwt,normalScale:new T.Vector2(0.6,0.6)}));jwat.position.set(jx,0.78,jz);world.add(jwat);world.userData.jacTex=jwt;
  // bubbles
  {const bg=new T.Group();for(let i=0;i<22;i++){const b=new T.Mesh(new T.SphereGeometry(0.05+Math.random()*0.05,6,5),new T.MeshBasicMaterial({color:0xffffff,transparent:true,opacity:0.7}));b.position.set(jx+(Math.random()-0.5)*3,1.0,jz+(Math.random()-0.5)*3);b.userData.ph=Math.random()*6;bg.add(b);}world.add(bg);world.userData.bubbles=bg;}
  solids.push({x:jx,z:jz,rx:2.2,rz:2.2});
  spots.push({x:jx,z:jz-3,r:3.5,id:'jacuzzi',label:'sink into the jacuzzi'});
  spots.push({x:-5,z:14,r:4.5,id:'stargaze',label:'stargaze from the terrace ⭐'});
  spots.push({x:-10,z:2,r:3.5,id:'sunset',label:'watch the sunset 🌅'});
  // activity beacons — glow-pillars that pulse to guide the player
  (function(){function mkB(x,z,col){const g=new T.Group();const ring=new T.Mesh(new T.CircleGeometry(3,24),new T.MeshBasicMaterial({color:col,transparent:true,opacity:0.3,depthWrite:false,side:T.DoubleSide}));ring.rotation.x=-Math.PI/2;ring.position.y=0.05;g.add(ring);const beam=new T.Mesh(new T.CylinderGeometry(0.1,0.55,8,8,1,true),new T.MeshBasicMaterial({color:col,transparent:true,opacity:0.22,depthWrite:false,side:T.BackSide}));beam.position.y=4;g.add(beam);g.position.set(x,0,z);g.visible=false;world.add(g);return g;}world.userData.stargazeBeacon=mkB(-5,14,0xaaddff);world.userData.sunsetBeacon=mkB(-10,2,0xffaa33);})();
  // temporary toddler pool barrier (per the plan) — frameless glass panels on steel spigots
  const fmat=new T.MeshStandardMaterial({color:0xdff4f8,roughness:0.05,metalness:0.3,transparent:true,opacity:0.28});
  for(let i=-8;i<=8;i+=2){const fp=box(0.06,0.25,0.06,0xc8ccd0,{metalness:0.8,roughness:0.3});fp.position.set(px+i,0.13,pz-pd/2-1.2);world.add(fp);}
  const frail=new T.Mesh(new T.BoxGeometry(pw+1,1.0,0.05),fmat);frail.position.set(px,0.65,pz-pd/2-1.2);world.add(frail);
  const ftop=box(pw+1,0.05,0.08,0xc8ccd0,{metalness:0.8,roughness:0.3});ftop.position.set(px,1.16,pz-pd/2-1.2);world.add(ftop);

  // ===== outdoor furniture =====
  world.add(lounger(-6,9.4,Math.PI));world.add(lounger(-2,9.4,Math.PI));world.add(lounger(2,9.4,Math.PI));
  solids.push({x:-6,z:9.4,rx:0.7,rz:1.3});solids.push({x:-2,z:9.4,rx:0.7,rz:1.3});solids.push({x:2,z:9.4,rx:0.7,rz:1.3});
  spots.push({x:-2,z:10.5,r:3,id:'lounge',label:'flop on a sun lounger'});
  // sangria table by the pool
  const dtbl=cyl(0.9,0.9,0.08,0xf2efe8,20);dtbl.position.set(5.5,1.0,9.0);world.add(dtbl);
  const dstem=cyl(0.08,0.08,1.0,0xc8ccd0,10);dstem.position.set(5.5,0.5,9.0);world.add(dstem);
  const dfoot=cyl(0.5,0.55,0.06,0xc8ccd0,16);dfoot.position.set(5.5,0.03,9.0);world.add(dfoot);
  buildSangria();
  // modular outdoor sofas (teak frame, deep cushions)
  const sofa=(sx,sz,ry)=>{const gp=new T.Group();
    const base=box(4,0.3,1.6,0x8a6a4a,{roughness:0.8});base.position.y=0.3;gp.add(base);
    const seat=box(3.5,0.22,1.3,0xf5f1e8,{roughness:0.95});seat.position.set(0,0.56,0.08);gp.add(seat);
    const back=box(3.5,0.75,0.35,0xf5f1e8,{roughness:0.95});back.position.set(0,0.9,-0.6);back.rotation.x=-0.12;gp.add(back);
    [-1.85,1.85].forEach(ax=>{const arm=box(0.3,0.62,1.6,0x8a6a4a,{roughness:0.8});arm.position.set(ax,0.6,0);gp.add(arm);});
    [[-1.1,0xe8a838],[0.2,0x2f6f9e],[1.2,0xc2562f]].forEach(c=>{const cu=box(0.6,0.5,0.18,c[1],{roughness:0.95});cu.position.set(c[0],0.92,-0.38);cu.rotation.set(-0.25,0,(Math.random()-0.5)*0.3);gp.add(cu);});
    gp.position.set(sx,0,sz);gp.rotation.y=ry||0;return gp;};
  world.add(sofa(-6.5,13.5,Math.PI));solids.push({x:-6.5,z:13.5,rx:2.2,rz:1.0});
  world.add(sofa(-9.5,12.2,Math.PI/2));solids.push({x:-9.5,z:12.2,rx:1.0,rz:2.2});
  const ctab=box(1.6,0.08,0.9,0x6b4f33,{roughness:0.7});ctab.position.set(-6.3,0.42,11.6);world.add(ctab);
  const ctabB=box(1.4,0.36,0.7,0x5a4028,{roughness:0.8});ctabB.position.set(-6.3,0.2,11.6);world.add(ctabB);
  // dining table + six chairs on the east terrace
  const tbl=box(4.2,0.1,1.6,0x6b4f33,{roughness:0.6});tbl.position.set(19,1.02,14);world.add(tbl);
  [[-1.9,-0.6],[1.9,-0.6],[-1.9,0.6],[1.9,0.6]].forEach(l=>{const lg=box(0.1,0.98,0.1,0x5a4028);lg.position.set(19+l[0],0.49,14+l[1]);world.add(lg);});
  solids.push({x:19,z:14,rx:2.6,rz:1.6});
  [[-1.4,1.05,Math.PI],[0,1.05,Math.PI],[1.4,1.05,Math.PI],[-1.4,-1.05,0],[0,-1.05,0],[1.4,-1.05,0]].forEach(p=>{const ch=new T.Group();
    const st=box(0.7,0.07,0.66,0xf2efe7,{roughness:0.6});st.position.y=0.6;ch.add(st);
    const bk=box(0.7,0.7,0.06,0xf2efe7,{roughness:0.6});bk.position.set(0,0.98,-0.32);bk.rotation.x=-0.1;ch.add(bk);
    [[-0.3,-0.28],[0.3,-0.28],[-0.3,0.28],[0.3,0.28]].forEach(l=>{const lg=box(0.05,0.6,0.05,0xc8ccd0,{metalness:0.7,roughness:0.3});lg.position.set(l[0],0.3,l[1]);ch.add(lg);});
    ch.position.set(19+p[0],0,14+p[1]);ch.rotation.y=p[2];world.add(ch);});

  // ===== BBQ + paella — east terrace, clear of the entrance path =====
  buildBBQ();buildPaella();

  // ===== beach chiringuito (ice creams) =====
  buildChiringuito(para);

  // ===== car on the drive =====
  const car=carMesh(0x2f6f9e);car.position.set(-24,0,22);car.rotation.y=0.3;world.add(car);car.userData.home=car.position.clone();world.userData.car=car;
  solids.push({x:-24,z:22,rx:2.2,rz:3.1});
  spots.push({x:-21,z:22,r:4,id:'car',label:'drive to Seville (Naboo!)'});

  // the little one's bedroom (revealed when you go inside to put them to bed)
  kidsRoom=new T.Group();kidsRoom.visible=false;scene.add(kidsRoom);
  const flT=mkTex((c,s)=>{c.fillStyle='#caa27a';c.fillRect(0,0,s,s);for(let i=0;i<8;i++){c.fillStyle=i%2?'#c09870':'#d2aa82';c.fillRect(0,i*s/8,s,s/8-2);c.fillStyle='rgba(90,60,30,0.35)';c.fillRect(0,i*s/8+s/8-2,s,2);}_speck(c,s,1500,18,2);},3,2);
  const rmF=new T.Mesh(new T.BoxGeometry(14,0.2,11),new T.MeshStandardMaterial({map:flT,roughness:0.6}));rmF.position.set(0,0.1,0);rmF.receiveShadow=true;kidsRoom.add(rmF);
  const wallM=mat(0xf4e9dc,{roughness:0.95});
  const rmBack=new T.Mesh(new T.BoxGeometry(14,7,0.3),wallM);rmBack.position.set(0,3.5,-5.5);rmBack.receiveShadow=true;kidsRoom.add(rmBack);
  const rmL=new T.Mesh(new T.BoxGeometry(0.3,7,11),wallM);rmL.position.set(-7,3.5,0);rmL.receiveShadow=true;kidsRoom.add(rmL);
  const rmR=rmL.clone();rmR.position.x=7;kidsRoom.add(rmR);
  const skirting=box(14,0.3,0.1,0xffffff);skirting.position.set(0,0.35,-5.3);kidsRoom.add(skirting);
  const rug=new T.Mesh(new T.CircleGeometry(3.4,32),mat(0x9cc8d8,{roughness:1}));rug.rotation.x=-Math.PI/2;rug.position.set(0,0.21,1.2);rug.receiveShadow=true;kidsRoom.add(rug);
  const rug2=new T.Mesh(new T.RingGeometry(2.6,2.9,32),mat(0xf6f0e4,{roughness:1}));rug2.rotation.x=-Math.PI/2;rug2.position.set(0,0.215,1.2);kidsRoom.add(rug2);
  const win=new T.Mesh(new T.BoxGeometry(4,2.4,0.2),new T.MeshStandardMaterial({color:0x1b2740,emissive:0x14213c,emissiveIntensity:0.6}));win.position.set(3.2,4.2,-5.34);kidsRoom.add(win);
  [[0,1.3,4.3,0.14],[0,-1.3,4.3,0.14],[-2.1,0,0.14,2.6],[2.1,0,0.14,2.6],[0,0,0.08,2.6]].forEach(f=>{const fr=box(f[2],f[3],0.25,0xffffff);fr.position.set(3.2+f[0],4.2+f[1],-5.3);kidsRoom.add(fr);});
  const moon=new T.Mesh(new T.SphereGeometry(0.4,12,12),new T.MeshStandardMaterial({color:0xfff6cf,emissive:0xdfcf90,emissiveIntensity:0.8}));moon.position.set(4.2,4.8,-5.3);kidsRoom.add(moon);
  // bunting across the back wall
  for(let i=0;i<11;i++){const f=new T.Mesh(new T.ConeGeometry(0.28,0.6,3),mat([0xf2a0a0,0xf6d67a,0x9ed0e6,0xb8e0b0][i%4]));f.rotation.set(Math.PI,0,0);f.position.set(-5+i*0.8,5.6-Math.sin(i/10*Math.PI)*0.5,-5.3);f.scale.z=0.2;kidsRoom.add(f);}
  // cot with turned bars
  const cx0=-1.2,cz0=-2.6,cotM=mat(0xfbf8f2,{roughness:0.5});
  const cot=new T.Group();cot.position.set(cx0,0.2,cz0);kidsRoom.add(cot);
  [[-1.25,-0.75],[1.25,-0.75],[-1.25,0.75],[1.25,0.75]].forEach(pp=>{const po=new T.Mesh(new T.CylinderGeometry(0.07,0.07,2.0,10),cotM);po.position.set(pp[0],1.0,pp[1]);po.castShadow=true;cot.add(po);const kn=new T.Mesh(new T.SphereGeometry(0.1,10,8),cotM);kn.position.set(pp[0],2.05,pp[1]);cot.add(kn);});
  [-0.75,0.75].forEach(zz=>{[0.55,1.85].forEach(yy=>{const r=new T.Mesh(new T.BoxGeometry(2.5,0.08,0.08),cotM);r.position.set(0,yy,zz);cot.add(r);});for(let b=-1.1;b<=1.11;b+=0.2){const bar=new T.Mesh(new T.CylinderGeometry(0.025,0.025,1.3,6),cotM);bar.position.set(b,1.2,zz);cot.add(bar);}});
  [-1.25,1.25].forEach(xx=>{const hb=new T.Mesh(new T.BoxGeometry(0.08,1.35,1.5),cotM);hb.position.set(xx,1.2,0);cot.add(hb);});
  const matt=box(2.4,0.3,1.4,0xffffff,{roughness:1});matt.position.set(0,0.75,0);cot.add(matt);
  const blanket=box(1.3,0.08,1.42,0x9cc8d8,{roughness:1});blanket.position.set(0.5,0.94,0);cot.add(blanket);
  const pillow=box(0.55,0.14,0.9,0xfff7ee,{roughness:1});pillow.position.set(-0.85,0.97,0);cot.add(pillow);
  // hanging mobile (spins while they sleep)
  const mob=new T.Group();mob.position.set(cx0,4.2,cz0);kidsRoom.add(mob);
  const marm=new T.Mesh(new T.TorusGeometry(0.7,0.03,6,24),mat(0xe8c25a,{metalness:0.6,roughness:0.3}));marm.rotation.x=Math.PI/2;mob.add(marm);
  const mstr=new T.Mesh(new T.CylinderGeometry(0.01,0.01,1.8,4),mat(0xcccccc));mstr.position.y=0.9;mob.add(mstr);
  [0xf6d67a,0x9ed0e6,0xf2a0a0,0xb8e0b0,0xf6d67a].forEach((c,i)=>{const a=i/5*Math.PI*2;const st=new T.Mesh(new T.OctahedronGeometry(0.16),mat(c,{emissive:c,emissiveIntensity:0.25}));st.position.set(Math.cos(a)*0.7,-0.5,Math.sin(a)*0.7);mob.add(st);
    const th=new T.Mesh(new T.CylinderGeometry(0.006,0.006,0.5,3),mat(0xcccccc));th.position.set(Math.cos(a)*0.7,-0.25,Math.sin(a)*0.7);mob.add(th);});
  kidsRoom.userData.mobile=mob;
  // nightlight lamp, armchair, toy box, teddy
  const lampT=box(0.9,0.9,0.9,0xe8dccb);lampT.position.set(2.4,0.65,-3.6);kidsRoom.add(lampT);
  const shade=new T.Mesh(new T.CylinderGeometry(0.3,0.42,0.45,16,1,true),new T.MeshStandardMaterial({color:0xffe2b0,emissive:0xffb060,emissiveIntensity:0.9,side:T.DoubleSide}));shade.position.set(2.4,1.55,-3.6);kidsRoom.add(shade);
  const lstem=cyl(0.04,0.04,0.35,0xc8a060,6);lstem.position.set(2.4,1.25,-3.6);kidsRoom.add(lstem);
  const nl=new T.PointLight(0xffb870,1.1,14,1.6);nl.position.set(2.4,1.7,-3.2);kidsRoom.add(nl);
  const arm=new T.Group();arm.position.set(-4.8,0.2,-1.4);arm.rotation.y=0.6;kidsRoom.add(arm);
  const as=box(1.5,0.5,1.3,0xb8a4cc,{roughness:1});as.position.y=0.6;arm.add(as);const ab=box(1.5,1.2,0.3,0xb8a4cc,{roughness:1});ab.position.set(0,1.2,-0.55);arm.add(ab);
  [-0.7,0.7].forEach(x=>{const aa=box(0.22,0.75,1.3,0xa892be,{roughness:1});aa.position.set(x,0.75,0);arm.add(aa);});
  const tb=box(1.4,0.8,0.9,0xf2c14e,{roughness:0.8});tb.position.set(4.6,0.6,-1.2);kidsRoom.add(tb);
  const ted=new T.Group();ted.position.set(-4.6,1.05,-1.3);ted.rotation.y=0.6;kidsRoom.add(ted);const tm=mat(0xb07a48,{roughness:1});
  [[0,0.25,0,0.3],[0,0.72,0,0.22],[-0.16,0.9,0,0.08],[0.16,0.9,0,0.08],[-0.26,0.3,0.1,0.1],[0.26,0.3,0.1,0.1]].forEach(b=>{const m=new T.Mesh(new T.SphereGeometry(b[3],12,10),tm);m.position.set(b[0],b[1],b[2]);ted.add(m);});
  kidsRoom.userData.bed={x:cx0,z:cz0,y:1.1};
  // exit marker in the room
  kidsRoom.userData.exit={x:0,z:5};

  // ===== villa entrance path + door lights =====
  // stone tile path leading to the front door
  [-4].forEach(dz=>{const tile=box(4,0.06,3,0xd9ccb2);tile.position.set(vx+0.5,0.075,vz-5+dz);world.add(tile);});
  // warm wall-lights either side of the door (always on; halo fades day/night in applyTime)
  const elPairs=[[-3.5,vz-5],[4.5,vz-5]];
  const entrLights=[];
  elPairs.forEach(function(ep){
    const pl=new T.PointLight(0xffcc88,0,8,1.6);pl.position.set(ep[0],3.2,ep[1]);world.add(pl);
    const halo=new T.Mesh(new T.SphereGeometry(0.22,8,8),new T.MeshBasicMaterial({color:0xffdd88,transparent:true,opacity:0,fog:false}));halo.position.set(ep[0],3.2,ep[1]);world.add(halo);
    entrLights.push({pl,halo});
  });
  world.userData.entrLights=entrLights;
  // glowing doorstep ring — daytime gold, always visible, pulses gently
  const dring=new T.Mesh(new T.RingGeometry(1.6,2.2,36),new T.MeshBasicMaterial({color:0xf5c842,transparent:true,opacity:0.55,side:T.DoubleSide,depthWrite:false,fog:false}));dring.rotation.x=-Math.PI/2;dring.position.set(vx+0.5,0.04,vz-5.5);world.add(dring);world.userData.dring=dring;
  // floating door arrow — shown at bedtime and wakeup time
  {const am=new T.MeshBasicMaterial({color:0xff6622,fog:false});const ag=new T.Group();const cone=new T.Mesh(new T.ConeGeometry(0.7,1.4,8),am);cone.rotation.x=Math.PI;cone.position.y=0;ag.add(cone);const shaft=new T.Mesh(new T.CylinderGeometry(0.18,0.18,1.1,8),am);shaft.position.y=1.25;ag.add(shaft);ag.position.set(vx+0.5,11,vz-5);ag.visible=false;world.add(ag);world.userData.doorArrow=ag;}
  // nap and bed spots right at the doorstep
  spots.push({x:vx-3.5,z:vz-5,r:2.4,id:'nap',label:'siesta inside 💤'});
  spots.push({x:vx+3.5,z:vz-5,r:2.4,id:'bed',label:'put the little one to bed 😴'});

  // ===== private sauna cabin (per the brochure) =====
  buildSauna();

  // ===== planting: bougainvillea over the villa, planters, agaves, geranium pots =====
  {const fl=new T.MeshStandardMaterial({color:0xffffff,roughness:0.8}),lf=new T.MeshStandardMaterial({color:0x3f6f34,roughness:0.9});
   const geo=new T.IcosahedronGeometry(1,0),dm=new T.Object3D(),col=new T.Color();
   const bougain=(x0,x1,z,h,out)=>{const n=Math.round((x1-x0)*70),fi=new T.InstancedMesh(geo,fl,n),li=new T.InstancedMesh(geo,lf,Math.round(n*0.6));let nf=0,nl=0;
     for(let i=0;i<n*1.6;i++){const u=Math.random(),x=x0+u*(x1-x0),top=h*(0.55+0.45*Math.sin(u*Math.PI))*(0.85+Math.random()*0.3),y=Math.pow(Math.random(),0.6)*top;
       if(y<0.3)continue;const zz=z+out*(0.12+Math.random()*0.45*(1-y/top*0.5));const r=0.14+Math.random()*0.16;dm.position.set(x,y,zz);dm.rotation.set(Math.random()*3,Math.random()*3,0);dm.scale.setScalar(r);dm.updateMatrix();
       if(Math.random()<0.62&&nf<n){fi.setMatrixAt(nf,dm.matrix);col.setHSL(0.9+Math.random()*0.05,0.75,0.5+Math.random()*0.12);fi.setColorAt(nf,col);nf++;}
       else if(nl<li.count){dm.scale.multiplyScalar(1.3);dm.updateMatrix();li.setMatrixAt(nl,dm.matrix);nl++;}}
     fi.count=nf;li.count=nl;fi.castShadow=li.castShadow=true;world.add(fi);world.add(li);};
   bougain(-10.3,-7.4,16.95,5.2,-1);bougain(7.8,10.3,16.95,4.2,-1);
   const planter=(x,z)=>{const pl=box(1.0,1.0,1.0,0x3a3d42,{roughness:0.9});pl.position.set(x,0.5,z);world.add(pl);solids.push({x,z,rx:0.6,rz:0.6});
     const soil=box(0.9,0.05,0.9,0x4a3526);soil.position.set(x,1.0,z);world.add(soil);
     const am=mat(0x7fa08a,{roughness:0.8});for(let i=0;i<11;i++){const a=i/11*Math.PI*2+Math.random()*0.3,lean=0.35+Math.random()*0.5,len=0.9+Math.random()*0.5;
       const lg=new T.Mesh(new T.ConeGeometry(0.1,len,4),am);lg.position.set(x+Math.sin(a)*Math.sin(lean)*len*0.45,1.02+Math.cos(lean)*len*0.5,z+Math.cos(a)*Math.sin(lean)*len*0.45);lg.rotation.set(Math.cos(a)*lean,0,-Math.sin(a)*lean);lg.castShadow=true;world.add(lg);}};
   planter(-8.9,15.9);planter(9.3,15.9);
   const pot=(x,z)=>{const pt=new T.Mesh(new T.CylinderGeometry(0.38,0.28,0.6,14),mat(0xc0643c,{roughness:0.9}));pt.position.set(x,0.3,z);pt.castShadow=true;world.add(pt);
     const bush=new T.Mesh(new T.SphereGeometry(0.45,10,8),lf);bush.position.set(x,0.85,z);bush.scale.y=0.75;world.add(bush);
     for(let i=0;i<9;i++){const f=new T.Mesh(new T.SphereGeometry(0.1,6,5),mat(0xe0283a,{roughness:0.7}));const a=Math.random()*6.28,e=Math.random()*1.2;f.position.set(x+Math.cos(a)*Math.cos(e)*0.42,0.85+Math.sin(e)*0.32,z+Math.sin(a)*Math.cos(e)*0.42);world.add(f);}
     solids.push({x,z,rx:0.45,rz:0.45});};
   [[-11.2,15.2],[-11.2,10.4],[15.6,15.6],[22.4,15.6],[12.2,10.6]].forEach(q=>pot(q[0],q[1]));}

  // ===== tall palm cluster (like the brochure) =====
  const palm2=(x,z,s)=>{const t=tree(x,z);t.scale.set(s,s*1.35,s);world.add(t);solids.push({x,z,rx:0.7*s,rz:0.7*s});};
  [[-15,4,1.2],[-18,9,1.35],[-20,15,1.2],[-16,19,1.1],[-22,2,1.25]].forEach(p=>palm2(p[0],p[1],p[2]));
  [[24,4],[20,16],[16,-2]].forEach(p=>{world.add(tree(p[0],p[1]));solids.push({x:p[0],z:p[1],rx:0.7,rz:0.7});});

  // orange trees + oranges
  collectibles=[];
  [[20,12],[26,14]].forEach(p=>{world.add(tree(p[0],p[1]));solids.push({x:p[0],z:p[1],rx:0.7,rz:0.7});});
  [[19,12],[21,13],[25,14],[27,15]].forEach(p=>{const o=new T.Mesh(new T.SphereGeometry(0.35,12,12),mat(0xf08a1c));o.position.set(p[0],1.4,p[1]);o.castShadow=true;world.add(o);collectibles.push({mesh:o,type:'orange',x:p[0],z:p[1]});});
  // shells on the beach
  for(let i=0;i<10;i++){const sx=-70+Math.random()*140,sz=-38+Math.random()*14;const sh=new T.Mesh(new T.SphereGeometry(0.3,8,8),mat(0xfff1dd));sh.scale.y=0.5;sh.position.set(sx,0.15,sz);world.add(sh);collectibles.push({mesh:sh,type:'shell',x:sx,z:sz});}
  // sandcastle on the beach (spot handled in nearest() — toddlers must be awake + daytime)
  buildSandcastle();
  // sunscreen bottle by the sun loungers
  {const sb=new T.Group();const st=box(0.55,0.5,0.55,0xf2efe8,{roughness:0.6});st.position.y=0.25;sb.add(st);
   const btl=cyl(0.12,0.13,0.42,0xffffff,12);btl.position.y=0.71;sb.add(btl);const lab=cyl(0.132,0.132,0.18,0xf29a2e,12);lab.position.y=0.68;sb.add(lab);const cap=cyl(0.08,0.1,0.12,0xff6633,10);cap.position.y=0.98;sb.add(cap);
   sb.position.set(-4,0,9.5);world.add(sb);solids.push({x:-4,z:9.5,rx:0.4,rz:0.4});}
  spots.push({x:-4,z:9.3,r:2.4,id:'sunscreen',label:'apply sunscreen 🧴'});
  // ---- the real coast, neighbourhood and landmarks around La Barrosa (OpenStreetMap) ----
  buildGeoVilla();
  const sailboat=(x,z,s)=>{const gb=boatHull(3.4,1.3,0.7,0xf4f2ec,0x2a4a7a);const mast=cyl(0.05,0.06,4.6,0xe6e2d8,6);mast.position.set(0.2,3.0,0);gb.add(mast);
    const sm=new T.MeshStandardMaterial({color:0xfbfaf4,side:T.DoubleSide,roughness:0.7});
    const ms=new T.Shape();ms.moveTo(0,0);ms.lineTo(0,4.1);ms.lineTo(-1.9,0.1);ms.closePath();const main=new T.Mesh(new T.ShapeGeometry(ms),sm);main.position.set(0.15,0.95,0);main.rotation.y=0.15;gb.add(main);
    const js=new T.Shape();js.moveTo(0,0);js.lineTo(0,3.5);js.lineTo(1.4,0);js.closePath();const jib=new T.Mesh(new T.ShapeGeometry(js),sm);jib.position.set(0.3,0.95,0);jib.rotation.y=-0.2;gb.add(jib);
    gb.position.set(x,0.2,z);gb.scale.setScalar(s||1);return gb;};
  // store sailboats with orbit params {mesh, cx, cz, r, speed, angle}
  world.userData.sailboats=[
    {mesh:sailboat(-30,-72,1.3),cx:-30,cz:-120,r:52,spd:0.018,a:0},
    {mesh:sailboat(28,-80,1.6), cx: 20,cz:-130,r:60,spd:0.013,a:2.1},
    {mesh:sailboat(60,-68,1.1), cx: 55,cz:-110,r:44,spd:0.022,a:4.3}
  ];
  world.userData.sailboats.forEach(function(b){world.add(b.mesh);});
  // a couple of pier posts
  for(let i=0;i<6;i++){const pp=cyl(0.2,0.24,2,0x6e4a2c,6);pp.position.set(-50+i*4,0.6,-46);world.add(pp);}
  // colourful fishing boats pulled up on the left side of the beach
  [[-58,-40,0xe04848],[-48,-43,0x2858a0],[-43,-38,0xe8a820]].forEach(function(p){
    const bg=boatHull(3.6,1.5,0.8,p[2],0xf4efe4);bg.rotation.z=0.12;
    const oar=cyl(0.04,0.04,2.6,0xb08a5a,5);oar.rotation.z=Math.PI/2.3;oar.position.set(0.2,1.0,0.3);bg.add(oar);
    bg.position.set(p[0],0.62,p[1]);bg.rotation.y=(Math.random()-0.5)*0.5+1.4;world.add(bg);});

  spots.push({x:0,z:-42,r:200,id:'sea',label:'paddle in the sea',shore:true});
  // bake the static villa props into shared-material batches (anything animated, toggled or collectible is left alone)
  {const U=world.userData,skip=new Set([U.doorArrow,U.sea,U.car,U.castle,U.saunaDoor,U.bbqFx,U.paellaFx,U.lighthouse&&U.lighthouse.lant,...(U.birds||[]).map(b=>b.mesh),...(U.sailboats||[]).map(b=>b.mesh),...collectibles.map(c=>c.mesh),...(U.lampPosts||[])]);mergeStatic(world,skip);}
}

  // boats: pointed hull lofted from U-shaped sections
// ===================== REAL GEOGRAPHY: Seville around Plaza de España (OpenStreetMap) =====================
// © OpenStreetMap contributors (ODbL). True bearings from the plaza centre, distances compressed (315·ln(1+d/900)).
const GEO_S={"A":1400.0,"B":1070.0,"lm":[["giralda","giralda",-1003.0,-100.8,0.8934,92.91,334],["torreoro","torreoro",-866.3,361.1,0.9185,33.8,305],["torresevilla","skyscraper",-1617.9,606.8,0.663,119.67,307],["setas","setas",-1332.7,-446.5,0.7597,19.75,347],["schindler","schindler",-1664.2,365.1,0.6699,43.54,316],["cathedral","cathedral",-999.6,-34.5,0.8962,37.64,330],["alcazar","alcazar",-819.9,-88.9,0.9607,15.37,334],["tabacos","block",-521.7,68.2,1.0779,17.25,321]],"fp":{"cathedral":[-1036.4,-115.0,-1031.2,-111.4,-1011.4,-98.4,-1010.0,-97.4,-1005.8,-108.5,-998.5,-103.7,-998.0,-103.4,-1000.1,-97.3,-995.5,-94.4,-992.9,-92.5,-991.4,-96.5,-990.0,-98.3,-988.3,-98.7,-986.4,-97.5,-984.8,-96.4,-984.2,-96.0,-982.9,-97.5,-981.2,-98.5,-979.4,-98.7,-977.5,-98.1,-975.3,-96.3,-974.3,-94.6,-973.7,-93.1,-973.6,-91.5,-973.5,-88.9,-972.8,-88.5,-971.3,-87.5,-970.2,-86.7,-969.3,-85.8,-968.7,-84.2,-969.0,-82.2,-970.4,-77.8,-967.8,-76.0,-965.1,-74.2,-961.6,-83.8,-942.9,-71.0,-941.3,-65.4,-955.9,-26.1,-967.5,-34.5,-967.5,-33.6,-967.9,-32.8,-968.4,-32.3,-968.9,-32.1,-969.5,-32.4,-971.3,-27.6,-973.2,-22.8,-972.7,-22.3,-972.3,-21.5,-972.3,-20.6,-972.5,-19.7,-972.1,-17.6,-968.6,-15.6,-961.3,-11.4,-974.0,23.8,-977.8,25.6,-987.3,18.9,-991.0,29.0,-994.8,26.2,-995.5,28.4,-1000.9,24.3,-1000.6,23.7,-1001.4,23.0,-1001.2,22.2,-1001.4,19.8,-1002.3,19.3,-1003.1,18.7,-1003.4,19.5,-1004.5,19.9,-1004.9,20.8,-1005.7,20.1,-1006.0,21.0,-1006.5,20.5,-1007.0,21.5,-1012.2,17.9,-1012.8,19.6,-1014.9,18.1,-1014.0,15.9,-1017.7,13.4,-1021.3,10.9,-1022.1,13.0,-1024.2,11.5,-1023.6,9.9,-1028.8,6.3,-1028.4,5.1,-1028.9,4.7,-1028.5,3.8,-1029.3,3.2,-1028.9,2.5,-1029.4,2.0,-1029.7,1.5,-1029.3,0.5,-1030.1,-0.1,-1030.9,-0.6,-1031.3,0.2,-1031.8,0.3,-1032.2,0.0,-1032.6,1.0,-1033.5,0.3,-1033.9,1.0,-1038.8,-2.5,-1070.5,-24.7,-1064.5,-41.0,-1054.7,-67.1,-1053.4,-70.6,-1052.1,-74.0],"setas":[-1362.1,-431.2,-1362.8,-433.7,-1363.0,-436.0,-1362.9,-438.6,-1362.2,-441.3,-1361.2,-443.7,-1359.5,-446.5,-1357.5,-448.6,-1356.0,-449.5,-1355.6,-449.8,-1353.9,-450.2,-1351.1,-450.2,-1348.9,-450.8,-1347.0,-452.4,-1345.4,-454.9,-1344.6,-457.2,-1344.7,-459.1,-1344.8,-460.8,-1345.3,-461.7,-1346.3,-463.0,-1346.4,-463.2,-1348.1,-464.6,-1350.1,-465.4,-1350.5,-465.7,-1351.2,-466.4,-1352.1,-467.4,-1352.6,-468.9,-1352.9,-470.5,-1352.9,-472.4,-1352.7,-474.5,-1352.0,-477.0,-1350.8,-479.9,-1349.3,-482.0,-1347.7,-483.5,-1346.5,-484.5,-1344.3,-485.8,-1341.7,-486.4,-1340.0,-485.7,-1338.7,-484.3,-1337.8,-482.6,-1337.2,-480.5,-1336.7,-478.0,-1335.8,-475.8,-1334.6,-474.7,-1332.9,-473.9,-1330.8,-474.0,-1329.5,-474.0,-1326.4,-473.1,-1325.1,-472.2,-1324.0,-471.5,-1322.7,-469.4,-1322.5,-465.3,-1322.3,-462.6,-1323.4,-458.7,-1323.5,-457.6,-1323.4,-457.0,-1323.0,-456.7,-1322.6,-456.5,-1321.2,-456.8,-1319.9,-456.2,-1318.7,-454.2,-1318.1,-453.9,-1317.6,-454.1,-1317.1,-454.3,-1314.3,-455.7,-1312.0,-455.8,-1310.2,-454.6,-1308.7,-452.6,-1307.8,-449.3,-1307.9,-445.4,-1307.5,-441.0,-1306.0,-436.9,-1302.4,-434.6,-1298.2,-433.2,-1294.8,-430.5,-1293.6,-427.4,-1293.3,-423.7,-1294.1,-419.8,-1295.0,-417.8,-1295.9,-415.8,-1296.6,-414.8,-1299.0,-411.8,-1302.8,-409.6,-1306.4,-410.3,-1309.2,-413.1,-1310.7,-417.9,-1310.7,-423.9,-1311.2,-427.3,-1311.9,-429.9,-1313.2,-432.5,-1315.4,-434.5,-1317.8,-435.3,-1318.9,-435.1,-1320.5,-434.9,-1320.8,-434.8,-1322.3,-434.7,-1322.6,-434.3,-1323.7,-433.4,-1324.8,-431.8,-1325.6,-430.4,-1328.1,-426.0,-1331.0,-421.8,-1333.5,-419.2,-1335.8,-418.4,-1338.0,-417.8,-1339.8,-417.7,-1340.6,-418.1,-1341.9,-418.9,-1343.6,-420.3,-1344.1,-420.9,-1345.1,-422.1,-1346.0,-424.2,-1346.1,-425.5,-1346.4,-428.3,-1347.6,-431.1,-1348.8,-431.6,-1349.3,-431.9,-1350.6,-431.4,-1353.1,-429.6,-1354.7,-428.4,-1357.8,-427.7,-1360.4,-428.9],"torresevilla":[-1619.1,595.7,-1621.0,596.7,-1622.7,598.3,-1623.9,600.2,-1624.8,602.5,-1625.3,605.1,-1625.4,608.0,-1624.9,610.7,-1623.7,613.5,-1622.3,615.5,-1620.7,616.9,-1619.1,617.6,-1617.3,617.8,-1615.6,617.5,-1613.6,616.5,-1612.0,614.9,-1610.8,613.1,-1609.8,610.8,-1609.4,607.4,-1609.5,603.9,-1610.6,600.6,-1612.4,597.7,-1614.5,596.1,-1616.8,595.4],"alcazar":[-767.5,99.6,-773.7,90.3,-785.2,72.6,-784.4,71.7,-790.0,62.9,-788.4,60.1,-791.1,57.3,-790.0,55.1,-788.4,56.4,-787.0,53.0,-779.7,39.7,-778.9,40.4,-776.4,35.4,-770.0,22.6,-772.4,20.1,-772.9,16.9,-773.3,14.6,-785.6,16.7,-800.4,19.3,-801.6,19.5,-804.4,19.5,-812.1,19.3,-828.0,18.6,-827.9,12.1,-829.1,12.1,-829.0,-6.3,-828.7,-16.3,-836.1,-16.8,-840.6,-17.5,-840.6,-16.1,-854.3,-16.3,-854.3,-17.2,-860.0,-17.6,-861.3,-17.7,-860.7,-31.9,-874.2,-31.9,-875.7,-31.8,-875.7,-29.6,-885.4,-29.8,-888.6,-29.9,-888.3,-33.6,-887.1,-33.6,-887.0,-39.3,-886.9,-45.0,-888.2,-44.9,-888.4,-47.9,-888.5,-49.7,-885.5,-50.3,-876.2,-52.0,-865.2,-54.1,-860.1,-54.9,-858.1,-55.3,-854.1,-56.0,-854.4,-59.2,-854.7,-63.8,-854.9,-66.6,-855.3,-66.9,-855.8,-74.9,-856.2,-81.1,-854.8,-81.2,-855.2,-89.1,-854.0,-89.4,-855.0,-97.7,-854.9,-102.1,-855.5,-102.2,-855.4,-104.9,-855.2,-107.6,-854.7,-107.6,-854.9,-112.0,-852.8,-139.5,-852.7,-140.9,-852.4,-144.7,-848.6,-143.4,-845.1,-142.1,-839.8,-140.3,-838.7,-144.2,-837.1,-143.6,-835.9,-143.2,-836.9,-139.4,-834.2,-138.3,-833.4,-141.2,-830.2,-140.3,-830.6,-139.7,-830.9,-138.0,-830.2,-137.8,-829.5,-137.8,-827.0,-137.6,-816.1,-136.4,-815.8,-139.4,-813.0,-139.3,-813.0,-139.8,-812.5,-139.8,-812.9,-135.7,-807.3,-136.0,-790.0,-136.3,-790.0,-140.8,-789.8,-144.3,-790.8,-156.3,-791.5,-164.9,-791.6,-167.4,-791.8,-170.0,-792.8,-170.0,-792.5,-173.9,-791.8,-195.7,-790.9,-210.2,-790.0,-217.6,-789.1,-224.3,-784.3,-251.4,-783.6,-255.5,-781.3,-294.9,-781.0,-299.4,-776.4,-300.0,-776.1,-300.1,-775.9,-300.1,-731.2,-313.2,-712.4,-318.2,-698.9,-322.2,-692.3,-324.6,-690.7,-321.5,-578.4,-101.4,-576.4,-97.4],"torreoro":[-861.7,366.0,-860.6,362.9,-861.2,359.2,-863.1,355.9,-865.9,353.9,-868.8,353.7,-871.1,355.4,-872.1,358.5,-871.6,362.2,-869.7,365.5,-866.9,367.5,-864.0,367.7],"schindler":[-1658.9,374.4,-1664.6,376.8,-1665.7,372.2,-1664.0,371.5,-1664.5,369.3,-1665.0,367.3,-1665.4,365.6,-1666.4,365.8,-1667.0,363.1,-1667.4,361.0,-1667.5,359.6,-1667.4,358.1,-1667.2,356.9,-1667.0,356.2,-1666.8,355.8,-1666.5,356.0,-1666.2,356.2,-1665.8,356.7,-1664.8,358.0,-1663.8,359.9,-1663.1,362.2,-1662.5,364.9,-1663.4,365.2,-1663.1,366.4,-1662.8,367.5,-1662.0,370.7,-1661.0,370.4,-1660.0,370.1,-1659.3,372.8]},"b":"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","green":[[1,563.9,220.4,417.4,98.4,387.1,127.4,376.5,156.1,366.6,165.1,345.4,171.2,325.6,163.5,314.1,144.0,216.6,136.2,207.8,145.6,185.3,145.4,190.7,108.9,-211.7,65.2,-213.9,102.1,-280.2,94.7,-317.2,83.9,-336.6,120.9,-105.0,436.1,-78.1,428.6,-47.3,434.6,-23.7,454.4,-16.9,475.6,216.4,490.6,227.2,480.3,252.0,467.6,263.4,467.9,288.7,492.3,566.9,492.4,572.3,466.6,583.7,462.5,594.6,451.3,601.1,431.2,625.1,431.8,631.0,398.3,641.3,398.9,645.7,394.4,649.6,366.7,643.9,364.4,646.4,345.4,620.1,331.2,649.4,271.1],[0,-87.7,-210.8,-210.2,-351.9,-446.2,-145.4,-449.6,-134.8,-383.1,-41.8,-347.9,-75.0,-307.5,-21.0],[0,-587.8,-119.4,-692.3,-324.6,-776.4,-300.0,-772.8,-323.6,-763.8,-344.3,-766.5,-343.8,-763.6,-385.1,-760.1,-385.8,-760.0,-389.8,-763.0,-389.2,-762.8,-427.9,-714.2,-468.5,-550.0,-149.5],[0,-563.3,1330.4,-407.2,1347.0,-396.9,1345.6,-388.8,1342.5,-261.5,1249.9,-288.2,1231.4,-324.7,1211.3,-333.2,1216.1,-341.2,1213.8,-345.9,1216.3,-365.0,1209.8,-365.5,1197.2,-378.7,1194.6,-392.8,1198.5,-416.2,1198.1,-434.1,1188.3,-584.5,1169.9,-595.4,1177.0,-596.4,1181.0],[0,406.0,647.2,409.0,642.4,447.1,655.6,471.5,658.1,490.6,643.6,510.4,636.5,535.2,617.7,576.3,600.6,581.9,596.5,612.8,548.1,617.0,539.0,617.0,525.7,612.9,522.6,554.2,522.3,291.8,523.7,286.7,531.4,268.4,538.5,240.8,539.6,218.5,529.9,200.4,529.9,194.9,523.7,114.9,519.6,74.7,518.3,41.7,528.1,39.6,540.7,84.2,554.9,81.0,561.5,363.0,639.6,365.5,635.2],[0,-260.1,-895.2,-180.0,-955.6,-119.6,-922.8,-146.1,-897.0,-86.3,-865.5,-68.5,-866.7,-67.8,-832.5,-76.4,-832.4,-96.0,-824.0,-112.9,-829.1,-125.7,-816.0,-262.2,-888.7],[0,-180.7,-1119.4,-155.2,-1092.0,-69.4,-1134.5,-119.1,-1165.4],[0,570.7,-1030.0,614.2,-1024.9,655.5,-1048.0,684.8,-1017.5,594.6,-964.1,586.8,-968.2],[0,536.3,-572.3,547.4,-645.3,582.0,-631.2,680.9,-523.7,675.4,-512.4,559.8,-559.8,560.3,-562.6],[0,-718.6,-1157.3,-718.6,-1166.3,-648.4,-1196.6,-638.5,-1191.4,-634.7,-1199.6,-579.4,-1163.0,-557.2,-1140.0,-565.3,-1135.8,-607.3,-1140.0],[0,-690.2,-1141.4,-704.9,-1066.7,-733.7,-1055.8,-738.1,-1108.2,-729.3,-1111.0,-722.5,-1146.4],[0,-758.1,221.4,-748.4,222.4,-658.8,342.7,-659.9,353.7,-736.9,343.4,-744.8,338.0,-748.0,330.8],[0,-490.8,-898.5,-451.4,-938.1,-479.4,-969.5,-505.7,-951.7,-534.7,-922.8],[0,-567.0,-1004.1,-610.9,-1029.3,-623.5,-1029.1,-621.6,-1042.6,-628.8,-1046.9,-623.0,-1080.7,-599.0,-1128.1,-534.6,-1115.8,-473.1,-1052.6,-529.5,-1013.8,-546.8,-1019.1,-553.2,-1012.9,-555.7,-1015.3],[0,-545.7,346.6,-589.6,284.1,-591.8,286.4,-623.7,248.2,-568.3,267.6,-549.7,260.8,-532.3,244.4,-521.8,246.3,-381.8,415.0,-381.7,419.4,-515.0,389.5,-516.4,395.6,-583.9,382.0],[0,-874.5,-902.3,-854.4,-895.5,-842.2,-904.5,-850.8,-923.4,-873.9,-908.2],[0,206.2,-57.8,224.5,-16.3,228.6,55.4,252.0,57.4,274.7,38.7,299.6,41.9,300.0,51.5,316.3,47.1,340.0,23.7,248.4,-86.3],[0,-453.6,938.8,-428.7,941.5,-418.5,925.9,-460.3,902.2],[0,-826.7,-69.8,-802.5,-73.7,-803.7,-105.5,-828.6,-102.0],[0,-859.9,3.6,-836.1,4.8,-836.1,-16.8,-860.0,-17.6],[0,-919.3,67.2,-911.9,64.2,-909.7,45.3,-958.2,39.5],[0,-943.9,318.1,-938.4,248.5,-967.6,238.8,-969.3,274.8,-963.7,277.2,-963.9,281.1,-970.5,283.1,-962.8,320.1],[0,-485.0,27.1,-442.3,86.2,-494.2,137.0,-488.0,145.1,-428.2,80.5,-473.3,14.8],[0,698.9,486.2,781.0,484.7,790.9,371.3,788.2,367.0,747.0,352.6,697.0,479.4],[0,-668.6,112.8,-657.8,101.6,-627.9,144.6,-638.7,155.6],[0,-595.4,7.5,-603.7,-4.8,-557.9,-51.1,-554.2,-45.6,-558.5,-41.2,-553.9,-34.4],[0,-628.4,169.6,-582.2,228.9,-571.6,225.7,-524.1,179.8,-530.1,172.7,-575.5,216.7,-617.7,158.7],[0,-619.1,33.3,-657.6,73.0,-662.2,66.2,-678.4,83.0,-669.4,96.5,-673.3,100.6,-687.9,82.1,-628.0,20.0],[0,-526.2,-32.2,-497.4,10.4,-485.2,-1.4,-514.0,-44.0],[0,-612.5,-504.9,-641.7,-570.1,-634.4,-575.0,-621.4,-544.8,-601.9,-557.6,-586.5,-522.4],[0,-215.8,-57.6,-226.6,-12.3,-234.1,62.4,-293.5,53.8,-315.7,56.0,-320.2,36.3],[0,-403.4,126.2,-394.2,149.3,-405.6,165.6,-415.0,162.6,-429.8,170.2,-429.1,203.6,-436.3,210.3,-433.7,229.3,-427.8,236.7,-416.3,239.7,-359.5,320.0,-418.1,346.4,-509.7,232.5,-509.6,223.9,-423.0,140.9,-412.7,124.5],[0,162.0,-302.2,138.4,-290.9,138.6,-277.5,150.1,-285.0,156.7,-276.7,182.5,-290.1,203.2,-267.3,228.4,-279.5,223.2,-284.9,207.2,-273.4,191.7,-292.4,171.4,-294.2],[0,135.9,334.1,129.3,308.9,134.0,302.6,168.9,307.2,181.3,317.0,181.1,325.8,169.8,344.1],[0,-88.4,296.9,-83.6,247.0,-67.8,249.1,-73.0,298.9],[0,-1260.2,401.7,-1221.5,395.6,-1225.2,379.1,-1264.9,384.7],[0,-193.3,704.2,-194.5,689.8,-179.1,663.2,-152.9,652.5,-139.3,652.6,-135.3,638.9,-184.6,627.0,-262.4,711.3,-259.2,717.1],[0,-275.0,746.8,-214.0,785.6,-179.3,736.6,-188.0,720.9,-224.5,733.9,-272.0,738.8,-276.0,740.8],[0,220.0,624.9,220.4,611.8,297.7,631.5,292.0,642.4,268.8,633.3],[0,499.3,728.1,505.7,684.1,511.8,682.7,532.6,691.3,508.4,726.4],[0,20.2,543.1,-19.0,521.0,-40.2,514.0,-64.2,521.8,-69.7,539.5,-49.1,544.9],[0,498.1,753.9,541.4,693.1,572.4,705.6,574.6,721.8,548.5,755.4,564.2,763.6,589.0,733.5,630.5,755.2,592.3,803.0,573.8,794.5,564.9,781.1],[0,-801.0,11.0,-781.4,5.0,-784.9,-16.9,-801.7,-11.8],[0,-236.6,-1021.0,-220.6,-1031.8,-175.9,-996.3,-192.3,-985.4],[0,-756.7,324.1,-763.4,252.5,-770.1,252.0,-763.4,323.5],[0,252.5,-1106.0,250.2,-1107.6,206.0,-1076.9,214.6,-1070.3],[0,-888.2,512.1,-892.2,491.2,-886.1,488.8,-977.7,480.8,-977.3,484.1,-966.8,490.1,-963.0,502.9],[0,-71.3,710.3,-75.5,682.5,-101.4,655.5,146.3,759.2,93.5,825.4,83.4,802.8,58.7,773.6,16.5,744.4,-59.6,712.1],[0,-1209.6,389.9,-1210.5,385.5,-1181.5,382.8,-1183.2,375.5,-1148.5,371.8,-1144.0,392.0,-1159.6,393.6,-1165.6,378.7,-1180.0,387.0],[0,-750.9,154.6,-750.6,145.3,-707.7,100.9,-700.5,102.6,-711.5,128.7,-735.2,152.7],[0,-935.6,-130.4,-937.3,-155.8,-916.3,-154.1,-917.0,-138.5,-919.0,-144.7,-925.6,-141.4,-924.7,-136.1],[0,866.3,181.5,877.3,156.0,871.1,152.0,873.8,145.9,891.6,157.5,881.9,180.1,874.7,175.5,870.8,184.4],[0,920.5,137.5,917.7,135.8,895.0,60.1,933.7,92.2],[0,213.3,885.9,203.9,896.5,278.1,929.2,272.5,920.3,322.6,890.7,300.2,864.9,255.4,845.5,244.0,859.0,238.5,856.6,231.0,865.3,285.0,888.7,267.2,909.2],[0,749.2,-72.9,774.1,-55.3,780.9,-71.7,775.8,-74.1,765.4,-69.9,758.5,-81.2,761.9,-90.0,768.6,-90.2,772.1,-100.0,761.2,-108.3],[0,788.7,-201.5,791.5,-200.0,802.4,-237.2,816.2,-237.5,819.6,-229.6,827.2,-224.3,824.1,-210.2,827.9,-206.9,837.7,-205.5,838.0,-214.0,841.6,-212.4,843.5,-192.3,850.5,-189.2,856.2,-214.7,802.3,-249.1],[0,220.7,-387.7,238.9,-384.3,281.7,-334.7,268.5,-323.3,279.6,-310.3,270.9,-303.9,220.2,-362.7],[0,1280.4,-124.4,1287.2,-165.8,1270.0,-173.3,1262.8,-132.5],[0,-181.6,-592.1,-130.4,-607.3,-104.4,-623.6,-86.3,-643.9,-74.0,-645.7,-102.4,-607.0,-81.1,-576.1,-113.9,-574.4,-149.4,-578.4,-178.8,-583.9],[0,321.3,-814.2,356.4,-834.6,347.9,-843.7,312.2,-823.0],[0,-723.2,-138.0,-763.8,-133.5,-765.1,-52.1,-729.2,-54.8],[0,-779.4,-131.5,-763.8,-133.5,-766.4,-69.6,-780.9,-68.3,-783.0,-114.7],[0,-777.2,3.7,-757.0,-3.4,-760.7,-24.9,-781.4,-18.0],[0,553.9,169.7,578.3,131.2,595.1,145.3,572.1,179.6],[0,1071.0,-545.2,1042.3,-641.4,1052.5,-642.5,1113.7,-561.2,1106.5,-552.7,1074.5,-542.3],[0,155.5,1300.7,184.8,1316.9,238.1,1261.3,221.2,1252.5],[0,-1018.0,-657.9,-998.3,-670.0,-999.3,-653.9,-990.9,-656.0,-996.1,-650.0,-994.5,-645.2,-1012.8,-633.7,-1013.4,-641.1,-1008.7,-643.6,-1009.5,-649.7,-1017.2,-646.9],[0,243.1,1238.0,258.0,1246.8,285.8,1225.1,274.1,1216.7]],"water":[[-2206.4,-1187.8,-2204.4,-1189.5,-2202.5,-1190.9,-2166.4,-1214.8,-2164.8,-1215.7,-2163.3,-1216.4,-2135.4,-1228.7,-2133.9,-1229.3,-2132.4,-1229.6,-2103.5,-1235.3,-2102.3,-1235.4,-2101.1,-1235.4,-2074.3,-1234.1,-2072.3,-1233.7,-2038.5,-1222.6,-2037.2,-1222.0,-2036.1,-1221.2,-1990.1,-1179.9,-1988.7,-1178.2,-1966.7,-1143.4,-1965.7,-1141.5,-1905.9,-984.1,-1905.4,-982.6,-1905.1,-981.0,-1889.1,-895.9,-1888.8,-893.8,-1849.4,-574.3,-1849.3,-573.1,-1728.8,101.4,-1703.3,178.1,-1663.7,268.5,-1613.1,342.1,-1572.6,388.1,-1508.8,442.7,-1458.0,462.6,-1422.6,466.8,-1026.2,392.2,-1023.4,391.8,-1020.4,391.8,-768.8,402.7,-765.0,403.1,-462.7,445.1,-455.4,446.5,-279.7,488.2,-274.5,489.5,-269.3,491.2,-62.9,561.1,-55.8,563.6,200.1,661.4,203.2,662.5,530.4,795.2,533.8,796.7,1278.0,1194.3,1231.1,1252.5,469.9,872.9,143.5,745.2,-102.3,651.3,-292.9,586.9,-455.8,548.3,-752.1,503.8,-1000.9,486.6,-1402.1,547.7,-1404.7,547.9,-1407.4,547.7,-1448.4,541.8,-1451.0,541.3,-1453.5,540.4,-1511.2,516.8,-1513.9,515.6,-1516.5,513.9,-1519.1,511.9,-1588.6,452.4,-1590.3,450.7,-1592.0,448.9,-1635.6,399.6,-1638.3,396.1,-1692.5,317.8,-1694.6,314.3,-1696.5,310.5,-1738.6,215.6,-1740.0,211.9,-1766.6,132.7,-1767.6,129.2,-1889.5,-539.7,-1929.1,-857.6,-1944.4,-940.6,-2002.4,-1097.8,-2022.9,-1131.5,-2066.3,-1172.5,-2097.4,-1183.6,-2121.8,-1185.2,-2147.9,-1180.4,-2172.7,-1169.7,-2205.2,-1148.2,-2309.4,-1047.3,-2312.5,-1085.6],[-2622.2,-823.8,-2621.2,-822.1,-2307.0,-183.0,-2306.8,-182.5,-2099.7,207.7,-2099.4,208.4,-1678.3,862.3,-1677.8,862.9,-984.6,1590.2,-797.6,1724.4,22.6,2078.4,301.1,2152.6,304.2,2153.4,693.1,2261.7,881.0,2286.8,1170.1,2260.6,1490.4,2188.8,1493.8,2188.1,1497.0,2187.7,1604.1,2180.4,1606.9,2180.4,1609.3,2180.7,1686.0,2196.7,1687.7,2197.2,1689.2,2197.9,1737.0,2228.0,1685.9,2272.9,1638.2,2244.6,1564.4,2230.1,1462.6,2237.1,1145.0,2306.7,1140.8,2307.3,846.3,2332.6,843.3,2332.7,840.3,2332.7,837.6,2332.4,643.2,2306.0,639.3,2305.2,249.2,2195.9,-26.0,2121.2,-27.9,2120.6,-836.9,1767.2,-840.3,1765.2,-843.6,1763.0,-1030.7,1627.8,-1033.6,1625.5,-1711.8,914.8,-2130.2,271.9,-2338.0,-117.8,-2652.2,-763.8,-2703.5,-843.7,-2674.3,-902.5]]};
const sevWinTex=(()=>{const cv=document.createElement('canvas');cv.width=64;cv.height=64;const c=cv.getContext('2d');c.fillStyle='#ffffff';c.fillRect(0,0,64,64);_speck(c,64,250,16,1);
  for(let y=0;y<2;y++)for(let x=0;x<2;x++){c.fillStyle='#3d4148';c.fillRect(8+x*32,6+y*32,14,18);c.fillStyle='#6b5a3e';c.fillRect(6+x*32,24+y*32,18,3);c.fillStyle='#2f5a3a';c.fillRect(5+x*32,6+y*32,3,18);c.fillRect(22+x*32,6+y*32,3,18);}
  const t=new T.CanvasTexture(cv);t.wrapS=t.wrapT=T.RepeatWrapping;t.encoding=T.sRGBEncoding;return t;})();
function pip(x,z,f){let inside=false;for(let i=0,j=f.length-2;i<f.length;j=i,i+=2){const xi=f[i],zi=f[i+1],xj=f[j],zj=f[j+1];if(((zi>z)!==(zj>z))&&(x<(xj-xi)*(z-zi)/(zj-zi)+xi))inside=!inside;}return inside;}
function buildGeoSev(){
  const G=GEO_S,col=new T.Color(),dm=new T.Object3D();
  const sAt=u=>{u=Math.max(20,u);return u/(G.B*(Math.exp(u/G.A)-1));},rMap=G.A*Math.log(1+1300/G.B);
  const inPlaza=(x,z)=>(x/((PLZ.fa+PLZ.depth)*PLZ.s+14))**2+(z/((PLZ.fb+PLZ.depth)*PLZ.s+14))**2<1;
  // ground: warm city paving out to the horizon, park lawns, the river
  const gd=groundDetail.clone();gd.needsUpdate=true;gd.repeat.set(500,500);
  const city=new T.Mesh(new T.CircleGeometry(3400,72),new T.MeshStandardMaterial({color:0xcbbd9f,map:gd,roughness:0.95}));city.rotation.x=-Math.PI/2;city.position.y=-0.06;city.receiveShadow=true;plaza.add(city);
  const lawnM=new T.MeshStandardMaterial({color:0x7c9a4e,roughness:1}),lawn2=new T.MeshStandardMaterial({color:0x8aa65a,roughness:1});
  G.green.forEach(g=>{const m=new T.Mesh(new T.ShapeGeometry(flatShape(g.slice(1))).rotateX(-Math.PI/2),g[0]?lawnM:lawn2);m.position.y=-0.03+(g[0]?0:0.005);m.receiveShadow=true;plaza.add(m);});
  const riverM=new T.MeshStandardMaterial({color:0x3f6f78,roughness:0.08,metalness:0.5,normalMap:(()=>{const t=rippleN.clone();t.needsUpdate=true;t.repeat.set(0.08,0.08);return t;})(),normalScale:new T.Vector2(0.3,0.3)});
  G.water.forEach(w=>{const m=new T.Mesh(new T.ShapeGeometry(flatShape(w)).rotateX(-Math.PI/2),riverM);m.position.y=0.0;plaza.add(m);});
  const inWater=(x,z)=>G.water.some(w=>pip(x,z,w)),inPark=(x,z)=>G.green.some(g=>g[0]&&pip(x,z,g.slice(1)));
  // ---- ~2,700 real building footprints, extruded and merged (one draw call per style) ----
  const b=b64u8(G.b),dv=new DataView(b.buffer);const bins=[{P:[],N:[],U:[],C:[],I:[]},{P:[],N:[],U:[],C:[],I:[]}];
  const PAL=[0xf6f1e6,0xf3e7c9,0xeed49a,0xf1e2b8,0xe9c79a,0xf4efe6,0xd9a56f,0xefe3d0,0xe6bfa8];
  let o=0,bi=0;
  while(o<b.length){const n=b[o],h=b[o+1]/10,kind=b[o+2];o+=3;const pts=[];for(let k=0;k<n;k++){pts.push([dv.getInt16(o,true)/10,dv.getInt16(o+2,true)/10]);o+=4;}bi++;
    const B=bins[kind===1?1:0];let base=B.P.length/3;col.setHex(kind===1?0xe8dcc0:PAL[(bi*7)%PAL.length]);
    const roofC=new T.Color(kind===2?0xb4643c:(bi%4===0?0xb86a44:0xd8cfbf));
    // walls
    let area=0;for(let k=0;k<n;k++){const a=pts[k],c=pts[(k+1)%n];area+=a[0]*c[1]-c[0]*a[1];}
    if(area<0)pts.reverse();let u0=0;
    for(let k=0;k<n;k++){const a=pts[k],c=pts[(k+1)%n];const dx=c[0]-a[0],dz=c[1]-a[1],L=Math.hypot(dx,dz)||1,nx=dz/L,nz=-dx/L;
      const v=B.P.length/3;B.P.push(a[0],0,a[1],c[0],0,c[1],c[0],h,c[1],a[0],h,a[1]);for(let q=0;q<4;q++){B.N.push(nx,0,nz);B.C.push(col.r,col.g,col.b);}
      B.U.push(u0/2.2,0,(u0+L)/2.2,0,(u0+L)/2.2,h/2.2,u0/2.2,h/2.2);u0+=L;B.I.push(v,v+1,v+2,v,v+2,v+3);}
    // flat roof (azotea)
    const tri=T.ShapeUtils.triangulateShape(pts.map(p=>new T.Vector2(p[0],p[1])),[]);const rv=B.P.length/3;
    pts.forEach(p=>{B.P.push(p[0],h,p[1]);B.N.push(0,1,0);B.U.push(0.02,0.02);B.C.push(roofC.r,roofC.g,roofC.b);});
    tri.forEach(t=>B.I.push(rv+t[0],rv+t[2],rv+t[1]));}
  bins.forEach((B,k)=>{if(!B.P.length)return;const g=new T.BufferGeometry();g.setAttribute('position',new T.Float32BufferAttribute(B.P,3));g.setAttribute('normal',new T.Float32BufferAttribute(B.N,3));
    g.setAttribute('uv',new T.Float32BufferAttribute(B.U,2));g.setAttribute('color',new T.Float32BufferAttribute(B.C,3));g.setIndex(B.I);
    const m=new T.Mesh(g,new T.MeshStandardMaterial({vertexColors:true,map:sevWinTex,roughness:0.9,side:T.DoubleSide}));m.castShadow=true;m.receiveShadow=true;plaza.add(m);});
  // ---- generic city beyond the mapped radius so the skyline never ends ----
  const fill=[];for(let i=0;i<1400;i++){const a=Math.random()*Math.PI*2,r=rMap+Math.pow(Math.random(),0.8)*1100,x=Math.sin(a)*r,z=-Math.cos(a)*r;if(inWater(x,z)||inPark(x,z))continue;fill.push({x,z,s:r});}
  {const im=new T.InstancedMesh(new T.BoxGeometry(1,1,1).translate(0,0.5,0),new T.MeshStandardMaterial({map:sevWinTex,roughness:0.9}),fill.length);im.frustumCulled=false;
   fill.forEach((f,i)=>{const sc=sAt(f.s);dm.position.set(f.x,0,f.z);dm.rotation.set(0,Math.random()*Math.PI,0);dm.scale.set((20+Math.random()*40)*sc,(12+Math.random()*16)*sc,(20+Math.random()*40)*sc);dm.updateMatrix();im.setMatrixAt(i,dm.matrix);col.setHex(PAL[i%PAL.length]);im.setColorAt(i,col);});plaza.add(im);}
  // ---- park trees: palms, jacarandas, orange trees in María Luisa and the gardens ----
  {const palms=[],broad=[];G.green.forEach(g=>{const f=g.slice(1);let mnx=1e9,mxx=-1e9,mnz=1e9,mxz=-1e9;for(let i=0;i<f.length;i+=2){mnx=Math.min(mnx,f[i]);mxx=Math.max(mxx,f[i]);mnz=Math.min(mnz,f[i+1]);mxz=Math.max(mxz,f[i+1]);}
      const area=(mxx-mnx)*(mxz-mnz),n=Math.min(g[0]?1400:80,Math.round(area/(g[0]?110:260)));
      for(let k=0;k<n;k++){const x=mnx+Math.random()*(mxx-mnx),z=mnz+Math.random()*(mxz-mnz);if(!pip(x,z,f))continue;if(inPlaza(x,z))continue;(Math.random()<0.25?palms:broad).push({x,z,s:sAt(Math.hypot(x,z))});}});
   const tk=new T.InstancedMesh(new T.CylinderGeometry(0.12,0.18,1,5).translate(0,0.5,0),mat(0x7a5c3e,{roughness:1}),broad.length+palms.length),cr=new T.InstancedMesh(new T.IcosahedronGeometry(1,1),new T.MeshStandardMaterial({color:0xffffff,roughness:0.95}),broad.length);
   const fr=new T.InstancedMesh(frondGeo,frondMat,palms.length*7);[tk,cr,fr].forEach(m=>{m.frustumCulled=false;m.castShadow=true;plaza.add(m);});let ti=0,fi=0;
   broad.forEach((t,i)=>{const h=(9+Math.random()*7)*t.s,w=(4+Math.random()*3)*t.s;dm.rotation.set(0,Math.random()*6,0);dm.position.set(t.x,0,t.z);dm.scale.set(w*0.35,h*0.55,w*0.35);dm.updateMatrix();tk.setMatrixAt(ti++,dm.matrix);
     dm.position.set(t.x,h*0.7,t.z);dm.scale.set(w,w*0.8,w);dm.updateMatrix();cr.setMatrixAt(i,dm.matrix);const jac=Math.random()<0.18;col.setHSL(jac?0.72:0.25+Math.random()*0.06,jac?0.45:0.4,jac?0.55:0.24+Math.random()*0.08);cr.setColorAt(i,col);});
   palms.forEach(t=>{const h=(12+Math.random()*6)*t.s;dm.rotation.set(0,0,0);dm.position.set(t.x,0,t.z);dm.scale.set(t.s*2.2,h,t.s*2.2);dm.updateMatrix();tk.setMatrixAt(ti++,dm.matrix);
     for(let k=0;k<7;k++){dm.position.set(t.x,h,t.z);dm.rotation.set(-0.35+Math.random()*0.3,k/7*Math.PI*2,0);dm.scale.setScalar(t.s*1.3);dm.updateMatrix();fr.setMatrixAt(fi++,dm.matrix);}});}
  // ---- landmarks on their true bearings ----
  const L={};G.lm.forEach(l=>L[l[0]]=l);
  const brickDark=mat(0xc07a4e,{roughness:0.9}),stoneW=mat(0xd9c6a0,{roughness:0.95}),stoneC=mat(0xcdb892,{roughness:0.95});
  // Giralda: Almohad brick shaft + Renaissance belfry + Giraldillo
  {const l=L.giralda,[,,x,z,,H]=l,w=H*0.135,g=new T.Group();g.position.set(x,0,z);g.rotation.y=Math.atan2(x,z)+Math.PI;plaza.add(g);
   const sh=new T.Mesh(new T.BoxGeometry(w,H*0.67,w),new T.MeshStandardMaterial({map:(()=>{const t=brickT.clone();t.needsUpdate=true;t.repeat.set(1,5);return t;})(),color:0xe0a070,roughness:0.9}));sh.position.y=H*0.335;sh.castShadow=true;g.add(sh);
   const b1=new T.Mesh(new T.BoxGeometry(w*0.86,H*0.1,w*0.86),stoneW);b1.position.y=H*0.72;g.add(b1);
   [0,1,2,3].forEach(k=>{const op=new T.Mesh(new T.BoxGeometry(w*0.3,H*0.06,0.05),mat(0x2a2018));const a=k*Math.PI/2;op.position.set(Math.sin(a)*w*0.44,H*0.72,Math.cos(a)*w*0.44);op.rotation.y=a;g.add(op);});
   const b2=new T.Mesh(new T.BoxGeometry(w*0.7,H*0.07,w*0.7),stoneW);b2.position.y=H*0.805;g.add(b2);
   const b3=new T.Mesh(new T.BoxGeometry(w*0.52,H*0.06,w*0.52),stoneW);b3.position.y=H*0.87;g.add(b3);
   const dm2=new T.Mesh(new T.SphereGeometry(w*0.24,10,8,0,Math.PI*2,0,Math.PI/2),mat(0xc8a050,{metalness:0.5,roughness:0.4}));dm2.position.y=H*0.9;g.add(dm2);
   const gi=new T.Mesh(new T.ConeGeometry(w*0.06,H*0.07,6),mat(0xd8b048,{metalness:0.7,roughness:0.3}));gi.position.y=H*0.96;g.add(gi);}
  // Cathedral: gothic mass from its real footprint, raised nave + pinnacles
  {const fp=G.fp.cathedral,H=L.cathedral[5];const m=new T.Mesh(extrudeFlat(fp,H*0.62),[stoneC,stoneC]);m.castShadow=true;plaza.add(m);
   const c=centroidOf(fp);let mx=0,ang=0;for(let i=0;i<fp.length;i+=2){const d=Math.hypot(fp[i]-c[0],fp[i+1]-c[1]);if(d>mx){mx=d;ang=Math.atan2(fp[i]-c[0],fp[i+1]-c[1]);}}
   const nave=new T.Mesh(new T.BoxGeometry(mx*0.35,H*0.38,mx*1.3),stoneW);nave.position.set(c[0],H*0.62+H*0.19,c[1]);nave.rotation.y=ang;plaza.add(nave);
   const cross=new T.Mesh(new T.BoxGeometry(mx*1.1,H*0.3,mx*0.3),stoneW);cross.position.set(c[0],H*0.62+H*0.15,c[1]);cross.rotation.y=ang;plaza.add(cross);
   for(let i=0;i<fp.length;i+=6){const p=new T.Mesh(new T.ConeGeometry(H*0.03,H*0.16,5),stoneW);p.position.set(fp[i],H*0.7,fp[i+1]);plaza.add(p);}}
  // Torre del Oro: 12-sided, three stages, gilded cap
  {const [,,x,z,,H]=L.torreoro,r=H*0.19,g=new T.Group();g.position.set(x,0,z);plaza.add(g);const gold=mat(0xdcb878,{roughness:0.85});
   const s1=new T.Mesh(new T.CylinderGeometry(r,r,H*0.55,12),gold);s1.position.y=H*0.275;s1.castShadow=true;g.add(s1);
   const s2=new T.Mesh(new T.CylinderGeometry(r*0.62,r*0.62,H*0.25,12),gold);s2.position.y=H*0.675;g.add(s2);
   const s3=new T.Mesh(new T.CylinderGeometry(r*0.38,r*0.4,H*0.12,12),gold);s3.position.y=H*0.86;g.add(s3);
   const cap=new T.Mesh(new T.SphereGeometry(r*0.38,12,8,0,Math.PI*2,0,Math.PI/2),mat(0xe8c050,{metalness:0.6,roughness:0.3}));cap.position.y=H*0.92;g.add(cap);}
  // Torre Sevilla (Pelli tower): tapered glass skyscraper from its real footprint
  {const fp=G.fp.torresevilla,H=L.torresevilla[5],c=centroidOf(fp);const geo=extrudeFlat(fp,H);const p=geo.attributes.position;
   for(let i=0;i<p.count;i++){const t=p.getY(i)/H,k=1-0.28*t*t;p.setX(i,c[0]+(p.getX(i)-c[0])*k);p.setZ(i,c[1]+(p.getZ(i)-c[1])*k);}geo.computeVertexNormals();
   const gl=new T.MeshStandardMaterial({color:0x7d9cb4,roughness:0.1,metalness:0.85});const m=new T.Mesh(geo,[gl,gl]);m.castShadow=true;plaza.add(m);}
  // Torre Schindler + Metropol Parasol (Las Setas) + Alcázar
  {const fp=G.fp.schindler,H=L.schindler[5];const m=new T.Mesh(extrudeFlat(fp,H),[stoneW,mat(0xd0d0cc)]);plaza.add(m);}
  {const fp=G.fp.setas,H=L.setas[5],c=centroidOf(fp);const wood=new T.MeshStandardMaterial({color:0xd8c28c,roughness:0.8});
   const top=new T.Mesh(extrudeFlat(fp,H*0.18),[wood,wood]);top.position.y=H*0.82;top.castShadow=true;plaza.add(top);
   for(let k=0;k<6;k++){const px=c[0]+(fp[k*20%fp.length]-c[0])*0.45,pz=c[1]+(fp[(k*20+1)%fp.length]-c[1])*0.45;const col2=new T.Mesh(new T.CylinderGeometry(H*0.14,H*0.06,H*0.82,8),wood);col2.position.set(px,H*0.41,pz);plaza.add(col2);}}
  {const fp=G.fp.alcazar,H=L.alcazar[5];const m=new T.Mesh(extrudeFlat(fp,H),[mat(0xb45e3a),mat(0xe0cfa8)]);m.castShadow=true;plaza.add(m);}
  plaza.userData.skyline=true;
}

const hullGeo=(L,W,H)=>{const NS=14,NC=8,P=[],I=[];for(let i=0;i<=NS;i++){const t=i/NS,x=(t-0.5)*L,bow=t>0.55?Math.sqrt(Math.max(0,1-((t-0.55)/0.45)**2)):1-(0.55-t)*0.35;const w=W/2*bow,sheer=H*(0.9+0.35*Math.max(0,t-0.6));
      for(let j=0;j<=NC;j++){const a=Math.PI*j/NC,cz=Math.cos(a)*w,cy=-Math.sin(a)*H*0.9*(0.6+0.4*bow);P.push(x,cy+sheer,cz);}}
    for(let i=0;i<NS;i++)for(let j=0;j<NC;j++){const a=i*(NC+1)+j,b=a+NC+1;I.push(a,b,a+1,a+1,b,b+1);}
    const g=new T.BufferGeometry();g.setAttribute('position',new T.Float32BufferAttribute(P,3));g.setIndex(I);g.computeVertexNormals();return g;};
const boatHull=(L,W,H,col,stripe)=>{const g=new T.Group();const hm=new T.MeshStandardMaterial({color:col,roughness:0.5,side:T.DoubleSide});const h=new T.Mesh(hullGeo(L,W,H),hm);h.castShadow=true;g.add(h);
    const dk=new T.Mesh(new T.CircleGeometry(1,20),mat(0xc9a878,{roughness:0.8}));dk.rotation.x=-Math.PI/2;dk.scale.set(L*0.47,W*0.42,1);dk.position.y=H*0.88;g.add(dk);
    if(stripe){const st=new T.Mesh(hullGeo(L*1.01,W*1.02,H*0.18),mat(stripe,{roughness:0.5,side:T.DoubleSide}));st.position.y=H*0.75;g.add(st);}return g;};
// Plaza de España materials: hand-laid brick, azulejo tiles, ceramic balustrade, paving
const brickT=mkTex((c,s)=>{c.fillStyle='#caa983';c.fillRect(0,0,s,s);const bh=s/16,bw=s/4;for(let r=0;r<16;r++)for(let k=-1;k<5;k++){const x=k*bw+(r%2?bw/2:0);const v=Math.random();c.fillStyle=v<0.25?'#b86a3e':v<0.5?'#c47a4a':v<0.7?'#a95f37':v<0.88?'#cc8757':'#9c5733';c.fillRect(x+1.5,r*bh+1.5,bw-3,bh-3);}_speck(c,s,1500,20,1);},2,2);
const azuT=mkTex((c,s)=>{c.fillStyle='#f4efe2';c.fillRect(0,0,s,s);const n=4,t=s/n;for(let y=0;y<n;y++)for(let x=0;x<n;x++){const cx=x*t+t/2,cy=y*t+t/2;
  c.fillStyle='#1f4f9a';c.beginPath();for(let k=0;k<8;k++){const a=k*Math.PI/4,r=k%2?t*0.18:t*0.42;c.lineTo(cx+Math.cos(a)*r,cy+Math.sin(a)*r);}c.closePath();c.fill();
  c.fillStyle='#f0b83a';c.beginPath();c.arc(cx,cy,t*0.12,0,Math.PI*2);c.fill();c.fillStyle='#2f7a4a';[[0,0],[t,0],[0,t],[t,t]].forEach(o=>{c.beginPath();c.arc(x*t+o[0],y*t+o[1],t*0.14,0,Math.PI*2);c.fill();});}
  c.strokeStyle='rgba(120,110,90,0.5)';c.lineWidth=1;for(let i=0;i<=n;i++){c.beginPath();c.moveTo(i*t,0);c.lineTo(i*t,s);c.stroke();c.beginPath();c.moveTo(0,i*t);c.lineTo(s,i*t);c.stroke();}},1,1);
const balT=mkTex((c,s)=>{c.fillStyle='#f3ecdc';c.fillRect(0,0,s,s);c.fillStyle='#1f4f9a';c.fillRect(0,0,s,s*0.14);c.fillRect(0,s*0.86,s,s*0.14);c.fillStyle='#f0b83a';c.fillRect(0,s*0.14,s,s*0.03);c.fillRect(0,s*0.83,s,s*0.03);
  for(let k=0;k<8;k++){const x=k*s/8+s/16;const gr=c.createLinearGradient(x-9,0,x+9,0);gr.addColorStop(0,'#c9c0ad');gr.addColorStop(0.5,'#ffffff');gr.addColorStop(1,'#c9c0ad');c.fillStyle=gr;
    c.beginPath();c.moveTo(x-5,s*0.2);c.quadraticCurveTo(x-13,s*0.45,x-6,s*0.8);c.lineTo(x+6,s*0.8);c.quadraticCurveTo(x+13,s*0.45,x+5,s*0.2);c.closePath();c.fill();}},4,1);
const balTerrT=mkTex((c,s)=>{c.fillStyle='#6e3a24';c.fillRect(0,0,s,s);c.fillStyle='#b36a44';c.fillRect(0,0,s,s*0.16);c.fillRect(0,s*0.86,s,s*0.14);c.fillStyle='#2f5f9e';c.fillRect(0,s*0.12,s,s*0.03);
  for(let k=0;k<8;k++){const x=k*s/8+s/16;c.fillStyle=k%2?'#c07a50':'#b8714a';c.beginPath();c.moveTo(x-6,s*0.2);c.quadraticCurveTo(x-14,s*0.48,x-7,s*0.82);c.lineTo(x+7,s*0.82);c.quadraticCurveTo(x+14,s*0.48,x+6,s*0.2);c.closePath();c.fill();
    c.fillStyle='rgba(255,220,180,0.25)';c.fillRect(x-3,s*0.3,2,s*0.4);}_speck(c,s,1200,18,1);},4,1);
const paveT=mkTex((c,s)=>{c.fillStyle='#e2cfa6';c.fillRect(0,0,s,s);const t=s/8;for(let y=0;y<8;y++)for(let x=0;x<8;x++){c.fillStyle=(x+y)%2?'#d9c49a':'#e8d7b2';c.fillRect(x*t+1,y*t+1,t-2,t-2);}_speck(c,s,2000,18,2);c.strokeStyle='#b0552f';c.lineWidth=3;c.strokeRect(1.5,1.5,s-3,s-3);},1,1);
// glazed roof tiles (the wings' pale tiled roofs with a faint diamond lattice) and fish-scale dome tiles
const roofTileT=mkTex((c,s)=>{c.fillStyle='#8f7c62';c.fillRect(0,0,s,s);const rows=16,cols=16,tw=s/cols,th=s/rows;
  for(let r=0;r<rows;r++)for(let k=0;k<cols;k++){const d=(Math.abs(((k+r)%8)-4)+Math.abs(((k-r+64)%8)-4))%4===0,v=Math.random()*14;
    c.fillStyle=d?'rgb('+Math.round(128+v)+','+Math.round(138+v)+','+Math.round(120+v)+')':'rgb('+Math.round(170+v)+','+Math.round(150+v)+','+Math.round(118+v)+')';
    c.beginPath();c.moveTo(k*tw+1,r*th+th);c.lineTo(k*tw+1,r*th+3);c.quadraticCurveTo(k*tw+tw/2,r*th-1,k*tw+tw-1,r*th+3);c.lineTo(k*tw+tw-1,r*th+th);c.closePath();c.fill();
    c.fillStyle='rgba(255,255,255,0.22)';c.fillRect(k*tw+tw*0.35,r*th+3,tw*0.18,th-5);c.fillStyle='rgba(40,30,20,0.35)';c.fillRect(k*tw,r*th+th-2,tw,2);}_speck(c,s,1500,16,1);},1,1);
const scaleT=mkTex((c,s)=>{c.fillStyle='#4e5f66';c.fillRect(0,0,s,s);const n=16,w=s/n;for(let r=-1;r<n+1;r++)for(let k=-1;k<n+1;k++){const x=k*w+(r%2?w/2:0),y=r*w*0.6,v=Math.random()*20;
    c.fillStyle=(r%6===0)?'rgb('+Math.round(190+v)+',162,80)':'rgb('+Math.round(96+v)+','+Math.round(122+v)+','+Math.round(128+v)+')';c.beginPath();c.arc(x+w/2,y,w/2,0,Math.PI);c.fill();
    c.strokeStyle='rgba(20,30,35,0.5)';c.lineWidth=1;c.stroke();}},1,1);

// ---- a 74 m end tower (Torre Norte / Torre Sur), modelled in metres from photos: broad base with corner
// pavilions and domed turrets, square shaft, open arcaded belfry, two round drums, fish-scale dome, lantern, spire ----
function plazaTower(M){const g=new T.Group();
  const B=(w,h,d,m,x,y,z)=>{const o=new T.Mesh(new T.BoxGeometry(w,h,d),m);o.position.set(x,y,z);o.castShadow=o.receiveShadow=true;g.add(o);return o;};
  const C=(rt,rb,h,m,x,y,z,seg,open)=>{const o=new T.Mesh(new T.CylinderGeometry(rt,rb,h,seg||16,1,!!open),m);o.position.set(x,y,z);o.castShadow=o.receiveShadow=true;g.add(o);return o;};
  const halfDisc=(r,m,x,y,z,ry)=>{const o=new T.Mesh(new T.CircleGeometry(r,14,0,Math.PI),m);o.position.set(x,y,z);o.rotation.y=ry||0;g.add(o);return o;};
  const faces=[[0,1,0],[1,0,Math.PI/2],[0,-1,Math.PI],[-1,0,-Math.PI/2]];   // (dx,dz,yaw) for the four sides
  const ring=(w,y,h)=>faces.forEach(([dx,dz,ry])=>{const o=B(w,h,0.3,M.bal,dx*w/2,y,dz*w/2);o.rotation.y=ry;});
  // stage A: 0–19.6 m, core with four corner pavilions
  B(13,19.6,13,M.brick,0,9.8,0);
  [[-1,-1],[1,-1],[-1,1],[1,1]].forEach(([sx,sz])=>{const x=sx*7.2,z=sz*7.2;B(4.4,19.6,4.4,M.brickL,x,9.8,z);B(4.9,0.6,4.9,M.stone,x,19.9,z);
    C(1.45,1.6,5.2,M.brick,x,22.8,z,8);C(1.85,1.85,0.45,M.stone,x,25.6,z,8);
    const d=new T.Mesh(new T.SphereGeometry(1.55,12,8,0,Math.PI*2,0,Math.PI/2),M.dome);d.scale.y=1.25;d.position.set(x,25.8,z);d.castShadow=true;g.add(d);C(0.04,0.3,3.2,M.stone,x,29.3,z,6);
    faces.forEach(([dx,dz,ry])=>{[8,14].forEach(y=>{const w=B(1.1,2.2,0.2,M.shade,x+dx*2.21,y,z+dz*2.21);w.rotation.y=ry;});});});
  faces.forEach(([dx,dz,ry])=>{const o=(v,a)=>[dx*a+(dz?v:0)*1,dz*a+(dx?v:0)*-1];
    // portal with a stone frame, pilasters and windows above
    const [px,pz]=o(0,6.62);const op=B(5,8,0.3,M.shade,px,4,pz);op.rotation.y=ry;halfDisc(2.5,M.shade,px+dx*0.02,8,pz+dz*0.02,ry);
    const fr=new T.Mesh(new T.TorusGeometry(2.9,0.4,6,16,Math.PI),M.stone);fr.position.set(px+dx*0.1,8,pz+dz*0.1);fr.rotation.y=ry;g.add(fr);
    [-3.3,3.3].forEach(v=>{const [qx,qz]=o(v,6.7);const pl=B(0.8,8,0.5,M.stone,qx,4,qz);pl.rotation.y=ry;});
    [-2.6,0,2.6].forEach(v=>{const [qx,qz]=o(v,6.56);const w=B(1.2,2.6,0.2,M.shade,qx,13.5,qz);w.rotation.y=ry;halfDisc(0.6,M.shade,qx+dx*0.11,14.8,qz+dz*0.11,ry);});
    const [ax,az]=o(0,6.58);const az1=B(10.5,1.4,0.12,M.azu,ax,17.4,az);az1.rotation.y=ry;});
  B(14.4,0.8,14.4,M.stone,0,19.9,0);ring(13.6,20.8,1.0);
  // stage B: square shaft 20.3–35 m
  B(9.4,14.7,9.4,M.brick,0,27.65,0);[[-1,-1],[1,-1],[-1,1],[1,1]].forEach(([sx,sz])=>B(0.8,14.7,0.8,M.stone,sx*4.5,27.65,sz*4.5));
  faces.forEach(([dx,dz,ry])=>{[25.2,30.8].forEach(y=>{const w=B(1.5,3.0,0.2,M.shade,dx*4.72,y,dz*4.72);w.rotation.y=ry;halfDisc(0.75,M.shade,dx*4.83,y+1.5,dz*4.83,ry);
      const s=new T.Mesh(new T.TorusGeometry(0.95,0.18,5,12,Math.PI),M.stone);s.position.set(dx*4.8,y+1.5,dz*4.8);s.rotation.y=ry;g.add(s);});
    [-3.2,3.2].forEach(v=>{const p=B(0.7,11,0.1,M.azu,dx*4.72+(dz?v:0),27.4,dz*4.72+(dx?-v:0));p.rotation.y=ry;});});
  B(11.6,0.6,11.6,M.stone,0,35.3,0);ring(11.2,36.1,0.9);
  // stage C: open arcaded belfry 35.6–43.4 m
  B(7.0,7.8,7.0,M.shade,0,39.5,0);
  faces.forEach(([dx,dz,ry])=>{[-3.9,-1.3,1.3,3.9].forEach(v=>C(0.28,0.3,5.0,M.stone,dx*4.4+(dz?v:0),38.1,dz*4.4+(dx?-v:0),10));
    [-2.6,0,2.6].forEach(v=>{const a=new T.Mesh(new T.TorusGeometry(1.3,0.28,6,12,Math.PI),M.brickL);a.position.set(dx*4.4+(dz?v:0),40.6,dz*4.4+(dx?-v:0));a.rotation.y=ry;g.add(a);});});
  B(9.8,1.9,9.8,M.brick,0,42.45,0);B(10.6,0.5,10.6,M.stone,0,43.65,0);ring(10.2,44.35,0.9);
  // stage D: round drum 43.9–49.7 m with a balcony
  C(3.0,3.1,5.8,M.brick,0,46.8,0,20);for(let k=0;k<8;k++){const a=k/8*Math.PI*2,w=B(0.8,2.2,0.2,M.shade,Math.sin(a)*3.02,46.8,Math.cos(a)*3.02);w.rotation.y=a;}
  C(3.5,3.5,0.35,M.stone,0,49.85,0,20);C(3.4,3.4,0.8,M.bal,0,50.4,0,20,true);
  // stage E: upper drum 50–59.4 m with tall openings
  C(2.25,2.35,9.4,M.brick,0,54.7,0,16);for(let k=0;k<6;k++){const a=k/6*Math.PI*2+0.26,w=B(0.75,3.6,0.2,M.shade,Math.sin(a)*2.27,55,Math.cos(a)*2.27);w.rotation.y=a;}
  C(2.75,2.75,0.45,M.stone,0,59.6,0,16);
  // fish-scale dome 59.8–65.4 m, lantern and spire to 74 m
  const V=a=>a.map(p=>new T.Vector2(p[0],p[1]));
  const dome=new T.Mesh(new T.LatheGeometry(V([[0,0],[2.55,0],[2.72,0.8],[2.6,2.0],[2.1,3.3],[1.3,4.4],[0.7,5.1],[0.55,5.6]]),20),M.dome);dome.position.y=59.8;dome.castShadow=true;g.add(dome);
  C(0.62,0.72,2.4,M.brickL,0,66.6,0,8);C(0.85,0.85,0.25,M.stone,0,67.9,0,8);
  const cap=new T.Mesh(new T.SphereGeometry(0.62,10,8,0,Math.PI*2,0,Math.PI/2),M.dome);cap.scale.y=1.3;cap.position.y=68;g.add(cap);
  C(0.03,0.2,4.6,M.stone,0,71.1,0,6);const ball=new T.Mesh(new T.SphereGeometry(0.28,8,6),M.stone);ball.position.y=69.4;g.add(ball);
  return g;}

// ---- intermediate pavilion (one each side), in metres: arcaded front, loggia, pediment, hipped tiled roof, twin domed turrets ----
function plazaPavilion(M){const g=new T.Group(),W=16,D=24,H=26,F=2;
  const B=(w,h,d,m,x,y,z)=>{const o=new T.Mesh(new T.BoxGeometry(w,h,d),m);o.position.set(x,y,z);o.castShadow=o.receiveShadow=true;g.add(o);return o;};
  const C=(rt,rb,h,m,x,y,z,seg)=>{const o=new T.Mesh(new T.CylinderGeometry(rt,rb,h,seg||8),m);o.position.set(x,y,z);o.castShadow=true;g.add(o);return o;};
  const half=(r,x,y,z)=>{const o=new T.Mesh(new T.CircleGeometry(r,14,0,Math.PI),M.shade);o.position.set(x,y,z);g.add(o);};
  B(W,H,D,M.brick,0,H/2,F-D/2);
  [-4.8,0,4.8].forEach(x=>{B(3.2,6.6,0.3,M.shade,x,3.3,F+0.02);half(1.6,x,6.6,F+0.18);const a=new T.Mesh(new T.TorusGeometry(1.85,0.3,6,14,Math.PI),M.stone);a.position.set(x,6.6,F+0.2);g.add(a);});
  [-7.2,-2.4,2.4,7.2].forEach(x=>B(0.9,6.6,0.5,M.stone,x,3.3,F+0.2));
  B(W+0.4,0.6,1.2,M.stone,0,9.0,F+0.3);B(W,1.0,0.35,M.bal,0,9.8,F+0.75);
  [-4.8,0,4.8].forEach(x=>{B(1.8,3.2,0.2,M.shade,x,13,F+0.05);half(0.9,x,14.6,F+0.16);B(2.6,0.4,0.5,M.stone,x,11.2,F+0.3);B(0.6,11,0.1,M.azu,x+2.4,16,F+0.06);});
  [-4.8,0,4.8].forEach(x=>{B(1.4,2.4,0.2,M.shade,x,18.2,F+0.05);half(0.7,x,19.4,F+0.16);});
  for(let k=0;k<5;k++){const x=-5.6+k*2.8;B(1.6,2.6,0.2,M.shade,x,22.6,F+0.05);half(0.8,x,23.9,F+0.16);C(0.2,0.2,3.2,M.stone,x-1.4,22.9,F+0.35,8);}
  B(W+0.8,0.7,D+0.8,M.stone,0,H+0.35,F-D/2);
  const roof=new T.Mesh(new T.ConeGeometry(0.7071,1,4,1).rotateY(Math.PI/4),M.roof);roof.scale.set(W+0.6,8,D+0.6);roof.position.set(0,H+0.7+4,F-D/2);roof.castShadow=true;g.add(roof);
  const tri=new T.Shape();tri.moveTo(-5,0);tri.lineTo(5,0);tri.lineTo(0,3.6);tri.closePath();const ped=new T.Mesh(new T.ExtrudeGeometry(tri,{depth:0.6,bevelEnabled:false}),M.brickL);ped.position.set(0,H+0.7,F-0.3);ped.castShadow=true;g.add(ped);
  const oc=new T.Mesh(new T.CircleGeometry(0.9,16),M.shade);oc.position.set(0,H+2.0,F+0.32);g.add(oc);
  [-1,1].forEach(s=>{const x=s*(W/2-0.2);C(1.3,1.4,5.2,M.brick,x,H+0.7+2.6,F-0.2);C(1.65,1.65,0.4,M.stone,x,H+5.5,F-0.2);
    const d=new T.Mesh(new T.SphereGeometry(1.4,12,8,0,Math.PI*2,0,Math.PI/2),M.dome);d.scale.y=1.25;d.position.set(x,H+5.7,F-0.2);d.castShadow=true;g.add(d);C(0.04,0.28,3.0,M.stone,x,H+9.1,F-0.2,6);});
  return g;}
// ===================== PLAZA DE ESPAÑA at true scale (1.31 units per metre, same as the family) =====================
// Semi-elliptical plan measured from OpenStreetMap: inner façade ≈ 270 m across × 88 m to the pavilion,
// canal ≈ 12 m wide, Vicente Traver fountain ≈ 24 m across, end towers 74 m.
const PLZ={s:1.31,fa:135,fb:88,ca:105,cb:52,cw:12,depth:24,height:20,t0:Math.PI-0.24,t1:2*Math.PI+0.24,bays:48,fr:12};
function buildPlaza(){
  plaza=new T.Group();plaza.visible=false;scene.add(plaza);
  const S=PLZ.s,FA=PLZ.fa*S,FB=PLZ.fb*S,CA=PLZ.ca*S,CB=PLZ.cb*S,CW=PLZ.cw*S,DEP=PLZ.depth*S,HT=PLZ.height*S,T0=PLZ.t0,T1=PLZ.t1;
  const cream=0xcfa77c,tile=0x9c4a2a;
  const mBrick=new T.MeshStandardMaterial({map:rep(brickT,1,1),color:0xffffff,roughness:0.92}),mBrickL=new T.MeshStandardMaterial({map:rep(brickT,1,1),color:0xfff6ec,roughness:0.92});
  mBrick.map.anisotropy=mBrickL.map.anisotropy=8;
  const mAzu=new T.MeshStandardMaterial({map:rep(azuT,1,1),roughness:0.35}),mDome=new T.MeshStandardMaterial({map:rep(scaleT,6,3),roughness:0.35,metalness:0.25}),mRoof=new T.MeshStandardMaterial({map:roofTileT,roughness:0.55}),mRoofC=new T.MeshStandardMaterial({map:rep(roofTileT,6,3),roughness:0.55}),mMarble=mat(0xf4f1ea,{roughness:0.35});
  const mCream=mat(cream,{roughness:0.85}),mTerra=mat(0xa95c38,{roughness:0.85}),balTT=new T.MeshStandardMaterial({map:rep(balTerrT,1,1),roughness:0.75}),mTile=mat(tile,{roughness:0.9}),mShade=mat(0x2a2018,{roughness:1.0}),mBlue=mat(0x2f5f9e,{roughness:0.5});
  const water=new T.MeshStandardMaterial({color:0x2f7f9a,roughness:0.08,metalness:0.35,normalMap:(()=>{const t=rippleN.clone();t.needsUpdate=true;t.repeat.set(0.25,0.25);return t;})(),normalScale:new T.Vector2(0.3,0.3),side:T.DoubleSide});
  const E=(a,b,t)=>new T.Vector3(a*Math.cos(t),0,b*Math.sin(t));                         // point on an ellipse (z = b·sinθ, pavilion at θ=3π/2)
  const N=(a,b,t)=>new T.Vector3(Math.cos(t)/a,0,Math.sin(t)/b).normalize();              // outward normal
  const yawIn=(a,b,t)=>{const n=N(a,b,t);return Math.atan2(-n.x,-n.z);};                   // face the plaza centre
  // arc-length table so bays / lamps / benches are evenly spaced along the façade
  const arcT=(a,b,n)=>{const M=2000,L=[0];for(let i=1;i<=M;i++){const p=E(a,b,T0+(T1-T0)*(i-1)/M),q=E(a,b,T0+(T1-T0)*i/M);L.push(L[i-1]+p.distanceTo(q));}
    const out=[];for(let k=0;k<n;k++){const target=(k+0.5)/n*L[M];let i=1;while(L[i]<target)i++;out.push(T0+(T1-T0)*(i-1+(target-L[i-1])/(L[i]-L[i-1]))/M);}return {ts:out,len:L[M]};};
  buildGeoSev();
  // ---- ground: paved plaza (half-ellipse + forecourt), walkway ring, avenue ----
  const pv=new T.MeshStandardMaterial({map:rep(paveT,1/10,1/10),color:0xe0cdb0,roughness:0.85});
  const floorSh=new T.Shape();floorSh.absellipse(0,0,FA+DEP*0.2,FB+DEP*0.2,0,Math.PI*2,false,0);
  const fl=new T.Mesh(new T.ShapeGeometry(floorSh,96),pv);fl.rotation.x=-Math.PI/2;fl.position.y=0.02;fl.receiveShadow=true;plaza.add(fl);
  {const g=fl.geometry,uv=g.attributes.uv,p=g.attributes.position;for(let i=0;i<uv.count;i++)uv.setXY(i,p.getX(i),p.getY(i));}
  const centre=new T.Mesh(new T.CircleGeometry(CA*0.62,72),new T.MeshStandardMaterial({map:rep(paveT,14,14),color:0xd6c2a2,roughness:0.85}));centre.rotation.x=-Math.PI/2;centre.scale.y=CB/CA*1.25;centre.position.y=0.03;centre.receiveShadow=true;plaza.add(centre);
  // ---- canal ribbon with tiled copings, ceramic balustrades and four bridges ----
  const bridgeT=[0.18,0.4,0.6,0.82].map(f=>T0+f*(T1-T0));
  const nearBridge=(t,a,b,w)=>bridgeT.some(bt=>E(a,b,t).distanceTo(E(a,b,bt))<w);
  const ribbon=(aIn,bIn,aOut,bOut,y,m,seg)=>{const P=[],I=[],U=[];for(let i=0;i<=seg;i++){const t=T0+(T1-T0)*i/seg,a=E(aIn,bIn,t),b=E(aOut,bOut,t);P.push(a.x,y,a.z,b.x,y,b.z);U.push(i/seg*60,0,i/seg*60,1);if(i<seg){const k=i*2;I.push(k,k+1,k+2,k+1,k+3,k+2);}}
    const g=new T.BufferGeometry();g.setAttribute('position',new T.Float32BufferAttribute(P,3));g.setAttribute('uv',new T.Float32BufferAttribute(U,2));g.setIndex(I);g.computeVertexNormals();const me=new T.Mesh(g,m);me.receiveShadow=true;plaza.add(me);return me;};
  const hw=CW/2;
  ribbon(CA-hw,CB-hw,CA+hw,CB+hw,0.09,water,320);
  const copM=new T.MeshStandardMaterial({map:rep(azuT,1,1),roughness:0.4,side:T.DoubleSide});
  ribbon(CA-hw-1.2,CB-hw-1.2,CA-hw,CB-hw,0.13,copM,320);ribbon(CA+hw,CB+hw,CA+hw+1.2,CB+hw+1.2,0.13,copM,320);
  const balM=new T.MeshStandardMaterial({map:rep(balT,1,1),roughness:0.4});
  [[CA-hw-0.6,CB-hw-0.6],[CA+hw+0.6,CB+hw+0.6]].forEach(([a,b])=>{const {ts}=arcT(a,b,Math.round(Math.PI*(a+b)/2*1.16/2.4));
    ts.forEach(t=>{if(nearBridge(t,a,b,5.0))return;const p=E(a,b,t),r=new T.Mesh(new T.BoxGeometry(2.45,1.1,0.4),balM);r.position.set(p.x,0.6,p.z);r.rotation.y=yawIn(a,b,t);plaza.add(r);
      const cap=new T.Mesh(new T.BoxGeometry(2.5,0.14,0.5),mBlue);cap.position.set(p.x,1.2,p.z);cap.rotation.y=r.rotation.y;plaza.add(cap);});});
  const PM={brick:mBrick,brickL:mBrickL,stone:mCream,dome:mDome,shade:mShade,bal:balTT,azu:mAzu,roof:mRoofC};
  bridgeT.forEach(t=>{const p=E(CA,CB,t),yaw=yawIn(CA,CB,t);const g=new T.Group();g.position.copy(p);g.rotation.y=yaw;plaza.add(g);
    const L=CW+4;const sh=new T.Shape();sh.moveTo(-L/2,0);sh.quadraticCurveTo(0,2.6,L/2,0);sh.lineTo(L/2,0.8);sh.quadraticCurveTo(0,3.4,-L/2,0.8);sh.closePath();
    const dg=new T.ExtrudeGeometry(sh,{depth:7,bevelEnabled:false,curveSegments:12});dg.translate(0,-0.1,-3.5);dg.rotateY(Math.PI/2);
    const deck=new T.Mesh(dg,mCream);deck.castShadow=true;g.add(deck);
    [-3.6,3.6].forEach(x=>{for(let k=-2;k<=2;k++){const r=new T.Mesh(new T.BoxGeometry(0.4,1.1,L/5),balM);const zz=k*L/5,yy=2.5*(1-(2*zz/L)**2)+0.75;r.position.set(x,yy+0.55,zz);r.rotation.x=Math.atan(2.5*8*zz/(L*L));g.add(r);}
      [-1,1].forEach(e=>{const post=new T.Mesh(new T.BoxGeometry(0.8,1.9,0.8),mBlue);post.position.set(x,1.4,e*L/2);g.add(post);const urn=new T.Mesh(new T.SphereGeometry(0.4,10,8),mCream);urn.position.set(x,2.6,e*L/2);g.add(urn);});});});
  // ---- the façade: 48 bays along the ellipse (ground-floor arcade, two storeys, terracotta balustrade) ----
  const {ts:bayT,len:facLen}=arcT(FA,FB,PLZ.bays),bw=facLen/PLZ.bays,PAVT=[1.5*Math.PI-0.68,1.5*Math.PI+0.68];
  const arch=new T.TorusGeometry(1,0.13,8,18,Math.PI);
  bayT.forEach((t,i)=>{const p=E(FA,FB,t),yaw=yawIn(FA,FB,t);if(Math.abs(t-1.5*Math.PI)<0.16||PAVT.some(q=>Math.abs(t-q)<0.1))return;  // pavilions sit here
    const g=new T.Group();g.position.copy(p);g.rotation.y=yaw;plaza.add(g);
    const mass=new T.Mesh(new T.BoxGeometry(bw+0.4,HT,DEP),mBrick);mass.position.set(0,HT/2,-DEP/2);mass.castShadow=true;mass.receiveShadow=true;g.add(mass);
    const pl=new T.Mesh(new T.BoxGeometry(bw,1.6,1.0),mTerra);pl.position.set(0,0.8,0.4);g.add(pl);
    // arcade: two arches per bay
    [-bw/4,bw/4].forEach(x=>{const op=new T.Mesh(new T.BoxGeometry(bw*0.34,7.2,0.8),mShade);op.position.set(x,1.6+3.6,0.35);g.add(op);
      const a=new T.Mesh(arch,mTerra);a.scale.setScalar(bw*0.17);a.position.set(x,1.6+7.2,0.8);g.add(a);});
    [-bw/2,0,bw/2].forEach(x=>{[-0.38,0.38].forEach(o=>{const c=new T.Mesh(new T.CylinderGeometry(0.22,0.26,7.2,10),mMarble);c.position.set(x+o,1.6+3.6,0.9);c.castShadow=true;g.add(c);});
      const cap=new T.Mesh(new T.BoxGeometry(1.4,0.5,0.8),mCream);cap.position.set(x,8.95,0.9);g.add(cap);});
    const band=new T.Mesh(new T.BoxGeometry(bw,1.2,1.3),mTerra);band.position.set(0,12.2,0.55);g.add(band);
    // upper storeys: windows with cream surrounds + a tiled balcony
    [15.4,20.6].forEach((y,k)=>{[-bw/4,bw/4].forEach(x=>{const w=new T.Mesh(new T.BoxGeometry(2.2,3.2,0.3),mShade);w.position.set(x,y,0.12);g.add(w);
        const hd=new T.Mesh(new T.CircleGeometry(1.1,12,0,Math.PI),mShade);hd.position.set(x,y+1.6,0.28);g.add(hd);
        const sur=new T.Mesh(new T.TorusGeometry(1.28,0.18,5,12,Math.PI),mTerra);sur.position.set(x,y+1.6,0.32);g.add(sur);
        const sill=new T.Mesh(new T.BoxGeometry(2.7,0.25,0.5),mTerra);sill.position.set(x,y-1.7,0.3);g.add(sill);});});
    const ter=new T.Mesh(new T.BoxGeometry(bw,1.1,0.35),balTT);ter.position.set(0,13.35,1.05);g.add(ter);
    const cor=new T.Mesh(new T.BoxGeometry(bw+0.5,0.9,1.4),mTerra);cor.position.set(0,HT-0.8,0.4);g.add(cor);
    const par=new T.Mesh(new T.BoxGeometry(bw+0.4,1.2,0.6),balTT);par.position.set(0,HT+0.6,0.2);g.add(par);
    const fbx=new T.Mesh(new T.BoxGeometry(0.6,0.6,0.6),mCream);fbx.position.set(-bw/2,HT+1.5,0.2);g.add(fbx);const fco=new T.Mesh(new T.ConeGeometry(0.26,1.3,6),mCream);fco.position.set(-bw/2,HT+2.45,0.2);g.add(fco);
    if(i%2===0){const dmr=new T.Mesh(new T.BoxGeometry(1.7,1.9,1.7),mBrickL);dmr.position.set(0,HT+2.0,-3.2);g.add(dmr);const dw=new T.Mesh(new T.BoxGeometry(0.8,1.1,0.1),mShade);dw.position.set(0,HT+2.0,-2.33);g.add(dw);
      const dr=new T.Mesh(new T.ConeGeometry(1.35,1.2,4).rotateY(Math.PI/4),mRoofC);dr.position.set(0,HT+3.55,-3.2);g.add(dr);}});
  // pitched glazed-tile roof following the curve (front slope faces the plaza)
  const roofStrip=(tA,tB)=>{const seg=Math.max(8,Math.round((tB-tA)*90)),P=[],U=[],I=[],rise=(DEP/2+0.8)*0.55,vs=Math.hypot(DEP/2+0.8,rise)/6.3;let arc=0,prev=null;
    for(let i=0;i<=seg;i++){const t=tA+(tB-tA)*i/seg,e=E(FA,FB,t),n=N(FA,FB,t),f=e.clone().addScaledVector(n,-0.8),r=e.clone().addScaledVector(n,DEP/2),b=e.clone().addScaledVector(n,DEP+0.8);
      if(prev)arc+=r.distanceTo(prev);prev=r;const u=arc/6.3;P.push(f.x,HT+0.25,f.z,r.x,HT+0.25+rise,r.z,r.x,HT+0.25+rise,r.z,b.x,HT+0.25,b.z);U.push(u,0,u,vs,u,0,u,vs);
      if(i<seg){const k=i*4,m=k+4;I.push(k,m,k+1,k+1,m,m+1,k+2,m+2,k+3,k+3,m+2,m+3);}}
    const g=new T.BufferGeometry();g.setAttribute('position',new T.Float32BufferAttribute(P,3));g.setAttribute('uv',new T.Float32BufferAttribute(U,2));g.setIndex(I);g.computeVertexNormals();
    const me=new T.Mesh(g,mRoof);me.castShadow=true;me.receiveShadow=true;plaza.add(me);};
  roofStrip(T0+0.02,1.5*Math.PI-0.16);roofStrip(1.5*Math.PI+0.16,T1-0.02);
  PAVT.forEach(t=>{const pv=plazaPavilion(PM);pv.scale.setScalar(S);pv.position.copy(E(FA,FB,t));pv.rotation.y=yawIn(FA,FB,t);plaza.add(pv);});
  // ---- the 48 provincial alcoves in front of the façade: tiled bench, back wall and a little map ----
  const benchM=new T.MeshStandardMaterial({map:rep(azuT,2,0.7),roughness:0.35}),mapCols=[0x9fc8e8,0xe8d49a,0xb8e0b0,0xf0b8a0];
  const {ts:benchT}=arcT(FA-5.5,FB-5.5,PLZ.bays);
  benchT.forEach((t,i)=>{if(Math.abs(t-1.5*Math.PI)<0.2)return;const p=E(FA-5.5,FB-5.5,t),g=new T.Group();g.position.copy(p);g.rotation.y=yawIn(FA-5.5,FB-5.5,t);plaza.add(g);
    const bk=new T.Mesh(new T.BoxGeometry(6.2,2.2,0.35),benchM);bk.position.set(0,1.1,-0.5);bk.castShadow=true;g.add(bk);
    const st=new T.Mesh(new T.BoxGeometry(6.2,0.2,0.75),benchM);st.position.set(0,0.62,0);g.add(st);
    const fr=new T.Mesh(new T.BoxGeometry(6.2,0.55,0.12),benchM);fr.position.set(0,0.28,0.32);g.add(fr);
    [-3.25,3.25].forEach(x=>{const e=new T.Mesh(new T.BoxGeometry(0.35,1.3,1.1),benchM);e.position.set(x,0.65,-0.1);g.add(e);const u=new T.Mesh(new T.SphereGeometry(0.28,8,6),mBlue);u.position.set(x,1.5,-0.1);g.add(u);});
    const mp=new T.Mesh(new T.PlaneGeometry(2.2,1.3),mat(mapCols[i%4],{roughness:0.6}));mp.position.set(0,1.35,-0.31);g.add(mp);
    [-2.2,2.2].forEach(x=>{const bs=new T.Mesh(new T.PlaneGeometry(1.4,1.1),new T.MeshStandardMaterial({map:rep(azuT,1,1),roughness:0.35}));bs.position.set(x,1.4,-0.31);g.add(bs);});});
  // ---- central pavilion (the design from before, scaled to ~46 m wide) ----
  const pav=new T.Group();const PD=2.6;
  const pbody=new T.Mesh(new T.BoxGeometry(20,12,6),mBrickL);pbody.position.set(0,6.5,PD);pav.add(pbody);
  const portal=new T.Mesh(new T.TorusGeometry(2.7,0.9,10,20,Math.PI),mBrick);portal.position.set(0,7.2,PD+3.05);pav.add(portal);
  [-2.6,2.6].forEach(x=>{const jamb=new T.Mesh(new T.BoxGeometry(1.0,7.4,0.9),mBrick);jamb.position.set(x,3.7,PD+3.05);pav.add(jamb);});
  const recess=box(5.6,7.6,2.2,0x241a12);recess.position.set(0,4.2,PD+1.4);pav.add(recess);
  const litWall=new T.Mesh(new T.BoxGeometry(4.4,5.2,0.3),new T.MeshStandardMaterial({color:0xcaa15a,emissive:0x6b4a18,emissiveIntensity:0.6,roughness:0.8}));litWall.position.set(0,3.6,PD+0.4);pav.add(litWall);
  [-4.4,-3.4,3.4,4.4].forEach(x=>{const c=cyl(0.42,0.46,7.2,cream,14);c.position.set(x,3.8,PD+3.0);pav.add(c);const cap=box(1.0,0.4,1.0,cream);cap.position.set(x,7.5,PD+3.0);pav.add(cap);});
  [-1,1].forEach(sd=>{const bl=new T.Mesh(new T.BoxGeometry(4.6,0.5,0.6),balTT);bl.position.set(sd*7.5,7.9,PD+3.25);pav.add(bl);const ld=box(4.8,0.25,0.9,cream);ld.position.set(sd*7.5,7.55,PD+3.2);pav.add(ld);
    [5.9,8.3].forEach(ax=>{const x=sd*ax,w=new T.Mesh(new T.BoxGeometry(1.5,2.4,0.3),mShade);w.position.set(x,9.6,PD+3.02);pav.add(w);const hd=new T.Mesh(new T.CircleGeometry(0.75,12,0,Math.PI),mShade);hd.position.set(x,10.8,PD+3.18);pav.add(hd);
      const wa=new T.Mesh(new T.TorusGeometry(0.9,0.16,5,12,Math.PI),mCream);wa.position.set(x,10.8,PD+3.2);pav.add(wa);[-0.85,0.85].forEach(o=>{const c=cyl(0.1,0.1,2.4,0xf4f1ea,8);c.position.set(x+o,9.6,PD+3.2);pav.add(c);});});
    const dr=new T.Mesh(new T.BoxGeometry(1.6,3.6,0.3),mShade);dr.position.set(sd*7.1,1.9,PD+3.02);pav.add(dr);const dh=new T.Mesh(new T.CircleGeometry(0.8,12,0,Math.PI),mShade);dh.position.set(sd*7.1,3.7,PD+3.18);pav.add(dh);
    const df=new T.Mesh(new T.TorusGeometry(0.95,0.18,5,12,Math.PI),mCream);df.position.set(sd*7.1,3.7,PD+3.2);pav.add(df);
    [5.6,7.4,9.2].forEach(ax=>{const w=new T.Mesh(new T.BoxGeometry(0.8,0.9,0.3),mShade);w.position.set(sd*ax,11.5,PD+3.02);pav.add(w);});
    [5.1,9.9].forEach(ax=>{const az=new T.Mesh(new T.BoxGeometry(0.45,6.5,0.1),mAzu);az.position.set(sd*ax,4.4,PD+3.06);pav.add(az);});});
  const cor=box(21,1.0,7,cream);cor.position.set(0,12.6,PD);pav.add(cor);
  const attic=new T.Mesh(new T.BoxGeometry(13,3.2,4),mBrick);attic.position.set(0,14.6,PD);pav.add(attic);
  const ped=new T.Mesh(new T.CylinderGeometry(0.001,4.6,2.4,3),mCream);ped.rotation.y=Math.PI;ped.position.set(0,17.2,PD);pav.add(ped);
  const clockf=new T.Mesh(new T.CircleGeometry(1.1,20),new T.MeshStandardMaterial({color:0xf4ead2}));clockf.position.set(0,15.0,PD+2.05);pav.add(clockf);
  for(let x=-9;x<=9;x+=3){const u=cyl(0.18,0.26,1.2,cream,8);u.position.set(x,13.6,PD+1.8);pav.add(u);const ub=new T.Mesh(new T.SphereGeometry(0.22,8,8),mTile);ub.position.set(x,14.3,PD+1.8);pav.add(ub);}
  const pole=cyl(0.1,0.1,3,0xcccccc,8);pole.position.set(0,19.4,PD);pav.add(pole);
  const fl1=box(1.4,0.9,0.06,0xc8102e);fl1.position.set(0.8,20.4,PD);pav.add(fl1);const fl2=box(1.4,0.45,0.07,0xffc400);fl2.position.set(0.8,20.4,PD+0.02);pav.add(fl2);
  const slim=side=>{const g2=new T.Group();const b=new T.Mesh(new T.BoxGeometry(3.4,16,3.4),mBrick);b.position.y=8;g2.add(b);
    [6,10,13].forEach(yy=>{const a=new T.Mesh(new T.TorusGeometry(0.6,0.16,6,10,Math.PI),mCream);a.position.set(0,yy,1.75);g2.add(a);});
    const c2=box(4,0.8,4,cream);c2.position.y=16.2;g2.add(c2);const a2=new T.Mesh(new T.BoxGeometry(2.6,2,2.6),mBrickL);a2.position.y=17.8;g2.add(a2);
    const dm=new T.Mesh(new T.SphereGeometry(1.5,14,8,0,Math.PI*2,0,Math.PI/2),mDome);dm.scale.y=1.35;dm.position.y=18.8;g2.add(dm);
    const ln=new T.Mesh(new T.CylinderGeometry(0.35,0.4,1.1,8),mCream);ln.position.y=21.3;g2.add(ln);const sp2=new T.Mesh(new T.ConeGeometry(0.12,2.2,6),mCream);sp2.position.y=22.9;g2.add(sp2);g2.position.set(side*9.5,0,PD-0.5);return g2;};
  pav.add(slim(-1));pav.add(slim(1));
  const back=new T.Mesh(new T.BoxGeometry(24,12,12),mBrick);back.position.set(0,6,-6);pav.add(back);
  pav.scale.setScalar(2.35);pav.position.set(0,0,-FB-1.5);plaza.add(pav);
  // ---- the two 74 m end towers ----
  [T0,T1].forEach(t=>{const g=plazaTower(PM);g.scale.setScalar(S);const p=E(FA,FB,t).add(N(FA,FB,t).multiplyScalar(DEP*0.45));g.position.copy(p);g.rotation.y=yawIn(FA,FB,t);plaza.add(g);});
  // ---- lamp posts round the inner canal edge: tiled ceramic base, iron post, hexagonal lantern ----
  {const {ts}=arcT(CA-hw-3,CB-hw-3,22),iron=mat(0x1d1f22,{roughness:0.5,metalness:0.6}),glow=new T.MeshStandardMaterial({color:0xfff2b0,emissive:0x6a5410,roughness:0.3});
   ts.forEach(t=>{const p=E(CA-hw-3,CB-hw-3,t),M=(geo,m,y)=>{const o=new T.Mesh(geo,m);o.position.set(p.x,y,p.z);o.castShadow=true;plaza.add(o);return o;};
     M(new T.CylinderGeometry(0.45,0.55,1.4,12),mAzu,0.7);M(new T.CylinderGeometry(0.5,0.5,0.15,12),mCream,1.47);M(new T.CylinderGeometry(0.11,0.17,4.4,8),iron,3.75);
     const rg=M(new T.TorusGeometry(0.3,0.04,4,12),iron,5.8);rg.rotation.x=Math.PI/2;M(new T.CylinderGeometry(0.42,0.26,1.0,6),glow,6.35);M(new T.ConeGeometry(0.55,0.6,6),iron,7.15);M(new T.SphereGeometry(0.12,6,6),iron,7.55);});}
  // ---- Vicente Traver fountain (24 m basin, tiered centrepiece) ----
  const FR=PLZ.fr*S;
  const fb=cyl(FR,FR+0.6,1.0,cream,48);fb.position.set(0,0.5,0);plaza.add(fb);
  const fw=new T.Mesh(new T.CylinderGeometry(FR-0.6,FR-0.6,0.3,48),water);fw.position.set(0,0.95,0);plaza.add(fw);
  [[3.2,3.6,2.2],[2.2,2.6,4.6],[1.2,1.5,7.0]].forEach(q=>{const c=cyl(q[0],q[1],1.6,cream,24);c.position.set(0,q[2],0);plaza.add(c);const bowl=new T.Mesh(new T.CylinderGeometry(q[0]*1.9,q[0]*1.2,0.5,28),mCream);bowl.position.set(0,q[2]+1.0,0);plaza.add(bowl);});
  const fj=cyl(0.25,0.25,2.4,0x9fd8e8,8);fj.position.set(0,9.4,0);plaza.add(fj);
  const spray=new T.Mesh(new T.ConeGeometry(4.2,6,24,1,true),new T.MeshStandardMaterial({color:0xe8f6ff,transparent:true,opacity:0.32,roughness:0.1,side:T.DoubleSide,depthWrite:false}));spray.rotation.x=Math.PI;spray.position.set(0,8.6,0);plaza.add(spray);plaza.userData.spray=spray;
  // ---- rowing boats on the canal ----
  plaza.userData.canal={a:CA,b:CB,t0:T0,t1:T1};
  plaza.userData.boats=[0.1,0.3,0.5,0.7,0.9].map((f,i)=>{const b=boatHull(3.6,1.5,0.6,[0xf2efe6,0x2f6f9e,0xc2562f,0x3f7d6e,0xe8a838][i],0xffffff);const oar=cyl(0.04,0.04,3,0xb08a5a,5);oar.rotation.x=Math.PI/2;oar.position.y=0.6;b.add(oar);plaza.add(b);return {m:b,t:T0+f*(T1-T0),s:(i%2?1:-1)*0.004};});
  // ---- return car + photo marker ----
  const car=carMesh(0x2f6f9e);car.position.set(26,0,FB*0.25+DEP*0.2+32);car.rotation.y=Math.PI/2;plaza.add(car);plaza.userData.car={x:26,z:car.position.z};car.userData.home=car.position.clone();plaza.userData.carMesh=car;
  const ring=new T.Mesh(new T.RingGeometry(2,2.6,32),new T.MeshBasicMaterial({color:0xe8a838,side:T.DoubleSide}));ring.rotation.x=-Math.PI/2;ring.position.set(0,0.05,30);plaza.add(ring);plaza.userData.photo={x:0,z:30};
  plaza.userData.start={x:0,z:52};
  plaza.updateMatrixWorld(true);plaza.traverse(o=>{if(o.isMesh&&(o.material===mBrick||o.material===mBrickL))worldUV(o,1.6,1.3);});
  mergeStatic(plaza,new Set(plaza.userData.boats.map(b=>b.m).concat([spray,car])));
  // ---- collision ----
  plazaSolids.push({x:0,z:0,rx:FR+0.6,rz:FR+0.6});
  const {ts:fsT}=arcT(FA+2,FB+2,Math.ceil(facLen/4.5));fsT.forEach(t=>{const p=E(FA+2,FB+2,t);plazaSolids.push({x:p.x,z:p.z,rx:3.2,rz:3.2});});
  const cl=arcT(CA,CB,Math.ceil(Math.PI*(CA+CB)/2*1.2/4));cl.ts.forEach(t=>{if(nearBridge(t,CA,CB,12.5))return;const p=E(CA,CB,t);plazaSolids.push({x:p.x,z:p.z,rx:hw+0.8,rz:hw+0.8});});
  plazaSolids.push({x:0,z:-FB-3,rx:28,rz:16});
  [T0,T1].forEach(t=>{const p=E(FA,FB,t).add(N(FA,FB,t).multiplyScalar(DEP*0.45));plazaSolids.push({x:p.x,z:p.z,rx:13,rz:13});});
  plaza.userData.bounds={lim:FA+DEP,minZ:-FB-2,maxZ:FB*0.25+DEP*0.2+60};
}
function buildTerminal(){
  terminal=new T.Group();terminal.visible=false;scene.add(terminal);
  const CEIL=14;                       // ceiling height — well above camera (y≈9) so the view never clips it
  const mGlass=new T.MeshStandardMaterial({color:0xbfe4f5,roughness:0.08,metalness:0.15,transparent:true,opacity:0.32,side:T.DoubleSide});
  const mMull=mat(0xb8bcc0,{roughness:0.5,metalness:0.4});   // mullion / frame metal

  // ---- canvas-texture sign helpers ----
  function mkTex(cw,ch,bg,lines){
    const cv=document.createElement('canvas');cv.width=cw;cv.height=ch;
    const ctx=cv.getContext('2d');
    if(bg){ctx.fillStyle=bg;ctx.fillRect(0,0,cw,ch);}
    lines.forEach(l=>{ctx.fillStyle=l.c||'#fff';ctx.font=(l.b?'bold ':'')+l.s+'px Arial';ctx.textAlign='center';ctx.textBaseline='middle';ctx.fillText(l.t,cw/2,l.y);});
    const tx=new T.CanvasTexture(cv);tx.generateMipmaps=false;tx.minFilter=T.LinearFilter;return tx;
  }
  function signMesh(w,h,tex){return new T.Mesh(new T.PlaneGeometry(w,h),new T.MeshBasicMaterial({map:tex,transparent:true,fog:false,side:T.DoubleSide}));}

  // ---- ground & floor ----
  // big apron so views out through the glass show tarmac, not void
  const apron=new T.Mesh(new T.PlaneGeometry(220,220),mat(0x9a9ea2,{roughness:0.95}));apron.rotation.x=-Math.PI/2;apron.position.y=-0.08;apron.receiveShadow=true;terminal.add(apron);
  // polished terminal floor
  const terrazzo=mkTexG((c,s)=>{c.fillStyle='#e8e2d6';c.fillRect(0,0,s,s);for(let i=0;i<2600;i++){const v=Math.random();c.fillStyle=v<0.3?'#c9bfae':v<0.55?'#a89c88':v<0.7?'#d8cdb9':v<0.8?'#8a8074':'#f4f0e8';const r=0.6+Math.random()*2.2;c.beginPath();c.arc(Math.random()*s,Math.random()*s,r,0,Math.PI*2);c.fill();}
    c.strokeStyle='rgba(150,140,125,0.6)';c.lineWidth=2;c.strokeRect(1,1,s-2,s-2);},14,11);
  const fl=new T.Mesh(new T.PlaneGeometry(56,46),new T.MeshStandardMaterial({map:terrazzo,roughness:0.28,metalness:0.0,envMapIntensity:0.6}));fl.rotation.x=-Math.PI/2;fl.position.y=0.01;fl.receiveShadow=true;terminal.add(fl);
  // subtle floor banding for scale
  for(let z=-20;z<=20;z+=8){const ln=box(56,0.02,0.25,0xcfc7b6);ln.position.set(0,0.03,z);terminal.add(ln);}

  // ---- open roof: light slab + skylight strips ----
  const ce=box(58,0.4,48,0xf2efe9,{roughness:0.9});ce.position.y=CEIL;terminal.add(ce);
  for(let i=-2;i<=2;i++){const sky=new T.Mesh(new T.BoxGeometry(46,0.12,2.2),new T.MeshBasicMaterial({color:0xdff2ff,fog:false}));sky.position.set(0,CEIL-0.25,i*8);terminal.add(sky);}
  // roof edge beams
  [[0,23.6,58,1.2],[0,-23.6,58,1.2]].forEach(b=>{const be=box(b[2],1.0,b[3],0xd6d2c8);be.position.set(b[0],CEIL-0.5,b[1]);terminal.add(be);});
  [[-28.6,0],[28.6,0]].forEach(b=>{const be=box(1.2,1.0,48,0xd6d2c8);be.position.set(b[0],CEIL-0.5,b[1]);terminal.add(be);});

  // ---- glass curtain wall helper ----
  // builds a transparent wall along a line with a solid base parapet, top header beam and vertical mullions
  function curtainWall(cx,cz,len,horiz){
    const half=len/2;
    const baseH=1.3, glassTop=CEIL-1.2;
    // parapet base
    const base=horiz?box(len,baseH,0.4,0xe7e2d8):box(0.4,baseH,len,0xe7e2d8);
    base.position.set(cx,baseH/2,cz);terminal.add(base);
    // glass
    const gh=glassTop-baseH;
    const g=horiz?new T.Mesh(new T.BoxGeometry(len,gh,0.12),mGlass):new T.Mesh(new T.BoxGeometry(0.12,gh,len),mGlass);
    g.position.set(cx,baseH+gh/2,cz);terminal.add(g);
    // header beam
    const head=horiz?box(len,1.0,0.5,0xd6d2c8):box(0.5,1.0,len,0xd6d2c8);
    head.position.set(cx,glassTop+0.5,cz);terminal.add(head);
    // vertical mullions every ~5 units
    for(let d=-half;d<=half+0.01;d+=5){const m=new T.Mesh(new T.BoxGeometry(0.22,gh,0.22),mMull);if(horiz)m.position.set(cx+d,baseH+gh/2,cz);else m.position.set(cx,baseH+gh/2,cz+d);terminal.add(m);}
  }

  // back wall (solid-ish so we can mount the board), made of glass+parapet for the airy look
  curtainWall(0,23,56,true);
  terminalSolids.push({x:0,z:23,rx:28,rz:2});
  // side walls — glass
  curtainWall(-28,0,46,false);
  curtainWall(28,0,46,false);
  terminalSolids.push({x:-28,z:0,rx:2,rz:23},{x:28,z:0,rx:2,rz:23});
  // front wall — two glass sections with the automatic-door gap in the middle
  curtainWall(-17.5,-23,21,true);
  curtainWall(17.5,-23,21,true);
  terminalSolids.push({x:-17.5,z:-23,rx:10.5,rz:2},{x:17.5,z:-23,rx:10.5,rz:2});
  // sliding glass doors in the gap
  const gd1=new T.Mesh(new T.BoxGeometry(3.2,3.6,0.16),mGlass);gd1.position.set(-2.6,1.8,-23);terminal.add(gd1);
  const gd2=new T.Mesh(new T.BoxGeometry(3.2,3.6,0.16),mGlass);gd2.position.set(2.6,1.8,-23);terminal.add(gd2);
  // door frame uprights
  [-4.3,-0.9,0.9,4.3].forEach(x=>{const u=new T.Mesh(new T.BoxGeometry(0.3,3.9,0.3),mMull);u.position.set(x,1.95,-23);terminal.add(u);});
  const lintel=box(9.2,0.6,0.4,0xd6d2c8);lintel.position.set(0,4.1,-23);terminal.add(lintel);

  // ---- baggage carousel ----
  for(let i=0;i<20;i++){const a=i/20*Math.PI*2;const rx2=9,rz2=5.5;const cx2=Math.cos(a)*rx2;const cz2=Math.sin(a)*rz2;const seg=box(2.8,0.5,1.4,0x555555,{roughness:0.7});seg.position.set(-6+cx2,0.35,9+cz2);seg.rotation.y=a+Math.PI/2;seg.castShadow=true;terminal.add(seg);}
  // central hump
  const hump=new T.Mesh(new T.CylinderGeometry(5.5,7,1.1,24),mat(0x6a6a6a,{roughness:0.6}));hump.position.set(-6,0.55,9);hump.castShadow=true;terminal.add(hump);
  terminalSolids.push({x:-6,z:9,rx:10,rz:6.5});

  // ---- benches ----
  const benchPositions=[[-14,19],[0,19],[14,19],[-22,8],[-22,-4],[-22,-14],[22,8],[22,-4],[22,-14]];
  benchPositions.forEach(p=>{
    const bn=box(3.2,0.5,0.9,0x8a6a44,{roughness:0.8});bn.position.set(p[0],0.55,p[1]);terminal.add(bn);
    const bk=box(3.2,0.8,0.18,0x7a5a38,{roughness:0.8});bk.position.set(p[0],1.15,p[1]+0.36);terminal.add(bk);
  });
  terminalSolids.push({x:-14,z:19,rx:2,rz:1.2},{x:0,z:19,rx:2,rz:1.2},{x:14,z:19,rx:2,rz:1.2});
  terminalSolids.push({x:-22,z:8,rx:1.2,rz:2},{x:-22,z:-4,rx:1.2,rz:2},{x:-22,z:-14,rx:1.2,rz:2});
  terminalSolids.push({x:22,z:8,rx:1.2,rz:2},{x:22,z:-4,rx:1.2,rz:2},{x:22,z:-14,rx:1.2,rz:2});

  // ---- pillars to the ceiling ----
  [[-18,0],[18,0],[-18,-10],[18,-10]].forEach(p=>{const pl=cyl(0.6,0.6,CEIL,0xd0ccc4,8);pl.position.set(p[0],CEIL/2,p[1]);terminal.add(pl);terminalSolids.push({x:p[0],z:p[1],rx:1.2,rz:1.2});});

  // ---- signs ----
  // helper: hang a framed sign from the ceiling with two visible cables
  function hangSign(w,h,tex,x,y,z,frameCol){
    const grp=new T.Group();
    const frame=box(w+0.4,h+0.4,0.2,frameCol);frame.position.set(0,0,-0.06);grp.add(frame);
    const s=signMesh(w,h,tex);s.position.z=0.05;grp.add(s);
    const back=signMesh(w,h,tex);back.position.z=-0.17;back.rotation.y=Math.PI;grp.add(back);
    grp.position.set(x,y,z);terminal.add(grp);
    // cables up to the ceiling
    const top=y+h/2+0.2;const clen=CEIL-0.4-top;
    [-w*0.32,w*0.32].forEach(dx=>{const c=cyl(0.04,0.04,clen,0x888c90,4);c.position.set(x+dx,top+clen/2,z);terminal.add(c);});
    return grp;
  }

  // airport name — mounted FLUSH on the LEFT glass wall, facing into the hall
  const airTex=mkTex(680,96,'#003DA5',[{t:'✈  Aeropuerto de Jerez de la Frontera',s:34,y:52,b:true}]);
  const airSign=signMesh(18,2.7,airTex);airSign.rotation.y=Math.PI/2;airSign.position.set(-27.6,6,0);terminal.add(airSign);
  const airFrame=box(0.2,3.1,18.4,0x001a5a);airFrame.position.set(-27.78,6,0);terminal.add(airFrame);

  // parked airliner on the apron beyond the glass (RIGHT side), with steps and a baggage cart
  {const plane=airliner();plane.scale.setScalar(1.3);plane.position.set(64,A320.gearDrop*1.3,6);plane.rotation.y=-0.22+Math.PI;terminal.add(plane);
   const stp=box(1.8,4.6,6,0xe8e8e8);stp.rotation.x=0.5;stp.rotation.y=-0.22;stp.position.set(60.5,2.2,-11);terminal.add(stp);
   const cart=box(3,1.4,2,0x3a6ea5);cart.position.set(46,0.7,12);terminal.add(cart);}

  // LLEGADAS / ARRIVALS — green sign hung over the baggage carousel
  const arrTex=mkTex(560,84,'#1d6b35',[
    {t:'LLEGADAS · ARRIVALS',s:32,y:32,b:true},
    {t:'Recogida de equipajes — Baggage claim',s:18,y:62,c:'rgba(255,255,255,.85)'}
  ]);
  hangSign(14,2.1,arrTex,-6,11.6,2.5,0x144d26);

  // SALIDA / EXIT — green sign mounted FLUSH on the lintel above the doors
  const exitTex=mkTex(420,84,'#1d6b35',[{t:'SALIDA · EXIT  ➜',s:34,y:46,b:true}]);
  const exitSign=signMesh(9,1.8,exitTex);exitSign.position.set(0,5.4,-22.7);terminal.add(exitSign);
  const exitFrame=box(9.4,2.2,0.18,0x144d26);exitFrame.position.set(0,5.4,-22.85);terminal.add(exitFrame);

  // floor direction arrows pointing toward exit
  const arrowTex=mkTex(64,128,null,[{t:'➜',s:64,y:64,b:true,c:'#e8c020'}]);
  [-1.6,1.6].forEach(x=>{[-7,-13].forEach(z=>{const ar=signMesh(1.6,3.0,arrowTex);ar.rotation.x=-Math.PI/2;ar.rotation.z=Math.PI;ar.position.set(x,0.04,z);terminal.add(ar);});});

  // departure board mounted FLUSH on the back wall
  const brd=box(14,2.6,0.25,0x12182e);brd.position.set(0,7.2,22.75);terminal.add(brd);
  const brdTex=mkTex(560,108,'#12182e',[
    {t:'DESTINO          PUERTA   ESTADO',s:20,y:24,b:true,c:'#ffd24a'},
    {t:'Chiclana / Villa     —       LISTO',s:20,y:54,c:'#7CFC7C'},
    {t:'La Barrosa           —     A TIEMPO',s:20,y:84,c:'#cfd6e6'}
  ]);
  const brdScr=signMesh(13,2.1,brdTex);brdScr.position.set(0,7.2,22.6);brdScr.rotation.y=Math.PI;terminal.add(brdScr);

  // exit road — simple ground plane outside the doors
  const road=new T.Mesh(new T.PlaneGeometry(24,18),mat(0x4a4a4a,{roughness:0.9}));road.rotation.x=-Math.PI/2;road.position.set(0,-0.05,-32);road.receiveShadow=true;terminal.add(road);

  // kerb line
  const kerb=box(24,0.25,0.5,0xd0d0c0);kerb.position.set(0,0.1,-27);terminal.add(kerb);

  // rental car (blue, engine running, waiting outside)
  const carCol=0x2f6f9e;
  const car=carMesh(carCol);car.position.set(2,0,-32);car.rotation.y=Math.PI/2;terminal.add(car);car.userData.home=car.position.clone();terminal.userData.carMesh=car;
  // luggage on roof
  {const rb=new T.Shape();rb.moveTo(-0.8,0);rb.lineTo(0.75,0);rb.quadraticCurveTo(0.9,0.02,0.85,0.18);rb.quadraticCurveTo(0.7,0.38,0.2,0.4);rb.lineTo(-0.7,0.38);rb.quadraticCurveTo(-0.9,0.3,-0.8,0);
   const bg=new T.ExtrudeGeometry(rb,{depth:0.9,bevelEnabled:true,bevelThickness:0.08,bevelSize:0.06,bevelSegments:3});bg.translate(0,0,-0.45);bg.rotateY(-Math.PI/2);
   const lug=new T.Mesh(bg,new T.MeshPhysicalMaterial({color:0x1a1c20,roughness:0.35,clearcoat:0.6}));lug.position.set(0,2.02,-0.8);lug.castShadow=true;car.add(lug);}

  // store car interaction point
  terminal.userData.car={x:2,z:-32};

  // interaction marker dot on floor near doors
  const dot=new T.Mesh(new T.CircleGeometry(0.5,16),new T.MeshBasicMaterial({color:0xe8a838}));dot.rotation.x=-Math.PI/2;dot.position.set(2,-0.01,-29.5);terminal.add(dot);

  // ---- arrivals-hall life: suitcases on the carousel, car-hire desks, café, posters, palms ----
  {const bags=new T.Group();terminal.add(bags);const cols=[0x2f6f9e,0xc2562f,0x3a3d44,0xe8a838,0x7a5bb0,0x3f7d6e,0xd84f6a,0x20242a];
   for(let i=0;i<14;i++){const g=new T.Group();const w=0.9+Math.random()*0.5,h=0.6+Math.random()*0.4;const cs=new T.Mesh(new T.BoxGeometry(w,h,0.45),mat(cols[i%cols.length],{roughness:0.5}));cs.castShadow=true;cs.position.y=h/2;g.add(cs);
     const hd=box(0.35,0.08,0.08,0x1a1a1a);hd.position.y=h+0.04;g.add(hd);if(i%3===0){const tag=box(0.12,0.2,0.02,0xffffff);tag.position.set(0.3,h+0.02,0.24);g.add(tag);}
     g.userData.ph=i/14;bags.add(g);}
   terminal.userData.bags=bags;}
  const signTex=(w,h,bg,lines)=>mkTex2(w,h,bg,lines);
  function mkTex2(cw,ch,bg,lines){const cv=document.createElement('canvas');cv.width=cw;cv.height=ch;const ctx=cv.getContext('2d');if(bg){ctx.fillStyle=bg;ctx.fillRect(0,0,cw,ch);}
    lines.forEach(l=>{ctx.fillStyle=l.c||'#fff';ctx.font=(l.b?'bold ':'')+l.s+'px '+(l.f||'Arial');ctx.textAlign='center';ctx.textBaseline='middle';ctx.fillText(l.t,cw/2,l.y);});const t=new T.CanvasTexture(cv);t.encoding=T.sRGBEncoding;return t;}
  // car-hire desks along the left glass wall
  [[-6,'#f2a900','#1a1a1a','AutoSol'],[2,'#1d6b35','#ffffff','Rent·Andalucía'],[10,'#c2262e','#ffffff','CostaCar']].forEach(d=>{
    const desk=box(5.4,1.15,1.1,0xf2efe8,{roughness:0.4});desk.position.set(-25.3,0.58,d[0]);terminal.add(desk);
    const top=box(5.6,0.08,1.3,0x2a2a2a,{roughness:0.2,metalness:0.3});top.position.set(-25.3,1.19,d[0]);terminal.add(top);
    const lb=new T.Mesh(new T.PlaneGeometry(5.2,1.2),new T.MeshBasicMaterial({map:signTex(420,96,d[1],[{t:d[3],s:44,y:40,b:true,c:d[2]},{t:'Alquiler de coches · Car hire',s:18,y:78,c:d[2]}])}));lb.rotation.y=Math.PI/2;lb.position.set(-27.55,3.3,d[0]);terminal.add(lb);
    terminalSolids.push({x:-25.3,z:d[0],rx:0.8,rz:2.9});});
  // café kiosk
  {const k=new T.Group();k.position.set(14,0,-12);terminal.add(k);const ctr=new T.Mesh(new T.CylinderGeometry(2.4,2.4,1.15,24,1,false,0,Math.PI*1.3),mat(0x6b4f33,{roughness:0.5}));ctr.position.y=0.58;k.add(ctr);
   const ctop=new T.Mesh(new T.CylinderGeometry(2.55,2.55,0.08,24,1,false,0,Math.PI*1.3),mat(0xf4f0e8,{roughness:0.2}));ctop.position.y=1.19;k.add(ctop);
   const canopy=new T.Mesh(new T.CylinderGeometry(2.8,2.8,0.5,24,1,true),new T.MeshStandardMaterial({map:stripeT('#c2562f','#fbf6ec'),side:T.DoubleSide,roughness:0.8}));canopy.position.y=3.4;k.add(canopy);
   const pole=cyl(0.1,0.1,3.4,0x333333,8);pole.position.y=1.7;k.add(pole);
   const cs=new T.Mesh(new T.PlaneGeometry(3,0.8),new T.MeshBasicMaterial({map:signTex(300,80,'#3a2418',[{t:'☕ Café · Churros',s:34,y:42,b:true,c:'#f9d56e'}]),transparent:true}));cs.position.set(0,4.05,0);k.add(cs);const cs2=cs.clone();cs2.rotation.y=Math.PI;k.add(cs2);
   [[-0.8,0x8a5a30],[0.3,0xffffff],[1.1,0xe8a838]].forEach(c=>{const cup=cyl(0.1,0.08,0.18,c[1],10);cup.position.set(c[0]*1.4,1.32,1.9);k.add(cup);});
   terminalSolids.push({x:14,z:-12,rx:2.8,rz:2.8});}
  // tourism posters on the back wall
  [[-14,'#d9772a','JEREZ','Caballos · Flamenco · Vino'],[14,'#1f6fa0','COSTA DE LA LUZ','Playas de Cádiz']].forEach(p2=>{
    const cv=document.createElement('canvas');cv.width=256;cv.height=384;const c=cv.getContext('2d');const g=c.createLinearGradient(0,0,0,384);g.addColorStop(0,p2[1]);g.addColorStop(1,'#f6d27a');c.fillStyle=g;c.fillRect(0,0,256,384);
    c.fillStyle='#fff6d8';c.beginPath();c.arc(128,150,70,0,Math.PI*2);c.fill();c.fillStyle='rgba(0,0,0,0.25)';c.fillRect(0,230,256,60);
    c.fillStyle='#fff';c.font='bold '+(p2[2].length>8?26:40)+'px Georgia';c.textAlign='center';c.fillText(p2[2],128,70);c.font='20px Georgia';c.fillText(p2[3],128,330);
    const t=new T.CanvasTexture(cv);t.encoding=T.sRGBEncoding;const m=new T.Mesh(new T.PlaneGeometry(3.2,4.8),new T.MeshBasicMaterial({map:t}));m.position.set(p2[0],3.6,22.6);m.rotation.y=Math.PI;terminal.add(m);
    const fr=box(3.5,5.1,0.1,0x2a2a2a);fr.position.set(p2[0],3.6,22.7);terminal.add(fr);});
  // potted palms inside, real palms outside along the kerb
  [[-24,19],[24,19],[-24,-19],[24,-19],[-6,-19],[6,-19]].forEach(q=>{const pt=new T.Mesh(new T.CylinderGeometry(0.8,0.6,1.1,16),mat(0xece6da,{roughness:0.5}));pt.position.set(q[0],0.55,q[1]);terminal.add(pt);
    const t=tree(q[0],q[1]);t.scale.set(0.55,0.6,0.55);t.position.y=1;terminal.add(t);terminalSolids.push({x:q[0],z:q[1],rx:1,rz:1});});
  [-11,-6,8,13].forEach(x=>{const t=tree(x,-28.5);t.scale.setScalar(1.1);terminal.add(t);});
  const taxi=new T.Mesh(new T.PlaneGeometry(2.4,0.8),new T.MeshBasicMaterial({map:signTex(240,80,'#1a1a1a',[{t:'🚕 TAXI  ·  🚗 P',s:30,y:42,b:true,c:'#ffd24a'}])}));taxi.position.set(-9,3.2,-27.6);terminal.add(taxi);
  const tpost=cyl(0.08,0.08,3,0x333333,6);tpost.position.set(-9,1.5,-27.65);terminal.add(tpost);
  mergeStatic(terminal,new Set([terminal.userData.bags,terminal.userData.carMesh]));
}

// ===================== AIRPLANE CABIN (3D intro scene) =====================
function buildCabin(){
  cabin=new T.Group();cabin.visible=false;scene.add(cabin);
  // A320 cabin at the family's scale (1.31 units/m): 3.7 m wide, 0.76 m seat pitch, floor at y=0
  const S=1.31,RT=1.86*S,CY=0.62*S,PITCH=0.76*S,Z0=1.0,ROWS=16,SW=0.46*S,AIS=0.5*S;
  const bas=(c,r)=>new T.MeshStandardMaterial({color:c,roughness:r==null?0.75:r,fog:false}),glow=c=>new T.MeshBasicMaterial({color:c,fog:false});
  const L=ROWS*PITCH+8,ZC=Z0+ROWS*PITCH/2-2;
  const tube=new T.Mesh(new T.CylinderGeometry(RT,RT,L,40,1,true),new T.MeshStandardMaterial({color:0xf3f0e8,roughness:0.8,side:T.BackSide,fog:false}));tube.rotation.x=Math.PI/2;tube.position.set(0,CY,ZC);cabin.add(tube);
  const bhF=new T.Mesh(new T.CircleGeometry(RT,40),bas(0xe9e3d6));bhF.position.set(0,CY,ZC-L/2);cabin.add(bhF);
  const bhR=new T.Mesh(new T.CircleGeometry(RT,40),bas(0xdfd9cc));bhR.position.set(0,CY,ZC+L/2);bhR.rotation.y=Math.PI;cabin.add(bhR);
  const floorW=2*Math.sqrt(RT*RT-CY*CY);
  const floor=new T.Mesh(new T.BoxGeometry(floorW,0.1,L),bas(0x4a4f59));floor.position.set(0,-0.05,ZC);cabin.add(floor);
  const aisle=new T.Mesh(new T.BoxGeometry(AIS,0.02,L),bas(0x2b2e36));aisle.position.set(0,0.01,ZC);cabin.add(aisle);
  [-AIS/2,AIS/2].forEach(x=>{const l=new T.Mesh(new T.BoxGeometry(0.05,0.03,L),bas(0xff6600));l.position.set(x,0.02,ZC);cabin.add(l);});
  // overhead bins, light cove, passenger service units
  const binY=CY+RT*0.62;
  [-1,1].forEach(s=>{const bin=new T.Mesh(new T.BoxGeometry(0.62*S,0.42*S,L),bas(0xeae4d7));bin.position.set(s*(RT*0.64),binY,ZC);bin.rotation.z=-s*0.35;cabin.add(bin);
    const lip=new T.Mesh(new T.BoxGeometry(0.66*S,0.06*S,L),bas(0xd8d1c0));lip.position.set(s*(RT*0.55),binY-0.3*S,ZC);lip.rotation.z=-s*0.35;cabin.add(lip);});
  const cove=new T.Mesh(new T.BoxGeometry(0.7*S,0.04,L),glow(0xfff6e0));cove.position.set(0,CY+RT*0.97,ZC);cabin.add(cove);
  // windows (one per row) on both walls
  const wy=0.95*S,wx=Math.sqrt(RT*RT-(wy-CY)**2)-0.02;
  for(let r=-1;r<=ROWS;r++){const z=Z0+r*PITCH+0.1;[-1,1].forEach(s=>{
    const fr=new T.Mesh(new T.PlaneGeometry(0.32*S,0.42*S),bas(0xe9e3d6));fr.position.set(s*wx,wy,z);fr.rotation.y=s>0?-Math.PI/2:Math.PI/2;fr.rotation.x=0;cabin.add(fr);
    const pane=new T.Mesh(new T.PlaneGeometry(0.22*S,0.32*S),glow(0xffd9a0));pane.position.set(s*(wx-0.01),wy,z);pane.rotation.y=fr.rotation.y;cabin.add(pane);});}
  // seats (orange headrest covers, grey shells) — passengers face the nose (−z), towards the camera
  const shell=bas(0x3a3f4a),cushM=bas(0x2e3440),head=bas(0xff6600),arm=bas(0x23262c);
  const seatX=[0,1,2].map(k=>AIS/2+SW/2+k*SW);
  function makeSeat(x,z){const g=new T.Group();
    const cush=new T.Mesh(new T.BoxGeometry(SW*0.92,0.1*S,0.46*S),cushM);cush.position.set(0,0.46*S,0);g.add(cush);
    const base=new T.Mesh(new T.BoxGeometry(SW*0.8,0.34*S,0.3*S),arm);base.position.set(0,0.24*S,0.02);g.add(base);
    const back=new T.Mesh(new T.BoxGeometry(SW*0.94,0.62*S,0.08*S),shell);back.position.set(0,0.82*S,0.26*S);back.rotation.x=-0.12;g.add(back);
    const hr=new T.Mesh(new T.BoxGeometry(SW*0.8,0.22*S,0.1*S),head);hr.position.set(0,1.1*S,0.3*S);hr.rotation.x=-0.12;g.add(hr);
    const ar=new T.Mesh(new T.BoxGeometry(0.05*S,0.06*S,0.4*S),arm);ar.position.set(SW/2,0.66*S,0.02);g.add(ar);
    g.position.set(x,0,z);return g;}
  // family in the front rows (placed in setScene); strangers are baked, one draw call each
  cabin.userData.famSeats={mum:{x:seatX[0],z:Z0},toddler:{x:seatX[1],z:Z0},dad:{x:seatX[2],z:Z0},nana:{x:-seatX[0],z:Z0},papa:{x:-seatX[1],z:Z0},auntie:{x:-seatX[0],z:Z0+PITCH}};
  cabin.userData.seatH=0.5*S;
  const taken=new Set(Object.values(cabin.userData.famSeats).map(q=>q.x.toFixed(2)+'_'+q.z.toFixed(2)));
  const skins=[0xf2cfae,0xe8b48a,0xd8a176,0xb97f55,0x8d5a3b,0xf6d7b8],hairs=[0x2a1d14,0x5a3420,0x8a6a3a,0xc9a268,0x1c1411,0xd4d1cc,0x6b2f1a];
  const tops=[0x554596,0xc2562f,0x2f6f9e,0xb0506f,0x3f7d6e,0x6c7a4a,0xe8e2d6,0x20242a,0xe8a838],styles=['short','ponytail','long','curly','bald','short'];
  const pick=a=>a[Math.floor(Math.random()*a.length)];
  for(let r=0;r<ROWS;r++){const z=Z0+r*PITCH;
    [-1,1].forEach(side=>{for(let s=0;s<3;s++){const x=side*seatX[s];cabin.add(makeSeat(x,z));
      if(taken.has(x.toFixed(2)+'_'+z.toFixed(2))||Math.random()>0.55)continue;
      const hs=pick(styles),def={h:2.05+Math.random()*0.35,skin:pick(skins),hair:hs==='bald'?0xcfccc6:pick(hairs),hairStyle:hs,top:{type:Math.random()<0.5?'tee':'tank',col:pick(tops)},bottom:{type:'shorts',col:pick([0x2f3e5a,0xd6c197,0x3a3a3a])},shoes:{type:'trainer',col:0xffffff},beard:hs==='short'&&Math.random()<0.4};
      const pp=makePerson(def,{lo:true});pp.pose='sit';pp.seatH=cabin.userData.seatH;animPerson(pp,1,true);
      const baked=bakePerson(pp);baked.position.set(x,0,z-0.06);baked.rotation.y=Math.PI;cabin.add(baked);}});}
  mergeStatic(cabin);
  cabin.add(new T.HemisphereLight(0xfff8ee,0x6a6258,0.55));
  const cdl=new T.DirectionalLight(0xfff2de,0.7);cdl.position.set(0.8,3,-4);cdl.target.position.set(0,0.6,6);cabin.add(cdl);cabin.add(cdl.target);
  cabin.userData.Z0=Z0;
}
// merge a posed low-detail person into one vertex-coloured mesh (one draw call per passenger)
function bakePerson(p){
  p.root.updateMatrixWorld(true);const inv=new T.Matrix4().copy(p.root.matrixWorld).invert();
  const pos=[],nor=[],col=[],m=new T.Matrix4(),nm=new T.Matrix3(),v=new T.Vector3(),c=new T.Color();
  p.root.traverse(o=>{if(!o.isMesh||o===p.blob)return;
    const g=o.geometry.index?o.geometry.toNonIndexed():o.geometry;m.multiplyMatrices(inv,o.matrixWorld);nm.getNormalMatrix(m);
    const pa=g.attributes.position,na=g.attributes.normal;c.copy(o.material.color||c.setHex(0xffffff));
    if(o.material.map)c.setHex(0xd8d0c4).multiply(o.material.color);
    for(let i=0;i<pa.count;i++){v.fromBufferAttribute(pa,i).applyMatrix4(m);pos.push(v.x,v.y,v.z);v.fromBufferAttribute(na,i).applyMatrix3(nm).normalize();nor.push(v.x,v.y,v.z);col.push(c.r,c.g,c.b);}});
  const bg=new T.BufferGeometry();bg.setAttribute('position',new T.Float32BufferAttribute(pos,3));bg.setAttribute('normal',new T.Float32BufferAttribute(nor,3));bg.setAttribute('color',new T.Float32BufferAttribute(col,3));
  return new T.Mesh(bg,mc('bakedM',()=>new T.MeshLambertMaterial({vertexColors:true})));
}

// ===================== AIRLINER: easyJet Airbus A320neo =====================
// Modelled in metres from a photo of easyJet A320neo G-UZLB (Wikimedia Commons) and published A320neo
// dimensions: 37.57 m long, 35.8 m span, 3.95 m fuselage. Callers scale the group to their world
// (1 = metres, 0.65 = runway scene, 1.3 = people scale). userData.gearDrop = centreline → tyre bottom.
const A320={L:37.57,R:1.98,noseL:6.2,tailL:11.2,gearDrop:4.1};
function a320Livery(){
  const W=512,H=2048,cv=document.createElement('canvas');cv.width=W;cv.height=H;const c=cv.getContext('2d');
  const ORANGE='#ff6600',WHITE='#eef0f2',L=A320.L;
  const uOf=h=>Math.acos(Math.max(-1,Math.min(1,-h)))/(Math.PI*2);          // height h=-cos(2πu) → u on the port half
  const yOf=a=>H*(1-a),aOfDist=d=>1-d/L;                                    // a: 0 = tail, 1 = nose
  const band=(a0,a1,fn)=>{for(let y=Math.floor(yOf(a1));y<Math.ceil(yOf(a0));y++){const a=1-(y+0.5)/H;const r=fn(a);if(!r)continue;
      const [h0,h1]=r;const uA=uOf(h0),uB=uOf(h1);// port side spans uA..uB (u increases with height), starboard mirrored
      c.fillRect(Math.min(uA,uB)*W,y,Math.abs(uB-uA)*W+1,1.2);c.fillRect((1-Math.max(uA,uB))*W,y,Math.abs(uB-uA)*W+1,1.2);}};
  const lerp=(x,x0,x1,y0,y1)=>y0+(y1-y0)*Math.max(0,Math.min(1,(x-x0)/(x1-x0)));
  c.fillStyle=WHITE;c.fillRect(0,0,W,H);
  c.fillStyle=ORANGE;
  // forward crown: from the cockpit roof back over the wing, lower edge just under the window line
  band(0.44,0.99,a=>{let hb;if(a<0.56)hb=lerp(a,0.44,0.56,0.99,0.05);else if(a<0.9)hb=lerp(a,0.56,0.9,0.05,-0.12);else hb=lerp(a,0.9,0.99,-0.12,0.55);return hb<0.99?[hb,1]:null;});
  // rear swoosh: lower aft fuselage rising to the tail, tapering into a thin stripe under the wing
  band(0.025,0.52,a=>[-1,lerp(a,0.03,0.52,0.6,-0.9)]);
  band(0.52,0.66,a=>[-1,lerp(a,0.52,0.66,-0.9,-0.995)]);
  c.fillStyle='#d4d7db';band(0,0.025,a=>[-1,1]);                           // APU tail cone
  // passenger windows (two gaps for the over-wing exits)
  c.fillStyle='#1b2330';const wu0=uOf(0.19),wu1=uOf(0.37),wpx=0.25/L*H;
  for(let d=7.3;d<28.2;d+=0.535){if(d>15.3&&d<16.6)continue;const y=yOf(aOfDist(d));
    [[wu0,wu1],[1-wu1,1-wu0]].forEach(q=>{const x=q[0]*W,w=(q[1]-q[0])*W;c.beginPath();if(c.roundRect)c.roundRect(x,y-wpx/2,w,wpx,3);else c.rect(x,y-wpx/2,w,wpx);c.fill();});}
  // doors + over-wing exits (panel lines)
  const door=(d,wm,h0,h1,col)=>{const y0=yOf(aOfDist(d-wm/2)),y1=yOf(aOfDist(d+wm/2));c.strokeStyle=col;c.lineWidth=1.6;
    [[uOf(h0),uOf(h1)],[1-uOf(h1),1-uOf(h0)]].forEach(q=>{c.strokeRect(q[0]*W,y1,(q[1]-q[0])*W,y0-y1);});};
  door(3.6,0.9,-0.28,0.58,'#b04a10');door(34.4,0.85,-0.3,0.55,'#b04a10');door(15.6,0.5,0.05,0.4,'#9aa0a8');door(16.4,0.5,0.05,0.4,'#9aa0a8');door(10.2,0.55,-0.72,-0.38,'#9aa0a8');
  // cockpit glazing: two windscreen panes + two side windows each side
  c.fillStyle='#10161e';
  const quad=(pts)=>{[false,true].forEach(m=>{c.beginPath();pts.forEach((p,i)=>{const x=(m?1-p[0]:p[0])*W,y=yOf(p[1]);i?c.lineTo(x,y):c.moveTo(x,y);});c.closePath();c.fill();});};
  quad([[0.405,0.976],[0.482,0.978],[0.482,0.963],[0.402,0.961]]);      // front windscreen
  quad([[0.398,0.968],[0.318,0.958],[0.314,0.953],[0.392,0.956]]);      // side windscreen
  quad([[0.362,0.951],[0.306,0.951],[0.304,0.938],[0.358,0.939]]);      // sliding window
  quad([[0.355,0.936],[0.302,0.936],[0.300,0.923],[0.350,0.924]]);      // rear side window
  // wordmark over the forward cabin (reads correctly from both sides)
  const word=(size)=>{c.save();c.fillStyle='#ffffff';c.font='900 '+size+'px Fraunces, "Arial Black", Georgia, sans-serif';c.textAlign='center';c.textBaseline='middle';
    const a=0.745,y=yOf(a),uP=uOf(0.6),len=0.235*H;
    [[uP,Math.PI/2],[1-uP,-Math.PI/2]].forEach(q=>{c.save();c.translate(q[0]*W,y);c.rotate(q[1]);const mw=c.measureText('easyJet').width;c.scale(len/mw,1);c.fillText('easyJet',0,0);c.restore();});c.restore();};
  word(64);
  const t=new T.CanvasTexture(cv);t.encoding=T.sRGBEncoding;t.anisotropy=8;
  if(document.fonts&&document.fonts.ready)document.fonts.ready.then(()=>{c.fillStyle=ORANGE;band(0.60,0.89,a=>[0.42,0.8]);
    c.fillStyle='#1b2330';word(64);t.needsUpdate=true;});
  return t;}
function finDecal(shapePts,mirror){
  // white easyJet running along the swept fin, drawn into the fin's own outline
  let mnx=1e9,mxx=-1e9,mny=1e9,mxy=-1e9;shapePts.forEach(p=>{mnx=Math.min(mnx,p[0]);mxx=Math.max(mxx,p[0]);mny=Math.min(mny,p[1]);mxy=Math.max(mxy,p[1]);});
  const s=new T.Shape();shapePts.forEach((p,i)=>{const x=mirror?-p[0]:p[0];i?s.lineTo(x,p[1]):s.moveTo(x,p[1]);});s.closePath();
  const g=new T.ShapeGeometry(s),uv=g.attributes.uv,pos=g.attributes.position;
  for(let i=0;i<uv.count;i++){const x=mirror?-pos.getX(i):pos.getX(i);uv.setXY(i,mirror?1-(x-mnx)/(mxx-mnx):(x-mnx)/(mxx-mnx),(pos.getY(i)-mny)/(mxy-mny));}
  return {g,bounds:[mnx,mxx,mny,mxy]};}
function finTex(bounds,stbd){const [mnx,mxx,mny,mxy]=bounds,W=512,H=Math.round(512*(mxy-mny)/(mxx-mnx)),cv=document.createElement('canvas');cv.width=W;cv.height=H;const c=cv.getContext('2d');
  const draw=()=>{c.clearRect(0,0,W,H);c.save();c.fillStyle='#ffffff';c.font='900 120px Fraunces, "Arial Black", Georgia, sans-serif';c.textAlign='center';c.textBaseline='middle';
    c.translate(W*(stbd?0.34:0.66),H*0.5);c.rotate(stbd?0.66:-0.66);const mw=c.measureText('easyJet').width;c.scale(W*0.6/mw,W*0.6/mw);c.fillText('easyJet',0,0);c.restore();};
  draw();const t=new T.CanvasTexture(cv);t.encoding=T.sRGBEncoding;if(document.fonts&&document.fonts.ready)document.fonts.ready.then(()=>{draw();t.needsUpdate=true;});return t;}
let _a320Tex=null;const _a320Fin=[null,null];
function airliner(opts){opts=opts||{};const g=new T.Group(),{L,R,noseL,tailL}=A320,z0=-L/2,z1=L/2;
  if(!_a320Tex)_a320Tex=a320Livery();
  const orange=new T.MeshStandardMaterial({color:0xff6600,roughness:0.38,metalness:0.1}),white=new T.MeshStandardMaterial({color:0xeef0f2,roughness:0.36,metalness:0.12});
  const greyW=new T.MeshStandardMaterial({color:0xcfd3d8,roughness:0.42,metalness:0.2}),dark=new T.MeshStandardMaterial({color:0x2a2e34,roughness:0.5,metalness:0.4}),metal=new T.MeshStandardMaterial({color:0xc0c5cc,roughness:0.25,metalness:0.9});
  // ---- fuselage: lathe, drooped nose, flat-topped upswept tail ----
  const N=90,prof=[];const yc=[];
  for(let i=0;i<=N;i++){const t=i/N,z=z0+t*L;let r=R,y=0;
    if(z>z1-noseL){const u=(z-(z1-noseL))/noseL;r=R*Math.pow(Math.max(0,1-Math.pow(u,2.6)),0.52);y=-0.2*u*u;}
    if(z<z0+tailL){const u=((z0+tailL)-z)/tailL;r=R*(1-0.86*Math.pow(u,1.45));y=(R-r)*0.93;}
    prof.push(new T.Vector2(Math.max(0.03,r),z));yc.push(y);}
  const fg=new T.LatheGeometry(prof,48);fg.rotateX(Math.PI/2);
  {const p=fg.attributes.position;for(let k=0;k<p.count;k++){const j=Math.round((p.getZ(k)-z0)/L*N);p.setY(k,p.getY(k)+yc[Math.max(0,Math.min(N,j))]);}fg.computeVertexNormals();}
  const fus=new T.Mesh(fg,new T.MeshStandardMaterial({map:_a320Tex,roughness:0.34,metalness:0.12}));fus.castShadow=true;g.add(fus);
  const fair=new T.Mesh(new T.SphereGeometry(1,24,12),greyW);fair.scale.set(1.75,0.62,7.2);fair.position.set(0,-R*0.72,1.0);g.add(fair);
  // ---- wings: kinked swept planform, tapered thickness, dihedral, sharklets, flap-track fairings ----
  const wz=2.4;
  const planPts=[[1.6,3.4+wz],[17.4,-4.6+wz],[17.4,-6.1+wz],[6.4,-3.6+wz],[1.6,-3.6+wz]];
  const ws=new T.Shape();planPts.forEach((p,i)=>i?ws.lineTo(p[0],-p[1]):ws.moveTo(p[0],-p[1]));ws.closePath();
  const wg=new T.ExtrudeGeometry(ws,{depth:1,bevelEnabled:true,bevelThickness:0.08,bevelSize:0.12,bevelSegments:3,curveSegments:4});wg.rotateX(-Math.PI/2);
  {const p=wg.attributes.position;for(let k=0;k<p.count;k++){const x=p.getX(k),th=0.62*(1-0.7*Math.max(0,x-1.6)/15.8);p.setY(k,(p.getY(k)-0.5)*th);}wg.computeVertexNormals();}
  [1,-1].forEach(s=>{const wing=new T.Group();wing.scale.x=s;wing.position.set(0,-1.12,0);wing.rotation.z=s*0.089;g.add(wing);
    const w=new T.Mesh(wg,greyW);w.castShadow=true;wing.add(w);
    const sh=new T.Shape();sh.moveTo(0,0);sh.lineTo(1.5,0);sh.lineTo(1.35,2.4);sh.lineTo(0.85,2.4);sh.closePath();
    const sg=new T.ExtrudeGeometry(sh,{depth:0.08,bevelEnabled:false});sg.rotateY(Math.PI/2);
    const shk=new T.Mesh(sg,orange);shk.position.set(17.35,0.05,-4.55+wz);shk.rotation.z=-0.18;shk.castShadow=true;wing.add(shk);
    [4.3,8.6,12.6].forEach((x,k)=>{const f=new T.Mesh(new T.SphereGeometry(1,10,6),greyW);f.scale.set(0.13,0.2,1.1);f.position.set(x,-0.28,-3.4+wz-(x-6.4)*0.23-0.6);wing.add(f);});
    // ---- CFM LEAP / PW1100G nacelle, pylon, fan, exhaust ----
    const np=[];for(let i=0;i<=16;i++){const t=i/16;const r=t<0.12?1.02+t*1.3:1.18-Math.pow(Math.max(0,t-0.35)/0.65,1.6)*0.36;np.push(new T.Vector2(r,-t*4.6));}
    const ng=new T.LatheGeometry(np,28);ng.rotateX(Math.PI/2);
    const eng=new T.Group();eng.position.set(5.75,-1.42,5.4+wz*0.2);wing.add(eng);eng.rotation.z=-s*0.0;
    const nac=new T.Mesh(ng,orange);nac.castShadow=true;eng.add(nac);
    const lip=new T.Mesh(new T.TorusGeometry(1.03,0.09,10,28),metal);eng.add(lip);
    const fan=new T.Mesh(new T.CircleGeometry(1.0,28),dark);fan.position.z=-0.25;eng.add(fan);
    const sp=new T.Mesh(new T.ConeGeometry(0.28,0.55,16),metal);sp.rotation.x=Math.PI/2;sp.position.z=-0.05;eng.add(sp);
    const plug=new T.Mesh(new T.ConeGeometry(0.5,1.5,18),dark);plug.rotation.x=-Math.PI/2;plug.position.z=-5.1;eng.add(plug);
    const py=new T.Mesh(new T.BoxGeometry(0.34,1.0,4.3),white);py.position.set(0,1.05,-2.6);py.rotation.x=0.08;eng.add(py);});
  // ---- tailplane + fin (with dorsal fillet) ----
  const stS=new T.Shape();[[0.3,-13.2],[6.3,-16.9],[6.3,-18.3],[0.3,-17.2]].forEach((p,i)=>i?stS.lineTo(p[0],-p[1]):stS.moveTo(p[0],-p[1]));stS.closePath();
  const stG=new T.ExtrudeGeometry(stS,{depth:0.28,bevelEnabled:true,bevelThickness:0.05,bevelSize:0.06,bevelSegments:2});stG.rotateX(-Math.PI/2);stG.translate(0,-0.14,0);
  [1,-1].forEach(s=>{const st=new T.Mesh(stG,greyW);st.scale.x=s;st.position.y=0.95;st.rotation.z=s*0.1;st.castShadow=true;g.add(st);});
  const finPts=[[-10.0,0],[-18.9,0],[-19.4,5.9],[-17.3,5.9],[-13.4,1.3]];
  const fs=new T.Shape();finPts.forEach((p,i)=>i?fs.lineTo(-p[0],p[1]):fs.moveTo(-p[0],p[1]));fs.closePath();
  const fgm=new T.ExtrudeGeometry(fs,{depth:0.34,bevelEnabled:true,bevelThickness:0.06,bevelSize:0.07,bevelSegments:2});fgm.translate(0,0,-0.17);fgm.rotateY(Math.PI/2);
  const fin=new T.Mesh(fgm,orange);fin.position.y=R*0.96;fin.castShadow=true;g.add(fin);
  {const outline=finPts.map(p=>[-p[0],p[1]]),bb=[Math.min(...outline.map(p=>p[0])),Math.max(...outline.map(p=>p[0])),0,5.9];
   [false,true].forEach(m=>{const ft=_a320Fin[m?1:0]||(_a320Fin[m?1:0]=finTex(bb,m));const d=finDecal(outline,m);const geo=d.g;geo.rotateY(m?-Math.PI/2:Math.PI/2);const me=new T.Mesh(geo,new T.MeshStandardMaterial({map:ft,transparent:true,roughness:0.4,depthWrite:false,polygonOffset:true,polygonOffsetFactor:-2}));
     me.position.set(m?-0.26:0.26,R*0.96,0);g.add(me);});}
  // ---- landing gear ----
  if(opts.gear!==false){const tyre=new T.MeshStandardMaterial({color:0x17181a,roughness:0.9}),hubM=new T.MeshStandardMaterial({color:0xd0d4d8,roughness:0.4,metalness:0.6});const gg=new T.Group();g.add(gg);
    const wheel=(r,w,x,y,z)=>{const t=new T.Mesh(new T.CylinderGeometry(r,r,w,18),tyre);t.rotation.z=Math.PI/2;t.position.set(x,y,z);gg.add(t);const h=new T.Mesh(new T.CylinderGeometry(r*0.55,r*0.55,w+0.02,14),hubM);h.rotation.z=Math.PI/2;h.position.set(x,y,z);gg.add(h);};
    [3.8,-3.8].forEach(x=>{const leg=new T.Mesh(new T.CylinderGeometry(0.13,0.13,2.6,10),metal);leg.position.set(x,-2.35,0.3);gg.add(leg);
      const br=new T.Mesh(new T.CylinderGeometry(0.07,0.07,2.3,8),metal);br.position.set(x*0.8,-2.2,0.3);br.rotation.z=x>0?0.6:-0.6;gg.add(br);
      wheel(0.57,0.38,x+0.45,-3.53,0.3);wheel(0.57,0.38,x-0.45,-3.53,0.3);});
    const nl=new T.Mesh(new T.CylinderGeometry(0.1,0.1,2.2,8),metal);nl.position.set(0,-2.75,z1-5.3);gg.add(nl);
    wheel(0.37,0.24,0.2,-3.73,z1-5.3);wheel(0.37,0.24,-0.2,-3.73,z1-5.3);g.userData.gear=gg;}
  // ---- lights ----
  const lamp=(c,x,y,z,r)=>{const l=new T.Mesh(new T.SphereGeometry(r||0.14,8,6),new T.MeshBasicMaterial({color:c}));l.position.set(x,y,z);g.add(l);return l;};
  lamp(0xff2020,17.6,0.4,-2.4);lamp(0x20ff40,-17.6,0.4,-2.4);lamp(0xffffff,0,1.4,z0+0.2,0.12);
  g.userData.beacon=lamp(0xff3030,0,R+0.1,-2);lamp(0xff3030,0,-R-0.35,-1);
  g.userData.gearDrop=A320.gearDrop;
  return g;}

// ===================== INTRO SHOT 2: approach over the real Costa de la Luz (OpenStreetMap coastline) =====================
const GEO_F={"land":[-7192,12330,-10222,19212,-1269,25328,34544,25328,34544,-12478,18617,-21685,18386,-21685,18362,-21757,18322,-21683,18141,-21709,18039,-21659,17949,-21711,17932,-21624,17772,-21598,17571,-21453,17166,-21429,16586,-21148,16055,-21021,15770,-20817,15645,-20785,15432,-20842,14796,-20661,14322,-20646,14165,-20703,13915,-21028,13911,-21167,13564,-21246,13404,-21060,13302,-20550,13007,-19959,12424,-19199,12242,-19160,11843,-18763,11694,-18370,11386,-17899,10733,-16419,10283,-15670,10162,-15591,9501,-14275,9110,-12947,8607,-11689,8504,-11510,8425,-11551,8415,-11275,7566,-9933,7375,-9692,7271,-9700,7080,-9416,6953,-9365,6453,-8781,6257,-8665,6032,-8728,5829,-8599,5707,-8631,4891,-8383,4694,-8422,4698,-8487,4518,-8555,4495,-8648,4321,-8366,4231,-8527,4307,-8641,4400,-8645,4417,-8816,4531,-8804,4548,-8723,4608,-8816,4400,-8853,4205,-8577,3953,-8546,3343,-7550,3244,-7510,3204,-7365,3121,-7323,3060,-7070,3003,-7068,2635,-5867,2015,-4397,1616,-2980,986,-1551,417,-551,-218,103,-444,268,-970,468,-1346,750,-1787,1217,-1976,1521,-2077,1527,-2386,1987,-2545,2024,-2796,2261,-2857,2540,-2847,3105,-2995,3684,-3522,5059,-4104,6270,-4385,7268,-4690,7692,-5287,8234,-5483,8489,-5674,8500,-5715,8557,-5760,8844,-5972,9504,-6084,9644,-6041,9680,-6235,10251,-6408,10528,-6636,11216],"islet":[-3082,978,-2976,964,-2964,1004,-3002,1015,-3001,1027,-2970,1026,-2949,1005,-2966,963,-3026,917,-3009,790,-3022,781,-3000,779,-3062,761,-3067,740,-3124,719,-3161,729,-3182,715,-3236,717,-3254,731,-3200,735,-3173,771,-3187,853,-3189,1002,-3226,1152,-3243,1174,-3280,1296,-3412,1859,-3438,1902,-3395,1894,-3379,1878,-3378,1816,-3360,1776,-3370,1765,-3350,1704,-3325,1702,-3317,1646,-3330,1636,-3308,1516,-3301,1504,-3283,1526,-3276,1501,-3284,1426,-3246,1284,-3229,1260,-3217,1210,-3222,1170,-3169,971,-3106,1005,-3115,1026,-3098,1046,-3082,1013],"forest":[[1055,-1156,1167,-1061,1203,-887,1174,-847,1561,-550,1696,-553,1761,-1064,1323,-1239,1148,-1233],[-1097,744,-489,431,-506,394,-581,337,-1104,570,-1345,785,-1359,919,-1780,1398,-1780,1460,-1609,1420,-1355,1022],[-286,1344,-88,1236,148,1279,215,1058,-9,1114,-42,1012,-164,1069,-128,1151,-313,1269],[1521,-1721,1610,-1958,1448,-1852,1280,-1816,1229,-1612,1443,-1737],[1546,-1747,1809,-1690,1896,-1746,1930,-1849,1875,-1858,1898,-1967,1625,-1879],[4553,-7921,4310,-8123,4119,-7994,4037,-7833,4137,-7428,4040,-7251,4465,-7136,4331,-6863,4123,-6713,4246,-6393,4077,-6284,4109,-6196,4062,-6101,4145,-6052,4138,-5969,4031,-5962,4130,-5825,3960,-5368,3614,-5488,3551,-5316,3168,-5454,2993,-5300,2968,-5121,2915,-5062,4089,-4449,4510,-4472,4535,-4350,4495,-4142,4534,-4058,4653,-4470,4792,-4508,5032,-4479,5088,-4610,5245,-4764,5495,-4521,6079,-4427,6282,-4456,6809,-4150,7128,-4122,7856,-3835,7940,-3771,7863,-3548,7929,-3539,8003,-3742,8079,-3695,8072,-3842,8192,-3835,8258,-4018,8342,-3988,8456,-4308,8183,-4420,8317,-4591,8380,-4767,7424,-5446,7034,-5085,6745,-5063,6776,-5015,6486,-4967,6486,-4906,6119,-4873,5965,-4706,5802,-4702,5635,-4812,5504,-5077,5368,-5040,5251,-4873,5143,-4908,4895,-5202,4690,-5321,4720,-5518,4938,-5475,5007,-5561,4882,-5721,5118,-5913,5164,-5763,5128,-5621,5355,-5692,5750,-6094,5770,-6307,5506,-6392,5583,-6851,5737,-6932,5581,-6978,5574,-7128,5408,-7151,5175,-7325,5114,-7297,5106,-7210,4902,-7220,4881,-7341,5010,-7425,5063,-7640,5023,-7780,4932,-7790,4818,-7720,4832,-7848,4746,-7695,4851,-8056,4703,-8234,4377,-8138,4429,-8054,4642,-7935],[4529,-4378,4483,-4474,4087,-4444,3475,-4755,3403,-4619,3244,-4498,3339,-4330,3204,-3993,3502,-3955,3601,-3769,3857,-3901,4286,-3828,4249,-3945,4423,-3927,4423,-3824,4468,-3795,4529,-4042,4489,-4157],[3126,-6280,3645,-6091,3676,-6177,3158,-6367]],"wet":[[-5,1283,-106,1250,-208,1282,-265,1362,-91,1504,105,1449,166,1313,121,1270,4,1258,104,1334,94,1414,6,1428,-53,1421,-134,1299],[-339,1614,-211,1618,-170,1666,-95,1629,-158,1477,-240,1430,-229,1573,-148,1525,-231,1593,-292,1399],[-82,1882,-133,1995,-83,2047,-237,2112,-207,2186,-250,2272,-28,2469,-53,2823,4,2980,-118,3085,-190,3074,-347,3004,-450,2853,-623,2860,-805,3147,-805,3461,-866,3599,-1018,3742,-762,3786,-733,3874,-595,3889,-525,4008,-479,4350,-272,4100,58,3985,273,3797,496,3394,508,3109,719,3017,672,2723,816,2628,766,2507,663,2418,781,2465,478,2292,254,2249,13,1811],[-1674,3271,-1640,3570,-1554,3549,-1409,3410,-1237,3407,-1164,3441,-1141,3521,-1247,3640,-1046,3605,-933,3501,-873,3105,-789,2922,-659,2799,-812,2898,-905,2844,-969,2873,-1077,2839,-1047,2679,-1124,2337,-1196,2354,-1327,2526,-1442,2471,-1504,2494,-1654,2797,-1575,2921,-1450,2972,-1590,2962,-1668,2872,-1843,2899],[-1369,1782,-1500,2058,-1413,2082,-1352,1982,-1383,2091,-1298,2130,-1201,1875,-1265,1835,-1326,1935,-1288,1827],[-1429,1525,-1418,1463,-1091,1389,-1104,1308,-1162,1286,-1440,1456],[-659,1479,-528,1658,-404,1618,-441,1489,-561,1434],[-1714,2059,-1619,2055,-1519,1805,-1599,2057,-1516,2050,-1388,1775,-1467,1732,-1504,1784,-1490,1722,-1526,1706,-1687,1741,-1739,1915],[-1065,1608,-1224,1647,-1095,1814,-1039,1748],[-785,1525,-810,1713,-559,1664,-685,1481],[-1573,2387,-1670,2300,-1633,2087,-1712,2083,-1701,2417,-1597,2460],[-1240,1651,-1404,1700,-1149,1855,-1454,1716,-1156,1864,-1110,1817],[-1421,2212,-1331,2138,-1510,2079,-1596,2335,-1529,2390,-1416,2262],[-971,1532,-1051,1602,-1018,1756,-856,1748,-857,1695,-994,1705,-892,1569,-832,1676,-809,1524],[-1109,2353,-1055,2474,-1039,2772,-956,2762,-932,2714,-989,2547,-948,2604,-831,2493,-657,2469,-630,2417,-787,2317,-929,2318,-1011,2220,-1036,2306],[-148,2002,-111,1873,-150,1953,-153,1983,-145,2027,-354,2106,-398,2220,-358,2414,-308,2393,-264,2447,-236,2378,-194,2397,-169,2480,-222,2465,-222,2539,-148,2616,-180,2675,-221,2641,-209,2768,-277,2851,-372,2827,-271,2969,-149,3023,-30,2960,-76,2824,-52,2498,-161,2451,-272,2269,-227,2204,-254,2099,-101,2042],[-1388,2413,-1317,2442,-1219,2282,-1113,2212,-1139,2152,-1189,2222,-1354,2271],[-479,2138,-370,2117,-299,2043,-504,1977,-553,2023,-487,2061],[-531,2208,-465,2420,-409,2418,-366,2133],[-992,2217,-919,2307,-776,2298,-799,2133,-872,2152,-927,2076],[-943,2619,-797,2882,-629,2747,-674,2493,-735,2487],[-721,1860,-702,1987,-650,1902,-644,1978,-517,1973,-553,1804],[-760,2289,-684,2383,-526,2364,-557,2184,-495,2142,-498,2086,-713,2055,-788,2146],[-650,2489,-602,2731,-288,2838,-229,2759,-229,2630,-172,2608,-358,2541,-549,2382,-604,2391],[-361,1903,-495,1969,-226,2050,-158,2026,-51,1699,-362,1744,-418,1827]],"golf":[[2216,-2235,2551,-1985,2747,-2152,2785,-2210,2736,-2257,2719,-2603,2763,-2760,2903,-2945,2892,-3006,2628,-2885,2445,-2622,2397,-2397,2511,-2392,2574,-2234,2519,-2230,2425,-2371,2247,-2398,2230,-2814,2606,-2991,2655,-3089,2229,-3094,2003,-2941,1967,-2864,2059,-2838,2066,-2790,1863,-2362,2007,-2413,2161,-2743,2186,-2419,1940,-2368,2091,-2329,2072,-2284,2195,-2316],[2398,-2130,2007,-2265,1926,-2130,2010,-2078,1992,-2028,2056,-1957,1911,-1833,1896,-1746,1809,-1690,1540,-1719,1531,-1616,1814,-1497,1733,-1335,1533,-1168,1765,-1100,2013,-1191,1976,-1313,2187,-1454,2187,-1547,1921,-1373,1888,-1397,1926,-1646,2151,-1957,2183,-1943,2158,-1756,2090,-1656,2078,-1513,2174,-1548,2304,-1982]],"res":[[1903,2686,2290,2535,2829,2438,3374,2415,3347,2342,3432,2316,3278,1835,3225,1725,3027,1772,3032,1473,2728,1487,2276,1640,2206,1649,2197,1580,2058,1624,2108,1935,2050,1939,2062,2093,2008,2113,2068,2263,1973,2297,1942,2237,1886,2257,1914,2324,1525,2444,1562,2614,1721,2672,1884,2639],[-1953,2316,-2082,2369,-1873,2712,-1762,2614],[2007,-2413,2186,-2419,2161,-2743,2135,-2753],[2362,-2426,2397,-2397,2445,-2622,2607,-2862,2734,-2964,2699,-3011,2417,-2657],[1976,-1313,2013,-1191,2227,-1381,2318,-1591,2205,-1564,2187,-1454],[2158,-1927,2040,-1540,2078,-1513,2090,-1656,2158,-1756,2183,-1943,2151,-1957,1926,-1646,1888,-1397,1921,-1373,2098,-1503,1910,-1412,1955,-1618],[2187,-1562,2322,-1604,2375,-1794,2275,-1839],[561,1646,1024,1534,1076,1616,1224,1592,1167,1501,1318,1469,1265,1264,1070,1303,1044,1215,1250,1179,1212,1070,1003,1086,931,1128,954,1205,875,1230,782,955,907,915,987,1016,1075,1001,1089,905,1126,904,993,697,906,693,882,866,801,756,737,825,674,795,683,835,593,869,642,878,671,977,559,973,542,909,354,962,246,1104,300,1461,180,1480,-6,1691,558,2121,520,2203,764,2396,823,2394,869,2485,814,2497,824,2565,973,2614,978,2651,681,2720,680,2899,821,2958,813,2998,655,3081,581,3031,571,3110,490,3156,537,3293,490,3484,661,3550,1113,3516,1171,3325,1303,3355,1347,3156,1673,3225,1655,2908,1696,2905,1701,2803,1754,2807,1759,2764,1620,2794,1547,2543,1455,2555,1434,2435,1518,2411,1451,2092,1185,2143,1154,2003,1278,1948,1141,1725,827,1780,774,1750,782,1790,642,1822],[2567,737,3722,650,3868,728,4078,587,4087,466,3319,15,3084,64,2984,-1,2892,9,2901,92,2833,93,2851,291,2587,363,2518,171,2610,171,2621,228,2679,212,2655,111,2382,155,2392,239,2343,246,2322,395,2446,393,2473,547,2576,532,2544,560],[1724,-234,1902,-264,1935,-380,1996,-310,2025,-357,2139,-365,2146,-272,2268,-329,2240,-417,2340,-484,2329,-617,2399,-620,2416,-762,2496,-606,2542,-598,2530,-688,2576,-680,2567,-532,2617,-590,2606,-678,2672,-686,2580,-1113,2755,-1156,2785,-1208,2799,-1155,2866,-1168,2873,-1236,2987,-1266,3016,-1201,2965,-1179,2984,-1118,2929,-1093,2908,-1143,2601,-1074,2610,-1028,2808,-1078,2807,-1033,2671,-1005,2685,-961,2748,-972,2778,-815,2711,-796,2696,-858,2645,-847,2702,-629,2812,-688,2855,-666,2790,-655,2825,-548,2590,-481,2411,-528,2507,-394,2739,-475,2800,-274,2569,-147,2794,-235,2858,-134,3002,-189,3016,-446,2922,-455,2917,-533,3069,-538,3056,-620,2950,-616,2931,-574,2803,-884,2838,-898,2921,-722,3065,-682,3081,-588,3325,-637,3343,-574,3418,-593,3408,-651,3330,-638,3310,-789,3469,-923,3450,-1010,3282,-872,3297,-821,3257,-874,3466,-1052,3414,-1252,3625,-1267,3617,-1317,3515,-1343,3240,-1282,3245,-1218,3333,-1195,3343,-1128,3210,-1079,3099,-1335,3383,-1410,3357,-1582,3301,-1556,3287,-1636,3210,-1660,3193,-1864,3125,-1855,3130,-1760,3030,-1708,2996,-1883,2938,-1890,2957,-1697,2853,-1733,2744,-1674,2805,-1653,2813,-1544,2914,-1586,2956,-1396,2921,-1350,2725,-1333,2732,-1266,2379,-1190,2407,-1068,2061,-1026,2079,-938,1943,-898,1903,-791,1931,-679,2056,-585,2111,-605,2138,-460,1973,-416,2010,-541,1990,-568,1911,-501,1882,-644,1696,-553,1561,-550,1174,-847,1203,-887,1167,-1061,1048,-1135,1211,-1261,1204,-1321,1419,-1334,1442,-1205,1529,-1159,1733,-1335,1814,-1497,1531,-1616,1521,-1721,1443,-1737,1298,-1664,1178,-1573,1105,-1410,1157,-1358,1119,-1314,1044,-1385,950,-1137,900,-1162,395,-386,-336,273,-543,304,-562,341,-489,431,-1097,744,-1355,1022,-1548,1413,-1491,1443,-1105,1266,-580,1417,-309,1368,-348,1276,-127,1146,-164,1069,-20,993,11,1025,185,790,367,928,511,753,1173,493,1191,295,1661,273,1840,177,1850,132,1606,195,1590,-67,1655,-68,1660,31,1735,28],[1493,2294,2062,2093,2050,1939,2108,1935,2058,1624,1604,1806,1451,1421,1306,1471]],"towns":[["chiclana",3560,5214],["conil",8742,-10582],["sanfernando",-1121,10280],["cadiz",-9783,17489],["novo",1865,-2193],["sanctipetri",-1895,2366],["barrosa",30,31]],"beach":[[[-2077,1527,-2005,1549,-1976,1521,-1920,1400,-1633,1028,-1135,571,-911,435,-444,268,-471,258,-40,-37,417,-551,613,-901,663,-953,816,-1245,818,-1299,927,-1494,986,-1551,1224,-2078,1512,-2798,1616,-2980,1759,-3391,2015,-4397,2157,-4671,2249,-4984,2294,-5047,2554,-5721,2635,-5867,2633,-5924,2712,-6126,2750,-6313,2905,-6745,2876,-6779,2972,-6877,3019,-7011,3003,-7068,3060,-7070,3121,-7222,3121,-7323,3204,-7365,3244,-7510,3343,-7550,3335,-7602,3357,-7645,3409,-7671,3452,-7731,3490,-7854,3607,-8048,3727,-8135,3755,-8207,3745,-8242,3851,-8371,3851,-8403,3953,-8546,4073,-8589,4179,-8563,4205,-8577,4400,-8853,4588,-8860,4608,-8816,4593,-8788,4555,-8781,4548,-8723,4531,-8804,4417,-8816,4383,-8764,4400,-8645,4307,-8641,4231,-8527,4277,-8408,4321,-8366,4371,-8467,4483,-8579,4495,-8648,4518,-8555,4698,-8487,4694,-8422,4800,-8383,4891,-8383,5078,-8448,5210,-8450,5531,-8569,5572,-8551,5685,-8601,5707,-8631,5782,-8592,5829,-8599,6032,-8728,6121,-8679,6225,-8653,6257,-8665,6453,-8781,6541,-8925,6625,-8976,6712,-9096,6846,-9210,6953,-9365,7080,-9416,7271,-9700,7304,-9714,7333,-9668,7375,-9692,7566,-9933,7709,-10182,7911,-10451,8014,-10675,8205,-10929,8415,-11275,8447,-11343,8393,-11457,8425,-11551,8448,-11559,8504,-11510,8607,-11689,8894,-12359,9110,-12947,9501,-14275,10150,-15487,10182,-15564,10162,-15591,10208,-15612,10225,-15665,10283,-15670,10733,-16419,10878,-16777,11140,-17261,11386,-17899,11694,-18370,11818,-18635,11843,-18763,11917,-18811,12089,-19038,12242,-19160,12318,-19198,12424,-19199,12691,-19606,13007,-19959,13099,-20105,13302,-20550,13399,-20847,13421,-21011,13404,-21060,13501,-21180,13496,-21201,13608,-21248,13911,-21167,13951,-21120,13907,-21063,13915,-21028,13994,-20902,14099,-20759,14241,-20667,14368,-20644,14796,-20661,15212,-20796,15432,-20842,15526,-20801,15645,-20785,15770,-20817,16055,-21021,16258,-21070,16337,-21113,16586,-21148,17166,-21429,17467,-21421,17571,-21453,17737,-21540,17772,-21598,17932,-21624,17924,-21686,17949,-21711,17966,-21676,17993,-21686,18039,-21659,18132,-21683,18141,-21709,18167,-21687,18210,-21704,18224,-21687,18265,-21713,18264,-21692,18322,-21683,18351,-21701,18362,-21757,18357,-21710,18386,-21685,18426,-21701,18447,-21681,18481,-21699,18486,-21677,18573,-21692,18630,-21674],[4584,-8456,4625,-8440,4620,-8375,4788,-8313,4903,-8313,5091,-8378,5224,-8381,5529,-8493,5571,-8474,5726,-8542,5770,-8519,5854,-8532,6034,-8647,6095,-8613,6229,-8580,6288,-8602,6503,-8730,6592,-8874,6674,-8924,6764,-9049,6898,-9163,6999,-9308,7126,-9359,7290,-9604,7309,-9574,7421,-9637,7624,-9894,7767,-10143,7971,-10415,8075,-10639,8263,-10889,8477,-11241,8524,-11343,8480,-11438,8522,-11401,8670,-11658,8959,-12333,9176,-12925,9566,-14248,10214,-15457,10255,-15557,10266,-15562,10278,-15599,10325,-15604,10796,-16388,10941,-16748,11203,-17231,11449,-17867,11755,-18336,11885,-18613,11906,-18720,11966,-18759,12140,-18989,12281,-19101,12335,-19129,12461,-19129,12747,-19563,13063,-19917,13161,-20072,13367,-20524,13467,-20831,13492,-21019,13483,-21046,13574,-21158,13613,-21174,13854,-21109,13831,-21080,13850,-21001,13936,-20862,14051,-20708,14215,-20600,14363,-20574,14809,-20591,15230,-20729,15425,-20769,15507,-20733,15649,-20714,15800,-20752,16085,-20956,16283,-21004,16359,-21045,16607,-21080,17181,-21359,17477,-21351,17598,-21388,17787,-21487,17815,-21534,18010,-21566,18006,-21597,18029,-21584,18144,-21613,18152,-21606,18189,-21621,18210,-21596,18253,-21623,18336,-21610,18354,-21621,18374,-21604,18411,-21619,18432,-21600,18432,-21596,18435,-21597,18435,-21597,18436,-21597,18568,-21620,18609,-21607]],[[-7702,13559,-7335,12770,-7192,12330,-6858,11696,-6761,11440,-6636,11216,-6500,10857,-6408,10528,-6235,10251,-6041,9680,-6084,9644,-6045,9657,-5972,9504,-5760,8844,-5715,8557,-5674,8500,-5554,8528,-5483,8489,-5287,8234,-4690,7692,-4485,7442,-4385,7268,-4244,6875,-4104,6270,-3693,5459,-3522,5059,-3210,4295,-2995,3684,-2847,3105,-2857,2540,-2796,2261,-2545,2024,-2444,1979,-2386,1987],[-7639,13588,-7269,12796,-7127,12357,-6794,11725,-6698,11470,-6572,11246,-6434,10879,-6343,10557,-6171,10281,-5960,9658,-5966,9653,-5907,9530,-5692,8860,-5648,8584,-5644,8579,-5544,8602,-5436,8543,-5235,8282,-4639,7741,-4427,7482,-4321,7297,-4177,6895,-4037,6295,-3630,5488,-3457,5086,-3144,4320,-2928,3704,-2777,3113,-2787,2547,-2732,2297,-2506,2083,-2434,2051,-2396,2056]]],"shallow":[-6645,10057,-10634,19031,-10640,19378,-10476,19584,-1401,25758,34756,25725,34918,25578,34994,25328,34994,-12478,34923,-12721,18800,-22096,18403,-22205,17824,-22144,17414,-21895,17010,-21851,15615,-21259,15356,-21285,14727,-21109,14427,-21099,14273,-21434,14055,-21593,13576,-21695,13323,-21626,13010,-21278,12873,-20697,12624,-20199,12167,-19604,11957,-19508,11442,-18966,10333,-16626,9783,-15834,9099,-14477,8684,-13095,8229,-11956,8014,-11735,7970,-11412,7198,-10194,6180,-9154,5945,-9170,5050,-8902,4772,-9235,4394,-9303,4154,-9230,3953,-9000,3624,-8853,2731,-7548,1582,-4519,1191,-3132,583,-1754,54,-823,-514,-238,-1205,85,-1645,414,-2661,1590,-3188,2040,-3424,3547,-4525,6111,-4796,7070,-5027,7391,-6105,8333]};
const GEO_X={"runway":[[0.0,0.0],[13.7,2304.0]],"terminal":[[[-519.2,1654.3],[-519.6,1592.1],[-528.2,1592.4],[-528.2,1566.0],[-529.1,1512.3],[-576.0,1512.6],[-575.8,1592.5],[-585.6,1592.6],[-584.8,1655.4],[-576.3,1655.3],[-576.2,1667.4],[-576.1,1675.0],[-574.9,1675.0],[-574.3,1737.7],[-573.6,1737.5],[-572.5,1737.4],[-528.0,1736.0],[-527.7,1730.1],[-528.2,1654.3]]],"apron":[[[-466.2,1713.9],[-347.6,1712.2],[-268.7,1712.2],[-255.9,1712.3],[-256.5,1619.6],[-258.2,1410.9],[-258.5,1331.3],[-467.8,1333.0],[-468.0,1388.5],[-468.4,1430.6],[-467.8,1474.1],[-467.1,1566.6],[-466.5,1654.0],[-466.7,1678.3]],[[-776.0,922.6],[-764.4,887.1],[-700.1,909.2],[-628.9,933.6],[-623.8,919.2],[-622.5,915.4],[-616.8,899.0],[-614.6,892.7],[-579.0,904.8],[-342.5,987.2],[-337.9,974.9],[-307.9,886.9],[-590.5,788.5],[-617.2,866.1],[-837.4,788.2],[-859.2,857.4],[-791.9,879.9],[-807.5,925.5],[-812.4,939.6],[-819.0,958.4],[-814.5,960.0],[-727.9,990.3],[-712.5,944.1]],[[-562.6,945.4],[-571.1,969.3],[-624.8,950.2],[-616.3,926.3],[-589.9,935.7]]],"bld":[[[-290.3,1860.0],[-274.3,1860.3],[-274.3,1890.9],[-290.0,1891.5]],[[-870.1,1624.8],[-857.1,1655.3],[-841.8,1648.8],[-854.8,1618.3]],[[-712.5,944.1],[-700.1,909.2],[-764.4,887.1],[-776.0,922.6]],[[-605.8,1400.6],[-596.0,1402.8],[-594.8,1397.5],[-604.6,1395.3]],[[490.9,1164.7],[488.4,1146.1],[508.0,1143.7],[510.3,1162.9]],[[-539.6,1505.4],[-539.5,1503.7],[-539.2,1497.7],[-535.8,1497.8],[-536.4,1505.5]],[[-563.4,1499.8],[-553.1,1500.0],[-552.9,1479.6],[-563.2,1479.4]],[[-578.8,1499.8],[-568.5,1499.7],[-568.7,1479.1],[-578.9,1479.2]],[[-554.1,1447.8],[-533.5,1448.2],[-533.2,1445.4],[-528.2,1445.5],[-528.5,1405.9],[-554.8,1406.4]],[[-519.6,1592.1],[-519.2,1654.3],[-502.8,1654.3],[-502.7,1591.9]],[[-963.2,1485.7],[-952.5,1487.8],[-952.6,1488.5],[-941.2,1490.5],[-939.9,1482.9],[-948.9,1481.4],[-947.6,1475.1],[-960.6,1472.5]],[[-765.5,1091.8],[-775.0,1088.7],[-779.6,1102.4],[-757.2,1109.8],[-756.1,1106.7],[-755.1,1107.0],[-748.0,1085.5],[-761.8,1080.9]],[[-748.0,1085.5],[-755.1,1107.0],[-740.8,1111.8],[-733.6,1090.2]],[[-584.8,1026.1],[-575.3,1029.4],[-565.4,1001.0],[-574.9,997.7]],[[-514.0,1136.8],[-506.8,1115.0],[-497.8,1118.1],[-499.4,1122.9],[-489.1,1126.5],[-481.6,1104.6],[-491.9,1101.1],[-493.9,1106.9],[-503.1,1103.8],[-494.3,1077.0],[-504.8,1073.5],[-513.7,1100.2],[-518.8,1098.5],[-522.5,1109.7],[-517.4,1111.5],[-526.8,1140.0],[-516.2,1143.5],[-511.6,1145.0],[-509.4,1138.3]],[[-600.3,1053.0],[-522.0,1079.2],[-518.3,1068.1],[-596.6,1041.9]],[[-526.5,1306.2],[-518.8,1308.7],[-515.5,1298.4],[-523.2,1296.0]],[[-534.6,1303.7],[-517.3,1252.0],[-528.6,1248.2],[-545.9,1299.9]],[[-664.6,1124.1],[-653.7,1128.1],[-665.4,1159.8],[-654.3,1163.8],[-651.0,1154.9],[-642.5,1158.0],[-639.1,1148.9],[-648.1,1145.6],[-639.4,1122.0],[-660.9,1114.1]],[[-652.8,1004.5],[-599.1,1020.1],[-590.6,990.7],[-644.3,975.2]],[[-624.8,1105.8],[-601.9,1040.3],[-618.3,1034.6],[-621.1,1042.6],[-617.8,1043.8],[-624.1,1061.6],[-630.1,1059.5],[-635.5,1074.8],[-629.1,1077.0],[-634.6,1092.6],[-639.3,1090.9],[-642.3,1099.6]],[[-403.6,1229.6],[-415.9,1225.4],[-421.2,1240.6],[-408.8,1244.8]],[[-646.3,1561.1],[-646.9,1516.2],[-636.7,1516.1],[-636.1,1561.0]],[[-646.5,1566.9],[-636.5,1566.8],[-636.1,1616.5],[-646.1,1616.6]],[[-630.7,1571.2],[-620.5,1571.2],[-620.4,1616.4],[-630.7,1616.4]],[[-661.7,1616.6],[-651.5,1616.6],[-651.8,1571.6],[-661.8,1571.6]],[[-661.8,1556.7],[-651.7,1556.4],[-652.0,1541.4],[-652.3,1526.5],[-662.5,1526.7]],[[-631.3,1526.4],[-621.1,1526.3],[-620.8,1556.2],[-631.0,1556.3]],[[-661.5,1631.7],[-651.7,1631.7],[-651.5,1666.7],[-661.4,1666.8]],[[-646.1,1631.7],[-636.2,1631.7],[-636.0,1666.7],[-645.9,1666.8]],[[-630.6,1631.3],[-620.7,1631.3],[-620.5,1666.3],[-630.4,1666.4]],[[-614.7,1689.0],[-609.2,1689.0],[-609.3,1737.0],[-614.8,1737.0]],[[-630.6,1679.3],[-620.7,1679.1],[-619.7,1748.3],[-629.6,1748.5]],[[-645.8,1680.1],[-636.1,1680.1],[-635.7,1750.1],[-645.4,1750.2]],[[-661.1,1744.2],[-651.0,1744.2],[-651.0,1679.9],[-661.2,1679.9]],[[-671.2,1727.4],[-666.8,1727.3],[-667.4,1672.0],[-671.8,1672.0]],[[-688.7,1745.7],[-682.2,1750.8],[-675.6,1742.4],[-682.0,1737.3]],[[-751.3,1562.9],[-741.1,1562.7],[-741.4,1540.5],[-751.5,1540.6]],[[-736.2,1562.5],[-726.0,1562.4],[-726.3,1540.2],[-736.4,1540.3]],[[-721.0,1562.4],[-710.9,1562.3],[-711.1,1540.0],[-721.3,1540.1]],[[-705.8,1562.6],[-695.7,1562.5],[-695.9,1540.3],[-706.0,1540.4]],[[-706.0,1567.3],[-696.2,1567.2],[-695.7,1617.6],[-705.4,1617.7]],[[-721.0,1567.4],[-711.3,1567.3],[-710.7,1617.7],[-720.5,1617.8]],[[-735.9,1567.7],[-726.1,1567.5],[-725.6,1618.0],[-735.3,1618.1]],[[-751.3,1567.5],[-741.6,1567.4],[-741.1,1617.9],[-750.8,1618.0]],[[-735.6,1634.2],[-725.8,1634.1],[-725.3,1684.6],[-735.0,1684.7]],[[-720.6,1634.3],[-710.8,1634.2],[-710.3,1684.6],[-720.0,1684.7]],[[-705.3,1634.3],[-695.6,1634.2],[-695.0,1684.7],[-704.8,1684.8]],[[-691.9,1548.6],[-691.7,1541.3],[-682.4,1541.5],[-682.6,1548.8]],[[-690.8,1567.3],[-685.7,1567.3],[-685.5,1615.5],[-690.4,1615.6]],[[-750.7,1628.2],[-750.8,1623.0],[-690.3,1622.3],[-690.3,1627.6]],[[-690.4,1615.6],[-690.3,1622.3],[-690.3,1627.6],[-689.7,1685.1],[-684.8,1685.0],[-685.5,1615.5]],[[-735.3,1690.2],[-725.4,1690.1],[-725.3,1719.9],[-730.3,1719.9],[-730.4,1702.6],[-735.2,1702.6]],[[-720.0,1724.8],[-715.2,1724.7],[-715.2,1727.4],[-709.9,1727.3],[-710.5,1690.0],[-720.5,1690.2]],[[-705.1,1690.6],[-695.6,1690.4],[-694.8,1734.7],[-700.2,1734.8],[-700.3,1732.5],[-704.4,1732.6]],[[-689.8,1729.5],[-684.8,1729.4],[-685.3,1690.0],[-690.3,1690.1]],[[-591.2,1673.3],[-588.9,1673.3],[-588.6,1697.8],[-590.8,1697.8]],[[-671.0,1586.6],[-671.0,1580.7],[-665.5,1580.7],[-665.6,1586.7]],[[-616.2,1531.2],[-612.6,1526.1],[-608.1,1529.2],[-611.7,1534.3]],[[-584.0,1737.8],[-578.6,1737.7],[-574.3,1737.7],[-574.9,1675.0],[-576.1,1675.0],[-576.2,1667.4],[-576.3,1655.3],[-584.8,1655.4],[-584.1,1729.8]],[[-578.6,1737.7],[-578.8,1757.3],[-582.3,1757.5],[-613.9,1757.4],[-614.6,1759.6],[-578.9,1759.8],[-578.4,1793.2],[-573.5,1793.1],[-573.8,1760.0],[-538.5,1759.6],[-538.6,1757.1],[-573.8,1757.4],[-573.6,1737.5],[-574.3,1737.7]]],"taxi":[[[-212.3,1619.6],[-172.6,1619.1],[-133.4,1618.6],[-88.0,1619.4],[-33.9,1618.3],[-19.0,1622.9],[-9.6,1628.5],[-0.6,1637.5],[6.3,1649.7],[10.7,1673.6]],[[-258.2,1410.9],[-251.6,1411.0],[-201.1,1410.8],[-173.1,1410.5],[-142.5,1410.1],[-86.7,1409.9],[-30.1,1409.7],[-19.8,1412.1],[-10.7,1417.2],[-2.8,1425.3],[6.0,1438.6],[9.2,1456.0]],[[13.3,2253.0],[11.3,2265.1],[7.2,2274.2],[3.1,2280.4],[-6.6,2288.9],[-15.7,2292.4],[-26.1,2293.9],[-81.5,2294.0],[-127.3,2294.9],[-139.1,2293.4],[-148.9,2289.9],[-158.9,2282.1],[-165.4,2273.2],[-168.2,2258.7],[-170.6,1870.4],[-172.3,1661.9],[-176.4,1645.3],[-184.3,1633.4],[-196.4,1624.2],[-212.3,1619.6],[-249.8,1619.8],[-256.5,1619.6],[-318.3,1620.4],[-329.9,1617.4],[-340.6,1611.1],[-351.8,1597.3],[-356.7,1582.3],[-357.2,1449.4],[-352.8,1435.9],[-343.3,1423.2],[-332.5,1415.4],[-318.9,1412.0],[-258.2,1410.9]],[[-827.4,804.8],[-759.6,828.7],[-592.1,887.7],[-575.0,893.7],[-337.9,974.9],[-330.8,977.4],[-290.0,990.6],[-224.5,1013.0],[-207.4,1018.6],[-199.7,1022.3],[-193.1,1026.2],[-187.1,1031.9],[-181.9,1038.9],[-178.7,1045.8],[-176.1,1054.4],[-174.0,1046.1],[-171.4,1039.3],[-167.5,1032.2],[-161.6,1025.7],[-152.6,1019.1],[-145.4,1015.9],[-136.9,1013.4],[-90.5,1013.0],[-37.0,1012.6],[-24.9,1016.3],[-15.7,1021.6],[-7.9,1027.3],[-1.1,1036.3],[3.0,1046.6],[6.1,1061.0]],[[-142.5,1410.1],[-154.2,1406.6],[-163.3,1400.0],[-170.1,1390.3],[-173.3,1379.9],[-176.1,1054.4],[-176.1,1014.1],[-176.0,977.9],[-178.2,593.5],[-179.3,394.8],[-181.7,55.5],[-180.5,46.8],[-177.4,38.0],[-171.6,28.9],[-163.8,22.2],[-156.2,17.4],[-146.3,14.0],[-137.4,12.8],[-97.5,13.2],[-44.0,12.2],[-32.9,13.5],[-21.7,18.1],[-14.4,23.2],[-8.2,30.4],[-2.4,43.5],[0.4,60.5]],[[-33.9,1618.3],[-18.9,1614.6],[-10.0,1608.6],[-2.1,1600.9],[6.7,1586.9],[10.1,1566.6]],[[-172.3,1661.9],[-168.9,1646.7],[-160.9,1633.9],[-148.4,1624.1],[-133.4,1618.6]],[[-575.0,893.7],[-579.0,904.8],[-588.4,931.4],[-589.9,935.7]],[[-172.3,1661.9],[-172.6,1619.1],[-172.8,1578.8],[-172.9,1441.0],[-173.1,1410.5],[-173.3,1379.9],[-176.5,1390.3],[-182.3,1399.5],[-190.8,1406.3],[-201.1,1410.8],[-190.2,1415.6],[-182.3,1422.0],[-176.4,1430.5],[-172.9,1441.0]],[[-224.5,1013.0],[-216.7,1013.7],[-205.5,1014.6],[-176.1,1014.1],[-136.9,1013.4]],[[-30.1,1409.7],[-18.3,1406.0],[-10.2,1401.9],[-2.7,1394.9],[1.0,1389.3],[4.0,1383.7],[7.1,1375.1],[8.1,1364.6]],[[5.6,891.5],[-1.1,827.0],[-14.4,763.4],[-29.9,715.2],[-49.5,668.3],[-105.5,569.8],[-152.8,489.9],[-168.3,452.3],[-175.2,425.7],[-179.3,394.8]],[[-172.9,1441.0],[-169.5,1429.7],[-163.2,1420.7],[-154.2,1413.9],[-142.5,1410.1]],[[-105.5,569.8],[-111.9,562.8],[-117.7,558.5],[-125.5,555.1],[-133.4,553.1],[-141.6,553.3],[-148.7,554.6],[-155.5,556.9],[-162.3,561.0],[-168.2,566.5],[-173.3,574.0],[-177.1,583.9],[-178.2,593.5]],[[-212.3,1619.6],[-197.3,1614.8],[-185.7,1605.9],[-177.2,1594.1],[-172.8,1578.8],[-168.0,1593.8],[-159.9,1605.3],[-148.0,1614.0],[-133.4,1618.6]],[[-216.7,1013.7],[-207.8,1012.4],[-201.3,1010.4],[-194.7,1006.9],[-188.4,1002.1],[-183.9,996.8],[-179.8,989.3],[-177.8,982.9],[-176.0,977.9],[-173.2,985.2],[-170.1,991.7],[-165.0,998.2],[-161.1,1002.1],[-155.9,1006.4],[-151.3,1008.9],[-145.3,1011.4],[-136.9,1013.4]],[[-290.0,990.6],[-281.3,1002.2],[-278.4,1022.9],[-277.7,1041.6],[-272.1,1053.0],[-261.8,1062.4],[-241.4,1074.3],[-231.6,1085.7],[-223.8,1100.9],[-223.0,1118.6],[-221.3,1378.1],[-218.7,1394.6],[-211.0,1404.7],[-201.1,1410.8]],[[-759.6,828.7],[-800.1,951.4]],[[-37.0,1012.6],[-26.8,1010.2],[-18.1,1006.0],[-9.0,998.1],[-3.1,991.2],[1.7,981.3],[5.8,963.9]]]};
// aerial textures, tiled in real metres (uv = metres)
function aerialTex(size,draw,tile){const cv=document.createElement('canvas');cv.width=cv.height=size;const c=cv.getContext('2d');let sd=1234;const rnd=()=>((sd=(sd*16807)%2147483647)/2147483647);draw(c,size,rnd);
  const t=new T.CanvasTexture(cv);t.wrapS=t.wrapT=T.RepeatWrapping;t.encoding=T.sRGBEncoding;t.anisotropy=8;t.repeat.set(1/tile,1/tile);return t;}
// campiña: rectangular parcels from a rotated BSP split — stubble, ploughed earth, white albariza, vines, olives, sunflowers
function fieldsTex(seed,palette,tile){return aerialTex(2048,(c,s,rnd)=>{
  c.fillStyle=palette[0];c.fillRect(0,0,s,s);
  const parcels=[];const split=(x,y,w,h,d)=>{if((w<150&&h<150)||d>9||(d>3&&rnd()<0.12)){parcels.push([x,y,w,h]);return;}
    if(w>h*(0.8+rnd()*0.4)){const k=w*(0.3+rnd()*0.4);split(x,y,k,h,d+1);split(x+k,y,w-k,h,d+1);}else{const k=h*(0.3+rnd()*0.4);split(x,y,w,k,d+1);split(x,y+k,w,h-k,d+1);}};
  split(0,0,s,s,0);
  parcels.forEach(([x,y,w,h])=>{const kind=rnd(),col=palette[Math.floor(rnd()*palette.length)];c.fillStyle=col;c.fillRect(x,y,w,h);
    if(kind<0.35){c.strokeStyle='rgba(60,40,20,0.10)';c.lineWidth=1;const vert=rnd()<0.5;c.beginPath();for(let k=2;k<(vert?w:h);k+=4){if(vert){c.moveTo(x+k,y);c.lineTo(x+k,y+h);}else{c.moveTo(x,y+k);c.lineTo(x+w,y+k);}}c.stroke();}
    else if(kind<0.5){c.fillStyle='rgba(58,82,40,0.75)';for(let yy=y+4;yy<y+h-2;yy+=9)for(let xx=x+4+(yy%18?4:0);xx<x+w-2;xx+=9){c.beginPath();c.arc(xx,yy,2.6,0,Math.PI*2);c.fill();}}
    else if(kind<0.58){c.strokeStyle='rgba(70,90,40,0.55)';c.lineWidth=1.4;c.beginPath();for(let k=3;k<w;k+=5){c.moveTo(x+k,y);c.lineTo(x+k,y+h);}c.stroke();}
    c.strokeStyle='rgba(70,60,40,0.45)';c.lineWidth=1.5;c.strokeRect(x+0.5,y+0.5,w-1,h-1);});
  c.strokeStyle='rgba(225,210,175,0.8)';c.lineWidth=3;for(let i=0;i<5;i++){c.beginPath();let x=rnd()*s,y=0;c.moveTo(x,y);while(y<s){x+=(rnd()-0.5)*120;y+=120;c.lineTo(x,y);}c.stroke();}
  for(let i=0;i<14;i++){const x=rnd()*s,y=rnd()*s;c.fillStyle='#f6f2ea';c.fillRect(x,y,7,5);c.fillStyle='#b8643a';c.fillRect(x,y,7,2);c.fillStyle='rgba(50,70,35,0.8)';c.beginPath();c.arc(x+12,y+4,4,0,Math.PI*2);c.fill();}
  const g=c.createRadialGradient(s*0.3,s*0.6,50,s*0.3,s*0.6,s*0.8);g.addColorStop(0,'rgba(255,240,200,0.07)');g.addColorStop(1,'rgba(60,50,20,0.08)');c.fillStyle=g;c.fillRect(0,0,s,s);},tile);}
const pineCanopyTex=()=>aerialTex(512,(c,s,rnd)=>{c.fillStyle='#4d5a33';c.fillRect(0,0,s,s);for(let i=0;i<2600;i++){const x=rnd()*s,y=rnd()*s,r=3+rnd()*5;const g=c.createRadialGradient(x-1,y-1,0,x,y,r);g.addColorStop(0,['#6f8a48','#5d7a3c','#7c9450'][i%3]);g.addColorStop(1,'rgba(30,42,22,0.9)');c.fillStyle=g;c.beginPath();c.arc(x,y,r,0,Math.PI*2);c.fill();}},260);
const urbTex=()=>aerialTex(512,(c,s,rnd)=>{c.fillStyle='#b9b58c';c.fillRect(0,0,s,s);c.strokeStyle='#8c8a80';c.lineWidth=5;for(let k=0;k<s;k+=64){c.beginPath();c.moveTo(k+rnd()*6,0);c.lineTo(k,s);c.stroke();c.beginPath();c.moveTo(0,k);c.lineTo(s,k+rnd()*6);c.stroke();}
  for(let y=8;y<s;y+=32)for(let x=8;x<s;x+=32){if(rnd()<0.12)continue;c.fillStyle=['#f6f2ea','#efe6d6','#f3e3c8'][Math.floor(rnd()*3)];const w=10+rnd()*8,h=8+rnd()*6;c.fillRect(x,y,w,h);if(rnd()<0.5){c.fillStyle='#bd6a42';c.fillRect(x,y,w,h*0.5);}
    if(rnd()<0.55){c.fillStyle='#3fb6d4';c.fillRect(x+w+2,y+2,6,4);}c.fillStyle='rgba(60,90,40,0.8)';c.beginPath();c.arc(x+rnd()*20,y+16+rnd()*6,3+rnd()*2,0,Math.PI*2);c.fill();}},420);
const marshTex=()=>aerialTex(512,(c,s,rnd)=>{c.fillStyle='#8e9a78';c.fillRect(0,0,s,s);c.strokeStyle='#5f7f84';for(let i=0;i<40;i++){c.lineWidth=1+rnd()*3;c.beginPath();let x=rnd()*s,y=rnd()*s;c.moveTo(x,y);for(let k=0;k<12;k++){x+=(rnd()-0.5)*60;y+=(rnd()-0.5)*60;c.lineTo(x,y);}c.stroke();}
  for(let i=0;i<30;i++){c.fillStyle='rgba(220,225,215,0.7)';c.fillRect(rnd()*s,rnd()*s,20+rnd()*40,14+rnd()*20);}},900);
const golfTex=()=>aerialTex(512,(c,s,rnd)=>{c.fillStyle='#78a852';c.fillRect(0,0,s,s);for(let k=0;k<s;k+=32){c.fillStyle=k%64?'#83b35c':'#72a04c';c.fillRect(0,k,s,32);}for(let i=0;i<12;i++){c.fillStyle='#e8dcb0';c.beginPath();c.ellipse(rnd()*s,rnd()*s,8+rnd()*10,5+rnd()*6,rnd()*3,0,Math.PI*2);c.fill();}
  for(let i=0;i<30;i++){c.fillStyle='#3f5a2e';c.beginPath();c.arc(rnd()*s,rnd()*s,4+rnd()*4,0,Math.PI*2);c.fill();}},500);
function buildWingview(){
  wingview=new T.Group();wingview.visible=false;scene.add(wingview);
  const F=GEO_F;
  const shp=(flat,y)=>{const s=new T.Shape();s.moveTo(flat[0],flat[1]);for(let i=2;i<flat.length;i+=2)s.lineTo(flat[i],flat[i+1]);s.closePath();const g=new T.ShapeGeometry(s);g.rotateX(-Math.PI/2);g.translate(0,y,0);return g;}; // (E,N) → (x=E, z=-N)
  const layer=(geo,m,order)=>{const me=new T.Mesh(geo,m);me.renderOrder=order||0;wingview.add(me);return me;};
  const M=(opts)=>new T.MeshStandardMaterial(Object.assign({roughness:1,metalness:0},opts));
  // ocean: deep blue, gentle swell normals at a large scale (no moiré), turquoise shallows along the coast
  const sn=rippleN.clone();sn.needsUpdate=true;sn.repeat.set(240,240);
  const sea=new T.Mesh(new T.PlaneGeometry(90000,90000),M({color:0x165f86,roughness:0.28,metalness:0.35,normalMap:sn,normalScale:new T.Vector2(0.035,0.035)}));sea.rotation.x=-Math.PI/2;sea.position.y=-6;wingview.add(sea);wingview.userData.seaN=sn;
  layer(shp(F.shallow,-3),M({color:0x2f9fb4,roughness:0.3,metalness:0.2}));
  layer(shp(F.land,0),M({map:fieldsTex(7,['#c4a868','#b89a5c','#d8cba6','#e4dcc4','#8c9656','#a19a5e','#d6b35a','#9a7a52'],5200)}));
  layer(shp(F.islet,1),M({color:0xd8c8a0}));
  F.beach.forEach(([coast,inner])=>{const ring=coast.slice();for(let i=inner.length-2;i>=0;i-=2)ring.push(inner[i],inner[i+1]);layer(shp(ring,3),M({color:0xeadcb0,roughness:0.95}));});
  F.wet.forEach(f=>layer(shp(f,5),M({map:marshTex()})));
  F.res.forEach(f=>layer(shp(f,7),M({map:urbTex()})));
  F.golf.forEach(f=>layer(shp(f,9),M({map:golfTex()})));
  F.forest.forEach(f=>layer(shp(f,11),M({map:pineCanopyTex()})));
  // towns: white houses with terracotta roofs
  const im=new T.InstancedMesh(new T.BoxGeometry(1,1,1).translate(0,0.5,0),M({color:0xffffff,roughness:0.9}),2600),rf=new T.InstancedMesh(new T.BoxGeometry(1,1,1).translate(0,0.5,0),M({color:0xffffff,roughness:0.9}),2600),d=new T.Object3D(),col=new T.Color();let k=0;
  const SZ={chiclana:1500,conil:750,sanfernando:1700,cadiz:1100,novo:800,sanctipetri:300,barrosa:1000};
  F.towns.forEach(t=>{const r=SZ[t[0]]||600,n=Math.round(r/2.4);for(let i=0;i<n&&k<2600;i++){const a=Math.random()*Math.PI*2,rr=Math.sqrt(Math.random())*r;const x=t[1]+Math.cos(a)*rr,z=-(t[2]+Math.sin(a)*rr),ry=Math.random()*3;
    const w=12+Math.random()*22,dd=w*(0.6+Math.random()*0.6),h=6+Math.random()*(t[0]==='cadiz'?24:9);d.position.set(x,12,z);d.rotation.y=ry;d.scale.set(w,h,dd);d.updateMatrix();im.setMatrixAt(k,d.matrix);col.setHex([0xf6f2ea,0xefe6d6,0xf2e2c4,0xe9d2b0][k%4]);im.setColorAt(k,col);
    d.position.set(x,12+h,z);d.scale.set(w*1.02,1.2,dd*1.02);d.updateMatrix();rf.setMatrixAt(k,d.matrix);col.setHex(Math.random()<0.6?0xb8643a:0xd8d0c0);rf.setColorAt(k,col);k++;}});
  im.count=rf.count=k;wingview.add(im);wingview.add(rf);
  // a few fair-weather cumulus below and around (sprites, well clear of the camera path)
  const cm=new T.SpriteMaterial({map:clouds.length?clouds[0].material.map:null,transparent:true,opacity:0.85,depthWrite:false,fog:false});
  for(let i=0;i<22;i++){const s=new T.Sprite(cm);const a=Math.random()*Math.PI*2,r=1500+Math.random()*6000;s.position.set(-3600+Math.cos(a)*r,420+Math.random()*260,Math.sin(a)*r);const sc=500+Math.random()*700;s.scale.set(sc,sc*0.45,1);wingview.add(s);}
  const ac=airliner({gear:false});wingview.add(ac);wingview.userData.aircraft=ac;wingview.userData.t0=null;
}
function updateWingview(){
  const t=wingview.userData.time,p=Math.min(1,t/4.8),ac=wingview.userData.aircraft;
  // descending through ~900 m at ~150 m/s: in from the Atlantic over the Sancti Petri islet, towards Chiclana
  const hb=48*Math.PI/180,dE=Math.sin(hb),dN=Math.cos(hb),s=p*720;
  const E=-4600+dE*s,N=-600+dN*s,y=930-p*70;
  const x=E,z=-N,hx=dE,hz=-dN;
  scene.fog.density=0.00009;ac.position.set(x,y,z);ac.rotation.order='YXZ';ac.rotation.set(-0.035,Math.atan2(hx,hz),-0.06+0.04*Math.sin(t*0.6));
  const sx=hz,sz=-hx;                                   // starboard (right-hand) vector
  const o=0.5*(1-Math.cos(Math.min(1,t/4.8)*Math.PI));   // slow, eased orbit from rear-quarter to beam
  const back=62-20*o,side=34+14*o,up=14-4*o;
  cam.position.set(x-hx*back+sx*side,y+up,z-hz*back+sz*side);
  cam.lookAt(x+hx*55-sx*6,y-22,z+hz*55-sz*6);
  if(wingview.userData.seaN)wingview.userData.seaN.offset.x=t*0.002;
}

// ===================== INTRO SHOT 3: landing on runway 02 at Jerez (OpenStreetMap layout) =====================
function buildLanding(){
  landing=new T.Group();landing.visible=false;scene.add(landing);
  const S=0.65,X=GEO_X,rwLen=Math.hypot(X.runway[1][0],X.runway[1][1])*S,rwW=45*S;
  const tg=(flat)=>{const s=new T.Shape();flat.forEach((p,i)=>i?s.lineTo(p[0]*S,p[1]*S):s.moveTo(p[0]*S,p[1]*S));s.closePath();const g=new T.ShapeGeometry(s);g.rotateX(-Math.PI/2);return g;};
  // campiña jerezana: cereal, vines on white albariza, sunflowers
  const ft=fieldsTex(3,['#c9b07a','#b89c62','#d8cda8','#e9e2cc','#8f9a5a','#a8a060','#d7b95a','#7e8c52']);ft.repeat.set(9,9);
  const ground=new T.Mesh(new T.PlaneGeometry(9000,9000),new T.MeshStandardMaterial({map:ft,roughness:1}));ground.rotation.x=-Math.PI/2;ground.position.set(0,-0.3,-1500);ground.receiveShadow=true;landing.add(ground);
  const grass=new T.Mesh(new T.PlaneGeometry(260,rwLen+600),new T.MeshStandardMaterial({color:0x9aa65e,roughness:1}));grass.rotation.x=-Math.PI/2;grass.position.set(-60,-0.2,-rwLen/2);landing.add(grass);
  // runway: asphalt, edge + centre lines, piano keys, "02", touchdown zone, aiming points
  const asph=mkTex((c,s)=>{c.fillStyle='#4a4d52';c.fillRect(0,0,s,s);_speck(c,s,9000,30,2);},1,1);asph.repeat.set(2,rwLen/30);
  const rw=new T.Mesh(new T.PlaneGeometry(rwW,rwLen),new T.MeshStandardMaterial({map:asph,roughness:0.85}));rw.rotation.x=-Math.PI/2;rw.position.set(0,0,-rwLen/2);rw.receiveShadow=true;landing.add(rw);
  const wm=new T.MeshStandardMaterial({color:0xf2f2ee,roughness:0.7});const paint=(w,l,x,z)=>{const m=new T.Mesh(new T.PlaneGeometry(w,l),wm);m.rotation.x=-Math.PI/2;m.position.set(x,0.03,z);landing.add(m);};
  paint(0.6,rwLen,-rwW/2+0.6,-rwLen/2);paint(0.6,rwLen,rwW/2-0.6,-rwLen/2);
  for(let z=-120;z>-rwLen+40;z-=33)paint(0.6,20,0,z);
  for(let i=0;i<6;i++){paint(1.1,19.5,-2.2-i*2.2,-12);paint(1.1,19.5,2.2+i*2.2,-12);}
  {const cv=document.createElement('canvas');cv.width=128;cv.height=128;const c=cv.getContext('2d');c.fillStyle='#fff';c.font='bold 112px Arial';c.textAlign='center';c.fillText('02',64,108);
   const tx=new T.CanvasTexture(cv);const m=new T.Mesh(new T.PlaneGeometry(12,16),new T.MeshStandardMaterial({map:tx,transparent:true,roughness:0.7}));m.rotation.set(-Math.PI/2,0,Math.PI);m.position.set(0,0.035,-38);landing.add(m);}
  [-100,-195].forEach((z,j)=>{[-1,1].forEach(s=>{for(let k=0;k<(j?1:3);k++)paint(j?3.2:1.2,j?29:14.6,s*(j?6.2:5+k*1.8),z);});});
  // lights: edge, threshold (green), approach bars, PAPI
  const lampG=new T.SphereGeometry(0.22,6,5);const ledge=new T.InstancedMesh(lampG,new T.MeshBasicMaterial({color:0xfff2c8}),200),d=new T.Object3D();let n=0;
  for(let z=0;z>-rwLen;z-=39){[-1,1].forEach(s=>{d.position.set(s*(rwW/2+1),0.3,z);d.updateMatrix();ledge.setMatrixAt(n++,d.matrix);});}ledge.count=n;landing.add(ledge);
  for(let x=-rwW/2;x<=rwW/2;x+=2.2){const l=new T.Mesh(lampG,new T.MeshBasicMaterial({color:0x40ff70}));l.position.set(x,0.3,1.2);landing.add(l);}
  for(let i=1;i<=9;i++){const z=i*20;const bar=new T.Mesh(new T.BoxGeometry(i%3?6:14,0.15,0.3),mat(0x2a2a2a));bar.position.set(0,0.6+i*0.02,z);landing.add(bar);
    for(let x=-(i%3?2.5:6.5);x<=(i%3?2.5:6.5);x+=1.25){const l=new T.Mesh(lampG,new T.MeshBasicMaterial({color:0xffffff}));l.position.set(x,0.8+i*0.02,z);landing.add(l);}
    const pole=cyl(0.1,0.1,0.8+i*0.02,0x6a6a6a,5);pole.position.set(0,0.4,z);landing.add(pole);}
  [0,1,2,3].forEach(k=>{const b=new T.Mesh(new T.BoxGeometry(1.2,0.8,1),mat(0xe8e8e8));b.position.set(-rwW/2-10-k*6,0.4,-195);landing.add(b);
    const l=new T.Mesh(new T.CircleGeometry(0.3,10),new T.MeshBasicMaterial({color:k<2?0xffffff:0xff3020}));l.position.set(-rwW/2-10-k*6,0.5,-194.49);landing.add(l);});
  // taxiways, aprons, terminal, tower, hangars — footprints from OSM
  const conc=new T.MeshStandardMaterial({color:0x8e9092,roughness:0.9});
  (X.apron||[]).forEach(a=>{const m=new T.Mesh(tg(a),conc);m.position.y=0.01;landing.add(m);});
  (X.taxi||[]).forEach(tw=>{for(let i=0;i+1<tw.length;i++){const a=tw[i],b=tw[i+1],dx=(b[0]-a[0])*S,dz=-(b[1]-a[1])*S,L2=Math.hypot(dx,dz);if(L2<0.5)continue;const m=new T.Mesh(new T.PlaneGeometry(15*S,L2+15*S),conc);m.rotation.x=-Math.PI/2;m.rotation.z=-Math.atan2(dx,-dz);m.position.set((a[0]+b[0])/2*S,0.015,-(a[1]+b[1])/2*S);landing.add(m);}});
  const termM=[new T.MeshStandardMaterial({color:0xe9e6df,roughness:0.8}),new T.MeshStandardMaterial({map:(()=>{const t=hotelTex.clone();t.needsUpdate=true;t.repeat.set(0.08,0.2);return t;})(),roughness:0.6})];
  X.terminal.forEach(f=>{const m=new T.Mesh(extrudeFlat(f.flatMap(p=>[p[0]*S,-p[1]*S]),9),termM);m.castShadow=true;landing.add(m);});
  X.bld.forEach(f=>{if(f.length<4)return;const m=new T.Mesh(extrudeFlat(f.flatMap(p=>[p[0]*S,-p[1]*S]),6),termM);landing.add(m);});
  {const tc=X.terminal[0],cx=tc.reduce((a,p)=>a+p[0],0)/tc.length*S+60,cz=-tc.reduce((a,p)=>a+p[1],0)/tc.length*S;
   const tw=cyl(2.6,3.2,26,0xeeeeea,12);tw.position.set(cx,13,cz);landing.add(tw);
   const cab=new T.Mesh(new T.CylinderGeometry(5,4.2,4,10),new T.MeshStandardMaterial({color:0x1d2a36,roughness:0.1,metalness:0.6}));cab.position.set(cx,28,cz);landing.add(cab);
   const rf=cyl(5.6,5.6,0.8,0xeeeeea,10);rf.position.set(cx,30.4,cz);landing.add(rf);}
  // windsock + distant Sierra de Grazalema on the eastern horizon + a few cortijo farmhouses
  {const ws=cyl(0.12,0.12,6,0xdddddd,5);ws.position.set(rwW/2+16,3,-60);landing.add(ws);const sock=new T.Mesh(new T.ConeGeometry(0.7,3.4,10,1,true),new T.MeshStandardMaterial({color:0xff6a13,side:T.DoubleSide}));sock.rotation.z=Math.PI/2;sock.position.set(rwW/2+17.6,5.6,-60);landing.add(sock);}
  {const P=[],I=[];const N2=90;for(let i=0;i<=N2;i++){const z=-7000+i*(12000/N2),h=120+Math.abs(Math.sin(i*0.37))*160+Math.abs(Math.sin(i*1.3+1))*70;P.push(4200,-5,z,4200+Math.sin(i)*80,h,z);if(i<N2){const b=i*2;I.push(b,b+2,b+1,b+1,b+2,b+3);}}
   const g=new T.BufferGeometry();g.setAttribute('position',new T.Float32BufferAttribute(P,3));g.setIndex(I);g.computeVertexNormals();landing.add(new T.Mesh(g,new T.MeshBasicMaterial({color:0x8a8cae,side:T.DoubleSide,fog:false})));}
  for(let i=0;i<14;i++){const x=(Math.random()<0.5?-1:1)*(160+Math.random()*1200),z=300-Math.random()*2600;const h=box(14,5,9,0xf7f3ea);h.position.set(x,2.5,z);landing.add(h);const r=new T.Mesh(new T.ConeGeometry(9,3,4),mat(0xb85a32));r.rotation.y=Math.PI/4;r.scale.z=0.65;r.position.set(x,6.5,z);landing.add(r);
    for(let k=0;k<4;k++){const t=new T.Mesh(new T.SphereGeometry(3,8,6),mat(0x5c6e3a));t.position.set(x+(Math.random()-0.5)*40,3,z+(Math.random()-0.5)*40);t.scale.y=0.8;landing.add(t);}}
  // tyre-smoke puffs
  const smk=[];const sm=new T.SpriteMaterial({map:clouds.length?clouds[0].material.map:null,color:0xdddddd,transparent:true,opacity:0,depthWrite:false});
  for(let i=0;i<6;i++){const s=new T.Sprite(sm.clone());s.scale.set(4,2,1);landing.add(s);smk.push(s);}landing.userData.smoke=smk;
  const ac=airliner();ac.scale.setScalar(0.65);landing.add(ac);landing.userData.aircraft=ac;landing.userData.t0=null;
}
function updateLanding(){
  const t=landing.userData.time,ac=landing.userData.aircraft;
  const td=2.6,v0=48;let z,y,pitch;
  const yg=A320.gearDrop*0.65;
  if(t<td){z=120-v0*t;const h=Math.max(0,z-(120-v0*td));y=yg+h*0.08+Math.pow(Math.max(0,td-t)/td,2)*1.5;pitch=0.04+0.07*Math.min(1,t/td);}
  else{const tt=Math.min(t-td,2.6);z=120-v0*td-(v0*tt-9*tt*tt);y=yg;pitch=Math.max(0,0.11-tt*0.1);}
  scene.fog.density=0.00035;ac.position.set(0,y,z);ac.rotation.order='YXZ';ac.rotation.set(-pitch,Math.PI,0);
  landing.userData.smoke.forEach((s,i)=>{const age=t-td-i*0.05;if(age<0||age>2){s.material.opacity=0;return;}s.position.set((i%2?1:-1)*2.5,0.8+age*1.5,z+age*8);s.scale.set(4+age*8,2+age*4,1);s.material.opacity=0.55*(1-age/2);});
  cam.position.set(-30,2.2,-14);cam.lookAt(ac.position.x*0.4,Math.max(2,y*0.7+1),z*0.7-4);
}

// ===================== FAMILY CHARACTERS =====================
// The family: edit names, looks and favourite activities here.
// Heights are world units (the villa door is ~3.2 tall).
const FAMILY_ORDER=['mum','dad','nana','papa','auntie','toddler'];
const ADULTS=['mum','dad','nana','papa','auntie'];
const FAMILY={
  mum:{name:'Mum',emoji:'👩',tag:'Runs the whole operation.',h:2.24,skin:0xf0c39a,hair:0x5a3420,hairStyle:'ponytail',
    top:{type:'dress',col:0xe0654f,pat:'dots',pat2:0xfff3e2},shoes:{type:'sandal',col:0xb07a48},sunnies:'head',
    build:{sh:0.95,waist:0.8,hip:1.06},loves:['lounge','sangria','sunset','jacuzzi'],sched:'parent',speed:3.3},
  dad:{name:'Dad',emoji:'👨',tag:'BBQ commander. Cannonball specialist.',h:2.42,skin:0xe9b68b,hair:0x3a281a,hairStyle:'short',
    top:{type:'tee',col:0x2c4f7c},bottom:{type:'shorts',col:0xf08a3c,pat:'hibiscus',pat2:0xffe7b8},shoes:{type:'slider',col:0x23262b},
    build:{sh:1.1,waist:1.0,hip:1.0},loves:['bbq','pool','sea','paella'],sched:'parent',speed:3.4},
  nana:{name:'Nana',emoji:'👵',tag:'Sunhat, paperback, endless snacks.',h:2.08,skin:0xf2cead,hair:0xe8e5df,hairStyle:'curly',
    top:{type:'dress',col:0x8f78c2,pat:'floral',pat2:0xfbeaff,sleeves:true},shoes:{type:'flat',col:0xf1ece2},hat:'sunhat',hatCol:0xead8a8,glasses:'round',glassCol:0x9a2f4a,
    build:{sh:0.94,waist:1.08,hip:1.12},stoop:0.08,cheeks:true,prop:'book',loves:['paella','sunset','sauna','ice'],sched:'nana',speed:2.6},
  papa:{name:'Papa',emoji:'👴',tag:'Socks with sandals. Stories for days.',h:2.2,skin:0xe6b289,hair:0xd4d1cc,hairStyle:'bald',moustache:true,
    top:{type:'polo',col:0x9cc4de},bottom:{type:'shorts',col:0xd6c197},shoes:{type:'sandal',col:0x5e4128},socks:0xf7f7f2,hat:'panama',hatCol:0xf0e4c4,glasses:'round',glassCol:0x2a2a2a,
    build:{sh:1.02,waist:1.14,hip:1.04},belly:true,stoop:0.12,prop:'paper',loves:['bbq','paella','stargaze','lounge'],sched:'papa',speed:2.5},
  auntie:{name:'Auntie',emoji:'💃',tag:'Fun auntie. Jacuzzi till late.',h:2.2,skin:0xd8a176,hair:0x1c1411,hairStyle:'long',
    top:{type:'tank',col:0x17b3a6},bottom:{type:'shorts',col:0xf7f2e8},shoes:{type:'trainer',col:0xffffff},glasses:'sun',earrings:true,
    build:{sh:0.94,waist:0.8,hip:1.04},prop:'glass',loves:['sangria','jacuzzi','pool','sunset'],sched:'auntie',speed:3.4},
  toddler:{name:'the little one',emoji:'👶',child:true,h:1.2,skin:0xf6d2b2,hair:0xc9a268,hairStyle:'tuft',
    top:{type:'tee',col:0xffd23f,pat:'stripes',pat2:0x2f7fbf},bottom:{type:'shorts',col:0x2f6f9e},shoes:{type:'bare'},hat:'bucket',hatCol:0xff7a59,cheeks:true}
};

// ---- geometry / material caches (shared by everyone) ----
const _geo={},_mat={};
const gc=(k,f)=>_geo[k]||(_geo[k]=f());
const mc=(k,f)=>_mat[k]||(_mat[k]=f());
const SPH=gc('sph',()=>new T.SphereGeometry(1,20,14)), SPHL=gc('sphl',()=>new T.SphereGeometry(1,10,7)), CUBE=gc('cube',()=>new T.BoxGeometry(1,1,1));
// tapered capsule hanging down from its top joint (y=0 → y=-len)
function capsuleGeo(r1,r2,len,rs){rs=rs||12;
  return gc('cap'+[r1,r2,len].map(v=>v.toFixed(3)).join('_')+'_'+rs,()=>{const pts=[],n=5;
    for(let i=0;i<=n;i++){const a=i/n*Math.PI/2;pts.push(new T.Vector2(Math.max(1e-4,Math.sin(a)*r1),Math.cos(a)*r1));}
    for(let i=0;i<=n;i++){const a=Math.PI/2+i/n*Math.PI/2;pts.push(new T.Vector2(Math.max(1e-4,Math.sin(a)*r2),-len+Math.cos(a)*r2));}
    return new T.LatheGeometry(pts.reverse(),rs);});}
function latheGeo(key,prof,seg){return gc(key,()=>new T.LatheGeometry(prof.map(p=>new T.Vector2(Math.max(1e-4,p[0]),p[1])),seg||20));}
// character colours are authored as sRGB hex → convert so they display true to the swatch
const lin=hex=>new T.Color(hex).convertSRGBToLinear();
const stdM=(col,rough,extra)=>mc('m'+col+'_'+rough+'_'+(extra?JSON.stringify(extra):''),()=>new T.MeshStandardMaterial(Object.assign({color:lin(col),roughness:rough==null?0.75:rough,metalness:0},extra||{})));
const skinM=col=>mc('skin'+col,()=>new T.MeshStandardMaterial({color:lin(col),roughness:0.55,emissive:lin(col).multiplyScalar(0.05)}));

// ---- fabric patterns (canvas) ----
function patternTex(kind,base,acc){
  return mc('pat'+kind+base+'_'+acc,()=>{
    const s=128,cv=document.createElement('canvas');cv.width=cv.height=s;const c=cv.getContext('2d');
    const hx=n=>'#'+n.toString(16).padStart(6,'0');let sd=11;const rnd=()=>((sd=(sd*16807)%2147483647)/2147483647);
    c.fillStyle=hx(base);c.fillRect(0,0,s,s);c.fillStyle=hx(acc);c.strokeStyle=hx(acc);
    const wrap=(f)=>{for(const ox of [-s,0,s])for(const oy of [-s,0,s])f(ox,oy);};
    if(kind==='dots'){for(let y=0;y<4;y++)for(let x=0;x<4;x++){c.beginPath();c.arc(((x+(y%2)*0.5)*32+8)%s,y*32+16,5,0,Math.PI*2);c.fill();}}
    else if(kind==='stripes'){for(let y=0;y<s;y+=32)c.fillRect(0,y,s,13);}
    else if(kind==='floral'){for(let i=0;i<16;i++){const x=rnd()*s,y=rnd()*s,rr=5+rnd()*4,rot=rnd()*6;
      wrap((ox,oy)=>{c.fillStyle=hx(acc);for(let k=0;k<5;k++){const a=rot+k*1.2566;c.beginPath();c.ellipse(x+ox+Math.cos(a)*rr*0.8,y+oy+Math.sin(a)*rr*0.8,rr*0.62,rr*0.38,a,0,Math.PI*2);c.fill();}
        c.fillStyle='#f6c945';c.beginPath();c.arc(x+ox,y+oy,rr*0.32,0,Math.PI*2);c.fill();});}}
    else if(kind==='hibiscus'){for(let i=0;i<7;i++){const x=rnd()*s,y=rnd()*s,rr=9+rnd()*5,rot=rnd()*6;
      wrap((ox,oy)=>{c.fillStyle='#2f7a4a';for(let k=0;k<2;k++){const a=rot+2+k*1.9;c.beginPath();c.ellipse(x+ox+Math.cos(a)*rr*1.3,y+oy+Math.sin(a)*rr*1.3,rr*0.9,rr*0.35,a,0,Math.PI*2);c.fill();}
        c.fillStyle=hx(acc);for(let k=0;k<5;k++){const a=rot+k*1.2566;c.beginPath();c.ellipse(x+ox+Math.cos(a)*rr*0.7,y+oy+Math.sin(a)*rr*0.7,rr*0.7,rr*0.5,a,0,Math.PI*2);c.fill();}
        c.fillStyle='#c0392b';c.beginPath();c.arc(x+ox,y+oy,rr*0.25,0,Math.PI*2);c.fill();});}}
    const t=new T.CanvasTexture(cv);t.wrapS=t.wrapT=T.RepeatWrapping;t.repeat.set(3,2);t.encoding=T.sRGBEncoding;t.anisotropy=4;return t;});}
function clothM(spec){if(!spec)return null;
  if(spec.pat)return mc('cloth'+spec.pat+spec.col+'_'+spec.pat2,()=>new T.MeshStandardMaterial({map:patternTex(spec.pat,spec.col,spec.pat2),roughness:0.85,side:T.DoubleSide}));
  return mc('clothc'+spec.col,()=>new T.MeshStandardMaterial({color:lin(spec.col),roughness:0.85,side:T.DoubleSide}));}

// soft round contact shadow under each character
const blobTex=radialTex(64,64,[[32,32,2,31,[[0,0.85],[0.55,0.35],[1,0]]]],[0,0,0]);
const blobMat=new T.MeshBasicMaterial({map:blobTex,transparent:true,depthWrite:false,opacity:0.5,polygonOffset:true,polygonOffsetFactor:-2,color:0x000000});
const blobGeo=(()=>{const g=new T.PlaneGeometry(1,1);g.rotateX(-Math.PI/2);return g;})();

// ---- build one jointed person ----
// joints: root > body > hips > spine > neck > head, shoulders > elbows > hands, hips > knees > ankles
function makePerson(def,opts){
  opts=opts||{};const lo=!!opts.lo;
  const H=def.h,ch=!!def.child,b=def.build||{};
  const F=ch?{leg:0.34,torso:0.27,neck:0.022,head:0.135,sh:0.1,hip:0.058,ua:0.13,fa:0.11,hand:0.055,thR:0.062,knR:0.048,anR:0.038,uaR:0.044,faR:0.037,wrR:0.031,foot:0.045,fw:0.042,fl:0.075,depth:0.84}
             :{leg:0.47,torso:0.295,neck:0.04,head:0.079,sh:0.108,hip:0.056,ua:0.165,fa:0.145,hand:0.06,thR:0.044,knR:0.03,anR:0.021,uaR:0.029,faR:0.024,wrR:0.018,foot:0.034,fw:0.028,fl:0.058,depth:0.66};
  const legL=H*F.leg,fa=H*F.foot,thighL=(legL-fa)*0.52,shinL=(legL-fa)*0.48;
  const torsoL=H*F.torso,neckL=H*F.neck,r=H*F.head;
  const sw=H*F.sh*(b.sh||1),hw=H*F.hip*(b.hip||1);
  const thR=H*F.thR*(b.hip||1),knR=H*F.knR,anR=H*F.anR,uaR=H*F.uaR*(b.sh||1),faR=H*F.faR,wrR=H*F.wrR;
  const uaL=H*F.ua,faL=H*F.fa,handL=H*F.hand;
  const skin=skinM(def.skin);
  const hairM=mc('hair'+def.hair,()=>new T.MeshStandardMaterial({color:lin(def.hair),roughness:def.hairStyle==='long'?0.42:0.8}));
  const topM=clothM(def.top), botM=clothM(def.bottom);
  const sp=lo?SPHL:SPH;
  function grp(parent,x,y,z){const g=new T.Group();g.position.set(x,y,z);parent.add(g);return g;}
  function add(parent,geo,m,x,y,z,sx,sy,sz,shadow){const me=new T.Mesh(geo,m);me.position.set(x||0,y||0,z||0);if(sx!=null)me.scale.set(sx,sy,sz);me.castShadow=shadow!==false;parent.add(me);return me;}

  const root=new T.Group(),body=grp(root,0,0,0);
  const hips=grp(body,0,legL,0),spine=grp(hips,0,0,0),neck=grp(spine,0,torsoL,0),head=grp(neck,0,neckL,0);
  const lSh=grp(spine,sw,torsoL*0.88,0),rSh=grp(spine,-sw,torsoL*0.88,0);
  const lEl=grp(lSh,0,-uaL,0),rEl=grp(rSh,0,-uaL,0),lHa=grp(lEl,0,-faL,0),rHa=grp(rEl,0,-faL,0);
  const lHip=grp(hips,hw,0,0),rHip=grp(hips,-hw,0,0);
  const lKn=grp(lHip,0,-thighL,0),rKn=grp(rHip,0,-thighL,0),lAn=grp(lKn,0,-shinL,0),rAn=grp(rKn,0,-shinL,0);

  // --- torso (lathe, flattened front-to-back) ---
  const hipR=hw+thR*0.85,waistR=hipR*0.9*(b.waist||1),chestR=Math.max(sw*0.93,waistR*1.02),shR=sw+uaR*0.35,neckR=H*(ch?0.045:0.028);
  const prof=[[0,-thR*0.95],[hipR*0.8,-thR*0.55],[hipR,0.04*torsoL],[hipR*0.99,0.18*torsoL],[waistR,0.42*torsoL],[chestR,0.68*torsoL],[shR*0.98,0.86*torsoL],[shR*0.7,0.97*torsoL],[neckR*1.4,torsoL],[0,1.03*torsoL]];
  const torso=add(spine,latheGeo('torso'+H+(lo?'L':'')+(ch?'c':'')+JSON.stringify(b),prof,lo?12:20),topM,0,0,0,1,1,F.depth);
  if(def.belly)add(spine,sp,topM,0,0.34*torsoL,waistR*F.depth*0.5,waistR*0.9,torsoL*0.3,waistR*0.78);
  if(def.top.type==='polo')add(spine,gc('collar',()=>new T.TorusGeometry(1,0.35,6,16)),topM,0,torsoL*0.99,0,neckR*1.35,neckR*1.35,neckR*1.2).rotation.x=Math.PI/2;
  // shorts / trousers over the pelvis
  if(def.bottom){add(spine,latheGeo('pelvis'+H+(lo?'L':'')+(ch?'c':'')+JSON.stringify(b),[[0,-thR*1.02],[hipR*0.84,-thR*0.6],[hipR*1.04,0.04*torsoL],[hipR*1.03,0.2*torsoL],[waistR*1.05,0.38*torsoL],[waistR*0.6,0.4*torsoL]],lo?12:20),botM,0,0,0,1,1,F.depth*1.02);}
  // skirt for dresses (hangs from the hips, swings forward when sitting)
  let skirt=null;
  if(def.top.type==='dress'){skirt=grp(hips,0,0,0);
    add(skirt,latheGeo('skirt'+H+(lo?'L':'')+(ch?'c':'')+JSON.stringify(b),[[hipR*1.55,-thighL*0.8],[hipR*1.32,-thighL*0.42],[hipR*1.08,-thR*0.3],[hipR*1.02,0.08*torsoL],[waistR*1.03,0.32*torsoL]],lo?12:22),topM,0,0,0,1,1,0.82);}

  // --- neck + head ---
  add(neck,capsuleGeo(neckR,neckR,neckL+r*0.3,lo?8:10),skin,0,neckL+r*0.25,0);
  const face=grp(head,0,r*0.92,0);
  const sk=ch?[r,r*0.97,r]:[r*0.94,r,r*0.98];
  add(face,sp,skin,0,0,0,sk[0],sk[1],sk[2]);
  [1,-1].forEach(s=>add(face,sp,skin,s*sk[0]*0.97,-0.05*r,-0.02*r,0.12*r,0.2*r,0.08*r));      // ears
  add(face,sp,skin,0,ch?-0.14*r:-0.1*r,sk[2]*0.97,ch?0.08*r:0.1*r,ch?0.07*r:0.12*r,ch?0.07*r:0.11*r); // nose
  const eyes=[];
  if(!lo){
    const eyeM=mc('eye',()=>new T.MeshStandardMaterial({color:lin(0x2a1c14),roughness:0.25})), hiM=mc('eyehi',()=>new T.MeshBasicMaterial({color:0xffffff}));
    const ex=ch?0.36*r:0.34*r, ey=ch?-0.04*r:0.06*r, er=ch?[0.105*r,0.135*r,0.06*r]:[0.085*r,0.12*r,0.05*r];
    const ez=sk[2]*Math.sqrt(Math.max(0,1-(ex/sk[0])**2-(ey/sk[1])**2))-er[2]*0.45;
    [1,-1].forEach(s=>{const eg=grp(face,s*ex,ey,ez);eg.rotation.y=s*0.36;
      const e=add(eg,sp,eyeM,0,0,0,er[0],er[1],er[2],false);
      const hl=add(e,sp,hiM,0.35,0.4,0.9,0.28,0.2,0.2,false);
      eyes.push(eg);eg.userData.hl=hl;
      const browC=(def.hair===0xe8e5df||def.hair===0xd4d1cc)?0xb3aca3:def.hair;
      const br=add(face,CUBE,stdM(browC,0.9),s*ex,ey+(ch?0.2*r:0.26*r),ez+0.02*r,0.2*r,0.04*r,0.04*r,false);br.rotation.set(0,s*0.36,-s*0.1);});
    // mouth
    if(ch){const m=add(face,gc('tmouth',()=>new T.CircleGeometry(1,14,Math.PI,Math.PI)),mc('mouthIn',()=>new T.MeshStandardMaterial({color:lin(0x8a2f2a),roughness:0.6,side:T.DoubleSide})),0,-0.36*r,sk[2]*0.93,0.1*r,0.1*r,1,false);m.rotation.x=0.35;}
    else{const m=add(face,gc('smile',()=>new T.TorusGeometry(1,0.16,5,14,Math.PI)),stdM(0x7a3328,0.6),0,-0.37*r,sk[2]*(def.beard?0.99:0.92),0.15*r,0.15*r,0.15*r,false);m.rotation.set(0.38,0,Math.PI);}
    if(def.cheeks)[1,-1].forEach(s=>{const c=add(face,sp,mc('cheek',()=>new T.MeshStandardMaterial({color:lin(0xff8f8f),roughness:0.8,transparent:true,opacity:0.45,depthWrite:false})),s*0.5*r,-0.2*r,sk[2]*0.8,0.13*r,0.08*r,0.03*r,false);c.rotation.y=s*0.55;});
  }
  // facial hair
  if(def.beard){const bd=add(face,gc('beard',()=>new T.SphereGeometry(1,20,8,0,Math.PI,0.56*Math.PI,0.36*Math.PI)),hairM,0,0,0,sk[0]*1.05,sk[1]*1.04,sk[2]*1.05);
    add(face,sp,hairM,0,-0.25*r,sk[2]*1.0,0.2*r,0.055*r,0.07*r,false);}
  if(def.moustache){add(face,sp,hairM,0,-0.25*r,sk[2]*0.97,0.26*r,0.075*r,0.09*r,false);}
  // --- hair ---
  function cap(theta,tilt,sc){const m=add(face,gc('cap'+theta.toFixed(2),()=>new T.SphereGeometry(1,22,12,0,Math.PI*2,0,theta)),hairM,0,0,0,sk[0]*sc,sk[1]*sc,sk[2]*sc);m.rotation.x=-tilt;return m;}
  let pony=null;
  const hs=def.hairStyle;
  if(hs==='short'){cap(0.5*Math.PI,0.42,1.06);add(face,sp,hairM,0.1*r,0.62*r,0.6*r,0.5*r,0.18*r,0.3*r).rotation.set(-0.5,0,-0.15);}
  else if(hs==='ponytail'){cap(0.54*Math.PI,0.36,1.07);add(face,sp,hairM,0.22*r,0.62*r,0.62*r,0.52*r,0.2*r,0.26*r).rotation.set(-0.45,0,-0.4);
    pony=grp(face,0,0.42*r,-0.86*r);add(pony,gc('scrunch',()=>new T.TorusGeometry(1,0.4,6,12)),stdM(0xe0654f,0.7),0,0,0,0.13*r,0.13*r,0.13*r);
    add(pony,capsuleGeo(0.2*r,0.07*r,1.15*r,lo?8:10),hairM,0,-0.05*r,-0.05*r);pony.rotation.x=0.35;}
  else if(hs==='long'){cap(0.55*Math.PI,0.25,1.07);add(face,sp,hairM,0,-0.55*r,-0.5*r,0.95*r,1.35*r,0.4*r);
    [1,-1].forEach(s=>add(face,sp,hairM,s*0.8*r,-0.42*r,0.1*r,0.24*r,0.95*r,0.32*r));}
  else if(hs==='curly'){cap(0.5*Math.PI,0.3,1.02);
    if(!lo){const n=46,ga=Math.PI*(3-Math.sqrt(5));for(let i=0;i<n;i++){const y=1-(i/(n-1))*2,rr=Math.sqrt(1-y*y),a=i*ga,x=Math.cos(a)*rr,z=Math.sin(a)*rr;
      if(y<-0.05&&!(z<-0.3&&y>-0.45))continue;if(z>0.5&&y<0.5)continue;
      add(face,sp,hairM,x*sk[0]*1.0,y*sk[1]*1.02+0.02*r,z*sk[2]*1.0,0.21*r,0.21*r,0.21*r,false);}}}
  else if(hs==='bald'){const f=add(face,gc('fringe',()=>new T.TorusGeometry(1,0.16,8,20,1.1*Math.PI)),hairM,0,-0.04*r,-0.04*r,sk[0]*0.93,sk[2]*0.93,sk[1]*0.93);f.rotation.set(Math.PI/2,0,0.95*Math.PI);}
  else if(hs==='tuft'){cap(0.5*Math.PI,0.3,1.03);add(face,sp,hairM,0.1*r,0.98*r,0.3*r,0.16*r,0.24*r,0.13*r).rotation.z=-0.6;}
  // --- hats ---
  if(def.hat){const hm=mc('hat'+def.hatCol,()=>new T.MeshStandardMaterial({color:lin(def.hatCol),roughness:0.9,side:T.DoubleSide}));const hat=grp(face,0,0,0);
    if(def.hat==='panama'){add(hat,gc('pcrown',()=>new T.CylinderGeometry(0.8,0.92,0.52,18)),hm,0,0.7*r,0,r,r,r);
      add(hat,gc('pband',()=>new T.CylinderGeometry(0.93,0.93,0.14,18)),stdM(0x2a2622,0.8),0,0.52*r,0,r,r,r);
      add(hat,gc('pbrim',()=>new T.CylinderGeometry(1.7,1.7,0.035,26)),hm,0,0.46*r,0,r,r,r);hat.rotation.x=-0.12;}
    else if(def.hat==='sunhat'){add(hat,sp,hm,0,0.5*r,0,0.93*r,0.6*r,0.93*r);
      add(hat,latheGeo('sunbrim',[[0.85,0.02],[1.4,-0.06],[2.05,-0.24]],24),hm,0,0.45*r,0,r,r,r);
      add(hat,gc('ribbon',()=>new T.TorusGeometry(0.93,0.07,6,20)),stdM(0x9b6fcf,0.7),0,0.5*r,0,r,r,r).rotation.x=Math.PI/2;hat.rotation.x=-0.1;}
    else if(def.hat==='bucket'){add(hat,gc('bcrown',()=>new T.CylinderGeometry(0.8,0.96,0.5,18)),hm,0,0.62*r,0,r,r,r);
      add(hat,gc('bbrim',()=>new T.CylinderGeometry(0.97,1.38,0.28,20,1,true)),hm,0,0.28*r,0,r,r,r);hat.rotation.x=-0.1;}}
  // --- glasses & jewellery ---
  function specs(kind,gy,gz,parent){const g=grp(parent||face,0,gy,gz);
    const fm=stdM(def.glassCol||0x1a1a1a,0.35,{metalness:0.3});
    [1,-1].forEach(s=>{if(kind==='round'){const rg=add(g,gc('rim',()=>new T.TorusGeometry(1,0.13,6,18)),fm,s*0.34*r,0,0,0.16*r,0.16*r,0.16*r,false);rg.rotation.y=s*0.3;
        const ln=add(g,gc('lens',()=>new T.CircleGeometry(1,16)),mc('lensM',()=>new T.MeshStandardMaterial({color:0xcfe8ff,transparent:true,opacity:0.2,roughness:0.05,metalness:0.2})),s*0.34*r,0,0,0.15*r,0.15*r,1,false);ln.rotation.y=s*0.3;}
      else{const ln=add(g,sp,mc('sunlens',()=>new T.MeshStandardMaterial({color:0x111418,roughness:0.08,metalness:0.6})),s*0.33*r,0,0,0.19*r,0.14*r,0.05*r,false);ln.rotation.set(0,s*0.3,s*0.15);}
      const tm=add(g,CUBE,fm,s*0.55*r,0.02*r,-0.45*r,0.025*r,0.025*r,0.9*r,false);tm.rotation.y=-s*0.12;});
    add(g,CUBE,fm,0,0.03*r,0.03*r,0.2*r,0.025*r,0.025*r,false);return g;}
  if(!lo&&def.glasses==='round')specs('round',ch?-0.04*r:0.06*r,sk[2]*0.99);
  if(!lo&&def.glasses==='sun')specs('sun',0.06*r,sk[2]*0.99);
  if(!lo&&def.sunnies==='head'){const g=specs('sun',0.78*r,0.52*r);g.rotation.x=-1.0;g.scale.setScalar(1.04);}
  if(!lo&&def.earrings)[1,-1].forEach(s=>add(face,gc('hoop',()=>new T.TorusGeometry(1,0.22,6,14)),mc('gold',()=>new T.MeshStandardMaterial({color:lin(0xe8c25a),roughness:0.3,metalness:1})),s*sk[0]*0.98,-0.36*r,0.02*r,0.08*r,0.08*r,0.08*r,false).rotation.y=Math.PI/2);

  // --- arms ---
  const sleeves=(def.top.type==='tee'||def.top.type==='polo'||def.top.sleeves);
  [[lSh,lEl,lHa,1],[rSh,rEl,rHa,-1]].forEach(([S,E,Hd,s])=>{
    add(S,capsuleGeo(uaR,faR*1.02,uaL,lo?8:12),skin);
    if(sleeves)add(S,capsuleGeo(uaR*1.16,uaR*1.1,uaL*0.44,lo?8:12),topM,0,uaR*0.05,0);
    add(E,capsuleGeo(faR,wrR,faL,lo?8:12),skin);
    add(Hd,sp,skin,0,-handL*0.45,0.004*H,wrR*1.45,handL*0.55,wrR*0.95);
    if(!lo){const th=add(Hd,sp,skin,-s*wrR*0.2,-handL*0.3,wrR*0.95,wrR*0.45,handL*0.32,wrR*0.45);th.rotation.x=0.4;}});
  // --- legs + feet ---
  const trousers=def.bottom&&def.bottom.type==='trousers';
  const fw=H*F.fw,fl=H*F.fl,fh=fa*0.62;
  [[lHip,lKn,lAn],[rHip,rKn,rAn]].forEach(([Hp,K,A])=>{
    add(Hp,capsuleGeo(thR,knR,thighL,lo?8:12),skin);
    if(def.bottom)add(Hp,capsuleGeo(thR*1.14,trousers?knR*1.2:thR*1.04,trousers?thighL:thighL*0.5,lo?8:12),botM,0,thR*0.05,0);
    add(K,capsuleGeo(knR,anR,shinL,lo?8:12),skin);
    if(def.socks)add(K,capsuleGeo(anR*1.3,anR*1.28,shinL*0.42,lo?8:10),stdM(def.socks,0.9),0,-shinL*0.56,0);
    const st=def.shoes||{type:'bare'},sc=st.col||0x333333;
    if(st.type==='trainer'){add(A,sp,stdM(sc,0.6),0,-fa*0.45,fl*0.42,fw,fh,fl);add(A,sp,stdM(0xd8d8d8,0.8),0,-fa*0.82,fl*0.42,fw*1.04,fh*0.35,fl*1.03);}
    else if(st.type==='flat'){add(A,sp,stdM(sc,0.7),0,-fa*0.55,fl*0.42,fw*0.95,fh*0.8,fl);}
    else{add(A,sp,skin,0,-fa*0.5,fl*0.42,fw*0.88,fh*0.72,fl*0.95);
      if(st.type!=='bare'){add(A,sp,stdM(sc,0.8),0,-fa*0.92,fl*0.42,fw*1.05,fa*0.14,fl*1.05);
        if(st.type==='slider')add(A,sp,stdM(sc,0.8),0,-fa*0.45,fl*0.55,fw*1.08,fh*0.6,fl*0.36);
        else{add(A,sp,stdM(sc,0.8),0,-fa*0.45,fl*0.7,fw*0.95,fh*0.45,fl*0.12);add(A,sp,stdM(sc,0.8),0,-fa*0.3,fl*0.25,fw*0.93,fh*0.5,fl*0.1);}}}});

  // --- props held in the right hand ---
  const props={};
  if(!lo&&!ch){const g=grp(rHa,0,-handL*0.55,wrR*1.6);
    add(g,gc('glassG',()=>new T.CylinderGeometry(1,0.8,2.2,12)),mc('glassM',()=>new T.MeshStandardMaterial({color:0xffffff,transparent:true,opacity:0.35,roughness:0.05})),0,0,0,H*0.02,H*0.02,H*0.02,false);
    add(g,gc('liqG',()=>new T.CylinderGeometry(0.9,0.75,1.4,12)),stdM(0x9c1f32,0.3),0,-H*0.008,0,H*0.02,H*0.02,H*0.02,false);g.rotation.x=-0.3;props.glass=g;}
  if(!lo&&def.prop==='book'){const g=grp(rHa,H*0.03,-handL*0.6,wrR*1.4);add(g,CUBE,stdM(0x3a6ea5,0.7),0,0,0,H*0.09,H*0.012,H*0.065,false);add(g,CUBE,stdM(0xf6f1e4,0.9),0,H*0.007,0,H*0.085,H*0.004,H*0.06,false);g.rotation.x=0.9;props.book=g;}
  if(!lo&&def.prop==='paper'){const g=grp(rHa,H*0.06,-handL*0.5,wrR*1.4);
    add(g,CUBE,mc('paperM',()=>{const cv=document.createElement('canvas');cv.width=128;cv.height=96;const c=cv.getContext('2d');c.fillStyle='#ecebe4';c.fillRect(0,0,128,96);c.fillStyle='#333';c.font='bold 13px Georgia';c.fillText('THE TIMES',8,16);c.fillStyle='#888';for(let y=26;y<92;y+=6){c.fillRect(8,y,52,2);c.fillRect(68,y,52,2);}const t=new T.CanvasTexture(cv);t.encoding=T.sRGBEncoding;return new T.MeshStandardMaterial({map:t,roughness:0.95});}),0,0,0,H*0.16,H*0.11,H*0.004,false);
    g.rotation.set(0.25,0.35,0);props.paper=g;}
  Object.values(props).forEach(g=>g.visible=false);

  const blob=new T.Mesh(blobGeo,blobMat);blob.scale.set(H*0.36,1,H*0.36);blob.position.y=0.04;blob.renderOrder=1;root.add(blob);
  root.traverse(o=>{if(o.isMesh)o.receiveShadow=false;});

  const p={def,root,body,torso,skirt,pony,eyes,props,blob,H,legL,thighL,shinL,torsoL,thR,r,depth:F.depth,child:ch,
    j:{hips,spine,neck,head,lSh,rSh,lEl,rEl,lHa,rHa,lHip,rHip,lKn,rKn,lAn,rAn},
    t:Math.random()*10,ph:0,spd:0,lx:0,lz:0,pose:'auto',seatH:0.6,py:0,read:false,blink:1+Math.random()*3,lookY:0,lookT:0,lookAt:null,eyesClosed:false,stoop:def.stoop||0};
  root.userData.person=p;
  return p;
}
function placePerson(p,x,z,yaw,y){p.root.position.set(x,y||0,z);if(yaw!=null)p.root.rotation.y=yaw;p.lx=x;p.lz=z;p.spd=0;}

// ---- procedural animation ----
const _TAU=Math.PI*2;
function animPerson(p,dt,snapNow){
  const j=p.j;p.t+=dt;const t=p.t;
  const rp=p.root.position,ddx=rp.x-p.lx,ddz=rp.z-p.lz;p.lx=rp.x;p.lz=rp.z;
  let inst=dt>0?Math.hypot(ddx,ddz)/dt:0;if(inst>30)inst=0;
  p.spd+=(inst-p.spd)*Math.min(1,dt*8);
  const k=snapNow?1:Math.min(1,dt*12);
  const pose=p.pose;
  let bx=0,by=0,bz=0,brx=0,bry=0,brz=0,hipsZ=0,skirtX=0,showBlob=true,closed=p.eyesClosed,snapArms=false;
  const sp=[p.stoop,0,0],nk=[0,0,0],hd=[0,0,0];
  let lsh=[0,0,0.07],rsh=[0,0,-0.07],lel=[-0.12,0,0],rel=[-0.12,0,0];
  let lhp=[0,0,0],rhp=[0,0,0],lkn=[0.03,0,0],rkn=[0.03,0,0],lan=[0,0,0],ran=[0,0,0],lha=[0,0,0],rha=[0,0,0];
  const seatBy=()=>p.seatH+p.thR*0.55-p.legL;
  // body drop for a given hip/knee angle so the feet stay planted
  const legY=(th,kn)=>p.thighL*Math.cos(th)+p.shinL*Math.cos(th+kn)+(p.legL-p.thighL-p.shinL)*0.9-p.legL;
  let w=0;
  const idleLayer=(amt)=>{hipsZ+=Math.sin(t*0.7)*0.03*amt;lsh[0]+=Math.sin(t*1.1)*0.03*amt;rsh[0]+=Math.sin(t*1.1+1)*0.03*amt;
    p.lookT-=dt;if(p.lookT<0){p.lookT=2+Math.random()*4;p.lookY=Math.random()<0.35?0:(Math.random()-0.5)*1.2;}
    let ly=p.lookY;if(p.lookAt){const dx=p.lookAt.x-rp.x,dz=p.lookAt.z-rp.z;if(dx*dx+dz*dz<400){let a=Math.atan2(dx,dz)-p.root.rotation.y;a=Math.atan2(Math.sin(a),Math.cos(a));if(Math.abs(a)<1.9)ly=Math.max(-1.1,Math.min(1.1,a));}}
    hd[1]+=ly*0.6*amt;nk[1]+=ly*0.4*amt;};
  switch(pose){
    case 'sit':case 'read':{by=seatBy();lhp=[-1.5,0,0.06];rhp=[-1.5,0,-0.06];lkn=[1.45,0,0];rkn=[1.45,0,0];lan=[0.05,0,0];ran=[0.05,0,0];
      sp[0]=p.stoop*0.5+0.03;lsh=[-0.42,0,0.12];rsh=[-0.42,0,-0.12];lel=[-0.6,0,0];rel=[-0.6,0,0];skirtX=-1.15;
      if(pose==='read'||p.read){lsh=[-0.95,0,-0.2];rsh=[-0.95,0,0.2];lel=[-1.15,0,0];rel=[-1.15,0,0];hd[0]=0.35;}else idleLayer(0.6);break;}
    case 'recline':{by=seatBy();lhp=[-1.42,0,0.05];rhp=[-1.42,0,-0.05];lkn=[0.1,0,0];rkn=[0.14,0,0];lan=[0.5,0,0];ran=[0.5,0,0];sp[0]=-0.82;hd[0]=0.5;skirtX=-1.3;
      if(p.read){lsh=[-1.25,0,-0.15];rsh=[-1.25,0,0.15];lel=[-1.0,0,0];rel=[-1.0,0,0];}
      else{lsh=[-2.55,0.2,0.95];rsh=[-2.55,-0.2,-0.95];lel=[-2.45,0,0];rel=[-2.45,0,0];}
      showBlob=false;break;}
    case 'lie':case 'sleep':{brx=-Math.PI/2;by=p.thR*1.15+p.py;bz=p.legL;showBlob=false;lhp=[0,0,0.07];rhp=[0,0,-0.07];lkn=[0.06,0,0];rkn=[0.06,0,0];lan=[0.25,0,0];ran=[0.25,0,0];
      lsh=[0,0,0.2];rsh=[0,0,-0.2];lel=[-0.25,0,0];rel=[-0.25,0,0];hd[0]=-0.15;
      if(pose==='sleep'){closed=true;lsh=[-2.7,0,0.5];rsh=[-2.5,0,-0.6];lel=[-1.1,0,0];rel=[-1.2,0,0];hd[1]=0.35;}break;}
    case 'swim':{brx=Math.PI/2;by=p.py;bz=-(p.legL+p.torsoL*0.45);showBlob=false;snapArms=true;p.ph+=dt*5.2;
      const a=p.ph%_TAU;lsh=[a,0,0.18];rsh=[(a+Math.PI)%_TAU,0,-0.18];lel=[-0.45,0,0];rel=[-0.45,0,0];
      const f=Math.sin(p.ph*3)*0.3;lhp=[f,0,0.04];rhp=[-f,0,-0.04];lkn=[0.25,0,0];rkn=[0.25,0,0];lan=[0.9,0,0];ran=[0.9,0,0];
      hd[0]=-0.55;hd[1]=Math.sin(p.ph)*0.35;bry=Math.sin(p.ph)*0.28;break;}
    case 'soak':{by=seatBy();lhp=[-1.3,0,0.12];rhp=[-1.3,0,-0.12];lkn=[1.0,0,0];rkn=[1.0,0,0];lsh=[0.25,0,1.25];rsh=[0.25,0,-1.25];lel=[-0.35,0,0];rel=[-0.35,0,0];
      hd[0]=-0.3;hd[1]=Math.sin(t*0.3)*0.25;closed=(t%9)<5;showBlob=false;skirtX=-1;if(p.def.prop==='glass'){rsh=[-0.6,0,-0.5];rel=[-1.5,0,0];}break;}
    // ---- activity poses ----
    case 'stir':{sp[0]=0.2;hd[0]=0.5;const c=t*3.2;lsh=[-0.75,0,0.12];lel=[-0.85,0,0];rsh=[-1.0+Math.sin(c)*0.18,0,-0.12+Math.cos(c)*0.16];rel=[-0.45,0,0];hipsZ=Math.sin(c)*0.03;break;}
    case 'flip':{sp[0]=0.14;hd[0]=0.42;lsh=[-0.7,0,0.1];lel=[-0.9,0,0];const f=Math.max(0,Math.sin(t*3.4));rsh=[-0.85-f*0.35,0,-0.1];rel=[-0.55-f*0.6,0,0];rha=[0,0,-f*1.1];break;}
    case 'pour':{sp[0]=0.12;hd[0]=0.45;rsh=[-1.05,0.25,-0.1];rel=[-0.55,0,0];rha=[0,0,-0.9-Math.sin(t*2)*0.1];lsh=[-0.85,-0.2,0.1];lel=[-1.0,0,0];break;}
    case 'lick':{idleLayer(0.5);const l=Math.max(0,Math.sin(t*3));rsh=[-0.45,0,-0.28];rel=[-1.95-l*0.15,0,0.25];hd[0]=0.05+l*0.1;break;}
    case 'rub':{const sw=(t%3)<1.5?1:-1,r=Math.sin(t*7)*0.28;if(sw>0){rsh=[-0.55,0.45+r,-0.05];rel=[-1.55,0,0];lsh=[-0.2,0,0.45];lel=[-0.5,0,0];}else{lsh=[-0.55,-0.45-r,0.05];lel=[-1.55,0,0];rsh=[-0.2,0,-0.45];rel=[-0.5,0,0];}hd[0]=0.28;hd[1]=sw*0.35;break;}
    case 'wade':{const q=t*5;lsh=[-0.35+Math.sin(q)*0.6,0,0.55];rsh=[-0.35+Math.sin(q+Math.PI)*0.6,0,-0.55];lel=[-0.35,0,0];rel=[-0.35,0,0];lkn=[0.2,0,0];rkn=[0.2,0,0];lhp=[-0.12,0,0.05];rhp=[-0.12,0,-0.05];by=-Math.abs(Math.sin(q))*0.04*p.H;hd[0]=0.25;sp[0]=0.12;showBlob=false;break;}
    case 'dig':{const kn=Math.PI/2;lhp=[-0.1,0,0.14];rhp=[-0.1,0,-0.14];lkn=[kn,0,0];rkn=[kn,0,0];lan=[1.35,0,0];ran=[1.35,0,0];by=legY(0,kn);
      sp[0]=0.55;hd[0]=0.45;const d=t*4.2;lsh=[-1.15+Math.sin(d)*0.4,0,0.18];rsh=[-1.15+Math.sin(d+Math.PI)*0.4,0,-0.18];lel=[-0.35,0,0];rel=[-0.35,0,0];skirtX=-0.4;break;}
    case 'crouch':{const th=-1.45,kn=2.0;lhp=[th,0,0.2];rhp=[th,0,-0.2];lkn=[kn,0,0];rkn=[kn,0,0];lan=[-(th+kn),0,0];ran=[-(th+kn),0,0];by=legY(th,kn);sp[0]=0.6;hd[0]=0.5;rsh=[-1.25,0,-0.12];rel=[-0.15,0,0];lsh=[-0.5,0,0.25];lel=[-0.8,0,0];skirtX=-1.0;break;}
    case 'reach':{rsh=[-2.85,0,-0.12];rel=[-0.2,0,0];lsh=[-0.2,0,0.2];hd[0]=-0.55;by=0.035*p.H;lan=[0.35,0,0];ran=[0.35,0,0];sp[0]=-0.08;break;}
    case 'sitground':{const th=-2.0,kn=0.86;lhp=[th,0,0.16];rhp=[th,0,-0.16];lkn=[kn,0,0];rkn=[kn,0,0];lan=[-(th+kn),0,0];ran=[-(th+kn),0,0];by=p.thR*0.8-p.legL;
      sp[0]=0.2;lsh=[-1.0,0,-0.02];rsh=[-1.0,0,0.02];lel=[-0.85,0,0];rel=[-0.85,0,0];hd[0]=-0.12;skirtX=-1.6;break;}
    case 'stargaze':{brx=-Math.PI/2;by=p.thR*1.15+p.py;bz=p.legL;showBlob=false;lhp=[0,0,0.1];rhp=[0,0,-0.1];lkn=[0.1,0,0];rkn=[0.1,0,0];lan=[0.3,0,0];ran=[0.3,0,0];
      rsh=[-1.45+Math.sin(t*0.7)*0.15,Math.sin(t*0.5)*0.25,-0.1];rel=[-0.1,0,0];lsh=[-0.1,0,0.95];lel=[-0.4,0,0];hd[0]=-0.25;break;}
    case 'stretch':{lsh=[-0.15,0,2.75];rsh=[-0.15,0,-2.75];lel=[0,0,0.25];rel=[0,0,-0.25];sp[0]=-0.18;hd[0]=-0.35;closed=true;by=0.02*p.H;lan=[0.3,0,0];ran=[0.3,0,0];break;}
    case 'fan':{idleLayer(0.4);rsh=[-0.55,0,-0.3];rel=[-2.0,0,0];rha=[0,0,Math.sin(t*12)*0.7];lsh=[0.1,0,0.35];lel=[-1.3,0,0];hd[0]=-0.25;sp[0]=-0.06;break;}
    case 'tuck':{sp[0]=0.95;hd[0]=0.35;const g=Math.sin(t*1.6)*0.08;lsh=[-1.45+g,0,0.12];rsh=[-1.45-g,0,-0.12];lel=[-0.25,0,0];rel=[-0.25,0,0];lhp=[-0.25,0,0.06];rhp=[-0.25,0,-0.06];lkn=[0.2,0,0];rkn=[0.2,0,0];break;}
    case 'talk':{idleLayer(0.4);lsh=[-0.5+Math.sin(t*3)*0.2,0,0.22];lel=[-1.2+Math.sin(t*4)*0.3,0,0];rsh=[-0.5+Math.sin(t*3.5+1)*0.2,0,-0.22];rel=[-1.1+Math.sin(t*4.5+2)*0.35,0,0];hd[0]=Math.sin(t*5)*0.07;break;}
    case 'laugh':{const q=Math.abs(Math.sin(t*9));lsh=[-0.45,0,0.12];lel=[-1.45,0,0];rsh=[-0.45,0,-0.12];rel=[-1.45,0,0];sp[0]=0.08+q*0.1;hd[0]=-0.3+q*0.12;by=-q*0.008*p.H;closed=true;break;}
    case 'give':{lsh=[-1.25,0,0.18];rsh=[-1.25,0,-0.18];lel=[-0.35,0,0];rel=[-0.35,0,0];hd[0]=0.2;sp[0]=0.08;break;}
    case 'bbq':{sp[0]+=0.12;hd[0]=0.35;lsh=[-0.85,0,0.05];rsh=[-0.95,0,-0.05];lel=[-0.8,0,0];rel=[-0.6+Math.sin(t*4.5)*0.35,0,0];hipsZ=Math.sin(t*0.9)*0.02;break;}
    case 'drink':{idleLayer(0.8);const sip=Math.max(0,Math.sin(t*0.8)-0.6)/0.4;rsh=[-0.5,0,-0.22];rel=[-1.5-0.75*sip,0,0.2];hd[0]-=0.18*sip;break;}
    case 'wave':{idleLayer(0.5);rsh=[-0.1,0,-2.6];rel=[0,0,-0.3+Math.sin(t*10)*0.45];hd[0]=-0.08;break;}
    case 'cheer':{lsh=[-0.2,0,2.55];rsh=[-0.2,0,-2.55];lel=[0,0,0.35];rel=[0,0,-0.35];by=Math.abs(Math.sin(t*6))*p.H*0.05;hd[0]=-0.2;break;}
    case 'dance':{const q=t*5;by=Math.abs(Math.sin(q))*p.H*0.02-0.01*p.H;bry=Math.sin(t*1.2)*0.5;hipsZ=Math.sin(q)*0.12;
      lsh=[-0.4+Math.sin(q)*0.5,0,0.9+Math.sin(t*2.5)*0.6];rsh=[-0.4-Math.sin(q)*0.5,0,-0.9-Math.sin(t*2.5+1)*0.6];lel=[-1.2,0,0];rel=[-1.2,0,0];
      const kb=0.2+Math.abs(Math.sin(q))*0.18;lhp=[-kb*0.6,0,0.05];rhp=[-kb*0.6,0,-0.05];lkn=[kb,0,0];rkn=[kb,0,0];hd[2]=Math.sin(t*2.5)*0.15;break;}
    default:{ // walk / run / idle blend driven by measured ground speed
      w=Math.min(1,p.spd/1.0);
      const run=Math.max(0,Math.min(1,(p.spd/p.legL-3.2)/3.5));
      let cyc=p.legL*(1.7+1.3*run);cyc=Math.max(cyc,p.spd/(p.child?4.3:3.2));
      p.ph+=p.spd*dt/cyc*_TAU;
      const s=Math.sin(p.ph),c=Math.cos(p.ph);
      const thA=(0.42+0.33*run)*w,knA=(0.55+0.85*run)*w,arA=(0.32+0.5*run)*w;
      lhp[0]=-s*thA;rhp[0]=s*thA;
      lkn[0]=0.05+Math.max(0,c)*knA+run*0.25*w;rkn[0]=0.05+Math.max(0,-c)*knA+run*0.25*w;
      lan[0]=Math.max(-0.35,-(lhp[0]+lkn[0])*0.35);ran[0]=Math.max(-0.35,-(rhp[0]+rkn[0])*0.35);
      lsh[0]=s*arA;rsh[0]=-s*arA;
      lel[0]=-0.15-run*1.0*w-Math.max(0,-s)*0.35*w;rel[0]=-0.15-run*1.0*w-Math.max(0,s)*0.35*w;
      sp[0]+=(0.04+0.16*run)*w;sp[1]=s*0.09*w;hd[1]=-sp[1]*0.8;
      by=-p.legL*(1-Math.cos(Math.abs(s)*thA))*0.95+run*w*p.H*0.02*Math.abs(c);
      if(p.child){brz=s*0.09*w;bx=s*0.02*p.H*w;lsh[2]+=0.25*w;rsh[2]-=0.25*w;}
      idleLayer(1-w);
      if(p.child&&w<0.3){lsh[0]+=Math.sin(t*2.2)*0.15;rsh[0]+=Math.sin(t*2.2+2)*0.15;}
    }
  }
  // apply with smoothing
  const R=(g,v,kk)=>{kk=kk==null?k:kk;g.rotation.x+=(v[0]-g.rotation.x)*kk;g.rotation.y+=(v[1]-g.rotation.y)*kk;g.rotation.z+=(v[2]-g.rotation.z)*kk;};
  const B=p.body;B.position.x+=(bx-B.position.x)*k;B.position.y+=(by-B.position.y)*k;B.position.z+=(bz-B.position.z)*k;
  R(B,[brx,bry,brz]);j.hips.rotation.z+=(hipsZ-j.hips.rotation.z)*k;
  R(j.spine,sp);R(j.neck,nk);R(j.head,hd);
  if(snapArms){j.lSh.rotation.set(lsh[0],lsh[1],lsh[2]);j.rSh.rotation.set(rsh[0],rsh[1],rsh[2]);}else{R(j.lSh,lsh);R(j.rSh,rsh);}
  R(j.lEl,lel);R(j.rEl,rel);R(j.lHa,lha);R(j.rHa,rha);R(j.lHip,lhp);R(j.rHip,rhp);R(j.lKn,lkn);R(j.rKn,rkn);R(j.lAn,lan);R(j.rAn,ran);
  // breathing
  const br=Math.sin(t*2.3);p.torso.scale.x=1+br*0.012;p.torso.scale.z=p.depth*(1+br*0.02);
  if(p.skirt){p.skirt.rotation.x+=(skirtX-p.skirt.rotation.x)*k;p.skirt.rotation.z=Math.sin(p.ph)*0.05*w;}
  if(p.pony){p.pony.rotation.x=0.35+Math.sin(p.ph*2)*0.16*w-j.spine.rotation.x*0.6;p.pony.rotation.z=Math.sin(p.ph)*0.22*w;}
  // blink
  p.blink-=dt;let ey=1;if(closed)ey=0.12;else if(p.blink<0.13){ey=0.15;if(p.blink<0)p.blink=1.8+Math.random()*3.5;}
  for(const e of p.eyes){e.scale.y=ey;e.userData.hl.visible=ey>0.5;}
  // props
  if(p.props.glass)p.props.glass.visible=(pose==='drink'||((pose==='soak'||pose==='dance')&&p.def.prop==='glass'));
  if(p.props.book)p.props.book.visible=(pose==='read'||p.read);
  if(p.props.paper)p.props.paper.visible=(pose==='read'||p.read);
  p.blob.visible=showBlob;
}

// ===================== INTRO ANIMATION =====================
function playIntro(){
  started=true;world.userData.lampPosts.forEach(l=>l.visible=true);
  $('title').classList.add('hidden');document.body.classList.remove('ontitle');
  document.body.classList.add('introplaying');
  const cabcap=$('cabcap'),cabvig=$('cabvig');
  const skip=$('skip-intro');
  skip.classList.remove('hidden');
  const timers=[];
  function endIntro(){
    timers.forEach(clearTimeout);
    cabcap.classList.remove('show');cabvig.classList.add('hidden');
    skip.classList.add('hidden');
    document.body.classList.remove('introplaying');
    setScene('terminal');
  }
  skip.onclick=endIntro;
  // shot 1 — real 3D cabin with the game's people; caption overlaid
  setScene('cabin');
  cabvig.classList.remove('hidden');
  requestAnimationFrame(()=>cabcap.classList.add('show'));
  // shot 2 — wing view (3D)
  timers.push(setTimeout(()=>{
    cabcap.classList.remove('show');cabvig.classList.add('hidden');
    setScene('wingview');
    cabcap.querySelector('.c').textContent='💙 Feet-dry over the Costa de la Luz';
    cabcap.querySelector('.s').textContent='golden hour, dead ahead';
    cabvig.classList.remove('hidden');
    requestAnimationFrame(()=>cabcap.classList.add('show'));
  },4800));
  // shot 3 — landing approach (3D)
  timers.push(setTimeout(()=>{
    cabcap.classList.remove('show');cabvig.classList.add('hidden');
    setScene('landing');
    cabcap.querySelector('.c').textContent='🛬 Touchdown at Jerez de la Frontera';
    cabcap.querySelector('.s').textContent='bienvenidos a Andalucía';
    cabvig.classList.remove('hidden');
    requestAnimationFrame(()=>cabcap.classList.add('show'));
  },9300));
  timers.push(setTimeout(endIntro,13800));
}

// ===================== INPUT =====================
function bindInput(){
  addEventListener('keydown',e=>{const k=e.key.toLowerCase();keys[k]=true;
    if(k==='q')camYaw-=0.25;if(k==='e')camYaw+=0.25;
    if(k==='r'){camYaw=Math.PI;camPitch=0;toast('view reset → facing sea');}
    if(k==='t'){camPitch=camPitch>30?0:45;}if(k==='h')handEdge=true;if(k===' '){if(!actHeld)actEdge=true;actHeld=true;e.preventDefault();}});
  addEventListener('keyup',e=>{const k=e.key.toLowerCase();keys[k]=false;if(k===' ')actHeld=false;});
  const pad=(id,x,z)=>{const el=$(id);const on=e=>{e.preventDefault();mv.x=x;mv.z=z;el.dataset.on='1';};const off=e=>{e&&e.preventDefault();if(el.dataset.on){mv.x=0;mv.z=0;el.dataset.on='';}};
    el.addEventListener('touchstart',on,{passive:false});el.addEventListener('touchend',off);el.addEventListener('mousedown',on);el.addEventListener('mouseup',off);el.addEventListener('mouseleave',off);};
  pad('up',0,-1);pad('down',0,1);pad('left',-1,0);pad('right',1,0);
  const a=$('act');const ad=e=>{e.preventDefault();if(!actHeld)actEdge=true;actHeld=true;};const au=e=>{e.preventDefault();actHeld=false;};
  a.addEventListener('touchstart',ad,{passive:false});a.addEventListener('touchend',au);a.addEventListener('mousedown',ad);a.addEventListener('mouseup',au);
  const hb=$('hand');const hd=e=>{e.preventDefault();handEdge=true;};hb.addEventListener('touchstart',hd,{passive:false});hb.addEventListener('mousedown',hd);
  // drag to look
  const cvs=$('c');
  const dn=(x,y)=>{dragging=true;lastX=x;lastY=y;};
  const mvh=(x,y)=>{if(dragging){camYaw-=(x-lastX)*0.006;camPitch=Math.max(-20,Math.min(55,camPitch+(y-lastY)*0.06));lastX=x;lastY=y;}};
  const up=()=>{dragging=false;};
  cvs.addEventListener('mousedown',e=>dn(e.clientX,e.clientY));addEventListener('mousemove',e=>mvh(e.clientX,e.clientY));addEventListener('mouseup',up);
  cvs.addEventListener('touchstart',e=>{if(e.touches[0])dn(e.touches[0].clientX,e.touches[0].clientY);},{passive:true});
  cvs.addEventListener('touchmove',e=>{if(e.touches[0])mvh(e.touches[0].clientX,e.touches[0].clientY);},{passive:true});
  cvs.addEventListener('touchend',up);
  $('startBtn').addEventListener('click',()=>playIntro());
  function toggleItin(e){if(e)e.stopPropagation();const el=$('itinerary');const c=el.classList.toggle('collapsed');$('itin-toggle').textContent=c?'+':'−';$('itin-title').textContent=c?'📋 Plan':'📋 Today\'s plan';}
  $('itin-toggle').addEventListener('click',toggleItin);
  $('itin-head').addEventListener('click',toggleItin);
}
function onResize(){cam.aspect=innerWidth/innerHeight;cam.updateProjectionMatrix();renderer.setSize(innerWidth,innerHeight);}

// ===================== INTERACTION =====================
function famNear(r){
  let best=null,bd=r;
  for(const n of npcs){if(!n.p.root.visible)continue;const d=Math.hypot(player.position.x-n.p.root.position.x,player.position.z-n.p.root.position.z);if(d<bd){bd=d;best=n;}}
  return best?{id:'npc',label:best.def.emoji+' '+talkLine(best).l,npc:best}:null;
}
function nearest(){
  const px=player.position.x,pz=player.position.z;
  if(scn==='bed'){
    const ex=kidsRoom.userData.exit;
    if(Math.hypot(px-ex.x,pz-ex.z)<4){
      if(!bedtimeEntry&&todsAsleep&&timeOfDay>=6&&timeOfDay<21) return {id:'wakeup',label:'wake the little one ☀️'};
      return {id:'leaveroom',label:'tiptoe out 🤫'};
    }
    return null;
  }
  if(scn==='plaza'){
    if(Math.hypot(px-plaza.userData.car.x,pz-plaza.userData.car.z)<4.5)return{id:'back',label:'drive back to the villa'};
    if(Math.hypot(px-plaza.userData.photo.x,pz-plaza.userData.photo.z)<4)return{id:'snap',label:'take the family photo 📸'};
    return famNear(2.6);
  }
  if(scn==='terminal'){const c=terminal.userData.car;if(Math.hypot(px-c.x,pz-c.z)<8) return {id:'getincar',label:'get in the car 🚗'};return famNear(2.6);}
  let best=null,bd=1e9;
  for(const s of spots){
    let d;
    if(s.shore){d=Math.abs(pz-s.z);if(pz<s.z-7||pz>s.z+9)d=1e9;}
    else d=Math.hypot(px-s.x,pz-s.z);
    const range=s.shore?3:s.r;
    if(d<range&&d<bd){bd=d;best=s;}
  }
  // override bed spot label/availability based on toddler state
  if(best&&best.id==='bed'){
    if(todsAsleep&&(timeOfDay<6||timeOfDay>=21)) return null;  // night: don't disturb
    if(todsAsleep&&timeOfDay>=6&&timeOfDay<21) return {id:'bed',label:'go wake the little one ☀️'};
    if(todsAsleep) return null;  // deep night: spot inactive
  }
  // nap becomes "go to bed" at night
  if(best&&best.id==='nap'&&timeOfDay>=21) return {id:'nap',label:'go to bed 🛏️'};
  // stargaze only when stars are actually out (matches star renderer)
  if(best&&best.id==='stargaze'&&timeOfDay>=6&&timeOfDay<21) return null;
  // sunset only during golden hour
  if(best&&best.id==='sunset'&&(timeOfDay<17||timeOfDay>=19)) return null;
  // sandcastle only available daytime, with the little one awake and nearby
  if(best&&best.id==='sandcastle'&&(todsAsleep||timeOfDay<8||timeOfDay>=20)) return null;
  if(best&&best.id==='sandcastle'&&kid.minder!=='player') return {id:'nokid',label:'fetch the little one from '+fam[kid.minder].def.name+' first 👶'};
  // sunscreen only needed during daytime
  if(best&&best.id==='sunscreen'&&(sunscreenApplied||timeOfDay<8||timeOfDay>=20)) return null;
  if(best) return best;
  // chat with a nearby family member
  return famNear(3.2);
}
let fade=0,fadeDir=0,pending=null;
function transition(to){if(fadeDir!==0)return;fadeDir=1;pending=to;SND.sfx('whoosh');}
function doAction(s){
  if(!s)return;
  if(scn==='bed'){
    if(s&&s.id==='leaveroom') scriptLeaveRoom();
    if(s&&s.id==='wakeup') scriptWake();
    return;
  }
  if(scn==='terminal'){
    if(s.id==='getincar'){toast('🚗 Bags loaded, car seat clicked in — Chiclana, here we come!');scriptCar(terminal.userData.carMesh,'villa');}
    else if(s.id==='npc')talkTo(s.npc);
    return;
  }
  if(scn==='plaza'){
    if(s.id==='back'){toast('🚗 Back to the villa — sleepy heads in the back.');scriptCar(plaza.userData.carMesh,'villa');}
    else if(s.id==='snap'){addV(8);FAMILY_ORDER.forEach(id=>fam[id].mood=Math.min(100,fam[id].mood+20));kid.mood=Math.min(100,kid.mood+20);startPhoto();setTimeout(()=>toast('📸 All six of us on Naboo. Framed the minute we get home.'),1700);}
    else if(s.id==='npc')talkTo(s.npc);
    return;
  }
  switch(s.id){
    case'sangria':{doneSangria=true;drunk+=1;if(drunk<=1){addV(5);toast('🍷 One sangria in the sun. Lovely.');}else if(drunk<3){vibes=Math.max(0,vibes-6);toast('🍷🍷 Steady on… the garden is tilting.');}else{vibes=Math.max(0,vibes-12);toast('🍷🍷🍷 Whoa — everything is wonky now! 🤣');}cheer(2);scriptSangria();break;}
    case'pool':donePool=true;addV(7);cheer(16);toast('💦 Cannonbaaall into the warm water!');SND.sfx('splash',{size:2,delay:0.45});playerAnim={type:'swim',t:0,sx:player.position.x,sz:player.position.z};break;
    case'jacuzzi':{doneJacuzzi=true;const tod=timeOfDay;addV(6);cheer(10);timeOfDay+=0.2;toast(tod>=20||tod<7?'🛁 Bubbles under the stars.':'🛁 Hot water, blazing sun — absolute bliss.');playerAnim={type:'jacuzzi',t:0,sx:player.position.x,sz:player.position.z};break;}
    case'sauna':doneSauna=true;addV(6);cheer(6);timeOfDay+=0.2;toast('🧖 Sauna steam — toasty.');scriptSauna();break;
    case'paella':donePaella=true;addV(9);cheer(14);timeOfDay+=0.5;toast('🥘 Giant paella on the fire — saffron everywhere!');scriptPaella();break;
    case'bbq':doneBBQ=true;addV(9);cheer(8);timeOfDay+=0.4;toast('🍤 BBQ on — prawns & sardines.');scriptBBQ();break;
    case'lounge':{doneLounge=true;addV(5);timeOfDay+=0.3;toast('😎 Pure horizontal excellence.');const score=k=>(hauntTaken[k]?1000:0)+Math.hypot(HAUNTS[k].x-player.position.x,HAUNTS[k].z-player.position.z);const lk=['lounger1','lounger2','lounger3'].sort((a,b)=>score(a)-score(b))[0];
      if(!hauntTaken[lk])hauntTaken[lk]='player';playerAnim={type:'lounge',t:0,sx:player.position.x,sz:player.position.z,h:HAUNTS[lk],hid:lk};break;}
    case'sea':doneSea=true;addV(6);cheer(14);toast('🌊 Warm Atlantic shallows.');scriptSea();break;
    case'ice':doneIce=true;addV(4);cheer(26);drunk=Math.max(0,drunk-0.5);ADULTS.forEach(id=>fam[id].mood=Math.min(100,fam[id].mood+8));toast('🍦 Ice creams all round — six happy faces.');scriptIce();break;
    case'nap':{const wasNight=timeOfDay>=21||timeOfDay<5;doneNap=true;drunk=0;scriptNap(wasNight);break;}
    case'stargaze':doneStargaze=true;addV(5);timeOfDay+=0.1;toast('⭐ Milky Way wall-to-wall. No light pollution out here.');scriptStargaze();break;
    case'sunset':doneSunset=true;addV(6);toast('🌅 Sky on fire. Every shade of orange and pink across the Atlantic.');scriptSunset();break;
    case'bed':scriptBed();return;
    case'car':if(drunk>=1){vibes=Math.max(0,vibes-10);toast('🚗🍷 No driving after sangria — sober up first!');}else{toast('🚗 Everyone in — Seville, here we come!');scriptCar(world.userData.car,'plaza');}break;
    case'sandcastle':addV(10);cheer(30);timeOfDay+=0.4;toast('🏖️ Epic four-towered sandcastle — the little one is DELIGHTED.');scriptSandcastle();break;
    case'nokid':toast('👶 The little one is with '+fam[kid.minder].def.name+' — go and grab them (or press the 👶 button).');break;
    case'sunscreen':sunscreenApplied=true;sunburnWarned=false;addV(2);toast('🧴 Factor 50 on. You are protected from the Cádiz sun.');scriptSunscreen();break;
    case'npc':talkTo(s.npc);break;
  }
  if(LOVE_TXT[s.id])familyReact(s.id);
}

// ===================== UPDATE =====================
function collide(){
  const list=scn==='plaza'?plazaSolids:(scn==='terminal'?terminalSolids:solids);
  for(const s of list){
    const dx=player.position.x-s.x, dz=player.position.z-s.z;
    if(Math.abs(dx)<s.rx&&Math.abs(dz)<s.rz){
      const ox=s.rx-Math.abs(dx), oz=s.rz-Math.abs(dz);
      if(ox<oz)player.position.x+=ox*Math.sign(dx||1);else player.position.z+=oz*Math.sign(dz||1);
    }
  }
}
function updateCabin(){
  const t=cabin.userData.time;          // frame-accumulated, so a hitch pauses the shot instead of jumping it
  const p=Math.min(1,t/6.5), ease=p*p*(3-2*p);
  // slow dolly down the aisle from a front 3/4 angle, gentle float
  cam.position.set(0.5-0.7*ease, 2.3+0.04*Math.sin(t*0.6), -3.4+1.0*ease);
  cam.lookAt(-0.1,1.1,7);
}
// boxes the follow camera must stay out of (villa + outbuildings)
const CAM_BLOCKERS=[[-10.7,0,16.5,10.7,9.1,27.5],[-14.4,0,4.8,-10.6,3.3,8.3],[26.8,0,-15.2,33.2,3.4,-10.8]];
function rayBoxT(ox,oy,oz,dx,dy,dz,boxes){let best=1;for(const b of boxes){let t0=0,t1=1,ok=true;const o=[ox,oy,oz],d=[dx,dy,dz];
  for(let a=0;a<3&&ok;a++){if(Math.abs(d[a])<1e-9){if(o[a]<b[a]||o[a]>b[a+3])ok=false;}else{let u0=(b[a]-o[a])/d[a],u1=(b[a+3]-o[a])/d[a];if(u0>u1){const q=u0;u0=u1;u1=q;}t0=Math.max(t0,u0);t1=Math.min(t1,u1);if(t0>t1)ok=false;}}
  if(ok&&t0<best)best=t0;}return best;}
function solidsFor(sc){return sc==='plaza'?plazaSolids:(sc==='terminal'?terminalSolids:(sc==='villa'?solids:[]));}
function update(dt){
  if(scn==='cabin'){cabin.userData.time+=dt;updateCabin();animateFamily(dt);return;}
  if(scn==='wingview'){wingview.userData.time+=dt;updateWingview();return;}
  if(scn==='landing'){landing.userData.time+=dt;updateLanding();return;}
  if(photoMode){updatePhoto(dt);updateEnv(dt);applyTime();updateHUD();$('prompt').style.opacity=0;$('hand').classList.add('hidden');actEdge=false;return;}
  const list=solidsFor(scn);
  // ---- activity animations ----
  if(playerAnim){
    playerAnim.t+=dt;
    const a=playerAnim,t=a.t,P=playerP;
    const ease=(f)=>{f=Math.max(0,Math.min(1,f));return f*f*(3-2*f);};
    if(a.type==='swim'){
      if(t<0.6){const e=ease(t/0.6);player.position.set(a.sx+(-6.8-a.sx)*e,0,a.sz+(5-a.sz)*e);player.rotation.y=Math.PI/2;if(t>0.25){P.pose='swim';P.py=-0.14;}}
      else if(t<4.2){const e=ease((t-0.6)/3.6);player.position.set(-6.8+e*13.6,0,5);player.rotation.y=Math.PI/2;P.pose='swim';P.py=-0.14;}
      else if(t<4.8){const e=ease((t-4.2)/0.6);player.position.set(6.8+e*0.6,0,5+e*4.6);P.pose='auto';}
      else{player.position.set(7.4,0,9.6);player.rotation.y=Math.PI;playerYaw=Math.PI;P.pose='auto';playerAnim=null;}
    } else if(a.type==='jacuzzi'){
      if(t<0.6){const e=ease(t/0.6);player.position.set(a.sx+(9.7-a.sx)*e,0,a.sz+(5.9-a.sz)*e);player.rotation.y=lerpAng(player.rotation.y,Math.PI,e);if(t>0.3){P.pose='soak';P.seatH=0.55;}}
      else if(t<4.4){player.position.set(9.7,0,5.9);player.rotation.y=Math.PI;P.pose='soak';P.seatH=0.55;}
      else if(t<5.0){const e=ease((t-4.4)/0.6);player.position.set(9.7,0,5.9+e*1.9);P.pose='auto';}
      else{player.position.set(9.7,0,7.8);playerYaw=player.rotation.y;P.pose='auto';playerAnim=null;}
    } else if(a.type==='lounge'){const h=a.h;
      if(t<0.6){const e=ease(t/0.6);player.position.set(a.sx+(h.x-a.sx)*e,0,a.sz+(h.z-a.sz)*e);player.rotation.y=lerpAng(player.rotation.y,h.yaw,e);if(t>0.3){P.pose='recline';P.seatH=h.seatH;}}
      else if(t<4.4){player.position.set(h.x,0,h.z);player.rotation.y=h.yaw;P.pose='recline';}
      else if(t<5.0){const e=ease((t-4.4)/0.6);player.position.set(h.x+(h.ap.x-h.x)*e,0,h.z+(h.ap.z-h.z)*e);P.pose='auto';}
      else{player.position.set(h.ap.x,0,h.ap.z);playerYaw=player.rotation.y;P.pose='auto';if(hauntTaken[a.hid]==='player')delete hauntTaken[a.hid];playerAnim=null;}
    } else if(a.type==='script')stepScript(a,dt);
    if(a.type!=='script'){P.lx=player.position.x;P.lz=player.position.z;}
  } else {
  playerP.pose='auto';
  // input vector
  let ix=mv.x,iz=mv.z;
  if(keys['a']||keys['arrowleft'])ix=-1;if(keys['d']||keys['arrowright'])ix=1;
  if(keys['w']||keys['arrowup'])iz=-1;if(keys['s']||keys['arrowdown'])iz=1;
  const len=Math.hypot(ix,iz);
  if(len>0){
    ix/=len;iz/=len;
    // rotate by camera yaw so movement is camera-relative
    const sin=Math.sin(camYaw),cos=Math.cos(camYaw);
    let wx=-iz*sin - ix*cos, wz=-iz*cos + ix*sin;
    if(drunk>1){const sway=Math.sin(performance.now()*0.006)*0.4*(drunk-1);const ca=Math.cos(sway),sa=Math.sin(sway);const nx=wx*ca-wz*sa,nz=wx*sa+wz*ca;wx=nx;wz=nz;}
    const sp=(drunk>1?7.5:9)*(scn==='bed'?0.55:1);
    player.position.x+=wx*sp*dt;player.position.z+=wz*sp*dt;
    playerYaw=Math.atan2(wx,wz);
  }
  if(drunk>1){player.position.x+=Math.sin(performance.now()*0.004)*drunk*0.012;player.position.z+=Math.cos(performance.now()*0.0035)*drunk*0.01;}
  // face direction smoothly (shortest way round)
  player.rotation.y=lerpAng(player.rotation.y,playerYaw,Math.min(1,dt*12));
  // bounds
  const PB=plaza.userData.bounds;const minZ=scn==='bed'?-4.5:(scn==='plaza'?PB.minZ:(scn==='terminal'?-38:-44)); const maxZ=scn==='bed'?5.5:(scn==='plaza'?PB.maxZ:(scn==='terminal'?24:46)); const lim=scn==='bed'?6.4:(scn==='plaza'?PB.lim:(scn==='terminal'?27:58));
  player.position.x=Math.max(-lim,Math.min(lim,player.position.x));
  player.position.z=Math.max(minZ,Math.min(maxZ,player.position.z));
  if(scn==='villa'||scn==='plaza'||scn==='terminal')collide();
  if(scn==='bed'){const b=kidsRoom.userData.bed;pushOut(player.position,[{x:b.x,z:b.z,rx:1.9,rz:1.3},{x:2.4,z:-3.6,rx:0.9,rz:0.9},{x:4.6,z:-1.2,rx:1.1,rz:0.8},{x:-4.8,z:-1.4,rx:1.3,rz:1.3}],0);}
  } // end !playerAnim
  animPerson(playerP,dt);

  // ---- family ----
  if(scn==='villa')npcs.forEach(n=>npcVilla(n,dt));
  else if(scn==='plaza'||scn==='terminal')npcs.forEach((n,i)=>npcFollow(n,i,dt,list));
  updateKid(dt,list);
  npcs.forEach(n=>{if(n.p.root.visible)animPerson(n.p,dt);});
  if(kid.p.root.visible)animPerson(kid.p,dt);
  updateMoods(dt);

  // collectibles
  if(scn==='villa'){
    for(let i=collectibles.length-1;i>=0;i--){const c=collectibles[i];
      if(Math.hypot(player.position.x-c.x,player.position.z-c.z)<2){
        world.remove(c.mesh);collectibles.splice(i,1);SND.sfx('sparkle');addV(2);scriptPickup(c.type);
        if(c.type==='shell'){shellsTotal++;$('shellCount').textContent=shellsTotal;cheer(4);toast('🐚 Shell pocketed!');}
        else{orangesTotal++;$('orangeCount').textContent=orangesTotal;toast('🍊 Fresh Seville orange.');}
      }}
  }

  // pulse activity beacons
  if(scn==='villa'&&world){const bp=0.5+Math.sin(performance.now()*0.0025)*0.5;if(world.userData.stargazeBeacon){const b=world.userData.stargazeBeacon;const on=!doneStargaze&&(timeOfDay>=21||timeOfDay<6);b.visible=on;if(on){b.children[0].material.opacity=0.08+bp*0.22;b.children[1].material.opacity=0.06+bp*0.16;}}if(world.userData.sunsetBeacon){const b=world.userData.sunsetBeacon;const on=!doneSunset&&timeOfDay>=17&&timeOfDay<19;b.visible=on;if(on){b.children[0].material.opacity=0.08+bp*0.22;b.children[1].material.opacity=0.06+bp*0.16;}}}

  // action / prompt
  if(playerAnim){$('prompt').style.opacity=0;actEdge=false;handEdge=false;}
  else{const s=nearest();const pr=$('prompt');if(s){pr.style.opacity=1;pr.innerHTML='<b>[DO IT]</b> '+s.label;}else pr.style.opacity=0;if(actEdge){doAction(s);actEdge=false;}}
  {const h=handTarget(),hb=$('hand');if(h){hb.classList.remove('hidden');hb.innerHTML=h.give?'👶<small>hand to<br>'+h.n.def.name+'</small>':'👶<small>take<br>back</small>';}else hb.classList.add('hidden');if(handEdge){doHand();handEdge=false;}}

  // bedtime/wakeup penalties
  if(!todsAsleep&&timeOfDay>=19){
    vibes=Math.max(0,vibes-dt*0.35);
    if(!bedtimeWarned){bedtimeWarned=true;toast('😬 Bedtime was 7pm — get the little one to bed!');}
  }
  if(todsAsleep&&timeOfDay>=7&&timeOfDay<21){
    vibes=Math.max(0,vibes-dt*0.22);
    if(!wakeupWarned){wakeupWarned=true;toast('☀️ The little one is awake and shouting for you — go and get them!');}
  }
  // reset bedtime warning each evening so it can fire the next day
  if(timeOfDay>=18&&timeOfDay<18.08) bedtimeWarned=false;
  // sunburn: drain vibes if no sunscreen during peak sun hours
  if(!sunscreenApplied&&scn==='villa'&&timeOfDay>=9&&timeOfDay<18){vibes=Math.max(0,vibes-dt*0.12);if(!sunburnWarned){sunburnWarned=true;toast('🔴 You\'re getting burnt! Find the sunscreen 🧴');}}
  // reset sunscreen each morning
  if(timeOfDay>=6&&timeOfDay<6.06){sunscreenApplied=false;sunburnWarned=false;wakeupWarned=false;}

  // hearts
  for(let i=hearts.length-1;i>=0;i--){const h=hearts[i];h.grp.position.y+=dt*1.6;h.grp.rotation.y+=dt*3;h.life-=dt;h.grp.scale.setScalar(Math.max(0.01,Math.min(1,h.life*1.6)));h.grp.children[0].material.opacity=Math.min(1,h.life*1.5);if(h.life<=0){scene.remove(h.grp);hearts.splice(i,1);}}
  if(scn==='terminal'&&terminal.userData.bags){const t=performance.now()*0.001;terminal.userData.bags.children.forEach(b=>{const a=(b.userData.ph+t*0.03)*Math.PI*2;b.position.set(-6+Math.cos(a)*8.6,0.62,9+Math.sin(a)*5.2);b.rotation.y=-a;});}
  if(scn==='plaza'&&plaza.userData.boats){const t=performance.now()*0.001;const C=plaza.userData.canal;plaza.userData.boats.forEach(b=>{b.t+=b.s*dt;if(b.t<C.t0+0.05)b.s=Math.abs(b.s);if(b.t>C.t1-0.05)b.s=-Math.abs(b.s);
      const x=C.a*Math.cos(b.t),z=C.b*Math.sin(b.t),tx=-C.a*Math.sin(b.t)*Math.sign(b.s),tz=C.b*Math.cos(b.t)*Math.sign(b.s);b.m.position.set(x,0.3+Math.sin(t*1.3+b.t*9)*0.04,z);b.m.rotation.y=Math.atan2(-tz,tx);});
    const sp=plaza.userData.spray;if(sp){sp.scale.set(1+Math.sin(t*3)*0.05,1+Math.sin(t*2.3)*0.08,1+Math.sin(t*3)*0.05);}}
  updateFX(dt);
  if(scn==='villa'&&vendor){vendor.lookAt=player.position;animPerson(vendor,dt);}
  // bedroom mobile
  if(scn==='bed'&&kidsRoom.userData.mobile)kidsRoom.userData.mobile.rotation.y+=dt*0.35;

  updateEnv(dt);

  // clock
  if(scn!=='terminal'){timeOfDay+=dt*0.025;if(timeOfDay>=24){timeOfDay-=24;day++;}}
  applyTime();refreshEnv();
  drunk=Math.max(0,drunk-dt*0.00833); // ~3 game-hours per unit to sober up

  // camera follow (third person, camera-relative yaw)
  const dist=scn==='bed'?12:15,height=scn==='bed'?7.5:9;
  let cx=player.position.x - Math.sin(camYaw)*dist;
  let cz=player.position.z - Math.cos(camYaw)*dist, cy=Math.max(0,player.position.y)+height;
  // don't let the camera sink into the villa: pull it in along the view line
  if(scn==='villa'){const ox=player.position.x,oy=Math.max(0,player.position.y)+2,oz=player.position.z;const t=rayBoxT(ox,oy,oz,cx-ox,cy-oy,cz-oz,CAM_BLOCKERS);
    if(t<1){const k=Math.max(0.25,t-0.06);cx=ox+(cx-ox)*k;cy=oy+(cy-oy)*k+ (1-k)*2.5;cz=oz+(cz-oz)*k;}}
  else if(scn==='plaza'){const FA=PLZ.fa*PLZ.s-3,FB=PLZ.fb*PLZ.s-3,ox=player.position.x,oz=player.position.z,out=(x,z)=>(z<18&&(x/FA)**2+(z/FB)**2>1)||(Math.abs(x)<30&&z<-FB+12);
    if(out(cx,cz)){let lo=0,hi=1;for(let k=0;k<12;k++){const m=(lo+hi)/2;if(out(ox+(cx-ox)*m,oz+(cz-oz)*m))hi=m;else lo=m;}const k=Math.max(0.2,lo);cx=ox+(cx-ox)*k;cz=oz+(cz-oz)*k;cy+= (1-k)*4;}}
  if(camBlend<0.001)camFollow.copy(cam.position);
  {const kf=Math.min(1,dt*5);camFollow.x+=(cx-camFollow.x)*kf;camFollow.y+=(cy-camFollow.y)*kf;camFollow.z+=(cz-camFollow.z)*kf;}
  const dsx=drunk>1?Math.sin(performance.now()*0.003)*(drunk-1)*1.6:0;
  _lookF.set(player.position.x+dsx,Math.max(0,player.position.y)+2+camPitch,player.position.z);
  // activity cut-aways (stargazing, sunsets) blend smoothly in and out of the follow camera
  if(scriptCam)lastScriptCam=scriptCam;camBlend+=((scriptCam?1:0)-camBlend)*Math.min(1,dt*2.2);if(!scriptCam&&camBlend<0.002)camBlend=0;
  if(camBlend>0&&lastScriptCam){const b=camBlend*camBlend*(3-2*camBlend);cam.position.copy(camFollow).lerp(lastScriptCam.p,b);_camLook.copy(_lookF).lerp(lastScriptCam.l,b);cam.lookAt(_camLook);}
  else{cam.position.copy(camFollow);cam.lookAt(_lookF);}
  {const fw=(camBlend>0&&cam.aspect<1)?55+13*camBlend*camBlend*(3-2*camBlend):55;if(Math.abs(cam.fov-fw)>0.01){cam.fov=fw;cam.updateProjectionMatrix();}}

  // transition
  if(fadeDir===1){fade+=dt*2.2;if(fade>=1){fade=1;setScene(pending);fadeDir=-1;}}
  else if(fadeDir===-1){fade-=dt*2.2;if(fade<=0){fade=0;fadeDir=0;}}
  {let filt='';if(fade>0)filt+='brightness('+(1-fade)+') ';if(drunk>=2)filt+='blur('+Math.min(2,(drunk-1)*0.8)+'px) saturate(1.15) ';$('c').style.filter=filt||'none';}

  updateHUD();
  if(vibes>=100&&!won){won=true;toast('🎉 Best. Holiday. Ever.');}
}
function updateHUD(){
  $('vibesFill').style.width=vibes+'%';$('vibesPct').textContent=Math.round(vibes)+'%';
  const hh=Math.floor(timeOfDay),mm=Math.floor((timeOfDay-hh)*60);
  $('time').textContent=String(hh).padStart(2,'0')+':'+String(mm).padStart(2,'0');
  const part=timeOfDay<7?'dawn':timeOfDay<12?'morning':timeOfDay<17?'afternoon':timeOfDay<20?'golden hour':'evening';
  $('day').textContent='Day '+day+' · '+part;
  const td=$('tods');for(const el of td.children){const f=fam[el.dataset.id];el.classList.toggle('happy',f&&f.mood>55);}
  const tip=$('tipsy');if(tip)tip.textContent=drunk>=1?(' · 🍷×'+Math.ceil(drunk)):'';
  updateItinerary();
}
// ambient world animation (also runs behind the title screen)
function updateEnv(dt){
  const now=performance.now()*0.001;
  // sailboat orbits
  if(world.userData.sailboats){world.userData.sailboats.forEach(function(b){b.a+=b.spd*dt;b.mesh.position.x=b.cx+Math.cos(b.a)*b.r;b.mesh.position.z=b.cz+Math.sin(b.a)*b.r;b.mesh.rotation.y=-b.a+Math.PI/2;});}
  // bird flight
  if(world.userData.birds){world.userData.birds.forEach(function(b){b.a+=b.spd*dt;b.mesh.position.set(b.cx+Math.cos(b.a)*b.r,b.cy+Math.sin(b.a*0.3)*6,b.cz+Math.sin(b.a)*b.r);b.mesh.rotation.y=-b.a+Math.PI/2;const flap=Math.sin(now*b.fp+b.fa)*0.42;b.mesh.userData.lw.rotation.z=flap;b.mesh.userData.rw.rotation.z=-flap;});}
  // clouds drift slowly
  clouds.forEach((c,i)=>{c.position.x+=dt*(6+i%3*2);if(c.position.x>6500)c.position.x=-6500;});
  if(!world.visible)return;
  // sea swell
  if(world.userData.sea){const sg=world.userData.sea.geometry;const pa=sg.attributes.position;const tm=now;
    for(let k=0;k<pa.count;k++){const xx=pa.getX(k),yy=pa.getY(k);
      const taper=Math.min(1,Math.max(0,(yy+3000-60)/600));      // calm near the shore, full swell offshore
      const swell=Math.sin(yy*0.16 + tm*2.0) + 0.5*Math.sin(yy*0.33 + xx*0.05 + tm*2.7);
      const ripple=Math.sin(xx*0.10 + tm*1.5)*0.35;
      let disp=(swell+ripple)*0.26*taper;                     // amplitude scales from 0 at shore
      if(disp<-0.06) disp=-0.06;                                // clamp troughs so they never undercut the sand
      pa.setZ(k,disp);}
    pa.needsUpdate=true;sg.computeVertexNormals();sg.computeBoundingSphere();
    const sn=world.userData.seaN;if(sn){sn.offset.x=now*0.012;sn.offset.y=now*0.02;}}
  // sea shimmer canvas (wave lines + sparkles)
  if(world.userData.shimCtx){
    const sc=world.userData.shimCtx,sw=128,sh=128,tm=now;
    const dayB=timeOfDay>=8&&timeOfDay<18?1:timeOfDay>=6&&timeOfDay<8?(timeOfDay-6)/2:timeOfDay>=18&&timeOfDay<20?(20-timeOfDay)/2:0;
    sc.fillStyle='#000000';sc.fillRect(0,0,sw,sh);
    if(dayB>0){
      for(let wi=0;wi<7;wi++){const prog=((wi/7+tm*0.035)%1);const yt=prog*sh;const al=Math.sin(prog*Math.PI)*0.60*dayB;if(al<0.04)continue;sc.strokeStyle='rgba(255,255,255,'+al+')';sc.lineWidth=1.2;sc.beginPath();for(let x=0;x<=sw;x+=3){const y=yt+Math.sin(x*0.13+tm*0.9+wi*1.5)*3.5;x===0?sc.moveTo(x,y):sc.lineTo(x,y);}sc.stroke();}
      for(let si=0;si<22;si++){const sx=((Math.sin(si*1.73+tm*0.22))*0.5+0.5)*sw;const sy=((Math.sin(si*2.31+tm*0.17))*0.5+0.5)*sh;const sa=Math.max(0,Math.sin(si*0.83+tm*1.4))*0.72*dayB;if(sa<0.08)continue;const gr=sc.createRadialGradient(sx,sy,0,sx,sy,5);gr.addColorStop(0,'rgba(255,255,255,'+sa+')');gr.addColorStop(1,'rgba(0,0,0,0)');sc.fillStyle=gr;sc.fillRect(sx-5,sy-5,10,10);}
    }
    world.userData.shimTex.needsUpdate=true;
    world.userData.sea.material.emissiveIntensity=dayB*0.3;
  }
  // rolling shore waves
  if(world.userData.waveCrests){world.userData.waveCrests.forEach(function(wc,wi){const phase=((now*0.55+wi*0.25)%1);wc.position.z=-54+phase*9;wc.material.opacity=Math.sin(phase*Math.PI)*0.68;});}
  // pool ripples + caustics, jacuzzi bubbles
  if(world.userData.poolTex){world.userData.poolTex.offset.set(now*0.02,Math.sin(now*0.5)*0.03);}
  if(world.userData.caustic){world.userData.caustic.offset.set(Math.sin(now*0.23)*0.12+now*0.01,Math.cos(now*0.19)*0.1);}
  if(world.userData.jacTex){world.userData.jacTex.offset.set(now*0.08,now*0.05);}
  if(world.userData.bubbles){world.userData.bubbles.children.forEach(b=>{b.userData.ph+=dt*1.4;const f=b.userData.ph%1;b.position.y=0.62+f*0.42;b.material.opacity=0.75*(1-f);});}
}
let _lastItinPeriod='';
function updateItinerary(){
  const tod=timeOfDay;
  let period,items;
  const t_=(s,d)=>d?'✅ '+s:s;
  if(tod>=5&&tod<9){period='dawn / morning';items=[
    todsAsleep?'🌅 Go and get the little one up':t_('☀️ Morning swim — pool is warm',donePool),
    t_('🏖️ Walk on La Barrosa beach',doneSea),
    t_('🍦 Grab ice creams from the chiringuito',doneIce),
    t_('🐚 Collect shells along the shore',doneSea)];}
  else if(tod>=9&&tod<13){period='mid-morning';items=[
    t_('💦 Dive into the heated pool',donePool),
    t_('😎 Sun loungers are free',doneLounge),
    t_('🥘 Fire up the paella station — Nana approves',donePaella),
    '👵 Hand the little one to Nana for a bit'];}
  else if(tod>=13&&tod<17){period='afternoon';items=[
    t_('🧖 Sauna session — then cold pool',doneSauna),
    t_('🏖️ Beach time with the little one',doneSea),
    t_('🍦 Second ice cream run (why not)',doneIce),
    t_('😎 Horizontal excellence on the lounger',doneLounge)];}
  else if(tod>=17&&tod<19){period='golden hour';items=[
    t_('🌅 Watch the sunset — follow the orange glow',doneSunset),
    t_('🍤 BBQ on the east terrace — Papa\'s favourite',doneBBQ),
    t_('🛁 Jacuzzi with Auntie',doneJacuzzi),
    t_('🍷 Sangria + sunset — essential',doneSangria)];}
  else if(tod>=19&&tod<21){period='evening';items=[
    todsAsleep?'✅ Little one tucked in — nice work':'😬 Bedtime is now — get the little one to bed!',
    t_('🍷 Nightcap on the terrace',doneSangria),
    t_('🛁 Jacuzzi under the stars',doneJacuzzi),
    t_('⭐ Stars are out — follow the blue glow',doneStargaze)];}
  else{period='night';items=[
    todsAsleep?'✅ Little one sleeping soundly':'🛏️ The little one still needs to go to bed!',
    t_('⭐ Star-gazing — follow the blue glow',doneStargaze),
    t_('🛁 Jacuzzi to wind down',doneJacuzzi),
    t_('🛏️ Go to bed when ready',doneNap)];}
  if(period!==_lastItinPeriod){
    _lastItinPeriod=period;
    $('itin-period').textContent=period;
    const ul=$('itin-list');ul.innerHTML='';
    items.forEach(function(t){const li=document.createElement('li');li.textContent=t;ul.appendChild(li);});
  } else {
    const ul=$('itin-list');
    items.forEach(function(t,i){if(ul.children[i]&&ul.children[i].textContent!==t)ul.children[i].textContent=t;});
  }
}
function setScene(to){
  const from=scn;
  scn=to;
  world.visible=(to==='villa');plaza.visible=(to==='plaza');terminal.visible=(to==='terminal');cabin.visible=(to==='cabin');
  if(wingview)wingview.visible=(to==='wingview');if(landing)landing.visible=(to==='landing');
  if(kidsRoom)kidsRoom.visible=false;
  [world.userData.car,plaza.userData.carMesh,terminal.userData.carMesh].forEach(c=>{if(c&&c.userData.home)c.position.copy(c.userData.home);});
  skyGroup.visible=(to==='villa'||to==='plaza'||to==='terminal'||to==='wingview'||to==='landing');
  scene.background=new T.Color(0x0d1421);
  player.visible=(to!=='wingview'&&to!=='landing');
  cam.near=to==='wingview'?2:(to==='landing'?0.5:0.1);cam.far=to==='wingview'?40000:16000;
  if(to==='cabin'){cabin.userData.time=0;cam.fov=62;cam.updateProjectionMatrix();familyToScene(to,from);return;}
  if(to==='wingview'){wingview.userData.time=0;cam.fov=62;cam.updateProjectionMatrix();familyToScene(to,from);return;}
  if(to==='landing'){landing.userData.time=0;cam.fov=62;cam.updateProjectionMatrix();familyToScene(to,from);return;}
  cam.fov=55;cam.updateProjectionMatrix();
  if(to==='terminal'){timeOfDay=10.5;setTimeout(()=>toast('🚗 Your rental car is waiting outside — head for the exit!'),600);}
  else if(to==='villa'&&from==='terminal'){timeOfDay=18.0;}
  if(to==='plaza'){player.position.set(plaza.userData.start.x,0,plaza.userData.start.z);camYaw=Math.PI;}
  else if(to==='terminal'){player.position.set(0,0,5);camYaw=Math.PI;camPitch=5;}
  else{player.position.set(-18,0,22);camYaw=Math.PI;}
  player.rotation.y=Math.PI;playerYaw=Math.PI;placePerson(playerP,player.position.x,player.position.z,Math.PI);playerP.pose='auto';
  familyToScene(to,from);
  cam.position.set(player.position.x,player.position.y+9,player.position.z+15);
  applyTime();refreshEnv(true);
}
// ---- time of day: palette keyframes blended smoothly ----
const PAL=[
  {t:0,   top:0x040914,mid:0x0a1428,hor:0x18284a,gnd:0x0b0f18,sun:0x9fb4ff,si:0.3, hs:0x40508a,hg:0x141418,hi:0.4, fog:0x16223a,fd:0.000294,sea:0x0a2638,ex:1.0, glow:0x000000,cl:0x1c2438,ca:0.3},
  {t:5.8, top:0x050b18,mid:0x0e1832,hor:0x2a2a50,gnd:0x0b0f18,sun:0x9fb4ff,si:0.3, hs:0x40508a,hg:0x141418,hi:0.4, fog:0x1e2440,fd:0.000294,sea:0x0a2638,ex:1.0, glow:0x000000,cl:0x1c2438,ca:0.3},
  {t:6.7, top:0x1a2c60,mid:0x5a4a80,hor:0xf09a78,gnd:0x3a3036,sun:0xffb890,si:0.45,hs:0x8a8ab0,hg:0x5a4a40,hi:0.45,fog:0xc08878,fd:0.000336,sea:0x1a5068,ex:1.05,glow:0xff9a60,cl:0xf0a890,ca:0.8},
  {t:7.7, top:0x2a64b0,mid:0x86b4e0,hor:0xffd4a8,gnd:0x8a7a60,sun:0xffd8a8,si:0.95,hs:0xb8d4f0,hg:0xb09070,hi:0.45,fog:0xe8c8a8,fd:0.000252,sea:0x1a7890,ex:1.05,glow:0xffc080,cl:0xfff0e0,ca:0.9},
  {t:9.3, top:0x1d62b8,mid:0x58a6e6,hor:0xcfe8f6,gnd:0xa89878,sun:0xfff2dc,si:1.25,hs:0xcfe6ff,hg:0xc8ad85,hi:0.42,fog:0xc0dcee,fd:0.000186,sea:0x1a90b8,ex:1.03,glow:0xfff0c0,cl:0xffffff,ca:0.95},
  {t:12.5,top:0x1656ae,mid:0x3c9ae0,hor:0xc0e6fc,gnd:0xb0a080,sun:0xfffaf0,si:1.35,hs:0xd0e8ff,hg:0xd0b48a,hi:0.42,fog:0xb8daf0,fd:0.000168,sea:0x1f9fc4,ex:1.02,glow:0xfff4d0,cl:0xffffff,ca:0.95},
  {t:16.5,top:0x1a5aae,mid:0x48a0e0,hor:0xd4eaf4,gnd:0xb0a080,sun:0xfff0d6,si:1.3, hs:0xd0e6ff,hg:0xd0b48a,hi:0.42,fog:0xc8e0ec,fd:0.000186,sea:0x1f98bc,ex:1.03,glow:0xfff0c0,cl:0xffffff,ca:0.95},
  {t:18.3,top:0x2a58a0,mid:0x80a8cc,hor:0xffcc88,gnd:0x9a8060,sun:0xffc88a,si:1.2,hs:0xc8ccdc,hg:0xb89878,hi:0.45,fog:0xf0c890,fd:0.000252,sea:0x1a7c96,ex:1.08,glow:0xffa040,cl:0xffe0b0,ca:0.95},
  {t:19.6,top:0x2c3470,mid:0xb46a8c,hor:0xffa058,gnd:0x6a5048,sun:0xffa870,si:0.75,hs:0xa89ab8,hg:0x8a6858,hi:0.42,fog:0xe0a080,fd:0.000336,sea:0x1a5a78,ex:1.1, glow:0xff6020,cl:0xff9a7a,ca:0.9},
  {t:20.5,top:0x10183e,mid:0x3a3070,hor:0xb8605a,gnd:0x2a2028,sun:0x9a88ff,si:0.35,hs:0x5a5890,hg:0x2a2028,hi:0.4, fog:0x4a3a5a,fd:0.000336,sea:0x12344a,ex:1.05,glow:0xc04030,cl:0x6a4a6a,ca:0.6},
  {t:21.4,top:0x040914,mid:0x0a1428,hor:0x18284a,gnd:0x0b0f18,sun:0x9fb4ff,si:0.3, hs:0x40508a,hg:0x141418,hi:0.4, fog:0x16223a,fd:0.000294,sea:0x0a2638,ex:1.0, glow:0x000000,cl:0x1c2438,ca:0.3},
  {t:24,  top:0x040914,mid:0x0a1428,hor:0x18284a,gnd:0x0b0f18,sun:0x9fb4ff,si:0.3, hs:0x40508a,hg:0x141418,hi:0.4, fog:0x16223a,fd:0.000294,sea:0x0a2638,ex:1.0, glow:0x000000,cl:0x1c2438,ca:0.3}];
const _ca=new T.Color(),_cb=new T.Color(),_sunV=new T.Vector3(),_moonV=new T.Vector3(),_lightV=new T.Vector3();
function palAt(t){let a=PAL[0],b=PAL[1];for(let k=0;k<PAL.length-1;k++){if(t>=PAL[k].t&&t<PAL[k+1].t){a=PAL[k];b=PAL[k+1];break;}}const f=(t-a.t)/(b.t-a.t);
  const col=(key,out)=>out.setHex(a[key]).lerp(_cb.setHex(b[key]),f);const num=key=>a[key]+(b[key]-a[key])*f;return {col,num,f};}
function refreshEnv(force){
  if(!pmrem)return;const d=Math.abs(timeOfDay-envT);if(!force&&d<0.25&&d<23.75)return;envT=timeOfDay;
  const rt=pmrem.fromScene(envScene,0.02,0.1,200);if(envRT)envRT.dispose();envRT=rt;scene.environment=rt.texture;}
function applyTime(){
  const td=timeOfDay,P=palAt(td);
  // sky dome uniforms (hex authored in sRGB → linear for the shader)
  const u=skyMat.uniforms;
  P.col('top',u.top.value).convertSRGBToLinear();P.col('mid',u.mid.value).convertSRGBToLinear();P.col('hor',u.hor.value).convertSRGBToLinear();P.col('gnd',u.gnd.value).convertSRGBToLinear();
  P.col('glow',u.sunCol.value).convertSRGBToLinear();
  // sun path: rises inland (+z), arcs south (+x), sets over the Atlantic (-z)
  const pr=Math.max(-0.3,Math.min(1.3,(td-7.3)/(20.4-7.3))),az=pr*Math.PI,el=Math.sin(pr*Math.PI)*0.95;
  _sunV.set(Math.sin(az)*Math.cos(el),Math.sin(el),Math.cos(az)*Math.cos(el));
  u.sunDir.value.copy(_sunV);u.glow.value=Math.max(0,Math.min(1,el*6+0.6));
  const nt=td>=19?(td-19)/14:(td+5)/14,mel=Math.sin(Math.max(0,Math.min(1,nt))*Math.PI)*1.1,maz=(0.5-nt)*Math.PI;
  _moonV.set(Math.sin(maz)*Math.cos(mel),Math.max(0.25,Math.sin(mel)),-Math.cos(maz)*Math.cos(mel)).normalize();
  // light: sun by day, moon by night, blended through dusk/dawn
  const mf=td>=12?Math.max(0,Math.min(1,(td-20.1)/0.9)):Math.max(0,Math.min(1,(7.4-td)/0.9));
  _lightV.copy(_sunV);if(_lightV.y<0.06){_lightV.y=0.06;_lightV.normalize();}
  _lightV.lerp(_moonV,mf).normalize();
  sun.color.copy(P.col('sun',_ca)).convertSRGBToLinear();sun.intensity=P.num('si');
  const tgt=player?player.position:new T.Vector3();
  sun.position.set(tgt.x+_lightV.x*140,tgt.y+_lightV.y*140,tgt.z+_lightV.z*140);sun.target.position.copy(tgt);sun.target.updateMatrixWorld();
  hemi.color.copy(P.col('hs',_ca)).convertSRGBToLinear();hemi.groundColor.copy(P.col('hg',_ca)).convertSRGBToLinear();hemi.intensity=P.num('hi');
  scene.fog.color.copy(P.col('fog',_ca)).convertSRGBToLinear();scene.fog.density=P.num('fd');
  renderer.toneMappingExposure=P.num('ex');
  if(world&&world.userData.sea)P.col('sea',world.userData.sea.material.color).convertSRGBToLinear();
  const night=Math.max(0,Math.min(1,td>=12?(td-20.2)/1.0:(6.4-td)/0.8));
  if(world&&world.userData.birds){const isDay=td>=6.5&&td<20.8;world.userData.birds.forEach(function(b){b.mesh.visible=isDay;});}
  const st=scene.userData.stars;if(st){st.visible=night>0.02;st.material.opacity=night;}
  const mm=scene.userData.moonMesh;if(mm){mm.visible=night>0.05;mm.position.copy(_moonV).multiplyScalar(7200);mm.lookAt(0,0,0);mm.material.opacity=night;}
  const sm=scene.userData.sunMesh;
  if(sm){sm.visible=el>-0.06;if(sm.visible){sm.position.copy(_sunV).multiplyScalar(7400);const lo=Math.max(0,Math.min(1,1-el*3));
    sm.material.color.setHex(0xfffce0).lerp(_cb.setHex(0xff6a20),lo).convertSRGBToLinear();sm.children[0].material.color.setHex(0xffe070).lerp(_cb.setHex(0xff3a10),lo).convertSRGBToLinear();sm.children[0].material.opacity=0.15+lo*0.35;}}
  const cc=P.col('cl',_ca).convertSRGBToLinear(),ca=P.num('ca');clouds.forEach(c=>{c.material.color.copy(cc);c.material.opacity=ca;});
  // night lights: smooth fade in after 20:00, fade out after 07:00
  const nb=td<6?1:td<7?7-td:td<20?0:td<21?td-20:1;
  if(world){
    (world.userData.lampLights||[]).forEach(function(e){e.pl.intensity=nb*1.8;e.halo.material.opacity=nb*0.75;});
    if(world.userData.lampLens)world.userData.lampLens.color.setRGB(0.66+nb*1.3,0.64+nb*1.1,0.58+nb*0.62);
    (world.userData.entrLights||[]).forEach(function(e){e.pl.intensity=nb*1.4+(1-nb)*0.3;e.halo.material.opacity=nb*0.55+(1-nb)*0.18;});
    if(world.userData.dring){const pt=performance.now()*0.001;world.userData.dring.material.opacity=0.38+0.22*Math.sin(pt*1.6);}
    if(world.userData.doorArrow){const da=world.userData.doorArrow;const showBed=!todsAsleep&&td>=19;const showWake=todsAsleep&&td>=6&&td<21;da.visible=scn==='villa'&&started&&(showBed||showWake);if(da.visible){const pt=performance.now()*0.001;da.position.y=11+Math.sin(pt*2.2)*0.6;const col=showBed?0xff5020:0x44dd44;da.children.forEach(function(c){c.material.color.setHex(col).convertSRGBToLinear();});}}
    if(world.userData.lighthouse){const L=world.userData.lighthouse,fl=(performance.now()/1000)%3<0.7?1:0;L.beam.material.opacity=nb*fl*0.85;L.lant.material.emissiveIntensity=0.3+nb*fl*2.5;}
    if(world.userData.poolPL)world.userData.poolPL.intensity=nb*1.6;
    if(world.userData.poolGlow)world.userData.poolGlow.material.opacity=nb*0.18;
    if(world.userData.water){world.userData.water.material.emissive.setHex(0x0a6a9a).convertSRGBToLinear();world.userData.water.material.emissiveIntensity=nb*0.35;}
    if(world.userData.poolFloor){world.userData.poolFloor.emissiveIntensity=0.08+0.45*Math.max(0,Math.min(1,el*3))+nb*0.35;}
  }
}

// ===================== FAMILY: roles, AI, interactions =====================
function buildFamily(){
  buildVendor();
  FAMILY_ORDER.forEach(id=>{const def=FAMILY[id];const p=makePerson(def);scene.add(p.root);
    fam[id]={id,def,p,mood:48,state:'idle',path:[],haunt:null,stayT:0,lastHaunt:null,talkI:0,react:0,tw:null};});
  kid=fam.toddler;kid.minder='player';kid.untilAbs=0;kid.hop=0;kid.t=0;
  setPlayerChar('mum');
  lineupTitle();
}
function setPlayerChar(id){
  playerId=id;playerP=fam[id].p;player=playerP.root;
  npcs=ADULTS.filter(a=>a!==id).map(a=>fam[a]);
  npcs.forEach(n=>{n.p.lookAt=player.position;});playerP.lookAt=null;
  document.querySelectorAll('#tods .tod').forEach(el=>el.classList.toggle('me',el.dataset.id===id));
}
function buildPicker(){
  const pk=$('picker');if(!pk)return;
  ADULTS.forEach(id=>{const d=FAMILY[id],b=document.createElement('button');b.className='pk'+(id===playerId?' on':'');b.dataset.id=id;
    b.innerHTML='<span class="e">'+d.emoji+'</span><b>'+d.name+'</b><small>'+d.tag+'</small>';
    b.addEventListener('click',e=>{e.stopPropagation();setPlayerChar(id);pk.querySelectorAll('.pk').forEach(x=>x.classList.toggle('on',x.dataset.id===id));});
    pk.appendChild(b);});
  setPlayerChar(playerId);
}
const absNow=()=>day*24+timeOfDay;
const lerpAng=(a,b,f)=>{let d=b-a;d=Math.atan2(Math.sin(d),Math.cos(d));return a+d*f;};

// ---- places the family like to hang out (villa) ----
const HAUNTS={
  lounger1:{x:-6,z:9.65,yaw:Math.PI,pose:'recline',seatH:0.55,ap:{x:-6,z:11.4}},
  lounger2:{x:-2,z:9.65,yaw:Math.PI,pose:'recline',seatH:0.55,ap:{x:-2,z:11.4}},
  lounger3:{x:2,z:9.65,yaw:Math.PI,pose:'recline',seatH:0.55,ap:{x:2,z:11.4}},
  sofa1:{x:-6.5,z:13.62,yaw:Math.PI,pose:'sit',seatH:0.62,ap:{x:-4,z:12.2}},
  sofa2:{x:-9.4,z:12.2,yaw:Math.PI/2,pose:'sit',seatH:0.62,ap:{x:-7.9,z:10.9}},
  table:{x:17.6,z:15.1,yaw:Math.PI,pose:'sit',seatH:0.64,ap:{x:17.6,z:16.8}},
  bbq:{x:22.6,z:12.35,yaw:Math.PI,pose:'bbq',ap:{x:23.9,z:13.6}},
  paella:{x:17.5,z:9.3,yaw:0,pose:'bbq',ap:{x:17.5,z:8.2}},
  sangria:{x:7.0,z:9.3,yaw:-Math.PI/2,pose:'drink',ap:{x:7.9,z:10.3}},
  jacuzzi:{x:11.3,z:5.9,yaw:Math.PI,pose:'soak',seatH:0.55,ap:{x:11.3,z:7.9}},
  pooledge1:{x:3.6,z:8.55,yaw:Math.PI,pose:'sit',seatH:0.14,ap:{x:3.6,z:10.4}},
  pooledge2:{x:-7.8,z:8.55,yaw:Math.PI,pose:'sit',seatH:0.14,ap:{x:-7.8,z:10.4}},
  sunset:{x:-11,z:0.4,yaw:Math.PI,pose:'auto',ap:{x:-11,z:0.4}},
  towel1:{x:-41.6,z:-28.6,yaw:Math.PI/2,pose:'lie',ap:{x:-41.6,z:-26.8}},
  towel2:{x:36.4,z:-29.6,yaw:-Math.PI/2,pose:'lie',ap:{x:36.4,z:-27.8}},
  terrace:{x:2.6,z:12.9,yaw:Math.PI,pose:'dance',ap:{x:2.6,z:12.9}},
  shore:{wander:[{x:-24,z:-41},{x:4,z:-42.5},{x:26,z:-41}],pose:'auto'},
};
const DOOR={x:0.5,z:15.1};
// hour bands (can run past 24) → places they'll pick from
const SCHED={
  parent:[[7,11,['shore','pooledge1','paella','lounger2']],[11,17,['lounger2','towel1','pooledge2','sofa2']],[17,20.5,['bbq','sangria','sunset','table']],[20.5,23,['sofa1','table','terrace']],[23,31,['inside']]],
  nana:[[7.5,11,['sofa1','table','lounger1']],[11,17,['lounger1','sofa1','pooledge2']],[17,20.5,['sunset','table','sofa2']],[20.5,22,['sofa1','table']],[22,31.5,['inside']]],
  papa:[[6.5,11,['table','shore','sofa2']],[11,17,['lounger3','sofa2','paella']],[17,20.5,['bbq','sunset','table']],[20.5,21.5,['table','sofa2']],[21.5,30.5,['inside']]],
  auntie:[[9.5,12,['pooledge1','lounger3','sangria']],[12,17,['towel2','jacuzzi','pooledge1','lounger3']],[17,20.5,['sangria','jacuzzi','sunset']],[20.5,25,['terrace','jacuzzi','sangria']],[25,33.5,['inside']]],
};
const hauntTaken={};
function bandFor(n){const h=timeOfDay;for(const b of SCHED[n.def.sched]){if((h>=b[0]&&h<b[1])||(h+24>=b[0]&&h+24<b[1]))return b;}return null;}
function releaseHaunt(n){if(n.hauntId&&hauntTaken[n.hauntId]===n.id)delete hauntTaken[n.hauntId];n.hauntId=null;n.haunt=null;}

// ---- tiny visibility-graph pathfinder around the big obstacles ----
let navBoxes=[];
function buildNav(){navBoxes=solids.filter(s=>Math.max(s.rx,s.rz)>=0.4).map(s=>{const m=Math.max(s.rx,s.rz)>=0.9?0.7:0.5;return {x:s.x,z:s.z,rx:s.rx+m,rz:s.rz+m};});}
function segHits(ax,az,bx,bz,b){let t0=0,t1=1;const dx=bx-ax,dz=bz-az;
  const ax_=[[ax,dx,b.x-b.rx,b.x+b.rx],[az,dz,b.z-b.rz,b.z+b.rz]];
  for(const q of ax_){const p=q[0],d=q[1];if(Math.abs(d)<1e-9){if(p<=q[2]||p>=q[3])return false;}else{let u0=(q[2]-p)/d,u1=(q[3]-p)/d;if(u0>u1){const tt=u0;u0=u1;u1=tt;}t0=Math.max(t0,u0);t1=Math.min(t1,u1);if(t0>=t1)return false;}}
  return true;}
function segClear(ax,az,bx,bz){for(const b of navBoxes)if(segHits(ax,az,bx,bz,b))return false;return true;}
function inNav(x,z){for(const b of navBoxes)if(Math.abs(x-b.x)<b.rx&&Math.abs(z-b.z)<b.rz)return b;return null;}
function inSolid(x,z){for(const b of solids)if(Math.abs(x-b.x)<b.rx+0.3&&Math.abs(z-b.z)<b.rz+0.3)return true;return false;}
function outOfNav(x,z){for(let k=0;k<3;k++){const b=inNav(x,z);if(!b)break;const ox=b.rx-Math.abs(x-b.x),oz=b.rz-Math.abs(z-b.z);if(ox<oz)x+=(ox+0.05)*Math.sign(x-b.x||1);else z+=(oz+0.05)*Math.sign(z-b.z||1);}return {x,z};}
function navPath(ax,az,bx,bz){
  const pre=[];const a=outOfNav(ax,az);if(a.x!==ax||a.z!==az)pre.push(a);
  const g=outOfNav(bx,bz);
  if(segClear(a.x,a.z,g.x,g.z))return pre.concat([g]);
  const nodes=[a];navBoxes.forEach(b=>{[[1,1],[1,-1],[-1,1],[-1,-1]].forEach(q=>{const x=b.x+q[0]*(b.rx+0.08),z=b.z+q[1]*(b.rz+0.08);if(!inNav(x,z)&&!inSolid(x,z))nodes.push({x,z});});});
  nodes.push(g);const N=nodes.length,G=N-1,dist=new Array(N).fill(Infinity),prev=new Array(N).fill(-1),done=new Array(N).fill(false);dist[0]=0;
  for(let it=0;it<N;it++){let u=-1,bd=Infinity;for(let i=0;i<N;i++)if(!done[i]&&dist[i]<bd){bd=dist[i];u=i;}if(u<0||u===G)break;done[u]=true;
    for(let v=0;v<N;v++){if(done[v])continue;const d=Math.hypot(nodes[u].x-nodes[v].x,nodes[u].z-nodes[v].z);if(dist[u]+d<dist[v]&&segClear(nodes[u].x,nodes[u].z,nodes[v].x,nodes[v].z)){dist[v]=dist[u]+d;prev[v]=u;}}}
  if(prev[G]<0)return pre.concat([g]);
  const path=[];for(let v=G;v>0;v=prev[v])path.unshift({x:nodes[v].x,z:nodes[v].z});return pre.concat(path);}
function pushOut(pos,list,r){for(const s of list){const dx=pos.x-s.x,dz=pos.z-s.z,rx=s.rx+(r||0),rz=s.rz+(r||0);if(Math.abs(dx)<rx&&Math.abs(dz)<rz){const ox=rx-Math.abs(dx),oz=rz-Math.abs(dz);if(ox<oz)pos.x+=ox*Math.sign(dx||1);else pos.z+=oz*Math.sign(dz||1);}}}

// ---- villa behaviour: pick a haunt, walk there, settle in, repeat ----
function pickHaunt(n){
  releaseHaunt(n);n.p.read=false;
  const b=bandFor(n);const opts=b?b[2]:['inside'];
  if(opts[0]==='inside'){n.state='toDoor';n.path=navPath(n.p.root.position.x,n.p.root.position.z,DOOR.x,DOOR.z);n.p.pose='auto';return;}
  const free=opts.filter(o=>!hauntTaken[o]&&o!==n.lastHaunt);const id=(free.length?free:opts.filter(o=>!hauntTaken[o]))[Math.floor(Math.random()*(free.length||1))]||'shore';
  const h=HAUNTS[id];n.hauntId=id;n.haunt=h;n.lastHaunt=id;if(!h.wander)hauntTaken[id]=n.id;
  n.wi=0;const tgt=h.wander?h.wander[Math.floor(Math.random()*h.wander.length)]:h.ap;
  n.path=navPath(n.p.root.position.x,n.p.root.position.z,tgt.x,tgt.z);n.state='walk';n.p.pose='auto';
}
function walkPath(n,dt,spd){const p=n.p,rp=p.root.position;const w=n.path[0];if(!w)return true;
  const dx=w.x-rp.x,dz=w.z-rp.z,d=Math.hypot(dx,dz);
  if(d<0.35){n.path.shift();n.stuckT=0;return n.path.length===0;}
  const ox=rp.x,oz=rp.z,st=Math.min(d,spd*dt);rp.x+=dx/d*st;rp.z+=dz/d*st;pushOut(rp,solids,0);
  // stuck on something? replan, and as a last resort hop past the snag
  if(Math.hypot(rp.x-ox,rp.z-oz)<st*0.3){n.stuckT=(n.stuckT||0)+dt;if(n.stuckT>1.2){n.stuckT=0;n.replans=(n.replans||0)+1;const g=n.path[n.path.length-1];
    if(n.replans>2){rp.x=w.x;rp.z=w.z;pushOut(rp,solids,0.05);n.path.shift();n.replans=0;}else n.path=navPath(rp.x,rp.z,g.x,g.z);return n.path.length===0;}}else n.stuckT=Math.max(0,(n.stuckT||0)-dt);
  p.root.rotation.y=lerpAng(p.root.rotation.y,Math.atan2(dx,dz),Math.min(1,dt*8));return false;}
function npcVilla(n,dt){
  const p=n.p,rp=p.root.position;
  if(n.hold){n.hold.t-=dt;
    if(n.hold.t<=0){if(n.hold.prev!=null)p.pose=n.hold.prev;n.hold=null;}
    else{if(n.hold.prev==null)n.hold.prev=p.pose;
      if(['auto','drink','bbq','dance','wave','talk','laugh','give'].includes(n.hold.prev)&&p.root.visible){p.root.rotation.y=lerpAng(p.root.rotation.y,Math.atan2(player.position.x-rp.x,player.position.z-rp.z),Math.min(1,dt*6));p.pose=n.hold.pose;}
      else n.react=1;return;}}
  if(n.react>0)n.react-=dt;
  switch(n.state){
    case 'inside':{p.root.visible=false;n.stayT-=dt;if(n.stayT<=0){n.stayT=4;const b=bandFor(n);if(b&&b[2][0]!=='inside'){p.root.visible=true;placePerson(p,DOOR.x,DOOR.z,Math.PI);n.state='idle';}}return;}
    case 'toDoor':{const bd=bandFor(n);if(bd&&bd[2][0]!=='inside'){n.state='idle';break;}if(walkPath(n,dt,n.def.speed)){n.state='inside';n.stayT=3;p.root.visible=false;if(kid.minder===n.id)kidBack(n.def.name+' is off to bed — the little one runs back to you.');}break;}
    case 'idle':pickHaunt(n);break;
    case 'walk':{
      if(walkPath(n,dt,n.def.speed)){const h=n.haunt;
        if(h.wander){n.wi=(n.wi||0)+1;if(n.wi>3){n.state='stay';n.stayT=4+Math.random()*6;p.pose='auto';}else{const t=h.wander[Math.floor(Math.random()*h.wander.length)];n.path=navPath(rp.x,rp.z,t.x,t.z);}}
        else{n.tw={fx:rp.x,fz:rp.z,tx:h.x,tz:h.z,t:0,d:0.55,fy:p.root.rotation.y,ty:h.yaw,read:Math.random()<0.7};n.state='enter';}}
      break;}
    case 'enter':{const tw=n.tw;tw.t+=dt;const f=Math.min(1,tw.t/tw.d),e=f*f*(3-2*f);rp.x=tw.fx+(tw.tx-tw.fx)*e;rp.z=tw.fz+(tw.tz-tw.fz)*e;p.root.rotation.y=lerpAng(tw.fy,tw.ty,e);
      if(f>0.35){const h=n.haunt;p.pose=h.pose;p.seatH=h.seatH||0.6;p.py=0;p.read=!!(n.def.prop&&n.def.prop!=='glass'&&(h.pose==='sit'||h.pose==='recline')&&tw.read);}
      if(f>=1){n.state='stay';n.stayT=28+Math.random()*40;}
      p.lx=rp.x;p.lz=rp.z;break;}
    case 'stay':{n.stayT-=dt;const b=bandFor(n);const ok=b&&b[2].includes(n.hauntId);
      if(n.react>0&&(p.pose==='auto'||p.pose==='drink'||p.pose==='bbq'))p.pose='wave';else if(n.react<=0&&p.pose==='wave'&&n.haunt)p.pose=n.haunt.pose||'auto';
      if(n.stayT<=0||!ok){const h=n.haunt;if(h&&!h.wander&&h.ap&&(Math.abs(rp.x-h.ap.x)+Math.abs(rp.z-h.ap.z)>0.3)){n.tw={fx:rp.x,fz:rp.z,tx:h.ap.x,tz:h.ap.z,t:0,d:0.55,fy:p.root.rotation.y,ty:p.root.rotation.y};n.state='exit';p.pose='auto';p.read=false;}else n.state='idle';}
      break;}
    case 'exit':{const tw=n.tw;tw.t+=dt;const f=Math.min(1,tw.t/tw.d),e=f*f*(3-2*f);rp.x=tw.fx+(tw.tx-tw.fx)*e;rp.z=tw.fz+(tw.tz-tw.fz)*e;p.lx=rp.x;p.lz=rp.z;if(f>=1)n.state='idle';break;}
  }
}
function resetVillaAI(){for(const k in hauntTaken)delete hauntTaken[k];npcs.forEach(n=>{n.state='idle';n.haunt=null;n.hauntId=null;n.p.read=false;n.p.pose='auto';n.stayT=0;});}

// ---- away from the villa everyone trails the player ----
const FOLLOW_SLOTS=[[-2.3,-2.1],[2.3,-2.3],[-1.2,-4.3],[1.4,-4.5]];
function npcFollow(n,i,dt,list){
  if(n.hold){n.hold.t-=dt;if(n.hold.t<=0)n.hold=null;else{const r0=n.p.root.position;n.p.root.rotation.y=lerpAng(n.p.root.rotation.y,Math.atan2(player.position.x-r0.x,player.position.z-r0.z),Math.min(1,dt*6));n.p.pose=n.hold.pose;return;}}
  const p=n.p,rp=p.root.position,yaw=player.rotation.y,o=FOLLOW_SLOTS[i%4];
  const tx=player.position.x+Math.cos(yaw)*o[0]+Math.sin(yaw)*o[1],tz=player.position.z-Math.sin(yaw)*o[0]+Math.cos(yaw)*o[1];
  const dx=tx-rp.x,dz=tz-rp.z,d=Math.hypot(dx,dz);
  if(d>30){placePerson(p,tx,tz,yaw);return;}
  const sp=d>7?9.5:(d>0.9?Math.min(4.5,1.5+d):0);
  if(sp>0){rp.x+=dx/d*sp*dt;rp.z+=dz/d*sp*dt;p.root.rotation.y=lerpAng(p.root.rotation.y,Math.atan2(dx,dz),Math.min(1,dt*8));}
  else p.root.rotation.y=lerpAng(p.root.rotation.y,yaw,Math.min(1,dt*2));
  pushOut(rp,list,0);p.pose=(n.react>0&&sp===0)?'wave':'auto';if(n.react>0)n.react-=dt;
}

// ---- the little one ----
function kidBack(msg){kid.minder='player';if(msg)toast('👶 '+msg);}
function updateKid(dt,list){
  const k=kid,p=k.p;
  if(todsAsleep){if(scn!=='bed')p.root.visible=false;return;}
  if(scn==='bed')return;
  p.root.visible=true;k.t+=dt;k.hop=Math.max(0,k.hop-dt*1.6);
  if(k.minder!=='player'){const m=fam[k.minder];if(scn!=='villa'||absNow()>=k.untilAbs||!m.p.root.visible)kidBack(absNow()>=k.untilAbs?'The little one toddles back to you for a cuddle.':null);}
  if(k.hold&&k.minder==='player'){if(k.hold.hidden){p.root.visible=false;return;}const h=k.hold,rp=p.root.position,dx=h.x-rp.x,dz=h.z-rp.z,d=Math.hypot(dx,dz);
    if(d>0.15){const st=Math.min(d,4.5*dt);rp.x+=dx/d*st;rp.z+=dz/d*st;p.root.rotation.y=lerpAng(p.root.rotation.y,Math.atan2(dx,dz),Math.min(1,dt*10));p.pose='auto';rp.y+=(0-rp.y)*Math.min(1,dt*4);}
    else{p.root.rotation.y=lerpAng(p.root.rotation.y,h.yaw,Math.min(1,dt*6));p.pose=h.pose||'auto';rp.y+=((h.y||0)-rp.y)*Math.min(1,dt*4);}
    const want=h.prop?h.prop+'R':null;if((p.curProp||null)!==want)setProp(p,h.prop||null);
    k.mood=Math.max(0,k.mood-dt*0.2);return;}
  const m=k.minder==='player'?playerP:fam[k.minder].p,mp=m.root.position;
  const tx=mp.x+Math.cos(k.t*0.7)*2.1,tz=mp.z+(k.minder==='player'?2.3:1.6)+Math.sin(k.t*0.6)*1.1;
  const rp=p.root.position,dx=tx-rp.x,dz=tz-rp.z,d=Math.hypot(dx,dz);
  if(d>30){placePerson(p,tx,tz,0);}
  const sp=d>7?10.5:(d>1.4?4.2:0);
  if(sp>0){rp.x+=dx/d*sp*dt;rp.z+=dz/d*sp*dt;p.root.rotation.y=lerpAng(p.root.rotation.y,Math.atan2(dx,dz),Math.min(1,dt*10));}
  else{p.root.rotation.y=lerpAng(p.root.rotation.y,Math.atan2(mp.x-rp.x,mp.z-rp.z),Math.min(1,dt*3));}
  pushOut(rp,list,0);
  rp.y=k.hop*1.1*Math.sin(Math.min(1,k.hop/0.45)*Math.PI);
  p.pose=k.hop>0.05?'cheer':'auto';
  k.mood=Math.max(0,k.mood-dt*(k.minder==='player'?0.6:0.3));
}
function handTarget(){
  if(scn!=='villa'||todsAsleep||playerAnim||photoMode)return null;
  for(const n of npcs){if(!n.p.root.visible)continue;const d=Math.hypot(n.p.root.position.x-player.position.x,n.p.root.position.z-player.position.z);
    if(d<3.6){if(kid.minder==='player')return {n,give:true};if(kid.minder===n.id)return {n,give:false};}}
  return null;}
function doHand(){const h=handTarget();if(!h)return;const n=h.n;
  n.hold={t:1.2,pose:'give'};runScript([{face:[n.p.root.position.x,n.p.root.position.z],dur:0.3},{pose:'give',dur:0.8}]);
  if(h.give){kid.minder=n.id;kid.untilAbs=absNow()+3;n.mood=Math.min(100,n.mood+15);n.react=1.6;addV(4);
    const say={nana:'👵 "Give them here, you go and relax!"',papa:'👴 "Come here, trouble. Let\'s find some crabs."',auntie:'💃 "Auntie time! We\'re going to be SO fabulous."',mum:'👩 "Go on — have a sit-down."',dad:'👨 "Right, little one. Mischief?"'};
    toast(say[n.id]||'👶 Handed over.');}
  else{kidBack('Back with you — the little one is thrilled.');kid.mood=Math.min(100,kid.mood+10);}
}

// ---- chatting with the family ----
const FAMILY_TALK={
  mum:[{pp:'give',l:'bring Mum a cuppa ☕',t:'☕ "You absolute angel. Hot tea at 30 degrees — perfect."',v:3},{l:'plan tomorrow with Mum 🗺️',t:'🗺️ "Beach in the morning, Vejer for lunch, nap. Deal?"',v:3},{l:'tell Mum she\'s smashing it 💛',t:'💛 "Stop it, you\'ll make me cry into my sun cream."',v:4},{pp:'dance',np:'dance',l:'slow dance with Mum 💃',t:'💃 A slow dance on the terrace. The little one pretends to be sick.',v:5,villa:1}],
  dad:[{np:'laugh',l:'challenge Dad to a swim race 🏊',t:'🏊 "Last one in buys the sangria!" *massive splash*',v:5,villa:1},{l:'ask Dad about the BBQ 🍤',t:'🍤 A twenty-minute lecture on charcoal. Riveting.',v:3,villa:1},{pp:'laugh',np:'talk',l:'laugh at Dad\'s joke 😂',t:'😂 "I used to hate facial hair… but then it grew on me."',v:3},{l:'compare sunburns with Dad 🔴',t:'🔴 You\'re both the same shade of lobster. Solidarity.',v:2}],
  nana:[{np:'talk',l:'have a natter with Nana 🫖',t:'🫖 "Have you eaten? You look thin. Here, have a biscuit."',v:3},{l:'ask Nana about her book 📖',t:'📖 "It\'s a murder mystery. The butler did it. Probably."',v:3},{pp:'rub',np:'talk',l:'let Nana do your sun cream 🧴',t:'🧴 Factor 50, applied with the precision of a surgeon.',v:3},{l:'find Nana\'s glasses 👓',t:'👓 They were on her head the whole time. Classic.',v:4}],
  papa:[{pp:'laugh',np:'talk',l:'hear one of Papa\'s stories 👴',t:'👴 "When I first came to Spain, a pint was twenty pesetas…"',v:4,time:0.25},{l:'ask Papa for the cricket score 🏏',t:'🏏 One earphone in, very serious face. "Don\'t jinx it."',v:3},{l:'admire Papa\'s socks 🧦',t:'🧦 "White socks and sandals. It\'s called style, look it up."',v:3},{l:'help Papa with the crossword ✏️',t:'✏️ "Seven letters, sunny region…" — "Andalucía is nine, Papa."',v:3}],
  auntie:[{pp:'reach',np:'wave',l:'take a selfie with Auntie 🤳',t:'🤳 Forty-seven attempts. The first one was best.',v:3},{l:'get the gossip from Auntie 🗣️',t:'🗣️ Twenty minutes of pure, high-quality gossip.',v:4},{pp:'dance',np:'dance',l:'dance with Auntie 🎶',t:'🎶 A full choreographed routine on the terrace. Iconic.',v:5,villa:1},{l:'borrow Auntie\'s sunglasses 🕶️',t:'🕶️ "Keep them. I\'ve got six more pairs in my bag."',v:2}],
};
const FAMILY_TIPSY={mum:'🙄 Mum: "Seriously? It\'s not even dark yet."',dad:'😬 Dad: "Mate… maybe have some water?"',nana:'👵 Nana: "I think that\'s enough sangria, dear."',papa:'👴 Papa: "In my day we paced ourselves. Mostly."',auntie:'💃 Auntie: "Another one? Go on then!"'};
function talkLine(n){const L=FAMILY_TALK[n.id];for(let k=0;k<L.length;k++){const l=L[(n.talkI+k)%L.length];if(!l.villa||scn==='villa'){n.talkI+=k;return l;}}return L[0];}
function talkTo(n){
  n.react=1.6;SND.talk(playerId);SND.talk(n.id,0.6);
  if(drunk>=2){if(n.id==='auntie'){addV(2);n.mood=Math.min(100,n.mood+10);}else{vibes=Math.max(0,vibes-5);n.mood=Math.max(0,n.mood-8);}toast(FAMILY_TIPSY[n.id]);scriptTalk(n,'laugh','talk');return;}
  const line=talkLine(n);n.talkI++;
  if(drunk>=1&&n.id!=='auntie'){addV(Math.max(1,line.v-2));n.mood=Math.min(100,n.mood+10);toast('🍷 '+n.def.name+': "You alright there? Maybe slow it down a notch…"');scriptTalk(n,'talk','talk');return;}
  addV(line.v);n.mood=Math.min(100,n.mood+20);fam[playerId].mood=Math.min(100,fam[playerId].mood+6);toast(line.t);if(line.time)timeOfDay+=line.time;scriptTalk(n,line.pp,line.np);
  if(n.p.root.visible)spawnHeart(n.p.root.position.x,n.p.root.position.z,n.p.H+0.5);
}
// favourite activities: everyone who loves it perks up
const LOVE_TXT={bbq:'a BBQ',paella:'a paella',sangria:'a sangria',sunset:'a good sunset',jacuzzi:'the jacuzzi',pool:'a swim',sea:'a paddle',lounge:'a lounger',sauna:'the sauna',ice:'an ice cream',stargaze:'stargazing'};
function familyReact(act){
  fam[playerId].mood=Math.min(100,fam[playerId].mood+8);let fan=null;
  ADULTS.forEach(id=>{const f=fam[id];if(f.def.loves&&f.def.loves.indexOf(act)>=0){f.mood=Math.min(100,f.mood+18);if(id!==playerId&&!fan)fan=f;if(f.p.root.visible&&id!==playerId)spawnHeart(f.p.root.position.x,f.p.root.position.z,f.p.H+0.5);}});
  if(fan&&LOVE_TXT[act])setTimeout(()=>toast(fan.def.emoji+' '+fan.def.name+' loves '+LOVE_TXT[act]+'!'),900);
}
let famBonusDay=0;
function updateMoods(dt){
  ADULTS.forEach(id=>{fam[id].mood=Math.max(0,fam[id].mood-dt*0.2);});
  let happy=0;FAMILY_ORDER.forEach(id=>{if(fam[id].mood>55)happy++;});
  vibes=Math.min(100,vibes+happy/6*0.05*dt);
  if(happy===6&&famBonusDay!==day){famBonusDay=day;addV(5);toast('💛 The whole family is happy — holiday magic!');}
}

// ---- title-screen lineup ----
let titleT=0;
const LINEUP=['mum','dad','nana','papa','auntie'];
function lineupTitle(){LINEUP.forEach((id,i)=>{placePerson(fam[id].p,4-i*2,-2,Math.PI);fam[id].p.pose='auto';fam[id].p.root.visible=true;});placePerson(kid.p,0.9,-3.3,Math.PI-0.3);kid.p.root.visible=true;}
function updateTitle(dt){
  titleT+=dt;timeOfDay=18.9;applyTime();refreshEnv();updateEnv(dt);
  const a=cam.aspect,gap=a<0.8?1.55:2;world.userData.lampPosts.forEach(l=>l.visible=false);
  LINEUP.forEach((id,i)=>{const p=fam[id].p,sel=id===playerId,tz=sel?-2.9:-2;p.root.position.z+=(tz-p.root.position.z)*Math.min(1,dt*4);p.root.position.x=(2-i)*gap;
    p.pose=sel?'wave':'auto';p.lookAt=sel?null:fam[playerId].p.root.position;animPerson(p,dt);});
  const kp=kid.p;kp.pose=(titleT%4.5)<1.1?'cheer':'auto';kp.lookAt=fam[playerId].p.root.position;animPerson(kp,dt);
  const d=Math.max(8.5,(2*gap+1.5)/(0.52*a));
  cam.position.set(Math.sin(titleT*0.15)*d*0.12,1.6+d*0.1,-2-d);cam.lookAt(0,1.25,-2);
}

// ---- group photo in the plaza ----
function startPhoto(){SND.sfx('shutter');
  photoMode={t:0};const order=['papa','nana','mum','toddler','dad','auntie'];
  const PZ=plaza.userData.photo.z;order.forEach((id,i)=>{const p=fam[id].p,x=-4+i*1.6,z=id==='toddler'?PZ+1.2:PZ;placePerson(p,x,z,0);p.root.visible=true;p.pose=id==='toddler'?'cheer':'wave';p.lookAt=null;});
  const fl=$('flash');if(fl){fl.style.transition='none';fl.style.opacity=1;requestAnimationFrame(()=>{fl.style.transition='opacity 1.2s ease';fl.style.opacity=0;});}
}
function updatePhoto(dt){photoMode.t+=dt;const PZ=plaza.userData.photo.z;cam.position.set(0,2.6,PZ+8.5);cam.lookAt(0,2.2,PZ);
  FAMILY_ORDER.forEach(id=>animPerson(fam[id].p,dt));
  if(photoMode.t>1.6&&!photoMode.flashed){photoMode.flashed=true;const fl=$('flash');if(fl){fl.style.transition='none';fl.style.opacity=0.9;requestAnimationFrame(()=>{fl.style.transition='opacity 0.9s ease';fl.style.opacity=0;});}}
  if(photoMode.t>3.4){photoMode=null;FAMILY_ORDER.forEach(id=>{fam[id].p.pose='auto';});npcs.forEach(n=>n.p.lookAt=player.position);camYaw=Math.PI;}}

// ---- where everyone goes when the scene changes ----
function familyToScene(to,from){
  const all=FAMILY_ORDER.map(id=>fam[id]);
  if(to==='cabin'){const seats=cabin.userData.famSeats;all.forEach(f=>{const q=seats[f.id];f.p.root.visible=true;placePerson(f.p,q.x,q.z-0.06,Math.PI,0);f.p.pose='sit';f.p.seatH=cabin.userData.seatH;f.p.read=false;f.p.lookAt=null;animPerson(f.p,1,true);});return;}
  if(to==='wingview'||to==='landing'){all.forEach(f=>f.p.root.visible=false);return;}
  if(to==='bed'){npcs.forEach(n=>n.p.root.visible=false);return;}
  all.forEach(f=>{f.p.root.position.y=0;f.p.read=false;f.p.pose='auto';});
  player.visible=true;
  npcs.forEach((n,i)=>{const o=FOLLOW_SLOTS[i];n.p.root.visible=true;placePerson(n.p,player.position.x+o[0],player.position.z-o[1],Math.PI);n.p.lookAt=player.position;});
  if(!todsAsleep){kid.p.root.visible=true;placePerson(kid.p,player.position.x+0.8,player.position.z+2.2,Math.PI);kid.minder='player';}else kid.p.root.visible=false;
  if(to==='villa')resetVillaAI();
}
function animateFamily(dt){FAMILY_ORDER.forEach(id=>{const p=fam[id].p;if(p.root.visible)animPerson(p,dt);});}

// ===================== ACTIVITY ANIMATIONS =====================
// Every villa activity plays a short scripted scene: walk there, do the thing (with props and effects),
// then hand control back — the same idea as the swim in the pool.

// ---- hand props (built lazily per person, in hand space: −y runs from the wrist along the fingers) ----
const PROP_BUILD={
  cone:()=>{const g=new T.Group();const c=new T.Mesh(new T.ConeGeometry(0.055,0.17,12),mc('waffleM',()=>new T.MeshStandardMaterial({map:waffleT,roughness:0.8})));c.position.set(0,-0.1,0.02);c.rotation.x=Math.PI;g.add(c);
    const s1=new T.Mesh(new T.SphereGeometry(0.062,12,10),stdM(0xf2a0c0,0.6));s1.position.set(0,-0.2,0.02);g.add(s1);const s2=new T.Mesh(new T.SphereGeometry(0.05,12,10),stdM(0xfff0b0,0.6));s2.position.set(0,-0.27,0.02);g.add(s2);return g;},
  paddle:()=>{const g=new T.Group();const h=new T.Mesh(new T.CylinderGeometry(0.016,0.016,1.0,8),stdM(0xb08a5a,0.7));h.position.y=-0.42;g.add(h);
    const b=new T.Mesh(new T.BoxGeometry(0.11,0.17,0.02),stdM(0xa47c4c,0.7));b.position.y=-0.95;g.add(b);g.rotation.x=1.05;return g;},
  spatula:()=>{const g=new T.Group();const h=new T.Mesh(new T.CylinderGeometry(0.014,0.014,0.32,8),stdM(0x1a1a1a,0.5));h.position.y=-0.14;g.add(h);
    const b=new T.Mesh(new T.BoxGeometry(0.1,0.13,0.012),stdM(0xc9cdd2,0.25,{metalness:0.9}));b.position.y=-0.36;g.add(b);g.rotation.x=0.5;return g;},
  jug:()=>{const g=new T.Group(),j=sangriaJugGroup();j.scale.setScalar(0.62);j.rotation.x=Math.PI/2;j.position.set(0,-0.07,0);g.add(j);return g;},
  bottle:()=>{const g=new T.Group();const b=new T.Mesh(new T.CylinderGeometry(0.04,0.044,0.17,10),stdM(0xffffff,0.5));b.position.y=-0.09;g.add(b);
    const l=new T.Mesh(new T.CylinderGeometry(0.045,0.045,0.07,10),stdM(0xf29a2e,0.5));l.position.y=-0.09;g.add(l);const c=new T.Mesh(new T.CylinderGeometry(0.025,0.03,0.05,8),stdM(0xff6633,0.5));c.position.y=-0.2;g.add(c);return g;},
  spade:()=>{const g=new T.Group();const h=new T.Mesh(new T.CylinderGeometry(0.016,0.016,0.36,8),stdM(0xe0402a,0.6));h.position.y=-0.16;g.add(h);
    const b=new T.Mesh(new T.BoxGeometry(0.13,0.15,0.02),stdM(0xf5c433,0.6));b.position.y=-0.4;g.add(b);g.rotation.x=0.7;return g;},
};
function setProp(p,name,left){p.propObjs=p.propObjs||{};for(const k in p.propObjs)p.propObjs[k].visible=false;if(!name){p.curProp=null;return;}
  const key=name+(left?'L':'R');if(!p.propObjs[key]){const g=PROP_BUILD[name]();g.position.y+=-p.H*0.028;g.scale.multiplyScalar(p.H/2.3);(left?p.j.lHa:p.j.rHa).add(g);p.propObjs[key]=g;}
  p.propObjs[key].visible=true;p.curProp=key;}

// ---- little particle effects: steam, smoke, sand, splashes ----
const puffTex=radialTex(64,64,[[32,32,0,32,[[0,1],[0.5,0.45],[1,0]]]],[255,255,255]);
const FX=[],dropGeo=new T.SphereGeometry(0.05,6,4);
function puff(x,y,z,o){o=o||{};const m=new T.SpriteMaterial({map:puffTex,color:lin(o.col||0xffffff),transparent:true,opacity:0,depthWrite:false});const s=new T.Sprite(m);s.position.set(x,y,z);
  const sz=o.size||0.6;s.scale.set(sz,sz,1);scene.add(s);FX.push({o:s,t:0,life:o.life||1.6,v:new T.Vector3((Math.random()-0.5)*(o.spread||0.3),o.vy==null?0.9:o.vy,(Math.random()-0.5)*(o.spread||0.3)),sz,grow:o.grow==null?1.3:o.grow,op:o.op||0.6,sprite:true});}
function splash(x,y,z,n,col){if((col==null||col===0xffffff)&&SND.throttle('splash',0.22))SND.sfx('splash',{size:n>=3?1:0});for(let i=0;i<n;i++){const m=new T.MeshBasicMaterial({color:lin(col||0xffffff),transparent:true,opacity:0.9});const d=new T.Mesh(dropGeo,m);d.position.set(x,y,z);d.scale.setScalar(0.6+Math.random()*0.8);scene.add(d);
  const a=Math.random()*Math.PI*2,sp=0.8+Math.random()*1.6;FX.push({o:d,t:0,life:0.7+Math.random()*0.3,v:new T.Vector3(Math.cos(a)*sp,2+Math.random()*2.2,Math.sin(a)*sp)});}}
function updateFX(dt){for(let i=FX.length-1;i>=0;i--){const f=FX[i];f.t+=dt;const u=f.t/f.life;
  if(u>=1){scene.remove(f.o);f.o.material.dispose();FX.splice(i,1);continue;}
  if(f.sprite){f.o.position.addScaledVector(f.v,dt);const s=f.sz*(1+f.grow*u);f.o.scale.set(s,s,1);f.o.material.opacity=f.op*(1-u)*Math.min(1,u*6);}
  else{f.v.y-=9.8*dt;f.o.position.addScaledVector(f.v,dt);f.o.material.opacity=0.9*(1-u);}}}

// ---- script runner ----
let scriptCam=null,lastScriptCam=null,camBlend=0;const camFollow=new T.Vector3(),_camLook=new T.Vector3(),_lookF=new T.Vector3();
function runScript(steps){playerAnim={type:'script',steps,i:0,t:0,init:false};}
const kidOk=()=>kid&&!todsAsleep&&kid.minder==='player'&&kid.p.root.visible;
function kidHold(h){if(kidOk())kid.hold=h;}
const vec3=a=>new T.Vector3(a[0],a[1],a[2]);
function stepScript(a,dt){
  const P=playerP,s=a.steps[a.i];if(!s){endScript();return;}
  if(!a.init){a.init=true;a.st=0;a.fired=false;
    if(s.go){const g=typeof s.go==='function'?s.go():s.go;a.tgt=g;a.path=(scn==='villa'&&!s.direct)?navPath(player.position.x,player.position.z,g[0],g[1]):[];a.path.push({x:g[0],z:g[1]});}
    if(s.do)s.do();
    if(s.prop!==undefined)setProp(P,s.prop,s.left);
    if(s.cam!==undefined){const c=typeof s.cam==='function'?s.cam():s.cam;scriptCam=c?{p:vec3(c.p),l:vec3(c.l)}:null;
      if(scriptCam&&cam.aspect<1){const k=Math.min(1.6,1.2/cam.aspect);scriptCam.p.sub(scriptCam.l).multiplyScalar(k).add(scriptCam.l);}}}
  a.st+=dt;const t=a.st;let done=false;
  if(s.go){P.pose='auto';const w=a.path[0];
    if(w){const dx=w.x-player.position.x,dz=w.z-player.position.z,d=Math.hypot(dx,dz);
      if(d<0.2)a.path.shift();else{const st=Math.min(d,(s.speed||5.5)*dt);player.position.x+=dx/d*st;player.position.z+=dz/d*st;player.rotation.y=lerpAng(player.rotation.y,Math.atan2(dx,dz),Math.min(1,dt*10));}}
    player.position.y+=((s.y||0)-player.position.y)*Math.min(1,dt*3);
    if(!a.path.length)done=true;
    if(t>10){player.position.x=a.tgt[0];player.position.z=a.tgt[1];done=true;}}
  else{
    if(s.face!=null){const f=typeof s.face==='function'?s.face():s.face;const yaw=typeof f==='number'?f:Math.atan2(f[0]-player.position.x,f[1]-player.position.z);player.rotation.y=lerpAng(player.rotation.y,yaw,Math.min(1,dt*9));}
    if(s.pose)P.pose=s.pose;if(s.seatH)P.seatH=s.seatH;
    if(s.y!=null)player.position.y+=(s.y-player.position.y)*Math.min(1,dt*4);
    if(s.fx)s.fx(Math.min(1,t/(s.dur||1e-3)),dt,t,a);
    if(t>=(s.dur||0))done=true;}
  if(done){if(s.end)s.end();a.i++;a.init=false;}
}
function endScript(){playerAnim=null;scriptCam=null;playerP.pose='auto';setProp(playerP,null);player.visible=true;player.position.y=0;playerYaw=player.rotation.y;
  if(!fadeDir)fade=0;if(kid.hold){kid.hold=null;setProp(kid.p,null);if(!todsAsleep&&scn!=='bed')kid.p.root.visible=true;}if(vendor)vendor.pose='auto';}
const fadeTo=(dur,on)=>({dur,fx:u=>{fade=on?u:1-u;}});

// ---- the scripts ----
function scriptSangria(){runScript([{go:[5.5,10.4]},{face:Math.PI,dur:0.35},{pose:'pour',prop:'jug',dur:1.6,do:()=>SND.sfx('pour',{dur:1.6}),fx:(u,dt)=>{if(Math.random()<dt*8)splash(player.position.x+Math.sin(player.rotation.y)*0.55,1.25,player.position.z+Math.cos(player.rotation.y)*0.55,1,0x9c1f32);}},{prop:null,pose:'drink',dur:2.4,do:()=>SND.sfx('clink')}]);}
function scriptSauna(){const d=world.userData.saunaDoor,c=world.userData.saunaChim,sx=d.position.x+0.55,sz=d.position.z;
  const door=(to)=>({dur:0.55,do:()=>SND.sfx('creak'),end:()=>{if(!to)SND.sfx('thud');},fx:u=>{const e=u*u*(3-2*u);d.rotation.y=to?1.35*e:1.35*(1-e);}});
  kidHold({x:sx+2.4,z:sz-2.2,yaw:0,pose:'auto'});
  runScript([{go:[sx,sz-1.3]},{face:0,dur:0.3,cam:{p:[sx+4.2,2.8,sz-6.0],l:[sx-0.2,1.9,sz+0.6]}},door(true),{go:[sx,sz+1.2],direct:true,speed:2.6},{do:()=>{player.visible=false;}},door(false),
    {dur:3.2,do:()=>SND.sfx('hiss',{dur:3.2}),fx:(u,dt)=>{if(Math.random()<dt*9)puff(c[0],c[1],c[2],{size:1.1,vy:1.1,op:0.85,life:2.4,spread:0.5,col:0xf4f4f4});}},
    door(true),{do:()=>{player.visible=true;player.position.set(sx,0,sz+0.4);player.rotation.y=Math.PI;flush(playerP,true);}},{go:[sx,sz-1.6],direct:true,speed:2.6},door(false),
    {pose:'fan',dur:2.2,fx:(u,dt)=>{if(Math.random()<dt*3)puff(player.position.x,playerP.H*0.9,player.position.z,{size:0.35,vy:0.5,op:0.35,life:1.2});}},{do:()=>flush(playerP,false)}]);}
function flush(p,on){p.root.traverse(o=>{if(o.isMesh&&o.material===skinM(p.def.skin)){o.material.emissive.copy(lin(p.def.skin).multiplyScalar(0.05));if(on)o.material.emissive.add(new T.Color(0.35,0.04,0.02));}});}
function scriptPaella(){const fx=world.userData.paellaFx,Q=world.userData.paellaAt;
  runScript([{go:[Q.x-1.05,Q.z]},{face:Math.PI/2,dur:0.35,do:()=>{fx.visible=true;}},{pose:'stir',prop:'paddle',dur:3.8,do:()=>SND.sfx('simmer',{dur:3.9}),cam:{p:[Q.x+2.2,3.1,Q.z-2.7],l:[Q.x-0.3,0.95,Q.z]},
    fx:(u,dt,t)=>{fx.userData.tick(t);if(Math.random()<dt*7)puff(Q.x+(Math.random()-0.5)*0.9,1.05,Q.z+(Math.random()-0.5)*0.9,{size:0.5,vy:0.9,op:0.4,life:1.8});}},{do:()=>{fx.visible=false;}}]);}
function scriptBBQ(){const fx=world.userData.bbqFx,F=fx.userData;
  runScript([{go:[22.2,12.55]},{face:Math.PI,dur:0.35,do:()=>{F.off();fx.visible=true;}},
    {pose:'flip',prop:'spatula',dur:4.0,do:()=>SND.sfx('sizzle',{dur:4.2}),cam:{p:[24.9,4.6,7.9],l:[22.0,1.2,11.9]},fx:(u,dt,t)=>{F.tick(t,u);
      if(Math.random()<dt*7)puff(22+(Math.random()-0.5)*1.0,1.4,11+(Math.random()-0.5)*0.7,{col:0x9a9690,size:0.7,vy:1.3,op:0.4,life:2.2,spread:0.4});}},
    {do:()=>{F.cool();setTimeout(()=>{fx.visible=false;F.off();},25000);}}]);}
function scriptSea(){const x=Math.max(-60,Math.min(60,player.position.x));
  runScript([{go:[x,-42.6]},{go:[x,-48.6],direct:true,speed:3,y:-0.45,do:()=>kidHold({x:x+1.5,z:-46.4,yaw:Math.PI,pose:'wade',y:-0.1})},
    {face:Math.PI,pose:'wade',y:-0.5,dur:3.6,cam:{p:[x+3.5,1.8,-54.5],l:[x+0.6,0.2,-47.6]},fx:(u,dt)=>{if(Math.random()<dt*9)splash(player.position.x+(Math.random()-0.5)*0.9,0.15,player.position.z+(Math.random()-0.5)*0.9,3);
      if(kid.hold&&Math.random()<dt*5)splash(kid.p.root.position.x,0.12,kid.p.root.position.z,2);}},
    {go:[x,-42.4],direct:true,speed:4,cam:null,do:()=>{if(kid.hold)kid.hold=null;}}]);}
function scriptIce(){
  runScript([{go:[30,-16.35]},{face:0,dur:0.4,cam:{p:[27.2,2.3,-21.5],l:[31,1.2,-15.6]},do:()=>{SND.sfx('bell');vendor.pose='give';kidHold({x:31.3,z:-16.9,yaw:0,pose:'auto'});}},{dur:1.0},
    {do:()=>{setProp(playerP,'cone');if(kid.hold)kid.hold.prop='cone';vendor.pose='wave';}},{face:Math.PI,dur:0.5,do:()=>{if(kid.hold){kid.hold.yaw=Math.PI;kid.hold.pose='lick';}}},
    {pose:'lick',dur:2.8},{do:()=>{vendor.pose='auto';}}]);}
function scriptNap(night){
  runScript([{go:[DOOR.x,DOOR.z-0.2]},{face:0,dur:0.3},fadeTo(0.9,true),
    {do:()=>{if(night){day++;timeOfDay=7;}else{timeOfDay+=4;if(timeOfDay>=24){timeOfDay-=24;day++;}}player.position.set(DOOR.x,0,DOOR.z-0.9);player.rotation.y=Math.PI;
      if(kidOk())placePerson(kid.p,DOOR.x+1.1,DOOR.z-1.6,Math.PI);applyTime();refreshEnv(true);toast(night?'🛏️ Out cold until morning. Well earned.':'😴 Siesta… time drifts on.');SND.sfx(night?'birds':'chime',{delay:0.7});}},
    {dur:0.7},fadeTo(0.9,false),{pose:'stretch',dur:1.9}]);}
function scriptStargaze(){const px=16.5,pz=2.0;kidHold({x:px,z:pz+1.1,yaw:Math.PI/2,pose:'lie'});
  runScript([{go:[px,pz]},{face:Math.PI/2,dur:0.3},{pose:'stargaze',dur:5.0,cam:{p:[px+0.4,0.9,pz+3.6],l:[px-0.2,2.4,pz-3.5]}}]);}
function scriptSunset(){const px=-10,pz=1.6;kidHold({x:px+1.0,z:pz+0.3,yaw:Math.PI,pose:'sitground'});
  runScript([{go:[px,pz]},{face:Math.PI,dur:0.35},{pose:'sitground',dur:5.0,cam:{p:[px+2.3,2.0,pz+4.8],l:[px-5,4.5,pz-90]}}]);}
function scriptSandcastle(){const c=world.userData.castle,build=c.userData.setBuild;
  kidHold({x:-10.05,z:-38.0,yaw:Math.PI/2,pose:'dig'});
  runScript([{go:[-5.95,-37.9]},{face:[-8,-38],dur:0.35,do:()=>{build(0.04);c.userData.flag.visible=false;}},
    {pose:'dig',prop:'spade',dur:4.4,cam:{p:[-4.2,2.6,-42.0],l:[-8.0,0.45,-38.0]},fx:(u,dt)=>{build(0.04+0.96*(1-Math.pow(1-u,1.6)));
      if(Math.random()<dt*6&&SND.throttle('dig',0.25))SND.sfx('dig');if(Math.random()<dt*6)puff(-7.0+(Math.random()-0.5)*0.5,0.3,-37.95+(Math.random()-0.5)*0.5,{col:0xd9c08a,size:0.3,vy:0.5,op:0.7,life:0.9,grow:0.8});
      if(kid.hold&&Math.random()<dt*4)puff(-9.1,0.25,-38.0,{col:0xd9c08a,size:0.25,vy:0.4,op:0.7,life:0.8,grow:0.8});}},
    {do:()=>{SND.sfx('fanfare');SND.sfx('giggle',{delay:0.35});build(1);c.userData.flag.visible=true;setProp(playerP,null);if(kid.hold)kid.hold.pose='cheer';spawnHeart(-8,-38,4);}},{pose:'cheer',dur:1.3}]);}
function scriptSunscreen(){runScript([{go:[-4,8.55]},{face:0,dur:0.3},{pose:'give',dur:0.45},{prop:'bottle',left:true,pose:'rub',dur:3.0,cam:{p:[-2.2,2.4,12.6],l:[-4,1.2,8.6]}}]);}
// get in the car (nearest front door), the car pulls away, then fade to the next place
function scriptCar(car,to){const h=car.userData.home,ry=car.rotation.y,f=new T.Vector3(Math.sin(ry),0,Math.cos(ry));
  const side=k=>{const o=new T.Vector3(k*1.55,0,0.35).applyAxisAngle(new T.Vector3(0,1,0),ry);return [h.x+o.x,h.z+o.z];};
  const a=side(1),b=side(-1),dr=Math.hypot(a[0]-player.position.x,a[1]-player.position.z)<Math.hypot(b[0]-player.position.x,b[1]-player.position.z)?a:b;
  runScript([{go:dr,direct:scn!=='villa'},{face:[h.x,h.z],dur:0.35},
    {do:()=>{SND.sfx('door');player.visible=false;if(kidOk()){kid.hold={hidden:true};kid.p.root.visible=false;}if(scn!=='villa')npcs.forEach(n=>n.p.root.visible=false);}},{dur:0.45},
    {dur:2.6,do:()=>SND.sfx('engine',{dur:2.9}),cam:{p:[h.x+f.z*8.5-f.x*2.5,2.6,h.z-f.x*8.5-f.z*2.5],l:[h.x+f.x*5,0.9,h.z+f.z*5]},fx:(u,dt,t,st)=>{const d=0.5*5.5*t*t;car.position.set(h.x+f.x*d,h.y,h.z+f.z*d);if(Math.random()<dt*6)puff(car.position.x-f.x*2.6,0.4,car.position.z-f.z*2.6,{col:0xbdb8b0,size:0.4,vy:0.3,op:0.35,life:1.0});
      if(t>1.5&&!st.fired){st.fired=true;transition(to);}}}]);}
const COT_CAM={p:[2.2,2.5,1.1],l:[-1.3,0.95,-2.1]};
function scriptBed(){const putting=!todsAsleep;
  const steps=[{go:[DOOR.x+0.9,DOOR.z-0.2]},{face:0,dur:0.3},fadeTo(0.6,true),{do:()=>enterBedroom()},fadeTo(0.6,false)];
  if(putting)steps.push({go:[-1.2,-1.3],direct:true,speed:2.4},{face:Math.PI,dur:0.3},{pose:'tuck',dur:2.6,cam:COT_CAM,do:()=>SND.sfx('lullaby')});
  runScript(steps);}
function scriptWake(){const b=kidsRoom.userData.bed;
  runScript([{go:[-1.2,-1.3],direct:true,speed:3},{face:Math.PI,dur:0.3},{pose:'tuck',dur:1.0,cam:COT_CAM},
    {do:()=>{SND.sfx('birds');SND.sfx('giggle',{delay:0.25});placePerson(kid.p,b.x,b.z,0,0.92);kid.p.py=0;kid.p.pose='cheer';}},{pose:'wave',dur:1.7,cam:COT_CAM},fadeTo(0.5,true),
    {do:()=>{todsAsleep=false;bedtimeWarned=false;wakeupWarned=false;addV(8);kid.mood=Math.max(kid.mood,80);toast('☀️ Rise and shine! One very excited toddler.');exitBedroom();}},fadeTo(0.5,false)]);}
function scriptLeaveRoom(){runScript([{go:[0,4.6],direct:true,speed:2.2},fadeTo(0.5,true),{do:()=>exitBedroom()},fadeTo(0.5,false)]);}
function scriptTalk(n,pp,np){n.hold={t:2.6,pose:np||'laugh'};runScript([{face:()=>[n.p.root.position.x,n.p.root.position.z],dur:0.35},{pose:pp||'talk',dur:2.1}]);}
function scriptPickup(kind){if(playerAnim)return;runScript([{pose:kind==='orange'?'reach':'crouch',dur:0.6}]);}

// ---- the chiringuito's ice-cream seller ----
let vendor=null;
function buildVendor(){vendor=makePerson({h:2.28,skin:0xd9a47c,hair:0x2a1d14,hairStyle:'short',top:{type:'tee',col:0xe05a4a,pat:'stripes',pat2:0xfbf6ec},bottom:{type:'shorts',col:0x2f3e5a},shoes:{type:'trainer',col:0xffffff},hat:'bucket',hatCol:0xf2efe6});
  world.add(vendor.root);placePerson(vendor,33.7,-15.8,-2.0);vendor.lookAt=null;solids.push({x:33.7,z:-15.8,rx:0.4,rz:0.4});}

function enterBedroom(){
  bedtimeEntry=!todsAsleep; // remember if we came in to put them down vs. to wake them
  scn='bed';world.visible=false;plaza.visible=false;kidsRoom.visible=true;
  placePerson(playerP,0,4,Math.PI);player.rotation.y=Math.PI;playerYaw=Math.PI;camYaw=Math.PI;camPitch=0;
  cam.position.set(0,7.5,16);skyGroup.visible=false;scene.background=new T.Color(0x140f1a);
  familyToScene('bed','villa');
  const b=kidsRoom.userData.bed,kp=kid.p;kp.root.visible=true;placePerson(kp,b.x-0.3,b.z,Math.PI/2,0);kp.py=b.y-0.05;kp.pose='sleep';kp.lookAt=null;kid.mood=100;kid.minder='player';animPerson(kp,1,true);
  if(!todsAsleep){todsAsleep=true;wakeupWarned=true;tucked=true;addV(6);toast('😴 Little one down, lights low. Bliss.');}
}
function exitBedroom(){
  scn='villa';kidsRoom.visible=false;world.visible=true;
  placePerson(playerP,0.5,14.2,Math.PI);player.rotation.y=Math.PI;playerYaw=Math.PI;camYaw=Math.PI;camPitch=0;
  cam.position.set(0.5,9,29);skyGroup.visible=true;
  npcs.forEach(n=>{n.p.root.visible=n.state!=='inside';});
  const kp=kid.p;kp.py=0;kp.pose='auto';kp.lookAt=null;
  if(todsAsleep){kp.root.visible=false;}  // stay hidden until morning wakeup
  else{kp.root.visible=true;placePerson(kp,player.position.x+0.8,player.position.z+2.2,Math.PI);animPerson(kp,1,true);}
}
let last=performance.now(),debugCam=null;
function animate(now){
  const dt=Math.min(0.05,(now-last)/1000);last=now;
  if(started)update(dt);else updateTitle(dt);
  SND.update(dt,{scn:started?scn:'title',tod:timeOfDay,px:player.position.x,pz:player.position.z,anim:playerAnim&&playerAnim.type});
  if(debugCam){cam.position.set(debugCam[0],debugCam[1],debugCam[2]);cam.lookAt(debugCam[3],debugCam[4],debugCam[5]);}
  // sky dome, sun, moon, stars and clouds ride along with the camera
  skyGroup.position.copy(cam.position);if(scene.userData.moonMesh)scene.userData.moonMesh.quaternion.copy(cam.quaternion);
  renderer.render(scene,cam);
  requestAnimationFrame(animate);
}

// boot
// ===================== SOUND: procedural music, ambience and effects (Web Audio, no audio files) =====================
// Day: a laid-back acoustic tune (soft nylon-guitar offbeats, warm pad, marimba and whistle melody, shaker). Night: slow fingerpicked guitar.
// Ambience follows the scene (waves + gulls + cicadas / crickets at the villa, fountain + crowd in Seville, engines in the air).
const SND=(()=>{
  let ctx=null,master,musicG,sfxG,ambG,noiseBuf,brownBuf,muted=false,running=false,iosAudio=null;
  try{muted=localStorage.getItem('villaMute')==='1';}catch(e){}
  const mtof=m=>440*Math.pow(2,(m-69)/12),rnd=(a,b)=>a+Math.random()*(b-a);
  const ok=()=>ctx&&running&&ctx.state==='running';
  function ensure(){if(ctx)return true;const AC=window.AudioContext||window.webkitAudioContext;if(!AC)return false;
    try{ctx=new AC();}catch(e){return false;}
    const comp=ctx.createDynamicsCompressor();comp.threshold.value=-16;comp.knee.value=12;comp.ratio.value=3;comp.attack.value=0.004;comp.release.value=0.3;
    master=ctx.createGain();master.gain.value=muted?0:1;master.connect(comp);comp.connect(ctx.destination);
    musicG=ctx.createGain();musicG.gain.value=0;musicG.connect(master);
    sfxG=ctx.createGain();sfxG.gain.value=1;sfxG.connect(master);
    ambG=ctx.createGain();ambG.gain.value=0.9;ambG.connect(master);
    const sr=ctx.sampleRate,L=sr*3;noiseBuf=ctx.createBuffer(1,L,sr);const d=noiseBuf.getChannelData(0);for(let i=0;i<L;i++)d[i]=Math.random()*2-1;
    brownBuf=ctx.createBuffer(1,L,sr);const b=brownBuf.getChannelData(0);let l=0;for(let i=0;i<L;i++){l=(l+0.02*(Math.random()*2-1))/1.02;b[i]=l*3.5;}
    const F=Math.floor(sr*0.3);for(let i=0;i<F;i++){const k=i/F;b[L-F+i]=b[L-F+i]*(1-k)+b[i]*k;}   // seamless loop
    buildAmbience();
    document.addEventListener('visibilitychange',()=>{if(!ctx||!running)return;if(document.hidden)ctx.suspend();else ctx.resume();});
    return true;}
  // iPhones mute Web Audio with the silent switch unless the page is treated as media playback
  function iosUnlock(){try{if(navigator.audioSession)navigator.audioSession.type='playback';}catch(e){}
    if(iosAudio)return;try{const sr=8000,n=4000,buf=new ArrayBuffer(44+n),v=new DataView(buf),w=(o,s)=>{for(let i=0;i<s.length;i++)v.setUint8(o+i,s.charCodeAt(i));};
      w(0,'RIFF');v.setUint32(4,36+n,true);w(8,'WAVE');w(12,'fmt ');v.setUint32(16,16,true);v.setUint16(20,1,true);v.setUint16(22,1,true);v.setUint32(24,sr,true);v.setUint32(28,sr,true);v.setUint16(32,1,true);v.setUint16(34,8,true);w(36,'data');v.setUint32(40,n,true);
      for(let i=0;i<n;i++)v.setUint8(44+i,128);iosAudio=document.createElement('audio');iosAudio.src=URL.createObjectURL(new Blob([buf],{type:'audio/wav'}));iosAudio.loop=true;iosAudio.setAttribute('playsinline','');
      const p=iosAudio.play();if(p&&p.catch)p.catch(()=>{});}catch(e){}}
  function unlock(){if(!ensure())return;iosUnlock();if(ctx.state!=='running'){const p=ctx.resume();if(p&&p.then)p.then(()=>{if(!running)begin();});}if(ctx.state==='running'&&!running)begin();}
  function begin(){running=true;prewarm();nextT=ctx.currentTime+0.2;step=0;bar=0;if(!timer)timer=setInterval(sched,25);}

  // ---------- instruments ----------
  const ksCache={};
  function ks(m,dur,damp,bright){const key=m+'|'+dur+'|'+damp+'|'+bright;if(ksCache[key])return ksCache[key];
    const sr=ctx.sampleRate,f=mtof(m),N=Math.max(2,Math.floor(sr/f)),len=Math.floor(sr*dur),buf=ctx.createBuffer(1,len,sr),out=buf.getChannelData(0),dl=new Float32Array(N);
    let p=0;for(let i=0;i<N;i++){p+=((Math.random()*2-1)-p)*bright;dl[i]=p;}
    let j=0;for(let i=0;i<len;i++){const a=dl[j],n=j+1===N?0:j+1;out[i]=a;dl[j]=(a+dl[n])*0.5*damp;j=n;}
    const Fd=Math.min(len,Math.floor(sr*0.06));for(let i=0;i<Fd;i++)out[len-1-i]*=i/Fd;
    return (ksCache[key]={buf,rate:f/(sr/N)});}
  const pan=(node,p)=>{if(ctx.createStereoPanner&&p){const s=ctx.createStereoPanner();s.pan.value=p;node.connect(s);return s;}return node;};
  function pluck(t,m,vel,o){o=o||{};const k=ks(m,o.dur||1.8,o.damp||0.996,o.bright||0.5),s=ctx.createBufferSource();s.buffer=k.buf;s.playbackRate.value=k.rate;
    const g=ctx.createGain();g.gain.value=vel;s.connect(g);pan(g,o.pan).connect(o.dest||musicG);s.start(t);return {s,g};}
  function mute(v,t){if(!v)return;try{v.g.gain.setTargetAtTime(0,t,0.02);v.s.stop(t+0.15);}catch(e){}}
  function noise(t,o){const s=ctx.createBufferSource();s.buffer=o.brown?brownBuf:noiseBuf;const f=ctx.createBiquadFilter();f.type=o.type||'bandpass';f.frequency.value=o.f||2000;f.Q.value=o.q||1;
    const g=ctx.createGain(),a=o.attack||0.002,d=o.dur||0.1;g.gain.setValueAtTime(0.0001,t);g.gain.linearRampToValueAtTime(o.vel||0.3,t+a);g.gain.exponentialRampToValueAtTime(0.0001,t+a+d);
    s.connect(f);f.connect(g);pan(g,o.pan).connect(o.dest||sfxG);s.start(t,Math.random()*2);s.stop(t+a+d+0.05);return {s,f,g};}
  function tone(t,o){const osc=ctx.createOscillator();osc.type=o.type||'sine';osc.frequency.setValueAtTime(o.f,t);if(o.f2)osc.frequency.exponentialRampToValueAtTime(o.f2,t+(o.glide||o.dur||0.2));
    const g=ctx.createGain(),a=o.attack||0.004,d=o.dur||0.2;g.gain.setValueAtTime(0.0001,t);g.gain.linearRampToValueAtTime(o.vel||0.2,t+a);g.gain.exponentialRampToValueAtTime(0.0001,t+a+d);
    let out=g;if(o.filter){const f=ctx.createBiquadFilter();f.type=o.filter;f.frequency.value=o.ff||1500;f.Q.value=o.fq||1;g.connect(f);out=f;}
    osc.connect(g);pan(out,o.pan).connect(o.dest||sfxG);osc.start(t);osc.stop(t+a+d+0.05);return {osc,g};}
  function bell(t,f,vel,dur,dest){tone(t,{f,vel,dur:dur||0.9,dest});tone(t,{f:f*2.76,vel:vel*0.25,dur:(dur||0.9)*0.4,dest});}
  function whistle(t,m,dur,vel){const f=mtof(m),o=ctx.createOscillator();o.type='sine';o.frequency.value=f;const v=ctx.createOscillator();v.frequency.value=5.3;const vg=ctx.createGain();vg.gain.setValueAtTime(0,t);vg.gain.linearRampToValueAtTime(f*0.011,t+0.18);v.connect(vg);vg.connect(o.frequency);
    const g=ctx.createGain();g.gain.setValueAtTime(0.0001,t);g.gain.linearRampToValueAtTime(vel,t+0.035);g.gain.setValueAtTime(vel,t+Math.max(0.05,dur-0.07));g.gain.linearRampToValueAtTime(0.0001,t+dur);
    o.connect(g);g.connect(musicG);o.start(t);v.start(t);o.stop(t+dur+0.03);v.stop(t+dur+0.03);}
  const DR={shaker:(t,v)=>noise(t,{type:'highpass',f:6500,q:0.7,attack:0.012,dur:0.05,vel:0.09*v,dest:musicG,pan:-0.3})};

  // ---------- the songs ----------
  const CH={D:[50,57,62,66,69],G:[43,50,55,59,62,67],A:[45,52,57,61,64],Bm:[47,54,59,62,66],Fsm:[42,49,54,57,61],
    Dmaj7:[50,57,61,66,69],Bm7:[47,54,57,62,66],Em7:[40,47,50,55,59],A7:[45,52,55,61,64],Gmaj7:[43,50,54,59,62],Fsm7:[42,49,52,57,61]};
  const ROOT={D:38,G:43,A:45,Bm:47,Fsm:42,Dmaj7:38,Bm7:47,Em7:40,A7:45,Gmaj7:43,Fsm7:42};
  const SEC_A=['Dmaj7','Gmaj7','A7','Dmaj7','Bm7','Gmaj7','A7','A7'],SEC_B=['Gmaj7','A7','Fsm7','Bm7','Gmaj7','A7','Dmaj7','Dmaj7'];
  const MEL_A=[[[0,69,1],[1,66,.5],[1.5,69,.5],[2,74,2]],[[0,74,.5],[.5,73,.5],[1,71,1],[2,67,1.5],[3.5,69,.5]],[[0,71,1],[1,69,.5],[1.5,67,.5],[2,64,1],[3,69,1]],[[0,66,1.5],[1.5,64,.5],[2,62,2]],
    [[0,71,1],[1,74,.5],[1.5,71,.5],[2,78,1.5],[3.5,76,.5]],[[0,74,1],[1,71,1],[2,67,1],[3,71,1]],[[0,69,.5],[.5,71,.5],[1,73,1],[2,76,1],[3,73,1]],[[0,69,3]]];
  const MEL_B=[[[0,71,.5],[.5,74,.5],[1,79,1],[2,78,1],[3,76,1]],[[0,76,.5],[.5,78,.5],[1,76,1],[2,73,1.5],[3.5,69,.5]],[[0,73,1],[1,78,1],[2,76,.5],[2.5,73,.5],[3,69,1]],[[0,74,1.5],[1.5,73,.5],[2,71,2]],
    [[0,71,.5],[.5,74,.5],[1,79,1],[2,81,1],[3,79,1]],[[0,78,1],[1,76,1],[2,73,1],[3,76,1]],[[0,78,1],[1,76,.5],[1.5,74,.5],[2,73,1],[3,69,1]],[[0,74,2],[2,62,.5],[2.5,66,.5],[3,69,1]]];
  // 32-bar day form: A (marimba tune) · B (soft whistle) · A (just the groove, room to breathe) · B (marimba)
  const DAY=[];[0,1,2,3].forEach(s=>{const A=s%2===0;for(let b=0;b<8;b++)DAY.push({ch:(A?SEC_A:SEC_B)[b],mel:(A?MEL_A:MEL_B)[b],lead:s===1?'wh':s===2?null:'mar'});});
  const NIGHT=['Dmaj7','Bm7','Em7','A7','Dmaj7','Bm7','Em7','A7','Gmaj7','A7','Fsm7','Bm7','Em7','A7','Dmaj7','Dmaj7'];
  let mood='day',want='day',bar=0,step=0,nextT=0,timer=null,strings=[],musicVol=0.3;
  function prewarm(){const set=new Set();Object.values(CH).forEach(c=>c.forEach(m=>set.add(m)));set.forEach(m=>{ks(m,1.6,0.996,0.36);ks(m,1.6,0.996,0.4);});
    Object.values(ROOT).forEach(m=>{ks(m,1.2,0.993,0.3);ks(m+7,1.2,0.993,0.3);ks(m+12,1.2,0.993,0.3);});[...MEL_A,...MEL_B].forEach(b=>b.forEach(n=>ks(n[1],2.2,0.998,0.7)));}
  function strum(t,chord,kind,vel){const c=CH[chord],idx=kind==='D'?[1,2,3,4]:[4,3,2];
    idx.forEach((i,k)=>{const tt=t+k*(kind==='D'?0.016:0.012);mute(strings[i],tt);strings[i]=pluck(tt,c[i],0.13*vel*(1-k*0.05),{dur:1.6,damp:0.996,bright:0.36,pan:(i-2.5)*0.1});});}
  function pad(t,chord,len){const f=ctx.createBiquadFilter();f.type='lowpass';f.frequency.value=850;const g=ctx.createGain();g.gain.setValueAtTime(0.0001,t);g.gain.linearRampToValueAtTime(0.016,t+0.9);g.gain.setValueAtTime(0.016,t+len-0.2);g.gain.linearRampToValueAtTime(0.0001,t+len+1.0);
    f.connect(g);g.connect(musicG);CH[chord].slice(1,5).forEach(m=>[-4,4].forEach(dc=>{const o=ctx.createOscillator();o.type='triangle';o.frequency.value=mtof(m);o.detune.value=dc;o.connect(f);o.start(t);o.stop(t+len+1.1);}));}
  function marimba(t,m,vel){const f=mtof(m);tone(t,{f,dur:0.7,vel,dest:musicG,pan:0.15});tone(t,{f:f*4,dur:0.12,vel:vel*0.22,dest:musicG,pan:0.15});tone(t,{f:f*2,dur:0.25,vel:vel*0.12,dest:musicG,pan:0.15});}
  function dayStep(t,spb){const B=DAY[bar%DAY.length],s=step,beat=spb*2,r=ROOT[B.ch];
    if(s===0){pad(t,B.ch,beat*4);pluck(t,r,0.34,{dur:1.2,damp:0.993,bright:0.28});strum(t,B.ch,'D',0.5);}
    if(s===3)strum(t,B.ch,'U',0.36);if(s===4)pluck(t,r+7,0.26,{dur:1.2,damp:0.993,bright:0.28});if(s===6)strum(t,B.ch,'D',0.38);
    if(s===2||s===6)noise(t,{type:'lowpass',f:1400,q:0.5,dur:0.07,vel:0.05,dest:musicG,pan:0.2});
    DR.shaker(t,s%2?0.45:0.22);
    if(s===0&&B.lead)B.mel.forEach(([o,m,d])=>{const tt=t+o*beat;if(B.lead==='mar')marimba(tt,m,0.06);else whistle(tt,m,d*beat*0.95,0.04);});}
  function nightStep(t,spb){const ch=NIGHT[bar%NIGHT.length],c=CH[ch],s=step,pat=[0,2,3,4,1,3,4,2];
    const i=pat[s];mute(strings[i],t);strings[i]=pluck(t,c[i],s===0?0.36:0.23,{dur:1.6,damp:0.996,bright:0.4,pan:(i-2)*0.1});
    if(s===0)pluck(t,ROOT[ch],0.4,{dur:1.2,damp:0.993,bright:0.3});
    if(s%2===1&&bar%2===0)DR.shaker(t,0.35);
    if((s===2||s===6)&&Math.random()<0.25)bell(t,mtof(c[2+Math.floor(Math.random()*3)]+24),0.022,1.4,musicG);}
  function sched(){if(!ok())return;const T0=ctx.currentTime;if(nextT<T0-0.05)nextT=T0+0.05;
    while(nextT<T0+0.3){const spb=60/(mood==='day'?88:72)/2;if(musicVol>0.001){if(mood==='day')dayStep(nextT,spb);else nightStep(nextT,spb);}
      nextT+=spb;step++;if(step===8){step=0;bar++;if(want!==mood){mood=want;bar=0;}}}}

  // ---------- ambience ----------
  const A={};let gullT=6,crickT=1,paT=20,swimT=0,bubT=0,ambT=0;
  function bed(buf,rate,filters,pn){const s=ctx.createBufferSource();s.buffer=buf;s.loop=true;s.playbackRate.value=rate||1;let n=s;
    filters.forEach(([type,f,q])=>{const b=ctx.createBiquadFilter();b.type=type;b.frequency.value=f;b.Q.value=q||0.7;n.connect(b);n=b;});
    const g=ctx.createGain();g.gain.value=0;n.connect(g);pan(g,pn).connect(ambG);s.start(0,Math.random()*2);return g;}
  function buildAmbience(){A.sea=bed(brownBuf,1,[['lowpass',520,0.6]]);A.surf=bed(noiseBuf,0.8,[['bandpass',1100,0.35],['lowpass',3200]],0.2);
    A.cic=bed(noiseBuf,1,[['bandpass',5200,7]],-0.3);const lfo=ctx.createOscillator();lfo.frequency.value=31;const lg=ctx.createGain();lg.gain.value=0.5;lfo.connect(lg);A.cicAM=ctx.createGain();A.cicAM.gain.value=0.5;
    A.cic.disconnect();A.cic.connect(A.cicAM);lg.connect(A.cicAM.gain);A.cicAM.connect(ambG);lfo.start();
    A.fount=bed(noiseBuf,1,[['highpass',450],['lowpass',4200]]);A.crowd=bed(brownBuf,1.9,[['bandpass',480,0.8]]);
    A.engine=bed(brownBuf,0.55,[['lowpass',240,0.8]]);A.wind=bed(noiseBuf,0.6,[['bandpass',700,0.5]]);
    A.hum=ctx.createGain();A.hum.gain.value=0;const ho=ctx.createOscillator();ho.type='sawtooth';ho.frequency.value=116;const hf=ctx.createBiquadFilter();hf.type='lowpass';hf.frequency.value=300;ho.connect(hf);hf.connect(A.hum);A.hum.connect(ambG);ho.start();}
  const setA=(k,v,tc)=>{if(A[k])A[k].gain.setTargetAtTime(v,ctx.currentTime,tc||0.4);};
  const dbg={music:1,amb:1};
  const SCN_MUSIC={villa:0.36,bed:0.2,plaza:0.36,terminal:0.24,cabin:0.2,wingview:0.24,landing:0.24,title:0.36};

  // ---------- effects ----------
  const last={};const thr=(k,s)=>{const t=performance.now()/1000;if(last[k]&&t-last[k]<s)return false;last[k]=t;return true;};
  const TALK={mum:300,dad:185,nana:350,papa:165,auntie:370,kid:540};
  const FX={
    click:t=>tone(t,{type:'triangle',f:880,f2:620,dur:0.06,vel:0.12}),
    chime:t=>{bell(t,987.8,0.07,0.7);bell(t+0.09,1318.5,0.07,0.9);},
    sparkle:t=>[1047,1319,1568,2093].forEach((f,i)=>bell(t+i*0.05,f,0.06,0.5)),
    pop:t=>tone(t,{f:520,f2:1150,dur:0.09,vel:0.09}),
    splash:(t,o)=>{const big=(o&&o.size)||0,d=big>1?0.9:big?0.45:0.25;const n=noise(t,{type:'lowpass',f:big>1?3200:4500,q:0.6,dur:d,vel:big>1?0.55:big?0.3:0.16,attack:0.01});n.f.frequency.exponentialRampToValueAtTime(380,t+d);
      if(big>1){tone(t,{f:95,f2:40,dur:0.3,vel:0.45});for(let i=0;i<8;i++)tone(t+0.3+Math.random()*0.6,{f:rnd(350,700),f2:rnd(900,1500),glide:0.05,dur:0.06,vel:0.04});}},
    bubbles:(t,o)=>{const d=(o&&o.dur)||3;for(let i=0;i<d*9;i++){const f=rnd(260,520);tone(t+Math.random()*d,{f,f2:f*rnd(2,3),glide:0.05,dur:0.05,vel:0.035,pan:rnd(-0.5,0.5)});}},
    sizzle:(t,o)=>{const d=(o&&o.dur)||4,n=noise(t,{type:'highpass',f:3000,q:0.5,dur:d,vel:0.12,attack:0.3});for(let i=0;i<d*14;i++)noise(t+Math.random()*d,{f:rnd(3000,7000),q:3,dur:0.012,vel:rnd(0.05,0.14)});return n;},
    simmer:(t,o)=>{const d=(o&&o.dur)||4;noise(t,{type:'lowpass',f:900,dur:d,vel:0.06,attack:0.4,brown:true});for(let i=0;i<d*6;i++){const f=rnd(160,320);tone(t+Math.random()*d,{f,f2:f*2.2,glide:0.07,dur:0.08,vel:0.05});}},
    pour:(t,o)=>{const d=(o&&o.dur)||1.5,n=noise(t,{f:420,q:5,dur:d,vel:0.2,attack:0.08});n.f.frequency.linearRampToValueAtTime(1300,t+d);const l=ctx.createOscillator();l.frequency.value=12;const lg=ctx.createGain();lg.gain.value=160;l.connect(lg);lg.connect(n.f.frequency);l.start(t);l.stop(t+d+0.1);},
    clink:t=>{[0,0.17].forEach(o=>{tone(t+o,{f:2637,dur:0.35,vel:0.06});tone(t+o,{f:3951,dur:0.25,vel:0.035});});},
    creak:(t,o)=>{const d=(o&&o.dur)||0.55,osc=ctx.createOscillator();osc.type='sawtooth';const c=new Float32Array(14);for(let i=0;i<14;i++)c[i]=rnd(85,170);osc.frequency.setValueCurveAtTime(c,t,d);
      const f=ctx.createBiquadFilter();f.type='bandpass';f.frequency.value=750;f.Q.value=4;const g=ctx.createGain();g.gain.setValueAtTime(0.0001,t);g.gain.linearRampToValueAtTime(0.09,t+0.05);g.gain.exponentialRampToValueAtTime(0.0001,t+d);osc.connect(f);f.connect(g);g.connect(sfxG);osc.start(t);osc.stop(t+d+0.05);},
    thud:t=>{tone(t,{f:90,f2:50,dur:0.16,vel:0.3});noise(t,{type:'lowpass',f:500,dur:0.08,vel:0.2});},
    hiss:(t,o)=>noise(t,{type:'highpass',f:3500,q:0.5,dur:(o&&o.dur)||1.4,vel:0.14,attack:0.05}),
    bell:t=>{for(let k=0;k<6;k++){tone(t+k*0.06,{f:2350,dur:0.22,vel:0.06});tone(t+k*0.06,{f:3520,dur:0.12,vel:0.03});}},
    dig:t=>{noise(t,{type:'lowpass',f:1300,dur:0.12,vel:0.18});noise(t+0.02,{type:'highpass',f:3000,dur:0.06,vel:0.05});},
    fanfare:t=>[74,78,81,86].forEach((m,i)=>{tone(t+i*0.11,{type:'triangle',f:mtof(m),dur:i===3?0.6:0.14,vel:0.09});tone(t+i*0.11,{f:mtof(m+12),dur:i===3?0.5:0.1,vel:0.03});}),
    engine:(t,o)=>{const d=(o&&o.dur)||2.6,osc=ctx.createOscillator();osc.type='sawtooth';osc.frequency.setValueAtTime(38,t);osc.frequency.linearRampToValueAtTime(46,t+0.5);osc.frequency.exponentialRampToValueAtTime(95,t+d);
      const f=ctx.createBiquadFilter();f.type='lowpass';f.frequency.value=380;const g=ctx.createGain();g.gain.setValueAtTime(0.0001,t);g.gain.linearRampToValueAtTime(0.2,t+0.25);g.gain.setValueAtTime(0.2,t+d*0.7);g.gain.linearRampToValueAtTime(0.0001,t+d);
      osc.connect(f);f.connect(g);g.connect(sfxG);osc.start(t);osc.stop(t+d+0.05);noise(t,{type:'lowpass',f:600,dur:d,vel:0.08,attack:0.3,brown:true});},
    door:t=>{noise(t,{type:'lowpass',f:520,dur:0.1,vel:0.35});tone(t,{f:75,f2:55,dur:0.1,vel:0.25});},
    shutter:t=>{noise(t,{type:'highpass',f:2200,dur:0.025,vel:0.3});noise(t+0.08,{type:'highpass',f:1800,dur:0.035,vel:0.25});},
    whoosh:t=>{const n=noise(t,{f:300,q:0.8,dur:0.8,vel:0.12,attack:0.25});n.f.frequency.exponentialRampToValueAtTime(2400,t+0.4);n.f.frequency.exponentialRampToValueAtTime(350,t+1.0);},
    lullaby:t=>[76,79,84,83,81,79,76,74,76].forEach((m,i)=>bell(t+i*0.36,mtof(m+12),0.05,1.3)),
    birds:t=>{for(let i=0;i<5;i++){const tt=t+i*0.22+Math.random()*0.1,f=rnd(2800,3600);tone(tt,{f,f2:f*rnd(1.2,1.45),glide:0.07,dur:0.08,vel:0.04,pan:rnd(-0.6,0.6)});}},
    giggle:t=>{for(let i=0;i<5;i++)tone(t+i*0.1,{type:'triangle',f:620-i*25,f2:520-i*25,glide:0.08,dur:0.08,vel:0.05,filter:'bandpass',ff:1500,fq:1});},
    gull:t=>{const p=rnd(-0.7,0.7),n=2+Math.floor(Math.random()*2);for(let i=0;i<n;i++){const tt=t+i*0.34;tone(tt,{type:'sawtooth',f:1320,f2:1720,glide:0.08,dur:0.09,vel:0.03,filter:'bandpass',ff:1700,fq:3,pan:p});tone(tt+0.1,{type:'sawtooth',f:1650,f2:1050,glide:0.24,dur:0.26,vel:0.035,filter:'bandpass',ff:1500,fq:3,pan:p});}},
    cricket:t=>{const f=rnd(4100,4700),p=rnd(-0.8,0.8);for(let i=0;i<3;i++)tone(t+i*0.045,{f,dur:0.022,vel:0.02,pan:p});},
    pa:t=>[784,988,1175].forEach((f,i)=>bell(t+i*0.38,f,0.06,1.1)),
  };
  function sfx(name,o){if(!ok()||!FX[name])return;const t=ctx.currentTime+((o&&o.delay)||0);try{FX[name](t,o);}catch(e){}}
  function talk(id,delay){if(!ok())return;const p=TALK[id]||300,n=4+Math.floor(Math.random()*4);let t=ctx.currentTime+(delay||0);
    for(let i=0;i<n;i++){const f=p*rnd(0.85,1.25);tone(t,{type:'square',f,f2:f*rnd(0.85,1.15),glide:0.06,dur:0.06,vel:0.035,filter:'bandpass',ff:rnd(900,1600),fq:1.5});t+=rnd(0.07,0.11);}}

  // ---------- per-frame: music mood/volume, ambience mix, occasional wildlife ----------
  function update(dt,s){if(!ok())return;ambT+=dt;const sc=s.scn,night=s.tod>=20.5||s.tod<6.5;
    want=(sc==='bed'||((sc==='villa'||sc==='title')&&night))?'night':'day';
    const mv=SCN_MUSIC[sc]||0.25;if(Math.abs(mv-musicVol)>0.001){musicVol=mv;}musicG.gain.setTargetAtTime(musicVol*dbg.music,ctx.currentTime,0.8);
    const villa=sc==='villa'||sc==='title',nearSea=villa?Math.max(0.2,Math.min(1,1-(s.pz+45)/110)):0,wave=Math.pow(0.5+0.5*Math.sin(ambT*0.85),3);
    setA('sea',villa?0.2*nearSea*(0.75+0.25*Math.sin(ambT*0.23))*dbg.amb:(sc==='bed'?0.03:0),0.5);setA('surf',villa?0.1*nearSea*(0.2+0.8*wave)*dbg.amb:0,0.25);
    setA('cic',villa&&s.tod>=10&&s.tod<19.5?0.018:0,1.2);
    const fd=sc==='plaza'?Math.hypot(s.px,s.pz):999;setA('fount',sc==='plaza'?Math.max(0.03,0.2*(1-fd/140)):0,0.5);
    setA('crowd',sc==='plaza'?0.08:sc==='terminal'?0.15:sc==='cabin'?0.04:0,0.6);
    setA('engine',sc==='cabin'?0.28:(sc==='wingview'||sc==='landing')?0.22:0,0.8);setA('hum',sc==='cabin'?0.03:0,0.8);setA('wind',(sc==='wingview'||sc==='landing')?0.12:0,0.8);
    if(villa&&!night){gullT-=dt;if(gullT<0){gullT=rnd(7,18);sfx('gull');}}
    if((villa&&night)||sc==='bed'){crickT-=dt;if(crickT<0){crickT=rnd(0.25,0.8);if(sc!=='bed'||Math.random()<0.3)sfx('cricket');}}
    if(sc==='terminal'){paT-=dt;if(paT<0){paT=rnd(22,40);sfx('pa');}}
    if(s.anim==='swim'){swimT-=dt;if(swimT<0){swimT=0.55;sfx('splash',{size:0});}}
    if(s.anim==='jacuzzi'){bubT-=dt;if(bubT<0){bubT=1;sfx('bubbles',{dur:1});}}}
  function toggle(){muted=!muted;try{localStorage.setItem('villaMute',muted?'1':'0');}catch(e){}if(ctx)master.gain.setTargetAtTime(muted?0:1,ctx.currentTime,0.05);return muted;}
  function tap(){if(!ctx)return null;const an=ctx.createAnalyser();an.fftSize=2048;master.connect(an);return {an,ctx};}
  return {unlock,sfx,talk,update,toggle,isMuted:()=>muted,throttle:thr,tap,dbg,state:()=>({ctx:ctx&&ctx.state,running,mood,want,musicVol})};
})();
// sound: unlock on the first tap/key (browsers need a gesture), mute buttons (and M), button clicks
{const icon=()=>{const m=SND.isMuted();['sndBtn','sndBtnT'].forEach(id=>{const b=$(id);if(b){b.textContent=m?'🔇':'🔊';b.title=m?'Sound off':'Sound on';}});};
 const un=()=>SND.unlock();['pointerdown','touchend','keydown','click'].forEach(ev=>addEventListener(ev,un,{capture:true,passive:true}));
 ['sndBtn','sndBtnT'].forEach(id=>{const b=$(id);if(b)b.addEventListener('click',e=>{e.stopPropagation();SND.toggle();icon();});});icon();
 addEventListener('keydown',e=>{if(e.key==='m'||e.key==='M'){SND.toggle();icon();}});
 document.addEventListener('click',e=>{const b=e.target.closest&&e.target.closest('button,.pk');if(b&&!b.classList.contains('sndbtn'))SND.sfx('click');},true);}
// title-screen countdown: whole nights (local calendar days) until the Seville trip on 17 May 2027
function updateSleeps(){const el=$('sleeps');if(!el)return;const now=new Date(),n=Math.round((Date.UTC(2027,4,17)-Date.UTC(now.getFullYear(),now.getMonth(),now.getDate()))/864e5);
  if(n<0){el.hidden=true;return;}el.hidden=false;$('sleepsN').textContent=n>0?n.toLocaleString():'🎉';$('sleepsT').textContent=n>1?'sleeps until Seville':n===1?'sleep until Seville!':'No more sleeps. Seville today!';}
updateSleeps();setInterval(updateSleeps,60000);
try{init();requestAnimationFrame(animate);}catch(err){document.getElementById('loadmsg').textContent='Error: '+err.message;console.error(err);}
if(/[?&]debug\b/.test(location.search))window.VillaDebug={SND,get fam(){return fam;},setScene,setPlayerChar,playIntro,enterBedroom,exitBedroom,startPhoto,doAction,
  setTime:t=>{timeOfDay=t;applyTime();refreshEnv(true);},start:()=>{started=true;world.userData.lampPosts.forEach(l=>l.visible=true);$('title').classList.add('hidden');document.body.classList.remove('ontitle');setScene('villa');},
  tp:(x,z,yaw)=>{placePerson(playerP,x,z,yaw==null?Math.PI:yaw);playerYaw=player.rotation.y;cam.position.set(x-Math.sin(camYaw)*15,9,z-Math.cos(camYaw)*15);},
  view:(yaw,pitch)=>{camYaw=yaw;if(pitch!=null)camPitch=pitch;},sim:(secs)=>{const px=player.position.x,pz=player.position.z;for(let i=0;i<secs*20;i++){update(0.05);}return VillaDebug.state();},cam:(a)=>{debugCam=a;},info:()=>renderer.info.render,stats:()=>{const r={};const walk=(o,tag)=>{if(!o.visible)return;if(o.isMesh){const k=tag+':'+(o.isInstancedMesh?'inst':(Array.isArray(o.material)?'arr':(o.material.transparent?'transp':(o.geometry.attributes.color?'vcol':'mesh'))));r[k]=(r[k]||0)+1;}o.children.forEach(c=>walk(c,tag));};scene.children.forEach(c=>walk(c,c===world?'world':c===skyGroup?'sky':(c.userData.person?'person':'other')));return r;},handT:()=>{const h=handTarget();return h?(h.give?'give:':'take:')+h.n.id:null;},doHand,state:()=>({scn,timeOfDay,vibes,kid:kid.minder,npcs:npcs.map(n=>n.id+':'+n.state+':'+(n.hauntId||''))})};
})();
</script>
