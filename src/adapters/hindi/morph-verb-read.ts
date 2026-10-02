/**
 * Hindi verb forms by rule: analysis and paradigm listing (package H2, docs/PLAN12.md). Machine-drafted.
 *
 * Analysis never guesses a reading: it proposes (stem, class, slot) from the ending of the written form, GENERATES that
 * slot's forms with the same code `inflectVerb` uses, and keeps the reading only when the generated form is the
 * written form. The ending index is built once, from one probe stem per class, so spelling alternations (पी → पि+ए,
 * छू → छु+आ, ले → ल+ूँ) are learned from the generator and never written down twice.
 */
import type { PartOfSpeech, WordPart } from '../../core';
import { consonantCount, fold } from './morph-orth';
import type { Ctx, Raw } from './morph-types';
import { causativeBase, type Causative } from './morph-causative';
import { AUX_PLURAL_NOTE, AUX_PLURAL_PENALTY, IRREG, SLOTS, slotCanon, slotForms, stemClass, validStemStart, type Cls } from './morph-verb';

interface TailEntry { cls: Cls; si: number; rest: string }
interface IrrEntry { stem: string; cls: Cls; si: number }

const PROBE: Record<Cls, string> = { C: 'बोल', A: 'खा', I: 'जी', U: 'छू', E: 'खे', O: 'सो' };
const CLASS_NOTE: Record<Cls, string> = { C: 'consonant-stem', A: '-ा stem', I: '-ी stem', U: '-ू stem', E: '-े stem', O: '-ो stem' };

/** The weakest ending a lemma nobody vouched for is guessed from. */
export const MIN_GUESS = 0.2;

/** Stems of the commonest verbs: a rule-only guess of one of these is likelier than the same ending on an unknown stem (ordering only; no gloss). */
const COMMON = new Set(['कर', 'जा', 'आ', 'हो', 'दे', 'ले', 'कह', 'देख', 'बोल', 'चल', 'रह', 'सुन', 'पढ़', 'लिख', 'खा', 'पी', 'सो', 'रो', 'बैठ', 'उठ', 'मिल', 'पा', 'लग', 'बन', 'रख', 'समझ', 'सोच', 'खेल', 'पूछ', 'बता', 'बुला', 'भेज', 'मान', 'जान', 'चाह', 'छोड़', 'पकड़', 'खोल', 'सीख', 'गिर', 'ला', 'दौड़', 'सो', 'हँस', 'रुक', 'उड़', 'चढ़']);

let TAILS: Map<string, TailEntry[]> | undefined;
let IRRIDX: Map<string, IrrEntry[]> | undefined;
let MAXTAIL = 0;

function commonPrefix(a: string, b: string): number {
  let i = 0;
  while (i < a.length && i < b.length && a[i] === b[i]) i++;
  return i;
}

function build(): void {
  if (TAILS) return;
  const tails = new Map<string, TailEntry[]>();
  const irr = new Map<string, IrrEntry[]>();
  for (const cls of Object.keys(PROBE) as Cls[]) {
    const probe = PROBE[cls];
    SLOTS.forEach((slot, si) => {
      for (const f of slotForms(probe, cls, slot)) {
        const ff = fold(f);
        const cp = commonPrefix(probe, ff);
        const tail = ff.slice(cp);
        if (!tail) continue; // the bare stem itself: found through the stem, never through an ending
        const list = tails.get(tail) ?? [];
        if (!list.some((e) => e.cls === cls && e.si === si && e.rest === probe.slice(cp))) list.push({ cls, si, rest: probe.slice(cp) });
        tails.set(tail, list);
        if (tail.length > MAXTAIL) MAXTAIL = tail.length;
      }
    });
  }
  for (const stem of Object.keys(IRREG)) {
    const cls = stemClass(stem)!;
    SLOTS.forEach((slot, si) => {
      if (!IRREG[stem][slot.id]) return;
      for (const f of slotForms(stem, cls, slot)) {
        const k = fold(f);
        const list = irr.get(k) ?? [];
        list.push({ stem, cls, si });
        irr.set(k, list);
      }
    });
  }
  IRRIDX = irr;
  TAILS = tails;
}

