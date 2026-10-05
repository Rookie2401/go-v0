/**
 * Stage 0 sound: a reviewed native recording when the line has one; otherwise the device's own computer voice (the
 * browser's speech synthesis, offline, no account, no network) when it has a voice for the language — always labelled as
 * practice and never sent to GoLearn as listening evidence; otherwise nothing, and the page says so.
 * The learner can turn the computer voice off (remembered per device, sandbox-scoped).
 */
import { useCallback, useEffect, useState } from 'react';
import type { AppStore, LanguageCode, Stage0AudioSource, Stage0Audio } from '../../core';
import { stage0Config } from '../../stage0/lang';
import { scopedKey } from '../sandbox';

const KEY = 'stage0:computer-voice';

function readEnabled(): boolean {
  try { return localStorage.getItem(scopedKey(KEY)) !== 'off'; } catch { return true; }
}

function pickVoice(lang: LanguageCode): SpeechSynthesisVoice | undefined {
  if (typeof speechSynthesis === 'undefined') return undefined;
  const voices = speechSynthesis.getVoices();
  for (const tag of stage0Config(lang).voiceLangs) {
    const v = voices.find((x) => x.lang.toLowerCase() === tag.toLowerCase()) ?? voices.find((x) => x.lang.toLowerCase().startsWith(`${tag.toLowerCase()}-`));
    if (v) return v;
  }
  return undefined;
}

export interface Stage0Voice {
  /** A computer voice for this language exists on this device. */
  available: boolean;
  enabled: boolean;
  setEnabled(on: boolean): void;
  voiceName?: string;
  /** What will play for a line with this audio slot. */
  sourceFor(audio?: Stage0Audio): Stage0AudioSource;
  play(text: string, audio?: Stage0Audio, rate?: number): Promise<void>;
}

export function useStage0Voice(lang: LanguageCode, store: AppStore): Stage0Voice {
  const [voice, setVoice] = useState<SpeechSynthesisVoice | undefined>(() => pickVoice(lang));
  const [enabled, setEnabledState] = useState(readEnabled);
  useEffect(() => {
    if (typeof speechSynthesis === 'undefined') return;
    const update = () => setVoice(pickVoice(lang));
    update();
    speechSynthesis.addEventListener?.('voiceschanged', update);
    return () => speechSynthesis.removeEventListener?.('voiceschanged', update);
  }, [lang]);
  const setEnabled = useCallback((on: boolean) => {
    setEnabledState(on);
    try { localStorage.setItem(scopedKey(KEY), on ? 'on' : 'off'); } catch { /* not remembered: fine */ }
  }, []);
  const sourceFor = useCallback((audio?: Stage0Audio): Stage0AudioSource => {
    if (audio?.status === 'recorded' && audio.assetId) return 'native';
    return voice && enabled ? 'computer-voice' : 'none';
  }, [voice, enabled]);
  const play = useCallback(async (text: string, audio?: Stage0Audio, rate = 0.85) => {
    if (audio?.status === 'recorded' && audio.assetId) {
      const url = await store.assets.url(audio.assetId);
      if (url) { await new Audio(url).play().catch(() => undefined); return; }
    }
    if (!voice || !enabled || typeof speechSynthesis === 'undefined') return;
    speechSynthesis.cancel();
    const u = new SpeechSynthesisUtterance(text);
    u.voice = voice;
    u.lang = voice.lang;
    u.rate = rate;
    await new Promise<void>((resolve) => { u.onend = () => resolve(); u.onerror = () => resolve(); speechSynthesis.speak(u); });
  }, [voice, enabled, store]);
  return { available: !!voice, enabled, setEnabled, ...(voice ? { voiceName: voice.name } : {}), sourceFor, play };
}
