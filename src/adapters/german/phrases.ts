/**
 * German phrase units: words that travel together or whose meaning is not the sum of the parts, and verb +
 * preposition frames with the case in the gloss. Machine-drafted, not native-reviewed.
 *
 * A unit is written as a spec string; its words match an inflected form through the lemma (haben matches habe, hat,
 * hatten), so the sentence layer must have read the verb. Spec syntax (one space between words):
 *   word       the written form (lower case), or any word whose lemma it is
 *   a|b|c      any one of these (the first one names the learner item)
 *   _          any one word (a slot)           _p   one pronoun
 *   ..         up to four content words may stand here (no verb, no punctuation): "recht" in "habe ganz recht"
 *   ...        up to eight tokens of any kind may stand here (nicht nur ... sondern auch)
 *   word~      up to two modifier words may follow (ADV, ADJ, DET, PART, NUM)
 *   x || y     alternative orders of the same unit (they share one learner item)
 *
 * A verb + preposition frame matches in main-clause order (verb ... preposition + noun phrase) and, for verbs that
 * never split, also in verb-final order (preposition + noun phrase ... verb): it matches across the German bracket.
 * A separable verb matches in the first order only: its two pieces carry the same lemma, so the second order would
 * count one occurrence twice.
 */
import type { PartOfSpeech } from '../../core';
import type { PhraseItem, PhraseRule } from '../shared';

type Kind = PhraseRule['kind'];
/** [spec, gloss, kind, display (defaults to the spec words)] */
type Unit = readonly [spec: string, gloss: string, kind: Kind, display?: string];

const CONTENT: PartOfSpeech[] = ['NOUN', 'PROPN', 'PRON', 'DET', 'ADJ', 'ADV', 'NUM', 'PART', 'ADP'];
const MODIFIERS: PartOfSpeech[] = ['DET', 'ADJ', 'ADV', 'PART', 'NUM'];

/** The three rules the old seed adapter had, unchanged (they are the checks of de.test.ts). */
const SEED_RULES: PhraseRule[] = [
  { pattern: ['als', '_', 'jung', 'sein'], display: 'als ich jung war', gloss: 'when I was young', kind: 'formula',
    variants: [['als', { slot: true, pos: ['PRON'] }, 'jung', 'sein']] },
  { pattern: ['anfangen', 'zu', 'verstehen'], display: 'anfangen … zu verstehen', gloss: 'to begin to understand', kind: 'construction',
    variants: [['anfangen', { gap: 8 }, 'zu', 'verstehen']] },
  { pattern: ['glauben', 'an', '_'], display: 'glauben an …', gloss: 'to believe in', kind: 'frame',
    variants: [['glauben', { gap: 4 }, 'an', { slot: true }], ['an', { slot: true, pos: ['PRON', 'PROPN', 'NOUN'] }, 'glauben']] },
];

