/**
 * Zod validators for API requests and data validation
 */

import { z } from 'zod';
import {
  StudyType,
  StudyStatus,
  ParticipantState,
  ParticipantType,
  SessionStage,
  SurveyTiming,
  QuestionType,
  BiosignalType,
  ResearcherRole,
  AccountStatus,
  AgentExecutionMode,
  StoryAgentRole,
  PairingStrategy,
  ShareRole
} from './types';

// ============================================
// AUTHENTICATION VALIDATORS
// ============================================

// Password complexity requirements:
// - At least 8 characters
// - At least one uppercase letter
// - At least one lowercase letter
// - At least one number
export const passwordSchema = z.string()
  .min(8, 'Password must be at least 8 characters')
  .regex(/[A-Z]/, 'Password must contain at least one uppercase letter')
  .regex(/[a-z]/, 'Password must contain at least one lowercase letter')
  .regex(/[0-9]/, 'Password must contain at least one number');

export const loginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(1) // Login doesn't need complexity check
});

export const registerSchema = z.object({
  email: z.string().email(),
  password: passwordSchema,
  name: z.string().min(1),
  // reCAPTCHA token (optional - will be required when reCAPTCHA is enabled)
  recaptchaToken: z.string().optional()
});

// Password reset validators
export const passwordResetRequestSchema = z.object({
  email: z.string().email(),
  recaptchaToken: z.string().optional()
});

export const passwordResetConfirmSchema = z.object({
  token: z.string().min(1),
  newPassword: passwordSchema
});

export const changePasswordSchema = z.object({
  currentPassword: z.string().min(1),
  newPassword: passwordSchema
});

// Account settings validators
export const ollamaConfigSchema = z.object({
  endpoint: z.string().url().default('http://localhost:11434'),
  defaultModel: z.string().default('llama3.2')
});

export const uiPreferencesSchema = z.object({
  theme: z.enum(['light', 'dark', 'system']).optional(),
  sidebarCollapsed: z.boolean().optional(),
  defaultView: z.string().optional()
});

export const notificationPreferencesSchema = z.object({
  email: z.boolean().optional(),
  studyUpdates: z.boolean().optional(),
  batchCompletion: z.boolean().optional()
});

export const updateSettingsSchema = z.object({
  agentExecutionMode: z.nativeEnum(AgentExecutionMode).optional(),
  defaultLLMProviderId: z.string().optional(),
  ollamaConfig: ollamaConfigSchema.optional(),
  ui: uiPreferencesSchema.optional(),
  notifications: notificationPreferencesSchema.optional()
});

// Admin validators for managing researchers
export const updateResearcherRoleSchema = z.object({
  role: z.nativeEnum(ResearcherRole)
});

export const updateResearcherStatusSchema = z.object({
  status: z.nativeEnum(AccountStatus)
});

// ============================================
// PROJECT VALIDATORS
// ============================================

export const createProjectSchema = z.object({
  name: z.string().min(1).max(255),
  description: z.string().optional()
});

export const updateProjectSchema = createProjectSchema.partial();

// ============================================
// PROJECT SHARE VALIDATORS
// ============================================

export const createProjectShareSchema = z.object({
  email: z.string().email('Invalid email address'),
  role: z.nativeEnum(ShareRole)
});

export const updateProjectShareSchema = z.object({
  role: z.nativeEnum(ShareRole)
});

// ============================================
// STUDY VALIDATORS
// ============================================

export const createStudySchema = z.object({
  projectId: z.string(),
  name: z.string().min(1).max(255),
  description: z.string().optional(),
  type: z.nativeEnum(StudyType),
  config: z.record(z.unknown()).optional(),
  prolificEnabled: z.boolean().default(false),
  prolificStudyId: z.string().optional(),
  startDate: z.string().datetime().optional(),
  endDate: z.string().datetime().optional()
});

