/**
 * Fixed expressions and compound function words of Russian (потому что, несмотря на, друг друга, иметь в виду ...), found as an EXTRA
 * layer over the words of a sentence: each word keeps its own readings; the phrase says that these words belong together.
 *
 * SOURCE RULE. An expression is listed only if it is a headword of the built dictionary (public/dict/ru, from Wiktionary via kaikki.org,
 * CC BY-SA 4.0) and its gloss is that dictionary's own, shortened at a comma. test/adapters/russian-phrases.test.ts checks this against
 * the dictionary on disk. The frames with an open slot (у _ есть) are not headwords: they are marked `kind: 'frame'` and carry a gloss
 * written for this adapter. MACHINE-DRAFTED; not reviewed by a native speaker.
 *
 * Matching: a headword's words must stand next to each other in this order and spelling (`в течение` is not `в течении`); in a verb
 * phrase the verb is matched by its lemma, so every form of it counts (иметь в виду → имею в виду). Where a phrase has a case-form
 * variation by nature (друг друга), the variants are written out.
 */
import type { AnalyzedToken, PartOfSpeech, PhraseCandidate, RawToken } from '../../core';
import { matchPhraseRules, type PhraseItem, type PhraseRule } from '../shared';
import { ruKey } from './text';

type Kind = PhraseCandidate['kind'];

export interface RuPhraseEntry {
  /** The headword as the dictionary spells it (a frame: the pattern with … for the slot). */
  text: string;
  /** The dictionary's part of speech for the headword. */
  pos: string;
  /** The dictionary's gloss, shortened (a frame that is not a headword: this adapter's own). */
  gloss: string;
  kind: Kind;
  /** True when the expression is NOT a dictionary headword (a pattern with a slot): the gloss is this adapter's own. */
  notHeadword?: boolean;
  /** The first word is a verb, matched by lemma. */
  verb?: boolean;
}

