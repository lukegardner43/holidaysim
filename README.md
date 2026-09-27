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

### Activities

Every villa activity plays out on screen, like the pool swim:

The activity props are modelled at real size too: a brick barbecue with glowing coals, a paella pan on a gas ring with an orange butane bottle, a cedar sauna with benches and a stove inside, a beach chiringuito with a striped awning, chalk menu and freezer, a glass sangria jug, and a sandcastle with towers and battlements.

| Activity | What you see |
| --- | --- |
| Sangria | pour a glass from the jug, then sip |
| Sauna | open the door, step inside, steam pours from the chimney, come out flushed and fanning |
| Paella | stir the giant pan with a paddle while it steams |
| BBQ | flip prawns and sardines over real flames and smoke |
| Sea | wade into the shallows with splashes; the little one paddles too |
| Ice cream | the beach vendor hands over cones for you and the little one |
| Sandcastle | dig with a spade while the castle rises and the flag goes up |
| Sun cream | squeeze the bottle and rub it in |
| Sunset | sit down facing the Atlantic (close-up camera) |
| Stargazing | lie on the lawn pointing out stars (close-up camera) |
| Siesta / sleep | head indoors, fade out, then wake with a big stretch |
| Bedtime / wake-up | tuck the little one into the cot; in the morning they stand up cheering |
| Car | walk to the door, climb in and watch the car pull away (also at the airport and in Seville) |
| Chats | each person talks, laughs or waves depending on the conversation |
| Shells and oranges | crouch or reach to pick them up |

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

People, buildings and the plane share one scale (1.31 game units per metre): Plaza de España is built at its real size, with its 74 m towers, pavilions, arcades, glazed-tile roofs and real-size brickwork modelled from Wikimedia Commons photos, and the plane is an easyJet Airbus A320neo modelled on a Wikimedia Commons photo of G-UZLB using the published A320neo dimensions.

Close to the villa and the plaza, distances are true to scale. Further out they are compressed so far-off landmarks stay visible, but every direction is geographically true.

Map data © [OpenStreetMap](https://www.openstreetmap.org/copyright) contributors, available under the Open Database License.

## Controls

Move with WASD, the arrow keys or the on-screen pad. Drag to look around. Interact with Space or **DO IT**. Q and E spin the camera, R resets the view and T tilts it. Press M or the 🔊 button to mute.

## Sound

All music and sound is generated in the browser (Web Audio), with no audio files. By day there's a laid-back acoustic tune (soft guitar, a warm pad, marimba and whistle), and at night a gentle fingerpicked guitar. The ambience follows the scene: waves and gulls at the villa, crickets at night, the fountain and crowd in Seville, and engines on the plane. The activities have their own sounds: splashes, the BBQ sizzle, the sangria pour and clink, the sauna door and steam, the ice-cream bell, sandcastle digging, the car engine, the camera shutter and chatty family voices. Sound starts on your first tap, and it still plays with an iPhone's silent switch on.

## Tech notes

- The characters are built procedurally from jointed parts. Walking, running, sitting, reclining, swimming, soaking, waving, dancing, sleeping and every activity pose (stirring, pouring, digging, wading and more) are all animated in code. Activities run as small step scripts (walk, face, pose, props, effects, camera).
- The sky is a shader dome with a smoothly blended time-of-day palette. It also feeds a PMREM environment map, so water, glass and skin pick up the sky light.
- Open `index.html?debug` to get the `window.VillaDebug` testing helpers.
