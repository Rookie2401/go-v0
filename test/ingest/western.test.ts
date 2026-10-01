import { describe, expect, it } from 'vitest';
import { createMemoryStore } from '../../src/core';
import { importDocuments, plainTextToDocuments, previewDocuments, validateBatch, type CorpusDocument, type PlainTextOptions } from '../../src/ingest';
import { clock, registry } from './helpers';

const convert = (text: string, over: Partial<PlainTextOptions> = {}) => plainTextToDocuments(text, { lang: 'es', title: 'Libro de prueba', ...over });
const paragraphsOf = (d: CorpusDocument) => d.sections.flatMap((s) => s.paragraphs.map((p) => (p as { text: string }).text));
const lines = (...l: string[]) => l.join('\n');

const PROSE = [
  'Esa mañana el niño salió de la casa y caminó por el camino que llevaba al río, y su',
  'madre le había dicho que no se detuviera, porque la lluvia podía llegar antes del',
  'mediodía y no había dónde guarecerse en todo el trayecto hasta el puente viejo.',
  '',
  'Cuando llegó al puente, vio a un hombre que pescaba con una caña muy larga y que',
  'no levantó la vista cuando él pasó, aunque el niño lo saludó dos veces en voz alta',
  'y esperó un poco por si el hombre quería decirle algo sobre el tiempo.',
  '',
  'Entonces el hombre sonrió y dijo que el puente estaba viejo, pero que todavía',
  'aguantaba, y cruzaron juntos, despacio, mientras el agua corría debajo con un',
  'ruido de piedras que parecía una conversación muy antigua entre dos viejos amigos.',
];

describe('paragraphs: lines or blank-line blocks', () => {
  it('auto: a hard-wrapped text becomes one paragraph per block; the lines inside are kept exactly (unwrap off)', () => {
    const r = convert(lines('Capítulo I', '', ...PROSE));
    expect(r.documents).toHaveLength(1);
    const ps = paragraphsOf(r.documents[0]);
    expect(ps).toHaveLength(3);
    // exactness: the paragraph texts reproduce the source lines (a paragraph is its lines joined by the line break)
    expect(ps.flatMap((p) => p.split('\n'))).toEqual(PROSE.filter((l) => l !== ''));
    expect(ps[0]).toBe(PROSE.slice(0, 3).join('\n'));
    expect(r.notes.join(' ')).toMatch(/3 paragraphs read, each the lines between blank lines/);
    expect(r.notes.join(' ')).toMatch(/line breaks inside a paragraph are kept exactly as they are \(unwrap is off\)/);
    expect(r.quality.flags.map((f) => f.code)).toContain('hard-wrapped-lines');
  });

  it('auto: text that is already one paragraph per line stays one paragraph per line; Thai is never blank-line by default', () => {
    const text = lines('Primera línea completa del texto.', 'Segunda línea completa del texto.', '', 'Tercera línea completa del texto.');
    expect(paragraphsOf(convert(text).documents[0])).toEqual(['Primera línea completa del texto.', 'Segunda línea completa del texto.', 'Tercera línea completa del texto.']);
    const thai = plainTextToDocuments(lines('ฉันไปโรงเรียน', 'ฉันไปโรงเรียน', '', 'แมวนั่งบนเสื่อ', 'แมวนั่งบนเสื่อ', '', 'ฉันไปโรงเรียน', 'ฉันไปโรงเรียน', '', 'แมวนั่งบนเสื่อ', 'แมวนั่งบนเสื่อ'), { lang: 'th', title: 'T' });
    expect(paragraphsOf(thai.documents[0])).toHaveLength(8);
  });

  it('the option wins over detection', () => {
    expect(paragraphsOf(convert(lines(...PROSE), { paragraphs: 'lines' }).documents[0])).toHaveLength(9);
    expect(paragraphsOf(convert(lines('Una línea.', 'Otra línea.', '', 'Y otra.'), { paragraphs: 'blank-line' }).documents[0])).toEqual(['Una línea.\nOtra línea.', 'Y otra.']);
  });
});

