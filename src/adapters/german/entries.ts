/**
 * Row parser for the German hand lexicon. A lexicon file is a text block:
 *
 *   # NOUN                                   a section header: NOUN, VERB, ADJ, or the part of speech of a plain word
 *   // a comment                             a line starting with // is skipped
 *   Mann/m, -es, ¨-er = man; husband         noun: lemma/gender, genitive singular, nominative plural = gloss
 *   Student/m, -en, -en = student [weak]     tags in brackets at the end
 *   Eltern/pl = parents                      plural-only noun
 *   Deutsche/adj = German (person)           adjectival noun (declined like an adjective)
 *   Herz/n, -ens, -en = heart | D sg: Herzen explicit forms after a bar: "case number: form", separated by semicolons
 *   fahren = to drive | fährt, fuhr, gefahren, sein       verb: principal parts after a bar, optional auxiliary
 *   auf|stehen = to get up | steht, stand, gestanden, sein   a bar inside the lemma marks a SEPARABLE prefix
 *   reisen = to travel | sein                an auxiliary alone after the bar: a weak verb that takes sein
 *   sich freuen = to be glad                 reflexive verb (the lemma is stored without "sich")
 *   gut = good | besser, best                adjective: comparative, superlative stem after a bar
 *   teuer = expensive | teurer, teuerst [stem: teur]
 *   heute = today                            plain word (ADV, INTJ, CONJ, SCONJ, PART, NUM, PRON, PROPN, ADP, DET)
 *   doch = yes (contradicting) | role: what the word does   plain words may state a role after the bar
 *
 * "¨" means the stem vowel takes an umlaut (a → ä, o → ö, u → ü, au → äu; see `umlaut()` in types.ts).
 * Nouns: the genitive token is "-es", "-s", "-", "-en", "-ns", "-ens", "-ses" … (appended to the lemma) or a whole form;
 * the plural token is "-e", "¨-e", "-er", "¨-er", "-n", "-en", "-s", "-se", "-" (same as the singular), "¨-" (umlaut
 * only), "0" (no plural) or a whole form ("Studien", "Ärztinnen").
 * Tags: weak, adjectival (nouns); mixed, reflexive, dat, irregular (verbs); indeclinable, "stem: x" (adjectives);
 * registers (standard, colloquial, formal, literary, archaic, historical, religious, slang); varieties (de-AT, de-CH …).
 *
 * Machine-drafted and not checked by a native speaker: a malformed row throws with the file label and line number, so
 * a typo cannot silently drop a word.
 */
import type { PartOfSpeech, RegisterTag } from '../../core';
import type { DeAdjective, DeGender, DeNoun, DeVerb } from './types';
import { umlaut } from './types';

/** An uninflected word row: adverb, interjection, conjunction, particle, numeral, proper name … */
export interface DePlainRow {
  lemma: string;
  pos: PartOfSpeech;
  gloss: string;
  /** What the word does, in plain words (the modal particles). */
  role?: string;
  register?: RegisterTag[];
  varieties?: string[];
}

export interface DeRows { nouns: DeNoun[]; verbs: DeVerb[]; adjectives: DeAdjective[]; plain: DePlainRow[] }

const PLAIN_POS = new Set<string>(['ADV', 'INTJ', 'CONJ', 'SCONJ', 'PART', 'NUM', 'PRON', 'PROPN', 'ADP', 'DET']);
const REGISTERS = new Set<string>(['standard', 'colloquial', 'formal', 'literary', 'archaic', 'historical', 'religious', 'slang']);
const AUXES = new Set<string>(['haben', 'sein', 'haben/sein']);
const CASE_KEY: Record<string, string> = { n: 'N', nom: 'N', a: 'A', acc: 'A', d: 'D', dat: 'D', g: 'G', gen: 'G' };

interface Tags { weak: boolean; adjectival: boolean; mixed: boolean; reflexive: boolean; dat: boolean; irregular: boolean; indeclinable: boolean; stem?: string; register: RegisterTag[]; varieties: string[] }

/** Take the bracketed tag groups off the end of a string. */
function takeTags(s: string, tags: Tags, where: string): string {
  let out = s;
  for (;;) {
    const m = /\s*\[([^\]]*)\]\s*$/u.exec(out);
    if (!m) break;
    out = out.slice(0, m.index);
    let body = m[1];
    const stem = /stem:\s*(\S+)/u.exec(body);
    if (stem) { tags.stem = stem[1]; body = body.replace(stem[0], ' '); }
    for (const t of body.split(/[\s,]+/u).filter(Boolean)) {
      if (t === 'weak') tags.weak = true;
      else if (t === 'adjectival') tags.adjectival = true;
      else if (t === 'mixed') tags.mixed = true;
      else if (t === 'reflexive') tags.reflexive = true;
      else if (t === 'dat') tags.dat = true;
      else if (t === 'irregular') tags.irregular = true;
      else if (t === 'indeclinable') tags.indeclinable = true;
      else if (REGISTERS.has(t)) tags.register.push(t as RegisterTag);
      else if (/^de-[A-Za-z]{2,3}$/u.test(t)) tags.varieties.push(t);
      else throw new Error(`${where}: unknown tag "${t}"`);
    }
  }
  return out.trim();
}

