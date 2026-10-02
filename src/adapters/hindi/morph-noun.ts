/**
 * Hindi nouns and agreeing adjectives by rule (package H2, docs/PLAN12.md). Machine-drafted from the author's own
 * knowledge of Hindi grammar; no external source.
 *
 * Ten noun classes (gender follows the first letter): m-aa लड़का (-ा that changes to -े / -ों), m-aa-inv पिता (-ा
 * that keeps it; obl. pl. -ाओं), m-cons घर, m-ii आदमी / कवि, m-uu भालू / साधु, f-cons किताब, f-ii लड़की / शक्ति, f-iyaa
 * चिड़िया, f-aa माता, f-uu बहू / वस्तु. Analysis proposes lemmas from the ending, generates their classes' forms with
 * the same code `inflectNoun` uses, and keeps what equals the written form. A form shared by two cases of one number
 * (the singular direct / oblique) is two readings, never a merged one.
 */
import type { PartOfSpeech } from '../../core';
import type { HindiLemmaInfo } from './morphology';
import { consonantCount, fold, glide, kindOf, shorten } from './morph-orth';
import type { Ctx, Raw } from './morph-types';
import { validStemStart } from './morph-verb';
import { MIN_GUESS } from './morph-verb-read';

export type NCls = 'm-ind' | 'm-aa' | 'm-aa-inv' | 'm-cons' | 'm-ii' | 'm-uu' | 'm-vow' | 'f-cons' | 'f-ii' | 'f-iyaa' | 'f-aa' | 'f-uu' | 'f-vow';

interface NForm { form: string; morph: Record<string, string>; evid: number }

const CLASS_LABEL: Record<NCls, string> = {
  'm-ind': 'masculine noun in an independent -आ after a vowel (कौआ, कुआँ)',
  'm-aa': 'masculine noun in -ा that changes (लड़का)', 'm-aa-inv': 'masculine noun in -ा that keeps it (पिता)',
  'm-cons': 'masculine noun with no marked ending (घर)', 'm-ii': 'masculine noun in -ी / -ि (आदमी)', 'm-uu': 'masculine noun in -ू / -ु (भालू)',
  'f-cons': 'feminine noun ending in a consonant (किताब)', 'f-ii': 'feminine noun in -ी / -ि (लड़की)', 'f-iyaa': 'feminine noun in -िया (चिड़िया)',
  'f-aa': 'feminine noun in -ा (माता)', 'f-uu': 'feminine noun in -ू / -ु (बहू)',
  'm-vow': 'masculine noun in -े / -ो / -ै / -ौ', 'f-vow': 'feminine noun in -े / -ो / -ै / -ौ',
};

const CASE_WORD: Record<string, string> = { Dir: 'direct', Obl: 'oblique', Voc: 'vocative' };
const caseText = (m: Record<string, string>): string => `${CASE_WORD[m.Case] ?? ''} ${m.Number === 'Plur' ? 'plural' : 'singular'}`.trim();

const VOWEL_SIGN_END = /[ुूेैोौ]$/; // ु ू े ै ो ौ — never after ा, so no lemma ends in two आ
/** An independent आ (or आँ / आं) written after a vowel sign: कौआ, कुआँ, जुआ. */
const isIndepAa = (l: string): boolean => l.length > 2 && /आ[ँं]?$/.test(l) && VOWEL_SIGN_END.test(l.replace(/आ[ँं]?$/, ''));
const indepNasal = (l: string): boolean => /आ[ँं]$/.test(l);

