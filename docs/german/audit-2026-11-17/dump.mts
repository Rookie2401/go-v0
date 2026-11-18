// Every German lexicon row with the forms the engine generates from it.
import fs from 'node:fs';
import { deLexiconView, deLexiconStats } from 'C:/Users/CJWal/dev/go-v0-rc/src/adapters/german/lexicon';
import { declineNoun, declineAdjective, conjugateGerman } from 'C:/Users/CJWal/dev/go-v0-rc/src/adapters/german/morphology';
import { CLOSED_FORMS, PREPOSITIONS, CONTRACTIONS } from 'C:/Users/CJWal/dev/go-v0-rc/src/adapters/german/function-words';
const D = 'C:/Users/CJWal/dev/tmp-mem/deaudit/';
console.log(JSON.stringify({ ...deLexiconStats, duplicates: deLexiconStats.duplicates.length }));
const cell = (forms: Array<{ form: string; cells: any[] }>, c: string, g: (x: any) => boolean): string => [...new Set(forms.filter((f) => f.cells.some((x) => x.c === c && g(x))).map((f) => f.form))].join('/');
fs.writeFileSync(D + 'nouns.txt', deLexiconView.allNouns().map((n: any) => {
  let f: Array<{ form: string; cells: any[] }> = [];
  try { f = declineNoun(n); } catch (e) { return `${n.lemma}\tERR ${(e as Error).message}`; }
  const sg = (x: any) => x.g !== 'p'; const pl = (x: any) => x.g === 'p';
  return `${n.gender} ${n.lemma}\tG:${cell(f, 'G', sg)}\tD:${cell(f, 'D', sg)}\tA:${cell(f, 'A', sg)}\tPl:${cell(f, 'N', pl)}\tDpl:${cell(f, 'D', pl)}${n.weak ? '\tWEAK' : ''}${n.adjectival ? '\tADJECTIVAL' : ''}${n.sameAs ? `\t=${n.sameAs}` : ''}\t${n.gloss}`;
}).join('\n'));
fs.writeFileSync(D + 'verbs.txt', deLexiconView.allVerbs().map((v: any) => {
  let c: any;
  try { c = conjugateGerman(v); } catch (e) { return `${v.lemma}\tERR ${(e as Error).message}`; }
  const k = (x: string) => c.forms[x] ?? '-';
  return `${v.prefix ? `${v.prefix}|` : ''}${v.lemma}${v.reflexive ? ' (sich)' : ''}\t${v.cls}\tdu ${k('pres.2s')}\ter ${k('pres.3s')}\tihr ${k('pres.2p')}\tprät ${k('pret.1s')}/du ${k('pret.2s')}\tPII ${k('part.past')}\timp ${k('imp.2s')}\tK2 ${k('subj2.1s')}\tzu ${k('inf.zu')}\t${v.aux}${v.governs ? `\t[${v.governs}]` : ''}\t${v.gloss}`;
}).join('\n'));
fs.writeFileSync(D + 'adjs.txt', deLexiconView.allAdjectives().map((a: any) => {
  const one = (deg: 'pos' | 'cmp' | 'sup') => { try { const f = declineAdjective(a, deg); return [...new Set(f.filter((x) => x.cells.some((y: any) => y.c === 'N' && y.g === 'm' && y.decl === 'st')).map((x) => x.form))].join('/') || '-'; } catch { return 'ERR'; } };
  return `${a.lemma}\tm.st ${one('pos')}\tcmp ${one('cmp')}\tsup ${one('sup')}${a.indeclinable ? '\tINDECL' : ''}\t${a.gloss}`;
}).join('\n'));
fs.writeFileSync(D + 'closed.txt', (CLOSED_FORMS as any[]).map((c) => JSON.stringify(c)).join('\n') + '\n--PREP--\n' + (PREPOSITIONS as any[]).map((p) => JSON.stringify(p)).join('\n') + '\n--CONTR--\n' + (CONTRACTIONS as any[]).map((p) => JSON.stringify(p)).join('\n'));
