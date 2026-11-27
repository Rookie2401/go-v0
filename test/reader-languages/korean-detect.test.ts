// @vitest-environment jsdom
/**
 * Hangul is written by Korean alone, so for the extension the script IS the language, as for Thai, Hebrew and Greek: a page or a block whose
 * letters are mostly Hangul is Korean, whatever analyser has loaded; `lang="ko"`, `ko-KR` and `kor` resolve to the Korean pack. Nothing here
 * needs the analyser or its lexicon (packages/golearn-extension/src/language/resolve.ts, active/pageLanguages.ts).
 */
import { describe, expect, it } from 'vitest';
import { koAdapter } from '../../src/adapters/ko';
import { createLanguageResolver, mapLanguageTag, PACK_VARIETIES } from '../../packages/golearn-extension/src/language/resolve';
import { hasScript, LANGUAGE_SCRIPT, planPage, SCRIPT_LANGUAGE, wordInScript } from '../../packages/golearn-extension/src/active/pageLanguages';
import { PACKS } from '../../packages/language-packs/src';

const KOREAN = '서울은 대한민국의 수도이자 가장 큰 도시이다. 이 도시에는 많은 사람들이 살고 있으며, 매일 많은 손님이 찾아온다.';
const MIXED_HANJA = '學校에서 韓國語를 공부했습니다. 대학교에서 歷史와 哲學을 배웠습니다.';
const ENGLISH = 'Seoul is the capital and largest city of South Korea. Many people live in this city.';
const JAPANESE = '東京は日本の首都であり、最大の都市です。多くの人々がこの都市に住んでいます。';
const CHINESE = '北京是中华人民共和国的首都，也是全国的政治和文化中心。许多人居住在这个城市。';
const NFD = KOREAN.normalize('NFD');

describe('the language tag table: Korean', () => {
  it('maps ko, kor and ko-KR to the Korean pack; ko-KR is its variety', () => {
    expect(mapLanguageTag('ko')).toEqual({ kind: 'pack', languageId: 'ko', notes: [] });
    for (const tag of ['kor', 'KO', 'ko-Hang', 'ko-Kore']) expect(mapLanguageTag(tag), tag).toEqual({ kind: 'pack', languageId: 'ko', notes: [] });
    for (const tag of ['ko-KR', 'ko_KR', 'ko-kr']) expect(mapLanguageTag(tag), tag).toEqual({ kind: 'pack', languageId: 'ko', varietyId: 'ko-KR', notes: [] });
  });

  it('reads ko-KP as Standard Korean, says so, and claims no North Korean variety', () => {
    const north = mapLanguageTag('ko-KP');
    expect(north).toMatchObject({ kind: 'pack', languageId: 'ko' });
    expect(north.kind === 'pack' && north.varietyId).toBeUndefined();
    expect(north.kind === 'pack' && north.notes.join(' ')).toMatch(/North Korean spelling is not analysed/);
  });

  it('refuses Korean in another script, as for every pack: the pack analyses Hangul', () => {
    const r = mapLanguageTag('ko-Latn');
    expect(r.kind).toBe('ambiguous');
    expect(r.kind === 'ambiguous' && r.reason).toMatch(/written in LATN script; the ko pack analyses the HANG script only/);
  });

  it('does not map Japanese or Chinese to the pack (they share Hanja, not Hangul)', () => {
    for (const tag of ['ja', 'ja-JP', 'zh', 'zh-CN', 'zh-Hant']) expect(mapLanguageTag(tag).kind, tag).toBe('no-pack');
  });

  it('lists the varieties the manifest lists', () => {
    expect(PACK_VARIETIES.ko).toEqual(PACKS.ko.varieties.filter((v) => v.analysed).map((v) => v.varietyId));
  });
});

