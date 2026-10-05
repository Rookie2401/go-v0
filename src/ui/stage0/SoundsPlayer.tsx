/**
 * A sounds step: the sounds and letters of the language met THROUGH REAL WORDS (with their meaning and a picture), a short
 * explanation (more on request), then a few checks with the readings covered: how is it said, which word, which tone, where
 * do the words begin. Every answer records the features it exercised and whether a reading was on screen.
 */
import { useMemo, useState } from 'react';
import type { Stage0DecodeCheck, Stage0Overview, Stage0SoundStep } from '../../core';
import { describeFeature, wordsOf } from '../../stage0/features';
import { stage0Config } from '../../stage0/lang';
import { useApp } from '../context';
import { Disclosure } from '../ui';
import { useStage0Voice } from './audio';
import { PlayButton } from './parts';
import { useNextStep } from './nav';

export function SoundsPlayer({ stepId, refId, overview }: { stepId: string; refId: string; overview: Stage0Overview }) {
  const { stage0, userId, lang, store, adapters } = useApp();
  const adapter = adapters.get(lang);
  const step = stage0!.soundStep(lang, refId) as Stage0SoundStep;
  const cfg = stage0Config(lang);
  const script = cfg.script.kind !== 'latin';
  const voice = useStage0Voice(lang, store);
  const goNext = useNextStep(overview, stepId);
  const [testing, setTesting] = useState(false);
  const [answers, setAnswers] = useState<Record<string, boolean>>({});
  const focus = new Set(step.features);
  const words = useMemo(() => step.words.map((w) => ({ w, info: wordsOf(adapter, lang, w.text) })), [step, adapter, lang]);
  const audio = voice.available && voice.enabled ? 'computer-voice' as const : 'none' as const;
  const answer = async (c: Stage0DecodeCheck, a: number | number[]) => {
    const r = await stage0!.answerDecode(userId, lang, stepId, c.id, a, false, audio);
    setAnswers((x) => ({ ...x, [c.id]: r.correct }));
  };
  const allRight = step.checks.every((c) => answers[c.id]);

  return (
    <div className="stage0-sounds">
      <p>{step.explanation.short}</p>
      {step.explanation.more && <Disclosure label="More about these sounds"><p>{step.explanation.more}</p></Disclosure>}
      {!testing && (
        <>
          <ul className="stage0-soundwords" aria-label="Words with these sounds">
            {words.map(({ w, info }) => (
              <li key={w.text} className="stage0-card stage0-soundword">
                {w.picture && <span className="stage0-picture" aria-hidden="true">{w.picture}</span>}
                <span className="stage0-big" lang={lang}>{w.text}</span>
                <span className="card__note">“{w.en}”</span>
                <PlayButton voice={voice} text={w.text} audio={w.audio} />
                {script && info.some((x) => x.syllables.length) && (
                  <span className="stage0-sheet__units" aria-label="Its sound units">
                    {info.flatMap((x) => x.syllables).map((s, i) => (
                      <span key={i} className="stage0-unit" lang={lang}>{s.text} <small className="stage0-roman">{s.romanization}</small>{s.tone ? <small className="card__note"> {s.tone}</small> : null}</span>
                    ))}
                  </span>
                )}
                <ul className="card__text stage0-features">
                  {[...new Set(info.flatMap((x) => x.features))].filter((f) => focus.has(f)).map((f) => <li key={f}>{describeFeature(adapter, lang, f)}</li>)}
                </ul>
              </li>
            ))}
          </ul>
          <div className="actions"><button type="button" className="btn btn--primary" onClick={() => setTesting(true)}>I'm ready — cover the readings and test me</button></div>
        </>
      )}
      {testing && (
        <section aria-label="Read it yourself">
          <h2 className="section-head">Read it yourself</h2>
          {step.checks.map((c) => <DecodeView key={c.id} check={c} lang={lang} right={answers[c.id]} onAnswer={(a) => { void answer(c, a); }} />)}
          <div className="actions">
            <button type="button" className="btn btn--quiet" onClick={() => setTesting(false)}>See the words again</button>
            {allRight && <button type="button" className="btn btn--primary" onClick={() => { void stage0!.completeStep(userId, lang, stepId).then(goNext); }}>Finish this step</button>}
          </div>
        </section>
      )}
    </div>
  );
}

