/**
 * Synthetic Execution Worker
 * Executes a single synthetic actor through a task/story
 *
 * This worker coordinates:
 * 1. Loading participant and condition configuration
 * 2. Initializing the appropriate plugin/story engine
 * 3. Running the LLM-powered actor through the experience
 * 4. Recording events and story data
 * 5. Updating progress on the batch execution
 */

import { Worker, Job } from 'bullmq';
import { createRedisConnection, getBatchStatusCache } from '../connection';
import { prisma } from '../../../lib/prisma';
import { config } from '../../../config';
import {
  QUEUE_NAMES,
  SyntheticExecutionJobData,
  SyntheticExecutionResult,
  syntheticExecutionJobSchema,
} from '../types';
import {
  createLLMClient,
  roleAdapterRegistry,
  registerAllRoleAdapters,
  LLMConfig,
  RoleContext,
} from '../../llm';
import { TwinePlugin } from '@ariadne/module-twine';
import {
  PluginContext,
  PluginApiClient,
  StoryPlugin,
  PluginAction,
  StoryState,
} from '@ariadne/plugins';

// Register all role adapters on module load
registerAllRoleAdapters();

// Statuses that should stop worker processing
const STOP_STATUSES = ['PAUSED', 'FAILED', 'COMPLETE', 'DELETING'] as const;

/**
 * Create a plugin API client for event logging and story persistence
 */
function createPluginApiClient(participantId: string): PluginApiClient {
  return {
    async logEvent(event) {
      await prisma.event.create({
        data: {
          participantId,
          type: event.type,
          data: JSON.stringify(event.data),
          timestamp: event.timestamp || new Date(),
        },
      });
    },
    async saveStory(_data) {
      // For now, just return version 1 - S3 integration can be added later
      return { version: 1 };
    },
    async loadStory(_version) {
      return null;
    },
    async loadPartnerStory(_version) {
      return null;
    },
  };
}

/**
 * Create a story plugin instance based on plugin type
 */
function createPlugin(pluginType: string): StoryPlugin {
  switch (pluginType.toLowerCase()) {
    case 'twine':
      return new TwinePlugin();
    // Future plugins can be added here:
    // case 'ink':
    //   return new InkPlugin();
    default:
      throw new Error(`Unsupported plugin type: ${pluginType}`);
  }
}

/**
 * Custom error class for timeout handling
 */
class TimeoutError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'TimeoutError';
  }
}

/**
 * Wrap a promise with a timeout
 * Rejects with TimeoutError if the promise doesn't resolve within timeoutMs
 */
function withTimeout<T>(promise: Promise<T>, timeoutMs: number, message: string): Promise<T> {
  return Promise.race([
    promise,
    new Promise<never>((_, reject) => {
      const timeoutId = setTimeout(() => {
        reject(new TimeoutError(message));
      }, timeoutMs);
      // Ensure timeout doesn't prevent process exit
      if (typeof timeoutId === 'object' && 'unref' in timeoutId) {
        timeoutId.unref();
      }
    }),
  ]);
}

/**
 * Check if batch should stop processing
 * Uses Redis cache for fast lookups with DB fallback
 */
async function shouldStopProcessing(batchExecutionId: string): Promise<{ stop: boolean; reason?: string }> {
  // First check Redis cache (very fast, ~0.1ms)
  const cachedStatus = await getBatchStatusCache(batchExecutionId);
  if (cachedStatus) {
    if (STOP_STATUSES.includes(cachedStatus as typeof STOP_STATUSES[number])) {
      return { stop: true, reason: cachedStatus };
    }
    return { stop: false };
  }

  // Fallback to DB if not cached (~5-10ms)
  const batch = await prisma.batchExecution.findUnique({
    where: { id: batchExecutionId },
    select: { status: true },
  });

  if (!batch) return { stop: true, reason: 'NOT_FOUND' };
  if (STOP_STATUSES.includes(batch.status as typeof STOP_STATUSES[number])) {
    return { stop: true, reason: batch.status };
  }

  return { stop: false };
}

