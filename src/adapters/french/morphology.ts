/**
 * French morphology engine (MORPH package, docs/french/PLAN.md): generation and analysis that agree.
 * MACHINE-DRAFTED, not checked by a native speaker.
 *
 * Analysis never guesses a reading: it proposes candidate lemmas from the written form, GENERATES their forms with the same
 * code `conjugateFrench` uses, and keeps only the readings whose generated form is the written form. A lemma is "confirmed"
 * only when the caller's `knownLemma` says so; anything else is a rule-only reading with low confidence (0.6 at most,
 * `lemmaKnown: false`). Competing readings (parle: present, subjunctive or imperative; fut: être or the noun) are all
 * returned and none is allowed above 0.7. Readings that differ only in person, number or gender are one reading with a
 * comma list (parlais: Person "1,2"; heureux: Number "Plur,Sing").
 *
 * How candidates are found without generating every verb: every model verb of the engine (parler, finir, vendre and each
 * irregular family) is conjugated once, lazily; the endings of its forms (what follows the stem they share) are indexed.
 * A written form is cut at each indexed ending and the model's lemma tail put on: mangeons → mange- (→ mang-) + er,
 * comprenons → compr- + endre. Only those candidates are conjugated, and only after `knownLemma` has vouched for them (or,
 * when nothing was vouched for, with attested prefixes only).
 */
import type { PartOfSpeech } from '../../core';
import type { FrAnalyzeOptions, FrenchAnalysis } from './types';
import { analyzeNominal, guessNominal } from './morph-nominal';
import { FAMILIES, familyOf, type Fam } from './verb-irregular';
import { conjugateLemma, formsMatching, type Conj } from './verbs';

// ---------------------------------------------------------------------------------------------------------------
// plain words

const PERSON_WORD: Record<string, string> = { '1': 'first', '2': 'second', '3': 'third' };
const TENSE_WORD: Record<string, string> = { Pres: 'present', Imp: 'imperfect', Past: 'passé simple (the literary past)', Fut: 'future' };

const listOf = (v: string | undefined): string[] => (v ? v.split(',') : []);
const orJoin = (xs: string[]): string => (xs.length > 1 ? `${xs.slice(0, -1).join(', ')} or ${xs[xs.length - 1]}` : xs[0] ?? '');

/**
 * A plain-words description of a feature bundle: "third person singular, passé simple (the literary past)",
 * "imperfect subjunctive (literary), third person singular", "conditional, first person singular",
 * "past participle, feminine singular", "feminine plural". A union is read as "or" ("first or third person singular").
 */
export function describeFrenchMorph(morph: Record<string, string>, pos?: PartOfSpeech): string {
  const hit = describeCache.get(morph);
  if (hit !== undefined && pos === undefined) return hit;
  const text = describeUncached(morph, pos);
  if (pos === undefined) describeCache.set(morph, text);
  return text;
}

const describeCache = new WeakMap<object, string>();

