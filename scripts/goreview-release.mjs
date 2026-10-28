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
  'packages/goreview/src', 'packages/gopractice', 'packages/repository-contract/src',
  'packages/repository-engine/src', 'packages/repository-service/src', 'packages/repository-store/src',
  'packages/repository-sync/src', 'packages/golisten/src', 'packages/gotell/src', 'packages/shared-brand', 'packages/shared-fonts',
  'packages/biblia/src', 'packages/biblia/public', 'packages/gopractice/public',
];
const BUILD_INPUTS = [
  'package.json', 'package-lock.json', 'pnpm-lock.yaml', 'yarn.lock', 'tsconfig.json', 'scripts/vite.config.ts',
  'scripts/goreview-release.mjs', 'scripts/goreview-release.d.mts', 'THIRD-PARTY-NOTICES.md',
  'packages/gopractice/vite.config.ts', 'packages/biblia/vite.config.ts', 'packages/biblia/index.html',
  'packages/goreview-ios/package.json', 'packages/goreview-ios/scripts/prepare-web.mjs', 'packages/goreview-ios/scripts/native-payload.mjs',
  'packages/goreview-ios/scripts/native-payload.d.mts', 'packages/goreview-ios/scripts/verify-native-payload.mjs',
  'packages/goreview-ios/scripts/release-preflight.mjs', 'packages/goreview-ios/scripts/build-eas-project.mjs', 'packages/goreview-ios/scripts/validate-staged-release.mjs',
  'packages/goreview-ios/ios/App/App.xcodeproj/project.pbxproj', 'packages/goreview-ios/ios/App/App/AppDelegate.swift',
  'packages/goreview-ios/ios/App/App/GoReviewNativePlugin.swift', 'packages/goreview-ios/ios/App/App/GoReviewViewController.swift',
  'packages/goreview-ios/ios/App/App/SceneDelegate.swift', 'packages/goreview-ios/ios/App/App/Info.plist',
  'packages/goreview-ios/ios/App/App/PrivacyInfo.xcprivacy', 'packages/goreview-ios/assets/icon.png',
];

const toRepoRelative = (absolute, root) => {
  const relative = path.relative(root, absolute);
  if (relative === '..' || relative.startsWith(`..${path.sep}`) || path.isAbsolute(relative)) return undefined;
  const normalizedPath = normalized(relative);
  if (/(^|\/)(?:node_modules|dist(?:-[^/]*)?|web|\.review-build|\.eas-project|DerivedData|build)(\/|$)/i.test(normalizedPath)) return undefined;
  return normalizedPath;
};

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
  const relative = path.relative(projectRoot, absolute);
  if (relative === '..' || relative.startsWith(`..${path.sep}`) || path.isAbsolute(relative)) return undefined;
  const normalizedPath = normalized(relative);
  if (/(^|\/)(?:dist(?:-[^/]*)?|web|\.review-build|\.eas-project)(\/|$)/i.test(normalizedPath)) return undefined;
  if (normalizedPath.startsWith('node_modules/')) return fs.existsSync(absolute) ? { dependencyPath: normalizedPath } : undefined;
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
  const languages = (process.env.GOPRACTICE_DICT ?? 'sq,es,de,hi,th').split(',').map(value => value.trim()).filter(Boolean);
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
  const artifacts = artifactFiles(outDir);
  const staticInputs = staticSourceInputs(artifacts);
  const source = sourceSnapshot(projectRoot, compiled, staticInputs);
  const missingCompiled = REQUIRED_CAPABILITIES.filter((file) => !compiled.includes(file));
  if (missingCompiled.length) throw new Error(`Required GoReview capability was not compiled into the web artifact: ${missingCompiled.join(', ')}`);
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
    artifactManifestSha256: sha256(json(artifacts)),
    artifactFiles: artifacts,
  };
  fs.writeFileSync(path.join(outDir, MANIFEST_NAME), json(manifest));
  return manifest;
}

export function verifyReleaseArtifact(outDir, options = {}) {
  const manifestPath = path.join(outDir, MANIFEST_NAME);
  const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
  if (manifest.schemaVersion !== 1 || manifest.product !== 'GoReview' || manifest.artifactKind !== 'embedded-web') throw new Error('Unsupported GoReview artifact manifest.');
  if (manifest.releaseEligible && (manifest.buildMode !== 'release' || manifest.git.dirty)) throw new Error('Release eligibility contradicts recorded source state.');
  if (options.requireRelease && !manifest.releaseEligible) throw new Error('Artifact is development-only and is not release-eligible.');
  const actualArtifacts = artifactFiles(outDir);
  if (manifest.artifactManifestSha256 !== sha256(json(manifest.artifactFiles)) || json(actualArtifacts) !== json(manifest.artifactFiles)) throw new Error('Built artifact integrity check failed.');
  if (manifest.sourceManifestSha256 !== sha256(json(manifest.sourceFiles))) throw new Error('Source manifest integrity check failed.');
  if (manifest.compiledDependencyManifestSha256 !== sha256(json(manifest.compiledDependencyFiles ?? []))) throw new Error('Compiled dependency manifest integrity check failed.');
  const sourceMap = new Map(manifest.sourceFiles.map((entry) => [entry.path, entry.sha256]));
  for (const capability of REQUIRED_CAPABILITIES) {
    if (!manifest.requiredCapabilities.includes(capability) || !sourceMap.has(capability)) throw new Error(`Required GoReview capability is absent from the source manifest: ${capability}`);
    if (!manifest.compiledSourceModules?.includes(capability)) throw new Error(`Required GoReview capability was not recorded as compiled into the artifact: ${capability}`);
  }
  if (options.compareCurrentSource) {
    const current = sourceSnapshot(options.projectRoot ?? ROOT, manifest.compiledSourceModules ?? [], manifest.staticSourceInputs ?? []);
    if (json(current.files) !== json(manifest.sourceFiles)) throw new Error('Current GoReview source differs from the source recorded in the artifact.');
    const currentDependencies = dependencySnapshot(options.projectRoot ?? ROOT, (manifest.compiledDependencyFiles ?? []).map((file) => file.path));
    if (json(currentDependencies) !== json(manifest.compiledDependencyFiles ?? [])) throw new Error('Installed bundled dependencies differ from those recorded in the artifact.');
  }
  return manifest;
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const [command, target, flag] = process.argv.slice(2);
  if (command !== 'verify' || !target) throw new Error('Usage: node scripts/goreview-release.mjs verify <artifact-directory> [--release]');
  const manifest = verifyReleaseArtifact(path.resolve(ROOT, target), { requireRelease: flag === '--release', compareCurrentSource: true });
  console.log(`Verified ${manifest.buildMode} GoReview artifact from ${manifest.git.commit}; ${manifest.artifactFiles.length} files checked.`);
}
