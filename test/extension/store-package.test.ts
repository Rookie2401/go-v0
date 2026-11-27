// The Chrome Web Store package (scripts/extension-store-package.mjs): what its verification refuses, and that its zip
// holds exactly the folder's files under UTF-8 names with forward slashes.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import zlib from 'node:zlib';
import { afterEach, describe, expect, it } from 'vitest';
// @ts-expect-error a plain .mjs build script, without types
import { STORE_ASSET_BASE, verifyStorePackage, writeZip } from '../../scripts/extension-store-package.mjs';

const temporary: string[] = [];
afterEach(() => { for (const d of temporary.splice(0)) fs.rmSync(d, { recursive: true, force: true }); });

function write(root: string, rel: string, content: string | Buffer = 'x'): void {
  const full = path.join(root, rel);
  fs.mkdirSync(path.dirname(full), { recursive: true });
  fs.writeFileSync(full, content);
}

/** The smallest folder the verification accepts. */
function goodPackage(): string {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'golearn-store-'));
  temporary.push(root);
  write(root, 'manifest.json', JSON.stringify({
    manifest_version: 3, version: '0.1.0', background: { service_worker: 'background.js' }, options_page: 'app/index.html',
    action: { default_popup: 'action/popup.html' }, icons: { 16: 'icons/icon-16.png' },
  }));
  write(root, 'build.json', '{"id":"abc"}');
  for (const f of ['background.js', 'content.js', 'app/index.html', 'action/popup.html', 'icons/icon-16.png', 'review/index.html', 'app/dict/sq/manifest.json']) write(root, f);
  write(root, 'review/config.json', JSON.stringify({ serviceUrl: 'https://go-v0.onrender.com', assetBaseUrl: STORE_ASSET_BASE }));
  write(root, 'review/lexicon/ru/standard/й.json.gz', zlib.gzipSync('{}'));
  return root;
}

const verify = (root: string): string[] => verifyStorePackage(root) as string[];

describe('the store package verification', () => {
  it('accepts a package with no private file, no dictionaries inside GoReview and a hosted dictionary address', () => {
    expect(verify(goodPackage())).toEqual([]);
  });

  it('refuses the device-only translation credentials, wherever they sit', () => {
    const root = goodPackage();
    write(root, 'translation.local.json', '{}');
    write(root, 'app/settings.local.json', '{}');
    const problems = verify(root);
    expect(problems.filter((p) => p.startsWith('private device file'))).toHaveLength(2);
  });

  it('refuses a build made from uncommitted changes', () => {
    const root = goodPackage();
    write(root, 'build.json', '{"id":"d30c1032c8ca-dirty"}');
    expect(verify(root).join(' | ')).toMatch(/built from uncommitted changes/);
  });

  it('refuses dictionaries inside GoReview and a config that would look for them beside the page', () => {
    const root = goodPackage();
    write(root, 'review/dict/de/manifest.json', '{}');
    write(root, 'review/config.json', JSON.stringify({ serviceUrl: 'https://go-v0.onrender.com', assetBaseUrl: './' }));
    const problems = verify(root).join('\n');
    expect(problems).toMatch(/review\/dict\/ holds 1 dictionary files/);
    expect(problems).toMatch(/assetBaseUrl must be an absolute https address/);
  });

  it('refuses a second bundled reader dictionary, a source map, a key file and a file the manifest names but the package lacks', () => {
    const root = goodPackage();
    write(root, 'app/dict/de/manifest.json', '{}');
    write(root, 'content.js.map', '{}');
    write(root, 'signing.pem', 'x');
    fs.rmSync(path.join(root, 'background.js'));
    const problems = verify(root).join('\n');
    expect(problems).toMatch(/app\/dict\/de\/ is bundled/);
    expect(problems).toMatch(/source map in the package: content\.js\.map/);
    expect(problems).toMatch(/credential-like file in the package: signing\.pem/);
    expect(problems).toMatch(/names a file that is not in the package: background\.js/);
  });
});

/** Reads a plain zip back through its central directory. */
function readZip(file: string): Map<string, Buffer> {
  const zip = fs.readFileSync(file);
  const end = zip.length - 22;
  expect(zip.readUInt32LE(end)).toBe(0x06054b50);
  const count = zip.readUInt16LE(end + 10);
  let at = zip.readUInt32LE(end + 16);
  const out = new Map<string, Buffer>();
  for (let i = 0; i < count; i++) {
    expect(zip.readUInt32LE(at)).toBe(0x02014b50);
    expect(zip.readUInt16LE(at + 8) & 0x0800, 'UTF-8 name flag').toBe(0x0800);
    const method = zip.readUInt16LE(at + 10);
    const packed = zip.readUInt32LE(at + 20);
    const nameLength = zip.readUInt16LE(at + 28);
    const local = zip.readUInt32LE(at + 42);
    const name = zip.subarray(at + 46, at + 46 + nameLength).toString('utf8');
    const dataAt = local + 30 + zip.readUInt16LE(local + 26) + zip.readUInt16LE(local + 28);
    const body = zip.subarray(dataAt, dataAt + packed);
    const data = method === 8 ? zlib.inflateRawSync(body) : Buffer.from(body);
    expect(zlib.crc32(data)).toBe(zip.readUInt32LE(at + 16));
    out.set(name, data);
    at += 46 + nameLength;
  }
  return out;
}

describe('the store zip', () => {
  it('holds every file of the folder byte for byte, manifest.json at its root, names in UTF-8 with forward slashes', () => {
    const root = goodPackage();
    write(root, 'app/big.js', 'a'.repeat(50_000));
    const zipPath = path.join(root, '..', `${path.basename(root)}.zip`);
    temporary.push(zipPath);
    const result = writeZip(root, zipPath) as { files: number; bytes: number };
    const entries = readZip(zipPath);
    expect(result.files).toBe(entries.size);
    expect([...entries.keys()]).toContain('manifest.json');
    expect([...entries.keys()]).toContain('review/lexicon/ru/standard/й.json.gz');
    expect([...entries.keys()].some((n) => n.includes('\\') || n.startsWith('./') || n.startsWith('/'))).toBe(false);
    for (const [name, data] of entries) expect(data.equals(fs.readFileSync(path.join(root, name))), name).toBe(true);
    expect(result.bytes).toBeLessThan(50_000); // the repeated script deflates
  });

  it('gives the same bytes for the same folder', () => {
    const root = goodPackage();
    const a = path.join(root, '..', `${path.basename(root)}-a.zip`);
    const b = path.join(root, '..', `${path.basename(root)}-b.zip`);
    temporary.push(a, b);
    writeZip(root, a); writeZip(root, b);
    expect(fs.readFileSync(a).equals(fs.readFileSync(b))).toBe(true);
  });
});
