/**
 * French (Latin script) for an English reader: an ORTHOGRAPHIC sprint, not an alphabet course (docs/french/DECODING-SPRINT.md,
 * docs/goreview-app/ALPHABET-SPRINT.md). The letters are known, so only what an English reader would decode WRONG is taught:
 * the vowel letters whose value differs (a e i o u y), the accented letters and the ligature œ, the consonant letters with another
 * value (c g h j q r s x), the vowel and consonant spellings (ou oi au eau ai ei eu œu, the nasal vowels an/en on in/ain/ein un,
 * ui gn ch ph th qu ill tion, ce/ci ge/gi gu, ien oin) and the RULES: a final consonant is usually silent, a final -e is silent, a final
 * -er/-ez is said ay, the -ent of a verb is silent, a vowel before n or m is nasal only when no vowel or n/m follows, a single s between
 * vowels is z, elision (l' j' d' n' c' qu') and liaison (les amis). The other letters (b d f k l m n p t v w z) are familiar.
 *
 * Unit keys are the older Alphabet deck's own glyphs (FR_ALPHABET_ROWS in tutorial/fr.ts, via alphabetLetters.ts) wherever a row
 * exists, so earlier practice carries over; three spellings the deck has no row for (ce / ci, ien, oin) are new, and the decoding
 * RULES have `rule-…` keys (a rule card has its own id kind). Sounds are English approximations, never IPA, and are "usually" where
 * they are only usual. The spelling table is the one in src/adapters/french/graphemes.ts (FRENCH_PATTERNS), reworded, not imported:
 * profiles do not import the pack's adapter code unless they need its decoder, and this one has none.
 *
 * WRITTEN FOR THIS DECK by an AI model; NOT reviewed by a native speaker. It describes the common pronunciation of France.
 */
import { greedyDependencies, type Spelling } from '../segment';
import { PHRASES, WORDS } from '../words/fr';
import type { ScriptProfile, ScriptUnit } from '../types';

const U = (key: string, kind: ScriptUnit['kind'], display: string, sound: string, extra: Partial<ScriptUnit> = {}): ScriptUnit => ({ key, kind, display, sound, ...extra });
const ex = (form: string, gloss: string) => ({ example: { form, gloss } });

