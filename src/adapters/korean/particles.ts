/**
 * Korean particles (조사), written by hand for this adapter (KO_SOURCE_IDS.closed): each family with its allomorphs and the host each
 * allomorph needs, its Sejong tag, its function in plain words, the features it contributes, and the ORDER in which particles stack
 * (에서도, 에게만, 까지는, 에서만은; never 이/가 + 을/를, never anything after 의). Also the fused pronoun forms (내가, 이건, 난 …) and
 * the auxiliary and copula predicates the analyser knows without the lexicon (`KO_CLOSED_PREDICATES`).
 *
 * The family id (`id`) is the value of `morph.Particle` (joined with '+' along a chain: 학교에서도 → Particle=at+also). The family
 * headword (`family`, 은/는) is the lemma of the particle's WordPart.
 */
import type { KoIrregular, KoLexEntry } from './index-store';

/** The host an allomorph needs: C a consonant-final host (ㄹ included), V a vowel-final one, VL a vowel or ㄹ, CnL a consonant other than ㄹ. */
export type KoHostSound = 'C' | 'V' | 'VL' | 'CnL' | 'any';
export type KoParticleClass = 'struct' | 'shon' | 'gen' | 'adv' | 'lim' | 'top' | 'pol' | 'voc' | 'quote' | 'conj' | 'plural';

export interface KoParticle {
  id: string;
  family: string;
  forms: ReadonlyArray<{ text: string; after: KoHostSound }>;
  tag: 'JKS' | 'JKC' | 'JKG' | 'JKO' | 'JKB' | 'JKV' | 'JKQ' | 'JX' | 'JC' | 'XSN';
  cls: KoParticleClass;
  morph: Readonly<Record<string, string>>;
  role: string;
  /** Only after these words (서 for 에서 after 여기, 거기, 저기, 어디). */
  hosts?: readonly string[];
}

const P = (id: string, family: string, forms: Array<[string, KoHostSound]>, tag: KoParticle['tag'], cls: KoParticleClass, morph: Record<string, string>, role: string): KoParticle => ({
  id, family, forms: forms.map(([text, after]) => ({ text, after })), tag, cls, morph, role,
});
const CV = (c: string, v: string): Array<[string, KoHostSound]> => [[c, 'C'], [v, 'V']];
const ANY = (t: string): Array<[string, KoHostSound]> => [[t, 'any']];
const RO = (base: string): Array<[string, KoHostSound]> => [['으' + base, 'CnL'], [base, 'VL']];

