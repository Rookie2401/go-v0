/** Build Biblical Aramaic seed, passage resources, corpus, and exact-source verification from bundled snapshots. */
import fs from 'node:fs';
import path from 'node:path';

type Reading = {
  surface: string; lemma: string; lemmaId: string; morph: string; reference: string;
  gloss: string; glossStatus: 'external' | 'unavailable'; seg: string; sourceWordId: string;
};
type Verse = { ref: string; book: string; chapter: number; verse: number; words: Reading[]; text: string };
type LooseRecord = Record<string, any>;
const SOURCE = 'data/sources/aramaic/oshb-aramaic-snapshot.xml';
const LEXICON = 'data/sources/aramaic/strong-aramaic-entries.xml';
const LEXICAL_INDEX = 'data/sources/aramaic/lexical-index-aramaic-entries.xml';
// Plain Lexical Index definitions for bare Strong numbers whose Strong's entry has only a King James usage list (or nothing).
const DEFINITIONS = 'data/sources/aramaic/lexical-index-aramaic-definitions.xml';
const BOOK_NAMES: Record<string, string> = { Dan: 'Daniel', Ezra: 'Ezra', Jer: 'Jeremiah', Gen: 'Genesis' };
const BOOK_CODES: Record<string, string> = { Dan: 'DAN', Ezra: 'EZR', Jer: 'JER', Gen: 'GEN' };
const PREFIXES: Record<string, { lemma: string; gloss: string }> = {
  l: { lemma: 'לְ', gloss: 'to, for' }, b: { lemma: 'בְּ', gloss: 'in, with, by' },
};
const read = (file: string): string => fs.readFileSync(file, 'utf8');
const glossText = (s: string): string => s.replace(/\s+/g, ' ').trim();
const xmlText = (s: string): string => s.replace(/<[^>]*>/g, '').replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&apos;/g, "'");
const attrs = (s: string): Record<string, string> => Object.fromEntries([...s.matchAll(/([\w-]+)="([^"]*)"/g)].map(m => [m[1], m[2]]));
const tokenLetters = (s: string): number => (s.match(/[א-ת]/g) ?? []).length;
const canonicalRef = (osisId: string): string => {
  const [book, chapter, verse] = osisId.split('.');
  const code = BOOK_CODES[book];
  if (!code) throw new Error(`Unexpected OSIS book in snapshot: ${osisId}`);
  return `${code}.${chapter}.${verse}`;
};
function parseLexicon(xml: string): Map<string, { lemma: string; gloss: string; usageOnly: boolean }> {
  const result = new Map<string, { lemma: string; gloss: string; usageOnly: boolean }>();
  for (const match of xml.matchAll(/<entry id="H(\d+)">([\s\S]*?)<\/entry>/g)) {
    const body = match[2];
    const headword = body.match(/<w\b[^>]*>([\s\S]*?)<\/w>/);
    const meaning = body.match(/<meaning>([\s\S]*?)<\/meaning>/);
    const usage = body.match(/<usage>([\s\S]*?)<\/usage>/);
    result.set(match[1], { lemma: headword ? xmlText(headword[1]) : '', gloss: glossText(meaning ? xmlText(meaning[1]) : usage ? xmlText(usage[1]) : ''), usageOnly: !meaning });
  }
  return result;
}
function parseLexicalIndex(xml: string): Map<string, { lemma: string; gloss: string }> {
  const result = new Map<string, { lemma: string; gloss: string }>();
  for (const sourceEntry of xml.matchAll(/<sourceEntry\b([^>]*)>([\s\S]*?)<\/sourceEntry>/g)) {
    const wrapper = attrs(sourceEntry[1]);
    const body = sourceEntry[2];
    const headword = body.match(/<w\b[^>]*>([\s\S]*?)<\/w>/);
    const glosses = [...body.matchAll(/<def>([\s\S]*?)<\/def>/g)].map(match => xmlText(match[1])).filter(Boolean);
    const id = wrapper.sourceLemmaId;
    if (!wrapper.strong || !id || !headword) throw new Error(`Invalid selected LexicalIndex entry ${wrapper.lexicalIndexId}`);
    result.set(id, { lemma: xmlText(headword[1]), gloss: glossText(glosses.join('; ')) });
  }
  return result;
}
function qereReadingWords(body: string): Array<{ attrs: Record<string, string>; raw: string; offset: number }> {
  const words: Array<{ attrs: Record<string, string>; raw: string; offset: number }> = [];
  for (const match of body.matchAll(/<w\b([^>]*)>([\s\S]*?)<\/w>/g)) {
    const wordAttrs = attrs(match[1]);
    if (!wordAttrs.morph?.startsWith('A') || wordAttrs.type === 'x-ketiv') continue;
    const at = match.index ?? 0;
    const noteStart = body.lastIndexOf('<note', at);
    const noteEnd = body.lastIndexOf('</note>', at);
    if (noteStart > noteEnd) {
      const notePrefix = body.slice(noteStart, at);
      // A word inside an apparatus note is included only on the explicitly selected qere path.
      if (!/<rdg\b[^>]*type="x-qere"/.test(notePrefix)) continue;
    }
    words.push({ attrs: wordAttrs, raw: match[2], offset: at });
  }
  return words;
}
function buildVerses(sourceXml: string, lexical: Map<string, { lemma: string; gloss: string; usageOnly: boolean }>, lexicalIndex: Map<string, { lemma: string; gloss: string }>, definitions: Map<string, { lemma: string; gloss: string }>): Verse[] {
  const verses: Verse[] = [];
  const seenIds = new Set<string>();
  for (const match of sourceXml.matchAll(/<verse\s+osisID="([^"]+)"[^>]*>([\s\S]*?)<\/verse>/g)) {
    const osisId = match[1];
    const [book, chapter, verseNumber] = osisId.split('.');
    const selected = qereReadingWords(match[2]);
    if (!selected.length) continue;
    const words: Reading[] = selected.map(({ attrs: wordAttrs, raw }) => {
      const lemmaId = wordAttrs.lemma;
      const finalId = lemmaId.split('/').at(-1) ?? lemmaId;
      const strongEntry = /^\d+$/.test(finalId) ? lexical.get(finalId) : undefined;
      // A Strong's entry with only a usage list (or no text) takes the Lexical Index's plain definition; its headword stays Strong's.
      const definition = strongEntry && (strongEntry.usageOnly || !strongEntry.gloss) ? definitions.get(finalId) : undefined;
      const sourceLexeme = lexicalIndex.get(finalId) ?? (strongEntry ? { lemma: strongEntry.lemma || definition?.lemma || '', gloss: definition?.gloss || strongEntry.gloss } : undefined);
      const prefix = PREFIXES[finalId];
      const sourceWordId = wordAttrs.id;
      if (!sourceWordId || seenIds.has(sourceWordId)) throw new Error(`Missing or duplicate OSHB word ID: ${sourceWordId}`);
      seenIds.add(sourceWordId);
      return {
        surface: xmlText(raw).replaceAll('/', ''),
        lemma: sourceLexeme?.lemma || prefix?.lemma || '', lemmaId, morph: wordAttrs.morph,
        reference: `${book} ${chapter}:${verseNumber}${book === 'Dan' && chapter === '2' && verseNumber === '4' ? 'b' : ''}`,
        gloss: sourceLexeme?.gloss || prefix?.gloss || '',
        glossStatus: sourceLexeme?.gloss || prefix?.gloss ? 'external' : 'unavailable',
        seg: xmlText(raw).split('/').map(tokenLetters).join('/'), sourceWordId,
      };
    });
    const text = words.map((word, index) => {
      if (index === 0) return word.surface;
      const start = selected[index - 1].offset;
      const end = selected[index].offset;
      const gap = match[2].slice(start, end);
      const marks = [...gap.matchAll(/<seg\s+type="x-(?:maqqef|paseq)">([^<]*)<\/seg>/g)].map(mark => xmlText(mark[1]));
      const hasMaqaf = /<seg\s+type="x-maqqef">/.test(gap);
      return `${marks.join('')}${hasMaqaf ? '' : ' '}${word.surface}`;
    }).join('');
    const tail = match[2].slice(selected.at(-1)!.offset);
    const trailingPunctuation = [...tail.matchAll(/<seg\s+type="x-paseq">([^<]*)<\/seg>/g)].map(mark => xmlText(mark[1])).join('');
    const textWithMarks = text + trailingPunctuation + (match[2].includes('type="x-sof-pasuq"') ? '׃' : '');
    verses.push({ ref: osisId, book, chapter: Number(chapter), verse: Number(verseNumber), words, text: textWithMarks });
  }
  return verses;
}
function documentFor(template: LooseRecord, verse: Verse, slug: string, index: number): LooseRecord {
  const name = BOOK_NAMES[verse.book];
  const doc = structuredClone(template) as LooseRecord;
  doc.id = slug;
  doc.title = `${name} ${verse.chapter}:${verse.verse}`;
  doc.source.id = `src:arc:${slug}`;
  doc.source.url = `https://github.com/openscriptures/morphhb/blob/master/wlc/${verse.book}.xml`;
  doc.source.provenance = `Selected A-coded words extracted from bundled OSHB wlc/${verse.book}.xml snapshot, preserving source order, qere path, word boundaries and verse marks. No independent scholarly proofreading.`;
  doc.scripture.book = BOOK_CODES[verse.book];
  doc.scripture.chapter = verse.chapter;
  doc.scripture.verification.against = `OSHB wlc/${verse.book}.xml (A-coded tokens; ketiv excluded, qere selected)`;
  doc.scripture.verification.url = `https://github.com/openscriptures/morphhb/blob/master/wlc/${verse.book}.xml`;
  doc.work.slug = slug;
  doc.work.chapter.index = index;
  doc.sections[0].paragraphs[0].sentences = [{ id: slug, text: verse.text, verseRefs: [canonicalRef(verse.ref)] }];
  return doc;
}
function main(): void {
  const lexical = parseLexicon(read(LEXICON));
  const lexicalIndex = parseLexicalIndex(read(LEXICAL_INDEX));
  const definitions = parseLexicalIndex(read(DEFINITIONS));
  const verses = buildVerses(read(SOURCE), lexical, lexicalIndex, definitions);
  const readings = verses.flatMap(verse => verse.words);
  const oldVerses = new Set(['Dan.2.4', 'Dan.2.20']);
  const template = JSON.parse(read('data/corpus/arc/daniel-2-20.json')) as LooseRecord;
  const outputs = new Map<string, string>();
  const docs: LooseRecord[] = [];
  for (const [index, verse] of verses.entries()) {
    const name = BOOK_NAMES[verse.book];
    const slug = verse.book === 'Dan' && verse.chapter === 2 && verse.verse === 4 ? 'daniel-2-4b' : `${name.toLowerCase()}-${verse.chapter}-${verse.verse}`;
    if (oldVerses.has(verse.ref)) continue;
    const doc = documentFor(template, verse, slug, index + 1);
    docs.push(doc);
    outputs.set(`data/corpus/arc/${slug}.json`, `${JSON.stringify(doc, null, 2)}\n`);
  }
  const sourceIds = new Set<string>();
  for (const row of readings) {
    if (sourceIds.has(row.sourceWordId)) throw new Error(`Duplicate reading source ID ${row.sourceWordId}`);
    sourceIds.add(row.sourceWordId);
    if (!row.morph.startsWith('A')) throw new Error(`Non-Aramaic morphology in seed: ${row.sourceWordId}`);
  }
  const unique = (values: string[]): string[] => [...new Set(values)];
  const lemmaChains = unique(readings.map(row => row.lemmaId));
  const morphologyCodes = unique(readings.map(row => row.morph));
  const referenceNames = unique(readings.map(row => row.reference));
  const segmentations = unique(readings.map(row => row.seg));
  const lemmaIndex = new Map(lemmaChains.map((value, index) => [value, index]));
  const morphIndex = new Map(morphologyCodes.map((value, index) => [value, index]));
  const referenceIndex = new Map(referenceNames.map((value, index) => [value, index]));
  const segmentationIndex = new Map(segmentations.map((value, index) => [value, index]));
  const terminalLexicon = Object.fromEntries(unique(readings.map(row => row.lemmaId.split('/').at(-1) ?? row.lemmaId)).map(id => {
    const row = readings.find(candidate => (candidate.lemmaId.split('/').at(-1) ?? candidate.lemmaId) === id)!;
    return [id, [row.lemma, row.gloss, row.glossStatus]];
  }));
  const rowTuples = readings.map(row => [row.surface, lemmaIndex.get(row.lemmaId), morphIndex.get(row.morph), referenceIndex.get(row.reference), segmentationIndex.get(row.seg), row.sourceWordId]);
  const passageTuples = verses.map(verse => [verse.book, verse.chapter, verse.verse]);
  const seed = `/**\n * Generated from bundled OSHB WLC snapshots: A-coded words only; Daniel 2:4 uses the qere path.\n * WLC base text is public domain; OSHB annotations, Strong transcription and Lexical Index are CC BY 4.0.\n * Exact augmented Strong identifiers use their selected Lexical Index entries; no numeric-prefix fallback is used.\n * A Strong entry with only a King James usage list takes the Lexical Index's plain definition (lexical-index-aramaic-definitions.xml).\n * Prefix headwords/glosses use the stable OSHB linguistic prefix lookup; unlexicalized entries stay unavailable.\n * See docs/aramaic/SOURCES.md.\n */\nexport interface AramaicReading {\n  surface: string; lemma: string; lemmaId: string; morph: string; reference: string;\n  gloss: string; glossStatus: 'external' | 'unavailable'; seg: string; sourceWordId: string;\n}\ntype ReadingTuple = readonly [surface: string, chain: number, morph: number, reference: number, segmentation: number, sourceWordId: string];\nconst LEXICAL_BY_TERMINAL_ID = ${JSON.stringify(terminalLexicon, null, 2)} as const;\nconst LEMMA_CHAINS: readonly string[] = ${JSON.stringify(lemmaChains)};\nconst MORPHOLOGIES: readonly string[] = ${JSON.stringify(morphologyCodes)};\nconst REFERENCES: readonly string[] = ${JSON.stringify(referenceNames)};\nconst SEGMENTATIONS: readonly string[] = ${JSON.stringify(segmentations)};\nconst ROWS: readonly ReadingTuple[] = [\n${rowTuples.map(tuple => `  ${JSON.stringify(tuple)},`).join('\n')}\n];\nexport const ARAMAIC_SEED: readonly AramaicReading[] = ROWS.map(([surface, chainIndex, morphIndex, referenceIndex, segmentationIndex, sourceWordId]) => {\n  const lemmaId = LEMMA_CHAINS[chainIndex];\n  const terminalId = lemmaId.split('/').at(-1) ?? lemmaId;\n  const [lemma, gloss, glossStatus] = LEXICAL_BY_TERMINAL_ID[terminalId] ?? ['', '', 'unavailable'];\n  return { surface, lemma, lemmaId, morph: MORPHOLOGIES[morphIndex], reference: REFERENCES[referenceIndex], gloss, glossStatus, seg: SEGMENTATIONS[segmentationIndex], sourceWordId };\n});\n`;
  const typedSeed = seed.replace('const LEXICAL_BY_TERMINAL_ID =', "const LEXICAL_BY_TERMINAL_ID: Readonly<Record<string, readonly [string, string, 'external' | 'unavailable']>> =");
  outputs.set('src/adapters/aramaic/seed.ts', typedSeed);
  const sourceBookMeta: Record<string, { code: string; title: string; slug: string }> = {
    Dan: { code: 'DAN', title: 'Daniel', slug: 'daniel' }, Ezra: { code: 'EZR', title: 'Ezra', slug: 'ezra' },
    Jer: { code: 'JER', title: 'Jeremiah', slug: 'jeremiah' }, Gen: { code: 'GEN', title: 'Genesis', slug: 'genesis' },
  };
  const resourceRows = passageTuples.map(([book, chapter, verse]) => [book, chapter, verse]);
  const resourceModule = `/** Generated compact source-backed verse inventory; it is not a designed course sequence. */\nexport type AramaicPassageResource = { slug: string; title: string; reference: string };\ntype PassageTuple = readonly [book: 'Dan' | 'Ezra' | 'Jer' | 'Gen', chapter: number, verse: number];\nconst BOOKS = ${JSON.stringify(sourceBookMeta, null, 2)} as const;\nconst ROWS: readonly PassageTuple[] = [\n${resourceRows.map(tuple => `  ${JSON.stringify(tuple)},`).join('\n')}\n];\nexport const ARAMAIC_PASSAGES: readonly AramaicPassageResource[] = ROWS.map(([sourceBook, chapter, verse]) => {\n  const book = BOOKS[sourceBook];\n  const suffix = sourceBook === 'Dan' && chapter === 2 && verse === 4 ? 'b' : '';\n  return { slug: \`${'${book.slug}'}-\${chapter}-\${verse}\${suffix}\`, title: \`${'${book.title}'} \${chapter}:\${verse}\${suffix}\`, reference: \`${'${book.code}'} .\${chapter}.\${verse}\`.replace(' .', '.') };\n});\n`;
  outputs.set('src/adapters/aramaic/resources.ts', resourceModule);
  const verifiedVerses: Record<string, { text: string; scope: string }> = {};
  for (const verse of verses) verifiedVerses[canonicalRef(verse.ref)] = { text: verse.text, scope: verse.ref === 'Dan.2.4' ? 'Aramaic 2:4b only' : 'complete A-coded Aramaic verse' };
  outputs.set('data/verified/arc.scripture.json', `${JSON.stringify({
    by: 'Codex OSHB source-extraction comparison', checkedAt: '2026-11-05', source: SOURCE,
    note: 'Requested A-coded Biblical Aramaic corpus. Daniel 2:4 is qere-only 2:4b. Source agreement is not a scholarly accuracy assessment.',
    translations: [{ lang: 'arc', translationId: 'arcWLC', edition: 'OSHB WLC, qere reading path', checkedAt: '2026-11-05', verses: verifiedVerses, mismatches: [] }],
  }, null, 2)}\n`);
  const check = process.argv.includes('--check');
  const mismatches: string[] = [];
  for (const [file, content] of outputs) {
    if (check) {
      if (!fs.existsSync(file) || read(file) !== content) mismatches.push(file);
    } else {
      fs.mkdirSync(path.dirname(file), { recursive: true });
      fs.writeFileSync(file, content);
    }
  }
  const unavailable = new Map<string, number>();
  for (const row of readings) if (row.glossStatus === 'unavailable') unavailable.set(row.lemmaId, (unavailable.get(row.lemmaId) ?? 0) + 1);
  const report = {
    verses: verses.length, words: readings.length, sourceWordIds: sourceIds.size,
    sourceLemmaIds: new Set(readings.map(row => row.lemmaId)).size,
    strongEntries: lexical.size, lexicalIndexEntries: lexicalIndex.size, lexicalIndexDefinitions: definitions.size,
    glossesFromDefinitions: new Set(readings.filter(row => { const id = row.lemmaId.split('/').at(-1) ?? ''; const e = lexical.get(id); return !!e && (e.usageOnly || !e.gloss) && definitions.has(id); }).map(row => row.lemmaId.split('/').at(-1))).size,
    glossAvailable: readings.length - readings.filter(row => row.glossStatus === 'unavailable').length,
    glossUnavailable: readings.filter(row => row.glossStatus === 'unavailable').length,
    unavailableByLemmaId: Object.fromEntries([...unavailable].sort(([a], [b]) => a.localeCompare(b))),
    addedDocuments: docs.length, checkMismatches: mismatches,
  };
  process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);
  if (mismatches.length) process.exitCode = 1;
}
main();
