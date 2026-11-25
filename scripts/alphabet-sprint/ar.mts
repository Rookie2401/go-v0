/**
 * Arabic starter words for Alphabet Sprint (words/ar.ts).
 *
 * METHOD (audit amendment G4/G5): the beginner words are CHOSEN BY JUDGEMENT in the curated list below (a vocalized word, its kind and one or
 * two English keywords for the meaning that is wanted). The builder then CHECKS every choice against the Wiktionary Arabic entries (kaikki.org
 * extract, CC BY-SA 4.0): an entry must exist whose canonical vocalized form equals the chosen form (compared through arHeadForm), and one of
 * its senses must contain a keyword; the gloss is that sense's own text, shortened. A word the source does not confirm is DROPPED and reported,
 * never shipped on this list's say-so. The frequency of the unvocalized spelling (ar_50k.txt, CC BY-SA 4.0) only orders the confirmed words.
 *
 * Added by rule, from confirmed words (never from memory):
 *   - the article forms of the taught nouns (الْ + a moon-letter noun; ال + a sun-letter noun with its first letter doubled);
 *   - three indefinite forms of كِتَاب with -un, -in, -an, taken from the source's declension table (so every tanwīn unit has a real word);
 *   - the unvocalized ladder (كتاب, الكتاب …) and the five stage-7 sentences, whose front is unvocalized and whose back is the vocalized text.
 *     Their vocalization is the source's forms tables; the English is written for this deck and marked machine-drafted.
 * Pronunciation is the pack's own transliterateArabic (one scholarly romanization), never Wiktionary's.
 *
 * npx vite-node --config scripts/vite.config.ts scripts/alphabet-sprint/ar.mts [--check]
 */
import fs from 'node:fs';
import path from 'node:path';
import readline from 'node:readline';
import { arHeadForm, arKey, FATHA, NON_JOINING, SHADDA, splitVocal, tashkilLevel } from '../../src/adapters/arabic/text';
import { transliterateArabic } from '../../src/adapters/arabic/translit';
import { weightFromRank } from './lib.mts';
import type { StarterPhrase, StarterWord } from '../../packages/language-packs/src/alphabet-sprint/types';

const DICT = 'C:/Users/CJWal/dev/lisan-v0/data/dict';
const KAIKKI = `${DICT}/kaikki-arabic.jsonl`;
const FREQ = `${DICT}/ar_50k.txt`;
const EXTRACT_DATE = fs.statSync(KAIKKI).mtime.toISOString().slice(0, 10);
const LABEL = `Wiktionary Arabic entries, via kaikki.org (CC BY-SA 4.0), extract of ${EXTRACT_DATE}`;
const FREQ_LABEL = 'OpenSubtitles-based Arabic word list ar_50k (CC BY-SA 4.0)';

