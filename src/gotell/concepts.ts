/**
 * GoTell concept tables — small, explicit, per-language.
 *
 * One table drives four features (all metadata / safety, never content generation):
 *   1. meaningChange: key terms (know / believe / trust / repent / regret / guilt / conviction /
 *      salvation / forgiveness / grace / sin / faith) must never be swapped silently.
 *   2. semantic section tagging of testimony sentences (metadata only, confidence recorded).
 *   3. `theological` flag — used by tests / UI to recognise doctrinal items.
 *   4. intent(): English keyword -> concept -> the wording the learner already knows.
 *
 * TODO(review): the per-language stems/forms/lexemes below are a starter set written for the
 * fixture corpora. Every language's table needs a native-speaker pass before release. Matching is
 * deliberately conservative (prefix stems; exact forms; Thai uses substring because it has no spaces).
 */
import type { LanguageCode, SemanticSection } from '../core';

export type ConceptId =
  | 'young' | 'family' | 'jesus' | 'know' | 'understand' | 'sin' | 'guilt' | 'conviction' | 'repent'
  | 'regret' | 'forgive' | 'grace' | 'salvation' | 'believe' | 'faith' | 'trust' | 'change' | 'now' | 'share';

export interface ConceptMeta {
  id: ConceptId;
  /** Exact lowercase English words that signal the concept in an intent request. */
  english: string[];
  /** Key terms: a suggestion that adds/removes/swaps one carries a meaningChange flag. */
  keyTerm: boolean;
  /** Doctrinal vocabulary (used to audit that beginners are not handed unencountered theology). */
  theological: boolean;
  /** Section hits [section, weight] used by the semantic tagger. */
  sections: Array<[SemanticSection, number]>;
}

export const CONCEPTS: Record<ConceptId, ConceptMeta> = {
  young: { id: 'young', english: ['young', 'child', 'childhood', 'kid', 'little'], keyTerm: false, theological: false, sections: [['childhood', 2]] },
  family: { id: 'family', english: ['family', 'parents', 'mother', 'father', 'born'], keyTerm: false, theological: false, sections: [['background', 1]] },
  jesus: { id: 'jesus', english: ['jesus', 'christ', 'god', 'church', 'bible', 'gospel'], keyTerm: false, theological: false, sections: [['knowledge-of-christianity', 1]] },
  know: { id: 'know', english: ['know', 'knew', 'known'], keyTerm: true, theological: false, sections: [] },
  understand: { id: 'understand', english: ['understand', 'understood', 'understanding'], keyTerm: false, theological: false, sections: [['understanding-of-sin', 0.5]] },
  sin: { id: 'sin', english: ['sin', 'sins', 'sinned', 'sinful', 'sinner'], keyTerm: true, theological: true, sections: [['understanding-of-sin', 2]] },
  guilt: { id: 'guilt', english: ['guilt', 'guilty'], keyTerm: true, theological: true, sections: [['conviction', 2]] },
  conviction: { id: 'conviction', english: ['convicted', 'conviction', 'convinced'], keyTerm: true, theological: true, sections: [['conviction', 2]] },
  repent: { id: 'repent', english: ['repent', 'repented', 'repentance'], keyTerm: true, theological: true, sections: [['repentance', 2]] },
  regret: { id: 'regret', english: ['regret', 'regretted', 'sorry'], keyTerm: true, theological: true, sections: [['repentance', 1]] },
  forgive: { id: 'forgive', english: ['forgive', 'forgave', 'forgiven', 'forgiveness'], keyTerm: true, theological: true, sections: [['forgiveness', 2]] },
  grace: { id: 'grace', english: ['grace', 'gracious', 'mercy'], keyTerm: true, theological: true, sections: [['grace', 2]] },
  salvation: { id: 'salvation', english: ['salvation', 'saved', 'save', 'savior', 'saviour'], keyTerm: true, theological: true, sections: [['grace', 1], ['faith', 1]] },
  believe: { id: 'believe', english: ['believe', 'believed', 'believing'], keyTerm: true, theological: true, sections: [['faith', 2]] },
  faith: { id: 'faith', english: ['faith'], keyTerm: true, theological: true, sections: [['faith', 1], ['present-faith', 1]] },
  trust: { id: 'trust', english: ['trust', 'trusted'], keyTerm: true, theological: true, sections: [['faith', 1]] },
  change: { id: 'change', english: ['change', 'changed', 'new'], keyTerm: false, theological: false, sections: [['transformation', 2]] },
  now: { id: 'now', english: ['now', 'today', 'daily'], keyTerm: false, theological: false, sections: [['present-faith', 1]] },
  share: { id: 'share', english: ['share', 'tell', 'testimony'], keyTerm: false, theological: false, sections: [['why-sharing', 2]] },
};

