/**
 * Hindi words that work together as one: compound verbs (a main verb's stem + a second verb that colours it —
 * कह देना, कर लेना, चला जाना, हो जाना, पढ़ डालना), complex predicates (a noun or adjective + करना / होना / आना / देना / लेना /
 * लगना — याद करना, याद आना, कोशिश करना, शुरू करना, पसंद होना), compound postpositions (के लिए, के साथ, की तरफ़) and fixed
 * expressions. Each is a phrase item of its own in the learner model, beside the words it is made of.
 *
 * Machine-drafted from general knowledge of Hindi, not checked by a native speaker (docs/PLAN12.md, package H4).
 *
 * What each detector needs from the analyses:
 *  - compound verbs: a main verb read as a bare stem (VerbForm=Stem) directly followed (at most one of ही भी तो न नहीं
 *    between) by a form of a vector verb; any main verb the analyses identify, not from a list. The verb group is shared
 *    with the construction detectors (verb-group.ts).
 *  - complex predicates: a reading whose lemma (or written form) is the noun or adjective, and a verb reading of the light
 *    verb within two words after it; the words between may only be particles, pronouns, postpositions or a few adverbs.
 *  - compound postpositions and fixed expressions: written forms or lemmas side by side (the genitive का stands for
 *    का / के / की).
 * A reading that a neighbour rule marked down (confidence 0.4 or less) does not count; a verb reading that is not the
 * word's best one lowers the confidence.
 */
import type { AnalyzedToken, PhraseCandidate, RawToken } from '../../core';
import { HINDI_VECTOR_VERBS, buildVerbGroups, viable, type C } from './verb-group';
import {
  HINDI_COMPLEX_PREDICATES, HINDI_COMPOUND_POSTPOSITIONS, HINDI_FIXED_EXPRESSIONS, type FixedUnit,
} from './phrase-data';

export { HINDI_VECTOR_VERBS };

const NUKTA = /़/gu;
/** Compare words without their nukta and in NFC. */
const key = (s: string): string => s.normalize('NFC').replace(NUKTA, '');

// ───────────────────────────── compound verbs ─────────────────────────────

/** Compound verbs whose meaning is more than "the main verb + a shade". Keyed "main|vector". */
const LEXICALISED: Readonly<Record<string, string>> = {
  'लेना|जाना': 'to take along, to take away',
  'लेना|आना': 'to bring',
  'होना|जाना': 'to become, to get (a change completed)',
  'रहना|जाना': 'to be left behind, to remain',
  'सोना|जाना': 'to fall asleep',
  'मरना|जाना': 'to die',
  'बैठना|जाना': 'to sit down',
  'मारना|डालना': 'to kill',
  'आना|जाना': 'to arrive, to come along',
  'खोना|जाना': 'to get lost',
  'देना|देना': 'to give away',
  'लेना|लेना': 'to take for oneself',
};

function compoundVerbs(tokens: RawToken[], analyses: AnalyzedToken[]): PhraseCandidate[] {
  const out: PhraseCandidate[] = [];
  for (const g of buildVerbGroups(tokens, analyses)) {
    const v = g.vector;
    if (!v || g.main.kind !== 'stem' && !(g.main.kind === 'pf' && g.main.lemma === 'चलना')) continue;
    const main = g.main;
    const meaning = HINDI_VECTOR_VERBS[v.lemma];
    const special = LEXICALISED[`${main.lemma}|${v.lemma}`];
    const mainGloss = main.c.gloss ?? analyses[main.i].candidates.find((c) => c.lemma === main.lemma && c.gloss)?.gloss;
    const gloss = special
      ? `${special}; ${v.lemma} here: ${meaning}`
      : mainGloss ? `${mainGloss}; ${v.lemma} adds: ${meaning}` : `${main.lemma} with ${v.lemma}, which adds: ${meaning}`;
    out.push({
      // the dictionary shape is the stem + the vector's infinitive: कह देना
      pattern: [main.lemma, v.lemma], display: `${stemOf(main.lemma)} ${v.lemma}`,
      kind: 'construction', tokenIndexes: [main.i, ...g.particles.filter((p) => p > main.i && p < v.i), v.i].sort((a, b) => a - b),
      confidence: Math.min(0.95, 0.9 * g.confidence * Math.min(1, main.c.confidence + 0.1) * Math.min(1, v.c.confidence + 0.1)),
      gloss,
    });
  }
  return out;
}

const stemOf = (inf: string): string => (inf.endsWith('ना') && inf.length > 2 ? inf.slice(0, -2) : inf);

// ───────────────────────────── complex predicates ─────────────────────────────

const GAP_PARTICLES = new Set(['ही', 'भी', 'तो', 'न', 'नहीं', 'मत', 'बहुत', 'अब', 'फिर', 'कभी', 'ज़रा', 'थोड़ा']);
const GAP_POS = new Set(['PRON', 'ADP', 'DET']);

/** The causatives of the light verbs, by lemma → the light verb they are the causative of. */
const CAUSATIVE_BASE: Readonly<Record<string, string>> = {
  [key('कराना')]: key('करना'), [key('करवाना')]: key('करना'), [key('दिलाना')]: key('देना'), [key('दिलवाना')]: key('देना'),
};

