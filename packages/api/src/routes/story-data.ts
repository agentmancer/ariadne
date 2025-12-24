/**
 * Story Data routes - Full CRUD implementation with S3 storage
 * Stores story snapshots and versions for participants
 */

import { Router } from 'express';
import { authenticateResearcher, AuthRequest } from '../middleware/auth';
import { prisma } from '../lib/prisma';
import { saveStoryDataSchema } from '@ariadne/shared';
import { AppError } from '../middleware/error-handler';
import { HTTP_STATUS, ERROR_CODES } from '@ariadne/shared';
import { Prisma } from '@prisma/client';
import { z } from 'zod';
import { verifyParticipantOwnership, verifyStoryDataOwnership, safeJsonParse } from '../utils/ownership';
import {
  uploadToS3,
  downloadFromS3,
  deleteFromS3,
  existsInS3,
  generateStoryKey,
  getPresignedUploadUrl,
  getPresignedDownloadUrl
} from '../services/s3';

export const storyDataRouter = Router();

storyDataRouter.use(authenticateResearcher);

// Regex for safe plugin type (alphanumeric, hyphens, underscores only - no path traversal)
const SAFE_PLUGIN_TYPE_REGEX = /^[a-zA-Z0-9_-]+$/;

// UUID validation regex
const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * Validate that a string is a valid UUID
 */
function validateUUID(id: string, fieldName: string = 'ID'): void {
  if (!UUID_REGEX.test(id)) {
    throw new AppError(
      HTTP_STATUS.BAD_REQUEST,
      ERROR_CODES.INVALID_INPUT,
      `Invalid ${fieldName} format`
    );
  }
}

/**
 * Validate plugin type to prevent path traversal attacks
 */
function validatePluginType(pluginType: string): void {
  if (!SAFE_PLUGIN_TYPE_REGEX.test(pluginType)) {
    throw new AppError(
      HTTP_STATUS.BAD_REQUEST,
      ERROR_CODES.INVALID_INPUT,
      'Plugin type must contain only alphanumeric characters, hyphens, and underscores'
    );
  }
}

// Schema for requesting presigned upload URL
const presignedUploadSchema = z.object({
  participantId: z.string().uuid('Invalid participant ID format'),
  pluginType: z.string().min(1, 'Plugin type is required').max(64, 'Plugin type too long'),
  contentType: z.string().optional().default('application/json'),
  name: z.string().optional(),
  description: z.string().optional()
});

/**
 * GET /api/v1/stories
 * List story data with filters and pagination
 */
storyDataRouter.get('/', async (req: AuthRequest, res, next) => {
  try {
    const { participantId, studyId, pluginType } = req.query;

    // Parse pagination parameters (standardized with events.ts)
    const page = Math.max(1, Number(req.query.page) || 1);
    const pageSize = Math.min(Math.max(1, Number(req.query.pageSize) || 20), 100);

    const where: Prisma.StoryDataWhereInput = {
      status: 'CONFIRMED' // Only show confirmed records by default
    };

    // Filter by participant (requires ownership verification)
    if (participantId) {
      validateUUID(participantId as string, 'participant ID');
      await verifyParticipantOwnership(participantId as string, req.researcher!.id);
      where.participantId = participantId as string;
    } else if (studyId) {
      validateUUID(studyId as string, 'study ID');
      // Filter by study - verify study ownership
      const study = await prisma.study.findUnique({
        where: { id: studyId as string },
        include: {
          project: {
            select: { researcherId: true }
          }
        }
      });

      if (!study) {
        throw new AppError(
          HTTP_STATUS.NOT_FOUND,
          ERROR_CODES.NOT_FOUND,
          'Study not found'
        );
      }

      if (study.project.researcherId !== req.researcher!.id) {
        throw new AppError(
          HTTP_STATUS.FORBIDDEN,
          ERROR_CODES.UNAUTHORIZED,
          'You do not have permission to access this study'
        );
      }

      where.participant = {
        studyId: studyId as string
      };
    } else {
      // Show only stories from researcher's studies
      where.participant = {
        study: {
          project: {
            researcherId: req.researcher!.id
          }
        }
      };
    }

    // Filter by plugin type
    if (pluginType) {
      where.pluginType = pluginType as string;
    }

    const skip = (page - 1) * pageSize;
    const take = pageSize;

    const [stories, total] = await Promise.all([
      prisma.storyData.findMany({
        where,
        include: {
          participant: {
            select: {
              id: true,
              uniqueId: true,
              studyId: true
            }
          }
        },
        skip,
        take,
        orderBy: { createdAt: 'desc' }
      }),
      prisma.storyData.count({ where })
    ]);

    res.json({
      success: true,
      data: {
        stories,
        pagination: {
          page,
          pageSize,
          total,
          hasNext: skip + take < total
        }
      }
    });
  } catch (error) {
    next(error);
  }
});

