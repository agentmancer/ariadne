/**
 * Hook for fetching and managing conditions data
 */

import { useState, useEffect, useCallback } from 'react';
import { api, Condition, CreateConditionInput, UpdateConditionInput } from '../services/api';

interface UseConditionsReturn {
  conditions: Condition[];
  isLoading: boolean;
  error: string | null;
  refetch: () => Promise<void>;
  createCondition: (data: Omit<CreateConditionInput, 'studyId'>) => Promise<Condition>;
  updateCondition: (id: string, data: UpdateConditionInput) => Promise<Condition>;
  deleteCondition: (id: string) => Promise<void>;
}

export function useConditions(studyId: string | undefined): UseConditionsReturn {
  const [conditions, setConditions] = useState<Condition[]>([]);
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
      const data = await api.getConditions(studyId);
      setConditions(data);
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to fetch conditions';
      setError(message);
    } finally {
      setIsLoading(false);
    }
  }, [studyId]);

  useEffect(() => {
    fetch();
  }, [fetch]);

  const createCondition = async (data: Omit<CreateConditionInput, 'studyId'>) => {
    if (!studyId) throw new Error('Study ID required');
    try {
      const created = await api.createCondition({ ...data, studyId });
      setConditions(prev => [...prev, created]);
      return created;
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to create condition';
      setError(message);
      throw err;
    }
  };

  const updateCondition = async (id: string, data: UpdateConditionInput) => {
    try {
      const updated = await api.updateCondition(id, data);
      setConditions(prev => prev.map(c => c.id === id ? updated : c));
      return updated;
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to update condition';
      setError(message);
      throw err;
    }
  };

  const deleteCondition = async (id: string) => {
    try {
      await api.deleteCondition(id);
      setConditions(prev => prev.filter(c => c.id !== id));
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to delete condition';
      setError(message);
      throw err;
    }
  };

  return { conditions, isLoading, error, refetch: fetch, createCondition, updateCondition, deleteCondition };
}