function describeUncached(morph: Record<string, string>, pos?: PartOfSpeech): string {
  const number = orJoin(listOf(morph.Number).sort((a, b) => (a === 'Sing' ? -1 : b === 'Sing' ? 1 : 0)).map((n) => (n === 'Sing' ? 'singular' : n === 'Plur' ? 'plural' : n)));
  const genders = listOf(morph.Gender).map((g) => (g === 'Masc' ? 'masculine' : g === 'Fem' ? 'feminine' : g));
  const gender = orJoin(genders);
  const persons = listOf(morph.Person).map((p) => PERSON_WORD[p]).filter(Boolean);
  const who = persons.length ? `${orJoin(persons)} person${number ? ' ' + number : ''}` : [gender, number].filter(Boolean).join(' ');
  const vf = morph.VerbForm;
  const verbal = pos === undefined || pos === 'VERB' || pos === 'AUX';
  if (verbal && vf === 'Inf') return 'infinitive';
  if (verbal && vf === 'Part') {
    const tense = morph.Tense === 'Pres' ? 'present participle' : 'past participle';
    return [tense, morph.Tense === 'Pres' ? '' : [gender, number].filter(Boolean).join(' ')].filter(Boolean).join(', ');
  }
  const moods = listOf(morph.Mood);
  const tenses = listOf(morph.Tense);
  if (verbal && moods.length) {
    const tense = orJoin(tenses.map((t) => TENSE_WORD[t] ?? t));
    if (moods.length === 1 && moods[0] === 'Imp') return ['imperative', who].filter(Boolean).join(', ');
    if (moods.length === 1 && moods[0] === 'Cnd') return ['conditional', who].filter(Boolean).join(', ');
    if (moods.length === 1 && moods[0] === 'Sub') {
      const literary = tenses.length === 1 && tenses[0] === 'Imp' ? ' (literary)' : '';
      return [`${tense ? tense + ' ' : ''}subjunctive${literary}`, who].filter(Boolean).join(', ');
    }
    const moodWord = orJoin(moods.map((m) => (m === 'Ind' ? 'indicative' : m === 'Sub' ? 'subjunctive' : m === 'Imp' ? 'imperative' : m === 'Cnd' ? 'conditional' : m)));
    // a bare indicative is the usual one: "first person singular, present"
    if (moods.length === 1 && moods[0] === 'Ind') return [who, tense].filter(Boolean).join(', ');
    return [who, [tense, moodWord].filter(Boolean).join(' ')].filter(Boolean).join(', ');
  }
  return who;
}

// ---------------------------------------------------------------------------------------------------------------
// candidate lemmas

const WORD = /^[a-zàâäçéèêëîïôöùûüÿœæ]+$/;
const AUX_LEMMAS = new Set(['être', 'avoir']);

interface IndexEntry { tail: string; kind: 'er' | 'ir' | 'dre' | 'fam'; fam?: Fam }
let endingIndex: Map<string, IndexEntry[]> | undefined;
let maxEnding = 0;

const lcp = (xs: string[]): string => {
  let p = xs[0] ?? '';
  for (const x of xs) { let i = 0; while (i < p.length && i < x.length && p[i] === x[i]) i++; p = p.slice(0, i); }
  return p;
};

function endings(): Map<string, IndexEntry[]> {
  if (endingIndex) return endingIndex;
  const idx = new Map<string, IndexEntry[]>();
  const learn = (model: string, kind: IndexEntry['kind'], fam?: Fam) => {
    const conj = conjugateLemma(model);
    if (!conj) return;
    const forms = conj.forms.map((f) => f.form);
    const stem = lcp(forms);
    const tail = model.slice(stem.length);
    for (const f of new Set(forms)) {
      const e = f.slice(stem.length);
      const list = idx.get(e) ?? [];
      if (!list.some((x) => x.tail === tail && x.kind === kind && x.fam === fam)) list.push({ tail, kind, fam });
      idx.set(e, list);
      if (e.length > maxEnding) maxEnding = e.length;
    }
  };
  learn('parler', 'er');
  learn('finir', 'ir');
  learn('vendre', 'dre');
  for (const fam of FAMILIES) {
    // a family whose tail is not the end of its model's lemma (the 'ire' family of conduire: tail 'ire') is learnt from its model
    learn(fam.model, 'fam', fam);
    // the model verb is the shortest member; the other members start with a prefix, which the lcp stem absorbs
  }
  endingIndex = idx;
  return idx;
}

/** Undo the spelling changes of the first group on a stem: mange → mang, plaç → plac, appell → appel, achèt → achet / achét, emploi → employ. */
function erStemVariants(stem: string): string[] {
  const out = new Set<string>([stem]);
  if (stem.endsWith('ge')) out.add(stem.slice(0, -1));
  if (stem.endsWith('ç')) out.add(stem.slice(0, -1) + 'c');
  if (/(ll|tt)$/.test(stem)) out.add(stem.slice(0, -1));
  if (stem.includes('è')) {
    out.add(stem.replace(/è([^è]*)$/, 'e$1'));
    out.add(stem.replace(/è([^è]*)$/, 'é$1'));
  }
  if (/[^aeiou]i$|[aeou]i$/.test(stem) && stem.length > 2) out.add(stem.slice(0, -1) + 'y');
  return [...out];
}