function nounForms(l: string, cls: NCls): NForm[] {
  const g = cls[0] === 'm' ? 'Masc' : 'Fem';
  const R = (form: string, n: string, c: string, evid = 0): NForm => ({ form, morph: { Gender: g, Number: n, Case: c }, evid });
  const sg = [R(l, 'Sing', 'Dir'), R(l, 'Sing', 'Obl')];
  switch (cls) {
    case 'm-ind': { const nas = indepNasal(l); const s = l.slice(0, nas ? -2 : -1); const mark = nas ? l[l.length - 1] : ''; return [R(l, 'Sing', 'Dir'), R(s + 'ए' + mark, 'Sing', 'Obl', 0.4), R(s + 'ए' + mark, 'Plur', 'Dir', 0.4), R(s + 'ओं', 'Plur', 'Obl', 0.45), R(s + 'ओ', 'Plur', 'Voc', 0.15)]; }
    case 'm-aa': { const s = l.slice(0, -1); return [R(l, 'Sing', 'Dir'), R(s + 'े', 'Sing', 'Obl', 0.4), R(s + 'े', 'Plur', 'Dir', 0.4), R(s + 'ों', 'Plur', 'Obl', 0.44), R(s + 'ो', 'Plur', 'Voc', 0.15)]; }
    case 'm-aa-inv': return [...sg, R(l, 'Plur', 'Dir'), R(l + 'ओं', 'Plur', 'Obl', 0.45), R(l + 'ओ', 'Plur', 'Voc', 0.15)];
    case 'm-cons': return [...sg, R(l, 'Plur', 'Dir'), R(l + 'ों', 'Plur', 'Obl', 0.45), R(l + 'ो', 'Plur', 'Voc', 0.15)];
    case 'm-ii': { const s = shorten(l); return [...sg, R(l, 'Plur', 'Dir'), R(s + 'यों', 'Plur', 'Obl', 0.45), R(s + 'यो', 'Plur', 'Voc', 0.15)]; }
    case 'm-uu': { const s = shorten(l); return [...sg, R(l, 'Plur', 'Dir'), R(s + 'ओं', 'Plur', 'Obl', 0.45), R(s + 'ओ', 'Plur', 'Voc', 0.15)]; }
    case 'm-vow': return [...sg, R(l, 'Plur', 'Dir'), R(l + 'ओं', 'Plur', 'Obl', 0.45), R(l + 'ओ', 'Plur', 'Voc', 0.15)];
    case 'f-vow': return [...sg, R(l + 'एँ', 'Plur', 'Dir', 0.45), R(l + 'ओं', 'Plur', 'Obl', 0.45), R(l + 'ओ', 'Plur', 'Voc', 0.15)];
    case 'f-cons': return [...sg, R(l + 'ें', 'Plur', 'Dir', 0.4), R(l + 'ों', 'Plur', 'Obl', 0.45), R(l + 'ो', 'Plur', 'Voc', 0.15)];
    case 'f-ii': { const s = shorten(l); return [...sg, R(s + 'याँ', 'Plur', 'Dir', 0.55), R(s + 'यों', 'Plur', 'Obl', 0.5), R(s + 'यो', 'Plur', 'Voc', 0.15)]; }
    case 'f-iyaa': { const s = l.slice(0, -1); return [...sg, R(s + 'ाँ', 'Plur', 'Dir', 0.5), R(s + 'ों', 'Plur', 'Obl', 0.45), R(s + 'ो', 'Plur', 'Voc', 0.15)]; }
    case 'f-aa': return [...sg, R(l + 'एँ', 'Plur', 'Dir', 0.5), R(l + 'ओं', 'Plur', 'Obl', 0.5), R(l + 'ओ', 'Plur', 'Voc', 0.15)];
    case 'f-uu': { const s = shorten(l); return [...sg, R(s + 'एँ', 'Plur', 'Dir', 0.5), R(s + 'ओं', 'Plur', 'Obl', 0.5), R(s + 'ओ', 'Plur', 'Voc', 0.15)]; }
  }
}

/** The classes a lemma can belong to, narrowed by what the word list says about it. */
function classesFor(l: string, info: HindiLemmaInfo | undefined): NCls[] {
  const k = kindOf(l);
  let list: NCls[];
  if (isIndepAa(l)) list = indepNasal(l) ? ['m-ind'] : ['m-ind', 'f-aa'];
  else switch (k) {
    case 'C': list = ['m-cons', 'f-cons']; break;
    case 'aa': list = ['m-aa', 'm-aa-inv', 'f-aa']; if (l.endsWith('िया') && l.length > 3) list.push('f-iyaa'); break;
    case 'ii': case 'i': list = ['m-ii', 'f-ii']; break;
    case 'uu': case 'u': list = ['m-uu', 'f-uu']; break;
    case 'e': case 'ai': case 'o': case 'au': list = ['m-vow', 'f-vow']; break;
    default: return [];
  }
  if (!info) return list;
  if (info.gender === 'm') list = list.filter((c) => c[0] === 'm');
  else if (info.gender === 'f') list = list.filter((c) => c[0] === 'f');
  if (k === 'aa' && !isIndepAa(l)) {
    if (info.invariant === true) list = list.filter((c) => c !== 'm-aa');
    else if (info.invariant === false) list = list.filter((c) => c !== 'm-aa-inv');
  }
  return list;
}