type Code = 'N' | 'A' | 'V' | 'P';
/** `code|vocalized form|keywords`. N noun, A adjective, V verb (perfect, he), P particle, pronoun, adverb, numeral, preposition. */
const CURATED = `
N|بَاب|door/gate
N|بَيْت|house
N|بِنْت|girl/daughter
N|لَبَن|milk
N|مَاء|water
N|لَيْل|night
P|ثَلَاثَة|three
N|بَحْر|sea
N|بَحْث|research/search/discussion
N|خُبْز|bread
N|دَار|house/home
A|جَمِيل|beautiful
N|شَمْس|sun
N|قَمَر|moon
N|كِتَاب|book
N|قَلْب|heart
N|عِلْم|knowledge/science
N|غُرْفَة|room
N|صَبْر|patience
N|هُدًى|guidance
N|عَلَم|flag/banner
N|عَالَم|world
N|مَدْرَسَة|school
N|إِنْسَان|human/person/man
N|حَيَاة|life
N|مَعْرِفَة|knowledge
N|حَقِيقَة|truth/reality
N|حِكْمَة|wisdom
N|سَلَام|peace
V|عَلَّمَ|teach
V|عَلِمَ|know
P|أَنَا|I
P|أَنْتَ|you
P|أَنْتِ|you
P|هُوَ|he
P|هِيَ|she
P|نَحْنُ|we
P|هُمْ|they
P|هٰذَا|this
P|ذٰلِكَ|that
P|مَنْ|who
P|مَا|what
P|مَاذَا|what
P|لِمَاذَا|why
P|كَيْفَ|how
P|أَيْنَ|where
P|مَتَى|when
P|هَلْ|question
P|فِي|in
P|مِنْ|from
P|إِلَى|to/toward
P|عَلَى|on
P|عَنْ|about/concerning
P|مَعَ|with
P|بَعْدَ|after
P|قَبْلُ|before/previously
P|بَيْنَ|between
P|عِنْدَ|at/near/with
P|حَتَّى|until
P|لٰكِنْ|but
P|أَوْ|disjunction
P|ثُمَّ|then
P|إِذَا|if/when
P|لَا|no/not
P|لَمْ|not
P|لَنْ|not
P|نَعَمْ|yes
P|كُلّ|all/every/each
P|بَعْض|some/part
P|غَيْر|other/not
P|جِدًّا|very
P|هُنَا|here
P|هُنَاكَ|there
P|أَيْضًا|also/too
P|فَقَطْ|only
P|إِنَّ|indeed/that
P|أَنَّ|that
P|لِأَنَّ|because
P|مَعًا|together
P|حَسَنًا|well/fine/good
P|غَدًا|tomorrow
P|دَائِمًا|always
P|أَبَدًا|never/ever/forever
P|وَاحِد|one
P|اِثْنَان|two
P|أَرْبَعَة|four
P|خَمْسَة|five
P|سِتَّة|six
P|سَبْعَة|seven
P|تِسْعَة|nine
P|عَشَرَة|ten
P|أَلْف|thousand
N|أُمّ|mother
N|أُخْت|sister
N|اِبْن|son
N|وَلَد|boy/child/son
N|رَجُل|man
N|دَم|blood
N|أَب|father
N|أَخ|brother
A|شَبِيه|similar/like
N|فَقِيه|jurist
A|نَزِيه|honest/upright
A|تَافِه|trivial/insignificant
A|سَفِيه|foolish
N|اِمْرَأَة|woman
N|طِفْل|child
N|صَدِيق|friend
N|مُعَلِّم|teacher
N|طَالِب|student
N|طَبِيب|doctor
N|مَلِك|king
N|شَعْب|people/nation
N|أَهْل|family/people
N|عَائِلَة|family
N|زَوْج|husband
N|زَوْجَة|wife
N|جَدّ|grandfather
N|جَدَّة|grandmother
N|اِسْم|name
N|يَد|hand
N|عَيْن|eye
N|رَأْس|head
N|وَجْه|face
N|قَدَم|foot
N|فَم|mouth
N|أُذُن|ear
N|أَنْف|nose
N|شَعْر|hair
N|جِسْم|body
N|مَطْبَخ|kitchen
N|نَافِذَة|window
N|شَارِع|street
N|مَدِينَة|city
N|قَرْيَة|village
N|بَلَد|country
N|وَطَن|homeland
N|سُوق|market
N|كَنِيسَة|church
N|مَكْتَب|office/desk
N|مَكْتَبَة|library
N|مَطَار|airport
N|سَيَّارَة|car
N|طَرِيق|road/way
N|قِطَار|train
N|طَائِرَة|airplane/aircraft
N|لَحْم|meat
N|سُكَّر|sugar
N|مِلْح|salt
N|تُفَّاح|apple
N|عَسَل|honey
N|شَاي|tea
N|قَهْوَة|coffee
N|طَعَام|food
N|يَوْم|day
N|لَيْلَة|night
N|نَهَار|day
N|صَبَاح|morning
N|مَسَاء|evening
N|أُسْبُوع|week
N|شَهْر|month
N|سَنَة|year
N|عَام|year
N|سَاعَة|hour/watch/clock
N|وَقْت|time
N|أَمْس|yesterday
N|نَجْم|star
N|سَمَاء|sky
N|أَرْض|earth/land/ground
N|جَبَل|mountain
N|نَهْر|river
N|شَجَرَة|tree
N|زَهْرَة|flower
N|حَيَوَان|animal
N|كَلْب|dog
N|قِطَّة|cat
N|حِصَان|horse
N|طَائِر|bird
N|سَمَك|fish
N|قَلَم|pen
N|وَرَقَة|paper/sheet/leaf
N|جَامِعَة|university
N|دَرْس|lesson
N|سُؤَال|question
N|جَوَاب|answer
N|كَلِمَة|word
N|لُغَة|language
N|رِسَالَة|letter/message
N|صُورَة|picture/image
N|فِكْرَة|idea
N|عَمَل|work
N|مَال|money/wealth
N|ثَمَن|price
N|مَوْت|death
N|حُبّ|love
N|حَرْب|war
N|حَقّ|right/truth
N|عَدْل|justice
N|نُور|light
N|ظَلَام|darkness
N|نَار|fire
N|رِيح|wind
N|مَطَر|rain
N|ثَلْج|snow
N|بَرْد|cold
N|لَوْن|color/colour
N|قَاضٍ|judge
A|أَحْمَر|red
A|أَزْرَق|blue
A|أَخْضَر|green
A|أَصْفَر|yellow
A|أَسْوَد|black
A|أَبْيَض|white
A|كَبِير|big/large
A|صَغِير|small/little
A|طَوِيل|long/tall
A|قَصِير|short
A|جَدِيد|new
A|قَدِيم|old/ancient
A|حَسَن|good/fine/beautiful
A|جَيِّد|good
A|سَيِّئ|bad
A|سَهْل|easy
A|صَعْب|difficult/hard
A|قَرِيب|near/close
A|بَعِيد|far/distant
A|سَرِيع|fast/quick
A|بَطِيء|slow
A|ثَقِيل|heavy
A|خَفِيف|light
A|سَعِيد|happy
A|حَزِين|sad
A|غَنِيّ|rich
A|فَقِير|poor
A|قَوِيّ|strong
A|ضَعِيف|weak
A|حَارّ|hot
A|بَارِد|cold
A|نَظِيف|clean
A|وَاسِع|wide/spacious
A|ضَيِّق|narrow
A|مَرِيض|sick/ill
A|صَحِيح|correct/true/right
A|كَثِير|many/much/a lot
A|قَلِيل|few/little
A|كَرِيم|generous
A|شُجَاع|brave
A|ذَكِيّ|intelligent/clever
A|مُهِمّ|important
A|مُمْكِن|possible
A|أَوَّل|first
A|آخِر|last/other
A|حُرّ|free
A|حَيّ|alive/living
A|عَظِيم|great/mighty
A|رَائِع|wonderful/great/excellent
A|لَذِيذ|delicious/tasty
A|غَرِيب|strange
V|كَتَبَ|write
V|قَرَأَ|read
V|ذَهَبَ|go
V|جَاءَ|come
V|أَكَلَ|eat
V|شَرِبَ|drink
V|نَامَ|sleep
V|قَالَ|say
V|فَعَلَ|do
V|أَخَذَ|take
V|أَعْطَى|give
V|رَأَى|see
V|سَمِعَ|hear
V|عَرَفَ|know
V|فَهِمَ|understand
V|دَرَسَ|study
V|سَأَلَ|ask
V|جَلَسَ|sit
V|وَقَفَ|stand
V|فَتَحَ|open
V|أَغْلَقَ|close
V|دَخَلَ|enter
V|خَرَجَ|go out/exit
V|رَجَعَ|return
V|عَمِلَ|work
V|لَعِبَ|play
V|حَمَلَ|carry
V|وَجَدَ|find
V|ضَرَبَ|hit/strike
V|فَكَّرَ|think
V|أَحَبَّ|love/like
V|كَانَ|be
V|سَافَرَ|travel
V|بَدَأَ|begin/start
V|مَشَى|walk
V|رَكِبَ|ride
V|بَاعَ|sell
V|اِشْتَرَى|buy
V|وَصَلَ|arrive
V|بَلَغَ|reach/arrive
V|صَبَغَ|dye
V|ضَحِكَ|laugh
V|بَكَى|cry/weep
V|طَلَبَ|request/ask
V|نَظَرَ|look
V|حَضَرَ|attend/come
V|نَجَحَ|succeed
V|مَاتَ|die
V|خَافَ|fear/be afraid
V|شَكَرَ|thank
V|سَاعَدَ|help
V|قَامَ|rise/get up/stand
V|نَسِيَ|forget
V|ذَكَرَ|mention
V|اِنْتَظَرَ|wait
V|تَكَلَّمَ|talk/speak
V|تَعَلَّمَ|learn
V|لَبِسَ|wear
V|غَسَلَ|wash
V|طَبَخَ|cook
V|رَسَمَ|draw
V|غَنَّى|sing
V|زَارَ|visit
V|سَمَحَ|allow/permit
V|مَلَكَ|own/possess
V|حَكَمَ|rule/govern
V|عَبَدَ|worship
V|صَلَّى|pray
V|صَامَ|fast
V|حَفِظَ|memorize/keep/preserve
`.trim().split('\n').map((l) => l.trim()).filter(Boolean);

