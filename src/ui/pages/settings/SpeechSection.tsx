/**
 * Settings → Speech: is real speech available (and why not), the app's own speech service status, the voices with their
 * review status and the "I have auditioned this voice" control (only reviewed real speech counts toward listening
 * progress).
 *
 * The things only a developer or a no-server deployment needs live under Settings → Advanced (see
 * `AdvancedSpeechControls`): entering your own Azure key directly, and the development fixture-audio switch.
 *
 * No key is ever stored or bundled for the app's own speech service: it reads AZURE_SPEECH_KEY / AZURE_SPEECH_REGION
 * on the server. This screen only shows what that service reports.
 */
import { useCallback, useEffect, useState } from 'react';
import type { ProviderAvailability, VoiceConfig } from '../../../core';
import { useApp } from '../../context';
import { REVIEW_LABEL } from '../../format';
import { setPref, usePref, usePreview } from '../../prefs';
import { errorText } from './shared';

const REASON_TEXT: Record<string, string> = {
  'no-provider': 'no speech provider is configured',
  'missing-credentials': 'the speech provider has no working key',
  'provider-error': 'the speech provider reported an error',
  offline: 'the speech provider cannot be reached (offline)',
  'development-fixture': 'only the development fixture (placeholder sound) is registered',
};

/** The instruction shown when the app's speech service has no key and the service gave none of its own. */
export const SPEECH_SETUP_HINT = 'Set AZURE_SPEECH_KEY and AZURE_SPEECH_REGION in .env.local and restart the server.';

