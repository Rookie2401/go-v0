/**
 * French pronunciation help: learner-facing notes, the aspirated-h list and liaison.
 *
 * HONESTY. Drafted by an AI model; not checked by a native speaker. It describes the common pronunciation of France; Québec,
 * Belgium, Switzerland and Africa differ in places. It never invents an IPA transcription: a word's IPA comes from the dictionary
 * (`analysis.candidates[0].notes.ipa`) and is only passed on. It never transliterates and never sends anything to speech.
 * Liaison is DESCRIBED here, not heard: the function says what is required, optional or forbidden, from short closed word
 * lists and, when the part of speech is given, from it. Without a part of speech it stays conservative ('optional' or 'none').
 */
import type { AnalyzedToken, PronunciationSupport, RawToken } from '../../core';
import { frenchGraphemes } from './graphemes';
import type { FrGrapheme } from './graphemes';

/**
 * Words that begin with an aspirated h: the h is silent but the word acts as if it began with a consonant (no elision, no
 * liaison: le héros, les héros said without z). Only words and forms that are certain; common inflections included.
 */
export const H_ASPIRE: ReadonlySet<string> = new Set([
  'héros', 'haine', 'haines', 'haïr', 'hais', 'hait', 'haïssent', 'haï', 'hasard', 'hasards', 'haut', 'haute', 'hauts', 'hautes', 'hauteur', 'hauteurs',
  'honte', 'hontes', 'honteux', 'honteuse', 'hache', 'haches', 'haricot', 'haricots', 'hibou', 'hiboux', 'hollande', 'hollandais', 'hollandaise',
  'homard', 'homards', 'huit', 'huits', 'huitième', 'huitièmes', 'huitaine', 'hall', 'halls', 'hamac', 'hamacs', 'hameau', 'hameaux',
  'hanche', 'hanches', 'handicap', 'handicaps', 'handicapé', 'handicapée', 'handicapés', 'handicapées', 'hangar', 'hangars',
  'harceler', 'harcèle', 'harcèlent', 'harcelé', 'harcelée', 'harcèlement', 'hardi', 'hardie', 'hardis', 'hardies', 'hareng', 'harengs',
  'harpe', 'harpes', 'hausse', 'hausses', 'hausser', 'haussent', 'haussé', 'haussée', 'hâte', 'hâtes', 'hâter', 'hâtent', 'hâté',
  'havre', 'havres', 'héler', 'hèle', 'hèlent', 'hérisson', 'hérissons', 'héron', 'hérons', 'heurter', 'heurte', 'heurtent', 'heurté', 'heurtée',
  'hêtre', 'hêtres', 'hideux', 'hideuse', 'hideuses', 'hiérarchie', 'hiérarchies', 'hisser', 'hisse', 'hissent', 'hissé', 'hocher', 'hoche', 'hochent',
  'hockey', 'hongrie', 'hongrois', 'hongroise', 'hoquet', 'hoquets', 'hors', 'houle', 'houles', 'houx', 'hurler', 'hurle', 'hurlent', 'hurlé',
  'hurlement', 'hurlements', 'hutte', 'huttes', 'hamburger', 'hamburgers', 'hamster', 'hamsters', 'harem', 'harems', 'harnais', 'haie', 'haies',
  'haillon', 'haillons', 'halte', 'haltes', 'hanter', 'hante', 'hantent', 'hanté', 'hargne', 'harpon', 'harpons', 'hennir', 'hérisser',
  'hernie', 'hublot', 'hublots', 'huer', 'hooligan', 'hooligans', 'handball', 'hobby', 'hobbies',
]);

/**
 * Words that begin with a vowel (or glide) letter but still block elision and liaison, or behave as if they begin with a
 * consonant (le onze, les | onze, le oui). Separate from `H_ASPIRE`; the two lists are used together.
 */
export const NO_LIAISON_INITIAL: ReadonlySet<string> = new Set([
  'onze', 'onzième', 'onzièmes', 'oui', 'yaourt', 'yaourts', 'yoga', 'yacht', 'yachts', 'yoyo', 'yucca', 'yéti', 'ouistiti', 'ouistitis',
  'whisky', 'wagon', 'wagons', 'week-end', 'watt', 'watts', 'western',
]);

export interface LiaisonSide { normalized: string; pos?: string; morph?: Record<string, string> }
export interface LiaisonResult { kind: 'required' | 'optional' | 'forbidden' | 'none'; sound?: string; why: string }

