/**
 * One short passage per language, tokenised as the Ecclesia reader would hand them over, with a small lexicon each.
 *   Hebrew   Genesis 1:1 — MAM text; lemmas, parts of speech and glosses from the Biblia build's OSHB-derived data and lexicon
 *            (Strong's numbers 7225, 1254a, 430, 853, 8064, 776; glosses BDB / curated, public domain).
 *   Aramaic  Daniel 2:4b — the first Aramaic words of Daniel (from מַלְכָּא); OSHB Aramaic codes; BDB glosses.
 *   Latin    John 1:1–5 (Vulgate) — lemmas and PROIEL-style morphology as the Vetus build bundles them; the last token of verse 5
 *            (comprehenderunt) has no analysis in that build and is supplied by hand as `provisional`.
 *   Greek    John 1:1 — the first verse of ./greek-john (decoded MorphGNT), so the four languages can be exercised alike.
 * Hebrew surfaces keep their vowel points; cantillation is stripped by the identity module, so a token may be given with it.
 */
import type { EcclesiaForm, EcclesiaLexeme, EcclesiaLanguageProfile, EcclesiaToken, PassageTokens, UdPos } from '../../../packages/goreview-ecclesia/src/contract';
import { ARAMAIC, HEBREW, LATIN, GREEK } from '../../../packages/goreview-ecclesia/src/languages';
import { formId, lexemeId, normalizeWord } from '../../../packages/goreview-ecclesia/src/identity';
import { JOHN_1_1_18 } from './greek-john';

type Row = [surface: string, lemma: string, pos: UdPos, features?: Record<string, string>, glosses?: string[], status?: 'provisional'];

const tokens = (rows: Row[]): EcclesiaToken[] => rows.map(([surface, lemma, pos, features, , status], index) => ({ index, surface, lemma, pos, ...(features ? { features } : {}), ...(status ? { status } : {}) }));

export interface LanguageFixture { profile: EcclesiaLanguageProfile; passage: PassageTokens; lexemes: EcclesiaLexeme[]; forms: EcclesiaForm[]; attribution: string }

function fixture(profile: EcclesiaLanguageProfile, passage: PassageTokens, rows: Row[], attribution: string): LanguageFixture {
  const lexemes = new Map<string, EcclesiaLexeme>();
  const forms = new Map<string, EcclesiaForm>();
  for (const [surface, lemma, pos, features, glosses] of rows) {
    const lid = lexemeId(profile, lemma, pos);
    if (!lexemes.has(lid)) lexemes.set(lid, { lexemeId: lid, lemma, pos, glosses: glosses ?? [], attribution });
    else if (glosses?.length && !lexemes.get(lid)!.glosses.length) lexemes.get(lid)!.glosses = glosses;
    const fid = formId(profile, surface);
    if (!forms.has(fid)) forms.set(fid, { formId: fid, surface: normalizeWord(profile.id, surface), lexemeId: lid, ...(features ? { features } : {}) });
  }
  return { profile, passage, lexemes: [...lexemes.values()], forms: [...forms.values()], attribution };
}

// ───────────────────────────── Hebrew: Genesis 1:1 ─────────────────────────────
const GEN_1_1_ROWS: Row[] = [
  ['בְּרֵאשִׁ֖ית', 'רֵאשִׁית', 'NOUN', { Gender: 'Fem', Number: 'Sing', State: 'Abs', Prefix: 'ב' }, ['beginning', 'chief', 'first']],
  ['בָּרָ֣א', 'בָּרָא', 'VERB', { Stem: 'Qal', Tense: 'Perf', Person: '3', Gender: 'Masc', Number: 'Sing' }, ['create', 'shape', 'fashion']],
  ['אֱלֹהִ֑ים', 'אֱלֹהִים', 'NOUN', { Gender: 'Masc', Number: 'Plur', State: 'Abs' }, ['God', 'gods']],
  ['אֵ֥ת', 'אֵת', 'PART', undefined, ['object marker']],
  ['הַשָּׁמַ֖יִם', 'שָׁמַיִם', 'NOUN', { Gender: 'Masc', Number: 'Plur', State: 'Abs', Definite: 'Def' }, ['heavens', 'sky']],
  ['וְאֵ֥ת', 'אֵת', 'PART', { Prefix: 'ו' }],
  ['הָאָֽרֶץ', 'אֶרֶץ', 'NOUN', { Gender: 'Com', Number: 'Sing', State: 'Abs', Definite: 'Def' }, ['earth', 'land', 'ground']],
];
export const HEBREW_FIXTURE = fixture(HEBREW,
  { language: 'he', ref: { book: 'GEN', chapter: 1, verse: 1 }, verses: [{ verse: 1, tokens: tokens(GEN_1_1_ROWS) }] },
  GEN_1_1_ROWS, 'Brown–Driver–Briggs (public domain) / Biblia curated glosses');

