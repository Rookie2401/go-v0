/**
 * The Stage 0 check: new material built from what the path taught, to see whether the learner can now learn from real
 * simple texts. Starting it shows the material, so it counts as seen from that moment (a retake gets the other form).
 * Reading: no English, no pictures; a word can be looked up (counted). Listening: only with native recordings — otherwise
 * said so, not faked. Writing and speaking: a few short answers; spoken answers are recorded and compared by the learner.
 */
import { useState } from 'react';
import type { Stage0ExitForm, Stage0ExitResult, Stage0ExitSection, Stage0Overview } from '../../core';
import { stage0Config } from '../../stage0/lang';
import { useApp } from '../context';
import { recordingSupported } from '../testimony/recorder';
import { useStage0Voice } from './audio';
import { PlayButton, SpeakBox, TargetLine, WordSheet } from './parts';
import type { WordInfo } from '../../stage0/features';
import { DecodeView } from './SoundsPlayer';
import { bundledStage0 } from '../../stage0/content';
import { castName } from './names';
import { NextTexts } from './Stage0Home';

export function ExitCheck({ overview }: { overview: Stage0Overview }) {
  const { stage0, userId, lang, store, adapters } = useApp();
  const adapter = adapters.get(lang);
  const cfg = stage0Config(lang);
  const voice = useStage0Voice(lang, store);
  const [attempt, setAttempt] = useState<{ attemptId: string; form: Stage0ExitForm; unseen: boolean; unavailable: Stage0ExitSection[] } | null>(null);
  const [result, setResult] = useState<Stage0ExitResult | null>(null);
  const [lookups, setLookups] = useState(0);
  const [sheet, setSheet] = useState<WordInfo | null>(null);
  const [done, setDone] = useState<Record<string, boolean | undefined>>({});
  const [texts, setTexts] = useState<Record<string, string>>({});

  const start = async () => {
    const a = await stage0!.startExit(userId, lang, { microphone: recordingSupported() });
    setAttempt({ attemptId: a.attemptId, form: stage0!.exitForm(lang, a.formId)!, unseen: a.unseen, unavailable: a.unavailable });
  };
  const send = async (section: Stage0ExitSection, itemId: string, ans: Parameters<NonNullable<typeof stage0>['answerExit']>[5]) => {
    const r = await stage0!.answerExit(userId, lang, attempt!.attemptId, section, itemId, ans);
    setDone((d) => ({ ...d, [`${section}:${itemId}`]: r.correct ?? r.accepted ?? true }));
  };
  const finish = async () => setResult(await stage0!.finishExit(userId, lang, attempt!.attemptId));

  if (result) {
    return (
      <section className="stage0-exit" aria-label="Your result">
        <h2 className="section-head">{result.verdict === 'ready' ? 'Ready for real texts' : result.verdict === 'ready-provisional' ? 'Ready for real texts — with one part still to come' : 'Not yet'}</h2>
        <p>{result.verdictDetail}</p>
        {!result.unseen && <p className="card__note">You had seen this material before, so this result says less about transfer.</p>}
        <ul className="stage0-sections">
          {result.sections.map((s) => <li key={s.section} data-section={s.section} data-status={s.status}><strong>{s.section}</strong>: {s.status} — {s.detail}</li>)}
        </ul>
        <p className="card__note">Stage 0 is a beginning (before A1), not a level certificate.</p>
        {(result.verdict === 'ready' || result.verdict === 'ready-provisional') && <NextTexts next={overview.after} />}
      </section>
    );
  }

  if (!attempt) {
    return (
      <section className="stage0-exit" aria-label="The Stage 0 check">
        <p>This check uses sentences you have <strong>not</strong> seen, made only of language from the path. It shows whether you can now learn from new simple texts.</p>
        <ul className="card__text">
          <li>Reading — a short passage and a few questions. No English; you may look up a word (it is counted).</li>
          <li>Listening — {'only with recordings of native speakers; none exist yet, so this part will be marked "not given".'}</li>
          <li>Writing — three short answers. Speaking — one spoken answer, recorded and compared by you.</li>
          {cfg.exit.decoding && <li>Reading the script — unseen words, with no romanization.</li>}
        </ul>
        <p className="card__note">Once you start, this material counts as seen, even if you stop half-way.</p>
        <div className="actions"><button type="button" className="btn btn--primary" onClick={() => { void start(); }}>Start the check</button></div>
      </section>
    );
  }

  const f = attempt.form;
  const answered = (k: string) => done[k] !== undefined;
  return (
    <div className="stage0-exit">
      <section aria-label="Reading">
        <h2 className="section-head">Reading</h2>
        <div className="stage0-passage">
          {f.reading.lines.map((l) => <p key={l.id}><TargetLine adapter={adapter} lang={lang} text={l.text} onWord={(w) => { setSheet(w); setLookups((n) => n + 1); }} /></p>)}
        </div>
        {sheet && <WordSheet adapter={adapter} lang={lang} word={sheet} script={false} onClose={() => setSheet(null)} onRomanize={() => undefined} name={castName(bundledStage0().world, lang, sheet.surface)} />}
        <p className="card__note">Words looked up: {lookups}.</p>
        {f.reading.checks.map((c, i) => (
          <div key={c.id} className="stage0-check" data-check={c.id}>
            <p>{c.question.en}</p>
            <div className="stage0-options">
              {c.options.map((o, j) => <button key={j} type="button" className="btn stage0-option" disabled={answered(`reading:${c.id}`)} onClick={() => { void send('reading', c.id, { choice: j, lookups: i === 0 ? lookups : 0 }); }}>{o.en ?? o.target}</button>)}
            </div>
            {answered(`reading:${c.id}`) && <p className="card__note">Answered.</p>}
          </div>
        ))}
      </section>

      <section aria-label="Listening">
        <h2 className="section-head">Listening</h2>
        {attempt.unavailable.includes('listening')
          ? <p className="card__note">Not given: there are no recordings of native speakers for this check yet. A computer voice would not be a fair test of listening.</p>
          : f.listening.checks.map((c) => {
            const line = f.listening.lines.find((l) => l.id === c.lines[0]);
            return (
              <div key={c.id} className="stage0-check">
                {line && <PlayButton voice={voice} text={line.text} audio={line.audio} />}
                <p>{c.question.en}</p>
                <div className="stage0-options">{c.options.map((o, j) => <button key={j} type="button" className="btn stage0-option" disabled={answered(`listening:${c.id}`)} onClick={() => { void send('listening', c.id, { choice: j }); }}>{o.en}</button>)}</div>
              </div>
            );
          })}
      </section>

      <section aria-label="Writing">
        <h2 className="section-head">Writing</h2>
        {f.writing.map((t) => (
          <div key={t.id} className="stage0-task">
            <p>{t.prompt}</p>
            <div className="stage0-write">
              <input type="text" lang={lang} aria-label="Your answer" value={texts[t.id] ?? ''} disabled={answered(`writing:${t.id}`)} onChange={(e) => setTexts((x) => ({ ...x, [t.id]: e.target.value }))} />
              <button type="button" className="btn btn--small" disabled={!texts[t.id]?.trim() || answered(`writing:${t.id}`)} onClick={() => { void send('writing', t.id, { text: texts[t.id] }); }}>Done</button>
            </div>
          </div>
        ))}
      </section>

      <section aria-label="Speaking">
        <h2 className="section-head">Speaking</h2>
        {f.speaking.map((s) => (
          <div key={s.id}>
            <p>{s.prompt}</p>
            {answered(`speaking:${s.id}`) ? <p className="card__note">Recorded.</p> : (
              <SpeakBox voice={voice} model={s.model} lang={lang} store={store} userId={userId}
                onDone={(rid, self) => { void send('speaking', s.id, { ...(rid ? { recordingId: rid } : {}), selfCheck: self }); }} />
            )}
          </div>
        ))}
      </section>

      {f.decoding?.length ? (
        <section aria-label="Reading the script">
          <h2 className="section-head">Reading the script</h2>
          {f.decoding.map((c) => <DecodeView key={c.id} quiet check={c} lang={lang} right={done[`decoding:${c.id}`] as boolean | undefined}
            onAnswer={(a) => { if (!answered(`decoding:${c.id}`)) void send('decoding', c.id, Array.isArray(a) ? { boundaries: a } : { choice: a }); }} />)}
        </section>
      ) : null}

      <div className="actions"><button type="button" className="btn btn--primary" onClick={() => { void finish(); }}>Finish the check</button></div>
    </div>
  );
}
