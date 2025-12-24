import axios, { AxiosInstance, AxiosError } from 'axios';

// Enums matching @ariadne/shared (local definitions for ESM compatibility)
export enum ActorType {
  HUMAN = 'HUMAN',
  SYNTHETIC = 'SYNTHETIC',
}

export enum ParticipantState {
  ENROLLED = 'ENROLLED',
  SCHEDULED = 'SCHEDULED',
  CONFIRMED = 'CONFIRMED',
  CHECKED_IN = 'CHECKED_IN',
  ACTIVE = 'ACTIVE',
  COMPLETE = 'COMPLETE',
  WITHDRAWN = 'WITHDRAWN',
  EXCLUDED = 'EXCLUDED',
}

export enum CollaborativePhase {
  AUTHOR = 'AUTHOR',
  PLAY = 'PLAY',
  REVIEW = 'REVIEW',
}

export enum CommentType {
  FEEDBACK = 'FEEDBACK',
  SUGGESTION = 'SUGGESTION',
  QUESTION = 'QUESTION',
  PRAISE = 'PRAISE',
  CRITIQUE = 'CRITIQUE',
}

// Types for participant session API responses
export interface Participant {
  id: string;
  studyId: string;
  participantId: string;
  actorType: ActorType;
  role: string;
  state: ParticipantState;
  currentStage: number;
  sessionStart: string | null;
  metadata: Record<string, unknown>;
}

export interface Partner {
  id: string;
  participantId: string;
  currentStage: number;
  bio?: string;
}

export interface Comment {
  id: string;
  authorId: string;
  targetParticipantId: string;
  content: string;
  passageName?: string;
  commentType?: CommentType;
  round: number;
  phase: CollaborativePhase | string;
  resolved?: boolean;
  addressedInRound?: number;
  createdAt: string;
}

export interface StoryData {
  id: string;
  participantId: string;
  pluginType: string;
  version: number;
  s3Key: string;
  status: string;
  content?: unknown;
}

export interface SessionState {
  participant: Participant;
  partner: Partner | null;
  currentStory: StoryData | null;
  partnerStory: StoryData | null;
  comments: Comment[];
  config: {
    stages: Array<{
      stage: number;
      name: string;
      duration?: number;
    }>;
  };
}

// Auth state change callback type
type AuthChangeCallback = (isAuthenticated: boolean) => void;

// Helper to extract error message from Axios errors
export function extractErrorMessage(err: unknown, fallback: string): string {
  if (axios.isAxiosError(err)) {
    const axiosErr = err as AxiosError<{ message?: string; error?: string }>;
    return axiosErr.response?.data?.message
      || axiosErr.response?.data?.error
      || axiosErr.message
      || fallback;
  }
  if (err instanceof Error) {
    return err.message;
  }
  return fallback;
}

class ParticipantApi {
  private client: AxiosInstance;
  private token: string | null = null;
  private currentCode: string | null = null;
  private authChangeCallbacks: AuthChangeCallback[] = [];

  constructor() {
    const baseURL = this.getApiUrl();

    this.client = axios.create({
      baseURL,
      headers: {
        'Content-Type': 'application/json',
      },
    });

    // Add auth token to requests
    this.client.interceptors.request.use((config) => {
      if (this.token) {
        config.headers.Authorization = `Bearer ${this.token}`;
      }
      return config;
    });

    // Handle 401 responses - emit event for React to handle navigation
    this.client.interceptors.response.use(
      (response) => response,
      (error) => {
        if (error.response?.status === 401) {
          this.clearAuth();
          window.dispatchEvent(new CustomEvent('auth:unauthorized'));
        }
        return Promise.reject(error);
      }
    );

    // Try to restore session from URL or last active code
    this.restoreSession();
  }

  /**
   * Get storage key for a participant code
   */
  private getStorageKey(code: string): string {
    return `ariadne_session_${code}`;
  }

  /**
   * Restore session from URL param or last active code
   */
  private restoreSession(): void {
    // Check URL for code parameter
    const urlParams = new URLSearchParams(window.location.search);
    const urlCode = urlParams.get('code') || this.extractCodeFromPath();

    if (urlCode) {
      this.loadSession(urlCode);
    } else {
      // Try last active code
      const lastCode = localStorage.getItem('ariadne_active_code');
      if (lastCode) {
        this.loadSession(lastCode);
      }
    }
  }

  /**
   * Extract participant code from URL path (e.g., /session/ABC123)
   */
  private extractCodeFromPath(): string | null {
    const match = window.location.pathname.match(/\/session\/([^/]+)/);
    return match ? match[1] : null;
  }

  /**
   * Load session for a specific participant code
   */
  loadSession(code: string): boolean {
    const stored = localStorage.getItem(this.getStorageKey(code));
    if (stored) {
      try {
        const data = JSON.parse(stored);
        this.token = data.token;
        this.currentCode = code;
        localStorage.setItem('ariadne_active_code', code);
        this.notifyAuthChange(true);
        return true;
      } catch {
        return false;
      }
    }
    return false;
  }

  /**
   * Get current participant code
   */
  getCurrentCode(): string | null {
    return this.currentCode;
  }

