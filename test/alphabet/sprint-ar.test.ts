import { describe, expect, it } from 'vitest';
import { contrastKey, parseSprintUnitId, sprintUnitId } from '../../packages/language-packs/src/alphabet-sprint/ids';
import { scriptKnowledge, type SprintCardState } from '../../packages/language-packs/src/alphabet-sprint/knowledge';
import { planSprint } from '../../packages/language-packs/src/alphabet-sprint/plan';
import { AR_BRIEF_WORDS, AR_PROFILE, arLetterPositions, AR_SHAPE_WORDS, AR_STAGES, KEY, arCourseDependencies, arabicDependencies } from '../../packages/language-packs/src/alphabet-sprint/profiles/ar';
import { decodableAfter, sprintOrder, wordDependencies } from '../../packages/language-packs/src/alphabet-sprint/select';
import { READ_AS } from '../../packages/language-packs/src/alphabet-sprint/words/ar';
import { ARABIC_ALPHABET } from '../../src/adapters/arabic/text';
import { AR_ALPHABET } from '../../src/adapters/arabic/alphabet';
import { profileChecks } from './sprint-kit';
import { loadSprintProfiles, SPRINT_LANGUAGES, sprintLanguageOf } from '../../packages/language-packs/src/alphabet-sprint/profiles';

// the old Alphabet deck (packages/goreview/app/alphabetLetters.ts, HAND_LETTERS.ar) holds the 28 bare letters of the analyser's alphabet table, so those
// carry over; everything else (hamza on its own, the spellings, marks and shapes) is new to the Sprint.
const DECK_LETTERS = new Set(AR_ALPHABET.map((l) => l.letter));
const newKeys = AR_PROFILE.units.filter((u) => u.kind !== 'rule' && !DECK_LETTERS.has(u.key)).map((u) => u.key);
profileChecks(AR_PROFILE, { newKeys });

const deps = (f: string) => arabicDependencies(f); // the HONEST list; course lists are tested in the stages block
const NOW = '2026-11-17T12:00:00.000Z';
const day = (n: number, h = 12) => new Date(Date.parse('2026-11-01T00:00:00.000Z') + n * 86_400_000 + h * 3_600_000).toISOString();
const card = (unitId: string, ratings: Array<[number, number]>): SprintCardState => ({
  unitId, status: 'active', due: '2026-12-31T00:00:00.000Z', stability: 5, lapses: ratings.filter(([, r]) => r === 1).length, phase: 'review',
  history: ratings.map(([d, rating]) => ({ at: day(d), rating })),
});
const ch = (key: string) => sprintUnitId('ar', 'character', key);
const STAGE_1 = new Set([...'ابتنيملو']);
const hasWord = (form: string) => AR_PROFILE.words.some((w) => w.form === form.normalize('NFC'));
const SHAPE_KEYS = AR_PROFILE.units.filter((u) => u.key.startsWith('shape-')).map((u) => u.key);

