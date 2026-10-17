// Generate a concealed, randomised blind age-ordering packet from the ACTUAL existing renderer outputs.
// Execute from web/: node scripts/verify-growth.cjs --require-canvas && node scripts/prepare-blind-growth.cjs
// Never present a prepared packet as a completed human review.
const fs=require('node:fs');
const path=require('node:path');
const crypto=require('node:crypto');
const assert=require('node:assert/strict');
const web=path.resolve(__dirname,'..');
const input=path.join(web,'.sites-runtime','verification');
const ages=[7,40,400];
const renders=ages.map(day=>({day,file:path.join(input,'growth-day'+String(day).padStart(3,'0')+'-phone.png')}));
for(const p of renders){
  if(!fs.existsSync(p.file)){
    console.error('MISSING REAL RENDER '+p.file+'; run verify-growth.cjs --require-canvas first.');
    process.exit(2);
  }
  const bytes=fs.readFileSync(p.file);
  assert.ok(bytes.subarray(0,8).equals(Buffer.from('89504e470d0a1a0a','hex')),'Valid PNG required: '+p.file);
  assert.equal(bytes.readUInt32BE(16),780,'Expected 390px at DPR2, width: '+p.file);
  assert.equal(bytes.readUInt32BE(20),1688,'Expected 844px at DPR2, height: '+p.file);
  assert.ok(Date.now()-fs.statSync(p.file).mtimeMs<30*60*1000,'Stale render; rerun verify-growth: '+p.file);
}
assert.equal(new Set(renders.map(p=>crypto.createHash('sha256').update(fs.readFileSync(p.file)).digest('hex'))).size,3,'Age renders must have three distinct image hashes');
const challenge=crypto.randomUUID();
const base=path.join(web,'.sites-runtime','blind-growth-'+challenge);
const reviewer=path.join(base,'reviewer');
const sealed=path.join(base,'sealed-operator-only');
fs.mkdirSync(reviewer,{recursive:true});
fs.mkdirSync(sealed,{recursive:true,mode:0o700});
const shuffled=renders.slice();
for(let i=shuffled.length-1;i>0;i--){const j=crypto.randomInt(i+1);[shuffled[i],shuffled[j]]=[shuffled[j],shuffled[i]];}
const labels=['A','B','C'];
const key=shuffled.map((item,index)=>{
  const target=labels[index]+'.png';
  const bytes=fs.readFileSync(item.file);
  fs.writeFileSync(path.join(reviewer,target),bytes);
  return {label:labels[index],days:item.day,sha256:crypto.createHash('sha256').update(bytes).digest('hex'),originalFile:path.basename(item.file)};
});
const markup='<!doctype html><html lang="en-AU"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Blind garden ordering</title><style>body{background:#0d1813;color:#edf5e7;font:16px system-ui;margin:2rem}main{max-width:1200px;margin:auto}section{display:flex;flex-wrap:wrap;gap:1rem}figure{margin:0;flex:1 1 220px}img{display:block;width:100%;height:auto;image-rendering:pixelated}figcaption{font-size:1.5rem}</style><main><h1>Stillwild: three unlabelled garden ages</h1><p>Arrange A, B, C from youngest to oldest. Do not consult the operator or the answer key.</p><section>'+
  labels.map(x=>'<figure><img src="'+x+'.png" alt="Garden '+x+'"><figcaption>'+x+'</figcaption></figure>').join('')+
  '</section><p>Your answer: ____ → ____ → ____</p><p>Reviewer identifier: __________ Date: __________</p></main></html>';
fs.writeFileSync(path.join(reviewer,'index.html'),markup);
fs.writeFileSync(path.join(reviewer,'manifest.json'),JSON.stringify({challenge,files:labels.map(l=>l+'.png'),status:'BLIND_REVIEW_NOT_EXECUTED'},null,2)+'\n');
let revision=null;
try{revision=require('node:child_process').execFileSync('git',['rev-parse','HEAD'],{cwd:web,encoding:'utf8',stdio:['ignore','pipe','ignore']}).trim();}catch{}
fs.writeFileSync(path.join(sealed,'answer-key.json'),JSON.stringify({challenge,sourceRevision:revision,seed:4288523180,answers:key,humanVerdict:'NOT_EXECUTED',createdAtUtc:new Date().toISOString()},null,2)+'\n',{mode:0o600});
console.log(JSON.stringify({status:'KIT_PREPARED_NOT_HUMAN_REVIEWED',challenge,revision,reviewerFolder:reviewer,privateKeyFolder:sealed},null,2));
