// Every Spanish lexicon row with the forms the engine generates from it (verbs: diagnostic principal parts + full tables of irregulars).
import fs from 'node:fs';
import { esLexicon, esLexiconStats, esLexiconProblems } from 'C:/Users/CJWal/dev/go-v0-rc/src/adapters/es';
import { conjugateLemma } from 'C:/Users/CJWal/dev/go-v0-rc/src/adapters/spanish/verbs';
import { IRREGULAR } from 'C:/Users/CJWal/dev/go-v0-rc/src/adapters/spanish/verb-irregular';
import { pluralsOf, nominalForms, superlativesOf, derivativesOf } from 'C:/Users/CJWal/dev/go-v0-rc/src/adapters/spanish/morph-nominal';
const D = 'C:/Users/CJWal/dev/tmp-mem/esaudit/';
console.log(JSON.stringify({ ...esLexiconStats, duplicates: esLexiconStats.duplicates }), 'problems', esLexiconProblems.length);
const pick = (forms: any[], q: Record<string, string>, variety?: string) => [...new Set(forms.filter((f) => Object.entries(q).every(([k, v]) => (f.morph[k] ?? '') === v) && (variety ? f.varieties?.includes(variety) : !(f.varieties ?? []).some((x: string) => x === 'voseo' || x === 'es-hist'))).map((f) => f.form))].join('/') || '-';
const fin = (forms: any[], mood: string, tense: string, p: string, n: string, extra: Record<string, string> = {}, variety?: string) => pick(forms, { VerbForm: 'Fin', Mood: mood, ...(tense ? { Tense: tense } : {}), Person: p, Number: n, ...extra }, variety);
const P: Array<[string, string]> = [['1', 'Sing'], ['2', 'Sing'], ['3', 'Sing'], ['1', 'Plur'], ['2', 'Plur'], ['3', 'Plur']];
const verbs = esLexicon.entries.filter((e: any) => e.pos === 'VERB' || e.pos === 'AUX');
const vlines: string[] = [];
const full: string[] = [];
for (const e of verbs) {
  const c = conjugateLemma(e.lemma);
  if (!c) { vlines.push(`${e.lemma}\tNO CONJUGATION`); continue; }
  const f = c.forms as any[];
  const six = (mood: string, tense: string, extra: Record<string, string> = {}) => P.map(([p, n]) => (p === '2' && n === 'Plur' ? pick(f, { VerbForm: 'Fin', Mood: mood, ...(tense ? { Tense: tense } : {}), Person: p, Number: n, ...extra }, 'vosotros').split('/').filter((x) => !/des$/.test(x)).join('/') || '-' : fin(f, mood, tense, p, n, extra))).join(' ');
  vlines.push(`${e.lemma} [${c.kind}]\tPRES ${six('Ind', 'Pres')} vos:${fin(f, 'Ind', 'Pres', '2', 'Sing', {}, 'voseo')}\tPRET ${six('Ind', 'Past')}\tIMPF ${fin(f, 'Ind', 'Imp', '1', 'Sing')} ${fin(f, 'Ind', 'Imp', '1', 'Plur')}\tFUT ${fin(f, 'Ind', 'Fut', '1', 'Sing')} CND ${fin(f, 'Cnd', '', '1', 'Sing')}\tSUBJ ${six('Sub', 'Pres')} vos:${fin(f, 'Sub', 'Pres', '2', 'Sing', {}, 'voseo')}\tSUBJ-RA ${fin(f, 'Sub', 'Imp', '1', 'Sing', { Variant: 'Ra' })} ${fin(f, 'Sub', 'Imp', '1', 'Plur', { Variant: 'Ra' })} -SE ${fin(f, 'Sub', 'Imp', '1', 'Sing', { Variant: 'Se' })}\tIMP tú ${fin(f, 'Imp', '', '2', 'Sing')} vos ${fin(f, 'Imp', '', '2', 'Sing', {}, 'voseo')} ud ${fin(f, 'Imp', '', '3', 'Sing', { Polite: 'Form' })} nos ${fin(f, 'Imp', '', '1', 'Plur')} vosotros ${pick(f, { VerbForm: 'Fin', Mood: 'Imp', Person: '2', Number: 'Plur' }, 'vosotros')}\tGER ${pick(f, { VerbForm: 'Ger' })} PART ${pick(f, { VerbForm: 'Part', Gender: 'Masc', Number: 'Sing' })}`);
  if (c.kind === 'irregular') full.push(`== ${e.lemma}\n` + f.map((x) => `${x.form}:${Object.values(x.morph).join('.')}${x.varieties ? `[${x.varieties.join(',')}]` : ''}`).join('  '));
}
fs.writeFileSync(D + 'dump-verbs.txt', vlines.join('\n'));
fs.writeFileSync(D + 'dump-irregular-full.txt', full.join('\n'));
// irregular bases not in the lexicon + extra verbs worth checking through the same generator
const extra = ['asir', 'satisfacer', 'prever', 'deshacer', 'rehacer', 'componer', 'disponer', 'convenir', 'prevenir', 'intervenir', 'contener', 'sostener', 'retener', 'entretener', 'predecir', 'contradecir', 'maldecir', 'atraer', 'distraer', 'recaer', 'producir', 'reducir', 'introducir', 'erguir', 'yacer', 'roer', 'caber', 'adquirir', 'errar', 'averiguar', 'evacuar', 'delinquir', 'argüir', 'tañer', 'bullir', 'reñir', 'teñir', 'poseer', 'proveer', 'imprimir', 'pudrir', 'abolir', 'discernir', 'concluir', 'sustituir', 'huir', 'esquiar', 'guiar', 'fiar', 'actuar', 'graduar', 'aislar', 'prohibir', 'rehusar', 'europeizar', 'airar', 'cocer', 'torcer', 'vencer', 'ejercer', 'zurcir', 'esparcir', 'exigir', 'recoger', 'extinguir', 'seguir', 'pagar', 'tocar', 'cazar', 'apaciguar', 'forzar', 'avergonzar', 'trocar', 'jugar', 'oler', 'desoír', 'reír', 'freír', 'engreír', 'dormir', 'morir', 'podrir', 'hervir', 'elegir', 'colegir', 'erigir', 'ceñir', 'gruñir', 'zambullir', 'leer', 'creer', 'ver', 'dar', 'estar', 'ir', 'ser', 'haber', 'saber', 'placer', 'nacer', 'conocer', 'lucir', 'traducir', 'amar', 'temer', 'partir', 'colar', 'soldar', 'apostar', 'renegar', 'sosegar', 'reventar', 'enmendar', 'nevar', 'tronar', 'amanecer', 'atardecer', 'soler', 'concernir', 'atañer', 'acontecer', 'degollar', 'desosar', 'regir', 'volcar', 'cegar', 'empezar', 'comenzar', 'almorzar', 'rogar', 'colgar', 'negar', 'tropezar', 'vaciar', 'ampliar', 'cambiar', 'estudiar', 'copiar', 'limpiar', 'odiar', 'anunciar', 'continuar', 'situar', 'atestiguar', 'menguar', 'santiguar', 'licuar', 'adecuar'];
const xl: string[] = [];
for (const lemma of extra) {
  const c = conjugateLemma(lemma);
  if (!c) { xl.push(`${lemma}\tNO CONJUGATION`); continue; }
  const f = c.forms as any[];
  const six = (mood: string, tense: string) => P.map(([p, n]) => (p === '2' && n === 'Plur' ? pick(f, { VerbForm: 'Fin', Mood: mood, Tense: tense, Person: p, Number: n }, 'vosotros').split('/').filter((x) => !/des$/.test(x)).join('/') || '-' : fin(f, mood, tense, p, n))).join(' ');
  xl.push(`${lemma} [${c.kind}]\tPRES ${six('Ind', 'Pres')} vos:${fin(f, 'Ind', 'Pres', '2', 'Sing', {}, 'voseo')}\tPRET ${six('Ind', 'Past')}\tIMPF ${fin(f, 'Ind', 'Imp', '1', 'Sing')}\tFUT ${fin(f, 'Ind', 'Fut', '1', 'Sing')}\tSUBJ ${six('Sub', 'Pres')} vos:${fin(f, 'Sub', 'Pres', '2', 'Sing', {}, 'voseo')}\tSUBJ-RA ${fin(f, 'Sub', 'Imp', '1', 'Sing', { Variant: 'Ra' })}\tIMP tú ${fin(f, 'Imp', '', '2', 'Sing')} vos ${fin(f, 'Imp', '', '2', 'Sing', {}, 'voseo')} vosotros ${pick(f, { VerbForm: 'Fin', Mood: 'Imp', Person: '2', Number: 'Plur' }, 'vosotros')}\tGER ${pick(f, { VerbForm: 'Ger' })} PART ${pick(f, { VerbForm: 'Part', Gender: 'Masc', Number: 'Sing' })}`);
}
fs.writeFileSync(D + 'dump-verbs-extra.txt', xl.join('\n'));
const gOf = (e: any) => [...new Set(e.forms.map((f: any) => f.morph.Gender).filter(Boolean))].join('|') || '?';
const dims = (l: string) => derivativesOf(l).filter((d: any) => d.morph.Number === 'Sing' && d.morph.Degree === 'Dim' && /(ito|ita)$/.test(d.form)).map((d: any) => d.form).join('/');
const augs = (l: string) => derivativesOf(l).filter((d: any) => d.morph.Number === 'Sing' && d.morph.Degree === 'Aug').map((d: any) => d.form).join('/');
fs.writeFileSync(D + 'dump-nouns.txt', esLexicon.entries.filter((e: any) => e.pos === 'NOUN').map((e: any) => `${gOf(e)} ${e.lemma}\tlisted:${e.forms.map((f: any) => f.form).join(',')}\tPL ${pluralsOf(e.lemma.toLowerCase()).join('/') || '-'}\tDIM ${dims(e.lemma.toLowerCase())}\tAUG ${augs(e.lemma.toLowerCase())}\t${e.gloss}`).join('\n'));
fs.writeFileSync(D + 'dump-adjs.txt', esLexicon.entries.filter((e: any) => e.pos === 'ADJ').map((e: any) => `${e.lemma}\tlisted:${e.forms.map((f: any) => f.form).join(',')}\t${nominalForms(e.lemma, 'ADJ').map((f: any) => `${(f.morph.Gender ?? '').slice(0, 1)}${f.morph.Number.slice(0, 1)}:${f.form}`).join(' ')}\tSUP ${superlativesOf(e.lemma).slice(0, 1).map((f: any) => f.form).join('/')}\tDIM ${dims(e.lemma)}\t${e.gloss}`).join('\n'));
fs.writeFileSync(D + 'dump-closed.txt', esLexicon.entries.filter((e: any) => !['NOUN', 'VERB', 'AUX', 'ADJ'].includes(e.pos)).map((e: any) => `${e.pos} ${e.lemma}\t${e.forms.map((f: any) => `${f.form}:${Object.entries(f.morph).map(([k, v]) => `${k}=${v}`).join(',')}`).join(' ; ')}\t${e.gloss}`).join('\n'));
console.log('verbs', verbs.length, 'irregular bases', Object.keys(IRREGULAR).length);
