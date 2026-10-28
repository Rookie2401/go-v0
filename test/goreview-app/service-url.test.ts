/**
 * GOREVIEW_SERVICE_URL: the review (installable) edition is built against the public Repository address; the copied
 * config.json carries it, the source config.json keeps the local development address, and a non-https address (or any
 * address with credentials, query or fragment) refuses to build, so a typo cannot ship to the phone.
 */
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterAll, describe, expect, it } from 'vitest';

const root = path.resolve(__dirname, '../..');
const vite = path.join(root, 'node_modules', 'vite', 'bin', 'vite.js');
const scratch = fs.mkdtempSync(path.join(os.tmpdir(), 'goreview-service-url-'));
afterAll(() => { fs.rmSync(scratch, { recursive: true, force: true }); });

function build(out: string, serviceUrl?: string): void {
  execFileSync(process.execPath, [vite, 'build', '-c', 'packages/goreview/app/vite.config.ts', '--mode', 'review'], {
    cwd: root, stdio: 'pipe', timeout: 120_000,
    env: { ...process.env, GOREVIEW_DICT: '', GOREVIEW_OUT: out, ...(serviceUrl !== undefined ? { GOREVIEW_SERVICE_URL: serviceUrl } : {}) },
  });
}

describe('the review build and the service address', () => {
  it('writes the public https address into the copied config.json and leaves the source config alone', () => {
    const out = path.join(scratch, 'public');
    build(out, 'https://repo.golearn-global-languages.com/');
    const copied = JSON.parse(fs.readFileSync(path.join(out, 'config.json'), 'utf8')) as { serviceUrl: string; assetBaseUrl: string };
    expect(copied.serviceUrl).toBe('https://repo.golearn-global-languages.com'); // trailing slash dropped
    expect(copied.assetBaseUrl).toBe('./');
    const source = JSON.parse(fs.readFileSync(path.join(root, 'packages', 'goreview', 'app', 'config.json'), 'utf8')) as { serviceUrl: string };
    expect(source.serviceUrl).toBe('http://127.0.0.1:8790');
  }, 150_000);

  it('without the variable the copy is the source config', () => {
    const out = path.join(scratch, 'plain');
    build(out);
    const copied = JSON.parse(fs.readFileSync(path.join(out, 'config.json'), 'utf8')) as { serviceUrl: string };
    expect(copied.serviceUrl).toBe('http://127.0.0.1:8790');
  }, 150_000);

  it('refuses a plain-http public address and an address carrying a query or credentials', () => {
    for (const bad of ['http://repo.golearn-global-languages.com', 'https://user:pw@repo.golearn-global-languages.com', 'https://repo.golearn-global-languages.com/?x=1']) {
      expect(() => build(path.join(scratch, 'bad'), bad), bad).toThrow();
    }
  }, 200_000);
});
