// @vitest-environment node
/**
 * The Korean pack manifest, its grammar copy, its orientation and its validation cases (docs/korean/PLAN.md, brief III, VII-XI, XIV, XVI, XXI).
 * What can be derived is checked against the Korean adapter's own modules; what the analyser emits (PLAN's lists, copied below) must each have
 * copy. Cases that need the real analyser run only when it is more than the placeholder.
 */
import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { KAIKKI_ATTRIBUTION, LEVEL_LABEL, MIN_VALIDATION_CASES, levelOf, readSelection, runCase, validateManifest, validationOf } from '../../packages/language-packs/src';
import { KO_DICTIONARY, KO_VALIDATION, KO_VERSION, koreanManifest } from '../../packages/language-packs/src/packs/ko';
import { KO_GRAMMAR_CONSTRUCTIONS, KO_GRAMMAR_FEATURES } from '../../packages/language-packs/src/packs/ko-grammar';
import { KO_TUTORIAL, KO_TUTORIAL_STEPS } from '../../packages/language-packs/src/tutorial/ko';
import { KO_ANALYZER_VERSION } from '../../src/adapters/korean/version';
import { fromJamo, toJamo } from '../../src/adapters/korean/hangul';
import { koStandardPronunciation } from '../../src/adapters/korean/pronunciation';
import { koAdapter } from '../../src/adapters/ko';
import { ENDINGS } from '../../src/adapters/korean/endings';
import { FUSED, PARTICLES } from '../../src/adapters/korean/particles';
import { installKoreanLexicon } from '../../src/adapters/korean/index-store';
import { KO_CORE } from '../../src/adapters/korean/generated/core';

const ko = koreanManifest();

/**
 * Copied from docs/korean/PLAN.md, "Features" and "Constructions" (2026-11-25): every feature key and value the analyser writes into
 * `candidate.morph`, and every construction id of `detectPatterns`. When PLAN gains a key, add it here and write its copy.
 * `Particle`'s and `Focus`'s values are open ("the family ids of every particle in the chain"; "Also|Only|Even|Each|…"): the copy holds the
 * values PLAN names.
 */
const PLAN_FEATURES: Record<string, string[]> = {
  // from the morphology package's hand-back, 2026-11-25 (the engine's final vocabulary); Particle's values are the family ids of PARTICLES, checked separately below
  VerbForm: ['Fin', 'Conn', 'Adn', 'Nmlz'],
  Tense: ['Past', 'Pres'],
  Aspect: ['Pqp', 'Prosp'],
  Mood: ['Ind', 'Int', 'Imp', 'Prop', 'Excl'],
  Modality: ['Presumptive', 'Retrospective', 'Necessitative'],
  Honorific: ['Subj'],
  SpeechLevel: ['Hae', 'Haeyo', 'Hasipsio', 'Haera', 'Hage', 'Hao', 'Lit'],
  Register: ['Lit'],
  Quote: ['Ind'],
  Connective: ['and', 'and-while', 'while', 'but', 'so', 'since', 'because', 'if', 'intend', 'purpose', 'even-if', 'only-if', 'background', 'then', 'as-soon-as', 'so-that', 'adverbial', 'as-if', 'or', 'whether', 'because-busy', 'the-more', 'and-then', 'neg', 'inf', 'after', 'saying', 'although', 'as-i', 'not-but', 'besides', 'habit', 'as-you-know'],
  VerbType: ['Descriptive', 'Cop', 'Exist'],
  Polarity: ['Pos', 'Neg'],
  Voice: ['Pass', 'Caus'],
  Irregular: ['D', 'B', 'S', 'H', 'Reu', 'Reo', 'U', 'Ha', 'L', 'Eu'],
  Contracted: ['Yes'],
  Fused: ['Yes'],
  NounType: ['Bound', 'Clf'],
  Number: ['Plur'],
  Case: ['Nom', 'Acc', 'Gen', 'Dat', 'Loc', 'Abl', 'Ins', 'Com', 'Cmp', 'Equ', 'Ess', 'Voc'],
  Topic: ['Yes'],
  Focus: ['Also', 'Only', 'From', 'UpTo', 'Each', 'Even', 'Except', 'Alt', 'Any', 'AtLeast', 'Emph', 'Accord', 'LetAlone'],
  Polite: ['Hon'],
  Complement: ['Yes'],
  Particle: [],
};
const PLAN_CONSTRUCTIONS = [
  'ko-progressive', 'ko-resultative', 'ko-want', 'ko-must', 'ko-can', 'ko-cannot', 'ko-neg-long', 'ko-neg-unable', 'ko-try', 'ko-completive', 'ko-benefactive',
  'ko-become', 'ko-decide', 'ko-experience', 'ko-seem', 'ko-because', 'ko-if', 'ko-but', 'ko-background', 'ko-intend', 'ko-neg-short', 'ko-neg-short-unable', 'ko-prohibit', 'ko-neg-copula', 'ko-exist',
  'ko-passive-jida', 'ko-passive-light', 'ko-causative-ge', 'ko-causative-light', 'ko-quote', 'ko-since', 'ko-while', 'ko-after', 'ko-before', 'ko-in-order',
];

