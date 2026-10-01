import { describe, expect, it } from 'vitest';
import { findBoilerplate, inspectText, looksHardWrapped, type QualityReport } from '../../src/ingest';

const LINES = [
  'Esa mañana el niño salió de la casa y caminó por el camino que llevaba al río.',
  'Su madre le había dicho que no se detuviera, porque la lluvia podía llegar antes del mediodía.',
  'Cuando llegó al puente, vio a un hombre que pescaba con una caña muy larga.',
  '¿Qué buscas por aquí tan temprano?, le preguntó el hombre sin mirarlo.',
  'El niño respondió que llevaba una carta para su tía, que vivía al otro lado del valle.',
  'Entonces el hombre sonrió y le dijo que el puente estaba viejo, pero que todavía aguantaba.',
  'Cruzaron juntos, despacio, mientras el agua corría debajo de ellos con un ruido de piedras.',
  'Al otro lado había un árbol enorme, y bajo su sombra descansaban dos mulas cansadas.',
  'La tía los recibió con pan, queso y café, y quiso saber todo lo que había pasado en el pueblo.',
  'Después de comer, el niño entregó la carta y se quedó en silencio, mirando por la ventana.',
  'Afuera empezó a llover, tal como su madre había dicho, y nadie quiso salir hasta la noche.',
  'Esa noche, antes de dormir, el niño pensó que algún día contaría esta historia a sus hijos.',
];
const CLEAN = LINES.join('\n');
const NO_QUESTION = LINES.filter((l) => !l.includes('¿')).join('\n'); // no opening ¿ anywhere

const flag = (r: QualityReport, code: string) => r.flags.find((f) => f.code === code);
const codes = (r: QualityReport) => r.flags.map((f) => f.code);
const es = (text: string, sourceKind?: 'plain' | 'gutenberg' | 'wikisource' | 'epub' | 'ocr') => inspectText(text, { lang: 'es', sourceKind });

/** Wrap prose the way a text file made from a printed page is wrapped: 60 columns, blank line between paragraphs. */
const wrap = (paragraphs: string[], width = 60): string => paragraphs.map((p) => {
  const out: string[] = [];
  let line = '';
  for (const w of p.split(' ')) { if (line && `${line} ${w}`.length > width) { out.push(line); line = w; } else line = line ? `${line} ${w}` : w; }
  if (line) out.push(line);
  return out.join('\n');
}).join('\n\n');

describe('inspectText: a clean text is clean', () => {
  it('reports nothing and the verdict "clean"', () => {
    const r = es(CLEAN);
    expect(r).toEqual({ checkedWith: 'quality@1', flags: [], verdict: 'clean' });
  });

  it('never changes the text it inspects (it reports)', () => {
    const text = `${CLEAN}\nÃ¡\n�`;
    const before = text.slice();
    es(text);
    expect(text).toBe(before);
  });

  it('every flag has a code, a severity, a count and a short sample (at most 120 characters)', () => {
    const r = es(`${CLEAN}\n${'x'.repeat(300)}Ã¡ Ã± �\n12\n13`);
    expect(r.flags.length).toBeGreaterThan(2);
    for (const f of r.flags) {
      expect(['info', 'warning', 'serious']).toContain(f.severity);
      expect(f.count).toBeGreaterThan(0);
      expect(f.message.length).toBeGreaterThan(10);
      if (f.sample) expect(f.sample.length).toBeLessThanOrEqual(120);
    }
  });
});