// ───────────────────────────── Aramaic: Daniel 2:4b ─────────────────────────────
const DAN_2_4_ROWS: Row[] = [
  ['מַלְכָּא֙', 'מֶלֶךְ', 'NOUN', { Gender: 'Masc', Number: 'Sing', State: 'Det' }, ['king']],
  ['לְעָלְמִ֣ין', 'עָלַם', 'NOUN', { Gender: 'Masc', Number: 'Plur', State: 'Abs', Prefix: 'ל' }, ['perpetuity', 'antiquity', 'for ever']],
  ['חֱיִ֔י', 'חֲיָא', 'VERB', { Stem: 'Peal', Mood: 'Imp', Person: '2', Gender: 'Masc', Number: 'Sing' }, ['live', 'let live']],
  ['אֱמַ֥ר', 'אֲמַר', 'VERB', { Stem: 'Peal', Mood: 'Imp', Person: '2', Gender: 'Masc', Number: 'Sing' }, ['say', 'tell', 'command']],
  ['חֶלְמָ֛א', 'חֵלֶם', 'NOUN', { Gender: 'Masc', Number: 'Sing', State: 'Det' }, ['dream']],
  ['לְעַבְדָ֖ךְ', 'עֲבַד', 'NOUN', { Gender: 'Masc', Number: 'Sing', State: 'Cons', Prefix: 'ל', Suffix: '2ms' }, ['servant', 'slave']],
  ['וּפִשְׁרָ֥א', 'פְּשַׁר', 'NOUN', { Gender: 'Masc', Number: 'Sing', State: 'Det', Prefix: 'ו' }, ['interpretation']],
  ['נְחַוֵּֽא׃', 'חֲוָא', 'VERB', { Stem: 'Pael', Tense: 'Impf', Person: '1', Number: 'Plur' }, ['declare', 'show']],
];
export const ARAMAIC_FIXTURE = fixture(ARAMAIC,
  { language: 'arc', ref: { book: 'DAN', chapter: 2, verse: 4 }, verses: [{ verse: 4, tokens: tokens(DAN_2_4_ROWS) }] },
  DAN_2_4_ROWS, 'Brown–Driver–Briggs, Aramaic section (public domain)');

