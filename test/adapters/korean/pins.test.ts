/** Hand corrections (korean/pins.ts): each pin fixes its sentence and leaves its look-alike alone. */
import { describe, expect, it } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { gunzipSync } from 'node:zlib';
import { koAdapter } from '../../../src/adapters/ko';
import { installKoreanLexicon, type KoLexicon } from '../../../src/adapters/korean/index-store';

const SHARDS = path.resolve(__dirname, '../../../public/lexicon/ko/standard');
const present = fs.existsSync(path.join(SHARDS, 'manifest.json'));
if (present) for (const f of fs.readdirSync(SHARDS)) if (f.endsWith('.json.gz')) installKoreanLexicon(JSON.parse(gunzipSync(fs.readFileSync(path.join(SHARDS, f))).toString('utf8')) as KoLexicon);

const first = (sentence: string, form: string) => koAdapter.analyze(koAdapter.tokenize(sentence)).find((a) => a.token.surface === form)?.candidates[0];

describe.skipIf(!present)('hand corrections', () => {
  it.each([
    ['아이가 그새 많이 컸어요.', '컸어요', '크다', 'grow', '그 집은 아주 컸어요.', '컸어요'],
    ['경기 전에 국가를 불렀어요.', '국가를', '국가²', 'anthem', '그는 국가를 위해 일해요.', '국가를'],
    ['저는 아직 자신이 없어요.', '자신이', '자신²', 'confidence', '그는 자신이 직접 했어요.', '자신이'],
    ['그는 석사 과정에 들어갔어요.', '과정에', '과정²', 'course', '이 과정은 꽤 어려워요.', '과정은'],
    ['밥을 먹으면 위가 아파요.', '위가', '위²', 'stomach', '책상 위가 더러워요.', '위가'],
    ['형은 축구팀 주장이에요.', '주장이에요', '주장²', 'captain', '그것은 그의 주장이에요.', '주장이에요'],
    ['밥을 많이 먹어서 배가 불러요.', '불러요', '부르다', 'full', '아이들이 노래를 불러요.', '불러요'],
    ['이 영화 완전 재미있어요!', '완전', '완전', 'absolutely', '완전한 사람은 없어요.', '완전한'],
    ['아이가 엄마 손을 꼭 잡았어요.', '꼭', '꼭²', 'tight', '내일 꼭 오세요.', '꼭'],
    ['선과 악을 구별해요.', '선과', '선³', 'good', '선과 면을 그렸어요.', '선과'],
    ['내일이 아기 돌이에요.', '돌이에요', '돌²', 'birthday', '이것은 큰 돌이에요.', '돌이에요'],
    ['오래된 성을 구경했어요.', '성을', '성⁵', 'castle', '그의 성은 김이에요.', '성은'],
    ['군인이 창을 들고 있어요.', '창을', '창²', 'spear', '더우니까 창을 열어 주세요.', '창을'],
    ['문을 걸어 잠갔다.', '걸어', '걸다', 'hang', '학교까지 걸어 갔어요.', '걸어'],
    ['벽에 그림을 걸어 놓았어요.', '걸어', '걸다', 'hang', '길을 걸어 왔어요.', '걸어'],
    ['보다 가까이 오세요.', '보다', '보다', 'more', '영화를 보다 잠이 들었어요.', '보다'],
    ['그것이 보다 효과적인 방법이다.', '보다', '보다', 'more', '영화를 보다 감동적인 장면에서 울었어요.', '보다'],
    ['한 줌의 소금을 넣어요.', '줌의', '줌', 'handful', '선물을 줌.', '줌'],
    ['싸워서 다 없애 버릴 테야.', '테야', '터²', 'intention', '이 테는 금이야.', '테는'],
    ['그는 만들기를 원치 않았어요.', '원치', '원하다', 'want', '배에 원치를 달았어요.', '원치를'],
  ] as const)('%s → %s is %s (%s)', (sentence, form, lemma, gloss, other, otherForm) => {
    const c = first(sentence, form);
    expect(c?.lemma).toBe(lemma);
    expect(String(c?.gloss ?? '').toLowerCase()).toContain(gloss);
    expect(c?.notes?.pinned).toBe('yes');
    expect(first(other, otherForm)?.notes?.pinned, other).toBeUndefined();
  });
});
