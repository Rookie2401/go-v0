// @vitest-environment jsdom
/**
 * Settings structure: clear sections with an in-page nav, a COLLAPSED Advanced disclosure, Content with version history,
 * and Speech (the app's own speech service; no key on this path).
 */
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { AppRoutes, Shell } from '../../src/ui/App';
import { button, byLabel, click, makeHarness, q, qa } from './harness';
import type { Harness, Mounted } from './harness';

let h: Harness;
let mounted: Mounted | undefined;
beforeEach(async () => { h = await makeHarness(); });
afterEach(async () => { await mounted?.unmount(); mounted = undefined; });

const open = async () => { mounted = await h.mount(<Shell><AppRoutes /></Shell>, { router: '/settings' }); return mounted; };
const section = (name: string) => byLabel(mounted!.container, name);
const sections = () => qa(mounted!.container, '[data-settings-section]').map((s) => s.getAttribute('data-settings-section'));

describe('Settings: sections, in-page nav, Advanced collapsed', () => {
  it('has an in-page section nav, and the sections appear in that order', async () => {
    await open();
    const nav = byLabel(mounted!.container, 'Settings sections');
    expect(nav.tagName).toBe('NAV');
    expect(qa(nav, 'button').map((b) => b.textContent)).toEqual(['You', 'Team sharing', 'Reading', 'Backup and recovery', 'Content', 'Speech', 'Vocabulary', 'Advanced']);
    expect(sections()).toEqual(['you', 'team-sharing', 'reading', 'backup', 'content', 'speech', 'vocabulary', 'advanced']);
    // each section has a heading (Advanced's heading holds its disclosure button)
    for (const [id, name] of [['you', 'You'], ['reading', 'Reading'], ['backup', 'Backup and recovery'], ['content', 'Content'], ['speech', 'Speech'], ['vocabulary', 'Vocabulary']]) {
      expect(q(mounted!.container, `[data-settings-section="${id}"] h2`)!.textContent).toBe(name);
    }
  });

  it('the nav moves keyboard focus to the chosen section\'s heading', async () => {
    await open();
    await click(button(byLabel(mounted!.container, 'Settings sections'), 'Content'));
    expect(document.activeElement).toBe(q(mounted!.container, '[data-settings-section="content"] h2')!);
    await click(button(byLabel(mounted!.container, 'Settings sections'), 'Backup and recovery'));
    expect(document.activeElement!.textContent).toBe('Backup and recovery');
    await click(button(byLabel(mounted!.container, 'Settings sections'), 'Advanced'));
    expect(document.activeElement).toBe(button(section('Advanced'), 'Advanced')); // the disclosure button itself
  });

  it('learner, team, reading preferences, preview, backup and speech status are all outside Advanced', async () => {
    await open();
    const adv = section('Advanced');
    const outside = (el: Element | null) => { expect(el).not.toBeNull(); return !adv.contains(el); };
    expect(outside(byLabel(mounted!.container, 'Learner'))).toBe(true);
    expect(outside(byLabel(mounted!.container, 'Team'))).toBe(true);
    expect(outside(byLabel(mounted!.container, 'Highlighting'))).toBe(true);
    expect(outside(byLabel(mounted!.container, 'Preview unreviewed content'))).toBe(true);
    expect(outside(button(section('Backup and recovery'), 'Export my data'))).toBe(true);
    expect(outside(q(mounted!.container, '[data-testid="speech-availability"]'))).toBe(true);
    expect(q(section('Reading'), 'input[type="range"]')).not.toBeNull(); // text size
    expect(qa(section('Reading'), 'button').map((b) => b.textContent)).toEqual(expect.arrayContaining(['off', 'subtle', 'strong', 'auto', 'light', 'dark']));
  });

  it('Advanced is a collapsed disclosure by default, and nothing of it is rendered or requested until it is opened', async () => {
    await open();
    const toggle = button(section('Advanced'), 'Advanced');
    expect(toggle.getAttribute('aria-expanded')).toBe('false');
    const panelOf = () => document.getElementById(toggle.getAttribute('aria-controls')!)!;
    expect(panelOf().hidden).toBe(true);
    // evidence audit, rebuild controls, diagnostics, direct key entry, fixture switch, language support: all inside, none yet
    for (const label of ['Check evidence', 'Rebuild learning state', 'Run pending audio jobs', 'Use this key']) {
      expect(qa(mounted!.container, 'button').some((b) => b.textContent === label)).toBe(false);
    }
    expect(q(mounted!.container, '[aria-label="Azure speech"]')).toBeNull();
    expect(q(mounted!.container, '[aria-label="Language support table"]')).toBeNull();
    expect(q(mounted!.container, '[aria-label="Development fixture audio"]')).toBeNull();
    expect(q(mounted!.container, '[data-testid="job-counts"]')).toBeNull(); // the audio diagnostics are not even loaded while collapsed

    await click(toggle);
    expect(toggle.getAttribute('aria-expanded')).toBe('true');
    const panel = panelOf();
    expect(panel.hidden).toBe(false);
    for (const label of ['Check evidence', 'Rebuild learning state', 'Run pending audio jobs', 'Use this key']) {
      expect(button(panel, label)).toBeTruthy();
    }
    expect(q(panel, '[aria-label="Azure speech"]')).not.toBeNull();
    expect(q(panel, '[aria-label="GoListen diagnostics"]')).not.toBeNull();
    expect(byLabel(panel, 'Development fixture audio')).toBeTruthy();
    expect(q(panel, 'section[aria-label="Language support"]')).not.toBeNull();
    expect(q(panel, 'section[aria-label="Evidence"]')).not.toBeNull();

    await click(toggle);
    expect(toggle.getAttribute('aria-expanded')).toBe('false');
    expect(panelOf().hidden).toBe(true);
  });
});

