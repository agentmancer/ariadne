import { describe, it, expect, vi, beforeEach } from 'vitest';
import axios from 'axios';
import {
  TrialsAPIClient,
  createTrial,
  createParameterSweep,
  runTrialBatch,
  getTrialResults,
  type Trial,
  type TrialResults,
  type ParameterSweepResult,
  type RunTrialBatchResult,
} from '../trials-client';

// Mock axios
vi.mock('axios', () => {
  const mockAxios = {
    create: vi.fn(() => mockAxios),
    get: vi.fn(),
    post: vi.fn(),
    interceptors: {
      request: {
        use: vi.fn(),
      },
    },
    defaults: {
      headers: {
        common: {},
      },
    },
    isAxiosError: vi.fn((error) => error?.isAxiosError === true),
  };
  return { default: mockAxios };
});

describe('TrialsAPIClient', () => {
  let client: TrialsAPIClient;
  const mockAxios = axios as unknown as {
    create: ReturnType<typeof vi.fn>;
    get: ReturnType<typeof vi.fn>;
    post: ReturnType<typeof vi.fn>;
    interceptors: { request: { use: ReturnType<typeof vi.fn> } };
    defaults: { headers: { common: Record<string, string> } };
    isAxiosError: ReturnType<typeof vi.fn>;
  };

  const mockTrial: Trial = {
    id: 'trial-123',
    studyId: 'study-456',
    conditionId: 'cond-789',
    sequence: 1,
    name: 'Test Trial',
    parameters: { temperature: 0.7 },
    parameterKey: 'temperature',
    parameterValue: '0.7',
    status: 'PENDING',
    sessionCount: 0,
    successCount: 0,
    failureCount: 0,
    metrics: null,
    createdAt: '2024-01-01T00:00:00Z',
    completedAt: null,
  };

  beforeEach(() => {
    vi.clearAllMocks();
    mockAxios.create.mockReturnValue(mockAxios);
    client = new TrialsAPIClient({ authToken: 'test-token' });
  });

  describe('constructor', () => {
    it('should create client with default config', () => {
      new TrialsAPIClient();
      expect(mockAxios.create).toHaveBeenCalledWith(
        expect.objectContaining({
          baseURL: 'http://localhost:3002/api/v1',
          timeout: 30000,
        })
      );
    });

    it('should create client with custom config', () => {
      new TrialsAPIClient({
        apiBaseUrl: 'http://custom:3000',
        authToken: 'custom-token',
        timeout: 60000,
      });
      expect(mockAxios.create).toHaveBeenCalledWith(
        expect.objectContaining({
          baseURL: 'http://custom:3000/api/v1',
          timeout: 60000,
        })
      );
    });

    it('should add auth interceptor when token provided', () => {
      new TrialsAPIClient({ authToken: 'test-token' });
      expect(mockAxios.interceptors.request.use).toHaveBeenCalled();
    });
  });

  describe('setAuthToken', () => {
    it('should update auth token', () => {
      client.setAuthToken('new-token');
      expect(mockAxios.defaults.headers.common['Authorization']).toBe('Bearer new-token');
    });
  });

  describe('createTrial', () => {
    it('should create a trial successfully', async () => {
      mockAxios.post.mockResolvedValueOnce({
        data: { success: true, data: mockTrial },
      });

      const result = await client.createTrial({
        studyId: 'study-456',
        name: 'Test Trial',
        parameters: { temperature: 0.7 },
      });

      expect(mockAxios.post).toHaveBeenCalledWith('/studies/study-456/trials', {
        name: 'Test Trial',
        parameters: { temperature: 0.7 },
      });
      expect(result).toEqual(mockTrial);
    });

    it('should handle error when creating trial', async () => {
      const error = {
        isAxiosError: true,
        response: { status: 404, data: { error: 'Study not found' } },
        message: 'Request failed',
      };
      mockAxios.post.mockRejectedValueOnce(error);
      mockAxios.isAxiosError.mockReturnValue(true);

      await expect(
        client.createTrial({ studyId: 'invalid', parameters: {} })
      ).rejects.toThrow('Failed to create trial: Study not found (HTTP 404)');
    });
  });

  describe('createParameterSweep', () => {
    it('should create parameter sweep successfully', async () => {
      const mockSweep: ParameterSweepResult = {
        count: 3,
        parameterKey: 'temperature',
        values: [0.3, 0.5, 0.7],
        trials: [mockTrial],
      };

      mockAxios.post.mockResolvedValueOnce({
        data: { success: true, data: mockSweep },
      });

      const result = await client.createParameterSweep({
        studyId: 'study-456',
        parameterKey: 'temperature',
        values: [0.3, 0.5, 0.7],
        baseParameters: { model: 'gpt-4' },
      });

      expect(mockAxios.post).toHaveBeenCalledWith('/studies/study-456/trials/sweep', {
        parameterKey: 'temperature',
        values: [0.3, 0.5, 0.7],
        baseParameters: { model: 'gpt-4' },
      });
      expect(result).toEqual(mockSweep);
    });
  });

  describe('runTrialBatch', () => {
    it('should run trial batch successfully', async () => {
      const mockBatchResult: RunTrialBatchResult = {
        trialId: 'trial-123',
        sessionsCreated: 5,
        sessions: [
          { id: 'sess-1', name: 'Session 1', scheduledStart: '2024-01-01T00:00:00Z' },
        ],
        message: 'Created 5 sessions',
      };

      mockAxios.post.mockResolvedValueOnce({
        data: { success: true, data: mockBatchResult },
      });

      const result = await client.runTrialBatch({
        trialId: 'trial-123',
        sessionCount: 5,
      });

      expect(mockAxios.post).toHaveBeenCalledWith('/trials/trial-123/run', {
        sessionCount: 5,
      });
      expect(result).toEqual(mockBatchResult);
    });

    it('should include agentDefinitionId when provided', async () => {
      const mockBatchResult: RunTrialBatchResult = {
        trialId: 'trial-123',
        sessionsCreated: 5,
        sessions: [],
        message: 'Created 5 sessions',
      };

      mockAxios.post.mockResolvedValueOnce({
        data: { success: true, data: mockBatchResult },
      });

      await client.runTrialBatch({
        trialId: 'trial-123',
        sessionCount: 5,
        agentDefinitionId: 'agent-001',
      });

      expect(mockAxios.post).toHaveBeenCalledWith('/trials/trial-123/run', {
        sessionCount: 5,
        agentDefinitionId: 'agent-001',
      });
    });
  });

  describe('getTrialResults', () => {
    it('should get trial results successfully', async () => {
      const mockResults: TrialResults = {
        trialId: 'trial-123',
        trialName: 'Test Trial',
        conditionId: 'cond-789',
        parameters: { temperature: 0.7 },
        parameterKey: 'temperature',
        parameterValue: '0.7',
        status: 'COMPLETED',
        completedAt: '2024-01-02T00:00:00Z',
        sessionStats: {
          total: 10,
          completed: 10,
          successCount: 8,
          failureCount: 2,
          successRate: 0.8,
        },
        durationStats: {
          mean: 5000,
          min: 2000,
          max: 10000,
          count: 10,
        },
        metrics: { customMetric: 42 },
      };

      mockAxios.get.mockResolvedValueOnce({
        data: { success: true, data: mockResults },
      });

      const result = await client.getTrialResults('trial-123');

      expect(mockAxios.get).toHaveBeenCalledWith('/trials/trial-123/results');
      expect(result).toEqual(mockResults);
    });
  });

  describe('getTrial', () => {
    it('should get trial by ID successfully', async () => {
      mockAxios.get.mockResolvedValueOnce({
        data: { success: true, data: mockTrial },
      });

      const result = await client.getTrial('trial-123');

      expect(mockAxios.get).toHaveBeenCalledWith('/trials/trial-123');
      expect(result).toEqual(mockTrial);
    });

    it('should handle 404 error', async () => {
      const error = {
        isAxiosError: true,
        response: { status: 404, data: { error: 'Trial not found' } },
        message: 'Request failed',
      };
      mockAxios.get.mockRejectedValueOnce(error);
      mockAxios.isAxiosError.mockReturnValue(true);

      await expect(client.getTrial('invalid-id')).rejects.toThrow(
        'Failed to get trial: Trial not found (HTTP 404)'
      );
    });
  });

  describe('listTrials', () => {
    it('should list trials with pagination', async () => {
      const mockTrials = [mockTrial];
      const mockPagination = {
        page: 1,
        pageSize: 20,
        total: 1,
        totalPages: 1,
      };

      mockAxios.get.mockResolvedValueOnce({
        data: {
          success: true,
          data: mockTrials,
          pagination: mockPagination,
        },
      });

      const result = await client.listTrials('study-456');

      expect(mockAxios.get).toHaveBeenCalledWith('/studies/study-456/trials', {
        params: undefined,
      });
      expect(result).toEqual({
        data: mockTrials,
        pagination: mockPagination,
      });
    });

    it('should list trials with filters', async () => {
      const mockTrials = [mockTrial];
      const mockPagination = {
        page: 2,
        pageSize: 10,
        total: 15,
        totalPages: 2,
      };

      mockAxios.get.mockResolvedValueOnce({
        data: {
          success: true,
          data: mockTrials,
          pagination: mockPagination,
        },
      });

      const result = await client.listTrials('study-456', {
        page: 2,
        pageSize: 10,
        status: 'RUNNING',
        parameterKey: 'temperature',
      });

      expect(mockAxios.get).toHaveBeenCalledWith('/studies/study-456/trials', {
        params: {
          page: 2,
          pageSize: 10,
          status: 'RUNNING',
          parameterKey: 'temperature',
        },
      });
      expect(result).toEqual({
        data: mockTrials,
        pagination: mockPagination,
      });
    });
  });

  describe('error handling', () => {
    it('should handle network errors', async () => {
      const error = {
        isAxiosError: true,
        message: 'Network Error',
      };
      mockAxios.get.mockRejectedValueOnce(error);
      mockAxios.isAxiosError.mockReturnValue(true);

      await expect(client.getTrial('trial-123')).rejects.toThrow(
        'Failed to get trial: Network Error'
      );
    });

    it('should handle non-axios errors', async () => {
      mockAxios.get.mockRejectedValueOnce(new Error('Unknown error'));
      mockAxios.isAxiosError.mockReturnValue(false);

      await expect(client.getTrial('trial-123')).rejects.toThrow(
        'Failed to get trial: Unknown error'
      );
    });

    it('should handle errors without message', async () => {
      mockAxios.get.mockRejectedValueOnce('string error');
      mockAxios.isAxiosError.mockReturnValue(false);

      await expect(client.getTrial('trial-123')).rejects.toThrow(
        'Failed to get trial'
      );
    });
  });
});

