/**
 * Spanish morphology engine (package S1, docs/PLAN9.md): generation and analysis that agree.
 *
 * Analysis never guesses a reading: it proposes candidate lemmas from the written form, GENERATES their forms with
 * the same code `conjugateSpanish` uses, and keeps only the readings whose generated form is the written form. A
 * lemma is "confirmed" only when the caller's `knownLemma` says so; anything else is a rule-only reading with low
 * confidence. Competing readings (hablamos: present or preterite; fue: ser or ir) are all returned and none is
 * allowed above 0.75.
 */
import type { PartOfSpeech, WordPart } from '../../core';
import { attachClitics, cliticParts, lowerClitics, peelClitics, verbCandidates } from './morph-clitics';
import { analyzeNominal, contractionParts } from './morph-nominal';
import { stripAccents } from './morph-orth';
import { endingClasses, stemVariants } from './morph-verbcands';
import { IRREGULAR, irregularParticipleLemmas } from './verb-irregular';
import { stemOf, type FormRec } from './verb-regular';
import { assumableClasses } from './verb-stem';
import { conjugateLemma, formsMatching } from './verbs';

/** One reading of a written form. Several can be right at once (canto: noun, or 1st person present of cantar). */
export interface SpanishAnalysis {
  lemma: string;
  pos: PartOfSpeech;
  /** Universal-Dependencies-style features: VerbForm, Mood, Tense, Person, Number, Gender, Polite, Degree … */
  morph: Record<string, string>;
  /** Verb + attached pronouns, or the halves of a contraction. Offsets within the form. */
  parts?: WordPart[];
  /** 'voseo', 'vosotros', 'es-hist' … when the form belongs to a variety rather than to general Spanish. */
  varieties?: string[];
  /** In plain words, how the form was reached ("regular -ar verb, imperfect indicative, first person plural"). */
  rule: string;
  /** True when the lemma was confirmed by `knownLemma`; a rule-only guess stays below 0.8. */
  lemmaKnown: boolean;
  confidence: number;
}

export interface AnalyzeOptions {
  /** Is this a real lemma (of this part of speech, when given)? Supplied by the adapter from its lexicon / a dictionary. */
  knownLemma?: (lemma: string, pos?: PartOfSpeech) => boolean;
}

/** irregular / regular: confirmed lemma; assumed: confirmed lemma, guessed stem change; listed: our own tables know the verb but nobody vouched; inferred: rule alone. */
type Tier = 'irregular' | 'regular' | 'assumed' | 'listed' | 'inferred' | 'derived' | 'closed';
type Raw = Omit<SpanishAnalysis, 'confidence'> & { tier: Tier };
type Known = AnalyzeOptions['knownLemma'];

const WORD = /^[a-záéíóúüñ]+$/;
const AUX_LEMMAS = new Set(['ser', 'estar', 'haber']);

// ---------------------------------------------------------------------------------------------------------------
// plain words

const PERSON_WORD: Record<string, string> = { '1': 'first', '2': 'second', '3': 'third' };
const TENSE_MOOD: Record<string, string> = {
  'Ind|Pres': 'present indicative', 'Ind|Imp': 'imperfect indicative', 'Ind|Past': 'preterite indicative', 'Ind|Fut': 'future indicative',
  'Sub|Pres': 'present subjunctive', 'Sub|Imp': 'imperfect subjunctive', 'Sub|Fut': 'future subjunctive',
};

/** A plain-words description of a feature bundle ("first person plural, imperfect subjunctive"). */
export function describeSpanishMorph(morph: Record<string, string>): string {
  const hit = describeCache.get(morph);
  if (hit !== undefined) return hit;
  const text = describeUncached(morph);
  describeCache.set(morph, text);
  return text;
}

const describeCache = new WeakMap<object, string>(); // the generator shares one frozen morph object per slot
function describeUncached(morph: Record<string, string>): string {
  const bits: string[] = [];
  const number = morph.Number === 'Sing' ? 'singular' : morph.Number === 'Plur' ? 'plural' : '';
  const gender = morph.Gender === 'Masc' ? 'masculine' : morph.Gender === 'Fem' ? 'feminine' : '';
  const who = morph.Person && PERSON_WORD[morph.Person] ? `${PERSON_WORD[morph.Person]} person${number ? ' ' + number : ''}` : [gender, number].filter(Boolean).join(' ');
  const vf = morph.VerbForm;
  if (vf === 'Inf') bits.push('infinitive');
  else if (vf === 'Ger') bits.push('gerund');
  else if (vf === 'Part') bits.push('past participle');
  if (who) bits.push(who);
  if (vf === 'Fin' || !vf) {
    if (morph.Mood === 'Imp') bits.push(morph.Polite === 'Form' ? 'imperative (formal, usted)' : 'imperative');
    else if (morph.Mood === 'Cnd') bits.push('conditional');
    else if (morph.Mood && TENSE_MOOD[`${morph.Mood}|${morph.Tense}`]) {
      bits.push(TENSE_MOOD[`${morph.Mood}|${morph.Tense}`] + (morph.Variant === 'Ra' ? ' (-ra)' : morph.Variant === 'Se' ? ' (-se)' : ''));
    }
  }
  if (morph.Degree === 'Dim') bits.push('diminutive');
  else if (morph.Degree === 'Aug') bits.push('augmentative');
  else if (morph.Degree === 'Abs') bits.push('superlative (-ísimo)');
  return bits.join(', ');
}

