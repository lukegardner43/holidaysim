# Engine map (Villa Escape `src/game.js`)

`game.js` is one IIFE (`"use strict"`, `const T = THREE`) of about 3,300 lines. The big data blobs (`GEO_V`,
`GEO_S`, `GEO_F`, `GEO_X`) are single long lines. Find things by name: line numbers drift as the game
changes. Section banners look like `// ===================== NAME =====================`.

## Contents
1. Boot and scenes
2. Coordinates and scale
3. The main location (`buildVillaWorld`) and its contracts
4. Materials, textures and geometry helpers
5. Characters (`FAMILY`, `makePerson`, poses, props)
6. Family AI (haunts, schedules, chat, the little one)
7. Interaction (`nearest`, `doAction`) and progression
8. Time of day, lighting and the itinerary
9. Other scenes: day trip, airport, intro
10. HUD, title card and countdown (`head.html`)
11. Rendering helpers (`linearizeScene`, `mergeStatic`, `warmUp`)
12. Debug API (`?debug`, `VillaDebug`)

## 1. Boot and scenes

`init()` creates the renderer and sky (a shader dome, clouds, sun, moon and stars), then calls, in order:
- `buildVillaWorld()`, `buildPlaza()`, `buildTerminal()`, `buildCabin()`, `buildWingview()`, `buildLanding()`
- `buildFamily()`, `buildNav()`
- then the HUD, `buildPicker()`, `linearizeScene()`, `applyTime()`/`refreshEnv(true)` and `warmUp()`

The boot line at the end is `try{init();requestAnimationFrame(animate);}`. `animate()` runs `update(dt)` once the game has started
(otherwise `updateTitle`), then `SND.update(...)`, then renders.

- **Scenes:** the global `scn` is one of:
  - `villa`, the main location
  - `bed`, the little one's bedroom, `kidsRoom`
  - `plaza`, the Seville day trip
  - `terminal`, the airport
  - `cabin`, `wingview` and `landing`, the intro shots
- **Switching:** `setScene(to)` shows the right group, places the player, calls `familyToScene()` and sets
  the time for some transitions. `transition(to)` fades out, switches and fades back in.
- **Intro:** `playIntro()` (run by the Start button) plays cabin → wingview → landing → terminal, with
  captions and a skip button. The player then walks to the car, which drives them to the villa.

## 2. Coordinates and scale

- **Scale:** 1.31 game units = 1 metre everywhere (people, buildings, plane, plaza). Adults are about 2.1–2.45
  units tall. Keep new props to real sizes (a paella pan is about 0.95 m across, so 0.62 units in radius).
- **Villa layout:** the villa world faces the sea. The sea is at −z, the beach at z≈−40, the promenade at z≈−15,
  the pool centre (0, 5) at 16×6.5, the house front around z≈15–27, and inland is +z. `DOOR={x:0.5,z:15.1}`.
- **Bounds:** the walkable area per scene is set in `update()` (`minZ`/`maxZ`/`lim`), with `pushOut()` for
  scene-specific obstacles.
- **Ground:** `terrainY(x,z)` (from `buildGeoVilla`) gives ground height beyond the plot, which is flat (y=0).

## 3. The main location: `buildVillaWorld()` and its contracts

It builds everything in the `world` group:
- the ground and lawn with a hole for the sunken pool
- the promenade, beach and sea
- the house, pool, jacuzzi, loungers, sofas and dining set
- the activity props (`buildSangria`, `buildBBQ`, `buildPaella`, `buildChiringuito(para)`, `buildSauna`,
  `buildSandcastle`)
- planting, lamps, collectibles, the car
- the bedroom scene (`kidsRoom`, its own group, shown in `scn==='bed'`)
- `buildGeoVilla()`, the real neighbourhood, terrain and mountains

It ends with a `mergeStatic(world, skip)` call. A re-themed location must provide the same contracts:

