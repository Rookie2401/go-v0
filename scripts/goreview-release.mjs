import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
export const MANIFEST_NAME = 'goreview-release-manifest.json';
export const REQUIRED_CAPABILITIES = Object.freeze([
  'packages/goreview/src/scheduler/deck.ts',
  'packages/goreview/src/scheduler/replay-profile.ts',
  'packages/goreview/src/scheduler/review-convergence.ts',
  'packages/goreview/src/planner/eligibility.ts',
  'packages/goreview/src/planner/budget.ts',
  'packages/goreview/src/planner/remediation.ts',
  'packages/goreview/src/planner/learning-policy.ts',
  'packages/goreview/src/planner/admission-policy.ts',
  'packages/goreview/src/planner/microdeck.ts',
  'packages/repository-contract/src/review-evidence.ts',
]);
const SOURCE_ROOTS = [
  'packages/goreview/src', 'packages/goreview/app', 'packages/repository-contract/src',
  'packages/repository-engine/src', 'packages/repository-service/src', 'packages/repository-store/src',
  'packages/repository-sync/src', 'packages/golisten/src', 'packages/gotell/src', 'packages/shared-brand', 'packages/shared-fonts',
  'packages/biblia/src', 'packages/biblia/public',
];
// Single files hashed into the manifest beside SOURCE_ROOTS. Grouped by area and sorted within each group; a path that does not exist is skipped.
const BUILD_INPUTS = [
  // repository root: dependencies, compiler, notices
  'package-lock.json', 'package.json', 'pnpm-lock.yaml', 'THIRD-PARTY-NOTICES.md', 'tsconfig.json', 'yarn.lock',
  // the web builds and this release tooling
  'packages/biblia/index.html', 'packages/biblia/vite.config.ts', 'packages/goreview/app/vite.config.ts',
  'scripts/goreview-release.d.mts', 'scripts/goreview-release.mjs', 'scripts/vite.config.ts',
  // native shells: package manifests
  'packages/biblia-ios/package-lock.json', 'packages/biblia-ios/package.json',
  'packages/goreview-ios/package-lock.json', 'packages/goreview-ios/package.json',
  // GoReview iOS shell: native workflow configuration (changing any of these changes the manifest)
  'packages/goreview-ios/app.json', 'packages/goreview-ios/capacitor.config.ts', 'packages/goreview-ios/eas.json',
  // GoReview iOS shell: release and build scripts
  'packages/goreview-ios/scripts/archive-testflight.sh', 'packages/goreview-ios/scripts/build-eas-project.mjs',
  'packages/goreview-ios/scripts/native-payload.d.mts', 'packages/goreview-ios/scripts/native-payload.mjs',
  'packages/goreview-ios/scripts/prepare-eas-ios-project.mjs', 'packages/goreview-ios/scripts/prepare-web.mjs',
  'packages/goreview-ios/scripts/release-preflight.mjs', 'packages/goreview-ios/scripts/set-build-version.mjs',
  'packages/goreview-ios/scripts/validate-app-icon.mjs', 'packages/goreview-ios/scripts/validate-eas-config.mjs',
  'packages/goreview-ios/scripts/validate-staged-release.mjs', 'packages/goreview-ios/scripts/verify-native-payload.mjs',
  // GoReview iOS shell: native project and assets
  'packages/goreview-ios/assets/icon.png', 'packages/goreview-ios/ios/App/App.xcodeproj/project.pbxproj',
  'packages/goreview-ios/ios/App/App/AppDelegate.swift', 'packages/goreview-ios/ios/App/App/GoReviewNativePlugin.swift',
  'packages/goreview-ios/ios/App/App/GoReviewViewController.swift', 'packages/goreview-ios/ios/App/App/Info.plist',
  'packages/goreview-ios/ios/App/App/PrivacyInfo.xcprivacy', 'packages/goreview-ios/ios/App/App/SceneDelegate.swift',
];
// Whole directories of native-workflow inputs, every file below them hashed: the EAS build workflow (.eas/build/*.yml) and the staged EAS project template.
const BUILD_INPUT_DIRECTORIES = [
  'packages/goreview-ios/.eas/build', 'packages/goreview-ios/templates/eas-project',
];

