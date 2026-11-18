/**
 * French spelling-to-sound help: a written word cut into its spelling patterns, each with the sound it USUALLY has.
 *
 * HONESTY. Drafted by an AI model; not checked by a native speaker. It describes the common pronunciation of France.
 * Québec, Belgium, Switzerland and Africa differ in places (un and in are one sound for many speakers in France and two
 * elsewhere; vowel length matters in Québec and Belgium; huit, septante and nonante differ) and this file says only what is
 * safe to say everywhere. A sound is written as a plain-English approximation and a respelling, NEVER as IPA, and nothing here
 * is a transcription: a word's IPA comes from the dictionary (pronunciation.ts only passes it on). A rule is "usually"; the
 * common exceptions are named in `note` or lowered to certainty 'context' / 'uncertain'. French spelling cannot be read off
 * by rule alone (est, plus, tous, ent, final consonants), and the function says so instead of guessing.
 *
 * Contract: the graphemes of a word cover its characters exactly once, in order, with offsets into the string given.
 * An apostrophe or hyphen is a grapheme of kind 'silent'. The function cannot tell a verb from a noun, so -ent is 'context'.
 */

export interface FrGrapheme {
  text: string;
  start: number;
  end: number;
  /** Plain-English approximation plus a simple respelling; never IPA. */
  sound: string;
  kind: 'vowel' | 'nasal' | 'consonant' | 'silent' | 'semivowel';
  /** usual: the sound in most words. context: depends on something the spelling alone cannot show. uncertain: varies from word to word. */
  certainty: 'usual' | 'context' | 'uncertain';
  note?: string;
}