| Contract | What uses it |
|---|---|
| `world` group added to `scene` | `setScene` shows and hides it |
| `solids.push({x,z,rx,rz})`: keep-out boxes (half-sizes) | player collision, `buildNav()` pathfinding for the family, script walks |
| `spots.push({x,z,r,id,label})` (optional `shore:true` for strips) | `nearest()` → the DO IT prompt → `doAction` |
| `DOOR` | naps/bedtime walk to it; the family go "inside" at night |
| `CAM_BLOCKERS` `[[x0,y0,z0,x1,y1,z1],…]` (in `update()`) | follow camera pulls in instead of clipping into buildings |
| `collectibles[]` `{mesh,type,x,z}` | pickups (oranges and shells); remove or re-theme (baubles, snowballs) |
| `world.userData.*` hooks | scripts and `update()`: `lampPosts`, `lampLights`, `lampLens`, `entrLights`, `car` (with `userData.home`), `castle`, `bbqFx`, `paellaFx`, `paellaAt`, `saunaDoor`, `saunaChim`, `doorArrow`, `sea`, `birds`, `sailboats`, `lighthouse`, `pineCount` |
| `mergeStatic` skip set at the end | anything animated, toggled or hidden later must be listed (the car, castle, fx groups, doors, birds, boats, collectibles, lamps…) |
| `kidsRoom` + `kidsRoom.userData.bed`, `.exit`, `.mobile` | bedtime and wake-up scripts, `enterBedroom()`/`exitBedroom()` |

`update()` also has villa-specific pieces worth knowing when the location changes:
- the built-in animations `playerAnim.type` `swim`, `jacuzzi` and `lounge` (hard-coded pool and jacuzzi
  coordinates)
- sunburn warnings (`sunscreenApplied`)
- bedtime and wake-up warnings
- sea and wave animation, the lighthouse beam, birds, boats and the collectibles loop

Replace or delete these with the features they belong to.

## 4. Materials, textures and geometry helpers

- **Materials:** `mat(hex,opts)` makes a `MeshStandardMaterial` in sRGB hex, converted later by `linearizeScene`.
  `box(w,h,d,hex,opts)` and `cyl(rt,rb,h,hex,seg)` make shadowed meshes.
- **Cached materials:** `mc(key,fn)` caches a material. `stdM(hex,rough,extra)` is a cached material that is already linear. Use
  these for anything created after start-up (props in hands, runtime effects). `lin(hex)` converts sRGB to a
  linear `Color`.
- **Textures:**
  - `mkTex(draw,rx,ry)` draws a 256² tiling canvas texture.
  - `cvTex(w,h,draw,wrap)` draws a canvas of any size.
  - `rep(tex,x,y)` returns a clone with its own repeat.
  - `radialTex(w,h,blobs,rgb)` generates soft alpha textures in JS (safe on iPhone).
  - `flameTex(hot)` makes a flame sprite.
  - Ready-made textures: `slatT`, `boardT`, `shingleT`, `sandCT`, `waffleT`, `paellaT`, `menuT`, `signT`, `freezerT`, `brickT`, `azuT`,
    `balT`, `balTerrT`, `paveT`, `roofTileT`, `scaleT`, `deckT`, `tileT`, `sandT`, `stripeT(a,b)`, `rippleN`.
- **Geometry:**
  - `worldUV(mesh,tileW,tileH)` re-maps UVs in world units, so bricks and boards keep their real size on any box.
    Call it after sizing and scaling.
  - `rod(a,b,r,mat)` makes a cylinder between two points.
  - `LatheGeometry` is good for pans, jugs, bottles, domes and bowls.
  - `TubeGeometry` with a curve makes hoses and swan-neck arms.
  - `ExtrudeGeometry` makes gables and pediments.
- **Examples:** the activity-prop builders are the best examples of realistic, real-size props. Copy their
  style (small group at the prop's position, `B()`/`M()` local helpers, `worldUV` on textured boxes, an fx group
  for anything animated, `solids` and `spots` at the end).

## 5. Characters

- **`FAMILY`** (in the FAMILY CHARACTERS section) holds one entry per member in `FAMILY_ORDER`
  `['mum','dad','nana','papa','auntie','toddler']`. `ADULTS` excludes the toddler. Fields:
  - `name`, `emoji`, `tag` (picker blurb), `h` (height in units)
  - looks: `skin`, `hair`, `hairStyle` (`ponytail|short|curly|bald|…`), `beard`, `moustache`
  - clothes: `top:{type:'dress'|'tee'|'polo'|'tank',col,pat:'dots'|'floral'|'hibiscus',pat2,sleeves}`,
    `bottom:{type:'shorts',…}`, `shoes:{type:'sandal'|'slider'|'flat',col}`, `socks`
  - accessories: `hat:'sunhat'|'panama'`, `hatCol`, `glasses:'round'`, `glassCol`, `sunnies:'head'`
  - body: `build:{sh,waist,hip}`, `belly`, `stoop`, `cheeks`, `prop:'book'|'paper'`
  - behaviour: `loves:[activity ids]`, `sched` (a `SCHED` key), `speed`
  - Winter outfits need new `top` and `hat` types in `makePerson`. Add them there: long sleeves, coat,
    jumper, bobble hat, scarf.
