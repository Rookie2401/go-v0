/**
 * May this document ship in a production build? One rule, used by the build itself (server/rightsGate.ts removes or
 * refuses documents while Vite bundles) and by `npm run rights:check`. Rights are enforced by the machine here, not by
 * a README or by memory:
 *
 *   bundle   written for the course (owner-authored / generated), or a public-domain or licensed text that carries
 *            its verification: Scripture with an identified translation and a `scripture.verification` record; any
 *            other text through a catalogue work whose rights state a person recorded as verified
 *   exclude  rights unverified or not stated: the document stays in the repository for development and tests, and is
 *            NOT in a production bundle (it was never published; now it is not shipped either). Also: a text with no
 *            recorded rights basis for a jurisdiction the build is released in (`RightsContext.release`)
 *   refuse   a claim without its evidence ("public-domain" with no verification), or content that can never be
 *            bundled (a learner's own copy, private writing): the build stops
 *
 * THREE DIFFERENT FACTS, never one standing in for another:
 *   wording verified   the text is, verse for verse, the text of its source (`scripture.verification`): source fidelity
 *   rights recorded    the catalogue work says who established the rights state and when (`WorkRights.state`, verifiedBy)
 *   jurisdictions      for which jurisdictions that basis was recorded (`WorkRights.statusByJurisdiction`)
 * A wording-verification record proves nothing about rights. `BundleDecision.facts` states each apart. Passing this
 * gate means the RECORDS are present and consistent; it is not a legal opinion.
 *
 * There is no state that means "probably public domain". Pure and dependency-free: it is imported by the Vite config.
 */

export type BundleVerdict = 'bundle' | 'exclude' | 'refuse';

export interface BundleDecision {
  verdict: BundleVerdict;
  /** One plain sentence: why. */
  reason: string;
  /** What is on record, each fact apart (present for public-domain and licensed texts). */
  facts?: {
    /** Source fidelity: "against <source> on <date>", or undefined when the text carries no wording verification. */
    wording?: string;
    /** The catalogue's rights record: "work "<slug>": <state>, verified by <who> on <date>", or why there is none. */
    rights?: string;
    /** Jurisdictions with a recorded status that allows distribution ("US, DE, EU"), or "none recorded". */
    jurisdictions?: string;
  };
}

/** The catalogue rights states that allow bundling (src/core/course.ts `RightsState`). */
export const BUNDLABLE_WORK_STATES: readonly string[] = ['verified-public-domain', 'verified-open-licence', 'permission-granted', 'course-authored'];

/** The statuses of `WorkRights.statusByJurisdiction` under which a text may be distributed in that jurisdiction. */
export const DISTRIBUTABLE_STATUSES: readonly string[] = ['public-domain', 'licensed'];

export interface WorkRightsRecord { state?: string; verifiedBy?: string; verifiedAt?: string; statusByJurisdiction?: Readonly<Record<string, string>> }

export interface RightsContext {
  /** The rights record of the catalogue work a document belongs to (by `doc.lang` and `doc.work.slug`). */
  work?(lang: string, slug: string): WorkRightsRecord | undefined;
  /**
   * The jurisdictions this build is released in ("US", "DE", "EU"). When given, a public-domain or licensed text is left
   * out unless its work records a distributable status for EVERY one of them: a statement for one country is not a
   * statement for another. Absent = the build makes no claim about where it may be distributed, and nothing is left out
   * on this ground.
   */
  release?: readonly string[];
}

interface DocLike {
  curriculum?: { lifecycle?: unknown; rejectionReasons?: unknown };
  id?: unknown; lang?: unknown; contentType?: unknown;
  source?: { rights?: unknown; licenseNote?: unknown; attribution?: unknown };
  scripture?: { translationId?: unknown; edition?: unknown; role?: unknown; verification?: { against?: unknown; checkedAt?: unknown; method?: unknown; by?: unknown } };
  work?: { slug?: unknown };
}

const text = (v: unknown): v is string => typeof v === 'string' && v.trim().length > 0;

/**
 * The jurisdictions for which a work records a status that allows distribution. The key "*" records a basis that holds
 * everywhere by its nature (a licence the rights holder grants worldwide); a public-domain status is never worldwide by
 * nature and should be recorded country by country.
 */
export function recordedJurisdictions(w: WorkRightsRecord | undefined): string[] {
  return Object.entries(w?.statusByJurisdiction ?? {}).filter(([, s]) => DISTRIBUTABLE_STATUSES.includes(s)).map(([j]) => j);
}
const coversJurisdiction = (w: WorkRightsRecord, j: string): boolean => {
  const s = w.statusByJurisdiction?.[j] ?? w.statusByJurisdiction?.['*'];
  return s !== undefined && DISTRIBUTABLE_STATUSES.includes(s);
};

