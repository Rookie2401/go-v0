/**
 * Row format for the Hindi hand lexicon (package H3). A lexicon file is a text block:
 *
 *   # NOUN                               a section header: the part of speech of the lines below it
 *   किताब/f = book                        lemma, optional gender (/m /f /mf), gloss
 *   पिता/m = father [inv d:family]        optional tags in brackets (see below)
 *   करना = to do, to make [erg] | @verb:c nopf noimp; किया:pfv m sg     optional explicit forms after a bar, separated by semicolons
 *
 * Tags in the brackets:
 *   inv            the word does not change (सुंदर, लाल; the nouns पिता, राजा)
 *   erg / noerg    a verb that takes ने in the perfective / does not; left out when it is not certain
 *   cau:करना        this verb is the causative of करना
 *   हार#2/m         a second word spelled and classed like another (हार/f defeat, हार#2/m necklace): the lemma is हार for both, the first row carries the lemma's data
 *   also:भविष्यद्वक्ता   another spelling of this lemma (a variant of it: the learner's record stays one word)
 *   a register     everyday sanskritic perso-arabic english-loan biblical formal literary colloquial religious
 *   d:family       a domain (see HI_DOMAINS): kept in a side table, like the Spanish annotations
 * A line "## d:family d:daily-life" gives the domains of every row below it until the next "##" line (a bare "##" clears them).
 *
 * Forms: `form:tags`, the tags those of `morph()` in ../shared plus `Key=Value`. Closed classes (pronouns, postpositions,
 * the verb "to be") list every form, because a learner meets them constantly and they must not depend on the rules.
 * Three macros write the regular paradigms, so that a regular word cannot be mistyped form by form:
 *   @adj[:extra tags]     a word in -ा that agrees (छोटा छोटे छोटी): m sg dir, m sg obl, m pl, f sg, f pl
 *   @ord                  an ordinal in -वाँ (पाँचवाँ पाँचवें पाँचवीं)
 *   @verb:KIND [nopf] [noimp] [nofut] [noconv]
 *                         KIND c = consonant stem (समझना), v = stem in -ा or -ो (खाना, सोना), e = stem in -े (देना, लेना),
 *                         ii = stem in -ी (सीना: सिया), uu = stem in -ू (छूना: छुआ);
 *                         nopf: no perfective forms (the verb's own are listed beside it), noimp: no formal command,
 *                         nofut: no future forms, noconv: no joined conjunctive (समझकर)
 * A noun lists only its lemma (and a few forms where a learner meets them at once); the rules supply the others.
 *
 * Machine-drafted and not reviewed by a native speaker: a word or a gender that was not certain is left out.
 */
import type { PartOfSpeech, RegisterTag } from '../../core';
import { E, nfc, type LexEntry } from '../shared';
import type { HindiLemmaInfo } from './morphology';

export const annotationKey = (lemma: string, pos: PartOfSpeech): string => `${lemma}|${pos}`;

/** Lexical layers and usage tags a row may carry. A layer is a fact about the word, never a verdict on it. */
export const HI_REGISTERS: ReadonlySet<string> = new Set([
  'everyday', 'sanskritic', 'perso-arabic', 'english-loan', 'biblical', 'formal', 'literary', 'colloquial', 'religious',
]);

/** Domains a row may name with `d:`. */
export const HI_DOMAINS: ReadonlySet<string> = new Set([
  'family', 'food', 'school', 'church', 'scripture', 'theology', 'prayer', 'travel', 'work', 'daily-life',
  'body', 'house', 'animals', 'nature', 'time', 'feelings', 'village', 'city', 'health', 'clothes', 'number', 'speech', 'people', 'money', 'law',
]);

export interface HiRow {
  lemma: string;
  pos: PartOfSpeech;
  gloss: string;
  gender?: 'm' | 'f' | 'mf';
  invariant: boolean;
  ergative?: boolean;
  causativeOf?: string;
  /** Other spellings of this lemma (`also:भविष्यद्वक्ता`): variants of it, never lemmas of their own. */
  also: string[];
  /** `हार#2/m`: the second word of the same spelling and part of speech (a necklace beside a defeat); the lemma is still हार. */
  homograph?: string;
  register: RegisterTag[];
  domains: string[];
  forms?: string[];
  /** Where the row is, for a message. */
  where: string;
}

