# holidaysim

**Villa Escape 3D**: a family holiday in Chiclana, Andalucía, in a single `index.html` built on Three.js r128. It's playable at https://lukegardner43.github.io/holidaysim/.

## The family

Six of you on this holiday. You play one of the five adults, and everyone else lives their own holiday around you:

| Who | Likes |
| --- | --- |
| 👩 Mum | loungers, sangria, sunsets, the jacuzzi |
| 👨 Dad | the BBQ, cannonballs, paddling, paella |
| 👵 Grandma | paella, sunsets, the sauna, ice cream (reads on a lounger) |
| 👴 Grandad | the BBQ, paella, stargazing (reads the paper, wears socks with sandals) |
| 💃 Auntie | sangria, the jacuzzi, the pool; dances on the terrace late at night |
| 👶 The little one | follows whoever is minding them |

- Pick who you play on the title screen.
- Family members follow their own daily schedule. They go to the pool edge, the loungers, the BBQ, the sofas and the beach, and go to bed at their own times.
- Walk up to someone and press **DO IT** to chat. Doing an activity someone loves cheers them up.
- Press **H** (or the 👶 button) to hand the little one to a nearby family member for a few hours of free time.
- Keep the whole family happy (the faces in the top-left HUD) for a bonus.

To rename anyone or change how they look, edit the `FAMILY` table near the top of the characters section in `index.html`. You can change names, heights, skin, hair, outfits, hats, glasses and favourite activities.

## Controls

Move with WASD, the arrow keys or the on-screen pad. Drag to look around. Interact with Space or **DO IT**. Q and E spin the camera, R resets the view and T tilts it.

## Tech notes

- The characters are built procedurally from jointed parts. Walking, running, sitting, reclining, swimming, soaking, waving, dancing and sleeping are all animated in code.
- The sky is a shader dome with a smoothly blended time-of-day palette. It also feeds a PMREM environment map, so water, glass and skin pick up the sky light.
- Open `index.html?debug` to get the `window.VillaDebug` testing helpers.
