/**
 * Language varieties: regional, supranational and historical forms of one language.
 *
 * A course names the variety the learner aims to USE (its active target), the wider varieties that target sits
 * inside, and everything else, which he should recognise but not adopt. Nothing is suppressed: a form from another
 * variety is shown and tracked like any other, with a plain statement of where it belongs. This is what keeps a
 * large historical or foreign corpus from quietly teaching the wrong active language.
 */

export interface Variety {
  /** 'es-HN', 'es-419', 'es-ES', 'es-hist', or a named feature such as 'voseo', 'vosotros'. */
  code: string;
  label: string; // "Honduras", "Latin America (general)", "Spain", "older Spanish", "voseo"
  /** 'heritage': a related literary language read beside the course language (Awadhi, Braj beside Modern Standard Hindi): its own language, not an older stage of this one. */
  kind: 'national' | 'regional' | 'supranational' | 'feature' | 'historical' | 'heritage';
  /** The wider variety it belongs to ('es-HN' → 'es-CA' → 'es-419'). */
  parent?: string;
  note?: string;
}

export interface VarietyPolicy {
  /** The active target ("es-HN"). */
  target: string;
  /** Wider varieties the target sits inside, nearest first ("es-CA", "es-419"): equally fine for active use. */
  within: string[];
  /** Named features that ARE part of the active target although they are regional ("voseo" for Honduras). */
  activeFeatures?: string[];
}

export type VarietyStanding =
  | 'general' // no variety tag: ordinary usage everywhere
  | 'target' // the learner's own target variety or one of its active features
  | 'within-target' // a wider variety the target belongs to
  | 'receptive' // another living variety: recognise it, do not adopt it by default
  | 'historical' // older language: recognise it, never an active target
  | 'heritage'; // a related literary language: read as its own language; it is not evidence about the course language

/**
 * Where a set of variety tags stands for a course. `varieties` maps codes to their definitions (from the adapter),
 * so that parents can be followed; an unknown code is 'receptive' (we do not guess that it is the target).
 */
export function varietyStanding(
  tags: readonly string[] | undefined,
  policy: VarietyPolicy | undefined,
  varieties?: Readonly<Record<string, Variety>>,
): VarietyStanding {
  if (!tags || tags.length === 0) return 'general';
  if (tags.some((t) => varieties?.[t]?.kind === 'heritage')) return 'heritage';
  if (tags.some((t) => varieties?.[t]?.kind === 'historical')) return 'historical';
  if (!policy) return 'receptive';
  const active = new Set([policy.target, ...(policy.activeFeatures ?? [])]);
  if (tags.some((t) => active.has(t))) return 'target';
  // Only the wider varieties themselves count. A sibling national variety (es-MX for an es-HN learner) is receptive
  // even though both sit inside es-419: its parent is not followed.
  const within = new Set(policy.within);
  if (tags.some((t) => within.has(t))) return 'within-target';
  return 'receptive';
}

/** One plain sentence for the word sheet: where the form belongs and what that means for this learner. */
export function varietyLine(
  tags: readonly string[] | undefined,
  policy: VarietyPolicy | undefined,
  varieties?: Readonly<Record<string, Variety>>,
): string | undefined {
  if (!tags || tags.length === 0) return undefined;
  const labels = tags.map((t) => varieties?.[t]?.label ?? t).join(', ');
  switch (varietyStanding(tags, policy, varieties)) {
    case 'general': return undefined;
    case 'target': return `${labels} — part of the language you are aiming to use.`;
    case 'within-target': return `${labels} — ordinary in the wider region you are aiming at.`;
    case 'historical': return `${labels} — older language: recognise it when reading; it is not used this way today.`;
    case 'heritage': return `${labels} — a related literary language, not the language of this course: read it as its own language.`;
    case 'receptive': return `${labels} — used elsewhere: worth recognising, not your default for speaking or writing.`;
  }
}