/** The table the rules come from, in teaching order. Reused by the tutorial and by GoReview's Alphabet deck. */
export const FRENCH_PATTERNS: ReadonlyArray<{ pattern: string; sound: string; examples: string[]; note?: string }> = [
  { pattern: 'ou', sound: 'oo as in food', examples: ['vous', 'jour', 'nous'], note: 'Before another vowel it is a quick w: oui, jouer.' },
  { pattern: 'oi', sound: 'wa (w plus a as in father)', examples: ['moi', 'trois', 'soir'] },
  { pattern: 'au, eau', sound: 'o as in go (short and pure, with no w glide)', examples: ['au', 'beau', 'chaud'] },
  { pattern: 'ai, ei', sound: 'e as in bed', examples: ['mais', 'lait', 'neige'], note: 'In j\'ai and in je parlerai many speakers say it nearer to ay.' },
  { pattern: 'eu, œu', sound: 'like the u in fur without the r (lips rounded)', examples: ['peu', 'deux', 'cœur'], note: 'In forms of avoir (eu, j\'ai eu) it is said like u (ee with rounded lips).' },
  { pattern: 'u', sound: 'ee said with rounded lips (as for oo); like German ü', examples: ['tu', 'rue', 'sur'], note: 'English has no such sound: say ee while rounding the lips as for oo.' },
  { pattern: 'é, -er, -ez (end of word)', sound: 'ay (short, pure)', examples: ['été', 'parler', 'chez'], note: 'The r of -er and the z of -ez are silent. In mer, fer, cher, hier and hiver the r is said.' },
  { pattern: 'è, ê, ë', sound: 'e as in bed (open)', examples: ['mère', 'être', 'Noël'] },
  { pattern: 'e (no accent)', sound: 'a weak uh, often dropped in fast speech; e as in bed before two consonants', examples: ['le', 'petit', 'elle'], note: 'Final e is usually silent; see below.' },
  { pattern: 'an, en, am, em', sound: 'nasal a (a said through the nose; the n is not pronounced)', examples: ['dans', 'enfant', 'temps'], note: 'Only nasal when the n or m is NOT followed by a vowel or another n or m: an but année.' },
  { pattern: 'on, om', sound: 'nasal o (o said through the nose; the n is not pronounced)', examples: ['bon', 'nom', 'pont'] },
  { pattern: 'in, im, ain, ein, yn, ym', sound: 'nasal e (e as in bed said through the nose; the n is not pronounced)', examples: ['vin', 'pain', 'plein'] },
  { pattern: 'un, um', sound: 'nasal u (for many speakers in France the same as in)', examples: ['un', 'brun', 'parfum'], note: 'In much of France un and in have merged; elsewhere (Québec, Belgium, Switzerland, parts of the south) they are kept apart.' },
  { pattern: 'ien (end of word)', sound: 'y plus nasal e', examples: ['bien', 'rien', 'chien'], note: 'In -ience and -ient words (science, patient) the en is nasal a instead.' },
  { pattern: 'oin', sound: 'w plus nasal e', examples: ['loin', 'point', 'moins'] },
  { pattern: 'ui', sound: 'wee (a quick rounded w, then ee)', examples: ['nuit', 'huit', 'lui'] },
  { pattern: 'n or m before a vowel', sound: 'the vowel is NOT nasal; the n or m is said', examples: ['bonne', 'année', 'inutile'], note: 'bon is nasal, bonne is not; an is nasal, année is not.' },
  { pattern: 'gn', sound: 'ny as in canyon', examples: ['montagne', 'signe', 'agneau'], note: 'A few learned words keep g and n apart: diagnostic, stagner.' },
  { pattern: 'ch', sound: 'sh', examples: ['chat', 'chercher', 'riche'], note: 'In words from Greek it is k: chaos, orchestre, chrétien, technique.' },
  { pattern: 'qu', sound: 'k', examples: ['que', 'qui', 'musique'], note: 'A few learned words say kw: aquarium, équateur.' },
  { pattern: 'c before e, i, y; ç', sound: 's', examples: ['ce', 'ici', 'garçon'], note: 'ç (c cedilla) is used before a, o, u to keep the s sound: ça, français.' },
  { pattern: 'c before a, o, u', sound: 'k', examples: ['café', 'comme', 'cuisine'] },
  { pattern: 'g before e, i, y; ge', sound: 'zh (the s of measure)', examples: ['manger', 'rouge', 'mangeons'], note: 'In ge before a, o, u the e is silent and only softens the g.' },
  { pattern: 'g before a, o, u; gu before e, i', sound: 'g as in go', examples: ['gare', 'gros', 'guerre'], note: 'In gue and gui the u is silent (guide). A few words differ (aiguille).' },
  { pattern: 'j', sound: 'zh (the s of measure)', examples: ['je', 'jour', 'jamais'] },
  { pattern: 's between vowels', sound: 'z', examples: ['maison', 'rose', 'cuisine'], note: 'ss is s, not z: poisson (fish) is not poison. A few compounds keep s (parasol).' },
  { pattern: 'ill', sound: 'ee-y after a consonant (fille); just y after a vowel (travail, paille)', examples: ['fille', 'famille', 'travailler'], note: 'Exceptions where the double l is said: ville, mille, million, tranquille.' },
  { pattern: 'th, ph', sound: 't and f', examples: ['thé', 'photo', 'téléphone'] },
  { pattern: 'tion', sound: 'syon (nasal o at the end)', examples: ['nation', 'attention', 'solution'], note: 'After s the t stays t: question.' },
  { pattern: 'h', sound: 'silent', examples: ['homme', 'heure', 'thé'], note: 'Some words have an aspirated h: it is silent but blocks elision and liaison (le héros).' },
  { pattern: 'x', sound: 'ks (gz in ex- before a vowel)', examples: ['taxi', 'exemple', 'excuse'], note: 'Final x is usually silent: deux, prix.' },
  { pattern: 'doubled consonants', sound: 'said once, like a single letter', examples: ['bonne', 'belle', 'pomme'], note: 'cc before e or i is ks: accident.' },
  { pattern: 'oy, ay before a vowel', sound: 'wa-y, ay-y (the y is a quick glide)', examples: ['voyage', 'moyen', 'payer'] },
  { pattern: 'y (alone)', sound: 'ee', examples: ['y', 'style', 'système'], note: 'Before a vowel at the start of a syllable it is a quick y as in yes: yeux.' },
  { pattern: 'à, â, î, ô, û', sound: 'à like a; â often like a; î like i; ô like o in go; û like u', examples: ['à', 'âge', 'île', 'hôtel', 'sûr'], note: 'The accent mostly separates words (a / à, ou / où) or marks a lost s (forêt, hôpital).' },
  { pattern: 'ë, ï, ü', sound: 'the vowel is said on its own, apart from the one before', examples: ['Noël', 'naïf', 'maïs'] },
  { pattern: 'final e', sound: 'silent', examples: ['petite', 'grande', 'parle'], note: 'It is silent but makes the consonant before it heard: petit (silent t), petite (t said).' },
  { pattern: 'final d, p, s, t, x, z', sound: 'usually silent', examples: ['petit', 'grand', 'trop', 'les', 'deux'], note: 'Exceptions are said: sud, cap, bus, ours, sept; plus, tous, six and dix vary.' },
  { pattern: 'final c, r, f, l', sound: 'usually said (think CaReFuL)', examples: ['avec', 'pour', 'chef', 'sel'], note: 'Exceptions: blanc, banc; r silent in -er verbs (parler); clef; gentil, outil, fils (l silent).' },
  { pattern: '-ent (end of word)', sound: 'silent in a verb (ils parlent); nasal a in a noun, adjective or adverb (moment, souvent)', examples: ['parlent', 'moment', 'souvent'], note: 'The spelling alone cannot tell which.' },
];

const VOWELS = 'aeiouyàâäéèêëîïôöùûüœæ';
const isV = (c: string | undefined): boolean => c !== undefined && c !== '' && VOWELS.includes(c);
const isLetter = (c: string | undefined): boolean => c !== undefined && c !== '' && /\p{L}/u.test(c);

