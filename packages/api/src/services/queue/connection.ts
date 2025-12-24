/**
 * Redis connection for BullMQ queues
 */

import Redis, { RedisOptions } from 'ioredis';
import { config } from '../../config';

/**
 * Create Redis connection options from config
 */
function getRedisOptions(): RedisOptions {
  return {
    host: config.redis.host,
    port: config.redis.port,
    password: config.redis.password || undefined,
    db: config.redis.db,
    maxRetriesPerRequest: null, // Required for BullMQ
  };
}

/**
 * Create a new Redis connection
 * Each queue/worker should use its own connection
 */
export function createRedisConnection(): Redis {
  if (config.redis.url) {
    return new Redis(config.redis.url, { maxRetriesPerRequest: null });
  }
  return new Redis(getRedisOptions());
}

/**
 * Shared connection for queue definitions
 * Workers will create their own connections
 */
let sharedConnection: Redis | null = null;

export function getSharedConnection(): Redis {
  if (!sharedConnection) {
    sharedConnection = createRedisConnection();

    sharedConnection.on('error', (err) => {
      console.error('Redis connection error:', err.message);
    });

    sharedConnection.on('connect', () => {
      console.log('Redis connected for job queues');
    });
  }
  return sharedConnection;
}

/**
 * Close shared connection (for graceful shutdown)
 */
export async function closeSharedConnection(): Promise<void> {
  if (sharedConnection) {
    await sharedConnection.quit();
    sharedConnection = null;
  }
}

// ============================================================================
// Batch Status Cache (for fast pause detection)
// ============================================================================

const BATCH_STATUS_PREFIX = 'batch-status:';
const BATCH_STATUS_TTL = 3600; // 1 hour TTL

/**
 * Set batch status in Redis cache
 * Called when batch status changes (pause/resume/complete/fail)
 */
export async function setBatchStatusCache(
  batchExecutionId: string,
  status: string
): Promise<void> {
  const redis = getSharedConnection();
  await redis.setex(`${BATCH_STATUS_PREFIX}${batchExecutionId}`, BATCH_STATUS_TTL, status);
}

/**
 * Get batch status from Redis cache
 * Returns null if not cached (caller should fall back to DB)
 */
export async function getBatchStatusCache(
  batchExecutionId: string
): Promise<string | null> {
  const redis = getSharedConnection();
  return redis.get(`${BATCH_STATUS_PREFIX}${batchExecutionId}`);
}

/**
 * Delete batch status from Redis cache
 * Called when batch is deleted
 */
export async function deleteBatchStatusCache(
  batchExecutionId: string
): Promise<void> {
  const redis = getSharedConnection();
  await redis.del(`${BATCH_STATUS_PREFIX}${batchExecutionId}`);
}
