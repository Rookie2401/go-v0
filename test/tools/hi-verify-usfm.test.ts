import crypto from 'node:crypto';
import fs from 'node:fs';
import { execFileSync } from 'node:child_process';
import { describe, expect, it } from 'vitest';

const archive = 'data/sources/hi/usfm';
const record = 'data/verified/scripture.json';
const sha = () => (fs.existsSync(record) ? crypto.createHash('sha256').update(fs.readFileSync(record)).digest('hex') : 'absent');

describe.skipIf(!fs.existsSync(archive))('scripts/verify-hi-usfm.mjs', () => {
  it('--check-only compares the bundled Hindi source with the publisher archive, accepts the five seed chapters that overlap the "-complete" ones, and never writes the verification record', () => {
    const before = sha();
    const out = execFileSync(process.execPath, ['scripts/verify-hi-usfm.mjs', '--check-only'], { encoding: 'utf8', timeout: 120000 });
    expect(out).toMatch(/check only, nothing written/);
    expect(out).toMatch(/31104 verses, 0 mismatches/);
    expect(out).toMatch(/seed verses are also in the lazy source and agree/);
    expect(sha()).toBe(before);
  }, 150000);
});
