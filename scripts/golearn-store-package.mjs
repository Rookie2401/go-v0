#!/usr/bin/env node
/** Build, stage and zip the allowlisted GoLearn Chrome Web Store runtime. */
import crypto from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { deflateRawSync } from 'node:zlib';
import { fileURLToPath } from 'node:url';

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(scriptDir, '..');
const extensionRoot = path.join(repoRoot, 'packages', 'golearn-extension');
const distRoot = path.join(extensionRoot, 'dist');
const outputRoot = path.join(repoRoot, 'artifacts', 'golearn-store');
const manifestPath = path.join(extensionRoot, 'manifest.json');
const zipTime = 0;

const runtimeRootFiles = new Set(['manifest.json', 'content.js', 'background.js', 'THIRD-PARTY-NOTICES.md']);
const runtimeTrees = ['action', 'analysers', 'app', 'icons', 'lexicon', 'practice'];
const bannedNames = /(^|\/)(?:\.env(?:\..*)?|translation\.local\.json|store-build-marker\.json|content\.harness\.js|.*\.map|.*\.pem|.*\.key|.*credentials?.*|.*secret.*)$/i;
const secretJsonKey = /(?:api[-_]?key|access[-_]?token|refresh[-_]?token|client[-_]?secret|private[-_]?key|password|credential)/i;
const secretTextPatterns = [/(?:sk-proj-|sk-live-|sk-ant-)[A-Za-z0-9_-]{20,}/, /-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----/, /\bAKIA[0-9A-Z]{16}\b/];

function fail(message) { throw new Error(message); }
function sha256(bytes) { return crypto.createHash('sha256').update(bytes).digest('hex'); }
function jsonFile(file) {
  try { return JSON.parse(fs.readFileSync(file, 'utf8')); }
  catch { fail(`Invalid JSON: ${path.relative(repoRoot, file).replaceAll('\\', '/')}`); }
}
function inside(parent, child) {
  const relative = path.relative(parent, child);
  return relative === '' || (!relative.startsWith(`..${path.sep}`) && relative !== '..' && !path.isAbsolute(relative));
}

function walkTree(sourceRoot, relativeRoot, results) {
  const root = path.join(sourceRoot, relativeRoot);
  if (!fs.existsSync(root)) fail(`Required runtime folder is missing: ${relativeRoot}`);
  const visit = (absolute) => {
    const stat = fs.lstatSync(absolute);
    if (stat.isSymbolicLink()) fail(`Symlink is not allowed in release input: ${path.relative(sourceRoot, absolute).replaceAll('\\', '/')}`);
    if (stat.isDirectory()) {
      for (const name of fs.readdirSync(absolute).sort()) visit(path.join(absolute, name));
      return;
    }
    if (!stat.isFile()) fail(`Non-file runtime item is not allowed: ${path.relative(sourceRoot, absolute).replaceAll('\\', '/')}`);
    const relative = path.relative(sourceRoot, absolute).replaceAll('\\', '/');
    if (bannedNames.test(relative)) fail(`Blocked development, harness, map or credential file in release input: ${relative}`);
    results.push({ source: absolute, relative, size: stat.size });
  };
  visit(root);
}

/** Return a sorted allowlist; fail on unexpected root-level files and symlinks. */
export function collectRuntimeFiles(sourceRoot) {
  const root = path.resolve(sourceRoot);
  if (!fs.existsSync(root) || !fs.statSync(root).isDirectory()) fail(`Runtime build directory does not exist: ${root}`);
  const actualRoots = fs.readdirSync(root).sort();
  const allowedRoots = new Set([...runtimeRootFiles, ...runtimeTrees, 'store-build-marker.json']);
  for (const name of actualRoots) {
    if (!allowedRoots.has(name)) fail(`Unexpected build output is not packaged: ${name}`);
  }
  const results = [];
  for (const name of runtimeRootFiles) {
    const file = path.join(root, name);
    if (!fs.existsSync(file) || !fs.lstatSync(file).isFile()) fail(`Required runtime file is missing: ${name}`);
    results.push({ source: file, relative: name, size: fs.statSync(file).size });
  }
  for (const dir of runtimeTrees) walkTree(root, dir, results);
  return results.sort((a, b) => a.relative.localeCompare(b.relative, 'en'));
}

