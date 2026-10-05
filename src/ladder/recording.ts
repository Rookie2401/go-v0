/**
 * The recording kit for ladder units (docs/LADDER.md, "audio-ready"): what a native speaker reads, and the manifest that
 * GoListen's `importRecordingFor` wants for a CURATED human recording, with everything a person must supply left as an
 * unmistakable placeholder.
 *
 * Nothing here records, imports or approves anything. `manifestReadiness` says what is still missing.
 */
import type { LanguageAdapter, LanguageCode, Sentence } from '../core';
import { ids } from '../core';
import type { AudioImportManifest } from '../core/contracts/golisten';
import type { CorpusDocument } from '../ingest/format';
import { canonicalTextSha256 } from '../golisten/rights';

/** One sentence to be read aloud. */
export interface ScriptSentence {
  /** 1-based number the speaker says aloud (or that names the file: `<unit>-<nn>.wav`). */
  n: number;
  /** The id the importer gives the stored sentence: the manifest's `sentenceId`. */
  id: string;
  /** The exact stored text; this is what is read. */
  text: string;
  /** The speaker's display name in a dialogue, when the document names one. */
  speaker?: string;
  /** Zero-based paragraph index, so the printed script can show paragraph breaks. */
  paragraph: number;
}

export interface RecordingScript {
  unitId: string;
  textId: string;
  lang: LanguageCode;
  variety?: string;
  title: string;
  sentences: ScriptSentence[];
}

/**
 * The unit's sentences in reading order with the ids the importer would give the stored text on a fresh import: the
 * author's id when the document has one, else the hash key of the exact text (`~n` for the n-th repeat in the unit).
 * (Same segmentation and keys as `planDocument`; a test compares them with a real import.)
 */
export function recordingScript(unitDoc: CorpusDocument, adapter: LanguageAdapter): RecordingScript {
  const textId = ids.text(unitDoc.lang, unitDoc.id);
  const speakerName = (id: string | undefined) => (id !== undefined ? unitDoc.speakers?.[id] ?? id : undefined);
  const repeats = new Map<string, number>();
  const sentences: ScriptSentence[] = [];
  let paragraph = 0;
  const add = (text: string, authorId: string | undefined, speaker: string | undefined) => {
    const repeat = repeats.get(text) ?? 0;
    repeats.set(text, repeat + 1);
    sentences.push({
      n: sentences.length + 1, id: ids.sentence(textId, authorId ?? ids.sentenceKey(text, repeat)), text,
      ...(speaker !== undefined ? { speaker } : {}), paragraph,
    });
  };
  for (const sec of unitDoc.sections) {
    for (const par of sec.paragraphs) {
      if ('sentences' in par) for (const s of par.sentences) add(s.text, s.id, speakerName(s.speaker));
      else for (const sp of adapter.segmentSentences(par.text)) add(sp.text, undefined, undefined);
      paragraph++;
    }
  }
  return { unitId: unitDoc.id, textId, lang: unitDoc.lang, ...(unitDoc.variety ? { variety: unitDoc.variety } : {}), title: unitDoc.title, sentences };
}

/** A value a person must replace. Always `<...>`; `manifestReadiness` finds them. */
export const placeholder = (what: string): string => `<${what}>`;
export const isPlaceholder = (v: unknown): boolean => typeof v === 'string' && /^<.*>$/s.test(v.trim());

/**
 * The template is an `AudioImportManifest` in shape, with three honest departures that `importRecordingFor` refuses on
 * purpose: `qualityState` is a placeholder string (not one of the five states), the rights say `pending` and deny every
 * use, and the coverage rows have `null` times and a placeholder review state. `_notes` is ignored by the importer.
 */
export type RecordingManifestTemplate = Omit<AudioImportManifest, 'qualityState' | 'coverage'> & {
  qualityState: string;
  coverage: Array<{ sentenceId: string; startMs: number | null; endMs: number | null; reviewState: string }>;
  _notes: string[];
};

export interface ManifestTemplateOptions {
  adapter: LanguageAdapter;
  /**
   * The content version the recording is for. A fresh import of a document is version 1; a store that has seen earlier
   * versions of the unit stands at a higher number, and the recording must name the one the app will hold.
   */
  contentVersion?: number;
}

