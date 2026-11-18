/**
 * One Alphabet Sprint session: what to ask, in what order, and why. Reading comes first, the alphabet is never the goal:
 *
 *   1. Cards that are DUE (the scheduler's own decision: GoReview's FSRS fold) — retention is the scheduler's job, not ours.
 *   2. A few NEW units chosen by reading utility (select.ts), each followed at once by a real word it makes decodable, so a word
 *      is read within the first cards; fewer new units while earlier ones are still shaky.
 *   3. A CONTRAST card when the learner has missed one of two easily confused units, or when both arrive in the same sprint.
 *   4. A short PHRASE once enough words are decodable.
 *   5. More real words the learner can now decode and has not met (new combinations), until the deck size is reached or none
 *      is left. Never filler: no card is added just to reach a number.
 *
 * A word card is decoding practice: its back gives the pronunciation and a meaning, but its review is a Sprint card review and
 * never vocabulary knowledge (ids.ts). Pure: `now` and the card states are passed in.
 */
import { contrastKey, parseSprintUnitId, sprintUnitId } from './ids';
import { atLeast, defaultTradition, LEVEL_RANK, readyUnits, READY, type SprintCardState, type UnitKnowledge } from './knowledge';
import { decodableWith, selectNextUnits, wordDependencies, type WordDeps } from './select';
import type { ScriptProfile, ScriptUnit, SprintCard, SprintCardKind } from './types';

const traditionOf = (p: ScriptProfile): string | undefined => (defaultTradition(p) ? undefined : p.tradition!.id);
const idFor = (p: ScriptProfile, kind: SprintCardKind, key: string): string => sprintUnitId(p.languageId, kind, key, traditionOf(p));

function unitCard(p: ScriptProfile, u: ScriptUnit, reason: string): SprintCard {
  const kind: SprintCardKind = u.kind === 'rule' ? 'rule' : 'character';
  const parts = [u.sound];
  if (u.example) parts.push(`${u.example.form} — ${u.example.gloss}`);
  if (u.note) parts.push(u.note);
  return { kind, unitId: idFor(p, kind, u.key), front: u.display, back: parts.join(' · '), reason };
}

function wordCard(p: ScriptProfile, kind: 'word' | 'phrase', form: string, gloss: string, pronunciation: string | undefined, reason: string): SprintCard {
  return { kind, unitId: idFor(p, kind, form), front: form, back: pronunciation ? `${pronunciation} — ${gloss}` : gloss, reason };
}

function contrastCard(p: ScriptProfile, a: ScriptUnit, b: ScriptUnit, tell: string, reason: string): SprintCard {
  const [x, y] = [a, b].sort((m, n) => (m.key < n.key ? -1 : 1));
  return { kind: 'contrast', unitId: idFor(p, 'contrast', contrastKey(a.key, b.key)), front: `${x.display}   ${y.display}`,
    back: `${x.display} ${x.sound} · ${y.display} ${y.sound} — ${tell}`, reason };
}

/** The card a Sprint unit id stands for (front and back from the profile), or undefined when the profile no longer has it. */
export function sprintCardFor(p: ScriptProfile, unitId: string): SprintCard | undefined {
  const id = parseSprintUnitId(unitId);
  if (!id || id.languageId !== p.languageId || (id.tradition ?? undefined) !== traditionOf(p)) return undefined;
  const unit = (key: string) => p.units.find((u) => u.key === key);
  if (id.kind === 'character' || id.kind === 'rule') { const u = unit(id.key); return u ? unitCard(p, u, 'asked again') : undefined; }
  if (id.kind === 'word') { const w = p.words.find((x) => x.form === id.key); return w ? wordCard(p, 'word', w.form, w.gloss, w.pronunciation, 'asked again') : undefined; }
  if (id.kind === 'phrase') { const w = p.phrases.find((x) => x.form === id.key); return w ? wordCard(p, 'phrase', w.form, w.gloss, w.pronunciation, 'asked again') : undefined; }
  const [ka, kb] = id.key.split('|');
  const c = p.confusions.find((x) => contrastKey(x.a, x.b) === id.key);
  const a = unit(ka), b = unit(kb);
  return c && a && b ? contrastCard(p, a, b, c.tell, 'asked again') : undefined;
}