const UNITS: ScriptUnit[] = [
  // letters whose usual value differs from English
  U('A a', 'letter', 'a', 'a as in father, short', ex('chat', 'cat')),
  U('C c', 'letter', 'c', 'k before a, o, u or a consonant (sac, comme); before e, i, y it is s (see ce / ci)', { difficulty: 2, ...ex('sac', 'bag') }),
  U('E e', 'letter', 'e', 'a weak uh (je); e as in bed before two consonants (elle); at the end of a word usually silent (see the final -e rule); ay in les, des, mes', { difficulty: 2, ...ex('je', 'I') }),
  U('G g', 'letter', 'g', 'g as in go before a, o, u or a consonant (gare); before e, i, y it is zh (see ge / gi)', { difficulty: 2, ...ex('gare', 'station') }),
  U('H h', 'letter', 'h', 'silent: h is never said (homme). A few words have an "aspirated" h (les héros): still silent, but no elision or liaison happens before it', { difficulty: 2, ...ex('homme', 'man') }),
  U('I i', 'letter', 'i', 'ee as in see', ex('il', 'he, it')),
  U('J j', 'letter', 'j', 'zh, the s of measure', ex('jour', 'day')),
  U('O o', 'letter', 'o', 'o as in more; closer to go at the end of a syllable', ex('porte', 'door')),
  U('Q q', 'letter', 'q', 'k (q is nearly always written qu; alone it is at the end of a word)', ex('cinq', 'five')),
  U('R r', 'letter', 'r', 'made at the back of the throat, not the English r', { difficulty: 3, ...ex('rue', 'street') }),
  U('S s', 'letter', 's', 's as in sit (also ss, which is never z); a final s is usually silent; a single s between two vowels is z (see that rule)', { difficulty: 2, ...ex('sel', 'salt') }),
  U('U u', 'letter', 'u', 'ee said with rounded lips, like German ü; English has no such sound', { difficulty: 3, ...ex('tu', 'you') }),
  U('X x', 'letter', 'x', 'ks (taxi); gz in ex- before a vowel (exemple); usually silent at the end of a word (deux)', { difficulty: 2, ...ex('taxi', 'taxi') }),
  U('Y y', 'letter', 'y', 'ee (y); like y in yes before a vowel', ex('y', 'there, to it')),
  // accented letters and the ligature
  U('é', 'letter', 'é', 'ay, short and pure (été)', ex('thé', 'tea')),
  U('è', 'letter', 'è', 'e as in bed', ex('père', 'father')),
  U('ê', 'letter', 'ê', 'e as in bed', ex('fête', 'party, festival')),
  U('ë', 'letter', 'ë', 'e as in bed; the dots mean it is said on its own, apart from the vowel before it', ex('Israël', 'Israel')),
  U('à', 'letter', 'à', 'a as in father; the accent only tells à from a', ex('à', 'to, at, in')),
  U('â', 'letter', 'â', 'a; some speakers say it deeper', ex('âge', 'age')),
  U('î', 'letter', 'î', 'ee as in see', ex('île', 'island')),
  U('ï', 'letter', 'ï', 'ee; the dots mean the i is said on its own, apart from the vowel before it', ex('naïf', 'naive')),
  U('ô', 'letter', 'ô', 'o as in go', ex('hôtel', 'hotel')),
  U('ù', 'letter', 'où', 'where it appears, in où, it is oo as in food', ex('où', 'where')),
  U('û', 'letter', 'û', 'ee with rounded lips, like u', { difficulty: 2, ...ex('sûr', 'sure, safe') }),
  U('ç', 'letter', 'ç', 's as in sit (c with a cedilla, written before a, o, u)', ex('garçon', 'boy')),
  U('œ', 'letter', 'œ', 'like the u in fur without the r, lips rounded', { difficulty: 3, ...ex('œil', 'eye') }),
  // spellings of one sound
  U('ou', 'digraph', 'ou', 'oo as in food; a quick w before a vowel (oui)', ex('vous', 'you')),
  U('oi', 'digraph', 'oi', 'wa (w plus a as in father)', ex('moi', 'me')),
  U('au', 'digraph', 'au', 'o as in go, short and pure', { note: 'au is also à + le, written as one word (au marché); du is de + le, aux is à + les, des is de + les.', ...ex('au', 'to the, at the, in the') }),
  U('eau', 'digraph', 'eau', 'o as in go, short and pure', ex('beau', 'beautiful, handsome')),
  U('ai', 'digraph', 'ai', 'e as in bed (in j\'ai and in many future forms nearer to ay)', ex('lait', 'milk')),
  U('ei', 'digraph', 'ei', 'e as in bed', ex('neige', 'snow')),
  U('eu', 'digraph', 'eu', 'like the u in fur without the r, lips rounded; in forms of avoir (eu) it is like u', { difficulty: 3, ...ex('peu', 'little, not much, few') }),
  U('œu', 'digraph', 'œu', 'the same sound as eu', { difficulty: 3, ...ex('sœur', 'sister') }),
  U('ui', 'digraph', 'ui', 'wee: a quick rounded w, then ee', { difficulty: 2, ...ex('nuit', 'night') }),
  U('ch', 'digraph', 'ch', 'sh as in ship (not the ch of church)', { note: 'In words from Greek it is k (orchestre).', ...ex('chat', 'cat') }),
  U('ph', 'digraph', 'ph', 'f', ex('photo', 'photo')),
  U('th', 'digraph', 'th', 't (the h is silent)', ex('thé', 'tea')),
  U('qu', 'digraph', 'qu', 'k; the u is silent', { note: 'A few learned words say kw (aquarium).', ...ex('qui', 'who, whom, which, that') }),
  U('gn', 'digraph', 'gn', 'ny as in canyon', ex('montagne', 'mountain')),
  U('ce / ci', 'digraph', 'ce ci', 's as in sit: c before e, i or y', { difficulty: 2, ...ex('ici', 'here') }),
  U('ge / gi', 'digraph', 'ge gi', 'zh (the s of measure): g before e, i or y; before a, o, u the e is silent and only softens the g (mangeons)', { difficulty: 2, ...ex('rouge', 'red') }),
  U('gu', 'digraph', 'gu', 'g as in go before e, i or y; the u is silent', { difficulty: 2, ...ex('guerre', 'war') }),
  U('ill', 'digraph', 'ill', 'usually ee-y after a consonant (fille); y after a vowel (travail); not in ville and mille, which say the l', { difficulty: 3, ...ex('fille', 'girl') }),
  U('tion', 'digraph', 'tion', 'usually syon, the on nasal (nation); after s it stays t (question)', { difficulty: 2, ...ex('nation', 'nation') }),
  // nasal vowels: said through the nose, the n or m is not said (only when no vowel or another n or m follows: see the rule)
  U('an / en', 'digraph', 'an en', 'nasal a: a said through the nose, the n is not said (dans, enfant); also am, em', { difficulty: 3, ...ex('enfant', 'child') }),
  U('on', 'digraph', 'on', 'nasal o: o said through the nose, the n is not said (bon); also om', { difficulty: 3, ...ex('bon', 'good') }),
  U('in / ain / ein', 'digraph', 'in ain ein', 'nasal e: e as in bed said through the nose, the n is not said (vin, pain, plein); also im, aim', { difficulty: 3, ...ex('pain', 'bread') }),
  U('un', 'digraph', 'un', 'nasal u: u of fur said through the nose (un, lundi); also um', { difficulty: 3, note: 'In much of France un and in are now one sound; in Québec, Belgium and Switzerland they are often kept apart. Do not worry about the difference at first.', ...ex('un', 'a, an') }),
  U('ien', 'digraph', 'ien', 'y plus nasal e at the end of a word (bien, rien, ancien); -ient and -ience words differ (patient, science)', { difficulty: 3, ...ex('ancien', 'old, former, ancient') }),
  U('oin', 'digraph', 'oin', 'w plus nasal e (loin, point)', { difficulty: 3, ...ex('loin', 'far, far away') }),
  // rules
  U('rule-final-silent', 'rule', 'petit grand trop', 'a final d, p, s, t, x or z is usually silent (petit, grand, trop, les, deux), and so is a g after n (long); a final c, r, f or l is usually said (avec, pour, chef, sel)', { difficulty: 2, note: 'Exceptions are said: sud, cap, bus; plus, tous and six vary.', ...ex('grand', 'big, tall, great') }),
  U('rule-final-e', 'rule', 'petite', 'a final e is usually silent, but it makes the consonant before it heard: petit (the t is silent), petite (the t is said)', { difficulty: 2, ...ex('petite', 'small (feminine)') }),
  U('rule-final-er', 'rule', 'parler chez', 'a final -er or -ez is said ay, short; the r and the z are silent (parler is said like parlay)', { difficulty: 2, note: 'In mer, cher, hier and hiver the r is said.', ...ex('parler', 'to speak, to talk') }),
  U('rule-ent-verb', 'rule', 'ils parlent', 'the -ent of a verb\'s they-form is silent: parle, parles and parlent are said alike. A noun or adverb in -ent is a nasal a instead (moment, souvent)', { difficulty: 3, ...ex('parlent', 'they speak') }),
  U('rule-no-nasal', 'rule', 'bonne année', 'a vowel before n or m is nasal only when the n or m is not followed by a vowel or another n or m: bon is nasal, bonne is not; an is nasal, année is not', { difficulty: 2, ...ex('année', 'year') }),
  U('rule-s-between-vowels', 'rule', 'maison', 'a single s between two vowels is said z (maison, rose); ss is s (poisson)', { difficulty: 2, ...ex('maison', 'house, home') }),
  U('rule-elision', 'rule', "l' j' d' n' c' qu'", "before a vowel sound the little words le, la, je, de, ne, ce and que lose their vowel and keep an apostrophe; they are said together with the next word (l'homme is said as one word)", { difficulty: 2, ...ex("l'", 'the (le before a vowel)') }),
  U('rule-liaison', 'rule', 'les amis', 'in some fixed combinations a normally silent final consonant is heard before a vowel: les amis is said lay-za-mee (s as z), un ami (n), petit ami (t). Never after et (et elle), and many liaisons are optional', { difficulty: 3, note: 'Shown on phrases, never as a rule of every word. How much liaison is made differs by speaker and region.' }),
  // familiar to an English reader: shapes and sounds close enough to read with
  ...['B b', 'D d', 'F f', 'K k', 'L l', 'M m', 'N n', 'P p', 'T t', 'V v', 'W w', 'Z z'].map((k) => U(k, 'letter', k.split(' ')[1], `${k.split(' ')[1]} as in English`, { familiar: true })),
];

