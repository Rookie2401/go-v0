// One-off: exports the existing German ladder units (data/ladder/de/units/*.json) into authoring text files
// (authoring/<stage>/<unit id>.txt) in the format described in README.txt. Run once from the repository root.
import fs from 'node:fs';
import path from 'node:path';
const root = 'data/ladder/de';
const lad = JSON.parse(fs.readFileSync(path.join(root, 'ladder.json'), 'utf8'));
for (const u of lad.units) {
  if (u.kind !== 'controlled') continue;
  const d = JSON.parse(fs.readFileSync(path.join(root, u.document), 'utf8'));
  const out = [`=== ${d.id}`];
  const sp = Object.entries(d.speakers ?? {}).map(([k, v]) => `${k}=${v}`).join(', ');
  if (sp) out.push(`speakers: ${sp}`);
  for (const s of d.sections) {
    out.push(`## ${s.title}`);
    s.paragraphs.forEach((p, i) => {
      if (i) out.push('');
      for (const x of p.sentences) out.push(`${x.speaker ? `[${x.speaker}] ` : ''}${x.text} || ${x.english}`);
    });
    out.push('');
  }
  const dir = path.join(root, 'authoring', u.stage);
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(path.join(dir, `${d.id}.txt`), out.join('\n') + '\n');
}
console.log('exported');
