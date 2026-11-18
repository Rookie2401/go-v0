// Which everyday words does the Hindi word list not hold? (list written by the auditor: core-words.txt)
// "held" = the adapter's own analysis of the bare word gives at least one reading that is NOT an unconfirmed guess
// (the word itself, an inflected form of a listed lemma, or a listed spelling variant). "guess" = only unconfirmed readings. "none" = no reading.
import fs from 'node:fs';
import { hiAdapter, hiLexicon } from 'C:/Users/CJWal/dev/go-v0-rc/src/adapters/hi';
const src = fs.readFileSync('C:/Users/CJWal/dev/tmp-mem/hiaudit/core-words.txt', 'utf8');
const words = [...new Set(src.split('\n').filter((l) => !l.startsWith('#')).join(' ').split(/\s+/).filter(Boolean))];
const held: string[] = [], guess: string[] = [], none: string[] = [], viaVariant: string[] = [];
for (const w of words) {
  const toks = (hiAdapter.tokenize(w) as any[]).filter((t) => t.isWord);
  const an = hiAdapter.analyze(toks as any);
  // a hyphenated pair counts as held only when every part is
  const states = an.map((a: any) => (a.candidates.length === 0 ? 'none' : a.candidates.some((c: any) => !c.unconfirmed) ? 'held' : 'guess'));
  const st = states.includes('none') ? 'none' : states.includes('guess') ? 'guess' : 'held';
  if (st === 'held') { held.push(w); if (an.some((a: any) => a.candidates[0]?.notes?.variantOf) || !hiLexicon.has(hiAdapter.normalize(w))) viaVariant.push(`${w}→${an.map((a: any) => a.candidates[0]?.lemma).join('+')}`); }
  else if (st === 'guess') guess.push(`${w}→${an.map((a: any) => `${a.candidates[0]?.lemma}/${a.candidates[0]?.pos}`).join('+')}`);
  else none.push(w);
}
console.log(`hi: ${words.length} everyday words checked; no reading at all ${none.length} (${(100 * none.length / words.length).toFixed(0)} %); only an unconfirmed guess ${guess.length} (${(100 * guess.length / words.length).toFixed(0)} %); held ${held.length} (${(100 * held.length / words.length).toFixed(0)} %)`);
console.log('  no reading: ' + none.join(' '));
console.log('  guess only: ' + guess.join(' '));
console.log('  held through a rule or a spelling variant, not as written: ' + viaVariant.join(' '));