/** [headword, dictionary part of speech, dictionary gloss (shortened)] of every listed expression (generated from public/dict/ru). */
const LISTED: ReadonlyArray<readonly [string, string, string]> = [
  ['будьте добры', 'INTJ', 'please, would you be so kind'],
  ['будь здоров', 'INTJ', 'bless you, gesundheit'],
  ['будьте здоровы', 'INTJ', 'bless you, gesundheit'],
  ['всего хорошего', 'INTJ', 'all the best'],
  ['всего доброго', 'INTJ', 'all the best'],
  ['до свидания', 'INTJ', 'goodbye, see you later'],
  ['до встречи', 'INTJ', 'see you (later), goodbye'],
  ['до скорого', 'INTJ', 'see you soon'],
  ['добро пожаловать', 'INTJ', 'welcome!'],
  ['доброе утро', 'INTJ', 'good morning'],
  ['добрый день', 'INTJ', 'good day, good afternoon'],
  ['добрый вечер', 'INTJ', 'good evening'],
  ['доброй ночи', 'INTJ', 'good night'],
  ['спокойной ночи', 'INTJ', 'good night'],
  ['приятного аппетита', 'INTJ', 'bon appétit'],
  ['с днём рождения', 'INTJ', 'happy birthday'],
  ['с новым годом', 'INTJ', 'Happy New Year'],
  ['очень приятно', 'INTJ', 'pleased to meet you'],
  ['большое спасибо', 'INTJ', 'many thanks, thank you very much'],
  ['боже мой', 'INTJ', 'oh my God!'],
  ['ничего себе', 'INTJ', 'wow!'],
  ['как дела', 'X', 'how are you?; how is it going?'],
  ['ещё бы', 'INTJ', 'of course, sure, to be sure'],
  ['надо же', 'INTJ', 'Exclamation expressing surprise'],
  ['не так ли', 'INTJ', 'right; isn\'t it so?'],
  ['ваше здоровье', 'INTJ', 'cheers!'],
  ['в чём дело', 'X', 'what\'s up?'],
  ['всё в порядке', 'INTJ', 'no worries, not to worry, everything is fine'],
  ['и так далее', 'ADV', 'et cetera, and so forth, and so on'],
  ['и тому подобное', 'X', 'and so on, and the like, and that kind of thing'],
  ['короче говоря', 'INTJ', 'right; signpost word to change the subject in a discussion o'],
  ['в конце концов', 'ADV', 'at long last, in the end, finally, ultimately'],
  ['в общем', 'ADV', 'in general, generally, all in all, on the whole'],
  ['в основном', 'ADV', 'for the most part, by and large'],
  ['в первую очередь', 'ADV', 'first, first of all, first and foremost'],
  ['в последнее время', 'ADV', 'lately, of late, these days'],
  ['в самом деле', 'ADV', 'really, truly, indeed, quite'],
  ['в то же время', 'ADV', 'at the same time'],
  ['в том числе', 'ADV', 'including'],
  ['в целом', 'ADV', 'generally'],
  ['в частности', 'ADV', 'in particular'],
  ['в любом случае', 'ADV', 'in any case, anyway , whatsoever'],
  ['всё равно', 'ADV', 'it’s all the same; it doesn’t matter'],
  ['до сих пор', 'ADV', 'still, so far, yet, as yet, hitherto, up to now'],
  ['как правило', 'ADV', 'as a rule'],
  ['как раз', 'ADV', 'just, exactly'],
  ['кроме того', 'ADV', 'in addition'],
  ['может быть', 'ADV', 'maybe, perhaps, possibly'],
  ['должно быть', 'ADV', 'Used as a parenthetical to express a speaker\'s opinion'],
  ['на самом деле', 'ADV', 'as a matter of fact, in fact, in actual fact'],
  ['по крайней мере', 'ADV', 'at least, at any rate'],
  ['по меньшей мере', 'ADV', 'at least'],
  ['по очереди', 'ADV', 'in turn, one after another, taking turns'],
  ['прежде всего', 'ADV', 'first of all'],
  ['с тех пор', 'ADV', 'since that time, since then'],
  ['с одной стороны', 'ADV', 'on the one hand'],
  ['тем более', 'ADV', 'especially'],
  ['тем не менее', 'ADV', 'nevertheless'],
  ['то есть', 'ADV', 'that is, in other words, i.e.'],
  ['то и дело', 'ADV', 'now and then, every now and then'],
  ['только что', 'ADV', 'just, just now'],
  ['ни разу', 'ADV', 'not once'],
  ['ни за что', 'ADV', 'for free, for nothing'],
  ['раз и навсегда', 'ADV', 'once and for all'],
  ['само собой', 'ADV', 'by itself, naturally'],
  ['собственно говоря', 'ADV', 'actually, as a matter of fact, in fact'],
  ['с удовольствием', 'ADV', 'with pleasure'],
  ['на днях', 'ADV', 'one of these days'],
  ['тому назад', 'ADV', 'ago'],
  ['во что бы то ни стало', 'ADV', 'at all costs'],
  ['вместе с тем', 'ADV', 'at the same time'],
  ['по сути', 'ADV', 'in an essential manner; in essence; essentially'],
  ['как будто', 'ADV', 'kind of, quasi'],
  ['как бы', 'ADV', 'like, kind of, sort of'],
  ['как только', 'ADV', 'as soon as'],
  ['пока не', 'CONJ', 'unless, until'],
  ['потому что', 'CONJ', 'because'],
  ['так как', 'CONJ', 'as, since, because, inasmuch as'],
  ['так что', 'CONJ', 'so'],
  ['несмотря на', 'ADP', 'in spite of, despite'],
  ['в течение', 'ADP', 'during, within'],
  ['во время', 'ADP', 'during'],
  ['в связи с', 'ADJ', 'in connection with, due to'],
  ['в качестве', 'ADP', 'as'],
  ['в виде', 'ADP', 'in the form of, in the shape of'],
  ['в соответствии с', 'ADP', 'in accordance with'],
  ['по сравнению с', 'ADP', 'as compared with, as opposed to'],
  ['с помощью', 'ADP', 'via, by dint of ; using )'],
  ['за исключением', 'ADP', 'with the exception of, except, apart from'],
  ['не считая', 'ADP', 'not counting, apart from, exclusive of, less'],
  ['в результате', 'CONJ', 'as a result'],
  ['в то время как', 'CONJ', 'while, whereas, when'],
  ['после того как', 'CONJ', 'after'],
  ['до того как', 'CONJ', 'before, till'],
  ['до тех пор пока', 'ADV', 'so long as, as long as'],
  ['а также', 'CONJ', 'as well as'],
  ['а то', 'CONJ', 'otherwise, or else'],
  ['если бы', 'CONJ', 'if'],
  ['если только', 'CONJ', 'provided, provided that, providing, as long as'],
  ['лишь бы', 'PART', 'if only, provided that, so long as'],
  ['хотя бы', 'CONJ', 'though, even if, even though'],
  ['вряд ли', 'PART', 'I doubt it, unlikely, probably not'],
  ['вроде бы', 'PART', 'apparently, seemingly'],
  ['не то чтобы', 'PART', 'not that, not like, not as if'],
  ['не говоря уже о', 'CONJ', 'let alone, to say nothing of'],
  ['в итоге', 'CONJ', 'in the end'],
  ['в рамках', 'ADP', 'under, within'],
  ['в случае', 'ADP', 'in case of'],
  ['в целях', 'ADP', 'in order to'],
  ['в честь', 'ADP', 'in honour/honor of, after'],
  ['друг друга', 'PRON', 'one another, each other'],
  ['иметь в виду', 'VERB', 'to mean'],
  ['обращать внимание', 'VERB', 'to pay attention'],
  ['делать вид', 'VERB', 'to pretend, to affect'],
  ['сделать вид', 'VERB', 'pretend, affect'],
  ['вести себя', 'VERB', 'to behave'],
  ['брать себя в руки', 'VERB', 'to pull oneself together'],
  ['приходить в голову', 'VERB', 'to come to mind, to cross someone\'s mind'],
  ['прийти в голову', 'VERB', 'to come to mind, to cross someone\'s mind'],
  ['так называемый', 'ADJ', 'so-called'],
];