export const PHRASE_UNITS: readonly Unit[] = [
  // ── greetings, thanks, politeness
  ['guten morgen', 'good morning', 'formula'],
  ['guten tag', 'hello; good day', 'formula'],
  ['guten abend', 'good evening', 'formula'],
  ['gute nacht', 'good night', 'formula'],
  ['auf wiedersehen', 'goodbye', 'formula'],
  ['bis bald', 'see you soon', 'formula'],
  ['bis später', 'see you later', 'formula'],
  ['bis morgen', 'see you tomorrow', 'formula'],
  ['vielen dank', 'thank you very much', 'formula'],
  ['danke schön', 'thank you (very much)', 'formula'],
  ['bitte schön', 'here you are; you are welcome', 'formula'],
  ['bitte sehr', 'here you are; you are welcome', 'formula'],
  ['herzlich willkommen', 'a warm welcome', 'formula'],
  ['herzlichen glückwunsch', 'congratulations', 'formula'],
  ['gute besserung', 'get well soon', 'formula'],
  ['alles gute', 'all the best', 'formula'],
  ['viel glück', 'good luck', 'formula'],
  ['viel spaß', 'have fun', 'formula'],
  ['guten appetit', 'enjoy your meal', 'formula'],
  ['zum wohl', 'cheers', 'formula'],
  ['wie bitte', 'pardon? what did you say?', 'formula'],
  ['es tun|tut _p~ leid || tun|tut _p~ leid','I am sorry (it does me sorrow)', 'formula', 'es tut mir leid'],
  ['wie gehen|geht es _p', 'how are you?', 'formula', 'wie geht es dir / Ihnen'],
  ['es gehen|geht _p gut', 'I am well (it goes well for me)', 'formula', 'es geht mir gut'],
  ['es gehen|geht _p schlecht', 'I am not well (it goes badly for me)', 'formula', 'es geht mir schlecht'],
  ['was sein|ist los', 'what is the matter?', 'formula'],
  ['kein problem', 'no problem', 'formula'],
  ['keine ahnung', 'no idea', 'formula'],
  ['na ja', 'well; oh well', 'formula'],
  ['ach so', 'oh, I see', 'formula'],
  ['gott sein|sei dank', 'thank God', 'formula', 'Gott sei Dank'],
  ['um himmels willen', 'for heaven\'s sake', 'idiom'],
  ['mein gott', 'my God; good grief', 'formula'],
  ['ich hätte|haben gern|gerne', 'I would like (a polite request)', 'formula', 'ich hätte gern'],
  ['ich möchte|möchten', 'I would like', 'formula'],
  ['wie heißen _p', 'what is your name? (how are you called)', 'formula', 'wie heißt du / heißen Sie'],
  ['wie spät sein|ist es', 'what time is it?', 'formula'],
  ['wie lange', 'how long', 'collocation'],
  ['wie oft', 'how often', 'collocation'],
  ['wie viele', 'how many', 'collocation'],
  ['wie viel', 'how much', 'collocation'],
  // ── fixed adverbials and connectors
  ['zum beispiel', 'for example', 'formula'],
  ['zum glück', 'luckily; fortunately', 'formula'],
  ['zum schluss', 'finally; in the end', 'formula'],
  ['zum teil', 'partly; in part', 'formula'],
  ['zum ersten mal', 'for the first time', 'formula'],
  ['auf jeden fall', 'in any case; definitely', 'formula'],
  ['auf keinen fall', 'under no circumstances', 'formula'],
  ['auf einmal', 'suddenly; all at once', 'formula'],
  ['auf der anderen seite', 'on the other hand', 'formula'],
  ['auf der einen seite', 'on the one hand', 'formula'],
  ['am anfang', 'at the beginning', 'collocation'],
  ['am ende', 'at the end; in the end', 'collocation'],
  ['am wochenende', 'at the weekend', 'collocation'],
  ['am besten', 'best; the best way', 'collocation'],
  ['am liebsten', 'most of all (what one likes best)', 'collocation'],
  ['am meisten', 'the most', 'collocation'],
  ['im moment', 'at the moment', 'collocation'],
  ['im augenblick', 'at the moment', 'collocation'],
  ['im grunde', 'basically; at bottom', 'formula'],
  ['im allgemeinen', 'in general', 'formula'],
  ['im gegenteil', 'on the contrary', 'formula'],
  ['im übrigen', 'by the way; moreover', 'formula'],
  ['in der nähe', 'nearby; in the vicinity', 'collocation'],
  ['in ordnung', 'all right; in order', 'formula'],
  ['in zukunft', 'in the future', 'collocation'],
  ['in der tat', 'indeed; in fact', 'formula'],
  ['in diesem fall', 'in this case', 'collocation'],
  ['vor allem', 'above all; especially', 'formula'],
  ['vor kurzem', 'recently; a short while ago', 'collocation'],
  ['nach hause', 'home (going home)', 'collocation'],
  ['zu hause', 'at home', 'collocation'],
  ['zu fuß', 'on foot', 'collocation'],
  ['zu beginn', 'at the start', 'collocation'],
  ['zur zeit', 'at present', 'collocation'],
  ['von zeit zu zeit', 'from time to time', 'idiom'],
  ['von nun an', 'from now on', 'formula'],
  ['ab und zu', 'now and then', 'idiom'],
  ['hin und wieder', 'now and then', 'idiom'],
  ['nach und nach', 'little by little', 'idiom'],
  ['mit der zeit', 'in time; as time goes on', 'collocation'],
  ['ganz und gar', 'completely; entirely', 'idiom'],
  ['nach wie vor', 'still; as before', 'idiom'],
  ['immer noch', 'still', 'formula'],
  ['noch nicht', 'not yet', 'formula'],
  ['noch nie', 'never (so far)', 'formula'],
  ['noch einmal|mal', 'once more; again', 'formula', 'noch einmal'],
  ['gar nicht', 'not at all', 'formula'],
  ['gar nichts', 'nothing at all', 'formula'],
  ['schon wieder', 'yet again', 'formula'],
  ['nicht mehr', 'no longer; not any more', 'formula'],
  ['bis jetzt', 'until now; so far', 'formula'],
  ['bis heute', 'to this day', 'formula'],
  ['seit langem', 'for a long time (up to now)', 'collocation'],
  ['seit kurzem', 'for a short while; recently', 'collocation'],
  ['ein bisschen', 'a little; a bit', 'formula'],
  ['ein paar', 'a few', 'formula'],
  ['ein wenig', 'a little', 'formula'],
  ['meiner meinung nach', 'in my opinion', 'formula'],
  ['unter anderem', 'among other things', 'formula'],
  ['und so weiter', 'and so on (usw.)', 'formula'],
  ['wie gesagt', 'as I said', 'formula'],
  ['aus diesem grund', 'for this reason', 'formula'],
  ['so weit', 'so far; as far as', 'collocation'],
  ['so _ wie möglich', 'as … as possible', 'construction', 'so … wie möglich'],
  ['es sein|sei denn', 'unless', 'idiom', 'es sei denn'],
  ['das heißen|heißt', 'that is (d. h.)', 'formula'],
  ['nicht nur ... sondern auch', 'not only … but also', 'construction', 'nicht nur … sondern auch'],
  ['entweder ... oder', 'either … or', 'construction', 'entweder … oder'],
  ['weder ... noch', 'neither … nor', 'construction', 'weder … noch'],
  ['sowohl ... als auch', 'both … and', 'construction', 'sowohl … als auch'],
  ['je ... desto|umso', 'the more … the more', 'construction', 'je … desto'],
  // ── light verbs and verbal idioms (the verb matches every inflected form)
  ['es geben || geben es', 'there is; there are', 'construction', 'es gibt'],
  ['es gehen|geht um', 'it is about; it concerns', 'construction', 'es geht um …'],
  ['es handeln|handelt .. um', 'it is a question of; it concerns', 'construction', 'es handelt sich um …'],
  ['es ankommen|kommt auf .. an', 'it depends on', 'construction', 'es kommt auf … an'],
  ['haben .. recht', 'to be right', 'idiom', 'recht haben'],
  ['haben .. angst vor _', 'to be afraid of (vor + dative)', 'idiom', 'Angst haben vor …'],
  ['haben .. hunger', 'to be hungry', 'idiom', 'Hunger haben'],
  ['haben .. durst', 'to be thirsty', 'idiom', 'Durst haben'],
  ['haben .. lust', 'to feel like (doing something)', 'idiom', 'Lust haben'],
  ['haben .. zeit', 'to have time', 'collocation', 'Zeit haben'],
  ['haben .. gern|gerne', 'to be fond of; to like', 'idiom', 'gern haben'],
  ['machen .. spaß', 'to be fun', 'idiom', 'Spaß machen'],
  ['machen .. sorgen', 'to worry (sich Sorgen machen)', 'idiom', 'sich Sorgen machen'],
  ['machen .. fehler', 'to make a mistake', 'collocation', 'einen Fehler machen'],
  ['geben .. mühe', 'to make an effort (sich Mühe geben)', 'idiom', 'sich Mühe geben'],
  ['geben .. auskunft', 'to give information', 'collocation', 'Auskunft geben'],
  ['sagen .. bescheid', 'to let someone know', 'idiom', 'Bescheid sagen'],
  ['wissen .. bescheid', 'to be informed; to know about it', 'idiom', 'Bescheid wissen'],
  ['nehmen .. platz', 'to take a seat', 'collocation', 'Platz nehmen'],
  ['nehmen .. abschied', 'to say goodbye', 'collocation', 'Abschied nehmen'],
  ['nehmen .. rücksicht auf _', 'to show consideration for (auf + accusative)', 'collocation', 'Rücksicht nehmen auf …'],
  ['nehmen .. in kauf', 'to accept; to put up with', 'idiom', 'in Kauf nehmen'],
  ['spielen .. rolle', 'to play a part; to matter', 'idiom', 'eine Rolle spielen'],
  ['stellen .. frage', 'to ask a question', 'collocation', 'eine Frage stellen'],
  ['treffen .. entscheidung', 'to make a decision', 'collocation', 'eine Entscheidung treffen'],
  ['stehen .. zur verfügung', 'to be available', 'collocation', 'zur Verfügung stehen'],
  ['stellen .. zur verfügung', 'to make available', 'collocation', 'zur Verfügung stellen'],
  ['kommen .. in frage', 'to be possible; to come into question', 'idiom', 'in Frage kommen'],
  ['stellen .. in frage', 'to call into question', 'idiom', 'in Frage stellen'],
  ['gehen .. zu ende', 'to come to an end', 'idiom', 'zu Ende gehen'],
  ['fahren .. auto', 'to drive (a car)', 'collocation', 'Auto fahren'],
  ['fahren .. rad', 'to ride a bicycle', 'collocation', 'Rad fahren'],
];