  private getApiUrl(): string {
    const stored = localStorage.getItem('ariadne_api_url');
    if (stored) return stored;

    if (import.meta.env.DEV) {
      return 'http://localhost:3002/api/v1';
    }
    // Production: web package (participant UI) is served at /study/
    // API proxy is at /ariadne/api/ which maps to API server root
    // So /ariadne/api/api/v1 → http://api-server/api/v1
    // Note: mobile-web (researcher dashboard) uses different nginx config
    return `${window.location.origin}/ariadne/api/api/v1`;
  }

  setApiUrl(url: string) {
    localStorage.setItem('ariadne_api_url', url);
    this.client.defaults.baseURL = url;
  }

  /**
   * Set token for a specific participant code
   */
  setToken(token: string, code: string) {
    this.token = token;
    this.currentCode = code;
    localStorage.setItem(this.getStorageKey(code), JSON.stringify({ token }));
    localStorage.setItem('ariadne_active_code', code);
    this.notifyAuthChange(true);
  }

  /**
   * Clear auth for current session
   */
  clearAuth() {
    if (this.currentCode) {
      localStorage.removeItem(this.getStorageKey(this.currentCode));
    }
    this.token = null;
    this.currentCode = null;
    localStorage.removeItem('ariadne_active_code');
    this.notifyAuthChange(false);
  }

  isAuthenticated(): boolean {
    return !!this.token;
  }

  /**
   * Check if a specific code has a stored session
   */
  hasStoredSession(code: string): boolean {
    return !!localStorage.getItem(this.getStorageKey(code));
  }

  // Subscribe to auth state changes
  onAuthChange(callback: AuthChangeCallback): () => void {
    this.authChangeCallbacks.push(callback);
    return () => {
      this.authChangeCallbacks = this.authChangeCallbacks.filter(cb => cb !== callback);
    };
  }

  private notifyAuthChange(isAuthenticated: boolean) {
    this.authChangeCallbacks.forEach(cb => cb(isAuthenticated));
  }

  // Join a study with participant code
  async join(code: string): Promise<{ token: string; participant: Participant; code: string }> {
    const response = await this.client.post('/participant-session/join', { code });
    const { token, participant } = response.data.data;
    this.setToken(token, code);
    return { token, participant, code };
  }

  // Check in to start session
  async checkIn(): Promise<{ participant: Participant; partner: Partner | null }> {
    const response = await this.client.post('/participant-session/check-in');
    return response.data.data;
  }

  // Get current session state
  async getSessionState(participantId: string): Promise<SessionState> {
    const response = await this.client.get(`/participant-session/${participantId}`);
    return response.data.data;
  }

  // Advance to next stage
  async advanceStage(participantId: string): Promise<Participant> {
    const response = await this.client.post(`/participant-session/${participantId}/advance`);
    return response.data.data;
  }

  // Save story - get presigned upload URL
  async saveStory(participantId: string, pluginType: string = 'twine', name?: string): Promise<{
    id: string;
    version: number;
    s3Key: string;
    uploadUrl: string;
  }> {
    const response = await this.client.put(`/participant-session/${participantId}/story`, {
      pluginType,
      name,
    });
    return response.data.data;
  }

  // Load story - get presigned download URL for participant's current story
  async loadStory(participantId: string): Promise<{
    id: string;
    version: number;
    pluginType: string;
    name: string;
    createdAt: string;
    downloadUrl: string;
  } | null> {
    const response = await this.client.get(`/participant-session/${participantId}/story`);
    return response.data.data;
  }

  // Confirm story upload to S3
  async confirmStory(participantId: string, storyId: string): Promise<{
    id: string;
    version: number;
    status: string;
  }> {
    const response = await this.client.post(`/participant-session/${participantId}/story/confirm`, {
      storyId,
    });
    return response.data.data;
  }

  // Get partner's story
  async getPartnerStory(participantId: string): Promise<{
    story: StoryData;
    downloadUrl: string;
  } | null> {
    const response = await this.client.get(`/participant-session/${participantId}/partner-story`);
    return response.data.data;
  }

  // Add comment
  async addComment(participantId: string, comment: {
    content: string;
    passageName?: string;
    type?: string;
  }): Promise<Comment> {
    const response = await this.client.post(`/participant-session/${participantId}/comments`, comment);
    return response.data.data;
  }

  // Get comments
  async getComments(participantId: string, params?: {
    round?: number;
    forMe?: boolean;
  }): Promise<Comment[]> {
    const response = await this.client.get(`/participant-session/${participantId}/comments`, { params });
    return response.data.data;
  }

  // Log event
  async logEvent(participantId: string, eventType: string, data?: Record<string, unknown>): Promise<void> {
    await this.client.post(`/participant-session/${participantId}/events`, {
      type: eventType,
      data,
    });
  }

  // ============================================================================
  // EVALUATION API
  // ============================================================================

  // Get available instruments
  async getInstruments(): Promise<EvaluationInstrument[]> {
    const response = await this.client.get('/evaluation/instruments');
    return response.data.data;
  }

