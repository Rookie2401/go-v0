import { applyConfirmations, createScanner, formsToConfirm, type ScanToken, type Confirmations } from '../active/scan';
import { levelOfRows } from '../active/levels';
import { entryRefuses, matchEntry } from '../adapters/registry';
import { wordInScript } from '../active/pageLanguages';
import { isUnitId, MAX_CONFIRM_FORMS, type KnowledgeView } from '../protocol';
import type { createBridge } from '../content/services';
import { aggregateCoverage } from './coverage';
import type { ReadingAnalysisReply } from './protocol';

type Bridge = ReturnType<typeof createBridge>;

const MAIN = 'main, article, [role="main"], [data-reader-content], [data-chapter]';
const MAX_CHARS = 100_000;
const MAX_TOKENS = 12_000;
// The background profile service accepts no more than 60 IDs per request.
const PROFILE_BATCH = 60;

export async function analyzePage(
  doc: Document,
  languageId: string,
  bridge: Bridge,
  adapterOf: Parameters<typeof createScanner>[0]['adapterOf'],
  signal: AbortSignal,
): Promise<ReadingAnalysisReply> {
  // The reader registry's refusal is authoritative even for a user-triggered scan.
  // A blocked/permission-required reader must never be probed via this feature.
  const location = doc.location;
  const reader = location && matchEntry({
    href: location.href, protocol: location.protocol, host: location.host, pathname: location.pathname,
  });
  if (reader && entryRefuses(reader)) return { ok: false, code: 'unsupported-page' };
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

  // Reuse the existing forms-index confirmation step from GoLearn Active. Without it,
  // many ordinary inflections are marked unresolved even when the dictionary recognizes
  // them. Preserve ambiguity: a dictionary fallback must not override conflicting parses.
  if (bridge.confirmForms) {
    const eligible = tokens.filter((token) => !token.ambiguous);
    const outstanding = formsToConfirm(eligible, languageId, new Map());
    const answers = new Map<string, string | null>();
    const prefix = `form:${languageId}:`;
    for (let i = 0; i < outstanding.length; i += MAX_CONFIRM_FORMS) {
      signal.throwIfAborted();
      const ids = outstanding.slice(i, i + MAX_CONFIRM_FORMS);
      let reply;
      try {
        reply = await bridge.confirmForms({ languageId, forms: ids.map((id) => id.slice(prefix.length)) });
      } catch { reply = undefined; }
      signal.throwIfAborted();
      if (!reply?.ok || !reply.forms || typeof reply.forms !== 'object') break;
      for (const id of ids) {
        const form = id.slice(prefix.length);
        if (!Object.prototype.hasOwnProperty.call(reply.forms, form)) continue;
        const row = reply.forms[form];
        const lemma = Array.isArray(row) && typeof row[0] === 'string' && row[0] ? row[0] : undefined;
        const pos = Array.isArray(row) && typeof row[1] === 'string' && /^[A-Za-z]{1,8}$/.test(row[1]) ? row[1] : undefined;
        const lemmaId = lemma ? `lemma:${languageId}:${lemma}${pos ? ':' + pos : ''}` : undefined;
        if (lemmaId && isUnitId(lemmaId)) answers.set(id, lemmaId);
        else if (!reply.reason) answers.set(id, null);
      }
      if (reply.reason) break;
    }
    applyConfirmations(eligible, answers as Confirmations);
  }
  signal.throwIfAborted();
  const candidates = tokens.map((token) => token.known && token.ids.every(isUnitId) ? token.ids[1] : undefined);
  const ids = [...new Set(tokens.flatMap((token, index) => candidates[index] ? token.ids : []))];
  const rows = new Map<string, KnowledgeView>();
  let cached = false;
  for (let i = 0; i < ids.length; i += PROFILE_BATCH) {
    signal.throwIfAborted();
    const unitIds = ids.slice(i, i + PROFILE_BATCH);
    // The ordinary profile endpoint treats >4 word IDs as a long selection and strips
    // form IDs, silently corrupting coverage. The device-only path preserves both
    // form and lemma evidence without uploading page vocabulary to the service.
    const reply = await bridge.readingProfile?.({ languageId, unitIds });
    if (!reply?.ok || !reply.rows || reply.source !== 'device' || reply.error) {
      return { ok: false, code: 'unavailable' };
    }
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
