/**
 * Hindi sentence boundaries: the danda (।) and double danda (॥), the Latin stops Hindi also uses (? ! …), quotation
 * marks and dashes around speech, abbreviations with a full stop or the abbreviation sign (डॉ., श्री, प्रो., ई॰), verse
 * numbers. Offsets are exact: the spans tile the text and nothing is trimmed away or added.
 *
 * CONTRACT STUB (docs/PLAN12.md, package H4). The exported signature is final.
 */
import type { Span } from '../../core';
import { splitSentences } from '../shared';

export function segmentHindiSentences(text: string): Span[] {
  return splitSentences(text, { terminators: '।॥.!?…', abbreviations: [] });
}
