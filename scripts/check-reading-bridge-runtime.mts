import fs from 'node:fs';
import path from 'node:path';
import { createMemoryStore, type LanguageCode, type Work } from '../src/core';
import { createAdapterRegistry } from '../src/adapters';
import { createCourseCatalog } from '../src/course';
import { createLibrary } from '../src/library';
import { readingBridgeWorks } from '../src/course/readingBridges';
import { MODERN_ALBANIAN_WORKS } from '../src/course/modernAlbanian';

const root = path.resolve('public/library');
const fileFetch = (async (input: RequestInfo | URL) => {
  const url = new URL(input instanceof Request ? input.url : String(input), 'https://local.test');
  const file = path.resolve(root, url.pathname.replace(/^\/library\//, ''));
  if (!file.startsWith(root + path.sep) || !fs.existsSync(file)) return new Response('', { status: 404 });
  return new Response(fs.readFileSync(file, 'utf8'), { headers: { 'Content-Type': 'application/json' } });
}) as typeof fetch;

for (const lang of ['de', 'es', 'hi', 'sq'] as LanguageCode[]) {
  const store = createMemoryStore();
  const library = createLibrary({ store, adapters: createAdapterRegistry(), fetch: fileFetch });
  const works: Work[] = lang === 'sq' ? MODERN_ALBANIAN_WORKS : readingBridgeWorks(lang);
  const catalog = createCourseCatalog({ store });
  if (works[0]) await catalog.install(works[0].courseId);
  let opened = 0;
  for (const work of works) {
    const page = await library.search({ lang, workId: work.id, publishedOnly: true, limit: 200 });
    if (!page.items.length) throw new Error(`${work.id}: no published reading available`);
    const sample = lang === 'sq' ? [...new Map([page.items[0], page.items.at(-1)!].map((item) => [item.id, item])).values()] : [page.items[0]];
    for (const item of sample) {
      const before = await store.texts.count();
      const profile = await library.profile(item.id);
      if (!profile || profile.words <= 0) throw new Error(`${item.id}: missing lexical profile`);
      if ((await store.texts.count()) !== before) throw new Error(`${item.id}: profiling eagerly imported a book`);
      const text = await library.open(item.id);
      if (!text.published || text.workId !== work.id || text.lang !== lang) throw new Error(`${item.id}: reader import lost publication or work identity`);
      if (!(await store.sentences.where('textId', text.id)).length) throw new Error(`${item.id}: reader has no sentences`);
      opened++;
    }
  }
  console.log(`${lang}: ${works.length} new works, ${opened} reader opens passed`);
}
