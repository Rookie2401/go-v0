/**
 * Start from zero (#/start) — the Stage 0 path for the active language.
 * Meaning first, terminology last: progress is shown as growing independence ("letters you read on your own",
 * "sentences understood before any English", "understood by ear"), never as streaks or points.
 */
import { useCallback, useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import type { Stage0Meters, Stage0Overview, Text } from '../../core';
import { stage0Config } from '../../stage0/lang';
import { useApp } from '../context';
import { textPath } from '../format';
import { BackLink, Disclosure, Topbar } from '../ui';
import { useStage0Voice } from './audio';
import { ProductionView } from './StepPage';
import './stage0.css';

const STATUS: Record<string, string> = { new: 'new', started: 'started', done: 'done', secure: 'on your own' };

export function Stage0Home() {
  const { stage0, userId, lang, store } = useApp();
  const navigate = useNavigate();
  const [ov, setOv] = useState<Stage0Overview | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [preparing, setPreparing] = useState(true);
  const voice = useStage0Voice(lang, store);
  const cfg = stage0Config(lang);

  const load = useCallback(async () => {
    if (!stage0) return;
    try {
      setOv(await stage0.overview(userId, lang));
    } catch (e) { setError(e instanceof Error ? e.message : String(e)); }
  }, [stage0, userId, lang]);

  useEffect(() => {
    let live = true;
    setPreparing(true);
    void (async () => {
      try { if (stage0?.available(lang)) await stage0.ensureTexts(lang); } catch (e) { if (live) setError(e instanceof Error ? e.message : String(e)); }
      if (live) setPreparing(false);
      await load();
    })();
    return () => { live = false; };
  }, [stage0, lang, load]);

  if (!stage0 || (ov && !ov.available)) {
    return (
      <div>
        <Topbar title="Start from zero" left={<BackLink to="/" label="Home" />} />
        <div className="page page--narrow"><p className="muted">Stage 0 is not available for {cfg?.name ?? 'this language'} yet.</p></div>
      </div>
    );
  }

  const needsForm = !!cfg.speakerForms && ov && !ov.speakerForm;
  const setForm = async (form: 'm' | 'f') => { await stage0.setSpeakerForm(userId, lang, form); await load(); };
  const done = ov?.steps.filter((s) => s.status === 'done' || s.status === 'secure').length ?? 0;

  return (
    <div>
      <Topbar title="Start from zero" left={<BackLink to="/" label="Home" />} />
      <div className="page page--narrow stage0 route-fade">
        <h1 className="stage0-title">{cfg.name} from zero</h1>
        <p className="soft">{cfg.intro}</p>
        {ov && <p className="note note--warn stage0-draft" data-testid="stage0-draft" role="note">{ov.contentStatus}</p>}
        {error && <p role="alert" className="error">{error}</p>}
        {preparing && <p className="muted" role="status">Preparing the first scenes…</p>}

        {needsForm && (
          <section className="stage0-card" aria-label="Your speaker forms">
            <p><strong>{cfg.speakerForms!.question}</strong></p>
            <p className="card__note">{cfg.speakerForms!.why}</p>
            <div className="actions">
              <button type="button" className="btn" onClick={() => { void setForm('m'); }}>Forms for a man</button>
              <button type="button" className="btn" onClick={() => { void setForm('f'); }}>Forms for a woman</button>
            </div>
          </section>
        )}

        {ov && (
          <>
            {ov.next && !preparing && (
              <div className="actions">
                <button type="button" className="btn btn--primary" onClick={() => navigate(`/start/${ov.next!.id}`)} data-testid="stage0-continue">
                  {done === 0 ? 'Begin' : 'Continue'}: {ov.steps.find((s) => s.step.id === ov.next!.id)?.title}
                </button>
              </div>
            )}
            {ov.nextCoverage && (
              <p className="card__note" data-testid="stage0-next-coverage">
                In the next scene, {Math.round(ov.nextCoverage.curriculum * 100)} % of the words are words met before them on the path (in earlier steps or earlier lines){ov.nextCoverage.personal !== undefined ? `; you have already met ${Math.round(ov.nextCoverage.personal * 100)} % of its words yourself` : ''}. The rest is new — few enough for the meaning to stay clear.
              </p>
            )}
            {ov.retrieval && <RetrievalCard key={`${ov.retrieval.stepId}/${ov.retrieval.taskId}`} retrieval={ov.retrieval} sceneId={ov.steps.find((s) => s.step.id === ov.retrieval!.stepId)?.step.ref} />}
            <SoundLine voice={voice} name={cfg.name} />
            <Meters meters={ov.meters} script={cfg.script.kind !== 'latin'} />
            {ov.exit && (
              <section className="stage0-card" aria-label="Your Stage 0 check">
                <p><strong>{ov.exit.verdict === 'ready' ? 'Ready for real texts.' : ov.exit.verdict === 'ready-provisional' ? 'Ready for real texts (listening not yet tested).' : 'Not yet — keep going.'}</strong></p>
                <p className="card__note">{ov.exit.verdictDetail}</p>
                {(ov.exit.verdict === 'ready' || ov.exit.verdict === 'ready-provisional') && <NextTexts next={ov.after} />}
              </section>
            )}
            <Disclosure label={`The whole path (${done} of ${ov.steps.length} done)`} className="stage0-path" defaultOpen={done === 0}>
              <ol className="stage0-steps">
                {ov.steps.map((s) => (
                  <li key={s.step.id} data-step={s.step.id} data-status={s.status} className={`stage0-step stage0-step--${s.status}`}>
                    <Link to={`/start/${s.step.id}`}>{s.title}</Link>
                    <span className="chip">{STATUS[s.status]}</span>
                    <span className="card__note">{s.detail}</span>
                  </li>
                ))}
              </ol>
            </Disclosure>
          </>
        )}
      </div>
    </div>
  );
}

/** From memory: one earlier task he has met but not yet produced on his own. */
function RetrievalCard({ retrieval, sceneId }: { retrieval: NonNullable<Stage0Overview['retrieval']>; sceneId?: string }) {
  const { stage0, lang, store } = useApp();
  const voice = useStage0Voice(lang, store);
  const task = sceneId ? stage0!.scene(lang, sceneId)?.production?.find((t) => t.id === retrieval.taskId) : undefined;
  if (!task) return null;
  return (
    <section className="stage0-card" aria-label="From memory" data-testid="stage0-retrieval">
      <p><strong>From memory</strong> — {retrieval.why}</p>
      <ProductionView task={task} stepId={retrieval.stepId} englishShown={false} voice={voice} />
    </section>
  );
}

function SoundLine({ voice, name }: { voice: ReturnType<typeof useStage0Voice>; name: string }) {
  if (!voice.available) {
    return <p className="card__note" data-testid="stage0-sound">No recordings of native speakers exist yet, and this device has no {name} computer voice: Stage 0 works by reading for now. Listening steps will say so.</p>;
  }
  return (
    <p className="card__note" data-testid="stage0-sound">
      No recordings of native speakers exist yet. This device has a {name} computer voice ({voice.voiceName}) for practice — it is not a native speaker and does not count as listening practice in your progress.{' '}
      <label className="stage0-toggle"><input type="checkbox" checked={voice.enabled} onChange={(e) => voice.setEnabled(e.target.checked)} /> Use the computer voice</label>
    </p>
  );
}

function Meters({ meters: m, script }: { meters: Stage0Meters; script: boolean }) {
  const prod = Object.values(m.production).reduce((n, x) => n + (x?.accepted ?? 0), 0);
  const rows: Array<[string, string]> = [
    [script ? 'Letters and patterns you read on your own' : 'Sound–spelling patterns you read on your own', `${m.decoding.secure} of ${m.decoding.total}`],
    ['Sentences understood before any English (recent)', m.readingIndependence.answered ? `${m.readingIndependence.unaided} of ${m.readingIndependence.answered}` : '—'],
    ['Understood only by ear (native recordings)', m.listening.native.answered ? `${m.listening.native.correct} of ${m.listening.native.answered}` : 'none yet'],
    ['Understood by ear with the computer voice (practice)', m.listening.computerVoice.answered ? `${m.listening.computerVoice.correct} of ${m.listening.computerVoice.answered}` : '—'],
    ['Patterns understood without English', `${m.constructions.recognized} of ${m.constructions.total}`],
    ['Patterns you have used yourself (no model shown)', `${m.constructions.produced} of ${m.constructions.total}`],
    ['Sentences you made yourself', String(prod)],
    ['Spoken answers recorded', String(m.speaking.recorded)],
    ['Help you needed (recent questions with English first)', m.supportDependence.window ? `${m.supportDependence.english} of ${m.supportDependence.window}` : '—'],
  ];
  if (script) rows.push(['Recent questions with romanization on screen', m.supportDependence.window ? `${m.supportDependence.transliteration} of ${m.supportDependence.window}` : '—']);
  return (
    <section className="stage0-meters" aria-label="Your independence">
      <h2 className="section-head">How independent you are</h2>
      <dl>{rows.map(([k, v]) => <div key={k} className="stage0-meter"><dt>{k}</dt><dd>{v}</dd></div>)}</dl>
    </section>
  );
}

/** The first ordinary texts after Stage 0. They are drafts until reviewed, so they open in preview mode only — said plainly. */
export function NextTexts({ next }: { next: Stage0Overview['after'] }) {
  const { store } = useApp();
  const [rows, setRows] = useState<Array<{ textId: string; title: string; note?: string; text?: Text; published: boolean }>>([]);
  useEffect(() => {
    let live = true;
    void store.texts.getMany(next.map((n) => n.textId)).then((ts) => {
      if (live) setRows(next.map((n, i) => ({ ...n, ...(ts[i] ? { text: ts[i]! } : {}), published: ts[i]?.published === true })));
    });
    return () => { live = false; };
  }, [store, next]);
  if (!rows.length) return null;
  return (
    <div>
      <p>Your next texts:</p>
      <ul className="stage0-next">
        {rows.map((r) => (
          <li key={r.textId}>
            {r.text ? <Link to={textPath(r.text)}>{r.title}</Link> : <span>{r.title}</span>}
            {!r.text && <span className="card__note"> — not installed on this device.</span>}
            {r.text && !r.published && <span className="card__note"> — a draft waiting for review: it opens when preview is on (Settings).</span>}
            {r.note && <span className="card__note"> {r.note}</span>}
          </li>
        ))}
      </ul>
    </div>
  );
}
