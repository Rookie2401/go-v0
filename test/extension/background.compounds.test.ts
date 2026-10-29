// @vitest-environment node
/**
 * German forms the index lacks (2026-10-27): an inflected adjective, participle or dative plural is the remainder's lemma (one extra lookup),
 * and what is still missing is tried as a compound of words the index has (levels of lookups, a budget). A fake index stands for the real one.
 */
import { describe, expect, it } from 'vitest';
import { COMPOUND_BUDGET, leftVariants, retryEndings, splitCompounds } from '../../packages/golearn-extension/src/background/compounds';
import { createFormsService } from '../../packages/golearn-extension/src/background/forms';
import type { ShardFetch } from '../../packages/golearn-extension/src/background/gloss';

type Row = [lemma: string, pos: string];
const INDEX: Record<string, Row[]> = {
  zunft: [['Zunft', 'NOUN']], bürger: [['Bürger', 'NOUN']], feudal: [['feudal', 'ADJ']], herren: [['Herr', 'NOUN']],
  klasse: [['Klasse', 'NOUN']], gegensätze: [['Gegensatz', 'NOUN']], pfahl: [['Pfahl', 'NOUN']], schaft: [['Schaft', 'NOUN']],
  tausch: [['Tausch', 'NOUN']], mittel: [['Mittel', 'NOUN']], betrieb: [['Betrieb', 'NOUN']], weise: [['Weise', 'NOUN']],
  meister: [['Meister', 'NOUN']], ost: [['Ost', 'NOUN']], indische: [['indisch', 'ADJ']],
  für: [['für', 'ADP']], berlin: [['Berlin', 'PROPN']], sehr: [['sehr', 'ADV']],
  // inflected forms Wiktionary has no row for are found through the remainder
  kämpfend: [['kämpfen', 'VERB']], aufkommend: [['aufkommen', 'VERB']], anwachsend: [['anwachsen', 'VERB']], gegenüberstehend: [['gegenüberstehen', 'VERB']],
  klassenkämpfe: [['Klassenkampf', 'NOUN']], hervorgegangen: [['hervorgehen', 'VERB']], gekannt: [['kennen', 'VERB']], schön: [['schön', 'ADJ']],
};
/** Letters-only forms of 15 letters whose every possible right part (4 letters or more) is unique to the form. */
const unique = (n: number): string[] => Array.from({ length: n }, (_, i) => `abcdefghijkl${String.fromCharCode(97 + (i % 26))}${String.fromCharCode(97 + Math.floor(i / 26))}z`);
const lookupOf = (index: Record<string, Row[]> = INDEX, calls: string[][] = []) => async (forms: string[]) => {
  calls.push([...forms]);
  const out = new Map<string, Array<{ lemma: string; pos?: string }>>();
  for (const f of forms) if (Object.prototype.hasOwnProperty.call(index, f)) out.set(f, index[f].map(([lemma, pos]) => ({ lemma, pos })));
  return out;
};

const NINE: Record<string, [string, string]> = {
  zunftbürger: ['Zunftbürger', 'NOUN'], feudalherren: ['Feudalherr', 'NOUN'], klassengegensätze: ['Klassengegensatz', 'NOUN'],
  pfahlbürger: ['Pfahlbürger', 'NOUN'], pfahlbürgerschaft: ['Pfahlbürgerschaft', 'NOUN'], tauschmittel: ['Tauschmittel', 'NOUN'],
  betriebsweise: ['Betriebsweise', 'NOUN'], zunftmeister: ['Zunftmeister', 'NOUN'], ostindische: ['ostindisch', 'ADJ'],
};

describe('the compound split', () => {
  it('resolves the nine compounds to their own lemmas, with linking elements and a three-part compound (depth 2)', async () => {
    const r = await splitCompounds(Object.keys(NINE), lookupOf());
    expect(Object.fromEntries(r.found)).toEqual(NINE);
    expect(r.unanswered.size).toBe(0);
  });

  it('leaves non-German words and words with no valid split alone', async () => {
    const r = await splitCompounds(['righteous', 'flourish', 'אֱלֹהִים', 'xyzzyxyzzy'], lookupOf());
    expect(r.found.size).toBe(0);
    expect(r.unanswered.size).toBe(0);
  });

  it('never splits with a closed-class word on the left, a proper noun or a non-noun/adjective on the right, or parts below the limits', async () => {
    const r = await splitCompounds(['fürmeister', 'zunftberlin', 'zunftsehr', 'ostbür', 'zumeister'], lookupOf());
    expect(r.found.size).toBe(0);
  });

  it('a linking element is taken off the left part only to look it up; the lemma keeps the left part as written', () => {
    expect(leftVariants('klassen')).toEqual(['klassen', 'klass', 'klasse']);
    expect(leftVariants('betriebs')).toEqual(['betriebs', 'betrieb']);
    expect(leftVariants('feudal')).toEqual(['feudal']);
    expect(leftVariants('ees')).toEqual(['ees']); // never below 3 letters
  });

  it('asks one lookup per level and never more than the budget in distinct strings; forms the budget did not reach are unanswered, not absent', async () => {
    const calls: string[][] = [];
    const forms = unique(40);
    const r = await splitCompounds(forms, lookupOf({}, calls));
    expect(calls).toHaveLength(1); // nothing was valid at level 1, so no further level
    const strings = calls.flat();
    expect(strings.length).toBe(r.looked);
    expect(r.looked).toBeLessThanOrEqual(COMPOUND_BUDGET);
    expect(new Set(strings).size).toBe(strings.length);
    expect(r.found.size).toBe(0);
    expect(r.unanswered.size).toBeGreaterThan(0);
    expect(r.unanswered.size).toBeLessThan(forms.length);
    // the full compound task, in levels: right parts, left parts, then depth 2 (right parts, left parts)
    const levels: string[][] = [];
    await splitCompounds(['pfahlbürgerschaft'], lookupOf(INDEX, levels));
    expect(levels.length).toBeLessThanOrEqual(4);
    expect(levels.flat().length).toBeLessThanOrEqual(COMPOUND_BUDGET);
  });
});

