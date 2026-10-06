import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

const cfg = { de: ['deu1912'], es: ['spaRV1909'] } as const;
const expected = { de: { chapters: 1189, verses: 31102, seed: ['bible-gen-1-complete', 'bible-psa-1-complete', 'bible-psa-23-complete', 'bible-mat-1-complete', 'bible-1john-1-complete'] }, es: { chapters: 1189, verses: 31084, seed: ['bible-1john-1-complete'] } } as const;
describe('full approved USFM Bible sources', () => {
  for (const [lang, [id]] of Object.entries(cfg)) it(`${lang} has complete lazy source coverage`, () => {
    const docs = JSON.parse(fs.readFileSync(path.resolve(`data/sources/${lang}-bible/${id}-library-documents.json`), 'utf8'));
    const refs = docs.flatMap((d: any) => d.sections.flatMap((s: any) => s.paragraphs.flatMap((p: any) => p.sentences ?? []))).flatMap((s: any) => s.verseRefs);
    expect(docs.length).toBe(expected[lang as keyof typeof expected].chapters);
    expect(refs.length).toBe(expected[lang as keyof typeof expected].verses);
    expect(new Set(refs).size).toBe(refs.length);
    const sentences = docs.flatMap((d: any) => d.sections.flatMap((s: any) => s.paragraphs.flatMap((p: any) => p.sentences ?? [])));
    expect(sentences.every((s: any) => s.text.trim().length > 0)).toBe(true);
    for (const ref of ['JHN.3.16', '1JN.1.8', '1JN.1.9']) expect(refs).toContain(ref);
    for (const seed of expected[lang as keyof typeof expected].seed) expect(docs.some((d: any) => d.id === seed), `${lang}:${seed}`).toBe(true);
    expect(docs.some((d: any) => d.id === 'bible-gen-1' && lang === 'de')).toBe(false);
  });
});
