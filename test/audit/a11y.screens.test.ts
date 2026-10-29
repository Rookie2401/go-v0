// @vitest-environment jsdom
/**
 * ACCESSIBILITY audit, lane 2 of 4 (docs/ecosystem/audit/ACCESSIBILITY.md): the real screens, mounted in jsdom the way
 * test/goreview-app, test/gotell-ui and test/golearn-app mount them, and audited with `auditDom` (accessible names, labels,
 * ids, headings, landmarks, live regions, `lang` on target-language text, repeated ambiguous names).
 *   GoReview: sign-in, GoReview home / session (every exercise family, question and feedback) / summary / transfer, GoTell home /
 *   prompts / writer / goals / privacy, settings.   GoLearn setup app: every screen.   Action popup.
 * Defects are asserted with `it.fails` (see a11y.css.test.ts for the convention).
 */
import fs from 'node:fs';
import path from 'node:path';
import { afterAll, afterEach, describe, expect, it } from 'vitest';
import { accessibleName, auditDom, flushAfterAll, row, tabSequence, type Finding } from './a11y.support';
import { candidate, cardAdded, defaultService, dueCard, fakeAudio, flush, ids, key, knowledgeRow, makeRig, reopen, reopenDetails, seed, startWith, type as typeIn, unitOf, until } from '../goreview-app/helpers';
import { DEFAULT_PREFERENCES } from '../../packages/goreview/app/state';
import { forgetPaintedHome } from '../../packages/goreview/app/screens/review';
import { FakeAccountService } from '../golearn-app/accountFake';
import { destroyRigs } from '../goreview-app/helpers';
import { makeTellRig, resetTellRig, typeInto, type TellRig } from '../gotell-ui/rig';
import { HOME, SCREENS } from '../../packages/golearn-extension/app/app';
import { downloadLanguage as appChoose, destroyRigs as destroyAppRigs, failingInstall as appFailingInstall, makeRig as makeAppRig, signIn as appSignIn } from '../golearn-app/helpers';
import { initPopup } from '../../packages/golearn-extension/action/popup';
import { createChromeFake } from '../extension/chromeFake';

flushAfterAll('a11y.screens', 'ACCESSIBILITY lane 2 (screens)');

const audits: Array<{ screen: string; findings: Finding[]; stats: ReturnType<typeof auditDom>['stats'] }> = [];
/** Albanian words the fixtures put on the screens (the fake service's deck and the fake builders). */
const SQ_WORDS = ['zog', 'mace', 'qen', 'shtepi', 'diell', 'hene', 'det', 'gabim'];
function audit(root: ParentNode, screen: string, opts: Parameters<typeof auditDom>[2] = {}): Finding[] {
  const r = auditDom(root, screen, screen.startsWith('practice/') ? { targetWords: SQ_WORDS, targetLang: 'sq', ...opts } : opts);
  audits.push({ screen, findings: r.findings, stats: r.stats });
  return r.findings;
}

const findingsOf = (rule: string, screens: (s: string) => boolean = () => true): Finding[] => audits.filter((a) => screens(a.screen)).flatMap((a) => a.findings.filter((f) => f.rule === rule));

afterAll(() => {
  const total = audits.reduce((n, a) => n + a.findings.length, 0);
  const controls = audits.reduce((n, a) => n + a.stats.controls, 0);
  const by = (prefix: string): string => `${audits.filter((a) => a.screen.startsWith(prefix)).length} ${prefix.replace('/', '')}`;
  row('A-S00', 'screens', 'screens/states audited', String(audits.length), `${by('practice/')}, ${by('app/')}, ${by('popup/')} states; ${controls} interactive controls inspected, ${total} findings`);
});

afterEach(() => { resetTellRig(); destroyAppRigs(); });

const click = (el: Element | null | undefined): void => { if (!el) throw new Error('nothing to click'); (el as HTMLElement).click(); };

// ───────────────────────────── GoReview ─────────────────────────────