export const PARTICLES: Readonly<Record<string, KoParticle>> = Object.fromEntries([
  P('topic', '은/는', CV('은', '는'), 'JX', 'top', { Topic: 'Yes' }, 'topic particle: as for …; (in contrast)'),
  P('subject', '이/가', CV('이', '가'), 'JKS', 'struct', { Case: 'Nom' }, 'subject particle (before 아니다 / 되다 it marks the complement)'),
  P('object', '을/를', CV('을', '를'), 'JKO', 'struct', { Case: 'Acc' }, 'object particle'),
  P('to', '에', ANY('에'), 'JKB', 'adv', { Case: 'Loc' }, 'at, in, on (place or time); to (a destination); per'),
  P('at', '에서', ANY('에서'), 'JKB', 'adv', { Case: 'Loc' }, 'at, in (where something happens); from (a place)'),
  { ...P('at-short', '에서', ANY('서'), 'JKB', 'adv', { Case: 'Loc' }, 'at, in; from (에서 shortened after 여기, 거기, 저기, 어디)'), hosts: ['여기', '거기', '저기', '어디', '이리', '그리', '저리', '데'] },
  P('of', '의', ANY('의'), 'JKG', 'gen', { Case: 'Gen' }, "of, 's (possession or relation)"),
  P('and', '와/과', CV('과', '와'), 'JKB', 'adv', { Case: 'Com' }, 'and (between nouns); with'),
  P('and-hago', '하고', ANY('하고'), 'JKB', 'adv', { Case: 'Com' }, 'and (between nouns); with (spoken)'),
  P('and-rang', '이랑/랑', CV('이랑', '랑'), 'JKB', 'adv', { Case: 'Com' }, 'and (between nouns); with (casual)'),
  P('to-person', '에게', ANY('에게'), 'JKB', 'adv', { Case: 'Dat' }, 'to (a person or animal)'),
  P('to-person-hante', '한테', ANY('한테'), 'JKB', 'adv', { Case: 'Dat' }, 'to (a person or animal; spoken)'),
  P('to-person-hon', '께', ANY('께'), 'JKB', 'adv', { Case: 'Dat', Polite: 'Hon' }, 'to (a person one honours)'),
  P('subject-hon', '께서', ANY('께서'), 'JKS', 'shon', { Case: 'Nom', Polite: 'Hon' }, 'subject particle for a person one honours'),
  P('from-person', '에게서', ANY('에게서'), 'JKB', 'adv', { Case: 'Abl' }, 'from (a person)'),
  P('from-person-hante', '한테서', ANY('한테서'), 'JKB', 'adv', { Case: 'Abl' }, 'from (a person; spoken)'),
  P('by', '로/으로', RO('로'), 'JKB', 'adv', { Case: 'Ins' }, 'to, toward (a direction); by, with (a means); as (a role); into (a change)'),
  P('also', '도', ANY('도'), 'JX', 'lim', { Focus: 'Also' }, 'also, too; even; (with a negative) not … either'),
  P('only', '만', ANY('만'), 'JX', 'lim', { Focus: 'Only' }, 'only, just'),
  P('from', '부터', ANY('부터'), 'JX', 'lim', { Case: 'Abl', Focus: 'From' }, 'from (a starting point in time or order); starting with'),
  P('until', '까지', ANY('까지'), 'JX', 'lim', { Focus: 'UpTo' }, 'until, up to, as far as; even'),
  P('than', '보다', ANY('보다'), 'JKB', 'adv', { Case: 'Cmp' }, 'than (in a comparison)'),
  P('like', '처럼', ANY('처럼'), 'JKB', 'adv', { Case: 'Equ' }, 'like, as (in the same way as)'),
  P('like-gati', '같이', ANY('같이'), 'JKB', 'adv', { Case: 'Equ' }, 'like, as (in the same way as)'),
  P('each', '마다', ANY('마다'), 'JX', 'lim', { Focus: 'Each' }, 'every, each'),
  P('even', '조차', ANY('조차'), 'JX', 'lim', { Focus: 'Even' }, 'even (usually: not even)'),
  P('even-majeo', '마저', ANY('마저'), 'JX', 'lim', { Focus: 'Even' }, 'even (that one too, the last)'),
  P('except', '밖에', ANY('밖에'), 'JX', 'lim', { Focus: 'Except' }, 'nothing but, only (with a negative verb)'),
  P('or', '이나/나', CV('이나', '나'), 'JX', 'lim', { Focus: 'Alt' }, 'or; … or something; as many as'),
  P('whether', '이든지/든지', [['이든지', 'C'], ['든지', 'V'], ['이든', 'C'], ['든', 'V']], 'JX', 'lim', { Focus: 'Any' }, 'whether … or; any … at all'),
  P('at-least', '이라도/라도', CV('이라도', '라도'), 'JX', 'lim', { Focus: 'AtLeast' }, 'even if it is only; at least'),
  P('emph', '이야/야', CV('이야', '야'), 'JX', 'lim', { Focus: 'Emph' }, 'as for …, of course; only (when it is)'),
  P('emph-malo', '이야말로/야말로', CV('이야말로', '야말로'), 'JX', 'lim', { Focus: 'Emph' }, 'precisely, indeed (it is … that)'),
  P('as-for', '이란/란', CV('이란', '란'), 'JX', 'top', { Topic: 'Yes' }, 'as for; what is called (a definition)'),
  P('polite', '요', ANY('요'), 'JX', 'pol', {}, 'polite marker 요'),
  P('plural', '들', ANY('들'), 'XSN', 'plural', { Number: 'Plur' }, 'plural marker'),
  P('among', '끼리', ANY('끼리'), 'XSN', 'plural', {}, 'among themselves, (just) together'),
  P('about', '쯤', ANY('쯤'), 'XSN', 'plural', {}, 'about, around (an amount, a time or a place)'),
  P('each-ssik', '씩', ANY('씩'), 'XSN', 'plural', { Focus: 'Each' }, 'each, apiece; at a time'),
  P('only-ppun', '뿐', ANY('뿐'), 'JX', 'lim', { Focus: 'Only' }, 'only, alone'),
  P('as', '대로', ANY('대로'), 'JX', 'lim', { Focus: 'Accord' }, 'as, in accordance with'),
  P('as-much', '만큼', ANY('만큼'), 'JX', 'lim', { Case: 'Equ' }, 'as much as, as … as'),
  P('let-alone', '커녕', ANY('커녕'), 'JX', 'lim', { Focus: 'LetAlone' }, 'let alone, far from'),
  P('let-alone-top', '은커녕/는커녕', CV('은커녕', '는커녕'), 'JX', 'lim', { Focus: 'LetAlone' }, 'let alone, far from'),
  P('voc', '아/야', CV('아', '야'), 'JKV', 'voc', { Case: 'Voc' }, 'calling particle (hey …), to a friend or younger person'),
  P('voc-lit', '이여/여', CV('이여', '여'), 'JKV', 'voc', { Case: 'Voc' }, 'calling particle (O …; literary)'),
  P('voc-hon', '이시여/시여', CV('이시여', '시여'), 'JKV', 'voc', { Case: 'Voc', Polite: 'Hon' }, 'calling particle for one honoured (O …; literary)'),
  P('onto', '에다가/에다', [['에다가', 'any'], ['에다', 'any']], 'JKB', 'adv', { Case: 'Loc' }, 'onto, into, at (where something is put)'),
  P('onto-person', '한테다가/한테다', [['한테다가', 'any'], ['한테다', 'any']], 'JKB', 'adv', { Case: 'Dat' }, 'to (a person; spoken)'),
  P('capacity', '로서/으로서', RO('로서'), 'JKB', 'adv', { Case: 'Ess' }, 'as (in the capacity of)'),
  P('means', '로써/으로써', RO('로써'), 'JKB', 'adv', { Case: 'Ins' }, 'by means of, with'),
  P('from-at', '에서부터', ANY('에서부터'), 'JKB', 'adv', { Case: 'Abl' }, 'from (a place or a time onward)'),
  P('toward-person', '에게로', ANY('에게로'), 'JKB', 'adv', { Case: 'Dat' }, 'toward (a person)'),
  P('quote-go', '고', ANY('고'), 'JKQ', 'quote', {}, 'quotative particle after a quoted sentence'),
  P('quote-direct', '이라고/라고', CV('이라고', '라고'), 'JKQ', 'quote', {}, 'quotative particle: says …, called …'),
  P('and-myeo', '이며/며', CV('이며', '며'), 'JC', 'conj', {}, 'and (listing nouns; written)'),
  P('and-ni', '이니/니', CV('이니', '니'), 'JC', 'conj', {}, 'and (listing nouns, among others)'),
].map((p) => [p.id, p]));

