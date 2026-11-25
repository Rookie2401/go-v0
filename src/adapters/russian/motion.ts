/**
 * Russian verbs of motion: the fourteen pairs of unprefixed verbs (determinate / indeterminate), the prefixes that make new verbs of
 * them, and `ruMotionOf(lemma)`, which says what a lemma is among them.
 *
 * MACHINE-DRAFTED from standard grammar descriptions of Russian; not reviewed by a native speaker. The rule "a prefixed verb built on
 * the DETERMINATE verb is perfective, one built on the INDETERMINATE stem is imperfective" is checked against the dictionary index in
 * test/adapters/russian-constructions.test.ts; the verbs that break it are listed in `RU_MOTION_EXCEPTIONS` with the reason.
 *
 * What the data says:
 *  - determinate (unidirectional): one trip, in one direction, at one time: Я иду в школу (I am on my way to school).
 *  - indeterminate (multidirectional): a habit, a round trip, a general ability, movement with no one goal: Я хожу в школу каждый день.
 *  - prefixed: the prefix adds the direction (arrival, leaving, entering ...). The prefixed verb built on the determinate stem is
 *    perfective (прийти), its imperfective partner is built on the indeterminate stem (приходить; the stem changes in ехать →
 *    -езжать, плыть → -плывать, тащить → -таскивать, катить → -катывать, лезть → -лезать).
 */

export interface RuMotionPair {
  /** Determinate (unidirectional) verb. */
  determinate: string;
  /** Indeterminate (multidirectional) verb. */
  indeterminate: string;
  /** Another accepted spelling of the indeterminate verb (лазить / лазать). */
  indeterminateAlt?: string;
  /** What the pair means and how the two differ. */
  gloss: string;
  /** The reflexive pair, where one really exists. */
  reflexive?: { determinate: string; indeterminate: string; gloss: string };
}

export const RU_MOTION_PAIRS: readonly RuMotionPair[] = [
  { determinate: 'идти', indeterminate: 'ходить', gloss: 'to go on foot: идти is one trip now (Я иду в школу), ходить is a habit, a round trip or the ability to walk (Я хожу в школу каждый день)' },
  { determinate: 'ехать', indeterminate: 'ездить', gloss: 'to go by vehicle: ехать is one trip now, ездить is habitual or a round trip (Я езжу на работу на метро)' },
  { determinate: 'бежать', indeterminate: 'бегать', gloss: 'to run: бежать is running somewhere now, бегать is running about or as a habit' },
  { determinate: 'лететь', indeterminate: 'летать', gloss: 'to fly: лететь is one flight in one direction, летать is flying in general or back and forth' },
  { determinate: 'плыть', indeterminate: 'плавать', gloss: 'to swim or sail: плыть is moving along in one direction, плавать is swimming about or knowing how to swim' },
  { determinate: 'нести', indeterminate: 'носить', gloss: 'to carry on foot: нести is carrying something to a place now, носить is carrying regularly, or wearing (носить очки)',
    reflexive: { determinate: 'нестись', indeterminate: 'носиться', gloss: 'to rush along (нестись) and to rush about (носиться)' } },
  { determinate: 'вести', indeterminate: 'водить', gloss: 'to lead, to take (a person or animal on foot): вести is leading to a place now, водить is leading regularly, or driving (водить машину)' },
  { determinate: 'везти', indeterminate: 'возить', gloss: 'to transport by vehicle: везти is conveying to a place now, возить is conveying regularly' },
  { determinate: 'лезть', indeterminate: 'лазить', indeterminateAlt: 'лазать', gloss: 'to climb, to crawl in: лезть is climbing in one direction, лазить is climbing about or habitually' },
  { determinate: 'ползти', indeterminate: 'ползать', gloss: 'to crawl: ползти is crawling in one direction, ползать is crawling about' },
  { determinate: 'тащить', indeterminate: 'таскать', gloss: 'to drag, to haul: тащить is dragging to a place now, таскать is dragging about or repeatedly',
    reflexive: { determinate: 'тащиться', indeterminate: 'таскаться', gloss: 'to drag oneself along (тащиться) and to tag along or hang about (таскаться)' } },
  { determinate: 'гнать', indeterminate: 'гонять', gloss: 'to drive, to chase: гнать is driving in one direction, гонять is driving about or repeatedly',
    reflexive: { determinate: 'гнаться', indeterminate: 'гоняться', gloss: 'to chase after (гнаться) and to chase about (гоняться)' } },
  { determinate: 'катить', indeterminate: 'катать', gloss: 'to roll (something): катить is rolling it along one way, катать is rolling it about or giving a ride',
    reflexive: { determinate: 'катиться', indeterminate: 'кататься', gloss: 'to roll along (катиться) and to ride, to skate (кататься)' } },
  { determinate: 'брести', indeterminate: 'бродить', gloss: 'to trudge, to wander: брести is trudging along in one direction, бродить is wandering about' },
];

