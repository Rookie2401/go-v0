// @vitest-environment node
import { describe, expect, it } from 'vitest';
import {
  KO_ROMANIZATION_SCHEME, PRONUNCIATION_EXCEPTIONS, koPronounce, koPronouncePhrase, koPronunciation, koRomanizationRespelling, koStandardPronunciation, untenseLike,
} from '../../../src/adapters/korean/pronunciation';
import { koRomanize, koRomanizeWord } from '../../../src/adapters/korean/translit';
import { decompose, syllablesOf } from '../../../src/adapters/korean/hangul';

const P = koStandardPronunciation;
const table = (pairs: Array<[string, string]>) => { for (const [w, p] of pairs) expect(P(w), w).toBe(p); };

describe('the brief examples', () => {
  it('give the seven named pronunciations exactly', () => {
    table([['한국어', '한구거'], ['같이', '가치'], ['먹는', '멍는'], ['국물', '궁물'], ['신라', '실라'], ['읽다', '익따'], ['학교', '학꾜']]);
  });
  it('and every rule named in the brief', () => {
    table([
      ['굳이', '구지'], ['읽어', '일거'], ['좋아', '조아'], ['좋다', '조타'], ['축하', '추카'], ['입학', '이팍'], ['입니다', '임니다'], ['있는', '인는'],
      ['설날', '설랄'], ['심리', '심니'], ['종로', '종노'], ['먹다', '먹따'], ['국밥', '국빱'], ['옷', '옫'], ['부엌', '부억'], ['잎', '입'], ['꽃', '꼳'],
      ['값', '갑'], ['닭', '닥'], ['넓다', '널따'], ['앉다', '안따'], ['많다', '만타'], ['삶', '삼'], ['맛있다', '마싣따'],
    ]);
  });
});

describe('liaison', () => {
  it('moves a final to a vowel-initial syllable', () => {
    table([['옷이', '오시'], ['꽃이', '꼬치'], ['부엌에', '부어케'], ['밖에', '바께'], ['있어', '이써'], ['앞으로', '아프로'], ['낮에', '나제'], ['높이', '노피'], ['깊이', '기피']]);
  });
  it('moves the second consonant of a compound final', () => {
    table([['닭이', '달기'], ['값이', '갑씨'], ['넋이', '넉씨'], ['앉아', '안자'], ['젊어', '절머'], ['핥아', '할타'], ['읊어', '을퍼'], ['없어', '업써']]);
  });
  it('drops ㅎ before a vowel, and keeps ㄴ or ㄹ of ㄶ ㅀ', () => {
    table([['많아', '마나'], ['닳아', '다라'], ['쌓이다', '싸이다'], ['낳은', '나은']]);
  });
  it('does not move ㅇ', () => {
    table([['강아지', '강아지'], ['사랑을', '사랑을']]);
  });
});

describe('palatalisation', () => {
  it('ㄷ ㅌ before 이, and before 히', () => {
    table([['해돋이', '해도지'], ['미닫이', '미다지'], ['밭이', '바치'], ['굳히다', '구치다'], ['닫히다', '다치다'], ['묻히다', '무치다']]);
  });
  it('compound finals before 히 aspirate their second consonant', () => {
    table([['앉히다', '안치다'], ['읽히다', '일키다'], ['밝히다', '발키다'], ['넓히다', '널피다']]);
  });
});

describe('aspiration', () => {
  it('ㅎ with ㄱ ㄷ ㅂ ㅈ in either order', () => {
    table([['좋고', '조코'], ['놓지', '노치'], ['많고', '만코'], ['않던', '안턴'], ['옳지', '올치'], ['끓다', '끌타'], ['닳지', '달치'], ['꽃한', '꼬탄'], ['옷한', '오탄'], ['밥하고', '바파고']]);
  });
  it('ㅎ before ㅅ makes ㅆ, before ㄴ makes ㄴ', () => {
    table([['닿소', '다쏘'], ['좋습니다', '조씀니다'], ['놓는', '논는'], ['쌓네', '싼네']]);
  });
});

