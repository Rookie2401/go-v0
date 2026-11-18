// Every word of every bundled Biblical Aramaic verse (data/corpus/arc/*.json, the text the project ships) through the card,
// in its own verse as the sentence. Words are cut with the adapter's OWN tokeniser (heTokenize), not a Latin regex.
// Output: one line per word (TSV) + totals. Usage: coverall.mts <out.tsv>
import fs from 'node:fs';
import { registerAllAnalysers } from 'C:/Users/CJWal/dev/go-v0-rc/test/support/analysers';
import { parseSelection } from 'C:/Users/CJWal/dev/go-v0-rc/packages/golearn-extension/src/parser';
import { arcAdapter } from 'C:/Users/CJWal/dev/go-v0-rc/src/adapters/arc';
import { ARAMAIC_SEED } from 'C:/Users/CJWal/dev/go-v0-rc/src/adapters/aramaic/seed';
import { ARAMAIC_PASSAGES } from 'C:/Users/CJWal/dev/go-v0-rc/src/adapters/aramaic/resources';
import { heNormalize } from 'C:/Users/CJWal/dev/go-v0-rc/src/adapters/hebrew/text';
registerAllAnalysers();
const DIR = 'C:/Users/CJWal/dev/go-v0-rc/data/corpus/arc/';
const out: string[] = [];
const refOf = (title: string) => title.replace('Daniel', 'Dan').replace('Jeremiah', 'Jer').replace('Genesis', 'Gen');
const seedByRef = new Map<string, typeof ARAMAIC_SEED[number][]>();
for (const r of ARAMAIC_SEED) { const a = seedByRef.get(r.reference) ?? []; a.push(r); seedByRef.set(r.reference, a); }
const T = { verses: 0, words: 0, blank: 0, unconf: 0, c98: 0, cOther: 0, noGloss: 0, misaligned: 0, firstIsSource: 0, firstNotSource: 0, withAlt: 0, verseCountMismatch: 0, nonWordLetters: 0 };
const confHist: Record<string, number> = {};
for (const p of ARAMAIC_PASSAGES) {
  const doc = JSON.parse(fs.readFileSync(DIR + p.slug + '.json', 'utf8'));
  const sentences: string[] = doc.sections.flatMap((s: any) => s.paragraphs.flatMap((q: any) => q.sentences.map((x: any) => x.text)));
  const text = sentences.join(' ');
  const ref = refOf(p.title);
  const seed = seedByRef.get(ref) ?? [];
  const tokens = arcAdapter.tokenize(text);
  const words = tokens.filter((t) => t.isWord);
  T.verses++;
  if (words.length !== seed.length) { T.verseCountMismatch++; out.push(`#MISMATCH ${ref}: tokens ${words.length} vs seed rows ${seed.length}`); }
  for (const t of tokens) if (!t.isWord && /[א-ת]/.test(t.surface)) { T.nonWordLetters++; out.push(`#NONWORD-LETTERS ${ref}: ${t.surface}`); }
  words.forEach((w, k) => {
    T.words++;
    let c: any;
    try { c = parseSelection({ surface: w.surface, languageId: 'arc', context: { kind: 'sentence', confidence: 0.9, sentence: text, selStart: w.start, selEnd: w.end } }); }
    catch (e) { c = { notes: ['THROW ' + (e as Error).message], alternatives: [], syntaxNotes: [], constructions: [] }; }
    const s = seed[k];
    const same = s && heNormalize(s.surface) === heNormalize(w.surface);
    if (!same) T.misaligned++;
    const conf = String(c.confidence ?? 0); confHist[conf] = (confHist[conf] ?? 0) + 1;
    if (!c.lemma) T.blank++;
    else if (c.unconfirmed) T.unconf++;
    else if (c.confidence === 0.98) T.c98++; else T.cOther++;
    if (c.lemma && !c.gloss) T.noGloss++;
    if (c.alternatives?.length) T.withAlt++;
    out.push([ref, k + 1, w.surface, s ? s.morph : '?', s ? s.lemmaId : '?', c.lemma ?? '∅', c.pos ?? '', c.morphology ?? '', c.gloss ?? '', c.wordAnalysis?.lexicalMeaning?.text ?? '', c.confidence ?? 0,
      (c.alternatives ?? []).map((a: any) => `${a.lemma}/${a.pos}/${a.gloss ?? ''}`).join(' ; '), (c.syntaxNotes ?? []).join(' ; '), c.transliteration ?? '', (c.notes ?? []).join(' || '),
      (c.constructions ?? []).map((x: any) => x.title).join(' ; ')].join('\t'));
  });
}
fs.writeFileSync(process.argv[2]!, out.join('\n') + '\n', 'utf8');
console.log(JSON.stringify(T, null, 1));
console.log('confidence histogram', JSON.stringify(confHist));
console.log('seed rows', ARAMAIC_SEED.length);
