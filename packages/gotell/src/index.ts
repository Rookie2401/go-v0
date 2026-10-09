/**
 * GoTell — the writing workspace, independent of GoReview (docs/ecosystem/GOPRACTICE-DESIGN.md §3). It initialises with no
 * review schedule, no session and no review event. `createGoTellWorkspace` (below) is the small boundary: it reads what the
 * Repository knows about the learner's production ("words you can use"), lists the learner's private drafts and saves a
 * draft as a `PrivateDocument` with revisions. The writing engine proper (sentence-by-sentence checking, the assistance
 * ladder, versions with authorship, evidence without text, privacy) is exported from the modules listed at the end; the
 * screens reach all of it through the `TellEngine` port in ./workspace.
 *
 * Imports: the Repository contract, the typed API client, the sync package and (for guidance and the checker) the language
 * packs. Never GoReview: the two workspaces are siblings. The module has no DOM; the GoPractice shell renders it.
 */
import type { PrivateDocument, UnitKnowledge } from '../../repository-contract/src';
import type { ApiResult, DocumentMeta, RepositoryApi } from '../../repository-service/src/api';

export type GoTellApi = Pick<RepositoryApi, 'knowledge' | 'listDocuments' | 'getDocument' | 'putDocument' | 'deleteDocument'>;

export interface GoTellDeps {
  api: GoTellApi;
  identity: { learnerId: string; enrolmentId?: string; deviceId?: string };
  languageId: string;
  now?: () => Date;
  newId?: () => string;
}

/** A unit the learner has shown they can produce, with the evidence behind it. Read-only. */
export interface UsableWord {
  unitId: string;
  label: string;
  /** The production dimension(s) that carry evidence. */
  dimensions: Array<'productiveRetrieval' | 'contextualProduction'>;
  /** Best score among those dimensions, 0..1. */
  score: number;
  confidence: number;
  observations: number;
}

export type DraftKind = PrivateDocument['kind'];

export interface DraftInput {
  /** Absent: a new draft. */
  docId?: string;
  title?: string;
  body: string;
  kind?: DraftKind;
}

export type SaveResult =
  | { ok: true; doc: DocumentMeta }
  | { ok: false; conflict: boolean; message: string; current?: PrivateDocument };

export interface GoTellSnapshot {
  languageId: string;
  words: UsableWord[];
  drafts: DocumentMeta[];
  /** Plain-language notes about what could not be read (offline, refused); empty when everything loaded. */
  notes: string[];
}

export interface GoTellWorkspace {
  readonly languageId: string;
  readonly learnerId: string;
  /** Reads words and drafts. Never throws; a failure becomes a note. Needs no deck, session or review event. */
  init(): Promise<GoTellSnapshot>;
  wordsYouCanUse(): UsableWord[];
  drafts(): DocumentMeta[];
  /** The full draft, and the revision the next save must start from. */
  open(docId: string): Promise<{ ok: true; doc: PrivateDocument } | { ok: false; message: string }>;
  save(input: DraftInput): Promise<SaveResult>;
  remove(docId: string): Promise<{ ok: true } | { ok: false; message: string }>;
  /** The latest revision known for a draft (0 when it is new). */
  revisionOf(docId: string): number;
}

const PRODUCTION = ['productiveRetrieval', 'contextualProduction'] as const;

/** A readable label from a unit id such as `lemma:sq:shtëpi:NOUN`. */
export function unitLabel(unitId: string): string {
  const parts = unitId.split(':');
  return parts.length >= 3 && parts[2] ? parts[2] : unitId;
}

/** Items with production evidence in one language, strongest first. Pure. */
export function wordsFrom(knowledge: readonly UnitKnowledge[], languageId: string): UsableWord[] {
  const out: UsableWord[] = [];
  for (const k of knowledge) {
    if (k.languageId !== languageId) continue;
    const have = PRODUCTION.filter((d) => {
      const e = k.dimensions?.[d];
      return !!e && e.observations > 0 && e.positive > 0;
    });
    if (!have.length) continue;
    const ests = have.map((d) => k.dimensions[d]);
    out.push({
      unitId: k.unitId, label: unitLabel(k.unitId), dimensions: [...have],
      score: Math.max(...ests.map((e) => e.score)), confidence: Math.max(...ests.map((e) => e.confidence)),
      observations: ests.reduce((n, e) => n + e.observations, 0),
    });
  }
  return out.sort((a, b) => b.score - a.score || b.observations - a.observations || a.label.localeCompare(b.label));
}