/** Words the owner's brief names (course core: weight 1). */
const BRIEF = new Set('بَاب بَيْت بِنْت لَبَن مَاء لَيْل ثَلَاثَة بَحْر بَحْث خُبْز دَار جَمِيل شَمْس قَمَر كِتَاب قَلْب عِلْم غُرْفَة صَبْر هُدًى عَلَم عَالَم مَدْرَسَة إِنْسَان حَيَاة مَعْرِفَة حَقِيقَة حِكْمَة سَلَام عَلَّمَ عَلِمَ'.split(' ').map((f) => f.normalize('NFC')));

/** Moon-letter and sun-letter nouns that get an article form (only when the noun is confirmed). */
const ARTICLE_BASES = 'كِتَاب بَيْت قَمَر عِلْم بَاب مَاء بَحْر قَلْب جَبَل كَلْب مَدْرَسَة وَلَد حَيَاة حَقِيقَة مَعْرِفَة غُرْفَة شَمْس سَلَام نَهْر نُور رَجُل تُفَّاح دَرْس طَالِب طَعَام ثَلْج زَوْجَة سَمَاء شَجَرَة نَجْم شَهْر صَبَاح'.split(' ');
/** Words whose unvocalized spelling (alone, and with the article) is a stage-7 card. */
const LADDER = 'كِتَاب بَيْت شَمْس قَمَر سَلَام مَدْرَسَة'.split(' ');

