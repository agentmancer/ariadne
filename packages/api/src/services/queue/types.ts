/**
 * Job types and data schemas for BullMQ queues
 */

import { z } from 'zod';

// ============================================================================
// Batch Creation Job
// ============================================================================

export const batchCreationJobSchema = z.object({
  batchExecutionId: z.string(),
  studyId: z.string(),
  conditionId: z.string().optional(),
  actorCount: z.number().int().positive(),
  role: z.enum(['PLAYER', 'STORYTELLER', 'EDITOR', 'CONSISTENCY_MANAGER', 'EVALUATOR', 'PARTNER', 'CUSTOM']),
  llmConfig: z.object({
    provider: z.string(), // 'openai' | 'anthropic' | 'google' | etc.
    model: z.string(),
    temperature: z.number().min(0).max(2).optional(),
    maxTokens: z.number().int().positive().optional(),
    systemPrompt: z.string().optional(),
  }),
  agentDefinitionId: z.string().optional(),
  priority: z.enum(['REAL_TIME', 'HIGH', 'NORMAL', 'LOW']).default('NORMAL'),
});

export type BatchCreationJobData = z.infer<typeof batchCreationJobSchema>;

// ============================================================================
// Synthetic Execution Job
// ============================================================================

export const syntheticExecutionJobSchema = z.object({
  participantId: z.string(),
  conditionId: z.string().optional(),
  batchExecutionId: z.string().optional(),
  // Task configuration
  taskConfig: z.object({
    pluginType: z.string().optional(), // e.g., 'ink', 'twine', 'custom'
    storyId: z.string().optional(),
    maxActions: z.number().int().positive().default(100),
    timeoutMs: z.number().int().positive().default(300000), // 5 min default
  }).optional(),
  priority: z.enum(['REAL_TIME', 'HIGH', 'NORMAL', 'LOW']).default('NORMAL'),
});

export type SyntheticExecutionJobData = z.infer<typeof syntheticExecutionJobSchema>;

// ============================================================================
// Data Export Job
// ============================================================================

export const dataExportJobSchema = z.object({
  batchExecutionId: z.string(),
  studyId: z.string(),
  format: z.enum(['JSON', 'JSONL', 'CSV']).default('JSONL'),
  includeEvents: z.boolean().default(true),
  includeSurveyResponses: z.boolean().default(true),
  includeStoryData: z.boolean().default(true),
  // Optional filters
  participantIds: z.array(z.string()).optional(),
  eventTypes: z.array(z.string()).optional(),
});

export type DataExportJobData = z.infer<typeof dataExportJobSchema>;

// ============================================================================
// Job Results
// ============================================================================

export interface BatchCreationResult {
  batchExecutionId: string;
  participantsCreated: number;
  participantIds: string[];
  jobsQueued: number;
}

export interface SyntheticExecutionResult {
  participantId: string;
  status: 'COMPLETE' | 'FAILED' | 'TIMEOUT' | 'SKIPPED';
  actionsExecuted: number;
  eventsLogged: number;
  durationMs: number;
  error?: string;
}

export interface DataExportResult {
  batchExecutionId: string;
  exportPath: string; // S3 path
  recordCount: number;
  fileSizeBytes: number;
}

// ============================================================================
// Collaborative Session Job (for paired agent studies)
// ============================================================================

export const collaborativeSessionJobSchema = z.object({
  batchExecutionId: z.string(),
  studyId: z.string(),
  conditionId: z.string().optional(),
  // Pair of participant IDs to run the collaborative session
  participantAId: z.string(),
  participantBId: z.string(),
  // Collaborative session configuration
  sessionConfig: z.object({
    rounds: z.number().int().positive().default(3),
    phases: z.array(z.enum(['AUTHOR', 'PLAY', 'REVIEW'])).default(['AUTHOR', 'PLAY', 'REVIEW']),
    feedbackRequired: z.boolean().default(true),
    maxPlayActions: z.number().int().positive().default(20),
    storyConstraints: z.object({
      genre: z.string().optional(),
      theme: z.string().optional(),
      maxPassages: z.number().optional(),
      minPassages: z.number().optional(),
    }).optional(),
  }).optional(),
  // LLM configuration for both agents
  llmConfigA: z.object({
    provider: z.string(),
    model: z.string(),
    temperature: z.number().min(0).max(2).optional(),
    maxTokens: z.number().int().positive().optional(),
  }),
  llmConfigB: z.object({
    provider: z.string(),
    model: z.string(),
    temperature: z.number().min(0).max(2).optional(),
    maxTokens: z.number().int().positive().optional(),
  }).optional(), // If not provided, uses llmConfigA
  priority: z.enum(['REAL_TIME', 'HIGH', 'NORMAL', 'LOW']).default('NORMAL'),
});

export type CollaborativeSessionJobData = z.infer<typeof collaborativeSessionJobSchema>;

export interface CollaborativeSessionResult {
  batchExecutionId: string;
  participantAId: string;
  participantBId: string;
  rounds: number;
  status: 'COMPLETE' | 'FAILED' | 'PARTIAL';
  durationMs: number;
  roundResults: Array<{
    round: number;
    phases: Array<{
      phase: string;
      participantId: string;
      success: boolean;
      error?: string;
    }>;
  }>;
  error?: string;
}

// ============================================================================
// Collaborative Batch Creation Job
// ============================================================================