describe('unwrap: counted, never silent', () => {
  it('joins the lines of a paragraph with a single space, and the report accounts for every join', () => {
    const r = convert(lines('Capítulo I', '', ...PROSE), { unwrap: true });
    const ps = paragraphsOf(r.documents[0]);
    expect(ps).toEqual([PROSE.slice(0, 3).join(' '), PROSE.slice(4, 7).join(' '), PROSE.slice(8, 11).join(' ')]);
    expect(ps.every((p) => !p.includes('\n'))).toBe(true);
    const interiorBreaks = 2 + 2 + 2;
    expect(r.unwrapped).toEqual({ spaces: interiorBreaks, dehyphenated: 0, hyphenKept: 0 });
    expect(r.notes.join(' ')).toMatch(/Unwrap joined 6 line breaks: 6 with a single space, 0 hyphenated breaks re-joined into one word, 0 kept their hyphen/);
  });

  it('a hyphenated line break is re-joined unless the word is hyphenated elsewhere in the text; every kind is counted', () => {
    const text = lines('Una pala-', 'bra rota y un bien-', 'estar grande; el bien-estar', 'de todos y el señor Pérez-', 'Gómez llegó.');
    const r = convert(text, { unwrap: true, paragraphs: 'blank-line' });
    expect(paragraphsOf(r.documents[0])).toEqual(['Una palabra rota y un bien-estar grande; el bien-estar de todos y el señor Pérez- Gómez llegó.']);
    expect(r.unwrapped).toEqual({ spaces: 2, dehyphenated: 1, hyphenKept: 1 });
    expect(r.notes.join(' ')).toMatch(/joined 4 line breaks: 2 with a single space, 1 hyphenated break re-joined into one word, 1 kept their hyphen/);
  });

  it('unwrap with one paragraph per line says it has no effect', () => {
    const r = convert(lines('Una línea.', 'Otra línea.'), { unwrap: true, paragraphs: 'lines' });
    expect(paragraphsOf(r.documents[0])).toEqual(['Una línea.', 'Otra línea.']);
    expect(r.unwrapped).toBeUndefined();
    expect(r.notes.join(' ')).toMatch(/Unwrap has no effect/);
  });
});

describe('boilerplate: removed only on request, only what was identified, and kept retrievable', () => {
  const HEADER = ['The Project Gutenberg eBook of Un libro', '', 'Title: Un libro', '', '*** START OF THE PROJECT GUTENBERG EBOOK UN LIBRO ***', ''];
  const FOOTER = ['', '*** END OF THE PROJECT GUTENBERG EBOOK UN LIBRO ***', 'Licence text that must not be in the book.'];
  const BOOK = lines(...HEADER, 'Capítulo I', '', ...PROSE, ...FOOTER);

  it('off by default: nothing is removed', () => {
    const r = convert(BOOK);
    expect(r.removed).toEqual([]);
    expect(r.documents.flatMap(paragraphsOf).join('\n')).toContain('Project Gutenberg');
    expect(r.quality.flags.map((f) => f.code)).toContain('boilerplate');
  });

  it('on request: exactly the identified lines go; they are listed with their line numbers and text; the rest is untouched', () => {
    const r = convert(BOOK, { stripBoilerplate: true });
    expect(r.removed.map((x) => [x.label, x.startLine, x.endLine])).toEqual([['Project Gutenberg header', 1, 5], ['Project Gutenberg licence', HEADER.length + 2 + PROSE.length + 2, HEADER.length + 2 + PROSE.length + 3]]);
    expect(r.removed[0].text).toBe(HEADER.slice(0, 5).join('\n'));
    expect(r.removed[1].text).toBe(FOOTER.slice(1).join('\n'));
    expect(r.notes.join(' ')).toMatch(/Removed 2 boilerplate blocks \(\d+ lines\): Project Gutenberg header, lines 1-5; Project Gutenberg licence/);
    const body = r.documents.flatMap(paragraphsOf).join('\n');
    expect(body).not.toMatch(/Gutenberg|Licence/);
    expect(body.split('\n')).toEqual(PROSE.filter((l) => l !== ''));
    // the heading is still found, and its line number is the line of the ORIGINAL file
    expect(r.headings).toEqual([{ line: HEADER.length + 1, text: 'Capítulo I' }]);
  });

  it('a text without boilerplate says so', () => {
    expect(convert(lines(...PROSE), { stripBoilerplate: true }).notes.join(' ')).toMatch(/No boilerplate was found to remove/);
  });
});

