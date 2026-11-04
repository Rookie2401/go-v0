// @vitest-environment node
/**
 * The Privacy Policy says a lookup keeps hashes of the sentence and the page's address, never the title or the address (the readiness audit of
 * 2026-11-03, L1: the code stored both readable). The service holds to it even for an extension installed before the fix, and the operator can clean
 * what it already holds. Bible references and book titles stay readable, and the policy says so.
 */
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { HASHED_PAGE_LOCATOR, UNKNOWN_RESTRICTIONS } from '../../../packages/repository-contract/src';
import { storedSourceRef } from '../../../packages/repository-service/src/handler';
import { openSqliteStore } from '../../../packages/repository-store/src';
import { sourceRefOf } from '../../../packages/golearn-extension/src/store';
import { pageKeyOf } from '../../../packages/golearn-extension/src/text';
import { scrubSqlite } from '../../../scripts/ops/scrub-web-sources.mts';
import { L1, ev } from '../store/fixtures';

const HASH = pageKeyOf('example.org', '/reset/secret-token');
const stored = (ref: Record<string, unknown>, typed = true) => storedSourceRef(ref, UNKNOWN_RESTRICTIONS, typed);

describe('a web page is a hash of its address', () => {
  it('the key is the contract\'s shape, tells two sites apart, and holds nothing of the address', () => {
    expect(HASH).toMatch(HASHED_PAGE_LOCATOR);
    expect(pageKeyOf('example.org', '/')).not.toBe(pageKeyOf('example.net', '/'));
    expect(pageKeyOf('Example.ORG', '/a')).toBe(pageKeyOf('example.org', '/a'));
    expect(HASH).not.toContain('secret');
  });

  it('the service drops an older client\'s readable title and path, typed or not, and keeps a hash', () => {
    for (const typed of [true, false]) {
      expect(stored({ kind: 'web', title: 'My bank', locator: '/reset/secret-token' }, typed)).toEqual({ kind: 'web' });
      expect(stored({ kind: 'web', title: 'My bank', locator: HASH }, typed)).toEqual({ kind: 'web', locator: HASH });
    }
    expect(stored({ kind: 'web', locator: 'h:short' })).toEqual({ kind: 'web' });
  });

  it('a book, a share and a Bible reference keep what the policy says they keep', () => {
    expect(stored({ kind: 'file', title: 'A book', locator: 'epubcfi(/6/2)' })).toEqual({ kind: 'file', title: 'A book', locator: 'epubcfi(/6/2)' });
    expect(stored({ kind: 'share', mechanism: 'web-share-target', title: 'T', locator: '/p' })).toMatchObject({ title: 'T', locator: '/p' });
    expect(stored({ kind: 'scripture', provider: 'other', translationId: 'x', book: 'JHN', chapter: 1, confidence: 1 })).toMatchObject({ book: 'JHN', chapter: 1 });
  });

  it('the extension\'s last step before an event holds to it too', () => {
    expect(sourceRefOf({ kind: 'web', title: 'My bank', locator: '/reset/secret-token' })).toEqual({ kind: 'web' });
    expect(sourceRefOf({ kind: 'web', locator: HASH })).toEqual({ kind: 'web', locator: HASH });
  });

  it('the policy says what the code does', () => {
    const policy = readFileSync(join(__dirname, '../../../docs/legal/PRIVACY-POLICY.md'), 'utf8');
    expect(policy).toContain('hashes** of the sentence and of the page\'s address');
    expect(policy).toContain('the Bible reference you were reading, in readable form');
    expect(policy).toContain('Render');
    expect(policy).not.toContain('computer operated by the owner');
  });
});

describe('cleaning what the service already holds', () => {
  const dir = mkdtempSync(join(tmpdir(), 'scrub-'));
  afterAll(() => { try { rmSync(dir, { recursive: true, force: true }); } catch { /* locked on Windows */ } });

  it('counts without --apply, then removes the readable fields and nothing else', async () => {
    const file = join(dir, 'repository.sqlite');
    const s = openSqliteStore(file);
    await s.putLearner({ learnerId: L1, createdAt: '2026-10-01T00:00:00.000Z' });
    const withRef = (id: string, sourceRef: unknown) => { const e = ev(id); return { ...e, subject: { ...e.subject, sourceRef } } as typeof e; };
    await s.append(L1, [
      withRef('old-web', { kind: 'web', title: 'My bank', locator: '/reset/secret-token' }),
      withRef('new-web', { kind: 'web', locator: HASH }),
      withRef('book', { kind: 'file', title: 'A book', locator: 'epubcfi(/6/2)' }),
      ev('none'),
    ]);
    await s.close();

    expect(scrubSqlite(file, false)).toBe(1);
    expect(scrubSqlite(file, true)).toBe(1);
    expect(scrubSqlite(file, false)).toBe(0);

    const again = openSqliteStore(file);
    const rows = await again.list({ learnerId: L1 });
    await again.close();
    const ref = (id: string) => rows.find((e) => e.id === id)!.subject.sourceRef;
    expect(rows).toHaveLength(4);
    expect(ref('old-web')).toEqual({ kind: 'web' });
    expect(ref('new-web')).toEqual({ kind: 'web', locator: HASH });
    expect(ref('book')).toEqual({ kind: 'file', title: 'A book', locator: 'epubcfi(/6/2)' });
    expect(JSON.stringify(rows)).not.toContain('secret-token');
  });
});
