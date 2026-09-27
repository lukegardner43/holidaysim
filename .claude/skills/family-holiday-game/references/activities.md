# Writing animated activities

Every activity should play out on screen the way the pool swim does. That was the family's explicit
ask, and it's what makes the game feel alive: walk there, a prop in hand, a pose, effects, sound, a close-up
camera, the little one joining in, then back to normal.

## The five pieces of an activity

1. **A spot**, created in the location builder: `spots.push({x,z,r,id:'tree',label:'decorate the tree 🎄'})`.
   Put it where the player naturally approaches (usually the side they'll stand on), with `r` of 3–5 units.
2. **A time or state rule** in `nearest()` if it only makes sense sometimes (e.g. presents only on Christmas
   morning, stargazing only at night, needing the little one present). Return `null` to hide it, or a
   replacement `{id,label}`.
3. **A `doAction` case**: `case 'tree': doneTree=true; addV(8); cheer(12); timeOfDay+=0.4; toast('🎄 …'); scriptTree(); break;`
   Declare `let doneTree=false` with the other flags. Add the id to the right people's `loves` and to
   `LOVE_TXT`, and add a line to `updateItinerary()`.
4. **The props**: a builder that creates the object at real size, registers `solids`, and keeps anything
   that animates in an fx group or behind a setter hook in `world.userData` (and in the `mergeStatic` skip set).
5. **The animation**: a `runScript([...steps])` function, described next.

## `runScript` steps

A script is an array of steps, run one after another by `stepScript(a,dt)`. A step can have:

| Field | Meaning |
|---|---|
| `go:[x,z]` or `go:()=>[x,z]` | Walk there. In the villa it paths round `solids` via `navPath` unless `direct:true`. Also `speed` (default 5.5) and `y` (target height, e.g. −0.45 for wading). Times out after 10 s and snaps to the target. |
| `face: yaw` \| `[x,z]` \| `()=>…` | Turn to a yaw or towards a point. |
| `pose:'stir'` | The player's pose while the step lasts (`seatH` for seated poses). |
| `prop:'paddle'`, `left:true` | Show a hand prop (`null` hides it). |
| `dur: secs` | How long a non-walking step lasts. |
| `do: ()=>{…}` | Runs once when the step starts: sound, show or hide objects, move the little one. |
| `fx: (u,dt,t,st)=>{…}` | Runs every frame. `u` is progress 0→1, `t` is seconds since the step started, and `st` is per-step state (e.g. `st.fired`). |
| `end: ()=>{…}` | Runs once when the step finishes. |
| `cam: {p:[x,y,z], l:[x,y,z]}` or `null` | Cut-away camera. It blends in and stays until changed or the script ends (then blends back). On portrait phones it automatically pulls back and widens. |

`endScript()` tidies up automatically: it resets the pose, hides props, shows the player, clears the camera,
clears the little one's hold and resets the vendor.

### Helpers

- **Fades:** `fadeTo(dur,on)` returns a fade-out or fade-in step, for time skips and scene changes.
- **The little one:** `kidHold({x,z,yaw,pose,prop,y})` directs the little one during the script (only if they're with the
  player and awake). `kidHold({hidden:true})` hides them, for example when they're in the car.
- **Chats:** `n.hold={t,pose}` makes a family member face the player and hold a pose.
- **Particles:** `puff(x,y,z,{col,size,vy,op,life,spread,grow})` makes soft sprite particles (steam, smoke,
  sand, snow flurries, breath). `splash(x,y,z,n,col)` makes droplets and plays a splash sound for water.
- **Hearts:** `spawnHeart(x,z,h)` pops a heart over someone.
- **Sound:** `SND.sfx(name,{dur,delay,size})` plays an effect and `SND.talk(id,delay)` plays a babble voice (see `sound.md`).

### Camera framing

Pick a camera that sees the player's face *and* the prop:
- stand the camera diagonally in front of the player, 4–6 units away
- place it 2.5–4.5 units high, looking at about 1 unit off the ground
- look over low props rather than through them
- keep walls, trunks and parasols out of the line of sight

Then check the shot in both landscape and portrait (`activities.js … --phone`).

## Worked example from Villa Escape: the BBQ

```js
function scriptBBQ(){const fx=world.userData.bbqFx,F=fx.userData;
  runScript([{go:[22.2,12.55]},{face:Math.PI,dur:0.35,do:()=>{F.off();fx.visible=true;}},
    {pose:'flip',prop:'spatula',dur:4.0,do:()=>SND.sfx('sizzle',{dur:4.2}),cam:{p:[24.9,4.6,7.9],l:[22.0,1.2,11.9]},
     fx:(u,dt,t)=>{F.tick(t,u);if(Math.random()<dt*7)puff(22+(Math.random()-0.5),1.4,11+(Math.random()-0.5)*0.7,{col:0x9a9690,size:0.7,vy:1.3,op:0.4,life:2.2});}},
    {do:()=>{F.cool();setTimeout(()=>{fx.visible=false;F.off();},25000);}}]);}
```

The prop builder `buildBBQ()` gives the fx group (flames, food) `userData.tick/cool/off` hooks, so the
script stays short. The sandcastle does the same with `castle.userData.setBuild(u)`, which grows parts in
sequence as the family digs. Both are good patterns for things that build up, like a snowman or a
decorated tree.

## Worked example for a new game: decorate the Christmas tree

```js
// prop: a real-size tree (≈1.9 m → 2.5 units) with baubles and lights that appear as you decorate
function buildTree(){const g=new T.Group();g.position.set(-3,0,6);world.add(g);
  const tiers=[[1.1,1.0,0.35],[0.85,0.9,0.95],[0.6,0.8,1.5],[0.35,0.7,1.95]];
  tiers.forEach(([r,h,y])=>{const c=new T.Mesh(new T.ConeGeometry(r,h,14),mat(0x2f5a34,{roughness:0.9}));c.position.y=y;c.castShadow=true;g.add(c);});
  const pot=new T.Mesh(new T.CylinderGeometry(0.28,0.22,0.35,14),mat(0x9a3a2a));pot.position.y=0.17;g.add(pot);
  const deco=new T.Group();g.add(deco);const cols=[0xd4202a,0xf2c230,0x2a5fd4,0xe8e8f0];const items=[];
  for(let i=0;i<40;i++){const y=0.45+Math.random()*1.6,r=(1.2-(y-0.35)/2.1*1.0)*0.95,a=Math.random()*6.3;
    const b=new T.Mesh(new T.SphereGeometry(0.055,10,8),stdM(cols[i%4],0.25,{metalness:0.5}));b.position.set(Math.cos(a)*r,y,Math.sin(a)*r);b.visible=false;deco.add(b);items.push(b);}
  const star=new T.Mesh(new T.OctahedronGeometry(0.16),new T.MeshStandardMaterial({color:0xffd84a,emissive:0xffb000,emissiveIntensity:0.6}));star.position.y=2.45;star.visible=false;g.add(star);
  g.userData.setDeco=u=>{items.forEach((b,i)=>b.visible=i<u*items.length);star.visible=u>=1;};
  solids.push({x:-3,z:6,rx:0.9,rz:0.9});spots.push({x:-3,z:7.8,r:3.5,id:'tree',label:'decorate the tree 🎄'});
  world.userData.tree=g;}                                   // + add world.userData.tree to the mergeStatic skip set

function scriptTree(){const t=world.userData.tree,set=t.userData.setDeco;
  kidHold({x:-2.0,z:7.2,yaw:Math.PI+0.6,pose:'reach',prop:'bauble'});
  runScript([{go:[-3.4,7.3]},{face:[-3,6],dur:0.3,do:()=>set(0)},
    {pose:'reach',prop:'bauble',dur:4.5,cam:{p:[-0.4,2.6,9.6],l:[-3,1.3,6]},
     fx:(u,dt)=>{set(u*0.95);if(Math.random()<dt*2)SND.sfx('sparkle');}},
    {pose:'stretch',dur:0.6,do:()=>set(1),end:()=>{SND.sfx('fanfare');spawnHeart(-3,6,2.9);if(kid.hold)kid.hold.pose='cheer';}},
    {pose:'cheer',dur:1.2}]);}
```

To finish it off:
- add a `bauble` prop to `PROP_BUILD`
- add `case 'tree'` to `doAction`
- put `'tree'` in Mum's and Nana's `loves` and `tree:'decorating the tree'` in `LOVE_TXT`
- add an itinerary line
- add a haunt beside the tree so the family gather there in the evening

## More activity ideas and the patterns that fit

| Idea | Pattern |
|---|---|
| Build a snowman | Growth setter (three balls scale up in turn, then the carrot nose and scarf), `dig`/`crouch` pose, snow puffs |
| Snowball fight | Throw pose plus a projectile tween in `fx`, splat puffs, family members replying with `laugh` |
| Sledging | `go` downhill with `direct:true` and a high `speed`, sitting pose on a sledge prop that moves with the player |
| Open presents | Presents under the tree, `unwrap` pose, paper-scrap puffs, toy reveal, the little one cheering |
| Christmas dinner | Walk to the table and seat everyone using haunts and `n.hold`, carving pose, a cracker "pop" with confetti puffs |
| Carols at the piano | Seated pose, music ducked, a short tune played with the `SND` bell or marimba notes |
| Fireside stories | Everyone to the sofas (`n.hold` sit and laugh), a flickering fire fx group, crackle sound |
| Spot Santa's sleigh | The night stargaze pattern: lie or look up, a sleigh sprite crossing the sky, bell sound |

## Checks for every activity

- **Placement:** the player never stands in water, walls or furniture. Pick the `go` target on the open
  side of the prop. The first sangria version stood in the pool until this was fixed.
- **Timing:** it finishes and returns control. `playerAnim` goes back to null, and a failed `go` still
  completes (10 s timeout).
- **Side effects:** effects, visibility changes and timers are undone or intended (for example the BBQ
  food hides after 25 s).
- **The little one:** handled whether they're with the player, with someone else, or asleep (`kidOk()`).
- **Framing:** screenshots mid-animation look right on desktop and on a portrait phone.
