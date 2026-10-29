import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';

export const NATIVE_PAYLOAD_MANIFEST = 'goreview-native-payload-manifest.json';
export const PARENT_SOURCE_MANIFEST = 'goreview-release-manifest.json';
const sha256 = (bytes) => crypto.createHash('sha256').update(bytes).digest('hex');
const json = (value) => JSON.stringify(value, null, 2) + '\n';
const relative = (value) => value.split(path.sep).join('/');

/** CLI flags, never inherited environment defaults, choose the native preparation mode. */
export function resolveNativeBuildMode(args) {
  if (args.some((arg) => !['--release', '--developer'].includes(arg)) || (args.includes('--release') && args.includes('--developer'))) {
    throw new Error('Choose exactly one native preparation mode: --developer or --release.');
  }
  return args.includes('--release') ? 'release' : 'developer';
}

/** Apply the deterministic native-only config and PWA transforms after the parent web build is verified. */
export function transformNativeWebPayload(payloadDir, options = {}) {
  const configPath = path.join(payloadDir, 'config.json');
  const config = JSON.parse(fs.readFileSync(configPath, 'utf8'));
  if (options.serviceUrl) config.serviceUrl = options.serviceUrl;
  config.bibliaUrl = options.bibliaUrl ?? './biblia/index.html';
  fs.writeFileSync(configPath, json(config));

  const htmlPath = path.join(payloadDir, 'index.html');
  let html = fs.readFileSync(htmlPath, 'utf8');
  html = html.replace(/<script>\s*[\s\S]*?serviceWorker\.register\(['"]\.\/sw\.js['"]\)[\s\S]*?<\/script>\s*/i, '');
  html = html.replace(/<link\s+rel="manifest"[^>]*>\s*/i, '');
  html = html.replace(/<meta\s+name="(?:apple-mobile-web-app-capable|mobile-web-app-capable|apple-mobile-web-app-status-bar-style|apple-mobile-web-app-title)"[^>]*>\s*/gi, '');
  html = html.replace(/<link\s+rel="apple-touch-icon"[^>]*>\s*/gi, '');
  fs.writeFileSync(htmlPath, html);
  fs.rmSync(path.join(payloadDir, 'sw.js'), { force: true });
  fs.rmSync(path.join(payloadDir, 'manifest.webmanifest'), { force: true });
  return [
    'Build and add the Biblia page and its static text/index payload.',
    'Set the bundled Repository URL for the selected build mode and add the Biblia home link.',
    'Remove browser PWA registration, manifest, worker, and browser-only metadata.',
  ];
}

function payloadFiles(root) {
  const files = [];
  const visit = (directory) => {
    for (const entry of fs.readdirSync(directory, { withFileTypes: true }).sort((a, b) => a.name.localeCompare(b.name))) {
      const full = path.join(directory, entry.name);
      if (entry.isSymbolicLink()) throw new Error(`Refusing a symlink in the native web payload: ${relative(path.relative(root, full))}`);
      if (entry.isDirectory()) visit(full);
      else if (entry.isFile() && entry.name !== NATIVE_PAYLOAD_MANIFEST) files.push(relative(path.relative(root, full)));
    }
  };
  visit(root);
  return files.sort().map((file) => ({ path: file, sha256: sha256(fs.readFileSync(path.join(root, file))) }));
}

function parentProof(root, manifestName = PARENT_SOURCE_MANIFEST) {
  const manifestPath = path.join(root, manifestName);
  const bytes = fs.readFileSync(manifestPath);
  const manifest = JSON.parse(bytes.toString('utf8'));
  if (manifest.schemaVersion !== 1 || manifest.product !== 'GoReview' || manifest.artifactKind !== 'embedded-web') {
    throw new Error('The native payload needs a supported GoReview source build manifest.');
  }
  if (sha256(json(manifest.sourceFiles)) !== manifest.sourceManifestSha256) throw new Error('The parent source manifest hash is invalid.');
  if (sha256(json(manifest.artifactFiles)) !== manifest.artifactManifestSha256) throw new Error('The parent artifact manifest hash is invalid.');
  if (manifest.compiledDependencyManifestSha256 && sha256(json(manifest.compiledDependencyFiles ?? [])) !== manifest.compiledDependencyManifestSha256) {
    throw new Error('The parent compiled-dependency manifest hash is invalid.');
  }
  return {
    manifestPath: relative(manifestName),
    manifestFileSha256: sha256(bytes),
    sourceManifestSha256: manifest.sourceManifestSha256,
    artifactManifestSha256: manifest.artifactManifestSha256,
    git: manifest.git,
    requiredCapabilities: manifest.requiredCapabilities,
    compiledSourceModules: manifest.compiledSourceModules,
    compiledDependencyFiles: manifest.compiledDependencyFiles ?? [],
    ...(manifest.compiledDependencyManifestSha256 ? { compiledDependencyManifestSha256: manifest.compiledDependencyManifestSha256 } : {}),
    releaseEligible: manifest.releaseEligible === true,
    buildMode: manifest.buildMode,
  };
}

/** Link the verified GoReview web build to its final transformed native payload. */
export function createNativePayloadManifest(payloadDir, options = {}) {
  const mode = options.mode;
  if (mode !== 'release' && mode !== 'developer') throw new Error('Native payload mode must be release or developer.');
  const parentBuild = parentProof(payloadDir, options.parentManifestName ?? PARENT_SOURCE_MANIFEST);
  if (mode === 'release' && (!parentBuild.releaseEligible || parentBuild.buildMode !== 'release' || parentBuild.git?.dirty)) {
    throw new Error('A release native payload requires a clean, release-eligible GoReview parent build.');
  }
  const files = payloadFiles(payloadDir);
  const manifest = {
    schemaVersion: 1,
    product: 'GoReview',
    artifactKind: 'native-embedded-web-payload',
    buildMode: mode,
    releaseEligible: mode === 'release' && parentBuild.releaseEligible,
    parentBuild,
    transformations: options.transformations ?? [],
    payloadManifestSha256: sha256(json(files)),
    payloadFiles: files,
  };
  fs.writeFileSync(path.join(payloadDir, NATIVE_PAYLOAD_MANIFEST), json(manifest));
  return manifest;
}

export function verifyNativePayloadManifest(payloadDir, options = {}) {
  const manifestPath = path.join(payloadDir, NATIVE_PAYLOAD_MANIFEST);
  const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
  if (manifest.schemaVersion !== 1 || manifest.product !== 'GoReview' || manifest.artifactKind !== 'native-embedded-web-payload') {
    throw new Error('Unsupported native GoReview payload manifest.');
  }
  if (manifest.releaseEligible && (manifest.buildMode !== 'release' || !manifest.parentBuild?.releaseEligible || manifest.parentBuild?.git?.dirty)) {
    throw new Error('Native payload release eligibility contradicts the parent source state.');
  }
  if (options.requireRelease && !manifest.releaseEligible) throw new Error('Native payload is development-only and is not release-eligible.');
  const actualParent = parentProof(payloadDir, manifest.parentBuild?.manifestPath ?? PARENT_SOURCE_MANIFEST);
  if (json(actualParent) !== json(manifest.parentBuild)) throw new Error('Native payload no longer matches its linked GoReview source build.');
  const actualFiles = payloadFiles(payloadDir);
  if (manifest.payloadManifestSha256 !== sha256(json(manifest.payloadFiles)) || json(actualFiles) !== json(manifest.payloadFiles)) {
    throw new Error('Native web payload integrity check failed.');
  }
  return manifest;
}
