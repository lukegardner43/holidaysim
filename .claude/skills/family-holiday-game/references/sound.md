# Sound: music, ambience and effects (the `SND` module)

All audio is synthesised with Web Audio at runtime, with no audio files: the game stays a single
self-contained file, and free sound-asset sites are often blocked from build environments. The `SND` IIFE
is near the end of `game.js`. Its public API:

`SND.unlock()` · `SND.sfx(name,{dur,delay,size})` · `SND.talk(familyId,delay)` · `SND.update(dt,{scn,tod,px,pz,anim})` ·
`SND.toggle()` · `SND.isMuted()` · `SND.throttle(key,secs)` · debug: `SND.tap()`, `SND.dbg`, `SND.state()`

## The family's taste

- Chilled and family-friendly. The first version (a 104 BPM rumba with a kick drum, claps and castanets) was
  "a bit too epic". The current daytime tune is the reference: 88 BPM, soft nylon-guitar offbeats on the top
  strings, maj7 chords over a warm filtered pad, a marimba melody alternating with a soft whistle at its
  natural pitch, one section with no melody, and only a shaker plus a brushed tap for percussion.
- The music sits under the ambience and effects. At the main location the music averages about 0.015–0.025
  RMS, the ambience about 8 dB below it, and peaks stay well under 0.8. Check with
  `scripts/test/sound_check.js`.

## How a song is written (data, not code)

- **Voicings:** `CH` maps chord names to guitar voicings as MIDI note arrays (low to high, 5–6 notes), e.g.
  `Dmaj7:[50,57,61,66,69]`.
- **Bass roots:** `ROOT` maps each chord to its bass note.
- **Sections:** `SEC_A`/`SEC_B` are 8-bar chord lists. `MEL_A`/`MEL_B` hold the melody for each bar as
  `[beatOffset, midi, beats]`. Keep melodies around D4–A5 and use mostly chord tones.
- **Form:** `DAY` is a 32-bar form built from the sections, with per-section options (`lead:'mar'|'wh'|null`).
- **Players:**
  - `dayStep(t,spb)` plays one eighth-note step: the pad on the downbeat, bass on 1 and 3, soft strums on the
    offbeats, the shaker, and the melody at the start of each bar.
  - `nightStep(t,spb)` fingerpicks the `NIGHT` chord list, with rare bell twinkles.
- **Scheduler:** `sched()` looks 0.3 s ahead on a 25 ms timer, so slow frames don't stutter the music. Tempo is set by the
  `mood==='day'?88:72` line. The mood switches at bar boundaries, from
  `want = night-time or bedroom ? 'night' : 'day'` in `update()`.
- **Instruments:**
  - `pluck(t,midi,vel,{dur,damp,bright,pan})`: Karplus–Strong string, cached per note; use for guitar and bass
  - `marimba(t,midi,vel)`
  - `whistle(t,midi,durSecs,vel)`
  - `bell(t,freq,vel,dur)`
  - `pad(t,chord,lenSecs)`
  - `strum(t,chord,'D'|'U',vel)`
  - `DR.shaker`
  - `noise(t,{type,f,q,dur,vel,brown,pan,dest})` and `tone(t,{f,f2,glide,type,dur,vel,filter,ff,fq,pan,dest})`
    for anything else
- **Volume:** `SCN_MUSIC` sets the music level per scene.

### A new theme's song

Keep the engine and swap the data:
1. Write new `SEC_A`/`SEC_B`/`MEL_A`/`MEL_B` (and `NIGHT`).
2. Adjust the tempo.
3. Pick lead instruments.

For Christmas:
- Add sleigh bells: a `noise` burst through a bandpass at about 6–8 kHz, retriggered on eighths, or several
  quick high `tone`s.
- Use `bell()` for a glockenspiel lead, and keep the pad.
- Traditional carols (Jingle Bells, Deck the Halls, We Wish You a Merry Christmas, Silent Night) are public
  domain and fine to arrange. Modern songs are not.

Keep it gentle: no kick drum, sparse percussion, soft velocities.

## Ambience

`buildAmbience()` creates looping noise "beds" (`bed(buffer,rate,filters,pan)`):
- the sea (brown noise, lowpass)
- surf
- cicadas (bandpass noise with 31 Hz tremolo)
- the fountain
- a crowd
- the plane's engine and hum
- wind

`update()` sets each bed's level per scene with `setA(name,level,timeConstant)`. It also fires occasional
wildlife: gulls in the day, crickets at night, airport announcement chimes, swim splashes and jacuzzi
bubbles.

For a new place, add beds or reuse these, and gate them by scene, time and distance (the sea gets louder as
the player walks towards the beach). Winter ideas:
- wind: noise through a slow-moving bandpass
- the crackle of a fire: random short `noise` clicks plus low brown noise
- church bells: `bell()` at around 440–880 Hz
- robins: short high `tone` glides like the `birds` effect

## Effects

The existing effects are keys of `FX` inside `SND`: `click`, `chime`, `sparkle`, `pop`, `splash` (`size` 0/1/2),
`bubbles`, `sizzle`, `simmer`, `pour`, `clink`, `creak`, `thud`, `hiss`, `bell`, `dig`, `fanfare`, `engine`, `door`, `shutter`,
`whoosh`, `lullaby`, `birds`, `giggle`, `gull`, `cricket`, `pa`. To add one, write a function `(t,o)=>{…}` built from
`tone`/`noise`/`bell` and add it to `FX`.

These calls already happen automatically:
- `addV(n>0)` plays a chime
- `spawnHeart` plays a pop
- water `splash()` calls play a splash
- pickups sparkle
- `talkTo` babbles in each person's voice pitch (`TALK` map)
- `startPhoto` plays the shutter
- `transition()` plays a whoosh
- button clicks click

Put activity sounds in script steps (`do:()=>SND.sfx('sizzle',{dur:4.2})`), and throttle rapid repeats with
`SND.throttle(key,secs)`.

## Must-keep behaviour

- **Starting audio:** browsers only start audio after a gesture, so `SND.unlock()` runs on the first
  pointerdown, touchend, keydown or click (capture-phase listeners wired next to the countdown code).
- **iPhone silent switch:** iPhones mute Web Audio when the switch is on silent. `iosUnlock()` sets
  `navigator.audioSession.type='playback'` and loops a silent `<audio>` element so the page counts as media.
  Keep it.
- **Muting:** the 🔊 buttons (`#sndBtn` in the HUD, `#sndBtnT` on the title) and the M key toggle mute, and
  the choice is saved in localStorage (inside try/catch).
- **Background tabs:** audio is suspended when the tab is hidden.

## Testing sound headless

Chromium needs `--autoplay-policy=no-user-gesture-required`, and the page still wants a click for
`unlock()`. Click somewhere harmless: in a tiny test window, a click at the top right lands on the mute
button and silences everything. `sound_check.js` clicks bottom-left.

The headless browser renders slowly (1–2 fps), which starves the main-thread scheduler, so music in
headless recordings can sound sparse. Judge levels with the analyser (`SND.tap()`) rather than
recordings. The `ScriptProcessor` recording is unreliable there.
