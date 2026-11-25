/**
 * ko:conj-check: measures the Korean conjugation engine (src/adapters/korean/conjugate.ts + endings.ts) and the analyser
 * (src/adapters/korean/analyze.ts) against Wiktionary's own conjugation tables (via kaikki.org, CC BY-SA 4.0), read-only from
 * data/raw/kaikki-ko/kaikki.org-dictionary-Korean.jsonl.
 *
 * For every verb and adjective entry with an infinitive and a sequential form and conjugation-table rows:
 *   class     derived from the infinitive and sequential forms exactly as the engine conjugates (koDeriveClass);
 *   generate  for each table cell whose tags map to an ending chain, the forms the engine gives; agreement = the table's form is among them;
 *   analyse   each table form with koAnalyzeToken, over a lexicon of that one entry; agreement = a reading with that lemma comes back.
 * Prints the figures and the 40 commonest kinds of disagreement, and writes docs/korean/CONJ-CHECK.md.
 *
 *   npm run ko:conj-check [-- --limit N]
 */
import { createReadStream, writeFileSync } from 'node:fs';
import { createInterface } from 'node:readline';
import { resolve } from 'node:path';
import { type KoConjClass, koDeriveClass, koGenerate } from '../src/adapters/korean/conjugate';
import { koEnding } from '../src/adapters/korean/endings';
import { koAnalyzeToken, koClearAnalysisCache } from '../src/adapters/korean/analyze';
import { installKoreanLexicon, koBareLemma, uninstallKoreanLexicon } from '../src/adapters/korean/index-store';

const SRC = resolve('data/raw/kaikki-ko/kaikki.org-dictionary-Korean.jsonl');
const OUT = resolve('docs/korean/CONJ-CHECK.md');
const limitArg = process.argv.indexOf('--limit');
const LIMIT = limitArg > 0 ? Number(process.argv[limitArg + 1]) : Infinity;

interface Form { form: string; tags?: string[]; source?: string }
const isHangulWord = (s: string) => /^[가-힣]+$/u.test(s);

/** The ending chains (alternatives) a table cell's tags stand for; undefined when the cell is not mapped. */
function chainsFor(tags: Set<string>, adj: boolean, hon: boolean, exist = false): string[][] | undefined {
  const has = (...t: string[]) => t.every((x) => tags.has(x));
  if (exist && !hon) {
    // 있다 / 없다 and their compounds: descriptive, but with the 는-forms of a verb
    if (has('determiner', 'present')) return [['adn-neun']];
    if (has('contrastive', 'informal') && !tags.has('polite')) return [['background']];
    if (has('formal', 'interrogative', 'non-past') && !tags.has('polite')) return [['q-neunya']];
  }
  const H = hon ? ['p-hon'] : [];
  const pre = (ids: string[]) => [...H, ...ids];
  if (has('determiner')) {
    if (has('past')) return [pre(['adn-n'])];
    if (has('present')) return [pre([adj ? 'adn-n' : 'adn-neun'])];
    if (has('future')) return [pre(['adn-l'])];
    return undefined;
  }
  if (has('noun-from-verb')) {
    if (tags.has('polite')) return undefined;
    const p = has('past') ? ['p-past'] : [];
    return [pre([...p, tags.has('informal') ? 'nmlz-gi' : 'nmlz-m'])];
  }
  if (has('motive-form')) return [pre(['intend'])];
  if (has('conditional')) return [pre([tags.has('informal') ? 'only-if' : 'if'])];
  if (has('conjunctive')) return [pre(['and'])];
  if (has('contrastive')) return [pre([tags.has('polite') ? 'deoni' : tags.has('informal') ? (adj ? 'background-adj' : 'background') : 'but'])];
  if (has('causative')) return [pre([tags.has('formal') ? (tags.has('polite') ? 'because' : 'inf') : tags.has('polite') ? 'since' : 'so'])];
  if (has('assertive')) {
    const f = tags.has('formal') ? (tags.has('polite') ? 'hasipsio-decl' : 'decl-da') : tags.has('polite') ? 'haeyo' : 'hae';
    return [pre(['p-fut', f])];
  }
  const polite = tags.has('polite');
  const formal = tags.has('formal');
  if (has('imperative')) {
    if (formal && !polite) return [hon ? ['p-hon', 'imp-eura'] : ['imp-ara'], ['imp-geora'], ['imp-neora']];
    if (formal && polite) return hon ? [['p-hon', 'imp-bsio'], ['imp-sipsio']] : [['imp-bsio']];
    if (polite) return hon ? [['seyo'], ['p-hon', 'haeyo']] : [['haeyo']];
    return [pre(['hae'])];
  }
  if (has('hortative')) {
    if (formal && !polite) return [pre(['prop-ja'])];
    if (formal && polite) return [['p-hon', 'prop-bsida']];
    if (polite) return hon ? [['seyo'], ['p-hon', 'haeyo']] : [['haeyo']];
    return [pre(['hae'])];
  }
  const ind = has('indicative'), int = has('interrogative');
  if (!ind && !int) return undefined;
  const past = has('past');
  const P = past ? ['p-past'] : [];
  if (formal && polite) return [pre([...P, ind ? 'hasipsio-decl' : 'hasipsio-q'])];
  if (formal) {
    if (ind) return [pre([...P, past || adj ? 'decl-da' : 'decl-neunda'])];
    return [pre([...P, past || !adj ? 'q-neunya' : 'q-nya'])];
  }
  if (polite) return hon && !past ? [['seyo'], ['p-hon', 'haeyo']] : [pre([...P, 'haeyo'])];
  if (tags.has('informal')) return [pre([...P, 'hae'])];
  return undefined;
}

