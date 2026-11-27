// @vitest-environment jsdom
/**
 * Arabic script is not Arabic because it is Arabic script. The script is shared by Persian, Urdu, Pashto, Kurdish, Uyghur and Sindhi. The
 * Arabic pack reads Arabic only, so a page is Arabic when it says so, when the learner chooses Arabic for it, or when its text shows it: no
 * letter of another Arabic-script alphabet (checked on the PRINTED text, before the analyser's key folds ک and ی), and the commonest Arabic
 * function words at a fifth of its words (packages/golearn-extension/src/language/{arabic,resolve}.ts, active/pageLanguages.ts).
 * The sentences are written for this test; Persian, Urdu and Pashto ones are only as long as the check needs.
 */
import { describe, expect, it } from 'vitest';
import { arAdapter } from '../../src/adapters/ar';
import { sqAdapter } from '../../src/adapters/sq';
import { arabicFunctionShare, arabicLanguageOf, arabicShare, notArabicScript } from '../../packages/golearn-extension/src/language/arabic';
import { createLanguageResolver, mapLanguageTag, PACK_VARIETIES } from '../../packages/golearn-extension/src/language/resolve';
import { LANGUAGE_SCRIPT, hasScript, planPage, wordInScript } from '../../packages/golearn-extension/src/active/pageLanguages';
import { PACKS } from '../../packages/language-packs/src';

const ARABIC = 'القاهرة هي عاصمة مصر وأكبر مدنها، وهي من المدن التي كان لها دور كبير في التاريخ. في هذه المدينة يعيش ملايين الناس، وبعد الظهر يذهب الزوار الذين يريدون أن يروا الأهرام إلى النيل، وهناك يجدون ما يبحثون عنه.';
const ARABIC_VOWELLED = 'كَتَبَ الْوَلَدُ الدَّرْسَ فِي الْبَيْتِ، ثُمَّ ذَهَبَ إِلَى الْمَدْرَسَةِ الَّتِي كَانَتْ بَعِيدَةً عَنِ الْمَنْزِلِ، وَهُنَاكَ قَرَأَ كِتَابًا جَدِيدًا.';
const PERSIAN = 'تهران پایتخت ایران است و بزرگ‌ترین شهر این کشور. در این شهر میلیون‌ها نفر زندگی می‌کنند و هر روز گردشگران زیادی به اینجا می‌آیند.';
// Persian written with letters Arabic also has (no پ چ ژ گ): only the missing Arabic function words can tell it is not Arabic
const PERSIAN_PLAIN = 'من در این شهر زندگی می کنم و علی هم اینجا کار می کند و هر روز به سر کار می رود.';
const URDU = 'لاہور پاکستان کا دوسرا بڑا شہر ہے۔ اس شہر میں لاکھوں لوگ رہتے ہیں اور ہر روز بہت سے سیاح یہاں آتے ہیں۔';
const PASHTO = 'کابل د افغانستان پلازمینه ده او په دې ښار کې ډېر خلک اوسېږي.';
const KURDISH = 'هەولێر پایتەختی هەرێمی کوردستانە و شارێکی گەورەیە.';

describe('letters that say an Arabic-script text is not Arabic', () => {
  it('finds nothing against Arabic prose, with its vowels or without them', () => {
    expect(notArabicScript(ARABIC)).toBeUndefined();
    expect(notArabicScript(ARABIC_VOWELLED)).toBeUndefined();
  });

  it.each([
    ['Persian', PERSIAN, /Persian/],
    ['Urdu', URDU, /Urdu/],
    ['Pashto', PASHTO, /Pashto|Persian/],
    ['Kurdish', KURDISH, /Kurdish|Persian/],
  ])('names %s from its own letters', (_name, text, language) => {
    const verdict = notArabicScript(text);
    expect(verdict?.language).toMatch(language);
    expect(verdict?.evidence).toMatch(/^the letters? /);
  });

  it('one Persian name in a long Arabic text does not decide; in a short one it does', () => {
    expect(notArabicScript(`${ARABIC} ${ARABIC} وقال الزائر إن مدينة گرگان جميلة.`)).toBeUndefined();
    expect(notArabicScript('گرگان')?.language).toMatch(/Persian/);
  });

  it('the folded key would hide the Persian letters: the check is on the printed text', () => {
    // ک and ی are Persian's kaf and yeh; the analyser's key folds them to Arabic ones, so a key of PERSIAN_PLAIN looks Arabic
    expect(notArabicScript(PERSIAN_PLAIN)).toBeUndefined();
    expect(arabicFunctionShare(PERSIAN_PLAIN).hits).toBeLessThan(3);
  });

  it('says nothing about text that is not Arabic script, and never says a text IS Arabic', () => {
    expect(notArabicScript('The quick brown fox.')).toBeUndefined();
    expect(arabicShare('مرحبا, world')).toBeCloseTo(5 / 10, 5);
  });
});