describe('encoding', () => {
  it('mojibake: UTF-8 read as Latin-1 (one is a warning, two or more are serious and make the text damaged)', () => {
    const one = es(`${CLEAN}\nEl niÃ±o llegÃ³.`.replace('llegÃ³', 'llegó'));
    expect(flag(one, 'mojibake')).toMatchObject({ severity: 'warning', count: 1 });
    expect(one.verdict).toBe('usable');
    const many = es(`${CLEAN}\nEl niÃ±o llegÃ³ y dijo â€” hola.`);
    expect(flag(many, 'mojibake')).toMatchObject({ severity: 'serious', count: 3 });
    expect(many.verdict).toBe('damaged');
    expect(flag(many, 'mojibake')!.sample).toMatch(/Ã/);
    expect(codes(es('El niño llegó y dijo — hola. ¿Qué tal? «Sí», dijo.'))).not.toContain('mojibake');
  });

  it('replacement characters (U+FFFD): one is a warning, three are serious', () => {
    expect(flag(es(`${CLEAN}\nuna � suelta`), 'replacement-characters')).toMatchObject({ severity: 'warning', count: 1 });
    const bad = es(`${CLEAN}\na�b c�d e�f`);
    expect(flag(bad, 'replacement-characters')).toMatchObject({ severity: 'serious', count: 3 });
    expect(bad.verdict).toBe('damaged');
    expect(codes(es(CLEAN))).not.toContain('replacement-characters');
  });

  it('control characters (tab and line breaks are not control characters)', () => {
    expect(flag(es(`${CLEAN}\nuna\u0001cosa`), 'control-characters')).toMatchObject({ severity: 'warning', count: 1 });
    expect(flag(es(`${CLEAN}\n${'\u0002'.repeat(6)}`), 'control-characters')).toMatchObject({ severity: 'serious', count: 6 });
    expect(codes(es(`${CLEAN}\ncon\ttab y\r\nsalto`))).not.toContain('control-characters');
  });
});

describe('accents and OCR', () => {
  it('broken accents: a loose combining accent, ´ or ¨ before a vowel, n~ for ñ', () => {
    const r = es(`${CLEAN}\nEl nin~o dijo ´a y ¨u y ́e.`);
    expect(flag(r, 'broken-accents')).toMatchObject({ severity: 'warning' });
    expect(flag(r, 'broken-accents')!.count).toBeGreaterThanOrEqual(4);
    expect(flag(es(`${CLEAN}\n${'n~ '.repeat(10)}`), 'broken-accents')!.severity).toBe('serious');
  });

  it('a correctly decomposed accent (letter + combining accent) is not broken', () => {
    expect(codes(es(`${CLEAN}\nEl niño y la más alta.`))).not.toContain('broken-accents');
  });

  it('OCR confusions: rn for m, digits inside words, accents dropped in a text that otherwise has them', () => {
    const rn = es(`${CLEAN}\nrnuy bien, rnuy mal.\n${'muy '.repeat(12)}`);
    expect(flag(rn, 'ocr-confusions')!.count).toBeGreaterThanOrEqual(2);
    expect(flag(rn, 'ocr-confusions')!.sample).toMatch(/rnuy/);
    expect(flag(es(`${CLEAN}\nEl hombre tien0s un perro y la casa es gr1nde.`), 'ocr-confusions')!.count).toBe(2);
    const noTildes = es(`${CLEAN}\nTambien vino. Despues se fue. Ademas, aqui no hay nada.`.replace('Tambien', 'tambien'));
    expect(flag(noTildes, 'ocr-confusions')!.count).toBeGreaterThanOrEqual(3);
  });

  it('OCR confusions: clean negatives (accented forms, a word that only looks like a confusion, text without accents at all)', () => {
    expect(codes(es(`${CLEAN}\nTambién vino. Después se fue. Además, aquí no hay nada.`))).not.toContain('ocr-confusions');
    expect(codes(es(`${CLEAN}\nEl cuerno sonó. Su cuerno era grande. Tambien lo dijo, una vez.`))).not.toContain('ocr-confusions'); // rn is real here; one unaccented word is not a pattern
    const noAccentsAtAll = 'El nino salio de la casa y camino por el camino. Tambien vio el rio. Despues volvio, y ademas trajo pan para la madre del nino que aqui vive.'.repeat(3);
    expect(codes(es(noAccentsAtAll))).not.toContain('ocr-confusions'); // no accents anywhere: not "dropped tildes in a text that has them"
  });
});

