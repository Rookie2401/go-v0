// Shared set-up of the Greek audit: the card's own parser with the indexes loaded the way the GoLearn extension loads them.
//   mode 'ext'    (default) the compiled Koine core + the Ancient and Modern shards of the sentence's words (packages/golearn-extension/src/lexicon/prepare.ts, LEXICON_SETS.el)
//   mode 'core'   the compiled core alone (the shards failed or are not shipped)
//   mode 'biblia' 'ext' + the FULL Koine index (what Biblia and GoReview install; the extension does not)
import fs from 'node:fs';
import path from 'node:path';
import { registerAllAnalysers } from 'C:/Users/CJWal/dev/go-v0-rc/test/support/analysers';
import { parseSelection } from 'C:/Users/CJWal/dev/go-v0-rc/packages/golearn-extension/src/parser';
import { createLexiconPreparer } from 'C:/Users/CJWal/dev/go-v0-rc/packages/golearn-extension/src/lexicon/prepare';
import { installGreekIndex } from 'C:/Users/CJWal/dev/go-v0-rc/src/adapters/greek/index-store';
import { resetElPeriodMemory } from 'C:/Users/CJWal/dev/go-v0-rc/src/adapters/greek/analyze';

const PUBLIC = 'C:/Users/CJWal/dev/go-v0/public';
registerAllAnalysers();
const fetcher = (async (input: RequestInfo | URL): Promise<Response> => {
  const url = String(input);
  const file = path.join(PUBLIC, decodeURIComponent(url.replace(/^disk:\/\//, '')));
  if (!fs.existsSync(file)) return new Response('missing', { status: 404 });
  return new Response(fs.readFileSync(file), { status: 200 });
}) as typeof fetch;
const preparer = createLexiconPreparer({ runtime: { getURL: (p: string) => `disk://${p}` } } as any, fetcher, undefined, 48);

export type Mode = 'ext' | 'core' | 'biblia';
let koineInstalled = false;
export async function prepare(mode: Mode, text: string): Promise<void> {
  if (mode === 'core') return;
  if (mode === 'biblia' && !koineInstalled) { installGreekIndex(JSON.parse(fs.readFileSync(`${PUBLIC}/lexicon/el/koine-index.json`, 'utf8'))); koineInstalled = true; }
  const r = await preparer.prepare('el', text);
  if (r.failed.length) console.log('!! shard failure: ' + r.failed.join('; '));
}
/** One card: the sentence is prepared (shards) and parsed exactly as the content script does; the period memory is NOT reset between sentences unless asked. */
export async function card(mode: Mode, sentence: string, word: string, at: number, varietyId?: string, fresh = true): Promise<any> {
  await prepare(mode, sentence);
  if (fresh) resetElPeriodMemory();
  const ctx = sentence !== word ? { kind: 'sentence' as const, confidence: 0.9, sentence, selStart: at, selEnd: at + word.length, ...(varietyId ? { varietyId } : {}) } : { kind: 'none' as const, confidence: 0, ...(varietyId ? { varietyId } : {}) };
  return parseSelection({ surface: word, languageId: 'el', context: ctx as any });
}
export const short = (s: string | undefined, n = 60): string => (s ?? '—').replace(/\s+/g, ' ').slice(0, n);
