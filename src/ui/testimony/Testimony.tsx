/**
 * My Testimony — constrained production.
 *
 * The learner writes first (an empty textarea, in the target language). "Check my writing" asks GoTell
 * for suggestions; nothing is ever applied silently. Each suggestion is accepted, rejected or edited by
 * the learner. "Save this version" freezes the text as a new revision (history is never overwritten) and
 * unlocks rehearsal (audio, shadowing, recording). The optional English "What are you trying to say?"
 * field asks GoTell for a constrained proposal — it never replaces the learner's own attempt.
 */
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { GoTellSuggestion, IntentProposal, ProductionAnalysis, Testimony as TestimonyRow, TestimonyRevision } from '../../core';
import { useApp } from '../context';
import { formatDate, itemSurface } from '../format';
import { RevisionAudio } from './RevisionAudio';
import { SuggestionCard } from './SuggestionCard';

type DiffRow = { kind: 'same' | 'added' | 'removed' | 'changed'; a?: string; b?: string };

export function Testimony() {
  const { store, gotell, userId, lang, course } = useApp();
  const [testimony, setTestimony] = useState<TestimonyRow | null>(null);
  const [revisions, setRevisions] = useState<TestimonyRevision[]>([]);
  const [draft, setDraft] = useState('');
  const [analysis, setAnalysis] = useState<ProductionAnalysis | null>(null);
  const [suggestions, setSuggestions] = useState<GoTellSuggestion[]>([]);
  const [titles, setTitles] = useState<Map<string, string>>(new Map());
  const [busy, setBusy] = useState<null | 'check' | 'save' | 'intent'>(null);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [diff, setDiff] = useState<{ revisionId: string; rows: DiffRow[] } | null>(null);
  const [english, setEnglish] = useState('');
  const [proposal, setProposal] = useState<IntentProposal | null>(null);

  // Load (or create) this learner's testimony and its history. The editor itself starts empty.
  useEffect(() => {
    let live = true;
    setTestimony(null); setRevisions([]); setAnalysis(null); setSuggestions([]); setDraft(''); setDiff(null); setProposal(null);
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

  const check = useCallback(async () => {
    if (!testimony || draft.trim() === '') return;
    setBusy('check'); setError(null); setNotice(null);
    try {
      const result = await gotell.submitDraft(testimony.id, draft);
      setAnalysis(result);
      setSuggestions(result.suggestions);
    } catch (e) { fail(e); } finally { setBusy(null); }
  }, [gotell, testimony, draft]);

  const patchSuggestion = (id: string, status: GoTellSuggestion['status']) =>
    setSuggestions((prev) => prev.map((s) => (s.id === id ? { ...s, status } : s)));

  const draftRef = useRef(draft);
  draftRef.current = draft;
  /** Replace the learner's own words with the chosen text — only ever after an explicit accept/edit. */
  const applyToDraft = (original: string, replacement: string) => {
    const d = draftRef.current;
    if (d.includes(original)) setDraft(d.replace(original, replacement));
    else setNotice('That phrase is no longer in your draft, so nothing was changed. You can edit the text yourself.');
  };

  const accept = useCallback(async (s: GoTellSuggestion) => {
    try { await gotell.acceptSuggestion(s.id); patchSuggestion(s.id, 'accepted'); applyToDraft(s.original, s.suggested); } catch (e) { fail(e); }
  }, [gotell]);
  const reject = useCallback(async (s: GoTellSuggestion) => {
    try { await gotell.rejectSuggestion(s.id); patchSuggestion(s.id, 'rejected'); } catch (e) { fail(e); }
  }, [gotell]);
  const edit = useCallback(async (s: GoTellSuggestion, finalText: string) => {
    try { await gotell.editSuggestion(s.id, finalText); patchSuggestion(s.id, 'edited'); applyToDraft(s.original, finalText); } catch (e) { fail(e); }
  }, [gotell]);

  const save = useCallback(async () => {
    if (!testimony || draft.trim() === '') return;
    setBusy('save'); setError(null); setNotice(null);
    try {
      const rev = await gotell.acceptRevision(testimony.id, draft);
      setRevisions((prev) => [rev, ...prev.filter((r) => r.id !== rev.id)].sort((a, b) => b.number - a.number));
      setNotice(`Saved as version ${rev.number}.`);
    } catch (e) { fail(e); } finally { setBusy(null); }
  }, [gotell, testimony, draft]);

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

  const bySentence = useMemo(() => {
    const m = new Map<number, GoTellSuggestion[]>();
    for (const s of suggestions) { const l = m.get(s.sentenceIndex) ?? []; l.push(s); m.set(s.sentenceIndex, l); }
    return [...m.entries()].sort((a, b) => a[0] - b[0]);
  }, [suggestions]);

  const latest = revisions[0];

  return (
    <div className="page testimony">
      <h1>My Testimony</h1>
      <p className="muted">Write in {course.title.split('→')[1]?.trim() ?? 'the language you are learning'}, in your own words. Suggestions are offered, never applied for you.</p>

      {error && <p role="alert" className="error">{error}</p>}

      <label className="field">
        <span className="field-label">Your testimony</span>
        <textarea
          className="editor" lang={lang} rows={8} value={draft} spellCheck={false}
          aria-label="Your testimony"
          placeholder=""
          onChange={(e) => setDraft(e.target.value)}
        />
      </label>

      <div className="actions">
        <button type="button" className="btn-primary" disabled={!testimony || draft.trim() === '' || busy !== null} onClick={() => { void check(); }}>
          {busy === 'check' ? 'Checking…' : 'Check my writing'}
        </button>
        <button type="button" className="btn-quiet" disabled={!testimony || draft.trim() === '' || busy !== null} onClick={() => { void save(); }}>Save this version</button>
      </div>
      {notice && <p role="status" className="small">{notice}</p>}

      <details className="intent">
        <summary>What are you trying to say?</summary>
        <label className="field">
          <span className="muted small">Say it in English. You will get wording built from language you already know, and anything new is labelled.</span>
          <input type="text" value={english} onChange={(e) => setEnglish(e.target.value)} aria-label="What are you trying to say?" />
        </label>
        <button type="button" className="btn-quiet" disabled={busy !== null || english.trim() === ''} onClick={() => { void askIntent(); }}>Help me say it</button>
        {proposal && (
          <div className="proposal" aria-label="Suggested wording">
            <p lang={lang} className="proposal-text">{proposal.proposal}</p>
            {proposal.meaningNote && <p className="sugg-warn" role="note">{proposal.meaningNote}</p>}
            {proposal.newItems.length > 0 && (
              <ul className="small" aria-label="New language in this wording">
                {proposal.newItems.map((n) => <li key={n.itemId}><span lang={lang}>{n.surface || itemSurface(n.itemId)}</span>{n.gloss ? ` (${n.gloss})` : ''} — {n.whyNeeded}</li>)}
              </ul>
            )}
            {proposal.fallbackWithoutNew && (
              <p className="small muted">Without any new language: <span lang={lang}>{proposal.fallbackWithoutNew.text}</span> — {proposal.fallbackWithoutNew.lossNote}</p>
            )}
            <button type="button" className="btn-quiet" onClick={() => setDraft((d) => (d ? `${d}${lang === 'th' ? '' : ' '}${proposal.proposal}` : proposal.proposal))}>Add to my draft</button>
          </div>
        )}
      </details>

      {analysis && (
        <section className="suggestions" aria-label="Suggestions">
          <h2>Suggestions</h2>
          {suggestions.length === 0 ? (
            <p className="muted">Nothing to suggest. That does not guarantee every sentence is correct; read it aloud once more.</p>
          ) : (
            bySentence.map(([index, list]) => (
              <div key={index} className="sugg-group">
                <h3 className="muted small">Sentence {index + 1}</h3>
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

      {latest && <RevisionAudio key={latest.id} revision={latest} />}

      <section className="history" aria-label="Version history">
        <h2>Versions</h2>
        {revisions.length === 0 ? <p className="muted">No saved versions yet.</p> : (
          <ol className="list plain history-list" reversed>
            {revisions.map((r) => (
              <li key={r.id} data-revision-id={r.id}>
                <div className="history-head">
                  <strong>Version {r.number}</strong>
                  <span className="muted small">{formatDate(r.createdAt)} · {r.sentences.length} sentence{r.sentences.length === 1 ? '' : 's'}</span>
                </div>
                <p lang={lang} className="history-text">{r.fullText}</p>
                <div className="actions">
                  <button type="button" className="btn-quiet" onClick={() => setDraft(r.fullText)}>Use as draft</button>
                  {r.number > 1 && <button type="button" className="btn-quiet" onClick={() => { void compare(r); }}>Show changes from version {r.number - 1}</button>}
                </div>
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
              </li>
            ))}
          </ol>
        )}
      </section>
    </div>
  );
}
