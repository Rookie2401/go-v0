import { useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import type { Stage0Overview } from '../../core';

/** The next step after this one, or the path page. */
export function useNextStep(overview: Stage0Overview, stepId: string): () => void {
  const navigate = useNavigate();
  return useCallback(() => {
    const i = overview.steps.findIndex((s) => s.step.id === stepId);
    const next = overview.steps.slice(i + 1).find((s) => s.status !== 'secure');
    navigate(next ? `/start/${next.step.id}` : '/start');
  }, [overview, stepId, navigate]);
}

