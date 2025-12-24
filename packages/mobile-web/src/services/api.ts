/**
 * API Client for Ariadne Mobile Web
 * Connects to the Ariadne API server
 */

import axios, { AxiosInstance, AxiosError } from 'axios';

// API response types
export interface Study {
  id: string;
  name: string;
  description?: string;
  status: 'DRAFT' | 'ACTIVE' | 'PAUSED' | 'COMPLETE' | 'ARCHIVED';
  type: 'SINGLE_PARTICIPANT' | 'PAIRED_COLLABORATIVE' | 'MULTI_ROUND' | 'CUSTOM';
  projectId: string;
  config?: Record<string, unknown>;
  createdAt: string;
  updatedAt: string;
  _count?: {
    participants: number;
    conditions: number;
    sessions: number;
  };
}

export interface Participant {
  id: string;
  studyId: string;
  participantId: string;
  actorType: 'HUMAN' | 'SYNTHETIC';
  role?: string;
  state: 'ENROLLED' | 'ACTIVE' | 'COMPLETE' | 'WITHDRAWN';
  llmProviderId?: string;
  llmConfig?: Record<string, unknown>;
  metadata?: Record<string, unknown>;
  createdAt: string;
  updatedAt: string;
  condition?: {
    id: string;
    name: string;
  };
  llmProvider?: {
    id: string;
    name: string;
  };
}

export interface BatchExecution {
  id: string;
  studyId: string;
  name: string;
  type: 'TRAINING_DATA' | 'EVALUATION' | 'SIMULATION';
  status: 'QUEUED' | 'RUNNING' | 'PAUSED' | 'COMPLETE' | 'FAILED';
  config: Record<string, unknown>;
  actorsToCreate: number;
  actorsCreated: number;
  actorsCompleted: number;
  error?: string;
  exportPath?: string;
  createdAt: string;
  completedAt?: string;
  study?: Study;
}

export interface Condition {
  id: string;
  studyId: string;
  name: string;
  description?: string;
  config?: Record<string, unknown>;
  architectureConfig?: Record<string, unknown>;
  createdAt: string;
  updatedAt: string;
  _count?: {
    participants: number;
  };
}

export interface CreateConditionInput {
  studyId: string;
  name: string;
  description?: string;
  config?: Record<string, unknown>;
  architectureConfig?: Record<string, unknown>;
  architectureConfigKey?: string;
}

export interface UpdateConditionInput {
  name?: string;
  description?: string;
  config?: Record<string, unknown>;
  architectureConfig?: Record<string, unknown>;
  architectureConfigKey?: string;
}

// Survey types
export type QuestionType =
  | 'MULTIPLE_CHOICE'
  | 'LIKERT'
  | 'TEXT'
  | 'TEXTAREA'
  | 'EMAIL'
  | 'NUMBER'
  | 'SCALE'
  | 'CHECKBOX';

export type SurveyTiming = 'PRE_STUDY' | 'POST_TASK' | 'EXIT' | 'CUSTOM';

export interface Question {
  id: string;
  type: QuestionType;
  text: string;
  required?: boolean;
  description?: string;
  // Type-specific fields
  options?: string[];           // MULTIPLE_CHOICE, CHECKBOX
  allowOther?: boolean;         // MULTIPLE_CHOICE
  scale?: number;               // LIKERT (3-10)
  labels?: { min?: string; max?: string };  // LIKERT, SCALE
  placeholder?: string;         // TEXT, TEXTAREA, EMAIL
  maxLength?: number;           // TEXT, TEXTAREA, EMAIL
  min?: number;                 // NUMBER, SCALE
  max?: number;                 // NUMBER, SCALE
  step?: number;                // NUMBER, SCALE
  minSelections?: number;       // CHECKBOX
  maxSelections?: number;       // CHECKBOX
}

export interface Survey {
  id: string;
  studyId: string;
  name: string;
  description?: string;
  timing: SurveyTiming;
  questions: Question[];
  createdAt: string;
  updatedAt: string;
  _count?: {
    responses: number;
  };
}

export interface CreateSurveyInput {
  studyId: string;
  name: string;
  description?: string;
  timing: SurveyTiming;
  questions?: Question[];
}

export interface UpdateSurveyInput {
  name?: string;
  description?: string;
  timing?: SurveyTiming;
  questions?: Question[];
}

export interface UpdateStudyInput {
  name?: string;
  description?: string;
  type?: Study['type'];
  config?: Record<string, unknown>;
  startDate?: string;
  endDate?: string;
  status?: Study['status'];
}

export interface Project {
  id: string;
  name: string;
  description?: string;
  createdAt: string;
  updatedAt: string;
  _count?: {
    studies: number;
  };
}

