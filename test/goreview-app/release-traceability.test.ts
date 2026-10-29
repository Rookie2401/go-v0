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

/** Install a fake package under projectRoot: package.json (name, version) plus the given files. Returns the absolute path of each file. */
function installPackage(root: string, directory: string, pkg: { name: string; version: string }, files: Record<string, string>): string[] {
  fs.mkdirSync(path.join(root, directory), { recursive: true });
  fs.writeFileSync(path.join(root, directory, 'package.json'), JSON.stringify(pkg));
  return Object.entries(files).map(([file, text]) => {
    const target = path.join(root, directory, file);
    fs.mkdirSync(path.dirname(target), { recursive: true });
    fs.writeFileSync(target, text);
    return target;
  });
}
type PackageEntry = { name: string; version: string; path: string; fileCount: number; sha256: string };
type Scheduler = { library: string; version: string; algorithm: string; sha256: string } | null;
const SCHEDULER_SOURCE = 'packages/goreview/src/scheduler/fsrs.ts';
const installedTsFsrs = JSON.parse(fs.readFileSync('node_modules/ts-fsrs/package.json', 'utf8')) as { version: string };
/** Rewrite the manifest in an artifact directory, as a tamperer would; rehash recomputes the integrity hash that covers the package list. */
function rewriteManifest(dir: string, change: (manifest: { compiledDependencyPackages: PackageEntry[]; compiledDependencyPackagesSha256: string; scheduler: Scheduler }) => void, rehash = true) {
  const file = path.join(dir, 'goreview-release-manifest.json');
  const manifest = JSON.parse(fs.readFileSync(file, 'utf8'));
  change(manifest);
  if (rehash) manifest.compiledDependencyPackagesSha256 = hash(canonical(manifest.compiledDependencyPackages));
  fs.writeFileSync(file, canonical(manifest));
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

    const [dependencyPath] = installPackage(root, 'node_modules/tiny-dependency', { name: 'tiny-dependency', version: '1.2.3' }, { 'index.mjs': 'export const installed = true;' });
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
  it('keeps real node_modules dependencies whose compiled files live in dist/, dist-*/, web/ or build/ folders', () => {
    // the real scheduler, resolved against the repository's own node_modules
    expect(normalizeCompiledModuleId('node_modules/ts-fsrs/dist/index.mjs')).toEqual({ dependencyPath: 'node_modules/ts-fsrs/dist/index.mjs' });
    const root = cleanProject();
    const scoped = installPackage(root, 'node_modules/@open-spaced-repetition/binding', { name: '@open-spaced-repetition/binding', version: '0.1.0' }, { 'dist/x.js': 'export {};', 'build/y.js': 'export {};', 'web/z.js': 'export {};' });
    const nested = installPackage(root, 'node_modules/outer/node_modules/@scope/inner', { name: '@scope/inner', version: '2.0.0' }, { 'dist-esm/w.js': 'export {};' });
    for (const file of [...scoped, ...nested]) {
      const relative = path.relative(root, file).split(path.sep).join('/');
      expect(normalizeCompiledModuleId(file, root), relative).toEqual({ dependencyPath: relative });
      expect(normalizeCompiledModuleId(relative, root), relative).toEqual({ dependencyPath: relative });
    }
    // the repository's own build output is still not a source and not a dependency
    for (const generated of ['packages/goreview/app/dist-review/index.js', 'packages/goreview/app/dist/assets/a.js', 'packages/goreview-ios/web/app.js', 'packages/goreview-ios/.eas-project/x.js', 'packages/goreview/app/.review-build/y.js', 'packages/goreview/app/dist-review/node_modules/pkg/index.js']) {
      fs.mkdirSync(path.dirname(path.join(root, generated)), { recursive: true });
      fs.writeFileSync(path.join(root, generated), 'export {};');
      expect(normalizeCompiledModuleId(generated, root), generated).toBeUndefined();
    }
    // a dependency that is not on disk is still dropped
    expect(normalizeCompiledModuleId('node_modules/absent/dist/index.js', root)).toBeUndefined();
  });

  it('records name, exact version and a per-package sha256 for every bundled dependency package, including scoped and nested ones', () => {
    const root = cleanProject();
    const a = installPackage(root, 'node_modules/@open-spaced-repetition/binding', { name: '@open-spaced-repetition/binding', version: '0.1.0' }, { 'dist/x.js': 'x', 'dist/a.js': 'a' });
    // dist/package.json carries no version here, so the nearest package.json with one is the package root
    fs.writeFileSync(path.join(root, 'node_modules/@open-spaced-repetition/binding/dist/package.json'), '{"type":"module"}');
    const b = installPackage(root, 'node_modules/outer/node_modules/inner', { name: 'inner', version: '9.9.9' }, { 'build/i.js': 'i' });
    const c = installPackage(root, 'node_modules/outer', { name: 'outer', version: '3.0.0' }, { 'dist/o.js': 'o' });
    const artifact = artifactDir();
    const manifest = createReleaseManifest(artifact, 'developer', [...REQUIRED_CAPABILITIES], root, [...a, ...b, ...c]) as { compiledDependencyPackages: PackageEntry[]; compiledDependencyPackagesSha256: string; scheduler: Scheduler };
    expect(manifest.scheduler).toBeNull();
    expect(manifest.compiledDependencyPackages).toEqual([
      { name: 'inner', version: '9.9.9', path: 'node_modules/outer/node_modules/inner', fileCount: 1, sha256: hash(canonical([{ path: 'node_modules/outer/node_modules/inner/build/i.js', sha256: hash('i') }])) },
      { name: '@open-spaced-repetition/binding', version: '0.1.0', path: 'node_modules/@open-spaced-repetition/binding', fileCount: 2, sha256: hash(canonical([{ path: 'node_modules/@open-spaced-repetition/binding/dist/a.js', sha256: hash('a') }, { path: 'node_modules/@open-spaced-repetition/binding/dist/x.js', sha256: hash('x') }])) },
      { name: 'outer', version: '3.0.0', path: 'node_modules/outer', fileCount: 1, sha256: hash(canonical([{ path: 'node_modules/outer/dist/o.js', sha256: hash('o') }])) },
    ].sort((p, q) => p.path.localeCompare(q.path)));
    expect(manifest.compiledDependencyPackagesSha256).toBe(hash(canonical(manifest.compiledDependencyPackages)));
    expect(verifyReleaseArtifact(artifact, { compareCurrentSource: true, projectRoot: root })).toMatchObject({ artifactKind: 'embedded-web' });

    // the installed version moves on: refused by name, even though the manifest is untouched
    fs.writeFileSync(path.join(root, 'node_modules/outer/package.json'), JSON.stringify({ name: 'outer', version: '3.0.1' }));
    expect(() => verifyReleaseArtifact(artifact, { compareCurrentSource: true, projectRoot: root })).toThrow(/Installed bundled dependency outer is 3\.0\.1 but the artifact was built with 3\.0\.0/);
  });

  it('refuses a bundled dependency whose package version cannot be resolved', () => {
    const root = cleanProject();
    const file = path.join(root, 'node_modules', 'no-manifest', 'dist', 'index.js');
    fs.mkdirSync(path.dirname(file), { recursive: true });
    fs.writeFileSync(file, 'export {};');
    expect(() => createReleaseManifest(artifactDir(), 'developer', [...REQUIRED_CAPABILITIES], root, [file])).toThrow(/Cannot resolve the package name and version of bundled dependency node_modules\/no-manifest\/dist\/index\.js/);
  });

  it('treats files under a junctioned or symlinked node_modules (a worktree sharing another install) as the checkout dependencies', () => {
    const root = cleanProject();
    const shared = fs.mkdtempSync(path.join(os.tmpdir(), 'goreview-shared-install-'));
    temporary.push(shared);
    const [file] = installPackage(shared, 'ts-fsrs', { name: 'ts-fsrs', version: '7.7.7' }, { 'dist/index.mjs': 'export const FSRSVersion = `v7.7.7 using FSRS-9.9`;' });
    fs.symlinkSync(shared, path.join(root, 'node_modules'), 'junction');
    // Vite reports the real path, outside the checkout
    expect(normalizeCompiledModuleId(file, root)).toEqual({ dependencyPath: 'node_modules/ts-fsrs/dist/index.mjs' });
    expect(normalizeCompiledModuleId(path.join(shared, 'absent', 'dist', 'x.js'), root)).toBeUndefined();
    expect(normalizeCompiledModuleId(path.join(path.dirname(shared), 'outside.ts'), root)).toBeUndefined();
    const manifest = createReleaseManifest(artifactDir(), 'developer', [...REQUIRED_CAPABILITIES, SCHEDULER_SOURCE], root, [file]) as { scheduler: Scheduler };
    expect(manifest.scheduler).toMatchObject({ library: 'ts-fsrs', version: '7.7.7', algorithm: 'FSRS-9.9' });
  });

  describe('the bundled ts-fsrs scheduler', () => {
    const schedulerBuild = () => {
      const artifact = artifactDir();
      const manifest = createReleaseManifest(artifact, 'developer', [...REQUIRED_CAPABILITIES, SCHEDULER_SOURCE], undefined, [path.resolve('node_modules/ts-fsrs/dist/index.mjs')]) as { compiledDependencyFiles: { path: string; sha256: string }[]; compiledDependencyPackages: PackageEntry[]; scheduler: Scheduler };
      return { artifact, manifest };
    };

    it('appears in the manifest with the installed package.json version, its algorithm and the sha256 of its bundled files', () => {
      const { artifact, manifest } = schedulerBuild();
      const entry = manifest.compiledDependencyPackages.find((candidate) => candidate.name === 'ts-fsrs');
      expect(entry).toMatchObject({ name: 'ts-fsrs', version: installedTsFsrs.version, path: 'node_modules/ts-fsrs' });
      expect(manifest.compiledDependencyFiles.map((file) => file.path)).toContain('node_modules/ts-fsrs/dist/index.mjs');
      expect(manifest.scheduler).toEqual({ library: 'ts-fsrs', version: installedTsFsrs.version, algorithm: expect.stringMatching(/^FSRS-\d/), sha256: entry!.sha256 });
      expect(entry!.sha256).toBe(hash(canonical(manifest.compiledDependencyFiles.filter((file) => file.path.startsWith('node_modules/ts-fsrs/')))));
      expect(verifyReleaseArtifact(artifact, { compareCurrentSource: true })).toMatchObject({ scheduler: { library: 'ts-fsrs', version: installedTsFsrs.version } });
    });

    it('is required once the scheduler adapter is compiled in', () => {
      expect(() => createReleaseManifest(artifactDir(), 'developer', [...REQUIRED_CAPABILITIES, SCHEDULER_SOURCE], undefined, [])).toThrow(/no bundled ts-fsrs package was recorded/);
      const { artifact } = schedulerBuild();
      rewriteManifest(artifact, (manifest) => { manifest.scheduler = null; });
      expect(() => verifyReleaseArtifact(artifact)).toThrow(/records no ts-fsrs scheduler/);
    });

    it('fails verification when the manifest records a different ts-fsrs version than the checkout has installed', () => {
      const { artifact } = schedulerBuild();
      rewriteManifest(artifact, (manifest) => {
        manifest.compiledDependencyPackages.find((entry) => entry.name === 'ts-fsrs')!.version = '0.0.1';
        manifest.scheduler!.version = '0.0.1';
      });
      const message = new RegExp(`Installed bundled dependency ts-fsrs is ${installedTsFsrs.version.replaceAll('.', '\\.')} but the artifact was built with 0\\.0\\.1`);
      expect(() => verifyReleaseArtifact(artifact, { compareCurrentSource: true })).toThrow(message);
      // a development-only manifest is refused earlier under --release, but never accepted
      expect(() => verifyReleaseArtifact(artifact, { requireRelease: true, compareCurrentSource: true })).toThrow();
    });

    it('fails verification when a recorded package list was edited without its integrity hash, or the scheduler no longer matches it', () => {
      const { artifact } = schedulerBuild();
      rewriteManifest(artifact, (manifest) => { manifest.compiledDependencyPackages.find((entry) => entry.name === 'ts-fsrs')!.version = '0.0.1'; }, false);
      expect(() => verifyReleaseArtifact(artifact)).toThrow(/Compiled dependency package manifest integrity/);
      const second = schedulerBuild().artifact;
      rewriteManifest(second, (manifest) => { manifest.scheduler!.version = '0.0.1'; });
      expect(() => verifyReleaseArtifact(second)).toThrow(/Scheduler record does not match/);
    });

    it('fails verification when the algorithm recorded for ts-fsrs differs from the installed library', () => {
      const { artifact } = schedulerBuild();
      rewriteManifest(artifact, (manifest) => { manifest.scheduler!.algorithm = 'FSRS-0.1'; });
      expect(() => verifyReleaseArtifact(artifact, { compareCurrentSource: true })).toThrow(/Installed scheduler \(ts-fsrs .*FSRS-.*\) differs from the scheduler recorded/);
    });

    it('prints the scheduler library and version in the verify command summary', () => {
      const { artifact } = schedulerBuild();
      const output = execFileSync(process.execPath, [path.resolve('scripts/goreview-release.mjs'), 'verify', artifact], { encoding: 'utf8' });
      expect(output).toContain(`scheduler: ts-fsrs ${installedTsFsrs.version} (FSRS-`);
      expect(output).toMatch(/bundled dependency packages checked/);
    });
  });
});
