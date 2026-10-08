/// <reference types="node" />
// Shared by the authoring tools: the German ladder read from the AUTHORING files (authoring/<stage>/<unit id>.txt are the truth for the
// a1-1 ... a2-2 units and the new b1-bridge units; authentic units are library texts named in authoring/bridge-order.json).
import fs from 'node:fs';
import path from 'node:path';
import { createAdapterRegistry } from '../../../../src/adapters';
import { loadLadder, resolveTextDocument } from '../../../../src/ladder';
import { documentSentences, isNameGuess, isAbbreviation } from '../../../../src/ladder/analyse';

export const root = path.resolve('.');
export const dir = path.join(root, 'data/ladder/de');
export const adapter = createAdapterRegistry().get('de');

export interface Sent { speaker?: string; text: string; english: string }
export interface UnitText { id: string; stage: string; kind: 'controlled' | 'authentic'; sections: Array<{ title: string; paragraphs: Sent[][] }>; textId?: string; file?: string }

export function parseTxt(file: string): UnitText['sections'] {
  const sections: UnitText['sections'] = [];
  for (const raw of fs.readFileSync(file, 'utf8').replace(/\r/g, '').split('\n')) {
    const line = raw.trimEnd();
    if (line.startsWith('//') || line.startsWith('=== ') || line.startsWith('speakers:') || line.startsWith('note:')) continue;
    if (line.startsWith('## ')) { sections.push({ title: line.slice(3), paragraphs: [[]] }); continue; }
    if (line.trim() === '') { const s = sections.at(-1); if (s && s.paragraphs.at(-1)!.length) s.paragraphs.push([]); continue; }
    if (!sections.length) sections.push({ title: '', paragraphs: [[]] });
    const m = /^(?:\[([A-Za-z0-9]+)\]\s*)?(.+?) \|\| (.+)$/.exec(line);
    if (!m) throw new Error(`${file}: cannot read line: ${line}`);
    sections.at(-1)!.paragraphs.at(-1)!.push({ ...(m[1] ? { speaker: m[1] } : {}), text: m[2], english: m[3] });
  }
  return sections;
}

/** The ladder order: a1-1 ... a2-2 from ladder.json (stage != b1-bridge), then authoring/bridge-order.json. */
export function authoringOrder(): UnitText[] {
  const lad = JSON.parse(fs.readFileSync(path.join(dir, 'ladder.json'), 'utf8'));
  const out: UnitText[] = [];
  for (const u of lad.units.filter((x: any) => x.stage !== 'b1-bridge')) {
    const file = path.join(dir, 'authoring', u.stage, `${u.id}.txt`);
    out.push({ id: u.id, stage: u.stage, kind: 'controlled', sections: parseTxt(file), file });
  }
  const bo = path.join(dir, 'authoring/bridge-order.json');
  if (fs.existsSync(bo)) for (const o of JSON.parse(fs.readFileSync(bo, 'utf8'))) {
    if (o.kind === 'authentic') out.push({ id: o.id, stage: 'b1-bridge', kind: 'authentic', sections: [], textId: o.textId });
    else { const file = path.join(dir, 'authoring/b1-bridge', `${o.id}.txt`); out.push({ id: o.id, stage: 'b1-bridge', kind: 'controlled', sections: fs.existsSync(file) ? parseTxt(file) : [], file }); }
  }
  return out;
}

export const docOf = (u: UnitText): any => {
  if (u.kind === 'authentic') { const f = resolveTextDocument('de', root, u.textId!); if (!f.doc) throw new Error(`${u.textId}: ${f.problem}`); return f.doc; }
  return { lang: 'de', id: u.id, sections: u.sections.map((s) => ({ title: s.title, paragraphs: s.paragraphs.filter((p) => p.length).map((p) => ({ sentences: p })) })) };
};

export function headDocs(): any[] { return loadLadder('de', root).head.map((h) => h.doc); }

export type Info = { count: number; forms: Record<string, number>; first: string };
export function analyse(doc: any): { words: number; auto: number; lem: Map<string, Info>; sentences: Array<{ text: string; unknown?: string[] }> } {
  const lem = new Map<string, Info>();
  let words = 0, auto = 0;
  for (const s of documentSentences(adapter, doc)) {
    for (const x of adapter.analyze(adapter.tokenize(s))) {
      if (!x.token.isWord) continue;
      words++;
      const c: any = x.candidates[0];
      const norm = x.token.normalized.toLowerCase();
      if ((c?.pos === 'PROPN' && !isNameGuess(c)) || c?.pos === 'NUM' || isAbbreviation(c) || /^\p{N}+$/u.test(norm)) { auto++; continue; }
      const l = (c?.lemma ?? norm).normalize('NFC').toLowerCase();
      let i = lem.get(l); if (!i) lem.set(l, (i = { count: 0, forms: {}, first: s }));
      i.count++; i.forms[norm] = (i.forms[norm] ?? 0) + 1;
    }
  }
  return { words, auto, lem, sentences: [] };
}
export { documentSentences };
