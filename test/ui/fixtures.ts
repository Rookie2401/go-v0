/** Fixture texts for the UI tests (explicit tokens — never split(' ')). */
import { buildFixtureText } from '../../src/core';
import { makeEpub, xhtml } from '../ingest/zip';
import type { AppStore, Text } from '../../src/core';

export const STORY_ID = 'text:es:story-01';
export const JOHN_ID = 'text:es:john-3';

export async function seedStory(store: AppStore): Promise<Text> {
  return buildFixtureText(store, {
    lang: 'es', slug: 'story-01', title: 'Story 1', tags: ['mission', 'daily-life'],
    sentences: [
      {
        tokens: [
          { surface: 'Yo', lemma: 'yo', pos: 'PRON', gloss: 'I', morph: { Person: '1' } },
          { surface: 'creo', lemma: 'creer', pos: 'VERB', gloss: 'believe', morph: { Person: '1', Tense: 'Pres' } },
          { surface: 'en', lemma: 'en', pos: 'ADP', gloss: 'in' },
          { surface: 'Dios', lemma: 'Dios', pos: 'PROPN', gloss: 'God' },
          { surface: '.', isWord: false },
        ],
        english: 'I believe in God.',
        phrases: [{ pattern: ['creer', 'en', '_'], display: 'creer en …', tokenIndexes: [1, 2, 3] }],
        patterns: [{ key: 'present-1sg', title: 'Present tense', tokenIndexes: [1] }],
      },
      {
        tokens: [
          { surface: 'Dios', lemma: 'Dios', pos: 'PROPN', gloss: 'God' },
          { surface: 'me', lemma: 'yo', pos: 'PRON', gloss: 'me' },
          { surface: 'perdonó', lemma: 'perdonar', pos: 'VERB', gloss: 'forgave' },
          { surface: '.', isWord: false },
        ],
        english: 'God forgave me.',
      },
      {
        tokens: [
          { surface: 'Entendí', lemma: 'entender', pos: 'VERB', gloss: 'understood' },
          { surface: 'mi', lemma: 'mi', pos: 'DET', gloss: 'my' },
          { surface: 'pecado', lemma: 'pecado', pos: 'NOUN', gloss: 'sin' },
          { surface: '.', isWord: false },
        ],
        english: 'I understood my sin.',
      },
    ],
  });
}

export async function seedJohn(store: AppStore): Promise<Text> {
  return buildFixtureText(store, {
    lang: 'es', slug: 'john-3', title: 'Juan 3', kind: 'scripture', version: 'Reina-Valera 1909', scripture: { book: 'JHN', chapter: 3 },
    sentences: [
      {
        tokens: [
          { surface: 'Porque', lemma: 'porque', pos: 'SCONJ', gloss: 'because' },
          { surface: 'de', lemma: 'de', pos: 'ADP', gloss: 'of' },
          { surface: 'tal', lemma: 'tal', pos: 'DET', gloss: 'such' },
          { surface: 'manera', lemma: 'manera', pos: 'NOUN', gloss: 'way' },
          { surface: 'amó', lemma: 'amar', pos: 'VERB', gloss: 'loved' },
          { surface: 'Dios', lemma: 'Dios', pos: 'PROPN', gloss: 'God' },
          { surface: '.', isWord: false },
        ],
        verseRefs: ['JHN.3.16'], english: 'For God so loved the world.',
      },
      {
        tokens: [
          { surface: 'Que', lemma: 'que', pos: 'SCONJ', gloss: 'that' },
          { surface: 'ha', lemma: 'haber', pos: 'AUX', gloss: 'has' },
          { surface: 'dado', lemma: 'dar', pos: 'VERB', gloss: 'given' },
          { surface: '.', isWord: false },
        ],
        verseRefs: ['JHN.3.16'], english: 'That he gave his only begotten Son.',
      },
      {
        tokens: [
          { surface: 'Para', lemma: 'para', pos: 'ADP', gloss: 'for' },
          { surface: 'que', lemma: 'que', pos: 'SCONJ', gloss: 'that' },
          { surface: 'vivan', lemma: 'vivir', pos: 'VERB', gloss: 'live' },
          { surface: '.', isWord: false },
        ],
        verseRefs: ['JHN.3.17'], english: 'That the world might live.',
      },
    ],
  });
}