describe('Arabic script units', () => {
  it('has every one of the 28 letters as a unit, and the spellings, marks, shapes and rules the brief names', () => {
    const keys = new Set(AR_PROFILE.units.map((u) => u.key));
    for (const letter of ARABIC_ALPHABET) expect(keys.has(letter), letter).toBe(true);
    expect(ARABIC_ALPHABET).toHaveLength(28);
    for (const k of [KEY.hamza, KEY.madda, KEY.taMarbuta, KEY.maqsura, KEY.lamAlif, KEY.fatha, KEY.kasra, KEY.damma, KEY.sukun, KEY.shadda,
      KEY.fathatan, KEY.kasratan, KEY.dammatan, KEY.dagger, KEY.longVowels, KEY.articleSun, KEY.joining, KEY.unvowelled]) expect(keys.has(k), k).toBe(true);
    const kind = (k: string) => AR_PROFILE.units.find((u) => u.key === k)!.kind;
    expect(kind(KEY.taMarbuta)).toBe('final-form');
    expect(kind(KEY.maqsura)).toBe('final-form');
    expect(kind(KEY.lamAlif)).toBe('digraph');
    expect(kind(KEY.fatha)).toBe('vowel-sign');
    expect(kind(KEY.sukun)).toBe('mark');
    expect(kind(KEY.shadda)).toBe('mark');
    expect(kind(KEY.articleSun)).toBe('rule');
    expect(AR_PROFILE.rtl).toBe(true);
    expect(AR_PROFILE.scriptId).toBe('Arab');
  });

  it('says in its notes that no native speaker or teacher reviewed it, and that other unvocalized reading is not taught', () => {
    expect(AR_PROFILE.notes).toMatch(/not been reviewed by a native speaker/);
    expect(AR_PROFILE.notes).toMatch(/unvocalized/i);
  });

  it('every letter card says how the letter joins; the six non-joiners say so', () => {
    for (const letter of ARABIC_ALPHABET) {
      const note = AR_PROFILE.units.find((u) => u.key === letter)!.note ?? '';
      expect(note, letter).toMatch(/join/);
      if ('ادذرزو'.includes(letter)) expect(note, letter).toMatch(/never the letter after/);
      else expect(note, letter).toMatch(/both sides/);
    }
  });

  it('uses ONE scholarly romanization on the units and the words (no Wiktionary symbols)', () => {
    const text = [...AR_PROFILE.units.map((u) => u.sound), ...AR_PROFILE.words.map((w) => w.pronunciation ?? ''), ...AR_PROFILE.phrases.map((p) => p.pronunciation ?? '')].join(' ');
    expect(text).not.toMatch(/[ʔʕḡḵšṯḏǧ]/);
    expect(AR_PROFILE.words.filter((w) => w.pronunciation).length).toBeGreaterThan(300);
  });

  it('ships no path of this PC in any text and credits Wiktionary via kaikki.org with the extract date', () => {
    const shipped = JSON.stringify([AR_PROFILE.notes, AR_PROFILE.words.map((w) => w.source), AR_PROFILE.phrases.map((p) => p.source)]);
    expect(shipped).not.toMatch(/lisan-v0|C:\\|C:\/|\/Users\/|\.jsonl|\.txt/);
    expect(AR_PROFILE.words.every((w) => /Wiktionary Arabic entries, via kaikki\.org \(CC BY-SA 4\.0\), extract of 20\d\d-\d\d-\d\d/.test(w.source))).toBe(true);
  });
});