/** Words whose final -er (or -ers) has the r said. */
const ER_SAID: ReadonlySet<string> = new Set(['mer', 'fer', 'cher', 'ver', 'hier', 'hiver', 'enfer', 'amer', 'fier', 'vers', 'divers', 'univers', 'travers', 'envers', 'revers', 'super', 'laser', 'cancer', 'poker']);
/** Words whose final d, p, s, t, x or z (not otherwise silent) is said. */
const SAID_FINAL: ReadonlySet<string> = new Set(['sud', 'sept', 'net', 'cap', 'stop', 'top', 'gaz', 'quiz', 'index', 'lynx', 'larynx', 'flux', 'bus', 'autobus', 'virus', 'campus', 'bonus', 'ours', 'hélas', 'atlas', 'ananas', 'tennis', 'jadis', 'maïs', 'lys', 'fils', 'sens', 'ouest', 'brut', 'goût']);
/** Final s / x / t that is said in some uses and not in others. */
const UNSURE_FINAL: ReadonlySet<string> = new Set(['plus', 'tous', 'os', 'but', 'fait', 'août']);
const C_SILENT: ReadonlySet<string> = new Set(['blanc', 'banc', 'franc', 'flanc', 'tabac', 'estomac', 'porc', 'croc', 'tronc', 'jonc', 'clerc']);
const F_SILENT: ReadonlySet<string> = new Set(['clef', 'clefs', 'cerf', 'cerfs', 'nerf', 'nerfs', 'œufs', 'bœufs']);
const L_SILENT: ReadonlySet<string> = new Set(['gentil', 'outil', 'fusil', 'persil', 'sourcil', 'nombril', 'cul']);
const R_SILENT: ReadonlySet<string> = new Set(['monsieur', 'messieurs', 'gars']);
const EU_AS_U: ReadonlySet<string> = new Set(['eu', 'eus', 'eut', 'eue', 'eues', 'eût']);
const NASAL_E_BEFORE_N = 'iéy';

const CONS: Record<string, string> = {
  b: 'b', d: 'd', f: 'f', k: 'k', l: 'l', m: 'm', n: 'n', p: 'p', t: 't', v: 'v', z: 'z',
  r: 'r (a sound made at the back of the throat, not the English r)',
  j: 'zh (the s of measure)',
};

const NASAL_A = 'nasal a (a said through the nose; the n is not pronounced)';
const NASAL_O = 'nasal o (o said through the nose; the n is not pronounced)';
const NASAL_E = 'nasal e (e as in bed said through the nose; the n is not pronounced)';
const NASAL_U = 'nasal u (u of fur said through the nose; for many speakers the same as nasal e)';
const E_BED = 'e as in bed';
const AY = 'ay (short, pure)';
const SILENT = '(silent)';

/** Is the ill of this word a double l that is said (ville, mille, tranquille)? */
const illIsL = (s: string): boolean => s.startsWith('vill') || s.endsWith('ville') || s.endsWith('villes') || /^mill(e|es|ion|ions|iard|iards|ionnaire)$/.test(s) || s.startsWith('tranquill');
const GREEK_CH = /(chaos|chœur|choeur|chorale|orchestr|chrétien|chrom|christ|techn|écho|echo|psych|archéo|archang|chlor|chron|cholest)/;
const SEPARATE_GN = /(diagn|stagn|agnos|gnom|gnou)/;
const SILENT_P = /(compt|dompt|bapt|^sept|sculpt|rompt)/;

