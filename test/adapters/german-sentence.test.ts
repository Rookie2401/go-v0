/**
 * Package GC: the German sentence layer and the adapter itself, on the real engine and the real lexicon. Every example
 * is written from the grammar of German (not from the output of the code): what the sentence decides, and what it must
 * leave open. Table-driven: a sentence, then (surface, what the first reading must be).
 */
import { describe, expect, it } from 'vitest';
import type { AnalysisCandidate, AnalyzedToken, RawToken } from '../../src/core';
import { DE_SOURCE_IDS, deAdapter as de } from '../../src/adapters/de';
import { deLexiconView as lex } from '../../src/adapters/german/lexicon';
import { decomposeCompound, relateGerman } from '../../src/adapters/german/sentence';
import { loadBundledCorpus } from '../../src/ingest';

const OWN = `adapter-de@${de.version}`;
const DICT = 'dict:kaikki-de@test';

interface Parsed { text: string; tokens: RawToken[]; analyzed: AnalyzedToken[] }
const parse = (text: string): Parsed => { const tokens = de.tokenize(text); return { text, tokens, analyzed: de.analyze(tokens) }; };
const index = (p: Parsed, surface: string, nth = 0): number => {
  let seen = 0;
  for (let i = 0; i < p.tokens.length; i++) if (p.tokens[i].surface === surface && seen++ === nth) return i;
  throw new Error(`no token "${surface}" (${nth}) in "${p.text}"`);
};
const cands = (p: Parsed, surface: string, nth = 0): AnalysisCandidate[] => p.analyzed[index(p, surface, nth)].candidates;
const first = (p: Parsed, surface: string, nth = 0): AnalysisCandidate => cands(p, surface, nth)[0];

/** What the first reading of a token must be: lemma, pos, and a subset of its morph. */
interface Want { lemma?: string; pos?: string; morph?: Record<string, string>; role?: RegExp | string; context?: RegExp; absent?: string[] }
type Check = [surface: string, want: Want] | [surface: string, nth: number, want: Want];

function verify(p: Parsed, checks: Check[]): void {
  for (const ch of checks) {
    const [surface, nth, want] = ch.length === 3 ? ch : [ch[0], 0, ch[1]];
    const c = first(p, surface, nth);
    const label = `${p.text} :: ${surface}`;
    expect(c, label).toBeDefined();
    if (want.lemma !== undefined) expect(c.lemma, `${label} lemma`).toBe(want.lemma);
    if (want.pos !== undefined) expect(c.pos, `${label} pos`).toBe(want.pos);
    if (want.morph) expect(c.morph, `${label} morph`).toMatchObject(want.morph);
    if (want.absent) for (const k of want.absent) expect(c.morph[k], `${label} no ${k}`).toBeUndefined();
    if (want.role) { if (typeof want.role === 'string') expect(c.role, `${label} role`).toBe(want.role); else expect(c.role ?? '', `${label} role`).toMatch(want.role); }
    if (want.context) expect(String(c.notes?.context ?? ''), `${label} context`).toMatch(want.context);
  }
}

const run = (rows: Array<[string, Check[]]>) => { for (const [text, checks] of rows) it(text, () => verify(parse(text), checks)); };

const SING_M_ACC = { Case: 'Acc', Gender: 'Masc', Number: 'Sing' };
const SING_M_DAT = { Case: 'Dat', Gender: 'Masc', Number: 'Sing' };

// ─────────────────────────────────────────────────────────────────────────────────────────────────────────────

describe('noun phrase: agreement, government, declension', () => {
  run([
    ['den guten Mann', [['den', { morph: SING_M_ACC }], ['guten', { morph: { ...SING_M_ACC, Decl: 'Weak' }, context: /agrees with den … Mann: masculine accusative singular/ }], ['Mann', { morph: SING_M_ACC }]]],
    ['dem guten Mann', [['dem', { morph: SING_M_DAT }], ['guten', { morph: { ...SING_M_DAT, Decl: 'Weak' } }], ['Mann', { morph: SING_M_DAT }]]],
    ['guter Wein', [['guter', { lemma: 'gut', morph: { Case: 'Nom', Gender: 'Masc', Number: 'Sing', Decl: 'Strong' } }], ['Wein', { morph: { Case: 'Nom', Gender: 'Masc', Number: 'Sing' } }]]],
    ['mit gutem Wein', [['gutem', { morph: { ...SING_M_DAT, Decl: 'Strong' }, context: /after mit: dative/ }], ['Wein', { morph: SING_M_DAT }]]],
    ['ein guter Mann', [['ein', { lemma: 'ein', pos: 'DET', morph: { Case: 'Nom', Gender: 'Masc', Number: 'Sing' } }], ['guter', { morph: { Case: 'Nom', Gender: 'Masc', Number: 'Sing', Decl: 'Mixed' } }], ['Mann', { morph: { Case: 'Nom', Gender: 'Masc', Number: 'Sing' } }]]],
    ['mit den guten Männern', [['den', { morph: { Case: 'Dat', Number: 'Plur' } }], ['guten', { morph: { Case: 'Dat', Number: 'Plur', Decl: 'Weak' } }], ['Männern', { lemma: 'Mann', morph: { Case: 'Dat', Number: 'Plur', Gender: 'Masc' } }]]],
    ['in das Haus', [['das', { morph: { Case: 'Acc', Gender: 'Neut', Number: 'Sing' } }], ['Haus', { morph: { Case: 'Acc', Gender: 'Neut', Number: 'Sing' }, context: /after in: accusative/ }]]],
    ['in dem Haus', [['dem', { morph: { Case: 'Dat', Gender: 'Neut', Number: 'Sing' } }], ['Haus', { morph: { Case: 'Dat', Gender: 'Neut', Number: 'Sing' } }]]],
    ['im Haus', [['im', { lemma: 'in', pos: 'ADP' }], ['Haus', { morph: { Case: 'Dat', Gender: 'Neut', Number: 'Sing' }, context: /agrees with im/ }]]],
    ['in die Kirche', [['die', { morph: { Case: 'Acc', Gender: 'Fem', Number: 'Sing' } }], ['Kirche', { morph: { Case: 'Acc', Gender: 'Fem', Number: 'Sing' } }]]],
    ['zur Kirche', [['zur', { lemma: 'zu', pos: 'ADP' }], ['Kirche', { morph: { Case: 'Dat', Gender: 'Fem', Number: 'Sing' } }]]],
    ['des Mannes', [['des', { morph: { Case: 'Gen', Gender: 'Masc', Number: 'Sing' } }], ['Mannes', { lemma: 'Mann', morph: { Case: 'Gen', Gender: 'Masc', Number: 'Sing' } }]]],
    ['dem Studenten', [['dem', { morph: SING_M_DAT }], ['Studenten', { lemma: 'Student', morph: SING_M_DAT }]]],
    ['Die Frau sieht die Tochter.', [
      ['Die', { lemma: 'der', pos: 'DET', morph: { Case: 'Nom,Acc', Gender: 'Fem', Number: 'Sing' } }],
      ['Frau', { morph: { Case: 'Nom,Acc', Gender: 'Fem', Number: 'Sing' } }],
      ['die', { morph: { Case: 'Nom,Acc', Gender: 'Fem', Number: 'Sing' } }],
      ['Tochter', { morph: { Case: 'Nom,Acc', Gender: 'Fem', Number: 'Sing' } }],
    ]],
    ['Der Mann gibt dem Kind einen Apfel.', [['Mann', { morph: { Case: 'Nom' } }], ['Kind', { morph: { Case: 'Dat', Gender: 'Neut' } }], ['Apfel', { morph: { Case: 'Acc', Gender: 'Masc' } }]]],
    ['Ich sehe den Mann.', [['Mann', { morph: SING_M_ACC }]]],
    ['Wir wohnen in der Stadt.', [['Stadt', { morph: { Case: 'Dat', Gender: 'Fem', Number: 'Sing' } }]]],
    ['Er geht in die Schule.', [['Schule', { morph: { Case: 'Acc', Gender: 'Fem', Number: 'Sing' } }]]],
    ['Das Kind spielt mit dem Ball.', [['Ball', { morph: SING_M_DAT }]]],
    ['ohne den Mann', [['den', { morph: SING_M_ACC }], ['Mann', { morph: SING_M_ACC }]]],
    ['wegen des Mannes', [['des', { morph: { Case: 'Gen' } }]]],
    ['von meinem alten Freund', [['meinem', { morph: SING_M_DAT }], ['alten', { morph: { ...SING_M_DAT, Decl: 'Mixed' } }], ['Freund', { morph: SING_M_DAT }]]],
    ['ein schönes Haus', [['schönes', { morph: { Case: 'Nom,Acc', Gender: 'Neut', Number: 'Sing', Decl: 'Mixed' } }]]],
    ['die schönen Häuser', [['die', { morph: { Case: 'Nom,Acc', Number: 'Plur' } }], ['schönen', { morph: { Case: 'Nom,Acc', Number: 'Plur', Decl: 'Weak' } }], ['Häuser', { lemma: 'Haus', morph: { Case: 'Nom,Acc', Number: 'Plur', Gender: 'Neut' } }]]],
    ['viele gute Freunde', [['gute', { morph: { Number: 'Plur', Decl: 'Strong' } }]]],
    ['Das ist ein sehr guter Wein.', [['guter', { morph: { Case: 'Nom', Gender: 'Masc', Number: 'Sing', Decl: 'Mixed' } }], ['Wein', { morph: { Case: 'Nom', Gender: 'Masc' } }]]],
    ['Sie hat zwei Katzen.', [['Katzen', { lemma: 'Katze', morph: { Number: 'Plur', Gender: 'Fem' } }]]],
    ['Wir sind seit zwei Wochen hier.', [['seit', { pos: 'ADP' }], ['Wochen', { lemma: 'Woche', morph: { Case: 'Dat', Number: 'Plur', Gender: 'Fem' } }]]],
    ['Während des Tages arbeitet er.', [['Während', { pos: 'ADP' }], ['Tages', { morph: { Case: 'Gen' } }]]],
    ['Während die Kinder spielen, arbeitet er.', [['Während', { pos: 'SCONJ' }]]],
  ]);

  it('a mistake is never forced into agreement: the members stay as the engine gave them', () => {
    const p = parse('mit die Mann');
    expect(first(p, 'die').morph.Case).toBe('Nom,Acc');
    expect(first(p, 'Mann').morph.Case).toBe('Nom,Acc,Dat');
    expect(String(first(p, 'die').notes?.context ?? '')).not.toMatch(/agrees|after/);
  });

  it('a preposition that does not fit its noun phrase: the agreement is kept without it and the conflict is named', () => {
    const p = parse('Ich gehe mit den Mann.');
    expect(first(p, 'den').morph).toMatchObject({ Case: 'Acc', Gender: 'Masc', Number: 'Sing' });
    expect(first(p, 'Mann').morph).toMatchObject({ Case: 'Acc', Number: 'Sing' });
    expect(first(p, 'den').notes?.governmentConflict).toBe('mit');
    expect(first(p, 'Mann').notes?.governmentConflict).toBeUndefined();
    expect(String(first(p, 'den').notes?.context)).toMatch(/does not fit the case after mit: mit takes the dative/);
    expect(String(first(p, 'Mann').notes?.context)).toMatch(/does not fit the case after mit/);
    // another preposition and article
    expect(first(parse('Er geht ohne dem Hund.'), 'dem').notes?.governmentConflict).toBe('ohne');
    expect(first(parse('Wir fahren in der Stadt.'), 'der').notes?.governmentConflict).toBeUndefined(); // in + dative is fine
  });

  it('nothing is decided that the sentence does not decide: "Der Morgen" can be nominative singular or genitive plural', () => {
    const p = parse('Der Morgen ist schön.');
    const m = cands(p, 'Morgen').filter((c) => c.pos === 'NOUN' && !c.unconfirmed).map((c) => c.morph.Number);
    expect(m).toContain('Sing');
  });

  it('the contraction names its parts, the noun phrase keeps them', () => {
    const p = parse('Er wohnt im Haus.');
    const im = first(p, 'im');
    expect(im.parts?.map((x) => x.kind)).toEqual(['contracted', 'contracted']);
    expect(im.parts?.map((x) => x.text)).toEqual(['in', 'dem']); // the words it stands for, never the letters "i" + "m"
    expect(im.parts?.map((x) => [x.start, x.end])).toEqual([[0, 1], [1, 2]]);
    expect(String(im.notes?.context)).toMatch(/im = in \+ dem/);
  });
});

