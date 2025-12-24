/**
 * Collaborative Session Worker
 * Runs the CollaborativeSessionOrchestrator for a paired agent session
 */

import { Worker, Job } from 'bullmq';
import { createRedisConnection } from '../connection';
import { prisma } from '../../../lib/prisma';
import { config } from '../../../config';
import { CollaborativePhase } from '@ariadne/shared';
import {
  QUEUE_NAMES,
  CollaborativeSessionJobData,
  CollaborativeSessionResult,
  collaborativeSessionJobSchema,
} from '../types';
import {
  createOrchestrator,
  CollaborativeSessionConfig,
} from '../../collaborative/orchestrator';
import { createLLMClient } from '../../llm/clients/factory';

let worker: Worker<CollaborativeSessionJobData, CollaborativeSessionResult> | null = null;

/**
 * Process a collaborative session job
 */
async function processCollaborativeSession(
  job: Job<CollaborativeSessionJobData, CollaborativeSessionResult>
): Promise<CollaborativeSessionResult> {
  const startTime = Date.now();
  console.log(
    `[CollaborativeSession] Starting job ${job.id} - ` +
    `Participants ${job.data.participantAId} <-> ${job.data.participantBId}`
  );

  // Validate job data
  const validatedData = collaborativeSessionJobSchema.parse(job.data);
  const {
    batchExecutionId,
    studyId: _studyId, // Part of job schema but not used in orchestrator
    participantAId,
    participantBId,
    sessionConfig,
    llmConfigA,
    llmConfigB,
  } = validatedData;

  const roundResults: CollaborativeSessionResult['roundResults'] = [];

  try {
    // Update participant states to ACTIVE
    await prisma.participant.updateMany({
      where: { id: { in: [participantAId, participantBId] } },
      data: { state: 'ACTIVE' },
    });

    await job.updateProgress(5);

    // Create LLM clients for both agents
    const llmA = createLLMClient({
      provider: llmConfigA.provider,
      model: llmConfigA.model,
      temperature: llmConfigA.temperature,
      maxTokens: llmConfigA.maxTokens,
    });

    const llmB = llmConfigB
      ? createLLMClient({
          provider: llmConfigB.provider,
          model: llmConfigB.model,
          temperature: llmConfigB.temperature,
          maxTokens: llmConfigB.maxTokens,
        })
      : llmA;

    // Build orchestrator config
    const orchestratorConfig: Partial<CollaborativeSessionConfig> = {};
    if (sessionConfig) {
      orchestratorConfig.rounds = sessionConfig.rounds;
      orchestratorConfig.phases = sessionConfig.phases as CollaborativePhase[];
      orchestratorConfig.feedbackRequired = sessionConfig.feedbackRequired;
      orchestratorConfig.maxPlayActions = sessionConfig.maxPlayActions;
      if (sessionConfig.storyConstraints) {
        orchestratorConfig.storyConstraints = {
          genre: sessionConfig.storyConstraints.genre,
          theme: sessionConfig.storyConstraints.theme,
          maxPassages: sessionConfig.storyConstraints.maxPassages,
          minPassages: sessionConfig.storyConstraints.minPassages,
        };
      }
    }

    // Create orchestrator
    const orchestrator = createOrchestrator(orchestratorConfig);

    // Initialize session
    const { agentA, agentB } = await orchestrator.initializeSession(
      participantAId,
      participantBId
    );

    // Attach LLM clients
    agentA.llm = llmA;
    agentB.llm = llmB;

    await job.updateProgress(10);

    // Run the collaborative session
    const totalRounds = orchestratorConfig.rounds || 3;
    const phasesPerRound = (orchestratorConfig.phases || [CollaborativePhase.AUTHOR, CollaborativePhase.PLAY, CollaborativePhase.REVIEW]).length;

    const result = await orchestrator.runSession(agentA, agentB, (event) => {
      // Calculate progress (10-95% for session execution)
      const roundProgress = (event.round - 1) / totalRounds;
      const phaseIndex = orchestratorConfig.phases?.indexOf(event.phase as CollaborativePhase) || 0;
      const phaseProgress = phaseIndex / phasesPerRound;
      const overallProgress = 10 + Math.round((roundProgress + phaseProgress / totalRounds) * 85);

      job.updateProgress(overallProgress);
      console.log(
        `[CollaborativeSession] Job ${job.id} - ` +
        `Round ${event.round} / ${event.phase} / Agent ${event.agent}: ${event.status}`
      );
    });

    // Convert round results to the expected format
    for (const round of result.rounds) {
      const phases: Array<{
        phase: string;
        participantId: string;
        success: boolean;
        error?: string;
      }> = [];

      for (const phaseResult of round.results) {
        phases.push({
          phase: phaseResult.phase,
          participantId: phaseResult.participantId,
          success: phaseResult.success,
          error: phaseResult.error,
        });
      }

      roundResults.push({
        round: round.round,
        phases,
      });
    }

    // Update participant states to COMPLETED
    await prisma.participant.updateMany({
      where: { id: { in: [participantAId, participantBId] } },
      data: { state: 'COMPLETED' },
    });

    const duration = Date.now() - startTime;
    console.log(
      `[CollaborativeSession] Job ${job.id} completed in ${duration}ms - ` +
      `${result.rounds.length} rounds completed`
    );

    await job.updateProgress(100);

    // Check for any failures in round results
    const hasFailures = roundResults.some((r) =>
      r.phases.some((p) => !p.success)
    );

    return {
      batchExecutionId,
      participantAId,
      participantBId,
      rounds: result.rounds.length,
      status: hasFailures ? 'PARTIAL' : 'COMPLETE',
      durationMs: duration,
      roundResults,
    };
  } catch (error) {
    const duration = Date.now() - startTime;
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';

    // Update participant states to FAILED
    await prisma.participant.updateMany({
      where: { id: { in: [participantAId, participantBId] } },
      data: { state: 'EXCLUDED' }, // Use EXCLUDED state for failed sessions
    });

    console.error(
      `[CollaborativeSession] Job ${job.id} failed after ${duration}ms:`,
      errorMessage
    );

    return {
      batchExecutionId,
      participantAId,
      participantBId,
      rounds: roundResults.length,
      status: 'FAILED',
      durationMs: duration,
      roundResults,
      error: errorMessage,
    };
  }
}

