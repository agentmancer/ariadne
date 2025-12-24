/**
 * Shared types for Ariadne Platform v2.0
 * These types are used across all packages (API, Desktop, Web)
 */

// Re-export Prisma enums for use in frontend
export enum StudyType {
  SINGLE_PARTICIPANT = 'SINGLE_PARTICIPANT',
  PAIRED_COLLABORATIVE = 'PAIRED_COLLABORATIVE',
  MULTI_ROUND = 'MULTI_ROUND',
  CUSTOM = 'CUSTOM'
}

export enum StudyStatus {
  DRAFT = 'DRAFT',
  ACTIVE = 'ACTIVE',
  PAUSED = 'PAUSED',
  COMPLETED = 'COMPLETED',
  ARCHIVED = 'ARCHIVED'
}

export enum ParticipantState {
  ENROLLED = 'ENROLLED',
  SCHEDULED = 'SCHEDULED',
  CONFIRMED = 'CONFIRMED',
  CHECKED_IN = 'CHECKED_IN',
  ACTIVE = 'ACTIVE',
  COMPLETE = 'COMPLETE',
  WITHDRAWN = 'WITHDRAWN',
  EXCLUDED = 'EXCLUDED'
}

export enum SurveyTiming {
  PRE_STUDY = 'PRE_STUDY',
  POST_TASK = 'POST_TASK',
  EXIT = 'EXIT',
  CUSTOM = 'CUSTOM'
}

export enum BiosignalType {
  HEART_RATE = 'HEART_RATE',
  HEART_RATE_VARIABILITY = 'HEART_RATE_VARIABILITY',
  GALVANIC_SKIN_RESPONSE = 'GALVANIC_SKIN_RESPONSE',
  EYE_TRACKING = 'EYE_TRACKING',
  FACIAL_ACTION_UNITS = 'FACIAL_ACTION_UNITS',
  CUSTOM = 'CUSTOM'
}

export enum CommunicationType {
  EMAIL_VERIFICATION = 'EMAIL_VERIFICATION',
  SCHEDULE_NOTIFICATION = 'SCHEDULE_NOTIFICATION',
  REMINDER = 'REMINDER',
  COMPLETION_CERTIFICATE = 'COMPLETION_CERTIFICATE',
  CUSTOM = 'CUSTOM'
}

// ============================================
// SYNTHETIC ACTORS & LLM INTEGRATION
// ============================================

export enum ActorType {
  HUMAN = 'HUMAN',
  SYNTHETIC = 'SYNTHETIC'
}

/**
 * Participant type for mixed human/synthetic studies
 * Extends ActorType with hybrid configurations
 */
export enum ParticipantType {
  HUMAN = 'HUMAN',           // Real person using UI
  SYNTHETIC = 'SYNTHETIC',   // LLM-driven agent
  HYBRID_AUTHOR = 'HYBRID_AUTHOR',   // Human writes, synthetic reads
  HYBRID_READER = 'HYBRID_READER'    // Synthetic writes, human reads
}

/**
 * Session stage progression for human participant studies
 * Based on legacy Ariadne's time-based stage system
 */
export enum SessionStage {
  WAITING = 0,      // Check-in waiting room
  TUTORIAL = 1,     // Twine tutorial video
  AUTHOR_1 = 2,     // First authoring phase
  PLAY_1 = 3,       // Play partner's story
  AUTHOR_2 = 4,     // Revise based on feedback
  PLAY_2 = 5,       // Play revised story
  AUTHOR_3 = 6,     // Final revision
  PLAY_3 = 7,       // Final playthrough
  AUTHOR_4 = 8,     // Polish
  SURVEY = 9,       // Exit survey
  COMPLETE = 10     // Done
}

/**
 * Get human-readable label for a session stage
 */
export function getSessionStageLabel(stage: SessionStage): string {
  const labels: Record<SessionStage, string> = {
    [SessionStage.WAITING]: 'Waiting Room',
    [SessionStage.TUTORIAL]: 'Tutorial',
    [SessionStage.AUTHOR_1]: 'Writing - Round 1',
    [SessionStage.PLAY_1]: 'Playing - Round 1',
    [SessionStage.AUTHOR_2]: 'Writing - Round 2',
    [SessionStage.PLAY_2]: 'Playing - Round 2',
    [SessionStage.AUTHOR_3]: 'Writing - Round 3',
    [SessionStage.PLAY_3]: 'Playing - Round 3',
    [SessionStage.AUTHOR_4]: 'Writing - Round 4',
    [SessionStage.SURVEY]: 'Exit Survey',
    [SessionStage.COMPLETE]: 'Complete'
  };
  return labels[stage] || 'Unknown';
}

/**
 * Check if a stage is an authoring stage
 */
export function isAuthoringStage(stage: SessionStage): boolean {
  return [
    SessionStage.AUTHOR_1,
    SessionStage.AUTHOR_2,
    SessionStage.AUTHOR_3,
    SessionStage.AUTHOR_4
  ].includes(stage);
}