describe('nasal and liquid assimilation', () => {
  it('obstruent finals before ㄴ ㅁ', () => {
    table([['국민', '궁민'], ['닫는', '단는'], ['꽃말', '꼰말'], ['낱말', '난말'], ['앞마당', '암마당'], ['잡념', '잠념'], ['합니다', '함니다'], ['갑니다', '감니다'], ['감사합니다', '감사함니다'], ['읽는', '잉는'], ['값만', '감만'], ['앞날', '암날'], ['옷맵시', '온맵씨']]);
  });
  it('obstruent finals before ㄹ', () => {
    table([['독립', '동닙'], ['협력', '혐녁'], ['막론', '망논'], ['법리', '범니'], ['침략', '침냑'], ['담력', '담녁'], ['십리', '심니']]);
  });
  it('ㄴ and ㄹ', () => {
    table([['난로', '날로'], ['칼날', '칼랄'], ['대관령', '대괄령'], ['강릉', '강능']]);
  });
});

describe('tensification and final neutralisation', () => {
  it('after an obstruent final', () => {
    table([['닦다', '닥따'], ['옆집', '엽찝'], ['꽃다발', '꼳따발'], ['있다', '읻따'], ['낚시', '낙씨'], ['없다', '업따']]);
  });
  it('at the end of a word', () => {
    table([['앞', '압'], ['밖', '박'], ['낮', '낟'], ['밭', '받'], ['키읔', '키윽'], ['히읗', '히읃'], ['흙', '흑'], ['여덟', '여덜'], ['많', '만'], ['읊', '읍']]);
  });
  it('a consonant before 의 is said 이; a first-syllable 의 stays', () => {
    table([['희망', '히망'], ['무늬', '무니'], ['띄어', '띠어'], ['의사', '의사']]);
  });
  it('words with no sound change come back unchanged', () => {
    table([['나라', '나라'], ['사람', '사람'], ['고양이', '고양이'], ['한글', '한글'], ['바다', '바다']]);
  });
});

describe('verb stems and the exceptions table', () => {
  it('ㄺ before ㄱ is ㄹ only for a predicate stem; a stem before ㄱ ㄷ ㅅ ㅈ tenses', () => {
    expect(P('읽고')).toBe('익꼬');
    expect(P('읽고', { verbStem: true })).toBe('일꼬');
    expect(P('신고')).toBe('신고');
    expect(P('신고', { verbStem: true })).toBe('신꼬');
  });
  it('lists only entries the standard names', () => {
    table([['밟다', '밥따'], ['의견란', '의견난'], ['생산량', '생산냥'], ['갈등', '갈뜽'], ['솜이불', '솜니불'], ['담요', '담뇨'], ['맛없다', '마덥따'], ['멋없다', '머덥따'], ['꽃잎', '꼰닙'], ['서울역', '서울력']]);
    for (const [w, p] of Object.entries(PRONUNCIATION_EXCEPTIONS)) {
      expect([...w]).toHaveLength([...p].length);
      for (const ch of p) expect(decompose(ch), `${w} → ${p}`).toBeDefined();
    }
  });
  it('the rules alone give the same for the ㅅ + 있/없 variants', () => {
    expect(koPronounce('맛있다').text).toBe('마싣따');
  });
});

describe('across a word boundary', () => {
  it('a following consonant decides the last final; a following vowel does not link', () => {
    expect(P('먹', { nextWord: '는다' })).toBe('멍');
    expect(P('값', { nextWord: '도' })).toBe('갑');
    expect(P('입', { nextWord: '니다' })).toBe('임');
    expect(P('옷', { nextWord: '이다' })).toBe('옫');
    expect(P('학교', { nextWord: '에' })).toBe('학꾜');
  });
  it('non-Hangul text passes through and breaks the context', () => {
    expect(P('KBS')).toBe('KBS');
    expect(P('한국 어')).toBe('한국 어');
    expect(P('')).toBe('');
    expect(P('ㅋㅋ')).toBe('ㅋㅋ');
    expect(P('한국어'.normalize('NFD'))).toBe('한구거');
  });
});