/** [verb, preposition, case, gloss, flags]; flags: r = reflexive, s = separable. */
type Frame = readonly [verb: string, prep: string, kase: 'acc' | 'dat', gloss: string, flags?: string];

export const PREPOSITION_FRAMES: readonly Frame[] = [
  ['warten', 'auf', 'acc', 'to wait for'],
  ['denken', 'an', 'acc', 'to think of; to think about'],
  ['freuen', 'auf', 'acc', 'to look forward to', 'r'],
  ['freuen', 'über', 'acc', 'to be glad about', 'r'],
  ['bitten', 'um', 'acc', 'to ask for'],
  ['sprechen', 'mit', 'dat', 'to speak with'],
  ['sprechen', 'über', 'acc', 'to speak about'],
  ['reden', 'über', 'acc', 'to talk about'],
  ['interessieren', 'für', 'acc', 'to be interested in', 'r'],
  ['teilnehmen', 'an', 'dat', 'to take part in', 's'],
  ['erinnern', 'an', 'acc', 'to remember', 'r'],
  ['kümmern', 'um', 'acc', 'to take care of', 'r'],
  ['gehören', 'zu', 'dat', 'to belong to'],
  ['träumen', 'von', 'dat', 'to dream of'],
  ['fragen', 'nach', 'dat', 'to ask about'],
  ['antworten', 'auf', 'acc', 'to answer'],
  ['achten', 'auf', 'acc', 'to pay attention to'],
  ['hoffen', 'auf', 'acc', 'to hope for'],
  ['danken', 'für', 'acc', 'to thank for (the person is dative)'],
  ['sorgen', 'für', 'acc', 'to take care of; to provide for'],
  ['beten', 'für', 'acc', 'to pray for'],
  ['beten', 'zu', 'dat', 'to pray to'],
  ['vertrauen', 'auf', 'acc', 'to trust in'],
  ['verlassen', 'auf', 'acc', 'to rely on', 'r'],
  ['vorbereiten', 'auf', 'acc', 'to prepare for', 'rs'],
  ['beschäftigen', 'mit', 'dat', 'to be busy with', 'r'],
  ['entscheiden', 'für', 'acc', 'to decide on; to choose', 'r'],
  ['ärgern', 'über', 'acc', 'to be annoyed about', 'r'],
  ['wundern', 'über', 'acc', 'to be surprised at', 'r'],
  ['unterhalten', 'mit', 'dat', 'to have a conversation with', 'r'],
  ['verlieben', 'in', 'acc', 'to fall in love with', 'r'],
  ['abhängen', 'von', 'dat', 'to depend on', 's'],
  ['leiden', 'an', 'dat', 'to suffer from (an illness)'],
  ['leiden', 'unter', 'dat', 'to suffer from (a situation)'],
  ['erzählen', 'von', 'dat', 'to tell about'],
  ['halten', 'von', 'dat', 'to think of (an opinion)'],
  ['halten', 'für', 'acc', 'to consider to be'],
  ['lachen', 'über', 'acc', 'to laugh about'],
  ['bedanken', 'für', 'acc', 'to say thanks for', 'r'],
  ['bestehen', 'aus', 'dat', 'to consist of'],
  ['bestehen', 'auf', 'dat', 'to insist on'],
  ['beginnen', 'mit', 'dat', 'to begin with'],
  ['anfangen', 'mit', 'dat', 'to begin with', 's'],
  ['aufhören', 'mit', 'dat', 'to stop (doing)', 's'],
  ['gewöhnen', 'an', 'acc', 'to get used to', 'r'],
  ['verzichten', 'auf', 'acc', 'to do without; to give up'],
  ['zweifeln', 'an', 'dat', 'to doubt'],
  ['suchen', 'nach', 'dat', 'to search for'],
  ['sehnen', 'nach', 'dat', 'to long for', 'r'],
  ['fürchten', 'vor', 'dat', 'to be afraid of', 'r'],
  ['warnen', 'vor', 'dat', 'to warn against'],
  ['nachdenken', 'über', 'acc', 'to think about; to reflect on', 's'],
  ['diskutieren', 'über', 'acc', 'to discuss'],
  ['berichten', 'über', 'acc', 'to report on'],
  ['informieren', 'über', 'acc', 'to inform about'],
  ['bewerben', 'um', 'acc', 'to apply for', 'r'],
  ['kämpfen', 'um', 'acc', 'to fight for'],
  ['kämpfen', 'gegen', 'acc', 'to fight against'],
  ['konzentrieren', 'auf', 'acc', 'to concentrate on', 'r'],
  ['reagieren', 'auf', 'acc', 'to react to'],
  ['aufpassen', 'auf', 'acc', 'to look after; to watch out for', 's'],
  ['einladen', 'zu', 'dat', 'to invite to', 's'],
  ['gratulieren', 'zu', 'dat', 'to congratulate on'],
  ['riechen', 'nach', 'dat', 'to smell of'],
  ['passen', 'zu', 'dat', 'to suit; to go with'],
  ['führen', 'zu', 'dat', 'to lead to'],
];

