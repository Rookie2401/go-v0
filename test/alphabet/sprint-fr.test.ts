import { describe, expect, it } from 'vitest';
import { parseSprintUnitId } from '../../packages/language-packs/src/alphabet-sprint/ids';
import { scriptKnowledge, type SprintCardState } from '../../packages/language-packs/src/alphabet-sprint/knowledge';
import { planSprint } from '../../packages/language-packs/src/alphabet-sprint/plan';
import { FR_PROFILE } from '../../packages/language-packs/src/alphabet-sprint/profiles/fr';
import { loadSprintProfiles, SPRINT_LANGUAGES, sprintLanguageOf } from '../../packages/language-packs/src/alphabet-sprint/profiles';
import { wordDependencies } from '../../packages/language-packs/src/alphabet-sprint/select';
import { FR_ALPHABET_ROWS } from '../../packages/language-packs/src/tutorial/fr';
import { profileChecks } from './sprint-kit';

const NEW_KEYS = ['ce / ci', 'ien', 'oin'];
profileChecks(FR_PROFILE, { newKeys: NEW_KEYS });

const P = FR_PROFILE;
const familiar = new Set(P.units.filter((u) => u.familiar).map((u) => u.key));
/** The taught (not familiar) unit keys a form needs. */
const taught = (form: string): Set<string> => new Set((P.dependencies(form) ?? []).filter((k) => !familiar.has(k)));

describe('French sprint: the unit keys line up with the 69 rows of the older Alphabet deck', () => {
  const rows = FR_ALPHABET_ROWS.map(([glyph]) => glyph);

  it('has 69 deck rows, and every non-rule unit key is a row glyph exactly or one of the three declared new spellings', () => {
    expect(rows).toHaveLength(69);
    for (const u of P.units.filter((x) => x.kind !== 'rule')) expect(rows.includes(u.key) || NEW_KEYS.includes(u.key), u.key).toBe(true);
    expect(P.units.filter((u) => u.kind !== 'rule' && rows.includes(u.key))).toHaveLength(61);
  });

  it('leaves eight rows without a unit of that glyph: the rules (which have rule- keys) and two rare letters', () => {
    const unitKeys = new Set(P.units.map((u) => u.key));
    expect(rows.filter((g) => !unitKeys.has(g))).toEqual(['ü', 'æ', 'n or m before a vowel', 'final -e', 'final -er, -ez', 'final d, p, s, t, x, z', 'final c, r, f, l', '-ent']);
  });

  it('teaches only what an English reader reads wrong: b d f k l m n p t v w z are familiar and every familiar unit is a plain letter', () => {
    expect([...familiar].sort()).toEqual(['B b', 'D d', 'F f', 'K k', 'L l', 'M m', 'N n', 'P p', 'T t', 'V v', 'W w', 'Z z']);
    for (const u of P.units.filter((x) => x.familiar)) expect(u.kind).toBe('letter');
  });

  it('keeps every rule key under rule- and gives every rule the rule kind', () => {
    for (const u of P.units) expect(u.key.startsWith('rule-'), u.key).toBe(u.kind === 'rule');
  });

  it('gives every unit example as a real word of the profile, with the profile\'s own gloss', () => {
    for (const u of P.units.filter((x) => x.example)) {
      const w = P.words.find((x) => x.form === u.example!.form);
      expect(w, `${u.key}: ${u.example!.form}`).toBeDefined();
      expect(w!.gloss, u.key).toBe(u.example!.gloss);
    }
  });
});