/**
 * The manifest a curated human recording needs, ready for a person to complete. `textSha256` is `canonicalTextSha256`
 * of the unit as the importer stores it, so the manifest is bound to this exact wording: any later edit makes it stale.
 */
export async function manifestTemplate(unitDoc: CorpusDocument, opts: ManifestTemplateOptions): Promise<RecordingManifestTemplate> {
  if (unitDoc.contentType === 'scripture' || unitDoc.scripture) throw new Error('recording kit: ladder units are not Scripture; Scripture recordings need an exact-edition manifest');
  const contentVersion = opts.contentVersion ?? 1;
  if (!Number.isInteger(contentVersion) || contentVersion < 1) throw new Error('recording kit: contentVersion must be a positive integer');
  const script = recordingScript(unitDoc, opts.adapter);
  // canonicalTextSha256 reads only each sentence's id and text.
  const stored = script.sentences.map((s) => ({ id: s.id, text: s.text })) as unknown as Sentence[];
  const textSha256 = await canonicalTextSha256(script.textId, contentVersion, stored);
  return {
    id: `${unitDoc.id}-human-1`,
    textId: script.textId,
    contentVersion,
    textSha256,
    releaseId: `${script.textId}@${contentVersion}`,
    lang: unitDoc.lang,
    locale: placeholder(`locale of the recording, e.g. ${unitDoc.locale ?? `${unitDoc.lang}-XX`}`),
    narrator: placeholder('name of the speaker'),
    variety: placeholder(`speaker's variety${unitDoc.variety ? `; the text is written in ${unitDoc.variety}` : ''}`),
    kind: 'human',
    recording: {
      owner: placeholder('who owns the recording'),
      basis: placeholder('how it was made and on what basis it may be used, e.g. recorded for this project under a signed release'),
      license: placeholder('licence, or delete this line'),
      attribution: placeholder('credit line, or delete this line'),
    },
    performance: {
      performer: placeholder('name of the performer'),
      permission: placeholder("the performer's permission, in words, covering in-app playback and cutting the recording into sentences"),
    },
    // Pending and denying everything: a person approves, nothing here does.
    rights: { status: 'pending', playInApp: false, stream: false, offline: false, redistribute: false, segment: false, transform: false },
    qualityState: placeholder('not yet reviewed: set human_reviewed (or approved) only when a named person has reviewed this recording'),
    coverage: script.sentences.map((s) => ({ sentenceId: s.id, startMs: null, endMs: null, reviewState: placeholder('checked or reviewed') })),
    _notes: [
      `Made for ${script.textId} at content version ${contentVersion}; textSha256 binds this exact wording. Any edit to the unit makes this manifest and the recording stale.`,
      'Record only after the unit is reviewed (pipeline state "reviewed"): a correction changes the wording and voids the recording.',
      'coverage: startMs and endMs are null. The importer takes one WAV and one range per sentence (milliseconds into that WAV, in text order, not overlapping, each end after its start). Measure them from the finished recording; nothing in the kit does.',
      'Cut ranges (several sentences, or leading/trailing silence trimmed) need rights.segment true. Spoken sentence numbers lie between ranges and are excluded by them.',
      'Set rights.status "approved" and playInApp (and stream, offline, segment as permitted) true only when the owner and the performer have actually granted them.',
      'qualityState "human_reviewed" or "approved" needs a named reviewer when the recording is imported (origin "curated", reviewer). A learner upload never counts as listening evidence.',
      'The unit is audio-ready only when GoListen audioStatus(textId).evidenceEligible is true: human recording, reviewed quality, reviewed voice, approved rights and a current exact text binding.',
      'ONE READER PER TEXT. GoListen plays one manifest per text today, so a dialogue recorded by several voices (one manifest each) would play only one speaker. Have one person read every role, or split the dialogue into separate texts. (Combining voices is a GoListen change awaiting the owner\'s decision.)',
      'Delete this _notes list before importing, and any optional recording field you are not filling (license, attribution).',
    ],
  };
}

/**
 * What still stands between this manifest and a curated, reviewed human import. Empty = nothing left that the kit can
 * see (the importer still checks the WAV, the text binding and the ranges). `importRecordingFor` itself accepts any
 * non-empty narrator, locale or owner string, so a leftover `<...>` there would pass it: this check is the guard.
 */