/** All finite and non-finite forms of a verb the engine can conjugate (irregulars from its tables); undefined otherwise. */
export function conjugateSpanish(lemma: string): Array<{ form: string; morph: Record<string, string>; varieties?: string[] }> | undefined {
  const c = conjugateLemma(lemma.normalize('NFC').toLowerCase());
  return c?.forms.map((f) => ({ form: f.form, morph: { ...f.morph }, ...(f.varieties ? { varieties: [...f.varieties] } : {}) }));
}

// ---------------------------------------------------------------------------------------------------------------
// verbs

let irregularIndex: Map<string, string[]> | undefined;
function irregularBases(): Map<string, string[]> {
  if (irregularIndex) return irregularIndex;
  const idx = new Map<string, string[]>();
  for (const base of Object.keys(IRREGULAR)) {
    for (const f of conjugateLemma(base)?.forms ?? []) {
      const k = stripAccents(f.form);
      const list = idx.get(k) ?? [];
      if (!list.includes(base)) list.push(base);
      idx.set(k, list);
    }
  }
  irregularIndex = idx;
  return idx;
}

const candidateCache = new Map<string, string[]>();

/** Lemmas worth conjugating to see whether they produce `w`. Generation then decides; this only proposes. */
function candidateLemmas(w: string): string[] {
  const hit = candidateCache.get(w);
  if (hit) return hit;
  const out = new Set<string>();
  // an infinitive carries an accent only in -ír (oír, reír); anything else with one is not a lemma
  const add = (l: string) => { if (!out.has(l) && !/[áéíóú]/.test(l.endsWith('ír') ? l.slice(0, -2) : l) && (stemOf(l) || IRREGULAR[l])) out.add(l); };
  if (/(ar|er|ir|ír)$/.test(w)) add(w);
  for (const l of irregularParticipleLemmas(w)) add(l);
  const idx = irregularBases();
  for (let k = 0; k < w.length; k++) {
    const bases = idx.get(k === 0 ? stripAccents(w) : stripAccents(w.slice(k)));
    if (!bases) continue;
    const prefix = w.slice(0, k);
    for (const b of bases) {
      if (k === 0) add(b);
      else if (IRREGULAR[b].prefixes?.includes(prefix)) add(prefix + b);
    }
  }
  const ends = endingClasses();
  for (let i = 1; i < w.length; i++) {
    const stem = w.slice(0, i);
    const classes = ends.get(stripAccents(w.slice(i)));
    if (!classes) continue;
    if (/(ar|er|ir)$/.test(stem)) { add(stem); if (stem.endsWith('ir')) add(stem.slice(0, -2) + 'ír'); }
    for (const v of stemVariants(stem)) for (const suf of classes) add(v + suf);
  }
  const res = [...out];
  if (candidateCache.size > 30000) candidateCache.clear();
  candidateCache.set(w, res);
  return res;
}

const lemmaClass = (lemma: string): 'ar' | 'er' | 'ir' => (lemma.endsWith('ar') ? 'ar' : lemma.endsWith('er') ? 'er' : 'ir');

function ruleText(lemma: string, tier: Tier, kind: string, morph: Record<string, string>, assumed: string | undefined, confirmed: boolean): string {
  const what = kind === 'irregular' ? `irregular verb ${lemma}` : kind === 'stem-change' || tier === 'assumed' ? `stem-changing -${lemmaClass(lemma)} verb` : `regular -${lemmaClass(lemma)} verb`;
  let s = `${what}, ${describeSpanishMorph(morph)}`;
  if (tier === 'assumed') s += `; ${lemma} is not on the stem-change list, so this assumes a ${assumed} change`;
  else if (!confirmed) s += `; the lemma ${lemma} is not confirmed, this is the rule alone`;
  return s;
}

/**
 * Verb readings of `w`. Two passes keep the common case cheap: `confirmed` tries only lemmas the caller vouches for
 * (and never builds a paradigm for a junk candidate); the rule-only pass runs only when nothing was vouched for.
 */
