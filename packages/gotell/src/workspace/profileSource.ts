/**
 * The profile builder's view of the learner: item knowledge from the Repository, the learner's own writing events and the
 * stated explanation depth. Read-only, and nothing here looks at a review schedule.
 */
import type { ProfileSource } from '../types';
import type { TellHost } from './port';

export function profileSourceFor(host: TellHost): ProfileSource {
  const lang = host.identity.languageId;
  return {
    async knowledge(unitIds) {
      const r = await host.api.knowledge(unitIds);
      return r.ok ? r.data.knowledge : [];
    },
    events: () => host.events(),
    async preferences() {
      try {
        const r = await host.api.preferences(lang);
        return r.ok ? { explanationDepth: r.data.preferences.explanationDepth.value } : undefined;
      } catch { return undefined; }
    },
  };
}
