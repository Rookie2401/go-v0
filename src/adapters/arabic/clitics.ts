/**
 * Clitics of the written Arabic word: the proclitic chain [أ] [و|ف] [ب|ك|ل|س] [ال] (with لل = ل + ال, the one lām showing), the attached
 * pronouns (ي ني نا ك كما كم كن ه ها هما هم هن, and two of them after a verb: أعطانيها), and the stem spellings the clitics hide
 * (ة → ت, ى → ا / ي, وا → و, ون / ين → و / ي, the hamza seat). Everything here is PURE and cheap: `arSegmentations` lists every
 * structurally possible cut of a key WITHOUT consulting the lexicon; the analyser keeps a cut only when the stem is a word (analyze.ts)
 * and the clitics are allowed on its part of speech and features (`arProcliticAllows`, `arEncliticAllows`).
 *
 * The clitic data is hand-written for this adapter and MACHINE-DRAFTED: not reviewed by a native speaker or an Arabist. Glosses are
 * the plain function of each clitic; nothing here is a lexical meaning.
 */
import type { PartOfSpeech } from '../../core';

// ───────────────────────────── the inventories ─────────────────────────────

export type ProcliticKind = 'question' | 'conj' | 'prep' | 'future' | 'article' | 'lam';

export interface Clitic {
  /** The id used in notes and tests: 'wa', 'fa', 'bi', 'ka', 'li', 'sa', 'al', 'a'. */
  id: string;
  /** The letters it takes in the key. */
  text: string;
  /** Vocalized, as a dictionary writes it. */
  vocalized: string;
  kind: ProcliticKind;
  /** The lemma and part of speech a part of the word carries ('وَ' CONJ). */
  lemma: string;
  pos: PartOfSpeech;
  /** Its function in plain words. */
  role: string;
  gloss: string;
}

export const AR_PROCLITICS: Readonly<Record<string, Clitic>> = {
  a: { id: 'a', text: 'أ', vocalized: 'أَ', kind: 'question', lemma: 'أَ', pos: 'PART', role: 'question particle', gloss: 'introduces a yes/no question' },
  wa: { id: 'wa', text: 'و', vocalized: 'وَ', kind: 'conj', lemma: 'وَ', pos: 'CONJ', role: 'conjunction "and"', gloss: 'and' },
  fa: { id: 'fa', text: 'ف', vocalized: 'فَ', kind: 'conj', lemma: 'فَ', pos: 'CONJ', role: 'conjunction "so, then"', gloss: 'so, then, and so' },
  bi: { id: 'bi', text: 'ب', vocalized: 'بِ', kind: 'prep', lemma: 'بِ', pos: 'ADP', role: 'preposition "in, with, by"', gloss: 'in, with, by' },
  ka: { id: 'ka', text: 'ك', vocalized: 'كَ', kind: 'prep', lemma: 'كَ', pos: 'ADP', role: 'preposition "like, as"', gloss: 'like, as' },
  li: { id: 'li', text: 'ل', vocalized: 'لِ', kind: 'prep', lemma: 'لِ', pos: 'ADP', role: 'preposition "to, for"', gloss: 'to, for' },
  sa: { id: 'sa', text: 'س', vocalized: 'سَ', kind: 'future', lemma: 'سَ', pos: 'PART', role: 'future prefix "will"', gloss: 'will (puts an imperfect verb in the future)' },
  al: { id: 'al', text: 'ال', vocalized: 'الْ', kind: 'article', lemma: 'ال', pos: 'DET', role: 'definite article "the"', gloss: 'the' },
};

export interface Pronoun {
  /** The letters in the key ('ه', 'ها', 'ني'). */
  text: string;
  /** Vocalized ('هُ', 'هَا', 'نِي'). */
  vocalized: string;
  morph: Record<string, string>;
  /** Who it can be: 'object' pronouns follow a verb, 'possessive' a noun; every one can complete a preposition. */
  object: boolean;
  possessive: boolean;
  /** In plain words: "him / his", "me". */
  english: string;
}

const P = (text: string, vocalized: string, morph: Record<string, string>, object: boolean, possessive: boolean, english: string): Pronoun =>
  ({ text, vocalized, morph, object, possessive, english });

