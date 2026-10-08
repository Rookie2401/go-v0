/**
 * Compounds of the Norwegian analyzer: split only into lexicon-known parts, the head decides gender and inflection, the linking
 * element is named, the reading is unconfirmed at 0.55. The expectations are MACHINE-DRAFTED, pending native review (written by
 * the model that built the analyzer; not checked by a native speaker).
 */
import { describe, expect, it } from 'vitest';
import { decomposeCompound, NEVER_SPLIT } from '../../src/adapters/norwegian/compounds';
import { lexiconFor } from '../../src/adapters/norwegian/lexicon';
import { adapter, run } from './helpers';

const nb = adapter('nb');
const first = (w: string) => nb.analyze(nb.tokenize(w))[0].candidates[0];
const lex = lexiconFor('nb');

describe('compounds (Bokmål)', () => {
  it('an unknown compound is split into known parts and marked unconfirmed at 0.55', () => {
    const c = first('bilnøkkelen');
    expect(c).toMatchObject({ lemma: 'bilnøkkel', pos: 'NOUN', unconfirmed: true, confidence: 0.55 });
    expect(c.parts?.map((p) => [p.text, p.kind])).toEqual([['bil', 'component'], ['nøkkelen', 'head']]);
    expect(c.gloss).toBeUndefined();
    expect(c.morph).toMatchObject({ Gender: 'Masc', Definite: 'Def' });
  });

  it('the head decides gender and inflection: et kjøkkenbord, kjøkkenbordet', () => {
    const c = first('kjøkkenbordet');
    expect(c.lemma).toBe('kjøkkenbord');
    expect(c.morph).toMatchObject({ Gender: 'Neut', Definite: 'Def', Number: 'Sing' });
    expect(first('kjøkkenbord').morph.Gender).toBe('Neut');
    expect(first('fotballkamper').morph).toMatchObject({ Number: 'Plur' });
    expect(first('fotballkamper').lemma).toBe('fotballkamp');
  });

  it('linking elements -s- and -e- (and none) are named as parts of their own', () => {
    const s = decomposeCompound('arbeidstidene', lex)!;
    expect(s.parts.map((p) => [p.text, p.kind])).toEqual([['arbeid', 'component'], ['s', 'link'], ['tidene', 'head']]);
    expect(s.fuge).toEqual(['s']);
    const e = decomposeCompound('gutterommet', lex);
    expect(e).toBeDefined();
    expect(e!.fuge.length + e!.parts.filter((p) => p.kind === 'component').length).toBeGreaterThan(1);
    expect(decomposeCompound('bilnøkkel', lex)!.fuge).toEqual([]);
  });

  it('a compound the lexicon holds keeps its own lemma, confidence and gloss, with its parts beside it', () => {
    const c = first('barnehage');
    expect(c).toMatchObject({ lemma: 'barnehage', pos: 'NOUN' });
    expect(c.unconfirmed).toBeUndefined();
    expect(c.confidence).toBeGreaterThanOrEqual(0.9);
    expect(c.gloss).toBeTruthy();
    expect(c.parts?.map((p) => p.text).join('|')).toContain('barn');
  });

  it('never splits listed non-compounds', () => {
    for (const w of ['bilde', 'stolen', 'sykkel', 'ballett', 'fjern', 'kjæreste', 'tallerken', 'imidlertid', 'mandag']) {
      expect(decomposeCompound(w, lex), w).toBeUndefined();
      expect(NEVER_SPLIT.has(w), w).toBe(true);
      expect(first(w)?.unconfirmed, w).not.toBe(true);
    }
    expect(first('bilde').lemma).toBe('bilde');
    expect(first('bilde').parts).toBeUndefined();
  });

  it('never splits into function-word or too-short parts, or names, or words with unknown parts', () => {
    // "bilde" would be bil + de; "stolen" stol + en; "sentrum"; an unknown word with one unknown part
    expect(decomposeCompound('bilenes', lex)).toBeUndefined();
    expect(first('xqzbil')).toBeUndefined();
    expect(first('Pettersengata')?.lemma ?? 'Pettersengata').toBe('Pettersengata');
    expect(decomposeCompound('forhandlinger', lex)).toBeUndefined(); // for + handlinger: for is a function word
    expect(decomposeCompound('påbok', lex)).toBeUndefined();
  });

  it('a capitalised word in the middle of a sentence is a name, not a compound', () => {
    const r = run('nb', 'Jeg bor i Bilnøkkelby.');
    expect(r.analyses[3].candidates[0]?.pos).toBe('PROPN');
  });

  it('relate: a compound and its part are related as component, never as the same word', () => {
    expect(nb.relate('bilnøkkel', 'bil')).toBe('component');
    expect(nb.relate('bil', 'bilnøkkel')).toBe('component');
    expect(nb.relate('bil', 'buss')).toBe('none');
  });

  it('Nynorsk compounds follow the Nynorsk list', () => {
    const nn = adapter('nn');
    const c = nn.analyze(nn.tokenize('bilnøkkelen'))[0].candidates[0];
    expect(c).toMatchObject({ pos: 'NOUN', unconfirmed: true });
    expect(c.lemma).toBe('bilnøkkel');
  });
});