// ───────────────────────────── building the rules ─────────────────────────────

interface Parsed { pattern: string[]; items: PhraseItem[]; shown: string[] }

function parseVariant(spec: string): Parsed {
  const pattern: string[] = [];
  const items: PhraseItem[] = [];
  const shown: string[] = [];
  for (const raw of spec.trim().split(/\s+/u)) {
    let w = raw;
    let modifiers = false;
    if (w.endsWith('~')) { modifiers = true; w = w.slice(0, -1); }
    if (w === '...') { items.push({ gap: 8 }); shown.push('…'); continue; }
    if (w === '..') { items.push({ gap: 4, only: CONTENT }); shown.push('…'); continue; }
    if (w === '_') { pattern.push('_'); items.push({ slot: true }); shown.push('…'); } else if (w === '_p') {
      pattern.push('_'); items.push({ slot: true, pos: ['PRON'] }); shown.push('…');
    } else {
      const alts = w.split('|');
      pattern.push(alts[0]);
      items.push(alts.length > 1 ? alts : alts[0]);
      shown.push(alts[0]);
    }
    if (modifiers) items.push({ gap: 2, only: MODIFIERS });
  }
  return { pattern, items, shown };
}

export function buildPhraseRules(units: readonly Unit[] = PHRASE_UNITS): PhraseRule[] {
  return units.map(([spec, gloss, kind, display]) => {
    const variants = spec.split('||').map(parseVariant);
    const first = variants[0];
    return { pattern: first.pattern, display: display ?? first.shown.join(' '), gloss, kind, variants: variants.map((v) => v.items) };
  });
}