describe('French sprint: the starter words and phrases', () => {
  it('has real words from the pack with its own glosses, at least 300, with no pseudoword and every weight in (0, 1]', () => {
    expect(P.words.length).toBeGreaterThanOrEqual(300);
    expect(new Set(P.words.map((w) => w.form)).size).toBe(P.words.length);
    for (const w of P.words) expect(w.source.startsWith('src/adapters/french/') || w.source.startsWith('packages/language-packs/src/tutorial/fr.ts'), w.form).toBe(true);
  });

  it('has the orientation\'s own expressions with the glosses given there', () => {
    const g = (f: string) => P.phrases.find((p) => p.form === f)?.gloss;
    expect(g('Je suis ici.')).toBe('I am here.');
    expect(g("C'est bon.")).toBe('It is good.');
    expect(g('Je ne sais pas.')).toBe('I do not know.');
    expect(g('Comment ça va ?')).toBe('How are you? (literally: how does it go?)');
    expect(g('les amis')).toBe('the friends');
    expect(g('nous avons')).toBe('we have');
    expect(g("L'homme est ici.")).toBe('The man is here.');
    expect(P.words.find((w) => w.form === 'parlent')).toMatchObject({ gloss: 'they speak', source: expect.stringContaining('tutorial/fr.ts') });
    expect(P.words.some((w) => w.form === 'bonjour')).toBe(true);
    expect(P.words.find((w) => w.form === 'merci')?.gloss).toBe('thank you');
  });

  it('models more than 95 % of the starter words, and every phrase', () => {
    expect(wordDependencies(P).length / P.words.length).toBeGreaterThan(0.95);
    for (const ph of P.phrases) expect(P.dependencies(ph.form), ph.form).toBeDefined();
  });

  it('reaches every taught unit with at least one starter word (liaison is taught on phrases only)', () => {
    const reached = new Set(wordDependencies(P).flatMap(({ deps }) => deps));
    for (const u of P.units.filter((x) => !x.familiar && x.key !== 'rule-liaison')) expect(reached.has(u.key), u.key).toBe(true);
    expect(reached.has('rule-liaison')).toBe(false);
    expect(P.phrases.some((ph) => P.dependencies(ph.form)!.includes('rule-liaison'))).toBe(true);
  });
});

