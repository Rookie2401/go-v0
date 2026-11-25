// @vitest-environment node
/**
 * The Korean adapter (src/adapters/ko.ts) as a whole, through the LanguageAdapter contract: order = confidence over every token of a
 * 40-sentence set of my own (ordinary prose, speech, and ten sentences in the register of Korean Bible translations, written for this test,
 * quoting no translation); offsets in NFC and NFD; Hanja and mixed tokens; unknown words; the same first reading with the core alone and
 * with every shard; pronunciation on the card; the English a card shows; and the other members.
 */
import fs from 'node:fs';
import path from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { AnalyzedToken } from '../../../src/core';
import { koAdapter, koPronunciationOptions } from '../../../src/adapters/ko';
import { koPronunciation } from '../../../src/adapters/korean/pronunciation';
import { installKoreanLexicon, lookupKoreanStem, uninstallKoreanLexicon } from '../../../src/adapters/korean/index-store';
import { candidateStems } from '../../../src/adapters/korean/stems';
import { KO_CORE } from '../../../src/adapters/korean/generated/core';
import { createKoreanShardLoader } from '../../../src/adapters/korean/shards';
import { wordAnalysisFor } from '../../../src/adapters/word-analysis';
import { koreanManifest } from '../../../packages/language-packs/src/packs/ko';

const PROSE = [
  '학생들이 학교에서 공부했습니다.', '선생님이 책을 읽으셨습니다.', '오늘은 날씨가 아주 춥습니다.', '저는 매일 아침 일곱 시에 일어납니다.',
  '우리 가족은 서울에 살아요.', '이 식당의 음식은 맛있지만 비쌉니다.', '비가 오면 집에 있을 거예요.', '그는 회사에서 일하고 있어요.',
  '어머니께서 시장에 가셨어요.', '친구에게 편지를 썼어요.', '한국어를 배우기 위해서 한국에 왔어요.', '길이 막혀서 늦었습니다.',
  '아이들이 공원에서 놀고 있습니다.', '내일은 회의가 없어요.', '책상 위에 사과 두 개가 있어요.',
];
const SPEECH = [
  '밥 먹었어?', '어디 가요?', '나도 몰라.', '이거 얼마예요?', '같이 영화 볼래요?', '진짜 맛있다!', '좀 도와 주세요.', '지금 뭐 해?',
  '괜찮아요, 걱정하지 마세요.', '잘 먹겠습니다.', '내일 만날까요?', '배고파 죽겠어.', '전화 좀 해 줘.', '왜 안 와?', '이 옷이 하얘요.',
];
const LITERARY = [
  '하나님이 세상을 사랑하시니라.', '주여 우리를 도우소서.', '내가 너와 함께 하리라.', '그가 산에 올라가 기도하더라.', '마음이 깨끗한 자는 복이 있도다.',
  '너희는 서로 사랑하라.', '내가 이 말을 너희에게 하노라.', '주님의 이름이 거룩하도다.', '우리가 주께 감사하나이다.', '빛이 어둠에 비치되 어둠이 깨닫지 못하더라.',
];
const ALL = [...PROSE, ...SPEECH, ...LITERARY];

const analyse = (s: string): { tokens: ReturnType<typeof koAdapter.tokenize>; analyses: AnalyzedToken[] } => { const tokens = koAdapter.tokenize(s); return { tokens, analyses: koAdapter.analyze(tokens) }; };
const orderProblems = (analyses: AnalyzedToken[]): string[] => {
  const out: string[] = [];
  for (const a of analyses) for (let k = 1; k < a.candidates.length; k++) if (!(a.candidates[k].confidence < a.candidates[k - 1].confidence)) out.push(`${a.token.surface} #${k} ${a.candidates[k].confidence} ≥ ${a.candidates[k - 1].confidence}`);
  return out;
};
const PREDICATE = ['VERB', 'ADJ', 'AUX'];

const SHARDS = path.resolve(__dirname, '../../../public/lexicon/ko/standard');
const HAVE_SHARDS = fs.existsSync(path.join(SHARDS, 'manifest.json'));
const fsSource = {
  async fetchJson(p: string) { return JSON.parse(fs.readFileSync(path.resolve(__dirname, '../../../public', p), 'utf8')); },
  async fetchBytes(p: string) { return new Uint8Array(fs.readFileSync(path.resolve(__dirname, '../../../public', decodeURIComponent(p)))); },
};