const why = (r: Extract<ApiResult<unknown>, { ok: false }>): string => r.message || `The service answered ${r.status}.`;

export function createGoTellWorkspace(deps: GoTellDeps): GoTellWorkspace {
  const { api, identity, languageId } = deps;
  const now = deps.now ?? (() => new Date());
  const newId = deps.newId ?? (() => `draft-${now().getTime().toString(36)}-${Math.floor(Math.random() * 36 ** 6).toString(36)}`);
  let words: UsableWord[] = [];
  let drafts: DocumentMeta[] = [];
  const revisions = new Map<string, number>();

  return {
    languageId,
    learnerId: identity.learnerId,
    async init() {
      const notes: string[] = [];
      try {
        const k = await api.knowledge();
        if (k.ok) words = wordsFrom(k.data.knowledge, languageId);
        else notes.push(`Words you can use could not be read: ${why(k)}`);
      } catch { notes.push('Words you can use could not be read: the service cannot be reached.'); }
      try {
        const d = await api.listDocuments();
        if (d.ok) {
          drafts = d.data.documents.filter((x) => x.languageId === languageId && !x.deletedAt).sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
          for (const x of drafts) revisions.set(x.docId, x.revision);
        } else notes.push(`Your drafts could not be listed: ${why(d)}`);
      } catch { notes.push('Your drafts could not be listed: the service cannot be reached.'); }
      return { languageId, words, drafts, notes };
    },
    wordsYouCanUse: () => words,
    drafts: () => drafts,
    async open(docId) {
      try {
        const r = await api.getDocument(docId);
        if (!r.ok) return { ok: false, message: why(r) };
        revisions.set(docId, r.data.document.revision);
        return { ok: true, doc: r.data.document };
      } catch { return { ok: false, message: 'The service cannot be reached.' }; }
    },
    async save(input) {
      const docId = input.docId ?? newId();
      const expected = revisions.get(docId) ?? 0;
      try {
        const r = await api.putDocument(docId, { languageId, kind: input.kind ?? 'draft', body: input.body, ...(input.title ? { title: input.title } : {}) }, expected);
        if (r.ok) {
          const meta = r.data.document;
          revisions.set(docId, meta.revision);
          drafts = [meta, ...drafts.filter((d) => d.docId !== docId)];
          return { ok: true, doc: meta };
        }
        const current = (r.body as { current?: PrivateDocument }).current;
        return { ok: false, conflict: r.status === 409, message: why(r), ...(current ? { current } : {}) };
      } catch { return { ok: false, conflict: false, message: 'The service cannot be reached; your text is still in the editor. Try saving again when you are online.' }; }
    },
    async remove(docId) {
      try {
        const r = await api.deleteDocument(docId);
        if (!r.ok) return { ok: false, message: why(r) };
        drafts = drafts.filter((d) => d.docId !== docId);
        revisions.delete(docId);
        return { ok: true };
      } catch { return { ok: false, message: 'The service cannot be reached.' }; }
    },
    revisionOf: (docId) => revisions.get(docId) ?? 0,
  };
}

// ───────────────────────────── the rest of GoTell (Prompt 6) ─────────────────────────────
// types: ./types · checking and the assistance ladder: ./engine · prompts and guidance: ./prompts · the learner as a writer: ./profile
// drafts and versions: ./documents · evidence (no text, ever): ./evidence · privacy and consent: ./privacy · the screens' port: ./workspace
export * from './types';
export * from './engine';
export * from './prompts';
export * from './profile';
export * from './documents';
export * from './evidence';
export * from './privacy';
export * from './workspace';
