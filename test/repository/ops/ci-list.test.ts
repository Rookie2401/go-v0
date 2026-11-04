// @vitest-environment node
/** The list of tests CI leaves out is a list of real files, so it cannot quietly hide a test by naming nothing or go stale after a rename. */
import { existsSync, readFileSync } from 'node:fs';
import { expect, it } from 'vitest';

it('every entry in test/needs-local-data.txt is a test file that exists, each once', () => {
  const entries = readFileSync('test/needs-local-data.txt', 'utf8').split(/\r?\n/).map((l) => l.split('#')[0]!.trim()).filter(Boolean);
  expect(entries.length).toBeGreaterThan(0);
  expect(new Set(entries).size).toBe(entries.length);
  for (const e of entries) {
    expect(existsSync(e), e).toBe(true);
    expect(e, e).toMatch(/\.test\.tsx?$/);
  }
});