describe('separated verbs become one unit', () => {
  it.each([
    ['Er steht früh auf.', 'steht', 'auf', 'aufstehen'],
    ['Ich fange mit der Arbeit an.', 'fange', 'an', 'anfangen'],
    ['Wir kaufen heute im Supermarkt ein.', 'kaufen', 'ein', 'einkaufen'],
    ['Kommst du mit?', 'Kommst', 'mit', 'mitkommen'],
    ['Er geht nach Hause zurück.', 'geht', 'zurück', 'zurückgehen'],
    ['Er fährt das Kind um.', 'fährt', 'um', 'umfahren'],
    ['Ich stehe um sieben Uhr auf.', 'stehe', 'auf', 'aufstehen'],
    ['Sie ruft ihre Mutter an.', 'ruft', 'an', 'anrufen'],
    ['Der Zug kommt pünktlich an.', 'kommt', 'an', 'ankommen'],
    ['Er hört auf zu rauchen.', 'hört', 'auf', 'aufhören'],
    ['Sie kocht und er räumt auf.', 'räumt', 'auf', 'aufräumen'],
    ['Komm doch mal her!', 'Komm', 'her', 'herkommen'],
  ])('%s', (text, verb, particle, lemma) => {
    const p = parse(text);
    const v = index(p, verb);
    const a = index(p, particle);
    const cv = first(p, verb);
    const cp = first(p, particle);
    expect(cv.lemma).toBe(lemma);
    expect(cp.lemma).toBe(lemma);
    expect(cv.unit).toEqual({ head: v, pieces: [v, a], role: 'head', display: lemma });
    expect(cp.unit).toEqual({ head: v, pieces: [v, a], role: 'separable prefix', display: lemma });
    expect(cv.pos).toBe('VERB');
    expect(['ADP', 'ADV']).toContain(cp.pos);
    // the ordinary reading of the particle stays, behind the unit and marked down
    const rest = cands(p, particle).slice(1).find((c) => c.lemma === particle);
    expect(rest).toBeDefined();
    expect(rest!.confidence).toBeLessThanOrEqual(0.4);
    expect(rest!.unit).toBeUndefined();
  });

  it('the verb piece carries the verb\'s features', () => {
    const p = parse('Er steht früh auf.');
    expect(first(p, 'steht').morph).toMatchObject({ VerbForm: 'Fin', Person: '3', Number: 'Sing', Tense: 'Pres' });
    expect(first(p, 'auf').morph).toEqual({});
  });

  it.each([
    ['Er steht an der Tür.', 'steht', 'an', 'stehen'],
    ['Er umfährt die Baustelle.', 'umfährt', 'die', 'umfahren'],
    ['Er geht mit seinem Hund nach Hause.', 'geht', 'mit', 'gehen'],
    ['Sie lächelt wieder.', 'lächelt', 'wieder', 'lächeln'],
    ['Ich glaube an Gott.', 'glaube', 'an', 'glauben'],
  ])('%s: no unit, the base verb', (text, verb, other, lemma) => {
    const p = parse(text);
    expect(first(p, verb).lemma).toBe(lemma);
    for (const c of cands(p, verb)) expect(c.unit, `${text} ${verb}`).toBeUndefined();
    for (const c of cands(p, other)) expect(c.unit, `${text} ${other}`).toBeUndefined();
  });

  it('the inseparable umfahren is a different row from the separable one', () => {
    expect(lex.verb('umfahren').map((v) => !!v.prefix).sort()).toEqual([false, true]);
    const p = parse('Er umfährt die Baustelle.');
    expect(cands(p, 'umfährt').every((c) => !c.unit)).toBe(true);
    expect(first(p, 'umfährt').parts).toBeUndefined();
  });

  it('a prefix stranded after a verb the list does not join is an unconfirmed unit, first, with the ordinary readings right behind it', () => {
    expect(lex.verb('mitschwimmen')).toEqual([]);
    const p = parse('Er schwimmt heute mit.');
    const guess = first(p, 'schwimmt');
    const prefix = first(p, 'mit');
    expect(guess.unit).toBeDefined();
    expect(guess.lemma).toBe('mitschwimmen');
    expect(guess.unconfirmed).toBe(true);
    expect(guess.confidence).toBeLessThanOrEqual(0.6);
    expect(guess.gloss).toBeUndefined();
    expect(prefix.lemma).toBe('mitschwimmen');
    expect(prefix.unit?.role).toBe('separable prefix');
    expect(prefix.unconfirmed).toBe(true);
    // the unit readings (one per form: er schwimmt, ihr schwimmt) come first; the ordinary readings stand right behind them
    const all = cands(p, 'schwimmt');
    const k = all.findIndex((c) => !c.unit);
    expect(k).toBeGreaterThan(0);
    expect(all.slice(0, k).every((c) => c.lemma === 'mitschwimmen' && c.unconfirmed)).toBe(true);
    expect(all[k].lemma).toBe('schwimmen');
    expect(all.slice(k).some((c) => c.unit)).toBe(false);
    expect(cands(p, 'mit')[1].unit).toBeUndefined();
  });

  it('a prefix that is not of the separable kind (um, wieder …) is never guessed', () => {
    expect(lex.prefixKind('wieder')).toBe('dual');
    const p = parse('Er lächelt wieder.');
    expect(cands(p, 'lächelt').some((c) => c.unit)).toBe(false);
  });

  it('attached forms of a separable verb name their parts', () => {
    const p = parse('Er ist früh aufgestanden.');
    const c = first(p, 'aufgestanden');
    expect(c.lemma).toBe('aufstehen');
    expect(c.morph).toMatchObject({ VerbForm: 'Part', Tense: 'Past' });
    expect(c.parts?.map((x) => x.kind)).toEqual(['prefix', 'marker', 'stem']);
    expect(first(p, 'ist').role).toBe('perfect auxiliary of aufstehen');
  });
});

describe('verb forms in their clause', () => {
  run([
    ['Ich gehe.', [['gehe', { lemma: 'gehen', morph: { VerbForm: 'Fin', Person: '1', Number: 'Sing', Mood: 'Ind' } }]]],
    ['Du kommst.', [['kommst', { morph: { Person: '2', Number: 'Sing' } }]]],
    ['Er kommt.', [['kommt', { morph: { Person: '3', Number: 'Sing' } }]]],
    ['Ihr kommt.', [['Ihr', { pos: 'PRON', morph: { Person: '2', Number: 'Plur' } }], ['kommt', { morph: { Person: '2', Number: 'Plur' } }]]],
    ['Wir gehen nach Hause.', [['gehen', { morph: { VerbForm: 'Fin', Person: '1', Number: 'Plur' } }]]],
    ['Die Kinder spielen draußen.', [['spielen', { morph: { VerbForm: 'Fin', Person: '3', Number: 'Plur' } }]]],
    ['Paul sagt: „Danke!“', [['sagt', { morph: { Person: '3', Number: 'Sing' } }]]],
    ['Wie heißen Sie?', [['heißen', { morph: { VerbForm: 'Fin', Person: '3', Number: 'Plur' } }], ['Sie', { lemma: 'Sie', morph: { Polite: 'Form' } }]]],
    ['Ich will heute gehen.', [['gehen', { morph: { VerbForm: 'Inf' } }]]],
    ['Wir wollen essen.', [['wollen', { pos: 'AUX', morph: { Person: '1', Number: 'Plur' } }], ['essen', { lemma: 'essen', morph: { VerbForm: 'Inf' } }]]],
    ['Er wird kommen.', [['wird', { pos: 'AUX', lemma: 'werden' }], ['kommen', { morph: { VerbForm: 'Inf' } }]]],
    ['Er hat das Buch gelesen.', [['gelesen', { morph: { VerbForm: 'Part', Tense: 'Past' } }]]],
    ['Er hat es vergessen.', [['vergessen', { lemma: 'vergessen', morph: { VerbForm: 'Part', Tense: 'Past' } }]]],
    ['Er hat die Baustelle umfahren.', [['umfahren', { lemma: 'umfahren', morph: { VerbForm: 'Part', Tense: 'Past' } }]]],
    ['Ich habe Lust, ihn zu sehen.', [['zu', { pos: 'PART' }], ['sehen', { morph: { VerbForm: 'Inf' } }]]],
    ['Er sagt, er sei krank.', [['sei', { lemma: 'sein', morph: { Mood: 'Sub', Tense: 'Pres', Person: '3' } }]]],
    ['Er sagt, sie habe Hunger.', [['habe', { lemma: 'haben', morph: { Mood: 'Sub', Person: '3', Number: 'Sing' } }]]],
    ['Ich habe Hunger.', [['habe', { lemma: 'haben', pos: 'VERB', morph: { Mood: 'Ind', Person: '1', Number: 'Sing' } }]]],
    ['Gib mir das Buch!', [['Gib', { lemma: 'geben', morph: { Mood: 'Imp' } }]]],
    ['Kommen Sie bitte!', [['Kommen', { morph: { VerbForm: 'Fin', Person: '3', Number: 'Plur' } }]]],
    ['Das Haus wird gebaut.', [['wird', { pos: 'AUX', role: /passive auxiliary of bauen/ }], ['gebaut', { lemma: 'bauen', morph: { VerbForm: 'Part' } }]]],
    ['Sie würde gern kommen.', [['würde', { pos: 'AUX', morph: { Mood: 'Sub' }, role: /würde \+ infinitive/ }]]],
    ['Ich muss gehen.', [['muss', { pos: 'AUX', role: /modal verb with gehen/ }]]],
    ['Er ist müde.', [['ist', { pos: 'AUX', lemma: 'sein' }]]],
    ['Er hat Hunger.', [['hat', { pos: 'VERB', lemma: 'haben' }]]],
    ['Er hat gelesen.', [['hat', { pos: 'AUX', role: 'perfect auxiliary of lesen' }]]],
    ['Er ist gegangen.', [['ist', { pos: 'AUX', role: 'perfect auxiliary of gehen' }]]],
  ]);

  it('an infinitive-looking form that nothing decides keeps every reading', () => {
    const p = parse('Heute Abend gehen sie.');
    const g = cands(p, 'gehen');
    expect(g.some((c) => c.morph.VerbForm === 'Fin')).toBe(true);
  });

  it('the form of Konjunktiv I that is spelled like the indicative: the indicative by default, the subjunctive behind it at 0.3', () => {
    for (const [text, verb] of [['Ich habe es.', 'habe'], ['Wir gehen nach Hause.', 'gehen'], ['Sie kommen heute.', 'kommen'], ['Ich stehe früh auf.', 'stehe']] as const) {
      const c = cands(parse(text), verb);
      expect(c[0].morph.Mood, text).toBe('Ind');
      const sub = c.find((x) => x.morph.Mood === 'Sub' && x.morph.Tense === 'Pres');
      expect(sub, text).toBeDefined();
      expect(sub!.confidence).toBeLessThanOrEqual(0.3);
      expect(String(sub!.notes?.context)).toMatch(/also Konjunktiv I.*reported speech/);
      expect(c.indexOf(sub!), text).toBeLessThanOrEqual(2);
    }
  });

  it('in reported speech the same form stays one reading, indicative or Konjunktiv I, and says why', () => {
    for (const [text, verb] of [['Er sagt, wir gehen nach Hause.', 'gehen'], ['Sie fragt, ob wir kommen.', 'kommen'], ['Er schreibt: Ich habe Hunger.', 'habe'], ['Es heißt, sie kommen morgen.', 'kommen']] as const) {
      const c = cands(parse(text), verb)[0];
      expect(c.morph.Mood, text).toBe('Ind,Sub');
      expect(String(c.notes?.context), text).toMatch(/reported speech after/);
    }
    expect(first(parse('Er sagt, er sei krank.'), 'sei').morph.Mood).toBe('Sub');
    expect(first(parse('Er sagt, sie habe Hunger.'), 'habe').morph.Mood).toBe('Sub');
  });

  it('a preterite that is also Konjunktiv II: the indicative by default; the union in a wenn clause or beside another Konjunktiv II', () => {
    const c = cands(parse('Er machte es.'), 'machte');
    expect(c[0].morph).toMatchObject({ Mood: 'Ind', Tense: 'Past' });
    expect(c[1].morph).toMatchObject({ Mood: 'Sub', Tense: 'Past' });
    expect(c[1].confidence).toBeLessThanOrEqual(0.3);
    expect(String(c[1].notes?.context)).toMatch(/Konjunktiv II/);
    expect(first(parse('Wenn wir Zeit hätten, machten wir es.'), 'machten').morph.Mood).toBe('Ind,Sub');
    expect(first(parse('Ich machte es, wenn ich Zeit hätte.'), 'machte').morph.Mood).toBe('Ind,Sub');
    expect(first(parse('Wenn ich Zeit hätte, käme ich.'), 'hätte').morph.Mood).toBe('Sub');
  });

  it('a verb in a coordinated clause keeps its own finite reading', () => {
    const p = parse('Wir essen und trinken.');
    expect(cands(p, 'trinken').some((c) => c.morph.VerbForm === 'Fin')).toBe(true);
  });
});