const candidateCache = new Map<string, string[]>();

/** Lemmas worth conjugating to see whether they produce `w`. Generation then decides; this only proposes. */
function candidateLemmas(w: string): string[] {
  const hit = candidateCache.get(w);
  if (hit) return hit;
  const out = new Set<string>();
  const add = (l: string) => { if (l.length >= 3) out.add(l); };
  if (/(er|ir|re|oir)$/.test(w)) add(w);
  const idx = endings();
  for (let k = 0; k <= Math.min(maxEnding, w.length); k++) {
    const ending = w.slice(w.length - k);
    const entries = idx.get(ending);
    if (!entries) continue;
    const stem = w.slice(0, w.length - k);
    for (const e of entries) {
      if (!stem && e.kind !== 'fam') continue; // être, avoir, aller …: the whole form is the ending, the lemma has no prefix
      if (e.kind === 'er') {
        if (/[aeiouyàâäéèêëîïôöùûüœæ]/.test(stem)) for (const v of erStemVariants(stem)) add(v + e.tail);
      } else add(stem + e.tail);
    }
  }
  // envoyer: enverrai, renverrais
  const env = /^(r?)enverr(?:ai|as|a|ons|ez|ont|ais|ait|ions|iez|aient)$/.exec(w);
  if (env) add(`${env[1]}envoyer`);
  // connaitre, paraitre: the 1990 spelling of an -aître verb
  for (const l of [...out]) if (l.endsWith('aître')) out.add(l.replace(/aître$/, 'aitre'));
  const res = [...out];
  if (candidateCache.size > 30000) candidateCache.clear();
  candidateCache.set(w, res);
  return res;
}

// ---------------------------------------------------------------------------------------------------------------
// readings

/** irregular / regular: confirmed lemma; listed: our tables know the verb but nobody vouched; inferred: rule alone. */
type Tier = 'irregular' | 'regular' | 'listed' | 'inferred' | 'derived';
interface Raw {
  lemma: string;
  pos: PartOfSpeech;
  morph: Record<string, string>;
  /** What the reading is, without the features ("regular -er verb"). */
  kind: string;
  /** Said after the features. */
  note?: string;
  lemmaKnown: boolean;
  tier: Tier;
  rank?: number;
  register?: Array<'literary'>;
  /** For a reading whose full rule text was built elsewhere (nominal). */
  whole?: boolean;
  /** The feminine counterpart of a noun: dropped when anything else explains the form. */
  counterpart?: boolean;
}
type Known = FrAnalyzeOptions['knownLemma'];

const kindOfConj = (lemma: string, conj: Conj): string => {
  if (conj.listed) return conj.model && !conj.model.startsWith('conjugated like ' + lemma) ? `irregular verb ${lemma} (${conj.model})` : `irregular verb ${lemma}`;
  if (conj.group === '1') return /^r?envoyer$/.test(lemma) ? 'first-group verb (-er) with the future stem enverr-' : 'regular -er verb';
  if (conj.group === '2') return 'regular -ir verb (second group, -iss-)';
  return 'regular -re verb';
};

function verbReadings(w: string, known: Known, confirmed: boolean): Raw[] {
  const out: Raw[] = [];
  if (confirmed && !known) return out;
  for (const lemma of candidateLemmas(w)) {
    let kpos: PartOfSpeech | undefined;
    if (confirmed) {
      kpos = known!(lemma, 'VERB') ? 'VERB' : AUX_LEMMAS.has(lemma) && known!(lemma, 'AUX') ? 'AUX' : undefined;
      if (!kpos) continue;
    }
    const conj = conjugateLemma(lemma, !confirmed);
    if (!conj) continue;
    for (const f of formsMatching(conj, w)) {
      // a variant of use (parles before en or y) is no cell of its own; the same word is its present reading already
      if ('note' in f && f.note) continue;
      const tier: Tier = kpos ? (conj.listed ? 'irregular' : 'regular') : conj.listed ? 'listed' : 'inferred';
      const literary = f.morph.Tense === 'Past' || (f.morph.Mood === 'Sub' && f.morph.Tense === 'Imp');
      let note: string | undefined;
      if (f.spelling) note = 'the spelling of the 1990 rectifications, beside the traditional one';
      if (!kpos) note = note ? `the lemma ${lemma} is not confirmed, this is the rule alone; ${note}` : `the lemma ${lemma} is not confirmed, this is the rule alone`;
      if (conj.group === '2' && !conj.listed) {
        const g = `${lemma} is no listed verb: an -ir verb may belong to the second group (-iss-) or the third; this is the second-group reading`;
        note = note ? `${note}; ${g.replace(`${lemma} is no listed verb: an`, 'an')}` : g;
      }
      out.push({
        lemma, pos: kpos ?? 'VERB', morph: { ...f.morph }, kind: kindOfConj(lemma, conj), ...(note ? { note } : {}), lemmaKnown: !!kpos, tier,
        ...(literary ? { register: ['literary' as const] } : {}),
      });
    }
  }
  return out;
}

