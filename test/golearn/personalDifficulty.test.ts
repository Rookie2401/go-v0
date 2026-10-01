/** scoreProfile — personal difficulty of a text from its profile alone: lemma-aware shares, factors, caveats, and its cost. */
import { describe, expect, it } from 'vitest';
import { ids } from '../../src/core';
import { createHarness } from './harness';
import type { Harness } from './harness';
import { buildChapter, t, workRow, stageRow } from './courseFixtures';
import { feat, profile } from './profiles';

const U = 'u1';
const BASE = ids.text('es', 'base');
const F = (w: string) => ids.form('es', w);

/**
 * The learner: sol and habla (of the lemma hablar) shown understood; mar likely familiar (four help-free meetings in two sittings);
 * luna met once; casa met, with help once; rio, hablaban, cantaban never met.
 */
async function learner(h: Harness) {
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
  await h.help(U, 'es', BASE, 4, 1, F('casa'), 1, 'b');
  await h.view(U, 'es', BASE, 5, 'b');
}

/** The Spanish test adapter reads "hablaban" as a form of hablar and "cantaban" as a form of cantar. */
function teachAdapter(h: Harness) {
  const es = h.adapters.get('es');
  es.analyze = (tokens) => tokens.map((token) => ({
    token, analyzer: 'test@1',
    candidates: token.normalized === 'hablaban' ? [{ lemma: 'hablar', pos: 'VERB' as const, morph: {}, confidence: 0.9 }]
      : token.normalized === 'cantaban' ? [{ lemma: 'cantar', pos: 'VERB' as const, morph: {}, confidence: 0.9 }]
        : token.normalized === 'dudoso' ? [{ lemma: 'hablar', pos: 'VERB' as const, morph: {}, confidence: 0.3 }] : [],
  }));
}

const P1 = () => profile('text:es:p1', [['sol', 20], ['habla', 10], ['mar', 10], ['luna', 5], ['casa', 5], ['rio', 10], ['hablaban', 10], ['cantaban', 10]], { lemmas: [['hablar:VERB', 20]] });

async function setup() {
  const h = createHarness();
  await learner(h);
  teachAdapter(h);
  return h;
}

describe('shares of word tokens by the learner\'s state', () => {
  it('known, likely familiar, met and new, summing to 1', async () => {
    const h = await setup();
    const s = await h.golearn.scoreProfile(U, P1());
    expect(s.knownShare).toBeCloseTo(30 / 80, 6); // sol, habla
    expect(s.familiarShare).toBeCloseTo(10 / 80, 6); // mar (an estimate)
    expect(s.metShare).toBeCloseTo(20 / 80, 6); // luna, casa, and hablaban (see below)
    expect(s.newShare).toBeCloseTo(20 / 80, 6); // rio, cantaban
    expect(s.knownShare + s.familiarShare + s.metShare + s.newShare).toBeCloseTo(1, 9);
    expect(s.newForms).toBe(2);
    expect(s.textId).toBe('text:es:p1');
  });

  it('LEMMA-AWARE: an inflected form of a known verb is "met", not "new" — and not "known"', async () => {
    const h = await setup();
    const withLemma = await h.golearn.scoreProfile(U, P1());
    expect(withLemma.newForms).toBe(2); // rio and cantaban: hablaban is met through hablar
    // without the lemma in the profile there is nothing to link it to
    const plain = profile('text:es:p2', [['hablaban', 10], ['sol', 10]]);
    const a = await h.golearn.scoreProfile(U, plain);
    expect(a.newShare).toBeCloseTo(10 / 20, 6);
    // a lemma the learner has not met links nothing, and a reading below the confidence floor links nothing
    const b = await h.golearn.scoreProfile(U, profile('text:es:p3', [['cantaban', 10], ['dudoso', 10], ['sol', 20]], { lemmas: [['cantar:VERB', 10], ['hablar:VERB', 10]] }));
    expect(b.newShare).toBeCloseTo(20 / 40, 6);
    // knowing the verb does not show he understands this form
    expect(withLemma.knownShare).toBeCloseTo(30 / 80, 6);
  });

  it('weak items: words and phrases met with help and not yet shown; new phrases and constructions are listed', async () => {
    const h = await setup();
    const s = await h.golearn.scoreProfile(U, profile('text:es:p4', [['casa', 5], ['sol', 5], ['rio', 5]], { phrases: [['creo en _', 2]], patterns: [['preterite', 1]] }));
    expect(s.weakItems).toEqual([F('casa')]);
    expect(s.newPhrases).toEqual([ids.phrase('es', ['creo', 'en', '_'])]);
    expect(s.newPatterns).toEqual([ids.pattern('es', 'preterite')]);
  });

  it('an empty profile has no words to count: nothing known, label unknown', async () => {
    const h = await setup();
    const s = await h.golearn.scoreProfile(U, profile('text:es:empty', []));
    expect(s.personal.label).toBe('unknown');
    expect(s.personal.lexicalCoverage).toBeUndefined();
    expect(s.personal.caveats.join(' ')).toMatch(/no words/);
  });
});