describe('words that do several jobs', () => {
  run([
    ['Der Mann, der dort wohnt, ist alt.', [['der', { pos: 'PRON', morph: { PronType: 'Rel' } }], ['Der', { pos: 'DET' }]]],
    ['Das Haus, das ich kaufe, ist groß.', [['das', { pos: 'PRON', morph: { PronType: 'Rel' } }], ['Das', { pos: 'DET' }]]],
    ['Das ist gut.', [['Das', { pos: 'PRON', morph: { PronType: 'Dem' } }]]],
    ['Das Haus ist groß.', [['Das', { pos: 'DET' }]]],
    ['Ich komme aus den USA.', [['den', { pos: 'DET' }]]],
    ['Wir fahren zu dem Haus.', [['zu', { pos: 'ADP' }]]],
    ['Das ist zu teuer.', [['zu', { pos: 'ADV' }]]],
    ['Dann setzen Sie sich doch zu uns!', [['zu', { pos: 'ADP' }]]],
    ['Er liebt sein Haus.', [['sein', { pos: 'DET', morph: { Poss: 'Yes' } }]]],
    ['Es soll so sein.', [['sein', { lemma: 'sein', pos: 'AUX', morph: { VerbForm: 'Inf' } }]]],
    ['Ich weiß es.', [['weiß', { lemma: 'wissen', pos: 'VERB', morph: { Person: '1', Number: 'Sing' } }]]],
    ['Das Papier ist weiß.', [['weiß', { pos: 'ADJ' }]]],
    ['Morgen gehe ich nach Hause.', [['Morgen', { lemma: 'morgen', pos: 'ADV' }]]],
    ['Der Morgen ist schön.', [['Morgen', { lemma: 'Morgen', pos: 'NOUN' }]]],
    ['Komm doch mal her!', [['doch', { pos: 'PART' }], ['mal', { pos: 'PART' }]]],
    ['Das ist ja schön!', [['ja', { pos: 'PART' }]]],
    ['Was machst du denn da?', [['denn', { pos: 'PART' }]]],
    ['Ja, ich komme.', [['Ja', { pos: 'INTJ' }]]],
    ['Er kam nicht, denn er war krank.', [['denn', { pos: 'CONJ' }]]],
    ['Wie heißen Sie?', [['Sie', { lemma: 'Sie', pos: 'PRON' }]]],
    ['Ich habe Ihnen geholfen.', [['Ihnen', { lemma: 'Sie', pos: 'PRON', morph: { Polite: 'Form', Case: 'Dat' } }]]],
    ['Das Essen ist gut.', [['Essen', { lemma: 'Essen', pos: 'NOUN' }]]],
    ['Wir wollen essen.', [['essen', { lemma: 'essen', pos: 'VERB' }]]],
    ['Leben ist schön.', [['Leben', { lemma: 'Leben', pos: 'NOUN' }]]],
    ['Essen wir?', [['Essen', { lemma: 'essen', pos: 'VERB', morph: { Person: '1', Number: 'Plur' } }]]],
    ['Der HERR ist mein Hirte.', [['HERR', { lemma: 'Herr', pos: 'NOUN' }]]],
    ['Er kommt bis Montag.', [['bis', { pos: 'ADP' }]]],
    ['Er wartet, bis Montag ist.', [['bis', { pos: 'SCONJ' }]]],
  ]);

  it('Ihr after a capital inside a sentence is the polite form, ihr lower case is not', () => {
    const p = parse('Haben Sie Ihr Buch?');
    expect(first(p, 'Ihr').lemma).toBe('Ihr');
    expect(first(p, 'Ihr').morph.Polite).toBe('Form');
    const q = parse('Wo ist ihr Buch?');
    expect(first(q, 'ihr').morph.Polite).toBeUndefined();
  });

  it('a lower-case word is never a noun when the sentence writes its nouns with capitals', () => {
    const p = parse('Ich lese ein Buch und Brot essen.');
    expect(cands(p, 'essen')[0].pos).toBe('VERB');
    for (const c of cands(p, 'lese')) if (c.pos === 'NOUN') expect(c.confidence).toBeLessThanOrEqual(0.4);
  });

  it('the particle reading is not chosen where nothing shows it; the ordinary reading stays first', () => {
    const p = parse('Doch!');
    expect(first(p, 'Doch').pos).not.toBe('PART');
    const q = parse('Er arbeitet auch heute.');
    expect(first(q, 'auch').pos).toBe('ADV');
  });
});

describe('compounds', () => {
  const texts = (d: NonNullable<ReturnType<typeof decomposeCompound>>) => d.parts.map((p) => `${p.text}:${p.kind}`);

  it('a compound of the list keeps its own lemma and gloss, with its parts beside it', () => {
    const p = parse('Das Wohnzimmer ist groß.');
    const c = first(p, 'Wohnzimmer');
    expect(c.lemma).toBe('Wohnzimmer');
    expect(c.unconfirmed).toBeUndefined();
    expect(c.gloss).toBeDefined();
    expect(c.parts?.map((x) => x.kind)).toEqual(['component', 'head']);
    expect(c.parts?.map((x) => x.lemma)).toEqual(['wohnen', 'Zimmer']);
  });

  it('the parts: Lebensversicherung, Arbeitszimmer, Kindergottesdienst, Hausaufgaben, Wohnzimmer, Baustelle, Großstadt', () => {
    expect(texts(decomposeCompound('Lebensversicherung', lex)!)).toEqual(['Leben:component', 's:link', 'versicherung:head']);
    expect(texts(decomposeCompound('Arbeitszimmer', lex)!)).toEqual(['Arbeit:component', 's:link', 'zimmer:head']);
    const k = decomposeCompound('Kindergottesdienst', lex)!;
    expect(k.parts.map((x) => x.lemma ?? x.text)).toEqual(['Kind', 'er', 'Gottesdienst']);
    const h = decomposeCompound('Hausaufgaben', lex)!;
    expect(h.parts.map((x) => x.lemma)).toEqual(['Haus', 'Aufgabe']);
    expect(h.parts[1].text).toBe('aufgaben');
    expect(decomposeCompound('Wohnzimmer', lex)!.parts.map((x) => x.text)).toEqual(['Wohn', 'zimmer']);
    expect(decomposeCompound('Baustelle', lex)!.parts.map((x) => x.text)).toEqual(['Bau', 'stelle']);
    expect(decomposeCompound('Großstadt', lex)!.parts.map((x) => x.text)).toEqual(['Groß', 'stadt']);
  });

  it('Bundesverfassungsgericht and Krankenhausverwaltung, with a dictionary-backed word test for what the list lacks', () => {
    const isWord = (l: string) => l === 'Verfassung' || l === 'Verwaltung';
    const b = decomposeCompound('Bundesverfassungsgericht', lex, isWord)!;
    expect(b.parts.map((x) => (x.kind === 'link' ? `-${x.text}-` : x.lemma))).toEqual(['Bund', '-es-', 'Verfassung', '-s-', 'Gericht']);
    expect(b.lexical).toBe(false);
    const k = decomposeCompound('Krankenhausverwaltung', lex, isWord)!;
    expect(k.parts.at(-1)!.lemma).toBe('Verwaltung');
    expect(k.parts.map((x) => x.kind)).toContain('component');
  });

  it('nothing is split that is one word: Heimat, Verantwortung, Wohnung, Freundschaft, Landschaft', () => {
    for (const w of ['Heimat', 'Verantwortung', 'Wohnung', 'Freundschaft', 'Landschaft', 'Zeitung', 'Anfang', 'Beispiel']) expect(decomposeCompound(w, lex), w).toBeUndefined();
  });

  it('every part is at least three letters and the offsets cover the word in order', () => {
    for (const w of ['Lebensversicherung', 'Arbeitszimmer', 'Tischlampe', 'Gartentür', 'Schulbuch', 'Sonnenschein', 'Lesebuch']) {
      const d = decomposeCompound(w, lex)!;
      expect(d, w).toBeDefined();
      let at = 0;
      for (const part of d.parts) {
        expect(part.start).toBe(at);
        expect(w.slice(part.start, part.end)).toBe(part.text);
        if (part.kind !== 'link') expect(part.text.length).toBeGreaterThanOrEqual(3);
        at = part.end;
      }
      expect(at).toBe(w.length);
    }
  });

  it('a compound the list does not hold: a noun, unconfirmed, 0.55, no gloss, the head gives the gender and the endings', () => {
    expect(lex.nouns('tischlampe')).toEqual([]);
    const p = parse('Die Tischlampen sind alt.');
    const c = first(p, 'Tischlampen');
    expect(c.pos).toBe('NOUN');
    expect(c.lemma).toBe('Tischlampe');
    expect(c.unconfirmed).toBe(true);
    expect(c.confidence).toBe(0.55);
    expect(c.gloss).toBeUndefined();
    expect(c.morph).toMatchObject({ Number: 'Plur', Gender: 'Fem' });
    expect(c.parts?.map((x) => x.kind)).toEqual(['component', 'head']);
    expect(c.origin).toBe('rule');
    expect(String(c.notes?.compound)).toBe('Tisch + lampen');
  });

  it('a lower-case word, a word with no head in the list and a word of one root are not taken apart', () => {
    expect(cands(parse('Er sieht gartentür.'), 'gartentür').some((c) => c.pos === 'NOUN' && c.parts)).toBe(false);
    expect(cands(parse('Das Qwertzuiop ist da.'), 'Qwertzuiop').every((c) => c.unconfirmed === true && c.parts === undefined)).toBe(true);
  });

  it('relate: same, inflection (the separable verb too), component, none', () => {
    expect(relateGerman('Sünde', 'sünde', lex)).toBe('same');
    expect(relateGerman('Haus', 'Häuser', lex)).toBe('inflection');
    expect(relateGerman('steht', 'aufstehen', lex)).toBe('inflection');
    expect(relateGerman('aufgestanden', 'aufzustehen', lex)).toBe('inflection');
    expect(relateGerman('steht', 'aufgestanden', lex)).toBe('inflection');
    expect(relateGerman('Gotteshaus', 'Gott', lex)).toBe('component');
    expect(relateGerman('Haus', 'Hausaufgaben', lex)).toBe('component');
    expect(relateGerman('Wohnzimmer', 'Zimmer', lex)).toBe('component');
    expect(relateGerman('Herz', 'Haus', lex)).toBe('none');
    expect(relateGerman('Sunde', 'Sünde', lex)).toBe('none');
    expect(de.relate('daß', 'dass')).toBe('inflection');
  });
});