const V = 'aeiouyàâäéèêëîïôöùûüœæ';
/** Private-use stand-ins for the context-dependent spellings found by `prepare`: each maps to the unit key(s) it needs. */
const M = {
  softC: '', softG: '', gu: '', s2v: '', nasA: '', nasO: '', nasE: '', nasU: '', er: '',
  entVerb: '', finalE: '', finalSilent: '', noNasal: '', ill: '', ien: '', oin: '', tion: '',
} as const;

const SPELLINGS: Spelling[] = [
  { written: M.softC, key: 'ce / ci' }, { written: M.softG, key: 'ge / gi' }, { written: M.gu, key: 'gu' }, { written: M.s2v, key: 'rule-s-between-vowels' },
  { written: M.nasA, key: 'an / en' }, { written: M.nasO, key: 'on' }, { written: M.nasE, key: 'in / ain / ein' }, { written: M.nasU, key: 'un' },
  { written: M.er, key: 'rule-final-er' }, { written: M.entVerb, key: 'rule-ent-verb' }, { written: M.finalE, key: 'rule-final-e' },
  { written: M.finalSilent, key: 'rule-final-silent' }, { written: M.noNasal, key: 'rule-no-nasal' }, { written: M.ill, key: 'ill' },
  { written: M.ien, key: 'ien' }, { written: M.oin, key: 'oin' },
  { written: 'eau', key: 'eau' }, { written: 'œu', key: 'œu' }, { written: 'oeu', key: 'œu' }, { written: 'œ', key: 'œ' }, { written: 'oe', key: 'œ' },
  { written: 'ou', key: 'ou' }, { written: 'où', key: 'ù' }, { written: 'oû', key: 'ou' }, { written: 'oi', key: 'oi' }, { written: 'oî', key: 'oi' },
  { written: 'oy', key: ['oi', 'Y y'] }, { written: 'ay', key: ['ai', 'Y y'] }, { written: 'au', key: 'au' }, { written: 'ai', key: 'ai' }, { written: 'aî', key: 'ai' },
  { written: 'ei', key: 'ei' }, { written: 'eu', key: 'eu' }, { written: 'ui', key: 'ui' },
  { written: 'ch', key: 'ch' }, { written: 'ph', key: 'ph' }, { written: 'th', key: 'th' }, { written: 'qu', key: 'qu' }, { written: 'gn', key: 'gn' }, { written: 'ill', key: 'ill' },
  { written: M.tion, key: 'tion' },
  ...UNITS.filter((u) => u.kind === 'letter').map((u) => ({ written: u.key.includes(' ') ? u.key.split(' ')[1] : u.key, key: u.key })),
];

