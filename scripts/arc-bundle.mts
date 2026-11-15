import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { build } from 'esbuild';

const output = resolve(process.argv[2] ?? 'C:/Users/CJWal/dev/ecclesia-publish/integrations/aramaic/golearn/adapter.js');
await mkdir(dirname(output), { recursive: true });
const result = await build({
  absWorkingDir: process.cwd(),
  entryPoints: ['src/adapters/arc.ts'],
  bundle: true,
  platform: 'browser',
  format: 'esm',
  target: ['es2022'],
  treeShaking: true,
  minify: true,
  legalComments: 'none',
  write: false,
});
const bytes = result.outputFiles[0]!.contents;
const sha256 = createHash('sha256').update(bytes).digest('hex');
const sourceRevision = execFileSync('git', ['rev-parse', 'HEAD'], { encoding: 'utf8' }).trim();
const sourceFiles = ['scripts/arc-bundle.mts', 'src/adapters/arc.ts', 'src/adapters/aramaic/seed.ts', 'src/adapters/hebrew/text.ts', 'src/adapters/hebrew/oshb.ts', 'src/adapters/hebrew/describe.ts', 'src/adapters/shared.ts'];
const sourceChecksums = Object.fromEntries(await Promise.all(sourceFiles.map(async (file) => [file, createHash('sha256').update(await readFile(file)).digest('hex')])));
const esbuild = JSON.parse(await readFile('node_modules/esbuild/package.json', 'utf8'));
await writeFile(output, bytes);
const typesFile = 'adapter.d.ts';
await writeFile(resolve(dirname(output), typesFile), `export type ArcMorph = Record<string, string>;
export interface RawToken { surface: string; normalized: string; start: number; end: number; isWord: boolean }
export interface ArcPart { text: string; start: number; end: number; lemma?: string; pos?: string; morph: ArcMorph; role?: string }
export interface ArcCandidate {
  lemma?: string; pos?: string; morph: ArcMorph; confidence: number; gloss?: string; sourceId?: string; origin?: string;
  varieties?: string[]; notes?: Record<string, string | string[]>; parts?: ArcPart[];
}
export interface ArcAnalysis { token: RawToken; analyzer: string; candidates: ArcCandidate[] }
export interface AramaicLexiconEntry {
  headword: string; lemmaId: string; pos: string; glosses: string[]; glossAvailable: boolean; attestedForms: string[];
  references: string[]; frequency: number; source: string;
}
export interface ArcAdapter {
  readonly lang: 'arc'; readonly name: string; readonly script: 'Hebr'; readonly version: string;
  readonly varieties: Record<string, { code: string; label: string; kind: string; note: string }>;
  tokenize(text: string): RawToken[]; normalize(text: string): string; searchNormalize(text: string): string;
  analyze(tokens: RawToken[], options?: { varietyId?: string }): ArcAnalysis[];
}
export declare const ARC_VERSION: string;
export declare const ARC_ANALYZER: string;
export declare const ARC_SOURCE_ID: string;
export declare const ARC_VARIETIES: ArcAdapter['varieties'];
export declare const ARAMAIC_FAMILY: { readonly name: string; readonly supported: readonly string[]; readonly future: readonly string[] };
export declare const ARAMAIC_QUESTIONED_SOURCE_IDS: ReadonlySet<string>;
export declare const arcAdapter: ArcAdapter;
export declare function arcCandidates(token: RawToken): ArcCandidate[];
export declare function arcLexiconLookup(query: string, pos?: string): AramaicLexiconEntry[];
`);
await writeFile(resolve(dirname(output), 'adapter-manifest.json'), JSON.stringify({
  schema: 'golearn-aramaic-adapter@1',
  file: 'adapter.js',
  typesFile,
  sha256,
  sourceRevision,
  sourceChecksums,
  buildTool: { name: 'esbuild', version: esbuild.version, node: process.version },
  standalone: true,
  format: 'browser-esm',
  licenseFile: 'LICENSE.txt',
  exports: ['ARC_VERSION', 'ARC_ANALYZER', 'ARC_SOURCE_ID', 'ARC_VARIETIES', 'ARAMAIC_FAMILY', 'ARAMAIC_QUESTIONED_SOURCE_IDS', 'arcAdapter', 'arcCandidates', 'arcLexiconLookup'],
  contract: { language: 'arc', variety: 'arc-bib', scope: ['GEN.31.47', 'DAN.2.4b-DAN.7.28', 'EZR.4.8-EZR.7.26', 'JER.10.11'], occurrences: 4828 },
  excludedRuntime: ['Repository', 'learner progress', 'SRS scheduler'],
}, null, 2) + '\n');
await writeFile(resolve(dirname(output), 'LICENSE.txt'), `GoLearn Biblical Aramaic portable adapter and source data\n\nThe original work of the Open Scriptures Hebrew Bible Project is available at https://github.com/openscriptures/morphhb . The Open Scriptures HebrewLexicon project is at https://github.com/openscriptures/HebrewLexicon . The Westminster Leningrad Codex base text and Strong's original dictionary text are public domain. OSHB lemma/morphology annotations and HebrewLexicon HebrewStrong and LexicalIndex transcription are licensed CC BY 4.0 (https://creativecommons.org/licenses/by/4.0/). Credit the Open Scriptures Hebrew Bible Project.\n\nThis bundle includes an adaptation of 4,828 A-coded qere-path words in 269 Biblical Aramaic verses. It retains source word IDs and morphology, indexes attested forms, and marks 11 questioned annotations for review. Glosses are available for 4,802 occurrences; H3390 has no source gloss for 26 occurrences. These adaptations do not establish independently reviewed grammatical accuracy.\n\nThe analyzer implementation and bundling modifications are distributed with the GoLearn source. Build tooling is not included in this browser bundle.\n`);
process.stdout.write(`Built standalone browser ESM Aramaic adapter: ${bytes.length} bytes, sha256 ${sha256}\n`);
