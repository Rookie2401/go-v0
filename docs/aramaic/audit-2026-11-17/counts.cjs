const fs=require('fs');
const rows=fs.readFileSync('coverall.tsv','utf8').split('\n').filter(Boolean).map(l=>l.split('\t'));
// cols: 0 ref,1 idx,2 surface,3 code,4 chain,5 lemma,6 pos,7 morphology,8 gloss,9 lexical,10 conf,11 alts,12 parts,13 translit,14 notes,15 constructions
const main=r=>{const segs=r[3].slice(1).split('/'); const n=r[4].split('/').length-1; return segs[n]||'';};
const cnt={}; const inc=(k,r)=>{(cnt[k]??=[0,new Set()]); cnt[k][0]++; if(r) cnt[k][1].add(r[5]);};
const subj=/^(I|You|He|She|We|They|You \(plural\)) /;
const causLem=new Set(['3046','6966','5954','7','858','5312','5182','7981','3488','5267','5709','7313','8214','1541','6744','7127','3255','3848','8421','1946','1981']);
const paelLem=new Set(['1289','7236','4483','8271','2939']);
let examples={};
for(const r of rows){ const m=main(r); inc('all');
  if(r[13]) inc('has transliteration');
  if(/\/Sp/.test(r[3])) { inc('with pronominal suffix'); if(/person|masculine|feminine|singular|plural/.test(r[12])) inc('suffix person shown in parts'); }
  if(/Td/.test(r[3])) inc('Td pieces (determined ending)');
  if(/with the article/.test(r[7])) inc('form line says "with the article"');
  if(/^[NA]/.test(m) && /Td/.test(r[3]) && /^(a|an) /.test(r[8])) inc('determined noun with meaning "a/an ..."',r);
  if(/properly|i\.e\.|\(|;|, or |etc\./.test(r[9])) inc('lemma meaning is raw lexicon prose (i.e./properly/brackets/semicolons)',r);
  if(r[9].length>45) inc('lemma meaning longer than 45 characters',r);
  if(m[0]==='V'){ inc('verb tokens'); const stem=m[1], conj=m[2];
    inc('verb conj '+conj);
    if(conj==='p'){ if(subj.test(r[8]) && !/ed\b| was | were /.test(r[8])) inc('perfect shown as English present'); else {inc('perfect other gloss'); (examples.perfOther??=new Set()).add(r[8]);} }
    if(conj==='v'){ if(/^You/.test(r[8])) inc('imperative shown as "You ..."'); else (examples.impOther??=new Set()).add(r[8]); }
    if(conj==='i'){ if(subj.test(r[8])) inc('imperfect shown as English present'); else (examples.impfOther??=new Set()).add(r[8]); }
    if('QuiMPH'.includes(stem)) { inc('passive/reflexive stem tokens (Peil, Hitpeel, Itpeel, Hitpaal, Itpaal, Hofal)'); if(!/\bis\b|\bare\b|\bam\b|being|been|\bbe\b/.test(r[8])) inc('  ... of which the meaning line is active'); else (examples.passOk??=new Set()).add(r[5]+' '+r[8]); }
    if(conj==='s'){ inc('passive participle tokens'); if(/ing\b/.test(r[8])) inc('  passive participle shown as "-ing"'); }
    if('haeH'.includes(stem)) { inc('causative stem tokens (Hafel, Afel, Shafel, Hofal)'); const id=r[4].split('/').pop(); if(causLem.has(id)) inc('  ... causative of a verb whose listed meaning is the simple one (know, arise, enter, perish, come, go out, descend, rule, sit, go up, pass, be high, be low, reveal, prosper, approach, add, wear, return, go)',r); }
    if(stem==='p'){ const id=r[4].split('/').pop(); if(paelLem.has(id)) inc('  pael of bless/make great/appoint/begin/feed shown with the peal meaning',r); }
    if(r[5]==='הָוָא') inc('tokens of the verb "to be" (lemma shown as הָוָא, meaning "exist")');
    if(/ or |\(|specifically|properly/.test(r[8])) { inc('verb meaning line contains "or" / brackets / lexicon prose'); (examples.verbProse??=new Set()).add(r[8]); }
    if(/^She /.test(r[8])) inc('finite verb meaning starts with "She"');
  }
  if(r[3]==='ATa' && r[5]!=='אִיתַי' ) inc('pronoun as copula labelled "affirmative particle"',r);
  if(r[11]) inc('tokens with "other reading(s)" listed inside their own verse');
}
for(const [k,v] of Object.entries(cnt)) console.log(v[0]+'\t'+k+(v[1].size&&v[1].size<400?'\t(lexemes '+v[1].size+')':''));
for(const [k,v] of Object.entries(examples)) console.log('\n'+k+': '+[...v].slice(0,40).join(' | '));