/** Words the spelling rules cannot settle (a final consonant said in some uses and not in others, a loan, an irregular vowel): not modelled, never offered as exercises. */
const NOT_MODELLED: ReadonlySet<string> = new Set(['femme', 'femmes', 'monsieur', 'messieurs', 'plus', 'tous', 'six', 'dix', 'huit', 'sept', 'vingt', 'fils', 'os', 'but', 'fait', 'août', 'doigt', 'examen', 'abdomen', 'oignon']);
/** A final d, p, s, t, x or z that is said. */
const SAID_FINAL: ReadonlySet<string> = new Set(['sud', 'net', 'cap', 'stop', 'top', 'gaz', 'quiz', 'index', 'lynx', 'larynx', 'flux', 'bus', 'autobus', 'virus', 'campus', 'bonus', 'ours', 'hélas', 'atlas', 'ananas', 'tennis', 'jadis', 'maïs', 'lys', 'ouest', 'brut', 'goût', 'sens']);
/** A final -er (or -ers) whose r is said. */
const ER_SAID: ReadonlySet<string> = new Set(['mer', 'fer', 'cher', 'ver', 'hier', 'hiver', 'enfer', 'amer', 'fier', 'vers', 'divers', 'univers', 'travers', 'envers', 'revers', 'super', 'laser', 'cancer', 'poker']);
/**
 * The they-forms of the commonest verbs, whose -ent is silent. The profile cannot tell a verb from a noun by spelling, so a form in
 * -ent is read as a nasal a (moment, souvent) unless it is here, or ends in -aient or -issent (always verbs). A they-form not listed
 * is read as the nasal, which is wrong for it: the notes say so.
 */