export const updateStudySchema = createStudySchema.partial().extend({
  status: z.nativeEnum(StudyStatus).optional()
});

// ============================================
// CONDITION VALIDATORS
// ============================================

// Note: createConditionSchema is defined below after storyArchitectureConfigSchema
// to avoid forward reference issues

// Placeholder - actual schema defined later in file
export const createConditionSchema = z.object({
  studyId: z.string(),
  name: z.string().min(1).max(255),
  description: z.string().optional(),
  config: z.record(z.unknown()).optional(),
  // Architecture config fields are added via lazy reference below
  architectureConfig: z.any().optional(), // Validated by storyArchitectureConfigSchema at runtime
  architectureConfigKey: z.string().optional() // Reference to predefined config (e.g., 'baseline-single-agent')
});

export const updateConditionSchema = createConditionSchema.partial().omit({ studyId: true });

// ============================================
// PARTICIPANT VALIDATORS
// ============================================

/**
 * Application/enrollment data schema for human participants
 * Contains demographics, availability, consent info
 */
export const participantApplicationSchema = z.object({
  // Demographics
  age: z.number().int().min(18).max(120).optional(),
  gender: z.string().optional(),
  education: z.string().optional(),
  occupation: z.string().optional(),

  // Availability for scheduled sessions
  availability: z.array(z.object({
    dayOfWeek: z.number().int().min(0).max(6),
    startHour: z.number().int().min(0).max(23),
    endHour: z.number().int().min(0).max(23)
  }).refine(
    (slot) => slot.startHour < slot.endHour,
    { message: 'startHour must be less than endHour' }
  )).optional(),
  timezone: z.string().optional(),

  // Consent tracking
  consentGiven: z.boolean().optional(),
  consentTimestamp: z.string().datetime().optional(),

  // Study-specific fields (flexible)
  custom: z.record(z.unknown()).optional()
});

export const createParticipantSchema = z.object({
  studyId: z.string(),
  conditionId: z.string().optional(),
  email: z.string().email().optional(),
  prolificId: z.string().optional(),
  metadata: z.record(z.unknown()).optional(),

  // Participant type (supports hybrid studies)
  type: z.nativeEnum(ParticipantType).optional().default(ParticipantType.HUMAN),
  // Legacy field - kept for backwards compatibility, maps to type
  actorType: z.enum(['HUMAN', 'SYNTHETIC']).optional(),

  // Synthetic actor fields
  role: z.string().optional(),
  llmConfig: z.record(z.unknown()).optional(),
  batchId: z.string().optional(),
  agentDefinitionId: z.string().optional(),

  // Human participant session fields
  currentStage: z.nativeEnum(SessionStage).optional().default(SessionStage.WAITING),
  application: participantApplicationSchema.optional()
}).refine(
  (data) => {
    // Validate actorType/type consistency
    if (data.actorType === 'SYNTHETIC' && data.type !== ParticipantType.SYNTHETIC) {
      return false;
    }
    if (data.actorType === 'HUMAN' && data.type === ParticipantType.SYNTHETIC) {
      return false;
    }
    return true;
  },
  {
    message: 'actorType and type must be consistent: SYNTHETIC actorType requires SYNTHETIC type, HUMAN actorType cannot have SYNTHETIC type',
    path: ['type']
  }
);

export const updateParticipantSchema = z.object({
  state: z.nativeEnum(ParticipantState).optional(),
  conditionId: z.string().optional(),
  partnerId: z.string().optional(),
  metadata: z.record(z.unknown()).optional(),

  // Participant type (can be updated for hybrid studies)
  type: z.nativeEnum(ParticipantType).optional(),

  // Session progression (for human participants)
  currentStage: z.nativeEnum(SessionStage).optional(),
  sessionStart: z.string().datetime().optional(),
  checkedIn: z.string().datetime().optional(),
  application: participantApplicationSchema.optional()
});

// ============================================
// SESSION VALIDATORS
// ============================================

