/**
 * German constructions and phrase units, on hand-built analyses in the conventions of docs/PLAN11.md (the sentence
 * layer is another package): every construction fires on its own shape and stays silent on a near miss.
 */
import { afterAll, describe, expect, it } from 'vitest';
import type { AnalysisCandidate, AnalyzedToken, PartOfSpeech, PatternCandidate, RawToken } from '../../src/core';
import { GERMAN_CONSTRUCTION_INFO, GERMAN_CONSTRUCTION_KEYS, GERMAN_PHRASE_RULES, detectGermanConstructions } from '../../src/adapters/german/constructions';
import { PHRASE_UNITS, PREPOSITION_FRAMES } from '../../src/adapters/german/phrases';
import { matchPhraseRules } from '../../src/adapters/shared';
import { deAdapter } from '../../src/adapters/de';

// ───────────────────────────── helpers ─────────────────────────────

type Defs = Record<string, AnalysisCandidate | AnalysisCandidate[]>;

const C = (pos: PartOfSpeech, lemma: string, morph: Record<string, string> = {}, extra: Partial<AnalysisCandidate> = {}): AnalysisCandidate =>
  ({ pos, lemma, morph, confidence: 0.9, ...extra });
const verb = (lemma: string, morph: Record<string, string> = {}, extra: Partial<AnalysisCandidate> = {}) =>
  C('VERB', lemma, { VerbForm: 'Fin', Mood: 'Ind', Tense: 'Pres', ...morph }, extra);
const aux = (lemma: string, morph: Record<string, string> = {}) => C('AUX', lemma, { VerbForm: 'Fin', Mood: 'Ind', Tense: 'Pres', ...morph });
const inf = (lemma: string) => C('VERB', lemma, { VerbForm: 'Inf' });
const ptc = (lemma: string) => C('VERB', lemma, { VerbForm: 'Part', Tense: 'Past' });
const adv = (lemma: string, morph: Record<string, string> = {}) => C('ADV', lemma, morph);
const noun = (lemma: string, morph: Record<string, string> = {}) => C('NOUN', lemma, morph);
const ICH = C('PRON', 'ich', { PronType: 'Prs', Case: 'Nom', Person: '1', Number: 'Sing' });
const ER = C('PRON', 'er', { PronType: 'Prs', Case: 'Nom', Person: '3', Number: 'Sing', Gender: 'Masc' });
const DU = C('PRON', 'du', { PronType: 'Prs', Case: 'Nom', Person: '2', Number: 'Sing' });
const ES = C('PRON', 'es', { PronType: 'Prs', Case: 'Nom,Acc', Person: '3', Number: 'Sing', Gender: 'Neut' });

function build(text: string, defs: Defs = {}): { tokens: RawToken[]; analyses: AnalyzedToken[] } {
  const tokens: RawToken[] = [];
  const analyses: AnalyzedToken[] = [];
  const seen: Record<string, number> = {};
  for (const m of text.matchAll(/[\p{L}\p{N}]+|[^\s\p{L}\p{N}]/gu)) {
    const surface = m[0];
    const isWord = /\p{L}/u.test(surface);
    const start = m.index ?? 0;
    const t: RawToken = { surface, start, end: start + surface.length, isWord, normalized: surface.normalize('NFC').toLocaleLowerCase('de') };
    tokens.push(t);
    const n = seen[surface] ?? 0;
    seen[surface] = n + 1;
    const d = defs[`${surface}#${n}`] ?? defs[surface];
    analyses.push({ token: t, candidates: isWord && d ? (Array.isArray(d) ? d : [d]) : [], analyzer: 'test' });
  }
  return { tokens, analyses };
}

const fired = new Set<string>();

function run(text: string, defs: Defs = {}) {
  const { tokens, analyses } = build(text, defs);
  const out = detectGermanConstructions(tokens, analyses);
  for (const p of out) {
    fired.add(p.key);
    expect(p.title.length).toBeGreaterThan(0);
    expect(p.explanation.length).toBeGreaterThan(20);
    expect(p.confidence).toBeGreaterThan(0);
    expect(p.confidence).toBeLessThanOrEqual(0.95);
    expect(p.tokenIndexes.length).toBeGreaterThan(0);
    for (const i of p.tokenIndexes) expect(tokens[i]?.isWord).toBe(true);
  }
  const at = (surface: string, nth = 0): number => {
    let seen2 = 0;
    for (let i = 0; i < tokens.length; i++) if (tokens[i].surface === surface && seen2++ === nth) return i;
    throw new Error(`no token "${surface}"`);
  };
  const find = (key: string): PatternCandidate | undefined => out.find((p) => p.key === key);
  const all = (key: string): PatternCandidate[] => out.filter((p) => p.key === key);
  const keys = (): string[] => out.map((p) => p.key);
  return { tokens, analyses, out, at, find, all, keys };
}

// ───────────────────────────── constructions ─────────────────────────────

