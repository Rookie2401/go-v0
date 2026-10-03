/** Stage-aware listening choices built only from published texts and currently lawful exact-bound audio. */
import type { AppStore } from '../core/store';
import type { LanguageCode, Text } from '../core/model';
import { approvedForPlay, currentBindingValid } from './rights';
import { listeningProgress, type ListeningProgress } from './progress';

export type ListeningRecommendationReason = 'resume' | 'continue' | 'listen-for-repair' | 'listen-familiar' | 'listen-first';
export interface ListeningRecommendation {
  textId: string;
  title: string;
  reason: ListeningRecommendationReason;
  score: number;
  mode: 'listen-only' | 'read-listen';
  stageId?: string;
  stageLabel?: string;
  progress: ListeningProgress;
  explanation: string;
}

const reasonOrder: Record<ListeningRecommendationReason, number> = {
  resume: 0, continue: 1, 'listen-for-repair': 2, 'listen-familiar': 3, 'listen-first': 4,
};
const levelOrder = ['A0', 'A1', 'A2', 'B1', 'B2', 'C1', 'native'];

/**
 * Recommend a small listening queue. Resumable work comes first; then unfinished listens; then a text
 * already familiar in reading; finally the earliest course stage with available audio. Stage/CEFR labels
 * are course orientation only; this function never estimates a CEFR listening level.
 */
export async function recommendListening(
  store: AppStore, userId: string, lang: LanguageCode, opts: { limit?: number } = {},
): Promise<ListeningRecommendation[]> {
  const limit = Math.max(1, opts.limit ?? 5);
  const [allTexts, corpora] = await Promise.all([store.texts.where('lang', lang), store.corpora.all()]);
  const corpusKinds = new Map(corpora.map((corpus) => [corpus.id, corpus.kind]));
  const texts = allTexts.filter((t) => t.published && !assessmentText(t)
    && t.kind !== 'testimony' && corpusKinds.get(t.corpusId) !== 'testimony');
  const events = await store.events.where('userId', userId);
  const readCounts = new Map<string, Set<string>>();
  const abandoned = new Set<string>();
  for (const e of events) {
    if (e.type === 'SentenceViewed' && e.lang === lang) {
      const live = readCounts.get(e.textId) ?? new Set<string>(); live.add(e.sentenceId); readCounts.set(e.textId, live);
    }
    if (e.type === 'AudioAbandoned' && e.lang === lang && e.positionMs > 0) abandoned.add(e.textId);
  }

  const candidates: ListeningRecommendation[] = [];
  for (const text of texts) {
    const manifest = await currentManifest(store, text);
    if (!manifest) continue;
    const progress = await listeningProgress(store, userId, text.id);
    if (progress.sentencesTotal === 0 || progress.completedExposureSentences >= progress.sentencesTotal) continue;
    const work = text.workId ? await store.works.get(text.workId) : undefined;
    const stage = work ? await store.stages.get(work.stageId) : undefined;
    const read = readCounts.get(text.id)?.size ?? 0;
    let reason: ListeningRecommendationReason;
    let score: number;
    let explanation: string;
    let mode: ListeningRecommendation['mode'];
    if (progress.lastPosition) {
      reason = 'resume'; score = 1; mode = read ? 'read-listen' : 'listen-only';
      explanation = `Continue where you paused in "${text.title}". Only the exact current text and lawful audio are resumed.`;
    } else if (progress.completedExposureSentences > 0 && abandoned.has(text.id)) {
      reason = 'listen-for-repair'; score = 0.9; mode = read ? 'read-listen' : 'listen-only';
      explanation = `You started "${text.title}" and left part unheard. Replay or reveal help gradually as needed.`;
    } else if (read > 0) {
      reason = progress.masteryEligibleSentences > 0 ? 'continue' : 'listen-familiar'; score = progress.masteryEligibleSentences > 0 ? 0.8 : 0.75;
      mode = 'listen-only'; explanation = progress.masteryEligibleSentences > 0
        ? `You have heard part of "${text.title}" in audio meeting GoListen’s review and rights checks; keep listening to the same text.`
        : `You have read "${text.title}". Try hearing it with the transcript hidden, then reveal help only when needed.`;
    } else {
      reason = 'listen-first'; score = 0.6; mode = 'listen-only';
      explanation = `Hear "${text.title}" before opening the text. Its course stage is a guide, not a listening level.`;
    }
    candidates.push({ textId: text.id, title: text.title, reason, score, mode, stageId: stage?.id, stageLabel: stage?.label, progress, explanation });
  }

  const stageOrder = new Map((await store.stages.where('courseId', (await store.courses.where('lang', lang))[0]?.id ?? '')).map((s) => [s.id, s.index]));
  const works = new Map((await store.works.where('courseId', (await store.courses.where('lang', lang))[0]?.id ?? '')).map((w) => [w.id, w]));
  const staticRank = (textId: string) => { const text = texts.find((t) => t.id === textId); const i = levelOrder.indexOf(text?.staticLevel ?? ''); return i < 0 ? levelOrder.length : i; };
  return candidates.sort((a, b) => reasonOrder[a.reason] - reasonOrder[b.reason] || b.score - a.score
    || (stageOrder.get(a.stageId ?? '') ?? Number.MAX_SAFE_INTEGER) - (stageOrder.get(b.stageId ?? '') ?? Number.MAX_SAFE_INTEGER)
    || (works.get(texts.find((t) => t.id === a.textId)?.workId ?? '')?.order ?? Number.MAX_SAFE_INTEGER) - (works.get(texts.find((t) => t.id === b.textId)?.workId ?? '')?.order ?? Number.MAX_SAFE_INTEGER)
    || staticRank(a.textId) - staticRank(b.textId) || a.textId.localeCompare(b.textId)).slice(0, limit);
}

async function currentManifest(store: AppStore, text: Text) {
  const manifests = (await store.manifests.where('textId', text.id)).filter((m) => m.contentVersion === text.contentVersion);
  for (const manifest of manifests.sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))) {
    const rows = await store.audioSegments.getMany(manifest.segmentIds);
    let playable = false;
    for (const segment of rows) {
      if (!segment || segment.textId !== text.id || segment.contentVersion !== text.contentVersion || segment.status !== 'ready' || !segment.assetId) continue;
      const asset = await store.audioAssets.get(segment.assetId);
      if (asset && await store.assets.has(asset.id) && approvedForPlay(asset.rights) && await currentBindingValid(store, asset)) { playable = true; break; }
    }
    if (playable) return manifest;
  }
  return undefined;
}

function assessmentText(text: Text): boolean {
  return (text as Text & { listeningAssessmentId?: string }).listeningAssessmentId !== undefined;
}