describe('the ending retry', () => {
  it('finds inflected participles and adjectives and the dative plural through the remainder, in one call', async () => {
    const calls: string[][] = [];
    const r = await retryEndings(['kämpfenden', 'aufkommenden', 'anwachsenden', 'gegenüberstehende', 'klassenkämpfen', 'hervorgegangenen', 'gekanntes', 'schöner'], lookupOf(INDEX, calls));
    expect(calls).toHaveLength(1);
    expect(Object.fromEntries(r)).toEqual({
      kämpfenden: ['kämpfen', 'VERB'], aufkommenden: ['aufkommen', 'VERB'], anwachsenden: ['anwachsen', 'VERB'], gegenüberstehende: ['gegenüberstehen', 'VERB'],
      klassenkämpfen: ['Klassenkampf', 'NOUN'], hervorgegangenen: ['hervorgehen', 'VERB'], gekanntes: ['kennen', 'VERB'], schöner: ['schön', 'ADJ'],
    });
  });

  it('accepts a verb remainder only as a participle, a noun only for the dative plural, and nothing under four letters', async () => {
    const index: Record<string, Row[]> = { laufen: [['laufen', 'VERB']], haus: [['Haus', 'NOUN']], hause: [['Haus', 'NOUN']], klein: [['klein', 'ADJ']], gekannt: [['kennen', 'VERB']] };
    const r = await retryEndings(['laufene', 'hausen', 'hauser', 'kleinen', 'gekannten', 'haue'], lookupOf(index));
    expect(Object.fromEntries(r)).toEqual({ hausen: ['Haus', 'NOUN'], kleinen: ['klein', 'ADJ'], gekannten: ['kennen', 'VERB'] });
    // 'laufene' (a plain infinitive + e) and 'hauser' (a noun + er) are not inflections; 'haue' has a remainder of three letters
  });

  it('English words and Hebrew stay unresolved', async () => {
    const r = await retryEndings(['righteous', 'flourish', 'blessedness', 'אֱלֹהִים'], lookupOf());
    expect(r.size).toBe(0);
  });
});

describe('through the forms service', () => {
  const fetchStub = Object.assign(async () => new Response('{}', { status: 200 }), { failures: 0, network: async () => new Response('{}', { status: 200 }) }) as unknown as ShardFetch;
  const make = (index: Record<string, Row[]> = INDEX) => {
    const calls: string[][] = [];
    const svc = createFormsService({
      gloss: { dictionaryAt: async (lang: string) => ({ ok: true as const, base: 'https://x.example/', rel: `dict/${lang}`, source: 'hosted' as const, fetch: fetchStub }) },
      createSource: () => ({ lang: 'de', lookupForms: lookupOf(index, calls) }) as never,
    });
    return { svc, calls };
  };

  it('the index first; then endings (one extra call); then compounds on what is still missing', async () => {
    const { svc, calls } = make();
    const r = await svc.confirm({ languageId: 'de', forms: ['zunft', 'kämpfenden', 'klassenkämpfen', 'zunftbürger', 'pfahlbürgerschaft', 'righteous', 'flourish', 'אֱלֹהִים'] });
    expect(r.reason).toBeUndefined();
    expect(r.forms).toEqual({
      zunft: ['Zunft', 'NOUN'], kämpfenden: ['kämpfen', 'VERB'], klassenkämpfen: ['Klassenkampf', 'NOUN'], zunftbürger: ['Zunftbürger', 'NOUN'],
      pfahlbürgerschaft: ['Pfahlbürgerschaft', 'NOUN'], righteous: null, flourish: null, 'אֱלֹהִים': null,
    });
    expect(calls[0]).toHaveLength(8); // the index lookup is the whole request
    expect(calls.length).toBeLessThanOrEqual(2 + 4);
    expect(calls.flat().filter((s) => s === 'kämpfend')).toHaveLength(1);
  });

  it('a form the index has is never re-derived: its parts and remainders are not even asked for', async () => {
    const index: Record<string, Row[]> = { ...INDEX, kämpfenden: [['kämpfend', 'ADJ']], zunftbürger: [['Zunftbürger', 'NOUN']] };
    const { svc, calls } = make(index);
    const r = await svc.confirm({ languageId: 'de', forms: ['kämpfenden', 'zunftbürger'] });
    expect(r.forms).toEqual({ kämpfenden: ['kämpfend', 'ADJ'], zunftbürger: ['Zunftbürger', 'NOUN'] });
    expect(calls).toHaveLength(1);
  });

  it('only German: another language\'s misses are answered null with no extra lookup', async () => {
    const { svc, calls } = make();
    const r = await svc.confirm({ languageId: 'es', forms: ['zunftbürger'] });
    expect(r.forms).toEqual({ zunftbürger: null });
    expect(calls).toHaveLength(1);
  });

  it('forms the compound budget did not reach are left out of the reply (asked again later), never reported absent', async () => {
    const { svc } = make({});
    const forms = unique(60);
    const r = await svc.confirm({ languageId: 'de', forms });
    const answered = Object.keys(r.forms);
    expect(answered.length).toBeGreaterThan(0);
    expect(answered.length).toBeLessThan(forms.length);
    expect(Object.values(r.forms).every((v) => v === null)).toBe(true);
  });
});
