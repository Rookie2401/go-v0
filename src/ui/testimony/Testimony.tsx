/**
 * My Testimony — constrained production.
 *
 * The learner writes first (an editor in the target language). What is typed is AUTOSAVED as a private draft
 * (see draft.ts: debounced, flushed on blur / hide / leaving / learner or language switch, with a local copy that
 * is offered back if storage ever fails). A draft is not a version: "Save this version" is a separate, explicit
 * act that freezes the text as an immutable revision and unlocks rehearsal (audio, shadowing, recording).
 *
 * "Check my writing" asks GoTell for suggestions; nothing is ever applied silently. Each suggestion states how
 * much it fixes and what the checker can and cannot see, names where its wording comes from, and is accepted,
 * rejected or edited by the learner. The optional English "What are you trying to say?" box asks GoTell for wording
 * built only from language the learner has met; when it cannot, it says what is missing and offers nothing to insert.
 */
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import type { GoTellSuggestion, IntentProposal, ProductionAnalysis, Testimony as TestimonyRow, TestimonyRevision } from '../../core';
import { useApp } from '../context';
import { formatDate, itemSurface } from '../format';
import { BackLink, Collapsible, Disclosure, Topbar } from '../ui';
import { statusText } from './draft';
import { RevisionAudio } from './RevisionAudio';
import { SuggestionCard } from './SuggestionCard';
import { useDraft } from './useDraft';
import { TestimonyMapPanel } from '../tell/TestimonyMap';

type DiffRow = { kind: 'same' | 'added' | 'removed' | 'changed'; a?: string; b?: string };

