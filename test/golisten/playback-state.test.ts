import { describe, expect, it } from 'vitest';
import { createPlayback, type PlaybackDriver, type PlaybackState } from '../../packages/golisten/src';

describe('PlaybackHandle state notifications', () => {
  it('reports a delayed driver error after play returned', () => {
    let callbacks!: { failed(): void; ended(): void; interrupted(): void };
    const driver: PlaybackDriver = {
      start: (_rate, cb) => { callbacks = cb; },
      pause() {}, resume() {}, cancel() {},
    };
    const p = createPlayback(driver, { now: () => 100 });
    const states: PlaybackState[] = [];
    p.onState!((state) => states.push(state));
    p.play();
    expect(p.state).toBe('playing');
    callbacks.failed();
    expect(p.state).toBe('error');
    expect(states).toEqual(['idle', 'playing', 'error']);
  });

  it('supports unsubscribe and reports normal end exactly once', () => {
    let callbacks!: { failed(): void; ended(): void; interrupted(): void };
    const driver: PlaybackDriver = {
      start: (_rate, cb) => { callbacks = cb; },
      pause() {}, resume() {}, cancel() {},
    };
    const p = createPlayback(driver, { now: () => 100 });
    const states: PlaybackState[] = [];
    const off = p.onState!((state) => states.push(state));
    p.play();
    off();
    callbacks.ended();
    expect(states).toEqual(['idle', 'playing']);
    expect(p.state).toBe('ended');
  });
});


it('accepts one terminal callback per hearing and reports duration before ended state', () => {
  let callbacks!: { failed(): void; ended(): void; interrupted(): void };
  let now = 10;
  const p = createPlayback({ start: (_rate, cb) => { callbacks = cb; }, pause() {}, resume() {}, cancel() {} }, { now: () => now });
  let ends = 0;
  p.onEnd(() => ends++);
  let duration: number | undefined;
  p.onState!((s) => { if (s === 'ended') duration = p.durationMs; });
  p.play(); now = 60;
  callbacks.ended(); callbacks.ended(); callbacks.failed(); callbacks.interrupted();
  expect(p.state).toBe('ended');
  expect(ends).toBe(1);
  expect(duration).toBe(50);
  p.replay(); callbacks.failed(); callbacks.ended();
  expect(p.state).toBe('error');
  expect(ends).toBe(1);
});


it('keeps state subscriptions across stop and suppresses starts disposed by a subscriber', () => {
  let starts = 0;
  const p = createPlayback({ start() { starts++; }, pause() {}, resume() {}, cancel() {} }, { now: () => 0 });
  const states: PlaybackState[] = [];
  p.onState!((s) => states.push(s));
  p.play(); p.stop(); p.play();
  expect(states).toEqual(['idle', 'playing', 'idle', 'playing']);
  p.dispose();
  const q = createPlayback({ start() { starts++; }, pause() {}, resume() {}, cancel() {} }, { now: () => 0 });
  q.onState!((s) => { if (s === 'playing') q.dispose(); });
  q.play();
  expect(starts).toBe(2); expect(q.state).toBe('idle');
});