// The repository's own generated output. It is only ever tested against the part of a path that lies in the repository (see repositoryPart):
// a package installed under node_modules legitimately ships its compiled files in dist/, dist-*/, web/ or build/ folders, and those are real dependencies.
const GENERATED_OUTPUT = /(^|\/)(?:dist(?:-[^/]*)?|web|\.review-build|\.eas-project|DerivedData|build)(\/|$)/i;
const REPOSITORY_OUTPUT = /(^|\/)(?:dist(?:-[^/]*)?|web|\.review-build|\.eas-project)(\/|$)/i;
const NODE_MODULES_SEGMENT = /(^|\/)node_modules\//;

/** Split a normalized repo-relative path at its first node_modules segment: { repository: the part before it, installed: whether there is one }. */
function repositoryPart(normalizedPath) {
  const match = NODE_MODULES_SEGMENT.exec(normalizedPath);
  return match ? { repository: normalizedPath.slice(0, match.index), installed: true } : { repository: normalizedPath, installed: false };
}

const toRepoRelative = (absolute, root) => {
  const relative = path.relative(root, absolute);
  if (relative === '..' || relative.startsWith(`..${path.sep}`) || path.isAbsolute(relative)) return undefined;
  const normalizedPath = normalized(relative);
  const { repository, installed } = repositoryPart(normalizedPath);
  if (installed) return undefined; // dependencies are not repository files; normalizeCompiledModuleId reports them as dependencyPath
  if (GENERATED_OUTPUT.test(repository)) return undefined;
  return normalizedPath;
};

const isOutside = (relative) => relative === '..' || relative.startsWith(`..${path.sep}`) || path.isAbsolute(relative);

/** Path of an absolute module file relative to the project root, or undefined when it is outside the checkout. A node_modules folder that is a symlink or junction (a git worktree sharing another checkout's install) resolves outside the root; its files are still the checkout's dependencies, as node_modules/<rest>. */
function relativeToProject(absolute, projectRoot) {
  const relative = path.relative(projectRoot, absolute);
  if (!isOutside(relative)) return relative;
  try {
    const inside = path.relative(fs.realpathSync(path.join(projectRoot, 'node_modules')), absolute);
    if (inside && !isOutside(inside)) return path.join('node_modules', inside);
  } catch { /* no node_modules folder */ }
  return undefined;
}