export function manifestReadiness(m: RecordingManifestTemplate | AudioImportManifest): string[] {
  const problems: string[] = [];
  const walk = (v: unknown, path: string) => {
    if (isPlaceholder(v)) problems.push(`${path} is still a placeholder`);
    else if (v !== null && typeof v === 'object') {
      for (const [k, x] of Object.entries(v)) if (!k.startsWith('_')) walk(x, Array.isArray(v) ? `${path}[${k}]` : `${path}.${k}`);
    }
  };
  walk(m, 'manifest');
  if (m.kind !== 'human') problems.push('kind must be human');
  if (m.qualityState !== 'human_reviewed' && m.qualityState !== 'approved') problems.push('qualityState must be human_reviewed or approved (a named reviewer is needed at import)');
  if (m.rights.status !== 'approved') problems.push(`rights.status is ${m.rights.status}, not approved`);
  if (m.rights.playInApp !== true) problems.push('rights.playInApp is not true');
  if (m.rights.segment !== true) problems.push('rights.segment is not true (needed for per-sentence ranges)');
  m.coverage.forEach((c, i) => {
    if (typeof c.startMs !== 'number' || typeof c.endMs !== 'number') problems.push(`coverage[${i}] (${c.sentenceId}) has no startMs/endMs`);
    else if (!(c.endMs > c.startMs) || c.startMs < 0) problems.push(`coverage[${i}] (${c.sentenceId}) has an invalid range`);
    if (c.reviewState !== 'reviewed') problems.push(`coverage[${i}] (${c.sentenceId}) reviewState is not reviewed`);
  });
  return problems;
}

// ───────────────────────── the printable script ─────────────────────────

const esc = (s: string): string => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

export interface PacketHtmlOptions {
  script: RecordingScript;
  contentVersion: number;
  textSha256: string;
  /** `pipeline.state` of the unit, when the document carries one. */
  pipelineState?: string;
}

const REVIEWED_OR_LATER = new Set(['reviewed', 'audio-ready', 'published']);

