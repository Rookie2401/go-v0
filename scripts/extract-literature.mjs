import fs from 'node:fs';
for (const [lang, file] of [['hi', 'src/course/hindi.ts'], ['sq', 'src/course/albanian.ts']]) {
  const s = fs.readFileSync(file, 'utf8'); const out = [];
  for (const m of s.matchAll(/\{ slug: '([^']+)'[^\n]*?title: (?:'([^']+)'|"([^"]+)")([^\n]*)/g)) {
    const x = m[1];
    if (/^(audio|ncert|rowling|kalam|bachchan|bharati|sahni|renu|shukla-raag|yashpal|kadare|agolli|marko|noli)/.test(x)) continue;
    out.push({ slug: x, title: m[2] ?? m[3], line: m[0] });
  }
  fs.writeFileSync(`work-${lang}.json`, JSON.stringify(out, null, 2)); console.log(lang, out.length);
}
