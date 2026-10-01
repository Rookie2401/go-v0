import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import type { QualityReport, WorkRights } from '../../src/core';
import type { BuildEntry, BuildIO, BuildManifest } from '../../src/library/build';

export const sha = (s: string): string => crypto.createHash('sha256').update(s, 'utf8').digest('hex');

export const PD: WorkRights = {
  state: 'verified-public-domain', copyrightStatus: 'public-domain', permission: 'not-needed', canBundle: true, userImportOnly: false, canModify: false, canStoreOffline: true,
  audiobook: 'none', verified: true, verifiedBy: 'Test Verifier', basis: 'The author died in 1900; the edition is a 1905 printing with no editorial matter.',
};
export const COURSE: WorkRights = {
  state: 'course-authored', copyrightStatus: 'licensed', permission: 'not-needed', canBundle: true, userImportOnly: false, audiobook: 'none', verified: true, verifiedBy: 'course authors',
};

/** Two chapters of plain Spanish prose. */
export const CUENTO = [
  'Capítulo I', '',
  'Había una vez un hombre que vivía en una casa pequeña. El hombre tenía un libro y una mesa.', '',
  'Capítulo II', '',
  'Ana dijo que quería venir. Pedro creyó que era bueno, porque la casa era grande.', '',
].join('\n');

/** A source so damaged by encoding errors that no one should read it. */
export const DANADO = Array.from({ length: 40 }, () => 'El niÃ±o comiÃ³ en la cafÃ© con Ã¡ngeles y mÃ¡s �� � cosas.').join('\n');

/** A course-written document, as a JSON file of CorpusDocuments. */
export const courseDocuments = (generated = true): string => JSON.stringify([{
  schemaVersion: 2, id: 'camino-test-ch01', lang: 'es', title: 'Camino de prueba', contentType: 'story',
  corpus: { id: 'ci-es', kind: 'comprehensible-input', title: 'CI' },
  source: { id: 'src:es:camino-test', title: 'Camino de prueba', attribution: 'Course text', provenance: 'machine-drafted for the course', rights: 'owner-authored', authorship: generated ? 'generated' : 'human' },
  review: { status: 'unreviewed' }, topics: [], editorialTags: ['machine-drafted'], prepTargets: [], generated,
  sections: [{ paragraphs: [{ text: 'Yo soy Ana. Tengo una casa.' }] }],
}]);

export const entry = (over: Partial<BuildEntry> & Pick<BuildEntry, 'slug'>): BuildEntry => ({
  title: over.slug, rights: PD, source: { file: `${over.slug}.txt` }, ...over,
});

/** A manifest with two good works and every kind of refusal. */
export function fixtureManifest(): { manifest: BuildManifest; files: Record<string, string> } {
  const files: Record<string, string> = {
    'cuento.txt': CUENTO,
    'camino.json': courseDocuments(),
    'moderno.txt': CUENTO,
    'danado.txt': DANADO,
    'revisado.txt': CUENTO,
  };
  const manifest: BuildManifest = {
    schema: 1, lang: 'es',
    entries: [
      entry({ slug: 'cuento-publico', title: 'Cuento público', author: 'A. Autor', stage: 's1', stream: 'library', streams: ['library', 'honduras'], domains: ['history'], variety: 'es-419', era: '19th century', genre: 'tale', source: { file: 'cuento.txt', url: 'https://example.test/cuento', edition: 'Madrid, 1905' } }),
      entry({ slug: 'camino-test', title: 'Camino de prueba', rights: COURSE, generated: true, stream: 'acquisition', stage: 's0', source: { file: 'camino.json', kind: 'documents' } }),
      entry({ slug: 'moderno', title: 'Un libro moderno', rights: { ...PD, state: 'prohibited-from-bundling', verified: false }, source: { file: 'moderno.txt' } }),
      entry({ slug: 'sin-verificar', rights: { ...PD, state: 'rights-unverified', verified: false }, source: { file: 'cuento.txt' } }),
      entry({ slug: 'solo-recomendado', rights: { ...PD, state: 'recommended-only' }, source: { file: 'cuento.txt' } }),
      entry({ slug: 'del-usuario', rights: { ...PD, state: 'user-supplied' }, source: { file: 'cuento.txt' } }),
      entry({ slug: 'sin-verificador', rights: { ...PD, verifiedBy: undefined }, source: { file: 'cuento.txt' } }),
      entry({ slug: 'sin-base', rights: { ...PD, basis: '  ' }, source: { file: 'cuento.txt' } }),
      entry({ slug: 'sin-estado', rights: { copyrightStatus: 'public-domain', permission: 'not-needed', canBundle: true, userImportOnly: false, audiobook: 'none', verified: true } as WorkRights, source: { file: 'cuento.txt' } }),
      entry({ slug: 'no-empaquetar', rights: { ...PD, canBundle: false }, source: { file: 'cuento.txt' } }),
      entry({ slug: 'solo-usuario', rights: { ...PD, userImportOnly: true }, source: { file: 'cuento.txt' } }),
      entry({ slug: 'danado', title: 'Texto dañado', source: { file: 'danado.txt' } }),
      entry({ slug: 'faltante', source: { file: 'no-existe.txt' } }),
      entry({ slug: 'afuera', source: { file: '../secreto.txt' } }),
      entry({ slug: 'revisado', title: 'Cuento revisado', stream: 'library', stage: 's1', source: { file: 'revisado.txt' }, review: { status: 'reviewed', reviewedBy: 'Revisora de prueba', reviewedAt: '2026-09-30', coversSourceSha256: sha(CUENTO) } }),
    ],
  };
  return { manifest, files };
}

/** An in-memory build IO over `files`; everything written lands in `out`. */
export function memoryIO(files: Record<string, string>): { io: BuildIO; out: Map<string, string> } {
  const out = new Map<string, string>();
  return {
    out,
    io: {
      async readSource(file) { const text = files[file]; return text === undefined ? undefined : { text, sha256: sha(text) }; },
      write(relative, content) { out.set(relative, content); },
    },
  };
}

/** Serve a built library from memory the way the app's fetch would see it. */
export function serve(out: Map<string, string>, lang = 'es', counts?: Map<string, number>): typeof fetch {
  return (async (input: unknown) => {
    const url = String(input);
    const prefix = `/library/${lang}/`;
    const at = url.indexOf(prefix);
    const rel = at >= 0 ? url.slice(at + prefix.length) : '';
    counts?.set(rel, (counts.get(rel) ?? 0) + 1);
    const body = out.get(rel);
    return body === undefined ? new Response('not found', { status: 404 }) : new Response(body, { status: 200 });
  }) as typeof fetch;
}

export const cleanInspect = (): QualityReport => ({ checkedWith: 'fixture@1', flags: [], verdict: 'clean' });

export const writeTree = (root: string, files: Record<string, string>) => {
  for (const [rel, content] of Object.entries(files)) {
    const target = path.join(root, rel);
    fs.mkdirSync(path.dirname(target), { recursive: true });
    fs.writeFileSync(target, content, 'utf8');
  }
};