export interface RuMotionPrefix {
  /** The headline spelling and the variants used before some consonant clusters. */
  forms: string[];
  /** What the prefix adds, in plain words. */
  sense: string;
  /** An example verb (a real one, built with the determinate stem of идти or ехать). */
  example: string;
}

export const RU_MOTION_PREFIXES: readonly RuMotionPrefix[] = [
  { forms: ['при'], sense: 'arrival: coming to a place', example: 'прийти (to arrive on foot), приехать' },
  { forms: ['у'], sense: 'leaving: going away from a place', example: 'уйти (to leave on foot), уехать' },
  { forms: ['в', 'во'], sense: 'into: going inside', example: 'войти (to enter), въехать' },
  { forms: ['вы'], sense: 'out of: going outside', example: 'выйти (to go out), выехать' },
  { forms: ['под', 'подо'], sense: 'up to: approaching, coming close', example: 'подойти (to walk up to), подъехать' },
  { forms: ['от', 'ото'], sense: 'away from: moving a little way off', example: 'отойти (to step away), отъехать' },
  { forms: ['пере'], sense: 'across: crossing, or moving from one place to another', example: 'перейти (to cross), переехать (to move house)' },
  { forms: ['про'], sense: 'past or through: passing by or going through', example: 'пройти (to pass, to go through), проехать' },
  { forms: ['за'], sense: 'dropping in on the way, or going behind or beyond', example: 'зайти (to drop in), заехать' },
  { forms: ['до'], sense: 'as far as: reaching a point', example: 'дойти (to get as far as), доехать' },
  { forms: ['с', 'со'], sense: 'down from, off (with an indeterminate stem it can also make a perfective round trip: сходить, съездить)', example: 'сойти (to get off), съехать' },
  { forms: ['об', 'обо'], sense: 'around: going round or bypassing', example: 'обойти (to walk round), объехать' },
  { forms: ['вз', 'вс', 'взо'], sense: 'up: going upward', example: 'взойти (to rise, of the sun), взбежать' },
  { forms: ['раз', 'рас', 'разо'], sense: 'apart: moving in different directions (usually with -ся)', example: 'разойтись (to disperse), разъехаться' },
  { forms: ['по'], sense: 'setting off (with a determinate stem: пойти, поехать) or doing it for a while (with an indeterminate stem: походить, поездить)', example: 'пойти (to set off), походить (to walk for a while)' },
];

export interface RuMotionInfo {
  kind: 'determinate' | 'indeterminate' | 'prefixed';
  /** The unprefixed verb it is built on (itself for an unprefixed one). */
  base: string;
  /** The other member of the pair (the indeterminate partner of a determinate verb and the reverse). */
  pair?: string;
  prefix?: string;
  prefixSense?: string;
  /** The aspect the rule gives a prefixed verb; the dictionary is checked against it. */
  expectedAspect?: 'Imp' | 'Perf';
  /** The lemma is reflexive (-ся). */
  reflexive?: boolean;
}

/** Verbs that look like a prefix plus a verb of motion but are not motion in their usual sense. */
export const RU_MOTION_NOT_MOTION: ReadonlyMap<string, string> = new Map([
  ['найти', 'на- + идти, but the usual sense is "to find", not motion'],
  ['находить', 'the imperfective of найти: "to find", not motion (находиться: to be located)'],
  ['нанести', 'на- + нести: "to inflict, to apply", not motion'],
  ['находиться', 'to be located, not motion'],
]);