let worker: Worker<SyntheticExecutionJobData, SyntheticExecutionResult> | null = null;

/**
 * Execute the main action loop for a synthetic actor
 * This function is extracted to allow wrapping with timeout
 */
async function executeActionLoop(
  job: Job<SyntheticExecutionJobData, SyntheticExecutionResult>,
  participantId: string,
  batchExecutionId: string | undefined,
  maxActions: number,
  plugin: StoryPlugin,
  llmConfig: LLMConfig,
  role: string,
  pluginType: string
): Promise<{ actionsExecuted: number; eventsLogged: number; finalState: StoryState }> {
  let actionsExecuted = 0;
  let eventsLogged = 0;

  // Create LLM client
  const llmClient = createLLMClient(llmConfig);
  if (!llmClient.isConfigured()) {
    throw new Error(`LLM client not configured for provider: ${llmConfig.provider}`);
  }

  // Get role adapter for generating actions
  // Use NAVIGATOR role for playing through stories, fall back to specified role
  const effectiveRole = role === 'PLAYER' ? 'NAVIGATOR' : role;
  let roleAdapter;
  try {
    roleAdapter = roleAdapterRegistry.getAdapter(pluginType, effectiveRole);
  } catch {
    // Fall back to NAVIGATOR if specific role not found
    console.log(`[SyntheticExecution] Role adapter not found for ${pluginType}:${effectiveRole}, trying NAVIGATOR`);
    roleAdapter = roleAdapterRegistry.getAdapter(pluginType, 'NAVIGATOR');
  }

  // Action history for context
  const actionHistory: PluginAction[] = [];

  // Main execution loop
  for (let i = 0; i < maxActions; i++) {
    // Check if batch should stop mid-execution (uses Redis cache - very fast)
    if (batchExecutionId && i > 0 && i % 5 === 0) {
      const { stop, reason } = await shouldStopProcessing(batchExecutionId);
      if (stop) {
        console.log(`[SyntheticExecution] Batch ${batchExecutionId} is ${reason}, stopping job ${job.id}`);
        throw new Error(`BATCH_${reason}: Batch ${batchExecutionId} is ${reason}`);
      }
    }

    // Check if story is complete
    if (plugin.isComplete?.()) {
      console.log(`[SyntheticExecution] Story complete after ${actionsExecuted} actions`);
      break;
    }

    // Get available actions from the plugin
    const availableActions = await plugin.getAvailableActions?.() || [];

    if (availableActions.length === 0) {
      console.log(`[SyntheticExecution] No available actions, story may be complete`);
      break;
    }

    // Get current state for context
    const currentState = await plugin.getState();

    // Build context for LLM
    const context: RoleContext = {
      state: currentState,
      role: effectiveRole,
      availableActions,
      actionHistory: actionHistory.slice(-10), // Last 10 actions for context
    };

    // Generate action using LLM
    const action = await roleAdapter.generateAction(llmClient, context);

    // Execute the action
    const result = await plugin.executeHeadless?.(action);

    if (!result) {
      console.error(`[SyntheticExecution] Plugin does not support headless execution`);
      break;
    }

    // Log action event
    await prisma.event.create({
      data: {
        participantId,
        type: 'SYNTHETIC_ACTION',
        data: JSON.stringify({
          actionIndex: i + 1,
          actionType: action.type,
          actionParams: action.params,
          success: result.success,
          error: result.error,
          reasoning: (action.params as Record<string, unknown>)?._llmReasoning,
        }),
        timestamp: new Date(),
      },
    });

    actionsExecuted++;
    eventsLogged++;
    actionHistory.push(action);

    if (!result.success) {
      console.warn(`[SyntheticExecution] Action failed: ${result.error}`);
      // Continue trying other actions
    }

    // Update progress (15-90% for action execution)
    const progress = 15 + Math.round((i / maxActions) * 75);
    await job.updateProgress(progress);
  }

  // Get final state
  const finalState = await plugin.getState();

  return { actionsExecuted, eventsLogged, finalState };
}

