/**
 * Compounds and the new structural factors in the personal difficulty (contract v9): a compound whose whole word the learner
 * does not know has its parts known / partly known / unknown (opaque); shares do not change; the `new-words` factor
 * sets apart the compounds he has never met whose parts he knows (an estimate, said as one); the new factors appear only when the profile's features carry them.
 *
 * The first block pins today's behaviour with literal values taken from the code BEFORE this change: a profile with none of the
 * new data must score exactly as it did, and those values must never be edited to make a later change pass.
 */
import { describe, expect, it } from 'vitest';
import { buildFixtureText, ids } from '../../src/core';
import type { PersonalDifficulty, ProfileScore, TextFeatures, TextProfile } from '../../src/core';
import { createHarness } from './harness';
import type { Harness } from './harness';
import { buildChapter, t } from './courseFixtures';
import { feat, profile } from './profiles';

const U = 'u1';

describe('a profile with none of the new data scores exactly as before', () => {
  it('the same score, byte for byte, as the code before this change gave', async () => {
    const h = createHarness();
    const BASE = ids.text('es', 'base');
    await buildChapter(h.store, {
      slug: 'base', work: 'w1', chapter: 1, sentences: [
        { tokens: [t('sol', 'sol', 'NOUN'), t('habla', 'hablar', 'VERB')] },
        { tokens: [t('sol', 'sol', 'NOUN'), t('habla', 'hablar', 'VERB')] },
        { tokens: [t('sol', 'sol', 'NOUN'), t('mar', 'mar', 'NOUN')] },
        { tokens: [t('mar', 'mar', 'NOUN'), t('luna', 'luna', 'NOUN')] },
        { tokens: [t('mar', 'mar', 'NOUN'), t('casa', 'casa', 'NOUN')] },
        { tokens: [t('mar', 'mar', 'NOUN'), t('casa', 'casa', 'NOUN')] },
      ],
    });
    await h.understood(U, 'es', BASE, [0, 1], 'a');
    await h.view(U, 'es', BASE, 2, 'a');
    await h.view(U, 'es', BASE, 3, 'a');
    await h.view(U, 'es', BASE, 4, 'b');
    const p = profile('text:es:p1', [['sol', 20], ['habla', 10], ['mar', 10], ['luna', 5], ['casa', 5], ['rio', 10]], {
      lemmas: [['hablar:VERB', 20]], phrases: [['sol mar', 3]], patterns: [['subjunctive', 2]],
      features: { subjunctiveShare: 0.1, cliticShare: 0.05, subordinatorsPerSentence: 1.2, properNounShare: 0.01, unanalysedShare: 0.03, varietyShare: { 'es-hist': 0.1, 'es-ES': 0.03 } },
    });
    const s = await h.golearn.scoreProfile(U, p, { variety: 'es-HN' });
    expect(JSON.stringify(s)).toBe('{"textId":"text:es:p1","knownShare":0.5,"familiarShare":0,"metShare":0.3333333333333333,"newShare":0.16666666666666666,"newForms":1,"weakItems":[],"newPatterns":["pattern:es:subjunctive"],"newPhrases":["phrase:es:sol_mar"],"personal":{"label":"hard","lexicalCoverage":0.5,"factors":[{"key":"lexical-coverage","level":"high","note":"About 50.0 % of its words are shown understood or likely familiar (an estimate)."},{"key":"new-words","level":"high","note":"1 word (16.7 % of the words) you have not met."},{"key":"phrases","level":"high","note":"1 of its 1 phrase are new to you."},{"key":"constructions","level":"moderate","note":"1 construction you have not met."},{"key":"sentence-length","level":"low","note":"Sentences average 10 words."},{"key":"clause-depth","level":"high","note":"About 1.2 subordinating words per sentence."},{"key":"subjunctive","level":"high","note":"10.0 % of the words are subjunctive forms."},{"key":"clitics","level":"moderate","note":"5.0 % of the words carry or are attached pronouns."},{"key":"regional","level":"moderate","note":"3.0 % of the words are marked as belonging to another variety of the language."},{"key":"historical","level":"high","note":"10.0 % of the words are in older Spanish."},{"key":"proper-names","level":"low","note":"1.0 % of the words are names."},{"key":"unanalysed","level":"moderate","note":"3.0 % of the words could not be analysed."}],"caveats":["No frequency data: \'new\' means not yet met by you, not uncommon."]}}');
    expect(s).not.toHaveProperty('compounds');
  });
});