/** The spellings a preposition has with its article (am = an + dem): any of them stands for the preposition. */
const PREPOSITION_FORMS: Record<string, string[]> = {
  an: ['an', 'am', 'ans'], auf: ['auf', 'aufs'], in: ['in', 'im', 'ins'], für: ['für', 'fürs'], zu: ['zu', 'zum', 'zur'],
  von: ['von', 'vom'], bei: ['bei', 'beim'], über: ['über', 'übers'], um: ['um', 'ums'], vor: ['vor', 'vorm', 'vors'],
};

export function buildFrameRules(frames: readonly Frame[] = PREPOSITION_FRAMES): PhraseRule[] {
  return frames.map(([verb, prep, kase, gloss, flags = '']) => {
    const reflexive = flags.includes('r');
    const separable = flags.includes('s');
    const verbItem: PhraseItem = reflexive ? [verb, `sich ${verb}`] : verb;
    const prepItem: PhraseItem = PREPOSITION_FORMS[prep] ?? prep;
    const verbFirst: PhraseItem[] = [verbItem, { gap: 4, only: CONTENT }, prepItem, { slot: true }];
    const verbLast: PhraseItem[] = [prepItem, { slot: true }, { gap: 3, only: CONTENT }, verbItem];
    return {
      pattern: [verb, prep, '_'],
      display: `${reflexive ? 'sich ' : ''}${verb} ${prep} …`,
      gloss: `${gloss} (${prep} + ${kase === 'acc' ? 'accusative' : 'dative'})`,
      kind: 'frame' as const,
      variants: separable ? [verbFirst] : [verbFirst, verbLast],
    };
  });
}

/** The rules the adapter matches: the three seed rules, the fixed units and the verb + preposition frames. */
export const GERMAN_PHRASE_RULES: PhraseRule[] = [...SEED_RULES, ...buildPhraseRules(), ...buildFrameRules()];
