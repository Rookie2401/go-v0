/// <reference types="node" />
/**
 * npm run corpus:validate -- <file-or-dir>...
 * Validates corpus documents (schema version 2) without importing them. Exit code 1 when any error is found
 * (or nothing was given to validate), 0 otherwise. See docs/IMPORT.md.
 */
import { collectJsonFiles, loadFiles, validateAndPrint } from './corpus-cli.mts';

const args = process.argv.slice(2).filter((a) => a !== '--');
if (!args.length) {
  console.error('usage: npm run corpus:validate -- <file-or-dir>...');
  process.exit(1);
}
let files: string[] = [];
try { files = collectJsonFiles(args); }
catch (e) { console.error(`cannot read input: ${e instanceof Error ? e.message : String(e)}`); process.exit(1); }
if (!files.length) { console.error('no .json files found in the given paths'); process.exit(1); }

const run = validateAndPrint(loadFiles(files));
console.log(`corpus:validate - ${run.documents} document(s), ${run.errors} error(s), ${run.warnings} warning(s)`);
process.exit(run.errors ? 1 : 0);