describe('older spelling is related, never rewritten', () => {
  const orth = (text: string, surface: string) => first(parse(text), surface);

  it.each([
    ['Er sagt, daß er kommt.', 'daß', 'dass', 'de-1901', 'dass'],
    ['Er muß gehen.', 'muß', 'muss', 'de-1901', 'müssen'],
    ['Er will es thun.', 'thun', 'tun', 'de-pre1901', 'tun'],
    ['Das Thal ist schön.', 'Thal', 'Tal', 'de-pre1901', 'Tal'],
    ['Er gieng nach Hause.', 'gieng', 'ging', 'de-pre1901', 'gehen'],
    ['Er that es.', 'that', 'tat', 'de-pre1901', 'tun'],
    ['Seine Armuth ist groß.', 'Armuth', 'Armut', 'de-pre1901', 'Armut'],
    ['Er giebt es mir.', 'giebt', 'gibt', 'de-pre1901', 'geben'],
  ])('%s', (text, surface, modern, period, lemma) => {
    const c = orth(text, surface);
    expect(c.lemma).toBe(lemma);
    expect(c.orthography?.modern).toBe(modern);
    expect(c.orthography?.period).toBe(period);
    expect(c.varieties).toContain(period);
    expect(c.confidence).toBeLessThanOrEqual(c.orthography!.confidence);
    expect(c.unconfirmed).toBeUndefined();
    expect(parse(text).tokens.some((t) => t.surface === surface)).toBe(true); // the text is not changed
  });

  it('a modern spelling has no relation, and ward is old vocabulary, not spelling', () => {
    for (const [text, w] of [['Er sagt, dass er kommt.', 'dass'], ['Er muss gehen.', 'muss'], ['Das Tal ist schön.', 'Tal'], ['Es ward Licht.', 'ward']] as const) {
      for (const c of cands(parse(text), w)) expect(c.orthography, `${text} ${w}`).toBeUndefined();
    }
    expect(first(parse('Es ward Licht.'), 'ward').lemma).toBe('werden');
  });
});

describe('derived nouns', () => {
  it.each([
    ['Die Wohnung ist klein.', 'Wohnung', /-ung/],
    ['Die Freiheit ist wichtig.', 'Freiheit', /-heit/],
    ['Das Lesen ist wichtig.', 'Lesen', /infinitive used as a noun/],
  ])('%s', (text, surface, re) => {
    const c = first(parse(text), surface);
    expect(c.pos).toBe('NOUN');
    expect(String(c.notes?.nominalization)).toMatch(re);
  });

  it('a capitalised infinitive is a neuter noun inside a sentence: das Lesen', () => {
    const c = first(parse('Das Lesen ist wichtig.'), 'Lesen');
    expect(c).toMatchObject({ lemma: 'Lesen', pos: 'NOUN', morph: { Gender: 'Neut', Number: 'Sing' } });
    expect(c.unconfirmed).toBeUndefined();
  });
});

describe('candidates carry their provenance', () => {
  it('a listed closed word is hand-made, a derived form is a rule, a word outside the list is an unconfirmed guess', () => {
    const p = parse('Er geht und Qwertzuiop kommt.');
    expect(first(p, 'und')).toMatchObject({ origin: 'hand', sourceId: DE_SOURCE_IDS.hand });
    expect(first(p, 'geht')).toMatchObject({ origin: 'rule', sourceId: DE_SOURCE_IDS.rules });
    expect(first(p, 'geht').notes).toMatchObject({ lemmaStatus: 'in the word list' });
    expect(first(p, 'geht').notes?.rule).toBeTruthy();
    expect(first(p, 'geht').unconfirmed).toBeUndefined();
    expect(first(p, 'geht').gloss).toBeTruthy();
    const q = first(p, 'Qwertzuiop');
    expect(q).toMatchObject({ origin: 'rule', unconfirmed: true });
    expect(q.confidence).toBeLessThanOrEqual(0.6);
    expect(q.gloss).toBeUndefined();
    expect(q.notes?.lemmaStatus).toBe('inferred by the rules');
  });

  it('every candidate has a known source', () => {
    const p = parse('Der Mann steht früh auf und geht zur Arbeit.');
    for (const a of p.analyzed) for (const c of a.candidates) {
      expect(c.sourceId && c.sourceId in (de.sources ?? {}), `${a.token.surface} ${c.sourceId}`).toBe(true);
      expect(de.sources![c.sourceId!].reviewStatus).toBe('machine-drafted');
    }
  });
});

describe('the adapter', () => {
  it('is wired: version 4, sources, varieties, honest support', () => {
    expect(de.version).toBe('4');
    expect(Object.keys(de.sources ?? {}).sort()).toEqual(Object.values(DE_SOURCE_IDS).sort());
    expect(de.varieties?.['de-1901']?.kind).toBe('historical');
    expect(de.support.lemmatization).toBe('seed-only');
    expect(de.support.morphology).toBe('limited');
    expect(de.support.limitations.join(' ')).toMatch(/machine-drafted/);
    expect(de.support.limitations.join(' ')).toMatch(/no parser/i);
  });

  it('describeMorph, morphFromTags and varietiesFromTags are the German ones', () => {
    expect(de.describeMorph!({ Case: 'Dat', Number: 'Plur' }, 'NOUN')).toMatch(/dative plural/);
    expect(de.morphFromTags!(['dative', 'plural'])).toMatchObject({ Case: 'Dat', Number: 'Plur' });
    expect(de.varietiesFromTags!(['Austria'])).toEqual(['de-AT']);
  });

  it('detects phrases and patterns on the new analysis', () => {
    const p = parse('Ich fange mit der Arbeit an.');
    expect(de.detectPatterns(p.tokens, p.analyzed).map((x) => x.key)).toContain('separable-prefix-verb');
    const q = parse('Jetzt glaube ich an Gott.');
    expect(de.detectPhrases(q.tokens, q.analyzed).map((x) => x.pattern.join(' '))).toContain('glauben an _');
  });
});

// ─────────────────────────────────────────────────────────────────────────────────────────────────────────────
// more of what a sentence decides, and what it leaves open

describe('more decisions', () => {
  run([
    ['Der Alte kommt.', [['Alte', { lemma: 'alt', pos: 'ADJ', morph: { Case: 'Nom', Gender: 'Masc', Number: 'Sing', Decl: 'Weak' }, role: 'adjective used as a noun' }]]],
    ['Das Gute siegt.', [['Gute', { lemma: 'gut', morph: { Case: 'Nom', Gender: 'Neut', Number: 'Sing' } }]]],
    ['Er hat dem Alten geholfen.', [['Alten', { morph: { Case: 'Dat', Number: 'Sing', Decl: 'Weak' } }]]],
    ['Alte Männer sind weise.', [['Alte', { pos: 'ADJ', morph: { Case: 'Nom', Number: 'Plur', Decl: 'Strong' } }]]],
    ['Das Haus ist gebaut worden.', [['ist', { role: 'perfect auxiliary of werden' }], ['worden', { role: 'passive auxiliary of bauen' }]]],
    ['Die Kinder, die im Garten spielen, sind laut.', [['spielen', { morph: { VerbForm: 'Fin', Person: '3', Number: 'Plur' } }]]],
    ['Der Mann, der dort wohnt, ist alt.', [['wohnt', { morph: { Person: '3', Number: 'Sing' } }]]],
    ['Paul sagt: „Danke!“', [['sagt', { morph: { Person: '3', Number: 'Sing' } }]]],
    ['Ich bin müde und gehe zu Bett.', [['müde', { pos: 'ADJ', absent: ['Case', 'Gender'] }], ['gehe', { morph: { Person: '1', Number: 'Sing' } }], ['zu', { pos: 'ADP' }], ['Bett', { morph: { Case: 'Dat', Gender: 'Neut' } }]]],
    ['Der Hund bellt laut.', [['laut', { pos: 'ADJ' }]]],
    ['Ich möchte ihn kennenlernen.', [['möchte', { pos: 'AUX', morph: { Mood: 'Sub', Tense: 'Past' } }], ['kennenlernen', { morph: { VerbForm: 'Inf' } }]]],
    ['Wir nehmen an dem Kurs teil.', [['nehmen', { lemma: 'teilnehmen' }], ['an', { pos: 'ADP', lemma: 'an' }]]],
    ['Es ist schwer, früh aufzustehen.', [['aufzustehen', { lemma: 'aufstehen', morph: { VerbForm: 'Inf' } }]]],
    ['Steh auf!', [['Steh', { lemma: 'aufstehen', morph: { Mood: 'Imp' } }]]],
    ['Hast du Zeit?', [['Hast', { morph: { Person: '2', Number: 'Sing' } }]]],
    ['Und Gott sprach: Es werde Licht!', [['werde', { lemma: 'werden', morph: { Mood: 'Sub', Person: '3' } }]]],
    ['Vor jedem Halt sagt eine Stimme den Namen an.', [['Halt', { pos: 'NOUN' }], ['sagt', { lemma: 'ansagen' }], ['an', { lemma: 'ansagen' }]]],
    ['Die Wohnung ist klein.', [['Wohnung', { morph: { Case: 'Nom', Gender: 'Fem' } }]]],
  ]);

  it('a unit reading is not made of a capitalised noun the list lacks (Halt is not the verb halten)', () => {
    const p = parse('Vor jedem Qwertz sagt eine Stimme den Namen an.');
    expect(first(p, 'Qwertz').unconfirmed).toBe(true);
    expect(first(p, 'Qwertz').unit).toBeUndefined();
    expect(first(p, 'sagt').lemma).toBe('ansagen');
  });

  it('a capital letter inside a sentence does not turn a pronoun into a noun (Dir, in a letter)', () => {
    const p = parse('Ich schreibe Dir einen Brief.');
    expect(first(p, 'Dir').pos).toBe('PRON');
  });

  it('a name in front of the verb makes it third person singular; two names joined by und do not', () => {
    expect(first(parse('Anna kommt.'), 'kommt').morph).toMatchObject({ Person: '3', Number: 'Sing' });
    expect(first(parse('Lena und Max gehen.'), 'gehen').morph.Number).toBe('Plur');
  });

  it('a noun phrase with a plural noun makes a plural verb; the singular decides the other way', () => {
    expect(first(parse('Der Mann sieht den Hund.'), 'sieht').morph).toMatchObject({ Person: '3', Number: 'Sing' });
    expect(first(parse('Die Männer sehen den Hund.'), 'sehen').morph).toMatchObject({ VerbForm: 'Fin', Person: '3', Number: 'Plur' });
  });

  it('the polite imperative and a verb-first question keep the subject apart from the command reading', () => {
    expect(first(parse('Kommen Sie!'), 'Kommen').morph.Person).toBe('3');
    expect(first(parse('Kommst du?'), 'Kommst').morph.Mood).toBe('Ind');
  });

  it('the lower-case noun a learner wrote is shown to the capital-letter check as the noun meant', () => {
    const p = parse('ich liebe gott');
    expect(de.checkProduction(p.tokens, p.analyzed, p.text).some((e) => e.category === 'spelling' && e.tokenIndexes[0] === index(p, 'gott'))).toBe(true);
    // the analysis itself never gives a lower-case word a noun reading
    expect(cands(p, 'gott').every((c) => c.pos !== 'NOUN' || c.unconfirmed)).toBe(true);
  });
});

