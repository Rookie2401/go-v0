// @vitest-environment node
/**
 * The language resolver (packages/golearn-extension/src/language/resolve.ts): every rung of the ladder, the ambiguity
 * rule ("die" alone is never German), Honduras as an es variety, and the promise that nothing is guessed from one word.
 */
import { describe, expect, it } from 'vitest';
import { nbAdapter } from '../../src/adapters/nb';
import { nnAdapter } from '../../src/adapters/nn';
import { sqAdapter } from '../../src/adapters/sq';
import {
  BOOK_MIN_CONFIDENCE, DEFAULT_COMPATIBLE_SHARE, DOCUMENT_MIN_CONFIDENCE, MIN_TOKENS, NORWEGIAN_UNSPECIFIED_CONFIDENCE, PACK_VARIETIES, TEAM_DEFAULT_CONFIDENCE, isUnspecifiedNorwegian,
  createLanguageResolver, mapLanguageTag, resolveLanguage,
} from '../../packages/golearn-extension/src/language/resolve';
import type { LanguageEvidence } from '../../packages/golearn-extension/src/language/resolve';
import { PACKS } from '../../packages/language-packs/src';
import { clearAnalysers } from '../../packages/golearn-extension/src/parser';
import { registerAllAnalysers } from '../support/analysers';

registerAllAnalysers(); // the parser carries Albanian; the other analysers are chunks the content script loads on demand

const ALL = ['sq', 'es', 'de', 'hi', 'th'];
const ev = (e: Partial<LanguageEvidence>): LanguageEvidence => ({ installed: ALL, ...e });
const doc = (languageId: string, source: 'html-lang' | 'meta' | 'og-locale' | 'element-lang' | 'url' = 'html-lang', confidence = 0.8) => ({ languageId, source, confidence });
const withNorwegian = createLanguageResolver({ adapters: { nb: nbAdapter, nn: nnAdapter } });

describe('rung 1: the learner’s override wins over everything', () => {
  it('Thai chosen on a German page with a Spanish book and a German sample: Thai, confidence 1', () => {
    const r = resolveLanguage(ev({ override: 'th', bookLanguage: { languageId: 'es', source: 'opf', confidence: 0.99 }, documentLanguage: doc('de'), sample: 'Ich lese das Buch.', teamDefault: 'sq' }));
    expect(r).toMatchObject({ languageId: 'th', confidence: 1, basis: 'override' });
    expect(r.reasons.join(' ')).toMatch(/the learner chose "th" is th/);
  });

  it('an override may carry a variety: es-HN is Spanish, variety es-HN', () => {
    expect(resolveLanguage(ev({ override: 'es-HN' }))).toMatchObject({ languageId: 'es', varietyId: 'es-HN', basis: 'override', confidence: 1 });
  });

  it('an override naming a language whose pack is NOT installed is undetermined, with the reason, and the ladder does not go on', () => {
    const r = resolveLanguage({ override: 'th', installed: ['es'], documentLanguage: doc('es'), teamDefault: 'es' });
    expect(r).toMatchObject({ basis: 'undetermined', confidence: 0 });
    expect(r.languageId).toBeUndefined();
    expect(r.reasons.join(' ')).toMatch(/th pack is not installed/);
  });

  it('an override that names no pack at all (en) is undetermined too: the learner’s word is not second-guessed', () => {
    const r = resolveLanguage(ev({ override: 'en', documentLanguage: doc('de') }));
    expect(r).toMatchObject({ basis: 'undetermined' });
    expect(r.reasons.join(' ')).toMatch(/no language pack covers "en"/);
  });
});

