// @vitest-environment node
import { describe, expect, it } from 'vitest';
import { type KoConjClass, koDeriveClass, koGenerate, koJunctionBases } from '../../../src/adapters/korean/conjugate';
import { ENDINGS, koEnding } from '../../../src/adapters/korean/endings';
import { candidateStems } from '../../../src/adapters/korean/stems';

const gen = (stem: string, cls: KoConjClass, ids: string[], yo = false) => koGenerate(stem, cls, ids.map(koEnding), { yo });
const inf = (stem: string, cls: KoConjClass) => gen(stem, cls, ['hae']);

describe('a-eo base (the infinitive)', () => {
  const cases: Array<[string, KoConjClass, string[]]> = [
    ['먹', 'R', ['먹어']], ['가', 'R', ['가']], ['서', 'R', ['서']], ['보', 'R', ['봐', '보아']], ['오', 'R', ['와']], ['주', 'R', ['줘', '주어']],
    ['마시', 'R', ['마셔', '마시어']], ['쓰', 'R', ['써']], ['크', 'R', ['커']], ['바쁘', 'R', ['바빠']], ['아프', 'R', ['아파']], ['예쁘', 'R', ['예뻐']],
    ['보내', 'R', ['보내', '보내어']], ['되', 'R', ['돼', '되어']], ['쉬', 'R', ['쉬어']], ['하', 'Ha', ['해', '하여']], ['공부하', 'Ha', ['공부해', '공부하여']],
    ['좋', 'R', ['좋아']], ['앉', 'R', ['앉아']], ['읽', 'R', ['읽어']], ['얇', 'R', ['얇아']],
    ['듣', 'D', ['들어']], ['걷', 'D', ['걸어']], ['닫', 'R', ['닫아']], ['받', 'R', ['받아']],
    ['춥', 'B', ['추워']], ['돕', 'B', ['도와']], ['곱', 'B', ['고와']], ['아름답', 'B', ['아름다워']], ['가깝', 'B', ['가까워']], ['잡', 'R', ['잡아']], ['입', 'R', ['입어']],
    ['짓', 'S', ['지어']], ['낫', 'S', ['나아']], ['웃', 'R', ['웃어']], ['씻', 'R', ['씻어']],
    ['하얗', 'H', ['하얘']], ['그렇', 'H', ['그래']], ['어떻', 'H', ['어때']], ['빨갛', 'H', ['빨개']], ['누렇', 'H', ['누레']], ['파랗', 'H', ['파래']], ['넣', 'R', ['넣어']],
    ['모르', 'Reu', ['몰라']], ['부르', 'Reu', ['불러']], ['빠르', 'Reu', ['빨라']], ['다르', 'Reu', ['달라']], ['따르', 'R', ['따라']], ['치르', 'R', ['치러']],
    ['이르', 'Reo', ['이르러']], ['푸르', 'Reo', ['푸르러']], ['푸', 'U', ['퍼']],
  ];
  for (const [stem, cls, want] of cases) it(`${stem} (${cls}) → ${want.join(' / ')}`, () => expect(inf(stem, cls).sort()).toEqual([...want].sort()));
});

describe('eu base, ㄹ deletion and the irregular classes before -(으)X', () => {
  const cases: Array<[string, KoConjClass, string, string[]]> = [
    ['먹', 'R', 'if', ['먹으면']], ['가', 'R', 'if', ['가면']], ['살', 'R', 'if', ['살면']], ['살', 'R', 'since', ['사니']], ['살', 'R', 'adn-n', ['산']],
    ['살', 'R', 'adn-l', ['살']], ['살', 'R', 'prop-bsida', ['삽시다']], ['살', 'R', 'seyo', ['사세요']], ['살', 'R', 'nmlz-m', ['삶']], ['살', 'R', 'intend', ['살려고']],
    ['듣', 'D', 'since', ['들으니']], ['듣', 'D', 'adn-n', ['들은']], ['춥', 'B', 'since', ['추우니']], ['춥', 'B', 'adn-n', ['추운']], ['돕', 'B', 'since', ['도우니']],
    ['짓', 'S', 'since', ['지으니']], ['짓', 'S', 'adn-n', ['지은']], ['하얗', 'H', 'adn-n', ['하얀']], ['하얗', 'H', 'since', ['하야니']], ['그렇', 'H', 'if', ['그러면']],
    ['모르', 'Reu', 'if', ['모르면']], ['하', 'Ha', 'if', ['하면']], ['하', 'Ha', 'adn-n', ['한']], ['하', 'Ha', 'adn-l', ['할']],
  ];
  for (const [stem, cls, id, want] of cases) it(`${stem} + ${koEnding(id).cite} → ${want.join(' / ')}`, () => expect(gen(stem, cls, [id])).toEqual(want));
});

