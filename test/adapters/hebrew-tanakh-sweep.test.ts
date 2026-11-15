/**
 * Every verb reading of the Tanakh through the English realizer, where the full index is installed (public/lexicon/he/biblical is a generated asset, so on a
 * machine without it this file is skipped and says so). It holds the class of error the owner found ("I exalteded"), not one word: no English form is
 * malformed anywhere, none opens with a word that is not a verb, and the share of verb tokens with an English of their own does not fall.
 */
import fs from 'node:fs';
import path from 'node:path';
import zlib from 'node:zlib';
import { describe, expect, it } from 'vitest';
import { lemmaStem } from '../../src/adapters/hebrew/index-store';
import { decodeOshb, oshbParts } from '../../src/adapters/hebrew/oshb';
import { pointed } from '../../src/adapters/hebrew/text';
import { hebrewFormAnalysis } from '../../src/adapters/hebrew/form-analysis';
import { attachmentsOf, hebrewInflectedMeaning } from '../../src/adapters/hebrew/word-analysis';
import { isWellFormedEnglishVerb } from '../../src/core/english-verb';

const dir = path.resolve(__dirname, '../../public/lexicon/he/biblical');
const installed = fs.existsSync(dir) && fs.readdirSync(dir).some((f) => f.endsWith('.json.gz'));

describe.skipIf(!installed)('the whole Tanakh index', () => {
  it('writes no malformed English, keeps every letter in its cuts, and leaves few forms without English', { timeout: 300_000 }, () => {
    let tokens = 0, realized = 0, forms = 0, cuts = 0;
    const malformed: string[] = [], lostLetters: string[] = [];
    for (const f of fs.readdirSync(dir).filter((x) => x.endsWith('.json.gz'))) {
      const idx = JSON.parse(zlib.gunzipSync(fs.readFileSync(path.join(dir, f))).toString('utf8'));
      for (const [form, hits] of Object.entries<Array<[string, string, number, string?]>>(idx.forms)) for (const [chain, code, count, seg] of hits) {
        const r = decodeOshb(chain, code);
        if (r.pos !== 'VERB') continue;
        const row = idx.lemmas[lemmaStem(chain)];
        const parts = oshbParts(form, r, seg, row?.[0], r.pos);
        const text = hebrewInflectedMeaning(row?.[0], r.morph, row?.[1], attachmentsOf(parts));
        forms++;
        tokens += count;
        if (text) {
          realized += count;
          if (!isWellFormedEnglishVerb(text) || /\b(?:[a-z]+ed)ed\b|\b[a-z]+inging\b/.test(text.replace(/\b(?:needed|heeded|seeded|weeded|exceeded|proceeded|succeeded|preceded|singing|ringing|bringing|stinging|springing|clinging|flinging|slinging|swinging|wringing)\b/g, ''))) malformed.push(`${form} ${code}: ${text}`);
        }
        const analysis = hebrewFormAnalysis({ surface: form, lemma: row?.[0], pos: r.pos, lemmaGloss: row?.[1], morph: r.morph, parts, inflected: text });
        if (analysis) {
          if (analysis.components.some((c) => /verbal base/.test(c.role))) cuts++;
          if (analysis.components.map((c) => c.text).join('').normalize('NFC') !== pointed(form).normalize('NFC')) lostLetters.push(`${form} ${code}: ${analysis.components.map((c) => c.text).join(' | ')}`);
        }
      }
    }
    expect(malformed).toEqual([]);
    expect(lostLetters.slice(0, 20)).toEqual([]);
    expect(forms).toBeGreaterThan(20_000);
    expect(realized / tokens).toBeGreaterThan(0.995);
    expect(cuts).toBeGreaterThan(10_000);
  });
});