export const AR_PRONOUNS: ReadonlyArray<Pronoun> = [
  P('ي', 'ـِي', { Person: '1', Number: 'Sing' }, false, true, 'me, my'),
  P('ني', 'ـنِي', { Person: '1', Number: 'Sing' }, true, false, 'me'),
  P('نا', 'ـنَا', { Person: '1', Number: 'Plur' }, true, true, 'us, our'),
  P('ك', 'ـكَ', { Person: '2', Number: 'Sing', Gender: 'Fem,Masc' }, true, true, 'you (sg.), your'),
  P('كمو', 'ـكُمُو', { Person: '2', Number: 'Plur', Gender: 'Masc' }, true, false, 'you (m. pl.)'),
  P('كما', 'ـكُمَا', { Person: '2', Number: 'Dual' }, true, true, 'you two, your (du.)'),
  P('كم', 'ـكُمْ', { Person: '2', Number: 'Plur', Gender: 'Masc' }, true, true, 'you (m. pl.), your'),
  P('كن', 'ـكُنَّ', { Person: '2', Number: 'Plur', Gender: 'Fem' }, true, true, 'you (f. pl.), your'),
  P('ه', 'ـهُ', { Person: '3', Number: 'Sing', Gender: 'Masc' }, true, true, 'him, it, his'),
  P('ها', 'ـهَا', { Person: '3', Number: 'Sing', Gender: 'Fem' }, true, true, 'her, it, her'),
  P('هما', 'ـهُمَا', { Person: '3', Number: 'Dual' }, true, true, 'them two, their (du.)'),
  P('هم', 'ـهُمْ', { Person: '3', Number: 'Plur', Gender: 'Masc' }, true, true, 'them (m.), their'),
  P('هن', 'ـهُنَّ', { Person: '3', Number: 'Plur', Gender: 'Fem' }, true, true, 'them (f.), their'),
];
const PRONOUN_BY_TEXT = new Map(AR_PRONOUNS.map((p) => [p.text, p]));
const PRONOUN_TEXTS = [...PRONOUN_BY_TEXT.keys()].sort((a, b) => b.length - a.length);

/** The particles that take an attached pronoun as their subject or complement (إنه, أنني, لكنه, ليتني, لعله, كأنه). */
export const ENCLITIC_PARTICLES: ReadonlySet<string> = new Set(['إن\u0651', 'أن\u0651', 'كأن\u0651', 'لكن\u0651', 'ليت', 'لعل\u0651', 'لأن\u0651']);

// ───────────────────────────── segmentation ─────────────────────────────

export interface ArSegmentation {
  /** The proclitics, outermost first (و ب ال). Empty for the whole word. */
  proclitics: Clitic[];
  /** The key-letter span each proclitic covers: [from, to) in the key. `لل` gives ل [0,1) and ال [1,2). */
  proclSpans: Array<[number, number]>;
  /** The stem as the key writes it (after the proclitics and before the attached pronouns), and its span in the key. */
  stemKey: string;
  stemSpan: [number, number];
  /** The stem's possible dictionary spellings (the first is `stemKey`): ة for ت, ى for ا / ي, وا for و, ون / ين for و / ي, the hamza seat. */
  stemKeys: string[];
  /** The attached pronouns in written order (two only after a verb); `enclitic` is the last. */
  enclitics: Pronoun[];
  enclitic?: Pronoun;
  encliticSpans: Array<[number, number]>;
}

const MIN_STEM = 2;