describe('bare and cv attachments', () => {
  const cases: Array<[string, KoConjClass, string, string[]]> = [
    ['먹', 'R', 'hasipsio-decl', ['먹습니다']], ['가', 'R', 'hasipsio-decl', ['갑니다']], ['살', 'R', 'hasipsio-decl', ['삽니다']], ['사', 'R', 'hasipsio-decl', ['삽니다']],
    ['듣', 'D', 'hasipsio-decl', ['듣습니다']], ['춥', 'B', 'hasipsio-decl', ['춥습니다']], ['하얗', 'H', 'hasipsio-decl', ['하얗습니다']], ['하', 'Ha', 'hasipsio-decl', ['합니다']],
    ['먹', 'R', 'decl-neunda', ['먹는다']], ['가', 'R', 'decl-neunda', ['간다']], ['살', 'R', 'decl-neunda', ['산다']],
    ['살', 'R', 'adn-neun', ['사는']], ['듣', 'D', 'adn-neun', ['듣는']], ['듣', 'D', 'and', ['듣고']], ['춥', 'B', 'and', ['춥고']], ['하얗', 'H', 'and', ['하얗고']],
    ['살', 'R', 'excl-ne', ['사네']], ['먹', 'R', 'and', ['먹고']], ['가', 'R', 'quote-neunda', ['간다고']],
  ];
  for (const [stem, cls, id, want] of cases) it(`${stem} + ${koEnding(id).cite} → ${want.join(' / ')}`, () => expect(gen(stem, cls, [id])).toEqual(want));
});

describe('pre-final endings chain on their own bases', () => {
  const cases: Array<[string, KoConjClass, string[], string[]]> = [
    ['먹', 'R', ['p-past', 'hasipsio-decl'], ['먹었습니다']], ['가', 'R', ['p-past', 'haeyo'], ['갔어요']], ['보', 'R', ['p-past', 'decl-da'], ['봤다', '보았다']],
    ['하', 'Ha', ['p-past', 'decl-da'], ['했다', '하였다']], ['쓰', 'R', ['p-past', 'decl-da'], ['썼다']], ['모르', 'Reu', ['p-past', 'decl-da'], ['몰랐다']],
    ['읽', 'R', ['p-hon', 'p-past', 'hasipsio-decl'], ['읽으셨습니다', '읽으시었습니다']], ['가', 'R', ['p-hon', 'hasipsio-decl'], ['가십니다']],
    ['가', 'R', ['p-hon', 'haeyo'], ['가셔요', '가시어요']], ['가', 'R', ['seyo'], ['가세요']], ['먹', 'R', ['p-past', 'if'], ['먹었으면']],
    ['가', 'R', ['p-fut', 'hasipsio-decl'], ['가겠습니다']], ['먹', 'R', ['p-pqp', 'decl-da'], ['먹었었다']], ['하', 'Ha', ['p-humble', 'lit-sose'], ['하옵소서']],
    ['이르', 'Reu', ['p-hon', 'lit-doe'], ['이르시되']], ['하', 'Ha', ['p-hon', 'lit-nira'], ['하시니라']], ['만들', 'R', ['p-pass', 'p-past', 'decl-da'], ['만들어졌다', '만들어지었다']],
    ['먹', 'R', ['p-retro', 'retro-ra'], ['먹더라']], ['먹', 'R', ['p-must', 'decl-da'], ['먹어야겠다']], ['계시', 'R', ['haeyo'], ['계셔요', '계시어요', '계세요']],
    ['마시', 'R', ['haeyo'], ['마셔요', '마시어요']],
  ];
  for (const [stem, cls, ids, want] of cases) it(`${stem} + ${ids.join(' + ')}`, () => expect(gen(stem, cls, ids).sort()).toEqual([...want].sort()));
});

