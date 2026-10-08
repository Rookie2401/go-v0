/**
 * Settings → Content → Recordings: recordings are curation, not a destination. GoListen is GoLearn's listening layer, shown in the
 * Reader wherever a recording exists; this block is where recordings are ADDED and where the learner can see which texts of the
 * language have one and what review it has.
 *
 *  - The list: each text of the language with playable audio, its title (a link into the Reader), and its review state in plain
 *    words (reviewed and counted / not reviewed, plays here only / synthetic practice).
 *  - "Add a recording": the same form and the same checks the listening page had. Every recording a learner adds is a learner
 *    import (`origin: 'learner'`): it plays on this device, is capped at machine_checked, and can never be listening evidence.
 *    The rights in the manifest are the uploader's own statement.
 */
import { useCallback, useEffect, useState } from 'react';
import type { FormEvent } from 'react';
import { Link } from 'react-router-dom';
import type { AudioImportManifest, AudioStatus, Text } from '../../../core';
import { useApp, useListening } from '../../context';
import { isTestimonyText, textPath } from '../../format';
import { Disclosure } from '../../ui';

interface RecordingRow { textId: string; title: string; path: string; status: AudioStatus }

/** Is this a recording the learner can actually play (lawful, with audio, and speech rather than a placeholder tone)? */
function playable(status: AudioStatus): boolean {
  return (status.state === 'ready' || status.state === 'preview-only') && status.readySegments > 0 && status.playAllowed === true
    && (status.sourceType !== 'generated-tts' || status.isSpeech === true);
}

/** The review state of one recording, in the words the Reader's ListenBar and Player use. */
export function reviewStateLine(status: AudioStatus): string {
  if (status.state === 'ready' && status.evidenceEligible) return 'Reviewed recording: counts as listening.';
  if (status.sourceType === 'generated-tts' || status.state === 'ready') return status.reason ?? 'Synthetic speech: practice only, not counted as listening.';
  return `Not reviewed: plays on this device, not counted as listening.${status.reason ? ` ${status.reason}` : ''}`;
}

export function RecordingsBlock() {
  const { store, lang } = useApp();
  const listening = useListening();
  const [rows, setRows] = useState<RecordingRow[] | null>(null);
  const [importable, setImportable] = useState<Text[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [refresh, setRefresh] = useState(0);

  const load = useCallback(async () => {
    setError(null);
    const manifestIds = [...new Set((await store.manifests.all()).filter((m) => m.lang === lang).map((m) => m.textId))];
    const [texts, corpora] = await Promise.all([store.texts.where('lang', lang), store.corpora.all()]);
    const byCorpus = new Map(corpora.map((c) => [c.id, c]));
    const visible = texts.filter((t) => t.listeningAssessmentId === undefined && t.readingAssessmentId === undefined && !isTestimonyText(t, byCorpus));
    const byId = new Map(visible.map((t) => [t.id, t]));
    setImportable(visible.filter((t) => t.published === true));
    const found: RecordingRow[] = [];
    for (const textId of manifestIds) {
      const text = byId.get(textId);
      // A manifest can outlive its text row, or point at a library text this device has not opened; both are listed by what is known,
      // and never opened here (no catalogue scan, no speech request).
      if (text ? text.published !== true : !!(await store.texts.get(textId))) continue; // unpublished, private or protected: not listed
      const title = text?.title ?? (await store.catalog.get(textId).catch(() => undefined))?.title ?? textId;
      const status = await listening.audioStatus(textId);
      if (!playable(status)) continue;
      found.push({ textId, title, path: text ? textPath(text) : `/read/${encodeURIComponent(textId)}`, status });
    }
    setRows(found.sort((a, b) => a.title.localeCompare(b.title)));
  }, [store, listening, lang]);

  useEffect(() => {
    setRows(null);
    void load().catch((e: unknown) => { setRows([]); setError(e instanceof Error ? e.message : String(e)); });
  }, [load, refresh]);

  return (
    <div className="recordings" data-testid="recordings" aria-label="Recordings" role="group">
      <h3 className="disclosure__heading">Recordings</h3>
      <p className="card__note">
        Listening is part of reading: where a text has a recording, the Reader offers it. Recordings are added here. Only a recording
        a named reviewer has approved counts as listening evidence.
      </p>
      {error && <p role="alert" className="error">Could not list recordings: {error}</p>}
      {rows === null ? <p className="muted" role="status">Looking for recordings…</p> : rows.length === 0 ? (
        <p className="muted" data-testid="recordings-empty">No recordings on this device for this language yet. You can still read, and use the computer voice for practice.</p>
      ) : (
        <ul className="list entrylist" aria-label="Texts with a recording">
          {rows.map((r) => (
            <li key={r.textId} data-text-id={r.textId} data-evidence={r.status.evidenceEligible ? 'yes' : 'no'}>
              <Link className="entry" to={r.path}>
                <span className="entry__title" lang={lang}>{r.title}</span>
                <span className="entry__preview" data-testid="recording-state">{reviewStateLine(r.status)}</span>
              </Link>
            </li>
          ))}
        </ul>
      )}
      <Disclosure headingLevel={3} label="Add a recording">
        <p className="card__note">Choose a WAV recording and its JSON manifest. The manifest must identify the exact text and document permission to play and segment the recording. Files stay on this device.</p>
        <RecordingImport texts={importable} onImported={() => setRefresh((n) => n + 1)} />
      </Disclosure>
    </div>
  );
}

function RecordingImport({ texts, onImported }: { texts: Text[]; onImported(): void }) {
  const { library, store, lang } = useApp();
  const listening = useListening();
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
      await listening.importRecording({ manifest, bytes, origin: 'learner' });
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