/**
 * Check if a stage is a playing stage
 */
export function isPlayingStage(stage: SessionStage): boolean {
  return [
    SessionStage.PLAY_1,
    SessionStage.PLAY_2,
    SessionStage.PLAY_3
  ].includes(stage);
}

export enum SyntheticActorRole {
  PLAYER = 'PLAYER',
  STORYTELLER = 'STORYTELLER',
  EDITOR = 'EDITOR',
  CONSISTENCY_MANAGER = 'CONSISTENCY_MANAGER',
  EVALUATOR = 'EVALUATOR',
  PARTNER = 'PARTNER',
  CUSTOM = 'CUSTOM'
}

export enum LLMProvider {
  OPENAI = 'openai',
  ANTHROPIC = 'anthropic',
  CUSTOM = 'custom'
}

export enum LLMProviderType {
  API = 'API',
  SERVICE = 'SERVICE'
}

export enum BatchExecutionType {
  TRAINING_DATA = 'TRAINING_DATA',
  EVALUATION = 'EVALUATION',
  SIMULATION = 'SIMULATION'
}

export enum BatchExecutionStatus {
  QUEUED = 'QUEUED',
  RUNNING = 'RUNNING',
  COMPLETE = 'COMPLETE',
  FAILED = 'FAILED',
  PAUSED = 'PAUSED'
}

export enum ToolUseMode {
  AGENTIC = 'AGENTIC',
  SCRIPTED = 'SCRIPTED',
  HYBRID = 'HYBRID'
}

export enum ExperimentDesignType {
  FULL_FACTORIAL = 'FULL_FACTORIAL',
  PARTIAL_FACTORIAL = 'PARTIAL_FACTORIAL',
  CUSTOM = 'CUSTOM'
}

export interface LLMConfig {
  provider: LLMProvider;
  model: string;
  temperature: number;
  maxTokens: number;
  topP?: number;
  frequencyPenalty?: number;
  presencePenalty?: number;
  systemPrompt?: string;
  customEndpoint?: string;
  apiKeyRef?: string; // Reference to encrypted key in database
}

export interface BatchExecutionConfig {
  actorCount?: number;
  role: SyntheticActorRole;
  llmConfig: LLMConfig;
  conditionId?: string;
  parallelism?: number; // Number of actors to run in parallel
  autoExport?: boolean;
  variants?: BatchVariantConfig[];
}

export interface BatchVariantConfig {
  name: string;
  actorCount: number;
  role: SyntheticActorRole;
  llmConfig: LLMConfig;
}

export interface BatchExecution {
  id: string;
  studyId: string;
  name: string;
  description?: string;
  type: BatchExecutionType;
  status: BatchExecutionStatus;
  config: BatchExecutionConfig;
  actorsCreated: number;
  actorsCompleted: number;
  error?: string;
  exportPath?: string;
  createdAt: Date | string;
  startedAt?: Date | string;
  completedAt?: Date | string;
}

export interface LLMProviderConfig {
  id: string;
  researcherId: string;
  name: string;
  provider: LLMProvider;
  type: LLMProviderType;
  apiKey?: string; // Encrypted
  endpoint?: string;
  config?: Record<string, unknown>;
  active: boolean;
  createdAt: Date | string;
  updatedAt: Date | string;
}

export interface AgentDefinition {
  id: string;
  researcherId: string;
  name: string;
  description?: string;
  role: SyntheticActorRole;
  llmConfig: LLMConfig;
  enabledTools: string[]; // Tool IDs
  toolUseMode: ToolUseMode;
  agenticConfig?: Record<string, unknown>;
  scriptedWorkflow?: Record<string, unknown>;
  systemPrompt: string;
  toolUseInstructions?: string;
  isPublic: boolean;
  tags: string[];
  createdAt: Date | string;
  updatedAt: Date | string;
}

export interface ToolUsageLog {
  id: string;
  participantId: string;
  toolId: string;
  params: Record<string, unknown>;
  result: Record<string, unknown>;
  success: boolean;
  latencyMs: number;
  timestamp: Date | string;
}

export interface ExperimentalVariable {
  id: string;
  name: string;
  description?: string;
  type: 'categorical' | 'continuous' | 'ordinal';
  levels: ExperimentalVariableLevel[];
}

export interface ExperimentalVariableLevel {
  id: string;
  name: string;
  value: unknown; // The actual value (could be config object, number, string, etc.)
  description?: string;
}

export interface ExperimentDesign {
  id: string;
  studyId: string;
  name: string;
  description?: string;
  variables: ExperimentalVariable[];
  designType: ExperimentDesignType;
  customConditions?: unknown;
  participantsPerCondition: number;
  syntheticActorsPerCondition: number;
  dependentVariables: DependentVariable[];
  analysisConfig?: Record<string, unknown>;
  createdAt: Date | string;
  updatedAt: Date | string;
}

