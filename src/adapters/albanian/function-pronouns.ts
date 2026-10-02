/**
 * Pronouns of Standard Albanian as lexemes: personal (with their short object forms), demonstrative, possessive,
 * interrogative / relative, indefinite. Package Q3. Machine-drafted, not checked by a native speaker.
 *
 * Decisions (see also the report of package Q3):
 *  - The third person is ONE personal lexeme, lemma "ai" (ai, ajo, atë, atij, asaj, tij, saj, ata, ato, atyre, tyre,
 *    and the short forms e, i, u). The demonstrative "that" is a second lexeme with the same lemma but part of speech DET:
 *    a form like "ajo" therefore has two readings, personal pronoun first.
 *  - The short object pronouns are forms of the personal lexemes, marked `Clitic: Yes` (më of unë, të of ti, e / i / u of
 *    ai, na of ne, ju of ju).
 *  - Genitive and dative share their forms; the personal forms atij / asaj / atyre are 'Gen,Dat', and the ablative of the
 *    personal pronoun is its own form (tij, saj, tyre; meje, teje; nesh, jush). The ablative of a demonstrative is the
 *    same as its dative (këtij, atij).
 *  - A possessive is one lexeme per owner (im, yt, ynë, juaj, tij, saj, tyre); its forms agree with the thing owned.
 */
import type { SqLexeme } from './types';
import { F } from './function-build';

const POSS_ROLE = 'possessive: agrees in gender, number and case with the thing owned, not with the owner';

export const POSSESSIVES: SqLexeme[] = [
  F('im', 'DET', 'my, mine', [
    'im: m sg nom poss', 'ime: f sg nom poss', 'tim: m sg acc gen dat abl poss', 'time: f sg acc gen dat abl poss',
    'mi: m pl poss', 'mia: f pl poss',
    'imi: m sg nom def poss', 'imja: f sg nom def poss', 'mitë: m pl def poss', 'miat: f pl def poss',
  ], { role: POSS_ROLE }),
  F('yt', 'DET', 'your, yours (singular owner)', [
    'yt: m sg nom poss', 'jote: f sg nom poss', 'tënd: m sg acc gen dat abl poss', 'tënde: f sg acc gen dat abl poss',
    'tu: m pl poss', 'tua: f pl poss',
    'yti: m sg nom def poss', 'jotja: f sg nom def poss', 'tutë: m pl def poss', 'tuat: f pl def poss',
  ], { role: POSS_ROLE }),
  F('ynë', 'DET', 'our, ours', [
    'ynë: m sg nom poss', 'jonë: f sg nom poss', 'tonë: sg acc gen dat abl poss', 'tanë: m pl poss', 'tona: f pl poss',
    'yni: m sg nom def poss', 'jona: f sg nom def poss', 'tanët: m pl def poss', 'tonat: f pl def poss',
  ], { role: POSS_ROLE }),
  F('juaj', 'DET', 'your, yours (plural or polite owner)', [
    'juaj: sg nom poss', 'tuaj: sg acc gen dat abl poss', 'tuaj: m pl poss', 'tuaja: f pl poss',
    'juaji: m sg nom def poss', 'juaja: f sg nom def poss', 'tuajt: m pl def poss', 'tuajat: f pl def poss',
  ], { role: POSS_ROLE }),
  F('tij', 'DET', 'his', ['tij: poss'], { articulated: true, role: `${POSS_ROLE}; written after a linking article (i tij, e tij)` }),
  F('saj', 'DET', 'her, hers', ['saj: poss'], { articulated: true, role: `${POSS_ROLE}; written after a linking article (i saj, e saj)` }),
  F('tyre', 'DET', 'their, theirs', ['tyre: poss'], { articulated: true, role: `${POSS_ROLE}; written after a linking article (i tyre, e tyre)` }),
];

export const PERSONAL: SqLexeme[] = [
  F('unë', 'PRON', 'I, me', ['unë: 1 sg nom prs', 'mua: 1 sg acc dat prs', 'meje: 1 sg abl prs', 'më: 1 sg acc dat prs clitic']),
  F('ti', 'PRON', 'you (singular)', ['ti: 2 sg nom prs', 'ty: 2 sg acc dat prs', 'teje: 2 sg abl prs', 'të: 2 sg acc dat prs clitic']),
  F('ai', 'PRON', 'he, she, it, they; him, her, them', [
    'ai: 3 sg m nom prs', 'ajo: 3 sg f nom prs', 'atë: 3 sg m f acc prs',
    'atij: 3 sg m gen dat prs', 'asaj: 3 sg f gen dat prs', 'tij: 3 sg m abl prs', 'saj: 3 sg f abl prs',
    'ata: 3 pl m nom acc prs', 'ato: 3 pl f nom acc prs', 'atyre: 3 pl gen dat prs', 'tyre: 3 pl abl prs',
    'e: 3 sg acc prs clitic', 'i: 3 sg dat prs clitic', 'i: 3 pl acc prs clitic', 'u: 3 pl dat prs clitic',
  ]),
  F('ne', 'PRON', 'we, us', ['ne: 1 pl nom acc prs', 'neve: 1 pl acc dat prs', 'nesh: 1 pl abl prs', 'na: 1 pl acc dat prs clitic']),
  F('ju', 'PRON', 'you (plural, or polite singular)', ['ju: 2 pl nom acc prs', 'juve: 2 pl acc dat prs', 'jush: 2 pl abl prs', 'ju: 2 pl acc dat prs clitic']),
];

