# Build the villa-world geography from OpenStreetMap extracts.
# Real positions keep their true compass bearing from the villa; distance is
# compressed with g(d) so far landmarks stay on screen (angular size preserved).
import json, math, random
from shapely.geometry import Polygon, LineString, Point, MultiPolygon, box
from shapely.ops import unary_union, linemerge
from shapely.prepared import prep

R = 6371000
LAT0, LON0 = 36.37222, -6.18583        # villa (Urb. Barrosamar, ~54 m behind La Barrosa beach)
COS0 = math.cos(math.radians(LAT0))
SEA = 223                               # bearing of open sea → game -z
VZ = 22                                 # villa z in game units
A, B = 850.0, 650.0                     # slope A/B = 1.31 units per metre near the villa (the family's scale)

def en(lat, lon): return ((lon - LON0) * math.pi / 180 * R * COS0, (lat - LAT0) * math.pi / 180 * R)
def g(d): return A * math.log(1 + d / B)
def ginv(u): return B * (math.exp(u / A) - 1)
def fwd(E, N):
    d = math.hypot(E, N)
    if d < 1e-6: return (0.0, VZ)
    th = math.atan2(E, N) - math.radians(SEA); u = g(d)
    return (u * math.sin(th), VZ - u * math.cos(th))
def inv(x, z):
    dz = VZ - z; u = math.hypot(x, dz)
    if u < 1e-6: return (0.0, 0.0)
    th = math.atan2(x, dz) + math.radians(SEA); d = ginv(u)
    return (d * math.sin(th), d * math.cos(th))
def scale_at(E, N):
    d = math.hypot(E, N); return g(d) / d if d > 1 else A / B

def load(f): return json.load(open(f))['elements']
def geom_en(e): return [en(p['lat'], p['lon']) for p in e['geometry']]
def poly_of(e):
    pts = geom_en(e)
    if len(pts) < 4: return None
    p = Polygon(pts)
    if not p.is_valid: p = p.buffer(0)
    return p if not p.is_empty else None

# ---------- coastline → land polygon (real metres) ----------
allw = {}
for f in ['c1.json', 'c4.json', 'c2a.json']:
    for e in load(f): allw[e['id']] = e
def chain(ids):
    ls = linemerge([LineString(geom_en(allw[i])) for i in ids])
    assert ls.geom_type == 'LineString', ids
    return list(ls.coords)
# west (Cádiz isthmus → Camposoto → channel mouth) and east (Sancti Petri → La Barrosa → Conil → Barbate)
westc = chain([516122838, 85765553, 831787049])
eastc = chain([85765478, 205202966, 111125551, 85765487, 975937773, 975937764, 975937772, 215117121, 239298171, 239298168, 238422126, 85765514, 85765479, 239298190, 238422133, 239298192, 668050184, 239298193, 251209153, 251209152, 239298186, 239298195, 239298177, 239298174, 239298197, 299906732, 238422136, 299906734, 299906741, 299906742])
main = LineString(eastc)
closure = [en(36.13, -5.84), en(36.06, -5.70), en(36.0, -5.1), en(37.25, -5.0), en(37.25, -6.26), en(36.60, -6.20), en(36.545, -6.300)]
ring = westc + eastc + closure
land = Polygon(ring)
if not land.is_valid: land = land.buffer(0)
print('land valid', land.is_valid, 'area km2', round(land.area / 1e6))
# islands (closed coastline rings) inside the sea
islands = []
for f in ['c1.json', 'c4.json', 'c2a.json']:
    for e in load(f):
        pts = geom_en(e)
        if pts[0] == pts[-1] and len(pts) > 4:
            p = Polygon(pts).buffer(0)
            if not land.contains(p.representative_point()): islands.append(p)
land = unary_union([land] + islands)
print('land area km2', round(land.area / 1e6, 1), 'islands', len(islands))