export interface DependentVariable {
  id: string;
  name: string;
  description?: string;
  type: 'metric' | 'survey' | 'event' | 'custom';
  extractionMethod?: string; // How to extract this variable from data
}

export interface ExperimentalCondition {
  id: string;
  experimentId: string;
  name: string;
  variableLevels: Record<string, string>; // variableId -> levelId
  resolvedConfig: Record<string, unknown>;
  conditionId?: string; // Link to actual study condition
  createdAt: Date | string;
}

export interface ExperimentResult {
  id: string;
  experimentId: string;
  conditionId: string;
  participantId: string;
  metrics: Record<string, unknown>; // variableId -> computed value
  createdAt: Date | string;
}

// ============================================
// EVENT TYPES
// ============================================

export enum EventType {
  // Navigation events
  NAVIGATE = 'navigate',
  CHANGE_PASSAGE = 'change_passage',
  REWIND = 'rewind',

  // Story editing events
  STORY_UPDATE = 'story_update',
  PASSAGE_CREATE = 'passage_create',
  PASSAGE_EDIT = 'passage_edit',
  PASSAGE_DELETE = 'passage_delete',
  LINK_CREATE = 'link_create',
  LINK_DELETE = 'link_delete',

  // Interaction events
  COMMENT = 'comment',
  ANNOTATION = 'annotation',
  RATING = 'rating',

  // Session events
  SESSION_START = 'session_start',
  SESSION_END = 'session_end',
  TASK_START = 'task_start',
  TASK_COMPLETE = 'task_complete',

  // Survey events
  SURVEY_START = 'survey_start',
  SURVEY_SUBMIT = 'survey_submit',
  QUESTION_ANSWER = 'question_answer',

  // Plugin events
  PLUGIN_LOAD = 'plugin_load',
  PLUGIN_ERROR = 'plugin_error',

  // AI events
  AI_GENERATION_START = 'ai_generation_start',
  AI_GENERATION_COMPLETE = 'ai_generation_complete',
  AI_GENERATION_ERROR = 'ai_generation_error',

  // Custom
  CUSTOM = 'custom'
}

export interface EventData {
  type: EventType | string;
  category?: string;
  data: Record<string, unknown>;
  context?: string;
  timestamp?: Date | string;
  sequenceNum?: number;
}

// ============================================
// SURVEY TYPES
// ============================================

export enum QuestionType {
  MULTIPLE_CHOICE = 'multiple_choice',
  LIKERT = 'likert',
  TEXT = 'text',
  TEXTAREA = 'textarea',
  NUMBER = 'number',
  SCALE = 'scale',
  CHECKBOX = 'checkbox',
  DATE = 'date',
  EMAIL = 'email'
}

export interface BaseQuestion {
  id: string;
  type: QuestionType;
  text: string;
  required?: boolean;
  description?: string;
}

export interface MultipleChoiceQuestion extends BaseQuestion {
  type: QuestionType.MULTIPLE_CHOICE;
  options: string[];
  allowOther?: boolean;
}

export interface LikertQuestion extends BaseQuestion {
  type: QuestionType.LIKERT;
  scale: number; // e.g., 5 for 1-5, 7 for 1-7
  labels?: {
    min?: string;
    max?: string;
  };
}

export interface TextQuestion extends BaseQuestion {
  type: QuestionType.TEXT | QuestionType.TEXTAREA | QuestionType.EMAIL;
  placeholder?: string;
  maxLength?: number;
}

export interface NumberQuestion extends BaseQuestion {
  type: QuestionType.NUMBER;
  min?: number;
  max?: number;
  step?: number;
}

export interface ScaleQuestion extends BaseQuestion {
  type: QuestionType.SCALE;
  min: number;
  max: number;
  step?: number;
  labels?: Record<number, string>;
}

export interface CheckboxQuestion extends BaseQuestion {
  type: QuestionType.CHECKBOX;
  options: string[];
  minSelections?: number;
  maxSelections?: number;
}

export type Question =
  | MultipleChoiceQuestion
  | LikertQuestion
  | TextQuestion
  | NumberQuestion
  | ScaleQuestion
  | CheckboxQuestion;

export interface SurveyDefinition {
  id?: string;
  name: string;
  description?: string;
  timing: SurveyTiming;
  questions: Question[];
}

export type SurveyResponseValue = string | number | string[] | boolean;

export interface SurveyResponseData {
  surveyId: string;
  participantId: string;
  responses: Record<string, SurveyResponseValue>;
}

// ============================================
// STUDY CONFIGURATION
// ============================================

export interface StudyConfig {
  // Workflow configuration
  workflow?: {
    rounds?: number;
    tasksPerRound?: number;
    timePerTask?: number; // minutes
  };

  // Plugin configuration
  plugins?: {
    storyPlatform: string; // 'twine', 'ai-generator', etc.
    pluginConfig?: Record<string, unknown>;
  };

  // Collaboration settings
  collaboration?: {
    enabled: boolean;
    pairingMethod?: 'manual' | 'automatic' | 'self-select';
  };

