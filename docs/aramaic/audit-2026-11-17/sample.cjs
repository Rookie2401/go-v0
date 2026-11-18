const fs=require('fs');
const strip=s=>s.normalize('NFC').replace(/[֑-ֽֿ֯׀ׅׄ͏]/g,'');
const rows=fs.readFileSync('coverall.tsv','utf8').split('\n').filter(Boolean).map(l=>l.split('\t'));
const inSample=(ref)=>{const m=/^(\w+) (\d+):(\d+)/.exec(ref); if(!m)return false; const b=m[1],c=+m[2],v=+m[3];
  if(process.argv[2]==='A') return b==='Dan'&&(c===2);
  if(process.argv[2]==='B') return b==='Dan'&&(c===3&&v<=30);
  if(process.argv[2]==='C') return b==='Ezra'&&((c===4&&v>=8)||(c===5));
  if(process.argv[2]==='D') return b==='Dan'&&(c===3&&v>30||c===4);
  if(process.argv[2]==='E') return b==='Dan'&&(c===5||c===6);
  if(process.argv[2]==='F') return b==='Dan'&&(c===7);
  if(process.argv[2]==='G') return b==='Ezra'&&(c===6||c===7)||b==='Jer'||b==='Gen';
  return false;};
const seenFile='seen.json'; const seen=new Set(fs.existsSync(seenFile)?JSON.parse(fs.readFileSync(seenFile,'utf8')):[]);
let cur='',out='',nNew=0,nTok=0;
for(const r of rows){ if(!inSample(r[0]))continue; nTok++; const key=strip(r[2])+'|'+r[3]+'|'+r[4]; if(r[0]!==cur){cur=r[0]; out+='\n'+cur.replace('Dan ','D').replace('Ezra ','E')+': ';}
  if(seen.has(key)){continue;} seen.add(key); nNew++;
  const verb=r[6]==='VERB'; out+=strip(r[2])+' '+r[3].slice(1)+' '+r[5]+(verb?' «'+r[8].slice(0,28)+'»':'')+' ¦ '; }
fs.writeFileSync(seenFile,JSON.stringify([...seen]));
console.log(out); console.log('\ntokens in part',nTok,'new distinct readings shown',nNew);