describe('koRomanize (a respelling, jamo by jamo)', () => {
  it('maps each jamo', () => {
    expect(koRomanize('한구거')).toBe('hangugeo');
    expect(koRomanize('실라')).toBe('silla');
    expect(koRomanize('학꾜')).toBe('hakkkyo');
    expect(koRomanize('가나다라마바사')).toBe('ganadaramabasa');
    expect(koRomanize('아야어여오요우유으이')).toBe('ayaeoyeooyouyueui');
    expect(koRomanize('애에얘예와왜외워웨위의')).toBe('aeeyaeyewawaeoewowewiui');
    expect(koRomanize('앙')).toBe('ang');
    expect(koRomanize('알')).toBe('al');
    expect(koRomanize('압')).toBe('ap');
    expect(koRomanize('앋')).toBe('at');
    expect(koRomanize('안')).toBe('an');
    expect(koRomanize('암')).toBe('am');
    expect(koRomanize('악')).toBe('ak');
    expect(koRomanize('라')).toBe('ra');
    expect(koRomanize('팔라')).toBe('palla');
    expect(koRomanize('값')).toBe('gap');
    expect(koRomanize('x 1 ㅋ')).toBe('x 1 ㅋ');
  });
  it('every lead and every vowel', () => {
    expect(koRomanize('가까나다따라마바빠사싸아자짜차카타파하')).toBe('gakkanadattaramabappasassaajajjachakatapaha');
  });
});

describe('koRomanizeWord (Revised Romanization of the pronunciation, tensification not shown)', () => {
  it('shows assimilation', () => {
    const t: Array<[string, string]> = [
      ['신라', 'silla'], ['종로', 'jongno'], ['백마', 'baengma'], ['한국어', 'hangugeo'], ['같이', 'gachi'], ['좋고', 'joko'], ['독립', 'dongnip'],
      ['왕십리', 'wangsimni'], ['한라산', 'hallasan'], ['해돋이', 'haedoji'], ['합니다', 'hamnida'], ['감사합니다', 'gamsahamnida'], ['먹는', 'meongneun'],
      ['국물', 'gungmul'], ['읽는', 'ingneun'],
    ];
    for (const [w, r] of t) expect(koRomanizeWord(w), w).toBe(r);
  });
  it('does not show tensification', () => {
    const t: Array<[string, string]> = [
      ['학교', 'hakgyo'], ['압구정', 'apgujeong'], ['낙동강', 'nakdonggang'], ['먹다', 'meokda'], ['읽다', 'ikda'], ['있다', 'itda'], ['국밥', 'gukbap'],
      ['맛있다', 'masitda'], ['값이', 'gapsi'], ['넓다', 'neolda'], ['발달', 'baldal'],
    ];
    for (const [w, r] of t) expect(koRomanizeWord(w), w).toBe(r);
  });
  it('keeps ㅢ as ui and writes plain finals', () => {
    expect(koRomanizeWord('희망')).toBe('huimang');
    expect(koRomanizeWord('의사')).toBe('uisa');
    expect(koRomanizeWord('값')).toBe('gap');
    expect(koRomanizeWord('꽃')).toBe('kkot');
    expect(koRomanizeWord('옷')).toBe('ot');
    expect(koRomanizeWord('서울')).toBe('seoul');
    expect(koRomanizeWord('한글')).toBe('hangeul');
  });
  it('passes non-Hangul through, with no capitalisation', () => {
    expect(koRomanizeWord('KBS')).toBe('KBS');
    expect(koRomanizeWord('2024년')).toBe('2024nyeon');
    expect(koRomanizeWord('')).toBe('');
  });
  it('the romanization respelling has no tense leads of its own', () => {
    expect(koRomanizationRespelling('학교')).toBe('학교');
    expect(koRomanizationRespelling('희망')).toBe('희망');
    expect(koRomanizationRespelling('한국어')).toBe('한구거');
  });
});

describe('untenseLike', () => {
  it('puts back the plain leads the spelling writes', () => {
    expect(untenseLike('학교', '학꾜')).toBe('학교');
    expect(untenseLike('먹다', '먹따')).toBe('먹다');
    expect(untenseLike('한국어', '한구거')).toBe('한구거');
    expect(untenseLike('학교', '학꾜다')).toBe('학꾜다');
    expect(untenseLike('까치', '까치')).toBe('까치');
  });
});

