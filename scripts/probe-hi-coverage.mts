/// <reference types="node" />
/**
 * vite-node scripts/probe-hi-coverage.mts [--show N]
 *
 * How the Hindi adapter reads the bundled Hindi texts, by group (Stage 0A / 0B / 0C, the seed texts, Scripture):
 * words with a reading the word list vouches for, words with only an unconfirmed rule reading, words with nothing;
 * multiword units and constructions found; how many words the pronunciation layer leaves "uncertain"; analysis speed.
 * A report for the coordinator and the reviewer, not a score: "vouched for" means the list has the lemma, not that
 * the reading is right — only the gold set (npm run hi:eval-gold) measures rightness.
 */
import { loadBundledCorpus } from '../src/ingest';
import { createAdapterRegistry } from '../src/adapters';

const hi = createAdapterRegistry().get('hi');

const args = process.argv.slice(2);
const show = Number(args[args.indexOf('--show') + 1] || 25);
const groupOf = (id: string, type: string) => (type === 'scripture' ? 'scripture (IRV)' : /^s0a/.test(id) ? 'stage 0A' : /^s0b/.test(id) ? 'stage 0B' : /^s0c/.test(id) ? 'stage 0C' : 'seed texts');

interface G { words: number; vouched: number; unconfirmed: number; none: number; phrases: number; patterns: number; sentences: number; uncertainSaid: number; missing: Map<string, number>; guessed: Map<string, number>; ms: number }
const groups = new Map<string, G>();
const g = (k: string): G => { let x = groups.get(k); if (!x) { x = { words: 0, vouched: 0, unconfirmed: 0, none: 0, phrases: 0, patterns: 0, sentences: 0, uncertainSaid: 0, missing: new Map(), guessed: new Map(), ms: 0 }; groups.set(k, x); } return x; };
const bump = (m: Map<string, number>, k: string) => m.set(k, (m.get(k) ?? 0) + 1);
const phraseKinds = new Map<string, number>();
const patternKeys = new Map<string, number>();

for (const doc of loadBundledCorpus().filter((d) => d.lang === 'hi')) {
  const grp = g(groupOf(doc.id, doc.contentType));
  for (const sec of doc.sections) for (const par of sec.paragraphs) {
    if (!('sentences' in par)) continue;
    for (const s of par.sentences) {
      const t0 = performance.now();
      const tokens = hi.tokenize(s.text);
      const analysed = hi.analyze(tokens);
      const phrases = hi.detectPhrases?.(tokens, analysed) ?? [];
      const patterns = hi.detectPatterns?.(tokens, analysed) ?? [];
      grp.ms += performance.now() - t0;
      grp.sentences++;
      grp.phrases += phrases.length;
      grp.patterns += patterns.length;
      for (const p of phrases) bump(phraseKinds, p.pattern.join(' '));
      for (const p of patterns) bump(patternKeys, p.key);
      tokens.forEach((tok, i) => {
        if (!tok.isWord) return;
        grp.words++;
        const c = analysed[i].candidates;
        if (c.length === 0) { grp.none++; bump(grp.missing, tok.surface); }
        else if (c[0].unconfirmed) { grp.unconfirmed++; bump(grp.guessed, `${tok.surface}→${c[0].lemma}`); }
        else grp.vouched++;
        const said = hi.decode?.(tok.surface) ?? [];
        if (said.some((u) => u.inherentVowel === 'uncertain')) grp.uncertainSaid++;
      });
    }
  }
}

const pct = (a: number, b: number) => (b ? `${((100 * a) / b).toFixed(1)}%` : 'n/a');
const top = (m: Map<string, number>, n: number) => [...m.entries()].sort((a, b) => b[1] - a[1]).slice(0, n).map(([k, v]) => `${k}×${v}`).join('  ');
console.log(`probe-hi-coverage — adapter ${hi.version}`);
for (const [k, x] of [...groups.entries()].sort()) {
  console.log(`\n${k}: ${x.sentences} sentences, ${x.words} words`);
  console.log(`  vouched for by the word list ${pct(x.vouched, x.words)} (${x.vouched}); unconfirmed rule reading only ${pct(x.unconfirmed, x.words)} (${x.unconfirmed}); no reading ${pct(x.none, x.words)} (${x.none})`);
  console.log(`  multiword units ${x.phrases}; constructions ${x.patterns}; words whose pronunciation is left uncertain ${pct(x.uncertainSaid, x.words)} (${x.uncertainSaid})`);
  console.log(`  analysis ${(x.ms / Math.max(1, x.words)).toFixed(3)} ms per word`);
  if (x.missing.size) console.log(`  no reading (${x.missing.size} forms): ${top(x.missing, show)}`);
  if (x.guessed.size) console.log(`  unconfirmed (${x.guessed.size} readings): ${top(x.guessed, show)}`);
}
console.log(`\nmultiword units (${phraseKinds.size} different): ${top(phraseKinds, 40)}`);
console.log(`constructions: ${top(patternKeys, 60)}`);