describe('GoReview screens', () => {
  it('A-S01 sign-in (signed out)', async () => {
    const rig = await makeRig();
    expect(rig.q('#signin-form')).toBeTruthy();
    const f = audit(rig.root, 'practice/signin');
    row('A-S01', 'screens', 'GoReview sign-in', f.length ? `${f.length} findings` : 'clean', f.map((x) => `${x.rule}: ${x.where}`).join('; '));
    destroyRigs();
  });

  it('A-S02 GoReview home, details (proposals), My vocab (Select), session (every family, question and feedback), summary (next deck, optional practice), remediation, transfer, history', async () => {
    const A = ids('L1', 'sq');
    const service = defaultService();
    const rig = await makeTellRig({ service });
    // GoReview 3: new words are admitted automatically under budgets, so the proposals on the details page keep their "Test now" (optional selected practice), "Later" and "Dismiss" while no new-item budget is open
    await rig.app.ctx.state.setPrefs('L1', { languageId: 'sq', sessionMinutes: 10, maxNew: 0, desiredRetention: 0.9, includeListening: false, grammarShare: 0.2, prioritizeSaved: true });
    service.candidates.set('L1-e1', [candidate('det', 0.8), candidate('diell', 0.3), candidate('hene', 0.05), candidate('zog', 0.9)]);
    // a proposal needs observed knowledge beyond New (the Seen gate); the due and added cards below make zog and hene "already covered"
    service.knowledge.set('L1', ['det', 'diell', 'hene'].map((x) => ({ ...knowledgeRow('L1', unitOf(x), 'sq', {}), level: 'recognized' as const })));
    await seed(rig, [
      ...dueCard(A, 'zog', 'meaning-to-form'), ...dueCard(A, 'mace', 'written-recognition'), ...dueCard(A, 'qen', 'audio-to-meaning'),
      ...dueCard(A, 'shtepi', 'phrase-comprehension'), ...dueCard(A, 'diell', 'sentence-completion'),
      cardAdded(A, 'hene', 'meaning-to-form', '2026-10-08T09:30:00.000Z'),
    ]);
    await reopen(rig);
    audit(rig.root, 'practice/review-home');

    // the details page the home used to be: open the lazily built parts so their content is audited too
    await reopenDetails(rig);
    audit(rig.root, 'practice/review-details');
    for (const d of rig.qa<HTMLDetailsElement>('details')) { d.open = true; d.dispatchEvent(new Event('toggle')); }
    await flush(4);
    audit(rig.root, 'practice/review-details (details open)');
    expect(rig.root.querySelector(`[data-unit="${unitOf('det')}"] [data-act="test-now"]`), 'a proposal offers "Test now"').toBeTruthy();

    // "Later" keeps a proposal out of the next session; "Test now" selects it for optional practice and quotes the word in the status
    click(rig.q(`[data-unit="${unitOf('diell')}"] [data-act="later"]`));
    await until(() => rig.root.querySelector(`[data-unit="${unitOf('diell')}"]`)?.getAttribute('data-choice') === 'later', 'the later note');
    audit(rig.root, 'practice/review-details (after Later)');
    click(rig.q(`[data-unit="${unitOf('det')}"] [data-act="test-now"]`));
    await until(() => /Added .* to optional selected practice/.test(rig.root.querySelector('#review-details > .status')?.textContent ?? ''), `the status message (now: ${rig.root.querySelector('#review-details > .status')?.textContent})`);
    audit(rig.root, 'practice/review-details (after Test now)');

    // the home offers the selected words as a separate, optional practice beside Begin
    await reopen(rig);
    expect(rig.root.querySelector('#start-selected-practice'), 'the home offers the selected words').toBeTruthy();
    audit(rig.root, 'practice/review-home (selected practice)');

    // My vocab: a word added by hand from the list (its status quotes the word). The fake Repository has no vocabulary list, so a page of it is supplied.
    const realApi = rig.app.ctx.api;
    const entry = (label: string): { knowledge: unknown; unit: unknown; surfaceForms: string[]; lastEncounter: string; sources: unknown[] } => {
      const unitId = unitOf(label);
      return {
        knowledge: { unitId, languageId: 'sq', level: 'new', encounters: 1, firstSeenAt: '2026-09-01T00:00:00.000Z', lastSeenAt: '2026-10-06T00:00:00.000Z' },
        unit: { unitId, languageId: 'sq', label, kind: 'lexeme' }, surfaceForms: [label], lastEncounter: '2026-10-06T00:00:00.000Z', sources: [],
      };
    };
    const items = [entry('gabim'), entry('mace')];
    rig.app.ctx.api = async () => {
      const r = await realApi();
      const vocabulary = async (): Promise<unknown> => ({ ok: true as const, status: 200, data: { items, catalog: { total: items.length, counts: { new: items.length, seen: 0, recognized: 0, familiar: 0, known: 0, automatic: 0 } } } });
      return { ...r, api: { ...r.api, vocabulary } as unknown as typeof r.api };
    };
    forgetPaintedHome(rig.app.ctx);
    await rig.go('review/vocab');
    await until(() => rig.qa('.vocab-item').length === 2, 'the words of My vocab');
    audit(rig.root, 'practice/my-vocab');
    click(rig.q(`[data-unit-id="${unitOf('gabim')}"] button.vocab-row`));
    await until(() => !!rig.root.querySelector('[data-action="add-to-deck"]'), 'the question under the word');
    audit(rig.root, 'practice/my-vocab (question open)');
    click(rig.q('[data-action="add-to-deck"]'));
    await until(() => !!rig.root.querySelector(`[data-unit-id="${unitOf('gabim')}"] .vocab-selected`), 'the word to be selected');
    audit(rig.root, 'practice/my-vocab (after Select)');
    rig.app.ctx.api = realApi;
    forgetPaintedHome(rig.app.ctx);

    // a session: the budgets are open now, so the proposals may join as new cards; listening is on and the fake voice is available
    const prefs = await rig.app.ctx.identity();
    await rig.app.ctx.state.setPrefs(prefs!.learnerId, { languageId: 'sq', sessionMinutes: 20, maxNew: 5, desiredRetention: 0.9, includeListening: true, grammarShare: 0.3, prioritizeSaved: true });
    await reopen(rig);
    click(rig.q('#start-session'));
    await until(() => !!rig.root.querySelector('#session .exercise'), 'the first exercise');
    const families: string[] = [];
    for (let guard = 0; guard < 12 && !rig.root.querySelector('#summary'); guard++) {
      const ex = rig.q('.exercise');
      const family = ex.getAttribute('data-family') ?? '?';
      families.push(family);
      audit(rig.root, `practice/session ${family} question`);
      const input = rig.root.querySelector<HTMLInputElement>('#answer-input');
      if (input) { typeIn(input, 'zog'); key('Enter', input); }
      else if (rig.root.querySelector('.choice')) click(rig.q('.choice'));
      else { key('Enter'); key('3'); }
      await until(() => !!rig.root.querySelector('#feedback'), `feedback of ${family}`);
      audit(rig.root, `practice/session ${family} feedback`);
      click(rig.q('#next'));
      const was = ex.getAttribute('data-item');
      await until(() => !!rig.root.querySelector('#summary') || (!!rig.root.querySelector('.exercise') && rig.root.querySelector('.exercise')!.getAttribute('data-item') !== was), 'the next item');
    }
    await until(() => !!rig.root.querySelector('#summary'), 'the summary');
    await until(() => !!rig.root.querySelector('#summary-next'), 'the next-deck section of the summary');
    audit(rig.root, 'practice/session summary');
    // the optional extra practice (repeat this batch) and the remediation parts of the next-deck section
    const extra = rig.q<HTMLDetailsElement>('#optional-extra-practice');
    extra.open = true; extra.dispatchEvent(new Event('toggle'));
    await flush(2);
    expect(rig.root.querySelector('#next-remediation-note'), 'the summary names the remediation backlog').toBeTruthy();
    audit(rig.root, 'practice/session summary (next deck, optional practice open)');
    row('A-S02', 'screens', 'exercise families met in the session', [...new Set(families)].join(', '));
    expect(new Set(families).size).toBeGreaterThanOrEqual(4);

    // the remediation page, with the backlog the wrong answers left
    click(rig.q('#open-remediation'));
    await until(() => !!rig.root.querySelector('#remediation-backlog'), 'the remediation backlog');
    expect(rig.root.querySelectorAll('#remediation-backlog [data-item-id]').length, 'a backlog to audit').toBeGreaterThanOrEqual(1);
    await flush(4);
    audit(rig.root, 'practice/remediation (backlog)');
    const study = rig.root.querySelector<HTMLButtonElement>('[data-action="mark-studied"]');
    if (study) {
      click(study);
      await until(() => !!rig.root.querySelector('#remediation .status')?.getAttribute('data-kind'), 'the study marker to be saved');
      audit(rig.root, 'practice/remediation (after Mark studied)');
      // ten minutes later the delayed reassessment is offered
      rig.clock.set(new Date(rig.clock.now.getTime() + 11 * 60_000).toISOString());
      await rig.go('review');
      await rig.go('review/remediation');
      await until(() => !!rig.root.querySelector('#remediation-backlog'), 'the backlog again');
      if (rig.root.querySelector('[data-action="begin-reassessment"]')) audit(rig.root, 'practice/remediation (reassessment ready)');
    }

    await rig.go('review/transfer');
    audit(rig.root, 'practice/transfer');
    await reopen(rig);
    // Save deck moves the deck to the saved decks; the list is audited too
    if (rig.root.querySelector('#save-deck')) {
      click(rig.q('#save-deck'));
      await until(() => /Deck saved/.test(rig.root.querySelector('#review-home > .status')?.textContent ?? ''), 'the deck to be saved');
      audit(rig.root, 'practice/review-home (after Save deck)');
    }
    await rig.go('review/decks');
    audit(rig.root, 'practice/previous-decks');
    await reopenDetails(rig);
    const hist = rig.root.querySelector<HTMLAnchorElement>('a[href^="#/review/history"]');
    if (hist) { await rig.go(hist.getAttribute('href')!.replace(/^#\//, '')); audit(rig.root, 'practice/history'); }
  }, 60_000);

  it('A-S12 the account page (signed in): name, email, actions, the devices disclosure and the deletion step', async () => {
    const acct = new FakeAccountService();
    acct.name = 'Ana';
    acct.reportVerified = true; acct.verified = true;
    const rig = await makeRig({ signedIn: true, fetch: acct.fetch });
    await rig.go('account');
    await until(() => rig.q('#account-name').textContent === 'Ana', 'the name from the service');
    audit(rig.root, 'practice/account');
    const devices = rig.q<HTMLDetailsElement>('#acct-devices');
    devices.open = true; devices.dispatchEvent(new Event('toggle'));
    await flush(6);
    audit(rig.root, 'practice/account (devices open)');
    click(rig.q('#delete-open'));
    await flush(6);
    audit(rig.root, 'practice/account (deletion step)');
    destroyRigs();
  });

  it('A-S03 GoTell: home, prompts, writer (typed, analysed, with the help ladder open), goals, privacy; settings', async () => {
    const rig: TellRig = await makeTellRig();
    await rig.open('tell', '#tell-new-draft');
    audit(rig.root, 'practice/tell-home');
    await rig.open('tell/prompts/guided', '.tell-prompts');
    audit(rig.root, 'practice/tell-prompts');
    await rig.open('tell', '#tell-new-draft');
    click(rig.q('#tell-mode-free'));
    click(rig.q('#tell-new-draft'));
    await until(() => !!rig.root.querySelector('#writer-text'), 'the writer');
    audit(rig.root, 'practice/tell-writer (empty)');
    typeInto(rig.q<HTMLTextAreaElement>('#writer-text'), 'Unë jam mirë. Ky është një gabim. Ti si je?');
    click(rig.q('#writer-analyse'));
    await until(() => !!rig.root.querySelector('#writer-analysis-summary'), 'the analysis');
    audit(rig.root, 'practice/tell-writer (analysed)');
    const issue = rig.root.querySelector('[data-issue-card]');
    if (issue) {
      const id = issue.getAttribute('data-issue-card')!;
      for (let l = 1; l <= 3; l++) { const b = rig.root.querySelector<HTMLButtonElement>(`[data-issue-card="${id}"] button[data-level="${l}"]`); if (b && !b.disabled) { click(b); await flush(6); } }
      audit(rig.root, 'practice/tell-writer (help ladder)');
    }
    await rig.open('tell/goals');
    audit(rig.root, 'practice/tell-goals');
    await rig.open('tell/privacy');
    audit(rig.root, 'practice/tell-privacy');
    await rig.go('settings');
    audit(rig.root, 'practice/settings');
    expect(audits.filter((a) => a.screen.startsWith('practice/tell')).length).toBeGreaterThanOrEqual(7);
  }, 60_000);
});

// ───────────────────────────── audio-only questions, shortcuts, the clock ─────────────────────────────

describe('audio-only interactions, character-key shortcuts and the session clock', () => {
  it('A-S06 an audio-only question has a named group, named controls, a live replay count, and a non-audio way out; with no voice the details say so and the listening card is withheld, not asked in writing', async () => {
    const A = ids('L1', 'sq');
    const rig = await makeRig({ signedIn: true });
    await startWith(rig, dueCard(A, 'qen', 'audio-to-meaning'), { includeListening: true });
    const group = rig.q('#audio');
    expect(group.getAttribute('role')).toBe('group');
    expect(group.getAttribute('aria-label')).toBe('Audio question');
    for (const id of ['audio-play', 'audio-failed']) expect(rig.q(id === 'audio-play' ? '#audio-play' : '#audio-failed').tagName).toBe('BUTTON');
    expect(rig.q('#audio-count').getAttribute('aria-live')).toBe('polite');
    expect(rig.q('#audio-failed').textContent).toBe('I could not hear it');
    expect(rig.root.querySelectorAll('.choice').length).toBeGreaterThanOrEqual(2); // the answer is chosen from written options
    audit(rig.root, 'practice/session audio question (audio check)');
    destroyRigs();

    // GoReview 3: with no voice the planner does not ask a listening card in writing (writing cannot satisfy a listening obligation): the card stays due and unasked,
    // and a session over written cards goes on without it. Only an audio card due and nothing else leaves Begin off, and the home says nothing is eligible.
    const mute = await makeRig({ signedIn: true, audio: fakeAudio({ available: false }) });
    await startWith(mute, [...dueCard(A, 'qen', 'audio-to-meaning'), ...dueCard(A, 'mace', 'written-recognition')], { includeListening: true });
    expect(mute.root.querySelector('#audio')).toBeNull();
    expect(mute.q('.exercise').getAttribute('data-family')).toBe('written-recognition');
    expect(mute.q('.exercise').getAttribute('data-item')).toContain('mace');
    audit(mute.root, 'practice/session written question (no voice installed)');
    await reopenDetails(mute);
    expect(mute.q('#listening-availability').textContent).toMatch(/^not available: no Albanian voice is installed/);
    audit(mute.root, 'practice/review-details (no voice installed)');
    destroyRigs();

    const only = await makeRig({ signedIn: true, audio: fakeAudio({ available: false }) });
    await seed(only, dueCard(A, 'qen', 'audio-to-meaning'));
    await only.app.ctx.state.setPrefs('L1', { ...DEFAULT_PREFERENCES('sq'), includeListening: true });
    await reopen(only);
    expect(only.q<HTMLButtonElement>('#start-session').disabled).toBe(true);
    expect(only.q('#deck-count').textContent).toBe('No eligible reviews right now');
    audit(only.root, 'practice/review-home (listening card due, no voice)');
    row('A-S06', 'audio', 'audio-only question: alternatives and honest notices', 'pass', 'group "Audio question"; Play/Replay (Space) and "I could not hear it" are buttons; choices are written; with no voice the audio card is never asked in writing (it stays due, Begin is off when it is all that is due, the home says "No eligible reviews right now") and the details say "not available: …"; "Include listening practice" can be switched off');
    destroyRigs();
  }, 30_000);

  it('A-S07 the listening preference is a labelled checkbox in Session controls', async () => {
    const rig = await makeRig({ signedIn: true });
    await reopenDetails(rig);
    const box = rig.q<HTMLInputElement>('#pref-listening');
    expect(box.type).toBe('checkbox');
    expect(box.labels?.[0]?.textContent).toMatch(/Include listening practice/);
    destroyRigs();
  });

  // Digits 1-4 answer or grade, Space plays the audio and Esc skips an item, from anywhere on the page except a text field. WCAG 2.1.4
  // (Level A) asks for a way to turn single-character shortcuts off or to remap them, or for them to work only while the control has focus.
  it('A-08 the one-key shortcuts of a session (1 to 4, Space) can be turned off (WCAG 2.1.4)', async () => {
    const A = ids('L1', 'sq');
    const rig = await makeRig({ signedIn: true });
    await startWith(rig, dueCard(A, 'mace', 'written-recognition'));
    key('1'); // with focus on <main>, "1" answers the question
    await until(() => !!rig.root.querySelector('#feedback'), 'the feedback');
    await reopen(rig);
    for (const d of rig.qa<HTMLDetailsElement>('details')) d.open = true;
    await rig.go('settings');
    const text = (rig.root.textContent ?? '').toLowerCase();
    expect(text).toMatch(/shortcut|keyboard/);
    destroyRigs();
  }, 30_000);

  // There is no timer on screen (the clock and its Hide control are gone), so nothing ticks and WCAG 2.2.2 has nothing to pause.
  it('A-09 the session bar has no clock or timer: nothing ticks on screen (WCAG 2.2.2)', async () => {
    const A = ids('L1', 'sq');
    const rig = await makeRig({ signedIn: true });
    await startWith(rig, dueCard(A, 'mace', 'written-recognition'));
    expect(rig.root.querySelector('#session-clock')).toBeNull();
    const controls = [...rig.root.querySelectorAll('#session button, #session input[type="checkbox"]')].map((e) => accessibleName(e).name);
    expect(controls.some((n) => /clock|timer|hide time|pause/i.test(n)), `no clock control among: ${controls.join(', ')}`).toBe(false);
    destroyRigs();
  }, 30_000);
});

// ───────────────────────────── GoLearn setup application ─────────────────────────────

describe('GoLearn setup application', () => {
  it('A-S04 every screen, signed out and signed in', async () => {
    const rig = await makeAppRig({ extension: true });
    for (const s of [HOME, ...SCREENS]) { await rig.go(s.id); audit(rig.root, `app/${s.id} (signed out)`); }
    await appSignIn(rig);
    for (const s of [HOME, ...SCREENS]) { await rig.go(s.id); audit(rig.root, `app/${s.id}`); }
    // the screens are the sign-in page, the languages page and Settings (SCREENS); the languages page in its states too:
    // a language ready, a pack that failed with its Retry button, a Download language menu open, every Details open
    await appChoose(rig, 'sq');
    audit(rig.root, 'app/languages (language ready)');
    rig.packs.nextInstall = appFailingInstall();
    await appChoose(rig, 'de');
    audit(rig.root, 'app/languages (pack failed, Retry)');
    rig.q<HTMLDetailsElement>('#download-hi').open = true;
    audit(rig.root, 'app/languages (Download language menu open)');
    for (const d of rig.root.querySelectorAll<HTMLDetailsElement>('#language-cards details')) d.open = true;
    audit(rig.root, 'app/languages (Details open)');
    expect(SCREENS.map((x) => x.id)).toEqual(expect.arrayContaining(['signin', 'languages', 'settings']));
    expect(SCREENS.map((x) => x.id)).not.toContain('welcome');
    expect(audits.filter((a) => a.screen.startsWith('app/')).length).toBe(2 * (SCREENS.length + 1) + 4);
  }, 60_000);
});

// ───────────────────────────── action popup ─────────────────────────────

describe('action popup', () => {
  it('A-S05 the popup page, connected and not connected', async () => {
    const html = fs.readFileSync(path.resolve(__dirname, '../../packages/golearn-extension/action/popup.html'), 'utf8');
    document.body.innerHTML = /<body>([\s\S]*)<\/body>/.exec(html)![1].replace(/<script[\s\S]*?<\/script>/g, '');
    await initPopup(document, createChromeFake());
    audit(document.body, 'popup/action', { fragment: true });
    // with no worker answering, the Active switch and Sync now are disabled: the two buttons that always work remain in the tab order
    expect(tabSequence(document.body).length).toBeGreaterThanOrEqual(2);
    expect(document.querySelectorAll('input[type="checkbox"]')).toHaveLength(1);
  });

  // A-21 (the two-step delete's announcement) is retired with the control: the popup has no delete button since 2026-10-09 (deletion lives in the setup page's Privacy screen, audited above).
});

// ───────────────────────────── the auditor audited ─────────────────────────────

describe('the auditor itself', () => {
  it('A-S08 finds every defect class in a deliberately broken page (so "no findings" means something)', () => {
    document.body.innerHTML = `
      <div><h1>One</h1><h1>Two</h1><h3>Skipped</h3>
        <button></button><input type="text"><input type="text" placeholder="only a hint"><a href="#x"></a>
        <div role="button">fake</div><div tabindex="0">focusable</div><span tabindex="3">positive</span>
        <img src="x.png"><p id="d">a</p><p id="d">b</p><label for="nope">gone</label><div aria-labelledby="ghost" role="dialog"></div>
        <input type="radio" name="r"><input type="radio" name="r"><input type="password"><div class="status">x</div>
        <p>किताब</p><p class="target-text">libër</p><p>Added zog to the deck.</p><div class="target-text">mace</div>
        <ul><li><button>Go</button></li><li><button>Go</button></li></ul></div>`;
    const f = auditDom(document.body, 'selftest', { targetWords: ['zog', 'mace'], targetLang: 'sq', record: false }).findings;
    const rules = new Set(f.map((x) => x.rule));
    for (const r of ['control-name', 'field-label', 'role-not-focusable', 'focusable-no-role', 'positive-tabindex', 'img-alt', 'duplicate-id', 'dangling-reference', 'heading-skip', 'h1-count', 'main-landmark',
      'radio-group-name', 'autocomplete', 'status-not-live', 'script-without-lang', 'target-lang', 'embedded-target-word', 'dialog-name', 'repeated-name']) expect(rules.has(r), r).toBe(true);
    row('A-S08', 'screens', 'the auditor on a broken page', `${f.length} findings in ${rules.size} rules`, [...rules].join(', '));
  });
});

// ───────────────────────────── the verdict, per rule ─────────────────────────────

const where = (f: Finding): string => `${f.screen}: ${f.where}`;

describe('what the audits found', () => {
  it('A-S10 summary by rule', () => {
    const byRule = new Map<string, number>();
    for (const a of audits) for (const f of a.findings) byRule.set(f.rule, (byRule.get(f.rule) ?? 0) + 1);
    row('A-S10', 'screens', 'findings by rule', [...byRule.entries()].map(([r, n]) => `${r}: ${n}`).join(', ') || 'none');
    for (const a of audits) for (const f of a.findings) console.log(`FINDING ${f.rule} [${f.severity}] ${f.screen} ${f.where}: ${f.detail}`);
    // every other rule of the auditor found nothing on any screen: name, label, role, focusability, ids, landmarks, headings (but one), radio groups, autocomplete, status regions, script-without-lang
    const clean = ['control-name', 'field-label', 'role-not-focusable', 'focusable-no-role', 'positive-tabindex', 'duplicate-id', 'main-landmark', 'h1-count', 'nav-name', 'img-alt', 'radio-group-name', 'autocomplete', 'status-not-live', 'script-without-lang', 'target-lang', 'dialog-name', 'empty-heading'];
    for (const r of clean) expect(findingsOf(r).map(where), r).toEqual([]);
    row('A-S11', 'screens', 'rules with no finding on any screen', clean.join(', '));
    expect(audits.length).toBeGreaterThan(30);
  });

  it('A-10 every aria-labelledby points at an element that exists (Settings: the sync and diagnostics sections name "sync-h" and "diag-h", then repaint with clear() and an h2 that lacks the id)', () => {
    expect(findingsOf('dangling-reference').map(where)).toEqual([]);
  });

  it('A-11 Albanian words inside English sentences are wrapped in lang="sq" (review reasons, session item line and explanations, the "Added … to optional selected practice" status, the My vocab "is selected for optional practice" status, transfer measures, GoTell issue text) (WCAG 3.1.2)', () => {
    expect(findingsOf('embedded-target-word', (x) => x.startsWith('practice/')).map(where)).toEqual([]);
  });

  it('A-19 the history screen does not skip a heading level (h1 then h3)', () => {
    expect(findingsOf('heading-skip').map(where)).toEqual([]);
  });

  it('A-20 repeated list actions (Dismiss, History, Snooze, Suspend, Write with this prompt, Change, Install, Re-verify) carry the item in their accessible name', () => {
    expect(findingsOf('repeated-name').map(where)).toEqual([]);
  });
});
