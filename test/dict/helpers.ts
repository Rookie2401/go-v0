import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createAdapterRegistry } from '../../src/adapters';
import type { DictionaryEntry } from '../../src/core';
import { buildDictionary, type BuildOutput } from '../../src/dict';

export const FIXTURE = path.resolve('test/dict/fixtures/kaikki-th-sample.jsonl');
export const DATE = '2026-09-30';
export const thNormalize = (s: string) => createAdapterRegistry().get('th').normalize(s);

/** The fixture split into lines the way readline sees them (the final newline does not start a line). */
export function fixtureLines(): string[] {
  const lines = fs.readFileSync(FIXTURE, 'utf8').split(/\r?\n/);
  if (lines[lines.length - 1] === '') lines.pop();
  return lines;
}

export const buildFixture = (date = DATE): BuildOutput => buildDictionary(fixtureLines(), { lang: 'th', normalize: thNormalize, date });

export const tmpDir = (prefix = 'go-dict-') => fs.mkdtempSync(path.join(os.tmpdir(), prefix));

/** Write a built dictionary's files to `<root>/th/` (what the CLI does) so file and fetch sources can read it. */
export function writeBuild(root: string, out: BuildOutput, lang = 'th'): string {
  const dir = path.join(root, lang);
  fs.mkdirSync(dir, { recursive: true });
  for (const [name, text] of out.files) fs.writeFileSync(path.join(dir, name), text, 'utf8');
  return dir;
}

export const byPos = (entries: DictionaryEntry[] | undefined, pos: string) => entries?.find((e) => e.pos === pos);

/** A fake `fetch` over an in-memory map of URL -> body (status 200) with a request log; unknown URLs are 404. */
export function fakeFetch(files: Map<string, string>, overrides: Record<string, () => Response | Promise<Response>> = {}) {
  const log: string[] = [];
  const impl = (async (input: RequestInfo | URL) => {
    const url = String(input);
    log.push(url);
    if (overrides[url]) return overrides[url]();
    const body = files.get(url);
    return body === undefined ? new Response('not found', { status: 404 }) : new Response(body, { status: 200 });
  }) as typeof fetch;
  return { fetch: impl, log };
}

/** Publish a build under a URL prefix for fakeFetch. */
export function filesAt(prefix: string, out: BuildOutput, lang = 'th'): Map<string, string> {
  return new Map([...out.files].map(([name, text]) => [`${prefix}/${lang}/${name}`, text]));
}