function verbOnly(w: string, known: Known, confirmed: boolean): Raw[] {
  const out: Raw[] = [];
  if (confirmed && !known) return out;
  for (const lemma of candidateLemmas(w)) {
    let kpos: PartOfSpeech | undefined;
    if (confirmed) {
      kpos = known!(lemma, 'VERB') ? 'VERB' : AUX_LEMMAS.has(lemma) && known!(lemma, 'AUX') ? 'AUX' : undefined;
      if (!kpos) continue;
    }
    const conj = conjugateLemma(lemma);
    if (!conj) continue;
    const emit = (forms: FormRec[], tier: Tier, kind: string, assumed?: string) => {
      for (const f of forms) {
        out.push({
          lemma, pos: kpos ?? 'VERB', morph: { ...f.morph }, ...(f.varieties?.length ? { varieties: [...f.varieties] } : {}),
          rule: ruleText(lemma, tier, kind, f.morph, assumed, !!kpos), lemmaKnown: !!kpos, tier,
        });
      }
    };
    const hits = formsMatching(conj, w);
    if (hits.length) emit(hits, kpos ? (conj.kind === 'irregular' ? 'irregular' : 'regular') : conj.kind === 'regular' ? 'inferred' : 'listed', conj.kind);
    else if (kpos && conj.kind === 'regular' && !w.startsWith(stemOf(lemma)!.stem)) {
      // a vouched-for verb on no list: whether its stem changes is unknown, so a reading that needs a change is only assumed
      for (const cls of assumableClasses(lemmaClass(lemma))) {
        const c2 = conjugateLemma(lemma, cls);
        const h2 = c2 ? formsMatching(c2, w) : [];
        if (h2.length) emit(h2, 'assumed', 'stem-change', c2!.assumed);
      }
    }
  }
  return out;
}

/** Can this verb reading take the attached pronouns in this shape? Infinitive, gerund, affirmative imperative only. */
function acceptsClitics(r: Raw, first: string, many: boolean, dropS?: boolean, dropD?: boolean): boolean {
  const m = r.morph;
  if (m.VerbForm === 'Inf' || m.VerbForm === 'Ger') return !dropS && !dropD;
  if (m.Mood !== 'Imp') return false;
  // os belongs to a vosotros imperative, te to a tú imperative
  if (first === 'os' && !(m.Person === '2' && m.Number === 'Plur')) return false;
  if (first === 'te' && !(m.Person === '2' && m.Number === 'Sing')) return false;
  if (m.Person === '1' && m.Number === 'Plur') return first === 'nos' ? !!dropS && !many : !dropS && !dropD; // vámonos / hagámoslo
  if (m.Person === '2' && m.Number === 'Plur') return first === 'os' && !many && (dropD ? true : r.lemma === 'ir'); // callaos / idos
  return !dropS && !dropD;
}

function withClitics(original: string, w: string, known: Known, confirmed: boolean): Raw[] {
  const out: Raw[] = [];
  if (confirmed && !known) return out;
  for (const { rest, clitics } of peelClitics(w)) {
    if (!/[aeiouáéíóú]/.test(rest)) continue;
    for (const cand of verbCandidates(rest, clitics)) {
      if (attachClitics(cand.verb, clitics, { dropS: cand.dropS, dropD: cand.dropD }) !== w) continue;
      for (const r of verbOnly(cand.verb, known, confirmed)) {
        if (!acceptsClitics(r, clitics[0], clitics.length > 1, cand.dropS, cand.dropD)) continue;
        const parts = cliticParts(original, lowerClitics(clitics), r.lemma, r.pos, r.morph);
        out.push({ ...r, parts, rule: `${r.rule}; with the attached pronoun${clitics.length > 1 ? 's' : ''} ${clitics.join(' + ')}` });
      }
    }
  }
  return out;
}

// ---------------------------------------------------------------------------------------------------------------

const BASE_CONFIDENCE: Record<Tier, number> = { irregular: 0.9, regular: 0.85, assumed: 0.55, listed: 0.5, inferred: 0.35, derived: 0.6, closed: 0.95 };
const COMPETING_CAP = 0.7;