const IDIOMS = new Set(['брать себя в руки', 'приходить в голову', 'прийти в голову', 'во что бы то ни стало', 'раз и навсегда', 'то и дело', 'ни за что', 'само собой', 'вести себя', 'делать вид', 'сделать вид', 'иметь в виду', 'обращать внимание']);
const VERB_PHRASES = new Set(['брать себя в руки', 'приходить в голову', 'прийти в голову', 'вести себя', 'делать вид', 'сделать вид', 'иметь в виду', 'обращать внимание']);

/** Frames with a slot: not dictionary headwords (except меня зовут, whose headword exists but which takes a name after it). */
const FRAMES: readonly RuPhraseEntry[] = [
  { text: 'у … есть', pos: 'frame', gloss: 'someone has something (literally: by someone there is something)', kind: 'frame', notHeadword: true },
  { text: 'у … нет', pos: 'frame', gloss: 'someone does not have something (literally: by someone there is not)', kind: 'frame', notHeadword: true },
  { text: 'меня зовут …', pos: 'X', gloss: 'my name is …', kind: 'frame' },
];

export const RU_PHRASES: readonly RuPhraseEntry[] = [
  ...LISTED.map(([text, pos, gloss]): RuPhraseEntry => ({
    text, pos, gloss,
    kind: pos === 'INTJ' ? 'formula' : IDIOMS.has(text) ? 'idiom' : 'collocation',
    ...(VERB_PHRASES.has(text) ? { verb: true } : {}),
  })),
  ...FRAMES,
];

// ───────────────────────────── rules ─────────────────────────────

const words = (text: string): string[] => text.split(' ').filter((w) => w && w !== '…');
const CASE_FORMS_OF_DRUG = ['друга', 'другу', 'другом', 'друге'];
const NOMINAL: PartOfSpeech[] = ['NOUN', 'PROPN', 'PRON', 'ADJ', 'DET'];

function variantsOf(e: RuPhraseEntry): PhraseItem[][] {
  if (e.text === 'друг друга') {
    return [['друг', CASE_FORMS_OF_DRUG], ['друг', { gap: 1, only: ['ADP'] }, CASE_FORMS_OF_DRUG]];
  }
  if (e.text === 'у … есть' || e.text === 'у … нет') {
    const last = e.text.endsWith('есть') ? 'есть' : 'нет';
    const who: PhraseItem = { slot: true, pos: ['PRON', 'NOUN', 'PROPN'] };
    const mod: PhraseItem = { slot: true, pos: NOMINAL };
    // the owner: a pronoun or a noun, with up to two modifiers before it (у моего старшего брата есть …)
    return [['у', who, last], ['у', mod, who, last], ['у', mod, mod, who, last]];
  }
  if (e.text === 'меня зовут …') return [['меня', 'зовут', { slot: true, pos: ['PROPN', 'NOUN'] }]];
  if (e.text === 'обращать внимание') return [['обращать', ['внимание', 'внимания']], ['обратить', ['внимание', 'внимания']]];
  return [words(e.text)];
}

function patternOf(e: RuPhraseEntry): string[] {
  if (e.text.includes('…')) return e.text.split(' ').map((w) => (w === '…' ? '_' : w));
  return words(e.text);
}

const RULES: Array<{ rule: PhraseRule; entry: RuPhraseEntry }> = RU_PHRASES.map((entry) => ({
  entry,
  rule: { pattern: patternOf(entry), display: entry.text, gloss: entry.gloss, kind: entry.kind, variants: variantsOf(entry), confidence: entry.kind === 'frame' ? 0.8 : 0.9 },
}));
const BY_PATTERN = new Map(RULES.map(({ rule, entry }) => [rule.pattern.join('_'), entry]));

/** The phrases of one sentence, over the readings `analyze` gave. Every word of a phrase keeps its own readings. */
export function detectRuPhrases(tokens: RawToken[], analyses: AnalyzedToken[]): PhraseCandidate[] {
  const found = matchPhraseRules(tokens, analyses, RULES.map((r) => r.rule), ruKey);
  return found.filter((c) => {
    const entry = BY_PATTERN.get(c.pattern.join('_'));
    if (!entry || entry.kind === 'frame' || entry.text === 'друг друга') return true;
    // a fixed expression needs the very words: a lemma match must not turn в течение into в течении (a verb is matched by its lemma)
    const w = words(entry.text);
    return c.tokenIndexes.every((ti, k) => (k === 0 && entry.verb) || ruKey(tokens[ti].surface) === w[k] || (entry.text === 'обращать внимание' && k === 1));
  });
}
