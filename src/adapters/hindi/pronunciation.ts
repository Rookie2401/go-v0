/**
 * How a written Hindi word is said. Writing and speech part ways in Hindi: a consonant letter carries an unwritten
 * "a" that is often not pronounced (कमल is written ka-ma-la and said ka-mal; लड़का is laṛ-kā), a nasal sign takes the
 * place of the following consonant's class, and borrowed words keep their own habits. So pronunciation is a separate
 * statement about each unit, with its own confidence and source, never read off the letters one by one.
 *
 * MACHINE-DRAFTED (package H1, docs/PLAN12.md): the rules below were written from general knowledge of Hindi, not
 * checked by a native speaker. The central problem is the unwritten a (the schwa). What the code does, in order:
 *   1. a word that is one consonant (न, व) keeps its a; the first akṣara of a word keeps its a;
 *   2. the a at the end of a word is not said (कमल -> kamal); after a final conjunct it is less sure, and after a
 *      conjunct ending in य र ल व (मित्र, वाक्य) it is left uncertain;
 *   3. inside a word, from the end backwards, the a is not said in vowel + consonant + [a] + consonant + vowel
 *      (लड़का -> laṛ-kā, करना -> kar-nā), never two in a row, and never where a nasal sign before it, a conjunct after it
 *      or a conjunct of its own (ending in y r l v, or of three letters) would leave consonants that cannot be said;
 *   4. the rule is trusted (confidence 0.75 and over) only in the shapes where it is known to work: the second akṣara
 *      of a word, the one before the last, and the one before a verb ending (-ना -ने -ता -ती -ते -कर). Everywhere
 *      else (long Sanskrit-derived words, compounds, words after a known prefix, two candidates side by side) the
 *      a is marked 'uncertain' with a confidence below 0.6 and written in the transliteration.
 * A short list of very frequent words that the rules get wrong is in orth-exceptions.ts (unreviewed).
 *
 * The exported signatures are final.
 */
import type { SyllableAnalysis } from '../../core';
import { aksharas, NUKTA, VIRAMA, type Akshara } from './script';
import { classNasal, consonantIso, INDEPENDENT_VOWELS, INHERENT_A, VOWEL_SIGNS, CONSONANT_ISO, type VowelInfo } from './orth-tables';
import { KNOWN_PREFIXES, SCHWA_EXCEPTIONS, VERB_SUFFIXES } from './orth-exceptions';
import { alignIpa, type IpaUnitShape } from './orth-ipa';

type Kind = 'V' | 'A' | 'M' | 'D' | 'X';
type Status = 'P' | 'D' | 'U';

interface Info {
  u: Akshara;
  kind: Kind;
  /** For units without a written vowel: is the unwritten a said (P), not said (D) or unknown (U). */
  status?: Status;
  conf: number;
  rule?: string;
  source: 'rule' | 'exception-list' | 'dictionary';
  sourceId?: string;
  irregular?: boolean;
  ipa?: string;
}

const NASAL_SIGNS = ['anusvara', 'chandrabindu', 'visarga'];
const GLIDES = 'यव';
const SEMIVOWELS = 'यरलव';
const stripNukta = (s: string): string => s.replace(NUKTA, '');

function classify(u: Akshara): Kind {
  if (u.consonants.length > 0) {
    if (u.dead) return 'D';
    if (u.vowel) return 'V';
    return u.signs.some((s) => NASAL_SIGNS.includes(s)) ? 'M' : 'A';
  }
  return u.vowel !== undefined && !u.vowel.startsWith('◌') ? 'V' : 'X';
}

const hasNasalSign = (u: Akshara): boolean => u.signs.some((s) => NASAL_SIGNS.includes(s));
const EXCEPTIONS: ReadonlyMap<string, (typeof SCHWA_EXCEPTIONS)[number]> = new Map(SCHWA_EXCEPTIONS.map((e) => [e.word.normalize('NFC'), e] as const));

// ───────────────────────────── the unwritten a ─────────────────────────────

