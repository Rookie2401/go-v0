import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { finalizeCapacitorPayload } from './native-payload.mjs';

const here = path.dirname(fileURLToPath(import.meta.url));
const packageDir = path.resolve(here, '..');
const sourceDir = path.resolve(packageDir, process.argv[2] ?? 'web');
const nativeDir = path.resolve(packageDir, process.argv[3] ?? 'ios/App/App/public');
const requireRelease = process.argv.includes('--release');
const manifest = finalizeCapacitorPayload(sourceDir, nativeDir, { requireRelease });
console.log(`Finalized Capacitor payload from ${path.relative(packageDir, sourceDir)} to ${path.relative(packageDir, nativeDir)}; ${manifest.payloadFiles.length} files are integrity-bound.`);
