/**
 * May this document ship in a production build? One rule, used by the build itself (server/rightsGate.ts removes or
 * refuses documents while Vite bundles) and by `npm run rights:check`. Rights are enforced by the machine here, not by
 * a README or by memory:
 *
 *   bundle   written for the course (owner-authored / generated), or a public-domain or licensed text that carries
 *            its verification: Scripture with an identified translation and a `scripture.verification` record; any
 *            other text through a catalogue work whose rights state a person recorded as verified
 *   exclude  rights unverified or not stated: the document stays in the repository for development and tests, and is
 *            NOT in a production bundle (it was never published; now it is not shipped either)
 *   refuse   a claim without its evidence ("public-domain" with no verification), or content that can never be
 *            bundled (a learner's own copy, private writing): the build stops
 *
 * There is no state that means "probably public domain". Pure and dependency-free: it is imported by the Vite config.
 */

export type BundleVerdict = 'bundle' | 'exclude' | 'refuse';

export interface BundleDecision {
  verdict: BundleVerdict;
  /** One plain sentence: why. */
  reason: string;
}

/** The catalogue rights states that allow bundling (src/core/course.ts `RightsState`). */
export const BUNDLABLE_WORK_STATES: readonly string[] = ['verified-public-domain', 'verified-open-licence', 'permission-granted', 'course-authored'];

export interface RightsContext {
  /** The rights state of the catalogue work a document belongs to (by `doc.lang` and `doc.work.slug`), and whether its verification is recorded. */
  work?(lang: string, slug: string): { state?: string; verifiedBy?: string; verifiedAt?: string } | undefined;
}

interface DocLike {
  id?: unknown; lang?: unknown; contentType?: unknown;
  source?: { rights?: unknown; licenseNote?: unknown; attribution?: unknown };
  scripture?: { translationId?: unknown; edition?: unknown; role?: unknown; verification?: { against?: unknown; checkedAt?: unknown; method?: unknown; by?: unknown } };
  work?: { slug?: unknown };
}

const text = (v: unknown): v is string => typeof v === 'string' && v.trim().length > 0;

export function bundleDecision(doc: unknown, ctx: RightsContext = {}): BundleDecision {
  if (!doc || typeof doc !== 'object') return { verdict: 'refuse', reason: 'not a document' };
  const d = doc as DocLike;
  const rights = d.source?.rights;

  if (rights === 'owner-authored' || rights === 'generated') return { verdict: 'bundle', reason: 'written for the course by its authors' };
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
  if (d.contentType === 'scripture') {
    const sc = d.scripture;
    if (sc?.role === 'technical-fixture') return { verdict: 'exclude', reason: 'a technical fixture for the Scripture pipeline is never shipped' };
    const v = sc?.verification;
    const identified = text(sc?.translationId) && sc?.translationId !== 'unidentified' && text(sc?.edition) && !/unverified|unidentified/i.test(String(sc?.edition));
    if (identified && v && text(v.against) && text(v.checkedAt) && text(v.method) && text(v.by)) {
      return { verdict: 'bundle', reason: `${rights} Scripture, translation ${String(sc?.translationId)}, wording verified against ${String(v.against)} on ${String(v.checkedAt)}` };
    }
    return { verdict: 'refuse', reason: `Scripture claims "${rights}" but the translation is not identified or its wording carries no verification record (scripts/verify-scripture.mjs)` };
  }
  const slug = d.work?.slug;
  if (!text(slug)) return { verdict: 'refuse', reason: `a text that claims "${rights}" must belong to a catalogue work that records who verified the rights` };
  if (!ctx.work) return { verdict: 'bundle', reason: `${rights}, as recorded for the work "${slug}" (the catalogue record is checked by npm run rights:check)` };
  const w = ctx.work(String(d.lang), slug);
  if (!w) return { verdict: 'refuse', reason: `the work "${slug}" is not in the catalogue` };
  if (!w.state || !BUNDLABLE_WORK_STATES.includes(w.state)) return { verdict: 'refuse', reason: `the work "${slug}" has rights state "${w.state ?? 'none'}", which may not be bundled` };
  if (w.state !== 'course-authored' && (!text(w.verifiedBy) || !text(w.verifiedAt))) {
    return { verdict: 'refuse', reason: `the work "${slug}" is marked ${w.state} but does not say who verified it and when` };
  }
  return { verdict: 'bundle', reason: `${rights}; work "${slug}" is ${w.state}${w.verifiedBy ? `, verified by ${w.verifiedBy} on ${w.verifiedAt}` : ''}` };
}