const R_ONLY_ONE = 'A word that is a single consonant keeps its a (न is na).';
const R_FIRST = 'The first akṣara of a word keeps its unwritten a.';
const R_FINAL = 'The unwritten a at the end of a word is not said (कमल is kamal).';
const R_FINAL_CONJ = 'The unwritten a after a final conjunct is usually not said, but many speakers release a light a, so this is less sure.';
const R_FINAL_SEMI = 'After a final conjunct ending in य, र, ल or व some speakers say a light a (मित्र: mitr or mitra) and others do not; the rules cannot tell.';
const R_NO_VOWEL_NEXT = 'The unwritten a is kept: the next akṣara has no vowel said, so dropping this a as well would leave consonants that cannot be said together.';
const R_NASAL_BEFORE = 'The unwritten a is kept: the nasal or dead consonant before it already closes the previous syllable, and dropping this a would pile up consonants.';
const R_CONJ_SEMI = 'The unwritten a after a conjunct ending in य, र, ल or व is kept: the cluster would be hard to say without it.';
const R_CONJ_LONG = 'The unwritten a after a conjunct of three consonants is kept: the cluster would be too heavy without it.';
const R_GEMINATE = 'The unwritten a after a doubled consonant is usually said (उन्नति: un-na-ti).';
const R_NEXT_CONJ = 'The unwritten a is kept: the next akṣara starts with a conjunct, and dropping this a would stack three consonants (नमस्ते: na-ma-ste).';
const R_NEXT_U = 'The rules cannot tell whether this a is said: the a after it is itself undecided.';
const R_SUFFIX = 'The unwritten a before a verb ending (-ना, -ने, -ता, -ती, -ते, -कर) is not said (समझता: sa-majh-tā).';
const R_SUFFIX_GLIDE = 'Before a verb ending the a after य or व is often said (सहायता); the rules cannot tell.';
const R_PREFIX = 'The rules cannot tell whether this a is said: it is next to a Sanskrit prefix, where the a is often said (अनुमति: a-nu-ma-ti).';
const R_ALTERNATE = 'The rules cannot tell whether this a is said: two unwritten a\'s stand side by side and only one of them is dropped (लोकसभा: lok-sa-bhā).';
const R_SECOND = 'The unwritten a is not said: it stands between a syllable with a vowel and one with a vowel (लड़का: laṛ-kā).';
const R_PENULT = 'The unwritten a is not said before the last syllable when the syllable before it has a vowel (आदमी: ād-mī).';
const R_LONG = 'The rules cannot tell whether this a is said: this is a longer word (often Sanskrit-derived or a compound), where the a-dropping rule is unreliable.';
const R_PROTECT = 'This reading comes from the short exception list of words the general rules get wrong (machine-drafted, unreviewed).';

function set(info: Info, status: Status, conf: number, rule: string): void {
  info.status = status;
  info.conf = conf;
  info.rule = rule;
}

const hasVowel = (i: Info | undefined): boolean => i !== undefined && (i.kind === 'V' || i.kind === 'M' || (i.kind === 'A' && i.status !== 'D'));

function runText(infos: Info[], from: number, to: number): string {
  let t = '';
  for (let k = from; k <= to; k++) t += infos[k].u.text;
  return t;
}

function decideFinal(info: Info): void {
  const c = info.u.consonants;
  if (c.length === 1) { set(info, 'D', 0.9, R_FINAL); return; }
  const last = stripNukta(c[c.length - 1]);
  if (SEMIVOWELS.includes(last)) set(info, 'U', 0.5, R_FINAL_SEMI);
  else set(info, 'D', 0.75, R_FINAL_CONJ);
}

function decideMedial(infos: Info[], i: number, s: number, e: number, prefixLen: number, sufStart: number): void {
  const info = infos[i];
  const prev = infos[i - 1];
  const next = infos[i + 1];
  const c = info.u.consonants;
  if (!hasVowel(next)) { set(info, 'P', 0.85, R_NO_VOWEL_NEXT); return; }
  if (prev.kind === 'D' || prev.kind === 'M' || hasNasalSign(prev.u)) { set(info, 'P', 0.7, R_NASAL_BEFORE); return; }
  if (c.length >= 3) { set(info, 'P', 0.7, R_CONJ_LONG); return; }
  if (c.length === 2) {
    if (stripNukta(c[0]) === stripNukta(c[1])) { set(info, 'P', 0.65, R_GEMINATE); return; }
    if (SEMIVOWELS.includes(stripNukta(c[1]))) { set(info, 'P', 0.75, R_CONJ_SEMI); return; }
  }
  const nearPrefix = prefixLen > 0 && (i === s + prefixLen - 1 || i === s + prefixLen);
  if (next.u.consonants.length >= 2) {
    if (nearPrefix) set(info, 'U', 0.45, R_PREFIX); else set(info, 'P', 0.75, R_NEXT_CONJ);
    return;
  }
  if (next.status === 'U') { set(info, 'U', 0.45, R_NEXT_U); return; }
  if (i + 1 === sufStart) {
    if (c.length === 1 && GLIDES.includes(stripNukta(c[0]))) set(info, 'U', 0.5, R_SUFFIX_GLIDE);
    else set(info, 'D', 0.85, R_SUFFIX);
    return;
  }
  if (nearPrefix) { set(info, 'U', 0.45, R_PREFIX); return; }
  if (prev.kind === 'A' && i - 1 > s && infos[i - 2].kind !== 'D' && infos[i - 2].kind !== 'X') { set(info, 'U', 0.5, R_ALTERNATE); return; }
  if (i === s + 1) { set(info, 'D', 0.8, R_SECOND); return; }
  if (i === e - 1 && infos[e].kind === 'V') { set(info, 'D', 0.75, R_PENULT); return; }
  set(info, 'U', 0.5, R_LONG);
}

