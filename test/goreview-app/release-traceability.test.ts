import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { assertBuildModeAllowed, createReleaseManifest, normalizeCompiledModuleId, parseVerifyArgs, REQUIRED_CAPABILITIES, verifyReleaseArtifact } from '../../scripts/goreview-release.mjs';

const temporary: string[] = [];
const hash = (text: string | Buffer) => createHash('sha256').update(text).digest('hex');
const canonical = (value: unknown) => JSON.stringify(value, null, 2) + '\n';
function artifactDir() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'goreview-release-'));
  temporary.push(dir);
  fs.writeFileSync(path.join(dir, 'index.html'), '<main>GoReview</main>');
  fs.mkdirSync(path.join(dir, 'assets'));
  fs.writeFileSync(path.join(dir, 'assets', 'review.js'), 'export const review = true;');
  return dir;
}
function cleanProject(): string {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'goreview-source-'));
  temporary.push(root);
  for (const file of REQUIRED_CAPABILITIES) {
    const target = path.join(root, file);
    fs.mkdirSync(path.dirname(target), { recursive: true });
    fs.writeFileSync(target, `// ${path.basename(file)}\n`);
  }
  execFileSync('git', ['init', '-q'], { cwd: root });
  execFileSync('git', ['-c', 'user.name=GoReview Test', '-c', 'user.email=goreview-test@example.invalid', 'add', '.'], { cwd: root });
  execFileSync('git', ['-c', 'user.name=GoReview Test', '-c', 'user.email=goreview-test@example.invalid', 'commit', '-qm', 'reviewed source'], { cwd: root });
  return root;
}

const identity = ['-c', 'user.name=GoReview Test', '-c', 'user.email=goreview-test@example.invalid'];
const commit = (root: string, ...args: string[]) => execFileSync('git', [...identity, 'commit', '-q', ...args], { cwd: root });
const head = (root: string) => execFileSync('git', ['rev-parse', 'HEAD'], { cwd: root, encoding: 'utf8' }).trim();

afterEach(() => { for (const dir of temporary.splice(0)) fs.rmSync(dir, { recursive: true, force: true }); });

