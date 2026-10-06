import { execFileSync } from 'node:child_process';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

describe('bundled Scripture canon coverage', () => {
  it('checks the expected 66-book map for every full bundled translation', () => {
    const output = execFileSync(process.execPath, [path.resolve('scripts/verify-scripture-canon.mjs')], { encoding: 'utf8' });
    expect(output).toMatch(/de: 66 books, 1189 chapters, \d+ source verses; installed \d+ verses/);
    expect(output).toMatch(/es: 66 books, 1189 chapters, \d+ source verses; installed \d+ verses/);
    expect(output).toMatch(/hi: 66 books, 1189 chapters, \d+ source verses; installed \d+ verses/);
    expect(output).toMatch(/th: 66 books, 1189 chapters, \d+ source verses; installed \d+ verses/);
  });
});
