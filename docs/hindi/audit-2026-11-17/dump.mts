// Every Hindi lexicon row with the forms the engine generates from it and the forms the row lists by hand.
import fs from 'node:fs';
import { hiLexicon, hiLexiconStats, hiLemmaInfo, hiLexiconProblems } from 'C:/Users/CJWal/dev/go-v0-rc/src/adapters/hi';
import { inflectHindi } from 'C:/Users/CJWal/dev/go-v0-rc/src/adapters/hindi/morphology';
import { transliterateHindi } from 'C:/Users/CJWal/dev/go-v0-rc/src/adapters/hindi/translit';
const D = 'C:/Users/CJWal/dev/tmp-mem/hiaudit/';
console.log(JSON.stringify({ lemmas: hiLexiconStats.lemmas, byPos: hiLexiconStats.byPos, duplicates: hiLexiconStats.duplicates, problems: hiLexiconProblems }));
const tr = (s: string) => { const t = transliterateHindi(s); return t.confidence >= 0.6 ? t.text : `(${t.text}?)`; };
const pick = (rows: Array<{ form: string; morph: Record<string, string> }>, want: Record<string, string>) => [...new Set(rows.filter((r) => Object.entries(want).every(([k, v]) => r.morph[k] === v)).map((r) => r.form))].join('/') || '-';
const out: Record<string, string[]> = {};
const push = (k: string, s: string) => (out[k] ??= []).push(s);
for (const e of hiLexicon.entries) {
  const info = hiLemmaInfo(e.lemma, e.pos);
  const listed = e.forms.map((f: any) => `${f.form}{${Object.entries(f.morph).map(([k, v]) => `${k[0]}${k[1]}=${v}`).join(' ')}}`);
  if (e.pos === 'NOUN' || e.pos === 'PROPN') {
    const r = inflectHindi(e.lemma, e.pos, info);
    const g = (gen: string) => {
      const rr = r.filter((x) => x.morph.Gender === gen);
      if (!rr.length) return '';
      return `${gen[0]}: OblSg ${pick(rr, { Number: 'Sing', Case: 'Obl' })} | Pl ${pick(rr, { Number: 'Plur', Case: 'Dir' })} | OblPl ${pick(rr, { Number: 'Plur', Case: 'Obl' })} | VocPl ${pick(rr, { Number: 'Plur', Case: 'Voc' })}`;
    };
    push(e.pos === 'NOUN' ? 'nouns' : 'names', `${e.lemma}\t${tr(e.lemma)}\t${info?.gender ?? '?'}${info?.invariant ? ' inv' : ''}\t${g('Masc')} ${g('Fem')}\t= ${e.gloss}${e.forms.length > 1 ? `\tLISTED: ${listed.join(' ')}` : ''}`);
  } else if (e.pos === 'VERB' || e.pos === 'AUX') {
    const r = inflectHindi(e.lemma, e.pos, info);
    const P = (w: Record<string, string>) => pick(r, w);
    const line = `${e.lemma}\t${tr(e.lemma)}\t${info?.ergative === true ? 'erg' : info?.ergative === false ? 'noerg' : 'erg?'}${info?.causativeOf ? ` cau:${info.causativeOf}` : ''}\tipf ${P({ VerbForm: 'Part', Aspect: 'Imp', Gender: 'Masc', Number: 'Sing' })}\tpf ${P({ VerbForm: 'Part', Aspect: 'Perf', Gender: 'Masc', Number: 'Sing' })}, ${P({ VerbForm: 'Part', Aspect: 'Perf', Gender: 'Masc', Number: 'Plur' })}, ${P({ VerbForm: 'Part', Aspect: 'Perf', Gender: 'Fem', Number: 'Sing' })}, ${P({ VerbForm: 'Part', Aspect: 'Perf', Gender: 'Fem', Number: 'Plur' })}\tsub ${P({ Mood: 'Sub', Person: '1', Number: 'Sing' })}, ${P({ Mood: 'Sub', Person: '3', Number: 'Sing' })}, ${P({ Mood: 'Sub', Person: '3', Number: 'Plur' })}, ${P({ Mood: 'Sub', Person: '2', Polite: 'Fam' })}\tfut ${P({ Tense: 'Fut', Mood: 'Ind', Person: '1', Number: 'Sing', Gender: 'Masc' })}, ${P({ Tense: 'Fut', Mood: 'Ind', Person: '3', Number: 'Sing', Gender: 'Masc' })}, ${P({ Tense: 'Fut', Mood: 'Ind', Person: '3', Number: 'Plur', Gender: 'Masc' })}, ${P({ Tense: 'Fut', Mood: 'Ind', Person: '2', Polite: 'Fam', Gender: 'Masc' })}\timp ${P({ Mood: 'Imp', Polite: 'Fam' })}; ${[...new Set(r.filter((x) => x.morph.Mood === 'Imp' && x.morph.Polite === 'Form' && !x.morph.Tense).map((x) => x.form))].join('/')}\tconv ${P({ VerbForm: 'Conv' })}\t= ${e.gloss}`;
    push('verbs', line);
    // the listed forms that the rules do not generate, and the reverse (a disagreement between the two sources of one verb)
    const gen = new Set(r.map((x) => x.form));
    const lst = new Set(e.forms.map((f: any) => f.form as string));
    const onlyListed = [...lst].filter((f) => !gen.has(f));
    const onlyGen = [...gen].filter((f) => !lst.has(f));
    if (e.forms.length > 1 && (onlyListed.length || onlyGen.length)) push('verb-diff', `${e.lemma}\tonly listed: ${onlyListed.join(' ')}\tonly generated: ${onlyGen.join(' ')}`);
  } else if (e.pos === 'ADJ') {
    const r = inflectHindi(e.lemma, e.pos, info);
    push('adjs', `${e.lemma}\t${tr(e.lemma)}\t${info?.invariant ? 'inv' : ''}\tgen: ${[...new Set(r.map((x) => x.form))].join(' ')}\tlisted: ${[...new Set(e.forms.map((f: any) => f.form))].join(' ')}\t= ${e.gloss}`);
  } else {
    push('closed', `${e.pos}\t${e.lemma}\t${tr(e.lemma)}\t= ${e.gloss}\t${listed.join(' ')}`);
  }
}
for (const [k, v] of Object.entries(out)) { fs.writeFileSync(`${D}dump-${k}.txt`, v.join('\n') + '\n'); console.log(k, v.length); }
