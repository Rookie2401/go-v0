import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { verifyNativePayloadManifest } from './native-payload.mjs';

const here = path.dirname(fileURLToPath(import.meta.url));
const target = process.argv[2] ?? path.resolve(here, '..', 'web');
const requireRelease = process.argv.includes('--release');
const manifest = verifyNativePayloadManifest(path.resolve(target), { requireRelease });
console.log(`Verified ${manifest.buildMode} native web payload linked to ${manifest.parentBuild.git.commit}; ${manifest.payloadFiles.length} payload files checked.`);
