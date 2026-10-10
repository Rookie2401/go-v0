import { describe, expect, it, vi } from 'vitest';
import { migjeniTitleReferenceProvider, MIGJENI_TITLE_EN, MIGJENI_TITLE_ATTRIBUTION } from '../../packages/golearn-extension/src/translation/referenceProvider';
import { createTranslationEngine, type TranslationInput, type TranslationProvider } from '../../packages/golearn-extension/src/translation/provider';

const input = (text: string): TranslationInput => ({
  text,
  sourceLanguage: { languageId: 'sq', dialectId: 'gheg', source: 'selection' },
  targetLanguage: { languageId: 'en', source: 'user' },
});

describe('Migjeni exact title reference provider', () => {
  it.each([
    ['source spelling with apo', 'Sokrat i vuejtun apo derr i kënaqun'],
    ['source spelling with a po', 'Sokrat i vuejtun a po derr i kënaqun'],
    ['active uppercase heading with ASCII dash', 'SOKRAT I VUEJTUN - APO DERR I KËNAQUN?'],
    ['user title with punctuation', '“Sokrat i vuejtun apo derr i kënaqun?”'],
    ['case, NFC, whitespace, dash, and period formatting', '  SOKRAT   i vuejtun — A PO   derr i kënaqun.  '],
  ])('matches exact full title variants: %s', async (_label, text) => {
    const result = await migjeniTitleReferenceProvider.translate(input(text));
    expect(result).toMatchObject({
      kind: 'natural',
      text: MIGJENI_TITLE_EN,
      origin: 'reference',
      generated: false,
      reviewed: false,
      attribution: MIGJENI_TITLE_ATTRIBUTION,
      uncertaintyNotes: [expect.stringMatching(/exact title only/)],
    });
  });

  it('normalizes canonically equivalent Unicode text', async () => {
    const decomposed = 'Sokrat i vuejtun apo derr i kënaqun'.normalize('NFD');
    const result = await migjeniTitleReferenceProvider.translate(input(decomposed));
    expect(result).toMatchObject({ origin: 'reference', text: MIGJENI_TITLE_EN, generated: false });
  });

  it.each([
    'Sokrat i vuejtun',
    'Sokrat i vuejtun apo derr i kënaqun dhe një fjali tjetër',
    'Sokrat nuk i vuejtun apo derr i kënaqun',
    'para Sokrat i vuejtun apo derr i kënaqun pas',
    '- Sokrat i vuejtun apo derr i kënaqun',
    'Sokrat i vuejtun apo derr i kënaqun? -',
    'Sokrat i vuajtur apo derr i kënaqur',
  ])('does not match a substring, extra words, edits, or unreferenced spelling: %s', async (text) => {
    await expect(migjeniTitleReferenceProvider.translate(input(text))).rejects.toThrow('No exact title reference is available.');
  });

  it('declines other language pairs', async () => {
    await expect(migjeniTitleReferenceProvider.translate({
      ...input('Sokrat i vuejtun apo derr i kënaqun'),
      targetLanguage: { languageId: 'fr', source: 'user' },
    })).rejects.toThrow('No exact title reference is available.');
  });

  it('lets the translation engine fall through to the local model for an unmatched sentence', async () => {
    const translate = vi.fn(async () => ({ kind: 'natural' as const, text: 'The girl reads a book.' }));
    const model: TranslationProvider = { id: 'local-model', mode: 'local', translate };
    const engine = createTranslationEngine({ providers: [migjeniTitleReferenceProvider, model] });
    const result = await engine.translate({ ...input('Vajza lexon një libër.'), explicitlyRequested: true });
    expect(result).toMatchObject({ status: 'translated', kind: 'natural', text: 'The girl reads a book.', providerId: 'local-model' });
    expect(translate).toHaveBeenCalledOnce();
  });

  it('does not expose selected text in an unavailable error or retain prior input between calls', async () => {
    const privateSelection = 'Nuk duhet të dalë në mesazh.';
    let errorText = '';
    try { await migjeniTitleReferenceProvider.translate(input(privateSelection)); }
    catch (error) { errorText = error instanceof Error ? error.message : String(error); }
    expect(errorText).not.toContain(privateSelection);
    const matched = await migjeniTitleReferenceProvider.translate(input('Sokrat i vuejtun apo derr i kënaqun'));
    expect(JSON.stringify(matched)).not.toContain(privateSelection);
  });
});