describe('Settings: the long tables are collapsed, with their counts in the summary', () => {
  const base = { corpusId: 'ci-es', lang: 'es' as const, kind: 'story' as const, sourceId: 's', importedAt: 'x', tags: [], editorialTags: [], prepTargets: [], schemaVersion: 2, generated: false, transformations: [], reviewStatus: 'approved' as const, published: true, unpublishedReasons: [], contentVersion: 1 };
  const form = (surface: string) => ({
    id: `u1|form:es:${surface}`, userId: 'u1', lang: 'es' as const, itemId: `form:es:${surface}`, itemKind: 'form' as const,
    reading: { level: 'encountered' as const, confidence: 0.5, evidence: 0, exposures: 1, estimatedFamiliar: false, unassisted: 1, assisted: 0 },
    listening: { level: 'unseen' as const, confidence: 0, evidence: 0, exposures: 0, estimatedFamiliar: false, unassisted: 0, assisted: 0 },
    writing: { level: 'unseen' as const, confidence: 0, evidence: 0, exposures: 0, estimatedFamiliar: false, unassisted: 0, assisted: 0 },
    speaking: { level: 'unseen' as const, confidence: 0, evidence: 0, exposures: 0, estimatedFamiliar: false, unassisted: 0, assisted: 0 },
    encounterCount: 1, textIds: [],
  });

  it('"Texts on this device (N)" and "Vocabulary table (N words)" are closed disclosures; the importer, preview toggle, learner, reading and backup stay visible', async () => {
    await h.store.texts.bulkPut([1, 2, 3].map((i) => ({ ...base, id: `text:es:t${i}`, title: `Text ${i}` })));
    await h.store.texts.put({ ...base, id: 'text:es:private', kind: 'testimony', corpusId: 'testimony-es', title: 'Private' }); // never counted: private writing is not listed
    await h.store.learnerItems.bulkPut([form('creo'), form('pecado')]);
    await open();

    const texts = button(section('Content'), 'Texts on this device (3)');
    expect(texts.getAttribute('aria-expanded')).toBe('false');
    const textsPanel = document.getElementById(texts.getAttribute('aria-controls')!)!;
    expect(textsPanel.hidden).toBe(true);
    expect(textsPanel.querySelector('table[aria-label="Texts"]')).not.toBeNull(); // the table is INSIDE the collapsed panel

    const vocab = button(q(mounted!.container, 'section[aria-label="Vocabulary"]')!, 'Vocabulary table (2 words)');
    expect(vocab.getAttribute('aria-expanded')).toBe('false');
    const vocabPanel = document.getElementById(vocab.getAttribute('aria-controls')!)!;
    expect(vocabPanel.hidden).toBe(true);
    expect(vocabPanel.querySelector('table.vocab')).not.toBeNull();

    // everything the learner needs day to day is outside any collapsed panel
    const hidden = (el: Element | null) => { expect(el).not.toBeNull(); return !!el!.closest('[hidden]'); };
    expect(hidden(byLabel(mounted!.container, 'Preview unreviewed content'))).toBe(false);
    expect(hidden(byLabel(mounted!.container, 'Learner'))).toBe(false);
    expect(hidden(byLabel(mounted!.container, 'Team'))).toBe(false);
    expect(hidden(byLabel(mounted!.container, 'Highlighting'))).toBe(false);
    expect(hidden(button(section('Backup and recovery'), 'Export my data'))).toBe(false);

    await click(texts);
    expect(texts.getAttribute('aria-expanded')).toBe('true');
    expect(textsPanel.hidden).toBe(false);
    expect(qa(textsPanel, 'tbody tr')).toHaveLength(3);
    await click(vocab);
    expect(vocabPanel.hidden).toBe(false);
  });

  it('an empty device says 0, not nothing', async () => {
    await open();
    expect(button(section('Content'), 'Texts on this device (0)')).toBeTruthy();
    expect(button(q(mounted!.container, 'section[aria-label="Vocabulary"]')!, 'Vocabulary table (0 words)')).toBeTruthy();
  });

  it('the dedicated vocabulary page shows its table open (no disclosure to find first)', async () => {
    await h.store.learnerItems.bulkPut([form('creo')]);
    mounted = await h.mount(<Shell><AppRoutes /></Shell>, { router: '/vocabulary' });
    expect(qa(mounted.container, 'tbody tr.vocab__row')).toHaveLength(1);
    expect(q(mounted.container, '[hidden] table.vocab')).toBeNull();
    expect(qa(mounted.container, 'button').some((b) => /^Vocabulary table/.test(b.textContent ?? ''))).toBe(false);
  });
});

