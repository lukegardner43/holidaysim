# Pitfalls (each one cost real time on Villa Escape)

## iPhone and Safari

**Instanced meshes vanish on iPhone.** Three r128's `setColorAt` sizes the colour buffer from `.count`
at its *first* call. A builder that starts with `count=0` and increments before colouring gets a
one-instance buffer. Desktop Chrome tolerates the short buffer; iPhone Safari refuses the draw, and
whole neighbourhoods of houses disappeared.
- Fix (in the villa `mk()` helper): allocate
  `im.instanceColor=new T.InstancedBufferAttribute(new Float32Array(cap*3).fill(1),3)` up front.
- Safe pattern: set `count` to the final number before any `setColorAt`, or pre-allocate.

**Speckled clouds, shadows and steam on iPhone.** Safari's anti-fingerprinting adds noise to canvas pixels
read back or uploaded. On nearly transparent pixels that noise becomes coloured confetti.
- Generate soft alpha textures in JS with `radialTex()` (DataTexture) instead of canvas gradients.
- Opaque canvas textures (bricks, boards, text) are fine.

**No sound on an iPhone in silent mode.** Web Audio follows the ringer switch.
- `iosUnlock()` sets `navigator.audioSession.type='playback'` and plays a looping silent `<audio>` inside the
  first gesture. Keep it.
- Audio must start from a user gesture (`SND.unlock()` on pointerdown, touchend, keydown or click).

**Portrait framing.** The family plays in portrait (about 390×844 CSS px).
- Close-up cameras composed for landscape crop people out. The script camera pulls back (up to ×1.6) and
  widens the FOV on phones, but still check every close-up with `activities.js … --phone`.
- HUD elements must not overlap on narrow screens.

## Rendering

**Washed-out colours.** Colours are authored as sRGB hex and converted once by `linearizeScene()` at the end
of `init()`.
- Materials created later (props in hands, runtime effects) must use `stdM()`/`mc()` with `lin()`, or they
  come out pale.
- Never linearise twice.

**Frozen animations after merging.** `mergeStatic()` bakes meshes. Anything that later moves, animates,
toggles visibility or changes material must be in the skip set (or live in a group that is), or it
silently stops updating: doors, fx groups, cars, collectibles, lamps.

**Helper signature drift.** The villa `mk()` helper changed from `(geo,mat,list)` to `(geo,mat,count)`, and
a later caller still passed a list, so the pine forests silently had zero trees. When changing a shared
helper, grep every caller.

**Giant bricks.** A texture mapped once per box face scales with the box: a 20 m wall showed bricks
metres wide.
- Use `worldUV(mesh,tileW,tileH)` after building, so texture repeats are in world units.
- One tile of `brickT` is 4 bricks × 16 courses. For Sevillian brick about 30×6 cm, use 1.6×1.3 units.

**Too much white.** Pale cream trims read as stark white bands under the sun and tone mapping. Real
brick buildings mostly have terracotta or brick mouldings and warm sandstone. Check against photos.

**Flicker, jumping and z-fighting in big scenes.** Set camera `near`/`far` per scene (the flyover uses
`near=2`), avoid coplanar layers (lift overlays a few cm and use `polygonOffset`), and don't animate the camera
from one wall clock while simulating from another.

**Three r128 differences.**
- There's no `CapsuleGeometry`. It exists as a throwing stub, so even a feature check crashes. Use a
  scaled sphere.
- `BufferGeometryUtils` isn't bundled. Use `mergeStatic` for merging.
- `LatheGeometry` faces can look inside out from some angles. Use `side:T.DoubleSide` for thin shells
  (pans, glasses, bowls).

**Top-level constants and hoisting.** Texture constants evaluated at load can only use helpers defined
*before* them, or hoisted `function` declarations. `init()` runs at the very end, so builders can use any
top-level `const`.

**Point lights.** Every point light adds cost to every lit material's shader. Villa Escape has 7
promenade lamps plus entrance lights. Prefer emissive meshes and additive glow sprites for extra lamps.

## Gameplay

- **People in water or walls.** An activity's `go` target must be on open ground. The first sangria script
  stood the player in the pool. Check targets against the pool, water and furniture bounds.
- **Script timers.** `setTimeout` inside scripts (e.g. hiding the BBQ food after 25 s) keeps running across
  scene changes. Make sure the effect is harmless when it fires later.
- **The little one's state.** Handle the toddler being with someone else or asleep (`kidOk()`), and restore
  them in `endScript()`.
- **Time rules.** Activities hidden by time rules (stars, sunset, bedtime) need matching itinerary text
  so the player knows when to come back.

## Testing in the cloud

- **Slow headless rendering.** SwiftShader renders at about 1–2 fps. Advance game time with `VillaDebug.sim()`
  instead of waiting, give screenshots a 90 s timeout, and set `page.setDefaultTimeout(120000)`.
- **Short test batches.** Big back-to-back runs take many minutes, and the user once stopped one. Test the
  activities you changed, then do one full pass before publishing.
- **Harmless clicks.** In a tiny viewport, a "harmless" click can hit the 🔊 button and mute everything.
  Click bottom-left.
- **Main-thread audio.** Headless audio recordings are unreliable because the music scheduler and
  `ScriptProcessor` run on the starved main thread. Measure levels with the analyser tap instead.
- **Everything else is real.** GPU-specific bugs (the iPhone items above) won't show headless, so reason
  about them from the code and keep the known fixes in place.

## Process

- **Sources.** Keep the sources in the repo (`src/` per game) and build `index.html` with
  `scripts/build.sh`. Never edit a generated `index.html`.
- **Commit and publish.** Commit per coherent change with a descriptive message, push the branch, then
  fast-forward `main`, because the family wants finished work live.
