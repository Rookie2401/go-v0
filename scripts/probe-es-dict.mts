/// <reference types="node" />
/**
 * Probe: what does the built Spanish dictionary hold for these forms? Prints each entry briefly.
 * Run: npx vite-node scripts/probe-es-dict.mts -- re elle casa   [--dict public/dict]
 */
import { createFileLexiconSource } from '../src/dict/file';

const args = process.argv.slice(2).filter((a) => a !== '--');
const at = args.indexOf('--dict');
const dir = at >= 0 ? args[at + 1] : 'public/dict';
const forms = args.filter((a, i) => a !== '--dict' && (at < 0 || i !== at + 1));
const source = createFileLexiconSource(dir, 'es');
const info = await source.info();
if (!info) { console.error(`no Spanish dictionary under ${dir}`); process.exit(1); }
const found = await source.lookup(forms);
for (const f of forms) {
  const entries = found.get(f) ?? [];
  console.log(`${f}: ${entries.length} entr${entries.length === 1 ? 'y' : 'ies'}`);
  for (const e of entries) {
    const tags = [...new Set((e.senses ?? []).flatMap((s) => s.tags ?? []))].join(' ');
    console.log(`   ${e.pos ?? '?'}  ${e.glosses.slice(0, 3).join(' | ').slice(0, 150)}${e.formOf?.length ? `  form of: ${e.formOf.map((x) => `${x.lemma} [${x.tags.join(' ')}]`).join('; ').slice(0, 160)}` : ''}${tags ? `  {${tags.slice(0, 120)}}` : ''}`);
  }
}