/** Particles tried in a nominal chain (the quotative 고 follows a quotation ending, never a noun). */
export const CHAIN_PARTICLES: readonly KoParticle[] = Object.values(PARTICLES).filter((p) => p.id !== 'quote-go');

const ADV_FIRST_OF_PAIR = new Set(['to', 'at', 'to-person', 'to-person-hante', 'to-person-hon', 'by', 'from-person', 'from-person-hante']);
const ADV_SECOND_OF_PAIR = new Set(['than', 'like', 'like-gati']);
const LIM_BEFORE_TOP = new Set(['only', 'from', 'until', 'except', 'as', 'as-much', 'only-ppun']);
const LIM_BEFORE_LIM = new Set(['until', 'from', 'only', 'as', 'as-much']);
const LIM_AFTER_LIM = new Set(['also', 'only', 'at-least', 'or', 'emph']);
const LIM_BEFORE_STRUCT = new Set(['only', 'until', 'from', 'as-much']);
const LIM_BEFORE_GEN = new Set(['only', 'until', 'from', 'as-much', 'as']);
const NO_GEN_AFTER = new Set(['than', 'like', 'like-gati']);
const AFTER_SHON = new Set(['topic', 'also', 'only', 'polite']);
const AFTER_QUOTE = new Set(['topic', 'also', 'only', 'polite']);

