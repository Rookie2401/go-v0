// Shared set-up for the Hebrew audit scripts: the analysers registered as the extension registers them, and BOTH full Hebrew indexes
// installed through the adapter's own shard loader (every shard of he/biblical and he/modern from go-v0/public/lexicon), which is the
// state the extension reaches after `prepareLexicon`. `coreOnly()` gives the compiled-core state instead.
import fs from 'node:fs';
import path from 'node:path';
import { registerAllAnalysers } from 'C:/Users/CJWal/dev/go-v0-rc/test/support/analysers';
import { parseSelection, parserAdapter } from 'C:/Users/CJWal/dev/go-v0-rc/packages/golearn-extension/src/parser';
import { createHebrewShardLoader } from 'C:/Users/CJWal/dev/go-v0-rc/src/adapters/hebrew/shards';
import { createPackRuntime, packFor } from 'C:/Users/CJWal/dev/go-v0-rc/packages/language-packs/src';
import { BASE, diskFetch } from 'C:/Users/CJWal/dev/go-v0-rc/test/language-packs/helpers';

export const PUB = 'C:/Users/CJWal/dev/go-v0/public';
export const LEX = `${PUB}/lexicon`;
export const BIBLIA = process.env.HE_GOLD_DIR ?? 'C:/Users/CJWal/dev/go-v0/packages/biblia/public/data/he';

registerAllAnalysers();
export const adapter: any = parserAdapter('he')!;
export { parseSelection };

const source = {
  async fetchJson(p: string) { return JSON.parse(fs.readFileSync(path.join(LEX, p), 'utf8')); },
  async fetchBytes(p: string) { return new Uint8Array(fs.readFileSync(path.join(LEX, p))); },
};
let loaded = false;
export async function loadFull(): Promise<void> {
  if (loaded) return;
  for (const set of ['he/biblical', 'he/modern']) {
    const loader = await createHebrewShardLoader(source as any, { base: set, maxLoaded: 200 });
    const keys = Object.keys((loader.manifest as any).shards).map((p) => (p === '_' ? '1' : p + 'אא'));
    const r = await loader.ensure(keys);
    if (r.failed.length) throw new Error(`shards failed: ${JSON.stringify(r.failed.slice(0, 3))}`);
  }
  loaded = true;
}

let runtime: any;
export const rt = (): any => (runtime ??= createPackRuntime(packFor('he')!, { fetch: diskFetch(path.resolve(PUB)), baseUrl: BASE }));

/** The card for the word at [start,end) of the sentence (or the word alone when sentence === word). */
export function card(sentence: string, word: string, at: number, extra: Record<string, unknown> = {}): any {
  const ctx = at >= 0 && sentence !== word
    ? { kind: 'sentence' as const, confidence: 0.9, sentence, selStart: at, selEnd: at + word.length, ...extra }
    : { kind: 'none' as const, confidence: 0, ...extra };
  return parseSelection({ surface: word, languageId: 'he', context: ctx as any });
}

/** The dictionary line as the card asks for it. */
export async function dictLine(c: any, word: string): Promise<string> {
  const variants = c.lemma ? [c.lemma, ...(adapter.lemmaVariants?.(c.lemma, c.pos) ?? [])] : [];
  const forms = [...new Set([...(c.lemma && !c.unconfirmed ? variants : []), word, ...(c.lemma && c.unconfirmed ? variants : [])])].slice(0, 8);
  try {
    const g: any = await rt().gloss(c.lemma && !c.unconfirmed ? c.lemma : word, c.pos, forms);
    return g?.senses?.length ? g.senses.slice(0, 2).map((s: any) => s.gloss).join(' ; ').slice(0, 90) : '∅';
  } catch (e) { return 'ERR ' + (e as Error).message; }
}

/** The adapter's word tokens of a text with their offsets. */
export function words(text: string): Array<{ surface: string; start: number; end: number }> {
  return adapter.tokenize(text).filter((t: any) => t.isWord).map((t: any) => ({ surface: t.surface, start: t.start, end: t.end }));
}

export const strip = (s: string): string => s.normalize('NFC').replace(/[\u0591-\u05AF\u05BD\u05BF\u05C0\u05C4\u05C5\u034F]/g, '');
export const bare = (s: string): string => s.normalize('NFC').replace(/[\u0591-\u05BD\u05BF-\u05C2\u05C4-\u05C7\u034F]/g, '');