describe('chapter headings, Spanish and English', () => {
  const body = (n: number) => `Un párrafo del capítulo número ${n}.`;
  const BOOK = lines(
    'Capítulo I', body(1), 'CAPÍTULO SEGUNDO', body(2), 'Capítulo 12. El regreso', body(3), 'Libro segundo', body(4), 'Parte tercera', body(5),
    'Capítulo X: título', body(6), 'Chapter Two', body(7), 'Cap. 4 — Otro', body(8),
  );

  it('Capítulo I / CAPÍTULO SEGUNDO / Capítulo 12 / Libro segundo / Parte tercera / Chapter Two, with titles after a separator', () => {
    const r = convert(BOOK);
    expect(r.headings).toEqual([
      { line: 1, text: 'Capítulo I' }, { line: 3, text: 'CAPÍTULO SEGUNDO' }, { line: 5, text: 'Capítulo 12. El regreso', title: 'El regreso' }, { line: 7, text: 'Libro segundo' },
      { line: 9, text: 'Parte tercera' }, { line: 11, text: 'Capítulo X: título', title: 'título' }, { line: 13, text: 'Chapter Two' }, { line: 15, text: 'Cap. 4 — Otro', title: 'Otro' },
    ]);
    expect(r.documents).toHaveLength(8);
    expect(r.documents.map((d) => d.sections[0].title)).toEqual(r.headings.map((h) => h.text));
    expect(r.documents[2].title).toBe('Libro de prueba — Capítulo 12. El regreso');
    expect(r.notes.join(' ')).toMatch(/8 chapters found by headings like "Capítulo I"/);
    expect(r.notes.join(' ')).toMatch(/heading numbers \(1, 2, 12, 2, 3, 10, 2, 4\) do not run/);
  });

  it('a sentence that merely begins with such a word is not a heading', () => {
    const r = convert(lines('Capítulo I', body(1), 'Parte tercera del libro que leí', 'Capítulo de prueba', 'Capitulo', 'Libro segundo de la serie, con mucho texto después', 'Chapter two is long'));
    expect(r.headings.map((h) => h.text)).toEqual(['Capítulo I']);
  });

  it('bare Roman numerals are headings only when they form a sequence from I', () => {
    const roman = convert(lines('I.', body(1), 'II.', body(2), 'III. El final', body(3)));
    expect(roman.headings).toEqual([{ line: 1, text: 'I.' }, { line: 3, text: 'II.' }, { line: 5, text: 'III. El final', title: 'El final' }]);
    expect(roman.documents.map((d) => d.work)).toEqual([undefined, undefined, undefined]);
    // an initial or a lone numeral is not a chapter
    expect(convert(lines('C. S. Lewis escribió esto.', 'V.', body(1), 'V. Hugo escribió otro.')).headings).toEqual([]);
    expect(convert(lines('I.', body(1), 'V.', body(2))).headings).toEqual([]);
  });

  it('an explicit regular expression still wins over automatic detection', () => {
    const r = convert(lines('Capítulo I', body(1), 'ACTO I', body(2), 'ACTO II', body(3)), { chapters: 'ACTO [IVX]+' });
    expect(r.headings.map((h) => h.text)).toEqual(['ACTO I', 'ACTO II']);
    // the lines before the first ACTO (here the automatic heading "Capítulo I") are front matter, not a chapter
    expect(r.documents.map((d) => d.sections[0].title)).toEqual([undefined, 'ACTO I', 'ACTO II']);
    expect(paragraphsOf(r.documents[0])).toEqual(['Capítulo I', body(1)]);
  });

  it('the correction path: the result lists the headings; a corrected list of line numbers is passed on a second call', () => {
    const first = convert(BOOK);
    const lineNumbers = first.headings.map((h) => h.line).filter((n) => n !== 7 && n !== 9); // not "Libro segundo" and "Parte tercera"
    const second = convert(BOOK, { headings: lineNumbers });
    expect(second.headings.map((h) => h.line)).toEqual(lineNumbers);
    expect(second.documents).toHaveLength(6);
    expect(second.documents[2].sections[0].paragraphs.map((p) => (p as { text: string }).text)).toEqual([body(3), 'Libro segundo', body(4), 'Parte tercera', body(5)]);
    // a line that is not a heading in the automatic sense can be made one; an invalid line number is ignored
    const forced = convert(lines('Prólogo', 'Texto del prólogo.', 'Capítulo I', body(1)), { headings: [1, 99, 0, 2.5] });
    expect(forced.headings).toEqual([{ line: 1, text: 'Prólogo' }]);
    expect(forced.documents).toHaveLength(1);
    expect(forced.documents[0].sections[0].title).toBe('Prólogo');
    expect(paragraphsOf(forced.documents[0])).toEqual(['Texto del prólogo.', 'Capítulo I', body(1)]);
  });

  it('chapters: none makes one document; the text before the first heading is front matter', () => {
    expect(convert(BOOK, { chapters: 'none' }).documents).toHaveLength(1);
    const front = convert(lines('Dedicatoria breve.', '', 'Capítulo I', body(1), 'Capítulo II', body(2)), { work: undefined });
    expect(front.documents.map((d) => d.title)).toEqual(['Libro de prueba — Front matter', 'Libro de prueba — Capítulo I', 'Libro de prueba — Capítulo II']);
  });
});

