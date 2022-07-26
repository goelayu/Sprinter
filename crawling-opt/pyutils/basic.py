import requests
import argparse

script = """
splash.images_enabled = true
splash.media_source_enabled = false
splash.http2_enabled = false
splash:set_viewport_full()
splash:go(args.url)
return splash:har()
"""

argparser = argparse.ArgumentParser()
argparser.add_argument('url', help='URL to render')
argparser.add_argument('output', help='Output file')
args = argparser.parse_args()


resp = requests.post('http://localhost:8050/run', json={
    'lua_source': script,
    'filters':'easylist',
    'url': args.url,
})

data = resp.content

with open(args.output,"wb") as f:
    f.write(data)
