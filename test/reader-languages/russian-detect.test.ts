// @vitest-environment jsdom
/**
 * Cyrillic is not Russian because it is Cyrillic. The script is shared by Ukrainian, Belarusian, Bulgarian, Serbian, Macedonian,
 * Kazakh and more, and by Russian in its pre-1918 spelling. The Russian pack reads Russian only, so a page is Russian when it says so,
 * when the learner chooses Russian for it, or when its text shows it: no letter of another Cyrillic alphabet, and the Russian word list
 * recognises it (packages/golearn-extension/src/language/{cyrillic,resolve}.ts, active/pageLanguages.ts). The analyser here has its
 * compiled core alone, as the extension does before any shard has loaded: detection must already work then.
 */
import { describe, expect, it } from 'vitest';
import { ruAdapter } from '../../src/adapters/ru';
import { sqAdapter } from '../../src/adapters/sq';
import { cyrillicShare, notRussianCyrillic } from '../../packages/golearn-extension/src/language/cyrillic';
import { createLanguageResolver, mapLanguageTag, PACK_VARIETIES } from '../../packages/golearn-extension/src/language/resolve';
import { cyrillicLanguageOf, hasScript, planPage, wordInScript } from '../../packages/golearn-extension/src/active/pageLanguages';
import { PACKS } from '../../packages/language-packs/src';

const RUSSIAN = 'Москва является столицей России и самым большим городом страны. В этом городе живут миллионы людей, и каждый день сюда приезжают гости из других стран.';
const RUSSIAN_NO_YO = 'Он шел домой и думал о том, что все еще может быть хорошо. Она ждала его дома и читала новую книгу.';
const UKRAINIAN = 'Київ є столицею України і найбільшим містом країни. У цьому місті живуть мільйони людей, і щодня сюди приїжджають гості з інших країн.';
const BELARUSIAN = 'Мінск з’яўляецца сталіцай Беларусі і самым вялікім горадам краіны. У гэтым горадзе жывуць мільёны людзей.';
const BULGARIAN = 'София е столицата на България и най-големият град в страната. В този град живеят милиони хора и всеки ден тук пристигат гости от други страни. Градът има дълга история и път към бъдещето.';
const SERBIAN = 'Београд је главни град Србије и највећи град у земљи. У овом граду живе милиони људи, а сваког дана овде долазе гости из других земаља.';
const MACEDONIAN = 'Скопје е главен град на Македонија и најголем град во земјата. Во овој град живеат многу луѓе.';
const KAZAKH = 'Астана — Қазақстанның астанасы және елдегі ірі қалалардың бірі. Бұл қалада көптеген адамдар тұрады.';
const PRE_REFORM = 'Въ началѣ было Слово, и Слово было у Бога, и Слово было Богъ. Оно было въ началѣ у Бога.';

describe('letters that say a Cyrillic text is not modern Russian', () => {
  it('finds nothing against Russian prose, with ё or without it', () => {
    expect(notRussianCyrillic(RUSSIAN)).toBeUndefined();
    expect(notRussianCyrillic(RUSSIAN_NO_YO)).toBeUndefined();
    expect(notRussianCyrillic('Объём подъезда и съезд: твёрдый знак стоит перед е, ё, ю, я.')).toBeUndefined();
  });

  it.each([
    ['Ukrainian', UKRAINIAN, /Ukrainian/],
    ['Belarusian', BELARUSIAN, /Belarusian/],
    ['Serbian', SERBIAN, /Serbian/],
    ['Macedonian', MACEDONIAN, /Macedonian|Serbian/],
    ['Kazakh', KAZAKH, /Kazakh/],
    ['pre-1918 Russian', PRE_REFORM, /pre-1918/],
    ['Bulgarian (no letter Russian lacks: ъ as a vowel, and no ы, э, ё)', BULGARIAN, /Bulgarian/],
  ])('names %s', (_name, text, language) => {
    const verdict = notRussianCyrillic(text);
    expect(verdict?.language).toMatch(language);
    expect(verdict?.evidence).toBeTruthy();
  });

  it('one foreign name in a long Russian text does not decide; in a short one it does', () => {
    expect(notRussianCyrillic(`${RUSSIAN} Мэр города Київ приехал в Москву.`)).toBeUndefined();
    expect(notRussianCyrillic('Київ')?.language).toMatch(/Ukrainian/);
  });

  it('says nothing about text that is not Cyrillic, and never says a text IS Russian', () => {
    expect(notRussianCyrillic('The quick brown fox.')).toBeUndefined();
    expect(cyrillicShare('Привет, world')).toBeCloseTo(6 / 11, 5);
  });
});

