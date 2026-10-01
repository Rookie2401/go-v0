/**
 * Library runtime — STUB written by the coordinator so that the other packages compile.
 * Package S5 (docs/PLAN9.md) replaces the bodies; the exported names and signatures are the contract.
 */
import type { AdapterRegistry, AppStore, CatalogText, Library, LanguageCode, LexiconSource, TextFeatures, TextProfile } from '../core';

export interface LibraryDeps {
  store: AppStore;
  adapters: AdapterRegistry;
  /** Where the built library lives (default '/library'); a missing library is the normal state. */
  baseUrl?: string;
  fetch?: typeof fetch;
  lexicon?: (lang: LanguageCode) => LexiconSource | undefined;
  clock?: () => string;
}

export function createLibrary(_deps: LibraryDeps): Library {
  throw new Error('createLibrary: not implemented yet (PLAN9 package S5)');
}

/** The profile of a text already in the store (live sentences only), computed from its stored tokens and analyses. */
export async function profileOfStoredText(_store: AppStore, _textId: string): Promise<TextProfile | undefined> {
  throw new Error('profileOfStoredText: not implemented yet (PLAN9 package S5)');
}

/** Generic features of a stored text (see TextFeatures). */
export async function featuresOfStoredText(_store: AppStore, _textId: string): Promise<TextFeatures | undefined> {
  throw new Error('featuresOfStoredText: not implemented yet (PLAN9 package S5)');
}

export type { CatalogText };
