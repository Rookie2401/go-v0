/**
 * Stage 0 authoring validation — run by `npm run stage0:validate` and by test/stage0/content.test.ts on every pack.
 * Errors block; warnings are reported (missing native audio is a warning while no recordings exist, never hidden).
 * Checks: ids and references, provenance and review binding, the coverage bands along the path, construction
 * prerequisites, the romanization retirement for Hindi and Thai, the language checker on every line, sound steps that
 * really exercise their features, and exit forms that are unseen and covered by the path.
 */
import { hash } from '../core';
import type { LanguageAdapter, Stage0Check, Stage0DecodeCheck, Stage0ExitForm, Stage0Line, Stage0ProductionTask, Stage0Scene, Stage0SoundStep } from '../core';
import { assessLanguage } from '../gotell/productive/assess';
import type { Stage0Pack, Stage0World } from './content';
import { exitCoverage, itemKey, nameKeys, pathCoverage } from './coverage';
import { featuresOfWord, wordsOf } from './features';
import { stage0Config } from './lang';
import { normalizeAnswer } from './match';

export interface Stage0Issue { severity: 'error' | 'warning'; where: string; code: string; message: string }

const ID = /^[a-z0-9][a-z0-9-]*$/;
const KINDS = new Set(['copy', 'choose', 'substitute', 'complete', 'recall', 'answer', 'describe', 'retell']);

/** Signature of the wording a review covers: everything but provenance. A wording edit changes it. */
export function signatureOf(item: Stage0Scene | Stage0SoundStep | Stage0ExitForm): string {
  const { provenance: _p, ...rest } = item as unknown as Record<string, unknown>;
  void _p;
  return hash(JSON.stringify(rest));
}

