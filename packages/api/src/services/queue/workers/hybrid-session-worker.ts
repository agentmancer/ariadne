/**
 * Hybrid Session Synthetic Phase Worker
 *
 * Processes jobs to execute synthetic partner phases in hybrid sessions.
 * Triggered when a human participant completes their phase.
 */

import { Worker, Job } from 'bullmq';
import { createRedisConnection } from '../connection';
import { prisma } from '../../../lib/prisma';
import { config } from '../../../config';
import { HybridStudyConfig } from '@ariadne/shared';
import {
  QUEUE_NAMES,
  HybridSessionSyntheticPhaseJobData,
  HybridSessionSyntheticPhaseResult,
  hybridSessionSyntheticPhaseJobSchema,
  hybridStudyConfigSchema,
} from '../types';
import {
  HybridSessionOrchestrator,
  createHybridOrchestrator,
} from '../../collaborative/hybrid-orchestrator';
import { createLLMClient } from '../../llm/clients/factory';

let worker: Worker<HybridSessionSyntheticPhaseJobData, HybridSessionSyntheticPhaseResult> | null = null;

// Cache of active orchestrators by session ID
const orchestratorCache = new Map<string, HybridSessionOrchestrator>();

/**
 * Get or create an orchestrator for a session
 */
async function getOrchestrator(sessionId: string): Promise<HybridSessionOrchestrator | null> {
  let orchestrator = orchestratorCache.get(sessionId);

  if (!orchestrator) {
    // Load session and study config
    const session = await prisma.session.findUnique({
      where: { id: sessionId },
      include: {
        study: {
          select: { config: true },
        },
      },
    });

    if (!session?.study?.config) {
      return null;
    }

    // Parse and validate config
    let rawConfig: unknown;
    try {
      rawConfig = typeof session.study.config === 'string'
        ? JSON.parse(session.study.config)
        : session.study.config;
    } catch {
      console.error(`[HybridSession] Failed to parse study config for session ${sessionId}`);
      return null;
    }

    // Validate with Zod schema
    const parseResult = hybridStudyConfigSchema.safeParse(rawConfig);
    if (!parseResult.success) {
      console.error(`[HybridSession] Invalid study config for session ${sessionId}:`, parseResult.error.issues);
      return null;
    }
    const hybridConfig = parseResult.data as HybridStudyConfig;

    // Create orchestrator
    orchestrator = createHybridOrchestrator(hybridConfig);
    orchestratorCache.set(sessionId, orchestrator);
  }

  return orchestrator;
}

/**
 * Process a synthetic phase job
 */