describe('the Arabic function words', () => {
  it('make a fifth of an Arabic text, with the vowels printed or not, and almost none of a Persian one', () => {
    for (const text of [ARABIC, ARABIC_VOWELLED]) {
      const s = arabicFunctionShare(text);
      expect(s.hits, text).toBeGreaterThanOrEqual(3);
      expect(s.share, text).toBeGreaterThanOrEqual(0.2);
    }
    expect(arabicFunctionShare(PERSIAN).hits).toBeLessThan(3);
    expect(arabicFunctionShare(URDU).hits).toBeLessThan(3);
  });
});

describe('the language tag table', () => {
  it('maps ar and its regional tags to the Arabic pack, and refuses another script', () => {
    expect(mapLanguageTag('ar')).toMatchObject({ kind: 'pack', languageId: 'ar' });
    expect(mapLanguageTag('ar-SA')).toMatchObject({ kind: 'pack', languageId: 'ar' });
    expect(mapLanguageTag('ar-EG')).toMatchObject({ kind: 'pack', languageId: 'ar' });
    expect(mapLanguageTag('ara')).toMatchObject({ kind: 'pack', languageId: 'ar' });
    expect(mapLanguageTag('arb')).toMatchObject({ kind: 'pack', languageId: 'ar' });
    expect(mapLanguageTag('ar-Arab')).toMatchObject({ kind: 'pack', languageId: 'ar' });
    expect(mapLanguageTag('ar-Latn').kind).toBe('ambiguous');
  });

  it('does not mistake Aramaic for Arabic, nor the other languages of the script for it', () => {
    expect(mapLanguageTag('arc')).toMatchObject({ kind: 'pack', languageId: 'arc' });
    for (const tag of ['fa', 'ur', 'ps', 'ckb', 'ug', 'sd']) expect(mapLanguageTag(tag).kind, tag).toBe('no-pack');
  });

  it('keeps the spoken dialects apart: recognised, never read as Standard Arabic', () => {
    for (const tag of ['arz', 'apc', 'afb', 'acm', 'ary', 'apd']) {
      const m = mapLanguageTag(tag);
      expect(m.kind, tag).toBe('ambiguous');
      expect(m.kind === 'ambiguous' && m.reason, tag).toMatch(/spoken dialect/);
    }
  });

  it('lists the varieties the manifest analyses, Modern Standard first', () => {
    expect(PACK_VARIETIES.ar).toEqual(PACKS.ar.varieties.filter((v) => v.analysed).map((v) => v.varietyId));
    expect(PACK_VARIETIES.ar).toEqual(['ar-msa', 'ar-cla']);
  });
});

describe('resolving the language of an Arabic-script page', () => {
  const resolve = createLanguageResolver({ adapters: { ar: arAdapter, sq: sqAdapter } });

  it('detects Arabic prose, vowelled or not, from the text alone', () => {
    for (const sample of [ARABIC, ARABIC_VOWELLED]) {
      const r = resolve({ installed: ['sq', 'ar'], sample });
      expect(r, sample).toMatchObject({ languageId: 'ar', basis: 'detection' });
      expect(r.confidence).toBeGreaterThanOrEqual(0.5);
      expect(r.confidence).toBeLessThanOrEqual(0.8);
    }
  });

  it.each([['Persian', PERSIAN], ['Urdu', URDU], ['Pashto', PASHTO], ['Kurdish', KURDISH]])('does not read %s as Arabic, and says why', (_name, sample) => {
    const r = resolve({ installed: ['sq', 'ar'], sample });
    expect(r.languageId).toBeUndefined();
    expect(r.basis).toBe('undetermined');
    expect(r.reasons.join(' ')).toMatch(/not Arabic/);
  });

  it('does not read Persian without its own letters as Arabic either: too few Arabic function words', () => {
    const r = resolve({ installed: ['ar'], sample: PERSIAN_PLAIN });
    expect(r.languageId).toBeUndefined();
    expect(r.reasons.join(' ')).toMatch(/function words/);
  });

  it('does not fall back to the learner’s Arabic on a page whose text names another language of the script', () => {
    for (const sample of [PERSIAN, URDU, PASHTO]) {
      const r = resolve({ installed: ['ar'], sample, teamDefault: 'ar' });
      expect(r.languageId, sample).toBeUndefined();
      expect(r.reasons.join(' '), sample).toMatch(/team default is not used against it/);
    }
  });

  it('believes a page that declares Arabic, and the learner’s own choice', () => {
    expect(resolve({ installed: ['ar'], documentLanguage: { languageId: 'ar', source: 'html-lang', confidence: 0.9 }, sample: 'مرحبا' })).toMatchObject({ languageId: 'ar', basis: 'document-metadata' });
    expect(resolve({ installed: ['ar'], override: 'ar', sample: PERSIAN })).toMatchObject({ languageId: 'ar', basis: 'override' });
  });

  it('decides nothing when the Arabic pack is not installed', () => {
    const r = resolve({ installed: ['sq'], sample: ARABIC });
    expect(r.languageId).toBeUndefined();
    expect(r.reasons.join(' ')).toMatch(/Arabic pack is not installed/);
  });

  it('never calls one or two Arabic words Arabic', () => {
    expect(resolve({ installed: ['ar'], sample: 'كتاب جديد' }).languageId).toBeUndefined();
  });
});

