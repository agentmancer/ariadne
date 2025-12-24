/**
 * Hook for fetching and managing surveys data
 */

import { useState, useEffect, useCallback } from 'react';
import { api, Survey, CreateSurveyInput } from '../services/api';

interface UseSurveysReturn {
  surveys: Survey[];
  isLoading: boolean;
  error: string | null;
  refetch: () => Promise<void>;
  createSurvey: (data: Omit<CreateSurveyInput, 'studyId'>) => Promise<Survey>;
  deleteSurvey: (id: string) => Promise<void>;
}

export function useSurveys(studyId: string | undefined): UseSurveysReturn {
  const [surveys, setSurveys] = useState<Survey[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetch = useCallback(async () => {
    if (!studyId) {
      setIsLoading(false);
      return;
    }
    setIsLoading(true);
    setError(null);
    try {
      const data = await api.getSurveys(studyId);
      setSurveys(data);
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to fetch surveys';
      setError(message);
    } finally {
      setIsLoading(false);
    }
  }, [studyId]);

  useEffect(() => {
    fetch();
  }, [fetch]);

  const createSurvey = async (data: Omit<CreateSurveyInput, 'studyId'>) => {
    if (!studyId) throw new Error('Study ID required');
    try {
      const created = await api.createSurvey({ ...data, studyId });
      setSurveys(prev => [...prev, created]);
      return created;
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to create survey';
      setError(message);
      throw err;
    }
  };

  const deleteSurvey = async (id: string) => {
    try {
      await api.deleteSurvey(id);
      setSurveys(prev => prev.filter(s => s.id !== id));
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to delete survey';
      setError(message);
      throw err;
    }
  };

  return { surveys, isLoading, error, refetch: fetch, createSurvey, deleteSurvey };
}