/** A stem the rules alone may be believed about: not a lone consonant, and the rare vowel classes only for their few real stems. */
export function plausibleStem(stem: string, cls: Cls): boolean {
  switch (cls) {
    case 'C': return consonantCount(stem) >= 2 && !/[ािीुूो]य$/.test(stem) && !stem.endsWith('ीज');
    case 'A': return consonantCount(stem) >= 1 || stem === 'आ';
    case 'O': return consonantCount(stem) >= 1;
    case 'I': case 'U': return stem.length <= 3 && consonantCount(stem) === 1;
    case 'E': return stem === 'ले' || stem === 'दे';
  }
}

function emit(out: Raw[], seen: Set<string>, ctx: Ctx, stem: string, cls: Cls, si: number, w: string, o: string, memo: Map<string, Causative | null>): void {
  const key = stem + '|' + si;
  if (seen.has(key)) return;
  seen.add(key);
  const slot = SLOTS[si];
  const forms = slotForms(stem, cls, slot);
  let hit = false;
  for (const f of forms) if (fold(f) === w) { hit = true; break; }
  if (!hit) return;
  const lemma = stem + 'ना';
  const known = ctx.knownVerb(lemma);
  const irregular = !!IRREG[stem]?.[slot.id];
  // गया, किया, हुआ, है, था: the form itself says which verb it is, whether or not the word list vouches for the lemma
  const certain = irregular && !known;
  // a causative of a verb the word list vouches for (करवाना ← करना, बनाना ← बनना), by rule
  let derived: Causative | null | undefined = irregular || cls !== 'A' ? null : memo.get(stem);
  if (derived === undefined) { derived = causativeBase(stem, ctx) ?? null; memo.set(stem, derived); }
  const derivedGuess = !known && !certain && !!derived && slot.evid > 0;
  // a consonant stem + bare -ा / -े / -ी is what countless nouns and adjectives end in too: guessed only for the commonest verbs
  const guessEvid = (cls === 'C' && (slot.id === 'pf_ms' || slot.id === 'pf_mp' || slot.id === 'pf_f') ? 0.15 : slot.evid) + (stem.endsWith('वा') && stem.length >= 4 ? 0.25 : 0);
  if (!known && !certain && !derivedGuess && (guessEvid + (COMMON.has(stem) ? 0.2 : 0) < MIN_GUESS || !plausibleStem(stem, cls))) return;
  // समानता, सुंदरता: an abstract noun from a vouched adjective / noun, not the participle of an invented verb
  if (!known && !certain && slot.id === 'ipf_ms' && (ctx.known(stem, 'ADJ') || ctx.known(stem, 'NOUN'))) return;
  const pos: PartOfSpeech = stem === 'हो' ? 'AUX' : 'VERB';
  const info = known ? ctx.info(lemma, 'VERB') ?? ctx.info(lemma, 'AUX') : undefined;
  const cau: Causative | undefined = info?.causativeOf ? { base: info.causativeOf, kind: stem.endsWith('वा') ? 'second' : 'first' } : derived ?? undefined;
  const rule = `${slot.label} of the ${irregular ? 'irregular' : CLASS_NOTE[cls]} verb ${lemma}${cau ? ` (causative of ${cau.base}: to have / make someone ${cau.base})` : ''}`;
  let parts: WordPart[] | undefined;
  if (slot.id.startsWith('conv_') && stem.length < w.length) {
    parts = [
      { text: o.slice(0, stem.length), start: 0, end: stem.length, lemma, pos: 'VERB', kind: 'stem', morph: { VerbForm: 'Stem' } },
      { text: o.slice(stem.length), start: stem.length, end: o.length, kind: 'marker', role: 'conjunctive marker: having done' },
    ];
  }
  const base = known ? 1 : certain ? 0.6 : derivedGuess ? 0.6 : Math.min(0.58, guessEvid + (COMMON.has(stem) ? 0.2 : 0) + (cls === 'E' ? 0.02 : 0));
  const tier = known ? 'rule' : certain ? 'closed' : 'guess';
  for (const m of slot.morphs) {
    const morph = { ...m };
    if (cau) morph.Voice = 'Cau';
    const group = slot.auxPlural ? `${lemma}|${pos}|${slot.id}|fem-i` : undefined;
    const reading: Raw = { lemma, pos, morph, ...(parts ? { parts: parts.map((p) => ({ ...p })) } : {}), ...(cau ? { notes: { derivedFrom: cau.base, causative: cau.kind } } : {}), rule, known, tier, prior: base, paradigm: lemma, ...(group ? { group } : {}) };
    out.push(reading);
    // -ी is also the plural when a plural auxiliary follows; a little behind the singular, so the singular stays first
    if (slot.auxPlural) out.push({ ...reading, morph: { ...morph, Number: 'Plur' }, rule: `${rule}; ${AUX_PLURAL_NOTE}`, prior: base - AUX_PLURAL_PENALTY, penalty: AUX_PLURAL_PENALTY });
    // रहा / रहे / रही: the same participle is the progressive auxiliary (कर रहा है), far the commoner use
    if (stem === 'रह' && slot.id.startsWith('pf_')) {
      const auxKnown = ctx.knownVerb(lemma);
      const progRule = 'progressive auxiliary: the perfective participle of रहना before है / था (कर रहा है)';
      const prog: Raw = {
        lemma, pos: 'AUX', morph: { ...morph, Aspect: 'Prog' }, rule: progRule,
        known: auxKnown, tier: auxKnown ? 'rule' : 'guess', prior: base + 0.05, paradigm: lemma,
        // (रहना has no irregular forms, so this reading is never `certain`)
        ...(slot.auxPlural ? { group: `${lemma}|AUX|${slot.id}|fem-i` } : {}),
      };
      out.push(prog);
      if (slot.auxPlural) out.push({ ...prog, morph: { ...prog.morph, Number: 'Plur' }, rule: `${progRule}; ${AUX_PLURAL_NOTE}`, prior: prog.prior - AUX_PLURAL_PENALTY, penalty: AUX_PLURAL_PENALTY });
    }
  }
}