/**
 * POST /api/v1/stories
 * Save story data to S3 and create database record
 * Uses transaction for version reservation, S3 upload outside transaction to avoid orphans
 */
storyDataRouter.post('/', async (req: AuthRequest, res, next) => {
  let s3Key: string | null = null;
  let s3Bucket: string | null = null;

  try {
    const data = saveStoryDataSchema.parse(req.body);

    // Validate pluginType to prevent path traversal
    validatePluginType(data.pluginType);

    // Verify participant ownership
    await verifyParticipantOwnership(data.participantId, req.researcher!.id);

    // Step 1: Get next version in transaction
    const version = await prisma.$transaction(async (tx) => {
      const latestStory = await tx.storyData.findFirst({
        where: {
          participantId: data.participantId,
          pluginType: data.pluginType
        },
        orderBy: { version: 'desc' },
        select: { version: true }
      });
      return (latestStory?.version ?? 0) + 1;
    });

    // Step 2: Upload to S3 (outside transaction to avoid orphaning on DB failure)
    s3Key = generateStoryKey(data.participantId, data.pluginType, version);
    const storyJson = JSON.stringify(data.storyData);

    const uploadResult = await uploadToS3(s3Key, storyJson, 'application/json', {
      participantId: data.participantId,
      pluginType: data.pluginType,
      version: version.toString()
    });
    s3Bucket = uploadResult.bucket;

    // Step 3: Create database record (unique constraint prevents duplicates)
    try {
      const storyData = await prisma.storyData.create({
        data: {
          participantId: data.participantId,
          pluginType: data.pluginType,
          version,
          s3Key: uploadResult.key,
          s3Bucket: uploadResult.bucket,
          name: data.name,
          description: data.description
        },
        include: {
          participant: {
            select: {
              id: true,
              uniqueId: true,
              studyId: true
            }
          }
        }
      });

      res.status(HTTP_STATUS.CREATED).json({
        success: true,
        data: {
          ...storyData,
          size: uploadResult.size
        }
      });
    } catch (dbError) {
      // DB failed after S3 upload - clean up S3 object
      try {
        await deleteFromS3(s3Key, s3Bucket);
      } catch (cleanupError) {
        console.error('Failed to clean up S3 object after DB error:', s3Key, cleanupError);
      }

      // Handle unique constraint violation (race condition)
      const prismaError = dbError as { code?: string };
      if (prismaError.code === 'P2002') {
        throw new AppError(
          HTTP_STATUS.CONFLICT,
          ERROR_CODES.INVALID_INPUT,
          'Version conflict: please retry the request'
        );
      }
      throw dbError;
    }
  } catch (error) {
    next(error);
  }
});

/**
 * POST /api/v1/stories/presigned-upload
 * Get a presigned URL for direct S3 upload
 * Creates a PENDING record to reserve version number and prevent race conditions
 */
storyDataRouter.post('/presigned-upload', async (req: AuthRequest, res, next) => {
  try {
    const data = presignedUploadSchema.parse(req.body);

    // Validate pluginType to prevent path traversal
    validatePluginType(data.pluginType);

    // Verify participant ownership
    await verifyParticipantOwnership(data.participantId, req.researcher!.id);

    // Create PENDING record in transaction to reserve version number
    const result = await prisma.$transaction(async (tx) => {
      // Get next version using findFirst with ordering
      const latestStory = await tx.storyData.findFirst({
        where: {
          participantId: data.participantId,
          pluginType: data.pluginType
        },
        orderBy: { version: 'desc' },
        select: { version: true }
      });
      const version = (latestStory?.version ?? 0) + 1;

      // Generate S3 key and presigned URL
      const s3Key = generateStoryKey(data.participantId, data.pluginType, version);
      const presigned = await getPresignedUploadUrl(s3Key, data.contentType);

      // Create PENDING record to reserve this version
      const pendingRecord = await tx.storyData.create({
        data: {
          participantId: data.participantId,
          pluginType: data.pluginType,
          version,
          s3Key: presigned.key,
          s3Bucket: presigned.bucket,
          name: data.name,
          description: data.description,
          status: 'PENDING',
          expiresAt: presigned.expiresAt
        }
      });

      return { presigned, version, recordId: pendingRecord.id };
    });

    res.json({
      success: true,
      data: {
        id: result.recordId, // Return record ID for confirmation
        uploadUrl: result.presigned.url,
        s3Key: result.presigned.key,
        s3Bucket: result.presigned.bucket,
        expiresAt: result.presigned.expiresAt,
        version: result.version,
        // Include metadata for client reference
        metadata: {
          participantId: data.participantId,
          pluginType: data.pluginType,
          name: data.name,
          description: data.description
        }
      }
    });
  } catch (error) {
    next(error);
  }
});