describe('GoLearn Active: which blocks of a page are Arabic', () => {
  it('knows the Arabic script, and that an Arabic word is not a Latin one', () => {
    expect(hasScript('مرحبا', 'Arab')).toBe(true);
    expect(hasScript('Hello', 'Arab')).toBe(false);
    expect(LANGUAGE_SCRIPT.ar).toBe('Arab');
    expect(wordInScript('كِتَاب', 'ar')).toBe(true);
    expect(wordInScript('book', 'ar')).toBe(false);
  });

  it('a block is Arabic when its letters name no other language and the function words show it', () => {
    expect(arabicLanguageOf(ARABIC, undefined)).toEqual({ languageId: 'ar', why: 'detected' });
    for (const other of [PERSIAN, URDU, PASHTO, KURDISH]) expect(arabicLanguageOf(other, undefined), other).toEqual({ why: 'none' });
  });

  it('a Persian block stays unread even on a page that is Arabic', () => {
    expect(arabicLanguageOf(PERSIAN, 'ar')).toEqual({ why: 'none' });
    expect(arabicLanguageOf(URDU, 'ar')).toEqual({ why: 'none' });
  });

  it('a block the function words do not settle is Arabic only on a page that is', () => {
    const rare = 'الأبجدية العربية لها ثمانية وعشرون حرفا ولكل حرف شكل';
    expect(arabicLanguageOf(rare, undefined)).toEqual({ why: 'none' });
    expect(arabicLanguageOf(rare, 'ar')).toEqual({ languageId: 'ar', why: 'page' });
    expect(arabicLanguageOf('كتاب جديد', undefined)).toEqual({ why: 'short' });
  });

  it('without the analyser nothing is read, and the plan asks for it', () => {
    document.body.innerHTML = `<p>${ARABIC}</p>`;
    const nodes = [document.body.querySelector('p')!.firstChild as Text];
    const plan = planPage(nodes, { installed: ['ar'], adapterOf: () => undefined });
    expect([...plan.missing]).toEqual(['ar']);
    expect(plan.byLanguage.size).toBe(0);
  });

  const planOf = (html: string, pageArabic?: string) => {
    document.body.innerHTML = html;
    const nodes: Text[] = [];
    const walk = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
    for (let n = walk.nextNode(); n; n = walk.nextNode()) nodes.push(n as Text);
    const plan = planPage(nodes, { installed: ['sq', 'ar'], adapterOf: (l) => (l === 'ar' ? arAdapter : l === 'sq' ? sqAdapter : undefined), ...(pageArabic ? { pageArabic } : {}) });
    const read = (id: string): string[] => (plan.nodeLanguages.get(document.getElementById(id)!.firstChild as Text) ?? []);
    return { plan, read };
  };

  it('an Arabic page is read with a lang attribute and without one', () => {
    const { read } = planOf(`<p id="declared" lang="ar">كتاب جديد</p><p id="detected">${ARABIC}</p>`);
    expect(read('declared')).toEqual(['ar']);
    expect(read('detected')).toEqual(['ar']);
  });

  it('a Persian page is left alone with lang="fa" and without a lang, and an Urdu paragraph too', () => {
    const { read } = planOf(`<p id="fa" lang="fa">${ARABIC}</p><p id="nolang">${PERSIAN}</p><p id="plain">${PERSIAN_PLAIN}</p><p id="ur">${URDU}</p>`, 'ar');
    expect(read('fa')).toEqual([]); // the block says it is Persian, whatever its words
    expect(read('nolang')).toEqual([]);
    expect(read('ur')).toEqual([]);
    // Persian with no letter of its own, on a page that is Arabic on evidence: nothing in the words says otherwise, so the page decides (as Cyrillic does)
    expect(read('plain')).toEqual(['ar']);
    expect(planOf(`<p id="plain">${PERSIAN_PLAIN}</p>`).read('plain')).toEqual([]);
  });

  it('a mixed page reads its one Arabic paragraph and none of the English around it', () => {
    const { read, plan } = planOf(`<p id="en1">The capital of Egypt is Cairo, and it is the largest city in the Arab world.</p><p id="ar">${ARABIC}</p><p id="en2">Visitors come to see the pyramids every day.</p>`);
    expect(read('ar')).toEqual(['ar']);
    expect(read('en1')).toEqual([]);
    expect(read('en2')).toEqual([]);
    expect([...plan.byLanguage.keys()]).toEqual(['ar']);
  });
});

