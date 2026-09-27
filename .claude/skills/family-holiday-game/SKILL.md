---
name: family-holiday-game
description: >
  Make or re-theme a personalised 3D browser game starring the user's own family (Mum, Dad, Nana, Papa,
  Auntie and the little one), built on the proven "Villa Escape" engine in lukegardner43/holidaysim:
  jointed 3D family members who wander about on their own schedules, animated activities, a toddler to
  look after, day turning to night, real OpenStreetMap geography, chilled procedural music and sound,
  a "sleeps until…" countdown, all in one index.html that plays on an iPhone. Use this whenever the user
  wants a new family game or a new version of the holiday game: "make a Christmas game at Nana and Papa's
  house", "swap the holiday to Lanzarote", a camping, ski or cruise trip, a birthday or wedding weekend, a
  day out, or adding a new place, season, day trip or activities to one of their family games. Use it even
  when they just say "make a game where we go to…" and never mention skills, engines or Three.js.
---

# Family holiday game

This skill turns a family occasion into a game that keeps everything the family already loves about
Villa Escape (the characters, the way they potter about, animated activities, the little one's bedtime,
day and night, music, the countdown, phone controls) and changes the place, activities and theme.

Villa Escape is a family week near Chiclana with a day trip to Seville's Plaza de España. It is the
reference implementation. Every new game is a copy of its engine in its own folder, re-themed.

## Where everything lives

- **Repo:** `lukegardner43/holidaysim`, published with GitHub Pages at `https://lukegardner43.github.io/holidaysim/`.
  If it isn't in the session, attach it (add_repo) and clone it.
- **Villa Escape:** the root game. Its sources are `src/head.html` (page, CSS, HUD, title card), `src/game.js`
  (the whole game) and `src/tail.html`. They build into the root `index.html`.
- **`vendor/three.html`:** Three.js r128 inside a `<script>` tag, shared by every game.
- **New games** go in their own folder with their own copy of the sources: `christmas/src/…` builds to
  `christmas/index.html` and is served at `…/holidaysim/christmas/`. Copying rather than sharing code means
  a change to one game can never break another.
- **Build:** `bash .claude/skills/family-holiday-game/scripts/build.sh <game-dir>` syntax-checks
  `game.js`, then writes `<game-dir>/index.html`. That file is generated, so never hand-edit it.

## Workflow

### 1. Get the brief (one round of questions, with defaults)

Ask everything in a single message, and give a default for each item so the user can just reply "go".
The family is building memories, not specs, so suggest things rather than interrogate.