export function Testimony() {
  const { store, gotell, userId, lang, course, features } = useApp();
  const owner = useMemo(() => ({ userId, lang }), [userId, lang]);
  const { ctrl: rawCtrl, rerender } = useDraft(gotell, owner);
  // While the controller for a just-switched learner / language is being created, show nothing of the old one.
  const ctrl = rawCtrl && rawCtrl.owner.userId === userId && rawCtrl.owner.lang === lang ? rawCtrl : null;
  const draft = ctrl?.text ?? '';
  const editable = !!ctrl?.loaded;

  const [testimony, setTestimony] = useState<TestimonyRow | null>(null);
  const [revisions, setRevisions] = useState<TestimonyRevision[]>([]);
  const [analysis, setAnalysis] = useState<ProductionAnalysis | null>(null);
  const [suggestions, setSuggestions] = useState<GoTellSuggestion[]>([]);
  const [titles, setTitles] = useState<Map<string, string>>(new Map());
  const [busy, setBusy] = useState<null | 'check' | 'save' | 'intent' | 'restore'>(null);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [diff, setDiff] = useState<{ revisionId: string; rows: DiffRow[] } | null>(null);
  const [english, setEnglish] = useState('');
  const intentField = useRef<HTMLInputElement>(null);
  const [proposal, setProposal] = useState<IntentProposal | null>(null);
  const [undo, setUndo] = useState<{ text: string; number: number } | null>(null);

  // Load (or create) this learner's testimony and its history. Switching learner or language resets the working
  // screen; the draft itself is per learner + language and comes back when you switch back.
  useEffect(() => {
    let live = true;
    setTestimony(null); setRevisions([]); setAnalysis(null); setSuggestions([]); setDiff(null); setProposal(null); setUndo(null); setNotice(null); setError(null);
    void (async () => {
      const t = await gotell.getOrCreateTestimony(userId, lang);
      const revs = await gotell.listRevisions(t.id);
      if (!live) return;
      setTestimony(t);
      setRevisions([...revs].sort((a, b) => b.number - a.number));
    })().catch((e: unknown) => { if (live) setError(e instanceof Error ? e.message : String(e)); });
    return () => { live = false; };
  }, [gotell, userId, lang]);

  // Titles for provenance lines ("encountered 3 times in Story 1, John 3").
  useEffect(() => {
    const textIds = [...new Set(suggestions.flatMap((s) => s.familiar.flatMap((f) => f.textIds)))];
    if (textIds.length === 0) return;
    let live = true;
    void store.texts.getMany(textIds).then((rows) => {
      if (live) setTitles(new Map(rows.filter((t): t is NonNullable<typeof t> => !!t).map((t) => [t.id, t.title])));
    });
    return () => { live = false; };
  }, [store, suggestions]);

  const fail = (e: unknown) => setError(e instanceof Error ? e.message : String(e));

  const setDraft = useCallback((text: string) => {
    ctrl?.setText(text);
    rerender();
  }, [ctrl, rerender]);

  const check = useCallback(async () => {
    if (!ctrl || !testimony || ctrl.text.trim() === '') return;
    setBusy('check'); setError(null); setNotice(null);
    try {
      const result = await gotell.submitDraft(testimony.id, ctrl.text);
      setAnalysis(result);
      setSuggestions(result.suggestions);
    } catch (e) { fail(e); } finally { setBusy(null); }
  }, [gotell, testimony, ctrl]);

  const patchSuggestion = (id: string, status: GoTellSuggestion['status']) =>
    setSuggestions((prev) => prev.map((s) => (s.id === id ? { ...s, status } : s)));

  /** Replace the learner's own words with the chosen text — only ever after an explicit accept/edit. */
  const applyToDraft = (original: string, replacement: string) => {
    const d = ctrl?.text ?? '';
    if (d.includes(original)) setDraft(d.replace(original, replacement));
    else setNotice('That phrase is no longer in your draft, so nothing was changed. You can edit the text yourself.');
  };

  const accept = async (s: GoTellSuggestion) => {
    try { await gotell.acceptSuggestion(s.id); patchSuggestion(s.id, 'accepted'); applyToDraft(s.original, s.suggested); } catch (e) { fail(e); }
  };
  const reject = async (s: GoTellSuggestion) => {
    try { await gotell.rejectSuggestion(s.id); patchSuggestion(s.id, 'rejected'); } catch (e) { fail(e); }
  };
  const edit = async (s: GoTellSuggestion, finalText: string) => {
    try { await gotell.editSuggestion(s.id, finalText); patchSuggestion(s.id, 'edited'); applyToDraft(s.original, finalText); } catch (e) { fail(e); }
  };

  /** "Save this version": explicit, separate from autosave. The draft is saved first so nothing typed is left behind. */
  const save = useCallback(async () => {
    if (!ctrl || !testimony || ctrl.text.trim() === '') return;
    setBusy('save'); setError(null); setNotice(null);
    try {
      await ctrl.flush();
      const rev = await gotell.acceptRevision(testimony.id, ctrl.text);
      await ctrl.resync(); // saving a version touches the draft's bookkeeping (basedOnRevisionId)
      setRevisions((prev) => [rev, ...prev.filter((r) => r.id !== rev.id)].sort((a, b) => b.number - a.number));
      setNotice(`Saved as version ${rev.number}.`);
    } catch (e) { fail(e); } finally { setBusy(null); }
  }, [gotell, testimony, ctrl]);

  /** "Restore as draft": the version's text becomes the working draft; the version itself is untouched. */
  const restore = useCallback(async (rev: TestimonyRevision) => {
    if (!ctrl) return;
    setBusy('restore'); setError(null); setNotice(null);
    try {
      const previous = ctrl.text;
      await ctrl.flush(); // what was being written is stored before it is replaced
      const restored = await gotell.restoreRevisionAsDraft(rev.id);
      ctrl.adopt(restored);
      rerender();
      setUndo(previous.trim() !== '' && previous !== restored.text ? { text: previous, number: rev.number } : null);
      setNotice(`Version ${rev.number} is now your draft.`);
    } catch (e) { fail(e); } finally { setBusy(null); }
  }, [gotell, ctrl, rerender]);

  const undoRestore = () => {
    if (!undo) return;
    setDraft(undo.text);
    setUndo(null);
    setNotice('Your earlier draft is back.');
  };

  const compare = useCallback(async (rev: TestimonyRevision) => {
    const prev = revisions.find((r) => r.id === rev.parentRevisionId) ?? revisions.find((r) => r.number === rev.number - 1);
    if (!prev) return;
    try { setDiff({ revisionId: rev.id, rows: await gotell.diffRevisions(prev.id, rev.id) }); } catch (e) { fail(e); }
  }, [gotell, revisions]);

  const askIntent = useCallback(async () => {
    if (english.trim() === '') return;
    setBusy('intent'); setError(null);
    try { setProposal(await gotell.intent({ userId, lang, english, attempt: draft || undefined, task: 'testimony' })); } catch (e) { fail(e); } finally { setBusy(null); }
  }, [gotell, userId, lang, english, draft]);

  const copyText = () => {
    void navigator.clipboard?.writeText(draft).then(() => setNotice('Copied.'), () => setNotice('Could not copy automatically: select the text and copy it.'));
  };

  const bySentence = useMemo(() => {
    const m = new Map<number, GoTellSuggestion[]>();
    for (const s of suggestions) { const l = m.get(s.sentenceIndex) ?? []; l.push(s); m.set(s.sentenceIndex, l); }
    return [...m.entries()].sort((a, b) => a[0] - b[0]);
  }, [suggestions]);

  const latest = revisions[0];
  const status = ctrl?.status ?? { kind: 'loading' as const };
  const recovery = ctrl?.recovery ?? null;
  const canAct = !!ctrl && editable && !!testimony && draft.trim() !== '' && busy === null;

  return (
    <div>
      <Topbar title="My Testimony" left={<BackLink to="/" label="Home" />} />
      <div className="page page--narrow testimony route-fade">
        <p className="soft">Write in {course.title.split('→')[1]?.trim() ?? 'the language you are learning'}, in your own words. Suggestions are offered, never applied for you.</p>
        {gotell.practice && <p className="faint"><Link to="/tell">Practise saying parts of your testimony</Link>, one meaning at a time.</p>}

        {error && <p role="alert" className="error">{error}</p>}

        {recovery && (
          <div className="note note--warn" role="alert" data-testid="draft-recovery">
            <p><strong>Writing was found that was not saved last time.</strong> It was kept on this device{recovery.savedAt ? ` (${formatDate(recovery.savedAt)})` : ''}. It is not in your editor yet.</p>
            <p lang={lang} className="literal recovery__preview">{recovery.text.length > 160 ? `${recovery.text.slice(0, 160)}…` : recovery.text}</p>
            <div className="card__actions">
              <button type="button" className="btn btn--small btn--primary" onClick={() => { ctrl?.acceptRecovery(); rerender(); }}>Restore it</button>
              <button type="button" className="btn btn--small btn--quiet" onClick={() => { ctrl?.discardRecovery(); rerender(); }}>Discard it</button>
            </div>
          </div>
        )}

        <label className="field">
          <span className="label">Your testimony</span>
          <textarea
            className="editor" lang={lang} rows={8} value={draft} spellCheck={false}
            aria-label="Your testimony" aria-busy={!editable}
            readOnly={!editable}
            placeholder=""
            onChange={(e) => setDraft(e.target.value)}
            onBlur={() => { void ctrl?.flush(); }}
          />
        </label>
        <p
          role="status" className={`draft-status draft-status--${status.kind}`} data-testid="draft-status" data-state={status.kind}
        >{statusText(status)}</p>
        {status.kind === 'failed' && (
          <div className="card__actions">
            <button type="button" className="btn btn--small btn--quiet" onClick={copyText}>Copy my text</button>
            <button type="button" className="btn btn--small btn--quiet" onClick={() => { void ctrl?.flush(); }}>Try saving again</button>
          </div>
        )}
        {status.kind === 'conflict' && (
          <div className="note note--warn" role="alert" data-testid="draft-conflict">
            <p>
              <strong>Two versions of this draft exist.</strong> Another window saved a different draft at {formatDate(status.newer.updatedAt)}.
              What is on this page was last edited here and is not saved yet. Nothing has been overwritten; choose which to keep.
            </p>
            <p className="faint">On this page:</p>
            <p lang={lang} className="literal recovery__preview">{draft.length > 160 ? `${draft.slice(0, 160)}…` : draft}</p>
            <p className="faint">In the other window ({formatDate(status.newer.updatedAt)}):</p>
            <p lang={lang} className="literal recovery__preview">{status.newer.text.length > 160 ? `${status.newer.text.slice(0, 160)}…` : status.newer.text}</p>
            <div className="card__actions">
              <button type="button" className="btn btn--small" onClick={() => { ctrl?.useNewer(); rerender(); }}>Use the newer draft</button>
              <button type="button" className="btn btn--small btn--quiet" onClick={() => { void ctrl?.keepMine().then(rerender); }}>Keep mine</button>
            </div>
          </div>
        )}

        <div className="actions">
          <button type="button" className="btn btn--primary" disabled={!canAct} onClick={() => { void check(); }}>
            {busy === 'check' ? 'Checking…' : 'Check my writing'}
          </button>
          <button type="button" className="btn" disabled={!canAct} onClick={() => { void save(); }}>Save this version</button>
        </div>
        {notice && <p role="status" className="note">{notice}{undo && <> <button type="button" className="btn btn--small btn--quiet" onClick={undoRestore}>Undo</button></>}</p>}

        <Disclosure className="intent" label="What are you trying to say?" focusRef={intentField}>
          <label className="field">
            <span className="card__note">Say it in English. You will get wording built from language you have already met; if that is not possible you will be told what is missing.</span>
            <input ref={intentField} type="text" value={english} onChange={(e) => setEnglish(e.target.value)} aria-label="What you want to say, in English" />
          </label>
          <button type="button" className="btn btn--small" disabled={busy !== null || english.trim() === ''} onClick={() => { void askIntent(); }}>Help me say it</button>
          {proposal && <IntentBox proposal={proposal} lang={lang} onInsert={(text) => setDraft(draft ? `${draft}${lang === 'th' ? '' : ' '}${text}` : text)} />}
        </Disclosure>

        {gotell.practice && (
          <Disclosure className="tell-map-disclosure" label="Your testimony map" lazy>
            <TestimonyMapPanel practice={gotell.practice} userId={userId} lang={lang} revisionKey={latest?.id} />
          </Disclosure>
        )}

        {analysis && (
          <section className="suggestions" aria-label="Suggestions">
            <h2 className="section-head">Suggestions</h2>
            {suggestions.length === 0 ? (
              <p className="muted">Nothing to suggest. That does not guarantee every sentence is correct; read it aloud once more.</p>
            ) : (
              bySentence.map(([index, list]) => (
                <div key={index} className="sugg-group">
                  <h3 className="label">Sentence {index + 1}</h3>
                  <ul className="list plain">
                    {list.map((s) => (
                      <SuggestionCard key={s.id} suggestion={s} lang={lang} titles={titles}
                        onAccept={(x) => { void accept(x); }} onReject={(x) => { void reject(x); }} onEdit={(x, t) => { void edit(x, t); }} />
                    ))}
                  </ul>
                </div>
              ))
            )}
          </section>
        )}

        {features.listen && latest && <RevisionAudio key={latest.id} revision={latest} currentDraft={draft} />}

        <section className="history" aria-label="Version history">
          <h2 className="section-head">Versions</h2>
          {revisions.length === 0 ? <p className="muted">No saved versions yet.</p> : (
            <ol className="entrylist history-list" reversed>
              {revisions.map((r) => (
                <li key={r.id} className="entry entry--static" data-revision-id={r.id}>
                  <div className="history-head">
                    <strong className="entry__num">Version {r.number}</strong>
                    <span className="entry__preview">{formatDate(r.createdAt)} · {r.sentences.length} sentence{r.sentences.length === 1 ? '' : 's'}</span>
                  </div>
                  <p lang={lang} className="history-text">{r.fullText}</p>
                  <div className="card__actions">
                    <button type="button" className="btn btn--small btn--quiet" disabled={!editable || busy !== null} onClick={() => { void restore(r); }}>Restore as draft</button>
                    {r.number > 1 && <button type="button" className="btn btn--small btn--quiet" onClick={() => { void compare(r); }}>Show changes from version {r.number - 1}</button>}
                  </div>
                  <Collapsible open={diff?.revisionId === r.id}>
                    {diff?.revisionId === r.id && (
                      <ul className="diff" aria-label={`Changes in version ${r.number}`}>
                        {diff.rows.map((row, i) => (
                          <li key={i} data-kind={row.kind} lang={lang}>
                            {row.kind === 'same' && <span>{row.a ?? row.b}</span>}
                            {row.kind === 'added' && <><span className="diff-tag">added</span> <ins>{row.b}</ins></>}
                            {row.kind === 'removed' && <><span className="diff-tag">removed</span> <del>{row.a}</del></>}
                            {row.kind === 'changed' && <><span className="diff-tag">changed</span> <del>{row.a}</del> → <ins>{row.b}</ins></>}
                          </li>
                        ))}
                      </ul>
                    )}
                  </Collapsible>
                </li>
              ))}
            </ol>
          )}
        </section>
      </div>
    </div>
  );
}

