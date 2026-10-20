// @vitest-environment jsdom
/**
 * ACCESSIBILITY audit, lane 2 of 4 (docs/ecosystem/audit/ACCESSIBILITY.md): the real screens, mounted in jsdom the way
 * test/gopractice, test/gotell-ui and test/golearn-app mount them, and audited with `auditDom` (accessible names, labels,
 * ids, headings, landmarks, live regions, `lang` on target-language text, repeated ambiguous names).
 *   GoPractice: sign-in, GoReview home / session (every exercise family, question and feedback) / summary / transfer, GoTell home /
 *   prompts / writer / goals / privacy, settings.   GoLearn setup app: every screen.   Action popup.
 * Defects are asserted with `it.fails` (see a11y.css.test.ts for the convention).
 */
import fs from 'node:fs';
import path from 'node:path';
import { afterAll, afterEach, describe, expect, it } from 'vitest';
import { accessibleName, auditDom, flushAfterAll, row, tabSequence, type Finding } from './a11y.support';
import { candidate, cardAdded, defaultService, dueCard, fakeAudio, flush, ids, key, makeRig, reopen, reopenDetails, seed, startWith, type as typeIn, until } from '../gopractice/helpers';
import { destroyRigs } from '../gopractice/helpers';
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

// ───────────────────────────── GoPractice ─────────────────────────────

describe('GoPractice screens', () => {
  it('A-S01 sign-in (signed out)', async () => {
    const rig = await makeRig();
    expect(rig.q('#signin-form')).toBeTruthy();
    const f = audit(rig.root, 'practice/signin');
    row('A-S01', 'screens', 'GoPractice sign-in', f.length ? `${f.length} findings` : 'clean', f.map((x) => `${x.rule}: ${x.where}`).join('; '));
    destroyRigs();
  });

  it('A-S02 GoReview home, session (every family, question and feedback), summary, transfer, history', async () => {
    const A = ids('L1', 'sq');
    const service = defaultService();
    const rig = await makeTellRig({ service });
    // the proposals arrive after the first paint and no card is admitted automatically, so they keep their "Test now" and "Dismiss" buttons to be audited
    await rig.app.ctx.state.setPrefs('L1', { languageId: 'sq', sessionMinutes: 10, maxNew: 0, desiredRetention: 0.9, includeListening: false, grammarShare: 0.2, prioritizeSaved: true });
    service.candidates.set('L1-e1', [candidate('det', 0.8), candidate('diell', 0.3), candidate('hene', 0.05), candidate('zog', 0.9)]);
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

    // a status message that quotes a target-language word inside an English sentence
    click(rig.q('[data-act="test-now"]'));
    await until(() => /Added .* to your deck/.test(rig.root.querySelector('#review-details > .status')?.textContent ?? ''), `the status message (now: ${rig.root.querySelector('#review-details > .status')?.textContent})`);
    audit(rig.root, 'practice/review-details (after Test now)');

    // a session
    const prefs = await rig.app.ctx.identity();
    await rig.app.ctx.state.setPrefs(prefs!.learnerId, { languageId: 'sq', sessionMinutes: 20, maxNew: 5, desiredRetention: 0.9, includeListening: true, grammarShare: 0.3, prioritizeSaved: true });
    await reopen(rig);
    click(rig.q('#start-session'));
    await until(() => !!rig.root.querySelector('#session .exercise'), 'the first exercise');
    const families: string[] = [];
    for (let guard = 0; guard < 10 && !rig.root.querySelector('#summary'); guard++) {
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
    audit(rig.root, 'practice/session summary');
    row('A-S02', 'screens', 'exercise families met in the session', [...new Set(families)].join(', '));
    expect(new Set(families).size).toBeGreaterThanOrEqual(4);

    await rig.go('review/transfer');
    audit(rig.root, 'practice/transfer');
    await reopen(rig);
    // Save deck moves the deck to the saved decks; the list is audited too
    click(rig.q('#save-deck'));
    await until(() => /Deck saved/.test(rig.root.querySelector('#review-home > .status')?.textContent ?? ''), 'the deck to be saved');
    audit(rig.root, 'practice/review-home (after Save deck)');
    await rig.go('review/decks');
    audit(rig.root, 'practice/previous-decks');
    await reopenDetails(rig);
    const hist = rig.root.querySelector<HTMLAnchorElement>('a[href^="#/review/history"]');
    if (hist) { await rig.go(hist.getAttribute('href')!.replace(/^#\//, '')); audit(rig.root, 'practice/history'); }
  }, 60_000);

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
  it('A-S06 an audio-only question has a named group, named controls, a live replay count, and a non-audio way out; with no voice the home says so and asks in writing', async () => {
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

    const mute = await makeRig({ signedIn: true, audio: fakeAudio({ available: false }) });
    await startWith(mute, dueCard(A, 'qen', 'audio-to-meaning'), { includeListening: true });
    expect(mute.root.querySelector('#audio')).toBeNull();
    expect(mute.q('.exercise').getAttribute('data-family')).toBe('written-recognition');
    await reopenDetails(mute);
    expect(mute.q('#listening-availability').textContent).toMatch(/^not available: no Albanian voice is installed/);
    row('A-S06', 'audio', 'audio-only question: alternatives and honest notices', 'pass', 'group "Audio question"; Play/Replay (Space) and "I could not hear it" are buttons; choices are written; with no voice the item is asked in writing and the home says "not available: …"; "Include listening practice" can be switched off');
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

  it('A-11 Albanian words inside English sentences are wrapped in lang="sq" (review reasons, session item line and explanations, the "Added … to your deck" status, transfer measures, GoTell issue text) (WCAG 3.1.2)', () => {
    expect(findingsOf('embedded-target-word', (x) => x.startsWith('practice/')).map(where)).toEqual([]);
  });

  it('A-19 the history screen does not skip a heading level (h1 then h3)', () => {
    expect(findingsOf('heading-skip').map(where)).toEqual([]);
  });

  it('A-20 repeated list actions (Dismiss, History, Snooze, Suspend, Write with this prompt, Change, Install, Re-verify) carry the item in their accessible name', () => {
    expect(findingsOf('repeated-name').map(where)).toEqual([]);
  });
});