/** What the side table keeps about a lemma. */
export interface HiAnnotation {
  register?: RegisterTag[];
  domains?: string[];
  /** Other spellings of the lemma (variants of it, never lemmas). */
  also?: string[];
  info: HindiLemmaInfo;
}

const POS = new Set<PartOfSpeech>(['NOUN', 'PROPN', 'VERB', 'AUX', 'ADJ', 'ADV', 'PRON', 'DET', 'ADP', 'CONJ', 'SCONJ', 'PART', 'NUM', 'INTJ']);

/**
 * Parse a block of lines (see the file comment). A malformed line throws, so a typo cannot silently drop a word; with a
 * `problems` list the message is collected there instead and the line is skipped (the adapter does this, so that a typo
 * in a lexicon file never stops the module from loading; the tests assert that the list is empty).
 */
export function parseRows(source: string, label = 'rows', problems?: string[]): HiRow[] {
  const rows: HiRow[] = [];
  let pos: PartOfSpeech | undefined;
  let sectionDomains: string[] = [];
  const parseLine = (raw: string, n: number): void => {
    const line = nfc(raw.trim());
    if (!line || line.startsWith('//')) return;
    const where = `${label}:${n + 1}`;
    if (line.startsWith('##')) {
      // "## d:family d:daily-life": the domains of every row below, until the next "##" (an empty one clears them)
      sectionDomains = [];
      for (const t of line.slice(2).split(/\s+/).filter(Boolean)) {
        if (!t.startsWith('d:') || !HI_DOMAINS.has(t.slice(2))) throw new Error(`${where}: unknown domain "${t}"`);
        sectionDomains.push(t.slice(2));
      }
      return;
    }
    if (line.startsWith('#')) {
      const p = line.slice(1).trim() as PartOfSpeech;
      if (!POS.has(p)) throw new Error(`${where}: unknown part of speech "${p}"`);
      pos = p;
      return;
    }
    if (!pos) throw new Error(`${where}: a row before any section header`);
    const eq = line.indexOf(' = ');
    if (eq < 0) throw new Error(`${where}: expected "lemma = gloss"`);
    let head = line.slice(0, eq).trim();
    let rest = line.slice(eq + 3).trim();
    let forms: string[] | undefined;
    const bar = rest.indexOf(' | ');
    if (bar >= 0) {
      forms = rest.slice(bar + 3).split(';').map((f) => f.trim()).filter(Boolean);
      rest = rest.slice(0, bar).trim();
    }
    const register: RegisterTag[] = [];
    const domains: string[] = [];
    let invariant = false;
    let ergative: boolean | undefined;
    let causativeOf: string | undefined;
    const also: string[] = [];
    const tags = /\s*\[([^\]]+)\]\s*$/u.exec(rest);
    if (tags) {
      rest = rest.slice(0, tags.index).trim();
      for (const t of tags[1].split(/\s+/).filter(Boolean)) {
        if (t === 'inv') invariant = true;
        else if (t === 'erg') ergative = true;
        else if (t === 'noerg') ergative = false;
        else if (t.startsWith('cau:') && t.length > 4) causativeOf = t.slice(4);
        else if (t.startsWith('also:') && t.length > 5) also.push(t.slice(5));
        else if (t.startsWith('d:') && HI_DOMAINS.has(t.slice(2))) domains.push(t.slice(2));
        else if (HI_REGISTERS.has(t)) register.push(t as RegisterTag);
        else throw new Error(`${where}: unknown tag "${t}"`);
      }
    }
    if ((ergative !== undefined) && pos !== 'VERB' && pos !== 'AUX') throw new Error(`${where}: erg / noerg belongs to a verb`);
    if (causativeOf && pos !== 'VERB') throw new Error(`${where}: cau: belongs to a verb`);
    let gender: HiRow['gender'];
    const g = /\/(m|f|mf)$/u.exec(head);
    if (g) { gender = g[1] as HiRow['gender']; head = head.slice(0, g.index); }
    let homograph: string | undefined;
    const hm = /^(.+)#(\w+)$/u.exec(head);
    if (hm) { head = hm[1]; homograph = hm[2]; }
    if (!head || !rest) throw new Error(`${where}: empty lemma or gloss`);
    if ((pos === 'NOUN') && !gender) throw new Error(`${where}: a noun needs a gender (${head})`);
    for (const d of sectionDomains) if (!domains.includes(d)) domains.push(d);
    for (const a of also) if (a === head) throw new Error(`${where}: also:${a} is the lemma itself`);
    rows.push({ lemma: head, pos, gloss: rest, gender, invariant, ergative, causativeOf, also, homograph, register, domains, forms, where });
  };
  source.split('\n').forEach((raw, n) => {
    try {
      parseLine(raw, n);
    } catch (e) {
      if (!problems) throw e;
      problems.push((e as Error).message);
    }
  });
  return rows;
}