export const createSessionSchema = z.object({
  studyId: z.string(),
  name: z.string().min(1).max(255),
  scheduledStart: z.string().datetime(),
  scheduledEnd: z.string().datetime().optional(),
  maxParticipants: z.number().int().positive().default(1)
});

export const updateSessionSchema = createSessionSchema.partial().omit({ studyId: true });

// ============================================
// SURVEY VALIDATORS
// ============================================

const baseQuestionSchema = z.object({
  id: z.string(),
  type: z.nativeEnum(QuestionType),
  text: z.string().min(1),
  required: z.boolean().optional(),
  description: z.string().optional()
});

const multipleChoiceQuestionSchema = baseQuestionSchema.extend({
  type: z.literal(QuestionType.MULTIPLE_CHOICE),
  options: z.array(z.string()).min(2),
  allowOther: z.boolean().optional()
});

const likertQuestionSchema = baseQuestionSchema.extend({
  type: z.literal(QuestionType.LIKERT),
  scale: z.number().int().min(3).max(10),
  labels: z.object({
    min: z.string().optional(),
    max: z.string().optional()
  }).optional()
});

const textQuestionSchema = baseQuestionSchema.extend({
  type: z.literal(QuestionType.TEXT),
  placeholder: z.string().optional(),
  maxLength: z.number().int().positive().optional()
});

const textareaQuestionSchema = baseQuestionSchema.extend({
  type: z.literal(QuestionType.TEXTAREA),
  placeholder: z.string().optional(),
  maxLength: z.number().int().positive().optional()
});

const emailQuestionSchema = baseQuestionSchema.extend({
  type: z.literal(QuestionType.EMAIL),
  placeholder: z.string().optional(),
  maxLength: z.number().int().positive().optional()
});

const numberQuestionSchema = baseQuestionSchema.extend({
  type: z.literal(QuestionType.NUMBER),
  min: z.number().optional(),
  max: z.number().optional(),
  step: z.number().optional()
});

const scaleQuestionSchema = baseQuestionSchema.extend({
  type: z.literal(QuestionType.SCALE),
  min: z.number(),
  max: z.number(),
  step: z.number().optional(),
  labels: z.record(z.string()).optional()
});

const checkboxQuestionSchema = baseQuestionSchema.extend({
  type: z.literal(QuestionType.CHECKBOX),
  options: z.array(z.string()).min(2),
  minSelections: z.number().int().nonnegative().optional(),
  maxSelections: z.number().int().positive().optional()
});

const questionSchema = z.discriminatedUnion('type', [
  multipleChoiceQuestionSchema,
  likertQuestionSchema,
  textQuestionSchema,
  textareaQuestionSchema,
  emailQuestionSchema,
  numberQuestionSchema,
  scaleQuestionSchema,
  checkboxQuestionSchema
]);

export const createSurveySchema = z.object({
  studyId: z.string(),
  name: z.string().min(1).max(255),
  description: z.string().optional(),
  timing: z.nativeEnum(SurveyTiming),
  questions: z.array(questionSchema).min(1)
});

export const updateSurveySchema = createSurveySchema.partial().omit({ studyId: true });

export const submitSurveyResponseSchema = z.object({
  surveyId: z.string(),
  participantId: z.string(),
  responses: z.record(z.union([z.string(), z.number(), z.array(z.string()), z.boolean()]))
});

// ============================================
// EVENT VALIDATORS
// ============================================

export const logEventSchema = z.object({
  participantId: z.string(),
  type: z.string(), // Can be EventType enum or custom string
  category: z.string().optional(),
  data: z.record(z.unknown()),
  context: z.string().optional(),
  timestamp: z.string().datetime().optional(),
  sequenceNum: z.number().int().optional()
});

export const batchLogEventsSchema = z.object({
  events: z.array(logEventSchema).min(1).max(100)
});