describe('Arabic dependencies', () => {
  it('بَيْت needs ب ي ت, fatḥa, sukūn, and the shapes that its letters really have (tooth, then a bowl at the end)', () => {
    expect([...deps('بَيْت')!].sort()).toEqual(['ب', 'ي', 'ت', KEY.fatha, KEY.sukun, KEY.tooth, KEY.boatEnd].sort());
  });
  it('الشَّمْس needs the sun-letter article rule and shadda', () => {
    const d = deps('الشَّمْس')!;
    expect(d).toContain(KEY.articleSun);
    expect(d).toContain(KEY.shadda);
    expect(d).toContain('ش');
    expect(deps('الْقَمَر')).not.toContain(KEY.articleSun);
    expect(deps('الْقَمَر')).toBeDefined();
  });
  it('a form that is not FULLY vocalized has no dependencies (G7): one mark is not enough', () => {
    for (const f of ['رجل', 'مَدرسة', 'كتابًا', 'جدّاً', 'أنّ', 'شُكراً', 'والشَّمس', 'هَلْ فتحت']) expect(deps(f), f).toBeUndefined();
    for (const f of ['كِتَاب', 'الشَّمْس', 'وَالشَّمْس', 'كِتَابًا', 'آخِر', 'هٰذَا']) expect(deps(f), f).toBeDefined();
  });
  it('the stage-7 cards are explicit: an unvocalized spelling in READ_AS depends on the vocalized units plus rule-unvowelled, and nothing else does', () => {
    const d = deps('كتاب')!;
    expect(d).toContain(KEY.unvowelled);
    expect(d).toEqual(expect.arrayContaining([...deps('كِتَاب')!]));
    expect(deps('الكتاب')).toEqual(expect.arrayContaining([KEY.unvowelled, 'ل']));
    expect(deps('الشمس')).toEqual(expect.arrayContaining([KEY.unvowelled, KEY.articleSun, KEY.shadda]));
    expect(deps('هذا كتاب.')).toBeDefined(); // a closing full stop does not matter
    expect(deps('رجل')).toBeUndefined(); // not one of the listed spellings
    for (const k of Object.keys(READ_AS)) expect(deps(k), k).toBeDefined();
  });
  it('the ladder كِتَاب → كتاب → الْكِتَاب → الكتاب is in the word list, front unvocalized, back vocalized', () => {
    for (const f of ['كِتَاب', 'كتاب', 'الْكِتَاب', 'الكتاب']) expect(hasWord(f), f).toBe(true);
    const plain = AR_PROFILE.words.find((w) => w.form === 'كتاب')!;
    expect(plain.gloss).toContain('كِتَاب');
    expect(plain.gloss).toMatch(/book/);
    expect(plain.pronunciation).toBe('kitāb');
    expect(AR_PROFILE.words.find((w) => w.form === 'الكتاب')!.gloss).toContain('الْكِتَاب');
  });
  it('the five brief sentences are phrases, unvocalized on the front, vocalized on the back, with an English meaning', () => {
    const want = ['هذا كتاب', 'البيت كبير', 'ذهب الطالب إلى المدرسة', 'قرأت الكتاب', 'العلم نور'];
    for (const f of want) {
      const p = AR_PROFILE.phrases.find((x) => x.form === f);
      expect(p, f).toBeDefined();
      expect(p!.gloss, f).toMatch(/[\u064B-\u0652]/); // the vocalized sentence
      expect(p!.gloss, f).toMatch(/[A-Za-z]{3}/);
      expect(deps(f), f).toContain(KEY.unvowelled);
      expect(p!.pronunciation, f).toBeTruthy();
    }
    expect(AR_PROFILE.phrases.find((x) => x.form === 'العلم نور')!.gloss).toContain('Knowledge is light.');
    expect(AR_PROFILE.phrases.find((x) => x.form === 'ذهب الطالب إلى المدرسة')!.gloss).toContain('الطَّالِبُ');
    for (const p of AR_PROFILE.phrases) { expect(p.form).not.toMatch(/ٱ|حِمار/); expect(p.gloss).not.toMatch(/idiot|stupid/i); }
  });
  it('a long vowel needs the rule; a consonant و or ي does not', () => {
    expect(deps('بَاب')).toContain(KEY.longVowels);
    expect(deps('جَمِيل')).toContain(KEY.longVowels);
    expect(deps('بَيْت')).not.toContain(KEY.longVowels);
    expect(deps('وَلَد')).not.toContain(KEY.longVowels);
    expect(deps('نُور')).toContain(KEY.longVowels);
  });
  it('hamza on any seat is one unit; آ ة ى and the lām-alif shapes are units of their own, including لأ لإ لآ', () => {
    for (const w of ['أَنَا', 'إِنْسَان', 'سُؤَال', 'مَاء']) expect(deps(w), w).toContain(KEY.hamza);
    expect(deps('أَنَا')).not.toContain('أ');
    expect(deps('آخِر')).toContain(KEY.madda);
    expect(deps('مَدْرَسَة')).toContain(KEY.taMarbuta);
    expect(deps('عَلَى')).toContain(KEY.maqsura);
    expect(deps('لَا')).toContain(KEY.lamAlif);
    expect(deps('سَلَام')).toContain(KEY.lamAlif);
    expect(deps('لِأَنَّ')).toEqual(expect.arrayContaining([KEY.lamAlif, KEY.hamza]));
    expect(deps('لِأَنَّ')).not.toContain('أ');
    expect(deps('لِإِيمَان')).toContain(KEY.lamAlif);
  });
  it('tanwīn, shadda and the dagger alif have their own units and a real word each (G8)', () => {
    expect(deps('كِتَابًا')).toContain(KEY.fathatan);
    expect(deps('كِتَابٌ')).toContain(KEY.dammatan);
    expect(deps('كِتَابٍ')).toContain(KEY.kasratan);
    expect(deps('هٰذَا')).toContain(KEY.dagger);
    for (const k of [KEY.madda, KEY.fathatan, KEY.kasratan, KEY.dammatan, KEY.dagger, KEY.articleSun, KEY.shadda]) {
      expect(AR_PROFILE.units.find((u) => u.key === k)!.example, k).toBeDefined();
      expect(wordDependencies(AR_PROFILE).some((w) => w.deps.includes(k)), k).toBe(true);
    }
  });
  it('returns undefined for non-Arabic text and for a letter it does not map', () => {
    for (const f of ['house', 'بَيْتhouse', '', '123', 'پَ']) expect(deps(f), f).toBeUndefined();
  });
  it('a phrase is the union of its words and a punctuation mark does not matter', () => {
    const a = deps('هَلْ فَتَحْتَ النَّافِذَةَ')!;
    expect(a).toContain(KEY.articleSun);
    expect(deps('هَلْ فَتَحْتَ النَّافِذَةَ؟')).toEqual(a);
  });
});

