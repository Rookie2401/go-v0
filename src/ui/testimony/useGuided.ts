/**
 * useGuided - the brain behind the testimony editor's guided help (docs/GOTELL-GUIDED.md, Package C).
 *
 * It owns the learner's word index (rebuilt on mount and after "Save this version"), the caret, the current hint, an
 * English-in-parentheses request that is waiting for its word, and the bookkeeping that records which words were typed
 * with a hint showing (`assist.guided`) and which were supplied from a parenthetical (`assist.supplied`).
 *
 * Rules that never bend: a hint is drawn behind the text and never inserted; it appears only once at least one letter of
 * a word is typed; no hint while an input method is composing. The parenthetical lookup works with guided help on or off.
 */
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { GoTell, LanguageAdapter, LanguageCode, TestimonyDraft } from '../../core';
import { createReverseSource } from '../../dict/reverse';
import {
  EMPTY_ASSIST, addRange, applySupplied, buildWordIndex, editBetween, findParenthetical, pendingSupplied, predict, shiftAssist,
} from '../../gotell/predict';
import type { Parenthetical, Prediction, SuppliedWord, TextAssist, WordIndex } from '../../gotell/predict';
import { useApp } from '../context';
import { usePref } from '../prefs';
import type { DraftApi } from './draft';
import type { GhostView } from './GhostEditor';

/** State shared between the draft's save path (which runs outside React) and the hook. */
export interface GuidedBridge {
  /** The assist that describes the text in the editor right now. */
  assist: TextAssist;
  /** The assist that came with the last stored draft, and the text it belongs to. */
  seed: { text: string; assist: TextAssist } | null;
  /** A non-empty assist has been stored: keep sending it, even if it is now empty, so the stored one is cleared. */
  sent: boolean;
}

export const newBridge = (): GuidedBridge => ({ assist: EMPTY_ASSIST, seed: null, sent: false });

const hasAssist = (a: TextAssist) => a.supplied.length > 0 || a.guided.length > 0;

type SaveOpts = Parameters<GoTell['saveDraft']>[3];

/** The draft API the controller saves through: the same GoTell, with the editor's assist riding along (only when there is one). */
export function guidedDraftApi(gotell: DraftApi, bridge: { current: GuidedBridge }): DraftApi {
  const save = gotell.saveDraft;
  return {
    getDraft: async (userId, lang) => {
      const draft: TestimonyDraft | undefined = await gotell.getDraft(userId, lang);
      bridge.current.seed = draft ? { text: draft.text, assist: draft.assist ?? EMPTY_ASSIST } : null;
      if (draft?.assist && hasAssist(draft.assist)) bridge.current.sent = true;
      return draft;
    },
    saveDraft: ((userId: string, lang: LanguageCode, text: string, opts?: SaveOpts) => {
      const assist = bridge.current.assist;
      if (hasAssist(assist) || bridge.current.sent) {
        bridge.current.sent = hasAssist(assist);
        return save.call(gotell, userId, lang, text, { ...opts, assist });
      }
      return save.call(gotell, userId, lang, text, opts);
    }) as GoTell['saveDraft'],
  };
}

export interface GuidedOptions {
  /** The text in the editor (the draft controller's text). */
  text: string;
  /** Write the text (the draft controller's `setText` plus a re-render). */
  setText(text: string): void;
  /** False until the draft has loaded. */
  editable: boolean;
  userId: string;
  lang: LanguageCode;
  bridge: { current: GuidedBridge };
}

export interface Guided {
  assist: TextAssist;
  ghost: GhostView | null;
  selection: { offset: number; id: number } | null;
  guidedOn: boolean;
  setGuidedOn(on: boolean): void;
  onChange(next: { text: string; assist: TextAssist; caret: number }): void;
  onCaret(offset: number): void;
  onComposition(active: boolean): void;
  /** Words supplied from a parenthetical that are still in the text and have not yet gone into a saved version. */
  suppliedForSave(): SuppliedWord[];
  /** Those words went into a saved version. */
  markReported(words: SuppliedWord[]): void;
  /** Rebuild the word index (after "Save this version": the new version is now read text). */
  rebuildIndex(): void;
}

