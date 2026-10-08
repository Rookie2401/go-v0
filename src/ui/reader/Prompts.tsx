/**
 * Recall prompts at the end of a text, shown BEFORE the four-button report (see src/golearn/prompts.ts for what they are).
 *
 * Optional and quiet: one prompt at a time, a "Skip" on each, "Skip all" while more than one is left, and the four-button report
 * below them is exactly what it was. What an answer means:
 *   a correct cloze answer  → the Reader's own "Understood" handler for that sentence (`onUnderstood`), which emits the ordinary
 *                              ComprehensionReported { scope: 'sentence', degree: 'all' }; this file builds no event.
 *   a wrong cloze answer    → nothing is emitted; the whole sentence is shown.
 *   a yes/no answer         → nothing is recorded anywhere. It only informs the report below: two misses SUGGEST "Some"
 *                              (the button is marked, never pressed for him; nothing is reported until he presses one).
 *   a skip                  → nothing, and it counts neither right nor wrong.
 *
 * The prompts are made once, when the block first shows, from the record as it is then (levels of the words, sentences
 * marked Understood, sentences of other finished texts of the language). A failing read just means fewer or no prompts.
 */
import { useCallback, useEffect, useRef, useState } from 'react';
import type { ComprehensionReported, PartOfSpeech, Sentence, Token } from '../../core';
import { BLANK, generatePrompts, suggestedDegree } from '../../golearn/prompts';
import type { ClozePrompt, RecallPrompt, YesNoPrompt } from '../../golearn/prompts';
import { useApp } from '../context';
import type { TextData } from './useTextData';
import './prompts.css';

/** Most distinct forms whose part of speech is looked up, in reading order (the pool of distractors never needs more). */
const POS_LOOKUPS = 400;
/** Other finished texts and sentences per text offered to the "not in this text" statement. */
const OTHER_TEXTS = 3;
const OTHER_SENTENCES = 40;

type Degree = ComprehensionReported['degree'];

/** What the learner's record says (and the store knows) that the prompts need; every part degrades to "nothing known". */
export async function gather(app: ReturnType<typeof useApp>, data: TextData, understood: ReadonlySet<string>): Promise<RecallPrompt[]> {
  const { store, golearn, userId } = app;
  const { text } = data;
  try { await golearn.settled?.(); } catch { /* reading waits for the fold; not waiting is only less current */ }

  // Levels by form: the record when it can be asked one form at a time, else the word marks the reader already shows ("partial").
  const forms = new Map<string, Token>();
  for (const s of data.sentences) {
    for (const t of data.tokensBySentence.get(s.id) ?? []) {
      if (!t.isWord || forms.has(t.formId)) continue;
      const mark = data.support.get(s.id)?.highlight[t.id];
      if (mark === 'unseen') continue;
      forms.set(t.formId, t);
    }
  }
  const levels = new Map<string, string>();
  if (typeof golearn.getItemState === 'function') {
    await Promise.all([...forms.keys()].map(async (formId) => {
      try {
        const row = await golearn.getItemState(userId, formId);
        if (row) levels.set(formId, row.reading.level);
      } catch { /* a form that cannot be read is no candidate */ }
    }));
  } else {
    for (const [formId, t] of forms) if (data.support.get(t.sentenceId)?.highlight[t.id] === 'partial') levels.set(formId, 'recognized_with_help');
  }

  // Part of speech, from the stored analysis of the first token of each distinct form, applied to every token of that form.
  const posByForm = new Map<string, PartOfSpeech>();
  const firsts: Token[] = [];
  const seenForm = new Set<string>();
  for (const s of data.sentences) {
    for (const t of data.tokensBySentence.get(s.id) ?? []) {
      if (!t.isWord || seenForm.has(t.formId)) continue;
      seenForm.add(t.formId);
      if (firsts.length < POS_LOOKUPS) firsts.push(t);
    }
  }
  await Promise.all(firsts.map(async (t) => {
    try {
      const rows = await store.analyses.where('tokenId', t.id);
      const best = rows.filter((r) => r.pos).sort((a, b) => b.confidence - a.confidence || (a.id < b.id ? -1 : 1))[0];
      if (best?.pos) posByForm.set(t.formId, best.pos);
    } catch { /* no tag: the word is then treated as content, as in the coverage reports */ }
  }));
  const pos = new Map<string, PartOfSpeech>();
  for (const s of data.sentences) for (const t of data.tokensBySentence.get(s.id) ?? []) { const p = posByForm.get(t.formId); if (t.isWord && p) pos.set(t.id, p); }

  // Sentences of other finished texts of this language (only worth asking when there is a sentence to anchor a statement on).
  const others: string[] = [];
  if (text.kind !== 'scripture' && understood.size > 0) {
    try {
      const rows = (await store.texts.where('corpusId', text.corpusId))
        .filter((t) => t.id !== text.id && t.lang === text.lang && t.kind !== 'scripture' && t.listeningAssessmentId === undefined && t.readingAssessmentId === undefined)
        .sort((a, b) => (a.id < b.id ? -1 : 1));
      const progress = await golearn.readingProgressMany(userId, rows.map((t) => t.id));
      const finished = rows.filter((t) => progress.get(t.id)?.finishedAt).slice(0, OTHER_TEXTS);
      for (const t of finished) {
        const live = (await store.sentences.where('textId', t.id)).filter((s: Sentence) => s.retiredInVersion === undefined).sort((a, b) => a.index - b.index);
        for (const s of live.slice(0, OTHER_SENTENCES)) others.push(s.text);
      }
    } catch { /* the swap of two words is the fallback */ }
  }

  return generatePrompts({
    textId: text.id, lang: text.lang, kind: text.kind, sentences: data.sentences, tokensBySentence: data.tokensBySentence,
    pos, levels, understood, otherSentences: others,
  });
}