/** The forms of a noun with their features; the class comes from the ending and `info` (gender, invariance). */
export function inflectNoun(lemma: string, info?: HindiLemmaInfo): Array<{ form: string; morph: Record<string, string> }> {
  const k = kindOf(lemma);
  let classes: NCls[];
  const g = info?.gender;
  if (k === 'C' && !isIndepAa(lemma)) classes = g === 'f' ? ['f-cons'] : g === 'mf' ? ['m-cons', 'f-cons'] : ['m-cons'];
  else if (isIndepAa(lemma)) classes = g === 'f' ? ['f-aa'] : g === 'mf' && !indepNasal(lemma) ? ['m-ind', 'f-aa'] : ['m-ind'];
  else if (k === 'aa') {
    const iya = lemma.endsWith('िया') && lemma.length > 3;
    const fem: NCls = iya ? 'f-iyaa' : 'f-aa';
    const masc: NCls = info?.invariant ? 'm-aa-inv' : 'm-aa';
    classes = g === 'f' ? [fem] : g === 'mf' ? [masc, fem] : iya && g === undefined ? [fem] : [masc];
  } else if (k === 'ii' || k === 'i') classes = g === 'm' ? ['m-ii'] : g === 'mf' ? ['m-ii', 'f-ii'] : ['f-ii'];
  else if (k === 'uu' || k === 'u') classes = g === 'f' ? ['f-uu'] : g === 'mf' ? ['m-uu', 'f-uu'] : ['m-uu'];
  else if (k === 'e' || k === 'ai' || k === 'o' || k === 'au') classes = g === 'f' ? ['f-vow'] : g === 'mf' ? ['m-vow', 'f-vow'] : ['m-vow'];
  else return [];
  const rows: Array<{ form: string; morph: Record<string, string> }> = [];
  for (const c of classes) for (const f of nounForms(lemma, c)) rows.push({ form: f.form, morph: f.morph });
  return rows;
}

/** An adjective in -ा (or का, मेरा …): -ा / -े / -ी with the features the form shows. */
export function adjForms(l: string): Array<{ form: string; morph: Record<string, string> }> {
  // a lemma in -या (नया, पराया): today's standard spelling leaves the -य- out before -ए / -ई (नए, नई); the older one (नये, नयी) is the shared `glide` spelling
  const ya = isYaLemma(l);
  const s = ya ? l.slice(0, -2) : l.slice(0, -1);
  const e = ya ? 'ए' : 'े';
  const i = ya ? 'ई' : 'ी';
  return [
    { form: l, morph: { Gender: 'Masc', Number: 'Sing', Case: 'Dir' } },
    { form: s + e, morph: { Gender: 'Masc', Number: 'Sing', Case: 'Obl' } },
    { form: s + e, morph: { Gender: 'Masc', Number: 'Plur', Case: 'Dir' } },
    { form: s + e, morph: { Gender: 'Masc', Number: 'Plur', Case: 'Obl' } },
    { form: s + i, morph: { Gender: 'Fem', Number: 'Sing' } },
    { form: s + i, morph: { Gender: 'Fem', Number: 'Plur' } },
  ];
}

const isYaLemma = (l: string): boolean => l.length > 2 && l.endsWith('या');

export function inflectAdj(lemma: string, info?: HindiLemmaInfo): Array<{ form: string; morph: Record<string, string> }> {
  if (lemma.endsWith('ा') && lemma.length > 1 && !info?.invariant) return adjForms(lemma);
  return [{ form: lemma, morph: {} }];
}

const addTo = (set: Set<string>, s: string): void => { if (s.length >= 2) set.add(s); };