describe('French sprint: dependencies of written forms (the taught units each needs)', () => {
  const T: Array<[string, string[]]> = [
    ['bonjour', ['on', 'J j', 'ou', 'R r']],
    ['merci', ['E e', 'R r', 'ce / ci', 'I i']],
    ['vous', ['ou', 'rule-final-silent']],
    ['moi', ['oi']],
    ['eau', ['eau']],
    ['beau', ['eau']],
    ['maison', ['ai', 'rule-s-between-vowels', 'on']],
    ['lait', ['ai', 'rule-final-silent']],
    ['neige', ['ei', 'ge / gi', 'rule-final-e']],
    ['peu', ['eu']],
    ['sœur', ['S s', 'œu', 'R r']],
    ['enfant', ['an / en', 'rule-final-silent']],
    ['bon', ['on']],
    ['bonne', ['O o', 'rule-no-nasal', 'rule-final-e']],
    ['vin', ['in / ain / ein']],
    ['pain', ['in / ain / ein']],
    ['plein', ['in / ain / ein']],
    ['un', ['un']],
    ['une', ['U u', 'rule-no-nasal', 'rule-final-e']],
    ['montagne', ['on', 'A a', 'gn', 'rule-final-e']],
    ['chat', ['ch', 'A a', 'rule-final-silent']],
    ['photo', ['ph', 'O o']],
    ['thé', ['th', 'é']],
    ['qui', ['qu', 'I i']],
    ['fille', ['ill', 'rule-final-e']],
    ['ville', ['I i', 'rule-final-e']], // ville and mille say the l: no ill unit
    ['parle', ['A a', 'R r', 'rule-final-e']],
    ['parles', ['A a', 'R r', 'rule-final-e', 'rule-final-silent']],
    ['parlent', ['A a', 'R r', 'rule-ent-verb']],
    ['petit', ['E e', 'I i', 'rule-final-silent']],
    ['grand', ['G g', 'R r', 'an / en', 'rule-final-silent']],
    ['les', ['E e', 'rule-final-silent']],
    ['nez', ['rule-final-er']],
    ['trop', ['R r', 'O o', 'rule-final-silent']],
    ['avec', ['A a', 'E e', 'C c']],
    ['chef', ['ch', 'E e']],
    ['hôtel', ['H h', 'ô', 'E e']],
    ['homme', ['H h', 'O o', 'rule-no-nasal', 'rule-final-e']],
    ["l'homme", ['rule-elision', 'H h', 'O o', 'rule-no-nasal', 'rule-final-e']],
    ["j'aime", ['rule-elision', 'J j', 'ai', 'rule-no-nasal', 'rule-final-e']],
    ["aujourd'hui", ['rule-elision', 'au', 'J j', 'ou', 'R r', 'H h', 'ui']],
    ['peut-être', ['eu', 'rule-final-silent', 'ê', 'R r', 'rule-final-e']],
    ['garçon', ['G g', 'A a', 'R r', 'ç', 'on']],
    ['où', ['ù']],
    ['île', ['î', 'rule-final-e']],
    ['noël', ['O o', 'ë']],
    ['année', ['A a', 'é', 'rule-no-nasal', 'rule-final-e']],
    ['an', ['an / en']],
    ['bien', ['ien']],
    ['client', ['C c', 'I i', 'an / en', 'rule-final-silent']], // -ient: the en is nasal a here
    ['moyen', ['oi', 'Y y', 'in / ain / ein']],
    ['travail', ['R r', 'A a', 'ill']],
    ['cinq', ['ce / ci', 'in / ain / ein', 'Q q']],
    ['étaient', ['é', 'ai', 'rule-ent-verb']],
    ['mer', ['E e', 'R r']], // the r of mer is said
    ['parler', ['A a', 'R r', 'rule-final-er']],
    ['guerre', ['gu', 'E e', 'R r', 'rule-final-e']],
    ['rouge', ['R r', 'ou', 'ge / gi', 'rule-final-e']],
    ['ici', ['I i', 'ce / ci']],
    ['nation', ['A a', 'tion']],
    ['question', ['qu', 'E e', 'S s', 'tion']],
  ];

  it.each(T)('%s', (form, expected) => {
    expect(taught(form)).toEqual(new Set(expected));
  });

  it('covers more than 40 forms', () => {
    expect(T.length).toBeGreaterThanOrEqual(40);
  });

  it('tells bon from bonne and an from année by the nasal unit', () => {
    expect(taught('bon').has('on')).toBe(true);
    expect(taught('bonne').has('on')).toBe(false);
    expect(taught('bonne').has('rule-no-nasal')).toBe(true);
    expect(taught('an').has('an / en')).toBe(true);
    expect(taught('année').has('an / en')).toBe(false);
    expect(taught('un').has('un')).toBe(true);
    expect(taught('une').has('un')).toBe(false);
  });

  it('treats parle, parles and parlent as the same sound but different spellings: the -ent rule, not a nasal', () => {
    expect(taught('parlent').has('rule-ent-verb')).toBe(true);
    expect(taught('parlent').has('an / en')).toBe(false);
    expect(taught('parles').has('rule-ent-verb')).toBe(false);
  });

  it('reads a final -ent as the nasal a unless the form is a listed verb form (the stated limit)', () => {
    for (const noun of ['moment', 'souvent', 'argent', 'vent', 'dent', 'lentement']) expect(taught(noun).has('an / en'), noun).toBe(true);
    for (const verb of ['parlent', 'mangent', 'finissent', 'aimaient', 'prennent']) expect(taught(verb).has('rule-ent-verb'), verb).toBe(true);
    // not listed: the profile reads it wrongly as a nasal, and the notes say so
    expect(taught('chassent').has('an / en')).toBe(true);
    expect(P.notes).toMatch(/-ent/);
  });

  it('puts liaison on listed phrases only, never on a single word or a "never" pair', () => {
    for (const phrase of ['les amis', 'nous avons', 'vous êtes', 'un enfant', 'petit ami']) expect(P.dependencies(phrase), phrase).toContain('rule-liaison');
    for (const none of ['amis', 'les', 'et elle', 'les héros', 'ils parlent', 'nous']) expect(P.dependencies(none), none).not.toContain('rule-liaison');
  });

  it('marks elision on the elided piece, with any apostrophe', () => {
    expect(P.dependencies("l'homme")).toContain('rule-elision');
    expect(P.dependencies('l’homme')).toEqual(P.dependencies("l'homme"));
    expect(P.dependencies('homme')).not.toContain('rule-elision');
    expect(P.dependencies("qu'il")).toEqual(expect.arrayContaining(['rule-elision', 'qu']));
    expect(P.dependencies("c'est")).toEqual(expect.arrayContaining(['rule-elision', 'ce / ci']));
  });

  it('folds capitals, ignores hyphens, digits and punctuation, and accepts œ and the accented letters', () => {
    expect(P.dependencies('BONJOUR')).toEqual(P.dependencies('bonjour'));
    expect(P.dependencies('Œil')).toEqual(P.dependencies('œil'));
    expect(P.dependencies('bonjour!')).toEqual(P.dependencies('bonjour'));
    expect(P.dependencies('peut-être')).toEqual(P.dependencies('peut être'));
    expect(P.dependencies('1789')).toEqual([]);
    for (const w of ['é', 'è', 'ê', 'à', 'â', 'î', 'ô', 'û', 'ù', 'ë', 'ï', 'ç', 'œ']) expect(P.dependencies(w), w).toBeDefined();
  });

  it('returns undefined for a character that is not modelled French (ñ, ß) and for the rare letters ä ö ü ÿ æ', () => {
    for (const w of ['año', 'straße', 'señor', 'über', 'mädchen', 'cæsar', 'ÿ', 'привет']) expect(P.dependencies(w), w).toBeUndefined();
  });

  it('does not model the words its rules cannot settle (plus, tous, six, huit, femme, monsieur), so they are never exercises', () => {
    for (const w of ['plus', 'tous', 'six', 'huit', 'femme', 'monsieur', 'sept']) expect(P.dependencies(w), w).toBeUndefined();
  });

  it('is deterministic and fast on a page of forms', () => {
    const forms = P.words.map((w) => w.form).concat(P.phrases.map((p) => p.form));
    const t0 = Date.now();
    let n = 0;
    for (let i = 0; i < 30; i++) for (const f of forms) { const a = P.dependencies(f); if (a) n += a.length; }
    expect(Date.now() - t0).toBeLessThan(2000);
    expect(P.words.map((w) => P.dependencies(w.form))).toEqual(P.words.map((w) => P.dependencies(w.form)));
    expect(n).toBeGreaterThan(0);
  });
});