/** Every verb reading of the folded form `w`. */
export function verbReadings(w: string, o: string, ctx: Ctx): Raw[] {
  build();
  const out: Raw[] = [];
  const seen = new Set<string>();
  const memo = new Map<string, Causative | null>();
  const irr = IRRIDX!.get(w);
  if (irr) for (const e of irr) emit(out, seen, ctx, e.stem, e.cls, e.si, w, o, memo);
  const maxk = Math.min(MAXTAIL, w.length - 1);
  for (let k = 1; k <= maxk; k++) {
    const ents = TAILS!.get(w.slice(w.length - k));
    if (!ents) continue;
    const head = o.slice(0, w.length - k);
    for (const e of ents) {
      const stem = head + e.rest;
      if (stemClass(stem) !== e.cls || !validStemStart(stem)) continue;
      emit(out, seen, ctx, stem, e.cls, e.si, w, o, memo);
    }
  }
  // the bare stem (before a second verb: कह दिया), the command to तू, and the few forms that are the stem itself
  if (ctx.hasList && w.length >= 1 && validStemStart(w)) {
    const cls = stemClass(w);
    if (cls && ctx.knownVerb(o + 'ना')) for (let si = 0; si < SLOTS.length; si++) emit(out, seen, ctx, o, cls, si, w, o, memo);
  }
  return out;
}

/** A verb lemma's forms with their features. */
export function inflectVerb(lemma: string, causativeOf?: string): Array<{ form: string; morph: Record<string, string> }> {
  const stem = lemma.endsWith('ना') && lemma.length > 2 ? lemma.slice(0, -2) : undefined;
  if (!stem) return [];
  const cls = stemClass(stem);
  if (!cls || !validStemStart(stem)) return [];
  const rows: Array<{ form: string; morph: Record<string, string> }> = [];
  for (const slot of SLOTS) {
    for (const form of slotCanon(stem, cls, slot)) {
      for (const m of slot.morphs) {
        const morph = { ...m };
        if (causativeOf) morph.Voice = 'Cau';
        rows.push({ form, morph });
        if (stem === 'रह' && slot.id.startsWith('pf_')) rows.push({ form, morph: { ...morph, Aspect: 'Prog' } });
        // the -ी form is also the plural before a plural helping verb (beside the -ीं form of the plural cell)
        if (slot.auxPlural) {
          rows.push({ form, morph: { ...morph, Number: 'Plur' } });
          if (stem === 'रह' && slot.id.startsWith('pf_')) rows.push({ form, morph: { ...morph, Aspect: 'Prog', Number: 'Plur' } });
        }
      }
    }
  }
  return rows;
}