- **Building people:** `makePerson(def)` builds a jointed person (`p.root`, joints `p.j.*`, `p.H`).
  `placePerson(p,x,z,yaw,y)` positions them. `animPerson(p,dt)` animates `p.pose`.
- **Poses:** `auto` (idle or walk by speed), `walk`, `sit`, `recline`, `lie`, `sleep`, `swim`, `soak`, `read`,
  `drink`, `dance`, `wave`, `cheer`, `bbq`, `stir`, `flip`, `pour`, `lick`, `rub`, `wade`, `dig`, `crouch`,
  `reach`, `sitground`, `stargaze`, `stretch`, `fan`, `tuck`, `talk`, `laugh`, `give`. Add new poses as a `case` in
  `animPerson` (e.g. `decorate`, `throw`, `sledge`, `unwrap`, `carve`). Copy a close pose and change its
  shoulder, elbow, hip and knee angles (`lsh/rsh/lel/rel/lhp/rhp/lkn/rkn`, spine `sp`, head `hd`, body offsets
  `by/bz`, root pitch `brx`). `legY(th,kn)` helps kneeling poses touch the ground.
- **Props in hands:** `PROP_BUILD` holds builders (`cone`, `paddle`, `spatula`, `jug`, `bottle`, `spade`).
  `setProp(p,name,left)` attaches and shows one, and `setProp(p,null)` hides it. Add new ones (bauble, snowball,
  present, mug, carving knife) as small groups hanging along −y from the hand.

## 6. Family AI

- **Haunts:** `HAUNTS` are named places with `{x,z,yaw,pose,seatH,ap}`, where `ap` is the approach point. A
  `wander` list means a strolling route. `inside` is special: the person goes into the house and hides.
- **Schedules:** `SCHED[type]` holds hour bands `[from,to,[haunt ids]]`, which can run past 24. Each NPC picks a
  free haunt in the current band (`hauntTaken`) and walks there with `navPath()`, a visibility graph over
  `solids`.
- **Per-frame behaviour:** `npcVilla(n,dt)` drives the family at the main location. `npcFollow(n,i,dt,list)` makes
  them trail the player in other scenes. `n.hold={t,pose}` pauses an NPC to face the player (used by chats).
- **Chat:** `FAMILY_TALK[id]` holds lines `{l:label,t:toast,v:vibes,time?,pp?,np?}`, where `pp`/`np` are the player
  and NPC poses. `talkTo(n)` plays a line with a babble voice, hearts and the `scriptTalk` animation.
- **Loves:** `LOVE_TXT` and `familyReact(act)`: when the player does an activity someone `loves`, they cheer
  and their mood rises. `cheer(a)` bumps everyone. Moods show as faces in the HUD.
- **The little one:** `kid` (the toddler entry) follows its `minder`, and `H` or 👶 hands them over (`doHand`).
  `kid.hold={x,z,yaw,pose,prop,y}` or `{hidden:true}` lets scripts direct the toddler. Use
  `kidHold(h)`/`kidOk()`. Bedtime state lives in `todsAsleep`, `tucked`, `bedtimeWarned` and `wakeupWarned`.

## 7. Interaction and progression

- **`nearest()`** returns the action for the DO IT prompt:
  - in `bed`, `plaza` and `terminal` it uses fixed checks
  - elsewhere it finds the closest `spots` entry, then applies time rules (stargazing only when stars are out,
    sunset 17–19h, sandcastle only in daytime with the little one, bed and nap special cases)
  - otherwise it offers a chat (`famNear`)
- **`doAction(s)`:** a `switch(s.id)` that sets `doneX` flags, adds vibes (`addV(n)`, which plays a chime), bumps
  moods (`cheer`), toasts, may advance `timeOfDay`, and starts the animation (`scriptX()`). `familyReact(s.id)`
  runs after.
- **Vibes and winning:** vibes run 0–100 (the HUD meter), and `won` flags a win. Keeping the whole family happy
  gives a daily bonus (`famBonusDay`).
- **While an animation runs** (`playerAnim` set), the prompt is hidden and actions are ignored.

## 8. Time of day, lighting and the itinerary

- **Clock:** `timeOfDay` holds float hours (it starts at 18.0 after arrival) and `day` counts days. Time advances in
  `update()` and activities add chunks of it.