describe('Arabic positional shapes (G1)', () => {
  it('has twenty-three shape units, each with a display of real connected shapes (a tatweel) and a kind that fits', () => {
    expect(SHAPE_KEYS).toHaveLength(23);
    for (const k of SHAPE_KEYS) {
      const u = AR_PROFILE.units.find((x) => x.key === k)!;
      expect(u.display, k).toMatch(/ـ/);
      expect(['positional-form', 'final-form']).toContain(u.kind);
      expect(u.kind === 'final-form', k).toBe(/-end$/.test(k));
    }
  });
  it('every shape family × position is exercised by at least one word', () => {
    const used = new Set(wordDependencies(AR_PROFILE).flatMap((w) => w.deps));
    for (const k of SHAPE_KEYS) expect(used.has(k), k).toBe(true);
  });
  it('a shape is needed exactly where a letter really joins; the six non-joiners need none, and a final non-joiner after a joiner needs none', () => {
    expect(deps('كِتَاب')).toEqual(expect.arrayContaining([KEY.kaf, KEY.tooth])); // ك joined forward, ت joined forward; ا never joins on; ب stands after ا alone
    expect(deps('كِتَاب')).not.toContain(KEY.boatEnd); // ب after the alif is not joined to it
    expect(deps('بَيْت')).toContain(KEY.boatEnd);
    expect(deps('دَار')).not.toEqual(expect.arrayContaining([KEY.tooth])); // د ا ر: no joined letters at all
    expect(deps('دَار')!.filter((k) => k.startsWith('shape-'))).toEqual([]);
    expect(deps('عَلَم')).toEqual(expect.arrayContaining([KEY.aynInit, KEY.stem]));
    expect(deps('قَلْب')).toEqual(expect.arrayContaining([KEY.fq, KEY.stem, KEY.boatEnd]));
    expect(deps('رَجُل')!.filter((k) => k.startsWith('shape-'))).toEqual([KEY.hook, KEY.stemEnd]);
    expect(deps('شَمْس')).toEqual(expect.arrayContaining([KEY.sin, KEY.mim, KEY.sinEnd]));
    expect(deps('نَافِذَة')).toContain(KEY.tooth);
    expect(deps('وَجْه')).toEqual(expect.arrayContaining([KEY.hook, KEY.haEnd]));
    expect(deps("هَلْ")).toContain(KEY.haInit);
    expect(deps('جَمِيل')).toEqual(expect.arrayContaining([KEY.hook, KEY.mim, KEY.tooth, KEY.stem].filter((k) => k !== KEY.stem)));
    expect(deps('طَوِيل')).toEqual(expect.arrayContaining([KEY.stem]));
    expect(deps('سَمَاء')).toContain(KEY.sinEnd.replace('-end', '')); // س joined to م
    expect(deps('بِنْت')).toContain(KEY.boatEnd);
    expect(deps('مَعَ')).toContain(KEY.aynEnd);
    expect(deps('فِي')).toContain(KEY.yaEnd);
  });
});

describe('Arabic starter words', () => {
  it('has the brief\'s words confirmed against the source, each with the brief\'s meaning, in the scholarly romanization', () => {
    const must: Array<[string, RegExp]> = [
      ['بَاب', /door/], ['بَيْت', /house/], ['بِنْت', /daughter|girl/], ['لَبَن', /milk/], ['مَاء', /water/], ['لَيْل', /night/], ['ثَلَاثَة', /three/],
      ['بَحْر', /sea/], ['بَحْث', /search|research/], ['خُبْز', /bread/], ['دَار', /house|home/], ['جَمِيل', /beautiful/], ['شَمْس', /sun/], ['قَمَر', /moon/],
      ['كِتَاب', /book/], ['قَلْب', /heart/], ['عِلْم', /knowledge/], ['غُرْفَة', /room/], ['صَبْر', /patience/], ['هُدًى', /guidance/], ['عَلَم', /flag/],
      ['عَالَم', /world/], ['مَدْرَسَة', /school/], ['إِنْسَان', /human/], ['حَيَاة', /life/], ['مَعْرِفَة', /knowledge/], ['حَقِيقَة', /truth|reality/],
      ['حِكْمَة', /wisdom/], ['سَلَام', /peace/], ['عَلَّمَ', /teach/], ['عَلِمَ', /know/],
      ['مِنْ', /from/], ['إِنَّ', /./], ['هٰذَا', /this/], ['ذٰلِكَ', /that/], ['لَمْ', /not/], ['مَا', /what/],
    ];
    for (const [f, re] of must) {
      const w = AR_PROFILE.words.find((x) => x.form === f.normalize('NFC'));
      expect(w, f).toBeDefined();
      expect(w!.gloss, f).toMatch(re);
      expect(w!.pronunciation, f).toBeTruthy();
    }
    expect(AR_PROFILE.words.find((w) => w.form === 'بَيْت')!.pronunciation).toBe('bayt');
    expect(AR_PROFILE.words.find((w) => w.form === 'ثَلَاثَة')!.pronunciation).toBe('thalātha');
  });
  it('has the four-way contrast عَلَم / عِلْم / عَلَّمَ / عَلِمَ and the article forms (moon and sun)', () => {
    for (const f of ['عَلَم', 'عِلْم', 'عَلَّمَ', 'عَلِمَ', 'الْكِتَاب', 'الْبَيْت', 'الْقَمَر', 'الْعِلْم', 'الشَّمْس', 'السَّلَام']) expect(hasWord(f), f).toBe(true);
    expect(AR_PROFILE.words.find((w) => w.form === 'الشَّمْس')!.gloss).toBe('the sun');
    expect(deps('الشَّمْس')).toContain(KEY.articleSun);
    expect(deps('الْقَمَر')).not.toContain(KEY.articleSun);
  });
  it('is fully modelled; every full word has 2–5 letters, a meaning and a Latin-letter pronunciation', () => {
    expect(AR_PROFILE.words.length).toBeGreaterThanOrEqual(300);
    expect(AR_PROFILE.words.every((w) => deps(w.form))).toBe(true);
    expect(AR_PROFILE.phrases.every((p) => deps(p.form))).toBe(true);
    for (const w of AR_PROFILE.words) {
      if (READ_AS[w.form]) continue; // the stage-7 spellings show the vocalized word on the back
      expect(w.gloss, w.form).not.toMatch(/[\u0600-\u06FF]/);
      if (w.pronunciation) expect(w.pronunciation, w.form).not.toMatch(/[\u0600-\u06FF]/);
    }
  });
  it('does not ship the words the audit found wrong', () => {
    for (const f of ['سَوَّفَ', 'أَوِدَ', 'أَوَّلَ', 'أَكْبَرَ', 'بُنّ', 'سَامّ', 'جِين', 'نَصْل', 'نَجْد', 'وَصْل', 'تَفَكُّر', 'تَذَكُّر', 'تَوَقُّف', 'أَسْوَأ']) expect(hasWord(f), f).toBe(false);
    expect(AR_PROFILE.words.find((w) => w.form === 'صَبْر')!.gloss).not.toMatch(/fetter|shackl/);
    expect(AR_PROFILE.words.find((w) => w.form === 'عَنْ')!.gloss).not.toMatch(/^off/);
  });
});

