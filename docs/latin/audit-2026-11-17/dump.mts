// Every lexeme of the Latin lexicon with the forms the engine generates from it. Arg "full" loads Whitaker + L&S + names first.
import fs from 'node:fs';
import { latinLexicon } from 'C:/Users/CJWal/dev/go-v0-rc/src/adapters/latin/lexicon';
import { loadLatinLexicon } from 'C:/Users/CJWal/dev/go-v0-rc/src/adapters/latin/lexicon-load';
const full = process.argv.includes('full');
const D = 'C:/Users/CJWal/dev/tmp-mem/laaudit/' + (full ? 'full-' : 'seed-');
const lx = latinLexicon();
const seedN = lx.lexemes.length;
if (full) await loadLatinLexicon();
const lexemes = full ? lx.lexemes.slice(seedN) : lx.lexemes;
console.log('seed lexemes', seedN, 'dumping', lexemes.length);
const uniq = (a: string[]) => [...new Set(a)];
const pick = (cells: any[], f: Record<string, string>, opt: { variants?: boolean } = {}) => uniq(cells.filter((c) => Object.entries(f).every(([k, v]) => c.features[k] === v) && !c.periphrastic).map((c) => c.form + (c.note === 'variant' ? '~' : c.note === 'contracted' ? '^' : ''))).join('/') || '-';
const by: Record<string, string[]> = {};
const push = (k: string, s: string) => (by[k] ??= []).push(s);
for (const l of lexemes) {
  let cells: any[] = [];
  try { cells = l.cells(); } catch (e) { push('errors', `${l.kind} ${l.lemma} ERR ${(e as Error).message}`); continue; }
  if (l.kind === 'noun' || l.kind === 'proper') {
    const cs = ['Nom', 'Gen', 'Dat', 'Acc', 'Abl', 'Voc', 'Loc'];
    const sg = cs.map((c) => pick(cells, { Case: c, Number: 'Sing' })).join(' | ');
    const pl = cs.slice(0, 5).map((c) => pick(cells, { Case: c, Number: 'Plur' })).join(' | ');
    push(l.kind, `${l.lemma}, ${l.info.principal?.[1] ?? ''} [${l.info.gender ?? '?'} d${l.info.declension ?? '-'}] ${l.origin}\tSG ${sg}\tPL ${pl}\t# ${l.gloss.slice(0, 50)}`);
  } else if (l.kind === 'adj') {
    const pos = (g: string, c: string, n: string) => uniq(cells.filter((x) => !x.features.Degree && x.features.Gender === g && x.features.Case === c && x.features.Number === n).map((x) => x.form + (x.note === 'variant' ? '~' : ''))).join('/') || '-';
    const deg = (d: string) => pick(cells, { Degree: d, Gender: 'Masc', Case: 'Nom', Number: 'Sing' });
    push('adj', `${l.lemma} [${l.info.adjType}] ${(l.info.principal ?? []).join(',')} ${l.origin}\tm ${pos('Masc', 'Nom', 'Sing')} f ${pos('Fem', 'Nom', 'Sing')} n ${pos('Neut', 'Nom', 'Sing')} | G ${pos('Masc', 'Gen', 'Sing')} D ${pos('Masc', 'Dat', 'Sing')} Ab ${pos('Masc', 'Abl', 'Sing')} V ${pos('Masc', 'Voc', 'Sing')} | Npl m ${pos('Masc', 'Nom', 'Plur')} n ${pos('Neut', 'Nom', 'Plur')} Gpl ${pos('Masc', 'Gen', 'Plur')}\tCMP ${deg('Cmp')} n ${pick(cells, { Degree: 'Cmp', Gender: 'Neut', Case: 'Nom', Number: 'Sing' })}\tSUP ${deg('Sup')}\t# ${l.gloss.slice(0, 40)}`);
  } else if (l.kind === 'verb') {
    const F = (m: string, t: string, v: string, p: string, n: string) => pick(cells, { VerbForm: 'Fin', Mood: m, Tense: t, Voice: v, Person: p, Number: n });
    const P = (t: string, v: string) => pick(cells, { VerbForm: 'Part', Tense: t, Voice: v, Case: 'Nom', Number: 'Sing', Gender: 'Masc' });
    const dep = l.info.deponent;
    push('verb', `${(l.info.principal ?? [l.lemma]).join(', ')} [${l.info.conjugation ?? '-'}${dep ? ' DEP' : ''}${l.info.defective ? ' DEF' : ''}] ${l.origin}\tPRES ${F('Ind', 'Pres', 'Act', '1', 'Sing')} ${F('Ind', 'Pres', 'Act', '2', 'Sing')} ${F('Ind', 'Pres', 'Act', '3', 'Sing')} ${F('Ind', 'Pres', 'Act', '1', 'Plur')} ${F('Ind', 'Pres', 'Act', '3', 'Plur')}\tIMPF ${F('Ind', 'Imp', 'Act', '1', 'Sing')}\tFUT ${F('Ind', 'Fut', 'Act', '1', 'Sing')} ${F('Ind', 'Fut', 'Act', '3', 'Sing')}\tSUBJ ${F('Sub', 'Pres', 'Act', '1', 'Sing')} ${F('Sub', 'Imp', 'Act', '1', 'Sing')}\tPERF ${F('Ind', 'Perf', 'Act', '1', 'Sing')} ${F('Ind', 'Perf', 'Act', '3', 'Sing')} 3pl ${F('Ind', 'Perf', 'Act', '3', 'Plur')}\tPASS ${F('Ind', 'Pres', 'Pass', '1', 'Sing')} ${F('Ind', 'Pres', 'Pass', '3', 'Sing')}\tIMP ${F('Imp', 'Pres', 'Act', '2', 'Sing')} ${F('Imp', 'Pres', 'Act', '2', 'Plur')} pass ${F('Imp', 'Pres', 'Pass', '2', 'Sing')}\tINF ${pick(cells, { VerbForm: 'Inf', Tense: 'Pres', Voice: 'Act' })} ${pick(cells, { VerbForm: 'Inf', Tense: 'Pres', Voice: 'Pass' })} ${pick(cells, { VerbForm: 'Inf', Tense: 'Perf', Voice: 'Act' })}\tPTC ${P('Pres', 'Act')} ${P('Perf', dep ? 'Act' : 'Pass')} ${P('Fut', 'Act')} gdv ${pick(cells, { VerbForm: 'Gdv', Case: 'Nom', Number: 'Sing', Gender: 'Masc' })} sup ${pick(cells, { VerbForm: 'Sup', Case: 'Acc' })}\t# ${l.gloss.slice(0, 40)}`);
  } else {
    const forms = cells.map((c) => `${c.form}${c.note === 'variant' ? '~' : ''}{${Object.entries(c.features).filter(([k]) => k !== 'PronType').map(([, v]) => v).join('.')}}`);
    push(l.kind, `${l.lemma} [${l.pos}] ${l.origin}${l.info.governs?.length ? ' gov ' + l.info.governs.join(',') : ''}\t${forms.length > 1 || forms[0] !== `${l.lemma}{}` ? forms.join(' ') : ''}\t# ${l.gloss.slice(0, 60)}`);
  }
}
for (const [k, v] of Object.entries(by)) { fs.writeFileSync(D + k + '.txt', v.join('\n')); console.log(k, v.length); }