const VERB_ENT: ReadonlySet<string> = new Set([
  'parlent', 'aiment', 'mangent', 'donnent', 'passent', 'arrivent', 'trouvent', 'pensent', 'regardent', 'restent', 'entrent', 'tombent', 'marchent', 'travaillent', 'demandent',
  'cherchent', 'commencent', 'continuent', 'montrent', 'portent', 'tournent', 'laissent', 'appellent', 'ouvrent', 'changent', 'coûtent', 'gagnent', 'habitent', 'jouent', 'étudient',
  'oublient', 'copient', 'vendent', 'attendent', 'répondent', 'perdent', 'entendent', 'descendent', 'rendent', 'prennent', 'comprennent', 'apprennent', 'mettent', 'disent', 'lisent',
  'écrivent', 'vivent', 'suivent', 'partent', 'sortent', 'dorment', 'sentent', 'servent', 'offrent', 'courent', 'meurent', 'viennent', 'tiennent', 'deviennent', 'reviennent',
  'doivent', 'peuvent', 'veulent', 'savent', 'boivent', 'reçoivent', 'voient', 'croient', 'font', 'sont', 'ont', 'vont', 'chantent', 'dansent', 'écoutent', 'aident', 'utilisent',
  'trouvent', 'ferment', 'pleurent', 'rient', 'sourient', 'vivent', 'savent', 'achètent', 'espèrent', 'répètent', 'jettent', 'appellent',
].filter((w) => w.endsWith('ent')));
/** A form in -ient whose ien is a nasal e (the verb they-forms of venir and tenir are not here: they are -ennent). */
const IEN_T: ReadonlySet<string> = new Set(['vient', 'tient', 'devient', 'revient', 'convient', 'retient', 'soutient', 'maintient', 'obtient', 'appartient', 'survient', 'parvient', 'prévient', 'contient', 'entretient']);
/** The first word of a liaison that is made before a vowel (the "required" kinds of stage 4 of the orientation). */
const LIAISON_FIRST: ReadonlySet<string> = new Set(['les', 'des', 'ces', 'mes', 'tes', 'ses', 'nous', 'vous', 'ils', 'elles', 'on', 'un', 'deux', 'trois', 'petit', 'grand', 'bon', 'dans', 'chez', 'sans', 'en', 'très', 'bien']);

const illIsL = (s: string): boolean => /^ill/.test(s) || s.startsWith('vill') || /ville(s)?$/.test(s) || /^mill(e|es|ion|ions|iard|iards|ionnaire)$/.test(s) || s.startsWith('tranquill');
const isVerbEnt = (s: string): boolean => VERB_ENT.has(s) || /aient$/.test(s) || /issent$/.test(s);

const SOFT_NEXT = 'eiyéèêëîï';
const NV = `(?![${V}mn])`; // a nasal needs a following letter that is not a vowel, n or m (or the end of the word)
const RE_SILENT_RUN = /(?:n(gs?)|([dpstxz]+))$/;
const RE_NASALS: ReadonlyArray<[RegExp, string]> = [
  [new RegExp(`oin${NV}`, 'g'), M.oin],
  [new RegExp(`(?:ain|aim|ein|eim)${NV}`, 'g'), M.nasE],
  [new RegExp(`(?:in|im|yn|ym)${NV}`, 'g'), M.nasE],
  [new RegExp(`(?:un|um)${NV}`, 'g'), M.nasU],
  [new RegExp(`(?:an|am|en|em)${NV}`, 'g'), M.nasA],
  [new RegExp(`(?:on|om)${NV}`, 'g'), M.nasO],
];
const RE_NOT_NASAL = new RegExp(`(?:ain|aim|ein|eim|oin|in|im|yn|ym|un|um|an|am|en|em|on|om)(?=[${V}mn])`);

