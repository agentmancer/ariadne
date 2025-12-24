/**
 * Data Export Worker
 * Exports batch execution results to S3 in various formats
 */

import { Worker, Job } from 'bullmq';
import { createRedisConnection } from '../connection';
import { prisma } from '../../../lib/prisma';
import { config } from '../../../config';
import { uploadToS3 } from '../../s3';
import {
  QUEUE_NAMES,
  DataExportJobData,
  DataExportResult,
  dataExportJobSchema,
} from '../types';

let worker: Worker<DataExportJobData, DataExportResult> | null = null;

/**
 * Process a data export job
 */
async function processDataExport(
  job: Job<DataExportJobData, DataExportResult>
): Promise<DataExportResult> {
  const startTime = Date.now();
  console.log(`[DataExport] Starting job ${job.id}`);

  // Validate job data
  const validatedData = dataExportJobSchema.parse(job.data);
  const {
    batchExecutionId,
    studyId,
    format,
    includeEvents,
    includeSurveyResponses,
    includeStoryData,
    participantIds,
    eventTypes,
  } = validatedData;

  await job.updateProgress(5);

  // Get batch execution info
  const batch = await prisma.batchExecution.findUnique({
    where: { id: batchExecutionId },
    include: { study: true },
  });

  if (!batch) {
    throw new Error(`Batch execution ${batchExecutionId} not found`);
  }

  await job.updateProgress(10);

  // Build participant filter
  const participantWhere = {
    batchId: batchExecutionId,
    ...(participantIds && participantIds.length > 0 ? { id: { in: participantIds } } : {}),
  };

  // Get participants
  const participants = await prisma.participant.findMany({
    where: participantWhere,
    select: {
      id: true,
      uniqueId: true,
      role: true,
      state: true,
      llmConfig: true,
      createdAt: true,
      completedAt: true,
      metadata: true,
    },
  });

  console.log(`[DataExport] Found ${participants.length} participants`);
  await job.updateProgress(20);

  // Get all participant IDs for bulk queries
  const allParticipantIds = participants.map((p) => p.id);

  // Bulk fetch all related data to avoid N+1 queries
  // This fetches all data in 3 queries instead of 3*N queries
  const [allEvents, allSurveyResponses, allStoryData] = await Promise.all([
    includeEvents
      ? prisma.event.findMany({
          where: {
            participantId: { in: allParticipantIds },
            ...(eventTypes && eventTypes.length > 0 ? { type: { in: eventTypes } } : {}),
          },
          orderBy: { timestamp: 'asc' },
          select: {
            id: true,
            participantId: true,
            type: true,
            data: true,
            timestamp: true,
          },
        })
      : Promise.resolve([]),
    includeSurveyResponses
      ? prisma.surveyResponse.findMany({
          where: { participantId: { in: allParticipantIds } },
          include: {
            survey: { select: { id: true, name: true } },
          },
          orderBy: { completedAt: 'asc' },
        })
      : Promise.resolve([]),
    includeStoryData
      ? prisma.storyData.findMany({
          where: {
            participantId: { in: allParticipantIds },
            status: 'CONFIRMED',
          },
          orderBy: { version: 'asc' },
          select: {
            id: true,
            participantId: true,
            pluginType: true,
            version: true,
            s3Key: true,
            name: true,
            description: true,
            createdAt: true,
          },
        })
      : Promise.resolve([]),
  ]);

  await job.updateProgress(50);

  // Group data by participant ID for efficient lookup
  const eventsByParticipant = new Map<string, typeof allEvents>();
  for (const event of allEvents) {
    const existing = eventsByParticipant.get(event.participantId) || [];
    existing.push(event);
    eventsByParticipant.set(event.participantId, existing);
  }

  const surveyResponsesByParticipant = new Map<string, typeof allSurveyResponses>();
  for (const sr of allSurveyResponses) {
    const existing = surveyResponsesByParticipant.get(sr.participantId) || [];
    existing.push(sr);
    surveyResponsesByParticipant.set(sr.participantId, existing);
  }

  const storyDataByParticipant = new Map<string, typeof allStoryData>();
  for (const sd of allStoryData) {
    const existing = storyDataByParticipant.get(sd.participantId) || [];
    existing.push(sd);
    storyDataByParticipant.set(sd.participantId, existing);
  }

  await job.updateProgress(60);

  // Build export records using pre-fetched data
  const exportData: ExportRecord[] = [];

  for (let i = 0; i < participants.length; i++) {
    const participant = participants[i];
    const record: ExportRecord = {
      participantId: participant.id,
      uniqueId: participant.uniqueId,
      role: participant.role,
      state: participant.state,
      llmConfig: participant.llmConfig ? JSON.parse(participant.llmConfig) : null,
      createdAt: participant.createdAt.toISOString(),
      completedAt: participant.completedAt?.toISOString() || null,
      metadata: participant.metadata ? JSON.parse(participant.metadata) : null,
    };

    // Add events from pre-fetched data
    if (includeEvents) {
      const events = eventsByParticipant.get(participant.id) || [];
      record.events = events.map((e) => ({
        id: e.id,
        type: e.type,
        data: e.data ? JSON.parse(e.data) : null,
        timestamp: e.timestamp.toISOString(),
      }));
    }

    // Add survey responses from pre-fetched data
    if (includeSurveyResponses) {
      const surveyResponses = surveyResponsesByParticipant.get(participant.id) || [];
      record.surveyResponses = surveyResponses.map((sr) => ({
        surveyId: sr.surveyId,
        surveyName: sr.survey.name,
        responses: sr.responses ? JSON.parse(sr.responses) : null,
        submittedAt: sr.completedAt?.toISOString() || null,
      }));
    }

    // Add story data from pre-fetched data
    if (includeStoryData) {
      const storyData = storyDataByParticipant.get(participant.id) || [];
      record.storyData = storyData.map((sd) => ({
        id: sd.id,
        pluginType: sd.pluginType,
        version: sd.version,
        s3Key: sd.s3Key,
        name: sd.name,
        description: sd.description,
        createdAt: sd.createdAt.toISOString(),
      }));
    }

    exportData.push(record);

    // Update progress (60-80% for record building)
    const progress = 60 + Math.round(((i + 1) / participants.length) * 20);
    await job.updateProgress(progress);
  }

  console.log(`[DataExport] Collected data for ${exportData.length} participants`);
  await job.updateProgress(85);

  // Format data
  let content: string;
  let contentType: string;
  let fileExtension: string;

  switch (format) {
    case 'JSON':
      content = JSON.stringify(exportData, null, 2);
      contentType = 'application/json';
      fileExtension = 'json';
      break;
    case 'JSONL':
      content = exportData.map((r) => JSON.stringify(r)).join('\n');
      contentType = 'application/x-ndjson';
      fileExtension = 'jsonl';
      break;
    case 'CSV':
      content = convertToCSV(exportData);
      contentType = 'text/csv';
      fileExtension = 'csv';
      break;
    default:
      throw new Error(`Unsupported format: ${format}`);
  }

  await job.updateProgress(90);

  // Upload to S3
  const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
  const s3Key = `exports/${studyId}/batch-${batchExecutionId}/${timestamp}.${fileExtension}`;

  await uploadToS3(
    s3Key,
    Buffer.from(content, 'utf-8'),
    contentType
  );

  await job.updateProgress(95);

  // Update batch execution with export path
  await prisma.batchExecution.update({
    where: { id: batchExecutionId },
    data: { exportPath: s3Key },
  });

  await job.updateProgress(100);

  const duration = Date.now() - startTime;
  const fileSizeBytes = Buffer.byteLength(content, 'utf-8');

  console.log(
    `[DataExport] Job ${job.id} completed in ${duration}ms - ` +
    `${exportData.length} records, ${fileSizeBytes} bytes`
  );

  return {
    batchExecutionId,
    exportPath: s3Key,
    recordCount: exportData.length,
    fileSizeBytes,
  };
}