/** Convert Vite/Rollup module ids to stable local paths; return dependency paths separately. */
export function normalizeCompiledModuleId(id, projectRoot = ROOT) {
  if (typeof id !== 'string' || !id || id.startsWith('\0') || id.startsWith('virtual:')) return undefined;
  let value = id;
  if (value.startsWith('file://')) {
    try { value = fileURLToPath(value); } catch { return undefined; }
  }
  // Vite appends query flags such as ?commonjs-proxy and ?v=...; those are not filenames.
  value = value.split(/[?#]/, 1)[0].replaceAll('/', path.sep);
  const absolute = path.resolve(projectRoot, value);
  const relative = relativeToProject(absolute, projectRoot);
  if (relative === undefined) return undefined;
  const normalizedPath = normalized(relative);
  // node_modules is decided first: only the repository part of a path can be build output, never the dist/ folder inside an installed package.
  const { repository, installed } = repositoryPart(normalizedPath);
  if (REPOSITORY_OUTPUT.test(repository)) return undefined;
  if (installed) return fs.existsSync(absolute) ? { dependencyPath: normalizedPath } : undefined;
  return fs.existsSync(absolute) ? { sourcePath: normalizedPath } : undefined;
}

export function assertBuildModeAllowed(mode, dirty) {
  if (mode !== 'release' && mode !== 'developer') throw new Error('GOREVIEW_RELEASE_MODE must be "release" or "developer"');
  if (mode === 'release' && dirty) throw new Error('GoReview release builds require a clean Git working tree; use GOREVIEW_RELEASE_MODE=developer only for a development build.');
}

const sha256 = (bytes) => crypto.createHash('sha256').update(bytes).digest('hex');
const json = (value) => JSON.stringify(value, null, 2) + '\n';
const git = (root, ...args) => execFileSync('git', args, { cwd: root, encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 }).trim();
const normalized = (p) => p.split(path.sep).join('/');

function sourceFiles(root, compiledSourceModules = [], staticInputs = []) {
  const files = [];
  const visit = (relative) => {
    const absolute = path.join(root, relative);
    if (!fs.existsSync(absolute)) return;
    for (const entry of fs.readdirSync(absolute, { withFileTypes: true }).sort((a, b) => a.name.localeCompare(b.name))) {
      if (entry.name === 'node_modules' || entry.name.startsWith('dist') || entry.name === 'web' || entry.name === '.eas-project' || entry.name === '.review-build') continue;
      const child = path.join(relative, entry.name);
      if (entry.isDirectory()) visit(child);
      else if (entry.isFile()) files.push(normalized(child));
    }
  };
  SOURCE_ROOTS.forEach(visit);
  BUILD_INPUT_DIRECTORIES.forEach(visit);
  for (const input of BUILD_INPUTS) if (fs.existsSync(path.join(root, input))) files.push(input);
  for (const input of [...compiledSourceModules, ...staticInputs]) if (fs.existsSync(path.join(root, input))) files.push(normalized(input));
  return [...new Set(files)].sort();
}

function sourceSnapshot(root, compiledSourceModules = [], staticInputs = []) {
  const paths = sourceFiles(root, compiledSourceModules, staticInputs);
  const files = paths.map((file) => ({ path: file, sha256: sha256(fs.readFileSync(path.join(root, file))) }));
  const missing = REQUIRED_CAPABILITIES.filter((file) => !files.some((entry) => entry.path === file));
  if (missing.length) throw new Error(`Required GoReview capability source missing: ${missing.join(', ')}`);
  return { files, sha256: sha256(json(files)) };
}

function walkFiles(root, directory) {
  const files = [];
  const visit = (relativePath) => {
    const absolute = path.join(root, relativePath);
    if (!fs.existsSync(absolute)) return;
    for (const entry of fs.readdirSync(absolute, { withFileTypes: true }).sort((a, b) => a.name.localeCompare(b.name))) {
      const child = path.join(relativePath, entry.name);
      if (entry.isDirectory()) visit(child);
      else if (entry.isFile()) files.push(normalized(child));
    }
  };
  visit(directory);
  return files;
}

/** Source fingerprint captured before local preflight commands run, including expected copied static inputs. */
export function captureReleaseSourceFingerprint(projectRoot = ROOT) {
  const languages = (process.env.GOREVIEW_DICT ?? 'sq,es,de,hi,th').split(',').map(value => value.trim()).filter(Boolean);
  const staticInputs = [
    ...languages.flatMap(language => walkFiles(projectRoot, `public/dict/${language}`).filter(file => path.basename(file) !== 'frequency.json')),
    ...walkFiles(projectRoot, 'public/lexicon'),
  ];
  return sourceSnapshot(projectRoot, [], staticInputs);
}

function dependencySnapshot(root, paths = []) {
  return [...new Set(paths)].sort().map((file) => {
    const absolute = path.join(root, file);
    if (!fs.existsSync(absolute)) throw new Error(`Compiled dependency file is missing: ${file}`);
    return { path: normalized(file), sha256: sha256(fs.readFileSync(absolute)) };
  });
}

/** The installed package a node_modules file belongs to: the nearest package.json at or above the file (inside its node_modules/<name> or node_modules/@scope/<name> folder) that has a version. */
function resolveInstalledPackage(root, file) {
  const parts = file.split('/');
  const at = parts.lastIndexOf('node_modules');
  const scoped = parts[at + 1]?.startsWith('@');
  const boundary = at + 1 + (scoped ? 2 : 1); // index of the first segment after the package folder
  if (at < 0 || parts.length <= boundary) throw new Error(`Compiled dependency file is not inside an installed package: ${file}`);
  for (let end = parts.length - 1; end >= boundary; end -= 1) {
    const directory = parts.slice(0, end).join('/');
    const manifestPath = path.join(root, directory, 'package.json');
    if (!fs.existsSync(manifestPath)) continue;
    let parsed;
    try { parsed = JSON.parse(fs.readFileSync(manifestPath, 'utf8')); } catch { throw new Error(`Bundled dependency package.json is not valid JSON: ${directory}/package.json`); }
    if (typeof parsed?.version === 'string' && parsed.version) {
      return { directory, name: typeof parsed.name === 'string' && parsed.name ? parsed.name : parts.slice(at + 1, boundary).join('/'), version: parsed.version };
    }
  }
  throw new Error(`Cannot resolve the package name and version of bundled dependency ${file}: no package.json with a version at or above it inside ${parts.slice(0, boundary).join('/')}`);
}

/** Per bundled package: name, exact installed version, and a sha256 over the set of its bundled files (the {path, sha256} entries, sorted). */
function packageFingerprints(root, dependencyFiles) {
  const groups = new Map();
  for (const entry of dependencyFiles) {
    const owner = resolveInstalledPackage(root, entry.path);
    const group = groups.get(owner.directory) ?? { ...owner, files: [] };
    group.files.push({ path: entry.path, sha256: entry.sha256 });
    groups.set(owner.directory, group);
  }
  return [...groups.values()].sort((a, b) => a.directory.localeCompare(b.directory)).map((group) => ({
    name: group.name,
    version: group.version,
    path: group.directory,
    fileCount: group.files.length,
    sha256: sha256(json(group.files.sort((a, b) => a.path.localeCompare(b.path)))),
  }));
}

const SCHEDULER_LIBRARY = 'ts-fsrs';
const SCHEDULER_SOURCE = 'packages/goreview/src/scheduler/fsrs.ts';

/** The algorithm the bundled library names in its exported FSRSVersion (`v5.4.2 using FSRS-6.0` gives FSRS-6.0); falls back to the package version when the file does not say. */
function schedulerAlgorithm(root, dependencyFiles, entry) {
  for (const file of dependencyFiles.filter((candidate) => candidate.path.startsWith(`${entry.path}/`))) {
    if (!/\.(?:mjs|cjs|js)$/.test(file.path)) continue;
    const match = /FSRSVersion\s*=\s*[`'"][^`'"]*?(FSRS-[0-9][0-9A-Za-z.]*)[^`'"]*[`'"]/.exec(fs.readFileSync(path.join(root, file.path), 'utf8'));
    if (match) return match[1];
  }
  return `${entry.name}@${entry.version}`;
}

/** The scheduler the app bundles: { library, version, algorithm, sha256 } from the ts-fsrs entry among the bundled packages, or null when it is not bundled. */
function schedulerEntry(root, dependencyFiles, packages) {
  const entry = packages.filter((candidate) => candidate.name === SCHEDULER_LIBRARY).sort((a, b) => a.path.length - b.path.length)[0];
  if (!entry) return null;
  return { library: SCHEDULER_LIBRARY, version: entry.version, algorithm: schedulerAlgorithm(root, dependencyFiles, entry), sha256: entry.sha256 };
}

function staticSourceInputs(artifactList) {
  const inputs = [];
  for (const { path: file } of artifactList) {
    const dict = file.match(/^dict\/([^/]+)\/(.+)$/);
    if (dict && dict[2] !== 'frequency.json') inputs.push(`public/dict/${dict[1]}/${dict[2]}`);
    const font = file.match(/^assets\/fonts\/([^/]+)$/);
    if (font) inputs.push(`packages/shared-fonts/${font[1]}`);
    if (file === 'EB-Garamond-OFL.txt') inputs.push('packages/shared-fonts/EB-Garamond-OFL.txt');
    if (file === 'THIRD-PARTY-NOTICES.md') inputs.push('THIRD-PARTY-NOTICES.md');
    const bibleData = file.match(/^biblia\/(data|lexicon)\/(.+)$/);
    if (bibleData?.[1] === 'data') inputs.push(`packages/biblia/public/data/${bibleData[2]}`);
    if (bibleData?.[1] === 'lexicon') inputs.push(`public/lexicon/${bibleData[2]}`);
  }
  return [...new Set(inputs)].sort();
}

function artifactFiles(outDir) {
  const files = [];
  const visit = (dir) => {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true }).sort((a, b) => a.name.localeCompare(b.name))) {
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) visit(full);
      else if (entry.isFile() && entry.name !== MANIFEST_NAME) files.push(normalized(path.relative(outDir, full)));
    }
  };
  visit(outDir);
  return files.sort().map((file) => ({ path: file, sha256: sha256(fs.readFileSync(path.join(outDir, file))) }));
}