/** The dictionary spellings a stem may hide when a pronoun (or a clitic) follows it. */
function stemSpellings(stem: string, hasEnclitic: boolean): string[] {
  const out = new Set<string>([stem]);
  // the tanwīn alif of an accusative indefinite (مُخْرِجًا): the bare cell is also a spelling (the analyser keeps it for derived cells only)
  if (stem.endsWith('ا') && stem.length >= 4) out.add(stem.slice(0, -1));
  // the feminine of a derived participle (المنتجة): the bare cell is also a spelling (kept for derived participles only)
  if (stem.endsWith('ة') && stem.length >= 4) out.add(stem.slice(0, -1));
  if (hasEnclitic) {
    const last = stem[stem.length - 1];
    const body = stem.slice(0, -1);
    if (last === 'ت') out.add(`${body}ة`);
    if (last === 'ا') { out.add(`${body}ى`); out.add(`${body}ا`); }
    if (last === 'ي') { out.add(`${body}ى`); out.add(`${body}ين`); out.add(`${body}ي`); if (body.length === 2) out.add(body); }
    if (last === 'و') { out.add(`${body}وا`); out.add(`${body}ون`); if (body.length === 2) out.add(body); }
    if (stem.endsWith('تمو')) out.add(stem.slice(0, -1));
    if (last === 'ا' && body.length >= 2) { out.add(`${body}ان`); }
    if (last === 'آ') { out.add(`${body}أى`); out.add(`${body}أا`); }
    if (last === 'ؤ' || last === 'ئ' || last === 'أ') { out.add(`${body}ء`); out.add(`${body}أ`); out.add(`${body}ئ`); out.add(`${body}ؤ`); }
    if (stem.length >= 3 && 'يو'.includes(last) && 'اي'.includes(stem[stem.length - 2])) out.add(`${stem.slice(0, -2)}ء`);
  }
  return [...out].filter((s) => s.length >= 1);
}

interface Chain { clitics: Clitic[]; spans: Array<[number, number]>; end: number }

function chains(key: string): Chain[] {
  const out: Chain[] = [];
  const add = (c: Clitic[], s: Array<[number, number]>, end: number): void => { if (key.length - end >= MIN_STEM) out.push({ clitics: c, spans: s, end }); };
  const q = [{ pos: 0, c: [] as Clitic[], s: [] as Array<[number, number]> }];
  // stage 0: the question hamza; stage 1: conjunction; stage 2: preposition / future; stage 3: article
  const stage0: Array<{ pos: number; c: Clitic[]; s: Array<[number, number]> }> = [...q];
  if (key[0] === 'أ' && key.length > 3) stage0.push({ pos: 1, c: [AR_PROCLITICS.a], s: [[0, 1]] });
  const stage1 = [...stage0];
  for (const st of stage0) {
    const ch = key[st.pos];
    if ((ch === 'و' || ch === 'ف') && key.length - st.pos > MIN_STEM) stage1.push({ pos: st.pos + 1, c: [...st.c, AR_PROCLITICS[ch === 'و' ? 'wa' : 'fa']], s: [...st.s, [st.pos, st.pos + 1]] });
  }
  const stage2 = [...stage1];
  for (const st of stage1) {
    const ch = key[st.pos];
    const id = ch === 'ب' ? 'bi' : ch === 'ك' ? 'ka' : ch === 'ل' ? 'li' : ch === 'س' ? 'sa' : '';
    if (id && key.length - st.pos > MIN_STEM) stage2.push({ pos: st.pos + 1, c: [...st.c, AR_PROCLITICS[id]], s: [...st.s, [st.pos, st.pos + 1]] });
  }
  for (const st of stage2) {
    if (st.pos === 0) out.push({ clitics: [], spans: [], end: 0 }); else add(st.c, st.s, st.pos);
    const last = st.c[st.c.length - 1];
    if (last?.id === 'sa') continue; // the future prefix takes no article
    // the article: ال, or only its lām after the preposition ل (لل)
    if (key.startsWith('ال', st.pos)) add([...st.c, AR_PROCLITICS.al], [...st.s, [st.pos, st.pos + 2]], st.pos + 2);
    if (last?.id === 'li' && key[st.pos] === 'ل' && st.pos > 0 && key[st.pos - 1] === 'ل') add([...st.c, AR_PROCLITICS.al], [...st.s, [st.pos, st.pos + 1]], st.pos + 1);
  }
  // dedupe (the same chain may be reached twice)
  const seen = new Set<string>();
  return out.filter((c) => { const k = `${c.end}|${c.clitics.map((x) => x.id).join(',')}`; if (seen.has(k)) return false; seen.add(k); return true; });
}

/**
 * Every structurally possible cut of a key, the whole word (no clitic) first. The lexicon is not consulted: most of these cuts are not
 * words and the analyser drops them. A stem is at least two letters.
 */
