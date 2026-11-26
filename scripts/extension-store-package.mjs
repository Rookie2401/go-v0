// Builds the GoLearn extension as a package for the Chrome Web Store, apart from the folder a developer loads unpacked.
//
//   node scripts/extension-store-package.mjs
//
// Output (both git-ignored):
//   packages/golearn-extension/dist-store/                         the unpacked store package
//   packages/golearn-extension/store/golearn-reader-<version>-<build id>.zip
//
// What differs from the unpacked development build (packages/golearn-extension/dist):
//   1. GoReview inside the extension ships NO dictionaries (about 1 GB). It reads them from the hosted tree
//      (STORE_ASSET_BASE, served with Access-Control-Allow-Origin: *), as the hosted GoReview and the iPhone build do.
//      The Hebrew, Greek and Russian form indexes stay in the package (review/lexicon), read from './'.
//   2. translation.local.json (device-only translation credentials, copied only when GOLEARN_LOCAL_TRANSLATION=1) can
//      never be in it: this script unsets that switch, refuses to run over a folder that holds the file, and the
//      verification below fails on it.
//   3. The package is verified (verifyStorePackage) before it is zipped; nothing is zipped when a check fails.
//
// Run it in a clean worktree of the commit to publish. It rebuilds packages/golearn-extension/dist in that checkout.
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import zlib from 'node:zlib';
import { fileURLToPath, pathToFileURL } from 'node:url';

export const STORE_ASSET_BASE = 'https://rookie2401.github.io/go-v0/';
export const STORE_SERVICE_URL = 'https://go-v0.onrender.com';
/** Measured 2026-11-26: 104 MiB unpacked (75 MiB zipped). One dictionary slipping back in adds tens to hundreds of MiB, so this catches it. */
export const STORE_MAX_BYTES = 150 * 1024 * 1024;
const PRIVATE_FILE = 'translation.local.json';

const posix = (p) => p.split(path.sep).join('/');

export function listFiles(dir) {
  const out = [];
  const walk = (d) => {
    for (const e of fs.readdirSync(d, { withFileTypes: true }).sort((a, b) => (a.name < b.name ? -1 : a.name > b.name ? 1 : 0))) {
      const full = path.join(d, e.name);
      if (e.isSymbolicLink()) throw new Error(`Refusing a symlink in the store package: ${posix(path.relative(dir, full))}`);
      if (e.isDirectory()) walk(full);
      else if (e.isFile()) out.push(posix(path.relative(dir, full)));
    }
  };
  walk(dir);
  return out;
}