describe('Helper functions', () => {
  const mockAxios = axios as unknown as {
    create: ReturnType<typeof vi.fn>;
    post: ReturnType<typeof vi.fn>;
    get: ReturnType<typeof vi.fn>;
    interceptors: { request: { use: ReturnType<typeof vi.fn> } };
    defaults: { headers: { common: Record<string, string> } };
  };

  const mockTrial: Trial = {
    id: 'trial-123',
    studyId: 'study-456',
    conditionId: null,
    sequence: 1,
    name: 'Test',
    parameters: {},
    parameterKey: null,
    parameterValue: null,
    status: 'PENDING',
    sessionCount: 0,
    successCount: 0,
    failureCount: 0,
    metrics: null,
    createdAt: '2024-01-01T00:00:00Z',
    completedAt: null,
  };

  beforeEach(() => {
    vi.clearAllMocks();
    mockAxios.create.mockReturnValue(mockAxios);
  });

  describe('createTrial helper', () => {
    it('should create trial with auth token', async () => {
      mockAxios.post.mockResolvedValueOnce({
        data: { success: true, data: mockTrial },
      });

      const result = await createTrial({
        studyId: 'study-456',
        name: 'Test',
        parameters: {},
        authToken: 'test-token',
      });

      expect(result).toEqual(mockTrial);
    });
  });

  describe('createParameterSweep helper', () => {
    it('should create sweep with auth token', async () => {
      const mockSweep: ParameterSweepResult = {
        count: 2,
        parameterKey: 'temp',
        values: [0.5, 0.7],
        trials: [mockTrial],
      };

      mockAxios.post.mockResolvedValueOnce({
        data: { success: true, data: mockSweep },
      });

      const result = await createParameterSweep({
        studyId: 'study-456',
        parameterKey: 'temp',
        values: [0.5, 0.7],
        authToken: 'test-token',
      });

      expect(result).toEqual(mockSweep);
    });
  });

  describe('runTrialBatch helper', () => {
    it('should run batch with auth token', async () => {
      const mockBatch: RunTrialBatchResult = {
        trialId: 'trial-123',
        sessionsCreated: 5,
        sessions: [],
        message: 'Done',
      };

      mockAxios.post.mockResolvedValueOnce({
        data: { success: true, data: mockBatch },
      });

      const result = await runTrialBatch({
        trialId: 'trial-123',
        sessionCount: 5,
        authToken: 'test-token',
      });

      expect(result).toEqual(mockBatch);
    });
  });

  describe('getTrialResults helper', () => {
    it('should get results with auth token', async () => {
      const mockResults: TrialResults = {
        trialId: 'trial-123',
        trialName: 'Test',
        conditionId: null,
        parameters: {},
        parameterKey: null,
        parameterValue: null,
        status: 'COMPLETED',
        completedAt: '2024-01-02T00:00:00Z',
        sessionStats: {
          total: 5,
          completed: 5,
          successCount: 5,
          failureCount: 0,
          successRate: 1,
        },
        durationStats: null,
        metrics: null,
      };

      mockAxios.get.mockResolvedValueOnce({
        data: { success: true, data: mockResults },
      });

      const result = await getTrialResults('trial-123', 'test-token');

      expect(result).toEqual(mockResults);
    });
  });
});
