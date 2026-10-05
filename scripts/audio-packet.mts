/**
 * npm run audio:packet -- --unit <path to a ladder unit document> [--out dir] [--content-version n]
 *
 * Writes, for a native speaker and the keeper of the recording:
 *   <out>/<unit>.recording-script.html   printable script: numbered sentences, how to record, speaker details
 *   <out>/<unit>.manifest.json           the GoListen import manifest for a curated human recording, to be completed
 * Default <out>: data/review/<lang>/packets/ (relative to the repository root).
 * See docs/LADDER.md (the pipeline) and docs/GOLISTEN.md (importing a recording).
 */
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { createAdapterRegistry } from '../src/adapters';
import { validateDocument, type CorpusDocument } from '../src/ingest/format';
import { manifestTemplate, packetHtml, recordingScript } from '../src/ladder/recording';

function arg(name: string): string | undefined {
  const i = process.argv.indexOf(`--${name}`);
  return i >= 0 ? process.argv[i + 1] : undefined;
}

function fail(message: string): never {
  console.error(`audio:packet: ${message}`);
  process.exit(1);
}

const unitPath = arg('unit');
if (!unitPath) fail('usage: npm run audio:packet -- --unit <path to unit document> [--out dir] [--content-version n]');
const versionArg = arg('content-version');
const contentVersion = versionArg === undefined ? 1 : Number(versionArg);
if (!Number.isInteger(contentVersion) || contentVersion < 1) fail('--content-version must be a positive integer');

let raw: Record<string, unknown>;
try { raw = JSON.parse(readFileSync(resolve(unitPath), 'utf8')) as Record<string, unknown>; } catch (e) { fail(`cannot read ${unitPath}: ${(e as Error).message}`); }

// The pipeline block (docs/LADDER.md) is not part of the import format the validator checks: read it, then validate the rest.
const { pipeline, ...rest } = raw as { pipeline?: { state?: unknown } } & Record<string, unknown>;
const pipelineState = typeof pipeline?.state === 'string' ? pipeline.state : undefined;

const registry = createAdapterRegistry();
const errors = validateDocument(rest, { registry }).filter((i) => i.severity === 'error');
if (errors.length) fail(`${unitPath} is not a valid unit document:\n` + errors.slice(0, 10).map((i) => `  ${i.path}: ${i.message}`).join('\n'));

const doc = rest as unknown as CorpusDocument;
const adapter = registry.get(doc.lang);
const script = recordingScript(doc, adapter);
const template = await manifestTemplate(doc, { adapter, contentVersion });

const out = resolve(arg('out') ?? join('data', 'review', doc.lang, 'packets'));
mkdirSync(out, { recursive: true });
const htmlFile = join(out, `${doc.id}.recording-script.html`);
const manifestFile = join(out, `${doc.id}.manifest.json`);
writeFileSync(htmlFile, packetHtml({ script, contentVersion, textSha256: template.textSha256, pipelineState }), 'utf8');
writeFileSync(manifestFile, JSON.stringify(template, null, 2) + '\n', 'utf8');

console.log(`${doc.id} (${doc.lang}${doc.variety ? `, ${doc.variety}` : ''}): ${script.sentences.length} sentences`);
console.log(`  content version ${contentVersion}, textSha256 ${template.textSha256}`);
console.log(`  ${htmlFile}`);
console.log(`  ${manifestFile}`);
if (pipelineState === undefined) console.warn('  WARNING: the document has no pipeline record; nothing shows it has been reviewed. Record only after review.');
else if (!['reviewed', 'audio-ready', 'published'].includes(pipelineState)) console.warn(`  WARNING: pipeline state is "${pipelineState}". Wait until the unit is "reviewed": a correction voids a finished recording.`);
console.log(`  The manifest assumes content version ${contentVersion} (a fresh import is 1); pass --content-version if the app holds another.`);
