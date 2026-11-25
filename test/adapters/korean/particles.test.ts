// @vitest-environment node
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { FUSED, KO_AUXILIARIES, KO_CLOSED_PREDICATES, PARTICLES, koAllomorphAgrees, koParticleMayFollow, koResolveFused } from '../../../src/adapters/korean/particles';
import { koAnalyzeToken } from '../../../src/adapters/korean/analyze';
import { installKoreanLexicon, lookupKoreanStem, uninstallKoreanLexicon } from '../../../src/adapters/korean/index-store';
import { KO_CORE } from '../../../src/adapters/korean/generated/core';
import { installFixtureLexicon, uninstallFixtureLexicon } from './fixture-lexicon';

const P = PARTICLES;

describe('allomorph agreement', () => {
  it('은/는, 이/가, 을/를, 와/과 by the final sound', () => {
    expect(koAllomorphAgrees(P.topic.forms[0].after, 'C')).toBe(true); // 은 after a consonant
    expect(koAllomorphAgrees(P.topic.forms[0].after, 'V')).toBe(false);
    expect(koAllomorphAgrees(P.topic.forms[1].after, 'V')).toBe(true); // 는 after a vowel
    expect(koAllomorphAgrees(P.subject.forms[1].after, 'C')).toBe(false); // 가 after a consonant: no
  });
  it('로 after a vowel or ㄹ, 으로 after any other consonant', () => {
    const ro = P.by.forms.find((f) => f.text === '로')!;
    const euro = P.by.forms.find((f) => f.text === '으로')!;
    expect(koAllomorphAgrees(ro.after, 'V')).toBe(true);
    expect(koAllomorphAgrees(ro.after, 'L')).toBe(true);
    expect(koAllomorphAgrees(ro.after, 'C')).toBe(false);
    expect(koAllomorphAgrees(euro.after, 'L')).toBe(false);
    expect(koAllomorphAgrees(euro.after, 'C')).toBe(true);
  });
});

describe('stacking order', () => {
  const ok = (...ids: string[]) => ids.every((id, i) => koParticleMayFollow(i ? P[ids[i - 1]] : undefined, P[id]));
  it('allows the orders Korean allows', () => {
    expect(ok('at', 'also')).toBe(true); // 에서도
    expect(ok('to-person', 'only')).toBe(true); // 에게만
    expect(ok('until', 'topic')).toBe(true); // 까지는
    expect(ok('to', 'topic')).toBe(true); // 에는
    expect(ok('by', 'topic')).toBe(true); // 으로는
    expect(ok('only', 'object')).toBe(true); // 만을
    expect(ok('only', 'subject')).toBe(true); // 만이
    expect(ok('until', 'also')).toBe(true); // 까지도
    expect(ok('at', 'only', 'topic')).toBe(true); // 에서만은
    expect(ok('to-person-hante', 'topic')).toBe(true); // 한테는
    expect(ok('subject-hon', 'topic')).toBe(true); // 께서는
    expect(ok('than', 'topic')).toBe(true); // 보다는
    expect(ok('like', 'only')).toBe(true); // 처럼만
    expect(ok('plural', 'subject')).toBe(true); // 들이
    expect(ok('at', 'of')).toBe(true); // 에서의
    expect(ok('plural', 'among')).toBe(true); // 들끼리
  });
  it('rejects impossible chains', () => {
    expect(ok('subject', 'object')).toBe(false);
    expect(ok('object', 'topic')).toBe(false);
    expect(ok('topic', 'subject')).toBe(false);
    expect(ok('of', 'topic')).toBe(false);
    expect(ok('of', 'also')).toBe(false);
    expect(ok('at', 'from')).toBe(false); // 에서부터 is its own family
    expect(ok('also', 'topic')).toBe(false); // 도는
    expect(ok('subject', 'plural')).toBe(false);
  });
});