describe('German constructions: clause structure', () => {
  it('verb-second-inversion: something other than the subject first, the verb second, the subject after it', () => {
    const r = run('Heute gehe ich nach Hause.', { Heute: adv('heute'), gehe: verb('gehen', { Person: '1', Number: 'Sing' }), ich: ICH });
    expect(r.find('verb-second-inversion')?.tokenIndexes).toEqual([0, 1, 2]);
    // an object in front
    const o = run('Den Mann sieht er.', { Den: C('DET', 'der', { Case: 'Acc', Gender: 'Masc', Number: 'Sing' }), Mann: noun('Mann', { Case: 'Acc' }), sieht: verb('sehen'), er: ER });
    expect(o.find('verb-second-inversion')?.tokenIndexes).toEqual([0, 2, 3]);
    // a question word
    const q = run('Wann kommst du?', { Wann: adv('wann', { PronType: 'Int' }), kommst: verb('kommen', { Person: '2' }), du: DU });
    expect(q.find('verb-second-inversion')?.tokenIndexes).toEqual([0, 1, 2]);
    // behind a fronted subordinate clause
    const s = run('Wenn er kommt, gehe ich.', { Wenn: C('SCONJ', 'wenn'), er: ER, kommt: verb('kommen'), gehe: verb('gehen'), ich: ICH });
    expect(s.all('verb-second-inversion').map((p) => p.tokenIndexes)).toEqual([[4, 5]]);
  });

  it('verb-second-inversion stays silent: subject first, a subordinate clause, an unknown word, a copula sentence with das', () => {
    expect(run('Ich gehe heute nach Hause.', { Ich: ICH, gehe: verb('gehen'), heute: adv('heute') }).find('verb-second-inversion')).toBeUndefined();
    expect(run('Ich weiß, dass ich heute komme.', { ich: ICH, dass: C('SCONJ', 'dass'), heute: adv('heute'), komme: verb('kommen') }).find('verb-second-inversion')).toBeUndefined();
    expect(run('Gestern Xyz ging ich.', { Gestern: adv('gestern'), ging: verb('gehen', { Tense: 'Past' }), ich: ICH }).find('verb-second-inversion')).toBeUndefined();
    const das = run('Das ist es.', { Das: C('PRON', 'das', { PronType: 'Dem', Case: 'Nom,Acc' }), ist: aux('sein'), es: ES });
    expect(das.find('verb-second-inversion')).toBeUndefined();
  });

  it('verb-final-subordinate: dass / weil / als … with the conjugated verb at the end (the old key)', () => {
    const r = run('Ich weiß, dass Gott allen vergibt.', { dass: C('SCONJ', 'dass'), Gott: C('PROPN', 'Gott'), allen: C('PRON', 'alle', { Case: 'Dat' }), vergibt: verb('vergeben') });
    expect(r.find('verb-final-subordinate')?.tokenIndexes).toEqual([3, 6]);
    const w = run('Ich bin müde, weil ich gearbeitet habe.', { weil: C('SCONJ', 'weil'), ich: ICH, gearbeitet: ptc('arbeiten'), habe: aux('haben') });
    expect(w.find('verb-final-subordinate')?.tokenIndexes).toEqual([4, 7]);
    const ind = run('Ich frage, warum er geht.', { warum: adv('warum', { PronType: 'Int' }), er: ER, geht: verb('gehen') });
    expect(ind.find('verb-final-subordinate')?.tokenIndexes).toEqual([3, 5]);
  });

  it('verb-final-subordinate stays silent: a quoted conjunction, a verb that is not last, two clauses run together', () => {
    expect(run('Das Wort „dass“ schreibt man mit zwei s.', { dass: C('SCONJ', 'dass') }).find('verb-final-subordinate')).toBeUndefined();
    expect(run('Ich weiß, dass er kommt heute.', { dass: C('SCONJ', 'dass'), er: ER, kommt: verb('kommen'), heute: adv('heute') }).find('verb-final-subordinate')).toBeUndefined();
    const runOn = run('Wenn er kommt gehen wir.', { Wenn: C('SCONJ', 'wenn'), er: ER, kommt: verb('kommen'), gehen: verb('gehen', { VerbForm: 'Fin,Inf' }), wir: C('PRON', 'wir', { PronType: 'Prs', Case: 'Nom' }) });
    expect(runOn.find('verb-final-subordinate')).toBeUndefined();
  });

  it('sentence-bracket-perfect: haben / sein … participle, in a main clause and at the end of a subordinate clause', () => {
    const r = run('Ich habe gestern einen Freund besucht.', { habe: aux('haben'), besucht: ptc('besuchen') });
    expect(r.find('sentence-bracket-perfect')?.tokenIndexes).toEqual([1, 5]);
    expect(r.find('pluperfect')).toBeUndefined();
    const s = run('Ich weiß, dass ich gegangen bin.', { bin: aux('sein'), gegangen: ptc('gehen') });
    expect(s.find('sentence-bracket-perfect')?.tokenIndexes).toEqual([6, 5]);
  });

  it('sentence-bracket-perfect stays silent: haben as a main verb, a perfect passive (ist gebaut worden), no participle', () => {
    expect(run('Ich habe ein Buch.', { habe: aux('haben'), Buch: noun('Buch') }).find('sentence-bracket-perfect')).toBeUndefined();
    const pp = run('Das Haus ist gebaut worden.', { ist: aux('sein'), gebaut: ptc('bauen'), worden: ptc('werden') });
    expect(pp.find('sentence-bracket-perfect')).toBeUndefined();
    expect(run('Er ist müde.', { ist: aux('sein'), müde: C('ADJ', 'müde') }).find('sentence-bracket-perfect')).toBeUndefined();
  });

  it('pluperfect: hatte / war + participle (and not hätte, which is Konjunktiv II)', () => {
    const r = run('Er hatte das Buch gelesen.', { hatte: aux('haben', { Tense: 'Past', Person: '3', Number: 'Sing' }), gelesen: ptc('lesen') });
    expect(r.find('pluperfect')?.tokenIndexes).toEqual([1, 4]);
    expect(r.find('sentence-bracket-perfect')).toBeUndefined();
    const k = run('Er hätte das Buch gelesen.', { hätte: aux('haben', { Tense: 'Past', Mood: 'Sub' }), gelesen: ptc('lesen') });
    expect(k.find('pluperfect')).toBeUndefined();
    expect(k.find('konjunktiv-2')).toBeDefined();
  });

  it('future: werden + infinitive; werden + adjective is not a future', () => {
    const r = run('Ich werde morgen kommen.', { werde: aux('werden', { Person: '1' }), kommen: inf('kommen') });
    expect(r.find('future')?.tokenIndexes).toEqual([1, 3]);
    const a = run('Er wird müde.', { wird: aux('werden'), müde: C('ADJ', 'müde') });
    expect(a.keys()).not.toContain('future');
    expect(a.keys()).not.toContain('passive');
  });

  it('passive and passive-past: werden / wurde + participle; werden + adjective is not a passive', () => {
    const p = run('Das Haus wird gebaut.', { wird: aux('werden'), gebaut: ptc('bauen') });
    expect(p.find('passive')?.tokenIndexes).toEqual([2, 3]);
    expect(p.find('future')).toBeUndefined();
    const q = run('Das Haus wurde gebaut.', { wurde: aux('werden', { Tense: 'Past' }), gebaut: ptc('bauen') });
    expect(q.find('passive-past')?.tokenIndexes).toEqual([2, 3]);
    expect(q.find('passive')).toBeUndefined();
    expect(run('Es wird kalt.', { wird: aux('werden'), kalt: C('ADJ', 'kalt') }).find('passive')).toBeUndefined();
  });

  it('modal-infinitive: a modal + the infinitive that closes the clause', () => {
    const r = run('Ich muss heute arbeiten.', { muss: aux('müssen'), arbeiten: inf('arbeiten') });
    expect(r.find('modal-infinitive')?.tokenIndexes).toEqual([1, 3]);
    const s = run('Ich weiß, dass er kommen kann.', { kommen: inf('kommen'), kann: aux('können') });
    expect(s.find('modal-infinitive')?.tokenIndexes).toEqual([6, 5]);
    expect(run('Ich muss.', { muss: aux('müssen') }).find('modal-infinitive')).toBeUndefined();
    expect(run('Ich kann Deutsch.', { kann: aux('können'), Deutsch: noun('Deutsch') }).find('modal-infinitive')).toBeUndefined();
  });

  it('separable-prefix-verb: a unit whose pieces are apart, reported once on the head (the old key)', () => {
    const unit = (role: string) => ({ head: 1, pieces: [1, 5], role, display: 'aufstehen' });
    const r = run('Sie steht um sechs Uhr auf.', {
      steht: verb('aufstehen', { Person: '3' }, { unit: unit('head') }),
      auf: C('PART', 'aufstehen', {}, { unit: unit('separable prefix') }),
    });
    expect(r.all('separable-prefix-verb').map((p) => p.tokenIndexes)).toEqual([[1, 5]]);
    // the old test's sentence: the verb first, then the particle (and the zu before verstehen is a zu-infinitive)
    const u2 = (role: string) => ({ head: 2, pieces: [2, 4], role, display: 'anfangen' });
    const old = run('Eines Tages fing ich an, meine Sünde zu verstehen.', {
      fing: verb('anfangen', { Tense: 'Past' }, { unit: u2('head') }), an: C('PART', 'anfangen', {}, { unit: u2('separable prefix') }),
      zu: C('PART', 'zu'), verstehen: inf('verstehen'),
    });
    expect(old.find('separable-prefix-verb')?.tokenIndexes).toEqual([old.at('fing'), old.at('an')]);
    expect(old.find('zu-infinitive')?.tokenIndexes).toEqual([old.at('zu'), old.at('verstehen')]);
    // "an" as a preposition with its noun, no unit
    const m = run('Er steht an der Wand.', { steht: verb('stehen'), an: C('ADP', 'an'), der: C('DET', 'der', { Case: 'Dat' }), Wand: noun('Wand') });
    expect(m.find('separable-prefix-verb')).toBeUndefined();
  });

  it('zu-infinitive: zu + infinitive, and the zu inserted into a separable verb', () => {
    const r = run('Es ist schön, dich zu sehen.', { zu: C('PART', 'zu'), sehen: inf('sehen') });
    expect(r.find('zu-infinitive')?.tokenIndexes).toEqual([5, 6]);
    const parts = [
      { text: 'an', start: 0, end: 2, kind: 'prefix' as const }, { text: 'zu', start: 2, end: 4, kind: 'marker' as const }, { text: 'fangen', start: 4, end: 10, kind: 'stem' as const },
    ];
    const m = run('Er hat vergessen anzufangen.', { anzufangen: C('VERB', 'anfangen', { VerbForm: 'Inf' }, { parts }) });
    expect(m.find('zu-infinitive')?.tokenIndexes).toEqual([3]);
    // zu as a preposition, zu with no infinitive
    expect(run('Ich bleibe zu Hause.', { zu: C('ADP', 'zu'), Hause: noun('Haus') }).find('zu-infinitive')).toBeUndefined();
    expect(run('Das ist zu viel.', { zu: C('PART', 'zu') }).find('zu-infinitive')).toBeUndefined();
  });

  it('um-zu: um … zu + infinitive; um with a time is not it', () => {
    const r = run('Ich lerne, um zu bestehen.', { um: C('SCONJ', 'um'), zu: C('PART', 'zu'), bestehen: inf('bestehen') });
    expect(r.find('um-zu')?.tokenIndexes).toEqual([3, 5]);
    expect(r.find('zu-infinitive')).toBeUndefined();
    expect(run('Ich komme um sechs Uhr.', { um: C('ADP', 'um'), Uhr: noun('Uhr') }).find('um-zu')).toBeUndefined();
  });

  it('relative-clause: noun, comma, relative pronoun (maybe behind a preposition), verb last', () => {
    const rel = C('PRON', 'der', { PronType: 'Rel', Case: 'Nom' });
    const r = run('Der Mann, der dort steht, ist mein Vater.', { Mann: noun('Mann'), der: rel, steht: verb('stehen') });
    expect(r.find('relative-clause')?.tokenIndexes).toEqual([3, 5]);
    const p = run('Das Haus, in dem ich wohne, ist alt.', { Haus: noun('Haus'), in: C('ADP', 'in'), dem: C('PRON', 'der', { PronType: 'Rel', Case: 'Dat' }), ich: ICH, wohne: verb('wohnen') });
    expect(p.find('relative-clause')?.tokenIndexes).toEqual([4, 6]);
    const dem = run('Der Mann, der dort steht, ist da.', { Mann: noun('Mann'), der: C('PRON', 'der', { PronType: 'Dem' }), steht: verb('stehen') });
    expect(dem.find('relative-clause')).toBeUndefined();
    expect(run('Ich weiß, dass er kommt.', { dass: C('SCONJ', 'dass'), er: ER, kommt: verb('kommen') }).find('relative-clause')).toBeUndefined();
  });

  it('konjunktiv-2-wuerde: würde + infinitive, not counted as a future or as a plain Konjunktiv II form', () => {
    const r = run('Ich würde gern reisen.', { würde: aux('werden', { Mood: 'Sub', Tense: 'Past', Person: '1' }), gern: adv('gern'), reisen: inf('reisen') });
    expect(r.find('konjunktiv-2-wuerde')?.tokenIndexes).toEqual([1, 3]);
    expect(r.find('future')).toBeUndefined();
    expect(r.find('konjunktiv-2')).toBeUndefined();
  });

  it('konjunktiv-2 and konjunktiv-1: only where Mood and Tense are decided', () => {
    const r = run('Wenn ich Zeit hätte, käme ich.', { hätte: verb('haben', { Mood: 'Sub', Tense: 'Past' }), käme: verb('kommen', { Mood: 'Sub', Tense: 'Past' }), ich: ICH });
    expect(r.all('konjunktiv-2').map((p) => p.tokenIndexes)).toEqual([[3], [5]]);
    const one = run('Er sagt, er sei krank.', { sei: verb('sein', { Mood: 'Sub', Tense: 'Pres' }) });
    expect(one.find('konjunktiv-1')?.tokenIndexes).toEqual([4]);
    // a weak preterite (Ind or Sub) and a plural present (Ind or Sub) are not decided
    expect(run('Er lernte.', { lernte: verb('lernen', { Mood: 'Ind,Sub', Tense: 'Past' }) }).keys()).toEqual([]);
    expect(run('Er sagt, sie kommen.', { kommen: verb('kommen', { Mood: 'Ind,Sub' }) }).keys()).not.toContain('konjunktiv-1');
  });

  it('question-verb-first: a yes/no question', () => {
    const r = run('Kommst du morgen?', { Kommst: verb('kommen', { Person: '2' }), du: DU });
    expect(r.find('question-verb-first')?.tokenIndexes).toEqual([0, 1]);
    expect(run('Kommst du morgen.', { Kommst: verb('kommen'), du: DU }).find('question-verb-first')).toBeUndefined();
  });

  it('imperative: the command form at the start of a clause', () => {
    expect(run('Komm her!', { Komm: verb('kommen', { Mood: 'Imp' }) }).find('imperative')?.tokenIndexes).toEqual([0]);
    expect(run('Er kommt!', { kommt: verb('kommen') }).find('imperative')).toBeUndefined();
  });
});