export interface CreateStudyInput {
  projectId: string;
  name: string;
  description?: string;
  type: Study['type'];
  config?: Record<string, unknown>;
}

export interface CreateProjectInput {
  name: string;
  description?: string;
}

export interface QueueStats {
  waiting: number;
  active: number;
  completed: number;
  failed: number;
  delayed: number;
  isPaused: boolean;
}

// Enrollment Configuration Types
export interface CustomFieldDefinition {
  id: string;
  type: 'text' | 'number' | 'email' | 'select' | 'multiselect' | 'checkbox' | 'date';
  label: string;
  required: boolean;
  options?: { value: string; label: string }[];
  placeholder?: string;
  validation?: {
    minLength?: number;
    maxLength?: number;
    min?: number;
    max?: number;
    pattern?: string;
  };
}

export interface EnrollmentConfig {
  id: string;
  studyId: string;
  slug: string;
  enabled: boolean;
  maxParticipants: number | null;
  openAt: string | null;
  closeAt: string | null;
  welcomeContent: string | null;
  consentDocument: string | null;
  consentVersion: string;
  instructionsContent: string | null;
  completionContent: string | null;
  requireAvailability: boolean;
  customFields: CustomFieldDefinition[];
  sendConfirmationEmail: boolean;
  confirmationEmailTemplate: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface CreateEnrollmentConfigInput {
  slug: string;
  enabled?: boolean;
  maxParticipants?: number;
  openAt?: string;
  closeAt?: string;
  welcomeContent?: string;
  consentDocument?: string;
  consentVersion?: string;
  instructionsContent?: string;
  completionContent?: string;
  requireAvailability?: boolean;
  customFields?: CustomFieldDefinition[];
  sendConfirmationEmail?: boolean;
  confirmationEmailTemplate?: string;
}

export interface UpdateEnrollmentConfigInput extends Partial<CreateEnrollmentConfigInput> {}

export interface PublicEnrollmentPortal {
  studyId: string;
  studyName: string;
  studyDescription: string | null;
  slug: string;
  isOpen: boolean;
  enrolledCount: number;
  maxParticipants: number | null;
  openAt: string | null;
  closeAt: string | null;
  requireAvailability: boolean;
  customFields: CustomFieldDefinition[];
  content: {
    welcome: string | null;
    consent: string | null;
    consentVersion: string;
    instructions: string | null;
    completion: string | null;
  };
}

export interface PaginatedResponse<T> {
  data: T[];
  pagination: {
    page: number;
    limit: number;
    total: number;
    totalPages: number;
  };
}

// API Error type
export interface ApiError {
  message: string;
  code?: string;
  details?: unknown;
}

// Storage keys
const STORAGE_KEYS = {
  API_URL: 'ariadne_api_url',
  AUTH_TOKEN: 'ariadne_auth_token',
};

// Determine default API URL based on environment
const getDefaultApiUrl = (): string => {
  if (typeof window !== 'undefined') {
    const hostname = window.location.hostname;
    // Production: mobile-web (researcher dashboard) is served at /ariadne/
    // nginx proxies /api/* directly to the API server at /api/v1/*
    // Note: web package (participant UI) uses /ariadne/api/api/v1 due to different nginx config
    if (hostname !== 'localhost' && hostname !== '127.0.0.1') {
      return `${window.location.origin}/api/v1`;
    }
  }
  // Development: use local API server with /api/v1 prefix
  return 'http://localhost:3002/api/v1';
};

const DEFAULT_API_URL = getDefaultApiUrl();

class ApiClient {
  private client: AxiosInstance;
  private baseUrl: string;

  constructor() {
    this.baseUrl = this.getStoredApiUrl();
    this.client = this.createClient();
  }

  private getStoredApiUrl(): string {
    if (typeof window !== 'undefined') {
      return localStorage.getItem(STORAGE_KEYS.API_URL) || DEFAULT_API_URL;
    }
    return DEFAULT_API_URL;
  }

  private getStoredToken(): string | null {
    if (typeof window !== 'undefined') {
      return localStorage.getItem(STORAGE_KEYS.AUTH_TOKEN);
    }
    return null;
  }

  private createClient(): AxiosInstance {
    const instance = axios.create({
      baseURL: this.baseUrl,
      timeout: 30000,
      headers: {
        'Content-Type': 'application/json',
      },
    });

    // Request interceptor - add auth token
    instance.interceptors.request.use((config) => {
      const token = this.getStoredToken();
      if (token) {
        config.headers.Authorization = `Bearer ${token}`;
      }
      return config;
    });

    // Response interceptor - handle errors
    instance.interceptors.response.use(
      (response) => response,
      (error: AxiosError<ApiError>) => {
        if (error.response?.status === 401) {
          // Only redirect if we had a token (session expired)
          // Don't redirect on login/register failures
          const hadToken = !!this.getStoredToken();
          if (hadToken) {
            this.logout();
            const basePath = import.meta.env.BASE_URL || '/';
            window.location.href = `${basePath}login`.replace('//', '/');
          }
        }
        // Extract error message from API response for better UX
        const responseData = error.response?.data as { error?: { message?: string } } | undefined;
        if (responseData?.error?.message) {
          return Promise.reject(new Error(responseData.error.message));
        }
        return Promise.reject(error);
      }
    );

    return instance;
  }

