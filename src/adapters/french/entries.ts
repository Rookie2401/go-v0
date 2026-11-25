/**
 * Row format for the French hand lexicon (a copy of spanish/entries.ts with French tags). A lexicon file is a text block:
 *
 *   # NOUN                          a section header: the part of speech of the lines below it
 *   mère/f = mother                 lemma, optional gender (/m /f /mf), gloss
 *   héros/m = hero [h-aspiré]       optional tags in brackets (see below)
 *   cheval/m = horse | cheval:m sg; chevaux:m pl      optional explicit forms after a bar, separated by semicolons
 *
 * TAGS in brackets, any number, separated by spaces:
 *   - a variety code from varieties.ts (fr-CA, fr-BE, fr-CH, fr-FR, fr-africa, fr-louisiana, fr-hist): an unknown code is an error;
 *   - a register: standard colloquial formal literary archaic historical religious slang;
 *   - h-aspiré    the word begins with an aspirated h (no elision, no liaison before it);
 *   - être        a verb whose compound tenses take être;  être/avoir  one that takes either (être when intransitive);
 *   - pronominal  a verb normally used with a reflexive pronoun (the row lists the bare infinitive: se souvenir → souvenir);
 *   - +à+le       the halves of a contraction, written with a plus before each (au = +à+le): carried as `notes.components`.
 *
 * Nouns, adjectives and verbs list only their lemma (a verb: its infinitive): the morphology engine supplies the other
 * forms. A noun's built entry is its singular with Gender and Number=Sing (a /mf noun: Gender "Fem,Masc"); an adjective's is
 * the masculine singular (/mf: both genders, for an adjective that does not change in the singular: rapide); a verb's is
 * the infinitive. A row that lists forms after the bar gets ONLY those forms. Closed classes list every form.
 *
 * Machine-drafted and not checked by a native speaker: a word, gender or meaning that was not certain is left out.
 */
import type { PartOfSpeech, RegisterTag } from '../../core';
import { E, type LexEntry } from '../shared';
import { annotationKey, type FrAnnotation } from './types';
import { FR_VARIETY_CODES } from './varieties';

export interface FrRow {
  lemma: string;
  pos: PartOfSpeech;
  gloss: string;
  gender?: 'm' | 'f' | 'mf';
  varieties: string[];
  register: RegisterTag[];
  hAspire?: boolean;
  aux?: 'être' | 'both';
  pronominal?: boolean;
  /** The halves of a contraction, from the `+à+le` tag. */
  components?: string[];
  forms?: string[];
}

const POS = new Set<PartOfSpeech>(['NOUN', 'PROPN', 'VERB', 'AUX', 'ADJ', 'ADV', 'PRON', 'DET', 'ADP', 'CONJ', 'SCONJ', 'PART', 'NUM', 'INTJ']);
const REGISTERS = new Set<string>(['standard', 'colloquial', 'formal', 'literary', 'archaic', 'historical', 'religious', 'slang']);
const VARIETY_CODES = new Set<string>(FR_VARIETY_CODES);

/**
 * Parse a block of lines (see the file comment). A malformed line is never dropped silently: without `problems` it
 * throws; with `problems` the line is skipped and "file:line: what is wrong" is pushed there — a test asserts that list is empty.
 * A bad section header leaves the lines below it without a part of speech, and each of them is reported.
 */