// ── paradigm macros ──

const AA = 'ा';
const VIRAMA_FREE_END = (s: string, ch: string) => s.endsWith(ch);

/** The -ा paradigm of an agreeing word: m sg dir, m sg obl, m pl, f sg, f pl. */
function adjectiveForms(lemma: string, extra: string): string[] {
  if (!VIRAMA_FREE_END(lemma, AA)) throw new Error(`@adj needs a word in -ा: ${lemma}`);
  const stem = lemma.slice(0, -1);
  const x = extra ? ` ${extra}` : '';
  return [
    `${lemma}:m sg dir${x}`, `${stem}े:m sg obl${x}`, `${stem}े:m pl dir${x}`, `${stem}े:m pl obl${x}`, `${stem}ी:f sg${x}`, `${stem}ी:f pl${x}`,
  ];
}

/** An ordinal in -वाँ: पाँचवाँ पाँचवें पाँचवीं. */
function ordinalForms(lemma: string): string[] {
  if (!lemma.endsWith('वाँ')) throw new Error(`@ord needs a word in -वाँ: ${lemma}`);
  const stem = lemma.slice(0, -2);
  return [`${lemma}:m sg dir`, `${stem}ें:m sg obl`, `${stem}ें:m pl dir`, `${stem}ें:m pl obl`, `${stem}ीं:f sg`, `${stem}ीं:f pl`];
}

const FUT = 'Tense=Fut Mood=Ind VerbForm=Fin';
const FIN = 'VerbForm=Fin';

