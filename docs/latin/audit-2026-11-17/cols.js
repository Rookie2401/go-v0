const fs=require('fs');const [,, file, from, to]=process.argv;
const L=fs.readFileSync(file,'utf8').split('\n').slice(+from,+to);
for(const l of L){const f=l.split('\t');const s=f[1].replace(/^SG /,'').split(' | ');const p=f[2].replace(/^PL /,'').split(' | ');
const n=f[0].replace(/ (whitaker|rule|romance)$/,'').replace(/\[(\S+) d(\S)\]/,(m,g,d)=>`${g.replace('Masc','m').replace('Fem','f').replace('Neut','n')}${d}`);
console.log(`${n} ‖ ${s[3]} ${s[4]} ${s[5]}${s[6]&&s[6]!=='-'?' L:'+s[6]:''} ‖ ${p[0]} ${p[1]} ${p[2]} ${p[3]}`);}
