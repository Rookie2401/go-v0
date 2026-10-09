/**
 * The GoTell prompt registry: communicative goals for the learner's own writing. A prompt states WHAT to express and
 * never HOW to word it; it contains no model paragraph, no template testimony and no first-person experience. Every prompt
 * in this file is machine-drafted and not reviewed by a native speaker or a field worker (see ./README.md).
 *
 * Language-neutral prompts carry languageIds ['*'] and no grammar targets. A language-specific variant has the id
 * `<base>.<languageId>` (today only `.sq`): it adds grammar targets from the pack, pack-attested sentence frames, and short
 * cultural notes, and `promptsFor` shows it in place of its neutral base for that language.
 *
 * Testimony prompts are optional, in any order: a `section` is a topic tag, never a position, and every testimony prompt
 * says "write what is true for you; skip what does not apply".
 */
import { PACKS, SQ_PASSAGE, SQ_TUTORIAL_STEPS, TEAMS } from '../../../language-packs/src';
import { PROMPT_CATEGORIES } from '../types';
import type { PromptCategory, WritingMode, WritingPrompt } from '../types';

type Difficulty = WritingPrompt['difficulty'];

const REVIEW_NEEDED = 'native speaker / field worker';
const OPTIONAL = 'Write what is true for you; skip what does not apply.';
const YOUR_OWN = 'This is your own account; nothing here supplies the answer.';

const validation = (): WritingPrompt['validation'] => ({ authorship: 'machine-drafted', reviewed: false, reviewNeeded: REVIEW_NEEDED });

// ───────────────────────────── cultural notes (short, factual, neutral) ─────────────────────────────

const NOTE_PERMISSION = 'Ask your hosts what is welcome before you talk about faith in a new setting; a conversation is offered, not pressed.';
const NOTE_PLAIN = 'Short, plain sentences are easier to understand than long ones, especially when you are speaking with someone through a translator.';
const SQ_ADDRESS = 'Albanian has an informal “you” (ti) for one familiar person and a polite or plural “you” (ju); with older people and people you have just met, the polite form is usual unless you are invited to use ti.';
const SQ_HOSPITALITY = 'Visitors are commonly offered coffee, tea or something to eat at home; accepting a little is generally taken as courtesy. Ask your hosts about local custom.';
const SQ_RELIGION = 'Albania has Muslim, Orthodox Christian, Catholic and Bektashi communities as well as many people who do not practise a religion; do not assume a person’s beliefs from their name or family.';

// ───────────────────────────── language-neutral prompts ─────────────────────────────

interface Base {
  id: string;
  category: PromptCategory;
  goal: string;
  instruction: string;
  difficulty: Difficulty;
  domains: string[];
  notes?: string[];
  section?: string;
}