/** Every reason this folder must not be uploaded; an empty list means it may. */
export function verifyStorePackage(dir) {
  const problems = [];
  const files = listFiles(dir);
  const has = (f) => files.includes(f);
  const readJson = (f) => { try { return JSON.parse(fs.readFileSync(path.join(dir, f), 'utf8')); } catch { return undefined; } };

  const manifest = has('manifest.json') ? readJson('manifest.json') : undefined;
  if (!manifest) problems.push('manifest.json is missing or is not JSON');
  else {
    if (manifest.manifest_version !== 3) problems.push('manifest.json is not Manifest V3');
    if (!/^\d+(\.\d+){0,3}$/.test(manifest.version ?? '')) problems.push(`manifest.json has no usable version: ${manifest.version}`);
    const named = [manifest.background?.service_worker, manifest.options_page, manifest.action?.default_popup, ...Object.values(manifest.icons ?? {})].filter(Boolean);
    for (const f of named) if (!has(f)) problems.push(`manifest.json names a file that is not in the package: ${f}`);
  }
  const build = has('build.json') ? readJson('build.json') : undefined;
  if (!build?.id) problems.push('build.json is missing or has no id (the build id shown in the popup)');
  else if (/dirty/i.test(build.id)) problems.push(`build.json says ${build.id}: the package was built from uncommitted changes; commit first`);

  // nothing private, nothing for debugging
  for (const f of files) {
    const base = path.posix.basename(f);
    if (base === PRIVATE_FILE || /\.local\./i.test(base)) problems.push(`private device file in the package: ${f}`);
    if (/^\.env(\.|$)/i.test(base) || /\.(pem|key|p12|p8|mobileprovision)$/i.test(base) || base === 'credentials.json') problems.push(`credential-like file in the package: ${f}`);
    if (/\.map$/i.test(base)) problems.push(`source map in the package: ${f}`);
  }

  // GoReview inside the extension: no dictionaries of its own, and told where the hosted ones are
  if (!has('review/index.html')) problems.push('review/index.html is missing: GoReview was not built into the package');
  const reviewDict = files.filter((f) => f.startsWith('review/dict/'));
  if (reviewDict.length) problems.push(`review/dict/ holds ${reviewDict.length} dictionary files: the store package reads dictionaries from the hosted tree`);
  const config = has('review/config.json') ? readJson('review/config.json') : undefined;
  if (!config) problems.push('review/config.json is missing or is not JSON');
  else {
    let base;
    try { base = new URL(config.assetBaseUrl); } catch { base = undefined; }
    if (!base || base.protocol !== 'https:' || base.username || base.search || base.hash) {
      problems.push(`review/config.json assetBaseUrl must be an absolute https address (it is ${JSON.stringify(config.assetBaseUrl)}): with "./" every dictionary request fails`);
    }
    let service;
    try { service = new URL(config.serviceUrl); } catch { service = undefined; }
    if (!service || service.protocol !== 'https:') problems.push(`review/config.json serviceUrl must be https (it is ${JSON.stringify(config.serviceUrl)})`);
  }

  // the reader's own bundled dictionary stays the one installable pack
  const appDict = new Set(files.filter((f) => f.startsWith('app/dict/')).map((f) => f.split('/')[2]));
  for (const lang of appDict) if (lang !== 'sq') problems.push(`app/dict/${lang}/ is bundled: only the Albanian dictionary ships in the package`);

  const bytes = files.reduce((n, f) => n + fs.statSync(path.join(dir, f)).size, 0);
  if (bytes > STORE_MAX_BYTES) problems.push(`the package is ${(bytes / 1024 / 1024).toFixed(1)} MiB, over its ${(STORE_MAX_BYTES / 1024 / 1024).toFixed(0)} MiB ceiling`);
  if (files.length > 65_535) problems.push(`the package has ${files.length} files: more than one plain zip holds`);
  return problems;
}

/** A plain zip (deflate, UTF-8 names, forward slashes, fixed timestamps) of every file under dir, manifest.json at its root. */
export function writeZip(dir, zipPath) {
  const files = listFiles(dir);
  if (files.length > 65_535) throw new Error('Too many files for a plain zip.');
  const DOS_TIME = 0;
  const DOS_DATE = ((2026 - 1980) << 9) | (1 << 5) | 1; // 2026-01-01, so the same input gives the same zip
  const fd = fs.openSync(zipPath, 'w');
  const central = [];
  let offset = 0;
  try {
    for (const rel of files) {
      const data = fs.readFileSync(path.join(dir, rel));
      const deflated = zlib.deflateRawSync(data, { level: 9 });
      const stored = deflated.length >= data.length;
      const body = stored ? data : deflated;
      const name = Buffer.from(rel, 'utf8');
      const crc = zlib.crc32(data);
      const local = Buffer.alloc(30);
      local.writeUInt32LE(0x04034b50, 0); local.writeUInt16LE(20, 4); local.writeUInt16LE(0x0800, 6); local.writeUInt16LE(stored ? 0 : 8, 8);
      local.writeUInt16LE(DOS_TIME, 10); local.writeUInt16LE(DOS_DATE, 12); local.writeUInt32LE(crc, 14);
      local.writeUInt32LE(body.length, 18); local.writeUInt32LE(data.length, 22); local.writeUInt16LE(name.length, 26); local.writeUInt16LE(0, 28);
      fs.writeSync(fd, local); fs.writeSync(fd, name); fs.writeSync(fd, body);
      const entry = Buffer.alloc(46);
      entry.writeUInt32LE(0x02014b50, 0); entry.writeUInt16LE(20, 4); entry.writeUInt16LE(20, 6); entry.writeUInt16LE(0x0800, 8); entry.writeUInt16LE(stored ? 0 : 8, 10);
      entry.writeUInt16LE(DOS_TIME, 12); entry.writeUInt16LE(DOS_DATE, 14); entry.writeUInt32LE(crc, 16);
      entry.writeUInt32LE(body.length, 20); entry.writeUInt32LE(data.length, 24); entry.writeUInt16LE(name.length, 28);
      entry.writeUInt32LE(offset, 42);
      central.push(Buffer.concat([entry, name]));
      offset += 30 + name.length + body.length;
      if (offset > 0xffffffff) throw new Error('The zip passed 4 GB: a plain zip cannot hold it.');
    }
    const directory = Buffer.concat(central);
    const end = Buffer.alloc(22);
    end.writeUInt32LE(0x06054b50, 0); end.writeUInt16LE(files.length, 8); end.writeUInt16LE(files.length, 10);
    end.writeUInt32LE(directory.length, 12); end.writeUInt32LE(offset, 16);
    fs.writeSync(fd, directory); fs.writeSync(fd, end);
  } finally { fs.closeSync(fd); }
  return { files: files.length, bytes: fs.statSync(zipPath).size };
}

