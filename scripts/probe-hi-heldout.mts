/// <reference types="node" />
/**
 * vite-node scripts/probe-hi-heldout.mts [--show]
 *
 * How the Hindi adapter reads Hindi it was NOT built against. The word list was extended while looking at the bundled
 * texts, so the coverage of those texts says little about new text. This probe reads chapters of the same licensed
 * translation that are not bundled (Indian Revised Version, eBible.org hin2017, CC BY-SA 4.0) straight from the
 * distributor's pages into memory — nothing is saved — and reports only counts.
 *
 * Held-out discipline: by default no word is printed, so the list cannot be tuned to these chapters by accident.
 * `--show` prints the unread words for a person who wants to judge the classes; whoever uses it must then choose NEW
 * held-out chapters (edit CHAPTERS) before quoting a figure again.
 */
import { createAdapterRegistry } from '../src/adapters';

const BASE = 'https://ebible.org/hin2017';
/** Not bundled, and of different kinds: narrative, parable, discourse, letter, psalm, law. */
const CHAPTERS: Array<[string, number]> = [['RUT', 1], ['LUK', 15], ['JHN', 3], ['ROM', 8], ['PSA', 103], ['EXO', 20]];
const show = process.argv.includes('--show');
const hi = createAdapterRegistry().get('hi');

const pageFor = (book: string, chapter: number) => `${book}${String(chapter).padStart(book === 'PSA' ? 3 : 2, '0')}.htm`;

/** Verse texts of one chapter page (the extraction of scripts/build-hi-scripture.mjs). */
function versesOf(html: string): string[] {
  const t = html
    .replace(/<ul class=['"]tnav['"][\s\S]*?<\/ul>/g, '\n')
    .replace(/<div class=['"](?:footnote|copyright)['"][\s\S]*$/g, '\n')
    .replace(/<div class=['"](?:s\d?|ms\d?|mt\d?|r|d|sp|mr|sr|b|tnav|copyright|footnote|notemark)['"][^>]*>[\s\S]*?<\/div>/g, '\n')
    .replace(/<span class="verse" id="V(\d+)">[^<]*<\/span>/g, '\n@@$1 ')
    .replace(/<a [^>]*class="notemark"[\s\S]*?<\/a>/g, '')
    .replace(/<span class="popup">[\s\S]*?<\/span>/g, '')
    .replace(/<span class=['"]bdit['"]>\s*\([^<()]*\d+\s*[:.]\s*\d+[^<()]*\)\s*<\/span>/g, '')
    .replace(/<[^>]+>/g, '')
    .replace(/&nbsp;|&#160;/g, ' ');
  const out = new Map<number, string>();
  let current: number | undefined;
  for (const line of t.split('\n')) {
    const m = /^@@(\d+) (.*)/.exec(line);
    if (m) { current = Number(m[1]); out.set(current, m[2]); }
    else if (current !== undefined && /\S/.test(line) && !/^\s*(?:<|>|\d+\s*$)/.test(line)) out.set(current, `${out.get(current)} ${line}`);
  }
  return [...out.values()].map((v) => v.replace(/\s+/g, ' ').trim().normalize('NFC'));
}

let words = 0, vouched = 0, variant = 0, unconfirmed = 0, none = 0, verses = 0;
const missing = new Map<string, number>();
const guessed = new Map<string, number>();
for (const [book, chapter] of CHAPTERS) {
  const res = await fetch(`${BASE}/${pageFor(book, chapter)}`);
  if (!res.ok) { console.error(`${book} ${chapter}: HTTP ${res.status}`); process.exit(1); }
  const list = versesOf(await res.text());
  let w = 0, v = 0;
  for (const verse of list) {
    verses++;
    const tokens = hi.tokenize(verse);
    const analysed = hi.analyze(tokens);
    tokens.forEach((tok, i) => {
      if (!tok.isWord || /^[0-9०-९]+$/.test(tok.surface)) return;
      words++; w++;
      const c = analysed[i].candidates;
      if (c.length === 0) { none++; missing.set(tok.surface, (missing.get(tok.surface) ?? 0) + 1); }
      else if (c[0].unconfirmed) { unconfirmed++; guessed.set(tok.surface, (guessed.get(tok.surface) ?? 0) + 1); }
      else { vouched++; v++; if (c[0].notes?.variantOf) variant++; }
    });
  }
  console.log(`  ${book} ${chapter}: ${list.length} verses, ${w} words, vouched for ${((100 * v) / Math.max(1, w)).toFixed(1)}%`);
}
const pct = (n: number) => `${((100 * n) / Math.max(1, words)).toFixed(1)}%`;
console.log(`probe-hi-heldout — adapter ${hi.version}; ${CHAPTERS.length} chapters not bundled and not used to build the word list, ${verses} verses, ${words} words`);
console.log(`  a reading the word list vouches for: ${pct(vouched)} (${vouched}), of which through a spelling variant ${variant}`);
console.log(`  only an unconfirmed guess of the rules: ${pct(unconfirmed)} (${unconfirmed}; ${guessed.size} different forms)`);
console.log(`  no reading at all: ${pct(none)} (${none}; ${missing.size} different forms)`);
console.log('  "Vouched for" means the list holds the lemma, not that the reading is right; rightness is measured only by the reviewed gold set.');
if (show) {
  const top = (m: Map<string, number>) => [...m.entries()].sort((a, b) => b[1] - a[1]).map(([k, n]) => (n > 1 ? `${k}×${n}` : k)).join('  ');
  console.log(`\nno reading: ${top(missing)}\n\nunconfirmed: ${top(guessed)}`);
  console.log('\nThese chapters are no longer held out for whoever read this list: choose new CHAPTERS before quoting a figure again.');
}
