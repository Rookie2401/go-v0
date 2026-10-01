/**
 * Coordinator evaluation: the Thai tone engine against every pronunciation in the kaikki (Wiktionary) Thai file.
 *
 *   rules      decodeThai(word) alone (spelling rules + the engine's own exception lists)
 *   respelling decodeThaiRespelling(word, phonemic respelling) WITHOUT the IPA, compared with the IPA tones
 *
 * WHAT THIS MEASURES: agreement of the TONE SEQUENCE (one tone per syllable, hence also the syllable count) with the
 * tone letters of a listed IPA reading. It does not check consonants, vowels, vowel length or finals, so it is not a
 * measure of complete pronunciation accuracy; and the reference is Wiktionary's data, not a native reviewer.
 *
 * One row per distinct written word; the reference is the IPA tone letters of ANY pronunciation Wiktionary lists for
 * that spelling (homographs and variant readings all count as right). The tone parser here is the script's own.
 *
 *   npx vite-node scripts/eval-tones-kaikki.mts [--split dev|test] [--out file.json] [--list N]
 *
 * --split: words are divided in two halves by a stable hash. The engine's author may look at `dev` only; `test` is
 * the coordinator's held-out half.
 */
import { createReadStream, writeFileSync } from 'node:fs';
import { createInterface } from 'node:readline';
import { decodeThai, decodeThaiRespelling } from '../src/adapters/thai/orthography';

const file = 'data/dictionaries/kaikki.org-dictionary-Thai.jsonl';
const arg = (name: string) => { const i = process.argv.indexOf(name); return i > 0 ? process.argv[i + 1] : undefined; };
const outFile = arg('--out');
const split = arg('--split') as 'dev' | 'test' | undefined;
const listN = Number(arg('--list') ?? 40);

type Tone = 'mid' | 'low' | 'falling' | 'high' | 'rising';
const TONE_RE = /[˥˦˧˨˩]+/gu;
const toneOf = (letters: string): Tone | undefined =>
  letters === '˧' || letters === '˧˧' ? 'mid' : letters === '˨˩' ? 'low' : letters === '˥˩' ? 'falling'
    : letters === '˦˥' || letters === '˥' ? 'high' : letters === '˩˩˦' || letters === '˩˦' || letters === '˨˦' ? 'rising' : undefined;
function ipaTones(ipa: string): Array<Tone | undefined> {
  return ipa.replace(/[/[\]]/g, '').split(/[.\s]+/u).filter(Boolean).map((syl) => { const m = syl.match(TONE_RE); return m ? toneOf(m[m.length - 1]) : undefined; });
}
const same = (a: unknown[], b: unknown[]) => a.length === b.length && a.every((x, i) => x === b[i]);
const THAI_WORD = /^[ก-ฺเ-๎]+$/u;
function half(word: string): 'dev' | 'test' {
  let h = 0x811c9dc5;
  for (let i = 0; i < word.length; i++) { h ^= word.charCodeAt(i); h = Math.imul(h, 0x01000193) >>> 0; }
  return (h >>> 7) % 2 === 0 ? 'dev' : 'test';
}

// ── pass 1: every reading Wiktionary lists for each spelling ──
interface Ref { expected: Tone[][]; respellings: Array<{ respelling: string; tones?: Tone[] }> }
const refs = new Map<string, Ref>();
let entries = 0, notOneWord = 0, noIpa = 0;
for await (const line of createInterface({ input: createReadStream(file, 'utf8') })) {
  if (!line.trim()) continue;
  const e = JSON.parse(line) as { word: string; sounds?: Array<{ ipa?: string; other?: string; raw_tags?: string[] }> };
  entries++;
  const word = e.word.normalize('NFC');
  if (!THAI_WORD.test(word)) { notOneWord++; continue; }
  const sounds = e.sounds ?? [];
  const expected = sounds.filter((s) => s.ipa).map((s) => ipaTones(s.ipa!)).filter((t) => t.length && t.every(Boolean)) as Tone[][];
  if (!expected.length) { noIpa++; continue; }
  const ref = refs.get(word) ?? { expected: [], respellings: [] };
  for (const t of expected) if (!ref.expected.some((x) => same(x, t))) ref.expected.push(t);
  // the plain phonemic respelling (no variant labels) of this entry, with this entry's first reading
  const phon = sounds.find((s) => s.other && (s.raw_tags ?? []).length > 0 && (s.raw_tags ?? []).every((t) => t === 'Phonemic' || t === 'Orthographic/Phonemic'));
  if (phon?.other && !ref.respellings.some((r) => r.respelling === phon.other)) ref.respellings.push({ respelling: phon.other });
  refs.set(word, ref);
}