const BASE_CONFIDENCE: Record<Tier, number> = { irregular: 0.9, regular: 0.85, listed: 0.5, inferred: 0.35, derived: 0.6 };
const COMPETING_CAP = 0.7;
const MERGE_KEYS = ['Person', 'Number', 'Gender'] as const;

/** Readings of one lemma and part of speech that differ only in person, number or gender become one with a comma list. */
function mergeRaws(raws: Raw[]): Raw[] {
  let list = raws;
  for (let pass = 0; pass < 3; pass++) {
    let changed = false;
    for (const key of MERGE_KEYS) {
      const groups = new Map<string, Raw[]>();
      const order: string[] = [];
      for (const r of list) {
        const { [key]: _drop, ...rest } = r.morph;
        void _drop;
        const k = JSON.stringify([r.lemma, r.pos, r.kind, r.note ?? '', r.tier, r.lemmaKnown, r.rank ?? 1, r.register ?? '', r.whole ?? false, Object.entries(rest).sort(), r.morph[key] === undefined]);
        const g = groups.get(k);
        if (g) g.push(r); else { groups.set(k, [r]); order.push(k); }
      }
      const next: Raw[] = [];
      for (const k of order) {
        const g = groups.get(k)!;
        const vals = [...new Set(g.flatMap((r) => listOf(r.morph[key])))].sort();
        if (g.length > 1 && vals.length > 1) {
          changed = true;
          next.push({ ...g[0], morph: { ...g[0].morph, [key]: vals.join(',') } });
        } else next.push(...g.filter((r, i) => i === 0 || !g.slice(0, i).some((p) => JSON.stringify(p.morph) === JSON.stringify(r.morph))));
      }
      list = next;
    }
    if (!changed) break;
  }
  return list;
}

