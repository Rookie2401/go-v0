import { describe, expect, it } from 'vitest';
import { arcAdapter } from '../../src/adapters/arc';
import { ids, LANGUAGE_ROWS } from '../../src/core';
import { resolveSelection } from '../../packages/repository-linguistics/src/resolver';
import { mapLanguageTag } from '../../packages/golearn-extension/src/language/resolve';
import { loadAnalyser } from '../../packages/golearn-extension/src/analysers/loaders';
import dan4 from '../../data/corpus/arc/daniel-2-4b.json';
import dan20 from '../../data/corpus/arc/daniel-2-20.json';

const read = (text: string) => arcAdapter.analyze(arcAdapter.tokenize(text)).filter(a => a.token.isWord);
describe('Biblical Aramaic source fixtures', () => {
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
    expect(new Set(read('דִּי')[0].candidates.map(c => c.pos))).toEqual(new Set(['SCONJ', 'CONJ']));
    const text = dan20.sections[0].paragraphs[0].sentences[0].text;
    const di = read(text).filter(a => arcAdapter.normalize(a.token.surface) === arcAdapter.normalize('דִּי'));
    expect(di.map(a => a.candidates[0].pos)).toEqual(['SCONJ', 'CONJ', 'SCONJ']);
    expect(di.every(a => a.candidates.length === 2)).toBe(true);
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

  it('loads through browser chunks and has separate Repository and Hebrew identities', async () => {
    expect((await loadAnalyser('arc'))?.lang).toBe('arc');
    expect(LANGUAGE_ROWS.find(l => l.id === 'arc')).toMatchObject({ script: 'Hebr', direction: 'rtl' });
    const resolved = resolveSelection({ languageId: 'arc', surface: 'מַלְכָּא֙', sentence: dan4.sections[0].paragraphs[0].sentences[0].text, now: '2026-11-05T00:00:00Z' });
    expect(resolved.units.some(u => u.kind === 'lexeme' && u.languageId === 'arc' && u.scriptId === 'Hebr')).toBe(true);
    expect(resolved.units.some(u => u.languageId === 'he')).toBe(false);
    expect(ids.lemma('arc', 'מֶלֶךְ', 'NOUN')).not.toBe(ids.lemma('he', 'מֶלֶךְ', 'NOUN'));
  });
});
