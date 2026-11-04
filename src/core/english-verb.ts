/**
 * English for an inflected verb: the lemma's citation gloss supplies the English verb, the analyzer's features (mapped by
 * each language adapter to the neutral `VerbShape` below) supply person, number, time, mood and voice. Nothing here reads
 * a source-language form or paradigm; the adapters decide what their features mean (a Greek aorist is a simple past, a
 * Hebrew wayyiqtol "and he …", a Latin perfect subjunctive "may have …"), this module only writes the English.
 *
 * Why: a lexicon cites a verb in one fixed person ("I love" in a Greek lexicon, "he loved" in a Hebrew one, "love, like" in
 * Whitaker), and showing that citation under an inflected form told the reader the wrong person (the owner, 2026-11-03:
 * "2nd person is often translated as 1st"). The first sense of the citation is realized; the whole citation stays beside it
 * as the lemma meaning.
 */

export type VerbPerson = '1' | '2' | '3';
export type VerbNumber = 'Sing' | 'Plur';
export type VerbGender = 'Masc' | 'Fem' | 'Neut';
/** English time/aspect: `progressive-past` is an imperfect ("was loving"), `past` a simple past ("loved"), `perfect` "has loved". */
export type VerbTime = 'present' | 'past' | 'progressive-past' | 'future' | 'perfect' | 'pluperfect' | 'future-perfect';
export type VerbMood = 'indicative' | 'subjunctive' | 'optative' | 'imperative' | 'jussive' | 'cohortative';
export type VerbNonFinite = 'infinitive' | 'participle' | 'gerund' | 'gerundive' | 'supine';

export interface VerbShape {
  finite: boolean;
  nonFinite?: VerbNonFinite;
  /** Defaults to present. For a subjunctive, `present` gives "may …", `progressive-past` "might …", `perfect` "may have …", `pluperfect` "might have …". */
  time?: VerbTime;
  /** Defaults to indicative. */
  mood?: VerbMood;
  passive?: boolean;
  person?: VerbPerson;
  number?: VerbNumber;
  gender?: VerbGender;
  /** Words before the clause: "and " for a Hebrew wayyiqtol or weqatal. */
  prefix?: string;
  /** A derived stem's literal nuance: "caused to …" (a Hebrew Hifil), "… oneself" (a Hitpael). */
  nuance?: 'causative' | 'reflexive';
}

/** One sense of a citation: the English verb (`head`, its base form) and the rest of the phrase ("into being", "in love with"). */
export interface VerbSense { head: string; tail: string; /** A sense the citation marks as the passive's meaning (Whitaker's "(PASS) seem"). */ passive?: boolean }

const STOP = new Set(['a', 'an', 'the', 'of', 'in', 'on', 'to', 'for', 'by', 'with', 'and', 'or', 'not', 'no', 'from', 'into', 'as', 'at', 'he', 'she',
  'it', 'they', 'we', 'you', 'i', 'is', 'are', 'was', 'were', 'who', 'which', 'that', 'this', 'something', 'someone', 'oneself', 'one', 'any', 'some',
  'very', 'so', 'if', 'than', 'then', 'but', 'up', 'down', 'out', 'off', 'over']);
const MODAL = new Set(['can', 'may', 'must', 'shall', 'will', 'could', 'would', 'should', 'might', 'ought']);
/** First-person citation forms whose base is another word. */
const FIRST_PERSON_BASE: Readonly<Record<string, string>> = { am: 'be' };

/**
 * The senses of a verb's citation gloss. Three citation conventions are read: a Greek lexicon's first person ("I say, speak";
 * every sense of such a citation is first person, so "I come into being, am born" gives "come into being" and "be born"),
 * an infinitive ("to eat"), and a bare verb ("love, like; fall in love with"). Senses are split at ";" and ",", a group marked
 * "(PASS)" is the passive's meaning, and other parenthetical notes are dropped. A sense whose first word is not a plausible
 * English verb (a determiner, a pronoun, a modal) is left out; a citation with no usable sense gives [].
 */