function planRun(infos: Info[], s: number, e: number, wholeWord: boolean): void {
  // units that carry a nasal or visarga sign keep their a
  for (let i = s; i <= e; i++) if (infos[i].kind === 'M') set(infos[i], 'P', 0.9, 'An a that carries a nasal or visarga sign is said.');
  if (wholeWord) {
    const exc = EXCEPTIONS.get(runText(infos, s, e));
    if (exc) {
      for (let i = s; i <= e; i++) {
        const info = infos[i];
        if (info.kind !== 'A') continue;
        const said = exc.pronounced.includes(i - s);
        set(info, said ? 'P' : 'D', 0.8, `${R_PROTECT} Listed as ${exc.reading}: this a is ${said ? '' : 'not '}said.`);
        info.source = 'exception-list';
      }
      return;
    }
  }
  if (s === e) {
    const only = infos[s];
    if (only.kind === 'A') {
      if (only.u.consonants.length === 1) set(only, 'P', 0.95, R_ONLY_ONE);
      else set(only, 'U', 0.5, 'A word that is a single conjunct: the rules cannot tell whether its a is said.');
    }
    return;
  }
  if (infos[e].kind === 'A') decideFinal(infos[e]);
  if (infos[s].kind === 'A') set(infos[s], 'P', 0.95, R_FIRST);
  let prefixLen = 0;
  for (let k = 1; k <= 3 && s + k - 1 < e; k++) if (KNOWN_PREFIXES.includes(runText(infos, s, s + k - 1))) prefixLen = k;
  let sufStart = -1;
  for (const suf of VERB_SUFFIXES) {
    for (let k = 1; k <= 2 && e - k + 1 > s; k++) {
      if (runText(infos, e - k + 1, e) === suf) { sufStart = e - k + 1; break; }
    }
    if (sufStart >= 0) break;
  }
  for (let i = e - 1; i > s; i--) if (infos[i].kind === 'A') decideMedial(infos, i, s, e, prefixLen, sufStart);
}

function plan(surface: string): Info[] {
  const infos: Info[] = aksharas(surface).map((u) => ({ u, kind: classify(u), conf: 1, source: 'rule' as const }));
  let s = 0;
  while (s < infos.length) {
    if (infos[s].kind === 'X') { s++; continue; }
    let e = s;
    while (e + 1 < infos.length && infos[e + 1].kind !== 'X') e++;
    planRun(infos, s, e, s === 0 && e === infos.length - 1);
    s = e + 1;
  }
  return infos;
}

// ───────────────────────────── rendering a unit ─────────────────────────────

const OTHER_ISO: Readonly<Record<string, string>> = { '।': '.', '॥': '..', 'ऽ': '’' };

function writtenVowel(u: Akshara): VowelInfo | undefined {
  if (!u.vowel) return undefined;
  return u.vowel.startsWith('◌') ? VOWEL_SIGNS[u.vowel.slice(1)] : INDEPENDENT_VOWELS[u.vowel];
}

const STATUS_TEXT: Readonly<Record<Status, NonNullable<SyllableAnalysis['inherentVowel']>>> = { P: 'pronounced', D: 'dropped', U: 'uncertain' };

