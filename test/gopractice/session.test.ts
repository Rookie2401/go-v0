// @vitest-environment jsdom
import { afterEach, describe, expect, it } from 'vitest';
import { destroyRigs, defaultService, dueCard, ids, key, makeRig, queued, reopen, shownLabel, startWith, type, until, unitOf, type Rig } from './helpers';

afterEach(() => destroyRigs());

const A = ids('L1', 'sq');
const progress = (rig: Rig): string => rig.q('#session-progress').textContent ?? '';
const answerTyped = (rig: Rig, text: string): void => {
  const input = rig.q<HTMLInputElement>('#answer-input');
  type(input, text);
  key('Enter', input);
};

describe('a written exercise', () => {
  it('records the result to the queue before the next item renders, and not before the learner moves on', async () => {
    const rig = await makeRig({ signedIn: true });
    await startWith(rig, [...dueCard(A, 'zog', 'meaning-to-form'), ...dueCard(A, 'mace', 'meaning-to-form')]);
    expect(progress(rig)).toBe('Item 1 of 2');
    expect(rig.q('#instruction').textContent).toBe('Write the Albanian word.');
    const first = shownLabel(rig);
    answerTyped(rig, first);
    await until(() => !!rig.root.querySelector('#feedback'), 'the feedback');
    expect(rig.q('#outcome').textContent).toBe('Correct');
    expect(rig.q('#explanation').textContent).toContain(first);
    // feedback is on screen; the claim is made once, when the learner moves on (so a challenge can still change it)
    expect(await queued(rig)).toEqual([]);
    rig.q('#next').click();
    await until(() => progress(rig) === 'Item 2 of 2', 'the second exercise');
    const q = await queued(rig);
    expect(q.map((e) => e.kind)).toEqual(['CardReviewed']);
    expect(q[0].payload).toMatchObject({ rating: 3, outcome: 'correct' });
    expect(q[0].subject.itemIds).toEqual([unitOf(first)]);
    expect((await rig.app.ctx.events('sq')).some((e) => e.id === q[0].id)).toBe(true); // also in the local log, so the deck re-folds
  });

  it('shows the deeper note only under "More", and marks target-language text for the screen reader and the renderer', async () => {
    const rig = await makeRig({ signedIn: true });
    await startWith(rig, dueCard(A, 'zog', 'meaning-to-form'));
    const input = rig.q<HTMLInputElement>('#answer-input');
    expect(input.getAttribute('lang')).toBe('sq-AL');
    expect(input.getAttribute('dir')).toBe('ltr');
    answerTyped(rig, 'wrong');
    await until(() => !!rig.root.querySelector('#feedback'), 'the feedback');
    expect(rig.q('#outcome').textContent).toBe('Not quite');
    expect(rig.q('#reference').getAttribute('lang')).toBe('sq-AL');
    expect(rig.q('#more summary').textContent).toBe('More');
    expect(rig.q('#more p').textContent).toBe('Typed answers ignore accents.');
  });

  it('keeps the answer on screen and writes nothing when the queue refuses the event', async () => {
    const rig = await makeRig({ signedIn: true });
    await startWith(rig, dueCard(A, 'zog', 'meaning-to-form'));
    answerTyped(rig, 'zog');
    await until(() => !!rig.root.querySelector('#feedback'), 'the feedback');
    const data = (await rig.app.ctx.data())!;
    const real = data.queue.enqueue.bind(data.queue);
    data.queue.enqueue = async () => ({ ok: false, reason: 'invalid', issues: [{ path: 'x', message: 'refused' }] });
    rig.q('#next').click();
    await until(() => (rig.root.querySelector('#session-status')?.textContent ?? '').includes('could not be recorded'), 'the error');
    expect(rig.root.querySelector('#feedback')).not.toBeNull();
    data.queue.enqueue = real;
    rig.q('#next').click();
    await until(() => !!rig.root.querySelector('#summary'), 'the summary');
    expect((await queued(rig)).length).toBe(1);
  });
});