/** The five stage-7 sentences: unvocalized front; each word's vocalization is taken from the source (lemma, or a form of the entry by its tags). */
type Tok = readonly [word: string, tags?: readonly string[]];
const SENTENCES: ReadonlyArray<{ plain: string; english: string; toks: readonly Tok[] }> = [
  { plain: 'هذا كتاب', english: 'This is a book.', toks: [['هٰذَا'], ['كِتَاب', ['indefinite', 'nominative']]] },
  { plain: 'البيت كبير', english: 'The house is big.', toks: [['بَيْت', ['definite', 'nominative']], ['كَبِير', ['indefinite', 'nominative']]] },
  { plain: 'ذهب الطالب إلى المدرسة', english: 'The student went to the school.', toks: [['ذَهَبَ'], ['طَالِب', ['definite', 'nominative']], ['إِلَى'], ['مَدْرَسَة', ['definite', 'genitive']]] },
  { plain: 'قرأت الكتاب', english: 'I read the book.', toks: [['قَرَأَ', ['past', 'first-person', 'singular']], ['كِتَاب', ['definite', 'accusative']]] },
  { plain: 'العلم نور', english: 'Knowledge is light.', toks: [['عِلْم', ['definite', 'nominative']], ['نُور', ['indefinite', 'nominative']]] },
];

const N = (s: string): string => s.normalize('NFC');
const headClass = (code: Code): string => (code === 'V' ? 'VERB' : code === 'P' ? 'X' : 'NOUN');
const kaikkiAccepts = (code: Code, pos: string): boolean => (code === 'V' ? pos === 'verb' : code === 'P' ? true : pos === 'noun' || pos === 'adj');

interface Item { code: Code; vocal: string; keywords: string[] }
const items: Item[] = CURATED.map((l) => { const [code, vocal, kw] = l.split('|'); return { code: code as Code, vocal: N(vocal), keywords: kw.split('/') }; });
const wantKeys = new Set(items.map((i) => arKey(i.vocal)));
const wantHeads = new Map<string, Item[]>();
for (const it of items) { const h = N(arHeadForm(it.vocal, headClass(it.code))); wantHeads.set(h, [...(wantHeads.get(h) ?? []), it]); }

interface Found { sense: string; forms: Array<{ form: string; tags: string[] }>; rawGlosses: string[] }
const found = new Map<Item, { entries: Array<{ glosses: string[]; forms: Found['forms'] }> }>();
for (const it of items) found.set(it, { entries: [] });