describe('particle chains in context', () => {
  beforeAll(() => installFixtureLexicon());
  afterAll(() => uninstallFixtureLexicon());
  const chain = (w: string) => (koAnalyzeToken(w)[0].parts ?? []).slice(1).map((p) => p.lemma);
  it.each([
    ['학교에서도', ['에서', '도']], ['친구에게만', ['에게', '만']], ['집에서부터', ['에서부터']], ['여기까지는', ['까지', '은/는']], ['학교에는', ['에', '은/는']],
    ['학교에도', ['에', '도']], ['학교로는', ['로/으로', '은/는']], ['책만을', ['만', '을/를']], ['책만이', ['만', '이/가']], ['학교까지도', ['까지', '도']],
    ['학교에서만은', ['에서', '만', '은/는']], ['친구한테는', ['한테', '은/는']], ['선생님께서는', ['께서', '은/는']], ['친구보다는', ['보다', '은/는']], ['친구처럼만', ['처럼', '만']],
    ['집으로', ['로/으로']], ['서울로', ['로/으로']], ['물로', ['로/으로']], ['친구와', ['와/과']], ['책과', ['와/과']], ['친구랑', ['이랑/랑']], ['책이랑', ['이랑/랑']],
    ['친구하고', ['하고']], ['친구의', ['의']], ['친구에게서', ['에게서']], ['친구한테서', ['한테서']], ['선생님께', ['께']], ['사람마다', ['마다']],
    ['친구조차', ['조차']], ['친구마저', ['마저']], ['친구밖에', ['밖에']], ['커피나', ['이나/나']], ['책이나', ['이나/나']], ['커피든지', ['이든지/든지']],
    ['커피라도', ['이라도/라도']], ['책이라도', ['이라도/라도']], ['책이야말로', ['이야말로/야말로']], ['친구들끼리', ['들', '끼리']], ['나뿐', ['뿐']],
    ['책대로', ['대로']], ['책만큼', ['만큼']], ['친구로서', ['로서/으로서']], ['책으로써', ['로써/으로써']], ['친구에게로', ['에게로']],
    ['학교에다가', ['에다가/에다']], ['친구한테다가', ['한테다가/한테다']], ['커피요', ['요']], ['책은커녕', ['은커녕/는커녕']], ['책커녕', ['커녕']],
  ])('%s', (w, want) => expect(chain(w)).toEqual(want));
  it('a vocative', () => {
    const r = koAnalyzeToken('친구야');
    expect(r.some((c) => c.parts?.[1]?.lemma === '아/야' && c.morph.Case === 'Voc')).toBe(true);
  });
  it('a non-agreeing allomorph is a reading at 0.60 with a note', () => {
    const [c] = koAnalyzeToken('학생는');
    expect(c.lemma).toBe('학생');
    expect(c.confidence).toBeLessThanOrEqual(0.6);
    expect(String(c.notes?.remark ?? '')).toMatch(/does not agree/u);
  });
  it('i/ga keeps a stable id for the sentence layer (complement before 아니다 / 되다)', () => {
    const [c] = koAnalyzeToken('학생이');
    expect(c.parts?.[1]).toMatchObject({ lemma: '이/가', pos: 'ADP' });
    expect(c.morph).toMatchObject({ Particle: 'subject', Case: 'Nom' });
    expect(c.notes?.koPos).toBe('NNG+JKS');
  });
});

describe('fused pronoun table', () => {
  it('every row names its word by headword, class and fingerprint, never a homonym number', () => {
    for (const [form, f] of Object.entries(FUSED)) {
      expect(f.tag, form).toBe('NP');
      expect(f.fp, form).toBeInstanceOf(RegExp);
      expect(P[f.particle], form).toBeDefined();
    }
  });
  it('resolves against the REAL compiled core to the entry that means what the row means', () => {
    installKoreanLexicon(KO_CORE);
    try {
      const want: Record<string, RegExp> = { 제가: /\bI\b|\bme\b/u, 내가: /\bI\b/u, 네가: /\byou\b/u, 누가: /\bwho\b/u, 이게: /\bthis\b/u, 이건: /\bthis\b/u, 그건: /\bthat\b/u, 뭘: /\bwhat\b/u };
      for (const [form, re] of Object.entries(want)) {
        const e = koResolveFused(FUSED[form], lookupKoreanStem);
        expect(e, form).toBeDefined();
        expect(e!.gloss ?? '', form).toMatch(re);
      }
      const unresolved = Object.entries(FUSED).filter(([, f]) => lookupKoreanStem(f.pron).some((h) => h.entry.lemma === f.pron && h.entry.tag === f.tag) && !koResolveFused(f, lookupKoreanStem)).map(([k]) => k);
      expect(unresolved).toEqual([]);
    } finally { uninstallKoreanLexicon(KO_CORE.id); }
  });
});

describe('closed predicates', () => {
  it('holds the copulas, the existentials and the auxiliaries', () => {
    expect(KO_CLOSED_PREDICATES.get('이')?.map((e) => e.tag)).toEqual(['VCP']);
    expect(KO_CLOSED_PREDICATES.get('아니')?.map((e) => e.tag)).toEqual(['VCN']);
    expect(KO_CLOSED_PREDICATES.get('있')?.map((e) => e.tag).sort()).toEqual(['VA', 'VX']);
    expect(KO_CLOSED_PREDICATES.get('없')?.map((e) => e.tag)).toEqual(['VA']);
    expect(KO_AUXILIARIES.map((e) => e.lemma)).toEqual(expect.arrayContaining(['있다', '보다', '주다', '드리다', '버리다', '싶다', '않다', '못하다', '말다', '듯하다', '척하다']));
  });
});
