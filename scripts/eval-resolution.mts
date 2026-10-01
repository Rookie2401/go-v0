/**
 * Coordinator measurement: what does the installed dictionary change for pronunciation?
 *
 * For the coordinator's tone tables and for the hand lexicon's own words, compare
 *   rules alone        thAdapter.decode(word)
 *   with dictionary    the importer's path: dictionary pronunciation → thAdapter.decodeWithPronunciation
 * against the expected tones (tables) and report how many readings the dictionary resolves, confirms or contradicts.
 * Run: npx vite-node scripts/eval-resolution.mts   (needs public/dict/th built with `npm run dict:build`)
 */
import { createFileLexiconSource } from '../src/dict/file';
import { thAdapter, thLexicon } from '../src/adapters/th';
import { CORE, HARD, HELD_OUT, T, tonesOf, words } from '../test/integration/thai-tone-tables';
import type { DictionaryEntry, SyllableAnalysis } from '../src/core';

const dict = createFileLexiconSource('public/dict', 'th');
const info = await dict.info();
if (!info) { console.error('No dictionary under public/dict/th. Run npm run dict:build first.'); process.exit(1); }

const confident = (s: SyllableAnalysis[]) => s.length > 0 && s.every((x) => x.confidence >= 0.8 && x.tone);
const tones = (s: SyllableAnalysis[]) => s.map((x) => x.tone ?? '?').join(' ');
const readingsOf = (entries: DictionaryEntry[]) => {
  const out: Array<{ respelling?: string; ipa?: string }> = [];
  for (const e of entries) {
    const list = e.pronunciations?.length ? e.pronunciations : [{ respelling: e.respelling, ipa: e.ipa }];
    for (const p of list) if ((p.respelling || p.ipa) && !out.some((o) => o.respelling === p.respelling && o.ipa === p.ipa)) out.push({ respelling: p.respelling, ipa: p.ipa });
  }
  return out;
};

async function table(name: string, rows: Array<[string, string]>) {
  const found = await dict.lookup(rows.map(([w]) => thAdapter.normalize(w)));
  const c = { n: rows.length, ruleConfidentRight: 0, ruleConfidentWrong: 0, ruleUncertain: 0, inDict: 0, dictRight: 0, dictWrong: 0, dictNoReading: 0, resolved: 0, stillUncertain: 0, ruleToneKept: 0 };
  const contradictions: string[] = [];
  for (const [word, expected] of rows) {
    const rule = thAdapter.decode!(word);
    const ruleOk = confident(rule);
    if (ruleOk && tones(rule) === expected) c.ruleConfidentRight++; else if (ruleOk) c.ruleConfidentWrong++; else c.ruleUncertain++;
    const entries = found.get(thAdapter.normalize(word));
    if (!entries) { if (!ruleOk) c.stillUncertain++; continue; }
    c.inDict++;
    const readings = readingsOf(entries);
    if (!readings.length) { c.dictNoReading++; if (!ruleOk) c.stillUncertain++; continue; }
    const decoded = readings.map((r) => thAdapter.decodeWithPronunciation!(word, r, info!.id));
    const hit = decoded.find((d) => tones(d) === expected);
    if (hit) {
      c.dictRight++;
      if (!ruleOk) c.resolved++;
      if (hit.some((s) => s.ruleTone)) c.ruleToneKept++;
    } else {
      c.dictWrong++;
      contradictions.push(`${word}: table ${expected}; dictionary readings give ${decoded.map(tones).join(' | ')}`);
    }
  }
  console.log(`\n${name} (${c.n} words)`);
  console.log(`  rules alone:      confident and right ${c.ruleConfidentRight}, confident and wrong ${c.ruleConfidentWrong}, uncertain ${c.ruleUncertain}`);
  console.log(`  in the dictionary ${c.inDict}; a dictionary reading gives the expected tones for ${c.dictRight}, differs for ${c.dictWrong}, no usable reading ${c.dictNoReading}`);
  console.log(`  uncertain by rule and resolved by the dictionary: ${c.resolved}; still uncertain (not in the dictionary / no reading): ${c.stillUncertain}`);
  console.log(`  readings where the rule's own confident tone differed and was kept beside the dictionary's (ruleTone): ${c.ruleToneKept}`);
  for (const x of contradictions.slice(0, 12)) console.log('    ' + x);
  return c;
}

console.log(`dictionary: ${info.id} — ${info.attribution}`);
await table('CORE (regular one-syllable words)', Object.entries(CORE).flatMap(([l, list]) => words(list).map((w) => [w, T[l]] as [string, string])));
await table('HARD', HARD.map(([w, l]) => [w, tonesOf(l).join(' ')] as [string, string]));
await table('HELD_OUT', HELD_OUT.map(([w, l]) => [w, tonesOf(l).join(' ')] as [string, string]));

// the hand lexicon's own words: no expected tones, so this is resolution only
const forms = [...new Set(thLexicon.entries.flatMap((e) => e.forms.map((f) => thAdapter.normalize(f.form))))].filter((f) => /^[ก-ฺเ-๎]+$/u.test(f));
if (forms.length) {
  const found = await dict.lookup(forms.map((f) => thAdapter.normalize(f)));
  let ruleConfident = 0, inDict = 0, withReading = 0, resolved = 0, agree = 0, differ = 0;
  const diffs: string[] = [];
  for (const f of forms) {
    const rule = thAdapter.decode!(f);
    const ok = confident(rule);
    if (ok) ruleConfident++;
    const entries = found.get(thAdapter.normalize(f));
    if (!entries) continue;
    inDict++;
    const readings = readingsOf(entries);
    if (!readings.length) continue;
    withReading++;
    const decoded = readings.map((r) => thAdapter.decodeWithPronunciation!(f, r, info.id));
    if (!ok) { if (decoded.some(confident)) resolved++; continue; }
    if (decoded.some((d) => tones(d) === tones(rule))) agree++; else { differ++; diffs.push(`${f}: rules ${tones(rule)}; dictionary ${decoded.map(tones).join(' | ')}`); }
  }
  console.log(`\nHAND LEXICON (${forms.length} distinct forms)`);
  console.log(`  rules alone confident: ${ruleConfident}; in the dictionary: ${inDict}; with a dictionary reading: ${withReading}`);
  console.log(`  uncertain by rule and resolved by the dictionary: ${resolved}`);
  console.log(`  confident by rule: dictionary agrees ${agree}, differs ${differ}`);
  for (const x of diffs.slice(0, 20)) console.log('    ' + x);
} else {
  console.log('\nHAND LEXICON: could not enumerate the lexicon forms (no forms()/all() accessor).');
}