/** The speaker's printable page, with the keeper's notes on the last page. */
export function packetHtml(o: PacketHtmlOptions): string {
  const { script } = o;
  const pad = (n: number) => String(n).padStart(2, '0');
  const file = (n: number) => `${script.unitId}-${pad(n)}.wav`;
  const ready = o.pipelineState !== undefined && REVIEWED_OR_LATER.has(o.pipelineState);
  const warn = o.pipelineState === undefined
    ? 'This unit carries no pipeline record, so nothing here shows that it has been reviewed.'
    : ready ? '' : `This unit is "${o.pipelineState}", not yet reviewed.`;
  let lastParagraph = -1;
  const rows = script.sentences.map((s) => {
    const gap = s.paragraph !== lastParagraph && lastParagraph !== -1 ? ' class="para"' : '';
    lastParagraph = s.paragraph;
    return `<li value="${s.n}"${gap}><span class="n">${pad(s.n)}</span>${s.speaker ? `<span class="who">${esc(s.speaker)}</span>` : ''}<span class="t" lang="${esc(script.lang)}">${esc(s.text)}</span></li>`;
  }).join('\n');
  return `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><title>Recording script: ${esc(script.unitId)}</title>
<style>
body{font:16px/1.5 Georgia,serif;max-width:46rem;margin:2rem auto;padding:0 1rem;color:#111}
h1{font-size:1.5rem;margin:0 0 .25rem}h2{font-size:1.1rem;margin:1.5rem 0 .4rem}
.meta{color:#444;margin:0 0 1rem}.box{border:1px solid #888;padding:.6rem .9rem;margin:1rem 0}
.warn{border-color:#b00;background:#fdecec}
ol{list-style:none;padding:0;margin:0}li{display:flex;gap:.8rem;padding:.45rem 0;border-bottom:1px solid #ddd;break-inside:avoid;font-size:1.25rem}
li.para{margin-top:1rem}.n{font:600 .95rem monospace;min-width:2rem;color:#555;padding-top:.3rem}.who{font-size:.9rem;color:#555;min-width:5rem;padding-top:.3rem}
.small{font-size:.9rem;color:#333}.keeper{break-before:page}
table{border-collapse:collapse}td{border:1px solid #aaa;padding:.3rem .6rem;min-width:14rem}
@media print{body{margin:1cm}}
</style></head><body>
<h1>${esc(script.title)}</h1>
<p class="meta">Unit <b>${esc(script.unitId)}</b> &middot; language <b>${esc(script.lang)}</b>${script.variety ? ` &middot; variety <b>${esc(script.variety)}</b>` : ''} &middot; ${script.sentences.length} sentences</p>
<div class="box"><b>How to record</b>
<ul>
<li style="display:block;border:0;font-size:1rem;padding:.1rem 0">Read in your own natural voice and at your natural pace. Do not slow down or exaggerate: learners need to hear real speech.</li>
<li style="display:block;border:0;font-size:1rem;padding:.1rem 0">Use the way people speak where you live (${script.variety ? esc(script.variety) : 'tell us your region'}). If a sentence sounds wrong or unnatural to you, read it as you would say it and mark it; do not silently change it.</li>
${script.sentences.some((s) => s.speaker) ? '<li style="display:block;border:0;font-size:1rem;padding:.1rem 0">This text is a dialogue. Please read every part yourself — one voice for the whole text (the app cannot yet play several voices in one text).</li>\n' : ''}<li style="display:block;border:0;font-size:1rem;padding:.1rem 0">Say each numbered sentence once, then pause for a second or two before the next. If you make a mistake, pause, say the number again and re-read that sentence; do not start over.</li>
<li style="display:block;border:0;font-size:1rem;padding:.1rem 0">Quiet room, same distance from the microphone throughout, no music. Save as WAV.</li>
<li style="display:block;border:0;font-size:1rem;padding:.1rem 0"><b>Files:</b> either one long file named <code>${esc(script.unitId)}.wav</code> in which you say each number aloud before its sentence (in your own language), or one file per sentence named <code>${esc(file(1))}</code>, <code>${esc(file(2))}</code>, and so on.</li>
</ul></div>
${warn ? `<div class="box warn"><b>Wait.</b> ${esc(warn)} Recording should wait until the unit is reviewed: a correction changes the wording and makes a finished recording unusable.</div>` : ''}
<p class="small">Made for content version <b>${o.contentVersion}</b>, text fingerprint <code>${esc(o.textSha256.slice(0, 16))}&hellip;</code> (full value in <code>${esc(script.unitId)}.manifest.json</code>). If the unit's wording changes, this page is out of date.</p>
<h2>Sentences</h2>
<ol>
${rows}
</ol>
<h2>Speaker details</h2>
<table>
<tr><td>Name of the speaker</td><td>&nbsp;</td></tr>
<tr><td>Where you speak this variety (town, region)</td><td>&nbsp;</td></tr>
<tr><td>Date of recording</td><td>&nbsp;</td></tr>
<tr><td>Sentences you would say differently (numbers)</td><td>&nbsp;</td></tr>
<tr><td>Your permission for in-app playback and for cutting the recording into sentences (yes / no, signature)</td><td>&nbsp;</td></tr>
</table>
<div class="keeper"><h2>For the keeper (not for the speaker)</h2>
<ul class="small">
<li>Text: <code>${esc(script.textId)}</code>, content version ${o.contentVersion}, release <code>${esc(script.textId)}@${o.contentVersion}</code>, SHA-256 <code>${esc(o.textSha256)}</code>.</li>
<li>Complete <code>${esc(script.unitId)}.manifest.json</code>: every <code>&lt;...&gt;</code> value, the rights (only what the owner and the performer have granted), and one startMs/endMs per sentence measured from the finished WAV. Delete <code>_notes</code> before import.</li>
<li>Import as origin <code>curated</code> with the name of the person who reviewed the recording. A learner upload never counts as listening evidence.</li>
<li>The unit is audio-ready only when GoListen <code>audioStatus(textId).evidenceEligible</code> is true (human recording, reviewed quality, reviewed voice, approved rights, current exact text binding). Then record <code>audio-ready</code> in the unit's pipeline history with the recording's reference.</li>
<li>The import binds to this exact wording at this content version in the app's store. If the app holds another version, regenerate this packet with <code>--content-version</code>.</li>
</ul></div>
</body></html>
`;
}