describe('layout', () => {
  it('hard-wrapped lines: counted, and looksHardWrapped agrees', () => {
    const wrapped = wrap([LINES.slice(0, 3).join(' '), LINES.slice(3, 6).join(' '), LINES.slice(6, 9).join(' '), LINES.slice(9).join(' ')]);
    const r = es(wrapped);
    expect(flag(r, 'hard-wrapped-lines')!.count).toBeGreaterThan(10);
    expect(flag(r, 'hard-wrapped-lines')!.severity).toBe('warning');
    expect(looksHardWrapped(wrapped.split('\n'), 'es')).toBe(true);
    // negatives: one paragraph per line, with or without blank lines; short verse lines that start with capitals
    expect(codes(es(CLEAN))).not.toContain('hard-wrapped-lines');
    expect(looksHardWrapped(CLEAN.split('\n'), 'es')).toBe(false);
    const verse = ['Verde que te quiero verde', 'Verde viento, verdes ramas', 'El barco sobre la mar', 'Y el caballo en la montaña'];
    expect(looksHardWrapped([...verse, '', ...verse, '', ...verse, '', ...verse], 'es')).toBe(false);
    expect(looksHardWrapped(wrapped.split('\n'), 'th')).toBe(false); // never for Thai
  });

  it('hyphenated line breaks: a hyphen at the end of a line and a lowercase continuation', () => {
    const r = es(`${CLEAN}\nHabía una vez una pala-\nbra que nadie entendía, y un cami-\nno largo.`);
    expect(flag(r, 'hyphenated-line-breaks')).toMatchObject({ count: 2, severity: 'warning' });
    expect(flag(r, 'hyphenated-line-breaks')!.sample).toMatch(/pala-/);
    // negatives: a dash before a capital, a double hyphen, a hyphen in the middle of a line
    expect(codes(es(`${CLEAN}\nEl señor Pérez-\nGómez llegó -- tarde.\nEl físico-químico llegó.`))).not.toContain('hyphenated-line-breaks');
  });

  it('page numbers on their own lines (two or more)', () => {
    const r = es(`${LINES.slice(0, 3).join('\n')}\n12\n${LINES.slice(3, 6).join('\n')}\n- 13 -\n${LINES.slice(6, 9).join('\n')}\nPágina 14`);
    expect(flag(r, 'page-numbers')).toMatchObject({ count: 3, severity: 'warning' });
    expect(codes(es(`${CLEAN}\n1984\n${LINES[0]} 12`.replace(LINES[0], 'Un solo número aislado.')))).not.toContain('page-numbers'); // one lone number is not a pattern
    expect(codes(es(CLEAN))).not.toContain('page-numbers');
  });

  it('running heads: the same short line again and again between paragraphs', () => {
    const body = LINES.flatMap((l, i) => (i % 3 === 0 ? ['EL CAMINO DEL RÍO', l] : [l]));
    const many = [...body, ...LINES.map((l) => `${l} más`), ...LINES.map((l) => `${l} otra vez`)];
    const r = es(many.join('\n'));
    expect(flag(r, 'running-heads')!.count).toBe(4);
    expect(flag(r, 'running-heads')!.sample).toBe('EL CAMINO DEL RÍO');
    // with a page number in the head ("12 EL CAMINO") the digits do not hide the repetition
    expect(flag(es([...LINES, ...LINES.map((l) => `${l} más`), '12 EL CAMINO', LINES[1] + ' x', '14 EL CAMINO', LINES[2] + ' x', '16 EL CAMINO', LINES[4] + ' x'].join('\n')), 'running-heads')!.count).toBe(3);
    // negatives: repeated short lines that are sentences, and a repeat of only two
    const dialogue = [...LINES, ...LINES.map((l) => `${l} más`), '—Sí.', '—Sí.', '—Sí.', 'EL FIN', 'EL FIN'].join('\n');
    expect(codes(es(dialogue))).not.toContain('running-heads');
  });

  it('footnote markers inside prose', () => {
    expect(flag(es(`${CLEAN}\nEl hombre[1] dijo la verdad¹ y la nota(2) quedó.`), 'footnote-markers')).toMatchObject({ severity: 'info', count: 3 });
    expect(codes(es(`${CLEAN}\nEl hombre dijo [sic] algo (otra cosa) en 1999.`))).not.toContain('footnote-markers');
  });

  it('duplicated paragraphs (40 characters or more)', () => {
    const r = es(`${CLEAN}\n${LINES[2]}\n${LINES[3]}`);
    expect(flag(r, 'duplicated-paragraphs')).toMatchObject({ count: 2, severity: 'warning' });
    expect(codes(es(`${CLEAN}\nSí.\nSí.`))).not.toContain('duplicated-paragraphs'); // short lines repeat in dialogue
    expect(codes(es(CLEAN))).not.toContain('duplicated-paragraphs');
  });

  it('very long paragraphs (over 6,000 characters)', () => {
    const long = LINES.join(' ').repeat(8);
    expect(long.length).toBeGreaterThan(6000);
    expect(flag(es(`${CLEAN}\n${long}`), 'very-long-paragraphs')).toMatchObject({ count: 1 });
    expect(codes(es(CLEAN))).not.toContain('very-long-paragraphs');
  });

  it('no chapters found in a long text (and none flagged when there are headings or the text is short)', () => {
    const long = Array.from({ length: 300 }, (_, i) => `${LINES[i % LINES.length]} Número ${i}.`).join('\n');
    expect(flag(es(long), 'no-chapters-found')).toMatchObject({ severity: 'info', count: 1 });
    expect(codes(es(`Capítulo I\n${long}\nCapítulo II\nFin del libro.`))).not.toContain('no-chapters-found');
    expect(codes(es(CLEAN))).not.toContain('no-chapters-found');
  });
});