  // Biosignal collection
  biosignals?: {
    enabled: boolean;
    types?: BiosignalType[];
  };

  // Email automation
  emails?: {
    verification?: boolean;
    reminders?: boolean;
    completion?: boolean;
  };

  // Custom settings
  custom?: Record<string, unknown>;
}

export interface ConditionConfig {
  // AI assistance
  aiEnabled?: boolean;
  aiModel?: string;
  aiPrompt?: string;

  // Feature toggles
  features?: Record<string, boolean>;

  // Plugin-specific config
  pluginConfig?: Record<string, unknown>;

  // Story architecture configuration (for parameterized experiments)
  architectureConfig?: StoryArchitectureConfig;

  // Custom settings
  custom?: Record<string, unknown>;
}

// ============================================
// STORY ARCHITECTURE CONFIGURATION
// For parameterized experiments comparing different narrative approaches
// ============================================

/**
 * Agent roles in story generation
 */
export enum StoryAgentRole {
  NARRATOR = 'NARRATOR',                    // Main story narrator
  CHARACTER_ADVOCATE = 'CHARACTER_ADVOCATE', // Advocates for a specific character's goals
  DRAMA_MANAGER = 'DRAMA_MANAGER',          // Manages dramatic tension and pacing
  QUESTION_TRACKER = 'QUESTION_TRACKER',    // Tracks narrative questions (erotetic approach)
  CONSISTENCY_CHECKER = 'CONSISTENCY_CHECKER', // Validates story consistency
  WORLD_BUILDER = 'WORLD_BUILDER',          // Manages world state and rules
  EVALUATOR = 'EVALUATOR',                  // Evaluates narrative quality
  CUSTOM = 'CUSTOM'                         // Custom role defined by prompt
}

/**
 * Agent definition for story generation
 */
export interface StoryAgentDefinition {
  agentId: string;
  role: StoryAgentRole;
  promptTemplate: string;
  model: string;
  temperature?: number;
  maxTokens?: number;
  // Debate capabilities
  canRebut?: boolean;    // Can argue against other agents
  canConcede?: boolean;  // Can agree with other agents
  // Character association (for CHARACTER_ADVOCATE role)
  characterId?: string;
}

/**
 * Debate/negotiation structure between agents
 */
export type DebateStructureType = 'single' | 'parallel' | 'sequential' | 'rounds';
export type ResolutionStrategy = 'synthesis' | 'voting' | 'weighted' | 'consensus';

export interface DebateStructure {
  structureType: DebateStructureType;
  numRounds?: number;
  resolutionStrategy: ResolutionStrategy;
  // Optional: weights for weighted resolution
  agentWeights?: Record<string, number>;
  // Timeout per debate round (ms)
  roundTimeoutMs?: number;
}

/**
 * State representation approach
 */
export type StateRepresentationType = 'pydantic' | 'graph' | 'questions' | 'hybrid';

export interface StateRepresentation {
  representationType: StateRepresentationType;
  // Question-based tracking (Carroll's erotetic narrative theory)
  trackMacroQuestions?: boolean;  // Major narrative questions
  trackMicroQuestions?: boolean;  // Scene-level questions
  // Possible worlds semantics for belief tracking
  usePossibleWorlds?: boolean;
  // Graph-based state
  useCharacterGraph?: boolean;
  useWorldGraph?: boolean;
}

/**
 * Model-specific adaptations for different LLMs
 */
export type PromptStyle = 'direct' | 'chat' | 'instruct' | 'cot';
export type ContextPresentation = 'json' | 'prose' | 'triples' | 'structured';

export interface ModelCapabilities {
  supportsJson?: boolean;
  supportsNestedBeliefs?: boolean;
  supportsGraphUpdates?: boolean;
  maxContextLength?: number;
  // Empirically discovered capabilities
  empirical?: Record<string, boolean>;
}

export interface ModelAdaptation {
  modelPattern: string;  // Regex pattern, e.g., "qwen.*", "llama.*"
  promptStyle: PromptStyle;
  contextPresentation: ContextPresentation;
  capabilities?: ModelCapabilities;
}

/**
 * Complete story architecture configuration
 */
export interface StoryArchitectureConfig {
  // Configuration identifier
  configId?: string;
  name?: string;
  description?: string;

  // Agent setup
  agents: StoryAgentDefinition[];

  // Multi-agent debate structure (if multiple agents)
  debateStructure?: DebateStructure;

  // State representation approach
  stateRepresentation?: StateRepresentation;

  // Model-specific adaptations
  modelAdaptations?: ModelAdaptation[];

  // Story constraints
  storyConstraints?: {
    genre?: string;
    theme?: string;
    setting?: string;
    minPassages?: number;
    maxPassages?: number;
    targetWordCount?: number;
  };

  // Evaluation settings
  evaluationConfig?: {
    enableCoherenceScoring?: boolean;
    enableConsistencyChecks?: boolean;
    enableEngagementMetrics?: boolean;
    customMetrics?: string[];  // Custom metric names to track
  };
}

