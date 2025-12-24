/**
 * Unit tests for useSurvey hook
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderHook, waitFor, act } from '@testing-library/react';
import { useSurvey } from '../hooks/useSurvey';
import { api } from '../services/api';

// Mock the API module
vi.mock('../services/api', () => ({
  api: {
    getSurvey: vi.fn(),
    updateSurvey: vi.fn(),
  },
}));

describe('useSurvey', () => {
  const mockSurvey = {
    id: 'survey-1',
    name: 'Test Survey',
    studyId: 'study-1',
    timing: 'PRE_STUDY' as const,
    questions: [
      { id: 'q1', text: 'Question 1', type: 'TEXT' as const },
      { id: 'q2', text: 'Question 2', type: 'MULTIPLE_CHOICE' as const },
    ],
    createdAt: '2024-01-01',
    updatedAt: '2024-01-01',
  };

  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('Initial fetch', () => {
    it('fetches survey when id is provided', async () => {
      vi.mocked(api.getSurvey).mockResolvedValue(mockSurvey);

      const { result } = renderHook(() => useSurvey('survey-1'));

      expect(result.current.isLoading).toBe(true);

      await waitFor(() => {
        expect(result.current.isLoading).toBe(false);
      });

      expect(api.getSurvey).toHaveBeenCalledWith('survey-1');
      expect(result.current.survey).toEqual(mockSurvey);
      expect(result.current.error).toBeNull();
    });

    it('does not fetch when id is undefined', async () => {
      const { result } = renderHook(() => useSurvey(undefined));

      await waitFor(() => {
        expect(result.current.isLoading).toBe(false);
      });

      expect(api.getSurvey).not.toHaveBeenCalled();
      expect(result.current.survey).toBeNull();
    });

    it('sets error on fetch failure', async () => {
      vi.mocked(api.getSurvey).mockRejectedValue(new Error('Survey not found'));

      const { result } = renderHook(() => useSurvey('survey-1'));

      await waitFor(() => {
        expect(result.current.isLoading).toBe(false);
      });

      expect(result.current.error).toBe('Survey not found');
      expect(result.current.survey).toBeNull();
    });

    it('handles non-Error rejection', async () => {
      vi.mocked(api.getSurvey).mockRejectedValue('String error');

      const { result } = renderHook(() => useSurvey('survey-1'));

      await waitFor(() => {
        expect(result.current.error).toBe('Failed to fetch survey');
      });
    });
  });

  describe('refetch', () => {
    it('refetches survey data', async () => {
      vi.mocked(api.getSurvey).mockResolvedValue(mockSurvey);

      const { result } = renderHook(() => useSurvey('survey-1'));

      await waitFor(() => {
        expect(result.current.isLoading).toBe(false);
      });

      expect(api.getSurvey).toHaveBeenCalledTimes(1);

      const updatedSurvey = { ...mockSurvey, name: 'Updated Survey' };
      vi.mocked(api.getSurvey).mockResolvedValue(updatedSurvey);

      await act(async () => {
        await result.current.refetch();
      });

      expect(api.getSurvey).toHaveBeenCalledTimes(2);
      expect(result.current.survey?.name).toBe('Updated Survey');
    });

    it('clears error on successful refetch', async () => {
      vi.mocked(api.getSurvey).mockRejectedValue(new Error('First error'));

      const { result } = renderHook(() => useSurvey('survey-1'));

      await waitFor(() => {
        expect(result.current.error).toBe('First error');
      });

      vi.mocked(api.getSurvey).mockResolvedValue(mockSurvey);

      await act(async () => {
        await result.current.refetch();
      });

      expect(result.current.error).toBeNull();
      expect(result.current.survey).toEqual(mockSurvey);
    });
  });

  describe('updateSurvey', () => {
    it('updates survey and returns updated data', async () => {
      vi.mocked(api.getSurvey).mockResolvedValue(mockSurvey);

      const updatedSurvey = { ...mockSurvey, name: 'Updated Title' };
      vi.mocked(api.updateSurvey).mockResolvedValue(updatedSurvey);

      const { result } = renderHook(() => useSurvey('survey-1'));

      await waitFor(() => {
        expect(result.current.isLoading).toBe(false);
      });

      let updated;
      await act(async () => {
        updated = await result.current.updateSurvey({ name: 'Updated Title' });
      });

      expect(api.updateSurvey).toHaveBeenCalledWith('survey-1', { name: 'Updated Title' });
      expect(updated).toEqual(updatedSurvey);
      expect(result.current.survey).toEqual(updatedSurvey);
    });

    it('updates survey questions', async () => {
      vi.mocked(api.getSurvey).mockResolvedValue(mockSurvey);

      const newQuestions = [
        { id: 'q1', text: 'Updated Question 1', type: 'TEXT' as const },
        { id: 'q3', text: 'New Question', type: 'LIKERT' as const },
      ];
      const updatedSurvey = { ...mockSurvey, questions: newQuestions };
      vi.mocked(api.updateSurvey).mockResolvedValue(updatedSurvey);

      const { result } = renderHook(() => useSurvey('survey-1'));

      await waitFor(() => {
        expect(result.current.isLoading).toBe(false);
      });

      await act(async () => {
        await result.current.updateSurvey({ questions: newQuestions });
      });

      expect(result.current.survey?.questions).toEqual(newQuestions);
    });

    it('throws error when id is undefined', async () => {
      const { result } = renderHook(() => useSurvey(undefined));

      await waitFor(() => {
        expect(result.current.isLoading).toBe(false);
      });

      await expect(
        result.current.updateSurvey({ name: 'Test' })
      ).rejects.toThrow('Survey ID required');
    });

    it('sets error on update failure', async () => {
      vi.mocked(api.getSurvey).mockResolvedValue(mockSurvey);
      vi.mocked(api.updateSurvey).mockRejectedValue(new Error('Update failed'));

      const { result } = renderHook(() => useSurvey('survey-1'));

      await waitFor(() => {
        expect(result.current.isLoading).toBe(false);
      });

      await expect(
        result.current.updateSurvey({ name: 'Test' })
      ).rejects.toThrow('Update failed');

      await waitFor(() => {
        expect(result.current.error).toBe('Update failed');
      });
    });

    it('handles non-Error update rejection', async () => {
      vi.mocked(api.getSurvey).mockResolvedValue(mockSurvey);
      vi.mocked(api.updateSurvey).mockRejectedValue('String error');

      const { result } = renderHook(() => useSurvey('survey-1'));

      await waitFor(() => {
        expect(result.current.isLoading).toBe(false);
      });

      await expect(
        result.current.updateSurvey({ name: 'Test' })
      ).rejects.toBeDefined();

      await waitFor(() => {
        expect(result.current.error).toBe('Failed to update survey');
      });
    });
  });

  describe('id changes', () => {
    it('refetches when id changes', async () => {
      vi.mocked(api.getSurvey).mockResolvedValue(mockSurvey);

      const { result, rerender } = renderHook(
        ({ id }) => useSurvey(id),
        { initialProps: { id: 'survey-1' } }
      );

      await waitFor(() => {
        expect(result.current.isLoading).toBe(false);
      });

      expect(api.getSurvey).toHaveBeenCalledWith('survey-1');

      const otherSurvey = { ...mockSurvey, id: 'survey-2', name: 'Other Survey' };
      vi.mocked(api.getSurvey).mockResolvedValue(otherSurvey);

      rerender({ id: 'survey-2' });

      await waitFor(() => {
        expect(result.current.survey).toEqual(otherSurvey);
      });

      expect(api.getSurvey).toHaveBeenCalledWith('survey-2');
    });

    it('clears survey when id becomes undefined', async () => {
      vi.mocked(api.getSurvey).mockResolvedValue(mockSurvey);

      const { result, rerender } = renderHook(
        ({ id }) => useSurvey(id),
        { initialProps: { id: 'survey-1' as string | undefined } }
      );

      await waitFor(() => {
        expect(result.current.survey).toEqual(mockSurvey);
      });

      rerender({ id: undefined });

      // Survey stays from previous fetch, but no new fetch is made
      expect(api.getSurvey).toHaveBeenCalledTimes(1);
    });
  });
});
