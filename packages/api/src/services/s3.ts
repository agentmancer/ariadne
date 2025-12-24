/**
 * S3 Service - Handles file uploads, downloads, and presigned URLs
 * Used for story data, biosignal data, and other large file storage
 */

import {
  S3Client,
  PutObjectCommand,
  GetObjectCommand,
  DeleteObjectCommand,
  HeadObjectCommand
} from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import { config } from '../config';
import { AppError } from '../middleware/error-handler';
import { HTTP_STATUS, ERROR_CODES } from '@ariadne/shared';

// Initialize S3 client (supports S3-compatible backends like MinIO, LocalStack)
const s3Client = new S3Client({
  region: config.s3.region,
  credentials: config.s3.accessKeyId && config.s3.secretAccessKey
    ? {
        accessKeyId: config.s3.accessKeyId,
        secretAccessKey: config.s3.secretAccessKey
      }
    : undefined, // Use default credential chain in production (IAM roles)
  // Custom endpoint for S3-compatible services
  ...(config.s3.endpoint && { endpoint: config.s3.endpoint }),
  // Force path-style URLs (required for MinIO and some S3-compatible services)
  forcePathStyle: config.s3.forcePathStyle
});

// File size limits
const MAX_STORY_SIZE = 50 * 1024 * 1024; // 50MB for story data
const MAX_BIOSIGNAL_SIZE = 500 * 1024 * 1024; // 500MB for biosignal data

// Allowed content types
export const ALLOWED_STORY_TYPES = ['application/json', 'text/html', 'application/xml'];

/**
 * Generate a unique S3 key for story data
 */
export function generateStoryKey(participantId: string, pluginType: string, version: number): string {
  const timestamp = Date.now();
  return `stories/${participantId}/${pluginType}/v${version}_${timestamp}.json`;
}

/**
 * Generate a unique S3 key for biosignal data
 */
export function generateBiosignalKey(participantId: string, type: string, deviceId?: string): string {
  const timestamp = Date.now();
  const device = deviceId ? `_${deviceId}` : '';
  return `biosignals/${participantId}/${type}${device}_${timestamp}.json`;
}

/**
 * Upload data to S3
 */
export async function uploadToS3(
  key: string,
  data: Buffer | string,
  contentType: string = 'application/json',
  metadata?: Record<string, string>
): Promise<{ bucket: string; key: string; size: number }> {
  const body = typeof data === 'string' ? Buffer.from(data, 'utf-8') : data;
  const size = body.length;

  // Validate file size based on key type
  if (key.startsWith('stories/') && size > MAX_STORY_SIZE) {
    throw new AppError(
      HTTP_STATUS.BAD_REQUEST,
      ERROR_CODES.INVALID_INPUT,
      `Story data exceeds maximum size of ${MAX_STORY_SIZE / 1024 / 1024}MB`
    );
  }

  if (key.startsWith('biosignals/') && size > MAX_BIOSIGNAL_SIZE) {
    throw new AppError(
      HTTP_STATUS.BAD_REQUEST,
      ERROR_CODES.INVALID_INPUT,
      `Biosignal data exceeds maximum size of ${MAX_BIOSIGNAL_SIZE / 1024 / 1024}MB`
    );
  }

  const command = new PutObjectCommand({
    Bucket: config.s3.bucket,
    Key: key,
    Body: body,
    ContentType: contentType,
    Metadata: metadata
  });

  try {
    await s3Client.send(command);
    return {
      bucket: config.s3.bucket,
      key,
      size
    };
  } catch (error) {
    console.error('S3 upload error:', error);
    throw new AppError(
      HTTP_STATUS.INTERNAL_SERVER_ERROR,
      ERROR_CODES.INTERNAL_ERROR,
      'Failed to upload file to storage'
    );
  }
}

/**
 * Download data from S3
 */
export async function downloadFromS3(
  key: string,
  bucket: string = config.s3.bucket
): Promise<{ data: string; contentType: string; size: number }> {
  const command = new GetObjectCommand({
    Bucket: bucket,
    Key: key
  });

  try {
    const response = await s3Client.send(command);
    const data = await response.Body?.transformToString('utf-8');

    if (!data) {
      throw new AppError(
        HTTP_STATUS.NOT_FOUND,
        ERROR_CODES.NOT_FOUND,
        'File not found in storage'
      );
    }

    return {
      data,
      contentType: response.ContentType || 'application/json',
      size: response.ContentLength || 0
    };
  } catch (error: unknown) {
    if (error instanceof AppError) throw error;

    const s3Error = error as { name?: string };
    if (s3Error.name === 'NoSuchKey') {
      throw new AppError(
        HTTP_STATUS.NOT_FOUND,
        ERROR_CODES.NOT_FOUND,
        'File not found in storage'
      );
    }

    console.error('S3 download error:', error);
    throw new AppError(
      HTTP_STATUS.INTERNAL_SERVER_ERROR,
      ERROR_CODES.INTERNAL_ERROR,
      'Failed to download file from storage'
    );
  }
}

