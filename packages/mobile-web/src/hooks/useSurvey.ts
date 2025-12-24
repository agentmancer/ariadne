/**
 * Hook for fetching and managing a single survey
 */

import { useState, useEffect, useCallback } from 'react';
import { api, Survey, UpdateSurveyInput } from '../services/api';

interface UseSurveyReturn {
  survey: Survey | null;
  isLoading: boolean;
  error: string | null;
  refetch: () => Promise<void>;
  updateSurvey: (data: UpdateSurveyInput) => Promise<Survey>;
}

export function useSurvey(id: string | undefined): UseSurveyReturn {
  const [survey, setSurvey] = useState<Survey | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetch = useCallback(async () => {
    if (!id) {
      setIsLoading(false);
      return;
    }
    setIsLoading(true);
    setError(null);
    try {
      const data = await api.getSurvey(id);
      setSurvey(data);
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to fetch survey';
      setError(message);
    } finally {
      setIsLoading(false);
    }
  }, [id]);

  useEffect(() => {
    fetch();
  }, [fetch]);

  const updateSurvey = async (data: UpdateSurveyInput) => {
    if (!id) throw new Error('Survey ID required');
    try {
      const updated = await api.updateSurvey(id, data);
      setSurvey(updated);
      return updated;
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to update survey';
      setError(message);
      throw err;
    }
  };

  return { survey, isLoading, error, refetch: fetch, updateSurvey };
}
