/// <reference types="node" />
/**
 * Node-only reader of the kaikki.org Wiktionary extract for the benchmark: headword index (with every Paiboon
 * romanization the file lists for a headword) and the usage examples. Reads the file itself; downloads nothing.
 * Source: Wiktionary, via kaikki.org — CC BY-SA 4.0.
 */
import fs from 'node:fs';
import readline from 'node:readline';
import { makeHeadwordIndex, normRoman, type HeadwordIndex } from './align';

export const KAIKKI_ATTRIBUTION = 'Wiktionary, via kaikki.org — CC BY-SA 4.0';
export const DEFAULT_KAIKKI_FILE = 'data/dictionaries/kaikki.org-dictionary-Thai.jsonl';

/** Parts of speech that are not words for alignment (letters, symbols, punctuation). */
const NOT_WORDS = new Set(['character', 'symbol', 'punct']);
/** Parts of speech left out of the dict-mm lexicon too: multi-word expressions and bound affixes. */
const NOT_FOR_MM = new Set([...NOT_WORDS, 'phrase', 'proverb', 'prep_phrase', 'prefix', 'suffix', 'infix']);
const THAI_WORD = /^[\p{Script=Thai}]+$/u;

export interface KaikkiExample {
  headword: string;
  pos: string;
  type: string;
  text?: string;
  roman?: string;
  ref?: string;
}

export interface KaikkiBench {
  file: string;
  lines: number;
  index: HeadwordIndex;
  /** Thai-only headwords usable by the dict-mm baseline. */
  mmWords: Set<string>;
  examples: KaikkiExample[];
}

interface RawSound { roman?: unknown; raw_tags?: unknown; tags?: unknown }
interface RawExample { text?: unknown; roman?: unknown; type?: unknown; ref?: unknown }
interface RawSense { examples?: unknown }
interface RawEntry { word?: unknown; pos?: unknown; sounds?: unknown; senses?: unknown }

const isPaiboon = (s: RawSound): boolean =>
  typeof s.roman === 'string' && Array.isArray(s.raw_tags) && (s.raw_tags as unknown[]).includes('Paiboon');

export async function loadKaikkiBench(file: string = DEFAULT_KAIKKI_FILE): Promise<KaikkiBench> {
  if (!fs.existsSync(file)) throw new Error(`cannot read the dictionary source: ${file}`);
  const words = new Map<string, Set<string>>();
  const mmWords = new Set<string>();
  const examples: KaikkiExample[] = [];
  let lines = 0;
  const rl = readline.createInterface({ input: fs.createReadStream(file, { encoding: 'utf8' }), crlfDelay: Infinity });
  for await (const line of rl) {
    if (line.trim() === '') continue;
    lines++;
    let e: RawEntry;
    try { e = JSON.parse(line) as RawEntry; } catch { continue; }
    if (typeof e.word !== 'string' || typeof e.pos !== 'string') continue;
    const word = e.word.normalize('NFC');
    if (!NOT_WORDS.has(e.pos) && THAI_WORD.test(word)) {
      let set = words.get(word);
      if (!set) { set = new Set(); words.set(word, set); }
      if (Array.isArray(e.sounds)) for (const s of e.sounds as RawSound[]) if (isPaiboon(s)) set.add(normRoman(s.roman as string));
      if (!NOT_FOR_MM.has(e.pos)) mmWords.add(word);
    }
    if (Array.isArray(e.senses)) {
      for (const sense of e.senses as RawSense[]) {
        if (!Array.isArray(sense.examples)) continue;
        for (const x of sense.examples as RawExample[]) {
          examples.push({
            headword: word,
            pos: e.pos,
            type: typeof x.type === 'string' ? x.type : 'example',
            text: typeof x.text === 'string' ? x.text : undefined,
            roman: typeof x.roman === 'string' ? x.roman : undefined,
            ref: typeof x.ref === 'string' ? x.ref : undefined,
          });
        }
      }
    }
  }
  return { file, lines, index: makeHeadwordIndex(words), mmWords, examples };
}
