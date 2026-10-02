/**
 * Short object pronouns and what they fuse into: ma = më + e, t'i = të + i, s'jam = s' + jam, jepma = jep + më + e.
 * One written token, several grammatical words. Package Q3.
 * STUB written by the coordinator: the signatures are final (docs/PLAN13.md), the body is the owning package's work.
 */
import type { SqClitic, SqCluster, SqReading } from './types';

export const SQ_CLITICS: SqClitic[] = [];
export const SQ_CLUSTERS: SqCluster[] = [];

/**
 * Readings of a written form that is a clitic, a fused cluster, a particle fused with a clitic (t'i, t'u, ta), or a
 * word with an apostrophe prefix (s'jam, ç'është, m'u). `verb` reads the rest of an apostrophe form or the stem of a
 * form with attached pronouns (it is the engine's own verb analysis, passed in so this file does not import it).
 * Empty when the form is none of these.
 */
export function cliticReadings(_form: string, _verb: (form: string) => SqReading[]): SqReading[] {
  return [];
}