/** Lemmas worth trying for a noun form: the form itself, and what its ending could be an inflection of. */
function nounCandidates(w: string, o: string): string[] {
  const out = new Set<string>([o]);
  const deriveC = (s: string, withAa: boolean): void => {
    addTo(out, s);
    if (withAa) addTo(out, s + 'ा');
    if (s.endsWith('य') && s.length >= 3 && kindOf(s.slice(0, -1)) === 'i') { const b = s.slice(0, -1); addTo(out, b); addTo(out, b.slice(0, -1) + 'ी'); }
  };
  const deriveV = (s: string): void => {
    const k = kindOf(s);
    if (k === 'aa' || k === 'e' || k === 'o' || k === 'ai' || k === 'au') addTo(out, s);
    else if (k === 'u') { addTo(out, s.slice(0, -1) + 'ू'); addTo(out, s); }
  };
  // कौए / कौओं / कुएँ / कुओं: the lemma ends in an independent आ (with the nasal mark if the form has it)
  const deriveIndep = (s: string): void => {
    if (!VOWEL_SIGN_END.test(s)) return;
    addTo(out, s + 'आ');
    addTo(out, s + 'आँ');
    addTo(out, s + 'आं');
  };
  const last = w[w.length - 1];
  const last2 = w.slice(-2);
  if (last2 === 'ों') { const s = o.slice(0, -2); if (kindOf(s) === 'C') deriveC(s, true); }
  else if (last2 === 'ओं') { deriveV(o.slice(0, -2)); deriveIndep(o.slice(0, -2)); }
  else if (last2 === 'ें') { const s = o.slice(0, -2); if (kindOf(s) === 'C') addTo(out, s); }
  else if (last2 === 'ां') { const s = o.slice(0, -2); if (s.endsWith('य') && kindOf(s.slice(0, -1)) === 'i') { addTo(out, s + 'ा'); deriveC(s, false); } }
  else if (last2 === 'एं') { deriveV(o.slice(0, -2)); deriveIndep(o.slice(0, -2)); }
  else if (last === 'ए') deriveIndep(o.slice(0, -1));
  else if (last === 'े') { const s = o.slice(0, -1); if (kindOf(s) === 'C') addTo(out, s + 'ा'); }
  else if (last === 'ो') { const s = o.slice(0, -1); if (kindOf(s) === 'C') deriveC(s, true); }
  else if (last === 'ओ') { deriveV(o.slice(0, -1)); deriveIndep(o.slice(0, -1)); }
  return [...out];
}

const plausibleLemma = (l: string): boolean => l.length >= 2 && validStemStart(l) && consonantCount(l) >= 1 && !/वाल[ाेीि]?$/.test(l);

/**
 * Abstract nouns made from an adjective or noun the word list vouches for: समान + ता, सुंदर + ता (feminine); अकेला + पन,
 * पागल + पन (masculine -पन), बूढ़ा + पना (masculine -पना). The base is the part before the suffix as it stands. Not when base + ना is a verb the list vouches for (करता is not an abstract noun).
 */
const ABSTRACT: Array<{ suffix: string; cls: NCls }> = [{ suffix: 'ता', cls: 'f-aa' }, { suffix: 'पन', cls: 'm-cons' }, { suffix: 'पना', cls: 'm-aa' }];
export function abstractBase(l: string, ctx: Ctx): { base: string; cls: NCls; suffix: string } | undefined {
  for (const a of ABSTRACT) {
    if (!l.endsWith(a.suffix) || l.length - a.suffix.length < 2) continue;
    const b = l.slice(0, l.length - a.suffix.length);
    for (const c of [b]) if ((ctx.known(c, 'ADJ') || ctx.known(c, 'NOUN')) && !ctx.knownVerb(c + 'ना')) return { base: c, cls: a.cls, suffix: a.suffix };
  }
  return undefined;
}

export function nounReadings(w: string, o: string, ctx: Ctx): Raw[] {
  const out: Raw[] = [];
  for (const l of nounCandidates(w, o)) {
    const known = ctx.known(l, 'NOUN');
    const info = known ? ctx.info(l, 'NOUN') : undefined;
    // a -ता word the list vouches for is never derived: its gender comes from lemmaInfo or stays unstated (देवता)
    const abs = known ? undefined : abstractBase(l, ctx);
    if (!known && !abs && (l === o || !plausibleLemma(l))) continue;
    const sureGender = !!info?.gender;
    for (const cls of abs ? [abs.cls] : classesFor(l, info)) {
      for (const f of nounForms(l, cls)) {
        if (fold(f.form) !== w) continue;
        if (!known && !abs && (f.evid < MIN_GUESS || ((cls === 'm-cons' || cls === 'f-cons') && /िय$/.test(l)))) continue;
        const paradigm = `${l}|noun|${f.morph.Gender}`;
        // an oblique plural in -ों does not say whether the lemma is the unmarked noun or the -ा noun, nor its gender
        const noGender = !known && !abs && cls === 'm-aa' && f.morph.Case === 'Obl' && f.morph.Number === 'Plur';
        const morph = { ...f.morph };
        if (noGender) delete morph.Gender;
        out.push({
          lemma: l, pos: 'NOUN', morph, rule: abs ? `abstract noun from ${abs.base} + -${abs.suffix}, ${caseText(f.morph)}` : noGender ? `noun (gender not known), ${caseText(f.morph)}` : `${CLASS_LABEL[cls]}, ${caseText(f.morph)}`,
          known, tier: known ? (abs || !sureGender || (cls === 'm-aa-inv' && info!.invariant !== true) ? 'assumed' : 'rule') : 'guess',
          prior: known ? 1 : abs ? 0.6 : f.evid * (l.endsWith('ि') ? 0.8 : cls === 'm-aa' && l.endsWith('िया') ? 0.85 : 1), paradigm,
          ...(abs ? { notes: { derivedFrom: abs.base } } : {}),
        });
      }
    }
  }
  return mergeGuessGender(out);
}

