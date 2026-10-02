/**
 * Row format for the Spanish hand lexicon. A lexicon file is a text block:
 *
 *   # NOUN                          a section header: the part of speech of the lines below it
 *   madre/f = mother                lemma, optional gender (/m /f /mf), gloss
 *   cobija/f = blanket [es-419]     optional tags in brackets: varieties (es-HN, voseo …) and registers (colloquial …)
 *   lunes/m = Monday | lunes:m sg; lunes:m pl     optional explicit forms after a bar, separated by semicolons
 *
 * Nouns, adjectives and verbs list only their lemma (a verb: its infinitive): the morphology engine supplies the
 * other forms. Closed classes (articles, pronouns, determiners …) list their forms, because a learner meets them
 * constantly and they must not depend on the engine. Variety and register tags travel in a side table keyed by
 * lemma + part of speech (`annotationKey`) and are copied onto the candidates by the adapter.
 *
 * Machine-drafted and not native-reviewed: a word or meaning that was not certain is left out.
 */
import type { PartOfSpeech, RegisterTag } from '../../core';
import { E, type LexEntry } from '../shared';

export interface EsAnnotation { varieties?: string[]; register?: RegisterTag[]; role?: string }

export const annotationKey = (lemma: string, pos: PartOfSpeech): string => `${lemma}|${pos}`;

export interface EsRow {
  lemma: string;
  pos: PartOfSpeech;
  gloss: string;
  gender?: 'm' | 'f' | 'mf';
  varieties: string[];
  register: RegisterTag[];
  forms?: string[];
}

const POS = new Set<PartOfSpeech>(['NOUN', 'PROPN', 'VERB', 'AUX', 'ADJ', 'ADV', 'PRON', 'DET', 'ADP', 'CONJ', 'SCONJ', 'PART', 'NUM', 'INTJ']);
const REGISTERS = new Set<string>(['standard', 'colloquial', 'formal', 'literary', 'archaic', 'historical', 'religious', 'slang']);

/**
 * Parse a block of lines (see the file comment). A malformed line is never dropped silently: without `problems` it
 * throws; with `problems` (what the adapter passes, so that one bad row cannot stop every adapter from loading) the
 * line is skipped and "file:line: what is wrong" is pushed there — a test asserts that list is empty.
 * A bad section header leaves the lines below it without a part of speech, and each of them is reported.
 */
export function parseRows(source: string, label = 'rows', problems?: string[]): EsRow[] {
  const rows: EsRow[] = [];
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
      const tags = /\s*\[([^\]]+)\]\s*$/u.exec(rest);
      if (tags) {
        rest = rest.slice(0, tags.index).trim();
        for (const t of tags[1].split(/\s+/).filter(Boolean)) {
          if (REGISTERS.has(t)) register.push(t as RegisterTag);
          else if (/^(es-[A-Za-z0-9]+|voseo|vosotros)$/u.test(t)) varieties.push(t);
          else throw new Error(`unknown tag "${t}"`);
        }
      }
      let gender: EsRow['gender'];
      const g = /\/(m|f|mf)$/u.exec(head);
      if (g) { gender = g[1] as EsRow['gender']; head = head.slice(0, g.index); }
      if (!head || !rest) throw new Error('empty lemma or gloss');
      rows.push({ lemma: head, pos, gloss: rest, gender, varieties, register, forms });
    } catch (err) {
      const message = `${where}: ${err instanceof Error ? err.message : String(err)}`;
      if (!problems) throw new Error(message);
      problems.push(message);
    }
  });
  return rows;
}

/** The forms a row lists when it gives none: the lemma, with the gender and number it certainly has. */
function defaultForms(r: EsRow): string[] {
  switch (r.pos) {
    case 'VERB':
    case 'AUX': return [`${r.lemma}:inf`];
    case 'NOUN':
      return [r.gender === 'mf' ? `${r.lemma}:Gender=Fem,Masc sg` : r.gender ? `${r.lemma}:${r.gender} sg` : `${r.lemma}:sg`];
    case 'ADJ': return [r.gender === 'm' || (!r.gender && r.lemma.endsWith('o')) ? `${r.lemma}:m sg` : `${r.lemma}:sg`];
    default: return [r.lemma];
  }
}

export interface BuiltRows { entries: LexEntry[]; annotations: Map<string, EsAnnotation>; duplicates: string[] }

/**
 * Rows → lexicon entries. A row whose lemma + part of speech is already in `taken` (the older hand list, which keeps
 * its explicit paradigms) is skipped; a repeat inside the rows themselves is reported in `duplicates`.
 * A row whose forms cannot be built throws, or with `problems` is skipped and reported there (see `parseRows`).
 */
export function buildRows(rows: readonly EsRow[], taken: ReadonlySet<string> = new Set(), problems?: string[]): BuiltRows {
  const entries: LexEntry[] = [];
  const annotations = new Map<string, EsAnnotation>();
  const seen = new Set<string>();
  const duplicates: string[] = [];
  for (const r of rows) {
    const key = annotationKey(r.lemma, r.pos);
    if (seen.has(key)) { duplicates.push(key); continue; }
    seen.add(key);
    if (taken.has(key)) continue;
    try {
      entries.push(E(r.lemma, r.pos, r.gloss, r.forms ?? defaultForms(r)));
    } catch (err) {
      if (!problems) throw err;
      problems.push(`${key}: ${err instanceof Error ? err.message : String(err)}`);
      continue;
    }
    if (r.varieties.length || r.register.length) {
      annotations.set(key, { ...(r.varieties.length ? { varieties: r.varieties } : {}), ...(r.register.length ? { register: r.register } : {}) });
    }
  }
  return { entries, annotations, duplicates };
}

/** Merge annotation maps; later maps win per key. */
export function mergeAnnotations(...maps: Array<Map<string, EsAnnotation>>): Map<string, EsAnnotation> {
  const out = new Map<string, EsAnnotation>();
  for (const m of maps) for (const [k, v] of m) out.set(k, { ...(out.get(k) ?? {}), ...v });
  return out;
}