interface PredIndex { verb: string; verbShown: string; gloss: string; noun: string; derived?: boolean }
let predicateIndex: Map<string, PredIndex[]> | undefined;
function predicates(): Map<string, PredIndex[]> {
  if (predicateIndex) return predicateIndex;
  predicateIndex = new Map();
  for (const p of HINDI_COMPLEX_PREDICATES) {
    const k = key(p.noun);
    const list = predicateIndex.get(k) ?? [];
    list.push({ verb: key(p.verb), verbShown: p.verb, gloss: p.gloss, noun: p.noun });
    predicateIndex.set(k, list);
  }
  // "X करना" is in the table: its intransitive counterpart "X होना" is a unit by rule (शुरू करना → शुरू होना), unless the table lists it itself.
  // The reverse is not assumed. The causatives (कराना, करवाना; दिलाना, दिलवाना) are matched against the base verb in `complexPredicates`.
  const be = key('होना');
  for (const p of HINDI_COMPLEX_PREDICATES) {
    if (key(p.verb) !== key('करना')) continue;
    const list = predicateIndex.get(key(p.noun)) ?? [];
    if (list.some((e) => e.verb === be)) continue;
    list.push({ verb: be, verbShown: 'होना', noun: p.noun, derived: true, gloss: `to be done, to happen, to become (the intransitive of ${p.noun} करना: ${p.gloss})` });
    predicateIndex.set(key(p.noun), list);
  }
  return predicateIndex;
}

const lemmaKeys = (cands: readonly C[]): Set<string> => {
  const s = new Set<string>();
  for (const c of cands) if (c.lemma && viable(cands, c)) s.add(key(c.lemma));
  return s;
};

function complexPredicates(tokens: RawToken[], analyses: AnalyzedToken[]): PhraseCandidate[] {
  const out: PhraseCandidate[] = [];
  const index = predicates();
  for (let i = 0; i < tokens.length; i++) {
    if (!tokens[i].isWord) continue;
    const here = new Set<string>([key(tokens[i].normalized), ...lemmaKeys(analyses[i]?.candidates ?? [])]);
    const found = new Map<string, PredIndex[]>();
    for (const k of here) { const hit = index.get(k); if (hit) found.set(k, hit); }
    if (found.size === 0) continue;
    for (const list of found.values()) {
      for (const entry of list) {
        for (let j = i + 1, skipped = 0; j < tokens.length && skipped <= 2; j++, skipped++) {
          const t = tokens[j];
          if (!t.isWord) break;
          const cands = analyses[j]?.candidates ?? [];
          const plain = cands.find((c) => c.lemma !== undefined && key(c.lemma) === entry.verb && viable(cands, c));
          // the causative of the light verb (कराना, करवाना, दिलाना, दिलवाना) is the causative of the unit: the base pattern, said to be causative
          const causal = plain ? undefined : cands.find((c) => c.lemma !== undefined && CAUSATIVE_BASE[key(c.lemma)] === entry.verb && viable(cands, c));
          const verb = plain ?? causal;
          if (verb) {
            const best = cands[0] === verb ? 1 : 0.75;
            out.push({
              pattern: [entry.noun, causal ? (causal.lemma as string) : entry.verbShown], kind: 'collocation',
              display: `${entry.noun} ${causal ? (causal.lemma as string) : entry.verbShown}`,
              tokenIndexes: [i, j], gloss: causal ? `causative of ${entry.noun} ${entry.verbShown}: to have it done, to make it happen (${entry.gloss})` : entry.gloss,
              confidence: Math.max(0.5, (entry.derived ? 0.8 : 0.9) * best - 0.05 * skipped),
            });
            break;
          }
          const ok = GAP_PARTICLES.has(t.normalized) || cands.some((c) => c.pos !== undefined && GAP_POS.has(c.pos) && viable(cands, c));
          if (!ok) break;
        }
      }
    }
  }
  return out;
}

// ───────────────────────────── compound postpositions and fixed expressions ─────────────────────────────

interface Compiled { unit: FixedUnit; pattern: string[]; variants: string[][][] }
const HYPHENS = ['-', '‐', '–', '‑'];

function compile(units: readonly FixedUnit[]): Map<string, Compiled[]> {
  const map = new Map<string, Compiled[]>();
  for (const unit of units) {
    const items = unit.words.split(' ').map((w) => w.split('/').map((a) => a.normalize('NFC')));
    // a hyphenated word is one token or three (word, hyphen, word)
    let variants: string[][][] = [[]];
    for (const alts of items) {
      const next: string[][][] = [];
      for (const v of variants) {
        const hy = alts.find((a) => a.includes('-'));
        if (hy) {
          const [x, y] = hy.split('-');
          if (items.length > 1) next.push([...v, [hy]]); // a unit of one hyphenated word is multiword only when written as three tokens
          next.push([...v, [x], HYPHENS, [y]]);
        } else next.push([...v, alts]);
      }
      variants = next;
    }
    const pattern = items.map((a) => a[0]);
    const c: Compiled = { unit, pattern, variants };
    for (const v of variants) for (const alt of v[0]) {
      const k = key(alt);
      const list = map.get(k) ?? [];
      if (!list.includes(c)) list.push(c);
      map.set(k, list);
    }
  }
  return map;
}

