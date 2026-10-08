/**
 * Verb rows and the verb paradigm generator (Bokmål and Nynorsk). MACHINE-DRAFTED, pending native review.
 *
 * Row format:   infinitive/class[flags] = gloss [| [present,] past, supine] [^] [#register]
 *
 * Bokmål classes (recon B4):   1 = -et / -a  (kaste: kastet or kasta, both valid)    2 = -te, -t    3 = -de, -d
 *                              4 = -dde, -dd (infinitive in a stressed vowel)         s = strong or irregular: parts listed
 * Nynorsk classes:             a = a-verb (kasta: kastar, kasta, kasta)    e = e-verb (kjøper, kjøpte, kjøpt)
 *                              s = strong or irregular: parts listed (present is the bare stem unless given)
 *
 * Flags after the class: `r` reflexive (lemma keeps no "seg"; notes.reflexive), `d` deponent (-s verb that is its own
 * lemma: synes, finnes), `x` auxiliary-like (AUX).
 * Parts: `past,supine` or `present,past,supine`; alternatives joined by `/` (ga/gav). `^` after the gloss = at least one
 * cell is unverified (the recon marks it (?) or the author is unsure).
 */
import type { RegisterTag } from '../../core';
import type { NoStandard, NoVerb } from './types';

const endsE = (w: string): boolean => /e$/.test(w);
const VOW = /[aeiouyæøå]/;

/** Imperative: the bare stem, with the stem's -e kept after consonant + l/n/r (åpne, sykle, lagre) and mm reduced (kom). */
export function imperativeOf(inf: string, stem: string): string[] {
  if (!endsE(inf)) return [inf];
  if (/[^aeiouyæøåhlnr][lnr]$/.test(stem) && !/(.)\1$/.test(stem) && !/[gk]n$/.test(stem)) return [inf];
  if (/mm$/.test(stem)) return [stem.slice(0, -1)];
  return [stem];
}

function splitAlt(s: string): string[] {
  return s.split('/').map((x) => x.trim()).filter(Boolean);
}

function stemOf(inf: string): string {
  return endsE(inf) ? inf.slice(0, -1) : inf;
}

export function parseVerbRows(src: string, std: NoStandard): NoVerb[] {
  const out: NoVerb[] = [];
  for (const line of src.split('\n')) {
    const s = line.trim();
    if (!s || s.startsWith('//')) continue;
    const eq = s.indexOf('=');
    if (eq < 0) throw new Error(`verb row without "=": ${s}`);
    const head = s.slice(0, eq).trim();
    let rest = s.slice(eq + 1).trim();
    const register: RegisterTag[] = [];
    let unverified = false;
    for (;;) {
      const m = /\s(\^|#[a-z-]+)$/.exec(rest);
      if (!m) break;
      if (m[1] === '^') unverified = true; else register.push(m[1].slice(1) as RegisterTag);
      rest = rest.slice(0, m.index).trim();
    }
    const bar = rest.indexOf('|');
    const gloss = (bar < 0 ? rest : rest.slice(0, bar)).trim();
    const parts = bar < 0 ? [] : rest.slice(bar + 1).split(',').map((x) => x.trim());
    const m = /^([^/]+)\/([1234saex])([rdx]*)$/.exec(head);
    if (!m) throw new Error(`bad verb row head: ${head}`);
    const [, inf, cls, flags] = m;
    const stem = stemOf(inf);
    const vowelFinal = !endsE(inf) && VOW.test(inf[inf.length - 1]);
    const stemForSuffix = vowelFinal ? inf : stem;
    let present: string[];
    let past: string[];
    let supine: string[];
    const explicit = parts.length === 3 ? parts : parts.length === 2 ? [undefined, parts[0], parts[1]] : [undefined, undefined, undefined];
    const [pPres, pPast, pSup] = explicit as Array<string | undefined>;

    if (std === 'nb') {
      present = pPres ? splitAlt(pPres) : [vowelFinal ? `${inf}r` : `${stem}er`];
      if (pPast) { past = splitAlt(pPast); supine = splitAlt(pSup as string); }
      else if (cls === '1') { past = [`${stem}et`, `${stem}a`]; supine = [`${stem}et`, `${stem}a`]; }
      else if (cls === '2') { const s1 = stem.replace(/(.)\1$/, '$1'); past = [`${s1}te`]; supine = [`${s1}t`]; }
      else if (cls === '3') { past = [`${stem}de`]; supine = [`${stem}d`]; }
      else if (cls === '4') { past = [`${stemForSuffix}dde`]; supine = [`${stemForSuffix}dd`]; }
      else throw new Error(`strong verb "${inf}" needs parts`);
    } else {
      present = pPres ? splitAlt(pPres) : cls === 'a' ? [`${stem}ar`] : cls === 'e' ? [vowelFinal ? `${inf}r` : `${stem}er`] : [stem];
      if (pPast) { past = splitAlt(pPast); supine = splitAlt(pSup as string); }
      else if (cls === 'a') { past = [`${stem}a`]; supine = [`${stem}a`]; }
      else throw new Error(`Nynorsk verb "${inf}" needs parts`);
    }

    const infinitives = std === 'nn' && endsE(inf) ? nnInfinitives(inf) : [inf];
    const passive = flags.includes('d') || vowelFinal ? [] : std === 'nb' ? [`${endsE(inf) ? stem : inf}${endsE(inf) ? 'es' : 's'}`] : [`${stem}ast`];
    const deponent = flags.includes('d');
    out.push({
      lemma: inf, infinitives, cls: cls as NoVerb['cls'], gloss,
      present: deponent && !pPres ? [inf] : present, past, supine, participleAdj: [],
      imperative: deponent ? [] : imperativeOf(inf, stem), passive,
      deponent: deponent || undefined, reflexive: flags.includes('r') || undefined, aux: flags.includes('x') || undefined,
      source: 'machine-draft', unverified: unverified || undefined, register: register.length ? register : undefined,
    });
  }
  return out;
}

/** Every valid Nynorsk infinitive of an -e verb: -e and -a, and the short stem beside -kje / -gje / -tje (tenkje, tenke; syngje, synge). */
export function nnInfinitives(inf: string): string[] {
  const stem = inf.slice(0, -1);
  const out = [inf, `${stem}a`];
  const short = inf.replace(/kkje$/, 'kke').replace(/ggje$/, 'gge').replace(/tje$/, 'tte').replace(/kje$/, 'ke').replace(/gje$/, 'ge');
  if (short !== inf) out.push(short, `${short.slice(0, -1)}a`);
  return out;
}
