// Every candidate the adapter gives each word of a sentence (after the period ordering), with its confidence, code and source.
// Usage: cands.mts "<sentence>" [word]   (or a file of sentences with @file)
import fs from 'node:fs';
import { adapter, loadFull } from './lib.mts';
await loadFull();
const arg = process.argv[2]!;
const only = process.argv[3];
const sentences = arg.startsWith('@') ? fs.readFileSync(arg.slice(1), 'utf8').split('\n').map((l) => l.trim()).filter((l) => l && !l.startsWith('#')) : [arg];
for (const s of sentences) {
  const tokens = adapter.tokenize(s.normalize('NFC'));
  const an = adapter.analyze(tokens);
  tokens.forEach((t: any, i: number) => {
    if (!t.isWord || (only && !t.surface.includes(only))) return;
    console.log(`«${t.surface}» key=${t.normalized}`);
    for (const c of an[i].candidates) console.log(`    ${c.confidence} ${c.lemma}/${c.pos} ${JSON.stringify(c.morph)} [${(c.varieties ?? []).join(',')}] src=${c.notes?.source} code=${c.notes?.code ?? (c.notes?.tags ?? c.notes?.form ?? '')} id=${c.notes?.lemmaId} ${c.notes?.attested ?? ''} ${c.notes?.pointing ? 'pointing=' + c.notes.pointing : ''} ${c.notes?.rule ? 'rule=' + c.notes.rule : ''}${c.unconfirmed ? ' UNCONF' : ''} g=${String(c.gloss ?? '').slice(0, 40)}`);
  });
}