const pool: Array<{ vocal: string; key: string; glosses: string[] }> = [];
const rl = readline.createInterface({ input: fs.createReadStream(KAIKKI, { encoding: 'utf8' }), crlfDelay: Infinity });
for await (const line of rl) {
  if (!line.includes('"canonical"')) continue;
  let e: any;
  try { e = JSON.parse(line); } catch { continue; }
  if (e.lang_code !== 'ar' || e.pos === 'name' || !Array.isArray(e.forms) || !Array.isArray(e.senses)) continue;
  if (e.pos === 'noun' || e.pos === 'adj') {
    const c0 = e.forms.find((f: any) => Array.isArray(f.tags) && f.tags.includes('canonical') && !f.source);
    const kk = arKey(e.word);
    if (c0 && arKey(String(c0.form)) === kk && kk.length >= 3 && kk.length <= 5) {
      const gl: string[] = [];
      for (const sn of e.senses.slice(0, 4)) {
        const tg: string[] = sn.tags ?? [];
        if (sn.form_of || sn.alt_of || tg.some((t) => /form-of|alt-of|alternative|misspelling|obsolete|archaic|vulgar|slang|offensive|derogatory|nonstandard|error/.test(t))) continue;
        if (typeof (sn.glosses ?? [])[0] === 'string') gl.push(sn.glosses[0]);
      }
      pool.push({ vocal: N(arHeadForm(String(c0.form), 'NOUN')), key: kk, glosses: gl });
    }
  }
  if (!wantKeys.has(arKey(e.word))) continue;
  const canon = e.forms.find((f: any) => Array.isArray(f.tags) && f.tags.includes('canonical') && !f.source);
  if (!canon) continue;
  for (const it of items) {
    if (!kaikkiAccepts(it.code, e.pos)) continue;
    if (N(arHeadForm(String(canon.form), headClass(it.code))) !== N(arHeadForm(it.vocal, headClass(it.code)))) continue;
    const glosses: string[] = [];
    for (const s of e.senses) {
      const tags: string[] = s.tags ?? [];
      if (s.form_of || s.alt_of || tags.some((t) => /form-of|alt-of|alternative|misspelling|obsolete|archaic|vulgar|slang|offensive|derogatory|nonstandard/.test(t))) continue;
      for (const g of s.glosses ?? []) if (typeof g === 'string') glosses.push(g);
    }
    found.get(it)!.entries.push({ glosses, forms: e.forms.map((f: any) => ({ form: String(f.form), tags: f.tags ?? [] })) });
  }
}

const esc = (s: string): string => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
/** A gloss shortened to a short meaning (the source's own words): the ';' part with the keyword, without brackets, quotes and Arabic. */
function shorten(g: string, kw: string): string | undefined {
  let clean = g.replace(/\u201C[^\u201D]*\u201D/g, '').replace(/\[[^\]]*\]/g, ' ');
  for (let i = 0; i < 4; i++) clean = clean.replace(/\([^()]*\)/g, ' ');
  const pieces = clean.split(';').map((x) => x.replace(/\s+/g, ' ').trim()).filter(Boolean);
  const re = new RegExp('\\b' + esc(kw) + '\\b', 'i');
  let t = pieces.find((x) => re.test(x)) ?? '';
  t = t.replace(/[.\s]+$/, '');
  if (!t || /[\u0600-\u06FF]/.test(t)) return undefined;
  if (t.length > 40) {
    const parts = t.split(/,\s*/);
    const at = Math.max(0, parts.findIndex((p) => re.test(p)));
    t = parts.slice(at, at + 2).join(', ');
    if (t.length > 40) t = parts[at];
  }
  return t.length > 40 || t.length < 1 ? undefined : t.trim();
}

const rankOfKey = new Map<string, number>();
{ let i = 0; for (const line of fs.readFileSync(FREQ, 'utf8').split('\n')) { const w = line.split(' ')[0]; if (!w) continue; const k = arKey(w); if (!rankOfKey.has(k)) rankOfKey.set(k, i); i++; } }
const weightOf = (vocal: string): number => weightFromRank(rankOfKey.get(arKey(vocal)), 0.3);
const say = (vocal: string): string | undefined => transliterateArabic(vocal)?.text;
const keyLen = (vocal: string): number => arKey(vocal).length;

