/** Compact the chapter-shaped importer output into one lazy-loadable document per book.
 * Existing five Hindi Scripture chapter ids remain stable; their chapters are omitted from
 * the corresponding book document to avoid duplicate verse identities. */
import fs from 'node:fs';
import path from 'node:path';
const OUT = 'data/corpus/hi';
const keep = new Set(['bible-gen-1', 'bible-psa-1', 'bible-psa-23', 'bible-mrk-1', 'bible-1john-1']);
const files = fs.readdirSync(OUT).filter((x) => /^bible-(?!book-)[a-z0-9-]+\.json$/.test(x));
const docs = files.map((f) => JSON.parse(fs.readFileSync(path.join(OUT, f), 'utf8')));
const groups = new Map();
for (const d of docs) {
  if (keep.has(d.id)) continue;
  const book = d.scripture?.book;
  if (!book) continue;
  if (!groups.has(book)) groups.set(book, []);
  groups.get(book).push(d);
}
for (const d of docs) if (!keep.has(d.id) && d.scripture?.book) fs.unlinkSync(path.join(OUT, `${d.id}.json`));
let order = 0;
for (const [book, chapters] of groups) {
  chapters.sort((a, b) => a.scripture.chapter - b.scripture.chapter);
  const first = chapters[0];
  const id = `bible-book-${book.toLowerCase()}`;
  const doc = {
    ...first,
    id,
    title: first.title.replace(/\s+\d+$/, ''),
    work: { slug: 'bible-hindi', chapter: { index: ++order, title: first.title.replace(/\s+\d+$/, '') } },
    sections: chapters.flatMap((d) => d.sections),
    topics: ['scripture', book.toLowerCase()],
  };
  fs.writeFileSync(path.join(OUT, `${id}.json`), `${JSON.stringify(doc, null, 2)}\n`);
}
console.log(`${groups.size} book documents written; retained ${keep.size} existing chapter documents`);
