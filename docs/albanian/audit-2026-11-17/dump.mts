// Every Albanian lexicon row with every form the engine generates from it (nouns, verbs, adjectives), plus the closed classes.
import fs from 'node:fs';
import { SQ_LEXEMES } from 'C:/Users/CJWal/dev/go-v0-rc/src/adapters/albanian/morphology';
import { nounForms } from 'C:/Users/CJWal/dev/go-v0-rc/src/adapters/albanian/morph-noun';
import { verbForms } from 'C:/Users/CJWal/dev/go-v0-rc/src/adapters/albanian/morph-verb';
import { adjectiveForms } from 'C:/Users/CJWal/dev/go-v0-rc/src/adapters/albanian/morph-adjective';
import { SQ_FUNCTION_READINGS } from 'C:/Users/CJWal/dev/go-v0-rc/src/adapters/albanian/function-words';
import { SQ_DISPUTED, SQ_MAJORITY } from 'C:/Users/CJWal/dev/go-v0-rc/src/adapters/albanian/disputed';
const D = 'C:/Users/CJWal/dev/tmp-mem/sqaudit/';
const flag = (form: string, lemma: string): string => (SQ_DISPUTED.has(`${form.toLowerCase()}\t${lemma.toLowerCase()}`) ? '?' : SQ_MAJORITY.has(`${form.toLowerCase()}\t${lemma.toLowerCase()}`) ? '~' : '');
const counts: Record<string, number> = {};
const nouns: string[] = []; const verbs: string[] = []; const adjs: string[] = []; const other: string[] = [];
for (const lex of SQ_LEXEMES) {
  counts[lex.pos] = (counts[lex.pos] ?? 0) + 1;
  if (lex.pos === 'NOUN' || lex.pos === 'PROPN') {
    const f = nounForms(lex);
    const cell = (c: string, n: string, d: string) => f.filter((x) => x.morph.Case === c && x.morph.Number === n && x.morph.Definite === d).map((x) => x.form + flag(x.form, lex.lemma)).join('/') || '-';
    nouns.push(`${lex.pos === 'PROPN' ? 'P' : ''}${lex.gender} ${lex.lemma}\tdef ${cell('Nom', 'Sing', 'Def')}\tacc ${cell('Acc', 'Sing', 'Def')}\tgen ${cell('Gen,Dat,Abl', 'Sing', 'Def')}\tindGen ${cell('Gen,Dat,Abl', 'Sing', 'Ind')}\tPL ${cell('Nom,Acc', 'Plur', 'Ind')}\tPLdef ${cell('Nom,Acc', 'Plur', 'Def')}\tPLgen ${cell('Gen,Dat,Abl', 'Plur', 'Def,Ind')}\tPLabl ${cell('Abl', 'Plur', 'Ind')}\t${lex.gloss}`);
  } else if (lex.pos === 'VERB' || lex.pos === 'AUX') {
    const f = verbForms(lex);
    const pick = (test: (m: Record<string, string>) => boolean) => f.filter((x) => test(x.morph)).map((x) => `${x.form}${flag(x.form, lex.lemma)}[${x.morph.Person ?? ''}${(x.morph.Number ?? '').slice(0, 1).toLowerCase()}]`).join(' ') || '-';
    const has = (m: Record<string, string>, k: string, v: string) => (m[k] ?? '').split(',').includes(v);
    verbs.push([
      `${lex.lemma} (${lex.cls}${lex.nonActive ? `, NA=${lex.nonActive}` : ''}) ${lex.gloss}`,
      `  pres  ${pick((m) => m.Tense === 'Pres' && has(m, 'Mood', 'Ind') && m.Voice === 'Act')}`,
      `  subj  ${pick((m) => m.Tense === 'Pres' && m.Mood === 'Sub' && m.Voice === 'Act')}`,
      `  impf  ${pick((m) => m.Tense === 'Imp' && m.Voice === 'Act')}`,
      `  aor   ${pick((m) => m.Tense === 'Past' && m.Voice === 'Act')}`,
      `  imper ${pick((m) => m.Mood === 'Imp' && m.Voice === 'Act')}`,
      `  opt   ${pick((m) => m.Mood === 'Opt')}`,
      `  adm   ${pick((m) => m.Mood === 'Adm')}`,
      `  ptcp  ${f.filter((x) => x.morph.VerbForm === 'Part').map((x) => x.form + flag(x.form, lex.lemma)).join(' ') || '-'}`,
      `  NApres ${pick((m) => m.Tense === 'Pres' && m.Voice === 'Mid')}`,
      `  NAimpf ${pick((m) => m.Tense === 'Imp' && m.Voice === 'Mid')}`,
      `  NAaor  ${pick((m) => m.Tense === 'Past' && m.Voice === 'Mid')}`,
      `  NAimper ${pick((m) => m.Mood === 'Imp' && m.Voice === 'Mid')}`,
    ].join('\n'));
  } else if (lex.pos === 'ADJ') {
    const f = adjectiveForms(lex);
    adjs.push(`${lex.articulated ? 'i ' : ''}${lex.lemma}\t${f.map((x) => `${x.form}[${x.morph.Gender ?? ''} ${x.morph.Number ?? ''}]`).join('  ')}\t${lex.gloss}`);
  } else other.push(`${lex.pos} ${lex.lemma}\t${lex.gloss}`);
}
fs.writeFileSync(D + 'dump-nouns.txt', nouns.join('\n'));
fs.writeFileSync(D + 'dump-verbs.txt', verbs.join('\n'));
fs.writeFileSync(D + 'dump-adjs.txt', adjs.join('\n'));
fs.writeFileSync(D + 'dump-other.txt', other.join('\n'));
const closed: string[] = [];
for (const [form, rs] of SQ_FUNCTION_READINGS) closed.push(`${form}\t${rs.map((r) => `${r.lemma}/${r.pos}{${Object.entries(r.morph).map(([k, v]) => `${k}=${v}`).join(' ')}}${r.governs ? `+${r.governs}` : ''} "${r.gloss ?? r.role ?? ''}"`).join(' || ')}`);
fs.writeFileSync(D + 'dump-closed.txt', closed.join('\n'));
console.log(JSON.stringify(counts), 'closed forms', SQ_FUNCTION_READINGS.size, 'disputed', SQ_DISPUTED.size, 'majority', SQ_MAJORITY.size);
