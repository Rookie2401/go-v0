/**
 * Shared helpers of the closed-class word list (function-*.ts): a short constructor for a lexeme with its explicit
 * forms, and the step that turns lexemes into readings of written forms. Package Q3.
 *
 * A closed-class lexeme carries ALL its forms in `forms` ("form: tags", the tags of `sqMorph`); a word with a single
 * form and no features has no `forms` and is read as its lemma.
 */
import type { PartOfSpeech } from '../../core';
import { describeSqMorph } from './describe';
import { sqMorph, W } from './types';
import type { SqLexeme, SqReading } from './types';

type Extra = Partial<Omit<SqLexeme, 'lemma' | 'pos' | 'gloss'>>;

/** A closed-class word: F('kush', 'PRON', 'who', ['kush: int', 'kë: acc int', 'kujt: gen dat abl int']). */
export const F = (lemma: string, pos: PartOfSpeech, gloss: string, forms?: string[], extra: Extra = {}): SqLexeme =>
  W(lemma, pos, gloss, { ...(forms ? { forms } : {}), ...extra });

/** "kë: acc int" → { form: 'kë', morph: {...} }; a lexeme without `forms` is read as its lemma with no features. */
export function formsOf(lx: SqLexeme): Array<{ form: string; morph: Record<string, string> }> {
  if (!lx.forms || lx.forms.length === 0) return [{ form: lx.lemma, morph: {} }];
  return lx.forms.map((entry) => {
    const i = entry.indexOf(':');
    const form = (i < 0 ? entry : entry.slice(0, i)).trim();
    const tags = i < 0 ? '' : entry.slice(i + 1);
    return { form, morph: morphOf(tags) };
  });
}

/**
 * `sqMorph` plus two tags it lacks: `pind` (PronType Indefinite) and `pneg` (PronType Negative), because its `ind` is the
 * indicative mood. Asked of the coordinator: add them to the TAGS of types.ts.
 */
function morphOf(tags: string): Record<string, string> {
  const own: Record<string, string> = { pind: 'Ind', pneg: 'Neg' };
  const rest: string[] = [];
  let pronType: string | undefined;
  for (const t of tags.trim().split(/\s+/).filter(Boolean)) {
    if (own[t]) pronType = own[t];
    else rest.push(t);
  }
  const out = sqMorph(rest.join(' '));
  // sqMorph marks anything with a person as a finite verb; a pronoun's person is not that
  if (out.VerbForm === 'Fin' && !out.Tense && !out.Mood) delete out.VerbForm;
  if (pronType) out.PronType = out.PronType ? `${out.PronType},${pronType}` : pronType;
  return out;
}

/** One reading (confidence still to be set by `buildReadings`). */
export function readingOf(lx: SqLexeme, form: string, morph: Record<string, string>): SqReading {
  const described = describeSqMorph(morph, lx.pos);
  const what = morph.PronType === 'Art'
    ? described
    : described
      ? `${described} of ${lx.lemma}`
      : `closed-class word "${form}"${form === lx.lemma ? '' : ` (a form of ${lx.lemma})`}: ${lx.role ?? lx.gloss}`;
  return {
    lemma: lx.lemma,
    pos: lx.pos,
    morph,
    ...(lx.gloss ? { gloss: lx.gloss } : {}),
    confidence: 0.9,
    lemmaKnown: true,
    rule: what,
    origin: 'hand',
    ...(lx.role ? { role: lx.role } : {}),
    ...(lx.varieties ? { varieties: lx.varieties } : {}),
    ...(lx.register ? { register: lx.register } : {}),
    ...(lx.articulated ? { articulated: true } : {}),
    ...(lx.governs ? { governs: lx.governs } : {}),
  };
}

/**
 * Every reading of every form, best first. `posFirst` fixes the order of competing parts of speech for a form (the
 * order of the lexemes in the list decides the rest). Confidence: a single reading 0.9 (0.6 when the form has a reading
 * that another word list owns, `competes`); several readings 0.6, 0.55, 0.5 … until the sentence decides.
 */
export function buildReadings(
  lexemes: readonly SqLexeme[],
  posFirst: Readonly<Record<string, readonly PartOfSpeech[]>>,
  competes: ReadonlySet<string>,
): Map<string, SqReading[]> {
  const map = new Map<string, SqReading[]>();
  for (const lx of lexemes) {
    for (const { form, morph } of formsOf(lx)) {
      const list = map.get(form) ?? [];
      list.push(readingOf(lx, form, morph));
      map.set(form, list);
    }
  }
  for (const [form, list] of map) {
    const hint = posFirst[form];
    const rank = (r: SqReading): number => {
      const k = hint ? hint.indexOf(r.pos) : -1;
      return k < 0 ? 99 : k;
    };
    const sorted = list.map((r, i) => ({ r, i })).sort((a, b) => rank(a.r) - rank(b.r) || a.i - b.i).map((x) => x.r);
    sorted.forEach((r, i) => {
      r.confidence = sorted.length === 1 ? (competes.has(form) ? 0.6 : 0.9) : Math.max(0.2, Math.round((0.6 - 0.05 * i) * 100) / 100);
    });
    map.set(form, sorted);
  }
  return map;
}
