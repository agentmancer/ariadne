/**
 * @deprecated Use the new queue module structure instead:
 * - import { startAllWorkers, stopAllWorkers } from './index'
 * - import { addBatchCreationJob } from './queues'
 *
 * This file is kept for backwards compatibility and will be removed in a future version.
 */

export {
  startAllWorkers as startWorkers,
  stopAllWorkers as shutdownWorkers,
  setupGracefulShutdown,
} from './workers/index';

// Re-export queue access for compatibility
export {
  getBatchCreationQueue,
  getSyntheticExecutionQueue as getExecutionQueue,
  getDataExportQueue as getExportQueue,
} from './queues';

// Create a simple queues object for backwards compatibility
import {
  getBatchCreationQueue,
  getSyntheticExecutionQueue,
  getDataExportQueue,
} from './queues';

export const queues = {
  get batchExecution() {
    return getBatchCreationQueue();
  },
  get syntheticExecution() {
    return getSyntheticExecutionQueue();
  },
  get dataExport() {
    return getDataExportQueue();
  },
};