export function parseRows(source: string, label = 'rows', problems?: string[]): FrRow[] {
  const rows: FrRow[] = [];
  let pos: PartOfSpeech | undefined;
  source.split('\n').forEach((raw, n) => {
    const line = raw.trim();
    if (!line || line.startsWith('//')) return;
    const where = `${label}:${n + 1}`;
    try {
      if (line.startsWith('#')) {
        const p = line.slice(1).trim() as PartOfSpeech;
        pos = undefined;
        if (!POS.has(p)) throw new Error(`unknown part of speech "${p}"`);
        pos = p;
        return;
      }
      if (!pos) throw new Error('a row before any section header');
      const eq = line.indexOf(' = ');
      if (eq < 0) throw new Error('expected "lemma = gloss"');
      let head = line.slice(0, eq).trim();
      let rest = line.slice(eq + 3).trim();
      let forms: string[] | undefined;
      const bar = rest.indexOf(' | ');
      if (bar >= 0) {
        forms = rest.slice(bar + 3).split(';').map((f) => f.trim()).filter(Boolean);
        rest = rest.slice(0, bar).trim();
      }
      const varieties: string[] = [];
      const register: RegisterTag[] = [];
      let hAspire: boolean | undefined;
      let aux: FrRow['aux'];
      let pronominal: boolean | undefined;
      let components: string[] | undefined;
      const tags = /\s*\[([^\]]+)\]\s*$/u.exec(rest);
      if (tags) {
        rest = rest.slice(0, tags.index).trim();
        for (const t of tags[1].split(/\s+/).filter(Boolean)) {
          if (REGISTERS.has(t)) register.push(t as RegisterTag);
          else if (t === 'h-aspiré') hAspire = true;
          else if (t === 'être') aux = 'être';
          else if (t === 'être/avoir') aux = 'both';
          else if (t === 'pronominal') pronominal = true;
          else if (/^(\+[^+\s]+){2,}$/u.test(t)) components = t.split('+').filter(Boolean);
          else if (/^fr-[A-Za-z0-9]+$/u.test(t)) {
            if (!VARIETY_CODES.has(t)) throw new Error(`unknown variety "${t}"`);
            varieties.push(t);
          } else throw new Error(`unknown tag "${t}"`);
        }
      }
      let gender: FrRow['gender'];
      const g = /\/(m|f|mf)$/u.exec(head);
      if (g) { gender = g[1] as FrRow['gender']; head = head.slice(0, g.index); }
      if (!head || !rest) throw new Error('empty lemma or gloss');
      rows.push({
        lemma: head, pos, gloss: rest, gender, varieties, register, forms,
        ...(hAspire ? { hAspire } : {}), ...(aux ? { aux } : {}), ...(pronominal ? { pronominal } : {}), ...(components ? { components } : {}),
      });
    } catch (err) {
      const message = `${where}: ${err instanceof Error ? err.message : String(err)}`;
      if (!problems) throw new Error(message);
      problems.push(message);
    }
  });
  return rows;
}

/** The forms a row lists when it gives none: the lemma, with the gender and number it certainly has. */
function defaultForms(r: FrRow): string[] {
  const gen = r.gender === 'mf' ? 'Gender=Fem,Masc ' : r.gender ? `${r.gender} ` : '';
  switch (r.pos) {
    case 'VERB':
    case 'AUX': return [`${r.lemma}:inf`];
    case 'NOUN': return [`${r.lemma}:${gen}sg`];
    case 'PROPN': return [`${r.lemma}:${gen}sg`];
    case 'ADJ': return [`${r.lemma}:${r.gender === 'mf' ? gen : 'm '}sg`];
    default: return [r.lemma];
  }
}

export interface BuiltRows { entries: LexEntry[]; annotations: Map<string, FrAnnotation>; duplicates: string[] }

/**
 * Rows → lexicon entries. A row whose lemma + part of speech is already in `taken` is skipped; a repeat inside the rows
 * themselves is reported in `duplicates`. A row whose forms cannot be built throws, or with `problems` is skipped and
 * reported there (see `parseRows`).
 */
export function buildRows(rows: readonly FrRow[], taken: ReadonlySet<string> = new Set(), problems?: string[]): BuiltRows {
  const entries: LexEntry[] = [];
  const annotations = new Map<string, FrAnnotation>();
  const seen = new Set<string>();
  const duplicates: string[] = [];
  for (const r of rows) {
    const key = annotationKey(r.lemma, r.pos);
    if (seen.has(key)) { duplicates.push(key); continue; }
    seen.add(key);
    if (taken.has(key)) continue;
    try {
      entries.push(E(r.lemma, r.pos, r.gloss, r.forms ?? defaultForms(r), r.components ? { notes: { components: r.components } } : {}));
    } catch (err) {
      if (!problems) throw err;
      problems.push(`${key}: ${err instanceof Error ? err.message : String(err)}`);
      continue;
    }
    const ann: FrAnnotation = {
      ...(r.varieties.length ? { varieties: r.varieties } : {}),
      ...(r.register.length ? { register: r.register } : {}),
      ...(r.hAspire ? { hAspire: true } : {}),
      ...(r.aux ? { aux: r.aux } : {}),
      ...(r.pronominal ? { pronominal: true } : {}),
    };
    if (Object.keys(ann).length) annotations.set(key, ann);
  }
  return { entries, annotations, duplicates };
}

/** Merge annotation maps; later maps win per key. */
export function mergeAnnotations(...maps: Array<Map<string, FrAnnotation>>): Map<string, FrAnnotation> {
  const out = new Map<string, FrAnnotation>();
  for (const m of maps) for (const [k, v] of m) out.set(k, { ...(out.get(k) ?? {}), ...v });
  return out;
}