/**
 * Start the collaborative session worker
 */
export function startCollaborativeSessionWorker(): Worker<CollaborativeSessionJobData, CollaborativeSessionResult> {
  if (worker) {
    console.warn('[CollaborativeSession] Worker already running');
    return worker;
  }

  worker = new Worker<CollaborativeSessionJobData, CollaborativeSessionResult>(
    QUEUE_NAMES.COLLABORATIVE_SESSION,
    processCollaborativeSession,
    {
      connection: createRedisConnection(),
      // Lower concurrency for collaborative sessions since they're resource-intensive
      concurrency: Math.max(1, Math.floor(config.queue.syntheticExecution.concurrency / 2)),
    }
  );

  worker.on('completed', (job, result) => {
    console.log(
      `[CollaborativeSession] Job ${job.id} completed - ` +
      `Status: ${result.status}, ${result.rounds} rounds in ${result.durationMs}ms`
    );
  });

  worker.on('failed', (job, error) => {
    console.error(`[CollaborativeSession] Job ${job?.id} failed:`, error.message);
  });

  worker.on('progress', (job, progress) => {
    console.log(`[CollaborativeSession] Job ${job.id} progress: ${progress}%`);
  });

  worker.on('error', (error) => {
    console.error('[CollaborativeSession] Worker error:', error);
  });

  console.log('[CollaborativeSession] Worker started');
  return worker;
}

/**
 * Stop the collaborative session worker
 */
export async function stopCollaborativeSessionWorker(): Promise<void> {
  if (worker) {
    await worker.close();
    worker = null;
    console.log('[CollaborativeSession] Worker stopped');
  }
}

/**
 * Get the worker instance (for testing/monitoring)
 */
export function getCollaborativeSessionWorker(): Worker<CollaborativeSessionJobData, CollaborativeSessionResult> | null {
  return worker;
}