describe('koPronunciation (support for the word sheet)', () => {
  it('gives the romanization of the pronunciation and a note for each sound change', () => {
    const s = koPronunciation('먹는');
    expect(s.transliteration).toBe('meongneun');
    expect(s.notes).toContain('ㄱ before ㄴ is said ㅇ: nasal assimilation');
    const t = koPronunciation('한국어');
    expect(t.transliteration).toBe('hangugeo');
    expect(t.notes?.some((n) => n.includes('liaison'))).toBe(true);
    expect(koPronunciation('읽다').notes?.some((n) => n.includes('compound final'))).toBe(true);
    expect(koPronunciation('학교').notes?.some((n) => n.includes('tensification'))).toBe(true);
    expect(koPronunciation('학교').transliteration).toBe('hakgyo');
    expect(koPronunciation('같이').notes?.some((n) => n.includes('palatalisation'))).toBe(true);
    expect(koPronunciation('좋다').notes?.some((n) => n.includes('aspiration'))).toBe(true);
    expect(koPronunciation('신라').notes?.some((n) => n.includes('liquid assimilation'))).toBe(true);
    expect(koPronunciation('옷').notes?.some((n) => n.includes('final neutralisation'))).toBe(true);
  });
  it('has no notes when nothing changes, and nothing for text without Hangul', () => {
    expect(koPronunciation('나라').transliteration).toBe('nara');
    expect(koPronunciation('나라').notes).toHaveLength(1);
    expect(koPronunciation('KBS')).toEqual({});
    expect(koPronunciation('學校')).toEqual({});
    expect(koPronunciation('')).toEqual({});
  });
  it("a dictionary's respelling wins, with or without brackets, and a difference is noted", () => {
    const d = koPronunciation('학교', { dictionary: '[학꾜]' });
    expect(d.transliteration).toBe('hakgyo');
    expect(d.notes?.[0]).toContain("dictionary's");
    expect(d.notes?.some((n) => n.includes('differently'))).toBe(false);
    const e = koPronunciation('나라', { dictionary: '[나나]' });
    expect(e.transliteration).toBe('nana');
    expect(e.notes?.[1]).toContain('[나라]');
    expect(koPronunciation('나라', { dictionary: '' }).transliteration).toBe('nara');
    expect(koPronunciation('나라', { dictionary: 'nara' }).transliteration).toBe('nara');
  });
  it('accepts NFD spellings and a following word', () => {
    expect(koPronunciation('한국어'.normalize('NFD')).transliteration).toBe('hangugeo');
    expect(koPronunciation('먹', { nextWord: '는다' }).transliteration).toBe('meong');
  });
});

