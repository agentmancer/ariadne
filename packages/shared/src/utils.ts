/**
 * Shared utility functions
 */

import { randomBytes } from 'crypto';
import { PARTICIPANT_ID_PREFIX, PARTICIPANT_ID_LENGTH } from './constants';

/**
 * Generate a unique participant ID (e.g., P12345678)
 */
export function generateParticipantId(): string {
  const randomNum = Math.random().toString(36).substring(2, 2 + PARTICIPANT_ID_LENGTH);
  return `${PARTICIPANT_ID_PREFIX}${randomNum.toUpperCase().padStart(PARTICIPANT_ID_LENGTH, '0')}`;
}

/**
 * Generate a completion code for Prolific using crypto-secure randomness
 */
export function generateCompletionCode(): string {
  return randomBytes(6).toString('hex').toUpperCase();
}

/**
 * Generate a unique ID (simple implementation)
 */
export function generateId(prefix = ''): string {
  const timestamp = Date.now().toString(36);
  const random = Math.random().toString(36).substring(2, 9);
  return prefix ? `${prefix}_${timestamp}${random}` : `${timestamp}${random}`;
}

/**
 * Format date to ISO string
 */
export function formatDate(date: Date | string): string {
  return new Date(date).toISOString();
}

/**
 * Parse date from string
 */
export function parseDate(dateString: string): Date {
  return new Date(dateString);
}

/**
 * Check if value is a valid email
 */
export function isValidEmail(email: string): boolean {
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  return emailRegex.test(email);
}

/**
 * Sanitize filename for S3 storage
 */
export function sanitizeFilename(filename: string): string {
  return filename
    .replace(/[^a-zA-Z0-9.-]/g, '_')
    .replace(/_{2,}/g, '_')
    .toLowerCase();
}

/**
 * Generate S3 key for story data
 */
export function generateStoryS3Key(
  studyId: string,
  participantId: string,
  version: number,
  extension = 'json'
): string {
  const timestamp = Date.now();
  return `studies/${studyId}/participants/${participantId}/stories/v${version}_${timestamp}.${extension}`;
}

/**
 * Generate S3 key for biosignal data
 */
export function generateBiosignalS3Key(
  studyId: string,
  participantId: string,
  biosignalType: string,
  timestamp: number,
  extension = 'csv'
): string {
  return `studies/${studyId}/participants/${participantId}/biosignals/${biosignalType}/${timestamp}.${extension}`;
}

/**
 * Sleep for specified milliseconds (useful for testing)
 */
export function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

/**
 * Chunk array into smaller arrays
 */
export function chunkArray<T>(array: T[], size: number): T[][] {
  const chunks: T[][] = [];
  for (let i = 0; i < array.length; i += size) {
    chunks.push(array.slice(i, i + size));
  }
  return chunks;
}

/**
 * Deep clone an object
 */
export function deepClone<T>(obj: T): T {
  return JSON.parse(JSON.stringify(obj));
}

/**
 * Check if object is empty
 */
export function isEmpty(obj: Record<string, unknown>): boolean {
  return Object.keys(obj).length === 0;
}

/**
 * Safely parse JSON with fallback
 */
export function safeJsonParse<T>(json: string, fallback: T): T {
  try {
    return JSON.parse(json) as T;
  } catch {
    return fallback;
  }
}

/**
 * Calculate percentage
 */
export function calculatePercentage(value: number, total: number): number {
  if (total === 0) return 0;
  return Math.round((value / total) * 100);
}

/**
 * Format duration in milliseconds to human readable string
 */
export function formatDuration(ms: number): string {
  const seconds = Math.floor(ms / 1000);
  const minutes = Math.floor(seconds / 60);
  const hours = Math.floor(minutes / 60);

  if (hours > 0) {
    return `${hours}h ${minutes % 60}m`;
  } else if (minutes > 0) {
    return `${minutes}m ${seconds % 60}s`;
  } else {
    return `${seconds}s`;
  }
}

/**
 * Debounce function
 */
export function debounce<T extends (...args: unknown[]) => unknown>(
  func: T,
  wait: number
): (...args: Parameters<T>) => void {
  let timeout: NodeJS.Timeout | null = null;
  return (...args: Parameters<T>) => {
    if (timeout) clearTimeout(timeout);
    timeout = setTimeout(() => func(...args), wait);
  };
}

/**
 * Throttle function
 */
export function throttle<T extends (...args: unknown[]) => unknown>(
  func: T,
  limit: number
): (...args: Parameters<T>) => void {
  let inThrottle: boolean;
  return (...args: Parameters<T>) => {
    if (!inThrottle) {
      func(...args);
      inThrottle = true;
      setTimeout(() => (inThrottle = false), limit);
    }
  };
}