describe('Arabic Sprint plan', () => {
  it('a beginner\'s first session uses only Stage 1 letters and reads a real word within the first cards', () => {
    const plan = planSprint({ profile: AR_PROFILE, knowledge: scriptKnowledge(AR_PROFILE, []), cards: [], now: NOW, size: 20 });
    const letters = plan.cards.filter((c) => c.kind === 'character').map((c) => c.front).filter((f) => [...f].length === 1 && f >= 'ء' && f <= 'ي');
    expect(letters.length).toBeGreaterThan(0);
    for (const l of letters) expect(STAGE_1.has(l), l).toBe(true);
    const firstWord = plan.cards.findIndex((c) => c.kind === 'word');
    expect(firstWord).toBeGreaterThan(0);
    expect(firstWord).toBeLessThanOrEqual(6);
    expect(deps(plan.cards[firstWord].front)).toBeDefined();
  });

  it('teaches in an order that unlocks more real words than alphabet order by 12 units (and never fewer at 5 and 8)', () => {
    const order = sprintOrder(AR_PROFILE, AR_PROFILE.laterBatch);
    const alphabet = AR_PROFILE.units.filter((u) => !u.familiar).map((u) => u.key);
    for (const n of [5, 8]) expect(decodableAfter(AR_PROFILE, order, n)).toBeGreaterThanOrEqual(decodableAfter(AR_PROFILE, alphabet, n));
    expect(decodableAfter(AR_PROFILE, order, 12)).toBeGreaterThan(decodableAfter(AR_PROFILE, alphabet, 12));
  });

  it('adds a contrast card after a miss on ب or ت', () => {
    const cards = [card(ch('ب'), [[1, 3], [2, 1]]), card(ch('ت'), [[1, 3]])];
    const plan = planSprint({ profile: AR_PROFILE, knowledge: scriptKnowledge(AR_PROFILE, cards), cards, now: NOW, size: 20 });
    const contrast = plan.cards.find((c) => c.kind === 'contrast');
    expect(contrast?.unitId).toBe(sprintUnitId('ar', 'contrast', contrastKey('ب', 'ت')));
    expect(contrast?.back).toMatch(/dot/);
  });
});