describe('the 40 sentences, core only', () => {
  beforeAll(() => { uninstallKoreanLexicon('kaikki-ko-lexicon'); installKoreanLexicon(KO_CORE); });

  it('has 40 sentences: 15 of prose, 15 of speech, 10 literary', () => expect([PROSE.length, SPEECH.length, LITERARY.length]).toEqual([15, 15, 10]));

  it('order = confidence over every token: the first reading strictly the highest, the list strictly falling', () => {
    const bad = ALL.flatMap((s) => orderProblems(analyse(s).analyses).map((x) => `${s}: ${x}`));
    expect(bad).toEqual([]);
  });

  it('an unconfirmed reading is never a predicate, and never carries a gloss', () => {
    for (const s of [...ALL, '뷁뷁했다.', '빠르미했다.', '나는학교에갔다.']) for (const a of analyse(s).analyses) for (const c of a.candidates) {
      if (!c.unconfirmed) continue;
      expect(PREDICATE, `${s} ${a.token.surface}`).not.toContain(c.pos);
      expect(c.gloss, `${s} ${a.token.surface}`).toBeUndefined();
    }
  });

  it('every part span lies inside its token and every token slices the text (NFC)', () => {
    for (const s of ALL) {
      const { tokens, analyses } = analyse(s);
      for (const t of tokens) expect(s.slice(t.start, t.end)).toBe(t.surface);
      for (const a of analyses) for (const c of a.candidates) for (const p of c.parts ?? []) {
        expect(p.start, `${a.token.surface} ${p.text}`).toBeGreaterThanOrEqual(0);
        expect(p.end, `${a.token.surface} ${p.text}`).toBeLessThanOrEqual(a.token.surface.length);
        expect(p.start).toBeLessThanOrEqual(p.end);
      }
    }
  });

  it('NFD text: the same first readings as NFC, offsets into the decomposed text', () => {
    for (const s of PROSE.slice(0, 6)) {
      const nfd = s.normalize('NFD');
      const a = analyse(s).analyses;
      const b = analyse(nfd).analyses;
      expect(b.length).toBe(a.length);
      b.forEach((x, i) => {
        expect(nfd.slice(x.token.start, x.token.end)).toBe(x.token.surface);
        expect(x.candidates[0]?.lemma, x.token.surface).toBe(a[i].candidates[0]?.lemma);
        for (const p of x.candidates[0]?.parts ?? []) expect(p.end).toBeLessThanOrEqual(x.token.surface.length);
      });
    }
  });

  it('Hanja and mixed tokens reach the Hangul headword and keep the page’s text', () => {
    const { analyses } = analyse('學校에서 韓國語를 배워요.');
    expect(analyses[0].candidates[0].lemma).toBe('학교');
    expect(analyses[0].token.surface).toBe('學校에서');
    expect(analyses[1].candidates[0].unconfirmed ? 'unconfirmed' : analyses[1].candidates[0].lemma).toMatch(/한국어|unconfirmed/);
    // a Latin token and the particle after it
    const k = analyse('KBS가 방송했어요.').analyses;
    expect(k[1].candidates[0]).toMatchObject({ lemma: '이/가', pos: 'ADP' });
  });

  it('pronunciation on the card: the respelling and Revised Romanization with what only the analysis knows', () => {
    const said = (s: string, w: string): { note: string; tr?: string } => {
      const { analyses } = analyse(s);
      const a = analyses.find((x) => x.token.surface === w)!;
      const p = koAdapter.pronunciation(a.token, a);
      return { note: p.notes?.[0] ?? '', tr: p.transliteration };
    };
    for (const [s, w, resp] of [
      ['책을 읽고 있어요.', '읽고', '일꼬'], ['읽다', '읽다', '익따'], ['내일 갈게.', '갈게', '갈께'], ['맛없다', '맛없다', '마덥따'], ['같이 가요.', '같이', '가치'],
      ['국물이 맛있어요.', '국물이', '궁무리'], ['국물', '국물', '궁물'], ['좋아요.', '좋아요', '조아요'], ['돈이 없어요.', '없어요', '업써요'], ['학생입니다.', '학생입니다', '학쌩임니다'],
      ['입니다', '입니다', '임니다'], ['한국어', '한국어', '한구거'],
    ] as const) expect(said(s, w).note, `${w}`).toContain(`[${resp}]`);
    expect(said('문이 닫히다', '닫히다').tr).toBe('dachida');
    const n = koAdapter.pronunciation(analyse('읽고').tokens[0], analyse('읽고').analyses[0]);
    expect(n.notes!.join(' ')).toMatch(/Revised Romanization \(2000\)/);
    // the prospective -(으)ㄹ of the word before tenses this one across the space: 할 수 [할 쑤]
    // (koPronunciation's prevProspective option): 할 수 [할 쑤], 올 것 [올 껃]; without the -(으)ㄹ before it, 수 stays [수]
    const all = (s: string, w: string): string => { const { analyses } = analyse(s); const a = analyses.find((x) => x.token.surface === w)!; return (koAdapter.pronunciation(a.token, a).notes ?? []).join(' '); };
    expect(all('할 수 있어요.', '수')).toContain('[쑤]');
    expect(all('할 수 있어요.', '수')).toMatch(/tensed across the space/);
    expect(all('비가 올 것 같아요.', '것')).toContain('[껃]');
    expect(all('학생 수가 많아요.', '수가')).not.toMatch(/tensed across the space/);
  });

  it('the English a card shows is the gloss unchanged: no person, no -ing, no conjugated meaning (meaning lines below)', () => {
    const lines: string[] = [];
    for (const s of ALL) {
      const { analyses } = analyse(s);
      for (const a of analyses) {
        const c = a.candidates[0];
        if (!c) continue;
        const w = wordAnalysisFor({ language: 'ko', surface: a.token.surface, lemma: c.lemma, pos: c.pos, lemmaGloss: c.unconfirmed ? undefined : c.gloss, morph: c.morph, confidence: c.confidence, parts: c.parts });
        expect(w.inflectedMeaning, `${s} ${a.token.surface}`).toBeNull();
        if (c.gloss && !c.unconfirmed) expect(w.lexicalMeaning?.text).toBe(c.gloss);
        const form = koAdapter.describeMorph!(c.morph, c.pos);
        expect(form, `${s} ${a.token.surface}`).not.toMatch(/\b(he|she|it)\b/u);
        lines.push(`${a.token.surface}: ${w.lexicalMeaning?.text ?? '—'} (${form})`);
      }
    }
    expect(lines.length).toBeGreaterThan(120);
  });

  it('support is honest and the pack manifest’s declarations are delivered', () => {
    const s = koAdapter.support;
    expect(s).toMatchObject({ tokenization: 'dependable', lemmatization: 'seed-only', morphology: 'limited' });
    expect(s.limitations.join(' ')).toMatch(/native speaker/);
    expect(s.limitations.join(' ')).not.toMatch(/reviewed by a native speaker\.?$/);
    const m = koreanManifest();
    expect(m.analyzer.capabilities).toContain('phrases');
    expect(s.phraseDetection).not.toBe('none');
    expect(m.pronunciation.notesAvailable).toBe(true);
    expect(koAdapter.pronunciation(analyse('한국어').tokens[0], analyse('한국어').analyses[0]).notes!.length).toBeGreaterThan(1);
    for (const id of Object.keys(koAdapter.sources!)) expect(koAdapter.sources![id].reviewStatus).not.toBe('native-reviewed');
  });

  it('speech: ko-KR text with no homonym number; Sino-Korean number words, digits kept before a native-numeral counter', () => {
    const r = koAdapter.speechNormalize('눈² 와요. 3명');
    expect(r.speechText).toBe('눈 와요. 3명');
    expect(r.transformations.some((t) => /homonym/.test(t.description))).toBe(true);
    expect(koAdapter.speechNormalize('2024년 3월 15일, 10000원').speechText).toBe('이천이십사년 삼월 십오일, 만원');
    expect(koAdapter.speechNormalize('3').speechText).toBe('삼');
  });

  it('production: the particle form after a consonant or a vowel, with a sure suggestion; nothing else claimed', () => {
    const s = '학생는 책를 읽어요.';
    const { tokens, analyses } = analyse(s);
    const errs = koAdapter.checkProduction(tokens, analyses, s);
    expect(errs.map((e) => e.category)).toEqual(['particle', 'particle']);
    expect(errs[0].suggestion).toMatchObject({ replacement: '은' });
    expect(s.slice(errs[0].suggestion!.start, errs[0].suggestion!.end)).toBe('는');
    expect(errs[1].suggestion).toMatchObject({ replacement: '을' });
    const ok = '학생은 책을 읽어요.';
    expect(koAdapter.checkProduction(koAdapter.tokenize(ok), koAdapter.analyze(koAdapter.tokenize(ok)), ok)).toEqual([]);
  });

  it('syntax: subject, object, topic, adnominal, auxiliary and root, each with its basis', () => {
    const { tokens, analyses } = analyse('저는 동생이 읽은 책을 샀어요.');
    const sx = koAdapter.syntax!(tokens, analyses)!;
    const rel = (w: string) => sx.relations.find((r) => tokens[r.dependent].surface === w);
    expect(rel('샀어요')!.relation).toBe('root');
    expect(rel('책을')).toMatchObject({ relation: 'obj', head: 4 });
    expect(rel('읽은')).toMatchObject({ relation: 'acl', head: 3 });
    expect(rel('동생이')).toMatchObject({ relation: 'nsubj', head: 2 });
    expect(rel('동생이')!.alternatives?.[0]?.head).toBe(4);
    expect(rel('저는')!.relation).toBe('dep');
    for (const r of sx.relations) expect(r.basis.length).toBeGreaterThan(0);
    const p = analyse('밥을 먹고 있어요.');
    const px = koAdapter.syntax!(p.tokens, p.analyses)!;
    expect(px.relations.find((r) => r.dependent === 2)).toMatchObject({ relation: 'aux', head: 1 });
  });

  it('relate, lemmaVariants, decode, describeMorph, refine', () => {
    expect(koAdapter.relate('먹었어요', '먹고')).toBe('inflection');
    expect(koAdapter.relate('학교', '학교')).toBe('same');
    expect(koAdapter.relate('학교', '먹고')).toBe('none');
    expect(koAdapter.lemmaVariants!('눈²')).toEqual(['눈']);
    expect(koAdapter.lemmaVariants!('학교')).toEqual([]);
    expect(koAdapter.decode!('한').length).toBe(1);
    expect(koAdapter.describeMorph!({ Tense: 'Past', SpeechLevel: 'Hasipsio', Mood: 'Ind', VerbForm: 'Fin' }, 'VERB')).toBe('past, formal polite (하십시오체), statement');
    const { tokens, analyses } = analyse('음악을 들어요.');
    const again = koAdapter.refine!(tokens, analyses, new Set([analyses[0].analyzer]));
    expect(again[1].candidates[0].lemma).toBe(analyses[1].candidates[0].lemma);
    // a token from another analyser is never touched
    const foreign = analyses.map((a, i) => (i === 1 ? { ...a, analyzer: 'dictionary@1' } : a));
    expect(koAdapter.refine!(tokens, foreign, new Set([analyses[0].analyzer]))[1]).toBe(foreign[1]);
  });
});

