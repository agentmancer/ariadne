/**
 * Hook for fetching studies data
 */

import { useState, useEffect, useCallback } from 'react';
import { api, Study, PaginatedResponse } from '../services/api';

interface UseStudiesOptions {
  projectId?: string;
  status?: string;
  page?: number;
  limit?: number;
  autoFetch?: boolean;
}

interface UseStudiesReturn {
  studies: Study[];
  pagination: PaginatedResponse<Study>['pagination'] | null;
  isLoading: boolean;
  error: string | null;
  refetch: () => Promise<void>;
}

export function useStudies(options: UseStudiesOptions = {}): UseStudiesReturn {
  const { projectId, status, page = 1, limit = 20, autoFetch = true } = options;

  const [studies, setStudies] = useState<Study[]>([]);
  const [pagination, setPagination] = useState<PaginatedResponse<Study>['pagination'] | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetch = useCallback(async () => {
    setIsLoading(true);
    setError(null);
    try {
      const response = await api.getStudies({ projectId, status, page, limit });
      setStudies(response.data);
      setPagination(response.pagination);
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to fetch studies';
      setError(message);
    } finally {
      setIsLoading(false);
    }
  }, [projectId, status, page, limit]);

  useEffect(() => {
    if (autoFetch) {
      fetch();
    }
  }, [fetch, autoFetch]);

  return { studies, pagination, isLoading, error, refetch: fetch };
}

export function useStudy(id: string | undefined) {
  const [study, setStudy] = useState<Study | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetch = useCallback(async () => {
    if (!id) return;
    setIsLoading(true);
    setError(null);
    try {
      const data = await api.getStudy(id);
      setStudy(data);
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to fetch study';
      setError(message);
    } finally {
      setIsLoading(false);
    }
  }, [id]);

  useEffect(() => {
    fetch();
  }, [fetch]);

  const updateStatus = async (status: Study['status']) => {
    if (!id) return;
    try {
      const updated = await api.updateStudyStatus(id, status);
      setStudy(updated);
      return updated;
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to update status';
      setError(message);
      throw err;
    }
  };

  return { study, isLoading, error, refetch: fetch, updateStatus };
}