export const CONCEPT_IDS = Object.keys(CONCEPTS) as ConceptId[];

interface LangEntry {
  /** Prefix stems on the normalized form / lemma (Thai: substring). */
  stems?: string[];
  /** Exact normalized forms. */
  forms?: string[];
  /** Preferred wordings used by intent(), most neutral first. Single tokens. */
  lexemes: string[];
}

type LangTable = Partial<Record<ConceptId, LangEntry>>;

const TABLES: Record<LanguageCode, LangTable> = {
  es: {
    young: { stems: ['joven', 'niñ', 'pequeñ', 'infanci'], lexemes: ['joven'] },
    family: { stems: ['famili', 'padres', 'madre', 'hermano'], lexemes: ['familia'] },
    jesus: { forms: ['jesús', 'jesus', 'cristo', 'dios', 'iglesia', 'biblia'], lexemes: ['Jesús'] },
    know: { forms: ['sé', 'supe'], stems: ['sabe', 'sabí', 'conoc', 'conozc'], lexemes: ['conocer', 'saber'] },
    understand: { stems: ['entend', 'entiend', 'comprend', 'comprens'], lexemes: ['entender', 'comprender'] },
    sin: { stems: ['pecad', 'pecar', 'pecab'], forms: ['peco', 'pequé'], lexemes: ['pecado'] },
    guilt: { stems: ['culp'], lexemes: ['culpa'] },
    conviction: { stems: ['convicc', 'convenc'], lexemes: ['convicción'] },
    repent: { stems: ['arrepent', 'arrepint'], lexemes: ['arrepentirse'] },
    regret: { stems: ['lament', 'remordim'], lexemes: ['lamentar'] },
    forgive: { stems: ['perdon', 'perdón'], lexemes: ['perdonar', 'perdón'] },
    grace: { forms: ['gracia'], lexemes: ['gracia'] },
    salvation: { stems: ['salvaci', 'salvar', 'salvó', 'salvad', 'salvador'], lexemes: ['salvación'] },
    believe: { forms: ['creer', 'creo', 'crees', 'cree', 'creemos', 'creen', 'creía', 'creías', 'creíamos', 'creían', 'creí', 'creyó', 'creyeron'], stems: ['creyen'], lexemes: ['creer'] },
    faith: { forms: ['fe'], lexemes: ['fe'] },
    trust: { stems: ['confia', 'confío'], lexemes: ['confiar'] },
    change: { stems: ['cambi', 'nuev'], lexemes: ['cambiar'] },
    now: { forms: ['ahora', 'hoy', 'actualmente'], lexemes: ['ahora'] },
    share: { stems: ['compart'], lexemes: ['compartir'] },
  },
  sq: {
    young: { stems: ['vogël', 'vogel', 'fëmij', 'femij', 'rini'], lexemes: ['vogël'] },
    family: { stems: ['familj', 'prind'], lexemes: ['familje'] },
    jesus: { stems: ['jezu', 'krisht', 'perëndi', 'perendi', 'bibël', 'bibel'], forms: ['zot', 'zoti'], lexemes: ['Jezusi'] },
    know: { forms: ['di', 'dija', 'dinte'], stems: ['njoh', 'njih'], lexemes: ['njoh', 'di'] },
    understand: { stems: ['kupt'], lexemes: ['kuptoj'] },
    sin: { stems: ['mëkat', 'mekat'], lexemes: ['mëkat'] },
    guilt: { stems: ['faj'], lexemes: ['faj'] },
    conviction: { stems: ['bindj', 'bindur'], lexemes: ['bindje'] },
    repent: { stems: ['pendo', 'pendim', 'pendua'], lexemes: ['pendohem'] },
    regret: { stems: ['keqardh'], lexemes: ['keqardhje'] },
    forgive: { stems: ['falj', 'falur', 'faluar'], forms: ['fal', 'fali'], lexemes: ['falje'] },
    grace: { forms: ['hir', 'hiri', 'hirin', 'hirit'], lexemes: ['hir'] },
    salvation: { stems: ['shpëtim', 'shpetim', 'shpëto', 'shpeto', 'shpëtu', 'shpetu'], lexemes: ['shpëtim'] },
    believe: { stems: ['besoj', 'besov', 'beson', 'besues'], lexemes: ['besoj'] },
    faith: { stems: ['besim'], lexemes: ['besim'] },
    trust: { stems: ['mbështet', 'mbeshtet'], lexemes: ['mbështetem'] },
    change: { stems: ['ndrysh'], lexemes: ['ndryshoj'] },
    now: { forms: ['tani', 'sot'], lexemes: ['tani'] },
    share: { stems: ['ndarj'], forms: ['ndaj'], lexemes: ['ndaj'] },
  },
  th: {
    young: { stems: ['เด็ก'], lexemes: ['เด็ก'] },
    family: { stems: ['ครอบครัว', 'พ่อแม่'], lexemes: ['ครอบครัว'] },
    jesus: { stems: ['เยซู', 'พระคริสต์', 'พระเจ้า', 'คริสตจักร', 'โบสถ์', 'พระคัมภีร์'], lexemes: ['พระเยซู'] },
    know: { forms: ['รู้', 'รู้จัก'], lexemes: ['รู้จัก'] },
    understand: { stems: ['เข้าใจ'], lexemes: ['เข้าใจ'] },
    sin: { stems: ['บาป'], lexemes: ['บาป'] },
    guilt: { stems: ['ผิด'], lexemes: ['ความผิด'] },
    conviction: { stems: ['สำนึก'], lexemes: ['สำนึก'] },
    repent: { stems: ['กลับใจ'], lexemes: ['กลับใจ'] },
    regret: { stems: ['เสียใจ', 'เสียดาย'], lexemes: ['เสียใจ'] },
    forgive: { stems: ['อภัย', 'ยกโทษ'], lexemes: ['อภัย'] },
    grace: { stems: ['พระคุณ'], lexemes: ['พระคุณ'] },
    salvation: { stems: ['รอด'], lexemes: ['ความรอด'] },
    believe: { stems: ['เชื่อ'], lexemes: ['เชื่อ'] },
    faith: { stems: ['ความเชื่อ', 'ศรัทธา'], lexemes: ['ศรัทธา'] },
    trust: { stems: ['วางใจ', 'ไว้ใจ'], lexemes: ['ไว้ใจ'] },
    change: { stems: ['เปลี่ยน', 'ใหม่'], lexemes: ['เปลี่ยน'] },
    now: { forms: ['ตอนนี้', 'ปัจจุบัน', 'ทุกวัน'], lexemes: ['ตอนนี้'] },
    share: { stems: ['แบ่งปัน', 'เล่า'], lexemes: ['แบ่งปัน'] },
  },
  hi: {
    young: { stems: ['छोट', 'बचपन', 'बच्च', 'युवा', 'जवान'], lexemes: ['छोटा'] },
    family: { stems: ['परिवार', 'माता', 'पिता'], lexemes: ['परिवार'] },
    jesus: { stems: ['यीशु', 'मसीह', 'परमेश्वर', 'ईश्वर', 'कलीसिया', 'बाइबल'], forms: ['चर्च'], lexemes: ['यीशु'] },
    know: { forms: ['जानता', 'जानती', 'जानते', 'जानना', 'जानने'], lexemes: ['जानना'] },
    understand: { stems: ['समझ'], lexemes: ['समझना'] },
    sin: { stems: ['पाप'], lexemes: ['पाप'] },
    guilt: { stems: ['दोष', 'अपराध'], lexemes: ['दोष'] },
    conviction: { stems: ['कायल'], lexemes: ['कायल'] },
    repent: { stems: ['पश्चाताप', 'पछता', 'तौबा'], lexemes: ['पश्चाताप'] },
    regret: { stems: ['अफसोस', 'खेद'], lexemes: ['अफसोस'] },
    forgive: { stems: ['क्षमा', 'माफ'], lexemes: ['क्षमा'] },
    grace: { stems: ['अनुग्रह', 'कृपा'], lexemes: ['अनुग्रह'] },
    salvation: { stems: ['उद्धार', 'मुक्ति'], lexemes: ['उद्धार'] },
    believe: { stems: ['विश्वास'], lexemes: ['विश्वास'] },
    faith: { stems: ['विश्वास', 'आस्था'], lexemes: ['आस्था'] },
    trust: { stems: ['भरोसा'], lexemes: ['भरोसा'] },
    change: { stems: ['बदल', 'नया', 'नई', 'नये'], lexemes: ['बदलना'] },
    now: { forms: ['अब', 'आज'], lexemes: ['अब'] },
    share: { stems: ['बाँट', 'बांट', 'साझा'], lexemes: ['साझा'] },
  },
  de: {
    young: { stems: ['jung', 'kindheit', 'kind'], lexemes: ['jung'] },
    family: { stems: ['famili', 'eltern', 'mutter', 'vater'], lexemes: ['familie'] },
    jesus: { stems: ['jesus', 'christus', 'gott', 'kirche', 'bibel', 'gemeinde'], lexemes: ['Jesus'] },
    know: { forms: ['weiß', 'weiss', 'wusste', 'wusstest', 'wussten', 'wissen'], stems: ['kenn', 'kannte'], lexemes: ['kennen', 'wissen'] },
    understand: { stems: ['versteh', 'verstand'], lexemes: ['verstehen'] },
    sin: { stems: ['sünd', 'suend'], lexemes: ['Sünde'] },
    guilt: { stems: ['schuld'], lexemes: ['Schuld'] },
    conviction: { stems: ['überzeug', 'ueberzeug', 'überführ'], lexemes: ['Überzeugung'] },
    repent: { stems: ['reue', 'bereu', 'buße', 'buss', 'umkehr'], lexemes: ['bereuen'] },
    regret: { stems: ['bedauer'], forms: ['leid'], lexemes: ['bedauern'] },
    forgive: { stems: ['vergeb', 'vergab', 'vergib'], lexemes: ['vergeben'] },
    grace: { stems: ['gnade', 'gnäd'], lexemes: ['Gnade'] },
    salvation: { stems: ['erlös', 'rettung', 'gerettet', 'retten', 'erretten'], lexemes: ['Erlösung'] },
    believe: { stems: ['glaub'], lexemes: ['glauben'] },
    faith: { forms: ['glaube'], lexemes: ['Glaube'] },
    trust: { stems: ['vertrau'], lexemes: ['vertrauen'] },
    change: { stems: ['änder', 'aender', 'verändert', 'neu'], lexemes: ['ändern'] },
    now: { forms: ['jetzt', 'heute', 'nun'], lexemes: ['jetzt'] },
    share: { stems: ['erzähl', 'mitteil', 'weitersag'], lexemes: ['erzählen'] },
  },
  // machine-draft, native review pending: Norwegian Bokmål and Nynorsk (the function words of docs/norway/recon/linguistics-policy.md B3/B9/B10)
  nb: {
    // forms, not the stem 'ung': 'Ungarn' must not read as youth
    young: { stems: ['barn'], forms: ['ung', 'unge', 'ungt', 'yngre', 'yngst', 'ungdom', 'ungdommen'], lexemes: ['ung'] },
    family: { stems: ['famili'], forms: ['mor', 'moren', 'far', 'faren', 'foreldre', 'foreldrene', 'søsken'], lexemes: ['familie'] },
    jesus: { stems: ['jesus', 'kristus', 'gud', 'kirke', 'bibel', 'menighet'], lexemes: ['Jesus'] },
    know: { forms: ['vet', 'vite', 'visste', 'visst', 'kjenner', 'kjente', 'kjenne', 'kjent'], lexemes: ['kjenne', 'vite'] },
    understand: { stems: ['forstå', 'forståelse'], forms: ['forsto', 'forstod'], lexemes: ['forstå'] },
    sin: { stems: ['synd'], lexemes: ['synd'] },
    // forms, not the stems 'skyld' / 'angr': 'skylder' (owes), 'angrep' (attack) and 'angripe' (to attack) must not read as guilt or repentance
    guilt: { forms: ['skyld', 'skylden', 'skyldig', 'skyldige', 'skyldfølelse', 'skyldfølelsen'], lexemes: ['skyld'] },
    conviction: { stems: ['overbevis'], lexemes: ['overbevisning'] },
    repent: { stems: ['omvend'], forms: ['angre', 'angrer', 'angret', 'angra', 'angrende', 'anger', 'angeren'], lexemes: ['angre'] },
    regret: { stems: ['beklag'], lexemes: ['beklage'] },
    forgive: { stems: ['tilgi', 'tilga'], lexemes: ['tilgi'] },
    grace: { stems: ['nåde'], lexemes: ['nåde'] },
    salvation: { stems: ['frels'], lexemes: ['frelse'] },
    // verb and noun share the lemma 'tro' and concept matching tries the lemma too: the bare lemma is listed under 'believe' ONLY, so
    // 'tror' reads as believing and never as faith; the noun 'troen' is ambiguous (believe + faith), so a swap to it is flagged.
    // The bare noun 'tro' cannot be told from the verb (matching has no part of speech).
    believe: { forms: ['tro', 'tror', 'trodde', 'trodd', 'troende'], lexemes: ['tro'] },
    faith: { forms: ['troen', 'troens'], lexemes: ['tro'] },
    trust: { forms: ['stoler', 'stolte', 'stole'], stems: ['tillit', 'tiltro'], lexemes: ['stole'] },
    change: { stems: ['endr', 'forandr'], forms: ['ny', 'nytt', 'nye'], lexemes: ['endre'] },
    now: { forms: ['nå', 'idag', 'dagens'], lexemes: ['nå'] },
    share: { stems: ['fortell', 'fortalt'], forms: ['dele', 'deler', 'delte'], lexemes: ['fortelle', 'dele'] },
  },
  nn: {
    young: { stems: ['born', 'barn'], forms: ['ung', 'unge', 'ungt', 'yngre', 'yngst', 'ungdom', 'ungdommen'], lexemes: ['ung'] },
    family: { stems: ['famili'], forms: ['mor', 'mora', 'far', 'faren', 'foreldre', 'foreldra', 'søsken'], lexemes: ['familie'] },
    jesus: { stems: ['jesus', 'kristus', 'gud', 'kyrkj', 'bibel', 'menigheit', 'menighet'], lexemes: ['Jesus'] },
    // 'kjend' is the adjective the analyzer reads 'kjende' as; 'vete' is the other infinitive of vite
    know: { forms: ['veit', 'vite', 'vete', 'visste', 'visst', 'kjenner', 'kjende', 'kjend', 'kjenne', 'kjent'], lexemes: ['kjenne', 'vite'] },
    understand: { stems: ['forstå', 'forståing'], forms: ['forstod', 'forsto'], lexemes: ['forstå'] },
    sin: { stems: ['synd'], lexemes: ['synd'] },
    // forms, not the stem 'skuld': 'skulder' (shoulders) must not read as guilt; 'angrep' / 'angripe' must not read as repentance
    guilt: { forms: ['skuld', 'skulda', 'skuldig', 'skuldige', 'skuldkjensle', 'skuldkjensla'], lexemes: ['skuld'] },
    conviction: { stems: ['overbevis'], lexemes: ['overbevisning'] },
    repent: { stems: ['omvend'], forms: ['angre', 'angrar', 'angra', 'angrande', 'anger', 'angeren'], lexemes: ['angre'] },
    regret: { stems: ['beklag'], lexemes: ['beklage'] },
    forgive: { stems: ['tilgi', 'tilgje', 'tilga'], lexemes: ['tilgje'] },
    grace: { stems: ['nåde'], lexemes: ['nåde'] },
    salvation: { stems: ['frels'], lexemes: ['frelse'] },
    // same as Bokmål: the shared lemma 'tru' is listed under 'believe' only
    believe: { forms: ['tru', 'trur', 'trudde', 'trudd', 'truande'], lexemes: ['tru'] },
    faith: { forms: ['trua', 'truas'], lexemes: ['tru'] },
    trust: { forms: ['stolar', 'stolte', 'stole'], stems: ['tillit', 'tiltru'], lexemes: ['stole'] },
    change: { stems: ['endr', 'forandr'], forms: ['ny', 'nytt', 'nye'], lexemes: ['endre'] },
    now: { forms: ['no', 'nå', 'idag', 'dagens'], lexemes: ['no'] },
    share: { stems: ['fortel', 'fortald'], forms: ['dele', 'deler', 'delte'], lexemes: ['fortelje', 'dele'] },
  },
};

