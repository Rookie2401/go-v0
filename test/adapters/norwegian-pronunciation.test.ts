/**
 * Pronunciation (a rule-based East Norwegian reference realisation, never a norm), speech normalization and the support statement.
 * The expectations are MACHINE-DRAFTED, pending native review (written by the model that built the analyzer; not checked by a native
 * speaker): they test that the rules are applied, not that the rules are right.
 */
import { describe, expect, it } from 'vitest';
import { TONE_PAIRS, transcribe } from '../../src/adapters/norwegian/pronunciation';
import { adapter } from './helpers';

const nb = adapter('nb');
const pron = (w: string) => nb.pronunciation({ surface: w, start: 0, end: w.length, isWord: true, normalized: w });

describe('pronunciation', () => {
  it('is tagged east and machine-draft, and says it is a reference, not a norm', () => {
    const p = pron('bok');
    const notes = (p.notes ?? []).join(' | ');
    expect(notes).toMatch(/variant: east/);
    expect(notes).toMatch(/machine-draft/);
    expect(notes).toMatch(/not a norm/);
    expect(notes).not.toMatch(/^Bokmål pronunciation/);
    expect(p.ipa).toBeTruthy();
    expect(p.transliteration).toBeTruthy();
  });

  it('kj, tj and k before i / y are [ç]; sj, skj and sk before i / y / ø are [ʃ]; rs is [ʂ]', () => {
    expect(pron('kjøre').ipa).toMatch(/ç/);
    expect(pron('tjene').ipa).toMatch(/^ˈç/);
    expect(pron('kino').ipa).toMatch(/^ˈç/);
    expect(pron('sjø').ipa).toMatch(/^ˈʃ/);
    expect(pron('skjorte').ipa).toMatch(/^ˈʃ/);
    expect(pron('skinn').ipa).toMatch(/^ˈʃ/);
    expect(pron('norsk').ipa).toMatch(/ʂ/);
    expect(pron('første').ipa).toMatch(/ʂ/);
  });

  it('silent h in hj- and hv-, silent d after n / l / r, -ig as -i', () => {
    expect(pron('hjelp').ipa).not.toMatch(/h/);
    expect(pron('hvem').ipa).not.toMatch(/h/);
    expect(pron('hvem').ipa).toMatch(/^ˈv/);
    expect(pron('land').ipa).toBe('ˈlɑn');
    expect(pron('kald').ipa).not.toMatch(/d/);
    expect(pron('viktig').ipa).toMatch(/ɪ$/);
    expect(pron('landet').ipa).not.toMatch(/d/);
  });

  it('o is [u] when long and [ɔ] when short, u is [ʉ], y is [y], å is [o]', () => {
    expect(pron('bok').ipa).toBe('ˈbuːk');
    expect(pron('kopp').ipa).toBe('ˈkɔp');
    expect(pron('hus').ipa).toMatch(/ʉ/);
    expect(pron('by').ipa).toMatch(/y/);
    expect(pron('gå').ipa).toMatch(/oː/);
  });

  it('a long vowel before a single consonant, a short one before a double consonant or a cluster', () => {
    expect(pron('mat').ipa).toBe('ˈmɑːt');
    expect(pron('matt').ipa).toBe('ˈmɑt');
    expect(pron('vinter').ipa).toMatch(/^ˈvɪn/);
    expect(pron('hat').ipa).toMatch(/ɑː/);
  });

  it('stress is on the first syllable, and on the second after be- / for- / er-', () => {
    expect(pron('gutten').ipa).toMatch(/^ˈ/);
    expect(pron('forstå').ipa).toMatch(/^fɔ.ˈ|^fɔɾ.?ˈ|f.*ˈ/);
    expect((pron('forstå').ipa ?? '').indexOf('ˈ')).toBeGreaterThan(0);
  });

  it('never claims tone except for the listed unverified minimal pairs', () => {
    expect((pron('gutten').notes ?? []).join(' ')).toMatch(/Tone .*not shown/);
    expect((pron('bønder').notes ?? []).join(' ')).toMatch(/Tone 1 \(unverified/);
    expect((pron('bønner').notes ?? []).join(' ')).toMatch(/Tone 2 \(unverified/);
    for (const v of Object.values(TONE_PAIRS)) expect(v.unverified).toBe(true);
    expect(transcribe('gutten')?.tone).toBeUndefined();
    expect(transcribe('bønder')?.tone).toEqual({ tone: 1, unverified: true });
  });

  it('gives nothing for a token that is not a Norwegian word', () => {
    expect(pron('123').ipa).toBeUndefined();
    expect(transcribe('')).toBeUndefined();
  });

  it('the Nynorsk adapter has the same reference realisation', () => {
    const nn = adapter('nn');
    expect(nn.pronunciation({ surface: 'kjøpe', start: 0, end: 5, isWord: true, normalized: 'kjøpe' }).ipa).toMatch(/^ˈç/);
  });
});

describe('speech normalization', () => {
  it('is deterministic, versioned and carries the fixed timestamp', () => {
    const a = nb.speechNormalize('Jeg har 3 barn, f.eks. 25 %.');
    expect(a).toEqual(nb.speechNormalize('Jeg har 3 barn, f.eks. 25 %.'));
    expect(a.normalizerVersion).toBe('speech-nb@1');
    expect(adapter('nn').speechNormalize('Eg har 3 born.').normalizerVersion).toBe('speech-nn@1');
    for (const t of a.transformations) {
      expect(t.tool).toBe('speech-nb@1');
      expect(t.at).toBe('1970-01-01T00:00:00.000Z');
    }
  });

  it('spells out numbers and abbreviations, and strips verse markers, without changing the script', () => {
    expect(nb.speechNormalize('3').speechText).toBe('tre');
    expect(nb.speechNormalize('Jeg har 21 bøker.').speechText).toBe('Jeg har tjueen bøker.');
    expect(nb.speechNormalize('bl.a. i dag').speechText).toBe('blant annet i dag');
    expect(nb.speechNormalize('Det er 50 %.').speechText).toBe('Det er femti prosent.');
    expect(nb.speechNormalize('Og Gud [16] elsket verden.', { isScripture: true }).speechText).toBe('Og Gud elsket verden.');
    expect(nb.speechNormalize('Blåbærsyltetøy på brødskiva.').speechText).toBe('Blåbærsyltetøy på brødskiva.');
    expect(nb.speechNormalize('Vi møtes den 3. mai.').speechText).toBe('Vi møtes den 3. mai.');
  });
});
