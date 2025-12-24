/**
 * Unit tests for useConditions hook
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderHook, waitFor, act } from '@testing-library/react';
import { useConditions } from '../hooks/useConditions';
import { api } from '../services/api';

// Mock the API module
vi.mock('../services/api', () => ({
  api: {
    getConditions: vi.fn(),
    createCondition: vi.fn(),
    updateCondition: vi.fn(),
    deleteCondition: vi.fn(),
  },
}));

describe('useConditions', () => {
  const mockConditions = [
    { id: '1', name: 'Control', description: 'Control group', studyId: 'study-1', createdAt: '2024-01-01', updatedAt: '2024-01-01' },
    { id: '2', name: 'Treatment', description: 'Treatment group', studyId: 'study-1', createdAt: '2024-01-01', updatedAt: '2024-01-01' },
  ];

  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('Initial fetch', () => {
    it('fetches conditions when studyId is provided', async () => {
      vi.mocked(api.getConditions).mockResolvedValue(mockConditions);

      const { result } = renderHook(() => useConditions('study-1'));

      expect(result.current.isLoading).toBe(true);

      await waitFor(() => {
        expect(result.current.isLoading).toBe(false);
      });

      expect(api.getConditions).toHaveBeenCalledWith('study-1');
      expect(result.current.conditions).toEqual(mockConditions);
      expect(result.current.error).toBeNull();
    });

    it('does not fetch when studyId is undefined', async () => {
      const { result } = renderHook(() => useConditions(undefined));

      await waitFor(() => {
        expect(result.current.isLoading).toBe(false);
      });

      expect(api.getConditions).not.toHaveBeenCalled();
      expect(result.current.conditions).toEqual([]);
    });

    it('sets error on fetch failure', async () => {
      vi.mocked(api.getConditions).mockRejectedValue(new Error('Network error'));

      const { result } = renderHook(() => useConditions('study-1'));

      await waitFor(() => {
        expect(result.current.isLoading).toBe(false);
      });

      expect(result.current.error).toBe('Network error');
      expect(result.current.conditions).toEqual([]);
    });

    it('handles non-Error rejection', async () => {
      vi.mocked(api.getConditions).mockRejectedValue('Some string error');

      const { result } = renderHook(() => useConditions('study-1'));

      await waitFor(() => {
        expect(result.current.error).toBe('Failed to fetch conditions');
      });
    });
  });

  describe('refetch', () => {
    it('refetches conditions', async () => {
      vi.mocked(api.getConditions).mockResolvedValue(mockConditions);

      const { result } = renderHook(() => useConditions('study-1'));

      await waitFor(() => {
        expect(result.current.isLoading).toBe(false);
      });

      expect(api.getConditions).toHaveBeenCalledTimes(1);

      const updatedConditions = [...mockConditions, { id: '3', name: 'New', description: 'New condition', studyId: 'study-1', createdAt: '2024-01-01', updatedAt: '2024-01-01' }];
      vi.mocked(api.getConditions).mockResolvedValue(updatedConditions);

      await act(async () => {
        await result.current.refetch();
      });

      expect(api.getConditions).toHaveBeenCalledTimes(2);
      expect(result.current.conditions).toEqual(updatedConditions);
    });
  });

  describe('createCondition', () => {
    it('creates a condition and adds it to the list', async () => {
      vi.mocked(api.getConditions).mockResolvedValue(mockConditions);

      const newCondition = { id: '3', name: 'New', description: 'New condition', studyId: 'study-1', createdAt: '2024-01-01', updatedAt: '2024-01-01' };
      vi.mocked(api.createCondition).mockResolvedValue(newCondition);

      const { result } = renderHook(() => useConditions('study-1'));

      await waitFor(() => {
        expect(result.current.isLoading).toBe(false);
      });

      let created;
      await act(async () => {
        created = await result.current.createCondition({ name: 'New', description: 'New condition' });
      });

      expect(api.createCondition).toHaveBeenCalledWith({ name: 'New', description: 'New condition', studyId: 'study-1' });
      expect(created).toEqual(newCondition);
      expect(result.current.conditions).toContainEqual(newCondition);
    });

    it('throws error when studyId is undefined', async () => {
      const { result } = renderHook(() => useConditions(undefined));

      await waitFor(() => {
        expect(result.current.isLoading).toBe(false);
      });

      await expect(
        result.current.createCondition({ name: 'Test' })
      ).rejects.toThrow('Study ID required');
    });

    it('sets error on create failure', async () => {
      vi.mocked(api.getConditions).mockResolvedValue(mockConditions);
      vi.mocked(api.createCondition).mockRejectedValue(new Error('Create failed'));

      const { result } = renderHook(() => useConditions('study-1'));

      await waitFor(() => {
        expect(result.current.isLoading).toBe(false);
      });

      await expect(
        result.current.createCondition({ name: 'Test' })
      ).rejects.toThrow('Create failed');

      await waitFor(() => {
        expect(result.current.error).toBe('Create failed');
      });
    });
  });

  describe('updateCondition', () => {
    it('updates a condition in the list', async () => {
      vi.mocked(api.getConditions).mockResolvedValue(mockConditions);

      const updatedCondition = { ...mockConditions[0], name: 'Updated Control' } as typeof mockConditions[0];
      vi.mocked(api.updateCondition).mockResolvedValue(updatedCondition);

      const { result } = renderHook(() => useConditions('study-1'));

      await waitFor(() => {
        expect(result.current.isLoading).toBe(false);
      });

      let updated;
      await act(async () => {
        updated = await result.current.updateCondition('1', { name: 'Updated Control' });
      });

      expect(api.updateCondition).toHaveBeenCalledWith('1', { name: 'Updated Control' });
      expect(updated).toEqual(updatedCondition);
      expect(result.current.conditions.find(c => c.id === '1')?.name).toBe('Updated Control');
    });

    it('sets error on update failure', async () => {
      vi.mocked(api.getConditions).mockResolvedValue(mockConditions);
      vi.mocked(api.updateCondition).mockRejectedValue(new Error('Update failed'));

      const { result } = renderHook(() => useConditions('study-1'));

      await waitFor(() => {
        expect(result.current.isLoading).toBe(false);
      });

      await expect(
        result.current.updateCondition('1', { name: 'Test' })
      ).rejects.toThrow('Update failed');

      await waitFor(() => {
        expect(result.current.error).toBe('Update failed');
      });
    });
  });

  describe('deleteCondition', () => {
    it('removes condition from the list', async () => {
      vi.mocked(api.getConditions).mockResolvedValue(mockConditions);
      vi.mocked(api.deleteCondition).mockResolvedValue(undefined);

      const { result } = renderHook(() => useConditions('study-1'));

      await waitFor(() => {
        expect(result.current.isLoading).toBe(false);
      });

      expect(result.current.conditions).toHaveLength(2);

      await act(async () => {
        await result.current.deleteCondition('1');
      });

      expect(api.deleteCondition).toHaveBeenCalledWith('1');
      expect(result.current.conditions).toHaveLength(1);
      expect(result.current.conditions.find(c => c.id === '1')).toBeUndefined();
    });

    it('sets error on delete failure', async () => {
      vi.mocked(api.getConditions).mockResolvedValue(mockConditions);
      vi.mocked(api.deleteCondition).mockRejectedValue(new Error('Delete failed'));

      const { result } = renderHook(() => useConditions('study-1'));

      await waitFor(() => {
        expect(result.current.isLoading).toBe(false);
      });

      await expect(
        result.current.deleteCondition('1')
      ).rejects.toThrow('Delete failed');

      await waitFor(() => {
        expect(result.current.error).toBe('Delete failed');
      });
    });
  });

  describe('studyId changes', () => {
    it('refetches when studyId changes', async () => {
      vi.mocked(api.getConditions).mockResolvedValue(mockConditions);

      const { result, rerender } = renderHook(
        ({ studyId }) => useConditions(studyId),
        { initialProps: { studyId: 'study-1' } }
      );

      await waitFor(() => {
        expect(result.current.isLoading).toBe(false);
      });

      expect(api.getConditions).toHaveBeenCalledWith('study-1');

      const otherConditions = [{ id: '3', name: 'Other', description: 'Other', studyId: 'study-2', createdAt: '2024-01-01', updatedAt: '2024-01-01' }];
      vi.mocked(api.getConditions).mockResolvedValue(otherConditions);

      rerender({ studyId: 'study-2' });

      await waitFor(() => {
        expect(result.current.conditions).toEqual(otherConditions);
      });

      expect(api.getConditions).toHaveBeenCalledWith('study-2');
    });
  });
});