describe('rung 2: reliable book metadata (confidence at least 0.8)', () => {
  it('an OPF language at 0.9 decides, and beats the page', () => {
    const r = resolveLanguage(ev({ bookLanguage: { languageId: 'de', source: 'opf dc:language', confidence: 0.9 }, documentLanguage: doc('es', 'element-lang', 0.9) }));
    expect(r).toMatchObject({ languageId: 'de', basis: 'book-metadata', confidence: 0.9 });
  });

  it('exactly at the threshold it decides; just below it does not, and says why', () => {
    expect(BOOK_MIN_CONFIDENCE).toBe(0.8);
    expect(resolveLanguage(ev({ bookLanguage: { languageId: 'sq', source: 'opf', confidence: 0.8 } }))).toMatchObject({ languageId: 'sq', basis: 'book-metadata' });
    const weak = resolveLanguage(ev({ bookLanguage: { languageId: 'sq', source: 'opf', confidence: 0.79 }, documentLanguage: doc('es') }));
    expect(weak).toMatchObject({ languageId: 'es', basis: 'document-metadata' });
    expect(weak.reasons.join(' ')).toMatch(/book declares "sq" \(opf\) with confidence 0.79, below the 0.8 needed/);
  });

  it('a book in a language with no pack (English) never ends in the team default: undetermined, with the reason', () => {
    const r = resolveLanguage(ev({ bookLanguage: { languageId: 'en', source: 'opf', confidence: 0.95 }, teamDefault: 'es' }));
    expect(r).toMatchObject({ basis: 'undetermined', confidence: 0 });
    expect(r.reasons.join(' ')).toMatch(/no language pack covers "en"/);
    expect(r.reasons.join(' ')).toMatch(/team default is not used against a declared language/);
  });

  it('a book in a pack language that is not installed ends the ladder: nothing is read with another language’s word list', () => {
    const r = resolveLanguage({ bookLanguage: { languageId: 'th', source: 'opf', confidence: 0.95 }, installed: ['es'], teamDefault: 'es', documentLanguage: doc('es') });
    expect(r).toMatchObject({ basis: 'undetermined', confidence: 0 });
    expect(r.reasons.join(' ')).toMatch(/th pack is not installed/);
  });
});

describe('rung 3: reliable document metadata', () => {
  it.each([
    ['element-lang', 0.9, 'de', 'de'], ['html-lang', 0.8, 'sq', 'sq'], ['meta', 0.6, 'th', 'th'],
  ] as const)('%s at %s decides (%s)', (source, confidence, languageId, expected) => {
    expect(resolveLanguage(ev({ documentLanguage: doc(languageId, source, confidence) }))).toMatchObject({ languageId: expected, basis: 'document-metadata', confidence });
  });

  it('a weaker declaration (og:locale 0.55) and a locale in the URL are mentioned and decide nothing', () => {
    expect(DOCUMENT_MIN_CONFIDENCE).toBe(0.6);
    const og = resolveLanguage(ev({ documentLanguage: doc('de', 'og-locale', 0.55), teamDefault: 'es' }));
    expect(og).toMatchObject({ languageId: 'es', basis: 'team-default' });
    expect(og.reasons.join(' ')).toMatch(/og-locale\) with confidence 0.55, below the 0.6 needed/);
    const url = resolveLanguage(ev({ documentLanguage: doc('de', 'url', 0.99), teamDefault: 'es' }));
    expect(url).toMatchObject({ languageId: 'es', basis: 'team-default' });
    expect(url.reasons.join(' ')).toMatch(/locale in the URL \("de"\) is a guess and decides nothing/);
  });

  it('a page in a language with no pack (English): detection may still recognise real text, but the team default never applies', () => {
    expect(resolveLanguage(ev({ documentLanguage: doc('en-US', 'html-lang'), sample: 'Los niños leen los libros.' }))).toMatchObject({ languageId: 'es', basis: 'detection' });
    const r = resolveLanguage(ev({ documentLanguage: doc('en-US', 'html-lang'), teamDefault: 'sq', sample: 'small' }));
    expect(r).toMatchObject({ basis: 'undetermined' });
    expect(r.reasons.join(' ')).toMatch(/not used against a declared language/);
  });

  it('a page in an installed-less pack language is undetermined, not the default', () => {
    const r = resolveLanguage({ documentLanguage: doc('hi'), installed: ['es', 'sq'], teamDefault: 'es' });
    expect(r).toMatchObject({ basis: 'undetermined' });
    expect(r.reasons.join(' ')).toMatch(/hi pack is not installed/);
  });

  it('the text itself can contradict the declaration: the declared language is kept but is less certain, and the reason says so', () => {
    const r = resolveLanguage(ev({ documentLanguage: doc('de', 'element-lang', 0.9), sample: 'Los niños leen los libros.' }));
    expect(r).toMatchObject({ languageId: 'de', basis: 'document-metadata', confidence: 0.55 });
    expect(r.reasons.join(' ')).toMatch(/text itself looks like es, not de/);
  });
});

