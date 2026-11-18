// Core-vocabulary check: (1) is each everyday lemma in the seed / the full lexicon; (2) do the stored principal parts of common verbs match the expected ones; (3) genitive + gender of common nouns.
// The expected values were written by the auditor from memory (no dictionary was consulted).
import fs from 'node:fs';
import { latinLexicon } from 'C:/Users/CJWal/dev/go-v0-rc/src/adapters/latin/lexicon';
import { loadLatinLexicon } from 'C:/Users/CJWal/dev/go-v0-rc/src/adapters/latin/lexicon-load';
import { foldKey } from 'C:/Users/CJWal/dev/go-v0-rc/src/adapters/latin/orthography';
const lx = latinLexicon();
const D = 'C:/Users/CJWal/dev/tmp-mem/laaudit/';
const WORDS = fs.readFileSync(D + 'core-words.txt', 'utf8').split(/\s+/).filter(Boolean);
const uniq = [...new Set(WORDS)];
const has = (w: string) => [...lx.byLemma.keys()].some((k) => foldKey(k) === foldKey(w)) || lx.lookup(foldKey(w)).length > 0;
const seedMissing = uniq.filter((w) => !has(w));
console.log(`SEED: ${uniq.length} everyday words; ${seedMissing.length} not held (${(100 * seedMissing.length / uniq.length).toFixed(0)} %): ${seedMissing.join(' ')}`);
await loadLatinLexicon();
const keys = new Map<string, string>(); for (const k of lx.byLemma.keys()) keys.set(foldKey(k), k);
const has2 = (w: string) => keys.has(foldKey(w)) || lx.lookup(foldKey(w)).length > 0;
const fullMissing = uniq.filter((w) => !has2(w));
console.log(`FULL: ${fullMissing.length} not held (${(100 * fullMissing.length / uniq.length).toFixed(0)} %): ${fullMissing.join(' ')}`);
const asForm = uniq.filter((w) => !keys.has(foldKey(w)) && lx.lookup(foldKey(w)).length > 0);
console.log(`held only as a form of another lemma: ${asForm.map((w) => `${w}→${[...new Set(lx.lookup(foldKey(w)).map((r) => r.lex.lemma))].join('/')}`).join(' ')}`);
// principal parts
const V = fs.readFileSync(D + 'core-verbs.txt', 'utf8').split('\n').map((l) => l.trim()).filter((l) => l && !l.startsWith('#')).map((x) => x.split(/\s+/));
const bad: string[] = []; let n = 0;
for (const [lemma, inf, perf0, sup0] of V) {
  const perf = perf0 === '-' ? '' : perf0; const sup = !sup0 || sup0 === '-' ? '' : sup0;
  const ls = (lx.byLemma.get(lemma) ?? []).filter((l) => l.kind === 'verb' && l.info.principal?.[1] === inf);
  n++;
  if (!ls.length) { bad.push(`${lemma} ${inf}: NO ROW (rows: ${(lx.byLemma.get(lemma) ?? []).filter((l) => l.kind === 'verb').map((l) => l.info.principal?.join(',')).join(' ; ') || 'none'})`); continue; }
  const forms = new Set(ls.flatMap((l) => l.cells().filter((c) => c.note !== 'variant').map((c) => c.form)));
  const all = new Set(ls.flatMap((l) => l.cells().map((c) => c.form)));
  const miss: string[] = [];
  if (perf && !all.has(perf)) miss.push(`perfect ${perf} NOT GENERATED`); else if (perf && !forms.has(perf)) miss.push(`perfect ${perf} only as a variant`);
  if (sup && !all.has(sup) && !all.has(sup.replace(/um$/, 'us'))) miss.push(`participle ${sup} NOT GENERATED`);
  const stored = ls.map((l) => (l.info.principal ?? []).join(', ')).join(' ; ');
  const p = ls[0].info.principal ?? [];
  if (miss.length || (perf && p[2] !== perf) || (sup && p[3] !== sup)) bad.push(`${lemma}: expected ${inf}, ${perf || '-'}, ${sup || '-'}; stored ${stored}${miss.length ? ' ⇒ ' + miss.join('; ') : ''}`);
}
console.log(`\nPRINCIPAL PARTS: ${n} verbs checked, ${bad.length} differ:\n` + bad.join('\n'));
const N = fs.readFileSync(D + 'core-nouns.txt', 'utf8').split('\n').map((l) => l.trim()).filter((l) => l && !l.startsWith('#')).map((x) => x.split(/\s+/));
const nbad: string[] = [];
const GEN: Record<string, string> = { m: 'Masc', f: 'Fem', n: 'Neut', c: 'Fem,Masc' };
for (const [lemma, gen, g] of N) {
  const rows = (lx.byLemma.get(lemma) ?? []).filter((l) => l.kind === 'noun' || l.kind === 'proper');
  const hit = rows.find((l) => l.info.principal?.[1] === gen);
  if (!hit) nbad.push(`${lemma}, ${gen} ${g}: NO SUCH ROW (rows: ${rows.map((l) => `${l.info.principal?.[1]} ${l.info.gender}`).join(' ; ') || 'none'})`);
  else if (hit.info.gender !== GEN[g] && hit.info.gender !== 'Fem,Masc' && g !== 'c') nbad.push(`${lemma}, ${gen}: gender stored ${hit.info.gender}, expected ${GEN[g]}`);
}
console.log(`\nNOUNS: ${N.length} checked, ${nbad.length} differ:\n` + nbad.join('\n'));
