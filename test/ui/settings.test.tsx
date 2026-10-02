// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { LanguageAdapter, LearnerItemState, VoiceConfig } from '../../src/core';
import { AppRoutes, Shell } from '../../src/ui/App';
import { button, byLabel, check, choose, click, makeHarness, pickFiles, q, qa, type as typeInto } from './harness';
import type { Harness, Mounted } from './harness';

let h: Harness;
let mounted: Mounted | undefined;
beforeEach(async () => { h = await makeHarness(); });
afterEach(async () => { await mounted?.unmount(); mounted = undefined; vi.restoreAllMocks(); });

const app = () => <Shell><AppRoutes /></Shell>;
const open = async () => { mounted = await h.mount(app(), { router: '/settings' }); return mounted; };
const section = (name: string) => byLabel(mounted!.container, name);
const json = (o: unknown, name: string) => new File([JSON.stringify(o)], name, { type: 'application/json' });
/** Advanced is collapsed by default (and mounts its content on first open): open it. */
const openAdvanced = async () => { await click(button(section('Advanced'), 'Advanced')); };

describe('Settings → Content', () => {
  it('points to Team Texts for adding texts, and has no importer of its own', async () => {
    await open();
    const content = section('Content');
    expect(content.textContent).toContain('To add texts for your team, use Team Texts on the Home page.');
    expect(qa(mounted!.container, 'input[aria-label="Choose text files to import"]')).toHaveLength(0);
    expect(qa(mounted!.container, 'input[aria-label="Choose a text file with the text of a book"]')).toHaveLength(0);
    expect(content.textContent).not.toContain('Add a book from a text file');
    expect(byLabel(mounted!.container, 'Preview unreviewed content')).not.toBeNull(); // what it keeps
  });

  it('lists every text with its review status, publication state, reason, and who reviewed it', async () => {
    const base = { corpusId: 'ci-es', lang: 'es' as const, kind: 'story' as const, sourceId: 's', importedAt: 'x', tags: [], editorialTags: [], prepTargets: [], schemaVersion: 2, generated: false, contentVersion: 1 };
    await h.store.texts.bulkPut([
      { ...base, id: 'text:es:ok', title: 'Reviewed one', reviewStatus: 'reviewed', published: true, unpublishedReasons: [], transformations: [{ at: '2026-03-01T00:00:00.000Z', tool: 'review', description: 'Reviewed by Ana on 2026-03-01: native speaker.' }] },
      { ...base, id: 'text:es:wait', title: 'Waiting one', reviewStatus: 'unreviewed', published: false, unpublishedReasons: ['Awaiting native-speaker review.'], transformations: [] },
      { ...base, id: 'text:de:hallo', lang: 'de', corpusId: 'ci-de', title: 'Hallo', reviewStatus: 'in-review', published: false, unpublishedReasons: ['Review in progress.'], transformations: [] },
      { ...base, id: 'text:es:private', kind: 'testimony', title: 'Private testimony', corpusId: 'testimony-es', reviewStatus: 'approved', published: true, unpublishedReasons: [], transformations: [] },
    ]);
    await open();
    const table = byLabel(mounted!.container, 'Texts');
    const tr = (id: string) => q(table, `tr[data-text-id="${id}"]`)!;
    expect(tr('text:es:ok').textContent).toContain('reviewed');
    expect(tr('text:es:ok').textContent).toContain('Reviewed by Ana on 2026-03-01: native speaker.');
    expect(tr('text:es:ok').getAttribute('data-published')).toBe('yes');
    expect(tr('text:es:wait').textContent).toContain('Awaiting native-speaker review.');
    expect(tr('text:de:hallo').textContent).toContain('in review');
    expect(tr('text:de:hallo').textContent).toContain('German');
    expect(q(table, 'tr[data-text-id="text:es:private"]')).toBeNull(); // a learner's private writing is never listed
  });

  it('reports built-in texts that were rejected at startup', async () => {
    h.services.startup = { bundledReport: [{ id: 'es-story', action: 'rejected', issues: [{ path: 'review', code: 'x', message: 'review block missing', hint: 'Add review.', severity: 'error' }] }], warnings: ['1 built-in text(s) were rejected by the importer, so none were imported.'] };
    await open();
    const box = q(mounted!.container, '[data-testid="startup-rejected"]')!;
    expect(box.textContent).toContain('built-in texts were not imported at startup');
    expect(box.textContent).toContain('review block missing');
  });
});