describe('Settings → Content: version history', () => {
  const base = { corpusId: 'ci-es', lang: 'es' as const, kind: 'story' as const, sourceId: 's', importedAt: 'x', tags: [], editorialTags: [], prepTargets: [], schemaVersion: 2, generated: false, transformations: [], reviewStatus: 'approved' as const, published: true, unpublishedReasons: [] };
  const row = (id: string) => q(byLabel(mounted!.container, 'Texts'), `tr[data-text-id="${id}"]`)!;

  it('lists every content version of a text with when it happened and what changed', async () => {
    await h.store.texts.bulkPut([{ ...base, id: 'text:es:revised', title: 'Revised story', contentVersion: 3 }, { ...base, id: 'text:es:plain', title: 'Plain story', contentVersion: 1 }]);
    h.controls.ingest.history.mockImplementation((t) => (t.id === 'text:es:revised' ? [
      { version: 1, at: '2026-03-01T10:00:00.000Z', summary: 'content version 1 (created): 3 sentence(s) [a, b, c]; 12 analysis row(s) written' },
      { version: 2, at: '2026-03-05T10:00:00.000Z', summary: 'content version 1 → 2: added [d], retired [b]; 4 analysis row(s) written' },
      { version: 3, at: '2026-03-09T10:00:00.000Z', summary: 'content version 2 → 3: revived [b]; 0 analysis row(s) written' },
    ] : []));
    await open();
    const history = q(row('text:es:revised'), '[data-testid="version-history"]')!;
    expect(history.querySelector('summary')!.textContent).toBe('Version 3 · 3 entries');
    const items = qa(byLabel(history, 'Version history of Revised story'), 'li');
    expect(items.map((li) => li.getAttribute('data-version'))).toEqual(['1', '2', '3']);
    expect(items[1].textContent).toContain('added [d], retired [b]');
    expect(items[2].textContent).toContain('revived [b]');
    // a text with no recorded history still shows its current version
    expect(q(row('text:es:plain'), '[data-testid="version-current"]')!.textContent).toBe('Version 1');
    expect(h.controls.ingest.history).toHaveBeenCalledWith(expect.objectContaining({ id: 'text:es:revised' }));
  });

  it('falls back to the current version when the importer has no history (or throws)', async () => {
    await h.store.texts.put({ ...base, id: 'text:es:old', title: 'Old story', contentVersion: 2 });
    h.controls.ingest.history.mockImplementation(() => { throw new Error('no records'); });
    await open();
    expect(q(row('text:es:old'), '[data-testid="version-current"]')!.textContent).toBe('Version 2');
  });

  it('says why a text is held back in plain words, with the importer\'s full wording one click away', async () => {
    await h.store.texts.put({
      ...base, id: 'text:es:held', title: 'Held story', contentVersion: 1, reviewStatus: 'unreviewed', published: false,
      unpublishedReasons: ['review status is "unreviewed" — machine-drafted text needs a native-speaker review (set review.status to reviewed)'],
    });
    await open();
    const cell = q(row('text:es:held'), 'td[data-label="Why not"]')!;
    expect(cell.textContent).toContain('awaiting native-speaker review');
    expect(q(cell, 'details.reasons-full')!.textContent).toContain('set review.status to reviewed');
    expect(q(row('text:es:held'), 'td[data-label="Review"]')!.textContent).toContain('not reviewed');
    expect(row('text:es:held').getAttribute('data-published')).toBe('no');
  });
});

