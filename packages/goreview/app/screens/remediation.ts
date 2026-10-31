/** Repository-backed study and delayed reassessment for unresolved review failures. */
import type { RemediationCandidate, RemediationReason } from '../../src/planner/remediation';
import { buildRemediationStudiedEvent } from '../../src/planner/remediation';
import type { Exercise, UnitFacts } from '../../src/types';
import type { AppContext } from '../context';
import { append, button, clear, embedTarget, h, p, setStatus, statusLine } from '../dom';
import { unitLabel } from '../format';
import { beginSession, loadReviewModel, type ReviewModel } from '../workspace';
import type { DeckItem } from '../../src/types';
import { effectiveRemediation, planRemediation } from '../deckModel';
import { isClassUnit } from '../classEssentials';
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
  const root = h('section', { id: 'remediation', 'aria-labelledby': 'remediation-h' }); // inside the shell's main, under the shell's h1
  el.append(h('p', {}, h('a', { href: '#/review' }, '← GoReview')), root);
  const status = statusLine();

  async function paint(): Promise<void> {
    const model = await loadReviewModel(ctx);
    if (!view.alive()) return;
    clear(root);
    if (!model) { append(root, [h('h2', { id: 'remediation-h' }, 'Remediation'), p('Choose a language to continue.')]); return; }
    const allItems = [...model.deck, ...(model.classDeck ?? [])];
    const candidates = effectiveRemediation(model).all;
    const repairItems = allItems.filter(item => !!item.invalidatedAt);
    const tag = model.identity.varietyId ?? model.identity.languageId;
    append(root, [h('h2', { id: 'remediation-h' }, 'Remediation'),
      p('Revisit usable facts, examples and an explanation behind an unresolved answer. GoReview validates the material before it can be studied. Studying records a marker only; it does not change review history or scheduling. Reassessment is a separate retrieval after ten minutes.'),
      repairItems.length ? h('section', { id: 'facts-repair-backlog', class: 'card' }, h('h2', {}, 'Questions awaiting facts repair'), p('These answer keys were invalidated and are withheld from assessment. They are not counted as learner weaknesses.', 'muted'),
        ...await Promise.all(repairItems.map(async item => {
          let facts: UnitFacts | undefined;
          try { const { api } = await ctx.api(); facts = await ctx.engine.factsFor?.(item.unitId, model.identity.languageId, api); } catch { /* repair stays unavailable */ }
          return h('article', { class: 'remediation-item', 'data-item-id': item.itemId, 'data-source': isClassUnit(item.unitId) ? 'class-essentials' : 'vocabulary' }, h('h3', {}, unitLabel(item.unitId)),
            p('Invalidated answer key · current facts must be verified, different, and support a valid rebuilt exercise.', 'muted'),
            isClassUnit(item.unitId) ? p('Class Essentials uses provisional, owner-authored phrase facts. Those facts do not meet the verified-facts repair threshold, so this invalidated card remains blocked until independently verified facts are available.', 'muted') : null,
            facts?.status === 'verified' && facts.unit.status === 'verified' ? p('Verified current facts are available for repair review.') : p('Verified current facts are unavailable; this question remains blocked.', 'muted'),
            await repairControl(ctx, model, item));
        }))) : null,
      candidates.length ? h('ul', { class: 'candidates', id: 'remediation-backlog' }, ...await Promise.all(candidates.map(c => candidateRow(ctx, model, c, tag)))) : p('No unresolved remediation items.', 'muted'),
      status]);
  }

  async function candidateRow(ctx: AppContext, model: NonNullable<Awaited<ReturnType<typeof loadReviewModel>>>, c: RemediationCandidate, tag: string): Promise<HTMLElement> {
    const item = [...model.deck, ...(model.classDeck ?? [])].find(i => i.itemId === c.itemId)!;
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
    const classSource = isClassUnit(item.unitId);
    const section = h('li', { class: 'candidate remediation-item', 'data-item-id': c.itemId, 'data-source': classSource ? 'class-essentials' : 'vocabulary' },
      h('p', { class: 'muted' }, classSource ? 'Class Essentials' : 'My vocabulary'),
      h('h3', { lang: tag }, unitLabel(item.unitId)),
      p(`${(c.reasons ?? ['failed-retrieval']).map(reason => REASON_LABEL[reason]).join(' · ')} · ${c.failures} recent Again response(s) · unresolved after ${when(c.failureEventId ? model.events.find(e => e.id === c.failureEventId)?.at ?? model.now : model.now)}`, 'muted'),
      p('These labels describe the recorded question type and result; they do not diagnose why an answer was difficult.', 'help'));
    if (c.repairRequired) section.append(p('Five or more recent Again responses were recorded. Study the verified material, then reassess after the delay. This does not mean the answer key was invalidated.', 'notice'));
    if (facts) {
      if (facts.glosses?.length) section.append(h('p', {}, h('strong', {}, 'Meaning: '), facts.glosses[0], facts.glossAttribution ? ` (${facts.glossAttribution})` : ''));
      if (facts.features && Object.keys(facts.features).length) section.append(h('p', {}, h('strong', {}, 'Form: '), Object.entries(facts.features).map(([k,v]) => `${k} ${v}`).join(' · ')));
      if (facts.constructionExplanation) section.append(h('p', {}, h('strong', {}, 'Explanation: '), facts.constructionExplanation));
      for (const [feature, explanation] of Object.entries(facts.featureExplanations ?? {})) section.append(p(`${feature}: ${explanation}`));
      if (exercise?.answerKey.explanation) section.append(h('p', {}, h('strong', {}, 'Explanation: '), ...embedTarget(exercise.answerKey.explanation, [unitLabel(item.unitId)], tag)));
      const examples = [...new Map((facts.exampleSentences ?? [])
        .filter(example => example.source === 'pack-validation' || example.source === 'pack-tutorial')
        .map(example => [example.text.trim(), example])).values()];
      if (examples.length) {
        section.append(h('h4', {}, 'Pack examples'));
        for (const example of examples.slice(0, 3)) section.append(h('blockquote', {}, h('p', { lang: tag }, example.text), p(`Source: ${example.source}`, 'muted')));
      }
    } else section.append(p(factsError || 'Verified study material is not available for this item right now.', 'muted'));
    if (c.needsStudy && !c.studiedAt) {
      const study = button('Mark studied', () => void act(async () => {
        const current = await loadReviewModel(ctx);
        if (!current) throw new Error('Choose a language first.');
        const fresh = effectiveRemediation(current).all.find(row => row.itemId === c.itemId);
        const currentItem = [...current.deck, ...(current.classDeck ?? [])].find(row => row.itemId === c.itemId);
        if (!fresh || fresh.failureEventId !== c.failureEventId || !fresh.needsStudy || !currentItem)
          throw new Error('This remediation item changed; review the current backlog before studying it.');
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
      }), { class: 'btn', 'data-action': 'mark-studied', 'aria-label': `Mark studied: ${unitLabel(item.unitId)}` });
      section.append(study);
    } else if (!c.ready) {
      section.append(p(`Studied ${when(c.studiedAt ?? model.now)}. Reassessment becomes available at ${when(c.readyAt ?? model.now)}; no waiting is required, and GoReview keeps the timing for later.`, 'muted'));
    } else {
      section.append(p(`Studied ${when(c.studiedAt ?? model.now)} · delayed reassessment ready.`, 'muted'));
      section.append(button('Begin delayed reassessment', () => void act(async () => {
        const current = await loadReviewModel(ctx);
        if (!current) throw new Error('Choose a language first.');
        const plan = await planRemediation(ctx, current, effectiveRemediation(current).all.filter(x => x.itemId === c.itemId));
        if (!plan.items.length) throw new Error('This item is no longer eligible for reassessment.');
        const result = await beginSession(ctx, current, { plan });
        if (!result.ok) throw new Error(result.message);
        ctx.run.active = result.run; ctx.go('review/session');
      }), { class: 'btn primary', 'data-action': 'begin-reassessment' }));
    }
    return section;
  }

  async function repairControl(ctx: AppContext, model: ReviewModel, item: DeckItem): Promise<HTMLElement> {
    const box = h('details', { class: 'card', 'data-action': 'repair-facts' }, h('summary', {}, 'Verify changed facts and repair this question'),
      p('The old answer key remains withheld. This repair can proceed only when current validated facts differ from the facts behind the invalidated answer key and a valid exercise can be rebuilt.', 'muted'));
    const invalidation = model.events.find(e => e.id === item.invalidatedBy && e.kind === 'ReviewItemInvalidated');
    const repair = button('Check facts and repair', () => void act(async () => {
      const current = await loadReviewModel(ctx);
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

  await paint();
}