/** Negation markers (per language). Used to keep negation outside a recombined phrase and flag it. */
export const NEGATORS: Record<LanguageCode, string[]> = {
  es: ['no', 'nunca', 'jamás', 'jamas', 'ni'],
  sq: ['nuk', 's', 'mos', 'jo'],
  th: ['ไม่', 'ไม่ได้', 'มิ'],
  hi: ['नहीं', 'न', 'मत'],
  de: ['nicht', 'kein', 'keine', 'keinen', 'keinem', 'keiner', 'nie', 'niemals'],
  // machine-draft, native review pending
  nb: ['ikke', 'aldri', 'ingen', 'intet', 'ingenting', 'verken'],
  nn: ['ikkje', 'aldri', 'ingen', 'inkje', 'ingenting', 'verken'],
};

/**
 * Chronology words (per language): "when / before / after / now / never ...". A suggestion that drops, adds or
 * swaps one changes WHEN something happened, which is meaning. Exact normalized forms (Thai tokens are already
 * segmented). TODO(review): starter set; every language needs a native-speaker pass.
 */
export const CHRONOLOGY: Record<LanguageCode, string[]> = {
  es: ['cuando', 'antes', 'después', 'despues', 'luego', 'entonces', 'ahora', 'hoy', 'ayer', 'mañana', 'ya', 'todavía', 'todavia', 'aún', 'aun', 'siempre', 'nunca', 'jamás', 'jamas', 'primero', 'finalmente', 'mientras', 'desde', 'hasta', 'pronto', 'anoche'],
  sq: ['kur', 'para', 'pas', 'pastaj', 'tani', 'sot', 'dje', 'nesër', 'neser', 'tashmë', 'tashme', 'ende', 'gjithmonë', 'gjithmone', 'kurrë', 'kurre', 'fillimisht', 'derisa', 'atëherë', 'atehere'],
  th: ['เมื่อ', 'ตอน', 'ก่อน', 'หลัง', 'แล้ว', 'ตอนนี้', 'วันนี้', 'เมื่อวาน', 'พรุ่งนี้', 'เคย', 'ยัง', 'เสมอ', 'ตลอด', 'ในที่สุด', 'ขณะที่', 'จน', 'ตั้งแต่'],
  hi: ['जब', 'पहले', 'बाद', 'फिर', 'तब', 'अब', 'आज', 'कल', 'अभी', 'हमेशा', 'कभी', 'आखिरकार', 'जबकि', 'तक'],
  de: ['als', 'wenn', 'bevor', 'nachdem', 'dann', 'danach', 'vorher', 'später', 'spaeter', 'jetzt', 'heute', 'gestern', 'morgen', 'schon', 'noch', 'immer', 'nie', 'niemals', 'zuerst', 'schließlich', 'schliesslich', 'während', 'waehrend', 'seit', 'bis', 'damals'],
  // machine-draft, native review pending
  nb: ['da', 'når', 'før', 'etter', 'så', 'deretter', 'nå', 'idag', 'igår', 'imorgen', 'allerede', 'ennå', 'fortsatt', 'alltid', 'aldri', 'først', 'endelig', 'mens', 'siden', 'inntil', 'snart', 'tidligere', 'senere'],
  nn: ['då', 'når', 'før', 'etter', 'så', 'deretter', 'no', 'nå', 'idag', 'igår', 'imorgon', 'allereie', 'enno', 'framleis', 'alltid', 'aldri', 'først', 'endeleg', 'medan', 'sidan', 'inntil', 'snart', 'tidlegare', 'seinare'],
};

