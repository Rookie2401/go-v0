import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { runNode } from '../helpers/cli';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { plainTextToDocuments, type CorpusDocument } from '../../src/ingest';
import { CAT, SCHOOL, workBySlug } from './book';

const cli = path.resolve('node_modules/vite-node/dist/cli.mjs');
const run = async (...args: string[]) => {
  const r = await runNode([cli, 'scripts/corpus-convert.mts', ...args], { cwd: path.resolve('.'), timeout: 90_000 });
  return { status: r.status, out: r.out };
};
const BOOK = ['﻿บทที่ ๑', SCHOOL, CAT, '', `  ${SCHOOL}  `, 'บทที่ ๒ ฝนตก', CAT].join('\r\n');

describe('npm run corpus:convert', () => {
  let dir: string;
  beforeAll(() => { dir = fs.mkdtempSync(path.join(os.tmpdir(), 'go-convert-')); });
  afterAll(() => { fs.rmSync(dir, { recursive: true, force: true }); });
  const book = (name = 'book.txt', text = BOOK) => { const p = path.join(dir, name); fs.writeFileSync(p, text, 'utf8'); return p; };
  const read = (file: string) => JSON.parse(fs.readFileSync(file, 'utf8')) as CorpusDocument;

  it('writes one validated JSON document per chapter, and the text is exactly the book', async () => {
    const out = path.join(dir, 'out');
    const r = await run(book(), '--lang', 'th', '--work', 'mana-mani-1', '--copy-note', 'test copy', '--out', out);
    expect(r.status).toBe(0);
    expect(r.out).toMatch(/2 chapters found by headings/);
    expect(r.out).toMatch(/would publish: yes/);
    expect(r.out).toMatch(/wrote 2 document\(s\)/);
    expect(fs.readdirSync(out).sort()).toEqual(['mana-mani-1-ch01.json', 'mana-mani-1-ch02.json']);

    const expected = plainTextToDocuments(BOOK, { lang: 'th', work: workBySlug('mana-mani-1'), copyNote: 'test copy' }).documents;
    expect(fs.readdirSync(out).sort().map((f) => read(path.join(out, f)))).toEqual(JSON.parse(JSON.stringify(expected)));
    const first = read(path.join(out, 'mana-mani-1-ch01.json'));
    expect((first.sections[0].paragraphs as Array<{ text: string }>).map((p) => p.text)).toEqual([SCHOOL, CAT, SCHOOL]);
    expect(first.source).toMatchObject({ rights: 'personal-copy', authorship: 'published' });

    // the files pass the ordinary validator command too
    const v = await runNode([cli, 'scripts/corpus-validate.mts', out], { cwd: path.resolve('.'), timeout: 90_000 });
    expect(v.status).toBe(0);
    expect(`${v.stdout}`).toMatch(/would publish: yes/);
  }, 120_000);

  it('--title and --chapters none: a free-standing single document', async () => {
    const out = path.join(dir, 'single');
    const r = await run(book('b2.txt'), '--lang', 'th', '--title', 'My Own Book', '--chapters', 'none', '--out', out);
    expect(r.status).toBe(0);
    expect(fs.readdirSync(out)).toEqual(['my-own-book-ch01.json']);
    const d = read(path.join(out, 'my-own-book-ch01.json'));
    expect(d.work).toBeUndefined();
    expect(d.title).toBe('My Own Book');
  }, 120_000);

  it('refuses to write inside data/corpus: personal copies are never bundled', async () => {
    const target = path.resolve('data/corpus/th/zz-convert-test-never-created');
    for (const out of ['data/corpus/th/zz-convert-test-never-created', 'data/corpus', target]) {
      const r = await run(book(), '--lang', 'th', '--work', 'mana-mani-1', '--out', out);
      expect(r.status, out).toBe(1);
      expect(r.out, out).toMatch(/personal copies are never bundled/);
    }
    expect(fs.existsSync(target)).toBe(false);
    expect(fs.existsSync(path.resolve('data/corpus/mana-mani-1-ch01.json'))).toBe(false);
    expect(fs.existsSync(path.resolve('data/corpus/th/mana-mani-1-ch01.json'))).toBe(false);
  }, 120_000);

  it('writes nothing when a document does not validate (wrong --lang)', async () => {
    const out = path.join(dir, 'wrong-lang');
    const r = await run(book(), '--lang', 'es', '--title', 'Libro', '--out', out);
    expect(r.status).toBe(1);
    expect(r.out).toMatch(/language-mismatch/);
    expect(r.out).toMatch(/nothing written/);
    expect(fs.existsSync(out)).toBe(false);
  }, 120_000);

  it('usage errors exit 1 with a clear message', async () => {
    const file = book();
    expect((await run()).out).toMatch(/expected exactly one text file/);
    expect((await run(file, '--work', 'mana-mani-1')).out).toMatch(/--lang is required/);
    expect((await run(file, '--lang', 'th')).out).toMatch(/give --work/);
    const unknown = await run(file, '--lang', 'th', '--work', 'no-such-work');
    expect(unknown.status).toBe(1);
    expect(unknown.out).toMatch(/unknown work "no-such-work"/);
    expect(unknown.out).toMatch(/mana-mani-1/); // lists the works there are
    expect((await run(file, '--lang', 'th', '--title', 'T', '--chapters', '([')).out).toMatch(/not a valid regular expression/);
    expect((await run(path.join(dir, 'missing.txt'), '--lang', 'th', '--title', 'T')).out).toMatch(/cannot read/);
    expect((await run(file, '--lang', 'th', '--title', 'T', '--bogus', 'x')).out).toMatch(/unknown option --bogus/);
    expect((await run(book('empty.txt', '\n\n'), '--lang', 'th', '--title', 'T', '--out', path.join(dir, 'empty-out'))).out).toMatch(/nothing to write/);
  }, 240_000);
});