const L = (w: string, pos: 'NOUN' | 'VERB' = 'NOUN') => ids.lemma('de', w, pos);
const F = (w: string) => ids.form('de', w);

/**
 * The learner knows (by his own mark) der, gehen, Leben, Versicherung, Haus, Bahnhof and the form bahnhof; Aufgabe he has met once
 * (a sentence he viewed), which is not the same as knowing it.
 */
async function learner(): Promise<Harness> {
  const h = createHarness();
  await buildFixtureText(h.store, { lang: 'de', slug: 'basis', sentences: [{ tokens: [{ surface: 'Aufgabe', lemma: 'Aufgabe', pos: 'NOUN' }] }] });
  await h.view(U, 'de', ids.text('de', 'basis'), 0);
  for (const f of ['der', 'gehen', 'bahnhof']) await h.mark(U, 'de', F(f), 'known');
  for (const l of ['Leben', 'Versicherung', 'Haus', 'Bahnhof']) await h.mark(U, 'de', L(l), 'known', 'lemma');
  return h;
}

const compoundProfile = (over: Partial<TextProfile> = {}, features: Partial<TextFeatures> = {}): TextProfile => ({
  textId: 'text:de:k', lang: 'de', analyzers: ['adapter-test@1'], words: 100,
  forms: [['der', 80], ['bahnhof', 4], ['gehen', 10], ['lebensversicherung', 3], ['hausaufgabe', 2], ['kühlschrank', 1]],
  lemmas: [], phrases: [], patterns: [],
  compounds: [
    [L('Lebensversicherung'), [L('Leben'), L('Versicherung')], 3],
    [L('Hausaufgabe'), [L('Haus'), L('Aufgabe')], 2],
    [L('Kühlschrank'), [L('kühl', 'NOUN'), L('Schrank')], 1],
    [L('Bahnhof'), [L('Bahn'), L('Hof')], 4], // known whole: not a new compound
  ],
  features: feat({ words: 100, uniqueForms: 6, ...features }),
  ...over,
});
const without = (p: TextProfile): TextProfile => { const { compounds, ...rest } = p; void compounds; return rest; };
const factor = (s: ProfileScore, key: PersonalDifficulty['factors'][number]['key']) => s.personal.factors.find((f) => f.key === key);

describe('compounds the learner does not know as wholes', () => {
  it('parts known when every part is known, partial when some, opaque when none; a known whole is not a new compound', async () => {
    const h = await learner();
    const s = await h.golearn.scoreProfile(U, compoundProfile());
    // Lebensversicherung: Leben + Versicherung known. Hausaufgabe: Haus known, Aufgabe only met. Kühlschrank: nothing known.
    expect(s.compounds).toEqual({ partsKnown: 1, partial: 1, opaque: 1 });
  });

  it('a part he has only met (or met with help) is not a known part: the same test the shares use', async () => {
    const h = await learner();
    const p = compoundProfile({ compounds: [[L('Hausaufgabe'), [L('Haus'), L('Aufgabe')], 2]] });
    expect((await h.golearn.scoreProfile(U, p)).compounds).toEqual({ partsKnown: 0, partial: 1, opaque: 0 });
    await h.mark(U, 'de', L('Aufgabe'), 'known', 'lemma');
    expect((await h.golearn.scoreProfile(U, p)).compounds).toEqual({ partsKnown: 1, partial: 0, opaque: 0 });
  });

  it('a compound that names no parts is opaque', async () => {
    const h = await learner();
    const s = await h.golearn.scoreProfile(U, compoundProfile({ compounds: [[L('Kühlschrank'), [], 1]] }));
    expect(s.compounds).toEqual({ partsKnown: 0, partial: 0, opaque: 1 });
  });

  it('the shares do not change: a compound whose parts he knows is not counted as known', async () => {
    const h = await learner();
    const withC = await h.golearn.scoreProfile(U, compoundProfile());
    const plain = await h.golearn.scoreProfile(U, without(compoundProfile()));
    for (const k of ['knownShare', 'familiarShare', 'metShare', 'newShare', 'newForms'] as const) expect(withC[k], k).toBe(plain[k]);
    expect(withC.knownShare).toBeCloseTo(0.94, 10);
    expect(withC.newShare).toBeCloseTo(0.06, 10);
    expect(withC.personal.label).toBe(plain.personal.label);
    expect(withC.personal.lexicalCoverage).toBe(plain.personal.lexicalCoverage);
  });

  it('a profile with no compounds has no `compounds` field and no compounds factor', async () => {
    const h = await learner();
    const s = await h.golearn.scoreProfile(U, without(compoundProfile()));
    expect(s).not.toHaveProperty('compounds');
    expect(factor(s, 'compounds')).toBeUndefined();
  });
});