// ============================================
// STORY DATA VALIDATORS
// ============================================

// Safe plugin type pattern (alphanumeric, hyphens, underscores only)
const safePluginTypeRegex = /^[a-zA-Z0-9_-]+$/;

export const saveStoryDataSchema = z.object({
  participantId: z.string().uuid('Invalid participant ID format'),
  pluginType: z.string()
    .min(1, 'Plugin type is required')
    .max(64, 'Plugin type too long')
    .regex(safePluginTypeRegex, 'Plugin type must contain only alphanumeric characters, hyphens, and underscores'),
  storyData: z.unknown(), // Will be serialized to JSON and stored in S3
  name: z.string().max(255).optional(),
  description: z.string().max(1000).optional()
});

// ============================================
// BIOSIGNAL VALIDATORS
// ============================================

export const uploadBiosignalSchema = z.object({
  participantId: z.string(),
  type: z.nativeEnum(BiosignalType),
  deviceId: z.string().optional(),
  startTime: z.string().datetime(),
  endTime: z.string().datetime().optional(),
  sampleRate: z.number().positive().optional(),
  metadata: z.record(z.unknown()).optional()
});

// ============================================
// PAGINATION VALIDATORS
// ============================================

export const paginationSchema = z.object({
  page: z.number().int().positive().default(1),
  pageSize: z.number().int().positive().max(100).default(20)
});

// ============================================
// STORY ARCHITECTURE VALIDATORS
// ============================================

export const storyAgentDefinitionSchema = z.object({
  agentId: z.string().min(1),
  role: z.nativeEnum(StoryAgentRole),
  promptTemplate: z.string().min(1),
  model: z.string().min(1),
  temperature: z.number().min(0).max(2).optional(),
  maxTokens: z.number().int().positive().optional(),
  canRebut: z.boolean().optional(),
  canConcede: z.boolean().optional(),
  characterId: z.string().optional()
});

export const debateStructureSchema = z.object({
  structureType: z.enum(['single', 'parallel', 'sequential', 'rounds']),
  numRounds: z.number().int().positive().optional(),
  resolutionStrategy: z.enum(['synthesis', 'voting', 'weighted', 'consensus']),
  agentWeights: z.record(z.number()).optional(),
  roundTimeoutMs: z.number().int().positive().optional()
});

export const stateRepresentationSchema = z.object({
  representationType: z.enum(['pydantic', 'graph', 'questions', 'hybrid']),
  trackMacroQuestions: z.boolean().optional(),
  trackMicroQuestions: z.boolean().optional(),
  usePossibleWorlds: z.boolean().optional(),
  useCharacterGraph: z.boolean().optional(),
  useWorldGraph: z.boolean().optional()
});

export const modelCapabilitiesSchema = z.object({
  supportsJson: z.boolean().optional(),
  supportsNestedBeliefs: z.boolean().optional(),
  supportsGraphUpdates: z.boolean().optional(),
  maxContextLength: z.number().int().positive().optional(),
  empirical: z.record(z.boolean()).optional()
});

export const modelAdaptationSchema = z.object({
  modelPattern: z.string().min(1),
  promptStyle: z.enum(['direct', 'chat', 'instruct', 'cot']),
  contextPresentation: z.enum(['json', 'prose', 'triples', 'structured']),
  capabilities: modelCapabilitiesSchema.optional()
});

export const storyArchitectureConfigSchema = z.object({
  configId: z.string().optional(),
  name: z.string().optional(),
  description: z.string().optional(),
  agents: z.array(storyAgentDefinitionSchema).min(1),
  debateStructure: debateStructureSchema.optional(),
  stateRepresentation: stateRepresentationSchema.optional(),
  modelAdaptations: z.array(modelAdaptationSchema).optional(),
  storyConstraints: z.object({
    genre: z.string().optional(),
    theme: z.string().optional(),
    setting: z.string().optional(),
    minPassages: z.number().int().positive().optional(),
    maxPassages: z.number().int().positive().optional(),
    targetWordCount: z.number().int().positive().optional()
  }).optional(),
  evaluationConfig: z.object({
    enableCoherenceScoring: z.boolean().optional(),
    enableConsistencyChecks: z.boolean().optional(),
    enableEngagementMetrics: z.boolean().optional(),
    customMetrics: z.array(z.string()).optional()
  }).optional()
});