const NEUTRAL: Base[] = [
  // Personal background
  { id: 'personal-background.introduce-self', category: 'personal-background', difficulty: 'first-sentences', domains: ['introductions', 'daily-life'],
    goal: 'Introduce yourself to someone you are meeting for the first time.',
    instruction: 'Write a few sentences introducing yourself: your name, where you are from and anything else you would like a new acquaintance to know.',
    notes: [NOTE_PLAIN] },
  { id: 'personal-background.describe-family', category: 'personal-background', difficulty: 'first-sentences', domains: ['family', 'home'],
    goal: 'Describe the people in your family.',
    instruction: 'Describe your family or the people closest to you: who they are, where they live and one thing about each that you would like others to know.' },
  { id: 'personal-background.explain-education', category: 'personal-background', difficulty: 'short-paragraph', domains: ['education', 'work'],
    goal: 'Explain your education and training.',
    instruction: 'Explain your education: where you studied, what you studied, and what it has led to. Include only what you want to share.' },
  { id: 'personal-background.describe-interests', category: 'personal-background', difficulty: 'first-sentences', domains: ['interests', 'daily-life'],
    goal: 'Say what you enjoy doing.',
    instruction: 'Describe your interests: what you enjoy doing in your free time and what you like about it.' },
  { id: 'personal-background.explain-travel', category: 'personal-background', difficulty: 'short-paragraph', domains: ['travel', 'time'],
    goal: 'Explain why you are travelling or visiting.',
    instruction: 'Explain why you are travelling: where you are going, who you are going with and what you hope will happen.' },

  // Mission communication
  { id: 'mission-communication.why-team-visiting', category: 'mission-communication', difficulty: 'short-paragraph', domains: ['travel', 'church', 'work'],
    goal: 'Tell your hosts why your team is visiting.',
    instruction: 'Explain why your team is visiting: who sent you, what you plan to do and how long you will stay. Say it as you would to a host who has just welcomed you.',
    notes: [NOTE_PERMISSION] },
  { id: 'mission-communication.describe-work', category: 'mission-communication', difficulty: 'short-paragraph', domains: ['work', 'church'],
    goal: 'Describe the work you are doing.',
    instruction: 'Describe the work you do or will do during your visit, in plain terms that someone outside your team would follow.' },
  { id: 'mission-communication.express-gratitude', category: 'mission-communication', difficulty: 'first-sentences', domains: ['gratitude', 'hospitality'],
    goal: 'Thank someone sincerely.',
    instruction: 'Write a few sentences thanking a host, a helper or a friend: what they did and what it meant to you.' },
  { id: 'mission-communication.explain-belief', category: 'mission-communication', difficulty: 'connected-paragraphs', domains: ['faith', 'church'], section: 'christian-belief',
    goal: 'Explain one Christian belief in your own words.',
    instruction: `Choose one Christian belief that matters to you and explain it as you would to a friend who has not heard it before. ${YOUR_OWN}`,
    notes: [NOTE_PERMISSION] },
  { id: 'mission-communication.introduce-church-activity', category: 'mission-communication', difficulty: 'short-paragraph', domains: ['church', 'community'],
    goal: 'Introduce a church or ministry activity to someone who might come.',
    instruction: 'Introduce one church or ministry activity you know: what happens, who is welcome and when and where it takes place.',
    notes: [NOTE_PERMISSION] },

  // Testimony development (each explicitly optional; topic tags, never positions)
  { id: 'testimony.early-life', category: 'testimony', difficulty: 'short-paragraph', domains: ['family', 'faith', 'time'], section: 'early-life',
    goal: 'Describe your early life and the place faith had in it, if any.',
    instruction: `Write about your early life: where you grew up, who was around you and what part, if any, faith played in it. ${OPTIONAL}`,
    notes: [NOTE_PERMISSION] },
  { id: 'testimony.initial-understanding', category: 'testimony', difficulty: 'short-paragraph', domains: ['faith', 'time'], section: 'initial-understanding',
    goal: 'Describe how you first understood Christianity.',
    instruction: `Write about how you first understood Christianity, however you came to it, and what you made of it then. ${OPTIONAL}` },
  { id: 'testimony.understanding-of-sin', category: 'testimony', difficulty: 'connected-paragraphs', domains: ['faith'], section: 'sin',
    goal: 'Describe your understanding of sin, if you wish to speak of it.',
    instruction: `Write about how you understand sin, and how that understanding has developed over time. ${OPTIONAL}` },
  { id: 'testimony.understanding-of-christ', category: 'testimony', difficulty: 'connected-paragraphs', domains: ['faith'], section: 'christ',
    goal: 'Describe your understanding of Jesus Christ.',
    instruction: `Write about who Jesus Christ is to you and how you came to see him that way. ${OPTIONAL}` },
  { id: 'testimony.a-change', category: 'testimony', difficulty: 'connected-paragraphs', domains: ['faith', 'time'], section: 'change',
    goal: 'Describe a change in your life, if there has been one.',
    instruction: `If something changed in your life because of your faith, describe what changed and how. If nothing fits, describe how you see the question. ${OPTIONAL}` },
  { id: 'testimony.faith-now', category: 'testimony', difficulty: 'short-paragraph', domains: ['faith', 'daily-life'], section: 'faith-now',
    goal: 'Describe how faith affects your life today.',
    instruction: `Write about how your faith affects your life today: your days, your decisions, your relationships. ${OPTIONAL}` },

  // Scripture and theology (the writer explains THEIR understanding; the prompt supplies no doctrine)
  { id: 'scripture-theology.summarise-passage', category: 'scripture-theology', difficulty: 'connected-paragraphs', domains: ['scripture', 'faith'], section: 'passage',
    goal: 'Summarise a Bible passage you choose and say what it means to you.',
    instruction: `Choose a passage you know. Summarise what happens or what it says in your own words, then say what it means to you. You choose the passage. ${YOUR_OWN}` },
  { id: 'scripture-theology.forgiveness', category: 'scripture-theology', difficulty: 'short-paragraph', domains: ['faith'], section: 'forgiveness',
    goal: 'Explain your understanding of forgiveness.',
    instruction: `Explain what forgiveness means as you understand it, and, if you wish, where that understanding comes from. ${YOUR_OWN}` },
  { id: 'scripture-theology.repentance', category: 'scripture-theology', difficulty: 'connected-paragraphs', domains: ['faith'], section: 'repentance',
    goal: 'Explain your understanding of repentance.',
    instruction: `Explain what repentance means as you understand it and how you would describe it to someone unfamiliar with the word. ${YOUR_OWN}` },
  { id: 'scripture-theology.grace', category: 'scripture-theology', difficulty: 'connected-paragraphs', domains: ['faith'], section: 'grace',
    goal: 'Explain your understanding of grace.',
    instruction: `Explain what grace means as you understand it, in your own words. ${YOUR_OWN}` },
  { id: 'scripture-theology.prayer', category: 'scripture-theology', difficulty: 'short-paragraph', domains: ['faith', 'daily-life'], section: 'prayer',
    goal: 'Explain what prayer is to you.',
    instruction: `Explain what prayer is to you and how you practise it, if you do. ${YOUR_OWN}` },
  { id: 'scripture-theology.christian-hope', category: 'scripture-theology', difficulty: 'short-paragraph', domains: ['faith', 'time'], section: 'hope',
    goal: 'Explain what Christian hope means to you.',
    instruction: `Explain what Christian hope means to you and what you look forward to, if anything. ${YOUR_OWN}` },

  // General
  { id: 'general.narrate-event', category: 'general', difficulty: 'short-paragraph', domains: ['time', 'daily-life'],
    goal: 'Narrate an event in the order it happened.',
    instruction: 'Narrate an event you remember: where it happened, who was there and what happened, in the order it happened.' },
  { id: 'general.describe-yesterday', category: 'general', difficulty: 'first-sentences', domains: ['time', 'daily-life'],
    goal: 'Describe what you did yesterday.',
    instruction: 'Describe yesterday: what you did, where you went and who you saw. Short sentences are fine.' },
  { id: 'general.explain-decision', category: 'general', difficulty: 'short-paragraph', domains: ['daily-life', 'work'],
    goal: 'Explain a decision you made and why.',
    instruction: 'Explain a decision you made recently: what you chose, what the alternatives were and why you chose as you did.' },
  { id: 'general.compare-situations', category: 'general', difficulty: 'short-paragraph', domains: ['daily-life', 'interests'],
    goal: 'Compare two situations, places or choices.',
    instruction: 'Compare two situations, places or choices you know: say how they are alike, how they differ and which you prefer.' },
  { id: 'general.future-intention', category: 'general', difficulty: 'first-sentences', domains: ['time', 'daily-life'],
    goal: 'Say what you intend to do.',
    instruction: 'Write what you intend to do soon: one or two plans and why they matter to you.' },
];