const VOWEL_START = /^[aeiouyàâäéèêëîïôöùûüœæ]/;
const SUBJECT_AFTER_VERB: ReadonlySet<string> = new Set(['il', 'ils', 'elle', 'elles', 'on', 'en', 'y']);
const COMMON_VERB_FORMS: ReadonlySet<string> = new Set(['est', 'sont', 'ont', 'vont', 'font', 'peut', 'veut', 'doit', 'dit', 'fait', 'prend', 'vient', 'a', 'va', 'sait', 'faut', 'était', 'sera', 'avez', 'êtes', 'suis', 'es', 'sommes', 'avons', 'allons', 'vas', 'parles', 'prends']);
/** Determiners, numerals, possessives and pronouns before a verb: the liaison is always made. */
const REQUIRED_BEFORE_ANY: ReadonlySet<string> = new Set([
  'les', 'des', 'ces', 'mes', 'tes', 'ses', 'nos', 'vos', 'leurs', 'un', 'mon', 'ton', 'son', 'aucun', 'aux', 'deux', 'trois', 'six', 'dix', 'vingt', 'cent',
  'quelques', 'plusieurs', 'certains',
]);
const PRONOUN_BEFORE_VERB: ReadonlySet<string> = new Set(['nous', 'vous', 'ils', 'elles', 'on', 'en']);
const SHORT_PREP_ADV: ReadonlySet<string> = new Set(['dans', 'chez', 'sans', 'sous', 'en', 'très', 'bien']);
const OPTIONAL_WORDS: ReadonlySet<string> = new Set(['pas', 'mais', 'toujours', 'jamais', 'alors', 'assez', 'souvent', 'trop', 'beaucoup', 'plus', 'moins', 'rien', 'quand', 'comment', 'tant', 'vers', 'dès', 'après', 'depuis', 'pendant', 'avant']);
const PREPOSED_ADJ: ReadonlySet<string> = new Set([
  'petit', 'petits', 'grand', 'grands', 'gros', 'bon', 'bons', 'mauvais', 'premier', 'premiers', 'dernier', 'derniers', 'ancien', 'anciens',
  'prochain', 'prochains', 'certain', 'certains', 'divers',
]);
/** Words whose final consonant is always said, so there is nothing to link. */
const ALWAYS_SAID: ReadonlySet<string> = new Set(['sud', 'sept', 'huit', 'net', 'cap', 'stop', 'top', 'gaz', 'quiz', 'index', 'lynx', 'bus', 'virus', 'ours', 'hélas', 'atlas', 'tennis', 'jadis', 'maïs', 'fils', 'sens', 'ouest', 'cinq', 'cet']);
/** These lose their nasal vowel in liaison (bon ami is said like bonne amie); en, on, bien, rien keep it. */
const NASAL_LOSS: ReadonlySet<string> = new Set(['bon', 'un', 'mon', 'ton', 'son', 'aucun', 'ancien', 'prochain', 'certain']);
const ER_SAID_NOLINK: ReadonlySet<string> = new Set(['mer', 'fer', 'cher', 'ver', 'hier', 'hiver', 'enfer', 'amer', 'fier', 'super']);

