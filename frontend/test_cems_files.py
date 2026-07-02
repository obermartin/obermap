import urllib.request
import json
import ssl

ctx = ssl.create_default_context()
ctx.check_hostname = False
ctx.verify_mode = ssl.CERT_NONE

url = "https://rapidmapping.emergency.copernicus.eu/backend/dashboard-api/public-activations/?code=EMSR864"
req = urllib.request.Request(url, headers={'User-Agent': 'Mozilla/5.0'})
resp = urllib.request.urlopen(req, context=ctx)
data = json.loads(resp.read().decode('utf-8'))

aois = data.get('results', [])[0].get('aois', [])
for aoi in aois:
    for product in aoi.get('products', []):
        for layer in product.get('layers', []):
            if layer.get('format') == 'vt' and layer.get('json'):
                try:
                    req2 = urllib.request.Request(layer['json'], headers={'User-Agent': 'Mozilla/5.0'})
                    resp2 = urllib.request.urlopen(req2, context=ctx)
                    text = resp2.read().decode('utf-8')
                    try:
                        json.loads(text)
                    except json.JSONDecodeError as e:
                        print("Error parsing", layer['json'], repr(e))
                except Exception as e:
                    pass