// ───────────────────────────── Albanian variants (pack-attested frames, targets from the pack) ─────────────────────────────

interface Variant { base: string; targets: string[]; frames?: string[]; notes?: string[] }

/**
 * Frames are sentences attested in the pack (tutorial examples, the demonstration passage, the validation cases) with one
 * word blanked. Nothing is inflected for “you”: a frame shows a pattern the pack already contains and no more.
 * The validator checks that each frame matches an attested sentence.
 */
const SQ_VARIANTS: Variant[] = [
  { base: 'personal-background.introduce-self', targets: ['Person', 'Voice'], frames: ['Unë quhem ___.'], notes: [SQ_ADDRESS] },
  { base: 'personal-background.describe-family', targets: ['definite-nominative-singular', 'Gender'], frames: ['Ajo ka një ___.', 'Drita është një ___ e vogël.'], notes: [SQ_HOSPITALITY] },
  { base: 'personal-background.explain-education', targets: ['definite-noun-ending', 'Case'], frames: ['Ana shkon në ___.'] },
  { base: 'personal-background.describe-interests', targets: ['definite-accusative-singular', 'definite-plural'], frames: ['Babai lexon një ___.', 'Fëmijët lexojnë ___.'] },
  { base: 'personal-background.explain-travel', targets: ['Tense', 'Person'], frames: ['Ana dhe Luan shkojnë në ___.'] },
  { base: 'mission-communication.why-team-visiting', targets: ['Tense', 'Person'], frames: ['Ana dhe Luan shkojnë në ___.'], notes: [SQ_ADDRESS, SQ_HOSPITALITY] },
  { base: 'mission-communication.describe-work', targets: ['definite-accusative-singular', 'negation-nuk'], notes: [SQ_ADDRESS] },
  { base: 'mission-communication.express-gratitude', targets: ['Person'], notes: [SQ_ADDRESS, SQ_HOSPITALITY] },
  { base: 'mission-communication.explain-belief', targets: ['negation-nuk', 'linking-article-adjective'], notes: [SQ_RELIGION] },
  { base: 'mission-communication.introduce-church-activity', targets: ['definite-plural', 'Number'], notes: [SQ_RELIGION, SQ_ADDRESS] },
  { base: 'testimony.early-life', targets: ['Tense'], notes: [SQ_RELIGION] },
  { base: 'testimony.initial-understanding', targets: ['Tense', 'negation-nuk'], notes: [SQ_RELIGION] },
  { base: 'testimony.a-change', targets: ['Tense'], notes: [SQ_RELIGION] },
  { base: 'testimony.faith-now', targets: ['Tense', 'Mood'], notes: [SQ_RELIGION] },
  { base: 'scripture-theology.prayer', targets: ['Mood', 'question-a'], notes: [SQ_RELIGION] },
  { base: 'general.describe-yesterday', targets: ['Tense', 'Person'] },
  { base: 'general.future-intention', targets: ['Tense', 'Mood'] },
  { base: 'general.compare-situations', targets: ['linking-article-adjective'], frames: ['Shkolla është e ___.', 'Uji është i ___.'] },
  { base: 'general.explain-decision', targets: ['negation-nuk', 'Mood'] },
  { base: 'general.narrate-event', targets: ['Tense'] },
];