export const storyMetricsSchema = z.object({
  passageCount: z.number().int().nonnegative(),
  wordCount: z.number().int().nonnegative(),
  choiceCount: z.number().int().nonnegative(),
  uniquePathsTaken: z.number().int().nonnegative().optional(),
  coherenceScore: z.number().min(0).max(1).optional(),
  consistencyScore: z.number().min(0).max(1).optional(),
  engagementScore: z.number().min(0).max(1).optional(),
  characterConsistencyScores: z.record(z.number().min(0).max(1)).optional(),
  goalProgressionScores: z.record(z.number().min(0).max(1)).optional(),
  questionsRaised: z.number().int().nonnegative().optional(),
  questionsAnswered: z.number().int().nonnegative().optional(),
  questionClosureRate: z.number().min(0).max(1).optional(),
  debateRounds: z.number().int().nonnegative().optional(),
  consensusReached: z.boolean().optional(),
  contradictionCount: z.number().int().nonnegative().optional(),
  totalGenerationTimeMs: z.number().nonnegative().optional(),
  averageResponseTimeMs: z.number().nonnegative().optional(),
  custom: z.record(z.union([z.number(), z.string(), z.boolean()])).optional()
});

// ============================================
// PARTNER PAIRING VALIDATORS
// ============================================

export const pairingConfigSchema = z.object({
  studyId: z.string().uuid(),
  strategy: z.nativeEnum(PairingStrategy),
  conditionId: z.string().uuid().optional(),
  syntheticRole: z.enum(['AUTHOR', 'READER']).optional(),
  requireAvailabilityOverlap: z.boolean().optional(),
  minOverlapHours: z.number().int().min(1).max(24).optional(),
  preferHumanPartners: z.boolean().optional(),
  maxWaitMs: z.number().int().positive().optional()
});

export const manualPairingSchema = z.object({
  participantAId: z.string().uuid(),
  participantBId: z.string().uuid()
});

export const unpairParticipantSchema = z.object({
  participantId: z.string().uuid()
});

// ============================================
// ENROLLMENT VALIDATORS
// ============================================

export const enrollmentConsentSchema = z.object({
  agreed: z.literal(true, {
    errorMap: () => ({ message: 'You must agree to the consent document' })
  }),
  consentedAt: z.string().datetime(),
  documentVersion: z.string().optional()
});

export const availabilitySlotSchema = z.object({
  dayOfWeek: z.number().int().min(0).max(6),
  startHour: z.number().int().min(0).max(23),
  endHour: z.number().int().min(0).max(23)
}).refine(data => data.endHour > data.startHour, {
  message: 'End hour must be after start hour'
});

export const enrollmentDemographicsSchema = z.object({
  majorDegree: z.string().max(200).optional(),
  ethnicRacialAffiliation: z.string().max(100).optional(),
  genderAffiliation: z.string().max(50).optional(),
  nativeLanguage: z.string().max(50).optional(),
  languagePreference: z.string().max(50).optional(),
  prevExperience: z.string().max(1000).optional(),
  intro: z.string().min(10, 'Bio must be at least 10 characters').max(500, 'Bio must be at most 500 characters')
});

export const enrollRequestSchema = z.object({
  consent: enrollmentConsentSchema,
  demographics: enrollmentDemographicsSchema,
  availability: z.array(availabilitySlotSchema).min(1, 'At least one availability slot is required'),
  email: z.string().email('Invalid email address'),
  timezone: z.string().optional()
});