describe('a choice question', () => {
  it('takes the first four choices on the number keys', async () => {
    const rig = await makeRig({ signedIn: true });
    await startWith(rig, dueCard(A, 'mace', 'written-recognition'));
    const options = rig.qa('.choice').map((b) => b.getAttribute('data-choice'));
    expect(options).toContain('cat');
    key(String(options.indexOf('cat') + 1));
    await until(() => !!rig.root.querySelector('#feedback'), 'the feedback');
    expect(rig.q('#outcome').textContent).toBe('Correct');
    expect(rig.q('#given').textContent).toBe('cat');
  });
});

describe('a self-graded question', () => {
  it.each([
    ['1', 'again', 'Not quite', 1], ['2', 'hard', 'Partly correct', 2], ['3', 'good', 'Correct', 3], ['4', 'easy', 'Correct', 4],
  ] as const)('key %s is %s', async (digit, grade, outcome, rating) => {
    const rig = await makeRig({ signedIn: true });
    await startWith(rig, dueCard(A, 'shtepi', 'phrase-comprehension'));
    key(digit); // before the answer is shown: refused, with a hint
    expect(rig.root.querySelector('#feedback')).toBeNull();
    expect(rig.q('#session-status').textContent).toContain('Show the answer first');
    key('Enter'); // reveals
    expect(rig.q('#revealed-answer').textContent).toBe('house');
    key(digit);
    await until(() => !!rig.root.querySelector('#feedback'), 'the feedback');
    expect(rig.q('#outcome').textContent).toBe(outcome);
    expect(rig.q('#given').textContent).toBe(`self-graded: ${grade}`);
    rig.q('#next').click();
    await until(() => !!rig.root.querySelector('#summary'), 'the summary');
    const [ev] = await queued(rig);
    expect(ev.payload).toMatchObject({ grade, rating });
  });

  it('Enter on the feedback moves on', async () => {
    const rig = await makeRig({ signedIn: true });
    await startWith(rig, [...dueCard(A, 'shtepi', 'phrase-comprehension'), ...dueCard(A, 'zog', 'phrase-comprehension')]);
    key('Enter'); key('3');
    await until(() => !!rig.root.querySelector('#feedback'), 'the feedback');
    key('Enter');
    await until(() => progress(rig) === 'Item 2 of 2', 'the next item');
    expect((await queued(rig)).length).toBe(1);
  });
});

describe('an audio-only question', () => {
  const audioRig = async (): Promise<Rig> => {
    const rig = await makeRig({ signedIn: true });
    await startWith(rig, dueCard(A, 'qen', 'audio-to-meaning'), { includeListening: true });
    return rig;
  };

  it('keeps the transcript out of the DOM until after the answer, then shows it', async () => {
    const rig = await audioRig();
    expect(rig.q('.exercise').getAttribute('data-family')).toBe('audio-to-meaning');
    const html = rig.root.innerHTML;
    expect(html).not.toContain('qen');
    expect(html).not.toContain('lemma:sq:qen');
    expect(rig.root.querySelector('#stimulus')).toBeNull();
    expect(rig.root.querySelector('#item-tools [id="show-history"]')).toBeNull();
    // answering reveals it
    rig.q('[data-choice="dog"]').click();
    await until(() => !!rig.root.querySelector('#feedback'), 'the feedback');
    expect(rig.q('#transcript').textContent).toBe('qen');
    expect(rig.q('#audio-reveal').textContent).toContain('Device voice (Albanian)');
    expect(rig.q('#audio-reveal').textContent).toContain('practice only');
    expect(rig.q('#recording').textContent).toContain('listening practice with no evidence weight');
  });

  it('plays on Space, replays on Space, counts the replays, and records practice with evidence quality none', async () => {
    const rig = await audioRig();
    key(' ');
    await until(() => (rig.audio?.handles[0]?.plays ?? 0) === 1, 'the first play');
    expect(rig.q('#audio-count').textContent).toBe('Played 1 time · replays 0 of 2');
    key(' ');
    await until(() => rig.audio!.handles[0].replays === 1, 'the replay');
    expect(rig.q('#audio-count').textContent).toBe('Played 2 times · replays 1 of 2');
    rig.q('[data-choice="dog"]').click();
    await until(() => !!rig.root.querySelector('#feedback'), 'the feedback');
    rig.q('#next').click();
    await until(() => !!rig.root.querySelector('#summary'), 'the summary');
    const [ev] = await queued(rig);
    expect(ev.kind).toBe('ListeningAssessed');
    expect(ev.evidence?.quality).toBe('none');
    expect(ev.payload).toMatchObject({ answerShownBefore: false, correct: true });
    expect(rig.q('#sum-withheld').textContent).toContain('practice only');
    expect(rig.audio!.handles[0].disposed).toBe(true);
  });

  it('"I could not hear it" claims nothing and records nothing', async () => {
    const rig = await audioRig();
    rig.q('#audio-failed').click();
    await until(() => !!rig.root.querySelector('#feedback'), 'the feedback');
    expect(rig.q('#outcome').textContent).toContain('Not heard');
    expect(rig.q('#recording').textContent).toContain('Not recorded');
    rig.q('#next').click();
    await until(() => !!rig.root.querySelector('#summary'), 'the summary');
    expect(await queued(rig)).toEqual([]);
    expect(rig.q('#sum-withheld').textContent).toContain('could not be heard');
  });

  it('is asked in writing, counted as reading, when listening is switched off', async () => {
    const rig = await makeRig({ signedIn: true });
    await startWith(rig, dueCard(A, 'qen', 'audio-to-meaning'), { includeListening: false });
    expect(rig.q('.exercise').getAttribute('data-family')).toBe('written-recognition');
    expect(rig.root.querySelector('#audio')).toBeNull();
  });
});

