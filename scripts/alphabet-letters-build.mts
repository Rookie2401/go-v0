// Writes packages/language-packs/src/alphabet-sprint/letters-thhi.ts: the Thai and Hindi letters of GoReview's Alphabet saved deck, as plain data, from
// the alphabet trainer's decks (src/alphabet). GoReview then carries the letters and not the spelling engines the trainer reads them from.
//   npx vite-node --config scripts/vite.config.ts scripts/alphabet-letters-build.mts      (from the repository root)
import fs from 'node:fs';
import { rowsFor } from './alphabet-letters.lib.mts';

const lines: string[] = [
  '/**',
  ' * The Thai and Hindi letters of the Alphabet saved deck, as plain data: [what the card shows, what its back says, the kind of sign].',
  ' * WRITTEN BY A SCRIPT (scripts/alphabet-letters-build.mts) from the alphabet trainer\'s decks (src/alphabet/thai.ts and hindi.ts, which read',
  ' * the reader\'s own spelling tables), so that GoReview carries the letters and not the spelling engines. Do not edit by hand:',
  ' * test/goreview-app/alphabet-deck.test.ts compares this file with those decks and fails when they differ. Like its source it is',
  ' * machine-drafted and not checked by a teacher or a native speaker.',
  ' */',
  'export type ScriptRow = readonly [glyph: string, back: string, kind: string];',
  '',
];
for (const lang of ['th', 'hi'] as const) {
  lines.push(`export const ${lang.toUpperCase()}_LETTERS: readonly ScriptRow[] = [`);
  for (const [glyph, back, kind] of rowsFor(lang)) lines.push(`  [${JSON.stringify(glyph)}, ${JSON.stringify(back)}, ${JSON.stringify(kind)}],`);
  lines.push('];', '');
}
fs.writeFileSync('packages/language-packs/src/alphabet-sprint/letters-thhi.ts', lines.join('\n'));
console.log(`alphabetLetters.thhi.ts: th ${rowsFor('th').length}, hi ${rowsFor('hi').length} rows`);