// ───────────────────────────── Latin: John 1:1–5 (Vulgate) ─────────────────────────────
const V = (person: string, number: string, tense: string, mood: string, voice: string): Record<string, string> => ({ Person: person, Number: number, Tense: tense, Mood: mood, Voice: voice, VerbForm: 'Fin' });
const N = (number: string, gender: string, kase: string): Record<string, string> => ({ Number: number, Gender: gender, Case: kase });
const ERAT = V('3', 'Sing', 'Impf', 'Ind', 'Act');
const LA_ROWS_BY_VERSE: Record<number, Row[]> = {
  1: [
    ['In', 'in', 'ADP', undefined, ['in', 'into']], ['principio', 'principium', 'NOUN', N('Sing', 'Neut', 'Abl'), ['beginning']], ['erat', 'sum', 'VERB', ERAT, ['be']],
    ['Verbum,', 'verbum', 'NOUN', N('Sing', 'Neut', 'Nom'), ['word']], ['et', 'et', 'CCONJ', undefined, ['and']], ['Verbum', 'verbum', 'NOUN', N('Sing', 'Neut', 'Nom')], ['erat', 'sum', 'VERB', ERAT],
    ['apud', 'apud', 'ADP', undefined, ['with', 'at']], ['Deum,', 'deus', 'NOUN', N('Sing', 'Masc', 'Acc'), ['God', 'god']], ['et', 'et', 'CCONJ'], ['Deus', 'deus', 'NOUN', N('Sing', 'Masc', 'Nom')],
    ['erat', 'sum', 'VERB', ERAT], ['Verbum.', 'verbum', 'NOUN', N('Sing', 'Neut', 'Nom')],
  ],
  2: [
    ['Hoc', 'hic', 'PRON', { ...N('Sing', 'Neut', 'Nom'), PronType: 'Dem' }, ['this']], ['erat', 'sum', 'VERB', ERAT], ['in', 'in', 'ADP'], ['principio', 'principium', 'NOUN', N('Sing', 'Neut', 'Abl')],
    ['apud', 'apud', 'ADP'], ['Deum.', 'deus', 'NOUN', N('Sing', 'Masc', 'Acc')],
  ],
  3: [
    ['Omnia', 'omnis', 'PRON', { ...N('Plur', 'Neut', 'Nom'), PronType: 'Ind' }, ['all', 'every']], ['per', 'per', 'ADP', undefined, ['through']], ['ipsum', 'ipse', 'PRON', { ...N('Sing', 'Masc', 'Acc'), PronType: 'Prs' }, ['himself', 'itself']],
    ['facta', 'facio', 'VERB', { ...N('Plur', 'Neut', 'Nom'), Tense: 'Perf', Voice: 'Pass', VerbForm: 'Part' }, ['make', 'do']], ['sunt', 'sum', 'VERB', V('3', 'Plur', 'Pres', 'Ind', 'Act')], ['et', 'et', 'CCONJ'],
    ['sine', 'sine', 'ADP', undefined, ['without']], ['ipso', 'ipse', 'PRON', { ...N('Sing', 'Masc', 'Abl'), PronType: 'Prs' }], ['factum', 'facio', 'VERB', { ...N('Sing', 'Neut', 'Nom'), Tense: 'Perf', Voice: 'Pass', VerbForm: 'Part' }],
    ['est', 'sum', 'VERB', V('3', 'Sing', 'Pres', 'Ind', 'Act')], ['nihil,', 'nihil', 'PRON', { ...N('Sing', 'Neut', 'Nom'), PronType: 'Neg' }, ['nothing']], ['quod', 'qui', 'PRON', { ...N('Sing', 'Neut', 'Nom'), PronType: 'Rel' }, ['who', 'which']],
    ['factum', 'facio', 'VERB', { ...N('Sing', 'Neut', 'Nom'), Tense: 'Perf', Voice: 'Pass', VerbForm: 'Part' }], ['est.', 'sum', 'VERB', V('3', 'Sing', 'Pres', 'Ind', 'Act')],
  ],
  4: [
    ['In', 'in', 'ADP'], ['ipso', 'ipse', 'PRON', { ...N('Sing', 'Masc', 'Abl'), PronType: 'Prs' }], ['vita', 'vita', 'NOUN', N('Sing', 'Fem', 'Nom'), ['life']], ['erat,', 'sum', 'VERB', ERAT], ['et', 'et', 'CCONJ'],
    ['vita', 'vita', 'NOUN', N('Sing', 'Fem', 'Nom')], ['erat', 'sum', 'VERB', ERAT], ['lux', 'lux', 'NOUN', N('Sing', 'Fem', 'Nom'), ['light']], ['hominum', 'homo', 'NOUN', N('Plur', 'Masc', 'Gen'), ['man', 'human being']],
  ],
  5: [
    ['et', 'et', 'CCONJ'], ['lux', 'lux', 'NOUN', N('Sing', 'Fem', 'Nom')], ['in', 'in', 'ADP'], ['tenebris', 'tenebrae', 'NOUN', N('Plur', 'Fem', 'Abl'), ['darkness']], ['lucet,', 'luceo', 'VERB', V('3', 'Sing', 'Pres', 'Ind', 'Act'), ['shine']],
    ['et', 'et', 'CCONJ'], ['tenebræ', 'tenebrae', 'NOUN', N('Plur', 'Fem', 'Nom')], ['eam', 'is', 'PRON', { ...N('Sing', 'Fem', 'Acc'), PronType: 'Prs' }, ['he', 'she', 'it']], ['non', 'non', 'ADV', undefined, ['not']],
    ['comprehenderunt.', 'comprehendo', 'VERB', V('3', 'Plur', 'Perf', 'Ind', 'Act'), ['grasp', 'comprehend'], 'provisional'],
  ],
};
const LA_ROWS: Row[] = Object.values(LA_ROWS_BY_VERSE).flat();
export const LATIN_FIXTURE = fixture(LATIN,
  { language: 'la', ref: { book: 'JHN', chapter: 1, verse: 1, verseEnd: 5 }, verses: Object.entries(LA_ROWS_BY_VERSE).map(([v, rows]) => ({ verse: Number(v), tokens: tokens(rows) })) },
  LA_ROWS, 'glosses hand-authored for the fixture');

// ───────────────────────────── Greek: John 1:1 ─────────────────────────────
const JOHN_1_1_GLOSSES: Record<string, string[]> = { ἐν: ['in', 'on', 'among'], ἀρχή: ['beginning', 'ruler'], εἰμί: ['I am', 'exist'], ὁ: ['the'], λόγος: ['word', 'speech'], καί: ['and', 'even', 'also'], πρός: ['to', 'towards', 'with'], θεός: ['God', 'a god'] };
const GREEK_ROWS: Row[] = JOHN_1_1_18.verses[0]!.tokens.map((t) => [t.surface, t.lemma, t.pos, t.features, JOHN_1_1_GLOSSES[t.lemma]] as Row);
export const GREEK_FIXTURE = fixture(GREEK,
  { language: 'grc', ref: { book: 'JHN', chapter: 1, verse: 1 }, verses: [{ verse: 1, tokens: JOHN_1_1_18.verses[0]!.tokens }] },
  GREEK_ROWS, 'Dodson Greek Lexicon (public domain)');

export const FIXTURES: LanguageFixture[] = [HEBREW_FIXTURE, ARAMAIC_FIXTURE, GREEK_FIXTURE, LATIN_FIXTURE];
