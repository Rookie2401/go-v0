/**
 * Albanian phrase units: words that travel together or whose meaning is not the sum of the parts (greetings,
 * "për shembull", "me të vërtetë"), and verb + preposition frames. Package Q9a. Machine-drafted, not checked by a native
 * speaker: a unit I was not sure of is not here.
 *
 * A unit is a spec string; its words match a written form (lower case, in the Standard spelling with ë and ç) or any
 * word whose lemma it is (kam matches ka, kemi, kishte once the sentence layer has read the verb). Spec syntax, one
 * space between the words:
 *   word     the written form, or the lemma
 *   a|b|c    any one of these (the first names the learner item)
 *   _        any one word (a slot)
 *   ..       up to two small words may stand here (ADV, ADJ, DET, PART, NUM): "kam shumë frikë nga"
 *   ...      up to six tokens of any kind may stand here (jo vetëm ... por edhe)
 * A spec word that is a lemma matches every form of that word (kam: ka, kemi, kishte), so a unit that is right in some
 * forms only is written with those forms (si je|jeni, not si jam: "si është ai" is not "how are you").
 * The three rules of the seed adapter (sq.ts) come first and are unchanged: their `pattern` is the learner item's key.
 */
import type { PartOfSpeech } from '../../core';
import type { PhraseItem, PhraseRule } from '../shared';

type Kind = PhraseRule['kind'];
/** [spec, gloss, kind, display (defaults to the words of the spec)] */
type Unit = readonly [spec: string, gloss: string, kind: Kind, display?: string];

const MODIFIERS: PartOfSpeech[] = ['ADV', 'ADJ', 'DET', 'PART', 'NUM'];

/** The three rules the seed adapter had, unchanged (the checks of sq.test.ts). */
const SEED_RULES: PhraseRule[] = [
  { pattern: ['kur', 'jam', 'i', 'ri'], display: 'kur isha i ri', gloss: 'when I was young', kind: 'formula',
    variants: [['kur', 'jam', 'i', 'ri']] },
  { pattern: ['filloj', 'të', 'kuptoj'], display: 'filloj të kuptoj', gloss: 'I begin to understand', kind: 'construction',
    variants: [['filloj', 'të', 'kuptoj']] },
  { pattern: ['besoj', 'te', '_'], display: 'besoj te …', gloss: 'to believe in', kind: 'frame',
    variants: [['besoj', ['te', 'tek', 'në'], { slot: true }]] },
];

