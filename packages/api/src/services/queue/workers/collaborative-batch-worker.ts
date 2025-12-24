/**
 * Collaborative Batch Creation Worker
 * Creates pairs of synthetic participants for collaborative study and queues session jobs
 */

import { randomUUID } from 'crypto';
import { Worker, Job } from 'bullmq';
import { createRedisConnection } from '../connection';
import { prisma } from '../../../lib/prisma';
import { config } from '../../../config';
import {
  QUEUE_NAMES,
  CollaborativeBatchCreationJobData,
  CollaborativeBatchCreationResult,
  collaborativeBatchCreationJobSchema,
} from '../types';
import { addCollaborativeSessionJob } from '../queues';

let worker: Worker<CollaborativeBatchCreationJobData, CollaborativeBatchCreationResult> | null = null;

/**
 * Process a collaborative batch creation job
 */
async function processCollaborativeBatchCreation(
  job: Job<CollaborativeBatchCreationJobData, CollaborativeBatchCreationResult>
): Promise<CollaborativeBatchCreationResult> {
  const startTime = Date.now();
  console.log(`[CollaborativeBatch] Starting job ${job.id} - Creating ${job.data.pairCount} agent pairs`);

  // Validate job data
  const validatedData = collaborativeBatchCreationJobSchema.parse(job.data);
  const {
    batchExecutionId,
    studyId,
    conditionId,
    pairCount,
    sessionConfig,
    llmConfig,
    varyPartnerConfig,
    partnerLlmConfig,
    agentDefinitionId,
    priority,
  } = validatedData;

  // Update batch status to RUNNING
  await prisma.batchExecution.update({
    where: { id: batchExecutionId },
    data: {
      status: 'RUNNING',
      startedAt: new Date(),
    },
  });

  await job.updateProgress(5);

  const batchPrefix = batchExecutionId.substring(0, 8);
  const participantIds: string[] = [];
  const sessionJobIds: string[] = [];

  try {
    // Create pairs of participants
    for (let pairIndex = 0; pairIndex < pairCount; pairIndex++) {
      // Generate IDs for both participants in the pair
      const participantAId = randomUUID();
      const participantBId = randomUUID();

      participantIds.push(participantAId, participantBId);

      // LLM config for participant A
      const llmConfigA = JSON.stringify(llmConfig);

      // LLM config for participant B (may differ if varyPartnerConfig is true)
      const llmConfigB = varyPartnerConfig && partnerLlmConfig
        ? JSON.stringify(partnerLlmConfig)
        : llmConfigA;

      // Create both participants with partner references
      await prisma.participant.createMany({
        data: [
          {
            id: participantAId,
            studyId,
            conditionId,
            uniqueId: `${batchPrefix}-pair${pairIndex + 1}-A`,
            actorType: 'SYNTHETIC',
            role: 'COLLABORATIVE',
            llmConfig: llmConfigA,
            batchId: batchExecutionId,
            agentDefinitionId,
            state: 'ENROLLED',
            partnerId: participantBId,
            metadata: JSON.stringify({
              createdByBatch: batchExecutionId,
              priority,
              pairIndex: pairIndex + 1,
              pairRole: 'A',
            }),
          },
          {
            id: participantBId,
            studyId,
            conditionId,
            uniqueId: `${batchPrefix}-pair${pairIndex + 1}-B`,
            actorType: 'SYNTHETIC',
            role: 'COLLABORATIVE',
            llmConfig: llmConfigB,
            batchId: batchExecutionId,
            agentDefinitionId,
            state: 'ENROLLED',
            partnerId: participantAId,
            metadata: JSON.stringify({
              createdByBatch: batchExecutionId,
              priority,
              pairIndex: pairIndex + 1,
              pairRole: 'B',
            }),
          },
        ],
      });

      // Queue a collaborative session job for this pair
      const sessionJobId = await addCollaborativeSessionJob({
        batchExecutionId,
        studyId,
        conditionId,
        participantAId,
        participantBId,
        sessionConfig,
        llmConfigA: llmConfig,
        llmConfigB: varyPartnerConfig && partnerLlmConfig ? partnerLlmConfig : undefined,
        priority,
      });

      sessionJobIds.push(sessionJobId);

      // Update progress (5-90% for pair creation)
      const progressPercent = 5 + Math.round(((pairIndex + 1) / pairCount) * 85);
      await job.updateProgress(progressPercent);
    }

    // Update batch with created count (total participants = pairCount * 2)
    await prisma.batchExecution.update({
      where: { id: batchExecutionId },
      data: { actorsCreated: participantIds.length },
    });

    const duration = Date.now() - startTime;
    console.log(
      `[CollaborativeBatch] Job ${job.id} completed in ${duration}ms - ` +
      `Created ${pairCount} pairs (${participantIds.length} participants), queued ${sessionJobIds.length} session jobs`
    );

    await job.updateProgress(100);

    return {
      batchExecutionId,
      pairsCreated: pairCount,
      participantIds,
      jobsQueued: sessionJobIds.length,
    };
  } catch (error) {
    // Update batch status to FAILED
    await prisma.batchExecution.update({
      where: { id: batchExecutionId },
      data: {
        status: 'FAILED',
        error: error instanceof Error ? error.message : 'Unknown error during collaborative batch creation',
      },
    });

    throw error;
  }
}

/**
 * Start the collaborative batch creation worker
 */
export function startCollaborativeBatchWorker(): Worker<CollaborativeBatchCreationJobData, CollaborativeBatchCreationResult> {
  if (worker) {
    console.warn('[CollaborativeBatch] Worker already running');
    return worker;
  }

  worker = new Worker<CollaborativeBatchCreationJobData, CollaborativeBatchCreationResult>(
    QUEUE_NAMES.COLLABORATIVE_BATCH_CREATION,
    processCollaborativeBatchCreation,
    {
      connection: createRedisConnection(),
      concurrency: config.queue.batchCreation.concurrency,
    }
  );

  worker.on('completed', (job, result) => {
    console.log(
      `[CollaborativeBatch] Job ${job.id} completed - ` +
      `${result.pairsCreated} pairs created`
    );
  });

  worker.on('failed', (job, error) => {
    console.error(`[CollaborativeBatch] Job ${job?.id} failed:`, error.message);
  });

  worker.on('progress', (job, progress) => {
    console.log(`[CollaborativeBatch] Job ${job.id} progress: ${progress}%`);
  });

  worker.on('error', (error) => {
    console.error('[CollaborativeBatch] Worker error:', error);
  });

  console.log('[CollaborativeBatch] Worker started');
  return worker;
}

/**
 * Stop the collaborative batch creation worker
 */
export async function stopCollaborativeBatchWorker(): Promise<void> {
  if (worker) {
    await worker.close();
    worker = null;
    console.log('[CollaborativeBatch] Worker stopped');
  }
}

/**
 * Get the worker instance (for testing/monitoring)
 */
export function getCollaborativeBatchWorker(): Worker<CollaborativeBatchCreationJobData, CollaborativeBatchCreationResult> | null {
  return worker;
}