function run(command, env) {
  const result = spawnSync(command, { stdio: 'inherit', shell: true, env });
  if (result.status !== 0) throw new Error(`Failed: ${command}`);
}

function main() {
  const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
  const pkg = path.join(root, 'packages', 'golearn-extension');
  const dist = path.join(pkg, 'dist');
  const store = path.join(pkg, 'dist-store');
  if (fs.existsSync(path.join(dist, PRIVATE_FILE))) {
    throw new Error(`${posix(path.relative(root, dist))} holds ${PRIVATE_FILE}: it is someone's working extension. Run this in a clean worktree instead; nothing was built.`);
  }
  const env = { ...process.env };
  delete env.GOLEARN_LOCAL_TRANSLATION;
  delete env.GOREVIEW_OUT;
  process.chdir(root);
  run('npm run ext:build', env);
  run('npx vite build -c packages/golearn-extension/app/vite.config.ts --mode options', env);

  fs.rmSync(store, { recursive: true, force: true });
  fs.cpSync(dist, store, {
    recursive: true,
    filter: (src) => {
      const rel = posix(path.relative(dist, src));
      return rel !== 'review' && !rel.startsWith('review/') && path.basename(src) !== PRIVATE_FILE;
    },
  });
  run('npx vite build -c packages/goreview/app/vite.config.ts --mode extension', {
    ...env, GOREVIEW_OUT: path.join(store, 'review'), GOREVIEW_SERVICE_URL: STORE_SERVICE_URL, GOREVIEW_DICT: '', GOREVIEW_ASSET_BASE: STORE_ASSET_BASE,
  });

  const problems = verifyStorePackage(store);
  if (problems.length) {
    for (const p of problems) console.error(`NOT READY: ${p}`);
    process.exitCode = 1;
    return;
  }
  const manifest = JSON.parse(fs.readFileSync(path.join(store, 'manifest.json'), 'utf8'));
  const build = JSON.parse(fs.readFileSync(path.join(store, 'build.json'), 'utf8'));
  const out = path.join(pkg, 'store');
  fs.mkdirSync(out, { recursive: true });
  const zipPath = path.join(out, `golearn-reader-${manifest.version}-${build.id}.zip`);
  const zip = writeZip(store, zipPath);
  const bytes = listFiles(store).reduce((n, f) => n + fs.statSync(path.join(store, f)).size, 0);
  console.log(`Store package verified: ${zip.files} files, ${(bytes / 1024 / 1024).toFixed(1)} MiB unpacked, ${(zip.bytes / 1024 / 1024).toFixed(1)} MiB zipped.`);
  console.log(`  folder: ${posix(path.relative(root, store))}`);
  console.log(`  zip:    ${posix(path.relative(root, zipPath))}`);
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) main();