type Answer = { right: boolean } | { skipped: true };

export interface PromptsProps {
  data: TextData;
  understood: ReadonlySet<string>;
  /** The Reader's own "Understood" handler: the only way a prompt reaches GoLearn. */
  onUnderstood: (sentenceId: string) => void | Promise<void>;
  /** Called with the number of answered-and-missed prompts whenever it changes. */
  onMisses?: (misses: number) => void;
}

export function Prompts({ data, understood, onUnderstood, onMisses }: PromptsProps) {
  const app = useApp();
  const [prompts, setPrompts] = useState<RecallPrompt[] | null>(null);
  const [at, setAt] = useState(0);
  const [answers, setAnswers] = useState<Record<string, Answer>>({});
  const [picked, setPicked] = useState<Record<string, string>>({});
  const [hidden, setHidden] = useState(false);
  const started = useRef(false);
  const snapshot = useRef(understood);
  snapshot.current = understood;

  useEffect(() => {
    if (started.current) return;
    started.current = true;
    let live = true;
    void gather(app, data, snapshot.current).then(
      (p) => { if (live) setPrompts(p); },
      () => { if (live) setPrompts([]); },
    );
    return () => { live = false; started.current = false; };
    // made once per mount: the record as it is when the block first shows
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const misses = Object.values(answers).filter((a) => 'right' in a && !a.right).length;
  useEffect(() => { onMisses?.(misses); }, [misses, onMisses]);

  const answerCloze = useCallback((p: ClozePrompt, choice: string) => {
    if (answers[p.id]) return;
    const right = choice === p.answer;
    setPicked((m) => ({ ...m, [p.id]: choice }));
    setAnswers((m) => ({ ...m, [p.id]: { right } }));
    if (right) void onUnderstood(p.sentenceId);
  }, [answers, onUnderstood]);

  const answerYesNo = useCallback((p: YesNoPrompt, yes: boolean) => {
    if (answers[p.id]) return;
    setPicked((m) => ({ ...m, [p.id]: yes ? 'yes' : 'no' }));
    setAnswers((m) => ({ ...m, [p.id]: { right: yes === p.truth } }));
  }, [answers]);

  if (!prompts || prompts.length === 0 || hidden) return null;
  const lang = data.text.lang;
  const total = prompts.length;
  if (at >= total) {
    const right = Object.values(answers).filter((a) => 'right' in a && a.right).length;
    const answered = Object.values(answers).filter((a) => 'right' in a).length;
    return answered > 0 ? <p className="card__note" role="status">{right} of {answered} right. Thank you.</p> : null;
  }
  const p = prompts[at];
  const answer = answers[p.id];
  const done = !!answer;
  const last = at === total - 1;
  const next = () => setAt((i) => i + 1);
  const skip = () => { setAnswers((m) => ({ ...m, [p.id]: { skipped: true } })); next(); };

  return (
    <section className="reader__prompts" role="group" aria-label="Quick questions">
      <div className="prompt__head">
        <span className="muted">Quick questions, if you like · {at + 1} of {total}</span>
      </div>
      {p.kind === 'cloze' ? (
        <>
          <p className="prompt__ask">Which word is missing?</p>
          <p className="prompt__sentence" lang={lang} data-testid="prompt-sentence">{p.before}<span className="prompt__blank">{BLANK}</span>{p.after}</p>
          <div className="prompt__choices" role="group" aria-label="Choices">
            {p.choices.map((c) => (
              <button key={c} type="button" lang={lang} disabled={done} aria-pressed={picked[p.id] === c} onClick={() => answerCloze(p, c)}>{c}</button>
            ))}
          </div>
          {done && 'right' in answer && (
            <p className="prompt__feedback" role="status">
              {answer.right ? 'Yes.' : 'Not quite. The sentence reads: '}
              {!answer.right && <span lang={lang}>{p.before}<strong>{p.answer}</strong>{p.after}</span>}
            </p>
          )}
        </>
      ) : (
        <>
          <p className="prompt__ask">Did this happen in the text?</p>
          <p className="prompt__sentence" lang={lang} data-testid="prompt-sentence">{p.statement}</p>
          <div className="prompt__choices" role="group" aria-label="Choices">
            {([['yes', 'Yes'], ['no', 'No']] as const).map(([v, label]) => (
              <button key={v} type="button" disabled={done} aria-pressed={picked[p.id] === v} onClick={() => answerYesNo(p, v === 'yes')}>{label}</button>
            ))}
          </div>
          {done && 'right' in answer && (
            <p className="prompt__feedback" role="status">
              {p.truth ? (answer.right ? 'Yes, that is from the text.' : 'That one is from the text.') : (answer.right ? 'Right, that is not in this text.' : 'That sentence is not in this text.')}
            </p>
          )}
        </>
      )}
      <div className="prompt__actions">
        {done
          ? <button type="button" className="btn btn--small" onClick={next}>{last ? 'Done' : 'Next'}</button>
          : <button type="button" className="btn btn--small btn--quiet" onClick={skip}>Skip</button>}
        {!last && <button type="button" className="btn btn--small btn--quiet" onClick={() => setHidden(true)}>Skip all</button>}
      </div>
    </section>
  );
}

export interface EndReportProps extends Omit<PromptsProps, 'onMisses'> {
  /** The report the learner has made for the whole text, if any. */
  textDegree: Degree | null;
  /** The Reader's own text-level report. */
  onReport: (degree: Degree) => void | Promise<void>;
}

/** The end-of-text block: the optional prompts, then the four-button report exactly as it was (marked when two prompts were missed). */
export function EndReport({ data, understood, onUnderstood, textDegree, onReport }: EndReportProps) {
  const [misses, setMisses] = useState(0);
  const suggested = textDegree === null ? suggestedDegree(misses) : undefined;
  return (
    <>
      <Prompts data={data} understood={understood} onUnderstood={onUnderstood} onMisses={setMisses} />
      <div className="reader__howmuch" role="group" aria-label="How much did you understand?">
        <p className="muted">How much did you understand?</p>
        <div className="segmented">
          {([['all', 'All'], ['most', 'Most'], ['some', 'Some'], ['little', 'Little']] as const).map(([degree, label]) => (
            <button
              key={degree} type="button" aria-pressed={textDegree === degree}
              className={suggested === degree ? 'is-suggested' : undefined} data-suggested={suggested === degree ? 'true' : undefined}
              onClick={() => { void onReport(degree); }}
            >{label}</button>
          ))}
        </div>
        {suggested && <p className="card__note" role="status">Two of the questions went the other way, so "Some" may be nearer. Nothing is chosen for you.</p>}
        <p className="card__note">This is your own word on it. Nothing here is graded.</p>
      </div>
    </>
  );
}