  // Configuration
  setApiUrl(url: string): void {
    // Validate URL format
    try {
      new URL(url);
    } catch {
      throw new Error('Invalid URL format');
    }
    this.baseUrl = url;
    localStorage.setItem(STORAGE_KEYS.API_URL, url);
    this.client = this.createClient();
  }

  getApiUrl(): string {
    return this.baseUrl;
  }

  // Auth
  setToken(token: string): void {
    localStorage.setItem(STORAGE_KEYS.AUTH_TOKEN, token);
    this.client = this.createClient();
  }

  logout(): void {
    localStorage.removeItem(STORAGE_KEYS.AUTH_TOKEN);
  }

  isAuthenticated(): boolean {
    return !!this.getStoredToken();
  }

  // Auth endpoints
  async login(email: string, password: string): Promise<{ token: string; researcher: { id: string; email: string; name: string } }> {
    const response = await this.client.post('/auth/login', { email, password });
    const { token } = response.data.data;
    this.setToken(token);
    return response.data.data;
  }

  async register(email: string, password: string, name: string): Promise<{ token: string; researcher: { id: string; email: string; name: string }; isFirstUser: boolean }> {
    const response = await this.client.post('/auth/register', { email, password, name });
    const { token } = response.data.data;
    this.setToken(token);
    return response.data.data;
  }

  // Studies
  async getStudies(params?: {
    projectId?: string;
    status?: string;
    page?: number;
    limit?: number;
  }): Promise<PaginatedResponse<Study>> {
    const response = await this.client.get('/studies', { params });
    const { studies, pagination } = response.data.data;
    return { data: studies, pagination };
  }

  async getStudy(id: string): Promise<Study> {
    const response = await this.client.get(`/studies/${id}`);
    return response.data.data;
  }

  async updateStudyStatus(id: string, status: Study['status']): Promise<Study> {
    const response = await this.client.put(`/studies/${id}/status`, { status });
    return response.data.data;
  }

  async createStudy(input: CreateStudyInput): Promise<Study> {
    const response = await this.client.post('/studies', input);
    return response.data.data;
  }

  async updateStudy(id: string, data: UpdateStudyInput): Promise<Study> {
    const response = await this.client.put(`/studies/${id}`, data);
    return response.data.data;
  }

  // Projects
  async getProjects(): Promise<Project[]> {
    const response = await this.client.get('/projects');
    return response.data.data;
  }

  async createProject(input: CreateProjectInput): Promise<Project> {
    const response = await this.client.post('/projects', input);
    return response.data.data;
  }

  // Participants
  async getParticipants(params?: {
    studyId?: string;
    state?: string;
    actorType?: 'HUMAN' | 'SYNTHETIC';
    page?: number;
    limit?: number;
  }): Promise<PaginatedResponse<Participant>> {
    const response = await this.client.get('/participants', { params });
    const { participants, pagination } = response.data.data;
    return { data: participants, pagination };
  }

  async getParticipant(id: string): Promise<Participant> {
    const response = await this.client.get(`/participants/${id}`);
    return response.data.data;
  }

  // Conditions
  async getConditions(studyId: string): Promise<Condition[]> {
    const response = await this.client.get('/conditions', { params: { studyId } });
    return response.data.data.conditions;
  }

  async getCondition(id: string): Promise<Condition> {
    const response = await this.client.get(`/conditions/${id}`);
    return response.data.data;
  }

  async createCondition(data: CreateConditionInput): Promise<Condition> {
    const response = await this.client.post('/conditions', data);
    return response.data.data;
  }

  async updateCondition(id: string, data: UpdateConditionInput): Promise<Condition> {
    const response = await this.client.put(`/conditions/${id}`, data);
    return response.data.data;
  }

  async deleteCondition(id: string): Promise<void> {
    await this.client.delete(`/conditions/${id}`);
  }

  // Surveys
  async getSurveys(studyId: string): Promise<Survey[]> {
    const response = await this.client.get('/surveys', { params: { studyId } });
    return response.data.data.surveys;
  }

  async getSurvey(id: string): Promise<Survey> {
    const response = await this.client.get(`/surveys/${id}`);
    return response.data.data;
  }

  async createSurvey(data: CreateSurveyInput): Promise<Survey> {
    const response = await this.client.post('/surveys', data);
    return response.data.data;
  }

