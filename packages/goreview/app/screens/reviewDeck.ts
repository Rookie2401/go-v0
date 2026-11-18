/** Review Deck with scheduled reviews, delayed reassessment and study material. */
import type { RemediationCandidate, RemediationReason } from '../../src/planner/remediation';
import { buildRemediationStudiedEvent } from '../../src/planner/remediation';
import type { Exercise, UnitFacts } from '../../src/types';
import type { AppContext } from '../context';
import { append, button, clear, embedTarget, h, p, setStatus, statusLine } from '../dom';
import { unitLabel } from '../format';
import { beginSession, currentReviewModel, PRESS_WAIT_MS, type ReviewModel } from '../workspace';
import type { DeckItem } from '../../src/types';
import { effectiveRemediation, planReviewDeck, releaseHoldOut } from '../deckModel';
import { isAlphabetUnit } from '../alphabetDeck';
import { isClassUnit } from '../classEssentials';

/** The built-in deck a class unit belongs to: the page names it and marks the row with it. */
const builtinOf = (unitId: string): { name: string; source: string; what: string } => (isAlphabetUnit(unitId)
  ? { name: 'Alphabet', source: 'alphabet', what: 'card' } : { name: 'Class Essentials', source: 'class-essentials', what: 'phrase' });
import { nextChangeAt } from '../freshness';
import type { View } from './view';

const when = (at: string): string => new Date(at).toLocaleString();
const REASON_LABEL: Record<RemediationReason, string> = {
  'failed-retrieval': 'Failed retrieval',
  'productive-retrieval-difficulty': 'Productive recall difficulty',
  'morphological-difficulty': 'Morphological form difficulty',
  'contextual-difficulty': 'Contextual application difficulty',
  'listening-difficulty': 'Listening discrimination difficulty',
  'repeated-failure': 'Repeated unsuccessful retrieval',
};

async function studyMaterial(ctx: AppContext, item: DeckItem, api: import('../../../repository-service/src/api').RepositoryApi, now: string) {
  const needsAudio = item.family.startsWith('audio-');
  const audio = needsAudio ? await ctx.audio() : undefined;
  const assessment = audio?.source();
  if (needsAudio && !assessment) return { unavailable: 'Audio study material is unavailable in this browser.' } as const;
  return ctx.engine.repairMaterial?.({ item, api, now, ...(assessment ? { assessment } : {}) });
}

