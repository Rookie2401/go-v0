/// <reference types="node" />
/**
 * npm run speech:check
 *
 *  1. Configuration: configured / not configured (never prints a key).
 *  2. The provider-independent chain (real GoListen + real ProxySpeechProvider + real proxy handler, MOCKED upstream).
 *  3. ONLY when both variables are configured: one real synthesis of one sentence of the verified Spanish Scripture
 *     sample through the proxy handler against the live service.
 *
 * The exit code is decided by (2), and by (3) only when it was attempted. See docs/SPEECH.md.
 */
import { readSpeechEnv } from '../server/speechProxy.ts';
import { loadBundledCorpus } from '../src/ingest';
import {
  REAL_SPEECH_NOT_VERIFIED, configurationReport, formatLive, formatTable, runLiveSynthesis, runProviderIndependentChecks, selectSpanishSample,
} from './speechChecks.ts';

const env = readSpeechEnv(process.cwd(), 'development');

console.log('== 1. Configuration ==');
const config = await configurationReport(env);
for (const line of config.lines) console.log(line);

console.log('\n== 2. Provider-independent chain (real GoListen + ProxySpeechProvider + proxy handler, MOCKED upstream; no network) ==');
const chain = await runProviderIndependentChecks();
console.log(formatTable(chain.results));
const passed = chain.results.filter((r) => r.ok).length;
console.log(`\n${passed}/${chain.results.length} provider-independent checks passed.`);
console.log('These prove the code path only. They say nothing about the live service or how any voice sounds.');

console.log('\n== 3. Real speech ==');
let liveFailed = false;
const liveRequested = process.argv.includes('--live');
const sourcePermissionAllowed = process.argv.includes('--source-permission-allowed');
if (!liveRequested || !sourcePermissionAllowed || !env.authToken) {
  console.log('REAL SPEECH: NOT VERIFIED — live checks require --live, --source-permission-allowed, and GO_SPEECH_AUTH_TOKEN');
} else if (!config.configured) {
  console.log(REAL_SPEECH_NOT_VERIFIED);
} else {
  // The sentence is read from the verified document, never retyped here.
  const sentence = selectSpanishSample(loadBundledCorpus());
  if (!sentence) {
    liveFailed = true;
    console.log('REAL SPEECH: FAILED \u2014 the verified Spanish Scripture sample (bible-1john-1) could not be read');
  } else {
    console.log(`sentence: first sentence of the Spanish bible-1john-1 (${sentence.length} characters; read from the verified document)`);
    const live = await runLiveSynthesis({ env, sentence, processingPermission: 'allowed' });
    liveFailed = !live.ok;
    for (const line of formatLive(live)) console.log(line);
  }
}

process.exit(chain.ok && !liveFailed ? 0 : 1);
