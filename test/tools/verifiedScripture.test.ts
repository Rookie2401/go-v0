import { describe, expect, it } from 'vitest';
import { loadBundledCorpus } from '../../src/ingest';
import { checkVerifiedScripture } from '../../scripts/verified-scripture';

describe('verification records remain bound to the named translation', () => {
  const original = loadBundledCorpus().find(d => d.lang === 'de' && d.id === 'bible-1john-1')!;
  const sentences = original.sections.flatMap(s => s.paragraphs.flatMap(p => 'sentences' in p ? p.sentences : []));
  const translation = { lang: 'de', translationId: original.scripture!.translationId, verses: Object.fromEntries(sentences.map(s => [s.verseRefs![0], { text: s.text }])) };
  it('checks the verified edition and rejects missing, changed or ambiguous records', () => {
    expect(checkVerifiedScripture([original], [translation])).toEqual({ errors: [], sentences: 3 });
    expect(checkVerifiedScripture([original], [{ ...translation, translationId: 'other-edition' }]).errors).toHaveLength(1);
    expect(checkVerifiedScripture([original], [translation, translation]).errors).toHaveLength(1);
    expect(checkVerifiedScripture([original], [{ ...translation, verses: {} }]).errors).toHaveLength(3);
  });
  it('does not confer verification on an unidentified sample of a language with a verified Bible', () => {
    const sample = structuredClone(original);
    sample.scripture!.translationId = 'unidentified';
    delete sample.scripture!.verification;
    expect(checkVerifiedScripture([sample], [translation])).toEqual({ errors: [], sentences: 0 });
  });
});