describe('the language tag table', () => {
  it('maps ru and its regional tags to the Russian pack, and refuses another script', () => {
    expect(mapLanguageTag('ru')).toMatchObject({ kind: 'pack', languageId: 'ru' });
    expect(mapLanguageTag('ru-RU')).toMatchObject({ kind: 'pack', languageId: 'ru' });
    expect(mapLanguageTag('rus')).toMatchObject({ kind: 'pack', languageId: 'ru' });
    expect(mapLanguageTag('ru-Latn').kind).toBe('ambiguous');
  });

  it.each(['uk', 'be', 'bg', 'sr', 'mk', 'kk', 'cu'])('does not map %s to any pack', (tag) => {
    expect(mapLanguageTag(tag).kind).toBe('no-pack');
  });

  it('lists the varieties the manifest lists', () => {
    expect(PACK_VARIETIES.ru).toEqual(PACKS.ru.varieties.filter((v) => v.analysed).map((v) => v.varietyId));
  });
});

describe('resolving the language of a Cyrillic page', () => {
  const resolve = createLanguageResolver({ adapters: { ru: ruAdapter, sq: sqAdapter } });
  const noWordList = createLanguageResolver({ adapters: {} });

  it('detects Russian prose, with ё or without it, from the text alone', () => {
    for (const sample of [RUSSIAN, RUSSIAN_NO_YO]) {
      const r = resolve({ installed: ['sq', 'ru'], sample });
      expect(r, sample).toMatchObject({ languageId: 'ru', basis: 'detection' });
      expect(r.confidence).toBeGreaterThanOrEqual(0.7);
      expect(r.confidence).toBeLessThanOrEqual(0.8);
    }
  });

  it.each([
    ['Ukrainian', UKRAINIAN], ['Belarusian', BELARUSIAN], ['Bulgarian', BULGARIAN], ['Serbian', SERBIAN], ['Macedonian', MACEDONIAN], ['Kazakh', KAZAKH], ['pre-1918 Russian', PRE_REFORM],
  ])('does not read %s as Russian, and says why', (_name, sample) => {
    const r = resolve({ installed: ['sq', 'ru'], sample });
    expect(r.languageId).toBeUndefined();
    expect(r.basis).toBe('undetermined');
    expect(r.reasons.join(' ')).toMatch(/not Russian|recognises only/);
  });

  it('does not fall back to the learner’s Russian on a page of another Cyrillic language', () => {
    for (const sample of [UKRAINIAN, BULGARIAN, SERBIAN]) {
      expect(resolve({ installed: ['ru'], sample, teamDefault: 'ru', documentLanguage: { languageId: 'uk', source: 'html-lang', confidence: 0.9 } }).languageId, sample).toBeUndefined();
    }
  });

  it('does not fall back to the learner’s Russian when a page declares nothing but the text names another Cyrillic language', () => {
    // a word selected in a Ukrainian paragraph of a page with no lang (found by the browser rig: столицею got a Russian card and a Russian encounter)
    for (const sample of [UKRAINIAN, BELARUSIAN, SERBIAN, KAZAKH, PRE_REFORM]) {
      const r = resolve({ installed: ['ru'], sample, teamDefault: 'ru' });
      expect(r.languageId, sample).toBeUndefined();
      expect(r.basis, sample).toBe('undetermined');
      expect(r.reasons.join(' '), sample).toMatch(/team default is not used against it/);
    }
    // text the word list merely does not recognise is not evidence against Russian: the default still applies
    expect(resolve({ installed: ['ru'], sample: 'Абвгд ежзий клмноп рсту фхцч шщыэ юяаб вгде', teamDefault: 'ru' })).toMatchObject({ languageId: 'ru', basis: 'team-default' });
  });

  it('believes a page that declares Russian, and the learner’s own choice', () => {
    expect(resolve({ installed: ['ru'], documentLanguage: { languageId: 'ru', source: 'html-lang', confidence: 0.9 }, sample: 'Привет' })).toMatchObject({ languageId: 'ru', basis: 'document-metadata' });
    expect(resolve({ installed: ['ru'], override: 'ru', sample: UKRAINIAN })).toMatchObject({ languageId: 'ru', basis: 'override' });
  });

  it('decides nothing when the Russian pack is not installed, or its word list is not loaded', () => {
    const notInstalled = resolve({ installed: ['sq'], sample: RUSSIAN });
    expect(notInstalled.languageId).toBeUndefined();
    expect(notInstalled.reasons.join(' ')).toMatch(/Russian pack is not installed/);
    const notLoaded = noWordList({ installed: ['ru'], sample: RUSSIAN });
    expect(notLoaded.languageId).toBeUndefined();
    expect(notLoaded.reasons.join(' ')).toMatch(/no Russian word list is available/);
  });

  it('never calls one or two Cyrillic words Russian', () => {
    expect(resolve({ installed: ['ru'], sample: 'Привет мир' }).languageId).toBeUndefined();
  });
});