/** The inputs of brief XXI that are one 어절: each must be the selected word of a validation case. */
const BRIEF_WORDS = ['학생은', '학생들이', '학교에서', '친구에게만', '먹었습니다', '읽으셨습니다', '들어요', '추워요', '몰라요', '하얘요', '돼요', '좋습니다', '공부했어요', '학생입니다'];

describe('the manifest', () => {
  it('is valid, experimental and unreviewed, and says so', () => {
    expect(validateManifest(ko)).toEqual([]);
    expect(ko.packId).toBe('pack:ko');
    expect(levelOf(ko)).toBe('experimental');
    expect(validationOf(ko)).toBe('experimental');
    expect(LEVEL_LABEL.experimental).toBe('experimental, unreviewed');
    expect(ko.rights.reviewStatus).toBe('machine-drafted');
    expect(ko.lexical.handLexicon.reviewStatus).toBe('machine-drafted');
    const text = ko.rights.provenance.join('\n');
    expect(text).toMatch(/Experimental, installable at a deliberately minimal level/);
    expect(text).toMatch(/Nothing in this pack has been reviewed by a native speaker/);
    expect(text).toMatch(/nothing has been reviewed by a native speaker, a Korean teacher or a linguist/);
  });

  it('registers Korean as the brief asks (III): names, script, direction, one standard variety, no other identity', () => {
    expect(ko.languageId).toBe('ko');
    expect(ko.identity).toEqual({ name: 'Korean', nativeName: '한국어', direction: 'ltr' });
    expect(ko.scriptId).toBe('Hang');
    expect(ko.varietyId).toBe('ko-KR');
    expect(ko.varieties).toHaveLength(1);
    expect(ko.varieties[0]).toMatchObject({ varietyId: 'ko-KR', analysed: true });
    expect(ko.varieties[0].label).toMatch(/Modern Standard Korean/);
    // later varieties are named as future varieties of this language, not implemented
    expect(ko.varieties[0].note).toMatch(/North Korean/);
    expect(ko.varieties[0].note).toMatch(/further varieties of this one language/);
    expect(`${ko.identity.name} · ${ko.identity.nativeName}`).toBe('Korean · 한국어');
  });

  it('names its analyser, its version and its sources honestly', () => {
    expect(KO_VERSION).toBe(KO_ANALYZER_VERSION);
    expect(ko.analyzer).toMatchObject({ id: `adapter-ko@${KO_ANALYZER_VERSION}`, version: KO_ANALYZER_VERSION });
    expect(ko.lexical.dictionary).toMatchObject({ id: KO_DICTIONARY.id, baseUrl: 'dict/ko/', entries: KO_DICTIONARY.entries, attribution: KAIKKI_ATTRIBUTION });
    const prov = ko.rights.provenance.join('\n');
    expect(prov).toMatch(/Wiktionary via kaikki\.org \(CC BY-SA 4\.0/);
    expect(prov).toMatch(/UD Korean-Kaist|Universal Dependencies Korean-Kaist/);
    expect(prov).toMatch(/Revised Romanization \(2000\)/);
    expect(prov).toMatch(/never an identity/);
    expect(ko.rights.licences.some((l) => /kaikki-ko/.test(l.resource) && /CC BY-SA 4\.0/.test(l.licence) && l.notice === KAIKKI_ATTRIBUTION)).toBe(true);
    expect(ko.pronunciation.recordings).toBe('none');
    expect(ko.pronunciation.notesAvailable).toBe(true);
    expect(ko.pronunciation.remoteVoice.requiresConsentAndKey).toBe(true);
  });

  it('is candid about what is thin', () => {
    const prov = ko.rights.provenance.join('\n');
    for (const needle of [/frequency list/, /44 %/, /numerals are thin/, /conjugation table/, /no audio of its own/, /No Bible text is bundled|no Bible text is bundled/, /homonyms are numbered/, /unconfirmed/]) expect(prov).toMatch(needle);
    expect(prov).toMatch(/Nothing in this pack has been reviewed by a native speaker/);
  });

  it('takes its tutorial from the orientation', () => {
    expect(ko.tutorial).toEqual({ ref: 'tutorial/ko', estimatedMinutes: KO_TUTORIAL.estimatedMinutes, skippable: true });
  });

  it('declares the shared kaikki dictionary at dict/ko/ and matches the one built, when it is built', () => {
    const built = path.resolve(__dirname, '../../public/dict/ko/manifest.json');
    if (!fs.existsSync(built)) return;   // the dictionary has not been built on this machine; the declared figure stands in (KO_DICTIONARY says how to update it)
    const m = JSON.parse(fs.readFileSync(built, 'utf8')) as { id: string; lang: string; entries: number; hasFrequency: boolean; attribution: string };
    expect({ id: m.id, entries: m.entries, frequency: m.hasFrequency }).toEqual(KO_DICTIONARY);
    expect(m.lang).toBe('ko');
    expect(m.attribution).toBe(KAIKKI_ATTRIBUTION);
  });
});

describe('the grammar copy covers everything the analyser writes (PLAN.md)', () => {
  const byKey = new Map(KO_GRAMMAR_FEATURES.map((f) => [f.key, f]));
  it('has an entry for every feature key and every value PLAN names', () => {
    const missing: string[] = [];
    for (const [key, values] of Object.entries(PLAN_FEATURES)) {
      const f = byKey.get(key);
      if (!f) { missing.push(key); continue; }
      for (const v of values) if (!f.values[v]) missing.push(`${key}=${v}`);
    }
    expect(missing).toEqual([]);
    expect(ko.grammar.features).toEqual(KO_GRAMMAR_FEATURES);
  });
  it('has copy for every morph key=value the engine’s own tables can emit (endings, particles, fused pronouns), plus the values analyze.ts and the lexicon produce', () => {
    const emitted = new Set<string>();
    const take = (m: Readonly<Record<string, string>> | undefined): void => { for (const [k, v] of Object.entries(m ?? {})) for (const x of String(v).split(',')) emitted.add(`${k}=${x}`); };
    for (const e of ENDINGS) take(e.morph);
    for (const p of Object.values(PARTICLES)) take(p.morph);
    for (const f of Object.values(FUSED)) take((f as { morph?: Record<string, string> }).morph);
    // produced in code, not in a table (analyze.ts, sentence.ts, the lexicon's own marks); listed by hand: when the code gains a value, add it here
    for (const x of ['VerbType=Descriptive', 'VerbType=Cop', 'VerbType=Exist', 'Voice=Pass', 'Voice=Caus', 'Contracted=Yes', 'Fused=Yes', 'NounType=Bound', 'NounType=Clf', 'Complement=Yes', 'Polarity=Neg', 'Polarity=Pos', 'Tense=Pres', 'Number=Plur', 'Quote=Ind', 'Register=Lit', ...PLAN_FEATURES.Irregular.map((v) => `Irregular=${v}`)]) emitted.add(x);
    const missing = [...emitted].filter((kv) => { const [k, v] = kv.split('='); return !byKey.get(k)?.values[v]; });
    expect(missing).toEqual([]);
    expect(emitted.size).toBeGreaterThan(90);
  });
  it('has a Particle value for every particle family id of PARTICLES, and none for a family that is gone', () => {
    const values = Object.keys(byKey.get('Particle')!.values).sort();
    expect(values).toEqual(Object.values(PARTICLES).map((p) => p.id).sort());
  });
  it('has no copy for a value the engine no longer emits (the tables and the hand list)', () => {
    const final = new Set(Object.entries(PLAN_FEATURES).flatMap(([k, vs]) => vs.map((v) => `${k}=${v}`)));
    const stale = KO_GRAMMAR_FEATURES.filter((f) => f.key !== 'Particle').flatMap((f) => Object.keys(f.values).map((v) => `${f.key}=${v}`)).filter((kv) => !final.has(kv));
    expect(stale).toEqual([]);
  });
  it('has an entry for every construction id PLAN lists, and none that PLAN does not', () => {
    const ids = KO_GRAMMAR_CONSTRUCTIONS.map((c) => c.id);
    expect(PLAN_CONSTRUCTIONS.filter((id) => !ids.includes(id))).toEqual([]);
    expect(ids.filter((id) => !PLAN_CONSTRUCTIONS.includes(id))).toEqual([]);
    expect(new Set(ids).size).toBe(ids.length);
    expect(ko.grammar.constructions).toEqual(KO_GRAMMAR_CONSTRUCTIONS);
  });
  it('gives each entry plain copy of one to a few sentences with a Korean example, in short form', () => {
    for (const f of KO_GRAMMAR_FEATURES) {
      expect(f.explain, f.key).toMatch(/[가-힣]/);
      expect(f.label.length, f.key).toBeGreaterThan(2);
      expect(f.explain.length, f.key).toBeLessThan(1100);
    }
    for (const c of KO_GRAMMAR_CONSTRUCTIONS) {
      expect(c.explain, c.id).toMatch(/[가-힣]/);
      expect(c.label, c.id).toMatch(/[가-힣]|[A-Za-z]/);
      expect(c.explain.length, c.id).toBeLessThan(420);
    }
  });

  it('keeps to the audit\'s rules: no gender, no person agreement, no singular for an unmarked noun, no future tense', () => {
    expect(byKey.has('Gender')).toBe(false);
    expect(byKey.has('Person')).toBe(false);
    expect(Object.keys(byKey.get('Number')!.values)).toEqual(['Plur']);
    expect(byKey.get('Register')!.explain).toMatch(/not something to imitate in speech/);
    expect(byKey.get('Number')!.explain).toMatch(/does not say it is singular/);
    expect(byKey.get('Number')!.explain).toMatch(/never calls it singular/);
    expect(Object.keys(byKey.get('Tense')!.values)).not.toContain('Fut');
    const all = [...KO_GRAMMAR_FEATURES.map((f) => f.explain), ...KO_GRAMMAR_CONSTRUCTIONS.map((c) => c.explain)].join('\n');
    expect(all).not.toMatch(/\b(he|she|it) form/i);
    expect(byKey.get('Modality')!.explain).toMatch(/-겠- is not a future tense/);
    expect(byKey.get('Aspect')!.explain).toMatch(/it is not a future tense/);
    expect(byKey.get('Aspect')!.values.Pqp).toMatch(/past of the past/);
    // every sentence that says "future" says it in order to deny it, or names the near-future reading of an unmarked form
    for (const m of all.matchAll(/[^.]*\bfuture\b[^.]*\./gi)) expect(m[0], m[0]).toMatch(/not a future|no future|near future/i);
  });

  it('explains the subject honorific and the speech level as two separate dimensions, with the six Korean level names and the literary endings', () => {
    const hon = byKey.get('Honorific')!.explain;
    expect(hon).toMatch(/SUBJECT/);
    expect(hon).toMatch(/not about the listener|about that person, not about the listener/);
    expect(hon).toMatch(/Speech level/);
    const lvl = byKey.get('SpeechLevel')!;
    for (const name of ['하십시오체', '해요체', '하오체', '하게체', '해라체', '해체']) expect(Object.values(lvl.values).join(' ') + lvl.explain).toContain(name);
    expect(lvl.explain).toMatch(/LISTENER/);
    for (const ending of ['-(으)니라', '-(이)라', '-(으)소서', '-(으)리로다', '-도다']) expect(lvl.explain).toContain(ending);
    expect(lvl.explain).toMatch(/literary/);
    expect(lvl.explain).toMatch(/Bible/);
  });

  it('states the descriptive verb, the adnominal rule and the particles as the audit has them', () => {
    expect(byKey.get('VerbType')!.explain).toMatch(/What English calls an adjective is a verb in Korean/);
    expect(byKey.get('VerbType')!.values.Descriptive).toMatch(/descriptive verb/);
    expect(byKey.get('VerbForm')!.explain).toMatch(/descriptive verb takes -\(으\)ㄴ/);
    expect(byKey.get('VerbForm')!.explain).toMatch(/action verb -는 for the present and -\(으\)ㄴ for the past/);
    expect(byKey.get('Topic')!.explain).toMatch(/not the subject marker/);
    expect(byKey.get('Case')!.values.Nom).toMatch(/subject or complement/);
    expect(byKey.get('Complement')!.explain).toMatch(/학생이 아니에요/);
    expect(KO_GRAMMAR_CONSTRUCTIONS.find((c) => c.id === 'ko-try')!.explain).toMatch(/When 보다 is the main verb it still means “to see”/);
  });

  it('describes each irregular class with what changes and before what, states that the class belongs to the word, and the regular look-alikes', () => {
    const irr = byKey.get('Irregular')!;
    for (const needle of ['듣다 → 들어요', '춥다 → 추워요', '짓다 → 지어요', '하얗다 → 하얘요', '모르다 → 몰라요', '이르다 “to reach” → 이르러', '푸다 → 퍼요', '쓰다 → 써요', '살다 → 삽니다', '하다 → 해요']) expect(irr.explain, needle).toContain(needle);
    expect(irr.explain).toMatch(/CLASS BELONGS TO THE WORD, not to its spelling/);
    expect(irr.explain).toMatch(/묻다 “to ask” is ㄷ-irregular \(물어요\) but 묻다 “to bury” is regular \(묻어요; /);
    expect(irr.explain).toMatch(/rule a word out but does not always name one/);
    for (const regular of ['닫아요', '잡아요', '웃어요', '좋아요']) expect(irr.explain).toContain(regular);
    expect(Object.keys(irr.values)).toHaveLength(10);
  });

  it('gives examples that agree with the Hangul arithmetic where it can say so', () => {
    // contractions: the vowel of the stem and the ending fuse into the compound vowel of the spelling
    expect(fromJamo(['ㅂ', 'ㅗ', 'ㅏ'])).toBe('봐');
    expect(fromJamo(['ㅈ', 'ㅜ', 'ㅓ'])).toBe('줘');
    const c = byKey.get('Contracted')!.explain;
    for (const [full, short] of [['보아요', '봐요'], ['주어요', '줘요'], ['되어요', '돼요'], ['하여요', '해요'], ['마시어요', '마셔요']]) expect(c).toContain(`${full} → ${short}`);
    // 갔 is 가 + 았: the block holds the stem's vowel and the past marker's final consonant
    expect(toJamo('갔')).toEqual(['ㄱ', 'ㅏ', 'ㅆ']);
    expect(toJamo('가').concat(toJamo('아')).slice(0, 2)).toEqual(['ㄱ', 'ㅏ']);
  });
});

describe('the validation cases', () => {
  it('are enough, valid, and name their words in their sentences', () => {
    expect(KO_VALIDATION.length).toBeGreaterThanOrEqual(MIN_VALIDATION_CASES);
    expect(new Set(KO_VALIDATION.map((c) => c.id)).size).toBe(KO_VALIDATION.length);
    for (const c of KO_VALIDATION) expect(c.sentence!.includes(c.surface), c.id).toBe(true);
    expect(ko.validation).toEqual(KO_VALIDATION);
  });
  it('include every one-word input of the brief\'s regression table (XXI)', () => {
    for (const w of BRIEF_WORDS) expect(KO_VALIDATION.some((c) => c.surface === w), w).toBe(true);
  });
  it('lead with the brief\'s own sentence and are ordinary Korean the Hangul layer reads as Hangul', () => {
    expect(KO_VALIDATION[0].sentence).toBe('학생들이 학교에서 공부했습니다.');
    for (const c of KO_VALIDATION) expect([...c.sentence!].some((ch) => ch >= '가' && ch <= '힣')).toBe(true);
  });
  // the cases run against the real analyser only once it is more than the placeholder (its lemmatisation is 'none' until package S lands)
  const real = koAdapter.support.lemmatization !== 'none';
  it.skipIf(!real)('read as stated by adapter-ko', () => {
    installKoreanLexicon(KO_CORE);
    const failed = KO_VALIDATION.map((c) => runCase(koAdapter, c)).filter((r) => !r.pass).map((r) => `${r.id}: ${r.got}`);
    expect(failed).toEqual([]);
  });
});

describe('the orientation', () => {
  it('is a minimal machine-drafted orientation of the pack, skippable, that claims no review', () => {
    expect(KO_TUTORIAL).toMatchObject({ ref: 'tutorial/ko', languageId: 'ko', authorship: 'machine-drafted', reviewed: false, reviewNeeded: 'native speaker', skippable: true });
    expect(KO_TUTORIAL.notice).toMatch(/has not been checked by a native speaker of Korean/);
    expect(KO_TUTORIAL.estimatedMinutes).toBe(KO_TUTORIAL.steps.reduce((n, s) => n + s.estimatedMinutes, 0));
    expect(KO_TUTORIAL_STEPS).toBe(KO_TUTORIAL.steps);
    const ids = KO_TUTORIAL.steps.map((s) => s.id);
    expect(new Set(ids).size).toBe(ids.length);
    for (const id of ['select-a-word', 'what-the-card-shows', 'practice-lookup', 'script-hangul', 'word-order', 'particles', 'verb-endings', 'speech-levels', 'word-in-parts', 'homonyms', 'unconfirmed', 'honesty-experimental']) expect(ids, id).toContain(id);
  });
  it('practises a word of the pack\'s own first validation sentence', () => {
    const step = KO_TUTORIAL.steps.find((s) => s.kind === 'practice')!;
    expect(step.practice!.sentence).toBe(KO_VALIDATION[0].sentence);
    expect(step.practice!.sentence.includes(step.practice!.target)).toBe(true);
    expect(KO_VALIDATION.some((c) => c.surface === step.practice!.target)).toBe(true);
  });
  it('says nothing about sounds the rules do not give, and its sound claims are the adapter\'s', () => {
    expect(koStandardPronunciation('한국어')).toBe('한구거');
    expect(koStandardPronunciation('학교')).toBe('학꾜');
    const own = KO_TUTORIAL.steps.map((s) => s.body + ' ' + (s.examples ?? []).map((e) => e.note ?? '').join(' ')).join('\n');
    expect(own).toContain('said eumak');
    expect(koStandardPronunciation('음악')).toBe('으막');
    expect(own).toContain('said [학꾜]');
    expect(own).not.toMatch(/\bhe\/she\b|\bgrammatical gender of\b/);
    const sound = KO_TUTORIAL.steps.find((s) => s.id === 'sound-and-audio')!;
    expect(sound.body).toMatch(/This pack has no recordings of its own/);
    expect(sound.body).toMatch(/\[한구거\]/);
  });
  // like the other orientations: every practice target and example is read by the real analyser, confidently and not as a guess (once it is the real one)
  it.skipIf(koAdapter.support.lemmatization === 'none')('has every example and the practice word read by adapter-ko, none a guess', () => {
    installKoreanLexicon(KO_CORE);
    const p = KO_TUTORIAL.steps.find((s) => s.practice)!.practice!;
    const r0 = readSelection(koAdapter, p.target, p.sentence);
    expect(r0.top?.unconfirmed).not.toBe(true);
    let checked = 0;
    for (const s of KO_TUTORIAL.steps) for (const e of s.examples ?? []) {
      const sentence = /\s/u.test(e.surface.trim()) && s.kind === 'patterns';
      const words = sentence ? koAdapter.analyze(koAdapter.tokenize(e.surface)).filter((x) => x.token.isWord).map((x) => x.candidates[0]) : [readSelection(koAdapter, e.surface).top];
      for (const c of words) { expect(c, `${s.id}: ${e.surface}`).toBeDefined(); expect(c!.unconfirmed, `${s.id}: ${e.surface}`).not.toBe(true); expect(c!.confidence, `${s.id}: ${e.surface}`).toBeGreaterThanOrEqual(0.5); }
      checked++;
    }
    expect(checked).toBeGreaterThanOrEqual(12);
  });
  it('explains the homonym number and "unconfirmed" in the learner\'s words', () => {
    const hom = KO_TUTORIAL.steps.find((s) => s.id === 'homonyms')!;
    expect(hom.body).toMatch(/“entry 2”/);
    expect(hom.body).not.toMatch(/눈¹|눈²/);
    expect(hom.body).toMatch(/which word, not how common it is/);
    expect(hom.body).toMatch(/시간 is “time”/);
    expect(hom.body).toMatch(/could not tell which/);
    expect(hom.body).toMatch(/can rule entries out/);
    expect(hom.body).not.toMatch(/decides which/);
    const unc = KO_TUTORIAL.steps.find((s) => s.id === 'unconfirmed')!;
    expect(unc.body).toMatch(/not counted as a word you know/);
    const speech = KO_TUTORIAL.steps.find((s) => s.id === 'speech-levels')!;
    expect(speech.body).toMatch(/SUBJECT/);
    for (const n of ['하십시오체', '해요체', '해체', '해라체', '하오체', '하게체']) expect(speech.body).toContain(n);
  });
});