describe('the new-words factor', () => {
  it('leaves out the compounds he has never met but could read: 6 % of the words become 3 %', async () => {
    const h = await learner();
    const withC = await h.golearn.scoreProfile(U, compoundProfile());
    const plain = await h.golearn.scoreProfile(U, without(compoundProfile()));
    expect(factor(plain, 'new-words')).toMatchObject({ level: 'moderate', note: '3 words (6.0 % of the words) you have not met.' });
    expect(factor(withC, 'new-words')).toMatchObject({ level: 'low', note: '2 words (3.0 % of the words) you have not met, not counting 1 compound whose parts you know.' });
  });

  it('only a compound whose whole word he has never met is taken out of the new count; one he has met is already not new', async () => {
    const h = await learner();
    await buildFixtureText(h.store, { lang: 'de', slug: 'treffen', sentences: [{ tokens: [{ surface: 'Lebensversicherung', lemma: 'Lebensversicherung', pos: 'NOUN' }] }] });
    await h.view(U, 'de', ids.text('de', 'treffen'), 0);
    const s = await h.golearn.scoreProfile(U, compoundProfile());
    expect(s.compounds).toEqual({ partsKnown: 1, partial: 1, opaque: 1 }); // its parts are known; he still does not KNOW the whole
    expect(factor(s, 'new-words')?.note).toBe('2 words (3.0 % of the words) you have not met.'); // its form is met now, so it is not new, and it is not taken out a second time
  });

  it('with nothing else new, it says so: only compounds he could read', async () => {
    const h = await learner();
    const p = compoundProfile({
      forms: [['der', 97], ['lebensversicherung', 3]], compounds: [[L('Lebensversicherung'), [L('Leben'), L('Versicherung')], 3]], features: feat({ words: 100, uniqueForms: 2 }),
    });
    expect(factor(await h.golearn.scoreProfile(U, p), 'new-words')).toMatchObject({ level: 'low', note: 'No word in it is new to you, apart from 1 compound whose parts you know.' });
  });

  it('says that knowing the parts is an estimate, not knowledge of the whole — and only when it used that estimate', async () => {
    const h = await learner();
    const withC = await h.golearn.scoreProfile(U, compoundProfile());
    expect(withC.personal.caveats.join(' ')).toMatch(/treated as probably readable\. That is an estimate from its parts: the whole can mean something its parts do not say, and it is not counted as a word you know/);
    const plain = await h.golearn.scoreProfile(U, without(compoundProfile()));
    expect(plain.personal.caveats.join(' ')).not.toMatch(/probably readable/);
    // the whole compound itself is still unknown to the learner model
    expect((await h.golearn.getItemState(U, L('Lebensversicherung')))?.encounterCount ?? 0).toBe(0);
  });
});