/** Subject pronouns: a slot filler that extends backwards stops here (the subject is not part of a phrase slot). */
export const SUBJECT_PRONOUNS: Record<LanguageCode, string[]> = {
  es: ['yo', 'tú', 'él', 'ella', 'nosotros', 'nosotras', 'usted', 'ustedes', 'ellos', 'ellas'],
  sq: ['unë', 'une', 'ti', 'ai', 'ajo', 'ne', 'ju', 'ata', 'ato'],
  th: ['ฉัน', 'ผม', 'ดิฉัน', 'เขา', 'เธอ', 'เรา', 'คุณ'],
  hi: ['मैं', 'तू', 'तुम', 'वह', 'वो', 'हम', 'आप', 'ये', 'वे'],
  de: ['ich', 'du', 'er', 'sie', 'es', 'wir', 'ihr'],
  // machine-draft, native review pending
  nb: ['jeg', 'du', 'han', 'hun', 'vi', 'dere', 'de', 'man'],
  nn: ['eg', 'du', 'han', 'ho', 'vi', 'me', 'de', 'dei'],
};

// ───────────────────────── compiled matchers ─────────────────────────

interface Compiled { concept: ConceptId; stems: string[]; forms: Set<string> }
const nfc = (s: string) => s.normalize('NFC').toLowerCase();
const compiled = new Map<LanguageCode, Compiled[]>();

