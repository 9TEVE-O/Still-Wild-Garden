const fs = require('node:fs');
const path = require('node:path');
const ts = require('typescript');
const crypto = require('node:crypto');
const root = path.resolve(__dirname, '..');
const assets = path.join(root, 'android/app/src/main/assets');
fs.mkdirSync(assets, { recursive: true });
// A closed bundle made from the same source functions as the website. No second growth implementation.
const sources = ['lib/garden.ts', 'lib/render-garden.ts', 'android/scene.ts'];
const source = sources.map(p => fs.readFileSync(path.join(root, p), 'utf8').replace(/^import .*;\s*$/gm, '').replace(/\bexport /g, '')).join('\n');
const js = ts.transpileModule(source, { compilerOptions: { target: ts.ScriptTarget.ES2017, module: ts.ModuleKind.None } }).outputText;
const art = name => 'data:image/png;base64,' + fs.readFileSync(path.join(root, 'public/art/' + name + '.png')).toString('base64');
const html = `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta http-equiv="Content-Security-Policy" content="default-src 'none'; img-src data:; script-src 'unsafe-inline'; style-src 'unsafe-inline'; connect-src 'none'; base-uri 'none'; form-action 'none'"><style>html,body{height:100%;margin:0;background:#0a120e;color:#e2ead6;font-family:system-ui;overflow:hidden}body{display:flex;flex-direction:column}h1{font:24px Georgia,serif;margin:20px 20px 4px}p{font-size:12px;margin:0 20px 12px;color:#b1c3a4}canvas{flex:1;min-height:0;width:100%;height:100%}img{display:none}</style></head><body><h1 id="day">Your garden</h1><p id="detail">Quietly becoming.</p><canvas aria-label="Your growing pixel garden"></canvas><img id="island" src="${art('island')}" alt=""><img id="sapling" src="${art('sapling')}" alt=""><script>(()=>{${js.replace(/<\/script/gi, '<\\/script')}})();</script></body></html>`;
fs.writeFileSync(path.join(assets, 'garden.html'), html);
fs.copyFileSync(path.join(root, 'public/art/sapling.png'), path.join(assets, 'sapling.png'));
const sha = p => crypto.createHash('sha256').update(fs.readFileSync(path.join(root, p))).digest('hex');
fs.writeFileSync(path.join(assets, 'provenance.json'), JSON.stringify({ sources: Object.fromEntries([...sources, 'public/art/island.png', 'public/art/sapling.png'].map(p => [p, sha(p)])), htmlSha256: sha('android/app/src/main/assets/garden.html') }, null, 2) + '\n');
console.log(JSON.stringify({ sceneBytes: Buffer.byteLength(html), sources }));