// ─────────────────────────────────────────────────────────────────────────────────────────────────────────────
// refine

const GERMAN_SENTENCES: Array<{ doc: string; tokens: RawToken[] }> = [];
const FAMILIES = ['weg', 'gespraeche', 'deutschland', 'bible', 'grimm'] as const;
const familyOf = (id: string): string => FAMILIES.find((f) => id.startsWith(f === 'gespraeche' ? 'gespraech' : f === 'weg' ? 'weg-' : f)) ?? 'other';
for (const doc of loadBundledCorpus().filter((d) => d.lang === 'de')) {
  for (const sec of doc.sections) for (const par of sec.paragraphs) {
    const texts = 'sentences' in par ? par.sentences.map((s) => s.text) : de.segmentSentences(par.text).map((s) => s.text);
    for (const t of texts) GERMAN_SENTENCES.push({ doc: doc.id, tokens: de.tokenize(t) });
  }
}

const key = (c: AnalysisCandidate): string => `${c.lemma}|${c.pos}|${JSON.stringify(c.morph)}`;

describe('refine', () => {
  const refine = de.refine!;
  const both = new Set([OWN, DICT]);

  it('equals analyze on every sentence of the bundled German documents', () => {
    expect(GERMAN_SENTENCES.length).toBeGreaterThan(300);
    for (const s of GERMAN_SENTENCES) {
      const analyzed = de.analyze(s.tokens);
      const refined = refine(s.tokens, analyzed, both);
      expect(refined, s.doc).toEqual(analyzed);
    }
  });

  it('never changes what the adapter\'s own tokens say when nothing was replaced, and changes no input in place', () => {
    const toks = de.tokenize('Er steht früh auf und kauft im Supermarkt ein.');
    const a = de.analyze(toks);
    const copy = JSON.parse(JSON.stringify(a));
    refine(toks, a, both);
    expect(JSON.parse(JSON.stringify(a))).toEqual(copy);
  });

  /** A dictionary reading the way the importer builds it: morph from the dictionary's tags, origin 'dictionary'. */
  const dictReading = (lemma: string, pos: AnalysisCandidate['pos'], tags: string[], confidence = 0.45): AnalysisCandidate =>
    ({ lemma, pos, morph: de.morphFromTags!(tags), confidence, origin: 'dictionary', sourceId: DICT, gloss: `${lemma} (dictionary)` });

  function withDictionary(text: string, replaced: Record<string, AnalysisCandidate[]>): { tokens: RawToken[]; analyzed: AnalyzedToken[] } {
    const tokens = de.tokenize(text);
    const analyzed = de.analyze(tokens).map((a, i) => (replaced[tokens[i].surface] ? { token: tokens[i], candidates: replaced[tokens[i].surface].map((c) => ({ ...c, morph: { ...c.morph } })), analyzer: DICT } : a));
    return { tokens, analyzed };
  }
  const order = (a: AnalyzedToken): string[] => a.candidates.map((c) => `${c.lemma}/${c.pos}`);
  const at = (tokens: RawToken[], surface: string): number => tokens.findIndex((t) => t.surface === surface);
  const multiset = (a: AnalyzedToken): string[] => a.candidates.map(key).sort();

  it('a dictionary token inside a sentence is ordered by its neighbours: the noun after a capital, the finite verb after its subject', () => {
    const { tokens, analyzed } = withDictionary('Das Essen ist gut.', {
      Essen: [dictReading('essen', 'VERB', ['infinitive']), dictReading('Essen', 'NOUN', ['nominative', 'singular', 'neuter'])],
    });
    const out = refine(tokens, analyzed, both);
    const i = at(tokens, 'Essen');
    expect(order(out[i])[0]).toBe('Essen/NOUN');
    expect(multiset(out[i])).toEqual(multiset(analyzed[i]));
    expect(out[i].analyzer).toBe(DICT);

    const w = withDictionary('Wir gehen nach Hause.', {
      gehen: [dictReading('gehen', 'VERB', ['infinitive']), dictReading('gehen', 'VERB', ['first-person', 'plural', 'present', 'indicative'])],
    });
    const o2 = refine(w.tokens, w.analyzed, both);
    const j = at(w.tokens, 'gehen');
    expect(o2[j].candidates[0].morph).toMatchObject({ VerbForm: 'Fin', Person: '1', Number: 'Plur' });
    expect(multiset(o2[j])).toEqual(multiset(w.analyzed[j]));
  });

  it('a dictionary adjective is ordered by the noun phrase it stands in', () => {
    const { tokens, analyzed } = withDictionary('mit den guten Männern', {
      guten: [dictReading('gut', 'ADJ', ['nominative', 'masculine', 'singular', 'strong']), dictReading('gut', 'ADJ', ['dative', 'plural', 'weak'])],
    });
    const out = refine(tokens, analyzed, both);
    const i = at(tokens, 'guten');
    expect(out[i].candidates[0].morph).toMatchObject({ Case: 'Dat', Number: 'Plur' });
    expect(out[i].candidates[1].confidence).toBeLessThanOrEqual(0.4);
    expect(multiset(out[i])).toEqual(multiset(analyzed[i]));
    // and the adapter's own neighbours read the dictionary's reading
    expect(out[at(tokens, 'Männern')].candidates[0].morph).toMatchObject({ Case: 'Dat', Number: 'Plur' });
  });

  it('nothing is added, removed or rewritten on a dictionary token; a token whose analyzer is not allowed is left exactly alone', () => {
    const { tokens, analyzed } = withDictionary('Er sieht den Mann.', {
      Mann: [dictReading('Mann', 'NOUN', ['nominative', 'masculine', 'singular']), dictReading('Mann', 'NOUN', ['accusative', 'masculine', 'singular'])],
    });
    const frozen = refine(tokens, analyzed, new Set([OWN]));
    expect(frozen[at(tokens, 'Mann')]).toBe(analyzed[at(tokens, 'Mann')]);
    const out = refine(tokens, analyzed, both);
    const i = at(tokens, 'Mann');
    expect(multiset(out[i])).toEqual(multiset(analyzed[i]));
    expect(out[i].candidates[0].morph.Case).toBe('Acc');
    for (const c of out[i].candidates) expect(c.origin).toBe('dictionary');
    expect(out[i].token).toBe(analyzed[i].token);
  });

  it('a token with no dictionary reading changes its neighbours\' ordering only through its own readings', () => {
    const { tokens, analyzed } = withDictionary('Ich gehe.', { gehe: [dictReading('gehen', 'VERB', ['first-person', 'singular', 'present', 'indicative'])] });
    const out = refine(tokens, analyzed, both);
    expect(out[at(tokens, 'Ich')]).toEqual(analyzed[at(tokens, 'Ich')]);
  });

  it('the adapter\'s own words read a dictionary noun like one of their own: the article and the adjective narrow to it', () => {
    const { tokens, analyzed } = withDictionary('mit den guten Männern', { Männern: [dictReading('Mann', 'NOUN', ['dative', 'plural', 'masculine'])] });
    const out = refine(tokens, analyzed, both);
    expect(out[at(tokens, 'den')].candidates[0].morph).toMatchObject({ Case: 'Dat', Number: 'Plur' });
    expect(out[at(tokens, 'guten')].candidates[0].morph).toMatchObject({ Case: 'Dat', Number: 'Plur', Decl: 'Weak' });
    expect(out[at(tokens, 'Männern')].candidates).toHaveLength(1);
    expect(out[at(tokens, 'Männern')].candidates[0].morph).toEqual(analyzed[at(tokens, 'Männern')].candidates[0].morph);
  });

  it('a dictionary verb with a separable prefix is never joined to an own particle: no unit is invented on a list somebody else gave', () => {
    const { tokens, analyzed } = withDictionary('Er steht früh auf.', { steht: [dictReading('stehen', 'VERB', ['third-person', 'singular', 'present', 'indicative'])] });
    const out = refine(tokens, analyzed, both);
    for (const a of out) for (const c of a.candidates) expect(c.unit).toBeUndefined();
    expect(multiset(out[at(tokens, 'steht')])).toEqual(multiset(analyzed[at(tokens, 'steht')]));
  });
});

// ─────────────────────────────────────────────────────────────────────────────────────────────────────────────
// the bundled German documents