/**
 * Process a synthetic execution job
 */
async function processSyntheticExecution(
  job: Job<SyntheticExecutionJobData, SyntheticExecutionResult>
): Promise<SyntheticExecutionResult> {
  const startTime = Date.now();
  console.log(`[SyntheticExecution] Starting job ${job.id}`);

  // Validate job data
  const validatedData = syntheticExecutionJobSchema.parse(job.data);
  const { participantId, conditionId, batchExecutionId, taskConfig } = validatedData;

  let actionsExecuted = 0;
  let eventsLogged = 0;

  try {
    // Check if batch should stop processing (uses Redis cache for speed)
    if (batchExecutionId) {
      const { stop, reason } = await shouldStopProcessing(batchExecutionId);
      if (stop) {
        if (reason === 'PAUSED') {
          console.log(`[SyntheticExecution] Batch ${batchExecutionId} is paused, skipping job ${job.id}`);
          // Throw a specific error to trigger retry later
          throw new Error(`BATCH_PAUSED: Batch ${batchExecutionId} is paused`);
        }
        console.log(`[SyntheticExecution] Batch ${batchExecutionId} is ${reason}, skipping job ${job.id}`);
        return {
          participantId,
          status: 'SKIPPED',
          actionsExecuted: 0,
          eventsLogged: 0,
          durationMs: Date.now() - startTime,
          error: `Batch is ${reason}`,
        };
      }
    }

    // Update participant state to ACTIVE
    await prisma.participant.update({
      where: { id: participantId },
      data: { state: 'ACTIVE' },
    });

    await job.updateProgress(5);

    // Load participant with full configuration
    const participant = await prisma.participant.findUnique({
      where: { id: participantId },
      include: {
        study: {
          include: {
            conditions: true,
          },
        },
        condition: true,
        agentDefinition: true,
      },
    });

    if (!participant) {
      throw new Error(`Participant ${participantId} not found`);
    }

    await job.updateProgress(10);

    // Parse LLM config
    const llmConfig = participant.llmConfig ? JSON.parse(participant.llmConfig) : null;
    if (!llmConfig) {
      throw new Error(`Participant ${participantId} has no LLM configuration`);
    }

    // Get condition (from job data or participant)
    const condition = conditionId
      ? participant.study.conditions.find((c) => c.id === conditionId)
      : participant.condition;

    // Log session start event
    await prisma.event.create({
      data: {
        participantId,
        type: 'SESSION_START',
        data: JSON.stringify({
          role: participant.role,
          llmProvider: llmConfig.provider,
          llmModel: llmConfig.model,
          conditionId: condition?.id,
          batchExecutionId,
        }),
        timestamp: new Date(),
      },
    });
    eventsLogged++;

    await job.updateProgress(15);

    // =========================================================================
    // Plugin Initialization and Execution
    // =========================================================================

    const maxActions = taskConfig?.maxActions || 100;
    const timeoutMs = taskConfig?.timeoutMs || config.queue.syntheticExecution.defaultTimeoutMs;
    const pluginType = taskConfig?.pluginType || 'twine';

    console.log(`[SyntheticExecution] Executing synthetic actor ${participantId} with role ${participant.role}`);
    console.log(`[SyntheticExecution] Plugin: ${pluginType}, Timeout: ${timeoutMs}ms, Max actions: ${maxActions}`);

    // Create the story plugin
    const plugin = createPlugin(pluginType);

    // Parse condition config for initial story state
    const conditionConfig = condition?.config ? JSON.parse(condition.config) : {};

    // Create plugin context
    const pluginContext: PluginContext = {
      study: {
        id: participant.study.id,
        name: participant.study.name,
        type: participant.study.type,
      },
      actor: {
        id: participant.id,
        uniqueId: participant.uniqueId,
        type: 'SYNTHETIC',
        role: participant.role || undefined,
      },
      actorType: 'SYNTHETIC',
      role: participant.role || undefined,
      headless: true,
      session: {
        id: job.id || `session-${Date.now()}`,
        startTime: new Date(),
      },
      condition: condition ? {
        id: condition.id,
        name: condition.name,
        config: conditionConfig,
      } : undefined,
      api: createPluginApiClient(participantId),
    };

    // Initialize plugin in headless mode
    if (plugin.initHeadless) {
      await plugin.initHeadless(pluginContext);
    } else {
      throw new Error(`Plugin ${pluginType} does not support headless mode`);
    }

    // Execute the action loop with timeout enforcement
    const executionResult = await withTimeout(
      executeActionLoop(
        job,
        participantId,
        batchExecutionId,
        maxActions,
        plugin,
        llmConfig,
        participant.role || 'NAVIGATOR',
        pluginType
      ),
      timeoutMs,
      `Job ${job.id} timed out after ${timeoutMs}ms`
    );

    actionsExecuted = executionResult.actionsExecuted;
    eventsLogged += executionResult.eventsLogged;

    // Clean up plugin
    await plugin.destroy();

    await job.updateProgress(90);

    // Log session end event
    await prisma.event.create({
      data: {
        participantId,
        type: 'SESSION_END',
        data: JSON.stringify({
          actionsExecuted,
          duration: Date.now() - startTime,
          completionStatus: 'COMPLETE',
        }),
        timestamp: new Date(),
      },
    });
    eventsLogged++;

    // Update participant state to COMPLETE
    await prisma.participant.update({
      where: { id: participantId },
      data: {
        state: 'COMPLETE',
        completedAt: new Date(),
      },
    });

    // Update batch progress if part of a batch
    if (batchExecutionId) {
      await updateBatchProgress(batchExecutionId);
    }

    await job.updateProgress(100);

    const duration = Date.now() - startTime;
    console.log(
      `[SyntheticExecution] Job ${job.id} completed in ${duration}ms - ` +
      `${actionsExecuted} actions, ${eventsLogged} events`
    );

    return {
      participantId,
      status: 'COMPLETE',
      actionsExecuted,
      eventsLogged,
      durationMs: duration,
    };
  } catch (error) {
    const duration = Date.now() - startTime;
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    const isBatchStopped = errorMessage.startsWith('BATCH_');
    const isTimeout = error instanceof TimeoutError;

    // For batch stop errors (PAUSED, DELETING, etc.), re-throw to trigger retry with backoff
    // This allows the job to be retried later when the batch may be resumed
    if (isBatchStopped) {
      console.log(`[SyntheticExecution] Job ${job.id} stopped due to batch status, will retry`);
      throw error;
    }

    // For timeout errors, log and handle gracefully
    if (isTimeout) {
      console.log(`[SyntheticExecution] Job ${job.id} timed out after ${duration}ms, ${actionsExecuted} actions completed`);
    }

    // For other errors, perform cleanup and re-throw for retry
    // Attempt cleanup operations, but don't mask the original error
    try {
      // Log error event
      await prisma.event.create({
        data: {
          participantId,
          type: isTimeout ? 'SYNTHETIC_TIMEOUT' : 'SYNTHETIC_ERROR',
          data: JSON.stringify({
            error: errorMessage,
            actionsExecuted,
            duration,
            isTimeout,
          }),
          timestamp: new Date(),
        },
      });
    } catch (cleanupError) {
      console.error(`[SyntheticExecution] Failed to log error event:`, cleanupError);
    }

    try {
      // Update participant state
      // For timeouts, mark as COMPLETE with partial progress (actions were recorded)
      // For other errors, mark as EXCLUDED (failed)
      await prisma.participant.update({
        where: { id: participantId },
        data: {
          state: isTimeout ? 'COMPLETE' : 'EXCLUDED',
          completedAt: isTimeout ? new Date() : undefined,
        },
      });
    } catch (cleanupError) {
      console.error(`[SyntheticExecution] Failed to update participant state:`, cleanupError);
    }

    // Update batch progress if part of a batch
    if (batchExecutionId) {
      try {
        await updateBatchProgress(batchExecutionId);
      } catch (cleanupError) {
        console.error(`[SyntheticExecution] Failed to update batch progress:`, cleanupError);
      }
    }

    // For timeouts, return a result instead of throwing (job completed, just hit limit)
    if (isTimeout) {
      return {
        participantId,
        status: 'TIMEOUT',
        actionsExecuted,
        eventsLogged,
        durationMs: duration,
        error: errorMessage,
      };
    }

    console.error(`[SyntheticExecution] Job ${job.id} failed after ${duration}ms:`, errorMessage);

    // Re-throw to trigger BullMQ retry mechanism
    throw error;
  }
}