function toPrompt(b: Base): WritingPrompt {
  return {
    promptId: b.id, category: b.category, languageIds: ['*'], teams: [],
    goal: b.goal, instruction: b.instruction, difficulty: b.difficulty,
    vocabularyDomains: [...b.domains], grammarTargets: [], culturalNotes: [...(b.notes ?? [])],
    validation: validation(),
    ...(b.section ? { section: b.section } : {}),
  };
}

function sqVariant(v: Variant): WritingPrompt {
  const base = NEUTRAL.find((b) => b.id === v.base);
  if (!base) throw new Error(`unknown base prompt ${v.base}`);
  const p = toPrompt(base);
  return {
    ...p,
    promptId: `${base.id}.sq`,
    languageIds: ['sq'],
    teams: ['albania'],
    grammarTargets: [...v.targets],
    culturalNotes: [...new Set([...p.culturalNotes, ...(v.notes ?? [])])],
    ...(v.frames ? { frames: [...v.frames] } : {}),
    validation: { ...validation(), source: 'Pack sq (machine-drafted): grammar targets from the manifest; frames from the tutorial, demonstration passage and validation sentences with one word blanked' },
  };
}

export const PROMPTS: WritingPrompt[] = [...NEUTRAL.map(toPrompt), ...SQ_VARIANTS.map(sqVariant)];

// ───────────────────────────── modes ─────────────────────────────