export async function render(el: HTMLElement, ctx: AppContext, view: View): Promise<void> {
  const root = h('section', { id: 'review-deck', 'aria-labelledby': 'review-deck-heading' });
  el.append(h('p', {}, h('a', { href: '#/review' }, '← GoReview')),
    h('h2', { id: 'review-deck-heading' }, 'Review Deck'), root);
  const controls = h('div', { class: 'row' });
  const content = h('div', {});
  const status = statusLine();
  root.append(controls, status, content);
  let wake: number | undefined;
  let starting = false;
  const studying = new Set<string>();
  let paintId = 0;
  view.onDispose(() => { if (wake !== undefined) ctx.deps.win.clearTimeout(wake); });

  async function paint(quiet = false): Promise<void> {
    const paintVersion = ++paintId;
    const model = await currentReviewModel(ctx, quiet ? { noRefresh: true } : {});
    if (!view.alive() || paintVersion !== paintId) return;
    if (wake !== undefined) ctx.deps.win.clearTimeout(wake);
    if (!model) { controls.replaceChildren(p('Choose a language to continue.')); content.replaceChildren(); return; }
    const next = nextChangeAt(model);
    if (next) wake = ctx.deps.win.setTimeout(() => { void paint(true).catch(() => {}); }, Math.max(25, Date.parse(next) - ctx.deps.now().getTime() + 25)) as unknown as number;
    const plan = await planReviewDeck(ctx, model);
    if (!view.alive() || paintVersion !== paintId) return;
    const start = button('Start review', () => {
      if (starting) return;
      starting = start.disabled = true;
      void (async () => {
        const current = await currentReviewModel(ctx, { waitMs: PRESS_WAIT_MS });
        if (!current || !view.alive()) return;
        const plan = await planReviewDeck(ctx, current);
        if (!view.alive()) return;
        if (!plan.items.length) { setStatus(status, 'No cards are ready for review.', 'info'); await paint(true); return; }
        const result = await beginSession(ctx, current, { plan });
        if (!result.ok) { setStatus(status, result.message, 'error'); return; }
        const { learnerId, languageId } = current.identity;
        await releaseHoldOut(ctx, learnerId, languageId, { preserveAdded: true });
        ctx.run.active = result.run;
        if (view.alive()) ctx.go('review/session');
      })().catch(error => setStatus(status, error instanceof Error ? error.message : String(error), 'error')).finally(() => {
        starting = false;
        const activeStart = controls.querySelector<HTMLButtonElement>('#start-deck-review');
        if (activeStart) activeStart.disabled = false;
      });
    }, { id: 'start-deck-review', class: 'btn primary' });
    start.disabled = starting;
    const wasFocused = controls.contains(ctx.deps.doc.activeElement);
    controls.replaceChildren(plan.items.length ? start : p(model.schedulerIssue ?? 'No cards are ready for review.', 'muted'));
    if (wasFocused && !start.disabled && start.isConnected) start.focus({ preventScroll: true });
    const allItems = [...model.deck, ...(model.classDeck ?? [])];
    const candidates = effectiveRemediation(model).all;
    const repairItems = allItems.filter(item => !!item.invalidatedAt);
    const tag = model.identity.varietyId ?? model.identity.languageId;
    const rows = candidates.length ? h('section', { class: 'card', 'aria-labelledby': 'review-study-heading' },
      h('h3', { id: 'review-study-heading' }, 'Study missed items'),
      p('After you mark an item studied, it can return for review in ten minutes.', 'muted'),
      h('ul', { class: 'candidates', id: 'remediation-backlog' }, ...candidates.map(c => candidateRow(ctx, model, c, tag)))) : null;
    const repairs =
      repairItems.length ? h('section', { id: 'facts-repair-backlog', class: 'card' }, h('h3', {}, 'Questions awaiting facts repair'), p('These answer keys were invalidated and are withheld from assessment. They are not counted as learner weaknesses.', 'muted'),
        ...await Promise.all(repairItems.map(async item => {
          let facts: UnitFacts | undefined;
          try { const { api } = await ctx.api(); facts = await ctx.engine.factsFor?.(item.unitId, model.identity.languageId, api); } catch { /* repair stays unavailable */ }
          return h('article', { class: 'remediation-item', 'data-item-id': item.itemId, 'data-source': isClassUnit(item.unitId) ? builtinOf(item.unitId).source : 'vocabulary' }, h('h4', {}, unitLabel(item.unitId)),
            p('Invalidated answer key · current facts must be verified, different, and support a valid rebuilt exercise.', 'muted'),
            isClassUnit(item.unitId) ? p(`${builtinOf(item.unitId).name} uses provisional, owner-authored ${builtinOf(item.unitId).what} facts. Those facts do not meet the verified-facts repair threshold, so this invalidated card remains blocked until independently verified facts are available.`, 'muted') : null,
            facts?.status === 'verified' && facts.unit.status === 'verified' ? p('Verified current facts are available for repair review.') : p('Verified current facts are unavailable; this question remains blocked.', 'muted'),
            await repairControl(ctx, model, item));
        }))) : null;
    if (!view.alive() || paintVersion !== paintId) return;
    const openItems = new Set(Array.from(content.querySelectorAll<HTMLElement>('.remediation-item:has(details[open])'), row => row.dataset.itemId));
    clear(content);
    append(content, [rows, repairs]);
    for (const row of content.querySelectorAll<HTMLElement>('.remediation-item')) {
      const details = row.querySelector<HTMLDetailsElement>('details');
      if (details && openItems.has(row.dataset.itemId)) details.open = true;
    }
  }

  function candidateRow(ctx: AppContext, model: ReviewModel, c: RemediationCandidate, tag: string): HTMLElement {
    const item = [...model.deck, ...(model.classDeck ?? [])].find(i => i.itemId === c.itemId)!;
    const classSource = isClassUnit(item.unitId);
    const section = h('li', { class: 'candidate remediation-item', 'data-item-id': c.itemId, 'data-source': classSource ? builtinOf(item.unitId).source : 'vocabulary' },
      h('p', { class: 'muted' }, classSource ? builtinOf(item.unitId).name : 'My vocabulary'),
      h('h4', { lang: tag }, unitLabel(item.unitId)));
    const details = h('details', {}, h('summary', {}, 'Study material'),
      p(`${(c.reasons ?? ['failed-retrieval']).map(reason => REASON_LABEL[reason]).join(' · ')} · ${c.failures} recent Again response(s) · unresolved after ${when(c.failureEventId ? model.events.find(e => e.id === c.failureEventId)?.at ?? model.now : model.now)}`, 'muted'),
      p('These labels describe the recorded question type and result; they do not diagnose why an answer was difficult.', 'help'));
    if (c.repairRequired) details.append(p('Five or more recent Again responses. Study the material and return for a review.', 'notice'));
    const materialContent = h('div', {});
    details.append(materialContent);
    let loaded = false;
    details.addEventListener('toggle', () => {
      if (!details.hasAttribute('open') || loaded) return;
      loaded = true;
      materialContent.append(p('Loading study material…', 'muted'));
      void loadMaterial();
    });

    async function loadMaterial(): Promise<void> {
      let facts: UnitFacts | undefined;
      let exercise: Exercise | undefined;
      let factsError = '';
      try {
        const { api } = await ctx.api();
        const material = await studyMaterial(ctx, item, api, model.now);
        if (material && 'unavailable' in material) factsError = material.unavailable;
        else if (material) {
          try { facts = material.facts; exercise = material.exercise; }
          finally { material.release(); }
        }
      }
      catch (e) { factsError = e instanceof Error ? e.message : String(e); }
      if (!view.alive() || !details.isConnected) return;
      clear(materialContent);
      if (facts) {
        if (facts.glosses?.length) materialContent.append(h('p', {}, h('strong', {}, 'Meaning: '), facts.glosses[0], facts.glossAttribution ? ` (${facts.glossAttribution})` : ''));
        if (facts.features && Object.keys(facts.features).length) materialContent.append(h('p', {}, h('strong', {}, 'Form: '), Object.entries(facts.features).map(([k,v]) => `${k} ${v}`).join(' · ')));
        if (facts.constructionExplanation) materialContent.append(h('p', {}, h('strong', {}, 'Explanation: '), facts.constructionExplanation));
        for (const [feature, explanation] of Object.entries(facts.featureExplanations ?? {})) materialContent.append(p(`${feature}: ${explanation}`));
        if (exercise?.answerKey.explanation) materialContent.append(h('p', {}, h('strong', {}, 'Explanation: '), ...embedTarget(exercise.answerKey.explanation, [unitLabel(item.unitId)], tag)));
        const examples = [...new Map((facts.exampleSentences ?? [])
          .filter(example => example.source === 'pack-validation' || example.source === 'pack-tutorial')
          .map(example => [example.text.trim(), example])).values()];
        if (examples.length) {
          materialContent.append(h('h5', {}, 'Pack examples'));
          for (const example of examples.slice(0, 3)) materialContent.append(h('blockquote', {}, h('p', { lang: tag }, example.text), p(`Source: ${example.source}`, 'muted')));
        }
      } else materialContent.append(p(factsError || 'Verified study material is not available for this item right now.', 'muted'));
      const study = details.querySelector<HTMLButtonElement>('[data-action="mark-studied"]');
      if (study && facts) study.disabled = false;
    }
    if (c.needsStudy && !c.studiedAt) {
      const study = button('Mark studied', () => {
        if (studying.has(item.itemId)) return;
        studying.add(item.itemId);
        study.disabled = true;
        void act(async () => {
          const current = await currentReviewModel(ctx, { waitMs: PRESS_WAIT_MS });
          if (!current) throw new Error('Choose a language first.');
          const fresh = effectiveRemediation(current).all.find(row => row.itemId === c.itemId);
          const currentItem = [...current.deck, ...(current.classDeck ?? [])].find(row => row.itemId === c.itemId);
          if (!fresh || fresh.failureEventId !== c.failureEventId || !fresh.needsStudy || !currentItem)
            throw new Error('This item changed. Check its current study material.');
          const { api } = await ctx.api();
          const material = await studyMaterial(ctx, currentItem, api, current.now);
          if (!material || 'unavailable' in material) throw new Error(material?.unavailable ?? 'Usable study material is unavailable.');
          try {
            const ectx = await ctx.eventContext();
            if (!ectx) throw new Error('A learner and language are required to record study.');
            const event = buildRemediationStudiedEvent({ ...ectx, at: ectx.now, itemId: item.itemId, failureEventId: fresh.failureEventId });
            const result = await ctx.record([event]);
            if (result.refused.length) throw new Error(result.refused[0].issues.join('; '));
          } finally { material.release(); }
          await paint();
        }).finally(() => {
          studying.delete(item.itemId);
          study.disabled = false;
        });
      }, { class: 'btn', 'data-action': 'mark-studied', 'aria-label': `Mark studied: ${unitLabel(item.unitId)}` });
      study.disabled = true;
      details.append(study);
    } else if (!c.ready) {
      section.append(p(`Studied ${when(c.studiedAt ?? model.now)}. Available for review at ${when(c.readyAt ?? model.now)}.`, 'muted'));
    } else {
      section.append(p('Ready to review.', 'muted'));
    }
    section.append(details);
    return section;
  }

  async function repairControl(ctx: AppContext, model: ReviewModel, item: DeckItem): Promise<HTMLElement> {
    const box = h('details', { class: 'card', 'data-action': 'repair-facts' }, h('summary', {}, 'Verify changed facts and repair this question'),
      p('The old answer key remains withheld. This repair can proceed only when current validated facts differ from the facts behind the invalidated answer key and a valid exercise can be rebuilt.', 'muted'));
    const invalidation = model.events.find(e => e.id === item.invalidatedBy && e.kind === 'ReviewItemInvalidated');
    const repair = button('Check facts and repair', () => void act(async () => {
      const current = await currentReviewModel(ctx, { waitMs: PRESS_WAIT_MS });
      if (!current) throw new Error('Choose a language first.');
      const currentItem = [...current.deck, ...(current.classDeck ?? [])].find(x => x.itemId === item.itemId);
      const currentInvalidation = currentItem?.invalidatedBy ? current.events.find(e => e.id === currentItem.invalidatedBy && e.kind === 'ReviewItemInvalidated') : undefined;
      const { api } = await ctx.api();
      if (!currentItem || !currentInvalidation) throw new Error('The invalidation is unavailable.');
      const material = await studyMaterial(ctx, currentItem, api, current.now);
      if (!material || 'unavailable' in material) throw new Error(material?.unavailable ?? 'Verified current facts are unavailable.');
      try {
        const { buildVerifiedFactsRepairEvent } = await import('../../src/scheduler/deck');
        const ectx = await ctx.eventContext();
        if (!ectx) throw new Error('A learner and language are required to repair this question.');
        if (material.facts.status !== 'verified') throw new Error('Current facts are not verified for repair.');
        const { varietyId: _activeVariety, ...learnerScope } = ectx;
        const event = await buildVerifiedFactsRepairEvent({ ...learnerScope, ...(currentItem.varietyId ? { varietyId: currentItem.varietyId } : {}),
          at: ectx.now, producerVersion: ectx.appVersion, item: currentItem, invalidationEvent: currentInvalidation,
          events: current.events, currentFacts: material.facts, validatedExercise: material.exercise });
        const result = await ctx.record([event]);
        if (result.refused.length) throw new Error(result.refused[0].issues.join('; '));
        await paint();
      } finally { material.release(); }
    }), { class: 'btn', 'data-action': 'repair-invalidated' });
    // Stale or missing facts on this paint must not prevent a fresh check after
    // the pack changes. The click path reloads the item, invalidation, and facts.
    repair.disabled = !invalidation;
    box.append(repair);
    return box;
  }

  async function act(run: () => Promise<void>): Promise<void> {
    try { await run(); setStatus(status, 'Saved to the local Repository.', 'ok'); }
    catch (e) { setStatus(status, e instanceof Error ? e.message : String(e), 'error'); }
  }

  let repainting = false;
  let again = false;
  const repaintIfRefreshed = async (): Promise<void> => {
    if (repainting) { again = true; return; }
    repainting = true;
    try { do { again = false; if (!view.alive()) return; await paint(true); } while (again); } catch { /* the page stays as painted */ } finally { repainting = false; }
  };
  view.onDispose(ctx.onData(() => { void repaintIfRefreshed(); }));
  await paint();
}
