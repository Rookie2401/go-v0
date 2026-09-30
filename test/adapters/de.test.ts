import { describe, expect, it } from 'vitest';
import { adapter, applySuggestion, best, errors, indexOf, patterns, phrases, run } from './helpers';
import { deNumberToWords } from '../../src/adapters/de';

const de = adapter('de');

describe('German adapter', () => {
  it('detects the separable verb anfangen across the sentence (fing … an)', () => {
    const r = run('de', 'Eines Tages fing ich an, meine Sünde zu verstehen.');
    const verb = best(r, 'fing');
    const part = best(r, 'an');
    expect(verb.lemma).toBe('anfangen');
    expect(verb.notes).toMatchObject({ separable: 'an' });
    expect(part.lemma).toBe('anfangen');
    expect(part.pos).toBe('VERB');
    expect(part.notes).toMatchObject({ separable: 'an', particleOf: String(indexOf(r, 'fing')) });
    const pat = patterns('de', r.text).find((p) => p.key === 'separable-prefix-verb');
    expect(pat?.tokenIndexes).toEqual([indexOf(r, 'fing'), indexOf(r, 'an')]);
    // the phrase "anfangen … zu verstehen" spans the gap
    expect(phrases('de', r.text).map((p) => p.pattern.join(' '))).toContain('anfangen zu verstehen');
  });

  it('leaves "an" a preposition when no separable verb precedes it', () => {
    expect(best(run('de', 'Ich glaubte nicht an Gott.'), 'an').pos).toBe('ADP');
    expect(best(run('de', 'Er steht an der Wand.'), 'an').pos).toBe('ADP');
  });

  it('gives case and gender for articles; ambiguous forms stay ambiguous (and less confident)', () => {
    const dem = best(run('de', 'mit dem Herzen'), 'dem');
    expect(dem.morph.Case).toBe('Dat');
    const der = best(run('de', 'der Mann'), 'der');
    expect(der.morph.Case.split(',').sort()).toEqual(['Dat', 'Gen', 'Nom']);
    expect(der.confidence).toBeLessThan(dem.confidence + 0.0001);
    expect(der.confidence).toBeLessThan(0.9);
    expect(best(run('de', 'in meinem Herzen'), 'meinem').morph).toMatchObject({ Case: 'Dat', Poss: 'Yes' });
    expect(best(run('de', 'der Mann'), 'Mann').morph).toMatchObject({ Gender: 'Masc', Number: 'Sing' });
  });

  it('records strong / weak / irregular verb class', () => {
    expect(best(run('de', 'ich verstand'), 'verstand').notes).toMatchObject({ class: 'strong' });
    expect(best(run('de', 'ich glaubte'), 'glaubte').notes).toMatchObject({ class: 'weak' });
    expect(best(run('de', 'ich hatte'), 'hatte').notes).toMatchObject({ class: 'irregular' });
  });

  it('reports compound components in notes but keeps the whole word as the form', () => {
    const r = run('de', 'das Gotteshaus');
    const t = r.tokens[1];
    expect(t.normalized).toBe('gotteshaus');
    const c = r.analyses[1].candidates[0];
    expect(c.notes).toMatchObject({ components: ['gott', 'haus'] });
    expect(c.lemma).toBeUndefined();
    expect(c.confidence).toBeLessThan(0.5); // a structural guess, flagged as such
    expect(run('de', 'Weltfrieden').analyses[0].candidates[0].notes).toMatchObject({ components: ['welt', 'friede'] });
    // not a compound of known nouns → nothing
    expect(run('de', 'Qwertzuiop').analyses[0].candidates).toEqual([]);
  });

  it('relate: same / inflection / component / none', () => {
    expect(de.relate('Sünde', 'sünde')).toBe('same');
    expect(de.relate('Sünde', 'Sünden')).toBe('inflection');
    expect(de.relate('glaube', 'glauben')).toBe('inflection');
    expect(de.relate('fing', 'anfangen')).toBe('inflection');
    expect(de.relate('Gotteshaus', 'Gott')).toBe('component');
    expect(de.relate('Haus', 'Gotteshaus')).toBe('component');
    expect(de.relate('Herz', 'Haus')).toBe('none');
  });

  it('detects the three target phrases in story and Bible word order', () => {
    expect(phrases('de', 'Als ich jung war, verstand ich mein Herz nicht.').map((p) => p.pattern.join(' '))).toContain('als _ jung sein');
    expect(phrases('de', 'Jetzt glaube ich an Gott.').map((p) => p.pattern.join(' '))).toContain('glauben an _');
    expect(phrases('de', 'Ich will auch an Gott glauben.').map((p) => p.pattern.join(' '))).toContain('glauben an _');
    expect(phrases('de', 'auf daß alle, die an ihn glauben, nicht verloren werden').map((p) => p.pattern.join(' '))).toContain('glauben an _');
  });

  it('detects verb-final subordinate clauses and dative after preposition', () => {
    expect(patterns('de', 'Ich weiß, dass Gott allen vergibt.').map((p) => p.key)).toContain('verb-final-subordinate');
    expect(patterns('de', 'Ja, ich glaube von ganzem Herzen an Gott.').map((p) => p.key)).toContain('dative-after-preposition');
  });

  it('segments sentences: ordinals and abbreviations do not break', () => {
    const t = 'Am 3. Mai kam er. Dr. Müller blieb. Was denn? Nichts.';
    expect(de.segmentSentences(t).map((s) => s.text)).toEqual(['Am 3. Mai kam er.', 'Dr. Müller blieb.', 'Was denn?', 'Nichts.']);
  });

  it('search normalization keeps umlauts', () => {
    expect(de.searchNormalize('  Sünde ')).toBe('sünde');
  });

  describe('checkProduction', () => {
    it('flags a non-dative article after a dative preposition and suggests from the noun gender', () => {
      const e = errors('de', 'mit die Mann');
      expect(e).toHaveLength(1);
      expect(e[0].category).toBe('case');
      expect(applySuggestion('mit die Mann', e[0].suggestion!)).toBe('mit dem Mann');
      expect(errors('de', 'mit dem Mann')).toEqual([]);
      expect(errors('de', 'zu den Häusern')).toEqual([]);
    });
    it('flags broken verb-second order with a swap suggestion', () => {
      const e = errors('de', 'Jetzt ich glaube an Gott.');
      expect(e.some((x) => x.category === 'word-order')).toBe(true);
      const w = e.find((x) => x.category === 'word-order')!;
      expect(applySuggestion('Jetzt ich glaube an Gott.', w.suggestion!)).toBe('Jetzt glaube ich an Gott.');
      expect(errors('de', 'Jetzt glaube ich an Gott.')).toEqual([]);
    });
    it('flags lower-case nouns', () => {
      const e = errors('de', 'ich liebe gott');
      expect(e.map((x) => x.category)).toContain('spelling');
      expect(applySuggestion('ich liebe gott', e.find((x) => x.category === 'spelling')!.suggestion!)).toBe('ich liebe Gott');
    });
    it('is silent on correct text and unknown words', () => {
      for (const s of ['Ich liebe Gott.', 'Als ich jung war, hatte ich Sünde in meinem Herzen.', 'Er kaufte eine Zeitung.']) expect(errors('de', s)).toEqual([]);
    });
  });

  describe('speechNormalize', () => {
    it('expands numbers, strips verse markers, expands abbreviations; leaves ordinals', () => {
      const r = de.speechNormalize('Er hat 25 Bücher [16] gelesen, z. B. 1999 und am 3. Mai.', { isScripture: false });
      expect(r.speechText).toBe('Er hat fünfundzwanzig Bücher gelesen, zum Beispiel eintausendneunhundertneunundneunzig und am 3. Mai.');
      expect(r.normalizerVersion).toBe('speech-de@1');
    });
    it('number words', () => {
      expect([0, 1, 12, 21, 100, 101, 1000, 21000].map(deNumberToWords)).toEqual(['null', 'eins', 'zwölf', 'einundzwanzig', 'einhundert', 'einhunderteins', 'eintausend', 'einundzwanzigtausend']);
    });
  });
});