describe('skipping, finishing early and setting items aside', () => {
  it('Esc skips and writes nothing; finishing early leaves the rest due', async () => {
    const rig = await makeRig({ signedIn: true });
    await startWith(rig, [...dueCard(A, 'zog', 'meaning-to-form'), ...dueCard(A, 'mace', 'meaning-to-form')]);
    key('Escape');
    await until(() => progress(rig) === 'Item 2 of 2', 'the second item');
    expect(await queued(rig)).toEqual([]);
    rig.q('#finish-early').click();
    await until(() => !!rig.root.querySelector('#summary'), 'the summary');
    expect(rig.q('#summary h2').textContent).toBe('Session ended early');
    expect(rig.q('#sum-skipped').textContent).toBe('1');
    expect(rig.q('#sum-left').textContent).toContain('stay due');
    expect(await queued(rig)).toEqual([]);
    await reopen(rig);
    expect(rig.q('#count-due').textContent).toBe('2');
  });

  it('an item answered before finishing early is recorded, the one after it is not', async () => {
    const rig = await makeRig({ signedIn: true });
    await startWith(rig, [...dueCard(A, 'zog', 'meaning-to-form'), ...dueCard(A, 'mace', 'meaning-to-form')]);
    answerTyped(rig, shownLabel(rig));
    await until(() => !!rig.root.querySelector('#feedback'), 'the feedback');
    rig.q('#finish-early').click();
    await until(() => !!rig.root.querySelector('#summary'), 'the summary');
    expect((await queued(rig)).length).toBe(1);
    expect(rig.q('#sum-answered').textContent).toBe('1 of 2 planned, 1 correct');
    await reopen(rig);
    expect(rig.q('#count-due').textContent).toBe('1');
  });

  it('leaving the screen mid-feedback still records the answered item and abandons the rest', async () => {
    const rig = await makeRig({ signedIn: true });
    await startWith(rig, [...dueCard(A, 'zog', 'meaning-to-form'), ...dueCard(A, 'mace', 'meaning-to-form')]);
    answerTyped(rig, shownLabel(rig));
    await until(() => !!rig.root.querySelector('#feedback'), 'the feedback');
    await rig.go('settings');
    await until(async () => (await queued(rig)).length === 1, 'the answer to be recorded');
  });

  it('snooze, suspend and dismiss are events, and the session moves on', async () => {
    const rig = await makeRig({ signedIn: true });
    await startWith(rig, [...dueCard(A, 'zog', 'meaning-to-form'), ...dueCard(A, 'mace', 'meaning-to-form'), ...dueCard(A, 'qen', 'meaning-to-form')]);
    const first = shownLabel(rig);
    rig.q('#suspend').click();
    await until(() => progress(rig) === 'Item 2 of 3', 'the next item');
    const second = shownLabel(rig);
    rig.clock.set('2026-10-08T10:01:00.000Z');
    rig.q('#snooze-week').click();
    await until(() => progress(rig) === 'Item 3 of 3', 'the next item');
    const third = shownLabel(rig);
    rig.clock.set('2026-10-08T10:02:00.000Z');
    rig.q('#dismiss').click();
    await until(() => !!rig.root.querySelector('#summary'), 'the summary');
    const q = await queued(rig);
    expect(q.map((e) => `${e.kind}:${(e.payload as { reason?: string }).reason}`)).toEqual(['CardRemoved:suspended', 'CardRemoved:snoozed', 'CardRemoved:dismissed']);
    expect(q.map((e) => e.subject.cardId!.split(":")[4])).toEqual([first, second, third]);
    expect((q[1].payload as { until: string }).until).toBe('2026-10-15T10:01:00.000Z');
    expect(rig.q('#sum-controls').textContent).toContain('suspend');
    await reopen(rig);
    expect(rig.q('#count-due').textContent).toBe('0');
  });
});

