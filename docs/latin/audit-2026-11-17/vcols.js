const fs=require('fs');const [,, file, from, to]=process.argv;
const L=fs.readFileSync(file,'utf8').split('\n').slice(+from,+to);
for(const l of L){const f=l.split('\t');const g=(k)=>((f.find(x=>x.startsWith(k+' '))||'').slice(k.length+1));
const head=f[0].replace(/ (whitaker|rule|romance)$/,'');
const pres=g('PRES').split(' ');const perf=g('PERF');
console.log(`${head} ‖ ${pres[1]} ${pres[4]} ‖ F ${g('FUT').split(' ')[0]} ‖ S ${g('SUBJ').split(' ')[0]} ‖ P ${perf.split(' ')[0]} ‖ I ${g('IMP').split(' ')[0]} ‖ ${g('PTC')}`);}