async function processHybridSessionSyntheticPhase(
  job: Job<HybridSessionSyntheticPhaseJobData, HybridSessionSyntheticPhaseResult>
): Promise<HybridSessionSyntheticPhaseResult> {
  const startTime = Date.now();
  console.log(
    `[HybridSession] Starting synthetic phase job ${job.id} - ` +
    `Session ${job.data.sessionId}, Phase ${job.data.phase}, Round ${job.data.round}`
  );

  // Validate job data
  const validatedData = hybridSessionSyntheticPhaseJobSchema.parse(job.data);
  const {
    sessionId,
    syntheticParticipantId,
    humanParticipantId,
    phase,
    round,
    llmConfig,
    responseDelayMs,
  } = validatedData;

  try {
    // Get orchestrator
    const orchestrator = await getOrchestrator(sessionId);
    if (!orchestrator) {
      throw new Error(`Session ${sessionId} not found or invalid config`);
    }

    // Get session state
    const state = await orchestrator.getSessionState(sessionId);
    if (!state) {
      throw new Error(`Session state not found for ${sessionId}`);
    }

    await job.updateProgress(10);

    // Apply response delay if configured
    if (responseDelayMs && responseDelayMs > 0) {
      console.log(`[HybridSession] Applying ${responseDelayMs}ms delay to simulate human response time`);
      await new Promise(resolve => setTimeout(resolve, responseDelayMs));
    }

    await job.updateProgress(20);

    // Create LLM client
    const llmClient = createLLMClient({
      provider: llmConfig.provider,
      model: llmConfig.model,
      temperature: llmConfig.temperature,
      maxTokens: llmConfig.maxTokens,
    });

    await job.updateProgress(30);

    // Execute the synthetic phase
    const result = await orchestrator.triggerSyntheticPhase(
      state,
      syntheticParticipantId,
      humanParticipantId,
      llmClient
    );

    const duration = Date.now() - startTime;

    if (!result) {
      // Phase was already completed
      console.log(
        `[HybridSession] Synthetic phase already completed for ${syntheticParticipantId}`
      );
      return {
        sessionId,
        syntheticParticipantId,
        phase,
        round,
        status: 'COMPLETE',
        durationMs: duration,
      };
    }

    if (result.success) {
      console.log(
        `[HybridSession] Synthetic phase completed in ${duration}ms - ` +
        `Participant ${syntheticParticipantId}, Phase ${phase}, Round ${round}`
      );

      await job.updateProgress(100);

      return {
        sessionId,
        syntheticParticipantId,
        phase,
        round,
        status: 'COMPLETE',
        durationMs: duration,
        result: {
          storyDataId: result.data?.storyDataId as string | undefined,
          playSessionId: result.data?.playSessionId as string | undefined,
          feedbackIds: result.data?.feedbackIds as string[] | undefined,
        },
      };
    } else {
      console.error(
        `[HybridSession] Synthetic phase failed:`,
        result.error
      );

      return {
        sessionId,
        syntheticParticipantId,
        phase,
        round,
        status: 'FAILED',
        durationMs: duration,
        error: result.error,
      };
    }
  } catch (error) {
    const duration = Date.now() - startTime;
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';

    console.error(
      `[HybridSession] Job ${job.id} failed after ${duration}ms:`,
      errorMessage
    );

    return {
      sessionId,
      syntheticParticipantId,
      phase,
      round,
      status: 'FAILED',
      durationMs: duration,
      error: errorMessage,
    };
  }
}

/**
 * Start the hybrid session worker
 */
export function startHybridSessionWorker(): Worker<HybridSessionSyntheticPhaseJobData, HybridSessionSyntheticPhaseResult> {
  if (worker) {
    console.warn('[HybridSession] Worker already running');
    return worker;
  }

  worker = new Worker<HybridSessionSyntheticPhaseJobData, HybridSessionSyntheticPhaseResult>(
    QUEUE_NAMES.HYBRID_SESSION_SYNTHETIC_PHASE,
    processHybridSessionSyntheticPhase,
    {
      connection: createRedisConnection(),
      // Higher concurrency since these are single-phase executions
      concurrency: config.queue.syntheticExecution.concurrency,
    }
  );

  worker.on('completed', (job, result) => {
    console.log(
      `[HybridSession] Job ${job.id} completed - ` +
      `Status: ${result.status}, Phase: ${result.phase}, Duration: ${result.durationMs}ms`
    );
  });

  worker.on('failed', (job, error) => {
    console.error(`[HybridSession] Job ${job?.id} failed:`, error.message);
  });

  worker.on('progress', (job, progress) => {
    console.log(`[HybridSession] Job ${job.id} progress: ${progress}%`);
  });

  worker.on('error', (error) => {
    console.error('[HybridSession] Worker error:', error);
  });

  console.log('[HybridSession] Synthetic phase worker started');
  return worker;
}

/**
 * Stop the hybrid session worker
 */
export async function stopHybridSessionWorker(): Promise<void> {
  if (worker) {
    await worker.close();
    worker = null;
    orchestratorCache.clear();
    console.log('[HybridSession] Synthetic phase worker stopped');
  }
}

/**
 * Get the worker instance (for testing/monitoring)
 */
export function getHybridSessionWorker(): Worker<HybridSessionSyntheticPhaseJobData, HybridSessionSyntheticPhaseResult> | null {
  return worker;
}

/**
 * Clear the orchestrator cache (for testing)
 */
export function clearOrchestratorCache(): void {
  orchestratorCache.clear();
}