describe('Settings → Speech', () => {
  const azureVoice: VoiceConfig = { id: 'es-HN:azure:v1', lang: 'es', providerId: 'azure-speech', voiceId: 'es-MX-DaliaNeural', requestedLocale: 'es-HN', actualLocale: 'es-MX', approved: false, reviewStatus: 'unreviewed', isSpeech: true };
  const fixtureVoice: VoiceConfig = { id: 'es-HN:fixture:default', lang: 'es', providerId: 'fixture', voiceId: 'fixture-voice', requestedLocale: 'es-HN', actualLocale: 'es-419', approved: false, reviewStatus: 'unreviewed', isSpeech: false };

  it('says plainly whether real speech is available, and why not', async () => {
    await open();
    const a = q(section('Speech'), '[data-testid="speech-availability"]')!;
    expect(a.getAttribute('data-available')).toBe('no');
    expect(a.textContent).toContain('Real speech is not available: only the development fixture (placeholder sound) is registered');
    await mounted!.unmount();

    h = await makeHarness({ listen: { providerId: 'azure', approved: true } });
    await open();
    expect(q(section('Speech'), '[data-testid="speech-availability"]')!.textContent).toBe('Real speech is available.');
  });

  it('the Azure form hands the key over once, clears the field, and stores nothing unless "remember" is ticked', async () => {
    await open();
    await openAdvanced();
    const useKey = () => button(section('Azure speech'), 'Use this key');
    expect(useKey().disabled).toBe(true); // needs both a key and a region
    await typeInto(byLabel<HTMLInputElement>(mounted!.container, 'Azure region'), 'westeurope');
    await typeInto(byLabel<HTMLInputElement>(mounted!.container, 'Azure key'), 'k-123-secret');
    expect(byLabel<HTMLInputElement>(mounted!.container, 'Azure key').type).toBe('password');
    expect(byLabel<HTMLInputElement>(mounted!.container, 'Remember on this device').checked).toBe(false);
    await click(useKey());
    expect(h.controls.speech.configureAzure).toHaveBeenCalledWith({ key: 'k-123-secret', region: 'westeurope', remember: false });
    expect(byLabel<HTMLInputElement>(mounted!.container, 'Azure key').value).toBe(''); // the key does not linger in the page
    expect(mounted!.container.textContent).toContain('for this session only');
    expect(JSON.stringify({ ...localStorage })).not.toContain('k-123-secret'); // the UI itself stores nothing

    await typeInto(byLabel<HTMLInputElement>(mounted!.container, 'Azure key'), 'k-456');
    await check(byLabel<HTMLInputElement>(mounted!.container, 'Remember on this device'));
    await click(useKey());
    expect(h.controls.speech.configureAzure).toHaveBeenLastCalledWith({ key: 'k-456', region: 'westeurope', remember: true });
    expect(mounted!.container.textContent).toContain('remembered on this device');
    await click(button(mounted!.container, 'Forget the remembered key'));
    expect(h.controls.speech.forgetAzure).toHaveBeenCalled();
  });

  it('lists voices with their review status; "I have auditioned this voice" marks a real voice reviewed; placeholder sound can never be', async () => {
    await h.store.voices.bulkPut([azureVoice, fixtureVoice]);
    await open();
    const table = byLabel(mounted!.container, 'Voices');
    const az = q(table, 'tr[data-voice-id="es-HN:azure:v1"]')!;
    const fx = q(table, 'tr[data-voice-id="es-HN:fixture:default"]')!;
    expect(az.textContent).toContain('real speech');
    expect(az.textContent).toContain('not reviewed');
    expect(fx.textContent).toContain('placeholder sound');
    expect(fx.textContent).toContain('never counted');
    expect(qa(fx, 'button')).toHaveLength(0); // no way to "audition" a tone

    await click(button(az, /I have auditioned this voice/));
    expect(h.listen.setVoiceReview).toHaveBeenCalledWith('es-HN:azure:v1', 'reviewed');
    expect(q(byLabel(mounted!.container, 'Voices'), 'tr[data-voice-id="es-HN:azure:v1"]')!.getAttribute('data-review')).toBe('reviewed');
    await click(button(byLabel(mounted!.container, 'Voices'), 'Mark as not auditioned'));
    expect(h.listen.setVoiceReview).toHaveBeenLastCalledWith('es-HN:azure:v1', 'unreviewed');
  });

  it('the development fixture-audio switch is a stored preference, off by default', async () => {
    await open();
    await openAdvanced();
    const box = byLabel<HTMLInputElement>(mounted!.container, 'Development fixture audio');
    expect(box.checked).toBe(false);
    await check(box);
    expect(JSON.parse(localStorage.getItem('go-v0:prefs')!).devFixtureAudio).toBe(true);
  });
});