# ---------- landcover ----------
bar = load('barrosa.json') + load('castle.json')
cls_polys = {'forest': [], 'scrub': [], 'golf': [], 'beach': [], 'wetland': [], 'res': [], 'grass': []}
for e in bar:
    t = e.get('tags', {})
    if 'geometry' not in e or e['type'] != 'way': continue
    k = None
    if t.get('landuse') == 'forest' or t.get('natural') == 'wood': k = 'forest'
    elif t.get('natural') in ('scrub', 'heath'): k = 'scrub'
    elif t.get('leisure') == 'golf_course' or t.get('golf') in ('fairway', 'green', 'tee'): k = 'golf'
    elif t.get('natural') in ('beach', 'sand'): k = 'beach'
    elif t.get('natural') == 'wetland': k = 'wetland'
    elif t.get('landuse') in ('residential', 'commercial'): k = 'res'
    elif t.get('landuse') == 'grass' or t.get('leisure') in ('park', 'pitch'): k = 'grass'
    if not k: continue
    p = poly_of(e)
    if p is not None: cls_polys[k].append(p)
CLS = {k: prep(unary_union(v)) if v else None for k, v in cls_polys.items()}
UNION = {k: unary_union(v) if v else None for k, v in cls_polys.items()}
for k, v in cls_polys.items(): print(k, len(v), 'area km2', round(sum(p.area for p in v) / 1e6, 2))
landp = prep(land)

# cliffs: Loma del Puerco around Torre del Puerco (coast within ~1.6 km of the tower)
TORRE = en(36.3312, -6.1613)
def cliff_h(E, N):
    d = math.hypot(E - TORRE[0], N - TORRE[1])
    return max(0.0, 1 - d / 1700) ** 0.7 * 34.0   # metres above the beach

# ---------- polar terrain grid around the villa (game space) ----------
NA = 420; rings = []
r = 36.0
while r < 7200: rings.append(r); r *= 1.036
CODES = {'sea': 'a', 'beach': 'b', 'scrub': 'c', 'forest': 'd', 'golf': 'e', 'res': 'f', 'wetland': 'g', 'grass': 'h', 'cliff': 'i', 'land': 'j'}
rows = []; hts = []
# real relief (peak metres, radius metres): Medina Sidonia's hill, Vejer, Chiclana's Santa Ana, the Retín and
# Plata sierras by Barbate/Zahara, the Los Alcornocales ridge (Aljibe 1091 m) and the Sierra de Grazalema (1654 m)
hills = [(en(36.45767, -5.92727), 300, 3800), (en(36.25194, -5.96705), 190, 3500), (en(36.415, -6.140), 70, 1300),
         (en(36.42, -5.99), 90, 7000), (en(36.33, -5.95), 120, 6000), (en(36.38, -6.07), 45, 3000),
         (en(36.18, -5.86), 330, 5500), (en(36.10, -5.78), 460, 6000), (en(36.14, -5.70), 380, 6500),
         (en(36.30, -5.63), 760, 9000), (en(36.41, -5.60), 900, 9500), (en(36.50, -5.62), 1090, 9500), (en(36.59, -5.66), 850, 9000), (en(36.22, -5.60), 620, 8000),
         (en(36.77, -5.41), 1650, 12000), (en(36.70, -5.46), 1400, 10000), (en(36.86, -5.35), 1250, 11000), (en(36.64, -5.52), 1000, 9000)]
def ridge(E, N):   # cheap ridged noise so sierras read as mountains, not domes
    return 0.72 + 0.16 * math.sin(E * 0.00031 + N * 0.00017) + 0.12 * abs(math.sin(E * 0.00083 - N * 0.00061 + 1.3)) + 0.08 * math.sin(N * 0.0013 + 0.4)
for ri, rr in enumerate(rings):
    row = []; hrow = []
    for ai in range(NA):
        a = ai / NA * 2 * math.pi
        x, z = rr * math.sin(a), VZ - rr * math.cos(a)
        E, N = inv(x, z); pt = Point(E, N)
        if not landp.contains(pt):
            row.append('a'); hrow.append(0); continue
        c = 'land'
        for k in ('beach', 'wetland', 'golf', 'forest', 'res', 'grass', 'scrub'):
            if CLS[k] is not None and CLS[k].contains(pt): c = k; break
        h = cliff_h(E, N); hh_max = 0.0
        # dune/beach band just inland of the coast stays low
        dcoast = main.distance(pt)
        if c == 'land' and dcoast < 90: c = 'beach'
        if h > 3 and dcoast < 140 and c in ('beach', 'land', 'scrub'): c = 'cliff' if dcoast < 60 else ('scrub' if c != 'beach' else c)
        for (hc, hh, hr) in hills:
            dd = math.hypot(E - hc[0], N - hc[1])
            if dd < hr: hh_max = max(hh_max, hh * (0.5 + 0.5 * math.cos(math.pi * dd / hr)) ** 0.8 * ridge(E, N))
        if dcoast < 400: h *= min(1, dcoast / 60 + 0.25) if c != 'cliff' else 1
        d_ = math.hypot(E, N); exag = 3.0 + min(1.5, d_ / 40000)          # vertical exaggeration keeps distant sierras readable
        row.append(CODES[c]); hrow.append(round((h * 1.6 + hh_max * exag) * scale_at(E, N) * 2))
    rows.append(''.join(row)); hts.append(hrow)
