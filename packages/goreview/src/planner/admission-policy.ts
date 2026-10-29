/** Capacity-aware admission, deliberately separate from the hard session and daily card limits. */
export interface WorkloadAdmissionInput {
  hardNewLimit: number;
  sessionMinutes: number;
  dueSeconds: number;
  upcomingLearningSeconds: number;
  upcomingReviewSeconds?: number;
  averageNewSeconds: number;
  policy?: Partial<WorkloadAdmissionPolicy>;
}
export interface WorkloadAdmissionPolicy { mode: 'workload-aware' | 'fixed'; expectedReturnRatio: number }
export const DEFAULT_WORKLOAD_ADMISSION_POLICY: Readonly<WorkloadAdmissionPolicy> = Object.freeze({ mode:'workload-aware', expectedReturnRatio:0.35 });
export interface WorkloadAdmissionDecision {
  limit: number;
  workloadLimitSeconds: number;
  reservedSeconds: number;
  remainingSeconds: number;
  expectedReturnRatio: number;
  reason: string;
}
const safeCount = (n: number): number => Number.isFinite(n) ? Math.max(0, Math.floor(n)) : 0;
const safeSeconds = (n: number): number => Number.isFinite(n) ? Math.max(0, n) : 0;

export function workloadAwareAdmission(input: WorkloadAdmissionInput): WorkloadAdmissionDecision {
  const hard = safeCount(input.hardNewLimit);
  const timeLimit = input.sessionMinutes === 0 ? 0 : Number.isFinite(input.sessionMinutes) ? Math.max(0, input.sessionMinutes * 60) : 0;
  const dueSeconds = safeSeconds(input.dueSeconds);
  const upcomingLearningSeconds = safeSeconds(input.upcomingLearningSeconds);
  const upcomingReviewSeconds = safeSeconds(input.upcomingReviewSeconds ?? 0);
  const averageNewSeconds = Math.max(1, safeSeconds(input.averageNewSeconds));
  const requestedMode = input.policy?.mode;
  const mode = requestedMode === 'fixed' ? 'fixed' : 'workload-aware';
  const requestedRatio = input.policy?.expectedReturnRatio;
  const expectedReturnRatio = Number.isFinite(requestedRatio) ? Math.max(0, Math.min(1, requestedRatio!)) : DEFAULT_WORKLOAD_ADMISSION_POLICY.expectedReturnRatio;
  const reservedSeconds = dueSeconds + upcomingLearningSeconds + upcomingReviewSeconds;
  if (hard === 0) return { limit: 0, workloadLimitSeconds: timeLimit, reservedSeconds,
    remainingSeconds: timeLimit === 0 ? 0 : Math.max(0, timeLimit - reservedSeconds), expectedReturnRatio,
    reason: 'Automatic new-card limit is zero.' };
  if (timeLimit === 0) return { limit: hard, workloadLimitSeconds: 0, reservedSeconds, remainingSeconds: 0, expectedReturnRatio,
    reason: 'Flexible session time; daily and session new-card limits still apply.' };
  const remainingSeconds = Math.max(0, timeLimit - reservedSeconds);
  if (mode === 'fixed') return { limit: hard, workloadLimitSeconds: timeLimit, reservedSeconds, remainingSeconds, expectedReturnRatio,
    reason: 'Fixed-admission comparison: configured session and daily card caps apply; due-workload throttling is disabled.' };
  const secondsPerAdmission = averageNewSeconds * (1 + expectedReturnRatio);
  const byWorkload = Math.floor(remainingSeconds / secondsPerAdmission);
  const limit = Math.min(hard, byWorkload);
  return { limit, workloadLimitSeconds: timeLimit, reservedSeconds, remainingSeconds, expectedReturnRatio,
    reason: limit < hard
      ? `New admissions are capped at ${limit} after reserving ${Math.ceil(reservedSeconds)} seconds for due and upcoming scheduled work plus ${Math.round(expectedReturnRatio * 100)}% expected short-term returns.`
      : 'Available workload capacity supports the remaining hard new-card allowance.' };
}