/**
 * May particle `next` follow `prev` (undefined = directly after the noun)? The orders Korean allows: a case-like particle, then
 * delimiters, then the topic particle (에서도, 에게만, 에서만은, 까지는); 이/가, 을/를 only after the noun, 들 or 만 / 까지 / 부터 / 만큼
 * (만이, 만을); 의 last; nothing after 이/가, 을/를 or 의 but the polite 요 after a subject or object.
 */
export function koParticleMayFollow(prev: KoParticle | undefined, next: KoParticle): boolean {
  if (next.cls === 'plural') return prev === undefined || (prev.id === 'plural' && next.id === 'among');
  if (!prev) return true;
  if (next.cls === 'pol') return prev.cls !== 'gen' && prev.cls !== 'pol' && prev.cls !== 'voc';
  switch (prev.cls) {
    case 'plural': return true;
    case 'struct': case 'gen': case 'voc': case 'pol': case 'conj': case 'top': return false;
    case 'quote': return AFTER_QUOTE.has(next.id);
    case 'shon': return AFTER_SHON.has(next.id);
    case 'adv':
      if (next.cls === 'lim') return !(prev.id === 'at' && next.id === 'from');
      if (next.cls === 'top') return next.id === 'topic';
      if (next.cls === 'gen') return !NO_GEN_AFTER.has(prev.id);
      if (next.cls === 'adv') return ADV_FIRST_OF_PAIR.has(prev.id) && ADV_SECOND_OF_PAIR.has(next.id);
      return false;
    case 'lim':
      if (next.cls === 'top') return next.id === 'topic' && LIM_BEFORE_TOP.has(prev.id);
      if (next.cls === 'lim') return LIM_BEFORE_LIM.has(prev.id) && LIM_AFTER_LIM.has(next.id) && next.id !== prev.id;
      if (next.cls === 'struct') return LIM_BEFORE_STRUCT.has(prev.id);
      if (next.cls === 'gen') return LIM_BEFORE_GEN.has(prev.id);
      return false;
  }
  return false;
}

/** Does this allomorph agree with a host whose last sound is `host` ('V' vowel, 'L' final ㄹ, 'C' other consonant)? */
export function koAllomorphAgrees(after: KoHostSound, host: 'V' | 'L' | 'C'): boolean {
  switch (after) {
    case 'any': return true;
    case 'C': return host !== 'V';
    case 'V': return host === 'V';
    case 'VL': return host !== 'C';
    case 'CnL': return host === 'C';
  }
}

// ───────────────────────────── fused pronoun + particle forms ─────────────────────────────

/**
 * Written forms in which a pronoun (or a place word) and a particle share a syllable or the pronoun changes shape (내가 = 나 + 가,
 * 이건 = 이것 + 은, 난 = 나 + 는). `pron` is the uncontracted word, `particle` the family id, `text` the particle as realised; the spans
 * are in syllables of the written form.
 */
