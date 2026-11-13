import { describe, expect, it } from 'vitest';
import { arcAdapter, arcCandidates, arcLexiconLookup, ARAMAIC_QUESTIONED_SOURCE_IDS } from '../../src/adapters/arc';
import { decodeOshbSegment } from '../../src/adapters/hebrew/oshb';
import { ARAMAIC_SEED } from '../../src/adapters/aramaic/seed';
import { ids, LANGUAGE_ROWS } from '../../src/core';
import { resolveSelection } from '../../packages/repository-linguistics/src/resolver';
import { mapLanguageTag } from '../../packages/golearn-extension/src/language/resolve';
import { readSelection, statusOf } from '../../packages/language-packs/src/analysis';
import { loadAnalyser } from '../../packages/golearn-extension/src/analysers/loaders';
import dan4 from '../../data/corpus/arc/daniel-2-4b.json';
import dan20 from '../../data/corpus/arc/daniel-2-20.json';

const read = (text: string) => arcAdapter.analyze(arcAdapter.tokenize(text)).filter(a => a.token.isWord);
const corpusDocs = Object.values(import.meta.glob<{ id: string; sections: Array<{ paragraphs: Array<{ sentences: Array<{ text: string; verseRefs?: string[] }> }> }> }>(
  '../../data/corpus/arc/*.json', { eager: true, import: 'default' }));
