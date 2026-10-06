/**
 * The rights gate: which bundled documents may ship in a production build. Rights are enforced by the machine —
 * unverified text is left out of the bundle, a claim without its evidence stops the build — not by a README.
 */
import { describe, expect, it } from 'vitest';
import type { Plugin } from 'vite';
import { rightsGate } from '../../server/rightsGate';
import { loadBundledCorpus } from '../../src/ingest';
import { bundleDecision } from '../../src/ingest/rights';

const authored = { id: 'a', lang: 'hi', contentType: 'story', source: { rights: 'owner-authored' } };
const scripture = (extra: Record<string, unknown> = {}, source: Record<string, unknown> = {}) => ({
  id: 'b', lang: 'hi', contentType: 'scripture',
  source: { rights: 'licensed', licenseNote: 'CC BY-SA 4.0', attribution: 'IRV Hindi 2019 — Bridge Connectivity Solutions', ...source },
  scripture: { translationId: 'hin2017', edition: 'IRV Hindi 2019', verification: { against: 'eBible.org hin2017', checkedAt: '2026-10-01', method: 'byte-comparison', by: 'scripts/verify-scripture.mjs' }, ...extra },
});
const book = (rights: string, work?: string) => ({ id: 'c', lang: 'hi', contentType: 'story', source: { rights, licenseNote: 'x', attribution: 'y' }, ...(work ? { work: { slug: work } } : {}) });

describe('bundleDecision', () => {
  it('cannot bundle rights-pending or rejected material despite an owner-authored label', () => {
    for (const lifecycle of ['candidate', 'rights_pending', 'rejected']) expect(bundleDecision({ ...authored, curriculum: { lifecycle, rejectionReasons: ['No permission'] } }).verdict).toBe('exclude');
    expect(bundleDecision({ ...authored, curriculum: { lifecycle: 'native_review' } }).verdict).toBe('bundle');
  });
  it('bundles what was written for the course', () => {
    expect(bundleDecision(authored).verdict).toBe('bundle');
    expect(bundleDecision({ ...authored, source: { rights: 'generated' } }).verdict).toBe('bundle');
  });

  it('leaves out a text whose rights are unverified or not stated — it is never refused, and never shipped', () => {
    expect(bundleDecision({ ...authored, source: { rights: 'unverified' } }).verdict).toBe('exclude');
    expect(bundleDecision({ ...authored, source: {} }).verdict).toBe('exclude');
    expect(bundleDecision({ id: 'x' }).verdict).toBe('exclude');
  });

  it('refuses a learner\'s own copy or private writing: those never belong to the repository', () => {
    expect(bundleDecision({ ...authored, source: { rights: 'personal-copy' } }).verdict).toBe('refuse');
    expect(bundleDecision({ ...authored, source: { rights: 'user-private' } }).verdict).toBe('refuse');
    expect(bundleDecision({ ...authored, source: { rights: 'probably-public-domain' } }).verdict).toBe('refuse');
  });

  it('bundles verified Scripture, public-domain or licensed', () => {
    expect(bundleDecision(scripture())).toMatchObject({ verdict: 'bundle' });
    expect(bundleDecision(scripture({}, { rights: 'public-domain' })).verdict).toBe('bundle');
  });

  it('refuses Scripture that claims a status without identity or verification, and a licensed text without its licence and attribution', () => {
    expect(bundleDecision(scripture({ verification: undefined })).verdict).toBe('refuse');
    expect(bundleDecision(scripture({ translationId: 'unidentified' })).verdict).toBe('refuse');
    expect(bundleDecision(scripture({ edition: 'unverified sample' })).verdict).toBe('refuse');
    expect(bundleDecision(scripture({}, { licenseNote: '' })).verdict).toBe('refuse');
    expect(bundleDecision(scripture({}, { attribution: undefined })).verdict).toBe('refuse');
  });

  it('never ships a technical fixture', () => {
    expect(bundleDecision(scripture({ role: 'technical-fixture' })).verdict).toBe('exclude');
  });

  it('a book that claims public domain or a licence needs a catalogue work that records who verified it and when', () => {
    expect(bundleDecision(book('public-domain')).verdict).toBe('refuse'); // no work at all
    const ctx = (state?: string, verifiedBy?: string, verifiedAt?: string) => ({ work: () => (state ? { state, verifiedBy, verifiedAt } : undefined) });
    expect(bundleDecision(book('public-domain', 'godan'), ctx()).verdict).toBe('refuse'); // the catalogue does not hold it
    expect(bundleDecision(book('public-domain', 'godan'), ctx('rights-unverified')).verdict).toBe('refuse');
    expect(bundleDecision(book('public-domain', 'godan'), ctx('prohibited-from-bundling')).verdict).toBe('refuse');
    expect(bundleDecision(book('public-domain', 'godan'), ctx('verified-public-domain')).verdict).toBe('refuse'); // verified by nobody
    expect(bundleDecision(book('public-domain', 'godan'), ctx('verified-public-domain', 'A. Reviewer', '2026-10-01')).verdict).toBe('bundle');
    expect(bundleDecision(book('licensed', 'storyweaver-x'), ctx('verified-open-licence', 'A. Reviewer', '2026-10-01')).verdict).toBe('bundle');
  });

  it('gives a plain reason every time', () => {
    for (const d of [authored, scripture(), book('public-domain'), { source: { rights: 'unverified' } }]) expect(bundleDecision(d).reason.length).toBeGreaterThan(10);
  });
});

