/**
 * Standalone worker process entry point
 * Run with: npm run workers
 */

import { startWorkers, setupGracefulShutdown } from './services/queue/workers';

// Start workers
startWorkers();

// Setup graceful shutdown
setupGracefulShutdown();

console.log('Worker process started. Press Ctrl+C to stop.');

// Keep process alive
process.stdin.resume();