// How many lemmas of the word list get (a) no romanisation, (b) an "a" kept after a nasalised syllable by the rule R_NASAL_BEFORE.
import { hiLexicon } from 'C:/Users/CJWal/dev/go-v0-rc/src/adapters/hi';
import { decodeHindi } from 'C:/Users/CJWal/dev/go-v0-rc/src/adapters/hindi/pronunciation';
import { transliterateHindi } from 'C:/Users/CJWal/dev/go-v0-rc/src/adapters/hindi/translit';
const lemmas = [...new Set(hiLexicon.entries.map((e: any) => e.lemma as string))].filter((l) => !/\s/.test(l));
const none: string[] = [], nasalKept: string[] = [], indep: string[] = [];
for (const l of lemmas) {
  const t = transliterateHindi(l);
  if (!t.text || t.confidence < 0.6) { none.push(l); continue; }
  const units = decodeHindi(l);
  units.forEach((u: any, i: number) => {
    const prev = units[i - 1] as any;
    if (u.inherentVowel === 'pronounced' && /nasal or dead consonant before it/.test(u.rule ?? '') && prev && (prev.signs ?? []).some((s: string) => s === 'anusvara' || s === 'chandrabindu')) nasalKept.push(`${l} ${t.text}`);
    const next = units[i + 1] as any;
    if (u.inherentVowel === 'dropped' && next && !next.initial && i > 0 && i < units.length - 1) indep.push(`${l} ${t.text}`);
  });
}
console.log(`lemmas ${lemmas.length}; no romanisation shown ${none.length} (${(100 * none.length / lemmas.length).toFixed(1)} %); an "a" kept after a nasalised syllable ${new Set(nasalKept).size}; an "a" dropped before an independent vowel ${new Set(indep).size}`);
console.log('NONE: ' + none.join(' '));
console.log('NASAL-KEPT: ' + [...new Set(nasalKept)].join('; '));
console.log('DROPPED-BEFORE-VOWEL: ' + [...new Set(indep)].join('; '));