export function verbSensesOfCitation(gloss: string | undefined): VerbSense[] {
  const whole = (gloss ?? '').normalize('NFC').replace(/\s+/g, ' ').trim();
  if (!whole) return [];
  const firstPerson = /^I\s/.test(whole);
  const out: VerbSense[] = [];
  for (const group of whole.split(';')) {
    let g = group.trim();
    let passive = false;
    const marker = g.match(/^\((?:PASS|pass\.?|passive)\)\s*/i);
    if (marker) { passive = true; g = g.slice(marker[0].length); }
    for (const piece of g.split(/[,/]/)) {
      let s = piece.replace(/\([^)]*\)/g, ' ').replace(/\s+/g, ' ').trim();
      if (!s) continue;
      s = s.replace(/^to\s+/i, '').replace(/^I\s+/, '');
      const words = s.split(' ');
      let head = words[0].toLowerCase().replace(/[^a-z'-]/g, '');
      if (!head) continue;
      if (firstPerson && FIRST_PERSON_BASE[head]) head = FIRST_PERSON_BASE[head];
      if (!/^[a-z][a-z'-]*$/.test(head) || head.length < 2 || STOP.has(head) || MODAL.has(head)) continue;
      const tail = words.slice(1).join(' ').replace(/[.:]+$/, '').trim();
      out.push({ head, tail, ...(passive ? { passive: true } : {}) });
    }
  }
  return out;
}

/** The citation as an infinitive ("I say, speak" → "to say, speak"), for the lemma meaning beside a realized form. */
export function citationAsInfinitive(gloss: string | undefined): string | undefined {
  const whole = (gloss ?? '').normalize('NFC').replace(/\s+/g, ' ').trim();
  if (!/^I\s/.test(whole)) return whole || undefined;
  const senses = verbSensesOfCitation(whole);
  if (!senses.length) return whole;
  return `to ${senses.map((s) => [s.head, s.tail].filter(Boolean).join(' ')).join(', ')}`;
}

// ───────────────────────────── English inflection ─────────────────────────────

/** base → [past, past participle]. */
const IRREGULAR: Readonly<Record<string, readonly [string, string]>> = {
  be: ['was', 'been'], abide: ['abode', 'abode'], arise: ['arose', 'arisen'], awake: ['awoke', 'awoken'], bear: ['bore', 'borne'], beat: ['beat', 'beaten'],
  become: ['became', 'become'], befall: ['befell', 'befallen'], beget: ['begot', 'begotten'], begin: ['began', 'begun'], behold: ['beheld', 'beheld'],
  bend: ['bent', 'bent'], beseech: ['besought', 'besought'], bid: ['bade', 'bidden'], bind: ['bound', 'bound'], bite: ['bit', 'bitten'], bleed: ['bled', 'bled'],
  blow: ['blew', 'blown'], break: ['broke', 'broken'], breed: ['bred', 'bred'], bring: ['brought', 'brought'], build: ['built', 'built'], burst: ['burst', 'burst'],
  buy: ['bought', 'bought'], cast: ['cast', 'cast'], catch: ['caught', 'caught'], choose: ['chose', 'chosen'], cling: ['clung', 'clung'], come: ['came', 'come'],
  cost: ['cost', 'cost'], creep: ['crept', 'crept'], cut: ['cut', 'cut'], deal: ['dealt', 'dealt'], dig: ['dug', 'dug'], do: ['did', 'done'], draw: ['drew', 'drawn'],
  drink: ['drank', 'drunk'], drive: ['drove', 'driven'], dwell: ['dwelt', 'dwelt'], eat: ['ate', 'eaten'], fall: ['fell', 'fallen'], feed: ['fed', 'fed'],
  feel: ['felt', 'felt'], fight: ['fought', 'fought'], find: ['found', 'found'], flee: ['fled', 'fled'], fling: ['flung', 'flung'], fly: ['flew', 'flown'],
  forbid: ['forbade', 'forbidden'], forget: ['forgot', 'forgotten'], forgive: ['forgave', 'forgiven'], forsake: ['forsook', 'forsaken'], freeze: ['froze', 'frozen'],
  get: ['got', 'got'], give: ['gave', 'given'], go: ['went', 'gone'], grind: ['ground', 'ground'], grow: ['grew', 'grown'], hang: ['hung', 'hung'],
  have: ['had', 'had'], hear: ['heard', 'heard'], hide: ['hid', 'hidden'], hit: ['hit', 'hit'], hold: ['held', 'held'], hurt: ['hurt', 'hurt'], keep: ['kept', 'kept'],
  kneel: ['knelt', 'knelt'], know: ['knew', 'known'], lay: ['laid', 'laid'], lead: ['led', 'led'], leap: ['leapt', 'leapt'], leave: ['left', 'left'], lend: ['lent', 'lent'],
  let: ['let', 'let'], lie: ['lay', 'lain'], light: ['lit', 'lit'], lose: ['lost', 'lost'], make: ['made', 'made'], mean: ['meant', 'meant'], meet: ['met', 'met'],
  pay: ['paid', 'paid'], put: ['put', 'put'], read: ['read', 'read'], rend: ['rent', 'rent'], ride: ['rode', 'ridden'], ring: ['rang', 'rung'], rise: ['rose', 'risen'],
  run: ['ran', 'run'], say: ['said', 'said'], see: ['saw', 'seen'], seek: ['sought', 'sought'], sell: ['sold', 'sold'], send: ['sent', 'sent'], set: ['set', 'set'],
  shake: ['shook', 'shaken'], shed: ['shed', 'shed'], shine: ['shone', 'shone'], shoot: ['shot', 'shot'], show: ['showed', 'shown'], shut: ['shut', 'shut'],
  sing: ['sang', 'sung'], sink: ['sank', 'sunk'], sit: ['sat', 'sat'], slay: ['slew', 'slain'], sleep: ['slept', 'slept'], slide: ['slid', 'slid'], sling: ['slung', 'slung'],
  smite: ['smote', 'smitten'], sow: ['sowed', 'sown'], speak: ['spoke', 'spoken'], spend: ['spent', 'spent'], spin: ['spun', 'spun'], spit: ['spat', 'spat'],
  split: ['split', 'split'], spread: ['spread', 'spread'], spring: ['sprang', 'sprung'], stand: ['stood', 'stood'], steal: ['stole', 'stolen'], stick: ['stuck', 'stuck'],
  sting: ['stung', 'stung'], stink: ['stank', 'stunk'], strike: ['struck', 'struck'], strive: ['strove', 'striven'], swear: ['swore', 'sworn'], sweep: ['swept', 'swept'],
  swell: ['swelled', 'swollen'], swim: ['swam', 'swum'], take: ['took', 'taken'], teach: ['taught', 'taught'], tear: ['tore', 'torn'], tell: ['told', 'told'],
  think: ['thought', 'thought'], throw: ['threw', 'thrown'], thrust: ['thrust', 'thrust'], tread: ['trod', 'trodden'], wake: ['woke', 'woken'], wear: ['wore', 'worn'],
  weave: ['wove', 'woven'], weep: ['wept', 'wept'], win: ['won', 'won'], wind: ['wound', 'wound'], wring: ['wrung', 'wrung'], write: ['wrote', 'written'],
};
const PREFIXES = ['be', 'fore', 'for', 'mis', 'over', 're', 'un', 'under', 'up', 'with', 'out'];
const THIRD: Readonly<Record<string, string>> = { be: 'is', have: 'has', do: 'does', go: 'goes' };

function irregular(base: string): readonly [string, string] | undefined {
  if (IRREGULAR[base]) return IRREGULAR[base];
  for (const p of PREFIXES) {
    const stem = base.startsWith(p) ? base.slice(p.length) : '';
    if (stem && IRREGULAR[stem]) return [p + IRREGULAR[stem][0], p + IRREGULAR[stem][1]];
  }
  return undefined;
}
const vowelGroups = (w: string): number => (w.match(/[aeiouy]+/g) ?? []).length;
/** A one-syllable verb ending in one vowel and one consonant doubles it: stop → stopped, sin → sinned (not w, x, y). */
const doubles = (base: string): boolean => /[^aeiou][aeiou][bdgklmnprstvz]$/.test(base) && vowelGroups(base) === 1;

export function englishPast(base: string): string {
  const irr = irregular(base);
  if (irr) return irr[0];
  if (base.endsWith('e')) return `${base}d`;
  if (/[^aeiou]y$/.test(base)) return `${base.slice(0, -1)}ied`;
  if (doubles(base)) return `${base}${base[base.length - 1]}ed`;
  return `${base}ed`;
}
export function englishParticiple(base: string): string {
  const irr = irregular(base);
  return irr ? irr[1] : englishPast(base);
}
export function englishThirdSingular(base: string): string {
  if (THIRD[base]) return THIRD[base];
  if (/(?:s|x|z|ch|sh)$/.test(base)) return `${base}es`;
  if (/[^aeiou]y$/.test(base)) return `${base.slice(0, -1)}ies`;
  if (/[^aeiou]o$/.test(base)) return `${base}es`;
  return `${base}s`;
}
export function englishIng(base: string): string {
  if (base === 'be' || base === 'see' || base === 'flee' || base === 'free') return `${base}ing`;
  if (base.endsWith('ie')) return `${base.slice(0, -2)}ying`;
  if (base.endsWith('e') && !/[eoy]e$/.test(base)) return `${base.slice(0, -1)}ing`;
  if (doubles(base)) return `${base}${base[base.length - 1]}ing`;
  return `${base}ing`;
}

// ───────────────────────────── realization ─────────────────────────────

function subjectOf(shape: VerbShape): string | undefined {
  const plural = shape.number === 'Plur';
  switch (shape.person) {
    case '1': return plural ? 'we' : 'I';
    case '2': return plural ? 'you (plural)' : 'you';
    case '3': return plural ? 'they' : shape.gender === 'Masc' ? 'he' : shape.gender === 'Fem' ? 'she' : shape.gender === 'Neut' ? 'it' : 'he, she, or it';
    default: return undefined;
  }
}
function objectOf(shape: VerbShape): string {
  const plural = shape.number === 'Plur';
  switch (shape.person) {
    case '1': return plural ? 'us' : 'me';
    case '2': return 'you';
    default: return plural ? 'them' : shape.gender === 'Masc' ? 'him' : shape.gender === 'Fem' ? 'her' : shape.gender === 'Neut' ? 'it' : 'him, her, or it';
  }
}
function reflexiveOf(shape: VerbShape): string {
  const plural = shape.number === 'Plur';
  switch (shape.person) {
    case '1': return plural ? 'ourselves' : 'myself';
    case '2': return plural ? 'yourselves' : 'yourself';
    case '3': return plural ? 'themselves' : shape.gender === 'Masc' ? 'himself' : shape.gender === 'Fem' ? 'herself' : shape.gender === 'Neut' ? 'itself' : 'himself, herself, or itself';
    default: return 'oneself';
  }
}
const capitalize = (s: string): string => s.charAt(0).toUpperCase() + s.slice(1);
/** A state, not an action: its imperfect is a simple past ("had", "knew"), never "was having". */
const STATIVE = new Set(['have', 'know', 'seem', 'want', 'need', 'own', 'owe', 'mean', 'remain', 'believe', 'understand', 'remember', 'belong', 'possess']);

/**
 * The English of one sense in one shape, or undefined when the shape cannot be written (a finite form with no person, a
 * non-finite form the adapter did not name). A copula ("be") keeps its own forms and never takes a passive.
 */
export function realizeEnglishVerb(sense: VerbSense, shape: VerbShape): string | undefined {
  let head = sense.head;
  let tail = sense.tail;
  if (shape.nuance === 'causative') { tail = ['to', head, tail].filter(Boolean).join(' '); head = 'cause'; }
  const copula = head === 'be';
  const passive = !!shape.passive && !copula;
  const third = shape.person === '3' && shape.number !== 'Plur';
  const firstSingular = shape.person === '1' && shape.number !== 'Plur';
  const pp = englishParticiple(head);
  const ing = englishIng(head);
  const bePresent = firstSingular ? 'am' : third ? 'is' : 'are';
  const bePast = firstSingular || third ? 'was' : 'were';
  const reflexive = shape.nuance === 'reflexive' ? reflexiveOf(shape) : '';
  /** The verb words, then the reflexive pronoun, then the sense's tail. */
  const phrase = (...verb: string[]): string => [...verb, reflexive, tail].filter(Boolean).join(' ');
  const time = shape.time ?? 'present';

  if (!shape.finite) {
    switch (shape.nonFinite) {
      case 'infinitive':
        if (time === 'perfect' || time === 'pluperfect') return passive ? phrase('to have been', pp) : phrase('to have', pp);
        if (time === 'future' || time === 'future-perfect') return passive ? phrase('to be about to be', pp) : phrase('to be about to', head);
        return passive ? phrase('to be', pp) : phrase('to', head);
      case 'participle':
        if (time === 'future' || time === 'future-perfect') return passive ? phrase('about to be', pp) : phrase('about to', head);
        if (time === 'perfect') return passive ? phrase(pp) : phrase('having', pp);
        if (time === 'past' || time === 'progressive-past' || time === 'pluperfect') return passive ? phrase('having been', pp) : phrase('having', pp);
        return passive ? phrase('being', pp) : phrase(ing);
      case 'gerund': return phrase(ing);
      case 'gerundive': return phrase('to be', pp);
      case 'supine': return phrase('to', head);
      default: return undefined;
    }
  }

  const subject = subjectOf(shape);
  if (!subject || !shape.number) return undefined;
  const mood = shape.mood ?? 'indicative';
  let clause: string;
  switch (mood) {
    case 'imperative':
      if (shape.person === '2') return `${shape.prefix ?? ''}${capitalize(passive ? phrase('be', pp) : phrase(head))}!${shape.number === 'Plur' ? ' (plural)' : ''}`;
      clause = `let ${objectOf(shape)} ${passive ? phrase('be', pp) : phrase(head)}`;
      break;
    case 'cohortative':
      clause = `let ${objectOf(shape)} ${passive ? phrase('be', pp) : phrase(head)}`;
      break;
    case 'jussive':
      clause = shape.person === '1' ? `let ${objectOf(shape)} ${passive ? phrase('be', pp) : phrase(head)}` : `may ${subject} ${passive ? phrase('be', pp) : phrase(head)}`;
      break;
    case 'subjunctive': case 'optative': {
      const modal = mood === 'optative' || time === 'past' || time === 'progressive-past' || time === 'pluperfect' || time === 'future-perfect' ? 'might' : 'may';
      const perfectish = time === 'perfect' || time === 'pluperfect' || time === 'future-perfect';
      clause = `${subject} ${modal} ${perfectish ? (passive ? phrase('have been', pp) : phrase('have', pp)) : passive ? phrase('be', pp) : phrase(head)}`;
      break;
    }
    default: {
      let verb: string;
      switch (time) {
        case 'past': verb = copula ? phrase(bePast) : passive ? phrase(bePast, pp) : phrase(englishPast(head)); break;
        case 'progressive-past': verb = copula ? phrase(bePast) : passive ? phrase(bePast, 'being', pp) : STATIVE.has(head) ? phrase(englishPast(head)) : phrase(bePast, ing); break;
        case 'future': verb = passive ? phrase('will be', pp) : phrase('will', head); break;
        case 'perfect': verb = passive ? phrase(third ? 'has been' : 'have been', pp) : phrase(third ? 'has' : 'have', pp); break;
        case 'pluperfect': verb = passive ? phrase('had been', pp) : phrase('had', pp); break;
        case 'future-perfect': verb = passive ? phrase('will have been', pp) : phrase('will have', pp); break;
        default: verb = copula ? phrase(bePresent) : passive ? phrase(bePresent, pp) : phrase(third ? englishThirdSingular(head) : head);
      }
      clause = `${subject} ${verb}`;
    }
  }
  return capitalize(`${shape.prefix ?? ''}${clause}`);
}

/**
 * The first usable sense of the citation, written in the shape; the passive's own sense when the citation marks one and the
 * shape is passive. Undefined when the citation has no usable sense or the shape cannot be written.
 */
export function realizeFromCitation(gloss: string | undefined, shape: VerbShape): string | undefined {
  const senses = verbSensesOfCitation(gloss);
  if (!senses.length) return undefined;
  const marked = shape.passive ? senses.find((s) => s.passive) : undefined;
  const sense = marked ?? senses.find((s) => !s.passive) ?? senses[0];
  return realizeEnglishVerb(sense, marked ? { ...shape, passive: false } : shape);
}

/**
 * Plain alternatives of a realized meaning for an answer key: "He, she, or it said" → "he said", "she said", "it said";
 * "You (plural) love" → "you love"; "Do! (plural)" → "do". The realized text itself is kept first.
 */
export function answerVariants(text: string): string[] {
  const out = [text];
  const push = (s: string): void => { const t = s.replace(/\s+/g, ' ').trim(); if (t && !out.includes(t)) out.push(t); };
  const plain = text.replace(/\s*\((?:plural|dual)\)/g, '').replace(/!+$/, '');
  if (/^he, she, or it\b/i.test(plain)) for (const s of ['he', 'she', 'it']) push(plain.replace(/^he, she, or it\b/i, s));
  else if (/^let him, her, or it\b/i.test(plain)) for (const s of ['him', 'her', 'it']) push(plain.replace(/^let him, her, or it\b/i, `let ${s}`));
  else if (/^may he, she, or it\b/i.test(plain)) for (const s of ['he', 'she', 'it']) push(plain.replace(/^may he, she, or it\b/i, `may ${s}`));
  else push(plain);
  return out;
}