const GENITIVE = new Set(['का', 'के', 'की']);
/** The possessive pronouns and genitive pronoun forms: closed class, each of them is a का / के / की of its own. */
const POSSESSIVES = new Set(
  ('मेरा मेरे मेरी तेरा तेरे तेरी हमारा हमारे हमारी तुम्हारा तुम्हारे तुम्हारी आपका आपके आपकी उसका उसके उसकी इसका इसके इसकी ' +
    'उनका उनके उनकी इनका इनके इनकी किसका किसके किसकी जिसका जिसके जिसकी अपना अपने अपनी').split(' ').map((s) => s.normalize('NFC')),
);
const compiledFrames = compile(HINDI_COMPOUND_POSTPOSITIONS);
const compiledFixed = compile(HINDI_FIXED_EXPRESSIONS);

function fixedUnits(tokens: RawToken[], analyses: AnalyzedToken[], table: Map<string, Compiled[]>): PhraseCandidate[] {
  const out: PhraseCandidate[] = [];
  /** The word is a genitive: का / के / की, a possessive pronoun, or a fused form with a genitive part. */
  const isGenitive = (j: number): boolean => {
    const t = tokens[j];
    if (!t?.isWord) return false;
    const cands = analyses[j]?.candidates ?? [];
    if (cands.length === 0) return GENITIVE.has(t.normalized) || POSSESSIVES.has(t.normalized);
    return cands.some((c) => viable(cands, c) && (c.lemma === 'का' || c.morph.Poss === 'Yes' || c.morph.Case === 'Gen' || c.parts?.some((p) => p.lemma === 'का')));
  };
  const matches = (alts: string[], j: number): boolean => {
    const t = tokens[j];
    if (!t) return false;
    if (alts === HYPHENS) return !t.isWord && HYPHENS.includes(t.surface);
    if (!t.isWord) return false;
    const surface = key(t.normalized);
    const cands = analyses[j]?.candidates ?? [];
    return alts.some((a) => {
      const ka = key(a);
      if (a === 'का') return isGenitive(j);
      return surface === ka || cands.some((c) => c.lemma !== undefined && key(c.lemma) === ka && viable(cands, c));
    });
  };
  for (let i = 0; i < tokens.length; i++) {
    if (!tokens[i].isWord) continue;
    const keys = new Set<string>([key(tokens[i].normalized)]);
    for (const l of lemmaKeys(analyses[i]?.candidates ?? [])) keys.add(l);
    if (isGenitive(i)) keys.add('का');
    for (const k of keys) {
      for (const c of table.get(k) ?? []) {
        for (const variant of c.variants) {
          let at = i;
          const idx: number[] = [];
          let ok = true;
          for (const alts of variant) {
            if (!matches(alts, at)) { ok = false; break; }
            if (tokens[at].isWord) idx.push(at); // a hyphen between the halves of a repeated word is not part of the unit
            at++;
          }
          if (!ok) continue;
          const words = idx.filter((x) => tokens[x].isWord);
          const known = words.filter((x) => (analyses[x]?.candidates.length ?? 0) > 0).length;
          out.push({
            pattern: c.pattern, display: c.unit.display, kind: c.unit.kind, gloss: c.unit.gloss,
            tokenIndexes: idx, confidence: known === words.length ? 0.9 : 0.8,
          });
        }
      }
    }
  }
  return out;
}

/**
 * Every multiword unit in one sentence. `pattern` is written in lemmas (['कहना', 'देना'], ['याद', 'करना'],
 * ['का', 'लिए']), so that कह दिया, कह देगी and कह दो are one item; `display` is the dictionary shape (कह देना);
 * `gloss` says what the whole means, and for a compound verb what the second verb adds here; `kind` is 'construction'
 * for a compound verb, 'collocation' for a complex predicate, 'frame' for a compound postposition, 'formula' or
 * 'idiom' for a fixed expression. A compound verb is recognised for ANY main verb the analyses identify, not from a list.
 */
export function detectHindiPhrases(tokens: RawToken[], analyses: AnalyzedToken[]): PhraseCandidate[] {
  const all = [
    ...compoundVerbs(tokens, analyses),
    ...complexPredicates(tokens, analyses),
    ...fixedUnits(tokens, analyses, compiledFrames),
    ...fixedUnits(tokens, analyses, compiledFixed),
  ];
  const seen = new Map<string, PhraseCandidate>();
  for (const p of all) {
    const k = `${p.pattern.join('_')}|${p.tokenIndexes.join(',')}`;
    const cur = seen.get(k);
    if (!cur || p.confidence > cur.confidence) seen.set(k, p);
  }
  return [...seen.values()].sort((a, b) => a.tokenIndexes[0] - b.tokenIndexes[0] || a.pattern.join('_').localeCompare(b.pattern.join('_')));
}