export function SpeechSection({ refreshKey }: { refreshKey?: unknown }) {
  const { golisten, store, lang, course, speech } = useApp();
  const [availability, setAvailability] = useState<ProviderAvailability | null>(null);
  const [service, setService] = useState<ProviderAvailability | undefined | null>(null); // null = still checking
  const [voice, setVoice] = useState<VoiceConfig | null>(null);
  const [voices, setVoices] = useState<VoiceConfig[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [tick, setTick] = useState(0);
  const [checking, setChecking] = useState(false);
  // Entering or leaving preview mode changes which providers are usable (the fixture), so availability is read again.
  const preview = usePreview();
  const checkAgain = async () => {
    setChecking(true); setError(null);
    try { await speech.recheck?.(); setTick((n) => n + 1); } catch (e) { setError(errorText(e)); } finally { setChecking(false); }
  };

  useEffect(() => {
    let live = true;
    setVoice(null); setError(null);
    void (async () => {
      const [a, s] = await Promise.all([
        golisten.availability(),
        speech.proxy ? speech.proxy().catch(() => undefined) : Promise.resolve(undefined),
      ]);
      if (!live) return;
      setAvailability(a);
      setService(s);
      setVoices((await store.voices.where('lang', lang)).sort((x, y) => x.id.localeCompare(y.id)));
      // Show the voice for this course when one can be resolved (real speech, or the fixture in preview).
      // No provider at all is not an error here: the availability line above already says so.
      try { const v = await golisten.resolveVoice(lang, course.id); if (live) setVoice(v); }
      catch (e) { if (live && !(e instanceof Error && e.name === 'AudioUnavailable')) setError(errorText(e)); }
    })().catch((e: unknown) => { if (live) setError(errorText(e)); });
    return () => { live = false; };
  }, [golisten, store, lang, course.id, speech, tick, refreshKey, preview]);

  const setReview = useCallback(async (v: VoiceConfig, status: VoiceConfig['reviewStatus']) => {
    setError(null);
    try { await golisten.setVoiceReview(v.id, status); setTick((n) => n + 1); } catch (e) { setError(errorText(e)); }
  }, [golisten]);

  // Three states, never blurred: real speech (only when GoListen says `realSpeech`), placeholder playback in preview with real
  // speech unavailable, and nothing. "Available" alone means "something can play", which may be the fixture.
  const state: 'real' | 'placeholder' | 'none' | undefined = !availability ? undefined
    : availability.realSpeech === true ? 'real'
      : availability.available ? 'placeholder' : 'none';
  const why = (reasonKey: string | undefined, detail: string | undefined) => `${reasonKey ? REASON_TEXT[reasonKey] ?? reasonKey : 'no reason given'}${detail ? ` (${detail})` : ''}`;

  return (
    <section aria-label="Speech" id="settings-speech" data-settings-section="speech">
      <h2 className="section-head" tabIndex={-1}>Speech</h2>
      {error && <p role="alert" className="error">{error}</p>}
      {!availability ? <p className="muted" role="status">Checking speech…</p> : (
        <p data-testid="speech-availability" data-state={state} data-available={state === 'real' ? 'yes' : 'no'}>
          {state === 'real' && 'Real speech is available.'}
          {state === 'placeholder' && `Placeholder sound is available in preview mode. It is not speech and never counts toward your listening progress. Real speech is not available: ${why(availability.realSpeechReason ?? 'no-provider', availability.realSpeechDetail)}. You can still read.`}
          {state === 'none' && `Real speech is not available: ${why(availability.reason, availability.detail)}. You can still read; audio stays off until a provider is set up.`}
        </p>
      )}
      {service && (
        <p
          className={service.available ? 'note' : 'note note--warn'} data-testid="speech-service"
          data-available={service.available ? 'yes' : 'no'} data-reason={service.reason ?? ''}
        >
          <strong>This app&rsquo;s speech service:</strong>{' '}
          {service.available
            ? 'connected. Its key lives on the server and never reaches this page.'
            : service.reason === 'missing-credentials'
              ? (service.detail ?? SPEECH_SETUP_HINT)
              : `${service.detail ?? REASON_TEXT[service.reason ?? ''] ?? service.reason ?? 'not available'}.`}
          {!service.available && speech.recheck && (
            <>{' '}<button type="button" className="btn btn--small btn--quiet" disabled={checking} onClick={() => { void checkAgain(); }}>{checking ? 'Checking…' : 'Check again'}</button></>
          )}
        </p>
      )}

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
      <p className="card__note">Listen to the voice first, then say you have auditioned it. Only human recordings that a named reviewer approved count as listening evidence. Synthetic speech is practice only, and placeholder sound never counts.</p>
      <p className="card__note">Entering your own Azure key directly, and the development fixture-audio switch, are under Advanced below.</p>
    </section>
  );
}

/**
 * Advanced → Speech controls: the direct Azure key form (nothing is stored unless the learner ticks "remember on this
 * device") and the development fixture-audio switch (placeholder sound, never evidence).
 */
export function AdvancedSpeechControls({ onChanged }: { onChanged?: () => void }) {
  const { speech } = useApp();
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [region, setRegion] = useState('');
  const [key, setKey] = useState('');
  const [remember, setRemember] = useState(false);
  const [fixture] = usePref('devFixtureAudio');
  const [direct] = usePref('azureDirectKey');
  const [, setTick] = useState(0);
  const azure = speech.azure();
  const changed = () => { setTick((n) => n + 1); onChanged?.(); };

  const useKey = async () => {
    setError(null); setMessage(null);
    try {
      await speech.configureAzure({ key: key.trim(), region: region.trim(), remember });
      setKey(''); // the key field is cleared as soon as it has been handed over
      setMessage(remember ? 'Azure speech is set up and remembered on this device.' : 'Azure speech is set up for this session only. You will be asked again after a reload.');
      changed();
    } catch (e) { setError(errorText(e)); }
  };

  return (
    <div className="advanced-speech">
      {error && <p role="alert" className="error">{error}</p>}
      {message && <p role="status" className="note">{message}</p>}

      <h4 className="label">Azure speech (direct key)</h4>
      <label className="field field--row">
        <span>Use my own Azure key in this browser</span>
        <input
          type="checkbox" checked={direct} aria-label="Use my own Azure key in this browser"
          onChange={(e) => {
            setPref('azureDirectKey', e.target.checked);
            if (!e.target.checked) { speech.forgetAzure(); setMessage('Direct Azure keys are off. Any key stored on this device was forgotten and Azure speech is switched off.'); }
            else setMessage(null);
            changed();
          }}
        />
      </label>
      {!direct && (
        <p className="card__note" data-testid="azure-direct-off">
          Off. The app never reads or uses an Azure key from this browser, and makes no request to Azure from this page.
          {azure.remembered && <> A key is still stored on this device from earlier and is not used.{' '}
            <button type="button" className="btn btn--small btn--quiet" onClick={() => { speech.forgetAzure(); setMessage('Forgotten, and Azure speech is switched off.'); changed(); }}>Forget the stored key</button></>}
        </p>
      )}
      {direct && <form className="settings__new" onSubmit={(e) => { e.preventDefault(); void useKey(); }} aria-label="Azure speech">
        <p className="card__note">
          For a deployment without a server. Normally the app&rsquo;s own speech service (see Speech above) does this and no key is typed here.
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
          {azure.remembered && <button type="button" className="btn btn--small btn--quiet" onClick={() => { speech.forgetAzure(); setMessage('Forgotten, and Azure speech is switched off.'); changed(); }}>Forget the remembered key</button>}
        </div>
      </form>}

      <h4 className="label">Development</h4>
      <label className="field field--row">
        <span>Development fixture audio (placeholder sound, not speech)</span>
        <input
          type="checkbox" checked={fixture} aria-label="Development fixture audio"
          onChange={(e) => { setPref('devFixtureAudio', e.target.checked); setMessage(e.target.checked ? 'Fixture audio is registered. It is badged and never counts as progress.' : 'Fixture audio is off (unless preview mode is on).'); changed(); }}
        />
      </label>
    </div>
  );
}