describe.skipIf(!HAVE_SHARDS)('core only against every shard loaded (through the shard loader)', () => {
  const coreFirst = new Map<string, string>();
  let loader: Awaited<ReturnType<typeof createKoreanShardLoader>>;
  beforeAll(async () => {
    uninstallKoreanLexicon('kaikki-ko-lexicon');
    installKoreanLexicon(KO_CORE);
    for (const s of ALL) for (const a of analyse(s).analyses) {
      const c = a.candidates[0];
      if (a.token.isWord && c && !c.unconfirmed) coreFirst.set(`${s}|${a.token.start}`, `${c.lemma}|${c.pos}`);
    }
    loader = await createKoreanShardLoader(fsSource, { base: 'lexicon/ko/standard' });
    const words = ALL.flatMap((s) => koAdapter.tokenize(s).filter((t) => t.isWord).map((t) => t.surface));
    const r = await loader.ensure(words);
    expect(r.failed).toEqual([]);
  });
  afterAll(() => uninstallKoreanLexicon('kaikki-ko-lexicon'));

  it('gives the same first reading for the words the core holds', () => {
    const diff: string[] = [];
    for (const s of ALL) for (const a of analyse(s).analyses) {
      const k = `${s}|${a.token.start}`;
      if (!coreFirst.has(k)) continue;
      // the core HOLDS the word when every stem the token may begin with has the same rows in the core as in the full lexicon (진짜 the
      // adverb and 주님 are shard rows only: those tokens are not words the core holds)
      if (candidateStems(a.token.normalized).some((st) => lookupKoreanStem(st).length !== new Set((KO_CORE.entries[st] ?? []).map((e) => `${e.lemma}|${e.tag}|${e.hom ?? 0}|${e.clf ? 1 : 0}`)).size)) continue;
      const c = a.candidates[0];
      if (`${c.lemma}|${c.pos}` !== coreFirst.get(k)) diff.push(`${a.token.surface}: ${coreFirst.get(k)} → ${c.lemma}|${c.pos}`);
    }
    expect(diff).toEqual([]);
  });
  it('a nominal the full lexicon holds is passed to the rules as a noun (국화; 집현전 is not in the lexicon at all)', async () => {
    await loader.ensure(['국화']);
    const { tokens, analyses } = analyse('국화');
    expect(analyses[0].candidates[0].unconfirmed).not.toBe(true);
    expect(koPronunciationOptions(tokens[0], analyses[0].candidates[0])).toMatchObject({ nominal: true, dictionary: '구콰' });
    // the rules alone, given the noun, keep the h (the 체언 exception)
    expect(koPronunciation('집현전', { nominal: true }).transliteration).toBe('jiphyeonjeon');
  });
  // with the dictionary's respelling AND nominal, koPronunciation romanizes from the spelling (Hangul round 4): the noun keeps its h
  it('국화 is romanized gukhwa on the card, though the dictionary respells it [구콰]', async () => {
    await loader.ensure(['국화']);
    const { tokens, analyses } = analyse('국화');
    expect(koAdapter.pronunciation(tokens[0], analyses[0]).transliteration).toBe('gukhwa');
  });
  it('keeps order = confidence with the shards', () => {
    expect(ALL.flatMap((s) => orderProblems(analyse(s).analyses).map((x) => `${s}: ${x}`))).toEqual([]);
  });
});