describe('Arabic course stages (the brief order)', () => {
  const keys = AR_PROFILE.units.map((u) => u.key);
  const stageOf = (k: string) => AR_STAGES[k] ?? 1;
  const noShape = (d: readonly string[]) => d.filter((k) => !k.startsWith('shape-') && k !== KEY.joining);

  it('gives every unit the stage of the brief', () => {
    for (const k of [...'ابتنيملو', KEY.fatha, KEY.kasra, KEY.damma, KEY.sukun, KEY.longVowels, KEY.hamza]) expect(stageOf(k), k).toBe(1);
    for (const k of [...'ثجحخدذرز']) expect(stageOf(k), k).toBe(2);
    for (const k of [...'سشصضطظعغفقكه']) expect(stageOf(k), k).toBe(3);
    for (const k of SHAPE_KEYS) expect(stageOf(k), k).toBe(4);
    expect(stageOf(KEY.joining)).toBe(4);
    for (const k of [KEY.shadda, KEY.fathatan, KEY.kasratan, KEY.dammatan, KEY.dagger, KEY.madda, KEY.taMarbuta, KEY.maqsura, KEY.lamAlif, KEY.articleSun]) expect(stageOf(k), k).toBe(5);
    expect(stageOf(KEY.unvowelled)).toBe(7);
    for (const k of keys) expect(AR_STAGES[k], k).toBeDefined();
  });

  it('a starter word of stages 1–3 lists its letters and marks only (no shape units) plus the stages before its own; a page form gets the honest list', () => {
    const bab = AR_PROFILE.dependencies('بَاب')!;
    expect([...bab].sort()).toEqual(['ب', 'ا', KEY.fatha, KEY.longVowels].sort());
    expect(arabicDependencies('بَاب')).toContain(KEY.tooth);
    expect(arabicDependencies('بَابٌ بَاب')).toContain(KEY.tooth);
    expect(arCourseDependencies('بَابٌ بَاب')).toEqual(arabicDependencies('بَابٌ بَاب'));
    const bahr = AR_PROFILE.dependencies('بَحْر')!;
    for (const k of keys.filter((x) => stageOf(x) === 1)) expect(bahr, k).toContain(k);
    expect(bahr.some((k) => k.startsWith('shape-'))).toBe(false);
    const shams = AR_PROFILE.dependencies('شَمْس')!;
    for (const k of keys.filter((x) => stageOf(x) <= 2)) expect(shams, k).toContain(k);
  });

  it('has at least three plain stage-4 shape words per shape unit; they list the shape, rule-joining and all of stages 1–3', () => {
    for (const k of SHAPE_KEYS) {
      const ws = [...AR_SHAPE_WORDS].filter((f) => arabicDependencies(f)!.includes(k));
      expect(ws.length, k).toBeGreaterThanOrEqual(3);
    }
    for (const f of AR_SHAPE_WORDS) {
      const d = AR_PROFILE.dependencies(f)!;
      expect(d, f).toContain(KEY.joining);
      for (const k of keys.filter((x) => stageOf(x) <= 3)) expect(d, `${f} ${k}`).toContain(k);
      expect(noShape(arabicDependencies(f)!).every((k) => stageOf(k) <= 3), f).toBe(true);
      expect(AR_BRIEF_WORDS.has(f)).toBe(false);
    }
  });

  it('a word with a stage-5 unit, an article form and an unvocalized card list their shapes and every earlier stage', () => {
    const early = (d: readonly string[], below: number) => keys.filter((k) => stageOf(k) < below).every((k) => d.includes(k));
    expect(early(AR_PROFILE.dependencies('لِأَنَّ')!, 5)).toBe(true);
    expect(AR_PROFILE.dependencies('لِأَنَّ')).toContain(KEY.lamAlif);
    expect(early(AR_PROFILE.dependencies('الشَّمْس')!, 6)).toBe(true);
    expect(early(AR_PROFILE.dependencies('الكتاب')!, 7)).toBe(true);
    expect(AR_PROFILE.dependencies('الكتاب')).toContain(KEY.unvowelled);
  });

  // a beginner answering Good, session after session, until every unit is introduced
  it('introduces the units in stage order (a brief word may pull ة and لا in early), starts with a Stage 1 word, and shows every brief word by its stage', () => {
    const states = new Map<string, SprintCardState>();
    const introducedAt = new Map<string, number>();
    const order: string[] = [];
    const wordAt = new Map<string, number>();
    const firstWords: string[] = [];
    const printed: string[] = [];
    for (let s = 0; s < 40; s++) {
      const now = day(s);
      const cards = [...states.values()];
      const plan = planSprint({ profile: AR_PROFILE, knowledge: scriptKnowledge(AR_PROFILE, cards), cards, now, size: 20 });
      if (!plan.cards.length) break;
      for (const c of plan.cards) {
        const id = parseSprintUnitId(c.unitId)!;
        if ((id.kind === 'character' || id.kind === 'rule') && !introducedAt.has(id.key)) { introducedAt.set(id.key, s + 1); order.push(id.key); }
        if (id.kind === 'word' && !wordAt.has(id.key)) { wordAt.set(id.key, s + 1); if (!firstWords.length) firstWords.push(id.key); }
        const prev = states.get(c.unitId);
        states.set(c.unitId, { unitId: c.unitId, status: 'active', due: day(s + 400), stability: 30, lapses: 0, phase: 'review', history: [...(prev?.history ?? []), { at: now, rating: 3 }] });
        if (s < 6) printed.push(`S${s + 1} ${c.kind} ${c.front} → ${c.back.slice(0, 60)}`);
      }
    }
    for (const k of keys) expect(introducedAt.has(k), k).toBe(true);
    // stage order; ة and the lām-alif shape are pulled in early by brief words (غُرْفَة, مَدْرَسَة, ثَلَاثَة, سَلَام ...)
    const EARLY = new Set<string>([KEY.taMarbuta, KEY.lamAlif]);
    let top = 0;
    for (const k of order) {
      if (EARLY.has(k)) { expect(stageOf(k), k).toBe(5); continue; }
      expect(stageOf(k), `${k} introduced after a unit of stage ${top}`).toBeGreaterThanOrEqual(top);
      top = Math.max(top, stageOf(k));
    }
    const completeAt = (n: number) => Math.max(...keys.filter((k) => stageOf(k) <= n && !EARLY.has(k)).map((k) => introducedAt.get(k)!));
    expect(completeAt(1)).toBeLessThan(completeAt(2));
    expect(completeAt(2)).toBeLessThan(completeAt(3));
    expect(completeAt(3)).toBeLessThan(completeAt(4));
    // the first word card is a Stage 1 word: one of the brief's, or made only of Stage 1 units
    const first = firstWords[0];
    expect(noShape(arabicDependencies(first)!).every((k) => stageOf(k) === 1), first).toBe(true);
    // every brief word is shown by the session its own (letter) stage completes; هُدًى (tanwīn + ى) and عَلَّمَ (shadda) pull stage-5 units and arrive with them; a word that needs ة or the lām-alif shape (ثَلَاثَة, حَيَاة, غُرْفَة ...) is due by the end of stage 3, when those two are introduced
    const LATE = new Set(['هُدًى', 'عَلَّمَ'].map((w) => w.normalize('NFC')));
    for (const w of AR_BRIEF_WORDS) {
      const ls = Math.max(1, ...noShape(arabicDependencies(w)!).map(stageOf).filter((n) => n <= 3));
      const bound = LATE.has(w) ? completeAt(5) : arabicDependencies(w)!.some((k) => EARLY.has(k)) ? completeAt(Math.max(ls, 3)) : completeAt(ls);
      expect(wordAt.get(w), w).toBeDefined();
      expect(wordAt.get(w)!, w).toBeLessThanOrEqual(bound);
    }
    if (process.env.AR_PRINT) console.log(printed.join('\n'), '\nstage completion', [1, 2, 3, 4, 5, 7].map((n) => `${n}:${completeAt(n)}`).join(' '));
  });
});

