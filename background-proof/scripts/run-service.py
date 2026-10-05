"""Run one authenticated bounded service update; all access material arrives on stdin."""
import sys,json,urllib.request,urllib.error
if sys.stdin.isatty():
 import termios
 attributes=termios.tcgetattr(sys.stdin)
 attributes[3] &= ~(termios.ECHO | termios.ICANON)
 termios.tcsetattr(sys.stdin,termios.TCSANOW,attributes)
config=json.loads(sys.stdin.readline())
origin=config['origin'].rstrip('/')
if not origin.startswith('https://') or not origin.endswith('.chatgpt.site'):
 raise SystemExit('Only the selected Sites origin is accepted')
headers={'OAI-Sites-Authorization':'Bearer '+config['token']}
path=config.get('path','/api/evidence')
if path not in ['/api/evidence','/api/snapshot','/api/background/tick','/api/proof/start']:
 raise SystemExit('Unsupported service path')
body=None
if path=='/api/background/tick':
 payload={'trigger':config.get('trigger','schedule')}
 if 'weather' in config: payload['weather']=config['weather']
 body=json.dumps(payload).encode()
 headers['Content-Type']='application/json'
elif path=='/api/proof/start':
 body=b'{}'
 headers['Content-Type']='application/json'
request=urllib.request.Request(origin+path,data=body,headers=headers)
try:
 with urllib.request.urlopen(request,timeout=30) as response:
  result=json.load(response)
  print(json.dumps({'httpStatus':response.status,'data':result}))
except urllib.error.HTTPError as e:
 print(json.dumps({'httpStatus':e.code,'error':e.read(400).decode(errors='replace')}));sys.exit(1)
except Exception as e:
 print(json.dumps({'error':str(e)}));sys.exit(1)