export const DEMONSTRATIVES: SqLexeme[] = [
  F('ky', 'DET', 'this', [
    'ky: m sg nom dem', 'kjo: f sg nom dem', 'këtë: m f sg acc dem', 'këtij: m sg gen dat abl dem', 'kësaj: f sg gen dat abl dem',
    'këta: m pl nom acc dem', 'këto: f pl nom acc dem', 'këtyre: pl gen dat abl dem',
  ]),
  F('ai', 'DET', 'that', [
    'ai: m sg nom dem', 'ajo: f sg nom dem', 'atë: m f sg acc dem', 'atij: m sg gen dat abl dem', 'asaj: f sg gen dat abl dem',
    'ata: m pl nom acc dem', 'ato: f pl nom acc dem', 'atyre: pl gen dat abl dem',
  ]),
];

/** Interrogatives and relatives. "cili" is also the relative (i cili, e cila, të cilët, të cilat): the article is a separate word. */
export const QUESTION_WORDS: SqLexeme[] = [
  F('kush', 'PRON', 'who', ['kush: nom int', 'kë: acc int', 'kujt: gen dat abl int']),
  F('çfarë', 'PRON', 'what', ['çfarë: int', "ç': int"]),
  F('cili', 'PRON', 'which, which one; who, which (relative)', [
    'cili: m sg nom int rel', 'cila: f sg nom int rel', 'cilin: m sg acc int rel', 'cilën: f sg acc int rel',
    'cilit: m sg gen dat abl int rel', 'cilës: f sg gen dat abl int rel',
    'cilët: m pl nom acc int rel', 'cilat: f pl nom acc int rel', 'cilëve: m pl gen dat abl int rel', 'cilave: f pl gen dat abl int rel',
  ], { role: 'as a relative it follows a linking article: i cili, e cila, të cilët, të cilat' }),
  F('sa', 'ADV', 'how much, how many', ['sa: int']),
  F('ku', 'ADV', 'where', ['ku: int rel']),
  F('kur', 'ADV', 'when', ['kur: int']),
  F('si', 'ADV', 'how', ['si: int']),
  F('pse', 'ADV', 'why', ['pse: int']),
  F('që', 'PRON', 'who, which, that (relative)', ['që: rel']),
];

export const INDEFINITES: SqLexeme[] = [
  F('një', 'DET', 'a, an', ['një: indef sg']),
  F('disa', 'DET', 'some, a few', ['disa: pind pl']),
  F('shumë', 'ADV', 'very, much, a lot'),
  F('shumë', 'DET', 'much, many', ['shumë: pind']),
  F('pak', 'ADV', 'little, a little'),
  F('pak', 'DET', 'little, few', ['pak: pind']),
  F('çdo', 'DET', 'every, each', ['çdo: pind']),
  F('secili', 'PRON', 'each one, everyone', [
    'secili: m sg nom pind', 'secila: f sg nom pind', 'secilin: m sg acc pind', 'secilën: f sg acc pind',
    'secilit: m sg gen dat abl pind', 'secilës: f sg gen dat abl pind',
  ]),
  F('gjithë', 'DET', 'all, whole', ['gjithë: pind', 'gjitha: f pl pind']),
  F('asnjë', 'DET', 'no, not any, none', ['asnjë: pneg']),
  F('askush', 'PRON', 'nobody, no one', ['askush: pneg']),
  F('asgjë', 'PRON', 'nothing', ['asgjë: pneg']),
  F('dikush', 'PRON', 'someone', ['dikush: pind']),
  F('diçka', 'PRON', 'something', ['diçka: pind']),
  F('tjetër', 'DET', 'other, another', ['tjetër: pind', 'tjerë: m pl pind', 'tjera: f pl pind']),
  F('vetë', 'PRON', 'self (emphatic or reflexive): myself, yourself, himself', undefined, {
    role: 'emphatic or reflexive: stands after the word it stresses (unë vetë: I myself)',
  }),
  F('njëri', 'PRON', 'one, someone (of a group)', [
    'njëri: m sg nom pind', 'njëra: f sg nom pind', 'njërin: m sg acc pind', 'njërën: f sg acc pind',
    'njërit: m sg gen dat abl pind', 'njërës: f sg gen dat abl pind',
  ]),
];