export function bundleDecision(doc: unknown, ctx: RightsContext = {}): BundleDecision {
  if (!doc || typeof doc !== 'object') return { verdict: 'refuse', reason: 'not a document' };
  const d = doc as DocLike;
  if (['candidate', 'rights_pending', 'rejected'].includes(String(d.curriculum?.lifecycle))) return { verdict: 'exclude', reason: `curriculum lifecycle is ${String(d.curriculum?.lifecycle)}: excluded from production bundling${Array.isArray(d.curriculum?.rejectionReasons) && d.curriculum.rejectionReasons.length ? ` (${d.curriculum.rejectionReasons.join('; ')})` : ''}` };
  const rights = d.source?.rights;

  if (rights === 'owner-authored' || rights === 'generated') {
    // A course-written text cannot belong to somebody else's work: a document that says "written for the course" but
    // names a catalogue work recorded as anything else (rights-unverified, prohibited-from-bundling, research-only,
    // even verified public domain) contradicts the catalogue, and the claim is not taken on its word.
    const state = text(d.work?.slug) && text(d.lang) ? ctx.work?.(d.lang, d.work.slug as string)?.state : undefined;
    if (state !== undefined && state !== 'course-authored') {
      return { verdict: 'refuse', reason: `the document says it was written for the course ("${rights}") but belongs to the work "${String(d.work?.slug)}", which the catalogue records as ${state}` };
    }
    return { verdict: 'bundle', reason: 'written for the course by its authors' };
  }
  if (rights === 'personal-copy' || rights === 'user-private') {
    return { verdict: 'refuse', reason: `a document with rights "${rights}" belongs to one learner's device and can never be part of the repository's bundle` };
  }
  if (rights === undefined || rights === null || rights === 'unverified') {
    return { verdict: 'exclude', reason: 'rights are unverified: kept out of production builds until the text is replaced or its rights are established' };
  }
  if (rights !== 'public-domain' && rights !== 'licensed') return { verdict: 'refuse', reason: `unknown rights value "${String(rights)}"` };

  // A claim needs its evidence.
  if (rights === 'licensed' && (!text(d.source?.licenseNote) || !text(d.source?.attribution))) {
    return { verdict: 'refuse', reason: 'a licensed text must name its licence (source.licenseNote) and carry its attribution (source.attribution)' };
  }

  // 1. Source fidelity (Scripture): the wording is the source's wording. Necessary for Scripture; it is NOT a rights record.
  let wording: string | undefined;
  if (d.contentType === 'scripture') {
    const sc = d.scripture;
    if (sc?.role === 'technical-fixture') return { verdict: 'exclude', reason: 'a technical fixture for the Scripture pipeline is never shipped' };
    const v = sc?.verification;
    const identified = text(sc?.translationId) && sc?.translationId !== 'unidentified' && text(sc?.edition) && !/unverified|unidentified/i.test(String(sc?.edition));
    if (!(identified && v && text(v.against) && text(v.checkedAt) && text(v.method) && text(v.by))) {
      return { verdict: 'refuse', reason: `Scripture claims "${rights}" but the translation is not identified or its wording carries no verification record (scripts/verify-scripture.mjs)` };
    }
    wording = `translation ${String(sc?.translationId)}, wording verified against ${String(v.against)} on ${String(v.checkedAt)}`;
  }

  // 2. The rights record: the catalogue work, with who established its state and when.
  const slug = d.work?.slug;
  const what = d.contentType === 'scripture' ? `${rights} Scripture, ${wording}` : rights;
  if (!text(slug)) {
    // A Scripture text may stand without a catalogue work (its translation is identified and its wording verified);
    // the rights claim then rests on the document's own statement, and no jurisdiction is on record for it.
    if (d.contentType !== 'scripture') return { verdict: 'refuse', reason: `a text that claims "${rights}" must belong to a catalogue work that records who verified the rights` };
    const facts = { wording, rights: 'no catalogue work is named: the rights claim is the document\'s own statement', jurisdictions: 'none recorded' };
    if (ctx.release?.length) {
      return { verdict: 'exclude', facts, reason: `${what}; but no catalogue work records a rights basis for ${ctx.release.join(', ')}: left out of a build released there` };
    }
    return { verdict: 'bundle', facts, reason: `${what}; rights: the document's own statement (no catalogue work named, so no rights record was consulted)` };
  }
  if (!ctx.work) {
    return { verdict: 'bundle', facts: { wording, rights: `as recorded for the work "${slug}" (not consulted here)` }, reason: `${what}; rights: as recorded for the work "${slug}" (the catalogue record is checked by npm run rights:check)` };
  }
  const w = ctx.work(String(d.lang), slug);
  if (!w) return { verdict: 'refuse', reason: `the work "${slug}" is not in the catalogue` };
  if (!w.state || !BUNDLABLE_WORK_STATES.includes(w.state)) return { verdict: 'refuse', reason: `the work "${slug}" has rights state "${w.state ?? 'none'}", which may not be bundled` };
  if (w.state !== 'course-authored' && (!text(w.verifiedBy) || !text(w.verifiedAt))) {
    return { verdict: 'refuse', reason: `the work "${slug}" is marked ${w.state} but does not say who verified it and when` };
  }
  const record = `work "${slug}" is ${w.state}${w.verifiedBy ? `, verified by ${w.verifiedBy} on ${w.verifiedAt}` : ''}`;
  const recorded = recordedJurisdictions(w);
  const facts = { wording, rights: record, jurisdictions: recorded.length ? recorded.map((j) => (j === '*' ? 'every jurisdiction (by licence)' : j)).join(', ') : 'none recorded' };

  // 3. Jurisdictions: only when the build says where it is released.
  const missing = (ctx.release ?? []).filter((j) => !coversJurisdiction(w, j));
  if (missing.length && w.state !== 'course-authored') {
    return { verdict: 'exclude', facts, reason: `${what}; ${record}; but no rights basis is recorded for ${missing.join(', ')}: left out of a build released there` };
  }
  return { verdict: 'bundle', facts, reason: `${what}; ${record}` };
}