describe('Settings → Advanced → Language support', () => {
  const adapter = (lang: 'es' | 'th', support: Partial<LanguageAdapter['support']>) => ({
    lang, name: lang, support: { tokenization: 'dependable', sentenceSegmentation: 'dependable', lemmatization: 'seed-only', morphology: 'limited', phraseDetection: 'limited', productionChecks: 'limited', limitations: [], ...support },
  }) as unknown as LanguageAdapter;

  it('shows what each adapter can honestly do, with its limitations', async () => {
    h.services.adapters = {
      get: () => { throw new Error('unused'); },
      all: () => [
        adapter('es', { limitations: ['The dictionary covers the seed corpus only.'] }),
        adapter('th', { tokenization: 'limited', productionChecks: 'none', limitations: ['Sentence breaks need a newline between sentences.'] }),
      ],
    };
    await open();
    await openAdvanced();
    const table = byLabel(mounted!.container, 'Language support table');
    const es = q(table, 'tr[data-lang="es"]')!;
    expect(es.querySelector('th')!.textContent).toBe('Spanish (your team)');
    expect(es.textContent).toContain('seed words only');
    expect(es.textContent).toContain('dependable');
    const th = q(table, 'tr[data-lang="th"]')!;
    expect(th.querySelector('td[data-label="Writing checks"]')!.textContent).toBe('not supported');
    expect(th.querySelector('td[data-label="Words"]')!.textContent).toBe('limited');
    const limits = section('Language support').textContent!;
    expect(limits).toContain('The dictionary covers the seed corpus only.');
    expect(limits).toContain('Sentence breaks need a newline between sentences.');
  });
});

