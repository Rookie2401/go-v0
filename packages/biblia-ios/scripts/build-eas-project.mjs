import { cp, lstat, mkdir, readFile, readdir, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';
import { validateAppIcons } from './validate-app-icon.mjs';

// Biblia's standalone edition in a Capacitor shell. Same staging as packages/goreview-ios, with these differences: the web content is only
// the standalone Biblia build; the Expo project id is never copied from another app (BIBLIA_EAS_PROJECT_ID, or the id `eas init` wrote
// into the previous stage); the native App Store icon is installed from assets/icon.png.

const packageDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const repositoryDir = path.resolve(packageDir, '../..');
const stageDir = path.join(packageDir, '.eas-project');
const bundleId = process.env.BIBLIA_BUNDLE_ID;
const buildNumber = process.env.BIBLIA_BUILD_NUMBER;
const marketingVersion = process.env.BIBLIA_MARKETING_VERSION || '1.0.0';
const appIdPattern = /^[A-Za-z0-9-]+(?:\.[A-Za-z0-9-]+)+$/;
if (!appIdPattern.test(bundleId ?? '') || /(^|\.)(example|invalid|test|localhost)(\.|$)/i.test(bundleId)) {
  throw new Error('Set BIBLIA_BUNDLE_ID to the real reverse-DNS App ID registered to the Apple Developer account.');
}
if (!/^[1-9][0-9]*$/.test(buildNumber ?? '')) throw new Error('Set BIBLIA_BUILD_NUMBER to a positive integer greater than the last uploaded build.');
if (!/^\d+\.\d+(?:\.\d+)?$/.test(marketingVersion)) throw new Error('BIBLIA_MARKETING_VERSION must look like 1.0 or 1.0.1.');
const projectIdPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
if (process.env.BIBLIA_EAS_PROJECT_ID && !projectIdPattern.test(process.env.BIBLIA_EAS_PROJECT_ID)) throw new Error('BIBLIA_EAS_PROJECT_ID must be the UUID `npx eas init` printed for the Biblia Expo project.');
await validateAppIcons(packageDir, { sourceOnly: true });

const previousAppConfigPath = path.join(stageDir, 'app.json');
let existingProjectId = process.env.BIBLIA_EAS_PROJECT_ID || undefined;
try {
  const previous = JSON.parse(await readFile(previousAppConfigPath, 'utf8'));
  existingProjectId ||= previous?.expo?.extra?.eas?.projectId;
} catch { /* first stage */ }

function run(command, args, cwd) {
  const result = spawnSync(command, args, { cwd, env: process.env, stdio: 'inherit', shell: process.platform === 'win32' });
  if (result.status !== 0) throw new Error(`${command} ${args.join(' ')} failed with exit ${result.status ?? 'unknown'}.`);
}

// Never staged anywhere: tooling folders, secrets and databases.
const deniedPath = /(^|[\\/])(?:node_modules|Pods|build|DerivedData|xcuserdata|\.git|private)(?:[\\/]|$)|(^|[\\/])\.env(?:\.|$)|(^|[\\/])credentials\.json$|\.(?:p12|p8|mobileprovision|sqlite|sqlite3|db|pem|key|jks)(?:-wal|-shm)?$/i;
// Repository-level `data/` and `docs/` folders are kept out as well, but NOT inside the bundled web app: Biblia ships its texts as `data/**`
// (canon.json and the books) at the web root. The GoReview shell's old rule covered every path and shipped a Biblia with no texts (builds 8 and 9).
// The web app's files live under web/ and, after `cap sync`, under ios/App/App/public/; a `data` or `docs` segment there is app content.
const repoDataPath = /(^|[\\/])(?:data|docs)(?:[\\/]|$)/i;
const isAppContent = (relative) => /^web(?:[\\/]|$)/i.test(relative) || /^ios[\\/]App[\\/]App[\\/]public(?:[\\/]|$)/i.test(relative);
async function copySafe(source, destination, relative = '') {
  const stat = await lstat(source);
  if (stat.isSymbolicLink()) throw new Error(`Refusing to stage symlink ${relative || source}.`);
  if (deniedPath.test(relative)) return;
  if (!isAppContent(relative) && repoDataPath.test(relative)) return;
  if (stat.isDirectory()) {
    await mkdir(destination, { recursive: true });
    for (const name of await readdir(source)) await copySafe(path.join(source, name), path.join(destination, name), path.join(relative, name));
    return;
  }
  if (stat.isFile()) await cp(source, destination);
}

run('npm', ['run', 'release:sync'], packageDir);
// The App Store icon of the native project is the supplied assets/icon.png (validated above).
await cp(path.join(packageDir, 'assets', 'icon.png'), path.join(packageDir, 'ios', 'App', 'App', 'Assets.xcassets', 'AppIcon.appiconset', 'AppIcon-512@2x.png'));
await rm(stageDir, { recursive: true, force: true });
await mkdir(stageDir, { recursive: true });
await mkdir(path.join(stageDir, '.eas'), { recursive: true });
await mkdir(path.join(stageDir, 'scripts'), { recursive: true });

await copySafe(path.join(packageDir, 'web'), path.join(stageDir, 'web'), 'web');
await copySafe(path.join(packageDir, 'ios'), path.join(stageDir, 'ios'), 'ios');
await cp(path.join(packageDir, '.eas', 'build'), path.join(stageDir, '.eas', 'build'), { recursive: true });
await cp(path.join(packageDir, 'templates', 'eas-project', 'package.json'), path.join(stageDir, 'package.json'));
await cp(path.join(packageDir, 'scripts', 'validate-staged-release.mjs'), path.join(stageDir, 'scripts', 'validate-staged-release.mjs'), { recursive: true });
await cp(path.join(packageDir, 'scripts', 'set-build-version.mjs'), path.join(stageDir, 'scripts', 'set-build-version.mjs'), { recursive: true });
await cp(path.join(packageDir, 'scripts', 'prepare-eas-ios-project.mjs'), path.join(stageDir, 'scripts', 'prepare-eas-ios-project.mjs'));
await cp(path.join(packageDir, 'scripts', 'validate-app-icon.mjs'), path.join(stageDir, 'scripts', 'validate-app-icon.mjs'));
await cp(path.join(packageDir, 'eas.json'), path.join(stageDir, 'eas.json'));

// This lock contains only Capacitor runtime/build packages, never the package-local EAS CLI.
await cp(path.join(packageDir, 'templates', 'eas-project', 'package-lock.json'), path.join(stageDir, 'package-lock.json'));

const serviceConfig = JSON.parse(await readFile(path.join(stageDir, 'web', 'config.json'), 'utf8'));
const nativeConfig = JSON.parse(await readFile(path.join(stageDir, 'ios', 'App', 'App', 'public', 'config.json'), 'utf8'));
const easApp = {
  expo: {
    name: 'Biblia', slug: 'biblia-ios', version: marketingVersion,
    icon: './assets/icon.png',
    ios: { bundleIdentifier: bundleId, buildNumber, supportsTablet: false },
    extra: existingProjectId ? { eas: { projectId: existingProjectId } } : undefined,
  },
};
if (!easApp.expo.extra) delete easApp.expo.extra;
await writeFile(path.join(stageDir, 'app.json'), `${JSON.stringify(easApp, null, 2)}\n`);
await mkdir(path.join(stageDir, 'assets'), { recursive: true });
await cp(path.join(packageDir, 'assets', 'icon.png'), path.join(stageDir, 'assets', 'icon.png'));

const capacitor = { appId: bundleId, appName: 'Biblia', webDir: 'web', ios: { contentInset: 'automatic', zoomEnabled: true } };
await writeFile(path.join(stageDir, 'capacitor.config.json'), `${JSON.stringify(capacitor, null, 2)}\n`);
const xcodeProjectPath = path.join(stageDir, 'ios', 'App', 'App.xcodeproj', 'project.pbxproj');
let xcodeProject = await readFile(xcodeProjectPath, 'utf8');
xcodeProject = xcodeProject.replaceAll('com.example.provisional.biblia', bundleId);
await writeFile(xcodeProjectPath, xcodeProject);
run(process.execPath, [path.join(stageDir, 'scripts', 'prepare-eas-ios-project.mjs')], stageDir);

await writeFile(path.join(stageDir, '.easignore'), [
  'node_modules/', '**/node_modules/', 'Pods/', '**/Pods/', '.env', '.env.*', '!.env.example', '**/.env', '**/.env.*',
  'output/', '**/output/', 'build/', '**/build/', '!.eas/build/', '!.eas/build/**', 'DerivedData/', '**/DerivedData/', 'xcuserdata/', '**/xcuserdata/',
  '.git/', '**/.git/', 'data/local-repository/', '**/data/local-repository/', '**/docs/private/', '**/credentials.json',
  '**/*.p12', '**/*.p8', '**/*.mobileprovision', '**/*.sqlite', '**/*.sqlite3', '**/*.sqlite-wal', '**/*.sqlite-shm', '**/*.db', '**/*.pem', '**/*.key',
  '.DS_Store', '**/.DS_Store', '*.xcuserstate', '**/*.xcuserstate',
  '',
].join('\n'));

const allow = new Set(['.eas', '.easignore', 'app.json', 'assets', 'capacitor.config.json', 'eas.json', 'ios', 'package.json', 'package-lock.json', 'scripts', 'web']);
const unexpected = (await readdir(stageDir, { withFileTypes: true })).map((entry) => entry.name).filter((name) => !allow.has(name));
if (unexpected.length) throw new Error(`Standalone EAS stage contains unexpected top-level paths: ${unexpected.join(', ')}`);
async function verifyNoSensitiveFiles(directory, relative = '') {
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    const child = path.join(relative, entry.name);
    const normalizedChild = child.replaceAll('\\', '/');
    const allowedWorkflowPath = normalizedChild === '.eas/build' || normalizedChild === '.eas/build/ios-testflight.yml';
    if (deniedPath.test(child) && !allowedWorkflowPath) throw new Error(`Sensitive or generated path entered the EAS stage: ${child}`);
    if (entry.isDirectory()) await verifyNoSensitiveFiles(path.join(directory, entry.name), child);
  }
}
await verifyNoSensitiveFiles(stageDir);
await validateAppIcons(stageDir);
if (nativeConfig.serviceUrl !== serviceConfig.serviceUrl || serviceConfig.serviceUrl !== process.env.REPOSITORY_SERVICE_URL.replace(/\/+$/, '')) {
  throw new Error('Staged Repository endpoint does not match the validated release input.');
}
console.log(`Created isolated Biblia EAS project at ${path.relative(repositoryDir, stageDir)}. Only this directory will be submitted to EAS.`);
console.log(existingProjectId ? `Expo project id ${existingProjectId} is set in the stage.` : 'No Expo project id yet: run `npx eas init` in the stage once (README.md), then keep it with BIBLIA_EAS_PROJECT_ID for later stages.');
console.log('Before any remote build, configure the App Store signing credentials for the bundle id.');