// ── pass 2: evaluate ──
interface Row { word: string; expected: string[][]; got?: Array<string | undefined>; conf?: number[]; respelling?: string }
const rules = { confidentRight: 0, confidentWrong: 0, uncertainRight: 0, uncertainWrong: 0, noAnswer: 0 };
const bySyl = new Map<number, { n: number; confidentRight: number; confidentWrong: number; uncertain: number }>();
const resp = { evaluated: 0, right: 0, wrong: 0, noAnswer: 0 };
const confidentWrong: Row[] = [];
const respellingWrong: Row[] = [];
let evaluated = 0;

for (const [word, ref] of refs) {
  if (split && half(word) !== split) continue;
  evaluated++;
  const syl = decodeThai(word);
  const got = syl.map((s) => s.tone);
  const conf = syl.map((s) => s.confidence);
  const confident = syl.length > 0 && syl.every((s) => s.confidence >= 0.8 && s.tone);
  const right = ref.expected.some((t) => same(t, got));
  const n = Math.min(...ref.expected.map((t) => t.length));
  const b = bySyl.get(n) ?? { n: 0, confidentRight: 0, confidentWrong: 0, uncertain: 0 };
  b.n++;
  if (syl.length === 0) { rules.noAnswer++; b.uncertain++; }
  else if (confident && right) { rules.confidentRight++; b.confidentRight++; }
  else if (confident) { rules.confidentWrong++; b.confidentWrong++; confidentWrong.push({ word, expected: ref.expected, got, conf }); }
  else if (right) { rules.uncertainRight++; b.uncertain++; }
  else { rules.uncertainWrong++; b.uncertain++; }
  bySyl.set(n, b);

  for (const r of ref.respellings) {
    resp.evaluated++;
    const d = decodeThaiRespelling(word, r.respelling);
    const rt = d.map((s) => s.tone);
    if (d.length === 0 || rt.some((t) => !t)) resp.noAnswer++;
    else if (ref.expected.some((t) => same(t, rt))) resp.right++;
    else { resp.wrong++; respellingWrong.push({ word, expected: ref.expected, got: rt, respelling: r.respelling }); }
  }
}

const pct = (a: number, b: number) => (b ? ((100 * a) / b).toFixed(2) + ' %' : 'n/a');
console.log(`entries ${entries}; distinct one-word spellings with a usable IPA: ${refs.size} (not one Thai word: ${notOneWord}; no usable IPA: ${noIpa})`);
console.log(`evaluated${split ? ` (${split} half)` : ''}: ${evaluated}`);
console.log(`\nRULES ALONE (decodeThai):`);
console.log(`  confident and right        ${rules.confidentRight}  ${pct(rules.confidentRight, evaluated)}`);
console.log(`  confident and WRONG        ${rules.confidentWrong}  ${pct(rules.confidentWrong, evaluated)}   = ${pct(rules.confidentWrong, rules.confidentRight + rules.confidentWrong)} of confident answers`);
console.log(`  uncertain, would be right  ${rules.uncertainRight}  ${pct(rules.uncertainRight, evaluated)}`);
console.log(`  uncertain, would be wrong  ${rules.uncertainWrong}  ${pct(rules.uncertainWrong, evaluated)}`);
console.log(`  no answer                  ${rules.noAnswer}  ${pct(rules.noAnswer, evaluated)}`);
console.log(`\nby syllable count (shortest listed reading):`);
for (const [n, b] of [...bySyl.entries()].sort((a, c) => a[0] - c[0]).slice(0, 7)) {
  console.log(`  ${n} syll: ${b.n} words — confident right ${pct(b.confidentRight, b.n)}, confident wrong ${pct(b.confidentWrong, b.n)}, uncertain/none ${pct(b.uncertain, b.n)}`);
}
console.log(`\nRESPELLING PATH (decodeThaiRespelling, no IPA) on ${resp.evaluated} respellings — TONE SEQUENCE agreement with the IPA (not complete pronunciation): same ${resp.right} (${pct(resp.right, resp.evaluated)}), different ${resp.wrong} (${pct(resp.wrong, resp.evaluated)}), no answer ${resp.noAnswer} (${pct(resp.noAnswer, resp.evaluated)})`);
if (listN > 0) {
  console.log(`\nfirst confident-wrong cases:`);
  for (const c of confidentWrong.slice(0, listN)) console.log(`  ${c.word}: expected ${c.expected.map((t) => t.join(' ')).join(' | ')}; got ${c.got!.join(' ')} @ ${c.conf!.join(',')}`);
  console.log(`\nfirst respelling-wrong cases:`);
  for (const c of respellingWrong.slice(0, listN)) console.log(`  ${c.word} (${c.respelling}): expected ${c.expected.map((t) => t.join(' ')).join(' | ')}; got ${c.got!.join(' ')}`);
}
if (outFile) {
  writeFileSync(outFile, JSON.stringify({ split: split ?? 'all', evaluated, rules, bySyllables: [...bySyl.entries()], respelling: resp, confidentWrong, respellingWrong }, null, 1));
  console.log(`\nwrote ${outFile}`);
}