describe('Settings → Backup and recovery', () => {
  let downloads: Array<{ name: string; href: string }>;
  beforeEach(() => {
    downloads = [];
    vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(function click(this: HTMLAnchorElement) { downloads.push({ name: this.download, href: this.href }); });
  });

  it('exports this learner as a downloaded file, optionally with recordings', async () => {
    await open();
    await click(button(section('Backup and recovery'), 'Export my data'));
    expect(h.controls.backup.exportLearner).toHaveBeenCalledWith('u1', { includeRecordings: false });
    expect(downloads).toHaveLength(1);
    expect(downloads[0].name).toMatch(/^go-backup-u1-\d{4}-\d{2}-\d{2}\.json$/);
    const body = JSON.parse(decodeURIComponent(downloads[0].href.split(',').slice(1).join(',')));
    expect(body).toMatchObject({ format: 'go-backup', userId: 'u1' });
    expect(section('Backup and recovery').textContent).toContain('it contains your writing');

    await check(byLabel<HTMLInputElement>(mounted!.container, 'Include my recordings'));
    await click(button(section('Backup and recovery'), 'Export my data'));
    expect(h.controls.backup.exportLearner).toHaveBeenLastCalledWith('u1', { includeRecordings: true });
  });

  it('restores from a valid file (merge by default), rebuilds progress, and says what happened', async () => {
    await open();
    const input = byLabel<HTMLInputElement>(mounted!.container, 'Choose a backup file');
    const file = { format: 'go-backup', version: 1, userId: 'u1' };
    await pickFiles(input, [json(file, 'mine.json')]);
    const valid = q(mounted!.container, '[data-testid="backup-valid"]')!;
    expect(valid.textContent).toContain('mine.json is a valid backup: 3 history events, 1 saved versions');
    expect(valid.textContent).toContain('choose your team first'); // settings are not part of a backup
    expect(byLabel<HTMLSelectElement>(mounted!.container, 'Restore mode').value).toBe('merge');
    await click(button(valid, 'Restore'));
    expect(h.controls.backup.restore).toHaveBeenCalledWith(file, { mode: 'merge' });
    expect(h.learn.rebuild).toHaveBeenCalledWith('u1'); // derived progress is rebuilt from the restored history
    const done = q(mounted!.container, '[data-testid="restore-done"]')!;
    expect(done.textContent).toContain('Restored.');
    expect(done.textContent).toContain('rebuilt from the restored history');
    expect(done.textContent).toContain('3 history events added');
  });

  it('shows warnings but still allows the restore', async () => {
    h.controls.backup.check.mockImplementation(() => ({ ok: true, errors: [], warnings: ['1 recording(s) have no audio in this file.'], summary: '2 history events' }));
    await open();
    await pickFiles(byLabel<HTMLInputElement>(mounted!.container, 'Choose a backup file'), [json({ format: 'go-backup' }, 'w.json')]);
    expect(byLabel(mounted!.container, 'Warnings').textContent).toContain('1 recording(s) have no audio in this file.');
    expect(button(q(mounted!.container, '[data-testid="backup-valid"]')!, 'Restore').disabled).toBe(false);
  });

  it('rejects a corrupt or foreign file with its errors, and offers no restore', async () => {
    await open();
    await pickFiles(byLabel<HTMLInputElement>(mounted!.container, 'Choose a backup file'), [json({ hello: 'world' }, 'other.json')]);
    const bad = q(mounted!.container, '[data-testid="backup-invalid"]')!;
    expect(bad.textContent).toContain('other.json cannot be restored');
    expect(bad.textContent).toContain('This is not a Go backup file.');
    expect(qa(section('Backup and recovery'), 'button').some((b) => b.textContent === 'Restore')).toBe(false);
    expect(h.controls.backup.restore).not.toHaveBeenCalled();

    await pickFiles(byLabel<HTMLInputElement>(mounted!.container, 'Choose a backup file'), [new File(['{ nope'], 'broken.json')]);
    expect(q(mounted!.container, '[data-testid="backup-invalid"]')!.textContent).toContain('not a readable backup file');
  });

  it('"replace" discards this learner\'s data first, so it needs an explicit confirmation', async () => {
    await open();
    await pickFiles(byLabel<HTMLInputElement>(mounted!.container, 'Choose a backup file'), [json({ format: 'go-backup' }, 'mine.json')]);
    await choose(byLabel<HTMLSelectElement>(mounted!.container, 'Restore mode'), 'replace');
    const restore = () => button(q(mounted!.container, '[data-testid="backup-valid"]')!, 'Restore');
    expect(restore().disabled).toBe(true);
    await check(byLabel<HTMLInputElement>(mounted!.container, 'Confirm replace'));
    expect(restore().disabled).toBe(false);
    await click(restore());
    expect(h.controls.backup.restore).toHaveBeenCalledWith({ format: 'go-backup' }, { mode: 'replace' });
  });

  it('shows the restore error when GoTell/backup refuses', async () => {
    h.controls.backup.restore.mockRejectedValueOnce(new Error('This backup belongs to another learner.'));
    await open();
    await pickFiles(byLabel<HTMLInputElement>(mounted!.container, 'Choose a backup file'), [json({ format: 'go-backup' }, 'mine.json')]);
    await click(button(q(mounted!.container, '[data-testid="backup-valid"]')!, 'Restore'));
    expect(section('Backup and recovery').querySelector('[role="alert"]')!.textContent).toBe('This backup belongs to another learner.');
    expect(h.learn.rebuild).not.toHaveBeenCalled();
  });
});