function analyzeUncached(original: string, w: string, known: Known): SpanishAnalysis[] {
  const raws: Raw[] = [];
  const contraction = contractionParts(w);
  if (contraction) {
    raws.push({ lemma: w, pos: 'ADP', morph: {}, parts: contraction, rule: w === 'al' ? 'contraction of a + el' : 'contraction of de + el', lemmaKnown: true, tier: 'closed' });
  }
  if (known) {
    raws.push(...verbOnly(w, known, true), ...withClitics(original, w, known, true));
    for (const n of analyzeNominal(w, (l, p) => known(l, p))) {
      raws.push({ lemma: n.lemma, pos: n.pos, morph: n.morph, rule: n.rule, lemmaKnown: true, tier: n.derived ? 'derived' : 'regular' });
    }
  }
  // once the lexicon vouches for a reading, rule-only guesses for the same string are noise: they are only looked for
  // when nothing was vouched for
  if (!raws.some((r) => r.lemmaKnown)) raws.push(...verbOnly(w, known, false), ...withClitics(original, w, known, false));

  const seen = new Set<string>();
  const uniq = raws.filter((r) => {
    const k = `${r.lemma}|${r.pos}|${r.rule}|${r.varieties ? r.varieties.join(',') : ''}|${r.parts ? r.parts.length : 0}`;
    if (seen.has(k)) return false;
    seen.add(k);
    return true;
  });

  const competing = uniq.filter((r) => BASE_CONFIDENCE[r.tier] >= 0.5).length >= 2;
  const out = uniq.map((r, i) => {
    let c = BASE_CONFIDENCE[r.tier];
    if (competing && r.tier !== 'closed') c = Math.min(c, COMPETING_CAP);
    const { tier, ...rest } = r;
    void tier;
    return { a: { ...rest, confidence: c } as SpanishAnalysis, i };
  });
  out.sort((x, y) => y.a.confidence - x.a.confidence || x.i - y.i);
  return out.map((o) => o.a);
}

/**
 * Spellings of preterite forms that the 1959 and 2010 reforms changed. The accent on dió, vió, fué, fuí is the old
 * (pre-1959) rule and is tagged es-hist; rió, frió lost it in 2010 and are merely older spelling.
 */
const OLD_SPELLINGS: Record<string, { plain: string; hist: boolean; keep: (a: SpanishAnalysis) => boolean }> = {
  rió: { plain: 'rio', hist: false, keep: (a) => a.lemma === 'reír' && a.morph.Tense === 'Past' },
  frió: { plain: 'frio', hist: false, keep: (a) => a.lemma === 'freír' && a.morph.Tense === 'Past' },
  dió: { plain: 'dio', hist: true, keep: (a) => a.lemma === 'dar' },
  vió: { plain: 'vio', hist: true, keep: (a) => a.lemma === 'ver' },
  fué: { plain: 'fue', hist: true, keep: () => true },
  fuí: { plain: 'fui', hist: true, keep: () => true },
};

const cloneAnalysis = (a: SpanishAnalysis): SpanishAnalysis => {
  const c: SpanishAnalysis = { ...a, morph: { ...a.morph } };
  if (a.varieties) c.varieties = [...a.varieties];
  if (a.parts) c.parts = a.parts.map((p) => ({ ...p, ...(p.morph ? { morph: { ...p.morph } } : {}) }));
  return c;
};

const MEMO_CAP = 30000;
const memoNoLexicon = new Map<string, SpanishAnalysis[]>();
const memoByLexicon = new WeakMap<object, Map<string, SpanishAnalysis[]>>();
function memoFor(known: Known): Map<string, SpanishAnalysis[]> {
  if (!known) return memoNoLexicon;
  let m = memoByLexicon.get(known);
  if (!m) { m = new Map(); memoByLexicon.set(known, m); }
  return m;
}

/**
 * Every reading the rules allow for one normalized (lower-case, NFC) form, best first. Empty when none applies.
 * Results are remembered per form for a given `knownLemma` function (keep passing the same function; it is assumed to
 * answer the same way each time) and returned as fresh copies.
 */
export function analyzeSpanishForm(form: string, opts: AnalyzeOptions = {}): SpanishAnalysis[] {
  const original = form.normalize('NFC');
  const memo = memoFor(opts.knownLemma);
  const cached = memo.get(original);
  if (cached) return cached.map(cloneAnalysis);
  const lowered = original.toLowerCase();
  const w = lowered.length === original.length ? lowered : original;
  let result: SpanishAnalysis[];
  if (!w || !WORD.test(w)) result = [];
  else {
    const old = OLD_SPELLINGS[w];
    if (old) {
      result = analyzeSpanishForm(old.plain, opts).filter(old.keep).map((a) => ({
        ...a,
        ...(old.hist ? { varieties: [...(a.varieties ?? []), 'es-hist'] } : {}),
        rule: `${a.rule}; written ${w}, the older spelling with an accent`,
      }));
    } else result = analyzeUncached(original, w, opts.knownLemma);
  }
  if (memo.size >= MEMO_CAP) memo.clear();
  memo.set(original, result);
  return result.map(cloneAnalysis);
}