/** `quiet`: an assessment — one answer, no right/wrong shown. */
export function DecodeView({ check, lang, right, onAnswer, quiet = false }: { check: Stage0DecodeCheck; lang: string; right?: boolean; onAnswer(a: number | number[]): void; quiet?: boolean }) {
  const [last, setLast] = useState<number | null>(null);
  if (check.kind === 'segment') return <SegmentView check={check} lang={lang} right={quiet ? undefined : right} locked={quiet && right !== undefined} onAnswer={onAnswer} />;
  if (quiet) {
    return (
      <div className="stage0-check" data-check={check.id}>
        <p>{check.prompt ?? (check.kind === 'which-tone' ? 'Which tone does it have?' : 'How is it said?')} <span className="stage0-big" lang={lang}>{check.word}</span></p>
        <div className="stage0-options">{check.options!.map((o, i) => <button key={i} type="button" className={`btn stage0-option${last === i ? ' is-chosen' : ''}`} disabled={last !== null} onClick={() => { setLast(i); onAnswer(i); }}>{o}</button>)}</div>
      </div>
    );
  }
  return (
    <div className="stage0-check" data-check={check.id} data-result={right === undefined ? 'open' : right ? 'right' : 'wrong'}>
      <p>{check.prompt ?? (check.kind === 'which-tone' ? 'Which tone does it have?' : 'How is it said?')} <span className="stage0-big" lang={lang}>{check.word}</span></p>
      <div className="stage0-options">
        {check.options!.map((o, i) => (
          <button key={i} type="button" className={`btn stage0-option${last === i ? (right ? ' is-right' : ' is-wrong') : ''}`} disabled={right === true} onClick={() => { setLast(i); onAnswer(i); }}>{o}</button>
        ))}
      </div>
      {right === false && <p className="card__note">Not quite — look at the letters again.</p>}
      {right && <p className="card__note">Yes.</p>}
    </div>
  );
}

/** Thai: tap between letters where a new word starts. */
function SegmentView({ check, lang, right, onAnswer, locked = false }: { check: Stage0DecodeCheck; lang: string; right?: boolean; onAnswer(a: number[]): void; locked?: boolean }) {
  const clusters = useMemo(() => {
    const out: Array<{ text: string; start: number }> = [];
    try {
      for (const g of new Intl.Segmenter(lang, { granularity: 'grapheme' }).segment(check.word)) out.push({ text: g.segment, start: g.index });
    } catch { [...check.word].reduce((at, ch) => { out.push({ text: ch, start: at }); return at + ch.length; }, 0); }
    return out;
  }, [check.word, lang]);
  const [cuts, setCuts] = useState<Set<number>>(new Set());
  const toggle = (at: number) => setCuts((c) => { const n = new Set(c); if (n.has(at)) n.delete(at); else n.add(at); return n; });
  return (
    <div className="stage0-check" data-check={check.id} data-result={right === undefined ? 'open' : right ? 'right' : 'wrong'}>
      <p>{check.prompt ?? 'Tap where each new word begins.'}</p>
      <p className="stage0-segment" lang={lang}>
        {clusters.map((c, i) => (
          <span key={c.start}>
            {i > 0 && <button type="button" className={`stage0-cut${cuts.has(c.start) ? ' is-on' : ''}`} aria-pressed={cuts.has(c.start)} aria-label={`A word begins at letter ${i + 1}`} onClick={() => toggle(c.start)}>{cuts.has(c.start) ? '|' : '·'}</button>}
            <span>{c.text}</span>
          </span>
        ))}
      </p>
      <button type="button" className="btn btn--small" disabled={right === true || locked} onClick={() => onAnswer([...cuts].sort((a, b) => a - b))}>{locked ? 'Answered' : 'Check'}</button>
      {right === false && <p className="card__note">Not quite — read it aloud slowly and listen for the words.</p>}
      {right && <p className="card__note">Yes.</p>}
    </div>
  );
}
