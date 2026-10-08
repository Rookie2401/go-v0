/**
 * One Stage 0 step (#/start/:stepId): a scene (or a review of one through a listening channel), a sounds step, or the exit.
 *
 * Scene: the lines arrive one at a time — a picture, the sound (when there is one), the words — and the English is there on
 * request. Then a few questions (recorded with whether English was opened first), then a note if its moment has come, then
 * "your turn": production from copying to retelling, and saying it aloud.
 */
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useNextStep } from './nav';
import { useParams } from 'react-router-dom';
import type { LanguageAdapter, LanguageCode, Stage0Check, Stage0Line, Stage0Overview, Stage0Presentation, Stage0ProductionTask, Stage0Scene, Stage0Support } from '../../core';
import { characterName, bundledStage0 } from '../../stage0/content';
import { castName } from './names';
import { wordsOf } from '../../stage0/features';
import type { WordInfo } from '../../stage0/features';
import { stage0Config } from '../../stage0/lang';
import { useApp } from '../context';
import { BackLink, Disclosure, Topbar } from '../ui';
import { useStage0Voice } from './audio';
import type { Stage0Voice } from './audio';
import { ExitCheck } from './ExitCheck';
import { PlayButton, SpeakBox, TargetLine, WordSheet, retellCue } from './parts';
import { SoundsPlayer } from './SoundsPlayer';
import './stage0.css';

export function StepPage() {
  const { stepId = '' } = useParams();
  const { stage0, userId, lang } = useApp();
  const [ov, setOv] = useState<Stage0Overview | null>(null);
  useEffect(() => {
    let live = true;
    void (async () => {
      if (!stage0) return;
      await stage0.ensureTexts(lang).catch(() => undefined);
      const o = await stage0.overview(userId, lang);
      if (live) setOv(o);
    })();
    return () => { live = false; };
  }, [stage0, userId, lang, stepId]);
  const view = ov?.steps.find((s) => s.step.id === stepId);
  const title = view?.title ?? 'Stage 0';
  return (
    <div>
      <Topbar title={title} left={<BackLink to="/start" label="Stage 0" />} />
      <div className="page page--narrow stage0 route-fade" key={stepId}>
        {ov && <p className="stage0-draft-line card__note">{ov.contentStatus}</p>}
        {!ov && <p className="muted" role="status">Loading…</p>}
        {ov && !view && <p className="muted">This step is not on the path.</p>}
        {ov && view?.step.kind === 'exit' && <ExitCheck overview={ov} />}
        {ov && view?.step.kind === 'sounds' && <SoundsPlayer stepId={stepId} refId={view.step.ref!} overview={ov} />}
        {ov && (view?.step.kind === 'scene' || view?.step.kind === 'review') && <ScenePlayer stepId={stepId} refId={view.step.ref!} overview={ov} />}
      </div>
    </div>
  );
}