/**
 * Delete data from S3
 */
export async function deleteFromS3(
  key: string,
  bucket: string = config.s3.bucket
): Promise<void> {
  const command = new DeleteObjectCommand({
    Bucket: bucket,
    Key: key
  });

  try {
    await s3Client.send(command);
  } catch (error) {
    console.error('S3 delete error:', error);
    throw new AppError(
      HTTP_STATUS.INTERNAL_SERVER_ERROR,
      ERROR_CODES.INTERNAL_ERROR,
      'Failed to delete file from storage'
    );
  }
}

/**
 * Check if object exists in S3
 * Returns true if exists, false if not found, throws on actual errors
 */
export async function existsInS3(
  key: string,
  bucket: string = config.s3.bucket
): Promise<boolean> {
  const command = new HeadObjectCommand({
    Bucket: bucket,
    Key: key
  });

  try {
    await s3Client.send(command);
    return true;
  } catch (error: unknown) {
    const s3Error = error as { name?: string; $metadata?: { httpStatusCode?: number } };
    // NotFound or 404 means object doesn't exist
    if (s3Error.name === 'NotFound' || s3Error.$metadata?.httpStatusCode === 404) {
      return false;
    }
    // Re-throw actual errors (connectivity, permissions, etc.)
    console.error('S3 existence check error:', error);
    throw new AppError(
      HTTP_STATUS.INTERNAL_SERVER_ERROR,
      ERROR_CODES.INTERNAL_ERROR,
      'Failed to verify file in storage'
    );
  }
}

/**
 * Generate a presigned URL for uploading (PUT)
 */
export async function getPresignedUploadUrl(
  key: string,
  contentType: string = 'application/json',
  expiresIn: number = config.s3.presignedUrlExpiry
): Promise<{ url: string; key: string; bucket: string; expiresAt: Date }> {
  // Validate content type for stories
  if (key.startsWith('stories/') && !ALLOWED_STORY_TYPES.includes(contentType)) {
    throw new AppError(
      HTTP_STATUS.BAD_REQUEST,
      ERROR_CODES.INVALID_INPUT,
      `Invalid content type. Allowed types: ${ALLOWED_STORY_TYPES.join(', ')}`
    );
  }

  const command = new PutObjectCommand({
    Bucket: config.s3.bucket,
    Key: key,
    ContentType: contentType
  });

  try {
    const url = await getSignedUrl(s3Client, command, { expiresIn });
    const expiresAt = new Date(Date.now() + expiresIn * 1000);

    return {
      url,
      key,
      bucket: config.s3.bucket,
      expiresAt
    };
  } catch (error) {
    console.error('S3 presigned upload URL error:', error);
    throw new AppError(
      HTTP_STATUS.INTERNAL_SERVER_ERROR,
      ERROR_CODES.INTERNAL_ERROR,
      'Failed to generate upload URL'
    );
  }
}

/**
 * Generate a presigned URL for downloading (GET)
 */
export async function getPresignedDownloadUrl(
  key: string,
  bucket: string = config.s3.bucket,
  expiresIn: number = config.s3.presignedUrlExpiry
): Promise<{ url: string; expiresAt: Date }> {
  const command = new GetObjectCommand({
    Bucket: bucket,
    Key: key
  });

  try {
    const url = await getSignedUrl(s3Client, command, { expiresIn });
    const expiresAt = new Date(Date.now() + expiresIn * 1000);

    return {
      url,
      expiresAt
    };
  } catch (error) {
    console.error('S3 presigned download URL error:', error);
    throw new AppError(
      HTTP_STATUS.INTERNAL_SERVER_ERROR,
      ERROR_CODES.INTERNAL_ERROR,
      'Failed to generate download URL'
    );
  }
}

export default {
  uploadToS3,
  downloadFromS3,
  deleteFromS3,
  existsInS3,
  getPresignedUploadUrl,
  getPresignedDownloadUrl,
  generateStoryKey,
  generateBiosignalKey
};
