import sys, json, time, urllib.request, urllib.parse, os
def q(query, out, tries=8):
    if os.path.exists(out) and os.path.getsize(out)>200:
        return json.load(open(out))
    data=urllib.parse.urlencode({'data':query}).encode()
    for i in range(tries):
        try:
            req=urllib.request.Request('https://overpass-api.de/api/interpreter',data=data,headers={'User-Agent':'holidaysim-builder/1.0 (family game)'})
            r=urllib.request.urlopen(req,timeout=180).read()
            j=json.loads(r)
            json.dump(j,open(out,'w'))
            return j
        except Exception as e:
            print('retry',i,type(e).__name__,str(e)[:100],file=sys.stderr); time.sleep(4+i*3)
    raise SystemExit('failed '+out)
if __name__=='__main__':
    j=q(open(sys.argv[1]).read(), sys.argv[2])
    print(len(j.get('elements',[])),'elements')