function analyzeUncached(w: string, known: Known, genderOf?: FrAnalyzeOptions['genderOf']): FrenchAnalysis[] {
  const raws: Raw[] = [];
  const marked = /['-]/.test(w);
  const nominal = (k: NonNullable<Known>) => {
    for (const n of analyzeNominal(w, (l, p) => k(l, p), genderOf)) {
      const cut = n.rule.indexOf(': ');
      raws.push({ lemma: n.lemma, pos: n.pos, morph: n.morph, kind: cut > 0 ? n.rule.slice(0, cut) : n.rule, lemmaKnown: true, tier: n.derived ? 'derived' : 'regular', whole: cut <= 0, ...(n.counterpart ? { counterpart: true } : {}) });
    }
    // a noun's feminine counterpart is the weakest reading: a verb form or another word the list holds explains the form better
    if (raws.some((r) => r.counterpart) && raws.some((r) => !r.counterpart && r.lemmaKnown)) {
      for (let i = raws.length - 1; i >= 0; i--) if (raws[i].counterpart) raws.splice(i, 1);
    }
  };
  if (marked) {
    // a form with an apostrophe or a hyphen: only a nominal the word list holds (grands-mères); the clitics are not modelled here
    if (known) nominal(known);
  } else {
    if (known) {
      raws.push(...verbReadings(w, known, true));
      nominal(known);
    }
    // once the word list vouches for a reading, rule-only guesses for the same string are noise
    if (!raws.some((r) => r.lemmaKnown)) {
      raws.push(...verbReadings(w, known, false));
      if (known) {
        for (const g of guessNominal(w, raws.length === 0)) {
          raws.push({ lemma: g.lemma, pos: g.pos, morph: g.morph, kind: g.rule, lemmaKnown: false, tier: 'inferred', rank: g.rank, whole: true });
        }
      }
    }
  }
  const merged = mergeRaws(raws);
  const seen = new Set<string>();
  const uniq = merged.filter((r) => {
    const k = `${r.lemma}|${r.pos}|${JSON.stringify(r.morph)}|${r.kind}`;
    if (seen.has(k)) return false;
    seen.add(k);
    return true;
  });
  const competing = uniq.filter((r) => BASE_CONFIDENCE[r.tier] >= 0.5).length >= 2;
  const out = uniq.map((r, i) => {
    let c = BASE_CONFIDENCE[r.tier];
    if (competing) c = Math.min(c, COMPETING_CAP);
    const described = describeFrenchMorph(r.morph, r.pos);
    const rule = r.whole ? r.kind : `${r.kind}${described ? ', ' + described : ''}${r.note ? '; ' + r.note : ''}`;
    const rank = r.lemmaKnown ? 1 : r.rank ?? 1;
    const a: FrenchAnalysis = {
      lemma: r.lemma, pos: r.pos, morph: r.morph, ...(r.register ? { register: [...r.register] } : {}),
      rule: r.whole && !r.lemmaKnown ? `${r.kind}` : r.whole ? `${r.kind}${described ? ': ' + described : ''}` : rule,
      lemmaKnown: r.lemmaKnown, confidence: c,
    };
    return { a, i, rank };
  });
  out.sort((x, y) => y.a.confidence - x.a.confidence || x.rank - y.rank || x.i - y.i);
  return out.map((o) => o.a);
}

// ---------------------------------------------------------------------------------------------------------------

const cloneAnalysis = (a: FrenchAnalysis): FrenchAnalysis => {
  const c: FrenchAnalysis = { ...a, morph: { ...a.morph } };
  if (a.register) c.register = [...a.register];
  if (a.varieties) c.varieties = [...a.varieties];
  if (a.parts) c.parts = a.parts.map((p) => ({ ...p, ...(p.morph ? { morph: { ...p.morph } } : {}) }));
  return c;
};

const MEMO_CAP = 30000;
const memoNoLexicon = new Map<string, FrenchAnalysis[]>();
const memoByLexicon = new WeakMap<object, Map<string, FrenchAnalysis[]>>();
function memoFor(known: Known): Map<string, FrenchAnalysis[]> {
  if (!known) return memoNoLexicon;
  let m = memoByLexicon.get(known);
  if (!m) { m = new Map(); memoByLexicon.set(known, m); }
  return m;
}

/**
 * Every reading the rules allow for one normalized (lower-case, NFC) form, best first. Empty when none applies, and for
 * a form with an apostrophe or a hyphen unless the word list holds the nominal it is a form of (grands-mères).
 * Results are remembered per form for a given `knownLemma` function (keep passing the same function; it is assumed to
 * answer the same way each time) and returned as fresh copies.
 */
export function analyzeFrenchForm(form: string, opts: FrAnalyzeOptions = {}): FrenchAnalysis[] {
  const w = form.normalize('NFC');
  const memo = memoFor(opts.knownLemma);
  const cached = memo.get(w);
  if (cached) return cached.map(cloneAnalysis);
  let result: FrenchAnalysis[];
  if (!w || !/^[a-zàâäçéèêëîïôöùûüÿœæ'’-]+$/.test(w) || /^['’-]|['’-]$/.test(w)) result = [];
  else if (WORD.test(w) || w.includes('-') || w.includes("'") || w.includes('’')) result = analyzeUncached(w.replace(/’/g, "'"), opts.knownLemma, opts.genderOf);
  else result = [];
  if (memo.size >= MEMO_CAP) memo.clear();
  memo.set(w, result);
  return result.map(cloneAnalysis);
}

// `familyOf` is re-exported for the paradigm module's use of the same dispatch.
export { familyOf };
