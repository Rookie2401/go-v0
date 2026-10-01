/** Pure readers for the inputs of `bench:units --text` and `--sensitivity` (the script does the file access). */
import type { Span } from '../../core';
import type { CorpusDocument } from '../../ingest';
import type { UnitGoldCase } from './gold';
import { goldSystem } from './systems';
import { paragraphsOfDocuments } from './probe';

/** Paragraphs of a plain text: the non-empty lines, indentation trimmed (spaces and tabs only), as the importer reads a book. */
export function paragraphsFromPlainText(text: string): string[] {
  return text.replace(/^﻿/, '').split(/\r\n|\r|\n/).map((l) => l.replace(/^[ \t]+|[ \t]+$/g, '')).filter((l) => l !== '');
}

/** Paragraph texts of one parsed v2 document (declared sentences joined by their separator). */
export function paragraphsFromDocument(doc: CorpusDocument): string[] {
  return paragraphsOfDocuments([doc]);
}

/**
 * Gold paragraphs read as a book: one line per paragraph, the way the in-app importer reads a text. A paragraph that
 * contains a line break cannot be one line of a text file, so those are left out (the `hard-break` hazard is about the
 * splitter, not about the importer); indentation of spaces and tabs is trimmed by the importer, so the gold units are
 * re-based on the trimmed paragraph. Returns the text and the gold units by paragraph text.
 */
export function bookFromGold(cases: readonly UnitGoldCase[]): { text: string; gold: Map<string, Span[]>; kept: number } {
  const lines: string[] = [];
  const gold = new Map<string, Span[]>();
  for (const c of cases) {
    if (/[\r\n]/.test(c.paragraph)) continue;
    const lead = c.paragraph.length - c.paragraph.replace(/^[ \t]+/, '').length;
    const line = c.paragraph.replace(/^[ \t]+|[ \t]+$/g, '');
    if (line === '') continue;
    const shifted: UnitGoldCase = { ...c, paragraph: line, unitBoundaries: c.unitBoundaries.map((b) => b - lead).filter((b) => b > 0 && b < line.length) };
    lines.push(line);
    gold.set(line, goldSystem([shifted]).split(line));
  }
  return { text: lines.join('\n'), gold, kept: lines.length };
}