export function validatePack(pack: Stage0Pack, adapter: LanguageAdapter, world?: Stage0World): Stage0Issue[] {
  const issues: Stage0Issue[] = [];
  const err = (where: string, code: string, message: string) => issues.push({ severity: 'error', where, code, message });
  const warn = (where: string, code: string, message: string) => issues.push({ severity: 'warning', where, code, message });
  const cfg = stage0Config(pack.lang);
  const coverageIds = new Set(pack.coverage.map((c) => c.id));
  const characters = new Set((world?.characters ?? []).map((c) => c.id));
  const names = nameKeys(world, pack.lang);
  const isName = (normalized: string) => names.has(normalized.toLowerCase());
  let audioNeeded = 0;
  let lines = 0;

  for (const d of pack.duplicates ?? []) err(d.file, 'duplicate-id', `id "${d.id}" is already defined in ${d.first}; this file is ignored`);

  // ── coverage map ──
  const seenCov = new Set<string>();
  for (const c of pack.coverage) {
    if (seenCov.has(c.id)) err(`coverage:${c.id}`, 'duplicate-id', `coverage id "${c.id}" is used twice`);
    seenCov.add(c.id);
    for (const p of c.prerequisites) if (!pack.coverage.some((x) => x.id === p)) err(`coverage:${c.id}`, 'broken-reference', `prerequisite "${p}" is not in the coverage map`);
  }

  // ── ids across the pack ──
  const allIds = new Map<string, string>();
  const claim = (id: string, what: string) => {
    if (!ID.test(id)) err(what, 'invalid-id', `id "${id}" must be lower-case letters, digits and "-"`);
    if (allIds.has(id)) err(what, 'duplicate-id', `id "${id}" is also used by ${allIds.get(id)}`);
    allIds.set(id, what);
  };

  const provenance = (where: string, item: Stage0Scene | Stage0SoundStep | Stage0ExitForm) => {
    const p = item.provenance;
    if (!p || !p.drafter?.trim() || !p.review) { err(where, 'missing-provenance', 'provenance (authoring, drafter, review) is required'); return; }
    if (p.review.status === 'reviewed') {
      if (!p.review.reviewer?.trim()) err(where, 'review-without-reviewer', 'a review needs a named reviewer');
      if (p.review.signature !== signatureOf(item)) err(where, 'stale-review', 'the review does not cover this wording (signature differs): the text changed after review');
    }
  };

  const checkLine = (where: string, l: Stage0Line, requireAudio: boolean) => {
    lines++;
    if (!l.id?.trim()) err(where, 'missing-field', 'line id is required');
    if (!l.text?.trim()) err(`${where}/${l.id}`, 'missing-field', 'line text is required');
    if (!l.en?.trim()) err(`${where}/${l.id}`, 'missing-support', 'every line needs its English meaning (the rescue)');
    if (l.speaker && world && !characters.has(l.speaker)) err(`${where}/${l.id}`, 'broken-reference', `speaker "${l.speaker}" is not in world.json`);
    if (requireAudio && !l.audio) err(`${where}/${l.id}`, 'missing-audio-slot', 'listening is planned: every line needs an audio slot ({ "status": "needed" } until recorded)');
    if (l.audio?.status === 'recorded' && (!l.audio.assetId || !l.audio.reviewedBy)) err(`${where}/${l.id}`, 'unreviewed-audio', 'a recorded line needs its asset id and a named reviewer');
    if (l.audio?.status === 'needed') audioNeeded++;
    // the language checker: a controlled line it objects to is either wrong or a false alarm — either way, not shipped silently
    const lang = assessLanguage(adapter, l.text);
    for (const f of lang.findings) err(`${where}/${l.id}`, 'checker-finding', `${f.category}: ${f.message} — "${l.text}"`);
    for (const w of wordsOf(adapter, pack.lang, l.text)) if (!w.lemma && !w.gloss && !/^\p{N}+$/u.test(w.normalized) && !isName(w.normalized)) warn(`${where}/${l.id}`, 'no-analysis', `the adapter has no reading for "${w.surface}" (no gloss on tap)`);
  };

  const checkChecks = (where: string, checks: Stage0Check[], lineIds: Set<string>) => {
    const seen = new Set<string>();
    for (const c of checks) {
      if (seen.has(c.id)) err(`${where}/${c.id}`, 'duplicate-id', `check id "${c.id}" is used twice`);
      seen.add(c.id);
      for (const l of c.lines) if (!lineIds.has(l)) err(`${where}/${c.id}`, 'broken-reference', `check refers to missing line "${l}"`);
      if (!c.options || c.options.length < 2) err(`${where}/${c.id}`, 'invalid-value', 'a check needs at least two options');
      if (!Number.isInteger(c.answer) || c.answer < 0 || c.answer >= (c.options?.length ?? 0)) err(`${where}/${c.id}`, 'invalid-value', 'answer index is out of range');
      if (!c.question?.en?.trim()) err(`${where}/${c.id}`, 'missing-field', 'question.en is required');
    }
  };

  const checkTasks = (where: string, tasks: Stage0ProductionTask[], refs: Set<string>) => {
    const seen = new Set<string>();
    for (const t of tasks) {
      if (seen.has(t.id)) err(`${where}/${t.id}`, 'duplicate-id', `task id "${t.id}" is used twice`);
      seen.add(t.id);
      if (!KINDS.has(t.kind)) err(`${where}/${t.id}`, 'invalid-value', `unknown production kind "${t.kind}"`);
      if (!t.accept?.length) err(`${where}/${t.id}`, 'missing-field', 'a production task needs at least one accepted answer');
      if ((t.kind === 'substitute' || t.kind === 'complete') && !t.frame) err(`${where}/${t.id}`, 'missing-field', `${t.kind} needs a frame`);
      if (t.kind === 'choose' && (!t.options?.length || !t.accept.some((a) => t.options!.some((o) => normalizeAnswer(pack.lang, o) === normalizeAnswer(pack.lang, a.text))))) err(`${where}/${t.id}`, 'invalid-value', 'choose needs options, and an accepted answer among them');
      for (const b of t.basedOn ?? []) if (!refs.has(b) && !coverageIds.has(b)) err(`${where}/${t.id}`, 'broken-reference', `basedOn "${b}" is neither a line nor a coverage id`);
      for (const a of t.accept ?? []) {
        const plain = a.text.replace(/\{x\}/g, '');
        if (plain.trim() && assessLanguage(adapter, a.text.replace(/\{x\}/g, pack.lang === 'th' ? '' : 'Sam')).findings.length) {
          err(`${where}/${t.id}`, 'checker-finding', `the checker objects to an accepted answer: "${a.text}"`);
        }
      }
    }
  };

  /**
   * Decode checks. For a script language the answer key is checked against the adapter's own decoder, so a check can never
   * teach a reading the reader's tables contradict: which-reading → the decoder's romanization; which-tone → its tone.
   */
  const plain = (s: string) => s.normalize('NFC').toLowerCase().replace(/[\s\-–—.·'’()]/g, '');
  const checkDecodes = (where: string, checks: Stage0DecodeCheck[]) => {
    const seen = new Set<string>();
    for (const c of checks) {
      if (seen.has(c.id)) err(`${where}/${c.id}`, 'duplicate-id', `decode check id "${c.id}" is used twice`);
      seen.add(c.id);
      if (c.kind === 'segment') {
        if (!c.boundaries?.length || c.boundaries.some((b, i, a) => b <= 0 || b >= c.word.length || (i > 0 && b <= a[i - 1]))) err(`${where}/${c.id}`, 'invalid-value', 'segment boundaries must be increasing offsets inside the word');
        continue;
      }
      if (!c.options || c.options.length < 2 || c.answer === undefined || c.answer < 0 || c.answer >= c.options.length) { err(`${where}/${c.id}`, 'invalid-value', 'a decode check needs options and an answer in range'); continue; }
      if (cfg.script.features !== 'adapter') continue;
      const words = wordsOf(adapter, pack.lang, c.word);
      if (c.kind === 'which-reading') {
        const roman = words.map((w) => w.romanization ?? '').join('');
        if (!roman) warn(`${where}/${c.id}`, 'no-decoding', `the decoder gives no reading for "${c.word}"`);
        else if (plain(c.options[c.answer]) !== plain(roman)) err(`${where}/${c.id}`, 'answer-contradicts-decoder', `answer "${c.options[c.answer]}" differs from the decoder's reading "${roman}" for "${c.word}"`);
        const dup = c.options.filter((o) => plain(o) === plain(c.options![c.answer!])).length;
        if (dup > 1) err(`${where}/${c.id}`, 'invalid-value', 'two options are the same reading');
      } else if (c.kind === 'which-tone') {
        const tones = words.flatMap((w) => w.syllables.map((s) => s.tone)).filter(Boolean);
        if (tones.length !== 1) err(`${where}/${c.id}`, 'invalid-value', `a which-tone word must be one syllable the decoder can read (got ${tones.length} tones for "${c.word}")`);
        else if (plain(c.options[c.answer]) !== plain(tones[0]!)) err(`${where}/${c.id}`, 'answer-contradicts-decoder', `answer "${c.options[c.answer]}" differs from the decoder's tone "${tones[0]}" for "${c.word}"`);
      }
    }
  };

  // ── scenes ──
  for (const scene of pack.scenes.values()) {
    const where = `scene:${scene.id}`;
    claim(scene.id, where);
    if (scene.lang !== pack.lang) err(where, 'invalid-value', `lang "${scene.lang}" differs from its folder "${pack.lang}"`);
    provenance(where, scene);
    if (!scene.lines?.length) { err(where, 'missing-field', 'a scene needs lines'); continue; }
    const lineIds = new Set<string>();
    for (const l of scene.lines) {
      if (lineIds.has(l.id)) err(`${where}/${l.id}`, 'duplicate-id', `line id "${l.id}" is used twice`);
      lineIds.add(l.id);
      checkLine(where, l, scene.listening);
    }
    for (const c of scene.world?.characters ?? []) if (world && !characters.has(c)) err(where, 'broken-reference', `character "${c}" is not in world.json`);
    if (!scene.checks?.length) err(where, 'missing-field', 'a scene needs at least one comprehension check');
    checkChecks(where, scene.checks ?? [], lineIds);
    checkTasks(where, scene.production ?? [], lineIds);
    for (const id of [...(scene.introduces?.constructions ?? []), ...(scene.represents ?? []), ...(scene.intentional ?? [])]) {
      if (!coverageIds.has(id)) err(where, 'broken-reference', `coverage id "${id}" is not in coverage.json`);
    }
    for (const n of scene.notes ?? []) {
      for (const e of n.explains) if (!coverageIds.has(e)) err(`${where}/${n.id}`, 'broken-reference', `note explains unknown coverage id "${e}"`);
      if (!(n.afterScenes >= 0)) err(`${where}/${n.id}`, 'invalid-value', 'afterScenes must be 0 or more');
    }
  }

  // ── sound steps ──
  for (const s of pack.sounds.values()) {
    const where = `sounds:${s.id}`;
    claim(s.id, where);
    provenance(where, s);
    if (!s.words?.length) err(where, 'missing-field', 'a sound step teaches through words: it needs words');
    const exercised = new Set(s.words.flatMap((w) => featuresOfWord(adapter, pack.lang, w.text)));
    for (const f of s.features) if (!exercised.has(f)) err(where, 'feature-not-exercised', `feature "${f}" is not found in any of the step's words`);
    for (const w of s.words) if (!w.en?.trim()) err(where, 'missing-support', `word "${w.text}" needs its meaning`);
    checkDecodes(where, s.checks);
  }

  // ── path ──
  const steps = pack.path.steps ?? [];
  if (!steps.length) err('path', 'missing-field', 'the path has no steps');
  const stepIds = new Set<string>();
  for (const st of steps) {
    if (stepIds.has(st.id)) err(`path:${st.id}`, 'duplicate-id', `step id "${st.id}" is used twice`);
    stepIds.add(st.id);
    if ((st.kind === 'scene' || st.kind === 'review') && !pack.scenes.has(st.ref ?? '')) err(`path:${st.id}`, 'broken-reference', `scene "${st.ref}" does not exist`);
    if (st.kind === 'sounds' && !pack.sounds.has(st.ref ?? '')) err(`path:${st.id}`, 'broken-reference', `sound step "${st.ref}" does not exist`);
    if (st.kind === 'review' && !st.channel) err(`path:${st.id}`, 'missing-field', 'a review step names its listening channel');
    if (st.kind === 'review' && st.ref && steps.findIndex((x) => x.kind === 'scene' && x.ref === st.ref) > steps.indexOf(st)) err(`path:${st.id}`, 'malformed-path', 'a review comes after the scene it revisits');
  }
  if (steps.length && steps[steps.length - 1].kind !== 'exit') err('path', 'malformed-path', 'the path ends with the exit step');
  for (const sc of pack.scenes.keys()) if (!steps.some((s) => s.ref === sc)) warn(`scene:${sc}`, 'unused', 'this scene is not on the path');
  if (!pack.path.next?.length) warn('path', 'missing-field', 'no GoLearn texts named for after the exit');

  // ── bands and prerequisites, along the path ──
  const cov = pathCoverage(pack, adapter, world);
  const firstSeen = new Map<string, number>();
  for (const c of cov) {
    if (c.kind !== 'scene' || c.sceneIndex === undefined) continue;
    const scene = pack.scenes.get(c.ref!)!;
    const early = c.sceneIndex < cfg.bands.earlyScenes;
    const max = early ? cfg.bands.earlyMaxNew : cfg.bands.laterMaxNew;
    if (c.newItems.length > max) err(`scene:${scene.id}`, 'too-many-new-words', `${c.newItems.length} new words (band: at most ${max} ${early ? 'in an early scene' : 'per scene'}): ${c.newItems.join(', ')}`);
    if (!early && c.coverage < cfg.bands.laterMinCoverage) err(`scene:${scene.id}`, 'coverage-below-band', `only ${Math.round(c.coverage * 100)} % of its words are met earlier on the path (band: ${Math.round(cfg.bands.laterMinCoverage * 100)} %)`);
    if (c.undeclared.length) warn(`scene:${scene.id}`, 'undeclared-new-words', `new on the path but not listed in introduces.words: ${c.undeclared.join(', ')}`);
    for (const id of scene.represents ?? []) {
      const entry = pack.coverage.find((e) => e.id === id);
      for (const p of entry?.prerequisites ?? []) {
        const at = firstSeen.get(p);
        if ((at === undefined || at > c.sceneIndex) && !(scene.represents ?? []).includes(p) && !(scene.intentional ?? []).includes(id)) {
          err(`scene:${scene.id}`, 'prerequisite-missing', `"${id}" appears before its prerequisite "${p}" (mark it intentional if it is used as a chunk on purpose)`);
        }
      }
      if (!firstSeen.has(id)) firstSeen.set(id, c.sceneIndex);
    }
  }

  // ── deliberate recurrence: a word met only once on the whole path is not being acquired ──
  {
    const counts = new Map<string, number>();
    for (const st of steps) {
      // a review re-presents its scene, so its words recur
      const sc = (st.kind === 'scene' || st.kind === 'review') && st.ref ? pack.scenes.get(st.ref) : undefined;
      const sd = st.kind === 'sounds' && st.ref ? pack.sounds.get(st.ref) : undefined;
      for (const l of sc ? sc.lines : sd ? sd.words : []) for (const w of wordsOf(adapter, pack.lang, l.text)) {
        if (isName(w.normalized) || /^\p{N}+$/u.test(w.normalized)) continue;
        const k = itemKey(w);
        counts.set(k, (counts.get(k) ?? 0) + 1);
      }
    }
    const once = [...counts].filter(([, n]) => n === 1).map(([k]) => k);
    if (once.length) warn('path', 'met-once', `${once.length} word${once.length === 1 ? '' : 's'} met only once on the whole path (recycle them): ${once.join(', ')}`);
  }

  // ── romanization and segmentation must retire ──
  for (const [name, pol] of [['transliteration', cfg.script.transliteration], ['segmentation', cfg.script.segmentation]] as const) {
    if (!pol) continue;
    if (!(pol.retireAfterStep < steps.length - 1)) err('config', 'support-never-retires', `${name} retires after step ${pol.retireAfterStep}, but the path has only ${steps.length} steps: it would never retire`);
  }
  if ((cfg.script.kind === 'devanagari' || cfg.script.kind === 'thai') && !cfg.script.transliteration) err('config', 'support-never-retires', 'a script language needs a romanization fading policy');

  // ── exit forms ──
  if (!pack.exits.size) err('exit', 'missing-field', 'no exit form');
  const pathLines = new Set([...pack.scenes.values()].flatMap((s) => s.lines.map((l) => normalizeAnswer(pack.lang, l.text))));
  for (const form of pack.exits.values()) {
    const where = `exit:${form.id}`;
    claim(form.id, where);
    provenance(where, form);
    const ids = new Set<string>();
    for (const l of [...form.reading.lines, ...form.listening.lines]) {
      checkLine(where, l, form.listening.lines.includes(l));
      ids.add(l.id);
      if (pathLines.has(normalizeAnswer(pack.lang, l.text))) err(`${where}/${l.id}`, 'not-unseen', `"${l.text}" is also a line on the path: the exit must use unseen material`);
    }
    checkChecks(`${where}/reading`, form.reading.checks, new Set(form.reading.lines.map((l) => l.id)));
    checkChecks(`${where}/listening`, form.listening.checks, new Set(form.listening.lines.map((l) => l.id)));
    checkTasks(`${where}/writing`, form.writing, ids);
    if (!form.speaking?.length) err(where, 'missing-field', 'the exit needs a spoken response');
    if (cfg.exit.decoding && !form.decoding?.length) err(where, 'missing-field', `${cfg.name} exit needs decoding items`);
    if (form.decoding?.length) {
      checkDecodes(`${where}/decoding`, form.decoding);
      // unseen: an exit decoding word must not be a word taught in a sound step
      const taught = new Set([...pack.sounds.values()].flatMap((s) => [...s.words.map((w) => w.text), ...s.checks.map((c) => c.word)]));
      for (const d of form.decoding) if (d.kind !== 'segment' && taught.has(d.word)) err(`${where}/decoding/${d.id}`, 'not-unseen', `"${d.word}" was taught in a sound step: an exit decoding word must be unseen`);
    }
    if (form.writing.length < cfg.exit.writing.minAccepted) err(where, 'invalid-value', 'fewer writing tasks than the criterion requires');
    const ec = exitCoverage(pack, adapter, world, form);
    if (ec.coverage < cfg.bands.exitMinCoverage) err(where, 'coverage-below-band', `only ${Math.round(ec.coverage * 100)} % of its words are met on the path (band ${Math.round(cfg.bands.exitMinCoverage * 100)} %): unknown ${ec.unknown.join(', ')}`);
  }

  if (audioNeeded) warn('audio', 'audio-needed', `${audioNeeded} of ${lines} lines still need a native recording (none exists yet; listening falls back to a computer voice as practice, or to reading)`);
  return issues;
}
