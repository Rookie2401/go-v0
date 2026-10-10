import { describe, expect, it, vi } from 'vitest';
import {
  createBrowserTranslationProvider, createTranslationEngine, MAX_TRANSLATION_INPUT_LENGTH,
  type LanguageProvenance, type TranslationProvider,
} from '../../packages/golearn-extension/src/translation/provider';

const sourceLanguage: LanguageProvenance = { languageId: 'de', dialectId: 'de-at', source: 'page', uncertaintyNotes: ['Page language is a hint; dialect has not been verified.'] };
const targetLanguage: LanguageProvenance = { languageId: 'en', source: 'user' };
const request = (extra: Record<string, unknown> = {}) => ({ text: 'Guten Morgen', sourceLanguage, targetLanguage, explicitlyRequested: true, ...extra });
const permitted = { textRetention: 'unknown' as const, remoteProcessing: 'allowed' as const, audioRetention: 'unknown' as const, export: 'unknown' as const, sharing: 'unknown' as const, reviewExamples: 'unknown' as const };

describe('translation providers', () => {
  it('does not invoke a provider until translation is explicitly requested', async () => {
    const translate = vi.fn(async () => ({ kind: 'natural' as const, text: 'Good morning' }));
    const engine = createTranslationEngine({ providers: [{ id: 'local-test', mode: 'local', translate }] });
    expect(await engine.translate({ ...request(), explicitlyRequested: false })).toEqual({ status: 'unavailable', reason: 'not-requested' });
    expect(translate).not.toHaveBeenCalled();
  });

  it('reports an empty provider list accurately and rejects unknown language and oversized input', async () => {
    const emptyEngine = createTranslationEngine({ providers: [] });
    expect(emptyEngine.processingMode).toBe('unknown');
    expect(await emptyEngine.translate(request())).toEqual({ status: 'unavailable', reason: 'no-provider' });
    const translate = vi.fn(async () => ({ kind: 'natural' as const, text: 'Good morning' }));
    const engine = createTranslationEngine({ providers: [{ id: 'local', mode: 'local', translate }] });
    expect(await engine.translate({ ...request(), sourceLanguage: { source: 'unknown' } })).toEqual({ status: 'unavailable', reason: 'language-unknown' });
    expect(await engine.translate({ ...request(), text: 'x'.repeat(MAX_TRANSLATION_INPUT_LENGTH + 1) })).toEqual({ status: 'unavailable', reason: 'input-too-long' });
    expect(translate).not.toHaveBeenCalled();
  });

  it('allows a plausible language tag with unknown provenance while marking the uncertainty', async () => {
    const engine = createTranslationEngine({ providers: [{ id: 'local', mode: 'local', translate: async () => ({ kind: 'natural' as const, text: 'Good morning' }) }] });
    expect(await engine.translate({ ...request(), sourceLanguage: { languageId: 'de', source: 'unknown' } })).toMatchObject({
      status: 'translated', sourceLanguage: { languageId: 'de', uncertaintyNotes: ['Source language tag was supplied but not independently verified.'] },
    });
    expect(await engine.translate({ ...request(), sourceLanguage: { languageId: 'not a tag', source: 'page' } })).toMatchObject({ status: 'unavailable', reason: 'language-unknown' });
  });

  it('skips invalid runtime provider modes and freezes copied provenance passed to providers', async () => {
    const invalid = { id: 'bad', mode: 'typo', translate: vi.fn() } as unknown as TranslationProvider;
    const unsafe = { id: 'local', mode: 'local', translate: vi.fn(async (input) => {
      expect(Object.isFrozen(input)).toBe(true);
      expect(Object.isFrozen(input.sourceLanguage)).toBe(true);
      expect(() => { (input.sourceLanguage as { source: string }).source = 'user'; }).toThrow();
      return { kind: 'natural' as const, text: 'Good morning' };
    }) } satisfies TranslationProvider;
    const engine = createTranslationEngine({ providers: [invalid, unsafe] });
    expect(engine.processingMode).toBe('unknown');
    expect(await engine.translate(request())).toMatchObject({ status: 'translated', sourceLanguage: { source: 'page' } });
    expect(invalid.translate).not.toHaveBeenCalled();
  });

  it('reports configured provider processing mode without claiming remote use is local', () => {
    expect(createTranslationEngine({ providers: [{ id: 'local', mode: 'local', translate: async () => ({ kind: 'natural' as const, text: 'x' }) }] }).processingMode).toBe('local');
    expect(createTranslationEngine({ providers: [{ id: 'remote', mode: 'remote', authorized: true, translate: async () => ({ kind: 'natural' as const, text: 'x' }) }] }).processingMode).toBe('remote');
    expect(createTranslationEngine({ providers: [
      { id: 'local', mode: 'local', translate: async () => ({ kind: 'natural' as const, text: 'x' }) },
      { id: 'remote', mode: 'remote', authorized: true, translate: async () => ({ kind: 'natural' as const, text: 'x' }) },
    ] }).processingMode).toBe('mixed');
  });

  it('keeps a word gloss distinct from natural translation and enables it only by request', async () => {
    const translate = vi.fn(async () => ({ kind: 'word-gloss' as const, text: 'good morning' }));
    const engine = createTranslationEngine({ providers: [{ id: 'dictionary', mode: 'local', translate }] });
    expect(await engine.translate(request())).toEqual({ status: 'unavailable', reason: 'provider-unavailable' });
    expect(await engine.translate({ ...request(), allowWordGloss: true })).toMatchObject({ status: 'gloss', kind: 'word-gloss', label: 'word gloss', generated: true, reviewed: false });
  });

  it('requires trusted permission and explicit authorization before remote providers run', async () => {
    const translate = vi.fn(async () => ({ kind: 'natural' as const, text: 'Good morning' }));
    const provider: TranslationProvider = { id: 'remote', mode: 'remote', authorized: true, translate };
    const engine = createTranslationEngine({ providers: [provider] });
    expect(await engine.translate(request())).toEqual({ status: 'unavailable', reason: 'remote-processing-forbidden' });
    expect(await engine.translate({ ...request(), sourceRestrictions: { ...permitted, remoteProcessing: 'forbidden' } })).toEqual({ status: 'unavailable', reason: 'remote-processing-forbidden' });
    expect(translate).not.toHaveBeenCalled();
    expect(await createTranslationEngine({ providers: [{ ...provider, authorized: false }] }).translate({ ...request(), sourceRestrictions: permitted })).toEqual({ status: 'unavailable', reason: 'provider-unauthorized' });
    expect(translate).not.toHaveBeenCalled();
    expect(await engine.translate({ ...request(), sourceRestrictions: permitted })).toMatchObject({ status: 'translated', kind: 'natural', generated: true, reviewed: false });
  });

  it('bounds provider output and preserves dialect uncertainty without inventing confidence', async () => {
    const translate = vi.fn(async () => ({ kind: 'natural' as const, text: 'x'.repeat(4_001) }));
    const engine = createTranslationEngine({ providers: [{ id: 'local', mode: 'local', translate }] });
    expect(await engine.translate(request())).toEqual({ status: 'unavailable', reason: 'provider-unavailable' });
    const good = createTranslationEngine({ providers: [{ id: 'local', mode: 'local', translate: async () => ({ kind: 'natural' as const, text: 'Guten Morgen' }) }] });
    expect(await good.translate(request())).toMatchObject({ sourceLanguage: { dialectId: 'de-at', uncertaintyNotes: ['Page language is a hint; dialect has not been verified.'] }, targetLanguage: { source: 'user' } });
  });

  it('checks availability without creating, discloses possible download, and never creates for unsupported pairs', async () => {
    const translate = vi.fn(async (text: string) => `English: ${text}`);
    const create = vi.fn(async () => ({ translate }));
    const availability = vi.fn(async () => 'downloadable' as const);
    const provider = createBrowserTranslationProvider({ availability, create });
    expect(await provider.availability('de', 'en')).toBe('downloadable');
    expect(create).not.toHaveBeenCalled();
    expect(await provider.translate({ text: 'Guten Morgen', sourceLanguage, targetLanguage })).toMatchObject({ kind: 'natural', text: 'English: Guten Morgen', modelDownload: 'may-start', uncertaintyNotes: [expect.stringMatching(/does not verify dialect/)] });
    expect(create).toHaveBeenCalledWith({ sourceLanguage: 'de', targetLanguage: 'en' });

    const unsupported = createBrowserTranslationProvider({ availability: async () => 'unavailable', create });
    await expect(unsupported.translate({ text: 'Hallo', sourceLanguage, targetLanguage })).rejects.toThrow(/unavailable/);
    expect(create).toHaveBeenCalledTimes(1);
  });

  it('clears a rejected browser translator creation so a later explicit request can retry', async () => {
    const translate = vi.fn(async (text: string) => text);
    const create = vi.fn().mockRejectedValueOnce(new Error('download failed')).mockResolvedValueOnce({ translate });
    const provider = createBrowserTranslationProvider({ availability: async () => 'downloadable', create });
    const input = { text: 'Hallo', sourceLanguage, targetLanguage };
    await expect(provider.translate(input)).rejects.toThrow(/download failed/);
    expect(await provider.translate(input)).toMatchObject({ kind: 'natural', text: 'Hallo', modelDownload: 'may-start', uncertaintyNotes: [expect.stringMatching(/does not verify dialect/)] });
    expect(create).toHaveBeenCalledTimes(2);
  });

  it('reports unavailable when the browser API is absent', async () => {
    const provider = createBrowserTranslationProvider(undefined);
    expect(await provider.availability('de', 'en')).toBe('unavailable');
    await expect(provider.translate({ text: 'Hallo', sourceLanguage, targetLanguage })).rejects.toThrow(/unavailable/);
  });
});
