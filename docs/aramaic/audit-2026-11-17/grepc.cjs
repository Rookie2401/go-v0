// grepc.cjs <skeleton> ... : distinct card rows (from coverall.tsv) whose consonantal form equals a skeleton (prefix * allowed at end)
const fs=require('fs');
const cons=s=>s.normalize('NFC').replace(/[֑-ׇ͏]/g,'').replace(/[־׃]/g,'');
const strip=s=>s.normalize('NFC').replace(/[֑-ֽֿ֯׀ׅׄ͏]/g,'');
const rows=fs.readFileSync(__dirname+'/coverall.tsv','utf8').split('\n').filter(Boolean).map(l=>l.split('\t'));
for(const q of process.argv.slice(2)){ const pre=q.endsWith('*'); const k=pre?q.slice(0,-1):q; const seen=new Map();
  for(const r of rows){ const c=cons(r[2]); if(pre?c.startsWith(k):c===k){ const key=strip(r[2])+'|'+r[3]+'|'+r[4]; const e=seen.get(key)||{r,n:0,refs:[]}; e.n++; if(e.refs.length<2)e.refs.push(r[0]); seen.set(key,e);} }
  console.log('## '+q+(seen.size?'':'  — not in the corpus'));
  for(const e of seen.values()){const r=e.r; console.log(`  ${strip(r[2])} ×${e.n} (${e.refs.join(', ')}) [${r[3]} ${r[4]}] ⇒ ${r[5]} | ${r[6]} | ${r[7]} | means: ${r[8]}${r[9]!==r[8]?' (lemma: '+r[9].slice(0,40)+')':''}${r[12]?' | parts: '+r[12]:''}${r[11]?' | also: '+r[11].slice(0,80):''}`);}
}
