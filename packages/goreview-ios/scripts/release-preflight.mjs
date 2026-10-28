import fs from 'node:fs/promises';
import path from 'node:path';
import { execFileSync, spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { captureReleaseSourceFingerprint } from '../../../scripts/goreview-release.mjs';

const here = path.dirname(fileURLToPath(import.meta.url));
const pkg = path.resolve(here, '..');
const repo = path.resolve(pkg, '../..');
const args = process.argv.slice(2);
const modeArgs = args.filter((arg) => arg === '--developer' || arg === '--release');
const webOnly = args.includes('--web-only');
if (args.some((arg) => !['--developer', '--release', '--web-only'].includes(arg)) || modeArgs.length > 1 || (webOnly && modeArgs.includes('--developer'))) {
  throw new Error('Usage: node scripts/release-preflight.mjs [--developer | --release] [--web-only]');
}
const mode = modeArgs.includes('--release') || webOnly ? 'release' : 'developer';
const sourceCommitAtStart = git('rev-parse', 'HEAD');
const sourceFingerprintAtStart = captureReleaseSourceFingerprint(repo);
const receiptPath = path.join(pkg, '.preflight', 'release-preflight-receipt.json');
const testReportPath = path.join(pkg, '.preflight', 'regression-tests.json');
const history = [];
let testsStarted = false;
let parentArtifactVerified = false;
let nativePayloadVerified = false;
await fs.mkdir(path.dirname(testReportPath), { recursive: true });
await fs.rm(testReportPath, { force: true });

function commandLabel(command, commandArgs) { return [command, ...commandArgs].join(' '); }
function run(command, commandArgs, envOverrides = {}) {
  const windows = process.platform === 'win32';
  const executable = windows && ['npm', 'npx'].includes(command) ? `${command}.cmd` : command;
  const childEnv = { ...process.env, ...envOverrides };
  delete childEnv.TEST_DATABASE_URL;
  const result = spawnSync(executable, commandArgs, { cwd: repo, env: childEnv, stdio: 'inherit', shell: windows });
  const record = { command: commandLabel(command, commandArgs), exitCode: result.status, signal: result.signal ?? null };
  history.push(record);
  if (result.status !== 0) throw new Error(`${record.command} failed with ${result.status === null ? `signal ${result.signal}` : `exit ${result.status}`}.`);
}

function git(...gitArgs) { return execFileSync('git', gitArgs, { cwd: repo, encoding: 'utf8' }).trim(); }
async function writeReceipt(success, error) {
  let parentBuild;
  let nativePayload;
  let testSummary;
  try {
    if (!testsStarted) throw new Error('No test run in this preflight.');
    const report = JSON.parse(await fs.readFile(testReportPath, 'utf8'));
    testSummary = {
      passed: Number(report.numPassedTests ?? 0),
      failed: Number(report.numFailedTests ?? 0),
      skipped: Number(report.numPendingTests ?? report.numTodoTests ?? 0),
      testFiles: Array.isArray(report.testResults) ? report.testResults.length : 0,
    };
  } catch { /* this run did not produce a test result file */ }
  const artifactRoot = webOnly ? path.join(pkg, '.preflight', 'web-release') : path.join(pkg, 'web');
  if (parentArtifactVerified) {
    try { parentBuild = JSON.parse(await fs.readFile(path.join(artifactRoot, 'goreview-release-manifest.json'), 'utf8')); } catch { /* verified artifact was removed later */ }
  }
  if (nativePayloadVerified) {
    try { nativePayload = JSON.parse(await fs.readFile(path.join(artifactRoot, 'goreview-native-payload-manifest.json'), 'utf8')); } catch { /* verified payload was removed later */ }
  }
  const receipt = {
    schemaVersion: 1,
    product: 'GoReview',
    kind: 'local-release-preflight',
    mode,
    target: webOnly ? 'web-only' : 'native-payload',
    success,
    createdAt: new Date().toISOString(),
    sourceCommitAtStart,
    sourceFingerprintSha256AtStart: sourceFingerprintAtStart.sha256,
    sourceFingerprintAtStart: sourceFingerprintAtStart.files,
    runtime: { node: process.version, platform: process.platform, arch: process.arch },
    commands: history,
    testSummary: testSummary ?? null,
    parentBuild: parentBuild ? {
      sourceManifestSha256: parentBuild.sourceManifestSha256,
      artifactManifestSha256: parentBuild.artifactManifestSha256,
      commit: parentBuild.git?.commit,
    } : null,
    nativePayload: nativePayload ? {
      payloadManifestSha256: nativePayload.payloadManifestSha256,
      parentArtifactManifestSha256: nativePayload.parentBuild?.artifactManifestSha256,
    } : null,
    ...(error ? { error } : {}),
  };
  await fs.mkdir(path.dirname(receiptPath), { recursive: true });
  await fs.writeFile(receiptPath, `${JSON.stringify(receipt, null, 2)}\n`);
  return receipt;
}

try {
  run('npm', ['run', 'typecheck']);
  testsStarted = true;
  run('npx', ['vitest', 'run', '--configLoader', 'runner', '--maxWorkers=4', '--reporter=default', '--reporter=json',
    `--outputFile.json=${path.relative(repo, testReportPath)}`,
    'test/contract', 'test/repository', 'test/golearn', 'test/golearn-app', 'test/golearn-e2e', 'test/golisten', 'test/gotell',
    'test/goreview', 'test/gopractice', 'test/server/review-optimizer.test.ts']);
  if (webOnly) {
    const artifactDir = path.join(pkg, '.preflight', 'web-release');
    run('node', ['node_modules/vite/bin/vite.js', 'build', '-c', 'packages/gopractice/vite.config.ts', '--mode', 'review'], {
      GOPRACTICE_OUT: artifactDir,
      GOREVIEW_RELEASE_MODE: 'release',
    });
    run('node', ['scripts/goreview-release.mjs', 'verify', path.relative(repo, artifactDir), '--release']);
    parentArtifactVerified = true;
  } else {
    run('node', ['packages/goreview-ios/scripts/prepare-web.mjs', `--${mode}`]);
    parentArtifactVerified = true;
    run('node', ['packages/goreview-ios/scripts/verify-native-payload.mjs', 'packages/goreview-ios/web', ...(mode === 'release' ? ['--release'] : [])]);
    nativePayloadVerified = true;
  }
  const sourceFingerprintAtEnd = captureReleaseSourceFingerprint(repo);
  if (git('rev-parse', 'HEAD') !== sourceCommitAtStart) throw new Error('Git HEAD changed during preflight.');
  if (sourceFingerprintAtEnd.sha256 !== sourceFingerprintAtStart.sha256) throw new Error('Source files changed during preflight.');
  await writeReceipt(true);
  console.log(`GoReview ${mode} preflight passed. Receipt: ${path.relative(repo, receiptPath)}`);
} catch (error) {
  await writeReceipt(false, error instanceof Error ? error.message : String(error));
  throw error;
}
