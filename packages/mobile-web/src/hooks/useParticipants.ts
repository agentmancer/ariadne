/**
 * Hook for fetching participants data
 */

import { useState, useEffect, useCallback } from 'react';
import { api, Participant, PaginatedResponse } from '../services/api';

interface UseParticipantsOptions {
  studyId?: string;
  state?: string;
  actorType?: 'HUMAN' | 'SYNTHETIC';
  page?: number;
  limit?: number;
  autoFetch?: boolean;
}

interface UseParticipantsReturn {
  participants: Participant[];
  pagination: PaginatedResponse<Participant>['pagination'] | null;
  isLoading: boolean;
  error: string | null;
  refetch: () => Promise<void>;
}

export function useParticipants(options: UseParticipantsOptions = {}): UseParticipantsReturn {
  const { studyId, state, actorType, page = 1, limit = 50, autoFetch = true } = options;

  const [participants, setParticipants] = useState<Participant[]>([]);
  const [pagination, setPagination] = useState<PaginatedResponse<Participant>['pagination'] | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetch = useCallback(async () => {
    setIsLoading(true);
    setError(null);
    try {
      const response = await api.getParticipants({ studyId, state, actorType, page, limit });
      setParticipants(response.data);
      setPagination(response.pagination);
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to fetch participants';
      setError(message);
    } finally {
      setIsLoading(false);
    }
  }, [studyId, state, actorType, page, limit]);

  useEffect(() => {
    if (autoFetch) {
      fetch();
    }
  }, [fetch, autoFetch]);

  return { participants, pagination, isLoading, error, refetch: fetch };
}

// Helper to get counts by actor type
export function useParticipantCounts(studyId?: string) {
  const { participants, isLoading } = useParticipants({ studyId, limit: 1000 });

  const counts = {
    total: participants.length,
    human: participants.filter(p => p.actorType === 'HUMAN').length,
    synthetic: participants.filter(p => p.actorType === 'SYNTHETIC').length,
    byState: {
      enrolled: participants.filter(p => p.state === 'ENROLLED').length,
      active: participants.filter(p => p.state === 'ACTIVE').length,
      complete: participants.filter(p => p.state === 'COMPLETE').length,
      withdrawn: participants.filter(p => p.state === 'WITHDRAWN').length,
    },
  };

  return { counts, isLoading };
}
