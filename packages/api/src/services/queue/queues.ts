/**
 * Queue definitions for batch execution and synthetic actors
 */

import { Queue } from 'bullmq';
import { getSharedConnection } from './connection';
import {
  QUEUE_NAMES,
  BatchCreationJobData,
  SyntheticExecutionJobData,
  DataExportJobData,
  CollaborativeBatchCreationJobData,
  CollaborativeSessionJobData,
  getPriorityValue,
} from './types';
import { config } from '../../config';

// ============================================================================
// Queue Instances
// ============================================================================

let batchCreationQueue: Queue<BatchCreationJobData> | null = null;
let syntheticExecutionQueue: Queue<SyntheticExecutionJobData> | null = null;
let dataExportQueue: Queue<DataExportJobData> | null = null;
let collaborativeBatchQueue: Queue<CollaborativeBatchCreationJobData> | null = null;
let collaborativeSessionQueue: Queue<CollaborativeSessionJobData> | null = null;

/**
 * Get or create the batch creation queue
 */
export function getBatchCreationQueue(): Queue<BatchCreationJobData> {
  if (!batchCreationQueue) {
    batchCreationQueue = new Queue<BatchCreationJobData>(QUEUE_NAMES.BATCH_CREATION, {
      connection: getSharedConnection(),
      defaultJobOptions: {
        attempts: config.queue.defaultRetries,
        backoff: {
          type: 'exponential',
          delay: config.queue.retryDelay,
        },
        removeOnComplete: {
          age: 24 * 3600, // Keep completed jobs for 24 hours
          count: 1000,    // Keep last 1000 completed jobs
        },
        removeOnFail: {
          age: 7 * 24 * 3600, // Keep failed jobs for 7 days
        },
      },
    });
  }
  return batchCreationQueue;
}

/**
 * Get or create the synthetic execution queue
 */
export function getSyntheticExecutionQueue(): Queue<SyntheticExecutionJobData> {
  if (!syntheticExecutionQueue) {
    syntheticExecutionQueue = new Queue<SyntheticExecutionJobData>(QUEUE_NAMES.SYNTHETIC_EXECUTION, {
      connection: getSharedConnection(),
      defaultJobOptions: {
        attempts: config.queue.defaultRetries,
        backoff: {
          type: 'exponential',
          delay: config.queue.retryDelay,
        },
        removeOnComplete: {
          age: 24 * 3600,
          count: 5000,
        },
        removeOnFail: {
          age: 7 * 24 * 3600,
        },
      },
    });
  }
  return syntheticExecutionQueue;
}

/**
 * Get or create the data export queue
 */
export function getDataExportQueue(): Queue<DataExportJobData> {
  if (!dataExportQueue) {
    dataExportQueue = new Queue<DataExportJobData>(QUEUE_NAMES.DATA_EXPORT, {
      connection: getSharedConnection(),
      defaultJobOptions: {
        attempts: config.queue.defaultRetries,
        backoff: {
          type: 'exponential',
          delay: config.queue.retryDelay,
        },
        removeOnComplete: {
          age: 7 * 24 * 3600, // Keep export jobs for 7 days
          count: 100,
        },
        removeOnFail: {
          age: 30 * 24 * 3600, // Keep failed exports for 30 days
        },
      },
    });
  }
  return dataExportQueue;
}

/**
 * Get or create the collaborative batch creation queue
 */
export function getCollaborativeBatchQueue(): Queue<CollaborativeBatchCreationJobData> {
  if (!collaborativeBatchQueue) {
    collaborativeBatchQueue = new Queue<CollaborativeBatchCreationJobData>(QUEUE_NAMES.COLLABORATIVE_BATCH_CREATION, {
      connection: getSharedConnection(),
      defaultJobOptions: {
        attempts: config.queue.defaultRetries,
        backoff: {
          type: 'exponential',
          delay: config.queue.retryDelay,
        },
        removeOnComplete: {
          age: 24 * 3600,
          count: 500,
        },
        removeOnFail: {
          age: 7 * 24 * 3600,
        },
      },
    });
  }
  return collaborativeBatchQueue;
}

/**
 * Get or create the collaborative session queue
 */
export function getCollaborativeSessionQueue(): Queue<CollaborativeSessionJobData> {
  if (!collaborativeSessionQueue) {
    collaborativeSessionQueue = new Queue<CollaborativeSessionJobData>(QUEUE_NAMES.COLLABORATIVE_SESSION, {
      connection: getSharedConnection(),
      defaultJobOptions: {
        attempts: config.queue.defaultRetries,
        backoff: {
          type: 'exponential',
          delay: config.queue.retryDelay,
        },
        removeOnComplete: {
          age: 24 * 3600,
          count: 2000,
        },
        removeOnFail: {
          age: 7 * 24 * 3600,
        },
      },
    });
  }
  return collaborativeSessionQueue;
}

// ============================================================================
// Job Addition Helpers
// ============================================================================

/**
 * Add a batch creation job to the queue
 */
export async function addBatchCreationJob(
  data: BatchCreationJobData,
  jobId?: string
): Promise<string> {
  const queue = getBatchCreationQueue();
  const job = await queue.add('create-batch', data, {
    jobId,
    priority: getPriorityValue(data.priority),
  });
  return job.id!;
}