const emptyTags = (): Tags => ({ weak: false, adjectival: false, mixed: false, reflexive: false, dat: false, irregular: false, indeclinable: false, register: [], varieties: [] });

/** Genitive-singular token → whole form. */
export function expandGenitive(lemma: string, token: string): string {
  if (token === '-') return lemma;
  if (token.startsWith('-')) return lemma + token.slice(1);
  return token;
}

/** Plural token → whole form, or undefined for "0" (no plural). */
export function expandPlural(lemma: string, token: string): string | undefined {
  if (token === '0') return undefined;
  if (token === '-') return lemma;
  if (token === '¨-') return umlaut(lemma);
  if (token.startsWith('¨-')) return umlaut(lemma) + token.slice(2);
  if (token.startsWith('-')) return lemma + token.slice(1);
  return token;
}

function parseNoun(head: string, gloss: string, tail: string | undefined, tags: Tags, where: string): DeNoun {
  const cols = head.split(',').map((c) => c.trim());
  const g = /^(.+)\/(m|f|n|pl|adj)$/u.exec(cols[0]);
  if (!g) throw new Error(`${where}: a noun row needs "Lemma/m|f|n|pl|adj"`);
  const lemma = g[1];
  if (!/^\p{Lu}[\p{L}\-]*$/u.test(lemma)) throw new Error(`${where}: a noun lemma starts with a capital letter, got "${lemma}"`);
  const kind = g[2];
  const noun: DeNoun = { lemma, gender: kind === 'pl' ? 'pl' : kind === 'adj' ? 'm' : (kind as DeGender), gloss };
  if (kind === 'pl') {
    if (cols.length !== 1) throw new Error(`${where}: a plural-only noun lists only "${lemma}/pl"`);
    noun.plural = lemma;
  } else if (kind === 'adj') {
    if (cols.length !== 1) throw new Error(`${where}: an adjectival noun lists only "${lemma}/adj"`);
    noun.adjectival = true;
  } else {
    if (cols.length !== 3 || !cols[1] || !cols[2]) throw new Error(`${where}: a noun row needs "Lemma/g, genitive, plural"`);
    noun.genSg = expandGenitive(lemma, cols[1]);
    const pl = expandPlural(lemma, cols[2]);
    if (pl !== undefined) noun.plural = pl;
  }
  if (tags.weak) noun.weak = true;
  if (tags.adjectival) noun.adjectival = true;
  if (tags.mixed || tags.reflexive || tags.dat || tags.irregular || tags.indeclinable || tags.stem) throw new Error(`${where}: a tag that does not belong on a noun`);
  if (tail) {
    const irregular: Record<string, string> = {};
    for (const piece of tail.split(';').map((p) => p.trim()).filter(Boolean)) {
      const m = /^([A-Za-z]+)\s+(sg|pl)\s*:\s*(\S.*)$/u.exec(piece);
      const cs = m ? CASE_KEY[m[1].toLowerCase()] : undefined;
      if (!m || !cs) throw new Error(`${where}: explicit form "${piece}" is not "case number: form"`);
      irregular[`${cs} ${m[2]}`] = m[3].trim();
    }
    if (Object.keys(irregular).length) noun.irregular = irregular;
  }
  if (tags.register.length) noun.register = tags.register;
  if (tags.varieties.length) noun.varieties = tags.varieties;
  return noun;
}

function parseVerb(head: string, gloss: string, tail: string | undefined, tags: Tags, where: string): DeVerb {
  let lemmaText = head.trim();
  let reflexive = tags.reflexive;
  if (lemmaText.startsWith('sich ')) { reflexive = true; lemmaText = lemmaText.slice(5).trim(); }
  if (!/^[a-zäöüß]+(\|[a-zäöüß]+)?$/u.test(lemmaText)) throw new Error(`${where}: bad verb lemma "${lemmaText}"`);
  let prefix: string | undefined;
  let base: string | undefined;
  let lemma = lemmaText;
  if (lemmaText.includes('|')) {
    [prefix, base] = lemmaText.split('|');
    lemma = prefix + base;
  }
  let pres3: string | undefined;
  let pret: string | undefined;
  let part: string | undefined;
  let aux: DeVerb['aux'] = 'haben';
  if (tail) {
    const bits = tail.split(',').map((b) => b.trim());
    if (bits.length === 1 && AUXES.has(bits[0])) aux = bits[0] as DeVerb['aux'];
    else {
      if (bits.length < 3 || bits.length > 4 || bits.slice(0, 3).some((b) => !b || AUXES.has(b))) throw new Error(`${where}: principal parts are "present3, preterite, participle[, auxiliary]"`);
      [pres3, pret, part] = bits;
      if (bits.length === 4) {
        if (!AUXES.has(bits[3])) throw new Error(`${where}: unknown auxiliary "${bits[3]}"`);
        aux = bits[3] as DeVerb['aux'];
      }
    }
  }
  if (tags.mixed && !part) throw new Error(`${where}: a mixed verb lists its three principal parts`);
  if (tags.weak || tags.adjectival || tags.indeclinable || tags.stem) throw new Error(`${where}: a tag that does not belong on a verb`);
  const cls: DeVerb['cls'] = tags.irregular ? 'irregular' : tags.mixed ? 'mixed' : part ? 'strong' : 'weak';
  const verb: DeVerb = { lemma, cls, aux, gloss };
  if (pres3) { verb.pres3 = pres3; verb.pret = pret; verb.part = part; }
  if (prefix && base) { verb.prefix = prefix; verb.base = base; }
  if (reflexive) verb.reflexive = true;
  if (tags.dat) verb.governs = 'dat';
  if (tags.register.length) verb.register = tags.register;
  if (tags.varieties.length) verb.varieties = tags.varieties;
  return verb;
}

