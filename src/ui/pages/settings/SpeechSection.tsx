/**
 * Settings → Speech: is real speech available, the Azure key + region form (nothing is stored unless the learner
 * ticks "remember on this device"), the voices with their review status and the "I have auditioned this voice"
 * control (only reviewed real speech counts toward listening progress), and the development fixture-audio switch.
 */
import { useCallback, useEffect, useState } from 'react';
import type { ProviderAvailability, VoiceConfig } from '../../../core';
import { useApp } from '../../context';
import { REVIEW_LABEL } from '../../format';
import { setPref, usePref } from '../../prefs';
import { errorText } from './shared';

const REASON_TEXT: Record<string, string> = {
  'no-provider': 'no speech provider is configured',
  'missing-credentials': 'the speech provider has no working key',
  'provider-error': 'the speech provider reported an error',
  offline: 'the speech provider cannot be reached (offline)',
  'development-fixture': 'only the development fixture (placeholder sound) is registered',
};

export function SpeechSection() {
  const { golisten, store, lang, course, speech } = useApp();
  const [availability, setAvailability] = useState<ProviderAvailability | null>(null);
  const [voice, setVoice] = useState<VoiceConfig | null>(null);
  const [voices, setVoices] = useState<VoiceConfig[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [region, setRegion] = useState('');
  const [key, setKey] = useState('');
  const [remember, setRemember] = useState(false);
  const [fixture] = usePref('devFixtureAudio');
  const [tick, setTick] = useState(0);

  useEffect(() => {
    let live = true;
    setVoice(null); setError(null);
    void (async () => {
      const a = await golisten.availability();
      if (!live) return;
      setAvailability(a);
      setVoices((await store.voices.where('lang', lang)).sort((x, y) => x.id.localeCompare(y.id)));
      // Show the voice for this course when one can be resolved (real speech, or the fixture in preview).
      // No provider at all is not an error here: the availability line above already says so.
      try { const v = await golisten.resolveVoice(lang, course.id); if (live) setVoice(v); }
      catch (e) { if (live && !(e instanceof Error && e.name === 'AudioUnavailable')) setError(errorText(e)); }
    })().catch((e: unknown) => { if (live) setError(errorText(e)); });
    return () => { live = false; };
  }, [golisten, store, lang, course.id, tick]);

  const azure = speech.azure();

  const useKey = async () => {
    setError(null); setMessage(null);
    try {
      await speech.configureAzure({ key: key.trim(), region: region.trim(), remember });
      setKey(''); // the key field is cleared as soon as it has been handed over
      setMessage(remember ? 'Azure speech is set up and remembered on this device.' : 'Azure speech is set up for this session only. You will be asked again after a reload.');
      setTick((n) => n + 1);
    } catch (e) { setError(errorText(e)); }
  };

  const setReview = useCallback(async (v: VoiceConfig, status: VoiceConfig['reviewStatus']) => {
    setError(null);
    try { await golisten.setVoiceReview(v.id, status); setTick((n) => n + 1); } catch (e) { setError(errorText(e)); }
  }, [golisten]);

  const reason = availability?.reason ? REASON_TEXT[availability.reason] ?? availability.reason : undefined;

  return (
    <section aria-label="Speech">
      <h2 className="section-head">Speech</h2>
      {error && <p role="alert" className="error">{error}</p>}
      {message && <p role="status" className="note">{message}</p>}
      {!availability ? <p className="muted" role="status">Checking speech…</p> : (
        <p data-testid="speech-availability" data-available={availability.available ? 'yes' : 'no'}>
          {availability.available
            ? 'Real speech is available.'
            : `Real speech is not available: ${reason ?? 'no reason given'}${availability.detail ? ` (${availability.detail})` : ''}. You can still read; audio stays off until a provider is set up.`}
        </p>
      )}

      <form className="settings__new" onSubmit={(e) => { e.preventDefault(); void useKey(); }} aria-label="Azure speech">
        <h3 className="label">Azure speech</h3>
        <p className="card__note">
          Enter your own Azure Speech key and region. The key is used from this device only. It is <strong>not stored</strong> unless you tick the box below;
          without it, it lives in memory until you reload.
          {azure.configured && <> Azure speech is set up{azure.region ? ` (${azure.region})` : ''}{azure.remembered ? ', and remembered on this device' : ''}.</>}
        </p>
        <label className="field"><span className="label">Region</span>
          <input type="text" value={region} onChange={(e) => setRegion(e.target.value)} aria-label="Azure region" placeholder="for example westeurope" autoComplete="off" />
        </label>
        <label className="field"><span className="label">Key</span>
          <input type="password" value={key} onChange={(e) => setKey(e.target.value)} aria-label="Azure key" autoComplete="off" />
        </label>
        <label className="field field--row"><span>Remember on this device</span>
          <input type="checkbox" checked={remember} onChange={(e) => setRemember(e.target.checked)} aria-label="Remember on this device" />
        </label>
        <div className="actions">
          <button type="submit" className="btn btn--small" disabled={!key.trim() || !region.trim()}>Use this key</button>
          {azure.remembered && <button type="button" className="btn btn--small btn--quiet" onClick={() => { speech.forgetAzure(); setMessage('Forgotten, and Azure speech is switched off.'); setTick((n) => n + 1); }}>Forget the remembered key</button>}
        </div>
      </form>

      <h3 className="label">Voices for {course.title}</h3>
      {voice && (
        <dl className="kv" data-testid="voice-card">
          <dt>Provider</dt><dd>{voice.providerId}{!voice.isSpeech && <> <span className="chip chip--wine">fixture audio — not speech</span></>}</dd>
          <dt>Voice</dt><dd>{voice.voiceId}{voice.engine ? ` (${voice.engine})` : ''}</dd>
          <dt>Locale asked for</dt><dd>{voice.requestedLocale}</dd>
          <dt>Locale delivered</dt><dd>{voice.actualLocale}{voice.actualLocale !== voice.requestedLocale && <> <span className="chip">fallback accent</span></>}</dd>
          <dt>Review</dt><dd>{REVIEW_LABEL[voice.reviewStatus] ?? voice.reviewStatus}{voice.qaNote ? ` — ${voice.qaNote}` : ''}</dd>
        </dl>
      )}
      {voices.length === 0 ? <p className="muted">No voice has been used for this language yet.</p> : (
        <div className="table-wrap">
          <table className="datatable voices" aria-label="Voices">
            <thead><tr><th>Voice</th><th>Locale (asked → got)</th><th>Speech</th><th>Review</th><th /></tr></thead>
            <tbody>
              {voices.map((v) => {
                const reviewed = v.reviewStatus === 'reviewed' || v.reviewStatus === 'approved';
                return (
                  <tr key={v.id} data-voice-id={v.id} data-review={v.reviewStatus}>
                    <th scope="row">{v.providerId} / {v.voiceId}</th>
                    <td data-label="Locale">{v.requestedLocale} → {v.actualLocale}</td>
                    <td data-label="Speech">{v.isSpeech ? 'real speech' : 'placeholder sound'}</td>
                    <td data-label="Review">{REVIEW_LABEL[v.reviewStatus] ?? v.reviewStatus}</td>
                    <td>
                      {!v.isSpeech ? <span className="faint">never counted</span>
                        : reviewed
                          ? <button type="button" className="btn btn--small btn--quiet" onClick={() => { void setReview(v, 'unreviewed'); }}>Mark as not auditioned</button>
                          : <button type="button" className="btn btn--small" aria-label={`I have auditioned this voice: ${v.voiceId}`} onClick={() => { void setReview(v, 'reviewed'); }}>I have auditioned this voice</button>}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
      <p className="card__note">Listen to the voice first, then say you have auditioned it. Only reviewed real speech counts toward your listening progress; placeholder sound and unreviewed voices never do.</p>

      <h3 className="label">Development</h3>
      <label className="field field--row">
        <span>Development fixture audio (placeholder sound, not speech)</span>
        <input
          type="checkbox" checked={fixture} aria-label="Development fixture audio"
          onChange={(e) => { setPref('devFixtureAudio', e.target.checked); setMessage(e.target.checked ? 'Fixture audio is registered. It is badged and never counts as progress.' : 'Fixture audio is off (unless preview mode is on).'); setTick((n) => n + 1); }}
        />
      </label>
    </section>
  );
}