interface Pending { paren: Parenthetical; raw: string; target: SuppliedWord }
interface Tracking { start: number; end: number; surface: string }

const BOUNDARY = /[^\p{L}\p{M}\p{N}'’-]/u;
const LETTER = /[\p{L}\p{M}\p{N}]/u;

const clampAssist = (a: TextAssist, length: number): TextAssist => {
  const ok = (r: { start: number; end: number }) => Number.isInteger(r.start) && Number.isInteger(r.end) && r.start >= 0 && r.end > r.start && r.end <= length;
  return { supplied: a.supplied.filter(ok), guided: a.guided.filter(ok) };
};

export function useGuided(opts: GuidedOptions): Guided {
  const { text, setText, editable, userId, lang, bridge } = opts;
  const { store, golearn, adapters } = useApp();
  const [guidedOn, setGuidedOn] = usePref('guidedHelp');

  const adapter = useMemo<LanguageAdapter | null>(() => { try { return adapters.get(lang); } catch { return null; } }, [adapters, lang]);
  // The reverse index sits beside the dictionary shards, under Vite's base (the same `assetBase` rule as bootstrap's lexicon).
  const reverse = useMemo(() => {
    const assetBase = ((import.meta.env?.BASE_URL as string | undefined) ?? '/').replace(/\/+$/, '');
    try { return createReverseSource(lang, { base: `${assetBase}/dict` }); } catch { return null; }
  }, [lang]);

  // --- the assist that describes `text` ---------------------------------------------------------------------------
  const [held, setHeld] = useState<{ text: string; assist: TextAssist }>({ text, assist: EMPTY_ASSIST });
  if (held.text !== text) {
    const seed = bridge.current.seed;
    const next = seed && seed.text === text ? clampAssist(seed.assist, text.length) : shiftAssist(held.assist, editBetween(held.text, text));
    setHeld({ text, assist: next });
  }
  const assist = held.text === text ? held.assist : EMPTY_ASSIST;
  bridge.current.assist = assist;

  // --- caret, composition, pending request ------------------------------------------------------------------------
  const [caret, setCaret] = useState(0);
  const [composing, setComposing] = useState(false);
  const composingRef = useRef(false);
  const [pending, setPendingState] = useState<Pending | null>(null);
  const pendingRef = useRef<Pending | null>(null);
  const setPending = (p: Pending | null) => { pendingRef.current = p; setPendingState(p); };
  const [selection, setSelection] = useState<{ offset: number; id: number } | null>(null);
  const selectionId = useRef(0);
  const track = useRef<Tracking | null>(null);
  const supplied = useRef<SuppliedWord[]>([]);
  const lookupId = useRef(0);
  const latest = useRef({ text, caret: 0, guidedOn });
  latest.current.text = text;
  latest.current.guidedOn = guidedOn;

  // --- the word index ---------------------------------------------------------------------------------------------
  const [index, setIndex] = useState<WordIndex | null>(null);
  const indexReady = useRef<Promise<WordIndex | null>>(Promise.resolve(null));
  const [indexVersion, setIndexVersion] = useState(0);
  useEffect(() => {
    if (!adapter) { setIndex(null); indexReady.current = Promise.resolve(null); return; }
    let live = true;
    const built: Promise<WordIndex | null> = buildWordIndex({ store, golearn, adapter }, userId, lang).catch(() => null);
    indexReady.current = built;
    void built.then((ix) => { if (live) setIndex(ix); });
    return () => { live = false; };
  }, [store, golearn, adapter, userId, lang, indexVersion]);

  // Another learner or language: nothing pending, nothing remembered.
  useEffect(() => {
    lookupId.current++;
    pendingRef.current = null; setPendingState(null);
    track.current = null;
    supplied.current = [];
    setCaret(0);
    return () => { lookupId.current++; };
  }, [userId, lang]);

  // --- the hint -----------------------------------------------------------------------------------------------------
  const predictAt = useCallback((full: string, at: number): Prediction | null => {
    if (!index || !adapter) return null;
    if (full.length > at && LETTER.test(full[at])) return null; // the caret is inside a word
    return predict(index, adapter, full.slice(0, at))[0] ?? null;
  }, [index, adapter]);

  const ghost = useMemo<GhostView | null>(() => {
    if (!adapter || composing || !editable) return null;
    const at = Math.min(caret, text.length);
    if (pending && at >= pending.paren.end && text.slice(pending.paren.start, pending.paren.end) === pending.raw) {
      const { paren, target } = pending;
      const spaced = lang !== 'th';
      let completion: string;
      if (at === paren.end && text[paren.end] !== ' ') completion = (spaced ? ' ' : '') + target.surface;
      else {
        const st = pendingSupplied(text, paren, at, target, adapter);
        if (st.broken || st.complete) return null;
        completion = target.surface.slice(st.typed.length);
      }
      return completion ? { completion, style: target.known ? 'known' : 'new' } : null;
    }
    if (!guidedOn) return null;
    const p = predictAt(text, at);
    return p ? { completion: p.completion, style: 'known' } : null;
  }, [adapter, composing, editable, caret, text, pending, lang, guidedOn, predictAt]);

  // --- English in parentheses -------------------------------------------------------------------------------------
  const lookup = useCallback((full: string, at: number) => {
    if (!adapter || !reverse || composingRef.current) return;
    const paren = findParenthetical(full.slice(0, at));
    if (!paren) return;
    const raw = full.slice(paren.start, paren.end);
    const current = pendingRef.current;
    if (current && current.paren.start === paren.start && current.raw === raw) return;
    const id = ++lookupId.current;
    void (async () => {
      let hits: Array<{ lemma: string }> = [];
      try { hits = await reverse.lookupEnglish(paren.english); } catch { return; }
      if (hits.length === 0) return;
      const ix = await indexReady.current;
      if (id !== lookupId.current) return;
      const now = latest.current;
      if (now.text.slice(paren.start, paren.end) !== raw || now.caret < paren.end) return;
      const norm = (s: string) => adapter.normalize(s);
      const known = ix ? hits.find((h) => ix.words.has(norm(h.lemma))) : undefined;
      const hit = known ?? hits[0];
      const target: SuppliedWord = {
        english: paren.english, surface: hit.lemma, itemId: `form:${lang}:${norm(hit.lemma)}`, known: !!known,
      };
      setPending({ paren, raw, target });
    })();
  }, [adapter, reverse, lang]);

  const norm = useCallback((s: string) => (adapter ? adapter.normalize(s) : s.normalize('NFC').toLowerCase()), [adapter]);

  const commit = useCallback((nextText: string, nextAssist: TextAssist, at: number) => {
    latest.current.text = nextText;
    latest.current.caret = at;
    bridge.current.assist = nextAssist;
    setHeld({ text: nextText, assist: nextAssist });
    setCaret(at);
    setText(nextText);
  }, [bridge, setText]);

  const onChange = useCallback((next: { text: string; assist: TextAssist; caret: number }) => {
    const old = latest.current.text;
    let { assist: nextAssist } = next;
    const nextText = next.text;
    const at = next.caret;
    const edit = editBetween(old, nextText);

    if (composingRef.current) {
      // an input method is composing: keep the text, do no bookkeeping, predict nothing
      track.current = null;
      commit(nextText, nextAssist, at);
      return;
    }

    // Where is the parenthetical now?
    let pend = pendingRef.current;
    if (pend) {
      const { paren } = pend;
      const editEnd = edit.start + edit.removed;
      let moved: Parenthetical | null = paren;
      if (edit.start >= paren.end) moved = paren;
      else if (editEnd <= paren.start) { const d = edit.inserted - edit.removed; moved = { ...paren, start: paren.start + d, end: paren.end + d }; }
      else moved = null;
      if (moved && nextText.slice(moved.start, moved.end) === pend.raw) pend = { ...pend, paren: moved };
      else pend = null;
    }

    let finalText = nextText;
    let finalCaret = at;
    let applied = false;
    if (pend && at >= pend.paren.end) {
      const st = pendingSupplied(nextText, pend.paren, at, pend.target, adapter ?? undefined);
      if (st.complete) {
        const done = applySupplied(nextText, nextAssist, pend.paren, pend.target.surface);
        finalText = done.text; nextAssist = done.assist; finalCaret = done.caret;
        if (!supplied.current.some((w) => w.itemId === pend!.target.itemId)) supplied.current = [...supplied.current, pend.target];
        pend = null;
        applied = true;
        track.current = null;
      }
    }

    // Which words were typed with a hint showing?
    const supplying = !!pend && at >= pend.paren.end;
    if (!applied && !supplying && adapter) {
      const tr = track.current;
      const single = edit.removed === 0 && edit.inserted === 1;
      let handled = false;
      if (tr && single && edit.start === tr.end && lang !== 'th' && BOUNDARY.test(nextText[edit.start])) {
        // the word was finished by a boundary: was it the word the hint showed?
        if (norm(old.slice(tr.start, tr.end)) === norm(tr.surface)) nextAssist = { ...nextAssist, guided: addRange(nextAssist.guided, { start: tr.start, end: tr.end }) };
        track.current = null;
        handled = true;
      }
      if (!handled) {
        const p = latest.current.guidedOn ? predictAt(nextText, at) : null;
        if (p) track.current = { start: at - p.typed.length, end: at, surface: p.surface };
        else if (tr && single && edit.start === tr.end && at === tr.end + 1 && norm(nextText.slice(tr.start, at)) === norm(tr.surface)) {
          if (lang === 'th') {
            // no spaces in Thai: the word is done when it equals the hinted word
            nextAssist = { ...nextAssist, guided: addRange(nextAssist.guided, { start: tr.start, end: at }) };
            track.current = null;
          } else track.current = { ...tr, end: at };
        } else track.current = null;
      }
    } else if (!supplying) track.current = null;

    if (pend !== pendingRef.current) setPending(pend);
    commit(finalText, nextAssist, finalCaret);
    if (applied) setSelection({ offset: finalCaret, id: ++selectionId.current });
    if (!applied) lookup(finalText, finalCaret);
  }, [adapter, commit, lang, lookup, norm, predictAt]);

  const onCaret = useCallback((offset: number) => {
    latest.current.caret = offset;
    setCaret(offset);
    if (!composingRef.current) lookup(latest.current.text, offset);
  }, [lookup]);

  const onComposition = useCallback((active: boolean) => {
    composingRef.current = active;
    setComposing(active);
    if (active) track.current = null;
  }, []);

  const suppliedForSave = useCallback((): SuppliedWord[] => {
    const t = latest.current.text;
    const a = bridge.current.assist;
    return supplied.current.filter((w) => a.supplied.some((r) => norm(t.slice(r.start, r.end)) === norm(w.surface)));
  }, [bridge, norm]);

  const markReported = useCallback((words: SuppliedWord[]) => {
    const done = new Set(words.map((w) => w.itemId));
    supplied.current = supplied.current.filter((w) => !done.has(w.itemId));
  }, []);

  const rebuildIndex = useCallback(() => setIndexVersion((v) => v + 1), []);

  return {
    assist, ghost, selection, guidedOn, setGuidedOn, onChange, onCaret, onComposition,
    suppliedForSave, markReported, rebuildIndex,
  };
}
