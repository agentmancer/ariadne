/**
 * Ariadne Platform v2.0 - API Server
 * Cloud backend for the Ariadne research platform
 */

import { config } from './config';
import { createApp } from './app';
import { startWorkers, setupGracefulShutdown } from './services/queue/workers';

const app = createApp();

// ============================================
// START SERVER
// ============================================

const PORT = config.port;

app.listen(PORT, () => {
  console.log(`🚀 Ariadne API server running on port ${PORT}`);
  console.log(`📊 Environment: ${config.env}`);
  console.log(`🔗 Health check: http://localhost:${PORT}/health`);
  console.log(`📖 API Documentation: http://localhost:${PORT}/api/docs`);
  console.log(`📄 OpenAPI Spec: http://localhost:${PORT}/api/docs/openapi.json`);

  // Start queue workers
  startWorkers();
});

// Graceful shutdown
setupGracefulShutdown();