function ScenePlayer({ stepId, refId, overview }: { stepId: string; refId: string; overview: Stage0Overview }) {
  const { stage0, userId, lang, store, adapters } = useApp();
  const adapter = adapters.get(lang);
  const cfg = stage0Config(lang);
  const script = cfg.script.kind !== 'latin';
  const scene = stage0!.scene(lang, refId) as Stage0Scene;
  const world = bundledStage0().world;
  const voice = useStage0Voice(lang, store);
  const goNext = useNextStep(overview, stepId);
  const [pres, setPres] = useState<Stage0Presentation | null>(null);
  const [shown, setShown] = useState(1);
  const [textOpen, setTextOpen] = useState<Set<string>>(new Set());
  const [english, setEnglish] = useState<Set<string>>(new Set());
  const [sheet, setSheet] = useState<{ word: WordInfo; lineId: string; index: number } | null>(null);
  const [answers, setAnswers] = useState<Record<string, { choice: number; correct: boolean; tries: number }>>({});
  const [finished, setFinished] = useState(false);
  const seen = useRef(new Set<string>());
  const romanSent = useRef(new Set<string>());
  const played = useRef(new Set<string>());

  // the device's audio for this scene: a recording if every line has one, else the computer voice, else none
  const audio = useMemo(() => {
    const sources = scene.lines.map((l) => voice.sourceFor(l.audio));
    return sources.every((s) => s === 'native') ? 'native' as const : sources.some((s) => s !== 'none') ? 'computer-voice' as const : 'none' as const;
  }, [scene, voice]);

  useEffect(() => {
    let live = true;
    void stage0!.presentation(userId, lang, stepId, audio).then((p) => { if (live) setPres(p); });
    return () => { live = false; };
  }, [stage0, userId, lang, stepId, audio]);

  const channel = pres?.channel ?? 'read';
  const textVisible = (lineId: string) => channel === 'read' || channel === 'read+listen' || textOpen.has(lineId);
  const tokensOf = useCallback(async (lineId: string) => {
    const st = await stage0!.sceneText(lang, scene.id);
    if (!st) return [];
    return (await store.tokens.where('sentenceId', st.sentenceIds[lineId])).filter((t) => t.isWord).sort((a, b) => a.index - b.index);
  }, [stage0, lang, scene, store]);

  // reading exposure, auto-play, and the romanization shown by default (it is help, so it is recorded)
  useEffect(() => {
    if (!pres) return;
    scene.lines.slice(0, shown).forEach((l) => {
      if (textVisible(l.id) && !seen.current.has(l.id)) { seen.current.add(l.id); void stage0!.lineSeen(userId, lang, stepId, l.id); }
      if (channel !== 'read' && !played.current.has(l.id)) { played.current.add(l.id); void voice.play(l.text, l.audio); }
      const roman = pres.transliteration[l.id] ?? [];
      if (roman.length && textVisible(l.id) && !romanSent.current.has(l.id)) {
        romanSent.current.add(l.id);
        void (async () => {
          const tokens = await tokensOf(l.id);
          const words = wordsOf(adapter, lang, l.text);
          for (const [i, w] of words.entries()) {
            if (!roman.includes(w.surface)) continue;
            await stage0!.supportUsed(userId, lang, stepId, 'transliteration', [l.id], { ...(tokens[i] ? { tokenId: tokens[i].id, itemId: tokens[i].formId } : {}), features: w.features });
          }
        })();
      }
    });
  }, [pres, shown, textOpen, scene, stage0, userId, lang, stepId, channel, voice, adapter, tokensOf]); // eslint-disable-line react-hooks/exhaustive-deps

  const openWord = async (word: WordInfo, lineId: string, index: number) => {
    setSheet({ word, lineId, index });
    const tokens = await tokensOf(lineId);
    const t = tokens[index];
    await stage0!.supportUsed(userId, lang, stepId, 'gloss', [lineId], t ? { tokenId: t.id, itemId: t.formId } : undefined);
  };
  const showEnglish = (lineId: string) => {
    setEnglish((s) => new Set(s).add(lineId));
    void stage0!.supportUsed(userId, lang, stepId, 'english', [lineId]);
  };
  const showText = (lineId: string) => {
    setTextOpen((s) => new Set(s).add(lineId));
    void stage0!.supportUsed(userId, lang, stepId, 'transcript', [lineId]);
  };
  const answer = async (c: Stage0Check, choice: number) => {
    const r = await stage0!.answerCheck(userId, lang, stepId, c.id, choice, channel, audio);
    setAnswers((a) => ({ ...a, [c.id]: { choice, correct: r.correct, tries: (a[c.id]?.tries ?? 0) + 1 } }));
    // A wrong answer shows the line again (and asks again). In a listening channel that means the words: opening them is a recorded rescue.
    if (!r.correct) c.lines.forEach((l) => { if (!textVisible(l)) showText(l); });
  };

  const allShown = shown >= scene.lines.length;
  // SECURE = every question's latest answer is right. Only a secure step can be finished; it counts toward the Stage 0 check.
  const allAnswered = scene.checks.every((c) => answers[c.id]?.correct);
  const newWords = useMemo(() => new Set(scene.introduces.words.map((w) => w.normalize('NFC').toLowerCase())), [scene]);
  const notes = scene.notes ?? [];
  const metBefore = (ids: string[]) => overview.steps.filter((s) => s.step.kind === 'scene' && (s.status === 'done' || s.status === 'secure') && s.step.ref !== scene.id
    && (stage0!.scene(lang, s.step.ref ?? '')?.represents ?? []).some((r) => ids.includes(r))).length;

  if (!pres) return <p className="muted" role="status">Loading…</p>;
  const speakerName = (id?: string) => (id ? characterName(world, id, lang) : undefined);

  return (
    <div className="stage0-scene" data-channel={channel}>
      {pres.reasons.length > 0 && (
        <Disclosure label="How this is shown, and why" className="stage0-why">
          <ul className="card__text">{pres.reasons.map((r) => <li key={r}>{r}</li>)}</ul>
        </Disclosure>
      )}
      {channel === 'listen-only' && <p className="card__note">Listen first. The words are there if you need them — try without.</p>}
      <ol className="stage0-lines" aria-label="The scene">
        {scene.lines.slice(0, shown).map((l) => (
          <li key={l.id} className="stage0-line" data-line={l.id}>
            {pres.pictures && l.picture && <span className="stage0-picture" aria-hidden="true">{l.picture}</span>}
            <div className="stage0-line__body">
              {l.speaker && <span className="label">{speakerName(l.speaker)}</span>}
              {textVisible(l.id)
                ? <TargetLine adapter={adapter} lang={lang} text={l.text} transliterate={pres.transliteration[l.id]} segment={pres.segmentation} highlight={pres.highlightNew ? newWords : undefined} onWord={(w, i) => { void openWord(w, l.id, i); }} />
                : <button type="button" className="btn btn--small btn--quiet" onClick={() => showText(l.id)}>Show the words</button>}
              <div className="actions stage0-line__actions">
                <PlayButton voice={voice} text={l.text} audio={l.audio} label="Hear it" />
                {!english.has(l.id)
                  ? <button type="button" className="btn btn--small btn--quiet" onClick={() => showEnglish(l.id)}>English</button>
                  : <span className="stage0-english">{l.en}</span>}
              </div>
            </div>
          </li>
        ))}
      </ol>
      {sheet && <WordSheet adapter={adapter} lang={lang} word={sheet.word} script={script} onClose={() => setSheet(null)} name={castName(world, lang, sheet.word.surface)}
        onRomanize={() => { void tokensOf(sheet.lineId).then((ts) => stage0!.supportUsed(userId, lang, stepId, 'transliteration', [sheet.lineId], { ...(ts[sheet.index] ? { tokenId: ts[sheet.index].id, itemId: ts[sheet.index].formId } : {}), features: sheet.word.features })); }} />}
      {!allShown && <div className="actions"><button type="button" className="btn btn--primary" onClick={() => setShown((n) => n + 1)}>Next line</button></div>}

      {allShown && (
        <section className="stage0-questions" aria-label="Did you understand?">
          <h2 className="section-head">Did you understand?</h2>
          {scene.checks.map((c) => (
            <CheckView key={c.id} check={c} lang={lang} result={answers[c.id]} onAnswer={(i) => { void answer(c, i); }}
              againLines={scene.lines.filter((l) => c.lines.includes(l.id))} adapter={adapter} voice={voice}
              onEnglish={() => c.lines.forEach((l) => { if (!english.has(l)) showEnglish(l); })} />
          ))}
        </section>
      )}

      {allShown && !allAnswered && (
        <div className="stage0-gate" data-testid="stage0-not-secure">
          <p className="card__note stage0-notsecure"><strong>Not secure yet.</strong> This step counts toward the Stage 0 check only when every question is answered right. You can leave it and come back; the path will mark it.</p>
          <div className="actions"><button type="button" className="btn btn--quiet" onClick={goNext}>Leave for now</button></div>
        </div>
      )}

      {allShown && allAnswered && notes.length > 0 && (
        <section className="stage0-notes" aria-label="A short note">
          {notes.map((n) => metBefore(n.explains) >= n.afterScenes
            ? <div key={n.id} className="stage0-card"><p><strong>{n.title}</strong></p><p>{n.text}</p></div>
            : <Disclosure key={n.id} label={`More about this: ${n.title}`} onToggle={(open) => { if (open) void stage0!.supportUsed(userId, lang, stepId, 'note', [], { itemId: n.id }); }}><p>{n.text}</p></Disclosure>)}
        </section>
      )}

      {allShown && allAnswered && (scene.production?.length ?? 0) > 0 && (
        <section className="stage0-turn" aria-label="Your turn">
          <h2 className="section-head">Your turn</h2>
          {scene.production!.map((t) => <ProductionView key={t.id} task={t} stepId={stepId} englishShown={t.basedOn.some((b) => english.has(b))} voice={voice} lines={scene.lines} />)}
        </section>
      )}

      {allShown && allAnswered && (
        <div className="actions">
          <button type="button" className="btn btn--primary" disabled={finished} onClick={() => { setFinished(true); void stage0!.completeStep(userId, lang, stepId).then(goNext); }}>Finish this step</button>
        </div>
      )}
    </div>
  );
}

