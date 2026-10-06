import fs from 'node:fs';
import path from 'node:path';
import { thAdapter } from '../src/adapters';
import { contentSignatureOf } from '../src/ingest/publish';

const root = process.cwd();
const outDir = path.join(root, 'data', 'benchmarks', 'reading-ladders');
fs.mkdirSync(outDir, { recursive: true });
const langs = ['de', 'es', 'hi', 'sq', 'th'];
const words = (text: string) => (text.match(/\p{L}[\p{L}\p{M}'’\-]*/gu) ?? []).length;
const textOf = (value: any, out: string[] = []) => {
  if (Array.isArray(value)) { for (const item of value) textOf(item, out); return out; }
  if (!value || typeof value !== 'object') return out;
  if (Array.isArray(value.sentences)) for (const sentence of value.sentences) if (sentence?.text) out.push(String(sentence.text));
  if (typeof value.text === 'string' && !Array.isArray(value.sentences)) out.push(value.text);
  for (const [key, child] of Object.entries(value)) if (key !== 'source' && key !== 'review' && key !== 'english' && key !== 'sentences') textOf(child, out);
  return out;
};
const rows: any[] = [];
for (const lang of langs) {
  const dir = path.join(root, 'data', 'corpus', lang);
  if (!fs.existsSync(dir)) continue;
  for (const name of fs.readdirSync(dir).filter((file) => file.endsWith('.json'))) {
    const file = path.join(dir, name);
    let doc: any;
    try { doc = JSON.parse(fs.readFileSync(file, 'utf8')); } catch { continue; }
    if (!doc.generated || doc.contentType === 'scripture' || doc.review?.status !== 'unreviewed') continue;
    const sentences = textOf(doc.sections);
    const body = sentences.join('\n');
    const signature = contentSignatureOf(doc);
    const difficulty = doc.difficulty ?? 'unlabelled';
    const measured = lang === 'th' ? (() => { let tokenCount = 0; let analyzedCount = 0; for (const sentence of sentences) { const tokens = thAdapter.tokenize(sentence).filter((token) => token.isWord); tokenCount += tokens.length; analyzedCount += thAdapter.analyze(tokens).filter((token) => token.candidates.length > 0).length; } return { words: tokenCount, wordMeasure: 'thAdapter ICU/compound word tokens', analyzedTokens: analyzedCount }; })() : { words: words(body), wordMeasure: 'Unicode-letter approximation', analyzedTokens: null };
    rows.push({ file: path.relative(root, file).replaceAll('\\', '/'), id: doc.id, lang, title: doc.title, difficulty, words: measured.words, wordMeasure: measured.wordMeasure, analyzedTokens: measured.analyzedTokens, sentences: sentences.length, contentSignature: signature, sourceUrl: doc.source?.url ?? null, reviewStatus: doc.review?.status, class: 'modern-standard-course-generated', priority: /^(A0|A1|A2|B1)$/.test(difficulty) ? 1 : 2, humanReview: ['Read every target-language sentence against the source file.', 'Check spelling, orthography, agreement, word choice, idiom and naturalness for the intended variety.', 'Check that the English gloss is faithful, without using it to rewrite the target text.', 'Record the result with scripts/corpus-review.mts --by "<reviewer>" --level native; use linguistic-check only for a non-native language check.', 'Keep machine-drafted and generated labels until a real review is recorded; do not claim native review in advance.'] });
  }
}
rows.sort((a, b) => a.priority - b.priority || a.lang.localeCompare(b.lang) || a.difficulty.localeCompare(b.difficulty) || a.id.localeCompare(b.id));
const byLang = rows.reduce((out: Record<string, any>, row) => { (out[row.lang] ??= { documents: 0, words: 0, byDifficulty: {} }).documents++; out[row.lang].words += row.words; out[row.lang].byDifficulty[row.difficulty] = (out[row.lang].byDifficulty[row.difficulty] ?? 0) + 1; return out; }, {});
const signatures = rows.reduce((out: Record<string, string[]>, row) => { (out[row.contentSignature] ??= []).push(row.id); return out; }, {});
const report = { schema: 1, generatedAt: '2026-10-02', methodology: 'Queue includes only generated, unreviewed, non-Scripture documents under data/corpus for de/es/hi/sq/th. It does not modify or publish source text. contentSignature is the canonical repository signature of each document and is a batch identity, not a review approval. German/Spanish/Hindi/Albanian counts use a Unicode-letter approximation; Thai counts use thAdapter ICU/compound word tokens and also report analyzed token counts.', summary: { documents: rows.length, words: rows.reduce((n, row) => n + row.words, 0), byLanguage: byLang, duplicateSignatureGroups: Object.values(signatures).filter((ids) => ids.length > 1).map((ids) => ({ ids })) }, reviewerChecklist: rows[0]?.humanReview ?? [], queue: rows };
fs.writeFileSync(path.join(outDir, 'review-queue.json'), JSON.stringify(report, null, 2) + '\n');
const reviewDoc = [
  '# Human reading review queue', '',
  `The current queue contains ${report.summary.documents} generated, unreviewed, non-Scripture texts and ${report.summary.words.toLocaleString('en-US')} measured target-language words. It is generated from [review-queue.json](../data/benchmarks/reading-ladders/review-queue.json).`, '',
  '| Language | Draft texts | Measured words |', '|---|---:|---:|',
  ...Object.entries(byLang).map(([lang, summary]) => `| ${lang} | ${summary.documents} | ${summary.words.toLocaleString('en-US')} |`), '',
  'Thai uses the adapter’s ICU/compound word tokenization; other language counts use a Unicode-letter approximation. Canonical content signatures identify exact wording and do not approve a draft or certify its level.', '',
  'Allocate approximately 60–70% of human review to A0–B1 reading, and 20–30% to Albanian/Hindi language quality. Check every target sentence for spelling, grammar, naturalness, intended variety and narrative coherence, then check its English rescue line for faithfulness.', '',
  'Record an actual native speaker’s review only after that person reads the text:', '',
  '```text', 'npm run corpus:review -- data/corpus/th/bridge-thai-bridge-01.json --by "Reviewer Name" --status reviewed --level native --date YYYY-MM-DD --notes "Actual review findings"', '```', '',
  'Use `--level linguistic-check` for a non-native or tool check; it does not publish a generated lesson. Keep generated and machine-drafted provenance. Any wording edits need a new review signature. Appearing in this queue never makes a text reviewed or published.', '',
];
fs.writeFileSync(path.join(root, 'docs', 'READING_REVIEW_QUEUE.md'), reviewDoc.join('\n'));
console.log(JSON.stringify({ documents: report.summary.documents, words: report.summary.words, byLanguage: report.summary.byLanguage, duplicateSignatureGroups: report.summary.duplicateSignatureGroups.length }, null, 2));