describe('Settings → Advanced → Evidence', () => {
  it('runs the audit, groups the excluded events by reason, and never offers to delete them', async () => {
    await open();
    await openAdvanced();
    await click(button(section('Evidence'), 'Check evidence'));
    expect(h.learn.auditEvidence).toHaveBeenCalledWith('u1');
    const box = q(mounted!.container, '[data-testid="evidence-audit"]')!;
    expect(box.textContent).toContain('Rules evidence@2');
    expect(box.textContent).toContain('12 events in your history; 3 do not count');
    expect(byLabel(box, 'Excluded events by reason').textContent).toContain('2 from placeholder (non-speech) audio');
    expect(byLabel(box, 'Excluded events by reason').textContent).toContain('1 from a voice nobody has auditioned');
    expect(qa(byLabel(box, 'Excluded events'), 'tbody tr')).toHaveLength(3);
    expect(section('Evidence').textContent).toContain('Nothing is ever deleted from your history');
    expect(qa(section('Evidence'), 'button').some((b) => /delete|remove/i.test(b.textContent ?? ''))).toBe(false);
  });

  it('says so when nothing is excluded, and rebuilds on request', async () => {
    h.learn.auditEvidence.mockImplementation(async (userId: string) => ({ userId, policyVersion: 'evidence@2', totalEvents: 4, excluded: [], rebuilt: false }));
    await open();
    await openAdvanced();
    await click(button(section('Evidence'), 'Check evidence'));
    expect(q(mounted!.container, '[data-testid="evidence-audit"]')!.textContent).toContain('none are excluded');
    await click(button(section('Evidence'), 'Rebuild learning state'));
    expect(h.learn.rebuild).toHaveBeenCalledWith('u1');
    expect(section('Evidence').textContent).toContain('Learning state rebuilt from your history.');
  });
});

describe('Settings → Vocabulary honesty', () => {
  const dim = (level: LearnerItemState['reading']['level'], estimatedFamiliar = false) => ({ level, confidence: 0.5, evidence: 0, exposures: 5, estimatedFamiliar, unassisted: 5, assisted: 0 });
  const item = (surface: string, estimated: boolean): LearnerItemState => ({
    id: `u1|form:es:${surface}`, userId: 'u1', lang: 'es', itemId: `form:es:${surface}`, itemKind: 'form', reading: dim('encountered', estimated),
    listening: dim('unseen'), writing: dim('unseen'), speaking: dim('unseen'), encounterCount: 5, textIds: [],
  });

  it('labels an estimate as an estimate (never as known), and explains any word on request', async () => {
    await h.store.learnerItems.bulkPut([item('creo', true), item('pecado', false)]);
    await open();
    const rows = qa(mounted!.container, 'table.vocab:not(.diag) tbody tr.vocab__row');
    const creo = rows.find((r) => r.querySelector('th')!.textContent === 'creo')!;
    const pecado = rows.find((r) => r.querySelector('th')!.textContent === 'pecado')!;
    expect(creo.textContent).toContain('likely familiar (estimate)');
    expect(pecado.textContent).not.toContain('likely familiar');
    await click(button(mounted!.container, 'Why creo?'));
    expect(h.learn.explainItem).toHaveBeenCalledWith('u1', 'form:es:creo');
    expect(q(mounted!.container, '[data-testid="vocab-why"]')!.textContent).toContain('Seen 3 times in 1 text');
  });
});
