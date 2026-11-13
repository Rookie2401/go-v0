import { applyConfirmations, createScanner, formsToConfirm, type ScanToken, type Confirmations } from '../active/scan';
import { levelOfRows } from '../active/levels';
import { entryRefuses, matchEntry } from '../adapters/registry';
import { wordInScript } from '../active/pageLanguages';
import { mapLanguageTag } from '../language/resolve';
import { isUnitId, MAX_CONFIRM_FORMS, type KnowledgeView } from '../protocol';
import type { createBridge } from '../content/services';
import { aggregateCoverage } from './coverage';
import { declaredTextVariety, needsTextVariety, scopedVarietyUnitId, validTextVariety } from './varieties';
import type { ReadingAnalysisReply } from './protocol';

type Bridge = ReturnType<typeof createBridge>;

const MAIN = 'main, article, [role="main"], [data-reader-content], [data-chapter]';
const MAX_CHARS = 100_000;
const MAX_TOKENS = 12_000;
// The background profile service accepts no more than 60 IDs per request.
const PROFILE_BATCH = 60;

/** Ignore explicitly foreign-language reading blocks; never assume the page-wide html lang is correct. */
function hasConflictingTextLanguage(node: Text, languageId: string, varietyId?: string): boolean {
  const root = node.ownerDocument.documentElement;
  for (let el = node.parentElement; el && el !== root; el = el.parentElement) {
    const declared = el.getAttribute('lang') ?? el.getAttribute('xml:lang');
    if (!declared?.trim()) continue;
    const mapped = mapLanguageTag(declared);
    if (mapped.kind !== 'pack' || mapped.languageId !== languageId) return true;
    const explicitPeriod = declaredTextVariety(languageId, declared);
    return !!explicitPeriod && !!varietyId && explicitPeriod !== varietyId;
  }
  return false;
}

export async function analyzePage(
  doc: Document,
  languageId: string,
  bridge: Bridge,
  adapterOf: Parameters<typeof createScanner>[0]['adapterOf'],
  signal: AbortSignal,
  varietyId?: string,
): Promise<ReadingAnalysisReply> {
  // The reader registry's refusal is authoritative even for a user-triggered scan.
  // A blocked/permission-required reader must never be probed via this feature.
  const location = doc.location;
  const reader = location && matchEntry({
    href: location.href, protocol: location.protocol, host: location.host, pathname: location.pathname,
  });
  if (reader && entryRefuses(reader)) return { ok: false, code: 'unsupported-page' };
  if (!adapterOf(languageId)) return { ok: false, code: 'unsupported-language' };
  if (!validTextVariety(languageId, varietyId)) return { ok: false, code: 'variety-required' };
  const scanner = createScanner({
    doc, adapterOf, viewport: 'all', requireUnambiguousLemma: true, varietyId,
    ignore: ['aside', 'form', '[inert]', 'details:not([open])'],
  });
  const nodes = scanner.textNodes(doc).filter((node) => {
    if (hasConflictingTextLanguage(node, languageId, varietyId)) return false;
    const parent = node.parentElement;
    if (!parent || !doc.defaultView) return false;
    const style = doc.defaultView.getComputedStyle(parent);
    return style.visibility === 'visible' && (style.display === 'contents' || parent.getClientRects().length > 0);
  });
  const primary = nodes.filter((node) => node.parentElement?.closest(MAIN));
  const usePrimary = primary.some((node) => node.data.trim().length >= 30)
    || primary.reduce((length, node) => length + node.data.trim().length, 0) >= 60;
  const tokens: ScanToken[] = [];
  // Snapshot each candidate reading node, including nodes we may never reach due to
  // the scan budget. A client-side reader can replace a chapter at the same URL.
  const sourceNodes = usePrimary ? primary : nodes;
  const snapshot = sourceNodes.map((node) => ({ node, data: node.data }));
  let characters = 0;
  let truncated = false;
  for (const [index, node] of sourceNodes.entries()) {
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
  // A user's explicit mark of an exact surface form is usable even when this
  // experimental analyser cannot supply its lemma (e.g. an unfamiliar inflection).
  // An unconfirmed spelling with no stored form state stays unresolved.
  const candidates = tokens.map((token) =>
    token.ids.every(isUnitId) && token.known ? token.ids[1] : undefined);
  const periodSpecific = needsTextVariety(languageId);
  // Query both the existing shared IDs and the reserved period-specific IDs.
  // Only the latter may prove confident knowledge in a historical/modern variety.
  const ids = [...new Set(tokens.flatMap((token) => {
    const eligibleIds = token.ids.filter(isUnitId);
    return periodSpecific && varietyId
      ? [...eligibleIds, ...eligibleIds.map((id) => scopedVarietyUnitId(id, languageId, varietyId)).filter((id): id is string => !!id && isUnitId(id))]
      : eligibleIds;
  }))];
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
  // A route transition can update the content without updating the URL. Reject
  // stale results rather than showing one chapter's coverage for another.
  if (snapshot.some(({ node, data }) => !node.isConnected || node.data !== data)) {
    return { ok: false, code: 'page-changed' };
  }
  const coverage = aggregateCoverage(tokens.map((token, index) => {
    const lemma = candidates[index];
    const formId = token.ids[0];
    const formRow = formId ? rows.get(formId) : undefined;
    const formScopedId = periodSpecific && varietyId && formId ? scopedVarietyUnitId(formId, languageId, varietyId) : undefined;
    const scopedFormRow = formScopedId ? rows.get(formScopedId) : undefined;
    const identity = lemma || ((formRow || scopedFormRow) ? formId : undefined);
    if (!identity) return {};
    const matched = token.ids.map((id) => rows.get(id));
    if (periodSpecific && varietyId) {
      const scoped = token.ids.map((id) => scopedVarietyUnitId(id, languageId, varietyId)).map((id) => id && rows.get(id));
      const verified = scoped.some(Boolean) ? levelOfRows(scoped.map((row) => row || undefined)) : undefined;
      const verifiedForm = scoped[0] ? levelOfRows([scoped[0]]) : undefined;
      if (verified !== undefined) {
        const strict = (verified === 'known' || verified === 'automatic')
          && verifiedForm !== 'known' && verifiedForm !== 'automatic'
          ? 'familiar' : verified;
        return { identity, state: strict };
      }
      // The historic Repository uses one ID across periods. Report such knowledge
      // separately as unverified, never as confidently known or familiar by default.
      // A Greek/Modern known mark is not proof of understanding its Homeric homograph.
      return { identity, legacyShared: matched.some(Boolean) };
    }
    const state = matched.some(Boolean) ? levelOfRows(matched) : undefined;
    const formState = levelOfRows([matched[0]]);
    // A known lemma supports familiarity, but confidence requires evidence for this form.
    const lemmaOnly = (state === 'known' || state === 'automatic')
      && formState !== 'known' && formState !== 'automatic';
    return { identity, state: lemmaOnly ? 'familiar' : state };
  }), { languageId, ...(varietyId ? { varietyId } : {}), sourceScope: usePrimary ? 'primary' : 'page', freshness: cached ? 'cached' : ids.length ? 'current' : 'unknown' });
  return { ok: true, coverage, truncated };
}