describe('resolving the language of a Hangul page', () => {
  const noWordList = createLanguageResolver({ adapters: {} });
  const withKorean = createLanguageResolver({ adapters: { ko: koAdapter } });

  it('detects Korean from the text alone, with no analyser loaded, composed or decomposed', () => {
    for (const sample of [KOREAN, NFD, MIXED_HANJA]) {
      const r = noWordList({ installed: ['ko'], sample });
      expect(r, sample).toMatchObject({ languageId: 'ko', basis: 'detection' });
      expect(r.reasons.join(' ')).toMatch(/Hangul/);
    }
    expect(withKorean({ installed: ['ko'], sample: KOREAN })).toMatchObject({ languageId: 'ko', basis: 'detection' });
  });

  it('decides nothing when the Korean pack is not installed, and says why', () => {
    const r = noWordList({ installed: ['sq'], sample: KOREAN });
    expect(r.languageId).toBeUndefined();
    expect(r.reasons.join(' ')).toMatch(/Korean pack is not installed/);
  });

  it('never calls English, Japanese or Chinese text Korean', () => {
    for (const sample of [ENGLISH, JAPANESE, CHINESE]) expect(noWordList({ installed: ['ko'], sample }).languageId, sample).toBeUndefined();
  });

  it('one or two Hangul words are never enough, and a page that declares ko-KR is Korean at the document level', () => {
    expect(noWordList({ installed: ['ko'], sample: '안녕 세상' }).languageId).toBeUndefined();
    expect(noWordList({ installed: ['ko'], documentLanguage: { languageId: 'ko-KR', source: 'element-lang', confidence: 0.9 } })).toMatchObject({ languageId: 'ko', varietyId: 'ko-KR', basis: 'document-metadata' });
  });
});

describe('GoLearn Active: which text of a page is Korean', () => {
  it('Hangul is the script of Korean alone', () => {
    expect(SCRIPT_LANGUAGE.Hang).toBe('ko');
    expect(LANGUAGE_SCRIPT.ko).toBe('Hang');
    expect(hasScript('학교', 'Hang')).toBe(true);
    expect(hasScript('ㅋㅋㅋ', 'Hang')).toBe(true); // compatibility jamo
    expect(hasScript('school 學校', 'Hang')).toBe(false); // Hanja alone is not Hangul
    expect(hasScript('東京', 'Hang')).toBe(false);
  });

  it('a Korean word may hold Hanja; an English or a Hanja-only word of another pack is not read as Korean', () => {
    for (const w of ['학교', '學校에서', '韓國語를', '대학교']) expect(wordInScript(w, 'ko'), w).toBe(true);
    for (const w of ['school', 'Seoul', 'KBS가']) expect(wordInScript(w, 'ko'), w).toBe(false);
  });

  it('plans a mixed page node by node: Korean read, English, Japanese and Chinese left alone', () => {
    document.body.innerHTML = `<p id="ko">${KOREAN}</p><p id="en">${ENGLISH}</p><p id="ja">${JAPANESE}</p><p id="zh">${CHINESE}</p><p id="mixed">서울 is the capital: 서울은 수도이다.</p>`;
    const text = (id: string): Text => document.getElementById(id)!.firstChild as Text;
    const ids = ['ko', 'en', 'ja', 'zh', 'mixed'];
    const plan = planPage(ids.map(text), { installed: ['ko'], adapterOf: (l) => (l === 'ko' ? koAdapter : undefined) });
    const read = new Set((plan.byLanguage.get('ko') ?? []).map((n) => n.parentElement!.id));
    expect([...read].sort()).toEqual(['ko', 'mixed']);
    for (const id of ['en', 'ja', 'zh']) expect(plan.nodeLanguages.get(text(id)), id).toBeUndefined();
    expect(plan.missing.size).toBe(0);
  });

  it('without the analyser nothing is read, and the plan asks for it', () => {
    document.body.innerHTML = `<p>${KOREAN}</p>`;
    const nodes = [document.body.querySelector('p')!.firstChild as Text];
    const plan = planPage(nodes, { installed: ['ko'], adapterOf: () => undefined });
    expect([...plan.missing]).toEqual(['ko']);
    expect(plan.byLanguage.size).toBe(0);
  });

  it('a pack that is not installed is never asked for', () => {
    document.body.innerHTML = `<p>${KOREAN}</p>`;
    const nodes = [document.body.querySelector('p')!.firstChild as Text];
    const plan = planPage(nodes, { installed: ['sq'], adapterOf: () => undefined });
    expect(plan.missing.size).toBe(0);
    expect(plan.byLanguage.size).toBe(0);
  });
});
