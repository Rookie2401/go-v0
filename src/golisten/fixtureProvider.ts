/**
 * FixtureTtsProvider — a deterministic stand-in for a real TTS provider.
 *
 * IT IS NOT SPEECH. For each word-like chunk of the speech text it renders a short, low-amplitude
 * sine burst followed by a gap, so that the WAV is real and decodable, its duration scales with the
 * text, and `validateWav` has something to measure. It never returns `wordMarks`: the bursts carry no
 * linguistic timing, so claiming marks would be fabrication. The UI must badge it ("fixture audio - not speech").
 */
import { hash } from '../core/ids';
import type { LanguageCode } from '../core/model';
import type { ProviderAvailability, ProviderCapabilities, SynthesisRequest, SynthesisResult, TtsProvider, Voice, WordMark } from '../core/contracts/golisten';
import { DEFAULT_SAMPLE_RATE, encodeWav } from './wav';

export const FIXTURE_PROVIDER_ID = 'fixture';
export const FIXTURE_PROVIDER_VERSION = '1';
export const FIXTURE_ENGINE = 'fixture-tone-v1';
export const FIXTURE_DISCLAIMER = 'Fixture audio: sine-tone bursts, not speech. Replace with a real provider before any learner listens.';

const VOICES: Record<LanguageCode, Array<{ id: string; locale: string }>> = {
  // es-HN is deliberately absent: the Honduras course asks for it, so the fallback to es-419 is recorded honestly.
  es: [{ id: 'fixture-es-419', locale: 'es-419' }, { id: 'fixture-es-mx', locale: 'es-MX' }],
  sq: [{ id: 'fixture-sq-al', locale: 'sq-AL' }],
  th: [{ id: 'fixture-th-th', locale: 'th-TH' }],
  hi: [{ id: 'fixture-hi-in', locale: 'hi-IN' }],
  de: [{ id: 'fixture-de-de', locale: 'de-DE' }],
  nb: [{ id: 'fixture-nb-no', locale: 'nb-NO' }],
  nn: [{ id: 'fixture-nn-no', locale: 'nn-NO' }],
  he: [{ id: 'fixture-he-il', locale: 'he-IL' }],
  el: [{ id: 'fixture-el-gr', locale: 'el-GR' }],
  la: [{ id: 'fixture-la', locale: 'la' }],
};

export interface FixtureChunk { text: string; charStart: number; charEnd: number }

/** Word-like chunks of `text` with character offsets (Intl.Segmenter handles Thai; regex fallback). */
export function fixtureChunks(text: string, lang: string): FixtureChunk[] {
  const out: FixtureChunk[] = [];
  try {
    const seg = new Intl.Segmenter(lang, { granularity: 'word' });
    for (const s of seg.segment(text)) {
      if (s.isWordLike) out.push({ text: s.segment, charStart: s.index, charEnd: s.index + s.segment.length });
    }
    return out;
  } catch {
    for (const m of text.matchAll(/[\p{L}\p{M}\p{N}]+/gu)) out.push({ text: m[0], charStart: m.index, charEnd: m.index + m[0].length });
    return out;
  }
}

export interface RenderOptions { sampleRate?: number; seed?: string }
export interface RenderedChunks { bytes: Uint8Array; durationMs: number; sampleRate: number; marks: WordMark[] }

const LEAD_MS = 30;
const TAIL_MS = 150;
const GAP_MS = 70;
const FADE_MS = 8;
const AMPLITUDE = 0.25;

/**
 * Renders one tone burst per chunk. `marks` are the true burst boundaries of the audio that was
 * rendered - exposed so a *test-only* provider can return real marks for the bursts it generated.
 * FixtureTtsProvider itself discards them.
 */
export function renderFixtureChunks(chunks: FixtureChunk[], opts: RenderOptions = {}): RenderedChunks {
  const rate = opts.sampleRate ?? DEFAULT_SAMPLE_RATE;
  const ms = (n: number) => Math.round((n / 1000) * rate);
  const plan: Array<{ chunk: FixtureChunk; startS: number; burstS: number; freq: number }> = [];
  let cursor = ms(LEAD_MS);
  for (const chunk of chunks) {
    const len = [...chunk.text].length;
    const burstS = ms(70 + 28 * Math.min(len, 12));
    const freq = 200 + Number(BigInt('0x' + hash(chunk.text + '|' + (opts.seed ?? ''))) % 240n);
    plan.push({ chunk, startS: cursor, burstS, freq });
    cursor += burstS + ms(GAP_MS);
  }
  const total = cursor + ms(TAIL_MS);
  const samples = new Int16Array(total);
  const fade = Math.max(1, ms(FADE_MS));
  const marks: WordMark[] = [];
  for (const p of plan) {
    for (let i = 0; i < p.burstS; i++) {
      const env = Math.min(1, i / fade, (p.burstS - 1 - i) / fade);
      samples[p.startS + i] = Math.round(Math.sin((2 * Math.PI * p.freq * i) / rate) * AMPLITUDE * env * 32767);
    }
    marks.push({ charStart: p.chunk.charStart, charEnd: p.chunk.charEnd, startMs: (p.startS / rate) * 1000, endMs: ((p.startS + p.burstS) / rate) * 1000 });
  }
  return { bytes: encodeWav({ samples, sampleRate: rate, channels: 1 }), durationMs: (total / rate) * 1000, sampleRate: rate, marks };
}

export class FixtureTtsProvider implements TtsProvider {
  readonly id = FIXTURE_PROVIDER_ID;
  readonly version = FIXTURE_PROVIDER_VERSION;
  /** Sine-tone bursts are NOT speech: assets and voices made by this provider can never earn listening evidence. */
  readonly isSpeech = false;
  readonly isFixture = true;
  readonly disclaimer = FIXTURE_DISCLAIMER;
  /** Every synthesize() call, for tests asserting on idempotency. */
  readonly calls: SynthesisRequest[] = [];

  async availability(): Promise<ProviderAvailability> {
    return { available: true, reason: 'development-fixture', detail: FIXTURE_DISCLAIMER };
  }

  capabilities(): ProviderCapabilities {
    return { ssml: false, wordBoundaries: false, phonemeOverrides: false, streaming: false, maxChars: 5000, outputFormats: ['audio/wav'] };
  }

  async listVoices(lang: LanguageCode): Promise<Voice[]> {
    return (VOICES[lang] ?? []).map((v) => ({ id: v.id, name: `Fixture tone (not speech) ${v.locale}`, lang, locale: v.locale, gender: 'neutral' as const }));
  }

  async synthesize(req: SynthesisRequest): Promise<SynthesisResult> {
    this.calls.push(req);
    const voice = (VOICES[req.lang] ?? []).find((v) => v.id === req.voiceId);
    if (!voice) throw new Error(`fixture provider: unknown voice ${req.voiceId} for ${req.lang}`);
    if (req.format !== 'audio/wav') throw new Error(`fixture provider only emits audio/wav, not ${req.format}`);
    if (req.text.length > this.capabilities().maxChars) throw new Error('fixture provider: text too long');
    const chunks = fixtureChunks(req.text, req.lang);
    if (chunks.length === 0) throw new Error('fixture provider: no speakable text');
    const r = renderFixtureChunks(chunks, { seed: req.voiceId });
    // Deliberately NO wordMarks: sine bursts are not speech.
    return { bytes: r.bytes, mime: 'audio/wav', sampleRate: r.sampleRate, channels: 1, durationMs: r.durationMs, engine: FIXTURE_ENGINE, actualLocale: voice.locale };
  }
}