/** Which categories each mode draws on. Testimony prompts are optional in any order; no mode imposes a sequence. */
export const MODE_CATEGORIES: Readonly<Record<WritingMode, readonly PromptCategory[]>> = Object.freeze({
  free: PROMPT_CATEGORIES,
  guided: PROMPT_CATEGORIES,
  testimony: ['testimony', 'scripture-theology', 'personal-background', 'mission-communication'],
  missionary: ['mission-communication', 'personal-background', 'scripture-theology'],
  narrative: ['general', 'testimony', 'personal-background'],
  targeted: PROMPT_CATEGORIES,
});

// ───────────────────────────── lookup ─────────────────────────────

export function promptById(promptId: string, prompts: readonly WritingPrompt[] = PROMPTS): WritingPrompt | undefined {
  return prompts.find((p) => p.promptId === promptId);
}

export interface PromptQuery { languageId: string; teamId?: string; mode: WritingMode; category?: PromptCategory }

/**
 * The prompts for one language, team and mode, in registry order (the order carries no meaning). A language-specific
 * variant (`<base>.<languageId>`) replaces its neutral base for that language, so a learner never sees both.
 */
export function promptsFor(q: PromptQuery, prompts: readonly WritingPrompt[] = PROMPTS): WritingPrompt[] {
  const cats = MODE_CATEGORIES[q.mode] ?? PROMPT_CATEGORIES;
  const forLang = prompts.filter((p) => p.languageIds.includes('*') || p.languageIds.includes(q.languageId));
  const specific = new Set(forLang.filter((p) => !p.languageIds.includes('*')).map((p) => p.promptId));
  return forLang.filter((p) => {
    if (p.languageIds.includes('*') && specific.has(`${p.promptId}.${q.languageId}`)) return false;
    if (q.teamId && p.teams.length > 0 && !p.teams.includes(q.teamId)) return false;
    if (!cats.includes(p.category)) return false;
    if (q.category && p.category !== q.category) return false;
    return true;
  });
}

// ───────────────────────────── validation ─────────────────────────────

/** Sentences the Albanian pack attests (frames must match one of them). */
function attestedSentences(languageId: string): string[] {
  const pack = PACKS[languageId];
  if (!pack) return [];
  const out = new Set<string>();
  for (const c of pack.validation) if (c.sentence) out.add(c.sentence);
  if (languageId === 'sq') {
    for (const s of SQ_ATTESTED_EXTRA) out.add(s);
  }
  return [...out];
}

/** Sentences written in the Albanian tutorial: the demonstration passage and the examples that are whole sentences. */
const SQ_ATTESTED_EXTRA: string[] = [
  ...SQ_PASSAGE.sentences.map((x) => x.text),
  ...SQ_TUTORIAL_STEPS.flatMap((st) => (st.examples ?? []).map((e) => e.surface).filter((x) => x.endsWith('.'))),
];

