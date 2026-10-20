import { describe, expect, it, vi } from 'vitest';
import { createLocalTranslationProvider } from '../../packages/golearn-extension/src/translation/localProvider';
import { LOCAL_TRANSLATION_LANGUAGES, LOCAL_TRANSLATION_MODELS, type LocalTranslationLanguage } from '../../packages/golearn-extension/src/translation/models';
import { createTranslationEngine } from '../../packages/golearn-extension/src/translation/provider';
import type { LocalSentenceTranslationRequest } from '../../packages/golearn-extension/src/translation/localProtocol';

const fixtures: Record<LocalTranslationLanguage, string> = {
  sq: 'Libri është i bukur.', hi: 'मैं घर पर एक किताब पढ़ रहा हूँ।', es: 'La niña no lee el libro.',
  de: 'Das Mädchen liest das Buch nicht.', th: 'ฉันอ่านหนังสือที่บ้าน', nb: 'Jeg leser en bok hjemme.', nn: 'Eg les ei bok heime.',
};

describe('multilingual local translation provider', () => {
  it.each(LOCAL_TRANSLATION_LANGUAGES)('preserves %s text and uses only its pinned model after explicit action', async (language) => {
    const spec = LOCAL_TRANSLATION_MODELS[language];
    const send = vi.fn(async (request: LocalSentenceTranslationRequest) => ({ ok: true as const, text: 'Generated English.', model: spec.id, revision: spec.revision, sourceLanguage: request.sourceLanguage, targetLanguage: 'en' as const }));
    const engine = createTranslationEngine({ providers: [createLocalTranslationProvider(send)] });
    const request = { text: fixtures[language], sourceLanguage: { languageId: language, source: 'user' as const }, targetLanguage: { languageId: 'en', source: 'user' as const }, explicitlyRequested: false };
    await engine.translate(request);
    expect(send).not.toHaveBeenCalled();
    const result = await engine.translate({ ...request, explicitlyRequested: true });
    expect(send).toHaveBeenCalledWith({ text: fixtures[language], sourceLanguage: language, targetLanguage: 'en', explicitlyRequested: true });
    expect(result).toMatchObject({ status: 'translated', generated: true, reviewed: false, sourceLanguage: { languageId: language } });
    if (result.status === 'translated') expect(result.sourceLanguage.uncertaintyNotes?.join(' ')).toContain(spec.id);
  });
  it('keeps Norwegian written standards distinct and does not silently guess generic no', async () => {
    const send = vi.fn();
    const provider = createLocalTranslationProvider(send);
    expect(LOCAL_TRANSLATION_MODELS.nb.id).toBe(LOCAL_TRANSLATION_MODELS.nn.id);
    expect(LOCAL_TRANSLATION_MODELS.nb.modelSource).toBe('nob');
    expect(LOCAL_TRANSLATION_MODELS.nn.modelSource).toBe('nno');
    await expect(provider.translate({ text: 'En bok.', sourceLanguage: { languageId: 'no', source: 'page' }, targetLanguage: { languageId: 'en', source: 'user' } })).rejects.toThrow(/Unsupported/);
    expect(send).not.toHaveBeenCalled();
  });
  it.each(['model', 'revision', 'sourceLanguage', 'targetLanguage'] as const)('rejects a mismatched %s rather than mislabelling output', async (field) => {
    const spec = LOCAL_TRANSLATION_MODELS.hi;
    const response = { ok: true as const, text: 'Generated English.', model: spec.id, revision: spec.revision, sourceLanguage: 'hi' as const, targetLanguage: 'en' as const };
    const provider = createLocalTranslationProvider(async () => ({ ...response, [field]: field === 'sourceLanguage' ? 'es' : 'wrong' }) as typeof response);
    await expect(provider.translate({ text: fixtures.hi, sourceLanguage: { languageId: 'hi', source: 'user' }, targetLanguage: { languageId: 'en', source: 'user' } })).rejects.toThrow(/did not match/);
  });
  it('preserves regional source evidence without asserting regional model accuracy', async () => {
    const spec = LOCAL_TRANSLATION_MODELS.es;
    const engine = createTranslationEngine({ providers: [createLocalTranslationProvider(async (r) => ({ ok: true, text: 'English.', model: spec.id, revision: spec.revision, sourceLanguage: r.sourceLanguage, targetLanguage: 'en' }))] });
    const result = await engine.translate({ text: 'Vos leés el libro.', sourceLanguage: { languageId: 'es-AR', dialectId: 'rioplatense', source: 'page' }, targetLanguage: { languageId: 'en', source: 'user' }, explicitlyRequested: true });
    expect(result).toMatchObject({ status: 'translated', sourceLanguage: { languageId: 'es-AR', dialectId: 'rioplatense' } });
    if (result.status === 'translated') expect(result.sourceLanguage.uncertaintyNotes?.join(' ')).toContain('not independently validated');
  });
});