describe('every candidate of the bundled German documents is well formed', () => {
  it('units: inside the sentence, the head among the pieces, every piece carries the unit', () => {
    let units = 0;
    for (const s of GERMAN_SENTENCES) {
      const a = de.analyze(s.tokens);
      a.forEach((t, i) => {
        for (const c of t.candidates) {
          if (!c.unit) continue;
          units++;
          const u = c.unit;
          expect(u.pieces.length, s.doc).toBeGreaterThanOrEqual(2);
          expect(u.pieces.includes(u.head), `${s.doc} head`).toBe(true);
          expect(u.pieces.includes(i), `${s.doc} own index`).toBe(true);
          expect([...u.pieces].sort((x, y) => x - y), `${s.doc} order`).toEqual(u.pieces);
          for (const k of u.pieces) { expect(k).toBeGreaterThanOrEqual(0); expect(k).toBeLessThan(s.tokens.length); expect(s.tokens[k].isWord).toBe(true); }
          expect(u.display).toBe(c.lemma);
          expect(['head', 'separable prefix']).toContain(u.role);
          expect(u.role === 'head').toBe(i === u.head);
        }
      });
    }
    expect(units).toBeGreaterThan(20);
  });

  it('a unit candidate comes first on both pieces unless it is an unconfirmed guess', () => {
    for (const s of GERMAN_SENTENCES) {
      const a = de.analyze(s.tokens);
      a.forEach((t, i) => {
        t.candidates.forEach((c, k) => {
          if (c.unit && !c.unconfirmed) expect(k, `${s.doc} ${s.tokens[i].surface}`).toBeLessThan(t.candidates.length);
        });
        const firstUnit = t.candidates.findIndex((c) => c.unit && !c.unconfirmed);
        if (firstUnit >= 0) {
          expect(t.candidates[0].unit, `${s.doc} ${s.tokens[i].surface}`).toBeDefined();
          const u = t.candidates[0].unit!;
          // the other piece has the same unit first, with the same head and pieces
          for (const k of u.pieces) expect(a[k].candidates[0].unit?.head, `${s.doc} piece ${k}`).toBe(u.head);
        }
      });
    }
  });

  it('parts: offsets inside the surface, in order; each part\'s text is its slice — except a contracted part, whose text is the word it stands for', () => {
    let parts = 0;
    for (const s of GERMAN_SENTENCES) {
      const a = de.analyze(s.tokens);
      a.forEach((t, i) => {
        const surface = s.tokens[i].surface;
        for (const c of t.candidates) {
          if (!c.parts) continue;
          let at = 0;
          for (const p of c.parts) {
            parts++;
            expect(p.start, `${s.doc} ${surface}`).toBeGreaterThanOrEqual(at);
            expect(p.end).toBeGreaterThan(p.start);
            expect(p.end).toBeLessThanOrEqual(surface.length);
            if (p.kind === 'contracted') expect(p.text.length, `${s.doc} ${surface}`).toBeGreaterThanOrEqual(p.end - p.start); // im = in + dem
            else expect(surface.slice(p.start, p.end).normalize('NFC').toLocaleLowerCase('de')).toBe(p.text.normalize('NFC').toLocaleLowerCase('de'));
            at = p.end;
          }
        }
      });
    }
    expect(parts).toBeGreaterThan(50);
  });

  it('every reading has a lemma and a part of speech; a confirmed reading has a gloss or a role; a guess has no gloss', () => {
    for (const s of GERMAN_SENTENCES) {
      const a = de.analyze(s.tokens);
      a.forEach((t, i) => {
        if (!s.tokens[i].isWord) { expect(t.candidates).toEqual([]); return; }
        for (const c of t.candidates) {
          expect(c.lemma, s.tokens[i].surface).toBeTruthy();
          expect(c.pos, s.tokens[i].surface).toBeTruthy();
          expect(c.confidence).toBeGreaterThan(0);
          expect(c.confidence).toBeLessThanOrEqual(1);
          if (c.unconfirmed) { expect(c.gloss, s.tokens[i].surface).toBeUndefined(); expect(c.confidence).toBeLessThanOrEqual(0.6); }
        }
      });
    }
  });

  it('coverage (share of word tokens with a confirmed reading) per family: weg at least 90 %', () => {
    const stat = new Map<string, { words: number; confirmed: number }>();
    for (const s of GERMAN_SENTENCES) {
      const a = de.analyze(s.tokens);
      const fam = familyOf(s.doc);
      const st = stat.get(fam) ?? { words: 0, confirmed: 0 };
      s.tokens.forEach((t, i) => {
        if (!t.isWord) return;
        st.words++;
        if (a[i].candidates.some((c) => !c.unconfirmed)) st.confirmed++;
      });
      stat.set(fam, st);
    }
    const lines = [...stat].sort().map(([f, st]) => `${f}: ${(100 * st.confirmed / st.words).toFixed(1)} % of ${st.words} word tokens`);
    console.log(`German coverage by document family (a confirmed reading):\n  ${lines.join('\n  ')}`);
    const weg = stat.get('weg')!;
    expect(weg.words).toBeGreaterThan(1000);
    expect(weg.confirmed / weg.words).toBeGreaterThanOrEqual(0.9);
  });
});

describe('government conflicts, given tokens, headword variants', () => {
  it('correct German never carries a governmentConflict: none of the bundled German sentences does (exact list: empty)', () => {
    const found: string[] = [];
    for (const s of GERMAN_SENTENCES) {
      const a = de.analyze(s.tokens);
      a.forEach((t, i) => {
        if (t.candidates.some((c) => c.notes?.governmentConflict)) found.push(`${s.doc}: ${s.tokens.map((x) => x.surface).join(' ')} [${s.tokens[i].surface}]`);
      });
    }
    // the exact list: empty (Luther's feminine Feste is in the list now); a sentence that appears here is a lexicon or analysis error to report
    expect(found).toEqual([]);
  });

  it('a token named in given is taken as it is: not restarted, reordered or re-decided, though its neighbours read it', () => {
    const text = 'Er steht früh auf.';
    const tokens = de.tokenize(text);
    const analyzed = de.analyze(tokens);
    const i = tokens.findIndex((t) => t.surface === 'steht');
    // the importer put a reading beside ours and moved it first
    const extra: AnalysisCandidate = { lemma: 'stehen', pos: 'VERB', morph: { VerbForm: 'Fin' }, confidence: 0.45, origin: 'dictionary', sourceId: DICT };
    const mine = analyzed.map((a, k) => (k === i ? { ...a, candidates: [extra, ...a.candidates.map((c) => ({ ...c }))] } : a));
    const before = JSON.stringify(mine[i]);
    const out = de.refine!(tokens, mine, new Set([OWN]), new Set([i]));
    expect(JSON.stringify(out[i])).toBe(before);
    expect(out[i]).toBe(mine[i]);
    // without given the same token is started again from the context-free readings
    const again = de.refine!(tokens, mine, new Set([OWN]));
    expect(again[i].candidates[0].origin).not.toBe('dictionary');
    // the neighbours are still ordered
    expect(out[tokens.findIndex((t) => t.surface === 'Er')].candidates.length).toBeGreaterThan(0);
  });

  it('lemmaVariants: the older spelling the list pairs with the lemma, then the ß / ss variant; never the lemma itself', () => {
    const v = de.lemmaVariants!;
    expect(v('Tal')).toContain('Thal');
    expect(v('tun')).toContain('thun');
    expect(v('dass')).toContain('daß');
    expect(v('Straße')).toEqual(['Strasse']);
    expect(v('Haus')).toEqual([]);
    for (const l of ['Tal', 'dass', 'Fluss', 'Straße']) expect(v(l)).not.toContain(l);
  });
});

// ─────────────────────────────────────────────────────────────────────────────────────────────────────────────
// batch 2: one phrase one set of cells, the subject fixes the verb, the relative pronoun, bis, je … desto, homograph nouns, auxiliaries

describe('A. one noun phrase, one set of cells', () => {
  run([
    ['Der Lehrer liest den Kindern eine Geschichte vor.', [
      ['Der', { morph: { Case: 'Nom', Gender: 'Masc', Number: 'Sing' } }], ['Lehrer', { morph: { Case: 'Nom', Gender: 'Masc', Number: 'Sing' } }],
      ['den', { morph: { Case: 'Dat', Number: 'Plur' } }], ['Kindern', { morph: { Case: 'Dat', Number: 'Plur' } }]]],
    ['Der Lehrer der Kinder kommt.', [
      ['Der', { morph: { Case: 'Nom', Number: 'Sing' } }], ['Lehrer', { morph: { Case: 'Nom', Number: 'Sing' } }],
      ['der', { morph: { Case: 'Gen', Number: 'Plur' } }], ['Kinder', { morph: { Case: 'Gen', Number: 'Plur' } }]]],
    ['Im Sommer fahren viele Deutsche an die Ostsee.', [
      ['viele', { morph: { Case: 'Nom', Number: 'Plur' } }], ['Deutsche', { morph: { Case: 'Nom', Number: 'Plur' } }], ['fahren', { morph: { Person: '3', Number: 'Plur' } }]]],
    // nothing decides: both phrases stay nominative-or-accusative
    ['Die Frau sieht die Tochter.', [['Die', { morph: { Case: 'Nom,Acc' } }], ['Frau', { morph: { Case: 'Nom,Acc' } }], ['die', { morph: { Case: 'Nom,Acc' } }], ['Tochter', { morph: { Case: 'Nom,Acc' } }]]],
    // a number that agrees with only one of two phrases decides that one
    ['Die Frau sieht die Töchter.', [['Die', { morph: { Case: 'Nom', Number: 'Sing' } }], ['Frau', { morph: { Case: 'Nom' } }]]],
  ]);

  it('the article never keeps an alternative the noun has lost: determiner, adjectives and noun carry the same case, gender and number', () => {
    for (const text of ['Der Lehrer liest den Kindern eine Geschichte vor.', 'Der gute Lehrer kommt.', 'Im Sommer fahren viele junge Deutsche an die Ostsee.', 'Morgen kommt der Lehrer.']) {
      const p = parse(text);
      for (const [det, noun] of [['Der', 'Lehrer'], ['Der', 'Lehrer'], ['viele', 'Deutsche'], ['der', 'Lehrer']] as const) {
        if (!p.tokens.some((t) => t.surface === det) || !p.tokens.some((t) => t.surface === noun)) continue;
        for (const k of ['Case', 'Number'] as const) expect(first(p, det).morph[k], `${text} ${det} ${k}`).toBe(first(p, noun).morph[k]);
      }
    }
  });

  it('a dative that is also genitive stays so after a verb: "der Frau" is not made nominative by any subject rule', () => {
    const p = parse('Ich gebe der Frau das Buch.');
    expect(first(p, 'der').morph.Case.split(',')).toContain('Dat');
    expect(first(p, 'der').morph.Case.split(',')).not.toContain('Nom');
    expect(first(p, 'Frau').morph.Case.split(',')).not.toContain('Nom');
  });

  it('one lemma with several cells is not a homograph: die Lehrer keeps its confidence', () => {
    const c = cands(parse('Die Lehrer kommen.'), 'Lehrer');
    expect(new Set(c.map((x) => x.lemma)).size).toBe(1);
    expect(c[0].confidence).toBeGreaterThan(0.5);
  });

  it('a genitive does not open a clause when another case fits, but a genitive that is only genitive stays', () => {
    expect(first(parse('Der Lehrer liest.'), 'Der').morph.Case).toBe('Nom');
    expect(first(parse('Eines Tages kam er.'), 'Eines').morph.Case).toBe('Gen');
  });
});

describe('B. the subject, wherever it stands, fixes the verb', () => {
  run([
    // 1. a nominative-only pronoun, before the verb, after it, or anywhere before a clause-final verb
    ['Je mehr er liest, desto klüger wird er.', [['liest', { morph: { Person: '3', Number: 'Sing' } }]]],
    ['Ich ahne, weil du morgen früh kommst, dass es klappt.', [['kommst', { morph: { Person: '2', Number: 'Sing' } }]]],
    ['Morgen gehen wir.', [['gehen', { morph: { Person: '1', Number: 'Plur' } }]]],
    ['Gehen wir!', [['Gehen', { morph: { Person: '1', Number: 'Plur' } }]]],
    // 2. the only noun phrase that can be nominative and agrees in number
    ['Morgen kommt der Lehrer.', [['kommt', { morph: { Person: '3', Number: 'Sing' } }], ['Lehrer', { morph: { Case: 'Nom' } }]]],
    ['Dem Kind gibt die Frau ein Buch.', [['gibt', { morph: { Person: '3', Number: 'Sing' } }], ['Kind', { morph: { Case: 'Dat' } }]]],
    // 3./4. two candidates: neither narrowed, the verb still third person; no first or second person without its pronoun
    ['Die Frau sieht die Tochter.', [['sieht', { morph: { Person: '3', Number: 'Sing' } }]]],
    ['Die Kinder lachten laut.', [['lachten', { morph: { Person: '3', Number: 'Plur' } }]]],
    ['Dort liest man das Buch.', [['liest', { morph: { Person: '3', Number: 'Sing' } }]]],
    // a subject shared across a coordination
    ['Ich ging nach Hause und las ein Buch.', [['las', { morph: { Person: '1', Number: 'Sing' } }], ['Buch', { morph: { Case: 'Nom,Acc' } }]]],
    ['Wir kamen an und gingen sofort ins Hotel.', [['gingen', { morph: { Person: '1', Number: 'Plur' } }]]],
    ['Sie kommen morgen.', [['kommen', { morph: { Person: '3', Number: 'Plur' } }]]],
    // 5. the matrix clause continues across an inserted clause
    ['Die Kinder, die im Garten spielten, lachten laut.', [['lachten', { morph: { Person: '3', Number: 'Plur' } }], ['spielten', { morph: { Person: '3', Number: 'Plur' } }]]],
    ['Der Mann, den ich gestern gesehen habe, wohnt hier.', [['wohnt', { morph: { Person: '3', Number: 'Sing' } }], ['habe', { morph: { Person: '1', Number: 'Sing' } }]]],
    // what stays open
    ['Lies das Buch!', [['Lies', { morph: { Mood: 'Imp', Person: '2' } }], ['Buch', { morph: { Case: 'Nom,Acc' } }]]],
    ['Bring nur gute Laune mit!', [['Laune', { morph: { Case: 'Nom,Acc' } }]]],
  ]);

  it('a coordinated clause whose subject cannot be told stays open: no third person is asserted', () => {
    expect(first(parse('Und las ein Buch.'), 'las').morph.Person).toBe('1,3');
    expect(first(parse('Gestern las.'), 'las').morph.Person).toBe('1,3'); // a fragment with no subject at all
  });

  it('a clause whose subject is a clause: the noun phrase behind the verb is not narrowed', () => {
    const p = parse('Wer keine Karte hat, muss Strafe zahlen.');
    expect(first(p, 'Strafe').morph.Case.split(',').length).toBeGreaterThan(1);
  });

  it('a first or second person form with no pronoun is still possible where the clause cannot be read: a verb first stays open', () => {
    expect(first(parse('Habe keine Zeit.'), 'Habe').morph.Person).not.toBe('3');
  });
});