interface Tally { ok: number; all: number }
const tally = () => ({ ok: 0, all: 0 });
const gen = { total: tally(), byClass: new Map<string, Tally>() };
const ana = { total: tally(), byClass: new Map<string, Tally>() };
const kinds = new Map<string, { n: number; ex: string[] }>();
const noClass: string[] = [];
let entries = 0, unmapped = 0, skipped = 0;
const bump = (t: { total: Tally; byClass: Map<string, Tally> }, cls: string, ok: boolean) => {
  t.total.all++; if (ok) t.total.ok++;
  const c = t.byClass.get(cls) ?? tally(); c.all++; if (ok) c.ok++; t.byClass.set(cls, c);
};
const kind = (k: string, ex: string) => { const x = kinds.get(k) ?? { n: 0, ex: [] }; x.n++; if (x.ex.length < 4) x.ex.push(ex); kinds.set(k, x); };

const rl = createInterface({ input: createReadStream(SRC) });
const t0 = Date.now();
for await (const line of rl) {
  if (entries >= LIMIT) break;
  const e = JSON.parse(line) as { word: string; pos: string; forms?: Form[]; senses?: Array<{ glosses?: string[] }> };
  if (e.pos !== 'verb' && e.pos !== 'adj') continue;
  const forms = e.forms ?? [];
  const infs = forms.filter((f) => f.tags?.includes('infinitive')).map((f) => f.form);
  const seqs = forms.filter((f) => f.tags?.includes('sequential')).map((f) => f.form);
  const rows = forms.filter((f) => f.source === 'conjugation' && f.tags);
  if (!infs.length || !seqs.length || !rows.length) continue;
  const lemma = e.word;
  if (!lemma.endsWith('다') || !isHangulWord(lemma) || lemma === '이다' || lemma === '아니다') { skipped++; continue; }
  entries++;
  const cls = koDeriveClass(lemma, infs.filter(isHangulWord), seqs.filter(isHangulWord));
  if (!cls) { if (noClass.length < 60) noClass.push(`${lemma} (${infs.join('/')}, ${seqs.join('/')})`); continue; }
  const adj = e.pos === 'adj';
  const tag = adj ? 'VA' : 'VV';
  const stem = lemma.slice(0, -1);
  const gloss = e.senses?.[0]?.glosses?.[0] ?? '';
  const honSi = stem.endsWith('시') && /\bhonorific\b/iu.test(gloss);
  // (1) generation against the table
  let block = 0;
  const tableForms = new Set<string>();
  for (const r of rows) {
    const tags = new Set(r.tags);
    if (tags.has('inflection-template')) { block++; continue; }
    if (tags.has('table-tags') || tags.has('class')) continue;
    if (!isHangulWord(r.form)) continue;
    tableForms.add(r.form);
    // the second table is the honorific one in most entries, a variant spelling in some: a cell agrees with either
    const exist = /[있없밌]$/u.test(stem);
    const chains = [...(chainsFor(tags, adj, block >= 2, exist) ?? []), ...(block >= 2 ? chainsFor(tags, adj, false, exist) ?? [] : [])];
    if (!chains.length) { unmapped++; continue; }
    const got = new Set<string>();
    for (const ch of chains) for (const f of koGenerate(stem, cls as KoConjClass, ch.map(koEnding), { honSi })) got.add(f);
    const ok = got.has(r.form);
    bump(gen, cls, ok);
    if (!ok) kind(`generate | ${cls} | ${adj ? 'adj' : 'verb'} | ${block >= 2 ? 'hon ' : ''}${[...tags].sort().join(' ')}`, `${lemma}: table ${r.form}, engine ${[...got].join('/') || '—'}`);
  }
  // (2) analysis back to the lemma, over a lexicon of this one entry
  installKoreanLexicon({ schema: 1, id: 'ko-conj-check', source: { label: 'conj-check', licence: 'CC BY-SA 4.0', url: 'https://kaikki.org' }, built: '', entries: { [stem]: [{ lemma, tag, irr: cls, gloss }] } });
  koClearAnalysisCache();
  for (const f of tableForms) {
    const ok = koAnalyzeToken(f).some((c) => c.lemma && koBareLemma(c.lemma) === lemma);
    bump(ana, cls, ok);
    if (!ok) kind(`analyse | ${cls} | ${adj ? 'adj' : 'verb'}`, `${lemma}: ${f}`);
  }
}
uninstallKoreanLexicon('ko-conj-check');
koClearAnalysisCache();

