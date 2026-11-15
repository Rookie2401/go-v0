import fs from 'node:fs';
import path from 'node:path';
import type { CorpusDocument } from '../src/ingest';

export interface VerifiedTranslation {
  lang: string;
  translationId: string;
  verses: Record<string, { text: string }>;
}

/** Compare only documents that declare verification against their named translation. */
export function checkVerifiedScripture(documents: CorpusDocument[], translations: VerifiedTranslation[]) {
  const errors: string[] = [];
  let sentences = 0;
  for (const doc of documents) {
    if (doc.contentType !== 'scripture' || !doc.scripture?.verification) continue;
    const matches = translations.filter(t => t.lang === doc.lang && t.translationId === doc.scripture!.translationId);
    if (matches.length !== 1) {
      errors.push(`${doc.lang}/${doc.id}: expected one verification record for ${doc.scripture.translationId}, found ${matches.length}`);
      continue;
    }
    const translation = matches[0];
    for (const section of doc.sections) for (const paragraph of section.paragraphs) {
      if (!('sentences' in paragraph)) { errors.push(`${doc.lang}/${doc.id}: verified Scripture needs explicit verse sentences`); continue; }
      for (const sentence of paragraph.sentences) {
        const refs = sentence.verseRefs ?? [];
        if (!refs.length || refs.some(ref => !translation.verses[ref]) || sentence.text !== refs.map(ref => translation.verses[ref]?.text).join(' ')) {
          errors.push(`${doc.lang}/${doc.id}: ${refs.join(',')} differs from verification record ${translation.translationId}`);
        } else sentences++;
      }
    }
  }
  return { errors, sentences };
}

/** The main record plus optional language-specific records. Each translation still needs
 * exactly one record; checkVerifiedScripture rejects duplicates and wording mismatches.
 */
export function loadVerifiedTranslations(directory = 'data/verified'): VerifiedTranslation[] {
  if (!fs.existsSync(directory)) return [];
  return fs.readdirSync(directory).filter(file => file === 'scripture.json' || file.endsWith('.scripture.json')).sort()
    .flatMap(file => {
      const record = JSON.parse(fs.readFileSync(path.join(directory, file), 'utf8')) as { translations?: VerifiedTranslation[] };
      if (!Array.isArray(record.translations)) throw new Error(`Invalid Scripture verification record: ${file}`);
      return record.translations;
    });
}
