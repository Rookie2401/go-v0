/** Read-only Hindi corpus redundancy audit. */
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';

type AnyDoc = { id?: string; lang?: string; title?: string; work?: { slug?: string; chapter?: { index?: number } }; sections?: { paragraphs?: ({ text?: string; sentences?: { text?: string }[] })[] }[] };
type Hit = { id: string; file: string; work?: string; chapter?: number; title?: string; chars: number };

const repo = path.resolve('.');
const walk = (dir: string): string[] => fs.existsSync(dir) ? fs.readdirSync(dir, { withFileTypes: true }).flatMap((e) => e.isDirectory() ? walk(path.join(dir, e.name)) : [path.join(dir, e.name)]) : [];
const read = (file: string): AnyDoc => JSON.parse(fs.readFileSync(file, 'utf8')) as AnyDoc;
const body = (d: AnyDoc) => (d.sections ?? []).flatMap((s) => (s.paragraphs ?? []).flatMap((p) => p.sentences ? p.sentences.map((x) => x.text ?? '') : [p.text ?? ''])).join('\n').normalize('NFC').replace(/\s+/g, ' ').trim();
const hash = (d: AnyDoc) => crypto.createHash('sha256').update(body(d)).digest('hex');
const hit = (file: string, d: AnyDoc): Hit => ({ id: d.id ?? '(missing)', file: path.relative(repo, file).replaceAll(path.sep, '/'), work: d.work?.slug, chapter: d.work?.chapter?.index, title: d.title, chars: body(d).length });
const groups = (files: string[]) => {
  const byBody = new Map<string, Hit[]>(); const byId = new Map<string, Hit[]>();
  for (const file of files) { const d = read(file); const h = hit(file, d); const b = hash(d); (byBody.get(b) ?? byBody.set(b, []).get(b)!).push(h); (byId.get(h.id) ?? byId.set(h.id, []).get(h.id)!).push(h); }
  return { files: files.length, bodyDuplicateGroups: [...byBody.values()].filter((x) => x.length > 1), idDuplicateGroups: [...byId.values()].filter((x) => x.length > 1) };
};

const installed = walk(path.join(repo, 'public/library/hi/t')).filter((f) => f.endsWith('.json'));
const bundled = walk(path.join(repo, 'data/corpus/hi')).filter((f) => f.endsWith('.json'));
const sourceFiles = [
  ...walk(path.join(repo, 'data/sources/hi-literature')).filter((f) => f.endsWith('.json') && !f.endsWith('research.json') && !f.endsWith('library-manifest.json')),
  ...walk(path.join(repo, 'data/sources/hi-literature-bridge')).filter((f) => f.endsWith('.json') && !f.endsWith('source-research.json') && !f.endsWith('library-manifest.json')),
];
const installedAudit = groups(installed);
const residentAudit = groups([...installed, ...bundled]);
const sourceAudit = groups(sourceFiles);
const report = {
  generatedAt: new Date().toISOString(), language: 'hi',
  installed: installedAudit, resident: residentAudit, literarySources: sourceAudit,
  intentionalAliases: residentAudit.bodyDuplicateGroups.filter((g) => g.every((h) => h.work === 'bible-hindi') && g.some((h) => h.id.endsWith('-complete'))),
  possibleNonScriptureDuplicates: residentAudit.bodyDuplicateGroups.filter((g) => !g.every((h) => h.work === 'bible-hindi')),
};
const out = path.join(repo, 'data/review/library-audit/hi-duplicates.json');
fs.mkdirSync(path.dirname(out), { recursive: true }); fs.writeFileSync(out, JSON.stringify(report, null, 2) + '\n');
console.log(JSON.stringify({ installed: installedAudit.files, installedBodyDuplicateGroups: installedAudit.bodyDuplicateGroups.length, installedIdDuplicateGroups: installedAudit.idDuplicateGroups.length, resident: residentAudit.files, residentBodyDuplicateGroups: residentAudit.bodyDuplicateGroups.length, literarySources: sourceAudit.files, literarySourceBodyDuplicateGroups: sourceAudit.bodyDuplicateGroups.length, intentionalAliases: report.intentionalAliases.length, possibleNonScriptureDuplicates: report.possibleNonScriptureDuplicates.length, report: path.relative(repo, out).replaceAll(path.sep, '/') }, null, 2));
