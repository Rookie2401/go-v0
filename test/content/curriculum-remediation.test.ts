import fs from 'node:fs';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { createRequire } from 'node:module';
import { describe, expect, it } from 'vitest';
import { createAdapterRegistry } from '../../src/adapters';
import { contentSignatureOf, computePublished, type CorpusDocument } from '../../src/ingest';
import type { LanguageCode } from '../../src/core';
// The installed jsdom runtime has no bundled declaration; use a narrow runtime
// interface rather than installing another dependency or weakening TS checks.
const { JSDOM } = createRequire(import.meta.url)('jsdom') as {
  JSDOM: new (html: string) => { window: { document: Document } };
};

const base = 'data/sources/curriculum-remediation';
const read = (file: string): any => JSON.parse(fs.readFileSync(file, 'utf8'));
const sha = (bytes: string | Buffer) => createHash('sha256').update(bytes).digest('hex');
const historical = read(`${base}/de/library-manifest.json`).entries;
const modern = read(`${base}/modern/ready-excerpts.json`);
const ready = [...historical, ...modern];
const works = read('src/course/curriculum-acquired-works.json');
const normalized = (s: string) => s.replace(/\s+/g, ' ').trim();
const sourcePath = (entry: any) => path.join(base, entry.slug.startsWith('guerber-') ? 'de' : 'modern', entry.source.file);
const rows = (lang: string) => {
  const root = `public/library/${lang}`;
  // shards are named by stream since the 2026-10-06 library rebuild, so every shard is read and rows are matched by workId
  return read(`${root}/manifest.json`).shards.flatMap((s: any) => read(path.join(root, s.file)).rows);
};