/**
 * POST /api/v1/stories/confirm-upload
 * Confirm a presigned upload completed and activate the PENDING record
 * Validates s3Key matches the reserved key and verifies S3 object exists
 */
const confirmUploadSchema = z.object({
  id: z.string().min(1, 'Record ID is required'), // PENDING record ID from presigned-upload
  s3Key: z.string().min(1, 'S3 key is required'),
  s3Bucket: z.string().min(1, 'S3 bucket is required')
});

storyDataRouter.post('/confirm-upload', async (req: AuthRequest, res, next) => {
  try {
    const data = confirmUploadSchema.parse(req.body);

    // Validate record ID format
    validateUUID(data.id, 'record ID');

    // Find the PENDING record
    const pendingRecord = await prisma.storyData.findUnique({
      where: { id: data.id },
      include: {
        participant: {
          include: {
            study: {
              include: {
                project: {
                  select: { researcherId: true }
                }
              }
            }
          }
        }
      }
    });

    if (!pendingRecord) {
      throw new AppError(
        HTTP_STATUS.NOT_FOUND,
        ERROR_CODES.NOT_FOUND,
        'Upload record not found. It may have expired.'
      );
    }

    // Verify ownership
    if (pendingRecord.participant.study.project.researcherId !== req.researcher!.id) {
      throw new AppError(
        HTTP_STATUS.FORBIDDEN,
        ERROR_CODES.UNAUTHORIZED,
        'You do not have permission to confirm this upload'
      );
    }

    // Verify the record is still PENDING
    if (pendingRecord.status !== 'PENDING') {
      throw new AppError(
        HTTP_STATUS.BAD_REQUEST,
        ERROR_CODES.INVALID_INPUT,
        pendingRecord.status === 'CONFIRMED'
          ? 'This upload has already been confirmed'
          : 'Invalid record status'
      );
    }

    // Check if the presigned URL has expired
    if (pendingRecord.expiresAt && pendingRecord.expiresAt < new Date()) {
      // Clean up expired record
      await prisma.storyData.delete({ where: { id: data.id } });
      throw new AppError(
        HTTP_STATUS.BAD_REQUEST,
        ERROR_CODES.INVALID_INPUT,
        'Upload URL has expired. Please request a new presigned URL.'
      );
    }

    // Validate s3Key matches what was reserved (prevents injection attacks)
    if (data.s3Key !== pendingRecord.s3Key) {
      throw new AppError(
        HTTP_STATUS.BAD_REQUEST,
        ERROR_CODES.INVALID_INPUT,
        'S3 key does not match the reserved key'
      );
    }

    // Validate s3Bucket matches
    if (data.s3Bucket !== pendingRecord.s3Bucket) {
      throw new AppError(
        HTTP_STATUS.BAD_REQUEST,
        ERROR_CODES.INVALID_INPUT,
        'S3 bucket does not match the reserved bucket'
      );
    }

    // Verify S3 object actually exists
    const objectExists = await existsInS3(data.s3Key, data.s3Bucket);
    if (!objectExists) {
      throw new AppError(
        HTTP_STATUS.BAD_REQUEST,
        ERROR_CODES.INVALID_INPUT,
        'Upload not found in storage. Please ensure the file was uploaded successfully.'
      );
    }

    // Update record status to CONFIRMED
    const storyData = await prisma.storyData.update({
      where: { id: data.id },
      data: {
        status: 'CONFIRMED',
        expiresAt: null // Clear expiry after confirmation
      },
      include: {
        participant: {
          select: {
            id: true,
            uniqueId: true,
            studyId: true
          }
        }
      }
    });

    res.status(HTTP_STATUS.OK).json({
      success: true,
      data: storyData
    });
  } catch (error) {
    next(error);
  }
});

/**
 * GET /api/v1/stories/participant/:participantId/latest
 * Get the latest story version for a participant
 * NOTE: This route must be defined BEFORE /:id to prevent Express from matching "participant" as an ID
 */