const words: StarterWord[] = [];
const have = new Set<string>();
const dropped: string[] = [];
const confirmed = new Map<string, { gloss: string; forms: Found['forms']; item: Item }>();
for (const it of items) {
  if (have.has(it.vocal)) continue;
  if (keyLen(it.vocal) < 2 || keyLen(it.vocal) > 5 || tashkilLevel(it.vocal.replace(/آ/g, 'أَ')) !== 'full') { dropped.push(`${it.vocal} (not a fully vocalized 2–5 letter word)`); continue; }
  const hit = found.get(it)!;
  if (!hit.entries.length) { dropped.push(`${it.vocal} (no source entry has this vocalization)`); continue; }
  let gloss: string | undefined;
  outer: for (const en of hit.entries) for (const g of en.glosses) for (const kw of it.keywords) {
    if (new RegExp(`\\b${esc(kw)}\\b`, 'i').test(g)) { const s = shorten(g, kw); if (s) { gloss = s; break outer; } }
  }
  if (!gloss) { dropped.push(`${it.vocal} (no sense with ${it.keywords.join('/')}; senses: ${hit.entries[0].glosses.slice(0, 3).join(' | ')})`); continue; }
  const rank = rankOfKey.get(arKey(it.vocal));
  have.add(it.vocal);
  confirmed.set(it.vocal, { gloss, forms: hit.entries[0].forms, item: it });
  const pron = say(it.vocal);
  words.push({
    form: it.vocal, gloss, ...(pron ? { pronunciation: pron } : {}), weight: BRIEF.has(it.vocal) ? 1 : weightOf(it.vocal),
    source: `${LABEL}${rank === undefined ? '' : `; rank ${rank + 1} in ${FREQ_LABEL}`}${BRIEF.has(it.vocal) ? '; word named in the course brief' : ''}`,
  });
}

/** A form of a confirmed word's entry by tags (a declension or conjugation table of the source), never an informal or construct form. */
function pickForm(vocal: string, tags: readonly string[]): string | undefined {
  const c = confirmed.get(vocal);
  if (!c) return undefined;
  const skip = ['informal', 'construct', 'dual', 'plural', 'feminine', 'subjunctive', 'jussive', 'imperfective', 'non-past'].filter((t) => !tags.includes(t));
  return c.forms.find((f) => tags.every((t) => f.tags.includes(t)) && !skip.some((t) => f.tags.includes(t)) && /[\u064B-\u0652]/.test(f.form))?.form;
}

// the indefinite forms of كِتَاب: a real word for each tanwīn unit
const BOOK = N('كِتَاب');
for (const [tag, what] of [['nominative', '-un'], ['genitive', '-in'], ['accusative', '-an']] as const) {
  const f = pickForm(BOOK, ['indefinite', tag, 'singular']);
  if (!f) { dropped.push(`كِتَاب indefinite ${tag} (not in the source's table)`); continue; }
  const form = N(f);
  if (have.has(form)) continue;
  have.add(form);
  const pron = say(form);
  words.push({ form, gloss: `a book (indefinite, ${what})`, ...(pron ? { pronunciation: pron } : {}), weight: 0.3, source: `${LABEL}; declension table of ${BOOK}` });
}