describe('installed curriculum-remediation source integrity', () => {
  it('retains all 32 unique licensed/source-cleared identities, signed bodies and exact paragraphs', () => {
    expect(ready).toHaveLength(32);
    expect(new Set(ready.map(e => e.slug)).size).toBe(32);
    expect(new Set(ready.map(e => e.source.sha256)).size).toBe(32);
    const seen = new Set<string>();
    for (const entry of ready) {
      const work = works.find((w: any) => w.id.endsWith(`:${entry.slug}`));
      expect(work, entry.slug).toBeDefined();
      const indexed = rows(work.lang).filter((r: any) => r.workId === work.id);
      expect(indexed, entry.slug).toHaveLength(1);
      const row = indexed[0], root = `public/library/${work.lang}`;
      expect(seen.has(row.id)).toBe(false); seen.add(row.id);
      const doc = read(path.join(root, row.documentPath)) as CorpusDocument;
      const source = fs.readFileSync(sourcePath(entry), 'utf8');
      expect(sha(source)).toBe(entry.source.sha256);
      expect(entry.review.coversSourceSha256).toBe(entry.source.sha256);
      expect(doc.source.sourceHash).toBe(entry.source.sha256);
      expect(doc.source.attribution).toBe(entry.source.attribution);
      expect(doc.review?.contentSignature).toBe(contentSignatureOf(doc));
      expect(computePublished(doc).published).toBe(true);
      expect(doc.generated).toBe(false);
      expect(doc.contentType).not.toBe('scripture');
      expect(doc.scripture).toBeUndefined();
      expect(doc.sections.flatMap(s => s.paragraphs.map(p => 'text' in p ? p.text : p.sentences.map(s => s.text).join(p.separator ?? ' ')))).toEqual(source.trim().split(/\n\s*\n/));
      expect(row.stageId).toBe(work.stageId);
      expect(row.published).toBe(true);
      const combined = read(`data/sources/course-library/${work.lang}.json`).entries.find((e: any) => e.slug === entry.slug);
      expect(sha(fs.readFileSync(path.join('data/sources', combined.source.file)))).toBe(entry.source.sha256);
      expect(combined.rights.canBundle).toBe(true);
      expect(combined.rights.canBundleAudio).toBe(false);
      expect(doc.review?.notes).toMatch(/no native|pending|Source-fidelity/i);
    }
  });

  it('preserves source-authored German wording against independent HTML parsing, excluding apparatus', () => {
    for (const [volume, ebook] of [[1, 35794], [2, 45189]]) {
      const raw = fs.readFileSync(`${base}/de/pg${ebook}.html`, 'utf8');
      const dom = new JSDOM(raw).window.document;
      for (const entry of historical.filter((e: any) => e.slug.startsWith(`guerber-v${volume}`))) {
        const number = Number(entry.slug.slice(-2));
        const heading = dom.getElementById(`Text${number}`)!.closest('h2')!;
        const paragraphs: string[] = [];
        for (let next = heading.nextElementSibling; next && next.tagName !== 'H2'; next = next.nextElementSibling) {
          const ps = next.tagName === 'P' ? [next] : [...next.querySelectorAll('p')];
          for (const p of ps) {
            const copy = p.cloneNode(true) as Element;
            copy.querySelectorAll('a.pagenum,a.fnanchor').forEach(a => a.remove());
            const text = normalized(copy.textContent ?? ''); if (text) paragraphs.push(text);
          }
        }
        const text = fs.readFileSync(sourcePath(entry), 'utf8');
        expect(paragraphs, entry.slug).toEqual(text.trim().split(/\n\s*\n/).map(normalized));
        expect(entry.source.originalSourceSha256).toBe(sha(raw));
        expect(text).not.toMatch(/PROJECT GUTENBERG|VOCABULARY|TRANSCRIBER/i);
        expect(entry.rights.statusByJurisdiction).toEqual({ US: 'public-domain' });
      }
    }
  });

  it('keeps exact modern author/translator attribution, native publisher wording and restricted excerpts', () => {
    const expected: Record<string, string> = { es: 'Julissa Álvarez Coroa', hi: 'Debashish Chakrabarty', sq: 'Ardi Pulaj', de: 'Andreas Kallinteris; FTSK' };
    for (const entry of modern) {
      const lang = entry.slug.split('-')[1];
      expect(entry.translator).toBe(expected[lang]);
      expect(entry.source.attribution).toContain(entry.author);
      expect(entry.source.attribution).toContain(entry.translator);
      expect(entry.source.attribution).toContain(entry.source.originalStoryUrl);
      expect(entry.source.attribution).toContain('CC BY 3.0');
      expect(entry.source.attribution).toContain('Changes:');
      expect(entry.rights.state).toBe('verified-open-licence');
      expect(entry.rights.statusByJurisdiction).toEqual({ '*': 'licensed' });
      const originalPage = fs.readFileSync(`${base}/modern/${entry.slug.replace(/-excerpt$/, '')}.html`, 'utf8');
      expect(sha(originalPage)).toBe(entry.source.originalSourceSha256);
      const document = new JSDOM(originalPage).window.document;
      const sourceParagraphs = [...document.querySelectorAll('p')].map(p => normalized(p.textContent ?? ''));
      for (const paragraph of fs.readFileSync(sourcePath(entry), 'utf8').trim().split(/\n\s*\n/)) {
        expect(sourceParagraphs).toContain(normalized(paragraph));
      }
      expect(entry.contentType).toBe('nonfiction');
      expect(entry.title).toContain('excerpt');
    }
  });

  it('uses actual adapters and preserves matching installed text profiles without altering canonical placement', () => {
    const adapters = createAdapterRegistry();
    for (const entry of ready) {
      const work = works.find((w: any) => w.id.endsWith(`:${entry.slug}`));
      const row = rows(work.lang).find((r: any) => r.workId === work.id);
      const profile = read(path.join(`public/library/${work.lang}`, row.profilePath));
      const words = adapters.get(work.lang as LanguageCode).tokenize(fs.readFileSync(sourcePath(entry), 'utf8')).filter(t => t.isWord);
      expect(profile.words).toBe(words.length);
      expect(row.features.words).toBe(words.length);
      expect(profile.analyzers.some((a: string) => a.startsWith(`adapter-${work.lang}@`))).toBe(true);
      expect(profile.forms.reduce((n: number, pair: [string, number]) => n + pair[1], 0)).toBe(words.length);
      expect(work.purpose.join(' ')).toMatch(/Provisional/);
    }
  });

  it('places the measured German subset and contemporary Spanish/Albanian under actual stage keys', () => {
    const expected = { s2: [1, 2, 3, 4], s3: [5, 6, 7, 8, 10, 15], s4: [9, 11, 12, 13, 14] };
    for (const [stage, numbers] of Object.entries(expected)) for (const number of numbers) {
      const slug = `guerber-v1-story-${String(number).padStart(2, '0')}`;
      expect(historical.find((e: any) => e.slug === slug).stage).toBe(stage);
      expect(works.find((w: any) => w.id.endsWith(`:${slug}`)).stageId).toBe(`stage:germany-de:${stage}`);
    }
    for (const entry of historical) {
      const work = works.find((w: any) => w.id.endsWith(`:${entry.slug}`));
      expect(work.variety).toBe('de');
      expect(work.rights.canModify).toBe(false);
      expect(work.registers).toContain('historical');
      expect(work.orthography).toMatch(/not modernized/);
    }
    expect(works.find((w: any) => w.id.endsWith(':guerber-v2-story-07')).notes).toContain('6,983');
    expect(works.find((w: any) => w.lang === 'es').stageId).toBe('stage:honduras-es:s4');
    expect(works.find((w: any) => w.lang === 'es').variety).toBe('es');
    expect(works.find((w: any) => w.lang === 'sq').stageId).toBe('stage:albania-sq:6');
  });

  it('keeps translations, whole-article candidates, Thai native review and commissions held honestly', () => {
    const packet = read(`${base}/sq-translation/packet.json`);
    expect(packet.entries).toHaveLength(40);
    for (const e of packet.entries) {
      expect(e.canPublish).toBe(false); expect(e.translator).toBeNull(); expect(e.nativeReviewer).toBeNull();
      expect(e.licence).toBe('CC BY 4.0'); expect(e.credits.length).toBeGreaterThan(3);
      expect(sha(fs.readFileSync(`${base}/sq-translation/${e.sourceFile}`))).toBe(e.sourceSha256);
    }
    for (const e of read(`${base}/modern/candidates.json`).entries) expect(e.canBundle).toBe(false);
    const thai = read('data/review/curriculum-remediation/thai-aesop-review.json');
    expect(thai.entries).toHaveLength(45); expect(thai.proofreadingStatus).toMatch(/not independently validated/);
    expect(thai.rights).toMatch(/Thailand-specific/);
    for (const e of thai.entries) expect(e.reviewer).toBeNull();
    const commissions = read('data/review/curriculum-remediation/honduras-commission.json').entries;
    expect(commissions).toHaveLength(14);
    expect(commissions.map((e: any) => e.topic).join(' ')).toMatch(/clarification/);
    expect(commissions.map((e: any) => e.topic).join(' ')).toMatch(/Bible discussion/);
    for (const e of commissions) {
      expect(e.author).toBeNull(); expect(e.nativeReviewer).toBeNull(); expect(e.rightsAgreement).toBeNull();
    }
  });

  it('retains edition-level rights evidence with explicit unknowns and separate text/media permissions', () => {
    const evidence = read('data/review/curriculum-remediation/rights-evidence.json');
    expect(evidence.publishedSourceAssets).toHaveLength(32);
    expect(evidence.validation.exactSourceHashMatches).toBe(true);
    for (const record of evidence.publishedSourceAssets) {
      for (const field of ['title', 'author', 'translator', 'editor', 'edition', 'publicationDate', 'publicationDateNotes',
        'sourceUrl', 'acquiredAt', 'sourceFileSha256', 'originalSourceSha256', 'rightsBasis', 'jurisdiction', 'license',
        'licenseVersion', 'licenseUrl', 'attribution', 'modifications', 'commercialDistribution', 'derivatives', 'offlineDistribution']) {
        expect(Object.hasOwn(record, field), `${record.slug}: ${field}`).toBe(true);
      }
      expect(sha(fs.readFileSync(record.sourceFile))).toBe(record.sourceHash);
      expect(sha(fs.readFileSync(record.originalSourceFile))).toBe(record.originalSourceSha256);
      expect(record.illustrationsMedia.included).toBe(false);
      expect(record.audio.canBundleAudio).toBe(false);
      expect(record.textualQA.nativeReview).toMatch(/pending/);
      if (record.slug.startsWith('guerber-v2')) {
        expect(record.publicationDate).toBeNull();
        expect(record.publicationDateNotes).toContain('copyright 1896 is not asserted as publication date');
      }
    }
  });
});
