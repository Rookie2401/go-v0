/**
 * Coordinator's test: a better analyzer must reach a text that is already on the device, without disturbing it.
 *
 * Found in the audit: after the Spanish homograph rules were added, a database that already held the course texts
 * kept the old readings ("No sé" as a form of ser), because analyses are made at import and nothing asked for the
 * import again. The bundled-import signature now names the analyzers (test/ui/bootstrap.test.ts); this file checks
 * what the import then does to one text: same sentences, same tokens, same content version, new analyses only.
 */
import { describe, expect, it } from 'vitest';
import { createAdapterRegistry } from '../../src/adapters';
import { createMemoryStore } from '../../src/core';
import type { AdapterRegistry, LanguageAdapter } from '../../src/core';
import { importDocuments, loadBundledCorpus } from '../../src/ingest';

const real = createAdapterRegistry();
const clock = () => '2026-10-01T00:00:00.000Z';

/** The same registry with another Spanish adapter in place of the real one. */
function withSpanish(es: LanguageAdapter): AdapterRegistry {
  return { get: (lang) => (lang === 'es' ? es : real.get(lang)), all: () => real.all().map((a) => (a.lang === 'es' ? es : a)) };
}

/** An "older" Spanish adapter: an earlier version number, and the readings of each word in reverse order. */
const older: LanguageAdapter = {
  ...real.get('es'),
  version: '0-test',
  analyze: (tokens) => real.get('es').analyze(tokens).map((a) => ({ ...a, analyzer: 'adapter-es@0-test', candidates: [...a.candidates].reverse() })),
};

const doc = loadBundledCorpus().find((d) => d.id === 'camino-2-01')!;

describe('an analyzer upgrade re-analyses a text in place', () => {
  it('keeps sentences, tokens and the content version; replaces the analyses; and is then unchanged', async () => {
    expect(doc).toBeDefined();
    const store = createMemoryStore();

    const first = await importDocuments(store, withSpanish(older), [doc], { clock });
    expect(first.ok).toBe(true);
    expect(first.documents[0].action).toBe('created');
    const textId = first.documents[0].textId!;
    const before = {
      text: (await store.texts.get(textId))!,
      sentences: (await store.sentences.where('textId', textId)).map((s) => `${s.id}|${s.text}`).sort(),
      tokens: (await store.tokens.all()).map((t) => `${t.id}|${t.surface}|${t.start}`).sort(),
      analyses: await store.analyses.all(),
    };
    expect(before.analyses.length).toBeGreaterThan(0);
    expect(before.analyses.every((a) => a.analyzer === 'adapter-es@0-test' || !a.analyzer.startsWith('adapter-'))).toBe(true);

    const second = await importDocuments(store, real, [doc], { clock });
    expect(second.ok).toBe(true);
    expect(second.documents[0].action).toBe('updated');

    const after = {
      text: (await store.texts.get(textId))!,
      sentences: (await store.sentences.where('textId', textId)).map((s) => `${s.id}|${s.text}`).sort(),
      tokens: (await store.tokens.all()).map((t) => `${t.id}|${t.surface}|${t.start}`).sort(),
      analyses: await store.analyses.all(),
    };
    // the text itself is untouched: nothing a learner has seen or reported is orphaned
    expect(after.text.contentVersion).toBe(before.text.contentVersion);
    expect(after.sentences).toEqual(before.sentences);
    expect(after.tokens).toEqual(before.tokens);
    // the analyses are the new analyzer's, one machine analysis per token, none left from the old one
    const current = `adapter-es@${real.get('es').version}`;
    const machine = after.analyses.filter((a) => a.analyzer.startsWith('adapter-'));
    expect(machine.length).toBeGreaterThan(0);
    expect(machine.every((a) => a.analyzer === current)).toBe(true);
    const perToken = new Map<string, number>();
    for (const a of machine) perToken.set(a.tokenId, (perToken.get(a.tokenId) ?? 0) + 1);
    expect([...perToken.values()].every((n) => n === 1)).toBe(true);
    // and the reading that was wrong is now right: "no sé" is saber
    const tokens = await store.tokens.all();
    const se = tokens.find((t) => t.surface === 'sé')!;
    expect(se).toBeDefined();
    const reading = machine.find((a) => a.tokenId === se.id)!;
    expect(reading.lemmaId).toContain('saber');
    // the record says why the text was touched
    expect(after.text.transformations.slice(before.text.transformations.length).some((t) => /analyzer changed/.test(t.description))).toBe(true);

    const third = await importDocuments(store, real, [doc], { clock });
    expect(third.documents[0].action).toBe('unchanged');
  });
});