function CheckView({ check, lang, result, onAnswer, onEnglish, againLines, adapter, voice }: {
  check: Stage0Check; lang: LanguageCode; result?: { choice: number; correct: boolean; tries: number }; onAnswer(i: number): void; onEnglish(): void;
  /** The check's own lines, shown again after a wrong answer. */
  againLines: Stage0Line[]; adapter: LanguageAdapter; voice: Stage0Voice;
}) {
  return (
    <div className="stage0-check" data-check={check.id} data-result={result ? (result.correct ? 'right' : 'wrong') : 'open'} data-tries={result?.tries ?? 0}>
      <p>{check.question.target ? <span lang={lang}>{check.question.target}</span> : check.question.en}</p>
      <div className="stage0-options">
        {check.options.map((o, i) => (
          <button key={i} type="button" className={`btn stage0-option${result?.choice === i ? (result.correct ? ' is-right' : ' is-wrong') : ''}`} disabled={result?.correct} onClick={() => onAnswer(i)}>
            {o.picture && <span aria-hidden="true">{o.picture} </span>}{o.target ? <span lang={lang}>{o.target}</span> : o.en}
          </button>
        ))}
      </div>
      {result && !result.correct && (
        <div className="stage0-retry" data-testid="stage0-retry">
          <p className="card__note">Not quite — here is the line again. Read it, then answer again.</p>
          {againLines.map((l) => (
            <p key={l.id} className="stage0-model" data-line={l.id}>
              <TargetLine adapter={adapter} lang={lang} text={l.text} /> <PlayButton voice={voice} text={l.text} audio={l.audio} label="Hear it" />
            </p>
          ))}
          <button type="button" className="btn btn--small btn--quiet" onClick={onEnglish}>Show the English</button>
        </div>
      )}
      {result?.correct && <p className="card__note">Yes.</p>}
    </div>
  );
}