storyDataRouter.get('/participant/:participantId/latest', async (req: AuthRequest, res, next) => {
  try {
    const { pluginType } = req.query;

    // Validate and verify participant ownership
    validateUUID(req.params.participantId, 'participant ID');
    await verifyParticipantOwnership(req.params.participantId, req.researcher!.id);

    const where: Prisma.StoryDataWhereInput = {
      participantId: req.params.participantId,
      status: 'CONFIRMED' // Only show confirmed records
    };

    if (pluginType) {
      where.pluginType = pluginType as string;
    }

    // When pluginType is specified, get latest version of that plugin
    // When no pluginType, get most recently created story across all plugins
    const orderBy = pluginType
      ? [{ version: 'desc' as const }]
      : [{ createdAt: 'desc' as const }];

    const storyData = await prisma.storyData.findFirst({
      where,
      orderBy,
      include: {
        participant: {
          select: {
            id: true,
            uniqueId: true,
            studyId: true
          }
        }
      }
    });

    if (!storyData) {
      throw new AppError(
        HTTP_STATUS.NOT_FOUND,
        ERROR_CODES.NOT_FOUND,
        'No story data found for this participant'
      );
    }

    res.json({
      success: true,
      data: storyData
    });
  } catch (error) {
    next(error);
  }
});

/**
 * GET /api/v1/stories/:id
 * Get story data metadata (without S3 content)
 */
storyDataRouter.get('/:id', async (req: AuthRequest, res, next) => {
  try {
    validateUUID(req.params.id, 'story ID');
    const storyData = await verifyStoryDataOwnership(req.params.id, req.researcher!.id);

    res.json({
      success: true,
      data: storyData
    });
  } catch (error) {
    next(error);
  }
});

/**
 * GET /api/v1/stories/:id/content
 * Get story content from S3
 */
storyDataRouter.get('/:id/content', async (req: AuthRequest, res, next) => {
  try {
    validateUUID(req.params.id, 'story ID');
    const storyData = await verifyStoryDataOwnership(req.params.id, req.researcher!.id);

    // Download from S3
    const s3Data = await downloadFromS3(storyData.s3Key, storyData.s3Bucket);

    res.json({
      success: true,
      data: {
        id: storyData.id,
        participantId: storyData.participantId,
        pluginType: storyData.pluginType,
        version: storyData.version,
        content: safeJsonParse(s3Data.data),
        size: s3Data.size,
        contentType: s3Data.contentType
      }
    });
  } catch (error) {
    next(error);
  }
});

/**
 * GET /api/v1/stories/:id/download-url
 * Get a presigned download URL for story content
 */
storyDataRouter.get('/:id/download-url', async (req: AuthRequest, res, next) => {
  try {
    validateUUID(req.params.id, 'story ID');
    const storyData = await verifyStoryDataOwnership(req.params.id, req.researcher!.id);

    // Generate presigned download URL
    const presigned = await getPresignedDownloadUrl(storyData.s3Key, storyData.s3Bucket);

    res.json({
      success: true,
      data: {
        downloadUrl: presigned.url,
        expiresAt: presigned.expiresAt,
        s3Key: storyData.s3Key,
        filename: `${storyData.pluginType}_v${storyData.version}.json`
      }
    });
  } catch (error) {
    next(error);
  }
});

/**
 * DELETE /api/v1/stories/:id
 * Delete story data from database and S3
 * Deletes DB record first (reversible), then S3 (best-effort cleanup)
 */
storyDataRouter.delete('/:id', async (req: AuthRequest, res, next) => {
  try {
    validateUUID(req.params.id, 'story ID');
    const storyData = await verifyStoryDataOwnership(req.params.id, req.researcher!.id);

    // Store S3 info before deleting DB record
    const { s3Key, s3Bucket } = storyData;

    // Delete database record first (this is the authoritative record)
    await prisma.storyData.delete({
      where: { id: req.params.id }
    });

    // Delete from S3 (best-effort cleanup - orphaned S3 objects are less problematic
    // than orphaned DB records pointing to deleted S3 objects)
    try {
      await deleteFromS3(s3Key, s3Bucket);
    } catch (s3Error) {
      // Log S3 deletion failure but don't fail the request
      // The DB record is already deleted, so the data is effectively gone
      console.error('Failed to delete S3 object (orphaned):', s3Key, s3Error);
    }

    res.status(HTTP_STATUS.NO_CONTENT).send();
  } catch (error) {
    next(error);
  }
});

export default storyDataRouter;