  // Get specific instrument by ID
  async getInstrument(instrumentId: string): Promise<EvaluationInstrument> {
    const response = await this.client.get(`/evaluation/instruments/${instrumentId}`);
    return response.data.data;
  }

  // Start or resume an evaluation session
  async startEvaluation(sessionId: string, instrumentId: string): Promise<EvaluationSession> {
    const response = await this.client.post('/evaluation/sessions', {
      sessionId,
      instrumentId,
    });
    return response.data.data;
  }

  // Get next passage to rate
  async getNextPassage(evaluationSessionId: string): Promise<PassageTriad | null> {
    const response = await this.client.get(`/evaluation/sessions/${evaluationSessionId}/passages/next`);
    return response.data.data;
  }

  // Submit rating for a passage
  async submitRating(evaluationSessionId: string, rating: PassageRating): Promise<{ success: boolean; nextPassage: PassageTriad | null }> {
    const response = await this.client.post(`/evaluation/sessions/${evaluationSessionId}/ratings`, rating);
    return response.data.data;
  }

  // Get evaluation progress
  async getEvaluationProgress(evaluationSessionId: string): Promise<EvaluationProgress> {
    const response = await this.client.get(`/evaluation/sessions/${evaluationSessionId}/progress`);
    return response.data.data;
  }

  // Complete evaluation session
  async completeEvaluation(evaluationSessionId: string): Promise<{ success: boolean }> {
    const response = await this.client.post(`/evaluation/sessions/${evaluationSessionId}/complete`);
    return response.data.data;
  }

  // Import passages from a game session for evaluation
  async importPassagesForEvaluation(gameSessionId: string): Promise<{ passageCount: number }> {
    const response = await this.client.post('/evaluation/passages/import-session', {
      sessionId: gameSessionId,
    });
    return response.data.data;
  }
}

// ============================================================================
// EVALUATION TYPES
// ============================================================================

export interface EvaluationInstrument {
  id: string;
  name: string;
  description: string;
  scales: EvaluationScale[];
  openQuestions: OpenQuestion[];
}

export interface EvaluationScale {
  id: string;
  name: string;
  description: string;
  minValue: number;
  maxValue: number;
  minLabel: string;
  maxLabel: string;
  items: ScaleItem[];
}

export interface ScaleItem {
  id: string;
  text: string;
  reversed?: boolean;
}

export interface OpenQuestion {
  id: string;
  text: string;
  required: boolean;
}

export interface EvaluationSession {
  id: string;
  sessionId: string;
  instrumentId: string;
  status: 'in_progress' | 'completed';
  startedAt: string;
  completedAt?: string;
}

export interface PassageTriad {
  id: string;
  index: number;
  totalCount: number;
  previousScene: PassageContent;
  playerAction: PassageContent;
  consequenceScene: PassageContent;
}

export interface PassageContent {
  name: string;
  text: string;
  tags?: string[];
}

export interface PassageRating {
  passageId: string;
  scaleRatings: Record<string, Record<string, number>>; // scaleId -> itemId -> value
  openResponses: Record<string, string>; // questionId -> response
  timeSpentMs: number;
}

export interface EvaluationProgress {
  totalPassages: number;
  completedPassages: number;
  percentComplete: number;
  estimatedMinutesRemaining: number;
}

export const api = new ParticipantApi();

// Public Enrollment API (no auth required)
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

export interface CustomFieldDefinition {
  id: string;
  type: 'text' | 'number' | 'email' | 'select' | 'multiselect' | 'checkbox' | 'date';
  label: string;
  required: boolean;
  options?: { value: string; label: string }[];
  placeholder?: string;
}

export interface EnrollmentSubmission {
  email: string;
  consentGiven: true;
  demographicData?: Record<string, unknown>;
  availabilityData?: unknown[];
  customFieldData?: Record<string, unknown>;
}

class EnrollmentApi {
  private getApiUrl(): string {
    // Respect stored API URL (same as ParticipantApi for consistency)
    const stored = localStorage.getItem('ariadne_api_url');
    if (stored) return stored;

    if (import.meta.env.DEV) {
      return 'http://localhost:3002/api/v1';
    }
    // Production: web package is served at /study/, API proxy is at /ariadne/api/
    // Note: mobile-web uses /api/v1 because it's served at /ariadne/ with different nginx config
    return `${window.location.origin}/ariadne/api/api/v1`;
  }

  async getPortalBySlug(slug: string): Promise<PublicEnrollmentPortal> {
    const response = await axios.get(`${this.getApiUrl()}/enrollment/by-slug/${slug}`);
    return response.data.data;
  }

  async getPortalStatus(slug: string): Promise<{ isOpen: boolean; reason?: string }> {
    const response = await axios.get(`${this.getApiUrl()}/enrollment/by-slug/${slug}/status`);
    return response.data.data;
  }

  async submitEnrollment(slug: string, data: EnrollmentSubmission): Promise<{ participantId: string; message: string }> {
    const response = await axios.post(`${this.getApiUrl()}/enrollment/by-slug/${slug}`, data);
    return response.data.data;
  }
}

export const enrollmentApi = new EnrollmentApi();