export interface KoFused {
  /** The uncontracted word, its class, and a fingerprint of its gloss: the entry is RESOLVED against the installed lexicon at use, never by a homonym number. */
  pron: string; tag: string; fp: RegExp;
  particle: string; text: string; pronSpan: readonly [number, number]; partSpan: readonly [number, number];
}
const I = /\b(I|me)\b/u, YOU = /\byou\b/u, WHO = /\bwho\b/u, WHAT = /\bwhat\b/u, THIS = /\bthis\b/u, THAT = /\bthat\b/u, HERE = /\bhere\b/u, THERE = /\bthere\b/u, KID = /(child|kid|person|guy|that|this)/u;
const F = (pron: string, fp: RegExp, particle: string, text: string, pronSpan: [number, number], partSpan: [number, number]): KoFused => ({ pron, tag: 'NP', fp, particle, text, pronSpan, partSpan });
export const FUSED: Readonly<Record<string, KoFused>> = {
  내가: F('나', I, 'subject', '가', [0, 1], [1, 2]), 네가: F('너', YOU, 'subject', '가', [0, 1], [1, 2]), 제가: F('저', I, 'subject', '가', [0, 1], [1, 2]),
  누가: F('누구', WHO, 'subject', '가', [0, 1], [1, 2]),
  내게: F('나', I, 'to-person', '게', [0, 1], [0, 2]), 네게: F('너', YOU, 'to-person', '게', [0, 1], [0, 2]), 제게: F('저', I, 'to-person', '게', [0, 1], [0, 2]),
  난: F('나', I, 'topic', 'ㄴ', [0, 1], [0, 1]), 넌: F('너', YOU, 'topic', 'ㄴ', [0, 1], [0, 1]), 전: F('저', I, 'topic', 'ㄴ', [0, 1], [0, 1]),
  날: F('나', I, 'object', 'ㄹ', [0, 1], [0, 1]), 널: F('너', YOU, 'object', 'ㄹ', [0, 1], [0, 1]), 절: F('저', I, 'object', 'ㄹ', [0, 1], [0, 1]),
  누군: F('누구', WHO, 'topic', 'ㄴ', [0, 2], [1, 2]), 누굴: F('누구', WHO, 'object', 'ㄹ', [0, 2], [1, 2]),
  이건: F('이것', THIS, 'topic', 'ㄴ', [0, 2], [1, 2]), 그건: F('그것', THAT, 'topic', 'ㄴ', [0, 2], [1, 2]), 저건: F('저것', THAT, 'topic', 'ㄴ', [0, 2], [1, 2]),
  이게: F('이것', THIS, 'subject', '이', [0, 2], [1, 2]), 그게: F('그것', THAT, 'subject', '이', [0, 2], [1, 2]), 저게: F('저것', THAT, 'subject', '이', [0, 2], [1, 2]),
  이걸: F('이것', THIS, 'object', 'ㄹ', [0, 2], [1, 2]), 그걸: F('그것', THAT, 'object', 'ㄹ', [0, 2], [1, 2]), 저걸: F('저것', THAT, 'object', 'ㄹ', [0, 2], [1, 2]),
  뭘: F('무엇', WHAT, 'object', 'ㄹ', [0, 1], [0, 1]), 뭔: F('무엇', WHAT, 'topic', 'ㄴ', [0, 1], [0, 1]), 뭐가: F('무엇', WHAT, 'subject', '가', [0, 1], [1, 2]),
  여긴: F('여기', HERE, 'topic', 'ㄴ', [0, 2], [1, 2]), 거긴: F('거기', THERE, 'topic', 'ㄴ', [0, 2], [1, 2]), 저긴: F('저기', THERE, 'topic', 'ㄴ', [0, 2], [1, 2]),
  걘: F('걔', KID, 'topic', 'ㄴ', [0, 1], [0, 1]), 얜: F('얘', KID, 'topic', 'ㄴ', [0, 1], [0, 1]), 쟨: F('쟤', KID, 'topic', 'ㄴ', [0, 1], [0, 1]),
  걜: F('걔', KID, 'object', 'ㄹ', [0, 1], [0, 1]), 얠: F('얘', KID, 'object', 'ㄹ', [0, 1], [0, 1]),
  게: { ...F('거', /\bthing\b/u, 'subject', '이', [0, 1], [0, 1]), tag: 'NNB' }, 건: { ...F('거', /\bthing\b/u, 'topic', 'ㄴ', [0, 1], [0, 1]), tag: 'NNB' },
  걸: { ...F('거', /\bthing\b/u, 'object', 'ㄹ', [0, 1], [0, 1]), tag: 'NNB' },
  내: F('나', I, 'of', '의', [0, 1], [0, 1]), 네: F('너', YOU, 'of', '의', [0, 1], [0, 1]), 제: F('저', I, 'of', '의', [0, 1], [0, 1]),
};