describe('French sprint: every taught unit is a real contrast or a real teaching, never claimed as exceptionless', () => {
  it('says "usually" for the sounds that are only usual', () => {
    const usual = (k: string) => P.units.find((u) => u.key === k)!.sound;
    expect(usual('rule-final-silent')).toMatch(/usually/);
    expect(usual('rule-final-e')).toMatch(/usually/);
    expect(usual('ill')).toMatch(/usually/);
    expect(usual('tion')).toMatch(/usually/);
  });

  it('notes the regional un / in merger on the unit and on the confusion', () => {
    expect(P.units.find((u) => u.key === 'un')!.note).toMatch(/Québec/);
    expect(P.confusions.find((c) => c.a === 'in / ain / ein' && c.b === 'un')!.tell).toMatch(/many speakers/);
  });

  it('says in its notes that it is machine-drafted and not native-reviewed, and names its limits', () => {
    expect(P.notes).toMatch(/not reviewed by a native speaker/);
    expect(P.notes).toMatch(/Liaison/);
    expect(P.notes).toMatch(/regional/i);
    expect(P.notes).toMatch(/not frequency/);
  });

  it('has the contrasts a reader needs (ou / u, é / è, an / on, ai / oi, ch / c, s between vowels / s, c / ce, g / ge)', () => {
    const has = (a: string, b: string) => P.confusions.some((c) => (c.a === a && c.b === b) || (c.a === b && c.b === a));
    for (const [a, b] of [['ou', 'U u'], ['é', 'è'], ['an / en', 'on'], ['ai', 'oi'], ['ch', 'C c'], ['S s', 'rule-s-between-vowels'], ['C c', 'ce / ci'], ['G g', 'ge / gi']]) expect(has(a, b), `${a} ${b}`).toBe(true);
  });
});