/** The answer to "What are you trying to say?". Unsupported ⇒ the limitation and nothing to insert. */
function IntentBox({ proposal, lang, onInsert }: { proposal: IntentProposal; lang: string; onInsert(text: string): void }) {
  const canInsert = proposal.supported && proposal.insertable && !!proposal.proposal;
  return (
    <div className="proposal sugg" aria-label="Suggested wording" data-supported={proposal.supported ? 'true' : 'false'}>
      {!proposal.supported && (
        <>
          <p className="note note--warn" role="note" data-testid="intent-limitation">
            {proposal.limitation ?? 'Go cannot say this from the language you have met so far.'}
          </p>
          {proposal.unexpressed.length > 0 && (
            <ul className="card__text" aria-label="What could not be expressed">
              {proposal.unexpressed.map((u) => <li key={u}>{u}</li>)}
            </ul>
          )}
        </>
      )}
      {proposal.supported && proposal.proposal && (
        <p lang={lang} className="proposal-text natural">{proposal.proposal}</p>
      )}
      {proposal.supported && proposal.limitation && <p className="card__note">{proposal.limitation}</p>}
      {proposal.meaningNote && <p className="note note--warn" role="note">{proposal.meaningNote}</p>}
      {proposal.supported && proposal.sources.length > 0 && (
        <ul className="sugg-sources card__prov" aria-label="Where this wording comes from">
          {proposal.sources.map((s) => (
            <li key={`${s.sentenceId}|${s.itemId}`}><span className="faint">{s.textTitle}:</span> <span lang={lang} className="literal">{s.excerpt}</span></li>
          ))}
        </ul>
      )}
      {proposal.supported && proposal.newItems.length > 0 && (
        <ul className="card__text" aria-label="New language in this wording">
          {proposal.newItems.map((n) => <li key={n.itemId}><span lang={lang}>{n.surface || itemSurface(n.itemId)}</span>{n.gloss ? ` (${n.gloss})` : ''} — {n.whyNeeded}</li>)}
        </ul>
      )}
      {proposal.fallbackWithoutNew && (
        <p className="card__prov">Without any new language: <span lang={lang}>{proposal.fallbackWithoutNew.text}</span> — {proposal.fallbackWithoutNew.lossNote}</p>
      )}
      {canInsert && (
        <div className="card__actions">
          <button type="button" className="btn btn--small btn--quiet" onClick={() => onInsert(proposal.proposal!)}>Add to my draft</button>
        </div>
      )}
    </div>
  );
}
