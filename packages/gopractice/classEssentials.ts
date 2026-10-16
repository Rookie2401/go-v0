/**
 * Class Essentials: the fourteen topics every language class starts with, as a permanent saved deck in each of the six target
 * languages (Spanish, Albanian, Thai, Hindi, German, Norwegian Bokmål). A topic with several expressions is several cards; the numbers 1 to 10
 * are ten cards. 28 cards a language.
 *
 * The cards belong to the Saved decks system and are asked through the ordinary flashcard flow (a written-recognition card: the phrase
 * in the target language, "Recall the meaning", the meaning on the back, Hear word through GoListen). They need no Repository unit: the
 * phrase is the card, its unit id is `class:<language>:<phrase>`, and `classFacts` answers the exercise engine with the English meaning,
 * so the learner does not have to meet a phrase in GoLearn first. Those units are kept out of the ordinary queue, My vocab and the candidates.
 *
 * Thai and Hindi are in their own scripts. The flashcard format has no transliteration field, so none is stored.
 * The translations were written for this class; docs/ecosystem/CLASS-ESSENTIALS.md records which were checked against a dictionary and which
 * rest on the author's knowledge, and the deck's own `notes` say that no native speaker has reviewed them yet.
 */
import type { UnitFacts } from '../goreview/src/types';
import type { LinguisticUnit } from '../repository-contract/src';
import type { DeckEntry, SavedDeck } from './deckModel';

export const CLASS_ESSENTIALS_NAME = 'Class Essentials';
export const CLASS_ESSENTIALS_DESCRIPTION = 'Essential phrases for language class.';
export const CLASS_ESSENTIALS_NOTES = 'Written for this class and not yet reviewed by a native speaker. Thai and Hindi are in their own scripts; the cards carry no transliteration.';

export const CLASS_LANGUAGES = ['es', 'sq', 'th', 'hi', 'de', 'nb'] as const;
export type ClassLanguage = (typeof CLASS_LANGUAGES)[number];

/** One card: the topic number (1 to 14), the English meaning, and the phrase in each language. */
interface Row { topic: number; en: string; es: string; sq: string; th: string; hi: string; de: string; nb: string }