describe('fix batch 1: audit words (표준 발음법)', () => {
  const V = { verbStem: true };
  it('compound finals: 읽 맑 밟 넓 젊 핥 읊 없 값 닭 여덟 넋 앉 많 싫 않 놓 쌓', () => {
    table([
      ['읽지', '익찌'], ['읽는', '잉는'], ['밟다', '밥따'], ['밟고', '밥꼬'], ['넓다', '널따'], ['넓죽하다', '넙쭈카다'], ['맑다', '막따'], ['젊다', '점따'],
      ['핥다', '할따'], ['읊고', '읍꼬'], ['없다', '업따'], ['없어', '업써'], ['값을', '갑쓸'], ['닭이', '달기'], ['여덟', '여덜'], ['넋이', '넉씨'],
      ['앉아', '안자'], ['많아', '마나'], ['싫어', '시러'], ['않는', '안는'], ['놓는', '논는'], ['쌓네', '싼네'], ['좋아요', '조아요'], ['젊지', '점찌'],
    ]);
    expect(P('읽고', V)).toBe('일꼬');
    expect(P('맑게', V)).toBe('말께');
    expect(P('읽는다', V)).toBe('잉는다');
  });
  it('의 and ㅢ', () => {
    table([['의사', '의사'], ['희망', '히망'], ['무늬', '무니'], ['협의', '혀븨'], ['우리의', '우리의'], ['계시다', '계시다'], ['시계', '시계']]);
  });
  it('linking, palatalisation and aspiration', () => {
    table([
      ['굳이', '구지'], ['해돋이', '해도지'], ['붙이다', '부치다'], ['닫히다', '다치다'], ['묻히다', '무치다'], ['국화', '구콰'], ['축하', '추카'], ['입학', '이팍'],
      ['좋던', '조턴'], ['많고', '만코'], ['않던', '안턴'], ['싫다', '실타'], ['닿소', '다쏘'], ['놓아', '노아'], ['쌓이다', '싸이다'],
    ]);
  });
  it('liquid and nasal assimilation', () => {
    table([
      ['신라', '실라'], ['칼날', '칼랄'], ['난로', '날로'], ['의견란', '의견난'], ['생산량', '생산냥'], ['담력', '담녁'], ['침략', '침냑'], ['강릉', '강능'],
      ['항로', '항노'], ['대통령', '대통녕'], ['막론', '망논'], ['협력', '혐녁'], ['십리', '심니'], ['국민', '궁민'], ['앞문', '암문'], ['꽃망울', '꼰망울'],
      ['밥물', '밤물'], ['있는', '인는'], ['닫는', '단는'], ['듣는', '든는'], ['꽃잎', '꼰닙'], ['솜이불', '솜니불'], ['색연필', '생년필'], ['서울역', '서울력'],
    ]);
  });
  it('tensification', () => {
    table([['국밥', '국빱'], ['깎다', '깍따'], ['넋받이', '넉빠지'], ['옷고름', '옫꼬름'], ['꽃다발', '꼳따발'], ['낯설다', '낟썰다'], ['덮개', '덥깨'], ['옆집', '엽찝'], ['값지다', '갑찌다']]);
    expect(P('신고', V)).toBe('신꼬');
    expect(P('안다', V)).toBe('안따');
    expect(P('감고', V)).toBe('감꼬');
    expect(P('삼다', V)).toBe('삼따');
  });
  it('exceptions table: 맛있다 [마싣따] (variant; [마딛따] is the principle) and 맛없다 [마덥따]', () => {
    table([['맛있다', '마싣따'], ['멋있다', '머싣따'], ['맛없다', '마덥따'], ['멋없다', '머덥따']]);
    expect(PRONUNCIATION_EXCEPTIONS['발달']).toBeUndefined();
  });
  it('져 쪄 쳐 are said 저 쩌 처 (제5항 다만 1), the romanisation follows the spelling', () => {
    table([['가져', '가저'], ['다쳐', '다처'], ['쪄', '쩌'], ['졌다', '젇따'], ['가졌어요', '가저써요'], ['쳐다보다', '처다보다']]);
    expect(koRomanizeWord('가져')).toBe('gajyeo');
    expect(koRomanizeWord('다쳐')).toBe('dachyeo');
    expect(koPronunciation('가져').notes?.some((n) => n.includes('저'))).toBe(true);
  });
  it('tensing after the prospective ㄹ: the closed list of endings, and tenseAfter', () => {
    table([['갈게', '갈께'], ['할걸', '할껄'], ['할수록', '할쑤록'], ['할지라도', '할찌라도'], ['먹을게', '머글께'], ['갈게요', '갈께요'], ['할걸요', '할꺼료'], ['할지언정', '할찌언정'], ['할진대', '할찐대']]);
    expect(P('갈비')).toBe('갈비');
    expect(P('갈데', { tenseAfter: [0] })).toBe('갈떼');
    expect(P('먹을수', { tenseAfter: [1] })).toBe('머글쑤');
    expect(koRomanizeWord('갈게')).toBe('galge');
    expect(koRomanizeWord('할수록')).toBe('halsurok');
  });
  it('koPronouncePhrase: cross-word rules', () => {
    expect(koPronouncePhrase(['할', '일'])).toEqual(['할', '릴']);
    expect(koPronouncePhrase(['옷', '안'])).toEqual(['오', '단']);
    expect(koPronouncePhrase(['할', '수'])).toEqual(['할', '쑤']);
    expect(koPronouncePhrase(['할', '수는'])).toEqual(['할', '쑤는']);
    expect(koPronouncePhrase(['달', '수박'])).toEqual(['달', '수박']);
    expect(koPronouncePhrase(['달', '수'], { prospective: [true] })).toEqual(['달', '쑤']);
    expect(koPronouncePhrase(['할', '수'], { prospective: [false] })).toEqual(['할', '수']);
    expect(koPronouncePhrase(['옷', '입다'])).toEqual(['온', '닙따']);
    expect(koPronouncePhrase(['옷', '한', '벌'])).toEqual(['오', '탄', '벌']);
    expect(koPronouncePhrase(['국', '물'])).toEqual(['궁', '물']);
    expect(koPronouncePhrase(['학교', '가다'])).toEqual(['학꾜', '가다']);
    expect(koPronouncePhrase(['할', '일'], { insertN: false })).toEqual(['하', '릴']);
    expect(koPronouncePhrase([])).toEqual([]);
    expect(koPronouncePhrase(['한국'])).toEqual(['한국']);
  });
  it('nextWord leaves this word unchanged by a following prospective tensing (documented)', () => {
    expect(P('할', { nextWord: '수' })).toBe('할');
  });
});

