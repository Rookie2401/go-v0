// npx vite-node --config scripts/vite.config.ts <this> -- "sentence" ...   (run from the worktree root)
// Reads sentences with the real adapter (core + the shards the words need, from disk) and prints each word's readings.
import fs from 'node:fs';
import path from 'node:path';

const root = process.cwd();
const { ruAdapter } = await import(path.join(root, 'src/adapters/ru.ts'));
const { createRussianShardLoader } = await import(path.join(root, 'src/adapters/russian/shards.ts'));
const base = path.join(root, 'public/lexicon/ru/standard');
const source = {
  fetchJson: async (p: string) => JSON.parse(fs.readFileSync(p, 'utf8')),
  fetchBytes: async (p: string) => new Uint8Array(fs.readFileSync(p)),
};
const loader = await createRussianShardLoader(source, { base, maxLoaded: 2000 });
const args = process.argv.slice(2).filter((a) => a !== '--');
const coreOnly = args[0] === '--core';
for (const sentence of coreOnly ? args.slice(1) : args) {
  const tokens = ruAdapter.tokenize(sentence);
  if (!coreOnly) await loader.ensure(tokens.filter((t: { isWord: boolean }) => t.isWord).map((t: { normalized: string }) => t.normalized));
  const analyses = ruAdapter.analyze(tokens);
  console.log(`\n«${sentence}»`);
  for (const a of analyses) {
    if (!a.token.isWord) continue;
    console.log(`  ${a.token.surface}  (${a.candidates.length})`);
    for (const c of a.candidates.slice(0, 5)) {
      const m = Object.entries(c.morph).map(([k, v]) => `${k}=${v}`).join('|');
      const notes = c.notes ? Object.entries(c.notes).map(([k, v]) => `${k}:${Array.isArray(v) ? v.join(',') : v}`).join(' ; ') : '';
      console.log(`      ${c.confidence.toFixed(2)} ${c.lemma ?? '?'} ${c.pos ?? ''} ${m}  «${(c.gloss ?? '').slice(0, 40)}»  ${c.unconfirmed ? '[guess] ' : ''}${notes}  → ${ruAdapter.describeMorph?.(c.morph, c.pos) ?? ''}`);
    }
    const p = ruAdapter.pronunciation(a.token, a);
    console.log(`      pron: ${p.transliteration ?? '-'} | ${(p.notes ?? []).join(' | ').slice(0, 220)}`);
  }
}