describe('BCP-47 tags map to pack languages', () => {
  it.each([
    ['sq', 'sq'], ['sq-AL', 'sq'], ['als', 'sq'], ['aln', 'sq'], ['de', 'de'], ['de_CH', 'de'], ['es', 'es'], ['th-TH', 'th'], ['hi-IN', 'hi'], ['nb', 'nb'], ['nn-NO', 'nn'],
  ])('%s -> %s', (tag, languageId) => {
    expect(mapLanguageTag(tag)).toMatchObject({ kind: 'pack', languageId });
  });

  it('Honduras is an es variety: es-HN -> es with the variety hint es-HN (also from the team default)', () => {
    expect(mapLanguageTag('es-HN')).toMatchObject({ kind: 'pack', languageId: 'es', varietyId: 'es-HN' });
    expect(resolveLanguage(ev({ documentLanguage: doc('es-HN', 'element-lang', 0.9) }))).toMatchObject({ languageId: 'es', varietyId: 'es-HN', basis: 'document-metadata' });
    expect(resolveLanguage(ev({ teamDefault: 'es-HN' }))).toMatchObject({ languageId: 'es', varietyId: 'es-HN', basis: 'team-default' });
  });

  it('other Spanish: plain es has no variety; Spain is es-ES; Latin American regions are es-419 and the reason says the pack has no variety of its own', () => {
    expect(mapLanguageTag('es')).toEqual({ kind: 'pack', languageId: 'es', notes: [] });
    expect(mapLanguageTag('es-ES')).toMatchObject({ languageId: 'es', varietyId: 'es-ES' });
    expect(mapLanguageTag('es-419')).toMatchObject({ languageId: 'es', varietyId: 'es-419' });
    const mx = mapLanguageTag('es-MX');
    expect(mx).toMatchObject({ languageId: 'es', varietyId: 'es-419' });
    expect(mx.kind === 'pack' && mx.notes.join(' ')).toMatch(/MX is read as Latin American Spanish/);
  });

  it('German regions: de-AT and de-CH are varieties of the pack; a region the pack does not list gives none', () => {
    expect(mapLanguageTag('de-AT')).toMatchObject({ varietyId: 'de-AT' });
    expect(mapLanguageTag('de-CH')).toMatchObject({ varietyId: 'de-CH' });
    expect(mapLanguageTag('de-LU')).toEqual({ kind: 'pack', languageId: 'de', notes: [] });
  });

  it('the varieties the table names are the varieties the packs analyse (a related variety such as Gheg or Awadhi is never a hint)', () => {
    for (const [lang, varieties] of Object.entries(PACK_VARIETIES)) {
      expect([...varieties].sort(), lang).toEqual(PACKS[lang].varieties.filter((v) => v.analysed).map((v) => v.varietyId).sort());
    }
  });

  it('Norwegian "no" is undetermined between Bokmål and Nynorsk; nb and nn are themselves', () => {
    const no = mapLanguageTag('no');
    expect(no).toMatchObject({ kind: 'ambiguous' });
    expect(no.kind === 'ambiguous' && no.reason).toMatch(/Bokmål \(nb\) and Nynorsk \(nn\).*neither is assumed/);
    expect(mapLanguageTag('no-NO').kind).toBe('ambiguous');
    const r = resolveLanguage({ documentLanguage: doc('no', 'html-lang', 0.8), installed: ['nb', 'nn'] });
    expect(r).toMatchObject({ basis: 'undetermined' });
    expect(r.languageId).toBeUndefined();
    expect(r.reasons.join(' ')).toMatch(/Bokmål \(nb\) and Nynorsk \(nn\)/);
    expect(resolveLanguage({ documentLanguage: doc('nb', 'html-lang', 0.8), installed: ['nb', 'nn'] })).toMatchObject({ languageId: 'nb', basis: 'document-metadata' });
    expect(resolveLanguage({ documentLanguage: doc('nn', 'html-lang', 0.8), installed: ['nb', 'nn'] })).toMatchObject({ languageId: 'nn' });
  });

  it('a bare "no" is settled by the learner’s own installed pack only when exactly one Norwegian pack is installed, and then at a lowered confidence that says so', () => {
    expect(['no', 'no-NO', 'nor', 'NO_no'].map(isUnspecifiedNorwegian)).toEqual([true, true, true, true]);
    expect(['nb', 'nn', 'nb-NO', 'de', 'norsk'].map(isUnspecifiedNorwegian)).toEqual([false, false, false, false, false]);
    const onlyNb = resolveLanguage({ documentLanguage: doc('no', 'html-lang', 0.8), installed: ['nb', 'de'] });
    expect(onlyNb).toMatchObject({ languageId: 'nb', basis: 'document-metadata', confidence: NORWEGIAN_UNSPECIFIED_CONFIDENCE });
    expect(onlyNb.reasons.join(' ')).toMatch(/"no", which is Norwegian without a written standard; Bokmål \(nb\) is the only Norwegian pack installed, so the learner's own choice of pack decides it/);
    const onlyNn = resolveLanguage({ documentLanguage: doc('no-NO', 'html-lang', 0.9), installed: ['nn'] });
    expect(onlyNn).toMatchObject({ languageId: 'nn', basis: 'document-metadata', confidence: NORWEGIAN_UNSPECIFIED_CONFIDENCE });
    expect(resolveLanguage({ override: 'no', installed: ['nn'] })).toMatchObject({ languageId: 'nn', basis: 'override', confidence: NORWEGIAN_UNSPECIFIED_CONFIDENCE });
    expect(resolveLanguage({ bookLanguage: { languageId: 'no', source: 'opf', confidence: 0.95 }, installed: ['nb'] })).toMatchObject({ languageId: 'nb', basis: 'book-metadata' });
    // both installed, or neither: "no" decides nothing
    expect(resolveLanguage({ documentLanguage: doc('no', 'html-lang', 0.8), installed: ['nb', 'nn'] })).toMatchObject({ basis: 'undetermined' });
    const neither = resolveLanguage({ documentLanguage: doc('no', 'html-lang', 0.8), installed: ['de', 'sq'] });
    expect(neither.languageId).toBeUndefined();
    expect(neither.reasons.join(' ')).toMatch(/Bokmål \(nb\) and Nynorsk \(nn\)/);
  });

  it('a page declaring nb or nn resolves directly to that pack when it is installed, and is undetermined (not read with the other standard) when it is not', () => {
    expect(resolveLanguage({ documentLanguage: doc('nb', 'html-lang', 0.8), installed: ['nb'] })).toMatchObject({ languageId: 'nb', basis: 'document-metadata', confidence: 0.8 });
    expect(resolveLanguage({ documentLanguage: doc('nn-NO', 'html-lang', 0.8), installed: ['nn'] })).toMatchObject({ languageId: 'nn' });
    const wrongStandard = resolveLanguage({ documentLanguage: doc('nn', 'html-lang', 0.8), installed: ['nb'], teamDefault: 'nb' });
    expect(wrongStandard).toMatchObject({ basis: 'undetermined' });
    expect(wrongStandard.reasons.join(' ')).toMatch(/names nn, but the nn pack is not installed/);
  });

  it('a Norwegian page that says only "no" is settled by an explicit enrolment in Bokmål, not guessed', () => {
    const r = resolveLanguage({ documentLanguage: doc('no', 'html-lang', 0.8), installed: ['nb', 'nn'], teamDefault: 'nb' });
    expect(r).toMatchObject({ languageId: 'nb', basis: 'team-default', confidence: TEAM_DEFAULT_CONFIDENCE });
  });

  it('a tag that names something near a pack language but not it decides nothing: Swiss German, Marathi, Hindi in Latin script', () => {
    for (const tag of ['gsw', 'mr', 'ne', 'ca', 'hi-Latn', 'th-Latn', 'bar']) expect(mapLanguageTag(tag).kind, tag).toBe('ambiguous');
    const r = resolveLanguage(ev({ documentLanguage: doc('hi-Latn', 'html-lang', 0.8), teamDefault: 'hi' }));
    expect(r).toMatchObject({ languageId: 'hi', basis: 'team-default' });
    expect(r.reasons.join(' ')).toMatch(/hi-Latn.*written in LATN script; the hi pack analyses the DEVA script only/);
  });

  it('rubbish and languages with no pack: no-pack, never a crash', () => {
    for (const tag of ['', '  ', 'xx-', '123', 'x', 'english', 'fr', 'ja-JP', 'en']) expect(['no-pack']).toContain(mapLanguageTag(tag).kind);
  });
});

describe('rung 4: detection from the sample (script, then the installed packs’ word lists)', () => {
  it('Latin script, German: "Ich lese das Buch." is de, by detection', () => {
    const r = resolveLanguage(ev({ sample: 'Ich lese das Buch.' }));
    expect(r).toMatchObject({ languageId: 'de', basis: 'detection' });
    expect(r.confidence).toBeGreaterThanOrEqual(0.6);
    expect(r.confidence).toBeLessThanOrEqual(0.85);
    expect(r.reasons.join(' ')).toMatch(/the de word list recognises 4 of 4 words/);
  });

  it('Spanish, Albanian and a longer German sentence are told apart', () => {
    expect(resolveLanguage(ev({ sample: 'Los niños leen los libros.' }))).toMatchObject({ languageId: 'es', basis: 'detection' });
    expect(resolveLanguage(ev({ sample: 'Unë e lexoj librin dhe ai i shkruan një letër.' }))).toMatchObject({ languageId: 'sq', basis: 'detection' });
    expect(resolveLanguage(ev({ sample: 'Wir gehen heute in die Stadt und kaufen Brot.' }))).toMatchObject({ languageId: 'de', basis: 'detection' });
  });

  it('Thai script is Thai (3 or more words), and no other pack is needed to say so', () => {
    const r = resolveLanguage(ev({ sample: 'ฉันกินข้าวที่บ้านทุกวัน' }));
    expect(r).toMatchObject({ languageId: 'th', basis: 'detection', confidence: 0.9 });
    expect(r.reasons.join(' ')).toMatch(/Thai script/);
  });

  it('Devanagari is Hindi only when the Hindi word list recognises enough of it (Marathi and Nepali share the script)', () => {
    const hi = resolveLanguage(ev({ sample: 'मैं हर दिन किताब पढ़ता हूँ।' }));
    expect(hi).toMatchObject({ languageId: 'hi', basis: 'detection' });
    expect(hi.reasons.join(' ')).toMatch(/shared with Marathi, Nepali and Sanskrit/);
    // Marathi and Nepali: the script is Devanagari, most words are not in the Hindi list
    const mr = resolveLanguage(ev({ sample: 'मला पुस्तक आवडते आणि मी वाचतो' }));
    const ne = resolveLanguage(ev({ sample: 'नेपाली भाषा बोल्ने मानिसहरू धेरै छन्' }));
    expect(ne.languageId).toBeUndefined();
    expect(mr.languageId).toBeUndefined();
    expect(mr.basis).toBe('undetermined');
    expect(mr.reasons.join(' ')).toMatch(/Devanagari script, but the Hindi word list recognises only/);
  });

  it('a script whose pack is not installed is undetermined with the reason', () => {
    const r = resolveLanguage({ installed: ['es', 'de'], sample: 'ฉันกินข้าวที่บ้านทุกวัน' });
    expect(r).toMatchObject({ basis: 'undetermined' });
    expect(r.reasons.join(' ')).toMatch(/Thai script, but the Thai pack is not installed/);
  });

  it('installed limits the candidates: German text with German not installed is NOT called Spanish', () => {
    const r = resolveLanguage({ installed: ['es', 'sq'], sample: 'Ich lese das Buch.' });
    expect(r.languageId).toBeUndefined();
    expect(r.basis).toBe('undetermined');
    expect(r.reasons.join(' ')).toMatch(/no installed pack recognises enough of the sample \(es 1\/4, sq 0\/4\)/);
  });

  it('with a single Latin pack installed the same floor applies: English text is not Albanian just because one pack is installed', () => {
    const r = resolveLanguage({ installed: ['sq'], sample: 'The children read the books at school.' });
    expect(r.languageId).toBeUndefined();
    expect(r.basis).toBe('undetermined');
    expect(resolveLanguage({ installed: ['sq'], sample: 'Ana shkon në shkollë dhe ha çaj.' })).toMatchObject({ languageId: 'sq', basis: 'detection' });
  });

  it('English text is undetermined whatever is installed', () => {
    for (const sample of ['The children read the books at school.', 'We went to the market and bought some bread.', 'the man is in the house']) {
      expect(resolveLanguage(ev({ sample })).languageId, sample).toBeUndefined();
    }
  });

  it('a tie is undetermined, not a coin toss: "a e i o u" is as Albanian as it is Spanish', () => {
    const r = resolveLanguage(ev({ sample: 'a e i o u' }));
    expect(r.languageId).toBeUndefined();
    expect(r.reasons.join(' ')).toMatch(/too close to call/);
  });

  it('a thin lead is undetermined: the winner must lead by 25% of the words', () => {
    const r = resolveLanguage(ev({ sample: 'The die is cast and the man is here.' }));
    expect(r.languageId).toBeUndefined();
  });

  it('Norwegian: Bokmål and Nynorsk share most words, so only a clear lead decides', () => {
    expect(withNorwegian({ installed: ['nb', 'nn', 'de'], sample: 'Jeg leser boken i dag.' })).toMatchObject({ languageId: 'nb', basis: 'detection' });
    expect(withNorwegian({ installed: ['nb', 'nn', 'de'], sample: 'Han er ikkje heime no.' })).toMatchObject({ languageId: 'nn', basis: 'detection' });
    const close = withNorwegian({ installed: ['nb', 'nn'], sample: 'Eg les boka i dag.' });
    expect(close.languageId).toBeUndefined();
    expect(close.reasons.join(' ')).toMatch(/too close to call/);
  });

  it('the default resolver compares Norwegian too (the parser holds the nb and nn word lists), so German is found with a table that includes them', () => {
    const r = resolveLanguage({ installed: ['de', 'nb', 'nn'], sample: 'Ich lese das Buch.' });
    expect(r).toMatchObject({ languageId: 'de', basis: 'detection' });
    expect(r.reasons.join(' ')).toMatch(/\(de 4\/4, nb \d\/4, nn \d\/4\)/);
    expect(r.reasons.join(' ')).not.toMatch(/not compared/);
    expect(resolveLanguage({ installed: ['nb', 'nn', 'de'], sample: 'Jeg leser boken i dag.' })).toMatchObject({ languageId: 'nb', basis: 'detection' });
    expect(resolveLanguage({ installed: ['nb', 'nn', 'de'], sample: 'Han er ikkje heime no.' })).toMatchObject({ languageId: 'nn', basis: 'detection' });
  });

  it('where an analyser chunk has not been loaded, an installed nb/nn is named as not compared, and German is still found', () => {
    clearAnalysers(['sq', 'es', 'de', 'hi', 'th']);
    try {
      const r = resolveLanguage({ installed: ['de', 'nb', 'nn'], sample: 'Ich lese das Buch.' });
      expect(r).toMatchObject({ languageId: 'de', basis: 'detection' });
      expect(r.reasons.join(' ')).toMatch(/not compared: nb \(no word list available\), nn \(no word list available\)/);
    } finally { registerAllAnalysers(); }
  });
});

describe('the ambiguity rule: nothing is ever guessed from one word', () => {
  it('"die" alone with German and Norwegian installed is undetermined, with the reason (the default resolver and one handed the lists explicitly agree)', () => {
    expect(resolveLanguage({ installed: ['de', 'nb'], sample: 'die' })).toEqual(withNorwegian({ installed: ['de', 'nb'], sample: 'die' }));
    const r = resolveLanguage({ installed: ['de', 'nb'], sample: 'die' });
    expect(r).toMatchObject({ basis: 'undetermined', confidence: 0 });
    expect(r.languageId).toBeUndefined();
    expect(r.reasons.join(' ')).toMatch(/the sample has 1 word; fewer than 3 is never enough to detect a language/);
  });

  it('even a word only one pack knows is not enough: Haus, casa, shtëpi, ข้าว, किताब each alone are undetermined', () => {
    for (const sample of ['Haus', 'casa', 'shtëpi', 'ข้าว', 'किताब', 'Straße', 'niños']) {
      const r = resolveLanguage(ev({ sample }));
      expect(r.languageId, sample).toBeUndefined();
      expect(r.basis, sample).toBe('undetermined');
    }
  });

  it('two words are not enough either', () => {
    expect(MIN_TOKENS).toBe(3);
    for (const sample of ['Ich lese', 'los libros', 'ฉัน กิน', 'मैं पढ़ता']) expect(resolveLanguage(ev({ sample })).languageId, sample).toBeUndefined();
  });

  it('three words are enough when they are clear', () => {
    expect(resolveLanguage(ev({ sample: 'Ich lese Bücher' }))).toMatchObject({ languageId: 'de', basis: 'detection' });
    expect(resolveLanguage(ev({ sample: 'Ana shkon në shkollë' }))).toMatchObject({ languageId: 'sq', basis: 'detection' });
  });

  it('a one-word sample falls through to the team default, honestly labelled as a default', () => {
    const r = resolveLanguage(ev({ sample: 'die', teamDefault: 'de' }));
    expect(r).toMatchObject({ languageId: 'de', basis: 'team-default', confidence: TEAM_DEFAULT_CONFIDENCE });
    expect(r.reasons.join(' ')).toMatch(/fewer than 3 is never enough/);
    expect(r.reasons.join(' ')).toMatch(/a default, not evidence about this text/);
  });

  it('the reasons never repeat the sample', () => {
    const sample = 'Ich lese das Buch.';
    for (const r of [resolveLanguage(ev({ sample })), resolveLanguage({ installed: ['es'], sample }), resolveLanguage(ev({ sample: 'Haus' }))]) {
      expect(r.reasons.join(' ')).not.toContain('Ich lese');
      expect(r.reasons.join(' ')).not.toContain('Haus');
    }
  });
});

describe('rung 5: the team default', () => {
  it('is a default, not evidence: confidence 0.3, basis team-default, the reason says nothing else decided', () => {
    const r = resolveLanguage(ev({ teamDefault: 'sq' }));
    expect(r).toMatchObject({ languageId: 'sq', basis: 'team-default', confidence: 0.3 });
    expect(r.reasons.join(' ')).toMatch(/nothing else decided/);
  });

  it('a default whose pack is not installed is undetermined, not applied', () => {
    const r = resolveLanguage({ installed: ['sq'], teamDefault: 'de' });
    expect(r).toMatchObject({ basis: 'undetermined' });
    expect(r.reasons.join(' ')).toMatch(/its pack is not installed/);
  });

  it('no evidence at all is undetermined, with what was missing', () => {
    const r = resolveLanguage({ installed: ALL });
    expect(r).toMatchObject({ basis: 'undetermined', confidence: 0 });
    expect(r.reasons).toEqual(['no sample was given to detect a language from', 'there is no default language']);
  });

  it('an empty installed list resolves nothing: every language is "not installed"', () => {
    expect(resolveLanguage({ installed: [], documentLanguage: doc('de'), teamDefault: 'de' })).toMatchObject({ basis: 'undetermined' });
    expect(resolveLanguage({ installed: [], sample: 'Ich lese das Buch.', teamDefault: 'de' })).toMatchObject({ basis: 'undetermined' });
  });
});

describe('a mislabelled page and the learner’s chosen language (2026-10-09: an Albanian site declaring html lang="en")', () => {
  const ALBANIAN = 'Policia njoftoi se dy persona u arrestuan mbrëmë në Durrës pas një përplasjeje mes dy grupeve në lagjen e vjetër të qytetit.';
  const ENGLISH = 'In the beginning God created the heaven and the earth. And the earth was without form, and void.';
  const chosen = (lang: string, sample: string, declared = 'en-US') => resolveLanguage({ installed: [lang], documentLanguage: doc(declared, 'html-lang'), teamDefault: lang, sample });

  it(`with only the chosen language installed, real text in it on an "en" page is recognised by detection from the words around the selection`, () => {
    const r = chosen('sq', ALBANIAN);
    expect(r).toMatchObject({ languageId: 'sq', basis: 'detection' });
    expect(r.reasons.join(' ')).toMatch(/sq word list recognises/);
  });

  it(`a short passage below detection's floor but at least ${Math.round(DEFAULT_COMPATIBLE_SHARE * 100)}% recognised still uses the chosen language, as a default, and says the share`, () => {
    // a resolver handed a thinned Albanian word list (every third word unknown): about 55 % recognised, so detection's 60 % floor is not met but the default's 45 % is
    const thin = createLanguageResolver({ adapters: { sq: {
      ...sqAdapter,
      analyze: (toks) => { let n = 0; return sqAdapter.analyze(toks).map((a) => (a.token.isWord && n++ % 3 === 2 ? { ...a, candidates: [] } : a)); },
    } as typeof sqAdapter } });
    const r = thin({ installed: ['sq'], documentLanguage: doc('en-US', 'html-lang'), teamDefault: 'sq', sample: ALBANIAN });
    expect(r).toMatchObject({ languageId: 'sq', basis: 'team-default', confidence: TEAM_DEFAULT_CONFIDENCE });
    expect(r.reasons.join(' ')).toMatch(/declared language has no pack, but the sq word list recognises \d+ of \d+ words around the selection/);
  });

  it('English text on an English page is still never read as the chosen language (the certification finding stands), and the reason gives the share', () => {
    for (const lang of ['sq', 'es', 'de']) {
      const r = chosen(lang, ENGLISH);
      expect(r, lang).toMatchObject({ basis: 'undetermined' });
      expect(r.reasons.join(' ')).toMatch(/recognises only \d+ of \d+ words around the selection/);
      expect(r.reasons.join(' ')).toMatch(/not used against a declared language/);
    }
  });

  it('one clicked word alone cannot show compatibility: fewer than 3 words stays undetermined with the reason', () => {
    const r = chosen('sq', 'shtëpinë');
    expect(r).toMatchObject({ basis: 'undetermined' });
    expect(r.reasons.join(' ')).toMatch(/has 1 word; fewer than 3 cannot show that it is sq/);
  });

  it('the same rule serves every Latin-script pack: Spanish, German and Norwegian prose on an "en" page resolve to the chosen language', () => {
    expect(chosen('es', 'El gobierno anunció ayer nuevas medidas para reducir la inflación en los próximos meses.')).toMatchObject({ languageId: 'es' });
    expect(chosen('de', 'Der Bundestag hat am Donnerstag ein neues Gesetz zur Förderung erneuerbarer Energien verabschiedet.')).toMatchObject({ languageId: 'de' });
    expect(withNorwegian({ installed: ['nb'], documentLanguage: doc('en', 'html-lang'), teamDefault: 'nb', sample: 'Regjeringen la fredag fram et forslag om endringer i skatteloven for neste år.' })).toMatchObject({ languageId: 'nb' });
  });

  it('Hindi and Thai are decided by their script before the rule is needed, with the chosen pack installed', () => {
    expect(chosen('hi', 'क्षत्रिय ज्ञान की खोज में निकला। उसने कहा, मैं कल आऊँगा।')).toMatchObject({ languageId: 'hi', basis: 'detection' });
    expect(chosen('th', 'วันนี้อากาศดีมาก ฉันไปตลาดกับเพื่อน แล้วก็กลับบ้าน')).toMatchObject({ languageId: 'th', basis: 'detection' });
  });
});

describe('the ladder as a whole', () => {
  it('the order is override, book, document, detection, default', () => {
    const base = { bookLanguage: { languageId: 'sq', source: 'opf', confidence: 0.9 }, documentLanguage: doc('es'), sample: 'Wir gehen heute in die Stadt und kaufen Brot.', teamDefault: 'th' };
    expect(resolveLanguage(ev({ ...base, override: 'hi' })).basis).toBe('override');
    expect(resolveLanguage(ev(base)).basis).toBe('book-metadata');
    expect(resolveLanguage(ev({ ...base, bookLanguage: undefined })).basis).toBe('document-metadata');
    expect(resolveLanguage(ev({ ...base, bookLanguage: undefined, documentLanguage: undefined })).basis).toBe('detection');
    expect(resolveLanguage(ev({ ...base, bookLanguage: undefined, documentLanguage: undefined, sample: undefined })).basis).toBe('team-default');
  });

  it('is pure: the same evidence gives the same answer, and the evidence is not changed', () => {
    const e = ev({ sample: 'Los niños leen los libros.', documentLanguage: doc('en') });
    const before = JSON.stringify(e);
    expect(resolveLanguage(e)).toEqual(resolveLanguage(e));
    expect(JSON.stringify(e)).toBe(before);
  });

  it('is fast on a long sample (only the first 1200 characters and 150 words are read)', () => {
    const long = 'Ich lese das Buch. '.repeat(2000);
    const t = Date.now();
    expect(resolveLanguage(ev({ sample: long })).languageId).toBe('de');
    expect(Date.now() - t).toBeLessThan(1500);
  });
});
