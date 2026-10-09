/**
 * The learner's own copy of everything the Repository holds about them (and the way back in). The format is documented
 * in README.md; `format` is the version, so a later change is a new string rather than a silent reinterpretation.
 * Credentials (password hash, session token hashes) are never exported; devices are listed by id only.
 */
import { MAX_LIST_LIMIT } from './rules';
import type {
  AssistancePreferences, Enrolment, Learner, PrivateDocument, RepositoryStore, StoredEvent, Tombstone, UnitKnowledge,
} from '../../repository-contract/src';

export const EXPORT_FORMAT = 'go-repository-export@1' as const;

export interface LearnerExport {
  format: typeof EXPORT_FORMAT;
  exportedAt: string;
  learnerId: string;
  learner?: Learner;
  enrolments: Enrolment[];
  /** Device ids only. */
  devices: string[];
  /** Every row, with the store's `seq` and `recordedAt`. */
  events: StoredEvent[];
  knowledge: UnitKnowledge[];
  preferences: AssistancePreferences[];
  /** Full bodies: it is the learner's own text. Deleted documents appear with an empty body and `deletedAt`. */
  documents: PrivateDocument[];
  tombstones: Tombstone[];
}

export interface ExportOptions { now?: () => string }

export async function exportLearner(store: RepositoryStore, learnerId: string, opts: ExportOptions = {}): Promise<LearnerExport> {
  const events: StoredEvent[] = [];
  let afterSeq = 0;
  for (;;) {
    const page = await store.list({ learnerId, afterSeq, limit: MAX_LIST_LIMIT });
    events.push(...page);
    if (page.length < MAX_LIST_LIMIT) break;
    afterSeq = page[page.length - 1].seq;
  }
  const enrolments = await store.listEnrolments(learnerId);
  const knowledge = await store.getKnowledge(learnerId);
  const documents = await store.listDocuments(learnerId);

  // The port has no "list every preference row"; ask for the learner-wide row and for every language the learner appears in.
  const languages = new Set<string>();
  for (const e of enrolments) languages.add(e.languageId);
  for (const e of events) languages.add(e.languageId);
  for (const k of knowledge) languages.add(k.languageId);
  for (const d of documents) languages.add(d.languageId);
  const preferences: AssistancePreferences[] = [];
  for (const lang of [undefined, ...[...languages].sort()]) {
    const p = await store.getPreferences(learnerId, lang);
    if (p) preferences.push(p);
  }

  const deviceIds = new Set<string>();
  for (const e of events) deviceIds.add(e.producer.deviceId);
  for (const d of documents) deviceIds.add(d.deviceId);
  const devices: string[] = [];
  for (const id of [...deviceIds].sort()) if (await store.getDevice(learnerId, id)) devices.push(id);

  const learner = await store.getLearner(learnerId);
  const out: LearnerExport = {
    format: EXPORT_FORMAT,
    exportedAt: (opts.now ?? (() => new Date().toISOString()))(),
    learnerId,
    enrolments, devices, events, knowledge, preferences, documents,
    tombstones: await store.listTombstones(learnerId),
  };
  if (learner) out.learner = learner;
  return out;
}

export interface ImportSummary {
  events: { stored: number; duplicates: number; refused: number };
  documents: { stored: number; skipped: number; conflicts: number };
  enrolments: number;
  preferences: number;
  tombstones: number;
}

/**
 * Restores an export into `store`. Events go through `append` (so validation, de-duplication and the learner check all
 * apply and importing twice changes nothing); documents through `putDocument`. Knowledge is NOT restored: it is derived,
 * and the engine rebuilds it from the events. Revisions restart: a document new to the store is revision 1; a stored document updated at or after the export's copy is kept.
 */
export async function importLearner(store: RepositoryStore, data: LearnerExport): Promise<ImportSummary> {
  if (!data || data.format !== EXPORT_FORMAT) throw new Error(`not a ${EXPORT_FORMAT} export`);
  const learnerId = data.learnerId;
  const summary: ImportSummary = { events: { stored: 0, duplicates: 0, refused: 0 }, documents: { stored: 0, skipped: 0, conflicts: 0 }, enrolments: 0, preferences: 0, tombstones: 0 };
  return store.transaction(async () => {
    if (data.learner) await store.putLearner(data.learner);
    for (const e of data.enrolments) { await store.putEnrolment(e); summary.enrolments++; }
    for (let i = 0; i < data.events.length; i += 500) {
      const batch = [...data.events.slice(i, i + 500)].sort((a, b) => a.seq - b.seq);
      for (const o of await store.append(learnerId, batch)) {
        if (o.stored) summary.events.stored++;
        else if (o.duplicateOf !== undefined) summary.events.duplicates++;
        else summary.events.refused++;
      }
    }
    for (const doc of data.documents) {
      const cur = await store.getDocument(learnerId, doc.docId);
      // A copy at least as recently updated as the export's is kept as it is (revisions restart on import, so they cannot be compared).
      if (cur && !(Date.parse(cur.updatedAt) < Date.parse(doc.updatedAt))) { summary.documents.skipped++; continue; }
      const r = await store.putDocument(doc, cur ? cur.revision : 0);
      if (r.ok) summary.documents.stored++;
      else summary.documents.conflicts++;
    }
    for (const p of data.preferences) { await store.putPreferences(p); summary.preferences++; }
    for (const t of data.tombstones) { await store.putTombstone(t); summary.tombstones++; }
    return summary;
  });
}
