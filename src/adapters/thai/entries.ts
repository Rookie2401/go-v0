/**
 * Row format for the Thai hand lexicon. A row is [form, part of speech, short gloss, extras]. The shared
 * `Lexicon` has no slot for role / register, so those travel in a side table keyed by lemma + part of speech
 * (`annotationKey`) and are copied onto the candidates by the adapter.
 *
 * Machine-drafted and not native-reviewed: a word or meaning that was not certain is left out.
 */
import type { PartOfSpeech, RegisterTag } from '../../core';
import { E, type LexEntry } from '../shared';

export interface RowExtra {
  /** What the word does, in plain words ("softening particle", "progressive marker"). */
  role?: string;
  /** Anything that is not ordinary contemporary Central Thai. */
  register?: RegisterTag[];
  /** What a classifier counts. */
  counts?: string;
  /** The word counts itself (วัน, ครั้ง …): a number may follow it without a classifier. */
  unit?: boolean;
  /** Extra candidate notes. */
  notes?: Record<string, string | string[]>;
}

export type ThaiRow = readonly [form: string, pos: PartOfSpeech, gloss: string, extra?: RowExtra];

export interface ThaiAnnotation { role?: string; register?: RegisterTag[]; counts?: string }

export const annotationKey = (lemma: string, pos: PartOfSpeech): string => `${lemma}|${pos}`;

export interface BuiltRows { entries: LexEntry[]; annotations: Map<string, ThaiAnnotation> }

export function buildRows(rows: readonly ThaiRow[]): BuiltRows {
  const entries: LexEntry[] = [];
  const annotations = new Map<string, ThaiAnnotation>();
  for (const [form, pos, gloss, extra] of rows) {
    const notes: Record<string, string | string[]> = { ...(extra?.notes ?? {}) };
    if (extra?.unit) notes.unit = 'yes';
    entries.push(E(form, pos, gloss, undefined, { notes: Object.keys(notes).length ? notes : undefined }));
    if (extra?.role || extra?.register || extra?.counts) {
      annotations.set(annotationKey(form, pos), { role: extra.role, register: extra.register, counts: extra.counts });
    }
  }
  return { entries, annotations };
}

/** Merge annotation maps; later maps win per key. */
export function mergeAnnotations(...maps: Array<Map<string, ThaiAnnotation>>): Map<string, ThaiAnnotation> {
  const out = new Map<string, ThaiAnnotation>();
  for (const m of maps) for (const [k, v] of m) out.set(k, { ...(out.get(k) ?? {}), ...v });
  return out;
}
