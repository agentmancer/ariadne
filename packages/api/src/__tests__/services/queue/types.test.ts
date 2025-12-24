/**
 * Unit tests for Queue Job Schemas and Types
 */

import { describe, it, expect } from 'vitest';
import {
  batchCreationJobSchema,
  syntheticExecutionJobSchema,
  dataExportJobSchema,
  collaborativeSessionJobSchema,
  collaborativeBatchCreationJobSchema,
  getPriorityValue,
  JOB_PRIORITIES,
  QUEUE_NAMES,
} from '../../../services/queue/types';

describe('Queue Types', () => {
  describe('batchCreationJobSchema', () => {
    const validJobData = {
      batchExecutionId: 'batch-123',
      studyId: 'study-456',
      actorCount: 10,
      role: 'PLAYER' as const,
      llmConfig: {
        provider: 'openai',
        model: 'gpt-4',
      },
    };

    it('should accept valid batch creation job data', () => {
      const result = batchCreationJobSchema.safeParse(validJobData);
      expect(result.success).toBe(true);
    });

    it('should accept optional fields', () => {
      const dataWithOptionals = {
        ...validJobData,
        conditionId: 'condition-123',
        agentDefinitionId: 'agent-456',
        priority: 'HIGH' as const,
        llmConfig: {
          ...validJobData.llmConfig,
          temperature: 0.7,
          maxTokens: 1000,
          systemPrompt: 'You are a helpful assistant',
        },
      };
      const result = batchCreationJobSchema.safeParse(dataWithOptionals);
      expect(result.success).toBe(true);
    });

    it('should set default priority to NORMAL', () => {
      const result = batchCreationJobSchema.parse(validJobData);
      expect(result.priority).toBe('NORMAL');
    });

    it('should reject missing required fields', () => {
      const invalidData = {
        batchExecutionId: 'batch-123',
        // Missing studyId, actorCount, role, llmConfig
      };
      const result = batchCreationJobSchema.safeParse(invalidData);
      expect(result.success).toBe(false);
    });

    it('should reject invalid actorCount', () => {
      const invalidData = {
        ...validJobData,
        actorCount: 0, // Must be positive
      };
      const result = batchCreationJobSchema.safeParse(invalidData);
      expect(result.success).toBe(false);
    });

    it('should reject invalid role', () => {
      const invalidData = {
        ...validJobData,
        role: 'INVALID_ROLE',
      };
      const result = batchCreationJobSchema.safeParse(invalidData);
      expect(result.success).toBe(false);
    });

    it('should reject temperature outside valid range', () => {
      const invalidData = {
        ...validJobData,
        llmConfig: {
          ...validJobData.llmConfig,
          temperature: 3.0, // Max is 2
        },
      };
      const result = batchCreationJobSchema.safeParse(invalidData);
      expect(result.success).toBe(false);
    });
  });

  describe('syntheticExecutionJobSchema', () => {
    const validJobData = {
      participantId: 'participant-123',
    };

    it('should accept minimal valid data', () => {
      const result = syntheticExecutionJobSchema.safeParse(validJobData);
      expect(result.success).toBe(true);
    });

    it('should accept optional fields', () => {
      const dataWithOptionals = {
        ...validJobData,
        conditionId: 'condition-123',
        batchExecutionId: 'batch-456',
        priority: 'REAL_TIME' as const,
        taskConfig: {
          pluginType: 'ink',
          storyId: 'story-123',
          maxActions: 50,
          timeoutMs: 60000,
        },
      };
      const result = syntheticExecutionJobSchema.safeParse(dataWithOptionals);
      expect(result.success).toBe(true);
    });

    it('should set default priority to NORMAL', () => {
      const result = syntheticExecutionJobSchema.parse(validJobData);
      expect(result.priority).toBe('NORMAL');
    });

    it('should set default taskConfig values', () => {
      const dataWithPartialTaskConfig = {
        ...validJobData,
        taskConfig: {},
      };
      const result = syntheticExecutionJobSchema.parse(dataWithPartialTaskConfig);
      expect(result.taskConfig?.maxActions).toBe(100);
      expect(result.taskConfig?.timeoutMs).toBe(300000);
    });

    it('should reject missing participantId', () => {
      const invalidData = {
        conditionId: 'condition-123',
      };
      const result = syntheticExecutionJobSchema.safeParse(invalidData);
      expect(result.success).toBe(false);
    });
  });

  describe('dataExportJobSchema', () => {
    const validJobData = {
      batchExecutionId: 'batch-123',
      studyId: 'study-456',
    };

    it('should accept minimal valid data', () => {
      const result = dataExportJobSchema.safeParse(validJobData);
      expect(result.success).toBe(true);
    });

    it('should set default format to JSONL', () => {
      const result = dataExportJobSchema.parse(validJobData);
      expect(result.format).toBe('JSONL');
    });

    it('should set default include flags to true', () => {
      const result = dataExportJobSchema.parse(validJobData);
      expect(result.includeEvents).toBe(true);
      expect(result.includeSurveyResponses).toBe(true);
      expect(result.includeStoryData).toBe(true);
    });

    it('should accept all format types', () => {
      const formats = ['JSON', 'JSONL', 'CSV'] as const;
      formats.forEach((format) => {
        const result = dataExportJobSchema.safeParse({
          ...validJobData,
          format,
        });
        expect(result.success).toBe(true);
      });
    });

    it('should accept filter options', () => {
      const dataWithFilters = {
        ...validJobData,
        participantIds: ['p1', 'p2', 'p3'],
        eventTypes: ['SESSION_START', 'SESSION_END'],
      };
      const result = dataExportJobSchema.safeParse(dataWithFilters);
      expect(result.success).toBe(true);
    });

    it('should reject invalid format', () => {
      const invalidData = {
        ...validJobData,
        format: 'XML',
      };
      const result = dataExportJobSchema.safeParse(invalidData);
      expect(result.success).toBe(false);
    });
  });

  describe('getPriorityValue', () => {
    it('should return correct priority values', () => {
      expect(getPriorityValue('REAL_TIME')).toBe(1);
      expect(getPriorityValue('HIGH')).toBe(5);
      expect(getPriorityValue('NORMAL')).toBe(10);
      expect(getPriorityValue('LOW')).toBe(20);
    });

    it('should match JOB_PRIORITIES constants', () => {
      expect(getPriorityValue('REAL_TIME')).toBe(JOB_PRIORITIES.REAL_TIME);
      expect(getPriorityValue('HIGH')).toBe(JOB_PRIORITIES.HIGH);
      expect(getPriorityValue('NORMAL')).toBe(JOB_PRIORITIES.NORMAL);
      expect(getPriorityValue('LOW')).toBe(JOB_PRIORITIES.LOW);
    });
  });

  describe('QUEUE_NAMES', () => {
    it('should have expected queue names', () => {
      expect(QUEUE_NAMES.BATCH_CREATION).toBe('batch-creation');
      expect(QUEUE_NAMES.SYNTHETIC_EXECUTION).toBe('synthetic-execution');
      expect(QUEUE_NAMES.DATA_EXPORT).toBe('data-export');
    });

    it('should have collaborative queue names', () => {
      expect(QUEUE_NAMES.COLLABORATIVE_BATCH_CREATION).toBe('collaborative-batch-creation');
      expect(QUEUE_NAMES.COLLABORATIVE_SESSION).toBe('collaborative-session');
    });
  });

  describe('collaborativeSessionJobSchema', () => {
    const validJobData = {
      batchExecutionId: 'batch-123',
      studyId: 'study-456',
      participantAId: 'participant-a-123',
      participantBId: 'participant-b-456',
      llmConfigA: {
        provider: 'openai',
        model: 'gpt-4',
      },
    };

    it('should accept valid collaborative session job data', () => {
      const result = collaborativeSessionJobSchema.safeParse(validJobData);
      expect(result.success).toBe(true);
    });

    it('should accept optional fields', () => {
      const dataWithOptionals = {
        ...validJobData,
        conditionId: 'condition-123',
        sessionConfig: {
          rounds: 5,
          phases: ['AUTHOR', 'PLAY', 'REVIEW'] as const,
          feedbackRequired: true,
          maxPlayActions: 30,
          storyConstraints: {
            genre: 'sci-fi',
            theme: 'exploration',
            maxPassages: 20,
            minPassages: 5,
          },
        },
        llmConfigB: {
          provider: 'anthropic',
          model: 'claude-3-sonnet',
          temperature: 0.8,
        },
        priority: 'HIGH' as const,
      };
      const result = collaborativeSessionJobSchema.safeParse(dataWithOptionals);
      expect(result.success).toBe(true);
    });

    it('should set default priority to NORMAL', () => {
      const result = collaborativeSessionJobSchema.parse(validJobData);
      expect(result.priority).toBe('NORMAL');
    });

    it('should set default session config values', () => {
      const dataWithPartialConfig = {
        ...validJobData,
        sessionConfig: {},
      };
      const result = collaborativeSessionJobSchema.parse(dataWithPartialConfig);
      expect(result.sessionConfig?.rounds).toBe(3);
      expect(result.sessionConfig?.feedbackRequired).toBe(true);
      expect(result.sessionConfig?.maxPlayActions).toBe(20);
    });

    it('should reject missing required fields', () => {
      const invalidData = {
        batchExecutionId: 'batch-123',
        studyId: 'study-456',
        // Missing participantAId, participantBId, llmConfigA
      };
      const result = collaborativeSessionJobSchema.safeParse(invalidData);
      expect(result.success).toBe(false);
    });

    it('should accept valid phase combinations', () => {
      const dataWithCustomPhases = {
        ...validJobData,
        sessionConfig: {
          phases: ['AUTHOR', 'REVIEW'] as const, // Skip PLAY phase
        },
      };
      const result = collaborativeSessionJobSchema.safeParse(dataWithCustomPhases);
      expect(result.success).toBe(true);
    });
  });

  describe('collaborativeBatchCreationJobSchema', () => {
    const validJobData = {
      batchExecutionId: 'batch-123',
      studyId: 'study-456',
      pairCount: 10,
      llmConfig: {
        provider: 'openai',
        model: 'gpt-4',
      },
    };

    it('should accept valid collaborative batch creation job data', () => {
      const result = collaborativeBatchCreationJobSchema.safeParse(validJobData);
      expect(result.success).toBe(true);
    });

    it('should accept optional fields', () => {
      const dataWithOptionals = {
        ...validJobData,
        conditionId: 'condition-123',
        agentDefinitionId: 'agent-456',
        varyPartnerConfig: true,
        partnerLlmConfig: {
          provider: 'anthropic',
          model: 'claude-3-opus',
          temperature: 0.5,
          maxTokens: 2000,
        },
        sessionConfig: {
          rounds: 4,
          phases: ['AUTHOR', 'PLAY', 'REVIEW'] as const,
          feedbackRequired: true,
          maxPlayActions: 25,
        },
        priority: 'HIGH' as const,
      };
      const result = collaborativeBatchCreationJobSchema.safeParse(dataWithOptionals);
      expect(result.success).toBe(true);
    });

    it('should set default priority to NORMAL', () => {
      const result = collaborativeBatchCreationJobSchema.parse(validJobData);
      expect(result.priority).toBe('NORMAL');
    });

    it('should set default varyPartnerConfig to false', () => {
      const result = collaborativeBatchCreationJobSchema.parse(validJobData);
      expect(result.varyPartnerConfig).toBe(false);
    });

    it('should reject missing required fields', () => {
      const invalidData = {
        batchExecutionId: 'batch-123',
        // Missing studyId, pairCount, llmConfig
      };
      const result = collaborativeBatchCreationJobSchema.safeParse(invalidData);
      expect(result.success).toBe(false);
    });

    it('should reject invalid pairCount', () => {
      const invalidData = {
        ...validJobData,
        pairCount: 0, // Must be positive
      };
      const result = collaborativeBatchCreationJobSchema.safeParse(invalidData);
      expect(result.success).toBe(false);
    });

    it('should reject negative pairCount', () => {
      const invalidData = {
        ...validJobData,
        pairCount: -5,
      };
      const result = collaborativeBatchCreationJobSchema.safeParse(invalidData);
      expect(result.success).toBe(false);
    });

    it('should accept temperature within valid range', () => {
      const dataWithTemperature = {
        ...validJobData,
        llmConfig: {
          ...validJobData.llmConfig,
          temperature: 1.5,
        },
      };
      const result = collaborativeBatchCreationJobSchema.safeParse(dataWithTemperature);
      expect(result.success).toBe(true);
    });

    it('should reject temperature outside valid range', () => {
      const invalidData = {
        ...validJobData,
        llmConfig: {
          ...validJobData.llmConfig,
          temperature: 2.5, // Max is 2
        },
      };
      const result = collaborativeBatchCreationJobSchema.safeParse(invalidData);
      expect(result.success).toBe(false);
    });
  });
});