const theGloss = (c: { gloss: string; item: Item }): string => {
  const parts = c.gloss.split(/,\s*/).map((x) => x.replace(/^(a|an|the) /, ''));
  return parts.find((x) => c.item.keywords.includes(x)) ?? parts[0];
};
// COVERAGE: every joining letter must be seen in every position it can take. Gaps are filled from the commonest source lemmas that cover them.
const LET28 = [...'ابتثجحخدذرزسشصضطظعغفقكلمنهوي'];
const RIGHT = new Set([...'ادذرزو']);
const positionsOf = (vocal: string): string[] => {
  const { key } = splitVocal(vocal);
  const out: string[] = [];
  for (let i = 0; i < key.length; i++) {
    const ch = key[i];
    if (ch === 'ل' && i < key.length - 1 && 'اأإآ'.includes(key[i + 1])) { i++; continue; }
    if (!LET28.includes(ch)) continue;
    const jp = i > 0 && !NON_JOINING.has(key[i - 1]);
    const jn = i < key.length - 1 && !NON_JOINING.has(ch);
    out.push(ch + '|' + (jn ? (jp ? 'medial' : 'initial') : jp ? 'final' : 'isolated'));
  }
  return out;
};
const readingOf = (vocal: string): string => splitVocal(vocal).marks.slice(0, -1).map((m) => m.vowel + (m.shadda ? 'S' : '') + (m.dagger ? 'D' : '')).join('|');
const NEEDED = new Set(LET28.flatMap((l) => (RIGHT.has(l) ? ['isolated', 'final'] : ['initial', 'medial', 'final', 'isolated']).map((q) => l + '|' + q)));
/** Fill candidates that were read and judged unsuitable for a first list (a rare sense, a name, an unsuitable meaning). */
const FILL_BAN = new Set<string>(["حَدَث", "بَالِغ"].map(N));
const plainGloss = (glosses: string[]): string | undefined => {
  for (const g of glosses) {
    if (/^[A-Z\[(]/.test(g.trim())) continue;
    const t = shorten(g, '');
    if (t && !/[:.]/.test(t) && t.length <= 40) return t;
  }
  return undefined;
};
const covered = new Set<string>();
for (const w of words) for (const q of positionsOf(w.form)) covered.add(q);
const readingsByKey = new Map<string, Set<string>>();
for (const c of pool) if (plainGloss(c.glosses)) { const r = readingsByKey.get(c.key) ?? new Set<string>(); r.add(readingOf(c.vocal)); readingsByKey.set(c.key, r); }
const usedKeys = new Set(words.map((w) => arKey(w.form)));
const eligible = pool.filter((c) => rankOfKey.has(c.key) && rankOfKey.get(c.key)! < 20000 && (readingsByKey.get(c.key)?.size ?? 0) === 1 && !usedKeys.has(c.key)
  && !FILL_BAN.has(c.vocal) && tashkilLevel(c.vocal.replace(/\u0622/g, '\u0623\u064E')) === 'full' && !!plainGloss(c.glosses))
  .filter((c, i, a) => a.findIndex((x) => x.vocal === c.vocal) === i);
const filled: string[] = [];
for (;;) {
  const missing = [...NEEDED].filter((q) => !covered.has(q));
  let best: { c: (typeof eligible)[number]; gain: string[] } | undefined;
  for (const c of eligible) {
    if (usedKeys.has(c.key)) continue;
    const gain = [...new Set(positionsOf(c.vocal))].filter((q) => missing.includes(q));
    if (!gain.length) continue;
    if (!best || gain.length > best.gain.length || (gain.length === best.gain.length && rankOfKey.get(c.key)! < rankOfKey.get(best.c.key)!)) best = { c, gain };
  }
  if (!best) { if (missing.length) console.error('  coverage gaps left:', missing.join(' ')); break; }
  const gloss = plainGloss(best.c.glosses)!;
  usedKeys.add(best.c.key);
  have.add(best.c.vocal);
  for (const q of positionsOf(best.c.vocal)) covered.add(q);
  const pron = say(best.c.vocal);
  words.push({ form: best.c.vocal, gloss, ...(pron ? { pronunciation: pron } : {}), weight: weightOf(best.c.vocal), source: `${LABEL}; rank ${rankOfKey.get(best.c.key)! + 1} in ${FREQ_LABEL}; chosen to show a letter in a position` });
  filled.push(`${best.c.vocal} ${gloss} [${best.gain.join(' ')}]`);
}
for (const f of filled) console.error('  fill:', f);

// article forms by rule
const articleOf = (base: string): string | undefined => {
  const { key, marks } = splitVocal(base);
  const sun = 'تثدذرزسشصضطظلن'.includes(key[0]);
  if (!sun && !'كبقعمجغوهفخحي'.includes(key[0])) return undefined;
  const rest = splitVocal(base);
  void rest;
  const first = key[0];
  const m = marks[0];
  const head = sun ? `ال${first}${SHADDA}${m.vowel}` : `ال\u0652${first}${m.shadda ? SHADDA : ''}${m.vowel}`;
  let tail = '';
  for (let i = 1; i < key.length; i++) tail += key[i] + marks[i].vowel + (marks[i].shadda ? SHADDA : '') + (marks[i].dagger ? '\u0670' : '');
  return N(head + tail);
};
const articleForms: Array<{ vocal: string; base: string }> = [];
for (const base of ARTICLE_BASES.map(N)) {
  const c = confirmed.get(base);
  if (!c) { dropped.push(`article form of ${base} (the word itself is not confirmed)`); continue; }
  const form = articleOf(base);
  if (!form || have.has(form)) continue;
  have.add(form);
  articleForms.push({ vocal: form, base });
  const pron = say(form);
  words.push({ form, gloss: `the ${theGloss(c)}`, ...(pron ? { pronunciation: pron } : {}), weight: Math.round(weightOf(base) * 0.7 * 1000) / 1000, source: `${LABEL}; article added by rule to ${base}` });
}

// stage 7: unvocalized cards (the form is the print; the back names the vocalized word)
const READ_AS: Record<string, string> = {};
const plainOf = (vocal: string): string => arKey(vocal);
const ladderBack = (vocal: string, gloss: string): string => `${vocal} — ${gloss}`;
for (const base of LADDER.map(N)) {
  const c = confirmed.get(base);
  if (!c) { dropped.push(`unvocalized ladder of ${base} (the word is not confirmed)`); continue; }
  const art = articleForms.find((a) => a.base === base);
  for (const [vocal, gloss] of [[base, c.gloss], ...(art ? [[art.vocal, `the ${theGloss(c)}`]] : [])] as Array<[string, string]>) {
    const plain = plainOf(vocal);
    if (have.has(plain)) continue;
    have.add(plain);
    READ_AS[plain] = vocal;
    const pron = say(vocal);
    words.push({ form: plain, gloss: ladderBack(vocal, gloss), ...(pron ? { pronunciation: pron } : {}), weight: 0.25, source: `${LABEL}; the unvocalized spelling of ${vocal} (stage 7 ladder)` });
  }
}

const phrases: StarterPhrase[] = [];
for (const s of SENTENCES) {
  const vocalized: string[] = [];
  let ok = true;
  for (const [w, tags] of s.toks) {
    const lemma = N(w);
    if (!confirmed.has(lemma)) { dropped.push(`sentence "${s.plain}": ${lemma} is not a confirmed word`); ok = false; break; }
    const f = tags ? pickForm(lemma, tags) : lemma;
    if (!f) { dropped.push(`sentence "${s.plain}": no ${tags!.join('+')} form of ${lemma} in the source`); ok = false; break; }
    vocalized.push(N(f));
  }
  if (!ok) continue;
  const vocal = vocalized.join(' ');
  if (arKey(vocal) !== arKey(s.plain)) { dropped.push(`sentence "${s.plain}": the vocalized text spells ${arKey(vocal)}`); continue; }
  READ_AS[s.plain] = vocal;
  const pron = transliterateArabic(vocal)?.text;
  phrases.push({ form: s.plain, gloss: `${vocal} — ${s.english}`, ...(pron ? { pronunciation: pron } : {}), source: `the five stage-7 sentences of the course brief; vocalization from the forms tables of ${LABEL}; the English is machine-drafted for this deck, not reviewed` });
}

// output
const seen = new Set<string>();
const sorted = words.filter((w) => !seen.has(w.form) && seen.add(w.form)).sort((a, b) => b.weight - a.weight || (a.form < b.form ? -1 : 1));
const body = `/**
 * GENERATED by scripts/alphabet-sprint/ar.mts — do not edit by hand. Real words and phrases for Alphabet Sprint decoding practice.
 * Machine-drafted, not reviewed by a native speaker or a teacher. Words were chosen by judgement and each CONFIRMED against the source (a
 * vocalized canonical form and a sense with the intended meaning); the gloss is the source's own text, shortened; pronunciation is the
 * pack's transliterateArabic. Weight orders words by the frequency of their spelling. ${dropped.length} chosen words or forms were dropped
 * because the source did not confirm them.
 * Sources: ${LABEL}; ${FREQ_LABEL}.
 */
import type { StarterPhrase, StarterWord } from '../types';

export const WORDS: readonly StarterWord[] = ${JSON.stringify(sorted, null, 1)};

export const PHRASES: readonly StarterPhrase[] = ${JSON.stringify(phrases, null, 1)};

/** Stage 7: an UNVOCALIZED spelling the Sprint asks (a word or a sentence) → the vocalized text it stands for (the units the card needs). */
export const READ_AS: Readonly<Record<string, string>> = ${JSON.stringify(READ_AS, null, 1)};
`;
const out = path.join('packages/language-packs/src/alphabet-sprint/words', 'ar.ts');
if (process.env.AR_DROPPED) fs.writeFileSync(process.env.AR_DROPPED, dropped.join('\n'));
console.error(`confirmed ${confirmed.size} of ${items.length}; ${sorted.length} words in all; ${phrases.length} phrases; ${dropped.length} dropped`);
for (const d of dropped) console.error('  dropped:', d);
if (process.argv.includes('--check')) {
  const same = fs.existsSync(out) && fs.readFileSync(out, 'utf8') === body;
  console.log(JSON.stringify({ lang: 'ar', words: sorted.length, phrases: phrases.length, same }));
  if (!same) process.exitCode = 1;
} else {
  fs.mkdirSync(path.dirname(out), { recursive: true });
  fs.writeFileSync(out, body);
  console.log(JSON.stringify({ lang: 'ar', words: sorted.length, phrases: phrases.length, out }));
}
void FATHA;
