/// <reference types="node" />
/**
 * The Hindi linguistic gold set: sentences chosen because an analyzer gets them wrong in ways that would MISLEAD a
 * learner (ने, को, agreement, oblique forms, pronouns, compound verbs, complex predicates, causatives, the passive,
 * relative–correlative pairs, honorific agreement, auxiliary chains, the unwritten a, nukta, conjuncts, Sanskrit- and
 * Persian-derived vocabulary, ambiguous words), each with what a correct analysis says.
 *
 * Two files under data/benchmarks/hi/:
 *   gold-draft.jsonl   items drafted by a model. They are QUESTIONS for a reviewer, not ground truth.
 *   gold.jsonl         items a named native reviewer has accepted (possibly after correcting them), each with the
 *                      reviewer, the date and a hash of what was accepted. Only these are ever called "gold".
 * No model judgement is written into gold.jsonl: `accept` refuses without a reviewer's name, and an item whose content
 * no longer matches its hash is reported as stale and not counted.
 */
import crypto from 'node:crypto';
import fs from 'node:fs';

export const DRAFT_FILE = 'data/benchmarks/hi/gold-draft.jsonl';
export const GOLD_FILE = 'data/benchmarks/hi/gold.jsonl';

export interface GoldToken {
  /** The word as written in the sentence (its first occurrence unless `nth` says otherwise). */
  surface: string;
  nth?: number;
  lemma?: string;
  pos?: string;
  /** Features that must hold (a subset; a comma list means any of). */
  feats?: Record<string, string>;
  /** The parts of a fused word, as written: ["उस", "ने"]. */
  parts?: string[];
  /** The word as said, in a bare Latin skeleton (lower case, no diacritics): where the unwritten a is and is not said. */
  said?: string;
  /** A register layer the reading must carry ('sanskritic', 'perso-arabic', 'biblical' …). */
  register?: string;
}

export interface GoldItem {
  id: string;
  /** What the item is about: 'ne', 'ko', 'agreement', 'oblique', 'pronoun', 'compound-verb', 'complex-predicate', 'causative', 'passive', 'relative-correlative', 'honorific', 'auxiliary-chain', 'schwa', 'nukta', 'conjunct', 'register', 'ambiguity', 'segmentation'. */
  category: string;
  sentence: string;
  english: string;
  tokens?: GoldToken[];
  /** Multiword units that must be found, each as its lemmas (["कहना", "देना"], ["याद", "करना"]). */
  phrases?: string[][];
  /** Multiword units that must NOT be found here (a look-alike). */
  notPhrases?: string[][];
  /** Construction keys that must be found (keys of HINDI_CONSTRUCTIONS). */
  constructions?: string[];
  /** The number of sentences the text must be split into, when the item is about sentence boundaries. */
  sentences?: number;
  /** What a learner would be told wrongly if the analysis fails here. */
  harm: string;
  notes?: string;
  status: 'draft' | 'accepted';
  draftedBy?: string;
  acceptedBy?: string;
  acceptedAt?: string;
  /** Hash of the judged content at the time of acceptance. */
  acceptedHash?: string;
}

/** The part of an item a reviewer judges: everything except its bookkeeping. */
export function judgedContent(item: GoldItem): string {
  const { status: _s, draftedBy: _d, acceptedBy: _b, acceptedAt: _a, acceptedHash: _h, notes: _n, ...judged } = item;
  const sort = (v: unknown): unknown => Array.isArray(v) ? v.map(sort) : v && typeof v === 'object' ? Object.fromEntries(Object.entries(v as Record<string, unknown>).sort(([a], [b]) => (a < b ? -1 : 1)).map(([k, x]) => [k, sort(x)])) : v;
  return JSON.stringify(sort(judged));
}
export const hashOf = (item: GoldItem): string => crypto.createHash('sha256').update(judgedContent(item).normalize('NFC'), 'utf8').digest('hex').slice(0, 16);

