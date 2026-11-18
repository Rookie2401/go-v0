import { describe, expect, it } from 'vitest';
import { EL_CLASSICAL_PROFILE, EL_PROFILE } from '../../src/alphabet/sprint/profiles/el';
import { sprintUnitId } from '../../src/alphabet/sprint/ids';
import { scriptKnowledge } from '../../src/alphabet/sprint/knowledge';
import { profileChecks } from './sprint-kit';

const NEW_KEYS = ['ς', 'ου', 'αι', 'ει', 'οι', 'υι', 'αυ', 'ευ', 'ηυ', 'μπ', 'ντ', 'γκ', 'γγ', 'τσ', 'τζ', 'rule-accent', 'rule-breathing', 'rule-iota-subscript', 'rule-diaeresis'];
profileChecks(EL_PROFILE, { newKeys: NEW_KEYS });
profileChecks(EL_CLASSICAL_PROFILE, { newKeys: NEW_KEYS });

describe('Greek profiles: specifics', () => {
  it('a word ending in ς needs the final-sigma unit (both traditions)', () => {
    expect(EL_PROFILE.dependencies('ουσίας')).toEqual(expect.arrayContaining(['ς', 'Σ σ ς']));
    expect(EL_CLASSICAL_PROFILE.dependencies('λόγος')).toContain('ς');
  });
  it('a Modern μπ word needs the μπ digraph unit, not μ and π', () => {
    const d = EL_PROFILE.dependencies('μπάλα')!;
    expect(d).toContain('μπ');
    expect(d).not.toContain('Π π');
    expect(EL_PROFILE.dependencies('ΜΠΑΛΑ')).toContain('μπ');
  });
  it('a Classical word with rough breathing needs rule-breathing; Modern cannot model it', () => {
    expect(EL_CLASSICAL_PROFILE.dependencies('ὁ')).toEqual(expect.arrayContaining(['Ο ο', 'rule-breathing']));
    expect(EL_CLASSICAL_PROFILE.dependencies('ἡμέρα')).toContain('rule-breathing');
    expect(EL_CLASSICAL_PROFILE.dependencies('ἀρχή')).not.toContain('rule-breathing'); // smooth: silent
    expect(EL_CLASSICAL_PROFILE.dependencies('ᾳ')).not.toContain('rule-iota-subscript'); // silent: a word never waits for it
    expect(EL_CLASSICAL_PROFILE.dependencies('οὐ')).toContain('ου');
    expect(EL_PROFILE.dependencies('ὁ')).toBeUndefined();
    expect(EL_PROFILE.dependencies('λόγος')).not.toContain('rule-accent'); // stress only
  });
  it('a diaeresis keeps a digraph from forming; non-Greek text is not modelled', () => {
    const d = EL_PROFILE.dependencies('ναϊ')!;
    expect(d).not.toContain('αι');
    expect(d).toContain('rule-diaeresis');
    expect(EL_PROFILE.dependencies('hello')).toBeUndefined();
  });
  it('the two traditions give different card ids for the same letter', () => {
    expect(sprintUnitId('el', 'character', 'Β β', undefined)).toBe('class:el-alphabet:Β β');
    expect(sprintUnitId('el', 'character', 'Β β', EL_CLASSICAL_PROFILE.tradition!.id)).toBe('class:el-alphabet~classical:Β β');
    expect(EL_PROFILE.units.find((u) => u.key === 'Β β')!.sound).not.toBe(EL_CLASSICAL_PROFILE.units.find((u) => u.key === 'Β β')!.sound);
  });
  it('Modern knowledge transfers to Classical only as seen', () => {
    const hist = [1, 2, 3].map((i) => ({ at: `2026-11-1${i}T10:00:00.000Z`, rating: 3 }));
    const card = { unitId: sprintUnitId('el', 'character', 'Β β'), status: 'active' as const, due: '2026-11-17T12:00:00.000Z', stability: 5, lapses: 0, phase: 'review', history: hist };
    const modern = scriptKnowledge(EL_PROFILE, [card]);
    expect(['familiar', 'known']).toContain(modern.get('Β β')!.level);
    const classical = scriptKnowledge(EL_CLASSICAL_PROFILE, [card], modern);
    expect(classical.get('Β β')!.level).toBe('seen');
    expect(classical.get('Β β')!.basis).toBe('other-tradition');
    expect(scriptKnowledge(EL_CLASSICAL_PROFILE, [card]).get('Β β')!.level).toBe('new');
  });
});
