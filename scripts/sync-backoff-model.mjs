// Scheduling model behind the "stranded events" row of docs/ecosystem/SYNC.md. Run: node scripts/sync-backoff-model.mjs
// Monte Carlo of the extension's push scheduling around an outage: how long after the service is back are the stranded events sent?
// The learner reads for the first 90 % of the outage (an event every 20-40 s), then stops; the service returns at the end of the outage.
const runs = 3000;
const delayFor = (streak, max) => Math.round(Math.min(max, 2000 * 2 ** Math.max(0, streak - 1)) * (0.5 + 0.5 * Math.random()));
function sim(outageS, mode) {
  const down = outageS * 1000;
  const evs = []; for (let t = 5000 + Math.random() * 15000; t < down * 0.9; t += 20000 + Math.random() * 20000) evs.push(t + 2000); // debounce attempts
  const alarmEvery = mode === 'new' ? 60000 : 300000;
  const alarmPhase = Math.random() * alarmEvery; // the alarm is not aligned with anything
  const events = evs.map((t) => ({ t, kind: 'debounce' }));
  for (let t = alarmPhase; t < down + 3600000; t += alarmEvery) events.push({ t, kind: 'alarm' });
  events.sort((a, b) => a.t - b.t);
  let streak = 0, nextAt = 0, retryAt = Infinity, ladder = 0;
  const maxB = mode === 'new' ? 30000 : 300000;
  const first = evs[0];
  for (;;) {
    // the next thing that happens: a scheduled event or the single pending retry
    const next = events[0];
    const useRetry = mode === 'new' && retryAt < (next?.t ?? Infinity);
    const t = useRetry ? retryAt : next.t;
    if (!useRetry) events.shift(); else retryAt = Infinity;
    if (t < first) continue;
    const forced = mode === 'new'; // new: a queue with events in it is always tried
    if (!forced && t < nextAt) continue;
    if (t < down) {
      streak++; nextAt = t + delayFor(streak, maxB);
      if (mode === 'new') { ladder++; retryAt = t + Math.min(30000, 5000 * 2 ** (ladder - 1)); }
      continue;
    }
    return (t - down) / 1000;
  }
}
const pct = (a, p) => a.sort((x, y) => x - y)[Math.floor(a.length * p)];
console.log('outage | OLD median / p90 / worst | NEW median / p90 / worst   (seconds from "service back" until the stranded events are sent)');
for (const m of [1, 3, 5, 10, 20, 60]) {
  const o = Array.from({ length: runs }, () => sim(m * 60, 'old')), n = Array.from({ length: runs }, () => sim(m * 60, 'new'));
  console.log(`${String(m).padStart(3)} min | ${pct(o,.5).toFixed(0).padStart(4)} / ${pct(o,.9).toFixed(0).padStart(4)} / ${Math.max(...o).toFixed(0).padStart(4)}       | ${pct(n,.5).toFixed(0).padStart(4)} / ${pct(n,.9).toFixed(0).padStart(4)} / ${Math.max(...n).toFixed(0).padStart(4)}`);
}