export const SQ_PHRASE_UNITS: readonly Unit[] = [
  // ── greetings, thanks, politeness
  ['natën e mirë', 'good night', 'formula'],
  ['ditën e mirë', 'have a good day', 'formula'],
  ['mbrëmjen e mirë', 'good evening', 'formula'],
  ['udhë të mbarë', 'safe travels; bon voyage', 'formula'],
  ['paç fat', 'good luck', 'formula'],
  ['gjithë të mirat', 'all the best', 'formula'],
  ['mirë se vini|erdhët|erdhe', 'welcome', 'formula', 'mirë se vini'],
  ['shumë faleminderit', 'thank you very much', 'formula'],
  ['ju lutem', 'please; I beg you (polite)', 'formula'],
  ['të lutem', 'please; I beg you (to one person you know well)', 'formula'],
  ['më vjen keq', 'I am sorry', 'formula'],
  ['më falni', 'excuse me (polite)', 'formula'],
  ['si je|jeni', 'how are you?', 'formula', 'si je / si jeni'],
  ['si quhesh|quheni', 'what is your name? (how are you called)', 'formula', 'si quhesh / si quheni'],
  ['quhem _', 'to be called …; my name is …', 'frame', 'quhem …'],
  ['sa vjeç je|jeni', 'how old are you?', 'formula', 'sa vjeç je'],
  ['nga je|jeni', 'where are you from?', 'formula', 'nga je'],
  ['sa është ora', 'what time is it?', 'formula'],
  ['në rregull', 'all right; in order', 'formula'],
  // ── fixed adverbials and connectors
  ['për shembull', 'for example', 'formula'],
  ['me të vërtetë', 'really; truly', 'formula'],
  ['në fakt', 'in fact', 'formula'],
  ['në përgjithësi', 'in general', 'formula'],
  ['me siguri', 'certainly; for sure', 'formula'],
  ['pa dyshim', 'without doubt', 'formula'],
  ['për fat të mirë', 'luckily', 'formula'],
  ['për fat të keq', 'unfortunately', 'formula'],
  ['për herë të parë', 'for the first time', 'formula'],
  ['në fillim', 'at the beginning', 'collocation'],
  ['në fund', 'in the end; at the end', 'collocation'],
  ['në të njëjtën kohë', 'at the same time', 'collocation'],
  ['në atë kohë', 'at that time', 'collocation'],
  ['pas pak', 'in a little while', 'collocation'],
  ['një herë e një kohë', 'once upon a time', 'formula'],
  ['një ditë', 'one day', 'collocation'],
  ['çdo ditë', 'every day', 'collocation'],
  ['çdo herë', 'every time', 'collocation'],
  ['me fjalë të tjera', 'in other words', 'formula'],
  ['e kështu me radhë', 'and so on', 'formula'],
  ['kështu që', 'so; and so', 'collocation'],
  ['në mënyrë që', 'so that', 'construction'],
  ['në qoftë se', 'if', 'construction'],
  ['para se', 'before (a clause)', 'construction'],
  ['sa herë që', 'whenever; every time that', 'construction'],
  ['me anë të', 'by means of', 'construction'],
  ['për shkak të', 'because of', 'construction'],
  ['në vend të', 'instead of', 'construction'],
  ['në lidhje me', 'in connection with; about', 'construction'],
  ['jo vetëm ... por edhe', 'not only … but also', 'construction', 'jo vetëm … por edhe'],
  ['sa më ... aq më', 'the more … the more', 'construction', 'sa më … aq më'],
  // ── light verbs and verbal idioms (the verb matches every inflected form)
  ['bie shi', 'it rains', 'idiom'],
  ['bie borë', 'it snows', 'idiom'],
  ['bëj ftohtë', 'it is cold (weather)', 'idiom', 'bën ftohtë'],
  ['bëj nxehtë', 'it is hot (weather)', 'idiom', 'bën nxehtë'],
  ['bëj një pyetje', 'to ask a question', 'collocation'],
  ['bëj një shëtitje', 'to go for a walk', 'collocation'],
  ['marr një vendim', 'to make a decision', 'collocation'],
  ['marr pjesë në _', 'to take part in', 'frame'],
  ['mbaj mend', 'to remember', 'idiom'],
  ['kam të drejtë', 'to be right', 'idiom'],
  ['kam kohë', 'to have time', 'collocation'],
  ['kam .. frikë nga _', 'to be afraid of', 'frame', 'kam frikë nga …'],
  ['kam .. nevojë për _', 'to need', 'frame', 'kam nevojë për …'],
  ['kam .. uri', 'to be hungry', 'idiom', 'kam uri'],
  ['kam .. etje', 'to be thirsty', 'idiom', 'kam etje'],
  ['më|të|i|na|ju|u pëlqej', 'I like it (it pleases me)', 'construction', 'më pëlqen'],
  ['më|të|i|na|ju|u duhet|duhen', 'I need (it is needed for me)', 'construction', 'më duhet'],
  // ── verb + preposition frames
  ['jam nga _', 'to be from', 'frame', 'jam nga …'],
  ['vij nga _', 'to come from', 'frame', 'vij nga …'],
  ['shkoj te|tek _', 'to go to (a person)', 'frame', 'shkoj te …'],
  ['mendoj për _', 'to think about', 'frame', 'mendoj për …'],
  ['flas me _', 'to speak with', 'frame', 'flas me …'],
  ['flas për _', 'to speak about', 'frame', 'flas për …'],
  ['pyes për _', 'to ask about', 'frame', 'pyes për …'],
  ['kujdesem për _', 'to take care of', 'frame', 'kujdesem për …'],
  ['pendohem për _', 'to repent of', 'frame', 'pendohem për …'],
  ['lutem për _', 'to pray for', 'frame', 'lutem për …'],
];

// ───────────────────────────── building the rules ─────────────────────────────

function parseUnit(spec: string): { pattern: string[]; items: PhraseItem[]; shown: string[] } {
  const pattern: string[] = [];
  const items: PhraseItem[] = [];
  const shown: string[] = [];
  for (const w of spec.trim().split(/\s+/u)) {
    if (w === '...') { items.push({ gap: 6 }); shown.push('…'); continue; }
    if (w === '..') { items.push({ gap: 2, only: MODIFIERS }); continue; }
    if (w === '_') { pattern.push('_'); items.push({ slot: true }); shown.push('…'); continue; }
    const alts = w.split('|');
    pattern.push(alts[0]);
    items.push(alts.length > 1 ? alts : alts[0]);
    shown.push(alts[0]);
  }
  return { pattern, items, shown };
}

export function buildSqPhraseRules(units: readonly Unit[] = SQ_PHRASE_UNITS): PhraseRule[] {
  return units.map(([spec, gloss, kind, display]) => {
    const u = parseUnit(spec);
    return { pattern: u.pattern, display: display ?? u.shown.join(' '), gloss, kind, variants: [u.items] };
  });
}

/** The rules the adapter matches: the three seed rules, then the fixed units and frames. */
export const SQ_PHRASE_RULES: PhraseRule[] = [...SEED_RULES, ...buildSqPhraseRules()];
