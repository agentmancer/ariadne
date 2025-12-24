/**
 * Queue Services
 * Export all queue-related functionality
 */

// Connection management
export {
  createRedisConnection,
  getSharedConnection,
  closeSharedConnection,
  // Batch status cache (for fast pause detection)
  setBatchStatusCache,
  getBatchStatusCache,
  deleteBatchStatusCache,
} from './connection';

// Types and schemas
export {
  // Job data types
  BatchCreationJobData,
  SyntheticExecutionJobData,
  DataExportJobData,
  CollaborativeBatchCreationJobData,
  CollaborativeSessionJobData,
  // Result types
  BatchCreationResult,
  SyntheticExecutionResult,
  DataExportResult,
  CollaborativeBatchCreationResult,
  CollaborativeSessionResult,
  // Schemas for validation
  batchCreationJobSchema,
  syntheticExecutionJobSchema,
  dataExportJobSchema,
  collaborativeBatchCreationJobSchema,
  collaborativeSessionJobSchema,
  // Constants
  QUEUE_NAMES,
  JOB_PRIORITIES,
  getPriorityValue,
} from './types';

// Queue instances and job addition
export {
  getBatchCreationQueue,
  getSyntheticExecutionQueue,
  getDataExportQueue,
  getCollaborativeBatchQueue,
  getCollaborativeSessionQueue,
  addBatchCreationJob,
  addSyntheticExecutionJob,
  addDataExportJob,
  addCollaborativeBatchJob,
  addCollaborativeSessionJob,
  addBulkSyntheticExecutionJobs,
  getQueueStats,
  getAllQueueStats,
  closeAllQueues,
} from './queues';

// Worker management
export {
  startAllWorkers,
  stopAllWorkers,
  getWorkersStatus,
  setupGracefulShutdown,
  // Individual workers
  startBatchCreationWorker,
  stopBatchCreationWorker,
  startSyntheticExecutionWorker,
  stopSyntheticExecutionWorker,
  startDataExportWorker,
  stopDataExportWorker,
  startCollaborativeBatchWorker,
  stopCollaborativeBatchWorker,
  startCollaborativeSessionWorker,
  stopCollaborativeSessionWorker,
} from './workers/index';