describe('domain familiarity', () => {
  it('known share of the profile\'s words that also occur in texts of the same domain he has read', async () => {
    const h = await setup();
    await h.store.stages.put(stageRow(1, 'g1'));
    await h.store.works.put({ ...workRow('w1', 'g1'), domains: ['history'] });
    await h.store.works.put({ ...workRow('w2', 'g1'), domains: ['science'] });
    const prof = profile('text:es:p5', [['sol', 10], ['mar', 10], ['luna', 10], ['rio', 10]]);
    // sol, mar, luna were met in "base" (work w1, history): sol is known, mar familiar, luna only met
    const history = await h.golearn.scoreProfile(U, prof, { domains: ['history'] });
    expect(history.domainFamiliarity).toBeCloseTo(20 / 30, 6);
    expect(history.personal.factors.find((f) => f.key === 'domain')).toMatchObject({ level: 'moderate' });
    // no read texts in that domain, or no domain asked for: no claim
    expect((await h.golearn.scoreProfile(U, prof, { domains: ['science'] })).domainFamiliarity).toBeUndefined();
    expect((await h.golearn.scoreProfile(U, prof)).domainFamiliarity).toBeUndefined();
  });
});

describe('the personal difficulty: label, factors and caveats', () => {
  it('the label follows lexical coverage', async () => {
    const h = createHarness();
    await learner(h);
    const label = async (known: number, other: number) =>
      (await h.golearn.scoreProfile(U, profile('text:es:l', [['sol', known], ['rio', other]]))).personal;
    expect(await label(96, 4)).toMatchObject({ label: 'comfortable', lexicalCoverage: 0.96 });
    expect((await label(90, 10)).label).toBe('manageable');
    expect((await label(80, 20)).label).toBe('challenging');
    expect((await label(50, 50)).label).toBe('hard');
  });

  it('each factor that applies is reported with a level and a note; absent features add no factor', async () => {
    const h = await setup();
    const rich = await h.golearn.scoreProfile(U, profile('text:es:f', [['sol', 70], ['rio', 20], ['mar', 10]], {
      patterns: [['subjunctive', 1], ['past', 1], ['future', 1]], phrases: [['creo en _', 1]],
      features: feat({
        meanSentenceWords: 25, subordinatorsPerSentence: 1.4, subjunctiveShare: 0.05, cliticShare: 0.03, properNounShare: 0.1, unanalysedShare: 0.06,
        varietyShare: { 'es-ES': 0.1, 'es-hist': 0.06 },
      }),
    }), { variety: 'es-HN' });
    const by = Object.fromEntries(rich.personal.factors.map((f) => [f.key, f.level]));
    expect(by).toEqual({
      'lexical-coverage': 'high', 'new-words': 'high', phrases: 'high', constructions: 'high', 'sentence-length': 'high', 'clause-depth': 'high',
      subjunctive: 'high', clitics: 'moderate', regional: 'high', historical: 'high', 'proper-names': 'high', unanalysed: 'high',
    });
    for (const f of rich.personal.factors) expect(f.note.length).toBeGreaterThan(8);
    const plain = await h.golearn.scoreProfile(U, profile('text:es:g', [['sol', 100]], { features: feat({ meanSentenceWords: 8 }) }));
    expect(plain.personal.factors.map((f) => f.key)).toEqual(['lexical-coverage', 'new-words', 'sentence-length']);
    expect(plain.personal.factors.every((f) => f.level === 'low')).toBe(true);
  });

  it('caveats: no frequency data (always), little history, many unanalysed words', async () => {
    const h = await setup();
    const ok = await h.golearn.scoreProfile(U, profile('text:es:c1', [['sol', 10], ['mar', 5]]));
    expect(ok.personal.caveats).toEqual(["No frequency data: 'new' means not yet met by you, not uncommon."]);
    const unanalysed = await h.golearn.scoreProfile(U, profile('text:es:c2', [['sol', 10]], { features: feat({ unanalysedShare: 0.2 }) }));
    expect(unanalysed.personal.caveats.some((c) => /could not be analysed/.test(c))).toBe(true);
    // a learner with no history: the label says unknown and the caveat says why
    const fresh = createHarness();
    const s = await fresh.golearn.scoreProfile(U, profile('text:es:c3', Array.from({ length: 30 }, (_, i) => [`palabra${i}`, 5 as number] as [string, number])));
    expect(s.personal.label).toBe('unknown');
    expect(s.personal.caveats.some((c) => /read little/.test(c))).toBe(true);
  });
});

describe('cost', () => {
  it('reads item rows by id in batches: no scan of the learner\'s items or encounters, and no write', async () => {
    const h = await setup();
    const calls: string[] = [];
    for (const [name, table] of [['learnerItems', h.store.learnerItems], ['encounters', h.store.encounters]] as const) {
      for (const m of ['where', 'all', 'getMany', 'get'] as const) {
        const original = (table[m] as (...a: unknown[]) => Promise<unknown>).bind(table);
        (table as unknown as Record<string, unknown>)[m] = (...a: unknown[]) => { calls.push(`${name}.${m}`); return original(...a); };
      }
    }
    const big = profile('text:es:big', Array.from({ length: 1000 }, (_, i) => [`w${i}`, 3 as number] as [string, number]), { lemmas: [['hablar:VERB', 20]] });
    const events = (await h.store.events.all()).length;
    await h.golearn.scoreProfile(U, big);
    expect(calls.filter((c) => /where|all$/.test(c))).toEqual([]);
    expect(calls.filter((c) => c === 'learnerItems.getMany').length).toBeLessThanOrEqual(Math.ceil(1001 / 400) + 1);
    expect((await h.store.events.all()).length).toBe(events); // scoring is not exposure
  });

  it('is deterministic', async () => {
    const h = await setup();
    expect(JSON.stringify(await h.golearn.scoreProfile(U, P1()))).toBe(JSON.stringify(await h.golearn.scoreProfile(U, P1())));
  });
});