/**
 * Update batch execution progress
 */
async function updateBatchProgress(batchExecutionId: string): Promise<void> {
  // Count completed participants
  const [completedCount, totalCount] = await Promise.all([
    prisma.participant.count({
      where: {
        batchId: batchExecutionId,
        state: { in: ['COMPLETE', 'EXCLUDED'] },
      },
    }),
    prisma.participant.count({
      where: { batchId: batchExecutionId },
    }),
  ]);

  // Update batch progress
  await prisma.batchExecution.update({
    where: { id: batchExecutionId },
    data: { actorsCompleted: completedCount },
  });

  // Check if batch is complete
  if (completedCount >= totalCount && totalCount > 0) {
    await prisma.batchExecution.update({
      where: { id: batchExecutionId },
      data: {
        status: 'COMPLETE',
        completedAt: new Date(),
      },
    });

    console.log(`[SyntheticExecution] Batch ${batchExecutionId} completed - ${completedCount}/${totalCount} actors`);
  }
}

/**
 * Start the synthetic execution worker
 */
export function startSyntheticExecutionWorker(): Worker<SyntheticExecutionJobData, SyntheticExecutionResult> {
  if (worker) {
    console.warn('[SyntheticExecution] Worker already running');
    return worker;
  }

  worker = new Worker<SyntheticExecutionJobData, SyntheticExecutionResult>(
    QUEUE_NAMES.SYNTHETIC_EXECUTION,
    processSyntheticExecution,
    {
      connection: createRedisConnection(),
      concurrency: config.queue.syntheticExecution.concurrency,
    }
  );

  worker.on('completed', (job, result) => {
    console.log(
      `[SyntheticExecution] Job ${job.id} completed - ` +
      `Status: ${result.status}, Actions: ${result.actionsExecuted}`
    );
  });

  worker.on('failed', (job, error) => {
    console.error(`[SyntheticExecution] Job ${job?.id} failed:`, error.message);
  });

  worker.on('progress', (job, progress) => {
    if (typeof progress === 'number' && progress % 25 === 0) {
      console.log(`[SyntheticExecution] Job ${job.id} progress: ${progress}%`);
    }
  });

  worker.on('error', (error) => {
    console.error('[SyntheticExecution] Worker error:', error);
  });

  console.log('[SyntheticExecution] Worker started');
  return worker;
}

/**
 * Stop the synthetic execution worker
 */
export async function stopSyntheticExecutionWorker(): Promise<void> {
  if (worker) {
    await worker.close();
    worker = null;
    console.log('[SyntheticExecution] Worker stopped');
  }
}

/**
 * Get the worker instance (for testing/monitoring)
 */
export function getSyntheticExecutionWorker(): Worker<SyntheticExecutionJobData, SyntheticExecutionResult> | null {
  return worker;
}