export const collaborativeBatchCreationJobSchema = z.object({
  batchExecutionId: z.string(),
  studyId: z.string(),
  conditionId: z.string().optional(),
  // Number of pairs to create
  pairCount: z.number().int().positive(),
  // Session configuration for all pairs
  sessionConfig: z.object({
    rounds: z.number().int().positive().default(3),
    phases: z.array(z.enum(['AUTHOR', 'PLAY', 'REVIEW'])).default(['AUTHOR', 'PLAY', 'REVIEW']),
    feedbackRequired: z.boolean().default(true),
    maxPlayActions: z.number().int().positive().default(20),
    storyConstraints: z.object({
      genre: z.string().optional(),
      theme: z.string().optional(),
      maxPassages: z.number().optional(),
      minPassages: z.number().optional(),
    }).optional(),
  }).optional(),
  // LLM configuration
  llmConfig: z.object({
    provider: z.string(),
    model: z.string(),
    temperature: z.number().min(0).max(2).optional(),
    maxTokens: z.number().int().positive().optional(),
  }),
  // Whether to use different LLM configs for partners
  varyPartnerConfig: z.boolean().default(false),
  partnerLlmConfig: z.object({
    provider: z.string(),
    model: z.string(),
    temperature: z.number().min(0).max(2).optional(),
    maxTokens: z.number().int().positive().optional(),
  }).optional(),
  agentDefinitionId: z.string().optional(),
  priority: z.enum(['REAL_TIME', 'HIGH', 'NORMAL', 'LOW']).default('NORMAL'),
});

export type CollaborativeBatchCreationJobData = z.infer<typeof collaborativeBatchCreationJobSchema>;

export interface CollaborativeBatchCreationResult {
  batchExecutionId: string;
  pairsCreated: number;
  participantIds: string[];
  jobsQueued: number;
}

// ============================================================================
// Queue Names
// ============================================================================

// ============================================================================
// Hybrid Session Synthetic Phase Job
// Triggered when a human completes a phase and synthetic partner needs to respond
// ============================================================================

export const hybridSessionSyntheticPhaseJobSchema = z.object({
  sessionId: z.string(),
  studyId: z.string(),
  // The synthetic participant that needs to execute
  syntheticParticipantId: z.string(),
  // The human participant that triggered this
  humanParticipantId: z.string(),
  // Phase to execute
  phase: z.enum(['AUTHOR', 'PLAY', 'REVIEW']),
  round: z.number().int().positive(),
  // LLM configuration for the synthetic partner
  llmConfig: z.object({
    provider: z.string(),
    model: z.string(),
    temperature: z.number().min(0).max(2).optional(),
    maxTokens: z.number().int().positive().optional(),
  }),
  // Optional delay to simulate human-like response time
  responseDelayMs: z.number().int().nonnegative().optional(),
  priority: z.enum(['REAL_TIME', 'HIGH', 'NORMAL', 'LOW']).default('HIGH'),
});

export type HybridSessionSyntheticPhaseJobData = z.infer<typeof hybridSessionSyntheticPhaseJobSchema>;

export interface HybridSessionSyntheticPhaseResult {
  sessionId: string;
  syntheticParticipantId: string;
  phase: string;
  round: number;
  status: 'COMPLETE' | 'FAILED';
  durationMs: number;
  result?: {
    storyDataId?: string;
    playSessionId?: string;
    feedbackIds?: string[];
  };
  error?: string;
}

// ============================================================================
// Hybrid Study Config Schema (for runtime validation)
// ============================================================================

export const hybridStudyConfigSchema = z.object({
  collaboration: z.object({
    enabled: z.literal(true),
    pairingMethod: z.enum(['manual', 'automatic', 'self-select']),
    rounds: z.number().int().positive(),
    phasesPerRound: z.array(z.enum(['AUTHOR', 'PLAY', 'REVIEW'])),
    feedbackRequired: z.boolean(),
    revisionRequired: z.boolean(),
  }),
  executionMode: z.enum(['SYNCHRONOUS', 'ASYNCHRONOUS', 'TIMED']),
  humanRole: z.enum(['AUTHOR', 'READER', 'BOTH']),
  maxPlayActions: z.number().int().positive().optional(),
  phaseTimeLimits: z.record(z.number().positive()).optional(),
  syntheticPartner: z.object({
    llmConfig: z.object({
      provider: z.string(),
      model: z.string(),
      temperature: z.number().min(0).max(2).optional(),
      maxTokens: z.number().int().positive().optional(),
    }).optional(),
    responseDelay: z.object({
      enabled: z.boolean(),
      minMs: z.number().int().nonnegative().optional(),
      maxMs: z.number().int().nonnegative().optional(),
    }).optional(),
  }).optional(),
  notifications: z.object({
    onPartnerReady: z.boolean().optional(),
    phaseReminders: z.boolean().optional(),
    reminderMinutes: z.number().positive().optional(),
  }).optional(),
}).passthrough();  // Allow additional fields from base config

export const QUEUE_NAMES = {
  BATCH_CREATION: 'batch-creation',
  SYNTHETIC_EXECUTION: 'synthetic-execution',
  DATA_EXPORT: 'data-export',
  COLLABORATIVE_BATCH_CREATION: 'collaborative-batch-creation',
  COLLABORATIVE_SESSION: 'collaborative-session',
  HYBRID_SESSION_SYNTHETIC_PHASE: 'hybrid-session-synthetic-phase',
} as const;

// ============================================================================
// Job Priorities (BullMQ uses lower number = higher priority)
// ============================================================================

export const JOB_PRIORITIES = {
  REAL_TIME: 1,  // For real-time collaboration (immediate processing)
  HIGH: 5,
  NORMAL: 10,
  LOW: 20,
} as const;

export function getPriorityValue(priority: 'REAL_TIME' | 'HIGH' | 'NORMAL' | 'LOW'): number {
  return JOB_PRIORITIES[priority];
}