/** The consonant a word could link, or undefined when it ends in none (or always says its final consonant). */
function linkConsonant(w: string): { sound: string; letter: string } | undefined {
  if (w === '' || /['’\-]$/.test(w)) return undefined;
  if (w === 'neuf') return { sound: 'v', letter: 'f' };
  if (ALWAYS_SAID.has(w)) return undefined;
  const last = w[w.length - 1];
  switch (last) {
    case 's': case 'x': case 'z': return { sound: 'z', letter: last };
    case 't': case 'd': return { sound: 't', letter: last };
    case 'n': return { sound: 'n', letter: 'n' };
    case 'p': return { sound: 'p', letter: 'p' };
    case 'r': return /er$/.test(w) && !ER_SAID_NOLINK.has(w) ? { sound: 'r', letter: 'r' } : undefined;
    default: return undefined;
  }
}

const isPlural = (p: LiaisonSide): boolean => (p.morph?.Number ? p.morph.Number.includes('Plur') : /[sxz]$/.test(p.normalized));
const isVerb = (pos?: string): boolean => pos === 'VERB' || pos === 'AUX';

/** The liaison between two written words (a description, not a recording). Never claims a liaison where it returns 'none'. */
export function liaison(prev: LiaisonSide, next: LiaisonSide): LiaisonResult {
  const a = prev.normalized;
  const b = next.normalized;
  const link = linkConsonant(a);
  if (!link) {
    return { kind: 'none', why: a === '' || /['’\-]$/.test(a) ? 'The first word does not end in a letter that can link.' : ALWAYS_SAID.has(a) ? `${a} already says its final consonant, so there is nothing to link.` : 'The first word does not end in a consonant letter that can be heard in liaison.' };
  }
  const blocked = H_ASPIRE.has(b) ? 'an aspirated h' : NO_LIAISON_INITIAL.has(b) ? 'a word that behaves like a consonant' : undefined;
  if (blocked) {
    return { kind: 'forbidden', why: `No liaison before ${b}: it begins with ${blocked}, so the final ${link.letter} of ${a} stays silent (${a} | ${b}).` };
  }
  if (!VOWEL_START.test(b) && !/^h/.test(b)) return { kind: 'none', why: `${b} begins with a consonant sound, so there is nothing to link.` };
  if (/^h/.test(b) && !VOWEL_START.test(b.slice(1))) return { kind: 'none', why: `${b} begins with a consonant sound, so there is nothing to link.` };

  const sound = link.sound;
  const nasalNote = link.sound === 'n' ? (NASAL_LOSS.has(a) ? ` In ${a} the vowel loses its nasal sound: it is said like the feminine (bon ami like bonne amie).` : ' The nasal vowel is kept (en avion, on a, bien aimable).') : '';
  const required = (why: string): LiaisonResult => ({ kind: 'required', sound, why: why + nasalNote });
  const optional = (why: string): LiaisonResult => ({ kind: 'optional', sound, why: why + nasalNote });

  if (a === 'et') return { kind: 'forbidden', why: 'Never a liaison after et: et | elle (the t is silent).' };
  if (a === 'neuf') {
    return ['ans', 'heures', 'heure', 'hommes'].includes(b)
      ? { kind: 'required', sound: 'v', why: 'The f of neuf is said v before ans and heures: neuf ans, neuf heures.' }
      : { kind: 'none', why: 'neuf says its f as usual before other vowels (neuf enfants).' };
  }
  // inversion and imperative: verb + pronoun
  if (SUBJECT_AFTER_VERB.has(b) && (isVerb(prev.pos) || (prev.pos === undefined && COMMON_VERB_FORMS.has(a)))) {
    return required('Verb and following pronoun are always joined (inversion or imperative): ont-ils, est-il, parles-en, vas-y.');
  }
  if (REQUIRED_BEFORE_ANY.has(a)) {
    if ((a === 'vingt' || a === 'cent') && prev.morph?.Number === 'Plur') return optional(`${a} before a vowel: the liaison is made in vingt ans, cent ans.`);
    return required(`After ${a} (a determiner or number) the liaison is always made: ${a} ${b}.`);
  }
  if (PRONOUN_BEFORE_VERB.has(a)) {
    if (b === 'et' || b === 'ou') return optional(`${a} before ${b} is usually not linked.`);
    return required(`A pronoun before its verb is joined to it: ${a} ${b}.`);
  }
  if (SHORT_PREP_ADV.has(a)) return required(`After the short word ${a} the liaison is always made (${a} ${b}).`);
  if (PREPOSED_ADJ.has(a) && (next.pos === undefined || next.pos === 'NOUN' || next.pos === 'PROPN' || next.pos === 'ADJ') && !isVerb(next.pos)) {
    return required(`An adjective before its noun is joined to it: ${a} ${b}.`);
  }
  if (prev.pos === 'DET' || prev.pos === 'NUM') return required(`After a determiner or number the liaison is always made: ${a} ${b}.`);
  if (prev.pos === 'NOUN' || prev.pos === 'PROPN') {
    return isPlural(prev)
      ? optional(`After a plural noun the liaison is optional and mostly kept for careful speech: ${a} ${b}.`)
      : { kind: 'forbidden', why: `Never after a singular noun: ${a} | ${b} (the final consonant of ${a} stays silent).` };
  }
  if (isVerb(prev.pos) || COMMON_VERB_FORMS.has(a)) return optional(`After a verb form the liaison is optional: usual in a few fixed phrases (c'est ici, il est allé), uncommon in careful speech elsewhere.`);
  if (OPTIONAL_WORDS.has(a)) return optional(`After ${a} the liaison is optional.`);
  if (prev.pos === 'ADJ') return optional('After an adjective that follows its noun the liaison is usually avoided; it is optional at most.');
  return optional('Not enough is known about this word to say more: a liaison may be heard here, and it is usually avoided unless a rule above applies.');
}

const HOMOPHONES: ReadonlyArray<readonly string[]> = [
  ['verre', 'vert', 'vers', 'ver'],
  ['mer', 'mère', 'maire'],
  ['sans', 'cent', 'sang', 'sent'],
  ['vingt', 'vin', 'vain', 'vins'],
  ['peu', 'peut', 'peux'],
  ['au', 'aux', 'eau', 'eaux'],
  ['ou', 'où'],
  ['foi', 'foie', 'fois'],
  ['sain', 'saint', 'sein'],
  ['cou', 'coup', 'coût'],
  ['père', 'paire', 'pair'],
  ['tant', 'temps'],
];

const ELIDED: Record<string, string> = {
  "l'": 'le or la', "d'": 'de', "j'": 'je', "m'": 'me', "t'": 'te', "s'": 'se (or si before il)', "n'": 'ne', "c'": 'ce', "ç'": 'ce', "qu'": 'que',
  "jusqu'": 'jusque', "lorsqu'": 'lorsque', "puisqu'": 'puisque', "quoiqu'": 'quoique',
};

/** Rank: lower is more misleading for an English reader. */
const lineFor = (g: FrGrapheme, word: string): { rank: number; key: string; text: string } | undefined => {
  const t = g.text;
  if (g.kind === 'silent' && g.certainty === 'usual' && /^[a-zàâéèêëîïôûüç]+$/.test(t) && !(t === 'h')) {
    if (t === 'e') return { rank: 0, key: 'final-e', text: `Final e is usually silent (${word}); it makes the consonant before it heard.` };
    if (t === 'es') return { rank: 0, key: 'final-es', text: `Final -es is usually silent: the plural or feminine ending is not said.` };
    return { rank: 0, key: `silent-${t}`, text: `The final ${t} of ${word} is usually silent.` };
  }
  if (g.kind === 'silent' && g.certainty === 'context' && /^[a-zàâéèêëîïôûüç]+$/.test(t)) return { rank: 0, key: `silent-${t}`, text: `The final ${t} of ${word} is not said here (a rule with a few exceptions).` };
  if (g.kind === 'nasal' && g.certainty !== 'context') return { rank: 1, key: `nasal-${t}`, text: `${t} is a nasal vowel: it is said through the nose and the n or m is not pronounced.` };
  if (t === 'ou' || t === 'où') return { rank: 2, key: 'ou', text: 'ou is oo as in food.' };
  if (t === 'oi') return { rank: 2, key: 'oi', text: 'oi is wa (moi, trois).' };
  if (t === 'eau') return { rank: 2, key: 'eau', text: 'eau is o as in go.' };
  if (t === 'au') return { rank: 2, key: 'au', text: 'au is o as in go.' };
  if (t === 'eu' || t === 'œu' || t === 'œ') return { rank: 2, key: 'eu', text: `${t} is like the u in fur without the r, with rounded lips.` };
  if (t === 'u' || t === 'û' || t === 'ü') return { rank: 2, key: 'u', text: 'u is ee said with rounded lips (like German ü); it is not oo and not English you.' };
  if (t === 'ui') return { rank: 2, key: 'ui', text: 'ui is wee (a quick rounded w, then ee).' };
  if (t === 'ai' || t === 'ei') return { rank: 3, key: 'ai', text: `${t} is e as in bed.` };
  if (t === 'gn') return { rank: 3, key: 'gn', text: 'gn is ny as in canyon.' };
  if (t === 'ch') return { rank: 3, key: 'ch', text: g.sound === 'k' ? 'ch is k in this word (from Greek).' : 'ch is said sh, as in chat.' };
  if (t === 'qu') return { rank: 3, key: 'qu', text: 'qu is k; the u is not said.' };
  if (t === 'ç') return { rank: 3, key: 'cedilla', text: 'ç (c with a cedilla) is said s.' };
  if (t === 'ill') return { rank: 3, key: 'ill', text: g.sound.startsWith('il') ? 'The double l of this word is said l (like ville, mille).' : 'ill is usually ee-y (fille, famille).' };
  if (t === 'gu') return { rank: 4, key: 'gu', text: 'gu before e or i is a hard g; the u is silent.' };
  if (t === 'ge') return { rank: 4, key: 'ge', text: 'ge before a, o, u is zh; the e is silent.' };
  if (t === 'j') return { rank: 4, key: 'j', text: 'j is zh (the s of measure), not English j.' };
  if (t === 'ti' && g.sound.startsWith('s')) return { rank: 4, key: 'tion', text: '-tion is said "syon".' };
  if (t === 'th') return { rank: 4, key: 'th', text: 'th is t, as in thé.' };
  if (t === 'ph') return { rank: 4, key: 'ph', text: 'ph is said f (photo).' };
  if (t === 'h') return { rank: 4, key: 'h', text: 'h is never said in French.' };
  if (t === 's' && g.sound === 'z') return { rank: 4, key: 'sz', text: 's between vowels is z.' };
  if (t === 'c' && g.sound === 's') return { rank: 4, key: 'c-s', text: 'c before e or i is s.' };
  if (t === 'r') return { rank: 5, key: 'r', text: 'r is made at the back of the throat, not like the English r.' };
  return undefined;
};

/** Pronunciation notes for a token. Notes only; the IPA, when present, is the dictionary's. */
export function frenchPronunciation(token: RawToken, analysis?: AnalyzedToken): PronunciationSupport {
  const out: PronunciationSupport = {};
  const first = analysis?.candidates?.[0];
  const rawIpa = first?.notes?.ipa;
  if (typeof rawIpa === 'string' && rawIpa.length > 0) out.ipa = rawIpa;
  const notes: string[] = [];
  out.notes = notes;
  if (!token.isWord) return out;
  const s = token.normalized;
  if (s === '') return out;

  const special: string[] = [];
  const grLines: string[] = [];
  const tail: string[] = [];

  if (/['’]$/.test(s) || s.endsWith("'")) {
    const full = ELIDED[s.replace(/’/g, "'")];
    special.push(`${s} is ${full ?? 'a short word'} with its vowel dropped before a vowel sound; it is said as one syllable with the next word.`);
    if (s === "c'" || s === "ç'") special.push("c' is said like s: c'est is said like sè.");
    if (s === "qu'") special.push("qu' is said k: qu'il is said kil.");
    out.notes = special.slice(0, 5);
    return out;
  }

  if (H_ASPIRE.has(s)) special.push('The h is silent, but nothing is run onto this word: le héros, never l\'héros, and les héros has no z.');
  else if (NO_LIAISON_INITIAL.has(s)) special.push(`${s} begins with a vowel letter but blocks elision and liaison, like a consonant: le ${s}, les | ${s}.`);

  const graphemes = frenchGraphemes(s);
  const entG = graphemes.find((g) => g.text === 'ent' && g.certainty === 'context');
  if (entG) {
    const asVerb = first && (first.pos === 'VERB' || first.pos === 'AUX') && first.morph.Person === '3' && first.morph.Number === 'Plur';
    const asOther = first && first.pos !== undefined && first.pos !== 'VERB' && first.pos !== 'AUX';
    if (asVerb) special.push('-ent on a verb in the third person plural is silent: ils parlent is said like il parle.');
    else if (asOther) special.push('-ent in a noun, adjective or adverb is nasal a, and the t is silent (moment, souvent).');
    else special.push('-ent is silent on a verb in the third person plural (ils parlent is said like il parle) but nasal a in a noun, adjective or adverb (moment, souvent).');
  }

  const seen = new Set<string>();
  const ranked: Array<{ rank: number; key: string; text: string }> = [];
  for (const g of graphemes) {
    if (g.text === 'ent' && g.certainty === 'context') continue;
    const l = lineFor(g, s);
    if (l && !seen.has(l.key)) { seen.add(l.key); ranked.push(l); }
  }
  ranked.sort((x, y) => x.rank - y.rank);
  for (const l of ranked) grLines.push(l.text);

  // liaison line: the token ends in a consonant that is normally silent
  const lastG = graphemes[graphemes.length - 1];
  if (lastG && lastG.kind === 'silent' && lastG.certainty === 'usual' && /[dpstxz]$/.test(lastG.text)) {
    const letter = lastG.text[lastG.text.length - 1];
    const sound = letter === 's' || letter === 'x' || letter === 'z' ? 'z' : letter === 'd' || letter === 't' ? 't' : 'p';
    const examples: Record<string, string> = {
      les: 'les is said lay; before a vowel the s is heard as z: les amis → lay-za-mee.',
      des: 'des is said day; before a vowel the s is heard as z: des amis → day-za-mee.',
      vous: 'vous is said voo; before a vowel the s is heard as z: vous êtes → voo-zet.',
      petit: 'petit is said puh-tee; before a vowel the t is heard: petit ami → puh-tee-ta-mee.',
      grand: 'grand is said like gran (nasal a); before a vowel the d is heard as t: grand homme → gran-tom.',
    };
    tail.push(examples[s] ?? `Before a vowel the final ${letter} of ${s} may be heard as ${sound} (liaison), in some phrases only: it is silent before a consonant or at the end.`);
  }

  const set = HOMOPHONES.find((h) => h.includes(s));
  if (set) tail.push(`${set.join(', ')} are said alike.`);

  const room = Math.max(0, 5 - tail.length);
  const body = [...special, ...grLines].slice(0, room);
  out.notes = [...body, ...tail].slice(0, 5);
  return out;
}