describe('the copulas', () => {
  it('이다 after a consonant and after a vowel', () => {
    expect(koGenerate('이', 'Cop', [koEnding('haeyo')]).sort()).toEqual(['이어요', '이에요'].sort());
    expect(koGenerate('이', 'Cop', [koEnding('haeyo')], { vowelNoun: true }).sort()).toEqual(['', '이어요', '이에요', '여요', '예요'].filter(Boolean).sort());
    expect(koGenerate('이', 'Cop', [koEnding('p-past'), koEnding('decl-da')], { vowelNoun: true }).sort()).toEqual(['였다', '이었다'].sort());
    expect(koGenerate('이', 'Cop', [koEnding('decl-da')], { vowelNoun: true }).sort()).toEqual(['다', '이다'].sort());
    expect(koGenerate('이', 'Cop', [koEnding('hasipsio-decl')])).toEqual(['입니다']);
  });
  it('아니다', () => {
    expect(koGenerate('아니', 'Neg', [koEnding('haeyo')])).toContain('아니에요');
    expect(koGenerate('아니', 'Neg', [koEnding('hasipsio-decl')])).toEqual(['아닙니다']);
    expect(koGenerate('아니', 'Neg', [koEnding('p-past'), koEnding('decl-da')])).toContain('아니었다');
  });
});

describe('koJunctionBases and koDeriveClass', () => {
  it('names the three bases', () => {
    expect(koJunctionBases('살', 'R')).toEqual({ bare: '살', eu: ['살'], aeo: ['살아'] });
    expect(koJunctionBases('듣', 'D')).toEqual({ bare: '듣', eu: ['들으'], aeo: ['들어'] });
  });
  it('derives the class from a dictionary infinitive and sequential', () => {
    expect(koDeriveClass('듣다', ['들어'], ['들으니'])).toBe('D');
    expect(koDeriveClass('닫다', ['닫아'], ['닫으니'])).toBe('R');
    expect(koDeriveClass('춥다', ['추워'], ['추우니'])).toBe('B');
    expect(koDeriveClass('짓다', ['지어'], ['지으니'])).toBe('S');
    expect(koDeriveClass('하얗다', ['하얘'], ['하야니'])).toBe('H');
    expect(koDeriveClass('좋다', ['좋아'], ['좋으니'])).toBe('R');
    expect(koDeriveClass('모르다', ['몰라'], ['모르니'])).toBe('Reu');
    expect(koDeriveClass('이르다', ['이르러'], ['이르니'])).toBe('Reo');
    expect(koDeriveClass('따르다', ['따라'], ['따르니'])).toBe('R');
    expect(koDeriveClass('푸다', ['퍼'], ['푸니'])).toBe('U');
    expect(koDeriveClass('하다', ['해', '하여'], ['하니'])).toBe('Ha');
    expect(koDeriveClass('살다', ['살아'], ['사니'])).toBe('R');
  });
});

describe('candidateStems undoes every alternation the generator makes', () => {
  const stems: Array<[string, KoConjClass]> = [
    ['먹', 'R'], ['가', 'R'], ['보', 'R'], ['주', 'R'], ['마시', 'R'], ['쓰', 'R'], ['바쁘', 'R'], ['되', 'R'], ['하', 'Ha'], ['공부하', 'Ha'], ['살', 'R'], ['만들', 'R'],
    ['듣', 'D'], ['춥', 'B'], ['돕', 'B'], ['아름답', 'B'], ['짓', 'S'], ['낫', 'S'], ['하얗', 'H'], ['그렇', 'H'], ['누렇', 'H'], ['모르', 'Reu'], ['이르', 'Reo'], ['푸', 'U'], ['계시', 'R'],
  ];
  const finals = ENDINGS.filter((e) => e.tag !== 'EP');
  const chains: string[][] = [[], ['p-past'], ['p-hon'], ['p-hon', 'p-past'], ['p-fut']];
  it('for every stem × chain × final ending', () => {
    let n = 0;
    for (const [stem, cls] of stems) for (const pre of chains) for (const e of finals) {
      for (const form of koGenerate(stem, cls, [...pre.map(koEnding), e])) {
        n++;
        expect(candidateStems(form), `${stem}+${pre.join('+')}+${e.id} = ${form}`).toContain(stem);
      }
    }
    expect(n).toBeGreaterThan(2000);
  });
  it('is bounded', () => expect(candidateStems('대한민국에서부터만이라도요하는것을').length).toBeLessThanOrEqual(40));
});
