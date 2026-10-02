/// <reference types="node" />
/**
 * vite-node scripts/probe-hi-sentence.mts "<Hindi sentence>" ["<another>" …]
 *
 * Everything the Hindi adapter says about a sentence: each word's readings (first reading first), its parts, how it
 * is said, the multiword units and the constructions found. For looking at one sentence closely; measures nothing.
 */
import { createAdapterRegistry } from '../src/adapters';

const hi = createAdapterRegistry().get('hi');
for (const raw of process.argv.slice(2).filter((a) => a !== '--')) {
  const sentence = raw.normalize('NFC');
  const tokens = hi.tokenize(sentence);
  const analyses = hi.analyze(tokens);
  console.log(`\n${sentence}`);
  tokens.forEach((tok, i) => {
    if (!tok.isWord) return;
    const c = analyses[i].candidates;
    const said = hi.pronunciation(tok, analyses[i]);
    console.log(`  [${i}] ${tok.surface}  (${said.transliteration ?? '—'})`);
    for (const x of c.slice(0, 4)) {
      const feats = Object.entries(x.morph ?? {}).map(([k, v]) => `${k}=${v}`).join(' ');
      console.log(`       ${x.unconfirmed ? '?' : ' '} ${x.lemma}/${x.pos} ${feats} conf ${x.confidence}${x.gloss ? ` "${x.gloss}"` : ''}${x.parts ? ` parts ${x.parts.map((p) => p.text).join('+')}` : ''}${x.register?.length ? ` [${x.register.join(',')}]` : ''}${x.notes?.variantOf ? ` variantOf ${x.notes.variantOf}` : ''}`);
    }
    if (c.length === 0) console.log('         no reading');
  });
  for (const p of hi.detectPhrases(tokens, analyses)) console.log(`  unit: ${p.pattern.join(' ')}  tokens ${p.tokenIndexes.join(',')}${p.gloss ? `  "${p.gloss}"` : ''}`);
  for (const p of hi.detectPatterns(tokens, analyses)) console.log(`  construction: ${p.key}  tokens ${p.tokenIndexes.join(',')}`);
}