export function createReleaseManifest(outDir, mode = process.env.GOREVIEW_RELEASE_MODE ?? 'release', compiledModules = [], projectRoot = ROOT, compiledDependencies = []) {
  const status = git(projectRoot, 'status', '--porcelain', '--untracked-files=all');
  const dirty = status.length > 0;
  assertBuildModeAllowed(mode, dirty);
  const compiled = [...new Set(compiledModules.map((id) => typeof id === 'string' ? normalizeCompiledModuleId(id, projectRoot)?.sourcePath : undefined).filter(Boolean))].sort();
  const dependencies = dependencySnapshot(projectRoot, compiledDependencies.map((id) => typeof id === 'string' ? normalizeCompiledModuleId(id, projectRoot)?.dependencyPath : undefined).filter(Boolean));
  const dependencyPackages = packageFingerprints(projectRoot, dependencies);
  const scheduler = schedulerEntry(projectRoot, dependencies, dependencyPackages);
  const artifacts = artifactFiles(outDir);
  const staticInputs = staticSourceInputs(artifacts);
  const source = sourceSnapshot(projectRoot, compiled, staticInputs);
  const missingCompiled = REQUIRED_CAPABILITIES.filter((file) => !compiled.includes(file));
  if (missingCompiled.length) throw new Error(`Required GoReview capability was not compiled into the web artifact: ${missingCompiled.join(', ')}`);
  if (compiled.includes(SCHEDULER_SOURCE) && !scheduler) throw new Error(`The scheduler adapter was compiled into the web artifact but no bundled ${SCHEDULER_LIBRARY} package was recorded.`);
  const manifest = {
    schemaVersion: 1,
    product: 'GoReview',
    artifactKind: 'embedded-web',
    releaseEligible: mode === 'release' && !dirty,
    buildMode: mode,
    git: { commit: git(projectRoot, 'rev-parse', 'HEAD'), tree: git(projectRoot, 'rev-parse', 'HEAD^{tree}'), dirty },
    sourceManifestSha256: source.sha256,
    sourceFiles: source.files,
    staticSourceInputs: staticInputs,
    requiredCapabilities: [...REQUIRED_CAPABILITIES],
    compiledSourceModules: compiled,
    compiledDependencyFiles: dependencies,
    compiledDependencyManifestSha256: sha256(json(dependencies)),
    compiledDependencyPackages: dependencyPackages,
    compiledDependencyPackagesSha256: sha256(json(dependencyPackages)),
    scheduler,
    artifactManifestSha256: sha256(json(artifacts)),
    artifactFiles: artifacts,
  };
  fs.writeFileSync(path.join(outDir, MANIFEST_NAME), json(manifest));
  return manifest;
}

