/**
 * PackRuntime.entry reads the full records of any build side by side: full-1 (plain), full-2 gzipped at rest and full-2 plain
 * give the same answer for the same lemma (the shape the browser extension's enrich.ts consumes does not change).
 */
import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { createAdapterRegistry } from '../../src/adapters';
import { buildDictionary } from '../../src/dict';
import { buildFullFile } from '../../src/dict/build-full';
import { albanianManifest, createPackRuntime } from '../../packages/language-packs/src';
import { tmpDir, writeBuild } from '../dict/helpers';
import { BASE, diskFetch } from './helpers';

const sqNormalize = (s: string): string => createAdapterRegistry().get('sq').normalize(s);
const line = (o: unknown): string => JSON.stringify(o);
const lines = [
  line({
    pos: 'noun', word: 'libër', lang_code: 'sq',
    forms: [{ form: 'libra', tags: ['plural'] }, { form: 'librin', tags: ['accusative', 'definite', 'singular'], source: 'declension' }, { form: 'libri', tags: ['definite', 'nominative', 'singular'], source: 'declension' }],
    sounds: [{ ipa: '/ˈlibəɾ/' }, { audio: 'Sq-liber.ogg', ogg_url: 'https://upload.wikimedia.org/wikipedia/commons/a/ab/Sq-liber.ogg', tags: ['Albania'] }],
    etymology_text: 'From Latin liber.', etymology_templates: [{ name: 'bor', args: { '1': 'sq', '2': 'la', '3': 'liber' } }],
    senses: [{ glosses: ['book'], tags: ['masculine'] }],
  }),
  line({ pos: 'noun', word: 'librin', lang_code: 'sq', senses: [{ glosses: ['definite accusative singular of libër'], form_of: [{ word: 'libër' }], tags: ['form-of'] }] }),
];

async function installed(opts: { schema: 'full-1' | 'full-2'; gzip?: boolean }): Promise<string> {
  const root = tmpDir('go-rt-full2-');
  writeBuild(path.join(root, 'dict'), buildDictionary(lines, { lang: 'sq', normalize: sqNormalize, date: '2026-10-17' }), 'sq');
  const input = path.join(root, 'in.jsonl');
  fs.writeFileSync(input, lines.join('\n') + '\n');
  await buildFullFile({ input, lang: 'sq', outDir: path.join(root, 'dict'), date: '2026-10-17', normalize: sqNormalize, ...opts });
  return root;
}

describe('PackRuntime.entry over full-1 and full-2 builds', () => {
  it('answers identically, and says which layout it read', async () => {
    const builds = {
      one: await installed({ schema: 'full-1' }),
      gz: await installed({ schema: 'full-2', gzip: true }),
      plain: await installed({ schema: 'full-2', gzip: false }),
    };
    const answers: unknown[] = [];
    for (const [name, root] of Object.entries(builds)) {
      const f = diskFetch(root);
      const rt = createPackRuntime(albanianManifest(), { fetch: f, baseUrl: BASE });
      const e = await rt.entry('libër', 'NOUN');
      expect(e?.records[0]).toMatchObject({ w: 'libër', p: 'NOUN', ety: { text: 'From Latin liber.' }, s: [{ g: 'book', t: ['masculine'] }] });
      expect(e?.records[0].f).toHaveLength(3);
      expect(e?.records[0].f?.[1]).toEqual({ f: 'librin', t: ['accusative', 'definite', 'singular'], s: 'declension' });
      expect(e?.records[0].audio).toEqual([{ u: 'https://upload.wikimedia.org/wikipedia/commons/a/ab/Sq-liber.ogg', n: 'Sq-liber.ogg', t: ['Albania'] }]);
      const viaForm = await rt.entry('librin', 'NOUN');
      expect(viaForm?.via?.lemma).toBe('libër');
      answers.push(JSON.parse(JSON.stringify(e)), JSON.parse(JSON.stringify(viaForm)));
      const shards = f.calls.filter((u) => /\/full\/f-[0-9a-f]+\.json/.test(u));
      expect(shards.length).toBeGreaterThan(0);
      expect(shards.every((u) => (name === 'gz' ? /\.json\.gz\?v=[0-9a-f]{12}$/ : name === 'plain' ? /\.json\?v=[0-9a-f]{12}$/ : /\.json$/).test(u))).toBe(true);
    }
    expect(answers[2]).toEqual(answers[0]);
    expect(answers[4]).toEqual(answers[0]);
    expect(answers[3]).toEqual(answers[1]);
    expect(answers[5]).toEqual(answers[1]);
  });
});
