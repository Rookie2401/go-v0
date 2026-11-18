/**
 * Reading Analysis: what the popup says about a result. One number first; under it only what a learner needs to trust it: what was read,
 * how many words, what could not be decided, and whether the knowledge it rests on is known to be the learner's whole record.
 * Pure (a result in, text out), so every sentence is tested without a browser.
 */
import { varietyOf } from '../../../repository-contract/src/varieties';
import { languageNameOf } from '../protocol';
import { formatPercent } from './coverage';
import type { KnowledgeSnapshot, ReadingResult, ReadingStage, ReadingStatus } from './protocol';

export interface Presented {
  /** "87.6% Known" */
  figure: string;
  /** "8,760 of 10,000 words" */
  count: string;
  /** What was read. */
  scope: string;
  /** What could not be decided, the limits reached, and how the knowledge was verified: each a full sentence. */
  notes: Array<{ text: string; warn?: boolean }>;
}

const n = (x: number): string => x.toLocaleString('en');
const words = (x: number): string => `${n(x)} ${x === 1 ? 'word' : 'words'}`;
const when = (ms: number | undefined): string => (ms === undefined ? '' : new Date(ms).toLocaleString());

function snapshotNotes(s: KnowledgeSnapshot): Presented['notes'] {
  const out: Presented['notes'] = [];
  const waiting = s.unsent > 0 ? ` ${n(s.unsent)} of your latest changes on this device have not reached your account yet; they are counted here.` : '';
  if (s.authority === 'device') {
    out.push({ text: 'Not signed in: counted from the vocabulary kept on this device.' });
    return out;
  }
  if (s.state === 'verified') {
    out.push({ text: `Checked against your account just now.${waiting}` });
    return out;
  }
  const since = s.lastVerifiedAt !== undefined ? ` It was last level with your account on ${when(s.lastVerifiedAt)}.` : ' It has not been checked against your account on this device.';
  const why: Record<NonNullable<KnowledgeSnapshot['reason']>, string> = {
    offline: 'This device is offline, so your account could not be checked.',
    'needs-sign-in': 'Your sign-in is no longer accepted, so your account could not be checked. Sign in again in GoLearn setup.',
    unreachable: 'Your account could not be reached.',
    timeout: 'Your account did not answer in time.',
    incomplete: 'Your account’s history could not be read to its end.',
    'refused-events': 'Part of your account’s history could not be stored on this device.',
    'deletions-unknown': 'Your account could not say which records you have deleted, so this device may still count some of them.',
    'mixed-accounts': 'This device holds the history of more than one account, so the figure may include another account’s words. Clear this device’s data in GoLearn setup and sign in again to get your own figure.',
  };
  const reason = s.reason ? why[s.reason] : 'Your account could not be checked.';
  out.push({ text: `A definitive current figure is not available. ${reason}${s.reason === 'mixed-accounts' ? '' : ` The figure uses the vocabulary on this device.${since}`}${waiting}`, warn: true });
  return out;
}

export function presentResult(r: ReadingResult, stale = false): Presented {
  const c = r.coverage;
  const k = c.counts;
  const language = languageNameOf(r.languageId);
  const variety = r.varietyId ? varietyOf(r.languageId, r.varietyId)?.name : undefined;
  const unverified = r.snapshot.state !== 'verified';
  const figure = `${formatPercent(c.knownOccurrences, k.total)} Known${variety ? ` in ${variety}` : ''}${unverified ? ' (not verified)' : ''}`;
  const count = `${n(c.knownOccurrences)} of ${words(k.total)}`;
  const where = r.scope.kind === 'reader' ? 'The reading area' : r.scope.kind === 'main' ? 'The main content' : 'The whole page';
  const scope = `${where}${r.scope.title ? ` of “${r.scope.title}”` : ''} · ${language}`;

  const notes: Presented['notes'] = [];
  if (stale) notes.push({ text: 'The text on the page has changed since this analysis. Analyse the page again.', warn: true });
  if (!r.scope.complete) {
    notes.push({ text: `Only the first ${formatPercent(r.scope.analysedCharacters, r.scope.characters)} of this text was read (it is too long to read whole), so the figure is for that part, not for the whole text.`, warn: true });
  }
  if (k.unsettled > 0) {
    notes.push({ text: `A further ${formatPercent(k.unsettled, k.total)} (${words(k.unsettled)}) are Known in your ${language} record with no variety recorded. They are not counted as Known${variety ? ` in ${variety}` : ''}.` });
  }
  const undecided = k.ambiguous + k.unidentified;
  if (undecided > 0) {
    const parts: string[] = [];
    if (k.unidentified > 0) parts.push(`${words(k.unidentified)} could not be identified`);
    if (k.ambiguous > 0) parts.push(`${words(k.ambiguous)} can be read as more than one word, of which you know only some`);
    notes.push({ text: `${parts.join(', and ')}. Counting them, Known is between ${formatPercent(c.knownOccurrences, k.total)} and ${formatPercent(c.knownOccurrences + undecided, k.total)}.` });
  }
  if (r.dictionary === 'unavailable' && k.unidentified > 0) {
    notes.push({ text: `The ${language} dictionary could not be asked about every word (it is offline or not downloaded), so more words are unidentified than need be.`, warn: true });
  }
  if (r.scope.foreignBlocks > 0) notes.push({ text: `${n(r.scope.foreignBlocks)} ${r.scope.foreignBlocks === 1 ? 'passage marked' : 'passages marked'} as another language ${r.scope.foreignBlocks === 1 ? 'was' : 'were'} left out.` });
  notes.push(...snapshotNotes(r.snapshot));
  return { figure, count, scope, notes };
}

/** What is shown while a run goes on. */
export function presentProgress(stage: ReadingStage, progress?: ReadingStatus['progress']): string {
  const share = progress && progress.total > 0 ? ` ${Math.min(100, Math.floor((progress.done / progress.total) * 100))}%` : '';
  switch (stage) {
    case 'extracting': return 'Reading the text of the page…';
    case 'resolving': return `Identifying the words…${share}`;
    case 'verifying': return `Checking your vocabulary…${share}`;
    case 'calculating': return 'Counting…';
    case 'canceled': return 'Analysis cancelled.';
    default: return '';
  }
}
