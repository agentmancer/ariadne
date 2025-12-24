/**
 * Trials API Client for Ariadne Platform
 *
 * Provides client methods to interact with the Trials API endpoints
 * for parameter sweep experiments and trial execution.
 */

import axios, { AxiosInstance, AxiosError } from 'axios';

export interface TrialClientConfig {
  apiBaseUrl?: string;
  authToken?: string;
  timeout?: number;
}

export interface TrialParameters {
  [key: string]: unknown;
}

export interface CreateTrialParams {
  studyId: string;
  conditionId?: string;
  parameters?: TrialParameters;
  name?: string;
}

export interface CreateParameterSweepParams {
  studyId: string;
  conditionId?: string;
  parameterKey: string;
  values: unknown[];
  baseParameters?: TrialParameters;
}

export interface RunTrialBatchParams {
  trialId: string;
  sessionCount: number;
  agentDefinitionId?: string;
}

export type TrialStatus = 'PENDING' | 'RUNNING' | 'COMPLETED' | 'FAILED';

export interface Trial {
  id: string;
  studyId: string;
  conditionId: string | null;
  sequence: number;
  name: string | null;
  parameters: TrialParameters;
  parameterKey: string | null;
  parameterValue: string | null;
  status: TrialStatus;
  sessionCount: number;
  successCount: number;
  failureCount: number;
  metrics: Record<string, unknown> | null;
  createdAt: string;
  completedAt: string | null;
  condition?: {
    id: string;
    name: string;
  };
}

export interface ParameterSweepResult {
  count: number;
  parameterKey: string;
  values: unknown[];
  trials: Trial[];
}

export interface RunTrialBatchResult {
  trialId: string;
  sessionsCreated: number;
  sessions: Array<{
    id: string;
    name: string;
    scheduledStart: string;
  }>;
  message: string;
}

export interface TrialResults {
  trialId: string;
  trialName: string | null;
  conditionId: string | null;
  conditionName?: string;
  parameters: TrialParameters;
  parameterKey: string | null;
  parameterValue: string | null;
  status: TrialStatus;
  completedAt: string | null;
  sessionStats: {
    total: number;
    completed: number;
    successCount: number;
    failureCount: number;
    successRate: number | null;
  };
  durationStats: {
    mean: number;
    min: number;
    max: number;
    count: number;
  } | null;
  metrics: Record<string, unknown> | null;
}

/**
 * Client for interacting with Ariadne Trials API
 */
export class TrialsAPIClient {
  private client: AxiosInstance;
  private authToken?: string;

  constructor(config: TrialClientConfig = {}) {
    const baseURL = config.apiBaseUrl || process.env.API_BASE_URL || 'http://localhost:3002';
    this.authToken = config.authToken || process.env.API_AUTH_TOKEN;

    this.client = axios.create({
      baseURL: `${baseURL}/api/v1`,
      headers: {
        'Content-Type': 'application/json',
      },
      timeout: config.timeout ?? 30000,
    });

    // Add auth interceptor if token is provided
    if (this.authToken) {
      this.client.interceptors.request.use((config) => {
        config.headers.Authorization = `Bearer ${this.authToken}`;
        return config;
      });
    }
  }

  /**
   * Set the authentication token
   */
  setAuthToken(token: string): void {
    this.authToken = token;
    this.client.defaults.headers.common['Authorization'] = `Bearer ${token}`;
  }

  /**
   * Create a single trial with specific parameter configuration
   *
   * @param params - Trial creation parameters
   * @returns Created trial details
   */
  async createTrial(params: CreateTrialParams): Promise<Trial> {
    try {
      const { studyId, ...body } = params;
      const response = await this.client.post<{ success: boolean; data: Trial }>(
        `/studies/${studyId}/trials`,
        body
      );
      return response.data.data;
    } catch (error) {
      throw this.handleError(error, 'Failed to create trial');
    }
  }

  /**
   * Create multiple trials varying a single parameter (parameter sweep)
   *
   * @param params - Parameter sweep configuration
   * @returns Array of created trials and sweep metadata
   */
  async createParameterSweep(params: CreateParameterSweepParams): Promise<ParameterSweepResult> {
    try {
      const { studyId, ...body } = params;
      const response = await this.client.post<{ success: boolean; data: ParameterSweepResult }>(
        `/studies/${studyId}/trials/sweep`,
        body
      );
      return response.data.data;
    } catch (error) {
      throw this.handleError(error, 'Failed to create parameter sweep');
    }
  }