export function readItems(file: string): { items: GoldItem[]; problems: string[] } {
  const items: GoldItem[] = [];
  const problems: string[] = [];
  if (!fs.existsSync(file)) return { items, problems };
  fs.readFileSync(file, 'utf8').split(/\r?\n/).forEach((line, n) => {
    if (!line.trim()) return;
    try {
      const it = JSON.parse(line) as GoldItem;
      if (!it.id || !it.sentence || !it.category || !it.harm) problems.push(`${file}:${n + 1}: an item needs id, category, sentence and harm`);
      else if (it.sentence !== it.sentence.normalize('NFC')) problems.push(`${file}:${n + 1} (${it.id}): the sentence is not NFC`);
      else items.push(it);
    } catch (e) { problems.push(`${file}:${n + 1}: not valid JSON (${e instanceof Error ? e.message : String(e)})`); }
  });
  const seen = new Set<string>();
  for (const it of items) { if (seen.has(it.id)) problems.push(`${file}: duplicate id ${it.id}`); seen.add(it.id); }
  return { items, problems };
}

export const writeItems = (file: string, items: GoldItem[]): void => fs.writeFileSync(file, items.map((i) => JSON.stringify(i)).join('\n') + (items.length ? '\n' : ''), 'utf8');

/** Accepted items whose content still matches what was accepted; the rest are stale. */
export function soundGold(items: GoldItem[]): { sound: GoldItem[]; stale: GoldItem[] } {
  const sound: GoldItem[] = [];
  const stale: GoldItem[] = [];
  for (const it of items) (it.status === 'accepted' && !!it.acceptedBy && it.acceptedHash === hashOf(it) ? sound : stale).push(it);
  return { sound, stale };
}

/** A name that is a tool or a model, not a person: such a "reviewer" is refused. */
const NOT_A_PERSON = /\b(claude|gpt|gemini|llama|copilot|model|llm|ai|assistant|bot|script|automatic|auto)\b/i;

export type AcceptResult = { ok: true; gold: GoldItem[]; accepted: string[] } | { ok: false; reason: string };

/**
 * A named reviewer takes drafts into the gold set, as they stand at that moment. Pure: returns the new gold list or the
 * reason for refusing. Refused without a reviewer's name, for a name that is a tool or a model, for a malformed date,
 * for an unknown id, and when nothing was chosen. Nothing here judges Hindi.
 */
export function acceptDrafts(drafts: GoldItem[], gold: GoldItem[], o: { by?: string; ids?: string[]; all?: boolean; date?: string }): AcceptResult {
  const by = (o.by ?? '').trim();
  if (!by) return { ok: false, reason: 'accept needs --by "<the reviewer\'s name>": the gold set holds only what a named person accepted' };
  if (NOT_A_PERSON.test(by)) return { ok: false, reason: `"${by}" looks like a tool or a model, not a person: only a native reviewer's own judgement enters the gold set` };
  const date = o.date ?? new Date().toISOString().slice(0, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return { ok: false, reason: `--date must be YYYY-MM-DD, got "${date}"` };
  const ids = o.ids ?? [];
  if (!o.all && ids.length === 0) return { ok: false, reason: 'say which drafts: --id <id>[,<id>] or --all' };
  const chosen: GoldItem[] = [];
  for (const id of o.all ? drafts.map((d) => d.id) : ids) {
    const d = drafts.find((x) => x.id === id);
    if (!d) return { ok: false, reason: `no draft with id "${id}"` };
    chosen.push(d);
  }
  const next = new Map<string, GoldItem>(gold.map((g) => [g.id, g]));
  for (const d of chosen) {
    const accepted: GoldItem = { ...d, status: 'accepted', acceptedBy: by, acceptedAt: date };
    accepted.acceptedHash = hashOf(accepted);
    next.set(d.id, accepted);
  }
  return { ok: true, gold: [...next.values()].sort((a, b) => (a.id < b.id ? -1 : 1)), accepted: chosen.map((c) => c.id) };
}
