/// <reference types="node" />
/**
 * npm run rights:check [-- --json]
 *
 * The rights gate, as a report. Reads every bundled document (data/corpus/<lang>/*.json) and every catalogue work and
 * applies the rule of src/ingest/rights.ts — the same rule the production build applies while bundling
 * (server/rightsGate.ts), here with the catalogue as well:
 *
 *   bundled    shipped in a production build: written for the course, or public-domain / licensed WITH its evidence
 *   left out   rights unverified: stays in the repository for development and tests, never in a production build
 *   REFUSED    a claim without its evidence, or content that can never be bundled: exit 1 (and the build stops)
 *
 * Catalogue checks (exit 1 on any): a work marked as bundled or ingested must have a bundlable rights state with its
 * verifier and date; a work whose rights are not verified must not say it can be bundled; no document may belong to a
 * work the catalogue does not hold. `npm run build` runs this first. Downloads nothing; writes nothing.
 */
import fs from 'node:fs';
import path from 'node:path';
import { LANGUAGES } from '../src/core';
import type { Work } from '../src/core';
import * as course from '../src/course';
import { BUNDLABLE_WORK_STATES, bundleDecision, type BundleDecision } from '../src/ingest/rights';

const json = process.argv.includes('--json');

// every catalogue the courses export (an export named *_WORKS is a list of works)
const works: Work[] = Object.entries(course as Record<string, unknown>)
  .filter(([name, value]) => /_WORKS$/.test(name) && Array.isArray(value))
  .flatMap(([, value]) => value as Work[]);
const workOf = new Map<string, Work>();
for (const w of works) workOf.set(`${w.lang}|${w.id.split(':').pop()}`, w);
const bySlug = (lang: string, slug: string): Work | undefined => workOf.get(`${lang}|${slug}`) ?? works.find((w) => w.lang === lang && w.id.endsWith(`:${slug}`));

interface Row { lang: string; file: string; id: string; rights: string; decision: BundleDecision }
const rows: Row[] = [];
const problems: string[] = [];

for (const lang of LANGUAGES) {
  const dir = path.join('data/corpus', lang);
  if (!fs.existsSync(dir)) continue;
  for (const name of fs.readdirSync(dir).filter((n) => n.endsWith('.json')).sort()) {
    const file = path.join(dir, name);
    let doc: { id?: string; source?: { rights?: string }; work?: { slug?: string } };
    try { doc = JSON.parse(fs.readFileSync(file, 'utf8')); } catch (e) { problems.push(`${file}: not valid JSON (${e instanceof Error ? e.message : String(e)})`); continue; }
    const decision = bundleDecision(doc, {
      work: (l, slug) => { const w = bySlug(l, slug); return w ? { state: w.rights.state, verifiedBy: w.rights.verifiedBy, verifiedAt: w.rights.verifiedAt } : undefined; },
    });
    rows.push({ lang, file: file.replace(/\\/g, '/'), id: String(doc.id ?? name), rights: String(doc.source?.rights ?? '(none)'), decision });
    if (doc.work?.slug && !bySlug(lang, doc.work.slug)) problems.push(`${file}: belongs to work "${doc.work.slug}", which no catalogue holds`);
  }
}

// catalogue consistency
for (const w of works) {
  const state = w.rights.state;
  const bundlable = !!state && BUNDLABLE_WORK_STATES.includes(state);
  if ((w.ingestion === 'bundled' || w.ingestion === 'ingested') && !bundlable) problems.push(`work ${w.id}: marked ${w.ingestion} but its rights state is "${state ?? 'none'}"`);
  if (w.rights.canBundle && !bundlable) problems.push(`work ${w.id}: says it can be bundled but its rights state is "${state ?? 'none'}"`);
  if (bundlable && state !== 'course-authored' && (!w.rights.verifiedBy || !w.rights.verifiedAt)) problems.push(`work ${w.id}: rights state "${state}" without who verified it and when`);
  if ((w.readiness === 'implemented' || w.readiness === 'verified-ready') && !bundlable) problems.push(`work ${w.id}: readiness "${w.readiness}" without a verified rights state`);
}

const refused = rows.filter((r) => r.decision.verdict === 'refuse');
const excluded = rows.filter((r) => r.decision.verdict === 'exclude');
const bundled = rows.filter((r) => r.decision.verdict === 'bundle');

if (json) {
  console.log(JSON.stringify({ documents: rows, works: works.length, problems }, null, 2));
} else {
  for (const lang of LANGUAGES) {
    const of = (list: Row[]) => list.filter((r) => r.lang === lang);
    if (of(rows).length === 0) continue;
    const kinds = new Map<string, number>();
    for (const r of of(bundled)) kinds.set(r.rights, (kinds.get(r.rights) ?? 0) + 1);
    console.log(`rights:check - ${lang}: ${of(bundled).length} bundled (${[...kinds.entries()].map(([k, n]) => `${n} ${k}`).join(', ') || 'none'}), ${of(excluded).length} left out of production builds, ${of(refused).length} refused`);
    for (const r of of(excluded)) console.log(`  left out  ${r.file}: ${r.decision.reason}`);
    for (const r of of(refused)) console.log(`  REFUSED   ${r.file}: ${r.decision.reason}`);
  }
  const byState = new Map<string, number>();
  for (const w of works) byState.set(w.rights.state ?? '(no state)', (byState.get(w.rights.state ?? '(no state)') ?? 0) + 1);
  console.log(`rights:check - catalogue: ${works.length} works — ${[...byState.entries()].sort().map(([k, n]) => `${n} ${k}`).join(', ')}`);
  for (const p of problems) console.log(`  PROBLEM   ${p}`);
  console.log(`rights:check - ${rows.length} document(s): ${bundled.length} bundled, ${excluded.length} left out, ${refused.length} refused; ${problems.length} catalogue problem(s): ${refused.length + problems.length === 0 ? 'OK' : 'FAILED'}`);
}
process.exit(refused.length + problems.length === 0 ? 0 : 1);
