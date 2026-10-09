/**
 * Test doubles for the GoTell workspace: a fake `TellEngine` (in-memory stores, a checker that flags the word "gabim" and the
 * negation "nuk", a ladder with a refusing Level 6 on request) and a manual clock for autosave.
 */
import { CONTRACT_VERSION } from '../../packages/repository-contract/src';
import type { GoEvent } from '../../packages/repository-contract/src';
import type {
  AssistanceStep, DraftAnalysis, DraftRecord, DraftStore, DraftVersion, Identity, Issue, PromptCategory, SentenceAnalysis, WriterProfile, WritingMode, WritingPrompt,
} from '../../packages/gotell/src/types';
import type { AssistOutcome, DiffLine, FileOut, TellEngine } from '../../packages/gotell/src/workspace/port';

export const sentencesOf = (text: string): string[] => (text.match(/[^.!?]+[.!?]*/g) ?? []).map((s) => s.trim()).filter(Boolean);

export const PROMPT_LIST: WritingPrompt[] = [
  prompt('intro', 'personal-background', 'Introduce yourself to a neighbour', ['guided', 'free']),
  prompt('thanks', 'general', 'Thank your host for a meal', ['guided']),
  prompt('mission', 'mission-communication', 'Say why you are here', ['missionary', 'guided']),
  prompt('t-family', 'testimony', 'Tell about your family', ['testimony'], 'family'),
  prompt('t-change', 'testimony', 'Tell about a change in your life', ['testimony'], 'change'),
];

function prompt(promptId: string, category: PromptCategory, goal: string, _modes: string[], section?: string): WritingPrompt {
  return {
    promptId, category, languageIds: ['*'], teams: [], goal, instruction: `Write a few sentences. ${goal}.`, difficulty: 'first-sentences',
    vocabularyDomains: [], grammarTargets: [], culturalNotes: [`A cultural note for ${promptId}.`],
    ...(promptId === 'intro' ? { frames: ['Unë quhem ___.'] } : {}),
    validation: { authorship: 'machine-drafted', reviewed: false, reviewNeeded: 'a native speaker' }, ...(section ? { section } : {}),
  };
}

export interface FakeEngineOptions {
  /** Level 6 is refused with this reason (default: a pack sentence is offered). */
  refuseModel?: string;
  analysisAvailable?: boolean;
}

export interface FakeEngine extends TellEngine {
  calls: string[];
  remoteSaves: number;
  localSaves: number;
  localDocs: Map<string, { record: DraftRecord; revision: number }>;
  remoteDocs: Map<string, { record: DraftRecord; revision: number }>;
  offline: boolean;
  setOptions(o: FakeEngineOptions): void;
  consentValue: boolean;
  intentsSeen: string[];
}

const analysedIssue = (sentenceIndex: number, text: string): { issues: Issue[]; corrections: SentenceAnalysis['corrections'] } => {
  const issues: Issue[] = [];
  const corrections: SentenceAnalysis['corrections'] = [];
  const g = text.indexOf('gabim');
  if (g >= 0) {
    issues.push({
      issueId: `i-${sentenceIndex}-g`, sentenceIndex, span: { start: g, end: g + 5 }, surface: 'gabim', category: 'agreement', class: 'grammatically-wrong', confidence: 0.9,
      provenance: { source: 'adapter-checker', ref: 'fake' }, hint: 'a word form does not fit', unitIds: ['lemma:sq:gabim:NOUN'], affectsMeaning: false,
    });
    corrections.push({
      correctionId: `c-${sentenceIndex}-g`, issueIds: [`i-${sentenceIndex}-g`], sentenceIndex, original: text, suggested: text.replace('gabim', 'saktë'), explanation: 'The word is replaced by a form that fits.',
      alternatives: [{ text: text.replace('gabim', 'drejtë'), note: 'also possible' }], validation: { checkerClean: true, addsOnlyWithinSpans: true, issues: [] }, confidence: 0.9,
      provenance: { source: 'adapter-checker', ref: 'fake' },
    });
  }
  const n = text.indexOf('nuk ');
  if (n >= 0) {
    issues.push({
      issueId: `i-${sentenceIndex}-n`, sentenceIndex, span: { start: n, end: n + 3 }, surface: 'nuk', category: 'negation', class: 'semantically-unclear', confidence: 0.7,
      provenance: { source: 'adapter-checker', ref: 'fake' }, hint: 'a negation may not belong here', unitIds: [], affectsMeaning: true,
    });
    corrections.push({
      correctionId: `c-${sentenceIndex}-n`, issueIds: [`i-${sentenceIndex}-n`], sentenceIndex, original: text, suggested: text.replace('nuk ', ''), explanation: 'The negation is removed.',
      meaningChange: 'the sentence would say the opposite', alternatives: [], validation: { checkerClean: true, addsOnlyWithinSpans: true, issues: [] }, confidence: 0.7,
      provenance: { source: 'adapter-checker', ref: 'fake' },
    });
  }
  return { issues, corrections };
};