describe('German constructions: the noun phrase and what governs it', () => {
  it('dative-after-preposition: the old key, with the old shapes', () => {
    const r = run('Ja, ich glaube von ganzem Herzen an Gott.', { ich: ICH, von: C('ADP', 'von'), ganzem: C('ADJ', 'ganz', { Case: 'Dat' }), Herzen: noun('Herz', { Case: 'Dat' }) });
    expect(r.find('dative-after-preposition')?.tokenIndexes).toEqual([4, 5]);
    const sure = run('mit dem Auto', { mit: C('ADP', 'mit'), dem: C('DET', 'der', { Case: 'Dat' }) });
    const union = run('mit der Frau', { mit: C('ADP', 'mit'), der: C('DET', 'der', { Case: 'Nom,Dat,Gen' }) });
    expect(sure.find('dative-after-preposition')!.confidence).toBeGreaterThan(union.find('dative-after-preposition')!.confidence);
    // zum = zu + dem
    const parts = [{ text: 'zu', start: 0, end: 1, kind: 'contracted' as const, pos: 'ADP' as const }, { text: 'dem', start: 1, end: 3, kind: 'contracted' as const, pos: 'DET' as const, morph: { Case: 'Dat' } }];
    expect(run('Zum Beispiel', { Zum: C('ADP', 'zu', {}, { parts }) }).find('dative-after-preposition')?.tokenIndexes).toEqual([0, 1]);
    // an accusative article after a dative preposition is not "dative after the preposition"
    expect(run('mit den Mann', { mit: C('ADP', 'mit'), den: C('DET', 'der', { Case: 'Acc' }) }).find('dative-after-preposition')).toBeUndefined();
    expect(run('Ich spiele mit.', { mit: C('ADP', 'mit') }).find('dative-after-preposition')).toBeUndefined();
  });

  it('accusative-after-preposition: für / durch / gegen / ohne / um; "um … zu" is not one', () => {
    const r = run('Ich kaufe es für den Mann.', { für: C('ADP', 'für'), den: C('DET', 'der', { Case: 'Acc' }) });
    expect(r.find('accusative-after-preposition')?.tokenIndexes).toEqual([3, 4]);
    expect(run('um zu lernen', { um: C('ADP', 'um'), zu: C('PART', 'zu') }).find('accusative-after-preposition')).toBeUndefined();
    expect(run('für dem Mann', { für: C('ADP', 'für'), dem: C('DET', 'der', { Case: 'Dat' }) }).find('accusative-after-preposition')).toBeUndefined();
  });

  it('two-way-preposition: says which case it is and what it means', () => {
    const dir = run('Ich gehe in den Garten.', { in: C('ADP', 'in'), den: C('DET', 'der', { Case: 'Acc' }) });
    expect(dir.find('two-way-preposition')?.tokenIndexes).toEqual([2, 3]);
    expect(dir.find('two-way-preposition')?.explanation).toMatch(/accusative/);
    expect(dir.find('two-way-preposition')?.explanation).toMatch(/going/);
    const place = run('Ich bin im Garten.', { im: C('ADP', 'in') });
    expect(place.find('two-way-preposition')?.explanation).toMatch(/dative/);
    expect(place.find('two-way-preposition')?.explanation).toMatch(/is or happens/);
    // an undecided case says nothing
    expect(run('in der Stadt', { in: C('ADP', 'in'), der: C('DET', 'der', { Case: 'Nom,Dat,Gen' }) }).find('two-way-preposition')).toBeUndefined();
    expect(run('in den Garten', { in: C('ADP', 'in'), den: C('DET', 'der', { Case: 'Acc,Dat' }) }).find('two-way-preposition')).toBeUndefined();
  });

  it('genitive-attribute: das Haus des Mannes, Annas Haus', () => {
    const r = run('Das ist das Haus des Mannes.', { Haus: noun('Haus'), des: C('DET', 'der', { Case: 'Gen' }), Mannes: noun('Mann', { Case: 'Gen' }) });
    expect(r.find('genitive-attribute')?.tokenIndexes).toEqual([3, 5, 4]);
    const a = run('Annas Haus ist klein.', { Annas: C('PROPN', 'Anna', { Case: 'Gen' }), Haus: noun('Haus') });
    expect(a.find('genitive-attribute')?.tokenIndexes).toEqual([0, 1]);
    // des with the case undecided; a genitive preposition is not an attribute
    expect(run('das Haus des Mannes', { Haus: noun('Haus'), des: C('DET', 'der', { Case: 'Dat,Gen' }), Mannes: noun('Mann', { Case: 'Gen' }) }).find('genitive-attribute')).toBeUndefined();
    const w = run('wegen des Wetters', { wegen: C('ADP', 'wegen'), des: C('DET', 'der', { Case: 'Gen' }), Wetters: noun('Wetter', { Case: 'Gen' }) });
    expect(w.find('genitive-attribute')).toBeUndefined();
  });

  it('genitive-preposition: wegen / trotz / während + genitive; während as a conjunction is not one', () => {
    const r = run('wegen des Wetters', { wegen: C('ADP', 'wegen'), des: C('DET', 'der', { Case: 'Gen' }) });
    expect(r.find('genitive-preposition')?.tokenIndexes).toEqual([0, 1]);
    expect(run('wegen dem Wetter', { wegen: C('ADP', 'wegen'), dem: C('DET', 'der', { Case: 'Dat' }) }).find('genitive-preposition')).toBeUndefined();
    expect(run('Während ich schlief', { Während: C('SCONJ', 'während'), ich: ICH }).find('genitive-preposition')).toBeUndefined();
  });

  it('adjective-ending-weak / -strong / -mixed: an attributive adjective whose Decl is decided', () => {
    const adj = (decl: string) => C('ADJ', 'gut', { Decl: decl, Case: 'Nom' });
    expect(run('der gute Mann', { gute: adj('Weak'), Mann: noun('Mann') }).find('adjective-ending-weak')?.tokenIndexes).toEqual([1, 2]);
    expect(run('guter Wein', { guter: adj('Strong'), Wein: noun('Wein') }).find('adjective-ending-strong')?.tokenIndexes).toEqual([0, 1]);
    expect(run('ein guter Mann', { guter: adj('Mixed'), Mann: noun('Mann') }).find('adjective-ending-mixed')?.tokenIndexes).toEqual([1, 2]);
    // undecided, predicative, and a participle (that is a participial modifier)
    expect(run('ein guter Mann', { guter: adj('Strong,Mixed'), Mann: noun('Mann') }).keys()).toEqual([]);
    expect(run('Der Mann ist gut.', { gut: adj('Weak'), Mann: noun('Mann') }).keys()).toEqual([]);
    const ptcAdj = C('ADJ', 'lesen', { Decl: 'Weak', VerbForm: 'Part', Tense: 'Past', Case: 'Nom' });
    expect(run('das gelesene Buch', { gelesene: ptcAdj, Buch: noun('Buch') }).keys()).not.toContain('adjective-ending-weak');
  });

  it('comparative-als: comparative … als; als as a conjunction of time is not it', () => {
    const r = run('Er ist größer als ich.', { ist: aux('sein'), größer: C('ADJ', 'groß', { Degree: 'Cmp' }), als: C('CONJ', 'als') });
    expect(r.find('comparative-als')?.tokenIndexes).toEqual([2, 3]);
    expect(run('Als ich jung war, lachte ich.', { Als: C('SCONJ', 'als'), jung: C('ADJ', 'jung') }).find('comparative-als')).toBeUndefined();
    const v = run('Er ist größer, lernt aber als Lehrer.', { ist: aux('sein'), größer: C('ADJ', 'groß', { Degree: 'Cmp' }), lernt: verb('lernen'), als: C('ADP', 'als') });
    expect(v.find('comparative-als')).toBeUndefined();
  });

  it('superlative-am: am schönsten, but not before a noun', () => {
    const sup = adv('schön', { Degree: 'Sup' });
    expect(run('Sie singt am schönsten.', { am: C('ADP', 'an'), schönsten: sup }).find('superlative-am')?.tokenIndexes).toEqual([2, 3]);
    expect(run('Das ist am schönsten Tag.', { am: C('ADP', 'an'), schönsten: C('ADJ', 'schön', { Degree: 'Sup' }), Tag: noun('Tag') }).find('superlative-am')).toBeUndefined();
  });

  it('negation-kein: kein + noun; nicht is not it', () => {
    const r = run('Ich habe kein Auto.', { kein: C('DET', 'kein', { Case: 'Acc' }), Auto: noun('Auto') });
    expect(r.find('negation-kein')?.tokenIndexes).toEqual([2, 3]);
    expect(run('Ich habe das Auto nicht.', { Auto: noun('Auto') }).find('negation-kein')).toBeUndefined();
  });

  it('es-gibt: geben with es and a thing that can be accusative; "Er gibt es mir" is not it', () => {
    const gibt = verb('geben', { Person: '3', Number: 'Sing' });
    const r = run('Es gibt hier ein Café.', { Es: ES, gibt, hier: adv('hier'), ein: C('DET', 'ein', { Case: 'Nom,Acc' }), Café: noun('Café') });
    expect(r.find('es-gibt')?.tokenIndexes).toEqual([0, 1]);
    const inv = run('Gibt es hier Tee?', { Gibt: gibt, es: ES, hier: adv('hier'), Tee: noun('Tee', { Case: 'Nom,Acc,Dat' }) });
    expect(inv.find('es-gibt')?.tokenIndexes).toEqual([0, 1]);
    expect(run('Er gibt es mir.', { Er: ER, gibt, es: ES, mir: C('PRON', 'ich', { Case: 'Dat' }) }).find('es-gibt')).toBeUndefined();
    expect(run('Es gibt ihm ein Buch.', { Es: ES, gibt, ihm: C('PRON', 'er', { Case: 'Dat' }), ein: C('DET', 'ein', { Case: 'Nom,Acc' }) }).find('es-gibt')).toBeUndefined();
  });

  it('man-impersonal: man + verb; the noun Mann is not it', () => {
    const r = run('Man sagt, dass er kommt.', { Man: C('PRON', 'man', { PronType: 'Ind' }), sagt: verb('sagen') });
    expect(r.find('man-impersonal')?.tokenIndexes).toEqual([0, 1]);
    expect(run('Der Mann sagt.', { Mann: noun('Mann'), sagt: verb('sagen') }).find('man-impersonal')).toBeUndefined();
  });

  it('participial-modifier: determiner … participle with an adjective ending + noun (the determiner and the noun come first)', () => {
    const g = C('ADJ', 'lesen', { VerbForm: 'Part', Tense: 'Past', Case: 'Nom,Acc', Decl: 'Weak' });
    const r = run('Das gestern gelesene Buch ist gut.', { Das: C('DET', 'der', { Case: 'Nom,Acc' }), gestern: adv('gestern'), gelesene: g, Buch: noun('Buch'), ist: aux('sein') });
    expect(r.find('participial-modifier')?.tokenIndexes).toEqual([0, 3, 2]);
    // a predicative participle has no ending
    const p = run('Das Buch ist gelesen.', { Buch: noun('Buch'), ist: aux('sein'), gelesen: ptc('lesen') });
    expect(p.find('participial-modifier')).toBeUndefined();
  });

  it('reflexive-verb: the reflexive pronoun and its verb', () => {
    const mich = C('PRON', 'ich', { PronType: 'Prs', Case: 'Acc' }, { role: 'reflexive pronoun' });
    expect(run('Ich freue mich.', { freue: verb('freuen'), mich }).find('reflexive-verb')?.tokenIndexes).toEqual([1, 2]);
    expect(run('Er erinnert sich an ihn.', { erinnert: verb('erinnern'), sich: C('PRON', 'sich') }).find('reflexive-verb')?.tokenIndexes).toEqual([1, 2]);
    expect(run('Ich sehe mich.', { sehe: verb('sehen'), mich: C('PRON', 'ich', { Case: 'Acc' }) }).find('reflexive-verb')).toBeUndefined();
  });

  it('dative-object-verb: helfen + a dative object that is not a preposition\'s', () => {
    const dem = C('DET', 'der', { Case: 'Dat' });
    expect(run('Ich helfe dem Mann.', { helfe: verb('helfen'), dem }).find('dative-object-verb')?.tokenIndexes).toEqual([1, 2]);
    expect(run('Ich helfe mit dem Mann.', { helfe: verb('helfen'), mit: C('ADP', 'mit'), dem }).find('dative-object-verb')).toBeUndefined();
    expect(run('Ich sehe dem Mann.', { sehe: verb('sehen'), dem }).find('dative-object-verb')).toBeUndefined();
  });

  it('nominalised-verb: das Lesen; the noun Leben is not one', () => {
    expect(run('Das Lesen macht Spaß.', { Lesen: noun('lesen', { Gender: 'Neut' }) }).find('nominalised-verb')?.tokenIndexes).toEqual([1]);
    expect(run('Das Leben ist schön.', { Leben: noun('Leben', { Gender: 'Neut' }) }).find('nominalised-verb')).toBeUndefined();
    expect(run('Lesen Sie!', { Lesen: verb('lesen') }).find('nominalised-verb')).toBeUndefined();
  });

  it('modal-particle: a PART reading with a role; zu and a plain adverb are not one', () => {
    const r = run('Komm doch mal her!', { doch: C('PART', 'doch', {}, { role: 'softens a request' }), mal: C('PART', 'mal', {}, { role: 'softens a request' }) });
    expect(r.all('modal-particle').map((p) => p.tokenIndexes)).toEqual([[1], [2]]);
    expect(r.find('modal-particle')?.explanation).toMatch(/softens a request/);
    expect(run('Es ist doch so.', { doch: adv('doch') }).find('modal-particle')).toBeUndefined();
    expect(run('Es ist zu viel.', { zu: C('PART', 'zu') }).find('modal-particle')).toBeUndefined();
  });
});

