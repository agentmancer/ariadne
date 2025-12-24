/**
 * Worker Management
 * Central control for starting/stopping all queue workers
 */

import {
  startBatchCreationWorker,
  stopBatchCreationWorker,
  getBatchCreationWorker,
} from './batch-creation-worker';
import {
  startSyntheticExecutionWorker,
  stopSyntheticExecutionWorker,
  getSyntheticExecutionWorker,
} from './synthetic-execution-worker';
import {
  startDataExportWorker,
  stopDataExportWorker,
  getDataExportWorker,
} from './data-export-worker';
import {
  startCollaborativeBatchWorker,
  stopCollaborativeBatchWorker,
  getCollaborativeBatchWorker,
} from './collaborative-batch-worker';
import {
  startCollaborativeSessionWorker,
  stopCollaborativeSessionWorker,
  getCollaborativeSessionWorker,
} from './collaborative-session-worker';
import {
  startHybridSessionWorker,
  stopHybridSessionWorker,
  getHybridSessionWorker,
} from './hybrid-session-worker';
import { closeSharedConnection } from '../connection';
import { closeAllQueues } from '../queues';

export {
  // Batch Creation
  startBatchCreationWorker,
  stopBatchCreationWorker,
  getBatchCreationWorker,
  // Synthetic Execution
  startSyntheticExecutionWorker,
  stopSyntheticExecutionWorker,
  getSyntheticExecutionWorker,
  // Data Export
  startDataExportWorker,
  stopDataExportWorker,
  getDataExportWorker,
  // Collaborative Batch Creation
  startCollaborativeBatchWorker,
  stopCollaborativeBatchWorker,
  getCollaborativeBatchWorker,
  // Collaborative Session
  startCollaborativeSessionWorker,
  stopCollaborativeSessionWorker,
  getCollaborativeSessionWorker,
  // Hybrid Session
  startHybridSessionWorker,
  stopHybridSessionWorker,
  getHybridSessionWorker,
};

/**
 * Start all queue workers
 */
export function startAllWorkers(): void {
  console.log('Starting all queue workers...');

  startBatchCreationWorker();
  startSyntheticExecutionWorker();
  startDataExportWorker();
  startCollaborativeBatchWorker();
  startCollaborativeSessionWorker();
  startHybridSessionWorker();

  console.log('All queue workers started');
}

/**
 * Stop all queue workers gracefully
 */
export async function stopAllWorkers(): Promise<void> {
  console.log('Stopping all queue workers...');

  await Promise.all([
    stopBatchCreationWorker(),
    stopSyntheticExecutionWorker(),
    stopDataExportWorker(),
    stopCollaborativeBatchWorker(),
    stopCollaborativeSessionWorker(),
    stopHybridSessionWorker(),
  ]);

  // Close queues and connections
  await closeAllQueues();
  await closeSharedConnection();

  console.log('All queue workers stopped');
}

/**
 * Get status of all workers
 */
export function getWorkersStatus(): {
  batchCreation: boolean;
  syntheticExecution: boolean;
  dataExport: boolean;
  collaborativeBatch: boolean;
  collaborativeSession: boolean;
  hybridSession: boolean;
} {
  return {
    batchCreation: getBatchCreationWorker() !== null,
    syntheticExecution: getSyntheticExecutionWorker() !== null,
    dataExport: getDataExportWorker() !== null,
    collaborativeBatch: getCollaborativeBatchWorker() !== null,
    collaborativeSession: getCollaborativeSessionWorker() !== null,
    hybridSession: getHybridSessionWorker() !== null,
  };
}

/**
 * Setup graceful shutdown handlers
 */
export function setupGracefulShutdown(): void {
  const signals: NodeJS.Signals[] = ['SIGTERM', 'SIGINT'];

  signals.forEach((signal) => {
    process.on(signal, async () => {
      console.log(`Received ${signal}, shutting down workers gracefully...`);
      await stopAllWorkers();
      process.exit(0);
    });
  });

  console.log('Graceful shutdown handlers registered');
}