describe('the bundled corpus under the rule', () => {
  const docs = loadBundledCorpus();

  it('nothing in the repository is refused', () => {
    const refused = docs.map((d) => [d.lang, d.id, bundleDecision(d)] as const).filter(([, , x]) => x.verdict === 'refuse');
    expect(refused.map(([l, id, x]) => `${l}/${id}: ${x.reason}`)).toEqual([]);
  });

  it('every Hindi document is bundlable: course texts, and Scripture that is licensed and verified', () => {
    const hi = docs.filter((d) => d.lang === 'hi');
    expect(hi.length).toBeGreaterThan(3);
    for (const d of hi) expect(bundleDecision(d).verdict, d.id).toBe('bundle');
    for (const d of hi.filter((x) => x.contentType === 'scripture')) expect(d.source.rights, d.id).toBe('licensed');
  });

  it('exactly the documents with unverified rights are left out, and none of them is published', () => {
    const out = docs.filter((d) => bundleDecision(d).verdict === 'exclude');
    for (const d of out) expect(d.source.rights, `${d.lang}/${d.id}`).toBe('unverified');
    for (const d of docs.filter((x) => x.source.rights === 'unverified')) expect(bundleDecision(d).verdict, `${d.lang}/${d.id}`).toBe('exclude');
  });
});

describe('the build plugin', () => {
  const run = (code: string, id: string) => {
    const plugin = rightsGate() as Plugin & { transform: (this: unknown, code: string, id: string) => unknown };
    const errors: string[] = [];
    const ctx = { error: (m: string) => { errors.push(m); throw new Error(m); }, warn: () => undefined };
    let result: unknown;
    try { result = plugin.transform.call(ctx, code, id); } catch { /* recorded */ }
    return { result, errors };
  };

  it('applies to production builds only, before the JSON is read', () => {
    const plugin = rightsGate();
    expect(plugin.apply).toBe('build');
    expect(plugin.enforce).toBe('pre');
  });

  it('replaces an unverified document by null, leaves a bundlable one alone, and ignores other files', () => {
    const unverified = JSON.stringify({ id: 'x', lang: 'th', source: { rights: 'unverified' } });
    expect(run(unverified, 'C:/repo/data/corpus/th/bible-1john-1.json').result).toEqual({ code: 'null', map: null });
    expect(run(unverified, '/repo/data/corpus/th/bible-1john-1.json?import').result).toEqual({ code: 'null', map: null });
    expect(run(JSON.stringify(authored), '/repo/data/corpus/hi/s0a-01.json').result).toBeNull();
    expect(run(unverified, '/repo/src/other/file.json').result).toBeNull();
    expect(run('export const x = 1', '/repo/src/ingest/index.ts').result).toBeNull();
  });

  it('stops the build on a claim without evidence, naming the file', () => {
    const r = run(JSON.stringify(book('public-domain')), '/repo/data/corpus/hi/godan-01.json');
    expect(r.errors.join(' ')).toMatch(/hi\/godan-01\.json cannot be bundled/);
    const bad = run('{ not json', '/repo/data/corpus/hi/broken.json');
    expect(bad.errors.join(' ')).toMatch(/not valid JSON/);
  });
});
