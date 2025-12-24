/**
 * Batch Creation Worker
 * Creates synthetic participants for a batch execution and queues their execution jobs
 */

import { randomUUID } from 'crypto';
import { Worker, Job } from 'bullmq';
import { createRedisConnection } from '../connection';
import { prisma } from '../../../lib/prisma';
import { config } from '../../../config';
import {
  QUEUE_NAMES,
  BatchCreationJobData,
  BatchCreationResult,
  batchCreationJobSchema,
} from '../types';
import { addBulkSyntheticExecutionJobs } from '../queues';

let worker: Worker<BatchCreationJobData, BatchCreationResult> | null = null;

/**
 * Process a batch creation job
 */
async function processBatchCreation(
  job: Job<BatchCreationJobData, BatchCreationResult>
): Promise<BatchCreationResult> {
  const startTime = Date.now();
  console.log(`[BatchCreation] Starting job ${job.id} - Creating ${job.data.actorCount} synthetic actors`);

  // Validate job data
  const validatedData = batchCreationJobSchema.parse(job.data);
  const {
    batchExecutionId,
    studyId,
    conditionId,
    actorCount,
    role,
    llmConfig,
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

  // Report progress
  await job.updateProgress(5);

  // Generate all participant IDs and data upfront to avoid race conditions
  // Use batch-scoped unique IDs: {batchId prefix}-{index} to ensure uniqueness
  const batchPrefix = batchExecutionId.substring(0, 8);
  const participantIds: string[] = [];

  try {
    // Create participants in batches of 100 for better performance
    const batchSize = 100;
    for (let i = 0; i < actorCount; i += batchSize) {
      const currentBatchSize = Math.min(batchSize, actorCount - i);
      const participantsToCreate = [];

      for (let j = 0; j < currentBatchSize; j++) {
        const index = i + j + 1; // 1-based index within this batch execution
        const id = randomUUID(); // Generate ID client-side for createMany compatibility
        participantIds.push(id);

        participantsToCreate.push({
          id,
          studyId,
          conditionId,
          // Use batch-scoped unique ID to avoid race conditions
          // Format: {batch prefix}-{index} e.g., "abc12345-1", "abc12345-2"
          uniqueId: `${batchPrefix}-${index}`,
          actorType: 'SYNTHETIC',
          role,
          llmConfig: JSON.stringify(llmConfig),
          batchId: batchExecutionId,
          agentDefinitionId,
          state: 'ENROLLED',
          metadata: JSON.stringify({
            createdByBatch: batchExecutionId,
            priority,
            batchIndex: index,
          }),
        });
      }

      // Create participants using createMany (compatible with SQLite)
      await prisma.participant.createMany({
        data: participantsToCreate,
      });

      // Update progress (5-80% for participant creation)
      const progressPercent = 5 + Math.round((participantIds.length / actorCount) * 75);
      await job.updateProgress(progressPercent);
    }

    // Update batch with created count
    await prisma.batchExecution.update({
      where: { id: batchExecutionId },
      data: { actorsCreated: participantIds.length },
    });

    console.log(`[BatchCreation] Created ${participantIds.length} participants, queuing execution jobs...`);

    // Queue execution jobs for all participants
    const executionJobs = participantIds.map((participantId) => ({
      data: {
        participantId,
        conditionId,
        batchExecutionId,
        priority,
      },
      jobId: `exec-${batchExecutionId}-${participantId}`,
    }));

    const jobIds = await addBulkSyntheticExecutionJobs(executionJobs);

    await job.updateProgress(95);

    const duration = Date.now() - startTime;
    console.log(
      `[BatchCreation] Job ${job.id} completed in ${duration}ms - ` +
      `Created ${participantIds.length} participants, queued ${jobIds.length} execution jobs`
    );

    await job.updateProgress(100);

    return {
      batchExecutionId,
      participantsCreated: participantIds.length,
      participantIds,
      jobsQueued: jobIds.length,
    };
  } catch (error) {
    // Update batch status to FAILED
    await prisma.batchExecution.update({
      where: { id: batchExecutionId },
      data: {
        status: 'FAILED',
        error: error instanceof Error ? error.message : 'Unknown error during batch creation',
      },
    });

    throw error;
  }
}

/**
 * Start the batch creation worker
 */
export function startBatchCreationWorker(): Worker<BatchCreationJobData, BatchCreationResult> {
  if (worker) {
    console.warn('[BatchCreation] Worker already running');
    return worker;
  }

  worker = new Worker<BatchCreationJobData, BatchCreationResult>(
    QUEUE_NAMES.BATCH_CREATION,
    processBatchCreation,
    {
      connection: createRedisConnection(),
      concurrency: config.queue.batchCreation.concurrency,
    }
  );

  worker.on('completed', (job, result) => {
    console.log(
      `[BatchCreation] Job ${job.id} completed - ` +
      `${result.participantsCreated} participants created`
    );
  });

  worker.on('failed', (job, error) => {
    console.error(`[BatchCreation] Job ${job?.id} failed:`, error.message);
  });

  worker.on('progress', (job, progress) => {
    console.log(`[BatchCreation] Job ${job.id} progress: ${progress}%`);
  });

  worker.on('error', (error) => {
    console.error('[BatchCreation] Worker error:', error);
  });

  console.log('[BatchCreation] Worker started');
  return worker;
}

/**
 * Stop the batch creation worker
 */
export async function stopBatchCreationWorker(): Promise<void> {
  if (worker) {
    await worker.close();
    worker = null;
    console.log('[BatchCreation] Worker stopped');
  }
}

/**
 * Get the worker instance (for testing/monitoring)
 */
export function getBatchCreationWorker(): Worker<BatchCreationJobData, BatchCreationResult> | null {
  return worker;
}
