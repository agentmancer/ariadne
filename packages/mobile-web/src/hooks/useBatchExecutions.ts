/**
 * Hook for fetching batch execution data
 */

import { useState, useEffect, useCallback } from 'react';
import { api, BatchExecution, PaginatedResponse, QueueStats } from '../services/api';

interface UseBatchExecutionsOptions {
  studyId?: string;
  status?: string;
  page?: number;
  limit?: number;
  autoFetch?: boolean;
  pollInterval?: number; // Poll for updates (ms)
}

interface UseBatchExecutionsReturn {
  batches: BatchExecution[];
  pagination: PaginatedResponse<BatchExecution>['pagination'] | null;
  isLoading: boolean;
  error: string | null;
  refetch: () => Promise<void>;
  pauseBatch: (id: string) => Promise<void>;
  resumeBatch: (id: string) => Promise<void>;
}

export function useBatchExecutions(options: UseBatchExecutionsOptions = {}): UseBatchExecutionsReturn {
  const { studyId, status, page = 1, limit = 20, autoFetch = true, pollInterval } = options;

  const [batches, setBatches] = useState<BatchExecution[]>([]);
  const [pagination, setPagination] = useState<PaginatedResponse<BatchExecution>['pagination'] | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetch = useCallback(async () => {
    setError(null);
    try {
      const response = await api.getBatchExecutions({ studyId, status, page, limit });
      setBatches(response.data);
      setPagination(response.pagination);
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to fetch batch executions';
      setError(message);
    } finally {
      setIsLoading(false);
    }
  }, [studyId, status, page, limit]);

  useEffect(() => {
    if (autoFetch) {
      fetch();
    }
  }, [fetch, autoFetch]);

  // Poll for updates if interval is set
  useEffect(() => {
    if (!pollInterval) return;

    const interval = setInterval(fetch, pollInterval);
    return () => clearInterval(interval);
  }, [fetch, pollInterval]);

  const pauseBatch = async (id: string) => {
    try {
      await api.pauseBatch(id);
      await fetch();
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to pause batch';
      setError(message);
      throw err;
    }
  };

  const resumeBatch = async (id: string) => {
    try {
      await api.resumeBatch(id);
      await fetch();
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to resume batch';
      setError(message);
      throw err;
    }
  };

  return { batches, pagination, isLoading, error, refetch: fetch, pauseBatch, resumeBatch };
}

export function useBatchExecution(id: string | undefined) {
  const [batch, setBatch] = useState<BatchExecution | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetch = useCallback(async () => {
    if (!id) return;
    setIsLoading(true);
    setError(null);
    try {
      const data = await api.getBatchExecution(id);
      setBatch(data);
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to fetch batch execution';
      setError(message);
    } finally {
      setIsLoading(false);
    }
  }, [id]);

  useEffect(() => {
    fetch();
  }, [fetch]);

  return { batch, isLoading, error, refetch: fetch };
}

export function useQueueStats(pollInterval?: number) {
  const [stats, setStats] = useState<QueueStats | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetch = useCallback(async () => {
    try {
      const data = await api.getQueueStats();
      setStats(data);
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to fetch queue stats';
      setError(message);
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    fetch();
  }, [fetch]);

  useEffect(() => {
    if (!pollInterval) return;

    const interval = setInterval(fetch, pollInterval);
    return () => clearInterval(interval);
  }, [fetch, pollInterval]);

  return { stats, isLoading, error, refetch: fetch };
}
