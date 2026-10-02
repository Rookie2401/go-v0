/**
 * "Help you needed" — how much support the learner's reading has taken, and whether that is changing.
 *
 * Needing less help on the same kind of text IS progress: a learner whose English rescues fall from thirty in a hundred
 * sentences to three has moved, whatever his word counts say. The figures come from GoLearn (`rescueDependence`): each
 * kind of help is counted apart, per 100 words or per 100 sentences read; the direction is stated only when there has
 * been enough reading to compare. Nothing here is a score, and nothing is shown before the learner has read anything.
 *
 * Language-neutral: the two script lines (reading a word piece by piece, the Latin-letter spelling) appear only when
 * such help was actually used, so a course whose script needs no decoding never shows them.
 */
import { useEffect, useState } from 'react';
import type { RescueDependence } from '../core';
import { useApp } from './context';

const n = (x: number): string => (x >= 10 || Number.isInteger(x) ? String(Math.round(x)) : x.toFixed(1));

const TREND: Record<RescueDependence['trend'], string> = {
  falling: 'You are needing English for a sentence less often than before.',
  steady: 'You are needing English about as often as before.',
  rising: 'You have needed English more often lately. Harder texts do that; it is not a step back.',
  'insufficient-data': 'Too little reading yet to say whether this is changing.',
};

/** The lines of the panel, built only from the record (pure). Empty when nothing has been read. */
export function rescueLines(d: RescueDependence): string[] {
  const o = d.overall;
  if (o.sentences === 0) return [];
  const lines = [`Sentences read with no help at all: ${Math.round(o.unaidedSentenceShare * 100)} in 100`];
  lines.push(`English for a sentence: ${n(o.per100Sentences.english)} in 100 sentences`);
  if (o.per100Sentences.explanation > 0) lines.push(`A sentence explained: ${n(o.per100Sentences.explanation)} in 100 sentences`);
  lines.push(`A word looked up: ${n(o.per100Words.word)} in 100 words`);
  if (o.per100Words.phrase > 0) lines.push(`A phrase looked up: ${n(o.per100Words.phrase)} in 100 words`);
  if (o.per100Words.grammar > 0) lines.push(`Grammar help: ${n(o.per100Words.grammar)} in 100 words`);
  if (o.per100Words.decoding > 0) lines.push(`A word read piece by piece: ${n(o.per100Words.decoding)} in 100 words`);
  if (o.per100Words.romanization > 0) lines.push(`The Latin-letter spelling: ${n(o.per100Words.romanization)} in 100 words`);
  return lines;
}

/** What changed between the earlier and the later half of the reading, kind by kind (only kinds that moved). */
export function rescueChanges(d: RescueDependence): string[] {
  if (!d.byKind) return [];
  const NAME: Record<string, string> = {
    decoding: 'reading a word piece by piece', romanization: 'the Latin-letter spelling', word: 'looking up a word',
    phrase: 'looking up a phrase', grammar: 'grammar help', explanation: 'a sentence explained',
  };
  const falling = Object.entries(d.byKind).filter(([k, v]) => v === 'falling' && NAME[k]).map(([k]) => NAME[k]);
  const rising = Object.entries(d.byKind).filter(([k, v]) => v === 'rising' && NAME[k]).map(([k]) => NAME[k]);
  const out: string[] = [];
  if (falling.length) out.push(`Needed less than before: ${falling.join(', ')}.`);
  if (rising.length) out.push(`Needed more than before: ${rising.join(', ')}.`);
  return out;
}

export function HelpNeeded() {
  const { golearn, bus, userId, lang } = useApp();
  const [d, setD] = useState<RescueDependence | null>(null);

  useEffect(() => {
    let live = true;
    setD(null);
    const read = async () => {
      await golearn.settled();
      const r = await golearn.rescueDependence(userId, { lang });
      if (live) setD(r);
    };
    void read().catch(() => undefined);
    // read again when a text is finished or reported on: the figures are about reading done, not about every tap
    const off = bus.subscribe((e) => { if (e.userId === userId && (e.type === 'TextCompleted' || e.type === 'ComprehensionReported')) void read().catch(() => undefined); });
    return () => { live = false; off(); };
  }, [golearn, bus, userId, lang]);

  const lines = d ? rescueLines(d) : [];
  if (!d || lines.length === 0) return null;
  return (
    <section aria-label="Help you needed" data-testid="help-needed" className="home__help">
      <h2 className="home__list-divider">Help you needed</h2>
      <ul className="reasons">{lines.map((l) => <li key={l}>{l}</li>)}</ul>
      <p className="card__note" data-testid="help-needed-trend">{TREND[d.trend]}</p>
      {rescueChanges(d).map((l) => <p key={l} className="card__note">{l}</p>)}
      <p className="card__note">Over {d.overall.sentences} sentences and {d.overall.words} words read. Needing less help is progress in its own right.</p>
    </section>
  );
}