- **Occasion and title:** the date for the countdown ("N sleeps until …") and a game title.
- **Place:** the town or area, used for real map data. For a family home (e.g. Nana and Papa's), use the
  village or town and a *generic* house. The game is a public website, so never model or publish the real
  address, street layout around the house, or the house's appearance.
- **Who's coming:** default to the existing cast in `FAMILY` (see the engine map). Ask only about changes,
  plus seasonal outfits (coats, jumpers, Christmas jumpers, woolly hats).
- **Activities:** propose 8–12 themed ones for them to tick or change. Each will be fully animated.
- **Day trip:** an optional second scene (Villa Escape uses Seville), and how they travel (the plane intro,
  a car ride, or straight in).
- **Season, weather and music:** default the music to chilled and family-friendly.

*Example: Christmas at Nana and Papa's.* Suggested activities: decorate the tree, hang stockings, build a
snowman, snowball fight, sledging on the hill, mince pies and mulled wine, Christmas dinner (carving,
crackers), open presents on Christmas morning, carols round the piano, fireside stories with Papa, feed the
birds, spot Santa's sleigh at night, and leave cookies for Santa before the little one's bedtime. Day trip:
the Christmas market or a panto. Travel: a car ride through wintry lanes. Countdown: sleeps until Christmas.

### 2. Fork the engine

```bash
cd holidaysim && mkdir -p christmas && cp -r src christmas/src
bash .claude/skills/family-holiday-game/scripts/build.sh christmas   # a working copy of Villa Escape, to be re-themed
```

Work on the fork only. Leave Villa Escape alone unless the user asks for changes to it.

### 3. Re-theme, in an order that keeps the game playable

Read `references/engine-map.md` before touching code. It says where every system is and what each part
expects from the others. Then work through these steps in order:

1. **Title and countdown.** Edit the title card text in `head.html`. In `game.js`, update the date and
   label in `updateSleeps()` (and hide it after the date). Update the `<title>` too.
2. **Season and time.** Adjust the `PAL` sky keyframes, sun path, fog and the starting `timeOfDay`. Add
   weather if it fits (snow or rain particles, frosty ground, breath puffs using `puff()`).
3. **The main location.** Replace what's inside `buildVillaWorld()` with the new place: house, garden,
   interior, street. Keep the contracts (the `world` group, `solids`, `spots`, `DOOR`, `CAM_BLOCKERS`, the
   `world.userData` hooks and the `mergeStatic` skip set) or the family AI, collisions and camera break.
   Keep the bedroom scene (`kidsRoom`) for the little one's bedtime. Retheme it rather than delete it.
4. **Activities.** Each one needs:
   - a spot with its prompt label
   - a time rule in `nearest()` if needed
   - a `doAction` case (vibes, toast, which family members love it)
   - an animated `runScript` with props, effects, sound and a close-up camera
   - a line in the itinerary

   `references/activities.md` has the step format and worked examples. Remove activities that no longer
   make sense (e.g. the pool swim in winter) along with their spots, itinerary lines and `update()` cases.
5. **Family life.** Update where each person hangs out at each hour (`HAUNTS`, `SCHED`), their chat lines
   (`FAMILY_TALK`), what they love (`loves`, `LOVE_TXT`) and their outfits (`FAMILY`).
6. **Day trip and travel.** Swap the Seville scene (`buildPlaza`) for the new day trip, or drop it. Rework
   `playIntro()`: the cabin, flyover and landing shots suit a flight, a car-ride intro suits a drive, or go
   straight to the location.
7. **Music and ambience.** Write a new daytime song as chord and melody data, and set the scene's
   ambience. See `references/sound.md`.
8. **Real places.** Fetch OpenStreetMap data around the town and bake it in, and model landmarks from real
   photos. See `references/geography.md`.
9. **README.** Add a section for the new game with its URL and activities.

Rebuild after every step and check it loads (`scripts/test/load_check.js`), so a break is caught while it
is still small.

### 4. Test it like a family member on a phone

The family plays on an iPhone in portrait. Checking only a desktop view has let bugs through before. The
test scripts drive the game through its `?debug` API (`VillaDebug`), so there's no need to click around.

```bash
T=.claude/skills/family-holiday-game/scripts/test; mkdir -p shots   # keep screenshots out of the repo (use a scratch dir if you have one)
node $T/load_check.js christmas/index.html                          # loads with no errors
node $T/title_shot.js christmas/index.html shots/title              # title card: phone + desktop
node $T/activities.js christmas/index.html shots/act '[{"name":"tree","id":"tree","time":16,"tp":[2,8],"sim":3}]'
node $T/activities.js christmas/index.html shots/ph  '[...]' --phone # close-ups framed on a portrait phone
node $T/sound_check.js christmas/index.html                         # music/ambience audible, no clipping
```

Then look at every screenshot yourself before showing the user. Check for:
- **Scale:** people at 1.31 units per metre; a 1.75 m adult is about 2.3 units tall.
- **Collisions:** nobody standing in water, walls or furniture during an activity.
- **Props:** they look real, not blocky.
- **Camera:** not inside a wall or behind a palm.
- **Colour:** no stray white bands or grey blobs.
- **Timing:** every activity runs to the end with no console errors.

The headless browser renders at about 1–2 frames a second, so advance time with `sim` rather than
waiting, and keep test batches small; long runs try the user's patience. `references/pitfalls.md` lists
the bugs that only show on real phones. Read it before shipping.

### 5. Publish

Commit with a clear message and push to the working branch. This family's standing preference is "put
it on main when done": check that `origin/main` is an ancestor, then fast-forward
`git push origin <branch>:main`. Share the game's URL with a few screenshots (a labelled contact sheet of
the activities works well).

## What this family cares about

These were learned while building Villa Escape; honour them by default.

- **Realism:** real places from OpenStreetMap, landmarks modelled from real photos, one true scale for
  people and buildings, props at real size with real detail. Brick and stone read as brick and stone, not
  pale bands.
- **Animated activities:** every activity plays out on screen like the pool swim. The player walks there,
  holds a prop, effects and sound play, the camera cuts to a close-up, and the little one joins in where it
  makes sense.
- **The people:** Nana and Papa (never Grandma and Grandad). Dad is clean-shaven. The little one is a
  toddler who follows whoever is minding them.
- **Sound:** chilled, cheerful, family music, never epic, and gentle sound effects.
- **Phones first:** it has to work and look right on an iPhone in portrait.
- **Countdown:** a sleeps countdown to the trip on the title screen.
- **Finish:** push to main when it's done, then show screenshots.

## Pitfalls that cost real time (details in `references/pitfalls.md`)

- An `InstancedMesh` whose colour buffer is smaller than its instance count vanishes on iPhone Safari.
  Allocate `instanceColor` at full capacity before growing `count`.
- Safari adds anti-fingerprinting noise to canvas pixels, which speckles see-through canvas textures
  (clouds, shadows, steam). Generate soft alpha textures in JS (`radialTex`).
- Colours are authored as sRGB hex and converted once by `linearizeScene()`. Materials created after
  start-up must use `lin()`/`stdM()`, or they come out washed out.
- `mergeStatic` bakes static meshes together. Anything animated, toggled or hidden later must go in its
  skip set, or it freezes in place.
- Audio needs a user gesture, and iPhones mute Web Audio on the silent switch unless the page plays as
  media. The `SND` module already handles both, so reuse it.
- Cut-away cameras framed for landscape crop people out in portrait. The script camera already pulls back
  and widens on phones, so still check with `--phone`.

## Reference files

- `references/engine-map.md`: every system in `game.js`, where it is and its contracts. Read first.
- `references/activities.md`: how to write animated activities, with examples.
- `references/sound.md`: songs as data, ambience, effects and hooking them up.
- `references/geography.md`: OpenStreetMap and photo pipeline, distance compression, data formats.
- `references/pitfalls.md`: phone and browser gotchas, and how the fixes work.
- `scripts/build.sh`: build a game folder.
- `scripts/test/`: headless load, activity, title and sound checks.
- `scripts/osm/`: Overpass fetch helper plus the scripts that built Villa Escape's data, as examples.