describe('challenging an answer and reporting an analysis error', () => {
  it('a challenged answer is kept with evidence quality none and no rating, and does not move the schedule', async () => {
    const rig = await makeRig({ signedIn: true });
    await startWith(rig, dueCard(A, 'zog', 'meaning-to-form'));
    answerTyped(rig, 'zog');
    await until(() => !!rig.root.querySelector('#feedback'), 'the feedback');
    rig.q('#challenge').click();
    expect(rig.q<HTMLButtonElement>('#challenge').disabled).toBe(true);
    expect(rig.q('#recording').textContent).toContain('not counted as evidence');
    rig.q('#next').click();
    await until(() => !!rig.root.querySelector('#summary'), 'the summary');
    const [ev] = await queued(rig);
    expect(ev.evidence?.quality).toBe('none');
    expect(ev.payload).toMatchObject({ rating: null });
    expect(rig.q('#sum-withheld').textContent).toContain('challenged');
    await reopen(rig);
    rig.root.querySelector<HTMLElement>('#deck')!.setAttribute('open', '');
    expect(rig.q('#deck').textContent).toContain('due'); // still due: the challenged answer scheduled nothing
    expect(rig.q('#count-due').textContent).toBe('1');
  });

  it('"Report an analysis error" goes to the correction route with the form and what it should be, and challenges the answer', async () => {
    const rig = await makeRig({ signedIn: true });
    await startWith(rig, dueCard(A, 'zog', 'meaning-to-form'));
    answerTyped(rig, 'zog');
    await until(() => !!rig.root.querySelector('#feedback'), 'the feedback');
    // nothing to send without a correction
    rig.q('#report-send').click();
    await until(() => !!rig.q('#report-error .status').textContent, 'a message');
    expect(rig.q('#report-error .status').getAttribute('data-kind')).toBe('error');
    expect(rig.service.corrections).toEqual([]);
    type(rig.q<HTMLTextAreaElement>('#report-reason'), 'this is the genitive');
    type(rig.q<HTMLInputElement>('#report-correction'), 'case=gen, number=pl');
    rig.q('#report-send').click();
    await until(() => rig.service.corrections.length === 1, 'the correction');
    expect(rig.service.corrections[0]).toMatchObject({
      formId: unitOf('zog'), features: { case: 'gen', number: 'pl' }, reason: 'this is the genitive', enrolmentId: 'L1-e1', languageId: 'sq',
    });
    await until(() => rig.q<HTMLButtonElement>('#challenge').disabled, 'the challenge');
  });
});