/**
 * Add a synthetic execution job to the queue
 */
export async function addSyntheticExecutionJob(
  data: SyntheticExecutionJobData,
  jobId?: string
): Promise<string> {
  const queue = getSyntheticExecutionQueue();
  const job = await queue.add('execute-synthetic', data, {
    jobId,
    priority: getPriorityValue(data.priority),
  });
  return job.id!;
}

/**
 * Add a data export job to the queue
 */
export async function addDataExportJob(
  data: DataExportJobData,
  jobId?: string
): Promise<string> {
  const queue = getDataExportQueue();
  const job = await queue.add('export-data', data, {
    jobId,
  });
  return job.id!;
}

/**
 * Add a collaborative batch creation job to the queue
 */
export async function addCollaborativeBatchJob(
  data: CollaborativeBatchCreationJobData,
  jobId?: string
): Promise<string> {
  const queue = getCollaborativeBatchQueue();
  const job = await queue.add('create-collaborative-batch', data, {
    jobId,
    priority: getPriorityValue(data.priority),
  });
  return job.id!;
}

/**
 * Add a collaborative session job to the queue
 */
export async function addCollaborativeSessionJob(
  data: CollaborativeSessionJobData,
  jobId?: string
): Promise<string> {
  const queue = getCollaborativeSessionQueue();
  const job = await queue.add('run-collaborative-session', data, {
    jobId,
    priority: getPriorityValue(data.priority),
  });
  return job.id!;
}

/**
 * Add multiple synthetic execution jobs in bulk
 */
export async function addBulkSyntheticExecutionJobs(
  jobs: Array<{ data: SyntheticExecutionJobData; jobId?: string }>
): Promise<string[]> {
  const queue = getSyntheticExecutionQueue();
  const bulkJobs = jobs.map(({ data, jobId }) => ({
    name: 'execute-synthetic',
    data,
    opts: {
      jobId,
      priority: getPriorityValue(data.priority),
    },
  }));

  const addedJobs = await queue.addBulk(bulkJobs);
  return addedJobs.map((job) => job.id!);
}

// ============================================================================
// Queue Status Helpers
// ============================================================================

/**
 * Get queue statistics
 */
export async function getQueueStats(queueName: string): Promise<{
  waiting: number;
  active: number;
  completed: number;
  failed: number;
  delayed: number;
}> {
  let queue: Queue;
  switch (queueName) {
    case QUEUE_NAMES.BATCH_CREATION:
      queue = getBatchCreationQueue();
      break;
    case QUEUE_NAMES.SYNTHETIC_EXECUTION:
      queue = getSyntheticExecutionQueue();
      break;
    case QUEUE_NAMES.DATA_EXPORT:
      queue = getDataExportQueue();
      break;
    case QUEUE_NAMES.COLLABORATIVE_BATCH_CREATION:
      queue = getCollaborativeBatchQueue();
      break;
    case QUEUE_NAMES.COLLABORATIVE_SESSION:
      queue = getCollaborativeSessionQueue();
      break;
    default:
      throw new Error(`Unknown queue: ${queueName}`);
  }

  const [waiting, active, completed, failed, delayed] = await Promise.all([
    queue.getWaitingCount(),
    queue.getActiveCount(),
    queue.getCompletedCount(),
    queue.getFailedCount(),
    queue.getDelayedCount(),
  ]);

  return { waiting, active, completed, failed, delayed };
}

/**
 * Get all queue statistics
 */
export async function getAllQueueStats(): Promise<
  Record<string, { waiting: number; active: number; completed: number; failed: number; delayed: number }>
> {
  const [batchStats, executionStats, exportStats, collaborativeBatchStats, collaborativeSessionStats] = await Promise.all([
    getQueueStats(QUEUE_NAMES.BATCH_CREATION),
    getQueueStats(QUEUE_NAMES.SYNTHETIC_EXECUTION),
    getQueueStats(QUEUE_NAMES.DATA_EXPORT),
    getQueueStats(QUEUE_NAMES.COLLABORATIVE_BATCH_CREATION),
    getQueueStats(QUEUE_NAMES.COLLABORATIVE_SESSION),
  ]);

  return {
    [QUEUE_NAMES.BATCH_CREATION]: batchStats,
    [QUEUE_NAMES.SYNTHETIC_EXECUTION]: executionStats,
    [QUEUE_NAMES.DATA_EXPORT]: exportStats,
    [QUEUE_NAMES.COLLABORATIVE_BATCH_CREATION]: collaborativeBatchStats,
    [QUEUE_NAMES.COLLABORATIVE_SESSION]: collaborativeSessionStats,
  };
}

// ============================================================================
// Cleanup
// ============================================================================

/**
 * Close all queue connections
 */
export async function closeAllQueues(): Promise<void> {
  const queues = [
    batchCreationQueue,
    syntheticExecutionQueue,
    dataExportQueue,
    collaborativeBatchQueue,
    collaborativeSessionQueue,
  ].filter(Boolean);
  await Promise.all(queues.map((q) => q!.close()));
  batchCreationQueue = null;
  syntheticExecutionQueue = null;
  dataExportQueue = null;
  collaborativeBatchQueue = null;
  collaborativeSessionQueue = null;
}
