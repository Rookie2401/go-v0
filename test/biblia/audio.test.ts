import { describe, expect, it, vi } from 'vitest';
import { createBibliaPronouncer } from '../../packages/biblia/src/audio';
import { defaultRegistries } from '../../packages/golisten/src';

describe('Biblia GoListen account speech', () => {
  it('probes Hebrew, Greek, and the disclosed Italian stand-in only after consent, with account auth on the service route', async () => {
    let consent = false;
    const fetch = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      if (url.endsWith('/status')) return new Response(JSON.stringify({ configured: true }), { headers: { 'content-type': 'application/json' } });
      const lang = new URL(url).searchParams.get('lang');
      const voices = lang === 'he' ? ['he-IL-HilaNeural', 'he-IL-AvriNeural']
        : lang === 'el' ? ['el-GR-AthinaNeural', 'el-GR-NestorasNeural']
          : lang === 'it' ? ['it-IT-DiegoNeural', 'it-IT-ElsaNeural'] : [];
      expect((init?.headers as Record<string, string>).Authorization).toBe('Bearer session-token');
      return new Response(JSON.stringify({ voices: voices.map((id) => ({ id })) }), { headers: { 'content-type': 'application/json' } });
    });
    const pronouncer = createBibliaPronouncer({ speech: null, account: async () => ({ serviceUrl: 'https://repo.example', token: 'session-token', learnerId: 'learner-1' }), consent: () => consent, consentOwner: () => 'learner-1', fetch });
    expect((await pronouncer.availability('he')).available).toBe(false);
    expect(fetch).not.toHaveBeenCalled();
    consent = true;
    expect((await pronouncer.availability('he')).available).toBe(true);
    expect((await pronouncer.availability('el')).available).toBe(true);
    expect((await pronouncer.availability('la')).available).toBe(true);
    expect(fetch.mock.calls.some(([url]) => String(url).endsWith('/voices?lang=it'))).toBe(true);
    expect(fetch.mock.calls.every(([url]) => String(url).startsWith('https://repo.example/api/speech/'))).toBe(true);
  });

  it('labels Hebrew and Greek remote voices as Modern and the Latin provider as an Italian stand-in', () => {
    const registry = defaultRegistries();
    expect(registry.find((r) => r.languageId === 'he')?.entries.filter((v) => v.provider === 'remote').every((v) => /Modern Hebrew/.test(v.label))).toBe(true);
    expect(registry.find((r) => r.languageId === 'el')?.entries.filter((v) => v.provider === 'remote').every((v) => /Modern Greek/.test(v.label))).toBe(true);
    expect(registry.find((r) => r.languageId === 'la')?.entries.filter((v) => v.provider === 'remote').every((v) => /Italian stand-in/.test(v.label))).toBe(true);
    expect(registry.find((r) => r.languageId === 'nb')?.entries.filter((v) => v.provider === 'remote').length).toBeGreaterThan(0);
    expect(registry.find((r) => r.languageId === 'nn')?.entries.filter((v) => v.provider === 'remote')).toHaveLength(0);
  });

  it('does not reuse one learner’s local consent with a different signed-in account', async () => {
    const fetch = vi.fn(async () => new Response(JSON.stringify({ configured: true }), { headers: { 'content-type': 'application/json' } }));
    const pronouncer = createBibliaPronouncer({ speech: null, account: async () => ({ serviceUrl: 'https://repo.example', token: 'other-token', learnerId: 'learner-2' }), consent: () => true, consentOwner: () => 'learner-1', fetch });
    expect((await pronouncer.availability('he')).available).toBe(false);
    expect(fetch).not.toHaveBeenCalled();
  });
});