describe('without a network', () => {
  it('the session continues, the queue grows, and nothing is lost when the service comes back', async () => {
    const service = defaultService();
    const rig = await makeRig({ service, signedIn: true });
    service.netDown = true;
    await startWith(rig, [...dueCard(A, 'zog', 'meaning-to-form'), ...dueCard(A, 'mace', 'meaning-to-form')]);
    for (let i = 1; i <= 2; i++) {
      answerTyped(rig, shownLabel(rig));
      await until(() => !!rig.root.querySelector('#feedback'), 'the feedback');
      rig.q('#next').click();
      await until(async () => (await queued(rig)).length === i, `${i} queued`);
    }
    await until(() => !!rig.root.querySelector('#summary'), 'the summary');
    expect(rig.q('#summary').textContent).toContain('2 event(s) wait to be sent');
    const failed = await rig.app.ctx.syncNow({ force: true });
    expect(failed?.ok).toBe(false);
    expect((await queued(rig)).length).toBe(2);
    const view = await rig.app.ctx.syncView();
    expect(view.status?.lastError).toContain('network down');
    expect(view.status?.pending).toBe(2);
    service.netDown = false;
    const sent = await rig.app.ctx.syncNow({ force: true });
    expect(sent?.ok).toBe(true);
    expect((await queued(rig)).length).toBe(0);
    expect(service.storedEvents('L1').filter((e) => e.kind === 'CardReviewed').length).toBe(2);
  });

  it('shows offline in the header when the browser goes offline', async () => {
    const rig = await makeRig({ signedIn: true });
    await rig.app.ctx.data();
    window.dispatchEvent(new Event('offline'));
    await until(async () => (await rig.app.ctx.syncView()).status?.online === false, 'the offline status');
    await rig.app.ctx.syncNow();
    await rig.go('settings');
    await rig.go('review');
    expect(rig.q('#sync-indicator').textContent).toMatch(/^Offline/);
    window.dispatchEvent(new Event('online'));
  });
});

describe('an exercise that cannot be built', () => {
  it('is skipped with its reason, never shown, and listed in the summary', async () => {
    const rig = await makeRig({ signedIn: true });
    await startWith(rig, [...dueCard(A, 'zog', 'morphological-identification'), ...dueCard(A, 'mace', 'meaning-to-form')]);
    expect(shownLabel(rig)).toBe('mace'); // the zog card is planned but cannot be built, so it is never shown
    answerTyped(rig, 'mace');
    await until(() => !!rig.root.querySelector('#feedback'), 'the feedback');
    rig.q('#next').click();
    await until(() => !!rig.root.querySelector('#summary'), 'the summary');
    expect(rig.q('#sum-unbuildable').textContent).toContain('no exercise builder for morphological-identification');
  });
});

describe('the summary', () => {
  it('reports results by dimension, what was recorded and what was withheld', async () => {
    const rig = await makeRig({ signedIn: true });
    await startWith(rig, [...dueCard(A, 'zog', 'meaning-to-form'), ...dueCard(A, 'shtepi', 'phrase-comprehension')]);
    for (let i = 0; i < 2; i++) {
      const ex = rig.q('.exercise');
      if (ex.getAttribute('data-mode') === 'typed') answerTyped(rig, shownLabel(rig));
      else { key('Enter'); key('1'); }
      await until(() => !!rig.root.querySelector('#feedback'), 'the feedback');
      rig.q('#next').click();
      await until(() => !!rig.root.querySelector('#summary') || !!rig.root.querySelector('.exercise'), 'the next screen');
    }
    await until(() => !!rig.root.querySelector('#summary'), 'the summary');
    const rows = rig.qa('#sum-dimensions tbody tr').map((r) => r.querySelector('th')!.textContent);
    expect(rows.sort()).toEqual(['Meaning to word', 'Phrases']);
    expect(rig.q('#sum-recorded').textContent).toContain('2 event(s)');
    expect(rig.q('#sum-answered').textContent).toBe('2 of 2 planned, 1 correct');
    expect(rig.q('#summary').textContent).toContain('Nothing was withheld');
    expect(rig.q('#summary').textContent).not.toMatch(/streak|points|badge/i);
  });
});