describe('GoLearn Active: which blocks of a page are Russian', () => {
  it('knows the Cyrillic script, and that a Russian word is not a Latin one', () => {
    expect(hasScript('Привет', 'Cyrl')).toBe(true);
    expect(hasScript('Hello', 'Cyrl')).toBe(false);
    expect(wordInScript('книга', 'ru')).toBe(true);
    expect(wordInScript('book', 'ru')).toBe(false);
  });

  it('a block is Russian when the word list recognises it and its letters name no other language', () => {
    expect(cyrillicLanguageOf(RUSSIAN, ruAdapter, undefined)).toEqual({ languageId: 'ru', why: 'detected' });
    for (const other of [UKRAINIAN, BELARUSIAN, BULGARIAN, SERBIAN, KAZAKH, PRE_REFORM]) expect(cyrillicLanguageOf(other, ruAdapter, undefined), other).toEqual({ why: 'none' });
  });

  it('a Ukrainian block stays unread even on a page that is Russian', () => {
    expect(cyrillicLanguageOf(UKRAINIAN, ruAdapter, 'ru')).toEqual({ why: 'none' });
  });

  it('a block too short to compare is read as the page is; with no such evidence, only when every word is a Russian word', () => {
    expect(cyrillicLanguageOf('Привет', ruAdapter, undefined)).toEqual({ languageId: 'ru', why: 'detected' });
    expect(cyrillicLanguageOf('Куздра бокра', ruAdapter, undefined)).toEqual({ why: 'short' });
    expect(cyrillicLanguageOf('Куздра бокра', ruAdapter, 'ru')).toEqual({ languageId: 'ru', why: 'page' });
  });

  it('a longer block the word list does not settle is Russian only on a page that is', () => {
    const rare = 'Глокая куздра штеко будланула бокра и курдячит бокрёнка';
    expect(cyrillicLanguageOf(rare, ruAdapter, undefined)).toEqual({ why: 'none' });
    expect(cyrillicLanguageOf(rare, ruAdapter, 'ru')).toEqual({ languageId: 'ru', why: 'page' });
  });

  it('without the analyser nothing is decided, and the plan asks for it', () => {
    expect(cyrillicLanguageOf(RUSSIAN, undefined, 'ru')).toEqual({ why: 'none' });
    document.body.innerHTML = `<p>${RUSSIAN}</p>`;
    const nodes = [document.body.querySelector('p')!.firstChild as Text];
    const plan = planPage(nodes, { installed: ['ru'], adapterOf: () => undefined });
    expect([...plan.missing]).toEqual(['ru']);
    expect(plan.byLanguage.size).toBe(0);
  });

  it('plans a mixed page block by block: Russian read, Ukrainian and English left alone, a block that declares its language believed', () => {
    document.body.innerHTML = `<p id="ru">${RUSSIAN}</p><p id="uk">${UKRAINIAN}</p><p id="en">The capital of Russia is Moscow.</p>`
      + '<p id="declared-uk" lang="uk">Привет</p><p id="declared-ru" lang="ru">Куздра бокра</p><p id="mixed">Слово book значит книга, а house значит дом.</p>';
    const text = (id: string): Text => document.getElementById(id)!.firstChild as Text;
    const ids = ['ru', 'uk', 'en', 'declared-uk', 'declared-ru', 'mixed'];
    const plan = planPage(ids.map(text), { installed: ['ru'], adapterOf: (l) => (l === 'ru' ? ruAdapter : undefined) });
    const read = new Set((plan.byLanguage.get('ru') ?? []).map((n) => n.parentElement!.id));
    expect([...read].sort()).toEqual(['declared-ru', 'mixed', 'ru']);
    expect(plan.nodeLanguages.get(text('uk'))).toBeUndefined();
    expect(plan.nodeLanguages.get(text('en'))).toBeUndefined();
    expect(plan.missing.size).toBe(0);
  });
});