describe('Biblical Aramaic source fixtures', () => {
  it('decodes OSHB demonstrative particles consistently while retaining all attested alternatives', () => {
    expect(decodeOshbSegment('Tm', true)).toMatchObject({ pos: 'PART', morph: { PartType: 'Dem' } });
    expect(decodeOshbSegment('Tm', false)).toMatchObject({ pos: 'PART', morph: { PartType: 'Dem' } });
    expect(decodeOshbSegment('Tn', false)).toMatchObject({ pos: 'PART', morph: { Polarity: 'Neg' } });
  });

  it('recognizes the compiled source corpus without generating analyses for unattested forms', () => {
    expect(ARAMAIC_SEED.length).toBeGreaterThan(4000);
    for (const row of ARAMAIC_SEED) {
      const token = arcAdapter.tokenize(row.surface).find(t => t.isWord)!;
      const candidates = arcAdapter.analyze([token])[0].candidates;
      expect(candidates.some(c => (c.notes?.sourceWordIds as string[]).includes(row.sourceWordId)
        && (c.notes?.sourceCodes as string[]).includes(row.morph)), row.sourceWordId).toBe(true);
    }
    expect(read('בְּרֵאשִׁית')[0].candidates).toEqual([]);
    expect(read('xyz')[0].candidates).toEqual([]);
  });

  it('keeps all eleven audit flags attached to their exact source readings', () => {
    expect(ARAMAIC_QUESTIONED_SOURCE_IDS.size).toBe(11);
    for (const id of ARAMAIC_QUESTIONED_SOURCE_IDS) {
      const row = ARAMAIC_SEED.find(r => r.sourceWordId === id)!;
      const [, chapter, verse] = /^(?:Dan(?:iel)?|Ezra) (\d+):(\d+)$/.exec(row.reference)!;
      const book = row.reference.startsWith('Ezra') ? 'EZR' : 'DAN';
      const docId = `${book === 'DAN' ? 'daniel' : 'ezra'}-${chapter}-${verse}`;
      const sentence = corpusDocs.find(d => d.id === docId)?.sections.flatMap(s => s.paragraphs.flatMap(p => p.sentences))
        .find(s => s.verseRefs?.includes(`${book}.${chapter}.${verse}`));
      expect(sentence, row.reference).toBeDefined();
      const verseRows = ARAMAIC_SEED.filter(r => r.reference === row.reference);
      const position = verseRows.findIndex(r => r.sourceWordId === id);
      const analysis = arcAdapter.analyze(arcAdapter.tokenize(sentence!.text)).filter(a => a.token.isWord)[position];
      const flagged = analysis?.candidates.find(c => (c.notes?.sourceWordIds as string[]).includes(id));
      expect(flagged?.confidence, `${row.reference}: ${row.surface}`).toBe(0.98);
      expect(flagged?.notes?.reviewStatus, `${row.reference}: ${row.surface}`).toBe('requires-review');
      expect(statusOf(flagged!, analysis!.candidates), `${row.reference}: pack status`).toBe('requires-review');
      const selectedToken = arcAdapter.tokenize(sentence!.text).filter(t => t.isWord)[position];
      const resolved = resolveSelection({ languageId: 'arc', surface: selectedToken.surface, sentence: sentence!.text,
        selStart: selectedToken.start, selEnd: selectedToken.end, now: '2026-11-05T00:00:00Z' });
      const chosen = resolved.analysis.candidates[resolved.analysis.chosen!];
      expect(chosen.reviewStatus, `${row.reference}: chosen source reading`).toBe('requires-review');
      expect(resolved.analysis.status).toBe('requires-review');
      const morphUnits = resolved.units.filter(unit => chosen.constructionIds?.includes(unit.unitId));
      expect(morphUnits.length, `${row.reference}: morphology units`).toBeGreaterThan(0);
      expect(morphUnits.every(unit => unit.status === 'requires-review')).toBe(true);
    }
    const cleanKing = read('מַלְכָּא֙')[0].candidates.find(c => c.notes?.reviewStatus === undefined);
    expect(cleanKing).toBeDefined();
    expect(statusOf(cleanKing!, read('מַלְכָּא֙')[0].candidates)).not.toBe('requires-review');
    // Out of context the clean singular reading leads; Ezra 5:9's questioned plural stays listed, flagged and below it.
    const bareDenah = readSelection(arcAdapter, 'דְנָה֙');
    expect(bareDenah.top?.morph).toMatchObject({ Number: 'Sing' });
    expect(bareDenah.status).not.toBe('requires-review');
    const questionedDenah = bareDenah.candidates.find(c => (c.notes?.sourceWordIds as string[]).includes('15TZB'));
    expect(questionedDenah?.notes?.reviewStatus).toBe('requires-review');
    expect(statusOf(questionedDenah!, bareDenah.candidates)).toBe('requires-review');
    expect(questionedDenah!.confidence).toBeLessThan(bareDenah.top!.confidence);
    // Ezra 7:18 עֲלָ֨ךְ: the source links it to the Hebrew entry 5921 a; kept as the source has it, flagged for review.
    const alakh = arcCandidates({ surface: 'עֲלָ֨ךְ', normalized: 'עֲלָ֨ךְ', start: 0, end: 6, isWord: true } as Parameters<typeof arcCandidates>[0])
      .find(c => (c.notes?.sourceWordIds as string[]).includes('15cH4'));
    expect(alakh?.notes).toMatchObject({ lemmaId: '5921 a', reviewStatus: 'requires-review' });
    expect(String(alakh?.notes?.reviewReason)).toMatch(/Hebrew dictionary entry/);
  });

  it('looks up an unattested citation headword from corpus evidence without fabricating a form analysis', () => {
    const entries = arcLexiconLookup('חֲיָא', 'VERB');
    expect(entries.length).toBeGreaterThan(0);
    expect(entries[0]).toMatchObject({ headword: 'חֲיָא', lemmaId: '2418', pos: 'VERB', glossAvailable: true, source: 'oshb-aramaic' });
    expect(entries[0].attestedForms).toContain('חֱיִ֔י');
    expect(arcAdapter.analyze(arcAdapter.tokenize('חֲיָא'))[0].candidates).toEqual([]);
    expect(arcLexiconLookup('חיא', 'VERB').some(e => e.headword === 'חֲיָא')).toBe(true);
    expect(arcLexiconLookup('מלכא', 'NOUN').some(e => e.headword === 'מֶלֶךְ')).toBe(true);
    expect(arcLexiconLookup('מַלְכָּא֙', 'NOUN').some(e => e.headword === 'מֶלֶךְ')).toBe(true);
    expect(arcLexiconLookup('חֲיָא', 'NOUN')).toEqual([]);
    expect(arcLexiconLookup('אָב', 'NOUN')).toEqual([]); // Hebrew data never enters the Aramaic index.
    expect(arcLexiconLookup('בראשית')).toEqual([]);
  });

  it.each([
    ['מַלְכָּא֙', 'NOUN', { Gender: 'Masc', Number: 'Sing', State: 'Det' }],
    ['חֱיִ֔י', 'VERB', { Binyan: 'Peal', Conj: 'Imp', Person: '2', Number: 'Sing' }],
    ['נְחַוֵּֽא', 'VERB', { Binyan: 'Pael', Conj: 'Impf', Person: '1', Number: 'Plur' }],
    ['מְבָרַ֔ךְ', 'VERB', { Binyan: 'Pael', Conj: 'PassPart', Gender: 'Masc' }],
    ['שְׁמֵ֤הּ', 'NOUN', { State: 'Cons', Gender: 'Masc', Number: 'Sing' }],
    ['חָכְמְתָ֛א', 'NOUN', { State: 'Det', Gender: 'Fem', Number: 'Sing' }],
  ] as const)('matches OSHB gold source word %s', (form, pos, features) => {
    const top = read(form)[0].candidates[0];
    expect(top.pos).toBe(pos);
    expect(top.morph).toMatchObject(features);
    expect(top.origin).toBe('dictionary');
    expect(top.notes?.code).toMatch(/^A/);
  });

  it('keeps both readings of di in isolation and uses the exact source passage to rank them', () => {
    expect(read('דִּי')[0].candidates.map(c => c.pos)).toEqual(expect.arrayContaining(['SCONJ', 'CONJ']));
    const text = dan20.sections[0].paragraphs[0].sentences[0].text;
    const di = read(text).filter(a => arcAdapter.normalize(a.token.surface) === arcAdapter.normalize('דִּי'));
    expect(di.every(a => a.candidates.length > 1)).toBe(true);
  });

  it('lowers confidence for unpointed forms, preserves alternatives, and never guesses Hebrew or other dialects', () => {
    expect(read('מלכא')[0].candidates[0].confidence).toBeLessThan(0.85);
    expect(read('בְּרֵאשִׁית')[0].candidates).toEqual([]);
    const tokens = arcAdapter.tokenize('מַלְכָּא');
    expect(arcAdapter.analyze(tokens, { varietyId: 'targum-onkelos' })[0].candidates).toEqual([]);
    expect(mapLanguageTag('arc-Hebr')).toMatchObject({ kind: 'pack', languageId: 'arc', varietyId: 'arc-bib' });
    expect(mapLanguageTag('arc-Syrc').kind).not.toBe('pack');
    expect(mapLanguageTag('syc').kind).not.toBe('pack');
  });

  it('keeps UTF-16 token and morpheme offsets in mixed scripts and decomposed text', () => {
    const text = ('English 😀 לְעַבְדָ֖ךְ, מַלְכָּא֙').normalize('NFD');
    for (const token of arcAdapter.tokenize(text)) expect(text.slice(token.start, token.end)).toBe(token.surface);
    const a = read(text).find(a => a.candidates[0]?.parts?.length === 3)!;
    expect(a).toBeDefined();
    for (const part of a.candidates[0].parts ?? []) expect(a.token.surface.slice(part.start, part.end)).toBe(part.text);
    expect(a.candidates[0].parts?.map(p => p.kind)).toEqual(['prefix', 'stem', 'suffix']);
    expect(read('מַלְכָּא')[0].candidates[0].lemma).toBe('מֶלֶךְ');
  });

  it('returns defensive copies from the exact-surface candidate cache', () => {
    const token = arcAdapter.tokenize('לְעַבְדָ֖ךְ')[0];
    const first = arcCandidates(token);
    const expectedRefs = [...first[0].notes!.references as string[]];
    first[0].notes!.references = ['mutated'];
    first[0].morph.Gender = 'mutated';
    first[0].parts![0].morph!.Definite = 'mutated';
    first[0].parts![0].start = 99;
    const second = arcCandidates(token);
    expect(second[0].notes!.references).toEqual(expectedRefs);
    expect(second[0].morph.Gender).not.toBe('mutated');
    expect(second[0].parts![0].morph!.Definite).not.toBe('mutated');
    expect(second[0].parts![0].start).toBe(0);
  });

  it('loads through browser chunks and has separate Repository and Hebrew identities', async () => {
    expect((await loadAnalyser('arc'))?.lang).toBe('arc');
    expect(LANGUAGE_ROWS.find(l => l.id === 'arc')).toMatchObject({ script: 'Hebr', direction: 'rtl' });
    const resolved = resolveSelection({ languageId: 'arc', surface: 'מַלְכָּא֙', sentence: dan4.sections[0].paragraphs[0].sentences[0].text, now: '2026-11-05T00:00:00Z' });
    expect(resolved.units.some(u => u.kind === 'lexeme' && u.languageId === 'arc' && u.scriptId === 'Hebr')).toBe(true);
    expect(resolved.units.some(u => u.languageId === 'he')).toBe(false);
    expect(ids.lemma('arc', 'מֶלֶךְ', 'NOUN')).not.toBe(ids.lemma('he', 'מֶלֶךְ', 'NOUN'));
  });
});
