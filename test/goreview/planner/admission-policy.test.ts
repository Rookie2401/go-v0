import { describe, expect, it } from 'vitest';
import { workloadAwareAdmission } from '../../../packages/goreview/src/planner/admission-policy';

describe('workload-aware admission', () => {
  const base = { hardNewLimit:10, sessionMinutes:10, dueSeconds:0, upcomingLearningSeconds:0, averageNewSeconds:25 };
  it('always preserves a zero automatic-new limit', () => {
    expect(workloadAwareAdmission({ ...base, hardNewLimit:0 }).limit).toBe(0);
  });
  it('allows fewer introductions when due workload consumes the session', () => {
    const light = workloadAwareAdmission(base);
    const heavy = workloadAwareAdmission({ ...base, dueSeconds:450 });
    expect(heavy.limit).toBeLessThan(light.limit);
    expect(workloadAwareAdmission({ ...base, dueSeconds:600 }).limit).toBe(0);
  });
  it('reserves room for upcoming learning steps and scheduled reviews', () => {
    const light = workloadAwareAdmission({ ...base, sessionMinutes:2 });
    const returnDue = workloadAwareAdmission({ ...base, sessionMinutes:2, upcomingLearningSeconds:120 });
    expect(returnDue.limit).toBeLessThan(light.limit);
    expect(workloadAwareAdmission({ ...base, sessionMinutes:2, upcomingReviewSeconds:120 }).limit).toBe(0);
  });
  it('keeps flexible time separate from daily/session card caps', () => {
    expect(workloadAwareAdmission({ ...base, sessionMinutes:0, hardNewLimit:4 })).toMatchObject({ limit:4, workloadLimitSeconds:0 });
  });
  it('offers a fixed-admission comparison while retaining the hard new-card cap', () => {
    expect(workloadAwareAdmission({ ...base, dueSeconds:600, policy:{ mode:'fixed' } })).toMatchObject({ limit:10 });
    expect(workloadAwareAdmission({ ...base, hardNewLimit:0, dueSeconds:600, policy:{ mode:'fixed' } })).toMatchObject({ limit:0 });
  });
});