/** The lexicon entry a fused row names: same headword and class, gloss matching the fingerprint. undefined when the lexicon has none. */
export function koResolveFused(f: KoFused, lookup: (key: string) => ReadonlyArray<{ entry: KoLexEntry }>): KoLexEntry | undefined {
  const rows = lookup(f.pron).map((h) => h.entry).filter((e) => e.lemma === f.pron && e.tag === f.tag);
  return rows.find((e) => f.fp.test(e.gloss ?? '')) ?? (rows.length === 1 && !rows[0].hom ? rows[0] : undefined);
}

// ───────────────────────────── closed predicates: copulas and auxiliaries ─────────────────────────────

/**
 * 있다 and 없다: ONE word each to a learner (closed-class existentials; the lexicon's VV / VA rows for them are suppressed). Class VA,
 * morph.VerbType=Exist, and the 는-forms of a verb (있는, 없는, 있는데). Honorific: 계시다 (be, of a person), 있으시다 (have).
 */
export const KO_EXISTENTIALS: readonly KoLexEntry[] = [
  { lemma: '있다', tag: 'VA', irr: 'R', gloss: 'to be (somewhere), to exist; to have', glossOwn: true, n: 5000 },
  { lemma: '없다', tag: 'VA', irr: 'R', gloss: 'not to be, not to exist; not to have', glossOwn: true, n: 2000 },
];
export const KO_EXISTENTIAL_LEMMAS: ReadonlySet<string> = new Set(KO_EXISTENTIALS.map((e) => e.lemma));

/** The copula entries (the lexicon holds no VCP / VCN rows). */
export const KO_COPULA: KoLexEntry = { lemma: '이다', tag: 'VCP', irr: 'R', gloss: 'to be (copula)', glossOwn: true, n: 5000 };
export const KO_NEG_COPULA: KoLexEntry = { lemma: '아니다', tag: 'VCN', irr: 'R', gloss: 'not to be', glossOwn: true, n: 1200 };

const VX = (lemma: string, irr: KoIrregular, gloss: string): KoLexEntry => ({ lemma, tag: 'VX', irr, gloss, glossOwn: true });
/**
 * Auxiliary predicates (보조 용언) that follow a connective form (-아/어, -고, -지, -게, -(으)ㄹ까 …). At token level each is read as
 * its main verb first; this VX reading stands beside it for the sentence layer to promote. Left out on purpose: 가지다 (-어 가지고,
 * colloquial, best taken as a construction), 오다/가다 are listed; 지다 is here as an auxiliary, the passive written as one word is
 * -아/어지- in endings.ts.
 */