describe('the compounds factor', () => {
  it('says in words what there is, and its level follows the share of partial and opaque ones', async () => {
    const h = await learner();
    const s = await h.golearn.scoreProfile(U, compoundProfile());
    // Hausaufgabe (2 words, partial) and Kühlschrank (1 word, opaque) are 3 of the 100 words: 3 %
    expect(factor(s, 'compounds')).toEqual({ key: 'compounds', level: 'moderate', note: '3 new compounds: 1 made of words you know, 2 not.' });
    const many = await h.golearn.scoreProfile(U, compoundProfile({ compounds: [[L('Kühlschrank'), [L('kühl'), L('Schrank')], 5]] }));
    expect(factor(many, 'compounds')).toEqual({ key: 'compounds', level: 'high', note: '1 new compound: 0 made of words you know, 1 not.' }); // 5 %
    // one opaque compound in a long text must not read "high": the level follows the share of the text's words
    const long = compoundProfile({ compounds: [[L('Kühlschrank'), [L('kühl'), L('Schrank')], 1]], forms: [['der', 399], ['kühlschrank', 1]] });
    expect(factor(await h.golearn.scoreProfile(U, long), 'compounds')).toEqual({ key: 'compounds', level: 'low', note: '1 new compound: 0 made of words you know, 1 not.' });
    const easy = await h.golearn.scoreProfile(U, compoundProfile({ compounds: [[L('Lebensversicherung'), [L('Leben'), L('Versicherung')], 3]] }));
    expect(factor(easy, 'compounds')).toEqual({ key: 'compounds', level: 'low', note: '1 new compound: 1 made of words you know, 0 not.' });
    const mixed = await h.golearn.scoreProfile(U, compoundProfile({ compounds: [
      [L('Lebensversicherung'), [L('Leben'), L('Versicherung')], 3], [L('Hausaufgabe'), [L('Haus'), L('Aufgabe')], 2], [L('Hausversicherung'), [L('Haus'), L('Versicherung')], 1],
    ] }));
    expect(factor(mixed, 'compounds')).toMatchObject({ level: 'moderate', note: '3 new compounds: 2 made of words you know, 1 not.' }); // 1 of 3
  });

  it('is absent when every compound of the profile is already known', async () => {
    const h = await learner();
    const s = await h.golearn.scoreProfile(U, compoundProfile({ compounds: [[L('Bahnhof'), [L('Bahn'), L('Hof')], 4]] }));
    expect(s.compounds).toEqual({ partsKnown: 0, partial: 0, opaque: 0 });
    expect(factor(s, 'compounds')).toBeUndefined();
  });

  it('reads item rows by id: the compounds add their own lemma ids to the batch and nothing else', async () => {
    const h = await learner();
    const reads: string[][] = [];
    const original = h.store.learnerItems.getMany.bind(h.store.learnerItems);
    h.store.learnerItems.getMany = (async (idList: string[]) => { reads.push(idList); return original(idList); }) as typeof h.store.learnerItems.getMany;
    await h.golearn.scoreProfile(U, compoundProfile());
    const asked = new Set(reads.flat());
    for (const l of ['Lebensversicherung', 'Leben', 'Versicherung', 'Haus', 'Aufgabe', 'Kühlschrank']) expect(asked.has(`${U}|${L(l)}`), l).toBe(true);
  });
});

