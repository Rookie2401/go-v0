// Step 1 of scripts/latin-build-closed.mjs. Run from the Romance app folder, or pass --root <Romance folder> / ROMANCE_ROOT.
// Reads that app's src/lexicon and writes only the requested JSON output.
import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

const SOURCE_MODULES = {
  pronouns: 'src/lexicon/pronouns.ts',
  numerals: 'src/lexicon/numerals.ts',
  particles: 'src/lexicon/particles.ts',
  prepositions: 'src/lexicon/prepositions.ts',
  irregular: 'src/lexicon/irregular.ts',
} as const;

function argumentsOf(argv: string[]): { root?: string; output?: string } {
  let root: string | undefined;
  let output: string | undefined;
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === '--root') {
      root = argv[++i];
      if (!root) throw new Error('--root requires a Romance project folder.');
    } else if (arg.startsWith('--root=')) {
      root = arg.slice('--root='.length);
      if (!root) throw new Error('--root requires a Romance project folder.');
    } else if (arg.startsWith('-')) {
      throw new Error(`Unknown option ${arg}. Use --root <Romance folder> and an optional output path.`);
    } else if (output === undefined) output = arg;
    else throw new Error(`Unexpected argument ${arg}.`);
  }
  return { root, output };
}

function sourceRoot(explicitRoot?: string): string {
  const root = path.resolve(explicitRoot ?? process.env.ROMANCE_ROOT ?? process.cwd());
  const missing = Object.values(SOURCE_MODULES).filter((relative) => !fs.existsSync(path.join(root, relative)));
  if (missing.length) {
    throw new Error(
      `Romance lexicon source files were not found under ${root} (missing: ${missing.join(', ')}). ` +
      'Run from the Romance project folder, set ROMANCE_ROOT, or pass --root <Romance folder>.',
    );
  }
  return root;
}

const strip = (s: string) => s.normalize('NFD').replace(/[\u0304\u0306]/g, '').normalize('NFC');

async function main(): Promise<void> {
  const args = argumentsOf(process.argv.slice(2));
  const root = sourceRoot(args.root);
  // Absolute file URLs keep resolution portable across Windows, macOS, and Linux. vite-node transforms the source modules.
  const load = async (relative: string): Promise<Record<string, any>> =>
    await import(pathToFileURL(path.join(root, relative)).href) as Record<string, any>;

  let pronouns: Record<string, any>, numerals: Record<string, any>, particles: Record<string, any>;
  let prepositions: Record<string, any>, irregular: Record<string, any>;
  try {
    [pronouns, numerals, particles, prepositions, irregular] = await Promise.all(
      Object.values(SOURCE_MODULES).map(load),
    );
  } catch (error) {
    const detail = error instanceof Error ? error.message : String(error);
    throw new Error(`Could not load Romance lexicon modules from ${root}. Check the source checkout and run with vite-node. ${detail}`);
  }

  const { PRONOUNS } = pronouns;
  const { NUMERALS } = numerals;
  const { PARTICLES, ENCLITICS } = particles;
  const { PREPOSITIONS } = prepositions;
  const { IRREGULAR_VERBS } = irregular;
  const out: any = {};
  for (const [k, list] of Object.entries({ PRONOUNS, NUMERALS, PARTICLES, ENCLITICS, PREPOSITIONS, IRREGULAR_VERBS })) {
    out[k] = (list as any[]).map((l) => ({ key: l.key, lemma: strip(l.lemma), pos: l.pos, gloss: l.gloss, gender: l.gender, pronoun_type: l.pronoun_type, governs: l.governs, forms: l.forms.map((f: any) => ({ s: strip(f.surface), f: f.features })) }));
  }
  fs.writeFileSync(args.output ?? 'closed.json', JSON.stringify(out));
  console.log(Object.fromEntries(Object.entries(out).map(([k, v]: any) => [k, [v.length, v.reduce((a: number, l: any) => a + l.forms.length, 0)]])));
}

void main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
});
