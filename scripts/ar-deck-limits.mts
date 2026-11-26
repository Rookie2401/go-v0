/// <reference types="node" />
/** npm run ar:deck-limits: re-runs the sweep (scripts/ar-deck-limits-lib.mts) and writes src/adapters/arabic/generated/deck-limits.ts. */
import fs from 'node:fs';
import path from 'node:path';
import { installFullIndex, LIMITS_FILE, renderLimits, shardsPresent, SHARD_DIR, sweepDeckLimits } from './ar-deck-limits-lib.mts';

async function main(): Promise<void> {
  if (!shardsPresent()) throw new Error(`${SHARD_DIR}/manifest.json is missing: the sweep needs the whole index`);
  installFullIndex();
  const s = sweepDeckLimits();
  fs.writeFileSync(path.resolve(LIMITS_FILE), renderLimits(s), 'utf8');
  console.log(`${LIMITS_FILE}: ${Object.keys(s.forms).length} written forms, ${Object.keys(s.lemmas).length} lexemes`);
}

main().catch((e: unknown) => { console.error(e instanceof Error ? e.message : String(e)); process.exit(1); });