export interface SprintProgress {
  /** Units the language has that are not already familiar to an English reader. */
  totalUnits: number;
  /** Of those, ready for decoding (recognised or better). */
  readyUnits: number;
  /** Starter words the learner can decode now, and how many there are. */
  decodableWords: number;
  totalWords: number;
  /** Starter phrases decodable now. */
  decodablePhrases: number;
  /** The first real word has been decoded right (a word card answered Good or Easy). */
  firstWordRead: boolean;
  /** Enough decodable reading to make a real page worth trying (see READY_FOR_WEB). */
  readyForWeb: boolean;
  /** The next units the selector would teach (for "three useful letters to learn next"). */
  nextUnits: string[];
  /** One plain sentence for the learner. */
  message: string;
}

/** A page is worth trying once 20 starter words or 40 % of their weight are decodable, whichever comes first. */
export const READY_FOR_WEB = { words: 20, weightShare: 0.4 } as const;

export interface PlanInput {
  profile: ScriptProfile;
  knowledge: ReadonlyMap<string, UnitKnowledge>;
  /** The learner's Sprint cards of this language (any tradition: the plan keeps its own). */
  cards: readonly SprintCardState[];
  now: string;
  /** The deck size the learner chose (cards per deck). */
  size: number;
  /** Unit occurrences on the learner's page (pageStats.ts), optional. */
  pageCounts?: ReadonlyMap<string, number>;
}

export interface SprintPlan { cards: SprintCard[]; progress: SprintProgress }

export function planSprint(input: PlanInput): SprintPlan {
  const { profile: p, knowledge, now } = input;
  const size = Math.max(1, Math.floor(input.size));
  const tradition = traditionOf(p);
  const mine = input.cards.filter((c) => { const id = parseSprintUnitId(c.unitId); return !!id && id.languageId === p.languageId && (id.tradition ?? undefined) === tradition; });
  const byId = new Map(mine.map((c) => [c.unitId, c] as const));
  const words = wordDependencies(p);
  const ready = readyUnits(knowledge);
  const unitOf = new Map(p.units.map((u) => [u.key, u] as const));
  const out: SprintCard[] = [];
  const taken = new Set<string>();
  const push = (c: SprintCard | undefined): void => { if (c && !taken.has(c.unitId) && out.length < size) { out.push(c); taken.add(c.unitId); } };

  // 1. due cards, oldest due first (only cards already answered once: a card never answered is not due work)
  const nowMs = Date.parse(now);
  const due = mine.filter((c) => c.status === 'active' && c.history.some((e) => !e.retracted) && Date.parse(c.due) <= nowMs)
    .sort((a, b) => Date.parse(a.due) - Date.parse(b.due) || (a.unitId < b.unitId ? -1 : 1));
  for (const c of due) push(sprintCardFor(p, c.unitId) && { ...sprintCardFor(p, c.unitId)!, reason: 'due' });

  // 2. new units, each followed by a word it unlocks
  const introduced = new Set(mine.flatMap((c) => { const id = parseSprintUnitId(c.unitId)!; return id.kind === 'character' || id.kind === 'rule' ? [id.key] : []; }));
  const shaky = [...introduced].filter((k) => !atLeast(knowledge.get(k), READY));
  const firstSprint = mine.length === 0;
  const room = size - out.length;
  let count = firstSprint ? p.firstBatch : Math.max(0, p.laterBatch - shaky.length);
  count = Math.min(count, Math.max(0, Math.floor(room / 2)));
  const fresh = count > 0 ? selectNextUnits(p, { count, ready, exclude: introduced, pageCounts: input.pageCounts }, words) : [];
  const usedWords = new Set(mine.flatMap((c) => { const id = parseSprintUnitId(c.unitId)!; return id.kind === 'word' ? [id.key] : []; }));
  const pickWord = (have: ReadonlySet<string>, mustUse: readonly string[]): WordDeps | undefined => words
    .filter(({ word, deps }) => !usedWords.has(word.form) && !taken.has(idFor(p, 'word', word.form)) && decodableWith(deps, have) && deps.some((d) => mustUse.includes(d)))
    .sort((a, b) => b.word.weight - a.word.weight || a.deps.length - b.deps.length || (a.word.form < b.word.form ? -1 : 1))[0];
  const growing = new Set(ready);
  for (const key of fresh) {
    const u = unitOf.get(key);
    if (!u) continue;
    push(unitCard(p, u, firstSprint ? 'first letters: chosen for the words they unlock' : 'next letter: chosen for the words it unlocks'));
    growing.add(key);
    const w = pickWord(growing, [key]);
    if (w) { push(wordCard(p, 'word', w.word.form, w.word.gloss, w.word.pronunciation, `first word with ${u.display}`)); usedWords.add(w.word.form); }
  }

  // 3. contrasts: a demonstrated confusion, or a confusable pair introduced together
  for (const c of p.confusions) {
    const a = unitOf.get(c.a), b = unitOf.get(c.b);
    if (!a || !b || byId.has(idFor(p, 'contrast', contrastKey(c.a, c.b)))) continue;
    const ka = knowledge.get(c.a), kb = knowledge.get(c.b);
    const met = (k: string) => introduced.has(k) || fresh.includes(k);
    const missed = (k: UnitKnowledge | undefined) => !!k && (k.lapses > 0 || k.lastMissed);
    if (met(c.a) && met(c.b) && (missed(ka) || missed(kb))) push(contrastCard(p, a, b, c.tell, 'you mixed these up'));
    else if (fresh.includes(c.a) && fresh.includes(c.b)) push(contrastCard(p, a, b, c.tell, 'easily confused: met together'));
  }

  // 4. a phrase once enough words are decodable
  const decodableNow = words.filter(({ deps }) => decodableWith(deps, growing));
  if (decodableNow.length >= 5) {
    const phrase = p.phrases.find((ph) => { const deps = p.dependencies(ph.form); return !!deps && decodableWith(deps, growing) && !byId.has(idFor(p, 'phrase', ph.form)); });
    if (phrase) push(wordCard(p, 'phrase', phrase.form, phrase.gloss, phrase.pronunciation, 'your first phrase'));
  }

  // 5. more new combinations of known units, most useful first; none added once nothing new is decodable
  for (const { word } of decodableNow.filter(({ word }) => !usedWords.has(word.form)).sort((a, b) => b.word.weight - a.word.weight || (a.word.form < b.word.form ? -1 : 1))) {
    if (out.length >= size) break;
    push(wordCard(p, 'word', word.form, word.gloss, word.pronunciation, 'a new word from letters you know'));
    usedWords.add(word.form);
  }

  return { cards: out, progress: sprintProgress(p, knowledge, mine, input.pageCounts) };
}

