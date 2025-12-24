/**
 * Express app factory for the Ariadne API
 * Separated from index.ts to allow importing for tests
 */

import express, { Express } from 'express';
import cors from 'cors';
import helmet from 'helmet';
import { config } from './config';
import { errorHandler } from './middleware/error-handler';
import { requestLogger } from './middleware/request-logger';
import { rateLimiter } from './middleware/rate-limiter';
import { apiRouter } from './routes';

export interface CreateAppOptions {
  enableRateLimiting?: boolean;
  enableRequestLogging?: boolean;
  enableSwagger?: boolean;
}

/**
 * Creates and configures the Express application
 */
export function createApp(options: CreateAppOptions = {}): Express {
  const {
    enableRateLimiting = true,
    enableRequestLogging = true,
    enableSwagger = true,
  } = options;

  const app = express();

  // Security headers (configure CSP for Swagger UI)
  app.use(helmet({
    contentSecurityPolicy: {
      directives: {
        ...helmet.contentSecurityPolicy.getDefaultDirectives(),
        "script-src": ["'self'", "'unsafe-inline'"],
        "style-src": ["'self'", "'unsafe-inline'", "https:"],
        "img-src": ["'self'", "data:", "https:"]
      }
    }
  }));

  // CORS
  app.use(cors({
    origin: config.cors.origins,
    credentials: true
  }));

  // Body parsing
  app.use(express.json({ limit: '10mb' }));
  app.use(express.urlencoded({ extended: true, limit: '10mb' }));

  // Request logging (can be disabled for tests)
  if (enableRequestLogging) {
    app.use(requestLogger);
  }

  // Rate limiting (can be disabled for tests)
  if (enableRateLimiting) {
    app.use(rateLimiter);
  }

  // Health check
  app.get('/health', (_req, res) => {
    res.json({
      status: 'healthy',
      timestamp: new Date().toISOString(),
      version: config.version
    });
  });

  // OpenAPI documentation (can be disabled for tests)
  if (enableSwagger) {
    try {
      // Dynamic imports to avoid loading OpenAPI schema during tests
      const swaggerUi = require('swagger-ui-express');
      const { getOpenAPISpec } = require('./openapi');
      const openApiSpec = getOpenAPISpec();

      app.get('/api/docs/openapi.json', (_req, res) => {
        res.json(openApiSpec);
      });

      app.use('/api/docs', swaggerUi.serve, swaggerUi.setup(openApiSpec, {
        customCss: '.swagger-ui .topbar { display: none }',
        customSiteTitle: 'Ariadne Platform API Documentation',
        customfavIcon: 'https://swagger.io/favicon.ico',
        swaggerOptions: {
          persistAuthorization: true,
          displayRequestDuration: true,
          filter: true,
          tryItOutEnabled: true
        }
      }));
    } catch (error) {
      console.error('❌ Failed to generate OpenAPI spec:', error);

      app.get('/api/docs/openapi.json', (_req, res) => {
        res.status(500).json({
          success: false,
          error: {
            code: 'OPENAPI_GENERATION_FAILED',
            message: 'Failed to generate OpenAPI specification'
          }
        });
      });

      app.use('/api/docs', (_req, res) => {
        res.status(500).json({
          success: false,
          error: {
            code: 'OPENAPI_GENERATION_FAILED',
            message: 'API documentation is unavailable due to OpenAPI spec generation failure'
          }
        });
      });
    }
  }

  // API routes
  app.use('/api/v1', apiRouter);

  // 404 handler
  app.use((_req, res) => {
    res.status(404).json({
      success: false,
      error: {
        code: 'NOT_FOUND',
        message: 'Route not found'
      }
    });
  });

  // Error handler (must be last)
  app.use(errorHandler);

  return app;
}