describe('Settings → Speech: the app\'s own speech service', () => {
  const MISSING = { available: false, reason: 'missing-credentials' as const, detail: 'Set AZURE_SPEECH_KEY and AZURE_SPEECH_REGION in .env.local and restart the server.' };

  it('unconfigured: shows the service\'s instruction, keeps audio honestly unavailable, and asks for no key here', async () => {
    h.controls.speechProxyStatus.current = MISSING;
    await open();
    const sec = section('Speech');
    const line = q(sec, '[data-testid="speech-service"]')!;
    expect(line.textContent).toContain('Set AZURE_SPEECH_KEY and AZURE_SPEECH_REGION in .env.local and restart the server.');
    expect(line.getAttribute('data-available')).toBe('no');
    expect(q(sec, '[data-testid="speech-availability"]')!.getAttribute('data-available')).toBe('no');
    expect(sec.querySelector('input[type="password"]')).toBeNull(); // the key lives on the server; direct entry is under Advanced
    expect(JSON.stringify({ ...localStorage })).not.toMatch(/AZURE|speech-azure/i); // nothing stored for this path
  });

  it('"Check again" asks the service again (after .env.local was fixed and the server restarted)', async () => {
    h.controls.speechProxyStatus.current = MISSING;
    await open();
    h.controls.speechProxyStatus.current = { available: true };
    await click(button(section('Speech'), 'Check again'));
    expect(h.controls.speech.recheck).toHaveBeenCalledTimes(1);
    expect(q(section('Speech'), '[data-testid="speech-service"]')!.getAttribute('data-available')).toBe('yes');
  });

  it('configured: says the service is connected and that its key lives on the server', async () => {
    h.controls.speechProxyStatus.current = { available: true };
    await open();
    const line = q(section('Speech'), '[data-testid="speech-service"]')!;
    expect(line.getAttribute('data-available')).toBe('yes');
    expect(line.textContent).toContain('never reaches this page');
    expect(qa(line, 'button')).toHaveLength(0);
  });

  it('no service on this deployment: says nothing about one, and the direct key is only under Advanced', async () => {
    await open();
    expect(q(section('Speech'), '[data-testid="speech-service"]')).toBeNull();
    expect(section('Speech').textContent).toContain('under Advanced');
  });

  it('a service that cannot be reached shows its reason instead of a key prompt', async () => {
    h.controls.speechProxyStatus.current = { available: false, reason: 'provider-error', detail: 'the speech proxy answered HTTP 502' };
    await open();
    expect(q(section('Speech'), '[data-testid="speech-service"]')!.textContent).toContain('the speech proxy answered HTTP 502');
  });
});

describe('Settings → Advanced → audio diagnostics: partial generation', () => {
  it('lists which sentences failed and why, and says the ready ones can still be played', async () => {
    await h.store.audioSegments.put({
      id: 'seg:f1', cacheKey: 'ck', lang: 'es', sentenceIds: ['text:es:x/s1'], textId: 'text:es:x', displayText: 'Dios me perdonó.', speechText: 'Dios me perdonó.', speechNormalization: [],
      pronunciationOverridesUsed: [], voiceConfigId: 'v', status: 'failed', sequence: 1, contentVersion: 1,
    });
    await h.store.texts.put({ corpusId: 'ci-es', lang: 'es', kind: 'story', title: 'Partial story', sourceId: 's', importedAt: 'x', id: 'text:es:x', tags: [], editorialTags: [], prepTargets: [], schemaVersion: 2, generated: false, transformations: [], contentVersion: 1, reviewStatus: 'approved', published: true, unpublishedReasons: [] });
    const real = h.listen.diagnostics;
    (h.listen as unknown as { diagnostics: unknown }).diagnostics = async (textId?: string) => ({
      ...(await real()),
      ...(textId ? { failedSentences: [{ sentenceId: 'text:es:x/s1', index: 1, text: 'Dios me perdonó.', segmentId: 'seg:f1', error: 'rate limited (429) after 4 attempts', attempts: 4 }] } : {}),
    });
    await open();
    await click(button(section('Advanced'), 'Advanced'));
    const box = q(mounted!.container, '[data-testid="failed-sentences"]')!;
    expect(box.textContent).toContain('Partial story');
    expect(box.textContent).toContain('Sentence 2');
    expect(box.textContent).toContain('Dios me perdonó.');
    expect(box.textContent).toContain('rate limited (429) after 4 attempts');
    expect(box.textContent).toContain('can still be played');
  });
});
