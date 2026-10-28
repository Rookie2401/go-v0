/** Explicit, local operator tool. Reads a Go Repository export; never uploads it. */
import { readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { optimizeReviewProfile, reliableReviewHistory } from '../server/review/optimizer';
import { type GoEvent } from '../packages/repository-contract/src';

const [input, output, languageId, objective = 'written-recognition'] = process.argv.slice(2);
if (!input || !output || !languageId) throw new Error('Usage: vite-node scripts/optimize-goreview.mts <repository-export.json> <candidate.json> <language> [objective]');
if (resolve(input) === resolve(output)) throw new Error('The candidate output must not overwrite the source export.');
const exported = JSON.parse(readFileSync(input, 'utf8')) as { events?: GoEvent[] };
if (!Array.isArray(exported.events)) throw new Error('Expected a Go Repository export containing events.');
if (new Set(exported.events.map((e) => e.learnerId)).size > 1) throw new Error('Optimize one learner at a time; mixed exports are not accepted.');
const history = reliableReviewHistory(exported.events, languageId);
const report = await optimizeReviewProfile(history, { languageId, objective });
writeFileSync(output, JSON.stringify({ ...report, languageId, objective, createdAt: new Date().toISOString(), optimizer: '@open-spaced-repetition/binding@0.5.0' }, null, 2) + '\n', { flag: 'wx' });
console.log(`${report.status}: ${report.reason} No active scheduler profile was changed.`);