const ROWS: readonly Row[] = [
  { topic: 1, en: 'Hello', es: 'Hola', sq: 'Përshëndetje', th: 'สวัสดี', hi: 'नमस्ते', de: 'Hallo', nb: 'Hei' },
  { topic: 1, en: 'Goodbye', es: 'Adiós', sq: 'Mirupafshim', th: 'ลาก่อน', hi: 'अलविदा', de: 'Auf Wiedersehen', nb: 'Ha det bra' },
  { topic: 2, en: 'Please', es: 'Por favor', sq: 'Ju lutem', th: 'กรุณา', hi: 'कृपया', de: 'Bitte', nb: 'Vær så snill' },
  { topic: 2, en: 'Thank you', es: 'Gracias', sq: 'Faleminderit', th: 'ขอบคุณ', hi: 'धन्यवाद', de: 'Danke', nb: 'Takk' },
  { topic: 2, en: "I'm sorry", es: 'Lo siento', sq: 'Më vjen keq', th: 'ขอโทษ', hi: 'मुझे खेद है', de: 'Es tut mir leid', nb: 'Beklager' },
  { topic: 3, en: 'Excuse me', es: 'Disculpe', sq: 'Më falni', th: 'ขอโทษนะครับ/ค่ะ', hi: 'माफ़ कीजिए', de: 'Entschuldigung', nb: 'Unnskyld' },
  { topic: 4, en: 'One', es: 'Uno', sq: 'Një', th: 'หนึ่ง', hi: 'एक', de: 'Eins', nb: 'En' },
  { topic: 4, en: 'Two', es: 'Dos', sq: 'Dy', th: 'สอง', hi: 'दो', de: 'Zwei', nb: 'To' },
  { topic: 4, en: 'Three', es: 'Tres', sq: 'Tre', th: 'สาม', hi: 'तीन', de: 'Drei', nb: 'Tre' },
  { topic: 4, en: 'Four', es: 'Cuatro', sq: 'Katër', th: 'สี่', hi: 'चार', de: 'Vier', nb: 'Fire' },
  { topic: 4, en: 'Five', es: 'Cinco', sq: 'Pesë', th: 'ห้า', hi: 'पाँच', de: 'Fünf', nb: 'Fem' },
  { topic: 4, en: 'Six', es: 'Seis', sq: 'Gjashtë', th: 'หก', hi: 'छह', de: 'Sechs', nb: 'Seks' },
  { topic: 4, en: 'Seven', es: 'Siete', sq: 'Shtatë', th: 'เจ็ด', hi: 'सात', de: 'Sieben', nb: 'Syv' },
  { topic: 4, en: 'Eight', es: 'Ocho', sq: 'Tetë', th: 'แปด', hi: 'आठ', de: 'Acht', nb: 'Åtte' },
  { topic: 4, en: 'Nine', es: 'Nueve', sq: 'Nëntë', th: 'เก้า', hi: 'नौ', de: 'Neun', nb: 'Ni' },
  { topic: 4, en: 'Ten', es: 'Diez', sq: 'Dhjetë', th: 'สิบ', hi: 'दस', de: 'Zehn', nb: 'Ti' },
  { topic: 5, en: 'How much is this?', es: '¿Cuánto cuesta esto?', sq: 'Sa kushton kjo?', th: 'อันนี้เท่าไหร่', hi: 'यह कितने का है?', de: 'Wie viel kostet das?', nb: 'Hvor mye koster dette?' },
  { topic: 6, en: 'My name is…', es: 'Me llamo…', sq: 'Quhem…', th: 'ผม/ฉันชื่อ…', hi: 'मेरा नाम … है', de: 'Ich heiße…', nb: 'Jeg heter…' },
  { topic: 6, en: "I'm from…", es: 'Soy de…', sq: 'Jam nga…', th: 'ผม/ฉันมาจาก…', hi: 'मैं … से हूँ', de: 'Ich komme aus…', nb: 'Jeg kommer fra…' },
  { topic: 7, en: 'Where is the restroom?', es: '¿Dónde está el baño?', sq: 'Ku është tualeti?', th: 'ห้องน้ำอยู่ที่ไหน', hi: 'शौचालय कहाँ है?', de: 'Wo ist die Toilette?', nb: 'Hvor er toalettet?' },
  { topic: 8, en: 'Water', es: 'Agua', sq: 'Ujë', th: 'น้ำ', hi: 'पानी', de: 'Wasser', nb: 'Vann' },
  { topic: 8, en: 'Bottled water', es: 'Agua embotellada', sq: 'Ujë në shishe', th: 'น้ำดื่ม', hi: 'बोतल का पानी', de: 'Wasser in Flaschen', nb: 'Flaskevann' },
  { topic: 9, en: 'I would like…', es: 'Quisiera…', sq: 'Do të doja…', th: 'ผม/ฉันอยากได้…', hi: 'मुझे … चाहिए', de: 'Ich hätte gern…', nb: 'Jeg vil gjerne ha…' },
  { topic: 10, en: 'Do you speak English?', es: '¿Habla inglés?', sq: 'A flisni anglisht?', th: 'คุณพูดภาษาอังกฤษได้ไหม', hi: 'क्या आप अंग्रेज़ी बोलते हैं?', de: 'Sprechen Sie Englisch?', nb: 'Snakker du engelsk?' },
  { topic: 11, en: 'I do not understand', es: 'No entiendo', sq: 'Nuk kuptoj', th: 'ผม/ฉันไม่เข้าใจ', hi: 'मुझे समझ नहीं आया', de: 'Ich verstehe nicht', nb: 'Jeg forstår ikke' },
  { topic: 12, en: "I don't speak the country's language, but I would like to learn.", es: 'No hablo español, pero me gustaría aprender.', sq: 'Nuk flas shqip, por do të doja të mësoja.', th: 'ผม/ฉันพูดภาษาไทยไม่ได้ แต่อยากเรียน', hi: 'मैं हिंदी नहीं बोलता/बोलती, लेकिन सीखना चाहता/चाहती हूँ।', de: 'Ich spreche kein Deutsch, aber ich möchte es lernen.', nb: 'Jeg snakker ikke norsk, men jeg vil gjerne lære det.' },
  { topic: 13, en: 'Jesus is the Savior!', es: '¡Jesús es el Salvador!', sq: 'Jezusi është Shpëtimtari!', th: 'พระเยซูทรงเป็นพระผู้ช่วยให้รอด!', hi: 'यीशु उद्धारकर्ता हैं!', de: 'Jesus ist der Retter!', nb: 'Jesus er Frelseren!' },
  { topic: 14, en: 'One coffee, please!', es: '¡Un café, por favor!', sq: 'Një kafe, ju lutem!', th: 'ขอกาแฟหนึ่งแก้วครับ/ค่ะ', hi: 'एक कॉफ़ी दीजिए!', de: 'Einen Kaffee, bitte!', nb: 'En kaffe, takk!' },
];