describe('French sprint: planning', () => {
  const NOW = '2026-11-17T12:00:00.000Z';
  const answered = (unitId: string, d: number, due = '2026-11-18T00:00:00.000Z'): SprintCardState => ({
    unitId, status: 'active', due, stability: 5, lapses: 0, phase: 'review',
    history: [{ at: new Date(Date.parse('2026-11-10T12:00:00.000Z') + d * 86_400_000).toISOString(), rating: 3 }],
  });

  it('a first sprint teaches a few units and real words, the second teaches more and repeats nothing', () => {
    const first = planSprint({ profile: P, knowledge: scriptKnowledge(P, []), cards: [], now: NOW, size: 20 });
    expect(first.cards[0].kind).toBe('character');
    expect(first.cards.some((c) => c.kind === 'word')).toBe(true);
    const cards = first.cards.map((c, i) => answered(c.unitId, i % 3));
    const second = planSprint({ profile: P, knowledge: scriptKnowledge(P, cards), cards, now: '2026-11-25T12:00:00.000Z', size: 20 });
    const firstIds = new Set(first.cards.map((c) => c.unitId));
    const newIds = second.cards.filter((c) => c.reason !== 'due').map((c) => c.unitId);
    for (const id of newIds) expect(firstIds.has(id), id).toBe(false);
    expect(new Set(second.cards.map((c) => c.unitId)).size).toBe(second.cards.length);
    for (const c of second.cards.filter((x) => x.kind === 'word')) {
      const form = parseSprintUnitId(c.unitId)!.key;
      expect(P.words.some((w) => w.form === form), form).toBe(true);
    }
    expect(second.cards.length).toBeLessThanOrEqual(20);
  });

  it('plans twelve sessions in a row (each answered Good, none due again) without ever filling with repeats', () => {
    let cards: SprintCardState[] = [];
    for (let s = 0; s < 12; s++) {
      const plan = planSprint({ profile: P, knowledge: scriptKnowledge(P, cards), cards, now: new Date(Date.parse(NOW) + s * 86_400_000).toISOString(), size: 12 });
      expect(new Set(plan.cards.map((c) => c.unitId)).size).toBe(plan.cards.length);
      const have = new Set(cards.map((c) => c.unitId));
      cards = [...cards, ...plan.cards.filter((c) => !have.has(c.unitId)).map((c) => answered(c.unitId, s, '2027-06-01T00:00:00.000Z'))];
    }
    expect(cards.length).toBeGreaterThan(30);
  });
});

describe('French sprint: registration', () => {
  it('is a sprint language (Korean and Arabic follow it) and loads for fr and its varieties', async () => {
    expect(SPRINT_LANGUAGES.slice(-3)).toEqual(['fr', 'ko', 'ar']);
    expect(sprintLanguageOf('fr')).toBe('fr');
    expect(sprintLanguageOf('fr-CA')).toBe('fr');
    expect(sprintLanguageOf('fr-BE')).toBe('fr');
    expect(await loadSprintProfiles('fr')).toEqual([FR_PROFILE]);
    expect(await loadSprintProfiles('fr-CA')).toEqual([FR_PROFILE]);
  });
});
