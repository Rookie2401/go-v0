/**
 * Latin in the extension: the analyser chunk loads on demand through the loader, the parser's language table knows it, a Vulgate
 * sentence parses to a lemma and features, the adapter registry returns it, and it holds on a sample of the Latin corpus.
 */
import fs from 'node:fs';
import path from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createAdapterRegistry, laAdapter } from '../../src/adapters';
import { loadAnalyser } from '../../packages/golearn-extension/src/analysers/loaders';
import { clearAnalysers, getAnalyser, hasAnalyser, languageMeta, parseSelection } from '../../packages/golearn-extension/src/parser';
import { LANGUAGE_META } from '../../packages/golearn-extension/src/parser/registry';
import { registerAllAnalysers } from '../support/analysers';

beforeAll(() => { clearAnalysers(['sq']); });
afterAll(() => { registerAllAnalysers(); });

describe('Latin is a parser language and its own chunk', () => {
  it('has a row in the parser language table, experimental and honest', () => {
    const m = languageMeta('la')!;
    expect(m).toMatchObject({ lang: 'la', name: 'Latin' });
    expect(m.pageTag.test('la')).toBe(true);
    expect(m.pageTag.test('la-VA')).toBe(true);
    expect(m.pageTag.test('lad')).toBe(false);
    expect(m.experimental).toMatch(/no native review/);
    expect(Object.keys(LANGUAGE_META)).toContain('la');
  });
  it('is loaded on demand by getAnalyser after loadAnalyser, and not before', async () => {
    expect(hasAnalyser('la')).toBe(false);
    expect(getAnalyser('la')).toBeUndefined();
    const adapter = await loadAnalyser('la');
    expect(adapter).toBe(laAdapter);
    expect(hasAnalyser('la')).toBe(true);
    expect(getAnalyser('la')?.lang).toBe('la');
    expect(await loadAnalyser('la')).toBe(adapter); // idempotent
  });
  it('is the adapter the registry returns for la, with the bare version the registry composes', () => {
    const reg = createAdapterRegistry();
    expect(reg.get('la')).toBe(laAdapter);
    expect(reg.all().map((a) => a.lang)).toContain('la');
    expect(laAdapter.version).toBe('1');
  });
});

describe('parseSelection on a Vulgate sentence', () => {
  const sentence = 'In principio creavit Deus cælum et terram.';
  it('gives a lemma and features for a selected word', async () => {
    await loadAnalyser('la');
    const card = parseSelection({ surface: 'creavit', context: { kind: 'sentence', confidence: 1, sentence, selStart: sentence.indexOf('creavit'), selEnd: sentence.indexOf('creavit') + 7 }, languageId: 'la' });
    expect(card.languageId).toBe('la');
    expect(card.lemma).toBe('creo');
    expect(card.pos).toBe('VERB');
    const feats = Object.fromEntries(card.features.map((f) => [f.key, f.value]));
    expect(feats).toMatchObject({ Tense: 'Perf', Person: '3', Number: 'Sing' });
  });
  it('parses a ligature spelling without changing the surface', async () => {
    await loadAnalyser('la');
    const card = parseSelection({ surface: 'cælum', context: { kind: 'sentence', confidence: 1, sentence, selStart: sentence.indexOf('cælum'), selEnd: sentence.indexOf('cælum') + 5 }, languageId: 'la' });
    expect(card.surface).toBe('cælum');
    expect(card.lemma).toBe('caelum');
  });
});

describe('the Latin corpus', () => {
  const dir = path.join(__dirname, '..', '..', 'data', 'corpus', 'la');
  const vulgate = fs.existsSync(dir) ? fs.readdirSync(dir).filter((f) => f.startsWith('vulgate-') && f.endsWith('.json')) : [];
  it.skipIf(!vulgate.length)('reads at least 90 % of the words of the Vulgate sample with a lemma, and the unconfirmed guesses are marked', () => {
    let words = 0;
    let withLemma = 0;
    let confirmed = 0;
    for (const f of vulgate) {
      const j = JSON.parse(fs.readFileSync(path.join(dir, f), 'utf8')) as { sections: Array<{ paragraphs: Array<{ sentences: Array<{ text: string }> }> }> };
      for (const s of j.sections) for (const p of s.paragraphs) for (const sent of p.sentences) {
        const toks = laAdapter.tokenize(sent.text);
        for (const a of laAdapter.analyze(toks)) {
          if (!a.token.isWord) continue;
          words++;
          const c = a.candidates[0];
          if (c?.lemma) withLemma++;
          if (c && !c.unconfirmed) confirmed++;
          if (c?.unconfirmed) expect(c.confidence).toBeLessThanOrEqual(0.4);
        }
      }
    }
    expect(words).toBeGreaterThan(3000);
    expect(withLemma / words).toBeGreaterThan(0.9);
    expect(confirmed / words).toBeGreaterThan(0.85);
  });
});