export function assertNoCredentials(files) {
  for (const item of files) {
    const ext = path.extname(item.relative).toLowerCase();
    // Inspect configuration and manifest fields, not lexical/dictionary JSON where a headword such as
    // "password" is ordinary authored data rather than an executable credential field.
    if (ext === '.json' && (/(?:^|\/)config\.json$/i.test(item.relative) || /(?:^|\/)manifest\.json$/i.test(item.relative))) {
      const inspect = (value) => {
        if (Array.isArray(value)) return value.forEach(inspect);
        if (!value || typeof value !== 'object') return;
        for (const [key, child] of Object.entries(value)) {
          if (secretJsonKey.test(key)) fail(`Credential-like JSON field in release input: ${item.relative}`);
          inspect(child);
        }
      };
      inspect(jsonFile(item.source));
    }
    if (['.js', '.json', '.html', '.css', '.txt'].includes(ext)) {
      const text = fs.readFileSync(item.source, 'utf8');
      if (secretTextPatterns.some((pattern) => pattern.test(text))) fail(`Credential-shaped value found in release input: ${item.relative}`);
      if (/<script\b[^>]*\bsrc\s*=\s*["']https?:\/\//i.test(text)) fail(`External executable script reference in release input: ${item.relative}`);
    }
  }
}

function checkManifest(sourceRoot, files) {
  const manifest = jsonFile(path.join(sourceRoot, 'manifest.json'));
  if (manifest.manifest_version !== 3) fail('Chrome Web Store packaging requires Manifest V3.');
  if (!manifest.name || !manifest.version || !manifest.description) fail('Manifest must set name, version and description.');
  if (manifest.description.length > 132) fail(`Manifest description is ${manifest.description.length} characters; Chrome allows at most 132.`);
  if (manifest.key || manifest.update_url || manifest.devtools_page || manifest.content_scripts?.some((s) => s.js?.some((f) => /harness|\.map$/i.test(f)))) fail('Development-only manifest field or script found.');
  const set = new Set(files.map((f) => f.relative));
  const refs = [manifest.background?.service_worker, manifest.options_page, manifest.action?.default_popup, ...(manifest.icons ? Object.values(manifest.icons) : [])].filter(Boolean);
  for (const ref of refs) if (!set.has(ref)) fail(`Manifest points to missing packaged file: ${ref}`);
  for (const resource of manifest.web_accessible_resources ?? []) {
    for (const pattern of resource.resources ?? []) {
      if (/\.map$|harness/i.test(pattern)) fail(`Development asset is web accessible: ${pattern}`);
    }
  }
  return manifest;
}

export function crc32(bytes) {
  let crc = 0xffffffff;
  for (const byte of bytes) {
    crc ^= byte;
    for (let j = 0; j < 8; j++) crc = (crc >>> 1) ^ (0xedb88320 & -(crc & 1));
  }
  return (crc ^ 0xffffffff) >>> 0;
}
function dosDateTime() { return { date: (1 << 5) | 1, time: 0 }; } // 1980-01-01 00:00:00
function u16(v) { const b = Buffer.allocUnsafe(2); b.writeUInt16LE(v); return b; }
function u32(v) { const b = Buffer.allocUnsafe(4); b.writeUInt32LE(v); return b; }

/** Minimal deterministic ZIP writer (UTF-8 names, deflate, fixed timestamp, no filesystem metadata). */
export function createZip(entries) {
  const local = [];
  const central = [];
  let offset = 0;
  const dt = dosDateTime();
  for (const entry of entries) {
    const name = Buffer.from(entry.name.replaceAll('\\', '/'), 'utf8');
    const raw = entry.bytes;
    const compressed = deflateRawSync(raw, { level: 9 });
    if (raw.length > 0xffffffff || compressed.length > 0xffffffff || offset > 0xffffffff) fail('ZIP64-sized content is not supported; reduce package size.');
    const crc = crc32(raw);
    const header = Buffer.concat([
      u32(0x04034b50), u16(20), u16(0x0800), u16(8), u16(dt.time), u16(dt.date), u32(crc), u32(compressed.length), u32(raw.length), u16(name.length), u16(0), name,
    ]);
    local.push(header, compressed);
    const cd = Buffer.concat([
      u32(0x02014b50), u16(0x031e), u16(20), u16(0x0800), u16(8), u16(dt.time), u16(dt.date), u32(crc), u32(compressed.length), u32(raw.length), u16(name.length), u16(0), u16(0), u16(0), u16(0), u32(0), u32(offset), name,
    ]);
    central.push(cd);
    offset += header.length + compressed.length;
  }
  const centralBytes = Buffer.concat(central);
  const count = entries.length;
  if (count > 0xffff || centralBytes.length > 0xffffffff) fail('ZIP64 entry counts are not supported; reduce package size.');
  const end = Buffer.concat([u32(0x06054b50), u16(0), u16(0), u16(count), u16(count), u32(centralBytes.length), u32(offset), u16(0)]);
  return Buffer.concat([...local, centralBytes, end]);
}

function stageAndArchive(sourceRoot, buildId) {
  const marker = jsonFile(path.join(sourceRoot, 'store-build-marker.json'));
  if (marker.buildId !== buildId) fail('Build marker does not match this release build; refusing stale output.');
  const files = collectRuntimeFiles(sourceRoot);
  assertNoCredentials(files);
  const manifest = checkManifest(sourceRoot, files);
  const listingFiles = files.map(({ source, relative, size }) => ({ path: relative, size, sha256: sha256(fs.readFileSync(source)) }));
  const listing = {
    format: 'golearn-chrome-store-package-v1',
    extension: { name: manifest.name, version: manifest.version, manifestVersion: manifest.manifest_version },
    files: listingFiles,
    uncompressedBytes: listingFiles.reduce((sum, item) => sum + item.size, 0),
  };
  const zipEntries = files.map((file) => ({ name: file.relative, bytes: fs.readFileSync(file.source) }));
  zipEntries.push({ name: 'STORE-PACKAGE-MANIFEST.json', bytes: Buffer.from(`${JSON.stringify(listing, null, 2)}\n`) });
  const archive = createZip(zipEntries);
  const archiveHash = sha256(archive);
  const destination = path.join(outputRoot, `${manifest.version}-${archiveHash.slice(0, 12)}`);
  fs.mkdirSync(outputRoot, { recursive: true });
  if (fs.existsSync(destination)) {
    const existing = fs.readFileSync(path.join(destination, 'golearn.zip'));
    if (sha256(existing) !== archiveHash) fail(`Output collision at ${destination}`);
    return { destination, archiveHash, listing, reused: true };
  }
  const temp = fs.mkdtempSync(path.join(outputRoot, '.stage-'));
  let published = false;
  try {
    for (const file of files) {
      const target = path.join(temp, ...file.relative.split('/'));
      fs.mkdirSync(path.dirname(target), { recursive: true });
      fs.copyFileSync(file.source, target, fs.constants.COPYFILE_EXCL);
    }
    fs.writeFileSync(path.join(temp, 'STORE-PACKAGE-MANIFEST.json'), `${JSON.stringify(listing, null, 2)}\n`, { flag: 'wx' });
    fs.writeFileSync(path.join(temp, 'STORE-RELEASE-STATUS.json'), `${JSON.stringify({
      status: 'candidate-not-submission-ready',
      submissionEligible: false,
      verification: {
        extensionBundle: 'passed',
        rightsDistributionAudit: 'not completed; the prior full scan exceeded the bounded review window',
        liveChromeInstall: 'pending',
        legalReview: 'pending owner and counsel decisions',
      },
      manualGates: ['Adopt final terms and privacy policy.', 'Complete a real Chrome install and service smoke test.', 'Complete Web Store account, listing and privacy disclosures.'],
    }, null, 2)}\n`, { flag: 'wx' });
    fs.writeFileSync(path.join(temp, 'golearn.zip'), archive, { flag: 'wx' });
    fs.writeFileSync(path.join(temp, 'golearn.zip.sha256'), `${archiveHash}  golearn.zip\n`, { flag: 'wx' });
    fs.writeFileSync(path.join(temp, 'files.sha256'), `${listingFiles.map((f) => `${f.sha256}  ${f.path}`).join('\n')}\n`, { flag: 'wx' });
    fs.renameSync(temp, destination);
    published = true;
  } catch (error) {
    throw error;
  } finally {
    if (!published && fs.existsSync(temp)) fs.rmSync(temp, { recursive: true, force: true });
  }
  return { destination, archiveHash, listing, reused: false };
}

export function withFreshDist(outputPath, action) {
  const output = path.resolve(outputPath);
  const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'golearn-cws-build-'));
  const backup = path.join(tempRoot, 'dist-backup');
  let movedOldDist = false;
  const lockPath = path.join(os.tmpdir(), `golearn-cws-${sha256(Buffer.from(output)).slice(0, 12)}.lock`);
  let lockFd;
  try {
    lockFd = fs.openSync(lockPath, 'wx');
  } catch {
    fail('Another GoLearn store build is already running; refusing to touch dist.');
  }
  try {
    if (fs.existsSync(output)) {
      fs.renameSync(output, backup);
      movedOldDist = true;
    }
    return action();
  } finally {
    if (fs.existsSync(output)) fs.rmSync(output, { recursive: true, force: true });
    if (movedOldDist) fs.renameSync(backup, output);
    if (lockFd !== undefined) fs.closeSync(lockFd);
    try { fs.unlinkSync(lockPath); } catch { /* lock already absent */ }
    fs.rmSync(tempRoot, { recursive: true, force: true });
  }
}