/**
 * Release verification: the commit and tree recorded in the manifest must be the HEAD commit and tree of the repository that holds the
 * artifact source. An artifact built at one commit is refused once HEAD has moved, even by an empty commit. The only way around that is
 * the explicit expectCommit option (CLI: --expect-commit <sha>): the manifest must then record that named commit and HEAD is not consulted.
 */
function assertArtifactMatchesCheckout(manifest, projectRoot, expectCommit) {
  const recorded = manifest.git?.commit;
  if (typeof recorded !== 'string' || !/^[0-9a-f]{40}$/.test(recorded)) throw new Error('Release verification refused: the manifest does not record a Git commit.');
  if (expectCommit !== undefined) {
    if (typeof expectCommit !== 'string' || !/^[0-9a-f]{7,40}$/i.test(expectCommit)) throw new Error(`Release verification refused: --expect-commit needs a commit sha of 7 to 40 hex digits, got "${expectCommit}".`);
    if (!recorded.startsWith(expectCommit.toLowerCase())) throw new Error(`Release verification refused: the artifact was built from ${recorded}, not from the expected commit ${expectCommit}.`);
    return;
  }
  let head;
  let headTree;
  try {
    head = git(projectRoot, 'rev-parse', 'HEAD');
    headTree = git(projectRoot, 'rev-parse', 'HEAD^{tree}');
  } catch {
    throw new Error(`Release verification refused: cannot read the Git HEAD of ${projectRoot}. Verify from the checkout the artifact was built in, or name the build commit with --expect-commit <sha>.`);
  }
  if (recorded !== head) throw new Error(`Release verification refused: the artifact was built from commit ${recorded} but the checkout is at ${head}. Check out ${recorded} and verify again, or name the build commit explicitly with --expect-commit <sha>.`);
  if (manifest.git.tree !== headTree) throw new Error(`Release verification refused: the artifact records tree ${manifest.git.tree} but HEAD's tree is ${headTree}.`);
}