- **Palette:** `PAL` holds keyframes of sky colours (`top`, `mid`, `hor`, `gnd`), fog, sun and hemisphere colours
  and intensities, and cloud colour and opacity. `applyTime()` blends them, sets the sun direction and shadows,
  shows the stars and moon at night, and fades the lamps in (`nb` night factor). `refreshEnv()` re-renders the
  PMREM environment map when the sky changes.
- **For winter:** lower the sun path, shorten the day (dark by 16:30), use cooler, greyer keyframes, and
  add snow.
- **Itinerary:** `updateItinerary()` builds the "Today's plan" list per period (morning, afternoon, evening,
  night) from `doneX` flags. Rewrite its items for the new activities.

## 9. Other scenes

- **`buildPlaza()`:** the Seville day trip (Plaza de España at true scale, the canal, bridges, tiled alcoves, the
  fountain and rowing boats), with `buildGeoSev()` for the real city around it.
  - Exit hooks: `plaza.userData.car` (drive back with `back`), `.photo` (the `snap` group photo),
    `.start`, `.bounds` and `.canal`.
  - Collisions are in `plazaSolids`.
  - The Plaza de España builders are good examples of modelling a landmark from photos.
- **`buildTerminal()`:** Jerez arrivals hall and kerb. `terminal.userData.car` leads to `getincar`.
- **The intro:** `buildCabin()` (a 3D cabin with the family), `airliner()` (an easyJet A320neo), `buildWingview()`
  (a flyover of the real coast from `GEO_F`) and `buildLanding()` (runway 02 at Jerez from `GEO_X`).
- **Car scripts:** `scriptCar(car,to)` walks to the door, hides the player and the little one, drives off, then
  calls `transition(to)`.

## 10. HUD, title card and countdown (`head.html`)

- **Title card** (`#title`): `.kick` line, `<h1>` title, `.sleeps` countdown badge, blurb, `#picker`
  (built from `FAMILY`), `#startBtn` and hints.
- **HUD:** `#topL` holds the vibes meter, faces and itinerary. `#topR` holds the clock, shell and orange counts
  and `#sndBtn`. The page also has `#prompt`, the `#act` DO IT button, `#pad`, `#hand`, `#toasts`, and intro
  captions (`#cabcap`, `#cabvig`, `#skip-intro`).
- **Countdown:** `updateSleeps()` (just before the boot line in `game.js`) computes whole local calendar days to
  the date and switches text for 1 sleep, the day itself and afterwards.
- **Body classes:** `ontitle` and `introplaying` hide HUD parts, and the CSS targets them.

## 11. Rendering helpers

- **`linearizeScene()`:** converts every material colour and emissive, vertex colour and instance colour from
  sRGB to linear, once, at start-up (materials from `mc`/`stdM` are skipped because they're already linear).
- **`mergeStatic(root, skipSet)`:** bakes static opaque meshes that share a material into one mesh per
  material, preserving world transforms. Transparent and shader materials, instanced meshes and anything under
  a skipped ancestor are left alone. It's used for the world, plaza, terminal, cabin, individual lamps and
  sandcastle parts. Build each part in its own `Group` and merge that group if it needs to animate as a unit.
- **`warmUp()`:** compiles shaders and uploads textures up front so the first scene switch doesn't stall.
- **Shadows and draw calls:** one directional sun shadow, 2048² at ±58 units, following the player. Draw calls
  matter on phones, so prefer merged meshes and instancing for repeats.

## 12. Debug API

Open `index.html?debug` to get `window.VillaDebug`:
- **Starting and moving:** `start()` skips the title and goes to the villa. `setScene(s)`, `setTime(h)`,
  `tp(x,z,yaw)` teleports the player, and `view(yaw,pitch)` sets the follow camera.
- **Actions and time:** `doAction({id})` triggers an action. `sim(secs)` advances the game fast without
  rendering (use this instead of waiting).
- **Camera:** `cam([px,py,pz,lx,ly,lz]|null)` sets a fixed camera.
- **Inspecting:** `state()` returns scene, time, vibes, the little one's minder and NPC states. `stats()`
  counts meshes per group. `info()` gives renderer stats. `fam` holds the family entries.
- **Other:** `enterBedroom()`, `exitBedroom()`, `startPhoto()`, `playIntro()`, `handT()`, `doHand()`.
- **Sound:** `SND` is the sound module, with `tap()`, `dbg.music`/`dbg.amb` multipliers and `state()`.
