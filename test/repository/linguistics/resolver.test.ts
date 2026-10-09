// @vitest-environment node
import { describe, expect, it } from 'vitest';
import {
  validateAnalysis, validateRelation, validateUnit,
} from '../../../packages/repository-contract/src';
import type { AnalysisCandidate, ProvenanceSource } from '../../../packages/repository-contract/src';
import { albanianPack, genericPack, resolveSelection, statusFor } from '../../../packages/repository-linguistics/src';

const NOW = '2026-10-08T10:00:00.000Z';
const S = 'Fëmijët lexojnë librin.';

const cand = (confidence: number, source: ProvenanceSource, lexemeId = 'lemma:sq:a:NOUN', features: Record<string, string> = {}): AnalysisCandidate => ({
  lexemeId, features, confidence, provenance: { source, ref: 'test', confidence },
});

describe('resolveSelection — "librin" in a sentence', () => {
  const r = resolveSelection({ languageId: 'sq', surface: 'librin', sentence: S, now: NOW });

  it('ids follow the contract and the form is the selection', () => {
    expect(r.formId).toBe('form:sq:librin');
    const form = r.units.find((u) => u.unitId === r.formId)!;
    expect(form.kind).toBe('form');
    expect(form.label).toBe('librin');
    expect(r.analysis.formId).toBe('form:sq:librin');
    expect(r.analysis.sentenceKey).toMatch(/^[0-9a-f]{12}$/);
  });

  it('has the lexeme, its sense and the morph construction', () => {
    const lex = r.units.find((u) => u.unitId === 'lemma:sq:libër:NOUN')!;
    expect(lex.kind).toBe('lexeme');
    expect(lex.label).toBe('libër');
    expect(lex.pos).toBe('NOUN');
    const sense = r.units.find((u) => u.kind === 'sense')!;
    expect(sense.unitId).toBe('sense:sq:libër:NOUN:1');
    expect(sense.label).toBe('book');
    const morph = r.units.find((u) => u.kind === 'morph-construction')!;
    expect(morph.unitId).toBe('morph:sq:NOUN:Case=Acc|Definite=Def|Gender=Masc|Number=Sing');
    expect(morph.label).toBe('definite masculine accusative singular');
  });

  it('pins the exact feature keys the adapter yields for "librin"', () => {
    const form = r.units.find((u) => u.unitId === r.formId)!;
    expect(form.features).toEqual({ Case: 'Acc', Definite: 'Def', Gender: 'Masc', Number: 'Sing' });
    expect(r.analysis.candidates[0].features).toEqual({ Case: 'Acc', Definite: 'Def', Gender: 'Masc', Number: 'Sing' });
  });

  it('relates form → lexeme, sense → lexeme, form → morph construction', () => {
    const has = (from: string, rel: string, to: string) => r.relations.some((x) => x.fromId === from && x.relation === rel && x.toId === to);
    expect(has('form:sq:librin', 'form-of', 'lemma:sq:libër:NOUN')).toBe(true);
    expect(has('sense:sq:libër:NOUN:1', 'sense-of', 'lemma:sq:libër:NOUN')).toBe(true);
    expect(has('form:sq:librin', 'realizes', 'morph:sq:NOUN:Case=Acc|Definite=Def|Gender=Masc|Number=Sing')).toBe(true);
    // librin has no unusual letters: no pronunciation pattern
    expect(r.units.some((u) => u.kind === 'pronunciation-pattern')).toBe(false);
  });

  it('the analysis keeps the candidate with provenance, and statuses follow the rules (a rule-derived form is provisional)', () => {
    expect(r.analysis.candidates).toHaveLength(1);
    expect(r.analysis.chosen).toBe(0);
    const c = r.analysis.candidates[0];
    expect(c.lexemeId).toBe('lemma:sq:libër:NOUN');
    expect(c.senseId).toBe('sense:sq:libër:NOUN:1');
    expect(c.constructionIds).toEqual(['morph:sq:NOUN:Case=Acc|Definite=Def|Gender=Masc|Number=Sing']);
    expect(c.confidence).toBe(0.85);
    expect(c.provenance.source).toBe('rule');
    expect(c.provenance.ref).toMatch(/^adapter-sq@/);
    expect(r.analysis.status).toBe('provisional'); // rule reading: never high-confidence
    expect(r.analysis.analyzerId).toMatch(/^adapter-sq@/);
    expect(r.coverage.known).toBe(true);
  });

  it('every row passes the contract validators', () => {
    for (const u of r.units) expect(validateUnit(u), u.unitId).toEqual([]);
    for (const x of r.relations) expect(validateRelation(x), `${x.fromId} ${x.relation} ${x.toId}`).toEqual([]);
    expect(validateAnalysis(r.analysis)).toEqual([]);
  });

  it('offsets, a missing offset and a wrong offset all find the same word', () => {
    const start = S.indexOf('librin');
    const byOffset = resolveSelection({ languageId: 'sq', surface: 'librin', sentence: S, selStart: start, selEnd: start + 6, now: NOW });
    const wrong = resolveSelection({ languageId: 'sq', surface: 'librin', sentence: S, selStart: 0, selEnd: 3, now: NOW });
    expect(byOffset.analysis.analysisId).toBe(r.analysis.analysisId);
    expect(wrong.analysis.analysisId).toBe(r.analysis.analysisId);
  });

  it('a supplied sentenceKey is kept; a surface missing from the sentence is read alone', () => {
    expect(resolveSelection({ languageId: 'sq', surface: 'librin', sentence: S, sentenceKey: 'abc', now: NOW }).analysis.sentenceKey).toBe('abc');
    const lost = resolveSelection({ languageId: 'sq', surface: 'librin', sentence: 'Nuk ka asgjë këtu.', sentenceKey: 'abc', now: NOW });
    expect(lost.analysis.sentenceKey).toBeUndefined();
    expect(lost.coverage.notes.join(' ')).toMatch(/not found/);
  });
});