describe('German constructions: general', () => {
  it('says nothing about a sentence nothing is known about', () => {
    expect(run('Heute gehe ich nach Hause, weil ich müde bin.').out).toEqual([]);
    expect(detectGermanConstructions([], [])).toEqual([]);
  });

  it('every key has a title and an explanation with a German example, and the required keys exist', () => {
    const required = [
      'verb-second-inversion', 'verb-final-subordinate', 'sentence-bracket-perfect', 'pluperfect', 'future', 'passive', 'passive-past', 'modal-infinitive',
      'separable-prefix-verb', 'zu-infinitive', 'um-zu', 'relative-clause', 'konjunktiv-2-wuerde', 'konjunktiv-2', 'konjunktiv-1', 'dative-after-preposition',
      'accusative-after-preposition', 'two-way-preposition', 'genitive-attribute', 'genitive-preposition', 'adjective-ending-weak', 'adjective-ending-strong',
      'adjective-ending-mixed', 'comparative-als', 'superlative-am', 'negation-kein', 'es-gibt', 'man-impersonal', 'question-verb-first', 'imperative',
      'participial-modifier', 'reflexive-verb', 'dative-object-verb', 'nominalised-verb', 'modal-particle',
    ];
    for (const k of required) expect(GERMAN_CONSTRUCTION_KEYS).toContain(k);
    for (const [k, info] of Object.entries(GERMAN_CONSTRUCTION_INFO)) {
      expect(info.title.length, k).toBeGreaterThan(5);
      expect(info.explanation, k).toMatch(/[„"“]/u);
      expect(info.explanation.length, k).toBeLessThan(330); // short: no grammar lecture
    }
  });

  it('a bracket construction names its two ends first', () => {
    const r = run('Ich habe gestern einen Freund besucht.', { habe: aux('haben'), besucht: ptc('besuchen') });
    const p = r.find('sentence-bracket-perfect')!;
    expect(p.tokenIndexes.slice(0, 2)).toEqual([r.at('habe'), r.at('besucht')]);
  });

  it('fired every construction key somewhere in this file', () => {
    // (checked after the tests above have run; see afterAll)
    expect(true).toBe(true);
  });

  afterAll(() => {
    const missing = GERMAN_CONSTRUCTION_KEYS.filter((k) => !fired.has(k));
    expect(missing).toEqual([]);
  });
});

// ───────────────────────────── phrase units ─────────────────────────────

const normalize = (s: string): string => s.normalize('NFC').toLocaleLowerCase('de');
const phrases = (text: string, defs: Defs = {}) => {
  const { tokens, analyses } = build(text, defs);
  return matchPhraseRules(tokens, analyses, GERMAN_PHRASE_RULES, normalize);
};
const patterns = (text: string, defs: Defs = {}): string[] => phrases(text, defs).map((p) => p.pattern.join(' '));

describe('German phrase units', () => {
  it('has about 150 units in the shared format, none that starts with a gap, none duplicated', () => {
    expect(GERMAN_PHRASE_RULES.length).toBeGreaterThanOrEqual(150);
    expect(PHRASE_UNITS.length).toBeGreaterThanOrEqual(100);
    expect(PREPOSITION_FRAMES.length).toBeGreaterThanOrEqual(50);
    const seen = new Set<string>();
    for (const r of GERMAN_PHRASE_RULES) {
      expect(r.pattern.length).toBeGreaterThan(0);
      expect(r.display.length).toBeGreaterThan(0);
      expect(r.gloss.length).toBeGreaterThan(3);
      expect(r.variants.length).toBeGreaterThan(0);
      for (const v of r.variants) { const f = v[0]; expect(typeof f === 'object' && !Array.isArray(f) && 'gap' in f).toBe(false); }
      const key = r.pattern.join(' ');
      expect(seen.has(key), key).toBe(false);
      seen.add(key);
    }
    expect(() => phrases('Das ist ein Satz, der nichts enthält.')).not.toThrow();
  });

  it('keeps the three seed phrases of the old adapter (the old test, on a hand-built analysis)', () => {
    const unit = (role: string) => ({ head: 2, pieces: [2, 4], role, display: 'anfangen' });
    const defs: Defs = {
      fing: verb('anfangen', { Tense: 'Past' }, { unit: unit('head') }),
      an: C('PART', 'anfangen', {}, { unit: unit('separable prefix') }),
      zu: C('PART', 'zu'), verstehen: inf('verstehen'),
    };
    expect(patterns('Eines Tages fing ich an, meine Sünde zu verstehen.', defs)).toContain('anfangen zu verstehen');
    expect(patterns('Als ich jung war, verstand ich mein Herz nicht.', { ich: ICH, war: verb('sein', { Tense: 'Past' }), jung: C('ADJ', 'jung') })).toContain('als _ jung sein');
    expect(patterns('Jetzt glaube ich an Gott.', { glaube: verb('glauben'), an: C('ADP', 'an'), Gott: C('PROPN', 'Gott') })).toContain('glauben an _');
    expect(patterns('Ich will auch an Gott glauben.', { an: C('ADP', 'an'), Gott: C('PROPN', 'Gott'), glauben: inf('glauben') })).toContain('glauben an _');
    expect(patterns('auf daß alle, die an ihn glauben, nicht verloren werden', { an: C('ADP', 'an'), ihn: C('PRON', 'er'), glauben: verb('glauben') })).toContain('glauben an _');
  });

  const FIXED: Array<[string, string]> = [
    ['Zum Beispiel kommt er.', 'zum beispiel'], ['Guten Morgen!', 'guten morgen'], ['Guten Tag, Frau Meier.', 'guten tag'], ['Guten Abend allerseits.', 'guten abend'],
    ['Gute Nacht!', 'gute nacht'], ['Auf Wiedersehen!', 'auf wiedersehen'], ['Vielen Dank für alles.', 'vielen dank'], ['Bitte schön!', 'bitte schön'],
    ['Zum Glück ist nichts passiert.', 'zum glück'], ['Das war auf jeden Fall richtig.', 'auf jeden fall'], ['Er kommt immer noch nicht.', 'immer noch'],
    ['Ich habe es noch nicht gesehen.', 'noch nicht'], ['Das ist gar nicht schlecht.', 'gar nicht'], ['Ich bin ein bisschen müde.', 'ein bisschen'],
    ['Ich habe ein paar Fragen.', 'ein paar'], ['Vor allem lerne ich Deutsch.', 'vor allem'], ['Zum ersten Mal in Berlin.', 'zum ersten mal'],
    ['Am Anfang war das Wort.', 'am anfang'], ['Am Ende war alles gut.', 'am ende'], ['Er wohnt in der Nähe.', 'in der nähe'], ['Ich gehe nach Hause.', 'nach hause'],
    ['Sie ist zu Hause.', 'zu hause'], ['Er geht zu Fuß.', 'zu fuß'], ['Im Moment habe ich keine Zeit.', 'im moment'], ['Das ist in Ordnung.', 'in ordnung'],
    ['Meiner Meinung nach ist das falsch.', 'meiner meinung nach'], ['Er ist nicht nur klug, sondern auch fleißig.', 'nicht nur sondern auch'],
    ['Entweder du kommst oder ich gehe.', 'entweder oder'], ['Weder er noch sie kam.', 'weder noch'], ['Je mehr er lernt, desto besser wird er.', 'je desto'],
    ['Sowohl er als auch sie kam.', 'sowohl als auch'], ['Ach so, ich verstehe.', 'ach so'], ['Na ja, vielleicht.', 'na ja'], ['Er kommt ab und zu.', 'ab und zu'],
    ['Wir sagen und so weiter.', 'und so weiter'], ['Wie gesagt, es geht nicht.', 'wie gesagt'], ['Gott sei Dank!', 'gott sein dank'], ['Viel Glück!', 'viel glück'],
    ['Herzlichen Glückwunsch!', 'herzlichen glückwunsch'], ['Wie bitte?', 'wie bitte'], ['Wie lange dauert das?', 'wie lange'], ['Am besten gehst du jetzt.', 'am besten'],
    ['Er mag Tee am liebsten.', 'am liebsten'], ['Im Gegenteil!', 'im gegenteil'], ['Zum Schluss sagte er nichts.', 'zum schluss'], ['Nach und nach lernte er.', 'nach und nach'],
    ['Von nun an bleibe ich.', 'von nun an'], ['Hin und wieder regnet es.', 'hin und wieder'], ['Es war noch einmal so.', 'noch einmal'], ['Das ist nicht mehr nötig.', 'nicht mehr'],
    ['Bis heute weiß ich es nicht.', 'bis heute'], ['Wir bleiben aus diesem Grund hier.', 'aus diesem grund'], ['Unter anderem lernt er Deutsch.', 'unter anderem'],
    ['Komm so schnell wie möglich.', 'so _ wie möglich'], ['Auf der anderen Seite ist es teuer.', 'auf der anderen seite'], ['Am Wochenende ruhe ich mich aus.', 'am wochenende'],
  ];

  it('matches the fixed expressions (words of the expression only, no analysis needed)', () => {
    for (const [text, expected] of FIXED) expect(patterns(text), text).toContain(expected);
  });

  it('matches "nicht nur … sondern auch" across a comma, and "es sei denn" in its form', () => {
    expect(patterns('Er kommt, es sei denn, es regnet.')).toContain('es sein denn');
  });

  it('matches the verbal expressions by lemma, with their words in between', () => {
    expect(patterns('Es tut mir leid.', { tut: verb('tun'), mir: C('PRON', 'ich', { Case: 'Dat' }) })).toContain('es tun _ leid');
    expect(patterns('Es tut mir wirklich leid.', { tut: verb('tun'), mir: C('PRON', 'ich', { Case: 'Dat' }), wirklich: adv('wirklich') })).toContain('es tun _ leid');
    expect(patterns('Tut mir leid.', { Tut: verb('tun'), mir: C('PRON', 'ich', { Case: 'Dat' }) })).toContain('es tun _ leid');
    expect(patterns('Wie geht es dir?', { geht: verb('gehen'), dir: C('PRON', 'du', { Case: 'Dat' }) })).toContain('wie gehen es _');
    expect(patterns('Es gibt hier Tee.', { gibt: verb('geben') })).toContain('es geben');
    expect(patterns('Gibt es hier Tee?', { Gibt: verb('geben') })).toContain('es geben');
    expect(patterns('Du hast recht.', { hast: verb('haben') })).toContain('haben recht');
    expect(patterns('Ich habe keine Angst vor Hunden.', { habe: verb('haben'), keine: C('DET', 'kein'), vor: C('ADP', 'vor') })).toContain('haben angst vor _');
    expect(patterns('Das macht mir Spaß.', { macht: verb('machen'), mir: C('PRON', 'ich') })).toContain('machen spaß');
    expect(patterns('Es geht um Gott.', { geht: verb('gehen') })).toContain('es gehen um');
    expect(patterns('Es kommt auf dich an.', { kommt: verb('ankommen'), dich: C('PRON', 'du'), an: C('PART', 'ankommen') })).toContain('es ankommen auf an');
    expect(patterns('Ich gebe mir Mühe.', { gebe: verb('geben'), mir: C('PRON', 'ich') })).toContain('geben mühe');
    expect(patterns('Das spielt keine Rolle.', { spielt: verb('spielen'), keine: C('DET', 'kein') })).toContain('spielen rolle');
    expect(patterns('Ich hätte gern einen Kaffee.', { hätte: verb('haben', { Mood: 'Sub' }) })).toContain('ich hätte gern');
    expect(patterns('Wie heißen Sie?', { heißen: verb('heißen'), Sie: C('PRON', 'Sie') })).toContain('wie heißen _');
  });

  it('matches verb + preposition frames and says the case in the gloss', () => {
    const cases: Array<[string, Defs, string, string]> = [
      ['Ich warte seit Stunden auf den Bus.', { warte: verb('warten'), seit: C('ADP', 'seit'), Stunden: noun('Stunde'), auf: C('ADP', 'auf'), den: C('DET', 'der') }, 'warten auf _', 'accusative'],
      ['Ich denke oft an dich.', { denke: verb('denken'), oft: adv('oft'), an: C('ADP', 'an'), dich: C('PRON', 'du') }, 'denken an _', 'accusative'],
      ['Ich freue mich auf das Wochenende.', { freue: verb('freuen'), mich: C('PRON', 'ich'), auf: C('ADP', 'auf') }, 'freuen auf _', 'accusative'],
      ['Wir freuen uns über das Geschenk.', { freuen: verb('freuen'), uns: C('PRON', 'wir'), über: C('ADP', 'über') }, 'freuen über _', 'accusative'],
      ['Er spricht mit dem Lehrer.', { spricht: verb('sprechen'), mit: C('ADP', 'mit') }, 'sprechen mit _', 'dative'],
      ['Er spricht über den Lehrer.', { spricht: verb('sprechen'), über: C('ADP', 'über') }, 'sprechen über _', 'accusative'],
      ['Sie interessiert sich für Musik.', { interessiert: verb('interessieren'), sich: C('PRON', 'sich'), für: C('ADP', 'für') }, 'interessieren für _', 'accusative'],
      ['Er träumt von einem Haus.', { träumt: verb('träumen'), von: C('ADP', 'von') }, 'träumen von _', 'dative'],
      ['Wir danken dir für alles.', { danken: verb('danken'), dir: C('PRON', 'du'), für: C('ADP', 'für') }, 'danken für _', 'accusative'],
      ['Ich bitte dich um Hilfe.', { bitte: verb('bitten'), dich: C('PRON', 'du'), um: C('ADP', 'um') }, 'bitten um _', 'accusative'],
      ['Das gehört zu mir.', { gehört: verb('gehören'), zu: C('ADP', 'zu') }, 'gehören zu _', 'dative'],
      ['Er fragt nach dem Weg.', { fragt: verb('fragen'), nach: C('ADP', 'nach') }, 'fragen nach _', 'dative'],
      ['Wir hoffen auf besseres Wetter.', { hoffen: verb('hoffen'), auf: C('ADP', 'auf') }, 'hoffen auf _', 'accusative'],
      ['Er kümmert sich um die Kinder.', { kümmert: verb('kümmern'), sich: C('PRON', 'sich'), um: C('ADP', 'um') }, 'kümmern um _', 'accusative'],
      ['Sie erinnert sich an den Tag.', { erinnert: verb('erinnern'), sich: C('PRON', 'sich'), an: C('ADP', 'an') }, 'erinnern an _', 'accusative'],
    ];
    for (const [text, defs, expected, kase] of cases) {
      const hits = phrases(text, defs).filter((p) => p.pattern.join(' ') === expected);
      expect(hits.length, text).toBe(1);
      expect(hits[0].gloss, text).toContain(kase);
      expect(hits[0].kind).toBe('frame');
    }
  });

  it('matches a frame across the verb bracket and in a subordinate clause (verb last)', () => {
    expect(patterns('Ich weiß, dass er auf dich wartet.', { er: ER, auf: C('ADP', 'auf'), dich: C('PRON', 'du'), wartet: verb('warten') })).toContain('warten auf _');
    expect(patterns('Es ist schön, auf dich zu warten.', { auf: C('ADP', 'auf'), dich: C('PRON', 'du'), zu: C('PART', 'zu'), warten: inf('warten') })).toContain('warten auf _');
    expect(patterns('Ich will an die Zukunft denken.', { an: C('ADP', 'an'), die: C('DET', 'der'), Zukunft: noun('Zukunft'), denken: inf('denken') })).toContain('denken an _');
    expect(patterns('Heute habe ich lange auf dich gewartet.', { habe: aux('haben'), auf: C('ADP', 'auf'), dich: C('PRON', 'du'), gewartet: C('VERB', 'warten', { VerbForm: 'Part' }) })).toContain('warten auf _');
  });

  it('matches a separable verb\'s frame once, whichever piece comes first, and a contracted preposition', () => {
    const unit = (role: string) => ({ head: 1, pieces: [1, 5], role, display: 'teilnehmen' });
    const defs: Defs = {
      nehme: verb('teilnehmen', {}, { unit: unit('head') }), an: C('ADP', 'an'), teil: C('PART', 'teilnehmen', {}, { unit: unit('separable prefix') }),
    };
    expect(patterns('Ich nehme an dem Kurs teil.', defs).filter((p) => p === 'teilnehmen an _')).toHaveLength(1);
    const unit2 = (role: string) => ({ head: 1, pieces: [1, 4], role, display: 'teilnehmen' });
    const am: Defs = { nimmt: verb('teilnehmen', {}, { unit: unit2('head') }), am: C('ADP', 'an'), teil: C('PART', 'teilnehmen', {}, { unit: unit2('separable prefix') }) };
    expect(patterns('Sie nimmt am Kurs teil.', am).filter((p) => p === 'teilnehmen an _')).toHaveLength(1);
  });

  it('does not match a frame across a comma, a conjunction or another verb', () => {
    expect(patterns('Ich denke, dass er an der Uni arbeitet.', { denke: verb('denken'), an: C('ADP', 'an'), dass: C('SCONJ', 'dass') })).not.toContain('denken an _');
    expect(patterns('Ich warte und arbeite auf dem Feld.', { warte: verb('warten'), und: C('CONJ', 'und'), arbeite: verb('arbeiten'), auf: C('ADP', 'auf') })).not.toContain('warten auf _');
    expect(patterns('Er wartet nicht.', { wartet: verb('warten') })).toEqual([]);
  });
});

// ───────────────────────────── features are sets (fix batch 1) ─────────────────────────────

describe('German constructions: unions in the readings', () => {
  it('a form that is the same in the indicative and Konjunktiv I (Mood Ind,Sub) still makes a perfect, a future, a passive', () => {
    const habe = aux('haben', { Mood: 'Ind,Sub', Person: '1', Number: 'Sing' });
    const r = run('Ich habe das Buch gelesen.', { habe, gelesen: ptc('lesen') });
    expect(r.find('sentence-bracket-perfect')?.tokenIndexes).toEqual([1, 4]);
    expect(r.find('konjunktiv-1')).toBeUndefined(); // never for a plain "ich habe"
    expect(r.find('konjunktiv-2')).toBeUndefined();
    const f = run('Wir werden morgen kommen.', { werden: aux('werden', { Mood: 'Ind,Sub', Person: '1,3', Number: 'Plur' }), kommen: C('VERB', 'kommen', { VerbForm: 'Fin,Inf' }) });
    expect(f.find('future')?.tokenIndexes).toEqual([1, 3]);
    const p = run('Die Häuser werden gebaut.', { werden: aux('werden', { Mood: 'Ind,Sub', Person: '1,3', Number: 'Plur' }), gebaut: ptc('bauen') });
    expect(p.find('passive')?.tokenIndexes).toEqual([2, 3]);
  });

  it('a pure Konjunktiv II form is not a perfect (hätte … gelesen); a past that may be indicative makes the pluperfect', () => {
    const k = run('Er hätte das Buch gelesen.', { hätte: aux('haben', { Mood: 'Sub', Tense: 'Past', Person: '3', Number: 'Sing' }), gelesen: ptc('lesen') });
    expect(k.find('sentence-bracket-perfect')).toBeUndefined();
    expect(k.find('pluperfect')).toBeUndefined();
    const u = run('Er hatte das Buch gelesen.', { hatte: aux('haben', { Mood: 'Ind,Sub', Tense: 'Past', Person: '1,3', Number: 'Sing' }), gelesen: ptc('lesen') });
    expect(u.find('pluperfect')?.tokenIndexes).toEqual([1, 4]);
  });

  it('modal + infinitive where the infinitive is still Fin,Inf; a form that may be an infinitive does not stop the search', () => {
    const r = run('Wir können gehen.', { können: aux('können', { Person: '1,3', Number: 'Plur' }), gehen: C('VERB', 'gehen', { VerbForm: 'Fin,Inf' }) });
    expect(r.find('modal-infinitive')?.tokenIndexes).toEqual([1, 2]);
    const s = run('Ich weiß, dass er nach Hause gehen kann.', { dass: C('SCONJ', 'dass'), er: ER, gehen: C('VERB', 'gehen', { VerbForm: 'Fin,Inf' }), kann: aux('können', { Person: '1,3' }) });
    expect(s.find('modal-infinitive')?.tokenIndexes).toEqual([8, 7]);
    expect(s.find('verb-final-subordinate')?.tokenIndexes).toEqual([3, 8]);
  });

  it('pos AUX and pos VERB both do for sein / haben; a participle that may also be finite is not a participle', () => {
    expect(run('Ich bin gegangen.', { bin: C('VERB', 'sein', { VerbForm: 'Fin', Mood: 'Ind', Tense: 'Pres' }), gegangen: ptc('gehen') }).find('sentence-bracket-perfect')).toBeDefined();
    const notPart = run('Ich habe gehen.', { habe: aux('haben'), gehen: C('VERB', 'gehen', { VerbForm: 'Part,Fin', Tense: 'Past' }) });
    expect(notPart.find('sentence-bracket-perfect')).toBeUndefined();
  });

  it('PronType is a set: a relative pronoun among Dem,Rel', () => {
    const rel = C('PRON', 'der', { PronType: 'Dem,Rel', Case: 'Nom' });
    const r = run('Der Mann, der dort steht, ist mein Vater.', { Mann: noun('Mann'), der: rel, steht: verb('stehen') });
    expect(r.find('relative-clause')?.tokenIndexes).toEqual([3, 5]);
  });

  it('Number and Degree unions: es gibt, comparative-als', () => {
    const gibt = verb('geben', { Person: '3', Number: 'Sing,Plur' });
    expect(run('Es gibt hier ein Café.', { Es: ES, gibt, hier: adv('hier'), ein: C('DET', 'ein', { Case: 'Nom,Acc' }), Café: noun('Café') }).find('es-gibt')).toBeDefined();
    expect(run('Er ist größer als ich.', { größer: C('ADJ', 'groß', { Degree: 'Cmp,Sup' }), als: C('CONJ', 'als') }).find('comparative-als')).toBeDefined();
  });

  it('a dative verb with a dative that is only a union (Dat,Gen) behind the verb; a union that may be accusative is not one', () => {
    const r = run('Ich helfe der Frau.', { helfe: verb('helfen'), der: C('DET', 'der', { Case: 'Dat,Gen' }) });
    expect(r.find('dative-object-verb')?.tokenIndexes).toEqual([1, 2]);
    expect(run('Ich helfe den Kindern.', { helfe: verb('helfen'), den: C('DET', 'der', { Case: 'Acc,Dat' }) }).find('dative-object-verb')).toBeUndefined();
  });

  it('a reflexive verb needs the lexicon\'s word for it: ich freue mich yes, ich sehe dich no', () => {
    const also = 'also the reflexive pronoun: ich freue mich = I am glad';
    const mich = C('PRON', 'ich', { PronType: 'Prs', Case: 'Acc' }, { role: also });
    expect(run('Ich freue mich.', { freue: verb('freuen'), mich }).find('reflexive-verb')).toBeDefined();
    expect(run('Ich sehe dich.', { sehe: verb('sehen'), dich: C('PRON', 'du', { PronType: 'Prs', Case: 'Acc' }, { role: also }) }).find('reflexive-verb')).toBeUndefined();
  });
});

// ───────────────────────────── the real adapter ─────────────────────────────

describe('German constructions on the real adapter', () => {
  const realPatterns = (text: string): string[] => {
    const tokens = deAdapter.tokenize(text);
    return deAdapter.detectPatterns(tokens, deAdapter.analyze(tokens)).map((p) => p.key);
  };
  const CASES: Array<[string, string]> = [
    ['Ich habe das Buch gelesen.', 'sentence-bracket-perfect'],
    ['Ich habe nach Hause gegangen.', 'sentence-bracket-perfect'],
    ['Er hatte das Buch gelesen.', 'pluperfect'],
    ['Ich werde morgen kommen.', 'future'],
    ['Das Haus wird gebaut.', 'passive'],
    ['Das Haus wurde gebaut.', 'passive-past'],
    ['Ich muss heute arbeiten.', 'modal-infinitive'],
    ['Ich stehe um sechs Uhr auf.', 'separable-prefix-verb'],
    ['Es ist schön, dich zu sehen.', 'zu-infinitive'],
    ['Ich lerne, um zu bestehen.', 'um-zu'],
    ['Der Mann, der dort steht, ist mein Vater.', 'relative-clause'],
    ['Ich weiß, dass er heute kommt.', 'verb-final-subordinate'],
    ['Heute gehe ich nach Hause.', 'verb-second-inversion'],
    ['Ich würde gern reisen.', 'konjunktiv-2-wuerde'],
    ['Er sagt, er sei krank.', 'konjunktiv-1'],
    ['Ich helfe dem Mann.', 'dative-object-verb'],
    ['Ich freue mich.', 'reflexive-verb'],
  ];
  it('finds each construction in a plain sentence', () => {
    for (const [text, key] of CASES) expect(realPatterns(text), text).toContain(key);
  });
  it('does not call a plain "ich habe" a Konjunktiv, nor a plain "ich sehe dich" a reflexive verb', () => {
    for (const text of ['Ich habe das Buch gelesen.', 'Ich habe Hunger.', 'Ich gehe nach Hause.']) {
      expect(realPatterns(text), text).not.toContain('konjunktiv-1');
      expect(realPatterns(text), text).not.toContain('konjunktiv-2');
    }
    expect(realPatterns('Ich sehe dich.')).not.toContain('reflexive-verb');
    expect(realPatterns('Es ist schön, dich zu sehen.')).not.toContain('reflexive-verb');
  });
});