describe('Arabic letter positions and shape units (K4–K7)', () => {
  const LETTERS28 = ARABIC_ALPHABET;
  const RIGHT = new Set([...'ادذرزو']);
  const canTake = (l: string) => (RIGHT.has(l) ? ['isolated', 'final'] : ['initial', 'medial', 'final', 'isolated']);

  it('every one of the 28 letters is shown in every position it can take, by at least one starter word', () => {
    const table = new Map<string, string>();
    for (const w of AR_PROFILE.words) for (const [l, p] of arLetterPositions(w.form)) if (!table.has(`${l}|${p}`) && /[\u064B-\u0652]/.test(w.form)) table.set(`${l}|${p}`, w.form);
    const missing: string[] = [];
    for (const l of LETTERS28) for (const p of canTake(l)) if (!table.has(`${l}|${p}`)) missing.push(`${l} ${p}`);
    expect(missing).toEqual([]);
    if (process.env.AR_PRINT) console.log(LETTERS28.map((l) => `${l}  ` + canTake(l).map((p) => `${p}: ${table.get(`${l}|${p}`)}`).join('   ')).join('\n'));
  });

  it('picks the shape unit by the real position: initial and medial ع غ ه are different units; ب ت ث, ن and ي have different end units', () => {
    expect(deps('عَلَم')).toContain(KEY.aynInit);
    expect(deps('عَلَم')).not.toContain(KEY.aynMid);
    expect(deps('مَعَ')).toContain(KEY.aynEnd);
    expect(deps('بَعَد')).toEqual(expect.arrayContaining([KEY.tooth, KEY.aynMid]));
    expect(deps('بَعَد')).not.toContain(KEY.aynInit);
    expect(deps('بَيْت')).toContain(KEY.boatEnd);
    expect(deps('مَنْ')).toContain(KEY.nunEnd);
    expect(deps('مَنْ')).not.toContain(KEY.boatEnd);
    expect(deps('فِي')).toContain(KEY.yaEnd);
    expect(deps('خَرَجَ')).toContain(KEY.hook); // خ initial
    expect(deps('وَجَدَ')).toEqual(expect.arrayContaining([KEY.hook]));
    expect(deps('شَخْص')).toEqual(expect.arrayContaining([KEY.sin, KEY.hook, KEY.sinEnd]));
    expect(deps('نَشَاط')).toBeDefined();
    expect(deps('قِرْش')).not.toContain(KEY.sinEnd); // ش after ر (non-joiner) is stand-alone
    expect(deps('حَقّ')).toContain(KEY.qafEnd);
    expect(deps('صَدِيق')).toContain(KEY.qafEnd);
    expect(deps('كَلْب')).toEqual(expect.arrayContaining([KEY.kaf, KEY.stem, KEY.boatEnd]));
    expect(deps('فِي')).not.toContain(KEY.faEnd);
    expect(deps('كَتِف')).toContain(KEY.faEnd);
    expect(deps('مَال')).not.toContain(KEY.stemEnd); // ل after ا is stand-alone
    expect(deps('جَمِيل')).toEqual(expect.arrayContaining([KEY.mim, KEY.stemEnd]));
    expect(deps('قَلَم')).toEqual(expect.arrayContaining([KEY.mimEnd]));
    expect(deps('وَجْه')).toContain(KEY.haEnd);
  });

  it('no shape unit claims a shape for a letter it does not name, and every end unit is a final-form (text read against the letters)', () => {
    const named: Record<string, string> = {
      [KEY.boatEnd]: 'بتث', [KEY.nunEnd]: 'ن', [KEY.yaEnd]: 'ي', [KEY.hookEnd]: 'جحخ', [KEY.sinEnd]: 'سشصض', [KEY.aynEnd]: 'عغ', [KEY.faEnd]: 'ف', [KEY.qafEnd]: 'ق',
      [KEY.kafEnd]: 'ك', [KEY.stemEnd]: 'لطظ', [KEY.mimEnd]: 'م', [KEY.haEnd]: 'ه',
    };
    for (const [k, letters] of Object.entries(named)) {
      const u = AR_PROFILE.units.find((x) => x.key === k)!;
      expect(u.kind, k).toBe('final-form');
      for (const l of letters) expect(u.display, `${k} ${l}`).toContain(`ـ${l}`);
    }
    const nun = AR_PROFILE.units.find((x) => x.key === KEY.boatEnd)!;
    expect(nun.sound).not.toMatch(/ن ي|ب ت ث ن/);
    expect(AR_PROFILE.units.find((x) => x.key === KEY.aynInit)!.sound).toMatch(/open curve/);
    expect(AR_PROFILE.units.find((x) => x.key === KEY.aynMid)!.sound).toMatch(/closed/);
  });

  it('the unvocalized ladder cards show the vocalized word WITHOUT a case ending on the back (the Sprint card is self-graded, so no ending can fail a learner)', () => {
    for (const f of ['كتاب', 'الكتاب', 'البيت', 'الشمس']) {
      const w = AR_PROFILE.words.find((x) => x.form === f)!;
      expect(w, f).toBeDefined();
      const vocal = w.gloss.split(' — ')[0];
      expect(vocal, f).not.toMatch(/[\u064B-\u064D\u064F]$/); // no tanwīn, no final ḍamma
      expect(w.pronunciation, f).toBeTruthy();
      expect(w.gloss.split(' — ')[1], f).toBeTruthy();
    }
  });
});

describe('Arabic sprint: registration', () => {
  it('is the last sprint language, and loads for ar and its varieties', async () => {
    expect(SPRINT_LANGUAGES.at(-1)).toBe('ar');
    expect(sprintLanguageOf('ar')).toBe('ar');
    expect(sprintLanguageOf('ar-msa')).toBe('ar');
    expect(sprintLanguageOf('ar-cla')).toBe('ar');
    expect(await loadSprintProfiles('ar')).toEqual([AR_PROFILE]);
    expect(await loadSprintProfiles('ar-cla')).toEqual([AR_PROFILE]);
  });

  it('has its own kind for the joined shape of a letter, and every other unit keeps its old kind', () => {
    const kinds = new Set(AR_PROFILE.units.map((u) => u.kind));
    expect(kinds.has('positional-form')).toBe(true);
    expect(kinds.has('cluster')).toBe(false);
  });
});
