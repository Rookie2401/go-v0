import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { runNode } from '../helpers/cli';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { CorpusDocument } from '../../src/ingest';
import { makeEpub, xhtml } from './zip';

const cli = path.resolve('node_modules/vite-node/dist/cli.mjs');
const run = async (...args: string[]) => {
  const r = await runNode([cli, 'scripts/corpus-convert.mts', ...args], { cwd: path.resolve('.'), timeout: 90_000 });
  return { status: r.status, out: r.out };
};

const BOOK = [
  '*** START OF THE PROJECT GUTENBERG EBOOK EL LIBRO ***', '', 'Capítulo I', '',
  'Esa mañana el niño salió de la casa y caminó por el camino que llevaba al río, y su',
  'madre le había dicho que no se detuviera, porque la lluvia podía llegar antes del',
  'mediodía y no había dónde guarecerse en todo el trayecto hasta el puente viejo.', '',
  'Cuando llegó al puente, vio a un hombre que pescaba con una caña muy larga y que',
  'no levantó la vista cuando él pasó, aunque el niño lo saludó dos veces en voz alta',
  'y esperó un poco por si el hombre quería decirle algo sobre el tiempo.', '',
  'Capítulo II', '',
  'Entonces el hombre sonrió y dijo que el puente estaba viejo, pero que todavía',
  'aguantaba, y cruzaron juntos, despacio, mientras el agua corría debajo con un',
  'ruido de piedras que parecía una conversación muy antigua entre dos viejos amigos.', '',
  '*** END OF THE PROJECT GUTENBERG EBOOK EL LIBRO ***', 'Licence text.',
].join('\n');

describe('npm run corpus:convert: Western prose and EPUB', () => {
  let dir: string;
  beforeAll(() => { dir = fs.mkdtempSync(path.join(os.tmpdir(), 'go-convert-w-')); });
  afterAll(() => { fs.rmSync(dir, { recursive: true, force: true }); });
  const read = (file: string) => JSON.parse(fs.readFileSync(file, 'utf8')) as CorpusDocument;
  const paragraphs = (d: CorpusDocument) => d.sections[0].paragraphs.map((p) => (p as { text: string }).text);

  it('a wrapped Spanish book: paragraphs by blank lines, --unwrap, --strip-boilerplate; the quality report and the removed text are kept', async () => {
    const input = path.join(dir, 'libro.txt');
    fs.writeFileSync(input, BOOK, 'utf8');
    const out = path.join(dir, 'libro-out');
    const r = await run(input, '--lang', 'es', '--title', 'El libro', '--author', 'Ana Autora', '--unwrap', '--strip-boilerplate', '--source-kind', 'gutenberg', '--variety', 'es-ES', '--streams', 'library', '--out', out);
    expect(r.status).toBe(0);
    expect(r.out).toMatch(/2 chapters found by headings like "Capítulo I"/);
    expect(r.out).toMatch(/Unwrap joined 6 line breaks/);
    expect(r.out).toMatch(/Removed 2 boilerplate blocks/);
    expect(r.out).toMatch(/source quality: usable/);
    expect(r.out).toMatch(/headings \(line: text\).*Capítulo I/);
    expect(fs.readdirSync(out).sort()).toEqual(['el-libro-ch01.json', 'el-libro-ch02.json', 'removed-boilerplate.txt']);
    const first = read(path.join(out, 'el-libro-ch01.json'));
    expect(paragraphs(first)).toHaveLength(2);
    expect(paragraphs(first)[0]).toMatch(/^Esa mañana el niño salió de la casa y caminó .* y su madre le había dicho/);
    expect(first).toMatchObject({ lang: 'es', variety: 'es-ES', streams: ['library'], source: { author: 'Ana Autora', rights: 'personal-copy' }, quality: { checkedWith: 'quality@1' } });
    expect(fs.readFileSync(path.join(out, 'removed-boilerplate.txt'), 'utf8')).toMatch(/START OF THE PROJECT GUTENBERG[\s\S]*END OF THE PROJECT GUTENBERG[\s\S]*Licence text\./);
    expect(paragraphs(first).join(' ')).not.toMatch(/Gutenberg/); // (the quality report keeps a sample of what it found)

    // the files validate with the ordinary command
    const v = await runNode([cli, 'scripts/corpus-validate.mts', out], { cwd: path.resolve('.'), timeout: 90_000 });
    expect(v.status).toBe(0);
  }, 120_000);

  it('the correction path: --headings takes the corrected line numbers', async () => {
    const input = path.join(dir, 'libro2.txt');
    fs.writeFileSync(input, BOOK, 'utf8');
    const out = path.join(dir, 'libro2-out');
    const r = await run(input, '--lang', 'es', '--title', 'El libro', '--headings', '3', '--strip-boilerplate', '--out', out);
    expect(r.status, r.out).toBe(0);
    expect(fs.readdirSync(out).sort()).toEqual(['el-libro-ch01.json', 'removed-boilerplate.txt']);
    expect((await run(input, '--lang', 'es', '--title', 'El libro', '--headings', 'x')).out).toMatch(/--headings is a comma-separated list/);
    expect((await run(input, '--lang', 'es', '--title', 'El libro', '--paragraphs', 'sideways')).out).toMatch(/--paragraphs must be/);
  }, 120_000);

  it('an EPUB is read where it is and converted; a protected one is refused (exit 1) and nothing is written', async () => {
    const epub = makeEpub({
      title: 'Cuentos', author: 'Ana Autora', language: 'es',
      pages: [
        { id: 'a', href: 'a.xhtml', html: xhtml('<h1>Capítulo I</h1><p>Había una vez un zorro que vivía en el monte.</p>') },
        { id: 'b', href: 'b.xhtml', html: xhtml('<h1>Capítulo II</h1><p>La luna salió tarde esa noche.</p>') },
      ],
    });
    const file = path.join(dir, 'cuentos.epub');
    fs.writeFileSync(file, epub);
    const out = path.join(dir, 'epub-out');
    const r = await run(file, '--lang', 'es', '--out', out);
    expect(r.status, r.out).toBe(0);
    expect(fs.readdirSync(out).sort()).toEqual(['cuentos-ch01.json', 'cuentos-ch02.json']);
    expect(paragraphs(read(path.join(out, 'cuentos-ch02.json')))).toEqual(['La luna salió tarde esa noche.']);

    const locked = makeEpub({ pages: [{ id: 'a', href: 'a.xhtml', html: xhtml('<p>x</p>') }], title: 'Cerrado', extra: [{ name: 'META-INF/rights.xml', data: '<rights/>' }] });
    const lockedFile = path.join(dir, 'cerrado.epub');
    fs.writeFileSync(lockedFile, locked);
    const refused = await run(lockedFile, '--lang', 'es', '--out', path.join(dir, 'locked-out'));
    expect(refused.status).toBe(1);
    expect(refused.out).toMatch(/protected.*does not remove protection.*[encrypted]/s);
    expect(fs.existsSync(path.join(dir, 'locked-out'))).toBe(false);
  }, 120_000);

  it('a Spanish work of the ladder can be named with --work', async () => {
    const input = path.join(dir, 'x.txt');
    fs.writeFileSync(input, 'Una línea.', 'utf8');
    const r = await run(input, '--lang', 'es', '--work', 'no-such-spanish-work');
    expect(r.status).toBe(1);
    expect(r.out).toMatch(/unknown work "no-such-spanish-work" for es\. Works in the ladder: /);
  }, 120_000);
});