const KIND_TEXT: Record<Stage0ProductionTask['kind'], string> = {
  copy: 'Copy', choose: 'Choose', substitute: 'Change one word', complete: 'Complete', recall: 'From memory', answer: 'Answer', describe: 'Say it about yourself', retell: 'Retell',
};

/**
 * A production task. When it is also spoken (`speak`), the spoken part is a RETELLING, not reading aloud: once the written answer
 * is accepted, the target line is hidden and the learner is cued by the picture and the English meaning; the line comes back
 * only after the recording, beside it, for the learner's own "did you say the same thing?".
 */
export function ProductionView({ task, stepId, englishShown, voice, lines }: { task: Stage0ProductionTask; stepId: string; englishShown: boolean; voice: Stage0Voice; lines?: ReadonlyArray<Stage0Line> }) {
  const { stage0, userId, lang, store } = useApp();
  const [text, setText] = useState('');
  const [modelShown, setModelShown] = useState(task.kind === 'copy');
  const [result, setResult] = useState<{ accepted: boolean; feedback: string } | null>(null);
  const [revealed, setRevealed] = useState(false);
  const model = task.accept[0]?.text.replace(/\{x\}/g, '…') ?? '';
  const [spokenLine, setSpokenLine] = useState<string | undefined>(); // his own accepted sentence (it carries his name, town…) is the line he retells
  const spoken = spokenLine?.trim() || model;
  const retelling = !!task.speak && !!result?.accepted;
  const hideTarget = retelling && !revealed;
  const submit = async (value: string) => {
    const shown: Stage0Support[] = [...(modelShown ? ['model' as const] : []), ...(englishShown ? ['english' as const] : [])];
    const r = await stage0!.submitProduction(userId, lang, stepId, task.id, value, shown);
    setResult(r);
    if (r.accepted && !revealed) setSpokenLine(value);
  };
  return (
    <div className="stage0-task" data-task={task.id} data-kind={task.kind}>
      <p><span className="chip">{KIND_TEXT[task.kind]}</span> {task.prompt}</p>
      {task.kind === 'copy' && !hideTarget && <p className="stage0-model" lang={lang}>{model}</p>}
      {task.frame && !hideTarget && <p className="stage0-model" lang={lang}>{task.frame}</p>}
      {hideTarget ? null : task.kind === 'choose' ? (
        <div className="stage0-options">
          {task.options!.map((o) => <button key={o} type="button" className="btn stage0-option" lang={lang} onClick={() => { void submit(o); }}>{o}</button>)}
        </div>
      ) : (
        <div className="stage0-write">
          <input type="text" lang={lang} value={text} onChange={(e) => setText(e.target.value)} aria-label="Your answer" onKeyDown={(e) => { if (e.key === 'Enter' && text.trim()) void submit(text); }} />
          <button type="button" className="btn btn--primary btn--small" disabled={!text.trim()} onClick={() => { void submit(text); }}>Check</button>
          {!modelShown && <button type="button" className="btn btn--small btn--quiet" onClick={() => setModelShown(true)}>Show me an answer</button>}
        </div>
      )}
      {modelShown && task.kind !== 'copy' && !hideTarget && <p className="card__note">One answer: <span lang={lang}>{model}</span></p>}
      {result && <p className={`card__note ${result.accepted ? 'stage0-ok' : ''}`}>{result.feedback}</p>}
      {retelling && (
        <SpeakBox voice={voice} model={spoken} lang={lang} store={store} userId={userId} cue={retellCue(lang, task, lines, spoken)} onReveal={() => setRevealed(true)}
          onDone={(rid, self) => { void stage0!.recordSpeaking(userId, lang, stepId, task.id, rid, self); }} />
      )}
    </div>
  );
}