  async updateSurvey(id: string, data: UpdateSurveyInput): Promise<Survey> {
    const response = await this.client.put(`/surveys/${id}`, data);
    return response.data.data;
  }

  async deleteSurvey(id: string): Promise<void> {
    await this.client.delete(`/surveys/${id}`);
  }

  // Batch Executions
  async getBatchExecutions(params?: {
    studyId?: string;
    status?: string;
    page?: number;
    limit?: number;
  }): Promise<PaginatedResponse<BatchExecution>> {
    const response = await this.client.get('/batch-executions', { params });
    const { batches, pagination } = response.data.data;
    return { data: batches, pagination };
  }

  async getBatchExecution(id: string): Promise<BatchExecution> {
    const response = await this.client.get(`/batch-executions/${id}`);
    return response.data.data;
  }

  async pauseBatch(id: string): Promise<BatchExecution> {
    const response = await this.client.post(`/batch-executions/${id}/pause`);
    return response.data.data;
  }

  async resumeBatch(id: string): Promise<BatchExecution> {
    const response = await this.client.post(`/batch-executions/${id}/resume`);
    return response.data.data;
  }

  async getQueueStats(): Promise<QueueStats> {
    const response = await this.client.get('/batch-executions/queue/stats');
    return response.data.data;
  }

  // Health check (uses root endpoint, not /api/v1)
  async healthCheck(): Promise<boolean> {
    try {
      // Health endpoint is at root level, not under /api/v1
      const healthUrl = this.baseUrl.replace(/\/api\/v1$/, '/health');
      await axios.get(healthUrl, { timeout: 5000 });
      return true;
    } catch (err) {
      if (import.meta.env.DEV) {
        console.error('API healthCheck failed:', err);
      }
      return false;
    }
  }

  // Enrollment Configuration
  async getEnrollmentConfig(studyId: string): Promise<EnrollmentConfig | null> {
    const response = await this.client.get(`/studies/${studyId}/enrollment-config`);
    return response.data.data;
  }

  async createEnrollmentConfig(studyId: string, data: CreateEnrollmentConfigInput): Promise<EnrollmentConfig> {
    const response = await this.client.post(`/studies/${studyId}/enrollment-config`, data);
    return response.data.data;
  }

  async updateEnrollmentConfig(studyId: string, data: UpdateEnrollmentConfigInput): Promise<EnrollmentConfig> {
    const response = await this.client.put(`/studies/${studyId}/enrollment-config`, data);
    return response.data.data;
  }

  async deleteEnrollmentConfig(studyId: string): Promise<void> {
    await this.client.delete(`/studies/${studyId}/enrollment-config`);
  }

  async toggleEnrollmentConfig(studyId: string, enabled: boolean): Promise<EnrollmentConfig> {
    const response = await this.client.put(`/studies/${studyId}/enrollment-config/toggle`, { enabled });
    return response.data.data;
  }

  async checkSlugAvailability(studyId: string, slug: string): Promise<boolean> {
    const response = await this.client.get(`/studies/${studyId}/enrollment-config/check-slug/${slug}`);
    return response.data.data.available;
  }

  async sendTestEmail(studyId: string, email: string): Promise<{ messageId?: string; sentTo: string }> {
    const response = await this.client.post(`/studies/${studyId}/enrollment-config/test-email`, { email });
    return response.data.data;
  }

  async getEnrollmentPreview(studyId: string): Promise<PublicEnrollmentPortal & { isPreview: boolean }> {
    const response = await this.client.get(`/studies/${studyId}/enrollment-config/preview`);
    return response.data.data;
  }

  // Test Mode
  async createTestParticipants(
    studyId: string,
    options: { conditionId?: string; paired?: boolean } = {}
  ): Promise<TestParticipantsResult> {
    const response = await this.client.post(`/studies/${studyId}/test-participants`, options);
    return response.data.data;
  }

  async getTestParticipants(studyId: string): Promise<TestParticipant[]> {
    const response = await this.client.get(`/studies/${studyId}/test-participants`);
    return response.data.data;
  }

  async deleteTestParticipants(studyId: string): Promise<{ deleted: number }> {
    const response = await this.client.delete(`/studies/${studyId}/test-participants`);
    return response.data.data;
  }
}

// Test Mode types
export interface TestParticipant {
  id: string;
  uniqueId: string;
  studyId: string;
  conditionId?: string;
  condition?: { id: string; name: string };
  partner?: { id: string; uniqueId: string };
  state: string;
  metadata?: string;
  createdAt: string;
}

export interface TestParticipantsResult {
  participantA: TestParticipant;
  participantB: TestParticipant | null;
  paired: boolean;
}

// Singleton instance
export const api = new ApiClient();