// ============================================================================
// Helper Types and Functions
// ============================================================================

interface ExportRecord {
  participantId: string;
  uniqueId: string;
  role: string | null;
  state: string;
  llmConfig: any;
  createdAt: string;
  completedAt: string | null;
  metadata: any;
  events?: Array<{
    id: string;
    type: string;
    data: any;
    timestamp: string;
  }>;
  surveyResponses?: Array<{
    surveyId: string;
    surveyName: string;
    responses: any;
    submittedAt: string | null;
  }>;
  storyData?: Array<{
    id: string;
    pluginType: string;
    version: number;
    s3Key: string;
    name: string | null;
    description: string | null;
    createdAt: string;
  }>;
}

/**
 * Convert export data to CSV format
 * Flattens nested data and creates a row per participant
 */
function convertToCSV(data: ExportRecord[]): string {
  if (data.length === 0) {
    return '';
  }

  // Define columns
  const columns = [
    'participantId',
    'uniqueId',
    'role',
    'state',
    'createdAt',
    'completedAt',
    'eventCount',
    'surveyResponseCount',
    'storyDataCount',
  ];

  // Header row
  const header = columns.join(',');

  // Data rows
  const rows = data.map((record) => {
    const values = [
      record.participantId,
      record.uniqueId,
      record.role || '',
      record.state,
      record.createdAt,
      record.completedAt || '',
      (record.events?.length || 0).toString(),
      (record.surveyResponses?.length || 0).toString(),
      (record.storyData?.length || 0).toString(),
    ];
    return values.map(escapeCSV).join(',');
  });

  return [header, ...rows].join('\n');
}

function escapeCSV(value: string): string {
  if (value.includes(',') || value.includes('"') || value.includes('\n')) {
    return `"${value.replace(/"/g, '""')}"`;
  }
  return value;
}

// ============================================================================
// Worker Management
// ============================================================================

/**
 * Start the data export worker
 */
export function startDataExportWorker(): Worker<DataExportJobData, DataExportResult> {
  if (worker) {
    console.warn('[DataExport] Worker already running');
    return worker;
  }

  worker = new Worker<DataExportJobData, DataExportResult>(
    QUEUE_NAMES.DATA_EXPORT,
    processDataExport,
    {
      connection: createRedisConnection(),
      concurrency: config.queue.dataExport.concurrency,
    }
  );

  worker.on('completed', (job, result) => {
    console.log(
      `[DataExport] Job ${job.id} completed - ` +
      `${result.recordCount} records exported to ${result.exportPath}`
    );
  });

  worker.on('failed', (job, error) => {
    console.error(`[DataExport] Job ${job?.id} failed:`, error.message);
  });

  worker.on('progress', (job, progress) => {
    console.log(`[DataExport] Job ${job.id} progress: ${progress}%`);
  });

  worker.on('error', (error) => {
    console.error('[DataExport] Worker error:', error);
  });

  console.log('[DataExport] Worker started');
  return worker;
}

/**
 * Stop the data export worker
 */
export async function stopDataExportWorker(): Promise<void> {
  if (worker) {
    await worker.close();
    worker = null;
    console.log('[DataExport] Worker stopped');
  }
}

/**
 * Get the worker instance (for testing/monitoring)
 */
export function getDataExportWorker(): Worker<DataExportJobData, DataExportResult> | null {
  return worker;
}