  /**
   * Execute multiple sessions for a trial (run trial batch)
   *
   * @param params - Trial execution parameters
   * @returns Batch execution result with created sessions
   */
  async runTrialBatch(params: RunTrialBatchParams): Promise<RunTrialBatchResult> {
    try {
      const { trialId, ...body } = params;
      const response = await this.client.post<{ success: boolean; data: RunTrialBatchResult }>(
        `/trials/${trialId}/run`,
        body
      );
      return response.data.data;
    } catch (error) {
      throw this.handleError(error, 'Failed to run trial batch');
    }
  }

  /**
   * Get aggregated results and statistics for a trial
   *
   * @param trialId - Trial ID
   * @returns Trial results with statistics
   */
  async getTrialResults(trialId: string): Promise<TrialResults> {
    try {
      const response = await this.client.get<{ success: boolean; data: TrialResults }>(
        `/trials/${trialId}/results`
      );
      return response.data.data;
    } catch (error) {
      throw this.handleError(error, 'Failed to get trial results');
    }
  }

  /**
   * Get a specific trial by ID
   *
   * @param trialId - Trial ID
   * @returns Trial details
   */
  async getTrial(trialId: string): Promise<Trial> {
    try {
      const response = await this.client.get<{ success: boolean; data: Trial }>(
        `/trials/${trialId}`
      );
      return response.data.data;
    } catch (error) {
      throw this.handleError(error, 'Failed to get trial');
    }
  }

  /**
   * List trials for a study
   *
   * @param studyId - Study ID
   * @param params - Optional query parameters for filtering and pagination
   * @returns Paginated list of trials
   */
  async listTrials(
    studyId: string,
    params?: {
      page?: number;
      pageSize?: number;
      conditionId?: string;
      status?: TrialStatus;
      parameterKey?: string;
    }
  ): Promise<{
    data: Trial[];
    pagination: {
      page: number;
      pageSize: number;
      total: number;
      totalPages: number;
    };
  }> {
    try {
      const response = await this.client.get<{
        success: boolean;
        data: Trial[];
        pagination: {
          page: number;
          pageSize: number;
          total: number;
          totalPages: number;
        };
      }>(`/studies/${studyId}/trials`, {
        params,
      });
      return {
        data: response.data.data,
        pagination: response.data.pagination,
      };
    } catch (error) {
      throw this.handleError(error, 'Failed to list trials');
    }
  }

  /**
   * Handle errors from API calls
   */
  private handleError(error: unknown, message: string): Error {
    if (axios.isAxiosError(error)) {
      const axiosError = error as AxiosError<{ error?: string; message?: string }>;
      const errorMessage = axiosError.response?.data?.error ||
                          axiosError.response?.data?.message ||
                          axiosError.message;
      const status = axiosError.response?.status;

      return new Error(
        `${message}: ${errorMessage}${status ? ` (HTTP ${status})` : ''}`
      );
    }

    if (error instanceof Error) {
      return new Error(`${message}: ${error.message}`);
    }

    return new Error(message);
  }
}

/**
 * Helper function to create a trial with validation
 */
export async function createTrial(params: CreateTrialParams & { authToken: string }): Promise<Trial> {
  const { authToken, ...trialParams } = params;
  const client = new TrialsAPIClient({ authToken });
  return await client.createTrial(trialParams);
}

/**
 * Helper function to create a parameter sweep
 */
export async function createParameterSweep(
  params: CreateParameterSweepParams & { authToken: string }
): Promise<ParameterSweepResult> {
  const { authToken, ...sweepParams } = params;
  const client = new TrialsAPIClient({ authToken });
  return await client.createParameterSweep(sweepParams);
}

/**
 * Helper function to run a trial batch
 */
export async function runTrialBatch(
  params: RunTrialBatchParams & { authToken: string }
): Promise<RunTrialBatchResult> {
  const { authToken, ...batchParams } = params;
  const client = new TrialsAPIClient({ authToken });
  return await client.runTrialBatch(batchParams);
}

/**
 * Helper function to get trial results
 */
export async function getTrialResults(
  trialId: string,
  authToken: string
): Promise<TrialResults> {
  const client = new TrialsAPIClient({ authToken });
  return await client.getTrialResults(trialId);
}

export default TrialsAPIClient;
