# Real places: OpenStreetMap data and photo references

The family asked for geographically accurate surroundings ("use open maps") and landmarks modelled from
real photos. This is how Villa Escape did it, and how to repeat it for a new place.

## 1. Pick an origin and a scale

- **Origin:** choose one real point (lat, lon) as the game's anchor, such as the villa or a town square.
  For a family home, anchor on the village centre or a public landmark and keep the house generic (a public
  website shouldn't reveal where Nana and Papa live).
- **Orientation:** choose a bearing to become game −z (Villa Escape pointed the open sea there).
- **Scale:** 1.31 game units per metre near the origin, the same as the people.
- **Distance compression:** far away, compress with `g(d) = A·ln(1 + d/B)`, where A/B = 1.31 (Villa Escape
  used A=850, B=650; the Seville day trip used A=1400, B=1070). Bearings stay true and nearby things stay true
  to scale, while distant landmarks (towns, mountains, the coast) still fit on the horizon. `scale_at()` gives
  the local units-per-metre, so buildings and trees keep believable proportions where they're squeezed.
- **The code:** `fwd()`/`inv()`/`scale_at()` are in `scripts/osm/example_build_villa.py`. Copy them.

## 2. Fetch with Overpass

`scripts/osm/overpass_fetch.py query.q out.json` posts a query to `overpass-api.de`, caches the result,
and retries with back-off (the server regularly times out or resets under load, so keep each query
modest and split big areas into tiles). See `example_query_area.q` for a typical query: buildings within
2.2 km, landuse, natural features, leisure and golf within 3.5 km, and roads within 1.5 km, as `out geom tags`.

Useful features:
- **Buildings:** `building` footprints, using `height` or `building:levels` for height (default 6–13 m by type).
- **Streets:** `highway` lines.
- **Ground cover:** landuse and natural areas (forest, grass, farmland, residential, beach, water, wetland, heath),
  plus `leisure` (parks, golf) and `natural=coastline`.
- **Landmarks:** by name or wikidata (castles, churches, lighthouses, towers, bridges).
- **Towns:** `place=town|village` nodes, placed on their true bearings on the horizon.

Build scripts use `shapely` (`pip install shapely` if it's missing) to clean, union, simplify and clip polygons.

## 3. Bake into compact data in `game.js`

The engine reads constants embedded in `game.js`. Keep them compact: base64 binary for large lists,
rounded coordinates (0.1 unit), run-length-encoded grids.

- **`GEO_V` (main location, read by `buildGeoVilla()`):**
  - `A`, `B`: the compression constants.
  - `terrain`: a polar grid around the origin, with `na` angles and radii `r[]` growing outwards.
    - `c[]` holds one RLE string of land-class letters per ring (`a` water, `b` beach, `c`–`j` scrub, forest,
      grass, residential, golf and more, coloured in `COL`).
    - `h[]` holds one RLE list of heights per ring. Relief comes from OSM features plus hand-placed real hills
      (peak metres, radius metres) with mild vertical exaggeration so distant sierras read on the horizon.
  - `villas`: base64, 9 bytes per house: int16 x·10, int16 z·10, uint8 w·10, uint8 d·10, uint8 h·10,
    uint8 rot·255/2π, uint8 style. The houses themselves are generated along the real streets (storeys,
    L-wings, roofs, colours, plots, walls, pools and trees vary by seeded random) and drawn with
    `InstancedMesh` (see `pitfalls.md` about instance colours).
  - `bld`: real OSM buildings (hotels) as `[kind, height, x0,z0,x1,z1,…]`.
  - `roads`: flat x,z polylines.
  - `lm`: landmarks with true outlines (islet, castle, lighthouse, pier, watchtower).
  - `far`: distant towns `[name,x,z,scale]`.
- **`GEO_S` (the city day trip, read by `buildGeoSev()`):**
  - `b`: base64 building records: uint8 point count, uint8 height·10, uint8 kind, then int16 x·10 and z·10 per
    point. About 2,700 buildings.
  - `green`: park polygons.
  - `water`: river and canal ribbons.
  - `lm` and `fp`: landmark positions and real footprints.
  - The script is `example_build_city.py`.
- **`GEO_F`/`GEO_X`:** coastline and airport for the flyover and landing intro shots (`example_build_flyover.py`).

For a new game, write a new build script from these examples, output a JSON file, and paste it into
`game.js` as `const GEO_…=…;`. Then write or adapt the builder that turns it into meshes. Budget the size: all
of Villa Escape's map data together is about 0.5 MB, and the whole page about 1.2 MB.

Credit OpenStreetMap on the title card and in the README: "Map data © OpenStreetMap contributors, ODbL".

## 4. Photos for modelling landmarks

Plaza de España was remodelled from Wikimedia Commons photos. That fixed the tower silhouettes, the
roofs, the brick colour and the brick scale. The recipe:

1. List an article's images via the Wikipedia API (`en.wikipedia.org/w/api.php?action=query&titles=…&prop=images`),
   then get URLs with `prop=imageinfo&iiprop=url|size&iiurlwidth=1280`.
2. Thumbnail URLs point at `thumb.wikimedia.org`, which may be blocked. Swap the host for
   `upload.wikimedia.org` (same path).
3. Wikimedia rate-limits hard (HTTP 429). Send a descriptive `User-Agent`, sleep about 4 s between downloads,
   and wait a minute before retrying the API.
4. View the photos (the Read tool shows images) and write down proportions (stage heights as fractions
   of total height, widths, window rhythm), colours, and which trims are brick, stone or tile.
5. Model in metres inside a group scaled by 1.31. Render a comparable camera angle and put it side by side
   with the photo; the family liked seeing "real photo vs model".
6. Keep downloaded photos out of the repo (they're references, not assets) unless their licence and
   attribution are handled.

## 5. Sanity checks

- **Orientation and distance:** a top-down screenshot (`VillaDebug.cam([x,60,z, x,0,z-0.01])`) confirms the
  map is oriented and scaled as intended.
- **Horizon:** from ground level, landmarks sit at the right bearing (compare with a map) and aren't
  hidden by fog or far-plane clipping.
- **Instancing on iPhone:** neighbourhood houses and trees must show up on an iPhone (the instancing pitfall
  hid them once).
