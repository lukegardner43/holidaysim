import json, math
from shapely.geometry import Polygon, LineString, Point
from shapely.ops import linemerge, unary_union
exec(open('build_villa.py').read().split('# ---------- landcover ----------')[0].split('# ---------- coastline')[0])
# reuse chain assembly from build_villa
allw = {}
for f in ['c1.json', 'c4.json', 'c2a.json']:
    for e in load(f): allw[e['id']] = e
def chain(ids): return list(linemerge([LineString(geom_en(allw[i])) for i in ids]).coords)
westc = chain([516122838, 85765553, 831787049])
eastc = chain([85765478, 205202966, 111125551, 85765487, 975937773, 975937764, 975937772, 215117121, 239298171, 239298168, 238422126, 85765514, 85765479, 239298190, 238422133, 239298192, 668050184, 239298193, 251209153, 251209152, 239298186, 239298195, 239298177, 239298174, 239298197, 299906732, 238422136, 299906734, 299906741, 299906742])
land = Polygon(westc + eastc + [en(36.26, -5.80), en(36.60, -5.80), en(36.60, -6.20), en(36.545, -6.300)]).buffer(0)
land = land.simplify(40)
def flat(p): return [round(v) for c in p.exterior.coords[:-1] for v in c]
bar = load('barrosa.json') + load('castle.json')
def polys(pred, tol):
    out = []
    for e in bar:
        t = e.get('tags', {})
        if e['type'] == 'way' and len(e.get('geometry', [])) >= 4 and pred(t):
            p = Polygon(geom_en(e)).buffer(0)
            if p.geom_type == 'Polygon' and p.area > 20000: out.append(flat(p.simplify(tol)))
    return out
isl = Polygon(geom_en([e for e in load('c1.json') if e['id'] == 1168356515][0])).buffer(0).simplify(8)
fly = {'land': flat(land), 'islet': flat(isl),
       'forest': polys(lambda t: t.get('landuse') == 'forest', 30), 'wet': polys(lambda t: t.get('natural') == 'wetland', 30),
       'golf': polys(lambda t: t.get('leisure') == 'golf_course', 30), 'res': polys(lambda t: t.get('landuse') == 'residential', 30),
       'towns': [[n, *[round(v) for v in en(la, lo)]] for n, la, lo in [('chiclana', 36.41911, -6.14607), ('conil', 36.27705, -6.08819), ('sanfernando', 36.46467, -6.19835), ('cadiz', 36.5295, -6.2951), ('novo', 36.3525, -6.165), ('sanctipetri', 36.3935, -6.2070), ('barrosa', 36.3725, -6.1855)]]}
# sandy beach ribbon along the east coast (land is on the left of OSM coastline ways) + shallow-water halo
from shapely.geometry import LineString as LS
def ribbon(coords, w):
    ln = LS(coords).simplify(15)
    left = ln.parallel_offset(w, 'left', join_style=2)
    if left.geom_type == 'MultiLineString': left = max(left.geoms, key=lambda q: q.length)
    return [round(v) for c in ln.coords for v in c], [round(v) for c in left.coords for v in c]
fly['beach'] = []
for chain_ in (eastc, westc):
    a_, b_ = ribbon(chain_, 70)
    fly['beach'].append([a_, b_])
sh = land.buffer(450).simplify(60)
if sh.geom_type != 'Polygon': sh = max(sh.geoms, key=lambda q: q.area)
fly['shallow'] = flat(sh)
json.dump(fly, open('geo_fly.json', 'w'), separators=(',', ':'))
import os; print('geo_fly', os.path.getsize('geo_fly.json'), 'land pts', len(fly['land']) // 2, {k: len(v) for k, v in fly.items() if isinstance(v, list)})
# Jerez airport: runway 02/20 frame, x across (east +), z along runway toward 020 (north +)
x = json.load(open('xry.json'))['elements']
rw = [e for e in x if e.get('tags', {}).get('aeroway') == 'runway'][0]['geometry']
LA, LO = rw[0]['lat'], rw[0]['lon']
C = math.cos(math.radians(LA))
def xy(p):
    E = (p['lon'] - LO) * math.pi / 180 * R * C; N = (p['lat'] - LA) * math.pi / 180 * R
    b = math.radians(21); return (round(E * math.cos(b) - N * math.sin(b), 1), round(E * math.sin(b) + N * math.cos(b), 1))
air = {'runway': [xy(p) for p in (rw[0], rw[-1])], 'terminal': [], 'apron': [], 'bld': []}
for e in x:
    t = e.get('tags', {}); g_ = [xy(p) for p in e['geometry']][:-1]
    if t.get('aeroway') == 'terminal': air['terminal'].append(g_)
    elif t.get('aeroway') == 'apron': air['apron'].append(g_)
    elif t.get('aeroway') == 'taxiway': air.setdefault('taxi', []).append([xy(p) for p in e['geometry']])
    elif 'building' in t: air['bld'].append(g_)
json.dump(air, open('geo_xry.json', 'w'), separators=(',', ':'))
print('xry', os.path.getsize('geo_xry.json'), air['runway'], 'terminal centroid', [ (round(sum(p[0] for p in t)/len(t)), round(sum(p[1] for p in t)/len(t))) for t in air['terminal']])