export function arSegmentations(key: string): ArSegmentation[] {
  const out: ArSegmentation[] = [];
  const seen = new Set<string>();
  for (const ch of chains(key)) {
    const rest = key.slice(ch.end);
    // no enclitic, one, or two (the inner one an object pronoun, only meaningful after a verb)
    const options: Array<{ list: Pronoun[]; spans: Array<[number, number]>; stemEnd: number }> = [{ list: [], spans: [], stemEnd: key.length }];
    for (const t1 of PRONOUN_TEXTS) {
      if (!rest.endsWith(t1) || rest.length - t1.length < MIN_STEM) continue;
      const p1 = PRONOUN_BY_TEXT.get(t1)!;
      const e1 = key.length - t1.length;
      options.push({ list: [p1], spans: [[e1, key.length]], stemEnd: e1 });
      for (const t2 of PRONOUN_TEXTS) {
        const body = key.slice(0, e1);
        if (!body.endsWith(t2) || body.length - ch.end - t2.length < MIN_STEM) continue;
        const p2 = PRONOUN_BY_TEXT.get(t2)!;
        if (!p2.object) continue;
        const e2 = e1 - t2.length;
        options.push({ list: [p2, p1], spans: [[e2, e1], [e1, key.length]], stemEnd: e2 });
      }
    }
    for (const o of options) {
      const stemKey = key.slice(ch.end, o.stemEnd);
      const sig = `${ch.clitics.map((c) => c.id).join(',')}|${ch.end}|${o.stemEnd}|${o.list.map((p) => p.text).join(',')}`;
      if (seen.has(sig)) continue;
      seen.add(sig);
      out.push({
        proclitics: ch.clitics, proclSpans: ch.spans, stemKey, stemSpan: [ch.end, o.stemEnd],
        // لله is ل + الله (the alif of the name is not written after the preposition)
        stemKeys: [...stemSpellings(stemKey, o.list.length > 0), ...(stemKey === 'له' && ch.clitics[ch.clitics.length - 1]?.id === 'li' && o.list.length === 0 ? ['الله'] : [])],
        enclitics: o.list, enclitic: o.list[o.list.length - 1], encliticSpans: o.spans,
      });
    }
  }
  // the whole word first, then fewer cuts before more
  out.sort((a, b) => (a.proclitics.length + a.enclitics.length) - (b.proclitics.length + b.enclitics.length));
  return out;
}

/** Every stem key of every cut of a word (the shard loader loads the shards of all of them). */
export function arStemKeys(key: string): string[] {
  const set = new Set<string>();
  for (const s of arSegmentations(key)) for (const k of s.stemKeys) set.add(k);
  return [...set];
}

// ───────────────────────────── what the clitics allow ─────────────────────────────

/** The particles a preposition may be written onto (بأن, لأن, كأن, بما, لما, كما). */
const PARTICLE_STEMS: ReadonlySet<string> = new Set(['أن', 'أن\u0651', 'ما']);

/** The shape of a reading the clitics are checked against. */
export interface CliticTarget { pos: string; morph: Readonly<Record<string, string>>; lemmaKey?: string }

export interface CliticVerdict {
  ok: boolean;
  /** Features the clitic fixes on the stem (سَـ: Mood=Ind; لِـ: Mood=Sub,Jus; ال: Definite=Def); the analyser narrows the reading with them. */
  patch?: Record<string, string>;
  /** The clitic's function in this use. */
  role?: string;
}

const NOMINAL = new Set(['NOUN', 'PROPN', 'ADJ', 'NUM', 'PRON', 'DET']);
const has = (v: string | undefined, x: string): boolean => (v ?? '').split(',').includes(x);
const isFinite = (t: CliticTarget): boolean => (t.pos === 'VERB' || t.pos === 'AUX') && (t.morph.VerbForm === 'Fin' || t.morph.VerbForm === undefined);
const isImperfect = (t: CliticTarget): boolean => isFinite(t) && has(t.morph.Aspect, 'Imp');

