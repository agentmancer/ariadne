/**
 * Unit tests for useSurveys hook
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderHook, waitFor, act } from '@testing-library/react';
import { useSurveys } from '../hooks/useSurveys';
import { api } from '../services/api';

// Mock the API module
vi.mock('../services/api', () => ({
  api: {
    getSurveys: vi.fn(),
    createSurvey: vi.fn(),
    deleteSurvey: vi.fn(),
  },
}));

describe('useSurveys', () => {
  const mockSurveys = [
    { id: '1', name: 'Pre-test Survey', studyId: 'study-1', timing: 'PRE_STUDY' as const, questions: [], createdAt: '2024-01-01', updatedAt: '2024-01-01' },
    { id: '2', name: 'Post-test Survey', studyId: 'study-1', timing: 'EXIT' as const, questions: [], createdAt: '2024-01-01', updatedAt: '2024-01-01' },
  ];

  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('Initial fetch', () => {
    it('fetches surveys when studyId is provided', async () => {
      vi.mocked(api.getSurveys).mockResolvedValue(mockSurveys);

      const { result } = renderHook(() => useSurveys('study-1'));

      expect(result.current.isLoading).toBe(true);

      await waitFor(() => {
        expect(result.current.isLoading).toBe(false);
      });

      expect(api.getSurveys).toHaveBeenCalledWith('study-1');
      expect(result.current.surveys).toEqual(mockSurveys);
      expect(result.current.error).toBeNull();
    });

    it('does not fetch when studyId is undefined', async () => {
      const { result } = renderHook(() => useSurveys(undefined));

      await waitFor(() => {
        expect(result.current.isLoading).toBe(false);
      });

      expect(api.getSurveys).not.toHaveBeenCalled();
      expect(result.current.surveys).toEqual([]);
    });

    it('sets error on fetch failure', async () => {
      vi.mocked(api.getSurveys).mockRejectedValue(new Error('Network error'));

      const { result } = renderHook(() => useSurveys('study-1'));

      await waitFor(() => {
        expect(result.current.isLoading).toBe(false);
      });

      expect(result.current.error).toBe('Network error');
      expect(result.current.surveys).toEqual([]);
    });

    it('handles non-Error rejection', async () => {
      vi.mocked(api.getSurveys).mockRejectedValue('String error');

      const { result } = renderHook(() => useSurveys('study-1'));

      await waitFor(() => {
        expect(result.current.error).toBe('Failed to fetch surveys');
      });
    });
  });

  describe('refetch', () => {
    it('refetches surveys', async () => {
      vi.mocked(api.getSurveys).mockResolvedValue(mockSurveys);

      const { result } = renderHook(() => useSurveys('study-1'));

      await waitFor(() => {
        expect(result.current.isLoading).toBe(false);
      });

      expect(api.getSurveys).toHaveBeenCalledTimes(1);

      const updatedSurveys = [...mockSurveys, { id: '3', name: 'New Survey', studyId: 'study-1', timing: 'POST_TASK' as const, questions: [], createdAt: '2024-01-01', updatedAt: '2024-01-01' }];
      vi.mocked(api.getSurveys).mockResolvedValue(updatedSurveys);

      await act(async () => {
        await result.current.refetch();
      });

      expect(api.getSurveys).toHaveBeenCalledTimes(2);
      expect(result.current.surveys).toEqual(updatedSurveys);
    });

    it('clears error on refetch', async () => {
      vi.mocked(api.getSurveys).mockRejectedValue(new Error('First error'));

      const { result } = renderHook(() => useSurveys('study-1'));

      await waitFor(() => {
        expect(result.current.error).toBe('First error');
      });

      vi.mocked(api.getSurveys).mockResolvedValue(mockSurveys);

      await act(async () => {
        await result.current.refetch();
      });

      expect(result.current.error).toBeNull();
      expect(result.current.surveys).toEqual(mockSurveys);
    });
  });

  describe('createSurvey', () => {
    it('creates a survey and adds it to the list', async () => {
      vi.mocked(api.getSurveys).mockResolvedValue(mockSurveys);

      const newSurvey = { id: '3', name: 'New Survey', studyId: 'study-1', timing: 'POST_TASK' as const, questions: [], createdAt: '2024-01-01', updatedAt: '2024-01-01' };
      vi.mocked(api.createSurvey).mockResolvedValue(newSurvey);

      const { result } = renderHook(() => useSurveys('study-1'));

      await waitFor(() => {
        expect(result.current.isLoading).toBe(false);
      });

      let created;
      await act(async () => {
        created = await result.current.createSurvey({ name: 'New Survey', timing: 'POST_TASK' });
      });

      expect(api.createSurvey).toHaveBeenCalledWith({ name: 'New Survey', timing: 'POST_TASK', studyId: 'study-1' });
      expect(created).toEqual(newSurvey);
      expect(result.current.surveys).toContainEqual(newSurvey);
    });

    it('throws error when studyId is undefined', async () => {
      const { result } = renderHook(() => useSurveys(undefined));

      await waitFor(() => {
        expect(result.current.isLoading).toBe(false);
      });

      await expect(
        result.current.createSurvey({ name: 'Test', timing: 'PRE_STUDY' })
      ).rejects.toThrow('Study ID required');
    });

    it('sets error on create failure', async () => {
      vi.mocked(api.getSurveys).mockResolvedValue(mockSurveys);
      vi.mocked(api.createSurvey).mockRejectedValue(new Error('Create failed'));

      const { result } = renderHook(() => useSurveys('study-1'));

      await waitFor(() => {
        expect(result.current.isLoading).toBe(false);
      });

      await expect(
        result.current.createSurvey({ name: 'Test', timing: 'PRE_STUDY' })
      ).rejects.toThrow('Create failed');

      await waitFor(() => {
        expect(result.current.error).toBe('Create failed');
      });
    });

    it('handles non-Error create rejection', async () => {
      vi.mocked(api.getSurveys).mockResolvedValue(mockSurveys);
      vi.mocked(api.createSurvey).mockRejectedValue('String error');

      const { result } = renderHook(() => useSurveys('study-1'));

      await waitFor(() => {
        expect(result.current.isLoading).toBe(false);
      });

      await expect(
        result.current.createSurvey({ name: 'Test', timing: 'PRE_STUDY' })
      ).rejects.toBeDefined();

      await waitFor(() => {
        expect(result.current.error).toBe('Failed to create survey');
      });
    });
  });

  describe('deleteSurvey', () => {
    it('removes survey from the list', async () => {
      vi.mocked(api.getSurveys).mockResolvedValue(mockSurveys);
      vi.mocked(api.deleteSurvey).mockResolvedValue(undefined);

      const { result } = renderHook(() => useSurveys('study-1'));

      await waitFor(() => {
        expect(result.current.isLoading).toBe(false);
      });

      expect(result.current.surveys).toHaveLength(2);

      await act(async () => {
        await result.current.deleteSurvey('1');
      });

      expect(api.deleteSurvey).toHaveBeenCalledWith('1');
      expect(result.current.surveys).toHaveLength(1);
      expect(result.current.surveys.find(s => s.id === '1')).toBeUndefined();
    });

    it('sets error on delete failure', async () => {
      vi.mocked(api.getSurveys).mockResolvedValue(mockSurveys);
      vi.mocked(api.deleteSurvey).mockRejectedValue(new Error('Delete failed'));

      const { result } = renderHook(() => useSurveys('study-1'));

      await waitFor(() => {
        expect(result.current.isLoading).toBe(false);
      });

      await expect(
        result.current.deleteSurvey('1')
      ).rejects.toThrow('Delete failed');

      await waitFor(() => {
        expect(result.current.error).toBe('Delete failed');
      });
    });

    it('handles non-Error delete rejection', async () => {
      vi.mocked(api.getSurveys).mockResolvedValue(mockSurveys);
      vi.mocked(api.deleteSurvey).mockRejectedValue('String error');

      const { result } = renderHook(() => useSurveys('study-1'));

      await waitFor(() => {
        expect(result.current.isLoading).toBe(false);
      });

      await expect(
        result.current.deleteSurvey('1')
      ).rejects.toBeDefined();

      await waitFor(() => {
        expect(result.current.error).toBe('Failed to delete survey');
      });
    });
  });

  describe('studyId changes', () => {
    it('refetches when studyId changes', async () => {
      vi.mocked(api.getSurveys).mockResolvedValue(mockSurveys);

      const { result, rerender } = renderHook(
        ({ studyId }) => useSurveys(studyId),
        { initialProps: { studyId: 'study-1' } }
      );

      await waitFor(() => {
        expect(result.current.isLoading).toBe(false);
      });

      expect(api.getSurveys).toHaveBeenCalledWith('study-1');

      const otherSurveys = [{ id: '3', name: 'Other Survey', studyId: 'study-2', timing: 'PRE_STUDY' as const, questions: [], createdAt: '2024-01-01', updatedAt: '2024-01-01' }];
      vi.mocked(api.getSurveys).mockResolvedValue(otherSurveys);

      rerender({ studyId: 'study-2' });

      await waitFor(() => {
        expect(result.current.surveys).toEqual(otherSurveys);
      });

      expect(api.getSurveys).toHaveBeenCalledWith('study-2');
    });
  });
});
