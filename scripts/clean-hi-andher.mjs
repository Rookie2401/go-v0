import fs from 'node:fs';
const file = 'data/sources/hi-literature/bharatendu-andher-nagari.json';
let raw = fs.readFileSync(file, 'utf8');
raw = raw.replace(/\\\\n\\s*$/, '');
const docs = JSON.parse(raw);
const doc = docs[0];
for (const section of doc.sections) {
  for (const paragraph of section.paragraphs) {
    for (const sentence of paragraph.sentences) {
      sentence.text = sentence.text.split('\n').filter((line) => !/^\s*[←→]/.test(line) && !line.includes('भारतेंदु-नाटकावली') && !line.includes('द्वारा भारतेन्दु') && !/^\s*15349\d/.test(line)).join('\n').trim();
    }
  }
  section.paragraphs = section.paragraphs.filter((p) => p.sentences.some((s) => s.text));
}
doc.review = { status: 'reviewed', level: 'linguistic-check', reviewedBy: 'scripts/acquire-hi-andher-nagari.mjs', reviewedAt: '2026-10-01', notes: 'Source-fidelity and completeness check only; six Wikisource act pages retrieved, navigation removed, no native-language editorial claim.' };
fs.writeFileSync(file, JSON.stringify(docs, null, 2) + '\n');
const words = doc.sections.reduce((n, s) => n + s.paragraphs.reduce((m, p) => m + p.sentences.reduce((k, x) => k + x.text.split(/\s+/).filter(Boolean).length, 0), 0), 0);
console.log(JSON.stringify({ sections: doc.sections.length, paragraphs: doc.sections.reduce((n, s) => n + s.paragraphs.length, 0), words }));
