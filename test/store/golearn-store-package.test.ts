import { afterEach, describe, expect, it } from 'vitest';
import { inflateRawSync } from 'node:zlib';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { assertNoCredentials, collectRuntimeFiles, crc32, createZip, withFreshDist } from '../../scripts/golearn-store-package.mjs';

const roots: string[] = [];
function tempRoot() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'golearn-store-test-'));
  roots.push(root);
  return root;
}
afterEach(() => {
  for (const root of roots.splice(0)) fs.rmSync(root, { recursive: true, force: true });
});

describe('GoLearn store packaging helpers', () => {
  it('writes a deterministic ZIP whose local entry decompresses with a valid CRC', () => {
    const entries = [{ name: 'hello.txt', bytes: Buffer.from('store package smoke') }];
    const first = createZip(entries);
    const second = createZip(entries);
    expect(second.equals(first)).toBe(true);
    expect(first.readUInt32LE(0)).toBe(0x04034b50);
    const compressedLength = first.readUInt32LE(18);
    const rawLength = first.readUInt32LE(22);
    const nameLength = first.readUInt16LE(26);
    const extraLength = first.readUInt16LE(28);
    const start = 30 + nameLength + extraLength;
    const raw = inflateRawSync(first.subarray(start, start + compressedLength));
    expect(raw.length).toBe(rawLength);
    expect(first.readUInt32LE(14)).toBe(crc32(raw));
    expect(raw.toString()).toBe('store package smoke');
    expect(first.readUInt32LE(start + compressedLength)).toBe(0x02014b50);
  });

  it('rejects a developer translation credential payload by name before staging', () => {
    const root = tempRoot();
    fs.writeFileSync(path.join(root, 'translation.local.json'), '{}');
    expect(() => collectRuntimeFiles(root)).toThrow(/Unexpected build output/);
  });

  it('rejects credential-like fields in shipped configuration without printing values', () => {
    const root = tempRoot();
    const config = path.join(root, 'app', 'config.json');
    fs.mkdirSync(path.dirname(config), { recursive: true });
    fs.writeFileSync(config, JSON.stringify({ apiKey: 'sentinel-never-print-this' }));
    expect(() => assertNoCredentials([{ source: config, relative: 'app/config.json', size: fs.statSync(config).size }])).toThrow(/Credential-like JSON field/);
  });

  it('restores the existing dist contents after a failed isolated build and leaves no stale output when dist was absent', () => {
    const root = tempRoot();
    const dist = path.join(root, 'dist');
    fs.mkdirSync(dist);
    fs.writeFileSync(path.join(dist, 'keep.txt'), 'original');
    fs.writeFileSync(path.join(dist, 'old-output.txt'), 'old');
    expect(() => withFreshDist(dist, () => {
      expect(fs.existsSync(dist)).toBe(false);
      fs.mkdirSync(dist);
      fs.writeFileSync(path.join(dist, 'new-output.txt'), 'generated');
      throw new Error('simulated build failure');
    })).toThrow('simulated build failure');
    expect(fs.readFileSync(path.join(dist, 'keep.txt'), 'utf8')).toBe('original');
    expect(fs.existsSync(path.join(dist, 'old-output.txt'))).toBe(true);
    expect(fs.existsSync(path.join(dist, 'new-output.txt'))).toBe(false);

    const absent = path.join(root, 'fresh-dist');
    withFreshDist(absent, () => {
      fs.mkdirSync(absent);
      fs.writeFileSync(path.join(absent, 'generated.txt'), 'generated');
    });
    expect(fs.existsSync(absent)).toBe(false);
  });
});