describe('C. the relative pronoun takes gender and number from its antecedent, never case', () => {
  run([
    ['Die Kinder, die im Garten spielten, lachten laut.', [['die', { pos: 'PRON', morph: { Number: 'Plur' } }]]],
    ['Die Frau, die dort steht, ist nett.', [['die', { pos: 'PRON', morph: { Gender: 'Fem', Number: 'Sing', Case: 'Nom,Acc' } }]]],
    ['Das Buch, das ich lese, ist gut.', [['das', { pos: 'PRON', morph: { Gender: 'Neut', Number: 'Sing' } }]]],
    ['Die Männer, denen ich helfe, danken mir.', [['denen', { pos: 'PRON', morph: { Case: 'Dat', Number: 'Plur' } }]]],
    ['Das Haus des Mannes, das dort steht, ist alt.', [['das', { pos: 'PRON', morph: { Gender: 'Neut', Number: 'Sing' } }]]],
  ]);

  it('a relative pronoun that is the subject gives its number to the verb of its clause', () => {
    expect(first(parse('Die Kinder, die spielen, lachen.'), 'spielen').morph).toMatchObject({ Person: '3', Number: 'Plur' });
    expect(first(parse('Das Kind, das spielt, lacht.'), 'spielt').morph).toMatchObject({ Person: '3', Number: 'Sing' });
  });

  it('when several candidates agree the union is kept: "der Sohn der Frau, der" is not decided', () => {
    const p = parse('Der Sohn der Frau, der dort steht, ist nett.');
    expect(first(p, 'der', 1).morph).toMatchObject({ PronType: 'Rel', Gender: 'Masc,Fem' }); // Sohn (m) and Frau (f) both fit the form: the union stays
  });

  it('the Konjunktiv rule runs inside relative and other subordinate clauses as in a main clause', () => {
    const p = parse('Die Kinder, die im Garten spielten, lachten laut.');
    for (const w of ['spielten', 'lachten']) {
      const c = cands(p, w);
      expect(c[0].morph.Mood, w).toBe('Ind');
      const sub = c.find((x) => x.morph.Mood === 'Sub')!;
      expect(sub.confidence, w).toBeLessThanOrEqual(0.3);
      expect(String(sub.notes?.context)).toMatch(/Konjunktiv II/);
    }
    // the licences: wenn, als ob, another unambiguous Konjunktiv II beside it
    expect(first(parse('Wenn die Kinder im Garten spielten, wäre es laut.'), 'spielten').morph.Mood).toBe('Ind,Sub');
    expect(first(parse('Er tut, als ob die Kinder spielten.'), 'spielten').morph.Mood).toBe('Ind,Sub');
    expect(first(parse('Die Kinder spielten, und sie würden lachen.'), 'spielten').morph.Mood).toBe('Ind,Sub');
    // a form that is itself ambiguous does not license its neighbour
    expect(first(parse('Die Kinder spielten und lachten.'), 'spielten').morph.Mood).toBe('Ind');
  });
});

describe('D. bis', () => {
  it.each([
    'Ich warte bis Montag.', 'Bis morgen!', 'Bis drei Uhr bleibe ich hier.', 'Er wartet bis jetzt.', 'Bis dahin ist es lang.',
    'Wir gehen bis zur Kirche.', 'Wir gehen bis nach Berlin.', 'Wir gehen bis an den Rand.', 'Er arbeitet bis in die Nacht.',
    'Das gilt bis auf weiteres.', 'Er bleibt bis zum Ende.', 'Von Montag bis Freitag arbeiten wir.',
  ])('%s: the preposition', (text) => {
    const p = parse(text);
    expect(first(p, p.tokens.find((t) => t.normalized === 'bis')!.surface).pos).toBe('ADP');
  });

  it.each(['Ich warte, bis er kommt.', 'Bis du zurück bist, bleibe ich hier.', 'Ich warte bis er kommt.', 'Sie bleibt hier, bis wir fertig sind.'])('%s: the conjunction', (text) => {
    const p = parse(text);
    expect(first(p, p.tokens.find((t) => t.normalized === 'bis')!.surface).pos).toBe('SCONJ');
  });
});

describe('E. je … desto, and the imperative', () => {
  it('je opens a clause that ends in its verb; mehr is not an imperative; the desto clause has its verb right after the desto phrase', () => {
    const p = parse('Je mehr du liest, desto besser verstehst du die Sprache.');
    expect(first(p, 'mehr').pos).not.toBe('VERB');
    expect(cands(p, 'mehr').find((c) => c.morph.Mood === 'Imp')?.confidence ?? 0).toBeLessThanOrEqual(0.4);
    expect(first(p, 'liest').morph).toMatchObject({ Person: '2', Number: 'Sing' });
    expect(first(p, 'verstehst').morph).toMatchObject({ Person: '2', Number: 'Sing' });
  });

  it('an imperative stands at the head of its clause; a word that is also a function word or adverb does not take it', () => {
    expect(first(parse('Mehr Licht!'), 'Mehr').pos).not.toBe('VERB');
    expect(first(parse('Lies mehr!'), 'Lies').morph.Mood).toBe('Imp');
    expect(first(parse('Lies mehr!'), 'mehr').pos).not.toBe('VERB');
    expect(first(parse('Halt!'), 'Halt').pos).toBe('INTJ');
    expect(first(parse('Gib mir bitte das Buch!'), 'bitte').pos).not.toBe('VERB');
    expect(first(parse('Bitte komm!'), 'komm').morph.Mood).toBe('Imp');
    expect(first(parse('Komm doch mal her!'), 'Komm').morph.Mood).toBe('Imp');
    expect(first(parse('Hör mal zu!'), 'Hör').morph.Mood).toBe('Imp');
    expect(first(parse('Er geht weg.'), 'weg').pos).not.toBe('VERB');
  });
});

describe('F. two nouns, one spelling', () => {
  it('nothing decides: neither is certain, both are named', () => {
    const p = parse('Und Gott nannte die Feste Himmel.');
    const c = cands(p, 'Feste').filter((x) => x.pos === 'NOUN' && !x.unconfirmed && x.confidence > 0.4);
    expect(new Set(c.map((x) => x.lemma))).toEqual(new Set(['Fest', 'Feste']));
    for (const x of c) {
      expect(x.confidence).toBeLessThanOrEqual(0.45);
      expect(String(x.notes?.context)).toMatch(/could be the plural of Fest or the singular of Feste: the sentence does not decide/);
    }
  });

  it('within one sentence a spelling means one word: the occurrence the article decides decides the others', () => {
    const p = parse('Da machte Gott die Feste und schied das Wasser unter der Feste von dem Wasser.');
    expect(first(p, 'Feste', 0).lemma).toBe('Feste');
    expect(first(p, 'Feste', 0).confidence).toBeGreaterThan(0.5);
    expect(String(first(p, 'Feste', 0).notes?.context)).toMatch(/the same spelling stands elsewhere in the sentence/);
    expect(first(p, 'Feste', 1)).toMatchObject({ lemma: 'Feste' });
  });

  it('it does not fire when the article or an adjective decides', () => {
    expect(first(parse('Er sieht eine Feste.'), 'Feste')).toMatchObject({ lemma: 'Feste' });
    expect(first(parse('Er sieht eine Feste.'), 'Feste').confidence).toBeGreaterThan(0.5);
    expect(first(parse('Viele Feste sind schön.'), 'Feste')).toMatchObject({ lemma: 'Fest' });
    expect(first(parse('Viele Feste sind schön.'), 'Feste').confidence).toBeGreaterThan(0.5);
    expect(first(parse('Das Fest ist schön.'), 'Fest').confidence).toBeGreaterThan(0.5);
  });

  it('every pair the rule fires on in the bundled texts is a real homograph of two lemmas', () => {
    const fired = new Map<string, number>();
    for (const s of GERMAN_SENTENCES) {
      de.analyze(s.tokens).forEach((a) => {
        const c = a.candidates.find((x) => String(x.notes?.context ?? '').includes('the sentence does not decide'));
        if (!c) return;
        const key = String(c.notes!.context).match(/could be (.*?): the sentence does not decide/)![1];
        fired.set(key, (fired.get(key) ?? 0) + 1);
        const lemmas = a.candidates.filter((x) => x.pos === 'NOUN' && x.confidence <= 0.45).map((x) => x.lemma);
        expect(new Set(lemmas).size, key).toBeGreaterThan(1);
      });
    }
    console.log(`Homograph nouns the rule fired on (bundled texts): ${[...fired].map(([k, v]) => `${v} × ${k}`).join('; ')}`);
    expect(fired.size).toBeGreaterThan(0);
  });
});

describe('G. an unconfirmed participle still makes its auxiliary an auxiliary', () => {
  it('both participles belong to hat, the unconfirmed one keeps its flag', () => {
    const p = parse('Sie hat den Brief nicht abgeschickt, sondern weggeworfen.');
    const hat = first(p, 'hat');
    expect(hat.pos).toBe('AUX');
    expect(hat.role).toBe('perfect auxiliary of abschicken (a verb not in the word list) and wegwerfen');
    expect(first(p, 'abgeschickt')).toMatchObject({ lemma: 'abschicken', unconfirmed: true });
    expect(first(p, 'abgeschickt').gloss).toBeUndefined();
    expect(first(p, 'abgeschickt').confidence).toBeLessThanOrEqual(0.6);
  });

  it('with a stubbed unconfirmed participle (the engine\'s reading given by somebody else)', () => {
    const tokens = de.tokenize('Er hat es zugeschickt.');
    const analyzed = de.analyze(tokens);
    const i = tokens.findIndex((t) => t.surface === 'zugeschickt');
    const stub: AnalysisCandidate = { lemma: 'zuschicken', pos: 'VERB', morph: { VerbForm: 'Part', Tense: 'Past' }, confidence: 0.6, unconfirmed: true, origin: 'rule' };
    const out = de.refine!(tokens, analyzed.map((a, k) => (k === i ? { ...a, candidates: [stub], analyzer: DICT } : a)), new Set([OWN, DICT]));
    const hat = out[tokens.findIndex((t) => t.surface === 'hat')].candidates[0];
    expect(hat.pos).toBe('AUX');
    expect(hat.role).toBe('perfect auxiliary of zuschicken (a verb not in the word list)');
    expect(out[i].candidates[0].unconfirmed).toBe(true);
  });

  it('negative: haben with no participle stays a verb, and a confirmed participle needs no remark', () => {
    expect(first(parse('Er hat Hunger.'), 'hat').pos).toBe('VERB');
    expect(first(parse('Er hat gelesen.'), 'hat').role).toBe('perfect auxiliary of lesen');
  });
});