// ============================================
// STORY METRICS & ANALYSIS
// ============================================

/**
 * Metrics collected from a story playthrough
 */
export interface StoryMetrics {
  // Basic stats
  passageCount: number;
  wordCount: number;
  choiceCount: number;
  uniquePathsTaken?: number;

  // Quality metrics
  coherenceScore?: number;      // 0-1, narrative coherence
  consistencyScore?: number;    // 0-1, internal consistency
  engagementScore?: number;     // 0-1, estimated engagement

  // Character metrics
  characterConsistencyScores?: Record<string, number>;
  goalProgressionScores?: Record<string, number>;

  // Question tracking (if enabled)
  questionsRaised?: number;
  questionsAnswered?: number;
  questionClosureRate?: number;

  // Debate metrics (if multi-agent)
  debateRounds?: number;
  consensusReached?: boolean;
  contradictionCount?: number;

  // Timing
  totalGenerationTimeMs?: number;
  averageResponseTimeMs?: number;

  // Custom metrics
  custom?: Record<string, number | string | boolean>;
}

/**
 * Comparison result across conditions
 */
export interface ConditionComparison {
  conditionId: string;
  conditionName: string;
  playthroughCount: number;
  metrics: {
    mean: StoryMetrics;
    stdDev?: Partial<StoryMetrics>;
    min?: Partial<StoryMetrics>;
    max?: Partial<StoryMetrics>;
  };
}

// ============================================
// API TYPES
// ============================================

export interface ApiResponse<T = unknown> {
  success: boolean;
  data?: T;
  error?: {
    code: string;
    message: string;
    details?: unknown;
  };
}

export interface PaginatedResponse<T> {
  items: T[];
  total: number;
  page: number;
  pageSize: number;
  hasNext: boolean;
}

// ============================================
// AUTHENTICATION & AUTHORIZATION
// ============================================

export enum ResearcherRole {
  ADMIN = 'ADMIN',
  RESEARCHER = 'RESEARCHER'
}

/**
 * Role for project sharing
 */
export enum ShareRole {
  VIEWER = 'VIEWER',   // Can view project and studies, but not modify
  EDITOR = 'EDITOR',   // Can edit studies and participants, but not delete project
  ADMIN = 'ADMIN'      // Full access except transferring ownership
}

export enum AccountStatus {
  ACTIVE = 'ACTIVE',
  SUSPENDED = 'SUSPENDED',
  PENDING_VERIFICATION = 'PENDING_VERIFICATION'
}

export enum AgentExecutionMode {
  LOCAL = 'LOCAL',   // Browser-based with local Ollama
  SERVER = 'SERVER'  // Server-side queue workers
}

export interface ResearcherSettings {
  // Agent execution preference
  agentExecutionMode: AgentExecutionMode;

  // Default LLM provider ID (reference to LLMProvider)
  defaultLLMProviderId?: string;

  // Local Ollama configuration (for LOCAL mode)
  ollamaConfig?: {
    endpoint: string;  // Default: http://localhost:11434
    defaultModel: string;  // Default: llama3.2
  };

  // UI preferences
  ui?: {
    theme?: 'light' | 'dark' | 'system';
    sidebarCollapsed?: boolean;
    defaultView?: string;
  };

  // Notification preferences
  notifications?: {
    email?: boolean;
    studyUpdates?: boolean;
    batchCompletion?: boolean;
  };
}

export const DEFAULT_RESEARCHER_SETTINGS: ResearcherSettings = {
  agentExecutionMode: AgentExecutionMode.LOCAL,
  ollamaConfig: {
    endpoint: 'http://localhost:11434',
    defaultModel: 'llama3.2'
  },
  ui: {
    theme: 'system'
  },
  notifications: {
    email: true,
    studyUpdates: true,
    batchCompletion: true
  }
};

export interface LoginCredentials {
  email: string;
  password: string;
}

export interface RegisterData {
  email: string;
  password: string;
  name: string;
}

export interface AuthTokens {
  accessToken: string;
  refreshToken?: string;
}

export interface ResearcherProfile {
  id: string;
  email: string;
  name: string;
  role: ResearcherRole;
  status: AccountStatus;
  settings: ResearcherSettings;
  emailVerified: boolean;
  createdAt: Date | string;
}

// Password reset types
export interface PasswordResetRequest {
  email: string;
}

export interface PasswordResetConfirm {
  token: string;
  newPassword: string;
}

export interface ChangePasswordRequest {
  currentPassword: string;
  newPassword: string;
}

// Admin types for managing researchers
export interface ResearcherListItem {
  id: string;
  email: string;
  name: string;
  role: ResearcherRole;
  status: AccountStatus;
  emailVerified: boolean;
  createdAt: Date | string;
  updatedAt: Date | string;
}

export interface UpdateResearcherRole {
  researcherId: string;
  role: ResearcherRole;
}

