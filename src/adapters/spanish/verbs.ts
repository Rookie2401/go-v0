/**
 * Spanish verb generator, part 4: pick the right paradigm for a lemma and cache its forms.
 *   irregular table → prefixed relative of an irregular (mantener) → -ducir family → listed stem-changer →
 *   (assumed class, only when the caller asks) → regular.
 */
import { IRREGULAR, IRREGULAR_PARTICIPLES, strongPret, takesPrefix } from './verb-irregular';
import { generateForms, regularParadigm, stemOf, withPrefix, type FormRec, type Paradigm } from './verb-regular';
import { stemChangeParadigm, stemClassOf, type StemClass } from './verb-stem';

export interface Conjugation {
  forms: FormRec[];
  /** How the paradigm was chosen: 'irregular' (a table, possibly through a prefix), 'stem-change', 'regular' or 'assumed'. */
  kind: 'irregular' | 'stem-change' | 'regular' | 'assumed';
  /** For 'assumed': the stem-change class the analyser supposed (the lemma is on no list). */
  assumed?: string;
  /** form → its readings; built on first use by `formsMatching`. */
  index?: Map<string, FormRec[]>;
}

const cache = new Map<string, Conjugation | null>();
const CAP = 1500;

const isFutureOrCnd = (r: FormRec) => (r.morph.Mood === 'Ind' && r.morph.Tense === 'Fut') || r.morph.Mood === 'Cnd';
const isTuImperative = (r: FormRec) => r.morph.Mood === 'Imp' && r.morph.Person === '2' && r.morph.Number === 'Sing' && !r.varieties?.includes('voseo');

/** predecir, contradecir …: like decir, but the imperative is predice and the future may be regular; bendecir, maldecir: regular future and participle. */
function decirFamily(lemma: string, prefix: string, forms: FormRec[]): FormRec[] {
  const reg = generateForms(regularParadigm(lemma)!);
  const regular = (pick: (r: FormRec) => boolean) => reg.filter(pick);
  const plain = prefix === 'ben' || prefix === 'mal';
  let out = forms.filter((r) => !isTuImperative(r));
  out.push({ form: prefix + 'dice', morph: { VerbForm: 'Fin', Mood: 'Imp', Person: '2', Number: 'Sing' } });
  if (plain) out = out.filter((r) => !isFutureOrCnd(r) && r.morph.VerbForm !== 'Part');
  out.push(...regular((r) => (plain ? isFutureOrCnd(r) || r.morph.VerbForm === 'Part' : isFutureOrCnd(r))));
  return out;
}

/** Replace the regular participle where the verb has an irregular one (volver → vuelto, escribir → escrito). */
function withParticiple(lemma: string, p: Paradigm): Paradigm {
  const part = IRREGULAR_PARTICIPLES.get(lemma);
  return part ? { ...p, over: { ...p.over, part } } : p;
}

function build(lemma: string, assume?: StemClass): Conjugation | null {
  const direct = IRREGULAR[lemma];
  if (direct) return { forms: generateForms(direct.build()), kind: 'irregular' };
  for (const [base, e] of Object.entries(IRREGULAR)) {
    if (!e.prefixes || lemma.length <= base.length || !lemma.endsWith(base)) continue;
    const prefix = lemma.slice(0, lemma.length - base.length);
    if (!takesPrefix(e, prefix)) continue;
    let forms = generateForms(e.build()).map((r) => ({ ...r, form: withPrefix(prefix, r.form) }));
    if (base === 'decir') forms = decirFamily(lemma, prefix, forms);
    return { forms, kind: 'irregular' };
  }
  if (/.ducir$/.test(lemma)) {
    const p = regularParadigm(lemma);
    if (p) return { forms: generateForms({ ...p, kind: 'irregular', over: Object.fromEntries(strongPret(lemma.slice(0, -3) + 'j').map((f, i) => [`pret.${['1s', '2s', '3s', '1p', '2p', '3p'][i]}`, [f]])) }), kind: 'irregular' };
  }
  const cls = stemClassOf(lemma);
  if (cls) {
    const p = stemChangeParadigm(lemma, cls);
    if (p) return { forms: generateForms(withParticiple(lemma, p)), kind: 'stem-change' };
  }
  if (assume) {
    const p = stemChangeParadigm(lemma, assume, `${assume.kind}${assume.shift ? ' (-ir shift)' : ''}`);
    return p ? { forms: generateForms(p), kind: 'assumed', assumed: p.assumed } : null;
  }
  const p = regularParadigm(lemma);
  return p ? { forms: generateForms(withParticiple(lemma, p)), kind: 'regular' } : null;
}

/** Every form of a verb, or undefined when the lemma is not a verb shape the engine can conjugate. */
export function conjugateLemma(lemma: string, assume?: StemClass): Conjugation | undefined {
  const key = assume ? `${lemma}|${assume.kind}|${assume.shift}` : lemma;
  const hit = cache.get(key);
  if (hit !== undefined) return hit ?? undefined;
  const made = stemOf(lemma) || IRREGULAR[lemma] ? build(lemma, assume) : null;
  if (cache.size > CAP) { let n = 0; for (const k of cache.keys()) { cache.delete(k); if (++n > CAP / 2) break; } }
  cache.set(key, made);
  return made ?? undefined;
}

/** Is this lemma on a stem-change list or an irregular table (so its class is a known fact, not an assumption)? */
export function classIsKnown(lemma: string): boolean {
  const c = conjugateLemma(lemma);
  return !!c && c.kind !== 'regular';
}

/** The readings of `conj` whose written form is `w` (an indexed lookup, not a scan of the whole paradigm). */
export function formsMatching(conj: Conjugation, w: string): FormRec[] {
  let idx = conj.index;
  if (!idx) {
    idx = new Map();
    for (const f of conj.forms) { const l = idx.get(f.form); if (l) l.push(f); else idx.set(f.form, [f]); }
    conj.index = idx;
  }
  return idx.get(w) ?? [];
}