describe('boilerplate', () => {
  const GUTENBERG = [
    'The Project Gutenberg eBook of Un libro, by Alguien', '', 'Title: Un libro', 'Author: Alguien', '',
    '*** START OF THE PROJECT GUTENBERG EBOOK UN LIBRO ***', '', ...LINES, '', '*** END OF THE PROJECT GUTENBERG EBOOK UN LIBRO ***', '', 'Project Gutenberg licence text', 'more licence',
  ];

  it('Project Gutenberg header and footer, found by line', () => {
    const r = es(GUTENBERG.join('\n'));
    expect(flag(r, 'boilerplate')).toMatchObject({ severity: 'info', count: 2 });
    expect(flag(r, 'boilerplate')!.message).toMatch(/Project Gutenberg header/);
    const ranges = findBoilerplate(GUTENBERG);
    expect(ranges.map((x) => [x.label, x.startLine, x.endLine])).toEqual([['Project Gutenberg header', 0, 5], ['Project Gutenberg licence', GUTENBERG.length - 4, GUTENBERG.length - 1]]);
    // the body between the markers is not boilerplate
    expect(ranges.every((x) => x.endLine < 7 || x.startLine > 7 + LINES.length)).toBe(true);
  });

  it('"Produced by" credits and transcriber\'s notes (a paragraph each), notices, and copyright lines on a title page', () => {
    const lines = ['Produced by Voluntarios Anónimos', 'y el equipo de corrección', '', 'Nota del transcriptor: se respeta la ortografía original.', '', 'ISBN 978-84-376-0494-7', '© 2019 Alguien', '', ...LINES];
    const ranges = findBoilerplate(lines);
    expect(ranges.map((x) => [x.kind, x.label, x.startLine, x.endLine])).toEqual([
      ['boilerplate', 'production credit', 0, 1], ['boilerplate', 'transcriber\'s note', 3, 3], ['title-page-noise', 'copyright or title-page line', 5, 5], ['title-page-noise', 'copyright or title-page line', 6, 6],
    ]);
    const r = es(lines.join('\n'));
    expect(flag(r, 'boilerplate')!.count).toBe(2);
    expect(flag(r, 'title-page-noise')!.count).toBe(2);
  });

  it('a "Copyright" line in the middle of a long text is prose, not title-page noise; no boilerplate in a clean text', () => {
    const block = (tag: string) => LINES.map((l) => `${l} ${tag}`);
    const lines = [...Array.from({ length: 10 }, (_, k) => block(`a${k}`)).flat(), 'Copyright es una palabra inglesa.', ...Array.from({ length: 10 }, (_, k) => block(`b${k}`)).flat()];
    expect(findBoilerplate(lines)).toEqual([]);
    expect(findBoilerplate(LINES)).toEqual([]);
  });
});

