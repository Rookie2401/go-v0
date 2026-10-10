import type { SourceRestrictions } from '../contract/readerAdapter';

export const MAX_TRANSLATION_INPUT_LENGTH = 2_000;
export const MAX_TRANSLATION_OUTPUT_LENGTH = 4_000;

/** Evidence for a language label. Dialect evidence is kept separate and never treated as language certainty. */
export interface LanguageProvenance {
  languageId?: string;
  dialectId?: string;
  source: 'user' | 'page' | 'selection' | 'unknown';
  uncertaintyNotes?: string[];
}

export interface TranslationInput {
  text: string;
  sourceLanguage: LanguageProvenance;
  targetLanguage: LanguageProvenance;
}

/** Word glosses are structurally distinct from natural-language translations. */
export type ProviderOutput =
  | { kind: 'natural'; text: string; origin?: 'machine' | 'reference'; attribution?: string; modelDownload?: ModelDownloadDisclosure; uncertaintyNotes?: string[] }
  | { kind: 'word-gloss'; text: string };

export interface TranslationProvider {
  id: string;
  mode: 'local' | 'remote';
  /** Remote providers must be explicitly enabled by trusted application configuration. */
  authorized?: boolean;
  translate(input: TranslationInput): Promise<ProviderOutput>;
}

export interface TranslationRequest extends TranslationInput {
  /** Must be set only in response to the learner asking for a translation. */
  explicitlyRequested: boolean;
  sourceRestrictions?: SourceRestrictions;
  allowWordGloss?: boolean;
}

export type TranslationResult =
  | { status: 'translated'; kind: 'natural'; text: string; providerId: string; origin?: 'machine' | 'reference'; attribution?: string; generated: boolean; reviewed: false; sourceLanguage: LanguageProvenance; targetLanguage: LanguageProvenance; modelDownload?: ModelDownloadDisclosure }
  | { status: 'gloss'; kind: 'word-gloss'; text: string; label: 'word gloss'; providerId: string; generated: true; reviewed: false; sourceLanguage: LanguageProvenance; targetLanguage: LanguageProvenance }
  | { status: 'unavailable'; reason: 'not-requested' | 'input-too-long' | 'language-unknown' | 'remote-processing-forbidden' | 'provider-unauthorized' | 'no-provider' | 'provider-unavailable' | 'word-gloss-not-enabled' };

const usable = (value: unknown): value is string => typeof value === 'string' && value.trim().length > 0;
const bounded = (value: unknown, max: number): value is string => usable(value) && value.length <= max;
const plausibleLanguageTag = (value: unknown): value is string =>
  typeof value === 'string' && /^[A-Za-z]{2,3}(?:-[A-Za-z0-9]{2,8})*$/.test(value);
const snapshot = (language: LanguageProvenance): LanguageProvenance => ({
  ...language,
  ...(language.uncertaintyNotes ? { uncertaintyNotes: [...language.uncertaintyNotes] } : {}),
});

/** Optional on-demand provider orchestration. The engine itself performs no network access. */
export function createTranslationEngine(options: { providers: readonly TranslationProvider[] }) {
  const modes = new Set(options.providers.map((provider) => provider.mode).filter((mode) => mode === 'local' || mode === 'remote'));
  const hasInvalidMode = options.providers.some((provider) => provider.mode !== 'local' && provider.mode !== 'remote');
  const processingMode = hasInvalidMode || modes.size === 0 ? 'unknown' : modes.size > 1 ? 'mixed' : modes.has('local') ? 'local' : 'remote';
  return {
    processingMode,
    async translate(request: TranslationRequest): Promise<TranslationResult> {
      if (!request.explicitlyRequested) return { status: 'unavailable', reason: 'not-requested' };
      if (!bounded(request.text, MAX_TRANSLATION_INPUT_LENGTH)) return { status: 'unavailable', reason: 'input-too-long' };
      if (!plausibleLanguageTag(request.sourceLanguage.languageId) || !plausibleLanguageTag(request.targetLanguage.languageId)) return { status: 'unavailable', reason: 'language-unknown' };
      if (options.providers.length === 0) return { status: 'unavailable', reason: 'no-provider' };

      const sourceLanguage = snapshot(request.sourceLanguage);
      const targetLanguage = snapshot(request.targetLanguage);
      if (sourceLanguage.source === 'unknown') {
        sourceLanguage.uncertaintyNotes = [...(sourceLanguage.uncertaintyNotes ?? []), 'Source language tag was supplied but not independently verified.'];
      }

      let gateFailure: 'remote-processing-forbidden' | 'provider-unauthorized' | undefined;
      for (const provider of options.providers) {
        if (provider.mode !== 'local' && provider.mode !== 'remote') continue;
        if (provider.mode === 'remote') {
          if (request.sourceRestrictions?.remoteProcessing !== 'allowed') { gateFailure ??= 'remote-processing-forbidden'; continue; }
          if (provider.authorized !== true) { gateFailure ??= 'provider-unauthorized'; continue; }
        }
        try {
          const providerInput: TranslationInput = {
            text: request.text,
            sourceLanguage: Object.freeze({ ...sourceLanguage, ...(sourceLanguage.uncertaintyNotes ? { uncertaintyNotes: Object.freeze([...sourceLanguage.uncertaintyNotes]) as unknown as string[] } : {}) }),
            targetLanguage: Object.freeze({ ...targetLanguage, ...(targetLanguage.uncertaintyNotes ? { uncertaintyNotes: Object.freeze([...targetLanguage.uncertaintyNotes]) as unknown as string[] } : {}) }),
          };
          const output = await provider.translate(Object.freeze(providerInput));
          if (!output || !bounded(output.text, MAX_TRANSLATION_OUTPUT_LENGTH)) continue;
          if (output.kind === 'word-gloss') {
            if (!request.allowWordGloss) continue;
            return { status: 'gloss', kind: 'word-gloss', text: output.text.trim(), label: 'word gloss', providerId: provider.id, generated: true, reviewed: false, sourceLanguage: snapshot(sourceLanguage), targetLanguage: snapshot(targetLanguage) };
          }
          if (output.kind === 'natural') return {
            status: 'translated', kind: 'natural', text: output.text.trim(), providerId: provider.id,
            origin: output.origin === 'reference' ? 'reference' : 'machine', generated: output.origin !== 'reference', reviewed: false,
            ...(output.attribution ? { attribution: output.attribution.slice(0, 500) } : {}),
            sourceLanguage: { ...snapshot(sourceLanguage), ...(output.uncertaintyNotes?.length ? { uncertaintyNotes: [...(sourceLanguage.uncertaintyNotes ?? []), ...output.uncertaintyNotes] } : {}) },
            targetLanguage: snapshot(targetLanguage), ...(output.modelDownload ? { modelDownload: output.modelDownload } : {}),
          };
        } catch {
          // A provider failure is an unavailable translation, never a fabricated fallback.
        }
      }
      return { status: 'unavailable', reason: gateFailure ?? 'provider-unavailable' };
    },
  };
}