describe('fix batch 3: the general rule is the default; the h-keeping exception is only for nominal: true', () => {
  it('without options a ㅎ merges and 히 / 이 palatalise', () => {
    const t: Array<[string, string]> = [
      ['닫히다', 'dachida'], ['굳히다', 'guchida'], ['붙이다', 'buchida'], ['같이', 'gachi'], ['해돋이', 'haedoji'], ['좋고', 'joko'], ['잡혀', 'japyeo'],
      ['낳지', 'nachi'], ['않다', 'anta'], ['많다', 'manta'], ['놓다', 'nota'], ['입학', 'ipak'], ['국화', 'gukwa'],
    ];
    for (const [w, r] of t) expect(koRomanizeWord(w), w).toBe(r);
  });
  it('nominal: true keeps the h after ㄱ ㄷ ㅂ', () => {
    expect(koRomanizeWord('묵호', { nominal: true })).toBe('mukho');
    expect(koRomanizeWord('집현전', { nominal: true })).toBe('jiphyeonjeon');
    expect(koRomanizeWord('국화', { nominal: true })).toBe('gukhwa');
    expect(koRomanizeWord('입학', { nominal: true })).toBe('iphak');
    expect(koRomanizeWord('좋고', { nominal: true })).toBe('joko'); // a ㅎ final is always written aspirated
    expect(koRomanizeWord('낳지', { nominal: true })).toBe('nachi');
    expect(koPronunciation('집현전', { nominal: true }).transliteration).toBe('jiphyeonjeon');
    expect(koPronunciation('잡혀').transliteration).toBe('japyeo');
  });
  it('names the scheme', () => {
    expect(KO_ROMANIZATION_SCHEME).toBe('Revised Romanization (2000)');
    expect(koPronunciation('나라').notes?.at(-1)).toContain('Revised Romanization (2000)');
  });
});

describe('fix batch 2: morpheme boundaries (제15항, 제29항)', () => {
  const B = (w: string, boundaries: number[], extra = {}) => P(w, { boundaries, ...extra });
  it('with boundaries the compounds fall out by rule, with no table', () => {
    expect(B('겉옷', [1])).toBe('거돋');
    expect(B('헛웃음', [1])).toBe('허두슴');
    expect(B('젖어미', [1])).toBe('저더미');
    expect(B('값어치', [1])).toBe('가버치');
    expect(B('값있는', [1])).toBe('가빈는');
    expect(B('맛있다', [1])).toBe('마딛따');
    expect(B('맛없다', [1])).toBe('마덥따');
    expect(B('솜이불', [1])).toBe('솜니불');
    expect(B('꽃잎', [1])).toBe('꼰닙');
    expect(B('색연필', [1])).toBe('생년필');
    expect(B('서울역', [2])).toBe('서울력');
    expect(B('한여름', [1])).toBe('한녀름');
    expect(B('눈요기', [1])).toBe('눈뇨기');
    expect(B('물엿', [1])).toBe('물렫');
  });
  it('without boundaries a particle stays a particle, and the table is the fallback', () => {
    expect(P('옷이')).toBe('오시');
    expect(P('겉옷')).toBe('거돋');
    expect(P('꽃잎')).toBe('꼰닙');
    expect(P('꽃이')).toBe('꼬치');
    expect(B('꽃이', [])).toBe('꼬치');
    expect(B('옷이', [])).toBe('오시');
  });
  it('words said together carry the neutralised final (제15항)', () => {
    expect(koPronouncePhrase(['꽃', '위'])).toEqual(['꼬', '뒤']);
    expect(koPronouncePhrase(['밭', '아래'])).toEqual(['바', '다래']);
    expect(koPronouncePhrase(['늪', '앞'])).toEqual(['느', '밥']);
    expect(koPronouncePhrase(['닭', '앞에'])).toEqual(['다', '가페']);
    expect(koPronouncePhrase(['값', '어치'])).toEqual(['가', '버치']);
    expect(koPronouncePhrase(['맛', '있다'])).toEqual(['마', '딛따']);
    expect(koPronouncePhrase(['꽃', '잎'])).toEqual(['꼰', '닙']);
  });
});