export const KO_AUXILIARIES: readonly KoLexEntry[] = [
  VX('있다', 'R', 'be (doing), be in a state (-고 있다, -아/어 있다)'), VX('보다', 'R', 'try (-아/어 보다); seem (-나 보다)'),
  VX('주다', 'R', 'do for someone (-아/어 주다)'), VX('드리다', 'R', 'do for someone honoured (-아/어 드리다)'),
  VX('버리다', 'R', 'do completely, end up (-아/어 버리다)'), VX('놓다', 'R', 'do in advance (-아/어 놓다)'),
  VX('두다', 'R', 'do and keep (-아/어 두다)'), VX('내다', 'R', 'do through to the end (-아/어 내다)'),
  VX('가다', 'R', 'keep on (-아/어 가다)'), VX('오다', 'R', 'have been doing (-아/어 오다)'),
  VX('지다', 'R', 'become; be done (-아/어 지다)'), VX('싶다', 'R', 'want to (-고 싶다)'),
  VX('않다', 'R', 'not (-지 않다)'), VX('못하다', 'Ha', 'cannot (-지 못하다)'), VX('말다', 'R', "don't; stop (-지 말다)"),
  VX('하다', 'Ha', 'make, have (-게 하다); must (-아/어야 하다)'), VX('대다', 'R', 'keep doing (-아/어 대다)'),
  VX('쌓다', 'R', 'keep doing (-아/어 쌓다)'), VX('나다', 'R', 'get through (-고 나다)'), VX('치우다', 'R', 'do away with (-아/어 치우다)'),
  VX('계시다', 'R', 'be (doing), honorific (-고 계시다)'), VX('보이다', 'R', 'look, seem (-아/어 보이다)'),
  VX('듯하다', 'Ha', 'seem (-(으)ㄴ/는 듯하다)'), VX('만하다', 'Ha', 'be worth (-(으)ㄹ 만하다)'), VX('법하다', 'Ha', 'be likely (-(으)ㄹ 법하다)'),
  VX('뻔하다', 'Ha', 'nearly (-(으)ㄹ 뻔하다)'), VX('척하다', 'Ha', 'pretend (-(으)ㄴ/는 척하다)'), VX('체하다', 'Ha', 'pretend (-(으)ㄴ/는 체하다)'),
  VX('양하다', 'Ha', 'pretend (-(으)ㄴ/는 양하다)'), VX('아니하다', 'Ha', 'not (-지 아니하다, the older and written -지 않다)'),
];

/** The long negation's own main verbs (아니하다 = 않다, constant in Bible Korean). */
export const KO_NEGATION_VERBS: readonly KoLexEntry[] = [{ lemma: '아니하다', tag: 'VV', irr: 'Ha', gloss: 'not to do (older and written form of 않다)', glossOwn: true }];

/**
 * Conjunctive adverbs (접속 부사, class MAJ → CONJ) read whole, whatever class the lexicon gives them: a whole function word outranks its
 * own etymology (그래서 is not read first as 그렇다 + -어서). The lexicon's own MAG / MAJ rows of these spellings are suppressed.
 */
const MAJ = (lemma: string, gloss: string): KoLexEntry => ({ lemma, tag: 'MAJ', gloss, glossOwn: true, n: 300 });
export const KO_CONJUNCTIVE_ADVERBS: readonly KoLexEntry[] = [
  MAJ('그래서', 'so, therefore'), MAJ('그러나', 'but, however'), MAJ('그리고', 'and'), MAJ('하지만', 'but'), MAJ('그런데', 'but, by the way'),
  MAJ('그러면', 'then, if so'), MAJ('그럼', 'then, well then'), MAJ('그러니까', 'so, that is why'), MAJ('그래도', 'even so, still'), MAJ('따라서', 'therefore'),
  MAJ('또한', 'also, moreover'), MAJ('즉', 'that is, namely'), MAJ('그러므로', 'therefore'), MAJ('게다가', 'besides, moreover'), MAJ('그렇지만', 'but, however'),
  MAJ('또는', 'or'), MAJ('혹은', 'or'), MAJ('및', 'and'), MAJ('왜냐하면', 'because'), MAJ('그러자', 'thereupon'), MAJ('그리하여', 'and so'),
  MAJ('더구나', 'moreover'), MAJ('하물며', 'much less'), MAJ('그러니', 'so'), MAJ('아니면', 'or else'), MAJ('그러다가', 'and then'), MAJ('그럼에도', 'nevertheless'),
];
export const KO_CONJUNCTIVE_LEMMAS: ReadonlySet<string> = new Set(KO_CONJUNCTIVE_ADVERBS.map((e) => e.lemma));

