/**
 * Hindi multiword units on the REAL adapter (word list + morphology engine + package H4's rules), over real sentences:
 * complex predicates with their irregular forms, compound verbs whose stem is a homograph, the causative of a light verb, and
 * the rule that a unit never holds a non-word token.
 */
import { describe, expect, it } from 'vitest';
import { hiAdapter } from '../../src/adapters/hi';

function units(sentence: string) {
  const tokens = hiAdapter.tokenize(sentence.normalize('NFC'));
  const analyses = hiAdapter.analyze(tokens);
  const found = hiAdapter.detectPhrases(tokens, analyses);
  return { tokens, found, byPattern: (p: string) => found.filter((u) => u.pattern.join(' ').normalize('NFC') === p.normalize('NFC')) };
}

describe('units found in real sentences', () => {
  const ROWS: Array<[string, string, number[]]> = [
    // noun + होना, and the compound verb inside it
    ['काम खत्म हो गया।', 'खत्म होना', [1, 2]],
    ['काम खत्म हो गया।', 'होना जाना', [2, 3]],
    ['वह ठीक हो जाता है।', 'ठीक होना', [1, 2]],
    ['वह ठीक हो जाता है।', 'होना जाना', [2, 3]],
    ['वह बड़ा हो गया।', 'बड़ा होना', [1, 2]],
    ['वह बड़ा हो गया।', 'होना जाना', [2, 3]],
    // compound verbs: any main verb, including a stem whose list reading is second
    ['मैं उसे भूल गया।', 'भूलना जाना', [2, 3]],
    ['उसने खेल लिया।', 'खेलना लेना', [1, 2]],
    ['उसने सुन लिया।', 'सुनना लेना', [1, 2]],
    ['मैं पढ़ चुका हूँ।', 'पढ़ना चुकना', [1, 2]],
    ['वह बैठ गया।', 'बैठना जाना', [1, 2]],
    ['उसने सब कह दिया।', 'कहना देना', [2, 3]],
    ['वह उठ बैठा।', 'उठना बैठना', [1, 2]],
    ['वह रो पड़ा।', 'रोना पड़ना', [1, 2]],
    ['वह चला गया।', 'चलना जाना', [1, 2]],
    ['वह आ जाता है।', 'आना जाना', [1, 2]],
    ['वह सो जाता है।', 'सोना जाना', [1, 2]],
    // the light verb in its irregular forms
    ['आप माफ़ कीजिए।', 'माफ़ करना', [1, 2]],
    ['आप याद कीजिए।', 'याद करना', [1, 2]],
    ['उसने मदद की।', 'मदद करना', [1, 2]],
    ['आप जवाब दीजिए।', 'जवाब देना', [1, 2]],
    ['आप सलाह लीजिए।', 'सलाह लेना', [1, 2]],
    ['उसने मुझे धन्यवाद दिया।', 'धन्यवाद देना', [2, 3]],
    ['उसे दर्द हुआ।', 'दर्द होना', [1, 2]],
    ['उसे बुखार हुआ।', 'बुखार होना', [1, 2]],
  ];
  it.each(ROWS)('%s → %s', (s, pattern, idx) => {
    const u = units(s).byPattern(pattern);
    expect(u.length, `${pattern} in ${s}`).toBeGreaterThanOrEqual(1);
    expect(u.map((x) => x.tokenIndexes)).toContainEqual(idx);
  });

  it('noun + हो गया reports the complex predicate AND the compound verb, never only होना जाना', () => {
    const r = units('काम खत्म हो गया।');
    expect(r.byPattern('खत्म होना')).toHaveLength(1);
    expect(r.byPattern('होना जाना')).toHaveLength(1);
  });
});

describe('the causative of a light verb is the causative of the unit', () => {
  it.each([
    ['वह काम शुरू कराता है।', 'शुरू कराना', 'कराना'],
    ['मैं उसकी मदद करवाता हूँ।', 'मदद करवाना', 'करवाना'],
  ])('%s', (s, base, causative) => {
    const u = units(s).byPattern(base);
    expect(u).toHaveLength(1);
    expect(u[0].display).toContain(causative);
    expect(u[0].gloss).toMatch(/^causative/u);
    expect(u[0].kind).toBe('collocation');
  });
  it('the plain verb is not called causative', () => {
    const u = units('आप माफ़ कीजिए।').byPattern('माफ़ करना');
    expect(u[0].gloss).not.toMatch(/causative/u);
  });
});