describe('fix batch 2: stem exceptions reach inflected forms', () => {
  it('밟- before a consonant is said with ㅂ', () => {
    table([['밟습니다', '밥씀니다'], ['밟는', '밤는'], ['밟지', '밥찌'], ['밟고', '밥꼬'], ['밟다', '밥따'], ['밟게', '밥께'], ['밟았다', '발받따'], ['밟아', '발바'], ['밟히다', '발피다']]);
  });
  it('넓죽- and 넓둥글-', () => {
    table([['넓죽하다', '넙쭈카다'], ['넓죽한', '넙쭈칸'], ['넓죽하게', '넙쭈카게'], ['넓둥글다', '넙뚱글다'], ['넓다', '널따'], ['넓은', '널븐']]);
  });
  it('the closed list of prospective endings also catches a stem in ㄹ + -게 unless tenseAfter says otherwise', () => {
    expect(P('길게')).toBe('길께');
    expect(P('길게', { tenseAfter: [] })).toBe('길게');
    expect(P('넓둥글게', { tenseAfter: [] })).toBe('넙뚱글게');
  });
  it('맛없- and 멋없- carry a neutralised ㅅ; 맛있- and 멋있- give the accepted variant', () => {
    table([['맛없어요', '마덥써요'], ['맛없는', '마덤는'], ['맛없다', '마덥따'], ['맛없었다', '마덥썯따'], ['맛없고', '마덥꼬'], ['멋없다', '머덥따'], ['멋없는', '머덤는'], ['멋없어요', '머덥써요'], ['멋없게', '머덥께']]);
    table([['맛있어요', '마시써요'], ['맛있는', '마신는'], ['맛있다', '마싣따'], ['맛있었다', '마시썯따'], ['멋있는', '머신는'], ['멋있다', '머싣따'], ['멋있어요', '머시써요'], ['멋있게', '머싣께']]);
  });
});

describe('fix batch 2: notes name only what was used', () => {
  it('a dictionary respelling that differs lists no rule notes', () => {
    const s = koPronunciation('서울역', { dictionary: '[서울력]' });
    expect(s.transliteration).toBe('seoullyeok');
    expect(s.notes?.some((n) => n.includes('liaison'))).toBe(false);
    expect(s.notes?.[0]).toContain("dictionary's");
    const d = koPronunciation('나라', { dictionary: '[나나]' });
    expect(d.notes).toHaveLength(3);
    expect(d.notes?.[0]).toContain("dictionary's");
    expect(d.notes?.[1]).toContain('Said differently from what the spelling rules give (dictionary)');
    expect(d.notes?.some((n) => n.includes('assimilation') || n.includes('liaison'))).toBe(false);
  });
  it('a dictionary respelling equal to the rules keeps the rule notes', () => {
    const s = koPronunciation('먹는', { dictionary: '멍는' });
    expect(s.notes?.[0]).toContain("dictionary's");
    expect(s.notes).toContain('ㄱ before ㄴ is said ㅇ: nasal assimilation');
    expect(s.transliteration).toBe('meongneun');
  });
});

describe('fix batch 2: syllable rules read plainly', () => {
  it('names each part and which final is said', () => {
    expect(syllablesOf('아')[0].rule).toBe('ㅇ is silent at the start of a syllable; vowel ㅏ (a)');
    expect(syllablesOf('학')[0].rule).toBe('starts with ㅎ (h); vowel ㅏ (a); final ㄱ');
    expect(syllablesOf('꽃')[0].rule).toBe('starts with ㄲ (kk); vowel ㅗ (o); final ㅊ is said ㄷ at the end of a word');
    expect(syllablesOf('읽')[0].rule).toBe('ㅇ is silent at the start of a syllable; vowel ㅣ (i); final ㄺ is two letters, ㄹ and ㄱ; only ㄱ is said at the end of a word');
    expect(syllablesOf('값')[0].rule).toContain('ㅂ and ㅅ');
  });
});