/** Prefixed verbs that break the rule "determinate stem: perfective, indeterminate stem: imperfective", and why. */
export const RU_MOTION_EXCEPTIONS: ReadonlyMap<string, string> = new Map([
  ['сходить', 'с- + ходить is imperfective "to go down, to come off" (the imperfective of сойти) AND a perfective "to go and come back" (сходить в магазин)'],
  ['съездить', 'с- + ездить is perfective: a round trip made once (съездить в Москву)'],
  ['сбегать', 'with с- + бегать: perfective "to run over and back" (сбегать в магазин); сбегать is also the imperfective of сбежать'],
  ['слетать', 'с- + летать: perfective "to fly there and back"; also the imperfective of слететь'],
  ['сплавать', 'с- + плавать: perfective "to swim there and back, to go for a swim"'],
  ['походить', 'по- + indeterminate stem: perfective, "to walk for a while"'],
  ['поездить', 'по- + indeterminate stem: perfective, "to travel for a while"'],
  ['побегать', 'по- + indeterminate stem: perfective, "to run about for a while"'],
  ['полетать', 'по- + indeterminate stem: perfective, "to fly for a while"'],
  ['поплавать', 'по- + indeterminate stem: perfective, "to swim for a while"'],
  ['поносить', 'по- + indeterminate stem: perfective, "to carry or wear for a while"'],
  ['поводить', 'по- + indeterminate stem: perfective, "to lead about for a while"'],
  ['повозить', 'по- + indeterminate stem: perfective, "to transport for a while"'],
  ['полазить', 'по- + indeterminate stem: perfective, "to climb about for a while"'],
  ['поползать', 'по- + indeterminate stem: perfective, "to crawl about for a while"'],
  ['потаскать', 'по- + indeterminate stem: perfective, "to drag about for a while"'],
  ['погонять', 'по- + indeterminate stem: perfective, "to drive on for a while"'],
  ['покатать', 'по- + indeterminate stem: perfective, "to give a ride"'],
  ['побродить', 'по- + indeterminate stem: perfective, "to wander for a while"'],
  ['добегаться', 'до- + бегать + -ся: perfective, "to run oneself into trouble or exhaustion" (not the imperfective of добежать)'],
  ['завозиться', 'за- + возить + -ся: perfective, "to get absorbed in a fiddly task" (a figurative verb, not the imperfective of завезти)'],
  ['слазить', 'с- + лазить: perfective in use, "to climb down and back"; the dictionary files it imperfective'],
  ['проходить', 'про- + ходить is imperfective (to pass, to go through), but there is also a perfective "to walk for a given time" (проходить весь день)'],
  ['выходить', 'imperfective of выйти (to go out); the perfective homograph выходить means "to nurse back to health"'],
  ['заходить', 'the imperfective of зайти (to drop in); the dictionary may also give it as perfective "to start walking about"'],
  ['обходить', 'imperfective of обойти; the perfective homograph means "to walk round all of them"'],
]);

// ───────────────────────────── building the verbs ─────────────────────────────

interface StemRule {
  pair: RuMotionPair;
  /** The stem after a prefix of the perfective verb built on the determinate verb: идти → йти. */
  pf: string;
  /** The stem after a prefix of the imperfective partner: идти → ходить, ехать → езжать. */
  impf: string;
  /** A consonant prefix needs an inserted о before this stem (в + ойти). */
  insertO?: boolean;
  /** Both spellings are generated (with and without an inserted о) because the language has both (подогнать, выгнать). */
  maybeO?: boolean;
}

const STEMS: readonly StemRule[] = [
  { pair: RU_MOTION_PAIRS[0], pf: 'йти', impf: 'ходить', insertO: true },
  { pair: RU_MOTION_PAIRS[1], pf: 'ехать', impf: 'езжать' },
  { pair: RU_MOTION_PAIRS[2], pf: 'бежать', impf: 'бегать' },
  { pair: RU_MOTION_PAIRS[3], pf: 'лететь', impf: 'летать' },
  { pair: RU_MOTION_PAIRS[4], pf: 'плыть', impf: 'плывать' },
  { pair: RU_MOTION_PAIRS[5], pf: 'нести', impf: 'носить' },
  { pair: RU_MOTION_PAIRS[6], pf: 'вести', impf: 'водить' },
  { pair: RU_MOTION_PAIRS[7], pf: 'везти', impf: 'возить' },
  { pair: RU_MOTION_PAIRS[8], pf: 'лезть', impf: 'лезать' },
  { pair: RU_MOTION_PAIRS[9], pf: 'ползти', impf: 'ползать' },
  { pair: RU_MOTION_PAIRS[10], pf: 'тащить', impf: 'таскивать' },
  { pair: RU_MOTION_PAIRS[11], pf: 'гнать', impf: 'гонять', maybeO: true },
  { pair: RU_MOTION_PAIRS[12], pf: 'катить', impf: 'катывать' },
  { pair: RU_MOTION_PAIRS[13], pf: 'брести', impf: 'бредать' },
];

const CONSONANT_END = /[бвгджзклмнпрстфхцчшщ]$/;

/** Writes a prefix and a stem together: a consonant prefix takes ъ before е (въехать), and an о before йти (войти). */
function join(prefix: string, stem: string, o: 'none' | 'insert'): string {
  if (!CONSONANT_END.test(prefix)) return prefix + stem;
  if (o === 'insert') return `${prefix}о${stem}`;
  return /^[еёюя]/.test(stem) ? `${prefix}ъ${stem}` : prefix + stem;
}

interface Built { info: RuMotionInfo }

