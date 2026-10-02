/**
 * Attached pronouns (clitics) in Spanish: decir + se + lo = decírselo, dar + me + lo = dámelo, ir + nos = vámonos,
 * callar + os = callaos. This file finds the possible splits of a written form and rebuilds the written form from a
 * verb form and its pronouns (so a split is only used when it round-trips); morphology.ts supplies the verb readings.
 */
import type { PartOfSpeech, WordPart } from '../../core';
import { addAccent, stripAccents, transferStress } from './morph-orth';

const CLITIC_SET = ['nos', 'los', 'las', 'les', 'me', 'te', 'se', 'lo', 'la', 'le', 'os'];
const DIRECT = ['lo', 'la', 'los', 'las'];
const FIRST_OF_TWO = ['se', 'me', 'te', 'nos', 'os'];

export interface Peeling { rest: string; clitics: string[] }

/** Every way to read the end of a word as one or two attached pronouns (rest + clitics = form). */
export function peelClitics(form: string): Peeling[] {
  const out: Peeling[] = [];
  for (const c2 of CLITIC_SET) {
    if (!form.endsWith(c2) || form.length <= c2.length + 1) continue;
    const rest = form.slice(0, -c2.length);
    out.push({ rest, clitics: [c2] });
    if (DIRECT.includes(c2)) {
      for (const c1 of FIRST_OF_TWO) if (rest.endsWith(c1) && rest.length > c1.length + 1) out.push({ rest: rest.slice(0, -c1.length), clitics: [c1, c2] });
    }
  }
  return out;
}

/** A pronoun is a plain word only if it appears exactly as written: casing stays the writer's. */
export const lowerClitics = (cl: string[]): string[] => cl.map((c) => c.toLowerCase());

/**
 * The written form of `verb` with `clitics` attached, the stress staying where it was.
 *   dropS: the -s of the hortative -mos goes before nos, os and se (vamos + nos → vámonos, digamos + se + lo → digámoselo)
 *   dropD: the -d of the vosotros imperative goes before os (callad + os → callaos)
 */
export function attachClitics(verb: string, clitics: string[], flags: { dropS?: boolean; dropD?: boolean } = {}): string | undefined {
  let base = verb;
  if (flags.dropS) { if (!base.endsWith('s')) return undefined; base = base.slice(0, -1); }
  if (flags.dropD) { if (!base.endsWith('d')) return undefined; base = base.slice(0, -1); }
  const plain = stripAccents(base) + clitics.join('');
  return transferStress(verb, plain, 0);
}

/** Possible verb forms hiding behind `rest`: as written, without its attachment accent, or with the accent a plain verb form carries. */
export function verbCandidates(rest: string, clitics: string[]): Array<{ verb: string; dropS?: boolean; dropD?: boolean }> {
  const plain = stripAccents(rest);
  const bases = new Set<string>([rest, plain]);
  for (let i = 0; i < plain.length; i++) if ('aeiou'.includes(plain[i])) bases.add(plain.slice(0, i) + addAccent(plain[i]) + plain.slice(i + 1));
  const out: Array<{ verb: string; dropS?: boolean; dropD?: boolean }> = [...bases].map((verb) => ({ verb }));
  // the nosotros command loses its -s before nos and os (sentémonos, sentémoos), and before se it is written once (digámoselo)
  if (['nos', 'os', 'se'].includes(clitics[0]) && plain.endsWith('mo')) for (const b of new Set([plain + 's', ...[...bases].filter((x) => x.endsWith('mo')).map((x) => x + 's')])) out.push({ verb: b, dropS: true });
  if (clitics[0] === 'os') for (const b of bases) if (/[aeiouáéíóú]$/.test(b)) out.push({ verb: b + 'd', dropD: true });
  return out;
}

const ROLE_ONE: Record<string, string> = { lo: 'direct object pronoun', la: 'direct object pronoun', los: 'direct object pronoun', las: 'direct object pronoun', se: 'reflexive' };

/** Plain roles for the attached pronouns when the shape settles them; "object pronoun" when it does not. */
export function cliticRoles(clitics: string[]): string[] {
  if (clitics.length === 2) return ['indirect object pronoun', 'direct object pronoun'];
  return [ROLE_ONE[clitics[0]] ?? 'object pronoun'];
}

/** The parts of the written word: the verb (with the attachment accent as written) and each pronoun, tiling the form. */
export function cliticParts(form: string, clitics: string[], verbLemma: string, verbPos: PartOfSpeech, verbMorph: Record<string, string>): WordPart[] {
  const end = form.length - clitics.join('').length;
  const roles = cliticRoles(clitics);
  const parts: WordPart[] = [{ text: form.slice(0, end), start: 0, end, lemma: verbLemma, pos: verbPos, morph: { ...verbMorph } }];
  let at = end;
  clitics.forEach((c, i) => {
    parts.push({ text: form.slice(at, at + c.length), start: at, end: at + c.length, lemma: c, pos: 'PRON', role: roles[i] });
    at += c.length;
  });
  return parts;
}