export async function seedThai(store: AppStore): Promise<Text> {
  return buildFixtureText(store, {
    lang: 'th', slug: 'th-1', title: 'เรื่องที่หนึ่ง',
    sentences: [{ tokens: [{ surface: 'พระเจ้า', lemma: 'พระเจ้า', gloss: 'God' }, { surface: 'ทรง', lemma: 'ทรง', gloss: 'royal verb marker' }, { surface: 'รัก', lemma: 'รัก', gloss: 'love' }, { surface: 'โลก', lemma: 'โลก', gloss: 'world' }] }],
  });
}

export async function seedHindi(store: AppStore): Promise<Text> {
  return buildFixtureText(store, {
    lang: 'hi', slug: 'hi-1', title: 'कहानी',
    sentences: [{ tokens: [{ surface: 'उसने', lemma: 'वह', gloss: 'he' }, { surface: 'विश्वास', lemma: 'विश्वास', gloss: 'faith' }, { surface: 'किया', lemma: 'करना', gloss: 'did' }, { surface: '।', isWord: false }] }],
  });
}

/**
 * One chapter of a ladder work, as the learner's own copy: a fixture Thai text with `workId`, `chapter` and `personalCopy`
 * (published, so the library and the ladder show it). `chapterIndex` is 1-based.
 */
export async function seedChapter(store: AppStore, workId: string, chapterIndex: number, opts: { title?: string; published?: boolean } = {}): Promise<Text> {
  const slug = `${workId.split(':').pop()}-ch${chapterIndex}`;
  const text = await buildFixtureText(store, {
    lang: 'th', slug, title: opts.title ?? `ตอนที่ ${chapterIndex}`, published: opts.published,
    sentences: [{ tokens: [{ surface: 'ฉัน', lemma: 'ฉัน', gloss: 'I' }, { surface: 'รัก', lemma: 'รัก', gloss: 'love' }, { surface: 'แม่', lemma: 'แม่', gloss: 'mother' }] }],
  });
  const next: Text = { ...text, workId, chapter: { index: chapterIndex, title: opts.title ?? `ตอนที่ ${chapterIndex}` }, personalCopy: true };
  await store.texts.put(next);
  return next;
}

/**
 * A tiny REAL EPUB (built with the importer's own test helper): one section per chapter, each a heading and its paragraphs.
 * `protectedBy` adds the file that marks a book as copy-protected (the reader refuses it).
 */
export function tinyEpub(chapters: Array<{ heading: string; paragraphs: string[] }>, opts: { title?: string; author?: string; protectedBy?: 'rights' | 'encryption' } = {}): Uint8Array {
  const esc = (t: string) => t.replace(/&/g, '&amp;').replace(/</g, '&lt;');
  return makeEpub({
    title: opts.title ?? 'Cuentos', author: opts.author ?? 'Ana Autora', language: 'es',
    pages: chapters.map((c, i) => ({ id: `c${i + 1}`, href: `c${i + 1}.xhtml`, html: xhtml(`<h1>${esc(c.heading)}</h1>${c.paragraphs.map((p) => `<p>${esc(p)}</p>`).join('')}`) })),
    ...(opts.protectedBy === 'rights' ? { extra: [{ name: 'META-INF/rights.xml', data: '<rights/>' }] } : {}),
    ...(opts.protectedBy === 'encryption'
      ? { extra: [{ name: 'META-INF/encryption.xml', data: '<encryption xmlns="urn:oasis:names:tc:opendocument:xmlns:container"><EncryptedData xmlns="http://www.w3.org/2001/04/xmlenc#"><CipherData><CipherReference URI="OEBPS/c1.xhtml"/></CipherData></EncryptedData></encryption>' }] }
      : {}),
  });
}