function renderUnit(infos: Info[], idx: number): SyllableAnalysis {
  const info = infos[idx];
  const u = info.u;
  const base: SyllableAnalysis = { text: u.text, start: u.start, end: u.end, confidence: info.conf };
  if (info.kind === 'X') {
    const code = u.text.codePointAt(0)!;
    const digit = code >= 0x0966 && code <= 0x096f ? String(code - 0x0966) : OTHER_ISO[u.text];
    if (digit !== undefined && u.text.length === 1) {
      base.romanization = digit;
      base.confidence = 1;
      base.source = 'rule';
      return base;
    }
    base.confidence = 0;
    base.rule = 'This is not a Devanagari letter, so no reading is given.';
    return base;
  }
  const cons = u.consonants;
  const written = writtenVowel(u);
  const notes: string[] = [];
  let conf = info.conf;
  const onset = cons.map(consonantIso).join('');
  if (cons.length > 0) {
    base.initial = cons.map((c) => c).join('');
    if (cons.length > 1) base.cluster = cons.join(VIRAMA);
  }
  const joined = cons.map((c) => c.charAt(0)).join('');
  if (joined.includes('जञ')) { notes.push('ज्ञ is written jñ but said gy in Hindi.'); conf = Math.min(conf, 0.9); }

  // the vowel
  let vowelIso = '';
  if (info.kind === 'D') {
    base.inherentVowel = 'dropped';
    base.vowelSound = '';
    notes.push('A virama after the consonant: no vowel is said or meant.');
  } else if (written) {
    base.vowel = u.vowel;
    base.vowelLength = written.length;
    base.vowelSound = written.sound;
    vowelIso = written.iso;
    const v = u.vowel ?? '';
    const sign = v.startsWith('◌') ? v.slice(1) : v;
    if ('ऋॠृॄ'.includes(sign)) { notes.push('ऋ / ृ is said ri in Hindi (ISO 15919 writes r̥).'); conf = Math.min(conf, 0.9); }
    if ('ऑऍॉॅ'.includes(sign)) { notes.push('The candra sign marks the vowel of English loanwords (as in "college").'); conf = Math.min(conf, 0.9); }
  } else if (u.vowel !== undefined) {
    conf = 0.3; // a vowel sign the tables do not know
    base.vowel = u.vowel;
  } else {
    // no vowel written: the unwritten a
    const st = info.status ?? 'U';
    base.vowel = '◌';
    base.inherentVowel = STATUS_TEXT[st];
    if (st === 'D') { base.vowelSound = ''; } else { base.vowelSound = 'a'; base.vowelLength = 'short'; vowelIso = INHERENT_A.iso; }
  }
  if (info.kind === 'M') base.inherentVowel = 'pronounced';

  // nasal and visarga signs
  let nasalIso = '';
  if (u.signs.includes('anusvara') || u.signs.includes('chandrabindu')) {
    const next = infos[idx + 1];
    const cls = u.signs.includes('anusvara') && next && next.kind !== 'X' && next.u.consonants.length > 0 ? classNasal(next.u.consonants[0]) : '';
    if (cls) {
      nasalIso = cls;
      base.finalSound = cls;
      notes.push(`The anusvara is said as ${cls}, the nasal of the next consonant's group.`);
    } else {
      nasalIso = 'ṁ';
      base.finalSound = 'ṁ';
      notes.push(u.signs.includes('anusvara')
        ? 'The anusvara here nasalises the vowel (before य र ल व श ष स ह, or at the end of a word).'
        : 'The chandrabindu nasalises the vowel.');
    }
    conf = Math.min(conf, u.signs.includes('anusvara') ? 0.9 : 0.95);
  }
  if (u.signs.includes('visarga')) {
    nasalIso += 'ḥ';
    base.finalSound = (base.finalSound ?? '') + 'ḥ';
    notes.push('The visarga is a breathy h after the vowel.');
    conf = Math.min(conf, 0.9);
  }
  if (nasalIso || u.signs.some((s) => NASAL_SIGNS.includes(s))) base.final = u.text.replace(/[^ऀ-ः]/g, '');

  if (info.rule) notes.unshift(info.rule);
  base.romanization = onset + vowelIso + nasalIso;
  base.signs = [...u.signs];
  if (notes.length) base.rule = notes.join(' ');
  base.source = info.source;
  if (info.sourceId !== undefined) base.sourceId = info.sourceId;
  if (info.irregular) base.irregular = true;
  if (info.ipa) base.ipa = info.ipa;
  base.confidence = Math.min(conf, 1);
  return base;
}