function compile(lang: LanguageCode): Compiled[] {
  let c = compiled.get(lang);
  if (!c) {
    c = [];
    const table = TABLES[lang];
    for (const id of CONCEPT_IDS) {
      const e = table[id];
      if (!e) continue;
      c.push({ concept: id, stems: (e.stems ?? []).map(nfc), forms: new Set((e.forms ?? []).map(nfc)) });
    }
    compiled.set(lang, c);
  }
  return c;
}

/**
 * How a token matched each concept it belongs to: an exact form, the lemma, a prefix stem, or (Thai) a substring. Used by the
 * practice engine to say how sure a meaning assessment is; conceptsForToken is the same test without the detail.
 */
export function conceptMatches(lang: LanguageCode, normalized: string, lemma?: string): Array<{ concept: ConceptId; via: 'form' | 'lemma' | 'stem' | 'substring' }> {
  const form = nfc(normalized);
  const lem = lemma ? nfc(lemma) : undefined;
  const out: Array<{ concept: ConceptId; via: 'form' | 'lemma' | 'stem' | 'substring' }> = [];
  for (const e of compile(lang)) {
    const stemHit = (c: string) => e.stems.some((st) => (lang === 'th' ? c.includes(st) : c.startsWith(st)));
    if (e.forms.has(form)) out.push({ concept: e.concept, via: 'form' });
    else if (lem && e.forms.has(lem)) out.push({ concept: e.concept, via: 'lemma' });
    else if (stemHit(form) || (lem && stemHit(lem))) out.push({ concept: e.concept, via: lang === 'th' ? 'substring' : 'stem' });
  }
  return out;
}

