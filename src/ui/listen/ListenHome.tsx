import { useCallback, useEffect, useState } from 'react';
import type { FormEvent } from 'react';
import { Link } from 'react-router-dom';
import type { Text } from '../../core';
import { recommendListening } from '../../golisten/recommendations';
import type { ListeningRecommendation } from '../../golisten/recommendations';
import { useApp } from '../context';
import { useListenEnabled } from '../reader/useListen';
import { isTestimonyText } from '../format';
import type { AudioImportManifest } from '../../core';
import { BackLink, Topbar } from '../ui';

type ListenPick = ListeningRecommendation;

/** GoListen's doorway lists only content for which the listening engine has found usable, lawful audio. */
export function ListenHome() {
  const { store, golisten, library, lang, userId } = useApp();
  const listenEnabled = useListenEnabled();
  const [texts, setTexts] = useState<Text[] | null>(null);
  const [picks, setPicks] = useState<ListenPick[]>([]);
  const [availableTexts, setAvailableTexts] = useState<Text[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [refresh, setRefresh] = useState(0);

  const load = useCallback(async () => {
    if (!listenEnabled) return;
    setError(null);
    // A restored/imported manifest can outlive a text row while its published catalogue copy
    // remains lazy. Only materialize those exact manifest targets; never scan/open the whole
    // catalogue or trigger speech generation just to build this doorway.
    const manifestIds = [...new Set((await store.manifests.all()).filter((m) => m.lang === lang).map((m) => m.textId))];
    const lazyCandidates = await Promise.all(manifestIds.map(async (textId) => {
      if (await store.texts.get(textId)) return undefined;
      try {
        const entry = await library.entry(textId);
        return entry?.lang === lang && entry.published ? entry : undefined;
      } catch { return undefined; }
    }));
    await Promise.all(lazyCandidates.filter((entry): entry is NonNullable<typeof entry> => !!entry).map(async (entry) => {
      try { await library.open(entry.id); } catch { /* One inaccessible catalogue copy must not hide other recordings. */ }
    }));
    const [rows, corpora] = await Promise.all([store.texts.where('lang', lang), store.corpora.all()]);
    const byCorpus = new Map(corpora.map((c) => [c.id, c]));
    const visible = rows.filter((t) => t.listeningAssessmentId === undefined && t.readingAssessmentId === undefined && !isTestimonyText(t, byCorpus) && t.published === true);
    setTexts(visible);

    const visibleIds = new Set(visible.map((t) => t.id));
    const [recommendations, statuses] = await Promise.all([
      recommendListening(store, userId, lang, { limit: 12 }),
      Promise.all(visible.map(async (text) => ({ textId: text.id, status: await golisten.audioStatus(text.id) }))),
    ]);
    const visiblePicks = recommendations.filter((p) => visibleIds.has(p.textId));
    setPicks(visiblePicks);
    const playableIds = new Set(statuses.filter(({ status }) =>
      (status.state === 'ready' || status.state === 'preview-only') && status.readySegments > 0 && status.playAllowed === true
      && (status.sourceType !== 'generated-tts' || status.isSpeech === true),
    ).map(({ textId }) => textId));
    const recommendedIds = new Set(visiblePicks.map((pick) => pick.textId));
    setAvailableTexts(visible.filter((t) => playableIds.has(t.id) && !recommendedIds.has(t.id)));
  }, [store, golisten, library, lang, userId, listenEnabled]);

  useEffect(() => {
    if (!listenEnabled) { setTexts([]); return; }
    setTexts(null);
    void load().catch((e: unknown) => setError(e instanceof Error ? e.message : String(e)));
  }, [load, refresh, listenEnabled]);

  return (
    <div>
      <Topbar title="GoListen" left={<BackLink to="/" label="Home" />} />
      <main className="page page--narrow route-fade" data-testid="golisten-home">
        <h1>Listen</h1>
        {!listenEnabled ? <p className="note" role="status">GoListen is not available in this version. <Link to="/">Return home</Link> or <Link to="/read">open GoLearn reading</Link>.</p> : <>
        <p className="card__note">Build understanding through speech. Text and listening progress stay separate.</p>
        {error && <p role="alert" className="error">Could not load listening material: {error}</p>}
        {texts === null ? <p role="status" className="muted">Finding listening material…</p> : (
          <>
            <section aria-labelledby="listen-continue-heading">
              <h2 id="listen-continue-heading">Ready to listen</h2>
              {picks.length ? (
                <ul className="list entrylist">
                  {picks.map((pick) => {
                    const text = texts.find((t) => t.id === pick.textId);
                    if (!text) return null;
                    return <li key={pick.textId}><Link className="entry" to={`/listen/${encodeURIComponent(text.id)}`} state={{ mode: pick.mode }}>
                      <span className="entry__title" lang={lang}>{text.kind === 'scripture' ? scriptureReference(text) : text.title}</span>
                      <span className="entry__preview">{pick.reason === 'resume' ? 'Continue listening' : `Start listening · ${pick.reason.replaceAll('-', ' ')}`}{pick.stageLabel ? ` · ${pick.stageLabel}` : ''}</span>
                      <span className="card__note">{pick.explanation}</span>
                    </Link></li>;
                  })}
                </ul>
              ) : <p className="note" role="status">{availableTexts.length
                ? 'No unfinished listening passages. Choose a recording below to listen again.'
                : 'No approved listening audio is ready for this language yet. You can still read in GoLearn, or add a recording with its rights and source details below.'}</p>}
            </section>
            {availableTexts.length > 0 && <section aria-labelledby="listen-recordings-heading" data-testid="listen-available-recordings">
              <h2 id="listen-recordings-heading">Available recordings</h2>
              <ul className="list entrylist">
                {availableTexts.map((text) => <li key={text.id}>
                  <Link className="entry" to={`/listen/${encodeURIComponent(text.id)}`}>
                    <span className="entry__title" lang={lang}>{text.kind === 'scripture' ? scriptureReference(text) : text.title}</span>
                    <span className="entry__preview">Open recording</span>
                  </Link>
                </li>)}
              </ul>
            </section>}
            <section className="card" aria-labelledby="listen-import-heading">
              <h2 id="listen-import-heading">Add a recording</h2>
              <p className="card__note">Choose a WAV recording and its JSON manifest. The manifest must identify the exact text and document permission to play and segment the recording. Files stay on this device.</p>
              <RecordingImport texts={texts.filter((t) => t.published === true)} onImported={() => setRefresh((n) => n + 1)} />
            </section>
            <p className="home__links"><Link to="/read">GoLearn reading</Link><Link to="/scripture">Scripture</Link></p>
          </>
        )}
        </>}
      </main>
    </div>
  );
}

function scriptureReference(text: Text): string {
  if (text.scripture) return `${text.scripture.book} ${text.scripture.chapter}`;
  return text.chapter ? `Chapter ${text.chapter.index}` : 'Scripture passage';
}

function RecordingImport({ texts, onImported }: { texts: Text[]; onImported(): void }) {
  const { golisten, library, store, lang } = useApp();
  const [textId, setTextId] = useState('');
  const [manifestFile, setManifestFile] = useState<File | null>(null);
  const [audioFile, setAudioFile] = useState<File | null>(null);
  const [working, setWorking] = useState(false);
  const [message, setMessage] = useState('');

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    if (!textId || !manifestFile || !audioFile) return;
    setWorking(true); setMessage('');
    try {
      const parsed: unknown = JSON.parse(await manifestFile.text());
      if (!parsed || typeof parsed !== 'object' || !('textId' in parsed) || typeof parsed.textId !== 'string' || !parsed.textId) throw new Error('The manifest must name the exact text release.');
      const targetId = parsed.textId;
      if (textId !== '__manifest__' && targetId !== textId) throw new Error('The manifest is for a different text. Choose that exact text release before importing.');
      // A newly acquired published text may still be lazy. Resolve only the exact canonical ID named in
      // the manifest, then recheck the materialized row before the audio importer sees it.
      let target = await store.texts.get(targetId);
      if (!target) {
        const entry = await library.entry(targetId);
        if (!entry || entry.id !== targetId || entry.lang !== lang || entry.published !== true) {
          throw new Error('The manifest text is not available as a published text in this language.');
        }
        target = await library.open(targetId);
      }
      const corpora = await store.corpora.all();
      if (target.id !== targetId || target.lang !== lang || target.published !== true || (target.listeningAssessmentId !== undefined || target.readingAssessmentId !== undefined)
        || isTestimonyText(target, new Map(corpora.map((corpus) => [corpus.id, corpus])))) {
        throw new Error('The manifest text is not available for listening in this language.');
      }
      const manifest = parsed as AudioImportManifest;
      const bytes = new Uint8Array(await audioFile.arrayBuffer());
      // A recording a learner adds is always a learner import: it plays here, and never counts as reviewed listening evidence.
      await golisten.importRecording({ manifest, bytes, origin: 'learner' });
      setMessage('Recording checked and added. It plays on this device. It counts toward listening progress only after a named reviewer approves it for the course.');
      setManifestFile(null); setAudioFile(null); onImported();
    } catch (err) {
      setMessage(err instanceof Error ? err.message : 'The recording could not be imported.');
    } finally { setWorking(false); }
  };

  return <form className="stack" onSubmit={(e) => { void submit(e); }}>
    <p className="note note--warn" role="note" data-testid="import-warning">
      This recording plays on this device. It counts toward listening progress only after a named reviewer approves it for the course.
      The rights stated in the manifest are your own statement; the app does not verify them.
    </p>
    <label className="field"><span className="label">Text release</span>
      <select aria-label="Text release" value={textId} onChange={(e) => setTextId(e.target.value)}>
        <option value="">Choose the exact text</option>
        <option value="__manifest__">Use exact text named in manifest</option>
        {texts.map((t) => <option key={t.id} value={t.id}>{t.title}{t.version ? ` · ${t.version}` : ''} · v{t.contentVersion} · {t.id}</option>)}
      </select>
    </label>
    <label className="field"><span className="label">Recording manifest (.json)</span><input aria-label="Recording manifest" type="file" accept="application/json,.json" onChange={(e) => setManifestFile(e.currentTarget.files?.[0] ?? null)} /></label>
    <label className="field"><span className="label">Audio (.wav)</span><input aria-label="Audio file" type="file" accept="audio/wav,.wav" onChange={(e) => setAudioFile(e.currentTarget.files?.[0] ?? null)} /></label>
    <button className="btn btn--small" type="submit" disabled={working || !textId || !manifestFile || !audioFile}>{working ? 'Checking recording…' : 'Check and add recording'}</button>
    {message && <p role={message.startsWith('Recording checked') ? 'status' : 'alert'}>{message}</p>}
  </form>;
}