/**
 * The units of one word with what is said for each: `text` / `start` / `end` (the akṣara), `initial` (its consonant
 * letters), `cluster` (when they are joined), `vowel` (as written, '◌' when it is the unwritten a), `vowelLength`,
 * `vowelSound` (plain: a, ā, i, ī, u, ū, e, ai, o, au, ṛ; '' when the unwritten a is not said), `finalSound` for a
 * nasal or visarga, `inherentVowel` ('pronounced' | 'dropped' | 'uncertain') on every unit without a written vowel,
 * `signs`, `rule` (in plain words, whenever a rule other than "read as written" applied), `romanization` (ISO 15919,
 * of this unit as said), `source: 'rule'` or `'exception-list'`, `confidence`. `ending` and the tone fields stay unset.
 * Never guesses: where the rules cannot tell whether the a is said, `inherentVowel` is 'uncertain' and the confidence low.
 */
export function decodeHindi(surface: string): SyllableAnalysis[] {
  const infos = plan(surface);
  return infos.map((_, i) => renderUnit(infos, i));
}

// ───────────────────────────── with a dictionary pronunciation ─────────────────────────────

const shapeOf = (i: Info): IpaUnitShape => ({
  kind: i.kind,
  nCons: i.u.consonants.length,
  nasal: i.u.signs.includes('anusvara') || i.u.signs.includes('chandrabindu'),
  visarga: i.u.signs.includes('visarga'),
});

/**
 * The same, with a dictionary's pronunciation (IPA) as the authority for which unwritten vowels are said. Units then
 * carry `source: 'dictionary'`, `sourceId`, and `irregular: true` where the dictionary and the rules differ (the rule's
 * own answer is kept in `rule`). Falls back to decodeHindi when the IPA cannot be aligned with the spelling.
 */
export function decodeHindiWithPronunciation(surface: string, pron: { respelling?: string; ipa?: string }, sourceId?: string): SyllableAnalysis[] {
  if (!pron.ipa) return decodeHindi(surface);
  const infos = plan(surface);
  if (!infos.some((i) => i.kind === 'A' || i.kind === 'M' || i.kind === 'V' || i.kind === 'D')) return decodeHindi(surface);
  if (infos.some((i) => i.kind === 'X' && i.u.text.codePointAt(0)! < 0x0900 && i.u.text.trim() !== '')) return decodeHindi(surface);
  const aligned = alignIpa(infos.map(shapeOf), pron.ipa);
  if (!aligned) return decodeHindi(surface);
  infos.forEach((info, i) => {
    if (info.kind === 'X') return;
    const res = aligned[i];
    info.source = 'dictionary';
    if (sourceId !== undefined) info.sourceId = sourceId;
    if (res.ipa) info.ipa = res.ipa;
    info.conf = Math.max(info.kind === 'V' || info.kind === 'D' || info.kind === 'M' ? 0.95 : 0, 0);
    if (info.kind !== 'A') return;
    const was = info.status;
    const ruleRule = info.rule;
    const now: Status = res.said ? 'P' : 'D';
    const differs = (was === 'P' && now === 'D') || (was === 'D' && now === 'P');
    info.status = now;
    if (differs) {
      info.irregular = true;
      info.conf = 0.9;
      info.rule = `The dictionary's pronunciation ${now === 'P' ? 'has' : 'does not have'} a vowel here; the spelling rules alone would have said the a is ${was === 'P' ? '' : 'not '}said (${ruleRule ?? 'no rule recorded'})`;
    } else {
      info.conf = 0.95;
      info.rule = was === 'U'
        ? `The dictionary's pronunciation ${now === 'P' ? 'has' : 'does not have'} a vowel here; the spelling rules alone could not tell.`
        : `${ruleRule ?? ''} The dictionary's pronunciation agrees.`.trim();
    }
  });
  return infos.map((_, i) => renderUnit(infos, i));
}

// ───────────────────────────── writing-system items ─────────────────────────────

/** Writing-system items a decoded word exercises: "letter:क", "matra:ा", "conjunct:क्ष", "sign:nukta", "sign:anusvara", "rule:final-a-dropped", "rule:medial-a-dropped", "rule:reph" … */
export function hindiOrthFeatures(units: SyllableAnalysis[]): string[] {
  const out = new Set<string>();
  let lastLetter = -1;
  units.forEach((u, i) => { if (aksharas(u.text).some((a) => a.consonants.length > 0 || a.vowel !== undefined)) lastLetter = i; });
  units.forEach((u, i) => {
    for (const a of aksharas(u.text)) {
      for (const c of a.consonants) out.add(`letter:${c}`);
      if (a.vowel !== undefined) out.add(a.vowel.startsWith('◌') ? `matra:${a.vowel.slice(1)}` : `vowel:${a.vowel}`);
      if (a.consonants.length >= 2) out.add(`conjunct:${a.consonants.join(VIRAMA)}`);
      for (const s of a.signs) {
        if (s === 'virama') { if (a.dead) out.add('sign:virama'); } else out.add(`sign:${s}`);
      }
    }
    if (u.inherentVowel === 'dropped' && !aksharas(u.text).every((a) => a.dead)) {
      out.add(i === lastLetter ? 'rule:final-a-dropped' : 'rule:medial-a-dropped');
    }
    if ((u.signs ?? []).includes('anusvara') && u.finalSound !== undefined && 'ṅñṇnm'.includes(u.finalSound)) out.add('rule:anusvara-nasal');
  });
  return [...out];
}