/** May this proclitic stand before this reading of the stem? */
export function arProcliticAllows(c: Clitic, t: CliticTarget): CliticVerdict {
  switch (c.id) {
    case 'wa': case 'fa': return { ok: true, role: c.role };
    case 'a': return { ok: true, role: c.role };
    case 'al':
      if (!NOMINAL.has(t.pos) || t.pos === 'PRON') return { ok: false };
      if (t.morph.Definite && !has(t.morph.Definite, 'Def') && !has(t.morph.Definite, 'Ind') && !has(t.morph.Definite, 'Cons')) return { ok: false };
      return { ok: true, patch: { Definite: 'Def' }, role: c.role };
    case 'bi': case 'ka':
      if (PARTICLE_STEMS.has(t.lemmaKey ?? '') && (t.pos === 'PART' || t.pos === 'SCONJ' || t.pos === 'CONJ')) return { ok: true, role: c.role };
      return NOMINAL.has(t.pos) ? { ok: true, role: c.role } : { ok: false };
    case 'li':
      if (NOMINAL.has(t.pos)) return { ok: true, role: c.role };
      if (PARTICLE_STEMS.has(t.lemmaKey ?? '') && (t.pos === 'PART' || t.pos === 'SCONJ' || t.pos === 'CONJ')) return { ok: true, role: c.role };
      if (isImperfect(t)) {
        const m = t.morph.Mood ?? '';
        const sj = has(m, 'Sub'), js = has(m, 'Jus');
        if (sj && js) return { ok: true, patch: { Mood: 'Jus,Sub' }, role: 'lām of purpose (+ subjunctive) or command (+ jussive)' };
        if (sj) return { ok: true, patch: { Mood: 'Sub' }, role: 'lām of purpose (+ subjunctive)' };
        if (js) return { ok: true, patch: { Mood: 'Jus' }, role: 'lām of command (+ jussive)' };
        if (has(m, 'Ind') || has(m, 'Ene')) return { ok: true, role: 'emphatic lām (لَـ)' };
        return { ok: false };
      }
      if (isFinite(t) && has(t.morph.Aspect, 'Perf')) return { ok: true, role: 'lām of the answer (لَـ) before a perfect' };
      return { ok: false };
    case 'sa':
      return isImperfect(t) && has(t.morph.Mood, 'Ind') && t.morph.Voice !== undefined ? { ok: true, patch: { Mood: 'Ind' }, role: c.role } : isImperfect(t) && has(t.morph.Mood, 'Ind') ? { ok: true, patch: { Mood: 'Ind' }, role: c.role } : { ok: false };
    default: return { ok: false };
  }
}

/** May this attached pronoun follow this reading of the stem? Returns its function in plain words. */
export function arEncliticAllows(p: Pronoun, t: CliticTarget, inner = false): CliticVerdict {
  const verb = t.pos === 'VERB' || t.pos === 'AUX';
  if (verb) {
    if (!isFinite(t)) return { ok: false };
    return p.object ? { ok: true, role: inner ? 'first object pronoun' : 'object pronoun' } : { ok: false };
  }
  if (inner) return { ok: false };
  if (t.pos === 'ADP') return { ok: true, role: 'complement of the preposition' };
  if (t.pos === 'ADV') return p.possessive ? { ok: true, role: 'complement of the adverb or preposition' } : { ok: false };
  if (t.pos === 'PART' || t.pos === 'CONJ' || t.pos === 'SCONJ') {
    return t.lemmaKey && ENCLITIC_PARTICLES.has(t.lemmaKey) ? { ok: true, role: 'subject of the particle (إِنَّ and its sisters)' } : { ok: false };
  }
  // كِلَا / كِلْتَا "both" are pronoun-like nouns that take a possessive in construct state; other pronouns do not
  if (t.pos === 'PRON') return p.possessive && has(t.morph.Definite, 'Cons') ? { ok: true, patch: { Definite: 'Cons' }, role: 'possessive pronoun' } : { ok: false };
  if (NOMINAL.has(t.pos)) {
    if (!p.possessive) return { ok: false };
    // the noun is in construct state: tanwīn and the article are not written before a possessor
    if (t.morph.Definite && !has(t.morph.Definite, 'Cons')) return { ok: false };
    return { ok: true, patch: { Definite: 'Cons' }, role: 'possessive pronoun' };
  }
  return { ok: false };
}