/** The recorded package whose folder most deeply contains the file (a package nested inside another owns its own files). */
function owningPackage(packages, file) {
  let owner;
  for (const entry of packages) if (file.startsWith(`${entry.path}/`) && (!owner || entry.path.length > owner.path.length)) owner = entry;
  return owner;
}

/** The recorded package fingerprints must agree with the recorded dependency files, and a build that compiled the scheduler adapter must name its scheduler library. Needs no checkout. */
function assertDependencyPackagesConsistent(manifest) {
  const files = manifest.compiledDependencyFiles ?? [];
  const packages = manifest.compiledDependencyPackages;
  if (!Array.isArray(packages) || !Array.isArray(files)) throw new Error('Compiled dependency package manifest is missing: the artifact predates per-package dependency fingerprints; rebuild it.');
  if (manifest.compiledDependencyPackagesSha256 !== sha256(json(packages))) throw new Error('Compiled dependency package manifest integrity check failed.');
  const covered = new Set();
  for (const entry of packages) {
    if (typeof entry?.name !== 'string' || typeof entry.version !== 'string' || typeof entry.path !== 'string') throw new Error('Compiled dependency package manifest integrity check failed.');
    const owned = files.filter((file) => owningPackage(packages, file.path) === entry).map((file) => ({ path: file.path, sha256: file.sha256 })).sort((a, b) => a.path.localeCompare(b.path));
    owned.forEach((file) => covered.add(file.path));
    if (entry.fileCount !== owned.length || entry.sha256 !== sha256(json(owned))) throw new Error(`Compiled dependency package manifest integrity check failed for ${entry.name}@${entry.version}.`);
  }
  if (covered.size !== files.length) throw new Error('Compiled dependency package manifest integrity check failed: a bundled dependency file belongs to no recorded package.');
  const scheduler = manifest.scheduler;
  if (scheduler !== null && scheduler !== undefined) {
    const entry = packages.find((candidate) => candidate.name === scheduler.library && candidate.version === scheduler.version && candidate.sha256 === scheduler.sha256);
    if (scheduler.library !== SCHEDULER_LIBRARY || !entry || typeof scheduler.algorithm !== 'string' || !scheduler.algorithm) throw new Error('Scheduler record does not match the recorded dependency packages.');
  } else if (manifest.compiledSourceModules?.includes(SCHEDULER_SOURCE)) {
    throw new Error(`The scheduler adapter was compiled into the artifact but the manifest records no ${SCHEDULER_LIBRARY} scheduler.`);
  }
}

const describeScheduler = (scheduler) => scheduler ? `${scheduler.library} ${scheduler.version}, ${scheduler.algorithm}` : 'none';

/** Compare the recorded dependency packages and scheduler with what node_modules of this checkout holds now; a different installed version is refused by name. */
function assertInstalledPackagesMatch(manifest, projectRoot) {
  for (const entry of manifest.compiledDependencyPackages) {
    const installed = installedVersion(projectRoot, entry.path);
    if (installed === undefined) throw new Error(`Bundled dependency ${entry.name}@${entry.version} is not installed in this checkout (${entry.path}).`);
    if (installed !== entry.version) throw new Error(`Installed bundled dependency ${entry.name} is ${installed} but the artifact was built with ${entry.version}.`);
  }
  const current = packageFingerprints(projectRoot, dependencySnapshot(projectRoot, manifest.compiledDependencyFiles.map((file) => file.path)));
  if (json(current) !== json(manifest.compiledDependencyPackages)) throw new Error('Installed bundled dependency packages differ from those recorded in the artifact.');
  const scheduler = schedulerEntry(projectRoot, manifest.compiledDependencyFiles, current);
  if (json(scheduler) !== json(manifest.scheduler ?? null)) throw new Error(`Installed scheduler (${describeScheduler(scheduler)}) differs from the scheduler recorded in the artifact (${describeScheduler(manifest.scheduler)}).`);
}

function installedVersion(root, directory) {
  try {
    const parsed = JSON.parse(fs.readFileSync(path.join(root, directory, 'package.json'), 'utf8'));
    return typeof parsed?.version === 'string' ? parsed.version : undefined;
  } catch { return undefined; }
}

