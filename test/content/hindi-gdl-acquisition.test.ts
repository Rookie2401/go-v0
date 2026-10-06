import fs from 'node:fs';
import { describe, expect, it } from 'vitest';
import { HINDI_WORKS } from '../../src/course/hindi';

describe('Hindi Global Digital Library acquisition record', () => {
  it('catalogues the official per-book CC BY route without claiming public domain', () => {
    const work = HINDI_WORKS.find((w) => w.id.endsWith(':gdl-hindi-ccby'))!;
    expect(work.rights.state).toBe('verified-open-licence');
    expect(work.rights.licensing).toMatch(/CC BY 4\.0/);
    expect(work.rights.canBundle).toBe(true);
    expect(work.rights.sourceRepository).toMatch(/content\.digitallibrary\.io\/wp-json/);
    expect(work.rights.evidence?.join(' ')).toMatch(/125.*CC-BY-4\.0/);
    expect(work.rights.copyrightStatus).not.toBe('public-domain');
  });

  it('keeps acquisition reproducible and outside the bundled corpus', () => {
    const script = fs.readFileSync('scripts/acquire-hi-gdl.mts', 'utf8');
    expect(script).toMatch(/content\.digitallibrary\.io\/wp-json\/content-api\/v1\/books\/hi/);
    expect(script).toMatch(/cc-by-4-0/);
    expect(script).toMatch(/data\/private\/hi-gdl/);
    expect(script).not.toMatch(/storyweaver\.org\.in\/.*api/);
  });

  it('records the complete eligible set and the one source-quality blocker when sources are present', () => {
    const file = 'data/sources/hi/gdl/coverage.json';
    if (!fs.existsSync(file)) return;
    const report = JSON.parse(fs.readFileSync(file, 'utf8')) as { eligible: number; extracted: number; books: Array<{ sourceStatus?: string }> };
    expect(report.eligible).toBe(125);
    expect(report.extracted).toBe(125);
    expect(report.books.filter((b) => b.sourceStatus === 'blocked-source-replacement-characters')).toHaveLength(1);
  });
});
