/**
 * Application configuration
 * Loads environment variables and provides type-safe configuration
 */

import * as dotenv from 'dotenv';
import * as path from 'path';

// Load .env first, then .env.local to allow overrides (for worktrees)
dotenv.config({ path: path.resolve(process.cwd(), '.env') });
dotenv.config({ path: path.resolve(process.cwd(), '.env.local'), override: true });

/**
 * Safely parse an integer from environment variable with fallback.
 * Returns the default value if the input is undefined or NaN.
 */
function safeParseInt(value: string | undefined, defaultValue: number): number {
  if (!value) return defaultValue;
  const parsed = parseInt(value, 10);
  return isNaN(parsed) ? defaultValue : parsed;
}

export const config = {
  // Environment
  env: process.env.NODE_ENV || 'development',
  isDev: process.env.NODE_ENV !== 'production',
  isProd: process.env.NODE_ENV === 'production',

  // Server
  port: parseInt(process.env.PORT || '3002', 10),
  version: '2.0.0',

  // Database
  database: {
    url: process.env.DATABASE_URL || 'postgresql://localhost:5432/ariadne'
  },

  // JWT
  jwt: {
    secret: process.env.JWT_SECRET || 'change-me-in-production',
    expiresIn: process.env.JWT_EXPIRES_IN || '7d',
    refreshExpiresIn: process.env.JWT_REFRESH_EXPIRES_IN || '30d'
  },

  // CORS
  cors: {
    origins: process.env.CORS_ORIGINS?.split(',') || ['http://localhost:3000', 'http://localhost:5173']
  },

  // Rate limiting
  rateLimit: {
    windowMs: 15 * 60 * 1000, // 15 minutes
    max: 100 // limit each IP to 100 requests per windowMs
  },

  // S3 Storage (supports S3-compatible backends like MinIO, LocalStack)
  s3: {
    region: process.env.AWS_REGION || 'us-east-1',
    bucket: process.env.AWS_S3_BUCKET || 'ariadne-data',
    accessKeyId: process.env.AWS_ACCESS_KEY_ID,
    secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
    // Custom endpoint for S3-compatible services (MinIO, LocalStack, etc.)
    endpoint: process.env.S3_ENDPOINT, // e.g., 'http://localhost:9000' for MinIO
    forcePathStyle: process.env.S3_FORCE_PATH_STYLE === 'true', // Required for MinIO
    // Presigned URL expiry in seconds (default: 1 hour)
    presignedUrlExpiry: parseInt(process.env.S3_PRESIGNED_URL_EXPIRY || '3600', 10)
  },

  // Email (Resend, SendGrid, or SMTP)
  email: {
    provider: process.env.EMAIL_PROVIDER || 'resend', // 'resend', 'smtp', or 'sendgrid'
    from: process.env.EMAIL_FROM || 'noreply@ariadne.jtm.io',

    // Resend settings
    resend: {
      apiKey: process.env.RESEND_API_KEY
    },

    // SMTP settings
    smtp: {
      host: process.env.SMTP_HOST || 'smtp.fastmail.com',
      port: parseInt(process.env.SMTP_PORT || '587', 10),
      secure: process.env.SMTP_SECURE === 'true',
      user: process.env.SMTP_USER,
      password: process.env.SMTP_PASSWORD
    },

    // SendGrid
    sendgrid: {
      apiKey: process.env.SENDGRID_API_KEY
    }
  },

  // Enrollment Portal
  enrollment: {
    portalBaseUrl: process.env.ENROLLMENT_PORTAL_BASE_URL || 'http://localhost:5173/enroll'
  },

  // Prolific API
  prolific: {
    apiKey: process.env.PROLIFIC_API_KEY,
    baseUrl: process.env.PROLIFIC_API_URL || 'https://api.prolific.co/api/v1'
  },

  // WebSocket
  ws: {
    enabled: true,
    path: '/ws'
  },

  // Redis (for job queues)
  redis: {
    host: process.env.REDIS_HOST || 'localhost',
    port: safeParseInt(process.env.REDIS_PORT, 6379),
    password: process.env.REDIS_PASSWORD,
    db: safeParseInt(process.env.REDIS_DB, 0),
    // Full URL takes precedence if provided
    url: process.env.REDIS_URL
  },

  // Job Queue Configuration
  queue: {
    // Concurrency settings
    batchCreation: {
      concurrency: safeParseInt(process.env.QUEUE_BATCH_CONCURRENCY, 5)
    },
    syntheticExecution: {
      concurrency: safeParseInt(process.env.QUEUE_EXECUTION_CONCURRENCY, 20),
      // Default timeout for synthetic execution jobs (5 minutes)
      defaultTimeoutMs: safeParseInt(process.env.QUEUE_EXECUTION_TIMEOUT_MS, 300000)
    },
    dataExport: {
      concurrency: safeParseInt(process.env.QUEUE_EXPORT_CONCURRENCY, 2)
    },
    // Retry settings
    defaultRetries: safeParseInt(process.env.QUEUE_DEFAULT_RETRIES, 3),
    retryDelay: safeParseInt(process.env.QUEUE_RETRY_DELAY, 5000) // ms
  }
} as const;

// Validate critical environment variables in production
if (config.isProd) {
  const required = [
    'DATABASE_URL',
    'JWT_SECRET',
    'AWS_S3_BUCKET',
    'AWS_ACCESS_KEY_ID',
    'AWS_SECRET_ACCESS_KEY'
  ];

  const missing = required.filter(key => !process.env[key]);

  if (missing.length > 0) {
    console.error('❌ Missing required environment variables:', missing.join(', '));
    process.exit(1);
  }
}