// ============================================
// ENROLLMENT CONFIGURATION VALIDATORS
// ============================================

// Slug validation: lowercase, alphanumeric, hyphens, 3-100 chars
export const slugSchema = z.string()
  .min(3, 'Slug must be at least 3 characters')
  .max(100, 'Slug must be at most 100 characters')
  .regex(/^[a-z0-9][a-z0-9-]*[a-z0-9]$|^[a-z0-9]$/, 'Slug must be lowercase alphanumeric with hyphens, cannot start or end with hyphen');

export const customFieldOptionSchema = z.object({
  value: z.string().min(1),
  label: z.string().min(1)
});

export const customFieldValidationSchema = z.object({
  minLength: z.number().int().min(0).optional(),
  maxLength: z.number().int().min(1).optional(),
  min: z.number().optional(),
  max: z.number().optional(),
  pattern: z.string().optional()
}).optional();

export const customFieldDefinitionSchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1).max(50),
  label: z.string().min(1).max(200),
  type: z.enum(['text', 'textarea', 'select', 'checkbox', 'radio', 'number']),
  required: z.boolean(),
  placeholder: z.string().max(200).optional(),
  options: z.array(customFieldOptionSchema).optional(),
  validation: customFieldValidationSchema
});

export const createEnrollmentConfigSchema = z.object({
  slug: slugSchema,
  enabled: z.boolean().optional(),
  maxParticipants: z.number().int().min(1).optional(),
  openAt: z.string().datetime().optional(),
  closeAt: z.string().datetime().optional(),
  welcomeContent: z.string().max(50000).optional(),
  consentDocument: z.string().max(100000).optional(),
  consentVersion: z.string().max(20).optional(),
  instructionsContent: z.string().max(50000).optional(),
  completionContent: z.string().max(50000).optional(),
  requireAvailability: z.boolean().optional(),
  customFields: z.array(customFieldDefinitionSchema).optional(),
  sendConfirmationEmail: z.boolean().optional(),
  confirmationEmailTemplate: z.string().max(50000).optional()
});

export const updateEnrollmentConfigSchema = z.object({
  slug: slugSchema.optional(),
  enabled: z.boolean().optional(),
  maxParticipants: z.number().int().min(1).nullable().optional(),
  openAt: z.string().datetime().nullable().optional(),
  closeAt: z.string().datetime().nullable().optional(),
  welcomeContent: z.string().max(50000).nullable().optional(),
  consentDocument: z.string().max(100000).nullable().optional(),
  consentVersion: z.string().max(20).optional(),
  instructionsContent: z.string().max(50000).nullable().optional(),
  completionContent: z.string().max(50000).nullable().optional(),
  requireAvailability: z.boolean().optional(),
  customFields: z.array(customFieldDefinitionSchema).optional(),
  sendConfirmationEmail: z.boolean().optional(),
  confirmationEmailTemplate: z.string().max(50000).nullable().optional()
});

export const createConsentVersionSchema = z.object({
  version: z.string().min(1).max(20),
  content: z.string().min(1).max(100000)
});

export const testEmailSchema = z.object({
  email: z.string().email(),
  templateType: z.enum(['confirmation', 'reminder']).optional()
});

/**
 * Enrollment submission schema for the new slug-based enrollment portal
 * This is used when participants enroll via the public portal with consent checkbox
 */
export const enrollWithConsentSchema = z.object({
  email: z.string().email('Valid email is required'),
  consentGiven: z.literal(true, {
    errorMap: () => ({ message: 'You must agree to the consent form to participate' })
  }),
  demographicData: z.record(z.any()).optional(),
  availabilityData: z.array(z.any()).optional(),
  customFieldData: z.record(z.any()).optional()
});

// ============================================
// HELPER TYPE INFERENCE
// ============================================