describe('resolveSelection — out of context, ambiguity, pronunciation, phrases', () => {
  it('a surface alone carries no sentenceKey and keeps all candidates', () => {
    const r = resolveSelection({ languageId: 'sq', surface: 'jetë', now: NOW });
    expect(r.analysis.sentenceKey).toBeUndefined();
    expect(r.analysis.candidates.length).toBeGreaterThan(1);
    expect(r.coverage.notes.join(' ')).toMatch(/No sentence context/);
    const lexemes = r.units.filter((u) => u.kind === 'lexeme').map((u) => u.unitId);
    expect(lexemes).toContain('lemma:sq:jetë:NOUN');
    expect(lexemes).toContain('lemma:sq:jam:VERB'); // a noun and a verb reading of one form
    expect(r.analysis.status).toBe('conflicted');
    expect(r.analysis.chosen).toBeDefined();
    expect(r.analysis.candidates[r.analysis.chosen!].confidence).toBe(Math.max(...r.analysis.candidates.map((c) => c.confidence)));
    for (const rel of r.relations.filter((x) => x.relation === 'form-of')) expect(rel.confidence).toBeGreaterThan(0);
  });

  it('a very ambiguous little word ("e") is conflicted and keeps different lemmas', () => {
    const r = resolveSelection({ languageId: 'sq', surface: 'e', now: NOW });
    expect(new Set(r.analysis.candidates.map((c) => c.lexemeId)).size).toBeGreaterThan(1);
    expect(r.analysis.status).toBe('conflicted');
  });

  it('a hand-lexicon word that nothing competes with is high-confidence', () => {
    const r = resolveSelection({ languageId: 'sq', surface: 'flas', now: NOW });
    expect(r.analysis.candidates).toHaveLength(1);
    expect(r.analysis.candidates[0].provenance.source).toBe('hand-lexicon');
    expect(r.analysis.status).toBe('high-confidence');
    expect(r.units.find((u) => u.unitId === 'lemma:sq:flas:VERB')!.status).toBe('high-confidence');
  });

  it('a pronunciation-pattern unit appears only when the adapter has notes', () => {
    const r = resolveSelection({ languageId: 'sq', surface: 'shtëpi', now: NOW });
    const pron = r.units.filter((u) => u.kind === 'pronunciation-pattern');
    expect(pron.length).toBeGreaterThan(0);
    expect(pron.every((u) => u.varietyId === 'sq-standard')).toBe(true);
    expect(pron.some((u) => u.label.startsWith('ë:'))).toBe(true);
    const rel = r.relations.filter((x) => x.relation === 'pronounced-as');
    expect(rel.length).toBe(pron.length);
    expect(rel.every((x) => x.varietyId === 'sq-standard' && x.fromId === r.formId)).toBe(true);
  });

  it('a word the list does not know is a provisional guess with no gloss', () => {
    const r = resolveSelection({ languageId: 'sq', surface: 'xhyrtazzo', now: NOW });
    expect(r.analysis.status === 'provisional' || r.analysis.candidates.length === 0).toBe(true);
    expect(r.units.filter((u) => u.kind === 'sense')).toEqual([]);
    expect(r.coverage.known).toBe(false);
  });

  it('a multiword unit covers the selection when the phrase list has it', () => {
    // find a phrase from the phrase list through the adapter, without naming one by hand
    const sentences = ['Mirëdita, si jeni?', 'Faleminderit shumë.', 'Të lutem, më ndihmo.', 'Si quhesh ti?', 'Më vjen mirë.', 'Mirë se vini.', 'Natën e mirë!', 'Mirëmëngjes, zonja.'];
    let found = false;
    for (const s of sentences) {
      for (const w of s.replace(/[.,!?]/g, '').split(' ')) {
        const r = resolveSelection({ languageId: 'sq', surface: w, sentence: s, now: NOW });
        const mw = r.units.find((u) => u.kind === 'multiword');
        if (!mw) continue;
        found = true;
        expect(mw.unitId).toMatch(/^phrase:sq:/);
        expect(r.relations.some((x) => x.fromId === mw.unitId && x.relation === 'contains' && x.toId === r.formId)).toBe(true);
        expect(validateUnit(mw)).toEqual([]);
      }
    }
    expect(found).toBe(true);
  });
});

