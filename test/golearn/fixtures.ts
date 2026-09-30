/** Fixture texts for GoLearn tests — built from explicit tokens (never split(' ')). */
import { buildFixtureText } from '../../src/core';
import type { AppStore, FixtureToken } from '../../src/core';

const t = (surface: string, lemma?: string, pos?: FixtureToken['pos'], gloss?: string, extra: Partial<FixtureToken> = {}): FixtureToken =>
  ({ surface, lemma, pos, gloss, ...extra });
const dot = (): FixtureToken => ({ surface: '.', isWord: false });

export const ES_STORY = 'text:es:story-01';
export const ES_JOHN = 'text:es:john-3';
export const ES_PREP = 'text:es:story-02';
export const ES_GEN = 'text:es:prep-generated';

/** Spanish story: repetitive, contains `creer` in two forms, a phrase "creo en _" and a pattern. */
export async function buildSpanish(store: AppStore) {
  await buildFixtureText(store, {
    lang: 'es', slug: 'story-01', kind: 'story', title: 'Historia 1', tags: ['mission'],
    sentences: [
      {
        tokens: [t('Yo', 'yo', 'PRON', 'I'), t('creo', 'creer', 'VERB', 'believe', { morph: { Person: '1', Number: 'Sing', Tense: 'Pres' } }), t('en', 'en', 'ADP', 'in'), t('Dios', 'Dios', 'PROPN', 'God'), dot()],
        english: 'I believe in God.',
        phrases: [{ pattern: ['creo', 'en', '_'], display: 'creo en …', tokenIndexes: [1, 2, 3] }],
        patterns: [{ key: 'present-tense', title: 'Present tense', tokenIndexes: [1] }],
      },
      {
        tokens: [t('El', 'el', 'DET', 'the'), t('corazón', 'corazón', 'NOUN', 'heart'), t('cree', 'creer', 'VERB', 'believe', { morph: { Person: '3', Number: 'Sing', Tense: 'Pres' } }), dot()],
        english: 'The heart believes.',
        patterns: [{ key: 'present-tense', title: 'Present tense', tokenIndexes: [2] }],
      },
      {
        tokens: [t('Yo', 'yo', 'PRON', 'I'), t('creo', 'creer', 'VERB', 'believe'), t('en', 'en', 'ADP', 'in'), t('Jesús', 'Jesús', 'PROPN', 'Jesus'), dot()],
        english: 'I believe in Jesus.',
        phrases: [{ pattern: ['creo', 'en', '_'], display: 'creo en …', tokenIndexes: [1, 2, 3] }],
      },
      {
        tokens: [t('Dios', 'Dios', 'PROPN', 'God'), t('perdona', 'perdonar', 'VERB', 'forgive'), t('el', 'el', 'DET', 'the'), t('pecado', 'pecado', 'NOUN', 'sin'), dot()],
        english: 'God forgives the sin.',
      },
    ],
  });
}

/** Scripture (John 3:16, sample): shares the lemma `creer` (as `cree`) and the forms `en`, `dios` with the story. */
export async function buildSpanishScripture(store: AppStore) {
  await buildFixtureText(store, {
    lang: 'es', slug: 'john-3', kind: 'scripture', title: 'Juan 3', version: 'fixture', scripture: { book: 'JHN', chapter: 3 },
    sentences: [
      {
        verseRefs: ['JHN.3.16'],
        tokens: [t('Todo', 'todo', 'PRON', 'all'), t('aquel', 'aquel', 'PRON', 'whoever'), t('que', 'que', 'SCONJ', 'that'), t('cree', 'creer', 'VERB', 'believe'), t('en', 'en', 'ADP', 'in'), t('él', 'él', 'PRON', 'him'), dot()],
        english: 'Whoever believes in him.',
        phrases: [{ pattern: ['cree', 'en', '_'], display: 'cree en …', tokenIndexes: [3, 4, 5] }],
      },
      {
        verseRefs: ['JHN.3.17'],
        tokens: [t('Dios', 'Dios', 'PROPN', 'God'), t('amó', 'amar', 'VERB', 'love'), t('al', 'al', 'ADP', 'to the'), t('mundo', 'mundo', 'NOUN', 'world'), dot()],
        english: 'God loved the world.',
      },
    ],
  });
}