/** The spelling patterns of one letters-only stretch (a word, or a piece of a hyphenated or elided word). */
function segment(s: string, base: number, final: boolean, elided: boolean, out: FrGrapheme[]): void {
  const n = s.length;
  let i = 0;
  let hasVowel = false;
  const stem = s.replace(/s$/, '');
  const said = SAID_FINAL.has(s) || SAID_FINAL.has(stem);
  const push = (len: number, sound: string, kind: FrGrapheme['kind'], certainty: FrGrapheme['certainty'] = 'usual', note?: string): void => {
    const g: FrGrapheme = { text: s.slice(i, i + len), start: base + i, end: base + i + len, sound, kind, certainty };
    if (note) g.note = note;
    out.push(g);
    if (kind === 'vowel' || kind === 'nasal' || kind === 'semivowel') hasVowel = true;
    i += len;
  };
  /** n or m makes a nasal vowel only when not followed by a vowel or another n/m. */
  const nasalOk = (j: number): boolean => {
    const d = s[j];
    return d === undefined || (!isV(d) && d !== 'n' && d !== 'm');
  };

  if (final && s === 'est') {
    push(1, E_BED, 'vowel');
    push(2, SILENT, 'silent', 'context', 'The verb est ("is") is said like è, with s and t silent. The word est meaning east, and ouest, have the s and t said.');
    return;
  }
  if (final && s === 'et') {
    push(1, AY, 'vowel', 'usual', 'The word et ("and") is said "ay".');
    push(1, SILENT, 'silent', 'usual', 'The t of et is never heard, not even before a vowel: et elle.');
    return;
  }
  if (final && EU_AS_U.has(s)) {
    push(2, 'u (ee with rounded lips)', 'vowel', 'usual', 'In forms of avoir (eu, j\'ai eu) the eu is said like u, not like eu in peu.');
  }

  while (i < n) {
    const c = s[i];
    const r = s.slice(i);
    const nx = s[i + 1];
    const n2 = s[i + 2];
    const prev = s[i - 1];

    // ---------------------------------------------------------------- end-of-word patterns
    if (final && i > 0) {
      if (/^ents?$/.test(r)) {
        push(3, 'silent in a verb (ils parlent); nasal a in a noun, adjective or adverb (moment, souvent)', 'nasal', 'context', 'The spelling alone cannot tell a verb from another word. As the third person plural of a verb -ent is silent (ils parlent is said like il parle); in other words it is nasal a and the t is silent.');
        continue;
      }
      const split = (vowel: string, silentNote: string, vNote?: string): void => {
        const len = r.length;
        push(1, vowel, 'vowel', 'usual', vNote);
        push(len - 1, SILENT, 'silent', 'usual', silentNote);
      };
      if (/^ers?$/.test(r) && !ER_SAID.has(s) && !ER_SAID.has(stem)) {
        split(`${AY} (-er)`, 'The r of -er (parler, premier) is silent. In mer, fer, cher, hier and hiver it is said.');
        continue;
      }
      if (r === 'ez') { split(`${AY} (-ez)`, 'The z of -ez (nez, chez, vous parlez) is silent.'); continue; }
      if (/^eds?$/.test(r)) { split(`${AY} (-ed)`, 'The d of pied is silent.'); continue; }
      if (/^ets?$/.test(r) && !said) {
        split(s.length <= 3 ? `${AY} (-et)` : `${E_BED} (-et)`, 'The final t is silent.');
        continue;
      }
      if (r === 'es') {
        if (hasVowel) push(2, SILENT, 'silent', 'usual', 'A plural or feminine ending: silent.');
        else {
          const one = ['les', 'des', 'mes', 'tes', 'ses', 'ces'].includes(s);
          push(1, one ? AY : E_BED, 'vowel', 'usual', one ? 'Said alone, les is "lay".' : undefined);
          push(1, SILENT, 'silent', 'usual', 'Before a vowel the s may be heard as z (liaison): les amis.');
        }
        continue;
      }
      if (r === 'e') {
        if (hasVowel) push(1, SILENT, 'silent', 'usual', 'Usually silent, but it makes the consonant before it heard: petit (t silent), petite (t said).');
        else push(1, 'uh (short and weak, as the a of about)', 'vowel', 'usual', 'In one-syllable words such as le, de, je, ne, que the e is a weak uh.');
        continue;
      }
    }

    // ---------------------------------------------------------------- non-letters never reach here
    switch (c) {
      case 'a': {
        if (r.startsWith('ain') || r.startsWith('aim')) {
          if (nasalOk(i + 3)) { push(3, NASAL_E, 'nasal'); continue; }
        }
        if (final && /^ails?$/.test(r)) { push(3, 'a as in father plus a quick y (travail)', 'vowel', 'usual', 'Final -ail is said "ah-y".'); continue; }
        if (nx === 'i' && !r.startsWith('aill')) { push(2, E_BED, 'vowel'); continue; }
        if (nx === 'u') { push(2, 'o as in go (short, pure)', 'vowel'); continue; }
        if ((nx === 'n' || nx === 'm') && nasalOk(i + 2)) { push(2, NASAL_A, 'nasal'); continue; }
        push(1, 'a as in father (short)', 'vowel');
        continue;
      }
      case 'à': push(1, 'a as in father (short)', 'vowel', 'usual', 'The accent only tells à from a (preposition from verb).'); continue;
      case 'â': push(1, 'a as in father (many speakers; some say a deeper, longer ah)', 'vowel'); continue;
      case 'ä': push(1, 'a as in father', 'vowel'); continue;
      case 'æ': push(1, 'ay or e, as in the few words that have it', 'vowel', 'uncertain'); continue;
      case 'e': {
        if (r.startsWith('eau')) { push(3, 'o as in go (short, pure)', 'vowel'); continue; }
        if (r.startsWith('eu')) { push(2, 'like the u in fur without the r (lips rounded)', 'vowel', 'usual'); continue; }
        if (r.startsWith('eû')) { push(2, 'u (ee with rounded lips)', 'vowel'); continue; }
        if ((r.startsWith('ein') || r.startsWith('eim')) && nasalOk(i + 3)) { push(3, NASAL_E, 'nasal'); continue; }
        if (final && /^eils?$/.test(r)) { push(3, 'e as in bed plus a quick y (soleil)', 'vowel', 'usual', 'Final -eil is said "e-y".'); continue; }
        if (nx === 'i' && !r.startsWith('eill')) { push(2, E_BED, 'vowel'); continue; }
        if ((s === 'femme' || s === 'femmes') && i === 1) { push(1, 'a (short): femme is said "fam"', 'vowel', 'usual', 'e is said like a in femme and in the adverb ending -emment (évidemment).'); continue; }
        if (final && r === 'emment') { push(1, 'a (short): -emment is said "a-man"', 'vowel', 'usual', 'e is said like a in -emment (évidemment) and in femme.'); continue; }
        if ((nx === 'n' || nx === 'm') && nasalOk(i + 2)) {
          const atEnd = n2 === undefined || (n2 === 's' && s[i + 3] === undefined);
          if (atEnd && final && prev !== undefined && NASAL_E_BEFORE_N.includes(prev)) {
            push(2, NASAL_E, 'nasal', 'context', 'After i, é or y a final en is nasal e (bien, européen, moyen).');
          } else if (atEnd && final && i > 0) {
            push(2, NASAL_A, 'nasal', 'context', 'A final en is nasal e in a few learned words (examen) and nasal a in most others.');
          } else {
            push(2, NASAL_A, 'nasal');
          }
          continue;
        }
        // single e
        const c1 = nx;
        const c2 = n2;
        if (c1 === 'x') { push(1, E_BED, 'vowel', 'usual', 'ex- is said "eks" or "egz" with an open e.'); continue; }
        if (isLetter(c1) && !isV(c1)) {
          const cluster = c2 !== undefined && isLetter(c2) && !isV(c2) && !('rl'.includes(c2) && 'bcdfgptv'.includes(c1));
          if (c2 === undefined || cluster) { push(1, E_BED, 'vowel', 'usual', 'Before two consonants, or a final consonant, e is said as in bed.'); continue; }
        }
        push(1, 'a weak uh (short; often dropped in fast speech)', 'vowel', 'context', 'An e before a single consonant and a vowel is weak (petit, regarder, demain); in some words it is said like é or è (secret, mère).');
        continue;
      }
      case 'é': push(1, AY, 'vowel'); continue;
      case 'è': case 'ê': case 'ë': push(1, `${E_BED} (open)`, 'vowel', 'usual', c === 'ë' ? 'ë means the e is said on its own (Noël).' : undefined); continue;
      case 'i': case 'î': case 'ï': {
        if (c === 'i') {
          if (r.startsWith('ill')) {
            if (illIsL(s)) { push(3, 'il: the double l is said as l (ville, mille)', 'consonant', 'usual', 'Exceptions to the usual ee-y: ville, mille, million, tranquille.'); continue; }
            if (prev !== undefined && isV(prev)) push(3, 'y (as in yes) after the vowel: paille, travaille', 'semivowel', 'usual');
            else push(3, 'ee-y (fille, famille)', 'semivowel', 'usual', 'Exceptions where the double l is said: ville, mille, million, tranquille.');
            continue;
          }
          if (final && /^ils?$/.test(r) && prev !== undefined && ((prev === 'œ') || (prev === 'u' && s[i - 2] === 'e'))) {
            push(2, 'y (a quick glide): œil, deuil', 'semivowel', 'usual');
            continue;
          }
          if ((nx === 'n' || nx === 'm') && nasalOk(i + 2)) {
            push(2, NASAL_E, 'nasal', r === 'ing' || r === 'ings' ? 'context' : 'usual', r === 'ing' || r === 'ings' ? 'In English loans (camping, parking) the g is said and the vowel is not nasal.' : undefined);
            continue;
          }
          if (isV(nx) && !(final && (nx === 'e' && (n2 === undefined || (n2 === 's' && s[i + 3] === undefined)))) && nx !== 'u') {
            push(1, 'y (a quick glide) before a vowel', 'semivowel', 'context', 'i before another vowel is usually a quick y (hier, lion, pied); a few words keep ee + vowel (naïf, haïr).');
            continue;
          }
        }
        push(1, 'ee as in see', 'vowel', 'usual', c === 'ï' ? 'ï means the i is said on its own (naïf, maïs).' : undefined);
        continue;
      }
      case 'o': {
        if (r.startsWith('oin') && nasalOk(i + 3)) { push(3, 'w plus nasal e', 'nasal'); continue; }
        if (r.startsWith('oui') && !r.startsWith('ouill') && !r.startsWith('ouin')) { push(3, 'wee (a quick w, then ee)', 'semivowel'); continue; }
        if (r.startsWith('oeu')) { push(3, 'like the u in fur without the r (lips rounded)', 'vowel'); continue; }
        if (nx === 'u') {
          push(2, 'oo as in food', 'vowel', 'usual', isV(n2) ? 'Before another vowel it is a quick w (oui, jouer).' : undefined);
          continue;
        }
        if (nx === 'ù' || nx === 'û') { push(2, 'oo as in food', 'vowel'); continue; }
        if (nx === 'i' || nx === 'î') { push(2, 'wa (w plus a as in father)', 'vowel'); continue; }
        if (nx === 'y' && isV(n2)) { push(2, 'wa-y (wa then a quick y)', 'vowel', 'usual'); continue; }
        if ((nx === 'n' || nx === 'm') && nasalOk(i + 2)) { push(2, NASAL_O, 'nasal'); continue; }
        push(1, 'o as in more (lips rounded; nearer go at the end of a syllable)', 'vowel', 'context');
        continue;
      }
      case 'ô': push(1, 'o as in go (short, pure)', 'vowel'); continue;
      case 'ö': push(1, 'o', 'vowel', 'uncertain'); continue;
      case 'œ': {
        if (nx === 'u') { push(2, 'like the u in fur without the r (lips rounded)', 'vowel'); continue; }
        push(1, 'like the u in fur without the r (lips rounded)', 'vowel');
        continue;
      }
      case 'u': {
        if (nx === 'i') { push(2, 'wee (a quick rounded w, then ee)', 'semivowel'); continue; }
        if ((nx === 'n' || nx === 'm') && nasalOk(i + 2)) {
          if (nx === 'm' && final && i + 2 === n) push(2, NASAL_U, 'nasal', 'context', 'A final um is nasal in parfum but said "om" in Latin words (album, maximum).');
          else push(2, NASAL_U, 'nasal');
          continue;
        }
        push(1, 'ee said with rounded lips (like German ü)', 'vowel');
        continue;
      }
      case 'ù': case 'û': case 'ü': push(1, 'ee said with rounded lips (like German ü)', 'vowel'); continue;
      case 'y': {
        if ((nx === 'n' || nx === 'm') && nasalOk(i + 2)) { push(2, NASAL_E, 'nasal'); continue; }
        if (isV(nx) && !isV(prev)) { push(1, 'y as in yes', 'semivowel', 'usual'); continue; }
        if (isV(nx) && isV(prev)) { push(1, 'a quick y after ee (pays, payer)', 'semivowel', 'uncertain'); continue; }
        push(1, 'ee as in see', 'vowel');
        continue;
      }

      // ------------------------------------------------------------ consonants
      case 'c': {
        if (r.startsWith('ch')) {
          if (GREEK_CH.test(s)) push(2, 'k', 'consonant', 'context', 'In words from Greek ch is k (chaos, orchestre, chrétien, technique).');
          else push(2, 'sh', 'consonant', 'usual', 'In words from Greek ch is k (chaos, orchestre, technique).');
          continue;
        }
        if (nx === 'c') {
          if (n2 !== undefined && 'eiyéèê'.includes(n2)) push(2, 'ks', 'consonant', 'usual', 'cc before e or i is ks (accident).');
          else push(2, 'k', 'consonant');
          continue;
        }
        if (nx === 'k') { push(2, 'k', 'consonant'); continue; }
        if (elided && s === 'c' && n === 1) { push(1, 's (c\' is ce: c\'est is said "seh")', 'consonant', 'usual'); continue; }
        if (final && /^cs?$/.test(r) && i > 0) {
          if (C_SILENT.has(s) || C_SILENT.has(stem)) { push(r.length, SILENT, 'silent', 'context', 'A silent final c: blanc, banc, franc, tabac.'); continue; }
          push(1, 'k', 'consonant', 'usual', 'Final c is usually said (avec, sac); blanc, banc and a few others are exceptions.');
          continue;
        }
        if (final && /^cts?$/.test(r) && i > 0) {
          push(r.length, 'k then t, or silent', 'consonant', 'uncertain', 'Final ct is said in exact, direct, contact and silent in respect, aspect, suspect.');
          continue;
        }
        if (nx !== undefined && 'eiyéèêëîï'.includes(nx)) { push(1, 's', 'consonant', 'usual'); continue; }
        push(1, 'k', 'consonant');
        continue;
      }
      case 'ç': push(1, 's', 'consonant', 'usual', 'ç (c cedilla) keeps the s sound before a, o, u: ça, français.'); continue;
      case 'g': {
        if (final && /^gts?$/.test(r) && i > 0) { push(r.length, SILENT, 'silent', 'usual', 'Silent g and t: vingt, doigt.'); continue; }
        if (final && /^gs?$/.test(r) && prev === 'n') {
          push(r.length, SILENT, 'silent', 'context', 'After n at the end the g is silent in French words (long, sang, rang) and said in English loans (camping, parking).');
          continue;
        }
        if (nx === 'n') {
          if (i === 0 || SEPARATE_GN.test(s)) push(2, 'g then n, said separately', 'consonant', 'context', 'In a few learned words g and n are not joined (diagnostic, stagner, gnome).');
          else push(2, 'ny as in canyon', 'consonant', 'usual', 'A few learned words keep g and n apart (diagnostic, stagner).');
          continue;
        }
        if (nx === 'e' && n2 !== undefined && 'aouôâ'.includes(n2)) { push(2, 'zh (the e is silent: it only softens the g)', 'consonant', 'usual', 'ge before a, o, u: mangeons, geai.'); continue; }
        if (nx === 'u' && n2 !== undefined && 'eiyéèê'.includes(n2)) { push(2, 'g as in go (the u is silent)', 'consonant', 'usual', 'In gue and gui the u only keeps the g hard (guerre, guide); a few words differ (aiguille).'); continue; }
        if (nx !== undefined && 'eiyéèêëîï'.includes(nx)) { push(1, 'zh (the s of measure)', 'consonant', 'usual'); continue; }
        push(nx === 'g' ? 2 : 1, 'g as in go', 'consonant');
        continue;
      }
      case 'h': push(1, SILENT, 'silent', 'usual', 'h is silent. In a few words (h aspiré: le héros) it still blocks elision and liaison.'); continue;
      case 'p': {
        if (nx === 'h') { push(2, 'f', 'consonant'); continue; }
        if (final && /^[dpstxz]+$/.test(r) && i > 0 && !said) {
          push(r.length, SILENT, 'silent', 'usual', 'A final p (trop, beaucoup, temps) is usually silent.');
          continue;
        }
        if (nx === 't' && SILENT_P.test(s)) { push(1, SILENT, 'silent', 'context', 'p is silent in compter, compte, sept, baptême.'); continue; }
        push(nx === 'p' ? 2 : 1, 'p', 'consonant');
        continue;
      }
      case 'q': {
        if (nx === 'u') { push(2, 'k', 'consonant', 'usual', 'A few learned words say kw (aquarium, équateur).'); continue; }
        if (s === 'cinq') { push(1, 'k', 'consonant', 'context', 'The q of cinq is said at the end of a phrase and before a vowel, often silent before a consonant.'); continue; }
        push(1, 'k', 'consonant');
        continue;
      }
      case 's': {
        if (final && i > 0 && /^[dpstxz]+$/.test(r) && !said) {
          if (r === 'st' || r === 'sts') { push(r.length, 'st (said in most words: test, ouest)', 'consonant', 'uncertain', 'Final st is said in test and ouest; the verb est is the exception.'); continue; }
          if (UNSURE_FINAL.has(s) || UNSURE_FINAL.has(stem)) { push(r.length, 'silent or said, depending on the use', 'silent', 'uncertain', 'The final consonant of plus, tous, os, but, fait, août is said in some uses and silent in others.'); continue; }
          push(r.length, SILENT, 'silent', 'usual', 'A final s is usually silent (les, temps, petits).');
          continue;
        }
        if (nx === 'c' && n2 !== undefined && 'eiyéèê'.includes(n2)) { push(2, 's (the c is silent before e, i)', 'consonant'); continue; }
        if (nx === 's') { push(2, 's', 'consonant', 'usual', 'ss is s, not z: poisson (fish) is not poison.'); continue; }
        if (prev !== undefined && isV(prev) && isV(nx)) { push(1, 'z', 'consonant', 'usual', 'An s between two vowels is z (maison, rose). A few compounds keep s (parasol).'); continue; }
        push(1, 's', 'consonant');
        continue;
      }
      case 't': {
        if (nx === 'h') { push(2, 't', 'consonant'); continue; }
        if (nx === 'i' && n2 === 'o' && s[i + 3] === 'n' && prev !== 's') {
          push(2, 's (-tion is said "syon")', 'consonant', 'usual', 'tion is said "syon" (nation); after s it stays t (question). A few other words with ti + vowel have s too (patient).');
          continue;
        }
        if (final && i > 0 && /^[dpstxz]+$/.test(r) && !said) {
          if (r === 'st' || r === 'sts') { push(r.length, 'st', 'consonant', 'uncertain'); continue; }
          if (s === 'huit') { push(1, 't', 'consonant', 'context', 'The t of huit is said at the end of a phrase and before a vowel, often silent before a consonant.'); continue; }
          if (UNSURE_FINAL.has(s)) { push(r.length, 'silent or said, depending on the use', 'silent', 'uncertain', 'The final consonant of but, fait, août is said in some uses and silent in others.'); continue; }
          push(r.length, SILENT, 'silent', 'usual', 'A final t is usually silent (petit, grand, tout).');
          continue;
        }
        if (final && s === 'huit' && r === 't') { push(1, 't', 'consonant', 'context', 'The t of huit is said at the end of a phrase and before a vowel, often silent before a consonant.'); continue; }
        push(nx === 't' ? 2 : 1, 't', 'consonant');
        continue;
      }
      case 'd': case 'z': {
        if (final && i > 0 && /^[dpstxz]+$/.test(r) && !said) {
          push(r.length, SILENT, 'silent', 'usual', c === 'd' ? 'A final d is usually silent (grand, pied).' : 'A final z is usually silent (nez, chez, assez).');
          continue;
        }
        push(nx === c ? 2 : 1, CONS[c], 'consonant');
        continue;
      }
      case 'x': {
        if (final && i > 0 && /^[dpstxz]+$/.test(r) && !said) {
          if (s === 'six' || s === 'dix') { push(1, 's', 'consonant', 'context', 'The x of six and dix is said s at the end of a phrase, z before a vowel, and silent before a consonant.'); continue; }
          push(r.length, SILENT, 'silent', 'usual', 'A final x is usually silent (deux, prix, heureux).');
          continue;
        }
        if (i === 1 && s[0] === 'e' && isV(nx)) { push(1, 'gz', 'consonant', 'usual', 'ex- before a vowel is said "egz" (exemple, examen).'); continue; }
        push(1, 'ks', 'consonant', 'usual');
        continue;
      }
      case 'f': {
        if (final && /^fs?$/.test(r) && i > 0 && (F_SILENT.has(s) || F_SILENT.has(stem))) { push(r.length, SILENT, 'silent', 'context', 'A silent final f: clef, cerf, œufs, bœufs.'); continue; }
        if (s === 'neuf' && i === n - 1) { push(1, 'f', 'consonant', 'context', 'neuf is said "nuf"; before ans and heures the f is heard as v.'); continue; }
        push(nx === 'f' ? 2 : 1, 'f', 'consonant');
        continue;
      }
      case 'l': {
        if (r === 'l' && final && L_SILENT.has(s) && i > 0) { push(1, SILENT, 'silent', 'context', 'A silent final l: gentil, outil, fusil.'); continue; }
        if (r === 'ls' && final && L_SILENT.has(stem) && i > 0) { push(2, SILENT, 'silent', 'context'); continue; }
        push(nx === 'l' ? 2 : 1, 'l', 'consonant');
        continue;
      }
      case 'r': {
        if (final && R_SILENT.has(s) && /^rs?$/.test(r)) { push(r.length, SILENT, 'silent', 'context', 'The r of monsieur is silent.'); continue; }
        push(nx === 'r' ? 2 : 1, CONS.r, 'consonant');
        continue;
      }
      case 'b': {
        if (final && r === 'b' && prev === 'm') { push(1, SILENT, 'silent', 'usual', 'The b after a final m is silent (plomb).'); continue; }
        push(nx === 'b' ? 2 : 1, 'b', 'consonant');
        continue;
      }
      case 'm': case 'n': push(nx === c ? 2 : 1, c, 'consonant'); continue;
      case 'v': case 'k': case 'j': push(nx === c ? 2 : 1, CONS[c], 'consonant'); continue;
      case 'w': push(1, 'v (or w as in English in borrowed words)', 'consonant', 'uncertain', 'w is rare: v in some words (wagon), w in others (week-end, whisky).'); continue;
      default: break;
    }
    // any other letter
    push(1, '(no rule)', 'consonant', 'uncertain');
  }
}

