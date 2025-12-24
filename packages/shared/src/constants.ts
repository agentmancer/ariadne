/**
 * Platform-wide constants
 */

export const API_VERSION = 'v1';

export const DEFAULT_PAGE_SIZE = 20;
export const MAX_PAGE_SIZE = 100;

// Event categories
export const EVENT_CATEGORIES = {
  STORY: 'story',
  SURVEY: 'survey',
  NAVIGATION: 'navigation',
  SESSION: 'session',
  BIOSIGNAL: 'biosignal',
  AI: 'ai',
  SYSTEM: 'system'
} as const;

// HTTP status codes
export const HTTP_STATUS = {
  OK: 200,
  CREATED: 201,
  ACCEPTED: 202,
  NO_CONTENT: 204,
  BAD_REQUEST: 400,
  UNAUTHORIZED: 401,
  FORBIDDEN: 403,
  NOT_FOUND: 404,
  CONFLICT: 409,
  UNPROCESSABLE_ENTITY: 422,
  TOO_MANY_REQUESTS: 429,
  INTERNAL_SERVER_ERROR: 500,
  SERVICE_UNAVAILABLE: 503
} as const;

// Error codes
export const ERROR_CODES = {
  // Authentication errors
  INVALID_CREDENTIALS: 'INVALID_CREDENTIALS',
  TOKEN_EXPIRED: 'TOKEN_EXPIRED',
  INVALID_TOKEN: 'INVALID_TOKEN',
  UNAUTHORIZED: 'UNAUTHORIZED',
  FORBIDDEN: 'FORBIDDEN',

  // Validation errors
  VALIDATION_ERROR: 'VALIDATION_ERROR',
  INVALID_INPUT: 'INVALID_INPUT',
  MISSING_REQUIRED_FIELD: 'MISSING_REQUIRED_FIELD',

  // Resource errors
  NOT_FOUND: 'NOT_FOUND',
  ALREADY_EXISTS: 'ALREADY_EXISTS',
  CONFLICT: 'CONFLICT',

  // Prolific errors
  PROLIFIC_API_ERROR: 'PROLIFIC_API_ERROR',
  PROLIFIC_INVALID_CONFIG: 'PROLIFIC_INVALID_CONFIG',

  // Plugin errors
  PLUGIN_NOT_FOUND: 'PLUGIN_NOT_FOUND',
  PLUGIN_LOAD_ERROR: 'PLUGIN_LOAD_ERROR',
  PLUGIN_EXECUTION_ERROR: 'PLUGIN_EXECUTION_ERROR',

  // Storage errors
  S3_UPLOAD_ERROR: 'S3_UPLOAD_ERROR',
  S3_DOWNLOAD_ERROR: 'S3_DOWNLOAD_ERROR',
  STORAGE_ERROR: 'STORAGE_ERROR',

  // Rate limiting
  RATE_LIMIT_EXCEEDED: 'RATE_LIMIT_EXCEEDED',

  // Generic errors
  INTERNAL_ERROR: 'INTERNAL_ERROR',
  UNKNOWN_ERROR: 'UNKNOWN_ERROR'
} as const;

// WebSocket message types
export const WS_MESSAGE_TYPES = {
  // Connection
  CONNECT: 'connect',
  DISCONNECT: 'disconnect',
  ERROR: 'error',

  // Events
  EVENT: 'event',
  EVENT_BATCH: 'event_batch',

  // Real-time updates
  PARTICIPANT_UPDATE: 'participant_update',
  SESSION_UPDATE: 'session_update',
  STORY_UPDATE: 'story_update',

  // Sync
  SYNC_REQUEST: 'sync_request',
  SYNC_RESPONSE: 'sync_response'
} as const;

// File size limits (bytes)
export const FILE_SIZE_LIMITS = {
  STORY_JSON: 10 * 1024 * 1024, // 10 MB
  BIOSIGNAL: 100 * 1024 * 1024, // 100 MB
  VIDEO: 500 * 1024 * 1024 // 500 MB
} as const;

// Participant ID format
export const PARTICIPANT_ID_PREFIX = 'P';
export const PARTICIPANT_ID_LENGTH = 8;

// Completion code format
export const COMPLETION_CODE_LENGTH = 12;

// Session check-in window (minutes)
export const CHECK_IN_WINDOW = {
  BEFORE: 60, // Can check in up to 60 min before
  AFTER: -20 // Must check in at least 20 min before start
} as const;

// Plugin types
export const PLUGIN_TYPES = {
  TWINE: 'twine',
  AI_GENERATOR: 'ai-generator',
  INK: 'ink',
  CUSTOM: 'custom'
} as const;