/** Contractions bound to particular particles (누 before 가, 내 / 제 / 네 as subject or genitive forms): never free nouns taking other endings. */
export const KO_BOUND_CONTRACTIONS: ReadonlySet<string> = new Set(['누', '내', '제', '네']);

// ───────────────────────────── numerals ─────────────────────────────

const SINO_DIGIT: Readonly<Record<string, number>> = { 일: 1, 이: 2, 삼: 3, 사: 4, 오: 5, 육: 6, 륙: 6, 칠: 7, 팔: 8, 구: 9 };
const SINO_SMALL: Readonly<Record<string, number>> = { 십: 10, 백: 100, 천: 1000 };
const SINO_BIG: Readonly<Record<string, number>> = { 만: 1e4, 억: 1e8, 조: 1e12 };
const NATIVE_TENS: Readonly<Record<string, number>> = { 열: 10, 스물: 20, 스무: 20, 서른: 30, 마흔: 40, 쉰: 50, 예순: 60, 일흔: 70, 여든: 80, 아흔: 90 };
const NATIVE_UNITS: Readonly<Record<string, number>> = { 하나: 1, 한: 1, 둘: 2, 두: 2, 셋: 3, 세: 3, 석: 3, 넷: 4, 네: 4, 넉: 4, 다섯: 5, 여섯: 6, 일곱: 7, 여덟: 8, 아홉: 9 };

/** A numeral written in Hangul at the start of s: its pieces, its value and its length in syllables. Only compositions of two pieces or more. */
export interface KoNumeral { pieces: string[]; value: number; length: number; kind: 'sino' | 'native' }
export function koParseNumerals(s: string): KoNumeral[] {
  const out: KoNumeral[] = [];
  // Sino-Korean: ( [digit]? (십|백|천) | digit )+ grouped under 만 / 억 / 조
  const chars = [...s];
  let i = 0, total = 0, group = 0, pending = 0;
  const pieces: string[] = [];
  const push = () => { const v = total + group + pending; if (pieces.length >= 2) out.push({ pieces: [...pieces], value: v, length: i, kind: 'sino' }); };
  while (i < chars.length) {
    const ch = chars[i];
    if (SINO_DIGIT[ch] !== undefined && pending === 0) { pending = SINO_DIGIT[ch]; pieces.push(ch); i++; push(); continue; }
    if (SINO_SMALL[ch] !== undefined) { group += (pending || 1) * SINO_SMALL[ch]; pending = 0; pieces.push(ch); i++; push(); continue; }
    if (SINO_BIG[ch] !== undefined && (group || pending || total === 0)) { total += (group + pending || 1) * SINO_BIG[ch]; group = 0; pending = 0; pieces.push(ch); i++; push(); continue; }
    break;
  }
  // native: tens + units
  for (const [t, tv] of Object.entries(NATIVE_TENS)) {
    if (!s.startsWith(t)) continue;
    for (const [u, uv] of Object.entries(NATIVE_UNITS)) if (s.startsWith(t + u)) out.push({ pieces: [t, u], value: tv + uv, length: [...t + u].length, kind: 'native' });
  }
  return out.sort((a, b) => b.length - a.length);
}

/** The closed predicates by stem key (이, 아니, 있, 보 …). */
export const KO_CLOSED_PREDICATES: ReadonlyMap<string, readonly KoLexEntry[]> = (() => {
  const m = new Map<string, KoLexEntry[]>();
  for (const e of [KO_COPULA, KO_NEG_COPULA, ...KO_EXISTENTIALS, ...KO_NEGATION_VERBS, ...KO_AUXILIARIES]) {
    const k = e.lemma.slice(0, -1);
    m.set(k, [...(m.get(k) ?? []), e]);
  }
  return m;
})();

/** Clear names for the sentence layer. */
export const KO_FUSED_PRONOUNS = FUSED;
export const KO_AUXILIARY_PREDICATES = KO_AUXILIARIES;