describe('generic fallback', () => {
  it('a non-Latin surface gets only a provisional form unit', () => {
    const r = resolveSelection({ languageId: 'sq', surface: 'книга', now: NOW });
    expect(r.units).toHaveLength(1);
    expect(r.units[0]).toMatchObject({ kind: 'form', status: 'provisional', provenance: { source: 'parser', ref: 'generic', confidence: 0.1 } });
    expect(r.relations).toEqual([]);
    expect(r.coverage.known).toBe(false);
    expect(r.coverage.notes.length).toBeGreaterThan(0);
  });

  it('a language without an adapter (th) gets only a provisional form unit', () => {
    const r = resolveSelection({ languageId: 'th', surface: 'หนังสือ', sentence: 'ฉันอ่านหนังสือ', now: NOW });
    expect(r.formId).toBe('form:th:หนังสือ');
    expect(r.units).toHaveLength(1);
    expect(r.units[0].status).toBe('provisional');
    expect(r.analysis.status).toBe('provisional');
    expect(r.coverage.known).toBe(false);
    expect(validateAnalysis(r.analysis)).toEqual([]);
  });

  it('never throws, even for empty or odd input', () => {
    for (const surface of ['', '   ', '...', '123', 'a'.repeat(5000)]) {
      expect(() => resolveSelection({ languageId: 'sq', surface, now: NOW })).not.toThrow();
    }
    expect(() => resolveSelection({ languageId: '', surface: 'x', now: NOW })).not.toThrow();
  });
});

