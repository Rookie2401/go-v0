/**
 * Production checks on a learner's Bokmål (GoTell): dialect (a Nynorsk form), register (Riksmål / Dano-Norwegian spelling) and four cheap
 * agreement / word-order checks. The expectations are MACHINE-DRAFTED, pending native review (written by the model that built the
 * analyzer; not checked by a native speaker). The checks are marked not dependable in the adapter's support.
 */
import { describe, expect, it } from 'vitest';
import { adapter, applySuggestion, errors } from './helpers';

const nb = adapter('nb');
const fix = (text: string): string => {
  const e = errors('nb', text).filter((x) => x.suggestion).sort((a, b) => b.suggestion!.start - a.suggestion!.start);
  return e.reduce((t, x) => applySuggestion(t, x.suggestion!), text);
};

describe('production checks (Bokmål)', () => {
  it('is marked as not dependable and honest about it', () => {
    expect(nb.support.productionChecks).not.toBe('dependable');
    expect(nb.support.lemmatization).toBe('seed-only');
    expect(nb.support.limitations.length).toBeGreaterThanOrEqual(3);
    for (const l of nb.support.limitations) expect(l.length).toBeGreaterThan(20);
    expect(adapter('nn').support.limitations.length).toBeGreaterThanOrEqual(3);
  });

  it('a Nynorsk form in Bokmål writing is category dialect, with the Bokmål family member as the replacement', () => {
    for (const [bad, good] of [['ikkje', 'ikke'], ['eg', 'jeg'], ['kva', 'hva'], ['kvifor', 'hvorfor'], ['korleis', 'hvordan'], ['ho', 'hun'], ['dei', 'de'], ['noko', 'noe'], ['nokon', 'noen'], ['mykje', 'mye'], ['berre', 'bare'], ['frå', 'fra'], ['heim', 'hjem']]) {
      const text = `Vi sa ${bad} her.`;
      const e = errors('nb', text).find((x) => x.category === 'dialect');
      expect(e, bad).toBeDefined();
      expect(e!.suggestion!.replacement, bad).toBe(good);
      expect(text.slice(e!.suggestion!.start, e!.suggestion!.end)).toBe(bad);
      expect(e!.message).toMatch(/Nynorsk/);
      expect(e!.affectsMeaning).toBe(false);
    }
    expect(fix('Eg har ikkje tid.')).toBe('Jeg har ikke tid.');
  });

  it('words that are valid in both standards are never flagged (han, som, og, hus, ei)', () => {
    expect(errors('nb', 'Han og jeg bor i et hus som ei dame eier.')).toEqual([]);
  });

  it('a Riksmål or Dano-Norwegian spelling is category register, with the modern spelling', () => {
    for (const [bad, good] of [['efter', 'etter'], ['nu', 'nå'], ['sprog', 'språk'], ['sne', 'snø'], ['hvad', 'hva'], ['mig', 'meg'], ['bog', 'bok'], ['gade', 'gate']]) {
      const text = `Vi sa ${bad} her.`;
      const e = errors('nb', text).find((x) => x.category === 'register');
      expect(e, bad).toBeDefined();
      expect(e!.suggestion!.replacement, bad).toBe(good);
      expect(e!.message).toMatch(/Riksmål|Dano-Norwegian/);
    }
    expect(fix('Vi talte efter nu.')).toMatch(/etter nå/);
  });

  it('names are exempt from every check', () => {
    expect(errors('nb', 'Anna og Per bor i Oslo.')).toEqual([]);
    expect(errors('nb', 'Jeg møtte Anna i går.')).toEqual([]);
    expect(errors('nb', 'Vi møtte Silje og Mons.')).toEqual([]);
  });

  it('min bilen: a possessive before a definite noun (definiteness), with a certain fix', () => {
    const e = errors('nb', 'Min bilen er ny.');
    expect(e).toHaveLength(1);
    expect(e[0].category).toBe('definiteness');
    expect(fix('Min bilen er ny.')).toBe('Min bil er ny.');
    expect(e[0].message).toMatch(/bilen min/i);
    expect(fix('Jeg liker mine bøkene.')).toBe('Jeg liker mine bøker.');
    expect(errors('nb', 'Min bil er ny og bilen min er rød.')).toEqual([]);
    expect(errors('nb', 'Bilen min er ny.')).toEqual([]);
  });

  it('adjective agreement: neuter -t with et-nouns, no -t with en-nouns, and after være', () => {
    expect(fix('Vi har et stor hus.')).toBe('Vi har et stort hus.');
    expect(fix('Vi har en stort bil.')).toBe('Vi har en stor bil.');
    expect(fix('Huset er stor.')).toBe('Huset er stort.');
    expect(fix('Bilen er stort.')).toBe('Bilen er stor.');
    expect(errors('nb', 'Vi har et stort hus og en stor bil.')).toEqual([]);
    expect(errors('nb', 'Det er et viktig møte.')).toEqual([]); // -ig takes no -t
    for (const e of errors('nb', 'Vi har et stor hus.')) expect(e.category).toBe('agreement');
  });

  it('ikke after the verb in a subordinate clause (word-order)', () => {
    const e = errors('nb', 'Jeg vet at han kommer ikke.');
    expect(e).toHaveLength(1);
    expect(e[0].category).toBe('word-order');
    expect(fix('Jeg vet at han kommer ikke.')).toBe('Jeg vet at han ikke kommer.');
    expect(errors('nb', 'Jeg vet at han ikke kommer.')).toEqual([]);
    expect(errors('nb', 'Han kommer ikke.')).toEqual([]);
    expect(errors('nb', 'Jeg kommer ikke, for han kommer ikke.')).toEqual([]); // "for" is a main-clause conjunction
  });

  it('å and og before an infinitive', () => {
    expect(fix('Jeg liker og lese.')).toBe('Jeg liker å lese.');
    expect(fix('Det er viktig og hvile.')).toBe('Det er viktig å hvile.');
    expect(errors('nb', 'Jeg liker å lese og skrive.')).toEqual([]);
    expect(errors('nb', 'Hun sitter og leser.')).toEqual([]); // two conjugated verbs joined by og
    expect(errors('nb', 'Vi spiser og drikker.')).toEqual([]);
    const e = errors('nb', 'Jeg spiser å drikker.');
    expect(e.some((x) => x.suggestion?.replacement === 'og')).toBe(true);
  });

  it('says nothing about correct text', () => {
    for (const t of ['Jeg bor i Oslo.', 'Hun leser boka hver kveld.', 'Det store huset er gammelt.', 'Vi vet at de ikke kommer i dag.']) expect(errors('nb', t), t).toEqual([]);
  });

  it('suggestions have exact offsets into the sentence and keep capitalisation', () => {
    const t = 'Efter middagen gikk vi.';
    const e = errors('nb', t).find((x) => x.category === 'register')!;
    expect(t.slice(e.suggestion!.start, e.suggestion!.end)).toBe('Efter');
    expect(e.suggestion!.replacement).toBe('Etter');
  });

  it('the Nynorsk adapter does not check production', () => {
    const nn = adapter('nn');
    const t = 'Eg har ikkje tid.';
    const toks = nn.tokenize(t);
    expect(nn.checkProduction(toks, nn.analyze(toks), t)).toEqual([]);
    expect(nn.support.productionChecks).toBe('none');
  });
});