/** The regular forms of a verb from its stem (the macro `@verb`). */
function verbForms(lemma: string, kind: string, opts: ReadonlySet<string>): string[] {
  if (!lemma.endsWith('ना') || lemma.length < 3) throw new Error(`@verb needs an infinitive in -ना: ${lemma}`);
  const stem = lemma.slice(0, -2);
  const out: string[] = [];
  const add = (form: string, tags: string) => out.push(`${form}:${tags}`);
  add(lemma, 'inf');
  add(`${stem}ने`, 'inf obl');
  add(stem, 'VerbForm=Stem');
  // the imperfective participle (the habitual and the continuous are made of it)
  const ip = 'VerbForm=Part ipfv';
  add(`${stem}ता`, `${ip} m sg`); add(`${stem}ते`, `${ip} m pl`); add(`${stem}ते`, `${ip} m sg obl`);
  // a feminine participle in -ी is also the plural when a plural auxiliary follows (वे पढ़ती हैं); the nasal -ीं is the plural at the end of the verb group
  add(`${stem}ती`, `${ip} f sg`); add(`${stem}ती`, `${ip} f pl`); add(`${stem}तीं`, `${ip} f pl`);
  // the perfective participle
  const pf = 'VerbForm=Part pfv';
  if (kind === 'c' && /[ािीुूेैोौ]$/u.test(stem)) throw new Error(`@verb:c needs a consonant stem: ${lemma}`);
  if (kind === 'v' && !/[ाोआओ]$/u.test(stem)) throw new Error(`@verb:v needs a stem in -ा or -ो: ${lemma}`);
  if (kind === 'e' && !stem.endsWith('े')) throw new Error(`@verb:e needs a stem in -े: ${lemma}`);
  if (kind === 'ii' && !stem.endsWith('ी')) throw new Error(`@verb:ii needs a stem in -ी: ${lemma}`);
  if (kind === 'uu' && !stem.endsWith('ू')) throw new Error(`@verb:uu needs a stem in -ू: ${lemma}`);
  const base = kind === 'e' || kind === 'ii' || kind === 'uu' ? stem.slice(0, -1) : stem; // the consonant before the vowel (द of दे)
  // per kind: the perfective [m sg, m pl, f sg, f pl], the subjunctive (1s, 2s/3s, 1p/3p, 2p) and the formal command; the future is made of the subjunctive stems
  let pfv: [string, string, string, string];
  let sub: { s1: string; s23: string; sp: string; s2p: string; formal: string };
  switch (kind) {
    case 'c':
      pfv = [`${stem}ा`, `${stem}े`, `${stem}ी`, `${stem}ीं`];
      sub = { s1: `${stem}ूँ`, s23: `${stem}े`, sp: `${stem}ें`, s2p: `${stem}ो`, formal: `${stem}िए` };
      break;
    case 'v':
      pfv = [`${stem}या`, `${stem}ए`, `${stem}ई`, `${stem}ईं`];
      sub = { s1: `${stem}ऊँ`, s23: `${stem}ए`, sp: `${stem}एँ`, s2p: `${stem}ओ`, formal: `${stem}इए` };
      break;
    case 'e':
      pfv = [`${base}िया`, `${base}िए`, `${base}ी`, `${base}ीं`];
      sub = { s1: `${base}ूँ`, s23: stem, sp: `${base}ें`, s2p: `${base}ो`, formal: `${base}ीजिए` };
      break;
    case 'ii':
      pfv = [`${base}िया`, `${base}िए`, stem, `${stem}ं`];
      sub = { s1: `${base}िऊँ`, s23: `${base}िए`, sp: `${base}िएँ`, s2p: `${base}ियो`, formal: `${stem}जिए` };
      break;
    case 'uu':
      pfv = [`${base}ुआ`, `${base}ुए`, `${base}ुई`, `${base}ुईं`];
      sub = { s1: `${base}ुऊँ`, s23: `${base}ुए`, sp: `${base}ुएँ`, s2p: `${base}ुओ`, formal: `${base}ुइए` };
      break;
    default: throw new Error(`unknown verb kind "${kind}" (c, v, e, ii, uu)`);
  }
  if (!opts.has('nopf')) {
    add(pfv[0], `${pf} m sg`); add(pfv[1], `${pf} m pl`); add(pfv[2], `${pf} f sg`); add(pfv[2], `${pf} f pl`); add(pfv[3], `${pf} f pl`);
  }
  // the subjunctive, the commands and the future
  // the way the rule engine states them: the singular second / third person is one form, the plural first / second / third another
// every person is a reading of its own, in the order third, first, second; Polite=Form only on the आप reading
  const persons = (form: string, tags: string, set: 'sing' | 'plur') => {
    if (set === 'sing') { add(form, `${tags} Person=3 Number=Sing`); add(form, `${tags} Person=2 Number=Sing`); }
    else { add(form, `${tags} Person=3 Number=Plur`); add(form, `${tags} Person=1 Number=Plur`); add(form, `${tags} Person=2 Number=Plur Polite=Form`); }
  };
  add(sub.s1, `Mood=Sub Person=1 Number=Sing ${FIN}`);
  persons(sub.s23, `Mood=Sub ${FIN}`, 'sing');
  persons(sub.sp, `Mood=Sub ${FIN}`, 'plur');
  add(sub.s2p, `Mood=Imp Person=2 Polite=Fam ${FIN}`);
  add(sub.s2p, `Mood=Sub Person=2 Polite=Fam ${FIN}`);
  add(sub.sp, `Mood=Imp Person=2 Polite=Form ${FIN}`);
  if (!opts.has('noimp')) add(sub.formal, `Mood=Imp Person=2 Polite=Form ${FIN}`);
  if (!opts.has('nofut')) {
    // the plural: खाएँगे (a nasal on the vowel), समझेंगे / देंगे (anusvara before ग)
    add(`${sub.s1}गा`, `${FUT} Person=1 Number=Sing Gender=Masc`); add(`${sub.s1}गी`, `${FUT} Person=1 Number=Sing Gender=Fem`);
    persons(`${sub.s23}गा`, `${FUT} Gender=Masc`, 'sing'); persons(`${sub.s23}गी`, `${FUT} Gender=Fem`, 'sing');
    persons(`${sub.sp}गे`, `${FUT} Gender=Masc`, 'plur'); persons(`${sub.sp}गी`, `${FUT} Gender=Fem`, 'plur');
    add(`${sub.s2p}गे`, `${FUT} Person=2 Polite=Fam Gender=Masc`); add(`${sub.s2p}गी`, `${FUT} Person=2 Polite=Fam Gender=Fem`);
  }
  if (!opts.has('noconv') && stem !== 'कर') {
    add(`${stem}कर`, 'VerbForm=Conv'); add(`${stem}करके`, 'VerbForm=Conv');
  }
  return out;
}