export type LoginInput = z.infer<typeof loginSchema>;
export type RegisterInput = z.infer<typeof registerSchema>;
export type CreateProjectInput = z.infer<typeof createProjectSchema>;
export type UpdateProjectInput = z.infer<typeof updateProjectSchema>;
export type CreateStudyInput = z.infer<typeof createStudySchema>;
export type UpdateStudyInput = z.infer<typeof updateStudySchema>;
export type CreateConditionInput = z.infer<typeof createConditionSchema>;
export type UpdateConditionInput = z.infer<typeof updateConditionSchema>;
export type CreateParticipantInput = z.infer<typeof createParticipantSchema>;
export type UpdateParticipantInput = z.infer<typeof updateParticipantSchema>;
export type CreateSessionInput = z.infer<typeof createSessionSchema>;
export type UpdateSessionInput = z.infer<typeof updateSessionSchema>;
export type CreateSurveyInput = z.infer<typeof createSurveySchema>;
export type UpdateSurveyInput = z.infer<typeof updateSurveySchema>;
export type SubmitSurveyResponseInput = z.infer<typeof submitSurveyResponseSchema>;
export type LogEventInput = z.infer<typeof logEventSchema>;
export type BatchLogEventsInput = z.infer<typeof batchLogEventsSchema>;
export type SaveStoryDataInput = z.infer<typeof saveStoryDataSchema>;
export type UploadBiosignalInput = z.infer<typeof uploadBiosignalSchema>;
export type PaginationInput = z.infer<typeof paginationSchema>;
export type PasswordResetRequestInput = z.infer<typeof passwordResetRequestSchema>;
export type PasswordResetConfirmInput = z.infer<typeof passwordResetConfirmSchema>;
export type ChangePasswordInput = z.infer<typeof changePasswordSchema>;
export type UpdateSettingsInput = z.infer<typeof updateSettingsSchema>;
export type UpdateResearcherRoleInput = z.infer<typeof updateResearcherRoleSchema>;
export type UpdateResearcherStatusInput = z.infer<typeof updateResearcherStatusSchema>;
export type StoryAgentDefinitionInput = z.infer<typeof storyAgentDefinitionSchema>;
export type DebateStructureInput = z.infer<typeof debateStructureSchema>;
export type StateRepresentationInput = z.infer<typeof stateRepresentationSchema>;
export type ModelAdaptationInput = z.infer<typeof modelAdaptationSchema>;
export type StoryArchitectureConfigInput = z.infer<typeof storyArchitectureConfigSchema>;
export type StoryMetricsInput = z.infer<typeof storyMetricsSchema>;
export type PairingConfigInput = z.infer<typeof pairingConfigSchema>;
export type ManualPairingInput = z.infer<typeof manualPairingSchema>;
export type UnpairParticipantInput = z.infer<typeof unpairParticipantSchema>;
export type EnrollRequestInput = z.infer<typeof enrollRequestSchema>;
export type EnrollmentConsentInput = z.infer<typeof enrollmentConsentSchema>;
export type EnrollmentDemographicsInput = z.infer<typeof enrollmentDemographicsSchema>;
export type AvailabilitySlotInput = z.infer<typeof availabilitySlotSchema>;
export type CreateProjectShareInput = z.infer<typeof createProjectShareSchema>;
export type UpdateProjectShareInput = z.infer<typeof updateProjectShareSchema>;
export type CustomFieldDefinitionInput = z.infer<typeof customFieldDefinitionSchema>;
export type CreateEnrollmentConfigInput = z.infer<typeof createEnrollmentConfigSchema>;
export type UpdateEnrollmentConfigInput = z.infer<typeof updateEnrollmentConfigSchema>;
export type CreateConsentVersionInput = z.infer<typeof createConsentVersionSchema>;
export type TestEmailInput = z.infer<typeof testEmailSchema>;
export type EnrollWithConsentInput = z.infer<typeof enrollWithConsentSchema>;