/** One word (letters only, lower case) with its context-dependent spellings replaced by stand-ins; `elided` is a piece before an apostrophe. */
function prepare(base: string, elided: boolean): string {
  let w = base.replace(/emment$/, 'amment');
  if (illIsL(w)) w = w.replace(/ll/g, 'l');
  const verbEnt = !elided && isVerbEnt(w);
  const er = !elided && !verbEnt && w.length >= 3 && /(er|ers|ez)$/.test(w) && !ER_SAID.has(w.replace(/s$/, ''));
  let run = '';
  if (!elided && !verbEnt && !er && !SAID_FINAL.has(w) && !SAID_FINAL.has(w.replace(/s$/, ''))) {
    const m = RE_SILENT_RUN.exec(w);
    if (m && m.index + (m[1] ? 1 : 0) > 0) run = m[1] ?? m[2];
  }
  const ienEnd = !elided && (/(?:i|y|é)ens?$/.test(w) || IEN_T.has(w));
  // what depends on the letters that follow: s between vowels, the soft and hard c and g
  let t = w.replace(new RegExp(`([${V}])s(?=[${V}])`, 'g'), `$1${M.s2v}`)
    .replace(new RegExp(`c(?=[${SOFT_NEXT}])`, 'g'), M.softC)
    .replace(new RegExp(`gu(?=[${SOFT_NEXT}])`, 'g'), M.gu)
    .replace(/ge(?=[aoàâôu])/g, M.softG)
    .replace(new RegExp(`g(?=[${SOFT_NEXT}])`, 'g'), M.softG)
    .replace(new RegExp(`([aeiouœ])ill`, 'g'), `$1${M.ill}`);
  // the end of the word
  let tail = '';
  if (verbEnt) { t = t.slice(0, -3); tail = M.entVerb; }
  else if (er) { t = t.replace(/(er|ers|ez)$/, ''); tail = M.er; }
  else if (run) { t = t.slice(0, t.length - run.length); tail = M.finalSilent; }
  if (!elided && !verbEnt && !er) t = t.replace(/([aeiouœ])il$/, `$1${M.ill}`);
  if (ienEnd) t = t.replace(/ien$/, M.ien).replace(/(y|é)en$/, `$1${M.nasE}`);
  else if (w === 'bientôt') t = t.replace(/ien/, M.ien);
  t = t.replace(new RegExp(`tion${NV}`, 'g'), M.tion); // before the nasals: the on of -tion is part of it
  for (const [re, to] of RE_NASALS) t = t.replace(re, to);
  if (RE_NOT_NASAL.test(t)) tail += M.noNasal;
  // a final e is silent after another vowel sound (petite, parle, rue); the words le, je, que, ce keep their weak e
  if (!elided && !verbEnt && !er && t.endsWith('e') && /[aeiouyàâäéèêëîïôöùûüœæ]/.test(w.slice(0, w.length - run.length - 1).replace(/(qu|gu)/g, ''))) { t = t.slice(0, -1); tail += M.finalE; }
  return t + tail;
}

/** The keys of one piece of a written form (letters only). `elided` is a piece before an apostrophe (l', j', qu'). */
function pieceKeys(piece: string, elided: boolean): string[] | undefined {
  if (!elided && NOT_MODELLED.has(piece)) return undefined;
  if (elided && piece === 'c') return ['ce / ci'];
  return greedyDependencies(prepare(piece, elided), { spellings: SPELLINGS }) ?? undefined;
}

