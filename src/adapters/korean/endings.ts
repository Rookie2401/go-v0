/**
 * The closed inventory of Korean verbal endings (어미), written by hand for this adapter (KO_SOURCE_IDS.closed): pre-final endings (EP),
 * final endings of every speech level and sentence type (EF), connectives (EC), adnominals (ETM) and nominalisers (ETN), indirect
 * quotation, and the literary and Bible endings (docs/korean/PLAN.md "The ending inventory").
 *
 * Each ending gives:
 *   cite      the citation form the dictionaries use (-았/었-, -(으)면, -ㅂ니다/-습니다): the `lemma` of its WordPart;
 *   forms     how it attaches (conjugate.ts): `bare` (to the stem as it is), `eu` (-(으)X), `aeo` (to the infinitive), `cv` (one
 *             allomorph after a consonant, another after a vowel or ㄹ); a tail beginning with a lone consonant (ㅆ, ㄴ, ㄹ, ㅁ, ㅂ)
 *             becomes the final of the syllable before it;
 *   pred      which hosts it may follow: V action verb, A descriptive verb, C copula (이다, 아니다), P after -았/었- or -겠-,
 *             R after -더-, L after -옵-; `exist` lets the 는-forms follow 있다 / 없다 / 계시다 and their compounds;
 *   morph     the features it contributes (UD-style keys; several values comma-joined, sorted);
 *   role      its function in plain words;
 *   yo        polite 요 may follow it (-지요, -는데요, -거든요 …); `after` the particles that may follow it.
 * Pre-final endings carry `slot` (their order in the chain: -(으)시- 1, -옵- 1.5, -았/었- 2, -겠- 4, -더- 5) and `pending` when the
 * ending is vowel-final and contracts with the next one (시 + 었 → 셨).
 */

export type KoEndingTag = 'EP' | 'EF' | 'EC' | 'ETN' | 'ETM';
export type KoAttach = 'bare' | 'eu' | 'aeo' | 'cv';

export interface KoEndingForm {
  attach: KoAttach;
  tail?: string;
  /** cv: the allomorph(s) after a consonant-final stem (not ㄹ). */
  c?: readonly string[];
  /** cv: the allomorph after a vowel (and, with ㄹ dropped, after ㄹ). Absent: no form after a vowel. */
  v?: string;
  /** bare: only after a consonant other than ㄹ ('C') or only after a vowel or ㄹ ('V'). */
  onlyAfter?: 'C' | 'V';
}

export interface KoEnding {
  id: string;
  cite: string;
  tag: KoEndingTag;
  forms: readonly KoEndingForm[];
  morph: Readonly<Record<string, string>>;
  role: string;
  pred: string;
  exist?: boolean;
  slot?: number;
  pending?: boolean;
  noHon?: boolean;
  noFut?: boolean;
  yo?: boolean;
  /** Particles that may follow: family ids, or 'nominal' for a whole particle chain (a nominalised form). */
  after?: readonly string[] | 'nominal';
  /** The sentence types the ending allows when it alone does not decide (해요체 -아/어요): NO Mood is set; the sentence layer sets it from the punctuation. */
  moods?: readonly string[];
  /** Connective id (`morph.Connective`). */
  conn?: string;
  lit?: boolean;
}

const B = (tail: string, onlyAfter?: 'C' | 'V'): KoEndingForm => (onlyAfter ? { attach: 'bare', tail, onlyAfter } : { attach: 'bare', tail });
const E = (tail: string): KoEndingForm => ({ attach: 'eu', tail });
const A = (tail: string): KoEndingForm => ({ attach: 'aeo', tail });
const CV = (c: string, v: string): KoEndingForm => ({ attach: 'cv', c: [c], v });

const LIT = { SpeechLevel: 'Lit' } as const;

type Def = Omit<KoEnding, 'tag'>;
const ep = (d: Def): KoEnding => ({ ...d, tag: 'EP' });
const ef = (d: Def): KoEnding => ({ ...d, tag: 'EF', morph: { VerbForm: 'Fin', ...d.morph } });
const ec = (d: Def): KoEnding => ({ ...d, tag: 'EC', morph: { VerbForm: 'Conn', ...(d.conn ? { Connective: d.conn } : {}), ...d.morph } });
const etm = (d: Def): KoEnding => ({ ...d, tag: 'ETM', morph: { VerbForm: 'Adn', ...d.morph } });
const etn = (d: Def): KoEnding => ({ ...d, tag: 'ETN', morph: { VerbForm: 'Nmlz', ...d.morph } });

const ALLMOOD = ['Ind', 'Int', 'Imp', 'Prop'] as const;
const EC_AFTER = ['topic', 'also'] as const;

