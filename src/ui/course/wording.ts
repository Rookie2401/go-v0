/**
 * Plain wording for the reading ladder, in one place and free of React so tests can pin it.
 *
 * Rights lines never say more than the data says: "public domain" appears only for a work whose rights were checked by a
 * person (`verified`) and recorded as public domain. A recorded-but-unchecked status is described as exactly that.
 */
import type { ReadinessSignal, ReadingPace, RegisterTag, Work, WorkRights, WorkRole } from '../../core';

const COPY_ADVICE = 'Read it from your own copy.';

/** One honest sentence (two with the advice) about what is known of a work's rights. */
export function rightsLine(r: WorkRights): string {
  const advice = r.userImportOnly || !r.canBundle ? ` ${COPY_ADVICE}` : '';
  if (!r.verified) {
    switch (r.copyrightStatus) {
      case 'in-copyright': return `In copyright (presumed, not verified).${advice}`;
      case 'unknown': return `Rights not researched.${advice}`;
      // A claim of any other status that nobody has checked is reported as unchecked, never as the status itself.
      default: return `A rights status is recorded but has not been verified.${advice}`;
    }
  }
  switch (r.copyrightStatus) {
    case 'public-domain': return `Public domain (checked against a source).${advice}`;
    case 'licensed': return `Licensed (checked against a source).${advice}`;
    case 'in-copyright': return `In copyright (checked against a source).${advice}`;
    case 'unknown': return `Rights checked; no status could be established.${advice}`;
  }
}

/** The rights line of a work as the ladder shows it. A listening work is a recommendation of audio Go does not supply, so no copy is asked for. */
export const workRightsLine = (w: Work): string => (w.role === 'audio' ? 'A listening recommendation. Go does not supply the audio.' : rightsLine(w.rights));

/** What a word-analysis share means to the learner. "Every word" only when it is exactly all of them. */
export const coverageSentence = (fraction: number): string => (fraction >= 1
  ? 'Every word has an analysis.'
  : `${Math.round(fraction * 100)}% have an analysis; the rest show “not analysed yet”.`);

/** The basis and bibliographic notes behind the rights line, when the data has them (a lead, not a conclusion). */
export function rightsDetail(w: Work): string[] {
  const out: string[] = [];
  if (w.rights.basis) out.push(`Basis: ${w.rights.basis}`);
  if (w.rights.licensing) out.push(`Licence: ${w.rights.licensing}`);
  if (w.rights.acquisitionNotes) out.push(w.rights.acquisitionNotes);
  if (w.publisher) out.push(`Publisher: ${w.publisher}`);
  if (w.edition) out.push(`Edition: ${w.edition}`);
  if (w.isbn) out.push(`ISBN: ${w.isbn}`);
  if (w.source) out.push(`Source: ${w.source}`);
  if (w.digitalAvailability) out.push(`Digital availability: ${w.digitalAvailability}`);
  if (!w.bibliographyVerified) out.push('The bibliographic details have not been checked against the book.');
  return out;
}

/** Variety names as the learner meets them. 'standard' is the unmarked case and gets no chip. */
const REGISTER_LABEL: Record<RegisterTag, string> = {
  standard: 'standard', colloquial: 'colloquial', formal: 'formal', literary: 'literary', archaic: 'older language',
  historical: 'historical', royal: 'royal vocabulary', religious: 'religious', 'regional-isan': 'Isan regional',
  'regional-north': 'northern regional', 'regional-south': 'southern regional', teochew: 'Teochew', 'child-directed': 'for children', slang: 'slang',
};
export const registerChips = (w: Pick<Work, 'registers'>): string[] => (w.registers ?? []).filter((r) => r !== 'standard').map((r) => REGISTER_LABEL[r] ?? r);

/** Groups of works within a stage, in the order they are shown. */
const ROLE_GROUPS: Array<{ key: string; label: string; roles: WorkRole[] }> = [
  { key: 'spine', label: 'Main reading', roles: ['spine'] },
  { key: 'also', label: 'Also at this stage', roles: ['subsidiary', 'scripture'] },
  { key: 'nonfiction', label: 'Nonfiction', roles: ['nonfiction'] },
  { key: 'extensive', label: 'Extensive reading', roles: ['extensive'] },
  { key: 'listening', label: 'Listening', roles: ['audio'] },
];

export function groupWorks(works: readonly Work[]): Array<{ key: string; label: string; works: Work[] }> {
  return ROLE_GROUPS
    .map((g) => ({ key: g.key, label: g.label, works: works.filter((w) => g.roles.includes(w.role)).sort((a, b) => a.order - b.order) }))
    .filter((g) => g.works.length > 0);
}

// ───────────────────────── readiness ─────────────────────────

export const SIGNAL_STATUS_WORD: Record<ReadinessSignal['status'], string> = {
  met: 'met',
  'not-met': 'not yet',
  'insufficient-data': 'not enough reading yet',
  'not-available': 'not available',
};

export const SIGNAL_LABEL: Record<ReadinessSignal['key'], string> = {
  'lexical-coverage': 'Words you know in what you have read',
  'lookup-rate': 'How often you look a word up',
  'sentence-rescue-rate': 'How often a whole sentence needs explaining',
  'reported-comprehension': 'What you say you understood',
  'reading-pace-trend': 'Reading pace',
  'unfamiliar-material': 'Material you have not read yet',
  retention: 'Words you meet again',
  listening: 'Listening',
  decoding: 'Reading the script',
};

const TREND_WORD: Record<ReadingPace['trend'], string> = {
  faster: 'a little faster than in your earlier sittings',
  steady: 'about the same as in your earlier sittings',
  slower: 'a little slower than in your earlier sittings',
  'insufficient-data': '',
};

const fmt = (n: number): string => (Number.isInteger(n) ? String(n) : n.toFixed(1));

/** One or two plain lines about pace. A rough measure from recorded time on screen; never a score or a target. */
export function paceLines(p: ReadingPace): string[] {
  const out: string[] = [];
  if (p.wordsPerMinute !== undefined) {
    const trend = TREND_WORD[p.trend];
    out.push(`About ${Math.round(p.wordsPerMinute)} words a minute${trend ? `, ${trend}` : ''}. This is a rough figure from how long sentences stayed on screen, not a target.`);
  } else {
    out.push('Not enough timed reading yet to say how fast you read.');
  }
  if (p.sentences > 0) out.push(`You looked up ${fmt(p.lookupsPer100Words)} words per 100 and asked for ${fmt(p.rescuesPer100Sentences)} whole-sentence explanations per 100 sentences.`);
  return out;
}