export function verifyReleaseArtifact(outDir, options = {}) {
  const manifestPath = path.join(outDir, MANIFEST_NAME);
  const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
  if (manifest.schemaVersion !== 1 || manifest.product !== 'GoReview' || manifest.artifactKind !== 'embedded-web') throw new Error('Unsupported GoReview artifact manifest.');
  if (manifest.releaseEligible && (manifest.buildMode !== 'release' || manifest.git.dirty)) throw new Error('Release eligibility contradicts recorded source state.');
  if (options.requireRelease && !manifest.releaseEligible) throw new Error('Artifact is development-only and is not release-eligible.');
  if (options.requireRelease) assertArtifactMatchesCheckout(manifest, options.projectRoot ?? ROOT, options.expectCommit);
  const actualArtifacts = artifactFiles(outDir);
  if (manifest.artifactManifestSha256 !== sha256(json(manifest.artifactFiles)) || json(actualArtifacts) !== json(manifest.artifactFiles)) throw new Error('Built artifact integrity check failed.');
  if (manifest.sourceManifestSha256 !== sha256(json(manifest.sourceFiles))) throw new Error('Source manifest integrity check failed.');
  if (manifest.compiledDependencyManifestSha256 !== sha256(json(manifest.compiledDependencyFiles ?? []))) throw new Error('Compiled dependency manifest integrity check failed.');
  assertDependencyPackagesConsistent(manifest);
  const sourceMap = new Map(manifest.sourceFiles.map((entry) => [entry.path, entry.sha256]));
  for (const capability of REQUIRED_CAPABILITIES) {
    if (!manifest.requiredCapabilities.includes(capability) || !sourceMap.has(capability)) throw new Error(`Required GoReview capability is absent from the source manifest: ${capability}`);
    if (!manifest.compiledSourceModules?.includes(capability)) throw new Error(`Required GoReview capability was not recorded as compiled into the artifact: ${capability}`);
  }
  if (options.compareCurrentSource) {
    const current = sourceSnapshot(options.projectRoot ?? ROOT, manifest.compiledSourceModules ?? [], manifest.staticSourceInputs ?? []);
    if (json(current.files) !== json(manifest.sourceFiles)) throw new Error('Current GoReview source differs from the source recorded in the artifact.');
    assertInstalledPackagesMatch(manifest, options.projectRoot ?? ROOT);
    const currentDependencies = dependencySnapshot(options.projectRoot ?? ROOT, (manifest.compiledDependencyFiles ?? []).map((file) => file.path));
    if (json(currentDependencies) !== json(manifest.compiledDependencyFiles ?? [])) throw new Error('Installed bundled dependencies differ from those recorded in the artifact.');
  }
  return manifest;
}

const USAGE = 'Usage: node scripts/goreview-release.mjs verify <artifact-directory> [--release [--expect-commit <sha>]]';

/** Parse `verify <dir> [--release] [--expect-commit <sha>]`; anything else throws the usage text. --expect-commit needs --release. */
export function parseVerifyArgs(args) {
  const [command, target, ...rest] = args;
  if (command !== 'verify' || !target || target.startsWith('--')) throw new Error(USAGE);
  let requireRelease = false;
  let expectCommit;
  for (let i = 0; i < rest.length; i += 1) {
    const arg = rest[i];
    if (arg === '--release') requireRelease = true;
    else if (arg === '--expect-commit') {
      expectCommit = rest[i + 1];
      if (!expectCommit || expectCommit.startsWith('--')) throw new Error(`--expect-commit needs a commit sha. ${USAGE}`);
      i += 1;
    } else if (arg.startsWith('--expect-commit=')) expectCommit = arg.slice('--expect-commit='.length);
    else throw new Error(`Unknown argument ${arg}. ${USAGE}`);
  }
  if (expectCommit !== undefined && !requireRelease) throw new Error(`--expect-commit applies to release verification only; add --release. ${USAGE}`);
  return { target, requireRelease, expectCommit };
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const { target, requireRelease, expectCommit } = parseVerifyArgs(process.argv.slice(2));
  const manifest = verifyReleaseArtifact(path.resolve(ROOT, target), { requireRelease, expectCommit, compareCurrentSource: true });
  const scheduler = manifest.scheduler ? `${manifest.scheduler.library} ${manifest.scheduler.version} (${manifest.scheduler.algorithm})` : 'none bundled';
  console.log(`Verified ${manifest.buildMode} GoReview artifact from ${manifest.git.commit}; ${manifest.artifactFiles.length} files checked; ${manifest.compiledDependencyPackages.length} bundled dependency packages checked; scheduler: ${scheduler}.`);
}