export interface UpdateResearcherStatus {
  researcherId: string;
  status: AccountStatus;
}

// ============================================
// PROJECT SHARING
// ============================================

/**
 * A project share grants a researcher access to another researcher's project
 */
export interface ProjectShare {
  id: string;
  projectId: string;
  sharedWithId: string;
  sharedWith?: {
    id: string;
    email: string;
    name: string;
  };
  role: ShareRole;
  sharedById: string;
  sharedBy?: {
    id: string;
    email: string;
    name: string;
  };
  createdAt: Date | string;
  updatedAt: Date | string;
}

/**
 * Create project share request
 */
export interface CreateProjectShareRequest {
  email: string;  // Email of researcher to share with
  role: ShareRole;
}

/**
 * Update project share request
 */
export interface UpdateProjectShareRequest {
  role: ShareRole;
}

/**
 * Project with share information for the current user
 */
export interface ProjectWithAccess {
  id: string;
  name: string;
  description?: string | null;
  researcherId: string;
  researcher?: {
    id: string;
    email: string;
    name: string;
  };
  createdAt: Date | string;
  updatedAt: Date | string;
  // Access information
  isOwner: boolean;
  shareRole?: ShareRole;  // undefined if owner, otherwise the share role
}

// ============================================
// PROLIFIC INTEGRATION
// ============================================

export interface ProlificStudyConfig {
  name: string;
  description: string;
  externalStudyUrl: string;
  estimatedCompletionTime: number; // minutes
  reward: number; // pence (GBP)
  totalAvailablePlaces: number;
  eligibilityRequirements?: unknown[];
}

export interface ProlificParticipant {
  participantId: string;
  studyId: string;
  sessionId: string;
  status: string;
}

// ============================================
// COLLABORATIVE STUDY TYPES
// ============================================

export enum CollaborativePhase {
  AUTHOR = 'AUTHOR',
  PLAY = 'PLAY',
  REVIEW = 'REVIEW'
}

export enum CommentType {
  FEEDBACK = 'FEEDBACK',
  SUGGESTION = 'SUGGESTION',
  QUESTION = 'QUESTION',
  PRAISE = 'PRAISE',
  CRITIQUE = 'CRITIQUE'
}

// Story draft entry stored in AgentContext.ownStoryDrafts
export interface StoryDraftEntry {
  round: number;
  storyDataId: string;
  summary: string;
  createdAt: string;
}

// Play experience entry stored in AgentContext.partnerStoriesPlayed
export interface PlayExperienceEntry {
  round: number;
  storyDataId: string;
  playNotes: string;
  choicesMade: Array<{
    passageId: string;
    choiceText: string;
    reasoning?: string;
  }>;
  observations: string[];
  overallImpression?: string;
}

// Feedback entry stored in AgentContext.feedbackGiven/feedbackReceived
export interface FeedbackEntry {
  round: number;
  comments: string[];
  strengths: string[];
  improvements: string[];
  overallAssessment?: string;
}

// Learning entry stored in AgentContext.cumulativeLearnings
export interface LearningEntry {
  round: number;
  insight: string;
  category: 'storytelling' | 'structure' | 'engagement' | 'collaboration' | 'other';
  appliedInRound?: number;
}

// Full AgentContext for collaborative studies
export interface AgentCollaborativeContext {
  id: string;
  participantId: string;
  currentRound: number;
  currentPhase: CollaborativePhase;
  ownStoryDrafts: StoryDraftEntry[];
  partnerStoriesPlayed: PlayExperienceEntry[];
  feedbackGiven: FeedbackEntry[];
  feedbackReceived: FeedbackEntry[];
  cumulativeLearnings: LearningEntry[];
  createdAt: Date | string;
  updatedAt: Date | string;
}

// Comment for feedback during collaborative studies
export interface Comment {
  id: string;
  authorId: string;
  targetParticipantId: string;
  storyDataId?: string;
  passageId?: string;
  content: string;
  commentType: CommentType;
  round: number;
  phase: CollaborativePhase;
  parentId?: string;
  resolved: boolean;
  addressedInRound?: number;
  createdAt: Date | string;
  updatedAt: Date | string;
}

// Collaborative study configuration extension
export interface CollaborativeStudyConfig extends StudyConfig {
  collaboration: {
    enabled: true;
    pairingMethod: 'manual' | 'automatic' | 'self-select';
    rounds: number;
    phasesPerRound: CollaborativePhase[];
    feedbackRequired: boolean;
    revisionRequired: boolean;
  };
}

// Phase transition event data
export interface PhaseTransitionEvent {
  participantId: string;
  fromPhase: CollaborativePhase;
  toPhase: CollaborativePhase;
  round: number;
  completedAt: string;
}

// Pairing information
export interface ParticipantPairing {
  participantAId: string;
  participantBId: string;
  studyId: string;
  pairedAt: string;
  status: 'active' | 'completed' | 'dissolved';
}

// ============================================
// PARTNER PAIRING SERVICE
// ============================================