describe('one Arabic word clicked inside an English sentence', () => {
  const resolve = createLanguageResolver({ adapters: { ar: arAdapter, sq: sqAdapter } });
  const english = 'She said the word كِتَاب means book in the lesson we had on Monday afternoon at school.';
  const evidence = { installed: ['ar'], sample: english, teamDefault: 'ar', documentLanguage: { languageId: 'en', source: 'html-lang' as const, confidence: 0.9 } };

  it('a click on it is read as Arabic when Arabic is the learner’s language, whatever the English page declares', () => {
    const r = resolve({ ...evidence, surface: 'كِتَاب' });
    expect(r).toMatchObject({ languageId: 'ar' });
    expect(r.reasons.join(' ')).toMatch(/click/);
    expect(resolve({ ...evidence, surface: 'كتاب' }).languageId).toBe('ar');
  });

  it('is not read when the word has a letter Arabic lacks, when the learner reads another language, or when no word was clicked', () => {
    expect(resolve({ ...evidence, surface: 'گرگان' }).languageId).toBeUndefined();
    expect(resolve({ ...evidence, surface: 'پاکستان' }).languageId).toBeUndefined();
    expect(resolve({ ...evidence, teamDefault: 'sq', installed: ['ar', 'sq'], surface: 'كِتَاب' }).languageId).not.toBe('ar');
    expect(resolve({ ...evidence, surface: 'book' }).languageId).toBeUndefined();
    expect(resolve(evidence).languageId).toBeUndefined();
  });

  it('GoLearn Active leaves the lone word alone: a block of English is not Arabic, so nothing is underlined', () => {
    document.body.innerHTML = `<p id="p">${english}</p>`;
    const plan = planPage([document.getElementById('p')!.firstChild as Text], { installed: ['ar'], adapterOf: () => arAdapter });
    expect(plan.byLanguage.size).toBe(0);
  });
});

describe('a click on one word: the sentence and the declaration decide first (fix batch 2)', () => {
  const resolve = createLanguageResolver({ adapters: { ar: arAdapter, sq: sqAdapter } });
  const persianBlock = 'این کتاب خوب است و من آن را برای دوستم خواندم.';
  const urduBlock = 'یہ کتاب اچھی ہے اور میں نے اسے اپنے دوست کے لیے پڑھا۔';
  const arabicBlock = 'ذهب الولد إلى المدرسة مع أخيه ثم عاد إلى البيت في المساء.';
  const click = (surface: string, sample: string, lang?: string) => resolve({ installed: ['ar'], teamDefault: 'ar', surface, sample, ...(lang ? { documentLanguage: { languageId: lang, source: 'element-lang' as const, confidence: 0.9 } } : {}) });

  it('a declared language no pack reads wins: خوب, است and کتاب with lang="fa" (or ur) are refused', () => {
    for (const w of ['خوب', 'است', 'کتاب']) {
      expect(click(w, persianBlock, 'fa').languageId, w).toBeUndefined();
      expect(click(w, arabicBlock, 'fa').languageId, `${w} on a fa page whose text looks Arabic`).toBeUndefined();
    }
    expect(click('خوب', urduBlock, 'ur').languageId).toBeUndefined();
  });

  it('the same words in a Persian or an Urdu paragraph with no lang are refused', () => {
    for (const w of ['خوب', 'است', 'کتاب']) expect(click(w, persianBlock).languageId, w).toBeUndefined();
    expect(click('اچھی', urduBlock).languageId).toBeUndefined();
    expect(click('کتاب', urduBlock).languageId).toBeUndefined();
  });

  it('a lone Arabic word inside an English sentence is read, and so is a word of an Arabic paragraph with no lang', () => {
    expect(click('كتاب', 'She said the word كتاب means book in the lesson we had on Monday afternoon.', 'en').languageId).toBe('ar');
    expect(click('المدرسة', arabicBlock).languageId).toBe('ar');
  });

  it('a block declared as an Arabic dialect gets the dialect’s message, not an Arabic reading', () => {
    const r = click('المدرسة', arabicBlock, 'arz');
    expect(r.languageId).toBeUndefined();
    expect(r.reasons.join(' ')).toMatch(/spoken dialect/);
  });
});