const pct = (t: Tally) => (t.all ? ((100 * t.ok) / t.all).toFixed(2) : '—');
const classRows = (t: { byClass: Map<string, Tally> }) => [...t.byClass.entries()].sort((a, b) => b[1].all - a[1].all).map(([c, x]) => `| ${c} | ${x.ok} / ${x.all} | ${pct(x)} % |`);
const top = [...kinds.entries()].sort((a, b) => b[1].n - a[1].n).slice(0, 40);
const secs = ((Date.now() - t0) / 1000).toFixed(0);
const md = `# Korean conjugation check (\`npm run ko:conj-check\`)

Generated ${new Date().toISOString().slice(0, 10)} by \`scripts/ko-conj-check.mts\` from \`data/raw/kaikki-ko/kaikki.org-dictionary-Korean.jsonl\`
(Wiktionary via kaikki.org, CC BY-SA 4.0). ${entries} verb and adjective entries with an infinitive, a sequential form and a
conjugation table; ${noClass.length ? `${noClass.length}+ ` : ''}without a class the engine can derive; ${skipped} skipped (the copulas, non-Hangul
headwords); ${unmapped} table cells whose tags map to no ending chain (rare cells: bare \`indicative\`, \`connective\` …). ${secs} s.

The class of each entry is derived from its infinitive and sequential forms with \`koDeriveClass\` (conjugate.ts), the same
derivation the lexicon build can use.

## Generation: the engine's forms for each table cell

Overall **${gen.total.ok} / ${gen.total.all} = ${pct(gen.total)} %**.

| class | agree | % |
|---|---|---|
${classRows(gen).join('\n')}

## Analysis: each table form read back to its lemma (a lexicon of that one entry)

Overall **${ana.total.ok} / ${ana.total.all} = ${pct(ana.total)} %** (target ≥ 99 %).

| class | read back | % |
|---|---|---|
${classRows(ana).join('\n')}

## Reading the residue (checked by hand on 2026-11-25)

- **Head line against table.** Some entries (기다랗다, 가느다랗다 …) give a regular infinitive and sequential on the head line
  (기다랗아, 기다랗으니) while their own table is ㅎ-irregular (기다래, 기다라니). The class is derived from the head line, as the brief
  asks, so every cell of such an entry disagrees. The engine is right for the class it is given; the lexicon build may prefer the
  table's informal non-past cell when the two disagree.
- **-시다 lexemes.** The table module contracts every -시다 stem with -어요 to -세요, including verbs that are not honorific
  (가시다 "to fade"). The engine contracts 시 + 어요 → 세요 only in the honorific pre-final -(으)시- and in verbs that are themselves
  honorific (a gloss saying "honorific", or 계시다, 주무시다, 잡수시다, 드시다, 편찮으시다, 돌아가시다): 마시다 → 마셔요, never 마세요.
- **Adjectives with verb tables.** A few adjectives carry a verb table (고명하다 → 고명한다, 밭다 → 밭는데). The engine does not give an
  adjective -ㄴ다 / -는; it would also give 예쁜다. Left as the table's.
- **Older spellings.** 가까와(요), 고마와(요): the ㅂ-irregular with 와 after ㅏ was the spelling before 1988; today's is 가까워. Not generated.
- **가거라 / 오너라** are generated (-거라, -너라) since this run.

## The 40 commonest kinds of disagreement

| n | kind | examples |
|---|---|---|
${top.map(([k, x]) => `| ${x.n} | ${k} | ${x.ex.join('; ')} |`).join('\n')}

## Entries with no derivable class (first ${noClass.length})

${noClass.map((x) => `- ${x}`).join('\n') || '(none)'}
`;
writeFileSync(OUT, md);
console.log(`entries ${entries}, skipped ${skipped}, unmapped cells ${unmapped}, ${secs} s`);
console.log(`generation ${gen.total.ok}/${gen.total.all} = ${pct(gen.total)} %`);
for (const r of classRows(gen)) console.log('  ' + r);
console.log(`analysis ${ana.total.ok}/${ana.total.all} = ${pct(ana.total)} %`);
for (const r of classRows(ana)) console.log('  ' + r);
for (const [k, x] of top) console.log(`${String(x.n).padStart(6)}  ${k}  ${x.ex.slice(0, 2).join('; ')}`);
console.log(`no class: ${noClass.length}${noClass.length ? ' e.g. ' + noClass.slice(0, 5).join('; ') : ''}`);
console.log(`wrote ${OUT}`);
