/**
 * Whether listening (GoListen) is switched on. The UI reads the flag from the app services, never the constant, so
 * tests can render either state; an app wired without `features` falls back to the product default.
 *
 * Also: practice listening in the reader (`useDevicePractice`). The device's own computer voice (the browser's speech
 * synthesis: offline, no account, no network) can say a sentence, or each sentence in turn, as PRACTICE. It is a different
 * thing from GoListen: it touches no store, writes no event and no listening encounter, reads no manifest, and is never
 * evidence (docs/GOLISTEN.md; src/golearn/eligibility.ts: synthetic speech never counts). The voice is found the way Stage 0
 * finds it (src/ui/stage0/audio.ts), with the course's own `preferredLocales` tried first.
 */
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { FEATURES } from '../../core';
import type { Features, LanguageCode } from '../../core';
import { stage0Config } from '../../stage0/lang';
import { useApp } from '../context';

export function useListenEnabled(): boolean {
  const { features } = useApp() as ReturnType<typeof useApp> & { features?: Features };
  return features?.listen ?? FEATURES.listen;
}

/** The one sentence the reader and the tests both quote: what a learner is told about the device voice. */
export const PRACTICE_LABEL = 'Computer voice, practice only: not counted as listening.';
/** The two speeds: normal and slow. */
export const PRACTICE_RATES = { normal: 1.0, slow: 0.8 } as const;

const norm = (tag: string) => tag.replace(/_/g, '-').toLowerCase();

/** The tags to look for, most wanted first: the course's preferred locales (its own language only), then Stage 0's. */
export function practiceVoiceTags(lang: LanguageCode, course?: { lang: LanguageCode; preferredLocales: string[] }): string[] {
  const own = course && course.lang === lang ? course.preferredLocales : [];
  const stage0 = stage0Config(lang)?.voiceLangs ?? [];
  const seen = new Set<string>();
  return [...own, ...stage0].filter((t) => { const k = norm(t); if (seen.has(k)) return false; seen.add(k); return true; });
}

/** The first voice matching a tag exactly, else by language prefix ("es-MX" for "es"), tag by tag. */
export function pickDeviceVoice(voices: readonly SpeechSynthesisVoice[], tags: readonly string[]): SpeechSynthesisVoice | undefined {
  for (const tag of tags) {
    const t = norm(tag);
    const v = voices.find((x) => norm(x.lang) === t) ?? voices.find((x) => norm(x.lang).startsWith(`${t}-`));
    if (v) return v;
  }
  return undefined;
}

export interface PracticeItem { id: string; text: string }

export interface DevicePractice {
  /** A computer voice for this language exists on this device. */
  available: boolean;
  voiceName?: string;
  /** The sentence being said now. */
  current: string | null;
  /** A read-along (every sentence in turn) is running. */
  along: boolean;
  slow: boolean;
  setSlow(on: boolean): void;
  /** Say one sentence. */
  playOne(item: PracticeItem): void;
  /** Say `items` in turn, from the first. */
  playAlong(items: readonly PracticeItem[]): void;
  stop(): void;
}

/** A verse number the text carries inline ("[17:1]") is a label, not a word to say. */
export function speakable(text: string): string {
  return text.replace(/\[\s*\d+(?::\d+)?[a-z]?(?:\s*[-–,]\s*\d+)*\s*\]/gu, ' ').replace(/[ \t]{2,}/g, ' ').trim();
}

export function useDevicePractice(lang: LanguageCode): DevicePractice {
  const { course } = useApp();
  const tags = useMemo(() => practiceVoiceTags(lang, course), [lang, course]);
  const find = useCallback((): SpeechSynthesisVoice | undefined => {
    if (typeof speechSynthesis === 'undefined') return undefined;
    try { return pickDeviceVoice(speechSynthesis.getVoices(), tags); } catch { return undefined; }
  }, [tags]);
  const [voice, setVoice] = useState<SpeechSynthesisVoice | undefined>(find);
  const [current, setCurrent] = useState<string | null>(null);
  const [along, setAlong] = useState(false);
  const [slow, setSlow] = useState(false);
  const run = useRef(0); // each play bumps it; an older run stops itself when it sees it is not the latest
  const slowRef = useRef(slow);
  slowRef.current = slow;

  useEffect(() => {
    if (typeof speechSynthesis === 'undefined') { setVoice(undefined); return; }
    const update = () => setVoice(find());
    update();
    speechSynthesis.addEventListener?.('voiceschanged', update);
    return () => speechSynthesis.removeEventListener?.('voiceschanged', update);
  }, [find]);

  const say = useCallback((text: string, v: SpeechSynthesisVoice): Promise<void> => new Promise<void>((resolve) => {
    const u = new SpeechSynthesisUtterance(speakable(text));
    u.voice = v;
    u.lang = v.lang;
    u.rate = slowRef.current ? PRACTICE_RATES.slow : PRACTICE_RATES.normal;
    u.onend = () => resolve();
    u.onerror = () => resolve();
    speechSynthesis.speak(u);
  }), []);

  const stop = useCallback(() => {
    run.current += 1;
    try { if (typeof speechSynthesis !== 'undefined') speechSynthesis.cancel(); } catch { /* nothing to stop */ }
    setCurrent(null);
    setAlong(false);
  }, []);

  const play = useCallback((items: readonly PracticeItem[], isAlong: boolean) => {
    if (!voice || typeof speechSynthesis === 'undefined' || items.length === 0) return;
    run.current += 1;
    const mine = run.current;
    try { speechSynthesis.cancel(); } catch { /* nothing to cancel */ }
    setAlong(isAlong);
    void (async () => {
      for (const item of items) {
        if (run.current !== mine) return;
        setCurrent(item.id);
        await say(item.text, voice);
      }
      if (run.current === mine) { setCurrent(null); setAlong(false); }
    })();
  }, [voice, say]);

  const playOne = useCallback((item: PracticeItem) => play([item], false), [play]);
  const playAlong = useCallback((items: readonly PracticeItem[]) => play(items, true), [play]);

  // Leaving the text (or the page) stops the voice.
  useEffect(() => () => { run.current += 1; try { if (typeof speechSynthesis !== 'undefined') speechSynthesis.cancel(); } catch { /* gone */ } }, []);

  return { available: !!voice, ...(voice ? { voiceName: voice.name } : {}), current, along, slow, setSlow, playOne, playAlong, stop };
}