// ─────────────────────────────────────────────────────────────────────────────────────────────────────────────
// fix batch 3 (adapter-de@4)

describe('batch 3, addendum: one noun, several spellings (DeNoun.sameAs)', () => {
  it('Frieden / Friede / Friedens are one lemma, the own headword stays in a note, and the word is not capped', () => {
    const p = parse('Wir beten um Frieden.');
    expect(first(p, 'Frieden')).toMatchObject({ lemma: 'Frieden', pos: 'NOUN' });
    expect(first(p, 'Frieden').confidence).toBeGreaterThan(0.8);
    const q = parse('Friede sei mit euch.');
    expect(first(q, 'Friede')).toMatchObject({ lemma: 'Frieden', morph: { Case: 'Nom' } });
    expect(first(q, 'Friede').notes?.variantOf).toBe('Friede');
    expect(first(q, 'Friede').confidence).toBeGreaterThan(0.8);
  });

  it('Samen is one lemma and is not capped', () => {
    const p = parse('Er gab ihm seinen eigenen Samen.');
    expect(first(p, 'Samen').lemma).toBe('Samen');
    expect(first(p, 'Samen').confidence).toBeGreaterThan(0.8);
  });

  it('negative: a real homograph (Feste: Fest plural or Feste singular) is still capped and still open', () => {
    const c = cands(parse('Und Gott nannte die Feste Himmel.'), 'Feste').filter((x) => x.pos === 'NOUN' && !x.unconfirmed && x.confidence > 0.4);
    expect(new Set(c.map((x) => x.lemma))).toEqual(new Set(['Fest', 'Feste']));
  });
});

describe('batch 3, rule 1: one finite verb per clause', () => {
  it('a form at the end of a clause that has its finite verb is the participle', () => {
    const p = parse('Eines Morgens fand er sich in seinem Bett zu einem Ungeziefer verwandelt.');
    expect(first(p, 'fand')).toMatchObject({ lemma: 'finden', morph: { VerbForm: 'Fin', Person: '3', Number: 'Sing' } });
    expect(first(p, 'verwandelt')).toMatchObject({ lemma: 'verwandeln', morph: { VerbForm: 'Part' } });
  });

  it('negatives: a verb-final subordinate clause keeps its finite verb, and a coordinated second verb is finite', () => {
    const p = parse('Er sagte, dass er kommt und geht.');
    expect(first(p, 'kommt').morph).toMatchObject({ VerbForm: 'Fin', Person: '3' });
    expect(first(p, 'geht').morph).toMatchObject({ VerbForm: 'Fin', Person: '3' });
    const q = parse('Ich weiß, dass er hier wohnt.');
    expect(first(q, 'wohnt').morph).toMatchObject({ VerbForm: 'Fin', Person: '3', Number: 'Sing' });
  });
});

describe('batch 3, rule 2: the pre-field holds one constituent', () => {
  it('a noun phrase after another noun phrase in the pre-field is its genitive attribute', () => {
    const p = parse('Die alten Häuser der Stadt wurden renoviert.');
    expect(first(p, 'Stadt').morph).toMatchObject({ Case: 'Gen', Gender: 'Fem', Number: 'Sing' });
    expect(first(p, 'Häuser').morph).toMatchObject({ Case: 'Nom', Number: 'Plur' });
    const q = parse('Der Bruder meiner Mutter kommt.');
    expect(first(q, 'Mutter').morph).toMatchObject({ Case: 'Gen', Gender: 'Fem' });
    expect(first(q, 'Bruder').morph).toMatchObject({ Case: 'Nom', Gender: 'Masc' });
    expect(String(first(q, 'Mutter').notes?.context)).toMatch(/pre-field/);
  });

  it('negative: after the verb the same shape is not decided (dative or genitive stays open)', () => {
    const p = parse('Gestern gab der Lehrer der Schülerin ein Buch.');
    expect(first(p, 'Schülerin').morph.Case).toBe('Dat,Gen');
  });

  it('negative: in a subordinate clause nothing is forced', () => {
    const p = parse('Ich weiß, dass der Lehrer der Schülerin ein Buch gab.');
    expect(first(p, 'Schülerin').morph.Case).toBe('Dat,Gen');
  });
});

describe('batch 3, rule 3: a verb the list marks [dat] decides its single dative-capable phrase', () => {
  it('gehören: the one phrase that can be dative is the dative', () => {
    const p = parse('Die Bücher gehören meiner Schwester.');
    expect(first(p, 'Schwester').morph).toMatchObject({ Case: 'Dat' });
    expect(first(p, 'Schwester').morph.Case).toBe('Dat');
    expect(String(first(p, 'Schwester').notes?.context)).toMatch(/takes a dative object/);
  });

  it('the list marks 50 verbs; geben is not one of them, so its dative stays open (nothing is invented)', () => {
    expect(lex.allVerbs().filter((v) => v.governs === 'dat').length).toBe(50);
    expect(lex.allVerbs().find((v) => v.lemma === 'geben')?.governs).toBeUndefined();
    const p = parse('Ich gebe der Frau das Buch.');
    expect(first(p, 'Frau').morph.Case).toBe('Dat,Gen');
  });
});

describe('batch 3, rule 4: wer and was as subject', () => {
  it('Wer kommt heute? / Was ist das? / Wer das sagt, lügt.', () => {
    expect(first(parse('Wer kommt heute?'), 'kommt').morph).toMatchObject({ Person: '3', Number: 'Sing' });
    expect(first(parse('Was ist das?'), 'ist').morph).toMatchObject({ Person: '3', Number: 'Sing' });
    const p = parse('Wer das sagt, lügt.');
    expect(first(p, 'sagt').morph).toMatchObject({ Person: '3', Number: 'Sing' });
    expect(first(p, 'lügt').morph).toMatchObject({ Person: '3', Number: 'Sing' });
  });

  it('negatives: Was machst du? and Wen siehst du? keep their own subject du', () => {
    expect(first(parse('Was machst du?'), 'machst').morph).toMatchObject({ Person: '2', Number: 'Sing' });
    const p = parse('Wen siehst du?');
    expect(first(p, 'siehst').morph).toMatchObject({ Person: '2' });
    expect(first(p, 'Wen').morph.Case).toBe('Acc');
  });
});

describe('batch 3, rule 5: long sentences', () => {
  it('a comma between coordinated adjectives in a noun phrase is no clause boundary', () => {
    const p = parse('Ein großes, schönes Haus steht dort.');
    expect(first(p, 'schönes').morph).toMatchObject({ Case: 'Nom', Gender: 'Neut' });
    expect(first(p, 'steht').morph).toMatchObject({ VerbForm: 'Fin', Person: '3', Number: 'Sing' });
  });

  it('an um … zu clause ends at its infinitive; "und ließ …" is the main clause again', () => {
    const p = parse('Er ging nach Hause, um zu schlafen, und ließ die Tür offen.');
    expect(first(p, 'schlafen').morph).toMatchObject({ VerbForm: 'Inf' });
    expect(first(p, 'ließ').morph).toMatchObject({ VerbForm: 'Fin', Person: '3', Number: 'Sing' });
  });

  it('a zu-infinitive before a clause-final finite verb does not end the clause', () => {
    const p = parse('Ich weiß, dass er versucht, früh aufzustehen, und dann kommt.');
    expect(first(p, 'kommt').morph).toMatchObject({ VerbForm: 'Fin', Person: '3', Number: 'Sing' });
  });

  it('sentence-initial als with a clause-final finite verb is the subordinator', () => {
    expect(first(parse('Als er kam, war sie schon weg.'), 'Als').pos).toBe('SCONJ');
  });

  it('negatives: als of comparison and als "as" are not the subordinator', () => {
    expect(first(parse('Er ist größer als ich.'), 'als').pos).toBe('CONJ');
    expect(first(parse('Als Kind wohnte er in Berlin.'), 'Als').pos).toBe('CONJ');
  });
});

describe('batch 3, rule 6: a stranded prefix of a verb the list does not hold', () => {
  it('builds an unconfirmed unit first, with the ordinary readings behind it, for several verbs', () => {
    for (const [text, verb, unit] of [['Er gleitet langsam zurück.', 'gleitet', 'zurückgleiten'], ['Der Mann lässt den Hund heute ab.', 'lässt', 'ablassen'], ['Wir bleiben heute zusammen.', 'bleiben', 'zusammenbleiben']] as const) {
      const p = parse(text);
      expect(first(p, verb), text).toMatchObject({ lemma: unit, unconfirmed: true });
      expect(first(p, verb).unit?.display).toBe(unit);
      expect(first(p, verb).confidence).toBeLessThanOrEqual(0.6);
      expect(first(p, verb).gloss).toBeUndefined();
      expect(cands(p, verb).length).toBeGreaterThan(1);
    }
  });

  it('a listed verb keeps its confirmed unit', () => {
    const p = parse('Er kommt morgen her.');
    expect(first(p, 'kommt')).toMatchObject({ lemma: 'herkommen' });
    expect(first(p, 'kommt').unconfirmed).toBeUndefined();
  });

  it('negatives: a preposition with its noun phrase, a measure adverb, and sein/modal verbs make no unit', () => {
    for (const [text, verb] of [['Er steht auf dem Tisch.', 'steht'], ['Er wohnt weit weg.', 'wohnt'], ['Die Tür ist zu.', 'ist'], ['Das Licht ist an.', 'ist'], ['Er ist weg.', 'ist'], ['Er will mit.', 'will']] as const) {
      const p = parse(text);
      expect(first(p, verb).unit, text).toBeUndefined();
      expect(first(p, verb).unconfirmed, text).toBeUndefined();
    }
  });
});

describe('batch 3, rule 7: andere / viele + an adjectival noun, plural verb', () => {
  it('the plural noun is the subject of the plural verb', () => {
    const p = parse('Andere Reisende leben wie Haremsfrauen.');
    expect(first(p, 'Reisende').morph).toMatchObject({ Case: 'Nom', Number: 'Plur' });
    expect(first(p, 'leben').morph).toMatchObject({ VerbForm: 'Fin', Person: '3', Number: 'Plur' });
    expect(first(parse('Viele Deutsche wohnen hier.'), 'wohnen').morph).toMatchObject({ Person: '3', Number: 'Plur' });
    expect(first(parse('Die Angestellten arbeiten viel.'), 'arbeiten').morph).toMatchObject({ Person: '3', Number: 'Plur' });
  });

  it('negative: the singular feminine "Die Reisende lebt" stays singular', () => {
    const p = parse('Die Reisende lebt in Berlin.');
    expect(first(p, 'Reisende').morph).toMatchObject({ Number: 'Sing', Gender: 'Fem' });
    expect(first(p, 'lebt').morph).toMatchObject({ Number: 'Sing' });
  });
});

describe('batch 3, rule 8: the state passive is not a perfect', () => {
  it('sein + participle of a verb that takes only haben is the state passive', () => {
    const p = parse('Das Fenster ist geöffnet.');
    expect(first(p, 'ist').role).toBe('state passive: sein + participle says the result of öffnen');
    expect(first(p, 'ist').notes?.voice).toBe('state-passive');
  });

  it('negatives: sein-verbs stay perfect; haben stays perfect', () => {
    const p = parse('Er ist gekommen.');
    expect(first(p, 'ist').role).toBe('perfect auxiliary of kommen');
    expect(first(p, 'ist').notes?.voice).toBeUndefined();
    expect(first(parse('Er hat das Fenster geöffnet.'), 'hat').role).toBe('perfect auxiliary of öffnen');
  });
});
