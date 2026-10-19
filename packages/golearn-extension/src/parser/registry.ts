/**
 * The analyser registry of the parser. The parser itself is synchronous (`parseSelection`), so the language adapter it
 * reads a selection with must already be in memory; this registry is where it is looked up. It imports no adapter:
 *
 *   - Albanian is registered inline by the parser module (the reference language: no load, no cold-start latency);
 *   - every other language is registered by whoever loaded its analyser chunk (`registerAnalyser`): the content script
 *     imports `analysers/<id>.js` on demand (content/index.ts), the setup app imports `src/analysers/loaders.ts`, and
 *     tests call `registerAllAnalysers()`.
 *
 * `PARSER_LANGUAGES` is the languages that CAN be loaded (the ones with an entry in `LANGUAGE_META`); `hasAnalyser`
 * says which of them ARE loaded right now. A language outside the table is unknown to the parser.
 */
import type { LanguageAdapter } from '../../../../src/core';

/** What the parser knows about a language without its adapter: its name in plain words and the page-language tags that mean it. */
export interface LanguageMeta {
  lang: string;
  name: string;
  pageTag: RegExp;
  /** The honest one-line state of a pack that is wired but not production-ready; shown on the card as a limit. */
  experimental?: string;
}

export const LANGUAGE_META: Readonly<Record<string, LanguageMeta>> = {
  sq: { lang: 'sq', name: 'Albanian', pageTag: /^(sq|als|aln)(-|$)/ },
  es: { lang: 'es', name: 'Spanish', pageTag: /^es(-|$)/ },
  de: { lang: 'de', name: 'German', pageTag: /^de(-|$)/, experimental: 'The German pack is experimental: lemmatisation is seed-only (a machine-drafted word list), morphology is limited, and nothing has been reviewed by a native speaker.' },
  hi: { lang: 'hi', name: 'Hindi', pageTag: /^hi(-|$)/, experimental: 'The Hindi pack is experimental: lemmatisation is seed-only (a machine-drafted word list), morphology is limited, and nothing has been reviewed by a native speaker.' },
  th: { lang: 'th', name: 'Thai', pageTag: /^th(-|$)/, experimental: 'The Thai pack is experimental: lemmatisation is seed-only (a machine-drafted word list of about 600 entries), word segmentation is limited, and nothing has been reviewed by a native speaker.' },
  // A page that declares plain "no" is not noted for either Norwegian pack: "no" does not say which written standard, and the learner's pack decides.
  nb: { lang: 'nb', name: 'Norwegian (Bokmål)', pageTag: /^(nb|no)(-|$)/, experimental: 'The Norwegian (Bokmål) pack is experimental: lemmatisation is seed-only (a machine-drafted word list), morphology and rules are limited, and nothing has been reviewed by a native speaker. Nynorsk words are never credited to it.' },
  nn: { lang: 'nn', name: 'Norwegian (Nynorsk)', pageTag: /^(nn|no)(-|$)/, experimental: 'The Norwegian (Nynorsk) pack is experimental: lemmatisation is seed-only (a machine-drafted word list, smaller than the Bokmål one), morphology and rules are limited, and nothing has been reviewed by a native speaker. Bokmål words are never credited to it.' },
  la: { lang: 'la', name: 'Latin', pageTag: /^la(-|$)/i, experimental: 'Latin analyser ported from the Romance app, 2026-10-17: Clementine-Vulgate orthography; no native review' },
};

/** The languages the parser CAN read (an analyser exists for them, loaded or not). */
export const PARSER_LANGUAGES: readonly string[] = Object.keys(LANGUAGE_META);

/** The language's parser metadata; undefined for a language the parser does not know. */
export const languageMeta = (languageId: string): LanguageMeta | undefined =>
  (Object.prototype.hasOwnProperty.call(LANGUAGE_META, languageId) ? LANGUAGE_META[languageId] : undefined);

/** Thrown by `parseSelection` for a language the parser knows but whose analyser has not been loaded (a bug in the caller, or a failed load). */
export class AnalyserNotLoaded extends Error {
  readonly languageId: string;
  constructor(languageId: string) {
    super(`The ${languageMeta(languageId)?.name ?? languageId} analyser is not loaded.`);
    this.name = 'AnalyserNotLoaded';
    this.languageId = languageId;
  }
}

const loaded = new Map<string, LanguageAdapter>();

/** Makes `adapter` the analyser the parser reads `languageId` with. Re-registering the same language replaces it. An unknown language is refused. */
export function registerAnalyser(languageId: string, adapter: LanguageAdapter): void {
  if (!languageMeta(languageId)) throw new RangeError(`No parser for language "${languageId}".`);
  loaded.set(languageId, adapter);
}

/** True when the language's analyser is in memory (a language the parser does not know is never loaded). */
export const hasAnalyser = (languageId: string): boolean => loaded.has(languageId);

/** The loaded analyser of a language; undefined when it is unknown or not loaded. */
export const getAnalyser = (languageId: string): LanguageAdapter | undefined => loaded.get(languageId);

/** Test hook: forget every registered analyser except those named in `keep`. */
export function clearAnalysers(keep: readonly string[] = []): void {
  for (const id of [...loaded.keys()]) if (!keep.includes(id)) loaded.delete(id);
}
