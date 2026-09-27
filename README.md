# holidaysim

**Villa Escape 3D**: a family holiday in Chiclana, Andalucía, in a single `index.html` built on Three.js r128. It's playable at https://lukegardner43.github.io/holidaysim/.

## The family

Six of you on this holiday. You play one of the five adults, and everyone else lives their own holiday around you:

| Who | Likes |
| --- | --- |
| 👩 Mum | loungers, sangria, sunsets, the jacuzzi |
| 👨 Dad | the BBQ, cannonballs, paddling, paella |
| 👵 Nana | paella, sunsets, the sauna, ice cream (reads on a lounger) |
| 👴 Papa | the BBQ, paella, stargazing (reads the paper, wears socks with sandals) |
| 💃 Auntie | sangria, the jacuzzi, the pool; dances on the terrace late at night |
| 👶 The little one | follows whoever is minding them |

- Pick who you play on the title screen.
- Family members follow their own daily schedule. They go to the pool edge, the loungers, the BBQ, the sofas and the beach, and go to bed at their own times.
- Walk up to someone and press **DO IT** to chat. Doing an activity someone loves cheers them up.
- Press **H** (or the 👶 button) to hand the little one to a nearby family member for a few hours of free time.
- Keep the whole family happy (the faces in the top-left HUD) for a bonus.

To rename anyone or change how they look, edit the `FAMILY` table near the top of the characters section in `index.html`. You can change names, heights, skin, hair, outfits, hats, glasses and favourite activities.

## Real places

The areas around the villa, the Seville day trip, the flyover and the Jerez landing are built from OpenStreetMap data:

- **La Barrosa, Chiclana:**
  - the real coastline
  - pine forests, golf courses and marshes
  - hotel footprints and streets (the villas that line those streets are generated)
  - the Sancti Petri islet with its castle, lighthouse and pier
  - the Torre del Puerco watchtower
  - Medina Sidonia, Vejer, Conil, Chiclana, San Fernando and Cádiz, on their true compass bearings
- **Seville:**
  - about 2,700 building footprints around Plaza de España
  - María Luisa park and the Guadalquivir
  - the Giralda, the cathedral, Torre del Oro, Torre Sevilla, Las Setas and the Alcázar
- **Jerez airport:** runway 02/20 and the terminal, aprons and taxiways.
- **Mountains:** Medina Sidonia's hill, the Retín and Plata sierras, Los Alcornocales and the Sierra de Grazalema, on their true bearings with exaggerated height so they read on the horizon.

People, buildings and the plane share one scale (1.31 game units per metre): Plaza de España is built at its real size, and the plane is an easyJet Airbus A320neo modelled on a Wikimedia Commons photo of G-UZLB using the published A320neo dimensions.

Close to the villa and the plaza, distances are true to scale. Further out they are compressed so far-off landmarks stay visible, but every direction is geographically true.

Map data © [OpenStreetMap](https://www.openstreetmap.org/copyright) contributors, available under the Open Database License.

## Controls

Move with WASD, the arrow keys or the on-screen pad. Drag to look around. Interact with Space or **DO IT**. Q and E spin the camera, R resets the view and T tilts it.

## Tech notes

- The characters are built procedurally from jointed parts. Walking, running, sitting, reclining, swimming, soaking, waving, dancing and sleeping are all animated in code.
- The sky is a shader dome with a smoothly blended time-of-day palette. It also feeds a PMREM environment map, so water, glass and skin pick up the sky light.
- Open `index.html?debug` to get the `window.VillaDebug` testing helpers.