# run-length encode each ring: "a120d3b4..."
def rle(s):
    out = []; i = 0
    while i < len(s):
        j = i
        while j < len(s) and s[j] == s[i]: j += 1
        out.append(s[i] + (str(j - i) if j - i > 1 else '')); i = j
    return ''.join(out)
def rle_h(hs):
    out = []; i = 0
    while i < len(hs):
        j = i
        while j < len(hs) and hs[j] == hs[i]: j += 1
        out.append('%d' % hs[i] + ('x%d' % (j - i) if j - i > 1 else '')); i = j
    return ','.join(out)
terrain = {'na': NA, 'r': [round(v, 2) for v in rings], 'c': [rle(s) for s in rows], 'h': [rle_h(h) for h in hts]}

# ---------- buildings: real OSM footprints (hotels etc.) ----------
GAME_EXCL = box(-70, -60, 70, 60)       # the hand-made villa plot + its beach
bld = []
for e in bar:
    t = e.get('tags', {})
    if 'building' not in t or e['type'] != 'way' or len(e['geometry']) < 4: continue
    if t.get('building') in ('roof',): continue
    pts = geom_en(e)[:-1]
    cE = sum(p[0] for p in pts) / len(pts); cN = sum(p[1] for p in pts) / len(pts)
    lv = t.get('building:levels')
    hm = float(t['height']) if 'height' in t else (float(lv) * 3.1 if lv else (13.0 if t.get('building') in ('hotel', 'apartments') else 6.5))
    if t.get('historic') in ('castle', 'tower') or t.get('man_made') in ('lighthouse', 'pier'): continue
    gp = [fwd(*p) for p in pts]
    if Polygon(gp).intersects(GAME_EXCL): continue
    sc = scale_at(cE, cN)
    kind = 1 if t.get('building') == 'hotel' or t.get('tourism') == 'hotel' else 0
    flat = []
    for x, z in gp: flat += [round(x, 1), round(z, 1)]
    bld.append([kind, round(hm * sc * 1.0, 1)] + flat)
print('buildings', len(bld))

# ---------- villas along the real residential streets ----------
random.seed(7)
roads = [e for e in bar if e.get('tags', {}).get('highway') in ('residential', 'living_street', 'unclassified', 'tertiary') and e['type'] == 'way']
occupied = [Polygon(fwd(*p) for p in geom_en(e)[:-1]).buffer(1.0) for e in bar if 'building' in e.get('tags', {}) and len(e['geometry']) >= 4]
from shapely.strtree import STRtree
villas = []; placed = []
road_lines = []
for e in roads:
    pts = geom_en(e)
    if len(pts) < 2: continue
    road_lines.append(LineString(pts))
    ln = LineString(pts)
    L = ln.length; s0 = random.uniform(4, 14); step = 23
    while s0 < L:
        p0 = ln.interpolate(s0); p1 = ln.interpolate(min(L, s0 + 1))
        dx, dy = p1.x - p0.x, p1.y - p0.y; dl = math.hypot(dx, dy) or 1
        nx, ny = -dy / dl, dx / dl
        for side in (1, -1):
            E = p0.x + nx * side * 17; N = p0.y + ny * side * 17
            d = math.hypot(E, N)
            if d > 1900 or d < 40: continue
            pt = Point(E, N)
            if not landp.contains(pt): continue
            if main.distance(pt) < 70: continue
            if CLS['golf'] and CLS['golf'].contains(pt): continue
            if CLS['wetland'] and CLS['wetland'].contains(pt): continue
            if CLS['forest'] and CLS['forest'].contains(pt) and random.random() < 0.8: continue
            x, z = fwd(E, N)
            if GAME_EXCL.contains(Point(x, z)): continue
            sc = scale_at(E, N)
            w = random.uniform(10, 16) * sc; dd_ = random.uniform(9, 13) * sc
            fp = Point(x, z).buffer(max(w, dd_) * 0.62)
            if any(fp.intersects(o) for o in occupied): continue
            if any(abs(px - x) < (pw + w) * 0.55 and abs(pz - z) < (pw + w) * 0.55 for px, pz, pw in placed[-60:]): continue
            ang = math.atan2(nx * side, ny * side) - math.radians(SEA)   # facing the road
            style = random.choice([0, 0, 1, 1, 2])
            villas.append([round(x, 1), round(z, 1), round(w, 1), round(dd_, 1), round(ang, 2), round(random.uniform(6.2, 7.2) * sc, 1), style])
            placed.append((x, z, w))
        s0 += step + random.uniform(-3, 3)