/** Expand the macros in a row's explicit forms. */
function expandForms(r: HiRow): string[] | undefined {
  if (!r.forms) return undefined;
  const out: string[] = [];
  for (const f of r.forms) {
    if (!f.startsWith('@')) { out.push(f); continue; }
    const m = /^@(adj|ord|verb)(?::(.*))?$/u.exec(f);
    if (!m) throw new Error(`unknown macro "${f}"`);
    if (m[1] === 'adj') out.push(...adjectiveForms(r.lemma, (m[2] ?? '').trim()));
    else if (m[1] === 'ord') out.push(...ordinalForms(r.lemma));
    else {
      const [kind, ...flags] = (m[2] ?? '').trim().split(/\s+/);
      for (const fl of flags) if (!['nopf', 'noimp', 'nofut', 'noconv'].includes(fl)) throw new Error(`unknown flag "${fl}"`);
      out.push(...verbForms(r.lemma, kind, new Set(flags)));
    }
  }
  return out;
}

/** The forms a row lists when it gives none: the lemma, with the gender and number it certainly has. */
function defaultForms(r: HiRow): string[] {
  const end = r.lemma.slice(-1);
  switch (r.pos) {
    case 'VERB':
    case 'AUX': return [`${r.lemma}:inf`];
    case 'NOUN':
    case 'PROPN': {
      if (!r.gender) return [r.lemma];
      if (r.gender === 'mf') return [`${r.lemma}:Gender=Masc`, `${r.lemma}:Gender=Fem`];
      // a feminine lemma form is singular; a masculine one in -ा is singular, one that does not change or ends in a consonant is not (घर: one house or many)
      if (r.gender === 'f') return [r.pos === 'NOUN' ? `${r.lemma}:f sg` : `${r.lemma}:f`];
      return [r.pos === 'NOUN' && end === AA && !r.invariant ? `${r.lemma}:m sg dir` : `${r.lemma}:m`];
    }
    case 'ADJ':
      return end === AA && !r.invariant ? adjectiveForms(r.lemma, '') : [r.lemma];
    default: return [r.lemma];
  }
}

export interface BuiltRows {
  entries: LexEntry[];
  annotations: Map<string, HiAnnotation>;
  /** lemma|pos listed twice (the second is skipped). */
  duplicates: string[];
}

/** Rows → lexicon entries. A repeat of lemma + part of speech (inside the rows or already in `taken`) is reported and skipped. */
export function buildRows(rows: readonly HiRow[], taken: ReadonlySet<string> = new Set(), problems?: string[]): BuiltRows {
  const entries: LexEntry[] = [];
  const annotations = new Map<string, HiAnnotation>();
  const seen = new Set<string>();
  const duplicates: string[] = [];
  for (const r of rows) {
    const key = annotationKey(r.lemma, r.pos) + (r.homograph ? `#${r.homograph}` : '');
    if (seen.has(key) || taken.has(key)) { duplicates.push(key); continue; }
    seen.add(key);
    let entry: LexEntry;
    try {
      entry = E(r.lemma, r.pos, r.gloss, expandForms(r) ?? defaultForms(r));
    } catch (e) {
      if (!problems) throw new Error(`${r.where}: ${(e as Error).message}`);
      problems.push(`${r.where}: ${(e as Error).message}`);
      seen.delete(key);
      continue;
    }
    // every form is NFC (E keeps what it is given)
    entry.forms = entry.forms.map((f) => ({ ...f, form: nfc(f.form), morph: r.causativeOf ? { ...f.morph, Voice: 'Cau' } : f.morph }));
    entries.push(entry);
    const info: HindiLemmaInfo = { pos: r.pos };
    if (r.gender) info.gender = r.gender;
    if (r.invariant) info.invariant = true;
    if (r.ergative !== undefined) info.ergative = r.ergative;
    if (r.causativeOf) info.causativeOf = r.causativeOf;
    annotations.set(key, {
      ...(r.register.length ? { register: r.register } : {}),
      ...(r.domains.length ? { domains: r.domains } : {}),
      ...(r.also.length ? { also: r.also } : {}),
      info,
    });
  }
  return { entries, annotations, duplicates };
}
