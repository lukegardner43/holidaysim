# Seville around Plaza de España from OpenStreetMap: true bearings from the plaza
# centre, radially compressed distances (angular size preserved).
import json, math, struct, base64
from shapely.geometry import Polygon, LineString, Point
from shapely.ops import unary_union

R = 6371000
LAT0, LON0 = 37.37708, -5.98689       # Vicente Traver fountain, centre of the Plaza de España ellipse
COS0 = math.cos(math.radians(LAT0))
AXIS = 58                              # bearing of the central pavilion → game -z
A, B = 1400.0, 1070.0                  # slope A/B = 1.31 units per metre near the plaza (the family's scale)

def en(lat, lon): return ((lon - LON0) * math.pi / 180 * R * COS0, (lat - LAT0) * math.pi / 180 * R)
def g(d): return A * math.log(1 + d / B)
def fwd(E, N):
    d = math.hypot(E, N)
    if d < 1e-6: return (0.0, 0.0)
    th = math.atan2(E, N) - math.radians(AXIS); u = g(d)
    return (u * math.sin(th), -u * math.cos(th))
def sc(E, N):
    d = math.hypot(E, N); return g(d) / d if d > 1 else A / B
def load(f): return json.load(open(f))['elements']
def gen(e): return [en(p['lat'], p['lon']) for p in e['geometry']]

LAND = {  # name: (lat, lon, height m, kind)
    'giralda': (37.38618, -5.99254, 104, 'giralda'), 'torreoro': (37.38240, -5.99632, 36.8, 'torreoro'),
    'torresevilla': (37.39133, -6.01031, 180.5, 'skyscraper'), 'setas': (37.39326, -5.99177, 26, 'setas'),
    'schindler': (37.39343, -6.00702, 65, 'schindler'), 'cathedral': (37.38577, -5.99321, 42, 'cathedral'),
    'alcazar': (37.38403, -5.99112, 16, 'alcazar'), 'tabacos': (37.38047, -5.99040, 16, 'block'),
}
lm_out = []
for nm, (la, lo, h, kind) in LAND.items():
    E, N = en(la, lo); x, z = fwd(E, N); s = sc(E, N)
    lm_out.append([nm, kind, round(x, 1), round(z, 1), round(s, 4), round(h * s, 2), round((math.atan2(E, N) * 180 / math.pi) % 360)])
    print(nm, round(math.hypot(E, N)), 'm → game', round(x), round(z), 'h', round(h * s, 1))

# footprints for the cathedral / Setas / Torre Sevilla / Alcázar come from OSM
lmw = {e['id']: e for e in load('sev_lm.json') + load('sev_pe2.json') if e['type'] == 'way'}
def gpoly(e): return [c for p in gen(e)[:-1] for c in (round(fwd(*p)[0], 1), round(fwd(*p)[1], 1))]
fps = {'cathedral': gpoly(lmw[928779436]), 'setas': gpoly(lmw[138602581]), 'torresevilla': gpoly(lmw[358239739]), 'alcazar': gpoly(lmw[22747187]),
       'torreoro': gpoly(lmw[28112279]), 'schindler': gpoly(lmw[102882421])}
skip_pts = [Point(*en(v[0], v[1])) for v in LAND.values()]
skip_polys = [Polygon(gen(lmw[i])).buffer(4) for i in (928779436, 138602581, 358239739, 22747187, 28112279, 102882421, 310065910)]

DEF_H = {'apartments': 17, 'residential': 13, 'house': 7, 'yes': 11, 'retail': 8, 'commercial': 12, 'hotel': 18, 'office': 20, 'church': 18, 'university': 16, 'school': 10, 'public': 14, 'civic': 14, 'garage': 4, 'roof': 4, 'industrial': 9, 'hospital': 22}
out = bytearray(); nb = 0
for e in load('sev_b.json'):
    t = e.get('tags', {})
    if e['type'] != 'way' or t.get('building') in ('tent', 'construction', 'ruins') or len(e['geometry']) < 4: continue
    pts = gen(e)[:-1]
    P = Polygon(pts)
    if not P.is_valid or P.area < 25: continue
    c = P.centroid
    d = math.hypot(c.x, c.y)
    if d < 245: continue                   # the hand-made Plaza de España complex lives here
    if any(sp.contains(c) for sp in skip_polys): continue
    P = P.simplify(1.2, preserve_topology=True)
    pts = list(P.exterior.coords)[:-1]
    if len(pts) < 3 or len(pts) > 60: continue
    if 'height' in t:
        try: hm = float(t['height'].split()[0])
        except: hm = 12
    elif 'building:levels' in t:
        try: hm = float(t['building:levels'].split(';')[0]) * 3.3 + 1
        except: hm = 12
    else: hm = DEF_H.get(t.get('building'), 11)
    hg = hm * sc(c.x, c.y)
    kind = 1 if t.get('building') in ('church', 'cathedral', 'chapel') else (2 if t.get('building') in ('house', 'residential') else 0)
    gp = [fwd(*p) for p in pts]
    out += struct.pack('<BBB', len(gp), min(255, int(round(hg * 10))), kind)
    for x, z in gp: out += struct.pack('<hh', int(round(x * 10)), int(round(z * 10)))
    nb += 1
print('buildings', nb, 'bytes', len(out))

# green: María Luisa park + gardens; water: canal/river ribbons
grn = []
for e in load('sev_g.json'):
    t = e.get('tags', {})
    if e['type'] != 'way' or len(e['geometry']) < 4: continue
    if t.get('leisure') in ('park', 'garden'):
        P = Polygon(gen(e))
        if not P.is_valid: P = P.buffer(0)
        if P.is_empty or P.area < 600: continue
        if P.geom_type != 'Polygon': P = max(P.geoms, key=lambda q: q.area)
        P = P.simplify(3, preserve_topology=True)
        grn.append([1 if t.get('name') == 'Parque de María Luisa' else 0] + [c for p in list(P.exterior.coords)[:-1] for c in (round(fwd(*p)[0], 1), round(fwd(*p)[1], 1))])
print('green', len(grn))
rw = {e['id']: e for e in load('sev_rl.json')}
def ribbon(e, width, clip=None):
    ln = LineString(gen(e))
    if clip: ln = ln.intersection(Point(0, 0).buffer(clip))
    if ln.is_empty: return None
    ln = ln.simplify(8)
    poly = ln.buffer(width / 2, cap_style=2)
    if poly.geom_type != 'Polygon': poly = max(poly.geoms, key=lambda q: q.area)
    return [c for p in list(poly.exterior.coords)[:-1] for c in (round(fwd(*p)[0], 1), round(fwd(*p)[1], 1))]
water = [w for w in [ribbon(rw[1155616642], 115, 6000), ribbon(rw[664935571], 170, 7000)] if w]
res = {'A': A, 'B': B, 'lm': lm_out, 'fp': fps, 'b': base64.b64encode(bytes(out)).decode(), 'green': grn, 'water': water}
json.dump(res, open('geo_sev.json', 'w'), separators=(',', ':'))
import os; print('geo_sev.json', os.path.getsize('geo_sev.json'))
