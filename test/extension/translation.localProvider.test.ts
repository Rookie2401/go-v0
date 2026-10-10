import { describe, expect, it, vi } from 'vitest';
import { createLocalAlbanianTranslationProvider, prepareAlbanianTranslation } from '../../packages/golearn-extension/src/translation/localProvider';
import { createTranslationEngine } from '../../packages/golearn-extension/src/translation/provider';

describe('local Albanian translation', () => {
  it('uses only listed correspondences and preserves unknown forms, punctuation and case', () => {
    expect(prepareAlbanianTranslation('Sokrat i vuejtun apo derr i kënaqun?')).toEqual({ text: 'Sokrat i vuajtur apo derr i kënaqur?', changes: ['vuejtun → vuajtur', 'kënaqun → kënaqur'] });
    expect(prepareAlbanianTranslation('VUEJTUN, Kënaqun; kuptun dritun.').text).toBe('VUAJTUR, Kënaqur; kuptun dritun.');
  });
  it('translates only on request without granting remote permission and reports its preparation', async () => {
    const send = vi.fn(async () => ({ ok: true as const, text: 'A suffering Socrates or a satisfied pig?', model: 'Helsinki-NLP/opus-mt-sq-en' as const, revision: 'abc' }));
    const engine = createTranslationEngine({ providers: [createLocalAlbanianTranslationProvider(send)] });
    const request = { text: 'Sokrat i vuejtun apo derr i kënaqun?', sourceLanguage: { languageId: 'sq', source: 'page' as const }, targetLanguage: { languageId: 'en', source: 'user' as const }, explicitlyRequested: false };
    await engine.translate(request);
    expect(send).not.toHaveBeenCalled();
    const result = await engine.translate({ ...request, explicitlyRequested: true });
    expect(send).toHaveBeenCalledWith({ text: 'Sokrat i vuajtur apo derr i kënaqur?', sourceLanguage: 'sq', targetLanguage: 'en', explicitlyRequested: true });
    expect(result).toMatchObject({ status: 'translated', generated: true, reviewed: false });
    if (result.status === 'translated') expect(result.sourceLanguage.uncertaintyNotes?.join(' ')).toContain('vuejtun → vuajtur');
    expect(request.text).toContain('vuejtun');
  });
  it('does not send other languages and handles a disconnected local service', async () => {
    const send = vi.fn(async () => ({ ok: false as const, reason: 'not-configured' as const }));
    const provider = createLocalAlbanianTranslationProvider(send);
    await expect(provider.translate({ text: 'Hund', sourceLanguage: { languageId: 'de', source: 'page' }, targetLanguage: { languageId: 'en', source: 'user' } })).rejects.toThrow(/Albanian/);
    expect(send).not.toHaveBeenCalled();
    await expect(provider.translate({ text: 'Libri është i bukur.', sourceLanguage: { languageId: 'sq', source: 'page' }, targetLanguage: { languageId: 'en', source: 'user' } })).rejects.toThrow(/unavailable/);
  });
});
