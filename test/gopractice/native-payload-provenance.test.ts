import { createHash } from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { createNativePayloadManifest, resolveNativeBuildMode, transformNativeWebPayload, verifyNativePayloadManifest } from '../../packages/goreview-ios/scripts/native-payload.mjs';

const temporary: string[] = [];
const hash = (value: string | Buffer) => createHash('sha256').update(value).digest('hex');
const canonical = (value: unknown) => JSON.stringify(value, null, 2) + '\n';
function fixture(release = false): string {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'goreview-native-payload-'));
  temporary.push(root);
  fs.mkdirSync(path.join(root, 'biblia'), { recursive: true });
  fs.writeFileSync(path.join(root, 'index.html'), '<link rel="manifest" href="./manifest.webmanifest"><meta name="mobile-web-app-capable" content="yes"><script>navigator.serviceWorker.register("./sw.js")</script><main>GoReview</main>');
  fs.writeFileSync(path.join(root, 'sw.js'), 'self.addEventListener("fetch", () => {});');
  fs.writeFileSync(path.join(root, 'manifest.webmanifest'), '{}');
  fs.writeFileSync(path.join(root, 'config.json'), '{"serviceUrl":"https://example.invalid","bibliaUrl":"./biblia/index.html"}\n');
  fs.writeFileSync(path.join(root, 'biblia', 'index.html'), '<main>Biblia payload</main>');
  const sourceFiles = [{ path: 'packages/goreview/src/scheduler/deck.ts', sha256: hash('source') }];
  const artifactFiles = [{ path: 'index.html', sha256: hash('<main>verified parent</main>') }];
  const parent = {
    schemaVersion: 1, product: 'GoReview', artifactKind: 'embedded-web',
    buildMode: release ? 'release' : 'developer', releaseEligible: release,
    git: { commit: 'a'.repeat(40), tree: 'b'.repeat(40), dirty: !release },
    sourceFiles, sourceManifestSha256: hash(canonical(sourceFiles)), artifactFiles,
    artifactManifestSha256: hash(canonical(artifactFiles)), requiredCapabilities: [], compiledSourceModules: [],
  };
  fs.writeFileSync(path.join(root, 'goreview-release-manifest.json'), canonical(parent));
  return root;
}

afterEach(() => { for (const root of temporary.splice(0)) fs.rmSync(root, { recursive: true, force: true }); });

describe('native embedded-web provenance', () => {
  it('forces an explicit developer default and lets the release flag override inherited release settings', () => {
    expect(resolveNativeBuildMode([])).toBe('developer');
    expect(resolveNativeBuildMode(['--developer'])).toBe('developer');
    expect(resolveNativeBuildMode(['--release'])).toBe('release');
    expect(() => resolveNativeBuildMode(['--release', '--developer'])).toThrow(/exactly one/);
    expect(() => resolveNativeBuildMode(['--unexpected'])).toThrow(/exactly one/);
  });

  it('links a transformed Biblia/native payload to the parent commit and both parent manifests', () => {
    const root = fixture(true);
    const transformations = transformNativeWebPayload(root, { serviceUrl: 'https://repository.example.com' });
    expect(transformations.length).toBeGreaterThan(0);
    expect(fs.existsSync(path.join(root, 'sw.js'))).toBe(false);
    expect(fs.existsSync(path.join(root, 'manifest.webmanifest'))).toBe(false);
    expect(fs.readFileSync(path.join(root, 'index.html'), 'utf8')).not.toMatch(/serviceWorker|rel="manifest"|mobile-web-app-capable/);
    expect(JSON.parse(fs.readFileSync(path.join(root, 'config.json'), 'utf8')).serviceUrl).toBe('https://repository.example.com');
    const manifest = createNativePayloadManifest(root, { mode: 'release', transformations }) as {
      releaseEligible: boolean; parentBuild: { git: { commit: string }; sourceManifestSha256: string; artifactManifestSha256: string };
      payloadFiles: Array<{ path: string }>; payloadManifestSha256: string;
    };
    expect(manifest).toMatchObject({ releaseEligible: true, parentBuild: { git: { commit: 'a'.repeat(40) } } });
    expect(manifest.parentBuild.sourceManifestSha256).toBe(hash(canonical([{ path: 'packages/goreview/src/scheduler/deck.ts', sha256: hash('source') }])));
    expect(manifest.payloadFiles.map(file => file.path)).toContain('biblia/index.html');
    expect(manifest.payloadFiles.map(file => file.path)).toContain('goreview-release-manifest.json');
    expect(verifyNativePayloadManifest(root, { requireRelease: true })).toMatchObject({ payloadManifestSha256: manifest.payloadManifestSha256 });
  });

  it('rejects changed final bytes and refuses developer parents as release payloads', () => {
    const root = fixture();
    createNativePayloadManifest(root, { mode: 'developer' });
    fs.appendFileSync(path.join(root, 'biblia', 'index.html'), 'tampered');
    expect(() => verifyNativePayloadManifest(root)).toThrow(/payload integrity/);
    expect(() => createNativePayloadManifest(fixture(), { mode: 'release' })).toThrow(/clean, release-eligible/);
  });
});