/** Cuts a written word (lower-cased, NFC) into spelling patterns. Every character is covered exactly once, in order. */
export function frenchGraphemes(word: string): FrGrapheme[] {
  const out: FrGrapheme[] = [];
  const w = word.toLowerCase().length === word.length ? word.toLowerCase() : word;
  let i = 0;
  while (i < w.length) {
    if (!isLetter(w[i])) {
      let j = i;
      while (j < w.length && !isLetter(w[j])) j++;
      const text = w.slice(i, j);
      const note = /['’ʼ`´]/u.test(text) ? 'The apostrophe marks a vowel dropped before a vowel sound (l\'homme): the two words are said as one.' : text.includes('-') ? 'A hyphen joins the parts of one word or of a verb with its pronoun.' : undefined;
      const g: FrGrapheme = { text: word.slice(i, j), start: i, end: j, sound: '(not a sound)', kind: 'silent', certainty: 'usual' };
      if (note) g.note = note;
      out.push(g);
      i = j;
      continue;
    }
    let j = i;
    while (j < w.length && isLetter(w[j])) j++;
    const after = w[j];
    const elided = after !== undefined && /['’ʼ`´]/u.test(after);
    const final = !elided;
    const before = out.length;
    segment(w.slice(i, j), i, final, elided, out);
    // keep the original casing of the text, never of the rules
    for (let k = before; k < out.length; k++) out[k].text = word.slice(out[k].start, out[k].end);
    i = j;
  }
  return out;
}