let interrupted = false;
process.on('SIGINT', () => { interrupted = true; process.exitCode = 130; });

function runBuild(buildId) {
  return withFreshDist(distRoot, () => {
    const env = {
      ...process.env,
      GOLEARN_STORE_RELEASE: '1',
      GOLEARN_STORE_BUILD_ID: buildId,
      GOPRACTICE_SERVICE_URL: process.env.GOLEARN_STORE_SERVICE_URL || 'https://go-v0.onrender.com',
    };
    const run = (args) => execFileSync(process.execPath, args, { cwd: repoRoot, env, stdio: 'inherit' });
    run(['node_modules/vite/bin/vite.js', 'build', '-c', 'packages/golearn-extension/vite.config.ts', '--mode', 'content']);
    run(['node_modules/vite/bin/vite.js', 'build', '-c', 'packages/golearn-extension/vite.config.ts', '--mode', 'background']);
    run(['node_modules/vite/bin/vite.js', 'build', '-c', 'packages/golearn-extension/vite.config.ts', '--mode', 'action']);
    run(['node_modules/vite/bin/vite.js', 'build', '-c', 'packages/golearn-extension/vite.config.ts', '--mode', 'analysers']);
    run(['node_modules/vite/bin/vite.js', 'build', '-c', 'packages/golearn-extension/app/vite.config.ts', '--mode', 'options']);
    run(['node_modules/vite/bin/vite.js', 'build', '-c', 'packages/gopractice/vite.config.ts', '--mode', 'extension']);
    run(['node_modules/vitest/vitest.mjs', 'run', 'test/extension/bundle.test.ts', 'test/store/golearn-store-package.test.ts']);
    if (interrupted) fail('Build interrupted; the original dist tree has been restored.');
    const result = stageAndArchive(distRoot, buildId);
    return result;
  });
}

function main() {
  const args = process.argv.slice(2);
  if (args.includes('--help')) {
    console.log('Usage: node scripts/golearn-store-package.mjs');
    console.log('Builds in an isolated temporary dist, packages only allowlisted MV3 runtime files, then restores the existing dist.');
    return;
  }
  if (args.length) fail(`Unknown option: ${args[0]}`);
  const buildId = crypto.randomUUID();
  const result = runBuild(buildId);
  console.log(`${result.reused ? 'Verified existing' : 'Created'} Chrome Web Store package: ${result.destination}`);
  console.log(`Archive SHA-256: ${result.archiveHash}`);
  console.log(`Archive size: ${fs.statSync(path.join(result.destination, 'golearn.zip')).size} bytes; uncompressed runtime: ${result.listing.uncompressedBytes} bytes; ${result.listing.files.length} files.`);
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try { main(); } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown packaging failure';
    console.error(`GoLearn store packaging failed: ${message}`);
    process.exitCode = 1;
  }
}