describe('a unit never holds a non-word token', () => {
  const SENTENCES = [
    'वह बार-बार आया।', 'वह उसके साथ-साथ चला।', 'काम खत्म हो गया।', 'उसने मदद की, और वह चला गया।', 'आप माफ़ कीजिए, मैं भूल गया।',
    'वह घर के लिए, पैसे लाया।', 'दिन-रात काम करना पड़ा।', 'कोई बात नहीं, ठीक है।',
  ];
  it.each(SENTENCES)('%s', (s) => {
    const r = units(s);
    for (const u of r.found) {
      for (const t of u.tokenIndexes) expect(r.tokens[t].isWord, `${u.pattern.join(' ')} holds "${r.tokens[t].surface}"`).toBe(true);
      expect([...u.tokenIndexes].sort((a, b) => a - b)).toEqual(u.tokenIndexes);
    }
  });
  it('the hyphenated repeated word is still found, on its two word tokens', () => {
    const u = units('वह बार-बार आया।').byPattern('बार-बार');
    expect(u).toHaveLength(1);
    expect(u[0].tokenIndexes).toEqual([1, 3]);
  });
});

describe('every light verb of the table is found in its irregular forms', async () => {
  const { HINDI_COMPLEX_PREDICATES } = await import('../../src/adapters/hindi/phrase-data');
  const FORMS: Record<string, string[]> = {
    'करना': ['किया', 'की', 'कीजिए', 'करो'], 'देना': ['दिया', 'दी', 'दीजिए', 'दो'], 'लेना': ['लिया', 'ली', 'लीजिए', 'लो'],
    'होना': ['हुआ', 'हुई', 'हुए'], 'जाना': ['गया', 'गई'], 'आना': ['आया', 'आई'], 'पड़ना': ['पड़ा', 'पड़ी'], 'लगना': ['लगा', 'लगी'], 'रखना': ['रखा', 'रखी'],
  };
  for (const [verb, forms] of Object.entries(FORMS)) {
    const rows = HINDI_COMPLEX_PREDICATES.filter((p) => p.verb.normalize('NFC') === verb.normalize('NFC')).slice(0, 4);
    for (const row of rows) {
      for (const form of forms) {
        it(`${row.noun} ${verb}: ${form}`, () => {
          const r = units(`${form === 'करो' || form === 'दो' || form === 'लो' ? 'तुम' : 'उसने'} ${row.noun} ${form}।`);
          const found = r.found.filter((u) => u.pattern[0].normalize('NFC') === row.noun.normalize('NFC') && u.pattern[1].normalize('NFC') === verb.normalize('NFC'));
          expect(found.length).toBeGreaterThanOrEqual(1);
        });
      }
    }
  }
});

describe('batch 2.4 - units', () => {
  it('a negation or particle between the noun and its light verb does not break the unit', () => {
    for (const [s, p] of [['तुम काम शुरू मत करो।', 'शुरू करना'], ['उसने गलती नहीं की।', 'गलती करना'], ['उसने मदद भी की।', 'मदद करना'], ['वह याद ही करता है।', 'याद करना'], ['उसे डर भी नहीं लगा।', 'डर लगना']] as const) {
      expect(units(s).byPattern(p).length, s).toBeGreaterThanOrEqual(1);
    }
  });
  it('X करना in the table makes X होना a unit by rule, and not the other way round', () => {
    expect(units('काम शुरू हुआ।').byPattern('शुरू होना')).toHaveLength(1);
    expect(units('पूजा हुई।').byPattern('पूजा होना').length).toBeGreaterThanOrEqual(1);
    expect(units('उसे दर्द हुआ।').byPattern('दर्द करना')).toHaveLength(0);
    expect(units('काम शुरू हुआ।').byPattern('शुरू होना')[0].gloss).toMatch(/intransitive|begin/u);
  });
  it('the causative is reported as the causative: the pattern holds the causative verb', () => {
    const u = units('वह काम शुरू कराता है।').found.filter((x) => x.pattern[0] === 'शुरू');
    expect(u.map((x) => x.pattern[1])).toContain('कराना');
    expect(u[0].gloss).toMatch(/causative of/u);
    expect(units('मैं उसकी मदद करवाता हूँ।').found.some((x) => x.pattern.join(' ') === 'मदद करवाना')).toBe(true);
  });
  it('noun + हो गया reports the complex predicate for the feeling and state nouns, with the case frame in the gloss', () => {
    const frames: Array<[string, string, RegExp]> = [
      ['उसे उससे प्यार हो गया।', 'प्यार होना', /से/u], ['मुझे उस पर शक हो गया।', 'शक होना', /पर/u], ['उसे डर हो गया।', 'डर होना', /से/u],
      ['मुझसे गलती हो गई।', 'ग\u093Cलती होना', /से/u], ['मुझे देर हो गई।', 'देर होना', /late/u], ['मुझे ज़रूरत हो गई।', 'ज़रूरत होना', /की/u],
      ['काम शुरू हो गया।', 'शुरू होना', /begin/u], ['काम खत्म हो गया।', 'खत्म होना', /end/u],
    ];
    for (const [s, p, g] of frames) {
      const u = units(s).byPattern(p);
      expect(u.length, `${p} in ${s}`).toBeGreaterThanOrEqual(1);
      expect(u[0].gloss, p).toMatch(g);
    }
  });
});