describe('statusFor', () => {
  it('verified only when a person reviewed the source', () => {
    expect(statusFor(cand(0.5, 'rule'), [cand(0.5, 'rule')], { reviewedByPerson: true })).toBe('verified');
    expect(statusFor(cand(0.95, 'hand-lexicon'), [cand(0.95, 'hand-lexicon')])).not.toBe('verified');
    const r = cand(0.95, 'reviewer');
    expect(statusFor(r, [r])).toBe('verified');
  });

  it('high-confidence: hand lexicon or dictionary, >= 0.85, no rival within 0.15', () => {
    const a = cand(0.9, 'hand-lexicon');
    expect(statusFor(a, [a])).toBe('high-confidence');
    const d = cand(0.85, 'dictionary');
    expect(statusFor(d, [d])).toBe('high-confidence');
    const low = cand(0.84, 'hand-lexicon');
    expect(statusFor(low, [low])).toBe('provisional');
    const rule = cand(0.95, 'rule');
    expect(statusFor(rule, [rule])).toBe('provisional');
    const unconf = cand(0.9, 'hand-lexicon');
    expect(statusFor(unconf, [unconf], { unconfirmed: true })).toBe('provisional');
  });

  it('a far-away weaker rival does not matter; a rival within 0.15 of the same lemma and features does not conflict', () => {
    const top = cand(0.95, 'hand-lexicon');
    const weak = cand(0.7, 'hand-lexicon', 'lemma:sq:b:NOUN');
    expect(statusFor(top, [top, weak])).toBe('high-confidence');
    expect(statusFor(weak, [top, weak])).toBe('provisional');
    const twin = cand(0.9, 'hand-lexicon');
    expect(statusFor(top, [top, twin])).not.toBe('conflicted');
    expect(statusFor(top, [top, twin])).toBe('provisional'); // not high-confidence: a rival sits within 0.15
  });

  it('conflicted: different lemma or different features within 0.15 of the top', () => {
    const a = cand(0.9, 'hand-lexicon');
    const b = cand(0.8, 'hand-lexicon', 'lemma:sq:b:VERB');
    expect(statusFor(a, [a, b])).toBe('conflicted');
    expect(statusFor(b, [a, b])).toBe('conflicted');
    const f1 = cand(0.9, 'hand-lexicon', 'lemma:sq:a:NOUN', { Case: 'Nom' });
    const f2 = cand(0.88, 'hand-lexicon', 'lemma:sq:a:NOUN', { Case: 'Acc' });
    expect(statusFor(f1, [f1, f2])).toBe('conflicted');
    const edge = cand(0.75, 'hand-lexicon', 'lemma:sq:b:VERB'); // exactly 0.15 below 0.9
    expect(statusFor(a, [a, edge])).toBe('conflicted');
    const out = cand(0.74, 'hand-lexicon', 'lemma:sq:b:VERB');
    expect(statusFor(a, [a, out])).toBe('high-confidence');
  });

  it('is never invalidated', () => {
    for (const c of [cand(0, 'rule'), cand(1, 'hand-lexicon'), cand(0.5, 'learner')]) expect(statusFor(c, [c])).not.toBe('invalidated');
  });
});

describe('packs', () => {
  it('albanianPack is built from the adapter', () => {
    const p = albanianPack();
    expect(p.packId).toBe('pack:sq');
    expect(p.languageId).toBe('sq');
    expect(p.analyzerId).toBe(`adapter-sq@${p.version}`);
    expect(p.reviewStatus).toBe('machine-drafted');
    expect(p.licences.length).toBeGreaterThan(0);
    expect(p.coverage.notes.join(' ')).toMatch(/dictionary/);
    if (p.coverage.lexemes !== undefined) expect(p.coverage.lexemes).toBeGreaterThan(100);
  });

  it('genericPack describes a form-only pack', () => {
    const p = genericPack('th');
    expect(p).toMatchObject({ languageId: 'th', reviewStatus: 'machine-drafted' });
    expect(p.coverage.lexemes).toBeUndefined();
  });
});
