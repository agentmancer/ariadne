/**
 * Input sanitization and validation utilities
 * Prevents path traversal, injection attacks, and other security issues
 */

import { z } from 'zod';
import path from 'path';

/**
 * S3 Key validation schema
 * Prevents path traversal and invalid characters
 */
export const s3KeySchema = z.string()
  .min(1, 'S3 key cannot be empty')
  .max(1024, 'S3 key too long')
  .refine(
    (key) => !key.includes('..'),
    'S3 key cannot contain path traversal sequences'
  )
  .refine(
    (key) => !key.startsWith('/'),
    'S3 key cannot start with /'
  )
  .refine(
    (key) => /^[a-zA-Z0-9!_.*'()/-]+$/.test(key),
    'S3 key contains invalid characters'
  );

/**
 * File path validation schema
 * Ensures paths are within allowed directories
 */
export const filePathSchema = z.string()
  .min(1, 'File path cannot be empty')
  .refine(
    (filepath) => !filepath.includes('..'),
    'File path cannot contain path traversal sequences'
  )
  .refine(
    (filepath) => {
      // Normalize and check if path is absolute
      const normalized = path.normalize(filepath);
      return path.isAbsolute(normalized) || normalized.startsWith('./');
    },
    'File path must be absolute or relative to current directory'
  );

/**
 * Participant ID validation schema
 * Prevents injection attacks
 */
export const participantIdSchema = z.string()
  .min(1, 'Participant ID cannot be empty')
  .max(100, 'Participant ID too long')
  .regex(
    /^[a-zA-Z0-9_-]+$/,
    'Participant ID can only contain alphanumeric characters, underscores, and hyphens'
  );

/**
 * Study ID validation schema (UUID format)
 */
export const studyIdSchema = z.string().uuid('Invalid study ID format');

/**
 * Email validation schema
 */
export const emailSchema = z.string().email('Invalid email format');

/**
 * URL validation schema for external endpoints
 */
export const urlSchema = z.string().url('Invalid URL format')
  .refine(
    (url) => {
      const parsed = new URL(url);
      return ['http:', 'https:'].includes(parsed.protocol);
    },
    'URL must use HTTP or HTTPS protocol'
  );

/**
 * JSON validation schema
 * Validates and parses JSON strings safely
 */
export const jsonSchema = z.string().transform((str, ctx) => {
  try {
    return JSON.parse(str);
  } catch (e) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      message: 'Invalid JSON format',
    });
    return z.NEVER;
  }
});

/**
 * Sanitize filename for safe storage
 */
export function sanitizeFilename(filename: string): string {
  // Remove path components
  const basename = path.basename(filename);

  // Replace dangerous characters
  return basename
    .replace(/[^a-zA-Z0-9._-]/g, '_')
    .replace(/^\.+/, '_') // No hidden files
    .substring(0, 255); // Limit length
}

/**
 * Sanitize S3 key for safe storage
 * Sanitizes first (replaces spaces, special chars), then validates the result
 */
export function sanitizeS3Key(key: string): string {
  // Sanitize first - replace spaces and invalid characters
  const sanitized = key
    .split('/')
    .map(segment => segment.replace(/\s+/g, '_')) // Replace spaces with underscores
    .map(segment => sanitizeFilename(segment))
    .join('/');

  // Validate the sanitized result
  return s3KeySchema.parse(sanitized);
}

/**
 * Generate safe S3 key for study data
 */
export function generateS3Key(
  studyId: string,
  participantId: string,
  dataType: string,
  filename: string
): string {
  const sanitizedFilename = sanitizeFilename(filename);
  const timestamp = new Date().toISOString().replace(/[:.]/g, '-');

  return `studies/${studyId}/participants/${participantId}/${dataType}/${timestamp}-${sanitizedFilename}`;
}

/**
 * Validate and sanitize pagination parameters
 */
export const paginationSchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),
  sortBy: z.string().optional(),
  sortOrder: z.enum(['asc', 'desc']).default('desc'),
});

/**
 * Validate and sanitize search parameters
 */
export const searchSchema = z.object({
  query: z.string().min(1).max(100).optional(),
  filters: z.record(z.string(), z.any()).optional(),
});

/**
 * Create a validation middleware for Express routes
 */
export function createValidator<T>(schema: z.ZodSchema<T>) {
  return (req: any, res: any, next: any) => {
    try {
      const validated = schema.parse(req.body);
      req.validatedBody = validated;
      next();
    } catch (error) {
      if (error instanceof z.ZodError) {
        res.status(400).json({
          success: false,
          error: {
            code: 'VALIDATION_ERROR',
            message: 'Invalid request data',
            details: error.errors,
          },
        });
      } else {
        next(error);
      }
    }
  };
}

/**
 * Validate request query parameters
 */
export function validateQuery<T>(schema: z.ZodSchema<T>) {
  return (req: any, res: any, next: any) => {
    try {
      const validated = schema.parse(req.query);
      req.validatedQuery = validated;
      next();
    } catch (error) {
      if (error instanceof z.ZodError) {
        res.status(400).json({
          success: false,
          error: {
            code: 'VALIDATION_ERROR',
            message: 'Invalid query parameters',
            details: error.errors,
          },
        });
      } else {
        next(error);
      }
    }
  };
}

/**
 * Validate request parameters
 */
export function validateParams<T>(schema: z.ZodSchema<T>) {
  return (req: any, res: any, next: any) => {
    try {
      const validated = schema.parse(req.params);
      req.validatedParams = validated;
      next();
    } catch (error) {
      if (error instanceof z.ZodError) {
        res.status(400).json({
          success: false,
          error: {
            code: 'VALIDATION_ERROR',
            message: 'Invalid request parameters',
            details: error.errors,
          },
        });
      } else {
        next(error);
      }
    }
  };
}