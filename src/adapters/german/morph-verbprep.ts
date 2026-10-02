/**
 * Which verbs carry an inseparable prefix (and so take no ge- in the participle). The lexicon decides separability
 * for the 'dual' prefixes; this module only knows the spelling.
 */

/** Prefixes that never split: longest first. */
export const INSEPARABLE_PREFIXES = ['emp', 'ent', 'miss', 'zer', 'ver', 'be', 'er', 'ge'] as const;

/** Prefixes that split or not depending on the verb; a verb the lexicon holds WITHOUT a separable prefix is inseparable. */
export const DUAL_PREFIXES = ['wieder', 'wider', 'hinter', 'unter', 'durch', 'über', 'um'] as const;

/**
 * Weak verbs that only begin with those letters (bellen → gebellt, beten → gebetet, erben → geerbt, geigen → gegeigt).
 * A strong verb like this needs no entry: its participle is listed. A weak one outside this list is read as prefixed.
 */
const NOT_PREFIXED = new Set([
  'beben', 'beizen', 'bellen', 'beten', 'betten', 'betteln', 'bessern', 'beugen', 'beulen', 'beuteln', 'besen',
  'erben', 'erden', 'ernten', 'entern', 'zerren', 'geigen', 'gellen', 'gerben', 'geifern',
]);

/**
 * Does the verb begin with an inseparable prefix? `dual` also counts the dual prefixes (for a verb the lexicon holds
 * with no separable prefix: umfahren, übersetzen).
 */
export function hasInseparablePrefix(lemma: string, dual: boolean): boolean {
  if (NOT_PREFIXED.has(lemma)) return false;
  const list: readonly string[] = dual ? [...INSEPARABLE_PREFIXES, ...DUAL_PREFIXES] : INSEPARABLE_PREFIXES;
  return list.some((p) => lemma.startsWith(p) && lemma.length - p.length >= 3);
}

/** The inseparable or dual prefix a compound of an irregular verb begins with (vermögen → ver), when `front` is exactly one. */
export function isPrefixText(front: string): boolean {
  return (INSEPARABLE_PREFIXES as readonly string[]).includes(front) || (DUAL_PREFIXES as readonly string[]).includes(front);
}
