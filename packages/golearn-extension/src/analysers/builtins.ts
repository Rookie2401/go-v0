/**
 * The lean replacement for `packages/language-packs/src/builtins.ts` in the extension's own builds (the content script, the
 * background worker, the setup app): Albanian is linked in; every other language is whatever the parser's analyser registry
 * holds, which is filled when that language's `analysers/<id>.js` chunk has been loaded. Same synchronous signature as the
 * full module, so `createPackRuntime` and `installPack` are unchanged; an analyser that is not loaded is `undefined`.
 */
import { sqAdapter } from '../../../../src/adapters/sq';
import type { LanguageAdapter } from '../../../../src/core';
import { getAnalyser, registerAnalyser } from '../parser/registry';

registerAnalyser('sq', sqAdapter);

export function builtInAdapter(languageId: string): LanguageAdapter | undefined {
  return getAnalyser(languageId);
}