describe('GoReview release traceability', () => {
  it('blocks dirty source in release mode while allowing explicit developer mode', () => {
    expect(() => assertBuildModeAllowed('release', true)).toThrow(/clean Git working tree/);
    expect(() => assertBuildModeAllowed('developer', true)).not.toThrow();
  });

  it('accepts a clean reviewed source snapshot and distinguishes a later dirty developer build', () => {
    const root = cleanProject();
    const artifact = artifactDir();
    const release = createReleaseManifest(artifact, 'release', [...REQUIRED_CAPABILITIES], root) as { releaseEligible: boolean; git: { dirty: boolean }; gitCommit?: string };
    expect(release).toMatchObject({ releaseEligible: true, git: { dirty: false } });
    expect(verifyReleaseArtifact(artifact, { requireRelease: true, compareCurrentSource: true, projectRoot: root })).toMatchObject({ releaseEligible: true });

    const changed = path.join(root, REQUIRED_CAPABILITIES[0]);
    fs.appendFileSync(changed, '// local edit\n');
    const development = createReleaseManifest(artifact, 'developer', [...REQUIRED_CAPABILITIES], root) as { releaseEligible: boolean; git: { dirty: boolean } };
    expect(development).toMatchObject({ releaseEligible: false, git: { dirty: true } });
    expect(() => verifyReleaseArtifact(artifact, { requireRelease: true, projectRoot: root })).toThrow(/development-only/);
  });

  it('records source commit, required SRS2 modules, and hashes for the actual web artifact', () => {
    const dir = artifactDir();
    const manifest = createReleaseManifest(dir, 'developer', [...REQUIRED_CAPABILITIES]) as { releaseEligible: boolean; sourceFiles: { path: string; sha256: string }[]; artifactFiles: { path: string; sha256: string }[]; compiledSourceModules: string[]; git: { commit: string; dirty: boolean } };
    expect(manifest.git.commit).toMatch(/^[0-9a-f]{40}$/);
    expect(manifest.releaseEligible).toBe(false);
    const recordedSource = manifest.sourceFiles.find((file) => file.path === 'packages/goreview/src/scheduler/review-convergence.ts');
    expect(recordedSource).toMatchObject({ sha256: hash(fs.readFileSync('packages/goreview/src/scheduler/review-convergence.ts')) });
    expect(manifest.compiledSourceModules).toContain('packages/goreview/src/scheduler/review-convergence.ts');
    expect(manifest.artifactFiles).toEqual([
      { path: 'assets/review.js', sha256: hash('export const review = true;') },
      { path: 'index.html', sha256: hash('<main>GoReview</main>') },
    ]);
    expect(verifyReleaseArtifact(dir, { compareCurrentSource: true })).toMatchObject({ artifactKind: 'embedded-web', releaseEligible: false });
    expect(() => verifyReleaseArtifact(dir, { requireRelease: true })).toThrow(/development-only/);
  });

  it('rejects an artifact file modified after the build manifest was written', () => {
    const dir = artifactDir();
    createReleaseManifest(dir, 'developer', [...REQUIRED_CAPABILITIES]);
    fs.appendFileSync(path.join(dir, 'assets', 'review.js'), '\n// changed');
    expect(() => verifyReleaseArtifact(dir)).toThrow(/artifact integrity/);
  });

  it('rejects a source manifest that omits a required scheduling module', () => {
    const dir = artifactDir();
    createReleaseManifest(dir, 'developer', [...REQUIRED_CAPABILITIES]);
    const file = path.join(dir, 'goreview-release-manifest.json');
    const manifest = JSON.parse(fs.readFileSync(file, 'utf8')) as { requiredCapabilities: string[]; sourceFiles: { path: string; sha256: string }[]; sourceManifestSha256: string };
    manifest.requiredCapabilities = manifest.requiredCapabilities.filter((item) => !item.endsWith('/review-convergence.ts'));
    manifest.sourceFiles = manifest.sourceFiles.filter((item) => !item.path.endsWith('/review-convergence.ts'));
    manifest.sourceManifestSha256 = hash(canonical(manifest.sourceFiles));
    fs.writeFileSync(file, canonical(manifest));
    expect(() => verifyReleaseArtifact(dir)).toThrow(/Required GoReview capability/);
  });

  it('rejects a source checkout whose required SRS2 module did not enter the emitted bundle', () => {
    const dir = artifactDir();
    const withoutConvergence = REQUIRED_CAPABILITIES.filter((file) => !file.endsWith('/review-convergence.ts'));
    expect(() => createReleaseManifest(dir, 'developer', withoutConvergence)).toThrow(/was not compiled into the web artifact/);
  });

  it('normalizes Vite query ids, rejects virtual/outside ids, and hashes installed compiled dependencies', () => {
    const root = cleanProject();
    const sourcePath = path.join(root, REQUIRED_CAPABILITIES.at(-1)!);
    expect(normalizeCompiledModuleId(`${sourcePath}?v=123&commonjs-proxy`, root)).toEqual({ sourcePath: REQUIRED_CAPABILITIES.at(-1) });
    expect(normalizeCompiledModuleId('\0virtual:goreview', root)).toBeUndefined();
    expect(normalizeCompiledModuleId(path.join(root, '..', 'outside.ts'), root)).toBeUndefined();

    const dependencyPath = path.join(root, 'node_modules', 'tiny-dependency', 'index.mjs');
    fs.mkdirSync(path.dirname(dependencyPath), { recursive: true });
    fs.writeFileSync(dependencyPath, 'export const installed = true;');
    const artifact = artifactDir();
    const manifest = createReleaseManifest(artifact, 'developer', [...REQUIRED_CAPABILITIES], root, [dependencyPath]) as {
      compiledDependencyFiles: Array<{ path: string; sha256: string }>;
    };
    expect(manifest.compiledDependencyFiles).toEqual([{ path: 'node_modules/tiny-dependency/index.mjs', sha256: hash('export const installed = true;') }]);
    const verified = verifyReleaseArtifact(artifact, { compareCurrentSource: true, projectRoot: root }) as typeof manifest;
    expect(verified.compiledDependencyFiles).toEqual(manifest.compiledDependencyFiles);
  });

  it('verifies a release artifact at the commit it was built from and refuses it once an empty commit moves HEAD', () => {
    const root = cleanProject();
    const artifact = artifactDir();
    const built = createReleaseManifest(artifact, 'release', [...REQUIRED_CAPABILITIES], root) as { git: { commit: string; tree: string } };
    expect(built.git.commit).toBe(head(root));
    expect(verifyReleaseArtifact(artifact, { requireRelease: true, compareCurrentSource: true, projectRoot: root })).toMatchObject({ releaseEligible: true });

    commit(root, '--allow-empty', '-m', 'empty commit after the build');
    expect(head(root)).not.toBe(built.git.commit);
    expect(() => verifyReleaseArtifact(artifact, { requireRelease: true, compareCurrentSource: true, projectRoot: root })).toThrow(/built from commit [0-9a-f]{40} but the checkout is at [0-9a-f]{40}/);
    // developer-mode verification (no --release) is unchanged: the source still matches, so it passes
    expect(verifyReleaseArtifact(artifact, { compareCurrentSource: true, projectRoot: root })).toMatchObject({ releaseEligible: true });
  });

  it('--expect-commit verifies against a named commit: the right sha passes, a wrong sha or a malformed one fails', () => {
    const root = cleanProject();
    const artifact = artifactDir();
    const built = createReleaseManifest(artifact, 'release', [...REQUIRED_CAPABILITIES], root) as { git: { commit: string } };
    commit(root, '--allow-empty', '-m', 'HEAD moved on');
    const options = { requireRelease: true, compareCurrentSource: true, projectRoot: root };
    expect(verifyReleaseArtifact(artifact, { ...options, expectCommit: built.git.commit })).toMatchObject({ releaseEligible: true });
    expect(verifyReleaseArtifact(artifact, { ...options, expectCommit: built.git.commit.slice(0, 10) })).toMatchObject({ releaseEligible: true });
    expect(() => verifyReleaseArtifact(artifact, { ...options, expectCommit: head(root) })).toThrow(/not from the expected commit/);
    expect(() => verifyReleaseArtifact(artifact, { ...options, expectCommit: '0'.repeat(40) })).toThrow(/not from the expected commit/);
    expect(() => verifyReleaseArtifact(artifact, { ...options, expectCommit: 'not-a-sha' })).toThrow(/7 to 40 hex digits/);
  });

  it('parses the verify command line: --expect-commit only with --release, never by default', () => {
    expect(parseVerifyArgs(['verify', 'out'])).toEqual({ target: 'out', requireRelease: false, expectCommit: undefined });
    expect(parseVerifyArgs(['verify', 'out', '--release'])).toEqual({ target: 'out', requireRelease: true, expectCommit: undefined });
    expect(parseVerifyArgs(['verify', 'out', '--release', '--expect-commit', 'abc1234'])).toMatchObject({ requireRelease: true, expectCommit: 'abc1234' });
    expect(parseVerifyArgs(['verify', 'out', '--release', '--expect-commit=abc1234'])).toMatchObject({ expectCommit: 'abc1234' });
    expect(() => parseVerifyArgs(['verify', 'out', '--expect-commit', 'abc1234'])).toThrow(/release verification only/);
    expect(() => parseVerifyArgs(['verify', 'out', '--release', '--expect-commit'])).toThrow(/needs a commit sha/);
    expect(() => parseVerifyArgs(['verify', 'out', '--relese'])).toThrow(/Unknown argument/);
    expect(() => parseVerifyArgs(['verify'])).toThrow(/Usage/);
  });

  it('hashes the native-shell workflow inputs, so changing one changes the manifest', () => {
    const root = cleanProject();
    const inputs = [
      'packages/goreview-ios/app.json', 'packages/goreview-ios/eas.json', 'packages/goreview-ios/capacitor.config.ts',
      'packages/goreview-ios/.eas/build/ios-testflight.yml', 'packages/goreview-ios/scripts/set-build-version.mjs',
      'packages/goreview-ios/scripts/prepare-eas-ios-project.mjs', 'packages/goreview-ios/scripts/validate-app-icon.mjs',
      'packages/goreview-ios/scripts/archive-testflight.sh', 'packages/goreview-ios/templates/eas-project/package.json',
      'packages/goreview-ios/templates/eas-project/nested/extra.txt',
    ];
    for (const file of inputs) {
      fs.mkdirSync(path.dirname(path.join(root, file)), { recursive: true });
      fs.writeFileSync(path.join(root, file), `original ${file}
`);
    }
    execFileSync('git', ['add', '.'], { cwd: root });
    commit(root, '-m', 'native shell inputs');
    const build = () => createReleaseManifest(artifactDir(), 'release', [...REQUIRED_CAPABILITIES], root) as { sourceManifestSha256: string; sourceFiles: { path: string }[] };
    const before = build();
    for (const file of inputs) expect(before.sourceFiles.map((entry) => entry.path)).toContain(file);
    // each input is changed and committed in turn (a clean tree is needed for release mode); every one of them moves the source manifest hash
    for (const file of inputs) {
      fs.writeFileSync(path.join(root, file), `changed ${file}
`);
      execFileSync('git', ['add', '.'], { cwd: root });
      commit(root, '-m', `change ${file}`);
      expect(build().sourceManifestSha256, file).not.toBe(before.sourceManifestSha256);
    }
  });
});