const ALIASES: Record<string, ClassLanguage> = { no: 'nb', nob: 'nb', nn: 'nb' };

/** The class language a language id (`hi`, `sq-AL`, `no`, …) belongs to, or undefined when the deck is not offered for it. */
export function classLanguageOf(languageId: string): ClassLanguage | undefined {
  const base = languageId.split('-')[0].toLowerCase();
  const wanted = ALIASES[base] ?? base;
  return (CLASS_LANGUAGES as readonly string[]).includes(wanted) ? (wanted as ClassLanguage) : undefined;
}

export interface ClassCard { topic: number; english: string; phrase: string; unitId: string }

/** The cards of one language, in class order. No two cards share a unit id (a duplicate phrase would be dropped). */
export function classCards(languageId: string): ClassCard[] {
  const lang = classLanguageOf(languageId);
  if (!lang) return [];
  const seen = new Set<string>();
  const cards: ClassCard[] = [];
  for (const row of ROWS) {
    const phrase = row.topic === 4 ? row[lang].toLowerCase() : row[lang]; // the numbers are words, not sentences
    const unitId = `class:${lang}:${phrase}`;
    if (seen.has(unitId)) continue;
    seen.add(unitId);
    cards.push({ topic: row.topic, english: row.en, phrase, unitId });
  }
  return cards;
}

/** A unit of the Class Essentials deck: kept out of the ordinary queue, My vocab and the candidates. */
export const isClassUnit = (unitId: string): boolean => unitId.startsWith('class:');

export const classDeckId = (languageId: string): string => `class-essentials:${classLanguageOf(languageId) ?? languageId}`;

/** The saved deck for a language, with the flashcard cards as its items; undefined when the language has none. */
export function classDeckFor(languageId: string, varietyId: string | undefined, savedAt: string): SavedDeck | undefined {
  const cards = classCards(languageId);
  if (!cards.length) return undefined;
  const items: DeckEntry[] = cards.map((c) => ({
    itemId: `card:written-recognition:${c.unitId}`, unitId: c.unitId, unitKind: 'lexeme', label: c.phrase, dimension: 'written-recognition', family: 'written-recognition',
  }));
  return {
    id: classDeckId(languageId), savedAt, languageId: classLanguageOf(languageId)!, ...(varietyId ? { varietyId } : {}), items,
    name: CLASS_ESSENTIALS_NAME, description: CLASS_ESSENTIALS_DESCRIPTION, notes: CLASS_ESSENTIALS_NOTES, builtin: 'class-essentials',
  };
}

/** What the exercise engine is told about a Class Essentials phrase: the phrase, and its English meaning as the gloss. Nothing is invented beyond the table. */
export function classFacts(unitId: string, languageId: string): UnitFacts | undefined {
  if (!isClassUnit(unitId)) return undefined;
  const lang = classLanguageOf(languageId);
  const card = lang ? classCards(lang).find((c) => c.unitId === unitId) : undefined;
  if (!card || !lang) return undefined;
  const unit: LinguisticUnit = {
    unitId, kind: 'lexeme', languageId: lang, label: card.phrase, packId: 'class-essentials', packVersion: '1',
    provenance: { source: 'hand-lexicon', ref: 'class-essentials@1', confidence: 0.9, origin: 'pack-lexicon', validation: 'unreviewed' },
    status: 'provisional', createdAt: '2026-10-16T00:00:00.000Z',
  } as LinguisticUnit;
  return {
    unit, relations: [], analyses: [], status: 'provisional', lemma: card.phrase, glosses: [card.english], constructionIds: [], featureExplanations: {},
    siblingForms: [], exampleSentences: [], pronunciationNotes: [],
    // the meaning is the deck's own, so it counts as a word-list gloss (a long one, such as a whole sentence, is kept whole)
    lexiconGlossCount: 1,
  } as UnitFacts;
}