const TABLE = new Map<string, Built[]>();
const put = (form: string, info: RuMotionInfo): void => {
  const list = TABLE.get(form) ?? [];
  if (!list.some((b) => b.info.kind === info.kind && b.info.expectedAspect === info.expectedAspect && b.info.prefix === info.prefix)) list.push({ info });
  TABLE.set(form, list);
};

for (const st of STEMS) {
  const { determinate: det, indeterminate: ind, indeterminateAlt: alt } = st.pair;
  put(det, { kind: 'determinate', base: det, pair: ind });
  put(ind, { kind: 'indeterminate', base: ind, pair: det });
  if (alt) put(alt, { kind: 'indeterminate', base: ind, pair: det });
  if (st.pair.reflexive) {
    const r = st.pair.reflexive;
    put(r.determinate, { kind: 'determinate', base: r.determinate, pair: r.indeterminate, reflexive: true });
    put(r.indeterminate, { kind: 'indeterminate', base: r.indeterminate, pair: r.determinate, reflexive: true });
  }
  for (const p of RU_MOTION_PREFIXES) {
    for (const prefix of p.forms) {
      const modes: Array<'none' | 'insert'> = st.insertO ? ['insert'] : st.maybeO ? ['none', 'insert'] : ['none'];
      for (const m of modes) {
        put(join(prefix, st.pf, m), { kind: 'prefixed', base: det, pair: ind, prefix: p.forms[0], prefixSense: p.sense, expectedAspect: 'Perf' });
      }
      // the imperfective partner: built on the indeterminate stem; с- and по- with a plain indeterminate verb also make a perfective
      if (prefix !== 'по') put(join(prefix, st.impf, 'none'), { kind: 'prefixed', base: ind, pair: det, prefix: p.forms[0], prefixSense: p.sense, expectedAspect: 'Imp' });
      if (prefix === 'по' || prefix === 'с' || prefix === 'со') {
        put(join(prefix, ind, 'none'), { kind: 'prefixed', base: ind, pair: det, prefix: p.forms[0], prefixSense: prefix === 'по' ? 'doing it for a while' : 'a round trip, made once', expectedAspect: 'Perf' });
        if (alt) put(join(prefix, alt, 'none'), { kind: 'prefixed', base: ind, pair: det, prefix: p.forms[0], prefixSense: prefix === 'по' ? 'doing it for a while' : 'a round trip, made once', expectedAspect: 'Perf' });
      }
    }
  }
}

/** Every motion reading a lemma has (a homograph can have two: сходить), the first being the usual one. */
export function ruMotionReadings(lemma: string): RuMotionInfo[] {
  const key = lemma.normalize('NFC').toLowerCase().replace(/[̀́]/g, '');
  if (RU_MOTION_NOT_MOTION.has(key)) return [];
  const hit = TABLE.get(key);
  if (hit) return hit.map((b) => ({ ...b.info }));
  if (/с[яь]$/.test(key)) {
    const stripped = key.replace(/с[яь]$/, '');
    const inner = TABLE.get(stripped);
    // the reflexive of a prefixed verb of motion (разойтись, съехаться); a plain reflexive pair is in the table already
    if (inner?.some((b) => b.info.kind === 'prefixed')) return inner.map((b) => ({ ...b.info, reflexive: true }));
  }
  return [];
}

/** What a lemma is among the verbs of motion, or undefined. The first reading when a homograph has two. */
export function ruMotionOf(lemma: string): RuMotionInfo | undefined {
  return ruMotionReadings(lemma)[0];
}

/** One plain sentence for a card about a motion verb, or undefined. */
export function ruMotionNote(lemma: string): string | undefined {
  const m = ruMotionOf(lemma);
  if (!m) return undefined;
  const pair = RU_MOTION_PAIRS.find((p) => p.determinate === m.base || p.indeterminate === m.base || p.indeterminateAlt === m.base || p.reflexive?.determinate === m.base || p.reflexive?.indeterminate === m.base);
  if (m.kind === 'determinate') return `${m.base} is the determinate verb of motion: one trip in one direction, now or at a given time. Its indeterminate partner is ${m.pair}.`;
  if (m.kind === 'indeterminate') return `${m.base} is the indeterminate verb of motion: a habit, a round trip, movement with no single goal, or the ability. Its determinate partner is ${m.pair}.`;
  const aspect = m.expectedAspect === 'Perf' ? 'perfective' : 'imperfective';
  return `${lemma}: the prefix ${m.prefix}- (${m.prefixSense}) on a verb of motion${pair ? ` (${pair.determinate} / ${pair.indeterminate})` : ''}; built on the ${m.expectedAspect === 'Perf' ? 'determinate' : 'indeterminate'} stem it is normally ${aspect}.`;
}