export const ENDINGS: readonly KoEnding[] = [
  // ───────── pre-final (선어말 어미) ─────────
  ep({ id: 'p-pass', cite: '-아/어지-', forms: [A('지')], pred: 'VA', slot: 0.5, pending: true, morph: {}, role: 'become; be done (-아/어지다, written as one word)' }),
  ep({ id: 'p-hon', cite: '-(으)시-', forms: [E('시')], pred: 'VAC', slot: 1, pending: true, morph: { Honorific: 'Subj' }, role: 'honorific (honours the subject)' }),
  ep({ id: 'p-humble', cite: '-(으)옵-/-사옵-', forms: [{ attach: 'cv', c: ['사옵'], v: '옵' }], pred: 'VAC', slot: 1.5, morph: { ...LIT }, role: 'humble (prayer and old letters)', lit: true }),
  ep({ id: 'p-past', cite: '-았/었-', forms: [A('ㅆ')], pred: 'VAC', slot: 2, morph: { Tense: 'Past' }, role: 'past' }),
  ep({ id: 'p-pqp', cite: '-았었-/-었었-', forms: [A('ㅆ었')], pred: 'VAC', slot: 2, morph: { Tense: 'Past', Aspect: 'Pqp' }, role: 'past perfect (had …; was once …)' }),
  ep({ id: 'p-must', cite: '-아/어야겠-', forms: [A('야겠')], pred: 'VAC', slot: 4, morph: { Modality: 'Necessitative' }, role: 'must, I had better (contraction of -아/어야 하겠-)' }),
  ep({ id: 'p-fut', cite: '-겠-', forms: [B('겠')], pred: 'VACP', slot: 4, morph: { Modality: 'Presumptive' }, role: 'intention or conjecture (will, must be)' }),
  ep({ id: 'p-retro', cite: '-더-', forms: [B('더')], pred: 'VACP', slot: 5, pending: true, morph: { Modality: 'Retrospective' }, role: 'retrospective (what the speaker saw or noticed)' }),

  // ───────── 해라체 (plain) ─────────
  ef({ id: 'decl-da', cite: '-다', forms: [B('다')], pred: 'VACP', morph: { Mood: 'Ind', SpeechLevel: 'Haera' }, role: 'plain declarative ending (also the dictionary form)' }),
  ef({ id: 'decl-neunda', cite: '-ㄴ다/-는다', forms: [CV('는다', 'ㄴ다')], pred: 'V', morph: { Mood: 'Ind', SpeechLevel: 'Haera' }, role: 'plain declarative ending of an action verb' }),
  ef({ id: 'retro-ra', cite: '-라', forms: [B('라')], pred: 'R', morph: { Mood: 'Ind', SpeechLevel: 'Haera' }, role: 'plain declarative after -더- (-더라: I saw that …; also the narrative ending of older prose)' }),
  ef({ id: 'q-nya', cite: '-(으)냐/-냐', forms: [E('냐'), B('냐')], pred: 'VACPR', morph: { Mood: 'Int', SpeechLevel: 'Haera' }, role: 'plain question ending' }),
  ef({ id: 'q-neunya', cite: '-느냐', forms: [B('느냐')], pred: 'VP', exist: true, morph: { Mood: 'Int', SpeechLevel: 'Haera' }, role: 'plain question ending' }),
  ef({ id: 'q-ni', cite: '-니', forms: [B('니')], pred: 'VACP', morph: { Mood: 'Int', SpeechLevel: 'Haera' }, role: 'plain question ending (to a child or friend)' }),
  ef({ id: 'prop-ja', cite: '-자', forms: [B('자')], pred: 'V', morph: { Mood: 'Prop', SpeechLevel: 'Haera' }, role: "plain suggestion (let's …)" }),
  ef({ id: 'imp-ara', cite: '-아라/-어라', forms: [A('라')], pred: 'V', morph: { Mood: 'Imp', SpeechLevel: 'Haera' }, role: 'plain command' }),
  ef({ id: 'imp-geora', cite: '-거라', forms: [B('거라')], pred: 'V', morph: { Mood: 'Imp', SpeechLevel: 'Haera' }, role: 'plain command (가거라; older or emphatic)' }),
  ef({ id: 'imp-neora', cite: '-너라', forms: [B('너라')], pred: 'V', morph: { Mood: 'Imp', SpeechLevel: 'Haera' }, role: 'plain command of 오다 and its compounds (오너라)' }),
  ef({ id: 'imp-eura', cite: '-(으)라', forms: [E('라')], pred: 'V', morph: { Mood: 'Imp', SpeechLevel: 'Haera' }, role: 'written or reported command' }),
  ef({ id: 'excl-guna', cite: '-구나', forms: [B('구나')], pred: 'ACPR', morph: { Mood: 'Excl', SpeechLevel: 'Haera' }, role: 'exclamation (so …!)' }),
  ef({ id: 'excl-neunguna', cite: '-는구나', forms: [B('는구나')], pred: 'V', exist: true, morph: { Mood: 'Excl', SpeechLevel: 'Haera' }, role: 'exclamation (so …!)' }),
  ef({ id: 'excl-gun', cite: '-군', forms: [B('군')], pred: 'ACPR', yo: true, morph: { Mood: 'Excl', SpeechLevel: 'Hae' }, role: 'exclamation on noticing something' }),
  ef({ id: 'excl-neungun', cite: '-는군', forms: [B('는군')], pred: 'V', exist: true, yo: true, morph: { Mood: 'Excl', SpeechLevel: 'Hae' }, role: 'exclamation on noticing something' }),
  ef({ id: 'excl-ne', cite: '-네', forms: [B('네')], pred: 'VACP', yo: true, morph: { Mood: 'Excl', SpeechLevel: 'Hae' }, role: 'exclamation on noticing (also the 하게체 statement)' }),
  ef({ id: 'prom-ma', cite: '-(으)마', forms: [E('마')], pred: 'V', morph: { Mood: 'Ind', SpeechLevel: 'Haera' }, role: 'promise (to a younger hearer)' }),
  ef({ id: 'imp-ryeom', cite: '-(으)렴', forms: [E('렴')], pred: 'V', morph: { Mood: 'Imp', SpeechLevel: 'Haera' }, role: 'gentle command (why not …)' }),

  // ───────── 해체 (informal) ─────────
  ef({ id: 'hae', cite: '-아/-어', forms: [A('')], pred: 'VAP', moods: ALLMOOD, morph: { SpeechLevel: 'Hae' }, role: 'informal ending (statement, question, command or suggestion)' }),
  ef({ id: 'hae-ya', cite: '-(이)야', forms: [B('야')], pred: 'C', moods: ['Ind', 'Int'], morph: { SpeechLevel: 'Hae' }, role: 'informal ending of the copula (it is …)' }),
  ef({ id: 'hae-ji', cite: '-지', forms: [B('지')], pred: 'VACP', yo: true, moods: ['Ind', 'Int'], morph: { SpeechLevel: 'Hae' }, role: 'statement or question expecting agreement (…, right?)' }),
  ef({ id: 'jyo', cite: '-죠', forms: [B('죠')], pred: 'VACP', moods: ['Ind', 'Int'], morph: { SpeechLevel: 'Haeyo' }, role: 'polite statement or question expecting agreement (contraction of -지요)' }),
  ef({ id: 'hae-geodeun', cite: '-거든', forms: [B('거든')], pred: 'VACP', yo: true, morph: { Mood: 'Ind', SpeechLevel: 'Hae' }, role: 'giving the reason or background (you see, …)' }),
  ef({ id: 'hae-janha', cite: '-잖아', forms: [B('잖아')], pred: 'VACP', yo: true, morph: { Mood: 'Ind', SpeechLevel: 'Hae' }, role: 'you know (reminding the hearer)' }),
  ef({ id: 'hae-lge', cite: '-(으)ㄹ게', forms: [E('ㄹ게')], pred: 'V', yo: true, morph: { Mood: 'Ind', SpeechLevel: 'Hae' }, role: 'promise or intention (I will …)' }),
  ef({ id: 'hae-lkka', cite: '-(으)ㄹ까', forms: [E('ㄹ까')], pred: 'VACP', yo: true, noFut: true, morph: { Mood: 'Int', SpeechLevel: 'Hae' }, role: 'shall I / shall we …?; I wonder whether …' }),
  ef({ id: 'hae-llae', cite: '-(으)ㄹ래', forms: [E('ㄹ래')], pred: 'V', yo: true, moods: ['Ind', 'Int'], morph: { SpeechLevel: 'Hae' }, role: 'want to; will you …?' }),
  ef({ id: 'hae-lgeol', cite: '-(으)ㄹ걸', forms: [E('ㄹ걸')], pred: 'VACP', yo: true, noFut: true, morph: { Mood: 'Ind', SpeechLevel: 'Hae' }, role: 'I guess …; I should have … (regret)' }),
  ef({ id: 'lit-riroda', cite: '-(으)리로다', forms: [E('리로다')], pred: 'VACP', lit: true, morph: { Mood: 'Excl', SpeechLevel: 'Lit' }, role: 'literary: will surely … (-(으)리로다)' }),
  ef({ id: 'hage-na', cite: '-나', forms: [B('나')], pred: 'VAP', yo: true, morph: { Mood: 'Int', SpeechLevel: 'Hage' }, role: 'question (soft; with 요 polite)' }),
  ef({ id: 'hage-neunga', cite: '-는가', forms: [B('는가')], pred: 'VP', exist: true, yo: true, morph: { Mood: 'Int', SpeechLevel: 'Hage' }, role: 'question (written or 하게체)' }),
  ef({ id: 'hage-eunga', cite: '-(으)ㄴ가', forms: [E('ㄴ가')], pred: 'AC', yo: true, morph: { Mood: 'Int', SpeechLevel: 'Hage' }, role: 'question (written or 하게체)' }),
  ef({ id: 'hage-ge', cite: '-게', forms: [B('게')], pred: 'V', morph: { Mood: 'Imp', SpeechLevel: 'Hage' }, role: 'command (하게체)' }),
  ef({ id: 'hage-se', cite: '-세', forms: [B('세')], pred: 'V', morph: { Mood: 'Prop', SpeechLevel: 'Hage' }, role: 'suggestion (하게체)' }),
  ef({ id: 'hao-o', cite: '-(으)오/-소', forms: [E('오'), B('소', 'C')], pred: 'VACP', moods: ['Ind', 'Int', 'Imp'], morph: { SpeechLevel: 'Hao' }, role: '하오체 ending (statement, question or command)' }),
  ef({ id: 'hao-gureo', cite: '-구려', forms: [B('구려')], pred: 'VACP', morph: { Mood: 'Excl', SpeechLevel: 'Hao' }, role: 'exclamation (하오체)' }),

  // ───────── 해요체 / 하십시오체 ─────────
  ef({ id: 'haeyo', cite: '-아요/-어요', forms: [A('요')], pred: 'VACP', moods: ALLMOOD, morph: { SpeechLevel: 'Haeyo' }, role: 'polite ending (statement, question, command or suggestion)' }),
  ef({ id: 'seyo', cite: '-(으)세요', forms: [E('세요')], pred: 'VAC', noHon: true, moods: ['Ind', 'Int', 'Imp'], morph: { Honorific: 'Subj', SpeechLevel: 'Haeyo' }, role: 'polite honorific ending (please …; statement or question about someone honoured)' }),
  ef({ id: 'hasipsio-decl', cite: '-ㅂ니다/-습니다', forms: [CV('습니다', 'ㅂ니다')], pred: 'VACP', morph: { Mood: 'Ind', SpeechLevel: 'Hasipsio' }, role: 'formal polite declarative ending' }),
  ef({ id: 'hasipsio-q', cite: '-ㅂ니까/-습니까', forms: [CV('습니까', 'ㅂ니까')], pred: 'VACP', morph: { Mood: 'Int', SpeechLevel: 'Hasipsio' }, role: 'formal polite question ending' }),
  ef({ id: 'prop-bsida', cite: '-(으)ㅂ시다', forms: [E('ㅂ시다')], pred: 'V', morph: { Mood: 'Prop', SpeechLevel: 'Hasipsio' }, role: "formal suggestion (let's …)" }),
  ef({ id: 'imp-bsio', cite: '-(으)ㅂ시오', forms: [E('ㅂ시오')], pred: 'V', morph: { Mood: 'Imp', SpeechLevel: 'Hasipsio' }, role: 'formal command (notices)' }),
  ef({ id: 'imp-sipsio', cite: '-(으)십시오', forms: [E('십시오')], pred: 'V', noHon: true, morph: { Honorific: 'Subj', Mood: 'Imp', SpeechLevel: 'Hasipsio' }, role: 'formal polite command (please …)' }),

  // ───────── literary and Bible endings ─────────
  ef({ id: 'lit-neunira', cite: '-느니라', forms: [B('느니라')], pred: 'VP', lit: true, morph: { Mood: 'Ind', ...LIT }, role: 'literary statement of a truth (-느니라)' }),
  ef({ id: 'lit-nira', cite: '-(으)니라', forms: [E('니라')], pred: 'VAC', lit: true, morph: { Mood: 'Ind', ...LIT }, role: 'literary statement of a truth (-(으)니라)' }),
  ef({ id: 'lit-nora', cite: '-노라', forms: [B('노라')], pred: 'VP', lit: true, morph: { Mood: 'Ind', ...LIT }, role: 'literary first-person statement (-노라)' }),
  ef({ id: 'lit-doda', cite: '-도다', forms: [B('도다')], pred: 'VACP', lit: true, morph: { Mood: 'Excl', ...LIT }, role: 'literary exclamation (-도다)' }),
  ef({ id: 'lit-rira', cite: '-(으)리라', forms: [E('리라')], pred: 'VACP', lit: true, morph: { Mood: 'Ind', ...LIT }, role: 'literary will, shall (-(으)리라)' }),
  ef({ id: 'lit-sose', cite: '-(으)소서', forms: [E('소서')], pred: 'VL', lit: true, morph: { Mood: 'Imp', ...LIT }, role: 'literary entreaty (-(으)소서: may it be; please)' }),
  ef({ id: 'lit-naida', cite: '-나이다', forms: [B('나이다')], pred: 'VACPL', lit: true, morph: { Mood: 'Ind', ...LIT }, role: 'literary humble statement (-나이다)' }),
  ef({ id: 'lit-bnaida', cite: '-(으)ㅂ나이다', forms: [E('ㅂ나이다')], pred: 'VAC', lit: true, morph: { Mood: 'Ind', ...LIT }, role: 'literary humble statement (-(으)ㅂ나이다)' }),
  ef({ id: 'lit-roda', cite: '-(이)로다', forms: [B('로다')], pred: 'C', lit: true, morph: { Mood: 'Excl', ...LIT }, role: 'literary exclamation of the copula (-(이)로다)' }),
  ef({ id: 'lit-ira', cite: '-(이)라', forms: [B('라')], pred: 'C', lit: true, morph: { Mood: 'Ind', ...LIT }, role: 'literary statement of the copula (-(이)라)' }),
  ef({ id: 'lit-ljira', cite: '-(으)ㄹ지라', forms: [E('ㄹ지라')], pred: 'VACP', lit: true, morph: { Mood: 'Ind', ...LIT }, role: 'literary shall, will surely (-(으)ㄹ지라)' }),
  ef({ id: 'lit-ljieoda', cite: '-(으)ㄹ지어다', forms: [E('ㄹ지어다')], pred: 'V', lit: true, morph: { Mood: 'Imp', ...LIT }, role: 'literary command or blessing (-(으)ㄹ지어다)' }),

  // ───────── connectives (연결 어미) ─────────
  ec({ id: 'but-formal', conn: 'but', cite: '-ㅂ니다만/-습니다만', forms: [CV('습니다만', 'ㅂ니다만')], pred: 'VACP', morph: { SpeechLevel: 'Hasipsio' }, role: 'formal polite: …, but' }),
  ec({ id: 'as-you-know', conn: 'as-you-know', cite: '-다시피', forms: [B('다시피')], pred: 'VP', morph: {}, role: 'as (you know, you see) …' }),
  ec({ id: 'lit-nani', conn: 'since', cite: '-나니', forms: [B('나니')], pred: 'VACP', lit: true, morph: { SpeechLevel: 'Lit' }, role: 'literary: since, as (-나니)' }),
  ec({ id: 'lit-sioemyeo', conn: 'and', cite: '-(으)시오며', forms: [E('시오며')], pred: 'V', noHon: true, lit: true, morph: { Honorific: 'Subj', SpeechLevel: 'Lit' }, role: 'literary honorific: and (-(으)시오며)' }),
  ec({ id: 'and', conn: 'and', cite: '-고', forms: [B('고')], pred: 'VACPL', yo: true, after: EC_AFTER, morph: {}, role: 'and; and then' }),
  ec({ id: 'and-while', conn: 'and-while', cite: '-(으)며', forms: [E('며')], pred: 'VACPL', morph: {}, role: 'and; while (written)' }),
  ec({ id: 'while', conn: 'while', cite: '-(으)면서', forms: [E('면서')], pred: 'VACP', after: ['also'], morph: {}, role: 'while; although' }),
  ec({ id: 'but', conn: 'but', cite: '-지만', forms: [B('지만')], pred: 'VACP', morph: {}, role: 'but' }),
  ec({ id: 'but-lit', conn: 'but', cite: '-(으)나', forms: [E('나')], pred: 'VACP', morph: {}, role: 'but (written)' }),
  ec({ id: 'so', conn: 'so', cite: '-아서/-어서', forms: [A('서')], pred: 'VAC', yo: true, after: EC_AFTER, morph: {}, role: 'so, because; and then' }),
  ec({ id: 'so-ra', conn: 'so', cite: '-(이)라서', forms: [B('라서')], pred: 'C', yo: true, morph: {}, role: 'so, because (after the copula)' }),
  ec({ id: 'since', conn: 'since', cite: '-(으)니', forms: [E('니')], pred: 'VACPL', morph: {}, role: 'since; when (and found that)' }),
  ec({ id: 'because', conn: 'because', cite: '-(으)니까', forms: [E('니까')], pred: 'VACPL', yo: true, morph: {}, role: 'because; when' }),
  ec({ id: 'if', conn: 'if', cite: '-(으)면', forms: [E('면')], pred: 'VACP', yo: true, morph: {}, role: 'if; when' }),
  ec({ id: 'intend', conn: 'intend', cite: '-(으)려고', forms: [E('려고')], pred: 'V', yo: true, morph: {}, role: 'in order to; intending to' }),
  ec({ id: 'purpose', conn: 'purpose', cite: '-(으)러', forms: [E('러')], pred: 'V', morph: {}, role: 'to (go or come to do)' }),
  ec({ id: 'even-if', conn: 'even-if', cite: '-아도/-어도', forms: [A('도')], pred: 'VACP', morph: {}, role: 'even if; even though' }),
  ec({ id: 'even-if-ra', conn: 'even-if', cite: '-(이)라도', forms: [B('라도')], pred: 'C', morph: {}, role: 'even if it is (after the copula)' }),
  ec({ id: 'only-if', conn: 'only-if', cite: '-아야/-어야', forms: [A('야')], pred: 'VACP', after: ['only'], morph: {}, role: 'only if; must (before 하다 / 되다)' }),
  ec({ id: 'background', conn: 'background', cite: '-는데', forms: [B('는데')], pred: 'VP', exist: true, yo: true, after: ['also'], morph: {}, role: 'background or contrast (…, and; but)' }),
  ec({ id: 'background-adj', conn: 'background', cite: '-(으)ㄴ데', forms: [E('ㄴ데')], pred: 'AC', yo: true, after: ['also'], morph: {}, role: 'background or contrast (…, and; but)' }),
  ec({ id: 'then', conn: 'then', cite: '-다가', forms: [B('다가')], pred: 'VP', after: ['also'], morph: {}, role: 'while doing, then; and then' }),
  ec({ id: 'as-soon-as', conn: 'as-soon-as', cite: '-자마자', forms: [B('자마자')], pred: 'V', morph: {}, role: 'as soon as' }),
  ec({ id: 'so-that', conn: 'so-that', cite: '-도록', forms: [B('도록')], pred: 'VA', morph: {}, role: 'so that; until' }),
  ec({ id: 'adverbial', conn: 'adverbial', cite: '-게', forms: [B('게')], pred: 'VA', after: EC_AFTER, morph: {}, role: 'so as to; -ly (before 되다 / 하다: become, make)' }),
  ec({ id: 'as-if', conn: 'as-if', cite: '-듯이', forms: [B('듯이')], pred: 'VACP', morph: {}, role: 'as if; just as' }),
  ec({ id: 'as-if-short', conn: 'as-if', cite: '-듯', forms: [B('듯')], pred: 'VACP', morph: {}, role: 'as if; just as' }),
  ec({ id: 'or', conn: 'or', cite: '-거나', forms: [B('거나')], pred: 'VACP', morph: {}, role: 'or' }),
  ec({ id: 'whether-or', conn: 'whether', cite: '-든지', forms: [B('든지')], pred: 'VACP', morph: {}, role: 'whether … or; whatever' }),
  ec({ id: 'whether-or-ga', conn: 'whether', cite: '-든가', forms: [B('든가')], pred: 'VACP', morph: {}, role: 'whether … or' }),
  ec({ id: 'because-formal', conn: 'because', cite: '-(으)므로', forms: [E('므로')], pred: 'VACP', morph: {}, role: 'because (formal)' }),
  ec({ id: 'because-busy', conn: 'because-busy', cite: '-느라고', forms: [B('느라고')], pred: 'V', morph: {}, role: 'because (busy) doing' }),
  ec({ id: 'because-busy-short', conn: 'because-busy', cite: '-느라', forms: [B('느라')], pred: 'V', morph: {}, role: 'because (busy) doing' }),
  ec({ id: 'the-more', conn: 'the-more', cite: '-(으)ㄹ수록', forms: [E('ㄹ수록')], pred: 'VAC', morph: {}, role: 'the more …, the more' }),
  ec({ id: 'deoni', conn: 'and-then', cite: '-더니', forms: [B('더니')], pred: 'VACP', morph: { Modality: 'Retrospective' }, role: 'and then (as the speaker saw); since' }),
  ec({ id: 'deorado', conn: 'even-if', cite: '-더라도', forms: [B('더라도')], pred: 'VACP', morph: {}, role: 'even if' }),
  ec({ id: 'neg', conn: 'neg', cite: '-지', forms: [B('지')], pred: 'VA', after: EC_AFTER, morph: {}, role: 'before 않다, 못하다, 말다 (negation)' }),
  ec({ id: 'inf', conn: 'inf', cite: '-아/-어', forms: [A('')], pred: 'VA', morph: {}, role: 'infinitive connective (before an auxiliary: -아/어 보다, 주다, 있다 …)' }),
  ec({ id: 'after', conn: 'after', cite: '-고서', forms: [B('고서')], pred: 'V', morph: {}, role: 'after (doing)' }),
  ec({ id: 'whether', conn: 'whether', cite: '-는지', forms: [B('는지')], pred: 'VP', exist: true, yo: true, morph: {}, role: 'whether; (I wonder) if' }),
  ec({ id: 'whether-adj', conn: 'whether', cite: '-(으)ㄴ지', forms: [E('ㄴ지')], pred: 'AC', yo: true, morph: {}, role: 'whether; (with time) since' }),
  ec({ id: 'whether-prosp', conn: 'whether', cite: '-(으)ㄹ지', forms: [E('ㄹ지')], pred: 'VACP', yo: true, noFut: true, morph: {}, role: 'whether (it will)' }),
  ec({ id: 'if-when', conn: 'if', cite: '-거든', forms: [B('거든')], pred: 'V', morph: {}, role: 'if, when (followed by a command or suggestion)' }),
  ec({ id: 'intend-formal', conn: 'intend', cite: '-고자', forms: [B('고자')], pred: 'V', morph: {}, role: 'in order to; wishing to (formal)' }),
  ec({ id: 'even-though', conn: 'even-if', cite: '-(으)ㄹ지라도', forms: [E('ㄹ지라도')], pred: 'VACP', morph: {}, role: 'even if (formal)' }),
  ec({ id: 'lit-rini', conn: 'since', cite: '-(으)리니', forms: [E('리니')], pred: 'VACP', lit: true, morph: { ...LIT }, role: 'literary: since (it) will (-(으)리니)' }),
  ec({ id: 'lit-geoneul', conn: 'although', cite: '-거늘', forms: [B('거늘')], pred: 'VACP', lit: true, morph: { ...LIT }, role: 'literary: although; since (-거늘)' }),
  ec({ id: 'lit-mae', conn: 'because', cite: '-(으)매', forms: [E('매')], pred: 'VACP', lit: true, morph: { ...LIT }, role: 'literary: because, as (-(으)매)' }),
  ec({ id: 'lit-doe', conn: 'saying', cite: '-(으)되', forms: [E('되')], pred: 'VAC', lit: true, morph: { ...LIT }, role: 'literary: saying (what follows); but (-(으)되)' }),
  ec({ id: 'lit-ljindae', conn: 'since', cite: '-(으)ㄹ진대', forms: [E('ㄹ진대')], pred: 'VACP', lit: true, morph: { ...LIT }, role: 'literary: since, if indeed (-(으)ㄹ진대)' }),
  ec({ id: 'lit-geondae', conn: 'as-i', cite: '-건대', forms: [B('건대')], pred: 'V', lit: true, morph: { ...LIT }, role: 'literary: as I (see, think) (-건대)' }),
  ec({ id: 'lit-sa', conn: 'and', cite: '-(으)사', forms: [E('사')], pred: 'V', lit: true, morph: { ...LIT, Honorific: 'Subj' }, role: 'literary honorific: and, having (-(으)사)' }),

  // ───────── indirect quotation (간접 인용) ─────────
  ec({ id: 'quote-da', conn: 'quote', cite: '-다고', forms: [B('다고')], pred: 'AP', yo: true, after: EC_AFTER, morph: { Quote: 'Ind', Mood: 'Ind' }, role: 'indirect quotation of a statement (that …)' }),
  ec({ id: 'quote-neunda', conn: 'quote', cite: '-ㄴ다고/-는다고', forms: [CV('는다고', 'ㄴ다고')], pred: 'V', yo: true, after: EC_AFTER, morph: { Quote: 'Ind', Mood: 'Ind' }, role: 'indirect quotation of a statement (that …)' }),
  ec({ id: 'quote-ra', conn: 'quote', cite: '-(이)라고', forms: [B('라고')], pred: 'CR', yo: true, after: EC_AFTER, morph: { Quote: 'Ind', Mood: 'Ind' }, role: 'indirect quotation of a statement (that … is)' }),
  ec({ id: 'quote-imp', conn: 'quote', cite: '-(으)라고', forms: [E('라고')], pred: 'V', yo: true, morph: { Quote: 'Ind', Mood: 'Imp' }, role: 'indirect quotation of a command (told to …)' }),
  ec({ id: 'quote-nya', conn: 'quote', cite: '-냐고', forms: [B('냐고')], pred: 'VACP', yo: true, morph: { Quote: 'Ind', Mood: 'Int' }, role: 'indirect quotation of a question (asked whether …)' }),
  ec({ id: 'quote-neunya', conn: 'quote', cite: '-느냐고', forms: [B('느냐고')], pred: 'VP', exist: true, yo: true, morph: { Quote: 'Ind', Mood: 'Int' }, role: 'indirect quotation of a question (asked whether …)' }),
  ec({ id: 'quote-ja', conn: 'quote', cite: '-자고', forms: [B('자고')], pred: 'V', yo: true, morph: { Quote: 'Ind', Mood: 'Prop' }, role: "indirect quotation of a suggestion (suggested that we …)" }),
  ef({ id: 'quote-dae', cite: '-대', forms: [B('대')], pred: 'AP', yo: true, morph: { Quote: 'Ind', Mood: 'Ind', SpeechLevel: 'Hae' }, role: 'reported statement (they say …; contraction of -다고 해)' }),
  ef({ id: 'quote-neundae', cite: '-ㄴ대/-는대', forms: [CV('는대', 'ㄴ대')], pred: 'V', yo: true, morph: { Quote: 'Ind', Mood: 'Ind', SpeechLevel: 'Hae' }, role: 'reported statement (they say …; contraction of -ㄴ다고 해)' }),
  ef({ id: 'quote-rae', cite: '-(이)래', forms: [B('래')], pred: 'CR', yo: true, morph: { Quote: 'Ind', Mood: 'Ind', SpeechLevel: 'Hae' }, role: 'reported statement (they say it is …; contraction of -(이)라고 해)' }),
  ef({ id: 'quote-eurae', cite: '-(으)래', forms: [E('래')], pred: 'V', yo: true, morph: { Quote: 'Ind', Mood: 'Imp', SpeechLevel: 'Hae' }, role: 'reported command (they told (me) to …)' }),
  ef({ id: 'quote-nyae', cite: '-냬', forms: [B('냬')], pred: 'VACP', yo: true, morph: { Quote: 'Ind', Mood: 'Int', SpeechLevel: 'Hae' }, role: 'reported question (they ask whether …)' }),
  ef({ id: 'quote-jae', cite: '-재', forms: [B('재')], pred: 'V', yo: true, morph: { Quote: 'Ind', Mood: 'Prop', SpeechLevel: 'Hae' }, role: "reported suggestion (they suggest we …)" }),
  etm({ id: 'quote-daneun', cite: '-다는', forms: [B('다는')], pred: 'AP', morph: { Quote: 'Ind' }, role: 'that says … (quotation before a noun)' }),
  etm({ id: 'quote-neundaneun', cite: '-ㄴ다는/-는다는', forms: [CV('는다는', 'ㄴ다는')], pred: 'V', morph: { Quote: 'Ind' }, role: 'that says … (quotation before a noun)' }),
  etm({ id: 'quote-raneun', cite: '-(이)라는', forms: [B('라는')], pred: 'C', morph: { Quote: 'Ind' }, role: 'called …; that is … (before a noun)' }),
  etm({ id: 'quote-euraneun', cite: '-(으)라는', forms: [E('라는')], pred: 'V', morph: { Quote: 'Ind', Mood: 'Imp' }, role: 'telling to … (before a noun)' }),
  etm({ id: 'quote-nyaneun', cite: '-냐는', forms: [B('냐는')], pred: 'VACP', morph: { Quote: 'Ind', Mood: 'Int' }, role: 'asking whether … (before a noun)' }),
  etm({ id: 'quote-janeun', cite: '-자는', forms: [B('자는')], pred: 'V', morph: { Quote: 'Ind', Mood: 'Prop' }, role: "suggesting that we … (before a noun)" }),
  ec({ id: 'quote-damyeon', conn: 'if', cite: '-다면', forms: [B('다면')], pred: 'AP', morph: { Quote: 'Ind' }, role: 'if (it is so that) …' }),
  ec({ id: 'quote-neundamyeon', conn: 'if', cite: '-ㄴ다면/-는다면', forms: [CV('는다면', 'ㄴ다면')], pred: 'V', morph: { Quote: 'Ind' }, role: 'if (it is so that) …' }),
  ec({ id: 'quote-ramyeon', conn: 'if', cite: '-(이)라면', forms: [B('라면')], pred: 'C', morph: { Quote: 'Ind' }, role: 'if it is …' }),

  // ───────── adnominal (관형사형 전성 어미) and nominalising (명사형 전성 어미) ─────────
  etm({ id: 'adn-neun', cite: '-는', forms: [B('는')], pred: 'V', exist: true, morph: { Tense: 'Pres' }, role: 'present adnominal (that does …, before a noun)' }),
  etm({ id: 'adn-n', cite: '-(으)ㄴ', forms: [E('ㄴ')], pred: 'VAC', morph: {}, role: 'adnominal (past on an action verb; present on a descriptive verb or the copula)' }),
  etm({ id: 'adn-l', cite: '-(으)ㄹ', forms: [E('ㄹ')], pred: 'VACP', noFut: true, morph: { Aspect: 'Prosp' }, role: 'prospective adnominal (that is to …, before a noun)' }),
  etm({ id: 'adn-ryeodeon', cite: '-(으)려던', forms: [E('려던')], pred: 'V', morph: { Tense: 'Past', Aspect: 'Imp' }, role: 'that (one) meant to … (before a noun)' }),
  etm({ id: 'adn-deon', cite: '-던', forms: [B('던')], pred: 'VACP', noFut: true, morph: { Tense: 'Past', Aspect: 'Imp' }, role: 'retrospective adnominal (that used to …, before a noun)' }),
  etn({ id: 'nmlz-gi', cite: '-기', forms: [B('기')], pred: 'VACP', after: 'nominal', morph: {}, role: 'nominaliser -기 (doing, to do)' }),
  etn({ id: 'nmlz-m', cite: '-(으)ㅁ', forms: [E('ㅁ')], pred: 'VACP', after: 'nominal', morph: {}, role: 'nominaliser -(으)ㅁ (the fact of …)' }),
];

export const ENDINGS_BY_ID: ReadonlyMap<string, KoEnding> = new Map(ENDINGS.map((e) => [e.id, e]));
export const koEnding = (id: string): KoEnding => {
  const e = ENDINGS_BY_ID.get(id);
  if (!e) throw new Error(`unknown Korean ending ${id}`);
  return e;
};

/** Plain-words names of the speech levels. */
export const SPEECH_LEVEL_NAMES: Readonly<Record<string, string>> = {
  Hae: 'informal (해체)', Haeyo: 'informal polite (해요체)', Hasipsio: 'formal polite (하십시오체)', Haera: 'plain (해라체)', Hage: 'familiar (하게체)', Hao: 'semi-formal (하오체)', Lit: 'literary (Bible and older prose)',
};
