import { createScanner, type ScanToken } from '../active/scan';
import { levelOfRows } from '../active/levels';
import { wordInScript } from '../active/pageLanguages';
import { isUnitId, type KnowledgeView } from '../protocol';
import type { createBridge } from '../content/services';
import { aggregateCoverage } from './coverage';
import type { ReadingAnalysisReply } from './protocol';

type Bridge = ReturnType<typeof createBridge>;

const MAIN = 'main, article, [role="main"], [data-reader-content], [data-chapter]';
const MAX_CHARS = 100_000;
const MAX_TOKENS = 12_000;
const PROFILE_BATCH = 100;

export async function analyzePage(
  doc: Document,
  languageId: string,
  bridge: Bridge,
  adapterOf: Parameters<typeof createScanner>[0]['adapterOf'],
  signal: AbortSignal,
): Promise<ReadingAnalysisReply> {
  if (!adapterOf(languageId) || languageId === 'he' || languageId === 'el') {
    // These analyzers share language-level profile IDs between historical and modern varieties.
    return { ok: false, code: 'unsupported-language' };
  }
  const scanner = createScanner({
    doc, adapterOf, viewport: 'all', requireUnambiguousLemma: true,
    ignore: ['aside', 'form', '[inert]', 'details:not([open])'],
  });
  const nodes = scanner.textNodes(doc).filter((node) => {
    const parent = node.parentElement;
    if (!parent || !doc.defaultView) return false;
    const style = doc.defaultView.getComputedStyle(parent);
    return style.visibility === 'visible' && (style.display === 'contents' || parent.getClientRects().length > 0);
  });
  const primary = nodes.filter((node) => node.parentElement?.closest(MAIN));
  const usePrimary = primary.some((node) => node.data.trim().length >= 30)
    || primary.reduce((length, node) => length + node.data.trim().length, 0) >= 60;
  const tokens: ScanToken[] = [];
  let characters = 0;
  let truncated = false;
  for (const [index, node] of (usePrimary ? primary : nodes).entries()) {
    if (index % 32 === 0) {
      await new Promise<void>((resolve) => setTimeout(resolve, 0));
      signal.throwIfAborted();
    }
    const budget = MAX_CHARS - characters;
    if (budget <= 0) { truncated = true; break; }
    let input = node;
    if (node.data.length > budget) {
      const prefix = node.data.slice(0, budget);
      const end = prefix.search(/\s\S*$/u);
      input = doc.createTextNode(end > 0 ? prefix.slice(0, end) : '');
      truncated = true;
    }
    characters += input.data.length;
    const batch = scanner.tokensIn([input], languageId).filter((token) => wordInScript(token.surface, languageId));
    tokens.push(...batch.slice(0, MAX_TOKENS - tokens.length));
    if (truncated || tokens.length >= MAX_TOKENS) { truncated = true; break; }
  }
  if (!tokens.length) return { ok: false, code: 'no-text' };
  const candidates = tokens.map((token) => token.known && token.ids.every(isUnitId) ? token.ids[1] : undefined);
  const ids = [...new Set(tokens.flatMap((token, index) => candidates[index] ? token.ids : []))];
  const rows = new Map<string, KnowledgeView>();
  let cached = false;
  for (let i = 0; i < ids.length; i += PROFILE_BATCH) {
    signal.throwIfAborted();
    const unitIds = ids.slice(i, i + PROFILE_BATCH);
    const reply = await bridge.profile({ languageId, unitIds });
    if (!reply?.ok || !reply.rows) return { ok: false, code: 'unavailable' };
    cached ||= !!reply.stale || (reply.connected && reply.source === 'device');
    for (const id of unitIds) if (reply.rows[id]) rows.set(id, reply.rows[id]);
  }
  signal.throwIfAborted();
  const coverage = aggregateCoverage(tokens.map((token, index) => {
    const identity = candidates[index];
    if (!identity) return {};
    const matched = token.ids.map((id) => rows.get(id));
    const state = matched.some(Boolean) ? levelOfRows(matched) : undefined;
    const formState = levelOfRows([matched[0]]);
    // A known lemma supports familiarity, but confidence requires evidence for this form.
    const lemmaOnly = (state === 'known' || state === 'automatic')
      && formState !== 'known' && formState !== 'automatic';
    return { identity, state: lemmaOnly ? 'familiar' : state };
  }), { languageId, sourceScope: usePrimary ? 'primary' : 'page', freshness: cached ? 'cached' : ids.length ? 'current' : 'unknown' });
  return { ok: true, coverage, truncated };
}
