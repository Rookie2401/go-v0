/**
 * The service's own table of what each reader's source may be used for: the TRUSTED half of source restrictions (contract v3).
 *
 * An event's `subject.sourceRef.restrictions` is a claim made by the client application. Metadata a web page controls must never be able to
 * grant a permission, so the service caps every claim by this table, keyed by the event's `payload.readerId` (the registry ids in
 * docs/ecosystem/reader/ADAPTER-REGISTRY.md plus the share and clipboard mechanisms): per field the more restrictive of the claim and the
 * table wins (`forbidden` < `unknown` < `allowed`). A client may tighten and never loosen. A reader this table does not know gets all
 * `unknown`, which is the floor: `unknown` is not a grant, it means "not established, so do not rely on it".
 *
 * Each row is the MOST PERMISSIVE value the service will store for that reader; it is not a finding that the terms allow it. Every
 * registry entry has `termsReview.reviewed === false`, so the rows are chosen conservatively and change only with a person's review of the
 * terms (recorded in the registry and in REPOSITORY-API-AND-OPERATIONS.md section 7.1 together). Commercial readers and permission-required
 * sites: nothing is allowed.
 *
 * The rows are DATA, in `source-policy.json` beside this file, read when this module loads. Two reasons: a reviewer changes a row without
 * touching code, and the applications, which reach the handler through their typed client, must never reach a table that names the readers
 * (the conformance audit keeps every commercial reader's name out of the code they can reach; this table lists them only to refuse them).
 *
 * This module is WIRED, not imported by the handler: `main.ts` passes `policyFor` as `ServiceDeps.sourcePolicy`. A service started without a
 * policy caps every claim to all `unknown`, which fails closed.
 */
import { readFileSync } from 'node:fs';
import { PERMISSIONS, RESTRICTION_FIELDS, UNKNOWN_RESTRICTIONS } from '../../repository-contract/src';
import type { Permission, SourceRestrictions } from '../../repository-contract/src';

/** Parses and checks a policy file: every reader has all six fields and each is a permission. Throws on anything else (a policy that cannot be read is not guessed at). */
export function parsePolicy(text: string): Readonly<Record<string, Readonly<SourceRestrictions>>> {
  const doc = JSON.parse(text) as { format?: unknown; readers?: Record<string, Record<string, unknown>> };
  if (doc.format !== 'go-source-policy@1' || !doc.readers || typeof doc.readers !== 'object') throw new Error('source-policy.json: not a go-source-policy@1 file');
  const out: Record<string, Readonly<SourceRestrictions>> = {};
  for (const [id, row] of Object.entries(doc.readers)) {
    const r = {} as SourceRestrictions;
    for (const f of RESTRICTION_FIELDS) {
      if (!(PERMISSIONS as readonly unknown[]).includes(row?.[f])) throw new Error(`source-policy.json: ${id}.${f} must be one of ${PERMISSIONS.join(', ')}`);
      r[f] = row[f] as Permission;
    }
    for (const k of Object.keys(row)) if (!(RESTRICTION_FIELDS as readonly string[]).includes(k)) throw new Error(`source-policy.json: ${id} has an unknown field "${k}"`);
    out[id] = Object.freeze(r);
  }
  return Object.freeze(out);
}

export const SOURCE_POLICY: Readonly<Record<string, Readonly<SourceRestrictions>>> = parsePolicy(readFileSync(new URL('./source-policy.json', import.meta.url), 'utf8'));

/** The most permissive restrictions the service stores for `readerId`; all `unknown` for a reader the table does not know (or no reader). */
export function policyFor(readerId: unknown): Readonly<SourceRestrictions> {
  return typeof readerId === 'string' && Object.prototype.hasOwnProperty.call(SOURCE_POLICY, readerId) ? SOURCE_POLICY[readerId] : UNKNOWN_RESTRICTIONS;
}