function dependencies(form: string): string[] | undefined {
  const text = form.normalize('NFC').toLowerCase().replace(/[‘’ʼ`]/g, "'");
  const keys: string[] = [];
  const push = (ks: readonly string[]): void => { for (const k of ks) if (!keys.includes(k)) keys.push(k); };
  const tokens = text.split(/\s+/).filter(Boolean);
  const wordsOnly: string[] = [];
  for (const token of tokens) wordsOnly.push(token.replace(/[^\p{L}-]/gu, '').replace(/^-+|-+$/g, ''));
  for (let ti = 0; ti < tokens.length; ti++) {
    const pieces = tokens[ti].split("'");
    for (let i = 0; i < pieces.length; i++) {
      const elided = i < pieces.length - 1;
      if (elided) push(['rule-elision']);
      for (const part of pieces[i].split('-')) {
        const letters = part.replace(/[^\p{L}]/gu, '');
        if (!letters) continue;
        const ks = pieceKeys(letters, elided);
        if (!ks) return undefined;
        push(ks);
      }
    }
  }
  for (let i = 0; i + 1 < wordsOnly.length; i++) {
    if (LIAISON_FIRST.has(wordsOnly[i]) && /^[aeiouyàâäéèêëîïôöùûœ]/.test(wordsOnly[i + 1])) push(['rule-liaison']);
  }
  return keys;
}

export const FR_PROFILE: ScriptProfile = {
  languageId: 'fr', scriptId: 'Latn', firstBatch: 5, laterBatch: 4,
  units: UNITS, words: WORDS, phrases: PHRASES,
  confusions: [
    { a: 'ou', b: 'U u', tell: 'ou is oo as in food (vous); u alone is ee with rounded lips (tu)' },
    { a: 'é', b: 'è', tell: 'é is ay, short (thé); è is e as in bed (père)' },
    { a: 'an / en', b: 'on', tell: 'an and en are nasal a (enfant); on is nasal o (bon): say the first vowel' },
    { a: 'in / ain / ein', b: 'un', tell: 'in is nasal e (vin), un is nasal u (un); many speakers in France say both the same' },
    { a: 'on', b: 'rule-no-nasal', tell: 'on before a vowel or another n or m is not nasal: bon (nasal), bonne (not)' },
    { a: 'ai', b: 'oi', tell: 'ai is e as in bed (mais, lait); oi is wa (moi)' },
    { a: 'ch', b: 'C c', tell: 'ch is sh (chat); c alone is k or s (sac, ici)' },
    { a: 'S s', b: 'rule-s-between-vowels', tell: 'a single s between two vowels is z (maison); ss and any other s is s (poisson, sel)' },
    { a: 'C c', b: 'ce / ci', tell: 'c is k before a, o, u (sac); s before e, i (ici)' },
    { a: 'G g', b: 'ge / gi', tell: 'g is as in go before a, o, u (gare); zh before e, i (rouge)' },
    { a: 'ge / gi', b: 'gu', tell: 'ge, gi: zh (rouge); gue, gui: g as in go, the u silent (guerre)' },
    { a: 'ç', b: 'C c', tell: 'ç is always s (garçon); c is k before a, o, u' },
  ],
  dependencies,
  notes: 'Written for this deck by an AI model from the French pack\'s own spelling table (src/adapters/french/graphemes.ts) and its orientation (tutorial/fr.ts); not reviewed by a native speaker. It describes the common pronunciation of France; regional French (Québec, Belgium, Switzerland, Africa) differs and is not modelled, and sounds are English approximations, never IPA. Only what an English reader would read wrong is taught; b d f k l m n p t v w z are familiar. Every rule is "usually". LIMITS: (1) A spelling cannot tell a verb from a noun, so a final -ent is read as the nasal a unless the form is in a closed list of the commonest verb they-forms or ends in -aient or -issent; an unlisted verb form (they find: trouvent is listed, others may not be) is read wrongly as a nasal. (2) Liaison is taught only on listed phrases (les amis, nous avons, un enfant …) as a dependency of those phrases, never as a rule of every word, and the planner chooses units from starter words only, so the liaison card comes last. (3) Words the spelling cannot settle (plus, tous, six, dix, huit, sept, vingt, fils, femme, monsieur, doigt, examen …) and the rare letters ä ö ü ÿ æ are not modelled: they are never decoding exercises and count as unsupported on pages. (4) A nasal before h is read as a nasal (enhardir; inhabile is not), tion is read syon (a they-form such as nous étions says tyon), s between vowels is z (parasol is not), -ill is ee-y except in ville, mille, million and a few others, and the weak e inside a word is not modelled. (5) The weights of the starter words are list order, not frequency: the pack has no French frequency list.',
};
