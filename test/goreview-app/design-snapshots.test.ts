// @vitest-environment jsdom
/**
 * The Ecclesia-shaped home and card (the owner, 2026-11-09), for a visual check:
 *  - with GOREVIEW_SNAPSHOT_DIR set, renders five screens with the real rig and writes each as a complete HTML document beside the stylesheet,
 *    the fonts and the Go mark (serve the folder over HTTP: a mask image does not load from file://);
 *  - always: the colour pairs of the scoped --ec-* tokens (light and dark) read from the stylesheet reach WCAG AA.
 */
import fs from 'node:fs';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import type { ExerciseBuilder } from '../../packages/goreview/src';
import { destroyRigs, dueCard, FAKE_BUILDERS, ids, key, makeRig, reopen, reviewed, seed, startWith, until, type Rig } from './helpers';

afterEach(() => destroyRigs());
const REPO = path.resolve(__dirname, '../..');
const css = fs.readFileSync(path.join(REPO, 'packages/goreview/app/styles.css'), 'utf8');
const A = ids('L1', 'sq');
const dir = process.env.GOREVIEW_SNAPSHOT_DIR;

// ───────────── the tokens' contrast ─────────────

const tokensIn = (block: string): Record<string, string> => Object.fromEntries([...block.matchAll(/(--ec-[\w-]+):\s*(#[0-9a-f]{6})/gi)].map((m) => [m[1], m[2]]));
const SELECTOR = '.home, .exercise, .feedback, .session-bar {';
const light = tokensIn(css.slice(css.indexOf(SELECTOR), css.indexOf('}', css.indexOf(SELECTOR))));
const darkAt = css.indexOf(SELECTOR, css.indexOf('@media (prefers-color-scheme: dark) {\n  .home'));
const dark = tokensIn(css.slice(darkAt, css.indexOf('}', darkAt)));
const lum = (hex: string): number => {
  const [r, g, b] = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255).map((c) => (c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4));
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
};
const ratio = (a: string, b: string): number => { const [x, y] = [lum(a), lum(b)].sort((p, q) => q - p); return (x + 0.05) / (y + 0.05); };

describe('the scoped Ecclesia tokens (home and card)', () => {
  it.each([['light', light], ['dark', dark]] as const)('%s: every text colour reaches 4.5:1 on the parchment and the raised parchment; the gold ring and the field line reach 3:1', (_scheme, t) => {
    expect(Object.keys(t).length).toBeGreaterThanOrEqual(10);
    for (const bg of [t['--ec-paper'], t['--ec-paper-raised']]) {
      for (const fg of ['--ec-ink', '--ec-ink-soft', '--ec-gold-ink']) expect(ratio(t[fg], bg), `${fg} on ${bg}`).toBeGreaterThanOrEqual(4.5);
      for (const fg of ['--ec-gold', '--ec-field-line']) expect(ratio(t[fg], bg), `${fg} on ${bg}`).toBeGreaterThanOrEqual(3);
    }
    expect(ratio(t['--ec-gold-on-fill'], t['--ec-gold-fill']), 'button text on the gold fill').toBeGreaterThanOrEqual(4.5);
    expect(ratio(t['--ec-gold-on-fill'], t['--ec-gold']), 'grade number on the pressed gold').toBeGreaterThanOrEqual(4.5);
  });
});

// ───────────── the snapshots ─────────────

const page = (rig: Rig): string => {
  const inner = rig.root.innerHTML.replace(/url\(&quot;[^)]*go-logo\.png&quot;\)/g, 'url(&quot;go-logo.png&quot;)').replace(/url\("[^)]*go-logo\.png"\)/g, 'url("go-logo.png")');
  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width"><title>GoReview</title><link rel="stylesheet" href="styles.css"></head><body>${inner}</body></html>\n`;
};
const write = (name: string, rig: Rig): void => { fs.writeFileSync(path.join(dir!, name), page(rig)); };

/** The written-recognition and phrase cards carry a meaning too, so the card shows a stimulus and a meaning. */
const BUILDERS: ExerciseBuilder[] = FAKE_BUILDERS.map((b) => (b.family === 'written-recognition' || b.family === 'phrase-comprehension'
  ? { ...b, build: async (...args: Parameters<ExerciseBuilder['build']>) => { const ex = await b.build(...args); if ('unavailable' in ex) return ex; return { ...ex, prompt: { ...ex.prompt, meaning: 'the place where one lives' } }; } }
  : b));

describe.skipIf(!dir)('design snapshots (GOREVIEW_SNAPSHOT_DIR)', () => {
  it('writes the home with decks, the empty home, and the card before the answer, at the grade step and in feedback', async () => {
    fs.mkdirSync(path.join(dir!, 'fonts'), { recursive: true });
    fs.copyFileSync(path.join(REPO, 'packages/goreview/app/styles.css'), path.join(dir!, 'styles.css'));
    for (const f of fs.readdirSync(path.join(REPO, 'packages/shared-fonts')).filter((n) => n.endsWith('.woff2'))) fs.copyFileSync(path.join(REPO, 'packages/shared-fonts', f), path.join(dir!, 'fonts', f));
    fs.copyFileSync(path.join(REPO, 'packages/shared-brand/go-logo.png'), path.join(dir!, 'go-logo.png'));

    // (2) nothing due
    const empty = await makeRig({ signedIn: true, builders: BUILDERS });
    write('home-empty.html', empty);
    destroyRigs();

    // (1) a Current Deck of 10, a Review Deck of 3, two saved decks (Class Essentials and one the learner saved)
    const rig = await makeRig({ signedIn: true, builders: BUILDERS });
    const words = ['shtepi', 'mace', 'zog', 'det', 'diell', 'hene', 'uje', 'bukë', 'liber', 'dritare', 'derë', 'tavolinë', 'karrige'];
    const events = [
      ...words.slice(0, 10).flatMap((w) => dueCard(A, w, 'written-recognition')),
      ...['mikut', 'qen', 'dhi'].flatMap((w) => [...dueCard(A, w, 'written-recognition'), reviewed(A, w, 'written-recognition', 4, '2026-09-02T10:00:00.000Z')]),
    ];
    await seed(rig, events);
    const id = await rig.app.ctx.identity();
    await rig.app.ctx.state.setPrefs(id!.learnerId, { languageId: 'sq', sessionMinutes: 0, maxNew: 5, cardsPerDeck: 10, desiredRetention: 0.9, includeListening: false, grammarShare: 0.2, prioritizeSaved: true, practiceGoals: ['recognition'] });
    await reopen(rig);
    expect(rig.q('#start-session').getAttribute('data-cards')).toBe('10');
    rig.q('#save-deck').click();
    await until(() => rig.q('#previous-count').textContent === '2 saved', 'two saved decks');
    await seed(rig, words.slice(0, 10).flatMap((w) => dueCard(A, `${w}x`, 'written-recognition')));
    await reopen(rig);
    write('home-decks.html', rig);
    destroyRigs();

    // (3) the card before the answer
    const card = await makeRig({ signedIn: true, builders: BUILDERS });
    await startWith(card, dueCard(A, 'shtepi', 'written-recognition'));
    expect(card.q('#stimulus').textContent).toBeTruthy();
    expect(card.q('#meaning').textContent).toBeTruthy();
    write('card-prompt.html', card);
    // (5) the feedback
    card.q<HTMLButtonElement>('.choice').click();
    await until(() => !!card.root.querySelector('#feedback'), 'the feedback');
    write('card-feedback.html', card);
    destroyRigs();

    // (4) the self-grade step
    const grade = await makeRig({ signedIn: true, builders: BUILDERS });
    await startWith(grade, dueCard(A, 'shtepi', 'phrase-comprehension'));
    grade.q<HTMLInputElement>('#retrieval-attempted').click();
    key('Enter');
    await until(() => !!grade.root.querySelector('.grades'), 'the grades');
    write('card-grade.html', grade);
    expect(fs.readdirSync(dir!).sort()).toEqual(expect.arrayContaining(['card-feedback.html', 'card-grade.html', 'card-prompt.html', 'home-decks.html', 'home-empty.html', 'styles.css', 'fonts']));
  }, 60_000);
});