function parseAdjective(head: string, gloss: string, tail: string | undefined, tags: Tags, where: string): DeAdjective {
  if (!/^[a-zäöüß\-]+$/u.test(head)) throw new Error(`${where}: bad adjective lemma "${head}"`);
  const adj: DeAdjective = { lemma: head, gloss };
  if (tail) {
    const bits = tail.split(',').map((b) => b.trim());
    if (bits.length !== 2 || !bits[0] || !bits[1]) throw new Error(`${where}: comparison is "comparative, superlative stem"`);
    adj.comparative = bits[0];
    adj.superlative = bits[1];
  }
  if (tags.weak || tags.adjectival || tags.mixed || tags.reflexive || tags.dat || tags.irregular) throw new Error(`${where}: a tag that does not belong on an adjective`);
  if (tags.stem) adj.stem = tags.stem;
  if (tags.indeclinable) adj.indeclinable = true;
  if (tags.register.length) adj.register = tags.register;
  if (tags.varieties.length) adj.varieties = tags.varieties;
  return adj;
}

function parsePlain(head: string, pos: PartOfSpeech, gloss: string, tail: string | undefined, tags: Tags, where: string): DePlainRow {
  if (!/^[\p{L}\-']+$/u.test(head)) throw new Error(`${where}: bad word "${head}"`);
  if (tags.weak || tags.adjectival || tags.mixed || tags.reflexive || tags.dat || tags.irregular || tags.indeclinable || tags.stem) throw new Error(`${where}: a tag that does not belong on a plain word`);
  const row: DePlainRow = { lemma: head, pos, gloss };
  if (tail) {
    const m = /^role:\s*(\S.*)$/u.exec(tail);
    if (!m) throw new Error(`${where}: after the bar a plain word states "role: …"`);
    row.role = m[1].trim();
  }
  if (tags.register.length) row.register = tags.register;
  if (tags.varieties.length) row.varieties = tags.varieties;
  return row;
}

/** Parse a block of rows (see the file comment). A malformed row throws, with the label and the line number. */
export function parseRows(source: string, label = 'rows'): DeRows {
  const out: DeRows = { nouns: [], verbs: [], adjectives: [], plain: [] };
  let section: string | undefined;
  source.split('\n').forEach((raw, n) => {
    const line = raw.trim();
    if (!line || line.startsWith('//')) return;
    const where = `${label}:${n + 1}`;
    if (line.startsWith('#')) {
      const s = line.slice(1).trim();
      if (s !== 'NOUN' && s !== 'VERB' && s !== 'ADJ' && !PLAIN_POS.has(s)) throw new Error(`${where}: unknown section "${s}"`);
      section = s;
      return;
    }
    if (!section) throw new Error(`${where}: a row before any section header`);
    const eq = line.indexOf(' = ');
    if (eq < 0) throw new Error(`${where}: expected "lemma = gloss"`);
    const head = line.slice(0, eq).trim();
    let rest = line.slice(eq + 3).trim();
    const tags = emptyTags();
    rest = takeTags(rest, tags, where);
    let tail: string | undefined;
    const bar = rest.indexOf(' | ');
    if (bar >= 0) {
      tail = rest.slice(bar + 3).trim();
      rest = takeTags(rest.slice(0, bar).trim(), tags, where);
    }
    const gloss = rest.trim();
    if (!head || !gloss) throw new Error(`${where}: empty lemma or gloss`);
    if (tail === '') throw new Error(`${where}: nothing after the bar`);
    if (section === 'NOUN') out.nouns.push(parseNoun(head, gloss, tail, tags, where));
    else if (section === 'VERB') out.verbs.push(parseVerb(head, gloss, tail, tags, where));
    else if (section === 'ADJ') out.adjectives.push(parseAdjective(head, gloss, tail, tags, where));
    else out.plain.push(parsePlain(head, section as PartOfSpeech, gloss, tail, tags, where));
  });
  return out;
}