describe('the factors the features add, each only when its feature is present', () => {
  const factorsOf = async (features: Partial<TextFeatures>) => {
    const h = await learner();
    return (await h.golearn.scoreProfile(U, without(compoundProfile({}, features)))).personal.factors;
  };
  const keys = (fs: PersonalDifficulty['factors']) => fs.map((f) => f.key);

  it('none of them without their features', async () => {
    const k = keys(await factorsOf({}));
    for (const x of ['compounds', 'verb-bracket', 'genitive', 'passive', 'relative-clauses', 'participial-modifiers', 'nominalizations', 'older-spelling']) expect(k, x).not.toContain(x);
  });

  it.each([
    ['verb-bracket', { bracketDistance: 2.5 }, 'moderate', 'Between the two parts of a verb there are 2.5 words on average.'],
    ['verb-bracket', { bracketDistance: 1 }, 'low', 'Between the two parts of a verb there are 1.0 words on average.'],
    ['verb-bracket', { bracketDistance: 8 }, 'high', 'Between the two parts of a verb there are 8.0 words on average.'],
    ['genitive', { genitiveShare: 0.05 }, 'moderate', '5.0 % of the words are in the genitive.'],
    ['passive', { passivePerSentence: 0.5 }, 'high', 'About 0.50 passive constructions per sentence.'],
    ['relative-clauses', { relativePerSentence: 0.3 }, 'moderate', 'About 0.30 relative clauses per sentence.'],
    ['participial-modifiers', { participialPerSentence: 0.02 }, 'low', 'About 0.02 participle phrases describing a noun per sentence.'],
    ['nominalizations', { nominalizationShare: 0.1 }, 'high', '10.0 % of the words are nouns made from verbs or adjectives.'],
    ['older-spelling', { historicalSpellingShare: 0.2 }, 'high', '20.0 % of the words are written in an older spelling.'],
  ] as const)('%s from %j: level %s', async (key, features, level, note) => {
    const f = (await factorsOf(features)).find((x) => x.key === key);
    expect(f).toEqual({ key, level, note });
  });

  it('a measured zero is not a factor (like the subjunctive and the clitics): nothing to say', async () => {
    const k = keys(await factorsOf({ genitiveShare: 0, passivePerSentence: 0, historicalSpellingShare: 0, nominalizationShare: 0 }));
    for (const x of ['genitive', 'passive', 'nominalizations', 'older-spelling']) expect(k, x).not.toContain(x);
  });

  it('they are said in words and do not move the label, which rests on coverage alone, like every structural factor', async () => {
    const h = await learner();
    const plain = await h.golearn.scoreProfile(U, without(compoundProfile()));
    const heavy = await h.golearn.scoreProfile(U, compoundProfile({}, {
      bracketDistance: 9, genitiveShare: 0.2, passivePerSentence: 1, relativePerSentence: 1, participialPerSentence: 1, nominalizationShare: 0.3, historicalSpellingShare: 0.5,
    }));
    expect(heavy.personal.label).toBe(plain.personal.label);
    expect(heavy.personal.factors.length).toBeGreaterThan(plain.personal.factors.length + 6);
  });
});

describe('the forecast says how many new compounds the learner could read', () => {
  it('names the ones whose parts he knows in its summary (a ForecastItem has no field for a note), and says nothing when there are none', async () => {
    const h = createHarness();
    await buildFixtureText(h.store, { lang: 'de', slug: 'basis', sentences: [{ tokens: [{ surface: 'Leben', lemma: 'Leben', pos: 'NOUN' }, { surface: 'Versicherung', lemma: 'Versicherung', pos: 'NOUN' }] }] });
    await buildFixtureText(h.store, { lang: 'de', slug: 'neu', sentences: [{ tokens: [{ surface: 'Lebensversicherung', lemma: 'Lebensversicherung', pos: 'NOUN' }, { surface: 'Kühlschrank', lemma: 'Kühlschrank', pos: 'NOUN' }] }] });
    const basis = ids.text('de', 'basis');
    const neu = ids.text('de', 'neu');
    const compound = async (tokenIndex: number, parts: Array<[string, string]>) => {
      const tokenId = ids.token(ids.sentence(neu, 0), tokenIndex);
      const row = (await h.store.analyses.where('tokenId', tokenId))[0];
      let at = 0;
      await h.store.analyses.put({ ...row, parts: parts.map(([text, kind], i) => {
        const part = { text, start: at, end: at + text.length, kind: kind as 'component' | 'head', ...(i === 0 || i === parts.length - 1 ? { lemma: text, pos: 'NOUN' as const } : {}) };
        at += text.length;
        return part;
      }) });
    };
    await compound(0, [['Leben', 'component'], ['Versicherung', 'head']]);
    await compound(1, [['Kühl', 'component'], ['Schrank', 'head']]);
    await h.understood(U, 'de', basis, [0], 's1');
    for (const w of ['Leben', 'Versicherung']) await h.mark(U, 'de', L(w), 'known', 'lemma');
    const f = await h.golearn.predictDifficulty(U, neu);
    expect(f.summary).toContain('1 new compound in it is made of words you know (the whole may still mean something new).');
    expect(f.personal?.factors.find((x) => x.key === 'compounds')?.note).toBe('2 new compounds: 1 made of words you know, 1 not.');

    // a learner who knows neither part: no sentence about it
    const g = createHarness();
    await buildFixtureText(g.store, { lang: 'de', slug: 'neu', sentences: [{ tokens: [{ surface: 'Kühlschrank', lemma: 'Kühlschrank', pos: 'NOUN' }] }] });
    expect((await g.golearn.predictDifficulty(U, neu)).summary).not.toContain('made of words you know');
  });
});
