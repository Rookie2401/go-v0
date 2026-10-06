import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { runNode } from '../helpers/cli';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { contentSignatureOf, loadBundledCorpus } from '../../src/ingest';
import { baseDoc, scriptureDoc } from './helpers';

const cli = path.resolve('node_modules/vite-node/dist/cli.mjs');
const run = async (script: string, ...args: string[]) => {
  const r = await runNode([cli, script, ...args], { cwd: path.resolve('.'), timeout: 90_000 });
  return { status: r.status, out: r.out };
};

describe('corpus CLI (npm run corpus:validate / corpus:check / corpus:migrate)', () => {
  let dir: string;
  beforeAll(() => { dir = fs.mkdtempSync(path.join(os.tmpdir(), 'go-corpus-')); });
  afterAll(() => { fs.rmSync(dir, { recursive: true, force: true }); });
  const write = (name: string, doc: unknown) => { const p = path.join(dir, name); fs.writeFileSync(p, JSON.stringify(doc, null, 2)); return p; };

  it('corpus:validate exits 0 for a valid file and prints the analysis coverage and publication status', async () => {
    const r = await run('scripts/corpus-validate.mts', write('ok.json', baseDoc()));
    expect(r.status).toBe(0);
    expect(r.out).toMatch(/analysis coverage 100\.0%/);
    expect(r.out).toMatch(/would publish: no/);
    expect(r.out).toMatch(/missing: review status is "unreviewed"/);
    expect(r.out).toMatch(/corpus:validate - 1 document\(s\), 0 error\(s\), 0 warning\(s\)/);
  }, 120_000);

  it('corpus:validate states the publication requirements: would publish yes for a reviewed document, each missing requirement otherwise', async () => {
    const reviewed = baseDoc();
    reviewed.review = { status: 'reviewed', reviewedBy: 'Ana Ruiz', reviewedAt: '2026-02-01', contentSignature: contentSignatureOf(reviewed) };
    const yes = await run('scripts/corpus-validate.mts', write('reviewed.json', reviewed));
    expect(yes.status).toBe(0);
    expect(yes.out).toMatch(/would publish: yes/);
    expect(yes.out).not.toMatch(/missing:/);
    const two = baseDoc();
    two.source = { ...two.source, rights: 'unverified', provenance: 'unknown; replace this text' };
    const no = await run('scripts/corpus-validate.mts', write('two.json', two));
    expect(no.out).toMatch(/would publish: no/);
    expect(no.out).toMatch(/missing: review status is "unreviewed"/);
    expect(no.out).toMatch(/missing: rights are unverified/);
  }, 120_000);

  describe('corpus:review', () => {
    const story = () => fs.readFileSync('data/corpus/es/story-01.json', 'utf8');
    const copy = (name: string) => { const p = path.join(dir, name); fs.writeFileSync(p, story()); return p; };
    const sentenceTexts = (p: string) => (JSON.parse(fs.readFileSync(p, 'utf8')) as { sections: Array<{ paragraphs: Array<{ sentences?: Array<{ text: string }>; text?: string }> }> })
      .sections.flatMap((s) => s.paragraphs.flatMap((x) => x.sentences?.map((y) => y.text) ?? [x.text!]));

    it('refuses without --by (exit 1, file untouched); records the review, keeps every text byte, and prints would publish', async () => {
      const p = copy('es-story.json');
      const bundledBefore = story();
      const refused = await run('scripts/corpus-review.mts', p);
      expect(refused.status).toBe(1);
      expect(refused.out).toMatch(/\[missing-reviewer\]/);
      expect(fs.readFileSync(p, 'utf8')).toBe(bundledBefore);

      const before = sentenceTexts(p);
      const r = await run('scripts/corpus-review.mts', p, '--by', 'Ana Ruiz (native speaker)', '--date', '2026-02-01', '--notes', 'Checked wording and glosses.', '--level', 'native');
      expect(r.status).toBe(0);
      expect(r.out).toMatch(/review: unreviewed -> reviewed by Ana Ruiz \(native speaker\) on 2026-02-01/);
      expect(r.out).toMatch(/removed editorial tag: needs-native-review/);
      expect(r.out).toMatch(/would publish: yes/);
      const doc = JSON.parse(fs.readFileSync(p, 'utf8')) as { review: unknown; editorialTags: string[] };
      expect(doc.review).toEqual({ status: 'reviewed', reviewedBy: 'Ana Ruiz (native speaker)', reviewedAt: '2026-02-01', contentSignature: expect.stringMatching(/^[0-9a-f]{16}$/), notes: 'Checked wording and glosses.', level: 'native' });
      expect(r.out).toMatch(new RegExp(`review covers wording ${(doc.review as { contentSignature: string }).contentSignature.slice(0, 8)}`));
      expect(doc.editorialTags).toEqual(['machine-drafted', 'superseded-by-ladder']); // the review keeps the tags it found
      expect(sentenceTexts(p)).toEqual(before);
      // the bundled corpus itself is never touched, and the reviewed copy validates as publishable
      expect(story()).toBe(bundledBefore);
      expect((await run('scripts/corpus-validate.mts', p)).out).toMatch(/would publish: yes/);
      // reviewing twice with the same arguments is a no-op
      const again = await run('scripts/corpus-review.mts', p, '--by', 'Ana Ruiz (native speaker)', '--date', '2026-02-01', '--notes', 'Checked wording and glosses.', '--level', 'native');
      expect(again.status).toBe(0);
      expect(again.out).toMatch(/file already recorded this review/);
    }, 120_000);

    it('--status in-review keeps the tag and reports why it would not publish; bad status / date / file exit 1', async () => {
      const p = copy('es-story-2.json');
      const r = await run('scripts/corpus-review.mts', p, '--by', 'Ana', '--status', 'in-review', '--date', '2026-02-01');
      expect(r.status).toBe(0);
      expect(r.out).toMatch(/would publish: no/);
      expect(r.out).toMatch(/missing: review status is "in-review"/);
      expect((JSON.parse(fs.readFileSync(p, 'utf8')) as { editorialTags: string[] }).editorialTags).toContain('needs-native-review');
      expect((await run('scripts/corpus-review.mts', p, '--by', 'Ana', '--status', 'great')).status).toBe(1);
      expect((await run('scripts/corpus-review.mts', p, '--by', 'Ana', '--date', '2026-13-01')).out).toMatch(/\[invalid-date\]/);
      expect((await run('scripts/corpus-review.mts', path.join(dir, 'missing.json'), '--by', 'Ana')).status).toBe(1);
      expect((await run('scripts/corpus-review.mts')).status).toBe(1);
    }, 120_000);

    it('refuses Scripture without scripture.verification (exit 1, file untouched)', async () => {
      const sc = scriptureDoc();
      delete sc.scripture!.verification;
      sc.review = { status: 'unreviewed' };
      const p = write('sc-unverified.json', sc);
      const before = fs.readFileSync(p, 'utf8');
      const r = await run('scripts/corpus-review.mts', p, '--by', 'Ana');
      expect(r.status).toBe(1);
      expect(r.out).toMatch(/\[scripture-unverified\]/);
      expect(r.out).toMatch(/verify-scripture/);
      expect(fs.readFileSync(p, 'utf8')).toBe(before);
    }, 120_000);
  });

  it('corpus:validate exits 1 on errors and prints path and hint for every issue; directories are walked', async () => {
    const bad = baseDoc();
    bad.review = { status: 'reviewed' };
    (bad.sections[0].paragraphs[0] as unknown as { sentences: Array<Record<string, unknown>> }).sentences[0].spans = [{ start: 0, end: 2, lemma: 'x' }];
    const walk = path.join(dir, 'walk');
    fs.mkdirSync(path.join(walk, 'sub'), { recursive: true });
    fs.writeFileSync(path.join(walk, 'ok.json'), JSON.stringify(baseDoc()));
    fs.writeFileSync(path.join(walk, 'bad.json'), JSON.stringify(bad));
    fs.writeFileSync(path.join(walk, 'sub', 'broken.json'), '{ not json');
    const r = await run('scripts/corpus-validate.mts', walk);
    expect(r.status).toBe(1);
    expect(r.out).toMatch(/ERROR review\.reviewedBy: .*\[review-missing-reviewer\]/);
    expect(r.out).toMatch(/hint: Name the person/);
    expect(r.out).toMatch(/ERROR sections\[0\]\.paragraphs\[0\]\.sentences\[0\]\.spans\[0\]: .*\[span-not-on-token\]/);
    expect(r.out).toMatch(/not valid JSON/);
    expect(r.out).toMatch(/corpus:validate - 3 document\(s\), [3-9] error\(s\)/);
  }, 120_000);

  it('corpus:validate rejects a version 1 file pointing at the migration, and exits 1 with nothing to validate', async () => {
    const r = await run('scripts/corpus-validate.mts', write('v1.json', { formatVersion: 1, lang: 'es', slug: 'x' }));
    expect(r.status).toBe(1);
    expect(r.out).toMatch(/unsupported-schema-version/);
    expect(r.out).toMatch(/corpus:migrate/);
    expect((await run('scripts/corpus-validate.mts')).status).toBe(1);
    expect((await run('scripts/corpus-validate.mts', path.join(dir, 'nope'))).status).toBe(1);
  }, 120_000);

  it('corpus:check passes on the bundled corpus: valid, re-import a no-op, verified Scripture byte-identical', async () => {
    const r = await run('scripts/corpus-check.mts');
    expect(r.status).toBe(0);
    const m = /corpus:check - (\d+) document\(s\), 0 validation error\(s\), \d+ warning\(s\); (\d+) published, (\d+) unpublished; re-import unchanged: yes; (\d+) verified verse\(s\) byte-identical; OK/.exec(r.out);
    expect(m, r.out.slice(-300)).not.toBeNull();
    // the totals follow the corpus (several courses add documents): only Scripture whose wording is verified is published
    const docs = loadBundledCorpus();
    const verified = docs.filter((d) => d.contentType === 'scripture' && d.scripture?.verification);
    expect(Number(m![1])).toBe(docs.length);
    expect(Number(m![2])).toBe(verified.length);
    expect(Number(m![3])).toBe(docs.length - verified.length);
    expect(Number(m![4])).toBeGreaterThanOrEqual(verified.length); // at least one verse per verified document
    expect(verified.length).toBeGreaterThanOrEqual(2);
  }, 120_000);

  it('corpus:migrate is repeatable: the bundled corpus is already version 2, nothing is rewritten', async () => {
    const before = fs.readFileSync('data/corpus/es/story-01.json', 'utf8');
    const r = await run('scripts/corpus-migrate.mts');
    expect(r.status).toBe(0);
    expect(r.out).toMatch(/converted 0 document\(s\) to schemaVersion 2, left \d+ unchanged/);
    expect(fs.readFileSync('data/corpus/es/story-01.json', 'utf8')).toBe(before);
  }, 120_000);
});
