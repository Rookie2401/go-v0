/// <reference types="node" />
/**
 * Writes every written form the Albanian word list generates (and every closed-class form), one per line, for the
 * offline analyzer bridge (scripts/external/uniparser_sq_analyze.py). Run: npx vite-node scripts/sq-forms-dump.mts -- <out.txt>
 */
import fs from 'node:fs';
import { SQ_FUNCTION_READINGS } from '../src/adapters/albanian/function-words';
import { sqGeneratedForms } from '../src/adapters/albanian/morphology';

const out = process.argv.slice(2).filter((a) => a !== '--')[0];
if (!out) { console.error('usage: npx vite-node scripts/sq-forms-dump.mts -- <out.txt>'); process.exit(1); }
const forms = new Set<string>([...sqGeneratedForms().keys(), ...SQ_FUNCTION_READINGS.keys()]);
fs.writeFileSync(out, `${[...forms].sort().join('\n')}\n`, 'utf8');
console.log(`${forms.size} forms written to ${out}`);