describe('language and script', () => {
  const ENGLISH = 'The boy walked out of the house early in the morning and followed the road that led down to the river. His mother had told him not to stop, because the rain could come before noon, and he knew that she was right about the weather. When he reached the bridge he saw a man fishing with a very long rod.';

  it('a text of another language: only a small share of common words of the language (and says when it looks like English)', () => {
    const r = es(ENGLISH);
    expect(flag(r, 'language-mismatch')).toMatchObject({ severity: 'serious' });
    expect(flag(r, 'language-mismatch')!.message).toMatch(/looks like English/);
    expect(r.verdict).toBe('damaged');
    expect(codes(es(CLEAN))).not.toContain('language-mismatch');
    expect(codes(es('Hola. Gracias.'))).not.toContain('language-mismatch'); // too short to judge
  });

  it('the same check runs for German', () => {
    const de = 'Der Junge ging am Morgen aus dem Haus und folgte dem Weg, der zum Fluss führte. Seine Mutter hatte ihm gesagt, er solle nicht stehen bleiben, weil der Regen vor dem Mittag kommen könnte. Als er die Brücke erreichte, sah er einen Mann, der mit einer sehr langen Angel fischte und nicht auf ihn achtete.';
    expect(codes(inspectText(de, { lang: 'de' }))).not.toContain('language-mismatch');
    expect(codes(inspectText(CLEAN, { lang: 'de' }))).toContain('language-mismatch');
  });

  it('mixed scripts: letters of another script (and look-alike letters inside a word)', () => {
    const cyr = es(`${CLEAN}\n${'Привет мир, это текст. '.repeat(20)}`);
    expect(flag(cyr, 'mixed-scripts')).toMatchObject({ severity: 'serious' });
    const homoglyph = es(`${CLEAN}\nDioс es bueno.`); // the last letter of "Dioс" is Cyrillic
    expect(flag(homoglyph, 'mixed-scripts')).toMatchObject({ severity: 'warning', count: 1 });
    expect(codes(es(CLEAN))).not.toContain('mixed-scripts');
  });

  it('Thai text: the same checks run on its script (a Thai book may quote Latin)', () => {
    const thai = 'ฉันไปโรงเรียนทุกวัน\nแมวนั่งบนเสื่อ\nเขาเป็นครูที่ใจดี';
    expect(inspectText(thai, { lang: 'th' })).toMatchObject({ verdict: 'clean', flags: [] });
    expect(codes(inspectText(`${thai}\n${'This is English text only. '.repeat(10)}`, { lang: 'th' }))).toContain('mixed-scripts');
    expect(codes(inspectText(`${thai}\nฉันอ่าน email และ Facebook ทุกวัน`, { lang: 'th' }))).not.toContain('mixed-scripts');
  });
});

describe('punctuation and the verdict', () => {
  it('mangled punctuation: questions and exclamations without any ¿ ¡, quotation marks made of two apostrophes', () => {
    expect(flag(es(`${NO_QUESTION}\nQué es eso?\nNo sé!\nDónde estás?\nVen aquí!\nSí?`), 'mangled-punctuation')).toMatchObject({ severity: 'info' });
    expect(flag(es(`${CLEAN}\n''hola'' dijo, ''adiós'' dijo.`), 'mangled-punctuation')).toMatchObject({ count: 4 });
    expect(codes(es(CLEAN))).not.toContain('mangled-punctuation'); // the clean text has ¿ ... ?
    expect(codes(es(`${CLEAN}\n¿Qué es eso?\n¡No sé!\n¿Dónde estás?\n¡Ven aquí!\n¿Sí?`))).not.toContain('mangled-punctuation');
  });

  it('verdict: clean / usable (only info and warnings) / damaged (any serious flag)', () => {
    expect(es(CLEAN).verdict).toBe('clean');
    expect(es(`${CLEAN}\n12\n13`).verdict).toBe('usable');
    expect(es(`${CLEAN}\nÃ¡ Ã±`).verdict).toBe('damaged');
  });
});