describe('the quality report travels with the documents', () => {
  const MOJIBAKE = lines('Capítulo I', 'El niÃ±o llegÃ³ y dijo â€” hola.', 'Y la maÃ±ana siguiente fue frÃ­a.');

  it('every document carries the report; a clean text carries a clean one', () => {
    const r = convert(lines('Capítulo I', 'Una frase limpia.', 'Capítulo II', 'Otra frase limpia.'));
    expect(r.documents.every((d) => d.quality && d.quality.verdict === 'clean' && d.quality.checkedWith === 'quality@1')).toBe(true);
    expect(r.quality.verdict).toBe('clean');
    expect(r.notes.join(' ')).not.toMatch(/Source check/);
  });

  it('a damaged source is said plainly in the notes and the preview; a personal copy still imports, a library document is refused', async () => {
    const r = convert(MOJIBAKE);
    expect(r.quality.verdict).toBe('damaged');
    expect(r.notes.join(' ')).toMatch(/The source looks damaged: mojibake \(serious\)\. You can still import it as your own copy, but look at the flagged places first\./);

    const batch = validateBatch(r.documents, { registry });
    expect(batch.ok).toBe(true); // a warning: the learner decides
    const w = batch.documents[0].issues.find((i) => i.code === 'source-damaged')!;
    expect(w).toMatchObject({ severity: 'warning', path: 'quality' });
    expect(w.message).toMatch(/found damaged by the quality check \(mojibake\)/);

    const store = createMemoryStore();
    const preview = await previewDocuments(store, registry, r.documents);
    expect(preview[0].issues.some((i) => i.code === 'source-damaged' && i.severity === 'warning')).toBe(true);
    const report = await importDocuments(store, registry, r.documents, { clock });
    expect(report.ok).toBe(true);
    const text = (await store.texts.all())[0];
    expect(text.personalCopy).toBe(true);
    expect(text.quality?.verdict).toBe('damaged');

    // destined for the built library: refused
    const forLibrary = validateBatch(r.documents, { registry, destination: 'library' });
    expect(forLibrary.ok).toBe(false);
    expect(forLibrary.documents[0].issues.find((i) => i.code === 'source-damaged')).toMatchObject({ severity: 'error' });
  });

  it('a malformed quality block is refused; a clean or usable one never blocks', () => {
    const [doc] = convert(lines('Capítulo I', 'Una frase.')).documents;
    expect(validateBatch([{ ...doc, quality: { verdict: 'great' } } as unknown as CorpusDocument], { registry }).ok).toBe(false);
    for (const verdict of ['clean', 'usable'] as const) {
      expect(validateBatch([{ ...doc, quality: { checkedWith: 'quality@1', flags: [], verdict } }], { registry, destination: 'library' }).ok).toBe(true);
    }
  });
});

describe('Thai plain text behaves as before', () => {
  it('headings, front matter, trimming and exactness are unchanged (the Thai tests of plaintext.test.ts stay as they are)', () => {
    const r = plainTextToDocuments(lines('คำนำ', 'บทที่ ๑', 'ฉันไปโรงเรียน', 'บทที่ ๒', 'แมวนั่งบนเสื่อ'), { lang: 'th', title: 'T' });
    expect(r.documents.map((d) => d.work)).toEqual([undefined, undefined, undefined]);
    expect(r.documents.map((d) => d.sections[0].title)).toEqual([undefined, 'บทที่ ๑', 'บทที่ ๒']);
    expect(r.notes.join(' ')).toMatch(/2 chapters found by headings like "บทที่ ๑"/);
    // Western headings are not looked for in Thai text
    expect(plainTextToDocuments(lines('Capítulo I', 'ฉันไปโรงเรียน'), { lang: 'th', title: 'T' }).headings).toEqual([]);
  });
});
