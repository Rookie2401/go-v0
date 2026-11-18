// The period of a sentence whose spelling shows neither system depends on the lookup made BEFORE it (module-level memory in analyze.ts).
import { card } from 'C:/Users/CJWal/dev/tmp-mem/elaudit/setup.mts';
const show = (label: string, c: any) => console.log(`${label}: ${c.surface} ⇒ ${c.lemma}/${c.pos} [${c.morphology ?? ''}] “${(c.gloss ?? '').slice(0, 30)}” period ${c.period?.label} (${c.period?.evidence}) — ${c.period?.basis}`);
const target: Array<[string, string]> = [['λόγος.', 'λόγος'], ['φαίνεται.', 'φαίνεται'], ['πάντα ῥεῖ.', 'πάντα'], ['θάλαττα, θάλαττα.', 'θάλαττα'], ['τίς τ᾽ ἄρ σφωε θεῶν ἔριδι ξυνέηκε μάχεσθαι;', 'θεῶν']];
for (const [s, w] of target) {
  show('fresh           ', await card('ext', s, w, s.indexOf(w), undefined, true));
  await card('ext', 'Το παιδί διαβάζει ένα βιβλίο.', 'παιδί', 3, undefined, true);
  show('after a Modern  ', await card('ext', s, w, s.indexOf(w), undefined, false));
  await card('ext', 'Μῆνιν ἄειδε θεὰ Πηληϊάδεω Ἀχιλῆος οὐλομένην', 'Μῆνιν', 0, undefined, true);
  show('after a Homeric ', await card('ext', s, w, s.indexOf(w), undefined, false));
  await card('ext', 'Ἐν ἀρχῇ ἦν ὁ λόγος, καὶ ὁ λόγος ἦν πρὸς τὸν θεόν.', 'ἀρχῇ', 3, undefined, true);
  show('after a Koine   ', await card('ext', s, w, s.indexOf(w), undefined, false));
}
