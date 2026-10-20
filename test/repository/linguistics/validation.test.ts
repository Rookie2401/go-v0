// @vitest-environment node
/** The resolver stamps every unit's provenance with its validation level, so the engine's eligibility gate has something to read. */
import { describe, expect, it } from 'vitest';
import { eligibilityFor } from '../../../packages/repository-engine/src';
import { genericValidation, packValidation, resolveSelection } from '../../../packages/repository-linguistics/src';

const NOW = '2026-10-08T10:00:00.000Z';
const validationOf = (p: unknown): unknown => (p as { validation?: unknown }).validation;

describe('validation stamped by the resolver', () => {
  it('Albanian and Spanish (installable, machine-drafted packs): every unit and candidate carries a level, and it is unreviewed, because no manifest claims more', () => {
    for (const [lang, surface] of [['sq', 'librin'], ['es', 'libro']] as const) {
      const r = resolveSelection({ languageId: lang, surface, sentence: surface, now: NOW });
      for (const u of r.units) expect(validationOf(u.provenance), `${lang} ${u.unitId}`).toBeDefined();
      for (const c of r.analysis.candidates) expect(validationOf(c.provenance), `${lang} candidate`).toBeDefined();
      expect(validationOf(r.units.find((u) => u.kind === 'lexeme')!.provenance)).toBe('unreviewed');
      expect(r.units.find((u) => u.kind === 'lexeme')!.provenance.origin).toBeDefined();
    }
  });

  it('a form the word list does not know is read by its ending: unreviewed, whatever the pack', () => {
    const r = resolveSelection({ languageId: 'sq', surface: 'flasturat', sentence: 'Unë pashë flasturat sot.', now: NOW });
    const guessed = r.analysis.candidates.filter((c) => c.provenance.source === 'rule');
    expect(guessed.length).toBeGreaterThan(0);
    for (const c of guessed) expect(validationOf(c.provenance)).toBe('unreviewed');
  });

  it('a language with no analyser records a bare form: experimental languages stay experimental, planned ones are unsupported, others unreviewed', () => {
    const of = (languageId: string) => validationOf(resolveSelection({ languageId, surface: 'xx', now: NOW }).units[0].provenance);
    expect(of('th')).toBe('experimental');
    expect(of('de')).toBe('experimental');
    expect(of('nb')).toBe('unsupported');
    expect(of('fr')).toBe('unreviewed');
    expect(packValidation('sq')).toBe('unreviewed'); // installable reads production-validated only when the manifest says so (validationForPack)
    expect(genericValidation('sq')).toBe('unreviewed'); // a bare form never inherits the pack's validation
  });

  it('end to end: the gate reads what the resolver stamped', () => {
    const th = resolveSelection({ languageId: 'th', surface: 'หนังสือ', now: NOW });
    const unit = th.units[0];
    expect(eligibilityFor(unit, [th.analysis], 'readingRecognition')).toMatchObject({ eligible: true, status: 'provisional' });
    expect(eligibilityFor(unit, [th.analysis], 'grammaticalUnderstanding')).toMatchObject({ eligible: false });
    const nb = resolveSelection({ languageId: 'nb', surface: 'bok', now: NOW });
    expect(eligibilityFor(nb.units[0], [nb.analysis], 'readingRecognition')).toMatchObject({ eligible: false, status: 'requires-review' });
  });

  it('Hindi uses its real experimental analyser: recognition is allowed provisionally, production questions are refused', () => {
    const hi = resolveSelection({ languageId: 'hi', surface: 'किताब', sentence: 'मैं हर दिन किताब पढ़ता हूँ।', now: NOW });
    expect(hi.units[0]).toMatchObject({ packId: 'pack:hi', packVersion: '6', provenance: { validation: 'experimental' } });
    expect(hi.analysis).toMatchObject({ analyzerId: 'adapter-hi@6', packId: 'pack:hi', packVersion: '6' });
    expect(hi.analysis.candidates[0]).toMatchObject({ lexemeId: 'lemma:hi:किताब:NOUN', provenance: { validation: 'experimental' } });
    expect(eligibilityFor(hi.units[0], [hi.analysis], 'readingRecognition')).toMatchObject({ eligible: true, status: 'provisional' });
    expect(eligibilityFor(hi.units[0], [hi.analysis], 'productiveRetrieval')).toMatchObject({ eligible: false });
  });
});