const SECTION_FORBIDDEN = /\d|step|order|first|second|third|next|last/i;
const LEVEL_LABEL = /\b(?:CEFR|[ABC][12])\b/;
const FIRST_PERSON = /\b(?:I|I’m|I'm|me|my|mine|we|our|us)\b/;
const FRAME_BLANK = '___';

function frameMatches(frame: string, sentences: readonly string[]): boolean {
  const escaped = frame.split(FRAME_BLANK).map((s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('.+?');
  const re = new RegExp(`^${escaped}$`, 'u');
  return sentences.some((s) => re.test(s));
}

/** Returns the problems with a prompt; an empty array means it is valid. */
export function validatePrompt(p: WritingPrompt): string[] {
  const out: string[] = [];
  const need = (v: unknown, name: string) => { if (typeof v !== 'string' || !v.trim()) out.push(`${name} is required`); };
  need(p.promptId, 'promptId'); need(p.goal, 'goal'); need(p.instruction, 'instruction');
  if (!PROMPT_CATEGORIES.includes(p.category)) out.push(`unknown category ${String(p.category)}`);
  if (!['first-sentences', 'short-paragraph', 'connected-paragraphs'].includes(p.difficulty)) out.push(`unknown difficulty ${String(p.difficulty)}`);
  if (!Array.isArray(p.languageIds) || p.languageIds.length === 0) out.push('languageIds must list at least one language or "*"');
  const wildcard = p.languageIds?.includes('*');
  if (wildcard && p.languageIds.length > 1) out.push('"*" cannot be combined with other languages');
  for (const l of p.languageIds ?? []) if (l !== '*' && !PACKS[l]) out.push(`no pack for language ${l}`);
  for (const t of p.teams ?? []) if (!(t in TEAMS)) out.push(`unknown team ${t}`);
  if (!Array.isArray(p.vocabularyDomains)) out.push('vocabularyDomains must be an array');

  // Grammar targets and frames belong to a specific pack and must exist in it.
  if (wildcard && p.grammarTargets.length > 0) out.push('a language-neutral prompt cannot carry grammar targets');
  if (wildcard && (p.frames?.length ?? 0) > 0) out.push('a language-neutral prompt cannot carry frames');
  if (!wildcard) {
    for (const l of p.languageIds ?? []) {
      const pack = PACKS[l];
      if (!pack) continue;
      const known = new Set([...pack.grammar.constructions.map((c) => c.id), ...pack.grammar.features.map((f) => f.key)]);
      for (const t of p.grammarTargets) if (!known.has(t)) out.push(`grammar target ${t} is not a ${l} construction or feature`);
      const sentences = attestedSentences(l);
      for (const f of p.frames ?? []) {
        if (!f.includes(FRAME_BLANK)) out.push(`frame “${f}” has no blank`);
        else if (!frameMatches(f, sentences)) out.push(`frame “${f}” does not match a sentence attested in the ${l} pack`);
      }
    }
  }

  // Honesty: review state, and no level labels in anything shown.
  const v = p.validation;
  if (!v) out.push('validation is required');
  else {
    if (v.authorship === 'machine-drafted' && v.reviewed) out.push('a machine-drafted prompt cannot be marked reviewed without a reviewer');
    if (!v.reviewed && !v.reviewNeeded) out.push('an unreviewed prompt must say who should review it');
  }
  const shown = [p.goal, p.instruction, ...(p.culturalNotes ?? []), ...(p.frames ?? [])].join('\n');
  if (LEVEL_LABEL.test(shown)) out.push('prompt text must not carry a level label');
  if (/(?:^|\n)\s*(?:step|stage|part)\s*\d/i.test(shown)) out.push('prompt text must not number a sequence');
  if (FIRST_PERSON.test(p.instruction) || FIRST_PERSON.test(p.goal)) out.push('instruction and goal must be addressed to the writer, not written in the first person');

  // Testimony and Scripture prompts: optional, writer-owned, no frames, no order.
  if (p.category === 'testimony' || p.category === 'scripture-theology') {
    if (p.frames?.length) out.push('testimony and Scripture prompts carry no sentence frames');
    if (p.category === 'testimony' && !/skip what does not apply/i.test(p.instruction)) out.push('a testimony prompt must say it is optional (“skip what does not apply”)');
    if (p.category === 'scripture-theology' && !/your own|you choose|as you understand|to you/i.test(p.instruction)) out.push('a Scripture prompt must ask for the writer’s own understanding');
  }
  if (p.section !== undefined) {
    if (!/^[a-z][a-z-]*$/.test(p.section) || SECTION_FORBIDDEN.test(p.section)) out.push(`section “${p.section}” must be a plain topic tag, not a position`);
  }
  return out;
}

/** Problems across a whole registry (duplicate ids included). */
export function validateRegistry(prompts: readonly WritingPrompt[] = PROMPTS): Array<{ promptId: string; problem: string }> {
  const out: Array<{ promptId: string; problem: string }> = [];
  const seen = new Set<string>();
  for (const p of prompts) {
    if (seen.has(p.promptId)) out.push({ promptId: p.promptId, problem: 'duplicate promptId' });
    seen.add(p.promptId);
    for (const problem of validatePrompt(p)) out.push({ promptId: p.promptId, problem });
  }
  return out;
}