/** Concepts a token (normalized form + optional lemma) belongs to. */
export function conceptsForToken(lang: LanguageCode, normalized: string, lemma?: string): ConceptId[] {
  const cands = [nfc(normalized)];
  if (lemma) cands.push(nfc(lemma));
  const out: ConceptId[] = [];
  for (const e of compile(lang)) {
    const hit = cands.some((c) => e.forms.has(c) || e.stems.some((s) => (lang === 'th' ? c.includes(s) : c.startsWith(s))));
    if (hit) out.push(e.concept);
  }
  return out;
}

export function lexemesFor(lang: LanguageCode, concept: ConceptId): string[] {
  return TABLES[lang][concept]?.lexemes ?? [];
}

/** English words in a "what are you trying to say?" request → concepts, ordered by first appearance. */
export function englishConcepts(english: string): Array<{ concept: ConceptId; word: string }> {
  const out: Array<{ concept: ConceptId; word: string }> = [];
  const seen = new Set<ConceptId>();
  for (const m of english.toLowerCase().matchAll(/[a-z']+/g)) {
    const word = m[0];
    for (const id of CONCEPT_IDS) {
      if (!seen.has(id) && CONCEPTS[id].english.includes(word)) {
        seen.add(id);
        out.push({ concept: id, word });
      }
    }
  }
  return out;
}

/** Semantic section tag for a sentence from its concept hits. Confidence = (best/total weight) × min(1, best/2). */
export function tagSection(lang: LanguageCode, tokens: Array<{ normalized: string; lemma?: string }>): { section: SemanticSection; confidence: number } | undefined {
  const concepts = new Set<ConceptId>();
  for (const t of tokens) for (const c of conceptsForToken(lang, t.normalized, t.lemma)) concepts.add(c);
  const score = new Map<SemanticSection, number>();
  for (const c of concepts) for (const [section, w] of CONCEPTS[c].sections) score.set(section, (score.get(section) ?? 0) + w);
  let best: SemanticSection | undefined;
  let bestW = 0;
  let total = 0;
  for (const [s, w] of score) {
    total += w;
    if (w > bestW) { best = s; bestW = w; }
  }
  if (!best || bestW < 1) return undefined;
  return { section: best, confidence: Math.round((bestW / total) * Math.min(1, bestW / 2) * 100) / 100 };
}