/** Among rule-only guesses, the same lemma / number / case in both genders is one reading whose gender is not known. */
function mergeGuessGender(list: Raw[]): Raw[] {
  if (!list.some((r) => !r.known)) return list;
  const res: Raw[] = [];
  const idx = new Map<string, number>();
  for (const r of list) {
    if (r.known) { res.push(r); continue; }
    const key = `${r.lemma}|${r.morph.Number}|${r.morph.Case}`;
    const at = idx.get(key);
    if (at === undefined) { idx.set(key, res.length); res.push(r); continue; }
    const prev = res[at];
    if (prev.morph.Gender !== r.morph.Gender) {
      const { Gender: _g, ...rest } = prev.morph;
      void _g;
      res[at] = { ...prev, morph: rest, rule: `noun (gender not known), ${caseText(rest)}`, prior: Math.max(prev.prior, r.prior), paradigm: `${r.lemma}|noun` };
    }
  }
  return res;
}

const ADJ_POS: PartOfSpeech[] = ['ADJ', 'DET', 'NUM'];

/** Adjectives the word list vouches for: -ा / -े / -ी, or unchanged. Never guessed for a lemma nobody vouched for. */
export function adjReadings(w: string, o: string, ctx: Ctx): Raw[] {
  if (!ctx.hasList) return [];
  const out: Raw[] = [];
  const last = w[w.length - 1];
  const cands: string[] = [];
  if (last === 'ा') cands.push(o);
  else if (last === 'े' || last === 'ी') cands.push(o.slice(0, -1) + 'ा'); // -ये / -यी (older) and -े / -ी: नये → नया
  else if (last === 'ए' || last === 'ई') cands.push(o.slice(0, -1) + 'या'); // नए → नया
  const invariantSelf = last !== 'ा';
  const firstPos = (l: string): PartOfSpeech | undefined => ADJ_POS.find((p) => ctx.known(l, p));
  for (const l of cands) {
    const pos = firstPos(l);
    if (!pos) continue;
    const info = ctx.info(l, pos);
    if (info?.invariant) {
      if (l === o) out.push({ lemma: l, pos, morph: {}, rule: 'adjective that does not change', known: true, tier: 'rule', prior: 1, paradigm: `${l}|adj` });
      continue;
    }
    for (const f of adjForms(l)) {
      const older = isYaLemma(l) && f.form !== l && glide(f.form) === w;
      if (f.form !== w && !older) continue;
      const rule = isYaLemma(l) && f.form !== l
        ? `adjective in -या: ${adjText(f.morph)}; the -य- of ${l} is not written before -ए / -ई in today's standard spelling (${l} → ${f.form}), so the form looks shorter${older ? '; this is the older spelling, which keeps the -य-' : ''}`
        : `adjective in -ा: ${adjText(f.morph)}`;
      out.push({ lemma: l, pos, morph: { ...f.morph }, rule, known: true, tier: 'rule', prior: 1, paradigm: `${l}|adj` });
    }
  }
  if (invariantSelf && kindOf(w) !== 'aa') {
    const pos = firstPos(o);
    if (pos) out.push({ lemma: o, pos, morph: {}, rule: 'adjective that does not change', known: true, tier: 'rule', prior: 0.9, paradigm: `${o}|adj` });
  }
  return out;
}

export function adjText(m: Record<string, string>): string {
  const g = m.Gender === 'Masc' ? 'masculine' : 'feminine';
  const n = m.Number === 'Plur' ? 'plural' : 'singular';
  return m.Case ? `${g}, ${CASE_WORD[m.Case] ?? ''} ${n}` : `${g} ${n}`;
}