export function sprintProgress(p: ScriptProfile, knowledge: ReadonlyMap<string, UnitKnowledge>, cards: readonly SprintCardState[], pageCounts?: ReadonlyMap<string, number>): SprintProgress {
  const words = wordDependencies(p);
  const ready = readyUnits(knowledge);
  const teachable = p.units.filter((u) => !u.familiar);
  const decodable = words.filter(({ deps }) => decodableWith(deps, ready));
  const weightAll = words.reduce((s, w) => s + w.word.weight, 0) || 1;
  const weightNow = decodable.reduce((s, w) => s + w.word.weight, 0);
  const decodablePhrases = p.phrases.filter((ph) => { const d = p.dependencies(ph.form); return !!d && decodableWith(d, ready); }).length;
  const firstWordRead = cards.some((c) => { const id = parseSprintUnitId(c.unitId); return !!id && (id.kind === 'word' || id.kind === 'phrase') && c.history.some((e) => !e.retracted && e.rating >= 3); });
  const readyForWeb = decodable.length >= READY_FOR_WEB.words || weightNow / weightAll >= READY_FOR_WEB.weightShare;
  const introduced = new Set(cards.flatMap((c) => { const id = parseSprintUnitId(c.unitId); return id && (id.kind === 'character' || id.kind === 'rule') ? [id.key] : []; }));
  const nextUnits = selectNextUnits(p, { count: 3, ready, exclude: introduced, pageCounts }, words);
  const readyCount = teachable.filter((u) => ready.has(u.key)).length;
  const unitWord = (n: number) => (n === 1 ? 'letter' : 'letters');
  const message = !cards.length ? 'Start with a few letters and read your first word.'
    : readyForWeb ? `You can read ${decodable.length} words. Ready to try a webpage.`
    : firstWordRead ? `You can read ${decodable.length} ${decodable.length === 1 ? 'word' : 'words'}. ${nextUnits.length} useful ${unitWord(nextUnits.length)} to learn next.`
    : 'Read your first word: a few letters are enough.';
  return { totalUnits: teachable.length, readyUnits: readyCount, decodableWords: decodable.length, totalWords: words.length, decodablePhrases, firstWordRead, readyForWeb, nextUnits, message };
}

/** The highest level reached by any unit (for tests and diagnostics). */
export const maxLevel = (k: ReadonlyMap<string, UnitKnowledge>): number => Math.max(0, ...[...k.values()].map((x) => LEVEL_RANK[x.level]));