const MATRA_PLACE: Readonly<Record<string, string>> = {
  'ा': 'after the letter', 'ि': 'before the letter', 'ी': 'after the letter', 'ु': 'under the letter', 'ू': 'under the letter',
  'ृ': 'under the letter', 'े': 'above the letter', 'ै': 'above the letter', 'ो': 'after the letter, with a mark above',
  'ौ': 'after the letter, with marks above', 'ॉ': 'after the letter, with a mark above', 'ॅ': 'above the letter',
};

function isoOf(letter: string): string { return consonantIso(letter); }

/** One plain sentence for a writing-system item, for the word sheet and the audit views. */
export function describeHindiOrthFeature(feature: string): string {
  const i = feature.indexOf(':');
  if (i < 0) return feature;
  const kind = feature.slice(0, i);
  const rest = feature.slice(i + 1);
  switch (kind) {
    case 'letter': {
      const iso = isoOf(rest);
      if (rest.endsWith(NUKTA)) return `${rest} is ${rest.charAt(0)} with a dot under it (a nukta): ${iso}.`;
      return `${rest} is a consonant letter: ${iso}${CONSONANT_ISO[rest] !== undefined ? 'a' : ''}.`;
    }
    case 'matra': {
      const v = VOWEL_SIGNS[rest];
      return v ? `${rest} is the vowel sign ${v.iso}, written ${MATRA_PLACE[rest] ?? 'on the letter'}.` : `${rest} is a vowel sign.`;
    }
    case 'vowel': {
      const v = INDEPENDENT_VOWELS[rest];
      return v ? `${rest} is the vowel letter ${v.iso}, used where a vowel starts a word or follows another vowel.` : `${rest} is a vowel letter.`;
    }
    case 'conjunct': {
      const parts = rest.split(VIRAMA).filter(Boolean);
      const sound = parts.map(isoOf).join('');
      const names = parts.length === 2 ? `${parts[0]} and ${parts[1]}` : `${parts.slice(0, -1).join(', ')} and ${parts[parts.length - 1]}`;
      const extra = rest === `ज${VIRAMA}ञ` ? ', said gy' : '';
      return `${rest} is ${names} written together: ${sound}${extra}.`;
    }
    case 'sign':
      return SIGN_TEXT[rest] ?? `${rest} is a sign.`;
    case 'rule':
      return RULE_TEXT[rest] ?? feature;
    default:
      return feature;
  }
}

const SIGN_TEXT: Readonly<Record<string, string>> = {
  nukta: 'A dot under a letter (a nukta) makes the borrowed sounds q, ḵẖ, ġ, z, f, or the flapped ṛ and ṛh.',
  anusvara: 'The dot above a letter (anusvara) is a nasal: the nasal of the next consonant\'s group, or a nasal vowel.',
  chandrabindu: 'The moon with a dot (chandrabindu) makes the vowel nasal.',
  visarga: 'The two dots after a letter (visarga) are a breathy h after the vowel.',
  virama: 'The slanted stroke under a consonant (virama) says that no vowel follows it.',
  reph: 'A र at the start of a cluster is written as a hook above the next letter (र्म is rm).',
  rakar: 'A र after another consonant is written as a small stroke on that letter (प्र is pr).',
  avagraha: 'The avagraha ऽ marks a lengthened vowel or a dropped a, mostly in Sanskrit.',
};

const RULE_TEXT: Readonly<Record<string, string>> = {
  'final-a-dropped': 'The unwritten a at the end of a word is not said: कमल is kamal.',
  'medial-a-dropped': 'The unwritten a inside a word is often not said when a vowel stands on both sides: लड़का is laṛkā.',
  'anusvara-nasal': 'The anusvara is said as the nasal of the next consonant\'s group: हिंदी is hindī, with n before द.',
};