/**
 * Pairing strategy for matching participants
 */
export enum PairingStrategy {
  HUMAN_HUMAN = 'HUMAN_HUMAN',         // Match humans with humans
  SYNTHETIC_SYNTHETIC = 'SYNTHETIC_SYNTHETIC', // Match synthetics with synthetics
  HUMAN_SYNTHETIC = 'HUMAN_SYNTHETIC', // Pair human with synthetic partner
  AUTO = 'AUTO'                        // System decides based on availability
}

/**
 * Configuration for pairing participants
 */
export interface PairingConfig {
  studyId: string;
  strategy: PairingStrategy;
  // Optional: specific condition to pair within
  conditionId?: string;
  // For HUMAN_SYNTHETIC: which role should synthetic play?
  syntheticRole?: 'AUTHOR' | 'READER';
  // For HUMAN_HUMAN: match by availability overlap
  requireAvailabilityOverlap?: boolean;
  minOverlapHours?: number;
  // For AUTO: preferences
  preferHumanPartners?: boolean;
  // Maximum wait time before falling back to synthetic (ms)
  maxWaitMs?: number;
}

/**
 * Result of a pairing operation
 */
export interface PairingResult {
  participantId: string;
  partnerId: string;
  strategy: PairingStrategy;
  pairedAt: string;
  metadata: PairingMetadata;
}

/**
 * Metadata stored with pairing
 */
export interface PairingMetadata {
  pairedAt: string;
  strategy: PairingStrategy;
  matchedBy: 'system' | 'manual' | 'self-select';
  // For availability-based matching
  overlapHours?: number;
  // For hybrid pairings
  humanRole?: 'AUTHOR' | 'READER';
  // Synthetic partner details
  syntheticAgentId?: string;
  // Manual pairing details
  pairedByResearcherId?: string;
}

// ============================================
// ENROLLMENT TYPES
// ============================================

/**
 * Enrollment consent record
 */
export interface EnrollmentConsent {
  agreed: boolean;
  consentedAt: string;
  documentVersion?: string;
}

/**
 * Availability time slot for scheduling
 */
export interface AvailabilitySlot {
  dayOfWeek: number; // 0-6 (Sunday-Saturday)
  startHour: number; // 0-23
  endHour: number;   // 0-23
}

/**
 * Demographics collected during enrollment
 * Based on legacy Application model
 */
export interface EnrollmentDemographics {
  // Academic
  majorDegree?: string;

  // Identity
  ethnicRacialAffiliation?: string;
  genderAffiliation?: string;

  // Language
  nativeLanguage?: string;
  languagePreference?: string;

  // Experience
  prevExperience?: string; // Previous IDN/IF experience

  // Social
  intro: string; // Bio shared with partner (required)
}

/**
 * Full enrollment application data
 * Stored in Participant.application JSON field
 */
export interface EnrollmentApplication {
  consent: EnrollmentConsent;
  demographics: EnrollmentDemographics;
  availability: AvailabilitySlot[];
  email: string;
  timezone?: string;
  submittedAt: string;
}

/**
 * Enrollment request body for POST /studies/:studyId/enroll
 */
export interface EnrollRequest {
  consent: EnrollmentConsent;
  demographics: EnrollmentDemographics;
  availability: AvailabilitySlot[];
  email: string;
  timezone?: string;
}

/**
 * Enrollment status for a study
 */
export interface EnrollmentStatus {
  studyId: string;
  studyName: string;
  isOpen: boolean;
  enrolledCount: number;
  maxParticipants?: number;
  startDate?: string;
  endDate?: string;
  requiresAvailability: boolean;
}

/**
 * Enrollment result returned after successful submission
 */
export interface EnrollmentResult {
  participantId: string;
  uniqueId: string;
  studyId: string;
  studyName?: string;
  state: ParticipantState;
  enrolledAt: string;
}

// ============================================
// ENROLLMENT CONFIGURATION
// ============================================

/**
 * Custom field definition for enrollment forms
 */
export interface CustomFieldDefinition {
  id: string;
  name: string;
  label: string;
  type: 'text' | 'textarea' | 'select' | 'checkbox' | 'radio' | 'number';
  required: boolean;
  placeholder?: string;
  options?: { value: string; label: string }[];
  validation?: {
    minLength?: number;
    maxLength?: number;
    min?: number;
    max?: number;
    pattern?: string;
  };
}

/**
 * Consent version history entry
 */
export interface ConsentVersionEntry {
  id: string;
  version: string;
  content: string; // Markdown
  effectiveDate: string;
  createdAt: string;
}

/**
 * Enrollment configuration for a study
 * Stored in EnrollmentConfig table
 */
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

/**
 * Request to create enrollment config
 */