print('villas', len(villas))

# ---------- roads (for asphalt ribbons, near the villa only) ----------
rds = []
for ln in road_lines:
    gp = [fwd(*c) for c in ln.coords]
    if min(math.hypot(x, z - VZ) for x, z in gp) > 700: continue
    flat = []
    for x, z in gp: flat += [round(x, 1), round(z, 1)]
    rds.append(flat)

# ---------- Sancti Petri islet, castle, lighthouse; Torre del Puerco ----------
cst = load('castle.json')
def poly_game(e, ex=1.0):
    pts = geom_en(e)[:-1]; return [c for p in pts for c in (round(fwd(*p)[0], 1), round(fwd(*p)[1], 1))]
isl = [e for e in load('c1.json') if e['id'] == 1168356515][0]
rocks = [e for e in load('c1.json') if e['geometry'][0] == e['geometry'][-1] and e['id'] != 1168356515 and 36.37 < e['geometry'][0]['lat'] < 36.40]
castle = [e for e in cst if e['id'] == 51041034][0]
inner = [e for e in cst if e['id'] in (631344079, 631344081)]
light = [e for e in cst if e['id'] == 631344078][0]
pier = [e for e in cst if e['id'] == 631344082][0]
torre = [e for e in cst if e['id'] == 52629000][0]
cE, cN = en(36.37975, -6.22003)
lk = {
    'islet': poly_game(isl), 'rocks': [poly_game(r) for r in rocks],
    'castle': poly_game(castle), 'inner': [poly_game(i) for i in inner], 'light': poly_game(light), 'pier': poly_game(pier),
    'cs': round(scale_at(cE, cN), 4),
    'torre': poly_game(torre), 'ts': round(scale_at(*TORRE), 4),
    'torreH': round(cliff_h(*TORRE) * scale_at(*TORRE), 2),
}
# distant towns / skyline anchors [name, x, z, scale]
far = []
for nm, la, lo in [('medina', 36.45767, -5.92727), ('vejer', 36.25194, -5.96705), ('conil', 36.27705, -6.08819), ('cadiz', 36.5295, -6.2951), ('bridge', 36.52338, -6.25702), ('sanfernando', 36.46467, -6.19835), ('chiclana', 36.41911, -6.14607), ('sanctipetri', 36.3935, -6.2070), ('hotels', 36.3525, -6.1675)]:
    E, N = en(la, lo); x, z = fwd(E, N)
    far.append([nm, round(x, 1), round(z, 1), round(scale_at(E, N), 4), round(math.degrees(math.atan2(E, N)) % 360)])
print(far)

import struct, base64
vb = bytearray()
vk = [v for v in villas if math.hypot(v[0], v[1] - VZ) < 1000]
for x, z, w, d_, ang, h, st in vk:
    vb += struct.pack('<hhBBBBB', int(round(x * 10)), int(round(z * 10)), min(255, int(w * 10)), min(255, int(d_ * 10)), min(255, int(h * 10)), int(round((ang % (2 * math.pi)) / (2 * math.pi) * 255)) & 255, st)
print('villas kept', len(vk))
out = {'A': A, 'B': B, 'terrain': terrain, 'bld': bld, 'villas': base64.b64encode(bytes(vb)).decode(), 'roads': [r for r in rds if min(math.hypot(r[i], r[i+1] - VZ) for i in range(0, len(r), 2)) < 500], 'lm': lk, 'far': far}
for k, v in out.items(): print(k, len(json.dumps(v, separators=(',', ':'))))
json.dump(out, open('geo_villa.json', 'w'), separators=(',', ':'))
import os; print('geo_villa.json', os.path.getsize('geo_villa.json'), 'bytes')