/** A second story that contains words the scripture needs (amó / mundo), for preparatoryTexts. */
export async function buildSpanishPrep(store: AppStore, generated = false, slug = 'story-02') {
  await buildFixtureText(store, {
    lang: 'es', slug, kind: generated ? 'generated-prep' : 'story', title: generated ? 'Preparación' : 'Historia 2', generated, tags: generated ? ['prep:john-3'] : [],
    sentences: [
      { tokens: [t('Yo', 'yo', 'PRON', 'I'), t('amo', 'amar', 'VERB', 'love'), t('el', 'el', 'DET', 'the'), t('mundo', 'mundo', 'NOUN', 'world'), dot()], english: 'I love the world.' },
      { tokens: [t('Dios', 'Dios', 'PROPN', 'God'), t('ama', 'amar', 'VERB', 'love'), t('al', 'al', 'ADP', 'to the'), t('mundo', 'mundo', 'NOUN', 'world'), dot()], english: 'God loves the world.' },
    ],
  });
}

export const TH_STORY = 'text:th:story-01';
export const TH_BIBLE = 'text:th:john-3';

/** Thai: no whitespace anywhere — the tokens are explicit (as real ingestion would produce via Intl.Segmenter). */
export async function buildThai(store: AppStore) {
  await buildFixtureText(store, {
    lang: 'th', slug: 'story-01', kind: 'story', separator: '',
    sentences: [
      { tokens: [t('พระเจ้า', 'พระเจ้า', 'NOUN', 'God'), t('ทรง', 'ทรง', 'PART', 'royal marker'), t('รัก', 'รัก', 'VERB', 'love'), t('โลก', 'โลก', 'NOUN', 'world')], english: 'God loves the world.' },
      { tokens: [t('ฉัน', 'ฉัน', 'PRON', 'I'), t('รัก', 'รัก', 'VERB', 'love'), t('พระเจ้า', 'พระเจ้า', 'NOUN', 'God')], english: 'I love God.' },
    ],
  });
  await buildFixtureText(store, {
    lang: 'th', slug: 'john-3', kind: 'scripture', separator: '', scripture: { book: 'JHN', chapter: 3 },
    sentences: [
      { verseRefs: ['JHN.3.16'], tokens: [t('พระเจ้า', 'พระเจ้า', 'NOUN', 'God'), t('ทรง', 'ทรง', 'PART'), t('รัก', 'รัก', 'VERB', 'love'), t('โลก', 'โลก', 'NOUN', 'world')], english: 'God so loved the world.' },
    ],
  });
}

export const HI_STORY = 'text:hi:story-01';

/** Hindi (whitespace-delimited script, but tokens are still explicit; combining marks stay inside tokens). */
export async function buildHindi(store: AppStore) {
  await buildFixtureText(store, {
    lang: 'hi', slug: 'story-01', kind: 'story',
    sentences: [
      { tokens: [t('मैं', 'मैं', 'PRON', 'I'), t('परमेश्वर', 'परमेश्वर', 'NOUN', 'God'), t('पर', 'पर', 'ADP', 'on'), t('विश्वास', 'विश्वास', 'NOUN', 'faith'), t('करता', 'करना', 'VERB', 'do'), t('हूँ', 'होना', 'AUX', 'be'), dot()], english: 'I believe in God.' },
      { tokens: [t('परमेश्वर', 'परमेश्वर', 'NOUN', 'God'), t('प्रेम', 'प्रेम', 'NOUN', 'love'), t('है', 'होना', 'AUX', 'be'), dot()], english: 'God is love.' },
    ],
  });
}