export type BrowserTranslationAvailability = 'available' | 'downloadable' | 'downloading' | 'unavailable';
export interface BrowserTranslatorMonitor {
  addEventListener(type: 'downloadprogress', listener: (event: { loaded: number }) => void): void;
}
interface BrowserTranslatorInstance { translate(text: string): Promise<string> }
interface BrowserTranslatorApi {
  availability(options: { sourceLanguage: string; targetLanguage: string }): Promise<BrowserTranslationAvailability>;
  create(options: { sourceLanguage: string; targetLanguage: string; monitor?: (monitor: BrowserTranslatorMonitor) => void }): Promise<BrowserTranslatorInstance>;
}

export type ModelDownloadDisclosure = 'not-needed' | 'may-start';
export interface BrowserTranslationOutput extends Extract<ProviderOutput, { kind: 'natural' }> {
  modelDownload: ModelDownloadDisclosure;
}

/** Structural type mirrors Chrome's Translator API without requiring a particular DOM typings package. */
export function createBrowserTranslationProvider(api: BrowserTranslatorApi | undefined =
  (globalThis as typeof globalThis & { Translator?: BrowserTranslatorApi }).Translator) {
  const cache = new Map<string, Promise<BrowserTranslatorInstance>>();
  const availability = async (sourceLanguage: string, targetLanguage: string): Promise<BrowserTranslationAvailability> => {
    if (!api || !usable(sourceLanguage) || !usable(targetLanguage)) return 'unavailable';
    try { return await api.availability({ sourceLanguage, targetLanguage }); } catch { return 'unavailable'; }
  };
  const provider: TranslationProvider & {
    availability: typeof availability;
    translate(input: TranslationInput): Promise<BrowserTranslationOutput>;
  } = {
    id: 'browser-translator',
    mode: 'local',
    availability,
    async translate(input) {
      if (!api) throw new Error('Browser translation is unavailable');
      const sourceLanguage = input.sourceLanguage.languageId;
      const targetLanguage = input.targetLanguage.languageId;
      if (!usable(sourceLanguage) || !usable(targetLanguage)) throw new Error('Language pair is unknown');
      if (!bounded(input.text, MAX_TRANSLATION_INPUT_LENGTH)) throw new Error('Translation input is too long');
      const pair = `${sourceLanguage}\u0000${targetLanguage}`;
      const pairAvailability = await availability(sourceLanguage, targetLanguage);
      if (pairAvailability === 'unavailable') throw new Error('Browser translation is unavailable for this language pair');
      let translatorPromise = cache.get(pair);
      if (!translatorPromise) {
        // Creation is deferred until translate(), which callers invoke only after explicit learner action.
        translatorPromise = api.create({ sourceLanguage, targetLanguage });
        cache.set(pair, translatorPromise);
        void translatorPromise.catch(() => { if (cache.get(pair) === translatorPromise) cache.delete(pair); });
      }
      const translator = await translatorPromise;
      const text = await translator.translate(input.text);
      if (!bounded(text, MAX_TRANSLATION_OUTPUT_LENGTH)) throw new Error('Browser translation output is empty or too long');
      return {
        kind: 'natural', text: text.trim(), modelDownload: pairAvailability === 'available' ? 'not-needed' : 'may-start',
        uncertaintyNotes: ['Browser translation uses a language tag and does not verify dialect-specific translation.'],
      };
    },
  };
  return provider;
}