export function fakeEngine(identity: Identity, opts: FakeEngineOptions = {}): FakeEngine {
  let options = { ...opts };
  const localDocs = new Map<string, { record: DraftRecord; revision: number }>();
  const remoteDocs = new Map<string, { record: DraftRecord; revision: number }>();
  const conflictNotes: Array<{ draftId: string; copyId: string; reason: string }> = [];
  const pending = new Set<string>();
  const e = {
    calls: [] as string[], remoteSaves: 0, localSaves: 0, offline: false, consentValue: false, intentsSeen: [] as string[],
  };

  const local: DraftStore = {
    async list() { return [...localDocs.values()].map((d) => meta(d.record, d.revision)); },
    async load(id) { const d = localDocs.get(id); return d ? { record: structuredClone(d.record), revision: d.revision } : undefined; },
    async save(record, expected) {
      const cur = localDocs.get(record.draftId);
      if (cur && cur.revision !== expected) return { ok: false, current: { record: structuredClone(cur.record), revision: cur.revision } };
      e.localSaves += 1;
      const revision = (cur?.revision ?? 0) + 1;
      localDocs.set(record.draftId, { record: structuredClone(record), revision });
      return { ok: true, revision };
    },
    async remove(id) { localDocs.delete(id); },
  };
  const meta = (r: DraftRecord, revision: number) => ({ docId: r.draftId, title: r.title, updatedAt: r.updatedAt, revision, kind: r.mode === 'testimony' ? 'testimony' as const : 'draft' as const, languageId: r.languageId });

  const synced: FakeEngine['stores']['synced'] = {
    async list() {
      const all = new Map<string, ReturnType<typeof meta>>();
      for (const d of remoteDocs.values()) all.set(d.record.draftId, meta(d.record, d.revision));
      for (const d of localDocs.values()) all.set(d.record.draftId, meta(d.record, d.revision));
      return [...all.values()].sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
    },
    async load(id) {
      const l = await local.load(id);
      if (l) return l;
      if (e.offline) return undefined;
      const r = remoteDocs.get(id);
      return r ? { record: structuredClone(r.record), revision: r.revision } : undefined;
    },
    async save(record, expected) {
      const s = await local.save(record, expected);
      if (!s.ok) return s;
      if (e.offline) { pending.add(record.draftId); return s; }
      e.remoteSaves += 1;
      e.calls.push(`remote.save:${record.draftId}`);
      const cur = remoteDocs.get(record.draftId);
      const theirs = remoteTweaks.get(record.draftId);
      if (theirs) {
        remoteTweaks.delete(record.draftId);
        conflictNotes.push({ draftId: record.draftId, copyId: `${record.draftId}-copy`, reason: 'conflict' });
        return { ok: false, current: { record: theirs, revision: (cur?.revision ?? 0) + 1 } };
      }
      remoteDocs.set(record.draftId, { record: structuredClone(record), revision: (cur?.revision ?? 0) + 1 });
      pending.delete(record.draftId);
      return s;
    },
    async remove(id) { await local.remove(id); remoteDocs.delete(id); pending.delete(id); },
    conflicts: () => [...conflictNotes],
    pendingPush: async () => [...pending],
  };
  const remoteTweaks = new Map<string, DraftRecord>();

  const level = (n: number): AssistanceStep['level'] => n as AssistanceStep['level'];

  const engine: FakeEngine = {
    languageId: identity.languageId,
    get analysisAvailable() { return options.analysisAvailable !== false; },
    analysisUnavailableReason: 'No checker is installed for this language.',
    get calls() { return e.calls; },
    get remoteSaves() { return e.remoteSaves; },
    get localSaves() { return e.localSaves; },
    localDocs, remoteDocs,
    get offline() { return e.offline; }, set offline(v) { e.offline = v; },
    get consentValue() { return e.consentValue; }, set consentValue(v) { e.consentValue = v; },
    get intentsSeen() { return e.intentsSeen; },
    setOptions(o) { options = { ...options, ...o }; },

    prompts: ({ mode, category }) => PROMPT_LIST.filter((p) => (category ? p.category === category : true) && (mode === 'testimony' ? p.category === 'testimony' : mode === 'missionary' ? p.category === 'mission-communication' : true)),
    promptById: (id) => PROMPT_LIST.find((p) => p.promptId === id),
    suggestPrompt: (_profile, { mode, category }) => {
      const list = engine.prompts({ mode, ...(category ? { category } : {}) });
      return list[0] ? { prompt: list[0], reason: 'Chosen because you have not tried it yet.' } : undefined;
    },
    guidance({ prompt: pr, intent }) {
      if (intent !== undefined) e.intentsSeen.push(intent);
      return {
        lines: pr ? ['Try two or three short sentences.'] : [],
        familiarWords: intent?.trim() || pr ? ['shtëpi', 'ujë'] : [],
        frames: intent?.trim() ? ['Unë dua të them ___.'] : (pr?.frames ?? []),
      };
    },
    async buildProfile(_source, ident): Promise<WriterProfile> {
      e.calls.push('buildProfile');
      return { learnerId: ident.learnerId, languageId: ident.languageId, productive: [], recognisedOnly: [], weakConstructions: [], recurringErrors: [], recent: [], explanationDepth: 'brief', goals: [], band: { level: 'first-sentences', basis: ['fake'] } };
    },

    async analyze(draftId, text): Promise<DraftAnalysis> {
      e.calls.push('analyze');
      const sentences: SentenceAnalysis[] = sentencesOf(text).map((s, i) => {
        const found = analysedIssue(i, s);
        return { index: i, text: s, tokens: s.split(/\s+/), unitIds: [], familiarity: 0.5, issues: found.issues, corrections: found.corrections, checkerCoverage: 'The checker cannot see word choice or tense.', analysisStatus: 'high-confidence' };
      });
      return { draftId, languageId: identity.languageId, textHash: String(text.length), sentences, analyzerId: 'fake', packVersion: '0', at: '2026-10-09T10:00:00.000Z' };
    },
    async assist(analysis, req, prior): Promise<AssistOutcome> {
      e.calls.push(`assist:${req.level}`);
      const s = analysis.sentences.find((x) => x.index === req.sentenceIndex)!;
      const issue = s.issues.find((i) => i.issueId === req.issueId) ?? s.issues[0];
      const at = req.at;
      const common = { revealedUnitIds: [] as string[], at };
      switch (req.level) {
        case 1: return { ok: true, step: { level: level(1), content: `Possible problem at “${issue?.surface ?? ''}”: ${issue?.category ?? ''}.`, source: 'adapter-checker', ...common } };
        case 2: return { ok: true, step: { level: level(2), content: issue?.hint ?? 'look again', source: 'adapter-checker', ...common } };
        case 3: return { ok: true, step: { level: level(3), content: 'Look at the ending of this word.', source: 'pack-grammar', ...common, revealedUnitIds: ['lemma:sq:saktë:ADJ'] } };
        case 4: return { ok: true, step: { level: level(4), content: `Revised sentence: “${s.corrections[0]?.suggested ?? s.text}”`, source: 'adapter-checker', ...common } };
        case 5: return { ok: true, step: { level: level(5), content: 'Other ways: drejtë.', source: 'pack-grammar', ...common } };
        default:
          if (options.refuseModel) return { ok: false, reason: options.refuseModel };
          return { ok: true, step: { level: level(6), content: 'Unë jam në shtëpi.\n(a pack sentence about being at home)', source: 'pack-sentence', review: 'unreviewed', ...common, revealedUnitIds: prior.flatMap((p) => p.revealedUnitIds) } };
      }
    },

    stores: { local, synced },
    newVersion({ record, text, at, deviceId, note }) {
      e.calls.push('newVersion');
      const top = Math.max(0, ...record.assistance.map((a) => a.level));
      const authorship = top === 0 ? 'independent' : top >= 4 ? 'revised-after-feedback' : 'after-hint';
      const version: DraftVersion = {
        versionId: `v${record.versions.length + 1}`, at, text, textHash: String(text.length), deviceId,
        sentences: sentencesOf(text).map((t) => ({ text: t, authorship, assistance: record.assistance.map((a) => a.level), at })), ...(note ? { note } : {}),
      };
      return { ...record, text, versions: [...record.versions, version], assistance: [], updatedAt: at };
    },
    diff(version, current): DiffLine[] {
      const a = sentencesOf(version.text); const b = sentencesOf(current);
      return [...a.filter((x) => !b.includes(x)).map((text) => ({ kind: 'removed' as const, text })), ...b.filter((x) => a.includes(x)).map((text) => ({ kind: 'same' as const, text })), ...b.filter((x) => !a.includes(x)).map((text) => ({ kind: 'added' as const, text }))];
    },
    restore(record, versionId, at, deviceId) {
      const old = record.versions.find((v) => v.versionId === versionId)!;
      const version: DraftVersion = { ...structuredClone(old), versionId: `v${record.versions.length + 1}`, at, deviceId, note: `Restored from ${old.versionId}` };
      return { ...record, text: old.text, versions: [...record.versions, version], assistance: [], updatedAt: at };
    },
    exportDraft(record, format): FileOut {
      return { filename: `${record.title || 'draft'}.${format === 'markdown' ? 'md' : format === 'json' ? 'json' : 'txt'}`, mime: 'text/plain', content: format === 'json' ? JSON.stringify(record) : record.text };
    },
    async deleteDraft(id) { e.calls.push(`delete:${id}`); await synced.remove(id); },

    saveEvidence({ identity: ident, appVersion, at, record, version, mode }) {
      const assisted = version.sentences.some((s) => s.authorship !== 'independent');
      const ev: GoEvent = {
        id: `ev-${record.draftId}-${version.versionId}`, v: CONTRACT_VERSION, learnerId: ident.learnerId, enrolmentId: ident.enrolmentId, languageId: ident.languageId, at,
        producer: { app: 'gopractice-tell', version: appVersion, deviceId: ident.deviceId }, kind: 'ProductionRecorded', subject: { draftId: record.draftId, sourceRef: { kind: 'writing' } },
        payload: { mode: mode === 'targeted' ? 'retrieval' : mode === 'free' ? 'free' : 'guided', assisted, assistance: [], usedCorrectly: 'unjudged', authorship: version.sentences[0]?.authorship ?? 'independent', draftId: record.draftId },
        dedupeKey: `fake:${record.draftId}:${version.versionId}`, evidence: { quality: 'weak', assisted },
      };
      return { events: [ev], summary: [`Saved ${version.versionId}: ${version.sentences.length} sentence(s) recorded as ${ev.payload.authorship}.`, 'Only counts and hashes were recorded.'] };
    },
    correctionEvidence({ identity: ident, appVersion, at, draftId, outcome, correction }) {
      const kind = outcome === 'accepted' ? 'CorrectionAccepted' : 'CorrectionRejected';
      const ev: GoEvent = {
        id: `ev-${kind}-${correction.correctionId}`, v: CONTRACT_VERSION, learnerId: ident.learnerId, enrolmentId: ident.enrolmentId, languageId: ident.languageId, at,
        producer: { app: 'gopractice-tell', version: appVersion, deviceId: ident.deviceId }, kind, subject: { draftId },
        payload: { correctionId: correction.correctionId, issueIds: correction.issueIds, categories: ['agreement'], draftId }, dedupeKey: `fake:${kind}:${correction.correctionId}`, evidence: { quality: 'none', assisted: true },
      };
      return { events: [ev], summary: [`Recorded that you ${outcome} a correction.`] };
    },

    privacy: {
      statement: () => ({ title: 'How GoTell treats your writing', sections: [{ heading: 'What is never sent', points: ['The text of your sentences is never put in a learning event.'] }] }),
      async exportAll() { return { filename: 'gotell-writing.json', mime: 'application/json', content: JSON.stringify({ drafts: [...localDocs.values()].map((d) => d.record) }) }; },
      async cleanDevice() { const n = localDocs.size; localDocs.clear(); return { removed: n }; },
      remote: {
        providerName: () => undefined,
        consent: () => e.consentValue,
        async setConsent(on) { e.consentValue = on; },
      },
    },
    async flushPending() { return { sent: 0, waiting: pending.size }; },
  };
  (engine as unknown as { tweakRemote: Map<string, DraftRecord> }).tweakRemote = remoteTweaks;
  return engine;
}

/** The record of a draft with no mode set (what home creates for a new free draft). */
export const blankMode: WritingMode = 'free';

/** A clock the tests wind by hand: autosave timers do not fire until `fire()`. */
export function manualTimers(): { set(fn: () => void, ms: number): unknown; clear(h: unknown): void; fire(): void; pending(): number } {
  let next = 1;
  const jobs = new Map<number, () => void>();
  return {
    set(fn) { const id = next++; jobs.set(id, fn); return id; },
    clear(h) { if (typeof h === 'number') jobs.delete(h); },
    fire() { const all = [...jobs.entries()]; jobs.clear(); for (const [, fn] of all) fn(); },
    pending: () => jobs.size,
  };
}