export interface CreateEnrollmentConfigRequest {
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

/**
 * Request to update enrollment config
 */
export interface UpdateEnrollmentConfigRequest {
  slug?: string;
  enabled?: boolean;
  maxParticipants?: number | null;
  openAt?: string | null;
  closeAt?: string | null;
  welcomeContent?: string | null;
  consentDocument?: string | null;
  consentVersion?: string;
  instructionsContent?: string | null;
  completionContent?: string | null;
  requireAvailability?: boolean;
  customFields?: CustomFieldDefinition[];
  sendConfirmationEmail?: boolean;
  confirmationEmailTemplate?: string | null;
}

/**
 * Public enrollment portal data (returned to unauthenticated users)
 */
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
    welcome: string | null;     // Rendered HTML
    consent: string | null;     // Rendered HTML
    consentVersion: string;
    instructions: string | null; // Rendered HTML
    completion: string | null;   // Rendered HTML
  };
}

/**
 * Email template variables available for substitution
 */
export interface EmailTemplateVariables {
  participantName?: string;
  participantEmail?: string;
  participantId?: string;
  studyName?: string;
  studyDescription?: string;
  enrollmentDate?: string;
  portalUrl?: string;
  sessionUrl?: string;
}

// ============================================
// HYBRID STUDY ORCHESTRATION
// ============================================

/**
 * Execution mode for collaborative studies
 * Determines how phase transitions are handled
 */
export enum StudyExecutionMode {
  SYNCHRONOUS = 'SYNCHRONOUS',     // Both participants are synthetic, run immediately in parallel
  ASYNCHRONOUS = 'ASYNCHRONOUS',   // Has human participant, wait for phase submissions
  TIMED = 'TIMED'                  // Legacy time-based progression (SessionStage)
}

/**
 * Phase completion status for async execution
 */
export enum PhaseCompletionStatus {
  PENDING = 'PENDING',     // Phase not started
  IN_PROGRESS = 'IN_PROGRESS', // Phase started, not complete
  COMPLETED = 'COMPLETED', // Phase finished
  SKIPPED = 'SKIPPED',     // Phase skipped (timeout, withdrawal)
  FAILED = 'FAILED'        // Phase failed (error)
}

/**
 * Tracks completion of a phase by a participant
 */
export interface PhaseCompletion {
  participantId: string;
  partnerId?: string;  // Optional - not present on initial phase
  round: number;
  phase: CollaborativePhase;
  status: PhaseCompletionStatus;
  startedAt?: string;
  completedAt?: string;
  result?: {
    storyDataId?: string;   // For AUTHOR phase
    playSessionId?: string; // For PLAY phase
    feedbackIds?: string[]; // For REVIEW phase
  };
}

/**
 * Time limits for hybrid study phases
 */
export interface PhaseTimeLimits {
  [CollaborativePhase.AUTHOR]?: number;  // Max minutes for authoring
  [CollaborativePhase.PLAY]?: number;    // Max minutes for playing
  [CollaborativePhase.REVIEW]?: number;  // Max minutes for review
}

/**
 * Synthetic partner configuration for hybrid studies
 */
export interface SyntheticPartnerConfig {
  agentDefinitionId: string;
  responseDelayMs?: number;   // Simulate human-like delays
  autoProgress?: boolean;     // Auto-complete phases when partner finishes
}

/**
 * Configuration for hybrid human/synthetic collaborative studies
 */
export interface HybridStudyConfig extends CollaborativeStudyConfig {
  executionMode: StudyExecutionMode;
  humanRole: 'AUTHOR' | 'READER' | 'BOTH';
  maxPlayActions?: number;  // Max actions per play phase (default: 20)
  phaseTimeLimits?: PhaseTimeLimits;
  syntheticPartner?: SyntheticPartnerConfig;
  // Notification settings
  notifications?: {
    onPartnerReady?: boolean;   // Notify when partner completes phase
    phaseReminders?: boolean;   // Send reminder before time limit
    reminderMinutes?: number;   // Minutes before limit to remind
  };
}

/**
 * Event emitted when a phase is ready for a participant
 */
export interface PhaseReadyEvent {
  participantId: string;
  round: number;
  phase: CollaborativePhase;
  partnerContent?: {
    storyDataId?: string;   // Partner's story to play
    feedbackIds?: string[]; // Partner's feedback on your story
  };
  timeLimit?: number;       // Minutes until phase expires
}

/**
 * Event emitted when a participant completes a phase
 */
export interface PhaseCompleteEvent {
  participantId: string;
  partnerId: string;
  round: number;
  phase: CollaborativePhase;
  completedAt: string;
  result: PhaseCompletion['result'];
}

/**
 * Orchestration state for a hybrid session
 */
export interface HybridSessionState {
  sessionId: string;
  studyId: string;
  participantA: {
    id: string;
    type: ParticipantType;
    currentPhase: CollaborativePhase;
    currentRound: number;
    completions: PhaseCompletion[];
  };
  participantB: {
    id: string;
    type: ParticipantType;
    currentPhase: CollaborativePhase;
    currentRound: number;
    completions: PhaseCompletion[];
  };
  config: HybridStudyConfig;
  startedAt: string;
  completedAt?: string;
}
